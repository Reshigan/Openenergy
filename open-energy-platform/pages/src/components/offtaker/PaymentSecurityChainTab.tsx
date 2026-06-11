// Wave 54 — Offtaker PPA Payment Security / Credit Support Instrument lifecycle tab.
//
// 12-state P6 chain on oe_ppa_payment_securities — the financial-assurance
// backbone of a bankable PPA. The BUYER (offtaker) posts and maintains a payment-
// security instrument (letter of credit / on-demand bank guarantee / parent
// guarantee) sized to its rolling payment exposure; the SELLER (IPP beneficiary or
// facility agent) verifies it, activates it, runs periodic adequacy review, draws
// down on a buyer payment default, forfeits an un-replenished instrument, and
// releases it at PPA term. The buyer-side credit-support counterpart to the
// seller-side bonds in W10.
//
// URGENT SLA — the larger the secured exposure, the TIGHTER every window.
// Reportability (the W54 signature):
//   • forfeit crosses the regulator for EVERY tier (security-of-supply red flag)
//   • initiate_drawdown + reject_instrument cross for major + critical only
//   • SLA breaches cross for major + critical only
//
// Two-party split write: the offtaker posts / re-posts the instrument
// (submit-instrument); the seller administers everything else. actor_party
// (offtaker / seller) is derived from the action.

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
  | 'security_required' | 'instrument_submitted' | 'under_verification'
  | 'active' | 'adequacy_review' | 'drawdown_initiated'
  | 'replenishment_pending' | 'expiry_pending' | 'substitution_pending'
  | 'released' | 'forfeited' | 'rejected';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

interface SecurityRow {
  [key: string]: unknown;
  id: string;
  security_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  offtaker_party_id: string;
  offtaker_party_name: string;
  seller_party_name: string | null;
  agent_name: string | null;
  security_tier: Tier;
  instrument_name: string;
  instrument_type: string | null;
  issuer_name: string | null;
  issuer_rating: string | null;
  secured_amount_zar_m: number | null;
  required_amount_zar_m: number | null;
  cover_months: number | null;
  ppa_id: string | null;
  ppa_reference: string | null;
  project_id: string | null;
  project_name: string | null;
  sector: string | null;
  expiry_date: string | null;
  drawn_amount_zar_m: number | null;
  outstanding_invoice_zar_m: number | null;
  replenishment_due_zar_m: number | null;
  adequacy_shortfall_zar_m: number | null;
  drawdown_count: number;
  submission_ref: string | null;
  verification_ref: string | null;
  activation_ref: string | null;
  adequacy_ref: string | null;
  drawdown_ref: string | null;
  replenishment_ref: string | null;
  expiry_ref: string | null;
  release_ref: string | null;
  forfeit_ref: string | null;
  reject_ref: string | null;
  regulator_ref: string | null;
  submission_basis: string | null;
  verification_basis: string | null;
  activation_basis: string | null;
  adequacy_basis: string | null;
  drawdown_basis: string | null;
  replenishment_basis: string | null;
  expiry_basis: string | null;
  release_basis: string | null;
  forfeit_basis: string | null;
  reason_code: string | null;
  decision_notes: string | null;
  notes: string | null;
  chain_status: ChainStatus;
  security_required_at: string;
  instrument_submitted_at: string | null;
  under_verification_at: string | null;
  active_at: string | null;
  adequacy_review_at: string | null;
  drawdown_initiated_at: string | null;
  replenishment_pending_at: string | null;
  expiry_pending_at: string | null;
  substitution_pending_at: string | null;
  released_at: string | null;
  forfeited_at: string | null;
  rejected_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_reportable?: boolean;
  is_large_tier?: boolean;
}

interface KpiSummary {
  total: number;
  open_count: number;
  active_count: number;
  released_count: number;
  forfeited_count: number;
  rejected_count: number;
  drawdown_open_count: number;
  breached: number;
  reportable_total: number;
  large_exposure_open: number;
  total_secured_zar_m: number;
  total_required_zar_m: number;
  active_secured_zar_m: number;
  total_drawn_zar_m: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'security_required',
  'instrument_submitted',
  'under_verification',
  'active',
  'adequacy_review',
  'drawdown_initiated',
  'replenishment_pending',
  'expiry_pending',
  'substitution_pending',
  'released',
];

const BRANCH_STATES: readonly string[] = [
  'forfeited',
  'rejected',
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
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'security_required',     label: 'Required' },
  { key: 'instrument_submitted',  label: 'Submitted' },
  { key: 'under_verification',    label: 'Verifying' },
  { key: 'active',                label: 'Active' },
  { key: 'adequacy_review',       label: 'Adequacy' },
  { key: 'drawdown_initiated',    label: 'Drawdown' },
  { key: 'replenishment_pending', label: 'Replenish' },
  { key: 'expiry_pending',        label: 'Expiry' },
  { key: 'substitution_pending',  label: 'Substitution' },
  { key: 'released',              label: 'Released' },
  { key: 'forfeited',             label: 'Forfeited' },
  { key: 'rejected',              label: 'Rejected' },
];

const TERMINAL_STATES: ChainStatus[] = ['released', 'forfeited', 'rejected'];

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

function fmtDay(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('en-ZA', { dateStyle: 'medium' });
}

// Amounts are stored in ZAR millions.
function fmtZarM(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1000) return `R${(n / 1000).toFixed(2)}bn`;
  return `R${n.toFixed(1)}m`;
}

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: SecurityRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  // submit-instrument: security_required | replenishment_pending | expiry_pending | substitution_pending
  if (
    s === 'security_required' ||
    s === 'replenishment_pending' ||
    s === 'expiry_pending' ||
    s === 'substitution_pending'
  ) {
    actions.push({
      key: 'submit-instrument',
      label: 'Submit / re-post instrument (offtaker)',
      fields: [
        { key: 'submission_ref', label: 'Submission reference (e.g. PS-SUB-2026-014)', type: 'text', required: true, placeholder: '' },
        { key: 'instrument_name', label: 'Instrument name', type: 'text', required: false, placeholder: row.instrument_name || '' },
        { key: 'instrument_type', label: 'Instrument type (letter_of_credit / bank_guarantee / parent_guarantee / cash_deposit)', type: 'text', required: false, placeholder: row.instrument_type || 'letter_of_credit' },
        { key: 'issuer_name', label: 'Issuer / guarantor (issuing bank)', type: 'text', required: false, placeholder: row.issuer_name || '' },
        { key: 'secured_amount_zar_m', label: 'Secured amount (ZAR millions) — drives the tier', type: 'number', required: false, placeholder: String(row.secured_amount_zar_m ?? '') },
        { key: 'cover_months', label: 'Cover (months of invoices)', type: 'number', required: false, placeholder: String(row.cover_months ?? '') },
        { key: 'expiry_date', label: 'Instrument expiry date (YYYY-MM-DD)', type: 'date', required: false, placeholder: row.expiry_date || '' },
        { key: 'submission_basis', label: 'Submission basis — instrument terms / sizing', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  // begin-verification: instrument_submitted
  if (s === 'instrument_submitted') {
    actions.push({
      key: 'begin-verification',
      label: 'Begin verification (seller)',
      fields: [
        { key: 'verification_ref', label: 'Verification reference', type: 'text', required: true, placeholder: '' },
        { key: 'verification_basis', label: 'Verification basis — issuer-rating / wording / drawability checks', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  // activate: under_verification (primary forward)
  if (s === 'under_verification') {
    actions.push({
      key: 'activate',
      label: 'Activate (seller)',
      fields: [
        { key: 'activation_ref', label: 'Activation reference', type: 'text', required: true, placeholder: '' },
        { key: 'activation_basis', label: 'Activation basis — confirmation the instrument is live and conforming', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
    // reject-instrument: under_verification (branch)
    actions.push({
      key: 'reject-instrument',
      label: 'Reject instrument (seller)',
      fields: [
        { key: 'reject_ref', label: 'Rejection reference', type: 'text', required: true, placeholder: '' },
        { key: 'verification_basis', label: 'Rejection basis — why the instrument fails verification', type: 'textarea', required: true, placeholder: '' },
        { key: 'decision_notes', label: 'Decision notes', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  // active state — fan-out of branches
  if (s === 'active') {
    actions.push({
      key: 'open-adequacy-review',
      label: 'Open adequacy review (seller)',
      fields: [
        { key: 'adequacy_ref', label: 'Adequacy review reference', type: 'text', required: true, placeholder: '' },
        { key: 'adequacy_basis', label: 'Adequacy basis — exposure vs cover being reviewed', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'initiate-drawdown',
      label: 'Initiate drawdown (seller)',
      fields: [
        { key: 'drawdown_ref', label: 'Drawdown reference (call on the instrument)', type: 'text', required: true, placeholder: '' },
        { key: 'drawn_amount_zar_m', label: 'Amount drawn (ZAR millions)', type: 'number', required: true, placeholder: '' },
        { key: 'outstanding_invoice_zar_m', label: 'Unpaid PPA invoice that triggered the call (ZAR millions)', type: 'number', required: false, placeholder: '' },
        { key: 'drawdown_basis', label: 'Drawdown basis — buyer payment default detail', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'flag-expiry',
      label: 'Flag expiry (seller)',
      fields: [
        { key: 'expiry_ref', label: 'Expiry reference', type: 'text', required: true, placeholder: '' },
        { key: 'expiry_date', label: 'Instrument expiry date (YYYY-MM-DD)', type: 'date', required: false, placeholder: row.expiry_date || '' },
        { key: 'expiry_basis', label: 'Expiry basis — renewal / re-posting requirement', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'release',
      label: 'Release at PPA term (seller)',
      fields: [
        { key: 'release_ref', label: 'Release reference (PPA term reached — clean close)', type: 'text', required: true, placeholder: '' },
        { key: 'release_basis', label: 'Release basis — confirmation no further exposure', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  // adequacy_review: confirm-adequate (primary) + require-increase (branch)
  if (s === 'adequacy_review') {
    actions.push({
      key: 'confirm-adequate',
      label: 'Confirm adequate (seller)',
      fields: [
        { key: 'adequacy_basis', label: 'Confirmation basis — why cover remains adequate', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'require-increase',
      label: 'Require increase → substitute (seller)',
      fields: [
        { key: 'adequacy_shortfall_zar_m', label: 'Adequacy shortfall (ZAR millions) — cover gap vs exposure', type: 'number', required: true, placeholder: '' },
        { key: 'required_amount_zar_m', label: 'New required cover (ZAR millions)', type: 'number', required: false, placeholder: String(row.required_amount_zar_m ?? '') },
        { key: 'adequacy_basis', label: 'Basis — why a bigger instrument is required', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  // drawdown_initiated: open-replenishment
  if (s === 'drawdown_initiated') {
    actions.push({
      key: 'open-replenishment',
      label: 'Open replenishment (seller)',
      fields: [
        { key: 'replenishment_ref', label: 'Replenishment reference', type: 'text', required: true, placeholder: '' },
        { key: 'replenishment_due_zar_m', label: 'Amount required to restore the instrument (ZAR millions)', type: 'number', required: false, placeholder: String(row.drawn_amount_zar_m ?? '') },
        { key: 'replenishment_basis', label: 'Replenishment basis / deadline note', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  // forfeit: replenishment_pending | expiry_pending | substitution_pending
  if (
    s === 'replenishment_pending' ||
    s === 'expiry_pending' ||
    s === 'substitution_pending'
  ) {
    actions.push({
      key: 'forfeit',
      label: 'Forfeit security (seller)',
      fields: [
        { key: 'forfeit_ref', label: 'Forfeit reference', type: 'text', required: true, placeholder: '' },
        { key: 'forfeit_basis', label: 'Forfeit basis — failed to replenish / renew / substitute', type: 'textarea', required: true, placeholder: '' },
        { key: 'decision_notes', label: 'Decision notes', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  return actions;
}

// ── detail render ─────────────────────────────────────────────────────────
function renderDetail(row: SecurityRow): React.ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <DetailPair label="Instrument type"    value={row.instrument_type ?? '—'} />
        <DetailPair label="Issuer"             value={row.issuer_name ?? '—'} />
        <DetailPair label="Issuer rating"      value={row.issuer_rating ?? '—'} />
        <DetailPair label="PPA reference"      value={row.ppa_reference ?? '—'} />
        <DetailPair label="Project"            value={row.project_name ?? '—'} />
        <DetailPair label="Sector"             value={row.sector ?? '—'} />
        <DetailPair label="Secured"            value={fmtZarM(row.secured_amount_zar_m)} />
        <DetailPair label="Required cover"     value={fmtZarM(row.required_amount_zar_m)} />
        <DetailPair label="Cover months"       value={row.cover_months != null ? `${row.cover_months} mo` : '—'} />
        <DetailPair label="Expiry"             value={fmtDay(row.expiry_date)} />
        <DetailPair label="Drawn"              value={fmtZarM(row.drawn_amount_zar_m)} />
        <DetailPair label="Outstanding inv."   value={fmtZarM(row.outstanding_invoice_zar_m)} />
        <DetailPair label="Replenish due"      value={fmtZarM(row.replenishment_due_zar_m)} />
        <DetailPair label="Adequacy shortfall" value={fmtZarM(row.adequacy_shortfall_zar_m)} />
        <DetailPair label="Drawdown count"     value={String(row.drawdown_count)} />
        <DetailPair label="Agent"              value={row.agent_name ?? '—'} />
        <DetailPair label="Seller"             value={row.seller_party_name ?? '—'} />
        <DetailPair label="Submission ref"     value={row.submission_ref ?? '—'} />
        <DetailPair label="Verification ref"   value={row.verification_ref ?? '—'} />
        <DetailPair label="Activation ref"     value={row.activation_ref ?? '—'} />
        <DetailPair label="Adequacy ref"       value={row.adequacy_ref ?? '—'} />
        <DetailPair label="Drawdown ref"       value={row.drawdown_ref ?? '—'} />
        <DetailPair label="Replenishment ref"  value={row.replenishment_ref ?? '—'} />
        <DetailPair label="Expiry ref"         value={row.expiry_ref ?? '—'} />
        <DetailPair label="Release ref"        value={row.release_ref ?? '—'} />
        <DetailPair label="Forfeit ref"        value={row.forfeit_ref ?? '—'} />
        <DetailPair label="Reject ref"         value={row.reject_ref ?? '—'} />
        <DetailPair label="Reason code"        value={row.reason_code ?? '—'} />
        <DetailPair label="Required at"        value={fmtDate(row.security_required_at)} />
        <DetailPair label="Submitted at"       value={fmtDate(row.instrument_submitted_at)} />
        <DetailPair label="Verifying at"       value={fmtDate(row.under_verification_at)} />
        <DetailPair label="Active at"          value={fmtDate(row.active_at)} />
        <DetailPair label="Drawdown at"        value={fmtDate(row.drawdown_initiated_at)} />
        <DetailPair label="Released at"        value={fmtDate(row.released_at)} />
        <DetailPair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA status"         value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Escalation lvl"     value={String(row.escalation_level)} />
        <DetailPair label="Reportable"         value={row.is_reportable ? 'Yes' : 'No'} />
        {row.source_wave && (
          <DetailPair label="Source wave" value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}`} />
        )}
      </div>
      {row.submission_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Submission basis</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.submission_basis}</div>
        </div>
      )}
      {row.verification_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Verification basis</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.verification_basis}</div>
        </div>
      )}
      {row.activation_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Activation basis</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.activation_basis}</div>
        </div>
      )}
      {row.adequacy_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Adequacy basis</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.adequacy_basis}</div>
        </div>
      )}
      {row.drawdown_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Drawdown basis</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.drawdown_basis}</div>
        </div>
      )}
      {row.replenishment_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Replenishment basis</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.replenishment_basis}</div>
        </div>
      )}
      {row.expiry_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Expiry basis</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.expiry_basis}</div>
        </div>
      )}
      {row.forfeit_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Forfeit basis</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.forfeit_basis}</div>
        </div>
      )}
      {row.release_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: GOOD }}>Release basis</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.release_basis}</div>
        </div>
      )}
      {row.decision_notes && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Decision notes</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.decision_notes}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function PaymentSecurityChainTab() {
  const [rows, setRows] = useState<SecurityRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active_open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: SecurityRow[] } & KpiSummary }>('/payment-security/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        setSummary({
          total: d.total,
          open_count: d.open_count,
          active_count: d.active_count,
          released_count: d.released_count,
          forfeited_count: d.forfeited_count,
          rejected_count: d.rejected_count,
          drawdown_open_count: d.drawdown_open_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          large_exposure_open: d.large_exposure_open,
          total_secured_zar_m: d.total_secured_zar_m,
          total_required_zar_m: d.total_required_zar_m,
          active_secured_zar_m: d.active_secured_zar_m,
          total_drawn_zar_m: d.total_drawn_zar_m,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load payment securities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/payment-security/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/payment-security/chain/${rowId}`);
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
      const res = await api.get<{ data: { events: ChainEvent[] } }>(`/payment-security/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')         return true;
      if (filter === 'active_open') return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'minor')       return r.security_tier === 'minor';
      if (filter === 'moderate')    return r.security_tier === 'moderate';
      if (filter === 'material')    return r.security_tier === 'material';
      if (filter === 'major')       return r.security_tier === 'major';
      if (filter === 'critical')    return r.security_tier === 'critical';
      if (filter === 'breached')    return !!r.sla_breached;
      if (filter === 'reportable')  return !!r.is_reportable;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: 0, open_count: 0, active_count: 0, released_count: 0,
    forfeited_count: 0, rejected_count: 0, drawdown_open_count: 0,
    breached: 0, reportable_total: 0, large_exposure_open: 0,
    total_secured_zar_m: 0, total_required_zar_m: 0,
    active_secured_zar_m: 0, total_drawn_zar_m: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Offtaker PPA payment security / credit support</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-stage P6 chain · security required → instrument submitted → under verification → active → adequacy review →
          active. Financial-assurance backbone of a bankable PPA. Buyer posts and maintains a payment-security instrument
          (LC / bank guarantee / parent guarantee) sized to rolling payment exposure. Seller verifies, activates, runs
          adequacy review, draws on buyer default, forfeits un-replenished instruments, and releases at PPA term. URGENT
          SLA: critical tier tightest. Forfeit crosses to regulator every tier; drawdowns + rejections + SLA breaches
          cross for major + critical.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"        value={kpis.total} />
        <KpiTile label="Open"         value={kpis.open_count} />
        <KpiTile label="Active"       value={kpis.active_count} tone="ok" />
        <KpiTile label="In drawdown"  value={kpis.drawdown_open_count} tone={kpis.drawdown_open_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Large open"   value={kpis.large_exposure_open} tone={kpis.large_exposure_open > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Forfeited"    value={kpis.forfeited_count} tone={kpis.forfeited_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Rejected"     value={kpis.rejected_count} tone={kpis.rejected_count > 0 ? 'warn' : 'ok'} />
        <KpiTile label="SLA breached" value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Reportable"   value={kpis.reportable_total} tone={kpis.reportable_total > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Secured"      value={fmtZarM(kpis.total_secured_zar_m)} />
        <KpiTile label="Active cover" value={fmtZarM(kpis.active_secured_zar_m)} />
        <KpiTile label="Drawn"        value={fmtZarM(kpis.total_drawn_zar_m)} tone={kpis.total_drawn_zar_m > 0 ? 'warn' : 'ok'} />
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
              title={row.instrument_name}
              meta={`${row.security_tier.charAt(0).toUpperCase() + row.security_tier.slice(1)} · ${row.offtaker_party_name}${row.seller_party_name ? ` · seller ${row.seller_party_name}` : ''} · ${row.security_number}`}
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
              No securities match.
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
      <div style={{ color: TX1, fontSize: 11 }}>{value}</div>
    </div>
  );
}

export default PaymentSecurityChainTab;
