// Wave 78 — Offtaker PPA Change-in-Law / Qualifying-Change relief tab.
//
// 12-state P6 chain on oe_ppa_change_in_law. Every PPA allocates the risk of a
// CHANGE IN LAW between the parties. When a statute, tax or regulation changes
// after financial close — a new carbon-tax rate, a NERSA Grid Code amendment,
// an environmental-licensing condition, an import duty on panels — the affected
// party tests it against the PPA's "Qualifying Change in Law" definition and, if
// it qualifies, seeks relief: a tariff adjustment, a lump-sum, or a term
// extension. A contested claim goes to arbitration. This is DISTINCT from W39
// tariff indexation (scheduled CPI/PPI repricing of an UNCHANGED tariff).
//
// INVERTED SLA: a larger-quantum change needs a deeper eligibility test, fuller
// impact model, longer negotiation and a longer arbitration. The relief quantum
// (ZAR millions) drives the tier.
//
// Reportability (the W78 signature): refer_to_arbitration crosses for EVERY tier
// (a contested change-in-law claim is always reportable); issue_determination /
// award_relief cross for the material+ tiers when the change is GOVERNMENTAL in
// origin (tax / regulatory / statutory / discriminatory); SLA breaches cross for
// major + critical only.
//
// Single-party write {admin, offtaker}: the offtaker contract desk drives every
// step; actor_party records the contractual function (claimant / counterparty /
// arbitrator) per step for audit texture, not the JWT role.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';
import { statusLabel } from '../../meridian/ease/statusLabel';

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
  | 'event_logged' | 'eligibility_review' | 'impact_assessment' | 'claim_submitted'
  | 'counterparty_review' | 'negotiation' | 'determination_pending' | 'in_arbitration'
  | 'relief_granted' | 'implemented' | 'rejected' | 'withdrawn';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';
type ChangeType = 'tax_change' | 'regulatory_change' | 'statutory_change' | 'discriminatory_change' | 'other_change';

interface ChangeInLawRow {
  id: string;
  cil_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  ppa_ref: string | null;
  project_id: string | null;
  contract_ref: string | null;
  generator_name: string;
  offtaker_name: string;
  arbitrator_name: string | null;
  change_type: ChangeType | null;
  change_category: string | null;
  relief_mechanism: string | null;
  currency: string | null;
  claim_quantum_zar_m: number;
  assessed_quantum_zar_m: number | null;
  granted_quantum_zar_m: number | null;
  change_in_law_tier: Tier;
  law_effective_date: string | null;
  notification_date: string | null;
  claim_deadline: string | null;
  determination_due_date: string | null;
  reason_code: string | null;
  eligibility_ref: string | null;
  assessment_ref: string | null;
  claim_ref: string | null;
  negotiation_ref: string | null;
  determination_ref: string | null;
  arbitration_ref: string | null;
  implementation_ref: string | null;
  rejection_ref: string | null;
  withdrawal_ref: string | null;
  event_basis: string | null;
  eligibility_basis: string | null;
  assessment_basis: string | null;
  claim_basis: string | null;
  negotiation_basis: string | null;
  determination_basis: string | null;
  arbitration_basis: string | null;
  implementation_basis: string | null;
  rejection_basis: string | null;
  withdrawal_basis: string | null;
  chain_status: ChainStatus;
  event_logged_at: string;
  eligibility_review_at: string | null;
  impact_assessment_at: string | null;
  claim_submitted_at: string | null;
  counterparty_review_at: string | null;
  negotiation_at: string | null;
  determination_pending_at: string | null;
  in_arbitration_at: string | null;
  relief_granted_at: string | null;
  implemented_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable?: boolean;
  breach_crosses_regulator?: boolean;
}

interface KpiSummary {
  total: number;
  open_count: number;
  arbitration_count: number;
  relief_count: number;
  rejected_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  large_open: number;
  total_quantum_zar_m: number;
  granted_quantum_zar_m: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'event_logged',
  'eligibility_review',
  'impact_assessment',
  'claim_submitted',
  'counterparty_review',
  'negotiation',
  'determination_pending',
  'in_arbitration',
  'relief_granted',
  'implemented',
];
const BRANCH_STATES: readonly string[] = [
  'rejected',
  'withdrawn',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active_open',           label: 'Open' },
  { key: 'all',                   label: 'All' },
  { key: 'minor',                 label: 'Minor' },
  { key: 'moderate',              label: 'Moderate' },
  { key: 'material',              label: 'Material' },
  { key: 'major',                 label: 'Major' },
  { key: 'critical',              label: 'Critical' },
  { key: 'governmental',          label: 'Governmental' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'event_logged',          label: 'Logged' },
  { key: 'eligibility_review',    label: 'Eligibility' },
  { key: 'impact_assessment',     label: 'Assessment' },
  { key: 'claim_submitted',       label: 'Claim' },
  { key: 'counterparty_review',   label: 'Review' },
  { key: 'negotiation',           label: 'Negotiation' },
  { key: 'determination_pending', label: 'Determination' },
  { key: 'in_arbitration',        label: 'Arbitration' },
  { key: 'relief_granted',        label: 'Relief' },
  { key: 'implemented',           label: 'Implemented' },
  { key: 'rejected',              label: 'Rejected' },
  { key: 'withdrawn',             label: 'Withdrawn' },
];

// ── action helpers ────────────────────────────────────────────────────────
const WITHDRAW_FROM: ChainStatus[] = [
  'event_logged', 'eligibility_review', 'impact_assessment', 'claim_submitted',
  'counterparty_review', 'negotiation', 'determination_pending',
];
const TERMINAL_STATES: ChainStatus[] = ['implemented', 'rejected', 'withdrawn'];
const GOVERNMENTAL: ChangeType[] = ['tax_change', 'regulatory_change', 'statutory_change', 'discriminatory_change'];

const CHANGE_LABEL: Record<ChangeType, string> = {
  tax_change:            'Tax',
  regulatory_change:     'Regulatory',
  statutory_change:      'Statutory',
  discriminatory_change: 'Discriminatory',
  other_change:          'Other (commercial)',
};

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

// Amounts are stored in ZAR millions.
function fmtZarM(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1000) return `R${(n / 1000).toFixed(2)}bn`;
  return `R${n.toFixed(1)}m`;
}

function getActions(row: ChangeInLawRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'event_logged') {
    actions.push({
      key: 'open-eligibility-review',
      label: 'Open eligibility review (counterparty)',
      fields: [
        { key: 'eligibility_ref', label: 'Eligibility reference (e.g. CIL-2026-0001-ELG)', type: 'text', required: true, placeholder: '' },
        { key: 'eligibility_basis', label: 'Eligibility basis — the change in law to be tested', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'eligibility_review') {
    actions.push({
      key: 'confirm-eligible',
      label: 'Confirm eligible → assess impact (counterparty)',
      fields: [
        { key: 'eligibility_basis', label: 'Eligibility basis — why the change qualifies under the PPA definition', type: 'textarea', required: true, placeholder: '' },
        { key: 'assessment_basis', label: 'Assessment basis — the impact model to be built', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'reject-ineligible',
      label: 'Reject as ineligible (counterparty)',
      fields: [
        { key: 'rejection_ref', label: 'Rejection reference', type: 'text', required: true, placeholder: '' },
        { key: 'rejection_basis', label: 'Rejection basis — why the change does NOT qualify', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code', type: 'text', required: false, placeholder: 'not_qualifying' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'impact_assessment') {
    actions.push({
      key: 'submit-claim',
      label: 'Submit relief claim (claimant)',
      fields: [
        { key: 'claim_ref', label: 'Claim reference', type: 'text', required: true, placeholder: '' },
        { key: 'claim_quantum_zar_m', label: 'Relief sought (ZAR millions) — drives the tier', type: 'number', required: false, placeholder: String(row.claim_quantum_zar_m ?? '') },
        { key: 'assessed_quantum_zar_m', label: 'Assessed impact (ZAR millions)', type: 'number', required: false, placeholder: String(row.assessed_quantum_zar_m ?? '') },
        { key: 'relief_mechanism', label: 'Relief mechanism (tariff_adjustment / lump_sum / term_extension / combination)', type: 'text', required: false, placeholder: row.relief_mechanism ?? '' },
        { key: 'claim_basis', label: 'Claim basis — the relief claimed + grounds', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'claim_submitted') {
    actions.push({
      key: 'acknowledge-claim',
      label: 'Acknowledge claim → review (counterparty)',
      fields: [
        { key: 'claim_basis', label: 'Claim basis — the counterparty acknowledgement', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'counterparty_review') {
    actions.push({
      key: 'enter-negotiation',
      label: 'Enter negotiation (counterparty)',
      fields: [
        { key: 'negotiation_ref', label: 'Negotiation reference', type: 'text', required: true, placeholder: '' },
        { key: 'negotiation_basis', label: 'Negotiation basis — the points in negotiation', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'dispute-claim',
      label: 'Dispute claim → reject (counterparty)',
      fields: [
        { key: 'rejection_ref', label: 'Rejection reference (counterparty disputes the claim)', type: 'text', required: true, placeholder: '' },
        { key: 'rejection_basis', label: 'Rejection basis — why the counterparty disputes eligibility / quantum', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code', type: 'text', required: false, placeholder: 'claim_disputed' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'refer-to-arbitration',
      label: 'Refer to arbitration (claimant)',
      fields: [
        { key: 'arbitration_ref', label: 'Arbitration reference', type: 'text', required: true, placeholder: '' },
        { key: 'arbitrator_name', label: 'Arbitrator / forum (e.g. Arbitration Foundation of Southern Africa)', type: 'text', required: false, placeholder: '' },
        { key: 'arbitration_basis', label: 'Arbitration basis — the dispute referred', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code', type: 'text', required: false, placeholder: 'referred_to_arbitration' },
      ],
      // refer_to_arbitration crosses regulator EVERY tier
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'negotiation') {
    actions.push({
      key: 'reach-agreement',
      label: 'Reach agreement → determination (claimant)',
      fields: [
        { key: 'relief_mechanism', label: 'Agreed relief mechanism (tariff_adjustment / lump_sum / term_extension / combination)', type: 'text', required: false, placeholder: row.relief_mechanism ?? '' },
        { key: 'determination_basis', label: 'Determination basis — the agreed relief to be determined', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'refer-to-arbitration',
      label: 'Refer to arbitration (claimant)',
      fields: [
        { key: 'arbitration_ref', label: 'Arbitration reference', type: 'text', required: true, placeholder: '' },
        { key: 'arbitrator_name', label: 'Arbitrator / forum (e.g. Arbitration Foundation of Southern Africa)', type: 'text', required: false, placeholder: '' },
        { key: 'arbitration_basis', label: 'Arbitration basis — the dispute referred', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code', type: 'text', required: false, placeholder: 'referred_to_arbitration' },
      ],
      // refer_to_arbitration crosses regulator EVERY tier
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'determination_pending') {
    actions.push({
      key: 'issue-determination',
      label: 'Issue determination → grant relief (counterparty)',
      fields: [
        { key: 'determination_ref', label: 'Determination reference', type: 'text', required: true, placeholder: '' },
        { key: 'granted_quantum_zar_m', label: 'Relief granted (ZAR millions)', type: 'number', required: false, placeholder: String(row.granted_quantum_zar_m ?? row.assessed_quantum_zar_m ?? '') },
        { key: 'relief_mechanism', label: 'Relief mechanism (tariff_adjustment / lump_sum / term_extension / combination)', type: 'text', required: false, placeholder: row.relief_mechanism ?? '' },
        { key: 'determination_basis', label: 'Determination basis — the relief granted + method', type: 'textarea', required: true, placeholder: '' },
      ],
      // issue_determination crosses for material+ tiers when change is GOVERNMENTAL
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'determine-no-relief',
      label: 'Determine no relief → reject (counterparty)',
      fields: [
        { key: 'rejection_ref', label: 'Rejection reference (determination grants no relief)', type: 'text', required: true, placeholder: '' },
        { key: 'determination_basis', label: 'Determination basis — why no relief is due', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code', type: 'text', required: false, placeholder: 'no_relief_due' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'in_arbitration') {
    actions.push({
      key: 'award-relief',
      label: 'Award relief (arbitrator)',
      fields: [
        { key: 'arbitration_ref', label: 'Arbitration award reference', type: 'text', required: true, placeholder: '' },
        { key: 'granted_quantum_zar_m', label: 'Relief awarded (ZAR millions)', type: 'number', required: false, placeholder: String(row.granted_quantum_zar_m ?? '') },
        { key: 'relief_mechanism', label: 'Relief mechanism awarded (tariff_adjustment / lump_sum / term_extension / combination)', type: 'text', required: false, placeholder: row.relief_mechanism ?? '' },
        { key: 'arbitration_basis', label: 'Arbitration basis — the award', type: 'textarea', required: true, placeholder: '' },
      ],
      // award_relief crosses for material+ tiers when change is GOVERNMENTAL
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'award-no-relief',
      label: 'Award no relief → reject (arbitrator)',
      fields: [
        { key: 'rejection_ref', label: 'Rejection reference (arbitration awards no relief)', type: 'text', required: true, placeholder: '' },
        { key: 'arbitration_basis', label: 'Arbitration basis — why the award grants no relief', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code', type: 'text', required: false, placeholder: 'no_award' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'relief_granted') {
    actions.push({
      key: 'implement-relief',
      label: 'Implement relief → close (counterparty)',
      fields: [
        { key: 'implementation_ref', label: 'Implementation reference (relief takes effect — clean close)', type: 'text', required: true, placeholder: '' },
        { key: 'implementation_basis', label: 'Implementation basis — how the relief is applied (e.g. adjusted tariff from next cycle)', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (WITHDRAW_FROM.includes(s)) {
    actions.push({
      key: 'withdraw-claim',
      label: 'Withdraw claim (claimant)',
      fields: [
        { key: 'withdrawal_ref', label: 'Withdrawal reference (claim withdrawn before relief)', type: 'text', required: true, placeholder: '' },
        { key: 'withdrawal_basis', label: 'Withdrawal basis — why the claim is withdrawn', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code', type: 'text', required: false, placeholder: 'withdrawn' },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

function renderDetail(row: ChangeInLawRow): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="State"             value={statusLabel(row.chain_status).text} />
      <DetailPair label="Tier"              value={row.change_in_law_tier} />
      <DetailPair label="Change type"       value={row.change_type ? CHANGE_LABEL[row.change_type] : '—'} />
      <DetailPair label="Change category"   value={row.change_category ?? '—'} />
      <DetailPair label="Relief mechanism"  value={row.relief_mechanism ?? '—'} />
      <DetailPair label="Currency"          value={row.currency ?? '—'} />
      <DetailPair label="Claim quantum"     value={fmtZarM(row.claim_quantum_zar_m)} />
      <DetailPair label="Assessed quantum"  value={fmtZarM(row.assessed_quantum_zar_m)} />
      <DetailPair label="Granted quantum"   value={fmtZarM(row.granted_quantum_zar_m)} />
      <DetailPair label="Law effective"     value={fmtDate(row.law_effective_date)} />
      <DetailPair label="Notified"          value={fmtDate(row.notification_date)} />
      <DetailPair label="Determination due" value={fmtDate(row.determination_due_date)} />
      <DetailPair label="Eligibility ref"   value={row.eligibility_ref ?? '—'} />
      <DetailPair label="Assessment ref"    value={row.assessment_ref ?? '—'} />
      <DetailPair label="Claim ref"         value={row.claim_ref ?? '—'} />
      <DetailPair label="Negotiation ref"   value={row.negotiation_ref ?? '—'} />
      <DetailPair label="Determination ref" value={row.determination_ref ?? '—'} />
      <DetailPair label="Arbitration ref"   value={row.arbitration_ref ?? '—'} />
      <DetailPair label="Implementation ref" value={row.implementation_ref ?? '—'} />
      <DetailPair label="Rejection ref"     value={row.rejection_ref ?? '—'} />
      <DetailPair label="Reason code"       value={row.reason_code ?? '—'} />
      <DetailPair label="Logged at"         value={fmtDate(row.event_logged_at)} />
      <DetailPair label="Eligibility at"    value={fmtDate(row.eligibility_review_at)} />
      <DetailPair label="Assessment at"     value={fmtDate(row.impact_assessment_at)} />
      <DetailPair label="Claim at"          value={fmtDate(row.claim_submitted_at)} />
      <DetailPair label="Review at"         value={fmtDate(row.counterparty_review_at)} />
      <DetailPair label="Negotiation at"    value={fmtDate(row.negotiation_at)} />
      <DetailPair label="Determination at"  value={fmtDate(row.determination_pending_at)} />
      <DetailPair label="Arbitration at"    value={fmtDate(row.in_arbitration_at)} />
      <DetailPair label="Relief at"         value={fmtDate(row.relief_granted_at)} />
      <DetailPair label="Implemented at"    value={fmtDate(row.implemented_at)} />
      <DetailPair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
      <DetailPair label="SLA status"        value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
      <DetailPair label="Escalation lvl"    value={String(row.escalation_level)} />
      <DetailPair label="Reportable"        value={row.is_reportable ? 'Yes' : 'No'} />
      {row.arbitrator_name && (
        <DetailPair label="Arbitrator" value={row.arbitrator_name} />
      )}
      {row.ppa_ref && (
        <DetailPair label="PPA ref" value={row.ppa_ref + (row.project_id ? ` · ${row.project_id}` : '')} />
      )}
      {row.event_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Event basis</div>
          <div style={{ color: TX2 }}>{row.event_basis}</div>
        </div>
      )}
      {row.eligibility_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Eligibility basis</div>
          <div style={{ color: TX2 }}>{row.eligibility_basis}</div>
        </div>
      )}
      {row.assessment_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Assessment basis</div>
          <div style={{ color: TX2 }}>{row.assessment_basis}</div>
        </div>
      )}
      {row.claim_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Claim basis</div>
          <div style={{ color: TX2 }}>{row.claim_basis}</div>
        </div>
      )}
      {row.negotiation_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Negotiation basis</div>
          <div style={{ color: TX2 }}>{row.negotiation_basis}</div>
        </div>
      )}
      {row.determination_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Determination basis</div>
          <div style={{ color: TX2 }}>{row.determination_basis}</div>
        </div>
      )}
      {row.arbitration_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Arbitration basis</div>
          <div style={{ color: TX2 }}>{row.arbitration_basis}</div>
        </div>
      )}
      {row.implementation_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Implementation basis</div>
          <div style={{ color: TX2 }}>{row.implementation_basis}</div>
        </div>
      )}
      {row.rejection_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Rejection basis</div>
          <div style={{ color: TX2 }}>{row.rejection_basis}</div>
        </div>
      )}
      {row.withdrawal_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Withdrawal basis</div>
          <div style={{ color: TX2 }}>{row.withdrawal_basis}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function PpaChangeInLawChainTab() {
  const [rows, setRows] = useState<ChangeInLawRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active_open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ChangeInLawRow[] } & KpiSummary }>('/ppa-change-in-law/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total,
          open_count: d.open_count,
          arbitration_count: d.arbitration_count,
          relief_count: d.relief_count,
          rejected_count: d.rejected_count,
          withdrawn_count: d.withdrawn_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          large_open: d.large_open,
          total_quantum_zar_m: d.total_quantum_zar_m,
          granted_quantum_zar_m: d.granted_quantum_zar_m,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load change-in-law claims');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/ppa-change-in-law/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ppa-change-in-law/chain/${rowId}`);
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
      const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ppa-change-in-law/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')          return true;
      if (filter === 'active_open')  return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'minor')        return r.change_in_law_tier === 'minor';
      if (filter === 'moderate')     return r.change_in_law_tier === 'moderate';
      if (filter === 'material')     return r.change_in_law_tier === 'material';
      if (filter === 'major')        return r.change_in_law_tier === 'major';
      if (filter === 'critical')     return r.change_in_law_tier === 'critical';
      if (filter === 'governmental') return !!r.change_type && GOVERNMENTAL.includes(r.change_type);
      if (filter === 'breached')     return !!r.sla_breached;
      if (filter === 'reportable')   return !!r.is_reportable;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const summary = kpis ?? {
    total: 0, open_count: 0, arbitration_count: 0, relief_count: 0,
    rejected_count: 0, withdrawn_count: 0, breached: 0, reportable_total: 0,
    large_open: 0, total_quantum_zar_m: 0, granted_quantum_zar_m: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Offtaker PPA change-in-law / qualifying-change relief</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-stage P6 chain · event logged → eligibility review → impact assessment → claim submitted → counterparty
          review → negotiation → determination → relief granted → implemented. Every PPA allocates the risk of a change
          in law; when a statute, tax or regulation changes after financial close (a carbon-tax rate, a NERSA Grid Code
          amendment, an environmental-licensing condition, an import duty), the affected party tests it against the PPA
          qualifying-change definition and, if it qualifies, seeks relief — a tariff adjustment, lump-sum or term
          extension. A contested claim goes to arbitration. DISTINCT from scheduled tariff indexation (CPI repricing of an
          UNCHANGED tariff). INVERTED SLA (bigger quantum = deeper test + longer windows). Referring a claim to
          arbitration crosses to the regulator inbox for EVERY tier; granting tariff-affecting relief crosses for a
          GOVERNMENTAL change of material+ quantum; SLA breaches cross for major + critical.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"          value={summary.total} />
        <KpiTile label="Open"           value={summary.open_count} />
        <KpiTile label="In arbitration" value={summary.arbitration_count} tone={summary.arbitration_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Relief granted" value={summary.relief_count} tone={summary.relief_count > 0 ? 'ok' : undefined} />
        <KpiTile label="Large open"     value={summary.large_open} tone={summary.large_open > 0 ? 'warn' : undefined} />
        <KpiTile label="Reportable"     value={summary.reportable_total} tone={summary.reportable_total > 0 ? 'warn' : undefined} />
        <KpiTile label="Rejected"       value={summary.rejected_count} />
        <KpiTile label="Withdrawn"      value={summary.withdrawn_count} />
        <KpiTile label="SLA breached"   value={summary.breached} tone={summary.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Claimed total"  value={fmtZarM(summary.total_quantum_zar_m)} />
        <KpiTile label="Granted total"  value={fmtZarM(summary.granted_quantum_zar_m)} tone={summary.granted_quantum_zar_m > 0 ? 'ok' : undefined} />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{ background: filter === f.key ? ACC : BG2, color: filter === f.key ? '#fff' : TX2, border: `1px solid ${filter === f.key ? ACC : BORDER}` }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>{err}</div>
      )}
      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>Loading...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.cil_number}${row.is_reportable ? ' ●' : ''}`}
              meta={`${row.change_in_law_tier}${row.change_type ? ' · ' + CHANGE_LABEL[row.change_type] : ''} · ${row.generator_name} / ${row.offtaker_name} · ${fmtZarM(row.claim_quantum_zar_m)}`}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No change-in-law claims match.</div>
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
      <div style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

export default PpaChangeInLawChainTab;
