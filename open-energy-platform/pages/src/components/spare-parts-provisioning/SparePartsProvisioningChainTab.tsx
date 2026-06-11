// Wave 72 — OEM-Support Spare-Parts Provisioning & Replenishment tab.
//
// The service-parts-planning brain of the OEM-Support profile: puts the right
// spare in the right warehouse BEFORE the asset needs it, then runs the
// requisition → purchase → receive → incoming-QA → stock → reserve → issue
// lifecycle for one provisioning line. The materials backbone under every other
// support chain — W16 consumes a part, W15 returns one, W63 chases its cost —
// but none plan or replenish inventory; W72 is that layer.
//
// DISTINCTIVE move (beat Syncron / Baxter / SAP SPP / Servigistics): demand is
// PREDICTIVE — a line can be raised PRE-FAILURE off the W71 RUL signal
// (demand_source = predictive_rul) so the part is pre-positioned before the
// breakdown. URGENT criticality-tiered SLAs with auto-expedite on backorder, a
// reverse-logistics incoming-QA gate (received → stocked OR returned), and a
// quantified stockout-avoidance / working-capital ledger. Reportable to the
// regulator inbox is AVAILABILITY-RISK-driven: a backorder on a vital high-impact
// line (or any catastrophic stockout) crosses; cancelling a vital high-impact
// line crosses; SLA breach crosses for the HIGH tiers. SANS/IEC 62402 + VED.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'demand_identified' | 'requisition_raised' | 'requisition_approved' | 'po_issued'
  | 'backordered' | 'in_transit' | 'received' | 'stocked' | 'reserved' | 'issued'
  | 'returned' | 'cancelled';

type Tier = 'routine' | 'standard' | 'important' | 'critical' | 'catastrophic';
type Criticality = 'vital' | 'essential' | 'desirable';
type DemandSource = 'predictive_rul' | 'work_order' | 'reorder_point' | 'manual' | 'rma_replacement';

interface ProvisioningRow {
  [key: string]: unknown;
  id: string;
  line_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  demand_source: DemandSource;
  part_number: string;
  part_description: string | null;
  oem_name: string | null;
  asset_name: string | null;
  site_name: string | null;
  warehouse: string | null;
  supplier_party_id: string | null;
  supplier_party_name: string | null;
  criticality: Criticality;
  qty_required: number;
  qty_ordered: number | null;
  qty_received: number | null;
  qty_on_hand: number;
  unit_cost_zar: number | null;
  daily_demand: number | null;
  demand_std_dev: number | null;
  lead_time_days: number;
  service_z_factor: number | null;
  reorder_point: number | null;
  safety_stock: number | null;
  rul_days: number | null;
  predictive_lead_days: number | null;
  downtime_cost_per_hour_zar: number | null;
  stockout_impact_zar: number;
  stockout_avoidance_zar: number | null;
  carried_inventory_zar: number | null;
  working_capital_efficiency: number | null;
  fill_rate: number | null;
  provisioning_tier: Tier;
  reserved_for_wo: string | null;
  backorder_round: number;
  requisition_basis: string | null;
  approval_basis: string | null;
  po_basis: string | null;
  backorder_basis: string | null;
  expedite_basis: string | null;
  shipment_basis: string | null;
  inspection_basis: string | null;
  rejection_basis: string | null;
  reservation_basis: string | null;
  issue_basis: string | null;
  cancellation_basis: string | null;
  demand_basis: string | null;
  regulator_ref: string | null;
  reason_code: string | null;
  notes: string | null;
  chain_status: ChainStatus;
  demand_identified_at: string;
  requisition_raised_at: string | null;
  requisition_approved_at: string | null;
  po_issued_at: string | null;
  backordered_at: string | null;
  in_transit_at: string | null;
  received_at: string | null;
  stocked_at: string | null;
  reserved_at: string | null;
  issued_at: string | null;
  returned_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
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
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
}

interface ProvisioningEvent {
  id: string;
  provisioning_id: string;
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
  backordered_count: number;
  in_transit_count: number;
  issued_count: number;
  returned_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  vital_open: number;
  predictive_count: number;
  total_stockout_impact_zar: number;
  total_stockout_avoidance_zar: number;
  total_carried_inventory_zar: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  demand_identified:    { bg: '#e3e7ec', fg: '#557',    label: 'Demand identified' },
  requisition_raised:   { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Requisition raised' },
  requisition_approved: { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Requisition approved' },
  po_issued:            { bg: '#fff4d6', fg: '#a06200', label: 'PO issued' },
  backordered:          { bg: '#fde0e0', fg: '#9b1f1f', label: 'Backordered' },
  in_transit:           { bg: '#ffe9d6', fg: '#8a4a00', label: 'In transit' },
  received:             { bg: '#ffe9d6', fg: '#8a4a00', label: 'Received (QA)' },
  stocked:              { bg: '#daf5e2', fg: '#1f6b3a', label: 'Stocked' },
  reserved:             { bg: '#daf5e2', fg: '#1f6b3a', label: 'Reserved' },
  issued:               { bg: '#d4edda', fg: '#155724', label: 'Issued' },
  returned:             { bg: '#fde0e0', fg: '#9b1f1f', label: 'Returned (QA fail)' },
  cancelled:            { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  catastrophic: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Catastrophic' },
  critical:     { bg: '#ffe4b5', fg: '#8a4a00', label: 'Critical' },
  important:    { bg: '#fff4d6', fg: '#a06200', label: 'Important' },
  standard:     { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Standard' },
  routine:      { bg: '#e3e7ec', fg: '#557',    label: 'Routine' },
};

const CRIT_TONE: Record<Criticality, { bg: string; fg: string; label: string }> = {
  vital:     { bg: '#fde0e0', fg: '#9b1f1f', label: 'Vital' },
  essential: { bg: '#fff4d6', fg: '#a06200', label: 'Essential' },
  desirable: { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Desirable' },
};

const SOURCE_LABEL: Record<DemandSource, string> = {
  predictive_rul: 'Predictive (RUL)',
  work_order:     'Work order',
  reorder_point:  'Reorder point',
  manual:         'Manual',
  rma_replacement: 'RMA replacement',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',          label: 'Active' },
  { key: 'all',             label: 'All' },
  { key: 'catastrophic',    label: 'Catastrophic' },
  { key: 'critical',        label: 'Critical' },
  { key: 'important',       label: 'Important' },
  { key: 'standard',        label: 'Standard' },
  { key: 'routine',         label: 'Routine' },
  { key: 'vital',           label: 'Vital' },
  { key: 'predictive_rul',  label: 'Predictive' },
  { key: 'backordered',     label: 'Backordered' },
  { key: 'in_transit',      label: 'In transit' },
  { key: 'breached',        label: 'SLA breached' },
  { key: 'reportable',      label: 'Reportable' },
  { key: 'issued',          label: 'Issued' },
  { key: 'returned',        label: 'Returned' },
  { key: 'cancelled',       label: 'Cancelled' },
];

type ActionKind =
  | 'raise-requisition' | 'approve-requisition' | 'issue-po' | 'flag-backorder'
  | 'expedite-backorder' | 'confirm-shipment' | 'receive-goods' | 'pass-inspection'
  | 'reject-inspection' | 'reserve-stock' | 'issue-part' | 'cancel-provisioning';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  demand_identified:    'raise-requisition',
  requisition_raised:   'approve-requisition',
  requisition_approved: 'issue-po',
  po_issued:            'confirm-shipment',
  backordered:          'expedite-backorder',
  in_transit:           'receive-goods',
  received:             'pass-inspection',
  stocked:              'reserve-stock',
  reserved:             'issue-part',
  issued:               null,
  returned:             null,
  cancelled:            null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'raise-requisition':   'Raise requisition (planner)',
  'approve-requisition': 'Approve requisition (planner)',
  'issue-po':            'Issue purchase order (buyer)',
  'flag-backorder':      'Flag backorder (supplier)',
  'expedite-backorder':  'Expedite backorder (buyer)',
  'confirm-shipment':    'Confirm shipment (supplier)',
  'receive-goods':       'Receive goods (warehouse)',
  'pass-inspection':     'Pass incoming QA (warehouse)',
  'reject-inspection':   'Reject incoming QA (warehouse)',
  'reserve-stock':       'Reserve stock (warehouse)',
  'issue-part':          'Issue part to WO (warehouse)',
  'cancel-provisioning': 'Cancel provisioning (planner)',
};

// Pre-receipt planning/ordering states where the line can be cancelled.
const CANCEL_STATES: ChainStatus[] = [
  'demand_identified', 'requisition_raised', 'requisition_approved', 'po_issued', 'backordered',
];

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

const TERMINAL_STATES: ChainStatus[] = ['issued', 'returned', 'cancelled'];

export function SparePartsProvisioningChainTab() {
  const [rows, setRows] = useState<ProvisioningRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<ProvisioningRow | null>(null);
  const [events, setEvents] = useState<ProvisioningEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ProvisioningRow[] } & KpiSummary }>('/spare-parts-provisioning/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, backordered_count: d.backordered_count,
          in_transit_count: d.in_transit_count, issued_count: d.issued_count,
          returned_count: d.returned_count, cancelled_count: d.cancelled_count,
          breached: d.breached, reportable_total: d.reportable_total, vital_open: d.vital_open,
          predictive_count: d.predictive_count, total_stockout_impact_zar: d.total_stockout_impact_zar,
          total_stockout_avoidance_zar: d.total_stockout_avoidance_zar,
          total_carried_inventory_zar: d.total_carried_inventory_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load provisioning lines');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: ProvisioningRow; events: ProvisioningEvent[] } }>(
        `/spare-parts-provisioning/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load provisioning history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')           return true;
      if (filter === 'active')        return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')      return r.sla_breached;
      if (filter === 'reportable')    return r.is_reportable_flag;
      if (filter === 'vital')         return r.criticality === 'vital';
      if (filter === 'predictive_rul') return r.demand_source === 'predictive_rul';
      if (['catastrophic', 'critical', 'important', 'standard', 'routine'].includes(filter)) {
        return r.provisioning_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: ProvisioningRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'raise-requisition') {
        const qty = window.prompt('Quantity required:', String(row.qty_required ?? 1)) || '';
        const ref = window.prompt('Requisition reference (PR no.):') || '';
        const basis = window.prompt('Requisition basis — demand justification (RUL signal / WO / reorder):') || '';
        body = { requisition_basis: basis };
        if (ref) body.requisition_ref = ref;
        if (qty && !Number.isNaN(Number(qty))) body.qty_required = Number(qty);
      } else if (action === 'approve-requisition') {
        const ref = window.prompt('Approval reference:') || '';
        const basis = window.prompt('Approval basis — budget + criticality sign-off:') || '';
        body = { approval_basis: basis };
        if (ref) body.approval_ref = ref;
      } else if (action === 'issue-po') {
        const qty = window.prompt('Quantity ordered:', String(row.qty_ordered ?? row.qty_required ?? 1)) || '';
        const cost = window.prompt('Unit cost (ZAR):', row.unit_cost_zar != null ? String(row.unit_cost_zar) : '') || '';
        const sup = window.prompt('Supplier party name:', row.supplier_party_name || '') || '';
        const ref = window.prompt('PO reference:') || '';
        const basis = window.prompt('PO basis — supplier + sourcing decision:') || '';
        body = { po_basis: basis };
        if (ref) body.po_ref = ref;
        if (sup) body.supplier_party_name = sup;
        if (qty && !Number.isNaN(Number(qty))) body.qty_ordered = Number(qty);
        if (cost && !Number.isNaN(Number(cost))) body.unit_cost_zar = Number(cost);
      } else if (action === 'flag-backorder') {
        const basis = window.prompt('Backorder basis — why the supplier cannot ship within lead time:');
        if (!basis) return;
        const impact = window.prompt('Revised stockout impact (ZAR), if escalated — re-derives the tier:', String(row.stockout_impact_zar ?? '')) || '';
        const ref = window.prompt('Backorder reference:') || '';
        body = { backorder_basis: basis, reason_code: 'supplier_shortage' };
        if (ref) body.backorder_ref = ref;
        if (impact && !Number.isNaN(Number(impact))) body.stockout_impact_zar = Number(impact);
      } else if (action === 'expedite-backorder') {
        const basis = window.prompt('Expedite basis — alternate source / air-freight / partial ship:');
        if (!basis) return;
        const ref = window.prompt('Expedite reference:') || '';
        body = { expedite_basis: basis };
        if (ref) body.expedite_ref = ref;
      } else if (action === 'confirm-shipment') {
        const ref = window.prompt('Shipment reference (waybill / tracking):') || '';
        const basis = window.prompt('Shipment basis — dispatch confirmation:') || '';
        body = { shipment_basis: basis };
        if (ref) body.shipment_ref = ref;
      } else if (action === 'receive-goods') {
        const qty = window.prompt('Quantity received:', String(row.qty_ordered ?? row.qty_required ?? 1)) || '';
        const ref = window.prompt('Goods-receipt reference (GRN):') || '';
        body = {};
        if (ref) body.receipt_ref = ref;
        if (qty && !Number.isNaN(Number(qty))) body.qty_received = Number(qty);
      } else if (action === 'pass-inspection') {
        const basis = window.prompt('Inspection basis — incoming-QA pass (cert / dims / function):');
        if (!basis) return;
        const ref = window.prompt('Inspection reference:') || '';
        body = { inspection_basis: basis };
        if (ref) body.inspection_ref = ref;
      } else if (action === 'reject-inspection') {
        const basis = window.prompt('Rejection basis — incoming-QA failure (damage / wrong part / out of spec):');
        if (!basis) return;
        const ref = window.prompt('Rejection / NCR reference:') || '';
        body = { rejection_basis: basis, reason_code: 'qa_reject' };
        if (ref) body.rejection_ref = ref;
      } else if (action === 'reserve-stock') {
        const wo = window.prompt('Reserve for work order (WO id):', row.reserved_for_wo || '') || '';
        const basis = window.prompt('Reservation basis — allocation to the consuming WO:') || '';
        body = { reservation_basis: basis };
        if (wo) body.reserved_for_wo = wo;
      } else if (action === 'issue-part') {
        const basis = window.prompt('Issue basis — part issued to the field / WO:');
        if (!basis) return;
        const ref = window.prompt('Issue reference (stores issue / picking ticket):') || '';
        body = { issue_basis: basis };
        if (ref) body.issue_ref = ref;
      } else if (action === 'cancel-provisioning') {
        const basis = window.prompt('Cancellation basis — why the line is abandoned:');
        if (!basis) return;
        const reg = window.prompt('Regulator reference (cancelling a vital high-impact line is reportable):') || '';
        body = { cancellation_basis: basis, reason_code: 'cancelled' };
        if (reg) body.regulator_ref = reg;
      }
      await api.post(`/spare-parts-provisioning/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Spare-parts provisioning &amp; replenishment</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage service-parts-planning chain · demand identified → requisition raised → approved →
            PO issued → in transit → received → stocked → reserved → issued. The materials backbone under every
            other support chain — W16 consumes a part, W15 returns one, W63 chases its cost — but none plan or
            replenish inventory; this is that layer. The DIFFERENTIATOR: demand can be PREDICTIVE — a line is
            raised PRE-FAILURE off the W71 RUL signal so the part is pre-positioned before the breakdown, beating
            the reactive reorder-point planning of Syncron / Baxter / SAP SPP / Servigistics. A supplier shortage
            flags a backorder (auto-expedite via alternate source / air-freight, or cancel); incoming goods pass a
            reverse-logistics QA gate (stocked OR returned). URGENT SLA — a more critical line gets a TIGHTER
            window at every step. Reportable to the regulator inbox is AVAILABILITY-RISK-driven: a backorder on a
            vital high-impact line (or any catastrophic stockout) crosses; cancelling a vital high-impact line
            crosses; an SLA breach crosses for the HIGH tiers. SANS / IEC 62402 obsolescence + VED criticality +
            OEM spares-availability contract + NERSA security-of-supply.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total lines" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Predictive" value={kpis?.predictive_count ?? 0} tone="ok" />
        <Kpi label="Vital open" value={kpis?.vital_open ?? 0} tone={(kpis?.vital_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Backordered" value={kpis?.backordered_count ?? 0} tone={(kpis?.backordered_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="In transit" value={kpis?.in_transit_count ?? 0} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Issued" value={kpis?.issued_count ?? 0} tone="ok" />
        <Kpi label="Returned (QA)" value={kpis?.returned_count ?? 0} tone={(kpis?.returned_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Stockout exposure" value={fmtZar(kpis?.total_stockout_impact_zar)} tone="bad" />
        <Kpi label="Downtime averted" value={fmtZar(kpis?.total_stockout_avoidance_zar)} tone="ok" />
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Line #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Part / OEM</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Criticality</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Demand</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Stockout</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.provisioning_tier];
                const ct = CRIT_TONE[r.criticality];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      {r.line_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[240px] truncate" title={`${r.part_number} · ${r.part_description ?? ''} · ${r.oem_name ?? ''}`}>
                      {r.part_number}
                      <span className="text-[#4a5568]"> · {r.oem_name ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: ct.bg, color: ct.fg }}>
                        {ct.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[#4a5568]">
                      {SOURCE_LABEL[r.demand_source]}
                      {r.demand_source === 'predictive_rul' && r.rul_days != null && (
                        <span className="ml-1 text-[#1f6b3a]" title="Remaining useful life (days)">RUL {r.rul_days}d</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#9b1f1f]">{fmtZar(r.stockout_impact_zar)}</td>
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
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[#4a5568]">No provisioning lines match.</td></tr>
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
  row: ProvisioningRow;
  events: ProvisioningEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: ProvisioningRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canBackorder = row.chain_status === 'po_issued';
  const canRejectQa = row.chain_status === 'received';
  const canCancel = CANCEL_STATES.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.line_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.part_number} · {row.oem_name ?? 'OEM'}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {CRIT_TONE[row.criticality].label}
                {` · ${TIER_TONE[row.provisioning_tier].label}`}
                {` · ${SOURCE_LABEL[row.demand_source]}`}
                {row.asset_name ? ` · ${row.asset_name}` : ''}
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
            <Pair label="State"             value={STATE_TONE[row.chain_status].label} />
            <Pair label="Provisioning tier" value={TIER_TONE[row.provisioning_tier].label} />
            <Pair label="Criticality (VED)" value={CRIT_TONE[row.criticality].label} />
            <Pair label="Demand source"     value={SOURCE_LABEL[row.demand_source]} />
            <Pair label="Part description"  value={row.part_description ?? '—'} />
            <Pair label="Asset / site"      value={row.asset_name ?? '—'} />
            <Pair label="Site"              value={row.site_name ?? '—'} />
            <Pair label="Warehouse"         value={row.warehouse ?? '—'} />
            <Pair label="Supplier"          value={row.supplier_party_name ?? '—'} />
            <Pair label="Qty required"      value={String(row.qty_required ?? '—')} />
            <Pair label="Qty ordered"       value={row.qty_ordered != null ? String(row.qty_ordered) : '—'} />
            <Pair label="Qty received"      value={row.qty_received != null ? String(row.qty_received) : '—'} />
            <Pair label="Qty on hand"       value={String(row.qty_on_hand ?? 0)} />
            <Pair label="Unit cost"         value={fmtZar(row.unit_cost_zar)} />
            <Pair label="Lead time"         value={`${row.lead_time_days ?? 0}d`} />
            <Pair label="RUL"               value={row.rul_days != null ? `${row.rul_days}d` : '—'} />
            <Pair label="Predictive slack"  value={row.predictive_lead_days != null ? `${row.predictive_lead_days}d` : '—'} />
            <Pair label="Reorder point"     value={row.reorder_point != null ? String(row.reorder_point) : '—'} />
            <Pair label="Safety stock"      value={row.safety_stock != null ? String(row.safety_stock) : '—'} />
            <Pair label="Fill rate"         value={row.fill_rate != null ? `${Math.round(row.fill_rate * 100)}%` : '—'} />
            <Pair label="Stockout impact"   value={fmtZar(row.stockout_impact_zar)} />
            <Pair label="Downtime averted"  value={fmtZar(row.stockout_avoidance_zar)} />
            <Pair label="Carried inventory" value={fmtZar(row.carried_inventory_zar)} />
            <Pair label="WC efficiency"     value={row.working_capital_efficiency != null ? `${row.working_capital_efficiency.toFixed(2)}×` : '—'} />
            <Pair label="Reserved for WO"   value={row.reserved_for_wo ?? '—'} />
            <Pair label="Backorder round"   value={String(row.backorder_round ?? 0)} />
            <Pair label="Regulator ref"     value={row.regulator_ref ?? '—'} />
            <Pair label="Reason code"       value={row.reason_code ?? '—'} />
            <Pair label="Demand identified" value={fmtDate(row.demand_identified_at)} />
            <Pair label="Requisition"       value={fmtDate(row.requisition_raised_at)} />
            <Pair label="Approved"          value={fmtDate(row.requisition_approved_at)} />
            <Pair label="PO issued"         value={fmtDate(row.po_issued_at)} />
            <Pair label="Backordered"       value={fmtDate(row.backordered_at)} />
            <Pair label="In transit"        value={fmtDate(row.in_transit_at)} />
            <Pair label="Received"          value={fmtDate(row.received_at)} />
            <Pair label="Stocked"           value={fmtDate(row.stocked_at)} />
            <Pair label="Reserved"          value={fmtDate(row.reserved_at)} />
            <Pair label="Issued"            value={fmtDate(row.issued_at)} />
            <Pair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"        value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"    value={String(row.escalation_level)} />
            <Pair label="Reportable"        value={row.is_reportable_flag ? 'Yes' : 'No'} />
          </div>
          {row.demand_basis && (
            <BasisBlock label="Demand basis" tone="oklch(0.46 0.16 55)" text={row.demand_basis} />
          )}
          {row.requisition_basis && (
            <BasisBlock label="Requisition basis" tone="oklch(0.46 0.16 55)" text={row.requisition_basis} />
          )}
          {row.approval_basis && (
            <BasisBlock label="Approval basis" tone="oklch(0.46 0.16 55)" text={row.approval_basis} />
          )}
          {row.po_basis && (
            <BasisBlock label="PO basis" tone="#a06200" text={row.po_basis} />
          )}
          {row.backorder_basis && (
            <BasisBlock label="Backorder basis" tone="#9b1f1f" text={row.backorder_basis} />
          )}
          {row.expedite_basis && (
            <BasisBlock label="Expedite basis" tone="#1f6b3a" text={row.expedite_basis} />
          )}
          {row.shipment_basis && (
            <BasisBlock label="Shipment basis" tone="oklch(0.46 0.16 55)" text={row.shipment_basis} />
          )}
          {row.inspection_basis && (
            <BasisBlock label="Inspection basis" tone="#1f6b3a" text={row.inspection_basis} />
          )}
          {row.rejection_basis && (
            <BasisBlock label="Rejection basis" tone="#9b1f1f" text={row.rejection_basis} />
          )}
          {row.reservation_basis && (
            <BasisBlock label="Reservation basis" tone="#1f6b3a" text={row.reservation_basis} />
          )}
          {row.issue_basis && (
            <BasisBlock label="Issue basis" tone="#1f6b3a" text={row.issue_basis} />
          )}
          {row.cancellation_basis && (
            <BasisBlock label="Cancellation basis" tone="#557" text={row.cancellation_basis} />
          )}
        </section>

        {(nextAction || canBackorder || canRejectQa || canCancel) && (
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
              {canBackorder && (
                <button type="button"
                  onClick={() => onAct('flag-backorder', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['flag-backorder']}
                </button>
              )}
              {canRejectQa && (
                <button type="button"
                  onClick={() => onAct('reject-inspection', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['reject-inspection']}
                </button>
              )}
              {canCancel && (
                <button type="button"
                  onClick={() => onAct('cancel-provisioning', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#557] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['cancel-provisioning']}
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
