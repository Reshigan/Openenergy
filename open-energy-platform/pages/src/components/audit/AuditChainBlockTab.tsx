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
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

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
  [key: string]: unknown;
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

const ALL_STATES = [
  'block_proposed', 'segments_collected', 'merkle_built',
  'integrity_verified', 'block_signed', 'anchored', 'published',
  'independently_verifiable', 'reconciled', 'archived',
] as const;

const BRANCH_STATES = [
  'rejected', 'suspended', 'restated', 'forked',
] as const;

const FILTERS = [
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

function getActions(row: AcbRow): ChainAction[] {
  const actions: ChainAction[] = [];

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
  const EMERGENCY_FROM: ChainStatus[] = [
    'block_proposed', 'segments_collected', 'merkle_built',
    'integrity_verified', 'block_signed', 'anchored', 'published',
    'independently_verifiable', 'reconciled', 'suspended', 'restated', 'forked',
  ];

  if (row.chain_status === 'block_proposed') {
    actions.push({
      key: 'collect-segments',
      label: 'Collect segments (auditor — ingest EVM / doc-control / submittal / RFI / change-order leaves)',
      tone: 'primary',
      fields: [
        { key: 'segment_count',      label: 'Segment count (ingested leaves)',  type: 'text',     required: true,  placeholder: String(row.segment_count ?? 0) },
        { key: 'source_chain_count', label: 'Source chain count (1-5)',         type: 'text',     required: false, placeholder: String(row.source_chain_count ?? 0) },
      ],
    });
  }

  if (row.chain_status === 'segments_collected') {
    actions.push({
      key: 'build-merkle',
      label: 'Build Merkle root (auditor — RFC 6962 pairwise SHA-256)',
      tone: 'primary',
      fields: [
        { key: 'merkle_root', label: 'Merkle root (64-char SHA-256 hex)', type: 'text', required: true, placeholder: row.merkle_root ?? '' },
      ],
    });
  }

  if (row.chain_status === 'merkle_built') {
    actions.push({
      key: 'verify-integrity',
      label: 'Verify integrity (auditor — Byzantine 2-of-3 verifier quorum, 5-chain reconciliation)',
      tone: 'primary',
      fields: [
        { key: 'reconciliation_status_w113_evm', label: 'Reconcile EVM chain (true/false)',         type: 'text', required: false, placeholder: 'true' },
        { key: 'reconciliation_status_w114_doc', label: 'Reconcile doc-control chain (true/false)', type: 'text', required: false, placeholder: 'true' },
        { key: 'reconciliation_status_w115_sub', label: 'Reconcile submittal chain (true/false)',   type: 'text', required: false, placeholder: 'true' },
        { key: 'reconciliation_status_w116_rfi', label: 'Reconcile RFI chain (true/false)',         type: 'text', required: false, placeholder: 'true' },
        { key: 'reconciliation_status_w117_co',  label: 'Reconcile change-order chain (true/false)',type: 'text', required: false, placeholder: 'true' },
        { key: 'cross_chain_break_count',        label: 'Cross-chain break count (0 = clean)',           type: 'text', required: false, placeholder: '0' },
      ],
    });
  }

  if (row.chain_status === 'integrity_verified') {
    actions.push({
      key: 'sign-block',
      label: 'Sign block (CISO — Ed25519 / parent_block_hash chain-link)',
      tone: 'primary',
      fields: [
        { key: 'signing_pubkey_fingerprint', label: 'Signing pubkey fingerprint (SHA-256 of pubkey)', type: 'text',     required: false, placeholder: row.signing_pubkey_fingerprint ?? '' },
        { key: 'signature_bytes',            label: 'Signature bytes (base64 Ed25519)',               type: 'text',     required: false, placeholder: row.signature_bytes ?? '' },
        { key: 'parent_block_hash',          label: 'Parent block hash (chain-link; 64-char hex)',    type: 'text',     required: false, placeholder: row.parent_block_hash ?? '' },
      ],
    });
  }

  if (row.chain_status === 'block_signed') {
    actions.push({
      key: 'anchor-block',
      label: 'Anchor block (CISO — RFC 3161 TSA / OpenTimestamps / CT log)',
      tone: 'primary',
      fields: [
        { key: 'anchor_method', label: 'Anchor method (RFC3161 / OpenTimestamps / CTLog / NERSA)', type: 'text', required: false, placeholder: row.anchor_method ?? 'OpenTimestamps' },
        { key: 'anchor_uri',    label: 'Anchor URI (TSA URL or CT log URL)',                       type: 'text', required: false, placeholder: row.anchor_uri ?? '' },
      ],
    });
  }

  if (row.chain_status === 'anchored') {
    actions.push({
      key: 'publish-block',
      label: 'Publish block (CISO — externally verifiable at /api/audit-chain/verify/:height)',
      tone: 'primary',
      fields: [
        { key: 'notes', label: 'Publish note (CISO — normal flow, no regulator crossing)', type: 'textarea', required: false },
      ],
    });
  }

  if (row.chain_status === 'published') {
    actions.push({
      key: 'open-independent-verify',
      label: 'Open independent verify (auditor — 3 external verifiers, 2-of-3 quorum)',
      tone: 'primary',
      fields: [
        { key: 'independent_verifier_count', label: 'Independent verifier count (Byzantine quorum at 2)', type: 'text', required: false, placeholder: String(row.independent_verifier_count ?? 0) },
      ],
    });
  }

  if (row.chain_status === 'independently_verifiable') {
    actions.push({
      key: 'reconcile',
      label: 'Reconcile (auditor — confirm 5-chain reconciliation, zero cross-chain breaks)',
      tone: 'primary',
      fields: [
        { key: 'cross_chain_break_count', label: 'Cross-chain break count (0 = clean reconciliation)', type: 'text', required: false, placeholder: String(row.cross_chain_break_count ?? 0) },
      ],
    });
  }

  if (row.chain_status === 'reconciled') {
    actions.push({
      key: 'archive',
      label: 'Archive (auditor — HARD terminal; clean-close bonus)',
      tone: 'primary',
      fields: [
        { key: 'notes', label: 'Archive note (auditor — HARD terminal)', type: 'textarea', required: false },
      ],
    });
  }

  if (row.chain_status === 'suspended') {
    actions.push({
      key: 'resume',
      label: 'Resume (CISO — back to integrity_verified from suspended)',
      tone: 'primary',
      fields: [
        { key: 'notes', label: 'Resume note (CISO — back to integrity_verified)', type: 'textarea', required: false },
      ],
    });
  }

  if (SUSPEND_FROM.includes(row.chain_status) && row.chain_status !== 'suspended') {
    actions.push({
      key: 'suspend',
      label: 'Suspend (CISO — verification dispute; SOFT, resume to integrity_verified)',
      tone: 'warn',
      fields: [
        { key: 'suspend_reason', label: 'Suspend reason (CISO — verification dispute; SOFT pause)', type: 'textarea', required: true },
      ],
    });
  }

  if (RESTATE_FROM.includes(row.chain_status)) {
    actions.push({
      key: 'restate',
      label: 'Restate (CFO — supersede a published block; crosses regulator monthly + quarterly only = JSE SRL)',
      tone: 'warn',
      cascadeTo: ['regulator'],
      fields: [
        { key: 'restate_reason', label: 'Restate reason (CFO). NOTE: crosses regulator monthly + quarterly only = JSE SRL listed-issuer disclosure.', type: 'textarea', required: true },
      ],
    });
  }

  if (FORK_FROM.includes(row.chain_status)) {
    actions.push({
      key: 'fork',
      label: 'Fork (BoardAudit — hard-line branch)',
      tone: 'danger',
      fields: [
        { key: 'fork_reason', label: 'Fork reason (BoardAudit — hard-line branch)', type: 'textarea', required: true },
      ],
    });
  }

  if (REJECTABLE.includes(row.chain_status)) {
    actions.push({
      key: 'reject',
      label: 'Reject (CFO — integrity failure; crosses regulator EVERY tier when chain-break OR hash-collision)',
      tone: 'danger',
      cascadeTo: ['regulator'],
      fields: [
        { key: 'reject_reason', label: 'Reject reason (CFO). NOTE: crosses regulator EVERY tier when chain-break OR hash-collision flags set.', type: 'textarea', required: true },
      ],
    });
  }

  if (EMERGENCY_FROM.includes(row.chain_status)) {
    actions.push({
      key: 'emergency-seal',
      label: 'EMERGENCY SEAL (BoardAudit — SIGNATURE-CHAIN-BREAK-SEAL: crosses regulator EVERY tier)',
      tone: 'danger',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'fork_reason',                    label: 'EMERGENCY SEAL reason (BoardAudit). NOTE: SIGNATURE-CHAIN-BREAK-SEAL hard line — crosses regulator EVERY tier (NERSA/IPPO/SARB/JSE-SRL).', type: 'textarea', required: true },
        { key: 'signature_chain_break_detected', label: 'Set signature_chain_break_detected (true/false)', type: 'text', required: false, placeholder: 'true' },
        { key: 'hash_collision_suspected',       label: 'Set hash_collision_suspected (true/false)',       type: 'text', required: false, placeholder: 'true' },
      ],
    });
  }

  return actions;
}

function renderDetail(row: AcbRow): React.ReactNode {
  const completeness = row.block_completeness_index_live ?? row.block_completeness_index ?? 0;
  const integrity    = row.integrity_index_live ?? row.integrity_index ?? 0;
  const ageHours     = row.block_age_hours_live ?? row.block_age_hours ?? 0;
  const breaks       = row.cross_chain_break_count ?? 0;
  const quorum       = row.independent_verifier_quorum_met_live ?? !!row.independent_verifier_quorum_met;
  const floorFlags   = row.floor_flag_count_live ?? 0;
  const daysQ        = row.days_to_quarterly_attestation_live ?? row.days_to_quarterly_attestation ?? 0;
  const hashRisk     = row.hash_collision_risk_score_live ?? row.hash_collision_risk_score ?? 0;

  return (
    <div className="space-y-4" style={{ fontSize: 12 }}>
      {/* LIVE battery */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
          LIVE battery (24 fields)
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <DetailPair label="Tier"                    value={row.current_tier} />
          <DetailPair label="Floor flags"             value={String(floorFlags)} />
          <DetailPair label="Authority required"      value={row.authority_required_live ?? row.authority_required ?? '-'} />
          <DetailPair label="Completeness"            value={`${completeness} / 130`} />
          <DetailPair label="Integrity index"         value={`${integrity} / 130`} />
          <DetailPair label="Hash collision risk"     value={String(hashRisk)} />
          <DetailPair label="Health band"             value={row.block_health_band_live ?? row.block_health_band ?? '-'} />
          <DetailPair label="Urgency"                 value={row.urgency_band_live ?? row.urgency_band ?? '-'} />
          <DetailPair label="SLA hours remaining"     value={fmtHoursSla(row.sla_hours_remaining_live)} />
          <DetailPair label="SLA window"              value={fmtHoursSla(row.sla_window_hours)} />
          <DetailPair label="Reg export window"       value={fmtHoursSla(row.regulator_export_window_hours_live ?? row.regulator_export_window_hours)} />
          <DetailPair label="Days to quarterly"       value={`${daysQ}d`} />
          <DetailPair label="Block age"               value={fmtHoursSla(ageHours)} />
          <DetailPair label="Source chains"           value={`${row.source_chain_count}/5`} />
          <DetailPair label="Segments"                value={String(row.segment_count)} />
          <DetailPair label="Verifiers (quorum)"      value={`${row.independent_verifier_count} (${quorum ? 'YES' : 'no'})`} />
          <DetailPair label="Cross-chain breaks"      value={String(breaks)} />
          <DetailPair label="Escalation level"        value={String(row.escalation_level)} />
          <DetailPair label="Reportable"              value={row.is_reportable_flag ? 'YES' : 'no'} />
          <DetailPair label="Reg crossed at"          value={fmtDate(row.regulator_crossed_at)} />
          <DetailPair label="Breach crosses reg"      value={row.breach_crosses_regulator ? 'YES (monthly/quarterly)' : 'no'} />
          <DetailPair label="Bridges met"             value={String([row.bridges_to_w113_evm_chain_live, row.bridges_to_w114_doc_control_chain_live, row.bridges_to_w115_submittal_chain_live, row.bridges_to_w116_rfi_chain_live, row.bridges_to_w117_change_order_chain_live].filter(Boolean).length) + '/5'} />
          <DetailPair label="Anchor method"           value={row.anchor_method ?? '-'} />
          <DetailPair label="Public verify URL"       value="/api/audit-chain/verify/..." />
        </div>
      </div>

      {/* Cryptographic spine */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
          Cryptographic spine
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <DetailPair label="Merkle root"          value={fmtHash(row.merkle_root)} />
          <DetailPair label="Parent block hash"    value={fmtHash(row.parent_block_hash)} />
          <DetailPair label="Block self hash"      value={fmtHash(row.block_self_hash)} />
          <DetailPair label="Signing pubkey fp"    value={fmtHash(row.signing_pubkey_fingerprint)} />
          <DetailPair label="Signature bytes"      value={fmtHash(row.signature_bytes)} />
          <DetailPair label="Anchor URI"           value={row.anchor_uri ?? '-'} />
        </div>
      </div>

      {/* 5-bridge architecture */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
          5-bridge architecture (EVM / doc / sub / RFI / CO)
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <DetailPair label="EVM ref"              value={row.w113_evm_ref ?? '-'} />
          <DetailPair label="Doc-control ref"      value={row.w114_doc_control_ref ?? '-'} />
          <DetailPair label="Submittal ref"        value={row.w115_submittal_ref ?? '-'} />
          <DetailPair label="RFI ref"              value={row.w116_rfi_ref ?? '-'} />
          <DetailPair label="CO ref"               value={row.w117_change_order_ref ?? '-'} />
          <DetailPair label="Regulator inbox ref"  value={row.regulator_inbox_ref ?? '-'} />
          <DetailPair label="Regulator ref"        value={row.regulator_ref ?? '-'} />
          <DetailPair label="Reg crossed at"       value={fmtDate(row.regulator_crossed_at)} />
        </div>
      </div>

      {/* Reconciliation matrix */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
          Reconciliation matrix (5 source chains)
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ['EVM',           !!row.reconciliation_status_w113_evm],
            ['Doc-control',   !!row.reconciliation_status_w114_doc],
            ['Submittals',    !!row.reconciliation_status_w115_sub],
            ['RFIs',          !!row.reconciliation_status_w116_rfi],
            ['Change orders', !!row.reconciliation_status_w117_co],
          ] as [string, boolean][]).map(([label, on]) => (
            <span
              key={label}
              style={{
                display: 'inline-block',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 11,
                fontWeight: 500,
                background: on ? 'color-mix(in oklab, var(--good) 15%, var(--s1))' : BG2,
                color: on ? GOOD : TX3,
                border: `1px solid ${BORDER}`,
              }}
            >
              {label}{on ? ' ✓' : ''}
            </span>
          ))}
        </div>
      </div>

      {/* Floor flags */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
          Floor flags (5) — FLOOR-AT-MONTHLY (1+) / FLOOR-AT-QUARTERLY (2+)
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ['Signature chain break',    !!row.signature_chain_break_detected],
            ['Hash collision suspected', !!row.hash_collision_suspected],
            ['Regulator audit active',   !!row.regulator_audit_active],
            ['Cross-border witness',     !!row.cross_border_witness_required],
            ['SOX 404 pending',          !!row.sox_404_attestation_pending],
          ] as [string, boolean][]).map(([label, on]) => (
            <span
              key={label}
              style={{
                display: 'inline-block',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 11,
                fontWeight: 500,
                background: on ? 'color-mix(in oklab, var(--bad) 15%, var(--s1))' : BG2,
                color: on ? BAD : TX3,
                border: `1px solid ${BORDER}`,
              }}
            >
              {label}{on ? ' ✓' : ''}
            </span>
          ))}
        </div>
      </div>

      {/* Reasons */}
      {(row.reject_reason || row.suspend_reason || row.restate_reason || row.fork_reason || row.reason_code) && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
            Reasons / narrative
          </div>
          <div className="space-y-1" style={{ color: TX1 }}>
            {row.reason_code    && <div><strong>Reason code:</strong> {row.reason_code}</div>}
            {row.reject_reason  && <div><strong>Reject reason:</strong> {row.reject_reason}</div>}
            {row.suspend_reason && <div><strong>Suspend reason:</strong> {row.suspend_reason}</div>}
            {row.restate_reason && <div><strong>Restate reason:</strong> {row.restate_reason}</div>}
            {row.fork_reason    && <div><strong>Fork / emergency-seal reason:</strong> {row.fork_reason}</div>}
          </div>
        </div>
      )}

      {/* Public verify link */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
          Public Merkle-proof verify endpoint (no auth)
        </div>
        <div style={{ fontSize: 11, color: TX2 }}>
          <p style={{ marginBottom: 4 }}>Any third party can replay the Merkle proof + chain link via:</p>
          <a
            href={`/api/audit-chain/verify/${row.block_height}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: MONO, fontSize: 12, color: TX1, textDecoration: 'underline' }}
          >
            /api/audit-chain/verify/{row.block_height}
          </a>
          <p style={{ marginTop: 8, fontSize: 10, color: TX3 }}>
            Returns merkle_root + parent_block_hash + signature + anchor_uri so an external auditor can replay
            inclusion proofs locally. Compatible with RFC 6962 / Certificate Transparency log verifiers and any
            Bitcoin-style block-explorer.
          </p>
        </div>
      </div>
    </div>
  );
}

export function AuditChainBlockTab() {
  const [rows, setRows] = useState<AcbRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

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

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/audit-chain/${rowId}/${key}`, values);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { block: AcbRow; events: AcbEvent[] } }>(`/audit-chain/${id}`);
      const evts = (res.data?.data?.events || []).map((e: AcbEvent) => ({
        id: e.id,
        event_type: e.event_type,
        from_status: e.from_status,
        to_status: e.to_status,
        actor_party: e.actor_party,
        actor_id: e.actor_id,
        notes: e.notes,
        payload: e.payload,
        created_at: e.created_at,
      }));
      setExpandedEvents(prev => ({ ...prev, [id]: evts }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load history');
    }
  }, [expandedEvents]);

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

  return (
    <div style={{ padding: 20, background: BG, minHeight: '100%' }}>
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: TX1, margin: 0 }}>
          Tamper-Evident Audit Chain
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 4, lineHeight: 1.5 }}>
          12-state platform-wide audit chain:
          block_proposed {'→'} segments_collected {'→'} merkle_built {'→'} integrity_verified {'→'} block_signed {'→'} anchored {'→'} published {'→'} independently_verifiable {'→'} reconciled {'→'} archived (HARD terminal),
          with rejected terminal + suspended / restated / forked soft branches.
          INVERTED SLA (HOURS): hourly 1h, daily 6h, weekly 24h, monthly 72h, quarterly 168h.
          FLOOR-AT-MONTHLY on ANY one of 5 flags; 2+ lifts to quarterly.
          SIGNATURE: <strong>emergency_seal crosses regulator EVERY tier</strong>.
          5 bridges: EVM / doc-control / submittals / RFIs / change-orders.
          Public verify: <span style={{ fontFamily: MONO }}>/api/audit-chain/verify/:block_height</span>.
        </p>
      </header>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 10, marginBottom: 12 }}>
        <KpiTile label="Sig-chain breaks"  value={kpis.signature_chain_break_count} tone={kpis.signature_chain_break_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Emergency-sealed"  value={kpis.emergency_seal_count}        tone={kpis.emergency_seal_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Quarterly due"     value={kpis.quarterly_count}             tone={kpis.quarterly_count > 0 ? 'warn' : 'ok'} />
        <KpiTile label="SLA breached"      value={kpis.breached}                    tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Active"            value={kpis.active_count}                tone={kpis.active_count > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Total"             value={kpis.total} />
        <KpiTile label="Block height"      value={kpis.max_block_height} />
        <KpiTile label="Avg integrity"     value={`${kpis.integrity_avg}/130`}      tone={kpis.integrity_avg >= 100 ? 'ok' : kpis.integrity_avg >= 60 ? 'warn' : 'bad'} />
      </div>

      {/* Sub-KPI strip */}
      <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 11, color: TX2 }}>
        <span>Hash collisions: <strong style={{ color: BAD }}>{kpis.hash_collision_suspected_count}</strong></span>
        <span>Reg audits active: <strong style={{ color: WARN }}>{kpis.regulator_audit_active_count}</strong></span>
        <span>Cross-border: <strong style={{ color: WARN }}>{kpis.cross_border_witness_count}</strong></span>
        <span>SOX 404 pending: <strong style={{ color: WARN }}>{kpis.sox_404_pending_count}</strong></span>
        <span>Monthly: <strong style={{ color: WARN }}>{kpis.monthly_count}</strong></span>
        <span>Proposed: <strong>{kpis.proposed_count}</strong></span>
        <span>Collected: <strong>{kpis.collected_count}</strong></span>
        <span>Merkle: <strong>{kpis.merkle_count}</strong></span>
        <span>Verified: <strong>{kpis.verified_count}</strong></span>
        <span>Signed: <strong style={{ color: GOOD }}>{kpis.signed_count}</strong></span>
        <span>Anchored: <strong style={{ color: GOOD }}>{kpis.anchored_count}</strong></span>
        <span>Published: <strong style={{ color: GOOD }}>{kpis.published_count}</strong></span>
        <span>Ind. verifiable: <strong style={{ color: GOOD }}>{kpis.ind_verifiable_count}</strong></span>
        <span>Reconciled: <strong style={{ color: GOOD }}>{kpis.reconciled_count}</strong></span>
        <span>Archived: <strong style={{ color: GOOD }}>{kpis.archived_count}</strong></span>
        <span>Rejected: <strong style={{ color: BAD }}>{kpis.rejected_count}</strong></span>
        <span>Suspended: <strong>{kpis.suspended_count}</strong></span>
        <span>Restated: <strong style={{ color: WARN }}>{kpis.restated_count}</strong></span>
        <span>Forked: <strong style={{ color: BAD }}>{kpis.forked_count}</strong></span>
        <span>Reportable: <strong style={{ color: BAD }}>{kpis.reportable_total}</strong></span>
        <span>Cross-chain breaks: <strong style={{ color: BAD }}>{kpis.cross_chain_break_total}</strong></span>
        <span>Segments total: <strong>{kpis.segment_count_total}</strong></span>
        <span>Completeness avg: <strong>{kpis.completeness_avg}/130</strong></span>
        <span>EVM: <strong>{kpis.w113_bridged_count}</strong></span>
        <span>Doc: <strong>{kpis.w114_bridged_count}</strong></span>
        <span>Sub: <strong>{kpis.w115_bridged_count}</strong></span>
        <span>RFI: <strong>{kpis.w116_bridged_count}</strong></span>
        <span>CO: <strong>{kpis.w117_bridged_count}</strong></span>
      </div>

      {/* Filter pills */}
      <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              borderRadius: 4,
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
              background: filter === f.key ? ACC : BG1,
              color: filter === f.key ? '#fff' : TX2,
              transition: 'background 120ms, color 120ms',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ marginBottom: 12, borderRadius: 6, border: `1px solid ${BAD}40`, background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', padding: '8px 12px', fontSize: 12, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '24px 16px', textAlign: 'center', fontSize: 13, color: TX2 }}>
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '24px 16px', textAlign: 'center', fontSize: 13, color: TX2 }}>
          No audit blocks match.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const integrity    = row.integrity_index_live ?? row.integrity_index ?? 0;
            const ageHours     = row.block_age_hours_live ?? row.block_age_hours ?? 0;
            const breaks       = row.cross_chain_break_count ?? 0;

            const metaLine = (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: MONO }}>{row.block_cadence}</span>
                <span>{row.current_tier}</span>
                <span>Age {fmtHoursSla(ageHours)}</span>
                <span>Integrity {integrity}/130</span>
                {breaks > 0 && <span style={{ color: BAD, fontWeight: 700 }}>Breaks: {breaks}</span>}
                {row.is_reportable_flag && <span style={{ color: BAD, fontWeight: 700, fontSize: 10 }}>REG</span>}
                {!!row.signature_chain_break_detected && <span style={{ color: BAD, fontWeight: 700, fontSize: 10 }}>BRK</span>}
                {!!row.hash_collision_suspected && <span style={{ color: BAD, fontWeight: 700, fontSize: 10 }}>COL</span>}
              </span>
            );

            return (
              <ChainCard
                key={row.id}
                item={{
                  ...row,
                  case_number: `${row.block_number} h${row.block_height}`,
                  sla_breached: !!(row.sla_breached_live || row.sla_breached),
                }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={row.title ?? `Block ${row.block_number}`}
                meta={metaLine}
                actions={getActions(row)}
                onAction={(key, values) => handleAction(row.id, key, values)}
                cascadeTo={[]}
                detail={renderDetail(row)}
                events={expandedEvents[row.id]}
                onExpand={handleExpand}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '8px 12px' }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: 4, border: `1px solid ${BORDER}`, background: BG1, padding: '4px 8px' }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: TX1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

export default AuditChainBlockTab;
