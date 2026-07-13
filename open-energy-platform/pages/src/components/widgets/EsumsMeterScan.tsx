// ════════════════════════════════════════════════════════════════════════
// EsumsMeterScan — ad-hoc "import a meter, find the wins" surface.
//
// The standalone counterpart to EsumsOmOpportunities (which scans onboarded
// fleet sites): paste a short static window of interval readings for ONE meter
// — no site onboarding — and POST /api/om/meter-scan runs the pure
// meter-analysis core. Free scan returns count + rough total (the hook); the
// full report returns every opportunity with detail. Every number is
// rule-derived arithmetic, no LLM inference.
// ════════════════════════════════════════════════════════════════════════

import React, { useMemo, useState } from 'react';
import { Sparkles, Gauge, Clock, Droplet, TrendingUp, Lock, Upload } from 'lucide-react';
import { api } from '../../lib/api';

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

type Medium = 'electricity' | 'water' | 'waste' | 'gas' | 'heat' | 'fuel';
const MEDIA: { key: Medium; label: string; unit: string }[] = [
  { key: 'electricity', label: 'Electricity', unit: 'kWh' },
  { key: 'water', label: 'Water', unit: 'kL' },
  { key: 'waste', label: 'Waste', unit: 'kg' },
  { key: 'gas', label: 'Gas', unit: 'm³' },
  { key: 'heat', label: 'Heat', unit: 'kWh_th' },
  { key: 'fuel', label: 'Fuel', unit: 'L' },
];

type Opportunity = {
  code: 'idle_load' | 'peak_shift' | 'continuous_flow';
  title: string;
  detail: string;
  estimatedSavingZarYr: number;
  confidence: 'low' | 'medium' | 'high';
};
type ScanData = { tier: 'scan' | 'full'; medium: Medium; unit: string; count: number; totalEstZarYr: number; topTitle: string | null; opportunities?: Opportunity[] };

const OPP_META: Record<string, { icon: React.ComponentType<{ size?: number }>; tone: string }> = {
  idle_load:       { icon: Gauge,   tone: 'widget-tone-amber' },
  peak_shift:      { icon: Clock,   tone: 'widget-tone-info' },
  continuous_flow: { icon: Droplet, tone: 'widget-tone-bad' },
};
const CONF_TONE: Record<string, string> = { low: 'widget-tone-amber', medium: 'widget-tone-info', high: 'widget-tone-good' };

// CSV → readings. One "ts,value" per line; a non-numeric second cell (header) is skipped.
function parseReadings(csv: string): { ts: string; value: number }[] {
  const out: { ts: string; value: number }[] = [];
  for (const line of csv.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const [ts, val] = t.split(',').map((s) => s.trim());
    const value = Number(val);
    if (!ts || Number.isNaN(value)) continue; // skips header row / blank cells
    out.push({ ts, value });
  }
  return out;
}

const parseHours = (s: string): number[] =>
  s.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 0 && n <= 23);

export function EsumsMeterScan() {
  const [medium, setMedium] = useState<Medium>('electricity');
  const [unitPrice, setUnitPrice] = useState('2.20');
  const [offpeak, setOffpeak] = useState('');
  const [peakHours, setPeakHours] = useState('17,18,19,20');
  const [offHours, setOffHours] = useState('0,1,2,3,4');
  const [csv, setCsv] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState<'scan' | 'full' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ScanData | null>(null);

  const readings = useMemo(() => parseReadings(csv), [csv]);
  const unit = MEDIA.find((m) => m.key === medium)!.unit;

  const run = async (tier: 'scan' | 'full') => {
    setErr(null);
    if (readings.length < 2) { setErr('Paste at least 2 readings (one "timestamp,value" per line).'); return; }
    if (!(Number(unitPrice) > 0)) { setErr('Enter a unit price greater than 0.'); return; }
    setBusy(tier);
    try {
      const body: Record<string, unknown> = { medium, unitPriceZar: Number(unitPrice), readings, tier };
      if (Number(offpeak) > 0) body.offpeakPriceZar = Number(offpeak);
      if (peakHours.trim()) body.peakHours = parseHours(peakHours);
      if (offHours.trim()) body.offHours = parseHours(offHours);
      const r = await api.post('/om/meter-scan', body);
      setResult(r.data?.data || null);
    } catch (e: any) {
      setErr(e?.message || 'Scan failed.');
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-3">
      {/* div, not <header>: meridian.css styles the bare header element as the
          chrome's flex row, which would lay the eyebrow/title/copy side-by-side. */}
      <div className="rounded-xl border p-5" style={{ background: 'var(--s1, oklch(0.99 0.002 80))', borderColor: 'var(--border-subtle, oklch(0.88 0.006 250))' }}>
        <div className="text-[10px] uppercase tracking-[0.12em] font-mono font-semibold inline-flex items-center gap-1" style={{ color: 'var(--ink-2, oklch(0.55 0.008 250))' }}>
          <Sparkles size={10} /> Meter analysis · import a meter, find the wins
        </div>
        <h1 className="font-display text-[20px] font-bold tracking-tight mt-0.5" style={{ color: 'var(--ink, oklch(0.15 0.025 250))' }}>
          Opportunity scan
        </h1>
        <p className="text-[12px] mt-0.5 max-w-[70ch]" style={{ color: 'var(--ink-2, oklch(0.45 0.015 250))' }}>
          Paste a short window of interval readings for any meter — electricity, water, gas and more. The scan runs
          deterministic algorithms (standby load, time-of-use shift, continuous flow) and estimates the annual saving.
          The free scan shows how many wins and the rough total; the full report itemises each one with its evidence.
        </p>
      </div>

      <section className="widget-card p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="widget-kpi-label">Meter type</span>
            <select value={medium} onChange={(e) => setMedium(e.target.value as Medium)}
              className="mt-1 w-full h-9 px-2 rounded-md border text-[13px] bg-surface-v2" style={{ borderColor: 'var(--border-subtle, oklch(0.88 0.006 250))' }}>
              {MEDIA.map((m) => <option key={m.key} value={m.key}>{m.label} ({m.unit})</option>)}
            </select>
          </label>
          <label className="block">
            <span className="widget-kpi-label">Unit price (R per {unit})</span>
            <input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} inputMode="decimal"
              className="mt-1 w-full h-9 px-2 rounded-md border text-[13px]" style={{ borderColor: 'var(--border-subtle, oklch(0.88 0.006 250))' }} />
          </label>
        </div>

        <button type="button" onClick={() => setAdvanced((v) => !v)}
          className="text-[11px] font-semibold text-[oklch(0.46_0.16_55)] hover:underline">
          {advanced ? '− Hide' : '+ Show'} time-of-use options
        </button>
        {advanced && (
          <div className="grid gap-3 sm:grid-cols-3 rounded-md p-3" style={{ background: 'var(--s1, #fafbfd)' }}>
            <label className="block">
              <span className="widget-kpi-label">Off-peak price (R per {unit})</span>
              <input value={offpeak} onChange={(e) => setOffpeak(e.target.value)} inputMode="decimal" placeholder="e.g. 1.10"
                className="mt-1 w-full h-9 px-2 rounded-md border text-[13px]" style={{ borderColor: 'var(--border-subtle, oklch(0.88 0.006 250))' }} />
            </label>
            <label className="block">
              <span className="widget-kpi-label">Peak hours (0–23)</span>
              <input value={peakHours} onChange={(e) => setPeakHours(e.target.value)} placeholder="17,18,19,20"
                className="mt-1 w-full h-9 px-2 rounded-md border text-[13px]" style={{ borderColor: 'var(--border-subtle, oklch(0.88 0.006 250))' }} />
            </label>
            <label className="block">
              <span className="widget-kpi-label">Idle hours (0–23)</span>
              <input value={offHours} onChange={(e) => setOffHours(e.target.value)} placeholder="0,1,2,3,4"
                className="mt-1 w-full h-9 px-2 rounded-md border text-[13px]" style={{ borderColor: 'var(--border-subtle, oklch(0.88 0.006 250))' }} />
            </label>
          </div>
        )}

        <label className="block">
          <span className="widget-kpi-label inline-flex items-center gap-1"><Upload size={11} /> Readings — one "timestamp,value" per line</span>
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} spellCheck={false}
            placeholder={`2026-06-01T00:00:00Z,4.2\n2026-06-01T01:00:00Z,4.1\n2026-06-01T18:00:00Z,31.7\n…`}
            className="mt-1 w-full px-2 py-2 rounded-md border text-[12px] font-mono" style={{ borderColor: 'var(--border-subtle, oklch(0.88 0.006 250))' }} />
          <span className="text-[11px]" style={{ color: 'var(--ink-2, oklch(0.55 0.008 250))' }}>
            {readings.length} reading{readings.length === 1 ? '' : 's'} parsed · timestamps ISO 8601 · values in {unit}
          </span>
        </label>

        {err && <div className="text-[12px] widget-tone-bad-text font-medium">{err}</div>}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => run('scan')} disabled={busy !== null}
            className="h-9 px-4 rounded-md bg-[#c2873a] hover:bg-[#a3702f] text-white text-[12px] font-semibold disabled:opacity-50">
            {busy === 'scan' ? 'Scanning…' : 'Run free scan'}
          </button>
        </div>
      </section>

      {result && (result.tier === 'scan'
        ? (
          <section className="widget-card p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="widget-kpi-label">Free scan</div>
                <div className="font-display text-[22px] font-bold tracking-tight" style={{ color: 'var(--ink, oklch(0.15 0.025 250))' }}>
                  {result.count} opportunit{result.count === 1 ? 'y' : 'ies'} found
                </div>
                <div className="text-[13px] mt-0.5" style={{ color: 'var(--ink-2, oklch(0.45 0.015 250))' }}>
                  Estimated <span className="font-mono font-bold widget-tone-good-text" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatZAR(result.totalEstZarYr)}</span>/yr in total upside
                  {result.topTitle && <> · top win: <strong>{result.topTitle}</strong></>}
                </div>
              </div>
              {result.count > 0 && (
                <button type="button" onClick={() => run('full')} disabled={busy !== null}
                  className="h-9 px-4 rounded-md bg-[var(--ink, #0f1c2e)] hover:bg-[#1b2b40] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
                  <Lock size={12} /> {busy === 'full' ? 'Preparing…' : 'Get full report'}
                </button>
              )}
            </div>
            {result.count === 0 && (
              <p className="text-[12px] mt-3" style={{ color: 'var(--ink-2, oklch(0.45 0.015 250))' }}>
                No improvement opportunities detected in this window — the meter looks well-optimised.
              </p>
            )}
          </section>
        )
        : (
          <section className="widget-card">
            <div className="px-4 py-3 border-b border-[var(--s2, #eef2f7)] flex items-center justify-between">
              <div className="text-[13px] font-semibold text-[var(--ink, #0f1c2e)]">
                Full report · {result.count} opportunit{result.count === 1 ? 'y' : 'ies'}
              </div>
              <div className="text-[13px] font-mono font-bold widget-tone-good-text" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatZAR(result.totalEstZarYr)}/yr
              </div>
            </div>
            <ul className="divide-y divide-[var(--s2, #eef2f7)]">
              {(result.opportunities || []).map((o, i) => {
                const meta = OPP_META[o.code] || { icon: TrendingUp, tone: 'widget-tone-info' };
                const Icon = meta.icon;
                return (
                  <li key={i} className="p-4 hover:bg-[var(--s1, #fafbfd)]">
                    <div className="flex items-start gap-3">
                      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-md ${meta.tone}`}><Icon size={16} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-[13px] font-semibold text-[var(--ink, #0f1c2e)]">{o.title}</div>
                          <div className="text-right whitespace-nowrap">
                            <div className="widget-kpi-label">Est. saving</div>
                            <div className="text-[15px] font-mono font-bold widget-tone-good-text" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatZAR(o.estimatedSavingZarYr)}/yr</div>
                          </div>
                        </div>
                        <div className="text-[12px] text-[var(--ink-2, #3d4756)] mt-0.5">{o.detail}</div>
                        <div className="mt-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${CONF_TONE[o.confidence]} font-semibold`}>{o.confidence} confidence</span>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}
