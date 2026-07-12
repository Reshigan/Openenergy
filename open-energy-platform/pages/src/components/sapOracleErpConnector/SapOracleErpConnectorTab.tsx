// Wave 125 - SAP / Oracle ERP Connector.
//
// Phase C wave 4. ENTERPRISE BACK-OFFICE financial integration spine -
// real bidirectional integration to SAP S/4HANA Cloud, SAP ECC (IDoc
// FIDCC1/FIDCC2/REMADV/INVOIC/PEXR2002), Oracle E-Business Suite,
// Oracle Fusion (REST + SOAP), Workday Financials, SAGE 300, Microsoft
// Dynamics 365, NetSuite (SuiteTalk REST + SOAP), Epicor, IFS.
//
// Mounted at /admin/workstation?tab=sap-oracle-erp-connectors for admin,
// /trader/workstation?tab=sap-oracle-erp-connectors for trader,
// /lender/workstation?tab=sap-oracle-erp-connectors for lender,
// /offtaker/workstation?tab=sap-oracle-erp-connectors for offtaker.
//
// Beats: SAP S/4HANA Cloud Integration + Oracle Integration Cloud +
// Workday Integration Cloud + MuleSoft + Boomi + Informatica + TIBCO +
// IBM AppConnect + Microsoft Azure Integration Services + SnapLogic +
// Celigo integrator.io.
//
// 10-state forward + 4 branch lifecycle:
//   connector_proposed -> erp_endpoint_validated -> company_code_mapped
//     -> chart_of_accounts_bound -> schemas_loaded ->
//     idoc_session_established -> test_postings_validated ->
//     reconciliation_period_bound -> live_posting_active ->
//     period_close_reconciled -> archived (HARD)
//   any non-terminal -> disconnect -> disconnected (HARD)
//   any non-terminal -> revoke_credential -> credential_revoked (HARD)
//   active states -> suspend -> suspended (SOFT)
//   live -> activate_failover -> failover_active (SOFT)
//
// 5-tier INVERTED SLA polarity (HOURS) - bigger ERP scope = MORE time:
// single_module 168h / multi_module 240h / enterprise_wide 360h /
// group_consolidation 480h / multi_country 720h.
// FLOOR-AT-ENTERPRISE-WIDE on {'>='}1 of 5 flags; FLOOR-AT-MULTI-COUNTRY {'>='}3.
// Flags: sox_404_in_scope / ifrs_consolidation_required /
// cross_border_transfer_pricing / sars_efiling_critical_path /
// cipc_annual_filing_gate.
//
// SIGNATURE Phase-C regulator crossings:
//   * revoke_credential crosses EVERY tier (W125 SIGNATURE SAP-ORACLE-
//     ERP-CONNECTOR-REVOKE - SARS + CIPC + SOC 1 Type II + ISO 27001 +
//     PCAOB AS 5)
//   * activate_failover crosses enterprise_wide + group_consolidation +
//     multi_country
//   * disconnect crosses EVERY tier WHEN sox_404_in_scope OR
//     sars_efiling_critical_path
//   * reconcile_period_close crosses multi_country only
//   * sla_breached enterprise_wide + group_consolidation + multi_country only
//
// Write {admin, trader, lender, offtaker}. READ all 9 personas.
// EXTERNAL erp_counterparty via mTLS-gated PUBLIC peer endpoint
// (x-mtls-cert-fingerprint header).
//
// 5 bridges (W118 MANDATORY): W124 STRATE/SWIFT settlement connector +
// W68 counterparty margin + W3 settlement P6 + W21 drawdown + W118
// audit block ref.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type SoecStatus =
  | 'connector_proposed' | 'erp_endpoint_validated' | 'company_code_mapped'
  | 'chart_of_accounts_bound' | 'schemas_loaded' | 'idoc_session_established'
  | 'test_postings_validated' | 'reconciliation_period_bound'
  | 'live_posting_active' | 'period_close_reconciled' | 'archived'
  | 'disconnected' | 'credential_revoked' | 'suspended' | 'failover_active';

type SoecTier = 'single_module' | 'multi_module' | 'enterprise_wide' | 'group_consolidation' | 'multi_country';
type SoecUrgency = 'low' | 'medium' | 'high' | 'critical' | 'systemic';
type SoecAuthority = 'finance_engineer' | 'financial_controller' | 'CFO' | 'CEO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type SoecErpSystem =
  | 'sap_s4hana' | 'sap_ecc' | 'oracle_ebs' | 'oracle_fusion' | 'workday'
  | 'sage_300' | 'dynamics_365' | 'netsuite' | 'epicor' | 'ifs';
type SoecProtocol =
  | 'odata_v4' | 'soap' | 'rest' | 'idoc' | 'suitetalk' | 'dataverse' | 'proprietary';
type SarsStatus = 'current' | 'pending' | 'overdue';
type CipcStatus = 'current' | 'pending' | 'overdue';

interface SoecRow {
  [key: string]: unknown;
  id: string;
  connector_number: string;
  peer_id: string;
  counterparty_name: string | null;
  erp_system: SoecErpSystem | string;
  protocol: SoecProtocol | string;
  schema_version: string | null;
  service_account_credential_fingerprint: string | null;
  credential_expiry_at: string | null;
  endpoint_url: string | null;
  module_count: number | null;
  company_code_count: number | null;
  chart_of_accounts_node_count: number | null;
  jurisdiction_count: number | null;
  idoc_session_id: string | null;
  period_end_at: string | null;
  w124_settlement_connector_ref: string | null;
  w3_settlement_p6_ref: string | null;
  w68_counterparty_margin_ref: string | null;
  w21_drawdown_ref: string | null;
  w118_block_ref: string | null;
  sox_404_in_scope: number;
  ifrs_consolidation_required: number;
  cross_border_transfer_pricing: number;
  sars_efiling_critical_path: number;
  cipc_annual_filing_gate: number;
  posting_volume_per_hour: number | null;
  successful_posting_count_24h: number | null;
  failed_posting_count_24h: number | null;
  failure_rate_pct: number | null;
  average_posting_latency_ms: number | null;
  reconciliation_break_count: number | null;
  ifrs_15_revenue_contribution_pct: number | null;
  ifrs_9_financial_instrument_contribution_pct: number | null;
  sars_efiling_status: SarsStatus | null;
  cipc_annual_filing_status: CipcStatus | null;
  schemas_compliant: number;
  iso27001_controls_ok: number;
  soc1_type2_audit_ok: number;
  control_effectiveness_index: number | null;
  current_tier: SoecTier;
  authority_required: SoecAuthority | null;
  urgency_band: SoecUrgency | null;
  connector_health_band: HealthBand | null;
  title: string | null;
  reason_code: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  regulator_ref: string | null;
  regulator_inbox_ref: string | null;
  chain_status: SoecStatus;
  connector_proposed_at: string | null;
  erp_endpoint_validated_at: string | null;
  company_code_mapped_at: string | null;
  chart_of_accounts_bound_at: string | null;
  schemas_loaded_at: string | null;
  idoc_session_established_at: string | null;
  test_postings_validated_at: string | null;
  reconciliation_period_bound_at: string | null;
  live_posting_active_at: string | null;
  period_close_reconciled_at: string | null;
  archived_at: string | null;
  disconnected_at: string | null;
  suspended_at: string | null;
  credential_revoked_at: string | null;
  failover_activated_at: string | null;
  regulator_crossed_at: string | null;
  sla_target_hours: number;
  sla_deadline_at: string | null;
  sla_breached: number;
  last_sla_breach_at: string | null;
  escalation_level: number;
  days_to_credential_renewal: number | null;
  days_to_period_close: number | null;
  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // LIVE 28-field decoration battery
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number;
  urgency_band_live?: SoecUrgency;
  authority_required_live?: SoecAuthority;
  days_to_credential_renewal_live?: number;
  days_to_period_close_live?: number;
  floor_flag_count_live?: number;
  floor_at_enterprise_wide_live?: boolean;
  floor_at_multi_country_live?: boolean;
  control_effectiveness_index_live?: number;
  connector_health_band_live?: HealthBand;
  bridges_to_w124_settlement_connector_live?: boolean;
  bridges_to_w3_settlement_p6_live?: boolean;
  bridges_to_w68_counterparty_margin_live?: boolean;
  bridges_to_w21_drawdown_live?: boolean;
  bridges_to_w118_audit_chain_live?: boolean;
}

interface SoecEvent {
  id: string;
  connector_id: string;
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

const STATE_TONE: Record<SoecStatus, { bg: string; fg: string; label: string }> = {
  connector_proposed:           { bg: 'var(--s2, #eef1f5)', fg: 'var(--ink-2)',    label: 'Proposed' },
  erp_endpoint_validated:       { bg: 'color-mix(in oklab, var(--warn) 18%, var(--s1))', fg: 'var(--warn)', label: 'Endpoint OK' },
  company_code_mapped:          { bg: 'color-mix(in oklab, var(--warn) 18%, var(--s1))', fg: 'var(--warn)', label: 'Company code' },
  chart_of_accounts_bound:      { bg: 'color-mix(in oklab, var(--warn) 18%, var(--s1))', fg: 'var(--warn)', label: 'CoA bound' },
  schemas_loaded:               { bg: 'color-mix(in oklab, var(--warn) 18%, var(--s1))', fg: 'var(--warn)', label: 'Schemas' },
  idoc_session_established:     { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'IDoc session' },
  test_postings_validated:      { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'Test postings' },
  reconciliation_period_bound:  { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'Recon bound' },
  live_posting_active:          { bg: 'color-mix(in oklab, var(--good) 15%, var(--s1))', fg: 'var(--good, #1f6b3a)', label: 'Live posting' },
  period_close_reconciled:      { bg: 'color-mix(in oklab, var(--good) 15%, var(--s1))', fg: 'var(--good, #1f6b3a)', label: 'Period closed' },
  archived:                     { bg: 'var(--good, #1f5b3a)', fg: '#fff',    label: 'Archived' },
  disconnected:                 { bg: 'var(--bad, #7a0e0e)', fg: '#fff',    label: 'Disconnected' },
  credential_revoked:           { bg: 'var(--bad, #7a0e0e)', fg: '#fff',    label: 'Cred revoked' },
  suspended:                    { bg: 'var(--s2, #eef1f5)', fg: 'var(--ink-2)',    label: 'Suspended' },
  failover_active:              { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'Failover' },
};

const TIER_TONE: Record<SoecTier, { bg: string; fg: string; label: string }> = {
  single_module:        { bg: 'var(--s2, #eef1f5)', fg: 'var(--ink-2)',    label: 'Single module' },
  multi_module:         { bg: 'color-mix(in oklab, var(--warn) 18%, var(--s1))', fg: 'var(--warn)', label: 'Multi-module' },
  enterprise_wide:      { bg: 'color-mix(in oklab, var(--good) 15%, var(--s1))', fg: 'var(--good, #1f6b3a)', label: 'Enterprise-wide' },
  group_consolidation:  { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'Group consol.' },
  multi_country:        { bg: 'var(--bad, #7a0e0e)', fg: '#fff',    label: 'Multi-country' },
};

const HEALTH_TONE: Record<HealthBand, { bg: string; fg: string; label: string }> = {
  green:    { bg: 'color-mix(in oklab, var(--good) 15%, var(--s1))', fg: 'var(--good, #1f5b3a)', label: 'Green' },
  amber:    { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'Amber' },
  red:      { bg: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', fg: 'var(--bad, #9b1f1f)', label: 'Red' },
  critical: { bg: 'var(--bad, #7a0e0e)', fg: '#fff',    label: 'Critical' },
};

const FILTERS_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',          label: 'Active' },
  { key: 'all',             label: 'All' },
  { key: 'reportable',      label: 'Reportable' },
  { key: 'breached',        label: 'SLA breached' },
  { key: 'cred_60d',        label: 'Cred exp. 60d' },
  { key: 'cred_14d',        label: 'Cred exp. 14d' },
  { key: 'health_red',      label: 'Health red' },
  { key: 'health_critical', label: 'Health critical' },
  { key: 'multi_country_floor', label: 'Multi-country floor' },
  { key: 'enterprise_floor', label: 'Enterprise floor' },
  { key: 'disconnected',    label: 'Disconnected' },
  { key: 'credential_revoked', label: 'Revoked' },
];

const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'connector_proposed',          label: 'Proposed' },
  { key: 'erp_endpoint_validated',      label: 'Endpoint' },
  { key: 'company_code_mapped',         label: 'Company code' },
  { key: 'chart_of_accounts_bound',     label: 'CoA' },
  { key: 'schemas_loaded',              label: 'Schemas' },
  { key: 'idoc_session_established',    label: 'IDoc session' },
  { key: 'test_postings_validated',     label: 'Test postings' },
  { key: 'reconciliation_period_bound', label: 'Recon bound' },
  { key: 'live_posting_active',         label: 'Live' },
  { key: 'period_close_reconciled',     label: 'Reconciled' },
  { key: 'archived',                    label: 'Archived' },
  { key: 'disconnected',                label: 'Disconnected' },
  { key: 'credential_revoked',          label: 'Revoked' },
  { key: 'suspended',                   label: 'Suspended' },
  { key: 'failover_active',             label: 'Failover' },
];

const FILTERS_TIER: Array<{ key: string; label: string }> = [
  { key: 'tier:single_module',       label: 'Single module (168h)' },
  { key: 'tier:multi_module',        label: 'Multi-module (240h)' },
  { key: 'tier:enterprise_wide',     label: 'Enterprise (360h)' },
  { key: 'tier:group_consolidation', label: 'Group consol. (480h)' },
  { key: 'tier:multi_country',       label: 'Multi-country (720h)' },
];

const FILTERS_ERP: Array<{ key: string; label: string }> = [
  { key: 'erp:sap_s4hana',    label: 'SAP S/4HANA' },
  { key: 'erp:sap_ecc',       label: 'SAP ECC' },
  { key: 'erp:oracle_ebs',    label: 'Oracle EBS' },
  { key: 'erp:oracle_fusion', label: 'Oracle Fusion' },
  { key: 'erp:workday',       label: 'Workday' },
  { key: 'erp:sage_300',      label: 'SAGE 300' },
  { key: 'erp:dynamics_365',  label: 'Dynamics 365' },
  { key: 'erp:netsuite',      label: 'NetSuite' },
  { key: 'erp:epicor',        label: 'Epicor' },
  { key: 'erp:ifs',           label: 'IFS' },
];

const FILTERS_SARS: Array<{ key: string; label: string }> = [
  { key: 'sars:current', label: 'SARS current' },
  { key: 'sars:pending', label: 'SARS pending' },
  { key: 'sars:overdue', label: 'SARS overdue' },
];

type ActionKind =
  | 'validate-erp-endpoint' | 'map-company-code' | 'bind-chart-of-accounts'
  | 'load-schemas' | 'establish-idoc-session' | 'validate-test-postings'
  | 'bind-reconciliation-period' | 'activate-live-posting'
  | 'reconcile-period-close' | 'archive' | 'disconnect'
  | 'suspend' | 'resume' | 'revoke-credential' | 'activate-failover';

const ACTION_FOR_STATE: Partial<Record<SoecStatus, ActionKind>> = {
  connector_proposed:           'validate-erp-endpoint',
  erp_endpoint_validated:       'map-company-code',
  company_code_mapped:          'bind-chart-of-accounts',
  chart_of_accounts_bound:      'load-schemas',
  schemas_loaded:               'establish-idoc-session',
  idoc_session_established:     'validate-test-postings',
  test_postings_validated:      'bind-reconciliation-period',
  reconciliation_period_bound:  'activate-live-posting',
  live_posting_active:          'reconcile-period-close',
  period_close_reconciled:      'archive',
  suspended:                    'resume',
  failover_active:              'activate-live-posting',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'validate-erp-endpoint':      'Validate ERP endpoint (finance engineer - OData/IDoc/SOAP reachability)',
  'map-company-code':           'Map company code (finance engineer - SAP BUKRS / Oracle OU / NetSuite Subsidiary)',
  'bind-chart-of-accounts':     'Bind chart of accounts (finance engineer - SKB1/GL_ACCOUNTS/COA hierarchy)',
  'load-schemas':               'Load IDoc/REST/SOAP schemas (finance engineer - FIDCC1/FIDCC2/REMADV/INVOIC)',
  'establish-idoc-session':     'Establish IDoc session (finance engineer - service-account cred + mTLS)',
  'validate-test-postings':     'Validate test postings (finance engineer - smoke test posting batches)',
  'bind-reconciliation-period': 'Bind reconciliation period (financial controller - month-end window)',
  'activate-live-posting':      'ACTIVATE LIVE (CFO - posts SAP_ORACLE_ERP_CONNECTOR-LIVE; SOX 404 + IFRS 15/9/16)',
  'reconcile-period-close':     'Reconcile period close (CFO - SIGNATURE - crosses multi_country always)',
  'archive':                    'Archive (CEO - HARD terminal, retire connector)',
  'disconnect':                 'DISCONNECT (CFO - HARD; crosses EVERY tier WHEN sox_404_in_scope OR sars_efiling_critical_path)',
  'suspend':                    'Suspend (financial controller - period-close lockout, SOFT)',
  'resume':                     'Resume (financial controller - exit lockout)',
  'revoke-credential':          'REVOKE CREDENTIAL (SIGNATURE - crosses EVERY tier; SARS + CIPC + SOC 1 Type II + ISO 27001 + PCAOB AS 5)',
  'activate-failover':          'Activate failover (financial controller - primary to DR ERP; enterprise+group+multi_country cross)',
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

function fmtErp(s: SoecErpSystem | string | null | undefined): string {
  if (!s) return '-';
  const map: Record<string, string> = {
    sap_s4hana:    'SAP S/4HANA',
    sap_ecc:       'SAP ECC',
    oracle_ebs:    'Oracle EBS',
    oracle_fusion: 'Oracle Fusion',
    workday:       'Workday',
    sage_300:      'SAGE 300',
    dynamics_365:  'Dynamics 365',
    netsuite:      'NetSuite',
    epicor:        'Epicor',
    ifs:           'IFS',
  };
  return map[String(s)] ?? String(s).replace(/_/g, ' ').toUpperCase();
}

function fmtProto(p: SoecProtocol | string | null | undefined): string {
  if (!p) return '-';
  return String(p).replace(/_/g, ' ').toUpperCase();
}

interface KpiSummary {
  total: number;
  active_count: number;
  proposed_count: number;
  endpoint_v_count: number;
  cc_mapped_count: number;
  coa_bound_count: number;
  schemas_count: number;
  idoc_count: number;
  tests_count: number;
  recon_bound_count: number;
  live_count: number;
  reconciled_count: number;
  archived_count: number;
  disconnected_count: number;
  revoked_count: number;
  suspended_count: number;
  failover_count: number;
  breached: number;
  reportable_total: number;
  floor_flag_total: number;
  w124_bridged_count: number;
  w3_bridged_count: number;
  w68_bridged_count: number;
  w21_bridged_count: number;
  w118_bridged_count: number;
  control_effectiveness_avg: number;
  creds_expiring_within_60d: number;
  creds_expiring_within_14d: number;
}

const EMPTY_KPI: KpiSummary = {
  total: 0, active_count: 0,
  proposed_count: 0, endpoint_v_count: 0, cc_mapped_count: 0, coa_bound_count: 0,
  schemas_count: 0, idoc_count: 0, tests_count: 0, recon_bound_count: 0,
  live_count: 0, reconciled_count: 0, archived_count: 0,
  disconnected_count: 0, revoked_count: 0, suspended_count: 0, failover_count: 0,
  breached: 0, reportable_total: 0, floor_flag_total: 0,
  w124_bridged_count: 0, w3_bridged_count: 0, w68_bridged_count: 0,
  w21_bridged_count: 0, w118_bridged_count: 0,
  control_effectiveness_avg: 0,
  creds_expiring_within_60d: 0, creds_expiring_within_14d: 0,
};

interface Props {
  // External / regulator-view: shows disconnected + revoked + reportable
  // rows only, read-only. Used to inspect SAP-ORACLE-ERP-CONNECTOR-REVOKE
  // signature lines under SARS + CIPC + SOC 1 Type II + ISO 27001 +
  // PCAOB AS 5.
  regulatorView?: boolean;
}

export function SapOracleErpConnectorTab({ regulatorView }: Props = {}) {
  const [rows, setRows] = useState<SoecRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(regulatorView ? 'credential_revoked' : 'active');
  const [selected, setSelected] = useState<SoecRow | null>(null);
  const [events, setEvents] = useState<SoecEvent[]>([]);
  const [showPropose, setShowPropose] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: SoecRow[] } & KpiSummary }>('/sap-oracle-erp-connector');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          proposed_count: data.proposed_count || 0,
          endpoint_v_count: data.endpoint_v_count || 0,
          cc_mapped_count: data.cc_mapped_count || 0,
          coa_bound_count: data.coa_bound_count || 0,
          schemas_count: data.schemas_count || 0,
          idoc_count: data.idoc_count || 0,
          tests_count: data.tests_count || 0,
          recon_bound_count: data.recon_bound_count || 0,
          live_count: data.live_count || 0,
          reconciled_count: data.reconciled_count || 0,
          archived_count: data.archived_count || 0,
          disconnected_count: data.disconnected_count || 0,
          revoked_count: data.revoked_count || 0,
          suspended_count: data.suspended_count || 0,
          failover_count: data.failover_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          floor_flag_total: data.floor_flag_total || 0,
          w124_bridged_count: data.w124_bridged_count || 0,
          w3_bridged_count: data.w3_bridged_count || 0,
          w68_bridged_count: data.w68_bridged_count || 0,
          w21_bridged_count: data.w21_bridged_count || 0,
          w118_bridged_count: data.w118_bridged_count || 0,
          control_effectiveness_avg: data.control_effectiveness_avg || 0,
          creds_expiring_within_60d: data.creds_expiring_within_60d || 0,
          creds_expiring_within_14d: data.creds_expiring_within_14d || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load SAP/Oracle ERP connectors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { connector: SoecRow; events: SoecEvent[] } }>(`/sap-oracle-erp-connector/${id}`);
      if (res.data?.data?.connector) setSelected(res.data.data.connector);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load connector history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')              return true;
      if (filter === 'active')           return !r.is_terminal;
      if (filter === 'reportable')       return !!r.is_reportable_flag;
      if (filter === 'breached')         return r.sla_breached_live;
      if (filter === 'cred_60d')         return (r.days_to_credential_renewal_live ?? 9999) < 60;
      if (filter === 'cred_14d')         return (r.days_to_credential_renewal_live ?? 9999) < 14;
      if (filter === 'health_red')       return r.connector_health_band_live === 'red';
      if (filter === 'health_critical')  return r.connector_health_band_live === 'critical';
      if (filter === 'multi_country_floor') return !!r.floor_at_multi_country_live;
      if (filter === 'enterprise_floor') return !!r.floor_at_enterprise_wide_live;
      if (filter.startsWith('tier:'))    return r.current_tier === filter.slice(5);
      if (filter.startsWith('erp:'))     return r.erp_system === filter.slice(4);
      if (filter.startsWith('sars:'))    return r.sars_efiling_status === filter.slice(5);
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? EMPTY_KPI;

  const act = useCallback(async (action: ActionKind, row: SoecRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'validate-erp-endpoint') {
        body.endpoint_url = row.endpoint_url ?? '';
        body.counterparty_name = row.counterparty_name ?? '';
      } else if (action === 'map-company-code') {
        body.company_code_count = row.company_code_count ?? 1;
        body.jurisdiction_count = row.jurisdiction_count ?? 1;
      } else if (action === 'bind-chart-of-accounts') {
        body.chart_of_accounts_node_count = row.chart_of_accounts_node_count ?? 500;
        body.module_count = row.module_count ?? 1;
      } else if (action === 'load-schemas') {
        body.schema_version = row.schema_version ?? '';
        body.schemas_compliant = row.schemas_compliant ?? 1;
      } else if (action === 'establish-idoc-session') {
        body.service_account_credential_fingerprint = row.service_account_credential_fingerprint ?? '';
        body.credential_expiry_at = row.credential_expiry_at ?? '';
        body.idoc_session_id = row.idoc_session_id ?? '';
        body.iso27001_controls_ok = row.iso27001_controls_ok ?? 1;
        body.soc1_type2_audit_ok = row.soc1_type2_audit_ok ?? 1;
      } else if (action === 'validate-test-postings') {
        body.average_posting_latency_ms = row.average_posting_latency_ms ?? 80;
        body.posting_volume_per_hour = row.posting_volume_per_hour ?? 200;
      } else if (action === 'bind-reconciliation-period') {
        body.period_end_at = row.period_end_at ?? '';
      } else if (action === 'activate-live-posting') {
        body.sars_efiling_status = row.sars_efiling_status ?? 'current';
        body.cipc_annual_filing_status = row.cipc_annual_filing_status ?? 'current';
      } else if (action === 'reconcile-period-close') {
        body.successful_posting_count_24h = row.successful_posting_count_24h ?? 1000;
        body.failed_posting_count_24h = row.failed_posting_count_24h ?? 0;
        body.failure_rate_pct = row.failure_rate_pct ?? 0;
        body.reconciliation_break_count = row.reconciliation_break_count ?? 0;
        body.w118_block_ref = row.w118_block_ref ?? '';
      } else if (action === 'disconnect') {
        body.reason_code = row.reason_code ?? 'erp_endpoint_decommissioned';
      } else if (action === 'suspend') {
        body.reason_code = row.reason_code ?? 'period_close_lockout';
      } else if (action === 'revoke-credential') {
        body.reason_code = row.reason_code ?? 'service_account_compromised';
      }
      await api.post(`/sap-oracle-erp-connector/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load, loadEvents, selected]);

  const propose = useCallback(async (body: Record<string, unknown>) => {
    try {
      await api.post('/sap-oracle-erp-connector', body);
      setShowPropose(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Propose failed');
    }
  }, [load]);

  return (
    <div className="text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[var(--ink, #0c2a4d)]">SAP / Oracle ERP connector</h2>
          <p className="text-[11px] text-[var(--ink-2, #4a5568)]">
            10-state forward + 4 branch enterprise back-office GL/AP/AR posting spine - SAP S/4HANA OData v4 / SAP ECC IDoc FIDCC1/FIDCC2/REMADV/INVOIC / Oracle EBS + Fusion / Workday / SAGE 300 / Dynamics 365 / NetSuite / Epicor / IFS.
            Beats SAP S/4HANA Cloud Integration + Oracle Integration Cloud + Workday Integration Cloud + MuleSoft + Boomi + Informatica + TIBCO + IBM AppConnect + SnapLogic + Celigo integrator.io.
            INVERTED SLA HOURS (single 168 / multi-module 240 / enterprise 360 / group 480 / multi-country 720).
            FLOOR-AT-ENTERPRISE-WIDE {'≥'}1 flag / FLOOR-AT-MULTI-COUNTRY {'≥'}3 flags. Audit-chain bridge mandatory.
            SIGNATURE: revoke_credential crosses EVERY tier (SARS + CIPC + SOC 1 Type II + ISO 27001 + PCAOB AS 5 service-account compromise).
            External ERP counterparty reads via mTLS-gated /api/sap-oracle-erp-connector/peer/:peer_id with x-mtls-cert-fingerprint header.
          </p>
        </div>
        {!regulatorView && (
          <button type="button"
            onClick={() => setShowPropose(true)}
            className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#c2873a]"
          >
            + Propose connector
          </button>
        )}
      </div>

      {/* 8-card KPI strip */}
      <div className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        <Kpi label="Total"             value={kpis.total} />
        <Kpi label="Active"            value={kpis.active_count} />
        <Kpi label="Live"              value={kpis.live_count} tone="ok" />
        <Kpi label="Revoked"           value={kpis.revoked_count} tone={kpis.revoked_count > 0 ? 'bad' : undefined} />
        <Kpi label="Disconnected"      value={kpis.disconnected_count} tone={kpis.disconnected_count > 0 ? 'bad' : undefined} />
        <Kpi label="Failover"          value={kpis.failover_count} tone={kpis.failover_count > 0 ? 'warn' : undefined} />
        <Kpi label="SLA breached"      value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : undefined} />
        <Kpi label="Control avg"       value={`${kpis.control_effectiveness_avg}/130`} />
      </div>

      {/* Drill rail */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded border border-[var(--border-subtle, #d8dde6)] bg-surface-v2 px-3 py-2 text-[11px] text-[var(--ink-2, #4a5568)]">
        <span>Proposed: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.proposed_count}</span></span>
        <span>Endpoint: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.endpoint_v_count}</span></span>
        <span>CC mapped: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.cc_mapped_count}</span></span>
        <span>CoA bound: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.coa_bound_count}</span></span>
        <span>Schemas: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.schemas_count}</span></span>
        <span>IDoc session: <span className="font-semibold text-[#a06200]">{kpis.idoc_count}</span></span>
        <span>Tests OK: <span className="font-semibold text-[#a06200]">{kpis.tests_count}</span></span>
        <span>Recon bound: <span className="font-semibold text-[#a06200]">{kpis.recon_bound_count}</span></span>
        <span>Reconciled: <span className="font-semibold text-[var(--good, #1f6b3a)]">{kpis.reconciled_count}</span></span>
        <span>Archived: <span className="font-semibold text-[var(--good, #1f5b3a)]">{kpis.archived_count}</span></span>
        <span>Suspended: <span className="font-semibold text-[var(--ink-2, #6b7685)]">{kpis.suspended_count}</span></span>
        <span>Reportable: <span className="font-semibold text-[var(--bad, #9b1f1f)]">{kpis.reportable_total}</span></span>
        <span>Floor flags: <span className="font-semibold text-[#a06200]">{kpis.floor_flag_total}</span></span>
        <span>Cred {'<'}60d: <span className="font-semibold text-[#a06200]">{kpis.creds_expiring_within_60d}</span></span>
        <span>Cred {'<'}14d: <span className="font-semibold text-[var(--bad, #9b1f1f)]">{kpis.creds_expiring_within_14d}</span></span>
        <span>Audit chain: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w118_bridged_count}</span></span>
        <span>Settlement connector: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w124_bridged_count}</span></span>
        <span>Counterparty margin: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w68_bridged_count}</span></span>
        <span>Settlement P6: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w3_bridged_count}</span></span>
        <span>Drawdown: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w21_bridged_count}</span></span>
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
                : 'bg-surface-v2 text-[var(--ink-2, #4a5568)] border border-[var(--border-subtle, #d8dde6)] hover:bg-[var(--s2, #f3f5f9)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 2: lifecycle */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_LIFECYCLE.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
                : 'bg-surface-v2 text-[var(--ink-2, #6b7685)] border border-[var(--border-subtle, #d8dde6)] hover:bg-[var(--s2, #f3f5f9)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 3: tier */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_TIER.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[var(--bad, #7a0e0e)] text-white'
                : 'bg-surface-v2 text-[var(--ink-2, #6b7685)] border border-[var(--border-subtle, #d8dde6)] hover:bg-[var(--s2, #f3f5f9)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 4: ERP system */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_ERP.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
                : 'bg-surface-v2 text-[var(--ink-2, #6b7685)] border border-[var(--border-subtle, #d8dde6)] hover:bg-[var(--s2, #f3f5f9)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 5: SARS */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS_SARS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[var(--good, #1f6b3a)] text-white'
                : 'bg-surface-v2 text-[var(--ink-2, #6b7685)] border border-[var(--border-subtle, #d8dde6)] hover:bg-[var(--s2, #f3f5f9)]'
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
        <div className="rounded border border-[var(--border-subtle, #d8dde6)] bg-surface-v2 px-4 py-6 text-center text-sm text-[var(--ink-2, #4a5568)]">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded border border-[var(--border-subtle, #d8dde6)] bg-surface-v2">
          <table className="w-full text-[12px]">
            <thead className="bg-[var(--s2, #f3f5f9)]">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Connector #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Counterparty</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>ERP</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Health</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Scope</th>
                <th className="px-3 py-2 font-semibold text-center" style={{ color: 'oklch(0.46 0.16 55)' }}>Ctrl</th>
                <th className="px-3 py-2 font-semibold text-center" style={{ color: 'oklch(0.46 0.16 55)' }}>Cred</th>
                <th className="px-3 py-2 font-semibold text-center" style={{ color: 'oklch(0.46 0.16 55)' }}>Flags</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.current_tier];
                const health = HEALTH_TONE[r.connector_health_band_live ?? r.connector_health_band ?? 'green'];
                const control = r.control_effectiveness_index_live ?? r.control_effectiveness_index ?? 0;
                const credDays = r.days_to_credential_renewal_live ?? r.days_to_credential_renewal ?? null;
                const flags = r.floor_flag_count_live ?? 0;
                const scope = `${r.module_count ?? 0}m/${r.company_code_count ?? 0}cc/${r.jurisdiction_count ?? 0}j`;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[var(--border-subtle, #e3e7ec)] hover:bg-[var(--s1, #f8fafc)]"
                  >
                    <td className="px-3 py-2 font-mono text-[var(--ink, #0c2a4d)]">
                      <div className="text-[11px] font-semibold">{r.connector_number}</div>
                      <div className="text-[10px] text-[var(--ink-2, #6b7685)]">{r.peer_id}</div>
                      {r.is_reportable_flag ? <span className="ml-1 text-[9px] font-semibold text-[var(--bad, #9b1f1f)]">REG</span> : null}
                      {r.regulator_ref ? <span className="ml-1 text-[9px] font-semibold text-[var(--bad, #9b1f1f)]">FILED</span> : null}
                      {r.floor_at_multi_country_live ? <span className="ml-1 text-[9px] font-semibold text-[var(--bad, #7a0e0e)]">MC</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[11px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      {r.counterparty_name ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-mono" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      {fmtErp(r.erp_system)}
                      <div className="text-[10px] text-[var(--ink-2, #6b7685)]">{fmtProto(r.protocol)}</div>
                    </td>
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
                    <td className="px-3 py-2 text-right tabular-nums text-[11px] font-mono text-[var(--ink, #0c2a4d)]">
                      {scope}
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums ${control >= 100 ? 'text-[var(--good, #1f5b3a)]' : control >= 60 ? 'text-[#a06200]' : 'text-[var(--bad, #9b1f1f)] font-semibold'}`}>
                      {control}/130
                    </td>
                    <td className={`px-3 py-2 text-center text-[10px] uppercase tracking-wider ${credDays != null && credDays < 14 ? 'text-[var(--bad, #9b1f1f)] font-semibold' : credDays != null && credDays < 60 ? 'text-[#a06200]' : 'text-[var(--ink-2, #4a5568)]'}`}>
                      {credDays != null ? `${credDays}d` : '-'}
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums ${flags >= 3 ? 'text-[var(--bad, #7a0e0e)] font-semibold' : flags >= 1 ? 'text-[#a06200]' : 'text-[var(--good, #1f5b3a)]'}`}>
                      {flags}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached_live ? 'text-red-700 font-semibold' : 'text-[var(--ink-2, #4a5568)]'}`}>
                      {r.sla_breached_live ? 'BREACHED' : fmtHoursSla(r.sla_hours_remaining_live)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-[var(--ink-2, #4a5568)]">No connectors match.</td></tr>
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
  const color = tone === 'bad' ? 'var(--bad, #9b1f1f)' : tone === 'warn' ? '#a06200' : tone === 'ok' ? 'var(--good, #1f5b3a)' : 'var(--ink, #0c2a4d)';
  return (
    <div className="rounded border border-[var(--border-subtle, #d8dde6)] bg-surface-v2 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--ink-2, #4a5568)]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct, regulatorView,
}: {
  row: SoecRow;
  events: SoecEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: SoecRow) => void;
  regulatorView: boolean;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status] ?? null;
  const control = row.control_effectiveness_index_live ?? row.control_effectiveness_index ?? 0;
  const credDays = row.days_to_credential_renewal_live ?? row.days_to_credential_renewal ?? null;
  const periodDays = row.days_to_period_close_live ?? row.days_to_period_close ?? null;
  const flags   = row.floor_flag_count_live ?? 0;

  // Active non-terminal set for branch actions.
  const ACTIVE_NON_TERMINAL: SoecStatus[] = [
    'connector_proposed', 'erp_endpoint_validated', 'company_code_mapped',
    'chart_of_accounts_bound', 'schemas_loaded', 'idoc_session_established',
    'test_postings_validated', 'reconciliation_period_bound',
    'live_posting_active', 'period_close_reconciled',
    'suspended', 'failover_active',
  ];
  const SUSPEND_FROM: SoecStatus[] = [
    'erp_endpoint_validated', 'company_code_mapped', 'chart_of_accounts_bound',
    'schemas_loaded', 'idoc_session_established', 'test_postings_validated',
    'reconciliation_period_bound', 'live_posting_active', 'period_close_reconciled',
  ];
  const FAILOVER_FROM: SoecStatus[] = ['live_posting_active', 'period_close_reconciled'];
  const RECONCILE_FROM: SoecStatus[] = ['live_posting_active', 'period_close_reconciled'];
  const DISCONNECT_FROM = ACTIVE_NON_TERMINAL;
  const REVOKE_FROM = ACTIVE_NON_TERMINAL;

  const canSuspend    = SUSPEND_FROM.includes(row.chain_status);
  const canFailover   = FAILOVER_FROM.includes(row.chain_status);
  const canReconcile  = RECONCILE_FROM.includes(row.chain_status);
  const canDisconnect = DISCONNECT_FROM.includes(row.chain_status);
  const canRevoke     = REVOKE_FROM.includes(row.chain_status);

  const renderAct = (action: ActionKind, label: string, tone: 'primary' | 'danger' | 'amber' | 'plain' = 'plain') => {
    const cls = tone === 'primary'
      ? 'bg-[#c2873a] text-white hover:bg-[#c2873a]'
      : tone === 'danger'
        ? 'bg-[var(--bad, #7a0e0e)] text-white hover:bg-[var(--bad, #9b1f1f)]'
        : tone === 'amber'
          ? 'bg-[#a06200] text-white hover:bg-[#c97a00]'
          : 'bg-surface-v2 border border-[var(--border-subtle, #d8dde6)] hover:bg-[var(--s2, #f3f5f9)]';
    return (
      <button type="button"
        key={action}
        onClick={() => onAct(action, row)}
        className={`rounded px-3 py-1.5 text-[11px] font-semibold ${cls}`}
        style={tone === 'plain' ? { color: 'oklch(0.46 0.16 55)' } : undefined}
        title={ACTION_LABEL[action]}
      >
        {label}
      </button>
    );
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40">
      <div className="w-full max-w-3xl overflow-y-auto bg-[var(--s2, #f3f5f9)] p-4">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">
              {fmtErp(row.erp_system)} {'•'} {fmtProto(row.protocol)} {'•'} {row.current_tier.replace(/_/g, ' ')}
              {row.module_count != null ? <> {'•'} {row.module_count}m/{row.company_code_count ?? 0}cc/{row.jurisdiction_count ?? 0}j</> : null}
            </div>
            <h3 className="text-lg font-semibold text-[var(--ink, #0c2a4d)]">{row.connector_number}</h3>
            <p className="text-[11px] text-[var(--ink-2, #4a5568)]">
              {row.title || 'SAP/Oracle ERP connector'} {'•'} peer <span className="font-mono">{row.peer_id}</span>
              {row.counterparty_name ? <> {'•'} {row.counterparty_name}</> : null}
              {row.endpoint_url ? <> {'•'} <span className="font-mono text-[10px]">{row.endpoint_url}</span></> : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-surface-v2 border border-[var(--border-subtle, #d8dde6)] px-3 py-1 text-[12px] hover:bg-[var(--s2, #f3f5f9)]" style={{ color: 'oklch(0.46 0.16 55)' }}>Close</button>
        </div>

        {/* 4 scoring indexes */}
        <div className="mb-3 grid grid-cols-4 gap-2">
          <Kpi label="Control eff." value={`${control}/130`} tone={control >= 100 ? 'ok' : control >= 60 ? 'warn' : 'bad'} />
          <Kpi label="Cred days" value={credDays != null ? `${credDays}d` : '-'} tone={credDays != null && credDays < 14 ? 'bad' : credDays != null && credDays < 60 ? 'warn' : 'ok'} />
          <Kpi label="Period close" value={periodDays != null ? `${periodDays}d` : '-'} tone={periodDays != null && periodDays < 3 ? 'bad' : periodDays != null && periodDays < 7 ? 'warn' : 'ok'} />
          <Kpi label="SLA window" value={`${row.sla_target_hours}h`} />
        </div>

        {/* Posting battery */}
        <div className="mb-3 grid grid-cols-4 gap-2 rounded border border-[var(--border-subtle, #d8dde6)] bg-surface-v2 p-3 text-[11px]">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">Postings/hr</div>
            <div className="font-mono text-[12px] text-[var(--ink, #0c2a4d)]">{row.posting_volume_per_hour ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">Successful 24h</div>
            <div className="font-mono text-[12px] text-[var(--ink, #0c2a4d)]">{row.successful_posting_count_24h ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">Failed 24h</div>
            <div className="font-mono text-[12px] text-[var(--ink, #0c2a4d)]">{row.failed_posting_count_24h ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">Failure %</div>
            <div className={`font-mono text-[12px] ${(row.failure_rate_pct ?? 0) > 2 ? 'text-[var(--bad, #9b1f1f)] font-semibold' : (row.failure_rate_pct ?? 0) > 1 ? 'text-[#a06200]' : 'text-[var(--good, #1f5b3a)]'}`}>{row.failure_rate_pct ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">Latency</div>
            <div className={`font-mono text-[12px] ${(row.average_posting_latency_ms ?? 0) > 300 ? 'text-[var(--bad, #9b1f1f)] font-semibold' : (row.average_posting_latency_ms ?? 0) > 150 ? 'text-[#a06200]' : 'text-[var(--ink, #0c2a4d)]'}`}>{row.average_posting_latency_ms ?? '-'} ms</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">Recon breaks</div>
            <div className={`font-mono text-[12px] ${(row.reconciliation_break_count ?? 0) > 0 ? 'text-[#a06200]' : 'text-[var(--ink, #0c2a4d)]'}`}>{row.reconciliation_break_count ?? 0}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">IFRS 15 contrib</div>
            <div className="font-mono text-[12px] text-[var(--ink, #0c2a4d)]">{row.ifrs_15_revenue_contribution_pct ?? '-'} %</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">IFRS 9 contrib</div>
            <div className="font-mono text-[12px] text-[var(--ink, #0c2a4d)]">{row.ifrs_9_financial_instrument_contribution_pct ?? '-'} %</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">SARS e-filing</div>
            <div className={`font-mono text-[12px] ${row.sars_efiling_status === 'current' ? 'text-[var(--good, #1f5b3a)]' : row.sars_efiling_status === 'pending' ? 'text-[#a06200]' : row.sars_efiling_status === 'overdue' ? 'text-[var(--bad, #9b1f1f)] font-semibold' : 'text-[var(--ink-2, #4a5568)]'}`}>{row.sars_efiling_status ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">CIPC AFS</div>
            <div className={`font-mono text-[12px] ${row.cipc_annual_filing_status === 'current' ? 'text-[var(--good, #1f5b3a)]' : row.cipc_annual_filing_status === 'pending' ? 'text-[#a06200]' : row.cipc_annual_filing_status === 'overdue' ? 'text-[var(--bad, #9b1f1f)] font-semibold' : 'text-[var(--ink-2, #4a5568)]'}`}>{row.cipc_annual_filing_status ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">Schemas</div>
            <div className={`font-mono text-[12px] ${row.schemas_compliant ? 'text-[var(--good, #1f5b3a)]' : 'text-[#a06200]'}`}>{row.schemas_compliant ? 'COMPLIANT' : 'NO'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">ISO 27001</div>
            <div className={`font-mono text-[12px] ${row.iso27001_controls_ok ? 'text-[var(--good, #1f5b3a)]' : 'text-[#a06200]'}`}>{row.iso27001_controls_ok ? 'OK' : 'NO'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">SOC 1 Type II</div>
            <div className={`font-mono text-[12px] ${row.soc1_type2_audit_ok ? 'text-[var(--good, #1f5b3a)]' : 'text-[#a06200]'}`}>{row.soc1_type2_audit_ok ? 'OK' : 'NO'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">Cred expiry</div>
            <div className="font-mono text-[12px] text-[var(--ink, #0c2a4d)]">{fmtDate(row.credential_expiry_at)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">Period end</div>
            <div className="font-mono text-[12px] text-[var(--ink, #0c2a4d)]">{fmtDate(row.period_end_at)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">Schema ver</div>
            <div className="font-mono text-[12px] text-[var(--ink, #0c2a4d)]">{row.schema_version ?? '-'}</div>
          </div>
        </div>

        {/* Floor flags */}
        <div className="mb-3 rounded border border-[var(--border-subtle, #d8dde6)] bg-surface-v2 p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[var(--ink-2, #4a5568)]">
            Floor flags ({flags}/5) - FLOOR-AT-ENTERPRISE-WIDE {'≥'}1, FLOOR-AT-MULTI-COUNTRY {'≥'}3
          </div>
          <div className="grid grid-cols-5 gap-2">
            <FlagPill on={!!row.sox_404_in_scope} label="SOX 404" />
            <FlagPill on={!!row.ifrs_consolidation_required} label="IFRS consol." />
            <FlagPill on={!!row.cross_border_transfer_pricing} label="Transfer pricing" />
            <FlagPill on={!!row.sars_efiling_critical_path} label="SARS critical" />
            <FlagPill on={!!row.cipc_annual_filing_gate} label="CIPC gate" />
          </div>
        </div>

        {/* Bridges */}
        <div className="mb-3 rounded border border-[var(--border-subtle, #d8dde6)] bg-surface-v2 p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[var(--ink-2, #4a5568)]">Cross-chain bridges (audit chain mandatory)</div>
          <div className="grid grid-cols-5 gap-2">
            <BridgePill on={!!row.bridges_to_w118_audit_chain_live} label="Audit chain" />
            <BridgePill on={!!row.bridges_to_w124_settlement_connector_live} label="Settlement connector" />
            <BridgePill on={!!row.bridges_to_w68_counterparty_margin_live} label="Counterparty margin" />
            <BridgePill on={!!row.bridges_to_w3_settlement_p6_live} label="Settlement P6" />
            <BridgePill on={!!row.bridges_to_w21_drawdown_live} label="Drawdown" />
          </div>
        </div>

        {/* Regulator + reason */}
        {(row.is_reportable_flag || row.regulator_ref || row.regulator_inbox_ref || row.reason_code) && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-[11px] text-[#7a1f1f]">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--bad, #9b1f1f)]">Regulator crossing</div>
            {row.reason_code && <div>Reason: <span className="font-mono">{row.reason_code}</span></div>}
            {row.regulator_reason_text && <div>Detail: {row.regulator_reason_text}</div>}
            {row.regulator_ref && <div>Filed ref: <span className="font-mono">{row.regulator_ref}</span></div>}
            {row.regulator_inbox_ref && <div>Inbox: <span className="font-mono">{row.regulator_inbox_ref}</span></div>}
            {row.regulator_crossed_at && <div>Crossed at: {fmtDate(row.regulator_crossed_at)}</div>}
          </div>
        )}

        {/* Action bar */}
        {!regulatorView && !row.is_hard_terminal && (
          <div className="mb-4 flex flex-wrap gap-2 rounded border border-[var(--border-subtle, #d8dde6)] bg-surface-v2 p-3">
            {nextAction && renderAct(nextAction, ACTION_LABEL[nextAction].split('(')[0].trim(), 'primary')}
            {canReconcile && row.chain_status !== 'period_close_reconciled' && renderAct('reconcile-period-close', 'Reconcile close', 'primary')}
            {row.chain_status === 'period_close_reconciled' && renderAct('reconcile-period-close', 'Reconcile close', 'plain')}
            {canSuspend && row.chain_status !== 'suspended' && renderAct('suspend', 'Suspend', 'amber')}
            {row.chain_status === 'suspended' && renderAct('resume', 'Resume', 'primary')}
            {canFailover && renderAct('activate-failover', 'Failover', 'amber')}
            {canDisconnect && renderAct('disconnect', 'Disconnect (HARD)', 'danger')}
            {canRevoke && renderAct('revoke-credential', 'REVOKE CREDENTIAL (SIGNATURE)', 'danger')}
          </div>
        )}

        {/* Timeline */}
        <div className="rounded border border-[var(--border-subtle, #d8dde6)] bg-surface-v2">
          <div className="border-b border-[var(--border-subtle, #e3e7ec)] px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--ink-2, #4a5568)]">Timeline</div>
          <ol className="divide-y divide-[var(--border-subtle, #e3e7ec)]">
            {events.length === 0 && (
              <li className="px-3 py-3 text-[11px] text-[var(--ink-2, #6b7685)]">No events.</li>
            )}
            {events.map((e) => (
              <li key={e.id} className="px-3 py-2 text-[11px]">
                <div className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{e.event_type}</div>
                <div className="text-[10px] text-[var(--ink-2, #4a5568)]">
                  {e.from_status || '-'} {'→'} {e.to_status || '-'}
                  {e.actor_party ? <> {'•'} {e.actor_party}</> : null}
                  {' '}{'•'} {fmtDate(e.created_at)}
                </div>
                {e.notes && <div className="mt-1" style={{ color: 'oklch(0.46 0.16 55)' }}>{e.notes}</div>}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function FlagPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-center text-[10px] font-medium ${on ? 'bg-[var(--bad, #7a0e0e)] text-white' : 'bg-[var(--border-subtle, #e3e7ec)] text-[var(--ink-2, #6b7685)]'}`}
      title={label}
    >
      {label}
    </span>
  );
}

function BridgePill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-center text-[10px] font-medium ${on ? 'bg-[#c2873a] text-white' : 'bg-[var(--border-subtle, #e3e7ec)] text-[var(--ink-2, #6b7685)]'}`}
      title={label}
    >
      {label}
    </span>
  );
}

const ERP_OPTIONS: Array<{ key: SoecErpSystem; label: string }> = [
  { key: 'sap_s4hana',    label: 'SAP S/4HANA' },
  { key: 'sap_ecc',       label: 'SAP ECC' },
  { key: 'oracle_ebs',    label: 'Oracle EBS' },
  { key: 'oracle_fusion', label: 'Oracle Fusion' },
  { key: 'workday',       label: 'Workday' },
  { key: 'sage_300',      label: 'SAGE 300' },
  { key: 'dynamics_365',  label: 'Dynamics 365' },
  { key: 'netsuite',      label: 'NetSuite' },
  { key: 'epicor',        label: 'Epicor' },
  { key: 'ifs',           label: 'IFS' },
];

const PROTOCOL_OPTIONS: Array<{ key: SoecProtocol; label: string }> = [
  { key: 'odata_v4',    label: 'OData v4 (SAP S/4HANA)' },
  { key: 'idoc',        label: 'IDoc (SAP ECC)' },
  { key: 'soap',        label: 'SOAP (Oracle Fusion / Workday)' },
  { key: 'rest',        label: 'REST (Oracle Fusion / NetSuite)' },
  { key: 'suitetalk',   label: 'SuiteTalk (NetSuite)' },
  { key: 'dataverse',   label: 'Dataverse (Dynamics 365)' },
  { key: 'proprietary', label: 'Proprietary' },
];

function ProposeModal({
  onClose, onSubmit,
}: {
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [peerId, setPeerId] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [erpSystem, setErpSystem] = useState<SoecErpSystem>('sap_s4hana');
  const [protocol, setProtocol] = useState<SoecProtocol>('odata_v4');
  const [modules, setModules] = useState('');
  const [companyCodes, setCompanyCodes] = useState('');
  const [jurisdictions, setJurisdictions] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [title, setTitle] = useState('');
  const [w118, setW118] = useState('');
  const [w124, setW124] = useState('');
  const [w68, setW68]   = useState('');
  const [w3, setW3]     = useState('');
  const [w21, setW21]   = useState('');
  const [sox404, setSox404] = useState(false);
  const [ifrsConsol, setIfrsConsol] = useState(false);
  const [transferPricing, setTransferPricing] = useState(false);
  const [sarsCritical, setSarsCritical] = useState(false);
  const [cipcGate, setCipcGate] = useState(false);
  const [regulatorRelevant, setRegulatorRelevant] = useState(false);

  const submit = () => {
    const body: Record<string, unknown> = {
      erp_system: erpSystem,
      protocol,
      peer_id: peerId || undefined,
      counterparty_name: counterparty || undefined,
      module_count: modules ? Number(modules) : undefined,
      company_code_count: companyCodes ? Number(companyCodes) : undefined,
      jurisdiction_count: jurisdictions ? Number(jurisdictions) : undefined,
      endpoint_url: endpointUrl || undefined,
      title: title || undefined,
      w118_block_ref: w118 || undefined,
      w124_settlement_connector_ref: w124 || undefined,
      w68_counterparty_margin_ref: w68 || undefined,
      w3_settlement_p6_ref: w3 || undefined,
      w21_drawdown_ref: w21 || undefined,
      sox_404_in_scope: sox404 ? 1 : 0,
      ifrs_consolidation_required: ifrsConsol ? 1 : 0,
      cross_border_transfer_pricing: transferPricing ? 1 : 0,
      sars_efiling_critical_path: sarsCritical ? 1 : 0,
      cipc_annual_filing_gate: cipcGate ? 1 : 0,
      regulator_relevant: regulatorRelevant ? 1 : 0,
    };
    onSubmit(body);
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded bg-surface-v2 p-4 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--ink, #0c2a4d)]">Propose SAP / Oracle ERP connector</h3>
            <p className="text-[11px] text-[var(--ink-2, #4a5568)]">
              Audit-chain bridge mandatory. Tier auto-derived from (module_count, company_code_count, jurisdiction_count) with FLOOR-AT-ENTERPRISE-WIDE {'≥'}1 flag and FLOOR-AT-MULTI-COUNTRY {'≥'}3 flags.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-surface-v2 border border-[var(--border-subtle, #d8dde6)] px-3 py-1 text-[12px] hover:bg-[var(--s2, #f3f5f9)]" style={{ color: 'oklch(0.46 0.16 55)' }}>Close</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Peer id (ERP counterparty)">
            <input value={peerId} onChange={(e) => setPeerId(e.target.value)} className="w-full rounded border border-[var(--border-subtle, #d8dde6)] px-2 py-1 text-[12px]" placeholder="customer-acme-sap-s4hana" />
          </Field>
          <Field label="Counterparty name (legal entity)">
            <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} className="w-full rounded border border-[var(--border-subtle, #d8dde6)] px-2 py-1 text-[12px]" placeholder="Acme Holdings (Pty) Ltd" />
          </Field>
          <Field label="ERP system">
            <select value={erpSystem} onChange={(e) => setErpSystem(e.target.value as SoecErpSystem)} className="w-full rounded border border-[var(--border-subtle, #d8dde6)] px-2 py-1 text-[12px]">
              {ERP_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Protocol">
            <select value={protocol} onChange={(e) => setProtocol(e.target.value as SoecProtocol)} className="w-full rounded border border-[var(--border-subtle, #d8dde6)] px-2 py-1 text-[12px]">
              {PROTOCOL_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Module count">
            <input value={modules} onChange={(e) => setModules(e.target.value)} type="number" className="w-full rounded border border-[var(--border-subtle, #d8dde6)] px-2 py-1 text-[12px]" placeholder="3" />
          </Field>
          <Field label="Company code count">
            <input value={companyCodes} onChange={(e) => setCompanyCodes(e.target.value)} type="number" className="w-full rounded border border-[var(--border-subtle, #d8dde6)] px-2 py-1 text-[12px]" placeholder="1" />
          </Field>
          <Field label="Jurisdiction count">
            <input value={jurisdictions} onChange={(e) => setJurisdictions(e.target.value)} type="number" className="w-full rounded border border-[var(--border-subtle, #d8dde6)] px-2 py-1 text-[12px]" placeholder="1" />
          </Field>
          <Field label="Endpoint URL">
            <input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} className="w-full rounded border border-[var(--border-subtle, #d8dde6)] px-2 py-1 text-[12px]" placeholder="https://erp.example.za/odata/v4" />
          </Field>
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border border-[var(--border-subtle, #d8dde6)] px-2 py-1 text-[12px]" placeholder="Acme SAP S/4HANA GL/AP/AR posting rail" />
          </Field>
          <Field label="Audit block ref (mandatory)">
            <input value={w118} onChange={(e) => setW118(e.target.value)} className="w-full rounded border border-[var(--border-subtle, #d8dde6)] px-2 py-1 text-[12px]" placeholder="audit-block-2026-1234" />
          </Field>
          <Field label="Settlement connector ref">
            <input value={w124} onChange={(e) => setW124(e.target.value)} className="w-full rounded border border-[var(--border-subtle, #d8dde6)] px-2 py-1 text-[12px]" placeholder="soec-w124-001" />
          </Field>
          <Field label="Counterparty margin ref">
            <input value={w68} onChange={(e) => setW68(e.target.value)} className="w-full rounded border border-[var(--border-subtle, #d8dde6)] px-2 py-1 text-[12px]" placeholder="ccm-2026-0021" />
          </Field>
          <Field label="Settlement P6 ref">
            <input value={w3} onChange={(e) => setW3(e.target.value)} className="w-full rounded border border-[var(--border-subtle, #d8dde6)] px-2 py-1 text-[12px]" placeholder="stl-2026-0011" />
          </Field>
          <Field label="Drawdown ref">
            <input value={w21} onChange={(e) => setW21(e.target.value)} className="w-full rounded border border-[var(--border-subtle, #d8dde6)] px-2 py-1 text-[12px]" placeholder="dd-2026-0005" />
          </Field>
        </div>

        <div className="mt-3 rounded border border-[var(--border-subtle, #d8dde6)] bg-[var(--s1, #f8fafc)] p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[var(--ink-2, #4a5568)]">Floor flags (FLOOR-AT-ENTERPRISE-WIDE {'≥'}1, FLOOR-AT-MULTI-COUNTRY {'≥'}3)</div>
          <div className="grid grid-cols-3 gap-2">
            <Checkbox checked={sox404} onChange={setSox404} label="SOX 404 in scope" />
            <Checkbox checked={ifrsConsol} onChange={setIfrsConsol} label="IFRS consolidation" />
            <Checkbox checked={transferPricing} onChange={setTransferPricing} label="Transfer pricing" />
            <Checkbox checked={sarsCritical} onChange={setSarsCritical} label="SARS critical path" />
            <Checkbox checked={cipcGate} onChange={setCipcGate} label="CIPC annual gate" />
            <Checkbox checked={regulatorRelevant} onChange={setRegulatorRelevant} label="Regulator relevant" />
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded bg-surface-v2 border border-[var(--border-subtle, #d8dde6)] px-3 py-1.5 text-[12px] hover:bg-[var(--s2, #f3f5f9)]" style={{ color: 'oklch(0.46 0.16 55)' }}>Cancel</button>
          <button type="button" onClick={submit} className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#c2873a]">Propose connector</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] text-[var(--ink-2, #4a5568)]">
      <div className="mb-1 text-[10px] uppercase tracking-wider">{label}</div>
      {children}
    </label>
  );
}

function Checkbox({
  checked, onChange, label,
}: {
  checked: boolean; onChange: (v: boolean) => void; label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-[oklch(0.46_0.16_55)]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export default SapOracleErpConnectorTab;
