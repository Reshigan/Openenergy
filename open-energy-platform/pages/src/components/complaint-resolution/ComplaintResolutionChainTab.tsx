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
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

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
  | 'complaint_lodged' | 'admissibility_review' | 'referred_to_licensee'
  | 'under_investigation' | 'mediation' | 'adjudication_hearing'
  | 'ruling_issued' | 'remedy_monitoring' | 'resolved'
  | 'dismissed' | 'appealed' | 'withdrawn';

type Tier = 'minor' | 'moderate' | 'significant' | 'major' | 'systemic';
type ComplainantType = 'customer' | 'licensee' | 'ipp' | 'offtaker' | 'municipality' | 'other';
type Category = 'billing' | 'supply_quality' | 'connection' | 'tariff' | 'metering' | 'service' | 'market_conduct' | 'other';

interface ComplaintRow {
  [key: string]: unknown;
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

const ALL_STATES = [
  'complaint_lodged',
  'admissibility_review',
  'referred_to_licensee',
  'under_investigation',
  'mediation',
  'adjudication_hearing',
  'ruling_issued',
  'remedy_monitoring',
  'resolved',
] as const;

const BRANCH_STATES = ['dismissed', 'appealed', 'withdrawn'] as const;

const FILTERS = [
  { key: 'active',            label: 'Active' },
  { key: 'all',               label: 'All' },
  { key: 'minor',             label: 'Minor' },
  { key: 'moderate',          label: 'Moderate' },
  { key: 'significant',       label: 'Significant' },
  { key: 'major',             label: 'Major' },
  { key: 'systemic',          label: 'Systemic' },
  { key: 'at_licensee',       label: 'At licensee' },
  { key: 'investigation',     label: 'Investigation' },
  { key: 'mediation',         label: 'Mediation' },
  { key: 'hearing',           label: 'Hearing' },
  { key: 'monitoring',        label: 'Monitoring' },
  { key: 'breached',          label: 'SLA breached' },
  { key: 'reportable',        label: 'Reportable' },
  { key: 'complaint_lodged',  label: 'Lodged' },
  { key: 'ruling_issued',     label: 'Ruling issued' },
  { key: 'resolved',          label: 'Resolved' },
  { key: 'dismissed',         label: 'Dismissed' },
  { key: 'appealed',          label: 'Appealed' },
  { key: 'withdrawn',         label: 'Withdrawn' },
];

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

const TERMINAL_STATES: ChainStatus[] = ['resolved', 'dismissed', 'appealed', 'withdrawn'];
const WITHDRAWABLE_STATES: ChainStatus[] = [
  'complaint_lodged', 'admissibility_review', 'referred_to_licensee',
  'under_investigation', 'mediation',
];
const DISMISSABLE_STATES: ChainStatus[] = ['admissibility_review', 'under_investigation', 'adjudication_hearing'];
const APPEALABLE_STATES: ChainStatus[] = ['ruling_issued', 'remedy_monitoring'];

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtAffected(n: number | null | undefined): string {
  if (!n) return '—';
  return `${n.toLocaleString('en-ZA')} parties`;
}

function getActions(row: ComplaintRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'complaint_lodged') {
    actions.push({
      key: 'screen-admissibility',
      label: 'Screen admissibility (adjudicator)',
      tone: 'primary',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'admissibility_basis', label: 'Admissibility basis — NERSA jurisdiction over the dispute (ERA s30 / NER Act)', type: 'textarea', required: true },
        { key: 'jurisdiction_basis',  label: 'Jurisdiction basis (statutory hook)', type: 'text', required: false },
        { key: 'affected_customers',  label: 'Affected parties / customers (re-derives the tier)', type: 'text', required: false },
      ],
    });
  }

  if (s === 'admissibility_review') {
    actions.push({
      key: 'refer-to-licensee',
      label: 'Refer to licensee (adjudicator)',
      tone: 'primary',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'referral_basis', label: 'Referral basis — first-level resolution referred to the respondent licensee', type: 'textarea', required: true },
        { key: 'referral_ref',   label: 'Referral reference (e.g. REF-2026-0007)', type: 'text', required: false },
      ],
    });
    actions.push({
      key: 'dismiss',
      label: 'Dismiss (adjudicator)',
      tone: 'danger',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'dismissal_basis', label: 'Dismissal basis — no jurisdiction / no merit / out of scope', type: 'textarea', required: true },
        { key: 'reason_code',     label: 'Reason code (e.g. no_jurisdiction / no_merit / out_of_scope)', type: 'text', required: false },
      ],
    });
  }

  if (s === 'referred_to_licensee') {
    actions.push({
      key: 'settle-at-licensee',
      label: 'Settle at licensee (respondent)',
      tone: 'primary',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'settlement_basis',  label: 'Settlement basis — the respondent resolved the complaint at first level', type: 'textarea', required: true },
        { key: 'remedy_directed',   label: 'Remedy directed (what the licensee did to resolve it)', type: 'textarea', required: false },
        { key: 'complaint_summary', label: 'Complaint summary (one line for the audit record)', type: 'text', required: false },
      ],
    });
    actions.push({
      key: 'escalate-investigation',
      label: 'Escalate to investigation (adjudicator)',
      tone: 'warn',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'investigation_basis', label: 'Investigation basis — first-level failed; NERSA opens a formal investigation', type: 'textarea', required: true },
        { key: 'investigation_ref',   label: 'Investigation reference (e.g. INV-2026-0007)', type: 'text', required: false },
      ],
    });
  }

  if (s === 'under_investigation') {
    actions.push({
      key: 'initiate-mediation',
      label: 'Initiate mediation (adjudicator)',
      tone: 'primary',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'mediation_basis', label: 'Mediation basis — NERSA attempts a mediated settlement between the parties', type: 'textarea', required: true },
        { key: 'mediation_ref',   label: 'Mediation reference (e.g. MED-2026-0007)', type: 'text', required: false },
      ],
    });
    actions.push({
      key: 'convene-hearing',
      label: 'Convene hearing (adjudicator)',
      tone: 'warn',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'hearing_basis', label: 'Hearing basis — NERSA convenes a formal adjudication hearing', type: 'textarea', required: true },
        { key: 'hearing_ref',   label: 'Hearing reference (e.g. HRG-2026-0007)', type: 'text', required: false },
      ],
    });
    actions.push({
      key: 'dismiss',
      label: 'Dismiss (adjudicator)',
      tone: 'danger',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'dismissal_basis', label: 'Dismissal basis — no jurisdiction / no merit / out of scope', type: 'textarea', required: true },
        { key: 'reason_code',     label: 'Reason code (e.g. no_jurisdiction / no_merit / out_of_scope)', type: 'text', required: false },
      ],
    });
  }

  if (s === 'mediation') {
    actions.push({
      key: 'convene-hearing',
      label: 'Convene hearing (adjudicator)',
      tone: 'primary',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'hearing_basis', label: 'Hearing basis — NERSA convenes a formal adjudication hearing', type: 'textarea', required: true },
        { key: 'hearing_ref',   label: 'Hearing reference (e.g. HRG-2026-0007)', type: 'text', required: false },
      ],
    });
  }

  if (s === 'adjudication_hearing') {
    actions.push({
      key: 'issue-ruling',
      label: 'Issue ruling (adjudicator)',
      tone: 'primary',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'ruling_basis',    label: 'Ruling basis — the binding determination NERSA issues on the dispute', type: 'textarea', required: true },
        { key: 'ruling_ref',      label: 'Ruling reference (e.g. RUL-2026-0007)', type: 'text', required: false },
        { key: 'remedy_directed', label: 'Remedy directed (what the respondent must do)', type: 'textarea', required: false },
      ],
    });
    actions.push({
      key: 'dismiss',
      label: 'Dismiss (adjudicator)',
      tone: 'danger',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'dismissal_basis', label: 'Dismissal basis — no jurisdiction / no merit / out of scope', type: 'textarea', required: true },
        { key: 'reason_code',     label: 'Reason code (e.g. no_jurisdiction / no_merit / out_of_scope)', type: 'text', required: false },
      ],
    });
  }

  if (s === 'ruling_issued') {
    actions.push({
      key: 'monitor-remedy',
      label: 'Monitor remedy (adjudicator)',
      tone: 'primary',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'remedy_basis', label: 'Remedy-monitoring basis — NERSA monitors the respondent implementing the ruling', type: 'textarea', required: true },
      ],
    });
    actions.push({
      key: 'lodge-appeal',
      label: 'Lodge appeal (complainant)',
      tone: 'danger',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'appeal_basis', label: 'Appeal basis — the grounds on which the ruling is taken on judicial review', type: 'textarea', required: true },
        { key: 'appeal_ref',   label: 'Appeal reference (e.g. APP-2026-0007)', type: 'text', required: false },
        { key: 'reason_code',  label: 'Reason code (e.g. procedural_unfairness / error_of_law)', type: 'text', required: false },
      ],
    });
  }

  if (s === 'remedy_monitoring') {
    actions.push({
      key: 'confirm-compliance',
      label: 'Confirm compliance (adjudicator)',
      tone: 'primary',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'remedy_basis',      label: 'Compliance basis — the respondent has fully implemented the remedy (close-out)', type: 'textarea', required: false },
        { key: 'complaint_summary', label: 'Complaint summary (one line for the audit record)', type: 'text', required: false },
      ],
    });
    actions.push({
      key: 'lodge-appeal',
      label: 'Lodge appeal (complainant)',
      tone: 'danger',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'appeal_basis', label: 'Appeal basis — the grounds on which the ruling is taken on judicial review', type: 'textarea', required: true },
        { key: 'appeal_ref',   label: 'Appeal reference (e.g. APP-2026-0007)', type: 'text', required: false },
        { key: 'reason_code',  label: 'Reason code (e.g. procedural_unfairness / error_of_law)', type: 'text', required: false },
      ],
    });
  }

  if (WITHDRAWABLE_STATES.includes(s)) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (complainant)',
      tone: 'ghost',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'reason_code', label: 'Withdrawal reason — why the complainant pulls the complaint', type: 'textarea', required: true },
      ],
    });
  }

  return actions;
}

function renderDetail(row: ComplaintRow): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      <DetailPair label="State"              value={row.chain_status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} />
      <DetailPair label="Tier"               value={row.complaint_tier.charAt(0).toUpperCase() + row.complaint_tier.slice(1)} />
      <DetailPair label="Category"           value={CATEGORY_LABEL[row.complaint_category]} />
      <DetailPair label="Affected parties"   value={fmtAffected(row.affected_customers)} />
      <DetailPair label="Complainant"        value={`${row.complainant_name} (${COMPLAINANT_LABEL[row.complainant_type]})`} />
      <DetailPair label="Respondent"         value={row.respondent_name} />
      <DetailPair label="Respondent licence" value={row.respondent_licence_no ?? '—'} />
      <DetailPair label="Jurisdiction"       value={row.jurisdiction_basis ?? '—'} />
      <DetailPair label="Referral ref"       value={row.referral_ref ?? '—'} />
      <DetailPair label="Investigation ref"  value={row.investigation_ref ?? '—'} />
      <DetailPair label="Mediation ref"      value={row.mediation_ref ?? '—'} />
      <DetailPair label="Hearing ref"        value={row.hearing_ref ?? '—'} />
      <DetailPair label="Ruling ref"         value={row.ruling_ref ?? '—'} />
      <DetailPair label="Appeal ref"         value={row.appeal_ref ?? '—'} />
      <DetailPair label="Reason code"        value={row.reason_code ?? '—'} />
      <DetailPair label="Remedy directed"    value={row.remedy_directed ?? '—'} />
      <DetailPair label="Lodged"             value={fmtDate(row.lodged_at)} />
      <DetailPair label="Admissibility"      value={fmtDate(row.admissibility_review_at)} />
      <DetailPair label="Referred"           value={fmtDate(row.referred_to_licensee_at)} />
      <DetailPair label="Investigation"      value={fmtDate(row.under_investigation_at)} />
      <DetailPair label="Mediation"          value={fmtDate(row.mediation_at)} />
      <DetailPair label="Hearing"            value={fmtDate(row.adjudication_hearing_at)} />
      <DetailPair label="Ruling issued"      value={fmtDate(row.ruling_issued_at)} />
      <DetailPair label="Remedy monitoring"  value={fmtDate(row.remedy_monitoring_at)} />
      <DetailPair label="Resolved"           value={fmtDate(row.resolved_at)} />
      <DetailPair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
      <DetailPair label="Escalation lvl"     value={String(row.escalation_level)} />
      <DetailPair label="Reportable"         value={row.is_reportable ? 'Yes' : 'No'} />
      {row.source_wave && (
        <DetailPair label="Source wave"      value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}`} />
      )}
      {row.complaint_summary && (
        <div className="col-span-2">
          <DetailPair label="Complaint summary" value={row.complaint_summary} />
        </div>
      )}
      {row.lodgement_basis && (
        <div className="col-span-2">
          <DetailPair label="Lodgement basis" value={row.lodgement_basis} />
        </div>
      )}
      {row.admissibility_basis && (
        <div className="col-span-2">
          <DetailPair label="Admissibility basis" value={row.admissibility_basis} />
        </div>
      )}
      {row.referral_basis && (
        <div className="col-span-2">
          <DetailPair label="Referral basis" value={row.referral_basis} />
        </div>
      )}
      {row.settlement_basis && (
        <div className="col-span-2">
          <DetailPair label="Settlement basis (respondent)" value={row.settlement_basis} />
        </div>
      )}
      {row.investigation_basis && (
        <div className="col-span-2">
          <DetailPair label="Investigation basis" value={row.investigation_basis} />
        </div>
      )}
      {row.mediation_basis && (
        <div className="col-span-2">
          <DetailPair label="Mediation basis" value={row.mediation_basis} />
        </div>
      )}
      {row.hearing_basis && (
        <div className="col-span-2">
          <DetailPair label="Hearing basis" value={row.hearing_basis} />
        </div>
      )}
      {row.ruling_basis && (
        <div className="col-span-2">
          <DetailPair label="Ruling basis" value={row.ruling_basis} />
        </div>
      )}
      {row.remedy_basis && (
        <div className="col-span-2">
          <DetailPair label="Remedy-monitoring basis" value={row.remedy_basis} />
        </div>
      )}
      {row.dismissal_basis && (
        <div className="col-span-2">
          <DetailPair label="Dismissal basis" value={row.dismissal_basis} />
        </div>
      )}
      {row.appeal_basis && (
        <div className="col-span-2">
          <DetailPair label="Appeal basis" value={row.appeal_basis} />
        </div>
      )}
    </div>
  );
}

export function ComplaintResolutionChainTab() {
  const [rows, setRows] = useState<ComplaintRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ComplaintRow[] } & KpiSummary }>('/complaints/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setSummary({
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

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/complaints/chain/${rowId}/${key}`, values);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: ComplaintRow; events: ChainEvent[] } }>(
        `/complaints/chain/${id}`
      );
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events || [] }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load complaint history');
    }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')           return true;
      if (filter === 'active')        return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'at_licensee')   return r.chain_status === 'referred_to_licensee';
      if (filter === 'investigation') return r.chain_status === 'under_investigation';
      if (filter === 'mediation')     return r.chain_status === 'mediation';
      if (filter === 'hearing')       return r.chain_status === 'adjudication_hearing';
      if (filter === 'monitoring')    return r.chain_status === 'remedy_monitoring';
      if (filter === 'breached')      return !!r.sla_breached;
      if (filter === 'reportable')    return r.is_reportable;
      if (filter === 'minor' || filter === 'moderate' || filter === 'significant' || filter === 'major' || filter === 'systemic') {
        return r.complaint_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  return (
    <div style={{ padding: '20px', background: BG, minHeight: '100%' }}>
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: TX1, margin: 0 }}>
          Complaints &amp; dispute resolution
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 4, lineHeight: 1.5 }}>
          12-stage quasi-judicial dispute chain (ERA 2006 s30 · NER Act 40/2004 · NERSA Complaints Procedures) ·
          lodged → admissibility review → referred to licensee → under investigation → mediation → adjudication
          hearing → ruling issued → remedy monitoring → resolved. URGENT SLA: larger affected population = tighter
          windows. W66 signature — appeal crosses NERSA Council every tier; ruling crosses major + systemic; dismissal
          crosses systemic only; SLA breach crosses major + systemic.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginBottom: 16 }}>
        <KpiTile label="Total"       value={summary?.total ?? rows.length} />
        <KpiTile label="Open"        value={summary?.open_count ?? 0} />
        <KpiTile label="Large open"  value={summary?.large_open ?? 0}        tone={(summary?.large_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="At licensee" value={summary?.at_licensee_count ?? 0} tone={(summary?.at_licensee_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Investig."   value={summary?.investigation_count ?? 0} tone={(summary?.investigation_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Mediation"   value={summary?.mediation_count ?? 0}   tone={(summary?.mediation_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Hearing"     value={summary?.hearing_count ?? 0}     tone={(summary?.hearing_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Monitoring"  value={summary?.monitoring_count ?? 0}  tone={(summary?.monitoring_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="SLA breached" value={summary?.breached ?? 0}         tone={(summary?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Resolved"    value={summary?.resolved_count ?? 0}    tone="ok" />
        <KpiTile label="Dismissed"   value={summary?.dismissed_count ?? 0}   tone={(summary?.dismissed_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Appealed"    value={summary?.appealed_count ?? 0}    tone={(summary?.appealed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Reportable"  value={summary?.reportable_total ?? 0}  tone={(summary?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Affected"    value={fmtAffected(summary?.total_affected ?? 0)} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '3px 10px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              background: filter === f.key ? ACC : BG1,
              color: filter === f.key ? '#fff' : TX2,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ marginBottom: 12, borderRadius: 4, border: `1px solid ${BAD}40`, background: `${BAD}10`, padding: '8px 12px', fontSize: 12, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '24px', textAlign: 'center', fontSize: 13, color: TX3 }}>
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '24px', textAlign: 'center', fontSize: 13, color: TX3 }}>
          No complaints match.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((row) => (
            <ChainCard
              key={row.id}
              item={{
                ...row,
                case_number: row.complaint_number,
              }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={row.respondent_name}
              meta={
                <span>
                  {row.complaint_tier.charAt(0).toUpperCase() + row.complaint_tier.slice(1)}
                  {' · '}
                  {CATEGORY_LABEL[row.complaint_category]}
                  {' · '}
                  {row.complainant_name} ({COMPLAINANT_LABEL[row.complainant_type]})
                  {row.is_reportable && (
                    <span style={{ marginLeft: 4, color: BAD }} title="Reportable to NERSA Council">●</span>
                  )}
                </span>
              }
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              onExpand={handleExpand}
              events={expandedEvents[row.id]}
              detail={renderDetail(row)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '8px 12px' }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 600, fontFamily: MONO, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 12, color: TX1, marginTop: 1 }}>{value}</div>
    </div>
  );
}

export default ComplaintResolutionChainTab;
