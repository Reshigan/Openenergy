// Wave 64 — Esums Permit-to-Work (PTW) / LOTO Authorisation & Isolation Control tab.
//
// The PROACTIVE safe-system-of-work gate every hazardous field intervention on a
// PV / wind asset must pass BEFORE it starts (OHSA 85/1993 s8 + Construction
// Regulations 2014 + Electrical/General Machinery Regulations + REIPPPP O&M).
// Complements W25 HSE incident (REACTIVE) and gates W16 WO-dispatch + W59 PM:
// no isolation-confirmed permit, no work.
//
//   • KPI strip: total / open / in-progress / SLA breached / top-tier open /
//     live-work / revoked
//   • Filter pills by hazard tier + chain state + SLA breach + live + reportable
//   • Listing with hazard-tier pill + LIVE flag + URGENT SLA countdown
//   • Drill-down: timeline (issuing-authority / permit-holder party tags) +
//     per-state actions (assess → isolate → verify → issue → work → close)
//
// Single-party write: Esums O&M operators record every party's action; the
// actor_party tag records whether the issuing authority or the permit holder
// performed the contractual function. No create form — permits originate from the
// WO-dispatch / PM field workflow.

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
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'permit_requested' | 'hazard_assessment' | 'isolation_pending'
  | 'isolation_confirmed' | 'permit_issued' | 'work_in_progress' | 'suspended'
  | 'work_complete' | 'permit_closed' | 'permit_rejected' | 'permit_revoked'
  | 'withdrawn';

type HazardTier = 'low' | 'moderate' | 'high' | 'critical' | 'catastrophic';

type WorkClass =
  | 'electrical_live' | 'electrical_isolated' | 'working_at_height'
  | 'confined_space' | 'hot_work' | 'lifting' | 'excavation' | 'general';

interface PermitRow {
  [key: string]: unknown;
  id: string;
  permit_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  holder_party_name: string;
  authority_party_name: string;
  isolating_authority_name: string | null;
  asset_name: string | null;
  equipment_tag: string | null;
  work_location: string | null;
  work_description: string | null;
  work_class: WorkClass;
  method_statement_ref: string | null;
  hazard_score: number;
  hazard_tier: HazardTier;
  live_work: number;
  energy_sources: string | null;
  isolation_points: number | null;
  permit_validity_hours: number | null;
  request_ref: string | null;
  assessment_ref: string | null;
  isolation_plan_ref: string | null;
  isolation_cert_ref: string | null;
  permit_ref: string | null;
  suspension_ref: string | null;
  completion_ref: string | null;
  closure_ref: string | null;
  rejection_ref: string | null;
  revocation_ref: string | null;
  withdrawal_ref: string | null;
  regulator_ref: string | null;
  request_basis: string | null;
  assessment_basis: string | null;
  isolation_basis: string | null;
  issue_basis: string | null;
  suspension_basis: string | null;
  completion_basis: string | null;
  closure_basis: string | null;
  rejection_basis: string | null;
  revocation_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  suspend_count: number;
  chain_status: ChainStatus;
  sla_deadline_at: string | null;
  escalation_level: number;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  live_work_flag?: boolean;
  breach_crosses_regulator?: boolean;
  created_at: string;
}

interface KpiData {
  total: number;
  open_count: number;
  closed_count: number;
  issued_count: number;
  in_progress_count: number;
  suspended_count: number;
  rejected_count: number;
  revoked_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  live_work_total: number;
  confined_total: number;
  top_tier_open: number;
  total_isolation_points: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'permit_requested',
  'hazard_assessment',
  'isolation_pending',
  'isolation_confirmed',
  'permit_issued',
  'work_in_progress',
  'suspended',
  'work_complete',
  'permit_closed',
];
const BRANCH_STATES: readonly string[] = [
  'permit_rejected',
  'permit_revoked',
  'withdrawn',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',              label: 'Active (pre-terminal)' },
  { key: 'all',                 label: 'All' },
  { key: 'catastrophic',        label: 'Catastrophic' },
  { key: 'critical',            label: 'Critical' },
  { key: 'high',                label: 'High' },
  { key: 'moderate',            label: 'Moderate' },
  { key: 'low',                 label: 'Low' },
  { key: 'hazard_assessment',   label: 'Hazard assessment' },
  { key: 'isolation_pending',   label: 'Isolation pending' },
  { key: 'isolation_confirmed', label: 'Isolation confirmed' },
  { key: 'permit_issued',       label: 'Issued' },
  { key: 'work_in_progress',    label: 'Work in progress' },
  { key: 'suspended',           label: 'Suspended' },
  { key: 'permit_revoked',      label: 'Revoked' },
  { key: 'permit_closed',       label: 'Closed' },
  { key: 'live',                label: 'Live work' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'reportable',          label: 'Reportable' },
];

const TIERS = new Set<string>(['low', 'moderate', 'high', 'critical', 'catastrophic']);

const CLASS_LABEL: Record<WorkClass, string> = {
  electrical_live:     'Electrical (live)',
  electrical_isolated: 'Electrical (isolated)',
  working_at_height:   'Working at height',
  confined_space:      'Confined space',
  hot_work:            'Hot work',
  lifting:             'Lifting',
  excavation:          'Excavation',
  general:             'General',
};

function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

// ── action helpers ────────────────────────────────────────────────────────
function getActions(row: PermitRow): ChainAction[] {
  const cs = row.chain_status;
  const actions: ChainAction[] = [];

  if (cs === 'permit_requested') {
    actions.push({
      key: 'begin-assessment',
      label: 'Begin assessment (authority)',
      tone: 'primary',
      fields: [
        { key: 'assessment_ref',   label: 'Assessment reference', type: 'text',     required: false, placeholder: String(row.assessment_ref ?? '') },
        { key: 'assessment_basis', label: 'Hazard assessment basis', type: 'textarea', required: false, placeholder: String(row.assessment_basis ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'hazard_assessment') {
    actions.push({
      key: 'approve-isolation-plan',
      label: 'Approve isolation plan (authority)',
      tone: 'primary',
      fields: [
        { key: 'isolation_plan_ref', label: 'Isolation plan reference', type: 'text',   required: false, placeholder: String(row.isolation_plan_ref ?? '') },
        { key: 'energy_sources',     label: 'Energy sources (e.g. electrical / mechanical / stored)', type: 'text', required: false, placeholder: String(row.energy_sources ?? '') },
        { key: 'isolation_points',   label: 'Number of isolation points', type: 'number', required: false, placeholder: String(row.isolation_points ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'isolation_pending') {
    actions.push({
      key: 'verify-isolation',
      label: 'Verify isolation / test-for-dead (authority)',
      tone: 'primary',
      fields: [
        { key: 'isolation_cert_ref',        label: 'Isolation certificate reference', type: 'text', required: false, placeholder: String(row.isolation_cert_ref ?? '') },
        { key: 'isolating_authority_name',  label: 'Isolating authority (competent person)', type: 'text', required: false, placeholder: String(row.isolating_authority_name ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'isolation_confirmed') {
    actions.push({
      key: 'issue-permit',
      label: 'Issue permit (authority)',
      tone: 'primary',
      fields: [
        { key: 'permit_ref',            label: 'Permit reference',       type: 'text',   required: false, placeholder: String(row.permit_ref ?? '') },
        { key: 'permit_validity_hours', label: 'Permit validity (hours)', type: 'number', required: false, placeholder: String(row.permit_validity_hours ?? '') },
        { key: 'issue_basis',           label: 'Issue basis',            type: 'textarea', required: false, placeholder: String(row.issue_basis ?? '') },
      ],
      // issue_permit crosses regulator EVERY tier when live-electrical OR confined-space
      cascadeTo: (row.live_work_flag || row.work_class === 'confined_space') ? ['regulator'] : [],
    });
  }

  if (cs === 'permit_issued') {
    actions.push({
      key: 'start-work',
      label: 'Start work (holder)',
      tone: 'primary',
      fields: [
        { key: 'notes', label: 'Notes', type: 'textarea', required: false, placeholder: String(row.notes ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'work_in_progress') {
    actions.push({
      key: 'suspend-work',
      label: 'Suspend (handover / weather)',
      tone: 'warn',
      fields: [
        { key: 'suspension_basis', label: 'Suspension basis (e.g. shift handover)', type: 'textarea', required: false, placeholder: String(row.suspension_basis ?? '') },
        { key: 'reason_code',      label: 'Reason code',                            type: 'text',     required: false, placeholder: String(row.reason_code ?? '') },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'complete-work',
      label: 'Complete work (holder)',
      tone: 'primary',
      fields: [
        { key: 'completion_ref',   label: 'Completion reference', type: 'text',     required: false, placeholder: String(row.completion_ref ?? '') },
        { key: 'completion_basis', label: 'Completion basis',     type: 'textarea', required: false, placeholder: String(row.completion_basis ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'suspended') {
    actions.push({
      key: 'resume-work',
      label: 'Resume work (holder)',
      tone: 'primary',
      fields: [
        { key: 'notes', label: 'Notes', type: 'textarea', required: false, placeholder: String(row.notes ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'work_complete') {
    actions.push({
      key: 'close-permit',
      label: 'Close permit (re-energise / hand back)',
      tone: 'primary',
      fields: [
        { key: 'closure_ref',   label: 'Closure reference', type: 'text',     required: false, placeholder: String(row.closure_ref ?? '') },
        { key: 'closure_basis', label: 'Closure basis',     type: 'textarea', required: false, placeholder: String(row.closure_basis ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'hazard_assessment' || cs === 'isolation_pending') {
    actions.push({
      key: 'reject-permit',
      label: 'Reject permit (authority)',
      tone: 'danger',
      fields: [
        { key: 'rejection_basis', label: 'Rejection basis (hazard unacceptable)', type: 'textarea', required: false, placeholder: String(row.rejection_basis ?? '') },
        { key: 'reason_code',     label: 'Reason code',                           type: 'text',     required: false, placeholder: String(row.reason_code ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (
    cs === 'isolation_confirmed' ||
    cs === 'permit_issued' ||
    cs === 'work_in_progress' ||
    cs === 'suspended'
  ) {
    actions.push({
      key: 'revoke-permit',
      label: 'REVOKE (emergency / isolation breach)',
      tone: 'danger',
      fields: [
        { key: 'revocation_basis', label: 'Revocation basis (emergency / unsafe condition)', type: 'textarea', required: false, placeholder: String(row.revocation_basis ?? '') },
        { key: 'regulator_ref',    label: 'Regulator reference',                             type: 'text',     required: false, placeholder: String(row.regulator_ref ?? '') },
        { key: 'reason_code',      label: 'Reason code',                                     type: 'text',     required: false, placeholder: String(row.reason_code ?? '') },
      ],
      // revoke ALWAYS crosses regulator
      cascadeTo: ['regulator'],
    });
  }

  if (
    cs === 'permit_requested' ||
    cs === 'hazard_assessment' ||
    cs === 'isolation_pending'
  ) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (holder)',
      tone: 'ghost',
      fields: [
        { key: 'withdrawal_basis', label: 'Withdrawal basis (no longer required)', type: 'textarea', required: false, placeholder: String(row.withdrawal_basis ?? '') },
        { key: 'reason_code',      label: 'Reason code',                           type: 'text',     required: false, placeholder: String(row.reason_code ?? '') },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

function renderDetail(row: PermitRow): React.ReactNode {
  return (
    <div className="space-y-3 text-[11px]">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <DetailPair label="Permit holder"     value={row.holder_party_name} />
        <DetailPair label="Issuing authority" value={row.authority_party_name} />
        {row.isolating_authority_name && (
          <DetailPair label="Isolating authority" value={row.isolating_authority_name} />
        )}
        <DetailPair label="Work class" value={CLASS_LABEL[row.work_class]} />
        {row.equipment_tag   && <DetailPair label="Equipment tag"   value={row.equipment_tag} />}
        {row.work_location   && <DetailPair label="Work location"   value={row.work_location} />}
        <DetailPair label="Hazard score" value={`${row.hazard_score} / 100`} />
        {row.energy_sources  && <DetailPair label="Energy sources"  value={row.energy_sources} />}
        {row.isolation_points != null && <DetailPair label="Isolation points"   value={String(row.isolation_points)} />}
        {row.permit_validity_hours != null && <DetailPair label="Permit validity" value={`${row.permit_validity_hours} h`} />}
        {row.method_statement_ref && <DetailPair label="Method statement" value={row.method_statement_ref} />}
        {row.suspend_count > 0 && <DetailPair label="Suspensions" value={String(row.suspend_count)} />}
        {row.permit_ref         && <DetailPair label="Permit ref"       value={row.permit_ref} />}
        {row.isolation_cert_ref && <DetailPair label="Isolation cert"   value={row.isolation_cert_ref} />}
        {row.completion_ref     && <DetailPair label="Completion ref"   value={row.completion_ref} />}
        {row.regulator_ref      && <DetailPair label="Regulator ref"    value={row.regulator_ref} />}
        {row.reason_code        && <DetailPair label="Reason code"      value={row.reason_code} />}
        {row.escalation_level > 0 && <DetailPair label="Escalation level" value={String(row.escalation_level)} />}
        {row.sla_deadline_at && !row.is_terminal && (
          <DetailPair
            label="Next SLA"
            value={`${new Date(row.sla_deadline_at).toLocaleString()} (${fmtMin(row.minutes_until_sla)})${row.escalation_level > 0 ? ` · ${row.escalation_level} breach(es)` : ''}`}
          />
        )}
        {row.source_wave && (
          <DetailPair
            label="Provenance"
            value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}${row.source_event ? ` (${row.source_event})` : ''}`}
          />
        )}
      </div>

      {row.work_description && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Work description</div>
          <div style={{ color: TX2 }}>{row.work_description}</div>
        </div>
      )}
      {row.assessment_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Hazard assessment</div>
          <div style={{ color: TX2 }}>{row.assessment_basis}</div>
        </div>
      )}
      {row.isolation_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Isolation basis</div>
          <div style={{ color: TX2 }}>{row.isolation_basis}</div>
        </div>
      )}
      {row.issue_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Issue basis</div>
          <div style={{ color: TX2 }}>{row.issue_basis}</div>
        </div>
      )}
      {row.suspension_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Suspension basis</div>
          <div style={{ color: TX2 }}>{row.suspension_basis}</div>
        </div>
      )}
      {row.completion_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Completion basis</div>
          <div style={{ color: TX2 }}>{row.completion_basis}</div>
        </div>
      )}
      {row.closure_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Closure basis</div>
          <div style={{ color: TX2 }}>{row.closure_basis}</div>
        </div>
      )}
      {row.rejection_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Rejection basis</div>
          <div style={{ color: TX2 }}>{row.rejection_basis}</div>
        </div>
      )}
      {row.revocation_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Revocation basis</div>
          <div style={{ color: TX2 }}>{row.revocation_basis}</div>
        </div>
      )}
      {row.withdrawal_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Withdrawal basis</div>
          <div style={{ color: TX2 }}>{row.withdrawal_basis}</div>
        </div>
      )}
      {row.notes && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Notes</div>
          <div style={{ color: TX2 }}>{row.notes}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function PermitToWorkChainTab() {
  const [rows, setRows] = useState<PermitRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: PermitRow[] } }>('/permit-to-work/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load permits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/permit-to-work/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/permit-to-work/chain/${rowId}`);
          setExpandedEvents(prev => ({ ...prev, [rowId]: res.data?.data?.events ?? [] }));
        } catch { /* silent */ }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load, expandedEvents]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: PermitRow; events: ChainEvent[] } }>(`/permit-to-work/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'breached')   return !!r.sla_breached;
      if (filter === 'reportable') return !!r.is_reportable_flag;
      if (filter === 'live')       return !!r.live_work_flag;
      if (TIERS.has(filter))       return r.hazard_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const k = kpis ?? {
    total: 0, open_count: 0, closed_count: 0, issued_count: 0,
    in_progress_count: 0, suspended_count: 0, rejected_count: 0,
    revoked_count: 0, withdrawn_count: 0, breached: 0,
    reportable_total: 0, live_work_total: 0, confined_total: 0,
    top_tier_open: 0, total_isolation_points: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Permit-to-Work / LOTO</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          OHSA safe-system-of-work gate for hazardous field interventions on PV / wind assets
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"         value={k.total} />
        <KpiTile label="Open"          value={k.open_count} />
        <KpiTile label="In progress"   value={k.in_progress_count} />
        <KpiTile label="SLA breached"  value={k.breached}         tone={k.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Top-tier open" value={k.top_tier_open}    tone={k.top_tier_open > 0 ? 'bad' : undefined} />
        <KpiTile label="Live work"     value={k.live_work_total}  tone={k.live_work_total > 0 ? 'warn' : undefined} />
        <KpiTile label="Revoked"       value={k.revoked_count}    tone={k.revoked_count > 0 ? 'bad' : undefined} />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: filter === f.key ? ACC : BG2,
              color: filter === f.key ? '#fff' : TX2,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
          Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.permit_number}${row.asset_name ? ` · ${row.asset_name}` : ''}`}
              meta={
                <span style={{ color: TX3, fontSize: 11 }}>
                  {CLASS_LABEL[row.work_class]}
                  {row.live_work_flag && (
                    <span className="ml-1.5 px-1 py-0.5 rounded text-[9px] font-bold"
                      style={{ background: 'oklch(0.97 0.04 20)', color: BAD }}>
                      LIVE
                    </span>
                  )}
                  {row.is_reportable_flag && (
                    <span className="ml-1.5 px-1 py-0.5 rounded text-[9px] font-medium"
                      style={{ background: 'oklch(0.96 0.04 20)', color: WARN }}>
                      Reportable
                    </span>
                  )}
                  {' · '}
                  {row.holder_party_name}
                  {row.work_description ? ` · ${row.work_description}` : ''}
                  {` · ${fmtMin(row.minutes_until_sla)} SLA`}
                </span>
              }
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No permits match the current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
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
      <div className="text-[11px] mt-0.5" style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

export default PermitToWorkChainTab;
