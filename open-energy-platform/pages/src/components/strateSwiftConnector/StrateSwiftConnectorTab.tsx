// Wave 124 - STRATE / SWIFT Settlement Connector.
//
// Phase C wave 3. MONEY-IN / MONEY-OUT financial settlement spine -
// real bidirectional integration to STRATE (SA CSD) + SWIFT MT/MX
// correspondent network + SARB SAMOS RTGS + SADC RTGS + commercial
// bank EFT/ACH gateways.
//
// Mounted at /admin/workstation?tab=strate-swift-connectors for admin,
// /trader/workstation?tab=strate-swift-connectors for trader,
// /lender/workstation?tab=strate-swift-connectors for lender,
// /offtaker/workstation?tab=strate-swift-connectors for offtaker.
//
// Beats: SWIFT Alliance Access + Bottomline B2B + Cyrus + FIS Open
// Payments Hub + ACI Worldwide Universal Payments + TCS BaNCS
// Payments + Volante VolPay + Finastra Payments-as-a-Service +
// Temenos Transact Payments + Murex MX.3 Post-Trade + Calypso
// Treasury + Misys Loan IQ.
//
// 12-state forward + 4 branch lifecycle:
//   connector_proposed -> bic_validated -> bank_handshake_completed ->
//     iso20022_schemas_loaded -> messaging_session_established ->
//     test_messages_validated -> reconciliation_account_bound ->
//     live_settlement_active -> cycle_reconciled -> archived (HARD)
//   any non-terminal -> disconnect -> disconnected (HARD)
//   any non-terminal -> revoke_credential -> credential_revoked (HARD)
//   active states -> suspend -> suspended (SOFT)
//   live -> activate_failover -> failover_active (SOFT)
//
// 5-tier INVERTED SLA polarity (HOURS) - bigger settlement scope =
// MORE time: domestic 168h / multi_bank 240h / strate 360h /
// samos_rtgs 480h / swift_global 720h.
// FLOOR-AT-SAMOS-RTGS on >=1 of 5 flags; FLOOR-AT-SWIFT-GLOBAL >=3.
// Flags: cross_border_payment / sarb_excon_authorization_required /
// fic_act_high_risk_jurisdiction / basel_lcr_tier1_collateral /
// cpmi_iosco_pfmi_principle9_systemic.
//
// SIGNATURE Phase-C regulator crossings:
//   * revoke_credential crosses EVERY tier (W124 SIGNATURE STRATE-
//     SWIFT-CONNECTOR-REVOKE - SARB + FIC Act s28A + SOC report)
//   * activate_failover crosses samos_rtgs + swift_global
//   * disconnect crosses EVERY tier WHEN cpmi_iosco_pfmi_principle9_systemic
//   * authorize_live_settlement crosses swift_global only (SARB ExCon)
//   * settle_cycle crosses EVERY tier WHEN sarb_excon_required AND
//     excon=expired (FIC Act material exposure)
//   * sla_breached samos_rtgs + swift_global only
//
// Write {admin, trader, lender, offtaker}. READ all 9 personas.
// EXTERNAL bank counterparty via mTLS-gated PUBLIC peer endpoint
// (x-mtls-cert-fingerprint header).
//
// 5 bridges (W118 + W120 MANDATORY): W120 reconciliation attestation +
// W68 counterparty margin + W3 settlement P6 + W21 drawdown + W118
// audit block ref.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type SscStatus =
  | 'connector_proposed' | 'bic_validated' | 'bank_handshake_completed'
  | 'iso20022_schemas_loaded' | 'messaging_session_established'
  | 'test_messages_validated' | 'reconciliation_account_bound'
  | 'live_settlement_active' | 'cycle_reconciled' | 'archived'
  | 'disconnected' | 'credential_revoked' | 'suspended' | 'failover_active';

type SscTier = 'domestic_eft' | 'multi_bank_eft' | 'strate_csd' | 'samos_rtgs' | 'swift_global';
type SscUrgency = 'low' | 'medium' | 'high' | 'critical' | 'systemic';
type SscAuthority = 'settlements_clerk' | 'settlements_manager' | 'CFO' | 'CEO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type SscProtocol =
  | 'iso_20022_xml' | 'swift_mt' | 'swift_mx' | 'strate_proprietary'
  | 'samos_rtgs' | 'sadc_rtgs' | 'eft_ach' | 'pcc_eb';
type ExConStatus = 'none' | 'pending' | 'authorized' | 'expired';
type FicKycStatus = 'clean' | 'refresh_due' | 'flagged';

interface SscRow {
  [key: string]: unknown;
  id: string;
  connector_number: string;
  peer_id: string;
  counterparty_name: string | null;
  bic: string | null;
  protocol: SscProtocol | string;
  iso20022_schema_version: string | null;
  swift_user_key_fingerprint: string | null;
  swift_user_key_expiry_at: string | null;
  reconciliation_account_id: string | null;
  endpoint_url: string | null;
  settlement_value_zar_per_cycle: number | null;
  w120_reconciliation_attestation_ref: string | null;
  w68_counterparty_margin_ref: string | null;
  w3_settlement_p6_ref: string | null;
  w21_drawdown_ref: string | null;
  w118_block_ref: string | null;
  cross_border_payment: number;
  sarb_excon_authorization_required: number;
  fic_act_high_risk_jurisdiction: number;
  basel_lcr_tier1_collateral: number;
  cpmi_iosco_pfmi_principle9_systemic: number;
  settlement_messages_per_minute: number | null;
  successful_settlement_count_24h: number | null;
  failed_settlement_count_24h: number | null;
  failure_rate_pct: number | null;
  settlement_value_zar_last_24h: number | null;
  average_settlement_latency_ms: number | null;
  reconciliation_break_count: number | null;
  reconciliation_break_zar: number | null;
  lcr_contribution_pct: number | null;
  nsfr_contribution_pct: number | null;
  excon_authorization_status: ExConStatus | null;
  fic_act_kyc_status: FicKycStatus | null;
  protocol_compliant: number;
  iso27001_controls_ok: number;
  pci_dss_segmentation_ok: number;
  settlement_quality_index: number | null;
  current_tier: SscTier;
  authority_required: SscAuthority | null;
  urgency_band: SscUrgency | null;
  connector_health_band: HealthBand | null;
  title: string | null;
  reason_code: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  regulator_ref: string | null;
  regulator_inbox_ref: string | null;
  chain_status: SscStatus;
  connector_proposed_at: string | null;
  bic_validated_at: string | null;
  bank_handshake_completed_at: string | null;
  iso20022_schemas_loaded_at: string | null;
  messaging_session_established_at: string | null;
  test_messages_validated_at: string | null;
  reconciliation_account_bound_at: string | null;
  live_settlement_active_at: string | null;
  cycle_reconciled_at: string | null;
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
  days_to_key_renewal: number | null;
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
  urgency_band_live?: SscUrgency;
  authority_required_live?: SscAuthority;
  days_to_key_renewal_live?: number;
  floor_flag_count_live?: number;
  floor_at_samos_rtgs_live?: boolean;
  floor_at_swift_global_live?: boolean;
  settlement_quality_index_live?: number;
  connector_health_band_live?: HealthBand;
  bridges_to_w120_reconciliation_attestation_live?: boolean;
  bridges_to_w68_counterparty_margin_live?: boolean;
  bridges_to_w3_settlement_p6_live?: boolean;
  bridges_to_w21_drawdown_live?: boolean;
  bridges_to_w118_audit_chain_live?: boolean;
}

interface SscEvent {
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

const STATE_TONE: Record<SscStatus, { bg: string; fg: string; label: string }> = {
  connector_proposed:           { bg: '#e3e7ec', fg: '#445',    label: 'Proposed' },
  bic_validated:                { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'BIC validated' },
  bank_handshake_completed:     { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Bank handshake' },
  iso20022_schemas_loaded:      { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'ISO 20022' },
  messaging_session_established:{ bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Session' },
  test_messages_validated:      { bg: '#fff4d6', fg: '#a06200', label: 'Test msgs' },
  reconciliation_account_bound: { bg: '#fff4d6', fg: '#a06200', label: 'Recon bound' },
  live_settlement_active:       { bg: '#daf5e2', fg: '#1f6b3a', label: 'Live settlement' },
  cycle_reconciled:             { bg: '#daf5e2', fg: '#1f6b3a', label: 'Cycle reconciled' },
  archived:                     { bg: '#1f5b3a', fg: '#fff',    label: 'Archived' },
  disconnected:                 { bg: '#7a0e0e', fg: '#fff',    label: 'Disconnected' },
  credential_revoked:           { bg: '#7a0e0e', fg: '#fff',    label: 'Cred revoked' },
  suspended:                    { bg: '#e3e7ec', fg: '#445',    label: 'Suspended' },
  failover_active:              { bg: '#fff4d6', fg: '#a06200', label: 'Failover' },
};

const TIER_TONE: Record<SscTier, { bg: string; fg: string; label: string }> = {
  domestic_eft:    { bg: '#e3e7ec', fg: '#557',    label: 'Domestic EFT' },
  multi_bank_eft:  { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Multi-bank EFT' },
  strate_csd:      { bg: '#daf5e2', fg: '#1f6b3a', label: 'STRATE CSD' },
  samos_rtgs:      { bg: '#fff4d6', fg: '#a06200', label: 'SAMOS RTGS' },
  swift_global:    { bg: '#7a0e0e', fg: '#fff',    label: 'SWIFT global' },
};

const HEALTH_TONE: Record<HealthBand, { bg: string; fg: string; label: string }> = {
  green:    { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Green' },
  amber:    { bg: '#fff4d6', fg: '#a06200', label: 'Amber' },
  red:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Red' },
  critical: { bg: '#7a0e0e', fg: '#fff',    label: 'Critical' },
};

const FILTERS_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',          label: 'Active' },
  { key: 'all',             label: 'All' },
  { key: 'reportable',      label: 'Reportable' },
  { key: 'breached',        label: 'SLA breached' },
  { key: 'key_60d',         label: 'Key exp. 60d' },
  { key: 'key_14d',         label: 'Key exp. 14d' },
  { key: 'health_red',      label: 'Health red' },
  { key: 'health_critical', label: 'Health critical' },
  { key: 'swift_floor',     label: 'SWIFT-floor' },
  { key: 'samos_floor',     label: 'SAMOS-floor' },
  { key: 'disconnected',    label: 'Disconnected' },
  { key: 'credential_revoked', label: 'Revoked' },
];

const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'connector_proposed',           label: 'Proposed' },
  { key: 'bic_validated',                label: 'BIC' },
  { key: 'bank_handshake_completed',     label: 'Handshake' },
  { key: 'iso20022_schemas_loaded',      label: 'ISO 20022' },
  { key: 'messaging_session_established',label: 'Session' },
  { key: 'test_messages_validated',      label: 'Test msgs' },
  { key: 'reconciliation_account_bound', label: 'Recon bound' },
  { key: 'live_settlement_active',       label: 'Live' },
  { key: 'cycle_reconciled',             label: 'Reconciled' },
  { key: 'archived',                     label: 'Archived' },
  { key: 'disconnected',                 label: 'Disconnected' },
  { key: 'credential_revoked',           label: 'Revoked' },
  { key: 'suspended',                    label: 'Suspended' },
  { key: 'failover_active',              label: 'Failover' },
];

const FILTERS_TIER: Array<{ key: string; label: string }> = [
  { key: 'tier:domestic_eft',   label: 'Domestic EFT (168h)' },
  { key: 'tier:multi_bank_eft', label: 'Multi-bank EFT (240h)' },
  { key: 'tier:strate_csd',     label: 'STRATE CSD (360h)' },
  { key: 'tier:samos_rtgs',     label: 'SAMOS RTGS (480h)' },
  { key: 'tier:swift_global',   label: 'SWIFT global (720h)' },
];

const FILTERS_PROTOCOL: Array<{ key: string; label: string }> = [
  { key: 'proto:iso_20022_xml',      label: 'ISO 20022 XML' },
  { key: 'proto:swift_mt',           label: 'SWIFT MT' },
  { key: 'proto:swift_mx',           label: 'SWIFT MX' },
  { key: 'proto:strate_proprietary', label: 'STRATE' },
  { key: 'proto:samos_rtgs',         label: 'SAMOS RTGS' },
  { key: 'proto:sadc_rtgs',          label: 'SADC RTGS' },
  { key: 'proto:eft_ach',            label: 'EFT/ACH' },
  { key: 'proto:pcc_eb',             label: 'PCC EB' },
];

const FILTERS_EXCON: Array<{ key: string; label: string }> = [
  { key: 'excon:none',       label: 'ExCon none' },
  { key: 'excon:pending',    label: 'ExCon pending' },
  { key: 'excon:authorized', label: 'ExCon authorized' },
  { key: 'excon:expired',    label: 'ExCon expired' },
];

type ActionKind =
  | 'validate-bic' | 'complete-bank-handshake' | 'load-iso20022-schemas'
  | 'establish-messaging-session' | 'validate-test-messages'
  | 'bind-reconciliation-account' | 'authorize-live-settlement'
  | 'activate-reconciliation' | 'archive' | 'disconnect'
  | 'suspend' | 'resume' | 'revoke-credential' | 'activate-failover'
  | 'settle-cycle';

const ACTION_FOR_STATE: Partial<Record<SscStatus, ActionKind>> = {
  connector_proposed:           'validate-bic',
  bic_validated:                'complete-bank-handshake',
  bank_handshake_completed:     'load-iso20022-schemas',
  iso20022_schemas_loaded:      'establish-messaging-session',
  messaging_session_established:'validate-test-messages',
  test_messages_validated:      'bind-reconciliation-account',
  reconciliation_account_bound: 'authorize-live-settlement',
  live_settlement_active:       'settle-cycle',
  cycle_reconciled:             'archive',
  suspended:                    'resume',
  failover_active:              'authorize-live-settlement',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'validate-bic':                'Validate BIC (settlements clerk - ISO 9362 BIC + counterparty)',
  'complete-bank-handshake':     'Complete handshake (settlements clerk - endpoint + recon acct)',
  'load-iso20022-schemas':       'Load ISO 20022 (settlements clerk - pacs/camt/pain/admi/auth)',
  'establish-messaging-session': 'Establish session (settlements clerk - SWIFT user-key + mTLS)',
  'validate-test-messages':      'Validate test msgs (settlements clerk - latency + throughput)',
  'bind-reconciliation-account': 'Bind recon account (settlements clerk - W120 attestation pair)',
  'authorize-live-settlement':   'AUTHORIZE LIVE (settlements mgr - SWIFT global crosses SARB ExCon)',
  'activate-reconciliation':     'Activate reconciliation (CFO - cycle tie-out)',
  'archive':                     'Archive (CEO - HARD terminal, retire connector)',
  'disconnect':                  'DISCONNECT (CFO - HARD; crosses EVERY tier WHEN CPMI systemic)',
  'suspend':                     'Suspend (settlements mgr - SARB maintenance window, SOFT)',
  'resume':                      'Resume (settlements mgr - exit maintenance)',
  'revoke-credential':           'REVOKE CREDENTIAL (SIGNATURE - W124 crosses EVERY tier; SARB + FIC Act s28A + SOC + Basel III)',
  'activate-failover':           'Activate failover (settlements mgr - primary to secondary BIC; samos/swift cross)',
  'settle-cycle':                'Settle cycle (settlements mgr - settlement run + recon update; FIC Act if excon expired)',
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

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  if (n >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}b`;
  if (n >= 1_000_000)     return `R${(n / 1_000_000).toFixed(2)}m`;
  if (n >= 1_000)         return `R${(n / 1_000).toFixed(1)}k`;
  return `R${n.toFixed(0)}`;
}

function fmtProto(p: SscProtocol | string | null | undefined): string {
  if (!p) return '-';
  return String(p).replace(/_/g, ' ').toUpperCase();
}

interface KpiSummary {
  total: number;
  active_count: number;
  proposed_count: number;
  bic_validated_count: number;
  handshake_count: number;
  schemas_count: number;
  session_count: number;
  test_msg_count: number;
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
  w120_bridged_count: number;
  w68_bridged_count: number;
  w3_bridged_count: number;
  w21_bridged_count: number;
  w118_bridged_count: number;
  settlement_quality_avg: number;
  keys_expiring_within_60d: number;
  keys_expiring_within_14d: number;
}

const EMPTY_KPI: KpiSummary = {
  total: 0, active_count: 0,
  proposed_count: 0, bic_validated_count: 0, handshake_count: 0, schemas_count: 0,
  session_count: 0, test_msg_count: 0, recon_bound_count: 0,
  live_count: 0, reconciled_count: 0, archived_count: 0,
  disconnected_count: 0, revoked_count: 0, suspended_count: 0, failover_count: 0,
  breached: 0, reportable_total: 0, floor_flag_total: 0,
  w120_bridged_count: 0, w68_bridged_count: 0, w3_bridged_count: 0,
  w21_bridged_count: 0, w118_bridged_count: 0,
  settlement_quality_avg: 0,
  keys_expiring_within_60d: 0, keys_expiring_within_14d: 0,
};

interface Props {
  // External / regulator-view: shows disconnected + revoked +
  // reportable rows only, read-only. Used to inspect STRATE-SWIFT-
  // CONNECTOR-REVOKE signature lines under SARB + FIC Act s28A +
  // Basel III + CPMI-IOSCO PFMI Principle 9.
  regulatorView?: boolean;
}

export function StrateSwiftConnectorTab({ regulatorView }: Props = {}) {
  const [rows, setRows] = useState<SscRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(regulatorView ? 'credential_revoked' : 'active');
  const [selected, setSelected] = useState<SscRow | null>(null);
  const [events, setEvents] = useState<SscEvent[]>([]);
  const [showPropose, setShowPropose] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: SscRow[] } & KpiSummary }>('/strate-swift-connector');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          proposed_count: data.proposed_count || 0,
          bic_validated_count: data.bic_validated_count || 0,
          handshake_count: data.handshake_count || 0,
          schemas_count: data.schemas_count || 0,
          session_count: data.session_count || 0,
          test_msg_count: data.test_msg_count || 0,
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
          w120_bridged_count: data.w120_bridged_count || 0,
          w68_bridged_count: data.w68_bridged_count || 0,
          w3_bridged_count: data.w3_bridged_count || 0,
          w21_bridged_count: data.w21_bridged_count || 0,
          w118_bridged_count: data.w118_bridged_count || 0,
          settlement_quality_avg: data.settlement_quality_avg || 0,
          keys_expiring_within_60d: data.keys_expiring_within_60d || 0,
          keys_expiring_within_14d: data.keys_expiring_within_14d || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load STRATE/SWIFT connectors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { connector: SscRow; events: SscEvent[] } }>(`/strate-swift-connector/${id}`);
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
      if (filter === 'key_60d')          return (r.days_to_key_renewal_live ?? 9999) < 60;
      if (filter === 'key_14d')          return (r.days_to_key_renewal_live ?? 9999) < 14;
      if (filter === 'health_red')       return r.connector_health_band_live === 'red';
      if (filter === 'health_critical')  return r.connector_health_band_live === 'critical';
      if (filter === 'swift_floor')      return !!r.floor_at_swift_global_live;
      if (filter === 'samos_floor')      return !!r.floor_at_samos_rtgs_live;
      if (filter.startsWith('tier:'))    return r.current_tier === filter.slice(5);
      if (filter.startsWith('proto:'))   return r.protocol === filter.slice(6);
      if (filter.startsWith('excon:'))   return r.excon_authorization_status === filter.slice(6);
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? EMPTY_KPI;

  const act = useCallback(async (action: ActionKind, row: SscRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'validate-bic') {
        const bic = window.prompt('BIC (ISO 9362, 8 or 11 chars uppercase):', row.bic ?? '');
        if (bic !== null) body.bic = bic;
        const cn = window.prompt('Counterparty name:', row.counterparty_name ?? '');
        if (cn !== null) body.counterparty_name = cn;
      } else if (action === 'complete-bank-handshake') {
        const url = window.prompt('Endpoint URL:', row.endpoint_url ?? '');
        if (url !== null) body.endpoint_url = url;
        const ra = window.prompt('Reconciliation account id:', row.reconciliation_account_id ?? '');
        if (ra !== null) body.reconciliation_account_id = ra;
      } else if (action === 'load-iso20022-schemas') {
        const ver = window.prompt('ISO 20022 schema version (e.g. 2019, 2022.04):', row.iso20022_schema_version ?? '2022.04');
        if (ver !== null) body.iso20022_schema_version = ver;
        body.protocol_compliant = window.confirm('Protocol compliant on schema load?') ? 1 : 0;
      } else if (action === 'establish-messaging-session') {
        const fp = window.prompt('SWIFT user-key fingerprint (SHA-256, lowercase hex):', row.swift_user_key_fingerprint ?? '');
        if (fp !== null) body.swift_user_key_fingerprint = fp;
        const exp = window.prompt('Key expiry ISO date (e.g. 2027-05-31T00:00:00Z):', row.swift_user_key_expiry_at ?? '');
        if (exp !== null) body.swift_user_key_expiry_at = exp;
        body.iso27001_controls_ok = window.confirm('ISO 27001 controls verified?') ? 1 : 0;
        body.pci_dss_segmentation_ok = window.confirm('PCI-DSS segmentation verified?') ? 1 : 0;
      } else if (action === 'validate-test-messages') {
        const lat = window.prompt('Average settlement latency (ms):', String(row.average_settlement_latency_ms ?? 80));
        if (lat !== null) body.average_settlement_latency_ms = Number(lat);
        const mpm = window.prompt('Settlement messages per minute:', String(row.settlement_messages_per_minute ?? 200));
        if (mpm !== null) body.settlement_messages_per_minute = Number(mpm);
      } else if (action === 'bind-reconciliation-account') {
        const w120 = window.prompt('W120 reconciliation attestation ref (MANDATORY pair):', row.w120_reconciliation_attestation_ref ?? '');
        if (w120 !== null) body.w120_reconciliation_attestation_ref = w120;
      } else if (action === 'authorize-live-settlement') {
        const exconCurrent = row.excon_authorization_status ?? 'none';
        const ex = window.prompt(
          'SARB ExCon authorization status (none/pending/authorized/expired):',
          exconCurrent === 'expired' ? 'authorized' : exconCurrent,
        );
        if (ex !== null) body.excon_authorization_status = ex;
        const kyc = window.prompt('FIC Act KYC status (clean/refresh_due/flagged):', row.fic_act_kyc_status ?? 'clean');
        if (kyc !== null) body.fic_act_kyc_status = kyc;
        const note = window.prompt(
          'Go-live notes. NOTE: SIGNATURE - crosses SARB ExCon at swift_global tier.',
          '',
        );
        if (note !== null) body.notes = note;
      } else if (action === 'settle-cycle') {
        const v = window.prompt('Settlement value ZAR (this cycle):', String(row.settlement_value_zar_per_cycle ?? 1_000_000));
        if (v !== null) body.settlement_value_zar_per_cycle = Number(v);
        const succ = window.prompt('Successful settlement count (24h):', String(row.successful_settlement_count_24h ?? 1000));
        if (succ !== null) body.successful_settlement_count_24h = Number(succ);
        const fail = window.prompt('Failed settlement count (24h):', String(row.failed_settlement_count_24h ?? 0));
        if (fail !== null) body.failed_settlement_count_24h = Number(fail);
        const fr = window.prompt('Failure rate %:', String(row.failure_rate_pct ?? 0));
        if (fr !== null) body.failure_rate_pct = Number(fr);
        const w118 = window.prompt('W118 audit block ref (MANDATORY this cycle):', row.w118_block_ref ?? '');
        if (w118 !== null) body.w118_block_ref = w118;
        const note = window.prompt(
          'Cycle notes. NOTE: SIGNATURE - crosses EVERY tier WHEN sarb_excon flag set AND ExCon expired.',
          '',
        );
        if (note !== null) body.notes = note;
      } else if (action === 'activate-reconciliation') {
        const note = window.prompt('Reconciliation notes (CFO sign-off):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'archive') {
        const note = window.prompt('Archive notes (CEO - HARD terminal):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'disconnect') {
        const reason = window.prompt(
          'Disconnect reason. NOTE: HARD terminal - crosses regulator EVERY tier WHEN cpmi_iosco_pfmi_principle9_systemic.',
          row.reason_code ?? 'counterparty_bic_suspended',
        );
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'suspend') {
        const reason = window.prompt('Suspend reason (SARB maintenance?):', row.reason_code ?? 'sarb_maintenance_window');
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'revoke-credential') {
        const reason = window.prompt(
          'Revoke credential reason. NOTE: SIGNATURE - W124 STRATE-SWIFT-CONNECTOR-REVOKE crosses regulator EVERY tier (SARB + FIC Act s28A + SOC report + Basel III LCR breach + CPMI-IOSCO PFMI systemic disclosure).',
          row.reason_code ?? 'swift_user_key_compromised',
        );
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'activate-failover') {
        const note = window.prompt(
          'Failover notes. NOTE: crosses regulator at samos_rtgs + swift_global tiers.',
          '',
        );
        if (note !== null) body.notes = note;
      }
      await api.post(`/strate-swift-connector/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load, loadEvents, selected]);

  const propose = useCallback(async (body: Record<string, unknown>) => {
    try {
      await api.post('/strate-swift-connector', body);
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
          <h2 className="text-base font-semibold text-[#0c2a4d]">STRATE / SWIFT settlement connector (W124)</h2>
          <p className="text-[11px] text-[#4a5568]">
            12-state forward + 4 branch financial settlement spine - ISO 20022 XML / SWIFT MT / SWIFT MX / STRATE / SARB SAMOS RTGS / SADC RTGS / EFT-ACH / PCC EB.
            Beats SWIFT Alliance Access + Bottomline B2B + FIS Open Payments Hub + ACI Worldwide UP + TCS BaNCS Payments + Volante VolPay + Finastra PaaS + Temenos Transact Payments + Murex MX.3.
            INVERTED SLA HOURS (domestic 168 / multi-bank 240 / STRATE 360 / SAMOS 480 / SWIFT 720).
            FLOOR-AT-SAMOS-RTGS {'≥'}1 flag / FLOOR-AT-SWIFT-GLOBAL {'≥'}3 flags. W118 + W120 audit bridges mandatory.
            SIGNATURE: revoke_credential crosses EVERY tier (SARB + FIC Act s28A + SOC report + Basel III LCR + CPMI-IOSCO PFMI Principle 9).
            External bank counterparty reads via mTLS-gated /api/strate-swift-connector/peer/:peer_id with x-mtls-cert-fingerprint header.
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
        <Kpi label="Settlement avg"    value={`${kpis.settlement_quality_avg}/130`} />
      </div>

      {/* Drill rail */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded border border-[#d8dde6] bg-white px-3 py-2 text-[11px] text-[#4a5568]">
        <span>Proposed: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.proposed_count}</span></span>
        <span>BIC: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.bic_validated_count}</span></span>
        <span>Handshake: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.handshake_count}</span></span>
        <span>Schemas: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.schemas_count}</span></span>
        <span>Session: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.session_count}</span></span>
        <span>Test msgs: <span className="font-semibold text-[#a06200]">{kpis.test_msg_count}</span></span>
        <span>Recon bound: <span className="font-semibold text-[#a06200]">{kpis.recon_bound_count}</span></span>
        <span>Reconciled: <span className="font-semibold text-[#1f6b3a]">{kpis.reconciled_count}</span></span>
        <span>Archived: <span className="font-semibold text-[#1f5b3a]">{kpis.archived_count}</span></span>
        <span>Suspended: <span className="font-semibold text-[#6b7685]">{kpis.suspended_count}</span></span>
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Floor flags: <span className="font-semibold text-[#a06200]">{kpis.floor_flag_total}</span></span>
        <span>Key {'<'}60d: <span className="font-semibold text-[#a06200]">{kpis.keys_expiring_within_60d}</span></span>
        <span>Key {'<'}14d: <span className="font-semibold text-[#9b1f1f]">{kpis.keys_expiring_within_14d}</span></span>
        <span>W118: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w118_bridged_count}</span></span>
        <span>W120: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w120_bridged_count}</span></span>
        <span>W68: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w68_bridged_count}</span></span>
        <span>W3: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w3_bridged_count}</span></span>
        <span>W21: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w21_bridged_count}</span></span>
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

      {/* Row 2: lifecycle */}
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

      {/* Row 4: protocols */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_PROTOCOL.map((f) => (
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

      {/* Row 5: ExCon */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS_EXCON.map((f) => (
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Connector #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Counterparty</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Protocol</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Health</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Value</th>
                <th className="px-3 py-2 font-semibold text-center" style={{ color: 'oklch(0.46 0.16 55)' }}>Quality</th>
                <th className="px-3 py-2 font-semibold text-center" style={{ color: 'oklch(0.46 0.16 55)' }}>Key</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)] text-center">Flags</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.current_tier];
                const health = HEALTH_TONE[r.connector_health_band_live ?? r.connector_health_band ?? 'green'];
                const quality = r.settlement_quality_index_live ?? r.settlement_quality_index ?? 0;
                const keyDays = r.days_to_key_renewal_live ?? r.days_to_key_renewal ?? null;
                const flags = r.floor_flag_count_live ?? 0;
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
                      {r.floor_at_swift_global_live ? <span className="ml-1 text-[9px] font-semibold text-[#7a0e0e]">SWIFT</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[oklch(0.46_0.16_55)]">
                      {r.counterparty_name ?? '-'}
                      {r.bic ? <div className="text-[10px] text-[#6b7685] font-mono">{r.bic}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-mono text-[oklch(0.46_0.16_55)]">
                      {fmtProto(r.protocol)}
                      {r.iso20022_schema_version ? <div className="text-[10px] text-[#6b7685]">{r.iso20022_schema_version}</div> : null}
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
                    <td className="px-3 py-2 text-right tabular-nums text-[11px] text-[#0c2a4d]">
                      {fmtZar(r.settlement_value_zar_per_cycle)}
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums ${quality >= 100 ? 'text-[#1f5b3a]' : quality >= 60 ? 'text-[#a06200]' : 'text-[#9b1f1f] font-semibold'}`}>
                      {quality}/130
                    </td>
                    <td className={`px-3 py-2 text-center text-[10px] uppercase tracking-wider ${keyDays != null && keyDays < 14 ? 'text-[#9b1f1f] font-semibold' : keyDays != null && keyDays < 60 ? 'text-[#a06200]' : 'text-[#4a5568]'}`}>
                      {keyDays != null ? `${keyDays}d` : '-'}
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
                <tr><td colSpan={11} className="px-3 py-6 text-center text-[#4a5568]">No connectors match.</td></tr>
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
  row: SscRow;
  events: SscEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: SscRow) => void;
  regulatorView: boolean;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status] ?? null;
  const quality = row.settlement_quality_index_live ?? row.settlement_quality_index ?? 0;
  const keyDays = row.days_to_key_renewal_live ?? row.days_to_key_renewal ?? null;
  const flags   = row.floor_flag_count_live ?? 0;

  // Active non-terminal set for branch actions.
  const ACTIVE_NON_TERMINAL: SscStatus[] = [
    'connector_proposed', 'bic_validated', 'bank_handshake_completed',
    'iso20022_schemas_loaded', 'messaging_session_established',
    'test_messages_validated', 'reconciliation_account_bound',
    'live_settlement_active', 'cycle_reconciled',
    'suspended', 'failover_active',
  ];
  const SUSPEND_FROM: SscStatus[] = [
    'bic_validated', 'bank_handshake_completed', 'iso20022_schemas_loaded',
    'messaging_session_established', 'test_messages_validated',
    'reconciliation_account_bound', 'live_settlement_active', 'cycle_reconciled',
  ];
  const FAILOVER_FROM: SscStatus[] = ['live_settlement_active', 'cycle_reconciled'];
  const SETTLE_FROM: SscStatus[]   = ['live_settlement_active', 'cycle_reconciled'];
  const DISCONNECT_FROM = ACTIVE_NON_TERMINAL;
  const REVOKE_FROM = ACTIVE_NON_TERMINAL;

  const canSuspend    = SUSPEND_FROM.includes(row.chain_status);
  const canFailover   = FAILOVER_FROM.includes(row.chain_status);
  const canSettle     = SETTLE_FROM.includes(row.chain_status);
  const canDisconnect = DISCONNECT_FROM.includes(row.chain_status);
  const canRevoke     = REVOKE_FROM.includes(row.chain_status);

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
            <div className="text-[11px] uppercase tracking-wider text-[#6b7685]">
              {fmtProto(row.protocol)} {'•'} {row.current_tier.replace(/_/g, ' ')}
              {row.bic ? <> {'•'} {row.bic}</> : null}
              {row.settlement_value_zar_per_cycle != null ? <> {'•'} {fmtZar(row.settlement_value_zar_per_cycle)}/cycle</> : null}
            </div>
            <h3 className="text-lg font-semibold text-[#0c2a4d]">{row.connector_number}</h3>
            <p className="text-[11px] text-[#4a5568]">
              {row.title || 'STRATE/SWIFT settlement connector'} {'•'} peer <span className="font-mono">{row.peer_id}</span>
              {row.counterparty_name ? <> {'•'} {row.counterparty_name}</> : null}
              {row.endpoint_url ? <> {'•'} <span className="font-mono text-[10px]">{row.endpoint_url}</span></> : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1 text-[12px] text-[oklch(0.46_0.16_55)] hover:bg-[#f3f5f9]">Close</button>
        </div>

        {/* 4 scoring indexes */}
        <div className="mb-3 grid grid-cols-4 gap-2">
          <Kpi label="Settlement quality" value={`${quality}/130`} tone={quality >= 100 ? 'ok' : quality >= 60 ? 'warn' : 'bad'} />
          <Kpi label="Key days" value={keyDays != null ? `${keyDays}d` : '-'} tone={keyDays != null && keyDays < 14 ? 'bad' : keyDays != null && keyDays < 60 ? 'warn' : 'ok'} />
          <Kpi label="Floor flags" value={flags} tone={flags >= 3 ? 'bad' : flags >= 1 ? 'warn' : 'ok'} />
          <Kpi label="SLA window" value={`${row.sla_target_hours}h`} />
        </div>

        {/* Settlement battery */}
        <div className="mb-3 grid grid-cols-4 gap-2 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Msgs/min</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.settlement_messages_per_minute ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Successful 24h</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.successful_settlement_count_24h ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Failed 24h</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.failed_settlement_count_24h ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Failure %</div>
            <div className={`font-mono text-[12px] ${(row.failure_rate_pct ?? 0) > 2 ? 'text-[#9b1f1f] font-semibold' : (row.failure_rate_pct ?? 0) > 1 ? 'text-[#a06200]' : 'text-[#1f5b3a]'}`}>{row.failure_rate_pct ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Value 24h</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{fmtZar(row.settlement_value_zar_last_24h)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Latency</div>
            <div className={`font-mono text-[12px] ${(row.average_settlement_latency_ms ?? 0) > 300 ? 'text-[#9b1f1f] font-semibold' : (row.average_settlement_latency_ms ?? 0) > 150 ? 'text-[#a06200]' : 'text-[#0c2a4d]'}`}>{row.average_settlement_latency_ms ?? '-'} ms</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Recon breaks</div>
            <div className={`font-mono text-[12px] ${(row.reconciliation_break_count ?? 0) > 0 ? 'text-[#a06200]' : 'text-[#0c2a4d]'}`}>{row.reconciliation_break_count ?? 0}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Break ZAR</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{fmtZar(row.reconciliation_break_zar)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">LCR contrib</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.lcr_contribution_pct ?? '-'} %</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">NSFR contrib</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.nsfr_contribution_pct ?? '-'} %</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">ExCon</div>
            <div className={`font-mono text-[12px] ${row.excon_authorization_status === 'authorized' ? 'text-[#1f5b3a]' : row.excon_authorization_status === 'pending' ? 'text-[#a06200]' : row.excon_authorization_status === 'expired' ? 'text-[#9b1f1f] font-semibold' : 'text-[#4a5568]'}`}>{row.excon_authorization_status ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">FIC Act KYC</div>
            <div className={`font-mono text-[12px] ${row.fic_act_kyc_status === 'clean' ? 'text-[#1f5b3a]' : row.fic_act_kyc_status === 'refresh_due' ? 'text-[#a06200]' : row.fic_act_kyc_status === 'flagged' ? 'text-[#9b1f1f] font-semibold' : 'text-[#4a5568]'}`}>{row.fic_act_kyc_status ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Protocol</div>
            <div className={`font-mono text-[12px] ${row.protocol_compliant ? 'text-[#1f5b3a]' : 'text-[#a06200]'}`}>{row.protocol_compliant ? 'COMPLIANT' : 'NO'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">ISO 27001</div>
            <div className={`font-mono text-[12px] ${row.iso27001_controls_ok ? 'text-[#1f5b3a]' : 'text-[#a06200]'}`}>{row.iso27001_controls_ok ? 'OK' : 'NO'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">PCI-DSS seg</div>
            <div className={`font-mono text-[12px] ${row.pci_dss_segmentation_ok ? 'text-[#1f5b3a]' : 'text-[#a06200]'}`}>{row.pci_dss_segmentation_ok ? 'OK' : 'NO'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Key expiry</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{fmtDate(row.swift_user_key_expiry_at)}</div>
          </div>
        </div>

        {/* Floor flags */}
        <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">
            Floor flags ({flags}/5) - FLOOR-AT-SAMOS-RTGS {'≥'}1, FLOOR-AT-SWIFT-GLOBAL {'≥'}3
          </div>
          <div className="grid grid-cols-5 gap-2">
            <FlagPill on={!!row.cross_border_payment} label="Cross-border" />
            <FlagPill on={!!row.sarb_excon_authorization_required} label="SARB ExCon" />
            <FlagPill on={!!row.fic_act_high_risk_jurisdiction} label="FIC Act HR" />
            <FlagPill on={!!row.basel_lcr_tier1_collateral} label="Basel LCR T1" />
            <FlagPill on={!!row.cpmi_iosco_pfmi_principle9_systemic} label="CPMI PFMI 9" />
          </div>
        </div>

        {/* Bridges */}
        <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Cross-chain bridges (W118 + W120 mandatory)</div>
          <div className="grid grid-cols-5 gap-2">
            <BridgePill on={!!row.bridges_to_w118_audit_chain_live} label="W118 audit" />
            <BridgePill on={!!row.bridges_to_w120_reconciliation_attestation_live} label="W120 attest" />
            <BridgePill on={!!row.bridges_to_w68_counterparty_margin_live} label="W68 margin" />
            <BridgePill on={!!row.bridges_to_w3_settlement_p6_live} label="W3 settlement" />
            <BridgePill on={!!row.bridges_to_w21_drawdown_live} label="W21 drawdown" />
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
            {canSettle && row.chain_status !== 'cycle_reconciled' && renderAct('settle-cycle', 'Settle cycle', 'primary')}
            {row.chain_status === 'cycle_reconciled' && renderAct('settle-cycle', 'Settle cycle', 'plain')}
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
                <div className="font-semibold text-[oklch(0.46_0.16_55)]">{e.event_type}</div>
                <div className="text-[10px] text-[#4a5568]">
                  {e.from_status || '-'} {'→'} {e.to_status || '-'}
                  {e.actor_party ? <> {'•'} {e.actor_party}</> : null}
                  {' '}{'•'} {fmtDate(e.created_at)}
                </div>
                {e.notes && <div className="mt-1 text-[oklch(0.46_0.16_55)]">{e.notes}</div>}
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
      className={`rounded px-2 py-0.5 text-center text-[10px] font-medium ${on ? 'bg-[#c2873a] text-white' : 'bg-[#e3e7ec] text-[#6b7685]'}`}
      title={label}
    >
      {label}
    </span>
  );
}

const PROTOCOL_OPTIONS: Array<{ key: SscProtocol; label: string }> = [
  { key: 'iso_20022_xml',      label: 'ISO 20022 XML' },
  { key: 'swift_mt',           label: 'SWIFT MT' },
  { key: 'swift_mx',           label: 'SWIFT MX' },
  { key: 'strate_proprietary', label: 'STRATE' },
  { key: 'samos_rtgs',         label: 'SAMOS RTGS' },
  { key: 'sadc_rtgs',          label: 'SADC RTGS' },
  { key: 'eft_ach',            label: 'EFT/ACH' },
  { key: 'pcc_eb',             label: 'PCC EB' },
];

function ProposeModal({
  onClose, onSubmit,
}: {
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [peerId, setPeerId] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [bic, setBic] = useState('');
  const [settlementValue, setSettlementValue] = useState('');
  const [protocol, setProtocol] = useState<SscProtocol>('iso_20022_xml');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [title, setTitle] = useState('');
  const [w118, setW118] = useState('');
  const [w120, setW120] = useState('');
  const [w68, setW68]   = useState('');
  const [w3, setW3]     = useState('');
  const [w21, setW21]   = useState('');
  const [crossBorder, setCrossBorder] = useState(false);
  const [excon, setExcon] = useState(false);
  const [ficHigh, setFicHigh] = useState(false);
  const [baselT1, setBaselT1] = useState(false);
  const [cpmi, setCpmi] = useState(false);
  const [regulatorRelevant, setRegulatorRelevant] = useState(false);

  const submit = () => {
    const body: Record<string, unknown> = {
      protocol,
      peer_id: peerId || undefined,
      counterparty_name: counterparty || undefined,
      bic: bic || undefined,
      settlement_value_zar_per_cycle: settlementValue ? Number(settlementValue) : undefined,
      endpoint_url: endpointUrl || undefined,
      title: title || undefined,
      w118_block_ref: w118 || undefined,
      w120_reconciliation_attestation_ref: w120 || undefined,
      w68_counterparty_margin_ref: w68 || undefined,
      w3_settlement_p6_ref: w3 || undefined,
      w21_drawdown_ref: w21 || undefined,
      cross_border_payment: crossBorder ? 1 : 0,
      sarb_excon_authorization_required: excon ? 1 : 0,
      fic_act_high_risk_jurisdiction: ficHigh ? 1 : 0,
      basel_lcr_tier1_collateral: baselT1 ? 1 : 0,
      cpmi_iosco_pfmi_principle9_systemic: cpmi ? 1 : 0,
      regulator_relevant: regulatorRelevant ? 1 : 0,
    };
    onSubmit(body);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded bg-white p-4 text-[12px] text-[oklch(0.46_0.16_55)]">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#0c2a4d]">Propose STRATE / SWIFT connector (W124)</h3>
            <p className="text-[11px] text-[#4a5568]">
              W118 + W120 audit/attestation bridges mandatory. Tier auto-derived from settlement_value_zar_per_cycle with FLOOR-AT-SAMOS-RTGS {'≥'}1 flag and FLOOR-AT-SWIFT-GLOBAL {'≥'}3 flags.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1 text-[12px] text-[oklch(0.46_0.16_55)] hover:bg-[#f3f5f9]">Close</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Peer id (bank counterparty)">
            <input value={peerId} onChange={(e) => setPeerId(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="fnb-corporate-rail" />
          </Field>
          <Field label="Counterparty name">
            <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="First National Bank" />
          </Field>
          <Field label="BIC (ISO 9362, 8 or 11 chars)">
            <input value={bic} onChange={(e) => setBic(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px] font-mono" placeholder="FIRNZAJJXXX" />
          </Field>
          <Field label="Settlement value ZAR / cycle">
            <input value={settlementValue} onChange={(e) => setSettlementValue(e.target.value)} type="number" className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="2500000" />
          </Field>
          <Field label="Protocol">
            <select value={protocol} onChange={(e) => setProtocol(e.target.value as SscProtocol)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]">
              {PROTOCOL_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Endpoint URL">
            <input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="https://swift-gateway.example.za" />
          </Field>
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="FNB ISO 20022 corporate EFT rail" />
          </Field>
          <Field label="W118 block ref (mandatory)">
            <input value={w118} onChange={(e) => setW118(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="audit-block-2026-1234" />
          </Field>
          <Field label="W120 attestation ref (mandatory)">
            <input value={w120} onChange={(e) => setW120(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="ratt-2026-0042" />
          </Field>
          <Field label="W68 counterparty margin ref">
            <input value={w68} onChange={(e) => setW68(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="ccm-2026-0021" />
          </Field>
          <Field label="W3 settlement P6 ref">
            <input value={w3} onChange={(e) => setW3(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="stl-2026-0011" />
          </Field>
          <Field label="W21 drawdown ref">
            <input value={w21} onChange={(e) => setW21(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="dd-2026-0005" />
          </Field>
        </div>

        <div className="mt-3 rounded border border-[#d8dde6] bg-[#f8fafc] p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Floor flags (FLOOR-AT-SAMOS-RTGS {'≥'}1, FLOOR-AT-SWIFT-GLOBAL {'≥'}3)</div>
          <div className="grid grid-cols-3 gap-2">
            <Checkbox checked={crossBorder} onChange={setCrossBorder} label="Cross-border payment" />
            <Checkbox checked={excon} onChange={setExcon} label="SARB ExCon required" />
            <Checkbox checked={ficHigh} onChange={setFicHigh} label="FIC Act high-risk jurisdiction" />
            <Checkbox checked={baselT1} onChange={setBaselT1} label="Basel LCR Tier-1 collateral" />
            <Checkbox checked={cpmi} onChange={setCpmi} label="CPMI-IOSCO PFMI 9 systemic" />
            <Checkbox checked={regulatorRelevant} onChange={setRegulatorRelevant} label="Regulator relevant" />
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1.5 text-[12px] text-[oklch(0.46_0.16_55)] hover:bg-[#f3f5f9]">Cancel</button>
          <button type="button" onClick={submit} className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#c2873a]">Propose connector</button>
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
    <label className="flex items-center gap-2 text-[11px] text-[oklch(0.46_0.16_55)]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export default StrateSwiftConnectorTab;
