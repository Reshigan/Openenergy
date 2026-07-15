// audit_chain_block — the hash-chained, Merkle-sealed audit block pipeline as
// data. Every block moves through a fixed build → verify → publish →
// reconcile → archive spine (proposed hourly by W118's cron sweep, reconciled
// daily, exported quarterly to NERSA/IPPO/SARB — see CLAUDE.md cron table).
//
// Structural honesty (no invented guards):
//  - This is a single-actor internal-control chain: only 'admin' (the
//    compliance-admin lane) and 'system' (the cron sweeps) ever touch it —
//    there is no counterparty, so none of the 10 registry guards (which all
//    reason about a second party, a credit ref, or a hazard field this chain
//    doesn't carry) apply. Every transition below is guards:[] on purpose,
//    not by omission.
//  - archive is reachable ONLY from reconciled, and reconciled is reachable
//    ONLY from independently_verifiable, which is reachable ONLY from
//    published — so a block can NEVER be archived without having gone
//    through independent (2-of-3) verification. The state graph enforces
//    the integrity gate; no guard required.
//  - `suspended` is carried in the v1 terminal list, but a `resume` edge
//    exists back out of it — so v2 models it as non-terminal. resume always
//    lands on `integrity_verified` regardless of where the block was when it
//    was suspended: after any freeze (routine or emergency-sealed) the safe
//    move is to re-run the integrity check from scratch, never to trust the
//    block's prior partial state.
//  - emergency_seal has no dedicated "sealed" status in the v1 registry — it
//    is the hard-line variant of suspend (hash-chain break / hash-collision
//    suspicion) and lands on the same `suspended` state, just with its own
//    reason vocabulary.
//
// settles:false — an audit block is a tamper-evidence record, not a payment
// or quantum movement (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

const BUILDING_STATES = ['block_proposed', 'segments_collected', 'merkle_built', 'integrity_verified', 'block_signed'];
const PUBLISHED_STATES = ['anchored', 'published', 'independently_verifiable', 'reconciled'];
const ACTIVE_STATES = [...BUILDING_STATES, ...PUBLISHED_STATES];

export const auditChainBlock: ChainDecl = {
  key: 'audit_chain_block',
  noun: 'Audit-chain block',
  refPrefix: 'ACB',
  title: (f) => `Audit-chain block — ${(f.title as string) ?? 'untitled'} (${(f.block_cadence as string) ?? 'cadence TBC'})`,
  visibility: 'owner',
  settles: false,
  roles: ['admin'],

  fields: {
    title: { type: 'string', label: 'Block title' },
    block_cadence: { type: 'string', label: 'Cadence (hourly/daily/weekly/monthly/quarterly)' },
    independent_verifier_count: { type: 'number', min: 0, label: 'Independent verifier count' },
    notes: { type: 'string', label: 'Notes' },
    fork_reason: { type: 'string', label: 'Fork / seal reason' },
    signature_chain_break_detected: { type: 'boolean', label: 'Signature chain break detected' },
    hash_collision_suspected: { type: 'boolean', label: 'Hash collision suspected' },
    // written by derive, never by the client
    proposed_at: { type: 'string', label: 'Proposed at' },
    segments_collected_at: { type: 'string', label: 'Segments collected at' },
    merkle_built_at: { type: 'string', label: 'Merkle built at' },
    integrity_verified_at: { type: 'string', label: 'Integrity verified at' },
    signed_at: { type: 'string', label: 'Signed at' },
    anchored_at: { type: 'string', label: 'Anchored at' },
    published_at: { type: 'string', label: 'Published at' },
    independently_verifiable_at: { type: 'string', label: 'Opened for independent verification at' },
    reconciled_at: { type: 'string', label: 'Reconciled at' },
    archived_at: { type: 'string', label: 'Archived at' },
    restated_at: { type: 'string', label: 'Restated at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    suspended_at: { type: 'string', label: 'Suspended at' },
    resumed_at: { type: 'string', label: 'Resumed at' },
    forked_at: { type: 'string', label: 'Forked at' },
  },

  initial: 'block_proposed',

  states: {
    block_proposed: { label: 'Block proposed', terminal: false, holder: 'admin', sla: { hours: 24 } },
    segments_collected: { label: 'Segments collected', terminal: false, holder: 'admin', sla: { hours: 2 } },
    merkle_built: { label: 'Merkle tree built', terminal: false, holder: 'admin', sla: { hours: 2 } },
    integrity_verified: { label: 'Integrity verified', terminal: false, holder: 'admin', sla: { hours: 2 } },
    block_signed: { label: 'Block signed', terminal: false, holder: 'admin', sla: { hours: 2 } },
    anchored: { label: 'Anchored', terminal: false, holder: 'admin', sla: { hours: 6 } },
    published: { label: 'Published', terminal: false, holder: 'admin', sla: { days: 1 } },
    independently_verifiable: { label: 'Open for independent verification', terminal: false, holder: 'admin', sla: { days: 2 } },
    reconciled: { label: 'Reconciled', terminal: false, holder: 'admin', sla: { days: 1 } },
    // non-terminal despite the v1 "terminal" label — resume proves it isn't.
    suspended: { label: 'Suspended', terminal: false, holder: 'admin', sla: { days: 14 } },
    archived: { label: 'Archived', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    restated: { label: 'Restated', terminal: true, holder: 'none' },
    forked: { label: 'Forked', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'block_proposed',
      by: ['admin', 'system'], // W118 hourly block-proposal sweep opens most of these
      actorBecomes: 'admin',
      label: 'Propose audit-chain block',
      intent: 'primary',
      input: {
        title: { type: 'string' },
        block_cadence: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ proposed_at: isoUtc(at) }),
    },
    {
      id: 'collect_segments',
      from: 'block_proposed',
      to: 'segments_collected',
      by: ['admin'],
      label: 'Collect segments',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ segments_collected_at: isoUtc(at) }),
    },
    {
      id: 'build_merkle',
      from: 'segments_collected',
      to: 'merkle_built',
      by: ['admin'],
      label: 'Build Merkle tree',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ merkle_built_at: isoUtc(at) }),
    },
    {
      id: 'verify_integrity',
      from: 'merkle_built',
      to: 'integrity_verified',
      by: ['admin'],
      label: 'Verify integrity',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ integrity_verified_at: isoUtc(at) }),
    },
    {
      id: 'sign_block',
      from: 'integrity_verified',
      to: 'block_signed',
      by: ['admin'],
      label: 'Sign block',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ signed_at: isoUtc(at) }),
    },
    {
      id: 'anchor_block',
      from: 'block_signed',
      to: 'anchored',
      by: ['admin', 'system'], // daily R2 anchor sweep (publishChainHeadToR2)
      label: 'Anchor block',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ anchored_at: isoUtc(at) }),
    },
    {
      id: 'publish_block',
      from: 'anchored',
      to: 'published',
      by: ['admin'],
      label: 'Publish block',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ published_at: isoUtc(at) }),
    },
    {
      // the only door into independent verification, so archive can never
      // happen without a published, anchored, signed antecedent.
      id: 'open_independent_verify',
      from: 'published',
      to: 'independently_verifiable',
      by: ['admin'],
      label: 'Open for independent verification',
      intent: 'primary',
      input: {
        independent_verifier_count: { type: 'number', min: 0 },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ independently_verifiable_at: isoUtc(at) }),
    },
    {
      id: 'reconcile',
      from: 'independently_verifiable',
      to: 'reconciled',
      by: ['admin', 'system'], // daily audit-chain reconcile sweep
      label: 'Reconcile',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ reconciled_at: isoUtc(at) }),
    },
    {
      id: 'archive',
      from: 'reconciled',
      to: 'archived',
      by: ['admin'],
      label: 'Archive',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ archived_at: isoUtc(at) }),
    },

    // --- terminal exits ---------------------------------------------------
    {
      id: 'restate',
      from: ['published', 'independently_verifiable', 'reconciled'],
      to: 'restated',
      by: ['admin'],
      label: 'Restate',
      intent: 'destructive',
      requiresReason: ['defect_discovered_post_publish', 'material_error', 'regulator_directed_correction', 'duplicate_block'],
      guards: [],
      derive: (_f, at: Instant) => ({ restated_at: isoUtc(at) }),
    },
    {
      id: 'reject',
      from: ['block_proposed', 'segments_collected'],
      to: 'rejected',
      by: ['admin', 'system'], // the sla timer below fires this for stalled proposals
      label: 'Reject',
      intent: 'destructive',
      requiresReason: ['integrity_check_failed', 'incomplete_segments', 'duplicate_proposal', 'governance_rejection', 'stale_no_progress'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      id: 'fork',
      from: ACTIVE_STATES,
      to: 'forked',
      by: ['admin'],
      label: 'Fork block',
      intent: 'destructive',
      input: { fork_reason: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ forked_at: isoUtc(at) }),
    },

    // --- freeze / resume loop (suspended is non-terminal) ------------------
    {
      id: 'suspend',
      from: ACTIVE_STATES,
      to: 'suspended',
      by: ['admin'],
      label: 'Suspend',
      intent: 'destructive',
      requiresReason: ['hash_chain_break', 'reconciliation_mismatch', 'regulator_direction', 'security_incident', 'pending_investigation'],
      guards: [],
      derive: (_f, at: Instant) => ({ suspended_at: isoUtc(at) }),
    },
    {
      // hard-line variant of suspend: hash-chain break / hash-collision
      // suspicion. No dedicated "sealed" status in v1 — lands on the same
      // suspended state, just with its own evidence and reason vocabulary.
      id: 'emergency_seal',
      from: ACTIVE_STATES,
      to: 'suspended',
      by: ['admin'],
      label: 'Emergency seal',
      intent: 'destructive',
      input: {
        signature_chain_break_detected: { type: 'boolean' },
        hash_collision_suspected: { type: 'boolean' },
        fork_reason: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ suspended_at: isoUtc(at) }),
    },
    {
      // always re-verifies from scratch, regardless of which state the
      // block was suspended from — never trust the prior partial state.
      id: 'resume',
      from: 'suspended',
      to: 'integrity_verified',
      by: ['admin'],
      label: 'Resume',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ resumed_at: isoUtc(at) }),
    },
  ],

  // a block left un-actioned in block_proposed for 24h (missed the next
  // hourly sweep entirely) is stale and auto-rejects rather than rotting.
  timers: [{ onState: 'block_proposed', after: { hours: 24 }, fire: 'reject', kind: 'sla', reason: 'stale_no_progress' }],
};
