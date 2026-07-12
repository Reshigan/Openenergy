// Article 6 ITMO Corresponding-Adjustment Ledger — Wave 4 P6-grade tab for the
// Carbon workstation. Surfaces:
//   • KPI strip: total adjustments / cleared / pending / blocked tCO₂e
//   • Ledger table (status pill, host→ben, registry, tCO₂e, lifecycle date)
//   • Row drill-down: double-counting risk, transition button to next state
//   • Country routing panel (read-only; full CRUD in admin surface)
//
// Roles: admin/support/carbon/regulator can read; the action buttons are
// gated server-side, so the UI shows them to everyone and surfaces the 403
// as a toast if pressed by a non-eligible role.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type CaStatus = 'draft' | 'dffe_pending' | 'dffe_cleared' | 'unfccc_ledger' | 'blocked';

interface Adjustment {
  id: string;
  retirement_id: string;
  certificate_id: string | null;
  host_country_iso: string;
  beneficiary_country_iso: string;
  tco2e: number;
  vintage_year: number | null;
  registry: string;
  serial_range: string | null;
  registry_uri: string | null;
  article_6_track: '6.2' | '6.4' | 'voluntary_oc' | 'paris_only';
  ca_status: CaStatus;
  dffe_submitted_at: string | null;
  dffe_clearance_at: string | null;
  unfccc_posted_at: string | null;
  blocked_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface RiskAssessment {
  risk: 'low' | 'medium' | 'high';
  reasons: string[];
}

interface CountryRouting {
  country_iso: string;
  country_name: string;
  ndc_authority: string | null;
  article_6_track: '6.2' | '6.4' | 'paris_only' | 'non_party' | 'unknown';
  registry_url_pattern: string | null;
  active: number;
}

const STATUS_TONE: Record<CaStatus, { bg: string; fg: string; label: string }> = {
  draft: { bg: 'var(--s2, #f0f3f7)', fg: 'var(--ink-2, #445566)', label: 'Draft' },
  dffe_pending: { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'DFFE pending' },
  dffe_cleared: { bg: 'color-mix(in oklab, var(--warn) 18%, var(--s1))', fg: 'var(--warn)', label: 'DFFE cleared' },
  unfccc_ledger: { bg: 'color-mix(in oklab, var(--good) 15%, var(--s1))', fg: 'var(--good, #1f6b3a)', label: 'UNFCCC ledger' },
  blocked: { bg: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', fg: 'var(--bad, #9b1f1f)', label: 'Blocked' },
};

const RISK_TONE: Record<RiskAssessment['risk'], { bg: string; fg: string }> = {
  low: { bg: 'color-mix(in oklab, var(--good) 15%, var(--s1))', fg: 'var(--good, #1f6b3a)' },
  medium: { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: '#a06200' },
  high: { bg: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', fg: 'var(--bad, #9b1f1f)' },
};

export function Article6Tab() {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [routing, setRouting] = useState<CountryRouting[]>([]);
  const [filter, setFilter] = useState<CaStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drillId, setDrillId] = useState<string | null>(null);
  const [drillRisk, setDrillRisk] = useState<RiskAssessment | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [adjRes, rtRes] = await Promise.all([
        api.get<{ data: Adjustment[] }>('/carbon/article-6'),
        api.get<{ data: CountryRouting[] }>('/carbon/article-6/country-routing'),
      ]);
      setAdjustments(adjRes.data?.data || []);
      setRouting(rtRes.data?.data || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load Article 6 ledger.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => filter === 'all' ? adjustments : adjustments.filter((a) => a.ca_status === filter),
    [filter, adjustments],
  );

  const kpis = useMemo(() => {
    const total = adjustments.reduce((s, a) => s + Number(a.tco2e || 0), 0);
    const cleared = adjustments
      .filter((a) => a.ca_status === 'unfccc_ledger')
      .reduce((s, a) => s + Number(a.tco2e || 0), 0);
    const pending = adjustments
      .filter((a) => ['dffe_pending', 'dffe_cleared', 'draft'].includes(a.ca_status))
      .reduce((s, a) => s + Number(a.tco2e || 0), 0);
    const blocked = adjustments
      .filter((a) => a.ca_status === 'blocked')
      .reduce((s, a) => s + Number(a.tco2e || 0), 0);
    return { total, cleared, pending, blocked, count: adjustments.length };
  }, [adjustments]);

  const drill = adjustments.find((a) => a.id === drillId) || null;

  const fetchRisk = useCallback(async (id: string) => {
    try {
      const r = await api.get<{ data: { risk_assessment: RiskAssessment } }>(`/carbon/article-6/${id}`);
      setDrillRisk(r.data?.data?.risk_assessment || null);
    } catch { setDrillRisk(null); }
  }, []);

  useEffect(() => {
    if (drillId) fetchRisk(drillId);
    else { setDrillRisk(null); setAiSummary(null); }
  }, [drillId, fetchRisk]);

  const runAi = useCallback(async () => {
    if (!drillId) return;
    setAiSummary('Analysing…');
    try {
      const r = await api.post<{ data: { summary: string; next_action: string } }>(
        '/ai/carbon/article-6-explain', { adjustment_id: drillId },
      );
      const d = r.data?.data;
      setAiSummary(d ? `${d.summary}\n\nNext: ${d.next_action}` : 'AI assist returned no data.');
    } catch (e: any) {
      setAiSummary(`AI assist unavailable: ${e?.message || 'unknown error'}`);
    }
  }, [drillId]);

  const transition = useCallback(async (id: string, path: string, body: any = {}) => {
    setActionBusy(true);
    try {
      await api.post(`/carbon/article-6/${id}/${path}`, body);
      await load();
      if (drillId === id) await fetchRisk(id);
    } catch (e: any) {
      alert(`Transition failed: ${e?.message || 'unknown error'}`);
    } finally {
      setActionBusy(false);
    }
  }, [load, drillId, fetchRisk]);

  return (
    <div data-testid="article6-tab">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4" data-testid="article6-kpis">
        <Kpi label="Adjustments" value={String(kpis.count)} />
        <Kpi label="Total tCO₂e" value={fmtTco(kpis.total)} />
        <Kpi label="UNFCCC cleared tCO₂e" value={fmtTco(kpis.cleared)} tone="good" />
        <Kpi label="In flight tCO₂e" value={fmtTco(kpis.pending)} tone="warn" />
        <Kpi label="Blocked tCO₂e" value={fmtTco(kpis.blocked)} tone="bad" />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] text-[var(--ink-2, #6b7685)] uppercase tracking-wide">Filter</span>
        {(['all', 'draft', 'dffe_pending', 'dffe_cleared', 'unfccc_ledger', 'blocked'] as const).map((s) => (
          <button type="button"
            key={s}
            onClick={() => setFilter(s)}
            data-testid={`article6-filter-${s}`}
            className={`px-2 py-1 rounded text-[11px] font-semibold border ${
              filter === s ? 'bg-[#c2873a] text-white border-[oklch(0.46_0.16_55)]' : 'bg-surface-v2 text-[var(--ink-2, #445566)] border-[#dde4ed]'
            }`}
          >
            {s === 'all' ? 'All' : STATUS_TONE[s].label}
          </button>
        ))}
        <button type="button"
          onClick={load}
          className="ml-auto px-2 py-1 text-[11px] rounded border border-[#dde4ed] text-[var(--ink-2, #445566)]"
          data-testid="article6-refresh"
        >
          Refresh
        </button>
      </div>

      {error && <div className="text-[12px] text-[var(--bad, #9b1f1f)] mb-3">{error}</div>}
      {loading ? (
        <div className="text-[12px] text-[var(--ink-2, #6b7685)]">Loading…</div>
      ) : (
        <table className="w-full text-[12px]" data-testid="article6-table">
          <thead>
            <tr className="text-left text-[10px] uppercase text-[var(--ink-2, #6b7685)]">
              <th className="py-1 pr-3">Status</th>
              <th className="py-1 pr-3">Host → Beneficiary</th>
              <th className="py-1 pr-3">Track</th>
              <th className="py-1 pr-3">Registry</th>
              <th className="py-1 pr-3 text-right">tCO₂e</th>
              <th className="py-1 pr-3">Vintage</th>
              <th className="py-1 pr-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="py-4 text-center text-[var(--ink-2, #6b7685)]">No adjustments match this filter.</td></tr>
            )}
            {filtered.map((a) => {
              const t = STATUS_TONE[a.ca_status];
              return (
                <tr
                  key={a.id}
                  onClick={() => setDrillId(a.id)}
                  className={`border-t border-[var(--border-subtle, #eef1f5)] cursor-pointer hover:bg-[#f7f9fc] ${drillId === a.id ? 'bg-[#f0f5fb]' : ''}`}
                  data-testid={`article6-row-${a.id}`}
                >
                  <td className="py-2 pr-3">
                    <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold"
                          style={{ backgroundColor: t.bg, color: t.fg }}>
                      {t.label}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono">{a.host_country_iso} → {a.beneficiary_country_iso}</td>
                  <td className="py-2 pr-3">{a.article_6_track}</td>
                  <td className="py-2 pr-3">{a.registry}</td>
                  <td className="py-2 pr-3 text-right">{fmtTco(a.tco2e)}</td>
                  <td className="py-2 pr-3">{a.vintage_year || '—'}</td>
                  <td className="py-2 pr-3">{new Date(a.updated_at).toLocaleDateString('en-ZA')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {drill && (
        <div className="mt-4 p-3 rounded-md border border-[#dde4ed] bg-[#f7f9fc]" data-testid="article6-drill">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] font-semibold">
              {drill.host_country_iso} → {drill.beneficiary_country_iso} · {fmtTco(drill.tco2e)} tCO₂e
            </div>
            <button type="button" onClick={() => setDrillId(null)} className="text-[11px] text-[var(--ink-2, #6b7685)]">close</button>
          </div>

          {drillRisk && (
            <div className="mb-2" data-testid="article6-risk">
              <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold mr-2"
                    style={{ backgroundColor: RISK_TONE[drillRisk.risk].bg, color: RISK_TONE[drillRisk.risk].fg }}>
                Risk: {drillRisk.risk}
              </span>
              <span className="text-[12px] text-[var(--ink-2, #445566)]">{drillRisk.reasons.join(' ')}</span>
            </div>
          )}

          {drill.registry_uri && (
            <div className="text-[11px] text-[var(--ink-2, #6b7685)] mb-2 break-all">
              Registry anchor: <a href={drill.registry_uri} target="_blank" rel="noreferrer" className="underline font-mono" style={{ color: 'oklch(0.46 0.16 55)' }}>{drill.registry_uri}</a>
            </div>
          )}
          {drill.blocked_reason && (
            <div className="text-[12px] text-[var(--bad, #9b1f1f)] mb-2">Blocked reason: {drill.blocked_reason}</div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-2" data-testid="article6-actions">
            {drill.ca_status === 'draft' && (
              <button type="button"
                disabled={actionBusy}
                onClick={() => transition(drill.id, 'submit-dffe')}
                className="px-2 py-1 text-[11px] rounded bg-[#c2873a] text-white"
                data-testid="article6-submit-dffe"
              >Submit to DFFE</button>
            )}
            {drill.ca_status === 'dffe_pending' && (
              <button type="button"
                disabled={actionBusy}
                onClick={() => {
                  const ref = prompt('DFFE clearance reference:');
                  if (ref) transition(drill.id, 'clear-dffe', { clearance_ref: ref });
                }}
                className="px-2 py-1 text-[11px] rounded bg-[#c2873a] text-white"
                data-testid="article6-clear-dffe"
              >Clear (DFFE only)</button>
            )}
            {drill.ca_status === 'dffe_cleared' && (
              <button type="button"
                disabled={actionBusy}
                onClick={() => {
                  const ref = prompt('UNFCCC ledger reference:');
                  if (ref) transition(drill.id, 'post-unfccc', { ledger_ref: ref });
                }}
                className="px-2 py-1 text-[11px] rounded bg-[var(--good, #1f6b3a)] text-white"
                data-testid="article6-post-unfccc"
              >Post to UNFCCC ledger</button>
            )}
            {drill.ca_status !== 'blocked' && (
              <button type="button"
                disabled={actionBusy}
                onClick={() => {
                  const reason = prompt('Block reason (≥3 chars):');
                  if (reason && reason.length >= 3) transition(drill.id, 'block', { reason });
                }}
                className="px-2 py-1 text-[11px] rounded bg-surface-v2 border border-[var(--bad, #9b1f1f)] text-[var(--bad, #9b1f1f)]"
                data-testid="article6-block"
              >Block</button>
            )}
            {drill.ca_status === 'blocked' && (
              <button type="button"
                disabled={actionBusy}
                onClick={() => transition(drill.id, 'unblock')}
                className="px-2 py-1 text-[11px] rounded bg-surface-v2 border border-[oklch(0.46_0.16_55)]" style={{ color: 'oklch(0.46 0.16 55)' }}
                data-testid="article6-unblock"
              >Unblock</button>
            )}
            <button type="button"
              disabled={actionBusy}
              onClick={runAi}
              className="ml-auto px-2 py-1 text-[11px] rounded bg-[#6e3aff] text-white"
              data-testid="article6-ai-explain"
            >Explain with AI</button>
          </div>

          {aiSummary && (
            <div className="mt-3 p-2 rounded bg-[#f3eeff] text-[12px] whitespace-pre-line" data-testid="article6-ai-summary">
              {aiSummary}
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        <div className="text-[12px] font-semibold mb-2" style={{ color: 'oklch(0.46 0.16 55)' }}>Country routing</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2" data-testid="article6-routing">
          {routing.map((r) => (
            <div key={r.country_iso} className="p-2 rounded border border-[#dde4ed] bg-surface-v2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[12px]">{r.country_name}</span>
                <span className="font-mono text-[10px] text-[var(--ink-2, #6b7685)]">{r.country_iso}</span>
              </div>
              <div className="text-[11px] text-[var(--ink-2, #445566)]">
                Track: <span className="font-mono">{r.article_6_track}</span>
                {r.ndc_authority && <> · NDC: {r.ndc_authority}</>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' }) {
  const palette = tone === 'good' ? 'var(--good, #1f6b3a)' : tone === 'bad' ? 'var(--bad, #9b1f1f)' : tone === 'warn' ? '#a06200' : 'oklch(0.46 0.16 55)';
  return (
    <div className="p-2 rounded-md bg-surface-v2 border border-[#dde4ed]">
      <div className="text-[10px] uppercase text-[var(--ink-2, #6b7685)]">{label}</div>
      <div className="text-[16px] font-bold" style={{ color: palette }}>{value}</div>
    </div>
  );
}

function fmtTco(n: number): string {
  if (!n) return '0';
  if (n >= 1000) return `${Math.round(n).toLocaleString('en-ZA')}`;
  return n.toFixed(1);
}
