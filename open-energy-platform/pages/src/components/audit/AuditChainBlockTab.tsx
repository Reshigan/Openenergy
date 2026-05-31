// Wave 118 - Hash-Chain Audit Trees & Tamper-Evident Ledger.
//
// FIRST Phase-B wave - opens the L5 regulator-grade hardening series.
// W118 is the platform-wide tamper-evident cross-chain audit tree -
// sister of cascade.ts. Mounted at /admin-platform/workstation?tab=
// audit-chain. Public Merkle-proof verify endpoint at
// /api/audit-chain/verify/:block_height (no auth required) lets any
// third-party regulator/auditor confirm a block.
//
// Beats NIST SP 800-92 reference + RFC 6962 Certificate Transparency
// + Bitcoin-style chained-block hashing + XBRL audit pack + IFRS
// audit-trail + SOC 2 Type II CC7.2 + AICPA TSC + COSO + NERSA s14
// + POPIA s14 + JSE SRL listed-issuer + RFC 3161 TSA +
// OpenTimestamps protocol.
//
// 12-state forward + 4 branch lifecycle:
//   block_proposed -> segments_collected -> merkle_built ->
//     integrity_verified -> block_signed -> anchored -> published ->
//     independently_verifiable -> reconciled -> archived (HARD)
//   any non-terminal -> reject -> rejected
//   verification dispute -> suspend -> suspended (SOFT, resume to
//     integrity_verified)
//   post-correction supersede -> restate -> restated (SOFT)
//   emergency hard line -> fork / emergency_seal -> forked
//
// 5-tier INVERTED SLA polarity (HOURS) - larger block volume = MORE
// cryptographic verification time:
//   hourly 1h / daily 6h / weekly 24h / monthly 72h / quarterly 168h.
// FLOOR-AT-MONTHLY on >=1 of 5 contextual flags; >=2 lifts to quarterly.
//
// SIGNATURE Phase-B regulator crossings:
//   * emergency_seal crosses EVERY tier (W118 SIGNATURE
//     SIGNATURE-CHAIN-BREAK-SEAL hard line)
//   * reject crosses EVERY tier when signature_chain_break_detected
//     || hash_collision_suspected
//   * restate crosses monthly + quarterly (JSE SRL disclosure)
//   * sla_breached crosses monthly + quarterly
//   * publish_block never crosses (normal flow)
//
// Write {admin ONLY}. READ all 9 personas + external audit_verifier
// pseudo-persona via /api/audit-chain/verify (no auth).
//
// 4-step authority ladder: auditor -> CISO -> CFO -> BoardAudit.
// 5 bridges: W113 EVM / W114 doc / W115 sub / W116 RFI / W117 CO.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'block_proposed' | 'segments_collected' | 'merkle_built'
  | 'integrity_verified' | 'block_signed' | 'anchored' | 'published'
  | 'independently_verifiable' | 'reconciled' | 'archived'
  | 'rejected' | 'suspended' | 'restated' | 'forked';

type AcbTier = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly';
type AcbUrgency = 'low' | 'medium' | 'high' | 'critical';
type Authority = 'auditor' | 'CISO' | 'CFO' | 'BoardAudit';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type Cadence = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly';

interface AcbRow {
  id: string;
  block_height: number;
  block_number: string;
  block_cadence: Cadence;
  w113_evm_ref: string | null;
  w114_doc_control_ref: string | null;
  w115_submittal_ref: string | null;
  w116_rfi_ref: string | null;
  w117_change_order_ref: string | null;
  signature_chain_break_detected: number;
  hash_collision_suspected: number;
  regulator_audit_active: number;
  cross_border_witness_required: number;
  sox_404_attestation_pending: number;
  source_chain_count: number;
  segment_count: number;
  merkle_root: string | null;
  parent_block_hash: string | null;
  block_self_hash: string | null;
  signing_pubkey_fingerprint: string | null;
  signature_bytes: string | null;
  anchor_method: string | null;
  anchor_uri: string | null;
  independent_verifier_count: number;
  independent_verifier_quorum_met: number;
  reconciliation_status_w113_evm: number;
  reconciliation_status_w114_doc: number;
  reconciliation_status_w115_sub: number;
  reconciliation_status_w116_rfi: number;
  reconciliation_status_w117_co: number;
  cross_chain_break_count: number;
  current_tier: AcbTier;
  authority_required: Authority | null;
  urgency_band: string | null;
  block_health_band: HealthBand | null;
  block_completeness_index: number;
  integrity_index: number;
  hash_collision_risk_score: number;
  block_age_hours: number;
  regulator_export_window_hours: number;
  days_to_quarterly_attestation: number;
  title: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  suspend_reason: string | null;
  restate_reason: string | null;
  fork_reason: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  block_proposed_at: string | null;
  segments_collected_at: string | null;
  merkle_built_at: string | null;
  integrity_verified_at: string | null;
  block_signed_at: string | null;
  anchored_at: string | null;
  published_at: string | null;
  independently_verifiable_at: string | null;
  reconciled_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  suspended_at: string | null;
  restated_at: string | null;
  forked_at: string | null;
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
  // Decorated LIVE 24-field battery
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number;
  urgency_band_live?: AcbUrgency;
  authority_required_live?: Authority;
  regulator_export_window_hours_live?: number;
  days_to_quarterly_attestation_live?: number;
  floor_flag_count_live?: number;
  block_completeness_index_live?: number;
  integrity_index_live?: number;
  hash_collision_risk_score_live?: number;
  independent_verifier_quorum_met_live?: boolean;
  block_health_band_live?: HealthBand;
  block_age_hours_live?: number;
  bridges_to_w113_evm_chain_live?: boolean;
  bridges_to_w114_doc_control_chain_live?: boolean;
  bridges_to_w115_submittal_chain_live?: boolean;
  bridges_to_w116_rfi_chain_live?: boolean;
  bridges_to_w117_change_order_chain_live?: boolean;
}

interface AcbEvent {
  id: string;
  block_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  block_proposed:           { bg: '#e3e7ec', fg: '#445',    label: 'Block proposed' },
  segments_collected:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Segments collected' },
  merkle_built:             { bg: '#dbecfb', fg: '#1a3a5c', label: 'Merkle built' },
  integrity_verified:       { bg: '#fff4d6', fg: '#a06200', label: 'Integrity verified' },
  block_signed:             { bg: '#daf5e2', fg: '#1f6b3a', label: 'Block signed' },
  anchored:                 { bg: '#daf5e2', fg: '#1f6b3a', label: 'Anchored' },
  published:                { bg: '#daf5e2', fg: '#1f6b3a', label: 'Published' },
  independently_verifiable: { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Independently verifiable' },
  reconciled:               { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Reconciled' },
  archived:                 { bg: '#1f5b3a', fg: '#fff',    label: 'Archived' },
  rejected:                 { bg: '#7a0e0e', fg: '#fff',    label: 'Rejected' },
  suspended:                { bg: '#e3e7ec', fg: '#445',    label: 'Suspended' },
  restated:                 { bg: '#fff4d6', fg: '#a06200', label: 'Restated' },
  forked:                   { bg: '#7a0e0e', fg: '#fff',    label: 'Forked (emergency seal)' },
};

const TIER_TONE: Record<AcbTier, { bg: string; fg: string; label: string }> = {
  hourly:    { bg: '#e3e7ec', fg: '#557',    label: 'Hourly' },
  daily:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Daily' },
  weekly:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Weekly' },
  monthly:   { bg: '#fff4d6', fg: '#a06200', label: 'Monthly' },
  quarterly: { bg: '#7a0e0e', fg: '#fff',    label: 'Quarterly' },
};

const URGENCY_TONE: Record<AcbUrgency, { bg: string; fg: string; label: string }> = {
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

// Row 1: action / priority filters
const FILTERS_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',          label: 'Active' },
  { key: 'all',             label: 'All' },
  { key: 'reportable',      label: 'Reportable' },
  { key: 'breached',        label: 'SLA breached' },
  { key: 'sig_break',       label: 'Sig-chain break' },
  { key: 'collision',       label: 'Hash collision' },
  { key: 'reg_audit',       label: 'Reg audit active' },
  { key: 'cross_border',    label: 'Cross-border' },
  { key: 'sox_pending',     label: 'SOX 404 pending' },
  { key: 'emergency_seal',  label: 'Emergency-sealed' },
  { key: 'health_red',      label: 'Health red' },
  { key: 'health_critical', label: 'Health critical' },
];

// Row 2: lifecycle stages + tiers + cadences
const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'block_proposed',           label: 'Proposed' },
  { key: 'segments_collected',       label: 'Segments collected' },
  { key: 'merkle_built',             label: 'Merkle built' },
  { key: 'integrity_verified',       label: 'Integrity verified' },
  { key: 'block_signed',             label: 'Signed' },
  { key: 'anchored',                 label: 'Anchored' },
  { key: 'published',                label: 'Published' },
  { key: 'independently_verifiable', label: 'Ind. verifiable' },
  { key: 'reconciled',               label: 'Reconciled' },
  { key: 'archived',                 label: 'Archived' },
  { key: 'rejected',                 label: 'Rejected' },
  { key: 'suspended',                label: 'Suspended' },
  { key: 'restated',                 label: 'Restated' },
  { key: 'forked',                   label: 'Forked' },
  { key: 'hourly',                   label: 'Tier: Hourly' },
  { key: 'daily',                    label: 'Tier: Daily' },
  { key: 'weekly',                   label: 'Tier: Weekly' },
  { key: 'monthly',                  label: 'Tier: Monthly' },
  { key: 'quarterly',                label: 'Tier: Quarterly' },
];

type ActionKind =
  | 'collect-segments' | 'build-merkle' | 'verify-integrity' | 'sign-block'
  | 'anchor-block' | 'publish-block' | 'open-independent-verify' | 'reconcile'
  | 'archive' | 'reject' | 'suspend' | 'resume' | 'restate' | 'fork'
  | 'emergency-seal';

const ACTION_FOR_STATE: Partial<Record<ChainStatus, ActionKind>> = {
  block_proposed:           'collect-segments',
  segments_collected:       'build-merkle',
  merkle_built:             'verify-integrity',
  integrity_verified:       'sign-block',
  block_signed:             'anchor-block',
  anchored:                 'publish-block',
  published:                'open-independent-verify',
  independently_verifiable: 'reconcile',
  reconciled:               'archive',
  suspended:                'resume',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'collect-segments':        'Collect segments (auditor — ingest W113/W114/W115/W116/W117 leaves)',
  'build-merkle':            'Build Merkle root (auditor — RFC 6962 pairwise SHA-256)',
  'verify-integrity':        'Verify integrity (auditor — Byzantine 2-of-3 verifier quorum, 5-chain reconciliation)',
  'sign-block':              'Sign block (CISO — Ed25519 / parent_block_hash chain-link)',
  'anchor-block':            'Anchor block (CISO — RFC 3161 TSA / OpenTimestamps / CT log)',
  'publish-block':           'Publish block (CISO — externally verifiable at /api/audit-chain/verify/:height)',
  'open-independent-verify': 'Open independent verify (auditor — 3 external verifiers, 2-of-3 quorum)',
  'reconcile':               'Reconcile (auditor — confirm 5-chain reconciliation, zero cross-chain breaks)',
  'archive':                 'Archive (auditor — HARD terminal; clean-close bonus)',
  'reject':                  'Reject (CFO — integrity failure; crosses regulator EVERY tier when chain-break OR hash-collision)',
  'suspend':                 'Suspend (CISO — verification dispute; SOFT, resume to integrity_verified)',
  'resume':                  'Resume (CISO — back to integrity_verified from suspended)',
  'restate':                 'Restate (CFO — supersede a published block; crosses regulator monthly + quarterly only = JSE SRL)',
  'fork':                    'Fork (BoardAudit — hard-line branch)',
  'emergency-seal':          'EMERGENCY SEAL (BoardAudit — W118 SIGNATURE SIGNATURE-CHAIN-BREAK-SEAL: crosses regulator EVERY tier)',
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

function fmtHash(s: string | null | undefined): string {
  if (!s) return '-';
  if (s.length <= 16) return s;
  return `${s.slice(0, 8)}...${s.slice(-8)}`;
}

interface KpiSummary {
  total: number;
  active_count: number;
  proposed_count: number;
  collected_count: number;
  merkle_count: number;
  verified_count: number;
  signed_count: number;
  anchored_count: number;
  published_count: number;
  ind_verifiable_count: number;
  reconciled_count: number;
  archived_count: number;
  rejected_count: number;
  suspended_count: number;
  restated_count: number;
  forked_count: number;
  quarterly_count: number;
  monthly_count: number;
  breached: number;
  reportable_total: number;
  signature_chain_break_count: number;
  hash_collision_suspected_count: number;
  regulator_audit_active_count: number;
  cross_border_witness_count: number;
  sox_404_pending_count: number;
  emergency_seal_count: number;
  w113_bridged_count: number;
  w114_bridged_count: number;
  w115_bridged_count: number;
  w116_bridged_count: number;
  w117_bridged_count: number;
  completeness_avg: number;
  integrity_avg: number;
  segment_count_total: number;
  cross_chain_break_total: number;
  max_block_height: number;
}

const EMPTY_KPI: KpiSummary = {
  total: 0, active_count: 0, proposed_count: 0, collected_count: 0,
  merkle_count: 0, verified_count: 0, signed_count: 0, anchored_count: 0,
  published_count: 0, ind_verifiable_count: 0, reconciled_count: 0,
  archived_count: 0, rejected_count: 0, suspended_count: 0,
  restated_count: 0, forked_count: 0,
  quarterly_count: 0, monthly_count: 0,
  breached: 0, reportable_total: 0,
  signature_chain_break_count: 0, hash_collision_suspected_count: 0,
  regulator_audit_active_count: 0, cross_border_witness_count: 0,
  sox_404_pending_count: 0, emergency_seal_count: 0,
  w113_bridged_count: 0, w114_bridged_count: 0, w115_bridged_count: 0,
  w116_bridged_count: 0, w117_bridged_count: 0,
  completeness_avg: 0, integrity_avg: 0,
  segment_count_total: 0, cross_chain_break_total: 0, max_block_height: 0,
};

export function AuditChainBlockTab() {
  const [rows, setRows] = useState<AcbRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<AcbRow | null>(null);
  const [events, setEvents] = useState<AcbEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: AcbRow[] } & KpiSummary }>('/audit-chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          proposed_count: data.proposed_count || 0,
          collected_count: data.collected_count || 0,
          merkle_count: data.merkle_count || 0,
          verified_count: data.verified_count || 0,
          signed_count: data.signed_count || 0,
          anchored_count: data.anchored_count || 0,
          published_count: data.published_count || 0,
          ind_verifiable_count: data.ind_verifiable_count || 0,
          reconciled_count: data.reconciled_count || 0,
          archived_count: data.archived_count || 0,
          rejected_count: data.rejected_count || 0,
          suspended_count: data.suspended_count || 0,
          restated_count: data.restated_count || 0,
          forked_count: data.forked_count || 0,
          quarterly_count: data.quarterly_count || 0,
          monthly_count: data.monthly_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          signature_chain_break_count: data.signature_chain_break_count || 0,
          hash_collision_suspected_count: data.hash_collision_suspected_count || 0,
          regulator_audit_active_count: data.regulator_audit_active_count || 0,
          cross_border_witness_count: data.cross_border_witness_count || 0,
          sox_404_pending_count: data.sox_404_pending_count || 0,
          emergency_seal_count: data.emergency_seal_count || 0,
          w113_bridged_count: data.w113_bridged_count || 0,
          w114_bridged_count: data.w114_bridged_count || 0,
          w115_bridged_count: data.w115_bridged_count || 0,
          w116_bridged_count: data.w116_bridged_count || 0,
          w117_bridged_count: data.w117_bridged_count || 0,
          completeness_avg: data.completeness_avg || 0,
          integrity_avg: data.integrity_avg || 0,
          segment_count_total: data.segment_count_total || 0,
          cross_chain_break_total: data.cross_chain_break_total || 0,
          max_block_height: data.max_block_height || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load audit chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { block: AcbRow; events: AcbEvent[] } }>(`/audit-chain/${id}`);
      if (res.data?.data?.block) setSelected(res.data.data.block);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')             return true;
      if (filter === 'active')          return !r.is_terminal;
      if (filter === 'reportable')      return r.is_reportable_flag;
      if (filter === 'breached')        return r.sla_breached_live;
      if (filter === 'sig_break')       return !!r.signature_chain_break_detected;
      if (filter === 'collision')       return !!r.hash_collision_suspected;
      if (filter === 'reg_audit')       return !!r.regulator_audit_active;
      if (filter === 'cross_border')    return !!r.cross_border_witness_required;
      if (filter === 'sox_pending')     return !!r.sox_404_attestation_pending;
      if (filter === 'emergency_seal')  return r.chain_status === 'forked';
      if (filter === 'health_red')      return r.block_health_band_live === 'red';
      if (filter === 'health_critical') return r.block_health_band_live === 'critical';
      if (['hourly', 'daily', 'weekly', 'monthly', 'quarterly'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? EMPTY_KPI;

  const act = useCallback(async (action: ActionKind, row: AcbRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'collect-segments') {
        const segCount = window.prompt('Segment count (ingested leaves):', String(row.segment_count ?? 0));
        if (segCount === null) return;
        body.segment_count = Number(segCount);
        const srcCount = window.prompt('Source chain count (1-5):', String(row.source_chain_count ?? 0));
        if (srcCount !== null) body.source_chain_count = Number(srcCount);
      } else if (action === 'build-merkle') {
        const root = window.prompt('Merkle root (64-char SHA-256 hex):', row.merkle_root ?? '');
        if (!root) return;
        body.merkle_root = root;
      } else if (action === 'verify-integrity') {
        const w113 = window.confirm('Reconcile W113 EVM chain: OK?');
        body.reconciliation_status_w113_evm = w113;
        const w114 = window.confirm('Reconcile W114 doc-control chain: OK?');
        body.reconciliation_status_w114_doc = w114;
        const w115 = window.confirm('Reconcile W115 submittal chain: OK?');
        body.reconciliation_status_w115_sub = w115;
        const w116 = window.confirm('Reconcile W116 RFI chain: OK?');
        body.reconciliation_status_w116_rfi = w116;
        const w117 = window.confirm('Reconcile W117 change-order chain: OK?');
        body.reconciliation_status_w117_co = w117;
        const breaks = window.prompt('Cross-chain break count (0 = clean):', '0');
        if (breaks !== null) body.cross_chain_break_count = Number(breaks);
      } else if (action === 'sign-block') {
        const fp = window.prompt('Signing pubkey fingerprint (SHA-256 of pubkey):', row.signing_pubkey_fingerprint ?? '');
        if (fp) body.signing_pubkey_fingerprint = fp;
        const sig = window.prompt('Signature bytes (base64 Ed25519):', row.signature_bytes ?? '');
        if (sig) body.signature_bytes = sig;
        const parent = window.prompt('Parent block hash (chain-link; 64-char SHA-256 hex):', row.parent_block_hash ?? '');
        if (parent) body.parent_block_hash = parent;
      } else if (action === 'anchor-block') {
        const method = window.prompt('Anchor method (RFC3161 / OpenTimestamps / CTLog / NERSA):', row.anchor_method ?? 'OpenTimestamps');
        if (method) body.anchor_method = method;
        const uri = window.prompt('Anchor URI (TSA URL or CT log URL):', row.anchor_uri ?? '');
        if (uri) body.anchor_uri = uri;
      } else if (action === 'publish-block') {
        const note = window.prompt('Publish note (CISO — normal flow, no regulator crossing):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'open-independent-verify') {
        const ver = window.prompt('Independent verifier count (Byzantine quorum at 2):', String(row.independent_verifier_count ?? 0));
        if (ver !== null) body.independent_verifier_count = Number(ver);
      } else if (action === 'reconcile') {
        const breaks = window.prompt('Cross-chain break count (0 = clean reconciliation):', String(row.cross_chain_break_count ?? 0));
        if (breaks !== null) body.cross_chain_break_count = Number(breaks);
      } else if (action === 'archive') {
        const note = window.prompt('Archive note (auditor — HARD terminal):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'reject') {
        const reason = window.prompt('Reject reason (CFO). NOTE: crosses regulator EVERY tier when chain-break OR hash-collision flags set.', row.reject_reason ?? '');
        if (!reason) return;
        body.reject_reason = reason;
      } else if (action === 'suspend') {
        const reason = window.prompt('Suspend reason (CISO — verification dispute; SOFT pause):', row.suspend_reason ?? '');
        if (!reason) return;
        body.suspend_reason = reason;
      } else if (action === 'resume') {
        const note = window.prompt('Resume note (CISO — back to integrity_verified):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'restate') {
        const reason = window.prompt('Restate reason (CFO). NOTE: crosses regulator monthly + quarterly only = JSE SRL listed-issuer disclosure.', row.restate_reason ?? '');
        if (!reason) return;
        body.restate_reason = reason;
      } else if (action === 'fork') {
        const reason = window.prompt('Fork reason (BoardAudit — hard-line branch):', row.fork_reason ?? '');
        if (!reason) return;
        body.fork_reason = reason;
      } else if (action === 'emergency-seal') {
        const reason = window.prompt('EMERGENCY SEAL reason (BoardAudit). NOTE: W118 SIGNATURE SIGNATURE-CHAIN-BREAK-SEAL hard line — crosses regulator EVERY tier (NERSA/IPPO/SARB/JSE-SRL).', row.fork_reason ?? '');
        if (!reason) return;
        body.fork_reason = reason;
        const sigBreak = window.confirm('Set signature_chain_break_detected = true?');
        if (sigBreak) body.signature_chain_break_detected = true;
        const collision = window.confirm('Set hash_collision_suspected = true?');
        if (collision) body.hash_collision_suspected = true;
      }
      await api.post(`/audit-chain/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action}`);
    }
  }, [load, loadEvents, selected]);

  return (
    <div className="p-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0c2a4d]">
            Tamper-Evident Audit Chain &mdash; NIST SP 800-92 + ISO 27037 + RFC 6962 CT + Bitcoin chained-block + XBRL + IFRS + SOC 2 CC7.2 + AICPA + COSO + NERSA s14 + POPIA s14 + JSE SRL + RFC 3161 TSA + OpenTimestamps
          </h2>
          <p className="text-xs text-[#4a5568]">
            12-state platform-wide audit chain (W118 Phase-B opener):
            block_proposed {'→'} segments_collected {'→'} merkle_built {'→'} integrity_verified {'→'} block_signed {'→'} anchored {'→'} published {'→'} independently_verifiable {'→'} reconciled {'→'} archived (HARD terminal),
            with rejected terminal + suspended / restated / forked soft branches.
            INVERTED SLA polarity (HOURS): hourly 1h, daily 6h, weekly 24h, monthly 72h, quarterly 168h
            (<em>larger block volume gets MORE cryptographic verification time</em>).
            FLOOR-AT-MONTHLY on ANY one of 5 contextual flags
            (signature_chain_break, hash_collision, regulator_audit, cross-border_witness, SOX-404); 2+ flags lifts to quarterly.
            4-step authority ladder: auditor {'→'} CISO {'→'} CFO {'→'} BoardAudit.
            SIGNATURE: <strong>emergency_seal crosses regulator EVERY tier</strong>
            (W118 SIGNATURE-CHAIN-BREAK-SEAL hard line); reject crosses EVERY tier when chain-break OR hash-collision; restate crosses monthly + quarterly only (JSE SRL);
            publish_block never crosses; SLA breach crosses monthly + quarterly.
            5 bridges: W113 EVM / W114 doc-control / W115 submittals / W116 RFIs / W117 change-orders.
            Public verify endpoint (no auth): <span className="font-mono">/api/audit-chain/verify/:block_height</span>.
            Hourly auto-propose at 5 past; daily reconcile + chain-link verify at 00:45 UTC; quarterly NERSA/IPPO/SARB export 1 Jan / Apr / Jul / Oct at 03:00.
          </p>
        </div>
      </header>

      {/* 8-card KPI strip — action-LEFT (most actionable first) */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Sig-chain breaks"  value={kpis.signature_chain_break_count} tone={kpis.signature_chain_break_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Emergency-sealed"  value={kpis.emergency_seal_count}        tone={kpis.emergency_seal_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Quarterly due"     value={kpis.quarterly_count}             tone={kpis.quarterly_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached"      value={kpis.breached}                    tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Active"            value={kpis.active_count}                tone={kpis.active_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Total"             value={kpis.total} />
        <Kpi label="Block height"      value={kpis.max_block_height} />
        <Kpi label="Avg integrity"     value={`${kpis.integrity_avg}/130`}      tone={kpis.integrity_avg >= 100 ? 'ok' : kpis.integrity_avg >= 60 ? 'warn' : 'bad'} />
      </div>

      {/* Sub-KPI strip — flag-count + bridge counts + cross-chain breaks */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Hash collisions: <span className="font-semibold text-[#9b1f1f]">{kpis.hash_collision_suspected_count}</span></span>
        <span>Reg audits active: <span className="font-semibold text-[#a06200]">{kpis.regulator_audit_active_count}</span></span>
        <span>Cross-border: <span className="font-semibold text-[#a06200]">{kpis.cross_border_witness_count}</span></span>
        <span>SOX 404 pending: <span className="font-semibold text-[#a06200]">{kpis.sox_404_pending_count}</span></span>
        <span>Monthly: <span className="font-semibold text-[#a06200]">{kpis.monthly_count}</span></span>
        <span>Proposed: <span className="font-semibold text-[#445]">{kpis.proposed_count}</span></span>
        <span>Collected: <span className="font-semibold text-[#1a3a5c]">{kpis.collected_count}</span></span>
        <span>Merkle: <span className="font-semibold text-[#1a3a5c]">{kpis.merkle_count}</span></span>
        <span>Verified: <span className="font-semibold text-[#a06200]">{kpis.verified_count}</span></span>
        <span>Signed: <span className="font-semibold text-[#1f6b3a]">{kpis.signed_count}</span></span>
        <span>Anchored: <span className="font-semibold text-[#1f6b3a]">{kpis.anchored_count}</span></span>
        <span>Published: <span className="font-semibold text-[#1f6b3a]">{kpis.published_count}</span></span>
        <span>Ind. verifiable: <span className="font-semibold text-[#1f5b3a]">{kpis.ind_verifiable_count}</span></span>
        <span>Reconciled: <span className="font-semibold text-[#1f5b3a]">{kpis.reconciled_count}</span></span>
        <span>Archived: <span className="font-semibold text-[#1f5b3a]">{kpis.archived_count}</span></span>
        <span>Rejected: <span className="font-semibold text-[#9b1f1f]">{kpis.rejected_count}</span></span>
        <span>Suspended: <span className="font-semibold text-[#6b7685]">{kpis.suspended_count}</span></span>
        <span>Restated: <span className="font-semibold text-[#a06200]">{kpis.restated_count}</span></span>
        <span>Forked: <span className="font-semibold text-[#9b1f1f]">{kpis.forked_count}</span></span>
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Cross-chain breaks: <span className="font-semibold text-[#9b1f1f]">{kpis.cross_chain_break_total}</span></span>
        <span>Segments total: <span className="font-semibold text-[#1a3a5c]">{kpis.segment_count_total}</span></span>
        <span>Completeness avg: <span className="font-semibold text-[#1a3a5c]">{kpis.completeness_avg}/130</span></span>
        <span>W113 (EVM): <span className="font-semibold text-[#1a3a5c]">{kpis.w113_bridged_count}</span></span>
        <span>W114 (doc): <span className="font-semibold text-[#1a3a5c]">{kpis.w114_bridged_count}</span></span>
        <span>W115 (sub): <span className="font-semibold text-[#1a3a5c]">{kpis.w115_bridged_count}</span></span>
        <span>W116 (RFI): <span className="font-semibold text-[#1a3a5c]">{kpis.w116_bridged_count}</span></span>
        <span>W117 (CO): <span className="font-semibold text-[#1a3a5c]">{kpis.w117_bridged_count}</span></span>
      </div>

      {/* Row 1: action / priority pills */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_ACTION.map((f) => (
          <button
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

      {/* Row 2: lifecycle stages + tiers */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS_LIFECYCLE.map((f) => (
          <button
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Block #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Cadence</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Merkle root</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Segments</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Health</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Integrity</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Breaks</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Age</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.current_tier];
                const health = HEALTH_TONE[r.block_health_band_live ?? r.block_health_band ?? 'green'];
                const integrity = r.integrity_index_live ?? r.integrity_index ?? 0;
                const ageHours = r.block_age_hours_live ?? r.block_age_hours ?? 0;
                const breaks = r.cross_chain_break_count ?? 0;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      <div className="text-[11px] font-semibold">{r.block_number}</div>
                      <div className="text-[10px] text-[#6b7685]">h{r.block_height}</div>
                      {r.is_reportable_flag && <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span>}
                      {r.signature_chain_break_detected ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">BRK</span> : null}
                      {r.hash_collision_suspected ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">COL</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[#1a3a5c]">{r.block_cadence}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#4a5568]">{fmtHash(r.merkle_root)}</td>
                    <td className="px-3 py-2 text-center font-mono text-[#1a3a5c]">{r.segment_count}</td>
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
                    <td className={`px-3 py-2 text-center tabular-nums ${integrity >= 100 ? 'text-[#1f5b3a]' : integrity >= 60 ? 'text-[#a06200]' : 'text-[#9b1f1f] font-semibold'}`}>
                      {integrity}/130
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums ${breaks > 0 ? 'text-[#9b1f1f] font-semibold' : 'text-[#1f5b3a]'}`}>
                      {breaks}
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
                <tr><td colSpan={11} className="px-3 py-6 text-center text-[#4a5568]">No audit blocks match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0c2a4d';
  return (
    <div className="rounded border border-[#d8dde6] bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct,
}: {
  row: AcbRow;
  events: AcbEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: AcbRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status] ?? null;
  const completeness = row.block_completeness_index_live ?? row.block_completeness_index;
  const integrity = row.integrity_index_live ?? row.integrity_index;

  const SUSPEND_FROM: ChainStatus[] = [
    'integrity_verified', 'block_signed', 'anchored', 'published',
    'independently_verifiable', 'reconciled', 'suspended',
  ];
  const RESTATE_FROM: ChainStatus[] = [
    'published', 'independently_verifiable', 'reconciled', 'restated',
  ];
  const FORK_FROM: ChainStatus[] = [
    'integrity_verified', 'block_signed', 'anchored', 'published',
    'independently_verifiable', 'reconciled', 'suspended', 'restated', 'forked',
  ];
  const REJECTABLE: ChainStatus[] = [
    'block_proposed', 'segments_collected', 'merkle_built',
    'integrity_verified', 'block_signed', 'anchored', 'published',
    'independently_verifiable', 'reconciled', 'suspended', 'restated', 'forked',
  ];
  // emergency_seal can be triggered from ANY non-terminal state.
  const EMERGENCY_FROM: ChainStatus[] = [
    'block_proposed', 'segments_collected', 'merkle_built',
    'integrity_verified', 'block_signed', 'anchored', 'published',
    'independently_verifiable', 'reconciled', 'suspended', 'restated', 'forked',
  ];

  const canSuspend       = SUSPEND_FROM.includes(row.chain_status);
  const canRestate       = RESTATE_FROM.includes(row.chain_status);
  const canFork          = FORK_FROM.includes(row.chain_status);
  const canReject        = REJECTABLE.includes(row.chain_status);
  const canEmergencySeal = EMERGENCY_FROM.includes(row.chain_status);

  const verifyHref = `/api/audit-chain/verify/${row.block_height}`;

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[896px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.block_number} {'•'} height h{row.block_height}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.title ?? 'Audit chain block'}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.current_tier].label} {'•'} Cadence <span className="font-mono text-[#1a3a5c]">{row.block_cadence}</span>
                {' '}{'•'} Age <span className="font-mono text-[#1a3a5c]">{fmtHoursSla(row.block_age_hours_live ?? row.block_age_hours)}</span>
                {' '}{'•'} Escalations <span className="font-mono text-[#1a3a5c]">{row.escalation_level}</span>
                {' '}{'•'} Completeness <span className="text-[#1a3a5c]">{completeness}/130</span>
                {' '}{'•'} Integrity <span className="text-[#1a3a5c]">{integrity}/130</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded border border-[#d8dde6] bg-white px-2 py-1 text-[12px] text-[#445] hover:bg-[#f3f5f9]"
            >
              Close
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: STATE_TONE[row.chain_status].bg, color: STATE_TONE[row.chain_status].fg }}>
              {STATE_TONE[row.chain_status].label}
            </span>
            {row.urgency_band_live && (
              <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: URGENCY_TONE[row.urgency_band_live].bg, color: URGENCY_TONE[row.urgency_band_live].fg }}>
                {URGENCY_TONE[row.urgency_band_live].label}
              </span>
            )}
            {row.block_health_band_live && (
              <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: HEALTH_TONE[row.block_health_band_live].bg, color: HEALTH_TONE[row.block_health_band_live].fg }}>
                Health: {HEALTH_TONE[row.block_health_band_live].label}
              </span>
            )}
            {row.authority_required_live && (
              <span className="inline-block rounded border border-[#d8dde6] bg-white px-2 py-0.5 text-[#445]">
                Authority: {row.authority_required_live}
              </span>
            )}
            {row.is_reportable_flag && (
              <span className="inline-block rounded bg-[#fde0e0] px-2 py-0.5 font-semibold text-[#9b1f1f]">Reportable</span>
            )}
            {row.regulator_crossed_at && (
              <span className="inline-block rounded bg-[#7a0e0e] px-2 py-0.5 font-semibold text-white">Regulator crossed</span>
            )}
            {row.signature_chain_break_detected ? (
              <span className="inline-block rounded bg-[#7a0e0e] px-2 py-0.5 font-semibold text-white">Signature chain break</span>
            ) : null}
            {row.hash_collision_suspected ? (
              <span className="inline-block rounded bg-[#7a0e0e] px-2 py-0.5 font-semibold text-white">Hash collision suspected</span>
            ) : null}
            {row.regulator_audit_active ? (
              <span className="inline-block rounded bg-[#a06200] px-2 py-0.5 font-semibold text-white">Regulator audit active</span>
            ) : null}
            {row.cross_border_witness_required ? (
              <span className="inline-block rounded bg-[#a06200] px-2 py-0.5 font-semibold text-white">Cross-border witness</span>
            ) : null}
            {row.sox_404_attestation_pending ? (
              <span className="inline-block rounded bg-[#a06200] px-2 py-0.5 font-semibold text-white">SOX 404 pending</span>
            ) : null}
          </div>
        </header>

        <div className="p-5 space-y-4">
          {/* LIVE 24-field battery */}
          <Section title="LIVE battery (24 fields, re-computed every fetch)">
            <Grid>
              <Field label="Tier (re-derived)"          value={TIER_TONE[row.current_tier].label} tone={row.current_tier === 'quarterly' ? 'bad' : row.current_tier === 'monthly' ? 'warn' : 'ok'} />
              <Field label="Floor flags"                value={String(row.floor_flag_count_live ?? 0)} tone={(row.floor_flag_count_live || 0) >= 2 ? 'bad' : (row.floor_flag_count_live || 0) >= 1 ? 'warn' : 'ok'} />
              <Field label="Authority required"         value={row.authority_required_live ?? '-'} />
              <Field label="Completeness"               value={`${completeness} / 130`} tone={completeness >= 90 ? 'ok' : completeness >= 60 ? 'warn' : 'bad'} />
              <Field label="Integrity index"            value={`${integrity} / 130`} tone={integrity >= 100 ? 'ok' : integrity >= 60 ? 'warn' : 'bad'} />
              <Field label="Hash collision risk"        value={String(row.hash_collision_risk_score_live ?? row.hash_collision_risk_score)} tone={(row.hash_collision_risk_score_live ?? row.hash_collision_risk_score) > 5 ? 'bad' : 'ok'} />
              <Field label="Health band"                value={row.block_health_band_live ?? '-'} />
              <Field label="Urgency"                    value={row.urgency_band_live ?? '-'} />
              <Field label="SLA hours remaining"        value={fmtHoursSla(row.sla_hours_remaining_live)} tone={row.sla_breached_live ? 'bad' : 'ok'} />
              <Field label="SLA window"                 value={fmtHoursSla(row.sla_window_hours)} />
              <Field label="Regulator export window"    value={fmtHoursSla(row.regulator_export_window_hours_live)} />
              <Field label="Days to quarterly"          value={`${row.days_to_quarterly_attestation_live ?? row.days_to_quarterly_attestation}d`} tone={(row.days_to_quarterly_attestation_live ?? row.days_to_quarterly_attestation) <= 14 ? 'bad' : (row.days_to_quarterly_attestation_live ?? row.days_to_quarterly_attestation) <= 30 ? 'warn' : 'ok'} />
              <Field label="Block age (live)"           value={fmtHoursSla(row.block_age_hours_live ?? row.block_age_hours)} />
              <Field label="Source chains"              value={`${row.source_chain_count}/5`} tone={row.source_chain_count >= 5 ? 'ok' : row.source_chain_count >= 1 ? 'warn' : 'bad'} />
              <Field label="Segments"                   value={String(row.segment_count)} />
              <Field label="Verifiers (Byzantine)"      value={`${row.independent_verifier_count} (quorum ${row.independent_verifier_quorum_met_live ?? !!row.independent_verifier_quorum_met ? 'YES' : 'no'})`} tone={row.independent_verifier_quorum_met_live ?? !!row.independent_verifier_quorum_met ? 'ok' : 'warn'} />
              <Field label="Cross-chain breaks"         value={String(row.cross_chain_break_count)} tone={row.cross_chain_break_count > 0 ? 'bad' : 'ok'} />
              <Field label="Escalation level"           value={String(row.escalation_level)} tone={row.escalation_level > 0 ? 'warn' : 'ok'} />
              <Field label="Reportable"                 value={row.is_reportable_flag ? 'YES' : 'no'} tone={row.is_reportable_flag ? 'bad' : 'ok'} />
              <Field label="Reg crossed at"             value={fmtDate(row.regulator_crossed_at)} tone={row.regulator_crossed_at ? 'bad' : 'ok'} />
              <Field label="Breach crosses regulator"   value={row.breach_crosses_regulator ? 'YES (monthly/quarterly)' : 'no (hourly/daily/weekly)'} tone={row.breach_crosses_regulator ? 'warn' : 'ok'} />
              <Field label="W118 bridges met"           value={String([row.bridges_to_w113_evm_chain_live, row.bridges_to_w114_doc_control_chain_live, row.bridges_to_w115_submittal_chain_live, row.bridges_to_w116_rfi_chain_live, row.bridges_to_w117_change_order_chain_live].filter(Boolean).length) + '/5'} />
              <Field label="Anchor method"              value={row.anchor_method ?? '-'} />
              <Field label="Public verify URL"          value="/api/audit-chain/verify/..." />
            </Grid>
          </Section>

          {/* Cryptographic spine */}
          <Section title="Cryptographic spine (RFC 6962 + Bitcoin chain-link + Ed25519 + RFC 3161 TSA)">
            <Grid>
              <Field label="Merkle root"                value={fmtHash(row.merkle_root)} />
              <Field label="Parent block hash"          value={fmtHash(row.parent_block_hash)} />
              <Field label="Block self hash"            value={fmtHash(row.block_self_hash)} />
              <Field label="Signing pubkey fp"          value={fmtHash(row.signing_pubkey_fingerprint)} />
              <Field label="Signature bytes"            value={fmtHash(row.signature_bytes)} />
              <Field label="Anchor URI"                 value={row.anchor_uri ?? '-'} />
            </Grid>
          </Section>

          {/* 5 bridges */}
          <Section title="5-bridge architecture (W113 EVM / W114 doc / W115 sub / W116 RFI / W117 CO)">
            <Grid>
              <Field label="W113 EVM ref"          value={row.w113_evm_ref ?? '-'}          tone={row.bridges_to_w113_evm_chain_live ? 'ok' : 'warn'} />
              <Field label="W114 doc-control ref"  value={row.w114_doc_control_ref ?? '-'}  tone={row.bridges_to_w114_doc_control_chain_live ? 'ok' : 'warn'} />
              <Field label="W115 submittal ref"    value={row.w115_submittal_ref ?? '-'}    tone={row.bridges_to_w115_submittal_chain_live ? 'ok' : 'warn'} />
              <Field label="W116 RFI ref"          value={row.w116_rfi_ref ?? '-'}          tone={row.bridges_to_w116_rfi_chain_live ? 'ok' : 'warn'} />
              <Field label="W117 CO ref"           value={row.w117_change_order_ref ?? '-'} tone={row.bridges_to_w117_change_order_chain_live ? 'ok' : 'warn'} />
              <Field label="Regulator inbox ref"   value={row.regulator_inbox_ref ?? '-'} />
              <Field label="Regulator ref"         value={row.regulator_ref ?? '-'} />
              <Field label="Regulator crossed at"  value={fmtDate(row.regulator_crossed_at)} tone={row.regulator_crossed_at ? 'bad' : 'ok'} />
            </Grid>
          </Section>

          {/* Reconciliation matrix */}
          <Section title="Reconciliation matrix (5 source chains)">
            <div className="flex flex-wrap gap-2 text-[11px]">
              <FlagPill label="W113 EVM"           on={!!row.reconciliation_status_w113_evm} />
              <FlagPill label="W114 doc-control"   on={!!row.reconciliation_status_w114_doc} />
              <FlagPill label="W115 submittals"    on={!!row.reconciliation_status_w115_sub} />
              <FlagPill label="W116 RFIs"          on={!!row.reconciliation_status_w116_rfi} />
              <FlagPill label="W117 change orders" on={!!row.reconciliation_status_w117_co} />
            </div>
          </Section>

          {/* Floor flags */}
          <Section title="Floor flags (5) — FLOOR-AT-MONTHLY (1+) / FLOOR-AT-QUARTERLY (2+)">
            <div className="flex flex-wrap gap-2 text-[11px]">
              <FlagPill label="Signature chain break"     on={!!row.signature_chain_break_detected} />
              <FlagPill label="Hash collision suspected"  on={!!row.hash_collision_suspected} />
              <FlagPill label="Regulator audit active"    on={!!row.regulator_audit_active} />
              <FlagPill label="Cross-border witness"      on={!!row.cross_border_witness_required} />
              <FlagPill label="SOX 404 pending"           on={!!row.sox_404_attestation_pending} />
            </div>
          </Section>

          {/* Reasons */}
          {(row.reject_reason || row.suspend_reason || row.restate_reason || row.fork_reason || row.reason_code) && (
            <Section title="Reasons / narrative">
              <div className="space-y-1.5 text-[12px] text-[#1a3a5c]">
                {row.reason_code    && <div><strong>Reason code:</strong> {row.reason_code}</div>}
                {row.reject_reason  && <div><strong>Reject reason:</strong> {row.reject_reason}</div>}
                {row.suspend_reason && <div><strong>Suspend reason:</strong> {row.suspend_reason}</div>}
                {row.restate_reason && <div><strong>Restate reason:</strong> {row.restate_reason}</div>}
                {row.fork_reason    && <div><strong>Fork / emergency-seal reason:</strong> {row.fork_reason}</div>}
              </div>
            </Section>
          )}

          {/* Public verify link */}
          <Section title="Public Merkle-proof verify endpoint (no auth)">
            <div className="text-[11px] text-[#4a5568]">
              <p className="mb-1">Any third party can replay the Merkle proof + chain link via:</p>
              <a href={verifyHref} target="_blank" rel="noopener noreferrer" className="font-mono text-[12px] text-[#1a3a5c] underline">
                {verifyHref}
              </a>
              <p className="mt-2 text-[10px] text-[#6b7685]">
                Returns merkle_root + parent_block_hash + signature + anchor_uri so an external auditor can replay
                inclusion proofs locally. Compatible with RFC 6962 / Certificate Transparency log verifiers and any
                Bitcoin-style block-explorer.
              </p>
            </div>
          </Section>

          {/* Action ladder — primary + overflow */}
          <Section title="Actions">
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <ActionButton tone="primary" onClick={() => onAct(nextAction, row)}>
                  {ACTION_LABEL[nextAction]}
                </ActionButton>
              )}
              {canSuspend && row.chain_status !== 'suspended' && (
                <ActionButton tone="warn" onClick={() => onAct('suspend', row)}>
                  {ACTION_LABEL['suspend']}
                </ActionButton>
              )}
              {canRestate && (
                <ActionButton tone="warn" onClick={() => onAct('restate', row)}>
                  {ACTION_LABEL['restate']}
                </ActionButton>
              )}
              {canFork && (
                <ActionButton tone="danger" onClick={() => onAct('fork', row)}>
                  {ACTION_LABEL['fork']}
                </ActionButton>
              )}
              {canReject && (
                <ActionButton tone="danger" onClick={() => onAct('reject', row)}>
                  {ACTION_LABEL['reject']}
                </ActionButton>
              )}
              {canEmergencySeal && (
                <ActionButton tone="danger" onClick={() => onAct('emergency-seal', row)}>
                  {ACTION_LABEL['emergency-seal']}
                </ActionButton>
              )}
            </div>
          </Section>

          {/* Timeline */}
          <Section title={`Timeline (${events.length} events)`}>
            <div className="space-y-1">
              {events.map((e) => (
                <div key={e.id} className="flex items-baseline gap-3 border-b border-[#e3e7ec] py-1 text-[11px]">
                  <span className="font-mono text-[#6b7685]">{fmtDate(e.created_at)}</span>
                  <span className="font-semibold text-[#1a3a5c]">{e.event_type}</span>
                  {e.from_status && e.to_status && (
                    <span className="text-[#4a5568]">{e.from_status} {'→'} {e.to_status}</span>
                  )}
                  {e.actor_party && <span className="text-[#6b7685]">[{e.actor_party}]</span>}
                  {e.notes && <span className="text-[#4a5568] truncate">{e.notes}</span>}
                </div>
              ))}
              {events.length === 0 && <div className="text-[12px] text-[#6b7685]">No events yet.</div>}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[#1a3a5c]">{title}</h3>
      <div className="rounded border border-[#d8dde6] bg-[#fafbfd] p-3">{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{children}</div>;
}

function Field({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : tone === 'ok' ? '#1f5b3a' : '#1a3a5c';
  return (
    <div className="rounded border border-[#e3e7ec] bg-white px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">{label}</div>
      <div className="text-[12px] font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function FlagPill({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 font-medium ${on ? 'bg-[#fde0e0] text-[#9b1f1f]' : 'bg-[#e3e7ec] text-[#6b7685]'}`}>
      {label}{on ? ' ✓' : ''}
    </span>
  );
}

function ActionButton({
  children, onClick, tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: 'primary' | 'warn' | 'danger';
}) {
  const bg = tone === 'danger' ? '#7a0e0e' : tone === 'warn' ? '#a06200' : '#1a3a5c';
  return (
    <button
      onClick={onClick}
      className="rounded px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90"
      style={{ background: bg }}
    >
      {children}
    </button>
  );
}
