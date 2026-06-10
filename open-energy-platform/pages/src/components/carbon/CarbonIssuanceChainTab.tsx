// Wave 82 — Carbon Credit Issuance & Serialization chain tab.
//
// The MINTING step of the carbon-credit lifecycle: once a monitoring period
// has been verified (W11) and the project is in good standing (W37/W56), the
// registry serializes the verified reductions into a unique block of serial
// numbers and credits the proponent holding account. The tab surfaces the
// 12-state chain — requested → screening → verification_check → serialization
// → pending_registry → issued, with on_hold/returned/disputed loops back to
// screening or serialization, and terminal rejected/withdrawn/cancelled — and
// exposes the LIVE integrity battery that beats Verra Registry on APX, Gold
// Standard Impact Registry, S&P Global Environmental Registry, Cercarbono and
// Puro.earth: serial-block transparency, buffer-pool maths (AFOLU 20% / non-
// AFOLU 5%), project+vintage cumulative headroom, double-issuance / over-
// issuance flags, predicted issuance days, and Article-6 corresponding-
// adjustment binding — all derived from the same inputs each transition.
//
// INVERTED SLA — the larger the volume, the LONGER every window (deeper
// integrity diligence); a minor mint gets the fast track. The W82 signature
// is INTEGRITY-driven: raise_dispute crosses to the regulator inbox for
// EVERY tier (the W82 hard line); confirm_issuance crosses for EVERY tier
// when CA-required (Article 6), else for the large tiers (major + mega);
// reject and SLA breach cross for the large tiers.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'requested' | 'screening' | 'verification_check' | 'serialization'
  | 'pending_registry' | 'issued' | 'on_hold' | 'returned'
  | 'disputed' | 'rejected' | 'withdrawn' | 'cancelled';

type Tier = 'minor' | 'moderate' | 'major' | 'mega';

type TransferType = 'article6' | 'voluntary' | 'compliance';

type Category = 'afolu' | 'renewables' | 'efficiency' | 'industrial' | 'methane' | 'cdr';

interface IssuanceRow {
  id: string;
  issuance_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string;
  project_name: string | null;
  registry_standard: string | null;
  methodology_id: string | null;
  proponent_party_id: string | null;
  proponent_party_name: string | null;
  registry_account_id: string | null;
  vvb_name: string | null;
  dna_name: string | null;
  host_country: string | null;
  transfer_type: TransferType;
  category: Category;
  issuance_tier: Tier;
  requested_tco2e: number;
  requires_corresponding_adjustment: number;
  corresponding_adjustment_ref: string | null;
  ca_applied_flag: number;
  vintage_year: number | null;
  monitoring_period_start: string | null;
  monitoring_period_end: string | null;
  vintage_monitoring_key: string | null;
  verified_tco2e: number | null;
  already_issued_tco2e: number | null;
  buffer_pct: number | null;
  buffer_contribution_tco2e: number | null;
  net_issuable_tco2e: number | null;
  project_vintage_headroom_tco2e: number | null;
  over_issuance_flag: number;
  double_issuance_guard_ok: number;
  predicted_issuance_days: number | null;
  serial_block_start: number | null;
  serial_block_end: number | null;
  serial_block_size: number | null;
  serial_number_prefix: string | null;
  screened_flag: number;
  verification_check_ok_flag: number;
  serials_assigned_flag: number;
  submitted_to_registry_flag: number;
  issued_flag: number;
  request_ref: string | null;
  screening_ref: string | null;
  verification_check_ref: string | null;
  serialization_ref: string | null;
  registry_submission_ref: string | null;
  issuance_ref: string | null;
  hold_ref: string | null;
  return_ref: string | null;
  dispute_ref: string | null;
  rejection_ref: string | null;
  withdrawal_ref: string | null;
  cancellation_ref: string | null;
  regulator_ref: string | null;
  request_basis: string | null;
  screening_basis: string | null;
  verification_check_basis: string | null;
  serialization_basis: string | null;
  registry_submission_basis: string | null;
  issuance_basis: string | null;
  hold_basis: string | null;
  return_basis: string | null;
  dispute_basis: string | null;
  rejection_basis: string | null;
  withdrawal_basis: string | null;
  cancellation_basis: string | null;
  reason_code: string | null;
  issuance_summary: string | null;
  chain_status: ChainStatus;
  requested_at: string;
  screening_at: string | null;
  verification_check_at: string | null;
  serialization_at: string | null;
  pending_registry_at: string | null;
  issued_at: string | null;
  on_hold_at: string | null;
  returned_at: string | null;
  disputed_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  requires_corresponding_adjustment_flag?: boolean;
  breach_crosses_regulator?: boolean;
  buffer_pct_live?: number;
  buffer_contribution_tco2e_live?: number;
  net_issuable_tco2e_live?: number;
  project_vintage_headroom_tco2e_live?: number;
  over_issuance_flag_live?: boolean;
  serial_block_end_live?: number | null;
  predicted_issuance_days_live?: number;
  double_issuance_guard_ok_flag?: boolean;
}

interface IssuanceEvent {
  id: string;
  issuance_id: string;
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
  issued_count: number;
  on_hold_count: number;
  returned_count: number;
  disputed_count: number;
  rejected_count: number;
  withdrawn_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  article6_count: number;
  afolu_count: number;
  over_issuance_count: number;
  total_requested_tco2e: number;
  total_net_issuable_tco2e: number;
  issued_tco2e: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  requested:          { bg: '#e3e7ec', fg: '#557',    label: 'Requested' },
  screening:          { bg: '#dbecfb', fg: '#1a3a5c', label: 'Screening' },
  verification_check: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Verification check' },
  serialization:      { bg: '#fff4d6', fg: '#a06200', label: 'Serialization' },
  pending_registry:   { bg: '#fff4d6', fg: '#a06200', label: 'Pending registry' },
  issued:             { bg: '#d4edda', fg: '#155724', label: 'Issued' },
  on_hold:            { bg: '#ffe4b5', fg: '#8a4a00', label: 'On hold' },
  returned:           { bg: '#ffe4b5', fg: '#8a4a00', label: 'Returned' },
  disputed:           { bg: '#fbd3d3', fg: '#7a1414', label: 'Disputed' },
  rejected:           { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rejected' },
  withdrawn:          { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
  cancelled:          { bg: '#e6e9ed', fg: '#3a4a5c', label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor (<10k)' },
  moderate: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate (<100k)' },
  major:    { bg: '#fff4d6', fg: '#a06200', label: 'Major (<500k)' },
  mega:     { bg: '#fde0e0', fg: '#9b1f1f', label: 'Mega (≥500k)' },
};

const TRANSFER_LABEL: Record<TransferType, string> = {
  article6:   'Article 6 (ITMO)',
  voluntary:  'Voluntary',
  compliance: 'Compliance',
};

const CATEGORY_LABEL: Record<Category, string> = {
  afolu:       'AFOLU (20% buffer)',
  renewables:  'Renewables',
  efficiency:  'Efficiency',
  industrial:  'Industrial',
  methane:     'Methane',
  cdr:         'CDR',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',             label: 'Active' },
  { key: 'all',                label: 'All' },
  { key: 'minor',              label: 'Minor' },
  { key: 'moderate',           label: 'Moderate' },
  { key: 'major',              label: 'Major' },
  { key: 'mega',               label: 'Mega' },
  { key: 'article6',           label: 'Article 6' },
  { key: 'afolu',              label: 'AFOLU' },
  { key: 'over_issuance',      label: 'Over-issuance' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'reportable',         label: 'Reportable' },
  { key: 'requested',          label: 'Requested' },
  { key: 'screening',          label: 'Screening' },
  { key: 'verification_check', label: 'Verif. check' },
  { key: 'serialization',      label: 'Serialization' },
  { key: 'pending_registry',   label: 'Pending registry' },
  { key: 'issued',             label: 'Issued' },
  { key: 'on_hold',            label: 'On hold' },
  { key: 'returned',           label: 'Returned' },
  { key: 'disputed',           label: 'Disputed' },
  { key: 'rejected',           label: 'Rejected' },
  { key: 'withdrawn',          label: 'Withdrawn' },
  { key: 'cancelled',          label: 'Cancelled' },
];

type ActionKind =
  | 'begin-screening' | 'verify-against-mrv' | 'assign-serials' | 'submit-to-registry'
  | 'confirm-issuance' | 'place-on-hold' | 'resume' | 'return-for-correction'
  | 'resubmit' | 'raise-dispute' | 'resolve-dispute' | 'reject' | 'withdraw' | 'cancel';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  requested:          'begin-screening',
  screening:          'verify-against-mrv',
  verification_check: 'assign-serials',
  serialization:      'submit-to-registry',
  pending_registry:   'confirm-issuance',
  issued:             null,
  on_hold:            'resume',
  returned:           'resubmit',
  disputed:           'resolve-dispute',
  rejected:           null,
  withdrawn:          null,
  cancelled:          null,
};

// Party annotation mirrors the spec ACTION_PARTY map — REGISTRY screens /
// serializes / submits / confirms / places on hold / returns / resolves
// disputes; the VVB cross-checks against MRV; the PROPONENT resumes /
// resubmits / withdraws; the DNA path runs through corresponding-adjustment
// binding at confirm. raise_dispute can come from any party (defaults to
// proponent), reject + cancel belong to the registry.
const ACTION_LABEL: Record<ActionKind, string> = {
  'begin-screening':       'Begin screening (registry)',
  'verify-against-mrv':    'Cross-check against MRV (VVB)',
  'assign-serials':        'Assign serial block (registry)',
  'submit-to-registry':    'Submit to registry (registry)',
  'confirm-issuance':      'Confirm issuance (registry)',
  'place-on-hold':         'Place on hold (registry)',
  'resume':                'Resume (proponent)',
  'return-for-correction': 'Return for correction (registry)',
  'resubmit':              'Resubmit (proponent)',
  'raise-dispute':         'Raise dispute',
  'resolve-dispute':       'Resolve dispute (registry)',
  'reject':                'Reject (registry)',
  'withdraw':              'Withdraw (proponent)',
  'cancel':                'Cancel (registry)',
};

const TERMINAL_STATES: ChainStatus[] = ['issued', 'rejected', 'withdrawn', 'cancelled'];
const HOLDABLE_STATES: ChainStatus[] = ['screening', 'verification_check', 'serialization', 'pending_registry'];
const RETURNABLE_STATES: ChainStatus[] = ['screening', 'verification_check'];
const DISPUTABLE_STATES: ChainStatus[] = ['verification_check', 'serialization', 'pending_registry'];
const REJECTABLE_STATES: ChainStatus[] = ['screening', 'verification_check', 'serialization', 'pending_registry', 'on_hold', 'returned', 'disputed'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['requested', 'screening', 'verification_check', 'returned'];
const CANCELLABLE_STATES: ChainStatus[] = ['requested', 'screening', 'verification_check', 'serialization', 'pending_registry', 'on_hold', 'returned', 'disputed'];

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

function fmtTco2e(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('en-ZA')} tCO₂e`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

export function CarbonIssuanceChainTab() {
  const [rows, setRows] = useState<IssuanceRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<IssuanceRow | null>(null);
  const [events, setEvents] = useState<IssuanceEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: IssuanceRow[] } & KpiSummary }>('/carbon-issuance/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, issued_count: d.issued_count,
          on_hold_count: d.on_hold_count, returned_count: d.returned_count,
          disputed_count: d.disputed_count, rejected_count: d.rejected_count,
          withdrawn_count: d.withdrawn_count, cancelled_count: d.cancelled_count,
          breached: d.breached, reportable_total: d.reportable_total,
          article6_count: d.article6_count, afolu_count: d.afolu_count,
          over_issuance_count: d.over_issuance_count,
          total_requested_tco2e: d.total_requested_tco2e,
          total_net_issuable_tco2e: d.total_net_issuable_tco2e,
          issued_tco2e: d.issued_tco2e,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load issuance records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: IssuanceRow; events: IssuanceEvent[] } }>(
        `/carbon-issuance/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load issuance history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')           return true;
      if (filter === 'active')        return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')      return r.sla_breached;
      if (filter === 'reportable')    return r.is_reportable_flag ?? !!r.is_reportable;
      if (filter === 'article6')      return r.transfer_type === 'article6';
      if (filter === 'afolu')         return r.category === 'afolu';
      if (filter === 'over_issuance') return r.over_issuance_flag_live ?? !!r.over_issuance_flag;
      if (filter === 'minor' || filter === 'moderate' || filter === 'major' || filter === 'mega') {
        return r.issuance_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: IssuanceRow) => {
    try {
      let body: Record<string, string | number | boolean> = {};
      if (action === 'begin-screening') {
        const basis = window.prompt('Screening basis — the registry completeness assessment of the issuance request:');
        if (!basis) return;
        const ref = window.prompt('Screening reference (e.g. SCR-2026-0007):') || '';
        body = { screening_basis: basis };
        if (ref) body.screening_ref = ref;
      } else if (action === 'verify-against-mrv') {
        const basis = window.prompt('Verification-check basis — the VVB cross-check of the request against the verified monitoring period:');
        if (!basis) return;
        const ref = window.prompt('Verification-check reference (e.g. VER-2026-0007):') || '';
        const vmKey = window.prompt('Vintage-monitoring key (project_id|vintage|period — drives the double-issuance guard):', row.vintage_monitoring_key || '') || '';
        const verified = window.prompt('Verified tCO₂e (from the MRV statement):', String(row.verified_tco2e ?? row.requested_tco2e));
        const already = window.prompt('Already-issued tCO₂e for THIS project+vintage (drives headroom):', String(row.already_issued_tco2e ?? 0));
        body = { verification_check_basis: basis };
        if (ref) body.verification_check_ref = ref;
        if (vmKey) body.vintage_monitoring_key = vmKey;
        if (verified && !Number.isNaN(Number(verified))) body.verified_tco2e = Number(verified);
        if (already && !Number.isNaN(Number(already))) body.already_issued_tco2e = Number(already);
      } else if (action === 'assign-serials') {
        const basis = window.prompt('Serialization basis — assignment of the unique serial-number block (W82 signature: serial transparency):');
        if (!basis) return;
        const ref = window.prompt('Serialization reference (e.g. SRL-2026-0007):') || '';
        const prefix = window.prompt('Serial-number prefix (e.g. ZA-CARBON-VER-2024):', row.serial_number_prefix || '') || '';
        const start = window.prompt('Serial-block start (block end is derived from net issuable):', String(row.serial_block_start ?? ''));
        const buffer = window.prompt('Buffer % override (blank = default — AFOLU 20%, non-AFOLU 5%):', '');
        body = { serialization_basis: basis };
        if (ref) body.serialization_ref = ref;
        if (prefix) body.serial_number_prefix = prefix;
        if (start && !Number.isNaN(Number(start))) body.serial_block_start = Number(start);
        if (buffer && !Number.isNaN(Number(buffer))) body.buffer_pct = Number(buffer);
      } else if (action === 'submit-to-registry') {
        const basis = window.prompt('Registry-submission basis — the issuance request is submitted into the registry for confirmation:');
        if (!basis) return;
        const ref = window.prompt('Registry submission reference (e.g. RGS-2026-0007):') || '';
        body = { registry_submission_basis: basis };
        if (ref) body.registry_submission_ref = ref;
      } else if (action === 'confirm-issuance') {
        const basis = window.prompt('Issuance basis — the registry confirms minting into the proponent holding account:');
        if (!basis) return;
        const ref = window.prompt('Issuance reference (e.g. ISS-2026-0007):') || '';
        const caApplied = row.requires_corresponding_adjustment_flag ?? !!row.requires_corresponding_adjustment;
        let caRef = '';
        let caFlag = 0;
        if (caApplied) {
          caFlag = 1;
          caRef = window.prompt('Corresponding-adjustment reference (Article 6 — the NDC authorisation):', row.corresponding_adjustment_ref || '') || '';
        }
        const regRef = window.prompt('Regulator reference (CA-required and large issuances cross to regulator inbox):', '') || '';
        body = { issuance_basis: basis };
        if (ref) body.issuance_ref = ref;
        if (caApplied) {
          body.ca_applied_flag = caFlag === 1;
          if (caRef) body.corresponding_adjustment_ref = caRef;
        }
        if (regRef) body.regulator_ref = regRef;
      } else if (action === 'place-on-hold') {
        const basis = window.prompt('Hold basis — pause the issuance pending information:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. mrv_query / dna_query / serial_review):', 'mrv_query') || '';
        const ref = window.prompt('Hold reference (e.g. HLD-2026-0007):') || '';
        body = { hold_basis: basis };
        if (reason) body.reason_code = reason;
        if (ref) body.hold_ref = ref;
      } else if (action === 'resume') {
        // No payload — the proponent resumes the chain and re-enters screening.
      } else if (action === 'return-for-correction') {
        const basis = window.prompt('Return basis — bounce the request back to the proponent for correction:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. methodology_mismatch / quantum_mismatch / serial_overlap):', 'quantum_mismatch') || '';
        const ref = window.prompt('Return reference (e.g. RET-2026-0007):') || '';
        body = { return_basis: basis };
        if (reason) body.reason_code = reason;
        if (ref) body.return_ref = ref;
      } else if (action === 'resubmit') {
        // No payload — the proponent resubmits after correction.
      } else if (action === 'raise-dispute') {
        const basis = window.prompt('Dispute basis — quantum or serial dispute (W82 signature: crosses regulator EVERY tier):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. serial_overlap / quantum_dispute / double_issuance):', 'quantum_dispute') || '';
        const ref = window.prompt('Dispute reference (e.g. DSP-2026-0007):') || '';
        const regRef = window.prompt('Regulator reference (W82 hard line — dispute always reportable):', '') || '';
        body = { dispute_basis: basis };
        if (reason) body.reason_code = reason;
        if (ref) body.dispute_ref = ref;
        if (regRef) body.regulator_ref = regRef;
      } else if (action === 'resolve-dispute') {
        // No payload — the dispute is resolved and the chain lands back at serialization.
      } else if (action === 'reject') {
        const basis = window.prompt('Rejection basis — the issuance request is not eligible to mint:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. methodology_fail / additionality_fail / over_issuance):', 'methodology_fail') || '';
        const ref = window.prompt('Rejection reference (e.g. REJ-2026-0007):') || '';
        const regRef = window.prompt('Regulator reference (major / mega only):', '') || '';
        body = { rejection_basis: basis };
        if (reason) body.reason_code = reason;
        if (ref) body.rejection_ref = ref;
        if (regRef) body.regulator_ref = regRef;
      } else if (action === 'withdraw') {
        const basis = window.prompt('Withdrawal basis — the proponent withdraws the issuance request:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. proponent_withdrawn / commercial):', 'proponent_withdrawn') || '';
        const ref = window.prompt('Withdrawal reference (e.g. WDR-2026-0007):') || '';
        body = { withdrawal_basis: basis };
        if (reason) body.reason_code = reason;
        if (ref) body.withdrawal_ref = ref;
      } else if (action === 'cancel') {
        const basis = window.prompt('Cancellation basis — registry cancels the request:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. proponent_request / duplicate):', 'proponent_request') || '';
        const ref = window.prompt('Cancellation reference (e.g. CAN-2026-0007):') || '';
        body = { cancellation_basis: basis };
        if (reason) body.reason_code = reason;
        if (ref) body.cancellation_ref = ref;
      }
      await api.post(`/carbon-issuance/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Carbon credit issuance &amp; serialization</h2>
          <p className="text-xs text-[#4a5568]">
            12-state minting chain · requested → screening → verification check → serialization →
            pending registry → issued, with on_hold/returned/disputed loops and terminal
            rejected/withdrawn/cancelled. INVERTED SLA: the larger the volume the longer every window — a
            minor mint gets the fast-track, a mega volume gets deeper diligence. The W82 signature is
            INTEGRITY-driven — raise_dispute crosses to the regulator inbox for EVERY tier (the hard line);
            confirm_issuance crosses for EVERY tier when CA-required (Article 6), else for the large tiers;
            reject and SLA breach cross for the large tiers. Beats Verra Registry on APX, Gold Standard
            Impact Registry, S&amp;P Global Environmental Registry, Cercarbono and Puro.earth — live serial-
            block transparency, buffer-pool maths (AFOLU 20% / non-AFOLU 5%), project+vintage cumulative
            headroom, double-issuance / over-issuance flags, and Article-6 corresponding-adjustment binding.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Issued" value={kpis?.issued_count ?? 0} tone="ok" />
        <Kpi label="On hold" value={kpis?.on_hold_count ?? 0} tone={(kpis?.on_hold_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Returned" value={kpis?.returned_count ?? 0} tone={(kpis?.returned_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Disputed" value={kpis?.disputed_count ?? 0} tone={(kpis?.disputed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Rejected" value={kpis?.rejected_count ?? 0} tone={(kpis?.rejected_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Withdrawn" value={kpis?.withdrawn_count ?? 0} />
        <Kpi label="Cancelled" value={kpis?.cancelled_count ?? 0} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Article 6 (CA)" value={kpis?.article6_count ?? 0} tone={(kpis?.article6_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="AFOLU" value={kpis?.afolu_count ?? 0} />
        <Kpi label="Over-issuance" value={kpis?.over_issuance_count ?? 0} tone={(kpis?.over_issuance_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Requested" value={fmtTco2e(kpis?.total_requested_tco2e ?? 0)} />
        <Kpi label="Net issuable" value={fmtTco2e(kpis?.total_net_issuable_tco2e ?? 0)} />
        <Kpi label="Issued tCO₂e" value={fmtTco2e(kpis?.issued_tco2e ?? 0)} tone="ok" />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Issuance #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Transfer</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Requested</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Net issuable</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.issuance_tier];
                const ca = r.transfer_type === 'article6';
                const reportable = r.is_reportable_flag ?? !!r.is_reportable;
                const over = r.over_issuance_flag_live ?? !!r.over_issuance_flag;
                const netIssuable = r.net_issuable_tco2e_live ?? r.net_issuable_tco2e ?? 0;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.issuance_number}
                      {reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                      {over && <span className="ml-1 text-[#9b1f1f]" title="Over-issuance flag">⚠</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[220px] truncate" title={r.project_name || ''}>
                      <div className="truncate">{r.project_name || '—'}</div>
                      <div className="text-[10px] text-[#4a5568] truncate">{r.registry_standard || '—'} · {CATEGORY_LABEL[r.category]}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      {TRANSFER_LABEL[r.transfer_type]}
                      {ca && <span className="ml-1 text-[#a06200]" title="Corresponding adjustment required">⚑</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">
                      {(r.requested_tco2e || 0).toLocaleString('en-ZA')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">
                      {Number(netIssuable).toLocaleString('en-ZA')}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[#4a5568]">No issuances match.</td></tr>
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
  row: IssuanceRow;
  events: IssuanceEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: IssuanceRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canHold = HOLDABLE_STATES.includes(row.chain_status);
  const canReturn = RETURNABLE_STATES.includes(row.chain_status);
  const canDispute = DISPUTABLE_STATES.includes(row.chain_status);
  const canReject = REJECTABLE_STATES.includes(row.chain_status);
  const canWithdraw = WITHDRAWABLE_STATES.includes(row.chain_status);
  const canCancel = CANCELLABLE_STATES.includes(row.chain_status);
  const requiresCA = row.requires_corresponding_adjustment_flag ?? !!row.requires_corresponding_adjustment;
  const reportable = row.is_reportable_flag ?? !!row.is_reportable;
  const over = row.over_issuance_flag_live ?? !!row.over_issuance_flag;
  const guardOk = row.double_issuance_guard_ok_flag ?? !!row.double_issuance_guard_ok;
  const bufferPct = row.buffer_pct_live ?? row.buffer_pct;
  const bufferContribution = row.buffer_contribution_tco2e_live ?? row.buffer_contribution_tco2e;
  const netIssuable = row.net_issuable_tco2e_live ?? row.net_issuable_tco2e;
  const headroom = row.project_vintage_headroom_tco2e_live ?? row.project_vintage_headroom_tco2e;
  const serialEnd = row.serial_block_end_live ?? row.serial_block_end;
  const blockSize = row.serial_block_size ?? (row.serial_block_start != null && serialEnd != null ? serialEnd - row.serial_block_start + 1 : null);
  const predicted = row.predicted_issuance_days_live ?? row.predicted_issuance_days;

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.issuance_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name || row.issuance_number}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.issuance_tier].label} · {row.registry_standard || '—'} · {TRANSFER_LABEL[row.transfer_type]} · {CATEGORY_LABEL[row.category]}
              </div>
              {row.source_wave && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"                value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"                 value={TIER_TONE[row.issuance_tier].label} />
            <Pair label="Registry standard"    value={row.registry_standard ?? '—'} />
            <Pair label="Transfer type"        value={TRANSFER_LABEL[row.transfer_type]} />
            <Pair label="Category"             value={CATEGORY_LABEL[row.category]} />
            <Pair label="Methodology"          value={row.methodology_id ?? '—'} />
            <Pair label="Host country"         value={row.host_country ?? '—'} />
            <Pair label="Corresp. adjustment"  value={requiresCA ? (row.ca_applied_flag ? 'Required + applied' : 'Required (Article 6)') : 'Not required'} />
            <Pair label="CA reference"         value={row.corresponding_adjustment_ref ?? '—'} />
            <Pair label="Vintage year"         value={row.vintage_year ? String(row.vintage_year) : '—'} />
            <Pair label="Monitoring period"    value={`${row.monitoring_period_start || '—'} → ${row.monitoring_period_end || '—'}`} />
            <Pair label="Vintage+monitoring"   value={row.vintage_monitoring_key ?? '—'} />
            <Pair label="Predicted issuance"   value={predicted ? `${predicted}d` : '—'} />
            <Pair label="Requested tCO₂e"      value={fmtTco2e(row.requested_tco2e)} />
            <Pair label="Verified tCO₂e"       value={fmtTco2e(row.verified_tco2e)} />
            <Pair label="Already issued"       value={fmtTco2e(row.already_issued_tco2e)} />
            <Pair label="Buffer %"             value={fmtPct(bufferPct)} />
            <Pair label="Buffer contribution"  value={fmtTco2e(bufferContribution)} />
            <Pair label="Net issuable"         value={fmtTco2e(netIssuable)} />
            <Pair label="Project+vintage headroom" value={fmtTco2e(headroom)} />
            <Pair label="Over-issuance"        value={over ? 'YES — exceeds verified - already' : 'No'} />
            <Pair label="Double-issuance guard" value={guardOk ? 'Pass' : 'Pending'} />
            <Pair label="Serial prefix"        value={row.serial_number_prefix ?? '—'} />
            <Pair label="Serial block"         value={row.serial_block_start != null && serialEnd != null ? `${row.serial_block_start} → ${serialEnd}` : '—'} />
            <Pair label="Serial block size"    value={blockSize != null ? `${blockSize.toLocaleString('en-ZA')}` : '—'} />
            <Pair label="Registry account"     value={row.registry_account_id ?? '—'} />
            <Pair label="Proponent"            value={row.proponent_party_name ?? '—'} />
            <Pair label="VVB"                  value={row.vvb_name ?? '—'} />
            <Pair label="DNA"                  value={row.dna_name ?? '—'} />
            <Pair label="Screening ref"        value={row.screening_ref ?? '—'} />
            <Pair label="Verification ref"     value={row.verification_check_ref ?? '—'} />
            <Pair label="Serialization ref"    value={row.serialization_ref ?? '—'} />
            <Pair label="Registry submission ref" value={row.registry_submission_ref ?? '—'} />
            <Pair label="Issuance ref"         value={row.issuance_ref ?? '—'} />
            <Pair label="Regulator ref"        value={row.regulator_ref ?? '—'} />
            <Pair label="Reason code"          value={row.reason_code ?? '—'} />
            <Pair label="Requested"            value={fmtDate(row.requested_at)} />
            <Pair label="Screening"            value={fmtDate(row.screening_at)} />
            <Pair label="Verification check"   value={fmtDate(row.verification_check_at)} />
            <Pair label="Serialization"        value={fmtDate(row.serialization_at)} />
            <Pair label="Pending registry"     value={fmtDate(row.pending_registry_at)} />
            <Pair label="Issued"               value={fmtDate(row.issued_at)} />
            <Pair label="On hold"              value={fmtDate(row.on_hold_at)} />
            <Pair label="Returned"             value={fmtDate(row.returned_at)} />
            <Pair label="Disputed"             value={fmtDate(row.disputed_at)} />
            <Pair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"           value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"       value={String(row.escalation_level)} />
            <Pair label="Reportable"           value={reportable ? 'Yes' : 'No'} />
          </div>
          {row.issuance_summary && (
            <BasisBlock label="Issuance summary" tone="#1a3a5c" text={row.issuance_summary} />
          )}
          {row.request_basis && (
            <BasisBlock label="Request basis" tone="#1a3a5c" text={row.request_basis} />
          )}
          {row.screening_basis && (
            <BasisBlock label="Screening basis (registry)" tone="#1a3a5c" text={row.screening_basis} />
          )}
          {row.verification_check_basis && (
            <BasisBlock label="Verification-check basis (VVB)" tone="#1a6b48" text={row.verification_check_basis} />
          )}
          {row.serialization_basis && (
            <BasisBlock label="Serialization basis (registry)" tone="#a06200" text={row.serialization_basis} />
          )}
          {row.registry_submission_basis && (
            <BasisBlock label="Registry submission basis" tone="#a06200" text={row.registry_submission_basis} />
          )}
          {row.issuance_basis && (
            <BasisBlock label="Issuance basis" tone="#155724" text={row.issuance_basis} />
          )}
          {row.hold_basis && (
            <BasisBlock label="Hold basis" tone="#8a4a00" text={row.hold_basis} />
          )}
          {row.return_basis && (
            <BasisBlock label="Return basis" tone="#8a4a00" text={row.return_basis} />
          )}
          {row.dispute_basis && (
            <BasisBlock label="Dispute basis" tone="#7a1414" text={row.dispute_basis} />
          )}
          {row.rejection_basis && (
            <BasisBlock label="Rejection basis" tone="#9b1f1f" text={row.rejection_basis} />
          )}
          {row.withdrawal_basis && (
            <BasisBlock label="Withdrawal basis" tone="#6b1f1f" text={row.withdrawal_basis} />
          )}
          {row.cancellation_basis && (
            <BasisBlock label="Cancellation basis" tone="#3a4a5c" text={row.cancellation_basis} />
          )}
        </section>

        {(nextAction || canHold || canReturn || canDispute || canReject || canWithdraw || canCancel) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#c2873a]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canHold && (
                <button type="button"
                  onClick={() => onAct('place-on-hold', row)}
                  className="rounded border border-yellow-300 bg-white px-3 py-1.5 text-[12px] font-medium text-[#8a4a00] hover:bg-yellow-50"
                >
                  {ACTION_LABEL['place-on-hold']}
                </button>
              )}
              {canReturn && (
                <button type="button"
                  onClick={() => onAct('return-for-correction', row)}
                  className="rounded border border-yellow-300 bg-white px-3 py-1.5 text-[12px] font-medium text-[#8a4a00] hover:bg-yellow-50"
                >
                  {ACTION_LABEL['return-for-correction']}
                </button>
              )}
              {canDispute && (
                <button type="button"
                  onClick={() => onAct('raise-dispute', row)}
                  className="rounded border border-red-400 bg-white px-3 py-1.5 text-[12px] font-medium text-[#7a1414] hover:bg-[#fbd3d3]"
                >
                  {ACTION_LABEL['raise-dispute']}
                </button>
              )}
              {canReject && (
                <button type="button"
                  onClick={() => onAct('reject', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['reject']}
                </button>
              )}
              {canWithdraw && (
                <button type="button"
                  onClick={() => onAct('withdraw', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL['withdraw']}
                </button>
              )}
              {canCancel && (
                <button type="button"
                  onClick={() => onAct('cancel', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3a4a5c] hover:bg-[#e6e9ed]"
                >
                  {ACTION_LABEL['cancel']}
                </button>
              )}
            </div>
          </section>
        )}

        <section className="px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Audit timeline</div>
          {events.length === 0 ? (
            <div className="text-[12px] text-[#4a5568]">No events yet.</div>
          ) : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#0c2a4d]">{e.event_type}</span>
                    <span className="text-[#4a5568] tabular-nums">{fmtDate(e.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    {(e.from_status || e.to_status) && (
                      <span className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</span>
                    )}
                    {e.actor_party && (
                      <span className="rounded bg-[#eef1f6] px-1.5 py-0.5 text-[10px] font-medium text-[#4a5568]">{e.actor_party}</span>
                    )}
                  </div>
                  {e.notes && <div className="mt-1 text-[#1a3a5c]">{e.notes}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function BasisBlock({ label, tone, text }: { label: string; tone: string; text: string }) {
  return (
    <div className="mt-3 text-[12px]">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: tone }}>{label}</div>
      <div className="whitespace-pre-wrap" style={{ color: tone }}>{text}</div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}
