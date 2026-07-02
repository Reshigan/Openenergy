// ═══════════════════════════════════════════════════════════════════════════
// Meter-analysis — pure opportunity algorithms on short-term static meter data.
//
// "Connect/import a meter → find the wins." Given a short window of interval
// readings for ONE meter (electricity, water, …), these detect improvement
// opportunities and estimate an annualised ZAR saving. Everything is pure (no
// D1/DO, no clock beyond parsing the reading timestamps) so it unit-tests and the
// numbers are reproducible.
//
// Tiering (product): freeScanSummary() is the free hook (how many wins, rough
// total) — no per-opportunity detail; scanOpportunities() is the paid full report.
// ═══════════════════════════════════════════════════════════════════════════
import type { MeterMedium } from './om-devices';

export type OpportunityCode = 'idle_load' | 'peak_shift' | 'continuous_flow';
export type Confidence = 'low' | 'medium' | 'high';

export interface MeterReading { ts: string; value: number } // value = consumption in the meter's unit for that interval

export interface AnalysisContext {
  medium: MeterMedium;
  unitPriceZar: number;         // R per unit (kWh / kL / …) — the standard/peak rate
  offpeakPriceZar?: number;     // R per unit off-peak (electricity TOU); enables peak_shift
  peakHours?: number[];         // hours-of-day (0–23, UTC) treated as peak
  offHours?: number[];          // hours the site should sit near idle (e.g. overnight)
  expectedIdlePerInterval?: number; // expected consumption per interval during offHours (default 0)
  shiftableFraction?: number;   // fraction of peak load that could move off-peak (default 0.3)
}

export interface Opportunity {
  code: OpportunityCode;
  title: string;
  detail: string;
  estimatedSavingZarYr: number;
  confidence: Confidence;
}

const hourOf = (ts: string): number => new Date(ts).getUTCHours();

/** Days spanned by the series (≥ 1), for annualising a window saving. */
export function daysCovered(series: MeterReading[]): number {
  if (series.length < 2) return 1;
  const t0 = new Date(series[0].ts).getTime();
  const t1 = new Date(series[series.length - 1].ts).getTime();
  const days = (t1 - t0) / 86_400_000;
  return days > 0 ? days : 1;
}

const round = (n: number) => Math.round(n);

// ─── Analyzers — each returns an Opportunity or null (nothing found) ─────────

/** Idle/standby waste: consumption during off-hours above what's expected. */
export function idleLoad(series: MeterReading[], ctx: AnalysisContext, annualFactor: number): Opportunity | null {
  const off = new Set(ctx.offHours ?? []);
  if (off.size === 0) return null;
  const expected = ctx.expectedIdlePerInterval ?? 0;
  let excess = 0, n = 0;
  for (const r of series) {
    if (off.has(hourOf(r.ts))) { excess += Math.max(0, r.value - expected); n++; }
  }
  if (n === 0 || excess <= 0) return null;
  const savingYr = round(excess * ctx.unitPriceZar * annualFactor);
  if (savingYr <= 0) return null;
  return {
    code: 'idle_load', title: 'Cut standby / off-hours load',
    detail: `Off-hours consumption ran above the expected idle level; trimming it saves an estimated R${savingYr.toLocaleString('en-ZA')}/yr.`,
    estimatedSavingZarYr: savingYr, confidence: 'medium',
  };
}

/** TOU arbitrage: shift a fraction of peak-hour load to off-peak. */
export function peakShift(series: MeterReading[], ctx: AnalysisContext, annualFactor: number): Opportunity | null {
  if (ctx.offpeakPriceZar == null || !(ctx.offpeakPriceZar < ctx.unitPriceZar)) return null;
  const peak = new Set(ctx.peakHours ?? []);
  if (peak.size === 0) return null;
  const frac = ctx.shiftableFraction ?? 0.3;
  let peakUnits = 0;
  for (const r of series) if (peak.has(hourOf(r.ts))) peakUnits += Math.max(0, r.value);
  if (peakUnits <= 0) return null;
  const spread = ctx.unitPriceZar - ctx.offpeakPriceZar;
  const savingYr = round(peakUnits * frac * spread * annualFactor);
  if (savingYr <= 0) return null;
  return {
    code: 'peak_shift', title: 'Shift peak load to off-peak',
    detail: `About ${Math.round(frac * 100)}% of peak-hour usage could run off-peak, saving ~R${savingYr.toLocaleString('en-ZA')}/yr at the current tariff spread.`,
    estimatedSavingZarYr: savingYr, confidence: 'low',
  };
}

/** Continuous baseline flow (water): the minimum interval never drops to zero →
 *  a persistent leak/loss the whole window. */
export function continuousFlow(series: MeterReading[], ctx: AnalysisContext, annualFactor: number): Opportunity | null {
  if (ctx.medium !== 'water' || series.length === 0) return null;
  const min = Math.min(...series.map(r => Math.max(0, r.value)));
  if (min <= 0) return null; // it does drop to zero somewhere → no persistent baseline
  const windowUnits = min * series.length; // the baseline present every interval
  const savingYr = round(windowUnits * ctx.unitPriceZar * annualFactor);
  if (savingYr <= 0) return null;
  return {
    code: 'continuous_flow', title: 'Investigate continuous baseline flow',
    detail: `Flow never dropped to zero across the window — a persistent baseline suggests a leak, worth ~R${savingYr.toLocaleString('en-ZA')}/yr if resolved.`,
    estimatedSavingZarYr: savingYr, confidence: 'medium',
  };
}

// ─── Orchestration ───────────────────────────────────────────────────────────

/** Full analysis (paid report): every applicable opportunity, ranked by saving. */
export function scanOpportunities(series: MeterReading[], ctx: AnalysisContext): Opportunity[] {
  const af = 365 / daysCovered(series);
  return [idleLoad(series, ctx, af), peakShift(series, ctx, af), continuousFlow(series, ctx, af)]
    .filter((o): o is Opportunity => o !== null)
    .sort((a, b) => b.estimatedSavingZarYr - a.estimatedSavingZarYr);
}

/** Free scan: count + rough total only, no per-opportunity detail (the hook). */
export function freeScanSummary(opps: Opportunity[]): { count: number; totalEstZarYr: number; topTitle: string | null } {
  return {
    count: opps.length,
    totalEstZarYr: opps.reduce((s, o) => s + o.estimatedSavingZarYr, 0),
    topTitle: opps[0]?.title ?? null,
  };
}
