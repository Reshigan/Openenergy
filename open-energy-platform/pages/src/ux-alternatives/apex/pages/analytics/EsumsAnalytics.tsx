import React from 'react';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StatusPill, stateVariant } from '../../components/display/StatusPill';
import { useEsumsAssets, useEsumsWorkOrders, useEsumsPrognostics } from '../../lib/hooks';

// ─── Mock data (fallbacks) ────────────────────────────────────────────────────

interface AssetHealthRow {
  id: string;
  assetId: string;
  site: string;
  type: string;
  capacityKwp: number;
  availabilityPct: number;
  prRatio: number;
  anomalyScore: number;
  rulDays: number;
  faultRisk: string;
  status: string;
}

const ASSET_FALLBACK: AssetHealthRow[] = [
  { id: 'a1',  assetId: 'ESM-SOL-001', site: 'Kalahari Solar 1',    type: 'Solar PV', capacityKwp: 4800, availabilityPct: 98.4, prRatio: 83.2, anomalyScore: 0.12, rulDays: 1840, faultRisk: 'Low',      status: 'Operational'   },
  { id: 'a2',  assetId: 'ESM-SOL-002', site: 'Kalahari Solar 1',    type: 'Solar PV', capacityKwp: 4800, availabilityPct: 97.1, prRatio: 81.4, anomalyScore: 0.28, rulDays: 1620, faultRisk: 'Low',      status: 'Operational'   },
  { id: 'a3',  assetId: 'ESM-SOL-003', site: 'Upington East',       type: 'Solar PV', capacityKwp: 6200, availabilityPct: 94.8, prRatio: 78.6, anomalyScore: 0.61, rulDays:  410, faultRisk: 'Medium',   status: 'At Risk'       },
  { id: 'a4',  assetId: 'ESM-WIN-001', site: 'Jeffreys Bay Wind',   type: 'Wind',     capacityKwp: 8400, availabilityPct: 99.2, prRatio: 84.7, anomalyScore: 0.08, rulDays: 2100, faultRisk: 'Low',      status: 'Operational'   },
  { id: 'a5',  assetId: 'ESM-WIN-002', site: 'Jeffreys Bay Wind',   type: 'Wind',     capacityKwp: 8400, availabilityPct: 96.3, prRatio: 82.1, anomalyScore: 0.43, rulDays:  820, faultRisk: 'Medium',   status: 'Operational'   },
  { id: 'a6',  assetId: 'ESM-WIN-003', site: 'Coega Wind Farm',     type: 'Wind',     capacityKwp: 7600, availabilityPct: 91.4, prRatio: 79.8, anomalyScore: 0.74, rulDays:  180, faultRisk: 'High',     status: 'At Risk'       },
  { id: 'a7',  assetId: 'ESM-BES-001', site: 'De Aar BESS',         type: 'BESS',     capacityKwp: 3200, availabilityPct: 99.8, prRatio: 91.2, anomalyScore: 0.05, rulDays: 3200, faultRisk: 'Low',      status: 'Operational'   },
  { id: 'a8',  assetId: 'ESM-BES-002', site: 'De Aar BESS',         type: 'BESS',     capacityKwp: 3200, availabilityPct: 98.9, prRatio: 89.4, anomalyScore: 0.19, rulDays: 2940, faultRisk: 'Low',      status: 'Operational'   },
  { id: 'a9',  assetId: 'ESM-SOL-004', site: 'Prieska Solar',       type: 'Solar PV', capacityKwp: 5100, availabilityPct: 97.8, prRatio: 82.9, anomalyScore: 0.31, rulDays: 1390, faultRisk: 'Low',      status: 'Operational'   },
  { id: 'a10', assetId: 'ESM-SOL-005', site: 'Prieska Solar',       type: 'Solar PV', capacityKwp: 5100, availabilityPct: 93.2, prRatio: 76.4, anomalyScore: 0.82, rulDays:   90, faultRisk: 'Critical', status: 'Maintenance'   },
  { id: 'a11', assetId: 'ESM-WIN-004', site: 'Loeriesfontein Wind',  type: 'Wind',     capacityKwp: 9100, availabilityPct: 99.1, prRatio: 85.6, anomalyScore: 0.11, rulDays: 1950, faultRisk: 'Low',      status: 'Operational'   },
  { id: 'a12', assetId: 'ESM-BES-003', site: 'Springbok BESS',      type: 'BESS',     capacityKwp: 4000, availabilityPct: 99.5, prRatio: 90.8, anomalyScore: 0.07, rulDays: 2860, faultRisk: 'Low',      status: 'Operational'   },
];

interface WorkOrderRow {
  id: string;
  woRef: string;
  asset: string;
  type: string;
  priority: string;
  created: string;
  resolved: string;
  durationH: number;
  technician: string;
  partsCostZar: number;
  slaStatus: string;
  status: string;
}

const WORK_ORDERS_FALLBACK: WorkOrderRow[] = [
  { id: 'w1',  woRef: 'WO-2026-1042', asset: 'ESM-SOL-003', type: 'Corrective',  priority: 'P2', created: '2026-05-28', resolved: '2026-05-29', durationH:  8.2,  technician: 'A. Mokoena',  partsCostZar:  12400, slaStatus: 'Met',      status: 'Closed'   },
  { id: 'w2',  woRef: 'WO-2026-1041', asset: 'ESM-WIN-006', type: 'Preventive',  priority: 'P3', created: '2026-05-28', resolved: '2026-05-28', durationH:  3.5,  technician: 'L. Dlamini',  partsCostZar:   4200, slaStatus: 'Met',      status: 'Closed'   },
  { id: 'w3',  woRef: 'WO-2026-1040', asset: 'ESM-WIN-003', type: 'Emergency',   priority: 'P1', created: '2026-05-27', resolved: '2026-05-27', durationH:  4.8,  technician: 'T. Sithole',  partsCostZar:  68000, slaStatus: 'Breached', status: 'Closed'   },
  { id: 'w4',  woRef: 'WO-2026-1039', asset: 'ESM-SOL-005', type: 'Corrective',  priority: 'P1', created: '2026-05-26', resolved: '',           durationH:  0,    technician: 'A. Mokoena',  partsCostZar:  91000, slaStatus: 'Breached', status: 'Open'     },
  { id: 'w5',  woRef: 'WO-2026-1038', asset: 'ESM-BES-001', type: 'Inspection',  priority: 'P3', created: '2026-05-26', resolved: '2026-05-26', durationH:  2.0,  technician: 'P. Nkosi',    partsCostZar:       0, slaStatus: 'Met',      status: 'Closed'   },
  { id: 'w6',  woRef: 'WO-2026-1037', asset: 'ESM-WIN-002', type: 'Preventive',  priority: 'P2', created: '2026-05-25', resolved: '2026-05-26', durationH: 14.3,  technician: 'L. Dlamini',  partsCostZar:  28600, slaStatus: 'Met',      status: 'Closed'   },
  { id: 'w7',  woRef: 'WO-2026-1036', asset: 'ESM-SOL-001', type: 'Corrective',  priority: 'P2', created: '2026-05-24', resolved: '2026-05-25', durationH:  9.1,  technician: 'T. Sithole',  partsCostZar:  15800, slaStatus: 'Met',      status: 'Closed'   },
  { id: 'w8',  woRef: 'WO-2026-1035', asset: 'ESM-BES-002', type: 'Inspection',  priority: 'P3', created: '2026-05-24', resolved: '2026-05-24', durationH:  1.5,  technician: 'P. Nkosi',    partsCostZar:       0, slaStatus: 'Met',      status: 'Closed'   },
  { id: 'w9',  woRef: 'WO-2026-1034', asset: 'ESM-WIN-004', type: 'Preventive',  priority: 'P3', created: '2026-05-23', resolved: '2026-05-24', durationH: 18.0,  technician: 'A. Mokoena',  partsCostZar:  32100, slaStatus: 'Met',      status: 'Closed'   },
  { id: 'w10', woRef: 'WO-2026-1033', asset: 'ESM-SOL-004', type: 'Corrective',  priority: 'P2', created: '2026-05-22', resolved: '2026-05-23', durationH: 11.6,  technician: 'L. Dlamini',  partsCostZar:  19200, slaStatus: 'Met',      status: 'Closed'   },
  { id: 'w11', woRef: 'WO-2026-1032', asset: 'ESM-WIN-001', type: 'Inspection',  priority: 'P3', created: '2026-05-21', resolved: '2026-05-21', durationH:  2.4,  technician: 'T. Sithole',  partsCostZar:       0, slaStatus: 'Met',      status: 'Closed'   },
  { id: 'w12', woRef: 'WO-2026-1031', asset: 'ESM-SOL-002', type: 'Corrective',  priority: 'P2', created: '2026-05-20', resolved: '2026-05-21', durationH:  7.8,  technician: 'P. Nkosi',    partsCostZar:   9600, slaStatus: 'Met',      status: 'Closed'   },
  { id: 'w13', woRef: 'WO-2026-1030', asset: 'ESM-BES-003', type: 'Preventive',  priority: 'P3', created: '2026-05-19', resolved: '2026-05-19', durationH:  3.1,  technician: 'A. Mokoena',  partsCostZar:   7400, slaStatus: 'Met',      status: 'Closed'   },
  { id: 'w14', woRef: 'WO-2026-1029', asset: 'ESM-WIN-003', type: 'Emergency',   priority: 'P1', created: '2026-05-18', resolved: '2026-05-18', durationH:  5.4,  technician: 'T. Sithole',  partsCostZar:  54200, slaStatus: 'Met',      status: 'Closed'   },
  { id: 'w15', woRef: 'WO-2026-1028', asset: 'ESM-SOL-005', type: 'Corrective',  priority: 'P2', created: '2026-05-17', resolved: '2026-05-18', durationH: 16.2,  technician: 'L. Dlamini',  partsCostZar:  41800, slaStatus: 'Breached', status: 'Closed'   },
];

interface ForecastRow {
  id: string;
  asset: string;
  component: string;
  failureMode: string;
  predictedFailureDate: string;
  confidencePct: number;
  recommendedAction: string;
  estCostZar: number;
  priority: string;
}

const FORECASTS_FALLBACK: ForecastRow[] = [
  { id: 'f1',  asset: 'ESM-SOL-005', component: 'Inverter A3',         failureMode: 'IGBT thermal derating',       predictedFailureDate: '2026-06-18', confidencePct: 88, recommendedAction: 'Schedule replacement',      estCostZar:  84000, priority: 'Critical' },
  { id: 'f2',  asset: 'ESM-WIN-003', component: 'Gearbox bearing',      failureMode: 'Spalling fatigue',            predictedFailureDate: '2026-07-04', confidencePct: 76, recommendedAction: 'Vibration + oil analysis',  estCostZar: 245000, priority: 'High'     },
  { id: 'f3',  asset: 'ESM-SOL-003', component: 'String combiner CB-2', failureMode: 'Contact overheating',         predictedFailureDate: '2026-07-22', confidencePct: 81, recommendedAction: 'Thermal imaging scan',      estCostZar:  18000, priority: 'Medium'   },
  { id: 'f4',  asset: 'ESM-WIN-002', component: 'Pitch actuator #1',    failureMode: 'Hydraulic seal degradation',  predictedFailureDate: '2026-08-10', confidencePct: 65, recommendedAction: 'Seal kit replacement',      estCostZar:  32000, priority: 'Medium'   },
  { id: 'f5',  asset: 'ESM-BES-002', component: 'Cell cluster B-07',    failureMode: 'Capacity fade >20%',          predictedFailureDate: '2026-09-01', confidencePct: 91, recommendedAction: 'Cell balancing + retest',   estCostZar:  56000, priority: 'High'     },
  { id: 'f6',  asset: 'ESM-SOL-002', component: 'Module row 12',        failureMode: 'Potential-induced degradation', predictedFailureDate: '2026-09-14', confidencePct: 58, recommendedAction: 'Electroluminescence test', estCostZar:  22000, priority: 'Low'      },
  { id: 'f7',  asset: 'ESM-WIN-001', component: 'Nacelle anemometer',   failureMode: 'Calibration drift',           predictedFailureDate: '2026-10-03', confidencePct: 83, recommendedAction: 'Recalibrate + replace',    estCostZar:   8400, priority: 'Low'      },
  { id: 'f8',  asset: 'ESM-SOL-004', component: 'DC cabling segment 5', failureMode: 'Insulation resistivity loss', predictedFailureDate: '2026-10-28', confidencePct: 69, recommendedAction: 'Insulation resistance test', estCostZar:  14000, priority: 'Medium'  },
  { id: 'f9',  asset: 'ESM-WIN-003', component: 'Rotor blade TE',       failureMode: 'Leading-edge erosion',        predictedFailureDate: '2026-11-15', confidencePct: 74, recommendedAction: 'Leading-edge protection',   estCostZar: 180000, priority: 'High'     },
  { id: 'f10', asset: 'ESM-BES-003', component: 'BMS firmware',         failureMode: 'Thermal runaway risk',        predictedFailureDate: '2026-12-01', confidencePct: 55, recommendedAction: 'Firmware update + audit',   estCostZar:   6800, priority: 'Medium'   },
];

interface MonthlyCostRow {
  id: string;
  month: string;
  plannedZar: number;
  reactiveZar: number;
  totalOmZar: number;
  downtimeH: number;
  lostRevenueZar: number;
  availabilityPct: number;
}

const MONTHLY_COST: MonthlyCostRow[] = [
  { id: 'mc1',  month: 'Jun 2025', plannedZar:  840000, reactiveZar:  210000, totalOmZar: 1050000, downtimeH:  18.2, lostRevenueZar:  312000, availabilityPct: 99.1 },
  { id: 'mc2',  month: 'Jul 2025', plannedZar:  920000, reactiveZar:  180000, totalOmZar: 1100000, downtimeH:  14.6, lostRevenueZar:  241000, availabilityPct: 99.4 },
  { id: 'mc3',  month: 'Aug 2025', plannedZar:  760000, reactiveZar:  390000, totalOmZar: 1150000, downtimeH:  31.4, lostRevenueZar:  548000, availabilityPct: 98.2 },
  { id: 'mc4',  month: 'Sep 2025', plannedZar:  880000, reactiveZar:  640000, totalOmZar: 1520000, downtimeH:  54.8, lostRevenueZar:  921000, availabilityPct: 96.8 },
  { id: 'mc5',  month: 'Oct 2025', plannedZar:  950000, reactiveZar:  220000, totalOmZar: 1170000, downtimeH:  19.1, lostRevenueZar:  328000, availabilityPct: 99.2 },
  { id: 'mc6',  month: 'Nov 2025', plannedZar:  810000, reactiveZar:  160000, totalOmZar:  970000, downtimeH:  12.4, lostRevenueZar:  208000, availabilityPct: 99.5 },
  { id: 'mc7',  month: 'Dec 2025', plannedZar:  740000, reactiveZar:  140000, totalOmZar:  880000, downtimeH:  10.6, lostRevenueZar:  176000, availabilityPct: 99.6 },
  { id: 'mc8',  month: 'Jan 2026', plannedZar:  870000, reactiveZar:  310000, totalOmZar: 1180000, downtimeH:  26.3, lostRevenueZar:  448000, availabilityPct: 98.5 },
  { id: 'mc9',  month: 'Feb 2026', plannedZar:  900000, reactiveZar:  280000, totalOmZar: 1180000, downtimeH:  22.8, lostRevenueZar:  392000, availabilityPct: 98.7 },
  { id: 'mc10', month: 'Mar 2026', plannedZar:  960000, reactiveZar:  480000, totalOmZar: 1440000, downtimeH:  41.2, lostRevenueZar:  712000, availabilityPct: 97.6 },
  { id: 'mc11', month: 'Apr 2026', plannedZar:  890000, reactiveZar:  210000, totalOmZar: 1100000, downtimeH:  18.0, lostRevenueZar:  307000, availabilityPct: 99.1 },
  { id: 'mc12', month: 'May 2026', plannedZar:  830000, reactiveZar:  190000, totalOmZar: 1020000, downtimeH:  15.7, lostRevenueZar:  268000, availabilityPct: 99.2 },
];

// ─── Column definitions ───────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' };

const assetCols: Column<AssetHealthRow>[] = [
  { key: 'assetId',         header: 'Asset ID',          sortable: true },
  { key: 'site',            header: 'Site',              sortable: true },
  { key: 'type',            header: 'Type' },
  {
    key: 'capacityKwp',
    header: 'Capacity (kWp)',
    align: 'right',
    render: (row) => <span style={MONO}>{row.capacityKwp.toLocaleString()}</span>,
  },
  {
    key: 'availabilityPct',
    header: 'Availability %',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: row.availabilityPct < 95 ? 'var(--oe-rose)' : row.availabilityPct < 98 ? 'var(--oe-amber)' : 'var(--oe-green)' }}>
        {row.availabilityPct.toFixed(1)}%
      </span>
    ),
  },
  {
    key: 'prRatio',
    header: 'PR Ratio',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: row.prRatio < 80 ? 'var(--oe-rose)' : row.prRatio < 85 ? 'var(--oe-amber)' : 'var(--oe-green)' }}>
        {row.prRatio.toFixed(1)}%
      </span>
    ),
  },
  {
    key: 'anomalyScore',
    header: 'Anomaly Score',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: row.anomalyScore > 0.7 ? 'var(--oe-rose)' : row.anomalyScore > 0.4 ? 'var(--oe-amber)' : 'var(--oe-text-1)' }}>
        {row.anomalyScore.toFixed(2)}
      </span>
    ),
  },
  {
    key: 'rulDays',
    header: 'RUL (days)',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: row.rulDays < 180 ? 'var(--oe-rose)' : row.rulDays < 500 ? 'var(--oe-amber)' : 'var(--oe-text-1)' }}>
        {row.rulDays.toLocaleString()}
      </span>
    ),
  },
  {
    key: 'faultRisk',
    header: 'Fault Risk',
    render: (row) => {
      const v = row.faultRisk === 'Critical' ? 'rose' : row.faultRisk === 'High' ? 'rose' : row.faultRisk === 'Medium' ? 'amber' : 'green';
      return <StatusPill label={row.faultRisk} variant={v} />;
    },
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} />,
  },
];

const woCols: Column<WorkOrderRow>[] = [
  { key: 'woRef',      header: 'WO Ref',          sortable: true },
  { key: 'asset',      header: 'Asset' },
  { key: 'type',       header: 'Type' },
  {
    key: 'priority',
    header: 'Priority',
    render: (row) => (
      <span style={{ ...MONO, color: row.priority === 'P1' ? 'var(--oe-rose)' : 'var(--oe-text-1)', fontWeight: row.priority === 'P1' ? 700 : 400 }}>
        {row.priority}
      </span>
    ),
  },
  { key: 'created',    header: 'Created',         sortable: true },
  { key: 'resolved',   header: 'Resolved',        render: (row) => <span style={{ color: row.resolved ? 'var(--oe-text-1)' : 'var(--oe-text-3)' }}>{row.resolved || '—'}</span> },
  {
    key: 'durationH',
    header: 'Duration (h)',
    align: 'right',
    render: (row) => <span style={MONO}>{row.durationH > 0 ? row.durationH.toFixed(1) : '—'}</span>,
  },
  { key: 'technician', header: 'Technician' },
  {
    key: 'partsCostZar',
    header: 'Parts Cost (ZAR)',
    align: 'right',
    render: (row) => <span style={MONO}>{row.partsCostZar > 0 ? `R ${row.partsCostZar.toLocaleString()}` : '—'}</span>,
  },
  {
    key: 'slaStatus',
    header: 'SLA',
    render: (row) => <StatusPill label={row.slaStatus} variant={row.slaStatus === 'Met' ? 'green' : 'rose'} />,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} />,
  },
];

const forecastCols: Column<ForecastRow>[] = [
  { key: 'asset',               header: 'Asset' },
  { key: 'component',           header: 'Component' },
  { key: 'failureMode',         header: 'Failure Mode' },
  { key: 'predictedFailureDate', header: 'Predicted Failure', sortable: true },
  {
    key: 'confidencePct',
    header: 'Confidence',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: row.confidencePct > 80 ? 'var(--oe-green)' : row.confidencePct > 60 ? 'var(--oe-amber)' : 'var(--oe-rose)' }}>
        {row.confidencePct}%
      </span>
    ),
  },
  { key: 'recommendedAction',   header: 'Recommended Action' },
  {
    key: 'estCostZar',
    header: 'Est. Cost (ZAR)',
    align: 'right',
    render: (row) => <span style={MONO}>R {row.estCostZar.toLocaleString()}</span>,
  },
  {
    key: 'priority',
    header: 'Priority',
    render: (row) => <StatusPill label={row.priority} variant={stateVariant(row.priority)} />,
  },
];

const costCols: Column<MonthlyCostRow>[] = [
  { key: 'month',          header: 'Month',             sortable: true },
  {
    key: 'plannedZar',
    header: 'Planned Maint (ZAR)',
    align: 'right',
    render: (row) => <span style={MONO}>R {row.plannedZar.toLocaleString()}</span>,
  },
  {
    key: 'reactiveZar',
    header: 'Reactive Maint',
    align: 'right',
    render: (row) => <span style={MONO}>R {row.reactiveZar.toLocaleString()}</span>,
  },
  {
    key: 'totalOmZar',
    header: 'Total O&M',
    align: 'right',
    render: (row) => <span style={{ ...MONO, fontWeight: 600 }}>R {row.totalOmZar.toLocaleString()}</span>,
  },
  { key: 'downtimeH',      header: 'Downtime (h)',      align: 'right', mono: true },
  {
    key: 'lostRevenueZar',
    header: 'Lost Revenue (ZAR)',
    align: 'right',
    render: (row) => <span style={{ ...MONO, color: 'var(--oe-rose)' }}>R {row.lostRevenueZar.toLocaleString()}</span>,
  },
  {
    key: 'availabilityPct',
    header: 'Availability %',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: row.availabilityPct < 97 ? 'var(--oe-amber)' : 'var(--oe-green)' }}>
        {row.availabilityPct.toFixed(1)}%
      </span>
    ),
  },
];

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHead({ label, title }: { label: string; title: string }) {
  return (
    <div
      style={{
        background: 'var(--oe-surf)',
        border: '1px solid var(--oe-border)',
        borderRadius: 'var(--oe-r-card)',
        padding: '10px 16px 12px',
        borderBottom: '2px solid var(--oe-border)',
      }}
    >
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--oe-text-1)', marginTop: '2px' }}>{title}</div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EsumsAnalytics() {
  const { data: assets, loading: assetsLoading } = useEsumsAssets();
  const { data: workOrders, loading: woLoading } = useEsumsWorkOrders();
  const { data: prognostics, loading: prognosticsLoading } = useEsumsPrognostics();

  // ─── KPI computation ─────────────────────────────────────────────────────
  const avgAvailability = assets.length
    ? assets.reduce((s, a) => s + (a.availability_pct || 0), 0) / assets.length
    : 0;

  const avgPr = assets.length
    ? assets.reduce((s, a) => s + (a.pr_ratio || 0), 0) / assets.length
    : 0;

  const anomalyCount = prognostics.filter(
    (p) => (p as unknown as { anomaly_detected?: boolean }).anomaly_detected || p.priority === 'high',
  ).length;

  const openWos = workOrders.filter((w) => w.status === 'open').length;

  // ─── Live asset rows ──────────────────────────────────────────────────────
  const liveAssetRows: AssetHealthRow[] = assets.length
    ? assets.map((a) => ({
        id: a.id,
        assetId: a.asset_ref ?? a.id,
        site: a.site_name,
        type: a.asset_type,
        capacityKwp: a.capacity_kwp ?? 0,
        availabilityPct: a.availability_pct ?? 0,
        prRatio: a.pr_ratio ?? 0,
        anomalyScore: a.anomaly_score ?? 0,
        rulDays: a.rul_days ?? 0,
        faultRisk: a.fault_risk_index != null
          ? a.fault_risk_index > 0.7 ? 'High' : a.fault_risk_index > 0.4 ? 'Medium' : 'Low'
          : 'Low',
        status: a.status,
      }))
    : ASSET_FALLBACK;

  // ─── Live work order rows ─────────────────────────────────────────────────
  const liveWoRows: WorkOrderRow[] = workOrders.length
    ? workOrders.map((w) => ({
        id: w.id,
        woRef: w.wo_ref,
        asset: w.asset_name ?? w.asset_id,
        type: w.wo_type,
        priority: w.priority,
        created: w.created_at ? w.created_at.slice(0, 10) : '',
        resolved: w.resolved_at ? w.resolved_at.slice(0, 10) : '',
        durationH: w.duration_h ?? 0,
        technician: w.technician ?? '—',
        partsCostZar: w.parts_cost_zar ?? 0,
        slaStatus: w.sla_met == null ? '—' : w.sla_met ? 'Met' : 'Breached',
        status: w.status,
      }))
    : WORK_ORDERS_FALLBACK;

  // ─── Live PM forecast rows ────────────────────────────────────────────────
  const liveForecastRows: ForecastRow[] = prognostics.length
    ? prognostics.map((p) => ({
        id: p.id,
        asset: p.asset_id,
        component: p.component,
        failureMode: p.failure_mode,
        predictedFailureDate: p.predicted_failure_date ?? '—',
        confidencePct: p.confidence_pct ?? 0,
        recommendedAction: p.recommended_action ?? '—',
        estCostZar: p.est_cost_zar ?? 0,
        priority: p.priority ?? 'normal',
      }))
    : FORECASTS_FALLBACK;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px' }}>
      {/* Page title */}
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0 }}>
          O&amp;M Fleet Performance Analytics
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--oe-text-3)', margin: '4px 0 0' }}>
          Real-time asset health, work orders, predictive maintenance &amp; cost trend
        </p>
      </div>

      {/* KPI row */}
      <StatGrid cols={5}>
        <StatCard
          label="Fleet Availability"
          value={assetsLoading ? '…' : avgAvailability.toFixed(1)}
          unit="%"
          variant={avgAvailability < 95 ? 'rose' : avgAvailability < 98 ? 'amber' : 'green'}
          icon="esums"
          subtext={assetsLoading ? 'Loading…' : `${assets.length} active assets`}
        />
        <StatCard
          label="Avg PR Ratio"
          value={assetsLoading ? '…' : avgPr.toFixed(1)}
          unit="%"
          variant={avgPr < 80 ? 'rose' : avgPr < 85 ? 'amber' : 'green'}
          icon="chart-line"
          subtext="Fleet composite"
        />
        <StatCard
          label="Open WOs"
          value={woLoading ? '…' : String(openWos)}
          variant={openWos > 5 ? 'rose' : openWos > 0 ? 'amber' : 'green'}
          icon="wrench"
          subtext={woLoading ? 'Loading…' : `${workOrders.length} total WOs`}
        />
        <StatCard
          label="Anomalies Detected"
          value={prognosticsLoading ? '…' : String(anomalyCount)}
          variant={anomalyCount > 0 ? 'rose' : 'green'}
          icon="alert-triangle"
          subtext={prognosticsLoading ? 'Loading…' : 'Needs attention'}
        />
        <StatCard label="Savings vs NTT Baseline" value="R2.4M" variant="green" icon="dollar" subtext="Rolling 12 months" />
      </StatGrid>

      {/* Asset Health Summary */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <SectionHead label="Asset Health" title={`Fleet Asset Health Summary — ${liveAssetRows.length} Assets`} />
        <DataTable<AssetHealthRow> columns={assetCols} rows={liveAssetRows} compact />
      </div>

      {/* Work Order Performance */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <SectionHead label="Work Orders" title={`Work Order Performance — Last ${liveWoRows.length} WOs`} />
        <DataTable<WorkOrderRow> columns={woCols} rows={liveWoRows} compact />
      </div>

      {/* Predictive Maintenance Forecast */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <SectionHead label="Predictive Maintenance" title="Failure Forecast — Next 12 Months" />
        <DataTable<ForecastRow> columns={forecastCols} rows={liveForecastRows} compact />
      </div>

      {/* Monthly O&M Cost Trend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <SectionHead label="Cost Trend" title="Monthly O&amp;M Cost Breakdown — 12 Months" />
        <DataTable<MonthlyCostRow> columns={costCols} rows={MONTHLY_COST} compact />
      </div>
    </div>
  );
}

export default EsumsAnalytics;
