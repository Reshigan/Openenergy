// counterparty_margin — clearing-house counterparty margin-call cycle as data.
//
// A clearing house (role: clearing) computes a margin requirement against a
// counterparty's exposure, ISSUES a call, and the counterparty either POSTS
// collateral or DISPUTES. A disputed call is adjudicated: the clearing house
// either UPHOLDS it (back to margin_called, counterparty must still post) or
// RESOLVES it away (call amended/withdrawn/settled). An unposted call can
// DEFAULT (user-driven, or via the response-deadline time-bar → auto_default).
//
// SETTLEMENT HONESTY (settles:false — RECORD ONLY):
//   This chain moves NO money and holds NO custody. `margin_posted_instructed`
//   is the money-side terminal state and carries the *_instructed suffix on
//   purpose: it RECORDS that collateral was instructed, it does not settle it.
//   There is no Escrow/custody DO behind it. Likewise `defaulted` records a
//   failure-to-post risk event; the actual liquidation/enforcement is out of
//   band. Export always carries the custody notice.
//
// STRUCTURAL GATES (no invented guards — enforced by the state graph):
//   - post_margin's ONLY `from` is `margin_called`: collateral can never be
//     posted before a call has been formally issued. The money-side terminal is
//     therefore only ever reached through a called state.
//   - resolve_dispute / uphold_call ONLY leave `disputed`: a call can only be
//     adjudicated once it has actually been disputed.
//   The one business guard used, counterpartyDistinct, is the ppa_contract
//   pattern (clearing house and counterparty must be different legal entities).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const counterpartyMargin: ChainDecl = {
  key: 'counterparty_margin',
  noun: 'Counterparty margin call',
  refPrefix: 'CMGN',
  title: (f) => `Margin call — ${(f.counterparty_name as string) ?? 'unnamed'} (${(f.margin_requirement_zar as number) ?? 0} ZAR)`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Financial Markets Act 19 of 2012', provision: 's49 clearing-house rules — margin', effect: 'authorises' },
    { instrument: 'CPMI-IOSCO PFMI', provision: 'Principle 6 — margin', effect: 'requires' },
    { instrument: 'ISDA Credit Support Annex', provision: 'variation-margin call', effect: 'requires' },
  ],
  roles: ['clearing', 'counterparty', 'operator'],

  fields: {
    counterparty_name: { type: 'string', required: true, label: 'Counterparty' },
    counterparty_party: { type: 'party', role: 'counterparty', label: 'Counterparty' },
    cycle_ref: { type: 'string', label: 'Margin cycle ref' },
    exposure_zar: { type: 'number', min: 0, label: 'Current exposure (ZAR)' },
    margin_requirement_zar: { type: 'number', required: true, min: 0, label: 'Margin requirement (ZAR)' },
    call_amount_zar: { type: 'number', min: 0, label: 'Call amount (ZAR)' },
    collateral_type: { type: 'string', label: 'Collateral type (cash/govt_bond/lc)' },
    collateral_ref: { type: 'string', label: 'Posted collateral ref' },
    // written by derive, never by the client
    computed_at: { type: 'string', label: 'Requirement computed at' },
    called_at: { type: 'string', label: 'Call issued at' },
    posted_at: { type: 'string', label: 'Collateral posted at' },
    disputed_at: { type: 'string', label: 'Disputed at' },
    resolved_at: { type: 'string', label: 'Dispute resolved at' },
    withdrawn_at: { type: 'string', label: 'Call withdrawn at' },
    defaulted_at: { type: 'string', label: 'Call defaulted at' },
  },

  initial: 'computed',

  states: {
    // NO SETTLEMENT FINALITY — RECORD ONLY (see file header).
    computed: { label: 'Requirement computed', terminal: false, holder: 'clearing', sla: { hours: 4 } },
    margin_called: { label: 'Margin called', terminal: false, holder: 'counterparty', sla: { hours: 24 } },
    disputed: { label: 'Disputed', terminal: false, holder: 'clearing', sla: { hours: 48 } },
    margin_posted_instructed: { label: 'Margin posted (instructed)', terminal: true, holder: 'none' },
    resolved: { label: 'Dispute resolved', terminal: true, holder: 'none' },
    withdrawn: { label: 'Call withdrawn', terminal: true, holder: 'none' },
    defaulted: { label: 'Call defaulted', terminal: true, holder: 'none' },
  },

  transitions: [
    // --- creation -----------------------------------------------------------
    {
      id: 'open',
      from: '@new',
      to: 'computed',
      by: ['clearing', 'operator'],
      actorBecomes: 'clearing',
      label: 'Compute margin requirement',
      intent: 'primary',
      input: {
        counterparty_name: { type: 'string', required: true },
        counterparty_party: { type: 'party', role: 'counterparty' },
        cycle_ref: { type: 'string' },
        exposure_zar: { type: 'number', min: 0 },
        margin_requirement_zar: { type: 'number', required: true, min: 0 },
      },
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ computed_at: isoUtc(at) }),
    },

    // --- call cycle ---------------------------------------------------------
    {
      id: 'issue_call',
      from: 'computed',
      to: 'margin_called',
      by: ['clearing', 'operator'],
      label: 'Issue margin call',
      intent: 'primary',
      input: {
        call_amount_zar: { type: 'number', required: true, min: 0 },
        collateral_type: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ called_at: isoUtc(at) }),
    },
    {
      // structural money gate: the ONLY edge into the money-side terminal, and it
      // can only fire from margin_called. Collateral cannot be posted before a
      // call is issued. RECORD ONLY — no custody, no settlement finality.
      id: 'post_margin',
      from: 'margin_called',
      to: 'margin_posted_instructed',
      by: ['counterparty', 'operator'],
      label: 'Post collateral (record only)',
      intent: 'primary',
      input: {
        collateral_ref: { type: 'string', required: true },
        collateral_type: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ posted_at: isoUtc(at) }),
    },

    // --- dispute loop -------------------------------------------------------
    {
      id: 'dispute',
      from: 'margin_called',
      to: 'disputed',
      by: ['counterparty', 'operator'],
      label: 'Dispute call',
      intent: 'destructive',
      requiresReason: ['valuation_dispute', 'exposure_dispute', 'eligible_collateral_dispute', 'duplicate_call', 'stale_mark'],
      guards: [],
      derive: (_f, at: Instant) => ({ disputed_at: isoUtc(at) }),
    },
    {
      // uphold: the call stands — back to margin_called so the counterparty must
      // still post. Structural: only reachable from disputed.
      id: 'uphold_call',
      from: 'disputed',
      to: 'margin_called',
      by: ['clearing', 'operator'],
      label: 'Uphold call',
      intent: 'primary',
      requiresReason: ['call_upheld', 'call_amended'],
      guards: [],
      derive: (_f, at: Instant) => ({ called_at: isoUtc(at) }),
    },
    {
      id: 'resolve_dispute',
      from: 'disputed',
      to: 'resolved',
      by: ['clearing', 'operator'],
      label: 'Resolve dispute',
      intent: 'primary',
      requiresReason: ['call_withdrawn', 'mutual_agreement', 'settled_off_platform'],
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'withdraw_call',
      from: ['computed', 'margin_called', 'disputed'],
      to: 'withdrawn',
      by: ['clearing', 'operator'],
      label: 'Withdraw call',
      intent: 'destructive',
      requiresReason: ['exposure_reduced', 'recomputed_lower', 'netting_applied', 'error_correction'],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
    {
      id: 'call_defaulted',
      from: 'margin_called',
      to: 'defaulted',
      by: ['clearing', 'operator'],
      label: 'Record default',
      intent: 'destructive',
      requiresReason: ['non_payment', 'insufficient_collateral', 'counterparty_insolvency'],
      guards: [],
      derive: (_f, at: Instant) => ({ defaulted_at: isoUtc(at) }),
    },
    // time-bar path: an unposted call past its response deadline auto-defaults.
    {
      id: 'auto_default',
      from: 'margin_called',
      to: 'defaulted',
      by: ['system'],
      label: 'Auto-default (deadline lapsed)',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ defaulted_at: isoUtc(at) }),
    },
  ],

  // response-deadline time-bar: a call left unposted stales into default. record-
  // only stub; the sweep computes the real bar off the margin_called sla hours
  // (ppa_contract pattern).
  timers: [{ onState: 'margin_called', after: { hours: 0 }, fire: 'auto_default', kind: 'time_bar' }],
};
