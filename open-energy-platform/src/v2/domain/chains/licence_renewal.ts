// licence_renewal — NERSA licence renewal lifecycle as data.
//
// Regulatory chain (docs/architecture/REBUILD_FUNCTIONAL_FLOOR.md): "Opened by a
// timer on the licence's terminal state." An issued licence approaches expiry; a
// renewal is lodged by the holder against the existing licence ref, and the
// regulator runs term-compliance review → evaluation → council decision → grant →
// re-issue. Distinct from licence_application: renewal turns on the holder's
// conduct DURING the licence term, not first-entry fitness.
//
// The compliance sign-off (accept_review) is guarded: no acceptance without a
// named completeness-evidence ref (completenessEvidencePresent) — the paper trail
// that the term-compliance record was actually examined.
//
// Structural spine: the ONLY edge into renewal_granted is grant_renewal, which
// leaves ONLY renewal_decision — which only refer_to_council reaches. So a renewal
// can NEVER be granted before council has the file. No guard needed; the state
// graph enforces the order.
//
// NO claim key. A licence is while-active exclusivity, not permanent consumption:
// the same facility renews term after term. A permanent claim (carbon_retirement
// pattern) would wrongly block re-renewal forever — deliberately out of scope
// (same call as licence_application).
//
// settles:false — a renewal grant is a regulatory act, not a payment. No custody,
// no money (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const licenceRenewal: ChainDecl = {
  key: 'licence_renewal',
  noun: 'Licence renewal',
  refPrefix: 'LICE',
  title: (f) => `${(f.licence_class as string) ?? 'standard'} renewal — ${(f.facility_ref as string) ?? 'unnamed facility'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's8 licence renewal / continuation', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'licensing rules', effect: 'authorises' },
  ],
  roles: ['holder', 'regulator', 'operator'],

  fields: {
    holder_name: { type: 'string', required: true, label: 'Licence holder' },
    existing_licence_ref: { type: 'string', required: true, label: 'Existing licence ref' },
    facility_ref: { type: 'string', required: true, label: 'Facility ref' },
    licence_class: { type: 'string', required: true, label: 'Class (major/standard/minor)' },
    activity: { type: 'string', required: true, label: 'Licensed activity' },
    capacity_mw: { type: 'number', min: 0, label: 'Capacity (MW)' },
    current_expiry: { type: 'string', label: 'Current expiry' },
    renewal_term_years: { type: 'number', min: 0, label: 'Requested renewal term (years)' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    // written by derive, never by the client
    granted_at: { type: 'string', label: 'Granted at' },
    issued_at: { type: 'string', label: 'Re-issued at' },
  },

  initial: 'renewal_requested',

  states: {
    renewal_requested: { label: 'Renewal requested', terminal: false, holder: 'regulator', sla: { days: 5 } },
    compliance_review: { label: 'Term-compliance review', terminal: false, holder: 'regulator', sla: { days: 30 } },
    info_requested: { label: 'Additional info requested', terminal: false, holder: 'holder', sla: { days: 45 } },
    evaluation: { label: 'Evaluation', terminal: false, holder: 'regulator', sla: { days: 60 } },
    renewal_decision: { label: 'Council decision', terminal: false, holder: 'regulator', sla: { days: 30 } },
    renewal_granted: { label: 'Renewal granted', terminal: false, holder: 'regulator', sla: { days: 14 } },
    renewal_issued: { label: 'Renewal issued', terminal: true, holder: 'none' },
    refused: { label: 'Refused', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    lapsed: { label: 'Lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'renewal_requested',
      by: ['holder', 'operator'],
      actorBecomes: 'holder',
      label: 'Lodge renewal',
      intent: 'primary',
      input: {
        holder_name: { type: 'string', required: true },
        existing_licence_ref: { type: 'string', required: true },
        facility_ref: { type: 'string', required: true },
        licence_class: { type: 'string', required: true },
        activity: { type: 'string', required: true },
        capacity_mw: { type: 'number', min: 0 },
        current_expiry: { type: 'string' },
        renewal_term_years: { type: 'number', min: 0 },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: ['complianceHaltClear'],
    },

    { id: 'begin_review', from: 'renewal_requested', to: 'compliance_review', by: ['regulator'], label: 'Begin term-compliance review', intent: 'primary', guards: [] },
    {
      id: 'request_info',
      from: 'compliance_review',
      to: 'info_requested',
      by: ['regulator'],
      label: 'Request additional information',
      intent: 'secondary',
      requiresReason: ['compliance_gap', 'documents_missing', 'clarification_needed'],
      guards: [],
    },
    { id: 'submit_info', from: 'info_requested', to: 'compliance_review', by: ['holder'], label: 'Submit requested information', intent: 'primary', input: { completeness_ref: { type: 'string', required: true } }, guards: [] },
    {
      // compliance sign-off: the term-compliance record must have a named evidence
      // ref before the file moves to evaluation.
      id: 'accept_review',
      from: 'compliance_review',
      to: 'evaluation',
      by: ['regulator'],
      label: 'Accept — term compliance satisfied',
      intent: 'primary',
      // NOT required at the input layer — completenessEvidencePresent is the single
      // enforcement point (required:true here would preempt it with BAD_INPUT).
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
    },
    { id: 'refer_to_council', from: 'evaluation', to: 'renewal_decision', by: ['regulator'], label: 'Refer to council', intent: 'primary', guards: [] },
    {
      // structural gate: the ONLY edge into renewal_granted, firing ONLY from
      // renewal_decision — so a renewal cannot be granted before council decides.
      id: 'grant_renewal',
      from: 'renewal_decision',
      to: 'renewal_granted',
      by: ['regulator'],
      label: 'Grant renewal',
      intent: 'primary',
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ granted_at: isoUtc(at) }),
    },
    {
      id: 'issue_renewal',
      from: 'renewal_granted',
      to: 'renewal_issued',
      by: ['regulator'],
      label: 'Re-issue licence',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ issued_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'refuse_renewal',
      from: ['evaluation', 'renewal_decision'],
      to: 'refused',
      by: ['regulator'],
      label: 'Refuse renewal',
      intent: 'destructive',
      requiresReason: ['persistent_non_compliance', 'not_in_public_interest', 'holder_not_fit', 'technical_deficiency'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['renewal_requested', 'compliance_review', 'info_requested', 'evaluation'],
      to: 'withdrawn',
      by: ['holder'],
      label: 'Withdraw renewal',
      intent: 'destructive',
      requiresReason: ['facility_decommissioned', 'refiling', 'no_longer_required'],
      guards: [],
    },
    {
      id: 'lapse',
      from: 'info_requested',
      to: 'lapsed',
      by: ['regulator', 'system'],
      label: 'Lapse (no response before expiry)',
      intent: 'destructive',
      requiresReason: ['info_deadline_missed'],
      guards: [],
    },
  ],

  // info-request time-bar: if the holder does not respond within the 60-day
  // information window (ERA 2006, aligned with licence_application), the
  // renewal lapses.
  timers: [{ onState: 'info_requested', after: { days: 60 }, fire: 'lapse', kind: 'time_bar', reason: 'info_deadline_missed' }],
};
