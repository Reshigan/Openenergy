// Wave 69 — Security / Collateral Perfection & Registration lifecycle tab.
//
// A best-in-class project-finance lender takes, PERFECTS and maintains a SECURITY
// PACKAGE that makes the debt enforceable and correctly ranked. In SA law a
// security interest only bites once legally PERFECTED at the right registry —
// Deeds Office (Deeds Registries Act 47/1937 mortgage / notarial bonds; Security
// by Means of Movable Property Act 57/1993), Companies Act 71/2008 s126 + STRATE /
// CSDP (Financial Markets Act 19/2012) for share / dematerialised pledges, cession
// in securitatem debiti by notice, and SARB Exchange Control for non-resident
// beneficiaries. Distinct from the rest of the lender book — W21 releases the
// FUNDS, W30 reconciles USE of proceeds, W38 tests COVENANTS, W45 ENFORCES on
// default, W53 APPROVES the credit, W61 SELLS DOWN the loan; W69 governs whether
// the SECURITY itself is good — taken, registered, ranked and enforceable.
//
//   identified → documentation_pending → executed → lodged_for_registration
//     → registered → perfection_review → perfected → released
//   defect:   {lodged_for_registration, perfection_review} → defective → (re-lodge)
//   overdue:  {documentation_pending, executed, lodged_for_registration, defective}
//               → perfection_overdue → lodged_for_registration | lapsed
//   withdraw: {identified, documentation_pending, executed} → withdrawn
//
// URGENT SLA — the LARGER / more critical the security, the TIGHTER every window.
// Tier (5) by secured value in ZAR with a condition-precedent floor at major. Two-
// party write: the security agent (lender) drives every step; the grantor
// (borrower) executes the security document. The W69 signature — a security item
// that LAPSES crosses to the regulator for EVERY tier; a high-tier item going
// overdue and a high-tier SLA breach cross for major/critical; the registry
// rejecting a critical CP deed crosses for the critical tier only.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'identified' | 'documentation_pending' | 'executed' | 'lodged_for_registration'
  | 'registered' | 'perfection_review' | 'perfected' | 'defective'
  | 'perfection_overdue' | 'released' | 'lapsed' | 'withdrawn';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

interface PerfectionRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  facility_id: string | null;
  facility_name: string | null;
  borrower_id: string;
  borrower_name: string;
  project_id: string | null;
  project_name: string | null;
  security_type: string;
  security_description: string | null;
  registry: string | null;
  secured_value_zar: number | null;
  ranking: string | null;
  perfection_critical: number;
  cross_border: number;
  severity_tier: Tier;
  security_agent_id: string | null;
  security_agent_name: string | null;
  grantor_id: string | null;
  grantor_name: string | null;
  document_ref: string | null;
  lodgement_ref: string | null;
  registration_ref: string | null;
  perfection_ref: string | null;
  legal_opinion_ref: string | null;
  release_ref: string | null;
  documentation_basis: string | null;
  execution_basis: string | null;
  lodgement_basis: string | null;
  registration_basis: string | null;
  defect_basis: string | null;
  perfection_basis: string | null;
  overdue_basis: string | null;
  release_basis: string | null;
  lapse_basis: string | null;
  reason_code: string | null;
  resolution_summary: string | null;
  chain_status: ChainStatus;
  identified_at: string;
  documentation_pending_at: string | null;
  executed_at: string | null;
  lodged_for_registration_at: string | null;
  registered_at: string | null;
  perfection_review_at: string | null;
  perfected_at: string | null;
  defective_at: string | null;
  perfection_overdue_at: string | null;
  released_at: string | null;
  lapsed_at: string | null;
  withdrawn_at: string | null;
  perfection_deadline_at: string | null;
  relodge_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: boolean;
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

interface PerfectionEvent {
  id: string;
  perfection_id: string;
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
  perfected_count: number;
  defective_count: number;
  overdue_count: number;
  released_count: number;
  lapsed_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  cp_open: number;
  high_open: number;
  total_secured_zar: number;
  perfected_secured_zar: number;
  lapsed_secured_zar: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  identified:              { bg: '#e3e7ec', fg: '#557',    label: 'Identified' },
  documentation_pending:   { bg: '#fff4d6', fg: '#a06200', label: 'Documentation pending' },
  executed:                { bg: '#dbecfb', fg: '#1a3a5c', label: 'Executed' },
  lodged_for_registration: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Lodged for registration' },
  registered:              { bg: '#dbecfb', fg: '#1a3a5c', label: 'Registered' },
  perfection_review:       { bg: '#fff4d6', fg: '#a06200', label: 'Perfection review' },
  perfected:               { bg: '#d4edda', fg: '#155724', label: 'Perfected' },
  defective:               { bg: '#f8d0d0', fg: '#6b1f1f', label: 'Defective' },
  perfection_overdue:      { bg: '#f3c0c0', fg: '#5a1818', label: 'Perfection overdue' },
  released:                { bg: '#d4edda', fg: '#155724', label: 'Released' },
  lapsed:                  { bg: '#f3c0c0', fg: '#5a1818', label: 'Lapsed' },
  withdrawn:               { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor (<R10m)' },
  moderate: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate (<R100m)' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material (<R500m)' },
  major:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Major (<R2bn)' },
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical (≥R2bn)' },
};

const SECURITY_TYPE_LABEL: Record<string, string> = {
  mortgage_bond:         'Mortgage bond',
  special_notarial_bond: 'Special notarial bond',
  general_notarial_bond: 'General notarial bond',
  share_pledge:          'Share pledge',
  cession_rights:        'Cession of rights',
  cession_insurance:     'Cession of insurance',
  cession_accounts:      'Cession of accounts',
  strate_pledge:         'STRATE pledge',
  guarantee:             'Guarantee',
  other:                 'Other',
};

const REGISTRY_LABEL: Record<string, string> = {
  deeds_office:       'Deeds Office',
  cipc:               'CIPC',
  strate:             'STRATE',
  companies_register: 'Companies register',
  contractual:        'Contractual (notice)',
  sarb:               'SARB ExCon',
  other:              'Other',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                    label: 'Open' },
  { key: 'all',                     label: 'All' },
  { key: 'minor',                   label: 'Minor' },
  { key: 'moderate',                label: 'Moderate' },
  { key: 'material',                label: 'Material' },
  { key: 'major',                   label: 'Major' },
  { key: 'critical',                label: 'Critical' },
  { key: 'identified',              label: 'Identified' },
  { key: 'documentation_pending',   label: 'Documentation' },
  { key: 'executed',                label: 'Executed' },
  { key: 'lodged_for_registration', label: 'Lodged' },
  { key: 'registered',              label: 'Registered' },
  { key: 'perfection_review',       label: 'Review' },
  { key: 'perfected',               label: 'Perfected' },
  { key: 'defective',               label: 'Defective' },
  { key: 'perfection_overdue',      label: 'Overdue' },
  { key: 'breached',                label: 'SLA breached' },
  { key: 'reportable',              label: 'Reportable' },
  { key: 'released',                label: 'Released' },
  { key: 'lapsed',                  label: 'Lapsed' },
  { key: 'withdrawn',               label: 'Withdrawn' },
];

type ActionKind =
  | 'begin-documentation' | 'execute-security' | 'lodge-registration' | 'confirm-registration'
  | 'reject-registration' | 'begin-perfection-review' | 'confirm-perfection' | 'flag-overdue'
  | 'cure-overdue' | 'release-security' | 'mark-lapsed' | 'withdraw';

// Allowed actions per state, primary forward action first. Mirrors the spec
// TRANSITIONS map so the UI never offers an invalid step.
const ALLOWED_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  identified:              ['begin-documentation', 'withdraw'],
  documentation_pending:   ['execute-security', 'flag-overdue', 'withdraw'],
  executed:                ['lodge-registration', 'flag-overdue', 'withdraw'],
  lodged_for_registration: ['confirm-registration', 'reject-registration', 'flag-overdue'],
  registered:              ['begin-perfection-review'],
  perfection_review:       ['confirm-perfection', 'reject-registration'],
  perfected:               ['release-security'],
  defective:               ['lodge-registration', 'flag-overdue', 'mark-lapsed'],
  perfection_overdue:      ['cure-overdue', 'mark-lapsed'],
  released:                [],
  lapsed:                  [],
  withdrawn:               [],
};

// Party annotation per action. The security agent (lender) drives every step;
// the grantor (borrower) executes the security document.
const ACTION_LABEL: Record<ActionKind, string> = {
  'begin-documentation':     'Begin documentation (security agent)',
  'execute-security':        'Execute security document (grantor)',
  'lodge-registration':      'Lodge for registration (security agent)',
  'confirm-registration':    'Confirm registration (security agent)',
  'reject-registration':     'Reject — registry/opinion defect (security agent)',
  'begin-perfection-review': 'Begin perfection review (security agent)',
  'confirm-perfection':      'Confirm perfection (security agent)',
  'flag-overdue':            'Flag overdue (security agent)',
  'cure-overdue':            'Cure overdue — re-lodge (security agent)',
  'release-security':        'Release security (security agent)',
  'mark-lapsed':             'Mark lapsed (security agent)',
  'withdraw':                'Withdraw item (security agent)',
};

const ACTION_TONE: Record<ActionKind, 'primary' | 'danger' | 'warn' | 'good' | 'muted'> = {
  'begin-documentation':     'primary',
  'execute-security':        'good',
  'lodge-registration':      'primary',
  'confirm-registration':    'good',
  'reject-registration':     'danger',
  'begin-perfection-review': 'primary',
  'confirm-perfection':      'good',
  'flag-overdue':            'warn',
  'cure-overdue':            'warn',
  'release-security':        'good',
  'mark-lapsed':             'danger',
  'withdraw':                'muted',
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

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

const TERMINAL_STATES: ChainStatus[] = ['released', 'lapsed', 'withdrawn'];

export function SecurityPerfectionChainTab() {
  const [rows, setRows] = useState<PerfectionRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<PerfectionRow | null>(null);
  const [events, setEvents] = useState<PerfectionEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: PerfectionRow[] } & KpiSummary }>('/security-perfection/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, perfected_count: d.perfected_count,
          defective_count: d.defective_count, overdue_count: d.overdue_count,
          released_count: d.released_count, lapsed_count: d.lapsed_count,
          withdrawn_count: d.withdrawn_count, breached: d.breached,
          reportable_total: d.reportable_total, cp_open: d.cp_open, high_open: d.high_open,
          total_secured_zar: d.total_secured_zar, perfected_secured_zar: d.perfected_secured_zar,
          lapsed_secured_zar: d.lapsed_secured_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load security-perfection cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: PerfectionRow; events: PerfectionEvent[] } }>(
        `/security-perfection/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load perfection history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'open')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'minor' || filter === 'moderate' || filter === 'material' || filter === 'major' || filter === 'critical') {
        return r.severity_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: PerfectionRow) => {
    try {
      let body: Record<string, string | number | boolean> = {};
      if (action === 'begin-documentation') {
        const basis = window.prompt('Documentation basis — the security document being drawn (e.g. mortgage bond over Erf 123):');
        if (!basis) return;
        const ref = window.prompt('Document reference (e.g. DOC-2026-0011):') || '';
        const val = window.prompt('Secured value (ZAR):', String(row.secured_value_zar ?? ''));
        const cp = window.confirm('Condition precedent to first drawdown? OK = yes, Cancel = no');
        body = { documentation_basis: basis, perfection_critical: cp };
        if (ref) body.document_ref = ref;
        if (val && !Number.isNaN(Number(val))) body.secured_value_zar = Number(val);
      } else if (action === 'execute-security') {
        const basis = window.prompt('Execution basis — the grantor signing / notarial execution of the document:');
        if (!basis) return;
        const ref = window.prompt('Document reference (signed):', row.document_ref ?? '') || '';
        body = { execution_basis: basis };
        if (ref) body.document_ref = ref;
      } else if (action === 'lodge-registration') {
        const basis = window.prompt('Lodgement basis — lodging the deed at the registry (Deeds Office / STRATE / CIPC):');
        if (!basis) return;
        const ref = window.prompt('Lodgement reference (e.g. LODGE-2026-0011):') || '';
        body = { lodgement_basis: basis };
        if (ref) body.lodgement_ref = ref;
      } else if (action === 'confirm-registration') {
        const basis = window.prompt('Registration basis — the registrar registered / recorded the security:');
        if (!basis) return;
        const ref = window.prompt('Registration reference (e.g. BOND-2026-0011 / STRATE ref):') || '';
        body = { registration_basis: basis };
        if (ref) body.registration_ref = ref;
      } else if (action === 'reject-registration') {
        const basis = window.prompt('Defect basis — why the registry rejected the deed or the opinion found a defect:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. wrong_property / ranking_clash / signature_defect):') || '';
        body = { defect_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'begin-perfection-review') {
        const basis = window.prompt('Perfection-review basis — instructing the legal opinion on perfection / ranking:');
        if (!basis) return;
        const ref = window.prompt('Legal opinion reference (e.g. OPIN-2026-0011):') || '';
        body = { perfection_basis: basis };
        if (ref) body.legal_opinion_ref = ref;
      } else if (action === 'confirm-perfection') {
        const basis = window.prompt('Perfection basis — the clean legal opinion confirming the security is perfected and correctly ranked:');
        if (!basis) return;
        const pref = window.prompt('Perfection reference (e.g. PERF-2026-0011):') || '';
        const oref = window.prompt('Legal opinion reference:', row.legal_opinion_ref ?? '') || '';
        const summary = window.prompt('Resolution summary (one line for the audit record):') || '';
        body = { perfection_basis: basis };
        if (pref) body.perfection_ref = pref;
        if (oref) body.legal_opinion_ref = oref;
        if (summary) body.resolution_summary = summary;
      } else if (action === 'flag-overdue') {
        const basis = window.prompt('Overdue basis — the CP/CS perfection deadline that has been missed:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. deadline_missed / registry_backlog / grantor_delay):') || '';
        body = { overdue_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'cure-overdue') {
        const basis = window.prompt('Cure basis — re-lodging to cure the overdue / defective item:');
        if (!basis) return;
        const ref = window.prompt('Lodgement reference (re-lodge):') || '';
        const summary = window.prompt('Resolution summary (one line for the audit record):') || '';
        body = { lodgement_basis: basis };
        if (ref) body.lodgement_ref = ref;
        if (summary) body.resolution_summary = summary;
      } else if (action === 'release-security') {
        const basis = window.prompt('Release basis — discharge on repayment / substitution / refinancing:');
        if (!basis) return;
        const ref = window.prompt('Release reference (e.g. REL-2026-0011 / cancellation):') || '';
        const summary = window.prompt('Resolution summary (one line for the audit record):') || '';
        body = { release_basis: basis };
        if (ref) body.release_ref = ref;
        if (summary) body.resolution_summary = summary;
      } else if (action === 'mark-lapsed') {
        const basis = window.prompt('Lapse basis — why the security was never perfected (deadline blown / unrecoverable defect):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. deadline_lapsed / registry_refused / abandoned):') || '';
        const summary = window.prompt('Resolution summary (one line for the audit record):') || '';
        body = { lapse_basis: basis };
        if (reason) body.reason_code = reason;
        if (summary) body.resolution_summary = summary;
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason — item dropped from the security package / superseded:');
        if (!reason) return;
        const summary = window.prompt('Resolution summary (one line for the audit record):') || '';
        body = { reason_code: reason };
        if (summary) body.resolution_summary = summary;
      }
      await api.post(`/security-perfection/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Security perfection & registration</h2>
          <p className="text-xs text-[#4a5568]">
            12-state collateral-perfection chain (Deeds Registries Act 47/1937 · Security by Means of Movable
            Property Act 57/1993 · Companies Act 71/2008 s126 · Financial Markets Act 19/2012 / STRATE · SARB
            Exchange Control) · identified → documented → executed → lodged → registered → reviewed → perfected
            → released. A registry rejection or a perfection-opinion defect sends the item defective and back for
            re-lodgement; a missed CP/CS deadline flags it overdue, then cured or lapsed. URGENT SLA: the larger
            / more critical the security, the tighter every window. Tier by secured value in ZAR with a
            condition-precedent floor at major. Two-party write — the security agent (lender) drives every step;
            the grantor (borrower) executes the security document. The W69 signature — a security item that
            LAPSES crosses to the regulator for every tier; a high-tier item going overdue and a high-tier SLA
            breach cross for major + critical; the registry rejecting a critical CP deed crosses for the critical
            tier only.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="CP open" value={kpis?.cp_open ?? 0} tone={(kpis?.cp_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="High open" value={kpis?.high_open ?? 0} tone={(kpis?.high_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Perfected" value={kpis?.perfected_count ?? 0} tone="ok" />
        <Kpi label="Defective" value={kpis?.defective_count ?? 0} tone={(kpis?.defective_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Overdue" value={kpis?.overdue_count ?? 0} tone={(kpis?.overdue_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Lapsed" value={kpis?.lapsed_count ?? 0} tone={(kpis?.lapsed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Secured value" value={fmtZar(kpis?.total_secured_zar ?? 0)} />
        <Kpi label="Perfected value" value={fmtZar(kpis?.perfected_secured_zar ?? 0)} tone="ok" />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Case #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Borrower</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Security type</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Secured</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.severity_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.case_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to the regulator">●</span>}
                      {r.perfection_critical ? <span className="ml-1 text-[#8a4a00]" title="Condition precedent to drawdown">★</span> : null}
                      {r.cross_border ? <span className="ml-1 text-[#1a3a5c]" title="Non-resident beneficiary (SARB ExCon)">⊗</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[180px] truncate" title={r.borrower_name}>
                      {r.borrower_name}
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{SECURITY_TYPE_LABEL[r.security_type] ?? r.security_type}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">
                      {fmtZar(r.secured_value_zar)}
                    </td>
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No security items match.</td></tr>
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

const BTN_CLASS: Record<'primary' | 'danger' | 'warn' | 'good' | 'muted', string> = {
  primary: 'rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#c2873a]',
  danger:  'rounded border border-red-400 bg-white px-3 py-1.5 text-[12px] font-medium text-red-800 hover:bg-red-50',
  warn:    'rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50',
  good:    'rounded border border-green-300 bg-white px-3 py-1.5 text-[12px] font-medium text-green-800 hover:bg-green-50',
  muted:   'rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]',
};

function Drawer({
  row, events, onClose, onAct,
}: {
  row: PerfectionRow;
  events: PerfectionEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: PerfectionRow) => void;
}) {
  const actions = ALLOWED_ACTIONS[row.chain_status] || [];

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.case_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">
                {row.borrower_name}
                {row.perfection_critical ? <span className="ml-2 text-[#8a4a00]" title="Condition precedent to drawdown">★ CP</span> : null}
                {row.cross_border ? <span className="ml-2 text-[#1a3a5c]" title="Non-resident beneficiary (SARB ExCon)">⊗ Cross-border</span> : null}
              </div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.severity_tier].label}
                {` · ${SECURITY_TYPE_LABEL[row.security_type] ?? row.security_type}`}
                {row.registry ? ` · ${REGISTRY_LABEL[row.registry] ?? row.registry}` : ''}
                {row.ranking ? ` · ${row.ranking}` : ''}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                {row.security_agent_name || 'Security agent'} → {row.grantor_name || row.borrower_name}
                {row.relodge_round > 0 ? ` · re-lodge round ${row.relodge_round}` : ''}
                {row.escalation_level > 0 ? ` · escalation lvl ${row.escalation_level}` : ''}
              </div>
              {row.facility_name && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Facility {row.facility_name}{row.project_name ? ` · ${row.project_name}` : ''}
                </div>
              )}
              {row.source_wave && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"                value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"                 value={TIER_TONE[row.severity_tier].label} />
            <Pair label="Security type"         value={SECURITY_TYPE_LABEL[row.security_type] ?? row.security_type} />
            <Pair label="Registry"              value={row.registry ? (REGISTRY_LABEL[row.registry] ?? row.registry) : '—'} />
            <Pair label="Ranking"               value={row.ranking ?? '—'} />
            <Pair label="Secured value"         value={fmtZar(row.secured_value_zar)} />
            <Pair label="Condition precedent"   value={row.perfection_critical ? 'Yes' : 'No'} />
            <Pair label="Cross-border"          value={row.cross_border ? 'Yes (SARB ExCon)' : 'No'} />
            <Pair label="Description"           value={row.security_description ?? '—'} />
            <Pair label="Document ref"          value={row.document_ref ?? '—'} />
            <Pair label="Lodgement ref"         value={row.lodgement_ref ?? '—'} />
            <Pair label="Registration ref"      value={row.registration_ref ?? '—'} />
            <Pair label="Perfection ref"        value={row.perfection_ref ?? '—'} />
            <Pair label="Legal opinion ref"     value={row.legal_opinion_ref ?? '—'} />
            <Pair label="Release ref"           value={row.release_ref ?? '—'} />
            <Pair label="Reason code"           value={row.reason_code ?? '—'} />
            <Pair label="Re-lodge round"        value={String(row.relodge_round)} />
            <Pair label="Identified"            value={fmtDate(row.identified_at)} />
            <Pair label="Documentation"         value={fmtDate(row.documentation_pending_at)} />
            <Pair label="Executed"              value={fmtDate(row.executed_at)} />
            <Pair label="Lodged"                value={fmtDate(row.lodged_for_registration_at)} />
            <Pair label="Registered"            value={fmtDate(row.registered_at)} />
            <Pair label="Perfection review"     value={fmtDate(row.perfection_review_at)} />
            <Pair label="Perfected"             value={fmtDate(row.perfected_at)} />
            <Pair label="Defective"             value={fmtDate(row.defective_at)} />
            <Pair label="Overdue"               value={fmtDate(row.perfection_overdue_at)} />
            <Pair label="Released"              value={fmtDate(row.released_at)} />
            <Pair label="Lapsed"                value={fmtDate(row.lapsed_at)} />
            <Pair label="Perfection deadline"   value={fmtDate(row.perfection_deadline_at)} />
            <Pair label="SLA deadline"          value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"            value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"        value={String(row.escalation_level)} />
            <Pair label="Reportable"            value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.resolution_summary && (
            <BasisBlock label="Resolution summary" tone="#1a3a5c" text={row.resolution_summary} />
          )}
          {row.documentation_basis && (
            <BasisBlock label="Documentation basis" tone="#a06200" text={row.documentation_basis} />
          )}
          {row.execution_basis && (
            <BasisBlock label="Execution basis (grantor)" tone="#1a3a5c" text={row.execution_basis} />
          )}
          {row.lodgement_basis && (
            <BasisBlock label="Lodgement basis" tone="#8a4a00" text={row.lodgement_basis} />
          )}
          {row.registration_basis && (
            <BasisBlock label="Registration basis" tone="#155724" text={row.registration_basis} />
          )}
          {row.defect_basis && (
            <BasisBlock label="Defect basis" tone="#9b1f1f" text={row.defect_basis} />
          )}
          {row.perfection_basis && (
            <BasisBlock label="Perfection basis" tone="#155724" text={row.perfection_basis} />
          )}
          {row.overdue_basis && (
            <BasisBlock label="Overdue basis" tone="#5a1818" text={row.overdue_basis} />
          )}
          {row.release_basis && (
            <BasisBlock label="Release basis" tone="#155724" text={row.release_basis} />
          )}
          {row.lapse_basis && (
            <BasisBlock label="Lapse basis" tone="#5a1818" text={row.lapse_basis} />
          )}
        </section>

        {actions.length > 0 && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {actions.map((a, idx) => (
                <button type="button"
                  key={a}
                  onClick={() => onAct(a, row)}
                  className={idx === 0 ? BTN_CLASS.primary : BTN_CLASS[ACTION_TONE[a]]}
                >
                  {ACTION_LABEL[a]}
                </button>
              ))}
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
