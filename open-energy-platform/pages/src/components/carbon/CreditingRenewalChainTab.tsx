// Wave 56 — Carbon Crediting-Period Renewal & Baseline Reassessment lifecycle tab.
//
// The PERIODIC re-validation of a registered carbon project. W37 registers a
// project, W11 verifies each monitoring period (MRV), W17 retires the credits,
// W42 protects permanence and W48 monetises the offset. THIS chain governs what
// happens when the crediting period EXPIRES — the project must be RENEWED to keep
// issuing. Renewal re-derives the baseline against current data, re-tests
// additionality, has an independent VVB validate the renewed baseline, then the
// standard's review body decides. The renewed baseline is typically LOWER, which
// reduces future issuance and feeds every later MRV / retirement / tax-offset.
//
//   renewal_due → application_submitted → completeness_check →
//     baseline_reassessment → additionality_retest → vvb_validation →
//     standard_review → renewed.
//   revision loop: completeness_check → revision_requested → (resubmit) → completeness_check.
//   refused from standard_review; withdrawn from any pre-decision state;
//   lapsed from renewal_due (window expired — TIME-DRIVEN, auto in sweep).
//
// INVERTED SLA — the larger the project, the LONGER every window (deeper baseline
// scrutiny warranted). Single carbon-fund desk write; actor_party records the
// functional party (proponent / registry / vvb) for audit.
// Reportability — the W56 signature is "an APPROVAL can be reportable":
// renew crosses for EVERY tier when the reassessed baseline is cut by ≥30%;
// refuse + sla_breach cross for the large tiers (major + mega).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'renewal_due' | 'application_submitted' | 'completeness_check' | 'revision_requested'
  | 'baseline_reassessment' | 'additionality_retest' | 'vvb_validation' | 'standard_review'
  | 'renewed' | 'refused' | 'withdrawn' | 'lapsed';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'mega';

type Standard = 'verra_vcs' | 'gold_standard' | 'article_6_4' | 'cdm';

interface RenewalRow {
  id: string;
  renewal_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string;
  project_name: string;
  registry_standard: Standard;
  methodology_id: string | null;
  vvb_name: string | null;
  proponent_party_id: string;
  proponent_party_name: string;
  issuance_tier: Tier;
  annual_issuance_tco2e: number | null;
  crediting_period_number: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  renewed_period_start: string | null;
  renewed_period_end: string | null;
  original_baseline_tco2e: number | null;
  revised_baseline_tco2e: number | null;
  baseline_reduction_pct: number | null;
  additionality_outcome: string | null;
  application_ref: string | null;
  completeness_ref: string | null;
  vvb_report_ref: string | null;
  decision_ref: string | null;
  refusal_ref: string | null;
  submission_basis: string | null;
  completeness_basis: string | null;
  revision_basis: string | null;
  baseline_basis: string | null;
  additionality_basis: string | null;
  validation_basis: string | null;
  decision_basis: string | null;
  refusal_basis: string | null;
  reason_code: string | null;
  renewal_summary: string | null;
  chain_status: ChainStatus;
  renewal_due_at: string;
  application_submitted_at: string | null;
  completeness_check_at: string | null;
  revision_requested_at: string | null;
  baseline_reassessment_at: string | null;
  additionality_retest_at: string | null;
  vvb_validation_at: string | null;
  standard_review_at: string | null;
  renewed_at: string | null;
  refused_at: string | null;
  withdrawn_at: string | null;
  lapsed_at: string | null;
  revision_round: number;
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

interface RenewalEvent {
  id: string;
  renewal_id: string;
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
  renewed_count: number;
  refused_count: number;
  withdrawn_count: number;
  lapsed_count: number;
  in_review_count: number;
  reassessment_count: number;
  breached: number;
  reportable_total: number;
  large_open: number;
  material_downgrade_count: number;
  total_annual_issuance: number;
  total_original_baseline: number;
  total_revised_baseline: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  renewal_due:           { bg: '#e3e7ec', fg: '#557',    label: 'Renewal due' },
  application_submitted: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Application submitted' },
  completeness_check:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Completeness check' },
  revision_requested:    { bg: '#ffe9d6', fg: '#8a4a00', label: 'Revision requested' },
  baseline_reassessment: { bg: '#fff4d6', fg: '#a06200', label: 'Baseline reassessment' },
  additionality_retest:  { bg: '#fff4d6', fg: '#a06200', label: 'Additionality retest' },
  vvb_validation:        { bg: '#fff4d6', fg: '#a06200', label: 'VVB validation' },
  standard_review:       { bg: '#fff4d6', fg: '#a06200', label: 'Standard review' },
  renewed:               { bg: '#d4edda', fg: '#155724', label: 'Renewed' },
  refused:               { bg: '#fde0e0', fg: '#9b1f1f', label: 'Refused' },
  withdrawn:             { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
  lapsed:                { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Lapsed' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor (<10k/yr)' },
  moderate: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate (<100k/yr)' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material (<500k/yr)' },
  major:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Major (<2m/yr)' },
  mega:     { bg: '#fde0e0', fg: '#9b1f1f', label: 'Mega (≥2m/yr)' },
};

const STANDARD_LABEL: Record<Standard, string> = {
  verra_vcs:    'Verra VCS',
  gold_standard:'Gold Standard',
  article_6_4:  'Article 6.4',
  cdm:          'CDM',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'Active' },
  { key: 'all',                   label: 'All' },
  { key: 'minor',                 label: 'Minor' },
  { key: 'moderate',              label: 'Moderate' },
  { key: 'material',              label: 'Material' },
  { key: 'major',                 label: 'Major' },
  { key: 'mega',                  label: 'Mega' },
  { key: 'reassessment',          label: 'Reassessment' },
  { key: 'in_review',             label: 'In review' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'downgrade',             label: 'Baseline cut ≥30%' },
  { key: 'renewal_due',           label: 'Due' },
  { key: 'application_submitted', label: 'Submitted' },
  { key: 'completeness_check',    label: 'Completeness' },
  { key: 'revision_requested',    label: 'Revision' },
  { key: 'baseline_reassessment', label: 'Baseline' },
  { key: 'additionality_retest',  label: 'Additionality' },
  { key: 'vvb_validation',        label: 'VVB' },
  { key: 'standard_review',       label: 'Standard review' },
  { key: 'renewed',               label: 'Renewed' },
  { key: 'refused',               label: 'Refused' },
  { key: 'withdrawn',             label: 'Withdrawn' },
  { key: 'lapsed',                label: 'Lapsed' },
];

type ActionKind =
  | 'submit-application' | 'check-completeness' | 'request-revision' | 'resubmit'
  | 'begin-baseline' | 'complete-baseline' | 'complete-additionality' | 'validate'
  | 'renew' | 'refuse' | 'withdraw';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  renewal_due:           'submit-application',
  application_submitted: 'check-completeness',
  completeness_check:    'begin-baseline',
  revision_requested:    'resubmit',
  baseline_reassessment: 'complete-baseline',
  additionality_retest:  'complete-additionality',
  vvb_validation:        'validate',
  standard_review:       'renew',
  renewed:               null,
  refused:               null,
  withdrawn:             null,
  lapsed:                null,
};

// Party annotation per action — the functional party. The proponent submits /
// resubmits / withdraws; the independent VVB validates; the registry (standard
// review body) drives every completeness / baseline / additionality / decision step.
const ACTION_LABEL: Record<ActionKind, string> = {
  'submit-application':     'Submit application (proponent)',
  'check-completeness':     'Check completeness (registry)',
  'request-revision':       'Request revision (registry)',
  'resubmit':               'Resubmit (proponent)',
  'begin-baseline':         'Begin baseline reassessment (registry)',
  'complete-baseline':      'Complete baseline (registry)',
  'complete-additionality': 'Complete additionality retest (registry)',
  'validate':               'VVB validate (vvb)',
  'renew':                  'Renew crediting period (registry)',
  'refuse':                 'Refuse (registry)',
  'withdraw':               'Withdraw (proponent)',
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

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(1)}%`;
}

const TERMINAL_STATES: ChainStatus[] = ['renewed', 'refused', 'withdrawn', 'lapsed'];
const IN_REVIEW_STATES: ChainStatus[] = ['vvb_validation', 'standard_review'];
const REASSESSMENT_STATES: ChainStatus[] = ['baseline_reassessment', 'additionality_retest'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['renewal_due', 'application_submitted', 'completeness_check', 'revision_requested'];

export function CreditingRenewalChainTab() {
  const [rows, setRows] = useState<RenewalRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<RenewalRow | null>(null);
  const [events, setEvents] = useState<RenewalEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: RenewalRow[] } & KpiSummary }>('/crediting-renewal/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, renewed_count: d.renewed_count,
          refused_count: d.refused_count, withdrawn_count: d.withdrawn_count,
          lapsed_count: d.lapsed_count, in_review_count: d.in_review_count,
          reassessment_count: d.reassessment_count, breached: d.breached,
          reportable_total: d.reportable_total, large_open: d.large_open,
          material_downgrade_count: d.material_downgrade_count,
          total_annual_issuance: d.total_annual_issuance,
          total_original_baseline: d.total_original_baseline,
          total_revised_baseline: d.total_revised_baseline,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load crediting-renewal records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: RenewalRow; events: RenewalEvent[] } }>(
        `/crediting-renewal/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load renewal history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')          return true;
      if (filter === 'active')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'in_review')    return IN_REVIEW_STATES.includes(r.chain_status);
      if (filter === 'reassessment') return REASSESSMENT_STATES.includes(r.chain_status);
      if (filter === 'breached')     return r.sla_breached;
      if (filter === 'reportable')   return r.is_reportable;
      if (filter === 'downgrade')    return (r.baseline_reduction_pct || 0) >= 30;
      if (filter === 'minor' || filter === 'moderate' || filter === 'material' || filter === 'major' || filter === 'mega') {
        return r.issuance_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: RenewalRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'submit-application') {
        const basis = window.prompt('Submission basis — the renewal application lodged with the registry as the crediting period nears expiry:');
        if (!basis) return;
        const ref = window.prompt('Application reference (e.g. VCS-RENEW-2026-0007):') || '';
        const issuance = window.prompt('Declared annual issuance (tCO₂e/yr — re-derives the tier):', String(row.annual_issuance_tco2e || ''));
        const period = window.prompt('Crediting period number being renewed:', String(row.crediting_period_number || ''));
        const vvb = window.prompt('Appointed VVB (validation/verification body):', row.vvb_name || '') || '';
        body = { submission_basis: basis };
        if (ref) body.application_ref = ref;
        if (issuance && !Number.isNaN(Number(issuance))) body.annual_issuance_tco2e = Number(issuance);
        if (period && !Number.isNaN(Number(period))) body.crediting_period_number = Number(period);
        if (vvb) body.vvb_name = vvb;
      } else if (action === 'check-completeness') {
        const basis = window.prompt('Completeness basis — registry confirmation the application package is complete and admissible:');
        if (!basis) return;
        const ref = window.prompt('Completeness reference (e.g. VCS-COMPLETE-2026-0007):') || '';
        body = { completeness_basis: basis };
        if (ref) body.completeness_ref = ref;
      } else if (action === 'request-revision') {
        const basis = window.prompt('Revision basis — what the proponent must fix before the package can proceed:');
        if (!basis) return;
        body = { revision_basis: basis, reason_code: 'incomplete_package' };
      } else if (action === 'resubmit') {
        const basis = window.prompt('Resubmission basis — the corrected package the proponent re-lodges:');
        if (!basis) return;
        body = { submission_basis: basis };
      } else if (action === 'begin-baseline') {
        const basis = window.prompt('Baseline basis — scope of the baseline reassessment against current data and regulatory surplus:');
        if (!basis) return;
        body = { baseline_basis: basis };
      } else if (action === 'complete-baseline') {
        const basis = window.prompt('Baseline basis — the reassessed baseline result and methodology applied:');
        if (!basis) return;
        const orig = window.prompt('Original baseline (tCO₂e/yr):', String(row.original_baseline_tco2e || ''));
        const revised = window.prompt('Revised baseline (tCO₂e/yr — typically lower):', String(row.revised_baseline_tco2e || ''));
        body = { baseline_basis: basis };
        if (orig && !Number.isNaN(Number(orig))) body.original_baseline_tco2e = Number(orig);
        if (revised && !Number.isNaN(Number(revised))) body.revised_baseline_tco2e = Number(revised);
      } else if (action === 'complete-additionality') {
        const basis = window.prompt('Additionality basis — the re-test of whether the activity remains additional under current conditions:');
        if (!basis) return;
        const outcome = window.prompt('Additionality outcome (e.g. additional / not_additional / conditional):', 'additional') || '';
        body = { additionality_basis: basis };
        if (outcome) body.additionality_outcome = outcome;
      } else if (action === 'validate') {
        const basis = window.prompt('Validation basis — independent VVB opinion on the renewed baseline and additionality:');
        if (!basis) return;
        const ref = window.prompt('VVB report reference (e.g. VVB-VAL-2026-0007):') || '';
        const vvb = window.prompt('VVB name:', row.vvb_name || '') || '';
        body = { validation_basis: basis };
        if (ref) body.vvb_report_ref = ref;
        if (vvb) body.vvb_name = vvb;
      } else if (action === 'renew') {
        const basis = window.prompt('Decision basis — the standard review body decision to renew the crediting period:');
        if (!basis) return;
        const ref = window.prompt('Decision reference (e.g. VCS-DECISION-2026-0007):') || '';
        const start = window.prompt('Renewed period start (YYYY-MM-DD):') || '';
        const end = window.prompt('Renewed period end (YYYY-MM-DD):') || '';
        const revised = window.prompt('Confirmed revised baseline (tCO₂e/yr — sets baseline reduction; ≥30% cut is reportable):', String(row.revised_baseline_tco2e || ''));
        const summary = window.prompt('Renewal summary (one line for the audit record):') || '';
        body = { decision_basis: basis };
        if (ref) body.decision_ref = ref;
        if (start) body.renewed_period_start = start;
        if (end) body.renewed_period_end = end;
        if (revised && !Number.isNaN(Number(revised))) body.revised_baseline_tco2e = Number(revised);
        if (summary) body.renewal_summary = summary;
      } else if (action === 'refuse') {
        const basis = window.prompt('Refusal basis — why the renewal fails (no longer additional / baseline untenable / methodology lapsed):');
        if (!basis) return;
        const ref = window.prompt('Refusal reference (e.g. VCS-REFUSE-2026-0007):') || '';
        body = { refusal_basis: basis, reason_code: 'renewal_refused' };
        if (ref) body.refusal_ref = ref;
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason — why the proponent is pulling the renewal before decision:');
        if (!reason) return;
        body = { reason_code: reason };
      }
      await api.post(`/crediting-renewal/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Crediting-period renewal &amp; baseline reassessment</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage renewal chain · due → application submitted → completeness check → baseline reassessment →
            additionality retest → VVB validation → standard review → renewed. The registry can return a package for
            revision (resubmit to re-enter completeness); renewals are refused from review; pre-decision renewals can be
            withdrawn; a renewal_due window that expires without submission auto-lapses. The periodic re-validation that
            keeps a registered project issuing — the renewed baseline is typically LOWER, cutting future issuance and
            feeding every later MRV / retirement / tax-offset. INVERTED SLA: the larger the project, the longer every
            window (deeper baseline scrutiny). The W56 signature — an APPROVAL is itself reportable: a renewal whose
            reassessed baseline is cut by ≥30% crosses to the regulator inbox for every tier; refusal and SLA breach
            cross for the large tiers (Verra VCS / Gold Standard / Article 6.4 / CDM standard review).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Large open" value={kpis?.large_open ?? 0} tone={(kpis?.large_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reassessment" value={kpis?.reassessment_count ?? 0} tone={(kpis?.reassessment_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="In review" value={kpis?.in_review_count ?? 0} tone={(kpis?.in_review_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Renewed" value={kpis?.renewed_count ?? 0} tone="ok" />
        <Kpi label="Refused" value={kpis?.refused_count ?? 0} tone={(kpis?.refused_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Lapsed" value={kpis?.lapsed_count ?? 0} tone={(kpis?.lapsed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Baseline cut ≥30%" value={kpis?.material_downgrade_count ?? 0} tone={(kpis?.material_downgrade_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Annual issuance" value={fmtTco2e(kpis?.total_annual_issuance ?? 0)} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Renewal #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Standard</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Baseline cut</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.issuance_tier];
                const downgrade = (r.baseline_reduction_pct || 0) >= 30;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.renewal_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[220px] truncate" title={r.project_name}>
                      {r.project_name}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{STANDARD_LABEL[r.registry_standard]}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${downgrade ? 'text-[#9b1f1f] font-semibold' : 'text-[#1a3a5c]'}`}>
                      {fmtPct(r.baseline_reduction_pct)}
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No renewals match.</td></tr>
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
  row: RenewalRow;
  events: RenewalEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: RenewalRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canRequestRevision = row.chain_status === 'completeness_check';
  const canRefuse = row.chain_status === 'standard_review';
  const canWithdraw = WITHDRAWABLE_STATES.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.renewal_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.issuance_tier].label} · {STANDARD_LABEL[row.registry_standard]}
                {row.crediting_period_number ? ` · CP${row.crediting_period_number}` : ''} · {row.proponent_party_name}
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
            <Pair label="State"               value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"                value={TIER_TONE[row.issuance_tier].label} />
            <Pair label="Standard"            value={STANDARD_LABEL[row.registry_standard]} />
            <Pair label="Methodology"         value={row.methodology_id ?? '—'} />
            <Pair label="Proponent"           value={row.proponent_party_name} />
            <Pair label="VVB"                 value={row.vvb_name ?? '—'} />
            <Pair label="Annual issuance"     value={fmtTco2e(row.annual_issuance_tco2e)} />
            <Pair label="Crediting period"    value={row.crediting_period_number ? `CP${row.crediting_period_number}` : '—'} />
            <Pair label="Current period"      value={`${fmtDate(row.current_period_start)} → ${fmtDate(row.current_period_end)}`} />
            <Pair label="Renewed period"      value={`${fmtDate(row.renewed_period_start)} → ${fmtDate(row.renewed_period_end)}`} />
            <Pair label="Original baseline"   value={fmtTco2e(row.original_baseline_tco2e)} />
            <Pair label="Revised baseline"    value={fmtTco2e(row.revised_baseline_tco2e)} />
            <Pair label="Baseline cut"        value={fmtPct(row.baseline_reduction_pct)} />
            <Pair label="Additionality"       value={row.additionality_outcome ?? '—'} />
            <Pair label="Revision round"      value={String(row.revision_round)} />
            <Pair label="Application ref"     value={row.application_ref ?? '—'} />
            <Pair label="Completeness ref"    value={row.completeness_ref ?? '—'} />
            <Pair label="VVB report ref"      value={row.vvb_report_ref ?? '—'} />
            <Pair label="Decision ref"        value={row.decision_ref ?? '—'} />
            <Pair label="Refusal ref"         value={row.refusal_ref ?? '—'} />
            <Pair label="Reason code"         value={row.reason_code ?? '—'} />
            <Pair label="Renewal due"         value={fmtDate(row.renewal_due_at)} />
            <Pair label="Submitted"           value={fmtDate(row.application_submitted_at)} />
            <Pair label="Completeness"        value={fmtDate(row.completeness_check_at)} />
            <Pair label="Revision req"        value={fmtDate(row.revision_requested_at)} />
            <Pair label="Baseline reassess"   value={fmtDate(row.baseline_reassessment_at)} />
            <Pair label="Additionality"       value={fmtDate(row.additionality_retest_at)} />
            <Pair label="VVB validation"      value={fmtDate(row.vvb_validation_at)} />
            <Pair label="Standard review"     value={fmtDate(row.standard_review_at)} />
            <Pair label="Renewed"             value={fmtDate(row.renewed_at)} />
            <Pair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"          value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"      value={String(row.escalation_level)} />
            <Pair label="Reportable"          value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.renewal_summary && (
            <BasisBlock label="Renewal summary" tone="#1a3a5c" text={row.renewal_summary} />
          )}
          {row.submission_basis && (
            <BasisBlock label="Submission basis" tone="#1a3a5c" text={row.submission_basis} />
          )}
          {row.completeness_basis && (
            <BasisBlock label="Completeness basis" tone="#1a3a5c" text={row.completeness_basis} />
          )}
          {row.revision_basis && (
            <BasisBlock label="Revision basis" tone="#8a4a00" text={row.revision_basis} />
          )}
          {row.baseline_basis && (
            <BasisBlock label="Baseline basis" tone="#a06200" text={row.baseline_basis} />
          )}
          {row.additionality_basis && (
            <BasisBlock label="Additionality basis" tone="#a06200" text={row.additionality_basis} />
          )}
          {row.validation_basis && (
            <BasisBlock label="Validation basis (VVB)" tone="#a06200" text={row.validation_basis} />
          )}
          {row.decision_basis && (
            <BasisBlock label="Decision basis" tone="#155724" text={row.decision_basis} />
          )}
          {row.refusal_basis && (
            <BasisBlock label="Refusal basis" tone="#9b1f1f" text={row.refusal_basis} />
          )}
        </section>

        {(nextAction || canRequestRevision || canRefuse || canWithdraw) && (
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
              {canRequestRevision && (
                <button
                  onClick={() => onAct('request-revision', row)}
                  className="rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  {ACTION_LABEL['request-revision']}
                </button>
              )}
              {canRefuse && (
                <button
                  onClick={() => onAct('refuse', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.refuse}
                </button>
              )}
              {canWithdraw && (
                <button
                  onClick={() => onAct('withdraw', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL.withdraw}
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
