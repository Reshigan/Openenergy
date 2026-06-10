// Wave 65 — Carbon ERPA (Emission Reduction Purchase Agreement) Forward Delivery
// & Make-Good lifecycle tab.
//
// The commercial FORWARD-SALE contract on top of the carbon-credit lifecycle. A
// buyer contracts today to purchase a contracted volume of a project's future
// emission reductions; the seller (project developer) must DELIVER that volume
// against a delivery schedule. A short delivery triggers a MAKE-GOOD obligation
// (re-deliver replacement reductions, or settle the gap). Where W37 registers a
// project, W11 verifies each monitoring period, W56 re-validates the crediting
// period, W17 retires the credit and W48 monetises the tax offset, THIS chain
// governs how reductions are SOLD FORWARD and physically delivered.
//
//   erpa_drafted → erpa_executed → delivery_scheduled → delivery_initiated →
//     delivery_verified → settled → completed.
//   shortfall/make-good: delivery_initiated → shortfall_flagged →
//     make_good_pending → (initiate_delivery) → delivery_initiated; or settle the gap.
//   dispute: delivery_verified | settled → disputed → (resolve_dispute) → settled.
//   terminate from any executed/active state; withdraw before performance begins.
//
// INVERTED SLA — the larger the forward sale, the LONGER every window. Single
// carbon-fund desk write; actor_party records the functional party (seller /
// buyer / registry) for audit. Reportability — the W65 signature is
// CORRESPONDING-ADJUSTMENT driven: a verified delivery of an Article 6 transfer
// (an ITMO needing an NDC correction) crosses to the regulator inbox for EVERY
// tier; voluntary/compliance verify, terminate and SLA breach cross for the
// large tiers (major + mega).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'erpa_drafted' | 'erpa_executed' | 'delivery_scheduled' | 'delivery_initiated'
  | 'delivery_verified' | 'shortfall_flagged' | 'make_good_pending' | 'settled'
  | 'completed' | 'disputed' | 'terminated' | 'withdrawn';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'mega';

type Standard = 'verra_vcs' | 'gold_standard' | 'article_6_4' | 'cdm';

type TransferType = 'article6' | 'voluntary' | 'compliance';

interface ErpaRow {
  id: string;
  erpa_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string;
  project_name: string;
  registry_standard: Standard;
  methodology_id: string | null;
  seller_party_id: string;
  seller_party_name: string;
  buyer_party_id: string;
  buyer_party_name: string;
  transfer_type: TransferType;
  volume_tier: Tier;
  contracted_volume_tco2e: number | null;
  delivered_volume_tco2e: number | null;
  shortfall_volume_tco2e: number | null;
  price_per_tco2e: number | null;
  contract_currency: string | null;
  contract_value: number | null;
  vintage_year: number | null;
  host_country: string | null;
  corresponding_adjustment_required: number;
  corresponding_adjustment_ref: string | null;
  delivery_window_start: string | null;
  delivery_window_end: string | null;
  erpa_ref: string | null;
  delivery_ref: string | null;
  verification_ref: string | null;
  settlement_ref: string | null;
  dispute_ref: string | null;
  execution_basis: string | null;
  schedule_basis: string | null;
  delivery_basis: string | null;
  verification_basis: string | null;
  shortfall_basis: string | null;
  make_good_basis: string | null;
  settlement_basis: string | null;
  dispute_basis: string | null;
  termination_basis: string | null;
  reason_code: string | null;
  erpa_summary: string | null;
  chain_status: ChainStatus;
  drafted_at: string;
  executed_at: string | null;
  delivery_scheduled_at: string | null;
  delivery_initiated_at: string | null;
  delivery_verified_at: string | null;
  shortfall_flagged_at: string | null;
  make_good_pending_at: string | null;
  settled_at: string | null;
  completed_at: string | null;
  disputed_at: string | null;
  terminated_at: string | null;
  withdrawn_at: string | null;
  delivery_round: number;
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
  requires_ca_flag?: boolean;
  breach_crosses_regulator?: boolean;
}

interface ErpaEvent {
  id: string;
  erpa_id: string;
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
  completed_count: number;
  terminated_count: number;
  withdrawn_count: number;
  in_delivery_count: number;
  shortfall_count: number;
  make_good_count: number;
  disputed_count: number;
  breached: number;
  reportable_total: number;
  ca_required_total: number;
  large_open: number;
  total_contracted_volume: number;
  total_delivered_volume: number;
  total_shortfall_volume: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  erpa_drafted:       { bg: '#e3e7ec', fg: '#557',    label: 'Drafted' },
  erpa_executed:      { bg: '#dbecfb', fg: '#1a3a5c', label: 'Executed' },
  delivery_scheduled: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Delivery scheduled' },
  delivery_initiated: { bg: '#fff4d6', fg: '#a06200', label: 'Delivery initiated' },
  delivery_verified:  { bg: '#fff4d6', fg: '#a06200', label: 'Delivery verified' },
  shortfall_flagged:  { bg: '#ffe9d6', fg: '#8a4a00', label: 'Shortfall flagged' },
  make_good_pending:  { bg: '#ffe9d6', fg: '#8a4a00', label: 'Make-good pending' },
  settled:            { bg: '#d4edda', fg: '#155724', label: 'Settled' },
  completed:          { bg: '#d4edda', fg: '#155724', label: 'Completed' },
  disputed:           { bg: '#fde0e0', fg: '#9b1f1f', label: 'Disputed' },
  terminated:         { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Terminated' },
  withdrawn:          { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor (<10k)' },
  moderate: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate (<100k)' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material (<500k)' },
  major:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Major (<2m)' },
  mega:     { bg: '#fde0e0', fg: '#9b1f1f', label: 'Mega (≥2m)' },
};

const STANDARD_LABEL: Record<Standard, string> = {
  verra_vcs:    'Verra VCS',
  gold_standard:'Gold Standard',
  article_6_4:  'Article 6.4',
  cdm:          'CDM',
};

const TRANSFER_LABEL: Record<TransferType, string> = {
  article6:   'Article 6 (ITMO)',
  voluntary:  'Voluntary',
  compliance: 'Compliance',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',             label: 'Active' },
  { key: 'all',                label: 'All' },
  { key: 'minor',              label: 'Minor' },
  { key: 'moderate',           label: 'Moderate' },
  { key: 'material',           label: 'Material' },
  { key: 'major',              label: 'Major' },
  { key: 'mega',               label: 'Mega' },
  { key: 'article6',           label: 'Article 6' },
  { key: 'in_delivery',        label: 'In delivery' },
  { key: 'shortfall',          label: 'Shortfall' },
  { key: 'make_good',          label: 'Make-good' },
  { key: 'disputed',           label: 'Disputed' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'reportable',         label: 'Reportable' },
  { key: 'erpa_drafted',       label: 'Drafted' },
  { key: 'erpa_executed',      label: 'Executed' },
  { key: 'delivery_scheduled', label: 'Scheduled' },
  { key: 'delivery_initiated', label: 'Initiated' },
  { key: 'delivery_verified',  label: 'Verified' },
  { key: 'settled',            label: 'Settled' },
  { key: 'completed',          label: 'Completed' },
  { key: 'terminated',         label: 'Terminated' },
  { key: 'withdrawn',          label: 'Withdrawn' },
];

type ActionKind =
  | 'execute-erpa' | 'schedule-delivery' | 'initiate-delivery' | 'verify-delivery'
  | 'flag-shortfall' | 'initiate-make-good' | 'settle' | 'complete'
  | 'raise-dispute' | 'resolve-dispute' | 'terminate' | 'withdraw';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  erpa_drafted:       'execute-erpa',
  erpa_executed:      'schedule-delivery',
  delivery_scheduled: 'initiate-delivery',
  delivery_initiated: 'verify-delivery',
  delivery_verified:  'settle',
  shortfall_flagged:  'initiate-make-good',
  make_good_pending:  'initiate-delivery',
  settled:            'complete',
  disputed:           'resolve-dispute',
  completed:          null,
  terminated:         null,
  withdrawn:          null,
};

// Party annotation per action — the contractual function. The SELLER executes /
// schedules / delivers / makes good / terminates / withdraws; the BUYER verifies
// receipt, flags a shortfall, settles payment and raises a dispute; the REGISTRY
// resolves disputes and closes a fully-performed ERPA.
const ACTION_LABEL: Record<ActionKind, string> = {
  'execute-erpa':       'Execute ERPA (seller)',
  'schedule-delivery':  'Schedule delivery (seller)',
  'initiate-delivery':  'Initiate delivery (seller)',
  'verify-delivery':    'Verify delivery (buyer)',
  'flag-shortfall':     'Flag shortfall (buyer)',
  'initiate-make-good': 'Initiate make-good (seller)',
  'settle':             'Settle (buyer)',
  'complete':           'Complete ERPA (registry)',
  'raise-dispute':      'Raise dispute (buyer)',
  'resolve-dispute':    'Resolve dispute (registry)',
  'terminate':          'Terminate (seller)',
  'withdraw':           'Withdraw (seller)',
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

function fmtTco2e(n: number | null | undefined): string {
  if (!n) return '—';
  return `${n.toLocaleString('en-ZA')} tCO₂e`;
}

function fmtMoney(n: number | null | undefined, ccy: string | null | undefined): string {
  if (!n) return '—';
  return `${ccy || ''} ${n.toLocaleString('en-ZA')}`.trim();
}

const TERMINAL_STATES: ChainStatus[] = ['completed', 'terminated', 'withdrawn'];
const IN_DELIVERY_STATES: ChainStatus[] = ['delivery_scheduled', 'delivery_initiated', 'delivery_verified'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['erpa_drafted', 'erpa_executed'];
const TERMINABLE_STATES: ChainStatus[] = [
  'erpa_executed', 'delivery_scheduled', 'delivery_initiated', 'delivery_verified',
  'shortfall_flagged', 'make_good_pending', 'disputed',
];
const DISPUTABLE_STATES: ChainStatus[] = ['delivery_verified', 'settled'];

export function CarbonErpaChainTab() {
  const [rows, setRows] = useState<ErpaRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<ErpaRow | null>(null);
  const [events, setEvents] = useState<ErpaEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ErpaRow[] } & KpiSummary }>('/carbon-erpa/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, completed_count: d.completed_count,
          terminated_count: d.terminated_count, withdrawn_count: d.withdrawn_count,
          in_delivery_count: d.in_delivery_count, shortfall_count: d.shortfall_count,
          make_good_count: d.make_good_count, disputed_count: d.disputed_count,
          breached: d.breached, reportable_total: d.reportable_total,
          ca_required_total: d.ca_required_total, large_open: d.large_open,
          total_contracted_volume: d.total_contracted_volume,
          total_delivered_volume: d.total_delivered_volume,
          total_shortfall_volume: d.total_shortfall_volume,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load carbon ERPA records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: ErpaRow; events: ErpaEvent[] } }>(
        `/carbon-erpa/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load ERPA history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')         return true;
      if (filter === 'active')      return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'in_delivery') return IN_DELIVERY_STATES.includes(r.chain_status);
      if (filter === 'shortfall')   return r.chain_status === 'shortfall_flagged';
      if (filter === 'make_good')   return r.chain_status === 'make_good_pending';
      if (filter === 'disputed')    return r.chain_status === 'disputed';
      if (filter === 'breached')    return r.sla_breached;
      if (filter === 'reportable')  return r.is_reportable;
      if (filter === 'article6')    return r.transfer_type === 'article6';
      if (filter === 'minor' || filter === 'moderate' || filter === 'material' || filter === 'major' || filter === 'mega') {
        return r.volume_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: ErpaRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'execute-erpa') {
        const basis = window.prompt('Execution basis — the ERPA signed between buyer and seller for the forward purchase of emission reductions:');
        if (!basis) return;
        const ref = window.prompt('ERPA reference (e.g. ERPA-2026-0007):') || '';
        const volume = window.prompt('Contracted volume (tCO₂e — re-derives the tier):', String(row.contracted_volume_tco2e || ''));
        const price = window.prompt('Price per tCO₂e:', String(row.price_per_tco2e || ''));
        const ccy = window.prompt('Contract currency (ZAR / USD / EUR):', row.contract_currency || 'USD') || '';
        const vintage = window.prompt('Credit vintage year:', String(row.vintage_year || ''));
        const host = window.prompt('Host country (NDC for corresponding adjustment):', row.host_country || '') || '';
        const wStart = window.prompt('Delivery window start (YYYY-MM-DD):', row.delivery_window_start || '') || '';
        const wEnd = window.prompt('Delivery window end (YYYY-MM-DD):', row.delivery_window_end || '') || '';
        body = { execution_basis: basis };
        if (ref) body.erpa_ref = ref;
        if (volume && !Number.isNaN(Number(volume))) body.contracted_volume_tco2e = Number(volume);
        if (price && !Number.isNaN(Number(price))) body.price_per_tco2e = Number(price);
        if (ccy) body.contract_currency = ccy;
        if (vintage && !Number.isNaN(Number(vintage))) body.vintage_year = Number(vintage);
        if (host) body.host_country = host;
        if (wStart) body.delivery_window_start = wStart;
        if (wEnd) body.delivery_window_end = wEnd;
      } else if (action === 'schedule-delivery') {
        const basis = window.prompt('Schedule basis — the agreed delivery schedule against which the seller must deliver:');
        if (!basis) return;
        const wStart = window.prompt('Delivery window start (YYYY-MM-DD):', row.delivery_window_start || '') || '';
        const wEnd = window.prompt('Delivery window end (YYYY-MM-DD):', row.delivery_window_end || '') || '';
        body = { schedule_basis: basis };
        if (wStart) body.delivery_window_start = wStart;
        if (wEnd) body.delivery_window_end = wEnd;
      } else if (action === 'initiate-delivery') {
        const basis = window.prompt('Delivery basis — the tranche of reductions the seller is delivering against the schedule:');
        if (!basis) return;
        const ref = window.prompt('Delivery reference (e.g. DEL-2026-0007):') || '';
        body = { delivery_basis: basis };
        if (ref) body.delivery_ref = ref;
      } else if (action === 'verify-delivery') {
        const basis = window.prompt('Verification basis — buyer confirmation the delivered reductions match the contracted tranche:');
        if (!basis) return;
        const ref = window.prompt('Verification reference (e.g. VER-2026-0007):') || '';
        const delivered = window.prompt('Delivered volume (tCO₂e) this verification:', String(row.delivered_volume_tco2e || ''));
        const caRef = window.prompt('Corresponding-adjustment reference (Article 6 only — the NDC authorisation applied at delivery):', row.corresponding_adjustment_ref || '') || '';
        body = { verification_basis: basis };
        if (ref) body.verification_ref = ref;
        if (delivered && !Number.isNaN(Number(delivered))) body.delivered_volume_tco2e = Number(delivered);
        if (caRef) body.corresponding_adjustment_ref = caRef;
      } else if (action === 'flag-shortfall') {
        const basis = window.prompt('Shortfall basis — the delivered volume falls short of the contracted tranche:');
        if (!basis) return;
        const delivered = window.prompt('Delivered volume so far (tCO₂e):', String(row.delivered_volume_tco2e || ''));
        const shortfall = window.prompt('Shortfall volume (tCO₂e — leave blank to derive contracted − delivered):', '');
        body = { shortfall_basis: basis, reason_code: 'short_delivery' };
        if (delivered && !Number.isNaN(Number(delivered))) body.delivered_volume_tco2e = Number(delivered);
        if (shortfall && !Number.isNaN(Number(shortfall))) body.shortfall_volume_tco2e = Number(shortfall);
      } else if (action === 'initiate-make-good') {
        const basis = window.prompt('Make-good basis — the seller obligation to deliver replacement reductions for the shortfall:');
        if (!basis) return;
        body = { make_good_basis: basis };
      } else if (action === 'settle') {
        const basis = window.prompt('Settlement basis — payment for the delivered reductions (or settlement of the shortfall gap):');
        if (!basis) return;
        const ref = window.prompt('Settlement reference (e.g. SET-2026-0007):') || '';
        const summary = window.prompt('ERPA summary (one line for the audit record):') || '';
        body = { settlement_basis: basis };
        if (ref) body.settlement_ref = ref;
        if (summary) body.erpa_summary = summary;
      } else if (action === 'complete') {
        const summary = window.prompt('Completion summary — the ERPA is fully delivered and settled (registry close-out):') || '';
        body = summary ? { erpa_summary: summary } : {};
      } else if (action === 'raise-dispute') {
        const basis = window.prompt('Dispute basis — what the buyer/seller contests in the verified delivery or settlement:');
        if (!basis) return;
        const ref = window.prompt('Dispute reference (e.g. DSP-2026-0007):') || '';
        body = { dispute_basis: basis, reason_code: 'delivery_disputed' };
        if (ref) body.dispute_ref = ref;
      } else if (action === 'resolve-dispute') {
        const basis = window.prompt('Resolution basis — how the dispute was resolved (registry), settling the ERPA:');
        if (!basis) return;
        const ref = window.prompt('Settlement reference (e.g. SET-2026-0007):') || '';
        body = { dispute_basis: basis };
        if (ref) body.settlement_ref = ref;
      } else if (action === 'terminate') {
        const basis = window.prompt('Termination basis — early exit of the executed contract (default / force majeure / non-delivery):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. non_delivery / force_majeure / buyer_default):', 'non_delivery') || '';
        body = { termination_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason — why the ERPA is pulled before performance begins:');
        if (!reason) return;
        body = { reason_code: reason };
      }
      await api.post(`/carbon-erpa/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Carbon ERPA — forward delivery &amp; make-good</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage forward-sale chain · drafted → executed → delivery scheduled → delivery initiated →
            delivery verified → settled → completed. A short delivery flags a shortfall and a make-good obligation
            (re-deliver, or settle the gap); a verified delivery or settlement can be disputed and resolved; an
            executed contract can be terminated, and a drafted/executed ERPA withdrawn before performance. The
            commercial counterpart to the carbon-credit lifecycle — how a buyer contracts a project's future
            reductions and the seller delivers them against a binding schedule. INVERTED SLA: the larger the forward
            sale, the longer every window. The W65 signature is corresponding-adjustment driven — a verified delivery
            of an Article 6 transfer (an ITMO needing an NDC correction) crosses to the regulator inbox for every
            tier; voluntary/compliance verification, termination and SLA breach cross for the large tiers (major + mega).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Large open" value={kpis?.large_open ?? 0} tone={(kpis?.large_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="In delivery" value={kpis?.in_delivery_count ?? 0} tone={(kpis?.in_delivery_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Shortfall" value={kpis?.shortfall_count ?? 0} tone={(kpis?.shortfall_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Make-good" value={kpis?.make_good_count ?? 0} tone={(kpis?.make_good_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Disputed" value={kpis?.disputed_count ?? 0} tone={(kpis?.disputed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Completed" value={kpis?.completed_count ?? 0} tone="ok" />
        <Kpi label="Terminated" value={kpis?.terminated_count ?? 0} tone={(kpis?.terminated_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Article 6 (CA)" value={kpis?.ca_required_total ?? 0} tone={(kpis?.ca_required_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Contracted" value={fmtTco2e(kpis?.total_contracted_volume ?? 0)} />
        <Kpi label="Delivered" value={fmtTco2e(kpis?.total_delivered_volume ?? 0)} />
        <Kpi label="Shortfall vol" value={fmtTco2e(kpis?.total_shortfall_volume ?? 0)} tone={(kpis?.total_shortfall_volume ?? 0) > 0 ? 'warn' : 'ok'} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">ERPA #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Transfer</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Delivered / contracted</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.volume_tier];
                const ca = r.transfer_type === 'article6';
                const short = (r.shortfall_volume_tco2e || 0) > 0;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.erpa_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[200px] truncate" title={r.project_name}>
                      {r.project_name}
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
                    <td className={`px-3 py-2 text-right tabular-nums ${short ? 'text-[#8a4a00] font-semibold' : 'text-[#1a3a5c]'}`}>
                      {(r.delivered_volume_tco2e || 0).toLocaleString('en-ZA')} / {(r.contracted_volume_tco2e || 0).toLocaleString('en-ZA')}
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No ERPAs match.</td></tr>
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
  row: ErpaRow;
  events: ErpaEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: ErpaRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canFlagShortfall = row.chain_status === 'delivery_initiated';
  const canSettleSecondary = row.chain_status === 'shortfall_flagged' || row.chain_status === 'make_good_pending';
  const canDispute = DISPUTABLE_STATES.includes(row.chain_status);
  const canTerminate = TERMINABLE_STATES.includes(row.chain_status);
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
              <div className="font-mono text-[12px] text-[#4a5568]">{row.erpa_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.volume_tier].label} · {STANDARD_LABEL[row.registry_standard]} · {TRANSFER_LABEL[row.transfer_type]}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                {row.seller_party_name} → {row.buyer_party_name}
                {row.delivery_round > 0 ? ` · delivery round ${row.delivery_round}` : ''}
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
            <Pair label="Tier"                 value={TIER_TONE[row.volume_tier].label} />
            <Pair label="Standard"             value={STANDARD_LABEL[row.registry_standard]} />
            <Pair label="Transfer type"        value={TRANSFER_LABEL[row.transfer_type]} />
            <Pair label="Methodology"          value={row.methodology_id ?? '—'} />
            <Pair label="Host country"         value={row.host_country ?? '—'} />
            <Pair label="Corresp. adjustment"  value={row.requires_ca_flag ? 'Required (Article 6)' : 'Not required'} />
            <Pair label="CA reference"         value={row.corresponding_adjustment_ref ?? '—'} />
            <Pair label="Seller"               value={row.seller_party_name} />
            <Pair label="Buyer"                value={row.buyer_party_name} />
            <Pair label="Contracted volume"    value={fmtTco2e(row.contracted_volume_tco2e)} />
            <Pair label="Delivered volume"     value={fmtTco2e(row.delivered_volume_tco2e)} />
            <Pair label="Shortfall volume"     value={fmtTco2e(row.shortfall_volume_tco2e)} />
            <Pair label="Price / tCO₂e"        value={fmtMoney(row.price_per_tco2e, row.contract_currency)} />
            <Pair label="Contract value"       value={fmtMoney(row.contract_value, row.contract_currency)} />
            <Pair label="Vintage year"         value={row.vintage_year ? String(row.vintage_year) : '—'} />
            <Pair label="Delivery window"      value={`${fmtDate(row.delivery_window_start)} → ${fmtDate(row.delivery_window_end)}`} />
            <Pair label="Delivery round"       value={String(row.delivery_round)} />
            <Pair label="ERPA ref"             value={row.erpa_ref ?? '—'} />
            <Pair label="Delivery ref"         value={row.delivery_ref ?? '—'} />
            <Pair label="Verification ref"     value={row.verification_ref ?? '—'} />
            <Pair label="Settlement ref"       value={row.settlement_ref ?? '—'} />
            <Pair label="Dispute ref"          value={row.dispute_ref ?? '—'} />
            <Pair label="Reason code"          value={row.reason_code ?? '—'} />
            <Pair label="Drafted"              value={fmtDate(row.drafted_at)} />
            <Pair label="Executed"             value={fmtDate(row.executed_at)} />
            <Pair label="Delivery scheduled"   value={fmtDate(row.delivery_scheduled_at)} />
            <Pair label="Delivery initiated"   value={fmtDate(row.delivery_initiated_at)} />
            <Pair label="Delivery verified"    value={fmtDate(row.delivery_verified_at)} />
            <Pair label="Shortfall flagged"    value={fmtDate(row.shortfall_flagged_at)} />
            <Pair label="Make-good pending"    value={fmtDate(row.make_good_pending_at)} />
            <Pair label="Settled"              value={fmtDate(row.settled_at)} />
            <Pair label="Completed"            value={fmtDate(row.completed_at)} />
            <Pair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"           value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"       value={String(row.escalation_level)} />
            <Pair label="Reportable"           value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.erpa_summary && (
            <BasisBlock label="ERPA summary" tone="#1a3a5c" text={row.erpa_summary} />
          )}
          {row.execution_basis && (
            <BasisBlock label="Execution basis" tone="#1a3a5c" text={row.execution_basis} />
          )}
          {row.schedule_basis && (
            <BasisBlock label="Schedule basis" tone="#1a3a5c" text={row.schedule_basis} />
          )}
          {row.delivery_basis && (
            <BasisBlock label="Delivery basis" tone="#a06200" text={row.delivery_basis} />
          )}
          {row.verification_basis && (
            <BasisBlock label="Verification basis (buyer)" tone="#a06200" text={row.verification_basis} />
          )}
          {row.shortfall_basis && (
            <BasisBlock label="Shortfall basis" tone="#8a4a00" text={row.shortfall_basis} />
          )}
          {row.make_good_basis && (
            <BasisBlock label="Make-good basis" tone="#8a4a00" text={row.make_good_basis} />
          )}
          {row.settlement_basis && (
            <BasisBlock label="Settlement basis" tone="#155724" text={row.settlement_basis} />
          )}
          {row.dispute_basis && (
            <BasisBlock label="Dispute basis" tone="#9b1f1f" text={row.dispute_basis} />
          )}
          {row.termination_basis && (
            <BasisBlock label="Termination basis" tone="#9b1f1f" text={row.termination_basis} />
          )}
        </section>

        {(nextAction || canFlagShortfall || canSettleSecondary || canDispute || canTerminate || canWithdraw) && (
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
              {canFlagShortfall && (
                <button type="button"
                  onClick={() => onAct('flag-shortfall', row)}
                  className="rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  {ACTION_LABEL['flag-shortfall']}
                </button>
              )}
              {canSettleSecondary && (
                <button type="button"
                  onClick={() => onAct('settle', row)}
                  className="rounded border border-green-300 bg-white px-3 py-1.5 text-[12px] font-medium text-green-700 hover:bg-green-50"
                >
                  {ACTION_LABEL.settle}
                </button>
              )}
              {canDispute && (
                <button type="button"
                  onClick={() => onAct('raise-dispute', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['raise-dispute']}
                </button>
              )}
              {canTerminate && (
                <button type="button"
                  onClick={() => onAct('terminate', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.terminate}
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
