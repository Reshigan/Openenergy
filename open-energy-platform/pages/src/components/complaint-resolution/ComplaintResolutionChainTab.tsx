// Wave 66 — Regulator Complaints & Dispute Resolution lifecycle tab.
//
// NERSA acting as the quasi-judicial dispute forum under the Electricity
// Regulation Act 4 of 2006 section 30 (Disputes), the National Energy Regulator
// Act 40 of 2004 and NERSAs Complaints and Compliance Procedures. An external
// party (end-customer, licensee, IPP, offtaker) lodges a grievance against a
// licensee; NERSA screens admissibility, FIRST refers it to the respondent for
// first-level resolution, and on failure escalates to a formal investigation,
// attempts mediation, convenes an adjudication hearing, issues a binding ruling,
// monitors the remedy and closes it resolved — or dismisses / sees it appealed /
// withdrawn.
//
// This is the REACTIVE complement to the regulators other chains: W31 disposition
// triages cross-referred internal matters; W40 compliance-inspection is a
// proactive own-initiative inspection; W66 is an EXTERNAL party bringing a dispute
// that NERSA adjudicates.
//
//   complaint_lodged → admissibility_review → referred_to_licensee →
//     under_investigation → mediation → adjudication_hearing → ruling_issued →
//     remedy_monitoring → resolved   (full adjudication)
//   first-level: referred_to_licensee → resolved (settle at licensee)
//   dismiss: admissibility_review | under_investigation | adjudication_hearing → dismissed
//   appeal:  ruling_issued | remedy_monitoring → appealed
//   withdraw before adjudication.
//
// URGENT SLA — the LARGER the affected population, the TIGHTER every window.
// Single regulator-owned desk write; actor_party records the functional party
// (complainant / respondent / adjudicator) for audit. Reportability — the W66
// signature: lodge_appeal crosses to the NERSA Council for EVERY tier (judicial
// review of a ruling is always material); issue_ruling crosses for major +
// systemic; dismiss crosses for systemic only; SLA breach for major + systemic.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'complaint_lodged' | 'admissibility_review' | 'referred_to_licensee'
  | 'under_investigation' | 'mediation' | 'adjudication_hearing'
  | 'ruling_issued' | 'remedy_monitoring' | 'resolved'
  | 'dismissed' | 'appealed' | 'withdrawn';

type Tier = 'minor' | 'moderate' | 'significant' | 'major' | 'systemic';

type ComplainantType = 'customer' | 'licensee' | 'ipp' | 'offtaker' | 'municipality' | 'other';

type Category = 'billing' | 'supply_quality' | 'connection' | 'tariff' | 'metering' | 'service' | 'market_conduct' | 'other';

interface ComplaintRow {
  id: string;
  complaint_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  complainant_id: string;
  complainant_name: string;
  complainant_type: ComplainantType;
  respondent_id: string;
  respondent_name: string;
  respondent_licence_no: string | null;
  complaint_category: Category;
  complaint_tier: Tier;
  affected_customers: number | null;
  jurisdiction_basis: string | null;
  complaint_ref: string | null;
  referral_ref: string | null;
  investigation_ref: string | null;
  mediation_ref: string | null;
  hearing_ref: string | null;
  ruling_ref: string | null;
  appeal_ref: string | null;
  lodgement_basis: string | null;
  admissibility_basis: string | null;
  referral_basis: string | null;
  settlement_basis: string | null;
  investigation_basis: string | null;
  mediation_basis: string | null;
  hearing_basis: string | null;
  ruling_basis: string | null;
  remedy_basis: string | null;
  dismissal_basis: string | null;
  appeal_basis: string | null;
  reason_code: string | null;
  complaint_summary: string | null;
  remedy_directed: string | null;
  chain_status: ChainStatus;
  lodged_at: string;
  admissibility_review_at: string | null;
  referred_to_licensee_at: string | null;
  under_investigation_at: string | null;
  mediation_at: string | null;
  adjudication_hearing_at: string | null;
  ruling_issued_at: string | null;
  remedy_monitoring_at: string | null;
  resolved_at: string | null;
  dismissed_at: string | null;
  appealed_at: string | null;
  withdrawn_at: string | null;
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

interface ComplaintEvent {
  id: string;
  complaint_id: string;
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
  resolved_count: number;
  dismissed_count: number;
  appealed_count: number;
  withdrawn_count: number;
  at_licensee_count: number;
  investigation_count: number;
  mediation_count: number;
  hearing_count: number;
  monitoring_count: number;
  breached: number;
  reportable_total: number;
  large_open: number;
  total_affected: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  complaint_lodged:     { bg: '#e3e7ec', fg: '#557',    label: 'Lodged' },
  admissibility_review: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Admissibility review' },
  referred_to_licensee: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Referred to licensee' },
  under_investigation:  { bg: '#fff4d6', fg: '#a06200', label: 'Under investigation' },
  mediation:            { bg: '#fff4d6', fg: '#a06200', label: 'Mediation' },
  adjudication_hearing: { bg: '#ffe9d6', fg: '#8a4a00', label: 'Adjudication hearing' },
  ruling_issued:        { bg: '#ffe4b5', fg: '#8a4a00', label: 'Ruling issued' },
  remedy_monitoring:    { bg: '#fff4d6', fg: '#a06200', label: 'Remedy monitoring' },
  resolved:             { bg: '#d4edda', fg: '#155724', label: 'Resolved' },
  dismissed:            { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Dismissed' },
  appealed:             { bg: '#fde0e0', fg: '#9b1f1f', label: 'Appealed' },
  withdrawn:            { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:       { bg: '#e3e7ec', fg: '#557',    label: 'Minor (<10)' },
  moderate:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate (<100)' },
  significant: { bg: '#fff4d6', fg: '#a06200', label: 'Significant (<1k)' },
  major:       { bg: '#ffe4b5', fg: '#8a4a00', label: 'Major (<10k)' },
  systemic:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Systemic (≥10k)' },
};

const COMPLAINANT_LABEL: Record<ComplainantType, string> = {
  customer:     'Customer',
  licensee:     'Licensee',
  ipp:          'IPP',
  offtaker:     'Offtaker',
  municipality: 'Municipality',
  other:        'Other',
};

const CATEGORY_LABEL: Record<Category, string> = {
  billing:        'Billing',
  supply_quality: 'Supply quality',
  connection:     'Connection',
  tariff:         'Tariff',
  metering:       'Metering',
  service:        'Service',
  market_conduct: 'Market conduct',
  other:          'Other',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',               label: 'Active' },
  { key: 'all',                  label: 'All' },
  { key: 'minor',                label: 'Minor' },
  { key: 'moderate',             label: 'Moderate' },
  { key: 'significant',          label: 'Significant' },
  { key: 'major',                label: 'Major' },
  { key: 'systemic',             label: 'Systemic' },
  { key: 'at_licensee',          label: 'At licensee' },
  { key: 'investigation',        label: 'Investigation' },
  { key: 'mediation',            label: 'Mediation' },
  { key: 'hearing',              label: 'Hearing' },
  { key: 'monitoring',           label: 'Monitoring' },
  { key: 'breached',             label: 'SLA breached' },
  { key: 'reportable',           label: 'Reportable' },
  { key: 'complaint_lodged',     label: 'Lodged' },
  { key: 'ruling_issued',        label: 'Ruling issued' },
  { key: 'resolved',             label: 'Resolved' },
  { key: 'dismissed',            label: 'Dismissed' },
  { key: 'appealed',             label: 'Appealed' },
  { key: 'withdrawn',            label: 'Withdrawn' },
];

type ActionKind =
  | 'screen-admissibility' | 'refer-to-licensee' | 'settle-at-licensee'
  | 'escalate-investigation' | 'initiate-mediation' | 'convene-hearing'
  | 'issue-ruling' | 'monitor-remedy' | 'confirm-compliance'
  | 'dismiss' | 'lodge-appeal' | 'withdraw';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  complaint_lodged:     'screen-admissibility',
  admissibility_review: 'refer-to-licensee',
  referred_to_licensee: 'settle-at-licensee',
  under_investigation:  'initiate-mediation',
  mediation:            'convene-hearing',
  adjudication_hearing: 'issue-ruling',
  ruling_issued:        'monitor-remedy',
  remedy_monitoring:    'confirm-compliance',
  resolved:             null,
  dismissed:            null,
  appealed:             null,
  withdrawn:            null,
};

// Party annotation per action — the procedural function. The COMPLAINANT lodges
// and withdraws; the RESPONDENT licensee settles at first level; the ADJUDICATOR
// (NERSA) screens, refers, investigates, mediates, hears, rules, monitors and
// dismisses.
const ACTION_LABEL: Record<ActionKind, string> = {
  'screen-admissibility':   'Screen admissibility (adjudicator)',
  'refer-to-licensee':      'Refer to licensee (adjudicator)',
  'settle-at-licensee':     'Settle at licensee (respondent)',
  'escalate-investigation': 'Escalate to investigation (adjudicator)',
  'initiate-mediation':     'Initiate mediation (adjudicator)',
  'convene-hearing':        'Convene hearing (adjudicator)',
  'issue-ruling':           'Issue ruling (adjudicator)',
  'monitor-remedy':         'Monitor remedy (adjudicator)',
  'confirm-compliance':     'Confirm compliance (adjudicator)',
  'dismiss':                'Dismiss (adjudicator)',
  'lodge-appeal':           'Lodge appeal (complainant)',
  'withdraw':               'Withdraw (complainant)',
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

function fmtAffected(n: number | null | undefined): string {
  if (!n) return '—';
  return `${n.toLocaleString('en-ZA')} parties`;
}

const TERMINAL_STATES: ChainStatus[] = ['resolved', 'dismissed', 'appealed', 'withdrawn'];
const WITHDRAWABLE_STATES: ChainStatus[] = [
  'complaint_lodged', 'admissibility_review', 'referred_to_licensee',
  'under_investigation', 'mediation',
];
const DISMISSABLE_STATES: ChainStatus[] = ['admissibility_review', 'under_investigation', 'adjudication_hearing'];
const APPEALABLE_STATES: ChainStatus[] = ['ruling_issued', 'remedy_monitoring'];

export function ComplaintResolutionChainTab() {
  const [rows, setRows] = useState<ComplaintRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<ComplaintRow | null>(null);
  const [events, setEvents] = useState<ComplaintEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ComplaintRow[] } & KpiSummary }>('/complaints/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, resolved_count: d.resolved_count,
          dismissed_count: d.dismissed_count, appealed_count: d.appealed_count,
          withdrawn_count: d.withdrawn_count, at_licensee_count: d.at_licensee_count,
          investigation_count: d.investigation_count, mediation_count: d.mediation_count,
          hearing_count: d.hearing_count, monitoring_count: d.monitoring_count,
          breached: d.breached, reportable_total: d.reportable_total,
          large_open: d.large_open, total_affected: d.total_affected,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load complaint records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: ComplaintRow; events: ComplaintEvent[] } }>(
        `/complaints/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load complaint history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')           return true;
      if (filter === 'active')        return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'at_licensee')   return r.chain_status === 'referred_to_licensee';
      if (filter === 'investigation') return r.chain_status === 'under_investigation';
      if (filter === 'mediation')     return r.chain_status === 'mediation';
      if (filter === 'hearing')       return r.chain_status === 'adjudication_hearing';
      if (filter === 'monitoring')    return r.chain_status === 'remedy_monitoring';
      if (filter === 'breached')      return r.sla_breached;
      if (filter === 'reportable')    return r.is_reportable;
      if (filter === 'minor' || filter === 'moderate' || filter === 'significant' || filter === 'major' || filter === 'systemic') {
        return r.complaint_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: ComplaintRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'screen-admissibility') {
        const basis = window.prompt('Admissibility basis — NERSA jurisdiction over the dispute (ERA s30 / NER Act):');
        if (!basis) return;
        const juris = window.prompt('Jurisdiction basis (statutory hook):', row.jurisdiction_basis || '') || '';
        const affected = window.prompt('Affected parties / customers (re-derives the tier):', String(row.affected_customers || ''));
        body = { admissibility_basis: basis };
        if (juris) body.jurisdiction_basis = juris;
        if (affected && !Number.isNaN(Number(affected))) body.affected_customers = Number(affected);
      } else if (action === 'refer-to-licensee') {
        const basis = window.prompt('Referral basis — first-level resolution referred to the respondent licensee:');
        if (!basis) return;
        const ref = window.prompt('Referral reference (e.g. REF-2026-0007):') || '';
        body = { referral_basis: basis };
        if (ref) body.referral_ref = ref;
      } else if (action === 'settle-at-licensee') {
        const basis = window.prompt('Settlement basis — the respondent resolved the complaint at first level:');
        if (!basis) return;
        const remedy = window.prompt('Remedy directed (what the licensee did to resolve it):') || '';
        const summary = window.prompt('Complaint summary (one line for the audit record):') || '';
        body = { settlement_basis: basis };
        if (remedy) body.remedy_directed = remedy;
        if (summary) body.complaint_summary = summary;
      } else if (action === 'escalate-investigation') {
        const basis = window.prompt('Investigation basis — first-level failed; NERSA opens a formal investigation:');
        if (!basis) return;
        const ref = window.prompt('Investigation reference (e.g. INV-2026-0007):') || '';
        body = { investigation_basis: basis };
        if (ref) body.investigation_ref = ref;
      } else if (action === 'initiate-mediation') {
        const basis = window.prompt('Mediation basis — NERSA attempts a mediated settlement between the parties:');
        if (!basis) return;
        const ref = window.prompt('Mediation reference (e.g. MED-2026-0007):') || '';
        body = { mediation_basis: basis };
        if (ref) body.mediation_ref = ref;
      } else if (action === 'convene-hearing') {
        const basis = window.prompt('Hearing basis — NERSA convenes a formal adjudication hearing:');
        if (!basis) return;
        const ref = window.prompt('Hearing reference (e.g. HRG-2026-0007):') || '';
        body = { hearing_basis: basis };
        if (ref) body.hearing_ref = ref;
      } else if (action === 'issue-ruling') {
        const basis = window.prompt('Ruling basis — the binding determination NERSA issues on the dispute:');
        if (!basis) return;
        const ref = window.prompt('Ruling reference (e.g. RUL-2026-0007):') || '';
        const remedy = window.prompt('Remedy directed (what the respondent must do):') || '';
        body = { ruling_basis: basis };
        if (ref) body.ruling_ref = ref;
        if (remedy) body.remedy_directed = remedy;
      } else if (action === 'monitor-remedy') {
        const basis = window.prompt('Remedy-monitoring basis — NERSA monitors the respondent implementing the ruling:');
        if (!basis) return;
        body = { remedy_basis: basis };
      } else if (action === 'confirm-compliance') {
        const basis = window.prompt('Compliance basis — the respondent has fully implemented the remedy (close-out):') || '';
        const summary = window.prompt('Complaint summary (one line for the audit record):') || '';
        body = {};
        if (basis) body.remedy_basis = basis;
        if (summary) body.complaint_summary = summary;
      } else if (action === 'dismiss') {
        const basis = window.prompt('Dismissal basis — no jurisdiction / no merit / out of scope:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. no_jurisdiction / no_merit / out_of_scope):', 'no_merit') || '';
        body = { dismissal_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'lodge-appeal') {
        const basis = window.prompt('Appeal basis — the grounds on which the ruling is taken on judicial review:');
        if (!basis) return;
        const ref = window.prompt('Appeal reference (e.g. APP-2026-0007):') || '';
        const reason = window.prompt('Reason code (e.g. procedural_unfairness / error_of_law):', 'error_of_law') || '';
        body = { appeal_basis: basis };
        if (ref) body.appeal_ref = ref;
        if (reason) body.reason_code = reason;
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason — why the complainant pulls the complaint:');
        if (!reason) return;
        body = { reason_code: reason };
      }
      await api.post(`/complaints/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Complaints &amp; dispute resolution</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage quasi-judicial dispute chain (ERA 2006 s30 · NER Act 40/2004 · NERSA Complaints Procedures) ·
            lodged → admissibility review → referred to licensee → under investigation → mediation → adjudication
            hearing → ruling issued → remedy monitoring → resolved. A respondent can resolve at first level
            (referred → resolved); a matter can be dismissed (no jurisdiction / no merit), appealed on judicial
            review, or withdrawn before adjudication. The REACTIVE complement to the disposition (W31) and
            inspection (W40) chains — here an external party brings a grievance and NERSA adjudicates. URGENT SLA:
            the larger the affected population, the tighter every window. The W66 signature — an appeal crosses to
            the NERSA Council for every tier (judicial review of a ruling is always material); a ruling crosses for
            major + systemic; a dismissal crosses for systemic only; SLA breaches cross for major + systemic.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Large open" value={kpis?.large_open ?? 0} tone={(kpis?.large_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="At licensee" value={kpis?.at_licensee_count ?? 0} tone={(kpis?.at_licensee_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Investigation" value={kpis?.investigation_count ?? 0} tone={(kpis?.investigation_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Mediation" value={kpis?.mediation_count ?? 0} tone={(kpis?.mediation_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Hearing" value={kpis?.hearing_count ?? 0} tone={(kpis?.hearing_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Monitoring" value={kpis?.monitoring_count ?? 0} tone={(kpis?.monitoring_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Resolved" value={kpis?.resolved_count ?? 0} tone="ok" />
        <Kpi label="Dismissed" value={kpis?.dismissed_count ?? 0} tone={(kpis?.dismissed_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Appealed" value={kpis?.appealed_count ?? 0} tone={(kpis?.appealed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Affected" value={fmtAffected(kpis?.total_affected ?? 0)} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Complaint #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Respondent</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Category</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Affected</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.complaint_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.complaint_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to NERSA Council">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[180px] truncate" title={r.respondent_name}>
                      {r.respondent_name}
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{CATEGORY_LABEL[r.complaint_category]}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">
                      {(r.affected_customers || 0).toLocaleString('en-ZA')}
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No complaints match.</td></tr>
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
  row: ComplaintRow;
  events: ComplaintEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: ComplaintRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canEscalate = row.chain_status === 'referred_to_licensee';
  const canShortCircuit = row.chain_status === 'under_investigation';
  const canDismiss = DISMISSABLE_STATES.includes(row.chain_status);
  const canAppeal = APPEALABLE_STATES.includes(row.chain_status);
  const canWithdraw = WITHDRAWABLE_STATES.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.complaint_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.respondent_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.complaint_tier].label} · {CATEGORY_LABEL[row.complaint_category]}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                {row.complainant_name} ({COMPLAINANT_LABEL[row.complainant_type]}) → {row.respondent_name}
                {row.escalation_level > 0 ? ` · escalation lvl ${row.escalation_level}` : ''}
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
            <Pair label="State"               value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"                value={TIER_TONE[row.complaint_tier].label} />
            <Pair label="Category"            value={CATEGORY_LABEL[row.complaint_category]} />
            <Pair label="Affected parties"    value={fmtAffected(row.affected_customers)} />
            <Pair label="Complainant"         value={`${row.complainant_name} (${COMPLAINANT_LABEL[row.complainant_type]})`} />
            <Pair label="Respondent"          value={row.respondent_name} />
            <Pair label="Respondent licence"  value={row.respondent_licence_no ?? '—'} />
            <Pair label="Jurisdiction"        value={row.jurisdiction_basis ?? '—'} />
            <Pair label="Referral ref"        value={row.referral_ref ?? '—'} />
            <Pair label="Investigation ref"   value={row.investigation_ref ?? '—'} />
            <Pair label="Mediation ref"       value={row.mediation_ref ?? '—'} />
            <Pair label="Hearing ref"         value={row.hearing_ref ?? '—'} />
            <Pair label="Ruling ref"          value={row.ruling_ref ?? '—'} />
            <Pair label="Appeal ref"          value={row.appeal_ref ?? '—'} />
            <Pair label="Reason code"         value={row.reason_code ?? '—'} />
            <Pair label="Remedy directed"     value={row.remedy_directed ?? '—'} />
            <Pair label="Lodged"              value={fmtDate(row.lodged_at)} />
            <Pair label="Admissibility"       value={fmtDate(row.admissibility_review_at)} />
            <Pair label="Referred"            value={fmtDate(row.referred_to_licensee_at)} />
            <Pair label="Investigation"       value={fmtDate(row.under_investigation_at)} />
            <Pair label="Mediation"           value={fmtDate(row.mediation_at)} />
            <Pair label="Hearing"             value={fmtDate(row.adjudication_hearing_at)} />
            <Pair label="Ruling issued"       value={fmtDate(row.ruling_issued_at)} />
            <Pair label="Remedy monitoring"   value={fmtDate(row.remedy_monitoring_at)} />
            <Pair label="Resolved"            value={fmtDate(row.resolved_at)} />
            <Pair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"          value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"      value={String(row.escalation_level)} />
            <Pair label="Reportable"          value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.complaint_summary && (
            <BasisBlock label="Complaint summary" tone="#1a3a5c" text={row.complaint_summary} />
          )}
          {row.lodgement_basis && (
            <BasisBlock label="Lodgement basis" tone="#1a3a5c" text={row.lodgement_basis} />
          )}
          {row.admissibility_basis && (
            <BasisBlock label="Admissibility basis" tone="#1a3a5c" text={row.admissibility_basis} />
          )}
          {row.referral_basis && (
            <BasisBlock label="Referral basis" tone="#1a3a5c" text={row.referral_basis} />
          )}
          {row.settlement_basis && (
            <BasisBlock label="Settlement basis (respondent)" tone="#155724" text={row.settlement_basis} />
          )}
          {row.investigation_basis && (
            <BasisBlock label="Investigation basis" tone="#a06200" text={row.investigation_basis} />
          )}
          {row.mediation_basis && (
            <BasisBlock label="Mediation basis" tone="#a06200" text={row.mediation_basis} />
          )}
          {row.hearing_basis && (
            <BasisBlock label="Hearing basis" tone="#8a4a00" text={row.hearing_basis} />
          )}
          {row.ruling_basis && (
            <BasisBlock label="Ruling basis" tone="#8a4a00" text={row.ruling_basis} />
          )}
          {row.remedy_basis && (
            <BasisBlock label="Remedy-monitoring basis" tone="#a06200" text={row.remedy_basis} />
          )}
          {row.dismissal_basis && (
            <BasisBlock label="Dismissal basis" tone="#6b1f1f" text={row.dismissal_basis} />
          )}
          {row.appeal_basis && (
            <BasisBlock label="Appeal basis" tone="#9b1f1f" text={row.appeal_basis} />
          )}
        </section>

        {(nextAction || canEscalate || canShortCircuit || canDismiss || canAppeal || canWithdraw) && (
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
              {canEscalate && (
                <button type="button"
                  onClick={() => onAct('escalate-investigation', row)}
                  className="rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  {ACTION_LABEL['escalate-investigation']}
                </button>
              )}
              {canShortCircuit && (
                <button type="button"
                  onClick={() => onAct('convene-hearing', row)}
                  className="rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  {ACTION_LABEL['convene-hearing']}
                </button>
              )}
              {canAppeal && (
                <button type="button"
                  onClick={() => onAct('lodge-appeal', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['lodge-appeal']}
                </button>
              )}
              {canDismiss && (
                <button type="button"
                  onClick={() => onAct('dismiss', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.dismiss}
                </button>
              )}
              {canWithdraw && (
                <button type="button"
                  onClick={() => onAct('withdraw', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL.withdraw}
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
