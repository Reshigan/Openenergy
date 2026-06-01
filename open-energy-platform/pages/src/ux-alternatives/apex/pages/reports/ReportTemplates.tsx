/**
 * ReportTemplates — Apex Reports
 *
 * 10 Bloomberg Terminal-grade report view components.
 * All inline styles. CSS variables only. No Tailwind. No hardcoded hex.
 * Font: DM Sans UI, JetBrains Mono for numbers/hashes/IDs.
 */

import React from 'react';
import { OeIcon } from '../../components/icons/Icons';
import { StatusPill, stateVariant } from '../../components/display/StatusPill';
import { DataTable, Column } from '../../components/display/DataTable';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <h3
        style={{
          margin: 0,
          fontSize: '15px',
          fontWeight: 700,
          color: 'var(--oe-text-1)',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h3>
      {subtitle && (
        <p
          style={{
            margin: '3px 0 0',
            fontSize: '12px',
            color: 'var(--oe-text-3)',
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

function ReportContainer({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        padding: '2px 0',
        animation: 'oe-pageFade 120ms var(--oe-ease)',
      }}
    >
      {children}
    </div>
  );
}

function TamperBadge() {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        background: 'var(--oe-green-bg)',
        border: '1px solid var(--oe-green-ring)',
        borderRadius: 'var(--oe-r-pill)',
        fontSize: '11px',
        fontWeight: 700,
        color: 'var(--oe-green)',
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
      }}
    >
      <OeIcon name="shield" size={12} color="var(--oe-green)" />
      Tamper-Evident Audit Log
    </div>
  );
}

function mono(value: string): React.ReactNode {
  return (
    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums', fontSize: '12px' }}>
      {value}
    </span>
  );
}

function coloredNum(value: string, positive: boolean): React.ReactNode {
  return (
    <span
      style={{
        fontFamily: '"JetBrains Mono", monospace',
        fontVariantNumeric: 'tabular-nums',
        fontSize: '12px',
        color: positive ? 'var(--oe-green)' : 'var(--oe-rose)',
        fontWeight: 600,
      }}
    >
      {value}
    </span>
  );
}

function StatusBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <StatusPill
      label={label}
      variant={ok ? 'green' : 'rose'}
      dot
      size="sm"
    />
  );
}

// ─── 1. SOX Audit Trail Report ────────────────────────────────────────────────

interface AuditRow {
  id: string;
  seq: string;
  ts: string;
  actor: string;
  role: string;
  entityType: string;
  entityId: string;
  action: string;
  hash: string;
}

const AUDIT_ROWS: AuditRow[] = [
  { id: '1',  seq: '0001', ts: '2026-05-31 08:14:02', actor: 'T. Nkosi',     role: 'trader',         entityType: 'Order',       entityId: 'ORD-2841', action: 'create',      hash: 'a3f8b21c9d4e7f01' },
  { id: '2',  seq: '0002', ts: '2026-05-31 08:14:44', actor: 'T. Nkosi',     role: 'trader',         entityType: 'Order',       entityId: 'ORD-2841', action: 'fill',        hash: 'c7d2e09af8341bc5' },
  { id: '3',  seq: '0003', ts: '2026-05-31 08:31:10', actor: 'R. Dlamini',   role: 'admin',          entityType: 'User',        entityId: 'USR-0042', action: 'kyc_approve', hash: '9e1f4a72b308dc6e' },
  { id: '4',  seq: '0004', ts: '2026-05-31 09:02:15', actor: 'L. van der M', role: 'lender',         entityType: 'Drawdown',    entityId: 'DRW-0019', action: 'approve',     hash: 'f5b3c814a0e2971d' },
  { id: '5',  seq: '0005', ts: '2026-05-31 09:15:50', actor: 'System',       role: 'cron',           entityType: 'Settlement',  entityId: 'SET-0234', action: 'settle',      hash: '2d8a637c5e091bf4' },
  { id: '6',  seq: '0006', ts: '2026-05-31 09:31:44', actor: 'K. Mokoena',   role: 'ipp_developer',  entityType: 'Project',     entityId: 'PRJ-0011', action: 'cod_submit',  hash: 'e4f7201b9c638da5' },
  { id: '7',  seq: '0007', ts: '2026-05-31 10:05:22', actor: 'M. Sithole',   role: 'regulator',      entityType: 'Licence',     entityId: 'LIC-0088', action: 'grant',       hash: '17ba5de30f4c82e9' },
  { id: '8',  seq: '0008', ts: '2026-05-31 10:18:07', actor: 'P. Joubert',   role: 'carbon_fund',    entityType: 'Credit',      entityId: 'CRD-0451', action: 'retire',      hash: 'b0c9f3a741e52d68' },
  { id: '9',  seq: '0009', ts: '2026-05-31 10:42:33', actor: 'T. Nkosi',     role: 'trader',         entityType: 'Position',    entityId: 'POS-0177', action: 'limit_check', hash: '5e8d4f2c1a7b30e6' },
  { id: '10', seq: '0010', ts: '2026-05-31 11:00:01', actor: 'System',       role: 'cron',           entityType: 'MarginCall',  entityId: 'MCL-0033', action: 'issue',       hash: 'd3a6c21bf98e7054' },
  { id: '11', seq: '0011', ts: '2026-05-31 11:17:45', actor: 'L. van der M', role: 'lender',         entityType: 'Covenant',    entityId: 'COV-0014', action: 'breach',      hash: '6c1e85df3b2970a4' },
  { id: '12', seq: '0012', ts: '2026-05-31 11:32:09', actor: 'M. Sithole',   role: 'regulator',      entityType: 'Inspection',  entityId: 'INS-0007', action: 'open',        hash: '04f7b3e91ac682d5' },
  { id: '13', seq: '0013', ts: '2026-05-31 12:05:17', actor: 'K. Mokoena',   role: 'ipp_developer',  entityType: 'Insurance',   entityId: 'INS-CLIM', action: 'submit',      hash: 'a91d503fc2874be8' },
  { id: '14', seq: '0014', ts: '2026-05-31 12:44:02', actor: 'P. Joubert',   role: 'carbon_fund',    entityType: 'MRV',         entityId: 'MRV-0029', action: 'validate',    hash: '7e2a4fc8b5310d96' },
  { id: '15', seq: '0015', ts: '2026-05-31 13:01:55', actor: 'R. Dlamini',   role: 'admin',          entityType: 'Config',      entityId: 'CFG-RATE', action: 'update',      hash: '3b8f710de2a96c54' },
];

const AUDIT_COLS: Column<AuditRow>[] = [
  { key: 'seq',        header: 'Seq #',       width: '60px',  mono: true,  align: 'right', render: r => mono(r.seq) },
  { key: 'ts',         header: 'Timestamp',   width: '180px', mono: true,  render: r => mono(r.ts) },
  { key: 'actor',      header: 'Actor',       width: '140px' },
  { key: 'role',       header: 'Role',        width: '130px', render: r => <StatusPill label={r.role.replace('_',' ')} variant="default" dot={false} size="xs" /> },
  { key: 'entityType', header: 'Entity Type', width: '110px' },
  { key: 'entityId',   header: 'Entity ID',   width: '110px', mono: true,  render: r => mono(r.entityId) },
  { key: 'action',     header: 'Action',      width: '120px', render: r => <StatusPill label={r.action} variant={stateVariant(r.action)} dot size="xs" /> },
  { key: 'hash',       header: 'SHA-256 Hash', render: r => (
    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)', letterSpacing: '0.02em' }}>
      {r.hash}…
    </span>
  )},
];

export function SoxAuditTrailReport() {
  return (
    <ReportContainer>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <SectionHeader
          title="SOX 302/404 Immutable Audit Trail"
          subtitle="Cryptographically chained event log — all platform mutations. Read-only."
        />
        <TamperBadge />
      </div>
      <DataTable<AuditRow>
        columns={AUDIT_COLS}
        rows={AUDIT_ROWS}
        compact
        stickyHeader
      />
      <div style={{ fontSize: '11px', color: 'var(--oe-text-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <OeIcon name="info-circle" size={12} color="var(--oe-text-4)" />
        Hash chain verified. Full SHA-256 available on export. Showing last 15 events.
      </div>
    </ReportContainer>
  );
}

// ─── 2. Segregation of Duties Matrix ─────────────────────────────────────────

const SOD_ROLES = [
  'admin', 'trader', 'ipp_developer', 'lender', 'offtaker',
  'regulator', 'grid_operator', 'carbon_fund', 'support',
];

type CapKey = 'Approve' | 'Execute' | 'Audit' | 'Configure' | 'Report' | 'Admin';

const CAPS: CapKey[] = ['Approve', 'Execute', 'Audit', 'Configure', 'Report', 'Admin'];

const SOD_MATRIX: Record<string, Partial<Record<CapKey, boolean | 'conflict'>>> = {
  admin:          { Approve: true,      Execute: true,      Audit: true,     Configure: true,  Report: true,  Admin: true },
  trader:         { Approve: false,     Execute: true,      Audit: false,    Configure: false, Report: true,  Admin: false },
  ipp_developer:  { Approve: false,     Execute: true,      Audit: false,    Configure: false, Report: true,  Admin: false },
  lender:         { Approve: true,      Execute: false,     Audit: false,    Configure: false, Report: true,  Admin: false },
  offtaker:       { Approve: false,     Execute: true,      Audit: false,    Configure: false, Report: true,  Admin: false },
  regulator:      { Approve: true,      Execute: false,     Audit: true,     Configure: false, Report: true,  Admin: false },
  grid_operator:  { Approve: 'conflict',Execute: true,      Audit: false,    Configure: true,  Report: true,  Admin: false },
  carbon_fund:    { Approve: true,      Execute: false,     Audit: false,    Configure: false, Report: true,  Admin: false },
  support:        { Approve: false,     Execute: 'conflict', Audit: true,    Configure: true,  Report: true,  Admin: false },
};

export function SodMatrixReport() {
  const thStyle: React.CSSProperties = {
    padding: '9px 14px',
    background: 'var(--oe-grad-table-head)',
    borderBottom: '1px solid var(--oe-border)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--oe-text-3)',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  };

  const tdBase: React.CSSProperties = {
    padding: '0 14px',
    height: '42px',
    textAlign: 'center',
    verticalAlign: 'middle',
    borderBottom: '1px solid var(--oe-border-2)',
  };

  function cellContent(val: boolean | 'conflict' | undefined) {
    if (val === true)       return <OeIcon name="check-circle" size={15} color="var(--oe-green)" />;
    if (val === 'conflict') return <OeIcon name="alert-triangle" size={15} color="var(--oe-amber)" />;
    return <OeIcon name="x-circle" size={15} color="var(--oe-text-4)" />;
  }

  return (
    <ReportContainer>
      <SectionHeader
        title="Segregation of Duties Matrix"
        subtitle="Role x Capability access control. Amber = conflict requiring compensating control."
      />
      <div
        style={{
          background: 'var(--oe-canvas)',
          border: '1px solid var(--oe-border)',
          borderRadius: 'var(--oe-r-card)',
          overflow: 'hidden',
          boxShadow: 'var(--oe-shadow-card)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left', width: '160px' }}>Role</th>
                {CAPS.map(c => <th key={c} style={thStyle}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {SOD_ROLES.map((role, i) => (
                <tr key={role}>
                  <td
                    style={{
                      ...tdBase,
                      textAlign: 'left',
                      fontWeight: 600,
                      fontSize: '12px',
                      color: 'var(--oe-text-2)',
                      borderBottom: i < SOD_ROLES.length - 1 ? '1px solid var(--oe-border-2)' : 'none',
                    }}
                  >
                    {role.replace('_', ' ')}
                  </td>
                  {CAPS.map(cap => {
                    const val = SOD_MATRIX[role]?.[cap];
                    const isConflict = val === 'conflict';
                    return (
                      <td
                        key={cap}
                        style={{
                          ...tdBase,
                          background: isConflict ? 'var(--oe-amber-bg)' : 'transparent',
                          borderBottom: i < SOD_ROLES.length - 1 ? '1px solid var(--oe-border-2)' : 'none',
                        }}
                      >
                        {cellContent(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--oe-text-3)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><OeIcon name="check-circle" size={12} color="var(--oe-green)" /> Permitted</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><OeIcon name="alert-triangle" size={12} color="var(--oe-amber)" /> Conflict (compensating control required)</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><OeIcon name="x-circle" size={12} color="var(--oe-text-4)" /> Denied</span>
      </div>
    </ReportContainer>
  );
}

// ─── 3. Three-Way Match Report ────────────────────────────────────────────────

interface MatchRow {
  id: string;
  drawdownRef: string;
  amount: string;
  ieCertRef: string;
  disbRef: string;
  matchStatus: 'MATCHED' | 'OPEN' | 'VARIANCE';
  variance: string;
}

const MATCH_ROWS: MatchRow[] = [
  { id: '1', drawdownRef: 'DRW-0014', amount: 'R 45,000,000', ieCertRef: 'IEC-0024', disbRef: 'DSB-0031', matchStatus: 'MATCHED',  variance: '—' },
  { id: '2', drawdownRef: 'DRW-0015', amount: 'R 32,500,000', ieCertRef: 'IEC-0025', disbRef: 'DSB-0032', matchStatus: 'MATCHED',  variance: '—' },
  { id: '3', drawdownRef: 'DRW-0016', amount: 'R 18,750,000', ieCertRef: 'IEC-0026', disbRef: 'DSB-0033', matchStatus: 'VARIANCE', variance: 'R 250,000' },
  { id: '4', drawdownRef: 'DRW-0017', amount: 'R 62,000,000', ieCertRef: 'IEC-0027', disbRef: '—',        matchStatus: 'OPEN',     variance: '—' },
  { id: '5', drawdownRef: 'DRW-0018', amount: 'R 27,300,000', ieCertRef: 'IEC-0028', disbRef: 'DSB-0035', matchStatus: 'MATCHED',  variance: '—' },
  { id: '6', drawdownRef: 'DRW-0019', amount: 'R 54,100,000', ieCertRef: '—',        disbRef: '—',        matchStatus: 'OPEN',     variance: '—' },
  { id: '7', drawdownRef: 'DRW-0020', amount: 'R 38,900,000', ieCertRef: 'IEC-0030', disbRef: 'DSB-0037', matchStatus: 'VARIANCE', variance: 'R 1,100,000' },
];

const MATCH_COLS: Column<MatchRow>[] = [
  { key: 'drawdownRef', header: 'Drawdown Ref',    mono: true, render: r => mono(r.drawdownRef) },
  { key: 'amount',      header: 'Amount',          mono: true, align: 'right', render: r => mono(r.amount) },
  { key: 'ieCertRef',   header: 'IE Cert Ref',     mono: true, render: r => mono(r.ieCertRef) },
  { key: 'disbRef',     header: 'Disbursement Ref', mono: true, render: r => mono(r.disbRef) },
  {
    key: 'matchStatus',
    header: 'Match Status',
    render: r => (
      <StatusPill
        label={r.matchStatus}
        variant={r.matchStatus === 'MATCHED' ? 'green' : r.matchStatus === 'OPEN' ? 'blue' : 'rose'}
        dot
        size="sm"
      />
    ),
  },
  {
    key: 'variance',
    header: 'Variance',
    align: 'right',
    render: r => r.variance === '—'
      ? mono('—')
      : <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: 'var(--oe-rose)', fontWeight: 600 }}>{r.variance}</span>,
  },
];

export function ThreeWayMatchReport() {
  return (
    <ReportContainer>
      <SectionHeader
        title="Three-Way Match — Drawdown / IE Cert / Disbursement"
        subtitle="Project finance reconciliation. Variance requires IE sign-off before next drawdown."
      />
      <DataTable<MatchRow> columns={MATCH_COLS} rows={MATCH_ROWS} compact stickyHeader />
    </ReportContainer>
  );
}

// ─── 4. TCFD Alignment Report ─────────────────────────────────────────────────

interface TcfdItem {
  id: string;
  pillar: string;
  subItem: string;
  status: 'Compliant' | 'Partial' | 'Gap';
  ghgIntensity?: string;
  note: string;
}

const TCFD_ROWS: TcfdItem[] = [
  { id: '1',  pillar: 'Governance',        subItem: 'Board oversight of climate risks',          status: 'Compliant', note: 'ESG committee meets quarterly; minutes in audit vault' },
  { id: '2',  pillar: 'Governance',        subItem: 'Management climate risk roles defined',     status: 'Compliant', note: 'CISO + CRO mandates updated 2026-Q1' },
  { id: '3',  pillar: 'Strategy',          subItem: '2°C / 1.5°C scenario analysis',             status: 'Partial',   note: '1.5°C model pending external validation' },
  { id: '4',  pillar: 'Strategy',          subItem: 'Climate risk in business planning',         status: 'Compliant', note: 'Integrated into 5-year IRP plan' },
  { id: '5',  pillar: 'Strategy',          subItem: 'Transition risk disclosure',                status: 'Compliant', note: 'Disclosed in 2025 annual report' },
  { id: '6',  pillar: 'Risk Management',   subItem: 'Climate risk identification process',       status: 'Compliant', note: 'Quarterly NERSA + DMRE horizon scan' },
  { id: '7',  pillar: 'Risk Management',   subItem: 'Physical risk integration',                 status: 'Gap',       note: 'Flood-zone asset mapping not completed' },
  { id: '8',  pillar: 'Risk Management',   subItem: 'Enterprise risk alignment',                 status: 'Partial',   ghgIntensity: '0.24 tCO2e/MWh', note: 'Partially aligned to ERM framework' },
  { id: '9',  pillar: 'Metrics & Targets', subItem: 'GHG Scope 1 emissions',                    status: 'Compliant', ghgIntensity: '0.08 tCO2e/MWh', note: 'ISO 14064-1 certified' },
  { id: '10', pillar: 'Metrics & Targets', subItem: 'GHG Scope 2 emissions',                    status: 'Compliant', ghgIntensity: '0.19 tCO2e/MWh', note: 'Market-based method applied' },
  { id: '11', pillar: 'Metrics & Targets', subItem: 'Net-zero target year',                      status: 'Partial',   note: 'Target set: 2040; interim milestones TBD' },
  { id: '12', pillar: 'Metrics & Targets', subItem: 'Internal carbon price',                    status: 'Gap',       note: 'Not yet operationalised' },
];

const TCFD_COLS: Column<TcfdItem>[] = [
  { key: 'pillar',   header: 'Pillar',         width: '160px' },
  { key: 'subItem',  header: 'Disclosure Item', width: '280px' },
  {
    key: 'status',
    header: 'Status',
    width: '110px',
    render: r => (
      <StatusPill
        label={r.status}
        variant={r.status === 'Compliant' ? 'green' : r.status === 'Partial' ? 'amber' : 'rose'}
        dot size="sm"
      />
    ),
  },
  {
    key: 'ghgIntensity',
    header: 'GHG Intensity',
    width: '130px',
    align: 'right',
    render: r => r.ghgIntensity ? mono(r.ghgIntensity) : <span style={{ color: 'var(--oe-text-4)' }}>—</span>,
  },
  { key: 'note', header: 'Note', render: r => <span style={{ fontSize: '12px', color: 'var(--oe-text-3)' }}>{r.note}</span> },
];

export function TcfdAlignmentReport() {
  return (
    <ReportContainer>
      <SectionHeader
        title="TCFD Alignment Report"
        subtitle="Task Force on Climate-related Financial Disclosures — four-pillar assessment. Period: FY2025."
      />
      <DataTable<TcfdItem> columns={TCFD_COLS} rows={TCFD_ROWS} compact stickyHeader />
    </ReportContainer>
  );
}

// ─── 5. Scope 1/2/3 GHG Emissions ────────────────────────────────────────────

interface ScopeRow {
  id: string;
  project: string;
  scope1: string;
  scope2: string;
  scope3: string;
  total: string;
  yoyDelta: string;
  intensity: string;
  positive: boolean;
}

const SCOPE_ROWS: ScopeRow[] = [
  { id: '1', project: 'Lephalale Wind Farm',     scope1: '420',   scope2: '180',  scope3: '1,240', total: '1,840', yoyDelta: '-8.4%',  intensity: '0.021', positive: true },
  { id: '2', project: 'Upington Solar PV',        scope1: '310',   scope2: '240',  scope3: '2,180', total: '2,730', yoyDelta: '-12.1%', intensity: '0.018', positive: true },
  { id: '3', project: 'De Aar Storage (BESS)',    scope1: '88',    scope2: '410',  scope3: '890',   total: '1,388', yoyDelta: '+3.2%',  intensity: '0.034', positive: false },
  { id: '4', project: 'Richards Bay Offshore',   scope1: '1,140', scope2: '320',  scope3: '3,400', total: '4,860', yoyDelta: '-5.7%',  intensity: '0.019', positive: true },
  { id: '5', project: 'Medupi Gas Peaker',        scope1: '48,200',scope2: '900',  scope3: '5,120', total: '54,220',yoyDelta: '-1.8%',  intensity: '0.241', positive: true },
  { id: '6', project: 'Nkosi Hydro (DR Congo)',  scope1: '220',   scope2: '110',  scope3: '780',   total: '1,110', yoyDelta: '-14.3%', intensity: '0.009', positive: true },
];

const SCOPE_TOTALS: ScopeRow = { id: 'tot', project: 'TOTAL', scope1: '50,378', scope2: '2,160', scope3: '13,610', total: '66,148', yoyDelta: '-4.1%', intensity: '0.022', positive: true };

const SCOPE_COLS: Column<ScopeRow>[] = [
  { key: 'project',   header: 'Project / Facility', width: '220px' },
  { key: 'scope1',    header: 'Scope 1 (tCO2e)', align: 'right', mono: true, render: r => mono(r.scope1) },
  { key: 'scope2',    header: 'Scope 2 (tCO2e)', align: 'right', mono: true, render: r => mono(r.scope2) },
  { key: 'scope3',    header: 'Scope 3 (tCO2e)', align: 'right', mono: true, render: r => mono(r.scope3) },
  { key: 'total',     header: 'Total (tCO2e)',    align: 'right', mono: true, render: r => <strong style={{ fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums', fontSize: '12px' }}>{r.total}</strong> },
  { key: 'yoyDelta',  header: 'YoY Δ %',          align: 'right', render: r => coloredNum(r.yoyDelta, r.positive) },
  { key: 'intensity', header: 'Intensity (tCO2e/MWh)', align: 'right', mono: true, render: r => mono(r.intensity) },
];

export function Scope123Report() {
  return (
    <ReportContainer>
      <SectionHeader
        title="Scope 1 / 2 / 3 GHG Emissions"
        subtitle="ISO 14064-1 certified. Market-based Scope 2. Scope 3 categories 1+11+15. FY2025."
      />
      <DataTable<ScopeRow>
        columns={SCOPE_COLS}
        rows={SCOPE_ROWS}
        compact
        stickyHeader
        footer={
          <div style={{ display: 'flex', gap: '24px', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: 'var(--oe-text-3)', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Total</span>
            <span>Scope 1: {SCOPE_TOTALS.scope1}</span>
            <span>Scope 2: {SCOPE_TOTALS.scope2}</span>
            <span>Scope 3: {SCOPE_TOTALS.scope3}</span>
            <strong>{SCOPE_TOTALS.total} tCO2e</strong>
            {coloredNum(SCOPE_TOTALS.yoyDelta, SCOPE_TOTALS.positive)}
          </div>
        }
      />
    </ReportContainer>
  );
}

// ─── 6. Trade Revenue P&L Report ─────────────────────────────────────────────

interface RevenueRow {
  id: string;
  month: string;
  grossRevenue: string;
  cogs: string;
  netMargin: string;
  var95: string;
  sharpe: string;
  positiveMargin: boolean;
}

const REVENUE_ROWS: RevenueRow[] = [
  { id: '1',  month: 'Jun 2025', grossRevenue: 'R 284,110,000', cogs: 'R 198,500,000', netMargin: 'R 85,610,000',  var95: 'R 4,200,000',  sharpe: '2.14', positiveMargin: true  },
  { id: '2',  month: 'Jul 2025', grossRevenue: 'R 311,450,000', cogs: 'R 220,100,000', netMargin: 'R 91,350,000',  var95: 'R 4,800,000',  sharpe: '2.31', positiveMargin: true  },
  { id: '3',  month: 'Aug 2025', grossRevenue: 'R 298,700,000', cogs: 'R 215,900,000', netMargin: 'R 82,800,000',  var95: 'R 5,100,000',  sharpe: '1.98', positiveMargin: true  },
  { id: '4',  month: 'Sep 2025', grossRevenue: 'R 325,200,000', cogs: 'R 241,000,000', netMargin: 'R 84,200,000',  var95: 'R 4,600,000',  sharpe: '2.07', positiveMargin: true  },
  { id: '5',  month: 'Oct 2025', grossRevenue: 'R 340,800,000', cogs: 'R 260,300,000', netMargin: 'R 80,500,000',  var95: 'R 5,400,000',  sharpe: '1.87', positiveMargin: true  },
  { id: '6',  month: 'Nov 2025', grossRevenue: 'R 278,400,000', cogs: 'R 222,100,000', netMargin: 'R 56,300,000',  var95: 'R 6,200,000',  sharpe: '1.44', positiveMargin: true  },
  { id: '7',  month: 'Dec 2025', grossRevenue: 'R 189,600,000', cogs: 'R 201,400,000', netMargin: '-R 11,800,000', var95: 'R 7,800,000',  sharpe: '-0.31',positiveMargin: false },
  { id: '8',  month: 'Jan 2026', grossRevenue: 'R 262,300,000', cogs: 'R 196,400,000', netMargin: 'R 65,900,000',  var95: 'R 5,900,000',  sharpe: '1.62', positiveMargin: true  },
  { id: '9',  month: 'Feb 2026', grossRevenue: 'R 301,100,000', cogs: 'R 218,200,000', netMargin: 'R 82,900,000',  var95: 'R 4,700,000',  sharpe: '2.10', positiveMargin: true  },
  { id: '10', month: 'Mar 2026', grossRevenue: 'R 344,800,000', cogs: 'R 248,500,000', netMargin: 'R 96,300,000',  var95: 'R 4,100,000',  sharpe: '2.47', positiveMargin: true  },
  { id: '11', month: 'Apr 2026', grossRevenue: 'R 329,500,000', cogs: 'R 237,900,000', netMargin: 'R 91,600,000',  var95: 'R 4,300,000',  sharpe: '2.29', positiveMargin: true  },
  { id: '12', month: 'May 2026', grossRevenue: 'R 318,200,000', cogs: 'R 228,700,000', netMargin: 'R 89,500,000',  var95: 'R 4,400,000',  sharpe: '2.20', positiveMargin: true  },
];

const REVENUE_COLS: Column<RevenueRow>[] = [
  { key: 'month',        header: 'Month',           width: '100px' },
  { key: 'grossRevenue', header: 'Gross Revenue',   align: 'right', mono: true, render: r => mono(r.grossRevenue) },
  { key: 'cogs',         header: 'COGS',            align: 'right', mono: true, render: r => mono(r.cogs) },
  { key: 'netMargin',    header: 'Net Margin',      align: 'right', render: r => coloredNum(r.netMargin, r.positiveMargin) },
  { key: 'var95',        header: 'VaR (95%)',        align: 'right', mono: true, render: r => mono(r.var95) },
  { key: 'sharpe',       header: 'Sharpe',          align: 'right', render: r => coloredNum(r.sharpe, r.positiveMargin) },
];

export function TradeRevenueReport() {
  return (
    <ReportContainer>
      <SectionHeader
        title="Trading Revenue — Monthly P&L"
        subtitle="Last 12 months. Net margin = gross revenue less COGS. VaR at 95% confidence. Sharpe annualised."
      />
      <DataTable<RevenueRow>
        columns={REVENUE_COLS}
        rows={REVENUE_ROWS}
        compact
        stickyHeader
        footer={
          <div style={{ display: 'flex', gap: '24px', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: 'var(--oe-text-3)', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>12M Total</span>
            <span>Revenue: R 3,584,160,000</span>
            {coloredNum('Margin: R 895,260,000', true)}
            <span style={{ color: 'var(--oe-text-3)' }}>Avg Sharpe: 1.93</span>
          </div>
        }
      />
    </ReportContainer>
  );
}

// ─── 7. Carbon Credit Portfolio Report ───────────────────────────────────────

interface CarbonRow {
  id: string;
  project: string;
  standard: string;
  issued: string;
  retired: string;
  buffer: string;
  available: string;
  pricePerCredit: string;
}

const CARBON_ROWS: CarbonRow[] = [
  { id: '1', project: 'Upington Solar PV',        standard: 'Art 6.4', issued: '48,400',  retired: '30,200', buffer: '4,840',  available: '13,360', pricePerCredit: 'R 240.00' },
  { id: '2', project: 'Lephalale Wind Farm',       standard: 'GS',      issued: '62,100',  retired: '45,000', buffer: '6,210',  available: '10,890', pricePerCredit: 'R 195.00' },
  { id: '3', project: 'Richards Bay Offshore',     standard: 'Verra',   issued: '108,200', retired: '70,000', buffer: '10,820', available: '27,380', pricePerCredit: 'R 178.50' },
  { id: '4', project: 'Nkosi Hydro (DR Congo)',    standard: 'Art 6.4', issued: '34,800',  retired: '12,000', buffer: '3,480',  available: '19,320', pricePerCredit: 'R 312.00' },
  { id: '5', project: 'Kalahari Biogas',           standard: 'GS',      issued: '18,500',  retired: '18,500', buffer: '1,850',  available: '0',      pricePerCredit: 'R 220.00' },
  { id: '6', project: 'Cape Agulhas Offshore PV',  standard: 'Verra',   issued: '72,300',  retired: '28,400', buffer: '7,230',  available: '36,670', pricePerCredit: 'R 165.00' },
];

const CARBON_COLS: Column<CarbonRow>[] = [
  { key: 'project',       header: 'Project',         width: '220px' },
  { key: 'standard',      header: 'Standard',        width: '90px',  render: r => <StatusPill label={r.standard} variant={r.standard === 'Art 6.4' ? 'violet' : r.standard === 'GS' ? 'green' : 'blue'} dot size="sm" /> },
  { key: 'issued',        header: 'Issued (tCO2e)',   align: 'right', mono: true, render: r => mono(r.issued) },
  { key: 'retired',       header: 'Retired',          align: 'right', mono: true, render: r => mono(r.retired) },
  { key: 'buffer',        header: 'Buffer',           align: 'right', mono: true, render: r => mono(r.buffer) },
  { key: 'available',     header: 'Available',        align: 'right', render: r => (
    <strong style={{ fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums', fontSize: '12px', color: r.available === '0' ? 'var(--oe-text-4)' : 'var(--oe-text-1)' }}>
      {r.available}
    </strong>
  )},
  { key: 'pricePerCredit',header: 'Price / Credit',  align: 'right', mono: true, render: r => mono(r.pricePerCredit) },
];

export function CarbonCreditReport() {
  return (
    <ReportContainer>
      <SectionHeader
        title="Carbon Credit Portfolio"
        subtitle="Issued, retired, buffer pool, and available credits by project. Prices indicative (last registry close)."
      />
      <DataTable<CarbonRow>
        columns={CARBON_COLS}
        rows={CARBON_ROWS}
        compact
        stickyHeader
        footer={
          <div style={{ display: 'flex', gap: '24px', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: 'var(--oe-text-3)', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Portfolio Total</span>
            <span>Issued: 344,300</span>
            <span>Retired: 204,100</span>
            <span>Available: 107,620</span>
          </div>
        }
      />
    </ReportContainer>
  );
}

// ─── 8. Licence Renewal Status Report ────────────────────────────────────────

interface LicenceRow {
  id: string;
  licenceId: string;
  licenceClass: string;
  expiryDate: string;
  daysToExpiry: number;
  status: string;
}

const LICENCE_ROWS: LicenceRow[] = [
  { id: '1', licenceId: 'NERSA-GEN-2018-0041', licenceClass: 'Generation',    expiryDate: '2026-09-14', daysToExpiry: 105, status: 'active'   },
  { id: '2', licenceId: 'NERSA-TRD-2019-0088', licenceClass: 'Trading',       expiryDate: '2026-07-01', daysToExpiry: 30,  status: 'renewal_submitted' },
  { id: '3', licenceId: 'NERSA-TRN-2020-0012', licenceClass: 'Transmission',  expiryDate: '2027-02-28', daysToExpiry: 272, status: 'active'   },
  { id: '4', licenceId: 'NERSA-DST-2017-0034', licenceClass: 'Distribution',  expiryDate: '2026-06-18', daysToExpiry: 17,  status: 'expiring_soon' },
  { id: '5', licenceId: 'NERSA-GEN-2021-0099', licenceClass: 'Generation',    expiryDate: '2028-05-01', daysToExpiry: 700, status: 'active'   },
  { id: '6', licenceId: 'NERSA-RET-2016-0007', licenceClass: 'Retail',        expiryDate: '2026-05-28', daysToExpiry: -3,  status: 'expired'  },
  { id: '7', licenceId: 'NERSA-GAS-2022-0015', licenceClass: 'Gas',           expiryDate: '2029-03-31', daysToExpiry: 1034,status: 'active'   },
];

const LICENCE_COLS: Column<LicenceRow>[] = [
  { key: 'licenceId',    header: 'Licence ID',    mono: true, render: r => mono(r.licenceId) },
  { key: 'licenceClass', header: 'Class',         width: '120px' },
  { key: 'expiryDate',   header: 'Expiry Date',   mono: true, width: '130px', render: r => mono(r.expiryDate) },
  {
    key: 'daysToExpiry',
    header: 'Days to Expiry',
    align: 'right',
    width: '130px',
    render: r => {
      const color = r.daysToExpiry < 0
        ? 'var(--oe-rose)'
        : r.daysToExpiry < 30
        ? 'var(--oe-rose)'
        : r.daysToExpiry < 90
        ? 'var(--oe-amber)'
        : 'var(--oe-green)';
      return (
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums', fontSize: '12px', fontWeight: 700, color }}>
          {r.daysToExpiry < 0 ? 'EXPIRED' : `${r.daysToExpiry}d`}
        </span>
      );
    },
  },
  {
    key: 'status',
    header: 'Status',
    render: r => <StatusPill label={r.status.replace('_',' ')} variant={stateVariant(r.status)} dot size="sm" />,
  },
];

export function LicenceRenewalStatusReport() {
  return (
    <ReportContainer>
      <SectionHeader
        title="Licence Renewal Status"
        subtitle="All NERSA licences. Red = <30 days or expired. Amber = <90 days. Green = >90 days remaining."
      />
      <DataTable<LicenceRow> columns={LICENCE_COLS} rows={LICENCE_ROWS} compact stickyHeader />
    </ReportContainer>
  );
}

// ─── 9. Risk Exposure Report ──────────────────────────────────────────────────

interface RiskRow {
  id: string;
  entity: string;
  exposureZar: number;
  limitZar: number;
  utilisation: number;
  collateral: string;
  status: string;
}

const RISK_ROWS: RiskRow[] = [
  { id: '1', entity: 'Eskom SOC Ltd',          exposureZar: 320_000_000, limitZar: 500_000_000, utilisation: 64,  collateral: 'R 150M PCG',     status: 'within_limit' },
  { id: '2', entity: 'ACWA Power',              exposureZar: 188_000_000, limitZar: 200_000_000, utilisation: 94,  collateral: 'None',            status: 'near_limit'   },
  { id: '3', entity: 'Absa CIB',                exposureZar: 75_000_000,  limitZar: 300_000_000, utilisation: 25,  collateral: 'R 50M LC',        status: 'within_limit' },
  { id: '4', entity: 'Old Mutual Investment',   exposureZar: 210_000_000, limitZar: 200_000_000, utilisation: 105, collateral: 'R 100M Guarantee', status: 'breach'       },
  { id: '5', entity: 'Mainstream RE',           exposureZar: 44_000_000,  limitZar: 150_000_000, utilisation: 29,  collateral: 'None',            status: 'within_limit' },
  { id: '6', entity: 'Nedbank CIB',             exposureZar: 167_000_000, limitZar: 250_000_000, utilisation: 67,  collateral: 'R 80M Cash',      status: 'within_limit' },
];

function fmt(n: number): string {
  return 'R ' + (n / 1_000_000).toFixed(0) + 'M';
}

function UtilBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? 'var(--oe-rose)' : pct >= 85 ? 'var(--oe-amber)' : 'var(--oe-green)';
  const display = Math.min(pct, 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ width: '80px', height: '6px', background: 'var(--oe-surf-3)', borderRadius: '3px', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${display}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 300ms var(--oe-ease)' }} />
      </div>
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', fontVariantNumeric: 'tabular-nums', color, fontWeight: 600, minWidth: '36px' }}>
        {pct}%
      </span>
    </div>
  );
}

const RISK_COLS: Column<RiskRow>[] = [
  { key: 'entity',      header: 'Counterparty',    width: '200px' },
  { key: 'exposureZar', header: 'Exposure',         align: 'right', mono: true, render: r => mono(fmt(r.exposureZar)) },
  { key: 'limitZar',    header: 'Limit',            align: 'right', mono: true, render: r => mono(fmt(r.limitZar)) },
  { key: 'utilisation', header: 'Utilisation',      width: '160px', render: r => <UtilBar pct={r.utilisation} /> },
  { key: 'collateral',  header: 'Collateral',       render: r => <span style={{ fontSize: '12px', color: 'var(--oe-text-3)' }}>{r.collateral}</span> },
  { key: 'status',      header: 'Status',           render: r => <StatusPill label={r.status.replace('_',' ')} variant={stateVariant(r.status)} dot size="sm" /> },
];

export function RiskExposureReport() {
  return (
    <ReportContainer>
      <SectionHeader
        title="Counterparty Credit Exposure"
        subtitle="Mark-to-market exposure vs approved limits. Red bar = limit breach. Amber = >85% utilisation. SARB large-exposure rule: 25% Tier-1 capital."
      />
      <DataTable<RiskRow> columns={RISK_COLS} rows={RISK_ROWS} compact stickyHeader />
    </ReportContainer>
  );
}

// ─── 10. Project Finance EVM Report ──────────────────────────────────────────

interface EvmRow {
  id: string;
  project: string;
  bac: string;
  ev: string;
  ac: string;
  spi: string;
  cpi: string;
  eac: string;
  vac: string;
  spiOk: boolean;
  cpiOk: boolean;
}

const EVM_ROWS: EvmRow[] = [
  { id: '1', project: 'Lephalale Wind Farm',    bac: 'R 4,200M', ev: 'R 3,150M', ac: 'R 3,010M', spi: '0.75', cpi: '1.05', eac: 'R 4,000M', vac: '+R 200M',  spiOk: false, cpiOk: true  },
  { id: '2', project: 'Upington Solar PV',      bac: 'R 2,800M', ev: 'R 2,800M', ac: 'R 2,745M', spi: '1.00', cpi: '1.02', eac: 'R 2,745M', vac: '+R 55M',   spiOk: true,  cpiOk: true  },
  { id: '3', project: 'Richards Bay Offshore',  bac: 'R 8,500M', ev: 'R 4,080M', ac: 'R 4,420M', spi: '0.96', cpi: '0.92', eac: 'R 9,239M', vac: '-R 739M',  spiOk: true,  cpiOk: false },
  { id: '4', project: 'De Aar Storage (BESS)',  bac: 'R 1,900M', ev: 'R 380M',  ac: 'R 405M',  spi: '0.80', cpi: '0.94', eac: 'R 2,021M', vac: '-R 121M',  spiOk: false, cpiOk: false },
  { id: '5', project: 'Nkosi Hydro',            bac: 'R 3,400M', ev: 'R 3,400M', ac: 'R 3,280M', spi: '1.00', cpi: '1.04', eac: 'R 3,269M', vac: '+R 131M',  spiOk: true,  cpiOk: true  },
];

function spiColor(val: string): React.CSSProperties {
  const n = parseFloat(val);
  const color = n < 0.9 ? 'var(--oe-rose)' : n < 1.0 ? 'var(--oe-amber)' : 'var(--oe-green)';
  return { fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums', fontSize: '12px', fontWeight: 700, color };
}

const EVM_COLS: Column<EvmRow>[] = [
  { key: 'project', header: 'Project',     width: '200px' },
  { key: 'bac',     header: 'BAC',         align: 'right', mono: true, render: r => mono(r.bac) },
  { key: 'ev',      header: 'EV',          align: 'right', mono: true, render: r => mono(r.ev)  },
  { key: 'ac',      header: 'AC',          align: 'right', mono: true, render: r => mono(r.ac)  },
  { key: 'spi',     header: 'SPI',         align: 'right', render: r => <span style={spiColor(r.spi)}>{r.spi}</span> },
  { key: 'cpi',     header: 'CPI',         align: 'right', render: r => <span style={spiColor(r.cpi)}>{r.cpi}</span> },
  { key: 'eac',     header: 'EAC',         align: 'right', mono: true, render: r => mono(r.eac) },
  { key: 'vac',     header: 'VAC',         align: 'right', render: r => coloredNum(r.vac, r.vac.startsWith('+')) },
];

export function ProjectFinanceReport() {
  return (
    <ReportContainer>
      <SectionHeader
        title="Project Finance — Earned Value Metrics"
        subtitle="EVM per project. SPI/CPI: <0.9 = critical (red), <1.0 = at-risk (amber), ≥1.0 = on-track (green). EAC via CPI method."
      />
      <DataTable<EvmRow> columns={EVM_COLS} rows={EVM_ROWS} compact stickyHeader />
      <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--oe-text-3)' }}>
        <span><strong style={{ color: 'var(--oe-text-2)' }}>BAC</strong> Budget at Completion</span>
        <span><strong style={{ color: 'var(--oe-text-2)' }}>EV</strong> Earned Value</span>
        <span><strong style={{ color: 'var(--oe-text-2)' }}>AC</strong> Actual Cost</span>
        <span><strong style={{ color: 'var(--oe-text-2)' }}>SPI</strong> Schedule Performance Index</span>
        <span><strong style={{ color: 'var(--oe-text-2)' }}>CPI</strong> Cost Performance Index</span>
        <span><strong style={{ color: 'var(--oe-text-2)' }}>EAC</strong> Estimate at Completion</span>
        <span><strong style={{ color: 'var(--oe-text-2)' }}>VAC</strong> Variance at Completion</span>
      </div>
    </ReportContainer>
  );
}

// ─── 11. ML Model Performance Report ─────────────────────────────────────────

interface MlModelRow {
  id: string;
  model: string;
  wave: string;
  algorithm: string;
  accuracy: string;
  f1Score: string;
  inferenceTime: string;
  status: string;
}

const ML_MODEL_ROWS: MlModelRow[] = [
  { id: '1', model: 'Anomaly Detection',   wave: 'W127', algorithm: 'IF + Z-Score Ensemble',  accuracy: '96.4%', f1Score: '0.94', inferenceTime: '12ms', status: 'active' },
  { id: '2', model: 'RUL Prediction',       wave: 'W128', algorithm: 'RF Regressor',            accuracy: '94.1%', f1Score: '0.91', inferenceTime: '18ms', status: 'active' },
  { id: '3', model: 'Fault Fingerprint',    wave: 'W129', algorithm: 'XGBoost + CNN-1D',        accuracy: '97.8%', f1Score: '0.96', inferenceTime: '24ms', status: 'active' },
  { id: '4', model: 'NTT Comparison',       wave: 'W130', algorithm: 'Aggregator (live stitch)', accuracy: '—',     f1Score: '—',    inferenceTime: '8ms',  status: 'active' },
];

export function MlModelPerformanceReport() {
  const thStyle: React.CSSProperties = {
    padding: '9px 14px',
    background: 'var(--oe-grad-table-head)',
    borderBottom: '1px solid var(--oe-border)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--oe-text-3)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    padding: '0 14px',
    height: '44px',
    verticalAlign: 'middle',
    borderBottom: '1px solid var(--oe-border-2)',
    fontSize: '13px',
    color: 'var(--oe-text-2)',
  };

  return (
    <ReportContainer>
      <SectionHeader
        title="ML Model Performance — W127–W130"
        subtitle="Apex predictive chain model metrics. Accuracy and F1 evaluated on held-out test sets. Inference time p95 on CF Workers AI."
      />
      <div
        style={{
          background: 'var(--oe-canvas)',
          border: '1px solid var(--oe-border)',
          borderRadius: 'var(--oe-r-card)',
          overflow: 'hidden',
          boxShadow: 'var(--oe-shadow-card)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={thStyle}>Model</th>
                <th style={thStyle}>Wave</th>
                <th style={thStyle}>Algorithm</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Accuracy</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>F1 Score</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Inference Time</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {ML_MODEL_ROWS.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--oe-text-1)', borderBottom: i < ML_MODEL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{r.model}</td>
                  <td style={{ ...tdStyle, borderBottom: i < ML_MODEL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>
                    <StatusPill label={r.wave} variant="blue" dot={false} size="xs" />
                  </td>
                  <td style={{ ...tdStyle, fontSize: '12px', color: 'var(--oe-text-3)', borderBottom: i < ML_MODEL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{r.algorithm}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', borderBottom: i < ML_MODEL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>
                    {r.accuracy === '—' ? <span style={{ color: 'var(--oe-text-4)', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>—</span> : coloredNum(r.accuracy, true)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', borderBottom: i < ML_MODEL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>
                    {r.f1Score === '—' ? <span style={{ color: 'var(--oe-text-4)', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>—</span> : mono(r.f1Score)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', borderBottom: i < ML_MODEL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{mono(r.inferenceTime)}</td>
                  <td style={{ ...tdStyle, borderBottom: i < ML_MODEL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>
                    <StatusPill label={r.status} variant="green" dot size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--oe-text-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <OeIcon name="info-circle" size={12} color="var(--oe-text-4)" />
        W130 Aggregator stitches W127–W129 live outputs; per-model accuracy N/A. Recall certification nightly via INVERTED SLA.
      </div>
    </ReportContainer>
  );
}

// ─── 12. SLL KPI Compliance Report ───────────────────────────────────────────

interface SllRow {
  id: string;
  facility: string;
  kpi: string;
  target: string;
  actual: string;
  status: 'Met' | 'Missed' | 'At Risk';
  ratchet: string;
}

const SLL_ROWS: SllRow[] = [
  { id: '1', facility: 'SLL-0041 (Lephalale Wind)', kpi: 'Carbon intensity (tCO2e/MWh)',      target: '≤ 0.025',  actual: '0.021',  status: 'Met',     ratchet: '−15bps' },
  { id: '2', facility: 'SLL-0044 (Upington Solar)',  kpi: 'Availability factor (%)',           target: '≥ 92.0%',  actual: '91.4%',  status: 'At Risk', ratchet: '0bps'   },
  { id: '3', facility: 'SLL-0051 (Richards Bay Off)',kpi: 'Local content spend (%)',           target: '≥ 40.0%',  actual: '43.2%',  status: 'Met',     ratchet: '−10bps' },
  { id: '4', facility: 'SLL-0058 (De Aar BESS)',     kpi: 'ED commitment disbursed (ZAR)',     target: '≥ R 18M',  actual: 'R 11.4M',status: 'Missed',  ratchet: '+25bps' },
];

export function SllKpiComplianceReport() {
  const thStyle: React.CSSProperties = {
    padding: '9px 14px',
    background: 'var(--oe-grad-table-head)',
    borderBottom: '1px solid var(--oe-border)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--oe-text-3)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    padding: '0 14px',
    height: '44px',
    verticalAlign: 'middle',
    borderBottom: '1px solid var(--oe-border-2)',
    fontSize: '13px',
    color: 'var(--oe-text-2)',
  };
  const statusVariant = (s: SllRow['status']) =>
    s === 'Met' ? 'green' : s === 'Missed' ? 'rose' : 'amber';

  return (
    <ReportContainer>
      <SectionHeader
        title="SLL KPI Compliance — Active Facilities"
        subtitle="Sustainability-linked loan KPI test results. Ratchet = margin adjustment applied at next reset date."
      />
      <div
        style={{
          background: 'var(--oe-canvas)',
          border: '1px solid var(--oe-border)',
          borderRadius: 'var(--oe-r-card)',
          overflow: 'hidden',
          boxShadow: 'var(--oe-shadow-card)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={thStyle}>Facility</th>
                <th style={thStyle}>KPI</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Target</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actual</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Ratchet</th>
              </tr>
            </thead>
            <tbody>
              {SLL_ROWS.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--oe-text-1)', borderBottom: i < SLL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{r.facility}</td>
                  <td style={{ ...tdStyle, fontSize: '12px', color: 'var(--oe-text-3)', borderBottom: i < SLL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{r.kpi}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', borderBottom: i < SLL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{mono(r.target)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', borderBottom: i < SLL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{mono(r.actual)}</td>
                  <td style={{ ...tdStyle, borderBottom: i < SLL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>
                    <StatusPill label={r.status} variant={statusVariant(r.status)} dot size="sm" />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', borderBottom: i < SLL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>
                    <span style={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: r.ratchet.startsWith('−') || r.ratchet.startsWith('-') ? 'var(--oe-green)' : r.ratchet === '0bps' ? 'var(--oe-text-3)' : 'var(--oe-rose)',
                    }}>
                      {r.ratchet}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ReportContainer>
  );
}

// ─── 13. DSCR Portfolio Report ────────────────────────────────────────────────

interface DscrRow {
  id: string;
  project: string;
  facility: string;
  q1Dscr: string;
  trend: string;
  threshold: string;
  status: 'Above' | 'Below' | 'Covenant Breach';
  trendUp: boolean;
}

const DSCR_ROWS: DscrRow[] = [
  { id: '1', project: 'Lephalale Wind Farm',    facility: 'SLL-0041', q1Dscr: '1.42', trend: '+0.08', threshold: '1.20', status: 'Above',           trendUp: true  },
  { id: '2', project: 'Upington Solar PV',      facility: 'SLL-0044', q1Dscr: '1.18', trend: '-0.05', threshold: '1.20', status: 'Below',           trendUp: false },
  { id: '3', project: 'Richards Bay Offshore',  facility: 'SLL-0051', q1Dscr: '1.35', trend: '+0.03', threshold: '1.25', status: 'Above',           trendUp: true  },
  { id: '4', project: 'De Aar Storage (BESS)',  facility: 'SLL-0058', q1Dscr: '0.94', trend: '-0.18', threshold: '1.15', status: 'Covenant Breach', trendUp: false },
  { id: '5', project: 'Nkosi Hydro',            facility: 'DRW-0019', q1Dscr: '1.67', trend: '+0.11', threshold: '1.20', status: 'Above',           trendUp: true  },
];

export function DscrPortfolioReport() {
  const thStyle: React.CSSProperties = {
    padding: '9px 14px',
    background: 'var(--oe-grad-table-head)',
    borderBottom: '1px solid var(--oe-border)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--oe-text-3)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    padding: '0 14px',
    height: '44px',
    verticalAlign: 'middle',
    borderBottom: '1px solid var(--oe-border-2)',
    fontSize: '13px',
    color: 'var(--oe-text-2)',
  };
  const statusVariant = (s: DscrRow['status']) =>
    s === 'Above' ? 'green' : s === 'Covenant Breach' ? 'rose' : 'amber';

  return (
    <ReportContainer>
      <SectionHeader
        title="DSCR Portfolio Monitoring — Q1 2026"
        subtitle="Debt service coverage ratios vs covenant thresholds. Covenant Breach triggers W38 certificate + W45 enforcement review."
      />
      <div
        style={{
          background: 'var(--oe-canvas)',
          border: '1px solid var(--oe-border)',
          borderRadius: 'var(--oe-r-card)',
          overflow: 'hidden',
          boxShadow: 'var(--oe-shadow-card)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={thStyle}>Project</th>
                <th style={thStyle}>Facility</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Q1 2026 DSCR</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Trend</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Threshold</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {DSCR_ROWS.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--oe-text-1)', borderBottom: i < DSCR_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{r.project}</td>
                  <td style={{ ...tdStyle, borderBottom: i < DSCR_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>
                    <StatusPill label={r.facility} variant="default" dot={false} size="xs" />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', borderBottom: i < DSCR_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>
                    <span style={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: parseFloat(r.q1Dscr) >= parseFloat(r.threshold) ? 'var(--oe-green)' : 'var(--oe-rose)',
                    }}>
                      {r.q1Dscr}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', borderBottom: i < DSCR_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>
                    {coloredNum(r.trend, r.trendUp)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', borderBottom: i < DSCR_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{mono(r.threshold)}</td>
                  <td style={{ ...tdStyle, borderBottom: i < DSCR_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>
                    <StatusPill label={r.status} variant={statusVariant(r.status)} dot size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ReportContainer>
  );
}

// ─── 14. Pre-Trade Credit Utilisation Report ──────────────────────────────────

interface CreditUtilRow {
  id: string;
  counterparty: string;
  limitZar: string;
  utilisedZar: string;
  utilPct: number;
  creditGrade: string;
  status: string;
}

const CREDIT_UTIL_ROWS: CreditUtilRow[] = [
  { id: '1', counterparty: 'Eskom SOC Ltd',        limitZar: 'R 500,000,000', utilisedZar: 'R 60,000,000',  utilPct: 12, creditGrade: 'BBB+', status: 'within_limit' },
  { id: '2', counterparty: 'ACWA Power',            limitZar: 'R 200,000,000', utilisedZar: 'R 124,000,000', utilPct: 62, creditGrade: 'BBB',  status: 'within_limit' },
  { id: '3', counterparty: 'Old Mutual Investment', limitZar: 'R 200,000,000', utilisedZar: 'R 162,000,000', utilPct: 81, creditGrade: 'A−',   status: 'near_limit'   },
  { id: '4', counterparty: 'Nedbank CIB',           limitZar: 'R 250,000,000', utilisedZar: 'R 222,500,000', utilPct: 89, creditGrade: 'A',    status: 'near_limit'   },
  { id: '5', counterparty: 'Mainstream RE',         limitZar: 'R 150,000,000', utilisedZar: 'R 141,000,000', utilPct: 94, creditGrade: 'BB+',  status: 'near_limit'   },
];

export function PreTradeCreditUtilisationReport() {
  const thStyle: React.CSSProperties = {
    padding: '9px 14px',
    background: 'var(--oe-grad-table-head)',
    borderBottom: '1px solid var(--oe-border)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--oe-text-3)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    padding: '0 14px',
    height: '44px',
    verticalAlign: 'middle',
    borderBottom: '1px solid var(--oe-border-2)',
    fontSize: '13px',
    color: 'var(--oe-text-2)',
  };

  return (
    <ReportContainer>
      <SectionHeader
        title="Pre-Trade Credit Utilisation"
        subtitle="Real-time credit limit utilisation by counterparty. >85% = near limit (amber). Breach auto-triggers pre-trade guard rejection."
      />
      <div
        style={{
          background: 'var(--oe-canvas)',
          border: '1px solid var(--oe-border)',
          borderRadius: 'var(--oe-r-card)',
          overflow: 'hidden',
          boxShadow: 'var(--oe-shadow-card)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={thStyle}>Counterparty</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Limit ZAR</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Utilised ZAR</th>
                <th style={{ ...thStyle }}>Utilisation %</th>
                <th style={thStyle}>Credit Grade</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {CREDIT_UTIL_ROWS.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--oe-text-1)', borderBottom: i < CREDIT_UTIL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{r.counterparty}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', borderBottom: i < CREDIT_UTIL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{mono(r.limitZar)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', borderBottom: i < CREDIT_UTIL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{mono(r.utilisedZar)}</td>
                  <td style={{ ...tdStyle, borderBottom: i < CREDIT_UTIL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>
                    <UtilBar pct={r.utilPct} />
                  </td>
                  <td style={{ ...tdStyle, borderBottom: i < CREDIT_UTIL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>
                    <StatusPill label={r.creditGrade} variant="default" dot={false} size="xs" />
                  </td>
                  <td style={{ ...tdStyle, borderBottom: i < CREDIT_UTIL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>
                    <StatusPill label={r.status.replace('_', ' ')} variant={stateVariant(r.status)} dot size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ReportContainer>
  );
}

// ─── 15. Imbalance Settlement Report ─────────────────────────────────────────

interface ImbalanceRow {
  id: string;
  interval: string;
  direction: 'Long' | 'Short';
  volumeMwh: string;
  mtuPrice: string;
  settlementZar: string;
  status: string;
}

const IMBALANCE_ROWS: ImbalanceRow[] = [
  { id: '1', interval: '06:00–06:30', direction: 'Long',  volumeMwh: '14.2',  mtuPrice: 'R 1,840', settlementZar: 'R 26,128',   status: 'settled'  },
  { id: '2', interval: '06:30–07:00', direction: 'Short', volumeMwh: '8.7',   mtuPrice: 'R 2,010', settlementZar: 'R 17,487',   status: 'settled'  },
  { id: '3', interval: '07:00–07:30', direction: 'Short', volumeMwh: '22.1',  mtuPrice: 'R 2,340', settlementZar: 'R 51,714',   status: 'settled'  },
  { id: '4', interval: '07:30–08:00', direction: 'Long',  volumeMwh: '5.4',   mtuPrice: 'R 1,960', settlementZar: 'R 10,584',   status: 'disputed' },
  { id: '5', interval: '14:00–14:30', direction: 'Long',  volumeMwh: '31.0',  mtuPrice: 'R 1,720', settlementZar: 'R 53,320',   status: 'settled'  },
  { id: '6', interval: '14:30–15:00', direction: 'Short', volumeMwh: '18.6',  mtuPrice: 'R 1,980', settlementZar: 'R 36,828',   status: 'settled'  },
  { id: '7', interval: '15:00–15:30', direction: 'Long',  volumeMwh: '9.3',   mtuPrice: 'R 2,120', settlementZar: 'R 19,716',   status: 'pending'  },
  { id: '8', interval: '15:30–16:00', direction: 'Short', volumeMwh: '41.8',  mtuPrice: 'R 2,480', settlementZar: 'R 103,664',  status: 'pending'  },
];

export function ImbalanceSettlementReport() {
  const thStyle: React.CSSProperties = {
    padding: '9px 14px',
    background: 'var(--oe-grad-table-head)',
    borderBottom: '1px solid var(--oe-border)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--oe-text-3)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    padding: '0 14px',
    height: '42px',
    verticalAlign: 'middle',
    borderBottom: '1px solid var(--oe-border-2)',
    fontSize: '13px',
    color: 'var(--oe-text-2)',
  };

  return (
    <ReportContainer>
      <SectionHeader
        title="Imbalance Settlement — MTU Summary"
        subtitle="Half-hourly metering unit intervals. Long = generation excess; Short = generation deficit. Disputed intervals feed W66."
      />
      <div
        style={{
          background: 'var(--oe-canvas)',
          border: '1px solid var(--oe-border)',
          borderRadius: 'var(--oe-r-card)',
          overflow: 'hidden',
          boxShadow: 'var(--oe-shadow-card)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={thStyle}>Trading Interval</th>
                <th style={thStyle}>Direction</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Volume MWh</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>MTU Price R/MWh</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Settlement ZAR</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {IMBALANCE_ROWS.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ ...tdStyle, borderBottom: i < IMBALANCE_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{mono(r.interval)}</td>
                  <td style={{ ...tdStyle, borderBottom: i < IMBALANCE_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>
                    <StatusPill
                      label={r.direction}
                      variant={r.direction === 'Long' ? 'green' : 'rose'}
                      dot
                      size="sm"
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', borderBottom: i < IMBALANCE_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{mono(r.volumeMwh)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', borderBottom: i < IMBALANCE_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{mono(r.mtuPrice)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, borderBottom: i < IMBALANCE_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{mono(r.settlementZar)}</td>
                  <td style={{ ...tdStyle, borderBottom: i < IMBALANCE_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>
                    <StatusPill label={r.status} variant={stateVariant(r.status)} dot size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '24px', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', fontVariantNumeric: 'tabular-nums', color: 'var(--oe-text-3)' }}>
        <span style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Day Total</span>
        <span>Volume: 151.1 MWh</span>
        {coloredNum('Settlement: R 319,441', true)}
        <span>Disputed: 1 interval</span>
      </div>
    </ReportContainer>
  );
}

// ─── 16. Change-in-Law Tracker Report ────────────────────────────────────────

interface CilRow {
  id: string;
  ppa: string;
  eventType: string;
  quantumZar: string;
  submissionDate: string;
  daysOpen: number;
  status: string;
}

const CIL_ROWS: CilRow[] = [
  { id: '1', ppa: 'PPA-0041 (Lephalale)',   eventType: 'Carbon Tax Act amendment', quantumZar: 'R 4,200,000',  submissionDate: '2026-02-14', daysOpen: 106, status: 'negotiation'  },
  { id: '2', ppa: 'PPA-0044 (Upington)',    eventType: 'ERA grid-code tariff',      quantumZar: 'R 1,800,000',  submissionDate: '2026-03-01', daysOpen: 91,  status: 'eligibility'  },
  { id: '3', ppa: 'PPA-0051 (Richards Bay)',eventType: 'Discriminatory change',     quantumZar: 'R 12,500,000', submissionDate: '2026-01-20', daysOpen: 131, status: 'arbitration'  },
  { id: '4', ppa: 'PPA-0058 (De Aar BESS)', eventType: 'SARS transfer pricing',     quantumZar: 'R 680,000',    submissionDate: '2026-04-08', daysOpen: 53,  status: 'impact'       },
  { id: '5', ppa: 'PPA-0062 (Nkosi Hydro)', eventType: 'Statutory change (DMRE)',   quantumZar: 'R 3,100,000',  submissionDate: '2026-04-22', daysOpen: 39,  status: 'event_logged' },
];

export function ChangeInLawTrackerReport() {
  const thStyle: React.CSSProperties = {
    padding: '9px 14px',
    background: 'var(--oe-grad-table-head)',
    borderBottom: '1px solid var(--oe-border)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--oe-text-3)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    padding: '0 14px',
    height: '44px',
    verticalAlign: 'middle',
    borderBottom: '1px solid var(--oe-border-2)',
    fontSize: '13px',
    color: 'var(--oe-text-2)',
  };
  const daysColor = (d: number): string =>
    d > 120 ? 'var(--oe-rose)' : d > 60 ? 'var(--oe-amber)' : 'var(--oe-text-2)';

  return (
    <ReportContainer>
      <SectionHeader
        title="Change-in-Law Tracker — Open Claims"
        subtitle="Active W78 CiL relief claims across all PPA portfolios. Arbitration cases trigger regulatory crossing to W66."
      />
      <div
        style={{
          background: 'var(--oe-canvas)',
          border: '1px solid var(--oe-border)',
          borderRadius: 'var(--oe-r-card)',
          overflow: 'hidden',
          boxShadow: 'var(--oe-shadow-card)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={thStyle}>PPA</th>
                <th style={thStyle}>Event Type</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Quantum ZAR</th>
                <th style={thStyle}>Submission Date</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Days Open</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {CIL_ROWS.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--oe-text-1)', borderBottom: i < CIL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{r.ppa}</td>
                  <td style={{ ...tdStyle, fontSize: '12px', color: 'var(--oe-text-3)', borderBottom: i < CIL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{r.eventType}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', borderBottom: i < CIL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{mono(r.quantumZar)}</td>
                  <td style={{ ...tdStyle, borderBottom: i < CIL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>{mono(r.submissionDate)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', borderBottom: i < CIL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums', fontSize: '12px', fontWeight: 700, color: daysColor(r.daysOpen) }}>
                      {r.daysOpen}d
                    </span>
                  </td>
                  <td style={{ ...tdStyle, borderBottom: i < CIL_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}>
                    <StatusPill label={r.status.replace('_', ' ')} variant={stateVariant(r.status)} dot size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--oe-text-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <OeIcon name="info-circle" size={12} color="var(--oe-text-4)" />
        Total open quantum: R 22,280,000 across 5 claims. INVERTED SLA — larger quantum claims receive extended determination timeline per ERA §4.
      </div>
    </ReportContainer>
  );
}

export default {
  SoxAuditTrailReport,
  SodMatrixReport,
  ThreeWayMatchReport,
  TcfdAlignmentReport,
  Scope123Report,
  TradeRevenueReport,
  CarbonCreditReport,
  LicenceRenewalStatusReport,
  RiskExposureReport,
  ProjectFinanceReport,
  MlModelPerformanceReport,
  SllKpiComplianceReport,
  DscrPortfolioReport,
  PreTradeCreditUtilisationReport,
  ImbalanceSettlementReport,
  ChangeInLawTrackerReport,
};
