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

interface ChangeInLawEvent {
  id: string;
  change_in_law_id: string;
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

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  event_logged:          { bg: '#e3e7ec', fg: '#557',    label: 'Event logged' },
  eligibility_review:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Eligibility review' },
  impact_assessment:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Impact assessment' },
  claim_submitted:       { bg: '#fff4d6', fg: '#a06200', label: 'Claim submitted' },
  counterparty_review:   { bg: '#fff4d6', fg: '#8a4a00', label: 'Counterparty review' },
  negotiation:           { bg: '#ffe4b5', fg: '#8a4a00', label: 'Negotiation' },
  determination_pending: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Determination pending' },
  in_arbitration:        { bg: '#ffe4e1', fg: '#a04040', label: 'In arbitration' },
  relief_granted:        { bg: '#d4edda', fg: '#155724', label: 'Relief granted' },
  implemented:           { bg: '#daf5e2', fg: '#1f6b3a', label: 'Implemented' },
  rejected:              { bg: '#ede0e0', fg: '#6b3a3a', label: 'Rejected' },
  withdrawn:             { bg: '#ede0e0', fg: '#6b3a3a', label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
  moderate: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate' },
  material: { bg: '#fff4d6', fg: '#8a4a00', label: 'Material' },
  major:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Major' },
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
};

const CHANGE_LABEL: Record<ChangeType, string> = {
  tax_change:            'Tax',
  regulatory_change:     'Regulatory',
  statutory_change:      'Statutory',
  discriminatory_change: 'Discriminatory',
  other_change:          'Other (commercial)',
};

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

type ActionKind =
  | 'open-eligibility-review' | 'confirm-eligible' | 'reject-ineligible' | 'submit-claim'
  | 'acknowledge-claim' | 'enter-negotiation' | 'dispute-claim' | 'refer-to-arbitration'
  | 'reach-agreement' | 'issue-determination' | 'determine-no-relief' | 'award-relief'
  | 'award-no-relief' | 'implement-relief' | 'withdraw-claim';

// Primary forward action per state. Branch states surface their secondary
// actions (reject / dispute / refer / no-relief / withdraw) in the drawer.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  event_logged:          'open-eligibility-review',
  eligibility_review:    'confirm-eligible',
  impact_assessment:     'submit-claim',
  claim_submitted:       'acknowledge-claim',
  counterparty_review:   'enter-negotiation',
  negotiation:           'reach-agreement',
  determination_pending: 'issue-determination',
  in_arbitration:        'award-relief',
  relief_granted:        'implement-relief',
  implemented:           null,
  rejected:              null,
  withdrawn:             null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'open-eligibility-review': 'Open eligibility review (counterparty)',
  'confirm-eligible':        'Confirm eligible → assess impact (counterparty)',
  'reject-ineligible':       'Reject as ineligible (counterparty)',
  'submit-claim':            'Submit relief claim (claimant)',
  'acknowledge-claim':       'Acknowledge claim → review (counterparty)',
  'enter-negotiation':       'Enter negotiation (counterparty)',
  'dispute-claim':           'Dispute claim → reject (counterparty)',
  'refer-to-arbitration':    'Refer to arbitration (claimant)',
  'reach-agreement':         'Reach agreement → determination (claimant)',
  'issue-determination':     'Issue determination → grant relief (counterparty)',
  'determine-no-relief':     'Determine no relief → reject (counterparty)',
  'award-relief':            'Award relief (arbitrator)',
  'award-no-relief':         'Award no relief → reject (arbitrator)',
  'implement-relief':        'Implement relief → close (counterparty)',
  'withdraw-claim':          'Withdraw claim (claimant)',
};

const WITHDRAW_FROM: ChainStatus[] = [
  'event_logged', 'eligibility_review', 'impact_assessment', 'claim_submitted',
  'counterparty_review', 'negotiation', 'determination_pending',
];
const TERMINAL_STATES: ChainStatus[] = ['implemented', 'rejected', 'withdrawn'];
const GOVERNMENTAL: ChangeType[] = ['tax_change', 'regulatory_change', 'statutory_change', 'discriminatory_change'];

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

export function PpaChangeInLawChainTab() {
  const [rows, setRows] = useState<ChangeInLawRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active_open');
  const [selected, setSelected] = useState<ChangeInLawRow | null>(null);
  const [events, setEvents] = useState<ChangeInLawEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ChangeInLawRow[] } & KpiSummary }>('/ppa-change-in-law/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, arbitration_count: d.arbitration_count,
          relief_count: d.relief_count, rejected_count: d.rejected_count, withdrawn_count: d.withdrawn_count,
          breached: d.breached, reportable_total: d.reportable_total, large_open: d.large_open,
          total_quantum_zar_m: d.total_quantum_zar_m, granted_quantum_zar_m: d.granted_quantum_zar_m,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load change-in-law claims');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: ChangeInLawRow; events: ChangeInLawEvent[] } }>(
        `/ppa-change-in-law/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load claim history');
    }
  }, []);

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

  const act = useCallback(async (action: ActionKind, row: ChangeInLawRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'open-eligibility-review') {
        const ref = window.prompt('Eligibility reference (e.g. CIL-2026-0001-ELG):');
        if (!ref) return;
        const basis = window.prompt('Eligibility basis — the change in law to be tested:') || '';
        body = { eligibility_ref: ref, eligibility_basis: basis };
      } else if (action === 'confirm-eligible') {
        const basis = window.prompt('Eligibility basis — why the change qualifies under the PPA definition:');
        if (!basis) return;
        const assess = window.prompt('Assessment basis — the impact model to be built:') || '';
        body = { eligibility_basis: basis, assessment_basis: assess };
      } else if (action === 'reject-ineligible') {
        const ref = window.prompt('Rejection reference:');
        if (!ref) return;
        const basis = window.prompt('Rejection basis — why the change does NOT qualify:');
        if (!basis) return;
        body = { rejection_ref: ref, rejection_basis: basis, reason_code: 'not_qualifying' };
      } else if (action === 'submit-claim') {
        const ref = window.prompt('Claim reference:');
        if (!ref) return;
        const quantum = window.prompt('Relief sought (ZAR millions) — drives the tier:', String(row.claim_quantum_zar_m ?? ''));
        const assessed = window.prompt('Assessed impact (ZAR millions):', String(row.assessed_quantum_zar_m ?? ''));
        const mech = window.prompt('Relief mechanism (tariff_adjustment / lump_sum / term_extension / combination):', row.relief_mechanism ?? '') || '';
        const basis = window.prompt('Claim basis — the relief claimed + grounds:') || '';
        body = { claim_ref: ref, claim_basis: basis };
        if (quantum) body.claim_quantum_zar_m = Number(quantum);
        if (assessed) body.assessed_quantum_zar_m = Number(assessed);
        if (mech) body.relief_mechanism = mech;
      } else if (action === 'acknowledge-claim') {
        const basis = window.prompt('Claim basis — the counterparty acknowledgement:') || '';
        body = { claim_basis: basis };
      } else if (action === 'enter-negotiation') {
        const ref = window.prompt('Negotiation reference:');
        if (!ref) return;
        const basis = window.prompt('Negotiation basis — the points in negotiation:') || '';
        body = { negotiation_ref: ref, negotiation_basis: basis };
      } else if (action === 'dispute-claim') {
        const ref = window.prompt('Rejection reference (counterparty disputes the claim):');
        if (!ref) return;
        const basis = window.prompt('Rejection basis — why the counterparty disputes eligibility / quantum:');
        if (!basis) return;
        body = { rejection_ref: ref, rejection_basis: basis, reason_code: 'claim_disputed' };
      } else if (action === 'refer-to-arbitration') {
        const ref = window.prompt('Arbitration reference:');
        if (!ref) return;
        const arb = window.prompt('Arbitrator / forum (e.g. Arbitration Foundation of Southern Africa):') || '';
        const basis = window.prompt('Arbitration basis — the dispute referred:');
        if (!basis) return;
        body = { arbitration_ref: ref, arbitration_basis: basis, reason_code: 'referred_to_arbitration' };
        if (arb) body.arbitrator_name = arb;
      } else if (action === 'reach-agreement') {
        const mech = window.prompt('Agreed relief mechanism (tariff_adjustment / lump_sum / term_extension / combination):', row.relief_mechanism ?? '') || '';
        const basis = window.prompt('Determination basis — the agreed relief to be determined:') || '';
        body = { determination_basis: basis };
        if (mech) body.relief_mechanism = mech;
      } else if (action === 'issue-determination') {
        const ref = window.prompt('Determination reference:');
        if (!ref) return;
        const granted = window.prompt('Relief granted (ZAR millions):', String(row.granted_quantum_zar_m ?? row.assessed_quantum_zar_m ?? ''));
        const mech = window.prompt('Relief mechanism (tariff_adjustment / lump_sum / term_extension / combination):', row.relief_mechanism ?? '') || '';
        const basis = window.prompt('Determination basis — the relief granted + method:');
        if (!basis) return;
        body = { determination_ref: ref, determination_basis: basis };
        if (granted) body.granted_quantum_zar_m = Number(granted);
        if (mech) body.relief_mechanism = mech;
      } else if (action === 'determine-no-relief') {
        const ref = window.prompt('Rejection reference (determination grants no relief):');
        if (!ref) return;
        const basis = window.prompt('Determination basis — why no relief is due:');
        if (!basis) return;
        body = { rejection_ref: ref, determination_basis: basis, reason_code: 'no_relief_due' };
      } else if (action === 'award-relief') {
        const ref = window.prompt('Arbitration award reference:');
        if (!ref) return;
        const granted = window.prompt('Relief awarded (ZAR millions):', String(row.granted_quantum_zar_m ?? ''));
        const mech = window.prompt('Relief mechanism awarded (tariff_adjustment / lump_sum / term_extension / combination):', row.relief_mechanism ?? '') || '';
        const basis = window.prompt('Arbitration basis — the award:');
        if (!basis) return;
        body = { arbitration_ref: ref, arbitration_basis: basis };
        if (granted) body.granted_quantum_zar_m = Number(granted);
        if (mech) body.relief_mechanism = mech;
      } else if (action === 'award-no-relief') {
        const ref = window.prompt('Rejection reference (arbitration awards no relief):');
        if (!ref) return;
        const basis = window.prompt('Arbitration basis — why the award grants no relief:');
        if (!basis) return;
        body = { rejection_ref: ref, arbitration_basis: basis, reason_code: 'no_award' };
      } else if (action === 'implement-relief') {
        const ref = window.prompt('Implementation reference (relief takes effect — clean close):');
        if (!ref) return;
        const basis = window.prompt('Implementation basis — how the relief is applied (e.g. adjusted tariff from next cycle):') || '';
        body = { implementation_ref: ref, implementation_basis: basis };
      } else if (action === 'withdraw-claim') {
        const ref = window.prompt('Withdrawal reference (claim withdrawn before relief):');
        if (!ref) return;
        const basis = window.prompt('Withdrawal basis — why the claim is withdrawn:');
        if (!basis) return;
        body = { withdrawal_ref: ref, withdrawal_basis: basis, reason_code: 'withdrawn' };
      }
      await api.post(`/ppa-change-in-law/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Offtaker PPA change-in-law / qualifying-change relief</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage P6 chain · event logged → eligibility review → impact assessment → claim submitted → counterparty
            review → negotiation → determination → relief granted → implemented. Every PPA allocates the risk of a change
            in law; when a statute, tax or regulation changes after financial close (a carbon-tax rate, a NERSA Grid Code
            amendment, an environmental-licensing condition, an import duty), the affected party tests it against the PPA
            qualifying-change definition and, if it qualifies, seeks relief — a tariff adjustment, lump-sum or term
            extension. A contested claim goes to arbitration. DISTINCT from W39 indexation (scheduled CPI repricing of an
            UNCHANGED tariff). INVERTED SLA (bigger quantum = deeper test + longer windows). The offtaker contract desk
            drives the chain; the claimant prosecutes, an arbitrator awards on a referred dispute. Referring a claim to
            arbitration crosses to the regulator inbox for EVERY tier; granting tariff-affecting relief crosses for a
            GOVERNMENTAL change of material+ quantum; SLA breaches cross for major + critical.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="In arbitration" value={kpis?.arbitration_count ?? 0} tone={(kpis?.arbitration_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Relief granted" value={kpis?.relief_count ?? 0} tone="ok" />
        <Kpi label="Large open" value={kpis?.large_open ?? 0} tone={(kpis?.large_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Rejected" value={kpis?.rejected_count ?? 0} />
        <Kpi label="Withdrawn" value={kpis?.withdrawn_count ?? 0} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Claimed total" value={fmtZarM(kpis?.total_quantum_zar_m)} />
        <Kpi label="Granted total" value={fmtZarM(kpis?.granted_quantum_zar_m)} tone="ok" />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">CIL #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Generator / offtaker</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Change</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Quantum</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.change_in_law_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.cil_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[280px] truncate" title={`${r.generator_name} · ${r.offtaker_name}`}>
                      {r.generator_name}
                      <span className="text-[#4a5568]"> · {r.offtaker_name}</span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.change_type ? CHANGE_LABEL[r.change_type] : '—'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtZarM(r.claim_quantum_zar_m)}</td>
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No change-in-law claims match.</td></tr>
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
  row: ChangeInLawRow;
  events: ChangeInLawEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: ChangeInLawRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canReject = row.chain_status === 'eligibility_review';
  const canDispute = row.chain_status === 'counterparty_review';
  const canRefer = row.chain_status === 'counterparty_review' || row.chain_status === 'negotiation';
  const canNoRelief = row.chain_status === 'determination_pending';
  const canAwardNoRelief = row.chain_status === 'in_arbitration';
  const canWithdraw = WITHDRAW_FROM.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.cil_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.generator_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.change_in_law_tier].label}
                {row.change_type ? ` · ${CHANGE_LABEL[row.change_type]}` : ''} · offtaker {row.offtaker_name}
                {row.change_category ? ` · ${row.change_category}` : ''}
              </div>
              {row.arbitrator_name && (
                <div className="mt-1 text-[11px] text-[#a04040]">Arbitrator: {row.arbitrator_name}</div>
              )}
              {row.ppa_ref && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  {row.ppa_ref}{row.project_id ? ` · ${row.project_id}` : ''}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"             value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"              value={TIER_TONE[row.change_in_law_tier].label} />
            <Pair label="Change type"       value={row.change_type ? CHANGE_LABEL[row.change_type] : '—'} />
            <Pair label="Change category"   value={row.change_category ?? '—'} />
            <Pair label="Relief mechanism"  value={row.relief_mechanism ?? '—'} />
            <Pair label="Currency"          value={row.currency ?? '—'} />
            <Pair label="Claim quantum"     value={fmtZarM(row.claim_quantum_zar_m)} />
            <Pair label="Assessed quantum"  value={fmtZarM(row.assessed_quantum_zar_m)} />
            <Pair label="Granted quantum"   value={fmtZarM(row.granted_quantum_zar_m)} />
            <Pair label="Law effective"     value={fmtDate(row.law_effective_date)} />
            <Pair label="Notified"          value={fmtDate(row.notification_date)} />
            <Pair label="Determination due" value={fmtDate(row.determination_due_date)} />
            <Pair label="Eligibility ref"   value={row.eligibility_ref ?? '—'} />
            <Pair label="Assessment ref"    value={row.assessment_ref ?? '—'} />
            <Pair label="Claim ref"         value={row.claim_ref ?? '—'} />
            <Pair label="Negotiation ref"   value={row.negotiation_ref ?? '—'} />
            <Pair label="Determination ref" value={row.determination_ref ?? '—'} />
            <Pair label="Arbitration ref"   value={row.arbitration_ref ?? '—'} />
            <Pair label="Implementation ref" value={row.implementation_ref ?? '—'} />
            <Pair label="Rejection ref"     value={row.rejection_ref ?? '—'} />
            <Pair label="Reason code"       value={row.reason_code ?? '—'} />
            <Pair label="Logged at"         value={fmtDate(row.event_logged_at)} />
            <Pair label="Eligibility at"    value={fmtDate(row.eligibility_review_at)} />
            <Pair label="Assessment at"     value={fmtDate(row.impact_assessment_at)} />
            <Pair label="Claim at"          value={fmtDate(row.claim_submitted_at)} />
            <Pair label="Review at"         value={fmtDate(row.counterparty_review_at)} />
            <Pair label="Negotiation at"    value={fmtDate(row.negotiation_at)} />
            <Pair label="Determination at"  value={fmtDate(row.determination_pending_at)} />
            <Pair label="Arbitration at"    value={fmtDate(row.in_arbitration_at)} />
            <Pair label="Relief at"         value={fmtDate(row.relief_granted_at)} />
            <Pair label="Implemented at"    value={fmtDate(row.implemented_at)} />
            <Pair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"        value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"    value={String(row.escalation_level)} />
            <Pair label="Reportable"        value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.event_basis && <BasisBlock label="Event basis" tone="#557" text={row.event_basis} />}
          {row.eligibility_basis && <BasisBlock label="Eligibility basis" tone="#1a3a5c" text={row.eligibility_basis} />}
          {row.assessment_basis && <BasisBlock label="Assessment basis" tone="#1a3a5c" text={row.assessment_basis} />}
          {row.claim_basis && <BasisBlock label="Claim basis" tone="#a06200" text={row.claim_basis} />}
          {row.negotiation_basis && <BasisBlock label="Negotiation basis" tone="#8a4a00" text={row.negotiation_basis} />}
          {row.determination_basis && <BasisBlock label="Determination basis" tone="#155724" text={row.determination_basis} />}
          {row.arbitration_basis && <BasisBlock label="Arbitration basis" tone="#a04040" text={row.arbitration_basis} />}
          {row.implementation_basis && <BasisBlock label="Implementation basis" tone="#1f6b3a" text={row.implementation_basis} />}
          {row.rejection_basis && <BasisBlock label="Rejection basis" tone="#6b3a3a" text={row.rejection_basis} />}
          {row.withdrawal_basis && <BasisBlock label="Withdrawal basis" tone="#6b3a3a" text={row.withdrawal_basis} />}
        </section>

        {(nextAction || canReject || canDispute || canRefer || canNoRelief || canAwardNoRelief || canWithdraw) && (
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
              {canReject && (
                <button type="button"
                  onClick={() => onAct('reject-ineligible', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['reject-ineligible']}
                </button>
              )}
              {canDispute && (
                <button type="button"
                  onClick={() => onAct('dispute-claim', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['dispute-claim']}
                </button>
              )}
              {canRefer && (
                <button type="button"
                  onClick={() => onAct('refer-to-arbitration', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#a04040] hover:bg-[#fbecec]"
                >
                  {ACTION_LABEL['refer-to-arbitration']}
                </button>
              )}
              {canNoRelief && (
                <button type="button"
                  onClick={() => onAct('determine-no-relief', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['determine-no-relief']}
                </button>
              )}
              {canAwardNoRelief && (
                <button type="button"
                  onClick={() => onAct('award-no-relief', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['award-no-relief']}
                </button>
              )}
              {canWithdraw && (
                <button type="button"
                  onClick={() => onAct('withdraw-claim', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b3a3a] hover:bg-[#f3eded]"
                >
                  {ACTION_LABEL['withdraw-claim']}
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
