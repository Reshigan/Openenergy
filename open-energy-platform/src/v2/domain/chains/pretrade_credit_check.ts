// pretrade_credit_check — FSCA pre-trade credit/risk gate an order must clear
// before it is allowed to execute (W107), as data.
//
// The gate is a strict sequential battery: KYC → credit line → settlement
// risk → concentration → underlying-halt → mark-age freshness. Only once all
// six checks have run can `clear_order` fire. That sequence is the diligence
// spine: `clear_order` is reachable only from `mark_age_validated` (or from
// `manually_cleared`, the compliance-override lane) — so an order can NEVER
// clear without walking every gate, or without an explicit compliance
// override. No guard needed; the state graph enforces it.
//
// `hold_for_review` can interrupt any pre-clear gate (a borderline order
// parked for a human credit officer) and `reject_order` can fire from any
// pre-clear gate, `held_for_review`, or even `manually_rejected` (legacy
// reject-after-reject is allowed — see oe_pretrade_credit_check TRANSITIONS).
//
// Structural honesty — soft terminals: `cleared`, `rejected`, `manually_
// cleared` and `manually_rejected` are flagged terminal:true (matching the
// legacy `terminal` array and its own comment: "operator no longer actions")
// even though each still has one narrow housekeeping/override edge out
// (archive_check, override_rejection, or clear_order via manually_cleared).
// `terminal` here is a display/closed_at signal, not a hard block — the
// engine only ever checks a transition's `from` list, so those override
// lanes keep working. This mirrors the real behaviour documented in
// src/routes/pretrade-credit-chain.ts (nextStatus / TRANSITIONS).
//
// counterpartyDistinct on `open`: a trader cannot pre-trade-check an order
// against themselves (no self-dealing). complianceHaltClear on `open`,
// `clear_order` and `override_rejection`: a platform-wide compliance halt
// blocks new commitments AND re-clearing a rejected order, but never blocks
// the de-risking exits (hold/reject/manually_reject).
//
// settles:false — this chain is a pass/fail credit gate upstream of
// execution; it never itself moves money or quantum (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const pretradeCreditCheck: ChainDecl = {
  key: 'pretrade_credit_check',
  noun: 'Pre-trade credit check',
  refPrefix: 'PTC',
  title: (f) =>
    `Pre-trade credit check — ${(f.counterparty_name as string) ?? 'unnamed counterparty'} (${(f.side as string) ?? 'side TBC'} ${(f.volume_mwh as number) ?? 0} MWh)`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Financial Markets Act 2012', provision: 's50 pre-trade risk controls (member/participant trading systems)', effect: 'requires' },
    { instrument: 'FSCA Conduct Standard 1 of 2020 (RE)', provision: 'pre-trade credit and risk-management controls', effect: 'requires' },
    { instrument: 'CPMI-IOSCO PFMI', provision: 'Principle 4 (credit risk) — pre-trade exposure limits', effect: 'requires' },
  ],
  roles: ['trader', 'risk', 'compliance', 'archiver', 'counterparty', 'regulator', 'operator'],

  fields: {
    order_ref: { type: 'string', label: 'Order ref' },
    trader_party: { type: 'party', role: 'trader', label: 'Trader' },
    counterparty_party: { type: 'party', role: 'counterparty', label: 'Counterparty entity' },
    counterparty_name: { type: 'string', required: true, label: 'Counterparty' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    energy_type: { type: 'string', label: 'Energy type' },
    side: { type: 'string', label: 'Side (buy/sell)' },
    volume_mwh: { type: 'number', min: 0, label: 'Volume (MWh)' },
    price_zar_per_mwh: { type: 'number', min: 0, label: 'Price (ZAR/MWh)' },
    notional_exposure_zar: { type: 'number', min: 0, label: 'Notional exposure (ZAR)' },
    kyc_verified_at: { type: 'string', label: 'KYC verified at' },
    credit_line_used_zar: { type: 'number', min: 0, label: 'Credit line used (ZAR)' },
    credit_line_limit_zar: { type: 'number', min: 0, label: 'Credit line limit (ZAR)' },
    dvp_pvp_unavailable: { type: 'boolean', label: 'DvP/PvP unavailable' },
    currency_mismatch: { type: 'boolean', label: 'Currency mismatch' },
    tenor_days: { type: 'number', min: 0, label: 'Tenor (days)' },
    single_name_exposure_zar: { type: 'number', min: 0, label: 'Single-name exposure (ZAR)' },
    book_value_zar: { type: 'number', min: 0, label: 'Book value (ZAR)' },
    underlying_halted: { type: 'boolean', label: 'Underlying halted' },
    partial_halt_flag: { type: 'boolean', label: 'Partial halt' },
    last_mark_at: { type: 'string', label: 'Last mark timestamp' },
    hold_reason: { type: 'string', label: 'Hold/review reason' },
    reject_reason: { type: 'string', label: 'Rejection reason' },
    override_reason: { type: 'string', label: 'Override basis' },
    override_by: { type: 'string', label: 'Override authorised by' },
    notes: { type: 'string', label: 'Notes' },
    // written by derive, never by the client
    order_submitted_at: { type: 'string', label: 'Order submitted at' },
  },

  initial: 'order_submitted',

  states: {
    order_submitted:          { label: 'Order submitted',          terminal: false, holder: 'risk' },
    kyc_verified:              { label: 'KYC verified',             terminal: false, holder: 'risk' },
    credit_line_checked:       { label: 'Credit line checked',      terminal: false, holder: 'risk' },
    settlement_risk_assessed:  { label: 'Settlement risk assessed', terminal: false, holder: 'risk' },
    concentration_checked:     { label: 'Concentration checked',    terminal: false, holder: 'risk' },
    halt_status_verified:      { label: 'Halt status verified',     terminal: false, holder: 'risk' },
    mark_age_validated:        { label: 'Mark age validated',       terminal: false, holder: 'risk' },
    held_for_review:           { label: 'Held for review',          terminal: false, holder: 'compliance' },
    cleared:                   { label: 'Cleared',                  terminal: true,  holder: 'none' },
    manually_cleared:          { label: 'Manually cleared',         terminal: true,  holder: 'none' },
    rejected:                  { label: 'Rejected',                 terminal: true,  holder: 'none' },
    manually_rejected:         { label: 'Manually rejected',        terminal: true,  holder: 'none' },
    archived:                  { label: 'Archived',                 terminal: true,  holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'order_submitted',
      by: ['trader', 'operator'],
      actorBecomes: 'trader',
      label: 'Submit order for pre-trade check',
      intent: 'primary',
      input: {
        order_ref: { type: 'string' },
        counterparty_party: { type: 'party', role: 'counterparty' },
        counterparty_name: { type: 'string', required: true },
        regulator_party: { type: 'party', role: 'regulator' },
        energy_type: { type: 'string' },
        side: { type: 'string' },
        volume_mwh: { type: 'number', min: 0 },
        price_zar_per_mwh: { type: 'number', min: 0 },
        notional_exposure_zar: { type: 'number', min: 0 },
      },
      // trader ≠ counterparty (no self-dealing) + no new commitments under a halt.
      guards: ['counterpartyDistinct', 'complianceHaltClear'],
      derive: (_f, at: Instant) => ({ order_submitted_at: isoUtc(at) }),
    },

    // --- sequential diligence battery: each gate is the only door to the next ---
    {
      id: 'verify_kyc',
      from: 'order_submitted',
      to: 'kyc_verified',
      by: ['risk', 'operator'],
      label: 'Verify KYC',
      intent: 'primary',
      input: { kyc_verified_at: { type: 'string' } },
      guards: [],
      derive: (f, at: Instant) => ({ kyc_verified_at: typeof f.kyc_verified_at === 'string' ? f.kyc_verified_at : isoUtc(at) }),
    },
    {
      id: 'check_credit_line',
      from: 'kyc_verified',
      to: 'credit_line_checked',
      by: ['risk', 'operator'],
      label: 'Check credit line',
      intent: 'primary',
      input: {
        credit_line_used_zar: { type: 'number', min: 0 },
        credit_line_limit_zar: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      id: 'assess_settlement_risk',
      from: 'credit_line_checked',
      to: 'settlement_risk_assessed',
      by: ['risk', 'operator'],
      label: 'Assess settlement risk',
      intent: 'primary',
      input: {
        dvp_pvp_unavailable: { type: 'boolean' },
        currency_mismatch: { type: 'boolean' },
        tenor_days: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      id: 'check_concentration',
      from: 'settlement_risk_assessed',
      to: 'concentration_checked',
      by: ['risk', 'operator'],
      label: 'Check concentration',
      intent: 'primary',
      input: {
        single_name_exposure_zar: { type: 'number', min: 0 },
        book_value_zar: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      id: 'verify_halt_status',
      from: 'concentration_checked',
      to: 'halt_status_verified',
      by: ['risk', 'operator'],
      label: 'Verify halt status',
      intent: 'primary',
      input: {
        underlying_halted: { type: 'boolean' },
        partial_halt_flag: { type: 'boolean' },
      },
      guards: [],
    },
    {
      id: 'validate_mark_age',
      from: 'halt_status_verified',
      to: 'mark_age_validated',
      by: ['risk', 'operator'],
      label: 'Validate mark age',
      intent: 'primary',
      input: { last_mark_at: { type: 'string' } },
      guards: [],
      derive: (f, at: Instant) => ({ last_mark_at: typeof f.last_mark_at === 'string' ? f.last_mark_at : isoUtc(at) }),
    },

    // --- clearance: only reachable once the full battery (or a compliance
    // override) has run — no guard needed, the state graph enforces it ------
    {
      id: 'clear_order',
      from: ['mark_age_validated', 'manually_cleared'],
      to: 'cleared',
      by: ['risk', 'operator'],
      label: 'Clear order',
      intent: 'primary',
      guards: ['complianceHaltClear'],
    },

    // --- compliance interrupts: park or kill an order at any pre-clear gate ---
    {
      id: 'hold_for_review',
      from: ['order_submitted', 'kyc_verified', 'credit_line_checked', 'settlement_risk_assessed', 'concentration_checked', 'halt_status_verified', 'mark_age_validated'],
      to: 'held_for_review',
      by: ['compliance', 'risk', 'operator'],
      label: 'Hold for review',
      intent: 'secondary',
      input: { hold_reason: { type: 'string' } },
      requiresReason: ['borderline_credit', 'sla_at_risk', 'evidence_incomplete', 'escalation_required'],
      guards: [],
    },
    {
      id: 'manually_clear',
      from: 'held_for_review',
      to: 'manually_cleared',
      by: ['compliance', 'operator'],
      label: 'Manually clear',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'manually_reject',
      from: 'held_for_review',
      to: 'manually_rejected',
      by: ['compliance', 'operator'],
      label: 'Manually reject',
      intent: 'destructive',
      input: { reject_reason: { type: 'string' } },
      requiresReason: ['kyc_failure', 'credit_line_breach', 'settlement_risk', 'concentration_breach', 'underlying_halted', 'stale_mark', 'compliance_override'],
      guards: [],
    },
    {
      id: 'reject_order',
      from: ['order_submitted', 'kyc_verified', 'credit_line_checked', 'settlement_risk_assessed', 'concentration_checked', 'halt_status_verified', 'mark_age_validated', 'held_for_review', 'manually_rejected'],
      to: 'rejected',
      by: ['compliance', 'risk', 'operator'],
      label: 'Reject order',
      intent: 'destructive',
      requiresReason: ['kyc_failure', 'credit_line_breach', 'settlement_risk', 'concentration_breach', 'underlying_halted', 'stale_mark', 'compliance_override'],
      guards: [],
    },

    // --- corrective re-clear: senior override on a previously rejected order ---
    {
      id: 'override_rejection',
      from: 'rejected',
      to: 'cleared',
      by: ['compliance', 'operator'],
      label: 'Override rejection',
      intent: 'primary',
      input: {
        override_reason: { type: 'string' },
        override_by: { type: 'string' },
      },
      guards: ['complianceHaltClear'],
    },

    // --- housekeeping: file a decided check to the hard archive ------------
    {
      id: 'archive_check',
      from: ['cleared', 'rejected'],
      to: 'archived',
      by: ['archiver', 'operator'],
      label: 'Archive',
      intent: 'secondary',
      guards: [],
    },
  ],
};
