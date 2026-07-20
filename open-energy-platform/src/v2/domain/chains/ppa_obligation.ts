// ppa_obligation — monthly PPA delivery-obligation lifecycle as data.
//
// Wave 7 (legacy: oe_offtaker_ppa_obligations / offtaker-obligation-spec.ts).
// Each period, the IPP's metered delivery is verified against the contracted
// volume. Meeting the threshold closes the period as `delivered`; falling
// short opens a cure window (`shortfall`) during which either a later
// verified reading self-cures into `delivered`, or the offtaker accepts a
// cure plan (`cured`). A cure window left unresolved lapses into
// `take_or_pay` — the offtaker becomes liable for the deemed-taken shortfall.
//
// Structural honesty (no invented guards):
//  - `take_or_pay` is reachable ONLY from `shortfall` (via escalate_take_or_pay,
//    fired manually or by the cure-window timer) — a period can NEVER be
//    escalated to take-or-pay liability without first having failed the
//    threshold check. No guard needed, the state graph enforces the order.
//  - `open` is guarded by counterpartyDistinct: the offtaker recording the
//    obligation and the IPP counterparty it's measuring must be different
//    legal entities (no self-dealing).
//  - NO complianceHaltClear anywhere: recording a metered reading against an
//    already-executed PPA is a factual record of what happened, not a new
//    commitment — a platform-wide halt must not erase the ability to record
//    delivery or start a cure clock (same stance as take_or_pay.ts).
//
// Simplification vs. the legacy route (offtaker-obligations.ts): a very late
// first-ever reading against a never-verified period could theoretically
// jump straight from `pending` to take-or-pay in the old code. This model
// always routes through `shortfall` first — the cure window is a real grace
// period, not a technicality to skip.
//
// settles:false — this chain measures and records a delivery obligation and
// computes an informational take-or-pay liability figure; it never raises an
// invoice or moves money (R-S5-1). price_zar_per_mwh is often unset at open
// time, mirroring the legacy route's honesty that the real ZAR rate is filled
// downstream by billing, not by this chain.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc, addDuration } from '../time';

const DEFAULT_THRESHOLD_PCT = 95; // % of contracted MWh that must be delivered
const DEFAULT_CURE_WINDOW_DAYS = 14;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const thresholdMwh = (contracted: Json | undefined, pct: Json | undefined): number => {
  const c = typeof contracted === 'number' ? contracted : 0;
  const p = typeof pct === 'number' ? pct : DEFAULT_THRESHOLD_PCT;
  return round2((c * p) / 100);
};

const shortfallMwh = (contracted: Json | undefined, pct: Json | undefined, delivered: Json | undefined): number => {
  const d = typeof delivered === 'number' ? delivered : 0;
  return Math.max(0, round2(thresholdMwh(contracted, pct) - d));
};

const takeOrPayLiability = (
  contracted: Json | undefined,
  pct: Json | undefined,
  delivered: Json | undefined,
  price: Json | undefined,
): number => {
  const d = typeof delivered === 'number' ? delivered : 0;
  const p = typeof price === 'number' ? price : 0;
  return Math.max(0, round2((thresholdMwh(contracted, pct) - d) * p));
};

export const ppaObligation: ChainDecl = {
  key: 'ppa_obligation',
  noun: 'PPA delivery obligation',
  refPrefix: 'PPAO',
  title: (f) =>
    `PPA obligation — ${(f.period_month as string) ?? 'unscheduled period'} (${(f.contracted_mwh as number) ?? 0} MWh contracted)`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's34 PPA take-or-pay term', effect: 'authorises' },
    { instrument: 'NERSA Grid Code', provision: 'metering & settlement code (measured offtake)', effect: 'requires' },
  ],
  roles: ['offtaker', 'ipp', 'operator'],

  fields: {
    period_month: { type: 'string', required: true, label: 'Delivery period (YYYY-MM)' },
    contracted_mwh: { type: 'number', required: true, min: 0, label: 'Contracted volume (MWh)' },
    threshold_pct: { type: 'number', min: 0, max: 100, label: 'Delivery threshold (%)' },
    ipp_party: { type: 'party', role: 'ipp', label: 'IPP / seller' },
    price_zar_per_mwh: { type: 'number', min: 0, label: 'Take-or-pay rate (ZAR/MWh) — informational' },
    delivered_mwh: { type: 'number', min: 0, label: 'Verified delivered volume (MWh)' },
    cure_evidence_ref: { type: 'string', label: 'Cure evidence ref' },
    notes: { type: 'string', label: 'Notes' },
    // written by derive, never by the client
    shortfall_mwh: { type: 'number', label: 'Shortfall (MWh)' },
    cure_deadline_at: { type: 'string', label: 'Cure deadline' },
    take_or_pay_amount_zar: { type: 'number', label: 'Take-or-pay exposure (ZAR) — informational' },
    delivered_at: { type: 'string', label: 'Delivered at' },
    cured_at: { type: 'string', label: 'Cured at' },
    escalated_at: { type: 'string', label: 'Escalated at' },
  },

  initial: 'pending',

  states: {
    pending: { label: 'Pending delivery', terminal: false, holder: 'ipp' },
    shortfall: { label: 'Shortfall — cure window open', terminal: false, holder: 'offtaker', sla: { days: DEFAULT_CURE_WINDOW_DAYS } },
    delivered: { label: 'Delivered', terminal: true, holder: 'none' },
    cured: { label: 'Cured', terminal: true, holder: 'none' },
    take_or_pay: { label: 'Take-or-pay triggered', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'pending',
      by: ['offtaker', 'operator'],
      actorBecomes: 'offtaker',
      label: 'Open monthly obligation',
      intent: 'primary',
      input: {
        period_month: { type: 'string', required: true },
        contracted_mwh: { type: 'number', required: true, min: 0 },
        threshold_pct: { type: 'number', min: 0, max: 100 },
        price_zar_per_mwh: { type: 'number', min: 0 },
        ipp_party: { type: 'party', role: 'ipp' },
      },
      // offtaker ≠ IPP counterparty being measured (no self-dealing).
      guards: ['counterpartyDistinct'],
    },

    // --- verification (self-cure possible from shortfall) ----------------------
    {
      id: 'verify_delivered',
      from: ['pending', 'shortfall'],
      to: 'delivered',
      by: ['offtaker', 'operator'],
      label: 'Verify delivered volume meets threshold',
      intent: 'primary',
      input: { delivered_mwh: { type: 'number', required: true, min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ delivered_at: isoUtc(at) }),
    },
    {
      id: 'verify_shortfall',
      from: 'pending',
      to: 'shortfall',
      by: ['offtaker', 'operator'],
      label: 'Verify delivered volume falls short',
      intent: 'secondary',
      input: { delivered_mwh: { type: 'number', required: true, min: 0 } },
      guards: [],
      derive: (f, at: Instant): Record<string, Json> => ({
        shortfall_mwh: shortfallMwh(f.contracted_mwh, f.threshold_pct, f.delivered_mwh),
        cure_deadline_at: isoUtc(addDuration(at, { days: DEFAULT_CURE_WINDOW_DAYS })),
      }),
    },

    // --- resolving a shortfall ---------------------------------------------------
    {
      id: 'cure',
      from: 'shortfall',
      to: 'cured',
      by: ['offtaker', 'operator'],
      label: 'Accept cure plan',
      intent: 'primary',
      input: {
        cure_evidence_ref: { type: 'string', required: true },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ cured_at: isoUtc(at) }),
    },
    {
      // reachable ONLY from `shortfall`: liability can never attach to a period
      // that hasn't already failed the delivery threshold.
      id: 'escalate_take_or_pay',
      from: 'shortfall',
      to: 'take_or_pay',
      by: ['offtaker', 'operator', 'system'],
      label: 'Escalate to take-or-pay liability',
      intent: 'destructive',
      requiresReason: ['cure_window_expired', 'cure_plan_rejected', 'insufficient_cure_evidence'],
      guards: [],
      derive: (f, at: Instant): Record<string, Json> => ({
        take_or_pay_amount_zar: takeOrPayLiability(f.contracted_mwh, f.threshold_pct, f.delivered_mwh, f.price_zar_per_mwh),
        escalated_at: isoUtc(at),
      }),
    },
  ],

  // cure-window time-bar: a shortfall left uncured past the 14-day grace
  // window (mirrors DEFAULT_CURE_WINDOW_DAYS) escalates to take-or-pay.
  timers: [{ onState: 'shortfall', after: { days: DEFAULT_CURE_WINDOW_DAYS }, fire: 'escalate_take_or_pay', kind: 'time_bar', reason: 'cure_window_expired' }],
};
