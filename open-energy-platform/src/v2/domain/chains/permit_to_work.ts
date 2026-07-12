// permit_to_work — safe-system-of-work permit lifecycle as data.
//
// Pilot chain 6. A permit holder requests a PTW against an asset; a permit
// authority runs hazard assessment → isolation → issue → work → close. The
// safety spine is structural: issue_permit ONLY leaves isolation_confirmed, and
// the only path into isolation_confirmed is verify_isolation. So a permit can
// NEVER be issued before isolation is physically verified — no guard needed, the
// state graph enforces it. High-hazard work (live_work or confined_space) also
// crosses to the regulator: approve_isolation_plan is guarded by
// regulatorPresentIfHighHazard.
//
// NO claim key. A PTW is while-active exclusivity over an asset, NOT permanent
// consumption: the same asset is permitted again next shift. A permanent claim
// (carbon_retirement pattern) would wrongly block the asset forever. Genuine
// concurrent-permit exclusion needs a claim+release mechanism the domain does
// not yet model — deliberately out of scope (same call as licence_application).
//
// settles:false — a permit is an operational safety control, never a payment
// (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure hazard-tier bucketing off the numeric score (0..10). No clock, no env.
const hazardTier = (score: Json | undefined): string => {
  if (typeof score !== 'number') return 'unassessed';
  if (score >= 8) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
};

export const permitToWork: ChainDecl = {
  key: 'permit_to_work',
  noun: 'Permit to work',
  refPrefix: 'PTW',
  title: (f) => `${(f.work_class as string) ?? 'general'} PTW — ${(f.asset_name as string) ?? 'unnamed asset'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'OHS Act 1993', provision: 's8 + General Machinery Regs safe system of work', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'network isolation & switching', effect: 'requires' },
  ],
  roles: ['holder', 'authority', 'regulator', 'operator'],

  fields: {
    permit_number: { type: 'string', label: 'Permit number' },
    holder_party: { type: 'party', role: 'holder', label: 'Permit holder' },
    authority_party: { type: 'party', role: 'authority', label: 'Permit authority' },
    asset_name: { type: 'string', required: true, label: 'Asset' },
    equipment_tag: { type: 'string', label: 'Equipment tag' },
    work_location: { type: 'string', required: true, label: 'Work location' },
    work_description: { type: 'string', required: true, label: 'Work description' },
    work_class: { type: 'string', required: true, label: 'Class (general/confined_space/hot_work/electrical)' },
    method_statement_ref: { type: 'string', label: 'Method statement ref' },
    hazard_score: { type: 'number', min: 0, max: 10, label: 'Hazard score (0-10)' },
    hazard_tier: { type: 'string', label: 'Hazard tier' },
    live_work: { type: 'boolean', label: 'Live work' },
    energy_sources: { type: 'string', label: 'Energy sources to isolate' },
    isolation_points: { type: 'string', label: 'Isolation points' },
    permit_validity_hours: { type: 'number', min: 0, label: 'Validity (hours)' },
    suspend_count: { type: 'number', label: 'Times suspended' },
    // written by derive, never by the client
    isolation_verified_at: { type: 'string', label: 'Isolation verified at' },
    issued_at: { type: 'string', label: 'Issued at' },
    closed_at_ptw: { type: 'string', label: 'Permit closed at' },
  },

  initial: 'permit_requested',

  states: {
    permit_requested: { label: 'Permit requested', terminal: false, holder: 'authority', sla: { hours: 4 } },
    hazard_assessment: { label: 'Hazard assessment', terminal: false, holder: 'authority', sla: { hours: 4 } },
    isolation_pending: { label: 'Isolation pending', terminal: false, holder: 'authority', sla: { hours: 8 } },
    isolation_confirmed: { label: 'Isolation confirmed', terminal: false, holder: 'authority', sla: { hours: 2 } },
    permit_issued: { label: 'Permit issued', terminal: false, holder: 'holder' },
    work_in_progress: { label: 'Work in progress', terminal: false, holder: 'holder' },
    suspended: { label: 'Suspended', terminal: false, holder: 'authority' },
    work_complete: { label: 'Work complete', terminal: false, holder: 'authority', sla: { hours: 4 } },
    permit_closed: { label: 'Permit closed', terminal: true, holder: 'none' },
    permit_rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    permit_revoked: { label: 'Revoked', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'permit_requested',
      by: ['holder', 'operator'],
      actorBecomes: 'holder',
      label: 'Request permit',
      intent: 'primary',
      input: {
        asset_name: { type: 'string', required: true },
        equipment_tag: { type: 'string' },
        work_location: { type: 'string', required: true },
        work_description: { type: 'string', required: true },
        work_class: { type: 'string', required: true },
        method_statement_ref: { type: 'string' },
        live_work: { type: 'boolean' },
        energy_sources: { type: 'string' },
        authority_party: { type: 'party', role: 'authority' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'begin_assessment',
      from: 'permit_requested',
      to: 'hazard_assessment',
      by: ['authority', 'operator'],
      label: 'Begin hazard assessment',
      intent: 'primary',
      input: { hazard_score: { type: 'number', min: 0, max: 10 } },
      guards: [],
      derive: (f, _at: Instant) => ({ hazard_tier: hazardTier(f.hazard_score) }),
    },
    {
      id: 'approve_isolation_plan',
      from: 'hazard_assessment',
      to: 'isolation_pending',
      by: ['authority'],
      label: 'Approve isolation plan',
      intent: 'primary',
      input: { isolation_points: { type: 'string', required: true } },
      // high-hazard (live work / confined space) needs a regulator on the txn.
      guards: ['regulatorPresentIfHighHazard'],
    },
    {
      id: 'verify_isolation',
      from: 'isolation_pending',
      to: 'isolation_confirmed',
      by: ['authority'],
      label: 'Verify isolation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ isolation_verified_at: isoUtc(at) }),
    },
    {
      // structural safety gate: the ONLY edge into permit_issued, and it can only
      // fire from isolation_confirmed — which only verify_isolation reaches. A
      // permit therefore cannot issue before isolation is verified. No guard.
      id: 'issue_permit',
      from: 'isolation_confirmed',
      to: 'permit_issued',
      by: ['authority'],
      label: 'Issue permit',
      intent: 'primary',
      input: { permit_validity_hours: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ issued_at: isoUtc(at) }),
    },
    { id: 'start_work', from: 'permit_issued', to: 'work_in_progress', by: ['holder'], label: 'Start work', intent: 'primary', guards: [] },
    {
      id: 'suspend_work',
      from: 'work_in_progress',
      to: 'suspended',
      by: ['authority', 'holder'],
      label: 'Suspend work',
      intent: 'secondary',
      requiresReason: ['unsafe_condition', 'isolation_breach', 'weather', 'shift_end', 'emergency'],
      guards: [],
      derive: (f, _at: Instant) => ({ suspend_count: (typeof f.suspend_count === 'number' ? f.suspend_count : 0) + 1 }),
    },
    { id: 'resume_work', from: 'suspended', to: 'work_in_progress', by: ['authority'], label: 'Resume work', intent: 'primary', guards: [] },
    { id: 'complete_work', from: 'work_in_progress', to: 'work_complete', by: ['holder'], label: 'Complete work', intent: 'primary', guards: [] },
    {
      id: 'close_permit',
      from: 'work_complete',
      to: 'permit_closed',
      by: ['authority'],
      label: 'Close permit',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_ptw: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_permit',
      from: ['permit_requested', 'hazard_assessment'],
      to: 'permit_rejected',
      by: ['authority'],
      label: 'Reject permit',
      intent: 'destructive',
      requiresReason: ['insufficient_controls', 'method_statement_inadequate', 'asset_unavailable', 'competency_lacking'],
      guards: [],
    },
    {
      id: 'revoke_permit',
      from: ['isolation_pending', 'isolation_confirmed', 'permit_issued', 'work_in_progress', 'suspended'],
      to: 'permit_revoked',
      by: ['authority', 'regulator'],
      label: 'Revoke permit',
      intent: 'destructive',
      requiresReason: ['safety_breach', 'isolation_compromised', 'emergency_recall', 'scope_exceeded'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['permit_requested', 'hazard_assessment'],
      to: 'withdrawn',
      by: ['holder'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['work_cancelled', 'rescheduled', 'no_longer_required'],
      guards: [],
    },
  ],

  // isolation-pending time-bar: an approved isolation left unverified stales out
  // (physical isolation state cannot be trusted indefinitely). record-only stub;
  // the sweep computes the real bar off state sla hours (ppa_contract pattern).
  timers: [{ onState: 'isolation_pending', after: { hours: 0 }, fire: 'revoke_permit', kind: 'time_bar' }],
};
