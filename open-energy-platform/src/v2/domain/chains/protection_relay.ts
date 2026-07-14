// protection_relay — a protection-relay SETTING CHANGE lifecycle as data.
//
// The relay itself is master data (an object). Changing its protection setting
// is the act, and that act is this Transaction (REBUILD_FUNCTIONAL_FLOOR.md:
// "The relay is an object. Changing its setting is an act."). A requester
// proposes a new setting group against a relay; a protection engineer reviews →
// approves → the change is applied to the physical relay → verified by secondary
// injection → closed.
//
// The safety spine is STRUCTURAL, not a guard: apply_settings leaves ONLY
// change_approved, and the ONLY path into change_approved is approve_change. So
// a live protection setting can NEVER be pushed to a relay before an engineer
// approves it — the state graph enforces it, no guard needed. A mis-set relay
// under-reaches or fails to trip on a real fault, so this ordering is the whole
// point. Critical-priority changes also cross to the regulator:
// approve_change is guarded by regulatorPresentIfCritical.
//
// settles:false — a protection-setting change is an operational safety control,
// never a payment (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const protectionRelay: ChainDecl = {
  key: 'protection_relay',
  noun: 'Protection relay setting change',
  refPrefix: 'PROT',
  title: (f) => `${(f.relay_tag as string) ?? 'unnamed relay'} setting change — ${(f.substation as string) ?? 'unknown site'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'network protection & setting coordination', effect: 'requires' },
    { instrument: 'OHS Act 1993', provision: 's8 safe system of work on live plant', effect: 'requires' },
  ],
  roles: ['requester', 'engineer', 'regulator', 'operator'],

  fields: {
    change_number: { type: 'string', label: 'Change number' },
    requester_party: { type: 'party', role: 'requester', label: 'Requester' },
    engineer_party: { type: 'party', role: 'engineer', label: 'Protection engineer' },
    relay_tag: { type: 'string', required: true, label: 'Relay tag' },
    substation: { type: 'string', required: true, label: 'Substation' },
    feeder: { type: 'string', label: 'Feeder / bay' },
    setting_group: { type: 'string', label: 'Setting group' },
    current_setting: { type: 'string', label: 'Current setting' },
    proposed_setting: { type: 'string', required: true, label: 'Proposed setting' },
    change_reason: { type: 'string', required: true, label: 'Reason for change' },
    priority: { type: 'string', label: 'Priority (routine/urgent/critical)' },
    review_notes: { type: 'string', label: 'Engineering review notes' },
    applied_by_ref: { type: 'string', label: 'Applied-by evidence ref' },
    verification_ref: { type: 'string', label: 'Secondary-injection verification ref' },
    // written by derive, never by the client
    approved_at: { type: 'string', label: 'Approved at' },
    applied_at: { type: 'string', label: 'Applied at' },
    verified_at: { type: 'string', label: 'Verified at' },
    closed_at_change: { type: 'string', label: 'Change closed at' },
  },

  initial: 'change_proposed',

  states: {
    change_proposed: { label: 'Change proposed', terminal: false, holder: 'engineer', sla: { hours: 8 } },
    under_review: { label: 'Under engineering review', terminal: false, holder: 'engineer', sla: { hours: 24 } },
    change_approved: { label: 'Change approved', terminal: false, holder: 'requester', sla: { hours: 24 } },
    settings_applied: { label: 'Settings applied', terminal: false, holder: 'engineer', sla: { hours: 8 } },
    change_verified: { label: 'Change verified', terminal: false, holder: 'engineer', sla: { hours: 4 } },
    change_closed: { label: 'Change closed', terminal: true, holder: 'none' },
    change_rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    change_reverted: { label: 'Reverted', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'change_proposed',
      by: ['requester', 'operator'],
      actorBecomes: 'requester',
      label: 'Propose setting change',
      intent: 'primary',
      input: {
        relay_tag: { type: 'string', required: true },
        substation: { type: 'string', required: true },
        feeder: { type: 'string' },
        setting_group: { type: 'string' },
        current_setting: { type: 'string' },
        proposed_setting: { type: 'string', required: true },
        change_reason: { type: 'string', required: true },
        priority: { type: 'string' },
        engineer_party: { type: 'party', role: 'engineer' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'begin_review',
      from: 'change_proposed',
      to: 'under_review',
      by: ['engineer', 'operator'],
      label: 'Begin engineering review',
      intent: 'primary',
      input: { review_notes: { type: 'string' } },
      guards: [],
    },
    {
      id: 'approve_change',
      from: 'under_review',
      to: 'change_approved',
      by: ['engineer'],
      label: 'Approve change',
      intent: 'primary',
      // critical-priority protection changes cross to the regulator: one must be a party.
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      // structural safety gate: the ONLY edge into settings_applied, and it can
      // only fire from change_approved — which only approve_change reaches. A
      // live protection setting therefore cannot be pushed to a relay before an
      // engineer approves it. No guard.
      id: 'apply_settings',
      from: 'change_approved',
      to: 'settings_applied',
      by: ['requester', 'engineer'],
      label: 'Apply settings to relay',
      intent: 'primary',
      input: { applied_by_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ applied_at: isoUtc(at) }),
    },
    {
      id: 'verify_settings',
      from: 'settings_applied',
      to: 'change_verified',
      by: ['engineer'],
      label: 'Verify settings (secondary injection)',
      intent: 'primary',
      input: { verification_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },
    {
      id: 'close_change',
      from: 'change_verified',
      to: 'change_closed',
      by: ['engineer'],
      label: 'Close change',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_change: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_change',
      from: ['change_proposed', 'under_review'],
      to: 'change_rejected',
      by: ['engineer'],
      label: 'Reject change',
      intent: 'destructive',
      requiresReason: ['coordination_conflict', 'insufficient_justification', 'study_incomplete', 'asset_unavailable'],
      guards: [],
    },
    {
      // post-approval safety recall: a change already applied (or approved) that
      // misoperates or destabilises the network is reverted to the prior setting.
      id: 'revert_change',
      from: ['change_approved', 'settings_applied', 'change_verified'],
      to: 'change_reverted',
      by: ['engineer', 'regulator', 'system'],
      label: 'Revert change',
      intent: 'destructive',
      requiresReason: ['misoperation', 'setting_error', 'grid_instability', 'emergency_recall', 'verification_window_elapsed'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['change_proposed', 'under_review'],
      to: 'withdrawn',
      by: ['requester'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['no_longer_required', 'superseded', 'rescheduled'],
      guards: [],
    },
  ],

  // applied-but-unverified time-bar: settings pushed to a live relay must be
  // proven by secondary injection within a day; an unverified applied change
  // stales out and is reverted.
  timers: [{ onState: 'settings_applied', after: { hours: 24 }, fire: 'revert_change', kind: 'time_bar', reason: 'verification_window_elapsed' }],
};
