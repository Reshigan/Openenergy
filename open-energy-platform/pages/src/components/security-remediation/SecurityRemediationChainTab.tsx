// Wave 55 — OEM-Support Firmware / Security-Patch & Vulnerability Remediation tab.
//
// The vulnerability-remediation lifecycle — the FOURTH member of the ITIL service
// management family on the support profile (after W14 incident, W41 problem,
// W47 change-enablement). Distinct from W47: change-enablement AUTHORISES a
// proposed change; this drives an OEM/CERT vulnerability or firmware advisory
// through a remediation campaign across the affected deployed-asset fleet of OT
// configuration items (inverters, SCADA, BMS, controllers): triage by CVSS,
// scope the fleet, authorise + stage the patch rollout, verify, close — OR
// formally accept the residual risk, OR back the patch out if it regresses.
//
// Forward path: advisory_received → triaged → impact_assessment → fleet_scoped →
//   remediation_approved → rollout_in_progress → verification → resolved.
//   Mitigation/containment: impact_assessment → mitigation_applied → fleet_scoped.
//   Emergency fast-path: triaged → remediation_approved (out-of-band authorise).
//   Not-affected exit: triaged → not_affected. Risk acceptance: impact_assessment
//   | mitigation_applied | fleet_scoped → risk_accepted. Backout:
//   rollout_in_progress | verification → rolled_back.
//
// URGENT SLA — the higher the CVSS severity, the tighter every window.
//
// Write model — SINGLE-PARTY {admin, support}. No access split; actor_party
// records the security functional party (security_analyst / security_authority /
// remediation_engineer) for audit attribution only. Reportability: risk-accept +
// roll-back cross for critical + high; SLA breach crosses for critical only.
// IEC 62443-2-3 + ISO/IEC 27001:2022 A.8.8 + ITIL 4 Information Security Mgmt.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'advisory_received' | 'triaged' | 'impact_assessment' | 'mitigation_applied'
  | 'fleet_scoped' | 'remediation_approved' | 'rollout_in_progress' | 'verification'
  | 'resolved' | 'not_affected' | 'risk_accepted' | 'rolled_back';

type Tier = 'critical' | 'high' | 'medium' | 'low' | 'informational';

interface RemediationRow {
  id: string;
  remediation_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  advisory_ref: string | null;
  advisory_source: string | null;
  cve_id: string | null;
  cvss_score: number | null;
  cvss_vector: string | null;
  severity_tier: Tier;
  oem_vendor: string | null;
  product_family: string | null;
  ci_type: string | null;
  affected_versions: string | null;
  fixed_version: string | null;
  patch_package_ref: string | null;
  backout_plan_ref: string | null;
  affected_ci_count: number;
  patched_ci_count: number;
  sites_affected: number;
  fleet_scope: string | null;
  project_id: string | null;
  project_name: string | null;
  sector: string | null;
  mitigation_type: string | null;
  compensating_control: string | null;
  residual_risk_basis: string | null;
  triage_ref: string | null;
  assessment_ref: string | null;
  mitigation_ref: string | null;
  approval_ref: string | null;
  rollout_ref: string | null;
  verification_ref: string | null;
  resolution_ref: string | null;
  risk_acceptance_ref: string | null;
  backout_ref: string | null;
  regulator_ref: string | null;
  triage_basis: string | null;
  assessment_basis: string | null;
  mitigation_basis: string | null;
  approval_basis: string | null;
  rollout_basis: string | null;
  verification_basis: string | null;
  resolution_basis: string | null;
  risk_acceptance_basis: string | null;
  backout_basis: string | null;
  reason_code: string | null;
  decision_notes: string | null;
  notes: string | null;
  chain_status: ChainStatus;
  advisory_received_at: string;
  triaged_at: string | null;
  impact_assessment_at: string | null;
  mitigation_applied_at: string | null;
  fleet_scoped_at: string | null;
  remediation_approved_at: string | null;
  rollout_in_progress_at: string | null;
  verification_at: string | null;
  resolved_at: string | null;
  not_affected_at: string | null;
  risk_accepted_at: string | null;
  rolled_back_at: string | null;
  is_reportable: boolean;
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
  breach_crosses_regulator?: boolean;
}

interface RemediationEvent {
  id: string;
  remediation_id: string;
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
  not_affected_count: number;
  risk_accepted_count: number;
  rolled_back_count: number;
  in_rollout_count: number;
  awaiting_approval_count: number;
  mitigated_count: number;
  breached: number;
  reportable_total: number;
  critical_open: number;
  total_affected_ci: number;
  total_patched_ci: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  advisory_received:    { bg: '#e3e7ec', fg: '#557',    label: 'Advisory received' },
  triaged:              { bg: '#dbecfb', fg: '#1a3a5c', label: 'Triaged' },
  impact_assessment:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Impact assessment' },
  mitigation_applied:   { bg: '#fff4d6', fg: '#a06200', label: 'Mitigated (interim)' },
  fleet_scoped:         { bg: '#fff4d6', fg: '#a06200', label: 'Fleet scoped' },
  remediation_approved: { bg: '#ffe9d6', fg: '#8a4a00', label: 'Remediation approved' },
  rollout_in_progress:  { bg: '#daf5e2', fg: '#1f6b3a', label: 'Rollout in progress' },
  verification:         { bg: '#daf5e2', fg: '#1f6b3a', label: 'Verification' },
  resolved:             { bg: '#d4edda', fg: '#155724', label: 'Resolved' },
  not_affected:         { bg: '#e3e7ec', fg: '#557',    label: 'Not affected' },
  risk_accepted:        { bg: '#fde0e0', fg: '#9b1f1f', label: 'Risk accepted' },
  rolled_back:          { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rolled back' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  critical:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
  high:          { bg: '#ffe4b5', fg: '#8a4a00', label: 'High' },
  medium:        { bg: '#fff4d6', fg: '#a06200', label: 'Medium' },
  low:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'Low' },
  informational: { bg: '#e3e7ec', fg: '#557',    label: 'Informational' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',               label: 'Active' },
  { key: 'all',                  label: 'All' },
  { key: 'critical',             label: 'Critical' },
  { key: 'high',                 label: 'High' },
  { key: 'medium',               label: 'Medium' },
  { key: 'low',                  label: 'Low' },
  { key: 'informational',        label: 'Informational' },
  { key: 'rollout_in_progress',  label: 'In rollout' },
  { key: 'fleet_scoped',         label: 'Awaiting approval' },
  { key: 'mitigation_applied',   label: 'Mitigated' },
  { key: 'breached',             label: 'SLA breached' },
  { key: 'reportable',           label: 'Reportable' },
  { key: 'resolved',             label: 'Resolved' },
  { key: 'risk_accepted',        label: 'Risk accepted' },
  { key: 'rolled_back',          label: 'Rolled back' },
  { key: 'not_affected',         label: 'Not affected' },
];

type ActionKind =
  | 'triage' | 'assess-impact' | 'apply-mitigation' | 'mark-not-affected'
  | 'emergency-authorize' | 'scope-fleet' | 'approve-remediation'
  | 'begin-rollout' | 'complete-rollout' | 'verify' | 'accept-risk' | 'roll-back';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  advisory_received:    'triage',
  triaged:              'assess-impact',
  impact_assessment:    'scope-fleet',
  mitigation_applied:   'scope-fleet',
  fleet_scoped:         'approve-remediation',
  remediation_approved: 'begin-rollout',
  rollout_in_progress:  'complete-rollout',
  verification:         'verify',
  resolved:             null,
  not_affected:         null,
  risk_accepted:        null,
  rolled_back:          null,
};

// security_analyst owns triage + impact assessment; security_authority owns
// authorisation + verification + risk acceptance; remediation_engineer owns
// hands-on mitigation + scoping + rollout + backout.
const ACTION_LABEL: Record<ActionKind, string> = {
  'triage':              'Triage advisory (analyst)',
  'assess-impact':       'Assess impact (analyst)',
  'apply-mitigation':    'Apply interim mitigation (engineer)',
  'mark-not-affected':   'Mark not affected (authority)',
  'emergency-authorize': 'Emergency authorise (authority)',
  'scope-fleet':         'Scope affected fleet (engineer)',
  'approve-remediation': 'Approve remediation (authority)',
  'begin-rollout':       'Begin patch rollout (engineer)',
  'complete-rollout':    'Complete rollout (engineer)',
  'verify':              'Verify remediation (authority)',
  'accept-risk':         'Accept residual risk (authority)',
  'roll-back':           'Back out patch (engineer)',
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

const TERMINAL_STATES: ChainStatus[] = ['resolved', 'not_affected', 'risk_accepted', 'rolled_back'];
const RISK_ACCEPT_STATES: ChainStatus[] = ['impact_assessment', 'mitigation_applied', 'fleet_scoped'];
const BACKOUT_STATES: ChainStatus[] = ['rollout_in_progress', 'verification'];

export function SecurityRemediationChainTab() {
  const [rows, setRows] = useState<RemediationRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<RemediationRow | null>(null);
  const [events, setEvents] = useState<RemediationEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: RemediationRow[] } & KpiSummary }>('/security-remediation/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, resolved_count: d.resolved_count,
          not_affected_count: d.not_affected_count, risk_accepted_count: d.risk_accepted_count,
          rolled_back_count: d.rolled_back_count, in_rollout_count: d.in_rollout_count,
          awaiting_approval_count: d.awaiting_approval_count, mitigated_count: d.mitigated_count,
          breached: d.breached, reportable_total: d.reportable_total, critical_open: d.critical_open,
          total_affected_ci: d.total_affected_ci, total_patched_ci: d.total_patched_ci,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load remediations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: RemediationRow; events: RemediationEvent[] } }>(
        `/security-remediation/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load remediation history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')           return true;
      if (filter === 'active')        return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')      return r.sla_breached;
      if (filter === 'reportable')    return r.is_reportable;
      if (['critical', 'high', 'medium', 'low', 'informational'].includes(filter)) {
        return r.severity_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: RemediationRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'triage') {
        const score = window.prompt('CVSS v3.1 base score (0.0-10.0) — re-derives the severity tier:', row.cvss_score != null ? String(row.cvss_score) : '');
        const cve = window.prompt('CVE identifier (e.g. CVE-2026-12345):', row.cve_id || '') || '';
        const src = window.prompt('Advisory source (oem / ics_cert / vendor_psirt / nvd):', row.advisory_source || '') || '';
        const ci = window.prompt('Affected CI type (inverter / scada / bms / plc / rtu / gateway):', row.ci_type || '') || '';
        const basis = window.prompt('Triage basis — initial applicability + exposure read:') || '';
        body = { triage_basis: basis };
        if (score && !Number.isNaN(Number(score))) body.cvss_score = Number(score);
        if (cve) body.cve_id = cve;
        if (src) body.advisory_source = src;
        if (ci) body.ci_type = ci;
      } else if (action === 'assess-impact') {
        const count = window.prompt('Affected CI count across the deployed fleet:', row.affected_ci_count ? String(row.affected_ci_count) : '') || '';
        const sites = window.prompt('Sites affected:', row.sites_affected ? String(row.sites_affected) : '') || '';
        const scope = window.prompt('Fleet scope narrative — which assets / firmware are in scope:') || '';
        const basis = window.prompt('Assessment basis — exploitability, exposure, business impact:') || '';
        body = { assessment_basis: basis, fleet_scope: scope };
        if (count && !Number.isNaN(Number(count))) body.affected_ci_count = Number(count);
        if (sites && !Number.isNaN(Number(sites))) body.sites_affected = Number(sites);
      } else if (action === 'apply-mitigation') {
        const type = window.prompt('Mitigation type (segmentation / firewall_rule / disable_port / acl):') || '';
        const ctrl = window.prompt('Compensating control — the interim containment in place:') || '';
        const basis = window.prompt('Mitigation basis — why containment now, fix later:') || '';
        body = { mitigation_basis: basis, compensating_control: ctrl };
        if (type) body.mitigation_type = type;
      } else if (action === 'mark-not-affected') {
        const reason = window.prompt('Reason — why the advisory does not affect the deployed fleet:');
        if (!reason) return;
        body = { reason_code: 'not_affected', decision_notes: reason };
      } else if (action === 'emergency-authorize') {
        const basis = window.prompt('Emergency authorisation basis — why this skips impact/scope out-of-band:');
        if (!basis) return;
        const pkg = window.prompt('Patch / firmware package reference:') || '';
        const backout = window.prompt('Backout plan reference:') || '';
        const reg = window.prompt('Regulator notification reference, if applicable:') || '';
        body = { approval_basis: basis };
        if (pkg) body.patch_package_ref = pkg;
        if (backout) body.backout_plan_ref = backout;
        if (reg) body.regulator_ref = reg;
      } else if (action === 'scope-fleet') {
        const count = window.prompt('Confirmed affected CI count:', row.affected_ci_count ? String(row.affected_ci_count) : '') || '';
        const sites = window.prompt('Confirmed sites affected:', row.sites_affected ? String(row.sites_affected) : '') || '';
        const scope = window.prompt('Final fleet scope — assets confirmed in the remediation campaign:') || '';
        body = { fleet_scope: scope };
        if (count && !Number.isNaN(Number(count))) body.affected_ci_count = Number(count);
        if (sites && !Number.isNaN(Number(sites))) body.sites_affected = Number(sites);
      } else if (action === 'approve-remediation') {
        const basis = window.prompt('Approval basis — security authority sign-off rationale:');
        if (!basis) return;
        const pkg = window.prompt('Patch / firmware package reference:') || '';
        const fixed = window.prompt('Fixed firmware version that remediates:') || '';
        const backout = window.prompt('Backout plan reference:') || '';
        body = { approval_basis: basis };
        if (pkg) body.patch_package_ref = pkg;
        if (fixed) body.fixed_version = fixed;
        if (backout) body.backout_plan_ref = backout;
      } else if (action === 'begin-rollout') {
        const pkg = window.prompt('Patch / firmware package reference:', row.patch_package_ref || '') || '';
        const patched = window.prompt('CIs patched so far (running tally):', '0') || '';
        const basis = window.prompt('Rollout basis — staging plan, ring order, change window:') || '';
        body = { rollout_basis: basis };
        if (pkg) body.patch_package_ref = pkg;
        if (patched && !Number.isNaN(Number(patched))) body.patched_ci_count = Number(patched);
      } else if (action === 'complete-rollout') {
        const patched = window.prompt('Total CIs successfully patched:', row.patched_ci_count ? String(row.patched_ci_count) : '') || '';
        const basis = window.prompt('Rollout completion basis — coverage achieved across the fleet:');
        if (!basis) return;
        body = { rollout_basis: basis };
        if (patched && !Number.isNaN(Number(patched))) body.patched_ci_count = Number(patched);
      } else if (action === 'verify') {
        const basis = window.prompt('Verification basis — confirmation the vulnerability is remediated on the fleet:');
        if (!basis) return;
        const patched = window.prompt('Final patched CI count:', row.patched_ci_count ? String(row.patched_ci_count) : '') || '';
        body = { verification_basis: basis, resolution_basis: basis };
        if (patched && !Number.isNaN(Number(patched))) body.patched_ci_count = Number(patched);
      } else if (action === 'accept-risk') {
        const basis = window.prompt('Residual-risk basis — why this cannot be patched (EOL, no fix, operational constraint):');
        if (!basis) return;
        const ctrl = window.prompt('Compensating controls held in place:') || '';
        const reg = window.prompt('Regulator reference (accepting an unpatched serious vulnerability is reportable for critical + high):') || '';
        body = { residual_risk_basis: basis, risk_acceptance_basis: basis, reason_code: 'risk_accepted' };
        if (ctrl) body.compensating_control = ctrl;
        if (reg) body.regulator_ref = reg;
      } else if (action === 'roll-back') {
        const basis = window.prompt('Backout basis — why the patch is being reversed (regression):');
        if (!basis) return;
        const ref = window.prompt('Backout record reference:') || '';
        const reg = window.prompt('Regulator reference (remediation-induced failure is reportable for critical + high):') || '';
        body = { backout_basis: basis, reason_code: 'remediation_induced_failure' };
        if (ref) body.backout_ref = ref;
        if (reg) body.regulator_ref = reg;
      }
      await api.post(`/security-remediation/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Security patch &amp; vulnerability remediation</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage OT vulnerability-remediation chain · advisory received → triaged → impact assessment →
            fleet scoped → remediation approved → rollout → verification → resolved. An interim mitigation can
            contain (impact assessment → mitigated); a critical CVE can fast-path through emergency authorisation;
            an advisory that does not affect the fleet exits as not-affected; residual risk can be formally accepted;
            a regressing patch can be backed out. Drives an OEM/CERT firmware or security advisory through a
            remediation campaign across the deployed fleet of OT configuration items. URGENT SLA: the higher the
            CVSS severity, the tighter every window. Reportable to the regulator inbox: risk-accept + roll-back
            (critical + high), SLA breach (critical). IEC 62443-2-3 + ISO/IEC 27001:2022 A.8.8 + ITIL 4 InfoSec Mgmt.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Critical open" value={kpis?.critical_open ?? 0} tone={(kpis?.critical_open ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Awaiting approval" value={kpis?.awaiting_approval_count ?? 0} tone={(kpis?.awaiting_approval_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="In rollout" value={kpis?.in_rollout_count ?? 0} tone={(kpis?.in_rollout_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Mitigated" value={kpis?.mitigated_count ?? 0} tone={(kpis?.mitigated_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Resolved" value={kpis?.resolved_count ?? 0} tone="ok" />
        <Kpi label="Risk accepted" value={kpis?.risk_accepted_count ?? 0} tone={(kpis?.risk_accepted_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Rolled back" value={kpis?.rolled_back_count ?? 0} tone={(kpis?.rolled_back_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="CIs patched" value={`${kpis?.total_patched_ci ?? 0}/${kpis?.total_affected_ci ?? 0}`} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Remediation #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">CVE / OEM</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Severity</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">CVSS</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Fleet</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.severity_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.remediation_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[280px] truncate" title={`${r.cve_id ?? ''} · ${r.oem_vendor ?? ''} · ${r.product_family ?? ''}`}>
                      {r.cve_id ?? '—'}
                      <span className="text-[#4a5568]"> · {r.oem_vendor ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{r.cvss_score != null ? r.cvss_score.toFixed(1) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">
                      {r.affected_ci_count ? `${r.patched_ci_count}/${r.affected_ci_count}` : '—'}
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No remediations match.</td></tr>
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
  row: RemediationRow;
  events: RemediationEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: RemediationRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canEmergency = row.chain_status === 'triaged';
  const canNotAffected = row.chain_status === 'triaged';
  const canMitigate = row.chain_status === 'impact_assessment';
  const canAcceptRisk = RISK_ACCEPT_STATES.includes(row.chain_status);
  const canBackout = BACKOUT_STATES.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.remediation_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.cve_id ?? row.advisory_ref ?? 'Advisory'}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.severity_tier].label}
                {row.cvss_score != null ? ` · CVSS ${row.cvss_score.toFixed(1)}` : ''}
                {row.oem_vendor ? ` · ${row.oem_vendor}` : ''}
                {row.product_family ? ` · ${row.product_family}` : ''}
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
            <Pair label="State"            value={STATE_TONE[row.chain_status].label} />
            <Pair label="Severity tier"    value={TIER_TONE[row.severity_tier].label} />
            <Pair label="CVSS score"        value={row.cvss_score != null ? row.cvss_score.toFixed(1) : '—'} />
            <Pair label="CVSS vector"       value={row.cvss_vector ?? '—'} />
            <Pair label="CVE"               value={row.cve_id ?? '—'} />
            <Pair label="Advisory ref"      value={row.advisory_ref ?? '—'} />
            <Pair label="Advisory source"   value={row.advisory_source ?? '—'} />
            <Pair label="OEM vendor"        value={row.oem_vendor ?? '—'} />
            <Pair label="Product family"    value={row.product_family ?? '—'} />
            <Pair label="CI type"           value={row.ci_type ?? '—'} />
            <Pair label="Affected versions" value={row.affected_versions ?? '—'} />
            <Pair label="Fixed version"     value={row.fixed_version ?? '—'} />
            <Pair label="Affected CIs"      value={String(row.affected_ci_count ?? 0)} />
            <Pair label="Patched CIs"       value={String(row.patched_ci_count ?? 0)} />
            <Pair label="Sites affected"    value={String(row.sites_affected ?? 0)} />
            <Pair label="Sector"            value={row.sector ?? '—'} />
            <Pair label="Patch package"     value={row.patch_package_ref ?? '—'} />
            <Pair label="Backout plan"      value={row.backout_plan_ref ?? '—'} />
            <Pair label="Mitigation type"   value={row.mitigation_type ?? '—'} />
            <Pair label="Regulator ref"     value={row.regulator_ref ?? '—'} />
            <Pair label="Reason code"       value={row.reason_code ?? '—'} />
            <Pair label="Advisory recvd"    value={fmtDate(row.advisory_received_at)} />
            <Pair label="Triaged"           value={fmtDate(row.triaged_at)} />
            <Pair label="Impact assessed"   value={fmtDate(row.impact_assessment_at)} />
            <Pair label="Mitigated"         value={fmtDate(row.mitigation_applied_at)} />
            <Pair label="Fleet scoped"      value={fmtDate(row.fleet_scoped_at)} />
            <Pair label="Approved"          value={fmtDate(row.remediation_approved_at)} />
            <Pair label="Rollout began"     value={fmtDate(row.rollout_in_progress_at)} />
            <Pair label="Verification"      value={fmtDate(row.verification_at)} />
            <Pair label="Resolved"          value={fmtDate(row.resolved_at)} />
            <Pair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"        value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"    value={String(row.escalation_level)} />
            <Pair label="Reportable"        value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.fleet_scope && (
            <BasisBlock label="Fleet scope" tone="#1a3a5c" text={row.fleet_scope} />
          )}
          {row.triage_basis && (
            <BasisBlock label="Triage basis" tone="#1a3a5c" text={row.triage_basis} />
          )}
          {row.assessment_basis && (
            <BasisBlock label="Assessment basis" tone="#1a3a5c" text={row.assessment_basis} />
          )}
          {row.mitigation_basis && (
            <BasisBlock label="Mitigation basis" tone="#a06200" text={row.mitigation_basis} />
          )}
          {row.compensating_control && (
            <BasisBlock label="Compensating control" tone="#a06200" text={row.compensating_control} />
          )}
          {row.approval_basis && (
            <BasisBlock label="Approval basis" tone="#8a4a00" text={row.approval_basis} />
          )}
          {row.rollout_basis && (
            <BasisBlock label="Rollout basis" tone="#1f6b3a" text={row.rollout_basis} />
          )}
          {row.verification_basis && (
            <BasisBlock label="Verification basis" tone="#1f6b3a" text={row.verification_basis} />
          )}
          {row.residual_risk_basis && (
            <BasisBlock label="Residual-risk basis" tone="#9b1f1f" text={row.residual_risk_basis} />
          )}
          {row.backout_basis && (
            <BasisBlock label="Backout basis" tone="#9b1f1f" text={row.backout_basis} />
          )}
          {row.decision_notes && (
            <BasisBlock label="Decision notes" tone="#155724" text={row.decision_notes} />
          )}
        </section>

        {(nextAction || canEmergency || canNotAffected || canMitigate || canAcceptRisk || canBackout) && (
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
              {canMitigate && (
                <button type="button"
                  onClick={() => onAct('apply-mitigation', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#a06200] hover:bg-[#fff4d6]"
                >
                  {ACTION_LABEL['apply-mitigation']}
                </button>
              )}
              {canEmergency && (
                <button type="button"
                  onClick={() => onAct('emergency-authorize', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['emergency-authorize']}
                </button>
              )}
              {canNotAffected && (
                <button type="button"
                  onClick={() => onAct('mark-not-affected', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#557] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['mark-not-affected']}
                </button>
              )}
              {canAcceptRisk && (
                <button type="button"
                  onClick={() => onAct('accept-risk', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['accept-risk']}
                </button>
              )}
              {canBackout && (
                <button type="button"
                  onClick={() => onAct('roll-back', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['roll-back']}
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
