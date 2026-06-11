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
  | 'termination_triggered' | 'notice_served' | 'cure_period' | 'termination_review'
  | 'termination_confirmed' | 'eta_assessment' | 'eta_agreed' | 'disputed'
  | 'settlement_pending' | 'closed' | 'reinstated' | 'withdrawn';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';
type Cause = 'seller_default' | 'buyer_default' | 'no_fault' | 'change_in_law' | 'prolonged_force_majeure';

interface TerminationRow {
  [key: string]: unknown;
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

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'termination_triggered',
  'notice_served',
  'cure_period',
  'termination_review',
  'termination_confirmed',
  'eta_assessment',
  'eta_agreed',
  'disputed',
  'settlement_pending',
  'closed',
];
const BRANCH_STATES: readonly string[] = [
  'reinstated',
  'withdrawn',
];

// ── filters ───────────────────────────────────────────────────────────────
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

const TERMINAL_STATES: ChainStatus[] = ['closed', 'reinstated', 'withdrawn'];
const WITHDRAW_FROM: ChainStatus[] = [
  'termination_triggered', 'notice_served', 'cure_period', 'termination_review',
];

const CAUSE_LABEL: Record<Cause, string> = {
  seller_default:          'Seller default',
  buyer_default:           'Buyer default',
  no_fault:                'No fault (mutual)',
  change_in_law:           'Change in law',
  prolonged_force_majeure: 'Prolonged FM',
};

// ── format helpers ────────────────────────────────────────────────────────
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

// ── action builder ────────────────────────────────────────────────────────
function getActions(row: TerminationRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const st = row.chain_status;

  // serve-notice: termination_triggered
  if (st === 'termination_triggered') {
    actions.push({
      key: 'serve-notice',
      label: 'Serve notice (offtaker)',
      fields: [
        { key: 'notice_ref', label: 'Notice reference (e.g. PTN-2026-014)', type: 'text', required: true, placeholder: '' },
        { key: 'notice_basis', label: 'Notice basis — the termination event being notified', type: 'textarea', required: false, placeholder: '' },
      ],
    });
  }

  // open-cure: notice_served (primary forward action)
  if (st === 'notice_served') {
    actions.push({
      key: 'open-cure',
      label: 'Open cure period (offtaker)',
      fields: [
        { key: 'cure_ref', label: 'Cure reference', type: 'text', required: true, placeholder: '' },
        { key: 'cure_basis', label: 'Cure basis — the cure required + the window granted', type: 'textarea', required: false, placeholder: '' },
      ],
    });
  }

  // confirm-cure: cure_period (primary forward action)
  if (st === 'cure_period') {
    actions.push({
      key: 'confirm-cure',
      label: 'Confirm cure → reinstate (offtaker)',
      fields: [
        { key: 'reinstatement_ref', label: 'Reinstatement reference (counterparty cured — PPA reinstated)', type: 'text', required: true, placeholder: '' },
        { key: 'reinstatement_basis', label: 'Reinstatement basis — confirmation the default was cured', type: 'textarea', required: false, placeholder: '' },
      ],
    });
  }

  // escalate-review: notice_served or cure_period (secondary action)
  if (st === 'notice_served' || st === 'cure_period') {
    actions.push({
      key: 'escalate-review',
      label: 'Escalate to termination review (offtaker)',
      fields: [
        { key: 'review_ref', label: 'Review reference', type: 'text', required: true, placeholder: '' },
        { key: 'review_basis', label: 'Review basis — why the matter proceeds to termination (no/failed cure)', type: 'textarea', required: false, placeholder: '' },
      ],
    });
  }

  // confirm-termination: termination_review
  if (st === 'termination_review') {
    actions.push({
      key: 'confirm-termination',
      label: 'Confirm termination (offtaker)',
      // confirm_termination crosses regulator EVERY tier when cause is INVOLUNTARY
      cascadeTo: ['regulator'],
      fields: [
        { key: 'confirmation_ref', label: 'Confirmation reference (PPA terminates)', type: 'text', required: true, placeholder: '' },
        { key: 'confirmation_basis', label: 'Confirmation basis — the determination to terminate', type: 'textarea', required: true, placeholder: '' },
        { key: 'regulator_ref', label: 'Regulator reference (NERSA security-of-supply notification), if any', type: 'text', required: false, placeholder: '' },
      ],
    });
  }

  // open-eta-assessment: termination_confirmed
  if (st === 'termination_confirmed') {
    actions.push({
      key: 'open-eta-assessment',
      label: 'Open ETA assessment (offtaker)',
      fields: [
        { key: 'assessment_ref', label: 'Assessment reference (early-termination amount calculation)', type: 'text', required: true, placeholder: '' },
        { key: 'assessment_basis', label: 'Assessment basis — debt schedule / equity-IRR make-whole method', type: 'textarea', required: false, placeholder: '' },
      ],
    });
  }

  // agree-eta: eta_assessment (primary) + dispute-eta secondary
  if (st === 'eta_assessment') {
    actions.push({
      key: 'agree-eta',
      label: 'Agree buy-out (offtaker)',
      fields: [
        { key: 'agreement_ref', label: 'Agreement reference', type: 'text', required: true, placeholder: '' },
        { key: 'buyout_zar_m', label: 'Agreed buy-out / early-termination amount (ZAR millions) — drives the tier', type: 'number', required: false, placeholder: String(row.buyout_zar_m ?? '') },
        { key: 'debt_outstanding_zar_m', label: 'Senior debt outstanding component (ZAR millions)', type: 'number', required: false, placeholder: String(row.debt_outstanding_zar_m ?? '') },
        { key: 'equity_makewhole_zar_m', label: 'Equity make-whole component (ZAR millions)', type: 'number', required: false, placeholder: String(row.equity_makewhole_zar_m ?? '') },
        { key: 'agreement_basis', label: 'Agreement basis — how the buy-out was struck', type: 'textarea', required: false, placeholder: '' },
      ],
    });
    actions.push({
      key: 'dispute-eta',
      label: 'Dispute buy-out (seller / IPP)',
      fields: [
        { key: 'dispute_ref', label: 'Dispute reference (seller / IPP disputes the calculated buy-out)', type: 'text', required: true, placeholder: '' },
        { key: 'dispute_basis', label: 'Dispute basis — why the seller contests the amount', type: 'textarea', required: true, placeholder: '' },
      ],
    });
  }

  // eta_agreed: dispute-eta secondary
  if (st === 'eta_agreed') {
    actions.push({
      key: 'initiate-settlement',
      label: 'Initiate settlement (offtaker)',
      fields: [
        { key: 'settlement_ref', label: 'Settlement reference', type: 'text', required: true, placeholder: '' },
        { key: 'settlement_basis', label: 'Settlement basis — payment instruction / schedule', type: 'textarea', required: false, placeholder: '' },
      ],
    });
    actions.push({
      key: 'dispute-eta',
      label: 'Dispute buy-out (seller / IPP)',
      fields: [
        { key: 'dispute_ref', label: 'Dispute reference (seller / IPP disputes the calculated buy-out)', type: 'text', required: true, placeholder: '' },
        { key: 'dispute_basis', label: 'Dispute basis — why the seller contests the amount', type: 'textarea', required: true, placeholder: '' },
      ],
    });
  }

  // resolve-dispute: disputed
  if (st === 'disputed') {
    actions.push({
      key: 'resolve-dispute',
      label: 'Resolve dispute (independent expert)',
      fields: [
        { key: 'resolution_ref', label: 'Resolution reference (independent expert determination)', type: 'text', required: true, placeholder: '' },
        { key: 'buyout_zar_m', label: 'Determined buy-out (ZAR millions) — re-derives the tier', type: 'number', required: false, placeholder: String(row.buyout_zar_m ?? '') },
        { key: 'resolution_basis', label: 'Resolution basis — the expert determination', type: 'textarea', required: false, placeholder: '' },
      ],
    });
  }

  // confirm-settlement: settlement_pending — crosses regulator for major + critical
  if (st === 'settlement_pending') {
    actions.push({
      key: 'confirm-settlement',
      label: 'Confirm settlement → close (offtaker)',
      cascadeTo: ['regulator'],
      fields: [
        { key: 'closure_ref', label: 'Closure reference (buy-out paid — clean close)', type: 'text', required: true, placeholder: '' },
        { key: 'settlement_zar_m', label: 'Amount settled (ZAR millions)', type: 'number', required: false, placeholder: String(row.settlement_zar_m ?? row.buyout_zar_m ?? '') },
        { key: 'settlement_basis', label: 'Settlement basis — confirmation of payment', type: 'textarea', required: false, placeholder: '' },
        { key: 'regulator_ref', label: 'Regulator reference (large buy-out notification), if any', type: 'text', required: false, placeholder: '' },
      ],
    });
  }

  // withdraw: termination_triggered / notice_served / cure_period / termination_review
  if (WITHDRAW_FROM.includes(st)) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw termination (offtaker)',
      fields: [
        { key: 'withdrawal_ref', label: 'Withdrawal reference (termination withdrawn before confirmation)', type: 'text', required: true, placeholder: '' },
        { key: 'withdrawal_basis', label: 'Withdrawal basis — why the termination is withdrawn', type: 'textarea', required: true, placeholder: '' },
      ],
    });
  }

  return actions;
}

// ── detail panel ──────────────────────────────────────────────────────────
function renderDetail(row: TerminationRow): React.ReactNode {
  return (
    <div style={{ fontSize: 11, color: TX2 }}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5" style={{ marginBottom: 8 }}>
        <DetailPair label="Case #" value={row.case_number} />
        <DetailPair label="Cause" value={CAUSE_LABEL[row.termination_cause]} />
        <DetailPair label="ETA basis" value={row.eta_basis} />
        <DetailPair label="PPA code" value={row.ppa_code ?? '—'} />
        <DetailPair label="Currency" value={row.ppa_currency ?? '—'} />
        <DetailPair label="Buy-out (ETA)" value={fmtZarM(row.buyout_zar_m)} />
        <DetailPair label="Debt component" value={fmtZarM(row.debt_outstanding_zar_m)} />
        <DetailPair label="Equity make-whole" value={fmtZarM(row.equity_makewhole_zar_m)} />
        <DetailPair label="Settled" value={fmtZarM(row.settlement_zar_m)} />
        <DetailPair label="Independent expert" value={row.independent_party_name ?? '—'} />
        <DetailPair label="Dispute round" value={String(row.dispute_round)} />
        <DetailPair label="Plant" value={row.plant_name ?? '—'} />
        <DetailPair label="Technology" value={row.technology ?? '—'} />
        <DetailPair label="Capacity (MW)" value={row.ppa_capacity_mw != null ? String(row.ppa_capacity_mw) : '—'} />
        <DetailPair label="Remaining term (mo)" value={row.remaining_term_months != null ? String(row.remaining_term_months) : '—'} />
        <DetailPair label="Offtaker" value={row.offtaker_party_name} />
        <DetailPair label="Seller" value={row.seller_party_name} />
        <DetailPair label="Notice ref" value={row.notice_ref ?? '—'} />
        <DetailPair label="Cure ref" value={row.cure_ref ?? '—'} />
        <DetailPair label="Review ref" value={row.review_ref ?? '—'} />
        <DetailPair label="Confirmation ref" value={row.confirmation_ref ?? '—'} />
        <DetailPair label="Assessment ref" value={row.assessment_ref ?? '—'} />
        <DetailPair label="Agreement ref" value={row.agreement_ref ?? '—'} />
        <DetailPair label="Dispute ref" value={row.dispute_ref ?? '—'} />
        <DetailPair label="Resolution ref" value={row.resolution_ref ?? '—'} />
        <DetailPair label="Settlement ref" value={row.settlement_ref ?? '—'} />
        <DetailPair label="Closure ref" value={row.closure_ref ?? '—'} />
        <DetailPair label="Regulator ref" value={row.regulator_ref ?? '—'} />
        <DetailPair label="Reason code" value={row.reason_code ?? '—'} />
        <DetailPair label="Triggered at" value={fmtDate(row.termination_triggered_at)} />
        <DetailPair label="Notice at" value={fmtDate(row.notice_served_at)} />
        <DetailPair label="Cure at" value={fmtDate(row.cure_period_at)} />
        <DetailPair label="Review at" value={fmtDate(row.termination_review_at)} />
        <DetailPair label="Confirmed at" value={fmtDate(row.termination_confirmed_at)} />
        <DetailPair label="Assessment at" value={fmtDate(row.eta_assessment_at)} />
        <DetailPair label="Agreed at" value={fmtDate(row.eta_agreed_at)} />
        <DetailPair label="Settlement at" value={fmtDate(row.settlement_pending_at)} />
        <DetailPair label="Closed at" value={fmtDate(row.closed_at)} />
        <DetailPair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA status" value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Escalation lvl" value={String(row.escalation_level)} />
        <DetailPair label="Reportable" value={row.is_reportable_flag ? 'Yes' : 'No'} />
        {row.source_wave && <DetailPair label="Source wave" value={row.source_wave + (row.source_entity_id ? ` · ${row.source_entity_id}` : '')} />}
      </div>
      {row.notice_basis && (
        <BasisBlock label="Notice basis" text={row.notice_basis} />
      )}
      {row.cure_basis && (
        <BasisBlock label="Cure basis" text={row.cure_basis} />
      )}
      {row.review_basis && (
        <BasisBlock label="Review basis" text={row.review_basis} />
      )}
      {row.confirmation_basis && (
        <BasisBlock label="Confirmation basis" text={row.confirmation_basis} />
      )}
      {row.assessment_basis && (
        <BasisBlock label="Assessment basis" text={row.assessment_basis} />
      )}
      {row.agreement_basis && (
        <BasisBlock label="Agreement basis" text={row.agreement_basis} />
      )}
      {row.dispute_basis && (
        <BasisBlock label="Dispute basis" text={row.dispute_basis} />
      )}
      {row.resolution_basis && (
        <BasisBlock label="Resolution basis" text={row.resolution_basis} />
      )}
      {row.settlement_basis && (
        <BasisBlock label="Settlement basis" text={row.settlement_basis} />
      )}
      {row.reinstatement_basis && (
        <BasisBlock label="Reinstatement basis" text={row.reinstatement_basis} />
      )}
      {row.withdrawal_basis && (
        <BasisBlock label="Withdrawal basis" text={row.withdrawal_basis} />
      )}
      {row.notes && (
        <BasisBlock label="Notes" text={row.notes} />
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function PpaTerminationChainTab() {
  const [rows, setRows] = useState<TerminationRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active_open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: TerminationRow[] } & KpiSummary }>('/ppa-termination/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        setSummary({
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

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/ppa-termination/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ppa-termination/chain/${rowId}`);
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
      const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ppa-termination/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

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
      if (filter === 'breached')    return !!r.sla_breached;
      if (filter === 'reportable')  return !!r.is_reportable_flag;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, open_count: 0, closed_count: 0,
    in_cure: 0, in_assessment: 0, in_dispute: 0,
    breached: 0, reportable_total: 0, involuntary_total: 0, large_tier_open: 0,
    total_buyout_zar_m: 0, settled_buyout_zar_m: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>
          Offtaker PPA termination &amp; early-termination amount (buy-out)
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
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
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total" value={kpis.total} />
        <KpiTile label="Open" value={kpis.open_count} />
        <KpiTile label="In cure" value={kpis.in_cure} tone={kpis.in_cure > 0 ? 'warn' : undefined} />
        <KpiTile label="In assessment" value={kpis.in_assessment} />
        <KpiTile label="In dispute" value={kpis.in_dispute} tone={kpis.in_dispute > 0 ? 'bad' : undefined} />
        <KpiTile label="Large open" value={kpis.large_tier_open} tone={kpis.large_tier_open > 0 ? 'warn' : undefined} />
        <KpiTile label="Closed" value={kpis.closed_count} tone="ok" />
        <KpiTile label="Involuntary" value={kpis.involuntary_total} tone={kpis.involuntary_total > 0 ? 'warn' : undefined} />
        <KpiTile label="Reportable" value={kpis.reportable_total} tone={kpis.reportable_total > 0 ? 'warn' : undefined} />
        <KpiTile label="SLA breached" value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Buy-out total" value={fmtZarM(kpis.total_buyout_zar_m)} />
        <KpiTile label="Settled" value={fmtZarM(kpis.settled_buyout_zar_m)} tone="ok" />
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
        <div className="mb-3 rounded border px-3 py-2 text-[11px]"
          style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]"
          style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
          Loading...
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={row.ppa_name}
              meta={`${row.termination_tier.charAt(0).toUpperCase() + row.termination_tier.slice(1)} · ${CAUSE_LABEL[row.termination_cause]} · ${row.case_number}`}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]"
              style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No terminations match.
            </div>
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

function BasisBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="col-span-2 rounded border px-2 py-1.5 mt-2" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{text}</div>
    </div>
  );
}

export default PpaTerminationChainTab;
