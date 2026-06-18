// ═══════════════════════════════════════════════════════════════════════════
// Rejection explainer — turns a structured rejection (reason_code + snapshot)
// into a plain-language explanation + 1-2 concrete remediation buttons the
// trader can one-click. Cached by (reason_code, bucketed snapshot) in KV so
// the AI doesn't re-charge for near-identical rejections, and every call
// writes to ai_decisions for the regulator audit pack.
//
// "Subtle but active" pattern: the trader sees a one-line reason inline
// next to the order form, and a `Why this happened →` expander revealing
// the AI explanation + remediations. No popup, no chat panel.
// ═══════════════════════════════════════════════════════════════════════════

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { ask } from './ai';
import { digest, logAiDecision } from './ai-audit';
import type { RejectionCode } from './pre-trade-guards';

export interface Remediation {
  label: string;
  // Action is one of: cancel an existing order, top up collateral, retry the
  // order at a different size/price, ack a halt notice. Free-form so the UI
  // can map to its own buttons.
  action: 'cancel_order' | 'top_up_collateral' | 'retry_with_size' | 'retry_with_price' | 'contact_support' | 'review_open_orders';
  payload?: Record<string, unknown>;
}

export interface RejectionExplanation {
  human_explanation: string;
  suggested_remediations: Remediation[];
  fallback: boolean;
  cached: boolean;
}

interface ExplainerInput {
  reason_code: RejectionCode;
  detail: string;
  participant_id: string;
  side: 'buy' | 'sell';
  energy_type: string;
  volume_mwh: number;
  price_zar_mwh: number | null;
  notional_zar: number;
  snapshot: Record<string, unknown>;
}

const CACHE_PREFIX = 'ai:rejexpl:';
const CACHE_TTL_SECONDS = 24 * 60 * 60;

export async function explainRejection(
  env: { AI?: Parameters<typeof ask>[0]['AI']; DB: D1Database; KV?: KVNamespace },
  input: ExplainerInput,
  rejectionId: string,
): Promise<RejectionExplanation> {
  // 1. Cache key — bucket the snapshot so near-identical rejections share
  //    explanations. Bucketing happens per reason because the meaningful
  //    fields differ (headroom for credit, position for limit, etc.).
  const cacheKeyInput = `${input.reason_code}|${bucketize(input)}`;
  const hash = await digest(cacheKeyInput);
  const cacheKey = `${CACHE_PREFIX}${hash}`;

  if (env.KV) {
    try {
      const cached = await env.KV.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as RejectionExplanation;
        // Still record this consumption — accepted=null until the user clicks.
        await logAiDecision(env.DB, {
          surface: 'rejection_explainer',
          participant_id: input.participant_id,
          intent: 'rejection.explain',
          prompt_hash: hash,
          prompt_summary: `${input.reason_code}: ${input.detail}`,
          response_text: parsed.human_explanation,
          response_json: { remediations: parsed.suggested_remediations },
          model: 'cache',
          fallback: parsed.fallback,
          related_entity_type: 'trade_order_rejections',
          related_entity_id: rejectionId,
        });
        return { ...parsed, cached: true };
      }
    } catch {
      /* KV miss / parse error → fall through to live call */
    }
  }

  // 2. Build a tight prompt. We don't want a chatty LLM — short paragraph,
  //    JSON for the remediations, and a hard cap on tokens.
  const result = await ask(env, {
    intent: 'generic.ask',
    prompt:
      `A trader's order was just rejected by pre-trade risk gating.
Reason code: ${input.reason_code}
Detail: ${input.detail}
Order: ${input.side} ${input.volume_mwh} MWh ${input.energy_type}` +
      (input.price_zar_mwh != null ? ` @ R${input.price_zar_mwh}/MWh (notional R${Math.round(input.notional_zar).toLocaleString('en-ZA')})` : ' (market)') +
      `
Risk snapshot: ${JSON.stringify(input.snapshot)}

Reply ONLY with a JSON object inside a \`\`\`json block:
{
  "human_explanation": "<2 short sentences explaining why this rejected>",
  "suggested_remediations": [
    { "label": "<short imperative button label>", "action": "<one of: cancel_order|top_up_collateral|retry_with_size|retry_with_price|contact_support|review_open_orders>", "payload": { "<field>": <value> } }
  ]
}
Pick at most 2 remediations. Keep labels under 8 words. South African context, ZAR.`,
    max_tokens: 350,
  });

  const parsed = parseExplanationOutput(result.structured, result.text)
    || deterministicFallback(input);

  await logAiDecision(env.DB, {
    surface: 'rejection_explainer',
    participant_id: input.participant_id,
    intent: 'rejection.explain',
    prompt_hash: hash,
    prompt_summary: `${input.reason_code}: ${input.detail}`,
    response_text: parsed.human_explanation,
    response_json: { remediations: parsed.suggested_remediations },
    model: result.model,
    fallback: !!result.fallback,
    related_entity_type: 'trade_order_rejections',
    related_entity_id: rejectionId,
  });

  // Cache best-effort.
  if (env.KV) {
    try {
      await env.KV.put(cacheKey, JSON.stringify({
        ...parsed,
        fallback: !!result.fallback,
        cached: false,
      }), { expirationTtl: CACHE_TTL_SECONDS });
    } catch { /* soft */ }
  }

  return { ...parsed, fallback: !!result.fallback, cached: false };
}

// Coarse bucketing of the snapshot so similar rejections cache together.
// Keep buckets reason-specific so an unrelated stat change doesn't bust the
// cache for, say, a halted instrument.
function bucketize(input: ExplainerInput): string {
  const s = input.snapshot as Record<string, number | string | null | undefined>;
  switch (input.reason_code) {
    case 'CREDIT_HEADROOM_EXCEEDED': {
      const headroom = Number(s.credit_limit_zar || 0) - Number(s.open_exposure_zar || 0);
      const overBy = input.notional_zar - Math.max(0, headroom);
      return `headroom=${roundTo(headroom, 50_000)}|over=${roundTo(overBy, 25_000)}`;
    }
    case 'COLLATERAL_INSUFFICIENT': {
      const free = Number(s.free_collateral_zar || 0);
      return `free=${roundTo(free, 25_000)}|need=${roundTo(input.notional_zar * 0.10, 5_000)}`;
    }
    case 'POSITION_LIMIT_BREACH': {
      return `pos=${roundTo(Number(s.current_position_mwh || 0), 5)}|limit=${roundTo(Number(s.position_limit_mwh || 0), 10)}|side=${input.side}|vol=${roundTo(input.volume_mwh, 5)}`;
    }
    case 'STALE_MARK': {
      return `et=${input.energy_type}|age=${roundTo(Number(s.mark_age_minutes || 0), 30)}`;
    }
    case 'MARKET_CLOSED':
    case 'INSTRUMENT_HALTED':
      return `et=${input.energy_type}|state=${s.market_state}`;
    case 'INVALID_PRICE_BAND': {
      const mark = Number(s.mark_price_zar_mwh || 0);
      return `et=${input.energy_type}|mark=${roundTo(mark, 50)}|px=${roundTo(input.price_zar_mwh || 0, 50)}`;
    }
    case 'POST_ONLY_WOULD_CROSS': {
      const opp = input.side === 'buy' ? Number(s.best_ask_zar_mwh || 0) : Number(s.best_bid_zar_mwh || 0);
      return `et=${input.energy_type}|side=${input.side}|opp=${roundTo(opp, 25)}|px=${roundTo(input.price_zar_mwh || 0, 25)}`;
    }
    case 'REDUCE_ONLY_INCREASES_POSITION': {
      const pos = Number(s.current_position_mwh || 0);
      return `et=${input.energy_type}|side=${input.side}|pos=${roundTo(pos, 5)}|vol=${roundTo(input.volume_mwh, 5)}`;
    }
    case 'FOK_INSUFFICIENT_LIQUIDITY': {
      const liq = Number(s[input.side === 'buy' ? 'ask_liquidity_mwh' : 'bid_liquidity_mwh'] || 0);
      return `et=${input.energy_type}|side=${input.side}|liq=${roundTo(liq, 10)}|vol=${roundTo(input.volume_mwh, 10)}`;
    }
    case 'EXPIRY_REQUIRED':
    case 'EXPIRY_IN_PAST':
    case 'STOP_TRIGGER_REQUIRED':
    case 'INVALID_DISPLAY_SIZE':
    case 'INVALID_VOLUME':
      // These are shape-only failures — the snapshot doesn't move the
      // explanation. One bucket per (code, energy_type) is fine.
      return `et=${input.energy_type}`;
    default:
      return `et=${input.energy_type}`;
  }
}

function roundTo(value: number, bucket: number): number {
  if (!bucket) return value;
  return Math.round(value / bucket) * bucket;
}

function parseExplanationOutput(
  structured: Record<string, unknown> | undefined,
  text: string,
): { human_explanation: string; suggested_remediations: Remediation[] } | null {
  const candidate = structured && typeof structured === 'object' ? structured : safeJson(text);
  if (!candidate) return null;
  const human = typeof candidate.human_explanation === 'string' ? candidate.human_explanation.trim() : '';
  if (!human) return null;
  const rawRecs = Array.isArray(candidate.suggested_remediations) ? candidate.suggested_remediations : [];
  const recs: Remediation[] = [];
  for (const r of rawRecs) {
    if (!r || typeof r !== 'object') continue;
    const rec = r as Record<string, unknown>;
    const label = typeof rec.label === 'string' ? rec.label.trim() : '';
    const action = typeof rec.action === 'string' ? rec.action : '';
    if (!label) continue;
    if (!isKnownAction(action)) continue;
    recs.push({
      label: label.slice(0, 80),
      action,
      payload: rec.payload && typeof rec.payload === 'object' ? rec.payload as Record<string, unknown> : undefined,
    });
    if (recs.length >= 2) break;
  }
  return { human_explanation: human.slice(0, 400), suggested_remediations: recs };
}

function isKnownAction(s: string): s is Remediation['action'] {
  return s === 'cancel_order' || s === 'top_up_collateral' || s === 'retry_with_size'
      || s === 'retry_with_price' || s === 'contact_support' || s === 'review_open_orders';
}

function safeJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const block = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/\{[\s\S]*\}/);
  const candidate = block ? (Array.isArray(block) ? block[1] || block[0] : '') : '';
  if (!candidate) return null;
  try { return JSON.parse(candidate) as Record<string, unknown>; } catch { return null; }
}

// Deterministic fallback when the LLM is unavailable or unhelpful. Each
// reason code maps to a tight one-paragraph explanation + 1-2 remediations
// derived directly from the snapshot we already have. Means the UI never
// has to render an empty "AI couldn't generate an explanation" state.
function deterministicFallback(input: ExplainerInput): { human_explanation: string; suggested_remediations: Remediation[] } {
  const s = input.snapshot as Record<string, number | string | null | undefined>;
  switch (input.reason_code) {
    case 'CREDIT_HEADROOM_EXCEEDED': {
      const headroom = Math.max(0, Number(s.credit_limit_zar || 0) - Number(s.open_exposure_zar || 0));
      const fitVol = headroom > 0 && input.price_zar_mwh
        ? Math.floor((headroom / input.price_zar_mwh) * 10) / 10
        : null;
      const recs: Remediation[] = [];
      if (fitVol && fitVol > 0) {
        recs.push({ label: `Retry at ${fitVol} MWh to fit headroom`, action: 'retry_with_size', payload: { volume_mwh: fitVol } });
      }
      recs.push({ label: 'Review open orders to free credit', action: 'review_open_orders' });
      return {
        human_explanation: `Your free credit headroom is R${Math.round(headroom).toLocaleString('en-ZA')}. This order needs R${Math.round(input.notional_zar).toLocaleString('en-ZA')} of notional, which is more than the credit limit allows.`,
        suggested_remediations: recs,
      };
    }
    case 'COLLATERAL_INSUFFICIENT': {
      const need = input.notional_zar * 0.10;
      const free = Number(s.free_collateral_zar || 0);
      const shortfall = Math.max(0, need - free);
      return {
        human_explanation: `Initial margin for this order is R${Math.round(need).toLocaleString('en-ZA')} (10% of notional). You have R${Math.round(free).toLocaleString('en-ZA')} of free collateral — short by R${Math.round(shortfall).toLocaleString('en-ZA')}.`,
        suggested_remediations: [
          { label: `Top up collateral by R${Math.round(shortfall).toLocaleString('en-ZA')}`, action: 'top_up_collateral', payload: { amount_zar: shortfall } },
          { label: 'Reduce order size to fit collateral', action: 'retry_with_size', payload: { volume_mwh: input.price_zar_mwh ? Math.floor((free / 0.10 / input.price_zar_mwh) * 10) / 10 : 0 } },
        ],
      };
    }
    case 'POSITION_LIMIT_BREACH':
      return {
        human_explanation: `This order would push your net ${input.energy_type} position past the configured limit of ±${s.position_limit_mwh ?? '?'} MWh. Cancel an offsetting order or reduce the size.`,
        suggested_remediations: [
          { label: 'Review open orders', action: 'review_open_orders' },
        ],
      };
    case 'STALE_MARK':
      return {
        human_explanation: `No fresh mark price is available for ${input.energy_type}. Pre-trade risk needs a recent price to size margin — wait for the next mark or contact support if this persists.`,
        suggested_remediations: [
          { label: 'Contact support', action: 'contact_support' },
        ],
      };
    case 'MARKET_CLOSED':
      return {
        human_explanation: 'The market is currently closed for new orders. Try again after the next gate opens.',
        suggested_remediations: [],
      };
    case 'INSTRUMENT_HALTED':
      return {
        human_explanation: `Trading in ${input.energy_type} is currently halted. New orders for this product are blocked until the halt is lifted.`,
        suggested_remediations: [],
      };
    case 'INVALID_PRICE_BAND':
      return {
        human_explanation: `Your price is outside the protective band around the current mark. Either re-price closer to the mark, or contact support if the band setting is wrong.`,
        suggested_remediations: [
          { label: `Retry at mark R${Math.round(Number(s.mark_price_zar_mwh || 0))}`, action: 'retry_with_price', payload: { price_zar_mwh: Number(s.mark_price_zar_mwh || 0) } },
        ],
      };
    case 'COUNTERPARTY_SUSPENDED':
    case 'KYC_INCOMPLETE':
      return {
        human_explanation: 'Your account is not currently authorised to place new orders. KYC may be incomplete or the account is under review.',
        suggested_remediations: [
          { label: 'Contact support', action: 'contact_support' },
        ],
      };
    case 'ALGO_TRADING_BLOCKED':
      return {
        human_explanation: 'Trading on this account is suspended under a regulatory hold — either an algorithmic-trading kill-switch or a market-abuse STOR freeze. New orders are blocked until compliance lifts the hold.',
        suggested_remediations: [
          { label: 'Contact compliance', action: 'contact_support' },
        ],
      };
    case 'MARKET_ACCESS_REQUIRED':
      return {
        human_explanation: 'Your account does not currently have market access, so new orders are blocked. This usually means KYC verification is incomplete or your access has been restricted. Complete verification or contact support to restore trading.',
        suggested_remediations: [
          { label: 'Contact support', action: 'contact_support' },
        ],
      };
    case 'POST_ONLY_WOULD_CROSS': {
      const opp = input.side === 'buy'
        ? Number((input.snapshot as { best_ask_zar_mwh?: number | null }).best_ask_zar_mwh ?? 0)
        : Number((input.snapshot as { best_bid_zar_mwh?: number | null }).best_bid_zar_mwh ?? 0);
      const passive = opp ? (input.side === 'buy' ? opp - 1 : opp + 1) : null;
      return {
        human_explanation: `A post-only ${input.side} can only rest passively. At R${input.price_zar_mwh ?? '?'} it would cross the opposite side at R${opp || '?'} and immediately take liquidity, which post-only forbids.`,
        suggested_remediations: passive
          ? [{
              label: `Re-price to R${passive} to rest passively`,
              action: 'retry_with_price',
              payload: { price_zar_mwh: passive },
            }]
          : [{ label: 'Drop the post-only flag', action: 'review_open_orders' }],
      };
    }
    case 'REDUCE_ONLY_INCREASES_POSITION': {
      const pos = Number((input.snapshot as { current_position_mwh?: number }).current_position_mwh ?? 0);
      return {
        human_explanation: pos === 0
          ? 'Reduce-only orders only make sense when you already hold a position; you are currently flat.'
          : `Reduce-only ${input.side}s on a ${pos > 0 ? 'long' : 'short'} position can only shrink it, but this order would grow or flip it.`,
        suggested_remediations: pos !== 0 && Math.abs(pos) > 0
          ? [{
              label: `Reduce size to ${Math.abs(pos)} MWh to fully flatten`,
              action: 'retry_with_size',
              payload: { volume_mwh: Math.abs(pos) },
            }]
          : [{ label: 'Drop the reduce-only flag', action: 'review_open_orders' }],
      };
    }
    case 'EXPIRY_REQUIRED':
      return {
        human_explanation: 'Good-till-date (GTD) orders must include an explicit expires_at timestamp. Either pick a future time or switch the time-in-force to GTC.',
        suggested_remediations: [
          { label: 'Switch to GTC (good-till-cancelled)', action: 'review_open_orders' },
        ],
      };
    case 'EXPIRY_IN_PAST':
      return {
        human_explanation: `The expiry you chose is at or before the current time, so the order would expire the instant it was placed.`,
        suggested_remediations: [
          { label: 'Pick a future expiry', action: 'review_open_orders' },
        ],
      };
    case 'STOP_TRIGGER_REQUIRED':
      return {
        human_explanation: 'Stop and stop-limit orders need a positive stop_trigger_price — that\'s the level at which the order will activate against the market.',
        suggested_remediations: [
          { label: 'Switch to a plain limit order', action: 'review_open_orders' },
        ],
      };
    case 'FOK_INSUFFICIENT_LIQUIDITY': {
      const liq = Number((input.snapshot as { ask_liquidity_mwh?: number; bid_liquidity_mwh?: number })[input.side === 'buy' ? 'ask_liquidity_mwh' : 'bid_liquidity_mwh'] ?? 0);
      return {
        human_explanation: `Fill-or-kill needs the entire ${input.volume_mwh} MWh to clear in one shot, but only ${liq.toFixed(1)} MWh of opposite-side liquidity is resting on the book.`,
        suggested_remediations: liq > 0
          ? [
              { label: `Reduce size to ${liq.toFixed(1)} MWh`, action: 'retry_with_size', payload: { volume_mwh: liq } },
              { label: 'Switch to IOC (accepts partial fills)', action: 'review_open_orders' },
            ]
          : [{ label: 'Switch to a resting limit order', action: 'review_open_orders' }],
      };
    }
    case 'INVALID_DISPLAY_SIZE':
      return {
        human_explanation: 'The iceberg display size must be greater than zero and at most equal to the total order volume.',
        suggested_remediations: [],
      };
    case 'INVALID_VOLUME':
    default:
      return {
        human_explanation: input.detail || 'The order could not be placed.',
        suggested_remediations: [],
      };
  }
}
