// Wave 53 — Lender Credit Facility Origination & Credit Approval chain —
// National Credit Act 34/2005 + Banks Act 94/1990 + Basel III + SARB
// large-exposure + LMA facility agreement.
//
// The FRONT-END of the project-finance lifecycle: the credit-approval gate a
// borrower passes BEFORE any money is committed. A prospective borrower applies;
// the lender screens (eligibility / KYC / NCA affordability), runs a full credit
// assessment, refers it to the credit committee, which approves /
// approves-with-conditions / refers-back / declines; once approved the lender
// issues the facility agreement, the borrower satisfies the conditions precedent,
// and the lender activates the facility — at which point it becomes available to
// draw. Sits UPSTREAM of every other Lender chain (W21 drawdown, W30 disbursement,
// W38 covenant cert, W6 dunning, W45 default).
//
//   application_received → screening → credit_assessment → committee_review
//     → approved → agreement_issued → cp_satisfied → facility_available
//   conditional-approval loop: committee_review → conditions_pending → approved
//   referral loop:             committee_review → referred_back → credit_assessment
//
// INVERTED tier SLA — bigger facility = MORE time. activate crosses the SARB
// large-exposure inbox for major + systemic (the W53 signature); decline crosses
// for systemic only; SLA breaches cross for major + systemic.

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
  | 'application_received' | 'screening' | 'credit_assessment' | 'committee_review'
  | 'referred_back' | 'conditions_pending' | 'approved' | 'agreement_issued'
  | 'cp_satisfied' | 'facility_available' | 'declined' | 'withdrawn';

type Tier = 'small' | 'medium' | 'large' | 'major' | 'systemic';

interface CreditFacilityRow {
  [key: string]: unknown;
  id: string;
  application_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  applicant_party_id: string;
  applicant_party_name: string;
  lender_name: string | null;
  sponsor_name: string | null;
  facility_tier: Tier;
  facility_name: string;
  facility_type: string | null;
  facility_purpose: string | null;
  facility_limit_zar_m: number | null;
  tenor_months: number | null;
  margin_bps: number | null;
  pricing_basis: string | null;
  project_id: string | null;
  project_name: string | null;
  sector: string | null;
  credit_rating: string | null;
  ltv_pct: number | null;
  dscr_base: number | null;
  gearing_pct: number | null;
  pd_pct: number | null;
  lgd_pct: number | null;
  ead_zar_m: number | null;
  approved_amount_zar_m: number | null;
  conditions_count: number | null;
  cp_count: number | null;
  screening_ref: string | null;
  assessment_ref: string | null;
  committee_ref: string | null;
  approval_ref: string | null;
  agreement_ref: string | null;
  cp_ref: string | null;
  activation_ref: string | null;
  decline_ref: string | null;
  regulator_ref: string | null;
  screening_basis: string | null;
  assessment_basis: string | null;
  committee_basis: string | null;
  approval_basis: string | null;
  conditions_basis: string | null;
  cp_basis: string | null;
  activation_basis: string | null;
  decline_basis: string | null;
  reason_code: string | null;
  decision_notes: string | null;
  notes: string | null;
  referral_round: number;
  chain_status: ChainStatus;
  application_received_at: string;
  screening_at: string | null;
  credit_assessment_at: string | null;
  committee_review_at: string | null;
  referred_back_at: string | null;
  conditions_pending_at: string | null;
  approved_at: string | null;
  agreement_issued_at: string | null;
  cp_satisfied_at: string | null;
  facility_available_at: string | null;
  declined_at: string | null;
  withdrawn_at: string | null;
  is_reportable?: boolean;
  is_large_exposure?: boolean;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  breach_crosses_regulator?: boolean;
  sla_window_minutes?: number;
  created_by: string;
  created_at: string;
}

interface CreditFacilityEvent {
  id: string;
  application_id: string;
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
  available_count: number;
  declined_count: number;
  withdrawn_count: number;
  in_committee_count: number;
  conditions_pending_count: number;
  breached: number;
  reportable_total: number;
  large_exposure_open: number;
  total_limit_zar_m: number;
  total_approved_zar_m: number;
  available_limit_zar_m: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'application_received',
  'screening',
  'credit_assessment',
  'committee_review',
  'conditions_pending',
  'approved',
  'agreement_issued',
  'cp_satisfied',
  'facility_available',
];

const BRANCH_STATES: readonly string[] = [
  'referred_back',
  'declined',
  'withdrawn',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',              label: 'In pipeline' },
  { key: 'all',                 label: 'All' },
  { key: 'reportable',          label: 'SARB reportable' },
  { key: 'large_exposure',      label: 'Large exposure' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'screening',           label: 'Screening' },
  { key: 'credit_assessment',   label: 'Assessment' },
  { key: 'committee_review',    label: 'Committee' },
  { key: 'referred_back',       label: 'Referred back' },
  { key: 'conditions_pending',  label: 'Conditions' },
  { key: 'approved',            label: 'Approved' },
  { key: 'agreement_issued',    label: 'Agreement' },
  { key: 'cp_satisfied',        label: 'CPs satisfied' },
  { key: 'facility_available',  label: 'Available' },
  { key: 'declined',            label: 'Declined' },
  { key: 'withdrawn',           label: 'Withdrawn' },
];

// ── branch availability constants ─────────────────────────────────────────
const CAN_APPROVE_WITH_CONDITIONS: ChainStatus[] = ['committee_review'];
const CAN_REFER_BACK: ChainStatus[]              = ['committee_review'];
const CAN_DECLINE: ChainStatus[]                 = ['screening', 'credit_assessment', 'committee_review', 'referred_back', 'conditions_pending'];
const CAN_WITHDRAW: ChainStatus[]                = ['application_received', 'screening', 'credit_assessment', 'committee_review', 'referred_back', 'conditions_pending', 'approved', 'agreement_issued', 'cp_satisfied'];

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

// Facility limit is stored in millions of ZAR.
function fmtZarM(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1000) return `R${(m / 1000).toFixed(2)}bn`;
  return `R${m.toLocaleString('en-ZA')}m`;
}

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: CreditFacilityRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  // Primary forward action per state
  if (s === 'application_received') {
    actions.push({
      key: 'screen',
      label: 'Screen — eligibility / KYC / NCA (Lender)',
      fields: [
        { key: 'screening_ref',   label: 'Screening reference (eg "SCR-2026-0007")',                                type: 'text',     required: false, placeholder: '' },
        { key: 'screening_basis', label: 'Screening basis (eligibility / KYC / NCA affordability — required)',      type: 'textarea', required: true,  placeholder: '' },
        { key: 'credit_rating',   label: 'Indicative internal credit grade (eg "BB+")',                             type: 'text',     required: false, placeholder: row.credit_rating ?? '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'screening' || s === 'referred_back') {
    actions.push({
      key: 'assess',
      label: 'Run credit assessment (Lender)',
      fields: [
        { key: 'assessment_ref',  label: 'Assessment reference (eg "ASMT-2026-0007")',                              type: 'text',     required: false, placeholder: '' },
        { key: 'assessment_basis',label: 'Assessment basis (financial model / DD / security — required)',           type: 'textarea', required: true,  placeholder: '' },
        { key: 'dscr_base',       label: 'Base-case DSCR (eg 1.35)',                                               type: 'number',   required: false, placeholder: row.dscr_base != null ? String(row.dscr_base) : '' },
        { key: 'ltv_pct',         label: 'LTV % (eg 70)',                                                          type: 'number',   required: false, placeholder: row.ltv_pct != null ? String(row.ltv_pct) : '' },
        { key: 'gearing_pct',     label: 'Gearing % (eg 75)',                                                      type: 'number',   required: false, placeholder: row.gearing_pct != null ? String(row.gearing_pct) : '' },
        { key: 'credit_rating',   label: 'Internal credit grade (eg "BBB-")',                                      type: 'text',     required: false, placeholder: row.credit_rating ?? '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'credit_assessment') {
    actions.push({
      key: 'refer-committee',
      label: 'Refer to credit committee (Lender)',
      fields: [
        { key: 'committee_ref',   label: 'Committee paper reference (eg "CC-2026-0007")',                          type: 'text',     required: false, placeholder: '' },
        { key: 'committee_basis', label: 'Committee submission basis (credit recommendation — required)',           type: 'textarea', required: true,  placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'committee_review') {
    // Primary: approve
    actions.push({
      key: 'approve',
      label: 'Approve (Committee)',
      fields: [
        { key: 'approval_ref',           label: 'Approval reference (eg "APPROVAL-2026-0007")',                    type: 'text',     required: true,  placeholder: '' },
        { key: 'approval_basis',         label: 'Approval basis (committee resolution rationale — required)',      type: 'textarea', required: true,  placeholder: '' },
        { key: 'approved_amount_zar_m',  label: 'Approved amount (ZAR millions, eg 450)',                         type: 'number',   required: false, placeholder: row.facility_limit_zar_m != null ? String(row.facility_limit_zar_m) : '' },
        { key: 'reason_code',            label: 'Reason code (eg "WITHIN_APPETITE")',                             type: 'text',     required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'conditions_pending') {
    actions.push({
      key: 'satisfy-conditions',
      label: 'Satisfy conditions (Applicant)',
      fields: [
        { key: 'conditions_basis', label: 'Evidence the conditions of approval are met (required)',                type: 'textarea', required: true,  placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'approved') {
    actions.push({
      key: 'issue-agreement',
      label: 'Issue facility agreement (Lender)',
      fields: [
        { key: 'agreement_ref', label: 'Facility agreement reference (eg "FA-2026-0007")',                         type: 'text',     required: true,  placeholder: '' },
        { key: 'cp_count',      label: 'Number of conditions precedent (eg 8)',                                    type: 'number',   required: false, placeholder: row.cp_count != null ? String(row.cp_count) : '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'agreement_issued') {
    actions.push({
      key: 'satisfy-cp',
      label: 'Satisfy conditions precedent (Applicant)',
      fields: [
        { key: 'cp_ref',   label: 'CP satisfaction reference (eg "CP-SAT-2026-0007")',                             type: 'text',     required: false, placeholder: '' },
        { key: 'cp_basis', label: 'CP satisfaction basis (CP checklist / legal opinion — required)',               type: 'textarea', required: true,  placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'cp_satisfied') {
    // activate — crosses SARB large-exposure for major + systemic
    const activateFields: ChainAction['fields'] = [
      { key: 'activation_ref',   label: 'Activation reference (eg "ACTIVATE-2026-0007")',                         type: 'text',     required: true,  placeholder: '' },
      { key: 'activation_basis', label: 'Activation basis (facility made available to draw — required)',          type: 'textarea', required: true,  placeholder: '' },
    ];
    if (row.facility_tier === 'major' || row.facility_tier === 'systemic') {
      activateFields.push({
        key: 'regulator_ref', label: 'SARB large-exposure reference (large-exposure tier — required)',             type: 'text',     required: true,  placeholder: '',
      });
    }
    actions.push({
      key: 'activate',
      label: 'Activate — make facility available (Lender)',
      fields: activateFields,
      // crosses SARB large-exposure for major + systemic
      cascadeTo: (row.facility_tier === 'major' || row.facility_tier === 'systemic') ? ['regulator'] : [],
    });
  }

  // ── branch actions ────────────────────────────────────────────────────
  if (CAN_APPROVE_WITH_CONDITIONS.includes(s)) {
    actions.push({
      key: 'approve-with-conditions',
      label: 'Approve with conditions (Committee)',
      fields: [
        { key: 'approval_ref',          label: 'Approval reference (eg "APPROVAL-2026-0008")',                    type: 'text',     required: true,  placeholder: '' },
        { key: 'approval_basis',        label: 'Approval basis (committee resolution rationale — required)',      type: 'textarea', required: true,  placeholder: '' },
        { key: 'conditions_basis',      label: 'Conditions of approval (narrative — required)',                   type: 'textarea', required: true,  placeholder: '' },
        { key: 'conditions_count',      label: 'Number of conditions (eg 4)',                                    type: 'number',   required: false, placeholder: '' },
        { key: 'approved_amount_zar_m', label: 'Approved amount (ZAR millions, eg 180)',                         type: 'number',   required: false, placeholder: row.facility_limit_zar_m != null ? String(row.facility_limit_zar_m) : '' },
      ],
      cascadeTo: [],
    });
  }

  if (CAN_REFER_BACK.includes(s)) {
    actions.push({
      key: 'refer-back',
      label: 'Refer back for re-analysis (Committee)',
      fields: [
        { key: 'committee_basis', label: 'Referral basis (what further analysis the committee requires — required)', type: 'textarea', required: true,  placeholder: '' },
        { key: 'reason_code',     label: 'Reason code (eg "MODEL_REVISION", "SECURITY_GAP")',                       type: 'text',     required: false, placeholder: '' },
        { key: 'decision_notes',  label: 'Decision notes (optional)',                                               type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (CAN_DECLINE.includes(s)) {
    const declineFields: ChainAction['fields'] = [
      { key: 'decline_ref',   label: 'Decline reference (eg "DECLINE-2026-0009")',                                type: 'text',     required: false, placeholder: '' },
      { key: 'decline_basis', label: 'Decline basis (credit rationale — required)',                               type: 'textarea', required: true,  placeholder: '' },
      { key: 'reason_code',   label: 'Reason code (eg "DSCR_BELOW_FLOOR", "OUTSIDE_APPETITE")',                   type: 'text',     required: false, placeholder: '' },
    ];
    if (row.facility_tier === 'systemic') {
      declineFields.push({
        key: 'regulator_ref', label: 'SARB reference (systemic decline is reportable — required)',                 type: 'text',     required: true,  placeholder: '',
      });
    }
    actions.push({
      key: 'decline',
      label: 'Decline (Lender)',
      fields: declineFields,
      // crosses SARB for systemic
      cascadeTo: row.facility_tier === 'systemic' ? ['regulator'] : [],
    });
  }

  if (CAN_WITHDRAW.includes(s)) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw application (Applicant)',
      fields: [
        { key: 'reason_code',    label: 'Reason code (eg "APPLICANT_WITHDREW", "ALT_FUNDING")',  type: 'text',     required: false, placeholder: '' },
        { key: 'decision_notes', label: 'Withdrawal notes (optional)',                           type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

// ── detail panel ──────────────────────────────────────────────────────────
function renderDetail(row: CreditFacilityRow): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="Applicant"         value={row.applicant_party_name} />
      <DetailPair label="Lender of record"  value={row.lender_name ?? '—'} />
      <DetailPair label="Sponsor"           value={row.sponsor_name ?? '—'} />
      <DetailPair label="Tier"              value={row.facility_tier} />
      <DetailPair label="Facility"          value={row.facility_name} />
      <DetailPair label="Facility type"     value={row.facility_type ?? '—'} />
      <DetailPair label="Facility limit"    value={fmtZarM(row.facility_limit_zar_m)} />
      <DetailPair label="Approved amount"   value={fmtZarM(row.approved_amount_zar_m)} />
      <DetailPair label="Tenor (months)"    value={row.tenor_months != null ? String(row.tenor_months) : '—'} />
      <DetailPair label="Margin (bps)"      value={row.margin_bps != null ? String(row.margin_bps) : '—'} />
      <DetailPair label="Pricing basis"     value={row.pricing_basis ?? '—'} />
      <DetailPair label="Sector"            value={row.sector ?? '—'} />
      <DetailPair label="Project"           value={row.project_name ?? '—'} />
      <DetailPair label="Credit grade"      value={row.credit_rating ?? '—'} />
      <DetailPair label="Base-case DSCR"    value={row.dscr_base != null ? row.dscr_base.toFixed(2) : '—'} />
      <DetailPair label="LTV %"             value={row.ltv_pct != null ? `${row.ltv_pct}%` : '—'} />
      <DetailPair label="Gearing %"         value={row.gearing_pct != null ? `${row.gearing_pct}%` : '—'} />
      <DetailPair label="PD %"              value={row.pd_pct != null ? `${row.pd_pct}%` : '—'} />
      <DetailPair label="LGD %"             value={row.lgd_pct != null ? `${row.lgd_pct}%` : '—'} />
      <DetailPair label="EAD"               value={fmtZarM(row.ead_zar_m)} />
      <DetailPair label="Conditions"        value={row.conditions_count != null ? String(row.conditions_count) : '—'} />
      <DetailPair label="CPs"               value={row.cp_count != null ? String(row.cp_count) : '—'} />
      <DetailPair label="Referral round"    value={String(row.referral_round)} />
      <DetailPair label="Approval ref"      value={row.approval_ref ?? '—'} />
      <DetailPair label="Agreement ref"     value={row.agreement_ref ?? '—'} />
      <DetailPair label="Activation ref"    value={row.activation_ref ?? '—'} />
      <DetailPair label="Reportable"        value={row.is_reportable ? 'Yes — SARB' : 'No'} />
      <DetailPair label="Escalation level"  value={String(row.escalation_level)} />
      <DetailPair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
      <DetailPair label="SLA status"        value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
      <DetailPair label="Reason code"       value={row.reason_code ?? '—'} />
      <DetailPair label="Regulator ref"     value={row.regulator_ref ?? '—'} />
      {row.source_wave && (
        <DetailPair label="Source" value={`${row.source_wave} · ${row.source_entity_id ?? ''}`} />
      )}
      {row.decision_notes && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Decision notes</div>
          <div style={{ color: TX2 }}>{row.decision_notes}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function CreditOriginationChainTab() {
  const [rows, setRows] = useState<CreditFacilityRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: CreditFacilityRow[] } & KpiSummary }>('/credit-origination/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          open_count: data.open_count || 0,
          available_count: data.available_count || 0,
          declined_count: data.declined_count || 0,
          withdrawn_count: data.withdrawn_count || 0,
          in_committee_count: data.in_committee_count || 0,
          conditions_pending_count: data.conditions_pending_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          large_exposure_open: data.large_exposure_open || 0,
          total_limit_zar_m: data.total_limit_zar_m || 0,
          total_approved_zar_m: data.total_approved_zar_m || 0,
          available_limit_zar_m: data.available_limit_zar_m || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load credit origination chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/credit-origination/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/credit-origination/chain/${rowId}`);
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
      const res = await api.get<{ data: { events: ChainEvent[] } }>(`/credit-origination/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')            return true;
      if (filter === 'active')         return !r.is_terminal;
      if (filter === 'reportable')     return r.is_reportable;
      if (filter === 'large_exposure') return r.is_large_exposure;
      if (filter === 'breached')       return r.sla_breached;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, open_count: 0, available_count: 0, declined_count: 0,
    withdrawn_count: 0, in_committee_count: 0, conditions_pending_count: 0,
    breached: 0, reportable_total: 0, large_exposure_open: 0,
    total_limit_zar_m: 0, total_approved_zar_m: 0, available_limit_zar_m: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>
          Credit Facility Origination &amp; Credit Approval — NCA + Banks Act + Basel III + SARB
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          The front-end of project finance — the credit-approval gate a borrower passes before any
          money is committed. Application → screening (eligibility / KYC / NCA affordability) →
          credit assessment (financial model / DD / security) → credit committee (approve / approve
          with conditions / refer back / decline) → agreement issued → conditions precedent
          satisfied → facility available to draw. Sits upstream of every other lender chain.
          INVERTED tier SLA — the bigger the facility, the more time every window allows. Activating
          a large-exposure facility (major + systemic) crosses the SARB large-exposure inbox;
          declining a systemic facility crosses too.
        </p>
      </header>

      {/* KPI strip — primary row */}
      <div className="mb-2 flex flex-wrap gap-2">
        <KpiTile label="Total"           value={kpis.total} />
        <KpiTile label="In pipeline"     value={kpis.open_count}            tone={kpis.open_count > 0 ? 'warn' : undefined} />
        <KpiTile label="At committee"    value={kpis.in_committee_count} />
        <KpiTile label="Conditions"      value={kpis.conditions_pending_count} />
        <KpiTile label="Available"       value={kpis.available_count}       tone={kpis.available_count > 0 ? 'ok' : undefined} />
        <KpiTile label="Declined"        value={kpis.declined_count}        tone={kpis.declined_count > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached"    value={kpis.breached}              tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Available limit" value={fmtZarM(kpis.available_limit_zar_m)} />
      </div>

      {/* KPI strip — secondary row */}
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: TX2 }}>
        <span>Withdrawn: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.withdrawn_count}</span></span>
        <span>SARB reportable: <span style={{ fontWeight: 600, color: BAD }}>{kpis.reportable_total}</span></span>
        <span>Large exposure open: <span style={{ fontWeight: 600, color: BAD }}>{kpis.large_exposure_open}</span></span>
        <span>Pipeline limit: <span style={{ fontWeight: 600, color: TX1 }}>{fmtZarM(kpis.total_limit_zar_m)}</span></span>
        <span>Approved: <span style={{ fontWeight: 600, color: GOOD }}>{fmtZarM(kpis.total_approved_zar_m)}</span></span>
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
              title={`${row.application_number} — ${row.applicant_party_name}`}
              meta={[
                row.facility_tier,
                fmtZarM(row.facility_limit_zar_m),
                row.sector ?? '',
              ].filter(Boolean).join(' · ')}
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
              No applications match.
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

export default CreditOriginationChainTab;
