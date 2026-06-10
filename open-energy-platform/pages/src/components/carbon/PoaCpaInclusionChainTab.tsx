// Wave 73 — Carbon PoA / Programme-of-Activities Sub-Project (CPA) Inclusion &
// Conformance lifecycle tab.
//
// The ONE-TO-MANY operational layer of the carbon portfolio. A Programme of
// Activities (CDM PoA / Gold Standard GS4GG programme / Verra grouped project)
// is registered ONCE; individual Component Project Activities (CPAs) are then
// screened in over the programme lifetime, gated on a host-country Letter of
// Approval, monitored and verified for ongoing conformance — and DELISTED
// (excluded) if they stop conforming. Where W37 registers a single project,
// W11 verifies a monitoring period, W56 re-validates a crediting period and
// W65 sells reductions forward, THIS chain governs how component activities are
// screened into and kept conformant within a registered programme.
//
//   cpa_proposed → eligibility_screening → methodology_check → loa_pending →
//     inclusion_review → included → monitoring → verified (clean path);
//   monitoring loop: verified → (continue) → monitoring → (verify) → verified;
//   rejected (failed eligibility/methodology/inclusion), excluded (DELISTED),
//   withdrawn (pulled before inclusion), completed (end of crediting).
//
// INVERTED SLA — the larger the CPA, the LONGER every window (deeper diligence);
// a micro CPA gets the fast-track. The W73 signature is DELISTING-driven:
// exclude_cpa crosses to the regulator inbox for EVERY tier; approve_inclusion
// crosses when a corresponding adjustment is required (Article 6) else for the
// large tiers (large + mega); reject_cpa and SLA breach cross for the large
// tiers. Beats CDM PoA / GS4GG / Verra grouped projects (slow, manual,
// month-long CPA inclusion) via automated eligibility scoring, a real-time
// double-counting / geo-overlap guard, programme-cap headroom and an SLA-driven
// inclusion turnaround the desk can quote up front.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'cpa_proposed' | 'eligibility_screening' | 'methodology_check' | 'loa_pending'
  | 'inclusion_review' | 'included' | 'monitoring' | 'verified'
  | 'rejected' | 'excluded' | 'withdrawn' | 'completed';

type Tier = 'micro' | 'small' | 'medium' | 'large' | 'mega';

type TransferType = 'article6' | 'voluntary' | 'compliance';

interface CpaRow {
  id: string;
  cpa_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  programme_id: string;
  programme_name: string | null;
  registry_standard: string | null;
  methodology_id: string | null;
  cpa_ref: string | null;
  cpa_name: string | null;
  proponent_party_id: string | null;
  proponent_party_name: string | null;
  coordinating_entity_name: string | null;
  dna_name: string | null;
  vvb_name: string | null;
  host_country: string | null;
  geo_key: string | null;
  transfer_type: TransferType;
  cpa_tier: Tier;
  annual_er_tco2e: number;
  requires_corresponding_adjustment: number;
  corresponding_adjustment_ref: string | null;
  programme_cap_er_tco2e: number | null;
  included_er_tco2e: number | null;
  programme_headroom_tco2e: number | null;
  vintage_year: number | null;
  crediting_period_start: string | null;
  crediting_period_end: string | null;
  methodology_applicability: number | null;
  additionality_strength: number | null;
  monitoring_readiness: number | null;
  loa_confidence: number | null;
  eligibility_score: number | null;
  predicted_inclusion_days: number | null;
  screened_flag: number;
  methodology_ok_flag: number;
  loa_received_flag: number;
  inclusion_submitted_flag: number;
  included_flag: number;
  verified_flag: number;
  screening_ref: string | null;
  methodology_ref: string | null;
  loa_ref: string | null;
  inclusion_ref: string | null;
  monitoring_ref: string | null;
  verification_ref: string | null;
  exclusion_ref: string | null;
  rejection_ref: string | null;
  withdrawal_ref: string | null;
  completion_ref: string | null;
  regulator_ref: string | null;
  proposal_basis: string | null;
  screening_basis: string | null;
  methodology_basis: string | null;
  loa_basis: string | null;
  inclusion_basis: string | null;
  monitoring_basis: string | null;
  verification_basis: string | null;
  exclusion_basis: string | null;
  rejection_basis: string | null;
  withdrawal_basis: string | null;
  completion_basis: string | null;
  reason_code: string | null;
  cpa_summary: string | null;
  monitoring_round: number;
  chain_status: ChainStatus;
  cpa_proposed_at: string;
  eligibility_screening_at: string | null;
  methodology_check_at: string | null;
  loa_pending_at: string | null;
  inclusion_review_at: string | null;
  included_at: string | null;
  monitoring_at: string | null;
  verified_at: string | null;
  rejected_at: string | null;
  excluded_at: string | null;
  withdrawn_at: string | null;
  completed_at: string | null;
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
  programme_headroom_live?: number;
}

interface CpaEvent {
  id: string;
  inclusion_id: string;
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
  included_count: number;
  monitoring_count: number;
  verified_count: number;
  excluded_count: number;
  rejected_count: number;
  withdrawn_count: number;
  completed_count: number;
  breached: number;
  reportable_total: number;
  article6_count: number;
  total_annual_er: number;
  included_annual_er: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  cpa_proposed:          { bg: '#e3e7ec', fg: '#557',    label: 'Proposed' },
  eligibility_screening: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Eligibility screening' },
  methodology_check:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Methodology check' },
  loa_pending:           { bg: '#fff4d6', fg: '#a06200', label: 'LoA pending' },
  inclusion_review:      { bg: '#fff4d6', fg: '#a06200', label: 'Inclusion review' },
  included:              { bg: '#d4edda', fg: '#155724', label: 'Included' },
  monitoring:            { bg: '#dbf0e6', fg: '#1a6b48', label: 'Monitoring' },
  verified:              { bg: '#d4edda', fg: '#155724', label: 'Verified' },
  rejected:              { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rejected' },
  excluded:              { bg: '#fbd3d3', fg: '#7a1414', label: 'Excluded (delisted)' },
  withdrawn:             { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
  completed:             { bg: '#e6e9ed', fg: '#3a4a5c', label: 'Completed' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  micro:  { bg: '#e3e7ec', fg: '#557',    label: 'Micro (<1k)' },
  small:  { bg: '#dbecfb', fg: '#1a3a5c', label: 'Small (<10k)' },
  medium: { bg: '#fff4d6', fg: '#a06200', label: 'Medium (<100k)' },
  large:  { bg: '#ffe4b5', fg: '#8a4a00', label: 'Large (<500k)' },
  mega:   { bg: '#fde0e0', fg: '#9b1f1f', label: 'Mega (≥500k)' },
};

const TRANSFER_LABEL: Record<TransferType, string> = {
  article6:   'Article 6 (ITMO)',
  voluntary:  'Voluntary',
  compliance: 'Compliance',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'Active' },
  { key: 'all',                   label: 'All' },
  { key: 'micro',                 label: 'Micro' },
  { key: 'small',                 label: 'Small' },
  { key: 'medium',                label: 'Medium' },
  { key: 'large',                 label: 'Large' },
  { key: 'mega',                  label: 'Mega' },
  { key: 'article6',              label: 'Article 6' },
  { key: 'included',              label: 'Included' },
  { key: 'monitoring',            label: 'Monitoring' },
  { key: 'verified',              label: 'Verified' },
  { key: 'excluded',              label: 'Excluded' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'cpa_proposed',          label: 'Proposed' },
  { key: 'eligibility_screening', label: 'Screening' },
  { key: 'methodology_check',     label: 'Methodology' },
  { key: 'loa_pending',           label: 'LoA pending' },
  { key: 'inclusion_review',      label: 'Inclusion review' },
  { key: 'rejected',              label: 'Rejected' },
  { key: 'withdrawn',             label: 'Withdrawn' },
  { key: 'completed',             label: 'Completed' },
];

type ActionKind =
  | 'screen-eligibility' | 'check-methodology' | 'request-loa' | 'submit-inclusion'
  | 'approve-inclusion' | 'begin-monitoring' | 'verify-period' | 'continue-monitoring'
  | 'reject-cpa' | 'exclude-cpa' | 'withdraw-cpa' | 'complete-cpa';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  cpa_proposed:          'screen-eligibility',
  eligibility_screening: 'check-methodology',
  methodology_check:     'request-loa',
  loa_pending:           'submit-inclusion',
  inclusion_review:      'approve-inclusion',
  included:              'begin-monitoring',
  monitoring:            'verify-period',
  verified:              'continue-monitoring',
  rejected:              null,
  excluded:              null,
  withdrawn:             null,
  completed:             null,
};

// Party annotation per action mirrors the spec ACTION_PARTY map: the
// COORDINATING ENTITY screens / checks methodology / approves inclusion /
// continues monitoring / rejects / excludes / completes; the DNA issues the
// host-country Letter of Approval; the PROPONENT submits inclusion / begins
// monitoring / withdraws; the VVB verifies the monitoring period.
const ACTION_LABEL: Record<ActionKind, string> = {
  'screen-eligibility':  'Screen eligibility (coordinating entity)',
  'check-methodology':   'Check methodology (coordinating entity)',
  'request-loa':         'Request host-country LoA (DNA)',
  'submit-inclusion':    'Submit for inclusion (proponent)',
  'approve-inclusion':   'Approve inclusion (coordinating entity)',
  'begin-monitoring':    'Begin monitoring (proponent)',
  'verify-period':       'Verify period (VVB)',
  'continue-monitoring': 'Continue monitoring (coordinating entity)',
  'reject-cpa':          'Reject CPA (coordinating entity)',
  'exclude-cpa':         'Exclude / delist CPA (coordinating entity)',
  'withdraw-cpa':        'Withdraw CPA (proponent)',
  'complete-cpa':        'Complete CPA (coordinating entity)',
};

const TERMINAL_STATES: ChainStatus[] = ['rejected', 'excluded', 'withdrawn', 'completed'];
const REJECTABLE_STATES: ChainStatus[] = ['eligibility_screening', 'methodology_check', 'inclusion_review'];
const EXCLUDABLE_STATES: ChainStatus[] = ['included', 'monitoring', 'verified'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['cpa_proposed', 'eligibility_screening', 'methodology_check', 'loa_pending', 'inclusion_review'];
const COMPLETABLE_STATES: ChainStatus[] = ['monitoring', 'verified'];

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

function fmtScore(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n}/100`;
}

export function PoaCpaInclusionChainTab() {
  const [rows, setRows] = useState<CpaRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<CpaRow | null>(null);
  const [events, setEvents] = useState<CpaEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: CpaRow[] } & KpiSummary }>('/poa-inclusion/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, included_count: d.included_count,
          monitoring_count: d.monitoring_count, verified_count: d.verified_count,
          excluded_count: d.excluded_count, rejected_count: d.rejected_count,
          withdrawn_count: d.withdrawn_count, completed_count: d.completed_count,
          breached: d.breached, reportable_total: d.reportable_total,
          article6_count: d.article6_count, total_annual_er: d.total_annual_er,
          included_annual_er: d.included_annual_er,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load CPA inclusion records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: CpaRow; events: CpaEvent[] } }>(
        `/poa-inclusion/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load CPA history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable_flag ?? !!r.is_reportable;
      if (filter === 'article6')   return r.transfer_type === 'article6';
      if (filter === 'micro' || filter === 'small' || filter === 'medium' || filter === 'large' || filter === 'mega') {
        return r.cpa_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: CpaRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'screen-eligibility') {
        const basis = window.prompt('Screening basis — the automated eligibility assessment of the proposed CPA against the programme inclusion criteria:');
        if (!basis) return;
        const ref = window.prompt('Screening reference (e.g. SCR-2026-0007):') || '';
        const geo = window.prompt('Geo key (erf / parcel / grid-node id — drives the double-counting / overlap guard):', row.geo_key || '') || '';
        const ma = window.prompt('Methodology applicability (0..1):', String(row.methodology_applicability ?? 0.8));
        const ad = window.prompt('Additionality strength (0..1):', String(row.additionality_strength ?? 0.8));
        const mr = window.prompt('Monitoring readiness (0..1):', String(row.monitoring_readiness ?? 0.8));
        const lc = window.prompt('LoA confidence (0..1):', String(row.loa_confidence ?? 0.8));
        body = { screening_basis: basis };
        if (ref) body.screening_ref = ref;
        if (geo) body.geo_key = geo;
        if (ma && !Number.isNaN(Number(ma))) body.methodology_applicability = Number(ma);
        if (ad && !Number.isNaN(Number(ad))) body.additionality_strength = Number(ad);
        if (mr && !Number.isNaN(Number(mr))) body.monitoring_readiness = Number(mr);
        if (lc && !Number.isNaN(Number(lc))) body.loa_confidence = Number(lc);
      } else if (action === 'check-methodology') {
        const basis = window.prompt('Methodology basis — confirmation the CPA conforms to the registered programme methodology:');
        if (!basis) return;
        const ref = window.prompt('Methodology reference (e.g. METH-2026-0007):') || '';
        const methId = window.prompt('Methodology id (e.g. AMS-I.D / VM0042):', row.methodology_id || '') || '';
        body = { methodology_basis: basis };
        if (ref) body.methodology_ref = ref;
        if (methId) body.methodology_id = methId;
      } else if (action === 'request-loa') {
        const basis = window.prompt('LoA basis — the host-country DNA Letter of Approval gating inclusion:');
        if (!basis) return;
        const ref = window.prompt('LoA reference (e.g. LOA-ZA-2026-0007):') || '';
        const caRef = window.prompt('Corresponding-adjustment reference (Article 6 only — the NDC authorisation):', row.corresponding_adjustment_ref || '') || '';
        body = { loa_basis: basis };
        if (ref) body.loa_ref = ref;
        if (caRef) body.corresponding_adjustment_ref = caRef;
      } else if (action === 'submit-inclusion') {
        const basis = window.prompt('Inclusion basis — the inclusion request submitted into the registered programme:');
        if (!basis) return;
        const ref = window.prompt('Inclusion reference (e.g. INC-2026-0007):') || '';
        body = { inclusion_basis: basis };
        if (ref) body.inclusion_ref = ref;
      } else if (action === 'approve-inclusion') {
        const basis = window.prompt('Inclusion approval basis — the CPA is screened into the programme:');
        if (!basis) return;
        const ref = window.prompt('Inclusion reference (e.g. INC-2026-0007):') || '';
        const includedEr = window.prompt('Programme included ER after this CPA (tCO₂e — leave blank to add this CPA to the running total):', '');
        const regRef = window.prompt('Regulator reference (if reportable):', '') || '';
        body = { inclusion_basis: basis };
        if (ref) body.inclusion_ref = ref;
        if (includedEr && !Number.isNaN(Number(includedEr))) body.included_er_tco2e = Number(includedEr);
        if (regRef) body.regulator_ref = regRef;
      } else if (action === 'begin-monitoring') {
        const basis = window.prompt('Monitoring basis — the CPA enters its monitoring period under the programme:');
        if (!basis) return;
        const ref = window.prompt('Monitoring reference (e.g. MON-2026-0007):') || '';
        body = { monitoring_basis: basis };
        if (ref) body.monitoring_ref = ref;
      } else if (action === 'verify-period') {
        const basis = window.prompt('Verification basis — the VVB confirms ongoing conformance for the monitoring period:');
        if (!basis) return;
        const ref = window.prompt('Verification reference (e.g. VER-2026-0007):') || '';
        body = { verification_basis: basis };
        if (ref) body.verification_ref = ref;
      } else if (action === 'continue-monitoring') {
        const basis = window.prompt('Monitoring basis — the CPA continues into the next monitoring period:');
        if (!basis) return;
        const ref = window.prompt('Monitoring reference (e.g. MON-2026-0008):') || '';
        body = { monitoring_basis: basis };
        if (ref) body.monitoring_ref = ref;
      } else if (action === 'reject-cpa') {
        const basis = window.prompt('Rejection basis — the CPA failed eligibility, methodology or inclusion review:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. methodology_mismatch / additionality_fail / overlap):', 'methodology_mismatch') || '';
        const ref = window.prompt('Rejection reference (e.g. REJ-2026-0007):') || '';
        const regRef = window.prompt('Regulator reference (large/mega only):', '') || '';
        body = { rejection_basis: basis };
        if (reason) body.reason_code = reason;
        if (ref) body.rejection_ref = ref;
        if (regRef) body.regulator_ref = regRef;
      } else if (action === 'exclude-cpa') {
        const basis = window.prompt('Exclusion basis — DELIST the CPA for non-conformance after inclusion (the W73 signature):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. non_conformance / reversal / monitoring_lapse):', 'non_conformance') || '';
        const ref = window.prompt('Exclusion reference (e.g. EXC-2026-0007):') || '';
        const regRef = window.prompt('Regulator reference (delisting always reportable):', '') || '';
        body = { exclusion_basis: basis };
        if (reason) body.reason_code = reason;
        if (ref) body.exclusion_ref = ref;
        if (regRef) body.regulator_ref = regRef;
      } else if (action === 'withdraw-cpa') {
        const basis = window.prompt('Withdrawal basis — the proponent pulls the CPA before inclusion:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. proponent_withdrawn / commercial):', 'proponent_withdrawn') || '';
        const ref = window.prompt('Withdrawal reference (e.g. WDR-2026-0007):') || '';
        body = { withdrawal_basis: basis };
        if (reason) body.reason_code = reason;
        if (ref) body.withdrawal_ref = ref;
      } else if (action === 'complete-cpa') {
        const basis = window.prompt('Completion basis — the CPA reached the end of crediting under the programme:');
        if (!basis) return;
        const ref = window.prompt('Completion reference (e.g. CMP-2026-0007):') || '';
        body = { completion_basis: basis };
        if (ref) body.completion_ref = ref;
      }
      await api.post(`/poa-inclusion/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Carbon PoA — CPA inclusion &amp; conformance</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage one-to-many inclusion chain · proposed → eligibility screening → methodology check →
            LoA pending → inclusion review → included → monitoring → verified, with a verified ↔ monitoring
            conformance loop. A registered Programme of Activities screens individual Component Project
            Activities (CPAs) in over its lifetime, gated on a host-country Letter of Approval, and DELISTS
            (excludes) them if they stop conforming. INVERTED SLA: the larger the CPA, the longer every window —
            a micro CPA gets the fast-track. The W73 signature is delisting-driven — exclude_cpa crosses to the
            regulator inbox for every tier; approve_inclusion crosses when a corresponding adjustment is required
            (Article 6) else for the large tiers; reject and SLA breach cross for the large tiers. Beats CDM PoA /
            GS4GG / Verra grouped projects via automated eligibility scoring, a real-time double-counting / overlap
            guard, programme-cap headroom and an SLA-driven inclusion turnaround the desk can quote up front.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Included" value={kpis?.included_count ?? 0} tone="ok" />
        <Kpi label="Monitoring" value={kpis?.monitoring_count ?? 0} tone={(kpis?.monitoring_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Verified" value={kpis?.verified_count ?? 0} tone="ok" />
        <Kpi label="Excluded (delisted)" value={kpis?.excluded_count ?? 0} tone={(kpis?.excluded_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Rejected" value={kpis?.rejected_count ?? 0} tone={(kpis?.rejected_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Withdrawn" value={kpis?.withdrawn_count ?? 0} />
        <Kpi label="Completed" value={kpis?.completed_count ?? 0} tone="ok" />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Article 6 (CA)" value={kpis?.article6_count ?? 0} tone={(kpis?.article6_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Total ER/yr" value={fmtTco2e(kpis?.total_annual_er ?? 0)} />
        <Kpi label="Included ER/yr" value={fmtTco2e(kpis?.included_annual_er ?? 0)} tone="ok" />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">CPA #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Programme / CPA</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Transfer</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">ER/yr</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Elig.</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.cpa_tier];
                const ca = r.transfer_type === 'article6';
                const reportable = r.is_reportable_flag ?? !!r.is_reportable;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.cpa_number}
                      {reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[220px] truncate" title={`${r.programme_name || ''}${r.cpa_name ? ' / ' + r.cpa_name : ''}`}>
                      <div className="truncate">{r.programme_name || '—'}</div>
                      {r.cpa_name && <div className="text-[10px] text-[#4a5568] truncate">{r.cpa_name}</div>}
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
                      {(r.annual_er_tco2e || 0).toLocaleString('en-ZA')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">
                      {fmtScore(r.eligibility_score)}
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
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[#4a5568]">No CPAs match.</td></tr>
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
  row: CpaRow;
  events: CpaEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: CpaRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canReject = REJECTABLE_STATES.includes(row.chain_status);
  const canExclude = EXCLUDABLE_STATES.includes(row.chain_status);
  const canComplete = COMPLETABLE_STATES.includes(row.chain_status);
  const canWithdraw = WITHDRAWABLE_STATES.includes(row.chain_status);
  const requiresCA = row.requires_corresponding_adjustment_flag ?? !!row.requires_corresponding_adjustment;
  const reportable = row.is_reportable_flag ?? !!row.is_reportable;
  const headroom = row.programme_headroom_live ?? row.programme_headroom_tco2e;

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.cpa_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.cpa_name || row.programme_name || row.cpa_number}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.cpa_tier].label} · {row.registry_standard || '—'} · {TRANSFER_LABEL[row.transfer_type]}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                {row.programme_name || row.programme_id}
                {row.monitoring_round > 0 ? ` · monitoring round ${row.monitoring_round}` : ''}
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
            <Pair label="Tier"                 value={TIER_TONE[row.cpa_tier].label} />
            <Pair label="Registry standard"    value={row.registry_standard ?? '—'} />
            <Pair label="Transfer type"        value={TRANSFER_LABEL[row.transfer_type]} />
            <Pair label="Methodology"          value={row.methodology_id ?? '—'} />
            <Pair label="Host country"         value={row.host_country ?? '—'} />
            <Pair label="Corresp. adjustment"  value={requiresCA ? 'Required (Article 6)' : 'Not required'} />
            <Pair label="CA reference"         value={row.corresponding_adjustment_ref ?? '—'} />
            <Pair label="Geo key"              value={row.geo_key ?? '—'} />
            <Pair label="Annual ER"            value={fmtTco2e(row.annual_er_tco2e)} />
            <Pair label="Eligibility score"    value={fmtScore(row.eligibility_score)} />
            <Pair label="Predicted inclusion"  value={row.predicted_inclusion_days ? `${row.predicted_inclusion_days}d` : '—'} />
            <Pair label="Methodology applic."  value={row.methodology_applicability != null ? row.methodology_applicability.toFixed(2) : '—'} />
            <Pair label="Additionality"        value={row.additionality_strength != null ? row.additionality_strength.toFixed(2) : '—'} />
            <Pair label="Monitoring readiness" value={row.monitoring_readiness != null ? row.monitoring_readiness.toFixed(2) : '—'} />
            <Pair label="LoA confidence"       value={row.loa_confidence != null ? row.loa_confidence.toFixed(2) : '—'} />
            <Pair label="Programme cap"        value={fmtTco2e(row.programme_cap_er_tco2e)} />
            <Pair label="Included ER"          value={fmtTco2e(row.included_er_tco2e)} />
            <Pair label="Programme headroom"   value={fmtTco2e(headroom)} />
            <Pair label="Vintage year"         value={row.vintage_year ? String(row.vintage_year) : '—'} />
            <Pair label="Crediting period"     value={`${row.crediting_period_start || '—'} → ${row.crediting_period_end || '—'}`} />
            <Pair label="Proponent"            value={row.proponent_party_name ?? '—'} />
            <Pair label="Coordinating entity"  value={row.coordinating_entity_name ?? '—'} />
            <Pair label="DNA"                  value={row.dna_name ?? '—'} />
            <Pair label="VVB"                  value={row.vvb_name ?? '—'} />
            <Pair label="Screening ref"        value={row.screening_ref ?? '—'} />
            <Pair label="Methodology ref"      value={row.methodology_ref ?? '—'} />
            <Pair label="LoA ref"              value={row.loa_ref ?? '—'} />
            <Pair label="Inclusion ref"        value={row.inclusion_ref ?? '—'} />
            <Pair label="Verification ref"     value={row.verification_ref ?? '—'} />
            <Pair label="Regulator ref"        value={row.regulator_ref ?? '—'} />
            <Pair label="Reason code"          value={row.reason_code ?? '—'} />
            <Pair label="Proposed"             value={fmtDate(row.cpa_proposed_at)} />
            <Pair label="Screened"             value={fmtDate(row.eligibility_screening_at)} />
            <Pair label="Methodology checked"  value={fmtDate(row.methodology_check_at)} />
            <Pair label="LoA pending"          value={fmtDate(row.loa_pending_at)} />
            <Pair label="Inclusion review"     value={fmtDate(row.inclusion_review_at)} />
            <Pair label="Included"             value={fmtDate(row.included_at)} />
            <Pair label="Monitoring"           value={fmtDate(row.monitoring_at)} />
            <Pair label="Verified"             value={fmtDate(row.verified_at)} />
            <Pair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"           value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"       value={String(row.escalation_level)} />
            <Pair label="Reportable"           value={reportable ? 'Yes' : 'No'} />
          </div>
          {row.cpa_summary && (
            <BasisBlock label="CPA summary" tone="#1a3a5c" text={row.cpa_summary} />
          )}
          {row.proposal_basis && (
            <BasisBlock label="Proposal basis" tone="#1a3a5c" text={row.proposal_basis} />
          )}
          {row.screening_basis && (
            <BasisBlock label="Screening basis" tone="#1a3a5c" text={row.screening_basis} />
          )}
          {row.methodology_basis && (
            <BasisBlock label="Methodology basis" tone="#1a3a5c" text={row.methodology_basis} />
          )}
          {row.loa_basis && (
            <BasisBlock label="LoA basis (DNA)" tone="#a06200" text={row.loa_basis} />
          )}
          {row.inclusion_basis && (
            <BasisBlock label="Inclusion basis" tone="#a06200" text={row.inclusion_basis} />
          )}
          {row.monitoring_basis && (
            <BasisBlock label="Monitoring basis" tone="#1a6b48" text={row.monitoring_basis} />
          )}
          {row.verification_basis && (
            <BasisBlock label="Verification basis (VVB)" tone="#155724" text={row.verification_basis} />
          )}
          {row.rejection_basis && (
            <BasisBlock label="Rejection basis" tone="#9b1f1f" text={row.rejection_basis} />
          )}
          {row.exclusion_basis && (
            <BasisBlock label="Exclusion / delisting basis" tone="#7a1414" text={row.exclusion_basis} />
          )}
          {row.withdrawal_basis && (
            <BasisBlock label="Withdrawal basis" tone="#6b1f1f" text={row.withdrawal_basis} />
          )}
          {row.completion_basis && (
            <BasisBlock label="Completion basis" tone="#3a4a5c" text={row.completion_basis} />
          )}
        </section>

        {(nextAction || canReject || canExclude || canComplete || canWithdraw) && (
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
              {canComplete && (
                <button type="button"
                  onClick={() => onAct('complete-cpa', row)}
                  className="rounded border border-green-300 bg-white px-3 py-1.5 text-[12px] font-medium text-green-700 hover:bg-green-50"
                >
                  {ACTION_LABEL['complete-cpa']}
                </button>
              )}
              {canReject && (
                <button type="button"
                  onClick={() => onAct('reject-cpa', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['reject-cpa']}
                </button>
              )}
              {canExclude && (
                <button type="button"
                  onClick={() => onAct('exclude-cpa', row)}
                  className="rounded border border-red-400 bg-white px-3 py-1.5 text-[12px] font-medium text-[#7a1414] hover:bg-[#fbd3d3]"
                >
                  {ACTION_LABEL['exclude-cpa']}
                </button>
              )}
              {canWithdraw && (
                <button type="button"
                  onClick={() => onAct('withdraw-cpa', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL['withdraw-cpa']}
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
