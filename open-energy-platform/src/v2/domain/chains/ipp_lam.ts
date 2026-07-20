// ipp_lam — IPP land amendment (servitude / wayleave / lease amendment through
// the Deeds Office or a host municipality) as data.
//
// The IPP drafts the amendment, submits it to the authority (starts the
// authority clock), and the authority either grants or refuses it. A refusal
// is not always final: determine_appeal is the ONLY edge out of
// amendment_refused, so a ruling can only ever be recorded against a real
// refusal — the state graph enforces that, no guard needed.
//
// Regulator crossing: the legacy hint says refusal and appeal-determination
// cross the regulator (NERSA) inbox on EVERY tier — unconditional, so it's
// expressed as a required party input on those two edges (grant_amendment's
// crossing is conditional on "major/material parcels", which this chain has
// no threshold field for, so it stays an optional attach instead of a guard).
//
// settles:false — a land-rights amendment record, no ZAR quantum moves here
// (quantumCol: null in the legacy descriptor; R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippLam: ChainDecl = {
  key: 'ipp_lam',
  noun: 'IPP land amendment',
  refPrefix: 'ILA',
  title: (f) =>
    `Land amendment — ${(f.amendment_category as string) ?? 'amendment'} (${(f.counterparty_name as string) ?? 'counterparty TBC'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement land rights (servitude/wayleave)', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'operator', 'regulator'],

  fields: {
    project_id: { type: 'string', required: true, label: 'Project' },
    operator_party: { type: 'party', role: 'operator', label: 'Platform operator' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA)' },
    amendment_category: { type: 'string', required: true, label: 'Amendment category' },
    land_area_hectares: { type: 'number', min: 0, label: 'Land area (hectares)' },
    counterparty_name: { type: 'string', required: true, label: 'Counterparty (Deeds Office / municipality)' },
    deeds_office_reference: { type: 'string', label: 'Deeds Office reference' },
    refusal_notes: { type: 'string', label: 'Refusal notes' },
    appeal_outcome: { type: 'string', label: 'Appeal outcome' },
    // derive-stamped timestamps
    submitted_at: { type: 'string', label: 'Submitted at' },
    granted_at: { type: 'string', label: 'Granted at' },
    refused_at: { type: 'string', label: 'Refused at' },
    appeal_determined_at: { type: 'string', label: 'Appeal determined at' },
  },

  initial: 'amendment_drafted',

  states: {
    amendment_drafted: { label: 'Amendment drafted', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    // "starts the authority clock" — 30 days matches the common SA
    // administrative-response window (PAJA).
    application_submitted: { label: 'Application submitted', terminal: false, holder: 'operator', sla: { days: 30 } },
    amendment_granted: { label: 'Amendment granted', terminal: true, holder: 'none' },
    amendment_refused: { label: 'Amendment refused', terminal: true, holder: 'none' },
    appeal_determined: { label: 'Appeal determined', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'amendment_drafted',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Draft land amendment',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        amendment_category: { type: 'string', required: true },
        land_area_hectares: { type: 'number', min: 0 },
        counterparty_name: { type: 'string', required: true },
        deeds_office_reference: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'submit_application',
      from: 'amendment_drafted',
      to: 'application_submitted',
      by: ['ipp_developer'],
      label: 'Submit application',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      // regulator crossing here is conditional on "major/material parcels" in
      // the legacy hint — no size-threshold guard exists for land area, so the
      // party stays an optional attach rather than a required/guarded input.
      id: 'grant_amendment',
      from: 'application_submitted',
      to: 'amendment_granted',
      by: ['ipp_developer', 'operator'],
      label: 'Grant amendment',
      intent: 'primary',
      input: { regulator_party: { type: 'party', role: 'regulator' } },
      guards: [],
      derive: (_f, at: Instant) => ({ granted_at: isoUtc(at) }),
    },
    {
      // refusal crosses the regulator inbox on every tier — unconditional, so
      // it's a required edge input, not a guard (matches ipp_fm's grant_relief).
      id: 'refuse_amendment',
      from: 'application_submitted',
      to: 'amendment_refused',
      by: ['ipp_developer', 'operator'],
      label: 'Refuse amendment',
      intent: 'destructive',
      input: {
        refusal_notes: { type: 'string', required: true },
        regulator_party: { type: 'party', role: 'regulator', required: true },
      },
      requiresReason: ['boundary_dispute', 'incomplete_documentation', 'municipal_objection', 'environmental_constraint', 'title_defect'],
      guards: [],
      derive: (_f, at: Instant) => ({ refused_at: isoUtc(at) }),
    },
    {
      // the ONLY edge out of amendment_refused — an appeal can never be ruled
      // on against an amendment that was never refused. Unconditional
      // regulator crossing, same as refuse_amendment.
      id: 'determine_appeal',
      from: 'amendment_refused',
      to: 'appeal_determined',
      by: ['ipp_developer', 'operator'],
      label: 'Determine appeal',
      intent: 'primary',
      input: {
        appeal_outcome: { type: 'string', required: true },
        regulator_party: { type: 'party', role: 'regulator', required: true },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ appeal_determined_at: isoUtc(at) }),
    },
  ],
};
