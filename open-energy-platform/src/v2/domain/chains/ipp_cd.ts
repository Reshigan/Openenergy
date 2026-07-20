// ipp_cd — EPC contractor default & termination under FIDIC Sub-Clause 15.2, as
// data.
//
// An IPP developer raises a contractor default, issues the 28-day default
// notice, and acknowledges the 42-day cure window. If the contractor doesn't
// cure, the default is confirmed — either by the developer or, if the cure
// window lapses untouched, by the sweep timer. From a confirmed default the
// developer can invoke lender step-in rights, call performance bonds, serve a
// termination notice, and run the handover → replacement-award → appointment
// spine, or settle amicably at any point. A confirmed/appointed/settlement
// crossing on a major-or-larger contract (≥ ZAR 50m) needs the regulator on the
// txn — regulatorPresentIfCritical reads the derived `priority` tier.
//
// v1 permitted only {admin, ipp_developer} to drive every action on this
// chain — the contractor, lender and regulator are named/evidenced parties for
// guard and cascade purposes, never actors, so `by` stays ['ipp_developer']
// (+ 'system' on the cure-lapse timer edge) throughout.
//
// settles:false — a contractor-default proceeding is a construction/legal
// governance record; the bond call and any recovered quantum settle through
// the bond and payment chains it bridges to, not here (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure contract-value tiering. No clock, no env — deterministic. Major/
// material contracts (≥ ZAR 50m) are the "every tier crosses the regulator"
// cases from the legacy cascade hints, simplified onto the guard registry's
// actual critical/standard semantics.
const tierFor = (contractValueZar: Json | undefined): string =>
  typeof contractValueZar === 'number' && contractValueZar >= 50_000_000 ? 'critical' : 'standard';

export const ippContractorDefault: ChainDecl = {
  key: 'ipp_cd',
  noun: 'IPP contractor default',
  refPrefix: 'ICD',
  title: (f) => `Contractor default — ${(f.contractor_name as string) ?? 'contractor'} (${(f.default_category as string) ?? 'unclassified'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'FIDIC Conditions of Contract', provision: 'Sub-Clause 15.2 — termination by employer', effect: 'authorises' },
    { instrument: 'REIPPPP', provision: 'EPC contractor performance & termination governance', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'epc_contractor', 'lender', 'regulator'],

  fields: {
    default_ref: { type: 'string', label: 'Default ref' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    contractor_party: { type: 'party', role: 'epc_contractor', label: 'EPC contractor' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender (step-in rights)' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    project_id: { type: 'string', required: true, label: 'Project' },
    contractor_name: { type: 'string', label: 'Contractor' },
    contractor_reference: { type: 'string', label: 'Contractor reference' },
    contract_value_zar: { type: 'number', required: true, min: 0, label: 'Contract value (ZAR)' },
    default_category: { type: 'string', required: true, label: 'Default category' },
    description: { type: 'string', label: 'Description' },
    // written by derive, never by the client
    priority: { type: 'string', label: 'Default tier (standard/critical)' },
    // per-action evidence/narrative
    notice_notes: { type: 'string', label: 'Notification details' },
    cure_notes: { type: 'string', label: 'Cure acknowledgment' },
    confirm_notes: { type: 'string', label: 'Default confirmation notes' },
    assessment_reason: { type: 'string', label: 'Step-in assessment rationale' },
    step_in_reason: { type: 'string', label: 'Lender step-in authority' },
    bond_call_notes: { type: 'string', label: 'Bond call justification' },
    termination_basis: { type: 'string', label: 'Termination basis' },
    handover_notes: { type: 'string', label: 'Handover scope' },
    award_notes: { type: 'string', label: 'Replacement award rationale' },
    appoint_notes: { type: 'string', label: 'Replacement contractor' },
    settlement_terms: { type: 'string', label: 'Settlement terms' },
    withdrawal_reason: { type: 'string', label: 'Withdrawal reason' },
    // derive-stamped timestamps
    notice_issued_at: { type: 'string', label: 'Notice issued at' },
    cure_acknowledged_at: { type: 'string', label: 'Cure period acknowledged at' },
    default_confirmed_at: { type: 'string', label: 'Default confirmed at' },
    step_in_invoked_at: { type: 'string', label: 'Step-in invoked at' },
    bond_call_initiated_at: { type: 'string', label: 'Bond call initiated at' },
    termination_notice_issued_at: { type: 'string', label: 'Termination notice issued at' },
    handover_commenced_at: { type: 'string', label: 'Handover commenced at' },
    replacement_appointed_at: { type: 'string', label: 'Replacement appointed at' },
    settlement_reached_at: { type: 'string', label: 'Settlement reached at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
  },

  initial: 'default_raised',

  states: {
    default_raised: { label: 'Default raised', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    notice_issued: { label: 'Default notice issued', terminal: false, holder: 'ipp_developer', sla: { days: 28 } },
    cure_period: { label: 'Cure period active', terminal: false, holder: 'ipp_developer', sla: { days: 42 } },
    default_confirmed: { label: 'Default confirmed', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    step_in_assessed: { label: 'Step-in rights assessed', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    step_in_active: { label: 'Lender step-in active', terminal: false, holder: 'ipp_developer' },
    termination_notice_issued: { label: 'Termination notice issued', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    bond_call_initiated: { label: 'Bond call initiated', terminal: false, holder: 'ipp_developer' },
    handover_in_progress: { label: 'Handover in progress', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    replacement_contract_awarded: { label: 'Replacement contract awarded', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    replacement_appointed: { label: 'Replacement contractor appointed', terminal: true, holder: 'none' },
    settlement_agreed: { label: 'Settlement agreed', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'default_raised',
      by: ['ipp_developer'],
      actorBecomes: 'ipp_developer',
      label: 'Raise contractor default',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        contract_value_zar: { type: 'number', required: true, min: 0 },
        default_category: { type: 'string', required: true },
        contractor_name: { type: 'string' },
        contractor_reference: { type: 'string' },
        description: { type: 'string' },
        contractor_party: { type: 'party', role: 'epc_contractor' },
        lender_party: { type: 'party', role: 'lender' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: ['complianceHaltClear'],
      derive: (f, _at: Instant) => ({ priority: tierFor(f.contract_value_zar) }),
    },
    {
      // notice runs against a named counterparty — can't default-notice yourself.
      id: 'issue_default_notice',
      from: 'default_raised',
      to: 'notice_issued',
      by: ['ipp_developer'],
      label: 'Issue default notice',
      intent: 'primary',
      input: { notice_notes: { type: 'string' } },
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ notice_issued_at: isoUtc(at) }),
    },
    {
      id: 'acknowledge_cure_period',
      from: 'notice_issued',
      to: 'cure_period',
      by: ['ipp_developer'],
      label: 'Acknowledge cure period',
      intent: 'primary',
      input: { cure_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ cure_acknowledged_at: isoUtc(at) }),
    },
    {
      // reachable manually or via the 42-day cure-lapse timer (fire requires
      // 'system' in `by`, no required input, no requiresReason — see timers below).
      id: 'confirm_default',
      from: 'cure_period',
      to: 'default_confirmed',
      by: ['ipp_developer', 'system'],
      label: 'Confirm default',
      intent: 'primary',
      input: { confirm_notes: { type: 'string' } },
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ default_confirmed_at: isoUtc(at) }),
    },
    {
      id: 'assess_step_in_rights',
      from: 'default_confirmed',
      to: 'step_in_assessed',
      by: ['ipp_developer'],
      label: 'Assess step-in rights',
      intent: 'secondary',
      input: { assessment_reason: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'invoke_step_in_rights',
      from: 'step_in_assessed',
      to: 'step_in_active',
      by: ['ipp_developer'],
      label: 'Invoke step-in rights',
      intent: 'primary',
      input: { step_in_reason: { type: 'string', required: true } },
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ step_in_invoked_at: isoUtc(at) }),
    },
    {
      id: 'initiate_bond_call',
      from: ['default_confirmed', 'step_in_active', 'termination_notice_issued'],
      to: 'bond_call_initiated',
      by: ['ipp_developer'],
      label: 'Initiate bond call',
      intent: 'secondary',
      input: { bond_call_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ bond_call_initiated_at: isoUtc(at) }),
    },
    {
      id: 'issue_termination_notice',
      from: ['default_confirmed', 'step_in_assessed', 'step_in_active'],
      to: 'termination_notice_issued',
      by: ['ipp_developer'],
      label: 'Issue termination notice',
      intent: 'primary',
      input: { termination_basis: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ termination_notice_issued_at: isoUtc(at) }),
    },
    {
      id: 'commence_handover',
      from: ['termination_notice_issued', 'bond_call_initiated', 'step_in_active'],
      to: 'handover_in_progress',
      by: ['ipp_developer'],
      label: 'Commence handover',
      intent: 'primary',
      input: { handover_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ handover_commenced_at: isoUtc(at) }),
    },
    {
      id: 'award_replacement_contract',
      from: 'handover_in_progress',
      to: 'replacement_contract_awarded',
      by: ['ipp_developer'],
      label: 'Award replacement contract',
      intent: 'primary',
      input: { award_notes: { type: 'string' } },
      guards: [],
    },
    {
      // triggers a NERSA licence amendment on major/material contracts.
      id: 'appoint_replacement',
      from: 'replacement_contract_awarded',
      to: 'replacement_appointed',
      by: ['ipp_developer'],
      label: 'Appoint replacement',
      intent: 'primary',
      input: { appoint_notes: { type: 'string' } },
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ replacement_appointed_at: isoUtc(at) }),
    },
    {
      id: 'reach_settlement',
      from: [
        'default_confirmed',
        'step_in_assessed',
        'step_in_active',
        'termination_notice_issued',
        'bond_call_initiated',
        'handover_in_progress',
        'replacement_contract_awarded',
      ],
      to: 'settlement_agreed',
      by: ['ipp_developer'],
      label: 'Record settlement',
      intent: 'secondary',
      input: { settlement_terms: { type: 'string' } },
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ settlement_reached_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'withdraw_termination',
      from: ['notice_issued', 'cure_period', 'default_confirmed', 'step_in_assessed', 'step_in_active'],
      to: 'withdrawn',
      by: ['ipp_developer'],
      label: 'Withdraw termination',
      intent: 'destructive',
      requiresReason: ['dispute_resolved', 'contractor_reinstated', 'notice_issued_in_error', 'commercial_settlement'],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
  ],

  // cure-lapse time-bar: a cure window left un-cured 42 days out auto-confirms
  // the default (fires by the sweep as 'system').
  timers: [{ onState: 'cure_period', after: { days: 42 }, fire: 'confirm_default', kind: 'time_bar' }],
};
