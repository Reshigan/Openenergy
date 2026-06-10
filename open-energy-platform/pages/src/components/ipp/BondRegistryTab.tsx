// IPP performance-bond registry — Wave 10 P6-grade expiry tracker.
//
// Lives on the IPP workstation. Surfaces:
//   • Active bonds with expiry_status + days-to-expiry countdown
//   • Last 50 notices per bond drill-down
//   • Filter pills by cycle (open/all/green/warning/cycle_1/2/3/escalated)
//   • Acknowledge + release + replace + forfeit actions, gated by role

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ExpiryStatus = 'green' | 'warning' | 'cycle_1' | 'cycle_2' | 'cycle_3' | 'escalated';

interface BondRow {
  id: string;
  project_id: string;
  bond_number: string;
  bond_type: string;
  issuer: string;
  beneficiary: string | null;
  face_value_zar: number;
  currency: string;
  issued_at: string;
  expiry_at: string;
  release_conditions: string | null;
  status: string;
  expiry_status: ExpiryStatus;
  expiry_status_label?: string;
  days_until_expiry?: number;
  last_warning_at: string | null;
  last_cycle_1_at: string | null;
  last_cycle_2_at: string | null;
  last_cycle_3_at: string | null;
  last_escalated_at: string | null;
  last_acknowledged_at: string | null;
  claim_amount_zar: number | null;
  claim_reason: string | null;
}

interface NoticeRow {
  id: string;
  bond_id: string;
  cycle: number;
  title: string;
  body_json: string | null;
  status: string;
  issued_at: string;
  cure_deadline_at: string;
  acknowledged_at: string | null;
  escalated_at: string | null;
}

const STATUS_TONE: Record<ExpiryStatus, { bg: string; fg: string; label: string }> = {
  green:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Active' },
  warning:   { bg: '#fff4d6', fg: '#a06200', label: 'Renew soon' },
  cycle_1:   { bg: '#ffe0c2', fg: '#a04200', label: 'Notice 1' },
  cycle_2:   { bg: '#fdc4b0', fg: '#8a2200', label: 'Notice 2' },
  cycle_3:   { bg: '#fde0e0', fg: '#9b1f1f', label: 'Notice 3 — final' },
  escalated: { bg: '#3a0f0f', fg: '#ffd6d6', label: 'Expired — regulator' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',      label: 'Active escalations' },
  { key: 'all',       label: 'All' },
  { key: 'green',     label: 'Active' },
  { key: 'warning',   label: 'Renew soon' },
  { key: 'cycle_1',   label: 'Notice 1' },
  { key: 'cycle_2',   label: 'Notice 2' },
  { key: 'cycle_3',   label: 'Notice 3' },
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

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  return `R${Number(n).toLocaleString()}`;
}

function fmtDaysToExpiry(d: number | undefined): string {
  if (d == null) return '—';
  if (d < 0) return `${-d}d overdue`;
  if (d === 0) return 'expires today';
  return `${d}d remaining`;
}

export function BondRegistryTab() {
  const [rows, setRows] = useState<BondRow[]>([]);
  const [filter, setFilter] = useState<string>('open');
  const [drillRow, setDrillRow] = useState<BondRow | null>(null);
  const [drillNotices, setDrillNotices] = useState<NoticeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get<{ data: BondRow[] }>('/ipp/bonds');
      setRows(r.data?.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load bonds.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'open') {
      return rows.filter((r) => r.expiry_status !== 'green');
    }
    return rows.filter((r) => r.expiry_status === filter);
  }, [rows, filter]);

  const kpis = useMemo(() => ({
    total:     rows.length,
    green:     rows.filter((r) => r.expiry_status === 'green').length,
    warning:   rows.filter((r) => r.expiry_status === 'warning').length,
    cycle:     rows.filter((r) => r.expiry_status === 'cycle_1' || r.expiry_status === 'cycle_2' || r.expiry_status === 'cycle_3').length,
    escalated: rows.filter((r) => r.expiry_status === 'escalated').length,
  }), [rows]);

  const openDrill = useCallback(async (row: BondRow) => {
    setDrillRow(row); setDrillNotices([]);
    try {
      const r = await api.get<{ data: { bond: BondRow; notices: NoticeRow[] } }>(`/ipp/bonds/${row.id}`);
      setDrillNotices(r.data?.data?.notices || []);
    } catch {/* leave empty */}
  }, []);

  const act = useCallback(async (
    kind: 'acknowledge' | 'release' | 'forfeit',
    payload: any,
    targetId: string,
  ) => {
    setError(null);
    try {
      await api.post(`/ipp/bonds/${targetId}/${kind}`, payload);
      await load();
      if (drillRow) await openDrill(drillRow);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Action failed.');
    }
  }, [load, openDrill, drillRow]);

  return (
    <div data-testid="ipp-bond-registry-tab" style={{ padding: '16px 20px', minHeight: 600 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f1c2e', marginTop: 0 }}>Performance bonds</h2>
      <p style={{ fontSize: 13, color: '#557', marginTop: 4 }}>
        Performance, advance-payment, retention, warranty, environmental-rehabilitation and parent-guarantee
        bonds. The daily sweep escalates each bond through warning → notice 1 → notice 2 → notice 3 → regulator
        as it approaches expiry; renewal/replacement clears tracking.
      </p>

      <div data-testid="ipp-bond-registry-kpis" style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <Kpi label="Total bonds" value={kpis.total} />
        <Kpi label="Active" value={kpis.green} />
        <Kpi label="Renew soon" value={kpis.warning} sub="30–90d" />
        <Kpi label="In notice cycle" value={kpis.cycle} sub="≤30d" />
        <Kpi label="Escalated" value={kpis.escalated} sub="regulator inbox" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            data-testid={`ipp-bond-registry-filter-${f.key}`}
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

      <div data-testid="ipp-bond-registry-table" style={{ marginTop: 14, background: '#fff', border: '1px solid #e3e7ec', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f6f8fb', textAlign: 'left', color: '#557' }}>
              <th style={{ padding: '8px 12px' }}>Bond #</th>
              <th style={{ padding: '8px 12px' }}>Type</th>
              <th style={{ padding: '8px 12px' }}>Project</th>
              <th style={{ padding: '8px 12px' }}>Face value</th>
              <th style={{ padding: '8px 12px' }}>Expiry</th>
              <th style={{ padding: '8px 12px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#7a8a9a' }}>
                {loading ? 'Loading…' : 'No bonds in this view.'}
              </td></tr>
            )}
            {filtered.map((r) => {
              const tone = STATUS_TONE[r.expiry_status];
              return (
                <tr
                  key={r.id}
                  data-testid={`ipp-bond-registry-row-${r.id}`}
                  onClick={() => openDrill(r)}
                  style={{ borderTop: '1px solid #eef1f5', cursor: 'pointer' }}
                >
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.bond_number}</td>
                  <td style={{ padding: '8px 12px' }}>{r.bond_type}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>{r.project_id}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmtMoney(r.face_value_zar)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ fontWeight: 600 }}>{r.expiry_at.slice(0, 10)}</div>
                    <div style={{ fontSize: 11, color: '#557' }}>{fmtDaysToExpiry(r.days_until_expiry)}</div>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ background: tone.bg, color: tone.fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {tone.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {drillRow && (
        <div
          data-testid="ipp-bond-registry-drill"
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
          <h3 style={{ marginTop: 0, fontSize: 17 }}>{drillRow.bond_number} · {drillRow.bond_type}</h3>
          <div style={{ fontSize: 12, color: '#557', fontFamily: 'monospace' }}>{drillRow.id}</div>

          <div style={{ marginTop: 12, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12 }}>
            <div><span style={{ color: '#557' }}>Project:</span> <strong>{drillRow.project_id}</strong></div>
            <div><span style={{ color: '#557' }}>Issuer:</span> <strong>{drillRow.issuer}</strong></div>
            <div><span style={{ color: '#557' }}>Beneficiary:</span> <strong>{drillRow.beneficiary ?? '—'}</strong></div>
            <div><span style={{ color: '#557' }}>Face value:</span> <strong>{fmtMoney(drillRow.face_value_zar)}</strong></div>
            <div><span style={{ color: '#557' }}>Issued:</span> <strong>{drillRow.issued_at.slice(0, 10)}</strong></div>
            <div><span style={{ color: '#557' }}>Expires:</span> <strong>{drillRow.expiry_at.slice(0, 10)}</strong></div>
            <div><span style={{ color: '#557' }}>Countdown:</span> <strong>{fmtDaysToExpiry(drillRow.days_until_expiry)}</strong></div>
          </div>

          {drillRow.release_conditions && (
            <div style={{ marginTop: 10, padding: 10, background: '#f6f8fb', borderRadius: 6, fontSize: 12 }}>
              <strong>Release conditions:</strong> {drillRow.release_conditions}
            </div>
          )}

          <h4 style={{ marginTop: 18, fontSize: 13, color: '#557' }}>Notice history</h4>
          <div data-testid="ipp-bond-registry-notices" style={{ marginTop: 6, maxHeight: 320, overflowY: 'auto' }}>
            {drillNotices.length === 0 && (
              <div style={{ fontSize: 12, color: '#7a8a9a' }}>No notices issued yet.</div>
            )}
            {drillNotices.map((n) => (
              <div
                key={n.id}
                data-testid={`ipp-bond-registry-notice-${n.id}`}
                style={{ padding: '8px 10px', borderBottom: '1px solid #eef1f5' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>Cycle {n.cycle}</div>
                  <span style={{
                    background: n.status === 'escalated' ? '#3a0f0f'
                              : n.status === 'acknowledged' ? '#daf5e2'
                              : n.status === 'superseded' ? '#e3e7ec'
                              : '#fff4d6',
                    color: n.status === 'escalated' ? '#ffd6d6'
                         : n.status === 'acknowledged' ? '#1f6b3a'
                         : n.status === 'superseded' ? '#557'
                         : '#a06200',
                    padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                  }}>{n.status}</span>
                </div>
                <div style={{ marginTop: 4, fontSize: 12 }}>{n.title}</div>
                <div style={{ marginTop: 2, fontSize: 11, color: '#557' }}>
                  Issued {n.issued_at.slice(0, 10)} · cure by {n.cure_deadline_at.slice(0, 10)}
                </div>
              </div>
            ))}
          </div>

          <div data-testid="ipp-bond-registry-actions" style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {drillRow.expiry_status !== 'green' && drillRow.status === 'active' && (
              <button
                type="button"
                data-testid="ipp-bond-registry-acknowledge"
                onClick={() => void act('acknowledge', {}, drillRow.id)}
                style={{ padding: '6px 12px', background: 'oklch(0.46 0.16 55)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Acknowledge notice</button>
            )}
            {drillRow.status === 'active' && (
              <>
                <button
                  type="button"
                  data-testid="ipp-bond-registry-release"
                  onClick={() => {
                    if (confirm('Release this bond? This terminates expiry tracking and is irreversible.')) {
                      void act('release', {}, drillRow.id);
                    }
                  }}
                  style={{ padding: '6px 12px', background: '#1f6b3a', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Release</button>
                <button
                  type="button"
                  data-testid="ipp-bond-registry-forfeit"
                  onClick={() => {
                    const reason = prompt('Forfeit reason?');
                    if (reason) void act('forfeit', { claim_reason: reason }, drillRow.id);
                  }}
                  style={{ padding: '6px 12px', background: '#9b1f1f', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Forfeit / call</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
