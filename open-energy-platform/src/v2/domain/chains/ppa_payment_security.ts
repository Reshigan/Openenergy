// ppa_payment_security — PPA credit-support instrument lifecycle as data.
//
// Wave 54 (legacy: oe_ppa_payment_securities). The offtaker lodges a credit-
// support instrument (bank guarantee / letter of credit / parent company
// guarantee / cash) securing its PPA payment obligations to the seller. The
// seller verifies and activates it as live credit support, then the security
// sits through periodic adequacy review and expiry monitoring. A shortfall in
// coverage routes to substitution; an unremedied payment default lets the
// seller draw on the instrument, which opens a replenishment obligation
// against the offtaker. The instrument exits by release (obligation ended),
// forfeiture (unremedied default), or rejection (instrument never verified).
//
// Structural honesty (no invented guards):
//  - `activate` is reachable ONLY from `under_verification`, and the only
//    path into `under_verification` is begin_verification. So an instrument
//    can NEVER become live credit support without a verification step — the
//    state graph enforces the check, no guard required.
//  - `substitution_pending` (a coverage shortfall) is reachable ONLY from
//    `adequacy_review`, via require_increase — a substitution demand can
//    never be raised without an adequacy review having actually run.
//  - `submit_instrument` (the opening edge) is guarded by counterpartyDistinct
//    (offtaker and seller must be different legal entities — no self-secured
//    guarantees) and complianceHaltClear (lodging new credit support is a new
//    commitment). `activate` (admitting the instrument as live credit
//    support) carries the same complianceHaltClear gate. Drawdown, expiry,
//    release and forfeiture are de-risking / factual actions and are never
//    blocked by a halt.
//  - No guard here enforces "regulator crosses the inbox on forfeiture" (the
//    legacy cascadeHint) — none of the 10 registry guards model a payment-
//    security severity threshold, and regulatorPresentIfStrategic /
//    …Critical / …HighHazard key off unrelated fields (capacity_mw, priority,
//    live_work). That crossing is a cascade/notification concern, not a
//    state-machine gate.
//
// settles:false — this chain is the record of a credit-support instrument's
// status and the request to draw on it. The instrument's face value and the
// drawdown/replenishment figures it carries are informational; the actual
// cash movement (bank pays out on the guarantee, offtaker remits the
// replenishment) settles on its own rail (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ppaPaymentSecurity: ChainDecl = {
  key: 'ppa_payment_security',
  noun: 'PPA payment security instrument',
  refPrefix: 'PPS',
  title: (f) =>
    `PPA payment security — ${(f.instrument_name as string) ?? 'unnamed instrument'} (R${(f.secured_amount_zar_m as number) ?? 0}m)`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP Standard PPA', provision: 'payment-security / credit-support undertaking', effect: 'requires' },
  ],
  roles: ['offtaker', 'ipp', 'regulator', 'operator'],

  fields: {
    instrument_name: { type: 'string', required: true, label: 'Instrument name' },
    instrument_type: { type: 'string', label: 'Instrument type (bank_guarantee/letter_of_credit/pcg/cash)' },
    issuer_name: { type: 'string', label: 'Issuer name' },
    issuer_rating: { type: 'string', label: 'Issuer rating' },
    secured_amount_zar_m: { type: 'number', required: true, min: 0, label: 'Secured amount (R millions)' },
    required_amount_zar_m: { type: 'number', min: 0, label: 'Required amount (R millions)' },
    cover_months: { type: 'number', min: 0, label: 'Cover (months)' },
    expiry_date: { type: 'string', label: 'Expiry date' },
    ipp_party: { type: 'party', role: 'ipp', label: 'Seller / IPP' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    submission_ref: { type: 'string', label: 'Submission ref' },
    submission_basis: { type: 'string', label: 'Submission basis' },
    verification_ref: { type: 'string', label: 'Verification ref' },
    verification_basis: { type: 'string', label: 'Verification basis' },
    reject_ref: { type: 'string', label: 'Reject ref' },
    activation_ref: { type: 'string', label: 'Activation ref' },
    activation_basis: { type: 'string', label: 'Activation basis' },
    adequacy_ref: { type: 'string', label: 'Adequacy ref' },
    adequacy_basis: { type: 'string', label: 'Adequacy basis' },
    adequacy_shortfall_zar_m: { type: 'number', label: 'Adequacy shortfall (R millions)' },
    drawn_amount_zar_m: { type: 'number', min: 0, label: 'Drawn amount (R millions)' },
    outstanding_invoice_zar_m: { type: 'number', min: 0, label: 'Outstanding invoice (R millions)' },
    replenishment_due_zar_m: { type: 'number', min: 0, label: 'Replenishment due (R millions)' },
    drawdown_ref: { type: 'string', label: 'Drawdown ref' },
    drawdown_basis: { type: 'string', label: 'Drawdown basis' },
    replenishment_ref: { type: 'string', label: 'Replenishment ref' },
    replenishment_basis: { type: 'string', label: 'Replenishment basis' },
    expiry_ref: { type: 'string', label: 'Expiry ref' },
    expiry_basis: { type: 'string', label: 'Expiry basis' },
    release_ref: { type: 'string', label: 'Release ref' },
    release_basis: { type: 'string', label: 'Release basis' },
    forfeit_ref: { type: 'string', label: 'Forfeit ref' },
    forfeit_basis: { type: 'string', label: 'Forfeit basis' },
    regulator_ref: { type: 'string', label: 'Regulator ref' },
    decision_notes: { type: 'string', label: 'Decision notes' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Submitted at' },
    verification_started_at: { type: 'string', label: 'Verification started at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    activated_at: { type: 'string', label: 'Activated at' },
    adequacy_opened_at: { type: 'string', label: 'Adequacy review opened at' },
    confirmed_adequate_at: { type: 'string', label: 'Confirmed adequate at' },
    increase_required_at: { type: 'string', label: 'Increase required at' },
    drawdown_initiated_at: { type: 'string', label: 'Drawdown initiated at' },
    replenishment_opened_at: { type: 'string', label: 'Replenishment opened at' },
    expiry_flagged_at: { type: 'string', label: 'Expiry flagged at' },
    released_at: { type: 'string', label: 'Released at' },
    forfeited_at: { type: 'string', label: 'Forfeited at' },
  },

  initial: 'instrument_submitted',

  states: {
    instrument_submitted: { label: 'Instrument submitted', terminal: false, holder: 'offtaker', sla: { days: 5 } },
    under_verification: { label: 'Under verification', terminal: false, holder: 'offtaker', sla: { days: 10 } },
    active: { label: 'Active', terminal: false, holder: 'none' },
    adequacy_review: { label: 'Adequacy review', terminal: false, holder: 'offtaker', sla: { days: 10 } },
    drawdown_initiated: { label: 'Drawdown initiated', terminal: false, holder: 'ipp', sla: { days: 5 } },
    replenishment_pending: { label: 'Replenishment pending', terminal: false, holder: 'offtaker', sla: { days: 30 } },
    expiry_pending: { label: 'Expiry pending', terminal: false, holder: 'offtaker', sla: { days: 30 } },
    substitution_pending: { label: 'Substitution pending', terminal: false, holder: 'ipp', sla: { days: 30 } },
    released: { label: 'Released', terminal: true, holder: 'none' },
    forfeited: { label: 'Forfeited', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'submit_instrument',
      from: '@new',
      to: 'instrument_submitted',
      by: ['offtaker', 'operator'],
      actorBecomes: 'offtaker',
      label: 'Submit instrument',
      intent: 'primary',
      input: {
        instrument_name: { type: 'string', required: true },
        instrument_type: { type: 'string' },
        issuer_name: { type: 'string' },
        issuer_rating: { type: 'string' },
        secured_amount_zar_m: { type: 'number', required: true, min: 0 },
        required_amount_zar_m: { type: 'number', min: 0 },
        cover_months: { type: 'number', min: 0 },
        expiry_date: { type: 'string' },
        submission_ref: { type: 'string' },
        submission_basis: { type: 'string' },
        ipp_party: { type: 'party', role: 'ipp' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // offtaker ≠ seller (no self-secured guarantees) + no new commitments under a halt.
      guards: ['counterpartyDistinct', 'complianceHaltClear'],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },

    // --- verification gate (structural): under_verification is the ONLY door to activate ---
    {
      id: 'begin_verification',
      from: 'instrument_submitted',
      to: 'under_verification',
      by: ['offtaker', 'operator'],
      label: 'Begin verification',
      intent: 'primary',
      input: { verification_ref: { type: 'string' }, verification_basis: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ verification_started_at: isoUtc(at) }),
    },
    {
      id: 'reject_instrument',
      from: ['instrument_submitted', 'under_verification'],
      to: 'rejected',
      by: ['offtaker', 'operator'],
      label: 'Reject instrument',
      intent: 'destructive',
      requiresReason: ['issuer_rating_insufficient', 'instrument_defective', 'coverage_shortfall', 'documentation_incomplete'],
      input: { reject_ref: { type: 'string' }, decision_notes: { type: 'string' }, regulator_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      id: 'activate',
      from: 'under_verification',
      to: 'active',
      by: ['ipp', 'operator'],
      label: 'Activate security',
      intent: 'primary',
      input: { activation_ref: { type: 'string' }, activation_basis: { type: 'string' } },
      // admitting the instrument as live credit support is a new commitment.
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ activated_at: isoUtc(at) }),
    },

    // --- periodic adequacy review from active ----------------------------------
    {
      id: 'open_adequacy_review',
      from: 'active',
      to: 'adequacy_review',
      by: ['offtaker', 'operator'],
      label: 'Open adequacy review',
      intent: 'primary',
      input: { adequacy_ref: { type: 'string' }, adequacy_basis: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ adequacy_opened_at: isoUtc(at) }),
    },
    {
      id: 'confirm_adequate',
      from: 'adequacy_review',
      to: 'active',
      by: ['offtaker', 'operator'],
      label: 'Confirm adequate',
      intent: 'primary',
      input: { adequacy_basis: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ confirmed_adequate_at: isoUtc(at) }),
    },
    {
      // reachable ONLY from adequacy_review: a substitution demand can never be
      // raised without an adequacy review having actually run.
      id: 'require_increase',
      from: 'adequacy_review',
      to: 'substitution_pending',
      by: ['offtaker', 'operator'],
      label: 'Require increase',
      intent: 'secondary',
      requiresReason: ['coverage_below_required', 'issuer_downgrade', 'exposure_growth'],
      input: {
        adequacy_basis: { type: 'string' },
        adequacy_shortfall_zar_m: { type: 'number' },
        required_amount_zar_m: { type: 'number' },
        decision_notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ increase_required_at: isoUtc(at) }),
    },

    // --- drawdown on unremedied payment default --------------------------------
    {
      id: 'initiate_drawdown',
      from: 'active',
      to: 'drawdown_initiated',
      by: ['ipp', 'operator'],
      label: 'Initiate drawdown',
      intent: 'primary',
      input: {
        drawn_amount_zar_m: { type: 'number', min: 0 },
        outstanding_invoice_zar_m: { type: 'number', min: 0 },
        replenishment_due_zar_m: { type: 'number', min: 0 },
        drawdown_ref: { type: 'string' },
        drawdown_basis: { type: 'string' },
        regulator_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ drawdown_initiated_at: isoUtc(at) }),
    },
    {
      id: 'open_replenishment',
      from: 'drawdown_initiated',
      to: 'replenishment_pending',
      by: ['offtaker', 'operator'],
      label: 'Open replenishment',
      intent: 'primary',
      input: {
        replenishment_ref: { type: 'string' },
        replenishment_basis: { type: 'string' },
        replenishment_due_zar_m: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ replenishment_opened_at: isoUtc(at) }),
    },

    // --- expiry monitoring from active ------------------------------------------
    {
      id: 'flag_expiry',
      from: 'active',
      to: 'expiry_pending',
      by: ['offtaker', 'operator'],
      label: 'Flag expiry',
      intent: 'secondary',
      input: { expiry_ref: { type: 'string' }, expiry_basis: { type: 'string' }, expiry_date: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ expiry_flagged_at: isoUtc(at) }),
    },

    // --- exits: release (never blocked — de-risking) and forfeit (default) ------
    {
      id: 'release',
      from: ['active', 'adequacy_review', 'drawdown_initiated', 'replenishment_pending', 'expiry_pending', 'substitution_pending'],
      to: 'released',
      by: ['offtaker', 'operator'],
      label: 'Release',
      intent: 'primary',
      input: { release_ref: { type: 'string' }, release_basis: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ released_at: isoUtc(at) }),
    },
    {
      id: 'forfeit',
      from: ['active', 'adequacy_review', 'drawdown_initiated', 'replenishment_pending', 'expiry_pending', 'substitution_pending'],
      to: 'forfeited',
      by: ['ipp', 'operator'],
      label: 'Forfeit security',
      intent: 'destructive',
      requiresReason: ['unremedied_default', 'missed_replenishment', 'issuer_insolvency', 'regulatory_direction'],
      input: {
        forfeit_ref: { type: 'string' },
        forfeit_basis: { type: 'string' },
        regulator_ref: { type: 'string' },
        decision_notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ forfeited_at: isoUtc(at) }),
    },
  ],
};
