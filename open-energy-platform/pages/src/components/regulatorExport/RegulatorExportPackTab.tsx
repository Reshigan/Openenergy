// Wave 119 - Certified Regulator Export Packs.
//
// SECOND Phase-B wave (after W118 audit-chain spine). Mounted at
// /admin-platform/workstation?tab=regulator-exports for admin write, and
// /regulator-suite/workstation?tab=regulator-exports for regulator read.
//
// Beats: XBRL US/IFRS RegFiling automation + CCH Tagetik + Workiva
// Wdesk + Donnelley ActiveDisclosure + Vena RegReporter + SAP Disclosure
// Management + Oracle FCCS - by producing certified, mTLS-lodged packs
// against the W118 tamper-evident chain.
//
// 12-state forward + 4 branch lifecycle:
//   pack_proposed -> blocks_selected -> leaves_filtered ->
//     xbrl_assembled -> narratives_attached -> internal_qa ->
//     counterparty_signoff -> packaged -> countersigned ->
//     lodged_via_api -> acknowledged_by_regulator -> archived (HARD)
//   any non-terminal -> reject_pack -> rejected_by_regulator (regulator)
//   any non-terminal -> withdraw -> withdrawn
//   published -> restate -> restated (SOFT)
//   any -> suspend -> suspended (SOFT, resume to internal_qa)
//
// 5-tier INVERTED SLA polarity (HOURS) - larger pack volume = MORE prep:
//   ad_hoc 24h / monthly_return 72h / quarterly_attestation 168h /
//   half_year 240h / annual_audit 480h.
// FLOOR-AT-QUARTERLY on >=1 of 5 flags; >=2 lifts to annual_audit.
//
// SIGNATURE Phase-B regulator crossings:
//   * reject_pack crosses regulator EVERY tier (W119 SIGNATURE)
//   * sla_breached crosses regulator on heavy tiers (quarterly /
//     half_year / annual_audit)
//   * restate / withdraw cross on heavy tiers
//   * lodge_via_api never crosses (normal flow)
//
// Write {admin, regulator}. READ all 9 personas.
//
// 4-step authority ladder: preparer -> controller -> CFO -> CEO.
// 6 bridges: W118 (MANDATORY) + W113 EVM / W114 doc / W115 sub /
// W116 RFI / W117 CO.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type RepStatus =
  | 'pack_proposed' | 'blocks_selected' | 'leaves_filtered'
  | 'xbrl_assembled' | 'narratives_attached' | 'internal_qa'
  | 'counterparty_signoff' | 'packaged' | 'countersigned'
  | 'lodged_via_api' | 'acknowledged_by_regulator' | 'archived'
  | 'rejected_by_regulator' | 'withdrawn' | 'restated' | 'suspended';

type RepTier = 'ad_hoc' | 'monthly_return' | 'quarterly_attestation' | 'half_year' | 'annual_audit';
type RepUrgency = 'low' | 'medium' | 'high' | 'critical';
type Authority = 'preparer' | 'controller' | 'CFO' | 'CEO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type Cadence = RepTier;
type RegulatorTarget =
  | 'NERSA' | 'IPPO' | 'SARB' | 'DMRE' | 'FSCA'
  | 'DFFE' | 'DTI' | 'JSE' | 'SARS' | 'CIPC';

interface RepRow {
  [key: string]: unknown;
  id: string;
  pack_number: string;
  pack_cadence: Cadence;
  regulator_target: RegulatorTarget;
  reporting_period_start: string | null;
  reporting_period_end: string | null;
  w118_block_height_range_low: number | null;
  w118_block_height_range_high: number | null;
  w113_evm_ref: string | null;
  w114_doc_control_ref: string | null;
  w115_submittal_ref: string | null;
  w116_rfi_ref: string | null;
  w117_change_order_ref: string | null;
  parent_pack_id: string | null;
  jse_srl_listed: number;
  cross_border_filing: number;
  prior_restatement_within_12m: number;
  regulator_audit_in_progress: number;
  signature_chain_break_in_window: number;
  xbrl_taxonomy: string | null;
  xbrl_conformance_score: number;
  esg_taxonomy_coverage_pct: number;
  pack_completeness_index: number;
  controls_narrative_completeness: number;
  integrity_index: number;
  pack_health_band: HealthBand | null;
  current_tier: RepTier;
  authority_required: Authority | null;
  urgency_band: RepUrgency | null;
  coso_components_present: number;
  tsc_trust_categories_present: number;
  management_assertion_signed: number;
  auditor_opinion_attached: number;
  bridge_letter_attached: number;
  internal_qa_passed: number;
  counterparty_signoff_obtained: number;
  regulator_ack_received: number;
  mtls_fingerprint_expected: string | null;
  regulator_ack_code: string | null;
  regulator_reject_code: string | null;
  pack_age_hours: number;
  regulator_export_window_hours: number;
  days_to_quarterly_attestation: number;
  title: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  withdraw_reason: string | null;
  restate_reason: string | null;
  suspend_reason: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: RepStatus;
  pack_proposed_at: string | null;
  blocks_selected_at: string | null;
  leaves_filtered_at: string | null;
  xbrl_assembled_at: string | null;
  narratives_attached_at: string | null;
  internal_qa_at: string | null;
  counterparty_signoff_at: string | null;
  packaged_at: string | null;
  countersigned_at: string | null;
  lodged_via_api_at: string | null;
  acknowledged_by_regulator_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  restated_at: string | null;
  suspended_at: string | null;
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
  // LIVE battery
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_hours_remaining_live?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  urgency_band_live?: RepUrgency;
  authority_required_live?: Authority;
  regulator_export_window_hours_live?: number;
  days_to_quarterly_attestation_live?: number;
  floor_flag_count_live?: number;
  pack_completeness_index_live?: number;
  xbrl_conformance_score_live?: number;
  esg_taxonomy_coverage_pct_live?: number;
  controls_narrative_completeness_live?: number;
  integrity_index_live?: number;
  pack_health_band_live?: HealthBand;
  pack_age_hours_live?: number;
  bridges_to_w118_audit_chain_live?: boolean;
  bridges_to_w113_evm_chain_live?: boolean;
  bridges_to_w114_doc_control_chain_live?: boolean;
  bridges_to_w115_submittal_chain_live?: boolean;
  bridges_to_w116_rfi_chain_live?: boolean;
  bridges_to_w117_change_order_chain_live?: boolean;
}

interface RepEvent {
  id: string;
  pack_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  from_tier: string | null;
  to_tier: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<RepStatus, { bg: string; fg: string; label: string }> = {
  pack_proposed:            { bg: '#e3e7ec', fg: '#445',    label: 'Pack proposed' },
  blocks_selected:          { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Blocks selected' },
  leaves_filtered:          { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Leaves filtered' },
  xbrl_assembled:           { bg: '#fff4d6', fg: '#a06200', label: 'XBRL assembled' },
  narratives_attached:      { bg: '#fff4d6', fg: '#a06200', label: 'Narratives attached' },
  internal_qa:              { bg: '#fff4d6', fg: '#a06200', label: 'Internal QA' },
  counterparty_signoff:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Counterparty sign-off' },
  packaged:                 { bg: '#daf5e2', fg: '#1f6b3a', label: 'Packaged' },
  countersigned:            { bg: '#daf5e2', fg: '#1f6b3a', label: 'Countersigned' },
  lodged_via_api:           { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Lodged via mTLS' },
  acknowledged_by_regulator:{ bg: '#cfe6d3', fg: '#1f5b3a', label: 'Acknowledged' },
  archived:                 { bg: '#1f5b3a', fg: '#fff',    label: 'Archived' },
  rejected_by_regulator:    { bg: '#7a0e0e', fg: '#fff',    label: 'Rejected by regulator' },
  withdrawn:                { bg: '#7a0e0e', fg: '#fff',    label: 'Withdrawn' },
  restated:                 { bg: '#fff4d6', fg: '#a06200', label: 'Restated' },
  suspended:                { bg: '#e3e7ec', fg: '#445',    label: 'Suspended' },
};

const TIER_TONE: Record<RepTier, { bg: string; fg: string; label: string }> = {
  ad_hoc:                 { bg: '#e3e7ec', fg: '#557',    label: 'Ad hoc' },
  monthly_return:         { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Monthly' },
  quarterly_attestation:  { bg: '#fff4d6', fg: '#a06200', label: 'Quarterly' },
  half_year:              { bg: '#daf5e2', fg: '#1f6b3a', label: 'Half-year' },
  annual_audit:           { bg: '#7a0e0e', fg: '#fff',    label: 'Annual audit' },
};

const URGENCY_TONE: Record<RepUrgency, { bg: string; fg: string; label: string }> = {
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
  medium:   { bg: '#daf5e2', fg: '#1f6b3a', label: 'Medium' },
  high:     { bg: '#fff4d6', fg: '#a06200', label: 'High' },
  critical: { bg: '#7a0e0e', fg: '#fff',    label: 'Critical' },
};

const HEALTH_TONE: Record<HealthBand, { bg: string; fg: string; label: string }> = {
  green:    { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Green' },
  amber:    { bg: '#fff4d6', fg: '#a06200', label: 'Amber' },
  red:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Red' },
  critical: { bg: '#7a0e0e', fg: '#fff',    label: 'Critical' },
};

const TARGET_TONE: Record<RegulatorTarget, { bg: string; fg: string }> = {
  NERSA: { bg: '#0c2a4d', fg: '#fff'    },
  IPPO:  { bg: 'oklch(0.46 0.16 55)', fg: '#fff'    },
  SARB:  { bg: '#1f5b3a', fg: '#fff'    },
  DMRE:  { bg: '#a06200', fg: '#fff'    },
  FSCA:  { bg: '#7a0e0e', fg: '#fff'    },
  DFFE:  { bg: '#1f6b3a', fg: '#fff'    },
  DTI:   { bg: '#4a5568', fg: '#fff'    },
  JSE:   { bg: '#000',    fg: '#fff'    },
  SARS:  { bg: '#9b1f1f', fg: '#fff'    },
  CIPC:  { bg: '#557',    fg: '#fff'    },
};

const FILTERS_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',           label: 'Active' },
  { key: 'all',              label: 'All' },
  { key: 'reportable',       label: 'Reportable' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'reg_audit',        label: 'Reg audit live' },
  { key: 'cross_border',     label: 'Cross-border' },
  { key: 'jse_srl',          label: 'JSE SRL listed' },
  { key: 'prior_restate',    label: 'Prior restate 12m' },
  { key: 'sig_break',        label: 'Sig-chain break' },
  { key: 'health_red',       label: 'Health red' },
  { key: 'health_critical',  label: 'Health critical' },
  { key: 'mtls_pending',     label: 'mTLS pending' },
];

const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'pack_proposed',             label: 'Proposed' },
  { key: 'blocks_selected',           label: 'Blocks selected' },
  { key: 'leaves_filtered',           label: 'Leaves filtered' },
  { key: 'xbrl_assembled',            label: 'XBRL assembled' },
  { key: 'narratives_attached',       label: 'Narratives attached' },
  { key: 'internal_qa',               label: 'Internal QA' },
  { key: 'counterparty_signoff',      label: 'Sign-off' },
  { key: 'packaged',                  label: 'Packaged' },
  { key: 'countersigned',             label: 'Countersigned' },
  { key: 'lodged_via_api',            label: 'Lodged' },
  { key: 'acknowledged_by_regulator', label: 'Acked' },
  { key: 'archived',                  label: 'Archived' },
  { key: 'rejected_by_regulator',     label: 'Rejected' },
  { key: 'withdrawn',                 label: 'Withdrawn' },
  { key: 'restated',                  label: 'Restated' },
  { key: 'suspended',                 label: 'Suspended' },
  { key: 'ad_hoc',                    label: 'Tier: Ad hoc' },
  { key: 'monthly_return',            label: 'Tier: Monthly' },
  { key: 'quarterly_attestation',     label: 'Tier: Quarterly' },
  { key: 'half_year',                 label: 'Tier: Half-year' },
  { key: 'annual_audit',              label: 'Tier: Annual audit' },
];

const FILTERS_TARGETS: Array<{ key: string; label: string }> = [
  { key: 'tgt:NERSA', label: 'NERSA' },
  { key: 'tgt:IPPO',  label: 'IPPO' },
  { key: 'tgt:SARB',  label: 'SARB' },
  { key: 'tgt:DMRE',  label: 'DMRE' },
  { key: 'tgt:FSCA',  label: 'FSCA' },
  { key: 'tgt:DFFE',  label: 'DFFE' },
  { key: 'tgt:DTI',   label: 'DTI' },
  { key: 'tgt:JSE',   label: 'JSE' },
  { key: 'tgt:SARS',  label: 'SARS' },
  { key: 'tgt:CIPC',  label: 'CIPC' },
];

type ActionKind =
  | 'select-blocks' | 'filter-leaves' | 'assemble-xbrl'
  | 'attach-narratives' | 'run-internal-qa' | 'get-counterparty-signoff'
  | 'package' | 'countersign' | 'lodge-via-api'
  | 'record-acknowledgement' | 'archive'
  | 'reject-pack' | 'withdraw' | 'restate' | 'suspend' | 'resume';

const ACTION_FOR_STATE: Partial<Record<RepStatus, ActionKind>> = {
  pack_proposed:        'select-blocks',
  blocks_selected:      'filter-leaves',
  leaves_filtered:      'assemble-xbrl',
  xbrl_assembled:       'attach-narratives',
  narratives_attached:  'run-internal-qa',
  internal_qa:          'get-counterparty-signoff',
  counterparty_signoff: 'package',
  packaged:             'countersign',
  countersigned:        'lodge-via-api',
  lodged_via_api:       'record-acknowledgement',
  acknowledged_by_regulator: 'archive',
  suspended:            'resume',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'select-blocks':            'Select W118 blocks (preparer - block height range + bridge refs)',
  'filter-leaves':            'Filter leaves (preparer - prune below materiality threshold)',
  'assemble-xbrl':            'Assemble XBRL (preparer - IFRS Taxonomy 2.1 / iXBRL)',
  'attach-narratives':        'Attach narratives (preparer - IFRS S1/S2 + GRI/SASB/TCFD/ISSB)',
  'run-internal-qa':          'Run internal QA (controller - COSO + SOC2 TSC + control narratives)',
  'get-counterparty-signoff': 'Counterparty sign-off (CFO - management assertion + auditor opinion + bridge letter)',
  'package':                  'Package (CFO - sealed ZIP + ETSI TS 119 312 / RFC 5652 CMS / PDF/A-3)',
  'countersign':              'Countersign (CEO - final attestation; mTLS fingerprint set here)',
  'lodge-via-api':            'Lodge via mTLS (CEO - hand off to /lodge/:target public endpoint)',
  'record-acknowledgement':   'Record acknowledgement (regulator - ack code + inbox ref)',
  'archive':                  'Archive (controller - HARD terminal)',
  'reject-pack':              'REJECT (regulator - W119 SIGNATURE: crosses regulator EVERY tier)',
  'withdraw':                 'Withdraw (CEO - voluntary; crosses regulator on heavy tiers)',
  'restate':                  'Restate (CFO - supersede an acknowledged pack; crosses regulator quarterly+)',
  'suspend':                  'Suspend (CFO - regulator-audit-in-progress; SOFT, resume to internal_qa)',
  'resume':                   'Resume (CFO - back to internal_qa from suspended)',
};

function fmtHoursSla(h: number | null | undefined): string {
  if (h === null || h === undefined) return '-';
  const sign = h < 0 ? '-' : '';
  const abs = Math.abs(h);
  if (abs >= 24) return `${sign}${(abs / 24).toFixed(1)}d`;
  if (abs >= 1)  return `${sign}${abs.toFixed(1)}h`;
  return `${sign}${Math.round(abs * 60)}m`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '-';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

interface KpiSummary {
  total: number;
  active_count: number;
  proposed_count: number;
  selected_count: number;
  filtered_count: number;
  xbrl_count: number;
  narratives_count: number;
  internal_qa_count: number;
  signoff_count: number;
  packaged_count: number;
  countersigned_count: number;
  lodged_count: number;
  acked_count: number;
  archived_count: number;
  rejected_count: number;
  withdrawn_count: number;
  restated_count: number;
  suspended_count: number;
  breached: number;
  reportable_total: number;
  floor_flag_total: number;
  w118_bridged_count: number;
  w113_bridged_count: number;
  w114_bridged_count: number;
  w115_bridged_count: number;
  w116_bridged_count: number;
  w117_bridged_count: number;
  completeness_avg: number;
  xbrl_avg: number;
  esg_avg: number;
  controls_avg: number;
  integrity_avg: number;
}

const EMPTY_KPI: KpiSummary = {
  total: 0, active_count: 0, proposed_count: 0, selected_count: 0,
  filtered_count: 0, xbrl_count: 0, narratives_count: 0, internal_qa_count: 0,
  signoff_count: 0, packaged_count: 0, countersigned_count: 0, lodged_count: 0,
  acked_count: 0, archived_count: 0, rejected_count: 0, withdrawn_count: 0,
  restated_count: 0, suspended_count: 0,
  breached: 0, reportable_total: 0, floor_flag_total: 0,
  w118_bridged_count: 0, w113_bridged_count: 0, w114_bridged_count: 0,
  w115_bridged_count: 0, w116_bridged_count: 0, w117_bridged_count: 0,
  completeness_avg: 0, xbrl_avg: 0, esg_avg: 0, controls_avg: 0, integrity_avg: 0,
};

interface Props {
  // When true, render the regulator inbox slice: lodged_via_api +
  // acknowledged_by_regulator + rejected_by_regulator only, and offer the
  // regulator actions (record-acknowledgement, reject-pack) inline.
  regulatorView?: boolean;
}

export function RegulatorExportPackTab({ regulatorView }: Props = {}) {
  const [rows, setRows] = useState<RepRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(regulatorView ? 'lodged_via_api' : 'active');
  const [selected, setSelected] = useState<RepRow | null>(null);
  const [events, setEvents] = useState<RepEvent[]>([]);
  const [showPropose, setShowPropose] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: RepRow[] } & KpiSummary }>('/regulator-exports');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          proposed_count: data.proposed_count || 0,
          selected_count: data.selected_count || 0,
          filtered_count: data.filtered_count || 0,
          xbrl_count: data.xbrl_count || 0,
          narratives_count: data.narratives_count || 0,
          internal_qa_count: data.internal_qa_count || 0,
          signoff_count: data.signoff_count || 0,
          packaged_count: data.packaged_count || 0,
          countersigned_count: data.countersigned_count || 0,
          lodged_count: data.lodged_count || 0,
          acked_count: data.acked_count || 0,
          archived_count: data.archived_count || 0,
          rejected_count: data.rejected_count || 0,
          withdrawn_count: data.withdrawn_count || 0,
          restated_count: data.restated_count || 0,
          suspended_count: data.suspended_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          floor_flag_total: data.floor_flag_total || 0,
          w118_bridged_count: data.w118_bridged_count || 0,
          w113_bridged_count: data.w113_bridged_count || 0,
          w114_bridged_count: data.w114_bridged_count || 0,
          w115_bridged_count: data.w115_bridged_count || 0,
          w116_bridged_count: data.w116_bridged_count || 0,
          w117_bridged_count: data.w117_bridged_count || 0,
          completeness_avg: data.completeness_avg || 0,
          xbrl_avg: data.xbrl_avg || 0,
          esg_avg: data.esg_avg || 0,
          controls_avg: data.controls_avg || 0,
          integrity_avg: data.integrity_avg || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load regulator export packs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { pack: RepRow; events: RepEvent[] } }>(`/regulator-exports/${id}`);
      if (res.data?.data?.pack) setSelected(res.data.data.pack);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load pack history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')             return true;
      if (filter === 'active')          return !r.is_terminal;
      if (filter === 'reportable')      return r.is_reportable_flag;
      if (filter === 'breached')        return r.sla_breached_live;
      if (filter === 'reg_audit')       return !!r.regulator_audit_in_progress;
      if (filter === 'cross_border')    return !!r.cross_border_filing;
      if (filter === 'jse_srl')         return !!r.jse_srl_listed;
      if (filter === 'prior_restate')   return !!r.prior_restatement_within_12m;
      if (filter === 'sig_break')       return !!r.signature_chain_break_in_window;
      if (filter === 'health_red')      return r.pack_health_band_live === 'red';
      if (filter === 'health_critical') return r.pack_health_band_live === 'critical';
      if (filter === 'mtls_pending')    return r.chain_status === 'countersigned' && !r.lodged_via_api_at;
      if (filter.startsWith('tgt:'))    return r.regulator_target === filter.slice(4);
      if (['ad_hoc', 'monthly_return', 'quarterly_attestation', 'half_year', 'annual_audit'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? EMPTY_KPI;

  const act = useCallback(async (action: ActionKind, row: RepRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'select-blocks') {
        const lo = window.prompt('W118 block height range low (MANDATORY bridge):', String(row.w118_block_height_range_low ?? ''));
        if (lo === null) return;
        body.w118_block_height_range_low = Number(lo);
        const hi = window.prompt('W118 block height range high:', String(row.w118_block_height_range_high ?? lo));
        if (hi === null) return;
        body.w118_block_height_range_high = Number(hi);
        const evm = window.prompt('W113 EVM bridge ref (optional):', row.w113_evm_ref ?? '');
        if (evm) body.w113_evm_ref = evm;
        const doc = window.prompt('W114 doc-control bridge ref (optional):', row.w114_doc_control_ref ?? '');
        if (doc) body.w114_doc_control_ref = doc;
      } else if (action === 'filter-leaves') {
        const note = window.prompt('Filter notes (materiality threshold applied):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'assemble-xbrl') {
        const tax = window.prompt('XBRL taxonomy (e.g. IFRS-2024-03-27):', row.xbrl_taxonomy ?? 'IFRS-2024-03-27');
        if (tax) body.xbrl_taxonomy = tax;
        const score = window.prompt('XBRL conformance score (0-140):', String(row.xbrl_conformance_score ?? 100));
        if (score !== null) body.xbrl_conformance_score = Number(score);
      } else if (action === 'attach-narratives') {
        const esg = window.prompt('ESG taxonomy coverage pct (0-100):', String(row.esg_taxonomy_coverage_pct ?? 80));
        if (esg !== null) body.esg_taxonomy_coverage_pct = Number(esg);
      } else if (action === 'run-internal-qa') {
        const passed = window.confirm('Internal QA PASSED? (controller - COSO + SOC2 TSC + control narratives)');
        body.internal_qa_passed = passed ? 1 : 0;
        const coso = window.prompt('COSO components present (0-5):', String(row.coso_components_present ?? 5));
        if (coso !== null) body.coso_components_present = Number(coso);
        const tsc = window.prompt('TSC trust categories present (0-5):', String(row.tsc_trust_categories_present ?? 5));
        if (tsc !== null) body.tsc_trust_categories_present = Number(tsc);
      } else if (action === 'get-counterparty-signoff') {
        const signed = window.confirm('Counterparty sign-off obtained?');
        body.counterparty_signoff_obtained = signed ? 1 : 0;
        const ma = window.confirm('Management assertion signed?');
        body.management_assertion_signed = ma ? 1 : 0;
        const auditor = window.confirm('Auditor opinion attached?');
        body.auditor_opinion_attached = auditor ? 1 : 0;
        const bridge = window.confirm('Bridge letter attached?');
        body.bridge_letter_attached = bridge ? 1 : 0;
      } else if (action === 'package') {
        const note = window.prompt('Package notes (ZIP+CMS+PDF/A-3):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'countersign') {
        const fp = window.prompt('mTLS fingerprint expected (SHA-256 hex; set so /lodge can match):', row.mtls_fingerprint_expected ?? '');
        if (fp) body.mtls_fingerprint_expected = fp;
      } else if (action === 'lodge-via-api') {
        if (!window.confirm('Lodge to ' + row.regulator_target + ' via mTLS public endpoint?')) return;
      } else if (action === 'record-acknowledgement') {
        const code = window.prompt('Regulator ack code:', row.regulator_ack_code ?? '');
        if (code) body.regulator_ack_code = code;
        const ref = window.prompt('Regulator inbox ref:', row.regulator_inbox_ref ?? '');
        if (ref) body.regulator_inbox_ref = ref;
      } else if (action === 'archive') {
        const note = window.prompt('Archive notes (controller - HARD terminal):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'reject-pack') {
        const code = window.prompt('Regulator reject code (e.g. NERSA-VALIDATE-422):', row.regulator_reject_code ?? '');
        if (!code) return;
        body.regulator_reject_code = code;
        const reason = window.prompt('Reject reason. NOTE: crosses regulator EVERY tier (W119 SIGNATURE).', row.reject_reason ?? '');
        if (reason !== null) body.reject_reason = reason;
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdraw reason (CEO):', row.withdraw_reason ?? '');
        if (reason === null) return;
        body.withdraw_reason = reason;
      } else if (action === 'restate') {
        const reason = window.prompt('Restate reason (CFO - supersede acked pack):', row.restate_reason ?? '');
        if (reason === null) return;
        body.restate_reason = reason;
      } else if (action === 'suspend') {
        const reason = window.prompt('Suspend reason (regulator-audit-in-progress?):', row.suspend_reason ?? '');
        if (reason === null) return;
        body.suspend_reason = reason;
      } else if (action === 'resume') {
        const note = window.prompt('Resume note:', '');
        if (note !== null) body.notes = note;
      }
      await api.post(`/regulator-exports/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load, loadEvents, selected]);

  const propose = useCallback(async (body: Record<string, unknown>) => {
    try {
      await api.post('/regulator-exports', body);
      setShowPropose(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Propose failed');
    }
  }, [load]);

  return (
    <div className="text-[12px] text-[oklch(0.46_0.16_55)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[#0c2a4d]">Certified regulator export packs (W119)</h2>
          <p className="text-[11px] text-[#4a5568]">
            12-state XBRL/iXBRL/ESG-narrative chain lodged via mTLS to NERSA, IPPO, SARB, DMRE, FSCA, DFFE, DTI, JSE, SARS, CIPC.
            INVERTED SLA. FLOOR-AT-QUARTERLY {'≥'}1 flag / FLOOR-AT-ANNUAL {'≥'}2 flags. Mandatory W118 bridge.
          </p>
        </div>
        {!regulatorView && (
          <button type="button"
            onClick={() => setShowPropose(true)}
            className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#c2873a]"
          >
            + Propose pack
          </button>
        )}
      </div>

      {/* 8-card KPI strip */}
      <div className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        <Kpi label="Total"          value={kpis.total} />
        <Kpi label="Active"         value={kpis.active_count} />
        <Kpi label="Lodged"         value={kpis.lodged_count} tone="ok" />
        <Kpi label="Acked"          value={kpis.acked_count} tone="ok" />
        <Kpi label="Rejected"       value={kpis.rejected_count} tone={kpis.rejected_count > 0 ? 'bad' : undefined} />
        <Kpi label="SLA breached"   value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : undefined} />
        <Kpi label="Reportable"     value={kpis.reportable_total} tone={kpis.reportable_total > 0 ? 'warn' : undefined} />
        <Kpi label="Floor flags"    value={kpis.floor_flag_total} tone={kpis.floor_flag_total > 0 ? 'warn' : undefined} />
      </div>

      {/* Drill rail */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded border border-[#d8dde6] bg-white px-3 py-2 text-[11px] text-[#4a5568]">
        <span>Proposed: <span className="font-semibold text-[oklch(0.46_0.16_55)]">{kpis.proposed_count}</span></span>
        <span>Blocks selected: <span className="font-semibold text-[oklch(0.46_0.16_55)]">{kpis.selected_count}</span></span>
        <span>Filtered: <span className="font-semibold text-[oklch(0.46_0.16_55)]">{kpis.filtered_count}</span></span>
        <span>XBRL assembled: <span className="font-semibold text-[#a06200]">{kpis.xbrl_count}</span></span>
        <span>Narratives: <span className="font-semibold text-[#a06200]">{kpis.narratives_count}</span></span>
        <span>Internal QA: <span className="font-semibold text-[#a06200]">{kpis.internal_qa_count}</span></span>
        <span>Sign-off: <span className="font-semibold text-[#1f6b3a]">{kpis.signoff_count}</span></span>
        <span>Packaged: <span className="font-semibold text-[#1f6b3a]">{kpis.packaged_count}</span></span>
        <span>Countersigned: <span className="font-semibold text-[#1f6b3a]">{kpis.countersigned_count}</span></span>
        <span>Archived: <span className="font-semibold text-[#1f5b3a]">{kpis.archived_count}</span></span>
        <span>Withdrawn: <span className="font-semibold text-[#9b1f1f]">{kpis.withdrawn_count}</span></span>
        <span>Restated: <span className="font-semibold text-[#a06200]">{kpis.restated_count}</span></span>
        <span>Suspended: <span className="font-semibold text-[#6b7685]">{kpis.suspended_count}</span></span>
        <span>Completeness avg: <span className="font-semibold text-[oklch(0.46_0.16_55)]">{kpis.completeness_avg}/140</span></span>
        <span>XBRL avg: <span className="font-semibold text-[oklch(0.46_0.16_55)]">{kpis.xbrl_avg}/140</span></span>
        <span>ESG avg: <span className="font-semibold text-[oklch(0.46_0.16_55)]">{kpis.esg_avg}/100</span></span>
        <span>Controls avg: <span className="font-semibold text-[oklch(0.46_0.16_55)]">{kpis.controls_avg}/140</span></span>
        <span>Integrity avg: <span className="font-semibold text-[oklch(0.46_0.16_55)]">{kpis.integrity_avg}/140</span></span>
        <span>W118: <span className="font-semibold text-[oklch(0.46_0.16_55)]">{kpis.w118_bridged_count}</span></span>
        <span>W113: <span className="font-semibold text-[oklch(0.46_0.16_55)]">{kpis.w113_bridged_count}</span></span>
        <span>W114: <span className="font-semibold text-[oklch(0.46_0.16_55)]">{kpis.w114_bridged_count}</span></span>
        <span>W115: <span className="font-semibold text-[oklch(0.46_0.16_55)]">{kpis.w115_bridged_count}</span></span>
        <span>W116: <span className="font-semibold text-[oklch(0.46_0.16_55)]">{kpis.w116_bridged_count}</span></span>
        <span>W117: <span className="font-semibold text-[oklch(0.46_0.16_55)]">{kpis.w117_bridged_count}</span></span>
      </div>

      {/* Row 1: action / priority pills */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_ACTION.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
                : 'bg-white text-[#4a5568] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 2: lifecycle stages + tiers */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_LIFECYCLE.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
                : 'bg-white text-[#6b7685] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 3: regulator targets */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS_TARGETS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#7a0e0e] text-white'
                : 'bg-white text-[#6b7685] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">{err}</div>
      )}
      {loading ? (
        <div className="rounded border border-[#d8dde6] bg-white px-4 py-6 text-center text-sm text-[#4a5568]">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded border border-[#d8dde6] bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-[#f3f5f9]">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)]">Pack #</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)]">Target</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)]">Cadence</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)]">Health</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)]">State</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)] text-center">XBRL</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)] text-center">Integrity</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)] text-center">Flags</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)] text-right">Age</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.current_tier];
                const health = HEALTH_TONE[r.pack_health_band_live ?? r.pack_health_band ?? 'green'];
                const target = TARGET_TONE[r.regulator_target];
                const xbrl = r.xbrl_conformance_score_live ?? r.xbrl_conformance_score ?? 0;
                const integrity = r.integrity_index_live ?? r.integrity_index ?? 0;
                const flags = r.floor_flag_count_live ?? 0;
                const ageHours = r.pack_age_hours_live ?? r.pack_age_hours ?? 0;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      <div className="text-[11px] font-semibold">{r.pack_number}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.reporting_period_start} {'→'} {r.reporting_period_end}</div>
                      {r.is_reportable_flag && <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span>}
                      {r.regulator_ack_received ? <span className="ml-1 text-[9px] font-semibold text-[#1f5b3a]">ACK</span> : null}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold" style={{ background: target.bg, color: target.fg }}>
                        {r.regulator_target}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[oklch(0.46_0.16_55)]">{r.pack_cadence}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: health.bg, color: health.fg }}>
                        {health.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums ${xbrl >= 100 ? 'text-[#1f5b3a]' : xbrl >= 60 ? 'text-[#a06200]' : 'text-[#9b1f1f] font-semibold'}`}>
                      {xbrl}/140
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums ${integrity >= 100 ? 'text-[#1f5b3a]' : integrity >= 60 ? 'text-[#a06200]' : 'text-[#9b1f1f] font-semibold'}`}>
                      {integrity}/140
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums ${flags >= 2 ? 'text-[#9b1f1f] font-semibold' : flags === 1 ? 'text-[#a06200]' : 'text-[#1f5b3a]'}`}>
                      {flags}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[#4a5568]">
                      {fmtHoursSla(ageHours)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached_live ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached_live ? 'BREACHED' : fmtHoursSla(r.sla_hours_remaining_live)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-[#4a5568]">No packs match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} regulatorView={!!regulatorView} />
      )}

      {showPropose && (
        <ProposeModal onClose={() => setShowPropose(false)} onSubmit={propose} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : tone === 'ok' ? '#1f5b3a' : '#0c2a4d';
  return (
    <div className="rounded border border-[#d8dde6] bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct, regulatorView,
}: {
  row: RepRow;
  events: RepEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: RepRow) => void;
  regulatorView: boolean;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status] ?? null;
  const completeness = row.pack_completeness_index_live ?? row.pack_completeness_index;
  const xbrl = row.xbrl_conformance_score_live ?? row.xbrl_conformance_score;
  const esg = row.esg_taxonomy_coverage_pct_live ?? row.esg_taxonomy_coverage_pct;
  const controls = row.controls_narrative_completeness_live ?? row.controls_narrative_completeness;
  const integrity = row.integrity_index_live ?? row.integrity_index;

  const SUSPEND_FROM: RepStatus[] = [
    'xbrl_assembled', 'narratives_attached', 'internal_qa',
    'counterparty_signoff', 'packaged', 'countersigned',
  ];
  const RESTATE_FROM: RepStatus[] = [
    'acknowledged_by_regulator', 'archived',
  ];
  const REJECTABLE: RepStatus[] = [
    'pack_proposed', 'blocks_selected', 'leaves_filtered',
    'xbrl_assembled', 'narratives_attached', 'internal_qa',
    'counterparty_signoff', 'packaged', 'countersigned',
    'lodged_via_api',
  ];
  const WITHDRAWABLE: RepStatus[] = [
    'pack_proposed', 'blocks_selected', 'leaves_filtered',
    'xbrl_assembled', 'narratives_attached', 'internal_qa',
    'counterparty_signoff', 'packaged', 'countersigned',
    'lodged_via_api', 'suspended',
  ];

  const canSuspend  = SUSPEND_FROM.includes(row.chain_status);
  const canRestate  = RESTATE_FROM.includes(row.chain_status);
  const canReject   = REJECTABLE.includes(row.chain_status);
  const canWithdraw = WITHDRAWABLE.includes(row.chain_status);

  const renderAct = (action: ActionKind, label: string, tone: 'primary' | 'danger' | 'amber' | 'plain' = 'plain') => {
    const cls = tone === 'primary'
      ? 'bg-[#c2873a] text-white hover:bg-[#c2873a]'
      : tone === 'danger'
        ? 'bg-[#7a0e0e] text-white hover:bg-[#9b1f1f]'
        : tone === 'amber'
          ? 'bg-[#a06200] text-white hover:bg-[#c97a00]'
          : 'bg-white border border-[#d8dde6] text-[oklch(0.46_0.16_55)] hover:bg-[#f3f5f9]';
    return (
      <button type="button"
        key={action}
        onClick={() => onAct(action, row)}
        className={`rounded px-3 py-1.5 text-[11px] font-semibold ${cls}`}
        title={ACTION_LABEL[action]}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40">
      <div className="w-full max-w-3xl overflow-y-auto bg-[#f3f5f9] p-4">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#6b7685]">{row.regulator_target} {'•'} {row.pack_cadence}</div>
            <h3 className="text-lg font-semibold text-[#0c2a4d]">{row.pack_number}</h3>
            <p className="text-[11px] text-[#4a5568]">
              {row.title || 'Regulator export pack'} {'•'} {row.reporting_period_start} {'→'} {row.reporting_period_end}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1 text-[12px] text-[oklch(0.46_0.16_55)] hover:bg-[#f3f5f9]">Close</button>
        </div>

        {/* Scoring */}
        <div className="mb-3 grid grid-cols-5 gap-2">
          <Kpi label="Completeness" value={`${completeness}/140`} tone={completeness >= 100 ? 'ok' : completeness >= 60 ? 'warn' : 'bad'} />
          <Kpi label="XBRL" value={`${xbrl}/140`} tone={xbrl >= 100 ? 'ok' : xbrl >= 60 ? 'warn' : 'bad'} />
          <Kpi label="ESG" value={`${esg}/100`} tone={esg >= 80 ? 'ok' : esg >= 50 ? 'warn' : 'bad'} />
          <Kpi label="Controls" value={`${controls}/140`} tone={controls >= 100 ? 'ok' : controls >= 60 ? 'warn' : 'bad'} />
          <Kpi label="Integrity" value={`${integrity}/140`} tone={integrity >= 100 ? 'ok' : integrity >= 60 ? 'warn' : 'bad'} />
        </div>

        {/* Bridges + flags */}
        <div className="mb-3 grid grid-cols-2 gap-3 rounded border border-[#d8dde6] bg-white p-3">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[#6b7685]">Bridges</div>
            <ul className="space-y-0.5 text-[11px] text-[#4a5568]">
              <li>W118 audit chain: <span className={row.bridges_to_w118_audit_chain_live ? 'text-[#1f5b3a] font-semibold' : 'text-[#9b1f1f] font-semibold'}>
                {row.bridges_to_w118_audit_chain_live ? 'BRIDGED (mandatory)' : 'MISSING (mandatory)'}
              </span></li>
              <li>W113 EVM: <span className={row.bridges_to_w113_evm_chain_live ? 'text-[#1f5b3a]' : 'text-[#6b7685]'}>{row.bridges_to_w113_evm_chain_live ? 'bridged' : '-'}</span></li>
              <li>W114 doc control: <span className={row.bridges_to_w114_doc_control_chain_live ? 'text-[#1f5b3a]' : 'text-[#6b7685]'}>{row.bridges_to_w114_doc_control_chain_live ? 'bridged' : '-'}</span></li>
              <li>W115 submittal: <span className={row.bridges_to_w115_submittal_chain_live ? 'text-[#1f5b3a]' : 'text-[#6b7685]'}>{row.bridges_to_w115_submittal_chain_live ? 'bridged' : '-'}</span></li>
              <li>W116 RFI: <span className={row.bridges_to_w116_rfi_chain_live ? 'text-[#1f5b3a]' : 'text-[#6b7685]'}>{row.bridges_to_w116_rfi_chain_live ? 'bridged' : '-'}</span></li>
              <li>W117 change order: <span className={row.bridges_to_w117_change_order_chain_live ? 'text-[#1f5b3a]' : 'text-[#6b7685]'}>{row.bridges_to_w117_change_order_chain_live ? 'bridged' : '-'}</span></li>
            </ul>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[#6b7685]">Floor flags ({row.floor_flag_count_live ?? 0})</div>
            <ul className="space-y-0.5 text-[11px] text-[#4a5568]">
              <li>JSE SRL listed: <span className={row.jse_srl_listed ? 'text-[#9b1f1f] font-semibold' : 'text-[#6b7685]'}>{row.jse_srl_listed ? 'YES' : 'no'}</span></li>
              <li>Cross-border filing: <span className={row.cross_border_filing ? 'text-[#9b1f1f] font-semibold' : 'text-[#6b7685]'}>{row.cross_border_filing ? 'YES' : 'no'}</span></li>
              <li>Prior restatement 12m: <span className={row.prior_restatement_within_12m ? 'text-[#9b1f1f] font-semibold' : 'text-[#6b7685]'}>{row.prior_restatement_within_12m ? 'YES' : 'no'}</span></li>
              <li>Regulator audit in progress: <span className={row.regulator_audit_in_progress ? 'text-[#9b1f1f] font-semibold' : 'text-[#6b7685]'}>{row.regulator_audit_in_progress ? 'YES' : 'no'}</span></li>
              <li>Sig-chain break in window: <span className={row.signature_chain_break_in_window ? 'text-[#9b1f1f] font-semibold' : 'text-[#6b7685]'}>{row.signature_chain_break_in_window ? 'YES' : 'no'}</span></li>
            </ul>
          </div>
        </div>

        {/* Timestamps */}
        <div className="mb-3 grid grid-cols-2 gap-2 rounded border border-[#d8dde6] bg-white p-3 text-[11px] text-[#4a5568]">
          <div>Proposed: {fmtDate(row.pack_proposed_at)}</div>
          <div>Blocks selected: {fmtDate(row.blocks_selected_at)}</div>
          <div>Leaves filtered: {fmtDate(row.leaves_filtered_at)}</div>
          <div>XBRL assembled: {fmtDate(row.xbrl_assembled_at)}</div>
          <div>Narratives attached: {fmtDate(row.narratives_attached_at)}</div>
          <div>Internal QA: {fmtDate(row.internal_qa_at)}</div>
          <div>Sign-off: {fmtDate(row.counterparty_signoff_at)}</div>
          <div>Packaged: {fmtDate(row.packaged_at)}</div>
          <div>Countersigned: {fmtDate(row.countersigned_at)}</div>
          <div>Lodged via mTLS: {fmtDate(row.lodged_via_api_at)}</div>
          <div>Acknowledged: {fmtDate(row.acknowledged_by_regulator_at)}</div>
          <div>Archived: {fmtDate(row.archived_at)}</div>
          {row.regulator_crossed_at && <div>Regulator crossed: <span className="font-semibold text-[#9b1f1f]">{fmtDate(row.regulator_crossed_at)}</span></div>}
          {row.regulator_inbox_ref && <div>Regulator inbox: <span className="font-mono text-[10px]">{row.regulator_inbox_ref}</span></div>}
          {row.regulator_ref && <div>Regulator ref: <span className="font-mono text-[10px]">{row.regulator_ref}</span></div>}
          {row.regulator_ack_code && <div>Ack code: <span className="font-mono text-[10px]">{row.regulator_ack_code}</span></div>}
          {row.regulator_reject_code && <div>Reject code: <span className="font-mono text-[10px] text-[#9b1f1f]">{row.regulator_reject_code}</span></div>}
        </div>

        {/* Action buttons */}
        <div className="mb-3 flex flex-wrap gap-2">
          {!regulatorView && nextAction && renderAct(nextAction, ACTION_LABEL[nextAction].split(' (')[0], 'primary')}
          {regulatorView && row.chain_status === 'lodged_via_api' && renderAct('record-acknowledgement', 'Record acknowledgement', 'primary')}
          {regulatorView && row.chain_status === 'acknowledged_by_regulator' && renderAct('archive', 'Archive', 'plain')}
          {canSuspend && !regulatorView && renderAct('suspend', 'Suspend', 'amber')}
          {canRestate && !regulatorView && renderAct('restate', 'Restate', 'amber')}
          {canWithdraw && !regulatorView && renderAct('withdraw', 'Withdraw', 'danger')}
          {canReject && renderAct('reject-pack', 'Reject (regulator)', 'danger')}
        </div>

        {/* Event log */}
        <div className="rounded border border-[#d8dde6] bg-white">
          <div className="border-b border-[#e3e7ec] px-3 py-2 text-[11px] font-semibold text-[#0c2a4d]">Event log ({events.length})</div>
          <ul className="divide-y divide-[#e3e7ec] text-[11px]">
            {events.map((e) => (
              <li key={e.id} className="px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[oklch(0.46_0.16_55)]">{e.event_type}</span>
                  <span className="text-[#6b7685]">{fmtDate(e.created_at)}</span>
                </div>
                <div className="text-[#4a5568]">
                  {e.from_status} {'→'} {e.to_status}
                  {e.from_tier && e.to_tier && e.from_tier !== e.to_tier ? ` ${'•'} ${e.from_tier} → ${e.to_tier}` : ''}
                </div>
                {e.notes && <div className="text-[#6b7685]">{e.notes}</div>}
              </li>
            ))}
            {events.length === 0 && (
              <li className="px-3 py-3 text-center text-[#6b7685]">No events yet.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ProposeModal({
  onClose, onSubmit,
}: {
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [target, setTarget] = useState<RegulatorTarget>('NERSA');
  const [cadence, setCadence] = useState<Cadence>('quarterly_attestation');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [title, setTitle] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [flagJse, setFlagJse] = useState(false);
  const [flagCb, setFlagCb] = useState(false);
  const [flagPrior, setFlagPrior] = useState(false);
  const [flagAudit, setFlagAudit] = useState(false);
  const [flagBreak, setFlagBreak] = useState(false);

  const submit = () => {
    if (!periodStart || !periodEnd) return;
    onSubmit({
      regulator_target: target,
      pack_cadence: cadence,
      reporting_period_start: periodStart,
      reporting_period_end: periodEnd,
      title: title || null,
      reason_code: reasonCode || null,
      jse_srl_listed: flagJse ? 1 : 0,
      cross_border_filing: flagCb ? 1 : 0,
      prior_restatement_within_12m: flagPrior ? 1 : 0,
      regulator_audit_in_progress: flagAudit ? 1 : 0,
      signature_chain_break_in_window: flagBreak ? 1 : 0,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded bg-white p-4 shadow-lg">
        <h3 className="mb-3 text-base font-semibold text-[#0c2a4d]">Propose regulator export pack</h3>
        <div className="space-y-2 text-[12px]">
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Regulator target</div>
            <select value={target} onChange={(e) => setTarget(e.target.value as RegulatorTarget)} className="w-full rounded border border-[#d8dde6] px-2 py-1">
              {(['NERSA','IPPO','SARB','DMRE','FSCA','DFFE','DTI','JSE','SARS','CIPC'] as RegulatorTarget[]).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Cadence (INVERTED SLA: bigger = more time)</div>
            <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)} className="w-full rounded border border-[#d8dde6] px-2 py-1">
              <option value="ad_hoc">Ad hoc (24h)</option>
              <option value="monthly_return">Monthly return (72h)</option>
              <option value="quarterly_attestation">Quarterly attestation (168h)</option>
              <option value="half_year">Half-year (240h)</option>
              <option value="annual_audit">Annual audit (480h)</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Period start</div>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1" />
            </label>
            <label>
              <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Period end</div>
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1" />
            </label>
          </div>
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Title</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1" />
          </label>
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Reason code</div>
            <input value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} placeholder="e.g. quarterly_routine" className="w-full rounded border border-[#d8dde6] px-2 py-1" />
          </label>
          <div className="rounded border border-[#d8dde6] bg-[#f8fafc] p-2">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[#6b7685]">
              Floor flags ({'≥'}1 lifts to quarterly; {'≥'}2 lifts to annual)
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={flagJse} onChange={(e) => setFlagJse(e.target.checked)} /> JSE SRL listed</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={flagCb} onChange={(e) => setFlagCb(e.target.checked)} /> Cross-border filing</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={flagPrior} onChange={(e) => setFlagPrior(e.target.checked)} /> Prior restatement within 12m</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={flagAudit} onChange={(e) => setFlagAudit(e.target.checked)} /> Regulator audit in progress</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={flagBreak} onChange={(e) => setFlagBreak(e.target.checked)} /> Sig-chain break in window</label>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] text-[oklch(0.46_0.16_55)] hover:bg-[#f3f5f9]">Cancel</button>
          <button type="button" onClick={submit} className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#c2873a]">Propose</button>
        </div>
      </div>
    </div>
  );
}
