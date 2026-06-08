// Wave 100 — IPP Mechanical / Electrical Handover Dossier + Turnover-to-
// Operations tab. The construction-to-O&M turnover package a best-in-class
// IPP-PM stack ships at practical completion. Beats Procore Handover, Aconex
// Handover, BIM 360 Handover, Bentley ProjectWise/AssetWise, e-Builder
// Closeout, ServiceNow Handover, SAP S/4HANA Asset Handover and IBM Maximo
// Asset Handover via:
//   - 12-state P6 lifecycle (dossier_compiled -> submitted -> under_review
//     -> revision_required loop -> approved -> witnessed_acceptance_scheduled
//     -> witnessed_acceptance -> punch_remediated -> training_transferred
//     -> warranty_activated -> operations_owned -> archived) plus reject /
//     withdraw / void terminals
//   - tier RE-DERIVED on every transition from priority x workflow class
//     with FLOOR-AT-HIGH for blocks_warranty_start | blocks_om_handover |
//     incomplete_as_built | untransferred_spares
//   - URGENT SLA polarity (warranty-clock-running = tightest)
//   - ball-in-court tracking + authority tiered (project_engineer ->
//     commissioning_engineer -> operations_manager -> handover_director)
//   - LIVE battery decoration on every fetch: minutes_until_sla,
//     handover_completeness_index (0-130 vs industry baseline=100 with
//     as-built/spares/training/witness/warranty bonuses), days_in_court,
//     predicted_close_date_live, urgency_band
//   - SIGNATURE regulator crossings (W100 - REIPPPP O&M handover + NERSA
//     s.C-5 + OHSA s24): approve crosses EVERY tier on blocks_warranty_start;
//     transfer_to_operations EVERY tier on warranty OR om; void EVERY tier
//     on incomplete_as_built OR untransferred_spares; sla_breached crosses
//     regulator EVERY tier on warranty; high+critical on om.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'dossier_compiled' | 'submitted' | 'under_review' | 'revision_required'
  | 'approved' | 'witnessed_acceptance_scheduled' | 'witnessed_acceptance'
  | 'punch_remediated' | 'training_transferred' | 'warranty_activated'
  | 'operations_owned' | 'archived'
  | 'rejected' | 'withdrawn' | 'voided';

type Tier = 'critical' | 'high' | 'standard' | 'low';

type WorkflowClass =
  | 'mechanical_drivetrain' | 'electrical_balance_of_plant' | 'inverter_skid'
  | 'transformer_bay' | 'battery_storage_skid' | 'scada_dms_integration'
  | 'civil_structural' | 'protection_relay_package' | 'spare_parts_kit'
  | 'training_documentation_pack';

interface HandoverRow {
  id: string;
  dossier_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string;
  project_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  contractor_id: string | null;
  contractor_name: string | null;
  owner_party_id: string | null;
  owner_party_name: string | null;
  independent_engineer_party_id: string | null;
  independent_engineer_party_name: string | null;
  workflow_class: WorkflowClass;
  priority_class: 'critical' | 'high' | 'standard' | 'low';
  dossier_scope: string | null;
  drawing_register_ref: string | null;
  spec_register_ref: string | null;
  acceptance_criteria: string | null;
  compiled_at: string | null;
  blocks_warranty_start: number;
  blocks_om_handover: number;
  incomplete_as_built: number;
  untransferred_spares: number;
  current_tier: Tier;
  authority_required: string | null;
  revision_count: number;
  punch_count_open: number;
  as_built_completeness_pct: number;
  spare_parts_completeness_pct: number;
  training_completion_pct: number;
  witnessed_acceptance_clear: number;
  warranty_activated: number;
  warranty_start_date: string | null;
  warranty_end_date: string | null;
  warranty_admin_party_id: string | null;
  warranty_admin_party_name: string | null;
  dossier_cost_zar: number | null;
  handover_cost_zar: number | null;
  parent_dossier_id: string | null;
  om_handover_blocker_ref: string | null;
  warranty_blocker_ref: string | null;
  regulator_ref: string | null;
  title: string | null;
  narrative: string | null;
  result_text: string | null;
  rejected_reason: string | null;
  voided_reason: string | null;
  withdrawn_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  requester_party: string | null;
  approver_party: string | null;
  witness_party: string | null;
  chain_status: ChainStatus;
  submitted_at: string | null;
  under_review_at: string | null;
  revision_required_at: string | null;
  approved_at: string | null;
  witnessed_acceptance_scheduled_at: string | null;
  witnessed_acceptance_at: string | null;
  punch_remediated_at: string | null;
  training_transferred_at: string | null;
  warranty_activated_at: string | null;
  operations_owned_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  voided_at: string | null;
  is_reportable: number;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // decorated
  is_terminal: boolean;
  minutes_until_sla: number | null;
  sla_breached: boolean;
  sla_window_minutes: number;
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
  handover_completeness_index_live: number;
  inbox_severity_live: string;
  reportable_per_spec: boolean;
}

interface HandoverEvent {
  id: string;
  dossier_id: string;
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
  archived_count: number;
  rejected_count: number;
  withdrawn_count: number;
  voided_count: number;
  breached: number;
  reportable_total: number;
  signature_count: number;
  warranty_count: number;
  om_count: number;
  asbuilt_count: number;
  spares_count: number;
  witness_clear_count: number;
  warranty_active_count: number;
  avg_completeness_index: number;
  avg_days_in_court: number;
  avg_as_built_pct: number;
  avg_spares_pct: number;
  avg_training_pct: number;
  total_dossier_cost_zar: number;
  total_handover_cost_zar: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  dossier_compiled:               { bg: '#e3e7ec', fg: '#557',    label: 'Compiled' },
  submitted:                      { bg: '#dbecfb', fg: '#1a3a5c', label: 'Submitted' },
  under_review:                   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Under review' },
  revision_required:              { bg: '#ffe4b5', fg: '#8a4a00', label: 'Revision req.' },
  approved:                       { bg: '#daf5e2', fg: '#1f6b3a', label: 'Approved' },
  witnessed_acceptance_scheduled: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Witness scheduled' },
  witnessed_acceptance:           { bg: '#fff4d6', fg: '#a06200', label: 'Witnessed' },
  punch_remediated:               { bg: '#fff4d6', fg: '#a06200', label: 'Punch remediated' },
  training_transferred:           { bg: '#fff4d6', fg: '#a06200', label: 'Training xfer' },
  warranty_activated:             { bg: '#cfe9d7', fg: '#0f5132', label: 'Warranty active' },
  operations_owned:               { bg: '#cfe9d7', fg: '#0f5132', label: 'Ops-owned' },
  archived:                       { bg: '#cfe9d7', fg: '#0f5132', label: 'Archived' },
  rejected:                       { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rejected' },
  withdrawn:                      { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
  voided:                         { bg: '#fde0e0', fg: '#9b1f1f', label: 'Voided' },
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
  project_engineer:       'Project engineer',
  commissioning_engineer: 'Commissioning engineer',
  operations_manager:     'Operations manager',
  handover_director:      'Handover director',
};

const WORKFLOW_LABEL: Record<WorkflowClass, string> = {
  mechanical_drivetrain:        'Mechanical drivetrain',
  electrical_balance_of_plant:  'Electrical BoP',
  inverter_skid:                'Inverter skid',
  transformer_bay:              'Transformer bay',
  battery_storage_skid:         'Battery storage skid',
  scada_dms_integration:        'SCADA / DMS integration',
  civil_structural:             'Civil / structural',
  protection_relay_package:     'Protection relay package',
  spare_parts_kit:              'Spare parts kit',
  training_documentation_pack:  'Training documentation pack',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                           label: 'Open' },
  { key: 'all',                            label: 'All' },
  { key: 'critical',                       label: 'Critical' },
  { key: 'high',                           label: 'High' },
  { key: 'standard',                       label: 'Standard' },
  { key: 'low',                            label: 'Low' },
  { key: 'dossier_compiled',               label: 'Compiled' },
  { key: 'submitted',                      label: 'Submitted' },
  { key: 'under_review',                   label: 'Under review' },
  { key: 'revision_required',              label: 'Revision req.' },
  { key: 'witnessed_acceptance_scheduled', label: 'Witness sched.' },
  { key: 'witnessed_acceptance',           label: 'Witnessed' },
  { key: 'warranty_activated',             label: 'Warranty active' },
  { key: 'operations_owned',               label: 'Ops-owned' },
  { key: 'archived',                       label: 'Archived' },
  { key: 'breached',                       label: 'SLA breached' },
  { key: 'reportable',                     label: 'Reportable' },
  { key: 'signature',                      label: 'Signature' },
  { key: 'warranty_only',                  label: 'Warranty-blocking' },
  { key: 'om_only',                        label: 'O&M-blocking' },
  { key: 'asbuilt_only',                   label: 'As-built incomplete' },
  { key: 'spares_only',                    label: 'Spares untransferred' },
];

type ActionKind =
  | 'submit' | 'open-review' | 'require-revision' | 'revise-and-resubmit'
  | 'approve' | 'schedule-witnessed-acceptance' | 'complete-witnessed-acceptance'
  | 'remediate-punch' | 'transfer-training' | 'activate-warranty'
  | 'transfer-to-operations' | 'archive'
  | 'reject' | 'withdraw' | 'void';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  dossier_compiled:               'submit',
  submitted:                      'open-review',
  under_review:                   'approve',
  revision_required:              'revise-and-resubmit',
  approved:                       'schedule-witnessed-acceptance',
  witnessed_acceptance_scheduled: 'complete-witnessed-acceptance',
  witnessed_acceptance:           'remediate-punch',
  punch_remediated:               'transfer-training',
  training_transferred:           'activate-warranty',
  warranty_activated:             'transfer-to-operations',
  operations_owned:               'archive',
  archived:                       null,
  rejected:                       null,
  withdrawn:                      null,
  voided:                         null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'submit':                         'Submit (commissioning engineer)',
  'open-review':                    'Open review (independent engineer)',
  'require-revision':               'Require revision (independent engineer)',
  'revise-and-resubmit':            'Revise & resubmit (handover coordinator)',
  'approve':                        'Approve (independent engineer)',
  'schedule-witnessed-acceptance':  'Schedule witnessed acceptance',
  'complete-witnessed-acceptance':  'Complete witnessed acceptance',
  'remediate-punch':                'Remediate punch list (contractor)',
  'transfer-training':              'Transfer training (training lead)',
  'activate-warranty':              'Activate warranty (warranty administrator)',
  'transfer-to-operations':         'Transfer to operations (operations manager)',
  'archive':                        'Archive (handover director)',
  'reject':                         'Reject (independent engineer)',
  'withdraw':                       'Withdraw (handover coordinator)',
  'void':                           'Void (owner)',
};

const SECONDARY_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  dossier_compiled:               ['withdraw'],
  submitted:                      ['reject', 'withdraw'],
  under_review:                   ['require-revision', 'reject', 'void'],
  revision_required:              ['void'],
  approved:                       ['void'],
  witnessed_acceptance_scheduled: ['void'],
  witnessed_acceptance:           ['void'],
  punch_remediated:               ['void'],
  training_transferred:           ['void'],
  warranty_activated:             ['void'],
  operations_owned:               ['void'],
  archived:                       [],
  rejected:                       [],
  withdrawn:                      [],
  voided:                         [],
};

const DESTRUCTIVE: ActionKind[] = ['reject', 'withdraw', 'void', 'require-revision'];

const TERMINAL_STATES: ChainStatus[] = ['archived', 'rejected', 'withdrawn', 'voided'];

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

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${(v * 100).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}%`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

export function HandoverDossierChainTab() {
  const [rows, setRows] = useState<HandoverRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<HandoverRow | null>(null);
  const [events, setEvents] = useState<HandoverEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: HandoverRow[] } & KpiSummary }>('/ipp/handover-dossier/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count,
          archived_count: d.archived_count, rejected_count: d.rejected_count,
          withdrawn_count: d.withdrawn_count, voided_count: d.voided_count,
          breached: d.breached, reportable_total: d.reportable_total,
          signature_count: d.signature_count,
          warranty_count: d.warranty_count, om_count: d.om_count,
          asbuilt_count: d.asbuilt_count, spares_count: d.spares_count,
          witness_clear_count: d.witness_clear_count,
          warranty_active_count: d.warranty_active_count,
          avg_completeness_index: d.avg_completeness_index,
          avg_days_in_court: d.avg_days_in_court,
          avg_as_built_pct: d.avg_as_built_pct,
          avg_spares_pct: d.avg_spares_pct,
          avg_training_pct: d.avg_training_pct,
          total_dossier_cost_zar: d.total_dossier_cost_zar,
          total_handover_cost_zar: d.total_handover_cost_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load handover dossier chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { dossier: HandoverRow; events: HandoverEvent[] } }>(`/ipp/handover-dossier/chain/${id}`);
      if (res.data?.data?.dossier) setSelected(res.data.data.dossier);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load handover dossier history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')           return true;
      if (filter === 'open')          return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')      return r.sla_breached;
      if (filter === 'reportable')    return r.is_reportable_flag;
      if (filter === 'signature')     return r.signature_class_flag;
      if (filter === 'warranty_only') return r.blocks_warranty_start === 1;
      if (filter === 'om_only')       return r.blocks_om_handover === 1;
      if (filter === 'asbuilt_only')  return r.incomplete_as_built === 1;
      if (filter === 'spares_only')   return r.untransferred_spares === 1;
      if (['critical', 'high', 'standard', 'low'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: HandoverRow) => {
    try {
      let body: Record<string, unknown> = {};
      if (action === 'submit') {
        const note = window.prompt('Submission note (warranty-blocking dossiers cross NERSA inbox on approve):') || '';
        body = note ? { narrative: note } : {};
      } else if (action === 'open-review') {
        body = {};
      } else if (action === 'require-revision') {
        const note = window.prompt('Revision instructions (independent engineer):');
        if (!note) return;
        body = { narrative: note, last_responder_party: 'independent_engineer' };
      } else if (action === 'revise-and-resubmit') {
        const note = window.prompt('Revision note (auto-increments revision count):') || '';
        body = note ? { narrative: note, last_responder_party: 'handover_coordinator' } : { last_responder_party: 'handover_coordinator' };
      } else if (action === 'approve') {
        const reg = window.prompt('Regulator reference (warranty-blocking approvals cross EVERY tier) — leave blank if not applicable:') || '';
        const cost = window.prompt('Dossier cost (ZAR, optional):') || '';
        body = {
          approver_party: 'independent_engineer',
          ...(reg ? { regulator_ref: reg } : {}),
          ...(cost ? { dossier_cost_zar: Number(cost) } : {}),
        };
      } else if (action === 'schedule-witnessed-acceptance') {
        const witness = window.prompt('Witness party (independent_engineer / regulator / lender):') || 'independent_engineer';
        body = { witness_party: witness };
      } else if (action === 'complete-witnessed-acceptance') {
        const clear = window.prompt('Witnessed acceptance clear? (1 = clear, 0 = punch raised):') || '1';
        const punches = window.prompt('Open punch count (0 if clear):') || '0';
        body = {
          witnessed_acceptance_clear: Number(clear),
          punch_count_open: Number(punches),
          last_responder_party: 'witness',
        };
      } else if (action === 'remediate-punch') {
        const punches = window.prompt('Open punch count after remediation (0 if all closed):') || '0';
        const cost = window.prompt('Handover cost incurred (ZAR, optional):') || '';
        body = {
          punch_count_open: Number(punches),
          last_responder_party: 'contractor',
          ...(cost ? { handover_cost_zar: Number(cost) } : {}),
        };
      } else if (action === 'transfer-training') {
        const pct = window.prompt('Training completion (0-100):') || '100';
        body = {
          training_completion_pct: Number(pct),
          last_responder_party: 'training_lead',
        };
      } else if (action === 'activate-warranty') {
        const admin = window.prompt('Warranty administrator party name:') || '';
        body = admin ? { warranty_admin_party_name: admin } : {};
      } else if (action === 'transfer-to-operations') {
        const note = window.prompt('Transfer-to-operations note — warranty OR O&M-blocking transfers cross regulator EVERY tier:') || '';
        body = note ? { narrative: note, last_responder_party: 'operations_manager' } : { last_responder_party: 'operations_manager' };
      } else if (action === 'archive') {
        body = {};
      } else if (action === 'reject') {
        const reason = window.prompt('Rejection reason (independent engineer):');
        if (!reason) return;
        body = { rejected_reason: reason };
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason (handover coordinator):');
        if (!reason) return;
        body = { withdrawn_reason: reason };
      } else if (action === 'void') {
        const reason = window.prompt('Void reason — voiding with as-built OR spares incomplete crosses regulator EVERY tier:');
        if (!reason) return;
        body = { voided_reason: reason };
      }
      await api.post(`/ipp/handover-dossier/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Handover dossier &middot; Turnover-to-operations</h2>
          <p className="text-xs text-[#4a5568]">
            12-state P6 lifecycle for the construction-to-O&amp;M turnover package an IPP project ships at practical
            completion — dossier_compiled → submitted → under_review → &#123;revision_required loop&#125; → approved
            → witnessed_acceptance_scheduled → witnessed_acceptance → punch_remediated → training_transferred →
            warranty_activated → operations_owned → archived, with reject / withdraw / void exception terminals. Beats
            Procore Handover, Aconex Handover, BIM 360 Handover, Bentley ProjectWise/AssetWise, e-Builder Closeout,
            ServiceNow Handover, SAP S/4HANA Asset Handover and IBM Maximo Asset Handover via: tier RE-DERIVED on every
            transition from priority × workflow class with FLOOR-AT-HIGH for blocks_warranty_start /
            blocks_om_handover / incomplete_as_built / untransferred_spares; URGENT SLA polarity (warranty-clock-running
            = tightest); ball-in-court tracking; authority tiered project_engineer → commissioning_engineer →
            operations_manager → handover_director; LIVE battery decoration (minutes_until_sla,
            handover_completeness_index 0-130 vs industry baseline=100 with as-built/spares/training/witness/warranty
            bonuses, days_in_court, predicted_close_date_live, urgency_band). SIGNATURE regulator crossings (REIPPPP
            O&amp;M handover + NERSA §C-5 + OHSA s24): approve crosses EVERY tier on warranty;
            transfer_to_operations EVERY tier on warranty OR O&amp;M; void EVERY tier on as-built OR spares;
            sla_breached EVERY tier on warranty, high+critical on O&amp;M.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total"            value={kpis?.total ?? rows.length} />
        <Kpi label="Open"             value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Archived"         value={kpis?.archived_count ?? 0} tone="ok" />
        <Kpi label="Rejected"         value={kpis?.rejected_count ?? 0} tone={(kpis?.rejected_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Voided"           value={kpis?.voided_count ?? 0} tone={(kpis?.voided_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"     value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Signature"        value={kpis?.signature_count ?? 0} tone={(kpis?.signature_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Warranty-blocking" value={kpis?.warranty_count ?? 0} tone={(kpis?.warranty_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="O&M-blocking"     value={kpis?.om_count ?? 0} tone={(kpis?.om_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="As-built incompl." value={kpis?.asbuilt_count ?? 0} tone={(kpis?.asbuilt_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Spares untransf." value={kpis?.spares_count ?? 0} tone={(kpis?.spares_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reportable"       value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Completeness"     value={fmtNum(kpis?.avg_completeness_index, 0)} />
        <Kpi label="As-built avg"     value={fmtPct((kpis?.avg_as_built_pct ?? 0) / 100)} tone={((kpis?.avg_as_built_pct ?? 0) / 100) < 0.9 ? 'warn' : 'ok'} />
        <Kpi label="Spares avg"       value={fmtPct((kpis?.avg_spares_pct ?? 0) / 100)} tone={((kpis?.avg_spares_pct ?? 0) / 100) < 0.9 ? 'warn' : 'ok'} />
        <Kpi label="Training avg"     value={fmtPct((kpis?.avg_training_pct ?? 0) / 100)} tone={((kpis?.avg_training_pct ?? 0) / 100) < 0.9 ? 'warn' : 'ok'} />
        <Kpi label="Witness clear"    value={kpis?.witness_clear_count ?? 0} />
        <Kpi label="Warranty active"  value={kpis?.warranty_active_count ?? 0} />
        <Kpi label="Dossier cost"     value={fmtZar(kpis?.total_dossier_cost_zar)} />
        <Kpi label="Handover cost"    value={fmtZar(kpis?.total_handover_cost_zar)} tone={(kpis?.total_handover_cost_zar ?? 0) > 0 ? 'warn' : 'ok'} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / facility</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Class</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Ball in court</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Urg</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Completeness</th>
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
                      {r.dossier_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                      {r.signature_class_flag && <span className="ml-1 text-[#a06200]" title="Signature class (warranty OR O&M-blocking)">▲</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[260px] truncate" title={`${r.project_name ?? ''} · ${r.facility_name ?? ''}`}>
                      {r.project_name ?? '—'}
                      {r.facility_name && <span className="text-[#4a5568]"> · {r.facility_name}</span>}
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
                      <span className={(r.handover_completeness_index_live ?? 0) >= 100 ? 'text-[#1f6b3a]' : 'text-[#9b1f1f]'}>
                        {fmtNum(r.handover_completeness_index_live, 0)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-[#4a5568]">No handover dossier records match.</td></tr>
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
  row: HandoverRow;
  events: HandoverEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: HandoverRow) => void;
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
              <div className="font-mono text-[12px] text-[#4a5568]">{row.dossier_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name ?? '—'}{row.compiled_at ? ` · ${row.compiled_at.slice(0, 10)}` : ''}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {WORKFLOW_LABEL[row.workflow_class]}
                {row.contractor_name ? ` · ${row.contractor_name}` : ''}
                {row.facility_name ? ` · ${row.facility_name}` : ''}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Live handover completeness battery</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Completeness index" value={fmtNum(row.handover_completeness_index_live, 0)} bad={(row.handover_completeness_index_live ?? 0) < 100} hint="0-130 (industry baseline=100; as-built/spares/training/witness/warranty bonuses)" />
              <Metric label="Days open" value={String(row.days_open_live ?? 0)} />
              <Metric label="Days in court" value={String(row.days_in_court_live ?? 0)} bad={(row.days_in_court_live ?? 0) > 2} hint="Aging in current state" />
              <Metric label="Ball in court" value={row.ball_in_court_party_live ?? '—'} hint="Auto-derived from current state" />
              <Metric label="Tier (live)" value={TIER_TONE[row.tier_live].label} bad={row.tier_live === 'critical' || row.tier_live === 'high'} hint="Re-derived every transition" />
              <Metric label="Urgency band" value={URGENCY_TONE[row.urgency_band]?.label ?? row.urgency_band} bad={row.urgency_band === 'red' || row.urgency_band === 'amber'} />
              <Metric label="Predicted close" value={fmtDate(row.predicted_close_date_live)} hint="Tier-derived forward-path ETA" />
              <Metric label="Authority" value={authority} hint="Project engineer → commissioning engineer → operations manager → handover director" />
            </div>
          </div>

          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Coverage flags (FLOOR-AT-HIGH)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Blocks warranty" value={row.blocks_warranty_start ? 'Yes' : 'No'} bad={!!row.blocks_warranty_start} hint="REIPPPP O&M handover — warranty clock cannot start" />
              <Metric label="Blocks O&M handover" value={row.blocks_om_handover ? 'Yes' : 'No'} bad={!!row.blocks_om_handover} hint="NERSA §C-5 — blocks transfer to operations" />
              <Metric label="As-built incomplete" value={row.incomplete_as_built ? 'Yes' : 'No'} bad={!!row.incomplete_as_built} hint="As-built drawings short of acceptance criteria" />
              <Metric label="Spares untransferred" value={row.untransferred_spares ? 'Yes' : 'No'} bad={!!row.untransferred_spares} hint="Spare parts kit not transferred to operations" />
              <Metric label="Revisions" value={String(row.revision_count ?? 0)} bad={(row.revision_count ?? 0) > 0} />
              <Metric label="Punch open" value={String(row.punch_count_open ?? 0)} bad={(row.punch_count_open ?? 0) > 0} />
              <Metric label="As-built %" value={fmtPct((row.as_built_completeness_pct ?? 0) / 100)} bad={((row.as_built_completeness_pct ?? 0) / 100) < 0.9} hint="+10 completeness bonus at 100%" />
              <Metric label="Spares %" value={fmtPct((row.spare_parts_completeness_pct ?? 0) / 100)} bad={((row.spare_parts_completeness_pct ?? 0) / 100) < 0.9} hint="+10 completeness bonus at 100%" />
              <Metric label="Training %" value={fmtPct((row.training_completion_pct ?? 0) / 100)} bad={((row.training_completion_pct ?? 0) / 100) < 0.9} hint="+5 completeness bonus at 100%" />
              <Metric label="Witness clear" value={row.witnessed_acceptance_clear ? 'Yes' : 'No'} bad={!row.witnessed_acceptance_clear} hint="+5 completeness when clear" />
              <Metric label="Warranty active" value={row.warranty_activated ? 'Yes' : 'No'} bad={!row.warranty_activated} hint="OEM warranty clock running" />
              <Metric label="Drawing register" value={row.drawing_register_ref ?? '—'} />
            </div>
          </div>

          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Handover economics</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Dossier cost" value={fmtZar(row.dossier_cost_zar)} hint="Cost expended on dossier compilation + approval" />
              <Metric label="Handover cost" value={fmtZar(row.handover_cost_zar)} bad={(row.handover_cost_zar ?? 0) > 0} hint="Rework + punch remediation incurred" />
              <Metric label="Total cost" value={fmtZar(((row.dossier_cost_zar ?? 0) + (row.handover_cost_zar ?? 0)))} bad={((row.handover_cost_zar ?? 0)) > 0} />
              <Metric label="Warranty start" value={row.warranty_start_date ?? '—'} />
              <Metric label="Warranty end" value={row.warranty_end_date ?? '—'} />
              <Metric label="Warranty admin" value={row.warranty_admin_party_name ?? '—'} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"             value={STATE_TONE[row.chain_status].label} />
            <Pair label="Workflow class"    value={WORKFLOW_LABEL[row.workflow_class]} />
            <Pair label="Priority"          value={row.priority_class} />
            <Pair label="Dossier scope"     value={row.dossier_scope ?? '—'} />
            <Pair label="Compiled at"       value={fmtDate(row.compiled_at)} />
            <Pair label="Acceptance crit."  value={row.acceptance_criteria ?? '—'} />
            <Pair label="Drawing register"  value={row.drawing_register_ref ?? '—'} />
            <Pair label="Spec register"     value={row.spec_register_ref ?? '—'} />
            <Pair label="Contractor"        value={row.contractor_name ?? '—'} />
            <Pair label="Facility"          value={row.facility_name ?? '—'} />
            <Pair label="Owner"             value={row.owner_party_name ?? '—'} />
            <Pair label="Indep. engineer"   value={row.independent_engineer_party_name ?? '—'} />
            <Pair label="Witness party"     value={row.witness_party ?? '—'} />
            <Pair label="Last responder"    value={row.last_responder_party ?? '—'} />
            <Pair label="Requester"         value={row.requester_party ?? '—'} />
            <Pair label="Approver"          value={row.approver_party ?? '—'} />
            <Pair label="O&M blocker ref"   value={row.om_handover_blocker_ref ?? '—'} />
            <Pair label="Warranty blocker"  value={row.warranty_blocker_ref ?? '—'} />
            <Pair label="Regulator ref"     value={row.regulator_ref ?? '—'} />
            <Pair label="Submitted"         value={fmtDate(row.submitted_at)} />
            <Pair label="Under review"      value={fmtDate(row.under_review_at)} />
            <Pair label="Revision required" value={fmtDate(row.revision_required_at)} />
            <Pair label="Approved"          value={fmtDate(row.approved_at)} />
            <Pair label="Witness scheduled" value={fmtDate(row.witnessed_acceptance_scheduled_at)} />
            <Pair label="Witnessed"         value={fmtDate(row.witnessed_acceptance_at)} />
            <Pair label="Punch remediated"  value={fmtDate(row.punch_remediated_at)} />
            <Pair label="Training xfer"     value={fmtDate(row.training_transferred_at)} />
            <Pair label="Warranty active"   value={fmtDate(row.warranty_activated_at)} />
            <Pair label="Ops-owned"         value={fmtDate(row.operations_owned_at)} />
            <Pair label="Archived"          value={fmtDate(row.archived_at)} />
            <Pair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA"               value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"    value={String(row.escalation_level)} />
            <Pair label="Reportable"        value={row.is_reportable_flag ? 'Yes' : 'No'} />
          </div>
          {row.title && <BasisBlock label="Title" tone="#1a3a5c" text={row.title} />}
          {row.narrative && <BasisBlock label="Narrative" tone="#1a3a5c" text={row.narrative} />}
          {row.result_text && <BasisBlock label="Result" tone="#1f6b3a" text={row.result_text} />}
          {row.rejected_reason && <BasisBlock label="Rejected reason" tone="#9b1f1f" text={row.rejected_reason} />}
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
