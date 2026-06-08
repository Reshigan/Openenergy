// Wave 126 - CIPC / SARS / NERSA Government Filing APIs Connector.
//
// Phase C wave 5 of 5 - FINAL Phase-C connector wave. Closes Phase C.
// SA GOVERNMENT REGULATOR filing spine - real bidirectional integration
// to CIPC Annual Returns, SARS e-Filing (IT14 / VAT201 / EMP201 / IRP5),
// NERSA quarterly electricity & gas returns, DMRE quarterly REIPPPP,
// DFFE GHG annual disclosure, PAIA Section 18 response queue, SARB FX
// approval portal, FIC suspicious-transaction reporting, FSCA conduct
// reporting, National Treasury MFMA returns, municipal returns.
//
// Mounted at /admin/workstation?tab=government-filing-connectors,
// /regulator/workstation?tab=government-filing-connectors,
// /trader/workstation?tab=government-filing-connectors,
// /lender/workstation?tab=government-filing-connectors,
// /offtaker/workstation?tab=government-filing-connectors - five
// workstations (key diff from W125's four-writer pattern).
//
// Beats: SAP Document & Reporting Compliance (DRC) + Oracle Fusion Tax
// Reporting Cloud + Workday Compliance + ONESOURCE Compliance + Thomson
// Reuters Compliance + Avalara Compliance + Sovos Compliance + Vertex
// Cloud Compliance + EY Tax Compliance Cloud + Deloitte Tax Compliance.
//
// 10-state forward + 4 branch lifecycle:
//   connector_proposed -> filing_authority_validated ->
//     tax_registration_bound -> filing_template_mapped -> schemas_loaded
//     -> e_filing_session_established -> test_submission_validated ->
//     reconciliation_period_bound -> live_filing_active ->
//     filing_acknowledged -> archived (HARD)
//   any non-terminal -> disconnect -> disconnected (HARD)
//   any non-terminal -> revoke_credential -> credential_revoked (HARD)
//   active states -> suspend -> suspended (SOFT)
//   live -> activate_failover -> failover_active (SOFT)
//
// 5-tier INVERTED SLA polarity (HOURS) - bigger filing scope = MORE time:
// single_filing 168h / quarterly_returns 240h / annual_returns 360h /
// multi_jurisdiction 480h / systemic_critical 720h.
// FLOOR-AT-MULTI-JURISDICTION on {'>='}1 of 5 flags; FLOOR-AT-SYSTEMIC-
// CRITICAL {'>='}3.
// Flags: companies_act_lateness_penalty_active /
// sars_admin_penalty_active / nersa_levy_arrears /
// dffe_ghg_threshold_exceeded / paia_subject_access_request_open.
//
// SIGNATURE Phase-C regulator crossings:
//   * revoke_credential crosses EVERY tier (W126 SIGNATURE GOVERNMENT-
//     FILING-CONNECTOR-REVOKE - Companies Act + Tax Admin Act + ERA
//     s.10 + PAIA s.18)
//   * activate_failover crosses multi_jurisdiction + systemic_critical
//   * disconnect crosses EVERY tier WHEN companies_act_lateness OR
//     sars_admin_penalty
//   * acknowledge_filing crosses systemic_critical only
//   * sla_breached multi_jurisdiction + systemic_critical only
//
// Write {admin, regulator, trader, lender, offtaker} - 5 writers (key
// diff from W125). READ all 9 personas. EXTERNAL gov_authority_peer
// via mTLS-gated PUBLIC peer endpoint (x-mtls-cert-fingerprint header).
//
// 5 bridges (W118 MANDATORY): W125 SAP/Oracle ERP connector + W124
// STRATE/SWIFT settlement + W74 NERSA levy + W48 carbon tax offset
// claim + W118 audit block ref.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type GfcStatus =
  | 'connector_proposed' | 'filing_authority_validated' | 'tax_registration_bound'
  | 'filing_template_mapped' | 'schemas_loaded' | 'e_filing_session_established'
  | 'test_submission_validated' | 'reconciliation_period_bound'
  | 'live_filing_active' | 'filing_acknowledged' | 'archived'
  | 'disconnected' | 'credential_revoked' | 'suspended' | 'failover_active';

type GfcTier = 'single_filing' | 'quarterly_returns' | 'annual_returns' | 'multi_jurisdiction' | 'systemic_critical';
type GfcUrgency = 'low' | 'medium' | 'high' | 'critical' | 'systemic';
type GfcAuthority = 'compliance_engineer' | 'company_secretary' | 'financial_director' | 'CEO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type GfcAuthorityKey =
  | 'cipc' | 'sars' | 'nersa' | 'dmre' | 'dffe' | 'sarb' | 'fic' | 'fsca'
  | 'treasury' | 'municipal';
type GfcFilingType =
  | 'annual_return' | 'vat201' | 'emp201' | 'it14'
  | 'nersa_quarterly_electricity' | 'nersa_quarterly_gas'
  | 'dmre_quarterly_reippppp' | 'dffe_ghg' | 'carbon_tax' | 'paia_response';
type CipcStatus = 'current' | 'pending' | 'overdue';
type SarsStatus = 'active' | 'pending' | 'revoked';

interface GfcRow {
  id: string;
  connector_number: string;
  peer_id: string;
  counterparty_name: string | null;
  filing_authority: GfcAuthorityKey | string;
  filing_type: GfcFilingType | string;
  schema_version: string | null;
  efiling_credential_fingerprint: string | null;
  credential_expiry_at: string | null;
  endpoint_url: string | null;
  tax_registration_number: string | null;
  filing_period: string | null;
  filing_count: number | null;
  jurisdiction_count: number | null;
  national_statutory: number;
  next_filing_deadline_at: string | null;
  w125_erp_connector_ref: string | null;
  w124_settlement_connector_ref: string | null;
  w74_nersa_levy_ref: string | null;
  w48_carbon_tax_ref: string | null;
  w118_block_ref: string | null;
  companies_act_lateness_penalty_active: number;
  sars_admin_penalty_active: number;
  nersa_levy_arrears: number;
  dffe_ghg_threshold_exceeded: number;
  paia_subject_access_request_open: number;
  filings_per_quarter: number | null;
  successful_filing_count_quarter: number | null;
  failed_filing_count_quarter: number | null;
  failure_rate_pct: number | null;
  average_filing_latency_ms: number | null;
  reconciliation_break_count: number | null;
  cipc_compliance_score: number | null;
  sars_compliance_score: number | null;
  nersa_compliance_score: number | null;
  companies_act_filing_status: CipcStatus | null;
  sars_tax_clearance_status: SarsStatus | null;
  nersa_levy_status: 'current' | 'arrears' | null;
  dffe_ghg_threshold_status: 'under' | 'over' | null;
  schemas_compliant: number;
  iso27001_controls_ok: number;
  soc1_type2_audit_ok: number;
  control_effectiveness_index: number | null;
  current_tier: GfcTier;
  authority_required: GfcAuthority | null;
  urgency_band: GfcUrgency | null;
  connector_health_band: HealthBand | null;
  title: string | null;
  reason_code: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  regulator_ref: string | null;
  regulator_inbox_ref: string | null;
  chain_status: GfcStatus;
  connector_proposed_at: string | null;
  filing_authority_validated_at: string | null;
  tax_registration_bound_at: string | null;
  filing_template_mapped_at: string | null;
  schemas_loaded_at: string | null;
  e_filing_session_established_at: string | null;
  test_submission_validated_at: string | null;
  reconciliation_period_bound_at: string | null;
  live_filing_active_at: string | null;
  filing_acknowledged_at: string | null;
  archived_at: string | null;
  disconnected_at: string | null;
  suspended_at: string | null;
  credential_revoked_at: string | null;
  failover_activated_at: string | null;
  regulator_crossed_at: string | null;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  last_sla_breach_at: string | null;
  escalation_level: number;
  days_to_credential_renewal: number | null;
  days_to_next_filing_deadline: number | null;
  tenant_id: string | null;
  created_by: string | null;
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
  urgency_band_live?: GfcUrgency;
  authority_required_live?: GfcAuthority;
  days_to_credential_renewal_live?: number;
  days_to_next_filing_deadline_live?: number;
  floor_flag_count_live?: number;
  floor_at_multi_jurisdiction_live?: boolean;
  floor_at_systemic_critical_live?: boolean;
  control_effectiveness_index_live?: number;
  connector_health_band_live?: HealthBand;
  bridges_to_w125_erp_connector_live?: boolean;
  bridges_to_w124_settlement_connector_live?: boolean;
  bridges_to_w74_nersa_levy_live?: boolean;
  bridges_to_w48_carbon_tax_live?: boolean;
  bridges_to_w118_audit_chain_live?: boolean;
}

interface GfcEvent {
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

const STATE_TONE: Record<GfcStatus, { bg: string; fg: string; label: string }> = {
  connector_proposed:           { bg: '#e3e7ec', fg: '#445',    label: 'Proposed' },
  filing_authority_validated:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Authority OK' },
  tax_registration_bound:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Tax reg' },
  filing_template_mapped:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Template' },
  schemas_loaded:               { bg: '#dbecfb', fg: '#1a3a5c', label: 'Schemas' },
  e_filing_session_established: { bg: '#fff4d6', fg: '#a06200', label: 'e-Filing session' },
  test_submission_validated:    { bg: '#fff4d6', fg: '#a06200', label: 'Test OK' },
  reconciliation_period_bound:  { bg: '#fff4d6', fg: '#a06200', label: 'Recon bound' },
  live_filing_active:           { bg: '#daf5e2', fg: '#1f6b3a', label: 'Live filing' },
  filing_acknowledged:          { bg: '#daf5e2', fg: '#1f6b3a', label: 'Ack' },
  archived:                     { bg: '#1f5b3a', fg: '#fff',    label: 'Archived' },
  disconnected:                 { bg: '#7a0e0e', fg: '#fff',    label: 'Disconnected' },
  credential_revoked:           { bg: '#7a0e0e', fg: '#fff',    label: 'Cred revoked' },
  suspended:                    { bg: '#e3e7ec', fg: '#445',    label: 'Suspended' },
  failover_active:              { bg: '#fff4d6', fg: '#a06200', label: 'Failover' },
};

const TIER_TONE: Record<GfcTier, { bg: string; fg: string; label: string }> = {
  single_filing:       { bg: '#e3e7ec', fg: '#557',    label: 'Single filing' },
  quarterly_returns:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Quarterly' },
  annual_returns:      { bg: '#daf5e2', fg: '#1f6b3a', label: 'Annual' },
  multi_jurisdiction:  { bg: '#fff4d6', fg: '#a06200', label: 'Multi-juris.' },
  systemic_critical:   { bg: '#7a0e0e', fg: '#fff',    label: 'Systemic' },
};

const HEALTH_TONE: Record<HealthBand, { bg: string; fg: string; label: string }> = {
  green:    { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Green' },
  amber:    { bg: '#fff4d6', fg: '#a06200', label: 'Amber' },
  red:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Red' },
  critical: { bg: '#7a0e0e', fg: '#fff',    label: 'Critical' },
};

const FILTERS_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',                 label: 'Active' },
  { key: 'all',                    label: 'All' },
  { key: 'reportable',             label: 'Reportable' },
  { key: 'breached',               label: 'SLA breached' },
  { key: 'cred_60d',               label: 'Cred exp. 60d' },
  { key: 'cred_14d',               label: 'Cred exp. 14d' },
  { key: 'deadline_30d',           label: 'Deadline 30d' },
  { key: 'deadline_7d',            label: 'Deadline 7d' },
  { key: 'health_red',             label: 'Health red' },
  { key: 'health_critical',        label: 'Health critical' },
  { key: 'systemic_floor',         label: 'Systemic floor' },
  { key: 'multi_juris_floor',      label: 'Multi-juris. floor' },
  { key: 'disconnected',           label: 'Disconnected' },
  { key: 'credential_revoked',     label: 'Revoked' },
];

const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'connector_proposed',           label: 'Proposed' },
  { key: 'filing_authority_validated',   label: 'Authority' },
  { key: 'tax_registration_bound',       label: 'Tax reg' },
  { key: 'filing_template_mapped',       label: 'Template' },
  { key: 'schemas_loaded',               label: 'Schemas' },
  { key: 'e_filing_session_established', label: 'e-Filing session' },
  { key: 'test_submission_validated',    label: 'Test' },
  { key: 'reconciliation_period_bound',  label: 'Recon' },
  { key: 'live_filing_active',           label: 'Live' },
  { key: 'filing_acknowledged',          label: 'Ack' },
  { key: 'archived',                     label: 'Archived' },
  { key: 'disconnected',                 label: 'Disconnected' },
  { key: 'credential_revoked',           label: 'Revoked' },
  { key: 'suspended',                    label: 'Suspended' },
  { key: 'failover_active',              label: 'Failover' },
];

const FILTERS_TIER: Array<{ key: string; label: string }> = [
  { key: 'tier:single_filing',      label: 'Single filing (168h)' },
  { key: 'tier:quarterly_returns',  label: 'Quarterly (240h)' },
  { key: 'tier:annual_returns',     label: 'Annual (360h)' },
  { key: 'tier:multi_jurisdiction', label: 'Multi-juris. (480h)' },
  { key: 'tier:systemic_critical',  label: 'Systemic (720h)' },
];

const FILTERS_AUTHORITY: Array<{ key: string; label: string }> = [
  { key: 'authority:cipc',      label: 'CIPC' },
  { key: 'authority:sars',      label: 'SARS' },
  { key: 'authority:nersa',     label: 'NERSA' },
  { key: 'authority:dmre',      label: 'DMRE' },
  { key: 'authority:dffe',      label: 'DFFE' },
  { key: 'authority:sarb',      label: 'SARB' },
  { key: 'authority:fic',       label: 'FIC' },
  { key: 'authority:fsca',      label: 'FSCA' },
  { key: 'authority:treasury',  label: 'Treasury' },
  { key: 'authority:municipal', label: 'Municipal' },
];

const FILTERS_CIPC: Array<{ key: string; label: string }> = [
  { key: 'cipc:current', label: 'CIPC current' },
  { key: 'cipc:pending', label: 'CIPC pending' },
  { key: 'cipc:overdue', label: 'CIPC overdue' },
];

type ActionKind =
  | 'validate-filing-authority' | 'bind-tax-registration' | 'map-filing-template'
  | 'load-schemas' | 'establish-e-filing-session' | 'validate-test-submission'
  | 'bind-reconciliation-period' | 'activate-live-filing'
  | 'acknowledge-filing' | 'archive' | 'disconnect'
  | 'suspend' | 'resume' | 'revoke-credential' | 'activate-failover';

const ACTION_FOR_STATE: Partial<Record<GfcStatus, ActionKind>> = {
  connector_proposed:           'validate-filing-authority',
  filing_authority_validated:   'bind-tax-registration',
  tax_registration_bound:       'map-filing-template',
  filing_template_mapped:       'load-schemas',
  schemas_loaded:               'establish-e-filing-session',
  e_filing_session_established: 'validate-test-submission',
  test_submission_validated:    'bind-reconciliation-period',
  reconciliation_period_bound:  'activate-live-filing',
  live_filing_active:           'acknowledge-filing',
  filing_acknowledged:          'archive',
  suspended:                    'resume',
  failover_active:              'activate-live-filing',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'validate-filing-authority': 'Validate filing authority (compliance engineer - CIPC/SARS/NERSA endpoint reachability)',
  'bind-tax-registration':     'Bind tax registration (compliance engineer - SARS TIN / CIPC enterprise no. / NERSA licensee id)',
  'map-filing-template':       'Map filing template (compliance engineer - IT14 / VAT201 / annual_return / NERSA quarterly schema)',
  'load-schemas':              'Load schemas (compliance engineer - XBRL / XML / JSON)',
  'establish-e-filing-session':'Establish e-filing session (compliance engineer - SARS e-Filing profile / CIPC director-cert mTLS)',
  'validate-test-submission':  'Validate test submission (compliance engineer - smoke filing into sandbox)',
  'bind-reconciliation-period':'Bind reconciliation period (company secretary - quarterly / annual window)',
  'activate-live-filing':      'ACTIVATE LIVE (financial director - GOVERNMENT-FILING-CONNECTOR-LIVE; Companies Act + Tax Admin Act)',
  'acknowledge-filing':        'Acknowledge filing (financial director - SIGNATURE - crosses systemic_critical always)',
  'archive':                   'Archive (CEO - HARD terminal, retire connector)',
  'disconnect':                'DISCONNECT (financial director - HARD; crosses EVERY tier WHEN companies_act_lateness OR sars_admin_penalty)',
  'suspend':                   'Suspend (company secretary - filing-window lockout, SOFT)',
  'resume':                    'Resume (company secretary - exit lockout)',
  'revoke-credential':         'REVOKE CREDENTIAL (SIGNATURE - W126 crosses EVERY tier; Companies Act + Tax Admin Act + ERA s.10 + PAIA s.18)',
  'activate-failover':         'Activate failover (company secretary - primary to DR e-Filing profile; multi_jurisdiction + systemic crossings)',
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

function fmtAuthority(s: string | null | undefined): string {
  if (!s) return '-';
  const map: Record<string, string> = {
    cipc: 'CIPC', sars: 'SARS', nersa: 'NERSA', dmre: 'DMRE', dffe: 'DFFE',
    sarb: 'SARB', fic: 'FIC', fsca: 'FSCA', treasury: 'Treasury', municipal: 'Municipal',
  };
  return map[String(s)] ?? String(s).toUpperCase();
}

function fmtFilingType(s: string | null | undefined): string {
  if (!s) return '-';
  const map: Record<string, string> = {
    annual_return: 'CIPC Annual return',
    vat201: 'VAT201',
    emp201: 'EMP201',
    it14: 'IT14',
    nersa_quarterly_electricity: 'NERSA Q electricity',
    nersa_quarterly_gas: 'NERSA Q gas',
    dmre_quarterly_reippppp: 'DMRE Q REIPPPP',
    dffe_ghg: 'DFFE GHG',
    carbon_tax: 'Carbon tax',
    paia_response: 'PAIA response',
  };
  return map[String(s)] ?? String(s).replace(/_/g, ' ');
}

interface KpiSummary {
  total: number;
  active_count: number;
  proposed_count: number;
  authority_v_count: number;
  tax_bound_count: number;
  template_count: number;
  schemas_count: number;
  session_count: number;
  test_count: number;
  recon_bound_count: number;
  live_count: number;
  ack_count: number;
  archived_count: number;
  disconnected_count: number;
  revoked_count: number;
  suspended_count: number;
  failover_count: number;
  breached: number;
  reportable_total: number;
  floor_flag_total: number;
  w125_bridged_count: number;
  w124_bridged_count: number;
  w74_bridged_count: number;
  w48_bridged_count: number;
  w118_bridged_count: number;
  control_effectiveness_avg: number;
  creds_expiring_within_60d: number;
  creds_expiring_within_14d: number;
  deadlines_within_30d: number;
}

const EMPTY_KPI: KpiSummary = {
  total: 0, active_count: 0,
  proposed_count: 0, authority_v_count: 0, tax_bound_count: 0,
  template_count: 0, schemas_count: 0, session_count: 0, test_count: 0,
  recon_bound_count: 0, live_count: 0, ack_count: 0,
  archived_count: 0, disconnected_count: 0, revoked_count: 0,
  suspended_count: 0, failover_count: 0,
  breached: 0, reportable_total: 0, floor_flag_total: 0,
  w125_bridged_count: 0, w124_bridged_count: 0, w74_bridged_count: 0,
  w48_bridged_count: 0, w118_bridged_count: 0,
  control_effectiveness_avg: 0,
  creds_expiring_within_60d: 0, creds_expiring_within_14d: 0,
  deadlines_within_30d: 0,
};

interface Props {
  // External / regulator-view: shows disconnected + revoked + reportable
  // rows only, read-only. Used to inspect GOVERNMENT-FILING-CONNECTOR-
  // REVOKE signature lines under Companies Act + Tax Admin Act + ERA
  // s.10 + PAIA s.18.
  regulatorView?: boolean;
}

export function GovernmentFilingConnectorTab({ regulatorView }: Props = {}) {
  const [rows, setRows] = useState<GfcRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(regulatorView ? 'credential_revoked' : 'active');
  const [selected, setSelected] = useState<GfcRow | null>(null);
  const [events, setEvents] = useState<GfcEvent[]>([]);
  const [showPropose, setShowPropose] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: GfcRow[] } & KpiSummary }>('/government-filing-connector');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          proposed_count: data.proposed_count || 0,
          authority_v_count: data.authority_v_count || 0,
          tax_bound_count: data.tax_bound_count || 0,
          template_count: data.template_count || 0,
          schemas_count: data.schemas_count || 0,
          session_count: data.session_count || 0,
          test_count: data.test_count || 0,
          recon_bound_count: data.recon_bound_count || 0,
          live_count: data.live_count || 0,
          ack_count: data.ack_count || 0,
          archived_count: data.archived_count || 0,
          disconnected_count: data.disconnected_count || 0,
          revoked_count: data.revoked_count || 0,
          suspended_count: data.suspended_count || 0,
          failover_count: data.failover_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          floor_flag_total: data.floor_flag_total || 0,
          w125_bridged_count: data.w125_bridged_count || 0,
          w124_bridged_count: data.w124_bridged_count || 0,
          w74_bridged_count: data.w74_bridged_count || 0,
          w48_bridged_count: data.w48_bridged_count || 0,
          w118_bridged_count: data.w118_bridged_count || 0,
          control_effectiveness_avg: data.control_effectiveness_avg || 0,
          creds_expiring_within_60d: data.creds_expiring_within_60d || 0,
          creds_expiring_within_14d: data.creds_expiring_within_14d || 0,
          deadlines_within_30d: data.deadlines_within_30d || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load government-filing connectors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { connector: GfcRow; events: GfcEvent[] } }>(`/government-filing-connector/${id}`);
      if (res.data?.data?.connector) setSelected(res.data.data.connector);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load connector history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')                 return true;
      if (filter === 'active')              return !r.is_terminal;
      if (filter === 'reportable')          return !!r.is_reportable_flag;
      if (filter === 'breached')            return r.sla_breached_live;
      if (filter === 'cred_60d')            return (r.days_to_credential_renewal_live ?? 9999) < 60;
      if (filter === 'cred_14d')            return (r.days_to_credential_renewal_live ?? 9999) < 14;
      if (filter === 'deadline_30d')        return (r.days_to_next_filing_deadline_live ?? 9999) < 30;
      if (filter === 'deadline_7d')         return (r.days_to_next_filing_deadline_live ?? 9999) < 7;
      if (filter === 'health_red')          return r.connector_health_band_live === 'red';
      if (filter === 'health_critical')     return r.connector_health_band_live === 'critical';
      if (filter === 'systemic_floor')      return !!r.floor_at_systemic_critical_live;
      if (filter === 'multi_juris_floor')   return !!r.floor_at_multi_jurisdiction_live;
      if (filter.startsWith('tier:'))       return r.current_tier === filter.slice(5);
      if (filter.startsWith('authority:'))  return r.filing_authority === filter.slice(10);
      if (filter.startsWith('cipc:'))       return r.companies_act_filing_status === filter.slice(5);
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? EMPTY_KPI;

  const act = useCallback(async (action: ActionKind, row: GfcRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'validate-filing-authority') {
        const url = window.prompt('Filing authority endpoint URL:', row.endpoint_url ?? '');
        if (url !== null) body.endpoint_url = url;
        const cn = window.prompt('Counterparty (legal entity / taxpayer name):', row.counterparty_name ?? '');
        if (cn !== null) body.counterparty_name = cn;
      } else if (action === 'bind-tax-registration') {
        const trn = window.prompt('Tax registration number (SARS TIN / CIPC enterprise no. / NERSA licensee id):', row.tax_registration_number ?? '');
        if (trn !== null) body.tax_registration_number = trn;
        const juris = window.prompt('Jurisdiction count (tax jurisdictions covered):', String(row.jurisdiction_count ?? 1));
        if (juris !== null) body.jurisdiction_count = Number(juris);
      } else if (action === 'map-filing-template') {
        const fp = window.prompt('Filing period (e.g. 2026Q2 / 2026 / 2026-05):', row.filing_period ?? '');
        if (fp !== null) body.filing_period = fp;
        const fc = window.prompt('Filing count (number of return forms in scope):', String(row.filing_count ?? 1));
        if (fc !== null) body.filing_count = Number(fc);
      } else if (action === 'load-schemas') {
        const ver = window.prompt('Schema version (e.g. SARS XBRL 4.0 / CIPC eXML 2.1):', row.schema_version ?? '');
        if (ver !== null) body.schema_version = ver;
        body.schemas_compliant = window.confirm('Schemas compliant on load?') ? 1 : 0;
      } else if (action === 'establish-e-filing-session') {
        const fp = window.prompt('e-Filing credential fingerprint (SHA-256, lowercase hex):', row.efiling_credential_fingerprint ?? '');
        if (fp !== null) body.efiling_credential_fingerprint = fp;
        const exp = window.prompt('Credential expiry ISO date (e.g. 2027-05-31T00:00:00Z):', row.credential_expiry_at ?? '');
        if (exp !== null) body.credential_expiry_at = exp;
        body.iso27001_controls_ok = window.confirm('ISO 27001 controls verified?') ? 1 : 0;
        body.soc1_type2_audit_ok = window.confirm('SOC 1 Type II readiness verified?') ? 1 : 0;
      } else if (action === 'validate-test-submission') {
        const lat = window.prompt('Average filing latency (ms):', String(row.average_filing_latency_ms ?? 80));
        if (lat !== null) body.average_filing_latency_ms = Number(lat);
        const fpq = window.prompt('Filings per quarter (estimate):', String(row.filings_per_quarter ?? 4));
        if (fpq !== null) body.filings_per_quarter = Number(fpq);
      } else if (action === 'bind-reconciliation-period') {
        const dl = window.prompt('Next filing deadline ISO date:', row.next_filing_deadline_at ?? '');
        if (dl !== null) body.next_filing_deadline_at = dl;
      } else if (action === 'activate-live-filing') {
        const cipc = window.prompt('Companies Act filing status (current/pending/overdue):', row.companies_act_filing_status ?? 'current');
        if (cipc !== null) body.companies_act_filing_status = cipc;
        const sars = window.prompt('SARS tax clearance status (active/pending/revoked):', row.sars_tax_clearance_status ?? 'active');
        if (sars !== null) body.sars_tax_clearance_status = sars;
        const note = window.prompt(
          'Go-live notes. NOTE: GOVERNMENT-FILING-CONNECTOR-LIVE - Companies Act + Tax Admin Act in scope.',
          '',
        );
        if (note !== null) body.notes = note;
      } else if (action === 'acknowledge-filing') {
        const succ = window.prompt('Successful filing count (quarter):', String(row.successful_filing_count_quarter ?? 4));
        if (succ !== null) body.successful_filing_count_quarter = Number(succ);
        const fail = window.prompt('Failed filing count (quarter):', String(row.failed_filing_count_quarter ?? 0));
        if (fail !== null) body.failed_filing_count_quarter = Number(fail);
        const fr = window.prompt('Failure rate %:', String(row.failure_rate_pct ?? 0));
        if (fr !== null) body.failure_rate_pct = Number(fr);
        const breaks = window.prompt('Reconciliation break count:', String(row.reconciliation_break_count ?? 0));
        if (breaks !== null) body.reconciliation_break_count = Number(breaks);
        const w118 = window.prompt('W118 audit block ref (MANDATORY this ack):', row.w118_block_ref ?? '');
        if (w118 !== null) body.w118_block_ref = w118;
        const note = window.prompt(
          'Acknowledgement notes. NOTE: SIGNATURE - crosses regulator at systemic_critical tier (board + counsel sign-off).',
          '',
        );
        if (note !== null) body.notes = note;
      } else if (action === 'archive') {
        const note = window.prompt('Archive notes (CEO - HARD terminal):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'disconnect') {
        const reason = window.prompt(
          'Disconnect reason. NOTE: HARD terminal - crosses regulator EVERY tier WHEN companies_act_lateness_penalty_active OR sars_admin_penalty_active.',
          row.reason_code ?? 'authority_endpoint_decommissioned',
        );
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'suspend') {
        const reason = window.prompt('Suspend reason (filing-window lockout?):', row.reason_code ?? 'filing_window_lockout');
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'revoke-credential') {
        const reason = window.prompt(
          'Revoke credential reason. NOTE: SIGNATURE - W126 GOVERNMENT-FILING-CONNECTOR-REVOKE crosses regulator EVERY tier (Companies Act + Tax Admin Act + ERA s.10 + PAIA s.18 e-Filing profile compromise disclosure).',
          row.reason_code ?? 'efiling_credential_compromised',
        );
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'activate-failover') {
        const note = window.prompt(
          'Failover notes. NOTE: crosses regulator at multi_jurisdiction + systemic_critical tiers.',
          '',
        );
        if (note !== null) body.notes = note;
      }
      await api.post(`/government-filing-connector/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load, loadEvents, selected]);

  const propose = useCallback(async (body: Record<string, unknown>) => {
    try {
      await api.post('/government-filing-connector', body);
      setShowPropose(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Propose failed');
    }
  }, [load]);

  return (
    <div className="text-[12px] text-[#1a3a5c]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[#0c2a4d]">CIPC / SARS / NERSA government-filing connector (W126)</h2>
          <p className="text-[11px] text-[#4a5568]">
            10-state forward + 4 branch SA government regulator filing spine - CIPC Annual Returns / SARS e-Filing (IT14 / VAT201 / EMP201 / IRP5) / NERSA quarterly electricity & gas / DMRE REIPPPP / DFFE GHG / PAIA / SARB FX / FIC STR / FSCA conduct / Treasury MFMA / municipal.
            Beats SAP DRC + Oracle Fusion Tax Reporting Cloud + Workday Compliance + ONESOURCE + Avalara + Sovos + Vertex + EY + Deloitte Tax Compliance.
            INVERTED SLA HOURS (single 168 / quarterly 240 / annual 360 / multi-juris. 480 / systemic 720).
            FLOOR-AT-MULTI-JURISDICTION {'≥'}1 flag / FLOOR-AT-SYSTEMIC-CRITICAL {'≥'}3 flags. W118 audit bridge mandatory.
            SIGNATURE: revoke_credential crosses EVERY tier (Companies Act + Tax Admin Act + ERA s.10 + PAIA s.18 e-Filing profile compromise).
            External authority counterparty reads via mTLS-gated /api/government-filing-connector/peer/:peer_id with x-mtls-cert-fingerprint header.
          </p>
        </div>
        {!regulatorView && (
          <button type="button"
            onClick={() => setShowPropose(true)}
            className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1a3a5c]"
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
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded border border-[#d8dde6] bg-white px-3 py-2 text-[11px] text-[#4a5568]">
        <span>Proposed: <span className="font-semibold text-[#1a3a5c]">{kpis.proposed_count}</span></span>
        <span>Authority: <span className="font-semibold text-[#1a3a5c]">{kpis.authority_v_count}</span></span>
        <span>Tax reg: <span className="font-semibold text-[#1a3a5c]">{kpis.tax_bound_count}</span></span>
        <span>Template: <span className="font-semibold text-[#1a3a5c]">{kpis.template_count}</span></span>
        <span>Schemas: <span className="font-semibold text-[#1a3a5c]">{kpis.schemas_count}</span></span>
        <span>e-Filing session: <span className="font-semibold text-[#a06200]">{kpis.session_count}</span></span>
        <span>Tests OK: <span className="font-semibold text-[#a06200]">{kpis.test_count}</span></span>
        <span>Recon bound: <span className="font-semibold text-[#a06200]">{kpis.recon_bound_count}</span></span>
        <span>Ack: <span className="font-semibold text-[#1f6b3a]">{kpis.ack_count}</span></span>
        <span>Archived: <span className="font-semibold text-[#1f5b3a]">{kpis.archived_count}</span></span>
        <span>Suspended: <span className="font-semibold text-[#6b7685]">{kpis.suspended_count}</span></span>
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Floor flags: <span className="font-semibold text-[#a06200]">{kpis.floor_flag_total}</span></span>
        <span>Cred {'<'}60d: <span className="font-semibold text-[#a06200]">{kpis.creds_expiring_within_60d}</span></span>
        <span>Cred {'<'}14d: <span className="font-semibold text-[#9b1f1f]">{kpis.creds_expiring_within_14d}</span></span>
        <span>Deadline {'<'}30d: <span className="font-semibold text-[#9b1f1f]">{kpis.deadlines_within_30d}</span></span>
        <span>W118: <span className="font-semibold text-[#1a3a5c]">{kpis.w118_bridged_count}</span></span>
        <span>W125: <span className="font-semibold text-[#1a3a5c]">{kpis.w125_bridged_count}</span></span>
        <span>W124: <span className="font-semibold text-[#1a3a5c]">{kpis.w124_bridged_count}</span></span>
        <span>W74: <span className="font-semibold text-[#1a3a5c]">{kpis.w74_bridged_count}</span></span>
        <span>W48: <span className="font-semibold text-[#1a3a5c]">{kpis.w48_bridged_count}</span></span>
      </div>

      {/* Row 1: action / priority pills */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_ACTION.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#0c2a4d] text-white'
                : 'bg-white text-[#4a5568] border border-[#d8dde6] hover:bg-[#f3f5f9]'
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
                ? 'bg-[#1a3a5c] text-white'
                : 'bg-white text-[#6b7685] border border-[#d8dde6] hover:bg-[#f3f5f9]'
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
                ? 'bg-[#7a0e0e] text-white'
                : 'bg-white text-[#6b7685] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 4: filing authority */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_AUTHORITY.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#0c2a4d] text-white'
                : 'bg-white text-[#6b7685] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 5: CIPC status */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS_CIPC.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#1f6b3a] text-white'
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Connector #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Counterparty</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Authority / type</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Health</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Scope</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Ctrl</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Cred</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Deadl.</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Flags</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.current_tier];
                const health = HEALTH_TONE[r.connector_health_band_live ?? r.connector_health_band ?? 'green'];
                const control = r.control_effectiveness_index_live ?? r.control_effectiveness_index ?? 0;
                const credDays = r.days_to_credential_renewal_live ?? r.days_to_credential_renewal ?? null;
                const deadlineDays = r.days_to_next_filing_deadline_live ?? r.days_to_next_filing_deadline ?? null;
                const flags = r.floor_flag_count_live ?? 0;
                const scope = `${r.filing_count ?? 0}f/${r.jurisdiction_count ?? 0}j${r.national_statutory ? '/NS' : ''}`;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      <div className="text-[11px] font-semibold">{r.connector_number}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.peer_id}</div>
                      {r.is_reportable_flag ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span> : null}
                      {r.regulator_ref ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">FILED</span> : null}
                      {r.floor_at_systemic_critical_live ? <span className="ml-1 text-[9px] font-semibold text-[#7a0e0e]">SC</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[#1a3a5c]">
                      {r.counterparty_name ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-mono text-[#1a3a5c]">
                      {fmtAuthority(r.filing_authority)}
                      <div className="text-[10px] text-[#6b7685]">{fmtFilingType(r.filing_type)}</div>
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
                    <td className="px-3 py-2 text-right tabular-nums text-[11px] font-mono text-[#0c2a4d]">
                      {scope}
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums ${control >= 100 ? 'text-[#1f5b3a]' : control >= 60 ? 'text-[#a06200]' : 'text-[#9b1f1f] font-semibold'}`}>
                      {control}/130
                    </td>
                    <td className={`px-3 py-2 text-center text-[10px] uppercase tracking-wider ${credDays != null && credDays < 14 ? 'text-[#9b1f1f] font-semibold' : credDays != null && credDays < 60 ? 'text-[#a06200]' : 'text-[#4a5568]'}`}>
                      {credDays != null ? `${credDays}d` : '-'}
                    </td>
                    <td className={`px-3 py-2 text-center text-[10px] uppercase tracking-wider ${deadlineDays != null && deadlineDays < 7 ? 'text-[#9b1f1f] font-semibold' : deadlineDays != null && deadlineDays < 30 ? 'text-[#a06200]' : 'text-[#4a5568]'}`}>
                      {deadlineDays != null ? `${deadlineDays}d` : '-'}
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums ${flags >= 3 ? 'text-[#7a0e0e] font-semibold' : flags >= 1 ? 'text-[#a06200]' : 'text-[#1f5b3a]'}`}>
                      {flags}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached_live ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached_live ? 'BREACHED' : fmtHoursSla(r.sla_hours_remaining_live)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={12} className="px-3 py-6 text-center text-[#4a5568]">No connectors match.</td></tr>
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
  row: GfcRow;
  events: GfcEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: GfcRow) => void;
  regulatorView: boolean;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status] ?? null;
  const control = row.control_effectiveness_index_live ?? row.control_effectiveness_index ?? 0;
  const credDays = row.days_to_credential_renewal_live ?? row.days_to_credential_renewal ?? null;
  const deadlineDays = row.days_to_next_filing_deadline_live ?? row.days_to_next_filing_deadline ?? null;
  const flags = row.floor_flag_count_live ?? 0;

  // Active non-terminal set for branch actions.
  const ACTIVE_NON_TERMINAL: GfcStatus[] = [
    'connector_proposed', 'filing_authority_validated', 'tax_registration_bound',
    'filing_template_mapped', 'schemas_loaded', 'e_filing_session_established',
    'test_submission_validated', 'reconciliation_period_bound',
    'live_filing_active', 'filing_acknowledged',
    'suspended', 'failover_active',
  ];
  const SUSPEND_FROM: GfcStatus[] = [
    'filing_authority_validated', 'tax_registration_bound', 'filing_template_mapped',
    'schemas_loaded', 'e_filing_session_established', 'test_submission_validated',
    'reconciliation_period_bound', 'live_filing_active', 'filing_acknowledged',
  ];
  const FAILOVER_FROM: GfcStatus[] = ['live_filing_active', 'filing_acknowledged'];
  const ACK_FROM: GfcStatus[] = ['live_filing_active', 'filing_acknowledged'];
  const DISCONNECT_FROM = ACTIVE_NON_TERMINAL;
  const REVOKE_FROM = ACTIVE_NON_TERMINAL;

  const canSuspend    = SUSPEND_FROM.includes(row.chain_status);
  const canFailover   = FAILOVER_FROM.includes(row.chain_status);
  const canAck        = ACK_FROM.includes(row.chain_status);
  const canDisconnect = DISCONNECT_FROM.includes(row.chain_status);
  const canRevoke     = REVOKE_FROM.includes(row.chain_status);

  const renderAct = (action: ActionKind, label: string, tone: 'primary' | 'danger' | 'amber' | 'plain' = 'plain') => {
    const cls = tone === 'primary'
      ? 'bg-[#0c2a4d] text-white hover:bg-[#1a3a5c]'
      : tone === 'danger'
        ? 'bg-[#7a0e0e] text-white hover:bg-[#9b1f1f]'
        : tone === 'amber'
          ? 'bg-[#a06200] text-white hover:bg-[#c97a00]'
          : 'bg-white border border-[#d8dde6] text-[#1a3a5c] hover:bg-[#f3f5f9]';
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
            <div className="text-[11px] uppercase tracking-wider text-[#6b7685]">
              {fmtAuthority(row.filing_authority)} {'•'} {fmtFilingType(row.filing_type)} {'•'} {row.current_tier.replace(/_/g, ' ')}
              {row.filing_count != null ? <> {'•'} {row.filing_count}f/{row.jurisdiction_count ?? 0}j{row.national_statutory ? '/NS' : ''}</> : null}
            </div>
            <h3 className="text-lg font-semibold text-[#0c2a4d]">{row.connector_number}</h3>
            <p className="text-[11px] text-[#4a5568]">
              {row.title || 'CIPC/SARS/NERSA government-filing connector'} {'•'} peer <span className="font-mono">{row.peer_id}</span>
              {row.counterparty_name ? <> {'•'} {row.counterparty_name}</> : null}
              {row.tax_registration_number ? <> {'•'} TIN <span className="font-mono">{row.tax_registration_number}</span></> : null}
              {row.endpoint_url ? <> {'•'} <span className="font-mono text-[10px]">{row.endpoint_url}</span></> : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1 text-[12px] text-[#1a3a5c] hover:bg-[#f3f5f9]">Close</button>
        </div>

        {/* 4 scoring indexes */}
        <div className="mb-3 grid grid-cols-4 gap-2">
          <Kpi label="Control eff." value={`${control}/130`} tone={control >= 100 ? 'ok' : control >= 60 ? 'warn' : 'bad'} />
          <Kpi label="Cred days" value={credDays != null ? `${credDays}d` : '-'} tone={credDays != null && credDays < 14 ? 'bad' : credDays != null && credDays < 60 ? 'warn' : 'ok'} />
          <Kpi label="Deadline" value={deadlineDays != null ? `${deadlineDays}d` : '-'} tone={deadlineDays != null && deadlineDays < 7 ? 'bad' : deadlineDays != null && deadlineDays < 30 ? 'warn' : 'ok'} />
          <Kpi label="SLA window" value={`${row.sla_target_hours ?? 0}h`} />
        </div>

        {/* Filing battery */}
        <div className="mb-3 grid grid-cols-4 gap-2 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Filings/Q</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.filings_per_quarter ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Successful Q</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.successful_filing_count_quarter ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Failed Q</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.failed_filing_count_quarter ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Failure %</div>
            <div className={`font-mono text-[12px] ${(row.failure_rate_pct ?? 0) > 2 ? 'text-[#9b1f1f] font-semibold' : (row.failure_rate_pct ?? 0) > 1 ? 'text-[#a06200]' : 'text-[#1f5b3a]'}`}>{row.failure_rate_pct ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Latency</div>
            <div className={`font-mono text-[12px] ${(row.average_filing_latency_ms ?? 0) > 300 ? 'text-[#9b1f1f] font-semibold' : (row.average_filing_latency_ms ?? 0) > 150 ? 'text-[#a06200]' : 'text-[#0c2a4d]'}`}>{row.average_filing_latency_ms ?? '-'} ms</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Recon breaks</div>
            <div className={`font-mono text-[12px] ${(row.reconciliation_break_count ?? 0) > 0 ? 'text-[#a06200]' : 'text-[#0c2a4d]'}`}>{row.reconciliation_break_count ?? 0}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">CIPC score</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.cipc_compliance_score ?? '-'}/130</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">SARS score</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.sars_compliance_score ?? '-'}/130</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">NERSA score</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.nersa_compliance_score ?? '-'}/130</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Companies Act</div>
            <div className={`font-mono text-[12px] ${row.companies_act_filing_status === 'current' ? 'text-[#1f5b3a]' : row.companies_act_filing_status === 'pending' ? 'text-[#a06200]' : row.companies_act_filing_status === 'overdue' ? 'text-[#9b1f1f] font-semibold' : 'text-[#4a5568]'}`}>{row.companies_act_filing_status ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">SARS clearance</div>
            <div className={`font-mono text-[12px] ${row.sars_tax_clearance_status === 'active' ? 'text-[#1f5b3a]' : row.sars_tax_clearance_status === 'pending' ? 'text-[#a06200]' : row.sars_tax_clearance_status === 'revoked' ? 'text-[#9b1f1f] font-semibold' : 'text-[#4a5568]'}`}>{row.sars_tax_clearance_status ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">NERSA levy</div>
            <div className={`font-mono text-[12px] ${row.nersa_levy_status === 'current' ? 'text-[#1f5b3a]' : row.nersa_levy_status === 'arrears' ? 'text-[#9b1f1f] font-semibold' : 'text-[#4a5568]'}`}>{row.nersa_levy_status ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">DFFE GHG</div>
            <div className={`font-mono text-[12px] ${row.dffe_ghg_threshold_status === 'under' ? 'text-[#1f5b3a]' : row.dffe_ghg_threshold_status === 'over' ? 'text-[#9b1f1f] font-semibold' : 'text-[#4a5568]'}`}>{row.dffe_ghg_threshold_status ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Schemas</div>
            <div className={`font-mono text-[12px] ${row.schemas_compliant ? 'text-[#1f5b3a]' : 'text-[#a06200]'}`}>{row.schemas_compliant ? 'COMPLIANT' : 'NO'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">ISO 27001</div>
            <div className={`font-mono text-[12px] ${row.iso27001_controls_ok ? 'text-[#1f5b3a]' : 'text-[#a06200]'}`}>{row.iso27001_controls_ok ? 'OK' : 'NO'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Cred expiry</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{fmtDate(row.credential_expiry_at)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Next deadline</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{fmtDate(row.next_filing_deadline_at)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Filing period</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.filing_period ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Schema ver</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.schema_version ?? '-'}</div>
          </div>
        </div>

        {/* Floor flags */}
        <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">
            Floor flags ({flags}/5) - FLOOR-AT-MULTI-JURISDICTION {'≥'}1, FLOOR-AT-SYSTEMIC-CRITICAL {'≥'}3
          </div>
          <div className="grid grid-cols-5 gap-2">
            <FlagPill on={!!row.companies_act_lateness_penalty_active} label="CIPC lateness" />
            <FlagPill on={!!row.sars_admin_penalty_active} label="SARS admin pen." />
            <FlagPill on={!!row.nersa_levy_arrears} label="NERSA arrears" />
            <FlagPill on={!!row.dffe_ghg_threshold_exceeded} label="DFFE GHG" />
            <FlagPill on={!!row.paia_subject_access_request_open} label="PAIA open" />
          </div>
        </div>

        {/* Bridges */}
        <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Cross-chain bridges (W118 mandatory)</div>
          <div className="grid grid-cols-5 gap-2">
            <BridgePill on={!!row.bridges_to_w118_audit_chain_live} label="W118 audit" />
            <BridgePill on={!!row.bridges_to_w125_erp_connector_live} label="W125 ERP" />
            <BridgePill on={!!row.bridges_to_w124_settlement_connector_live} label="W124 settlement" />
            <BridgePill on={!!row.bridges_to_w74_nersa_levy_live} label="W74 NERSA levy" />
            <BridgePill on={!!row.bridges_to_w48_carbon_tax_live} label="W48 carbon tax" />
          </div>
        </div>

        {/* Regulator + reason */}
        {(row.is_reportable_flag || row.regulator_ref || row.regulator_inbox_ref || row.reason_code) && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-[11px] text-[#7a1f1f]">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[#9b1f1f]">Regulator crossing</div>
            {row.reason_code && <div>Reason: <span className="font-mono">{row.reason_code}</span></div>}
            {row.regulator_reason_text && <div>Detail: {row.regulator_reason_text}</div>}
            {row.regulator_ref && <div>Filed ref: <span className="font-mono">{row.regulator_ref}</span></div>}
            {row.regulator_inbox_ref && <div>Inbox: <span className="font-mono">{row.regulator_inbox_ref}</span></div>}
            {row.regulator_crossed_at && <div>Crossed at: {fmtDate(row.regulator_crossed_at)}</div>}
          </div>
        )}

        {/* Action bar */}
        {!regulatorView && !row.is_hard_terminal && (
          <div className="mb-4 flex flex-wrap gap-2 rounded border border-[#d8dde6] bg-white p-3">
            {nextAction && renderAct(nextAction, ACTION_LABEL[nextAction].split('(')[0].trim(), 'primary')}
            {canAck && row.chain_status !== 'filing_acknowledged' && renderAct('acknowledge-filing', 'Acknowledge filing', 'primary')}
            {row.chain_status === 'filing_acknowledged' && renderAct('acknowledge-filing', 'Re-acknowledge', 'plain')}
            {canSuspend && row.chain_status !== 'suspended' && renderAct('suspend', 'Suspend', 'amber')}
            {row.chain_status === 'suspended' && renderAct('resume', 'Resume', 'primary')}
            {canFailover && renderAct('activate-failover', 'Failover', 'amber')}
            {canDisconnect && renderAct('disconnect', 'Disconnect (HARD)', 'danger')}
            {canRevoke && renderAct('revoke-credential', 'REVOKE CREDENTIAL (SIGNATURE)', 'danger')}
          </div>
        )}

        {/* Timeline */}
        <div className="rounded border border-[#d8dde6] bg-white">
          <div className="border-b border-[#e3e7ec] px-3 py-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Timeline</div>
          <ol className="divide-y divide-[#e3e7ec]">
            {events.length === 0 && (
              <li className="px-3 py-3 text-[11px] text-[#6b7685]">No events.</li>
            )}
            {events.map((e) => (
              <li key={e.id} className="px-3 py-2 text-[11px]">
                <div className="font-semibold text-[#1a3a5c]">{e.event_type}</div>
                <div className="text-[10px] text-[#4a5568]">
                  {e.from_status || '-'} {'→'} {e.to_status || '-'}
                  {e.actor_party ? <> {'•'} {e.actor_party}</> : null}
                  {' '}{'•'} {fmtDate(e.created_at)}
                </div>
                {e.notes && <div className="mt-1 text-[#1a3a5c]">{e.notes}</div>}
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
      className={`rounded px-2 py-0.5 text-center text-[10px] font-medium ${on ? 'bg-[#7a0e0e] text-white' : 'bg-[#e3e7ec] text-[#6b7685]'}`}
      title={label}
    >
      {label}
    </span>
  );
}

function BridgePill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-center text-[10px] font-medium ${on ? 'bg-[#0c2a4d] text-white' : 'bg-[#e3e7ec] text-[#6b7685]'}`}
      title={label}
    >
      {label}
    </span>
  );
}

const AUTHORITY_OPTIONS: Array<{ key: GfcAuthorityKey; label: string }> = [
  { key: 'cipc',      label: 'CIPC (Companies Act)' },
  { key: 'sars',      label: 'SARS (Tax Admin)' },
  { key: 'nersa',     label: 'NERSA (ERA s.10)' },
  { key: 'dmre',      label: 'DMRE (Energy regs)' },
  { key: 'dffe',      label: 'DFFE (NEMA / GHG)' },
  { key: 'sarb',      label: 'SARB (ExCon)' },
  { key: 'fic',       label: 'FIC (FICA / STR)' },
  { key: 'fsca',      label: 'FSCA (Conduct)' },
  { key: 'treasury',  label: 'National Treasury (MFMA)' },
  { key: 'municipal', label: 'Municipal' },
];

const FILING_TYPE_OPTIONS: Array<{ key: GfcFilingType; label: string }> = [
  { key: 'annual_return',                label: 'CIPC Annual return' },
  { key: 'vat201',                       label: 'SARS VAT201' },
  { key: 'emp201',                       label: 'SARS EMP201' },
  { key: 'it14',                         label: 'SARS IT14' },
  { key: 'nersa_quarterly_electricity',  label: 'NERSA Q electricity' },
  { key: 'nersa_quarterly_gas',          label: 'NERSA Q gas' },
  { key: 'dmre_quarterly_reippppp',      label: 'DMRE REIPPPP' },
  { key: 'dffe_ghg',                     label: 'DFFE GHG' },
  { key: 'carbon_tax',                   label: 'Carbon Tax (SARS)' },
  { key: 'paia_response',                label: 'PAIA response' },
];

function ProposeModal({
  onClose, onSubmit,
}: {
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [peerId, setPeerId] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [authority, setAuthority] = useState<GfcAuthorityKey>('cipc');
  const [filingType, setFilingType] = useState<GfcFilingType>('annual_return');
  const [taxReg, setTaxReg] = useState('');
  const [filings, setFilings] = useState('');
  const [jurisdictions, setJurisdictions] = useState('');
  const [nationalStatutory, setNationalStatutory] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState('');
  const [title, setTitle] = useState('');
  const [w118, setW118] = useState('');
  const [w125, setW125] = useState('');
  const [w124, setW124] = useState('');
  const [w74, setW74]   = useState('');
  const [w48, setW48]   = useState('');
  const [cipcLateness, setCipcLateness] = useState(false);
  const [sarsPenalty, setSarsPenalty] = useState(false);
  const [nersaArrears, setNersaArrears] = useState(false);
  const [dffeGhg, setDffeGhg] = useState(false);
  const [paiaOpen, setPaiaOpen] = useState(false);
  const [regulatorRelevant, setRegulatorRelevant] = useState(false);

  const submit = () => {
    const body: Record<string, unknown> = {
      filing_authority: authority,
      filing_type: filingType,
      peer_id: peerId || undefined,
      counterparty_name: counterparty || undefined,
      tax_registration_number: taxReg || undefined,
      filing_count: filings ? Number(filings) : undefined,
      jurisdiction_count: jurisdictions ? Number(jurisdictions) : undefined,
      national_statutory: nationalStatutory ? 1 : 0,
      endpoint_url: endpointUrl || undefined,
      title: title || undefined,
      w118_block_ref: w118 || undefined,
      w125_erp_connector_ref: w125 || undefined,
      w124_settlement_connector_ref: w124 || undefined,
      w74_nersa_levy_ref: w74 || undefined,
      w48_carbon_tax_ref: w48 || undefined,
      companies_act_lateness_penalty_active: cipcLateness ? 1 : 0,
      sars_admin_penalty_active: sarsPenalty ? 1 : 0,
      nersa_levy_arrears: nersaArrears ? 1 : 0,
      dffe_ghg_threshold_exceeded: dffeGhg ? 1 : 0,
      paia_subject_access_request_open: paiaOpen ? 1 : 0,
      regulator_relevant: regulatorRelevant ? 1 : 0,
    };
    onSubmit(body);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded bg-white p-4 text-[12px] text-[#1a3a5c]">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#0c2a4d]">Propose government-filing connector (W126)</h3>
            <p className="text-[11px] text-[#4a5568]">
              W118 audit bridge mandatory. Tier auto-derived from (filing_count, jurisdiction_count, national_statutory) with FLOOR-AT-MULTI-JURISDICTION {'≥'}1 flag and FLOOR-AT-SYSTEMIC-CRITICAL {'≥'}3 flags.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1 text-[12px] text-[#1a3a5c] hover:bg-[#f3f5f9]">Close</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Peer id (gov authority counterparty)">
            <input value={peerId} onChange={(e) => setPeerId(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="auth-peer-cipc-prod-01" />
          </Field>
          <Field label="Counterparty name (legal entity / taxpayer)">
            <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="Acme Power (Pty) Ltd" />
          </Field>
          <Field label="Filing authority">
            <select value={authority} onChange={(e) => setAuthority(e.target.value as GfcAuthorityKey)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]">
              {AUTHORITY_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Filing type">
            <select value={filingType} onChange={(e) => setFilingType(e.target.value as GfcFilingType)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]">
              {FILING_TYPE_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Tax registration number (SARS TIN / CIPC / NERSA id)">
            <input value={taxReg} onChange={(e) => setTaxReg(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="9000123456" />
          </Field>
          <Field label="Filing count (return forms in scope)">
            <input value={filings} onChange={(e) => setFilings(e.target.value)} type="number" className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="4" />
          </Field>
          <Field label="Jurisdiction count">
            <input value={jurisdictions} onChange={(e) => setJurisdictions(e.target.value)} type="number" className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="1" />
          </Field>
          <Field label="National statutory?">
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={nationalStatutory} onChange={(e) => setNationalStatutory(e.target.checked)} />
              National statutory floor (forces systemic_critical)
            </label>
          </Field>
          <Field label="Endpoint URL">
            <input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="https://efiling.sars.gov.za/api/v2" />
          </Field>
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="Acme CIPC annual return + SARS VAT201 stack" />
          </Field>
          <Field label="W118 block ref (mandatory)">
            <input value={w118} onChange={(e) => setW118(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="audit-block-2026-1234" />
          </Field>
          <Field label="W125 ERP connector ref">
            <input value={w125} onChange={(e) => setW125(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="soec-w125-001" />
          </Field>
          <Field label="W124 settlement connector ref">
            <input value={w124} onChange={(e) => setW124(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="ssc-2026-0017" />
          </Field>
          <Field label="W74 NERSA levy ref">
            <input value={w74} onChange={(e) => setW74(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="regulator-levy-2026-0011" />
          </Field>
          <Field label="W48 carbon tax offset claim ref">
            <input value={w48} onChange={(e) => setW48(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="cot-2026-0005" />
          </Field>
        </div>

        <div className="mt-3 rounded border border-[#d8dde6] bg-[#f8fafc] p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Floor flags (FLOOR-AT-MULTI-JURISDICTION {'≥'}1, FLOOR-AT-SYSTEMIC-CRITICAL {'≥'}3)</div>
          <div className="grid grid-cols-3 gap-2">
            <Checkbox checked={cipcLateness} onChange={setCipcLateness} label="CIPC lateness penalty" />
            <Checkbox checked={sarsPenalty} onChange={setSarsPenalty} label="SARS admin penalty" />
            <Checkbox checked={nersaArrears} onChange={setNersaArrears} label="NERSA levy arrears" />
            <Checkbox checked={dffeGhg} onChange={setDffeGhg} label="DFFE GHG threshold" />
            <Checkbox checked={paiaOpen} onChange={setPaiaOpen} label="PAIA request open" />
            <Checkbox checked={regulatorRelevant} onChange={setRegulatorRelevant} label="Regulator relevant" />
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1.5 text-[12px] text-[#1a3a5c] hover:bg-[#f3f5f9]">Cancel</button>
          <button type="button" onClick={submit} className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1a3a5c]">Propose connector</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] text-[#4a5568]">
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
    <label className="flex items-center gap-2 text-[11px] text-[#1a3a5c]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export default GovernmentFilingConnectorTab;
