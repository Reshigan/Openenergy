// Wave 60 — Trader Algorithmic / DEA Trading-System Certification & Kill-Switch.
//
// Financial Markets Act 19 of 2012 + FSCA Conduct Standards for automated
// trading + JSE algorithmic-trading / DEA rules + the MiFID II RTS 6 analogue
// (pre-deployment conformance testing, pre-trade risk controls, a mandatory
// kill-switch, periodic recertification). The PRE-DEPLOYMENT GOVERNANCE GATE
// upstream of every other Trader chain (W9 quote, W29 positions, W36 execution,
// W44 reporting) and watched by W52 surveillance once live.
//
//   registration_submitted → documentation_review → conformance_testing →
//   risk_controls_validation → certification_review → certified → deployed
//   (recert: deployed → recertification_review → deployed; kill-switch:
//    deployed → suspended → deployed; remediation + reject + decommission)
//
// Two-party split write — the trading FIRM owns submit_certification / deploy /
// resubmit / decommission and may always hit the emergency kill-switch; the
// exchange AUTHORITY owns the gating machinery. INVERTED SLA: bigger authorised
// footprint = longer window. invoke_kill_switch crosses to the regulator for
// EVERY tier (the W60 signature); reject + SLA breach cross for high tiers.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'registration_submitted' | 'documentation_review' | 'conformance_testing'
  | 'risk_controls_validation' | 'certification_review' | 'certified' | 'deployed'
  | 'recertification_review' | 'suspended' | 'remediation_required'
  | 'rejected' | 'decommissioned';

type AlgoTier = 'limited' | 'standard' | 'significant' | 'high_impact' | 'systemic';

type Party = 'trading_firm' | 'exchange_authority' | 'system';

interface AlgoCertRow {
  [key: string]: unknown;
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  firm_party_id: string;
  firm_party_name: string;
  authority_party_id: string;
  authority_party_name: string;
  system_code: string | null;
  system_name: string;
  system_type: string;
  strategy_class: string | null;
  asset_classes: string | null;
  venue: string | null;
  dea_provider: string | null;
  software_version: string | null;
  authorised_notional_zar_m: number;
  max_order_value_zar: number | null;
  max_message_rate_per_sec: number | null;
  algo_tier: AlgoTier;
  kill_switch_present: number;
  price_collars_present: number;
  throttles_present: number;
  max_order_size_present: number;
  conformance_test_passed: number;
  controls_validated: number;
  registration_ref: string | null;
  documentation_ref: string | null;
  conformance_ref: string | null;
  controls_ref: string | null;
  certification_ref: string | null;
  deployment_ref: string | null;
  recertification_ref: string | null;
  kill_switch_ref: string | null;
  remediation_ref: string | null;
  rejection_ref: string | null;
  decommission_ref: string | null;
  regulator_ref: string | null;
  documentation_basis: string | null;
  conformance_basis: string | null;
  controls_basis: string | null;
  certification_basis: string | null;
  recertification_basis: string | null;
  kill_switch_basis: string | null;
  remediation_basis: string | null;
  rejection_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  recertification_round: number;
  remediation_round: number;
  suspension_round: number;
  chain_status: ChainStatus;
  registration_submitted_at: string;
  documentation_review_at: string | null;
  conformance_testing_at: string | null;
  risk_controls_validation_at: string | null;
  certification_review_at: string | null;
  certified_at: string | null;
  deployed_at: string | null;
  recertification_review_at: string | null;
  suspended_at: string | null;
  remediation_required_at: string | null;
  rejected_at: string | null;
  decommissioned_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  is_reportable_tier?: boolean;
  breach_crosses_regulator?: boolean;
  sla_window_minutes?: number;
}

interface AlgoCertEvent {
  id: string;
  cert_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  registration_submitted:   { bg: '#e3e7ec', fg: '#445',    label: 'Registration submitted' },
  documentation_review:     { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Documentation review' },
  conformance_testing:      { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Conformance testing' },
  risk_controls_validation: { bg: '#fff4d6', fg: '#a06200', label: 'Risk-controls validation' },
  certification_review:     { bg: '#fff4d6', fg: '#a06200', label: 'Certification review' },
  certified:                { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Certified' },
  deployed:                 { bg: '#1f5b3a', fg: '#fff',    label: 'Deployed (live)' },
  recertification_review:   { bg: '#dbe3fb', fg: '#2a3a8a', label: 'Recertification review' },
  suspended:                { bg: '#7a0e0e', fg: '#fff',    label: 'Suspended (kill-switch)' },
  remediation_required:     { bg: '#fbe7d0', fg: '#7a4500', label: 'Remediation required' },
  rejected:                 { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Rejected' },
  decommissioned:           { bg: '#d8dde6', fg: '#445',    label: 'Decommissioned' },
};

const TIER_TONE: Record<AlgoTier, { bg: string; fg: string; label: string }> = {
  limited:     { bg: '#e3e7ec', fg: '#557',    label: 'Limited' },
  standard:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Standard' },
  significant: { bg: '#fff4d6', fg: '#a06200', label: 'Significant' },
  high_impact: { bg: '#fde0e0', fg: '#9b1f1f', label: 'High impact' },
  systemic:    { bg: '#7a0e0e', fg: '#fff',    label: 'Systemic' },
};

const PARTY_TONE: Record<Party, { bg: string; fg: string }> = {
  trading_firm:      { bg: '#fbe7d0', fg: '#7a4500' },
  exchange_authority:{ bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)' },
  system:            { bg: '#eef1f5', fg: '#445' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                   label: 'Active' },
  { key: 'all',                      label: 'All' },
  { key: 'reportable',               label: 'Reportable' },
  { key: 'breached',                 label: 'SLA breached' },
  { key: 'limited',                  label: 'Limited' },
  { key: 'standard',                 label: 'Standard' },
  { key: 'significant',              label: 'Significant' },
  { key: 'high_impact',              label: 'High impact' },
  { key: 'systemic',                 label: 'Systemic' },
  { key: 'registration_submitted',   label: 'Registered' },
  { key: 'documentation_review',     label: 'Docs' },
  { key: 'conformance_testing',      label: 'Conformance' },
  { key: 'risk_controls_validation', label: 'Controls' },
  { key: 'certification_review',     label: 'Cert review' },
  { key: 'certified',                label: 'Certified' },
  { key: 'deployed',                 label: 'Deployed' },
  { key: 'recertification_review',   label: 'Recert' },
  { key: 'suspended',                label: 'Suspended' },
  { key: 'remediation_required',     label: 'Remediation' },
  { key: 'rejected',                 label: 'Rejected' },
  { key: 'decommissioned',           label: 'Decommissioned' },
];

type ActionKind =
  | 'begin-review' | 'start-conformance' | 'validate-controls' | 'submit-certification'
  | 'grant-certification' | 'deploy' | 'trigger-recertification' | 'complete-recertification'
  | 'invoke-kill-switch' | 'reinstate' | 'require-remediation' | 'resubmit'
  | 'reject-certification' | 'decommission';

// Primary forward-path action surfaced per resting state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  registration_submitted:   'begin-review',
  documentation_review:     'start-conformance',
  conformance_testing:      'validate-controls',
  risk_controls_validation: 'submit-certification',
  certification_review:     'grant-certification',
  certified:                'deploy',
  deployed:                 'trigger-recertification',
  recertification_review:   'complete-recertification',
  suspended:                'reinstate',
  remediation_required:     'resubmit',
  rejected:                 null,
  decommissioned:           null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'begin-review':            'Begin documentation review (Authority)',
  'start-conformance':       'Start conformance testing (Authority)',
  'validate-controls':       'Validate pre-trade controls (Authority)',
  'submit-certification':    'Submit for certification (Firm)',
  'grant-certification':     'Grant certification (Authority)',
  'deploy':                  'Deploy live (Firm)',
  'trigger-recertification': 'Trigger recertification (Authority)',
  'complete-recertification':'Complete recertification (Authority)',
  'invoke-kill-switch':      'Invoke KILL-SWITCH (Firm)',
  'reinstate':               'Reinstate (Authority)',
  'require-remediation':     'Require remediation (Authority)',
  'resubmit':                'Resubmit (Firm)',
  'reject-certification':    'Reject certification (Authority)',
  'decommission':            'Decommission (Firm)',
};

// Branch / secondary actions available alongside the primary forward action.
const REMEDIABLE: ChainStatus[] = ['documentation_review', 'conformance_testing', 'risk_controls_validation', 'certification_review', 'recertification_review'];
const REJECTABLE: ChainStatus[] = ['documentation_review', 'certification_review', 'recertification_review'];
const KILLABLE: ChainStatus[] = ['deployed'];
const DECOMMISSIONABLE: ChainStatus[] = ['certified', 'deployed', 'suspended', 'remediation_required'];

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

// authorised_notional_zar_m is stored in millions of ZAR.
function fmtZarM(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1000) return `R${(n / 1000).toFixed(2)}bn`;
  return `R${n.toFixed(1)}m`;
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1000) return `R${(n / 1000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

interface KpiSummary {
  total: number;
  open_count: number;
  certified_count: number;
  deployed_count: number;
  suspended_count: number;
  in_review: number;
  breached: number;
  reportable_total: number;
  high_tier_open: number;
  total_authorised_notional_zar_m: number;
  deployed_notional_zar_m: number;
}

export function AlgoCertChainTab() {
  const [rows, setRows] = useState<AlgoCertRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<AlgoCertRow | null>(null);
  const [events, setEvents] = useState<AlgoCertEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: AlgoCertRow[] } & KpiSummary }>('/algo-cert/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          open_count: data.open_count || 0,
          certified_count: data.certified_count || 0,
          deployed_count: data.deployed_count || 0,
          suspended_count: data.suspended_count || 0,
          in_review: data.in_review || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          high_tier_open: data.high_tier_open || 0,
          total_authorised_notional_zar_m: data.total_authorised_notional_zar_m || 0,
          deployed_notional_zar_m: data.deployed_notional_zar_m || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load algo-certification chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: AlgoCertRow; events: AlgoCertEvent[] } }>(`/algo-cert/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load system history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'reportable') return r.is_reportable_tier;
      if (filter === 'breached')   return r.sla_breached;
      if (['limited', 'standard', 'significant', 'high_impact', 'systemic'].includes(filter)) {
        return r.algo_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, open_count: 0, certified_count: 0, deployed_count: 0,
    suspended_count: 0, in_review: 0, breached: 0, reportable_total: 0,
    high_tier_open: 0, total_authorised_notional_zar_m: 0, deployed_notional_zar_m: 0,
  };

  const act = useCallback(async (action: ActionKind, row: AlgoCertRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'begin-review') {
        const basis = window.prompt('Documentation review basis (governance and testing evidence assessed):', row.documentation_basis ?? '');
        if (basis) body.documentation_basis = basis;
        const ref = window.prompt('Documentation reference (optional):', row.documentation_ref ?? '');
        if (ref) body.documentation_ref = ref;
      } else if (action === 'start-conformance') {
        const basis = window.prompt('Conformance basis (exchange conformance test scope):', row.conformance_basis ?? '');
        if (basis) body.conformance_basis = basis;
        const ref = window.prompt('Conformance reference (optional):', row.conformance_ref ?? '');
        if (ref) body.conformance_ref = ref;
      } else if (action === 'validate-controls') {
        const basis = window.prompt('Controls basis (kill-switch, price collars, throttles, max order size validated):', row.controls_basis ?? '');
        if (basis) body.controls_basis = basis;
        const ref = window.prompt('Controls reference (optional):', row.controls_ref ?? '');
        if (ref) body.controls_ref = ref;
      } else if (action === 'submit-certification') {
        const basis = window.prompt('Certification submission basis (controls evidence and conformance report tabled):', row.certification_basis ?? '');
        if (basis) body.certification_basis = basis;
        const ref = window.prompt('Certification reference (optional):', row.certification_ref ?? '');
        if (ref) body.certification_ref = ref;
      } else if (action === 'grant-certification') {
        const basis = window.prompt('Certification grant basis (committee determination):', row.certification_basis ?? '');
        if (basis) body.certification_basis = basis;
        const ref = window.prompt('Certification reference (optional):', row.certification_ref ?? '');
        if (ref) body.certification_ref = ref;
      } else if (action === 'deploy') {
        const ref = window.prompt('Deployment reference (go-live record):', row.deployment_ref ?? '');
        if (ref) body.deployment_ref = ref;
      } else if (action === 'trigger-recertification') {
        const basis = window.prompt('Recertification basis (periodic / material-change trigger):', row.recertification_basis ?? '');
        if (basis) body.recertification_basis = basis;
        body.reason_code = 'periodic_recertification';
        const ref = window.prompt('Recertification reference (optional):', row.recertification_ref ?? '');
        if (ref) body.recertification_ref = ref;
      } else if (action === 'complete-recertification') {
        const basis = window.prompt('Recertification completion basis (re-validation outcome):', row.recertification_basis ?? '');
        if (basis) body.recertification_basis = basis;
      } else if (action === 'invoke-kill-switch') {
        const basis = window.prompt('Kill-switch basis — the emergency-halt grounds. This crosses to the exchange supervisor for EVERY tier:', row.kill_switch_basis ?? '');
        if (!basis) return;
        body.kill_switch_basis = basis;
        body.reason_code = 'kill_switch_invoked';
        const ref = window.prompt('Kill-switch reference (incident ID):', row.kill_switch_ref ?? '');
        if (ref) body.kill_switch_ref = ref;
      } else if (action === 'reinstate') {
        const reason = window.prompt('Reinstatement reason (root-cause resolved, controls re-verified):', '');
        if (reason) body.reason_code = reason;
      } else if (action === 'require-remediation') {
        const basis = window.prompt('Remediation basis — the defects the firm must fix:', row.remediation_basis ?? '');
        if (!basis) return;
        body.remediation_basis = basis;
        body.reason_code = 'remediation_required';
        const ref = window.prompt('Remediation reference (optional):', row.remediation_ref ?? '');
        if (ref) body.remediation_ref = ref;
      } else if (action === 'resubmit') {
        const basis = window.prompt('Resubmission basis (how the defects were remediated):', row.documentation_basis ?? '');
        if (basis) body.documentation_basis = basis;
        const ref = window.prompt('Documentation reference (optional):', row.documentation_ref ?? '');
        if (ref) body.documentation_ref = ref;
      } else if (action === 'reject-certification') {
        const basis = window.prompt('Rejection basis — the refusal grounds (required for audit):', row.rejection_basis ?? '');
        if (!basis) return;
        body.rejection_basis = basis;
        body.reason_code = 'certification_refused';
        const ref = window.prompt('Rejection reference (optional):', row.rejection_ref ?? '');
        if (ref) body.rejection_ref = ref;
        const reg = window.prompt('Regulator reference (optional):', row.regulator_ref ?? '');
        if (reg) body.regulator_ref = reg;
      } else if (action === 'decommission') {
        const reason = window.prompt('Decommission reason (system retired / withdrawn — required for audit):', row.reason_code ?? '');
        if (!reason) return;
        body.reason_code = reason;
        const ref = window.prompt('Decommission reference (optional):', row.decommission_ref ?? '');
        if (ref) body.decommission_ref = ref;
      }
      await api.post(`/algo-cert/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Algorithmic / DEA Trading-System Certification &amp; Kill-Switch — FMA 2012 + FSCA + RTS 6</h2>
          <p className="text-xs text-[#4a5568]">
            12-state pre-deployment governance gate for every automated / DEA trading system: registration submitted →
            documentation review → conformance testing → risk-controls validation → certification review → certified →
            deployed, with periodic recertification, an emergency kill-switch / suspension path on any live system, and
            remediation / reject / decommission branches. Two-party split write: the trading firm owns submit /
            deploy / resubmit / decommission and may always hit the kill-switch; the exchange authority drives the
            gating. INVERTED SLA: a larger authorised footprint gets a longer window. A kill-switch invocation crosses
            to the supervisor for EVERY tier; a refused certification or SLA breach crosses for high-impact + systemic.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"          value={kpis.total} />
        <Kpi label="Open"           value={kpis.open_count}  tone={kpis.open_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="In review"      value={kpis.in_review}   tone={kpis.in_review > 0 ? 'warn' : 'ok'} />
        <Kpi label="Certified"      value={kpis.certified_count} tone="ok" />
        <Kpi label="Deployed"       value={kpis.deployed_count}  tone="ok" />
        <Kpi label="Suspended"      value={kpis.suspended_count} tone={kpis.suspended_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"   value={kpis.breached}    tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="High-tier open" value={kpis.high_tier_open} tone={kpis.high_tier_open > 0 ? 'warn' : 'ok'} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Authorised notional: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{fmtZarM(kpis.total_authorised_notional_zar_m)}</span></span>
        <span>Deployed notional: <span className="font-semibold text-[#1f5b3a]">{fmtZarM(kpis.deployed_notional_zar_m)}</span></span>
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Case #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>System</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Firm</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Auth notional</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.algo_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      {r.case_number}
                      {r.is_reportable_tier && <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span>}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      <div className="text-[11px] font-medium">{r.system_name}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.system_type} · {r.strategy_class ?? '—'} · {r.asset_classes ?? '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.firm_party_name}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{fmtZarM(r.authorised_notional_zar_m)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No systems match.</td></tr>
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
  row: AlgoCertRow;
  events: AlgoCertEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: AlgoCertRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canRemediate = REMEDIABLE.includes(row.chain_status);
  const canReject = REJECTABLE.includes(row.chain_status);
  const canKill = KILLABLE.includes(row.chain_status);
  const canDecommission = DECOMMISSIONABLE.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.case_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.system_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.algo_tier].label} · {row.system_type} · {row.strategy_class ?? '—'} · {fmtZarM(row.authorised_notional_zar_m)}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Trading firm"      value={row.firm_party_name} />
            <Pair label="Exchange authority" value={row.authority_party_name} />
            <Pair label="System code"       value={row.system_code ?? '—'} />
            <Pair label="System type"       value={row.system_type} />
            <Pair label="Strategy class"    value={row.strategy_class ?? '—'} />
            <Pair label="Asset classes"     value={row.asset_classes ?? '—'} />
            <Pair label="Venue"             value={row.venue ?? '—'} />
            <Pair label="DEA provider"      value={row.dea_provider ?? '—'} />
            <Pair label="Software version"  value={row.software_version ?? '—'} />
            <Pair label="Tier"              value={TIER_TONE[row.algo_tier].label} />
            <Pair label="Authorised notional" value={fmtZarM(row.authorised_notional_zar_m)} />
            <Pair label="Max order value"   value={fmtZar(row.max_order_value_zar)} />
            <Pair label="Max message rate"  value={row.max_message_rate_per_sec != null ? `${row.max_message_rate_per_sec}/s` : '—'} />
            <Pair label="Kill-switch"       value={row.kill_switch_present ? 'Present' : 'Absent'} />
            <Pair label="Price collars"     value={row.price_collars_present ? 'Present' : 'Absent'} />
            <Pair label="Throttles"         value={row.throttles_present ? 'Present' : 'Absent'} />
            <Pair label="Max order size"    value={row.max_order_size_present ? 'Present' : 'Absent'} />
            <Pair label="Conformance"       value={row.conformance_test_passed ? 'Passed' : 'Pending'} />
            <Pair label="Controls"          value={row.controls_validated ? 'Validated' : 'Pending'} />
            <Pair label="Documentation ref" value={row.documentation_ref ?? '—'} />
            <Pair label="Conformance ref"   value={row.conformance_ref ?? '—'} />
            <Pair label="Controls ref"      value={row.controls_ref ?? '—'} />
            <Pair label="Certification ref" value={row.certification_ref ?? '—'} />
            <Pair label="Deployment ref"    value={row.deployment_ref ?? '—'} />
            <Pair label="Kill-switch ref"   value={row.kill_switch_ref ?? '—'} />
            <Pair label="Regulator ref"     value={row.regulator_ref ?? '—'} />
            <Pair label="Recert round"      value={String(row.recertification_round)} />
            <Pair label="Remediation round" value={String(row.remediation_round)} />
            <Pair label="Suspension round"  value={String(row.suspension_round)} />
            <Pair label="Reportable"        value={row.is_reportable_tier ? 'Yes (regulator)' : 'No'} />
            <Pair label="State"             value={STATE_TONE[row.chain_status].label} />
            <Pair label="Escalation"        value={String(row.escalation_level)} />
            <Pair label="SLA window"        value={fmtMinutes(row.sla_window_minutes)} />
            <Pair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"        value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Registered"        value={fmtDate(row.registration_submitted_at)} />
            <Pair label="Reason code"       value={row.reason_code ?? '—'} />
            {row.source_wave && <Pair label="Provenance" value={`${row.source_wave} · ${row.source_entity_id ?? ''}`} />}
          </div>
          {row.documentation_basis && (
            <div className="mt-3 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Documentation basis</div>
              {row.documentation_basis}
            </div>
          )}
          {row.conformance_basis && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Conformance basis</div>
              {row.conformance_basis}
            </div>
          )}
          {row.controls_basis && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Controls basis</div>
              {row.controls_basis}
            </div>
          )}
          {row.certification_basis && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Certification basis</div>
              {row.certification_basis}
            </div>
          )}
          {row.recertification_basis && (
            <div className="mt-2 rounded border border-[#dbe3fb] bg-[#f5f7ff] px-3 py-2 text-[12px] text-[#2a3a8a]">
              <div className="text-[10px] uppercase tracking-wider text-[#3a4a9a] mb-1">Recertification basis</div>
              {row.recertification_basis}
            </div>
          )}
          {row.kill_switch_basis && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              <div className="text-[10px] uppercase tracking-wider text-red-700 mb-1">Kill-switch basis</div>
              {row.kill_switch_basis}
            </div>
          )}
          {row.remediation_basis && (
            <div className="mt-2 rounded border border-[#fbe7d0] bg-[#fffaf0] px-3 py-2 text-[12px] text-[#7a4500]">
              <div className="text-[10px] uppercase tracking-wider text-[#a06200] mb-1">Remediation basis</div>
              {row.remediation_basis}
            </div>
          )}
          {row.rejection_basis && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              <div className="text-[10px] uppercase tracking-wider text-red-700 mb-1">Rejection basis</div>
              {row.rejection_basis}
            </div>
          )}
          {row.notes && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Notes</div>
              {row.notes}
            </div>
          )}
        </section>

        {(nextAction || canRemediate || canReject || canKill || canDecommission) && (
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
              {canKill && (
                <button type="button"
                  onClick={() => onAct('invoke-kill-switch', row)}
                  className="rounded bg-[#7a0e0e] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#9b1f1f]"
                >
                  {ACTION_LABEL['invoke-kill-switch']}
                </button>
              )}
              {canRemediate && (
                <button type="button"
                  onClick={() => onAct('require-remediation', row)}
                  className="rounded border border-[#e0b070] bg-white px-3 py-1.5 text-[12px] font-medium text-[#8a4a00] hover:bg-[#fffaf0]"
                >
                  {ACTION_LABEL['require-remediation']}
                </button>
              )}
              {canReject && (
                <button type="button"
                  onClick={() => onAct('reject-certification', row)}
                  className="rounded border border-[#e09b9b] bg-white px-3 py-1.5 text-[12px] font-medium text-[#9b1f1f] hover:bg-[#fdf0f0]"
                >
                  {ACTION_LABEL['reject-certification']}
                </button>
              )}
              {canDecommission && (
                <button type="button"
                  onClick={() => onAct('decommission', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['decommission']}
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
              {events.map((e) => {
                const party = (e.actor_party as Party) || 'system';
                const pt = PARTY_TONE[party] ?? PARTY_TONE.system;
                return (
                  <li key={e.id} className="rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#0c2a4d]">{e.event_type}</span>
                      <span className="text-[#4a5568] tabular-nums">{fmtDate(e.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {(e.from_status || e.to_status) && (
                        <span className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</span>
                      )}
                      {e.actor_party && (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: pt.bg, color: pt.fg }}>{e.actor_party}</span>
                      )}
                    </div>
                    {e.notes && <div className="mt-1" style={{ color: 'oklch(0.46 0.16 55)' }}>{e.notes}</div>}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
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

export default AlgoCertChainTab;
