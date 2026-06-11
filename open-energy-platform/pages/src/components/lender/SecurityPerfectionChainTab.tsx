// Wave 69 — Security / Collateral Perfection & Registration lifecycle tab.
//
// A best-in-class project-finance lender takes, PERFECTS and maintains a SECURITY
// PACKAGE that makes the debt enforceable and correctly ranked. In SA law a
// security interest only bites once legally PERFECTED at the right registry —
// Deeds Office (Deeds Registries Act 47/1937 mortgage / notarial bonds; Security
// by Means of Movable Property Act 57/1993), Companies Act 71/2008 s126 + STRATE /
// CSDP (Financial Markets Act 19/2012) for share / dematerialised pledges, cession
// in securitatem debiti by notice, and SARB Exchange Control for non-resident
// beneficiaries. Distinct from the rest of the lender book — W21 releases the
// FUNDS, W30 reconciles USE of proceeds, W38 tests COVENANTS, W45 ENFORCES on
// default, W53 APPROVES the credit, W61 SELLS DOWN the loan; W69 governs whether
// the SECURITY itself is good — taken, registered, ranked and enforceable.
//
//   identified → documentation_pending → executed → lodged_for_registration
//     → registered → perfection_review → perfected → released
//   defect:   {lodged_for_registration, perfection_review} → defective → (re-lodge)
//   overdue:  {documentation_pending, executed, lodged_for_registration, defective}
//               → perfection_overdue → lodged_for_registration | lapsed
//   withdraw: {identified, documentation_pending, executed} → withdrawn
//
// URGENT SLA — the LARGER / more critical the security, the TIGHTER every window.
// Tier (5) by secured value in ZAR with a condition-precedent floor at major. Two-
// party write: the security agent (lender) drives every step; the grantor
// (borrower) executes the security document. The W69 signature — a security item
// that LAPSES crosses to the regulator for EVERY tier; a high-tier item going
// overdue and a high-tier SLA breach cross for major/critical; the registry
// rejecting a critical CP deed crosses for the critical tier only.

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
  | 'identified' | 'documentation_pending' | 'executed' | 'lodged_for_registration'
  | 'registered' | 'perfection_review' | 'perfected' | 'defective'
  | 'perfection_overdue' | 'released' | 'lapsed' | 'withdrawn';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

interface PerfectionRow {
  [key: string]: unknown;
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  facility_id: string | null;
  facility_name: string | null;
  borrower_id: string;
  borrower_name: string;
  project_id: string | null;
  project_name: string | null;
  security_type: string;
  security_description: string | null;
  registry: string | null;
  secured_value_zar: number | null;
  ranking: string | null;
  perfection_critical: number;
  cross_border: number;
  severity_tier: Tier;
  security_agent_id: string | null;
  security_agent_name: string | null;
  grantor_id: string | null;
  grantor_name: string | null;
  document_ref: string | null;
  lodgement_ref: string | null;
  registration_ref: string | null;
  perfection_ref: string | null;
  legal_opinion_ref: string | null;
  release_ref: string | null;
  documentation_basis: string | null;
  execution_basis: string | null;
  lodgement_basis: string | null;
  registration_basis: string | null;
  defect_basis: string | null;
  perfection_basis: string | null;
  overdue_basis: string | null;
  release_basis: string | null;
  lapse_basis: string | null;
  reason_code: string | null;
  resolution_summary: string | null;
  chain_status: ChainStatus;
  identified_at: string;
  documentation_pending_at: string | null;
  executed_at: string | null;
  lodged_for_registration_at: string | null;
  registered_at: string | null;
  perfection_review_at: string | null;
  perfected_at: string | null;
  defective_at: string | null;
  perfection_overdue_at: string | null;
  released_at: string | null;
  lapsed_at: string | null;
  withdrawn_at: string | null;
  perfection_deadline_at: string | null;
  relodge_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: boolean;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  breach_crosses_regulator?: boolean;
}

interface PerfectionEvent {
  id: string;
  perfection_id: string;
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
  open_count: number;
  perfected_count: number;
  defective_count: number;
  overdue_count: number;
  released_count: number;
  lapsed_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  cp_open: number;
  high_open: number;
  total_secured_zar: number;
  perfected_secured_zar: number;
  lapsed_secured_zar: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'identified',
  'documentation_pending',
  'executed',
  'lodged_for_registration',
  'registered',
  'perfection_review',
  'perfected',
  'released',
];
const BRANCH_STATES: readonly string[] = [
  'defective',
  'perfection_overdue',
  'lapsed',
  'withdrawn',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                    label: 'Open' },
  { key: 'all',                     label: 'All' },
  { key: 'minor',                   label: 'Minor' },
  { key: 'moderate',                label: 'Moderate' },
  { key: 'material',                label: 'Material' },
  { key: 'major',                   label: 'Major' },
  { key: 'critical',                label: 'Critical' },
  { key: 'identified',              label: 'Identified' },
  { key: 'documentation_pending',   label: 'Documentation' },
  { key: 'executed',                label: 'Executed' },
  { key: 'lodged_for_registration', label: 'Lodged' },
  { key: 'registered',              label: 'Registered' },
  { key: 'perfection_review',       label: 'Review' },
  { key: 'perfected',               label: 'Perfected' },
  { key: 'defective',               label: 'Defective' },
  { key: 'perfection_overdue',      label: 'Overdue' },
  { key: 'breached',                label: 'SLA breached' },
  { key: 'reportable',              label: 'Reportable' },
  { key: 'released',                label: 'Released' },
  { key: 'lapsed',                  label: 'Lapsed' },
  { key: 'withdrawn',               label: 'Withdrawn' },
];

// ── lookup tables ─────────────────────────────────────────────────────────
const SECURITY_TYPE_LABEL: Record<string, string> = {
  mortgage_bond:         'Mortgage bond',
  special_notarial_bond: 'Special notarial bond',
  general_notarial_bond: 'General notarial bond',
  share_pledge:          'Share pledge',
  cession_rights:        'Cession of rights',
  cession_insurance:     'Cession of insurance',
  cession_accounts:      'Cession of accounts',
  strate_pledge:         'STRATE pledge',
  guarantee:             'Guarantee',
  other:                 'Other',
};

const REGISTRY_LABEL: Record<string, string> = {
  deeds_office:       'Deeds Office',
  cipc:               'CIPC',
  strate:             'STRATE',
  companies_register: 'Companies register',
  contractual:        'Contractual (notice)',
  sarb:               'SARB ExCon',
  other:              'Other',
};

const TIER_LABEL: Record<Tier, string> = {
  minor:    'Minor (<R10m)',
  moderate: 'Moderate (<R100m)',
  material: 'Material (<R500m)',
  major:    'Major (<R2bn)',
  critical: 'Critical (≥R2bn)',
};

const TERMINAL_STATES: ChainStatus[] = ['released', 'lapsed', 'withdrawn'];

// ── helpers ───────────────────────────────────────────────────────────────
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

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: PerfectionRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'identified') {
    actions.push({
      key: 'begin-documentation',
      label: 'Begin documentation (security agent)',
      fields: [
        {
          key: 'documentation_basis',
          label: 'Documentation basis — the security document being drawn (e.g. mortgage bond over Erf 123)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'document_ref',
          label: 'Document reference (e.g. DOC-2026-0011)',
          type: 'text',
          required: false,
        },
        {
          key: 'secured_value_zar',
          label: 'Secured value (ZAR)',
          type: 'number',
          required: false,
          placeholder: String(row.secured_value_zar ?? ''),
        },
        {
          key: 'perfection_critical',
          label: 'Condition precedent to first drawdown? (1 = yes, 0 = no)',
          type: 'text',
          required: false,
          placeholder: String(row.perfection_critical ?? '0'),
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'withdraw',
      label: 'Withdraw item (security agent)',
      fields: [
        {
          key: 'reason_code',
          label: 'Withdrawal reason — item dropped from the security package / superseded',
          type: 'textarea',
          required: true,
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'documentation_pending') {
    actions.push({
      key: 'execute-security',
      label: 'Execute security document (grantor)',
      fields: [
        {
          key: 'execution_basis',
          label: 'Execution basis — the grantor signing / notarial execution of the document',
          type: 'textarea',
          required: true,
        },
        {
          key: 'document_ref',
          label: 'Document reference (signed)',
          type: 'text',
          required: false,
          placeholder: row.document_ref ?? '',
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'flag-overdue',
      label: 'Flag overdue (security agent)',
      fields: [
        {
          key: 'overdue_basis',
          label: 'Overdue basis — the CP/CS perfection deadline that has been missed',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. deadline_missed / registry_backlog / grantor_delay)',
          type: 'text',
          required: false,
        },
      ],
      // flag-overdue for major/critical crosses regulator
      cascadeTo: (row.severity_tier === 'major' || row.severity_tier === 'critical') ? ['regulator'] : [],
    });
    actions.push({
      key: 'withdraw',
      label: 'Withdraw item (security agent)',
      fields: [
        {
          key: 'reason_code',
          label: 'Withdrawal reason — item dropped from the security package / superseded',
          type: 'textarea',
          required: true,
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'executed') {
    actions.push({
      key: 'lodge-registration',
      label: 'Lodge for registration (security agent)',
      fields: [
        {
          key: 'lodgement_basis',
          label: 'Lodgement basis — lodging the deed at the registry (Deeds Office / STRATE / CIPC)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'lodgement_ref',
          label: 'Lodgement reference (e.g. LODGE-2026-0011)',
          type: 'text',
          required: false,
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'flag-overdue',
      label: 'Flag overdue (security agent)',
      fields: [
        {
          key: 'overdue_basis',
          label: 'Overdue basis — the CP/CS perfection deadline that has been missed',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. deadline_missed / registry_backlog / grantor_delay)',
          type: 'text',
          required: false,
        },
      ],
      cascadeTo: (row.severity_tier === 'major' || row.severity_tier === 'critical') ? ['regulator'] : [],
    });
    actions.push({
      key: 'withdraw',
      label: 'Withdraw item (security agent)',
      fields: [
        {
          key: 'reason_code',
          label: 'Withdrawal reason — item dropped from the security package / superseded',
          type: 'textarea',
          required: true,
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'lodged_for_registration') {
    actions.push({
      key: 'confirm-registration',
      label: 'Confirm registration (security agent)',
      fields: [
        {
          key: 'registration_basis',
          label: 'Registration basis — the registrar registered / recorded the security',
          type: 'textarea',
          required: true,
        },
        {
          key: 'registration_ref',
          label: 'Registration reference (e.g. BOND-2026-0011 / STRATE ref)',
          type: 'text',
          required: false,
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'reject-registration',
      label: 'Reject — registry/opinion defect (security agent)',
      fields: [
        {
          key: 'defect_basis',
          label: 'Defect basis — why the registry rejected the deed or the opinion found a defect',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. wrong_property / ranking_clash / signature_defect)',
          type: 'text',
          required: false,
        },
      ],
      // reject-registration for critical CP crosses regulator
      cascadeTo: (row.severity_tier === 'critical' && row.perfection_critical) ? ['regulator'] : [],
    });
    actions.push({
      key: 'flag-overdue',
      label: 'Flag overdue (security agent)',
      fields: [
        {
          key: 'overdue_basis',
          label: 'Overdue basis — the CP/CS perfection deadline that has been missed',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. deadline_missed / registry_backlog / grantor_delay)',
          type: 'text',
          required: false,
        },
      ],
      cascadeTo: (row.severity_tier === 'major' || row.severity_tier === 'critical') ? ['regulator'] : [],
    });
  }

  if (s === 'registered') {
    actions.push({
      key: 'begin-perfection-review',
      label: 'Begin perfection review (security agent)',
      fields: [
        {
          key: 'perfection_basis',
          label: 'Perfection-review basis — instructing the legal opinion on perfection / ranking',
          type: 'textarea',
          required: true,
        },
        {
          key: 'legal_opinion_ref',
          label: 'Legal opinion reference (e.g. OPIN-2026-0011)',
          type: 'text',
          required: false,
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'perfection_review') {
    actions.push({
      key: 'confirm-perfection',
      label: 'Confirm perfection (security agent)',
      fields: [
        {
          key: 'perfection_basis',
          label: 'Perfection basis — the clean legal opinion confirming the security is perfected and correctly ranked',
          type: 'textarea',
          required: true,
        },
        {
          key: 'perfection_ref',
          label: 'Perfection reference (e.g. PERF-2026-0011)',
          type: 'text',
          required: false,
        },
        {
          key: 'legal_opinion_ref',
          label: 'Legal opinion reference',
          type: 'text',
          required: false,
          placeholder: row.legal_opinion_ref ?? '',
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'reject-registration',
      label: 'Reject — registry/opinion defect (security agent)',
      fields: [
        {
          key: 'defect_basis',
          label: 'Defect basis — why the registry rejected the deed or the opinion found a defect',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. wrong_property / ranking_clash / signature_defect)',
          type: 'text',
          required: false,
        },
      ],
      cascadeTo: (row.severity_tier === 'critical' && row.perfection_critical) ? ['regulator'] : [],
    });
  }

  if (s === 'perfected') {
    actions.push({
      key: 'release-security',
      label: 'Release security (security agent)',
      fields: [
        {
          key: 'release_basis',
          label: 'Release basis — discharge on repayment / substitution / refinancing',
          type: 'textarea',
          required: true,
        },
        {
          key: 'release_ref',
          label: 'Release reference (e.g. REL-2026-0011 / cancellation)',
          type: 'text',
          required: false,
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'defective') {
    actions.push({
      key: 'lodge-registration',
      label: 'Lodge for registration (security agent)',
      fields: [
        {
          key: 'lodgement_basis',
          label: 'Lodgement basis — re-lodging the deed at the registry (Deeds Office / STRATE / CIPC)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'lodgement_ref',
          label: 'Lodgement reference (re-lodge)',
          type: 'text',
          required: false,
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'flag-overdue',
      label: 'Flag overdue (security agent)',
      fields: [
        {
          key: 'overdue_basis',
          label: 'Overdue basis — the CP/CS perfection deadline that has been missed',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. deadline_missed / registry_backlog / grantor_delay)',
          type: 'text',
          required: false,
        },
      ],
      cascadeTo: (row.severity_tier === 'major' || row.severity_tier === 'critical') ? ['regulator'] : [],
    });
    actions.push({
      key: 'mark-lapsed',
      label: 'Mark lapsed (security agent)',
      fields: [
        {
          key: 'lapse_basis',
          label: 'Lapse basis — why the security was never perfected (deadline blown / unrecoverable defect)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. deadline_lapsed / registry_refused / abandoned)',
          type: 'text',
          required: false,
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
        },
      ],
      // mark-lapsed crosses regulator EVERY tier (W69 signature)
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'perfection_overdue') {
    actions.push({
      key: 'cure-overdue',
      label: 'Cure overdue — re-lodge (security agent)',
      fields: [
        {
          key: 'lodgement_basis',
          label: 'Cure basis — re-lodging to cure the overdue / defective item',
          type: 'textarea',
          required: true,
        },
        {
          key: 'lodgement_ref',
          label: 'Lodgement reference (re-lodge)',
          type: 'text',
          required: false,
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'mark-lapsed',
      label: 'Mark lapsed (security agent)',
      fields: [
        {
          key: 'lapse_basis',
          label: 'Lapse basis — why the security was never perfected (deadline blown / unrecoverable defect)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. deadline_lapsed / registry_refused / abandoned)',
          type: 'text',
          required: false,
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
        },
      ],
      // mark-lapsed crosses regulator EVERY tier (W69 signature)
      cascadeTo: ['regulator'],
    });
  }

  return actions;
}

// ── renderDetail ──────────────────────────────────────────────────────────
function renderDetail(row: PerfectionRow): React.ReactNode {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <DetailPair label="State"               value={row.chain_status.replace(/_/g, ' ')} />
        <DetailPair label="Tier"                value={TIER_LABEL[row.severity_tier]} />
        <DetailPair label="Security type"       value={SECURITY_TYPE_LABEL[row.security_type] ?? row.security_type} />
        <DetailPair label="Registry"            value={row.registry ? (REGISTRY_LABEL[row.registry] ?? row.registry) : '—'} />
        <DetailPair label="Ranking"             value={row.ranking ?? '—'} />
        <DetailPair label="Secured value"       value={fmtZar(row.secured_value_zar)} />
        <DetailPair label="Condition precedent" value={row.perfection_critical ? 'Yes' : 'No'} />
        <DetailPair label="Cross-border"        value={row.cross_border ? 'Yes (SARB ExCon)' : 'No'} />
        <DetailPair label="Description"         value={row.security_description ?? '—'} />
        <DetailPair label="Document ref"        value={row.document_ref ?? '—'} />
        <DetailPair label="Lodgement ref"       value={row.lodgement_ref ?? '—'} />
        <DetailPair label="Registration ref"    value={row.registration_ref ?? '—'} />
        <DetailPair label="Perfection ref"      value={row.perfection_ref ?? '—'} />
        <DetailPair label="Legal opinion ref"   value={row.legal_opinion_ref ?? '—'} />
        <DetailPair label="Release ref"         value={row.release_ref ?? '—'} />
        <DetailPair label="Reason code"         value={row.reason_code ?? '—'} />
        <DetailPair label="Re-lodge round"      value={String(row.relodge_round)} />
        <DetailPair label="Security agent"      value={row.security_agent_name ?? '—'} />
        <DetailPair label="Grantor"             value={row.grantor_name ?? row.borrower_name} />
        <DetailPair label="Facility"            value={row.facility_name ?? '—'} />
        <DetailPair label="Project"             value={row.project_name ?? '—'} />
        <DetailPair label="Source wave"         value={row.source_wave ?? '—'} />
        <DetailPair label="Identified"          value={fmtDate(row.identified_at)} />
        <DetailPair label="Documentation"       value={fmtDate(row.documentation_pending_at)} />
        <DetailPair label="Executed"            value={fmtDate(row.executed_at)} />
        <DetailPair label="Lodged"              value={fmtDate(row.lodged_for_registration_at)} />
        <DetailPair label="Registered"          value={fmtDate(row.registered_at)} />
        <DetailPair label="Perfection review"   value={fmtDate(row.perfection_review_at)} />
        <DetailPair label="Perfected"           value={fmtDate(row.perfected_at)} />
        <DetailPair label="Defective"           value={fmtDate(row.defective_at)} />
        <DetailPair label="Overdue"             value={fmtDate(row.perfection_overdue_at)} />
        <DetailPair label="Released"            value={fmtDate(row.released_at)} />
        <DetailPair label="Lapsed"              value={fmtDate(row.lapsed_at)} />
        <DetailPair label="Perfection deadline" value={fmtDate(row.perfection_deadline_at)} />
        <DetailPair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA status"          value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Escalation lvl"      value={String(row.escalation_level)} />
        <DetailPair label="Reportable"          value={row.is_reportable ? 'Yes' : 'No'} />
      </div>
      {row.resolution_summary && (
        <BasisBlock label="Resolution summary" text={row.resolution_summary} />
      )}
      {row.documentation_basis && (
        <BasisBlock label="Documentation basis" text={row.documentation_basis} />
      )}
      {row.execution_basis && (
        <BasisBlock label="Execution basis (grantor)" text={row.execution_basis} />
      )}
      {row.lodgement_basis && (
        <BasisBlock label="Lodgement basis" text={row.lodgement_basis} />
      )}
      {row.registration_basis && (
        <BasisBlock label="Registration basis" text={row.registration_basis} />
      )}
      {row.defect_basis && (
        <BasisBlock label="Defect basis" text={row.defect_basis} />
      )}
      {row.perfection_basis && (
        <BasisBlock label="Perfection basis" text={row.perfection_basis} />
      )}
      {row.overdue_basis && (
        <BasisBlock label="Overdue basis" text={row.overdue_basis} />
      )}
      {row.release_basis && (
        <BasisBlock label="Release basis" text={row.release_basis} />
      )}
      {row.lapse_basis && (
        <BasisBlock label="Lapse basis" text={row.lapse_basis} />
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function SecurityPerfectionChainTab() {
  const [rows, setRows] = useState<PerfectionRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: PerfectionRow[] } & KpiSummary }>('/security-perfection/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        setSummary({
          total: d.total,
          open_count: d.open_count,
          perfected_count: d.perfected_count,
          defective_count: d.defective_count,
          overdue_count: d.overdue_count,
          released_count: d.released_count,
          lapsed_count: d.lapsed_count,
          withdrawn_count: d.withdrawn_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          cp_open: d.cp_open,
          high_open: d.high_open,
          total_secured_zar: d.total_secured_zar,
          perfected_secured_zar: d.perfected_secured_zar,
          lapsed_secured_zar: d.lapsed_secured_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load security-perfection cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/security-perfection/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/security-perfection/chain/${rowId}`);
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
      const res = await api.get<{ data: { case: PerfectionRow; events: ChainEvent[] } }>(`/security-perfection/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'open')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return !!r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'minor' || filter === 'moderate' || filter === 'material' || filter === 'major' || filter === 'critical') {
        return r.severity_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: 0, open_count: 0, perfected_count: 0, defective_count: 0,
    overdue_count: 0, released_count: 0, lapsed_count: 0, withdrawn_count: 0,
    breached: 0, reportable_total: 0, cp_open: 0, high_open: 0,
    total_secured_zar: 0, perfected_secured_zar: 0, lapsed_secured_zar: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Security perfection & registration</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-state collateral-perfection chain (Deeds Registries Act 47/1937 · Security by Means of Movable
          Property Act 57/1993 · Companies Act 71/2008 s126 · Financial Markets Act 19/2012 / STRATE · SARB
          Exchange Control) · identified → documented → executed → lodged → registered → reviewed → perfected
          → released. A registry rejection or a perfection-opinion defect sends the item defective and back for
          re-lodgement; a missed CP/CS deadline flags it overdue, then cured or lapsed. URGENT SLA: the larger
          / more critical the security, the tighter every window. Two-party write — security agent (lender)
          drives every step; grantor (borrower) executes the security document.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"           value={kpis.total} />
        <KpiTile label="Open"            value={kpis.open_count}       tone={kpis.open_count > 0 ? 'warn' : undefined} />
        <KpiTile label="CP open"         value={kpis.cp_open}          tone={kpis.cp_open > 0 ? 'warn' : undefined} />
        <KpiTile label="High open"       value={kpis.high_open}        tone={kpis.high_open > 0 ? 'warn' : undefined} />
        <KpiTile label="Perfected"       value={kpis.perfected_count}  tone="ok" />
        <KpiTile label="Defective"       value={kpis.defective_count}  tone={kpis.defective_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Overdue"         value={kpis.overdue_count}    tone={kpis.overdue_count > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached"    value={kpis.breached}         tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Reportable"      value={kpis.reportable_total} tone={kpis.reportable_total > 0 ? 'warn' : undefined} />
        <KpiTile label="Lapsed"          value={kpis.lapsed_count}     tone={kpis.lapsed_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Secured value"   value={fmtZar(kpis.total_secured_zar)} />
        <KpiTile label="Perfected value" value={fmtZar(kpis.perfected_secured_zar)} tone="ok" />
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
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
          Loading...
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.case_number} — ${row.borrower_name}`}
              meta={[
                TIER_LABEL[row.severity_tier],
                SECURITY_TYPE_LABEL[row.security_type] ?? row.security_type,
                row.registry ? (REGISTRY_LABEL[row.registry] ?? row.registry) : null,
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
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No security items match.
            </div>
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

function BasisBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="whitespace-pre-wrap" style={{ color: TX2, fontSize: 11 }}>{text}</div>
    </div>
  );
}

export default SecurityPerfectionChainTab;
