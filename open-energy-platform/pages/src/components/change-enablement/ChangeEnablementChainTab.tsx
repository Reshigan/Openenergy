// Wave 47 — OEM-Support ITIL Change Enablement lifecycle tab.
//
// The RFC (Request for Change) lifecycle — the third member of the ITIL service
// management family on the support profile (after W14 incident + W41 problem).
// W41 hands off here: its raise_change action raises an RFC this chain governs.
// The unit of work is a proposed CHANGE: assess its risk, authorise it through
// the Change Advisory Board (CAB) or the emergency ECAB fast-path, schedule it,
// implement it in a change window, run a post-implementation review (PIR), and
// close it — OR back it out if it fails (a change-induced incident).
//
// Forward path: change_requested → assessment → cab_review → approved →
//   scheduled → implementing → implemented → pir → closed. Emergency fast-path:
//   assessment → approved (ECAB bypass). Rejection: cab_review → rejected.
//   Backout: implementing|implemented → rolled_back. Early cancel from any
//   pre-implementation state.
//
// URGENT SLA — the more urgent the change class, the tighter every window.
//
// Write model — SINGLE-PARTY {admin, support}. No access split; actor_party
// records the ITIL functional party (change_requester / change_authority /
// implementer) for audit attribution only. Reportability: roll_back crosses for
// emergency + normal; emergency_approve + close + sla_breached cross for
// emergency_change (ITIL 4 Change Enablement + ISO/IEC 20000-1 §8.5.1).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

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
  | 'change_requested' | 'assessment' | 'cab_review' | 'approved' | 'scheduled'
  | 'implementing' | 'implemented' | 'pir' | 'closed' | 'rejected'
  | 'rolled_back' | 'cancelled';

type Tier = 'emergency_change' | 'normal_change' | 'standard_change';

interface ChangeRow {
  [key: string]: unknown;
  id: string;
  change_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  owner_party_id: string;
  owner_party_name: string;
  service_name: string;
  affected_tenant: string | null;
  change_category: string | null;
  change_class: Tier;
  affected_ci_count: number;
  problem_ref: string | null;
  cab_ref: string | null;
  release_ref: string | null;
  rollback_ref: string | null;
  regulator_ref: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  change_summary: string | null;
  assessment_basis: string | null;
  cab_basis: string | null;
  approval_basis: string | null;
  schedule_basis: string | null;
  implementation_basis: string | null;
  verification_basis: string | null;
  rollback_basis: string | null;
  backout_plan: string | null;
  reason_code: string | null;
  closure_notes: string | null;
  chain_status: ChainStatus;
  change_requested_at: string;
  assessment_at: string | null;
  cab_review_at: string | null;
  approved_at: string | null;
  scheduled_at: string | null;
  implementing_at: string | null;
  implemented_at: string | null;
  pir_at: string | null;
  closed_at: string | null;
  rejected_at: string | null;
  rolled_back_at: string | null;
  cancelled_at: string | null;
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
  case_number?: string;
}

interface KpiSummary {
  total: number;
  open_count: number;
  closed_count: number;
  rejected_count: number;
  rolled_back_count: number;
  cancelled_count: number;
  awaiting_cab_count: number;
  in_implementation_count: number;
  breached: number;
  reportable_total: number;
  emergency_open: number;
  total_affected_ci: number;
}

const ALL_STATES = [
  'change_requested', 'assessment', 'cab_review', 'approved',
  'scheduled', 'implementing', 'implemented', 'pir', 'closed',
] as const;

const BRANCH_STATES = ['rejected', 'rolled_back', 'cancelled'] as const;

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',           label: 'Active' },
  { key: 'all',              label: 'All' },
  { key: 'emergency_change', label: 'Emergency' },
  { key: 'normal_change',    label: 'Normal' },
  { key: 'standard_change',  label: 'Standard' },
  { key: 'awaiting_cab',     label: 'Awaiting CAB' },
  { key: 'implementing',     label: 'Implementing' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'reportable',       label: 'Reportable' },
  { key: 'change_requested', label: 'Requested' },
  { key: 'assessment',       label: 'Assessment' },
  { key: 'approved',         label: 'Approved' },
  { key: 'scheduled',        label: 'Scheduled' },
  { key: 'closed',           label: 'Closed' },
  { key: 'rejected',         label: 'Rejected' },
  { key: 'rolled_back',      label: 'Rolled back' },
  { key: 'cancelled',        label: 'Cancelled' },
];

const TERMINAL_STATES: ChainStatus[] = ['closed', 'rejected', 'rolled_back', 'cancelled'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['change_requested', 'assessment', 'cab_review', 'approved', 'scheduled'];
const BACKOUT_STATES: ChainStatus[] = ['implementing', 'implemented'];

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function getActions(row: ChangeRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'change_requested') {
    actions.push({
      key: 'assess',
      label: 'Assess risk (requester)',
      tone: 'primary',
      fields: [
        { key: 'change_category', label: 'Change category (software / infrastructure / configuration / data / security)', type: 'text', required: false },
        { key: 'change_summary', label: 'Change summary — what is changing and why, in one line', type: 'text', required: false },
        { key: 'assessment_basis', label: 'Assessment basis — risk, impact, affected services', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'assessment') {
    actions.push({
      key: 'submit-to-cab',
      label: 'Submit to CAB (requester)',
      tone: 'primary',
      fields: [
        { key: 'cab_ref', label: 'CAB docket reference (e.g. CAB-2026-0042)', type: 'text', required: false },
        { key: 'cab_basis', label: 'CAB submission basis — what the board must weigh', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'emergency-approve',
      label: 'Emergency approve — ECAB (authority)',
      tone: 'warn',
      fields: [
        { key: 'approval_basis', label: 'ECAB authorisation basis — why this bypasses full CAB', type: 'textarea', required: true },
        { key: 'cab_ref', label: 'ECAB decision reference (e.g. ECAB-2026-0007)', type: 'text', required: false },
        { key: 'regulator_ref', label: 'Regulator notification reference (emergency change is reportable)', type: 'text', required: false },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'cab_review') {
    actions.push({
      key: 'approve',
      label: 'Approve (CAB / authority)',
      tone: 'primary',
      fields: [
        { key: 'approval_basis', label: 'Approval basis — CAB decision rationale', type: 'textarea', required: true },
        { key: 'cab_ref', label: 'CAB decision reference (e.g. CAB-2026-0042)', type: 'text', required: false },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'reject',
      label: 'Reject (CAB / authority)',
      tone: 'danger',
      fields: [
        { key: 'cab_basis', label: 'Rejection basis — why CAB declined authorisation', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'approved') {
    actions.push({
      key: 'schedule',
      label: 'Schedule change window (implementer)',
      tone: 'primary',
      fields: [
        { key: 'scheduled_start_at', label: 'Scheduled start (ISO, e.g. 2026-06-01T22:00:00Z)', type: 'text', required: false },
        { key: 'scheduled_end_at', label: 'Scheduled end (ISO)', type: 'text', required: false },
        { key: 'backout_plan', label: 'Backout plan — how to reverse if it fails', type: 'textarea', required: false },
        { key: 'schedule_basis', label: 'Schedule basis — change window rationale', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'scheduled') {
    actions.push({
      key: 'begin-implementation',
      label: 'Begin implementation (implementer)',
      tone: 'primary',
      fields: [
        { key: 'release_ref', label: 'Release / deployment package id (e.g. REL-2026-0118)', type: 'text', required: false },
        { key: 'implementation_basis', label: 'Implementation basis — steps being executed', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'implementing') {
    actions.push({
      key: 'complete-implementation',
      label: 'Complete implementation (implementer)',
      tone: 'primary',
      fields: [
        { key: 'implementation_basis', label: 'Implementation outcome — what shipped, verification at the gate', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'implemented') {
    actions.push({
      key: 'initiate-pir',
      label: 'Initiate PIR (authority)',
      tone: 'primary',
      fields: [
        { key: 'verification_basis', label: 'PIR basis — post-implementation review scope', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'pir') {
    actions.push({
      key: 'close',
      label: 'Close change (authority)',
      tone: 'primary',
      fields: [
        { key: 'closure_notes', label: 'Closure notes — PIR outcome, success confirmation', type: 'textarea', required: true },
        { key: 'regulator_ref', label: 'Regulator reference, if an emergency change (post-change report)', type: 'text', required: false },
        { key: 'verification_basis', label: 'Verification basis — evidence the change succeeded', type: 'textarea', required: false },
      ],
      cascadeTo: row.change_class === 'emergency_change' ? ['regulator'] : [],
    });
  }

  if (BACKOUT_STATES.includes(s)) {
    actions.push({
      key: 'roll-back',
      label: 'Back out change (implementer)',
      tone: 'danger',
      fields: [
        { key: 'rollback_basis', label: 'Backout basis — why the change is being reversed', type: 'textarea', required: true },
        { key: 'rollback_ref', label: 'Backout record reference (e.g. BACKOUT-2026-0006)', type: 'text', required: false },
        { key: 'regulator_ref', label: 'Regulator reference (change-induced failure is reportable)', type: 'text', required: false },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (WITHDRAWABLE_STATES.includes(s)) {
    actions.push({
      key: 'cancel',
      label: 'Cancel (requester)',
      tone: 'ghost',
      fields: [
        { key: 'closure_notes', label: 'Cancellation reason (e.g. superseded, no-longer-required, duplicate)', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

function renderDetail(row: ChangeRow): React.ReactNode {
  return (
    <div>
      <div
        className="grid gap-x-6 gap-y-2"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
      >
        <DetailPair label="Class"           value={row.change_class.replace(/_/g, ' ')} />
        <DetailPair label="Category"        value={row.change_category ?? '—'} />
        <DetailPair label="Affected CIs"    value={String(row.affected_ci_count ?? 0)} />
        <DetailPair label="Owner"           value={row.owner_party_name} />
        {row.affected_tenant && <DetailPair label="Tenant" value={row.affected_tenant} />}
        <DetailPair label="Problem ref"     value={row.problem_ref ?? '—'} />
        <DetailPair label="CAB ref"         value={row.cab_ref ?? '—'} />
        <DetailPair label="Release ref"     value={row.release_ref ?? '—'} />
        <DetailPair label="Rollback ref"    value={row.rollback_ref ?? '—'} />
        <DetailPair label="Regulator ref"   value={row.regulator_ref ?? '—'} />
        <DetailPair label="Reason code"     value={row.reason_code ?? '—'} />
        <DetailPair label="Window start"    value={fmtDate(row.scheduled_start_at)} />
        <DetailPair label="Window end"      value={fmtDate(row.scheduled_end_at)} />
        <DetailPair label="Requested"       value={fmtDate(row.change_requested_at)} />
        <DetailPair label="Assessment"      value={fmtDate(row.assessment_at)} />
        <DetailPair label="CAB review"      value={fmtDate(row.cab_review_at)} />
        <DetailPair label="Approved"        value={fmtDate(row.approved_at)} />
        <DetailPair label="Scheduled"       value={fmtDate(row.scheduled_at)} />
        <DetailPair label="Implementing"    value={fmtDate(row.implementing_at)} />
        <DetailPair label="Implemented"     value={fmtDate(row.implemented_at)} />
        <DetailPair label="PIR"             value={fmtDate(row.pir_at)} />
        <DetailPair label="Closed"          value={fmtDate(row.closed_at)} />
        <DetailPair label="Escalation lvl"  value={String(row.escalation_level)} />
        <DetailPair label="Reportable"      value={row.is_reportable ? 'Yes' : 'No'} />
        {row.source_wave && <DetailPair label="Source wave" value={row.source_wave} />}
        {row.source_entity_id && <DetailPair label="Source entity" value={row.source_entity_id} />}
      </div>
      {row.change_summary && (
        <div className="mt-3">
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX2, marginBottom: 2 }}>Change summary</div>
          <div style={{ fontSize: 12, color: TX1, whiteSpace: 'pre-wrap' }}>{row.change_summary}</div>
        </div>
      )}
      {row.assessment_basis && (
        <div className="mt-3">
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX2, marginBottom: 2 }}>Assessment basis</div>
          <div style={{ fontSize: 12, color: TX1, whiteSpace: 'pre-wrap' }}>{row.assessment_basis}</div>
        </div>
      )}
      {row.cab_basis && (
        <div className="mt-3">
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: WARN, marginBottom: 2 }}>CAB basis</div>
          <div style={{ fontSize: 12, color: TX1, whiteSpace: 'pre-wrap' }}>{row.cab_basis}</div>
        </div>
      )}
      {row.approval_basis && (
        <div className="mt-3">
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: ACC, marginBottom: 2 }}>Approval basis</div>
          <div style={{ fontSize: 12, color: TX1, whiteSpace: 'pre-wrap' }}>{row.approval_basis}</div>
        </div>
      )}
      {row.backout_plan && (
        <div className="mt-3">
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: WARN, marginBottom: 2 }}>Backout plan</div>
          <div style={{ fontSize: 12, color: TX1, whiteSpace: 'pre-wrap' }}>{row.backout_plan}</div>
        </div>
      )}
      {row.schedule_basis && (
        <div className="mt-3">
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX2, marginBottom: 2 }}>Schedule basis</div>
          <div style={{ fontSize: 12, color: TX1, whiteSpace: 'pre-wrap' }}>{row.schedule_basis}</div>
        </div>
      )}
      {row.implementation_basis && (
        <div className="mt-3">
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: GOOD, marginBottom: 2 }}>Implementation basis</div>
          <div style={{ fontSize: 12, color: TX1, whiteSpace: 'pre-wrap' }}>{row.implementation_basis}</div>
        </div>
      )}
      {row.verification_basis && (
        <div className="mt-3">
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: GOOD, marginBottom: 2 }}>Verification / PIR basis</div>
          <div style={{ fontSize: 12, color: TX1, whiteSpace: 'pre-wrap' }}>{row.verification_basis}</div>
        </div>
      )}
      {row.rollback_basis && (
        <div className="mt-3">
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: BAD, marginBottom: 2 }}>Backout basis</div>
          <div style={{ fontSize: 12, color: TX1, whiteSpace: 'pre-wrap' }}>{row.rollback_basis}</div>
        </div>
      )}
      {row.closure_notes && (
        <div className="mt-3">
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: GOOD, marginBottom: 2 }}>Closure / decision notes</div>
          <div style={{ fontSize: 12, color: TX1, whiteSpace: 'pre-wrap' }}>{row.closure_notes}</div>
        </div>
      )}
    </div>
  );
}

export function ChangeEnablementChainTab() {
  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ChangeRow[] } & KpiSummary }>('/change-enablement/chain');
      const items = (res.data?.data?.items || []).map((r) => ({
        ...r,
        case_number: r.change_number,
      }));
      setRows(items);
      const d = res.data?.data;
      if (d) {
        setSummary({
          total: d.total, open_count: d.open_count, closed_count: d.closed_count,
          rejected_count: d.rejected_count, rolled_back_count: d.rolled_back_count,
          cancelled_count: d.cancelled_count, awaiting_cab_count: d.awaiting_cab_count,
          in_implementation_count: d.in_implementation_count, breached: d.breached,
          reportable_total: d.reportable_total, emergency_open: d.emergency_open,
          total_affected_ci: d.total_affected_ci,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load change requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      // Build body from values, injecting fixed fields per action
      const body: Record<string, string> = { ...values };
      if (key === 'reject') {
        body.reason_code = 'cab_declined';
        if (values.cab_basis) body.closure_notes = values.cab_basis;
      } else if (key === 'roll-back') {
        body.reason_code = 'change_induced_failure';
        if (values.rollback_basis) body.closure_notes = values.rollback_basis;
      } else if (key === 'cancel') {
        body.reason_code = 'cancelled';
      } else if (key === 'close') {
        body.reason_code = 'implemented_successfully';
      }
      await api.post(`/change-enablement/chain/${rowId}/${key}`, body);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: ChangeRow; events: ChainEvent[] } }>(
        `/change-enablement/chain/${id}`
      );
      setExpandedEvents((prev) => ({ ...prev, [id]: res.data?.data?.events || [] }));
    } catch {
      // silent — audit timeline stays empty
    }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')              return true;
      if (filter === 'active')           return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'emergency_change') return r.change_class === 'emergency_change';
      if (filter === 'normal_change')    return r.change_class === 'normal_change';
      if (filter === 'standard_change')  return r.change_class === 'standard_change';
      if (filter === 'awaiting_cab')     return r.chain_status === 'cab_review';
      if (filter === 'implementing')     return r.chain_status === 'implementing';
      if (filter === 'breached')         return !!r.sla_breached;
      if (filter === 'reportable')       return r.is_reportable;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  return (
    <div className="p-5" style={{ background: BG, minHeight: '100%' }}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: TX1 }}>Change enablement</h2>
          <p className="text-xs mt-0.5" style={{ color: TX3 }}>
            12-stage ITIL change-enablement chain · requested → assessment → CAB review → approved → scheduled →
            implementing → implemented → PIR → closed. Emergency fast-path via ECAB (assessment → approved);
            CAB can reject; failed changes back out from implementing or implemented; pre-implementation records
            can cancel. Receives W41 problem-management handoffs. URGENT SLA: more urgent class = tighter window.
            Reportable: roll-back (emergency + normal), emergency-approve + close + SLA breach (emergency).
            ITIL 4 Change Enablement + ISO/IEC 20000-1 §8.5.1.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <KpiTile label="Total"           value={summary?.total ?? rows.length} />
        <KpiTile label="Open"            value={summary?.open_count ?? 0} />
        <KpiTile label="Emergency open"  value={summary?.emergency_open ?? 0}          tone={(summary?.emergency_open ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Awaiting CAB"    value={summary?.awaiting_cab_count ?? 0}       tone={(summary?.awaiting_cab_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Implementing"    value={summary?.in_implementation_count ?? 0}  tone={(summary?.in_implementation_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="SLA breached"    value={summary?.breached ?? 0}                tone={(summary?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Closed"          value={summary?.closed_count ?? 0}             tone="ok" />
        <KpiTile label="Rejected"        value={summary?.rejected_count ?? 0}           tone={(summary?.rejected_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Rolled back"     value={summary?.rolled_back_count ?? 0}        tone={(summary?.rolled_back_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Cancelled"       value={summary?.cancelled_count ?? 0} />
        <KpiTile label="Reportable"      value={summary?.reportable_total ?? 0}         tone={(summary?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Affected CIs"    value={summary?.total_affected_ci ?? 0} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="rounded px-2 py-1 text-[11px] font-medium transition-colors"
            style={
              filter === f.key
                ? { background: ACC, color: '#fff', border: `1px solid ${ACC}` }
                : { background: BG1, color: TX2, border: `1px solid ${BORDER}` }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[12px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-sm" style={{ background: BG1, borderColor: BORDER, color: TX2 }}>
          Loading...
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-sm" style={{ background: BG1, borderColor: BORDER, color: TX2 }}>
              No change requests match.
            </div>
          )}
          {filtered.map((row) => (
            <ChainCard
              key={row.id}
              item={row}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={row.service_name}
              meta={
                <span>
                  <span style={{ fontFamily: MONO }}>{row.change_number}</span>
                  {' · '}
                  {row.change_class.replace(/_/g, ' ')}
                  {' · '}
                  {row.owner_party_name}
                  {row.change_category ? ` · ${row.change_category}` : ''}
                  {row.affected_ci_count ? ` · ${row.affected_ci_count} CI${row.affected_ci_count !== 1 ? 's' : ''}` : ''}
                  {row.is_reportable ? (
                    <span style={{ color: BAD, marginLeft: 4 }} title="Reportable to regulator">● reportable</span>
                  ) : null}
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
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div className="rounded border px-3 py-2" style={{ background: BG1, borderColor: BORDER }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 12, color: TX1 }}>{value}</div>
    </div>
  );
}

export default ChangeEnablementChainTab;
