import React from 'react';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StatusPill, stateVariant } from '../../components/display/StatusPill';
import { useOemTickets, useOemSpareParts, useOemWarrantyRecovery } from '../../lib/hooks';

// ─── Mock data (fallbacks) ────────────────────────────────────────────────────

interface TicketVolumeRow {
  id: string;
  period: string;
  p1Open: number;
  p1Closed: number;
  p2Open: number;
  p2Closed: number;
  p3Open: number;
  p3Closed: number;
  avgResTimeH: number;
  slaMetPct: number;
}

const TICKET_VOLUMES_FALLBACK: TicketVolumeRow[] = [
  { id: 'tv1', period: 'Wk 17 (Apr 21)',  p1Open: 2, p1Closed: 4,  p2Open: 5,  p2Closed: 9,  p3Open: 8,  p3Closed: 14, avgResTimeH: 5.8,  slaMetPct: 96.2 },
  { id: 'tv2', period: 'Wk 18 (Apr 28)',  p1Open: 1, p1Closed: 3,  p2Open: 4,  p2Closed: 8,  p3Open: 6,  p3Closed: 11, avgResTimeH: 5.2,  slaMetPct: 97.1 },
  { id: 'tv3', period: 'Wk 19 (May 5)',   p1Open: 3, p1Closed: 5,  p2Open: 7,  p2Closed: 10, p3Open: 9,  p3Closed: 16, avgResTimeH: 6.4,  slaMetPct: 94.8 },
  { id: 'tv4', period: 'Wk 20 (May 12)',  p1Open: 4, p1Closed: 6,  p2Open: 8,  p2Closed: 11, p3Open: 12, p3Closed: 18, avgResTimeH: 7.1,  slaMetPct: 91.3 },
  { id: 'tv5', period: 'Wk 21 (May 19)',  p1Open: 2, p1Closed: 4,  p2Open: 6,  p2Closed: 9,  p3Open: 7,  p3Closed: 13, avgResTimeH: 6.0,  slaMetPct: 95.4 },
  { id: 'tv6', period: 'Wk 22 (May 26)',  p1Open: 3, p1Closed: 4,  p2Open: 7,  p2Closed: 8,  p3Open: 10, p3Closed: 12, avgResTimeH: 6.8,  slaMetPct: 88.6 },
  { id: 'tv7', period: 'Wk 23 (Jun 2)',   p1Open: 5, p1Closed: 3,  p2Open: 9,  p2Closed: 7,  p3Open: 14, p3Closed: 10, avgResTimeH: 8.2,  slaMetPct: 82.4 },
  { id: 'tv8', period: 'Wk 24 (Jun 9)',   p1Open: 3, p1Closed: 2,  p2Open: 6,  p2Closed: 4,  p3Open: 11, p3Closed: 8,  avgResTimeH: 7.4,  slaMetPct: 86.1 },
];

interface IncidentRow {
  id: string;
  ticketRef: string;
  asset: string;
  priority: string;
  category: string;
  created: string;
  assignee: string;
  slaDeadline: string;
  hoursRemaining: number;
  status: string;
}

const INCIDENTS_FALLBACK: IncidentRow[] = [
  { id: 'i1',  ticketRef: 'INC-2026-1089', asset: 'ESM-SOL-005', priority: 'P1', category: 'Inverter failure',     created: '2026-05-30 08:14', assignee: 'T. Sithole',  slaDeadline: '2026-05-30 10:14', hoursRemaining: -2.3,  status: 'Overdue'    },
  { id: 'i2',  ticketRef: 'INC-2026-1088', asset: 'ESM-WIN-003', priority: 'P1', category: 'Gearbox vibration',    created: '2026-05-30 11:20', assignee: 'A. Mokoena',  slaDeadline: '2026-05-30 13:20', hoursRemaining:  1.4,  status: 'In Progress' },
  { id: 'i3',  ticketRef: 'INC-2026-1087', asset: 'ESM-BES-002', priority: 'P2', category: 'Battery cell alarm',   created: '2026-05-29 14:45', assignee: 'P. Nkosi',    slaDeadline: '2026-05-30 06:45', hoursRemaining:  6.1,  status: 'In Progress' },
  { id: 'i4',  ticketRef: 'INC-2026-1086', asset: 'ESM-SOL-003', priority: 'P2', category: 'String combiner trip', created: '2026-05-29 09:30', assignee: 'L. Dlamini',  slaDeadline: '2026-05-30 01:30', hoursRemaining: -8.2,  status: 'Overdue'    },
  { id: 'i5',  ticketRef: 'INC-2026-1085', asset: 'ESM-WIN-002', priority: 'P2', category: 'Pitch control fault',  created: '2026-05-28 17:00', assignee: 'T. Sithole',  slaDeadline: '2026-05-29 09:00', hoursRemaining: 16.0,  status: 'In Progress' },
  { id: 'i6',  ticketRef: 'INC-2026-1084', asset: 'ESM-SOL-001', priority: 'P3', category: 'Monitoring alert',     created: '2026-05-28 12:15', assignee: 'P. Nkosi',    slaDeadline: '2026-06-01 12:15', hoursRemaining: 72.2,  status: 'Open'       },
  { id: 'i7',  ticketRef: 'INC-2026-1083', asset: 'ESM-BES-001', priority: 'P3', category: 'Cooling fan noise',    created: '2026-05-28 08:40', assignee: 'A. Mokoena',  slaDeadline: '2026-06-01 08:40', hoursRemaining: 68.6,  status: 'Open'       },
  { id: 'i8',  ticketRef: 'INC-2026-1082', asset: 'ESM-WIN-004', priority: 'P2', category: 'Yaw motor fault',      created: '2026-05-27 22:10', assignee: 'L. Dlamini',  slaDeadline: '2026-05-28 14:10', hoursRemaining: -12.8, status: 'Overdue'    },
  { id: 'i9',  ticketRef: 'INC-2026-1081', asset: 'ESM-SOL-004', priority: 'P3', category: 'DC fuse blown',        created: '2026-05-27 15:30', assignee: 'T. Sithole',  slaDeadline: '2026-05-31 15:30', hoursRemaining: 27.5,  status: 'In Progress' },
  { id: 'i10', ticketRef: 'INC-2026-1080', asset: 'ESM-WIN-001', priority: 'P2', category: 'SCADA comms lost',     created: '2026-05-27 10:00', assignee: 'P. Nkosi',    slaDeadline: '2026-05-28 02:00', hoursRemaining: -19.1, status: 'Overdue'    },
  { id: 'i11', ticketRef: 'INC-2026-1079', asset: 'ESM-BES-003', priority: 'P3', category: 'Firmware update req.', created: '2026-05-26 14:00', assignee: 'A. Mokoena',  slaDeadline: '2026-05-30 14:00', hoursRemaining: -2.1,  status: 'Overdue'    },
  { id: 'i12', ticketRef: 'INC-2026-1078', asset: 'ESM-SOL-002', priority: 'P3', category: 'IR scan required',     created: '2026-05-26 09:20', assignee: 'L. Dlamini',  slaDeadline: '2026-05-30 09:20', hoursRemaining: -5.8,  status: 'Overdue'    },
  { id: 'i13', ticketRef: 'INC-2026-1077', asset: 'ESM-WIN-003', priority: 'P2', category: 'Oil leak detection',   created: '2026-05-25 16:45', assignee: 'T. Sithole',  slaDeadline: '2026-05-26 08:45', hoursRemaining: -48.4, status: 'Escalated'  },
  { id: 'i14', ticketRef: 'INC-2026-1076', asset: 'ESM-SOL-005', priority: 'P1', category: 'Transformer hot spot', created: '2026-05-25 12:00', assignee: 'P. Nkosi',    slaDeadline: '2026-05-25 14:00', hoursRemaining: -50.1, status: 'Escalated'  },
  { id: 'i15', ticketRef: 'INC-2026-1075', asset: 'ESM-BES-002', priority: 'P3', category: 'Capacity test due',    created: '2026-05-24 10:30', assignee: 'A. Mokoena',  slaDeadline: '2026-05-28 10:30', hoursRemaining: -37.6, status: 'Overdue'    },
];

interface SparePartRow {
  id: string;
  partNo: string;
  description: string;
  vedClass: string;
  onHandQty: number;
  reserved: number;
  available: number;
  minStock: number;
  leadTimeDays: number;
  status: string;
}

const SPARE_PARTS_FALLBACK: SparePartRow[] = [
  { id: 'sp1',  partNo: 'INV-IGBT-3PH-400',  description: 'IGBT Module 3-phase 400V',     vedClass: 'Vital',      onHandQty:  2, reserved: 1, available: 1, minStock:  2, leadTimeDays:  21, status: 'Low Stock' },
  { id: 'sp2',  partNo: 'GBX-BRG-SKF-6310',  description: 'Gearbox Main Bearing SKF6310', vedClass: 'Vital',      onHandQty:  0, reserved: 0, available: 0, minStock:  1, leadTimeDays:  45, status: 'Out of Stock' },
  { id: 'sp3',  partNo: 'BAT-CELL-LFP-280',  description: 'LFP Cell Module 280Ah',        vedClass: 'Essential',  onHandQty:  8, reserved: 4, available: 4, minStock:  4, leadTimeDays:  30, status: 'Adequate'  },
  { id: 'sp4',  partNo: 'PIT-ACT-HYD-48V',   description: 'Pitch Actuator Hydraulic 48V', vedClass: 'Vital',      onHandQty:  1, reserved: 1, available: 0, minStock:  2, leadTimeDays:  28, status: 'Critical'  },
  { id: 'sp5',  partNo: 'FUS-DC-1000V-250A',  description: 'DC Fuse 1000V 250A',          vedClass: 'Desirable',  onHandQty: 24, reserved: 2, available: 22, minStock: 10, leadTimeDays:   7, status: 'Adequate'  },
  { id: 'sp6',  partNo: 'CBX-CMBN-3P-630A',  description: 'String Combiner Box 630A',     vedClass: 'Essential',  onHandQty:  3, reserved: 1, available: 2, minStock:  2, leadTimeDays:  14, status: 'Adequate'  },
  { id: 'sp7',  partNo: 'YAW-MTR-3PH-7.5KW', description: 'Yaw Drive Motor 7.5kW',        vedClass: 'Vital',      onHandQty:  0, reserved: 0, available: 0, minStock:  1, leadTimeDays:  35, status: 'Out of Stock' },
  { id: 'sp8',  partNo: 'BMS-FW-V4.2.1',     description: 'BMS Firmware Module V4.2.1',   vedClass: 'Desirable',  onHandQty:  5, reserved: 0, available: 5, minStock:  2, leadTimeDays:   3, status: 'Adequate'  },
  { id: 'sp9',  partNo: 'TRAFO-MV-1MVA',     description: 'MV Transformer 1MVA 11kV',     vedClass: 'Vital',      onHandQty:  1, reserved: 0, available: 1, minStock:  1, leadTimeDays:  90, status: 'Adequate'  },
  { id: 'sp10', partNo: 'OIL-GEAR-VG320',    description: 'Gearbox Oil VG320 205L',        vedClass: 'Desirable',  onHandQty: 12, reserved: 2, available: 10, minStock:  4, leadTimeDays:   5, status: 'Adequate'  },
  { id: 'sp11', partNo: 'FAN-COOL-48V-EC',   description: 'EC Cooling Fan 48V',            vedClass: 'Essential',  onHandQty:  2, reserved: 0, available: 2, minStock:  4, leadTimeDays:  10, status: 'Low Stock' },
  { id: 'sp12', partNo: 'CBL-DC-4MM2-100M',  description: 'DC Cable 4mm² 100m Roll',      vedClass: 'Desirable',  onHandQty:  6, reserved: 1, available: 5, minStock:  3, leadTimeDays:   7, status: 'Adequate'  },
];

interface WarrantyRow {
  id: string;
  claimRef: string;
  defectClass: string;
  oem: string;
  failedComponent: string;
  claimedZar: number;
  recoveryRatePct: number;
  status: string;
  eta: string;
}

const WARRANTY_CLAIMS_FALLBACK: WarrantyRow[] = [
  { id: 'wc1', claimRef: 'WRC-2026-0041', defectClass: 'Systemic',    oem: 'SMA Solar Technology',   failedComponent: 'IGBT Module batch A3',  claimedZar:  420000, recoveryRatePct: 92, status: 'Assessment',  eta: '2026-06-14' },
  { id: 'wc2', claimRef: 'WRC-2026-0040', defectClass: 'Latent',      oem: 'Vestas Wind Systems',    failedComponent: 'Main bearing grade change', claimedZar: 1840000, recoveryRatePct: 71, status: 'Negotiation', eta: '2026-07-08' },
  { id: 'wc3', claimRef: 'WRC-2026-0039', defectClass: 'Manufacturing', oem: 'BYD Battery',          failedComponent: 'LFP cell cluster B-07', claimedZar:  680000, recoveryRatePct: 85, status: 'Approved',    eta: '2026-06-30' },
  { id: 'wc4', claimRef: 'WRC-2026-0038', defectClass: 'Design',      oem: 'Bosch Rexroth',          failedComponent: 'Pitch hydraulic seal',  claimedZar:  290000, recoveryRatePct: 44, status: 'Disputed',    eta: '2026-08-15' },
  { id: 'wc5', claimRef: 'WRC-2026-0037', defectClass: 'Latent',      oem: 'ABB Power Electronics', failedComponent: 'DC/DC converter unit',  claimedZar:  540000, recoveryRatePct: 78, status: 'Negotiation', eta: '2026-07-22' },
  { id: 'wc6', claimRef: 'WRC-2026-0036', defectClass: 'Manufacturing', oem: 'Siemens Gamesa',       failedComponent: 'Yaw drive motor winding', claimedZar: 320000, recoveryRatePct: 88, status: 'Assessment',  eta: '2026-06-20' },
  { id: 'wc7', claimRef: 'WRC-2026-0035', defectClass: 'Systemic',    oem: 'SMA Solar Technology',   failedComponent: 'SCADA comms module',    claimedZar:  185000, recoveryRatePct: 38, status: 'Disputed',    eta: '2026-09-01' },
  { id: 'wc8', claimRef: 'WRC-2026-0034', defectClass: 'Design',      oem: 'Schneider Electric',     failedComponent: 'MV transformer winding', claimedZar: 2100000, recoveryRatePct: 61, status: 'Assessment',  eta: '2026-10-15' },
];

// ─── Column definitions ───────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' };

const volumeCols: Column<TicketVolumeRow>[] = [
  { key: 'period',       header: 'Period',              sortable: true },
  { key: 'p1Open',       header: 'P1 Open',             align: 'right', mono: true },
  { key: 'p1Closed',     header: 'P1 Closed',           align: 'right', mono: true },
  { key: 'p2Open',       header: 'P2 Open',             align: 'right', mono: true },
  { key: 'p2Closed',     header: 'P2 Closed',           align: 'right', mono: true },
  { key: 'p3Open',       header: 'P3 Open',             align: 'right', mono: true },
  { key: 'p3Closed',     header: 'P3 Closed',           align: 'right', mono: true },
  {
    key: 'avgResTimeH',
    header: 'Avg Res. Time (h)',
    align: 'right',
    render: (row) => <span style={MONO}>{row.avgResTimeH.toFixed(1)}</span>,
  },
  {
    key: 'slaMetPct',
    header: 'SLA Met %',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: row.slaMetPct < 90 ? 'var(--oe-rose)' : row.slaMetPct < 95 ? 'var(--oe-amber)' : 'var(--oe-green)', fontWeight: 600 }}>
        {row.slaMetPct.toFixed(1)}%
      </span>
    ),
  },
];

// Live SLA burn rate row shape (individual ticket view)
interface TicketSlaBurnRow {
  id: string;
  ticket_ref: string;
  priority: string;
  hours_remaining: number;
  status: string;
}

const ticketSlaBurnCols: Column<TicketSlaBurnRow>[] = [
  { key: 'ticket_ref', header: 'Ticket Ref',    sortable: true },
  {
    key: 'priority',
    header: 'Priority',
    render: (row) => (
      <span style={{ ...MONO, color: row.priority === 'P1' ? 'var(--oe-rose)' : 'var(--oe-text-1)', fontWeight: row.priority === 'P1' ? 700 : 400 }}>
        {row.priority}
      </span>
    ),
  },
  {
    key: 'hours_remaining',
    header: 'Hours Remaining',
    align: 'right',
    render: (row) => {
      const color = row.hours_remaining < 0
        ? 'var(--oe-rose)'
        : row.hours_remaining < 8
          ? 'var(--oe-amber)'
          : 'var(--oe-green)';
      const weight = row.hours_remaining < 2 ? 700 : 400;
      const label = row.hours_remaining < 0
        ? `${Math.abs(row.hours_remaining).toFixed(1)}h overdue`
        : `${row.hours_remaining.toFixed(1)}h`;
      return <span style={{ ...MONO, color, fontWeight: weight }}>{label}</span>;
    },
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} />,
  },
];

const incidentCols: Column<IncidentRow>[] = [
  { key: 'ticketRef',      header: 'Ticket Ref',         sortable: true },
  { key: 'asset',          header: 'Asset' },
  {
    key: 'priority',
    header: 'Priority',
    render: (row) => (
      <span style={{ ...MONO, color: row.priority === 'P1' ? 'var(--oe-rose)' : 'var(--oe-text-1)', fontWeight: row.priority === 'P1' ? 700 : 400 }}>
        {row.priority}
      </span>
    ),
  },
  { key: 'category',       header: 'Category' },
  { key: 'created',        header: 'Created' },
  { key: 'assignee',       header: 'Assignee' },
  { key: 'slaDeadline',    header: 'SLA Deadline' },
  {
    key: 'hoursRemaining',
    header: 'Hours Remaining',
    align: 'right',
    render: (row) => {
      const color = row.hoursRemaining < 0
        ? 'var(--oe-rose)'
        : row.hoursRemaining < 8
          ? 'var(--oe-amber)'
          : 'var(--oe-green)';
      const weight = row.hoursRemaining < 2 ? 700 : 400;
      const label = row.hoursRemaining < 0
        ? `${Math.abs(row.hoursRemaining).toFixed(1)}h overdue`
        : `${row.hoursRemaining.toFixed(1)}h`;
      return <span style={{ ...MONO, color, fontWeight: weight }}>{label}</span>;
    },
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} />,
  },
];

const partsCols: Column<SparePartRow>[] = [
  { key: 'partNo',         header: 'Part No',            sortable: true },
  { key: 'description',    header: 'Description' },
  {
    key: 'vedClass',
    header: 'VED Class',
    render: (row) => (
      <span
        style={{
          ...MONO,
          fontSize: '10px',
          fontWeight: 700,
          color: row.vedClass === 'Vital' ? 'var(--oe-rose)' : 'var(--oe-text-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {row.vedClass}
      </span>
    ),
  },
  { key: 'onHandQty',      header: 'On Hand (qty)',      align: 'right', mono: true },
  { key: 'reserved',       header: 'Reserved',           align: 'right', mono: true },
  {
    key: 'available',
    header: 'Available',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: row.available < row.minStock ? 'var(--oe-rose)' : 'var(--oe-text-1)', fontWeight: row.available < row.minStock ? 700 : 400 }}>
        {row.available}
      </span>
    ),
  },
  { key: 'minStock',       header: 'Min Stock',          align: 'right', mono: true },
  { key: 'leadTimeDays',   header: 'Lead Time (days)',   align: 'right', mono: true },
  {
    key: 'status',
    header: 'Status',
    render: (row) => {
      const v = row.status === 'Out of Stock' || row.status === 'Critical'
        ? 'rose'
        : row.status === 'Low Stock'
          ? 'amber'
          : 'green';
      return <StatusPill label={row.status} variant={v} />;
    },
  },
];

const warrantyCols: Column<WarrantyRow>[] = [
  { key: 'claimRef',         header: 'Claim Ref',          sortable: true },
  {
    key: 'defectClass',
    header: 'Defect Class',
    render: (row) => {
      const v = row.defectClass === 'Systemic' ? 'rose' : row.defectClass === 'Design' ? 'amber' : 'default';
      return <StatusPill label={row.defectClass} variant={v} />;
    },
  },
  { key: 'oem',              header: 'OEM' },
  { key: 'failedComponent',  header: 'Failed Component' },
  {
    key: 'claimedZar',
    header: 'Claimed (ZAR)',
    align: 'right',
    render: (row) => <span style={MONO}>R {row.claimedZar.toLocaleString()}</span>,
  },
  {
    key: 'recoveryRatePct',
    header: 'Recovery Rate %',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: row.recoveryRatePct < 50 ? 'var(--oe-rose)' : row.recoveryRatePct < 80 ? 'var(--oe-amber)' : 'var(--oe-green)', fontWeight: 600 }}>
        {row.recoveryRatePct}%
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} />,
  },
  { key: 'eta',              header: 'ETA',                sortable: true },
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

export function OemAnalytics() {
  const { data: tickets, loading: ticketsLoading } = useOemTickets();
  const { data: spareParts, loading: partsLoading } = useOemSpareParts();
  const { data: warrantyRecovery, loading: warrantyLoading } = useOemWarrantyRecovery();

  // ─── KPI computation ─────────────────────────────────────────────────────
  const openTickets = tickets.length;
  const criticalTickets = tickets.filter((t) => t.priority === 'P1').length;
  const stockoutRisk = spareParts.filter((p) => (p.on_hand ?? 0) <= (p.min_stock ?? 0)).length;
  const warrantyValue = warrantyRecovery.reduce((s, w) => s + (w.claimed_zar || 0), 0);

  // ─── Live SLA burn rows (individual tickets) ──────────────────────────────
  const liveSlaBurnRows: TicketSlaBurnRow[] = tickets.map((t) => ({
    id: t.id,
    ticket_ref: t.ticket_ref,
    priority: t.priority,
    hours_remaining: t.hours_remaining ?? 0,
    status: t.status,
  }));

  // ─── Live incident rows ───────────────────────────────────────────────────
  const liveIncidentRows: IncidentRow[] = tickets.length
    ? tickets.map((t) => ({
        id: t.id,
        ticketRef: t.ticket_ref,
        asset: t.asset_name ?? '—',
        priority: t.priority,
        category: t.category,
        created: t.created_at ? t.created_at.slice(0, 16).replace('T', ' ') : '',
        assignee: t.assignee ?? '—',
        slaDeadline: t.sla_deadline ? t.sla_deadline.slice(0, 16).replace('T', ' ') : '—',
        hoursRemaining: t.hours_remaining ?? 0,
        status: t.status,
      }))
    : INCIDENTS_FALLBACK;

  // ─── Live spare parts rows ────────────────────────────────────────────────
  const livePartsRows: SparePartRow[] = spareParts.length
    ? spareParts.map((p) => ({
        id: p.id,
        partNo: p.part_number,
        description: p.description ?? p.id,
        vedClass: p.ved_class,
        onHandQty: p.on_hand ?? 0,
        reserved: p.reserved ?? 0,
        available: p.available ?? 0,
        minStock: p.min_stock ?? 0,
        leadTimeDays: p.lead_time_days ?? 0,
        status: p.status,
      }))
    : SPARE_PARTS_FALLBACK;

  // ─── Live warranty rows ───────────────────────────────────────────────────
  const liveWarrantyRows: WarrantyRow[] = warrantyRecovery.length
    ? warrantyRecovery.map((w) => ({
        id: w.id,
        claimRef: w.claim_ref,
        defectClass: w.defect_class,
        oem: w.oem_name,
        failedComponent: w.failed_component,
        claimedZar: w.claimed_zar ?? 0,
        recoveryRatePct: w.recovery_rate_pct ?? 0,
        status: w.status,
        eta: w.eta ?? '—',
      }))
    : WARRANTY_CLAIMS_FALLBACK;

  const useLiveSlaBurn = tickets.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px' }}>
      {/* Page title */}
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0 }}>
          Support &amp; Service Analytics
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--oe-text-3)', margin: '4px 0 0' }}>
          Live ticket volumes, SLA performance, parts inventory &amp; warranty recovery
        </p>
      </div>

      {/* KPI row */}
      <StatGrid cols={5}>
        <StatCard
          label="Open Tickets"
          value={ticketsLoading ? '…' : String(openTickets)}
          variant={openTickets > 20 ? 'rose' : openTickets > 5 ? 'amber' : 'green'}
          icon="ticket"
          subtext={ticketsLoading ? 'Loading…' : `${criticalTickets} P1 priority`}
        />
        <StatCard
          label="P1 Critical Tickets"
          value={ticketsLoading ? '…' : String(criticalTickets)}
          variant={criticalTickets > 3 ? 'rose' : criticalTickets > 0 ? 'amber' : 'green'}
          icon="check-circle"
          subtext="P1 open now"
        />
        <StatCard label="Avg Resolution (h)" value="6.4" unit="h" variant="green" icon="clock" subtext="All priorities" />
        <StatCard
          label="Parts Stockout Risk"
          value={partsLoading ? '…' : String(stockoutRisk)}
          variant={stockoutRisk > 3 ? 'rose' : stockoutRisk > 0 ? 'amber' : 'green'}
          icon="alert-triangle"
          subtext={partsLoading ? 'Loading…' : 'At or below min stock'}
        />
        <StatCard
          label="Warranty Claims Value"
          value={warrantyLoading ? '…' : `R${(warrantyValue / 1_000_000).toFixed(1)}M`}
          variant="amber"
          icon="scales"
          subtext={warrantyLoading ? 'Loading…' : `${liveWarrantyRows.length} open claims`}
        />
      </StatGrid>

      {/* Ticket SLA Burn Rate */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <SectionHead
          label="Ticket Volumes"
          title={
            useLiveSlaBurn
              ? `Live Ticket SLA Burn — ${liveSlaBurnRows.length} Tickets`
              : 'Weekly Ticket Volume & SLA — Last 8 Weeks'
          }
        />
        {useLiveSlaBurn ? (
          <DataTable<TicketSlaBurnRow> columns={ticketSlaBurnCols} rows={liveSlaBurnRows} compact />
        ) : (
          <DataTable<TicketVolumeRow> columns={volumeCols} rows={TICKET_VOLUMES_FALLBACK} compact />
        )}
      </div>

      {/* Open Incidents */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <SectionHead label="Open Incidents" title={`Active Incident Queue — ${liveIncidentRows.length} Open Tickets`} />
        <DataTable<IncidentRow> columns={incidentCols} rows={liveIncidentRows} compact />
      </div>

      {/* Spare Parts Inventory */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <SectionHead label="Inventory" title={`Spare Parts Stock Status — ${livePartsRows.length} SKUs`} />
        <DataTable<SparePartRow> columns={partsCols} rows={livePartsRows} compact />
      </div>

      {/* Warranty Recovery Pipeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <SectionHead
          label="Warranty Recovery"
          title={`Open Warranty Claims Pipeline — R${(warrantyValue / 1_000_000).toFixed(1)}M In Claim`}
        />
        <DataTable<WarrantyRow> columns={warrantyCols} rows={liveWarrantyRows} compact />
      </div>
    </div>
  );
}

export default OemAnalytics;
