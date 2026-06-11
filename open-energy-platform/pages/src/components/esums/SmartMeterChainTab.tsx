// Wave 199 - L4 smart-meter commissioning tab for the Esums workstation.
// Structural twin of CommissioningTab: KPI strip + filter pills + table + drill drawer
// (timeline + per-state actions) + self-serve create form.
// Route: /api/smart-meter-assets

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { InlineHelp } from '../InlineHelp';
import { OnboardingTour } from '../OnboardingTour';

type SmaStatus =
  | 'ordered' | 'factory_acceptance' | 'site_delivery' | 'installation_pending'
  | 'installed' | 'commissioning' | 'communication_test' | 'data_quality_pass'
  | 'operational' | 'fault_detected' | 'replacement_pending' | 'decommissioned';

interface MeterRow {
  id: string; meter_serial: string; meter_class: string; site_id: string;
  owner_id: string; chain_status: SmaStatus; sla_deadline: string | null;
  sla_breached: number; make_model: string | null; created_at: string;
}
interface TimelineEvent { id: string; event_type: string; created_at: string; actor_id?: string; }

const TONE: Record<SmaStatus, { bg: string; fg: string; label: string }> = {
  ordered:              { bg: '#f0f3f7', fg: '#445566', label: 'Ordered' },
  factory_acceptance:   { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Factory acceptance' },
  site_delivery:        { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Delivered' },
  installation_pending: { bg: '#fff4d6', fg: '#a06200', label: 'Install pending' },
  installed:            { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Installed' },
  commissioning:        { bg: '#fff4d6', fg: '#a06200', label: 'Commissioning' },
  communication_test:   { bg: '#fff4d6', fg: '#a06200', label: 'Comms test' },
  data_quality_pass:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Data quality OK' },
  operational:          { bg: '#daf5e2', fg: '#1f6b3a', label: 'Operational' },
  fault_detected:       { bg: '#fde0e0', fg: '#9b1f1f', label: 'Fault' },
  replacement_pending:  { bg: '#fff4d6', fg: '#a06200', label: 'Replacement pending' },
  decommissioned:       { bg: '#e3e7ec', fg: '#557', label: 'Decommissioned' },
};

const ACTIONS: Array<{ action: string; label: string; from: SmaStatus[]; danger?: boolean }> = [
  { action: 'confirm_fat',           label: 'Confirm FAT',          from: ['ordered', 'factory_acceptance'] },
  { action: 'confirm_delivery',      label: 'Confirm delivery',     from: ['factory_acceptance'] },
  { action: 'schedule_installation', label: 'Schedule install',     from: ['site_delivery', 'installation_pending'] },
  { action: 'confirm_installed',     label: 'Confirm installed',    from: ['installation_pending'] },
  { action: 'start_commissioning',   label: 'Start commissioning',  from: ['installed'] },
  { action: 'confirm_communication', label: 'Confirm comms',        from: ['commissioning'] },
  { action: 'pass_data_quality',     label: 'Pass data quality',    from: ['communication_test'] },
  { action: 'go_live',               label: 'Go live',              from: ['data_quality_pass'] },
  { action: 'report_fault',          label: 'Report fault',         from: ['operational', 'commissioning', 'communication_test', 'data_quality_pass'], danger: true },
  { action: 'schedule_replacement',  label: 'Schedule replacement', from: ['fault_detected'] },
  { action: 'return_to_service',     label: 'Return to service',    from: ['fault_detected'] },
  { action: 'decommission',          label: 'Decommission',         from: ['fault_detected', 'replacement_pending', 'operational', 'installed'], danger: true },
];

const FILTERS = [
  { key: 'open', label: 'In progress' }, { key: 'all', label: 'All' },
  { key: 'operational', label: 'Operational' }, { key: 'fault_detected', label: 'Faults' },
  { key: 'decommissioned', label: 'Decommissioned' },
];
const TERMINAL = new Set<SmaStatus>(['operational', 'decommissioned']);

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e3e7ec', borderRadius: 8, padding: '12px 16px', minWidth: 140 }}>
      <div style={{ fontSize: 11, color: '#557', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#0f1c2e', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#7a8a9a', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function slaText(deadline: string | null, breached: number): string {
  if (!deadline) return '—';
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (breached || days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'due today';
  return `${days}d remaining`;
}

export function SmartMeterChainTab() {
  const [rows, setRows] = useState<MeterRow[]>([]);
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState('open');
  const [drill, setDrill] = useState<MeterRow | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ meter_serial: '', site_id: '', meter_class: 'post_paid' });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get('/smart-meter-assets');
      setRows(r.data?.data || []);
      setKpis(r.data?.kpis || {});
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load meters.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'open') return rows.filter((r) => !TERMINAL.has(r.chain_status));
    return rows.filter((r) => r.chain_status === (filter as SmaStatus));
  }, [rows, filter]);

  const openDrill = useCallback(async (row: MeterRow) => {
    setDrill(row); setTimeline([]);
    try {
      const r = await api.get(`/smart-meter-assets/${row.id}`);
      setDrill(r.data?.data || row);
      setTimeline(r.data?.data?.timeline || []);
    } catch { /* leave empty */ }
  }, []);

  const act = useCallback(async (action: string, id: string) => {
    setError(null);
    try {
      await api.post(`/smart-meter-assets/${id}/action`, { action });
      await load();
      if (drill) await openDrill(drill);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Action failed.');
    }
  }, [load, openDrill, drill]);

  const create = useCallback(async () => {
    setError(null);
    if (!form.meter_serial || !form.site_id) { setError('Meter serial and site are required.'); return; }
    try {
      await api.post('/smart-meter-assets', form);
      setCreating(false); setForm({ meter_serial: '', site_id: '', meter_class: 'post_paid' });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Could not create meter.');
    }
  }, [form, load]);

  return (
    <div data-testid="esums-smart-meter-tab" style={{ padding: '16px 20px', minHeight: 600 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f1c2e', marginTop: 0 }}>Smart-meter commissioning</h2>
          <p style={{ fontSize: 13, color: '#557', marginTop: 4, maxWidth: 720 }}>
            Every meter from purchase order through FAT, delivery, installation, commissioning, comms test
            and data-quality validation to operational service. URGENT SLA by class (HV bulk 7d &rarr; post-paid 30d).
          </p>
        </div>
        <button type="button" onClick={() => setCreating((v) => !v)}
          style={{ flexShrink: 0, padding: '8px 14px', background: 'oklch(0.46 0.16 55)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {creating ? 'Cancel' : '+ Add meter'}
        </button>
      </div>

      <InlineHelp helpKey="esums.smart_meter.intro" title="Commissioning a meter">
        Add a meter with its serial and site, then advance it through FAT, delivery, install, comms test and
        data-quality validation. The class you pick sets the SLA window.
      </InlineHelp>
      <OnboardingTour
        scope="esums.smart_meter"
        steps={[
          { key: 'add', title: 'Add your first meter', body: 'Use "Add meter" to register a meter against one of your sites.' },
          { key: 'advance', title: 'Advance the chain', body: 'Open any meter to see its timeline and the actions valid from its current state.' },
        ]}
      />

      {creating && (
        <div style={{ marginTop: 12, padding: 14, background: '#f6f8fb', border: '1px solid #e3e7ec', borderRadius: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12, color: '#557' }}>Meter serial<br />
            <input value={form.meter_serial} onChange={(e) => setForm((f) => ({ ...f, meter_serial: e.target.value }))}
              style={{ marginTop: 4, padding: '6px 8px', border: '1px solid #cfd8e3', borderRadius: 6, fontSize: 13 }} />
          </label>
          <label style={{ fontSize: 12, color: '#557' }}>Site ID<br />
            <input value={form.site_id} onChange={(e) => setForm((f) => ({ ...f, site_id: e.target.value }))}
              style={{ marginTop: 4, padding: '6px 8px', border: '1px solid #cfd8e3', borderRadius: 6, fontSize: 13 }} />
          </label>
          <label style={{ fontSize: 12, color: '#557' }}>Class<br />
            <select value={form.meter_class} onChange={(e) => setForm((f) => ({ ...f, meter_class: e.target.value }))}
              style={{ marginTop: 4, padding: '6px 8px', border: '1px solid #cfd8e3', borderRadius: 6, fontSize: 13 }}>
              <option value="post_paid">Post-paid (30d)</option>
              <option value="prepaid">Prepaid (21d)</option>
              <option value="bulk">Bulk (14d)</option>
              <option value="hv_bulk">HV bulk (7d)</option>
            </select>
          </label>
          <button type="button" onClick={() => void create()}
            style={{ padding: '8px 14px', background: '#1f6b3a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Create</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <Kpi label="In progress" value={kpis.in_progress ?? 0} />
        <Kpi label="Operational" value={kpis.operational ?? 0} />
        <Kpi label="Faulted" value={kpis.faulted ?? 0} sub="needs attention" />
        <Kpi label="SLA breached" value={kpis.sla_breached ?? 0} sub="regulator-flagged" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button type="button" key={f.key} onClick={() => setFilter(f.key)}
            style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid #e3e7ec',
              background: filter === f.key ? 'oklch(0.46 0.16 55)' : '#fff', color: filter === f.key ? '#fff' : '#0f1c2e',
              fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{f.label}</button>
        ))}
      </div>

      {error && <div style={{ marginTop: 12, padding: '8px 12px', background: '#fde0e0', color: '#9b1f1f', borderRadius: 6, fontSize: 13 }}>{error}</div>}

      <div style={{ marginTop: 14, background: '#fff', border: '1px solid #e3e7ec', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f6f8fb', textAlign: 'left', color: '#557' }}>
              <th style={{ padding: '8px 12px' }}>Serial</th>
              <th style={{ padding: '8px 12px' }}>Class</th>
              <th style={{ padding: '8px 12px' }}>Site</th>
              <th style={{ padding: '8px 12px' }}>State</th>
              <th style={{ padding: '8px 12px' }}>SLA</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#7a8a9a' }}>
                {loading ? 'Loading...' : 'No meters in this view. Use "Add meter" to register one.'}
              </td></tr>
            )}
            {filtered.map((r) => {
              const tone = TONE[r.chain_status] ?? { bg: '#eee', fg: '#333', label: r.chain_status };
              return (
                <tr key={r.id} onClick={() => void openDrill(r)} style={{ borderTop: '1px solid #eef1f5', cursor: 'pointer' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.meter_serial}</td>
                  <td style={{ padding: '8px 12px' }}>{r.meter_class}</td>
                  <td style={{ padding: '8px 12px' }}>{r.site_id}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ background: tone.bg, color: tone.fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{tone.label}</span>
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 12, color: r.sla_breached ? '#9b1f1f' : '#557' }}>{slaText(r.sla_deadline, r.sla_breached)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {drill && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 560, background: '#fff', borderLeft: '1px solid #e3e7ec', boxShadow: '-4px 0 16px rgba(0,0,0,0.08)', zIndex: 50, padding: 20, overflowY: 'auto' }}>
          <button type="button" onClick={() => setDrill(null)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>&times;</button>
          <h3 style={{ marginTop: 0, fontSize: 17 }}>{drill.meter_serial}</h3>
          <div style={{ fontSize: 12, color: '#557' }}>{drill.id} &middot; {drill.meter_class} &middot; site {drill.site_id}</div>
          <div style={{ marginTop: 12, fontSize: 12 }}>
            State: <strong>{(TONE[drill.chain_status] ?? { label: drill.chain_status }).label}</strong>
            {drill.sla_deadline && <> &middot; SLA due <strong>{drill.sla_deadline.slice(0, 10)}</strong></>}
          </div>

          <h4 style={{ marginTop: 18, fontSize: 13, color: '#557' }}>Timeline</h4>
          <div style={{ marginTop: 6, maxHeight: 280, overflowY: 'auto' }}>
            {timeline.length === 0 && <div style={{ fontSize: 12, color: '#7a8a9a' }}>No events recorded.</div>}
            {timeline.map((ev) => (
              <div key={ev.id} style={{ padding: '8px 10px', borderBottom: '1px solid #eef1f5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{ev.event_type}</span>
                  <span style={{ fontSize: 10, color: '#7a8a9a' }}>{ev.created_at.slice(0, 16).replace('T', ' ')}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ACTIONS.filter((a) => a.from.includes(drill.chain_status)).map((a) => (
              <button type="button" key={a.action} onClick={() => void act(a.action, drill.id)}
                style={{ padding: '6px 12px', background: a.danger ? '#9b1f1f' : 'oklch(0.46 0.16 55)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>{a.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
