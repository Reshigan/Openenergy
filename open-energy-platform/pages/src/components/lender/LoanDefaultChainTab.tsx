// Wave 45 — Lender Loan Default & Enforcement / Step-in chain — LMA EoD + SARB
// impairment + SA Insolvency / Companies Act business-rescue.
//
// The ENFORCEMENT backbone of project finance. When a borrower defaults — a
// payment miss, a covenant breach crystallising into an event of default, an
// insolvency trigger — the lender works the position through reservation of
// rights, a formal default notice, a cure window, acceleration, standstill
// (forbearance), and ultimately security enforcement / step-in, restructure, or
// write-off. Sits downstream of W38 covenant certificates + W6 dunning + the
// W21 drawdown / W30 disbursement-UoP chains; where W38 ENDS at acceleration,
// W45 PICKS UP at the default and runs to enforcement.
//
//   default_flagged → under_review → reservation_of_rights
//     → default_notice_issued → cure_period → cured
//   enforcement: accelerated → standstill → enforcement_commenced
//                → restructured / enforced_closed / written_off
//
// URGENT tier SLA — senior secured tightest (worked fastest). write_off (loss
// crystallised → SARB impairment) crosses the regulator for ALL tiers; accelerate
// (EoD) + commence_enforcement (step-in) + SLA breaches for senior + mezzanine only.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { prompt } from '../PromptDialog';

type ChainStatus =
  | 'default_flagged' | 'under_review' | 'reservation_of_rights' | 'default_notice_issued'
  | 'cure_period' | 'accelerated' | 'standstill' | 'enforcement_commenced'
  | 'cured' | 'restructured' | 'enforced_closed' | 'written_off';

type Tier = 'senior_secured' | 'mezzanine' | 'subordinated';

interface LoanDefaultRow {
  [key: string]: unknown;
  id: string;
  default_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  borrower_party_id: string;
  borrower_party_name: string;
  lender_name: string | null;
  security_agent_name: string | null;
  facility_name: string;
  facility_tier: Tier;
  facility_limit: number | null;
  outstanding_principal: number | null;
  accelerated_amount: number | null;
  recovery_amount: number | null;
  write_off_amount: number | null;
  default_type: string | null;
  default_event: string | null;
  days_past_due: number | null;
  flag_ref: string | null;
  notice_ref: string | null;
  cure_ref: string | null;
  acceleration_ref: string | null;
  standstill_ref: string | null;
  enforcement_ref: string | null;
  restructure_ref: string | null;
  flag_basis: string | null;
  review_basis: string | null;
  notice_basis: string | null;
  cure_basis: string | null;
  acceleration_basis: string | null;
  standstill_basis: string | null;
  enforcement_basis: string | null;
  restructure_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: ChainStatus;
  default_flagged_at: string;
  under_review_at: string | null;
  reservation_of_rights_at: string | null;
  default_notice_issued_at: string | null;
  cure_period_at: string | null;
  accelerated_at: string | null;
  standstill_at: string | null;
  enforcement_commenced_at: string | null;
  cured_at: string | null;
  restructured_at: string | null;
  enforced_closed_at: string | null;
  written_off_at: string | null;
  cure_deadline_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  is_reportable?: boolean;
  reached_enforcement?: boolean;
  breach_crosses_regulator?: boolean;
  sla_window_minutes?: number;
  created_by: string;
  created_at: string;
}

interface LoanDefaultEvent {
  id: string;
  default_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  default_flagged:       { bg: '#fff4d6', fg: '#a06200', label: 'Default flagged' },
  under_review:          { bg: '#fbe7d0', fg: '#7a4500', label: 'Under review' },
  reservation_of_rights: { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Reservation of rights' },
  default_notice_issued: { bg: '#fbe7d0', fg: '#7a4500', label: 'Notice issued' },
  cure_period:           { bg: '#fff4d6', fg: '#a06200', label: 'Cure period' },
  accelerated:           { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Accelerated (EoD)' },
  standstill:            { bg: '#e6dcf5', fg: '#4a2a7a', label: 'Standstill' },
  enforcement_commenced: { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Enforcement' },
  cured:                 { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Cured' },
  restructured:          { bg: '#daf5e2', fg: '#1f6b3a', label: 'Restructured' },
  enforced_closed:       { bg: '#cdd7e2', fg: '#33475e', label: 'Enforced / closed' },
  written_off:           { bg: '#3a3a3a', fg: '#ffffff', label: 'Written off' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  senior_secured: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Senior secured' },
  mezzanine:      { bg: '#fff4d6', fg: '#a06200', label: 'Mezzanine' },
  subordinated:   { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Subordinated' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'Active' },
  { key: 'all',                   label: 'All' },
  { key: 'reportable',            label: 'SARB reportable' },
  { key: 'senior_secured',        label: 'Senior' },
  { key: 'mezzanine',             label: 'Mezzanine' },
  { key: 'subordinated',          label: 'Subordinated' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'default_flagged',       label: 'Flagged' },
  { key: 'under_review',          label: 'Review' },
  { key: 'default_notice_issued', label: 'Notice' },
  { key: 'cure_period',           label: 'Cure' },
  { key: 'accelerated',           label: 'Accelerated' },
  { key: 'enforcement_commenced', label: 'Enforcement' },
  { key: 'cured',                 label: 'Cured' },
  { key: 'restructured',          label: 'Restructured' },
  { key: 'enforced_closed',       label: 'Closed' },
  { key: 'written_off',           label: 'Written off' },
];

type ActionKind =
  | 'begin-review' | 'reserve-rights' | 'issue-default-notice' | 'open-cure-period'
  | 'confirm-cure' | 'dismiss' | 'accelerate' | 'agree-standstill'
  | 'commence-enforcement' | 'agree-restructure' | 'close-enforcement' | 'write-off';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  default_flagged:       'begin-review',
  under_review:          'reserve-rights',
  reservation_of_rights: 'issue-default-notice',
  default_notice_issued: 'open-cure-period',
  cure_period:           'confirm-cure',
  accelerated:           'commence-enforcement',
  standstill:            'commence-enforcement',
  enforcement_commenced: 'close-enforcement',
  cured:                 null,
  restructured:          null,
  enforced_closed:       null,
  written_off:           null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'begin-review':        'Begin review (Lender)',
  'reserve-rights':      'Reserve rights (Lender)',
  'issue-default-notice':'Issue default notice (Lender)',
  'open-cure-period':    'Open cure period (Lender)',
  'confirm-cure':        'Confirm cure (Borrower)',
  'dismiss':             'Dismiss — false alarm (Lender)',
  'accelerate':          'Accelerate — declare EoD (Lender)',
  'agree-standstill':    'Agree standstill (Lender)',
  'commence-enforcement':'Commence enforcement / step-in (Agent)',
  'agree-restructure':   'Agree restructure (Lender)',
  'close-enforcement':   'Close enforcement — security realised (Agent)',
  'write-off':           'Write off — crystallise loss (Lender)',
};

// Branch availability per state (in addition to the primary forward action).
const CAN_ISSUE_NOTICE: ChainStatus[]   = ['under_review'];           // skip ROR
const CAN_DISMISS: ChainStatus[]        = ['default_flagged', 'under_review'];
const CAN_ACCELERATE: ChainStatus[]     = ['reservation_of_rights', 'default_notice_issued', 'cure_period'];
const CAN_STANDSTILL: ChainStatus[]     = ['default_notice_issued', 'accelerated'];
const CAN_RESTRUCTURE: ChainStatus[]    = ['standstill', 'enforcement_commenced'];
const CAN_WRITE_OFF: ChainStatus[]      = ['accelerated', 'enforcement_commenced'];

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
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(0)}m`;
  if (Math.abs(n) >= 1_000)     return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

interface KpiSummary {
  total: number;
  open_count: number;
  cured_count: number;
  restructured_count: number;
  enforced_closed_count: number;
  written_off_count: number;
  accelerated_count: number;
  enforcement_count: number;
  breached: number;
  reportable_total: number;
  senior_open: number;
  total_outstanding: number;
  total_write_off: number;
  total_recovery: number;
}

export function LoanDefaultChainTab() {
  const [rows, setRows] = useState<LoanDefaultRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<LoanDefaultRow | null>(null);
  const [events, setEvents] = useState<LoanDefaultEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: LoanDefaultRow[] } & KpiSummary }>('/loan-default/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          open_count: data.open_count || 0,
          cured_count: data.cured_count || 0,
          restructured_count: data.restructured_count || 0,
          enforced_closed_count: data.enforced_closed_count || 0,
          written_off_count: data.written_off_count || 0,
          accelerated_count: data.accelerated_count || 0,
          enforcement_count: data.enforcement_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          senior_open: data.senior_open || 0,
          total_outstanding: data.total_outstanding || 0,
          total_write_off: data.total_write_off || 0,
          total_recovery: data.total_recovery || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load loan default chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: LoanDefaultRow; events: LoanDefaultEvent[] } }>(`/loan-default/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load default history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'senior_secured' || filter === 'mezzanine' || filter === 'subordinated') {
        return r.facility_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, open_count: 0, cured_count: 0, restructured_count: 0,
    enforced_closed_count: 0, written_off_count: 0, accelerated_count: 0,
    enforcement_count: 0, breached: 0, reportable_total: 0, senior_open: 0,
    total_outstanding: 0, total_write_off: 0, total_recovery: 0,
  };

  const act = useCallback(async (action: ActionKind, row: LoanDefaultRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'begin-review') {
        const basis = await prompt('Review basis (triage narrative):', '');
        if (basis) body.review_basis = basis;
      } else if (action === 'reserve-rights') {
        const ref = await prompt('Flag / file reference (optional):', row.flag_ref ?? '');
        if (ref) body.flag_ref = ref;
        const basis = await prompt('Reservation-of-rights basis (narrative):', '');
        if (basis) body.review_basis = basis;
      } else if (action === 'issue-default-notice') {
        const ref = await prompt('Default notice reference (eg "DEF-NOTICE-2026-0007"):');
        if (!ref) return;
        body.notice_ref = ref;
        const basis = await prompt('Default notice basis (event-of-default rationale — required):');
        if (!basis) return;
        body.notice_basis = basis;
        const dtype = await prompt('Default type (payment / covenant / insolvency / cross_default / moratorium):', row.default_type ?? '');
        if (dtype) body.default_type = dtype;
        const devent = await prompt('Default event (short label):', row.default_event ?? '');
        if (devent) body.default_event = devent;
      } else if (action === 'open-cure-period') {
        const ref = await prompt('Cure reference (eg "CURE-2026-0009"):', '');
        if (ref) body.cure_ref = ref;
        const basis = await prompt('Cure basis (contractual cure window — required):');
        if (!basis) return;
        body.cure_basis = basis;
        const deadline = await prompt('Cure deadline (ISO date, eg "2026-07-15"):', '');
        if (deadline) body.cure_deadline_at = deadline;
      } else if (action === 'confirm-cure') {
        const basis = await prompt('Cure confirmation basis (evidence remedied — required):');
        if (!basis) return;
        body.cure_basis = basis;
        const rod = await prompt('ROD notes (optional):', '');
        if (rod) body.rod_notes = rod;
      } else if (action === 'dismiss') {
        const reason = await prompt('Reason code (eg "FALSE_ALARM", "DATA_ERROR"):', '');
        if (reason) body.reason_code = reason;
        const rod = await prompt('Dismissal notes (required):');
        if (!rod) return;
        body.rod_notes = rod;
      } else if (action === 'accelerate') {
        const ref = await prompt('Acceleration reference (eg "ACCEL-EOD-2026-0002"):');
        if (!ref) return;
        body.acceleration_ref = ref;
        const basis = await prompt('Acceleration basis (event-of-default rationale — required):');
        if (!basis) return;
        body.acceleration_basis = basis;
        const amt = await prompt('Accelerated amount called (ZAR, eg 450000000):', String(row.outstanding_principal ?? ''));
        if (amt) body.accelerated_amount = Number(amt);
        const reason = await prompt('Reason code (eg "EVENT_OF_DEFAULT", "UOP_DIVERSION"):', '');
        if (reason) body.reason_code = reason;
        const rod = await prompt('ROD notes (board / majority-lender resolution — required):');
        if (!rod) return;
        body.rod_notes = rod;
      } else if (action === 'agree-standstill') {
        const ref = await prompt('Standstill / forbearance reference (eg "STANDSTILL-2026-0003"):', '');
        if (ref) body.standstill_ref = ref;
        const basis = await prompt('Standstill basis (forbearance terms — required):');
        if (!basis) return;
        body.standstill_basis = basis;
      } else if (action === 'commence-enforcement') {
        const ref = await prompt('Enforcement / step-in reference (eg "ENFORCE-2026-0001"):');
        if (!ref) return;
        body.enforcement_ref = ref;
        const basis = await prompt('Enforcement basis (security realisation / step-in plan — required):');
        if (!basis) return;
        body.enforcement_basis = basis;
      } else if (action === 'agree-restructure') {
        const ref = await prompt('Restructure reference (eg "RESTRUCTURE-2026-0004"):');
        if (!ref) return;
        body.restructure_ref = ref;
        const basis = await prompt('Restructure basis (workout terms — required):');
        if (!basis) return;
        body.restructure_basis = basis;
        const reason = await prompt('Reason code (eg "BILATERAL_WORKOUT", "BUSINESS_RESCUE"):', '');
        if (reason) body.reason_code = reason;
        const rod = await prompt('ROD notes (optional):', '');
        if (rod) body.rod_notes = rod;
      } else if (action === 'close-enforcement') {
        const basis = await prompt('Enforcement close basis (realisation outcome — required):');
        if (!basis) return;
        body.enforcement_basis = basis;
        const rec = await prompt('Recovery amount realised (ZAR, eg 3960000000):', String(row.recovery_amount ?? ''));
        if (rec) body.recovery_amount = Number(rec);
        const reason = await prompt('Reason code (eg "SECURITY_REALISED", "ASSET_SALE"):', '');
        if (reason) body.reason_code = reason;
        const rod = await prompt('ROD notes (optional):', '');
        if (rod) body.rod_notes = rod;
      } else if (action === 'write-off') {
        const amt = await prompt('Write-off amount — crystallised loss (ZAR, eg 474000000):');
        if (!amt) return;
        body.write_off_amount = Number(amt);
        const rec = await prompt('Recovery amount (ZAR, optional):', String(row.recovery_amount ?? ''));
        if (rec) body.recovery_amount = Number(rec);
        const reason = await prompt('Reason code (eg "UNRECOVERABLE", "INSOLVENCY_SHORTFALL"):', '');
        if (reason) body.reason_code = reason;
        const rod = await prompt('ROD notes (board impairment resolution — required):');
        if (!rod) return;
        body.rod_notes = rod;
      }
      await api.post(`/loan-default/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Loan Default & Enforcement / Step-in — LMA + SARB + Insolvency Act</h2>
          <p className="text-xs text-[#4a5568]">
            The enforcement backbone. When a borrower defaults — a payment miss, a
            covenant breach crystallising into an event of default, an insolvency
            trigger — the lender works the position through reservation of rights,
            a default notice, a cure window, acceleration, standstill (forbearance),
            and ultimately security enforcement / step-in, restructure, or
            write-off. URGENT tier SLA — senior secured worked fastest. Write-off
            (loss crystallised → SARB impairment) crosses the regulator for ALL
            tiers; acceleration (EoD) + enforcement + SLA breaches for senior +
            mezzanine only.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"          value={kpis.total} />
        <Kpi label="Open"           value={kpis.open_count}        tone={kpis.open_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Accelerated"    value={kpis.accelerated_count} tone={kpis.accelerated_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Enforcement"    value={kpis.enforcement_count} tone={kpis.enforcement_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Cured"          value={kpis.cured_count} />
        <Kpi label="Written off"    value={kpis.written_off_count} tone={kpis.written_off_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"   value={kpis.breached}          tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Outstanding"    value={fmtZar(kpis.total_outstanding)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Restructured: <span className="font-semibold text-[#1f6b3a]">{kpis.restructured_count}</span></span>
        <span>Enforced / closed: <span className="font-semibold text-[#33475e]">{kpis.enforced_closed_count}</span></span>
        <span>SARB reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Senior open: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.senior_open}</span></span>
        <span>Write-off pool: <span className="font-semibold text-[#9b1f1f]">{fmtZar(kpis.total_write_off)}</span></span>
        <span>Recovered: <span className="font-semibold text-[#1f6b3a]">{fmtZar(kpis.total_recovery)}</span></span>
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Default #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Borrower / facility</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Type</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Outstanding</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.facility_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      {r.default_number}
                      {r.is_reportable && <span className="ml-1 rounded bg-[#fde0e0] px-1 text-[9px] font-semibold text-[#9b1f1f]">SARB</span>}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      <div className="font-medium">{r.borrower_party_name}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.facility_name}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#7a4500]">
                      {r.default_type ?? '—'}
                      {r.days_past_due != null && <span className="ml-1 text-[10px] text-[#9b1f1f]">{r.days_past_due}dpd</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'oklch(0.46 0.16 55)' }}>{fmtZar(r.outstanding_principal)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No defaults match.</td></tr>
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
  row: LoanDefaultRow;
  events: LoanDefaultEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: LoanDefaultRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canIssueNotice = CAN_ISSUE_NOTICE.includes(row.chain_status);
  const canDismiss = CAN_DISMISS.includes(row.chain_status);
  const canAccelerate = CAN_ACCELERATE.includes(row.chain_status);
  const canStandstill = CAN_STANDSTILL.includes(row.chain_status);
  const canRestructure = CAN_RESTRUCTURE.includes(row.chain_status);
  const canWriteOff = CAN_WRITE_OFF.includes(row.chain_status);
  const anyAction = nextAction || canIssueNotice || canDismiss || canAccelerate || canStandstill || canRestructure || canWriteOff;

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.default_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.borrower_party_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.facility_tier].label} · {row.facility_name} · {row.default_type ?? '—'}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Borrower"             value={row.borrower_party_name} />
            <Pair label="Lender of record"     value={row.lender_name ?? '—'} />
            <Pair label="Security agent"        value={row.security_agent_name ?? '—'} />
            <Pair label="Tier"                  value={TIER_TONE[row.facility_tier].label} />
            <Pair label="Facility"              value={row.facility_name} />
            <Pair label="Facility limit"        value={fmtZar(row.facility_limit)} />
            <Pair label="Outstanding"           value={fmtZar(row.outstanding_principal)} />
            <Pair label="Default type"          value={row.default_type ?? '—'} />
            <Pair label="Default event"         value={row.default_event ?? '—'} />
            <Pair label="Days past due"         value={row.days_past_due != null ? String(row.days_past_due) : '—'} />
            <Pair label="Accelerated amount"    value={fmtZar(row.accelerated_amount)} />
            <Pair label="Recovery amount"       value={fmtZar(row.recovery_amount)} />
            <Pair label="Write-off amount"      value={fmtZar(row.write_off_amount)} />
            <Pair label="Notice ref"            value={row.notice_ref ?? '—'} />
            <Pair label="Cure ref"              value={row.cure_ref ?? '—'} />
            <Pair label="Acceleration ref"      value={row.acceleration_ref ?? '—'} />
            <Pair label="Standstill ref"        value={row.standstill_ref ?? '—'} />
            <Pair label="Enforcement ref"       value={row.enforcement_ref ?? '—'} />
            <Pair label="Restructure ref"       value={row.restructure_ref ?? '—'} />
            <Pair label="State"                  value={STATE_TONE[row.chain_status].label} />
            <Pair label="Reportable"            value={row.is_reportable ? 'Yes — SARB' : 'No'} />
            <Pair label="Escalation level"      value={String(row.escalation_level)} />
            <Pair label="Cure deadline"         value={fmtDate(row.cure_deadline_at)} />
            <Pair label="SLA deadline"          value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"            value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Reason code"           value={row.reason_code ?? '—'} />
            {row.source_wave && <Pair label="Source" value={`${row.source_wave} · ${row.source_entity_id ?? ''}`} />}
          </div>
          {row.rod_notes && (
            <div className="mt-3 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">ROD notes</div>
              {row.rod_notes}
            </div>
          )}
        </section>

        {anyAction && (
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
              {canIssueNotice && (
                <button type="button"
                  onClick={() => onAct('issue-default-notice', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#7a4500] hover:bg-[#fff8e8]"
                >
                  {ACTION_LABEL['issue-default-notice']}
                </button>
              )}
              {canDismiss && (
                <button type="button"
                  onClick={() => onAct('dismiss', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1f6b3a] hover:bg-[#f0faf3]"
                >
                  {ACTION_LABEL['dismiss']}
                </button>
              )}
              {canStandstill && (
                <button type="button"
                  onClick={() => onAct('agree-standstill', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a2a7a] hover:bg-[#f4f0fb]"
                >
                  {ACTION_LABEL['agree-standstill']}
                </button>
              )}
              {canAccelerate && (
                <button type="button"
                  onClick={() => onAct('accelerate', row)}
                  className="rounded border border-red-400 bg-white px-3 py-1.5 text-[12px] font-medium text-red-800 hover:bg-red-50"
                >
                  {ACTION_LABEL['accelerate']}
                </button>
              )}
              {canRestructure && (
                <button type="button"
                  onClick={() => onAct('agree-restructure', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1f6b3a] hover:bg-[#f0faf3]"
                >
                  {ACTION_LABEL['agree-restructure']}
                </button>
              )}
              {canWriteOff && (
                <button type="button"
                  onClick={() => onAct('write-off', row)}
                  className="rounded border border-red-500 bg-white px-3 py-1.5 text-[12px] font-medium text-red-900 hover:bg-red-50"
                >
                  {ACTION_LABEL['write-off']}
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
                  {(e.from_status || e.to_status) && (
                    <div className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</div>
                  )}
                  {e.actor_party && <div className="text-[10px] text-[#6b7685]">party: {e.actor_party}</div>}
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

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}

export default LoanDefaultChainTab;
