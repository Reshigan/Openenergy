// ipp_performance_bonds — IPP performance/guarantee bond lifecycle as data.
//
// An IPP developer registers a bond (performance, advance-payment, retention,
// warranty, environmental-rehabilitation, parental-guarantee, LC or bank
// guarantee) issued by a third-party bank/surety in favour of a named
// beneficiary. The bond then runs one of four terminal paths: RELEASED
// (obligation satisfied), FORFEITED (a call notice escalates to a paid-out
// claim), REPLACED (superseded by a renewal bond), or EXPIRED (ran past
// expiry_at un-renewed). A call notice is a first-class mid-life state
// (call_pending) — issuer/operator can acknowledge and stand it down back to
// active, or escalate it straight to forfeiture.
//
// JUDGMENT CALL: the v1 descriptor's action set (replace/forfeit/acknowledge/
// release) has no explicit "raise a call notice" action, but its status enum
// carries call_pending and its eventsTable (ipp_bond_notices) implies exactly
// that sub-workflow. raise_call is added here as the only structurally
// necessary edge into call_pending; acknowledge stands it down.
//
// v1's `replace` action re-supplies full new-bond fields (bond_number,
// issuer, face_value_zar, ...) that in v1's cross-txn model open a SEPARATE
// renewal bond row. This chain is a single txn, so those inputs land under
// replacement_* fields — a record of what superseded this bond — rather than
// overwriting this bond's own identity as it goes terminal.
//
// settles:false — a bond is a third-party financial instrument; a forfeiture
// RECORDS a claim (claim_amount_zar), it never moves money itself (no Escrow
// DO exists — CLAUDE.md). The actual payout settles on a money rail outside
// this chain, same pattern as availability_guarantee's remedy_instructed.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

export const ippPerformanceBonds: ChainDecl = {
  key: 'ipp_performance_bonds',
  noun: 'IPP performance bond',
  refPrefix: 'IPB',
  title: (f) =>
    `Bond ${(f.bond_number as string) ?? 'unnumbered'} — ${(f.bond_type as string) ?? 'performance'} (R${
      typeof f.face_value_zar === 'number' ? f.face_value_zar : 'n/a'
    })`,
  visibility: 'party',
  settles: false,
  legalBasis: [{ instrument: 'REIPPPP', provision: 'Implementation Agreement security/performance bond', effect: 'requires' }],
  roles: ['ipp_developer', 'operator'],

  fields: {
    bond_number: { type: 'string', label: 'Bond number' },
    project_id: { type: 'string', required: true, label: 'Project' },
    // performance | advance_payment | retention | warranty |
    // environmental_rehabilitation | parental_guarantee | letter_of_credit | bank_guarantee
    bond_type: { type: 'string', required: true, label: 'Bond type' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer (obligor)' },
    issuer: { type: 'string', required: true, label: 'Issuer (bank/surety)' },
    face_value_zar: { type: 'number', required: true, min: 0, label: 'Face value (ZAR)' },
    issued_at: { type: 'string', required: true, label: 'Issued at' },
    expiry_at: { type: 'string', required: true, label: 'Expiry at' },
    beneficiary: { type: 'string', label: 'Beneficiary' },
    release_conditions: { type: 'string', label: 'Release conditions' },
    // call-notice sub-workflow
    notice_reason: { type: 'string', label: 'Call notice reason' },
    // forfeiture
    claim_amount_zar: { type: 'number', min: 0, label: 'Claim amount (ZAR)' },
    claim_reason: { type: 'string', label: 'Claim reason narrative' },
    // replacement — describes the renewal bond that supersedes this one
    replacement_bond_number: { type: 'string', label: 'Replacement bond number' },
    replacement_issuer: { type: 'string', label: 'Replacement issuer' },
    replacement_face_value_zar: { type: 'number', min: 0, label: 'Replacement face value (ZAR)' },
    replacement_expiry_at: { type: 'string', label: 'Replacement expiry at' },
    // written by derive, never by the client
    registered_at: { type: 'string', label: 'Registered at' },
    call_raised_at: { type: 'string', label: 'Call notice raised at' },
    acknowledged_at: { type: 'string', label: 'Call notice acknowledged at' },
    forfeited_at: { type: 'string', label: 'Forfeited at' },
    released_at: { type: 'string', label: 'Released at' },
    replaced_at: { type: 'string', label: 'Replaced at' },
    expired_at: { type: 'string', label: 'Expired at' },
  },

  initial: 'active',

  states: {
    active: { label: 'Active', terminal: false, holder: 'ipp_developer' },
    call_pending: { label: 'Call notice pending', terminal: false, holder: 'operator', sla: { days: 14 } },
    released: { label: 'Released', terminal: true, holder: 'none' },
    expired: { label: 'Expired', terminal: true, holder: 'none' },
    forfeited: { label: 'Forfeited', terminal: true, holder: 'none' },
    replaced: { label: 'Replaced', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'active',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Register bond',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        bond_number: { type: 'string' },
        bond_type: { type: 'string', required: true },
        issuer: { type: 'string', required: true },
        face_value_zar: { type: 'number', required: true, min: 0 },
        issued_at: { type: 'string', required: true },
        expiry_at: { type: 'string', required: true },
        beneficiary: { type: 'string' },
        release_conditions: { type: 'string' },
      },
      // registering a bond is a new commitment — blocked under a platform-wide halt.
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ registered_at: isoUtc(at) }),
    },

    // --- call-notice sub-workflow ------------------------------------------
    {
      id: 'raise_call',
      from: 'active',
      to: 'call_pending',
      by: ['ipp_developer', 'operator'],
      label: 'Raise call notice',
      intent: 'secondary',
      input: { notice_reason: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ call_raised_at: isoUtc(at) }),
    },
    {
      id: 'acknowledge',
      from: 'call_pending',
      to: 'active',
      by: ['ipp_developer', 'operator'],
      label: 'Acknowledge call notice',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },

    // --- terminal exits ------------------------------------------------------
    {
      // defaults claim_amount_zar to face_value_zar when not supplied — mirrors
      // v1's forfeit cascadeHint exactly.
      id: 'forfeit',
      from: ['active', 'call_pending'],
      to: 'forfeited',
      by: ['operator'],
      label: 'Forfeit bond',
      intent: 'destructive',
      input: { claim_amount_zar: { type: 'number', min: 0 }, claim_reason: { type: 'string', required: true } },
      requiresReason: ['non_performance', 'construction_default', 'milestone_failure', 'contract_breach', 'commissioning_failure'],
      guards: [],
      derive: (f, at: Instant) => ({
        forfeited_at: isoUtc(at),
        ...(typeof f['claim_amount_zar'] === 'number' ? {} : { claim_amount_zar: f['face_value_zar'] as Json }),
      }),
    },
    {
      id: 'release',
      from: ['active', 'call_pending'],
      to: 'released',
      by: ['ipp_developer', 'operator'],
      label: 'Release bond',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ released_at: isoUtc(at) }),
    },
    {
      id: 'replace',
      from: ['active', 'call_pending'],
      to: 'replaced',
      by: ['ipp_developer', 'operator'],
      label: 'Replace bond',
      intent: 'secondary',
      input: {
        replacement_bond_number: { type: 'string', required: true },
        replacement_issuer: { type: 'string', required: true },
        replacement_face_value_zar: { type: 'number', required: true, min: 0 },
        replacement_expiry_at: { type: 'string', required: true },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ replaced_at: isoUtc(at) }),
    },
    {
      // fired by an external expiry sweep (analogous to the W122 SCADA
      // cert-expiry cron) — no fixed-duration TimerDecl fits expiry_at, which
      // is per-bond data, not a chain-constant SLA offset.
      id: 'expire',
      from: 'active',
      to: 'expired',
      by: ['operator', 'system'],
      label: 'Expire bond',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ expired_at: isoUtc(at) }),
    },
  ],
};
