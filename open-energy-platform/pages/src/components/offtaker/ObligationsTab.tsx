// Offtaker PPA obligations queue — Wave 7 P6-grade delivery loop.
//
// Lives on the Offtaker suite as a tab. Surfaces:
//   • Monthly contracted vs delivered MWh per PPA
//   • Shortfall rows with cure deadlines + countdown
//   • Take-or-pay liability in ZAR for expired rows
//   • Inline reading verification queue (Submit → Verify | Reject)
//
// Server-side enforcement: offtakers only see their own rows; IPP counterparty
// only sees obligations against their assets.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type Status = 'pending' | 'delivered' | 'shortfall' | 'cured' | 'take_or_pay';
type VerifyStatus = 'submitted' | 'verified' | 'rejected' | 'reversed';

interface ObligationRow {
  id: string;
  ppa_id: string;
  participant_id: string;
  counterparty_id: string | null;
  period_month: string;
  contracted_mwh: number;
  delivered_mwh: number;
  threshold_pct: number;
  cure_deadline_at: string | null;
  status: Status;
  take_or_pay_amount_zar: number;
  cured_at: string | null;
  escalated_at: string | null;
  notes: string | null;
}

interface VerificationRow {
  id: string;
  obligation_id: string;
  reading_mwh: number;
  submitted_by: string;
  submitted_at: string;
  status: VerifyStatus;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
}

const STATUS_TONE: Record<Status, { bg: string; fg: string; label: string }> = {
  pending: { bg: '#f0f3f7', fg: '#445566', label: 'Pending' },
  delivered: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Delivered' },
  shortfall: { bg: '#fff4d6', fg: '#a06200', label: 'Shortfall' },
  cured: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Cured' },
  take_or_pay: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Take-or-pay' },
};

function cureCountdown(deadline: string | null): { bg: string; fg: string; label: string } {
  if (!deadline) return { bg: '#f0f3f7', fg: '#445566', label: '—' };
  const due = new Date(deadline).getTime();
  const now = Date.now();
  if (due < now) return { bg: '#fde0e0', fg: '#9b1f1f', label: `Overdue ${msAgo(now - due)}` };
  return { bg: '#daf5e2', fg: '#1f6b3a', label: `In ${msAgo(due - now)}` };
}

function msAgo(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'all', label: 'All' },
  { key: 'shortfall', label: 'Shortfall' },
  { key: 'take_or_pay', label: 'Take-or-pay' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cured', label: 'Cured' },
];

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e3e7ec', borderRadius: 8, padding: '12px 16px', minWidth: 140 }}>
      <div style={{ fontSize: 11, color: '#557', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1c2733', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#7a8a9a', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function ObligationsTab() {
  const [rows, setRows] = useState<ObligationRow[]>([]);
  const [filter, setFilter] = useState<string>('open');
  const [drillRow, setDrillRow] = useState<ObligationRow | null>(null);
  const [drillVer, setDrillVer] = useState<VerificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get<{ data: ObligationRow[] }>('/offtaker/obligations');
      setRows(r.data?.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load obligations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'open') return rows.filter((r) => r.status === 'shortfall' || r.status === 'take_or_pay' || r.status === 'pending');
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const kpis = useMemo(() => ({
    total: rows.length,
    contracted: rows.reduce((acc, r) => acc + Number(r.contracted_mwh || 0), 0),
    delivered: rows.reduce((acc, r) => acc + Number(r.delivered_mwh || 0), 0),
    shortfall: rows.filter((r) => r.status === 'shortfall').length,
    take_or_pay: rows.filter((r) => r.status === 'take_or_pay').length,
    take_or_pay_zar: rows.reduce((acc, r) => acc + Number(r.take_or_pay_amount_zar || 0), 0),
  }), [rows]);

  const openDrill = useCallback(async (row: ObligationRow) => {
    setDrillRow(row); setDrillVer([]);
    try {
      const r = await api.get<{ data: { obligation: ObligationRow; verifications: VerificationRow[] } }>(`/offtaker/obligations/${row.id}`);
      setDrillVer(r.data?.data?.verifications || []);
    } catch {/* leave empty */}
  }, []);

  const act = useCallback(async (
    action: 'verify' | 'reject' | 'cure',
    payload: any,
    targetId: string,
  ) => {
    setError(null);
    try {
      if (action === 'verify') await api.post(`/offtaker/obligations/readings/${targetId}/verify`, {});
      else if (action === 'reject') await api.post(`/offtaker/obligations/readings/${targetId}/reject`, payload);
      else if (action === 'cure') await api.post(`/offtaker/obligations/${targetId}/cure`, payload);
      await load();
      if (drillRow) await openDrill({ ...drillRow });
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Action failed.');
    }
  }, [load, openDrill, drillRow]);

  return (
    <div data-testid="offtaker-obligations-tab" style={{ padding: '16px 20px', minHeight: 600 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1c2733', marginTop: 0 }}>PPA delivery obligations</h2>
      <p style={{ fontSize: 13, color: '#557', marginTop: 4 }}>
        Monthly contracted-vs-delivered tracking. Shortfalls open a 14-day cure window; expired
        rows flip to take-or-pay and feed the regulator inbox automatically.
      </p>

      <div data-testid="offtaker-obligations-kpis" style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <Kpi label="Total periods" value={kpis.total} />
        <Kpi label="Contracted (MWh)" value={Math.round(kpis.contracted).toLocaleString()} />
        <Kpi label="Delivered (MWh)" value={Math.round(kpis.delivered).toLocaleString()} />
        <Kpi label="Open shortfalls" value={kpis.shortfall} />
        <Kpi label="Take-or-pay (count)" value={kpis.take_or_pay} />
        <Kpi label="Take-or-pay (ZAR)" value={`R${Math.round(kpis.take_or_pay_zar).toLocaleString()}`} sub="across all expired" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            data-testid={`offtaker-obligations-filter-${f.key}`}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 12px', borderRadius: 999, border: '1px solid #e3e7ec',
              background: filter === f.key ? '#1c2733' : '#fff',
              color: filter === f.key ? '#fff' : '#1c2733', fontSize: 12, fontWeight: 600,
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

      <div data-testid="offtaker-obligations-table" style={{ marginTop: 14, background: '#fff', border: '1px solid #e3e7ec', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f6f8fb', textAlign: 'left', color: '#557' }}>
              <th style={{ padding: '8px 12px' }}>Period</th>
              <th style={{ padding: '8px 12px' }}>PPA</th>
              <th style={{ padding: '8px 12px' }}>Contracted MWh</th>
              <th style={{ padding: '8px 12px' }}>Delivered MWh</th>
              <th style={{ padding: '8px 12px' }}>% of contracted</th>
              <th style={{ padding: '8px 12px' }}>Status</th>
              <th style={{ padding: '8px 12px' }}>Cure</th>
              <th style={{ padding: '8px 12px' }}>Take-or-pay (ZAR)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: '#7a8a9a' }}>
                No obligations match this filter.
              </td></tr>
            )}
            {filtered.map((r) => {
              const tone = STATUS_TONE[r.status];
              const cure = cureCountdown(r.cure_deadline_at);
              const pct = r.contracted_mwh > 0 ? Math.round((r.delivered_mwh / r.contracted_mwh) * 1000) / 10 : 0;
              return (
                <tr key={r.id}
                    data-testid={`offtaker-obligations-row-${r.id}`}
                    onClick={() => void openDrill(r)}
                    style={{ borderTop: '1px solid #eef0f4', cursor: 'pointer' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.period_month}</td>
                  <td style={{ padding: '8px 12px', color: '#7a8a9a' }}>{r.ppa_id}</td>
                  <td style={{ padding: '8px 12px' }}>{Math.round(r.contracted_mwh).toLocaleString()}</td>
                  <td style={{ padding: '8px 12px' }}>{Math.round(r.delivered_mwh).toLocaleString()}</td>
                  <td style={{ padding: '8px 12px' }}>{pct}%</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ background: tone.bg, color: tone.fg, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                      {tone.label}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ background: cure.bg, color: cure.fg, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
                      {cure.label}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {r.take_or_pay_amount_zar > 0 ? `R${Math.round(r.take_or_pay_amount_zar).toLocaleString()}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {drillRow && (
        <div data-testid="offtaker-obligations-drill" style={{ marginTop: 16, padding: 16, background: '#fff', border: '1px solid #e3e7ec', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16 }}>{drillRow.ppa_id} · {drillRow.period_month}</h3>
              <div style={{ fontSize: 12, color: '#7a8a9a', marginTop: 2 }}>
                Contracted {Math.round(drillRow.contracted_mwh).toLocaleString()} MWh · Delivered {Math.round(drillRow.delivered_mwh).toLocaleString()} MWh · Threshold {drillRow.threshold_pct}%
              </div>
              {drillRow.notes && <div style={{ fontSize: 12, color: '#445566', marginTop: 6 }}>{drillRow.notes}</div>}
            </div>
            <button type="button" onClick={() => setDrillRow(null)}
                    style={{ background: 'transparent', border: 'none', color: '#7a8a9a', cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>

          <div data-testid="offtaker-obligations-readings" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Delivery readings</div>
            {drillVer.length === 0 && <div style={{ fontSize: 12, color: '#7a8a9a' }}>No readings yet.</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {drillVer.map((dv) => (
                  <tr key={dv.id} style={{ borderTop: '1px solid #eef0f4' }}>
                    <td style={{ padding: '6px 8px', width: 120 }}>{dv.submitted_at?.slice(0, 16)}</td>
                    <td style={{ padding: '6px 8px', width: 80 }}>{Math.round(dv.reading_mwh)} MWh</td>
                    <td style={{ padding: '6px 8px' }}>
                      <span style={{
                        background: dv.status === 'verified' ? '#daf5e2' : dv.status === 'rejected' ? '#fde0e0' : '#fff4d6',
                        color: dv.status === 'verified' ? '#1f6b3a' : dv.status === 'rejected' ? '#9b1f1f' : '#a06200',
                        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                      }}>{dv.status}</span>
                    </td>
                    <td style={{ padding: '6px 8px', color: '#7a8a9a' }}>{dv.notes || dv.rejection_reason || ''}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      {dv.status === 'submitted' && (
                        <>
                          <button data-testid={`offtaker-obligations-verify-${dv.id}`}
                                  type="button"
                                  onClick={() => act('verify', null, dv.id)}
                                  style={{ marginRight: 6, padding: '4px 10px', background: '#1c2733', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                            Verify
                          </button>
                          <button data-testid={`offtaker-obligations-reject-${dv.id}`}
                                  type="button"
                                  onClick={() => {
                                    const reason = window.prompt('Rejection reason?');
                                    if (reason) act('reject', { reason }, dv.id);
                                  }}
                                  style={{ padding: '4px 10px', background: '#fff', color: '#9b1f1f', border: '1px solid #9b1f1f', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                            Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div data-testid="offtaker-obligations-actions" style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button data-testid="offtaker-obligations-cure"
                    type="button"
                    disabled={drillRow.status !== 'shortfall'}
                    onClick={() => {
                      const key = window.prompt('R2 evidence key (signed remediation plan)?');
                      if (key) act('cure', { evidence_r2_key: key }, drillRow.id);
                    }}
                    style={{
                      padding: '6px 14px', background: drillRow.status === 'shortfall' ? '#1f6b3a' : '#bbc',
                      color: '#fff', border: 'none', borderRadius: 4,
                      cursor: drillRow.status === 'shortfall' ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600,
                    }}>
              Cure (with evidence)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
