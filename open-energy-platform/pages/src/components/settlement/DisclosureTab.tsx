// ═══════════════════════════════════════════════════════════════════════════
// DisclosureTab — Wave 3 CPMI-IOSCO PFMI monthly disclosure surface.
//
// Bloomberg-density layout:
//   • Top strip: as-of date + Cover-1 verdict pill + Compute / Publish actions.
//   • KPI row: margin coverage / liquidity ratio / default-fund coverage /
//     settlement finality (Cover-1 thresholds annotated).
//   • Middle: rolling snapshot history table.
//   • Bottom: inline AI summary card (regulator-friendly narrative).
// ═══════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

type Snapshot = {
  id: string;
  as_of_date: string;
  initial_margin_total_zar: number;
  variation_margin_total_zar: number;
  margin_coverage_pct: number;
  qualifying_liquid_resources_zar: number;
  largest_member_exposure_zar: number;
  liquidity_coverage_ratio: number;
  default_fund_balance_zar: number;
  default_fund_required_zar: number;
  default_fund_coverage_ratio: number;
  ccp_capital_zar: number;
  ccp_capital_skin_in_game_zar: number;
  settlement_finality_pct: number;
  failed_instruction_count: number;
  active_member_count: number;
  published: 0 | 1;
  published_at: string | null;
  published_by: string | null;
  breaches?: { code: string; severity: 'low' | 'medium' | 'high' | 'critical'; detail: string }[];
};

type ListRow = Pick<Snapshot, 'id' | 'as_of_date' | 'margin_coverage_pct' | 'liquidity_coverage_ratio' | 'default_fund_coverage_ratio' | 'settlement_finality_pct' | 'published' | 'published_at'>;

const ZAR = (n: number) => `R${Math.round(Math.abs(n || 0)).toLocaleString('en-ZA')}`;
const pct = (n: number) => `${(n || 0).toFixed(2)}%`;
const ratio = (n: number) => (n || 0).toFixed(3);

const COVER1_THRESHOLDS = {
  margin_coverage_pct: 100,
  liquidity_coverage_ratio: 1.0,
  default_fund_coverage_ratio: 1.0,
  settlement_finality_pct: 99.5,
};

export function DisclosureTab() {
  const { user } = useAuth();
  const [current, setCurrent] = useState<Snapshot | null>(null);
  const [list, setList] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'compute' | 'publish' | 'ai' | null>(null);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  const canCompute = user?.role === 'admin' || user?.role === 'support';
  const canPublish = user?.role === 'admin' || user?.role === 'regulator';

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [c, l] = await Promise.all([
        api.get('/clearing/disclosure/current'),
        api.get('/clearing/disclosure/list'),
      ]);
      setCurrent(c.data?.data || null);
      setList(l.data?.data || []);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'Failed to load disclosure');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const compute = async () => {
    setBusy('compute');
    setErr(null);
    try {
      await api.post('/clearing/disclosure/compute', {});
      await refresh();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to compute');
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    if (!current) return;
    setBusy('publish');
    setErr(null);
    try {
      await api.post(`/clearing/disclosure/${current.id}/publish`, {});
      await refresh();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to publish');
    } finally {
      setBusy(null);
    }
  };

  const askAi = async () => {
    setBusy('ai');
    setAiSummary('');
    try {
      const r = await api.post('/ai/clearing/disclosure-summary', {});
      setAiSummary(r.data?.data?.summary || '');
    } catch (e: any) {
      setAiSummary(`AI assist unavailable: ${e?.response?.data?.error || e?.message || 'error'}`);
    } finally {
      setBusy(null);
    }
  };

  const cover1Pass = useMemo(() => {
    if (!current) return null;
    return (
      current.margin_coverage_pct >= COVER1_THRESHOLDS.margin_coverage_pct &&
      current.liquidity_coverage_ratio >= COVER1_THRESHOLDS.liquidity_coverage_ratio &&
      current.default_fund_coverage_ratio >= COVER1_THRESHOLDS.default_fund_coverage_ratio &&
      current.settlement_finality_pct >= COVER1_THRESHOLDS.settlement_finality_pct
    );
  }, [current]);

  return (
    <div className="space-y-4" data-testid="disclosure-tab">
      {/* Top strip — as-of + verdict + actions */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-[#c2873a] text-white rounded-lg">
        <div className="flex-1 min-w-[180px]">
          <div className="text-[10px] uppercase tracking-wider text-[#7a90a8]">As of</div>
          <div className="text-[20px] font-semibold mt-1">{current?.as_of_date || '—'}</div>
        </div>
        <div className="min-w-[160px]">
          <div className="text-[10px] uppercase tracking-wider text-[#7a90a8]">Cover-1 verdict</div>
          {cover1Pass === null ? (
            <span className="inline-block mt-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-[#f8fafc]0">—</span>
          ) : cover1Pass ? (
            <span className="inline-block mt-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-green-600" data-testid="disclosure-cover1-pass">PASS</span>
          ) : (
            <span className="inline-block mt-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-red-600" data-testid="disclosure-cover1-fail">FAIL</span>
          )}
        </div>
        <div className="min-w-[140px]">
          <div className="text-[10px] uppercase tracking-wider text-[#7a90a8]">Status</div>
          <div className="mt-1 text-[13px]">
            {current?.published
              ? <span className="px-2 py-0.5 rounded-full bg-[#c2873a] text-white">Published</span>
              : <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white">Unpublished</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {canCompute && (
            <button type="button"
              onClick={() => void compute()}
              disabled={busy === 'compute'}
              className="px-3 py-1.5 bg-[#16273e] border border-[#2c4868] rounded text-[13px] hover:bg-[#1f3858] disabled:opacity-50"
              data-testid="disclosure-compute"
            >
              {busy === 'compute' ? 'Computing…' : 'Compute'}
            </button>
          )}
          {canPublish && current && !current.published && (
            <button type="button"
              onClick={() => void publish()}
              disabled={busy === 'publish'}
              className="px-3 py-1.5 bg-[#c2873a] rounded text-[13px] hover:bg-[#a3702f] disabled:opacity-50"
              data-testid="disclosure-publish"
            >
              {busy === 'publish' ? 'Publishing…' : 'Publish'}
            </button>
          )}
        </div>
      </div>

      {err && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{err}</div>}

      {/* KPI grid */}
      {current && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="disclosure-kpis">
          <Kpi label="Margin coverage" value={pct(current.margin_coverage_pct)} threshold={`≥ ${COVER1_THRESHOLDS.margin_coverage_pct}%`} pass={current.margin_coverage_pct >= COVER1_THRESHOLDS.margin_coverage_pct} />
          <Kpi label="Liquidity ratio" value={ratio(current.liquidity_coverage_ratio)} threshold={`≥ ${COVER1_THRESHOLDS.liquidity_coverage_ratio.toFixed(2)}`} pass={current.liquidity_coverage_ratio >= COVER1_THRESHOLDS.liquidity_coverage_ratio} />
          <Kpi label="Default-fund coverage" value={ratio(current.default_fund_coverage_ratio)} threshold={`≥ ${COVER1_THRESHOLDS.default_fund_coverage_ratio.toFixed(2)}`} pass={current.default_fund_coverage_ratio >= COVER1_THRESHOLDS.default_fund_coverage_ratio} />
          <Kpi label="Finality" value={pct(current.settlement_finality_pct)} threshold={`≥ ${COVER1_THRESHOLDS.settlement_finality_pct}%`} pass={current.settlement_finality_pct >= COVER1_THRESHOLDS.settlement_finality_pct} />
        </div>
      )}

      {/* Detail strip */}
      {current && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px] bg-white border border-ionex-border-100 rounded-xl p-4">
          <Cell label="Initial margin" value={ZAR(current.initial_margin_total_zar)} />
          <Cell label="Variation margin" value={ZAR(current.variation_margin_total_zar)} />
          <Cell label="QLR" value={ZAR(current.qualifying_liquid_resources_zar)} />
          <Cell label="Largest member" value={ZAR(current.largest_member_exposure_zar)} />
          <Cell label="DF balance" value={ZAR(current.default_fund_balance_zar)} />
          <Cell label="DF required" value={ZAR(current.default_fund_required_zar)} />
          <Cell label="CCP capital" value={ZAR(current.ccp_capital_zar)} />
          <Cell label="SITG" value={ZAR(current.ccp_capital_skin_in_game_zar)} />
          <Cell label="Failed instructions" value={String(current.failed_instruction_count)} />
          <Cell label="Active members" value={String(current.active_member_count)} />
          {current.published_at && <Cell label="Published" value={new Date(current.published_at).toLocaleDateString()} />}
          {current.published_by && <Cell label="By" value={current.published_by} />}
        </div>
      )}

      {/* Breach surface */}
      {current?.breaches && current.breaches.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3" data-testid="disclosure-breaches">
          <div className="text-[11px] uppercase tracking-wide font-semibold text-red-700 mb-2">Breaches</div>
          <ul className="space-y-1 text-[12px] text-red-900">
            {current.breaches.map((b, i) => (
              <li key={i}>
                <span className={`inline-block mr-2 px-1.5 py-0.5 rounded uppercase text-[9px] font-semibold ${b.severity === 'critical' ? 'bg-red-700 text-white' : b.severity === 'high' ? 'bg-red-500 text-white' : b.severity === 'medium' ? 'bg-amber-500 text-white' : 'bg-gray-300'}`}>
                  {b.severity}
                </span>
                <span className="font-mono text-[10px] mr-2">{b.code}</span>
                {b.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Snapshot history */}
      <div className="rounded-xl border border-ionex-border-100 bg-white overflow-hidden" data-testid="disclosure-table">
        <div className="px-4 py-2 border-b border-ionex-border-100 text-[11px] uppercase tracking-wide font-semibold text-ionex-text-mute">
          Monthly snapshots
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#f8fafc] text-left text-xs uppercase text-ionex-text-mute">
            <tr>
              <th className="px-4 py-2">As of</th>
              <th className="px-4 py-2">Margin %</th>
              <th className="px-4 py-2">Liquidity</th>
              <th className="px-4 py-2">DF coverage</th>
              <th className="px-4 py-2">Finality %</th>
              <th className="px-4 py-2">Published</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-ionex-text-mute">Loading…</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-ionex-text-mute">No snapshots yet.</td></tr>
            ) : list.map(r => (
              <tr key={r.id} className="border-t border-ionex-border-100 hover:bg-[#eef2f7]">
                <td className="px-4 py-2 font-medium">{r.as_of_date}</td>
                <td className="px-4 py-2">{pct(r.margin_coverage_pct)}</td>
                <td className="px-4 py-2">{ratio(r.liquidity_coverage_ratio)}</td>
                <td className="px-4 py-2">{ratio(r.default_fund_coverage_ratio)}</td>
                <td className="px-4 py-2">{pct(r.settlement_finality_pct)}</td>
                <td className="px-4 py-2">
                  {r.published
                    ? <span className="px-2 py-0.5 rounded-full text-[10px]" style={{ background: 'oklch(0.94 0.006 250)', color: 'oklch(0.46 0.16 55)' }}>{r.published_at ? new Date(r.published_at).toLocaleDateString() : '✓'}</span>
                    : <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px]">draft</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* AI summary card */}
      <div className="rounded-xl border border-ionex-border-100 bg-white p-4" data-testid="disclosure-ai-card">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-wide font-semibold text-ionex-text-mute">AI summary</div>
          <button type="button"
            onClick={() => void askAi()}
            disabled={busy === 'ai' || !current}
            className="px-3 py-1 text-[12px] bg-ionex-brand text-white rounded hover:bg-ionex-brand-light disabled:opacity-50"
            data-testid="disclosure-ai-button"
          >
            {busy === 'ai' ? 'Asking…' : 'Generate'}
          </button>
        </div>
        <div className="text-[13px] text-[#1e2a38] whitespace-pre-wrap min-h-[60px]">
          {aiSummary || (
            <span className="text-ionex-text-mute italic">
              Click "Generate" for a regulator-grade narrative summary of this month's PFMI metrics, Cover-1 verdict, and notable changes vs. prior periods.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, threshold, pass }: { label: string; value: string; threshold: string; pass: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${pass ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      <div className="text-[10px] uppercase tracking-wide text-ionex-text-mute">{label}</div>
      <div className={`mt-1 text-[20px] font-bold ${pass ? 'text-green-900' : 'text-red-900'}`}>{value}</div>
      <div className="text-[10px] text-ionex-text-mute mt-1">{threshold}</div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-ionex-text-mute">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}
