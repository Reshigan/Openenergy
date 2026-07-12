// Wave 89 — OEM-Support Field Change Order / ECN Campaign Management tab.
//
// OEM-pushed, fleet-wide retrofit campaigns: Tesla Megapack module replacement
// notices, Vestas gearbox upgrade campaigns, GE blade-bond inspection bulletins,
// Sungrow inverter capacitor service bulletins, SolarEdge optimizer recalls,
// SMA firmware-coupled hardware revisions. Distinct from W47 (customer-initiated
// RFC), W55 (firmware-only), W15 (single-unit RMA), W63 (commercial chase).
//
// DISTINCTIVE move (beat PTC Windchill ECM / Siemens Teamcenter Change Manager
// / Oracle Agile PLM / Arena PLM / Aras Innovator / Dassault Enovia / SAP PLM
// field-action / Tesla Megapack service campaigns / Vestas Online Service
// Bulletins / GE Vernova fleet upgrade campaigns — every PLM tool treats an
// ECN as a DOCUMENT): the campaign is a LIVE FLEET-OPERATIONAL programme,
// with a per-fleet completion ledger, RE-DERIVED safety tier, retrofit-
// economics battery (completion %, MTTR, predicted full coverage days,
// total campaign CapEx, warranty coverage %, fleet energy at risk MW,
// judicial-review-risk score, urgency band), and a FLEET-PROPAGATION
// SIGNATURE that crosses the regulator inbox on safety lodgements
// (NRCS / SANS) and on grid-significant fleet rollouts (NERSA Grid Code
// >= 50 MW), with a post-approval cancellation hard line that crosses
// for EVERY class.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'draft' | 'under_review' | 'approved' | 'population_identified'
  | 'notification_sent' | 'acknowledged' | 'scheduling' | 'in_progress'
  | 'completed' | 'suspended' | 'cancelled' | 'withdrawn';

type ChangeClass =
  | 'mandatory_safety' | 'mandatory_performance' | 'recommended' | 'optional';

type UrgencyBand = 'urgent' | 'due_soon' | 'on_track' | 'over_due';

interface FcoRow {
  [key: string]: unknown;
  id: string;
  campaign_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  oem_id: string;
  oem_name: string;
  product_family: string;
  product_model: string;
  serial_range_start: string | null;
  serial_range_end: string | null;
  firmware_baseline: string | null;
  campaign_title: string;
  change_class: ChangeClass;
  technical_summary: string | null;
  regulatory_reference: string | null;
  ecrb_decision_ref: string | null;
  reason_code: string | null;
  affected_units: number;
  affected_capacity_mw: number;
  affected_owner_count: number;
  affected_site_count: number;
  acknowledged_units: number;
  scheduled_units: number;
  completed_units: number;
  warranty_covered_units: number;
  retrofit_cost_per_unit_zar: number;
  total_campaign_capex_zar: number;
  warranty_coverage_pct: number;
  fleet_energy_at_risk_mw: number;
  mean_time_to_retrofit_hours: number;
  predicted_full_coverage_days: number | null;
  judicial_review_risk: number;
  campaign_tier: ChangeClass;
  last_action_ref: string | null;
  regulator_ref: string | null;
  campaign_summary: string | null;
  chain_status: ChainStatus;
  draft_at: string;
  under_review_at: string | null;
  approved_at: string | null;
  population_identified_at: string | null;
  notification_sent_at: string | null;
  acknowledged_at: string | null;
  scheduling_at: string | null;
  in_progress_at: string | null;
  completed_at: string | null;
  suspended_at: string | null;
  cancelled_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  escalation_level: number;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  completion_pct_live?: number;
  mean_time_to_retrofit_hours_live?: number;
  predicted_full_coverage_days_live?: number | null;
  total_campaign_capex_zar_live?: number;
  warranty_coverage_pct_live?: number;
  fleet_energy_at_risk_mw_live?: number;
  acknowledgement_pct_live?: number;
  judicial_review_risk_live?: number;
  sla_days_remaining_live?: number | null;
  urgency_band_live?: UrgencyBand;
}

interface FcoEvent {
  id: string;
  campaign_id: string;
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
  in_progress_count: number;
  scheduling_count: number;
  acknowledged_count: number;
  notification_count: number;
  approved_count: number;
  under_review_count: number;
  completed_count: number;
  suspended_count: number;
  cancelled_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  mandatory_safety_count: number;
  mandatory_performance_count: number;
  ge_50mw_count: number;
  total_affected_units: number;
  total_completed_units: number;
  total_affected_capacity_mw: number;
  total_campaign_capex_zar: number;
  total_fleet_energy_at_risk_mw: number;
  completion_weighted_pct: number;
  urgent_count: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  draft:                 { bg: 'var(--s2, #eef1f5)', fg: 'var(--ink-2)',    label: 'Draft' },
  under_review:          { bg: 'color-mix(in oklab, var(--warn) 18%, var(--s1))', fg: 'var(--warn)', label: 'Under review' },
  approved:              { bg: 'color-mix(in oklab, var(--good) 15%, var(--s1))', fg: 'var(--good, #1f6b3a)', label: 'Approved' },
  population_identified: { bg: 'color-mix(in oklab, var(--warn) 18%, var(--s1))', fg: 'var(--warn)', label: 'Population identified' },
  notification_sent:     { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'Notification sent' },
  acknowledged:          { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'Acknowledged' },
  scheduling:            { bg: '#ffe9d6', fg: 'var(--warn)', label: 'Scheduling' },
  in_progress:           { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'Rolling out' },
  completed:             { bg: 'color-mix(in oklab, var(--good) 15%, var(--s1))', fg: 'var(--good, #1f6b3a)', label: 'Completed' },
  suspended:             { bg: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', fg: 'var(--bad, #9b1f1f)', label: 'Suspended' },
  cancelled:             { bg: 'var(--s2, #eef1f5)', fg: 'var(--ink-2)',    label: 'Cancelled' },
  withdrawn:             { bg: 'var(--s2, #eef1f5)', fg: 'var(--ink-2)',    label: 'Withdrawn' },
};

const CLASS_TONE: Record<ChangeClass, { bg: string; fg: string; label: string }> = {
  mandatory_safety:      { bg: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', fg: 'var(--bad, #9b1f1f)', label: 'Mandatory · safety' },
  mandatory_performance: { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'Mandatory · performance' },
  recommended:           { bg: 'color-mix(in oklab, var(--warn) 18%, var(--s1))', fg: 'var(--warn)', label: 'Recommended' },
  optional:              { bg: 'var(--s2, #eef1f5)', fg: 'var(--ink-2)',    label: 'Optional' },
};

const URGENCY_TONE: Record<UrgencyBand, { bg: string; fg: string; label: string }> = {
  over_due: { bg: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', fg: 'var(--bad, #9b1f1f)', label: 'Over due' },
  urgent:   { bg: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', fg: 'var(--bad, #9b1f1f)', label: 'Urgent' },
  due_soon: { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'Due soon' },
  on_track: { bg: 'color-mix(in oklab, var(--good) 15%, var(--s1))', fg: 'var(--good, #1f6b3a)', label: 'On track' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                  label: 'Open' },
  { key: 'all',                   label: 'All' },
  { key: 'mandatory_safety',      label: 'Safety' },
  { key: 'mandatory_performance', label: 'Performance' },
  { key: 'recommended',           label: 'Recommended' },
  { key: 'optional',              label: 'Optional' },
  { key: 'in_progress',           label: 'Rolling out' },
  { key: 'suspended',             label: 'Suspended' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'ge_50mw',               label: 'Grid-significant (≥50 MW)' },
  { key: 'completed',             label: 'Completed' },
  { key: 'cancelled',             label: 'Cancelled' },
  { key: 'withdrawn',             label: 'Withdrawn' },
];

type ActionKind =
  | 'submit-for-review' | 'approve-campaign' | 'identify-population'
  | 'send-notification' | 'acknowledge-receipt' | 'schedule-rollout'
  | 'start-implementation' | 'complete-campaign' | 'suspend-campaign'
  | 'resume-campaign' | 'cancel-campaign' | 'withdraw-campaign';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  draft:                 'submit-for-review',
  under_review:          'approve-campaign',
  approved:              'identify-population',
  population_identified: 'send-notification',
  notification_sent:     'acknowledge-receipt',
  acknowledged:          'schedule-rollout',
  scheduling:            'start-implementation',
  in_progress:           'complete-campaign',
  suspended:             'resume-campaign',
  completed:             null,
  cancelled:             null,
  withdrawn:             null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'submit-for-review':    'Submit for ECRB review (OEM)',
  'approve-campaign':     'Approve campaign (OEM ECRB)',
  'identify-population':  'Identify affected population (OEM)',
  'send-notification':    'Dispatch fleet notification (OEM)',
  'acknowledge-receipt':  'Acknowledge receipt (operator)',
  'schedule-rollout':     'Schedule rollout (operator)',
  'start-implementation': 'Start implementation (operator)',
  'complete-campaign':    'Complete campaign (operator)',
  'suspend-campaign':     'Suspend campaign (operator)',
  'resume-campaign':      'Resume campaign (operator)',
  'cancel-campaign':      'Cancel campaign (operator)',
  'withdraw-campaign':    'Withdraw campaign (OEM)',
};

const SECONDARY_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  draft:                 ['withdraw-campaign'],
  under_review:          ['withdraw-campaign'],
  approved:              ['cancel-campaign'],
  population_identified: ['cancel-campaign'],
  notification_sent:     ['cancel-campaign'],
  acknowledged:          ['cancel-campaign'],
  scheduling:            ['cancel-campaign'],
  in_progress:           ['suspend-campaign', 'cancel-campaign'],
  suspended:             ['cancel-campaign'],
  completed:             [],
  cancelled:             [],
  withdrawn:             [],
};

const DESTRUCTIVE: ActionKind[] = ['suspend-campaign', 'cancel-campaign', 'withdraw-campaign'];

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (Math.abs(v) >= 1_000_000) return `R${(v / 1_000_000).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}m`;
  if (Math.abs(v) >= 1000) return `R${(v / 1000).toLocaleString('en-ZA', { maximumFractionDigits: 1 })}k`;
  return `R${v.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
}

function fmtMw(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${v.toLocaleString('en-ZA', { maximumFractionDigits: 2 })} MW`;
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${v.toLocaleString('en-ZA', { maximumFractionDigits: 2 })}%`;
}

function fmtDays(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${v.toLocaleString('en-ZA', { maximumFractionDigits: 1 })}d`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

const TERMINAL_STATES: ChainStatus[] = ['completed', 'cancelled', 'withdrawn'];

export function OemFcoChainTab() {
  const [rows, setRows] = useState<FcoRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<FcoRow | null>(null);
  const [events, setEvents] = useState<FcoEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: FcoRow[] } & KpiSummary }>('/oem-fco/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count,
          in_progress_count: d.in_progress_count, scheduling_count: d.scheduling_count,
          acknowledged_count: d.acknowledged_count, notification_count: d.notification_count,
          approved_count: d.approved_count, under_review_count: d.under_review_count,
          completed_count: d.completed_count, suspended_count: d.suspended_count,
          cancelled_count: d.cancelled_count, withdrawn_count: d.withdrawn_count,
          breached: d.breached, reportable_total: d.reportable_total,
          mandatory_safety_count: d.mandatory_safety_count,
          mandatory_performance_count: d.mandatory_performance_count,
          ge_50mw_count: d.ge_50mw_count,
          total_affected_units: d.total_affected_units,
          total_completed_units: d.total_completed_units,
          total_affected_capacity_mw: d.total_affected_capacity_mw,
          total_campaign_capex_zar: d.total_campaign_capex_zar,
          total_fleet_energy_at_risk_mw: d.total_fleet_energy_at_risk_mw,
          completion_weighted_pct: d.completion_weighted_pct,
          urgent_count: d.urgent_count,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load OEM FCO campaigns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: FcoRow; events: FcoEvent[] } }>(
        `/oem-fco/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load campaign history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'open')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable_flag;
      if (filter === 'ge_50mw')    return (r.affected_capacity_mw || 0) >= 50;
      if (['mandatory_safety', 'mandatory_performance', 'recommended', 'optional'].includes(filter)) {
        return r.campaign_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: FcoRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'submit-for-review') {
        const title = window.prompt('Campaign title (one line):', row.campaign_title) || '';
        const summary = window.prompt('Technical summary (defect + corrective action):') || '';
        const baseline = window.prompt('Firmware baseline (if applicable):', row.firmware_baseline || '') || '';
        const ref = window.prompt('Last action ref (ECRB submission no.):') || '';
        body = {};
        if (title) body.campaign_title = title;
        if (summary) body.technical_summary = summary;
        if (baseline) body.firmware_baseline = baseline;
        if (ref) body.last_action_ref = ref;
      } else if (action === 'approve-campaign') {
        const ecrb = window.prompt('ECRB decision reference:', row.ecrb_decision_ref || '') || '';
        const reg = window.prompt('Regulator reference (NRCS / SANS lodgement — REQUIRED if mandatory_safety):', row.regulator_ref || '') || '';
        const cls = window.prompt('Confirm change class (mandatory_safety / mandatory_performance / recommended / optional):', row.change_class || '') || '';
        body = {};
        if (ecrb) body.ecrb_decision_ref = ecrb;
        if (reg)  body.regulator_ref = reg;
        if (cls)  body.change_class = cls;
      } else if (action === 'identify-population') {
        const units = window.prompt('Affected units (serial count):', String(row.affected_units || 0)) || '';
        const capacity = window.prompt('Affected capacity (MW total):', String(row.affected_capacity_mw || 0)) || '';
        const owners = window.prompt('Affected owner count:', String(row.affected_owner_count || 0)) || '';
        const sites = window.prompt('Affected site count:', String(row.affected_site_count || 0)) || '';
        const start = window.prompt('Serial range start:', row.serial_range_start || '') || '';
        const end = window.prompt('Serial range end:', row.serial_range_end || '') || '';
        const cost = window.prompt('Retrofit cost per unit (ZAR):', String(row.retrofit_cost_per_unit_zar || 0)) || '';
        const wc = window.prompt('Warranty-covered units:', String(row.warranty_covered_units || 0)) || '';
        body = {};
        if (units && !Number.isNaN(Number(units)))       body.affected_units = Number(units);
        if (capacity && !Number.isNaN(Number(capacity))) body.affected_capacity_mw = Number(capacity);
        if (owners && !Number.isNaN(Number(owners)))     body.affected_owner_count = Number(owners);
        if (sites && !Number.isNaN(Number(sites)))       body.affected_site_count = Number(sites);
        if (start) body.serial_range_start = start;
        if (end)   body.serial_range_end = end;
        if (cost && !Number.isNaN(Number(cost)))         body.retrofit_cost_per_unit_zar = Number(cost);
        if (wc && !Number.isNaN(Number(wc)))             body.warranty_covered_units = Number(wc);
      } else if (action === 'send-notification') {
        const ref = window.prompt('Last action ref (notification dispatch id):') || '';
        const reg = window.prompt('Regulator reference (REQUIRED ≥50 MW or mandatory):', row.regulator_ref || '') || '';
        body = {};
        if (ref) body.last_action_ref = ref;
        if (reg) body.regulator_ref = reg;
      } else if (action === 'acknowledge-receipt') {
        const ack = window.prompt('Acknowledged units (operator-confirmed):', String(row.acknowledged_units || row.affected_units || 0)) || '';
        body = {};
        if (ack && !Number.isNaN(Number(ack))) body.acknowledged_units = Number(ack);
      } else if (action === 'schedule-rollout') {
        const sched = window.prompt('Scheduled units (slots assigned):', String(row.scheduled_units || row.acknowledged_units || 0)) || '';
        body = {};
        if (sched && !Number.isNaN(Number(sched))) body.scheduled_units = Number(sched);
      } else if (action === 'start-implementation') {
        const ref = window.prompt('Last action ref (work-order pack id):') || '';
        body = {};
        if (ref) body.last_action_ref = ref;
      } else if (action === 'complete-campaign') {
        const done = window.prompt('Completed units (must equal affected for full coverage):', String(row.completed_units || row.affected_units || 0)) || '';
        const reg = window.prompt('Regulator reference (REQUIRED if mandatory_safety):', row.regulator_ref || '') || '';
        body = {};
        if (done && !Number.isNaN(Number(done))) body.completed_units = Number(done);
        if (reg) body.regulator_ref = reg;
      } else if (action === 'suspend-campaign') {
        const reason = window.prompt('Suspend reason — supply shortage / safety hold / audit:');
        if (!reason) return;
        const reg = window.prompt('Regulator reference (REQUIRED if mandatory_safety):', row.regulator_ref || '') || '';
        body = { reason_code: reason };
        if (reg) body.regulator_ref = reg;
      } else if (action === 'resume-campaign') {
        const ref = window.prompt('Last action ref (resume order):') || '';
        body = {};
        if (ref) body.last_action_ref = ref;
      } else if (action === 'cancel-campaign') {
        const reason = window.prompt('Cancel reason — post-approval cancellation always crosses regulator:');
        if (!reason) return;
        const reg = window.prompt('Regulator reference (cancellation notice id):', row.regulator_ref || '') || '';
        body = { reason_code: reason };
        if (reg) body.regulator_ref = reg;
      } else if (action === 'withdraw-campaign') {
        const reason = window.prompt('Withdraw reason — pre-approval rollback:');
        if (!reason) return;
        const reg = window.prompt('Regulator reference (REQUIRED if mandatory_safety):', row.regulator_ref || '') || '';
        body = { reason_code: reason };
        if (reg) body.regulator_ref = reg;
      }
      await api.post(`/oem-fco/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[var(--ink, #0c2a4d)]">OEM field change orders &amp; ECN campaigns · fleet retrofit management</h2>
          <p className="text-xs text-[var(--ink-2, #4a5568)]">
            12-stage OEM-pushed fleet-wide retrofit campaign · draft → under review → approved → population identified
            → notification sent → acknowledged → scheduling → rolling out → completed, with a suspend ↔ resume loop and
            cancel / withdraw branches. The MANUFACTURER&apos;S fleet-wide change-management lane — Tesla Megapack module
            recalls, Vestas gearbox upgrade campaigns, GE blade-bond bulletins, Sungrow capacitor service bulletins,
            SolarEdge optimizer recalls, SMA firmware-coupled hardware revisions. Distinct from customer-initiated
            RFCs, firmware-only changes, single-unit RMAs, and commercial recovery claims. The DIFFERENTIATOR over PTC
            Windchill ECM / Siemens Teamcenter Change Manager / Oracle Agile PLM / Arena PLM / Aras Innovator / Dassault
            Enovia / SAP PLM field-action / Tesla Megapack service campaigns / Vestas Online Service Bulletins / GE
            Vernova fleet upgrade campaigns: the campaign is a LIVE FLEET-OPERATIONAL programme with per-fleet completion
            ledger, RE-DERIVED safety tier, retrofit-economics battery (completion %, MTTR, predicted full coverage days,
            total CapEx ZAR, warranty coverage %, fleet energy at risk MW, judicial-review-risk score, urgency band),
            and a FLEET-PROPAGATION signature: approve / complete / suspend / withdraw cross the regulator inbox on
            MANDATORY_SAFETY (NRCS+SANS), send-notification crosses on ≥50 MW (NERSA Grid Code), cancel crosses for
            EVERY class (post-approval cancellation hard line), SLA breach crosses mandatory tiers only.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total campaigns" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Rolling out" value={kpis?.in_progress_count ?? 0} tone={(kpis?.in_progress_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Suspended" value={kpis?.suspended_count ?? 0} tone={(kpis?.suspended_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Completed" value={kpis?.completed_count ?? 0} tone="ok" />
        <Kpi label="Cancelled" value={kpis?.cancelled_count ?? 0} tone={(kpis?.cancelled_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Safety" value={kpis?.mandatory_safety_count ?? 0} tone={(kpis?.mandatory_safety_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Performance" value={kpis?.mandatory_performance_count ?? 0} tone={(kpis?.mandatory_performance_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="≥50 MW grid-significant" value={kpis?.ge_50mw_count ?? 0} tone={(kpis?.ge_50mw_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Urgent / over-due" value={kpis?.urgent_count ?? 0} tone={(kpis?.urgent_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Affected units" value={(kpis?.total_affected_units ?? 0).toLocaleString('en-ZA')} />
        <Kpi label="Completed units" value={(kpis?.total_completed_units ?? 0).toLocaleString('en-ZA')} tone="ok" />
        <Kpi label="Fleet capacity" value={fmtMw(kpis?.total_affected_capacity_mw)} />
        <Kpi label="Coverage" value={fmtPct(kpis?.completion_weighted_pct)} />
        <Kpi label="Total CapEx" value={fmtZar(kpis?.total_campaign_capex_zar)} />
        <Kpi label="Energy at risk" value={fmtMw(kpis?.total_fleet_energy_at_risk_mw)} tone={(kpis?.total_fleet_energy_at_risk_mw ?? 0) > 0 ? 'warn' : 'ok'} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
                : 'bg-surface-v2 text-[var(--ink-2, #4a5568)] border border-[var(--border-subtle, #d8dde6)] hover:bg-[var(--s2, #f3f5f9)]'
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
        <div className="rounded border border-[var(--border-subtle, #d8dde6)] bg-surface-v2 px-4 py-6 text-center text-sm text-[var(--ink-2, #4a5568)]">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded border border-[var(--border-subtle, #d8dde6)] bg-surface-v2">
          <table className="w-full text-[12px]">
            <thead className="bg-[var(--s2, #f3f5f9)]">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Campaign #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>OEM / product</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Class</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Units</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>MW</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Coverage</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Urgency</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = CLASS_TONE[r.campaign_tier];
                const ut = r.urgency_band_live ? URGENCY_TONE[r.urgency_band_live] : null;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[var(--border-subtle, #e3e7ec)] hover:bg-[var(--s1, #f8fafc)]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      {r.campaign_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[var(--bad, #9b1f1f)]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[var(--ink, #0c2a4d)] max-w-[260px] truncate" title={`${r.oem_name} · ${r.product_family} ${r.product_model}`}>
                      {r.oem_name}
                      <span className="text-[var(--ink-2, #4a5568)]"> · {r.product_family} {r.product_model}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--ink, #0c2a4d)]">
                      {(r.completed_units || 0).toLocaleString('en-ZA')}<span className="text-[var(--ink-2, #4a5568)]"> / {(r.affected_units || 0).toLocaleString('en-ZA')}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--ink, #0c2a4d)]">{(r.affected_capacity_mw || 0).toLocaleString('en-ZA', { maximumFractionDigits: 1 })}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--ink, #0c2a4d)]">{fmtPct(r.completion_pct_live)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {ut && (
                        <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: ut.bg, color: ut.fg }}>
                          {ut.label}
                        </span>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[var(--ink-2, #4a5568)]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-[var(--ink-2, #4a5568)]">No campaigns match.</td></tr>
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
  const color = tone === 'bad' ? 'var(--bad, #9b1f1f)' : tone === 'warn' ? '#a06200' : 'var(--ink, #0c2a4d)';
  return (
    <div className="rounded border border-[var(--border-subtle, #d8dde6)] bg-surface-v2 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--ink-2, #4a5568)]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct,
}: {
  row: FcoRow;
  events: FcoEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: FcoRow) => void;
}) {
  const primary = ACTION_FOR_STATE[row.chain_status];
  const secondary = SECONDARY_ACTIONS[row.chain_status];

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[760px] overflow-y-auto bg-surface-v2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[var(--border-subtle, #d8dde6)] bg-[var(--s2, #f3f5f9)] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[var(--ink-2, #4a5568)]">{row.campaign_number}</div>
              <div className="text-base font-semibold text-[var(--ink, #0c2a4d)]">{row.campaign_title}</div>
              <div className="mt-1 text-[12px] text-[var(--ink-2, #4a5568)]">
                {row.oem_name} · {row.product_family} {row.product_model}
                {row.firmware_baseline ? ` · fw ${row.firmware_baseline}` : ''}
              </div>
              {row.source_wave && (
                <div className="mt-1 text-[11px] text-[var(--ink-2, #4a5568)]">
                  Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-[var(--ink-2, #4a5568)] hover:text-[var(--ink, #0c2a4d)]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[var(--border-subtle, #e3e7ec)]">
          <div className="mb-3 rounded border border-[var(--border-subtle, #d8dde6)] bg-[var(--s1, #f8fafc)] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-2, #4a5568)] mb-1">Live fleet-coverage &amp; retrofit-economics battery</div>
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <Pair label="Completion"             value={fmtPct(row.completion_pct_live ?? 0)} />
              <Pair label="Acknowledgement"        value={fmtPct(row.acknowledgement_pct_live ?? 0)} />
              <Pair label="Mean time to retrofit"  value={`${(row.mean_time_to_retrofit_hours_live ?? 0).toLocaleString('en-ZA', { maximumFractionDigits: 2 })} h/unit`} />
              <Pair label="Predicted full coverage" value={fmtDays(row.predicted_full_coverage_days_live)} />
              <Pair label="Total campaign CapEx"   value={fmtZar(row.total_campaign_capex_zar_live)} />
              <Pair label="Warranty coverage"      value={fmtPct(row.warranty_coverage_pct_live)} />
              <Pair label="Fleet energy at risk"   value={fmtMw(row.fleet_energy_at_risk_mw_live)} />
              <Pair label="Judicial review risk"   value={`${row.judicial_review_risk_live ?? 0} / 100`} />
              <Pair label="SLA days remaining"     value={row.sla_days_remaining_live != null ? `${row.sla_days_remaining_live.toLocaleString('en-ZA', { maximumFractionDigits: 1 })}d` : '—'} />
              <Pair label="Urgency band"           value={row.urgency_band_live ? URGENCY_TONE[row.urgency_band_live].label : '—'} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"               value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier (re-derived)"   value={CLASS_TONE[row.campaign_tier].label} />
            <Pair label="Change class"        value={CLASS_TONE[row.change_class].label} />
            <Pair label="OEM"                 value={row.oem_name} />
            <Pair label="Product family"      value={row.product_family} />
            <Pair label="Product model"       value={row.product_model} />
            <Pair label="Serial range start"  value={row.serial_range_start ?? '—'} />
            <Pair label="Serial range end"    value={row.serial_range_end ?? '—'} />
            <Pair label="Firmware baseline"   value={row.firmware_baseline ?? '—'} />
            <Pair label="Affected units"      value={(row.affected_units || 0).toLocaleString('en-ZA')} />
            <Pair label="Affected capacity"   value={fmtMw(row.affected_capacity_mw)} />
            <Pair label="Affected owners"     value={String(row.affected_owner_count || 0)} />
            <Pair label="Affected sites"      value={String(row.affected_site_count || 0)} />
            <Pair label="Acknowledged units"  value={(row.acknowledged_units || 0).toLocaleString('en-ZA')} />
            <Pair label="Scheduled units"     value={(row.scheduled_units || 0).toLocaleString('en-ZA')} />
            <Pair label="Completed units"     value={(row.completed_units || 0).toLocaleString('en-ZA')} />
            <Pair label="Warranty-covered"    value={(row.warranty_covered_units || 0).toLocaleString('en-ZA')} />
            <Pair label="Retrofit cost / unit" value={fmtZar(row.retrofit_cost_per_unit_zar)} />
            <Pair label="Last action ref"     value={row.last_action_ref ?? '—'} />
            <Pair label="ECRB decision ref"   value={row.ecrb_decision_ref ?? '—'} />
            <Pair label="Regulator ref"       value={row.regulator_ref ?? '—'} />
            <Pair label="Regulatory ref"      value={row.regulatory_reference ?? '—'} />
            <Pair label="Reason code"         value={row.reason_code ?? '—'} />
            <Pair label="Drafted"             value={fmtDate(row.draft_at)} />
            <Pair label="Submitted"           value={fmtDate(row.under_review_at)} />
            <Pair label="Approved"            value={fmtDate(row.approved_at)} />
            <Pair label="Population ID"       value={fmtDate(row.population_identified_at)} />
            <Pair label="Notification sent"   value={fmtDate(row.notification_sent_at)} />
            <Pair label="Acknowledged"        value={fmtDate(row.acknowledged_at)} />
            <Pair label="Scheduling"          value={fmtDate(row.scheduling_at)} />
            <Pair label="In progress"         value={fmtDate(row.in_progress_at)} />
            <Pair label="Completed"           value={fmtDate(row.completed_at)} />
            <Pair label="Suspended"           value={fmtDate(row.suspended_at)} />
            <Pair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"          value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"      value={String(row.escalation_level)} />
            <Pair label="Reportable"          value={row.is_reportable_flag ? 'Yes' : 'No'} />
          </div>
          {row.technical_summary && <BasisBlock label="Technical summary" tone="oklch(0.46 0.16 55)" text={row.technical_summary} />}
          {row.campaign_summary && <BasisBlock label="Campaign summary" tone="oklch(0.46 0.16 55)" text={row.campaign_summary} />}
        </section>

        {(primary || secondary.length > 0) && (
          <section className="px-5 py-4 border-b border-[var(--border-subtle, #e3e7ec)]">
            <div className="text-[11px] uppercase tracking-wider text-[var(--ink-2, #4a5568)] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {primary && (
                <button type="button"
                  onClick={() => onAct(primary, row)}
                  className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#c2873a]"
                >
                  {ACTION_LABEL[primary]}
                </button>
              )}
              {secondary.map((a) => {
                const danger = DESTRUCTIVE.includes(a);
                return (
                  <button type="button"
                    key={a}
                    onClick={() => onAct(a, row)}
                    className={
                      danger
                        ? 'rounded border border-red-300 bg-surface-v2 px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50'
                        : 'rounded border border-[var(--border-subtle, #d8dde6)] bg-surface-v2 px-3 py-1.5 text-[12px] font-medium text-[#557] hover:bg-[var(--s2, #f3f5f9)]'
                    }
                  >
                    {ACTION_LABEL[a]}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-[var(--ink-2, #4a5568)] mb-2">Audit timeline</div>
          {events.length === 0 ? (
            <div className="text-[12px] text-[var(--ink-2, #4a5568)]">No events yet.</div>
          ) : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded border border-[var(--border-subtle, #e3e7ec)] bg-[#fafbfc] px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[var(--ink, #0c2a4d)]">{e.event_type}</span>
                    <span className="text-[var(--ink-2, #4a5568)] tabular-nums">{fmtDate(e.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    {(e.from_status || e.to_status) && (
                      <span className="text-[var(--ink-2, #4a5568)]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</span>
                    )}
                    {e.actor_party && (
                      <span className="rounded bg-[#eef1f6] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-2, #4a5568)]">{e.actor_party}</span>
                    )}
                  </div>
                  {e.notes && <div className="mt-1" style={{ color: 'oklch(0.46 0.16 55)' }}>{e.notes}</div>}
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
      <div className="text-[10px] uppercase tracking-wider text-[var(--ink-2, #4a5568)]">{label}</div>
      <div className="text-[12px] text-[var(--ink, #0c2a4d)]">{value}</div>
    </div>
  );
}
