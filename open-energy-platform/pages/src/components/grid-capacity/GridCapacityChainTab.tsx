// Wave 58 — Grid Connection Capacity Allocation & Queue Management tab.
//
// NERSA Grid Code + the National Transmission Company SA (NTCSA) Interim Grid
// Capacity Allocation and Curtailment Rules (2024). Transmission / distribution
// headroom is the binding constraint on the SA energy transition: far more
// generation wants to connect than the network can host. Before a generator can
// sign a Grid Connection Agreement (W28) it must SECURE an allocation of scarce
// grid capacity at a supply point. A developer applies; the network operator
// screens completeness, may request more information, runs a network / capacity
// assessment (load-flow, fault-level, stability, headroom), assigns a QUEUE
// POSITION, then a capacity-allocation committee ISSUES AN OFFER, the applicant
// ACCEPTS (reserving the capacity pending milestones), and the operator finally
// ALLOCATES the capacity firmly — which feeds the W28 GCA. The capacity-rights
// QUEUE that sits UPSTREAM of the grid lifecycle.
//
//   application_received → completeness_screening → capacity_assessment
//     → queue_positioned → offer_issued → capacity_reserved → capacity_allocated.
//   Info-gap loop:  completeness_screening → information_requested → (submit) → completeness_screening.
//   reject from capacity_assessment | queue_positioned; lapse from offer_issued | capacity_reserved;
//   relinquish from capacity_reserved; withdraw from any pre-reservation state.
//
// INVERTED SLA — the bigger the requested connection, the longer every window
// (a transmission-level tie-in needs a far deeper load-flow / fault-level /
// system-impact study). Two-party write: the applicant files / supplies info /
// accepts offers / relinquishes / withdraws; the network operator drives
// screening / assessment / queueing / lapse, and the allocation committee issues
// offers / allocates / rejects. Reportability: a rejection crosses the regulator
// inbox for EVERY tier (denying grid access is always material in a
// capacity-constrained grid — the W58 signature); relinquishment + SLA breaches
// cross for large + strategic only.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'application_received' | 'completeness_screening' | 'information_requested'
  | 'capacity_assessment' | 'queue_positioned' | 'offer_issued'
  | 'capacity_reserved' | 'capacity_allocated' | 'rejected'
  | 'lapsed' | 'relinquished' | 'withdrawn';

type Tier = 'minor' | 'small' | 'medium' | 'large' | 'strategic';

interface AllocationRow {
  id: string;
  allocation_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  applicant_party_id: string;
  applicant_party_name: string;
  operator_party_id: string;
  operator_party_name: string;
  capacity_tier: Tier;
  connection_type: string;
  technology: string | null;
  network_level: string | null;
  project_name: string;
  project_location: string | null;
  requested_capacity_mw: number;
  granted_capacity_mw: number | null;
  queue_rank: number | null;
  priority_date: string | null;
  substation: string | null;
  supply_area: string | null;
  estimated_capex_zar_m: number | null;
  gca_ref: string | null;
  application_ref: string | null;
  screening_ref: string | null;
  info_request_ref: string | null;
  assessment_ref: string | null;
  queue_ref: string | null;
  offer_ref: string | null;
  reservation_ref: string | null;
  allocation_ref: string | null;
  regulator_ref: string | null;
  application_basis: string | null;
  screening_basis: string | null;
  info_request_basis: string | null;
  assessment_basis: string | null;
  queue_basis: string | null;
  offer_basis: string | null;
  reservation_basis: string | null;
  allocation_basis: string | null;
  rejection_basis: string | null;
  relinquish_basis: string | null;
  reason_code: string | null;
  decision_notes: string | null;
  info_request_round: number;
  chain_status: ChainStatus;
  application_received_at: string;
  completeness_screening_at: string | null;
  information_requested_at: string | null;
  capacity_assessment_at: string | null;
  queue_positioned_at: string | null;
  offer_issued_at: string | null;
  capacity_reserved_at: string | null;
  capacity_allocated_at: string | null;
  rejected_at: string | null;
  lapsed_at: string | null;
  relinquished_at: string | null;
  withdrawn_at: string | null;
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

interface AllocationEvent {
  id: string;
  allocation_id: string;
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
  allocated_count: number;
  rejected_count: number;
  relinquished_count: number;
  withdrawn_count: number;
  lapsed_count: number;
  in_offer: number;
  breached: number;
  reportable_total: number;
  large_open: number;
  total_requested_mw: number;
  allocated_capacity_mw: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  application_received:    { bg: '#e3e7ec', fg: '#557',    label: 'Application received' },
  completeness_screening:  { bg: '#dbecfb', fg: '#1a3a5c', label: 'Completeness screening' },
  information_requested:   { bg: '#ffe9d6', fg: '#8a4a00', label: 'Info requested' },
  capacity_assessment:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Capacity assessment' },
  queue_positioned:        { bg: '#fff4d6', fg: '#a06200', label: 'Queue positioned' },
  offer_issued:            { bg: '#fff4d6', fg: '#a06200', label: 'Offer issued' },
  capacity_reserved:       { bg: '#daf5e2', fg: '#1f6b3a', label: 'Capacity reserved' },
  capacity_allocated:      { bg: '#d4edda', fg: '#155724', label: 'Capacity allocated' },
  rejected:                { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rejected' },
  lapsed:                  { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Lapsed' },
  relinquished:            { bg: '#e7dbf7', fg: '#5a2a8a', label: 'Relinquished' },
  withdrawn:               { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:     { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
  small:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Small' },
  medium:    { bg: '#fff4d6', fg: '#a06200', label: 'Medium' },
  large:     { bg: '#ffe4b5', fg: '#8a4a00', label: 'Large' },
  strategic: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Strategic' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                 label: 'Active' },
  { key: 'all',                    label: 'All' },
  { key: 'minor',                  label: 'Minor' },
  { key: 'small',                  label: 'Small' },
  { key: 'medium',                 label: 'Medium' },
  { key: 'large',                  label: 'Large' },
  { key: 'strategic',              label: 'Strategic' },
  { key: 'in_offer',               label: 'In offer' },
  { key: 'allocated',              label: 'Allocated' },
  { key: 'breached',               label: 'SLA breached' },
  { key: 'reportable',             label: 'Reportable' },
  { key: 'application_received',   label: 'Received' },
  { key: 'completeness_screening', label: 'Screening' },
  { key: 'information_requested',  label: 'Info requested' },
  { key: 'capacity_assessment',    label: 'Assessment' },
  { key: 'queue_positioned',       label: 'Queue' },
  { key: 'offer_issued',           label: 'Offer issued' },
  { key: 'capacity_reserved',      label: 'Reserved' },
  { key: 'rejected',               label: 'Rejected' },
  { key: 'relinquished',           label: 'Relinquished' },
  { key: 'withdrawn',              label: 'Withdrawn' },
  { key: 'lapsed',                 label: 'Lapsed' },
];

type ActionKind =
  | 'begin-screening' | 'request-info' | 'submit-info' | 'begin-assessment'
  | 'assign-queue-position' | 'issue-offer' | 'accept-offer' | 'allocate-capacity'
  | 'reject-application' | 'lapse' | 'relinquish' | 'withdraw';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  application_received:    'begin-screening',
  completeness_screening:  'begin-assessment',
  information_requested:   'submit-info',
  capacity_assessment:     'assign-queue-position',
  queue_positioned:        'issue-offer',
  offer_issued:            'accept-offer',
  capacity_reserved:       'allocate-capacity',
  capacity_allocated:      null,
  rejected:                null,
  lapsed:                  null,
  relinquished:            null,
  withdrawn:               null,
};

// Functional party per action. The network operator screens, assesses, queues
// and lapses; the allocation committee issues offers, allocates and rejects; the
// applicant submits information, accepts offers, relinquishes and withdraws.
const ACTION_LABEL: Record<ActionKind, string> = {
  'begin-screening':      'Begin completeness screening (network)',
  'request-info':         'Request more information (network)',
  'submit-info':          'Submit requested information (applicant)',
  'begin-assessment':     'Begin capacity assessment (network)',
  'assign-queue-position':'Assign queue position (network)',
  'issue-offer':          'Issue allocation offer (committee)',
  'accept-offer':         'Accept offer / reserve capacity (applicant)',
  'allocate-capacity':    'Allocate capacity firmly (committee)',
  'reject-application':   'Reject application (committee)',
  'lapse':                'Lapse offer (network)',
  'relinquish':           'Relinquish reserved capacity (applicant)',
  'withdraw':             'Withdraw application (applicant)',
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

function fmtMw(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('en-ZA', { maximumFractionDigits: 1 })} MW`;
}

function fmtZarM(n: number | null | undefined): string {
  if (!n) return '—';
  return `R${n.toLocaleString('en-ZA')}m`;
}

const TERMINAL_STATES: ChainStatus[] = ['capacity_allocated', 'rejected', 'lapsed', 'relinquished', 'withdrawn'];
const OFFER_STATES: ChainStatus[] = ['offer_issued', 'capacity_reserved'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['application_received', 'completeness_screening', 'information_requested', 'capacity_assessment', 'queue_positioned', 'offer_issued'];
const REJECTABLE_STATES: ChainStatus[] = ['capacity_assessment', 'queue_positioned'];

export function GridCapacityChainTab() {
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<AllocationRow | null>(null);
  const [events, setEvents] = useState<AllocationEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: AllocationRow[] } & KpiSummary }>('/grid-capacity/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, allocated_count: d.allocated_count,
          rejected_count: d.rejected_count, relinquished_count: d.relinquished_count,
          withdrawn_count: d.withdrawn_count, lapsed_count: d.lapsed_count,
          in_offer: d.in_offer, breached: d.breached, reportable_total: d.reportable_total,
          large_open: d.large_open, total_requested_mw: d.total_requested_mw,
          allocated_capacity_mw: d.allocated_capacity_mw,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load grid capacity allocations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: AllocationRow; events: AllocationEvent[] } }>(
        `/grid-capacity/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load allocation history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')         return true;
      if (filter === 'active')      return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'in_offer')    return OFFER_STATES.includes(r.chain_status);
      if (filter === 'allocated')   return r.chain_status === 'capacity_allocated';
      if (filter === 'breached')    return r.sla_breached;
      if (filter === 'reportable')  return r.is_reportable;
      if (filter === 'minor' || filter === 'small' || filter === 'medium' || filter === 'large' || filter === 'strategic') {
        return r.capacity_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: AllocationRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'begin-screening') {
        const basis = window.prompt('Screening basis — completeness check of the capacity application (single-line diagram, generation profile, connection-point nomination, application fee):') || '';
        const ref = window.prompt('Screening reference (e.g. NTCSA-CAP-SCR-2026-0042):') || '';
        body = {};
        if (basis) body.screening_basis = basis;
        if (ref) body.screening_ref = ref;
      } else if (action === 'request-info') {
        const basis = window.prompt('Info-request basis — the missing items the applicant must furnish (metering plan, financial standing, land rights, generation profile):');
        if (!basis) return;
        const ref = window.prompt('Info-request reference (e.g. NTCSA-CAP-RFI-2026-0042):') || '';
        body = { info_request_basis: basis };
        if (ref) body.info_request_ref = ref;
      } else if (action === 'submit-info') {
        const notes = window.prompt('Submission notes — the additional information the applicant has now furnished:');
        if (!notes) return;
        body = { notes };
      } else if (action === 'begin-assessment') {
        const basis = window.prompt('Assessment basis — scope of the network / system-impact study (load-flow, fault-level, stability, available headroom at the supply point):');
        if (!basis) return;
        const ref = window.prompt('Assessment / system-impact-study reference (e.g. NTCSA-SIS-2026-0042):') || '';
        body = { assessment_basis: basis };
        if (ref) body.assessment_ref = ref;
      } else if (action === 'assign-queue-position') {
        const basis = window.prompt('Queue basis — priority / ranking rationale (priority date, completeness, technical readiness under the NTCSA allocation rules):');
        if (!basis) return;
        const rank = window.prompt('Queue rank (integer position in the capacity queue):') || '';
        const pdate = window.prompt('Priority date (YYYY-MM-DD):') || '';
        const ref = window.prompt('Queue-position notice reference (e.g. NTCSA-Q-2026-0042):') || '';
        body = { queue_basis: basis };
        if (rank && !Number.isNaN(Number(rank))) body.queue_rank = Number(rank);
        if (pdate) body.priority_date = pdate;
        if (ref) body.queue_ref = ref;
      } else if (action === 'issue-offer') {
        const basis = window.prompt('Offer basis — committee resolution issuing a capacity-allocation offer (offered MW, supply point, validity / milestone conditions):');
        if (!basis) return;
        const mw = window.prompt('Offered capacity (MW):') || '';
        const ref = window.prompt('Capacity-allocation offer reference (e.g. NTCSA-OFFER-2026-0042):') || '';
        body = { offer_basis: basis };
        if (mw && !Number.isNaN(Number(mw))) body.granted_capacity_mw = Number(mw);
        if (ref) body.offer_ref = ref;
      } else if (action === 'accept-offer') {
        const basis = window.prompt('Reservation basis — applicant accepts the offer, reserving the capacity pending milestones:') || '';
        const ref = window.prompt('Capacity-reservation agreement reference (e.g. NTCSA-RES-2026-0042):') || '';
        body = {};
        if (basis) body.reservation_basis = basis;
        if (ref) body.reservation_ref = ref;
      } else if (action === 'allocate-capacity') {
        const basis = window.prompt('Allocation basis — committee resolution firmly allocating the capacity (final granted MW, conditions met):');
        if (!basis) return;
        const mw = window.prompt('Firmly allocated capacity (MW):') || '';
        const gca = window.prompt('Linked W28 Grid Connection Agreement reference (e.g. GCA-2026-NC-0612):') || '';
        const ref = window.prompt('Firm capacity-allocation certificate reference (e.g. NTCSA-ALLOC-2026-0042):') || '';
        body = { allocation_basis: basis };
        if (mw && !Number.isNaN(Number(mw))) body.granted_capacity_mw = Number(mw);
        if (gca) body.gca_ref = gca;
        if (ref) body.allocation_ref = ref;
      } else if (action === 'reject-application') {
        const basis = window.prompt('Rejection basis — why the committee denies the capacity application (no available headroom, fails technical assessment, incomplete after info request):');
        if (!basis) return;
        const ref = window.prompt('NERSA grid-access oversight reference (optional):') || '';
        body = { rejection_basis: basis, reason_code: 'capacity_unavailable' };
        if (ref) body.regulator_ref = ref;
      } else if (action === 'lapse') {
        const reason = window.prompt('Lapse reason — the offer / reservation expired (applicant did not accept in time, or milestones missed):') || 'offer_expired';
        body = { reason_code: reason };
      } else if (action === 'relinquish') {
        const basis = window.prompt('Relinquishment basis — why the applicant is handing back the reserved capacity (project cancelled, downsized, alternative connection):');
        if (!basis) return;
        const ref = window.prompt('NERSA grid-access oversight reference (optional):') || '';
        body = { relinquish_basis: basis, reason_code: 'capacity_relinquished' };
        if (ref) body.regulator_ref = ref;
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason — why the applicant is withdrawing before reserving capacity:');
        if (!reason) return;
        body = { reason_code: reason };
      }
      await api.post(`/grid-capacity/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Grid connection capacity allocation &amp; queue management</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage NERSA Grid Code + NTCSA Interim Capacity Allocation Rules (2024) chain · application received →
            completeness screening → capacity assessment → queue positioned → offer issued → capacity reserved → capacity
            allocated. The scarce-capacity QUEUE that sits UPSTREAM of the W28 Grid Connection Agreement — far more
            generation wants to connect than the network can host. The operator may request more information mid-screening
            (submit returns to screening); the committee issues an allocation offer, the applicant reserves the capacity,
            and the operator allocates it firmly (feeding the W28 GCA). An application is rejected at assessment / queue;
            an offer or reservation lapses; reserved capacity is relinquished; or the applicant withdraws before reserving.
            INVERTED SLA: the bigger the requested connection, the longer every window (a transmission tie-in needs a far
            deeper load-flow / fault-level / system-impact study). A rejection crosses to the regulator inbox for EVERY
            tier (denying grid access is always material in a capacity-constrained grid); large + strategic relinquishments
            and SLA breaches also cross.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Large / strategic open" value={kpis?.large_open ?? 0} tone={(kpis?.large_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="In offer" value={kpis?.in_offer ?? 0} tone={(kpis?.in_offer ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Allocated" value={kpis?.allocated_count ?? 0} tone="ok" />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Rejected" value={kpis?.rejected_count ?? 0} tone={(kpis?.rejected_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Relinquished" value={kpis?.relinquished_count ?? 0} tone={(kpis?.relinquished_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Withdrawn" value={kpis?.withdrawn_count ?? 0} />
        <Kpi label="Lapsed" value={kpis?.lapsed_count ?? 0} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Requested in queue" value={fmtMw(kpis?.total_requested_mw ?? 0)} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#0c2a4d] text-white'
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Allocation #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Applicant / project</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Connection / tech</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Requested</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const ct = TIER_TONE[r.capacity_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.allocation_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[240px]">
                      <div className="truncate" title={r.applicant_party_name}>{r.applicant_party_name}</div>
                      <div className="truncate text-[10px] text-[#4a5568]" title={r.project_name}>{r.project_name}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: ct.bg, color: ct.fg }}>
                        {ct.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568] capitalize">
                      {r.connection_type.replace(/_/g, ' ')}
                      {r.technology && r.technology !== 'na' && <span className="text-[10px] text-[#4a5568]"> · {r.technology.replace(/_/g, ' ')}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtMw(r.requested_capacity_mw)}</td>
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No capacity allocations match.</td></tr>
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
  row: AllocationRow;
  events: AllocationEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: AllocationRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canRequestInfo = row.chain_status === 'completeness_screening';
  const canReject = REJECTABLE_STATES.includes(row.chain_status);
  const canLapse = OFFER_STATES.includes(row.chain_status);
  const canRelinquish = row.chain_status === 'capacity_reserved';
  const canWithdraw = WITHDRAWABLE_STATES.includes(row.chain_status);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="oe-overlay-in fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="oe-drawer-in absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.allocation_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.applicant_party_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.capacity_tier].label} · {row.connection_type.replace(/_/g, ' ')}
                {row.project_name ? ` · ${row.project_name}` : ''}
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
            <Pair label="Tier"                value={TIER_TONE[row.capacity_tier].label} />
            <Pair label="Connection type"     value={row.connection_type.replace(/_/g, ' ')} />
            <Pair label="Technology"          value={row.technology ? row.technology.replace(/_/g, ' ') : '—'} />
            <Pair label="Network level"       value={row.network_level ? row.network_level.replace(/_/g, ' ') : '—'} />
            <Pair label="Project"             value={row.project_name} />
            <Pair label="Location"            value={row.project_location ?? '—'} />
            <Pair label="Requested capacity"  value={fmtMw(row.requested_capacity_mw)} />
            <Pair label="Granted capacity"    value={fmtMw(row.granted_capacity_mw)} />
            <Pair label="Queue rank"          value={row.queue_rank !== null ? `#${row.queue_rank}` : '—'} />
            <Pair label="Priority date"       value={row.priority_date ?? '—'} />
            <Pair label="Substation"          value={row.substation ?? '—'} />
            <Pair label="Supply area"         value={row.supply_area ?? '—'} />
            <Pair label="Estimated capex"     value={fmtZarM(row.estimated_capex_zar_m)} />
            <Pair label="Operator"            value={row.operator_party_name} />
            <Pair label="GCA ref (W28)"       value={row.gca_ref ?? '—'} />
            <Pair label="Info-request round"  value={String(row.info_request_round)} />
            <Pair label="Screening ref"       value={row.screening_ref ?? '—'} />
            <Pair label="Info-request ref"    value={row.info_request_ref ?? '—'} />
            <Pair label="Assessment ref"      value={row.assessment_ref ?? '—'} />
            <Pair label="Queue ref"           value={row.queue_ref ?? '—'} />
            <Pair label="Offer ref"           value={row.offer_ref ?? '—'} />
            <Pair label="Reservation ref"     value={row.reservation_ref ?? '—'} />
            <Pair label="Allocation ref"      value={row.allocation_ref ?? '—'} />
            <Pair label="Regulator ref"       value={row.regulator_ref ?? '—'} />
            <Pair label="Reason code"         value={row.reason_code ?? '—'} />
            <Pair label="Received"            value={fmtDate(row.application_received_at)} />
            <Pair label="Screening"           value={fmtDate(row.completeness_screening_at)} />
            <Pair label="Info requested"      value={fmtDate(row.information_requested_at)} />
            <Pair label="Assessment"          value={fmtDate(row.capacity_assessment_at)} />
            <Pair label="Queue positioned"    value={fmtDate(row.queue_positioned_at)} />
            <Pair label="Offer issued"        value={fmtDate(row.offer_issued_at)} />
            <Pair label="Capacity reserved"   value={fmtDate(row.capacity_reserved_at)} />
            <Pair label="Capacity allocated"  value={fmtDate(row.capacity_allocated_at)} />
            <Pair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"          value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"      value={String(row.escalation_level)} />
            <Pair label="Reportable"          value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.application_basis && (
            <BasisBlock label="Application basis" tone="#1a3a5c" text={row.application_basis} />
          )}
          {row.screening_basis && (
            <BasisBlock label="Screening basis" tone="#1a3a5c" text={row.screening_basis} />
          )}
          {row.info_request_basis && (
            <BasisBlock label="Info-request basis" tone="#8a4a00" text={row.info_request_basis} />
          )}
          {row.assessment_basis && (
            <BasisBlock label="Assessment basis" tone="#1a3a5c" text={row.assessment_basis} />
          )}
          {row.queue_basis && (
            <BasisBlock label="Queue basis" tone="#a06200" text={row.queue_basis} />
          )}
          {row.offer_basis && (
            <BasisBlock label="Offer basis" tone="#a06200" text={row.offer_basis} />
          )}
          {row.reservation_basis && (
            <BasisBlock label="Reservation basis" tone="#1f6b3a" text={row.reservation_basis} />
          )}
          {row.allocation_basis && (
            <BasisBlock label="Allocation basis" tone="#155724" text={row.allocation_basis} />
          )}
          {row.relinquish_basis && (
            <BasisBlock label="Relinquishment basis" tone="#5a2a8a" text={row.relinquish_basis} />
          )}
          {row.rejection_basis && (
            <BasisBlock label="Rejection basis" tone="#9b1f1f" text={row.rejection_basis} />
          )}
          {row.decision_notes && (
            <BasisBlock label="Decision notes" tone="#155724" text={row.decision_notes} />
          )}
        </section>

        {(nextAction || canRequestInfo || canReject || canLapse || canRelinquish || canWithdraw) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canRequestInfo && (
                <button type="button"
                  onClick={() => onAct('request-info', row)}
                  className="rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  {ACTION_LABEL['request-info']}
                </button>
              )}
              {canReject && (
                <button type="button"
                  onClick={() => onAct('reject-application', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['reject-application']}
                </button>
              )}
              {canLapse && (
                <button type="button"
                  onClick={() => onAct('lapse', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL.lapse}
                </button>
              )}
              {canRelinquish && (
                <button type="button"
                  onClick={() => onAct('relinquish', row)}
                  className="rounded border border-purple-300 bg-white px-3 py-1.5 text-[12px] font-medium text-[#5a2a8a] hover:bg-purple-50"
                >
                  {ACTION_LABEL.relinquish}
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
