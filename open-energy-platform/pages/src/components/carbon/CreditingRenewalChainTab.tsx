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
  | 'renewal_due' | 'application_submitted' | 'completeness_check' | 'revision_requested'
  | 'baseline_reassessment' | 'additionality_retest' | 'vvb_validation' | 'standard_review'
  | 'renewed' | 'refused' | 'withdrawn' | 'lapsed';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'mega';

type Standard = 'verra_vcs' | 'gold_standard' | 'article_6_4' | 'cdm';

interface RenewalRow {
  [key: string]: unknown;
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

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'renewal_due',
  'application_submitted',
  'completeness_check',
  'baseline_reassessment',
  'additionality_retest',
  'vvb_validation',
  'standard_review',
  'renewed',
];
const BRANCH_STATES: readonly string[] = [
  'revision_requested',
  'refused',
  'withdrawn',
  'lapsed',
];

// ── filters ───────────────────────────────────────────────────────────────
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

// ── action helpers ────────────────────────────────────────────────────────
const TERMINAL_STATES: ChainStatus[] = ['renewed', 'refused', 'withdrawn', 'lapsed'];
const IN_REVIEW_STATES: ChainStatus[] = ['vvb_validation', 'standard_review'];
const REASSESSMENT_STATES: ChainStatus[] = ['baseline_reassessment', 'additionality_retest'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['renewal_due', 'application_submitted', 'completeness_check', 'revision_requested'];

const STANDARD_LABEL: Record<Standard, string> = {
  verra_vcs:    'Verra VCS',
  gold_standard:'Gold Standard',
  article_6_4:  'Article 6.4',
  cdm:          'CDM',
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

function getActions(row: RenewalRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  // Primary forward actions per state
  if (s === 'renewal_due') {
    actions.push({
      key: 'submit-application',
      label: 'Submit application (proponent)',
      fields: [
        {
          key: 'submission_basis',
          label: 'Submission basis — the renewal application lodged with the registry as the crediting period nears expiry',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'application_ref',
          label: 'Application reference (e.g. VCS-RENEW-2026-0007)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'annual_issuance_tco2e',
          label: 'Declared annual issuance (tCO₂e/yr — re-derives the tier)',
          type: 'number',
          required: false,
          placeholder: String(row.annual_issuance_tco2e ?? ''),
        },
        {
          key: 'crediting_period_number',
          label: 'Crediting period number being renewed',
          type: 'number',
          required: false,
          placeholder: String(row.crediting_period_number ?? ''),
        },
        {
          key: 'vvb_name',
          label: 'Appointed VVB (validation/verification body)',
          type: 'text',
          required: false,
          placeholder: row.vvb_name ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'application_submitted') {
    actions.push({
      key: 'check-completeness',
      label: 'Check completeness (registry)',
      fields: [
        {
          key: 'completeness_basis',
          label: 'Completeness basis — registry confirmation the application package is complete and admissible',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'completeness_ref',
          label: 'Completeness reference (e.g. VCS-COMPLETE-2026-0007)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'completeness_check') {
    actions.push({
      key: 'begin-baseline',
      label: 'Begin baseline reassessment (registry)',
      fields: [
        {
          key: 'baseline_basis',
          label: 'Baseline basis — scope of the baseline reassessment against current data and regulatory surplus',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
    // Secondary: request revision
    actions.push({
      key: 'request-revision',
      label: 'Request revision (registry)',
      fields: [
        {
          key: 'revision_basis',
          label: 'Revision basis — what the proponent must fix before the package can proceed',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'reason_code',
          label: 'Reason code',
          type: 'text',
          required: false,
          placeholder: 'incomplete_package',
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'revision_requested') {
    actions.push({
      key: 'resubmit',
      label: 'Resubmit (proponent)',
      fields: [
        {
          key: 'submission_basis',
          label: 'Resubmission basis — the corrected package the proponent re-lodges',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'baseline_reassessment') {
    actions.push({
      key: 'complete-baseline',
      label: 'Complete baseline (registry)',
      fields: [
        {
          key: 'baseline_basis',
          label: 'Baseline basis — the reassessed baseline result and methodology applied',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'original_baseline_tco2e',
          label: 'Original baseline (tCO₂e/yr)',
          type: 'number',
          required: false,
          placeholder: String(row.original_baseline_tco2e ?? ''),
        },
        {
          key: 'revised_baseline_tco2e',
          label: 'Revised baseline (tCO₂e/yr — typically lower)',
          type: 'number',
          required: false,
          placeholder: String(row.revised_baseline_tco2e ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'additionality_retest') {
    actions.push({
      key: 'complete-additionality',
      label: 'Complete additionality retest (registry)',
      fields: [
        {
          key: 'additionality_basis',
          label: 'Additionality basis — the re-test of whether the activity remains additional under current conditions',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'additionality_outcome',
          label: 'Additionality outcome (e.g. additional / not_additional / conditional)',
          type: 'text',
          required: false,
          placeholder: 'additional',
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'vvb_validation') {
    actions.push({
      key: 'validate',
      label: 'VVB validate (vvb)',
      fields: [
        {
          key: 'validation_basis',
          label: 'Validation basis — independent VVB opinion on the renewed baseline and additionality',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'vvb_report_ref',
          label: 'VVB report reference (e.g. VVB-VAL-2026-0007)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'vvb_name',
          label: 'VVB name',
          type: 'text',
          required: false,
          placeholder: row.vvb_name ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'standard_review') {
    // renew — crosses regulator EVERY tier when baseline cut ≥30%
    actions.push({
      key: 'renew',
      label: 'Renew crediting period (registry)',
      fields: [
        {
          key: 'decision_basis',
          label: 'Decision basis — the standard review body decision to renew the crediting period',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'decision_ref',
          label: 'Decision reference (e.g. VCS-DECISION-2026-0007)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'renewed_period_start',
          label: 'Renewed period start (YYYY-MM-DD)',
          type: 'date',
          required: false,
          placeholder: '',
        },
        {
          key: 'renewed_period_end',
          label: 'Renewed period end (YYYY-MM-DD)',
          type: 'date',
          required: false,
          placeholder: '',
        },
        {
          key: 'revised_baseline_tco2e',
          label: 'Confirmed revised baseline (tCO₂e/yr — sets baseline reduction; ≥30% cut is reportable)',
          type: 'number',
          required: false,
          placeholder: String(row.revised_baseline_tco2e ?? ''),
        },
        {
          key: 'renewal_summary',
          label: 'Renewal summary (one line for the audit record)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      // renew crosses regulator EVERY tier when baseline cut ≥30%
      cascadeTo: ['regulator'],
    });
    // refuse — crosses for large tiers (major + mega)
    actions.push({
      key: 'refuse',
      label: 'Refuse (registry)',
      fields: [
        {
          key: 'refusal_basis',
          label: 'Refusal basis — why the renewal fails (no longer additional / baseline untenable / methodology lapsed)',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'refusal_ref',
          label: 'Refusal reference (e.g. VCS-REFUSE-2026-0007)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'reason_code',
          label: 'Reason code',
          type: 'text',
          required: false,
          placeholder: 'renewal_refused',
        },
      ],
      // crosses regulator for large tiers (major + mega)
      cascadeTo: ['regulator'],
    });
  }

  // withdraw available from any pre-decision state
  if (WITHDRAWABLE_STATES.includes(s)) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (proponent)',
      fields: [
        {
          key: 'reason_code',
          label: 'Withdrawal reason — why the proponent is pulling the renewal before decision',
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

function renderDetail(row: RenewalRow): React.ReactNode {
  const downgrade = (row.baseline_reduction_pct || 0) >= 30;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="Tier" value={row.issuance_tier} />
      <DetailPair label="Standard" value={STANDARD_LABEL[row.registry_standard]} />
      <DetailPair label="Methodology" value={row.methodology_id ?? '—'} />
      <DetailPair label="Proponent" value={row.proponent_party_name} />
      <DetailPair label="VVB" value={row.vvb_name ?? '—'} />
      <DetailPair label="Annual issuance" value={fmtTco2e(row.annual_issuance_tco2e)} />
      <DetailPair label="Crediting period" value={row.crediting_period_number ? `CP${row.crediting_period_number}` : '—'} />
      <DetailPair label="Current period" value={`${fmtDate(row.current_period_start)} → ${fmtDate(row.current_period_end)}`} />
      <DetailPair label="Renewed period" value={`${fmtDate(row.renewed_period_start)} → ${fmtDate(row.renewed_period_end)}`} />
      <DetailPair label="Original baseline" value={fmtTco2e(row.original_baseline_tco2e)} />
      <DetailPair label="Revised baseline" value={fmtTco2e(row.revised_baseline_tco2e)} />
      <DetailPair
        label="Baseline cut"
        value={fmtPct(row.baseline_reduction_pct)}
        highlight={downgrade ? BAD : undefined}
      />
      <DetailPair label="Additionality" value={row.additionality_outcome ?? '—'} />
      <DetailPair label="Revision round" value={String(row.revision_round)} />
      <DetailPair label="Application ref" value={row.application_ref ?? '—'} />
      <DetailPair label="Completeness ref" value={row.completeness_ref ?? '—'} />
      <DetailPair label="VVB report ref" value={row.vvb_report_ref ?? '—'} />
      <DetailPair label="Decision ref" value={row.decision_ref ?? '—'} />
      <DetailPair label="Refusal ref" value={row.refusal_ref ?? '—'} />
      <DetailPair label="Reason code" value={row.reason_code ?? '—'} />
      <DetailPair label="Renewal due" value={fmtDate(row.renewal_due_at)} />
      <DetailPair label="Submitted" value={fmtDate(row.application_submitted_at)} />
      <DetailPair label="Completeness" value={fmtDate(row.completeness_check_at)} />
      <DetailPair label="Revision req" value={fmtDate(row.revision_requested_at)} />
      <DetailPair label="Baseline reassess" value={fmtDate(row.baseline_reassessment_at)} />
      <DetailPair label="Additionality" value={fmtDate(row.additionality_retest_at)} />
      <DetailPair label="VVB validation" value={fmtDate(row.vvb_validation_at)} />
      <DetailPair label="Standard review" value={fmtDate(row.standard_review_at)} />
      <DetailPair label="Renewed" value={fmtDate(row.renewed_at)} />
      <DetailPair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
      <DetailPair label="SLA status" value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
      <DetailPair label="Escalation lvl" value={String(row.escalation_level)} />
      <DetailPair label="Reportable" value={row.is_reportable ? 'Yes' : 'No'} />
      {row.source_wave && (
        <div className="col-span-2 text-[10px]" style={{ color: TX3 }}>
          Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
        </div>
      )}
      {row.renewal_summary && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Renewal summary</div>
          <div style={{ color: TX2 }}>{row.renewal_summary}</div>
        </div>
      )}
      {row.submission_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Submission basis</div>
          <div style={{ color: TX2 }}>{row.submission_basis}</div>
        </div>
      )}
      {row.completeness_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Completeness basis</div>
          <div style={{ color: TX2 }}>{row.completeness_basis}</div>
        </div>
      )}
      {row.revision_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: WARN }}>Revision basis</div>
          <div style={{ color: TX2 }}>{row.revision_basis}</div>
        </div>
      )}
      {row.baseline_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Baseline basis</div>
          <div style={{ color: TX2 }}>{row.baseline_basis}</div>
        </div>
      )}
      {row.additionality_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Additionality basis</div>
          <div style={{ color: TX2 }}>{row.additionality_basis}</div>
        </div>
      )}
      {row.validation_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Validation basis (VVB)</div>
          <div style={{ color: TX2 }}>{row.validation_basis}</div>
        </div>
      )}
      {row.decision_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: GOOD }}>Decision basis</div>
          <div style={{ color: TX2 }}>{row.decision_basis}</div>
        </div>
      )}
      {row.refusal_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Refusal basis</div>
          <div style={{ color: TX2 }}>{row.refusal_basis}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function CreditingRenewalChainTab() {
  const [rows, setRows] = useState<RenewalRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

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

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/crediting-renewal/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/crediting-renewal/chain/${rowId}`);
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
      const res = await api.get<{ data: { events: ChainEvent[] } }>(`/crediting-renewal/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

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

  const k = kpis ?? {
    total: 0, open_count: 0, renewed_count: 0, refused_count: 0, withdrawn_count: 0,
    lapsed_count: 0, in_review_count: 0, reassessment_count: 0, breached: 0,
    reportable_total: 0, large_open: 0, material_downgrade_count: 0,
    total_annual_issuance: 0, total_original_baseline: 0, total_revised_baseline: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Crediting-period renewal &amp; baseline reassessment</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-stage renewal chain · due → application submitted → completeness check → baseline reassessment →
          additionality retest → VVB validation → standard review → renewed. The registry can return a package for
          revision (resubmit to re-enter completeness); renewals are refused from review; pre-decision renewals can be
          withdrawn; a renewal_due window that expires without submission auto-lapses. INVERTED SLA: the larger the
          project, the longer every window. The W56 signature — a renewal whose reassessed baseline is cut by ≥30%
          crosses to the regulator inbox for every tier; refusal and SLA breach cross for the large tiers.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total" value={k.total} />
        <KpiTile label="Open" value={k.open_count} />
        <KpiTile label="Large open" value={k.large_open} tone={k.large_open > 0 ? 'warn' : undefined} />
        <KpiTile label="Reassessment" value={k.reassessment_count} tone={k.reassessment_count > 0 ? 'warn' : undefined} />
        <KpiTile label="In review" value={k.in_review_count} tone={k.in_review_count > 0 ? 'warn' : undefined} />
        <KpiTile label="SLA breached" value={k.breached} tone={k.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Renewed" value={k.renewed_count} tone={k.renewed_count > 0 ? 'ok' : undefined} />
        <KpiTile label="Refused" value={k.refused_count} tone={k.refused_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Lapsed" value={k.lapsed_count} tone={k.lapsed_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Baseline cut ≥30%" value={k.material_downgrade_count} tone={k.material_downgrade_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Reportable" value={k.reportable_total} tone={k.reportable_total > 0 ? 'warn' : undefined} />
        <KpiTile label="Annual issuance" value={fmtTco2e(k.total_annual_issuance)} />
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
              title={`${row.renewal_number}${row.is_reportable ? ' ●' : ''} — ${row.project_name}`}
              meta={`${row.issuance_tier} · ${STANDARD_LABEL[row.registry_standard]}${row.crediting_period_number ? ` · CP${row.crediting_period_number}` : ''} · ${row.proponent_party_name}`}
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
              No renewals match.
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

function DetailPair({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div style={{ color: highlight ?? TX1 }}>{value}</div>
    </div>
  );
}

export default CreditingRenewalChainTab;
