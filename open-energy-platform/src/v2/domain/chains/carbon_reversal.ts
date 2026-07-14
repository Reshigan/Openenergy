// carbon_reversal — a reversal of previously-sequestered carbon, made good from
// a buffer pool, as data.
//
// Motivating case (docs/architecture/REBUILD_FUNCTIONAL_FLOOR.md): a reversal
// `compensates` a retirement. A project that already issued/retired credits
// loses its sequestration (a fire, a harvest, a project failure) — that carbon
// is back in the atmosphere. The market makes it good by CANCELLING an equal
// quantity of buffer-pool serials so the retired credits stay honest.
//
// The integrity spine is structural, NOT a guard: cancel_buffer (the make-good)
// leaves ONLY compensation_pending, and the ONLY path into compensation_pending
// is authorise_compensation from under_assessment. So buffer serials can NEVER
// be cancelled before the reversal is quantified and verified — you cannot
// over- or under-compensate a reversal nobody measured. And the buffer serial
// range is a unique claim: the same buffer serials can never be cancelled twice
// (that would be a double-count, the exact failure a buffer pool exists to
// prevent). The v2_claims UNIQUE index enforces it atomically, not a read scan.
//
// serialRangeConsistent pins the buffer quantity to the inclusive range size on
// both authorise_compensation and cancel_buffer, so a mis-stated make-good
// quantity is refused pre-commit.
//
// settles:false — a reversal make-good is a registry/compliance act, not a
// payment. The platform records the buffer-cancellation instruction; the
// registry of record cancels the serials. No custody, no money (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

/** the permanent double-cancel key: a buffer serial range within one registry. */
const bufferClaim = (f: Record<string, Json>): string =>
  `${f.buffer_registry as string}:${f.serial_start as number}-${f.serial_end as number}`;

// pure severity bucketing off the reversed quantity. No clock, no env.
const reversalSeverity = (qty: Json | undefined): string => {
  if (typeof qty !== 'number') return 'unquantified';
  if (qty >= 10000) return 'major';
  if (qty >= 1000) return 'material';
  return 'minor';
};

export const carbonReversal: ChainDecl = {
  key: 'carbon_reversal',
  noun: 'Carbon reversal',
  refPrefix: 'CAR2',
  title: (f) => `Reversal of ${(f.reversed_tco2e as number) ?? '?'} tCO₂e — ${(f.project_ref as string) ?? 'unnamed project'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Carbon Tax Act', provision: 's13 offset allowance integrity', effect: 'requires' },
    { instrument: 'JSE-SRL', provision: 'registry reversal & buffer cancellation', effect: 'requires' },
  ],
  roles: ['holder', 'registry', 'regulator', 'operator'],

  fields: {
    project_ref: { type: 'string', required: true, label: 'Project ref' },
    retirement_ref: { type: 'string', required: true, label: 'Compensated retirement ref' },
    reversal_type: { type: 'string', required: true, label: 'Reversal type (fire/harvest/failure/other)' },
    reversed_tco2e: { type: 'number', required: true, min: 1, label: 'Reversed quantity (tCO₂e)' },
    reversal_severity: { type: 'string', label: 'Severity tier' },
    buffer_registry: { type: 'string', required: true, label: 'Buffer pool registry' },
    // the buffer serial range to cancel — supplied at authorise_compensation
    serial_start: { type: 'number', min: 1, label: 'Buffer serial start' },
    serial_end: { type: 'number', min: 1, label: 'Buffer serial end' },
    quantity_tco2e: { type: 'number', min: 1, label: 'Buffer cancel quantity (tCO₂e)' },
    registry_party: { type: 'party', role: 'registry', label: 'Registry' },
    // written by derive, never by the client
    assessment_started_at: { type: 'string', label: 'Assessment started at' },
    compensated_at: { type: 'string', label: 'Buffer cancelled at' },
  },

  initial: 'reported',

  states: {
    reported: { label: 'Reversal reported', terminal: false, holder: 'registry', sla: { days: 5 } },
    under_assessment: { label: 'Under assessment', terminal: false, holder: 'registry', sla: { days: 10 } },
    compensation_pending: { label: 'Compensation pending', terminal: false, holder: 'registry', sla: { days: 5 } },
    compensated: { label: 'Compensated', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'reported',
      by: ['holder', 'operator'],
      actorBecomes: 'holder',
      label: 'Report reversal',
      intent: 'primary',
      input: {
        project_ref: { type: 'string', required: true },
        retirement_ref: { type: 'string', required: true },
        reversal_type: { type: 'string', required: true },
        reversed_tco2e: { type: 'number', required: true, min: 1 },
        buffer_registry: { type: 'string', required: true },
        registry_party: { type: 'party', role: 'registry' },
      },
      guards: ['complianceHaltClear'],
    },
    {
      id: 'begin_assessment',
      from: 'reported',
      to: 'under_assessment',
      by: ['registry', 'operator'],
      label: 'Begin assessment',
      intent: 'primary',
      guards: [],
      derive: (f, at: Instant) => ({
        reversal_severity: reversalSeverity(f.reversed_tco2e),
        assessment_started_at: isoUtc(at),
      }),
    },
    {
      // the ONLY entry into compensation_pending — quantifies the make-good and
      // names the buffer serials to cancel. serialRangeConsistent ties the
      // stated quantity to the inclusive range size.
      id: 'authorise_compensation',
      from: 'under_assessment',
      to: 'compensation_pending',
      by: ['registry'],
      label: 'Authorise compensation',
      intent: 'primary',
      input: {
        serial_start: { type: 'number', required: true, min: 1 },
        serial_end: { type: 'number', required: true, min: 1 },
        quantity_tco2e: { type: 'number', required: true, min: 1 },
      },
      guards: ['complianceHaltClear', 'serialRangeConsistent'],
    },
    {
      // the make-good: cancel the buffer serials. Structural gate — leaves ONLY
      // compensation_pending, so a reversal cannot be compensated before it is
      // assessed and authorised. The buffer range is a permanent unique claim.
      id: 'cancel_buffer',
      from: 'compensation_pending',
      to: 'compensated',
      by: ['registry', 'system'],
      label: 'Cancel buffer serials',
      intent: 'primary',
      guards: ['complianceHaltClear', 'serialRangeConsistent'],
      claim: bufferClaim,
      derive: (_f, at: Instant) => ({ compensated_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject',
      from: ['reported', 'under_assessment'],
      to: 'rejected',
      by: ['registry', 'regulator'],
      label: 'Reject reversal',
      intent: 'destructive',
      requiresReason: ['not_a_reversal', 'outside_crediting_period', 'evidence_insufficient', 'duplicate_report'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['reported'],
      to: 'withdrawn',
      by: ['holder'],
      label: 'Withdraw report',
      intent: 'destructive',
      requiresReason: ['reported_in_error', 'superseded', 'no_longer_required'],
      guards: [],
    },
  ],

  // compensation-pending make-good deadline: an authorised reversal left
  // uncompensated for 14 days breaches buffer-pool rules — the sweep executes the
  // already-authorised buffer cancellation (serials were named at authorisation).
  timers: [{ onState: 'compensation_pending', after: { days: 14 }, fire: 'cancel_buffer', kind: 'sla' }],
};
