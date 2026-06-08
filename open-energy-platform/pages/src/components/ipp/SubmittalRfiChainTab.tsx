// Wave 96 — IPP Submittal Log & RFI Register tab.
//
// The construction-document review pipeline for a best-in-class IPP-PM stack.
// Beats Procore submittal log + ball-in-court, Aconex transmittals + spec
// coverage, Newforma RFI, Asite document control, Kahua e-Builder and
// Primavera Submittal Exchange via:
//   - 13-state P6 lifecycle (drafted → submitted → distributed → under_review
//     → clarification_requested → responded → approved → distributed_for_
//     construction → incorporated → closed_clean) + the revision loop
//     (returned_for_revision → revised → distributed) + void/withdraw
//     exception terminals
//   - tier RE-DERIVED on every transition from priority × workflow × the
//     four coverage flags (grid_code / life_safety / bid_envelope /
//     holds_construction) with FLOOR-AT-HIGH on those flags
//   - URGENT SLA polarity — critical RFI must turn in hours not weeks
//     (construction is time-money)
//   - ball-in-court tracking + authority tiering (construction_coordinator
//     → lead_engineer → project_manager → project_director)
//   - LIVE battery decoration on every fetch: minutes_until_sla,
//     ipp_pm_quality_index (0-130 vs Procore=100 baseline),
//     days_in_court, predicted_close_date_live, urgency_band
//   - SIGNATURE regulator crossings: approve EVERY tier when grid_code OR
//     bid_envelope; void EVERY tier when grid_code OR life_safety;
//     distribute_for_construction high+critical with grid_code;
//     return_for_revision high+critical with grid_code; sla_breached
//     high+critical with grid_code OR holds_construction.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'drafted' | 'submitted' | 'distributed' | 'under_review'
  | 'clarification_requested' | 'responded' | 'approved'
  | 'returned_for_revision' | 'revised' | 'distributed_for_construction'
  | 'incorporated' | 'closed_clean' | 'voided' | 'withdrawn';

type Tier = 'critical' | 'high' | 'standard' | 'low';

type WorkflowClass =
  | 'submittal_design' | 'submittal_product_data' | 'submittal_mockup'
  | 'submittal_om_manuals' | 'rfi_design_clarification' | 'rfi_field_condition'
  | 'rfi_substitution_request' | 'rfi_change_in_scope';

interface SubmittalRow {
  id: string;
  submittal_rfi_number: string;
  project_id: string;
  project_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  contractor_name: string | null;
  designer_name: string | null;
  vendor_name: string | null;
  owner_party_name: string | null;
  workflow_class: WorkflowClass;
  priority_class: 'critical' | 'high' | 'standard' | 'low';
  document_type: string | null;
  spec_section: string | null;
  csi_division: string | null;
  csi_section_code: string | null;
  uniclass_code: string | null;
  sans_section: string | null;
  transmittal_number: string | null;
  sequence_number: number | null;
  current_tier: Tier;
  authority_required: string | null;
  affects_grid_code: number;
  affects_life_safety: number;
  affects_bid_envelope: number;
  holds_construction: number;
  requires_designer_response: number;
  requires_ie_review: number;
  requires_owner_review: number;
  clarification_count: number;
  revision_count: number;
  rejection_count: number;
  response_count: number;
  bid_envelope_drift_pct: number | null;
  grid_code_clauses_affected: number;
  estimated_cost_impact_zar: number | null;
  estimated_schedule_impact_days: number | null;
  parent_submittal_id: string | null;
  superseded_by_id: string | null;
  parent_rfi_id: string | null;
  drawing_ref: string | null;
  regulator_ref: string | null;
  title: string | null;
  narrative: string | null;
  response_text: string | null;
  voided_reason: string | null;
  withdrawn_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  requester_party: string | null;
  approver_party: string | null;
  chain_status: ChainStatus;
  drafted_at: string;
  submitted_at: string | null;
  distributed_at: string | null;
  under_review_at: string | null;
  clarification_requested_at: string | null;
  responded_at: string | null;
  approved_at: string | null;
  returned_for_revision_at: string | null;
  revised_at: string | null;
  distributed_for_construction_at: string | null;
  incorporated_at: string | null;
  closed_clean_at: string | null;
  voided_at: string | null;
  withdrawn_at: string | null;
  construction_hold_started_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  response_due_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // decorated
  is_terminal: boolean;
  minutes_until_sla: number | null;
  minutes_until_response_sla: number | null;
  sla_breached: boolean;
  response_sla_breached: boolean;
  sla_window_minutes: number;
  response_window_minutes: number;
  urgency_band: 'red' | 'amber' | 'yellow' | 'green' | 'terminal';
  is_reportable_flag: boolean;
  high_tier_flag: boolean;
  floor_at_high_flag: boolean;
  signature_class_flag: boolean;
  authority_required_live: string;
  tier_live: Tier;
  ball_in_court_party_live: string | null;
  days_in_court_live: number;
  days_open_live: number;
  predicted_close_date_live: string | null;
  ipp_pm_quality_index_live: number;
  inbox_severity_live: string;
  reportable_per_spec: boolean;
  supersede_chain_depth_live: number;
}

interface SubmittalEvent {
  id: string;
  submittal_rfi_id: string;
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
  closed_clean_count: number;
  voided_count: number;
  withdrawn_count: number;
  distributed_for_construction_count: number;
  incorporated_count: number;
  returned_for_revision_count: number;
  breached: number;
  response_breached_count: number;
  reportable_total: number;
  signature_count: number;
  grid_code_count: number;
  bid_envelope_count: number;
  life_safety_count: number;
  construction_hold_count: number;
  avg_quality_index: number;
  avg_days_in_court: number;
  total_estimated_cost_impact_zar: number;
  total_estimated_schedule_impact_days: number;
  max_bid_envelope_drift_pct: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  drafted:                       { bg: '#e3e7ec', fg: '#557',    label: 'Drafted' },
  submitted:                     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Submitted' },
  distributed:                   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Distributed' },
  under_review:                  { bg: '#fff4d6', fg: '#a06200', label: 'Under review' },
  clarification_requested:       { bg: '#fff4d6', fg: '#a06200', label: 'Clarification requested' },
  responded:                     { bg: '#fff4d6', fg: '#a06200', label: 'Responded' },
  approved:                      { bg: '#daf5e2', fg: '#1f6b3a', label: 'Approved' },
  returned_for_revision:         { bg: '#ffe4b5', fg: '#8a4a00', label: 'Returned for revision' },
  revised:                       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Revised' },
  distributed_for_construction:  { bg: '#d4edda', fg: '#155724', label: 'Released for construction' },
  incorporated:                  { bg: '#d4edda', fg: '#155724', label: 'Incorporated (as-built)' },
  closed_clean:                  { bg: '#cfe9d7', fg: '#0f5132', label: 'Closed clean' },
  voided:                        { bg: '#fde0e0', fg: '#9b1f1f', label: 'Voided' },
  withdrawn:                     { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
  high:     { bg: '#ffe4b5', fg: '#8a4a00', label: 'High' },
  standard: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard' },
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
};

const URGENCY_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  red:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Red' },
  amber:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Amber' },
  yellow:   { bg: '#fff4d6', fg: '#a06200', label: 'Yellow' },
  green:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Green' },
  terminal: { bg: '#e3e7ec', fg: '#557',    label: 'Terminal' },
};

const AUTHORITY_LABEL: Record<string, string> = {
  construction_coordinator: 'Construction coordinator',
  lead_engineer:            'Lead engineer',
  project_manager:          'Project manager',
  project_director:         'Project director',
};

const WORKFLOW_LABEL: Record<WorkflowClass, string> = {
  submittal_design:          'Design submittal',
  submittal_product_data:    'Product-data submittal',
  submittal_mockup:          'Mock-up submittal',
  submittal_om_manuals:      'O&M manuals',
  rfi_design_clarification:  'RFI · design clarification',
  rfi_field_condition:       'RFI · field condition',
  rfi_substitution_request:  'RFI · substitution request',
  rfi_change_in_scope:       'RFI · change in scope',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',         label: 'Open' },
  { key: 'all',          label: 'All' },
  { key: 'critical',     label: 'Critical' },
  { key: 'high',         label: 'High' },
  { key: 'standard',     label: 'Standard' },
  { key: 'low',          label: 'Low' },
  { key: 'under_review', label: 'Under review' },
  { key: 'clarification_requested', label: 'Awaiting clarification' },
  { key: 'returned_for_revision',   label: 'Returned' },
  { key: 'distributed_for_construction', label: 'For construction' },
  { key: 'incorporated', label: 'Incorporated' },
  { key: 'closed_clean', label: 'Closed clean' },
  { key: 'breached',     label: 'SLA breached' },
  { key: 'reportable',   label: 'Reportable' },
  { key: 'signature',    label: 'Signature flagged' },
  { key: 'grid_code',    label: 'Grid-code' },
];

type ActionKind =
  | 'submit' | 'distribute' | 'start-review' | 'request-clarification'
  | 'provide-clarification' | 'respond' | 'approve' | 'return-for-revision'
  | 'resubmit' | 'distribute-for-construction' | 'incorporate' | 'close'
  | 'void' | 'withdraw';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  drafted:                       'submit',
  submitted:                     'distribute',
  distributed:                   'start-review',
  under_review:                  'respond',
  clarification_requested:       'provide-clarification',
  responded:                     'approve',
  approved:                      'distribute-for-construction',
  returned_for_revision:         'resubmit',
  revised:                       'distribute',
  distributed_for_construction:  'incorporate',
  incorporated:                  'close',
  closed_clean:                  null,
  voided:                        null,
  withdrawn:                     null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'submit':                       'Submit (author)',
  'distribute':                   'Distribute (coordinator)',
  'start-review':                 'Start review (reviewer)',
  'request-clarification':        'Request clarification (reviewer)',
  'provide-clarification':        'Provide clarification (author)',
  'respond':                      'Respond (designer)',
  'approve':                      'Approve (reviewer)',
  'return-for-revision':          'Return for revision (reviewer)',
  'resubmit':                     'Resubmit (author)',
  'distribute-for-construction':  'Release for construction (coordinator)',
  'incorporate':                  'Incorporate / as-built (contractor)',
  'close':                        'Close clean (coordinator)',
  'void':                         'Void (owner)',
  'withdraw':                     'Withdraw (author)',
};

const SECONDARY_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  drafted:                       ['withdraw'],
  submitted:                     ['withdraw', 'void'],
  distributed:                   ['void', 'withdraw'],
  under_review:                  ['request-clarification', 'return-for-revision', 'void'],
  clarification_requested:       ['withdraw', 'void'],
  responded:                     ['return-for-revision', 'void'],
  approved:                      ['void'],
  returned_for_revision:         ['withdraw', 'void'],
  revised:                       ['void'],
  distributed_for_construction:  ['void'],
  incorporated:                  [],
  closed_clean:                  [],
  voided:                        [],
  withdrawn:                     [],
};

const DESTRUCTIVE: ActionKind[] = ['return-for-revision', 'void', 'withdraw', 'request-clarification'];

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  const abs = Math.abs(m);
  const sign = m < 0 ? '-' : '';
  if (abs >= 1440) return `${sign}${Math.round(abs / 1440)}d`;
  if (abs >= 60)   return `${sign}${Math.round(abs / 60)}h`;
  return `${sign}${abs}m`;
}

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}R${(a / 1_000_000).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}m`;
  if (a >= 1000)      return `${sign}R${(a / 1000).toLocaleString('en-ZA', { maximumFractionDigits: 1 })}k`;
  return `${sign}R${a.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
}

function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

const TERMINAL_STATES: ChainStatus[] = ['closed_clean', 'voided', 'withdrawn'];

export function SubmittalRfiChainTab() {
  const [rows, setRows] = useState<SubmittalRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<SubmittalRow | null>(null);
  const [events, setEvents] = useState<SubmittalEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: SubmittalRow[] } & KpiSummary }>('/ipp/submittal-rfi/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count,
          closed_clean_count: d.closed_clean_count, voided_count: d.voided_count,
          withdrawn_count: d.withdrawn_count,
          distributed_for_construction_count: d.distributed_for_construction_count,
          incorporated_count: d.incorporated_count,
          returned_for_revision_count: d.returned_for_revision_count,
          breached: d.breached, response_breached_count: d.response_breached_count,
          reportable_total: d.reportable_total, signature_count: d.signature_count,
          grid_code_count: d.grid_code_count, bid_envelope_count: d.bid_envelope_count,
          life_safety_count: d.life_safety_count,
          construction_hold_count: d.construction_hold_count,
          avg_quality_index: d.avg_quality_index, avg_days_in_court: d.avg_days_in_court,
          total_estimated_cost_impact_zar: d.total_estimated_cost_impact_zar,
          total_estimated_schedule_impact_days: d.total_estimated_schedule_impact_days,
          max_bid_envelope_drift_pct: d.max_bid_envelope_drift_pct,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load submittal/RFI register');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { submittal_rfi: SubmittalRow; events: SubmittalEvent[] } }>(`/ipp/submittal-rfi/chain/${id}`);
      if (res.data?.data?.submittal_rfi) setSelected(res.data.data.submittal_rfi);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load submittal/RFI history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')         return true;
      if (filter === 'open')        return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')    return r.sla_breached;
      if (filter === 'reportable')  return r.is_reportable_flag;
      if (filter === 'signature')   return r.signature_class_flag;
      if (filter === 'grid_code')   return r.affects_grid_code === 1;
      if (['critical', 'high', 'standard', 'low'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: SubmittalRow) => {
    try {
      let body: Record<string, unknown> = {};
      if (action === 'submit') {
        const title = window.prompt('Submittal/RFI title:', row.title ?? '') || '';
        const narrative = window.prompt('Narrative — design intent, RFI question, or scope:') || '';
        if (!narrative) return;
        body = { title, narrative };
      } else if (action === 'distribute') {
        const transmittal = window.prompt('Transmittal reference:') || '';
        body = transmittal ? { transmittal_number: transmittal } : {};
      } else if (action === 'start-review') {
        const reviewer = window.prompt('Reviewer party — defaults to reviewer:', 'reviewer') || 'reviewer';
        body = { last_responder_party: reviewer };
      } else if (action === 'request-clarification') {
        const reason = window.prompt('Clarification question:');
        if (!reason) return;
        body = { narrative: reason };
      } else if (action === 'provide-clarification') {
        const reply = window.prompt('Clarification reply (author):');
        if (!reply) return;
        body = { response_text: reply };
      } else if (action === 'respond') {
        const response = window.prompt('Designer response:');
        if (!response) return;
        body = { response_text: response };
      } else if (action === 'approve') {
        const ref = window.prompt('Approval reference — approving with grid_code OR bid_envelope crosses regulator (W96 signature):') || '';
        const reg = window.prompt('Regulator reference (NERSA C-1 / REIPPPP IPPO):') || '';
        body = { approver_party: 'reviewer' };
        if (ref) body.regulator_ref = ref;
        if (reg) body.regulator_ref = reg;
      } else if (action === 'return-for-revision') {
        const reason = window.prompt('Reason for revision:');
        if (!reason) return;
        body = { reason_code: 'returned', narrative: reason };
      } else if (action === 'resubmit') {
        const note = window.prompt('Resubmission note — what changed:');
        if (!note) return;
        body = { narrative: note };
      } else if (action === 'distribute-for-construction') {
        const ref = window.prompt('Construction release reference (high+critical grid-code releases cross regulator):') || '';
        body = ref ? { regulator_ref: ref } : {};
      } else if (action === 'incorporate') {
        const ref = window.prompt('As-built reference — incorporated into approved-for-construction set:') || '';
        body = ref ? { regulator_ref: ref } : {};
      } else if (action === 'close') {
        const note = window.prompt('Closure note (optional):') || '';
        body = note ? { notes: note } : {};
      } else if (action === 'void') {
        const reason = window.prompt('Void reason — voiding with grid_code OR life_safety crosses regulator EVERY tier:');
        if (!reason) return;
        body = { voided_reason: reason };
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason:');
        if (!reason) return;
        body = { withdrawn_reason: reason };
      }
      await api.post(`/ipp/submittal-rfi/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Submittal log &amp; RFI register · construction-document review pipeline</h2>
          <p className="text-xs text-[#4a5568]">
            13-state P6 lifecycle for the construction-document side of an IPP project — drafted → submitted →
            distributed → under review → clarification loop → responded → approved → released for construction →
            incorporated → closed clean, with the revision loop (returned for revision → resubmit → revised → distribute)
            and void / withdraw exception terminals. Beats Procore submittal log + ball-in-court, Aconex transmittals
            + spec coverage, Newforma RFI, Asite document control, Kahua e-Builder and Primavera Submittal Exchange
            via: tier RE-DERIVED on every transition from priority × workflow × the four coverage flags (grid_code /
            life_safety / bid_envelope / holds_construction) with FLOOR-AT-HIGH on those flags; URGENT SLA polarity
            (critical RFI turns in hours not weeks — construction is time-money); ball-in-court tracking; authority
            tiered construction_coordinator → lead_engineer → project_manager → project_director; LIVE battery
            decoration (minutes_until_sla, ipp_pm_quality_index 0-130 vs Procore=100 baseline, days_in_court,
            predicted_close_date_live, urgency_band). SIGNATURE regulator crossings: approve crosses EVERY tier when
            grid_code OR bid_envelope; void crosses EVERY tier when grid_code OR life_safety; distribute_for_construction
            high+critical with grid_code; return_for_revision high+critical with grid_code; sla_breached high+critical
            with grid_code OR holds_construction (NERSA Grid Code C-1 / C-3 + REIPPPP bid envelope).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="For construction" value={kpis?.distributed_for_construction_count ?? 0} tone="ok" />
        <Kpi label="Incorporated" value={kpis?.incorporated_count ?? 0} tone="ok" />
        <Kpi label="Returned for revision" value={kpis?.returned_for_revision_count ?? 0} tone={(kpis?.returned_for_revision_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Closed clean" value={kpis?.closed_clean_count ?? 0} tone="ok" />
        <Kpi label="Voided" value={kpis?.voided_count ?? 0} tone={(kpis?.voided_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Response SLA breached" value={kpis?.response_breached_count ?? 0} tone={(kpis?.response_breached_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Signature flagged" value={kpis?.signature_count ?? 0} tone={(kpis?.signature_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="IPP-PM quality index" value={fmtNum(kpis?.avg_quality_index)} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">No.</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / title</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Class</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Ball in court</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Urg</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Quality</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.current_tier];
                const ut = URGENCY_TONE[r.urgency_band] ?? URGENCY_TONE.green;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.submittal_rfi_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                      {r.signature_class_flag && <span className="ml-1 text-[#a06200]" title="Signature class (FLOOR-AT-HIGH coverage flag)">▲</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[260px] truncate" title={`${r.project_name ?? ''} · ${r.title ?? ''}`}>
                      {r.project_name ?? '—'}
                      {r.title ? <span className="text-[#4a5568]"> · {r.title}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{WORKFLOW_LABEL[r.workflow_class]}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.ball_in_court_party_live ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[10px] font-medium" style={{ background: ut.bg, color: ut.fg }}>
                        {ut.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className={(r.ipp_pm_quality_index_live ?? 0) >= 100 ? 'text-[#1f6b3a]' : 'text-[#9b1f1f]'}>
                        {fmtNum(r.ipp_pm_quality_index_live, 0)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-[#4a5568]">No submittals or RFIs match.</td></tr>
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
  row: SubmittalRow;
  events: SubmittalEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: SubmittalRow) => void;
}) {
  const primary = ACTION_FOR_STATE[row.chain_status];
  const secondary = SECONDARY_ACTIONS[row.chain_status];
  const authority = AUTHORITY_LABEL[row.authority_required_live ?? row.authority_required ?? ''] ?? (row.authority_required ?? '—');

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[820px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.submittal_rfi_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name ?? '—'}{row.title ? ` · ${row.title}` : ''}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {WORKFLOW_LABEL[row.workflow_class]}
                {row.contractor_name ? ` · ${row.contractor_name}` : ''}
                {row.designer_name ? ` · designer ${row.designer_name}` : ''}
              </div>
              {row.spec_section || row.csi_section_code ? (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  {row.csi_section_code ? `CSI ${row.csi_section_code}` : ''}
                  {row.spec_section ? ` · ${row.spec_section}` : ''}
                  {row.uniclass_code ? ` · Uniclass ${row.uniclass_code}` : ''}
                  {row.sans_section ? ` · SANS ${row.sans_section}` : ''}
                </div>
              ) : null}
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Live IPP-PM battery</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Quality index" value={fmtNum(row.ipp_pm_quality_index_live, 0)} bad={(row.ipp_pm_quality_index_live ?? 0) < 100} hint="0-130 (Procore=100 baseline)" />
              <Metric label="Days open" value={String(row.days_open_live ?? 0)} />
              <Metric label="Days in court" value={String(row.days_in_court_live ?? 0)} bad={(row.days_in_court_live ?? 0) > 5} hint="Aging in current state" />
              <Metric label="Ball in court" value={row.ball_in_court_party_live ?? '—'} hint="Auto-derived from current state" />
              <Metric label="Tier (live)" value={TIER_TONE[row.tier_live].label} bad={row.tier_live === 'critical' || row.tier_live === 'high'} hint="Re-derived every transition" />
              <Metric label="Urgency band" value={URGENCY_TONE[row.urgency_band]?.label ?? row.urgency_band} bad={row.urgency_band === 'red' || row.urgency_band === 'amber'} />
              <Metric label="Predicted close" value={fmtDate(row.predicted_close_date_live)} hint="Tier-derived ETA" />
              <Metric label="Authority" value={authority} hint="Construction coordinator → lead engineer → project manager → project director" />
            </div>
          </div>

          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Coverage flags (FLOOR-AT-HIGH)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Grid code" value={row.affects_grid_code ? 'Yes' : 'No'} bad={!!row.affects_grid_code} hint="NERSA Grid Code C-1 / C-3" />
              <Metric label="Life safety" value={row.affects_life_safety ? 'Yes' : 'No'} bad={!!row.affects_life_safety} />
              <Metric label="Bid envelope" value={row.affects_bid_envelope ? 'Yes' : 'No'} bad={!!row.affects_bid_envelope} hint="REIPPPP bid envelope" />
              <Metric label="Holds construction" value={row.holds_construction ? 'Yes' : 'No'} bad={!!row.holds_construction} />
              <Metric label="Grid-code clauses" value={String(row.grid_code_clauses_affected ?? 0)} />
              <Metric label="Bid drift" value={row.bid_envelope_drift_pct != null ? `${fmtNum(row.bid_envelope_drift_pct, 2)}%` : '—'} bad={(row.bid_envelope_drift_pct ?? 0) !== 0} />
              <Metric label="Est. cost impact" value={fmtZar(row.estimated_cost_impact_zar)} bad={(row.estimated_cost_impact_zar ?? 0) > 0} />
              <Metric label="Est. schedule impact" value={row.estimated_schedule_impact_days != null ? `${row.estimated_schedule_impact_days}d` : '—'} bad={(row.estimated_schedule_impact_days ?? 0) > 0} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"              value={STATE_TONE[row.chain_status].label} />
            <Pair label="Workflow class"     value={WORKFLOW_LABEL[row.workflow_class]} />
            <Pair label="Priority"           value={row.priority_class} />
            <Pair label="Document type"      value={row.document_type ?? '—'} />
            <Pair label="CSI section"        value={row.csi_section_code ?? '—'} />
            <Pair label="Spec section"       value={row.spec_section ?? '—'} />
            <Pair label="Transmittal #"      value={row.transmittal_number ?? '—'} />
            <Pair label="Sequence #"         value={row.sequence_number != null ? String(row.sequence_number) : '—'} />
            <Pair label="Contractor"         value={row.contractor_name ?? '—'} />
            <Pair label="Designer"           value={row.designer_name ?? '—'} />
            <Pair label="Vendor"             value={row.vendor_name ?? '—'} />
            <Pair label="Owner"              value={row.owner_party_name ?? '—'} />
            <Pair label="Last responder"     value={row.last_responder_party ?? '—'} />
            <Pair label="Requester"          value={row.requester_party ?? '—'} />
            <Pair label="Approver"           value={row.approver_party ?? '—'} />
            <Pair label="Drawing ref"        value={row.drawing_ref ?? '—'} />
            <Pair label="Regulator ref"      value={row.regulator_ref ?? '—'} />
            <Pair label="Clarifications"     value={String(row.clarification_count ?? 0)} />
            <Pair label="Revisions"          value={String(row.revision_count ?? 0)} />
            <Pair label="Rejections"         value={String(row.rejection_count ?? 0)} />
            <Pair label="Responses"          value={String(row.response_count ?? 0)} />
            <Pair label="Drafted"            value={fmtDate(row.drafted_at)} />
            <Pair label="Submitted"          value={fmtDate(row.submitted_at)} />
            <Pair label="Distributed"        value={fmtDate(row.distributed_at)} />
            <Pair label="Under review"       value={fmtDate(row.under_review_at)} />
            <Pair label="Responded"          value={fmtDate(row.responded_at)} />
            <Pair label="Approved"           value={fmtDate(row.approved_at)} />
            <Pair label="For construction"   value={fmtDate(row.distributed_for_construction_at)} />
            <Pair label="Incorporated"       value={fmtDate(row.incorporated_at)} />
            <Pair label="Closed clean"       value={fmtDate(row.closed_clean_at)} />
            <Pair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
            <Pair label="Response due"       value={fmtDate(row.response_due_at)} />
            <Pair label="SLA"                value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Response SLA"       value={row.is_terminal ? '—' : row.response_sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_response_sla)} />
            <Pair label="Escalation lvl"     value={String(row.escalation_level)} />
            <Pair label="Reportable"         value={row.is_reportable_flag ? 'Yes' : 'No'} />
          </div>
          {row.narrative && <BasisBlock label="Narrative" tone="#1a3a5c" text={row.narrative} />}
          {row.response_text && <BasisBlock label="Response" tone="#1f6b3a" text={row.response_text} />}
          {row.voided_reason && <BasisBlock label="Voided reason" tone="#9b1f1f" text={row.voided_reason} />}
          {row.withdrawn_reason && <BasisBlock label="Withdrawn reason" tone="#8a4a00" text={row.withdrawn_reason} />}
        </section>

        {(primary || secondary.length > 0) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {primary && (
                <button type="button"
                  onClick={() => onAct(primary, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[primary]}
                </button>
              )}
              {secondary.map((a) => {
                const danger = DESTRUCTIVE.includes(a);
                return (
                  <button type="button"
                    key={a}
                    onClick={() => onAct(a, row)}
                    className={
                      danger
                        ? 'rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50'
                        : 'rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#557] hover:bg-[#f3f5f9]'
                    }
                  >
                    {ACTION_LABEL[a]}
                  </button>
                );
              })}
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

function Metric({ label, value, bad, hint }: { label: string; value: string; bad?: boolean; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className={`text-[13px] font-semibold tabular-nums ${bad ? 'text-[#9b1f1f]' : 'text-[#0c2a4d]'}`}>{value}</div>
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
