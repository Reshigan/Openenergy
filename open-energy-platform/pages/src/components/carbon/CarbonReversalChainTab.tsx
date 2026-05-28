// Wave 42 — Carbon Reversal / Buffer-Pool & Permanence Management tab.
//
// The integrity safeguard of the carbon-credit lifecycle. Where W37 registers a
// project, W11 verifies its reductions (MRV) and W17 retires the resulting
// credits, THIS chain handles what happens when previously-issued credits are
// REVERSED — sequestered carbon released back to atmosphere (wildfire, drought
// /pest mortality, illegal logging, project failure). The registry must make the
// market whole, either by cancelling buffer-pool credits (unintentional loss) or
// requiring like-for-like replacement (intentional / proponent-at-fault).
//
// Buffer path:  reversal_reported → under_assessment → loss_quantified →
//   buffer_cancellation_proposed → buffer_cancelled → remediation_verified → closed.
// Replacement branch from loss_quantified: → replacement_required →
//   replacement_submitted → replacement_verified → closed.
// Escalation branch from under_assessment|loss_quantified|replacement_required.
// False-alarm from reversal_reported|under_assessment.
//
// URGENT SLA — the more catastrophic the reversal, the tighter every window.
//
// Write model — single carbon-fund desk {admin, support, carbon_fund}. actor_party
// records the contractual function (proponent / vvb / registry / authority) for
// audit attribution. Reportability: escalate + require_replacement cross the
// regulator inbox for EVERY tier; close + sla_breached cross for material tiers
// (catastrophic + significant). Verra VCS + Gold Standard + Article 6.4.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'reversal_reported' | 'under_assessment' | 'loss_quantified'
  | 'buffer_cancellation_proposed' | 'buffer_cancelled' | 'remediation_verified'
  | 'replacement_required' | 'replacement_submitted' | 'replacement_verified'
  | 'closed' | 'escalated' | 'false_alarm';

type Tier = 'catastrophic' | 'significant' | 'minor';

interface ReversalRow {
  id: string;
  reversal_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_party_id: string;
  project_party_name: string;
  vvb_name: string | null;
  project_name: string;
  project_tier: string | null;
  standard: string | null;
  methodology: string | null;
  province: string | null;
  host_country: string | null;
  registered_project_ref: string | null;
  credit_serial_block: string | null;
  reversal_cause: string | null;
  reversal_type: 'unintentional' | 'intentional';
  reversal_tier: Tier;
  reversed_tco2e: number;
  buffer_cancelled_tco2e: number;
  replacement_tco2e: number;
  buffer_pool_ref: string | null;
  replacement_serial_block: string | null;
  reversal_ref: string | null;
  regulator_ref: string | null;
  reversal_summary: string | null;
  assessment_basis: string | null;
  quantification_basis: string | null;
  buffer_basis: string | null;
  remediation_basis: string | null;
  replacement_basis: string | null;
  verification_basis: string | null;
  reason_code: string | null;
  closure_notes: string | null;
  chain_status: ChainStatus;
  reversal_reported_at: string;
  under_assessment_at: string | null;
  loss_quantified_at: string | null;
  buffer_cancellation_proposed_at: string | null;
  buffer_cancelled_at: string | null;
  remediation_verified_at: string | null;
  replacement_required_at: string | null;
  replacement_submitted_at: string | null;
  replacement_verified_at: string | null;
  closed_at: string | null;
  escalated_at: string | null;
  false_alarm_at: string | null;
  is_reportable: boolean;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  breach_crosses_regulator?: boolean;
}

interface ReversalEvent {
  id: string;
  reversal_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

interface KpiSummary {
  total: number;
  open_count: number;
  closed_count: number;
  escalated_count: number;
  false_alarm_count: number;
  buffer_path_count: number;
  replacement_path_count: number;
  breached: number;
  reportable_total: number;
  catastrophic_open: number;
  total_reversed_tco2e: number;
  total_buffer_cancelled: number;
  total_replacement: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  reversal_reported:            { bg: '#e3e7ec', fg: '#557',    label: 'Reported' },
  under_assessment:             { bg: '#dbecfb', fg: '#1a3a5c', label: 'Under assessment' },
  loss_quantified:              { bg: '#fff4d6', fg: '#a06200', label: 'Loss quantified' },
  buffer_cancellation_proposed: { bg: '#ffe9d6', fg: '#8a4a00', label: 'Buffer cancellation proposed' },
  buffer_cancelled:             { bg: '#daf5e2', fg: '#1f6b3a', label: 'Buffer cancelled' },
  remediation_verified:         { bg: '#daf5e2', fg: '#1f6b3a', label: 'Remediation verified' },
  replacement_required:         { bg: '#ffe9d6', fg: '#8a4a00', label: 'Replacement required' },
  replacement_submitted:        { bg: '#ffe9d6', fg: '#8a4a00', label: 'Replacement submitted' },
  replacement_verified:         { bg: '#daf5e2', fg: '#1f6b3a', label: 'Replacement verified' },
  closed:                       { bg: '#d4edda', fg: '#155724', label: 'Closed' },
  escalated:                    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Escalated' },
  false_alarm:                  { bg: '#f3e0e0', fg: '#6b1f1f', label: 'False alarm' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  catastrophic: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Catastrophic' },
  significant:  { bg: '#ffe4b5', fg: '#8a4a00', label: 'Significant' },
  minor:        { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                       label: 'Active' },
  { key: 'all',                          label: 'All' },
  { key: 'catastrophic',                 label: 'Catastrophic' },
  { key: 'significant',                  label: 'Significant' },
  { key: 'minor',                        label: 'Minor' },
  { key: 'buffer_path',                  label: 'Buffer path' },
  { key: 'replacement_path',             label: 'Replacement path' },
  { key: 'breached',                     label: 'SLA breached' },
  { key: 'reportable',                   label: 'Reportable' },
  { key: 'reversal_reported',            label: 'Reported' },
  { key: 'under_assessment',             label: 'Under assessment' },
  { key: 'loss_quantified',              label: 'Loss quantified' },
  { key: 'buffer_cancellation_proposed', label: 'Buffer proposed' },
  { key: 'buffer_cancelled',             label: 'Buffer cancelled' },
  { key: 'remediation_verified',         label: 'Remediation verified' },
  { key: 'replacement_required',         label: 'Replacement required' },
  { key: 'replacement_submitted',        label: 'Replacement submitted' },
  { key: 'replacement_verified',         label: 'Replacement verified' },
  { key: 'closed',                       label: 'Closed' },
  { key: 'escalated',                    label: 'Escalated' },
  { key: 'false_alarm',                  label: 'False alarm' },
];

type ActionKind =
  | 'begin-assessment' | 'quantify-loss' | 'propose-buffer-cancellation'
  | 'cancel-buffer' | 'verify-remediation' | 'require-replacement'
  | 'submit-replacement' | 'verify-replacement' | 'close' | 'escalate'
  | 'dismiss-false-alarm';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  reversal_reported:            'begin-assessment',
  under_assessment:             'quantify-loss',
  loss_quantified:              'propose-buffer-cancellation',
  buffer_cancellation_proposed: 'cancel-buffer',
  buffer_cancelled:             'verify-remediation',
  remediation_verified:         'close',
  replacement_required:         'submit-replacement',
  replacement_submitted:        'verify-replacement',
  replacement_verified:         'close',
  closed:                       null,
  escalated:                    null,
  false_alarm:                  null,
};

// Party annotation per action — the contractual function. Registry owns intake /
// assessment / buffer cancellation / replacement determination / closure; the
// VVB owns independent quantification + remediation/replacement verification;
// the proponent submits replacement credits; the authority owns escalation.
const ACTION_LABEL: Record<ActionKind, string> = {
  'begin-assessment':            'Begin assessment (registry)',
  'quantify-loss':               'Quantify loss (VVB)',
  'propose-buffer-cancellation': 'Propose buffer cancellation (registry)',
  'cancel-buffer':               'Cancel buffer credits (registry)',
  'verify-remediation':          'Verify remediation (VVB)',
  'require-replacement':         'Require replacement (registry)',
  'submit-replacement':          'Submit replacement credits (proponent)',
  'verify-replacement':          'Verify replacement (VVB)',
  'close':                       'Close reversal (registry)',
  'escalate':                    'Escalate (authority)',
  'dismiss-false-alarm':         'Dismiss — false alarm (registry)',
};

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtTco2e(n: number | null | undefined): string {
  if (!n) return '—';
  return `${n.toLocaleString('en-ZA')} tCO₂e`;
}

const TERMINAL_STATES: ChainStatus[] = ['closed', 'escalated', 'false_alarm'];
const BUFFER_PATH_STATES: ChainStatus[] = ['buffer_cancellation_proposed', 'buffer_cancelled', 'remediation_verified'];
const REPLACEMENT_PATH_STATES: ChainStatus[] = ['replacement_required', 'replacement_submitted', 'replacement_verified'];

export function CarbonReversalChainTab() {
  const [rows, setRows] = useState<ReversalRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<ReversalRow | null>(null);
  const [events, setEvents] = useState<ReversalEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ReversalRow[] } & KpiSummary }>('/carbon-reversal/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, closed_count: d.closed_count,
          escalated_count: d.escalated_count, false_alarm_count: d.false_alarm_count,
          buffer_path_count: d.buffer_path_count, replacement_path_count: d.replacement_path_count,
          breached: d.breached, reportable_total: d.reportable_total,
          catastrophic_open: d.catastrophic_open, total_reversed_tco2e: d.total_reversed_tco2e,
          total_buffer_cancelled: d.total_buffer_cancelled, total_replacement: d.total_replacement,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load reversal records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: ReversalRow; events: ReversalEvent[] } }>(
        `/carbon-reversal/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load reversal history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')              return true;
      if (filter === 'active')           return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'catastrophic')     return r.reversal_tier === 'catastrophic';
      if (filter === 'significant')      return r.reversal_tier === 'significant';
      if (filter === 'minor')            return r.reversal_tier === 'minor';
      if (filter === 'buffer_path')      return BUFFER_PATH_STATES.includes(r.chain_status);
      if (filter === 'replacement_path') return REPLACEMENT_PATH_STATES.includes(r.chain_status);
      if (filter === 'breached')         return r.sla_breached;
      if (filter === 'reportable')       return r.is_reportable;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: ReversalRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'begin-assessment') {
        const basis = window.prompt('Assessment basis — scope of the reversal review + evidence gathered:') || '';
        body = { assessment_basis: basis };
      } else if (action === 'quantify-loss') {
        const basis = window.prompt('Quantification basis — methodology + monitoring used to size the loss:');
        if (!basis) return;
        const tco2e = window.prompt('Reversed tCO₂e — credits released back to atmosphere:', String(row.reversed_tco2e || ''));
        const ref = window.prompt('Reversal reference (e.g. VCS-REV-2026-0007):') || '';
        body = { quantification_basis: basis };
        if (tco2e && !Number.isNaN(Number(tco2e))) body.reversed_tco2e = Number(tco2e);
        if (ref) body.reversal_ref = ref;
      } else if (action === 'propose-buffer-cancellation') {
        const basis = window.prompt('Buffer basis — why the buffer pool absorbs this loss (unintentional):');
        if (!basis) return;
        const tco2e = window.prompt('Buffer credits to cancel (tCO₂e):', String(row.reversed_tco2e || ''));
        const ref = window.prompt('Buffer pool reference (e.g. VCS-AFOLU-POOL):') || '';
        body = { buffer_basis: basis };
        if (tco2e && !Number.isNaN(Number(tco2e))) body.buffer_cancelled_tco2e = Number(tco2e);
        if (ref) body.buffer_pool_ref = ref;
      } else if (action === 'cancel-buffer') {
        const basis = window.prompt('Cancellation basis — confirm buffer-pool retirement executed:', row.buffer_basis || '') || '';
        const tco2e = window.prompt('Buffer credits cancelled (tCO₂e):', String(row.buffer_cancelled_tco2e || row.reversed_tco2e || ''));
        const ref = window.prompt('Buffer pool reference / cancellation serial:', row.buffer_pool_ref || '') || '';
        body = { buffer_basis: basis };
        if (tco2e && !Number.isNaN(Number(tco2e))) body.buffer_cancelled_tco2e = Number(tco2e);
        if (ref) body.buffer_pool_ref = ref;
      } else if (action === 'verify-remediation') {
        const remediation = window.prompt('Remediation basis — site recovery / re-planting / fire-break action:');
        if (!remediation) return;
        const verification = window.prompt('Verification basis — VVB evidence the site is on a recovery trajectory:') || '';
        body = { remediation_basis: remediation, verification_basis: verification };
      } else if (action === 'require-replacement') {
        const basis = window.prompt('Replacement basis — why the proponent must replace like-for-like (intentional / at-fault):');
        if (!basis) return;
        const tco2e = window.prompt('Replacement credits required (tCO₂e):', String(row.reversed_tco2e || ''));
        const reg = window.prompt('Regulator reference (e.g. NERSA-NOTIFY-2026-0041):') || '';
        body = { replacement_basis: basis };
        if (tco2e && !Number.isNaN(Number(tco2e))) body.replacement_tco2e = Number(tco2e);
        if (reg) body.regulator_ref = reg;
      } else if (action === 'submit-replacement') {
        const basis = window.prompt('Replacement basis — provenance of the substitute credits being tendered:') || '';
        const tco2e = window.prompt('Replacement credits submitted (tCO₂e):', String(row.replacement_tco2e || row.reversed_tco2e || ''));
        const serial = window.prompt('Replacement serial block (e.g. VCS-0007-2026-0001..5000):') || '';
        body = { replacement_basis: basis };
        if (tco2e && !Number.isNaN(Number(tco2e))) body.replacement_tco2e = Number(tco2e);
        if (serial) body.replacement_serial_block = serial;
      } else if (action === 'verify-replacement') {
        const basis = window.prompt('Verification basis — VVB confirmation the replacement credits are valid + equivalent:');
        if (!basis) return;
        body = { verification_basis: basis };
      } else if (action === 'close') {
        const notes = window.prompt('Closure notes — outcome + permanence-account reconciliation:');
        if (!notes) return;
        body = { reason_code: row.chain_status === 'remediation_verified' ? 'buffer_absorbed' : 'replacement_complete', closure_notes: notes };
      } else if (action === 'escalate') {
        const reg = window.prompt('Regulator / Tribunal reference (e.g. NERSA-TRIBUNAL-2026-0014):') || '';
        const notes = window.prompt('Escalation basis — fraud, project failure, or dispute requiring authority intervention:');
        if (!notes) return;
        body = { reason_code: 'escalated', closure_notes: notes };
        if (reg) body.regulator_ref = reg;
      } else if (action === 'dismiss-false-alarm') {
        const reason = window.prompt('Dismissal reason — why the reported reversal did not occur (e.g. monitoring error, recovered):');
        if (!reason) return;
        body = { reason_code: 'false_alarm', closure_notes: reason };
      }
      await api.post(`/carbon-reversal/chain/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action}`);
    }
  }, [load, loadEvents, selected]);

  return (
    <div className="p-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Carbon reversal &amp; buffer management</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage permanence chain · reported → under assessment → loss quantified → then either the buffer path
            (buffer cancellation proposed → buffer cancelled → remediation verified → closed) for unintentional loss, or
            the replacement branch (replacement required → submitted → verified → closed) where the proponent is at
            fault. Assessments can escalate to authority governance; mis-reported reversals dismiss as false alarms.
            The integrity safeguard between MRV (issuance) and retirement — keeps the market whole when sequestered
            carbon is released. URGENT SLA: the more catastrophic the reversal, the tighter every window. Escalation
            and required-replacement cross to the regulator inbox for every tier; closure and SLA breach cross for
            material tiers (Verra VCS + Gold Standard + Article 6.4).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Catastrophic open" value={kpis?.catastrophic_open ?? 0} tone={(kpis?.catastrophic_open ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Buffer path" value={kpis?.buffer_path_count ?? 0} tone={(kpis?.buffer_path_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Replacement path" value={kpis?.replacement_path_count ?? 0} tone={(kpis?.replacement_path_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Closed" value={kpis?.closed_count ?? 0} tone="ok" />
        <Kpi label="Escalated" value={kpis?.escalated_count ?? 0} tone={(kpis?.escalated_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="False alarms" value={kpis?.false_alarm_count ?? 0} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reversed tCO₂e" value={(kpis?.total_reversed_tco2e ?? 0).toLocaleString('en-ZA')} />
        <Kpi label="Buffer cancelled" value={(kpis?.total_buffer_cancelled ?? 0).toLocaleString('en-ZA')} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#0c2a4d] text-white'
                : 'bg-white text-[#4a5568] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">{err}</div>
      )}
      {loading ? (
        <div className="rounded border border-[#d8dde6] bg-white px-4 py-6 text-center text-sm text-[#4a5568]">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded border border-[#d8dde6] bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-[#f3f5f9]">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Reversal #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / proponent</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Cause / type</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Reversed</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.reversal_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.reversal_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[280px] truncate" title={`${r.project_name} · ${r.project_party_name}`}>
                      {r.project_name}
                      <span className="text-[#4a5568]"> · {r.project_party_name}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      {r.reversal_cause ?? '—'}
                      <span className={r.reversal_type === 'intentional' ? 'text-[#9b1f1f]' : 'text-[#4a5568]'}> · {r.reversal_type}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{r.reversed_tco2e ? r.reversed_tco2e.toLocaleString('en-ZA') : '—'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No reversal records match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0c2a4d';
  return (
    <div className="rounded border border-[#d8dde6] bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct,
}: {
  row: ReversalRow;
  events: ReversalEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: ReversalRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canRequireReplacement = row.chain_status === 'loss_quantified';
  const canEscalate = ['under_assessment', 'loss_quantified', 'replacement_required'].includes(row.chain_status);
  const canFalseAlarm = ['reversal_reported', 'under_assessment'].includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.reversal_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.reversal_tier].label} · {row.reversal_type} · proponent {row.project_party_name}
                {row.standard ? ` · ${row.standard}` : ''}
              </div>
              {row.source_wave && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"                value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"                 value={TIER_TONE[row.reversal_tier].label} />
            <Pair label="Reversal type"        value={row.reversal_type} />
            <Pair label="Cause"                value={row.reversal_cause ?? '—'} />
            <Pair label="VVB"                  value={row.vvb_name ?? '—'} />
            <Pair label="Methodology"          value={row.methodology ?? '—'} />
            <Pair label="Province / host"      value={row.province ?? row.host_country ?? '—'} />
            <Pair label="Registered project"   value={row.registered_project_ref ?? '—'} />
            <Pair label="Credit serial block"  value={row.credit_serial_block ?? '—'} />
            <Pair label="Reversed"             value={fmtTco2e(row.reversed_tco2e)} />
            <Pair label="Buffer cancelled"     value={fmtTco2e(row.buffer_cancelled_tco2e)} />
            <Pair label="Replacement"          value={fmtTco2e(row.replacement_tco2e)} />
            <Pair label="Buffer pool ref"      value={row.buffer_pool_ref ?? '—'} />
            <Pair label="Replacement serial"   value={row.replacement_serial_block ?? '—'} />
            <Pair label="Reversal ref"         value={row.reversal_ref ?? '—'} />
            <Pair label="Regulator ref"        value={row.regulator_ref ?? '—'} />
            <Pair label="Reason code"          value={row.reason_code ?? '—'} />
            <Pair label="Reported"             value={fmtDate(row.reversal_reported_at)} />
            <Pair label="Under assessment"     value={fmtDate(row.under_assessment_at)} />
            <Pair label="Loss quantified"      value={fmtDate(row.loss_quantified_at)} />
            <Pair label="Buffer proposed"      value={fmtDate(row.buffer_cancellation_proposed_at)} />
            <Pair label="Buffer cancelled at"  value={fmtDate(row.buffer_cancelled_at)} />
            <Pair label="Remediation verified" value={fmtDate(row.remediation_verified_at)} />
            <Pair label="Replacement required" value={fmtDate(row.replacement_required_at)} />
            <Pair label="Replacement submitted" value={fmtDate(row.replacement_submitted_at)} />
            <Pair label="Replacement verified" value={fmtDate(row.replacement_verified_at)} />
            <Pair label="Closed"               value={fmtDate(row.closed_at)} />
            <Pair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"           value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"       value={String(row.escalation_level)} />
            <Pair label="Reportable"           value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.reversal_summary && (
            <BasisBlock label="Reversal summary" tone="#1a3a5c" text={row.reversal_summary} />
          )}
          {row.assessment_basis && (
            <BasisBlock label="Assessment basis" tone="#1a3a5c" text={row.assessment_basis} />
          )}
          {row.quantification_basis && (
            <BasisBlock label="Quantification basis" tone="#a06200" text={row.quantification_basis} />
          )}
          {row.buffer_basis && (
            <BasisBlock label="Buffer basis" tone="#8a4a00" text={row.buffer_basis} />
          )}
          {row.remediation_basis && (
            <BasisBlock label="Remediation basis" tone="#1f6b3a" text={row.remediation_basis} />
          )}
          {row.replacement_basis && (
            <BasisBlock label="Replacement basis" tone="#8a4a00" text={row.replacement_basis} />
          )}
          {row.verification_basis && (
            <BasisBlock label="Verification basis" tone="#1f6b3a" text={row.verification_basis} />
          )}
          {row.closure_notes && (
            <BasisBlock label="Closure / escalation notes" tone="#155724" text={row.closure_notes} />
          )}
        </section>

        {(nextAction || canRequireReplacement || canEscalate || canFalseAlarm) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canRequireReplacement && (
                <button
                  onClick={() => onAct('require-replacement', row)}
                  className="rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  {ACTION_LABEL['require-replacement']}
                </button>
              )}
              {canEscalate && (
                <button
                  onClick={() => onAct('escalate', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.escalate}
                </button>
              )}
              {canFalseAlarm && (
                <button
                  onClick={() => onAct('dismiss-false-alarm', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL['dismiss-false-alarm']}
                </button>
              )}
            </div>
          </section>
        )}

        <section className="px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Audit timeline</div>
          {events.length === 0 ? (
            <div className="text-[12px] text-[#4a5568]">No events yet.</div>
          ) : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#0c2a4d]">{e.event_type}</span>
                    <span className="text-[#4a5568] tabular-nums">{fmtDate(e.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    {(e.from_status || e.to_status) && (
                      <span className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</span>
                    )}
                    {e.actor_party && (
                      <span className="rounded bg-[#eef1f6] px-1.5 py-0.5 text-[10px] font-medium text-[#4a5568]">{e.actor_party}</span>
                    )}
                  </div>
                  {e.notes && <div className="mt-1 text-[#1a3a5c]">{e.notes}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function BasisBlock({ label, tone, text }: { label: string; tone: string; text: string }) {
  return (
    <div className="mt-3 text-[12px]">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: tone }}>{label}</div>
      <div className="whitespace-pre-wrap" style={{ color: tone }}>{text}</div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}
