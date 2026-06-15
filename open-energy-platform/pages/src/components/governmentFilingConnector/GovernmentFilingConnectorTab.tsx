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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// OKLCH tokens
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
  [key: string]: unknown;
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

const ALL_STATES = [
  'connector_proposed', 'filing_authority_validated', 'tax_registration_bound',
  'filing_template_mapped', 'schemas_loaded', 'e_filing_session_established',
  'test_submission_validated', 'reconciliation_period_bound',
  'live_filing_active', 'filing_acknowledged',
] as const;

const BRANCH_STATES = [
  'archived', 'disconnected', 'credential_revoked', 'suspended', 'failover_active',
] as const;

const FILTERS = [
  { key: 'active',               label: 'Active' },
  { key: 'all',                  label: 'All' },
  { key: 'reportable',           label: 'Reportable' },
  { key: 'breached',             label: 'SLA breached' },
  { key: 'cred_60d',             label: 'Cred exp. 60d' },
  { key: 'cred_14d',             label: 'Cred exp. 14d' },
  { key: 'deadline_30d',         label: 'Deadline 30d' },
  { key: 'deadline_7d',          label: 'Deadline 7d' },
  { key: 'health_red',           label: 'Health red' },
  { key: 'health_critical',      label: 'Health critical' },
  { key: 'systemic_floor',       label: 'Systemic floor' },
  { key: 'multi_juris_floor',    label: 'Multi-juris. floor' },
  { key: 'disconnected',         label: 'Disconnected' },
  { key: 'credential_revoked',   label: 'Revoked' },
  // lifecycle
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
  { key: 'suspended',                    label: 'Suspended' },
  { key: 'failover_active',              label: 'Failover' },
  // tier
  { key: 'tier:single_filing',      label: 'Single (168h)' },
  { key: 'tier:quarterly_returns',  label: 'Quarterly (240h)' },
  { key: 'tier:annual_returns',     label: 'Annual (360h)' },
  { key: 'tier:multi_jurisdiction', label: 'Multi-juris. (480h)' },
  { key: 'tier:systemic_critical',  label: 'Systemic (720h)' },
  // authority
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
  // CIPC status
  { key: 'cipc:current', label: 'CIPC current' },
  { key: 'cipc:pending', label: 'CIPC pending' },
  { key: 'cipc:overdue', label: 'CIPC overdue' },
];

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

function getActions(row: GfcRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const st = row.chain_status;

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

  if (st === 'connector_proposed') {
    actions.push({
      key: 'validate-filing-authority',
      label: 'Validate filing authority',
      fields: [
        { key: 'endpoint_url', label: 'Filing authority endpoint URL', type: 'text', required: false },
        { key: 'counterparty_name', label: 'Counterparty (legal entity / taxpayer name)', type: 'text', required: false },
      ],
    });
  }
  if (st === 'filing_authority_validated') {
    actions.push({
      key: 'bind-tax-registration',
      label: 'Bind tax registration',
      fields: [
        { key: 'tax_registration_number', label: 'Tax registration number (SARS TIN / CIPC enterprise no. / NERSA licensee id)', type: 'text', required: false },
        { key: 'jurisdiction_count', label: 'Jurisdiction count (tax jurisdictions covered)', type: 'text', required: false },
      ],
    });
  }
  if (st === 'tax_registration_bound') {
    actions.push({
      key: 'map-filing-template',
      label: 'Map filing template',
      fields: [
        { key: 'filing_period', label: 'Filing period (e.g. 2026Q2 / 2026 / 2026-05)', type: 'text', required: false },
        { key: 'filing_count', label: 'Filing count (number of return forms in scope)', type: 'text', required: false },
      ],
    });
  }
  if (st === 'filing_template_mapped') {
    actions.push({
      key: 'load-schemas',
      label: 'Load schemas',
      fields: [
        { key: 'schema_version', label: 'Schema version (e.g. SARS XBRL 4.0 / CIPC eXML 2.1)', type: 'text', required: false },
        { key: 'schemas_compliant', label: 'Schemas compliant on load? (1=yes, 0=no)', type: 'text', required: false },
      ],
    });
  }
  if (st === 'schemas_loaded') {
    actions.push({
      key: 'establish-e-filing-session',
      label: 'Establish e-filing session',
      fields: [
        { key: 'efiling_credential_fingerprint', label: 'e-Filing credential fingerprint (SHA-256, lowercase hex)', type: 'text', required: false },
        { key: 'credential_expiry_at', label: 'Credential expiry ISO date (e.g. 2027-05-31T00:00:00Z)', type: 'text', required: false },
        { key: 'iso27001_controls_ok', label: 'ISO 27001 controls verified? (1=yes, 0=no)', type: 'text', required: false },
        { key: 'soc1_type2_audit_ok', label: 'SOC 1 Type II readiness verified? (1=yes, 0=no)', type: 'text', required: false },
      ],
    });
  }
  if (st === 'e_filing_session_established') {
    actions.push({
      key: 'validate-test-submission',
      label: 'Validate test submission',
      fields: [
        { key: 'average_filing_latency_ms', label: 'Average filing latency (ms)', type: 'text', required: false },
        { key: 'filings_per_quarter', label: 'Filings per quarter (estimate)', type: 'text', required: false },
      ],
    });
  }
  if (st === 'test_submission_validated') {
    actions.push({
      key: 'bind-reconciliation-period',
      label: 'Bind reconciliation period',
      fields: [
        { key: 'next_filing_deadline_at', label: 'Next filing deadline ISO date', type: 'text', required: false },
      ],
    });
  }
  if (st === 'reconciliation_period_bound' || st === 'failover_active') {
    actions.push({
      key: 'activate-live-filing',
      label: 'ACTIVATE LIVE (GOVERNMENT-FILING-CONNECTOR-LIVE)',
      fields: [
        { key: 'companies_act_filing_status', label: 'Companies Act filing status (current/pending/overdue)', type: 'text', required: false },
        { key: 'sars_tax_clearance_status', label: 'SARS tax clearance status (active/pending/revoked)', type: 'text', required: false },
        { key: 'notes', label: 'Go-live notes. NOTE: Companies Act + Tax Admin Act in scope.', type: 'textarea', required: false },
      ],
    });
  }
  if (ACK_FROM.includes(st)) {
    actions.push({
      key: 'acknowledge-filing',
      label: st === 'filing_acknowledged' ? 'Re-acknowledge filing' : 'Acknowledge filing (SIGNATURE)',
      fields: [
        { key: 'successful_filing_count_quarter', label: 'Successful filing count (quarter)', type: 'text', required: false },
        { key: 'failed_filing_count_quarter', label: 'Failed filing count (quarter)', type: 'text', required: false },
        { key: 'failure_rate_pct', label: 'Failure rate %', type: 'text', required: false },
        { key: 'reconciliation_break_count', label: 'Reconciliation break count', type: 'text', required: false },
        { key: 'w118_block_ref', label: 'Audit block ref (MANDATORY this ack)', type: 'text', required: true },
        { key: 'notes', label: 'Acknowledgement notes. NOTE: SIGNATURE - crosses regulator at systemic_critical tier (board + counsel sign-off).', type: 'textarea', required: false },
      ],
    });
  }
  if (st === 'filing_acknowledged') {
    actions.push({
      key: 'archive',
      label: 'Archive (CEO - HARD terminal)',
      fields: [
        { key: 'notes', label: 'Archive notes (CEO - HARD terminal)', type: 'textarea', required: false },
      ],
    });
  }
  if (SUSPEND_FROM.includes(st)) {
    actions.push({
      key: 'suspend',
      label: 'Suspend',
      fields: [
        { key: 'reason_code', label: 'Suspend reason (filing-window lockout?)', type: 'text', required: true },
      ],
    });
  }
  if (st === 'suspended') {
    actions.push({
      key: 'resume',
      label: 'Resume',
      fields: [],
    });
  }
  if (FAILOVER_FROM.includes(st)) {
    actions.push({
      key: 'activate-failover',
      label: 'Activate failover',
      fields: [
        { key: 'notes', label: 'Failover notes. NOTE: crosses regulator at multi_jurisdiction + systemic_critical tiers.', type: 'textarea', required: false },
      ],
    });
  }
  if (ACTIVE_NON_TERMINAL.includes(st)) {
    actions.push({
      key: 'disconnect',
      label: 'DISCONNECT (HARD - crosses EVERY tier when lateness/penalty active)',
      fields: [
        { key: 'reason_code', label: 'Disconnect reason. NOTE: HARD terminal - crosses regulator EVERY tier WHEN companies_act_lateness_penalty_active OR sars_admin_penalty_active.', type: 'textarea', required: true },
      ],
    });
    actions.push({
      key: 'revoke-credential',
      label: 'REVOKE CREDENTIAL (SIGNATURE - crosses EVERY tier)',
      fields: [
        { key: 'reason_code', label: 'Revoke credential reason. NOTE: SIGNATURE - government-filing-connector-revoke crosses regulator EVERY tier (Companies Act + Tax Admin Act + ERA s.10 + PAIA s.18 e-Filing profile compromise disclosure).', type: 'textarea', required: true },
      ],
    });
  }

  return actions;
}

function renderDetail(row: GfcRow): React.ReactNode {
  const control = row.control_effectiveness_index_live ?? row.control_effectiveness_index ?? 0;
  const credDays = row.days_to_credential_renewal_live ?? row.days_to_credential_renewal ?? null;
  const deadlineDays = row.days_to_next_filing_deadline_live ?? row.days_to_next_filing_deadline ?? null;
  const flags = row.floor_flag_count_live ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        <KpiTile label="Control eff." value={`${control}/130`} tone={control >= 100 ? 'ok' : control >= 60 ? 'warn' : 'bad'} />
        <KpiTile label="Cred days" value={credDays != null ? `${credDays}d` : '-'} tone={credDays != null && credDays < 14 ? 'bad' : credDays != null && credDays < 60 ? 'warn' : 'ok'} />
        <KpiTile label="Deadline" value={deadlineDays != null ? `${deadlineDays}d` : '-'} tone={deadlineDays != null && deadlineDays < 7 ? 'bad' : deadlineDays != null && deadlineDays < 30 ? 'warn' : 'ok'} />
        <KpiTile label="SLA window" value={`${row.sla_target_hours ?? 0}h`} />
      </div>

      {/* Filing battery */}
      <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 12 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3, marginBottom: 8 }}>Filing metrics</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          <DetailPair label="Filings/Q" value={String(row.filings_per_quarter ?? '-')} />
          <DetailPair label="Successful Q" value={String(row.successful_filing_count_quarter ?? '-')} />
          <DetailPair label="Failed Q" value={String(row.failed_filing_count_quarter ?? '-')} />
          <DetailPair label="Failure %" value={String(row.failure_rate_pct ?? '-')} />
          <DetailPair label="Latency" value={row.average_filing_latency_ms != null ? `${row.average_filing_latency_ms} ms` : '-'} />
          <DetailPair label="Recon breaks" value={String(row.reconciliation_break_count ?? 0)} />
          <DetailPair label="CIPC score" value={row.cipc_compliance_score != null ? `${row.cipc_compliance_score}/130` : '-'} />
          <DetailPair label="SARS score" value={row.sars_compliance_score != null ? `${row.sars_compliance_score}/130` : '-'} />
          <DetailPair label="NERSA score" value={row.nersa_compliance_score != null ? `${row.nersa_compliance_score}/130` : '-'} />
          <DetailPair label="Companies Act" value={row.companies_act_filing_status ?? '-'} />
          <DetailPair label="SARS clearance" value={row.sars_tax_clearance_status ?? '-'} />
          <DetailPair label="NERSA levy" value={row.nersa_levy_status ?? '-'} />
          <DetailPair label="DFFE GHG" value={row.dffe_ghg_threshold_status ?? '-'} />
          <DetailPair label="Schemas" value={row.schemas_compliant ? 'COMPLIANT' : 'NO'} />
          <DetailPair label="ISO 27001" value={row.iso27001_controls_ok ? 'OK' : 'NO'} />
          <DetailPair label="Cred expiry" value={fmtDate(row.credential_expiry_at)} />
          <DetailPair label="Next deadline" value={fmtDate(row.next_filing_deadline_at)} />
          <DetailPair label="Filing period" value={row.filing_period ?? '-'} />
          <DetailPair label="Schema ver" value={row.schema_version ?? '-'} />
          <DetailPair label="TIN" value={row.tax_registration_number ?? '-'} />
        </div>
      </div>

      {/* Floor flags */}
      <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 12 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3, marginBottom: 8 }}>
          Floor flags ({flags}/5) — FLOOR-AT-MULTI-JURISDICTION ≥1, FLOOR-AT-SYSTEMIC-CRITICAL ≥3
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { on: !!row.companies_act_lateness_penalty_active, label: 'CIPC lateness' },
            { on: !!row.sars_admin_penalty_active, label: 'SARS admin pen.' },
            { on: !!row.nersa_levy_arrears, label: 'NERSA arrears' },
            { on: !!row.dffe_ghg_threshold_exceeded, label: 'DFFE GHG' },
            { on: !!row.paia_subject_access_request_open, label: 'PAIA open' },
          ].map(({ on, label }) => (
            <span key={label} style={{
              background: on ? BAD : BG2,
              color: on ? '#fff' : TX3,
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 10,
              fontWeight: on ? 700 : 400,
            }}>{label}</span>
          ))}
        </div>
      </div>

      {/* Bridges */}
      <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 12 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3, marginBottom: 8 }}>Cross-chain bridges (audit chain mandatory)</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { on: !!row.bridges_to_w118_audit_chain_live, label: 'Audit chain' },
            { on: !!row.bridges_to_w125_erp_connector_live, label: 'ERP connector' },
            { on: !!row.bridges_to_w124_settlement_connector_live, label: 'Settlement connector' },
            { on: !!row.bridges_to_w74_nersa_levy_live, label: 'NERSA levy' },
            { on: !!row.bridges_to_w48_carbon_tax_live, label: 'Carbon tax' },
          ].map(({ on, label }) => (
            <span key={label} style={{
              background: on ? ACC : BG2,
              color: on ? '#fff' : TX3,
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 10,
              fontWeight: on ? 700 : 400,
            }}>{label}</span>
          ))}
        </div>
      </div>

      {/* Regulator crossing */}
      {(row.is_reportable_flag || row.regulator_ref || row.regulator_inbox_ref || row.reason_code) && (
        <div style={{ background: 'oklch(0.97 0.010 20)', border: `1px solid oklch(0.82 0.08 20)`, borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: BAD, marginBottom: 6 }}>Regulator crossing</div>
          {row.reason_code && <DetailPair label="Reason" value={row.reason_code} />}
          {row.regulator_reason_text && <DetailPair label="Detail" value={row.regulator_reason_text} />}
          {row.regulator_ref && <DetailPair label="Filed ref" value={row.regulator_ref} />}
          {row.regulator_inbox_ref && <DetailPair label="Inbox" value={row.regulator_inbox_ref} />}
          {row.regulator_crossed_at && <DetailPair label="Crossed at" value={fmtDate(row.regulator_crossed_at)} />}
        </div>
      )}
    </div>
  );
}

interface Props {
  regulatorView?: boolean;
}

export function GovernmentFilingConnectorTab({ regulatorView }: Props = {}) {
  const [rows, setRows] = useState<GfcRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(regulatorView ? 'credential_revoked' : 'active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});
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

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      const body: Record<string, unknown> = { ...values };
      // Coerce numeric fields
      for (const numKey of ['jurisdiction_count','filing_count','average_filing_latency_ms','filings_per_quarter',
        'successful_filing_count_quarter','failed_filing_count_quarter','failure_rate_pct',
        'reconciliation_break_count','schemas_compliant','iso27001_controls_ok','soc1_type2_audit_ok']) {
        if (body[numKey] !== undefined && body[numKey] !== '') body[numKey] = Number(body[numKey]);
      }
      await api.post(`/government-filing-connector/${rowId}/${key}`, body);
      await load();
      // refresh events if expanded
      if (expandedEvents[rowId]) {
        const res = await api.get<{ data: { connector: GfcRow; events: GfcEvent[] } }>(`/government-filing-connector/${rowId}`);
        const evts = res.data?.data?.events || [];
        setExpandedEvents((prev) => ({ ...prev, [rowId]: evts as ChainEvent[] }));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load, expandedEvents]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) {
      setExpandedEvents((prev) => { const n = { ...prev }; delete n[id]; return n; });
      return;
    }
    try {
      const res = await api.get<{ data: { connector: GfcRow; events: GfcEvent[] } }>(`/government-filing-connector/${id}`);
      const evts = res.data?.data?.events || [];
      setExpandedEvents((prev) => ({ ...prev, [id]: evts as ChainEvent[] }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load connector history');
    }
  }, [expandedEvents]);

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
    <div style={{ fontSize: 12, color: TX1, background: BG, minHeight: '100%', padding: 16 }}>
      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1, margin: 0 }}>CIPC / SARS / NERSA government-filing connector</h2>
          <p style={{ fontSize: 11, color: TX2, margin: '4px 0 0' }}>
            10-state forward + 4 branch SA government regulator filing spine.
            INVERTED SLA: single 168h / quarterly 240h / annual 360h / multi-juris. 480h / systemic 720h.
            SIGNATURE: revoke_credential crosses EVERY tier (Companies Act + Tax Admin Act + ERA s.10 + PAIA s.18).
          </p>
        </div>
        {!regulatorView && (
          <button
            type="button"
            onClick={() => setShowPropose(true)}
            style={{ background: ACC, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            + Propose connector
          </button>
        )}
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 8, marginBottom: 12 }}>
        <KpiTile label="Total"        value={kpis.total} />
        <KpiTile label="Active"       value={kpis.active_count} />
        <KpiTile label="Live"         value={kpis.live_count} tone="ok" />
        <KpiTile label="Revoked"      value={kpis.revoked_count} tone={kpis.revoked_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Disconnected" value={kpis.disconnected_count} tone={kpis.disconnected_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Failover"     value={kpis.failover_count} tone={kpis.failover_count > 0 ? 'warn' : undefined} />
        <KpiTile label="SLA breached" value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Control avg"  value={`${kpis.control_effectiveness_avg}/130`} />
      </div>

      {/* Drill rail */}
      <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 11, color: TX2 }}>
        <span>Proposed: <strong style={{ color: TX1 }}>{kpis.proposed_count}</strong></span>
        <span>Authority: <strong style={{ color: TX1 }}>{kpis.authority_v_count}</strong></span>
        <span>Tax reg: <strong style={{ color: TX1 }}>{kpis.tax_bound_count}</strong></span>
        <span>Template: <strong style={{ color: TX1 }}>{kpis.template_count}</strong></span>
        <span>Schemas: <strong style={{ color: TX1 }}>{kpis.schemas_count}</strong></span>
        <span>e-Filing session: <strong style={{ color: WARN }}>{kpis.session_count}</strong></span>
        <span>Tests OK: <strong style={{ color: WARN }}>{kpis.test_count}</strong></span>
        <span>Recon bound: <strong style={{ color: WARN }}>{kpis.recon_bound_count}</strong></span>
        <span>Ack: <strong style={{ color: GOOD }}>{kpis.ack_count}</strong></span>
        <span>Archived: <strong style={{ color: GOOD }}>{kpis.archived_count}</strong></span>
        <span>Suspended: <strong style={{ color: TX3 }}>{kpis.suspended_count}</strong></span>
        <span>Reportable: <strong style={{ color: BAD }}>{kpis.reportable_total}</strong></span>
        <span>Floor flags: <strong style={{ color: WARN }}>{kpis.floor_flag_total}</strong></span>
        <span>Cred &lt;60d: <strong style={{ color: WARN }}>{kpis.creds_expiring_within_60d}</strong></span>
        <span>Cred &lt;14d: <strong style={{ color: BAD }}>{kpis.creds_expiring_within_14d}</strong></span>
        <span>Deadline &lt;30d: <strong style={{ color: BAD }}>{kpis.deadlines_within_30d}</strong></span>
        <span>Audit chain: <strong style={{ color: TX1 }}>{kpis.w118_bridged_count}</strong></span>
        <span>ERP connector: <strong style={{ color: TX1 }}>{kpis.w125_bridged_count}</strong></span>
        <span>Settlement: <strong style={{ color: TX1 }}>{kpis.w124_bridged_count}</strong></span>
        <span>NERSA levy: <strong style={{ color: TX1 }}>{kpis.w74_bridged_count}</strong></span>
        <span>Carbon tax: <strong style={{ color: TX1 }}>{kpis.w48_bridged_count}</strong></span>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            style={{
              background: filter === f.key ? ACC : BG1,
              color: filter === f.key ? '#fff' : TX2,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
              borderRadius: 4,
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: filter === f.key ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ background: 'oklch(0.97 0.010 20)', border: `1px solid oklch(0.82 0.08 20)`, borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '24px', textAlign: 'center', color: TX3 }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.length === 0 && (
            <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '24px', textAlign: 'center', color: TX3 }}>No connectors match.</div>
          )}
          {filtered.map((row) => {
            const control = row.control_effectiveness_index_live ?? row.control_effectiveness_index ?? 0;
            const credDays = row.days_to_credential_renewal_live ?? row.days_to_credential_renewal ?? null;
            const deadlineDays = row.days_to_next_filing_deadline_live ?? row.days_to_next_filing_deadline ?? null;
            const flags = row.floor_flag_count_live ?? 0;
            const health = row.connector_health_band_live ?? row.connector_health_band ?? 'green';

            const subtitle = [
              fmtAuthority(row.filing_authority),
              fmtFilingType(row.filing_type),
              row.current_tier.replace(/_/g, ' '),
              row.counterparty_name,
              row.tax_registration_number ? `TIN ${row.tax_registration_number}` : null,
            ].filter(Boolean).join(' · ');

            const tags: string[] = [];
            if (row.is_reportable_flag) tags.push('REG');
            if (row.floor_at_systemic_critical_live) tags.push('SC-FLOOR');
            if (row.floor_at_multi_jurisdiction_live) tags.push('MJ-FLOOR');
            if (row.sla_breached_live) tags.push('SLA-BREACH');
            if (flags > 0) tags.push(`${flags} flag${flags !== 1 ? 's' : ''}`);
            if (credDays != null && credDays < 14) tags.push(`cred ${credDays}d`);
            if (deadlineDays != null && deadlineDays < 30) tags.push(`deadline ${deadlineDays}d`);
            tags.push(`ctrl ${control}/130`);
            tags.push(`health ${health}`);

            const slaDisplay = row.sla_breached_live ? 'BREACHED' : fmtHoursSla(row.sla_hours_remaining_live);
            const slaBreached = !!row.sla_breached_live;

            return (
              <ChainCard
                key={row.id}
                item={row}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={row.connector_number}
                meta={<span style={{ fontSize: 11, color: TX2 }}>{subtitle}</span>}
                actions={regulatorView ? [] : getActions(row)}
                events={expandedEvents[row.id]}
                onAction={(key, values) => handleAction(row.id, key, values)}
                onExpand={() => handleExpand(row.id)}
                detail={renderDetail(row)}
              />
            );
          })}
        </div>
      )}

      {showPropose && (
        <ProposeModal onClose={() => setShowPropose(false)} onSubmit={propose} />
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: TX1 }}>{value}</div>
    </div>
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

  const inputStyle: React.CSSProperties = {
    width: '100%', borderRadius: 4, border: `1px solid ${BORDER}`,
    padding: '5px 8px', fontSize: 12, color: TX1, background: BG1,
    boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
      <div style={{ width: '100%', maxWidth: 680, background: BG1, borderRadius: 8, padding: 20, fontSize: 12, color: TX1, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TX1 }}>Propose government-filing connector</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: TX2 }}>
              Audit bridge mandatory. Tier auto-derived from filing_count, jurisdiction_count, national_statutory with floor flags.
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: 'pointer', color: TX1 }}>Close</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Peer id (gov authority counterparty)">
            <input value={peerId} onChange={(e) => setPeerId(e.target.value)} style={inputStyle} placeholder="auth-peer-cipc-prod-01" />
          </Field>
          <Field label="Counterparty name (legal entity / taxpayer)">
            <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} style={inputStyle} placeholder="Acme Power (Pty) Ltd" />
          </Field>
          <Field label="Filing authority">
            <select value={authority} onChange={(e) => setAuthority(e.target.value as GfcAuthorityKey)} style={inputStyle}>
              {AUTHORITY_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Filing type">
            <select value={filingType} onChange={(e) => setFilingType(e.target.value as GfcFilingType)} style={inputStyle}>
              {FILING_TYPE_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Tax registration number (SARS TIN / CIPC / NERSA id)">
            <input value={taxReg} onChange={(e) => setTaxReg(e.target.value)} style={inputStyle} placeholder="9000123456" />
          </Field>
          <Field label="Filing count (return forms in scope)">
            <input value={filings} onChange={(e) => setFilings(e.target.value)} type="number" style={inputStyle} placeholder="4" />
          </Field>
          <Field label="Jurisdiction count">
            <input value={jurisdictions} onChange={(e) => setJurisdictions(e.target.value)} type="number" style={inputStyle} placeholder="1" />
          </Field>
          <Field label="National statutory?">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <input type="checkbox" checked={nationalStatutory} onChange={(e) => setNationalStatutory(e.target.checked)} />
              National statutory floor (forces systemic_critical)
            </label>
          </Field>
          <Field label="Endpoint URL">
            <input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} style={inputStyle} placeholder="https://efiling.sars.gov.za/api/v2" />
          </Field>
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="Acme CIPC annual return + SARS VAT201 stack" />
          </Field>
          <Field label="Audit block ref (mandatory)">
            <input value={w118} onChange={(e) => setW118(e.target.value)} style={inputStyle} placeholder="audit-block-2026-1234" />
          </Field>
          <Field label="ERP connector ref">
            <input value={w125} onChange={(e) => setW125(e.target.value)} style={inputStyle} placeholder="soec-001" />
          </Field>
          <Field label="Settlement connector ref">
            <input value={w124} onChange={(e) => setW124(e.target.value)} style={inputStyle} placeholder="ssc-2026-0017" />
          </Field>
          <Field label="NERSA levy ref">
            <input value={w74} onChange={(e) => setW74(e.target.value)} style={inputStyle} placeholder="regulator-levy-2026-0011" />
          </Field>
          <Field label="Carbon tax offset claim ref">
            <input value={w48} onChange={(e) => setW48(e.target.value)} style={inputStyle} placeholder="cot-2026-0005" />
          </Field>
        </div>

        <div style={{ marginTop: 12, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3, marginBottom: 8 }}>
            Floor flags (FLOOR-AT-MULTI-JURISDICTION ≥1, FLOOR-AT-SYSTEMIC-CRITICAL ≥3)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            <Checkbox checked={cipcLateness} onChange={setCipcLateness} label="CIPC lateness penalty" />
            <Checkbox checked={sarsPenalty} onChange={setSarsPenalty} label="SARS admin penalty" />
            <Checkbox checked={nersaArrears} onChange={setNersaArrears} label="NERSA levy arrears" />
            <Checkbox checked={dffeGhg} onChange={setDffeGhg} label="DFFE GHG threshold" />
            <Checkbox checked={paiaOpen} onChange={setPaiaOpen} label="PAIA request open" />
            <Checkbox checked={regulatorRelevant} onChange={setRegulatorRelevant} label="Regulator relevant" />
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '6px 14px', fontSize: 12, cursor: 'pointer', color: TX1 }}>Cancel</button>
          <button type="button" onClick={submit} style={{ background: ACC, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Propose connector</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 11, color: TX2 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
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
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: TX1 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export default GovernmentFilingConnectorTab;
