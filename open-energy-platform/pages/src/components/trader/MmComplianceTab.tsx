// Trader market-maker compliance — Wave 9 P6-grade obligation tracker.
//
// Lives on the Trader workstation. Surfaces:
//   • Active MM obligations with breach state + consecutive-miss counter
//   • Last 30 days of daily performance per obligation
//   • Filter pills by breach status (all/none/warning/breach/escalated)
//   • Acknowledge + excuse actions, gated by role

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type BreachStatus = 'none' | 'warning' | 'breach' | 'escalated';
type ComplianceStatus = 'compliant' | 'miss' | 'excused' | null;

interface ObligationRow {
  id: string;
  participant_id: string;
  energy_type: string;
  obligation_type: string;
  two_sided_minutes_per_day: number | null;
  max_spread_bps: number | null;
  uptime_target_pct: number | null;
  min_quote_volume_mwh: number | null;
  monthly_fee_zar: number | null;
  status: string;
  consecutive_misses: number | null;
  breach_status: BreachStatus | null;
  warning_threshold: number | null;
  breach_threshold: number | null;
  escalation_threshold: number | null;
  last_breach_at: string | null;
  last_escalated_at: string | null;
  last_acknowledged_at: string | null;
  last_acknowledged_by: string | null;
}

interface PerformanceRow {
  id: string;
  obligation_id: string;
  day: string;
  two_sided_minutes: number | null;
  avg_spread_bps: number | null;
  uptime_pct: number | null;
  total_volume_mwh: number | null;
  compliant: number;
  fee_earned_zar: number | null;
  penalty_zar: number | null;
  compliance_status: ComplianceStatus;
  excused_reason: string | null;
}

const BREACH_TONE: Record<BreachStatus, { bg: string; fg: string; label: string }> = {
  none: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Compliant' },
  warning: { bg: '#fff4d6', fg: '#a06200', label: 'Warning' },
  breach: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Breach' },
  escalated: { bg: '#3a0f0f', fg: '#ffd6d6', label: 'Escalated' },
};

const PERF_TONE: Record<NonNullable<ComplianceStatus>, { bg: string; fg: string; label: string }> = {
  compliant: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Compliant' },
  miss: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Miss' },
  excused: { bg: '#e0ecff', fg: '#1f4b9b', label: 'Excused' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open', label: 'Active breaches' },
  { key: 'all', label: 'All' },
  { key: 'none', label: 'Compliant' },
  { key: 'warning', label: 'Warning' },
  { key: 'breach', label: 'Breach' },
  { key: 'escalated', label: 'Escalated' },
];

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e3e7ec', borderRadius: 8, padding: '12px 16px', minWidth: 140 }}>
      <div style={{ fontSize: 11, color: '#557', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#0f1c2e', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#7a8a9a', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function MmComplianceTab() {
  const [rows, setRows] = useState<ObligationRow[]>([]);
  const [filter, setFilter] = useState<string>('open');
  const [drillRow, setDrillRow] = useState<ObligationRow | null>(null);
  const [drillPerfs, setDrillPerfs] = useState<PerformanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get<{ data: ObligationRow[] }>('/trader/mm-compliance');
      setRows(r.data?.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load MM obligations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'open') {
      return rows.filter((r) => (r.breach_status || 'none') !== 'none');
    }
    return rows.filter((r) => (r.breach_status || 'none') === filter);
  }, [rows, filter]);

  const kpis = useMemo(() => ({
    total: rows.length,
    warning: rows.filter((r) => r.breach_status === 'warning').length,
    breach: rows.filter((r) => r.breach_status === 'breach').length,
    escalated: rows.filter((r) => r.breach_status === 'escalated').length,
    clean: rows.filter((r) => (r.breach_status || 'none') === 'none').length,
  }), [rows]);

  const openDrill = useCallback(async (row: ObligationRow) => {
    setDrillRow(row); setDrillPerfs([]);
    try {
      const r = await api.get<{ data: { obligation: ObligationRow; performances: PerformanceRow[] } }>(`/trader/mm-compliance/${row.id}`);
      setDrillPerfs(r.data?.data?.performances || []);
    } catch {/* leave empty */}
  }, []);

  const act = useCallback(async (
    kind: 'acknowledge' | 'excuse',
    payload: any,
    targetId: string,
  ) => {
    setError(null);
    try {
      if (kind === 'acknowledge') await api.post(`/trader/mm-compliance/${targetId}/acknowledge`, payload);
      else await api.post(`/trader/mm-compliance/performance/${targetId}/excuse`, payload);
      await load();
      if (drillRow) await openDrill(drillRow);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Action failed.');
    }
  }, [load, openDrill, drillRow]);

  return (
    <div data-testid="trader-mm-compliance-tab" style={{ padding: '16px 20px', minHeight: 600 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f1c2e', marginTop: 0 }}>MM compliance</h2>
      <p style={{ fontSize: 13, color: '#557', marginTop: 4 }}>
        Daily market-maker obligation scoring against the contracted targets. Three consecutive
        misses raise a breach; five trigger escalation to the regulator inbox.
      </p>

      <div data-testid="trader-mm-compliance-kpis" style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <Kpi label="Total obligations" value={kpis.total} />
        <Kpi label="Clean" value={kpis.clean} />
        <Kpi label="Warning" value={kpis.warning} sub="≥1 miss" />
        <Kpi label="In breach" value={kpis.breach} sub="≥3 misses" />
        <Kpi label="Escalated" value={kpis.escalated} sub="regulator inbox" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            data-testid={`trader-mm-compliance-filter-${f.key}`}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 12px', borderRadius: 999, border: '1px solid #e3e7ec',
              background: filter === f.key ? 'oklch(0.46 0.16 55)' : '#fff',
              color: filter === f.key ? '#fff' : '#0f1c2e', fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}
          >{f.label}</button>
        ))}
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#fde0e0', color: '#9b1f1f', borderRadius: 6, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div data-testid="trader-mm-compliance-table" style={{ marginTop: 14, background: '#fff', border: '1px solid #e3e7ec', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f6f8fb', textAlign: 'left', color: '#557' }}>
              <th style={{ padding: '8px 12px' }}>Energy</th>
              <th style={{ padding: '8px 12px' }}>Type</th>
              <th style={{ padding: '8px 12px' }}>Targets</th>
              <th style={{ padding: '8px 12px' }}>Misses</th>
              <th style={{ padding: '8px 12px' }}>Status</th>
              <th style={{ padding: '8px 12px' }}>Last escalated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#7a8a9a' }}>
                {loading ? 'Loading…' : 'No MM obligations in this view.'}
              </td></tr>
            )}
            {filtered.map((r) => {
              const tone = BREACH_TONE[(r.breach_status || 'none') as BreachStatus];
              return (
                <tr
                  key={r.id}
                  data-testid={`trader-mm-compliance-row-${r.id}`}
                  onClick={() => openDrill(r)}
                  style={{ borderTop: '1px solid #eef1f5', cursor: 'pointer' }}
                >
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.energy_type}</td>
                  <td style={{ padding: '8px 12px' }}>{r.obligation_type}</td>
                  <td style={{ padding: '8px 12px', fontSize: 12, color: '#557' }}>
                    {r.two_sided_minutes_per_day != null && <>{r.two_sided_minutes_per_day}m · </>}
                    {r.max_spread_bps != null && <>spread ≤{r.max_spread_bps}bp · </>}
                    {r.uptime_target_pct != null && <>uptime ≥{r.uptime_target_pct}%</>}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600 }}>
                    {r.consecutive_misses ?? 0}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ background: tone.bg, color: tone.fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {tone.label}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 12, color: '#557' }}>
                    {r.last_escalated_at ? new Date(r.last_escalated_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {drillRow && (
        <div
          data-testid="trader-mm-compliance-drill"
          style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 540, background: '#fff',
            borderLeft: '1px solid #e3e7ec', boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
            zIndex: 50, padding: 20, overflowY: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setDrillRow(null)}
            style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}
          >×</button>
          <h3 style={{ marginTop: 0, fontSize: 17 }}>{drillRow.energy_type} · {drillRow.obligation_type}</h3>
          <div style={{ fontSize: 12, color: '#557', fontFamily: 'monospace' }}>{drillRow.id}</div>

          <div style={{ marginTop: 12, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12 }}>
            <div><span style={{ color: '#557' }}>Two-sided/day:</span> <strong>{drillRow.two_sided_minutes_per_day ?? '—'}m</strong></div>
            <div><span style={{ color: '#557' }}>Max spread:</span> <strong>{drillRow.max_spread_bps ?? '—'}bp</strong></div>
            <div><span style={{ color: '#557' }}>Uptime ≥:</span> <strong>{drillRow.uptime_target_pct ?? '—'}%</strong></div>
            <div><span style={{ color: '#557' }}>Volume ≥:</span> <strong>{drillRow.min_quote_volume_mwh ?? '—'} MWh</strong></div>
            <div><span style={{ color: '#557' }}>Monthly fee:</span> <strong>R{Number(drillRow.monthly_fee_zar || 0).toLocaleString()}</strong></div>
          </div>

          <div style={{ marginTop: 14, padding: 10, background: '#f6f8fb', borderRadius: 6 }}>
            <div style={{ fontSize: 12, color: '#557' }}>
              <strong>{drillRow.consecutive_misses ?? 0}</strong> consecutive misses ·
              warn at <strong>{drillRow.warning_threshold ?? 1}</strong> ·
              breach at <strong>{drillRow.breach_threshold ?? 3}</strong> ·
              escalate at <strong>{drillRow.escalation_threshold ?? 5}</strong>
            </div>
          </div>

          <h4 style={{ marginTop: 18, fontSize: 13, color: '#557' }}>Last 30 days</h4>
          <div data-testid="trader-mm-compliance-perfs" style={{ marginTop: 6, maxHeight: 320, overflowY: 'auto' }}>
            {drillPerfs.length === 0 && (
              <div style={{ fontSize: 12, color: '#7a8a9a' }}>No performance rows yet.</div>
            )}
            {drillPerfs.map((p) => {
              const tone = p.compliance_status ? PERF_TONE[p.compliance_status] : null;
              return (
                <div
                  key={p.id}
                  data-testid={`trader-mm-compliance-perf-${p.id}`}
                  style={{ padding: '8px 10px', borderBottom: '1px solid #eef1f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ fontSize: 12 }}>
                    <div style={{ fontWeight: 600 }}>{p.day}</div>
                    <div style={{ color: '#557', marginTop: 2 }}>
                      {Math.round(Number(p.two_sided_minutes ?? 0))}m ·
                      spread {Math.round(Number(p.avg_spread_bps ?? 0))}bp ·
                      uptime {Number(p.uptime_pct ?? 0).toFixed(1)}%
                    </div>
                    {p.excused_reason && (
                      <div style={{ color: '#1f4b9b', marginTop: 2, fontSize: 11 }}>Excused: {p.excused_reason}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    {tone && (
                      <span style={{ background: tone.bg, color: tone.fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                        {tone.label}
                      </span>
                    )}
                    {p.compliance_status === 'miss' && (
                      <button
                        type="button"
                        data-testid={`trader-mm-compliance-excuse-${p.id}`}
                        onClick={() => {
                          const reason = prompt('Excuse reason?');
                          if (reason) void act('excuse', { excused_reason: reason }, p.id);
                        }}
                        style={{ padding: '2px 8px', background: '#1f4b9b', color: '#fff', border: 'none', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}
                      >Excuse</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div data-testid="trader-mm-compliance-actions" style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(drillRow.breach_status === 'warning' || drillRow.breach_status === 'breach' || drillRow.breach_status === 'escalated') && (
              <button
                type="button"
                data-testid="trader-mm-compliance-acknowledge"
                onClick={() => {
                  const notes = prompt('Acknowledgement notes (optional):', '') ?? '';
                  void act('acknowledge', { notes }, drillRow.id);
                }}
                style={{ padding: '6px 12px', background: 'oklch(0.46 0.16 55)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Acknowledge breach</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
