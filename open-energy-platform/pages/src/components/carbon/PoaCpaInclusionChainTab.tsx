// Wave 73 — Carbon PoA / Programme-of-Activities Sub-Project (CPA) Inclusion &
// Conformance lifecycle tab.
//
// The ONE-TO-MANY operational layer of the carbon portfolio. A Programme of
// Activities (CDM PoA / Gold Standard GS4GG programme / Verra grouped project)
// is registered ONCE; individual Component Project Activities (CPAs) are then
// screened in over the programme lifetime, gated on a host-country Letter of
// Approval, monitored and verified for ongoing conformance — and DELISTED
// (excluded) if they stop conforming. Where W37 registers a single project,
// W11 verifies a monitoring period, W56 re-validates a crediting period and
// W65 sells reductions forward, THIS chain governs how component activities are
// screened into and kept conformant within a registered programme.
//
//   cpa_proposed → eligibility_screening → methodology_check → loa_pending →
//     inclusion_review → included → monitoring → verified (clean path);
//   monitoring loop: verified → (continue) → monitoring → (verify) → verified;
//   rejected (failed eligibility/methodology/inclusion), excluded (DELISTED),
//   withdrawn (pulled before inclusion), completed (end of crediting).
//
// INVERTED SLA — the larger the CPA, the LONGER every window (deeper diligence);
// a micro CPA gets the fast-track. The W73 signature is DELISTING-driven:
// exclude_cpa crosses to the regulator inbox for EVERY tier; approve_inclusion
// crosses when a corresponding adjustment is required (Article 6) else for the
// large tiers (large + mega); reject_cpa and SLA breach cross for the large
// tiers. Beats CDM PoA / GS4GG / Verra grouped projects (slow, manual,
// month-long CPA inclusion) via automated eligibility scoring, a real-time
// double-counting / geo-overlap guard, programme-cap headroom and an SLA-driven
// inclusion turnaround the desk can quote up front.

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
  | 'cpa_proposed' | 'eligibility_screening' | 'methodology_check' | 'loa_pending'
  | 'inclusion_review' | 'included' | 'monitoring' | 'verified'
  | 'rejected' | 'excluded' | 'withdrawn' | 'completed';

type Tier = 'micro' | 'small' | 'medium' | 'large' | 'mega';

type TransferType = 'article6' | 'voluntary' | 'compliance';

interface CpaRow {
  [key: string]: unknown;
  id: string;
  cpa_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  programme_id: string;
  programme_name: string | null;
  registry_standard: string | null;
  methodology_id: string | null;
  cpa_ref: string | null;
  cpa_name: string | null;
  proponent_party_id: string | null;
  proponent_party_name: string | null;
  coordinating_entity_name: string | null;
  dna_name: string | null;
  vvb_name: string | null;
  host_country: string | null;
  geo_key: string | null;
  transfer_type: TransferType;
  cpa_tier: Tier;
  annual_er_tco2e: number;
  requires_corresponding_adjustment: number;
  corresponding_adjustment_ref: string | null;
  programme_cap_er_tco2e: number | null;
  included_er_tco2e: number | null;
  programme_headroom_tco2e: number | null;
  vintage_year: number | null;
  crediting_period_start: string | null;
  crediting_period_end: string | null;
  methodology_applicability: number | null;
  additionality_strength: number | null;
  monitoring_readiness: number | null;
  loa_confidence: number | null;
  eligibility_score: number | null;
  predicted_inclusion_days: number | null;
  screened_flag: number;
  methodology_ok_flag: number;
  loa_received_flag: number;
  inclusion_submitted_flag: number;
  included_flag: number;
  verified_flag: number;
  screening_ref: string | null;
  methodology_ref: string | null;
  loa_ref: string | null;
  inclusion_ref: string | null;
  monitoring_ref: string | null;
  verification_ref: string | null;
  exclusion_ref: string | null;
  rejection_ref: string | null;
  withdrawal_ref: string | null;
  completion_ref: string | null;
  regulator_ref: string | null;
  proposal_basis: string | null;
  screening_basis: string | null;
  methodology_basis: string | null;
  loa_basis: string | null;
  inclusion_basis: string | null;
  monitoring_basis: string | null;
  verification_basis: string | null;
  exclusion_basis: string | null;
  rejection_basis: string | null;
  withdrawal_basis: string | null;
  completion_basis: string | null;
  reason_code: string | null;
  cpa_summary: string | null;
  monitoring_round: number;
  chain_status: ChainStatus;
  cpa_proposed_at: string;
  eligibility_screening_at: string | null;
  methodology_check_at: string | null;
  loa_pending_at: string | null;
  inclusion_review_at: string | null;
  included_at: string | null;
  monitoring_at: string | null;
  verified_at: string | null;
  rejected_at: string | null;
  excluded_at: string | null;
  withdrawn_at: string | null;
  completed_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  requires_corresponding_adjustment_flag?: boolean;
  breach_crosses_regulator?: boolean;
  programme_headroom_live?: number;
}

interface KpiSummary {
  total: number;
  open_count: number;
  included_count: number;
  monitoring_count: number;
  verified_count: number;
  excluded_count: number;
  rejected_count: number;
  withdrawn_count: number;
  completed_count: number;
  breached: number;
  reportable_total: number;
  article6_count: number;
  total_annual_er: number;
  included_annual_er: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'cpa_proposed',
  'eligibility_screening',
  'methodology_check',
  'loa_pending',
  'inclusion_review',
  'included',
  'monitoring',
  'verified',
];

const BRANCH_STATES: readonly string[] = [
  'rejected',
  'excluded',
  'withdrawn',
  'completed',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'Active' },
  { key: 'all',                   label: 'All' },
  { key: 'micro',                 label: 'Micro' },
  { key: 'small',                 label: 'Small' },
  { key: 'medium',                label: 'Medium' },
  { key: 'large',                 label: 'Large' },
  { key: 'mega',                  label: 'Mega' },
  { key: 'article6',              label: 'Article 6' },
  { key: 'included',              label: 'Included' },
  { key: 'monitoring',            label: 'Monitoring' },
  { key: 'verified',              label: 'Verified' },
  { key: 'excluded',              label: 'Excluded' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'cpa_proposed',          label: 'Proposed' },
  { key: 'eligibility_screening', label: 'Screening' },
  { key: 'methodology_check',     label: 'Methodology' },
  { key: 'loa_pending',           label: 'LoA pending' },
  { key: 'inclusion_review',      label: 'Inclusion review' },
  { key: 'rejected',              label: 'Rejected' },
  { key: 'withdrawn',             label: 'Withdrawn' },
  { key: 'completed',             label: 'Completed' },
];

// ── state/tier helpers ────────────────────────────────────────────────────
const TERMINAL_STATES: ChainStatus[] = ['rejected', 'excluded', 'withdrawn', 'completed'];
const REJECTABLE_STATES: ChainStatus[] = ['eligibility_screening', 'methodology_check', 'inclusion_review'];
const EXCLUDABLE_STATES: ChainStatus[] = ['included', 'monitoring', 'verified'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['cpa_proposed', 'eligibility_screening', 'methodology_check', 'loa_pending', 'inclusion_review'];
const COMPLETABLE_STATES: ChainStatus[] = ['monitoring', 'verified'];

const TIER_LABEL: Record<Tier, string> = {
  micro:  'Micro (<1k)',
  small:  'Small (<10k)',
  medium: 'Medium (<100k)',
  large:  'Large (<500k)',
  mega:   'Mega (≥500k)',
};

const TRANSFER_LABEL: Record<TransferType, string> = {
  article6:   'Article 6 (ITMO)',
  voluntary:  'Voluntary',
  compliance: 'Compliance',
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
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('en-ZA')} tCO₂e`;
}

function fmtScore(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n}/100`;
}

// ── action builder ────────────────────────────────────────────────────────
function getActions(row: CpaRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const requiresCA = row.requires_corresponding_adjustment_flag ?? !!row.requires_corresponding_adjustment;

  // Primary forward action
  switch (row.chain_status) {
    case 'cpa_proposed':
      actions.push({
        key: 'screen-eligibility',
        label: 'Screen eligibility (coordinating entity)',
        tone: 'primary',
        cascadeTo: [],
        fields: [
          { key: 'screening_basis', label: 'Screening basis — the automated eligibility assessment of the proposed CPA against the programme inclusion criteria', type: 'textarea', required: true },
          { key: 'screening_ref', label: 'Screening reference (e.g. SCR-2026-0007)', type: 'text', required: false, placeholder: '' },
          { key: 'geo_key', label: 'Geo key (erf / parcel / grid-node id — drives the double-counting / overlap guard)', type: 'text', required: false, placeholder: row.geo_key || '' },
          { key: 'methodology_applicability', label: 'Methodology applicability (0..1)', type: 'number', required: false, placeholder: String(row.methodology_applicability ?? 0.8) },
          { key: 'additionality_strength', label: 'Additionality strength (0..1)', type: 'number', required: false, placeholder: String(row.additionality_strength ?? 0.8) },
          { key: 'monitoring_readiness', label: 'Monitoring readiness (0..1)', type: 'number', required: false, placeholder: String(row.monitoring_readiness ?? 0.8) },
          { key: 'loa_confidence', label: 'LoA confidence (0..1)', type: 'number', required: false, placeholder: String(row.loa_confidence ?? 0.8) },
        ],
      });
      break;
    case 'eligibility_screening':
      actions.push({
        key: 'check-methodology',
        label: 'Check methodology (coordinating entity)',
        tone: 'primary',
        cascadeTo: [],
        fields: [
          { key: 'methodology_basis', label: 'Methodology basis — confirmation the CPA conforms to the registered programme methodology', type: 'textarea', required: true },
          { key: 'methodology_ref', label: 'Methodology reference (e.g. METH-2026-0007)', type: 'text', required: false, placeholder: '' },
          { key: 'methodology_id', label: 'Methodology id (e.g. AMS-I.D / VM0042)', type: 'text', required: false, placeholder: row.methodology_id || '' },
        ],
      });
      break;
    case 'methodology_check':
      actions.push({
        key: 'request-loa',
        label: 'Request host-country LoA (DNA)',
        tone: 'primary',
        cascadeTo: [],
        fields: [
          { key: 'loa_basis', label: 'LoA basis — the host-country DNA Letter of Approval gating inclusion', type: 'textarea', required: true },
          { key: 'loa_ref', label: 'LoA reference (e.g. LOA-ZA-2026-0007)', type: 'text', required: false, placeholder: '' },
          { key: 'corresponding_adjustment_ref', label: 'Corresponding-adjustment reference (Article 6 only — the NDC authorisation)', type: 'text', required: false, placeholder: row.corresponding_adjustment_ref || '' },
        ],
      });
      break;
    case 'loa_pending':
      actions.push({
        key: 'submit-inclusion',
        label: 'Submit for inclusion (proponent)',
        tone: 'primary',
        cascadeTo: [],
        fields: [
          { key: 'inclusion_basis', label: 'Inclusion basis — the inclusion request submitted into the registered programme', type: 'textarea', required: true },
          { key: 'inclusion_ref', label: 'Inclusion reference (e.g. INC-2026-0007)', type: 'text', required: false, placeholder: '' },
        ],
      });
      break;
    case 'inclusion_review':
      // approve_inclusion crosses regulator when Article 6 (CA required) OR large/mega tiers
      actions.push({
        key: 'approve-inclusion',
        label: 'Approve inclusion (coordinating entity)',
        tone: 'primary',
        cascadeTo: (requiresCA || row.cpa_tier === 'large' || row.cpa_tier === 'mega') ? ['regulator'] : [],
        fields: [
          { key: 'inclusion_basis', label: 'Inclusion approval basis — the CPA is screened into the programme', type: 'textarea', required: true },
          { key: 'inclusion_ref', label: 'Inclusion reference (e.g. INC-2026-0007)', type: 'text', required: false, placeholder: '' },
          { key: 'included_er_tco2e', label: 'Programme included ER after this CPA (tCO₂e — leave blank to add this CPA to the running total)', type: 'number', required: false, placeholder: '' },
          { key: 'regulator_ref', label: 'Regulator reference (if reportable)', type: 'text', required: false, placeholder: '' },
        ],
      });
      break;
    case 'included':
      actions.push({
        key: 'begin-monitoring',
        label: 'Begin monitoring (proponent)',
        tone: 'primary',
        cascadeTo: [],
        fields: [
          { key: 'monitoring_basis', label: 'Monitoring basis — the CPA enters its monitoring period under the programme', type: 'textarea', required: true },
          { key: 'monitoring_ref', label: 'Monitoring reference (e.g. MON-2026-0007)', type: 'text', required: false, placeholder: '' },
        ],
      });
      break;
    case 'monitoring':
      actions.push({
        key: 'verify-period',
        label: 'Verify period (VVB)',
        tone: 'primary',
        cascadeTo: [],
        fields: [
          { key: 'verification_basis', label: 'Verification basis — the VVB confirms ongoing conformance for the monitoring period', type: 'textarea', required: true },
          { key: 'verification_ref', label: 'Verification reference (e.g. VER-2026-0007)', type: 'text', required: false, placeholder: '' },
        ],
      });
      break;
    case 'verified':
      actions.push({
        key: 'continue-monitoring',
        label: 'Continue monitoring (coordinating entity)',
        tone: 'primary',
        cascadeTo: [],
        fields: [
          { key: 'monitoring_basis', label: 'Monitoring basis — the CPA continues into the next monitoring period', type: 'textarea', required: true },
          { key: 'monitoring_ref', label: 'Monitoring reference (e.g. MON-2026-0008)', type: 'text', required: false, placeholder: '' },
        ],
      });
      break;
    default:
      break;
  }

  // Secondary: reject — available from eligibility_screening, methodology_check, inclusion_review
  // reject_cpa crosses regulator for large/mega tiers
  if (REJECTABLE_STATES.includes(row.chain_status)) {
    actions.push({
      key: 'reject-cpa',
      label: 'Reject CPA (coordinating entity)',
      tone: 'danger',
      cascadeTo: (row.cpa_tier === 'large' || row.cpa_tier === 'mega') ? ['regulator'] : [],
      fields: [
        { key: 'rejection_basis', label: 'Rejection basis — the CPA failed eligibility, methodology or inclusion review', type: 'textarea', required: true },
        { key: 'reason_code', label: 'Reason code (e.g. methodology_mismatch / additionality_fail / overlap)', type: 'text', required: false, placeholder: 'methodology_mismatch' },
        { key: 'rejection_ref', label: 'Rejection reference (e.g. REJ-2026-0007)', type: 'text', required: false, placeholder: '' },
        { key: 'regulator_ref', label: 'Regulator reference (large/mega only)', type: 'text', required: false, placeholder: '' },
      ],
    });
  }

  // Secondary: exclude — available from included, monitoring, verified
  // exclude_cpa crosses regulator for EVERY tier (W73 signature)
  if (EXCLUDABLE_STATES.includes(row.chain_status)) {
    actions.push({
      key: 'exclude-cpa',
      label: 'Exclude / delist CPA (coordinating entity)',
      tone: 'danger',
      cascadeTo: ['regulator'],
      fields: [
        { key: 'exclusion_basis', label: 'Exclusion basis — DELIST the CPA for non-conformance after inclusion (the W73 signature)', type: 'textarea', required: true },
        { key: 'reason_code', label: 'Reason code (e.g. non_conformance / reversal / monitoring_lapse)', type: 'text', required: false, placeholder: 'non_conformance' },
        { key: 'exclusion_ref', label: 'Exclusion reference (e.g. EXC-2026-0007)', type: 'text', required: false, placeholder: '' },
        { key: 'regulator_ref', label: 'Regulator reference (delisting always reportable)', type: 'text', required: false, placeholder: '' },
      ],
    });
  }

  // Secondary: complete — available from monitoring, verified
  if (COMPLETABLE_STATES.includes(row.chain_status)) {
    actions.push({
      key: 'complete-cpa',
      label: 'Complete CPA (coordinating entity)',
      tone: 'ghost',
      cascadeTo: [],
      fields: [
        { key: 'completion_basis', label: 'Completion basis — the CPA reached the end of crediting under the programme', type: 'textarea', required: true },
        { key: 'completion_ref', label: 'Completion reference (e.g. CMP-2026-0007)', type: 'text', required: false, placeholder: '' },
      ],
    });
  }

  // Secondary: withdraw — available before inclusion
  if (WITHDRAWABLE_STATES.includes(row.chain_status)) {
    actions.push({
      key: 'withdraw-cpa',
      label: 'Withdraw CPA (proponent)',
      tone: 'warn',
      cascadeTo: [],
      fields: [
        { key: 'withdrawal_basis', label: 'Withdrawal basis — the proponent pulls the CPA before inclusion', type: 'textarea', required: true },
        { key: 'reason_code', label: 'Reason code (e.g. proponent_withdrawn / commercial)', type: 'text', required: false, placeholder: 'proponent_withdrawn' },
        { key: 'withdrawal_ref', label: 'Withdrawal reference (e.g. WDR-2026-0007)', type: 'text', required: false, placeholder: '' },
      ],
    });
  }

  return actions;
}

function renderDetail(row: CpaRow): React.ReactNode {
  const requiresCA = row.requires_corresponding_adjustment_flag ?? !!row.requires_corresponding_adjustment;
  const reportable = row.is_reportable_flag ?? !!row.is_reportable;
  const headroom = row.programme_headroom_live ?? row.programme_headroom_tco2e;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="Registry standard"    value={row.registry_standard ?? '—'} />
      <DetailPair label="Transfer type"        value={TRANSFER_LABEL[row.transfer_type]} />
      <DetailPair label="Methodology"          value={row.methodology_id ?? '—'} />
      <DetailPair label="Host country"         value={row.host_country ?? '—'} />
      <DetailPair label="Corresp. adjustment"  value={requiresCA ? 'Required (Article 6)' : 'Not required'} />
      <DetailPair label="CA reference"         value={row.corresponding_adjustment_ref ?? '—'} />
      <DetailPair label="Geo key"              value={row.geo_key ?? '—'} />
      <DetailPair label="Annual ER"            value={fmtTco2e(row.annual_er_tco2e)} />
      <DetailPair label="Eligibility score"    value={fmtScore(row.eligibility_score)} />
      <DetailPair label="Predicted inclusion"  value={row.predicted_inclusion_days ? `${row.predicted_inclusion_days}d` : '—'} />
      <DetailPair label="Methodology applic."  value={row.methodology_applicability != null ? row.methodology_applicability.toFixed(2) : '—'} />
      <DetailPair label="Additionality"        value={row.additionality_strength != null ? row.additionality_strength.toFixed(2) : '—'} />
      <DetailPair label="Monitoring readiness" value={row.monitoring_readiness != null ? row.monitoring_readiness.toFixed(2) : '—'} />
      <DetailPair label="LoA confidence"       value={row.loa_confidence != null ? row.loa_confidence.toFixed(2) : '—'} />
      <DetailPair label="Programme cap"        value={fmtTco2e(row.programme_cap_er_tco2e)} />
      <DetailPair label="Included ER"          value={fmtTco2e(row.included_er_tco2e)} />
      <DetailPair label="Programme headroom"   value={fmtTco2e(headroom)} />
      <DetailPair label="Vintage year"         value={row.vintage_year ? String(row.vintage_year) : '—'} />
      <DetailPair label="Crediting period"     value={`${row.crediting_period_start || '—'} → ${row.crediting_period_end || '—'}`} />
      <DetailPair label="Proponent"            value={row.proponent_party_name ?? '—'} />
      <DetailPair label="Coordinating entity"  value={row.coordinating_entity_name ?? '—'} />
      <DetailPair label="DNA"                  value={row.dna_name ?? '—'} />
      <DetailPair label="VVB"                  value={row.vvb_name ?? '—'} />
      <DetailPair label="Screening ref"        value={row.screening_ref ?? '—'} />
      <DetailPair label="Methodology ref"      value={row.methodology_ref ?? '—'} />
      <DetailPair label="LoA ref"              value={row.loa_ref ?? '—'} />
      <DetailPair label="Inclusion ref"        value={row.inclusion_ref ?? '—'} />
      <DetailPair label="Verification ref"     value={row.verification_ref ?? '—'} />
      <DetailPair label="Regulator ref"        value={row.regulator_ref ?? '—'} />
      <DetailPair label="Reason code"          value={row.reason_code ?? '—'} />
      <DetailPair label="Monitoring round"     value={String(row.monitoring_round)} />
      <DetailPair label="Proposed"             value={fmtDate(row.cpa_proposed_at)} />
      <DetailPair label="Screened"             value={fmtDate(row.eligibility_screening_at)} />
      <DetailPair label="Methodology checked"  value={fmtDate(row.methodology_check_at)} />
      <DetailPair label="LoA pending"          value={fmtDate(row.loa_pending_at)} />
      <DetailPair label="Inclusion review"     value={fmtDate(row.inclusion_review_at)} />
      <DetailPair label="Included"             value={fmtDate(row.included_at)} />
      <DetailPair label="Monitoring"           value={fmtDate(row.monitoring_at)} />
      <DetailPair label="Verified"             value={fmtDate(row.verified_at)} />
      <DetailPair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
      <DetailPair label="SLA status"           value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
      <DetailPair label="Escalation lvl"       value={String(row.escalation_level)} />
      <DetailPair label="Reportable"           value={reportable ? 'Yes' : 'No'} />
      {row.source_wave && (
        <DetailPair label="Sourced from" value={`${row.source_wave}${row.source_entity_id ? ' · ' + row.source_entity_id : ''}`} />
      )}

      {row.cpa_summary && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>CPA summary</div>
          <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{row.cpa_summary}</div>
        </div>
      )}
      {row.proposal_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Proposal basis</div>
          <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{row.proposal_basis}</div>
        </div>
      )}
      {row.screening_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Screening basis</div>
          <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{row.screening_basis}</div>
        </div>
      )}
      {row.methodology_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Methodology basis</div>
          <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{row.methodology_basis}</div>
        </div>
      )}
      {row.loa_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: WARN }}>LoA basis (DNA)</div>
          <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{row.loa_basis}</div>
        </div>
      )}
      {row.inclusion_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: WARN }}>Inclusion basis</div>
          <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{row.inclusion_basis}</div>
        </div>
      )}
      {row.monitoring_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: GOOD }}>Monitoring basis</div>
          <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{row.monitoring_basis}</div>
        </div>
      )}
      {row.verification_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: GOOD }}>Verification basis (VVB)</div>
          <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{row.verification_basis}</div>
        </div>
      )}
      {row.rejection_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Rejection basis</div>
          <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{row.rejection_basis}</div>
        </div>
      )}
      {row.exclusion_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Exclusion / delisting basis</div>
          <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{row.exclusion_basis}</div>
        </div>
      )}
      {row.withdrawal_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Withdrawal basis</div>
          <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{row.withdrawal_basis}</div>
        </div>
      )}
      {row.completion_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Completion basis</div>
          <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{row.completion_basis}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function PoaCpaInclusionChainTab() {
  const [rows, setRows] = useState<CpaRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: CpaRow[] } & KpiSummary }>('/poa-inclusion/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        setKpis({
          total: d.total,
          open_count: d.open_count,
          included_count: d.included_count,
          monitoring_count: d.monitoring_count,
          verified_count: d.verified_count,
          excluded_count: d.excluded_count,
          rejected_count: d.rejected_count,
          withdrawn_count: d.withdrawn_count,
          completed_count: d.completed_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          article6_count: d.article6_count,
          total_annual_er: d.total_annual_er,
          included_annual_er: d.included_annual_er,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load CPA inclusion records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/poa-inclusion/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/poa-inclusion/chain/${rowId}`);
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
      const res = await api.get<{ data: { case: CpaRow; events: ChainEvent[] } }>(`/poa-inclusion/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return !!r.sla_breached;
      if (filter === 'reportable') return r.is_reportable_flag ?? !!r.is_reportable;
      if (filter === 'article6')   return r.transfer_type === 'article6';
      if (filter === 'micro' || filter === 'small' || filter === 'medium' || filter === 'large' || filter === 'mega') {
        return r.cpa_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const k = kpis ?? {
    total: rows.length, open_count: 0, included_count: 0, monitoring_count: 0,
    verified_count: 0, excluded_count: 0, rejected_count: 0, withdrawn_count: 0,
    completed_count: 0, breached: 0, reportable_total: 0, article6_count: 0,
    total_annual_er: 0, included_annual_er: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Carbon PoA — CPA inclusion &amp; conformance</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-stage one-to-many inclusion chain · proposed → eligibility screening → methodology check →
          LoA pending → inclusion review → included → monitoring → verified, with a verified ↔ monitoring
          conformance loop. INVERTED SLA: the larger the CPA, the longer every window.
          The W73 signature is delisting-driven — exclude_cpa crosses to the regulator inbox for every tier.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"              value={k.total} />
        <KpiTile label="Open"               value={k.open_count} />
        <KpiTile label="Included"           value={k.included_count}     tone={k.included_count > 0 ? 'ok' : undefined} />
        <KpiTile label="Monitoring"         value={k.monitoring_count}   tone={k.monitoring_count > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Verified"           value={k.verified_count}     tone={k.verified_count > 0 ? 'ok' : undefined} />
        <KpiTile label="Excluded (delisted)"value={k.excluded_count}     tone={k.excluded_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Rejected"           value={k.rejected_count}     tone={k.rejected_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Withdrawn"          value={k.withdrawn_count} />
        <KpiTile label="Completed"          value={k.completed_count}    tone={k.completed_count > 0 ? 'ok' : undefined} />
        <KpiTile label="SLA breached"       value={k.breached}           tone={k.breached > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Article 6 (CA)"     value={k.article6_count}     tone={k.article6_count > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Reportable"         value={k.reportable_total}   tone={k.reportable_total > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Total ER/yr"        value={fmtTco2e(k.total_annual_er)} />
        <KpiTile label="Included ER/yr"     value={fmtTco2e(k.included_annual_er)} tone={k.included_annual_er > 0 ? 'ok' : undefined} />
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
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>{err}</div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>Loading...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => {
            const requiresCA = row.requires_corresponding_adjustment_flag ?? !!row.requires_corresponding_adjustment;
            const reportable = row.is_reportable_flag ?? !!row.is_reportable;
            return (
              <ChainCard
                key={row.id}
                item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={row.cpa_name || row.programme_name || row.cpa_number}
                meta={
                  <span style={{ color: TX3, fontSize: 11 }}>
                    <span style={{ fontFamily: MONO }}>{row.cpa_number}</span>
                    {' · '}{TIER_LABEL[row.cpa_tier]}
                    {' · '}{TRANSFER_LABEL[row.transfer_type]}
                    {requiresCA && <span style={{ color: WARN }}> ⚑ CA</span>}
                    {reportable && <span style={{ color: BAD }}> ● reportable</span>}
                    {row.programme_name && row.cpa_name ? <span>{' · '}{row.programme_name}</span> : null}
                    {row.monitoring_round > 0 ? <span>{' · '}round {row.monitoring_round}</span> : null}
                    {' · '}ER {(row.annual_er_tco2e || 0).toLocaleString('en-ZA')} tCO₂e/yr
                    {row.eligibility_score != null ? <span>{' · '}elig. {fmtScore(row.eligibility_score)}</span> : null}
                  </span>
                }
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
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No CPAs match.</div>
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

export default PoaCpaInclusionChainTab;
