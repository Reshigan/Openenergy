// Wave 74 — Regulator NERSA Levy Assessment & Collection lifecycle tab.
//
// NERSA recovering its running costs from the industries it regulates: an annual
// levy under section 5B of the National Energy Regulator Act 40 of 2004 (and fees
// under the Electricity Regulation Act 4 of 2006 section 10), assessed on a
// declared base — turnover, throughput volume, or a fixed schedule — across the
// three regulated industries (electricity, piped-gas, petroleum-pipelines). The
// desk computes the assessment, QA-reviews it, issues a levy notice, entertains
// an objection, confirms the amount payable, receives payment, ages the debt past
// due, issues a final demand, escalates an uncollected debt into enforcement, and
// either settles it on payment or writes it off with Council approval. An
// assessment raised in error may be withdrawn before payment.
//
//   levy_assessed → assessment_review → invoiced → payment_pending
//     → (partially_paid …) → settled                       (happy path)
//   objection: invoiced → objection_review → payment_pending
//   arrears:   payment_pending | partially_paid → in_arrears → final_demand
//                → enforcement → settled | written_off
//   withdraw:  levy_assessed | assessment_review | invoiced | objection_review → withdrawn
//
// DISTINCT from W43 tariff-determination by SUBJECT: W43 sets what a licensee
// CHARGES its customers; W74 sets what the licensee OWES the regulator. The
// financial counterpart to the licensing chains (W33/W49/W57). URGENT SLA — the
// LARGER the assessed levy, the TIGHTER every window. Single regulator-owned desk
// write; actor_party records the functional party (regulator / licensee) for
// audit. Reportability — the W74 signature: escalate_enforcement crosses to the
// NERSA Council for EVERY tier (licence good-standing at risk), write_off crosses
// for EVERY tier (fiscal write-off of public revenue), issue_final_demand + SLA
// breaches cross for large + major.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'levy_assessed' | 'assessment_review' | 'invoiced' | 'objection_review'
  | 'payment_pending' | 'partially_paid' | 'in_arrears' | 'final_demand'
  | 'enforcement' | 'settled' | 'written_off' | 'withdrawn';

type Tier = 'micro' | 'small' | 'medium' | 'large' | 'major';

type Sector = 'electricity' | 'piped_gas' | 'petroleum_pipeline';

type Basis = 'turnover_based' | 'volume_based' | 'fixed';

interface LevyRow {
  [key: string]: unknown;
  id: string;
  levy_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  licensee_id: string;
  licensee_name: string;
  licensee_licence_no: string | null;
  sector: Sector;
  levy_basis: Basis;
  levy_tier: Tier;
  financial_year: string;
  declared_base: number | null;
  base_unit: string | null;
  levy_rate: number | null;
  assessed_amount: number;
  paid_to_date: number;
  outstanding_amount: number;
  due_date: string | null;
  assessment_ref: string | null;
  invoice_ref: string | null;
  objection_ref: string | null;
  final_demand_ref: string | null;
  enforcement_ref: string | null;
  settlement_ref: string | null;
  writeoff_ref: string | null;
  assessment_basis: string | null;
  review_basis: string | null;
  invoice_basis: string | null;
  objection_basis: string | null;
  payable_basis: string | null;
  payment_basis: string | null;
  arrears_basis: string | null;
  final_demand_basis: string | null;
  enforcement_basis: string | null;
  settlement_basis: string | null;
  writeoff_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  chain_status: ChainStatus;
  assessed_at: string;
  assessment_review_at: string | null;
  invoiced_at: string | null;
  objection_review_at: string | null;
  payment_pending_at: string | null;
  partially_paid_at: string | null;
  in_arrears_at: string | null;
  final_demand_at: string | null;
  enforcement_at: string | null;
  settled_at: string | null;
  written_off_at: string | null;
  withdrawn_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: boolean;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  is_withdrawable?: boolean;
  allowed_actions?: string[];
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  breach_crosses_regulator?: boolean;
  outstanding_live?: number;
  days_overdue?: number;
  arrears_bucket?: string;
}

interface LevyEvent {
  id: string;
  levy_id: string;
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
  in_arrears_count: number;
  final_demand_count: number;
  enforcement_count: number;
  settled_count: number;
  written_off_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  total_assessed: number;
  total_collected: number;
  total_outstanding: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  levy_assessed:     { bg: '#e3e7ec', fg: '#557',    label: 'Assessed' },
  assessment_review: { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Assessment review' },
  invoiced:          { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Invoiced' },
  objection_review:  { bg: '#fff4d6', fg: '#a06200', label: 'Objection review' },
  payment_pending:   { bg: '#fff4d6', fg: '#a06200', label: 'Payment pending' },
  partially_paid:    { bg: '#ffe9d6', fg: '#8a4a00', label: 'Partially paid' },
  in_arrears:        { bg: '#ffe4b5', fg: '#8a4a00', label: 'In arrears' },
  final_demand:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Final demand' },
  enforcement:       { bg: '#fdd0d0', fg: '#7a1010', label: 'Enforcement' },
  settled:           { bg: '#d4edda', fg: '#155724', label: 'Settled' },
  written_off:       { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Written off' },
  withdrawn:         { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  micro:  { bg: '#e3e7ec', fg: '#557',    label: 'Micro (<R100k)' },
  small:  { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Small (<R1m)' },
  medium: { bg: '#fff4d6', fg: '#a06200', label: 'Medium (<R10m)' },
  large:  { bg: '#ffe4b5', fg: '#8a4a00', label: 'Large (<R50m)' },
  major:  { bg: '#fde0e0', fg: '#9b1f1f', label: 'Major (≥R50m)' },
};

const SECTOR_LABEL: Record<Sector, string> = {
  electricity:        'Electricity',
  piped_gas:          'Piped gas',
  petroleum_pipeline: 'Petroleum pipeline',
};

const BASIS_LABEL: Record<Basis, string> = {
  turnover_based: 'Turnover-based',
  volume_based:   'Volume-based',
  fixed:          'Fixed schedule',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',          label: 'Active' },
  { key: 'all',             label: 'All' },
  { key: 'micro',           label: 'Micro' },
  { key: 'small',           label: 'Small' },
  { key: 'medium',          label: 'Medium' },
  { key: 'large',           label: 'Large' },
  { key: 'major',           label: 'Major' },
  { key: 'payment_pending', label: 'Payment pending' },
  { key: 'partially_paid',  label: 'Partially paid' },
  { key: 'in_arrears',      label: 'In arrears' },
  { key: 'final_demand',    label: 'Final demand' },
  { key: 'enforcement',     label: 'Enforcement' },
  { key: 'breached',        label: 'SLA breached' },
  { key: 'reportable',      label: 'Reportable' },
  { key: 'settled',         label: 'Settled' },
  { key: 'written_off',     label: 'Written off' },
  { key: 'withdrawn',       label: 'Withdrawn' },
];

type ActionKind =
  | 'review-assessment' | 'issue-invoice' | 'record-objection' | 'resolve-objection'
  | 'confirm-payable' | 'record-partial-payment' | 'flag-arrears' | 'issue-final-demand'
  | 'escalate-enforcement' | 'record-settlement' | 'write-off' | 'withdraw-assessment';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  levy_assessed:     'review-assessment',
  assessment_review: 'issue-invoice',
  invoiced:          'confirm-payable',
  objection_review:  'resolve-objection',
  payment_pending:   'record-settlement',
  partially_paid:    'record-settlement',
  in_arrears:        'issue-final-demand',
  final_demand:      'escalate-enforcement',
  enforcement:       'record-settlement',
  settled:           null,
  written_off:       null,
  withdrawn:         null,
};

// Party annotation per action — the procedural function. NERSA (regulator)
// assesses, reviews, invoices, resolves objections, ages, demands, enforces,
// writes off and withdraws; the licensee objects, pays partially and settles.
const ACTION_LABEL: Record<ActionKind, string> = {
  'review-assessment':      'Review assessment (regulator)',
  'issue-invoice':          'Issue levy notice (regulator)',
  'record-objection':       'Record objection (licensee)',
  'resolve-objection':      'Resolve objection (regulator)',
  'confirm-payable':        'Confirm payable (regulator)',
  'record-partial-payment': 'Record partial payment (licensee)',
  'flag-arrears':           'Flag arrears (regulator)',
  'issue-final-demand':     'Issue final demand (regulator)',
  'escalate-enforcement':   'Escalate to enforcement (regulator)',
  'record-settlement':      'Record settlement (licensee)',
  'write-off':              'Write off (regulator)',
  'withdraw-assessment':    'Withdraw assessment (regulator)',
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
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(0)}k`;
  return `R${Math.round(n).toLocaleString('en-ZA')}`;
}

const TERMINAL_STATES: ChainStatus[] = ['settled', 'written_off', 'withdrawn'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['levy_assessed', 'assessment_review', 'invoiced', 'objection_review'];
const OBJECTION_STATES: ChainStatus[] = ['invoiced'];
const PARTIAL_PAY_STATES: ChainStatus[] = ['payment_pending', 'partially_paid', 'in_arrears', 'final_demand'];
const ARREARS_STATES: ChainStatus[] = ['payment_pending', 'partially_paid'];
const SETTLE_STATES: ChainStatus[] = ['payment_pending', 'partially_paid', 'in_arrears', 'final_demand', 'enforcement'];

export function LevyAssessmentChainTab() {
  const [rows, setRows] = useState<LevyRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<LevyRow | null>(null);
  const [events, setEvents] = useState<LevyEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: LevyRow[] } & KpiSummary }>('/levy-assessment/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, in_arrears_count: d.in_arrears_count,
          final_demand_count: d.final_demand_count, enforcement_count: d.enforcement_count,
          settled_count: d.settled_count, written_off_count: d.written_off_count,
          withdrawn_count: d.withdrawn_count, breached: d.breached,
          reportable_total: d.reportable_total, total_assessed: d.total_assessed,
          total_collected: d.total_collected, total_outstanding: d.total_outstanding,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load levy records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: LevyRow; events: LevyEvent[] } }>(
        `/levy-assessment/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load levy history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'micro' || filter === 'small' || filter === 'medium' || filter === 'large' || filter === 'major') {
        return r.levy_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: LevyRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'review-assessment') {
        const basis = window.prompt('Review basis — QA of the computed assessment (declared base × rate):');
        if (!basis) return;
        const ref = window.prompt('Assessment reference (e.g. ASMT-2026-0007):', row.assessment_ref || '') || '';
        const amt = window.prompt('Revise assessed amount (ZAR) — blank to keep:', String(row.assessed_amount || ''));
        body = { review_basis: basis };
        if (ref) body.assessment_ref = ref;
        if (amt && !Number.isNaN(Number(amt))) body.assessed_amount = Number(amt);
      } else if (action === 'issue-invoice') {
        const basis = window.prompt('Invoice basis — the levy notice issued to the licensee:');
        if (!basis) return;
        const ref = window.prompt('Invoice reference (e.g. INV-2026-0007):') || '';
        const due = window.prompt('Due date (YYYY-MM-DD):') || '';
        body = { invoice_basis: basis };
        if (ref) body.invoice_ref = ref;
        if (due) body.due_date = due;
      } else if (action === 'record-objection') {
        const basis = window.prompt('Objection basis — the licensee disputes the assessment:');
        if (!basis) return;
        const ref = window.prompt('Objection reference (e.g. OBJ-2026-0007):') || '';
        body = { objection_basis: basis };
        if (ref) body.objection_ref = ref;
      } else if (action === 'resolve-objection') {
        const basis = window.prompt('Objection resolution basis — NERSA confirms / revises the assessment:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. upheld / revised / rejected):', 'revised') || '';
        const amt = window.prompt('Revised assessed amount (ZAR) — blank to keep:', String(row.assessed_amount || ''));
        body = { objection_basis: basis };
        if (reason) body.reason_code = reason;
        if (amt && !Number.isNaN(Number(amt))) body.assessed_amount = Number(amt);
      } else if (action === 'confirm-payable') {
        const basis = window.prompt('Payable basis — the amount is confirmed payable (no objection):') || '';
        body = {};
        if (basis) body.payable_basis = basis;
      } else if (action === 'record-partial-payment') {
        const amt = window.prompt('Payment amount received (ZAR):');
        if (!amt || Number.isNaN(Number(amt))) return;
        const basis = window.prompt('Payment basis (e.g. EFT received / instalment):') || '';
        body = { payment_amount: Number(amt) };
        if (basis) body.payment_basis = basis;
      } else if (action === 'flag-arrears') {
        const basis = window.prompt('Arrears basis — the levy is past its due date and unpaid:');
        if (!basis) return;
        body = { arrears_basis: basis };
      } else if (action === 'issue-final-demand') {
        const basis = window.prompt('Final-demand basis — the formal pre-enforcement demand for payment:');
        if (!basis) return;
        const ref = window.prompt('Final-demand reference (e.g. FD-2026-0007):') || '';
        body = { final_demand_basis: basis };
        if (ref) body.final_demand_ref = ref;
      } else if (action === 'escalate-enforcement') {
        const basis = window.prompt('Enforcement basis — uncollected levy escalated (licence good-standing at risk):');
        if (!basis) return;
        const ref = window.prompt('Enforcement reference (e.g. ENF-2026-0007):') || '';
        const reason = window.prompt('Reason code (e.g. persistent_non_payment):', 'persistent_non_payment') || '';
        body = { enforcement_basis: basis };
        if (ref) body.enforcement_ref = ref;
        if (reason) body.reason_code = reason;
      } else if (action === 'record-settlement') {
        const basis = window.prompt('Settlement basis — the levy is paid in full / settled:');
        if (!basis) return;
        const ref = window.prompt('Settlement reference (e.g. STL-2026-0007):') || '';
        const amt = window.prompt('Final payment amount (ZAR) — blank to clear the balance:', '');
        body = { settlement_basis: basis };
        if (ref) body.settlement_ref = ref;
        if (amt && !Number.isNaN(Number(amt))) body.payment_amount = Number(amt);
      } else if (action === 'write-off') {
        const basis = window.prompt('Write-off basis — uncollectable, written off with Council approval:');
        if (!basis) return;
        const ref = window.prompt('Write-off reference (e.g. WO-2026-0007):') || '';
        const reason = window.prompt('Reason code (e.g. licensee_insolvent / uneconomic_to_pursue):', 'uneconomic_to_pursue') || '';
        body = { writeoff_basis: basis };
        if (ref) body.writeoff_ref = ref;
        if (reason) body.reason_code = reason;
      } else if (action === 'withdraw-assessment') {
        const basis = window.prompt('Withdrawal basis — the assessment was raised in error (before payment):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. assessed_in_error / duplicate):', 'assessed_in_error') || '';
        body = { withdrawal_basis: basis };
        if (reason) body.reason_code = reason;
      }
      await api.post(`/levy-assessment/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Levy assessment &amp; collection</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage NERSA levy chain (National Energy Regulator Act 40/2004 s5B · Electricity Regulation Act 4/2006 s10) ·
            assessed → assessment review → invoiced → payment pending → partially paid → settled. An objection branch
            (invoiced → objection review → payment pending), an arrears / dunning branch (payment pending | partially
            paid → in arrears → final demand → enforcement → settled | written off), and a withdraw-before-payment exit.
            This is what a licensee OWES the regulator — the financial counterpart to the licensing chains (W33/W49/W57),
            distinct from W43 which sets what a licensee CHARGES its customers. URGENT SLA: the larger the assessed levy,
            the tighter every window (a major utility levy is fastest). The W74 signature — enforcement escalation crosses
            to the NERSA Council for every tier (licence good-standing at risk) and a write-off crosses for every tier
            (fiscal write-off of public revenue); final demands + SLA breaches cross for large + major.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="In arrears" value={kpis?.in_arrears_count ?? 0} tone={(kpis?.in_arrears_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Final demand" value={kpis?.final_demand_count ?? 0} tone={(kpis?.final_demand_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Enforcement" value={kpis?.enforcement_count ?? 0} tone={(kpis?.enforcement_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Settled" value={kpis?.settled_count ?? 0} tone="ok" />
        <Kpi label="Written off" value={kpis?.written_off_count ?? 0} tone={(kpis?.written_off_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Assessed" value={fmtZar(kpis?.total_assessed ?? 0)} />
        <Kpi label="Collected" value={fmtZar(kpis?.total_collected ?? 0)} tone="ok" />
        <Kpi label="Outstanding" value={fmtZar(kpis?.total_outstanding ?? 0)} tone={(kpis?.total_outstanding ?? 0) > 0 ? 'warn' : 'ok'} />
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Levy #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Licensee</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Sector</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Assessed</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Outstanding</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.levy_tier];
                const outstanding = r.outstanding_live ?? r.outstanding_amount;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      {r.levy_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to NERSA Council">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[180px] truncate" title={r.licensee_name}>
                      {r.licensee_name}
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{SECTOR_LABEL[r.sector]}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'oklch(0.46 0.16 55)' }}>{fmtZar(r.assessed_amount)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${outstanding > 0 ? 'text-[#8a4a00] font-medium' : 'text-[#4a5568]'}`}>
                      {fmtZar(outstanding)}
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
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[#4a5568]">No levies match.</td></tr>
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
  row: LevyRow;
  events: LevyEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: LevyRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canObject = OBJECTION_STATES.includes(row.chain_status);
  const canPartialPay = PARTIAL_PAY_STATES.includes(row.chain_status);
  const canFlagArrears = ARREARS_STATES.includes(row.chain_status);
  const canSettle = SETTLE_STATES.includes(row.chain_status) && nextAction !== 'record-settlement';
  const canWriteOff = row.chain_status === 'enforcement';
  const canWithdraw = WITHDRAWABLE_STATES.includes(row.chain_status);
  const outstanding = row.outstanding_live ?? row.outstanding_amount;

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.levy_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.licensee_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.levy_tier].label} · {SECTOR_LABEL[row.sector]} · {BASIS_LABEL[row.levy_basis]} · FY {row.financial_year}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                Assessed {fmtZar(row.assessed_amount)} · paid {fmtZar(row.paid_to_date)} · outstanding {fmtZar(outstanding)}
                {row.escalation_level > 0 ? ` · escalation lvl ${row.escalation_level}` : ''}
              </div>
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
            <Pair label="State"            value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"             value={TIER_TONE[row.levy_tier].label} />
            <Pair label="Sector"           value={SECTOR_LABEL[row.sector]} />
            <Pair label="Basis"            value={BASIS_LABEL[row.levy_basis]} />
            <Pair label="Financial year"   value={row.financial_year} />
            <Pair label="Licence no"       value={row.licensee_licence_no ?? '—'} />
            <Pair label="Declared base"    value={row.declared_base != null ? `${row.declared_base.toLocaleString('en-ZA')} ${row.base_unit ?? ''}`.trim() : '—'} />
            <Pair label="Levy rate"        value={row.levy_rate != null ? String(row.levy_rate) : '—'} />
            <Pair label="Assessed amount"  value={fmtZar(row.assessed_amount)} />
            <Pair label="Paid to date"     value={fmtZar(row.paid_to_date)} />
            <Pair label="Outstanding"      value={fmtZar(outstanding)} />
            <Pair label="Due date"         value={fmtDate(row.due_date)} />
            <Pair label="Days overdue"     value={row.days_overdue != null && row.days_overdue > 0 ? `${row.days_overdue}d (${row.arrears_bucket})` : '—'} />
            <Pair label="Assessment ref"   value={row.assessment_ref ?? '—'} />
            <Pair label="Invoice ref"      value={row.invoice_ref ?? '—'} />
            <Pair label="Objection ref"    value={row.objection_ref ?? '—'} />
            <Pair label="Final demand ref" value={row.final_demand_ref ?? '—'} />
            <Pair label="Enforcement ref"  value={row.enforcement_ref ?? '—'} />
            <Pair label="Settlement ref"   value={row.settlement_ref ?? '—'} />
            <Pair label="Write-off ref"    value={row.writeoff_ref ?? '—'} />
            <Pair label="Reason code"      value={row.reason_code ?? '—'} />
            <Pair label="Assessed"         value={fmtDate(row.assessed_at)} />
            <Pair label="Reviewed"         value={fmtDate(row.assessment_review_at)} />
            <Pair label="Invoiced"         value={fmtDate(row.invoiced_at)} />
            <Pair label="Objection"        value={fmtDate(row.objection_review_at)} />
            <Pair label="Payment pending"  value={fmtDate(row.payment_pending_at)} />
            <Pair label="In arrears"       value={fmtDate(row.in_arrears_at)} />
            <Pair label="Final demand"     value={fmtDate(row.final_demand_at)} />
            <Pair label="Enforcement"      value={fmtDate(row.enforcement_at)} />
            <Pair label="Settled"          value={fmtDate(row.settled_at)} />
            <Pair label="SLA deadline"     value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"       value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Reportable"       value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.review_basis && (
            <BasisBlock label="Review basis" tone="oklch(0.46 0.16 55)" text={row.review_basis} />
          )}
          {row.invoice_basis && (
            <BasisBlock label="Invoice basis" tone="oklch(0.46 0.16 55)" text={row.invoice_basis} />
          )}
          {row.objection_basis && (
            <BasisBlock label="Objection basis (licensee)" tone="#a06200" text={row.objection_basis} />
          )}
          {row.payable_basis && (
            <BasisBlock label="Payable basis" tone="oklch(0.46 0.16 55)" text={row.payable_basis} />
          )}
          {row.payment_basis && (
            <BasisBlock label="Payment basis" tone="#155724" text={row.payment_basis} />
          )}
          {row.arrears_basis && (
            <BasisBlock label="Arrears basis" tone="#a06200" text={row.arrears_basis} />
          )}
          {row.final_demand_basis && (
            <BasisBlock label="Final-demand basis" tone="#9b1f1f" text={row.final_demand_basis} />
          )}
          {row.enforcement_basis && (
            <BasisBlock label="Enforcement basis" tone="#7a1010" text={row.enforcement_basis} />
          )}
          {row.settlement_basis && (
            <BasisBlock label="Settlement basis" tone="#155724" text={row.settlement_basis} />
          )}
          {row.writeoff_basis && (
            <BasisBlock label="Write-off basis" tone="#6b1f1f" text={row.writeoff_basis} />
          )}
          {row.withdrawal_basis && (
            <BasisBlock label="Withdrawal basis" tone="#6b1f1f" text={row.withdrawal_basis} />
          )}
        </section>

        {(nextAction || canObject || canPartialPay || canFlagArrears || canSettle || canWriteOff || canWithdraw) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#c2873a]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canObject && (
                <button type="button"
                  onClick={() => onAct('record-objection', row)}
                  className="rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  {ACTION_LABEL['record-objection']}
                </button>
              )}
              {canPartialPay && (
                <button type="button"
                  onClick={() => onAct('record-partial-payment', row)}
                  className="rounded border border-green-300 bg-white px-3 py-1.5 text-[12px] font-medium text-green-700 hover:bg-green-50"
                >
                  {ACTION_LABEL['record-partial-payment']}
                </button>
              )}
              {canFlagArrears && (
                <button type="button"
                  onClick={() => onAct('flag-arrears', row)}
                  className="rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  {ACTION_LABEL['flag-arrears']}
                </button>
              )}
              {canSettle && (
                <button type="button"
                  onClick={() => onAct('record-settlement', row)}
                  className="rounded border border-green-300 bg-white px-3 py-1.5 text-[12px] font-medium text-green-700 hover:bg-green-50"
                >
                  {ACTION_LABEL['record-settlement']}
                </button>
              )}
              {canWriteOff && (
                <button type="button"
                  onClick={() => onAct('write-off', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['write-off']}
                </button>
              )}
              {canWithdraw && (
                <button type="button"
                  onClick={() => onAct('withdraw-assessment', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL['withdraw-assessment']}
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
                  {e.notes && <div className="mt-1" style={{ color: 'oklch(0.46 0.16 55)' }}>{e.notes}</div>}
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
