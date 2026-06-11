// Wave 80 — OEM-Support Service-Contract / AMC Renewal, Entitlement & Coverage tab.
//
// The COMMERCIAL GATE of the OEM-Support profile: the contract that decides
// whether a deployed asset gets manufacturer support at all, at what response-
// time SLA entitlement, and within what entitlement limits. Every other support
// chain runs UNDER a service contract — a ticket (W14) is answered to its
// response SLA, an RMA (W15) draws on its parts allowance, a spare (W72) is
// provisioned against its coverage — but none manage the contract itself; this
// is that layer.
//
// DISTINCTIVE move (beat ServiceMax / SAP Service Cloud / Salesforce Field
// Service entitlements / IFS): the entitlement is LIVE-WIRED as a real coverage
// gate, the renewal urgency is COVERAGE-GAP-aware (mission-critical chased
// fastest), and a lapse on important coverage crosses to the regulator as a
// security-of-supply concern. URGENT SLA — a higher coverage tier gets a TIGHTER
// renewal window at every step. Reportable to the regulator inbox is COVERAGE-
// GAP-driven: expiring HIGH-tier coverage crosses; suspending / cancelling
// mission-critical coverage crosses; an SLA breach crosses for the HIGH tiers.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { type FieldSpec } from '../launch/WorkstationShell';

type ChainStatus =
  | 'draft' | 'quoted' | 'pending_activation' | 'active' | 'renewal_due'
  | 'renewal_quoted' | 'negotiating' | 'in_grace' | 'suspended' | 'renewed'
  | 'expired' | 'cancelled';

type Tier = 'basic' | 'standard' | 'premium' | 'mission_critical';

interface ContractRow {
  [key: string]: unknown;
  id: string;
  contract_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  customer_party_id: string | null;
  customer_name: string;
  oem_name: string | null;
  site_id: string | null;
  site_name: string | null;
  product_line: string | null;
  contract_type: string | null;
  coverage_tier: Tier;
  covered_fault_classes: string | null;
  covered_assets: string | null;
  response_sla_minutes: number | null;
  preventive_visits_included: number | null;
  preventive_visits_consumed: number;
  parts_allowance_zar: number | null;
  parts_consumed_zar: number;
  currency: string | null;
  annual_value_zar: number;
  term_days: number | null;
  term_start: string | null;
  term_end: string | null;
  renewal_window_days: number;
  renewal_uplift_pct: number | null;
  renewal_value_zar: number | null;
  refund_zar: number | null;
  account_manager_name: string | null;
  service_desk_name: string | null;
  finance_contact_name: string | null;
  reason_code: string | null;
  suspend_reason: string | null;
  quote_ref: string | null;
  acceptance_ref: string | null;
  activation_ref: string | null;
  renewal_ref: string | null;
  renewal_quote_ref: string | null;
  negotiation_ref: string | null;
  grace_ref: string | null;
  suspension_ref: string | null;
  reinstatement_ref: string | null;
  expiry_ref: string | null;
  cancellation_ref: string | null;
  regulator_ref: string | null;
  quote_basis: string | null;
  acceptance_basis: string | null;
  activation_basis: string | null;
  renewal_basis: string | null;
  renewal_quote_basis: string | null;
  negotiation_basis: string | null;
  grace_basis: string | null;
  suspension_basis: string | null;
  reinstatement_basis: string | null;
  expiry_basis: string | null;
  cancellation_basis: string | null;
  notes: string | null;
  chain_status: ChainStatus;
  draft_at: string;
  quoted_at: string | null;
  pending_activation_at: string | null;
  active_at: string | null;
  renewal_due_at: string | null;
  renewal_quoted_at: string | null;
  negotiating_at: string | null;
  in_grace_at: string | null;
  suspended_at: string | null;
  renewed_at: string | null;
  expired_at: string | null;
  cancelled_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  coverage_gap?: boolean;
  breach_crosses_regulator?: boolean;
}

interface ContractEvent {
  id: string;
  contract_id: string;
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
  active_count: number;
  renewal_pipeline: number;
  in_grace_count: number;
  suspended_count: number;
  renewed_count: number;
  expired_count: number;
  cancelled_count: number;
  coverage_gap_count: number;
  breached: number;
  reportable_total: number;
  total_annual_value_zar: number;
  total_renewal_value_zar: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  draft:              { bg: '#e3e7ec', fg: '#557',    label: 'Draft' },
  quoted:             { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Quoted' },
  pending_activation: { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Pending activation' },
  active:             { bg: '#d4edda', fg: '#155724', label: 'Active' },
  renewal_due:        { bg: '#fff4d6', fg: '#a06200', label: 'Renewal due' },
  renewal_quoted:     { bg: '#fff4d6', fg: '#a06200', label: 'Renewal quoted' },
  negotiating:        { bg: '#ffe9d6', fg: '#8a4a00', label: 'Negotiating' },
  in_grace:           { bg: '#ffe4b5', fg: '#8a4a00', label: 'In grace' },
  suspended:          { bg: '#fde0e0', fg: '#9b1f1f', label: 'Suspended' },
  renewed:            { bg: '#daf5e2', fg: '#1f6b3a', label: 'Renewed' },
  expired:            { bg: '#fde0e0', fg: '#9b1f1f', label: 'Expired (gap)' },
  cancelled:          { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  mission_critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Mission-critical' },
  premium:          { bg: '#ffe4b5', fg: '#8a4a00', label: 'Premium' },
  standard:         { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Standard' },
  basic:            { bg: '#e3e7ec', fg: '#557',    label: 'Basic' },
};

// Customer-facing response-time SLA entitlement owed per coverage tier (minutes).
const ENTITLEMENT_SLA: Record<Tier, number> = {
  mission_critical: 240, premium: 480, standard: 1440, basic: 4320,
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',           label: 'In force' },
  { key: 'all',              label: 'All' },
  { key: 'mission_critical', label: 'Mission-critical' },
  { key: 'premium',          label: 'Premium' },
  { key: 'standard',         label: 'Standard' },
  { key: 'basic',            label: 'Basic' },
  { key: 'renewal',          label: 'Renewal pipeline' },
  { key: 'in_grace',         label: 'In grace' },
  { key: 'suspended',        label: 'Suspended' },
  { key: 'coverage_gap',     label: 'Coverage gap' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'reportable',       label: 'Reportable' },
  { key: 'renewed',          label: 'Renewed' },
  { key: 'expired',          label: 'Expired' },
  { key: 'cancelled',        label: 'Cancelled' },
];

type ActionKind =
  | 'issue-quote' | 'accept-quote' | 'activate-coverage' | 'open-renewal'
  | 'issue-renewal-quote' | 'begin-negotiation' | 'confirm-renewal' | 'enter-grace'
  | 'suspend-coverage' | 'reinstate-coverage' | 'expire-coverage' | 'cancel-contract';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  draft:              'issue-quote',
  quoted:             'accept-quote',
  pending_activation: 'activate-coverage',
  active:             'open-renewal',
  renewal_due:        'issue-renewal-quote',
  renewal_quoted:     'begin-negotiation',
  negotiating:        'confirm-renewal',
  in_grace:           'confirm-renewal',
  suspended:          'reinstate-coverage',
  renewed:            null,
  expired:            null,
  cancelled:          null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'issue-quote':         'Issue quote (account mgr)',
  'accept-quote':        'Accept quote (account mgr)',
  'activate-coverage':   'Activate coverage (service desk)',
  'open-renewal':        'Open renewal (service desk)',
  'issue-renewal-quote': 'Issue renewal quote (account mgr)',
  'begin-negotiation':   'Begin negotiation (account mgr)',
  'confirm-renewal':     'Confirm renewal (account mgr)',
  'enter-grace':         'Enter grace (service desk)',
  'suspend-coverage':    'Suspend coverage (finance)',
  'reinstate-coverage':  'Reinstate coverage (finance)',
  'expire-coverage':     'Expire coverage (service desk)',
  'cancel-contract':     'Cancel contract (account mgr)',
};

// Secondary actions offered alongside the primary forward action, per state.
const SECONDARY_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  draft:              ['cancel-contract'],
  quoted:             ['cancel-contract'],
  pending_activation: ['cancel-contract'],
  active:             ['suspend-coverage', 'cancel-contract'],
  renewal_due:        ['confirm-renewal', 'enter-grace', 'cancel-contract'],
  renewal_quoted:     ['confirm-renewal', 'enter-grace', 'cancel-contract'],
  negotiating:        ['enter-grace', 'cancel-contract'],
  in_grace:           ['expire-coverage'],
  suspended:          ['expire-coverage', 'cancel-contract'],
  renewed:            [],
  expired:            [],
  cancelled:          [],
};

const DESTRUCTIVE: ActionKind[] = ['suspend-coverage', 'expire-coverage', 'cancel-contract', 'enter-grace'];

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

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtDay(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-ZA', { dateStyle: 'medium' });
}

function fmtList(json: string | null): string {
  if (!json) return '—';
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return arr.length ? arr.join(', ') : '—';
  } catch { /* fall through */ }
  return json;
}

const TERMINAL_STATES: ChainStatus[] = ['renewed', 'expired', 'cancelled'];

const ACTION_FIELDS: Record<ActionKind, FieldSpec[]> = {
  'issue-quote': [
    { key: 'annual_value_zar', label: 'Annual contract value (ZAR)', type: 'text', required: false },
    { key: 'quote_ref',        label: 'Quote reference',              type: 'text', required: false },
    { key: 'quote_basis',      label: 'Quote basis — coverage scope + pricing rationale', type: 'textarea', required: true },
  ],
  'accept-quote': [
    { key: 'acceptance_ref',   label: 'Acceptance reference (customer PO)', type: 'text',     required: false },
    { key: 'acceptance_basis', label: 'Acceptance basis — customer sign-off', type: 'textarea', required: true },
  ],
  'activate-coverage': [
    { key: 'term_start',        label: 'Term start (YYYY-MM-DD)',  type: 'text',     required: false },
    { key: 'term_end',          label: 'Term end (YYYY-MM-DD)',    type: 'text',     required: false },
    { key: 'activation_ref',    label: 'Activation reference',     type: 'text',     required: false },
    { key: 'activation_basis',  label: 'Activation basis — coverage live, entitlements opened', type: 'textarea', required: true },
  ],
  'open-renewal': [
    { key: 'renewal_ref',   label: 'Renewal reference',  type: 'text',     required: false },
    { key: 'renewal_basis', label: 'Renewal basis — renewal window opened ahead of term end', type: 'textarea', required: true },
  ],
  'issue-renewal-quote': [
    { key: 'renewal_value_zar',   label: 'Renewal annual value (ZAR)',        type: 'text',     required: false },
    { key: 'renewal_uplift_pct',  label: 'Renewal uplift (%) — e.g. CPI escalation', type: 'text', required: false },
    { key: 'renewal_quote_ref',   label: 'Renewal quote reference',           type: 'text',     required: false },
    { key: 'renewal_quote_basis', label: 'Renewal quote basis — pricing + escalation rationale', type: 'textarea', required: true },
  ],
  'begin-negotiation': [
    { key: 'negotiation_ref',   label: 'Negotiation reference',  type: 'text',     required: false },
    { key: 'negotiation_basis', label: 'Negotiation basis — customer counter / scope discussion', type: 'textarea', required: true },
  ],
  'confirm-renewal': [
    { key: 'renewal_value_zar', label: 'Confirmed renewal annual value (ZAR)', type: 'text',     required: false },
    { key: 'term_start',        label: 'New term start (YYYY-MM-DD)',          type: 'text',     required: false },
    { key: 'term_end',          label: 'New term end (YYYY-MM-DD)',            type: 'text',     required: false },
    { key: 'renewal_ref',       label: 'Renewal reference',                   type: 'text',     required: false },
    { key: 'renewal_basis',     label: 'Renewal basis — contract renewed, coverage continuous', type: 'textarea', required: true },
  ],
  'enter-grace': [
    { key: 'grace_ref',   label: 'Grace reference',  type: 'text',     required: false },
    { key: 'grace_basis', label: 'Grace basis — term ended mid-renewal; conditional grace coverage runs', type: 'textarea', required: true },
  ],
  'suspend-coverage': [
    { key: 'suspend_reason',    label: 'Suspend reason — non-payment / breach', type: 'text',     required: true },
    { key: 'suspension_ref',    label: 'Suspension reference',                  type: 'text',     required: false },
    { key: 'suspension_basis',  label: 'Suspension basis — coverage suspended, support gated', type: 'textarea', required: true },
  ],
  'reinstate-coverage': [
    { key: 'reinstatement_ref',   label: 'Reinstatement reference',  type: 'text',     required: false },
    { key: 'reinstatement_basis', label: 'Reinstatement basis — arrears cleared / breach cured, coverage restored', type: 'textarea', required: true },
  ],
  'expire-coverage': [
    { key: 'expiry_basis',   label: 'Expiry basis — grace blown / coverage terminated; a HIGH-tier gap is reportable', type: 'textarea', required: true },
    { key: 'regulator_ref',  label: 'Regulator reference (coverage gap on premium / mission-critical is reportable)', type: 'text',     required: false },
  ],
  'cancel-contract': [
    { key: 'cancellation_basis', label: 'Cancellation basis — why the contract is terminated', type: 'textarea', required: true },
    { key: 'refund_zar',         label: 'Pro-rated refund (ZAR), if any',                     type: 'text',     required: false },
    { key: 'regulator_ref',      label: 'Regulator reference (cancelling mission-critical coverage is reportable)', type: 'text', required: false },
  ],
};

export function ServiceContractChainTab() {
  const [rows, setRows] = useState<ContractRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<ContractRow | null>(null);
  const [events, setEvents] = useState<ContractEvent[]>([]);
  const [pendingAction, setPendingAction] = useState<{ action: ActionKind; row: ContractRow } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ContractRow[] } & KpiSummary }>('/service-contract/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, active_count: d.active_count,
          renewal_pipeline: d.renewal_pipeline, in_grace_count: d.in_grace_count,
          suspended_count: d.suspended_count, renewed_count: d.renewed_count,
          expired_count: d.expired_count, cancelled_count: d.cancelled_count,
          coverage_gap_count: d.coverage_gap_count, breached: d.breached,
          reportable_total: d.reportable_total,
          total_annual_value_zar: d.total_annual_value_zar,
          total_renewal_value_zar: d.total_renewal_value_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load service contracts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: ContractRow; events: ContractEvent[] } }>(
        `/service-contract/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load contract history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')          return true;
      if (filter === 'active')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')     return r.sla_breached;
      if (filter === 'reportable')   return r.is_reportable_flag;
      if (filter === 'coverage_gap') return r.coverage_gap;
      if (filter === 'renewal') {
        return r.chain_status === 'renewal_due' || r.chain_status === 'renewal_quoted' || r.chain_status === 'negotiating';
      }
      if (['basic', 'standard', 'premium', 'mission_critical'].includes(filter)) {
        return r.coverage_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const openAction = useCallback((action: ActionKind, row: ContractRow) => {
    setPendingAction({ action, row });
  }, []);

  const submitAction = useCallback(async (values: Record<string, string>) => {
    if (!pendingAction) return;
    const { action, row } = pendingAction;
    setPendingAction(null);
    try {
      const body: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(values)) {
        if (!v) continue;
        const numericKeys = ['annual_value_zar', 'renewal_value_zar', 'renewal_uplift_pct', 'refund_zar'];
        if (numericKeys.includes(k) && !Number.isNaN(Number(v))) {
          body[k] = Number(v);
        } else {
          body[k] = v;
        }
      }
      if (action === 'suspend-coverage') body.reason_code = 'non_payment';
      if (action === 'expire-coverage')  body.reason_code = 'lapsed';
      if (action === 'cancel-contract')  body.reason_code = 'cancelled';
      await api.post(`/service-contract/chain/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${pendingAction?.action ?? 'act'}`);
    }
  }, [pendingAction, load, loadEvents, selected]);

  return (
    <div className="p-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Service contracts &amp; AMC renewal · entitlement &amp; coverage</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage commercial-coverage chain · draft → quoted → pending activation → active → renewal due →
            renewal quoted → negotiating → renewed, with a conditional-grace buffer (in grace → expired) and a
            suspension cycle (active → suspended → reinstated / expired / cancelled). The COMMERCIAL GATE under every
            other OEM-support chain — a ticket (W14) is answered to this contract&apos;s response-SLA entitlement, an RMA
            (W15) draws on its parts allowance, a spare (W72) is provisioned against its coverage — but none manage the
            contract itself; this is that layer. The DIFFERENTIATOR over ServiceMax / SAP Service Cloud / Salesforce
            Field Service entitlements / IFS: the entitlement is LIVE-WIRED as a real coverage gate, the renewal urgency
            is COVERAGE-GAP-aware (mission-critical chased fastest), and a lapse on important coverage crosses to the
            regulator as a security-of-supply concern. URGENT SLA — a higher coverage tier gets a TIGHTER renewal window
            at every step. Reportable to the regulator inbox is COVERAGE-GAP-driven: expiring HIGH-tier coverage crosses;
            suspending / cancelling mission-critical coverage crosses; an SLA breach crosses for the HIGH tiers.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total contracts" value={kpis?.total ?? rows.length} />
        <Kpi label="In force" value={kpis?.active_count ?? 0} tone="ok" />
        <Kpi label="Renewal pipeline" value={kpis?.renewal_pipeline ?? 0} tone={(kpis?.renewal_pipeline ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="In grace" value={kpis?.in_grace_count ?? 0} tone={(kpis?.in_grace_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Suspended" value={kpis?.suspended_count ?? 0} tone={(kpis?.suspended_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Coverage gap" value={kpis?.coverage_gap_count ?? 0} tone={(kpis?.coverage_gap_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Renewed" value={kpis?.renewed_count ?? 0} tone="ok" />
        <Kpi label="Expired" value={kpis?.expired_count ?? 0} tone={(kpis?.expired_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Annual book" value={fmtZar(kpis?.total_annual_value_zar)} />
        <Kpi label="Renewal book" value={fmtZar(kpis?.total_renewal_value_zar)} tone="ok" />
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Contract #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Customer / site</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Coverage tier</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Type</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Annual value</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Term end</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.coverage_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      {r.contract_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[240px] truncate" title={`${r.customer_name} · ${r.site_name ?? ''} · ${r.oem_name ?? ''}`}>
                      {r.customer_name}
                      <span className="text-[#4a5568]"> · {r.site_name ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[#4a5568]">{r.contract_type ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#0c2a4d]">{fmtZar(r.annual_value_zar)}</td>
                    <td className="px-3 py-2 text-[11px] text-[#4a5568]">{fmtDay(r.term_end)}</td>
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
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[#4a5568]">No contracts match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={openAction} />
      )}
      {pendingAction && (
        <ActionModal
          action={pendingAction.action}
          fields={ACTION_FIELDS[pendingAction.action]}
          onSubmit={submitAction}
          onCancel={() => setPendingAction(null)}
        />
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

function ActionModal({
  action, fields, onSubmit, onCancel,
}: {
  action: ActionKind;
  fields: FieldSpec[];
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, '']))
  );
  const set = (k: string, v: string) => setVals((prev) => ({ ...prev, [k]: v }));
  const canSubmit = fields.filter((f) => f.required).every((f) => (vals[f.key] ?? '').trim());
  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-[13px] text-[#0c2a4d]">{ACTION_LABEL[action]}</span>
          <button type="button" onClick={onCancel} className="text-[#4a5568] hover:text-[#0c2a4d] text-lg leading-none">✕</button>
        </header>
        <div className="px-4 py-4 space-y-3">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-[11px] font-medium text-[#4a5568] mb-1">
                {f.label}{f.required && <span className="text-red-600 ml-0.5">*</span>}
              </label>
              {f.type === 'textarea' ? (
                <textarea
                  className="w-full rounded border border-[#d8dde6] px-2 py-1.5 text-[12px] text-[#0c2a4d] focus:outline-none focus:border-[#c2873a] resize-none"
                  rows={3}
                  value={vals[f.key] ?? ''}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              ) : (
                <input
                  type="text"
                  className="w-full rounded border border-[#d8dde6] px-2 py-1.5 text-[12px] text-[#0c2a4d] focus:outline-none focus:border-[#c2873a]"
                  value={vals[f.key] ?? ''}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
        <footer className="border-t border-[#d8dde6] px-4 py-3 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#557] hover:bg-[#f3f5f9]">Cancel</button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => onSubmit(vals)}
            className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#a06200] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirm
          </button>
        </footer>
      </div>
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct,
}: {
  row: ContractRow;
  events: ContractEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: ContractRow) => void;
}) {
  const primary = ACTION_FOR_STATE[row.chain_status];
  const secondary = SECONDARY_ACTIONS[row.chain_status];
  const entitlementSla = ENTITLEMENT_SLA[row.coverage_tier];
  const visitsRemaining = Math.max(0, (row.preventive_visits_included ?? 0) - (row.preventive_visits_consumed ?? 0));
  const partsRemaining = Math.max(0, (row.parts_allowance_zar ?? 0) - (row.parts_consumed_zar ?? 0));
  const coverageLive = ['active', 'renewal_due', 'renewal_quoted', 'negotiating', 'in_grace'].includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.contract_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.customer_name} · {row.oem_name ?? 'OEM'}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.coverage_tier].label}
                {row.contract_type ? ` · ${row.contract_type}` : ''}
                {row.product_line ? ` · ${row.product_line}` : ''}
                {row.site_name ? ` · ${row.site_name}` : ''}
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
          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Live entitlement &amp; coverage</div>
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <Pair label="Coverage" value={coverageLive ? 'LIVE' : (row.coverage_gap ? 'GAP — not covered' : 'Not in force')} />
              <Pair label="Response SLA entitlement" value={fmtMinutes(row.response_sla_minutes ?? entitlementSla)} />
              <Pair label="Preventive visits left" value={`${visitsRemaining} of ${row.preventive_visits_included ?? 0}`} />
              <Pair label="Parts allowance left" value={`${fmtZar(partsRemaining)} of ${fmtZar(row.parts_allowance_zar)}`} />
              <Pair label="Covered fault classes" value={fmtList(row.covered_fault_classes)} />
              <Pair label="Covered assets" value={fmtList(row.covered_assets)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"             value={STATE_TONE[row.chain_status].label} />
            <Pair label="Coverage tier"     value={TIER_TONE[row.coverage_tier].label} />
            <Pair label="Contract type"     value={row.contract_type ?? '—'} />
            <Pair label="Product line"      value={row.product_line ?? '—'} />
            <Pair label="Customer"          value={row.customer_name} />
            <Pair label="OEM"               value={row.oem_name ?? '—'} />
            <Pair label="Site"              value={row.site_name ?? '—'} />
            <Pair label="Annual value"      value={fmtZar(row.annual_value_zar)} />
            <Pair label="Renewal value"     value={fmtZar(row.renewal_value_zar)} />
            <Pair label="Renewal uplift"    value={row.renewal_uplift_pct != null ? `${row.renewal_uplift_pct}%` : '—'} />
            <Pair label="Refund"            value={fmtZar(row.refund_zar)} />
            <Pair label="Term"              value={`${fmtDay(row.term_start)} → ${fmtDay(row.term_end)}`} />
            <Pair label="Term days"         value={row.term_days != null ? String(row.term_days) : '—'} />
            <Pair label="Renewal window"    value={`${row.renewal_window_days}d`} />
            <Pair label="Account manager"   value={row.account_manager_name ?? '—'} />
            <Pair label="Service desk"      value={row.service_desk_name ?? '—'} />
            <Pair label="Finance contact"   value={row.finance_contact_name ?? '—'} />
            <Pair label="Suspend reason"    value={row.suspend_reason ?? '—'} />
            <Pair label="Reason code"       value={row.reason_code ?? '—'} />
            <Pair label="Regulator ref"     value={row.regulator_ref ?? '—'} />
            <Pair label="Drafted"           value={fmtDate(row.draft_at)} />
            <Pair label="Quoted"            value={fmtDate(row.quoted_at)} />
            <Pair label="Activated"         value={fmtDate(row.active_at)} />
            <Pair label="Renewal opened"    value={fmtDate(row.renewal_due_at)} />
            <Pair label="In grace"          value={fmtDate(row.in_grace_at)} />
            <Pair label="Suspended"         value={fmtDate(row.suspended_at)} />
            <Pair label="Renewed"           value={fmtDate(row.renewed_at)} />
            <Pair label="Expired"           value={fmtDate(row.expired_at)} />
            <Pair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"        value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"    value={String(row.escalation_level)} />
            <Pair label="Reportable"        value={row.is_reportable_flag ? 'Yes' : 'No'} />
          </div>
          {row.quote_basis && <BasisBlock label="Quote basis" tone="oklch(0.46 0.16 55)" text={row.quote_basis} />}
          {row.acceptance_basis && <BasisBlock label="Acceptance basis" tone="oklch(0.46 0.16 55)" text={row.acceptance_basis} />}
          {row.activation_basis && <BasisBlock label="Activation basis" tone="#1f6b3a" text={row.activation_basis} />}
          {row.renewal_basis && <BasisBlock label="Renewal basis" tone="#1f6b3a" text={row.renewal_basis} />}
          {row.renewal_quote_basis && <BasisBlock label="Renewal quote basis" tone="#a06200" text={row.renewal_quote_basis} />}
          {row.negotiation_basis && <BasisBlock label="Negotiation basis" tone="#8a4a00" text={row.negotiation_basis} />}
          {row.grace_basis && <BasisBlock label="Grace basis" tone="#a06200" text={row.grace_basis} />}
          {row.suspension_basis && <BasisBlock label="Suspension basis" tone="#9b1f1f" text={row.suspension_basis} />}
          {row.reinstatement_basis && <BasisBlock label="Reinstatement basis" tone="#1f6b3a" text={row.reinstatement_basis} />}
          {row.expiry_basis && <BasisBlock label="Expiry basis" tone="#9b1f1f" text={row.expiry_basis} />}
          {row.cancellation_basis && <BasisBlock label="Cancellation basis" tone="#557" text={row.cancellation_basis} />}
        </section>

        {(primary || secondary.length > 0) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
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
                        ? 'rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50'
                        : 'rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#557] hover:bg-[#f3f5f9]'
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
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}
