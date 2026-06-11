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
  | 'application_received' | 'completeness_screening' | 'information_requested'
  | 'capacity_assessment' | 'queue_positioned' | 'offer_issued'
  | 'capacity_reserved' | 'capacity_allocated' | 'rejected'
  | 'lapsed' | 'relinquished' | 'withdrawn';

type Tier = 'minor' | 'small' | 'medium' | 'large' | 'strategic';

interface AllocationRow {
  [key: string]: unknown;
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
  // ChainCard requires case_number
  case_number?: string;
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

const ALL_STATES = [
  'application_received',
  'completeness_screening',
  'capacity_assessment',
  'queue_positioned',
  'offer_issued',
  'capacity_reserved',
  'capacity_allocated',
] as const;

const BRANCH_STATES = [
  'information_requested',
  'rejected',
  'lapsed',
  'relinquished',
  'withdrawn',
] as const;

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

const TERMINAL_STATES: ChainStatus[] = ['capacity_allocated', 'rejected', 'lapsed', 'relinquished', 'withdrawn'];
const OFFER_STATES: ChainStatus[] = ['offer_issued', 'capacity_reserved'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['application_received', 'completeness_screening', 'information_requested', 'capacity_assessment', 'queue_positioned', 'offer_issued'];
const REJECTABLE_STATES: ChainStatus[] = ['capacity_assessment', 'queue_positioned'];

function getActions(row: AllocationRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'application_received') {
    actions.push({
      key: 'begin-screening',
      label: 'Begin completeness screening (network)',
      tone: 'primary',
      fields: [
        { key: 'screening_basis', label: 'Screening basis — completeness check of the capacity application (single-line diagram, generation profile, connection-point nomination, application fee)', type: 'textarea', required: false },
        { key: 'screening_ref', label: 'Screening reference (e.g. NTCSA-CAP-SCR-2026-0042)', type: 'text', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'completeness_screening') {
    actions.push({
      key: 'begin-assessment',
      label: 'Begin capacity assessment (network)',
      tone: 'primary',
      fields: [
        { key: 'assessment_basis', label: 'Assessment basis — scope of the network / system-impact study (load-flow, fault-level, stability, available headroom at the supply point)', type: 'textarea', required: true },
        { key: 'assessment_ref', label: 'Assessment / system-impact-study reference (e.g. NTCSA-SIS-2026-0042)', type: 'text', required: false },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'request-info',
      label: 'Request more information (network)',
      tone: 'warn',
      fields: [
        { key: 'info_request_basis', label: 'Info-request basis — the missing items the applicant must furnish (metering plan, financial standing, land rights, generation profile)', type: 'textarea', required: true },
        { key: 'info_request_ref', label: 'Info-request reference (e.g. NTCSA-CAP-RFI-2026-0042)', type: 'text', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'information_requested') {
    actions.push({
      key: 'submit-info',
      label: 'Submit requested information (applicant)',
      tone: 'primary',
      fields: [
        { key: 'notes', label: 'Submission notes — the additional information the applicant has now furnished', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'capacity_assessment') {
    actions.push({
      key: 'assign-queue-position',
      label: 'Assign queue position (network)',
      tone: 'primary',
      fields: [
        { key: 'queue_basis', label: 'Queue basis — priority / ranking rationale (priority date, completeness, technical readiness under the NTCSA allocation rules)', type: 'textarea', required: true },
        { key: 'queue_rank', label: 'Queue rank (integer position in the capacity queue)', type: 'text', required: false },
        { key: 'priority_date', label: 'Priority date (YYYY-MM-DD)', type: 'text', required: false },
        { key: 'queue_ref', label: 'Queue-position notice reference (e.g. NTCSA-Q-2026-0042)', type: 'text', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'queue_positioned') {
    actions.push({
      key: 'issue-offer',
      label: 'Issue allocation offer (committee)',
      tone: 'primary',
      fields: [
        { key: 'offer_basis', label: 'Offer basis — committee resolution issuing a capacity-allocation offer (offered MW, supply point, validity / milestone conditions)', type: 'textarea', required: true },
        { key: 'granted_capacity_mw', label: 'Offered capacity (MW)', type: 'text', required: false },
        { key: 'offer_ref', label: 'Capacity-allocation offer reference (e.g. NTCSA-OFFER-2026-0042)', type: 'text', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'offer_issued') {
    actions.push({
      key: 'accept-offer',
      label: 'Accept offer / reserve capacity (applicant)',
      tone: 'primary',
      fields: [
        { key: 'reservation_basis', label: 'Reservation basis — applicant accepts the offer, reserving the capacity pending milestones', type: 'textarea', required: false },
        { key: 'reservation_ref', label: 'Capacity-reservation agreement reference (e.g. NTCSA-RES-2026-0042)', type: 'text', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'capacity_reserved') {
    actions.push({
      key: 'allocate-capacity',
      label: 'Allocate capacity firmly (committee)',
      tone: 'primary',
      fields: [
        { key: 'allocation_basis', label: 'Allocation basis — committee resolution firmly allocating the capacity (final granted MW, conditions met)', type: 'textarea', required: true },
        { key: 'granted_capacity_mw', label: 'Firmly allocated capacity (MW)', type: 'text', required: false },
        { key: 'gca_ref', label: 'Linked W28 Grid Connection Agreement reference (e.g. GCA-2026-NC-0612)', type: 'text', required: false },
        { key: 'allocation_ref', label: 'Firm capacity-allocation certificate reference (e.g. NTCSA-ALLOC-2026-0042)', type: 'text', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (REJECTABLE_STATES.includes(s)) {
    actions.push({
      key: 'reject-application',
      label: 'Reject application (committee)',
      tone: 'danger',
      fields: [
        { key: 'rejection_basis', label: 'Rejection basis — why the committee denies the capacity application (no available headroom, fails technical assessment, incomplete after info request)', type: 'textarea', required: true },
        { key: 'regulator_ref', label: 'NERSA grid-access oversight reference (optional)', type: 'text', required: false },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (OFFER_STATES.includes(s)) {
    actions.push({
      key: 'lapse',
      label: 'Lapse offer (network)',
      tone: 'warn',
      fields: [
        { key: 'reason_code', label: 'Lapse reason — the offer / reservation expired (applicant did not accept in time, or milestones missed)', type: 'text', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'capacity_reserved') {
    actions.push({
      key: 'relinquish',
      label: 'Relinquish reserved capacity (applicant)',
      tone: 'danger',
      fields: [
        { key: 'relinquish_basis', label: 'Relinquishment basis — why the applicant is handing back the reserved capacity (project cancelled, downsized, alternative connection)', type: 'textarea', required: true },
        { key: 'regulator_ref', label: 'NERSA grid-access oversight reference (optional)', type: 'text', required: false },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (WITHDRAWABLE_STATES.includes(s)) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw application (applicant)',
      tone: 'ghost',
      fields: [
        { key: 'reason_code', label: 'Withdrawal reason — why the applicant is withdrawing before reserving capacity', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtMw(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('en-ZA', { maximumFractionDigits: 1 })} MW`;
}

function fmtZarM(n: number | null | undefined): string {
  if (!n) return '—';
  return `R${n.toLocaleString('en-ZA')}m`;
}

function renderDetail(row: AllocationRow): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      <DetailPair label="Connection type"     value={row.connection_type.replace(/_/g, ' ')} />
      <DetailPair label="Technology"          value={row.technology ? row.technology.replace(/_/g, ' ') : '—'} />
      <DetailPair label="Network level"       value={row.network_level ? row.network_level.replace(/_/g, ' ') : '—'} />
      <DetailPair label="Project"             value={row.project_name} />
      <DetailPair label="Location"            value={row.project_location ?? '—'} />
      <DetailPair label="Requested capacity"  value={fmtMw(row.requested_capacity_mw)} />
      <DetailPair label="Granted capacity"    value={fmtMw(row.granted_capacity_mw)} />
      <DetailPair label="Queue rank"          value={row.queue_rank !== null ? `#${row.queue_rank}` : '—'} />
      <DetailPair label="Priority date"       value={row.priority_date ?? '—'} />
      <DetailPair label="Substation"          value={row.substation ?? '—'} />
      <DetailPair label="Supply area"         value={row.supply_area ?? '—'} />
      <DetailPair label="Estimated capex"     value={fmtZarM(row.estimated_capex_zar_m)} />
      <DetailPair label="Operator"            value={row.operator_party_name} />
      <DetailPair label="GCA ref (W28)"       value={row.gca_ref ?? '—'} />
      <DetailPair label="Info-request round"  value={String(row.info_request_round)} />
      <DetailPair label="Screening ref"       value={row.screening_ref ?? '—'} />
      <DetailPair label="Info-request ref"    value={row.info_request_ref ?? '—'} />
      <DetailPair label="Assessment ref"      value={row.assessment_ref ?? '—'} />
      <DetailPair label="Queue ref"           value={row.queue_ref ?? '—'} />
      <DetailPair label="Offer ref"           value={row.offer_ref ?? '—'} />
      <DetailPair label="Reservation ref"     value={row.reservation_ref ?? '—'} />
      <DetailPair label="Allocation ref"      value={row.allocation_ref ?? '—'} />
      <DetailPair label="Regulator ref"       value={row.regulator_ref ?? '—'} />
      <DetailPair label="Reason code"         value={row.reason_code ?? '—'} />
      <DetailPair label="Received"            value={fmtDate(row.application_received_at)} />
      <DetailPair label="Screening"           value={fmtDate(row.completeness_screening_at)} />
      <DetailPair label="Info requested"      value={fmtDate(row.information_requested_at)} />
      <DetailPair label="Assessment"          value={fmtDate(row.capacity_assessment_at)} />
      <DetailPair label="Queue positioned"    value={fmtDate(row.queue_positioned_at)} />
      <DetailPair label="Offer issued"        value={fmtDate(row.offer_issued_at)} />
      <DetailPair label="Capacity reserved"   value={fmtDate(row.capacity_reserved_at)} />
      <DetailPair label="Capacity allocated"  value={fmtDate(row.capacity_allocated_at)} />
      <DetailPair label="Reportable"          value={row.is_reportable ? 'Yes' : 'No'} />
      <DetailPair label="Escalation level"    value={String(row.escalation_level)} />
      {row.source_wave && (
        <DetailPair label="Source wave" value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}`} />
      )}
      {row.application_basis && (
        <div className="col-span-2">
          <DetailPair label="Application basis" value={row.application_basis} />
        </div>
      )}
      {row.screening_basis && (
        <div className="col-span-2">
          <DetailPair label="Screening basis" value={row.screening_basis} />
        </div>
      )}
      {row.info_request_basis && (
        <div className="col-span-2">
          <DetailPair label="Info-request basis" value={row.info_request_basis} />
        </div>
      )}
      {row.assessment_basis && (
        <div className="col-span-2">
          <DetailPair label="Assessment basis" value={row.assessment_basis} />
        </div>
      )}
      {row.queue_basis && (
        <div className="col-span-2">
          <DetailPair label="Queue basis" value={row.queue_basis} />
        </div>
      )}
      {row.offer_basis && (
        <div className="col-span-2">
          <DetailPair label="Offer basis" value={row.offer_basis} />
        </div>
      )}
      {row.reservation_basis && (
        <div className="col-span-2">
          <DetailPair label="Reservation basis" value={row.reservation_basis} />
        </div>
      )}
      {row.allocation_basis && (
        <div className="col-span-2">
          <DetailPair label="Allocation basis" value={row.allocation_basis} />
        </div>
      )}
      {row.relinquish_basis && (
        <div className="col-span-2">
          <DetailPair label="Relinquishment basis" value={row.relinquish_basis} />
        </div>
      )}
      {row.rejection_basis && (
        <div className="col-span-2">
          <DetailPair label="Rejection basis" value={row.rejection_basis} />
        </div>
      )}
      {row.decision_notes && (
        <div className="col-span-2">
          <DetailPair label="Decision notes" value={row.decision_notes} />
        </div>
      )}
    </div>
  );
}

export function GridCapacityChainTab() {
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: AllocationRow[] } & KpiSummary }>('/grid-capacity/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setSummary({
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

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/grid-capacity/chain/${rowId}/${key}`, values);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: AllocationRow; events: ChainEvent[] } }>(
        `/grid-capacity/chain/${id}`
      );
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events || [] }));
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

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: TX1 }}>
            Grid connection capacity allocation &amp; queue management
          </h2>
          <p className="text-xs mt-1" style={{ color: TX2 }}>
            12-stage NERSA Grid Code + NTCSA Interim Capacity Allocation Rules (2024) ·
            application received → completeness screening → capacity assessment → queue positioned →
            offer issued → capacity reserved → capacity allocated. INVERTED SLA: the bigger the
            requested connection, the longer every window. A rejection crosses to the regulator inbox
            for every tier; large + strategic relinquishments and SLA breaches also cross.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <KpiTile label="Total"                   value={summary?.total ?? rows.length} />
        <KpiTile label="Open"                    value={summary?.open_count ?? 0} />
        <KpiTile label="Large / strategic open"  value={summary?.large_open ?? 0}          tone={(summary?.large_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="In offer"                value={summary?.in_offer ?? 0}             tone={(summary?.in_offer ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Allocated"               value={summary?.allocated_count ?? 0}      tone="ok" />
        <KpiTile label="SLA breached"            value={summary?.breached ?? 0}             tone={(summary?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Rejected"                value={summary?.rejected_count ?? 0}       tone={(summary?.rejected_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Relinquished"            value={summary?.relinquished_count ?? 0}   tone={(summary?.relinquished_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Withdrawn"               value={summary?.withdrawn_count ?? 0} />
        <KpiTile label="Lapsed"                  value={summary?.lapsed_count ?? 0} />
        <KpiTile label="Reportable"              value={summary?.reportable_total ?? 0}     tone={(summary?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Requested in queue"      value={fmtMw(summary?.total_requested_mw ?? 0)} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={filter === f.key
              ? { background: ACC, color: '#fff', border: `1px solid ${ACC}` }
              : { background: BG1, color: TX2, border: `1px solid ${BORDER}` }
            }
            className="rounded px-2 py-1 text-[11px] font-medium transition-colors"
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[12px]"
          style={{ borderColor: BAD, background: 'oklch(0.97 0.04 20)', color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-sm"
          style={{ borderColor: BORDER, background: BG1, color: TX2 }}>
          Loading...
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => (
            <ChainCard
              key={row.id}
              item={{ ...row, case_number: row.allocation_number }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={row.applicant_party_name}
              meta={
                <span>
                  {row.capacity_tier.charAt(0).toUpperCase() + row.capacity_tier.slice(1)}
                  {' · '}
                  {row.connection_type.replace(/_/g, ' ')}
                  {row.project_name ? ` · ${row.project_name}` : ''}
                  {' · '}
                  {fmtMw(row.requested_capacity_mw)}
                  {row.is_reportable && (
                    <span style={{ color: BAD, marginLeft: 4 }} title="Reportable to regulator">● Reportable</span>
                  )}
                </span>
              }
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-sm"
              style={{ borderColor: BORDER, background: BG1, color: TX2 }}>
              No capacity allocations match.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div className="rounded border px-3 py-2" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: TX3 }}>{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: TX3 }}>{label}</div>
      <div className="text-[12px]" style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

export default GridCapacityChainTab;
