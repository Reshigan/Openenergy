// Wave 103 — Carbon ESG Disclosure Lifecycle & Assurance Chain tab.
// Brings a JSE-listed entity's annual ESG cycle to L4-L5: 12-state lifecycle
// (period_open -> collect_data -> verify_boundary -> compute_metrics ->
// compile_draft -> submit_for_review -> engage_assurance -> start_assurance ->
// complete_assurance -> publish -> file_regulator -> archive) + disputed +
// cancelled branches; 4-tier composite re-derived every transition from
// scope x climate-exposure x assurance with FLOOR-AT-MATERIAL when JSE listed
// or Scope 3 inclusive 15-cat or scenario-required or 8+ material topics or
// SBTi committed; INVERTED SLA (strategic = 270d annual cycle, minor publish =
// 7d); 4-step authority ladder (analyst -> director -> audit chair -> board);
// regulator-crossings on restate (UNIVERSAL hard line - sister of W42 reversal)
// + qualified/adverse/disclaimer assurance opinion (material+strategic) +
// cancel-of-listed-year (universal) + sla_breach strategic only.
//
// Beats Workiva ESG, Sphera SpheraCloud, SAP Sustainability Control Tower,
// Microsoft Sustainability Manager, IBM Envizi, Salesforce Net Zero Cloud,
// Greenstone, EcoVadis, Persefoni, Watershed, Diligent ESG, Bloomberg ESG,
// Refinitiv Lipper ESG via LIVE 4-framework completeness battery (TCFD / GRI /
// CDP / JSE-SRL / King-IV / ISSB-S1S2) + SBTi alignment + ESG Disclosure Index
// + assurance-confidence ladder + regulator-filing countdown all composed on
// every fetch from raw inputs.
//
// Standards covered: ISSB IFRS S1 + S2 / TCFD 4 pillars / GRI Universal +
// sector / CDP Climate-Water-Forests / JSE SRL 2024 / King IV Principles 1-3 +
// 15-17 / SBTi alignment / Carbon Tax Act §6 / SAICA Code 8.
//
// Mounted on Carbon workstation (primary write) + cross-mounted on Esums O&M
// + Regulator portal (read-only).

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
const GOOD   = 'var(--good, oklch(0.40 0.16 155))';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'period_open' | 'data_collected' | 'boundary_verified' | 'metrics_computed'
  | 'draft_compiled' | 'internal_review' | 'assurance_engaged'
  | 'assurance_in_progress' | 'assured' | 'published' | 'filed' | 'archived'
  | 'disputed' | 'cancelled';

type Tier = 'minor' | 'standard' | 'material' | 'strategic';

type UrgencyBand = 'critical' | 'high' | 'medium' | 'low';

type Authority = 'esg_analyst' | 'sustainability_director' | 'audit_committee_chair' | 'board_chair';

type Party =
  | 'esg_analyst' | 'sustainability_director' | 'audit_committee_chair'
  | 'board_chair' | 'external_auditor' | 'regulator_observer' | 'system';

type DisclosureScope = 'entity_only' | 'entity_plus_subsidiaries' | 'group_consolidated';

type ClimateRiskExposure = 'low' | 'medium' | 'high';

type AssuranceLevel = 'none' | 'limited' | 'reasonable';

type AssuranceOpinion = 'unqualified' | 'limited' | 'qualified' | 'adverse' | 'disclaimer';

interface EsgRow {
  [key: string]: unknown;
  id: string;
  disclosure_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  reporting_entity_id: string;
  reporting_entity_name: string | null;
  reporting_entity_lei: string | null;
  ticker: string | null;
  financial_year_label: string | null;
  financial_year_end_at: string | null;
  period_opened_at: string | null;
  disclosure_scope: DisclosureScope;
  climate_risk_exposure: ClimateRiskExposure;
  assurance_level: AssuranceLevel;
  assurance_opinion: AssuranceOpinion | null;
  assurance_provider: string | null;
  external_auditor_party_id: string | null;
  jse_listed_strict: number;
  scope3_inclusive_15cat: number;
  climate_scenario_required: number;
  material_topics_count: number;
  sbti_committed_strict: number;
  year_had_listed_disclosure: number;
  scope1_tco2e: number | null;
  scope2_market_tco2e: number | null;
  scope2_location_tco2e: number | null;
  scope3_total_tco2e: number | null;
  baseline_year: number | null;
  baseline_total_tco2e: number | null;
  reduction_pct_vs_baseline: number | null;
  sbti_alignment_score: number | null;
  tcfd_completeness_pct: number | null;
  gri_completeness_pct: number | null;
  cdp_score: number | null;
  cdp_score_band: string | null;
  jse_srl_completeness_pct: number | null;
  king_iv_completeness_pct: number | null;
  issb_s1_s2_completeness_pct: number | null;
  assurance_confidence_level: string | null;
  esg_disclosure_index: number | null;
  regulator_filing_window_days: number | null;
  urgency_band: UrgencyBand | null;
  current_tier: Tier;
  effective_tier: Tier | null;
  authority_required: Authority | null;
  dispute_count: number;
  restate_count: number;
  cancel_count: number;
  parent_disclosure_id: string | null;
  prior_disclosure_id: string | null;
  regulator_ref: string | null;
  jse_sens_ref: string | null;
  cipc_ref: string | null;
  dffe_ref: string | null;
  sars_ref: string | null;
  title: string | null;
  narrative: string | null;
  result_text: string | null;
  disputed_reason: string | null;
  cancelled_reason: string | null;
  restated_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  analyst_party: string | null;
  director_party: string | null;
  audit_committee_party: string | null;
  board_party: string | null;
  chain_status: ChainStatus;
  period_open_at: string | null;
  data_collected_at: string | null;
  boundary_verified_at: string | null;
  metrics_computed_at: string | null;
  draft_compiled_at: string | null;
  internal_review_at: string | null;
  assurance_engaged_at: string | null;
  assurance_in_progress_at: string | null;
  assured_at: string | null;
  published_at: string | null;
  filed_at: string | null;
  archived_at: string | null;
  disputed_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Decorated by route
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  floor_at_material_flag?: boolean;
  scope3_total_tco2e_live?: number | null;
  total_emissions_tco2e_live?: number | null;
  reduction_pct_vs_baseline_live?: number | null;
  sbti_alignment_score_live?: number | null;
  tcfd_completeness_pct_live?: number | null;
  cdp_score_band_live?: string | null;
  assurance_confidence_live?: string | null;
  esg_disclosure_index_live?: number | null;
  regulator_filing_window_days_live?: number | null;
  sla_days_remaining_live?: number | null;
  urgency_band_live?: UrgencyBand;
  authority_required_live?: Authority;
  days_in_court_live?: number;
}

interface EsgEvent {
  id: string;
  disclosure_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

interface KpiData {
  total: number;
  open_count: number;
  archived_count: number;
  filed_count: number;
  published_count: number;
  assured_count: number;
  disputed_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  total_scope1_tco2e: number;
  total_scope2_tco2e: number;
  total_scope3_tco2e: number;
  total_emissions_tco2e: number;
  avg_reduction_pct: number;
  avg_disclosure_index: number;
  avg_tcfd_pct: number;
  critical_urgency_count: number;
  strategic_tier_count: number;
  material_tier_count: number;
  floor_at_material_count: number;
  jse_listed_count: number;
  qualified_opinion_count: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'period_open',
  'data_collected',
  'boundary_verified',
  'metrics_computed',
  'draft_compiled',
  'internal_review',
  'assurance_engaged',
  'assurance_in_progress',
  'assured',
  'published',
  'filed',
  'archived',
];

const BRANCH_STATES: readonly string[] = [
  'disputed',
  'cancelled',
];

const AUTH_LABEL: Record<Authority, string> = {
  esg_analyst:              'ESG analyst',
  sustainability_director:  'Sustainability director',
  audit_committee_chair:    'Audit committee chair',
  board_chair:              'Board chair',
};

// ── filters ───────────────────────────────────────────────────────────────
// UX revisit 2026-05-30 — pills grouped into 2 visual rows: action-oriented
// (active/scope + tier + flags) first; lifecycle state pills second. Cuts
// per-row pill count from 24→10 and 24→12 so they fit two rows on 1440px.
const FILTER_ROW_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',           label: 'Active (pre-terminal)' },
  { key: 'all',              label: 'All' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'reportable',       label: 'Reportable' },
  { key: 'critical_urgency', label: 'Critical urgency' },
  { key: 'floored',          label: 'Floor-at-material' },
  { key: 'jse_listed',       label: 'JSE listed' },
  { key: 'qualified',        label: 'Qualified opinion' },
  { key: 'strategic',        label: 'Strategic' },
  { key: 'material',         label: 'Material' },
  { key: 'standard',         label: 'Standard' },
  { key: 'minor',            label: 'Minor' },
];

const FILTER_ROW_STATE: Array<{ key: string; label: string }> = [
  { key: 'period_open',           label: 'Period open' },
  { key: 'data_collected',        label: 'Data collected' },
  { key: 'boundary_verified',     label: 'Boundary verified' },
  { key: 'metrics_computed',      label: 'Metrics computed' },
  { key: 'draft_compiled',        label: 'Draft compiled' },
  { key: 'internal_review',       label: 'Internal review' },
  { key: 'assurance_engaged',     label: 'Assurance engaged' },
  { key: 'assurance_in_progress', label: 'Assurance live' },
  { key: 'assured',               label: 'Assured' },
  { key: 'published',             label: 'Published' },
  { key: 'filed',                 label: 'Filed' },
  { key: 'disputed',              label: 'Disputed' },
];

const TIERS = new Set<string>(['minor', 'standard', 'material', 'strategic']);

// ── format helpers ────────────────────────────────────────────────────────
function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
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

function fmtCount(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString();
}

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: EsgRow): ChainAction[] {
  const cs = row.chain_status;
  const actions: ChainAction[] = [];

  if (cs === 'period_open') {
    actions.push({
      key: 'collect-data',
      label: 'Collect data (ESG analyst)',
      fields: [
        { key: 'scope1_tco2e',            label: 'Scope 1 tCO2e',                    type: 'number',   required: false, placeholder: String(row.scope1_tco2e ?? '') },
        { key: 'scope2_market_tco2e',      label: 'Scope 2 market tCO2e',             type: 'number',   required: false, placeholder: String(row.scope2_market_tco2e ?? '') },
        { key: 'scope2_location_tco2e',    label: 'Scope 2 location tCO2e (optional)', type: 'number',  required: false, placeholder: String(row.scope2_location_tco2e ?? '') },
        { key: 'scope3_total_tco2e',       label: 'Scope 3 total tCO2e (15-cat)',     type: 'number',   required: false, placeholder: String(row.scope3_total_tco2e ?? '') },
        { key: 'baseline_year',            label: 'Baseline year (optional)',          type: 'number',   required: false, placeholder: String(row.baseline_year ?? '') },
        { key: 'baseline_total_tco2e',     label: 'Baseline total tCO2e (optional)',  type: 'number',   required: false, placeholder: String(row.baseline_total_tco2e ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'data_collected') {
    actions.push({
      key: 'verify-boundary',
      label: 'Verify boundary (ESG analyst)',
      fields: [
        { key: 'disclosure_scope',        label: 'Scope (entity_only | entity_plus_subsidiaries | group_consolidated)', type: 'text', required: false, placeholder: String(row.disclosure_scope ?? '') },
        { key: 'climate_risk_exposure',   label: 'Climate-risk exposure (low | medium | high)',                         type: 'text', required: false, placeholder: String(row.climate_risk_exposure ?? '') },
        { key: 'scope3_inclusive_15cat',  label: 'Scope 3 inclusive 15-cat (true/false)',                               type: 'text', required: false, placeholder: row.scope3_inclusive_15cat ? 'true' : 'false' },
        { key: 'climate_scenario_required', label: 'Climate scenario required (true/false)',                            type: 'text', required: false, placeholder: row.climate_scenario_required ? 'true' : 'false' },
        { key: 'material_topics_count',   label: 'Material topics count',                                               type: 'number', required: false, placeholder: String(row.material_topics_count ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'boundary_verified') {
    actions.push({
      key: 'compute-metrics',
      label: 'Compute metrics (ESG analyst)',
      fields: [
        { key: 'tcfd_completeness_pct',      label: 'TCFD completeness % (optional)',      type: 'number', required: false, placeholder: String(row.tcfd_completeness_pct ?? '') },
        { key: 'gri_completeness_pct',       label: 'GRI completeness % (optional)',       type: 'number', required: false, placeholder: String(row.gri_completeness_pct ?? '') },
        { key: 'cdp_score',                  label: 'CDP score 0-100 (optional)',           type: 'number', required: false, placeholder: String(row.cdp_score ?? '') },
        { key: 'jse_srl_completeness_pct',   label: 'JSE SRL completeness % (optional)',   type: 'number', required: false, placeholder: String(row.jse_srl_completeness_pct ?? '') },
        { key: 'king_iv_completeness_pct',   label: 'King IV completeness % (optional)',   type: 'number', required: false, placeholder: String(row.king_iv_completeness_pct ?? '') },
        { key: 'issb_s1_s2_completeness_pct', label: 'ISSB S1+S2 completeness % (optional)', type: 'number', required: false, placeholder: String(row.issb_s1_s2_completeness_pct ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'metrics_computed') {
    actions.push({
      key: 'compile-draft',
      label: 'Compile draft (sustainability director)',
      fields: [
        { key: 'title', label: 'Draft title', type: 'text', required: false, placeholder: String(row.title ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'draft_compiled') {
    actions.push({
      key: 'submit-for-review',
      label: 'Submit for review',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'internal_review') {
    actions.push({
      key: 'engage-assurance',
      label: 'Engage assurance (audit committee chair)',
      fields: [
        { key: 'assurance_level',    label: 'Assurance level (none | limited | reasonable)', type: 'text', required: false, placeholder: String(row.assurance_level ?? '') },
        { key: 'assurance_provider', label: 'Assurance provider name',                       type: 'text', required: false, placeholder: String(row.assurance_provider ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'assurance_engaged') {
    actions.push({
      key: 'start-assurance',
      label: 'Start assurance (external auditor)',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'assurance_in_progress') {
    actions.push({
      key: 'complete-assurance',
      label: 'Complete assurance (external auditor)',
      fields: [
        { key: 'assurance_opinion', label: 'Opinion (unqualified | limited | qualified | adverse | disclaimer)', type: 'text', required: false, placeholder: String(row.assurance_opinion ?? '') },
      ],
      // qualified/adverse/disclaimer → crosses regulator for material+strategic
      cascadeTo: [],
    });
  }

  if (cs === 'assured') {
    actions.push({
      key: 'publish-disclosure',
      label: 'Publish disclosure (board chair)',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'published') {
    actions.push({
      key: 'file-regulator',
      label: 'File with regulator',
      fields: [
        { key: 'jse_sens_ref', label: 'JSE SENS ref (optional)', type: 'text', required: false, placeholder: String(row.jse_sens_ref ?? '') },
        { key: 'cipc_ref',     label: 'CIPC ref (optional)',     type: 'text', required: false, placeholder: String(row.cipc_ref ?? '') },
        { key: 'dffe_ref',     label: 'DFFE ref (optional)',     type: 'text', required: false, placeholder: String(row.dffe_ref ?? '') },
        { key: 'sars_ref',     label: 'SARS ref (optional)',     type: 'text', required: false, placeholder: String(row.sars_ref ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'filed') {
    actions.push({
      key: 'archive-year',
      label: 'Archive year',
      fields: [],
      cascadeTo: [],
    });
  }

  // Raise dispute — available on draft_compiled, internal_review, assured
  if (['draft_compiled', 'internal_review', 'assured'].includes(cs)) {
    actions.push({
      key: 'raise-dispute',
      label: 'Raise dispute (audit committee chair)',
      fields: [
        { key: 'disputed_reason', label: 'Dispute reason', type: 'textarea', required: false, placeholder: String(row.disputed_reason ?? '') },
      ],
      cascadeTo: [],
    });
  }

  // Resolve dispute
  if (cs === 'disputed') {
    actions.push({
      key: 'resolve-dispute',
      label: 'Resolve dispute',
      fields: [],
      cascadeTo: [],
    });
  }

  // Restate — only on filed; UNIVERSAL regulator crossing (hard line - sister of W42 reversal)
  if (cs === 'filed') {
    actions.push({
      key: 'restate-disclosure',
      label: 'Restate disclosure (regulator reportable EVERY tier)',
      fields: [
        { key: 'restated_reason', label: 'Restatement reason', type: 'textarea', required: false, placeholder: String(row.restated_reason ?? '') },
      ],
      cascadeTo: ['regulator'],
    });
  }

  // Cancel — on any non-terminal; cancel of listed year is universal regulator crossing
  if (!row.is_terminal) {
    actions.push({
      key: 'cancel-year',
      label: 'Cancel year',
      fields: [
        { key: 'cancelled_reason', label: 'Cancellation reason', type: 'textarea', required: false, placeholder: String(row.cancelled_reason ?? '') },
      ],
      // cancel-of-listed-year crosses regulator universally
      cascadeTo: row.jse_listed_strict ? ['regulator'] : [],
    });
  }

  return actions;
}

// ── detail panel ──────────────────────────────────────────────────────────
function renderDetail(row: EsgRow): React.ReactNode {
  const authorityNow = row.authority_required_live ?? row.authority_required ?? null;
  return (
    <div className="space-y-3 text-[11px]">
      {/* Emissions ledger */}
      <div className="rounded border px-3 py-2.5" style={{ background: BG1, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: TX3 }}>
          Emissions ledger (GHG protocol Scope 1+2+3)
        </div>
        <div className="grid grid-cols-4 gap-x-4 gap-y-1.5">
          <DetailPair label="Scope 1" value={fmtTco2e(row.scope1_tco2e)} />
          <DetailPair label="Scope 2 (market)" value={fmtTco2e(row.scope2_market_tco2e)} />
          <DetailPair label="Scope 2 (location)" value={fmtTco2e(row.scope2_location_tco2e)} />
          <DetailPair label="Scope 3 (15-cat)" value={fmtTco2e(row.scope3_total_tco2e_live)} />
        </div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 mt-2 pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
          <DetailPair label="Total tCO2e" value={fmtTco2e(row.total_emissions_tco2e_live)} />
          <DetailPair label="Baseline year" value={fmtCount(row.baseline_year)} />
          <DetailPair label="Baseline tCO2e" value={fmtTco2e(row.baseline_total_tco2e)} />
        </div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 mt-2 pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
          <DetailPair label="Reduction vs baseline" value={fmtPct(row.reduction_pct_vs_baseline_live)} />
          <DetailPair label="SBTi alignment" value={`${(row.sbti_alignment_score_live ?? 0).toFixed(1)} / 100`} />
          <DetailPair label="ESG Disclosure Index" value={`${(row.esg_disclosure_index_live ?? 0).toFixed(1)} / 100`} />
        </div>
      </div>

      {/* Framework completeness battery */}
      <div className="rounded border px-3 py-2.5" style={{ background: BG1, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: TX3 }}>
          Framework completeness battery
        </div>
        <div className="grid grid-cols-4 gap-x-4 gap-y-1.5">
          <DetailPair label="TCFD" value={fmtPct(row.tcfd_completeness_pct_live)} />
          <DetailPair label="GRI" value={fmtPct(row.gri_completeness_pct)} />
          <DetailPair label="CDP" value={row.cdp_score_band_live ?? row.cdp_score_band ?? '—'} />
          <DetailPair label="JSE SRL" value={fmtPct(row.jse_srl_completeness_pct)} />
        </div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 mt-2 pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
          <DetailPair label="King IV" value={fmtPct(row.king_iv_completeness_pct)} />
          <DetailPair label="ISSB S1+S2" value={fmtPct(row.issb_s1_s2_completeness_pct)} />
          <DetailPair label="Material topics" value={fmtCount(row.material_topics_count)} />
        </div>
      </div>

      {/* Assurance & filing */}
      <div className="rounded border px-3 py-2.5" style={{ background: BG1, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: TX3 }}>
          Assurance &amp; filing
        </div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
          <DetailPair label="Scope" value={row.disclosure_scope.replace(/_/g, ' ')} />
          <DetailPair label="Climate-risk exposure" value={row.climate_risk_exposure} />
          <DetailPair label="Assurance level" value={row.assurance_level} />
        </div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 mt-2 pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
          <DetailPair label="Opinion" value={row.assurance_opinion ?? '—'} />
          <DetailPair label="Provider" value={row.assurance_provider ?? '—'} />
          <DetailPair label="Confidence" value={row.assurance_confidence_live ?? row.assurance_confidence_level ?? '—'} />
        </div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 mt-2 pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
          <DetailPair label="FY end" value={row.financial_year_end_at ? new Date(row.financial_year_end_at).toLocaleDateString() : '—'} />
          <DetailPair label="Filing window" value={row.regulator_filing_window_days_live != null ? `${row.regulator_filing_window_days_live}d` : '—'} />
          <DetailPair label="SLA days left" value={row.sla_days_remaining_live != null ? `${row.sla_days_remaining_live}d` : '—'} />
        </div>
      </div>

      {/* Flags grid */}
      <div className="grid grid-cols-2 gap-2">
        <FlagPill on={!!row.jse_listed_strict}                    label="JSE listed strict" />
        <FlagPill on={!!row.scope3_inclusive_15cat}               label="Scope 3 (15-cat inclusive)" />
        <FlagPill on={!!row.climate_scenario_required}            label="Climate scenario required" />
        <FlagPill on={(row.material_topics_count ?? 0) >= 8}      label="Material topics ≥ 8" />
        <FlagPill on={!!row.sbti_committed_strict}                label="SBTi committed strict" />
        <FlagPill on={!!row.year_had_listed_disclosure}           label="Year had listed disclosure" />
      </div>

      {/* References & provenance */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {row.reporting_entity_lei && <DetailPair label="LEI" value={row.reporting_entity_lei} />}
        {row.ticker && <DetailPair label="Ticker" value={row.ticker} />}
        {row.jse_sens_ref && <DetailPair label="JSE SENS ref" value={row.jse_sens_ref} />}
        {row.cipc_ref && <DetailPair label="CIPC ref" value={row.cipc_ref} />}
        {row.dffe_ref && <DetailPair label="DFFE ref" value={row.dffe_ref} />}
        {row.sars_ref && <DetailPair label="SARS ref" value={row.sars_ref} />}
        {row.regulator_inbox_ref && <DetailPair label="Regulator inbox" value={row.regulator_inbox_ref} />}
        {row.dispute_count > 0 && <DetailPair label="Disputes" value={`${row.dispute_count}`} />}
        {row.restate_count > 0 && <DetailPair label="Restatements" value={`${row.restate_count}`} />}
        {row.reason_code && <DetailPair label="Reason code" value={row.reason_code} />}
        {authorityNow && <DetailPair label="Authority required" value={AUTH_LABEL[authorityNow]} />}
        {row.sla_deadline_at && !row.is_terminal && (
          <DetailPair
            label="Next SLA"
            value={`${new Date(row.sla_deadline_at).toLocaleString()} (${fmtMin(row.minutes_until_sla)})${row.escalation_level > 0 ? ` · ${row.escalation_level} breach(es)` : ''}`}
          />
        )}
      </div>

      {row.disputed_reason && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Disputed reason</div>
          <div style={{ color: TX2 }}>{row.disputed_reason}</div>
        </div>
      )}
      {row.cancelled_reason && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Cancelled reason</div>
          <div style={{ color: TX2 }}>{row.cancelled_reason}</div>
        </div>
      )}
      {row.restated_reason && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Restated reason</div>
          <div style={{ color: TX2 }}>{row.restated_reason}</div>
        </div>
      )}
      {row.source_wave && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Provenance</div>
          <div style={{ color: TX2 }}>
            {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}{row.source_event ? ` (${row.source_event})` : ''}
          </div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function EsgDisclosureChainTab() {
  const [rows, setRows] = useState<EsgRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: EsgRow[] } }>('/carbon/esg-disclosure/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load ESG disclosures');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/carbon/esg-disclosure/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { disclosure: EsgRow; events: ChainEvent[] } }>(`/carbon/esg-disclosure/chain/${rowId}`);
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
      const res = await api.get<{ data: { disclosure: EsgRow; events: ChainEvent[] } }>(`/carbon/esg-disclosure/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')              return true;
      if (filter === 'active')           return !r.is_terminal;
      if (filter === 'breached')         return !!r.sla_breached;
      if (filter === 'reportable')       return !!r.is_reportable_flag;
      if (filter === 'critical_urgency') return r.urgency_band_live === 'critical';
      if (filter === 'floored')          return !!r.floor_at_material_flag;
      if (filter === 'jse_listed')       return !!r.jse_listed_strict;
      if (filter === 'qualified')        return r.assurance_opinion === 'qualified' || r.assurance_opinion === 'adverse' || r.assurance_opinion === 'disclaimer';
      if (TIERS.has(filter))             return r.current_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const k = kpis ?? {
    total: 0, open_count: 0, archived_count: 0, filed_count: 0, published_count: 0,
    assured_count: 0, disputed_count: 0, cancelled_count: 0, breached: 0,
    reportable_total: 0, total_scope1_tco2e: 0, total_scope2_tco2e: 0,
    total_scope3_tco2e: 0, total_emissions_tco2e: 0, avg_reduction_pct: 0,
    avg_disclosure_index: 0, avg_tcfd_pct: 0, critical_urgency_count: 0,
    strategic_tier_count: 0, material_tier_count: 0, floor_at_material_count: 0,
    jse_listed_count: 0, qualified_opinion_count: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>ESG Disclosure Lifecycle &amp; Assurance</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          JSE-listed annual ESG cycle · TCFD / GRI / CDP / JSE-SRL / King-IV / ISSB-S1S2 · Carbon Tax Act §6 · SAICA Code 8
        </p>
      </header>

      {/* KPI strip — UX revisit 2026-05-30: SLA breached / Disputed / Qualified opinion / Strategic tier
          sit left of total/active counts. Total emissions anchors the right tail. */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="SLA breached"      value={k.breached}                tone={k.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Disputed"          value={k.disputed_count}          tone={k.disputed_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Qualified opinion" value={k.qualified_opinion_count} tone={k.qualified_opinion_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Strategic tier"    value={k.strategic_tier_count}    tone={k.strategic_tier_count > 0 ? 'warn' : undefined} />
        <KpiTile label="JSE listed"        value={k.jse_listed_count} />
        <KpiTile label="Active"            value={k.open_count} />
        <KpiTile label="Total"             value={k.total} />
        <KpiTile label="Total emissions"   value={fmtTco2e(k.total_emissions_tco2e)} />
      </div>

      {/* Filter pills — row 1: action-oriented */}
      <div className="mb-1.5 flex flex-wrap gap-1.5">
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

      {/* Filter pills — row 2: lifecycle state */}
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
        <div className="mb-3 rounded border px-3 py-2 text-[11px]"
          style={{ background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]"
          style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
          Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.disclosure_number}${row.title ? ` — ${row.title}` : ''}`}
              meta={[
                row.reporting_entity_name ?? row.reporting_entity_id,
                row.financial_year_label ?? '—',
                row.current_tier.toUpperCase(),
                row.urgency_band_live ? `${row.urgency_band_live} urgency` : null,
                row.floor_at_material_flag ? 'FLOOR' : null,
                row.jse_listed_strict ? 'JSE' : null,
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
              No ESG disclosures match the current filter.
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
    <div className="flex items-center gap-2 px-2 py-1 rounded-md text-[11px]"
      style={{
        background: on ? 'oklch(0.96 0.04 80)' : BG2,
        color: on ? WARN : TX3,
        border: `1px solid ${on ? WARN : BORDER}`,
      }}>
      <span className="inline-block w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: on ? WARN : TX3 }} />
      <span>{label}</span>
    </div>
  );
}

export default EsgDisclosureChainTab;
