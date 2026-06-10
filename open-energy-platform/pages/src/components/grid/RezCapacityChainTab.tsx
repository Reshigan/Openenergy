// Wave 94 — NTCSA Renewable-Energy-Zone (REZ) Capacity Allocation & Competitive
// Auction tab. The COMPETITIVE-ZONAL-ALLOCATION layer of a best-in-class system-
// operator stack. W58 grid-capacity-allocation is the generic FCFS queue; W28
// GCA the physical connection; W75 connection-energization the energization gate
// — W94 inserts the COMPETITIVE ZONAL AUCTION between them. Beats AEMO REZ /
// NYISO TPP / CAISO TPP / ERCOT CREZ / EU TYNDP / ENTSO-E TYNDP / NGESO HND /
// Hydro Quebec MRC via LIVE-scored ZONE-HEADROOM + multi-criteria WEIGHTED
// SCORE (price 0.50 + B-BBEE 0.20 + ED 0.15 + local-content 0.15 per DMRE 40%)
// + COMPETITION-RATIO + MILESTONE-COMPLIANCE % + FORFEIT-RATE % + PREDICTED-
// OPERATION-DATE.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'announcement_published' | 'application_submitted' | 'compliance_check'
  | 'shortlisted' | 'evaluation_complete' | 'award_proposed'
  | 'capacity_awarded' | 'financial_close_met' | 'construction_in_progress'
  | 'in_operation' | 'rejected' | 'forfeit' | 'withdrawn';

type Tier = 'minor' | 'standard' | 'material' | 'mega';

interface AllocationRow {
  id: string;
  allocation_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  trigger_kind: string | null;
  applicant_party_id: string;
  applicant_party_name: string | null;
  applicant_persona: string | null;
  applicant_contact: string | null;
  bbbee_level: number | null;
  allocation_class: string;
  zone_code: string;
  zone_name: string | null;
  technology: string | null;
  capacity_tier: Tier;
  authority_required: string | null;
  requested_capacity_mw: number;
  awarded_capacity_mw: number | null;
  zone_total_capacity_mw: number;
  zone_allocated_to_date_mw: number;
  zone_lots_available: number;
  zone_applications_in_round: number;
  zone_forfeit_to_date_mw: number;
  bid_price_zar_per_mwh: number;
  price_floor_zar_per_mwh: number;
  price_ceiling_zar_per_mwh: number;
  bbbee_score: number | null;
  ed_score: number | null;
  local_content_pct: number | null;
  weighted_score: number | null;
  award_clearance_price_zar_per_mw: number | null;
  financial_close_target_at: string | null;
  financial_close_actual_at: string | null;
  construction_start_target_at: string | null;
  construction_start_actual_at: string | null;
  operation_target_at: string | null;
  operation_actual_at: string | null;
  milestones_total: number;
  milestones_met_on_time: number;
  application_basis: string | null;
  evaluation_basis: string | null;
  award_basis: string | null;
  rejection_basis: string | null;
  forfeit_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  chain_status: ChainStatus;
  announcement_published_at: string;
  application_submitted_at: string | null;
  compliance_check_at: string | null;
  shortlisted_at: string | null;
  evaluation_complete_at: string | null;
  award_proposed_at: string | null;
  capacity_awarded_at: string | null;
  financial_close_met_at: string | null;
  construction_in_progress_at: string | null;
  in_operation_at: string | null;
  rejected_at: string | null;
  forfeit_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  // live-decorated
  is_terminal: boolean;
  minutes_until_sla: number | null;
  sla_breached: boolean;
  sla_window_minutes: number;
  urgency_band: 'overdue' | 'urgent' | 'due_soon' | 'on_track' | 'closed';
  is_reportable_flag: boolean;
  high_tier_flag: boolean;
  floor_at_mega_class_flag: boolean;
  signature_class_flag: boolean;
  authority_required_live: string | null;
  effective_capacity_mw_live: number;
  tier_live: Tier;
  remaining_headroom_mw_live: number;
  competition_ratio_live: number;
  competition_intensity_band_live: 'low' | 'moderate' | 'high';
  price_score_live: number;
  local_content_score_live: number;
  weighted_score_live: number;
  local_content_meets_threshold_flag: boolean;
  milestone_compliance_pct_live: number;
  forfeit_rate_pct_live: number;
  predicted_operation_date_live: string | null;
  inbox_severity_live: 'low' | 'medium' | 'high' | 'critical';
  reportable_per_spec: boolean;
}

interface EventRow {
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
  in_operation_count: number;
  awarded_count: number;
  rejected_count: number;
  forfeit_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  signature_count: number;
  floor_applied_count: number;
  local_content_meets_count: number;
  total_requested_mw: number;
  total_awarded_mw: number;
  total_forfeit_mw: number;
  total_headroom_mw: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  announcement_published:   { bg: '#e3e7ec', fg: '#557',    label: 'Announcement published' },
  application_submitted:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Application submitted' },
  compliance_check:         { bg: '#dbecfb', fg: '#1a3a5c', label: 'Compliance check' },
  shortlisted:              { bg: '#fff4d6', fg: '#a06200', label: 'Shortlisted' },
  evaluation_complete:      { bg: '#fff4d6', fg: '#a06200', label: 'Evaluation complete' },
  award_proposed:           { bg: '#ffe4b5', fg: '#8a4a00', label: 'Award proposed' },
  capacity_awarded:         { bg: '#d4edda', fg: '#155724', label: 'Capacity awarded' },
  financial_close_met:      { bg: '#d4edda', fg: '#155724', label: 'Financial close met' },
  construction_in_progress: { bg: '#d4edda', fg: '#155724', label: 'Construction in progress' },
  in_operation:             { bg: '#d4edda', fg: '#155724', label: 'In commercial operation' },
  rejected:                 { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rejected' },
  forfeit:                  { bg: '#fde0e0', fg: '#9b1f1f', label: 'Forfeit (capacity recycled)' },
  withdrawn:                { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  mega:     { bg: '#fde0e0', fg: '#9b1f1f', label: 'Mega (≥500MW)' },
  material: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Material (250-500MW)' },
  standard: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard (50-250MW)' },
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor (<50MW)' },
};

const AUTHORITY_LABEL: Record<string, string> = {
  compliance_officer:    'Compliance officer',
  evaluation_panel:      'Evaluation panel',
  council_subcommittee:  'Council sub-committee',
  full_council:          'Full Council',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                    label: 'Open' },
  { key: 'all',                     label: 'All' },
  { key: 'mega',                    label: 'Mega' },
  { key: 'material',                label: 'Material' },
  { key: 'standard',                label: 'Standard' },
  { key: 'minor',                   label: 'Minor' },
  { key: 'application_submitted',   label: 'Applications' },
  { key: 'evaluation_complete',     label: 'Evaluation' },
  { key: 'capacity_awarded',        label: 'Awarded' },
  { key: 'construction_in_progress', label: 'Construction' },
  { key: 'in_operation',            label: 'In operation' },
  { key: 'rejected',                label: 'Rejected' },
  { key: 'forfeit',                 label: 'Forfeit' },
  { key: 'signature',               label: 'Floor-at-mega class' },
  { key: 'breached',                label: 'SLA breached' },
  { key: 'reportable',              label: 'Reportable' },
];

type ActionKind =
  | 'submit-application' | 'check-compliance' | 'shortlist' | 'complete-evaluation'
  | 'propose-award' | 'award-capacity' | 'meet-financial-close' | 'start-construction'
  | 'confirm-operation' | 'reject-application' | 'forfeit-allocation' | 'withdraw';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  announcement_published:   'submit-application',
  application_submitted:    'check-compliance',
  compliance_check:         'shortlist',
  shortlisted:              'complete-evaluation',
  evaluation_complete:      'propose-award',
  award_proposed:           'award-capacity',
  capacity_awarded:         'meet-financial-close',
  financial_close_met:      'start-construction',
  construction_in_progress: 'confirm-operation',
  in_operation:             null,
  rejected:                 null,
  forfeit:                  null,
  withdrawn:                null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'submit-application':    'Submit application (applicant)',
  'check-compliance':      'Check compliance (compliance officer)',
  'shortlist':             'Shortlist (compliance officer)',
  'complete-evaluation':   'Complete evaluation (panel)',
  'propose-award':         'Propose award (Council)',
  'award-capacity':        'Award capacity (Council) — W94 SIGNATURE',
  'meet-financial-close':  'Mark financial close met',
  'start-construction':    'Start construction',
  'confirm-operation':     'Confirm commercial operation (SO)',
  'reject-application':    'Reject application',
  'forfeit-allocation':    'Forfeit allocation — capacity recycled',
  'withdraw':              'Withdraw',
};

const SECONDARY_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  announcement_published:   ['withdraw'],
  application_submitted:    ['reject-application', 'withdraw'],
  compliance_check:         ['reject-application', 'withdraw'],
  shortlisted:              ['reject-application', 'withdraw'],
  evaluation_complete:      ['reject-application', 'withdraw'],
  award_proposed:           ['reject-application', 'withdraw'],
  capacity_awarded:         ['forfeit-allocation', 'withdraw'],
  financial_close_met:      ['forfeit-allocation', 'withdraw'],
  construction_in_progress: ['forfeit-allocation', 'withdraw'],
  in_operation:             [],
  rejected:                 [],
  forfeit:                  [],
  withdrawn:                [],
};

const DESTRUCTIVE: ActionKind[] = ['award-capacity', 'reject-application', 'forfeit-allocation', 'withdraw'];

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtMw(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${v.toLocaleString('en-ZA', { maximumFractionDigits: 1 })}MW`;
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtScore(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-ZA', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

const TERMINAL_STATES: ChainStatus[] = ['in_operation', 'rejected', 'forfeit', 'withdrawn'];

export function RezCapacityChainTab() {
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<AllocationRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: AllocationRow[] } & KpiSummary }>('/grid/rez-capacity/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total,
          open_count: d.open_count, in_operation_count: d.in_operation_count,
          awarded_count: d.awarded_count, rejected_count: d.rejected_count,
          forfeit_count: d.forfeit_count, withdrawn_count: d.withdrawn_count,
          breached: d.breached, reportable_total: d.reportable_total,
          signature_count: d.signature_count, floor_applied_count: d.floor_applied_count,
          local_content_meets_count: d.local_content_meets_count,
          total_requested_mw: d.total_requested_mw,
          total_awarded_mw: d.total_awarded_mw,
          total_forfeit_mw: d.total_forfeit_mw,
          total_headroom_mw: d.total_headroom_mw,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load REZ allocations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { allocation: AllocationRow; events: EventRow[] } }>(`/grid/rez-capacity/chain/${id}`);
      if (res.data?.data?.allocation) setSelected(res.data.data.allocation);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load allocation history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'open')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable_flag;
      if (filter === 'signature')  return r.signature_class_flag;
      if (['minor', 'standard', 'material', 'mega'].includes(filter)) {
        return r.capacity_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: AllocationRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'submit-application') {
        const name = window.prompt('Applicant party name:', row.applicant_party_name ?? '') || '';
        const mw = window.prompt('Requested capacity (MW) — tier MW-magnitude-derived:', String(row.requested_capacity_mw || 0)) || '';
        const price = window.prompt('Bid price (ZAR/MWh) — weight 0.50 in REIPPPP score:', String(row.bid_price_zar_per_mwh || 0)) || '';
        const bbbee = window.prompt('B-BBEE score (0-100) — weight 0.20:', String(row.bbbee_score ?? 0)) || '';
        const ed = window.prompt('ED score (0-100) — weight 0.15:', String(row.ed_score ?? 0)) || '';
        const local = window.prompt('Local-content % — weight 0.15; DMRE 40% threshold for full credit:', String(row.local_content_pct ?? 0)) || '';
        const basis = window.prompt('Application basis:') || '';
        body = { application_basis: basis };
        if (name) body.applicant_party_name = name;
        if (mw && !Number.isNaN(Number(mw))) body.requested_capacity_mw = Number(mw);
        if (price && !Number.isNaN(Number(price))) body.bid_price_zar_per_mwh = Number(price);
        if (bbbee && !Number.isNaN(Number(bbbee))) body.bbbee_score = Number(bbbee);
        if (ed && !Number.isNaN(Number(ed))) body.ed_score = Number(ed);
        if (local && !Number.isNaN(Number(local))) body.local_content_pct = Number(local);
      } else if (action === 'check-compliance') {
        const ref = window.prompt('Evaluation reference:') || '';
        const basis = window.prompt('Compliance check basis — what was checked (DMRE rules, NTCSA Rules 2024 sub-100MW=30d):') || '';
        body = {};
        if (ref) body.evaluation_ref = ref;
        if (basis) body.evaluation_basis = basis;
      } else if (action === 'shortlist') {
        const ref = window.prompt('Shortlist reference:') || '';
        const notes = window.prompt('Shortlist notes — competition ratio band:') || '';
        body = {};
        if (ref) body.evaluation_ref = ref;
        if (notes) body.notes = notes;
      } else if (action === 'complete-evaluation') {
        const score = window.prompt('Weighted score (0-1) — REIPPPP price 0.50 + B-BBEE 0.20 + ED 0.15 + local 0.15:', String(row.weighted_score_live ?? row.weighted_score ?? 0)) || '';
        const ref = window.prompt('Evaluation reference:') || '';
        const basis = window.prompt('Evaluation basis — multi-criteria scoring summary (mega crosses public scrutiny):');
        if (!basis) return;
        body = { evaluation_basis: basis };
        if (score && !Number.isNaN(Number(score))) body.weighted_score = Number(score);
        if (ref) body.evaluation_ref = ref;
      } else if (action === 'propose-award') {
        const mw = window.prompt('Awarded capacity (MW) — may be less than requested:', String(row.requested_capacity_mw || 0)) || '';
        const clearance = window.prompt('Award clearance price (ZAR/MW):', String(row.award_clearance_price_zar_per_mw ?? 0)) || '';
        const ref = window.prompt('Award reference:') || '';
        const basis = window.prompt('Award basis — reasons for proposed quantum:');
        if (!basis) return;
        body = { award_basis: basis };
        if (mw && !Number.isNaN(Number(mw))) body.awarded_capacity_mw = Number(mw);
        if (clearance && !Number.isNaN(Number(clearance))) body.award_clearance_price_zar_per_mw = Number(clearance);
        if (ref) body.award_ref = ref;
      } else if (action === 'award-capacity') {
        const mw = window.prompt('Confirmed awarded capacity (MW) — W94 SIGNATURE (every tier crosses regulator):', String(row.awarded_capacity_mw ?? row.requested_capacity_mw ?? 0));
        if (!mw) return;
        const fc = window.prompt('Financial close target (YYYY-MM-DD):') || '';
        const cs = window.prompt('Construction start target (YYYY-MM-DD):') || '';
        const op = window.prompt('Commercial operation target (YYYY-MM-DD):') || '';
        const milestones = window.prompt('Total milestones to track:', String(row.milestones_total || 6)) || '6';
        const ref = window.prompt('Award reference:') || '';
        const reg = window.prompt('Regulator reference (every award is publicly registered):') || '';
        body = { awarded_capacity_mw: Number(mw) || 0 };
        if (fc) body.financial_close_target_at = fc;
        if (cs) body.construction_start_target_at = cs;
        if (op) body.operation_target_at = op;
        if (milestones && !Number.isNaN(Number(milestones))) body.milestones_total = Number(milestones);
        if (ref) body.award_ref = ref;
        if (reg) body.regulator_ref = reg;
      } else if (action === 'meet-financial-close') {
        const ref = window.prompt('Financial close reference:') || '';
        const actual = window.prompt('Financial close actual date (YYYY-MM-DD):') || '';
        body = {};
        if (ref) body.fc_ref = ref;
        if (actual) body.financial_close_actual_at = actual;
      } else if (action === 'start-construction') {
        const ref = window.prompt('Construction reference:') || '';
        const actual = window.prompt('Construction start actual date (YYYY-MM-DD):') || '';
        body = {};
        if (ref) body.construction_ref = ref;
        if (actual) body.construction_start_actual_at = actual;
      } else if (action === 'confirm-operation') {
        const ref = window.prompt('Operation reference:') || '';
        const actual = window.prompt('Commercial operation actual date (YYYY-MM-DD):') || '';
        const energ = window.prompt('Energization reference (W75 link):') || '';
        const gca = window.prompt('GCA reference (W28 link):') || '';
        body = {};
        if (ref) body.operation_ref = ref;
        if (actual) body.operation_actual_at = actual;
        if (energ) body.energization_ref = energ;
        if (gca) body.gca_ref = gca;
      } else if (action === 'reject-application') {
        const basis = window.prompt('Rejection basis — SO denial at compliance/evaluation/award:');
        if (!basis) return;
        const ref = window.prompt('Rejection reference:') || '';
        body = { rejection_basis: basis, reason_code: 'rejected' };
        if (ref) body.rejection_ref = ref;
      } else if (action === 'forfeit-allocation') {
        const basis = window.prompt('Forfeit basis — milestone failure; capacity recycled into the zone pool (W94 SIGNATURE crosses regulator every tier):');
        if (!basis) return;
        const ref = window.prompt('Forfeit reference:') || '';
        body = { forfeit_basis: basis, reason_code: 'forfeit' };
        if (ref) body.forfeit_ref = ref;
      } else if (action === 'withdraw') {
        const basis = window.prompt('Withdrawal basis:');
        if (!basis) return;
        body = { withdrawal_basis: basis, reason_code: 'withdrawn' };
      }
      await api.post(`/grid/rez-capacity/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">REZ capacity allocation &amp; competitive auction (NTCSA 2024)</h2>
          <p className="text-xs text-[#4a5568]">
            12-state competitive-auction chain · announcement_published → application_submitted →
            compliance_check → shortlisted → evaluation_complete → award_proposed → capacity_awarded
            → financial_close_met → construction_in_progress → in_operation (terminal). Branches:
            rejected (SO denial at compliance/evaluation/award), forfeit (milestone failure — capacity
            recycled back into the zone pool), withdrawn. The COMPETITIVE-ZONAL-ALLOCATION layer of a
            best-in-class system-operator stack downstream of NTCSA / CSIR REZ identification and
            upstream of W58 generic-queue / W28 GCA / W75 energization. The DIFFERENTIATOR over AEMO
            REZ / NYISO TPP / CAISO TPP / ERCOT CREZ / EU TYNDP / ENTSO-E TYNDP / NGESO Holistic Network
            Design / Hydro Quebec MRC — most run REZ auctions on spreadsheets and never recycle forfeit
            MW: every allocation is LIVE-scored every fetch against ZONE-HEADROOM (configured ceiling
            vs allocated-to-date MW), a REIPPPP-style multi-criteria WEIGHTED SCORE (price 0.50 + B-BBEE
            0.20 + ED 0.15 + local-content 0.15 per the DMRE 40% local-content rule), a COMPETITION-RATIO
            from applications-per-lot, a MILESTONE-COMPLIANCE %, a FORFEIT-RATE per zone, and a
            PREDICTED-OPERATION-DATE rolling forward from current state. Tier is MW-MAGNITUDE-DERIVED
            on every transition (minor &lt;50MW / standard 50-250MW / material 250-500MW / mega ≥500MW)
            with FLOOR-AT-MEGA for allocation_class IN (priority_zone, constraint_relief_zone,
            jet_program_zone). INVERTED SLA — a larger allocation gets MORE procedural time per NTCSA
            Rules 2024 (30d compliance for sub-100MW; mega 120d; construction milestone caps 3yr). The
            W94 SIGNATURE — award_capacity and forfeit_allocation cross regulator EVERY tier (public
            capacity-allocation register; sister of W93 impose_penalty).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total allocations" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="In operation" value={kpis?.in_operation_count ?? 0} tone="ok" />
        <Kpi label="Awarded" value={kpis?.awarded_count ?? 0} tone="ok" />
        <Kpi label="Rejected" value={kpis?.rejected_count ?? 0} tone={(kpis?.rejected_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Forfeit (recycled)" value={kpis?.forfeit_count ?? 0} tone={(kpis?.forfeit_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Floor-at-mega" value={kpis?.floor_applied_count ?? 0} tone={(kpis?.floor_applied_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="DMRE local-content met" value={kpis?.local_content_meets_count ?? 0} tone="ok" />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Total awarded" value={fmtMw(kpis?.total_awarded_mw)} />
        <Kpi label="Forfeit MW" value={fmtMw(kpis?.total_forfeit_mw)} tone={(kpis?.total_forfeit_mw ?? 0) > 0 ? 'warn' : 'ok'} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Allocation #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Applicant / zone / tech</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Class</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Requested</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Awarded</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Score</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.capacity_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.allocation_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable (public capacity register)">●</span>}
                      {r.signature_class_flag && <span className="ml-1 text-[#9b1f1f]" title="Floor-at-mega class (priority_zone / constraint_relief_zone / jet_program_zone)">★</span>}
                      {r.local_content_meets_threshold_flag && <span className="ml-1 text-[#155724]" title="DMRE 40% local-content threshold met">▲</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[280px] truncate" title={`${r.applicant_party_name ?? ''} · ${r.zone_name ?? r.zone_code} · ${r.technology ?? ''}`}>
                      {r.applicant_party_name ?? '—'}
                      <span className="text-[#4a5568]"> · {r.zone_name ?? r.zone_code} · {r.technology ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[#4a5568]">{r.allocation_class}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {r.capacity_tier}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#0c2a4d]">{fmtMw(r.requested_capacity_mw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#0c2a4d]">{fmtMw(r.awarded_capacity_mw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#0c2a4d]">{fmtScore(r.weighted_score_live ?? r.weighted_score)}</td>
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
                <tr><td colSpan={9} className="px-3 py-6 text-center text-[#4a5568]">No allocations match.</td></tr>
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
  events: EventRow[];
  onClose: () => void;
  onAct: (action: ActionKind, row: AllocationRow) => void;
}) {
  const primary = ACTION_FOR_STATE[row.chain_status];
  const secondary = SECONDARY_ACTIONS[row.chain_status];
  const authority = AUTHORITY_LABEL[row.authority_required_live ?? row.authority_required ?? ''] ?? (row.authority_required ?? '—');

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[760px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.allocation_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">
                {row.applicant_party_name ?? '—'} · {row.zone_name ?? row.zone_code} · {row.technology ?? '—'}
              </div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.capacity_tier].label}
                {row.allocation_class ? ` · ${row.allocation_class}` : ''}
                {row.applicant_persona ? ` · ${row.applicant_persona}` : ''}
                {row.bbbee_level != null ? ` · B-BBEE L${row.bbbee_level}` : ''}
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
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Live zone-headroom &amp; competition battery</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Zone total" value={fmtMw(row.zone_total_capacity_mw)} hint="Configured ceiling" />
              <Metric label="Zone allocated to date" value={fmtMw(row.zone_allocated_to_date_mw)} />
              <Metric label="Remaining headroom (live)" value={fmtMw(row.remaining_headroom_mw_live)} bad={row.remaining_headroom_mw_live <= 0} hint="Ceiling − allocated" />
              <Metric label="Zone forfeit to date" value={fmtMw(row.zone_forfeit_to_date_mw)} bad={row.zone_forfeit_to_date_mw > 0} hint="Recycled back into pool" />
              <Metric label="Lots available" value={fmtNum(row.zone_lots_available, 0)} />
              <Metric label="Applications in round" value={fmtNum(row.zone_applications_in_round, 0)} />
              <Metric label="Competition ratio (live)" value={fmtNum(row.competition_ratio_live, 2)} hint="Applications ÷ lots" />
              <Metric label="Competition intensity" value={row.competition_intensity_band_live} />
              <Metric label="Tier (live)" value={(row.tier_live ?? row.capacity_tier).toString()} hint="MW-magnitude-derived, re-derived every fetch" />
              <Metric label="Floor at mega" value={row.floor_at_mega_class_flag ? 'Yes' : 'No'} bad={!!row.floor_at_mega_class_flag} hint="priority_zone / constraint_relief_zone / jet_program_zone" />
              <Metric label="Forfeit rate %" value={fmtPct(row.forfeit_rate_pct_live, 1)} bad={(row.forfeit_rate_pct_live ?? 0) > 0} />
              <Metric label="Authority required" value={authority} />
            </div>
          </div>
          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">REIPPPP multi-criteria score (price 0.50 + B-BBEE 0.20 + ED 0.15 + local-content 0.15)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Bid price (ZAR/MWh)" value={fmtNum(row.bid_price_zar_per_mwh, 0)} hint="Lower=better" />
              <Metric label="Price floor / ceiling" value={`${fmtNum(row.price_floor_zar_per_mwh, 0)} / ${fmtNum(row.price_ceiling_zar_per_mwh, 0)}`} />
              <Metric label="Price score (live)" value={fmtScore(row.price_score_live)} hint="Inverted/clamped to [0,1]" />
              <Metric label="B-BBEE score (raw)" value={fmtScore((row.bbbee_score ?? 0) / 100)} />
              <Metric label="ED score (raw)" value={fmtScore((row.ed_score ?? 0) / 100)} />
              <Metric label="Local content %" value={fmtPct(row.local_content_pct, 1)} hint="DMRE 40% threshold" />
              <Metric label="Local content score (live)" value={fmtScore(row.local_content_score_live)} hint="Full credit at ≥40%" />
              <Metric label="Local content threshold" value={row.local_content_meets_threshold_flag ? 'MET' : 'Below'} bad={!row.local_content_meets_threshold_flag} />
              <Metric label="Weighted score (live)" value={fmtScore(row.weighted_score_live)} hint="Σ weight × score; weights sum to 1.00" />
              <Metric label="Weighted score (saved)" value={fmtScore(row.weighted_score)} />
              <Metric label="Clearance ZAR/MW" value={fmtNum(row.award_clearance_price_zar_per_mw, 0)} />
              <Metric label="Predicted operation" value={fmtDate(row.predicted_operation_date_live)} hint="Rolling forward from current state" />
            </div>
          </div>
          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Milestone tracking</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Effective capacity (live)" value={fmtMw(row.effective_capacity_mw_live)} hint="Awarded preferred over requested" />
              <Metric label="Requested" value={fmtMw(row.requested_capacity_mw)} />
              <Metric label="Awarded" value={fmtMw(row.awarded_capacity_mw)} />
              <Metric label="FC target / actual" value={`${fmtDate(row.financial_close_target_at)} / ${fmtDate(row.financial_close_actual_at)}`} />
              <Metric label="Construction target / actual" value={`${fmtDate(row.construction_start_target_at)} / ${fmtDate(row.construction_start_actual_at)}`} />
              <Metric label="Operation target / actual" value={`${fmtDate(row.operation_target_at)} / ${fmtDate(row.operation_actual_at)}`} />
              <Metric label="Milestones met / total" value={`${row.milestones_met_on_time} / ${row.milestones_total}`} />
              <Metric label="Milestone compliance % (live)" value={fmtPct(row.milestone_compliance_pct_live, 1)} bad={row.milestone_compliance_pct_live < 100 && row.milestones_total > 0} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"                value={STATE_TONE[row.chain_status].label} />
            <Pair label="Capacity tier"        value={TIER_TONE[row.capacity_tier].label} />
            <Pair label="Allocation class"     value={row.allocation_class} />
            <Pair label="Zone"                 value={`${row.zone_name ?? row.zone_code} (${row.zone_code})`} />
            <Pair label="Technology"           value={row.technology ?? '—'} />
            <Pair label="Applicant"            value={row.applicant_party_name ?? '—'} />
            <Pair label="B-BBEE level"         value={row.bbbee_level != null ? `Level ${row.bbbee_level}` : '—'} />
            <Pair label="Inbox severity (live)" value={row.inbox_severity_live} />
            <Pair label="Announcement published" value={fmtDate(row.announcement_published_at)} />
            <Pair label="Application submitted" value={fmtDate(row.application_submitted_at)} />
            <Pair label="Compliance check"     value={fmtDate(row.compliance_check_at)} />
            <Pair label="Shortlisted"          value={fmtDate(row.shortlisted_at)} />
            <Pair label="Evaluation complete"  value={fmtDate(row.evaluation_complete_at)} />
            <Pair label="Award proposed"       value={fmtDate(row.award_proposed_at)} />
            <Pair label="Capacity awarded"     value={fmtDate(row.capacity_awarded_at)} />
            <Pair label="Financial close met"  value={fmtDate(row.financial_close_met_at)} />
            <Pair label="Construction in progress" value={fmtDate(row.construction_in_progress_at)} />
            <Pair label="In operation"         value={fmtDate(row.in_operation_at)} />
            <Pair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"           value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"       value={String(row.escalation_level)} />
            <Pair label="Reportable"           value={row.is_reportable_flag ? 'Yes (public register)' : 'No'} />
          </div>
          {row.application_basis && <BasisBlock label="Application basis" tone="#1a3a5c" text={row.application_basis} />}
          {row.evaluation_basis && <BasisBlock label="Evaluation basis" tone="#8a4a00" text={row.evaluation_basis} />}
          {row.award_basis && <BasisBlock label="Award basis" tone="#155724" text={row.award_basis} />}
          {row.rejection_basis && <BasisBlock label="Rejection basis" tone="#9b1f1f" text={row.rejection_basis} />}
          {row.forfeit_basis && <BasisBlock label="Forfeit basis (capacity recycled)" tone="#9b1f1f" text={row.forfeit_basis} />}
          {row.withdrawal_basis && <BasisBlock label="Withdrawal basis" tone="#557" text={row.withdrawal_basis} />}
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

function Metric({ label, value, bad, hint }: { label: string; value: string; bad?: boolean; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className={`text-[13px] font-semibold tabular-nums ${bad ? 'text-[#9b1f1f]' : 'text-[#0c2a4d]'}`}>{value}</div>
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
