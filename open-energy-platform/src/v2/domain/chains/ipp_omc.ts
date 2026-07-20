// ipp_omc — IPP O&M contract lifecycle (renewal / tender / novation) as data.
//
// An IPP developer opens a tender/renewal round, selects a preferred O&M
// bidder, then closes one of three ways: execute the contract, execute a
// novation of the incumbent contractor, or declare the renewal round failed
// (operational-continuity risk — an IPP cannot run unmaintained). All three
// exits are terminal, matching the legacy chain-registry descriptor
// (`contract_executed`, `novation_executed`, `renewal_failed`).
//
// Regulator crossing: v1's cascadeHints flag "major/material" and
// "significant+" annual O&M values as crossing the regulator inbox on
// execution/novation. There is no bespoke "value ≥ threshold" guard in the
// registry, so that tiering is folded into the existing `priority` field
// (novation category or annual value ≥ R5m ⇒ 'critical') and enforced with
// regulatorPresentIfCritical — the same shape ipp_schedule uses for its
// reportable-tier crossing.
//
// declare_renewal_failed is left unguarded: v1 says it crosses the regulator
// on "every tier", which regulatorPresentIfCritical can't express (it's
// conditional on priority==='critical', not unconditional) — see registry.ts.
// Judgment call, noted rather than faked.
//
// settles:false — a contract-lifecycle record, never a payment; the O&M spend
// itself is settled by whatever invoicing/drawdown chain the executed
// contract feeds (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const MATERIAL_THRESHOLD_ZAR = 5_000_000;

// pure value-tier classification off category + annual value. No clock, no env.
const valueTier = (f: Record<string, Json>): string => {
  const value = typeof f.annual_om_value_zar === 'number' ? f.annual_om_value_zar : 0;
  const category = f.om_contract_category;
  return category === 'novation' || value >= MATERIAL_THRESHOLD_ZAR ? 'critical' : 'standard';
};

export const ippOmc: ChainDecl = {
  key: 'ipp_omc',
  noun: 'IPP O&M contract',
  refPrefix: 'IOMC',
  title: (f) =>
    `O&M contract — ${(f.contractor_name as string) ?? 'contractor TBD'} (${(f.om_contract_category as string) ?? 'category TBD'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'IPP O&M contract continuity obligations', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'generation licence operational continuity', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'regulator'],

  fields: {
    project_id: { type: 'string', required: true, label: 'Project' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    om_contract_category: { type: 'string', required: true, label: 'O&M contract category' },
    annual_om_value_zar: { type: 'number', required: true, min: 0, label: 'Annual O&M value (ZAR)' },
    contractor_name: { type: 'string', required: true, label: 'Contractor name' },
    contract_expiry_date: { type: 'string', label: 'Contract expiry date' },
    preferred_bidder_name: { type: 'string', label: 'Preferred bidder' },
    renewal_failure_notes: { type: 'string', label: 'Renewal failure notes' },
    // written by derive, never by the client
    priority: { type: 'string', label: 'Value tier' },
    selected_at: { type: 'string', label: 'Preferred bidder selected at' },
    contract_executed_at: { type: 'string', label: 'Contract executed at' },
    novation_executed_at: { type: 'string', label: 'Novation executed at' },
    renewal_failed_at: { type: 'string', label: 'Renewal failed at' },
  },

  initial: 'tendering',

  states: {
    tendering: { label: 'Tendering / renewal in progress', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    preferred_bidder_selected: { label: 'Preferred bidder selected', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    contract_executed: { label: 'Contract executed', terminal: true, holder: 'none' },
    novation_executed: { label: 'Novation executed', terminal: true, holder: 'none' },
    renewal_failed: { label: 'Renewal failed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'tendering',
      by: ['ipp_developer'],
      actorBecomes: 'ipp_developer',
      label: 'Open O&M contract round',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        om_contract_category: { type: 'string', required: true },
        annual_om_value_zar: { type: 'number', required: true, min: 0 },
        contractor_name: { type: 'string', required: true },
        contract_expiry_date: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ priority: valueTier(f) }),
    },
    {
      id: 'select_preferred_bidder',
      from: 'tendering',
      to: 'preferred_bidder_selected',
      by: ['ipp_developer'],
      label: 'Select preferred bidder',
      intent: 'primary',
      input: { preferred_bidder_name: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ selected_at: isoUtc(at) }),
    },
    {
      // material/major annual values (or a novation) cross to the regulator.
      id: 'execute_contract',
      from: 'preferred_bidder_selected',
      to: 'contract_executed',
      by: ['ipp_developer'],
      label: 'Execute contract',
      intent: 'primary',
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ contract_executed_at: isoUtc(at) }),
    },
    {
      // significant+ values cross to the regulator; novation category is
      // always 'critical' tier per valueTier().
      id: 'execute_novation',
      from: 'preferred_bidder_selected',
      to: 'novation_executed',
      by: ['ipp_developer'],
      label: 'Execute novation',
      intent: 'primary',
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ novation_executed_at: isoUtc(at) }),
    },

    // --- exit -------------------------------------------------------------
    {
      id: 'declare_renewal_failed',
      from: ['tendering', 'preferred_bidder_selected'],
      to: 'renewal_failed',
      by: ['ipp_developer'],
      label: 'Declare renewal failed',
      intent: 'destructive',
      requiresReason: [
        'contractor_withdrew',
        'commercial_terms_not_agreed',
        'lender_consent_declined',
        'nersa_objection',
        'no_qualifying_bidders',
      ],
      input: { renewal_failure_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ renewal_failed_at: isoUtc(at) }),
    },
  ],
};
