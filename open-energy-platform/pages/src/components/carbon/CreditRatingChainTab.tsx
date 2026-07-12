// Wave 109 — Carbon Credit Quality Rating & Continuous Re-rating Chain tab.
// 11th Carbon chain. Buyer-side due-diligence rating engine bridging W37
// (registration PDD), W11 (MRV verification), W42 (reversal / buffer pool).
//
// Beats Sylvera / BeZero Carbon Ratings / Pachama Verified Credits / Renoster
// Carbon Ratings / Calyx Global / Carbon Direct CDx / Patch Quality Layer /
// Cloverly Quality Tags / S&P Global carbon methodology / Moody KYC Carbon
// — each surfaces a rating as a single STATIC letter. W109 turns it into a
// 12-state P6 chain with INVERTED SLA polarity (institutional = LONGEST
// runway), FLOOR-AT-PREMIUM tier overlay, 4-step authority ladder
// (junior_analyst -> senior_analyst -> ratings_committee_chair ->
// board_rating_committee), 17-field LIVE battery (composite + 5 sub-scores +
// S&P-style 8-band AAA/AA/A/BBB/BB/B/CCC/D + 3-bridge architecture + ICROA
// bonus + monitoring freshness + drop% + downgrade-imminent flag),
// continuous monitoring with auto re-rating (90d stale -> system trigger),
// and signature regulator crossings.
//
// Standards: CCP Core Carbon Principles + ICROA Code of Best Practice +
// Article 6.4 Methodologies + ISO 14064-3 + VCS / Verra integrity.
//
// SIGNATURE crossings:
//   - downgrade              -> regulator EVERY tier on drop>=20% OR CCC/D
//   - escalate_to_integrity  -> regulator EVERY tier (fraud -> W42 reversal)
//   - publish_rating         -> premium+institutional when Article 6
//   - withdraw               -> regulator EVERY tier when issuer_disputed
//   - sla_breached           -> premium+institutional only

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
const BG     = 'var(--s0, oklch(0.96 0.003 250))';
const BG1    = 'var(--s1, oklch(0.99 0.002 80))';
const BG2    = 'var(--s2, oklch(0.93 0.004 250))';
const BORDER = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1    = 'var(--ink, oklch(0.17 0.010 250))';
const TX2    = 'var(--ink-2, oklch(0.40 0.009 250))';
const TX3    = 'var(--ink-2, oklch(0.60 0.007 250))';
const ACC    = 'var(--accent, oklch(0.46 0.16 55))';
const BAD    = 'var(--bad, oklch(0.48 0.20 20))';
const WARN   = 'var(--accent, oklch(0.50 0.18 55))';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'rating_requested' | 'desk_review' | 'methodology_score'
  | 'additionality_score' | 'permanence_score' | 'leakage_score'
  | 'cobenefit_score' | 'composite_score' | 'published' | 'monitoring'
  | 're_rating_triggered' | 're_rated' | 'downgraded' | 'withdrawn'
  | 'escalated_to_integrity';

type Tier = 'basic' | 'standard' | 'premium' | 'institutional';

type UrgencyBand = 'critical' | 'high' | 'medium' | 'low';

type Authority =
  | 'junior_analyst' | 'senior_analyst' | 'ratings_committee_chair'
  | 'board_rating_committee';

type RatingBand = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'D';

interface CcrRow {
  [key: string]: unknown;
  id: string;
  rating_number: string;
  project_id: string;
  project_name: string | null;
  issuer_id: string;
  issuer_name: string | null;
  rater_id: string;
  rater_name: string | null;
  buyer_id: string | null;
  buyer_name: string | null;
  registration_chain_ref: string | null;
  mrv_chain_ref: string | null;
  reversal_chain_ref: string | null;
  credit_vintage_year: number;
  multi_vintage: number;
  scope_scale_tonnes: number;
  methodology_id: string | null;
  methodology_name: string | null;
  registry_name: string | null;
  methodology_score: number | null;
  additionality_score: number | null;
  permanence_score: number | null;
  leakage_score: number | null;
  cobenefit_score: number | null;
  composite_score: number | null;
  rating_band: RatingBand | null;
  prior_composite_score: number | null;
  prior_rating_band: RatingBand | null;
  composite_drop_pct: number;
  icroa_aligned: number;
  afolu_high_reversal_risk: number;
  methodology_under_review: number;
  external_credit_red_flag: number;
  ccp_aligned_project: number;
  article_6_authorised: number;
  institutional_buyer: number;
  issuer_disputed: number;
  current_tier: Tier;
  authority_required: Authority | null;
  urgency_band: string | null;
  rating_completeness_index: number;
  rerating_count_30d: number;
  monitoring_freshness_days: number | null;
  monitoring_data_stale: number;
  vintage_age_years: number;
  last_monitoring_data_at: string | null;
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  withdraw_reason: string | null;
  downgrade_reason: string | null;
  integrity_reason: string | null;
  remediation_narrative: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  rating_requested_at: string | null;
  desk_review_at: string | null;
  methodology_score_at: string | null;
  additionality_score_at: string | null;
  permanence_score_at: string | null;
  leakage_score_at: string | null;
  cobenefit_score_at: string | null;
  composite_score_at: string | null;
  published_at: string | null;
  monitoring_at: string | null;
  re_rating_triggered_at: string | null;
  re_rated_at: string | null;
  downgraded_at: string | null;
  withdrawn_at: string | null;
  escalated_to_integrity_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_target_hours: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;
  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Decorated by route
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  hours_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number | null;
  urgency_band_live?: UrgencyBand;
  authority_required_live?: Authority;
  regulator_filing_window_hours_live?: number;
  floor_flag_count_live?: number;
  rating_completeness_index_live?: number;
  rerating_count_30d_live?: number;
  monitoring_freshness_days_live?: number | null;
  monitoring_data_stale_live?: boolean;
  vintage_age_years_live?: number;
  composite_drop_pct_live?: number;
  downgrade_imminent_live?: boolean;
  is_material_downgrade_live?: boolean;
  rating_band_live?: RatingBand | null;
  investment_grade_live?: boolean;
  distressed_live?: boolean;
  bridges_to_registration_chain_live?: boolean;
  bridges_to_mrv_chain_live?: boolean;
  bridges_to_reversal_chain_live?: boolean;
}

interface KpiData {
  total: number;
  by_status: Record<string, number>;
  by_tier: Record<string, number>;
  by_urgency: Record<string, number>;
  by_band: Record<string, number>;
  active_count: number;
  published_count: number;
  monitoring_count: number;
  re_rated_count: number;
  downgraded_count: number;
  withdrawn_count: number;
  integrity_count: number;
  institutional_count: number;
  premium_count: number;
  breached: number;
  reportable_total: number;
  downgrade_imminent_count: number;
  material_downgrade_count: number;
  investment_grade_count: number;
  distressed_count: number;
  article_6_count: number;
  ccp_aligned_count: number;
  stale_count: number;
  registration_bridged_count: number;
  mrv_bridged_count: number;
  reversal_bridged_count: number;
  total_scope_tonnes: number;
  avg_composite_score: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'rating_requested',
  'desk_review',
  'methodology_score',
  'additionality_score',
  'permanence_score',
  'leakage_score',
  'cobenefit_score',
  'composite_score',
  'published',
  'monitoring',
  're_rating_triggered',
  're_rated',
];

const BRANCH_STATES: readonly string[] = [
  'downgraded',
  'withdrawn',
  'escalated_to_integrity',
];

// ── filters ───────────────────────────────────────────────────────────────
// UX revisit 2026-05-30 — pills grouped into 2 visual rows: action-LEFT
// (SLA breached / Downgrade imminent / Distressed / Article 6 / etc.) first;
// lifecycle state pills second. Cuts per-row pill count from 24->12 so they
// fit two rows on 1440px.
const FILTER_ROW_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',             label: 'Active (pre-terminal)' },
  { key: 'all',                label: 'All' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'downgrade_imminent', label: 'Downgrade imminent' },
  { key: 'distressed',         label: 'Distressed (CCC/D)' },
  { key: 'reportable',         label: 'Reportable' },
  { key: 'stale',              label: 'Monitoring stale' },
  { key: 'article_6',          label: 'Article 6' },
  { key: 'ccp_aligned',        label: 'CCP-aligned' },
  { key: 'institutional',      label: 'Institutional' },
  { key: 'premium',            label: 'Premium' },
  { key: 'standard',           label: 'Standard' },
];

const FILTER_ROW_STATE: Array<{ key: string; label: string }> = [
  { key: 'rating_requested',    label: 'Rating requested' },
  { key: 'desk_review',         label: 'Desk review' },
  { key: 'methodology_score',   label: 'Methodology' },
  { key: 'additionality_score', label: 'Additionality' },
  { key: 'permanence_score',    label: 'Permanence' },
  { key: 'leakage_score',       label: 'Leakage' },
  { key: 'cobenefit_score',     label: 'Co-benefits' },
  { key: 'composite_score',     label: 'Composite' },
  { key: 'published',           label: 'Published' },
  { key: 'monitoring',          label: 'Monitoring' },
  { key: 're_rated',            label: 'Re-rated' },
  { key: 'downgraded',          label: 'Downgraded' },
];

const TIERS = new Set<string>(['basic', 'standard', 'premium', 'institutional']);

const BAND_TONE: Record<RatingBand, { bg: string; fg: string }> = {
  AAA: { bg: '#0b6e3a', fg: '#ffffff' },
  AA:  { bg: '#1f8a4d', fg: '#ffffff' },
  A:   { bg: '#3aa86b', fg: '#ffffff' },
  BBB: { bg: '#86c79a', fg: 'var(--ink, #0f1c2e)' },
  BB:  { bg: '#f4d068', fg: '#5a3d00' },
  B:   { bg: '#f2a83c', fg: '#5a3000' },
  CCC: { bg: '#d8602b', fg: '#ffffff' },
  D:   { bg: 'var(--bad, #9b1f1f)', fg: '#ffffff' },
};

const AUTH_LABEL: Record<Authority, string> = {
  junior_analyst:          'Junior analyst',
  senior_analyst:          'Senior analyst',
  ratings_committee_chair: 'Ratings committee chair',
  board_rating_committee:  'Board rating committee',
};

// ── helpers ───────────────────────────────────────────────────────────────
function fmtHrs(h: number | null | undefined): string {
  if (h === null || h === undefined) return '—';
  if (Math.abs(h) >= 24) return `${(h / 24).toFixed(1)}d`;
  return `${h.toFixed(0)}h`;
}

function fmtTco2e(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} Mt`;
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(1)} kt`;
  return `${v.toFixed(0)} t`;
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '—';
  return `${v.toFixed(digits)}%`;
}

function fmtScore(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toFixed(1);
}

function fmtCount(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString();
}

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: CcrRow): ChainAction[] {
  const cs = row.chain_status;
  const actions: ChainAction[] = [];

  const withdrawable = ['rating_requested', 'desk_review', 'methodology_score', 'additionality_score',
    'permanence_score', 'leakage_score', 'cobenefit_score', 'composite_score'].includes(cs);
  const escalatable = !row.is_terminal;
  const downgradable = cs === 'monitoring' || cs === 're_rating_triggered';
  const remediable = cs === 'downgraded';

  if (cs === 'rating_requested') {
    actions.push({
      key: 'start-desk-review',
      label: 'Start desk review (rater)',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'desk_review') {
    actions.push({
      key: 'score-methodology',
      label: 'Score methodology (0-100)',
      tone: 'primary',
      fields: [
        { key: 'score', label: 'Methodology score (0-100)', type: 'number', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'methodology_score') {
    actions.push({
      key: 'score-additionality',
      label: 'Score additionality (0-100)',
      tone: 'primary',
      fields: [
        { key: 'score', label: 'Additionality score (0-100)', type: 'number', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'additionality_score') {
    actions.push({
      key: 'score-permanence',
      label: 'Score permanence (0-100)',
      tone: 'primary',
      fields: [
        { key: 'score', label: 'Permanence score (0-100)', type: 'number', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'permanence_score') {
    actions.push({
      key: 'score-leakage',
      label: 'Score leakage (0-100)',
      tone: 'primary',
      fields: [
        { key: 'score', label: 'Leakage score (0-100)', type: 'number', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'leakage_score') {
    actions.push({
      key: 'score-cobenefits',
      label: 'Score co-benefits (0-100)',
      tone: 'primary',
      fields: [
        { key: 'score', label: 'Co-benefits score (0-100)', type: 'number', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'cobenefit_score') {
    actions.push({
      key: 'compute-composite',
      label: 'Compute composite (rater)',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'composite_score') {
    actions.push({
      key: 'publish-rating',
      label: 'Publish rating (ratings committee)',
      tone: 'primary',
      fields: [],
      // publish_rating -> premium+institutional when Article 6
      cascadeTo: (row.article_6_authorised && (row.current_tier === 'premium' || row.current_tier === 'institutional')) ? ['regulator'] : [],
    });
  }

  if (cs === 'published') {
    actions.push({
      key: 'start-monitoring',
      label: 'Start monitoring (live)',
      tone: 'primary',
      fields: [
        { key: 'last_monitoring_data_at', label: 'Last monitoring data timestamp (ISO 8601, optional)', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'monitoring') {
    actions.push({
      key: 'trigger-rerating',
      label: 'Trigger re-rating',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 're_rating_triggered') {
    actions.push({
      key: 'rerate',
      label: 'Re-rate (refresh 5 sub-scores)',
      tone: 'primary',
      fields: [
        { key: 'methodology_score',   label: 'New methodology score (optional)',   type: 'number', required: false, placeholder: '' },
        { key: 'additionality_score', label: 'New additionality score (optional)', type: 'number', required: false, placeholder: '' },
        { key: 'permanence_score',    label: 'New permanence score (optional)',    type: 'number', required: false, placeholder: '' },
        { key: 'leakage_score',       label: 'New leakage score (optional)',       type: 'number', required: false, placeholder: '' },
        { key: 'cobenefit_score',     label: 'New co-benefits score (optional)',   type: 'number', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (downgradable) {
    actions.push({
      key: 'downgrade',
      label: 'Downgrade (regulator EVERY tier on drop ≥20% or CCC/D)',
      tone: 'danger',
      fields: [
        { key: 'downgrade_reason', label: 'Downgrade reason', type: 'textarea', required: false, placeholder: '' },
      ],
      // downgrade -> regulator EVERY tier on drop>=20% OR CCC/D
      cascadeTo: ['regulator'],
    });
  }

  if (withdrawable) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw rating (issuer-dispute = regulator EVERY tier)',
      tone: 'danger',
      fields: [
        { key: 'withdraw_reason',  label: 'Withdraw reason',                                    type: 'textarea', required: false, placeholder: '' },
        { key: 'issuer_disputed',  label: 'Issuer disputing this withdrawal? (true/false)',      type: 'text',     required: false, placeholder: 'false' },
      ],
      // withdraw -> regulator EVERY tier when issuer_disputed
      cascadeTo: ['regulator'],
    });
  }

  if (escalatable) {
    actions.push({
      key: 'escalate-to-integrity',
      label: 'Escalate to integrity (fraud → reversal)',
      tone: 'danger',
      fields: [
        { key: 'integrity_reason', label: 'Integrity escalation reason', type: 'textarea', required: false, placeholder: '' },
      ],
      // escalate_to_integrity -> regulator EVERY tier
      cascadeTo: ['regulator'],
    });
  }

  if (remediable) {
    actions.push({
      key: 'remediate',
      label: 'Remediate (issuer) — re-enter monitoring',
      tone: 'primary',
      fields: [
        { key: 'remediation_narrative', label: 'Remediation narrative', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

// ── renderDetail ──────────────────────────────────────────────────────────
function renderDetail(row: CcrRow): React.ReactNode {
  const band = row.rating_band_live ?? row.rating_band;
  const priorBand = row.prior_rating_band;
  const bandTone = band ? BAND_TONE[band] : null;
  const priorBandTone = priorBand ? BAND_TONE[priorBand] : null;
  const authorityNow = row.authority_required_live ?? row.authority_required ?? null;

  return (
    <div className="space-y-3 text-[12px]">
      {/* S&P 8-band ladder */}
      {band && bandTone && (
        <div className="rounded border p-3" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: TX3 }}>S&amp;P-style 8-band ladder</div>
          <div className="flex gap-1">
            {(['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'] as RatingBand[]).map((b) => {
              const tone = BAND_TONE[b];
              const active = b === band;
              const wasPrior = b === priorBand;
              return (
                <div key={b} className="flex-1 text-center">
                  <div
                    className="py-1.5 px-1 rounded text-[12px] font-bold border-2"
                    style={{
                      background: tone.bg,
                      color: tone.fg,
                      borderColor: active ? TX1 : 'transparent',
                      opacity: active ? 1 : 0.6,
                    }}>
                    {b}
                  </div>
                  {active && <div className="text-[9px] mt-0.5 font-semibold" style={{ color: TX1 }}>CURRENT</div>}
                  {wasPrior && !active && <div className="text-[9px] mt-0.5" style={{ color: WARN }}>prior</div>}
                </div>
              );
            })}
          </div>
          <div className="text-[10px] mt-2" style={{ color: TX3 }}>
            AAA-BBB investment-grade · BB-B speculative · CCC/D distressed (buffer pool eligible)
          </div>
        </div>
      )}

      {/* 5-pillar scoring battery */}
      <div className="rounded border p-3" style={{ background: BG1, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: TX3 }}>Live 5-pillar scoring battery</div>
        <div className="grid grid-cols-5 gap-3">
          <DetailPair label="Methodology (25%)" value={fmtScore(row.methodology_score)} />
          <DetailPair label="Additionality (25%)" value={fmtScore(row.additionality_score)} />
          <DetailPair label="Permanence (20%)" value={fmtScore(row.permanence_score)} />
          <DetailPair label="Leakage (15%)" value={fmtScore(row.leakage_score)} />
          <DetailPair label="Co-benefits (15%)" value={fmtScore(row.cobenefit_score)} />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t" style={{ borderColor: BORDER }}>
          <DetailPair label="Composite (0-100)" value={fmtScore(row.composite_score)} />
          <DetailPair label="ICROA bonus" value={row.icroa_aligned ? '+5' : '—'} />
          <DetailPair label="Completeness" value={`${row.rating_completeness_index_live ?? 0} / 100`} />
        </div>
        {row.prior_composite_score != null && (
          <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t" style={{ borderColor: BORDER }}>
            <DetailPair label="Prior composite" value={fmtScore(row.prior_composite_score)} />
            <DetailPair label="Prior band" value={priorBand ?? '—'} />
            <DetailPair label="Drop vs prior" value={fmtPct(row.composite_drop_pct_live, 2)} />
          </div>
        )}
      </div>

      {/* Floor-at-premium flags */}
      <div className="rounded border p-3" style={{ background: BG1, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: TX3 }}>
          Floor-at-premium flags ({row.floor_flag_count_live ?? 0} / 5)
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FlagPill on={!!row.afolu_high_reversal_risk} label="AFOLU high reversal risk" />
          <FlagPill on={!!row.methodology_under_review} label="Methodology under review" />
          <FlagPill on={!!row.external_credit_red_flag} label="External red flag" />
          <FlagPill on={!!row.ccp_aligned_project} label="CCP-aligned project" />
          <FlagPill on={!!row.article_6_authorised} label="Article 6 authorised" />
          <FlagPill on={!!row.institutional_buyer} label="Institutional buyer" />
        </div>
      </div>

      {/* 3-bridge architecture */}
      <div className="rounded border p-3" style={{ background: BG1, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: TX3 }}>Bridges to sibling carbon chains</div>
        <div className="grid grid-cols-3 gap-3">
          <BridgePill on={!!row.bridges_to_registration_chain_live} label="Registration PDD" ref_={row.registration_chain_ref} />
          <BridgePill on={!!row.bridges_to_mrv_chain_live} label="MRV verification" ref_={row.mrv_chain_ref} />
          <BridgePill on={!!row.bridges_to_reversal_chain_live} label="Reversal / buffer pool" ref_={row.reversal_chain_ref} />
        </div>
      </div>

      {/* Project, vintage & monitoring */}
      <div className="rounded border p-3" style={{ background: BG1, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: TX3 }}>Project, vintage &amp; monitoring</div>
        <div className="grid grid-cols-3 gap-3">
          <DetailPair label="Vintage year" value={fmtCount(row.credit_vintage_year)} />
          <DetailPair label="Vintage age" value={`${row.vintage_age_years_live ?? row.vintage_age_years} yrs`} />
          <DetailPair label="Multi-vintage" value={row.multi_vintage ? 'Yes' : 'No'} />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t" style={{ borderColor: BORDER }}>
          <DetailPair label="Scope (tCO2e)" value={fmtTco2e(row.scope_scale_tonnes)} />
          <DetailPair label="Methodology" value={row.methodology_name ?? row.methodology_id ?? '—'} />
          <DetailPair label="Registry" value={row.registry_name ?? '—'} />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t" style={{ borderColor: BORDER }}>
          <DetailPair label="Last monitoring data" value={row.last_monitoring_data_at ? new Date(row.last_monitoring_data_at).toLocaleDateString() : '—'} />
          <DetailPair label="Freshness" value={row.monitoring_freshness_days_live != null ? `${row.monitoring_freshness_days_live}d` : '—'} />
          <DetailPair label="Re-rating triggers (30d)" value={fmtCount(row.rerating_count_30d_live)} />
        </div>
      </div>

      {/* Parties + authority + refs */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {row.rater_name && <DetailPair label="Rater" value={row.rater_name} />}
        {row.buyer_name && <DetailPair label="Buyer" value={row.buyer_name} />}
        {authorityNow && <DetailPair label="Authority required" value={AUTH_LABEL[authorityNow]} />}
        {row.regulator_inbox_ref && <DetailPair label="Regulator inbox" value={row.regulator_inbox_ref} />}
        {row.regulator_ref && <DetailPair label="Regulator ref" value={row.regulator_ref} />}
        {row.reason_code && <DetailPair label="Reason code" value={row.reason_code} />}
        {row.escalation_level > 0 && <DetailPair label="Escalation level" value={String(row.escalation_level)} />}
      </div>

      {row.downgrade_reason && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Downgrade reason</div>
          <div style={{ color: TX2 }}>{row.downgrade_reason}</div>
        </div>
      )}
      {row.withdraw_reason && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Withdraw reason</div>
          <div style={{ color: TX2 }}>{row.withdraw_reason}</div>
        </div>
      )}
      {row.integrity_reason && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Integrity reason</div>
          <div style={{ color: TX2 }}>{row.integrity_reason}</div>
        </div>
      )}
      {row.remediation_narrative && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Remediation</div>
          <div style={{ color: TX2 }}>{row.remediation_narrative}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function CreditRatingChainTab() {
  const [rows, setRows] = useState<CcrRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: CcrRow[] } }>('/carbon/credit-rating/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load carbon credit ratings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/carbon/credit-rating/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/carbon/credit-rating/chain/${rowId}`);
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
      const res = await api.get<{ data: { case: CcrRow; events: ChainEvent[] } }>(`/carbon/credit-rating/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')                return true;
      if (filter === 'active')             return !r.is_terminal;
      if (filter === 'breached')           return !!(r.sla_breached_live || r.sla_breached);
      if (filter === 'downgrade_imminent') return !!r.downgrade_imminent_live;
      if (filter === 'distressed')         return !!r.distressed_live;
      if (filter === 'reportable')         return !!r.is_reportable_flag;
      if (filter === 'stale')              return !!r.monitoring_data_stale_live;
      if (filter === 'article_6')          return !!r.article_6_authorised;
      if (filter === 'ccp_aligned')        return !!r.ccp_aligned_project;
      if (TIERS.has(filter))               return r.current_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const k = kpis;

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Carbon Credit Quality Rating</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-state INVERTED SLA rating chain · S&P 8-band · 5-pillar scoring battery · 3-bridge (registration / MRV / reversal) · ICROA/CCP/Article 6
        </p>
      </header>

      {/* KPI strip — UX revisit 2026-05-30: breached/imminent/distressed/article6 left */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="SLA breached"       value={k?.breached ?? 0}                tone={(k?.breached ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Downgrade imminent" value={k?.downgrade_imminent_count ?? 0} tone={(k?.downgrade_imminent_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Distressed (CCC/D)" value={k?.distressed_count ?? 0}         tone={(k?.distressed_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Article 6"          value={k?.article_6_count ?? 0} />
        <KpiTile label="Institutional"      value={k?.institutional_count ?? 0} />
        <KpiTile label="Active"             value={k?.active_count ?? 0} />
        <KpiTile label="Total"              value={k?.total ?? 0} />
        <KpiTile label="Avg composite"      value={fmtScore(k?.avg_composite_score ?? 0)} />
      </div>

      {/* Filter pills — action row */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTER_ROW_ACTION.map(f => (
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

      {/* Filter pills — state row */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTER_ROW_STATE.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: filter === f.key ? ACC : BG2,
              color: filter === f.key ? '#fff' : TX3,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
          Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => {
            const band = row.rating_band_live ?? row.rating_band;
            const bandTone = band ? BAND_TONE[band] : null;
            const authorityNow = row.authority_required_live ?? row.authority_required ?? null;
            const metaParts: string[] = [
              row.current_tier.charAt(0).toUpperCase() + row.current_tier.slice(1),
              ...(band ? [`Band: ${band}`] : []),
              ...(authorityNow ? [AUTH_LABEL[authorityNow]] : []),
            ];
            return (
              <ChainCard
                key={row.id}
                item={{
                  ...row,
                  sla_deadline_at: row.sla_deadline_at ?? null,
                  sla_breached: !!(row.sla_breached_live || row.sla_breached),
                }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={`${row.rating_number} · ${row.project_name ?? row.project_id}`}
                meta={metaParts.join(' · ')}
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
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No carbon credit ratings match the current filter.
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
      <div style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

function FlagPill({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-md text-[12px]"
      style={{
        background: on ? 'color-mix(in oklab, var(--warn) 15%, var(--s1))' : BG2,
        color: on ? WARN : TX3,
        border: `1px solid ${on ? 'oklch(0.80 0.12 55)' : BORDER}`,
      }}>
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: on ? WARN : TX3 }} />
      <span>{label}</span>
    </div>
  );
}

function BridgePill({ on, label, ref_ }: { on: boolean; label: string; ref_: string | null }) {
  return (
    <div className="px-2 py-2 rounded-md text-[12px]"
      style={{
        background: on ? 'color-mix(in oklab, var(--good) 15%, var(--s1))' : BG2,
        color: on ? 'var(--good, oklch(0.30 0.14 155))' : TX3,
        border: `1px solid ${on ? 'oklch(0.75 0.10 155)' : BORDER}`,
      }}>
      <div className="flex items-center gap-2 font-semibold">
        <span className="inline-block w-2 h-2 rounded-full"
          style={{ background: on ? 'var(--good, oklch(0.30 0.14 155))' : TX3 }} />
        <span>{label}</span>
      </div>
      {ref_ && <div className="font-mono text-[10px] mt-1" style={{ color: TX3 }}>{ref_}</div>}
      {!ref_ && <div className="text-[10px] mt-1" style={{ color: TX3 }}>No bridge wired</div>}
    </div>
  );
}

export default CreditRatingChainTab;
