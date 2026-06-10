// Wave 13 — Grid operator dispatch nomination chain tab.
//
// Per-day BRP nomination → SO acceptance → activation → performance →
// settlement lifecycle, surfaced as a P6 audit chain with SLA countdowns.
//
//   • KPI strip: total, in-progress (pre-settled), settled, rejected, disputed, breached
//   • Filter pills by nomination state
//   • Listing with SLA countdown (minutes, with overdue flagging)
//   • Drill-down: timeline + per-state action buttons (8 actions across 4 roles)
//
// Roles: admin/support/ipp/grid/regulator/trader can read; action buttons
// are gated server-side and surface 403 as a toast.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type NominationStatus =
  | 'nominated' | 'accepted' | 'activated' | 'performance_recorded'
  | 'settled' | 'closed' | 'nomination_rejected'
  | 'disputed' | 'dispute_resolved' | 'closed_disputed';

interface NominationRow {
  id: string;
  participant_id: string;
  trading_day: string;
  schedule_type: string;
  scheduled_mwh: number | null;
  actual_mwh: number | null;
  imbalance_mwh: number | null;
  charge_zar: number | null;
  nomination_status: NominationStatus;
  nomination_status_label?: string;
  is_terminal?: boolean;
  has_sla_window?: boolean;
  sla_deadline_at?: string | null;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  rejection_reason: string | null;
  dispute_reason: string | null;
  dispute_resolution: string | null;
  created_at: string;
}

interface NomEvent {
  id: string;
  nomination_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload_json: string | null;
  created_at: string;
}

const TONE: Record<NominationStatus, { bg: string; fg: string; label: string }> = {
  nominated:            { bg: '#dbecfb', fg: '#1a3a5c', label: 'Nominated' },
  accepted:             { bg: '#dbecfb', fg: '#1a3a5c', label: 'Accepted' },
  activated:            { bg: '#fff4d6', fg: '#a06200', label: 'Activated' },
  performance_recorded: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Performance recorded' },
  settled:              { bg: '#daf5e2', fg: '#1f6b3a', label: 'Settled' },
  closed:               { bg: '#e3e7ec', fg: '#557',    label: 'Closed' },
  nomination_rejected:  { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rejected' },
  disputed:             { bg: '#fde0e0', fg: '#9b1f1f', label: 'Disputed' },
  dispute_resolved:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Dispute resolved' },
  closed_disputed:      { bg: '#e3e7ec', fg: '#557',    label: 'Closed (post-dispute)' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                 label: 'Live (pre-close)' },
  { key: 'all',                  label: 'All' },
  { key: 'nominated',            label: 'Awaiting SO' },
  { key: 'accepted',             label: 'Accepted' },
  { key: 'activated',            label: 'In delivery' },
  { key: 'performance_recorded', label: 'Performance recorded' },
  { key: 'settled',              label: 'Settled' },
  { key: 'closed',               label: 'Closed' },
  { key: 'nomination_rejected',  label: 'Rejected' },
  { key: 'disputed',             label: 'Disputed' },
];

const IN_OPEN = new Set<NominationStatus>([
  'nominated', 'accepted', 'activated', 'performance_recorded',
  'settled', 'disputed',
]);

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e3e7ec', borderRadius: 8, padding: '12px 16px', minWidth: 150 }}>
      <div style={{ fontSize: 11, color: '#557', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#0f1c2e', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#7a8a9a', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function fmtSla(m: number | null | undefined, breached: boolean | undefined): string {
  if (m == null) return '—';
  if (breached) {
    const overdue = -m;
    if (overdue >= 1440) return `${Math.floor(overdue / 1440)}d overdue`;
    if (overdue >= 60)   return `${Math.floor(overdue / 60)}h overdue`;
    return `${overdue}m overdue`;
  }
  if (m === 0) return 'due now';
  if (m < 0)   return `${-m}m overdue`;
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h left`;
  if (m >= 60)   return `${Math.floor(m / 60)}h ${m % 60}m left`;
  return `${m}m left`;
}

export function DispatchNominationTab() {
  const [rows, setRows] = useState<NominationRow[]>([]);
  const [filter, setFilter] = useState<string>('open');
  const [drill, setDrill] = useState<NominationRow | null>(null);
  const [drillEvents, setDrillEvents] = useState<NomEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get<{ data: { items: NominationRow[] } }>('/grid/dispatch-nominations');
      setRows(r.data?.data?.items || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load chain.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all')  return rows;
    if (filter === 'open') return rows.filter((r) => IN_OPEN.has(r.nomination_status));
    return rows.filter((r) => r.nomination_status === filter);
  }, [rows, filter]);

  const kpis = useMemo(() => ({
    total:     rows.length,
    in_progress: rows.filter((r) => IN_OPEN.has(r.nomination_status) && r.nomination_status !== 'settled').length,
    settled:   rows.filter((r) => r.nomination_status === 'settled').length,
    rejected:  rows.filter((r) => r.nomination_status === 'nomination_rejected').length,
    disputed:  rows.filter((r) => r.nomination_status === 'disputed').length,
    breached:  rows.filter((r) => r.sla_breached).length,
  }), [rows]);

  const openDrill = useCallback(async (row: NominationRow) => {
    setDrill(row); setDrillEvents([]);
    try {
      const r = await api.get<{ data: { nomination: NominationRow; events: NomEvent[] } }>(`/grid/dispatch-nominations/${row.id}`);
      setDrill(r.data?.data?.nomination || row);
      setDrillEvents(r.data?.data?.events || []);
    } catch {/* leave empty */}
  }, []);

  const act = useCallback(async (kind: string, payload: any, targetId: string) => {
    setError(null);
    try {
      await api.post(`/grid/dispatch-nominations/${targetId}/${kind}`, payload);
      await load();
      if (drill) await openDrill(drill);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Action failed.');
    }
  }, [load, openDrill, drill]);

  return (
    <div data-testid="grid-dispatch-nominations-tab" style={{ padding: '16px 20px', minHeight: 600 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f1c2e', marginTop: 0 }}>Dispatch nomination chain</h2>
      <p style={{ fontSize: 13, color: '#557', marginTop: 4 }}>
        Day-ahead BRP nomination → SO acceptance → activation → performance recording →
        settlement → close. SLA windows: 15m / 30m / 60m / 5d / 15d / 10d per stage.
        Rejection, dispute and SLA breaches escalate to the regulator inbox.
      </p>

      <div data-testid="grid-dispatch-nominations-kpis" style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <Kpi label="Total" value={kpis.total} />
        <Kpi label="In progress" value={kpis.in_progress} sub="pre-settled" />
        <Kpi label="Settled" value={kpis.settled} sub="awaiting close" />
        <Kpi label="Rejected" value={kpis.rejected} sub="regulator inbox" />
        <Kpi label="Disputed" value={kpis.disputed} sub="regulator inbox" />
        <Kpi label="SLA breached" value={kpis.breached} sub="needs action" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            data-testid={`grid-dispatch-nominations-filter-${f.key}`}
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

      <div data-testid="grid-dispatch-nominations-table" style={{ marginTop: 14, background: '#fff', border: '1px solid #e3e7ec', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f6f8fb', textAlign: 'left', color: '#557' }}>
              <th style={{ padding: '8px 12px' }}>Participant</th>
              <th style={{ padding: '8px 12px' }}>Trading day</th>
              <th style={{ padding: '8px 12px' }}>Type</th>
              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Sched MWh</th>
              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actual MWh</th>
              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Δ MWh</th>
              <th style={{ padding: '8px 12px' }}>State</th>
              <th style={{ padding: '8px 12px' }}>SLA</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#7a8a9a' }}>
                {loading ? 'Loading…' : 'No nominations in this view.'}
              </td></tr>
            )}
            {filtered.map((r) => {
              const tone = TONE[r.nomination_status];
              return (
                <tr
                  key={r.id}
                  data-testid={`grid-dispatch-nominations-row-${r.id}`}
                  onClick={() => openDrill(r)}
                  style={{ borderTop: '1px solid #eef1f5', cursor: 'pointer' }}
                >
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.participant_id}</td>
                  <td style={{ padding: '8px 12px' }}>{r.trading_day}</td>
                  <td style={{ padding: '8px 12px' }}>{r.schedule_type}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{r.scheduled_mwh != null ? r.scheduled_mwh.toFixed(1) : '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{r.actual_mwh != null ? r.actual_mwh.toFixed(1) : '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: (r.imbalance_mwh ?? 0) < 0 ? '#9b1f1f' : (r.imbalance_mwh ?? 0) > 0 ? '#1f6b3a' : '#557' }}>
                    {r.imbalance_mwh != null ? r.imbalance_mwh.toFixed(1) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ background: tone.bg, color: tone.fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {tone.label}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 12, color: r.sla_breached ? '#9b1f1f' : '#557' }}>
                    {fmtSla(r.minutes_until_sla, r.sla_breached)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {drill && (
        <div
          data-testid="grid-dispatch-nominations-drill"
          style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 580, background: '#fff',
            borderLeft: '1px solid #e3e7ec', boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
            zIndex: 50, padding: 20, overflowY: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setDrill(null)}
            style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}
          >×</button>
          <h3 style={{ marginTop: 0, fontSize: 17 }}>{drill.id}</h3>
          <div style={{ fontSize: 12, color: '#557' }}>
            {drill.participant_id} · {drill.trading_day} · {drill.schedule_type}
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
            <div><span style={{ color: '#557' }}>State:</span> <strong>{TONE[drill.nomination_status].label}</strong></div>
            {drill.sla_deadline_at && (
              <div><span style={{ color: '#557' }}>SLA due:</span> <strong>{drill.sla_deadline_at.replace('T', ' ').slice(0, 16)}</strong></div>
            )}
            {drill.scheduled_mwh != null && (
              <div><span style={{ color: '#557' }}>Sched:</span> <strong>{drill.scheduled_mwh.toFixed(1)} MWh</strong></div>
            )}
            {drill.actual_mwh != null && (
              <div><span style={{ color: '#557' }}>Actual:</span> <strong>{drill.actual_mwh.toFixed(1)} MWh</strong></div>
            )}
            {drill.charge_zar != null && (
              <div><span style={{ color: '#557' }}>Charge:</span> <strong>R{Math.round(drill.charge_zar).toLocaleString()}</strong></div>
            )}
          </div>

          {drill.rejection_reason && (
            <div style={{ marginTop: 10, padding: 10, background: '#fde0e0', color: '#9b1f1f', borderRadius: 6, fontSize: 12 }}>
              <strong>Rejection reason:</strong> {drill.rejection_reason}
            </div>
          )}
          {drill.dispute_reason && (
            <div style={{ marginTop: 10, padding: 10, background: '#fde0e0', color: '#9b1f1f', borderRadius: 6, fontSize: 12 }}>
              <strong>Dispute reason:</strong> {drill.dispute_reason}
            </div>
          )}
          {drill.dispute_resolution && (
            <div style={{ marginTop: 10, padding: 10, background: '#daf5e2', color: '#1f6b3a', borderRadius: 6, fontSize: 12 }}>
              <strong>Dispute resolution:</strong> {drill.dispute_resolution}
            </div>
          )}

          <h4 style={{ marginTop: 18, fontSize: 13, color: '#557' }}>Chain timeline</h4>
          <div data-testid="grid-dispatch-nominations-events" style={{ marginTop: 6, maxHeight: 320, overflowY: 'auto' }}>
            {drillEvents.length === 0 && (
              <div style={{ fontSize: 12, color: '#7a8a9a' }}>No events recorded.</div>
            )}
            {drillEvents.map((ev) => (
              <div
                key={ev.id}
                data-testid={`grid-dispatch-nominations-event-${ev.id}`}
                style={{ padding: '8px 10px', borderBottom: '1px solid #eef1f5' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{ev.event_type}</div>
                  <span style={{ fontSize: 10, color: '#7a8a9a' }}>{ev.created_at.slice(0, 16).replace('T', ' ')}</span>
                </div>
                <div style={{ marginTop: 2, fontSize: 12 }}>{ev.notes ?? ''}</div>
                <div style={{ marginTop: 2, fontSize: 11, color: '#557', fontFamily: 'monospace' }}>
                  {ev.from_status ?? '∅'} → {ev.to_status ?? '∅'}
                </div>
              </div>
            ))}
          </div>

          <div data-testid="grid-dispatch-nominations-actions" style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {drill.nomination_status === 'nominated' && (
              <>
                <button type="button" data-testid="grid-dispatch-nominations-accept"
                  onClick={() => void act('accept', {}, drill.id)}
                  style={{ padding: '6px 12px', background: '#1f6b3a', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Accept</button>
                <button type="button" data-testid="grid-dispatch-nominations-reject"
                  onClick={() => {
                    const reason = prompt('Reject nomination — provide reason:');
                    if (reason) void act('reject', { reason }, drill.id);
                  }}
                  style={{ padding: '6px 12px', background: '#9b1f1f', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Reject</button>
              </>
            )}
            {drill.nomination_status === 'accepted' && (
              <button type="button" data-testid="grid-dispatch-nominations-activate"
                onClick={() => void act('activate', {}, drill.id)}
                style={{ padding: '6px 12px', background: 'oklch(0.46 0.16 55)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Activate (publish)</button>
            )}
            {drill.nomination_status === 'activated' && (
              <button type="button" data-testid="grid-dispatch-nominations-record"
                onClick={() => {
                  const raw = prompt('Record performance — actual MWh delivered:');
                  const actual_mwh = raw ? Number(raw) : NaN;
                  if (Number.isFinite(actual_mwh)) void act('record-performance', { actual_mwh }, drill.id);
                }}
                style={{ padding: '6px 12px', background: '#1f6b3a', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Record performance</button>
            )}
            {drill.nomination_status === 'performance_recorded' && (
              <>
                <button type="button" data-testid="grid-dispatch-nominations-settle"
                  onClick={() => {
                    const raw = prompt('Settle — charge in ZAR (negative for credit):');
                    const charge_zar = raw ? Number(raw) : NaN;
                    if (Number.isFinite(charge_zar)) void act('settle', { charge_zar }, drill.id);
                  }}
                  style={{ padding: '6px 12px', background: 'oklch(0.46 0.16 55)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Settle</button>
                <button type="button" data-testid="grid-dispatch-nominations-raise-dispute"
                  onClick={() => {
                    const reason = prompt('Raise dispute — provide reason:');
                    if (reason) void act('raise-dispute', { reason }, drill.id);
                  }}
                  style={{ padding: '6px 12px', background: '#9b1f1f', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Raise dispute</button>
              </>
            )}
            {drill.nomination_status === 'settled' && (
              <>
                <button type="button" data-testid="grid-dispatch-nominations-close"
                  onClick={() => void act('close', {}, drill.id)}
                  style={{ padding: '6px 12px', background: '#557', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Close</button>
                <button type="button" data-testid="grid-dispatch-nominations-raise-dispute"
                  onClick={() => {
                    const reason = prompt('Raise post-settlement dispute — provide reason:');
                    if (reason) void act('raise-dispute', { reason }, drill.id);
                  }}
                  style={{ padding: '6px 12px', background: '#9b1f1f', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Raise dispute</button>
              </>
            )}
            {drill.nomination_status === 'disputed' && (
              <button type="button" data-testid="grid-dispatch-nominations-resolve"
                onClick={() => {
                  const resolution = prompt('Resolve dispute — provide resolution:');
                  if (resolution) void act('resolve-dispute', { resolution }, drill.id);
                }}
                style={{ padding: '6px 12px', background: '#1f6b3a', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Resolve dispute</button>
            )}
            {drill.nomination_status === 'dispute_resolved' && (
              <button type="button" data-testid="grid-dispatch-nominations-close-disputed"
                onClick={() => void act('close-disputed', {}, drill.id)}
                style={{ padding: '6px 12px', background: '#557', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Close (post-dispute)</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
