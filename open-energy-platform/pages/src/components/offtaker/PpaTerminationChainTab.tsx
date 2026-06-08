// Wave 62 — Offtaker PPA Termination & Early-Termination Amount (Buy-Out) tab.
//
// 12-state P6 chain on oe_ppa_terminations — the EXIT of the offtake
// relationship. W22 executes the PPA, W39 reprices it, W7 reconciles delivery,
// W32 enforces minimum offtake, W46 compensates curtailment, W54 backstops
// payment. W62 is how the PPA ENDS before its natural term: a termination event
// arises, notice is served, a cure window runs, and — if uncured — the PPA
// terminates and an early-termination amount (the buy-out) is calculated,
// agreed and settled. The seller (IPP) can dispute the calculated buy-out; an
// independent expert resolves it.
//
// The buy-out basis turns on the termination CAUSE:
//   seller_default / prolonged_force_majeure  → debt only (no equity make-whole)
//   buyer_default / change_in_law             → debt + equity (seller made whole)
//   no_fault                                  → negotiated (mutual termination)
//
// MIXED SLA: cure / eta_assessment / dispute windows INVERTED (bigger buy-out =
// longer, deeper debt-schedule + equity-IRR computation); settlement_pending
// URGENT (a larger agreed buy-out is paid FASTER for security of supply).
//
// Reportability (the W62 signature is CAUSE-driven):
//   confirm_termination crosses for EVERY tier when the cause is INVOLUNTARY;
//   a no_fault mutual termination crosses only for the large tiers.
//   confirm_settlement + SLA breaches cross for major + critical only.
//
// Two-party split write: the OFFTAKER side drives the termination machinery;
// the SELLER / counterparty (IPP) can dispute the calculated buy-out
// (dispute-eta is the sole counterparty write); an independent expert resolves.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'termination_triggered' | 'notice_served' | 'cure_period' | 'termination_review'
  | 'termination_confirmed' | 'eta_assessment' | 'eta_agreed' | 'disputed'
  | 'settlement_pending' | 'closed' | 'reinstated' | 'withdrawn';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';
type Cause = 'seller_default' | 'buyer_default' | 'no_fault' | 'change_in_law' | 'prolonged_force_majeure';

interface TerminationRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  offtaker_party_id: string;
  offtaker_party_name: string;
  seller_party_id: string;
  seller_party_name: string;
  independent_party_id: string | null;
  independent_party_name: string | null;
  ppa_code: string | null;
  ppa_name: string;
  plant_name: string | null;
  technology: string | null;
  ppa_currency: string | null;
  ppa_capacity_mw: number | null;
  remaining_term_months: number | null;
  termination_cause: Cause;
  eta_basis: string;
  debt_outstanding_zar_m: number | null;
  equity_makewhole_zar_m: number | null;
  buyout_zar_m: number;
  settlement_zar_m: number | null;
  termination_tier: Tier;
  notice_served_flag: number;
  cure_offered: number;
  cured: number;
  termination_confirmed_flag: number;
  eta_calculated: number;
  eta_agreed_flag: number;
  dispute_raised: number;
  dispute_resolved: number;
  settlement_paid: number;
  trigger_ref: string | null;
  notice_ref: string | null;
  cure_ref: string | null;
  review_ref: string | null;
  confirmation_ref: string | null;
  assessment_ref: string | null;
  agreement_ref: string | null;
  dispute_ref: string | null;
  resolution_ref: string | null;
  settlement_ref: string | null;
  closure_ref: string | null;
  reinstatement_ref: string | null;
  withdrawal_ref: string | null;
  regulator_ref: string | null;
  trigger_basis: string | null;
  notice_basis: string | null;
  cure_basis: string | null;
  review_basis: string | null;
  confirmation_basis: string | null;
  assessment_basis: string | null;
  agreement_basis: string | null;
  dispute_basis: string | null;
  resolution_basis: string | null;
  settlement_basis: string | null;
  reinstatement_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  dispute_round: number;
  chain_status: ChainStatus;
  termination_triggered_at: string;
  notice_served_at: string | null;
  cure_period_at: string | null;
  termination_review_at: string | null;
  termination_confirmed_at: string | null;
  eta_assessment_at: string | null;
  eta_agreed_at: string | null;
  disputed_at: string | null;
  settlement_pending_at: string | null;
  closed_at: string | null;
  reinstated_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
}

interface TerminationEvent {
  id: string;
  termination_id: string;
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
  in_cure: number;
  in_assessment: number;
  in_dispute: number;
  breached: number;
  reportable_total: number;
  involuntary_total: number;
  large_tier_open: number;
  total_buyout_zar_m: number;
  settled_buyout_zar_m: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  termination_triggered: { bg: '#e3e7ec', fg: '#557',    label: 'Triggered' },
  notice_served:         { bg: '#dbecfb', fg: '#1a3a5c', label: 'Notice served' },
  cure_period:           { bg: '#fff4d6', fg: '#a06200', label: 'Cure period' },
  termination_review:    { bg: '#fff4d6', fg: '#8a4a00', label: 'Termination review' },
  termination_confirmed: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Confirmed' },
  eta_assessment:        { bg: '#dbecfb', fg: '#1a3a5c', label: 'ETA assessment' },
  eta_agreed:            { bg: '#d4edda', fg: '#155724', label: 'ETA agreed' },
  disputed:              { bg: '#ffe4e1', fg: '#a04040', label: 'Disputed' },
  settlement_pending:    { bg: '#fde7c2', fg: '#8a4a00', label: 'Settlement pending' },
  closed:                { bg: '#daf5e2', fg: '#1f6b3a', label: 'Closed' },
  reinstated:            { bg: '#daf5e2', fg: '#1f6b3a', label: 'Reinstated' },
  withdrawn:             { bg: '#ede0e0', fg: '#6b3a3a', label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
  moderate: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate' },
  material: { bg: '#fff4d6', fg: '#8a4a00', label: 'Material' },
  major:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Major' },
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
};

const CAUSE_LABEL: Record<Cause, string> = {
  seller_default:          'Seller default',
  buyer_default:           'Buyer default',
  no_fault:                'No fault (mutual)',
  change_in_law:           'Change in law',
  prolonged_force_majeure: 'Prolonged FM',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active_open',           label: 'Open' },
  { key: 'all',                   label: 'All' },
  { key: 'minor',                 label: 'Minor' },
  { key: 'moderate',              label: 'Moderate' },
  { key: 'material',              label: 'Material' },
  { key: 'major',                 label: 'Major' },
  { key: 'critical',              label: 'Critical' },
  { key: 'involuntary',           label: 'Involuntary' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'termination_triggered', label: 'Triggered' },
  { key: 'notice_served',         label: 'Notice' },
  { key: 'cure_period',           label: 'Cure' },
  { key: 'termination_review',    label: 'Review' },
  { key: 'termination_confirmed', label: 'Confirmed' },
  { key: 'eta_assessment',        label: 'Assessment' },
  { key: 'eta_agreed',            label: 'Agreed' },
  { key: 'disputed',              label: 'Disputed' },
  { key: 'settlement_pending',    label: 'Settlement' },
  { key: 'closed',                label: 'Closed' },
  { key: 'reinstated',            label: 'Reinstated' },
  { key: 'withdrawn',             label: 'Withdrawn' },
];

type ActionKind =
  | 'serve-notice' | 'open-cure' | 'confirm-cure' | 'escalate-review'
  | 'confirm-termination' | 'open-eta-assessment' | 'agree-eta' | 'dispute-eta'
  | 'resolve-dispute' | 'initiate-settlement' | 'confirm-settlement' | 'withdraw';

// Primary forward action per state. The branch states surface their secondary
// actions (escalate / dispute / withdraw) in the drawer.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  termination_triggered: 'serve-notice',
  notice_served:         'open-cure',
  cure_period:           'confirm-cure',
  termination_review:    'confirm-termination',
  termination_confirmed: 'open-eta-assessment',
  eta_assessment:        'agree-eta',
  eta_agreed:            'initiate-settlement',
  disputed:              'resolve-dispute',
  settlement_pending:    'confirm-settlement',
  closed:                null,
  reinstated:            null,
  withdrawn:             null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'serve-notice':        'Serve notice (offtaker)',
  'open-cure':           'Open cure period (offtaker)',
  'confirm-cure':        'Confirm cure → reinstate (offtaker)',
  'escalate-review':     'Escalate to termination review (offtaker)',
  'confirm-termination': 'Confirm termination (offtaker)',
  'open-eta-assessment': 'Open ETA assessment (offtaker)',
  'agree-eta':           'Agree buy-out (offtaker)',
  'dispute-eta':         'Dispute buy-out (seller / IPP)',
  'resolve-dispute':     'Resolve dispute (independent expert)',
  'initiate-settlement': 'Initiate settlement (offtaker)',
  'confirm-settlement':  'Confirm settlement → close (offtaker)',
  'withdraw':            'Withdraw termination (offtaker)',
};

const WITHDRAW_FROM: ChainStatus[] = [
  'termination_triggered', 'notice_served', 'cure_period', 'termination_review',
];
const TERMINAL_STATES: ChainStatus[] = ['closed', 'reinstated', 'withdrawn'];

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

// Amounts are stored in ZAR millions.
function fmtZarM(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1000) return `R${(n / 1000).toFixed(2)}bn`;
  return `R${n.toFixed(1)}m`;
}

export function PpaTerminationChainTab() {
  const [rows, setRows] = useState<TerminationRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active_open');
  const [selected, setSelected] = useState<TerminationRow | null>(null);
  const [events, setEvents] = useState<TerminationEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: TerminationRow[] } & KpiSummary }>('/ppa-termination/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, closed_count: d.closed_count,
          in_cure: d.in_cure, in_assessment: d.in_assessment, in_dispute: d.in_dispute,
          breached: d.breached, reportable_total: d.reportable_total,
          involuntary_total: d.involuntary_total, large_tier_open: d.large_tier_open,
          total_buyout_zar_m: d.total_buyout_zar_m, settled_buyout_zar_m: d.settled_buyout_zar_m,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load PPA terminations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: TerminationRow; events: TerminationEvent[] } }>(
        `/ppa-termination/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load termination history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')         return true;
      if (filter === 'active_open') return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'minor')       return r.termination_tier === 'minor';
      if (filter === 'moderate')    return r.termination_tier === 'moderate';
      if (filter === 'material')    return r.termination_tier === 'material';
      if (filter === 'major')       return r.termination_tier === 'major';
      if (filter === 'critical')    return r.termination_tier === 'critical';
      if (filter === 'involuntary') return r.termination_cause !== 'no_fault';
      if (filter === 'breached')    return r.sla_breached;
      if (filter === 'reportable')  return r.is_reportable_flag;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: TerminationRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'serve-notice') {
        const ref = window.prompt('Notice reference (e.g. PTN-2026-014):');
        if (!ref) return;
        const basis = window.prompt('Notice basis — the termination event being notified:') || '';
        body = { notice_ref: ref, notice_basis: basis };
      } else if (action === 'open-cure') {
        const ref = window.prompt('Cure reference:');
        if (!ref) return;
        const basis = window.prompt('Cure basis — the cure required + the window granted:') || '';
        body = { cure_ref: ref, cure_basis: basis };
      } else if (action === 'confirm-cure') {
        const ref = window.prompt('Reinstatement reference (counterparty cured — PPA reinstated):');
        if (!ref) return;
        const basis = window.prompt('Reinstatement basis — confirmation the default was cured:') || '';
        body = { reinstatement_ref: ref, reinstatement_basis: basis, reason_code: 'cured' };
      } else if (action === 'escalate-review') {
        const ref = window.prompt('Review reference:');
        if (!ref) return;
        const basis = window.prompt('Review basis — why the matter proceeds to termination (no/failed cure):') || '';
        body = { review_ref: ref, review_basis: basis };
      } else if (action === 'confirm-termination') {
        const ref = window.prompt('Confirmation reference (PPA terminates):');
        if (!ref) return;
        const basis = window.prompt('Confirmation basis — the determination to terminate:');
        if (!basis) return;
        const reg = window.prompt('Regulator reference (NERSA security-of-supply notification), if any:') || '';
        body = { confirmation_ref: ref, confirmation_basis: basis };
        if (reg) body.regulator_ref = reg;
      } else if (action === 'open-eta-assessment') {
        const ref = window.prompt('Assessment reference (early-termination amount calculation):');
        if (!ref) return;
        const basis = window.prompt('Assessment basis — debt schedule / equity-IRR make-whole method:') || '';
        body = { assessment_ref: ref, assessment_basis: basis };
      } else if (action === 'agree-eta') {
        const ref = window.prompt('Agreement reference:');
        if (!ref) return;
        const buyout = window.prompt('Agreed buy-out / early-termination amount (ZAR millions) — drives the tier:', String(row.buyout_zar_m ?? ''));
        const debt = window.prompt('Senior debt outstanding component (ZAR millions):', String(row.debt_outstanding_zar_m ?? ''));
        const equity = window.prompt('Equity make-whole component (ZAR millions):', String(row.equity_makewhole_zar_m ?? ''));
        const basis = window.prompt('Agreement basis — how the buy-out was struck:') || '';
        body = { agreement_ref: ref, agreement_basis: basis };
        if (buyout) body.buyout_zar_m = Number(buyout);
        if (debt) body.debt_outstanding_zar_m = Number(debt);
        if (equity) body.equity_makewhole_zar_m = Number(equity);
      } else if (action === 'dispute-eta') {
        const ref = window.prompt('Dispute reference (seller / IPP disputes the calculated buy-out):');
        if (!ref) return;
        const basis = window.prompt('Dispute basis — why the seller contests the amount:');
        if (!basis) return;
        body = { dispute_ref: ref, dispute_basis: basis, reason_code: 'eta_disputed' };
      } else if (action === 'resolve-dispute') {
        const ref = window.prompt('Resolution reference (independent expert determination):');
        if (!ref) return;
        const buyout = window.prompt('Determined buy-out (ZAR millions) — re-derives the tier:', String(row.buyout_zar_m ?? ''));
        const basis = window.prompt('Resolution basis — the expert determination:') || '';
        body = { resolution_ref: ref, resolution_basis: basis };
        if (buyout) body.buyout_zar_m = Number(buyout);
      } else if (action === 'initiate-settlement') {
        const ref = window.prompt('Settlement reference:');
        if (!ref) return;
        const basis = window.prompt('Settlement basis — payment instruction / schedule:') || '';
        body = { settlement_ref: ref, settlement_basis: basis };
      } else if (action === 'confirm-settlement') {
        const ref = window.prompt('Closure reference (buy-out paid — clean close):');
        if (!ref) return;
        const settled = window.prompt('Amount settled (ZAR millions):', String(row.settlement_zar_m ?? row.buyout_zar_m ?? ''));
        const basis = window.prompt('Settlement basis — confirmation of payment:') || '';
        const reg = window.prompt('Regulator reference (large buy-out notification), if any:') || '';
        body = { closure_ref: ref, settlement_basis: basis };
        if (settled) body.settlement_zar_m = Number(settled);
        if (reg) body.regulator_ref = reg;
      } else if (action === 'withdraw') {
        const ref = window.prompt('Withdrawal reference (termination withdrawn before confirmation):');
        if (!ref) return;
        const basis = window.prompt('Withdrawal basis — why the termination is withdrawn:');
        if (!basis) return;
        body = { withdrawal_ref: ref, withdrawal_basis: basis, reason_code: 'withdrawn' };
      }
      await api.post(`/ppa-termination/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Offtaker PPA termination &amp; early-termination amount (buy-out)</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage P6 chain · triggered → notice served → cure period → termination review → confirmed → ETA assessment →
            ETA agreed → settlement → closed. The EXIT of the offtake relationship: a termination event arises, notice is
            served, a cure window runs, and — if uncured — the PPA terminates and an early-termination amount (the buy-out)
            is calculated, agreed and settled. The buy-out basis turns on the CAUSE: seller default / prolonged FM = debt
            only; buyer default / change in law = debt + equity make-whole; no-fault = negotiated. The seller (IPP) can
            dispute the calculated buy-out; an independent expert resolves it. MIXED SLA: cure / assessment / dispute
            windows INVERTED (bigger buy-out = longer), settlement URGENT (a larger agreed buy-out is paid faster for
            security of supply). Confirming a termination for an INVOLUNTARY cause crosses to the regulator inbox for every
            tier; a no-fault mutual termination + settlement + SLA breaches cross for major + critical.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="In cure" value={kpis?.in_cure ?? 0} tone={(kpis?.in_cure ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="In assessment" value={kpis?.in_assessment ?? 0} />
        <Kpi label="In dispute" value={kpis?.in_dispute ?? 0} tone={(kpis?.in_dispute ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Large open" value={kpis?.large_tier_open ?? 0} tone={(kpis?.large_tier_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Closed" value={kpis?.closed_count ?? 0} tone="ok" />
        <Kpi label="Involuntary" value={kpis?.involuntary_total ?? 0} tone={(kpis?.involuntary_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Buy-out total" value={fmtZarM(kpis?.total_buyout_zar_m)} />
        <Kpi label="Settled" value={fmtZarM(kpis?.settled_buyout_zar_m)} tone="ok" />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Case #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">PPA / offtaker</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Cause</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Buy-out</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.termination_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.case_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[280px] truncate" title={`${r.ppa_name} · ${r.offtaker_party_name}`}>
                      {r.ppa_name}
                      <span className="text-[#4a5568]"> · {r.seller_party_name}</span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{CAUSE_LABEL[r.termination_cause]}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtZarM(r.buyout_zar_m)}</td>
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No terminations match.</td></tr>
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
  row: TerminationRow;
  events: TerminationEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: TerminationRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canEscalate = row.chain_status === 'notice_served' || row.chain_status === 'cure_period';
  const canDispute = row.chain_status === 'eta_assessment' || row.chain_status === 'eta_agreed';
  const canWithdraw = WITHDRAW_FROM.includes(row.chain_status);

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
              <div className="text-base font-semibold text-[#0c2a4d]">{row.ppa_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.termination_tier].label} · {CAUSE_LABEL[row.termination_cause]} · offtaker {row.offtaker_party_name}
                {row.seller_party_name ? ` · seller ${row.seller_party_name}` : ''}
              </div>
              {row.plant_name && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  {row.plant_name}{row.technology ? ` · ${row.technology}` : ''}
                  {row.ppa_capacity_mw != null ? ` · ${row.ppa_capacity_mw} MW` : ''}
                  {row.remaining_term_months != null ? ` · ${row.remaining_term_months} mo remaining` : ''}
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
            <Pair label="State"            value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"             value={TIER_TONE[row.termination_tier].label} />
            <Pair label="Cause"            value={CAUSE_LABEL[row.termination_cause]} />
            <Pair label="ETA basis"        value={row.eta_basis} />
            <Pair label="PPA code"         value={row.ppa_code ?? '—'} />
            <Pair label="Currency"         value={row.ppa_currency ?? '—'} />
            <Pair label="Buy-out (ETA)"    value={fmtZarM(row.buyout_zar_m)} />
            <Pair label="Debt component"   value={fmtZarM(row.debt_outstanding_zar_m)} />
            <Pair label="Equity make-whole" value={fmtZarM(row.equity_makewhole_zar_m)} />
            <Pair label="Settled"          value={fmtZarM(row.settlement_zar_m)} />
            <Pair label="Independent expert" value={row.independent_party_name ?? '—'} />
            <Pair label="Dispute round"    value={String(row.dispute_round)} />
            <Pair label="Notice ref"       value={row.notice_ref ?? '—'} />
            <Pair label="Cure ref"         value={row.cure_ref ?? '—'} />
            <Pair label="Review ref"       value={row.review_ref ?? '—'} />
            <Pair label="Confirmation ref" value={row.confirmation_ref ?? '—'} />
            <Pair label="Assessment ref"   value={row.assessment_ref ?? '—'} />
            <Pair label="Agreement ref"    value={row.agreement_ref ?? '—'} />
            <Pair label="Dispute ref"      value={row.dispute_ref ?? '—'} />
            <Pair label="Resolution ref"   value={row.resolution_ref ?? '—'} />
            <Pair label="Settlement ref"   value={row.settlement_ref ?? '—'} />
            <Pair label="Closure ref"      value={row.closure_ref ?? '—'} />
            <Pair label="Regulator ref"    value={row.regulator_ref ?? '—'} />
            <Pair label="Reason code"      value={row.reason_code ?? '—'} />
            <Pair label="Triggered at"     value={fmtDate(row.termination_triggered_at)} />
            <Pair label="Notice at"        value={fmtDate(row.notice_served_at)} />
            <Pair label="Cure at"          value={fmtDate(row.cure_period_at)} />
            <Pair label="Review at"        value={fmtDate(row.termination_review_at)} />
            <Pair label="Confirmed at"     value={fmtDate(row.termination_confirmed_at)} />
            <Pair label="Assessment at"    value={fmtDate(row.eta_assessment_at)} />
            <Pair label="Agreed at"        value={fmtDate(row.eta_agreed_at)} />
            <Pair label="Settlement at"    value={fmtDate(row.settlement_pending_at)} />
            <Pair label="Closed at"        value={fmtDate(row.closed_at)} />
            <Pair label="SLA deadline"     value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"       value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"   value={String(row.escalation_level)} />
            <Pair label="Reportable"       value={row.is_reportable_flag ? 'Yes' : 'No'} />
          </div>
          {row.notice_basis && <BasisBlock label="Notice basis" tone="#1a3a5c" text={row.notice_basis} />}
          {row.cure_basis && <BasisBlock label="Cure basis" tone="#a06200" text={row.cure_basis} />}
          {row.review_basis && <BasisBlock label="Review basis" tone="#8a4a00" text={row.review_basis} />}
          {row.confirmation_basis && <BasisBlock label="Confirmation basis" tone="#8a4a00" text={row.confirmation_basis} />}
          {row.assessment_basis && <BasisBlock label="Assessment basis" tone="#1a3a5c" text={row.assessment_basis} />}
          {row.agreement_basis && <BasisBlock label="Agreement basis" tone="#155724" text={row.agreement_basis} />}
          {row.dispute_basis && <BasisBlock label="Dispute basis" tone="#a04040" text={row.dispute_basis} />}
          {row.resolution_basis && <BasisBlock label="Resolution basis" tone="#1a3a5c" text={row.resolution_basis} />}
          {row.settlement_basis && <BasisBlock label="Settlement basis" tone="#8a4a00" text={row.settlement_basis} />}
          {row.reinstatement_basis && <BasisBlock label="Reinstatement basis" tone="#155724" text={row.reinstatement_basis} />}
          {row.withdrawal_basis && <BasisBlock label="Withdrawal basis" tone="#6b3a3a" text={row.withdrawal_basis} />}
          {row.notes && <BasisBlock label="Notes" tone="#4a5568" text={row.notes} />}
        </section>

        {(nextAction || canEscalate || canDispute || canWithdraw) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canEscalate && (
                <button type="button"
                  onClick={() => onAct('escalate-review', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#8a4a00] hover:bg-[#fff8e6]"
                >
                  {ACTION_LABEL['escalate-review']}
                </button>
              )}
              {canDispute && (
                <button type="button"
                  onClick={() => onAct('dispute-eta', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['dispute-eta']}
                </button>
              )}
              {canWithdraw && (
                <button type="button"
                  onClick={() => onAct('withdraw', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b3a3a] hover:bg-[#f3eded]"
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
