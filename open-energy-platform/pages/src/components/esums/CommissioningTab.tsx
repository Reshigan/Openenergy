// Site commissioning chain — Wave 12 P6-grade tab for the Esums workstation.
//
// Surfaces the site-onboarding workflow:
//   • KPI strip: planned / in onboarding / energised / in O&M / failed
//   • Filter pills by commissioning state
//   • Site table with SLA countdown
//   • Drill-down with full audit-chain timeline + per-state action buttons
//
// Roles: admin/support/ipp/regulator/grid can read; action buttons are gated
// server-side and surface 403 as a toast.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { InlineHelp } from '../InlineHelp';

type CommissioningStatus =
  | 'planned' | 'site_registered' | 'devices_registered' | 'ingestion_wired'
  | 'first_telemetry_ok' | 'energised' | 'in_om'
  | 'commissioning_failed' | 'decommissioned';

interface SiteRow {
  id: string;
  name: string;
  technology: string | null;
  capacity_mw: number;
  province: string | null;
  status: string;
  commissioning_status: CommissioningStatus;
  commissioning_status_label?: string;
  is_terminal?: boolean;
  has_sla_window?: boolean;
  sla_deadline_at?: string | null;
  days_until_sla?: number | null;
  sla_breached?: boolean;
  devices_registered_at: string | null;
  ingestion_wired_at: string | null;
  first_telemetry_at: string | null;
  energised_at: string | null;
  in_om_at: string | null;
  commissioning_failure_reason: string | null;
  created_at: string;
}

interface CommissioningEvent {
  id: string;
  site_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string;
  actor_id: string;
  notes: string | null;
  body_json: string | null;
  created_at: string;
}

const TONE: Record<CommissioningStatus, { bg: string; fg: string; label: string }> = {
  planned:              { bg: '#f0f3f7', fg: '#445566', label: 'Planned' },
  site_registered:      { bg: '#dbecfb', fg: '#1a3a5c', label: 'Site registered' },
  devices_registered:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Devices registered' },
  ingestion_wired:      { bg: '#fff4d6', fg: '#a06200', label: 'Ingestion wired' },
  first_telemetry_ok:   { bg: '#daf5e2', fg: '#1f6b3a', label: 'First telemetry OK' },
  energised:            { bg: '#daf5e2', fg: '#1f6b3a', label: 'Energised' },
  in_om:                { bg: '#daf5e2', fg: '#1f6b3a', label: 'In O&M' },
  commissioning_failed: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Commissioning failed' },
  decommissioned:       { bg: '#e3e7ec', fg: '#557',    label: 'Decommissioned' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                 label: 'In onboarding' },
  { key: 'all',                  label: 'All' },
  { key: 'planned',              label: 'Planned' },
  { key: 'site_registered',      label: 'Registered' },
  { key: 'devices_registered',   label: 'Devices' },
  { key: 'ingestion_wired',      label: 'Ingestion' },
  { key: 'first_telemetry_ok',   label: 'Telemetry OK' },
  { key: 'energised',            label: 'Energised' },
  { key: 'in_om',                label: 'In O&M' },
  { key: 'commissioning_failed', label: 'Failed' },
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

function fmtSla(d: number | null | undefined, breached: boolean | undefined): string {
  if (d == null) return '—';
  if (breached) return `${-d}d overdue`;
  if (d === 0) return 'due today';
  if (d < 0) return `${-d}d overdue`;
  return `${d}d remaining`;
}

const IN_ONBOARDING = new Set<CommissioningStatus>([
  'planned', 'site_registered', 'devices_registered', 'ingestion_wired',
  'first_telemetry_ok', 'energised',
]);

export function CommissioningTab() {
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [filter, setFilter] = useState<string>('open');
  const [drill, setDrill] = useState<SiteRow | null>(null);
  const [drillEvents, setDrillEvents] = useState<CommissioningEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get<{ data: { items: SiteRow[] } }>('/esums/commissioning');
      setRows(r.data?.data?.items || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load chain.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'open') return rows.filter((r) => IN_ONBOARDING.has(r.commissioning_status));
    return rows.filter((r) => r.commissioning_status === filter);
  }, [rows, filter]);

  const kpis = useMemo(() => ({
    total:     rows.length,
    onboarding: rows.filter((r) => IN_ONBOARDING.has(r.commissioning_status) && r.commissioning_status !== 'energised').length,
    energised: rows.filter((r) => r.commissioning_status === 'energised').length,
    in_om:     rows.filter((r) => r.commissioning_status === 'in_om').length,
    failed:    rows.filter((r) => r.commissioning_status === 'commissioning_failed').length,
    breached:  rows.filter((r) => r.sla_breached).length,
  }), [rows]);

  const openDrill = useCallback(async (row: SiteRow) => {
    setDrill(row); setDrillEvents([]);
    try {
      const r = await api.get<{ data: { site: SiteRow; events: CommissioningEvent[] } }>(`/esums/commissioning/${row.id}`);
      setDrill(r.data?.data?.site || row);
      setDrillEvents(r.data?.data?.events || []);
    } catch {/* leave empty */}
  }, []);

  const act = useCallback(async (kind: string, payload: any, targetId: string) => {
    setError(null);
    try {
      await api.post(`/esums/commissioning/${targetId}/${kind}`, payload);
      await load();
      if (drill) await openDrill(drill);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Action failed.');
    }
  }, [load, openDrill, drill]);

  return (
    <div data-testid="esums-commissioning-tab" style={{ padding: '16px 20px', minHeight: 600 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1c2733', marginTop: 0 }}>Site commissioning chain</h2>
      <InlineHelp helpKey="esums.commissioning.intro" title="How commissioning works">
        Each site moves through fixed stages with an SLA per stage. Click a row to open its timeline and advance it.
        Miss an SLA and the site is flagged to its owner and the regulator.
      </InlineHelp>
      <p style={{ fontSize: 13, color: '#557', marginTop: 4 }}>
        Site onboarding workflow — planned → site registered → devices registered → ingestion wired →
        first telemetry OK → energised → in O&M. SLA windows: 14d / 14d / 7d / 30d per stage.
        Failure to onboard within SLA flags the site to regulator and owner.
      </p>

      <div data-testid="esums-commissioning-kpis" style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <Kpi label="Total" value={kpis.total} />
        <Kpi label="Onboarding" value={kpis.onboarding} sub="pre-energised" />
        <Kpi label="Energised" value={kpis.energised} sub="awaiting handover" />
        <Kpi label="In O&M" value={kpis.in_om} />
        <Kpi label="Failed" value={kpis.failed} sub="regulator inbox" />
        <Kpi label="SLA breached" value={kpis.breached} sub="needs attention" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            data-testid={`esums-commissioning-filter-${f.key}`}
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

      <div data-testid="esums-commissioning-table" style={{ marginTop: 14, background: '#fff', border: '1px solid #e3e7ec', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f6f8fb', textAlign: 'left', color: '#557' }}>
              <th style={{ padding: '8px 12px' }}>Site</th>
              <th style={{ padding: '8px 12px' }}>Tech</th>
              <th style={{ padding: '8px 12px', textAlign: 'right' }}>MW</th>
              <th style={{ padding: '8px 12px' }}>Province</th>
              <th style={{ padding: '8px 12px' }}>State</th>
              <th style={{ padding: '8px 12px' }}>SLA</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#7a8a9a' }}>
                {loading ? 'Loading…' : 'No sites in this view.'}
              </td></tr>
            )}
            {filtered.map((r) => {
              const tone = TONE[r.commissioning_status];
              return (
                <tr
                  key={r.id}
                  data-testid={`esums-commissioning-row-${r.id}`}
                  onClick={() => openDrill(r)}
                  style={{ borderTop: '1px solid #eef1f5', cursor: 'pointer' }}
                >
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: '8px 12px' }}>{r.technology ?? '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{Number(r.capacity_mw).toFixed(1)}</td>
                  <td style={{ padding: '8px 12px' }}>{r.province ?? '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ background: tone.bg, color: tone.fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {tone.label}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 12, color: r.sla_breached ? '#9b1f1f' : '#557' }}>
                    {fmtSla(r.days_until_sla, r.sla_breached)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {drill && (
        <div
          data-testid="esums-commissioning-drill"
          style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 560, background: '#fff',
            borderLeft: '1px solid #e3e7ec', boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
            zIndex: 50, padding: 20, overflowY: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setDrill(null)}
            style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}
          >×</button>
          <h3 style={{ marginTop: 0, fontSize: 17 }}>{drill.name}</h3>
          <div style={{ fontSize: 12, color: '#557' }}>
            {drill.id} · {drill.technology ?? '—'} · {Number(drill.capacity_mw).toFixed(1)} MW · {drill.province ?? '—'}
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
            <div><span style={{ color: '#557' }}>State:</span> <strong>{TONE[drill.commissioning_status].label}</strong></div>
            {drill.sla_deadline_at && (
              <div><span style={{ color: '#557' }}>SLA due:</span> <strong>{drill.sla_deadline_at.slice(0, 10)}</strong></div>
            )}
            {drill.energised_at && (
              <div><span style={{ color: '#557' }}>Energised:</span> <strong>{drill.energised_at.slice(0, 10)}</strong></div>
            )}
          </div>

          {drill.commissioning_failure_reason && (
            <div style={{ marginTop: 10, padding: 10, background: '#fde0e0', color: '#9b1f1f', borderRadius: 6, fontSize: 12 }}>
              <strong>Failure reason:</strong> {drill.commissioning_failure_reason}
            </div>
          )}

          <h4 style={{ marginTop: 18, fontSize: 13, color: '#557' }}>Commissioning timeline</h4>
          <div data-testid="esums-commissioning-events" style={{ marginTop: 6, maxHeight: 320, overflowY: 'auto' }}>
            {drillEvents.length === 0 && (
              <div style={{ fontSize: 12, color: '#7a8a9a' }}>No events recorded.</div>
            )}
            {drillEvents.map((ev) => (
              <div
                key={ev.id}
                data-testid={`esums-commissioning-event-${ev.id}`}
                style={{ padding: '8px 10px', borderBottom: '1px solid #eef1f5' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{ev.event_type}</div>
                  <span style={{ fontSize: 10, color: '#7a8a9a' }}>{ev.created_at.slice(0, 16).replace('T', ' ')}</span>
                </div>
                <div style={{ marginTop: 2, fontSize: 12 }}>{ev.notes ?? ''}</div>
                <div style={{ marginTop: 2, fontSize: 11, color: '#557', fontFamily: 'monospace' }}>
                  {ev.from_status ?? '∅'} → {ev.to_status}
                </div>
              </div>
            ))}
          </div>

          <div data-testid="esums-commissioning-actions" style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {drill.commissioning_status === 'planned' && (
              <button type="button" data-testid="esums-commissioning-register-site"
                onClick={() => void act('register-site', {}, drill.id)}
                style={{ padding: '6px 12px', background: '#1c2733', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Register site</button>
            )}
            {drill.commissioning_status === 'site_registered' && (
              <button type="button" data-testid="esums-commissioning-register-devices"
                onClick={() => void act('register-devices', {}, drill.id)}
                style={{ padding: '6px 12px', background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Register devices</button>
            )}
            {drill.commissioning_status === 'devices_registered' && (
              <button type="button" data-testid="esums-commissioning-wire-ingestion"
                onClick={() => void act('wire-ingestion', {}, drill.id)}
                style={{ padding: '6px 12px', background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Wire ingestion adapter</button>
            )}
            {drill.commissioning_status === 'ingestion_wired' && (
              <button type="button" data-testid="esums-commissioning-first-telemetry"
                onClick={() => void act('first-telemetry', {}, drill.id)}
                style={{ padding: '6px 12px', background: '#1f6b3a', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Mark first telemetry OK</button>
            )}
            {drill.commissioning_status === 'first_telemetry_ok' && (
              <button type="button" data-testid="esums-commissioning-energise"
                onClick={() => void act('energise', {}, drill.id)}
                style={{ padding: '6px 12px', background: '#1f6b3a', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Energise</button>
            )}
            {drill.commissioning_status === 'energised' && (
              <button type="button" data-testid="esums-commissioning-handover-om"
                onClick={() => void act('handover-om', {}, drill.id)}
                style={{ padding: '6px 12px', background: '#1c2733', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Handover to O&M</button>
            )}
            {!drill.is_terminal && drill.commissioning_status !== 'planned' && (
              <button type="button" data-testid="esums-commissioning-mark-failed"
                onClick={() => {
                  const reason = prompt('Mark commissioning failed — provide reason:');
                  if (reason) void act('mark-failed', { reason }, drill.id);
                }}
                style={{ padding: '6px 12px', background: '#9b1f1f', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Mark failed</button>
            )}
            {(drill.commissioning_status === 'energised' || drill.commissioning_status === 'in_om') && (
              <button type="button" data-testid="esums-commissioning-decommission"
                onClick={() => {
                  if (confirm('Decommission this site? This is terminal.')) {
                    void act('decommission', {}, drill.id);
                  }
                }}
                style={{ padding: '6px 12px', background: '#557', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Decommission</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
