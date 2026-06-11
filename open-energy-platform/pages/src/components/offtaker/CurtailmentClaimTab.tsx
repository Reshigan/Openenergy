// Wave 46 — Offtaker PPA Curtailment / Deemed-Energy Compensation lifecycle tab.
//
// 12-state P6 chain on oe_curtailment_claims — the SUPPLY-side mirror of W32
// take-or-pay. When the buyer or System Operator curtails an AVAILABLE plant for
// economic / system-security / grid-constraint reasons NOT attributable to the
// IPP, the PPA compensates the seller for "deemed energy" — the MWh the plant
// WOULD have generated, valued at the PPA tariff. The buyer classifies, validates,
// proposes/agrees quantum and settles; the seller (IPP) prepares + submits the
// claim, disputes the quantum, and may withdraw. A classification gate diverts
// IPP-fault / force-majeure / scheduled events to non_compensable.
//
// URGENT SLA — utility_scale gets the TIGHTEST windows (debt-service depends on
// the deemed-energy cash flow). Reportability:
//   • refer_arbitration crosses for EVERY tier (universal hard line)
//   • reject_non_compensable + settle_compensation + SLA breaches cross for
//     utility_scale + commercial only
//
// Seller-write split: the seller (IPP) submits / disputes / withdraws; the buyer
// (offtaker) drives the classification / validation / quantum / settlement
// machinery. actor_party (seller / buyer / arbiter) is derived from the action.

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
  | 'curtailment_logged' | 'classification_review' | 'claim_prepared'
  | 'claim_submitted' | 'validation_underway' | 'quantum_proposed'
  | 'quantum_agreed' | 'compensation_settled' | 'disputed'
  | 'arbitrated' | 'non_compensable' | 'withdrawn';

type Tier = 'utility_scale' | 'commercial' | 'embedded';

interface ClaimRow {
  [key: string]: unknown;
  id: string;
  claim_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  seller_party_id: string;
  seller_party_name: string;
  buyer_party_name: string | null;
  arbiter_name: string | null;
  ppa_ref: string | null;
  facility_name: string;
  facility_tier: Tier;
  contracted_capacity_mw: number | null;
  tariff_per_mwh: number | null;
  curtailment_type: string | null;
  curtailment_event: string | null;
  curtailment_hours: number | null;
  deemed_energy_mwh: number | null;
  claimed_amount: number | null;
  proposed_amount: number | null;
  agreed_amount: number | null;
  settled_amount: number | null;
  log_ref: string | null;
  classification_ref: string | null;
  claim_ref: string | null;
  validation_ref: string | null;
  quantum_ref: string | null;
  settlement_ref: string | null;
  dispute_ref: string | null;
  arbitration_ref: string | null;
  log_basis: string | null;
  classification_basis: string | null;
  claim_basis: string | null;
  validation_basis: string | null;
  quantum_basis: string | null;
  settlement_basis: string | null;
  dispute_basis: string | null;
  arbitration_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: ChainStatus;
  curtailment_logged_at: string;
  classification_review_at: string | null;
  claim_prepared_at: string | null;
  claim_submitted_at: string | null;
  validation_underway_at: string | null;
  quantum_proposed_at: string | null;
  quantum_agreed_at: string | null;
  compensation_settled_at: string | null;
  disputed_at: string | null;
  arbitrated_at: string | null;
  non_compensable_at: string | null;
  withdrawn_at: string | null;
  dispute_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_reportable?: boolean;
}

interface KpiSummary {
  total: number;
  open_count: number;
  settled_count: number;
  non_compensable_count: number;
  arbitrated_count: number;
  withdrawn_count: number;
  disputed_count: number;
  breached: number;
  reportable_total: number;
  utility_open: number;
  total_claimed: number;
  total_proposed: number;
  total_agreed: number;
  total_settled: number;
  total_deemed_mwh: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'curtailment_logged',
  'classification_review',
  'claim_prepared',
  'claim_submitted',
  'validation_underway',
  'quantum_proposed',
  'quantum_agreed',
  'compensation_settled',
];
const BRANCH_STATES: readonly string[] = [
  'disputed',
  'arbitrated',
  'non_compensable',
  'withdrawn',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'Active' },
  { key: 'all',                   label: 'All' },
  { key: 'utility_scale',         label: 'Utility' },
  { key: 'commercial',            label: 'Commercial' },
  { key: 'embedded',              label: 'Embedded' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'curtailment_logged',    label: 'Logged' },
  { key: 'classification_review', label: 'Classifying' },
  { key: 'claim_prepared',        label: 'Prepared' },
  { key: 'claim_submitted',       label: 'Submitted' },
  { key: 'validation_underway',   label: 'Validating' },
  { key: 'quantum_proposed',      label: 'Quantum prop.' },
  { key: 'quantum_agreed',        label: 'Quantum agreed' },
  { key: 'compensation_settled',  label: 'Settled' },
  { key: 'disputed',              label: 'Disputed' },
  { key: 'arbitrated',            label: 'Arbitrated' },
  { key: 'non_compensable',       label: 'Non-comp.' },
  { key: 'withdrawn',             label: 'Withdrawn' },
];

// ── helpers ───────────────────────────────────────────────────────────────
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
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(1)}k`;
  return `R${n.toFixed(0)}`;
}

function fmtMwh(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(2)} GWh`;
  return `${n.toFixed(1)} MWh`;
}

const TERMINAL_STATES: ChainStatus[] = [
  'compensation_settled', 'arbitrated', 'non_compensable', 'withdrawn',
];

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: ClaimRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  // Primary forward actions per state
  if (s === 'curtailment_logged') {
    actions.push({
      key: 'begin-classification',
      label: 'Begin classification (buyer)',
      fields: [
        { key: 'classification_ref', label: 'Classification reference (e.g. CLASS-2026-014)', type: 'text', required: true },
        { key: 'curtailment_type', label: 'Curtailment type (economic / system_security / grid_constraint / network_outage)', type: 'text', required: false, placeholder: row.curtailment_type || 'economic' },
        { key: 'curtailment_event', label: 'Curtailment event label (e.g. Stage 4 load-shed 18:00-22:00)', type: 'text', required: false },
        { key: 'classification_basis', label: 'Classification basis — what is under review', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'classification_review') {
    actions.push({
      key: 'confirm-compensable',
      label: 'Confirm compensable (buyer)',
      fields: [
        { key: 'classification_basis', label: 'Confirmation basis — why this is buyer/SO-side (not IPP fault / FM / scheduled)', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
    // Branch: reject to non-compensable (utility_scale + commercial cross regulator)
    actions.push({
      key: 'reject-non-compensable',
      label: 'Reject — non-compensable (buyer)',
      fields: [
        { key: 'classification_basis', label: 'Rejection basis — why no deemed energy is owed (IPP fault / force majeure / scheduled)', type: 'textarea', required: true },
        { key: 'rod_notes', label: 'Record-of-decision notes', type: 'textarea', required: false },
      ],
      cascadeTo: ['regulator'],
      tone: 'danger' as const,
    });
  }

  if (s === 'claim_prepared') {
    actions.push({
      key: 'submit-claim',
      label: 'Submit claim (seller)',
      fields: [
        { key: 'claim_ref', label: 'Claim reference (e.g. CCLAIM-2026-014)', type: 'text', required: true },
        { key: 'deemed_energy_mwh', label: 'Deemed energy claimed (MWh)', type: 'number', required: true },
        { key: 'claimed_amount', label: `Claimed amount ZAR (tariff ${row.tariff_per_mwh ? 'R' + row.tariff_per_mwh + '/MWh' : 'n/a'})`, type: 'number', required: false },
        { key: 'claim_basis', label: 'Claim basis — methodology for the deemed-energy figure', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'claim_submitted') {
    actions.push({
      key: 'begin-validation',
      label: 'Begin validation (buyer)',
      fields: [
        { key: 'validation_ref', label: 'Validation reference', type: 'text', required: true },
        { key: 'validation_basis', label: 'Validation basis — SCADA / resource-model checks being run', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'validation_underway') {
    actions.push({
      key: 'propose-quantum',
      label: 'Propose quantum (buyer)',
      fields: [
        { key: 'quantum_ref', label: 'Quantum reference', type: 'text', required: true },
        { key: 'proposed_amount', label: `Proposed compensation ZAR (claimed was ${fmtZar(row.claimed_amount)})`, type: 'number', required: true },
        { key: 'quantum_basis', label: 'Quantum basis — adjustment vs the claim', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'quantum_proposed') {
    actions.push({
      key: 'agree-quantum',
      label: 'Agree quantum (buyer)',
      fields: [
        { key: 'agreed_amount', label: `Agreed compensation ZAR (proposed was ${fmtZar(row.proposed_amount)} — blank accepts proposed)`, type: 'number', required: false },
        { key: 'quantum_basis', label: 'Agreement basis / reason', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
    // Branch: dispute from quantum_proposed
    actions.push({
      key: 'dispute',
      label: 'Dispute quantum (seller)',
      fields: [
        { key: 'dispute_ref', label: 'Dispute reference (e.g. CCLAIM-DISPUTE-2026-004)', type: 'text', required: true },
        { key: 'dispute_basis', label: 'Dispute basis — what the seller challenges (deemed-MWh / tariff / adjustment)', type: 'textarea', required: true },
      ],
      cascadeTo: [],
      tone: 'danger' as const,
    });
  }

  if (s === 'quantum_agreed') {
    actions.push({
      key: 'settle-compensation',
      label: 'Settle compensation (buyer)',
      fields: [
        { key: 'settlement_ref', label: 'Settlement reference (payment / credit note)', type: 'text', required: true },
        { key: 'settled_amount', label: `Settled amount ZAR (agreed was ${fmtZar(row.agreed_amount)} — blank settles agreed)`, type: 'number', required: false },
        { key: 'rod_notes', label: 'Record-of-decision notes (value date, invoicing reference)', type: 'textarea', required: false },
      ],
      // settle_compensation crosses regulator for utility_scale + commercial
      cascadeTo: ['regulator'],
    });
    // Branch: dispute from quantum_agreed
    actions.push({
      key: 'dispute',
      label: 'Dispute quantum (seller)',
      fields: [
        { key: 'dispute_ref', label: 'Dispute reference (e.g. CCLAIM-DISPUTE-2026-004)', type: 'text', required: true },
        { key: 'dispute_basis', label: 'Dispute basis — what the seller challenges (deemed-MWh / tariff / adjustment)', type: 'textarea', required: true },
      ],
      cascadeTo: [],
      tone: 'danger' as const,
    });
  }

  if (s === 'disputed') {
    actions.push({
      key: 'recalculate',
      label: 'Recalculate quantum (buyer)',
      fields: [
        { key: 'quantum_ref', label: 'Recalculation quantum reference', type: 'text', required: true, placeholder: row.quantum_ref || '' },
        { key: 'proposed_amount', label: 'Revised proposed compensation ZAR', type: 'number', required: false, placeholder: String(row.proposed_amount ?? '') },
        { key: 'quantum_basis', label: 'Recalculation basis — what changed', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
    // Branch: refer to arbitration (crosses regulator EVERY tier)
    actions.push({
      key: 'refer-arbitration',
      label: 'Refer to arbitration',
      fields: [
        { key: 'arbitration_ref', label: 'Arbitration reference (e.g. AFSA-2026-0007)', type: 'text', required: true },
        { key: 'arbiter_name', label: 'Arbiter / forum (e.g. AFSA, NERSA tariff arbitration)', type: 'text', required: false },
        { key: 'arbitration_basis', label: 'Arbitration basis / referral note', type: 'textarea', required: false },
      ],
      cascadeTo: ['regulator'],
      tone: 'danger' as const,
    });
  }

  // Withdraw is available on all non-terminal states
  if (!TERMINAL_STATES.includes(s)) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw claim (seller)',
      fields: [
        { key: 'rod_notes', label: 'Withdrawal reason (e.g. superseded, claim abandoned)', type: 'textarea', required: true },
      ],
      cascadeTo: [],
      tone: 'danger' as const,
    });
  }

  return actions;
}

// ── detail panel ──────────────────────────────────────────────────────────
function renderDetail(row: ClaimRow): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="PPA ref"            value={row.ppa_ref ?? '—'} />
      <DetailPair label="Arbiter"            value={row.arbiter_name ?? '—'} />
      <DetailPair label="Curtailment type"   value={row.curtailment_type ?? '—'} />
      <DetailPair label="Curtailment event"  value={row.curtailment_event ?? '—'} />
      <DetailPair label="Curtailment hours"  value={row.curtailment_hours != null ? `${row.curtailment_hours} h` : '—'} />
      <DetailPair label="Tariff"             value={row.tariff_per_mwh != null ? `R${row.tariff_per_mwh}/MWh` : '—'} />
      <DetailPair label="Deemed energy"      value={fmtMwh(row.deemed_energy_mwh)} />
      <DetailPair label="Claimed"            value={fmtZar(row.claimed_amount)} />
      <DetailPair label="Proposed"           value={fmtZar(row.proposed_amount)} />
      <DetailPair label="Agreed"             value={fmtZar(row.agreed_amount)} />
      <DetailPair label="Settled"            value={fmtZar(row.settled_amount)} />
      <DetailPair label="Dispute round"      value={String(row.dispute_round)} />
      <DetailPair label="Classification ref" value={row.classification_ref ?? '—'} />
      <DetailPair label="Claim ref"          value={row.claim_ref ?? '—'} />
      <DetailPair label="Validation ref"     value={row.validation_ref ?? '—'} />
      <DetailPair label="Quantum ref"        value={row.quantum_ref ?? '—'} />
      <DetailPair label="Settlement ref"     value={row.settlement_ref ?? '—'} />
      <DetailPair label="Dispute ref"        value={row.dispute_ref ?? '—'} />
      <DetailPair label="Arbitration ref"    value={row.arbitration_ref ?? '—'} />
      <DetailPair label="Reason code"        value={row.reason_code ?? '—'} />
      <DetailPair label="Logged"             value={fmtDate(row.curtailment_logged_at)} />
      <DetailPair label="Classification"     value={fmtDate(row.classification_review_at)} />
      <DetailPair label="Claim prepared"     value={fmtDate(row.claim_prepared_at)} />
      <DetailPair label="Claim submitted"    value={fmtDate(row.claim_submitted_at)} />
      <DetailPair label="Validation"         value={fmtDate(row.validation_underway_at)} />
      <DetailPair label="Quantum proposed"   value={fmtDate(row.quantum_proposed_at)} />
      <DetailPair label="Quantum agreed"     value={fmtDate(row.quantum_agreed_at)} />
      <DetailPair label="Settled at"         value={fmtDate(row.compensation_settled_at)} />
      <DetailPair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
      <DetailPair label="SLA status"         value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
      <DetailPair label="Escalation lvl"     value={String(row.escalation_level)} />
      <DetailPair label="Reportable"         value={row.is_reportable ? 'Yes' : 'No'} />
      {row.source_wave && (
        <div className="col-span-2" style={{ color: TX2, fontSize: 11 }}>
          Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
        </div>
      )}
      {row.classification_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Classification basis</div>
          <div style={{ color: TX2 }}>{row.classification_basis}</div>
        </div>
      )}
      {row.claim_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Claim basis</div>
          <div style={{ color: TX2 }}>{row.claim_basis}</div>
        </div>
      )}
      {row.validation_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Validation basis</div>
          <div style={{ color: TX2 }}>{row.validation_basis}</div>
        </div>
      )}
      {row.quantum_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Quantum basis</div>
          <div style={{ color: TX2 }}>{row.quantum_basis}</div>
        </div>
      )}
      {row.settlement_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Settlement basis</div>
          <div style={{ color: TX2 }}>{row.settlement_basis}</div>
        </div>
      )}
      {row.dispute_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Dispute basis</div>
          <div style={{ color: TX2 }}>{row.dispute_basis}</div>
        </div>
      )}
      {row.arbitration_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Arbitration basis</div>
          <div style={{ color: TX2 }}>{row.arbitration_basis}</div>
        </div>
      )}
      {row.rod_notes && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Record of decision</div>
          <div style={{ color: TX2 }}>{row.rod_notes}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function CurtailmentClaimTab() {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get<{ data: { items: ClaimRow[] } & KpiSummary }>('/curtailment-claim/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        setSummary({
          total: d.total,
          open_count: d.open_count,
          settled_count: d.settled_count,
          non_compensable_count: d.non_compensable_count,
          arbitrated_count: d.arbitrated_count,
          withdrawn_count: d.withdrawn_count,
          disputed_count: d.disputed_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          utility_open: d.utility_open,
          total_claimed: d.total_claimed,
          total_proposed: d.total_proposed,
          total_agreed: d.total_agreed,
          total_settled: d.total_settled,
          total_deemed_mwh: d.total_deemed_mwh,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load curtailment claims');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/curtailment-claim/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/curtailment-claim/chain/${rowId}`);
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
      const res = await api.get<{ data: { events: ChainEvent[] } }>(`/curtailment-claim/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === 'all')           return true;
      if (filter === 'active')        return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'utility_scale') return r.facility_tier === 'utility_scale';
      if (filter === 'commercial')    return r.facility_tier === 'commercial';
      if (filter === 'embedded')      return r.facility_tier === 'embedded';
      if (filter === 'breached')      return !!r.sla_breached;
      if (filter === 'reportable')    return !!r.is_reportable;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, open_count: 0, settled_count: 0, non_compensable_count: 0,
    arbitrated_count: 0, withdrawn_count: 0, disputed_count: 0, breached: 0,
    reportable_total: 0, utility_open: 0, total_claimed: 0, total_proposed: 0,
    total_agreed: 0, total_settled: 0, total_deemed_mwh: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Offtaker PPA curtailment / deemed-energy compensation</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-stage P6 chain · curtailment logged → classification review → claim prepared → claim submitted → validation
          underway → quantum proposed → quantum agreed → compensation settled. A classification gate diverts IPP-fault /
          force-majeure / scheduled events to non-compensable; quantum disputes branch through recalculation, re-proposal
          and arbitration. URGENT SLA: utility-scale tightest. Arbitration crosses to the regulator inbox for every tier;
          denied claims, settlements + SLA breaches cross for utility-scale + commercial.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"        value={kpis.total} />
        <KpiTile label="Open"         value={kpis.open_count} />
        <KpiTile label="Utility open" value={kpis.utility_open}          tone={kpis.utility_open > 0 ? 'warn' : undefined} />
        <KpiTile label="In dispute"   value={kpis.disputed_count}        tone={kpis.disputed_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Settled"      value={kpis.settled_count} />
        <KpiTile label="Non-comp."    value={kpis.non_compensable_count} tone={kpis.non_compensable_count > 0 ? 'warn' : undefined} />
        <KpiTile label="SLA breached" value={kpis.breached}              tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Arbitrated"   value={kpis.arbitrated_count}      tone={kpis.arbitrated_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Reportable"   value={kpis.reportable_total}      tone={kpis.reportable_total > 0 ? 'warn' : undefined} />
        <KpiTile label="Deemed energy" value={fmtMwh(kpis.total_deemed_mwh)} />
        <KpiTile label="Claimed"      value={fmtZar(kpis.total_claimed)} />
        <KpiTile label="Settled value" value={fmtZar(kpis.total_settled)} />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{ background: filter === f.key ? ACC : BG2, color: filter === f.key ? '#fff' : TX2, border: `1px solid ${filter === f.key ? ACC : BORDER}` }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>{err}</div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>Loading...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => {
            const shownValue = row.settled_amount ?? row.agreed_amount ?? row.proposed_amount ?? row.claimed_amount;
            return (
              <ChainCard
                key={row.id}
                item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={row.claim_number}
                meta={`${row.facility_tier.replace('_', ' ')} · ${row.facility_name} · ${row.seller_party_name}${shownValue != null ? ' · ' + fmtZar(shownValue) : ''}`}
                actions={getActions(row)}
                onAction={(key, values) => handleAction(row.id, key, values)}
                cascadeTo={[]}
                detail={renderDetail(row)}
                events={expandedEvents[row.id]}
                onExpand={handleExpand}
              />
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No claims match.</div>
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
      <div style={{ color: TX1, fontSize: 11 }}>{value}</div>
    </div>
  );
}

export default CurtailmentClaimTab;
