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
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.16 55)';
const BAD    = 'oklch(0.48 0.20 20)';
const WARN   = 'oklch(0.50 0.18 55)';
const GOOD   = 'oklch(0.40 0.16 155)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'reversal_reported' | 'under_assessment' | 'loss_quantified'
  | 'buffer_cancellation_proposed' | 'buffer_cancelled' | 'remediation_verified'
  | 'replacement_required' | 'replacement_submitted' | 'replacement_verified'
  | 'closed' | 'escalated' | 'false_alarm';

type Tier = 'catastrophic' | 'significant' | 'minor';

interface ReversalRow {
  [key: string]: unknown;
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

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'reversal_reported',
  'under_assessment',
  'loss_quantified',
  'buffer_cancellation_proposed',
  'buffer_cancelled',
  'remediation_verified',
  'replacement_required',
  'replacement_submitted',
  'replacement_verified',
  'closed',
];
const BRANCH_STATES: readonly string[] = [
  'escalated',
  'false_alarm',
];

// ── filters ───────────────────────────────────────────────────────────────
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

// ── helpers ───────────────────────────────────────────────────────────────
const TERMINAL_STATES: ChainStatus[] = ['closed', 'escalated', 'false_alarm'];
const BUFFER_PATH_STATES: ChainStatus[] = ['buffer_cancellation_proposed', 'buffer_cancelled', 'remediation_verified'];
const REPLACEMENT_PATH_STATES: ChainStatus[] = ['replacement_required', 'replacement_submitted', 'replacement_verified'];

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

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: ReversalRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const status = row.chain_status;

  // Primary forward action per state
  if (status === 'reversal_reported') {
    actions.push({
      key: 'begin-assessment',
      label: 'Begin assessment (registry)',
      fields: [
        {
          key: 'assessment_basis',
          label: 'Assessment basis — scope of the reversal review + evidence gathered',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'under_assessment') {
    actions.push({
      key: 'quantify-loss',
      label: 'Quantify loss (VVB)',
      fields: [
        {
          key: 'quantification_basis',
          label: 'Quantification basis — methodology + monitoring used to size the loss',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'reversed_tco2e',
          label: 'Reversed tCO₂e — credits released back to atmosphere',
          type: 'number',
          required: false,
          placeholder: String(row.reversed_tco2e || ''),
        },
        {
          key: 'reversal_ref',
          label: 'Reversal reference (e.g. VCS-REV-2026-0007)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'loss_quantified') {
    actions.push({
      key: 'propose-buffer-cancellation',
      label: 'Propose buffer cancellation (registry)',
      fields: [
        {
          key: 'buffer_basis',
          label: 'Buffer basis — why the buffer pool absorbs this loss (unintentional)',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'buffer_cancelled_tco2e',
          label: 'Buffer credits to cancel (tCO₂e)',
          type: 'number',
          required: false,
          placeholder: String(row.reversed_tco2e || ''),
        },
        {
          key: 'buffer_pool_ref',
          label: 'Buffer pool reference (e.g. VCS-AFOLU-POOL)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'buffer_cancellation_proposed') {
    actions.push({
      key: 'cancel-buffer',
      label: 'Cancel buffer credits (registry)',
      fields: [
        {
          key: 'buffer_basis',
          label: 'Cancellation basis — confirm buffer-pool retirement executed',
          type: 'textarea',
          required: false,
          placeholder: row.buffer_basis || '',
        },
        {
          key: 'buffer_cancelled_tco2e',
          label: 'Buffer credits cancelled (tCO₂e)',
          type: 'number',
          required: false,
          placeholder: String(row.buffer_cancelled_tco2e || row.reversed_tco2e || ''),
        },
        {
          key: 'buffer_pool_ref',
          label: 'Buffer pool reference / cancellation serial',
          type: 'text',
          required: false,
          placeholder: row.buffer_pool_ref || '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'buffer_cancelled') {
    actions.push({
      key: 'verify-remediation',
      label: 'Verify remediation (VVB)',
      fields: [
        {
          key: 'remediation_basis',
          label: 'Remediation basis — site recovery / re-planting / fire-break action',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'verification_basis',
          label: 'Verification basis — VVB evidence the site is on a recovery trajectory',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'replacement_required') {
    actions.push({
      key: 'submit-replacement',
      label: 'Submit replacement credits (proponent)',
      fields: [
        {
          key: 'replacement_basis',
          label: 'Replacement basis — provenance of the substitute credits being tendered',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
        {
          key: 'replacement_tco2e',
          label: 'Replacement credits submitted (tCO₂e)',
          type: 'number',
          required: false,
          placeholder: String(row.replacement_tco2e || row.reversed_tco2e || ''),
        },
        {
          key: 'replacement_serial_block',
          label: 'Replacement serial block (e.g. VCS-0007-2026-0001..5000)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'replacement_submitted') {
    actions.push({
      key: 'verify-replacement',
      label: 'Verify replacement (VVB)',
      fields: [
        {
          key: 'verification_basis',
          label: 'Verification basis — VVB confirmation the replacement credits are valid + equivalent',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'remediation_verified' || status === 'replacement_verified') {
    actions.push({
      key: 'close',
      label: 'Close reversal (registry)',
      fields: [
        {
          key: 'closure_notes',
          label: 'Closure notes — outcome + permanence-account reconciliation',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      // close crosses regulator for catastrophic + significant
      cascadeTo: (row.reversal_tier === 'catastrophic' || row.reversal_tier === 'significant') ? ['regulator'] : [],
    });
  }

  // Branch: require-replacement from loss_quantified
  if (status === 'loss_quantified') {
    actions.push({
      key: 'require-replacement',
      label: 'Require replacement (registry)',
      fields: [
        {
          key: 'replacement_basis',
          label: 'Replacement basis — why the proponent must replace like-for-like (intentional / at-fault)',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'replacement_tco2e',
          label: 'Replacement credits required (tCO₂e)',
          type: 'number',
          required: false,
          placeholder: String(row.reversed_tco2e || ''),
        },
        {
          key: 'regulator_ref',
          label: 'Regulator reference (e.g. NERSA-NOTIFY-2026-0041)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      // require_replacement crosses regulator EVERY tier
      cascadeTo: ['regulator'],
    });
  }

  // Escalate from under_assessment, loss_quantified, replacement_required
  if (['under_assessment', 'loss_quantified', 'replacement_required'].includes(status)) {
    actions.push({
      key: 'escalate',
      label: 'Escalate (authority)',
      fields: [
        {
          key: 'regulator_ref',
          label: 'Regulator / Tribunal reference (e.g. NERSA-TRIBUNAL-2026-0014)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'closure_notes',
          label: 'Escalation basis — fraud, project failure, or dispute requiring authority intervention',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      // escalate crosses regulator EVERY tier
      cascadeTo: ['regulator'],
    });
  }

  // False alarm from reversal_reported, under_assessment
  if (['reversal_reported', 'under_assessment'].includes(status)) {
    actions.push({
      key: 'dismiss-false-alarm',
      label: 'Dismiss — false alarm (registry)',
      fields: [
        {
          key: 'closure_notes',
          label: 'Dismissal reason — why the reported reversal did not occur (e.g. monitoring error, recovered)',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

function renderDetail(row: ReversalRow): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="Reversal type" value={row.reversal_type} />
      <DetailPair label="Cause" value={row.reversal_cause ?? '—'} />
      <DetailPair label="VVB" value={row.vvb_name ?? '—'} />
      <DetailPair label="Methodology" value={row.methodology ?? '—'} />
      <DetailPair label="Province / host" value={row.province ?? row.host_country ?? '—'} />
      <DetailPair label="Registered project" value={row.registered_project_ref ?? '—'} />
      <DetailPair label="Credit serial block" value={row.credit_serial_block ?? '—'} />
      <DetailPair label="Reversed" value={fmtTco2e(row.reversed_tco2e)} />
      <DetailPair label="Buffer cancelled" value={fmtTco2e(row.buffer_cancelled_tco2e)} />
      <DetailPair label="Replacement" value={fmtTco2e(row.replacement_tco2e)} />
      <DetailPair label="Buffer pool ref" value={row.buffer_pool_ref ?? '—'} />
      <DetailPair label="Replacement serial" value={row.replacement_serial_block ?? '—'} />
      <DetailPair label="Reversal ref" value={row.reversal_ref ?? '—'} />
      <DetailPair label="Regulator ref" value={row.regulator_ref ?? '—'} />
      <DetailPair label="Reason code" value={row.reason_code ?? '—'} />
      <DetailPair label="Reported" value={fmtDate(row.reversal_reported_at)} />
      <DetailPair label="Under assessment" value={fmtDate(row.under_assessment_at)} />
      <DetailPair label="Loss quantified" value={fmtDate(row.loss_quantified_at)} />
      <DetailPair label="Buffer proposed" value={fmtDate(row.buffer_cancellation_proposed_at)} />
      <DetailPair label="Buffer cancelled at" value={fmtDate(row.buffer_cancelled_at)} />
      <DetailPair label="Remediation verified" value={fmtDate(row.remediation_verified_at)} />
      <DetailPair label="Replacement required" value={fmtDate(row.replacement_required_at)} />
      <DetailPair label="Replacement submitted" value={fmtDate(row.replacement_submitted_at)} />
      <DetailPair label="Replacement verified" value={fmtDate(row.replacement_verified_at)} />
      <DetailPair label="Closed" value={fmtDate(row.closed_at)} />
      <DetailPair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
      <DetailPair label="SLA status" value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
      <DetailPair label="Escalation lvl" value={String(row.escalation_level)} />
      <DetailPair label="Reportable" value={row.is_reportable ? 'Yes' : 'No'} />
      {row.source_wave && (
        <DetailPair label="Source wave" value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}`} />
      )}
      {row.reversal_summary && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Reversal summary</div>
          <div style={{ color: TX2 }}>{row.reversal_summary}</div>
        </div>
      )}
      {row.assessment_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Assessment basis</div>
          <div style={{ color: TX2 }}>{row.assessment_basis}</div>
        </div>
      )}
      {row.quantification_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Quantification basis</div>
          <div style={{ color: TX2 }}>{row.quantification_basis}</div>
        </div>
      )}
      {row.buffer_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Buffer basis</div>
          <div style={{ color: TX2 }}>{row.buffer_basis}</div>
        </div>
      )}
      {row.remediation_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Remediation basis</div>
          <div style={{ color: TX2 }}>{row.remediation_basis}</div>
        </div>
      )}
      {row.replacement_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Replacement basis</div>
          <div style={{ color: TX2 }}>{row.replacement_basis}</div>
        </div>
      )}
      {row.verification_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Verification basis</div>
          <div style={{ color: TX2 }}>{row.verification_basis}</div>
        </div>
      )}
      {row.closure_notes && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Closure / escalation notes</div>
          <div style={{ color: TX2 }}>{row.closure_notes}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function CarbonReversalChainTab() {
  const [rows, setRows] = useState<ReversalRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get<{ data: { items: ReversalRow[] } & KpiSummary }>('/carbon-reversal/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        setSummary({
          total: d.total,
          open_count: d.open_count,
          closed_count: d.closed_count,
          escalated_count: d.escalated_count,
          false_alarm_count: d.false_alarm_count,
          buffer_path_count: d.buffer_path_count,
          replacement_path_count: d.replacement_path_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          catastrophic_open: d.catastrophic_open,
          total_reversed_tco2e: d.total_reversed_tco2e,
          total_buffer_cancelled: d.total_buffer_cancelled,
          total_replacement: d.total_replacement,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load reversal records');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    // For the 'close' action, inject reason_code based on prior state
    let body: Record<string, string> = { ...values };
    if (key === 'close') {
      const row = rows.find(r => r.id === rowId);
      if (row && !body.reason_code) {
        body.reason_code = row.chain_status === 'remediation_verified' ? 'buffer_absorbed' : 'replacement_complete';
      }
    }
    // For 'escalate' and 'dismiss-false-alarm', inject reason_code
    if (key === 'escalate' && !body.reason_code) {
      body.reason_code = 'escalated';
    }
    if (key === 'dismiss-false-alarm' && !body.reason_code) {
      body.reason_code = 'false_alarm';
    }
    try {
      await api.post(`/carbon-reversal/chain/${rowId}/${key}`, body);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/carbon-reversal/chain/${rowId}`);
          setExpandedEvents(prev => ({ ...prev, [rowId]: res.data?.data?.events ?? [] }));
        } catch { /* silent */ }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load, expandedEvents, rows]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { events: ChainEvent[] } }>(`/carbon-reversal/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === 'all')              return true;
      if (filter === 'active')           return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'catastrophic')     return r.reversal_tier === 'catastrophic';
      if (filter === 'significant')      return r.reversal_tier === 'significant';
      if (filter === 'minor')            return r.reversal_tier === 'minor';
      if (filter === 'buffer_path')      return BUFFER_PATH_STATES.includes(r.chain_status);
      if (filter === 'replacement_path') return REPLACEMENT_PATH_STATES.includes(r.chain_status);
      if (filter === 'breached')         return !!r.sla_breached;
      if (filter === 'reportable')       return r.is_reportable;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: 0, open_count: 0, closed_count: 0, escalated_count: 0,
    false_alarm_count: 0, buffer_path_count: 0, replacement_path_count: 0,
    breached: 0, reportable_total: 0, catastrophic_open: 0,
    total_reversed_tco2e: 0, total_buffer_cancelled: 0, total_replacement: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Carbon reversal &amp; buffer management</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-stage permanence chain · reported → under assessment → loss quantified → then either the buffer path
          (buffer cancellation proposed → buffer cancelled → remediation verified → closed) for unintentional loss, or
          the replacement branch (replacement required → submitted → verified → closed) where the proponent is at
          fault. Assessments can escalate to authority governance; mis-reported reversals dismiss as false alarms.
          URGENT SLA: the more catastrophic the reversal, the tighter every window. Verra VCS + Gold Standard + Article 6.4.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total" value={kpis.total} />
        <KpiTile label="Open" value={kpis.open_count} />
        <KpiTile label="Catastrophic open" value={kpis.catastrophic_open} tone={kpis.catastrophic_open > 0 ? 'bad' : undefined} />
        <KpiTile label="Buffer path" value={kpis.buffer_path_count} tone={kpis.buffer_path_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Replacement path" value={kpis.replacement_path_count} tone={kpis.replacement_path_count > 0 ? 'warn' : undefined} />
        <KpiTile label="SLA breached" value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Closed" value={kpis.closed_count} tone="ok" />
        <KpiTile label="Escalated" value={kpis.escalated_count} tone={kpis.escalated_count > 0 ? 'bad' : undefined} />
        <KpiTile label="False alarms" value={kpis.false_alarm_count} />
        <KpiTile label="Reportable" value={kpis.reportable_total} tone={kpis.reportable_total > 0 ? 'warn' : undefined} />
        <KpiTile label="Reversed tCO₂e" value={kpis.total_reversed_tco2e.toLocaleString('en-ZA')} />
        <KpiTile label="Buffer cancelled" value={kpis.total_buffer_cancelled.toLocaleString('en-ZA')} />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{ background: filter === f.key ? ACC : BG2, color: filter === f.key ? '#fff' : TX2, border: `1px solid ${filter === f.key ? ACC : BORDER}` }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>{err}</div>
      )}
      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>Loading...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.reversal_number}${row.is_reportable ? ' ●' : ''} — ${row.project_name}`}
              meta={`${row.reversal_tier} · ${row.reversal_type} · ${row.project_party_name}${row.standard ? ` · ${row.standard}` : ''}`}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No reversal records match.</div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div className="rounded border px-3 py-2 min-w-[80px]" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

export default CarbonReversalChainTab;
