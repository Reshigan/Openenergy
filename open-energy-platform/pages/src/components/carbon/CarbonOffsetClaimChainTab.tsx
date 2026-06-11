// Wave 48 — Carbon Tax Offset Claim & Allowance lifecycle tab.
//
// The monetisation / utilisation end of the carbon-credit lifecycle. Where W37
// registers a project, W11 verifies its reductions (MRV), W17 retires the
// resulting credits and W42 protects their permanence, THIS chain governs the
// taxpayer claiming RETIRED, ELIGIBLE credits against their SA carbon-tax
// liability — up to 5% (general) or 10% (Annex-2 mining/petroleum) of gross
// liability per Carbon Tax Act 15 of 2019 §13.
//
//   claim_drafted → eligibility_screening → credits_earmarked → claim_submitted →
//     sars_review → allowance_granted → applied_to_return → reconciled.
//   SARS query loop: sars_review → sars_query → (respond) → sars_review.
//   rejected from sars_review; clawed_back from allowance_granted|applied_to_return;
//   withdrawn from any pre-submission state.
//
// INVERTED SLA — the larger the claim, the longer every window (a material offset
// claim warrants deeper SARS scrutiny). Single carbon-fund desk write; actor_party
// records the functional party (taxpayer / registry-COAS / sars) for audit.
// Reportability: claw_back crosses for EVERY tier; reject_claim for material tiers
// (major + standard); grant_allowance for major_claim; sla_breach for material tiers.

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
  | 'claim_drafted' | 'eligibility_screening' | 'credits_earmarked' | 'claim_submitted'
  | 'sars_review' | 'sars_query' | 'allowance_granted' | 'applied_to_return'
  | 'reconciled' | 'rejected' | 'clawed_back' | 'withdrawn';

type Tier = 'major_claim' | 'standard_claim' | 'minor_claim';

interface ClaimRow {
  [key: string]: unknown;
  id: string;
  claim_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  taxpayer_party_id: string;
  taxpayer_party_name: string;
  registry_name: string | null;
  sars_office_name: string | null;
  tax_year: number;
  industry_group: 'general' | 'annex_2';
  offset_tier: Tier;
  gross_tax_liability_zar: number | null;
  offset_limit_pct: number | null;
  offset_limit_zar: number | null;
  ct_rate_zar_per_tco2e: number | null;
  credits_claimed_tco2e: number | null;
  offset_value_zar: number | null;
  net_tax_liability_zar: number | null;
  credits_unused_tco2e: number | null;
  coas_reference: string | null;
  retirement_ref: string | null;
  sars_reference: string | null;
  query_ref: string | null;
  allowance_ref: string | null;
  return_ref: string | null;
  assessment_ref: string | null;
  clawback_ref: string | null;
  reversal_ref: string | null;
  eligibility_basis: string | null;
  earmark_basis: string | null;
  submission_basis: string | null;
  review_basis: string | null;
  query_basis: string | null;
  allowance_basis: string | null;
  reconciliation_basis: string | null;
  rejection_basis: string | null;
  clawback_basis: string | null;
  reason_code: string | null;
  claim_summary: string | null;
  chain_status: ChainStatus;
  claim_drafted_at: string;
  eligibility_screening_at: string | null;
  credits_earmarked_at: string | null;
  claim_submitted_at: string | null;
  sars_review_at: string | null;
  sars_query_at: string | null;
  allowance_granted_at: string | null;
  applied_to_return_at: string | null;
  reconciled_at: string | null;
  rejected_at: string | null;
  clawed_back_at: string | null;
  withdrawn_at: string | null;
  query_round: number;
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

interface KpiSummary {
  total: number;
  open_count: number;
  reconciled_count: number;
  rejected_count: number;
  clawed_back_count: number;
  withdrawn_count: number;
  in_review_count: number;
  granted_count: number;
  breached: number;
  reportable_total: number;
  major_open: number;
  total_credits_claimed: number;
  total_offset_value: number;
  total_credits_unused: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'claim_drafted',
  'eligibility_screening',
  'credits_earmarked',
  'claim_submitted',
  'sars_review',
  'sars_query',
  'allowance_granted',
  'applied_to_return',
  'reconciled',
];

const BRANCH_STATES: readonly string[] = [
  'rejected',
  'clawed_back',
  'withdrawn',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'Active' },
  { key: 'all',                   label: 'All' },
  { key: 'major_claim',           label: 'Major' },
  { key: 'standard_claim',        label: 'Standard' },
  { key: 'minor_claim',           label: 'Minor' },
  { key: 'in_review',             label: 'In review' },
  { key: 'granted',               label: 'Granted / applied' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'claim_drafted',         label: 'Drafted' },
  { key: 'eligibility_screening', label: 'Screening' },
  { key: 'credits_earmarked',     label: 'Earmarked' },
  { key: 'claim_submitted',       label: 'Submitted' },
  { key: 'sars_review',           label: 'SARS review' },
  { key: 'sars_query',            label: 'SARS query' },
  { key: 'allowance_granted',     label: 'Granted' },
  { key: 'applied_to_return',     label: 'Applied' },
  { key: 'reconciled',            label: 'Reconciled' },
  { key: 'rejected',              label: 'Rejected' },
  { key: 'clawed_back',           label: 'Clawed back' },
  { key: 'withdrawn',             label: 'Withdrawn' },
];

// ── action helpers ────────────────────────────────────────────────────────
const TERMINAL_STATES: ChainStatus[] = ['reconciled', 'rejected', 'clawed_back', 'withdrawn'];
const IN_REVIEW_STATES: ChainStatus[] = ['sars_review', 'sars_query'];
const GRANTED_STATES: ChainStatus[] = ['allowance_granted', 'applied_to_return'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['claim_drafted', 'eligibility_screening', 'credits_earmarked', 'claim_submitted'];

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
  if (!n) return '—';
  return `R${n.toLocaleString('en-ZA')}`;
}

function fmtTco2e(n: number | null | undefined): string {
  if (!n) return '—';
  return `${n.toLocaleString('en-ZA')} tCO₂e`;
}

function getActions(row: ClaimRow): ChainAction[] {
  const actions: ChainAction[] = [];

  // Primary forward action per state
  if (row.chain_status === 'claim_drafted') {
    actions.push({
      key: 'screen-eligibility',
      label: 'Screen eligibility (registry)',
      fields: [
        {
          key: 'eligibility_basis',
          label: 'Eligibility basis — COAS confirmation the retired credits are SA-domestic, in-vintage and locked to this taxpayer',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
        {
          key: 'coas_reference',
          label: 'COAS reference (e.g. COAS-LOCK-2026-0007)',
          type: 'text',
          required: false,
          placeholder: row.coas_reference ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (row.chain_status === 'eligibility_screening') {
    actions.push({
      key: 'earmark-credits',
      label: 'Earmark credits (registry)',
      fields: [
        {
          key: 'earmark_basis',
          label: 'Earmark basis — which retired credit block is reserved against this tax period',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'credits_claimed_tco2e',
          label: 'Credits claimed (tCO₂e)',
          type: 'number',
          required: false,
          placeholder: String(row.credits_claimed_tco2e ?? ''),
        },
        {
          key: 'retirement_ref',
          label: 'Retirement reference (W17 retirement that yielded the credits)',
          type: 'text',
          required: false,
          placeholder: row.retirement_ref ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (row.chain_status === 'credits_earmarked') {
    actions.push({
      key: 'submit-claim',
      label: 'Submit claim (taxpayer)',
      fields: [
        {
          key: 'submission_basis',
          label: 'Submission basis — confirm the s.13 offset claim lodged via SARS eFiling',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'sars_reference',
          label: 'SARS reference (e.g. SARS-CTR-2026-0007)',
          type: 'text',
          required: false,
          placeholder: row.sars_reference ?? '',
        },
        {
          key: 'gross_tax_liability_zar',
          label: 'Gross carbon-tax liability (ZAR)',
          type: 'number',
          required: false,
          placeholder: String(row.gross_tax_liability_zar ?? ''),
        },
        {
          key: 'offset_value_zar',
          label: 'Offset value claimed (ZAR, capped at the s.13 limit)',
          type: 'number',
          required: false,
          placeholder: String(row.offset_value_zar ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  if (row.chain_status === 'claim_submitted') {
    actions.push({
      key: 'begin-review',
      label: 'Begin review (SARS)',
      fields: [
        {
          key: 'review_basis',
          label: 'Review basis — scope of the SARS assessment of the offset claim',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (row.chain_status === 'sars_review') {
    // Primary: grant allowance — crosses regulator for major_claim
    actions.push({
      key: 'grant-allowance',
      label: 'Grant allowance (SARS)',
      fields: [
        {
          key: 'allowance_basis',
          label: 'Allowance basis — SARS confirmation the s.13 offset allowance is granted',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'allowance_ref',
          label: 'Allowance reference (e.g. SARS-ALLOW-2026-0007)',
          type: 'text',
          required: false,
          placeholder: row.allowance_ref ?? '',
        },
        {
          key: 'offset_value_zar',
          label: 'Offset value granted (ZAR)',
          type: 'number',
          required: false,
          placeholder: String(row.offset_value_zar ?? ''),
        },
      ],
      cascadeTo: row.offset_tier === 'major_claim' ? ['regulator'] : [],
    });

    // Secondary: raise query
    actions.push({
      key: 'raise-query',
      label: 'Raise query (SARS)',
      fields: [
        {
          key: 'query_basis',
          label: 'Query basis — the request-for-information SARS needs before it can decide',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'query_ref',
          label: 'Query reference (e.g. SARS-RFI-2026-0007)',
          type: 'text',
          required: false,
          placeholder: row.query_ref ?? '',
        },
      ],
      cascadeTo: [],
    });

    // Secondary: reject claim — crosses regulator for major + standard (material tiers)
    actions.push({
      key: 'reject-claim',
      label: 'Reject claim (SARS)',
      fields: [
        {
          key: 'rejection_basis',
          label: 'Rejection basis — why the claim fails (ineligible / double-counted / out-of-vintage / non-SA project)',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      cascadeTo: (row.offset_tier === 'major_claim' || row.offset_tier === 'standard_claim') ? ['regulator'] : [],
    });
  }

  if (row.chain_status === 'sars_query') {
    actions.push({
      key: 'respond-query',
      label: 'Respond to query (taxpayer)',
      fields: [
        {
          key: 'review_basis',
          label: 'Response basis — the taxpayer reply / evidence furnished to SARS',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (row.chain_status === 'allowance_granted') {
    actions.push({
      key: 'apply-to-return',
      label: 'Apply to return (taxpayer)',
      fields: [
        {
          key: 'return_ref',
          label: 'Return reference — the carbon-tax return the allowance is applied to (e.g. SARS-CTR-2026-0007)',
          type: 'text',
          required: false,
          placeholder: row.return_ref ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (row.chain_status === 'applied_to_return') {
    actions.push({
      key: 'reconcile',
      label: 'Reconcile (SARS)',
      fields: [
        {
          key: 'reconciliation_basis',
          label: 'Reconciliation basis — SARS confirmation the allowance matches the assessed return',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'assessment_ref',
          label: 'Assessment reference (e.g. SARS-ASSESS-2026-0007)',
          type: 'text',
          required: false,
          placeholder: row.assessment_ref ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  // Claw back — available from allowance_granted or applied_to_return — crosses regulator EVERY tier
  if (GRANTED_STATES.includes(row.chain_status)) {
    actions.push({
      key: 'claw-back',
      label: 'Claw back allowance (SARS)',
      fields: [
        {
          key: 'clawback_basis',
          label: 'Clawback basis — audit finding the credits ineligible, OR a W42 reversal of the underlying credits',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'clawback_ref',
          label: 'Clawback reference (e.g. SARS-CLAWBACK-2026-0007)',
          type: 'text',
          required: false,
          placeholder: row.clawback_ref ?? '',
        },
        {
          key: 'reversal_ref',
          label: 'Reversal reference (the W42 reversal that triggered it, if any)',
          type: 'text',
          required: false,
          placeholder: row.reversal_ref ?? '',
        },
      ],
      cascadeTo: ['regulator'],
    });
  }

  // Withdraw — available from any pre-submission state
  if (WITHDRAWABLE_STATES.includes(row.chain_status)) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw claim (taxpayer)',
      fields: [
        {
          key: 'reason_code',
          label: 'Withdrawal reason — why the taxpayer is pulling the claim before assessment',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

function renderDetail(row: ClaimRow): React.ReactNode {
  return (
    <div style={{ fontSize: 11, color: TX1 }}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5" style={{ fontSize: 11 }}>
        <DetailPair label="Industry group"       value={row.industry_group === 'annex_2' ? 'Annex 2 (mining / petroleum)' : 'General'} />
        <DetailPair label="Tax year"             value={String(row.tax_year)} />
        <DetailPair label="SARS office"          value={row.sars_office_name ?? '—'} />
        <DetailPair label="Registry (COAS)"      value={row.registry_name ?? '—'} />
        <DetailPair label="Gross liability"      value={fmtZar(row.gross_tax_liability_zar)} />
        <DetailPair label="Offset limit"         value={`${row.offset_limit_pct ?? '—'}% · ${fmtZar(row.offset_limit_zar)}`} />
        <DetailPair label="CT rate"              value={row.ct_rate_zar_per_tco2e ? `R${row.ct_rate_zar_per_tco2e}/tCO₂e` : '—'} />
        <DetailPair label="Credits claimed"      value={fmtTco2e(row.credits_claimed_tco2e)} />
        <DetailPair label="Offset value"         value={fmtZar(row.offset_value_zar)} />
        <DetailPair label="Net liability"        value={fmtZar(row.net_tax_liability_zar)} />
        <DetailPair label="Credits unused (cap)" value={fmtTco2e(row.credits_unused_tco2e)} />
        <DetailPair label="Query round"          value={String(row.query_round)} />
        <DetailPair label="COAS ref"             value={row.coas_reference ?? '—'} />
        <DetailPair label="Retirement ref"       value={row.retirement_ref ?? '—'} />
        <DetailPair label="SARS ref"             value={row.sars_reference ?? '—'} />
        <DetailPair label="Query ref"            value={row.query_ref ?? '—'} />
        <DetailPair label="Allowance ref"        value={row.allowance_ref ?? '—'} />
        <DetailPair label="Return ref"           value={row.return_ref ?? '—'} />
        <DetailPair label="Assessment ref"       value={row.assessment_ref ?? '—'} />
        <DetailPair label="Clawback ref"         value={row.clawback_ref ?? '—'} />
        <DetailPair label="Reversal ref"         value={row.reversal_ref ?? '—'} />
        <DetailPair label="Reason code"          value={row.reason_code ?? '—'} />
        <DetailPair label="Drafted"              value={fmtDate(row.claim_drafted_at)} />
        <DetailPair label="Screening"            value={fmtDate(row.eligibility_screening_at)} />
        <DetailPair label="Earmarked"            value={fmtDate(row.credits_earmarked_at)} />
        <DetailPair label="Submitted"            value={fmtDate(row.claim_submitted_at)} />
        <DetailPair label="SARS review"          value={fmtDate(row.sars_review_at)} />
        <DetailPair label="SARS query"           value={fmtDate(row.sars_query_at)} />
        <DetailPair label="Allowance granted"    value={fmtDate(row.allowance_granted_at)} />
        <DetailPair label="Applied to return"    value={fmtDate(row.applied_to_return_at)} />
        <DetailPair label="Reconciled"           value={fmtDate(row.reconciled_at)} />
        <DetailPair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA status"           value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Escalation lvl"       value={String(row.escalation_level)} />
        <DetailPair label="Reportable"           value={row.is_reportable ? 'Yes' : 'No'} />
        {row.source_wave && (
          <DetailPair label="Source wave"        value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}`} />
        )}
      </div>
      {row.claim_summary && (
        <div className="mt-2 col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Claim summary</div>
          <div style={{ color: TX2 }}>{row.claim_summary}</div>
        </div>
      )}
      {row.eligibility_basis && (
        <div className="mt-2 col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Eligibility basis</div>
          <div style={{ color: TX2 }}>{row.eligibility_basis}</div>
        </div>
      )}
      {row.earmark_basis && (
        <div className="mt-2 col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Earmark basis</div>
          <div style={{ color: TX2 }}>{row.earmark_basis}</div>
        </div>
      )}
      {row.submission_basis && (
        <div className="mt-2 col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Submission basis</div>
          <div style={{ color: TX2 }}>{row.submission_basis}</div>
        </div>
      )}
      {row.review_basis && (
        <div className="mt-2 col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Review basis</div>
          <div style={{ color: TX2 }}>{row.review_basis}</div>
        </div>
      )}
      {row.query_basis && (
        <div className="mt-2 col-span-2 rounded border px-2 py-1.5" style={{ background: 'oklch(0.97 0.03 50)', borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: WARN }}>Query basis</div>
          <div style={{ color: TX1 }}>{row.query_basis}</div>
        </div>
      )}
      {row.allowance_basis && (
        <div className="mt-2 col-span-2 rounded border px-2 py-1.5" style={{ background: 'oklch(0.97 0.03 155)', borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: GOOD }}>Allowance basis</div>
          <div style={{ color: TX1 }}>{row.allowance_basis}</div>
        </div>
      )}
      {row.reconciliation_basis && (
        <div className="mt-2 col-span-2 rounded border px-2 py-1.5" style={{ background: 'oklch(0.97 0.03 155)', borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: GOOD }}>Reconciliation basis</div>
          <div style={{ color: TX1 }}>{row.reconciliation_basis}</div>
        </div>
      )}
      {row.rejection_basis && (
        <div className="mt-2 col-span-2 rounded border px-2 py-1.5" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Rejection basis</div>
          <div style={{ color: TX1 }}>{row.rejection_basis}</div>
        </div>
      )}
      {row.clawback_basis && (
        <div className="mt-2 col-span-2 rounded border px-2 py-1.5" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Clawback basis</div>
          <div style={{ color: TX1 }}>{row.clawback_basis}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function CarbonOffsetClaimChainTab() {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ClaimRow[] } & KpiSummary }>('/carbon-offset-claim/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        setSummary({
          total: d.total,
          open_count: d.open_count,
          reconciled_count: d.reconciled_count,
          rejected_count: d.rejected_count,
          clawed_back_count: d.clawed_back_count,
          withdrawn_count: d.withdrawn_count,
          in_review_count: d.in_review_count,
          granted_count: d.granted_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          major_open: d.major_open,
          total_credits_claimed: d.total_credits_claimed,
          total_offset_value: d.total_offset_value,
          total_credits_unused: d.total_credits_unused,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load offset claim records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/carbon-offset-claim/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { case: ClaimRow; events: ChainEvent[] } }>(
            `/carbon-offset-claim/chain/${rowId}`
          );
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
      const res = await api.get<{ data: { case: ClaimRow; events: ChainEvent[] } }>(
        `/carbon-offset-claim/chain/${id}`
      );
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'in_review')  return IN_REVIEW_STATES.includes(r.chain_status);
      if (filter === 'granted')    return GRANTED_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'major_claim' || filter === 'standard_claim' || filter === 'minor_claim') {
        return r.offset_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: 0, open_count: 0, reconciled_count: 0, rejected_count: 0,
    clawed_back_count: 0, withdrawn_count: 0, in_review_count: 0, granted_count: 0,
    breached: 0, reportable_total: 0, major_open: 0, total_credits_claimed: 0,
    total_offset_value: 0, total_credits_unused: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Carbon tax offset claims &amp; allowances</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-stage s.13 offset-allowance chain · drafted → eligibility screening → credits earmarked → submitted →
          SARS review → allowance granted → applied to return → reconciled. SARS may raise a query mid-review (respond
          to return to review). Claims reject from review; granted/applied allowances can be clawed back when an audit
          finds the credits ineligible or a W42 reversal undoes them; pre-submission claims can be withdrawn. INVERTED
          SLA: the larger the claim, the longer every window (deeper SARS scrutiny). Clawback crosses to the regulator
          inbox for every tier; rejection and SLA breach for material tiers; a material allowance grant for major
          claims (Carbon Tax Act §13 + GNR 1556 + DFFE COAS + SARS eFiling).
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"           value={kpis.total} />
        <KpiTile label="Open"            value={kpis.open_count} />
        <KpiTile label="Major open"      value={kpis.major_open}          tone={kpis.major_open > 0 ? 'warn' : undefined} />
        <KpiTile label="In review"       value={kpis.in_review_count}     tone={kpis.in_review_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Granted / applied" value={kpis.granted_count}    tone="ok" />
        <KpiTile label="SLA breached"    value={kpis.breached}            tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Reconciled"      value={kpis.reconciled_count}    tone="ok" />
        <KpiTile label="Rejected"        value={kpis.rejected_count}      tone={kpis.rejected_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Clawed back"     value={kpis.clawed_back_count}   tone={kpis.clawed_back_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Reportable"      value={kpis.reportable_total}    tone={kpis.reportable_total > 0 ? 'warn' : undefined} />
        <KpiTile label="Credits claimed" value={fmtTco2e(kpis.total_credits_claimed)} />
        <KpiTile label="Offset value"    value={fmtZar(kpis.total_offset_value)} />
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
              title={`${row.claim_number} — ${row.taxpayer_party_name}`}
              meta={`${row.offset_tier === 'major_claim' ? 'Major (≥R10m)' : row.offset_tier === 'standard_claim' ? 'Standard (R1m–R10m)' : 'Minor (<R1m)'} · ${row.industry_group === 'annex_2' ? 'Annex 2 (10%)' : 'General (5%)'} · ${row.tax_year}${row.offset_value_zar ? ` · ${fmtZar(row.offset_value_zar)}` : ''}`}
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
              No offset claims match.
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
      <div style={{ color: TX1, fontSize: 11 }}>{value}</div>
    </div>
  );
}

export default CarbonOffsetClaimChainTab;
