// Wave 61 — Lender Loan Transfer / Secondary Participation chain —
// LMA secondary-trading documentation + Banks Act 94/1990 large-exposure +
// SARB Exchange Control (non-resident transferees) + FIC Act 38/2001 KYC/AML.
//
// A lender of record (transferor) sells down / participates out part of a
// committed facility to another financier (transferee). Before the lender of
// record can be changed, the transfer must clear KYC / sanctions screening on
// the incoming lender (FIC), obtain the obligor's (borrower's) consent where the
// facility agreement requires it, pass SARB exchange-control review when the
// transferee is non-resident, be approved, have the transfer certificate
// executed, settle the purchase price, and complete with the facility register
// updated.
//
//   transfer_requested → kyc_screening → consent_solicitation → regulatory_review
//     → transfer_approved → certificate_executed → settled → completed
//   remediation loop:  kyc_screening → screening_remediation → kyc_screening
//   refusal / failure: kyc_screening → rejected (FIC) ; consent → declined
//
// INVERTED tier SLA — the bigger the transfer, the more diligence time every
// window allows; regulatory review is deepest at systemic. The SIGNATURE
// crossing is RESIDENCY-driven: approving a NON-RESIDENT transfer crosses the
// SARB exchange-control inbox at EVERY tier; a screening failure always crosses
// (FIC); completing a large/systemic transfer crosses (Banks Act large-exposure).
// Two-party write — the OBLIGOR grants/refuses consent; the LENDER side drives
// every other step.

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
  | 'transfer_requested' | 'kyc_screening' | 'screening_remediation'
  | 'consent_solicitation' | 'regulatory_review' | 'transfer_approved'
  | 'certificate_executed' | 'settled' | 'completed'
  | 'declined' | 'rejected' | 'withdrawn';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'systemic';
type Residency = 'resident' | 'non_resident';

interface LoanTransferRow {
  [key: string]: unknown;
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  transferor_party_id: string;
  transferor_party_name: string;
  transferee_party_id: string;
  transferee_party_name: string;
  agent_party_id: string;
  agent_party_name: string;
  obligor_party_id: string;
  obligor_party_name: string;
  facility_code: string | null;
  facility_name: string;
  transfer_type: string;
  tranche: string | null;
  borrower_project: string | null;
  facility_currency: string | null;
  facility_total_zar_m: number | null;
  transfer_zar_m: number;
  transfer_price_pct: number | null;
  settlement_zar_m: number | null;
  transfer_tier: Tier;
  transferee_residency: Residency;
  transferee_epfi: number;
  kyc_cleared: number;
  sanctions_cleared: number;
  obligor_consent_granted: number;
  sarb_approval_required: number;
  sarb_approval_obtained: number;
  certificate_signed: number;
  register_updated: number;
  request_ref: string | null;
  screening_ref: string | null;
  remediation_ref: string | null;
  consent_ref: string | null;
  regulatory_ref: string | null;
  approval_ref: string | null;
  certificate_ref: string | null;
  settlement_ref: string | null;
  completion_ref: string | null;
  rejection_ref: string | null;
  decline_ref: string | null;
  withdrawal_ref: string | null;
  regulator_ref: string | null;
  request_basis: string | null;
  screening_basis: string | null;
  remediation_basis: string | null;
  consent_basis: string | null;
  regulatory_basis: string | null;
  approval_basis: string | null;
  certificate_basis: string | null;
  settlement_basis: string | null;
  rejection_basis: string | null;
  decline_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  remediation_round: number;
  chain_status: ChainStatus;
  transfer_requested_at: string;
  kyc_screening_at: string | null;
  screening_remediation_at: string | null;
  consent_solicitation_at: string | null;
  regulatory_review_at: string | null;
  transfer_approved_at: string | null;
  certificate_executed_at: string | null;
  settled_at: string | null;
  completed_at: string | null;
  declined_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface LoanTransferEvent {
  id: string;
  transfer_id: string;
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
  completed_count: number;
  in_screening: number;
  in_regulatory: number;
  breached: number;
  reportable_total: number;
  non_resident_total: number;
  large_tier_open: number;
  total_transfer_zar_m: number;
  completed_transfer_zar_m: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'transfer_requested',
  'kyc_screening',
  'screening_remediation',
  'consent_solicitation',
  'regulatory_review',
  'transfer_approved',
  'certificate_executed',
  'settled',
  'completed',
];

const BRANCH_STATES: readonly string[] = [
  'declined',
  'rejected',
  'withdrawn',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'In pipeline' },
  { key: 'all',                   label: 'All' },
  { key: 'reportable',            label: 'Regulator reportable' },
  { key: 'non_resident',          label: 'Non-resident' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'kyc_screening',         label: 'Screening' },
  { key: 'screening_remediation', label: 'Remediation' },
  { key: 'consent_solicitation',  label: 'Consent' },
  { key: 'regulatory_review',     label: 'Regulatory' },
  { key: 'transfer_approved',     label: 'Approved' },
  { key: 'certificate_executed',  label: 'Certificate' },
  { key: 'settled',               label: 'Settled' },
  { key: 'completed',             label: 'Completed' },
  { key: 'declined',              label: 'Declined' },
  { key: 'rejected',              label: 'Rejected' },
  { key: 'withdrawn',             label: 'Withdrawn' },
];

// ── action helpers ────────────────────────────────────────────────────────
const CAN_REQUEST_REMEDIATION: ChainStatus[] = ['kyc_screening'];
const CAN_FAIL_SCREENING: ChainStatus[]      = ['kyc_screening', 'screening_remediation'];
const CAN_REFUSE_CONSENT: ChainStatus[]      = ['consent_solicitation'];
const CAN_WITHDRAW: ChainStatus[]            = [
  'transfer_requested', 'kyc_screening', 'screening_remediation',
  'consent_solicitation', 'regulatory_review', 'transfer_approved',
  'certificate_executed',
];

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

// Amounts are stored in millions of ZAR.
function fmtZarM(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1000) return `R${(m / 1000).toFixed(2)}bn`;
  return `R${m.toLocaleString('en-ZA')}m`;
}

function fmtPct(p: number | null | undefined): string {
  if (p === null || p === undefined) return '—';
  return `${p}%`;
}

function getActions(row: LoanTransferRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  // Primary forward action per state
  if (s === 'transfer_requested') {
    actions.push({
      key: 'begin-screening',
      label: 'Begin KYC / sanctions screening (Agent)',
      fields: [
        { key: 'screening_ref', label: 'Screening reference (eg "SCR-2026-0007")', type: 'text', required: false, placeholder: '' },
        { key: 'screening_basis', label: 'Screening basis (KYC / sanctions / FIC scope on the incoming lender)', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'kyc_screening') {
    actions.push({
      key: 'clear-screening',
      label: 'Clear screening (Agent)',
      fields: [
        { key: 'screening_basis', label: 'Clearance basis (KYC + sanctions cleared)', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'screening_remediation') {
    actions.push({
      key: 'resubmit-screening',
      label: 'Resubmit screening evidence (Transferor)',
      fields: [
        { key: 'screening_ref', label: 'Updated screening reference (eg "SCR-2026-0007-R2")', type: 'text', required: false, placeholder: '' },
        { key: 'screening_basis', label: 'Resubmission basis (cured evidence)', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'consent_solicitation') {
    actions.push({
      key: 'grant-consent',
      label: 'Grant consent (Obligor)',
      fields: [
        { key: 'consent_ref', label: 'Consent reference (eg "CONSENT-2026-0007")', type: 'text', required: false, placeholder: '' },
        { key: 'consent_basis', label: 'Consent basis (obligor approval per facility agreement)', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'regulatory_review') {
    actions.push({
      key: 'approve-transfer',
      label: 'Approve transfer (Agent)',
      fields: [
        { key: 'approval_ref', label: 'Approval reference (eg "APPROVAL-2026-0007")', type: 'text', required: true, placeholder: '' },
        { key: 'approval_basis', label: 'Approval basis (transfer cleared all gates)', type: 'textarea', required: true, placeholder: '' },
        // SARB exchange-control ref required when non-resident (always shown; backend enforces when non_resident)
        { key: 'regulator_ref', label: 'SARB exchange-control reference (non-resident transferee)', type: 'text', required: row.transferee_residency === 'non_resident', placeholder: '' },
      ],
      // approving a non-resident transfer crosses SARB inbox at EVERY tier
      cascadeTo: row.transferee_residency === 'non_resident' ? ['regulator'] : [],
    });
  }

  if (s === 'transfer_approved') {
    actions.push({
      key: 'execute-certificate',
      label: 'Execute transfer certificate (Agent)',
      fields: [
        { key: 'certificate_ref', label: 'Transfer certificate reference (eg "TC-2026-0007")', type: 'text', required: true, placeholder: '' },
        { key: 'certificate_basis', label: 'Certificate basis (LMA transfer certificate executed)', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'certificate_executed') {
    actions.push({
      key: 'settle',
      label: 'Settle purchase price (Transferor)',
      fields: [
        { key: 'settlement_ref', label: 'Settlement reference (eg "STL-2026-0007")', type: 'text', required: false, placeholder: '' },
        { key: 'settlement_basis', label: 'Settlement basis (purchase price + accrued interest)', type: 'textarea', required: true, placeholder: '' },
        { key: 'settlement_zar_m', label: 'Settlement amount (ZAR millions)', type: 'number', required: false, placeholder: String(row.transfer_zar_m ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'settled') {
    actions.push({
      key: 'complete',
      label: 'Complete — update register (Agent)',
      fields: [
        { key: 'completion_ref', label: 'Completion reference (eg "CMP-2026-0007")', type: 'text', required: false, placeholder: '' },
        // Banks Act large-exposure ref required for major/systemic
        { key: 'regulator_ref', label: 'Banks Act large-exposure reference (large/systemic transfer)', type: 'text', required: row.transfer_tier === 'major' || row.transfer_tier === 'systemic', placeholder: '' },
      ],
      // completing a large/systemic transfer crosses Banks Act large-exposure inbox
      cascadeTo: (row.transfer_tier === 'major' || row.transfer_tier === 'systemic') ? ['regulator'] : [],
    });
  }

  // Branch: request remediation (from kyc_screening)
  if (CAN_REQUEST_REMEDIATION.includes(s)) {
    actions.push({
      key: 'request-remediation',
      label: 'Request screening remediation (Agent)',
      fields: [
        { key: 'remediation_ref', label: 'Remediation reference (eg "REM-2026-0007")', type: 'text', required: false, placeholder: '' },
        { key: 'remediation_basis', label: 'Remediation basis (what KYC / sanctions gap must be cured)', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code (eg "UBO_GAP", "SANCTIONS_HIT_REVIEW")', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  // Branch: fail screening — reject (FIC crossing always)
  if (CAN_FAIL_SCREENING.includes(s)) {
    actions.push({
      key: 'fail-screening',
      label: 'Fail screening — reject (Agent · FIC)',
      fields: [
        { key: 'rejection_ref', label: 'Rejection reference (eg "REJ-2026-0007")', type: 'text', required: false, placeholder: '' },
        { key: 'rejection_basis', label: 'Rejection basis (why the incoming lender fails KYC / sanctions)', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code (eg "SANCTIONS_MATCH", "KYC_UNRESOLVED")', type: 'text', required: false, placeholder: '' },
        { key: 'regulator_ref', label: 'FIC reference (a screening failure is always reportable)', type: 'text', required: true, placeholder: '' },
      ],
      // screening failure always crosses FIC (regulator) at every tier
      cascadeTo: ['regulator'],
    });
  }

  // Branch: refuse consent (from consent_solicitation)
  if (CAN_REFUSE_CONSENT.includes(s)) {
    actions.push({
      key: 'refuse-consent',
      label: 'Refuse consent (Obligor)',
      fields: [
        { key: 'decline_ref', label: 'Refusal reference (eg "DEC-2026-0007")', type: 'text', required: false, placeholder: '' },
        { key: 'decline_basis', label: 'Refusal basis (why the obligor withholds consent)', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code (eg "DISQUALIFIED_LENDER", "MFN_BREACH")', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  // Branch: withdraw (available across most pre-completion states)
  if (CAN_WITHDRAW.includes(s)) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw transfer (Transferor)',
      fields: [
        { key: 'withdrawal_ref', label: 'Withdrawal reference (eg "WD-2026-0007")', type: 'text', required: false, placeholder: '' },
        { key: 'withdrawal_basis', label: 'Withdrawal basis (why the transfer is being pulled)', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code (eg "PRICE_DISPUTE", "ALT_BUYER")', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

function renderDetail(row: LoanTransferRow): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="Transferor"         value={row.transferor_party_name} />
      <DetailPair label="Transferee"         value={row.transferee_party_name} />
      <DetailPair label="Facility agent"     value={row.agent_party_name} />
      <DetailPair label="Obligor"            value={row.obligor_party_name} />
      <DetailPair label="Tier"               value={TIER_LABEL[row.transfer_tier]} />
      <DetailPair label="Residency"          value={row.transferee_residency === 'non_resident' ? 'Non-resident' : 'Resident'} />
      <DetailPair label="Facility"           value={row.facility_name} />
      <DetailPair label="Transfer type"      value={row.transfer_type} />
      <DetailPair label="Tranche"            value={row.tranche ?? '—'} />
      <DetailPair label="Borrower / project" value={row.borrower_project ?? '—'} />
      <DetailPair label="Facility total"     value={fmtZarM(row.facility_total_zar_m)} />
      <DetailPair label="Transfer value"     value={fmtZarM(row.transfer_zar_m)} />
      <DetailPair label="Transfer price"     value={fmtPct(row.transfer_price_pct)} />
      <DetailPair label="Settlement value"   value={fmtZarM(row.settlement_zar_m)} />
      <DetailPair label="Equator FI?"        value={row.transferee_epfi ? 'Yes' : 'No'} />
      <DetailPair label="KYC cleared"        value={row.kyc_cleared ? 'Yes' : 'No'} />
      <DetailPair label="Sanctions cleared"  value={row.sanctions_cleared ? 'Yes' : 'No'} />
      <DetailPair label="Obligor consent"    value={row.obligor_consent_granted ? 'Granted' : 'Pending'} />
      <DetailPair label="SARB approval req"  value={row.sarb_approval_required ? 'Yes' : 'No'} />
      <DetailPair label="SARB approval"      value={row.sarb_approval_obtained ? 'Obtained' : 'Pending'} />
      <DetailPair label="Certificate signed" value={row.certificate_signed ? 'Yes' : 'No'} />
      <DetailPair label="Register updated"   value={row.register_updated ? 'Yes' : 'No'} />
      <DetailPair label="Remediation round"  value={String(row.remediation_round)} />
      <DetailPair label="Approval ref"       value={row.approval_ref ?? '—'} />
      <DetailPair label="Certificate ref"    value={row.certificate_ref ?? '—'} />
      <DetailPair label="Settlement ref"     value={row.settlement_ref ?? '—'} />
      <DetailPair label="Reportable"         value={row.is_reportable_flag ? 'Yes — regulator' : 'No'} />
      <DetailPair label="Escalation level"   value={String(row.escalation_level)} />
      <DetailPair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
      <DetailPair label="SLA status"         value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
      <DetailPair label="Reason code"        value={row.reason_code ?? '—'} />
      <DetailPair label="Regulator ref"      value={row.regulator_ref ?? '—'} />
      {row.source_wave && (
        <DetailPair label="Source" value={`${row.source_wave} · ${row.source_entity_id ?? ''}`} />
      )}

      {row.screening_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Screening basis</div>
          <div style={{ color: TX2 }}>{row.screening_basis}</div>
        </div>
      )}
      {row.remediation_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Remediation basis</div>
          <div style={{ color: TX2 }}>{row.remediation_basis}</div>
        </div>
      )}
      {row.consent_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Consent basis</div>
          <div style={{ color: TX2 }}>{row.consent_basis}</div>
        </div>
      )}
      {row.regulatory_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Regulatory basis</div>
          <div style={{ color: TX2 }}>{row.regulatory_basis}</div>
        </div>
      )}
      {row.approval_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Approval basis</div>
          <div style={{ color: TX2 }}>{row.approval_basis}</div>
        </div>
      )}
      {row.certificate_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Certificate basis</div>
          <div style={{ color: TX2 }}>{row.certificate_basis}</div>
        </div>
      )}
      {row.settlement_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Settlement basis</div>
          <div style={{ color: TX2 }}>{row.settlement_basis}</div>
        </div>
      )}
      {row.rejection_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Rejection basis</div>
          <div style={{ color: TX2 }}>{row.rejection_basis}</div>
        </div>
      )}
      {row.decline_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Refusal basis</div>
          <div style={{ color: TX2 }}>{row.decline_basis}</div>
        </div>
      )}
      {row.withdrawal_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Withdrawal basis</div>
          <div style={{ color: TX2 }}>{row.withdrawal_basis}</div>
        </div>
      )}
      {row.notes && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Notes</div>
          <div style={{ color: TX2 }}>{row.notes}</div>
        </div>
      )}
    </div>
  );
}

// Tier label lookup (replaces TIER_TONE record used in old Drawer)
const TIER_LABEL: Record<Tier, string> = {
  minor:    'Minor (<R100m)',
  moderate: 'Moderate (<R500m)',
  material: 'Material (<R2bn)',
  major:    'Major (<R10bn)',
  systemic: 'Systemic (R10bn+)',
};

// ── component ─────────────────────────────────────────────────────────────
export function LoanTransferChainTab() {
  const [rows, setRows] = useState<LoanTransferRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: LoanTransferRow[] } & KpiSummary }>('/loan-transfer/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          open_count: data.open_count || 0,
          completed_count: data.completed_count || 0,
          in_screening: data.in_screening || 0,
          in_regulatory: data.in_regulatory || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          non_resident_total: data.non_resident_total || 0,
          large_tier_open: data.large_tier_open || 0,
          total_transfer_zar_m: data.total_transfer_zar_m || 0,
          completed_transfer_zar_m: data.completed_transfer_zar_m || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load loan transfer chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/loan-transfer/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/loan-transfer/chain/${rowId}`);
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
      const res = await api.get<{ data: { case: LoanTransferRow; events: LoanTransferEvent[] } }>(`/loan-transfer/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: (res.data?.data?.events ?? []) as ChainEvent[] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')          return true;
      if (filter === 'active')       return !r.is_terminal;
      if (filter === 'reportable')   return r.is_reportable_flag;
      if (filter === 'non_resident') return r.transferee_residency === 'non_resident';
      if (filter === 'breached')     return r.sla_breached;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, open_count: 0, completed_count: 0, in_screening: 0,
    in_regulatory: 0, breached: 0, reportable_total: 0, non_resident_total: 0,
    large_tier_open: 0, total_transfer_zar_m: 0, completed_transfer_zar_m: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Loan Transfer &amp; Secondary Participation — LMA + Banks Act + SARB ExCon + FIC</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          A lender of record sells down / participates out part of a committed
          facility to another financier. KYC / sanctions screening (FIC) → obligor
          consent → SARB exchange-control review (non-resident) → approval →
          transfer certificate executed → settlement → completion. INVERTED tier SLA.
          Non-resident approval crosses SARB inbox at every tier; screening failure
          always crosses FIC; large/systemic completion crosses Banks Act large-exposure.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-2 flex flex-wrap gap-2">
        <KpiTile label="Total"            value={kpis.total} />
        <KpiTile label="In pipeline"      value={kpis.open_count}            tone={kpis.open_count > 0 ? 'warn' : undefined} />
        <KpiTile label="In screening"     value={kpis.in_screening} />
        <KpiTile label="Regulatory"       value={kpis.in_regulatory} />
        <KpiTile label="Completed"        value={kpis.completed_count} />
        <KpiTile label="Non-resident"     value={kpis.non_resident_total}    tone={kpis.non_resident_total > 0 ? 'warn' : undefined} />
        <KpiTile label="SLA breached"     value={kpis.breached}              tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Completed value"  value={fmtZarM(kpis.completed_transfer_zar_m)} />
      </div>

      {/* Secondary KPI line */}
      <div className="mb-4 flex flex-wrap items-center gap-4" style={{ fontSize: 11, color: TX2 }}>
        <span>Regulator reportable: <span style={{ fontWeight: 600, color: BAD }}>{kpis.reportable_total}</span></span>
        <span>Large tier open: <span style={{ fontWeight: 600, color: BAD }}>{kpis.large_tier_open}</span></span>
        <span>Pipeline value: <span style={{ fontWeight: 600, color: TX1, fontFamily: MONO }}>{fmtZarM(kpis.total_transfer_zar_m)}</span></span>
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
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.transferor_party_name} → ${row.transferee_party_name}`}
              meta={`${TIER_LABEL[row.transfer_tier]} · ${row.transferee_residency === 'non_resident' ? 'Non-resident' : 'Resident'} · ${row.case_number}`}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No transfers match.</div>
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
      <div style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

export default LoanTransferChainTab;
