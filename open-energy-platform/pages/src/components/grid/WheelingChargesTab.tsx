// Grid wheeling charges — Wave 8 P6-grade monthly reconciliation surface.
//
// Lives on the Grid Operator suite. Surfaces:
//   • Monthly wheeling charges per agreement
//   • Charge breakdown (transmission MWh × tariff + loss + ancillaries)
//   • Dispute lifecycle (raise → resolve → escalate) with countdown
//   • Inline actions for offtaker (raise dispute, pay) and grid operator
//     (issue charge, resolve dispute)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type Status = 'open' | 'disputed' | 'reconciled' | 'paid' | 'escalated';
type DisputeStatus = 'open' | 'resolved' | 'escalated';

interface ChargeRow {
  id: string;
  agreement_id: string;
  period_month: string;
  transmission_mwh: number;
  tariff_zar_per_mwh: number;
  loss_factor_pct: number;
  loss_mwh: number;
  gross_zar: number;
  loss_zar: number;
  ancillaries_zar: number;
  total_zar: number;
  status: Status;
  dispute_deadline_at: string | null;
  paid_at: string | null;
  paid_amount_zar: number | null;
  escalated_at: string | null;
  escalated_to: string | null;
  notes: string | null;
}

interface DisputeRow {
  id: string;
  charge_id: string;
  raised_by: string;
  raised_at: string;
  dispute_reason: string;
  claimed_amount_zar: number | null;
  status: DisputeStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_amount_zar: number | null;
  resolution_notes: string | null;
}

const STATUS_TONE: Record<Status, { bg: string; fg: string; label: string }> = {
  open: { bg: '#f0f3f7', fg: '#445566', label: 'Open' },
  disputed: { bg: '#fff4d6', fg: '#a06200', label: 'Disputed' },
  reconciled: { bg: '#e0ecff', fg: '#1f4b9b', label: 'Reconciled' },
  paid: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Paid' },
  escalated: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Escalated' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open_disputed', label: 'Open + disputed' },
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'disputed', label: 'Disputed' },
  { key: 'paid', label: 'Paid' },
  { key: 'escalated', label: 'Escalated' },
];

function msUntil(deadline: string | null): { bg: string; fg: string; label: string } {
  if (!deadline) return { bg: '#f0f3f7', fg: '#445566', label: '—' };
  const due = new Date(deadline).getTime();
  const now = Date.now();
  const ms = due - now;
  if (ms < 0) return { bg: '#fde0e0', fg: '#9b1f1f', label: `Overdue ${humanise(-ms)}` };
  return { bg: '#daf5e2', fg: '#1f6b3a', label: `In ${humanise(ms)}` };
}

function humanise(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e3e7ec', borderRadius: 8, padding: '12px 16px', minWidth: 140 }}>
      <div style={{ fontSize: 11, color: '#557', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#0f1c2e', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#7a8a9a', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function WheelingChargesTab({ scope = 'grid' }: { scope?: 'grid' | 'offtaker' } = {}) {
  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [filter, setFilter] = useState<string>('open_disputed');
  const [drillRow, setDrillRow] = useState<ChargeRow | null>(null);
  const [drillDisputes, setDrillDisputes] = useState<DisputeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get<{ data: ChargeRow[] }>('/grid/wheeling-charges');
      setRows(r.data?.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load wheeling charges.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'open_disputed') {
      return rows.filter((r) => r.status === 'open' || r.status === 'disputed');
    }
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const kpis = useMemo(() => ({
    total: rows.length,
    transmission: rows.reduce((acc, r) => acc + Number(r.transmission_mwh || 0), 0),
    billed: rows.reduce((acc, r) => acc + Number(r.total_zar || 0), 0),
    disputed: rows.filter((r) => r.status === 'disputed').length,
    escalated: rows.filter((r) => r.status === 'escalated').length,
    paid: rows.filter((r) => r.status === 'paid').length,
  }), [rows]);

  const openDrill = useCallback(async (row: ChargeRow) => {
    setDrillRow(row); setDrillDisputes([]);
    try {
      const r = await api.get<{ data: { charge: ChargeRow; disputes: DisputeRow[] } }>(`/grid/wheeling-charges/${row.id}`);
      setDrillDisputes(r.data?.data?.disputes || []);
    } catch {/* leave empty */}
  }, []);

  const act = useCallback(async (
    action: 'dispute' | 'pay' | 'resolve',
    payload: any,
    targetId: string,
  ) => {
    setError(null);
    try {
      if (action === 'dispute') await api.post(`/grid/wheeling-charges/${targetId}/dispute`, payload);
      else if (action === 'pay') await api.post(`/grid/wheeling-charges/${targetId}/pay`, payload);
      else if (action === 'resolve') await api.post(`/grid/wheeling-charges/disputes/${targetId}/resolve`, payload);
      await load();
      if (drillRow) await openDrill({ ...drillRow });
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Action failed.');
    }
  }, [load, openDrill, drillRow]);

  return (
    <div data-testid="grid-wheeling-charges-tab" style={{ padding: '16px 20px', minHeight: 600 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f1c2e', marginTop: 0 }}>Wheeling charges</h2>
      <p style={{ fontSize: 13, color: '#557', marginTop: 4 }}>
        {scope === 'offtaker'
          ? 'Monthly wheeling charges billed to you against active wheeling agreements. Raise a dispute within 14 days; unresolved disputes escalate to the regulator inbox automatically.'
          : 'Monthly transmission-charge reconciliation against active wheeling agreements. Dispute window is 14 days; expired disputed rows escalate to the regulator inbox automatically.'}
      </p>

      <div data-testid="grid-wheeling-charges-kpis" style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <Kpi label="Total charges" value={kpis.total} />
        <Kpi label="Transmission (MWh)" value={Math.round(kpis.transmission).toLocaleString()} />
        <Kpi label="Billed (ZAR)" value={`R${Math.round(kpis.billed).toLocaleString()}`} />
        <Kpi label="Open disputes" value={kpis.disputed} />
        <Kpi label="Escalated" value={kpis.escalated} sub="regulator inbox" />
        <Kpi label="Paid" value={kpis.paid} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            data-testid={`grid-wheeling-charges-filter-${f.key}`}
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

      <div data-testid="grid-wheeling-charges-table" style={{ marginTop: 14, background: '#fff', border: '1px solid #e3e7ec', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f6f8fb', textAlign: 'left', color: '#557' }}>
              <th style={{ padding: '8px 12px' }}>Period</th>
              <th style={{ padding: '8px 12px' }}>Agreement</th>
              <th style={{ padding: '8px 12px' }}>Transmission MWh</th>
              <th style={{ padding: '8px 12px' }}>Total ZAR</th>
              <th style={{ padding: '8px 12px' }}>Status</th>
              <th style={{ padding: '8px 12px' }}>Dispute deadline</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#7a8a9a' }}>
                {loading ? 'Loading…' : 'No wheeling charges in this view.'}
              </td></tr>
            )}
            {filtered.map((r) => {
              const tone = STATUS_TONE[r.status];
              const cd = msUntil(r.dispute_deadline_at);
              return (
                <tr
                  key={r.id}
                  data-testid={`grid-wheeling-charges-row-${r.id}`}
                  onClick={() => openDrill(r)}
                  style={{ borderTop: '1px solid #eef1f5', cursor: 'pointer' }}
                >
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.period_month}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>{r.agreement_id}</td>
                  <td style={{ padding: '8px 12px' }}>{Math.round(r.transmission_mwh).toLocaleString()}</td>
                  <td style={{ padding: '8px 12px' }}>R{Math.round(r.total_zar).toLocaleString()}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ background: tone.bg, color: tone.fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {tone.label}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ background: cd.bg, color: cd.fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {cd.label}
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
          data-testid="grid-wheeling-charges-drill"
          style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, background: '#fff',
            borderLeft: '1px solid #e3e7ec', boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
            zIndex: 50, padding: 20, overflowY: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setDrillRow(null)}
            style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}
          >×</button>
          <h3 style={{ marginTop: 0, fontSize: 17 }}>Charge {drillRow.id}</h3>
          <div style={{ fontSize: 13, color: '#557' }}>{drillRow.agreement_id} · {drillRow.period_month}</div>

          <table style={{ marginTop: 12, width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ padding: '4px 8px', color: '#557' }}>Transmission MWh</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{drillRow.transmission_mwh.toLocaleString()}</td></tr>
              <tr><td style={{ padding: '4px 8px', color: '#557' }}>Tariff R/MWh</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>R{drillRow.tariff_zar_per_mwh}</td></tr>
              <tr><td style={{ padding: '4px 8px', color: '#557' }}>Loss factor</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{drillRow.loss_factor_pct}% ({drillRow.loss_mwh} MWh)</td></tr>
              <tr><td style={{ padding: '4px 8px', color: '#557' }}>Gross</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>R{drillRow.gross_zar.toLocaleString()}</td></tr>
              <tr><td style={{ padding: '4px 8px', color: '#557' }}>Loss</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>R{drillRow.loss_zar.toLocaleString()}</td></tr>
              <tr><td style={{ padding: '4px 8px', color: '#557' }}>Ancillaries</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>R{drillRow.ancillaries_zar.toLocaleString()}</td></tr>
              <tr><td style={{ padding: '4px 8px', fontWeight: 700 }}>Total</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>R{drillRow.total_zar.toLocaleString()}</td></tr>
            </tbody>
          </table>

          <h4 style={{ marginTop: 18, fontSize: 13, color: '#557' }}>Disputes</h4>
          <div data-testid="grid-wheeling-charges-disputes">
            {drillDisputes.length === 0 && <div style={{ fontSize: 12, color: '#7a8a9a' }}>No disputes raised.</div>}
            {drillDisputes.map((d) => (
              <div key={d.id} style={{ marginTop: 8, padding: 10, background: '#f6f8fb', borderRadius: 6 }}>
                <div style={{ fontSize: 12, color: '#0f1c2e', fontWeight: 600 }}>
                  {d.status.toUpperCase()} · raised {new Date(d.raised_at).toLocaleDateString()}
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>{d.dispute_reason}</div>
                {d.claimed_amount_zar != null && (
                  <div style={{ fontSize: 12, marginTop: 4, color: '#557' }}>Claimed: R{Math.round(d.claimed_amount_zar).toLocaleString()}</div>
                )}
                {d.resolution_amount_zar != null && (
                  <div style={{ fontSize: 12, marginTop: 4, color: '#1f6b3a' }}>Resolved at R{Math.round(d.resolution_amount_zar).toLocaleString()}</div>
                )}
                {d.status === 'open' && (
                  <button
                    type="button"
                    data-testid={`grid-wheeling-charges-resolve-${d.id}`}
                    onClick={() => {
                      const amt = prompt('Resolved amount (ZAR)?', String(d.claimed_amount_zar ?? drillRow.total_zar));
                      if (amt) void act('resolve', { resolution_amount_zar: Number(amt), resolution_notes: 'Resolved from UI' }, d.id);
                    }}
                    style={{ marginTop: 6, padding: '4px 10px', background: 'oklch(0.46 0.16 55)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
                  >Resolve dispute</button>
                )}
              </div>
            ))}
          </div>

          <div data-testid="grid-wheeling-charges-actions" style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(drillRow.status === 'open' || drillRow.status === 'disputed') && (
              <button
                type="button"
                data-testid="grid-wheeling-charges-dispute"
                onClick={() => {
                  const reason = prompt('Dispute reason?');
                  if (reason) void act('dispute', { dispute_reason: reason }, drillRow.id);
                }}
                style={{ padding: '6px 12px', background: '#a06200', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Raise dispute</button>
            )}
            {(drillRow.status === 'open' || drillRow.status === 'reconciled' || drillRow.status === 'disputed') && (
              <button
                type="button"
                data-testid="grid-wheeling-charges-pay"
                onClick={() => {
                  const amt = prompt('Paid amount (ZAR)?', String(drillRow.total_zar));
                  if (amt) void act('pay', { paid_amount_zar: Number(amt) }, drillRow.id);
                }}
                style={{ padding: '6px 12px', background: '#1f6b3a', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Mark paid</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
