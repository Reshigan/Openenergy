import React from 'react';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StatusPill, PillVariant } from '../../components/display/StatusPill';
import { useRegulatorFilings, useRegulatorEnforcement, useRegulatorLicences } from '../../lib/hooks';
import type { RegulatorFiling, RegulatorEnforcement as RegEnforcement, RegulatorLicence } from '../../lib/client';

// ── Fallback Mock Data ────────────────────────────────────────────────────────

interface InboxRow {
  id: string;
  caseRef: string;
  entity: string;
  caseType: string;
  filedDate: string;
  slaDeadline: string;
  daysRemaining: number;
  priority: string;
  officer: string;
  status: string;
}

const INBOX_ROWS_FALLBACK: InboxRow[] = [
  { id: 'i01', caseRef: 'NERSA-2025-0841', entity: 'Sere Wind Farm (Pty) Ltd',       caseType: 'Licence Application',      filedDate: '2025-04-02', slaDeadline: '2025-06-02', daysRemaining: 1,   priority: 'P1', officer: 'M. Dlamini',   status: 'Under Review' },
  { id: 'i02', caseRef: 'NERSA-2025-0799', entity: 'Mulilo Sonnedix Prieska',         caseType: 'Compliance Inspection',    filedDate: '2025-03-18', slaDeadline: '2025-05-18', daysRemaining: -13, priority: 'P1', officer: 'T. Nkosi',     status: 'Overdue' },
  { id: 'i03', caseRef: 'NERSA-2025-0812', entity: 'Anglo American Platinum',         caseType: 'STOR Filing',              filedDate: '2025-03-28', slaDeadline: '2025-05-28', daysRemaining: -3,  priority: 'P2', officer: 'R. van Wyk',   status: 'Overdue' },
];

interface EnforcementRow {
  id: string;
  ref: string;
  entity: string;
  violation: string;
  section: string;
  fine: string;
  imposedDate: string;
  complianceDate: string;
  paid: boolean;
  status: string;
}

const ENFORCEMENT_ROWS_FALLBACK: EnforcementRow[] = [
  { id: 'e1',  ref: 'ENF-2025-0041', entity: 'Transnet Ltd',              violation: 'Metering code breach',      section: 'ERA §39',     fine: 'R1,250,000', imposedDate: '2025-01-14', complianceDate: '2025-04-14', paid: true,  status: 'Closed' },
  { id: 'e2',  ref: 'ENF-2025-0044', entity: 'Mulilo Sonnedix Prieska',   violation: 'Grid code non-conformance', section: 'GCA §C-4',    fine: 'R890,000',   imposedDate: '2025-01-28', complianceDate: '2025-04-28', paid: true,  status: 'Closed' },
];

interface LicenceRow {
  id: string;
  licenceClass: string;
  active: number;
  expiring90d: number;
  expired: number;
  underReview: number;
  suspended: number;
  revoked: number;
}

const LICENCE_ROWS_FALLBACK: LicenceRow[] = [
  { id: 'l1', licenceClass: 'Generation',   active: 89,  expiring90d: 4, expired: 2, underReview: 6, suspended: 1, revoked: 0 },
  { id: 'l2', licenceClass: 'Transmission', active: 12,  expiring90d: 0, expired: 0, underReview: 1, suspended: 0, revoked: 0 },
  { id: 'l3', licenceClass: 'Distribution', active: 34,  expiring90d: 2, expired: 1, underReview: 3, suspended: 0, revoked: 1 },
  { id: 'l4', licenceClass: 'Trading',      active: 58,  expiring90d: 5, expired: 3, underReview: 4, suspended: 2, revoked: 1 },
  { id: 'l5', licenceClass: 'Carbon',       active: 41,  expiring90d: 3, expired: 1, underReview: 2, suspended: 0, revoked: 0 },
  { id: 'l6', licenceClass: 'Storage',      active: 27,  expiring90d: 1, expired: 0, underReview: 2, suspended: 1, revoked: 0 },
  { id: 'l7', licenceClass: 'SSEG',         active: 44,  expiring90d: 6, expired: 4, underReview: 3, suspended: 1, revoked: 0 },
  { id: 'l8', licenceClass: 'Exempt',       active: 7,   expiring90d: 0, expired: 0, underReview: 0, suspended: 0, revoked: 0 },
];

interface SlaMonthRow {
  id: string;
  month: string;
  onTime: number;
  avgDays: number;
  breaches: number;
  isTotal: boolean;
}

const SLA_ROWS: SlaMonthRow[] = [
  { id: 'sl1', month: 'Dec 2024', onTime: 94.2, avgDays: 15.8, breaches: 2, isTotal: false },
  { id: 'sl2', month: 'Jan 2025', onTime: 91.6, avgDays: 16.4, breaches: 3, isTotal: false },
  { id: 'sl3', month: 'Feb 2025', onTime: 88.4, avgDays: 19.2, breaches: 5, isTotal: false },
  { id: 'sl4', month: 'Mar 2025', onTime: 85.7, avgDays: 21.0, breaches: 6, isTotal: false },
  { id: 'sl5', month: 'Apr 2025', onTime: 79.2, avgDays: 24.6, breaches: 9, isTotal: false },
  { id: 'sl6', month: 'May 2025', onTime: 82.1, avgDays: 18.4, breaches: 7, isTotal: false },
  { id: 'sl7', month: 'AVG / TOTAL', onTime: 86.9, avgDays: 19.2, breaches: 32, isTotal: true },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const MONO: React.CSSProperties = { fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' };

function priorityVariant(p: string): PillVariant {
  if (p === 'P1') return 'rose';
  if (p === 'P2') return 'amber';
  return 'default';
}

function inboxStatusVariant(s: string): PillVariant {
  const sl = s.toLowerCase();
  if (/overdue/.test(sl)) return 'rose';
  if (/progress|review|scheduled/.test(sl)) return 'blue';
  if (/submitted|pending/.test(sl)) return 'default';
  if (/awaiting response/.test(sl)) return 'amber';
  if (/closed|complete/.test(sl)) return 'green';
  return 'default';
}

function enforcementStatusVariant(s: string): PillVariant {
  const sl = s.toLowerCase();
  if (/closed/.test(sl)) return 'green';
  if (/escalated/.test(sl)) return 'rose';
  if (/pending payment/.test(sl)) return 'amber';
  if (/awaiting|in progress|in compliance/.test(sl)) return 'blue';
  return 'default';
}

function daysRemainingColor(days: number): string {
  if (days < 0) return 'var(--oe-rose)';
  if (days < 7) return 'var(--oe-amber)';
  return 'var(--oe-green)';
}

function onTimeColor(pct: number): string {
  if (pct >= 90) return 'var(--oe-green)';
  if (pct >= 75) return 'var(--oe-amber)';
  return 'var(--oe-rose)';
}

function fmtFine(n: number): string {
  return `R${n.toLocaleString('en-ZA')}`;
}

// ── Live data mappers ─────────────────────────────────────────────────────────

function mapFilingToInboxRow(f: RegulatorFiling): InboxRow {
  return {
    id: f.id,
    caseRef: f.id,
    entity: f.entity_name ?? f.filed_by,
    caseType: f.case_type ?? f.filing_type,
    filedDate: f.created_at.slice(0, 10),
    slaDeadline: f.sla_deadline ?? '—',
    daysRemaining: f.days_remaining ?? 0,
    priority: f.priority ?? 'P3',
    officer: f.officer ?? '—',
    status: f.status,
  };
}

function mapEnforcementRow(e: RegEnforcement): EnforcementRow {
  return {
    id: e.id,
    ref: e.ref,
    entity: e.entity_name,
    violation: e.violation,
    section: e.section_ref,
    fine: e.fine_zar != null ? fmtFine(e.fine_zar) : '—',
    imposedDate: e.imposed_date ?? '—',
    complianceDate: e.compliance_date ?? '—',
    paid: e.paid,
    status: e.status,
  };
}

function mapLicencesToMatrix(licences: RegulatorLicence[]): LicenceRow[] {
  if (licences.length === 0) return LICENCE_ROWS_FALLBACK;

  const classMap = new Map<string, LicenceRow>();

  for (const l of licences) {
    const cls = l.licence_class;
    if (!classMap.has(cls)) {
      classMap.set(cls, {
        id: `lic-${cls}`,
        licenceClass: cls,
        active: 0,
        expiring90d: 0,
        expired: 0,
        underReview: 0,
        suspended: 0,
        revoked: 0,
      });
    }
    const row = classMap.get(cls)!;
    const sl = l.status.toLowerCase();
    if (/active/.test(sl))           row.active++;
    else if (/review/.test(sl))      row.underReview++;
    else if (/suspend/.test(sl))     row.suspended++;
    else if (/revok/.test(sl))       row.revoked++;
    else if (/expir/.test(sl))       row.expired++;
    if (/active/.test(sl) && l.days_to_expiry <= 90 && l.days_to_expiry > 0) {
      row.expiring90d++;
    }
  }

  return Array.from(classMap.values());
}

// ── Column definitions ───────────────────────────────────────────────────────
const INBOX_COLS: Column<InboxRow>[] = [
  { key: 'caseRef',       header: 'Case Ref',        width: '150px', mono: true },
  { key: 'entity',        header: 'Entity',          width: '210px' },
  { key: 'caseType',      header: 'Case Type',       width: '170px' },
  { key: 'filedDate',     header: 'Filed Date',      width: '110px', mono: true },
  { key: 'slaDeadline',   header: 'SLA Deadline',    width: '120px', mono: true },
  { key: 'daysRemaining', header: 'Days Remaining',  width: '120px', align: 'right',
    render: (r) => (
      <span style={{ ...MONO, fontWeight: r.daysRemaining < 7 ? 700 : 400, color: daysRemainingColor(r.daysRemaining) }}>
        {r.daysRemaining < 0 ? `${r.daysRemaining}` : `+${r.daysRemaining}`}
      </span>
    )},
  { key: 'priority',      header: 'Priority',        width: '80px', align: 'center',
    render: (r) => <StatusPill label={r.priority} variant={priorityVariant(r.priority)} /> },
  { key: 'officer',       header: 'Officer',         width: '130px' },
  { key: 'status',        header: 'Status',          width: '140px',
    render: (r) => <StatusPill label={r.status} variant={inboxStatusVariant(r.status)} /> },
];

const ENFORCEMENT_COLS: Column<EnforcementRow>[] = [
  { key: 'ref',             header: 'Ref',              width: '140px', mono: true },
  { key: 'entity',          header: 'Entity',           width: '200px' },
  { key: 'violation',       header: 'Violation',        width: '210px' },
  { key: 'section',         header: 'Section',          width: '100px', mono: true },
  { key: 'fine',            header: 'Fine (ZAR)',        width: '120px', align: 'right', mono: true },
  { key: 'imposedDate',     header: 'Imposed Date',     width: '120px', mono: true },
  { key: 'complianceDate',  header: 'Compliance Date',  width: '130px', mono: true },
  { key: 'paid',            header: 'Paid',             width: '70px', align: 'center',
    render: (r) => (
      <span style={{ ...MONO, fontWeight: 600, color: r.paid ? 'var(--oe-green)' : 'var(--oe-rose)' }}>
        {r.paid ? 'Yes' : 'No'}
      </span>
    )},
  { key: 'status',          header: 'Status',           width: '150px',
    render: (r) => <StatusPill label={r.status} variant={enforcementStatusVariant(r.status)} /> },
];

const LICENCE_COLS: Column<LicenceRow>[] = [
  { key: 'licenceClass', header: 'Licence Class',  width: '120px', render: (r) => (
    <span style={{ fontWeight: 600, color: 'var(--oe-text-1)' }}>{r.licenceClass}</span>
  )},
  { key: 'active',       header: 'Total Active',   width: '100px', align: 'right', mono: true,
    render: (r) => <span style={{ ...MONO, color: 'var(--oe-green)', fontWeight: 700 }}>{r.active}</span> },
  { key: 'expiring90d',  header: 'Expiring 90d',   width: '110px', align: 'right',
    render: (r) => (
      <span style={{ ...MONO, color: r.expiring90d > 0 ? 'var(--oe-amber)' : 'var(--oe-text-3)', fontWeight: r.expiring90d > 0 ? 600 : 400 }}>
        {r.expiring90d}
      </span>
    )},
  { key: 'expired',      header: 'Expired',        width: '80px',  align: 'right',
    render: (r) => (
      <span style={{ ...MONO, color: r.expired > 0 ? 'var(--oe-rose)' : 'var(--oe-text-3)', fontWeight: r.expired > 0 ? 600 : 400 }}>
        {r.expired}
      </span>
    )},
  { key: 'underReview',  header: 'Under Review',   width: '110px', align: 'right', mono: true },
  { key: 'suspended',    header: 'Suspended',      width: '90px',  align: 'right',
    render: (r) => (
      <span style={{ ...MONO, color: r.suspended > 0 ? 'var(--oe-amber)' : 'var(--oe-text-3)', fontWeight: r.suspended > 0 ? 600 : 400 }}>
        {r.suspended}
      </span>
    )},
  { key: 'revoked',      header: 'Revoked',        width: '80px',  align: 'right',
    render: (r) => (
      <span style={{ ...MONO, color: r.revoked > 0 ? 'var(--oe-rose)' : 'var(--oe-text-3)', fontWeight: r.revoked > 0 ? 600 : 400 }}>
        {r.revoked}
      </span>
    )},
];

// ── Section header helper ────────────────────────────────────────────────────
const sectionHeader = (title: string, label: string): React.ReactElement => (
  <div
    style={{
      background: 'var(--oe-surf)',
      borderBottom: '1px solid var(--oe-border)',
      padding: '10px 16px',
      marginBottom: '12px',
    }}
  >
    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
      {label}
    </div>
    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--oe-text-1)' }}>{title}</div>
  </div>
);

// ── Component ────────────────────────────────────────────────────────────────
export function RegulatorAnalytics() {
  const { data: filings, loading: filingsLoading } = useRegulatorFilings();
  const { data: enforcement, loading: enforcementLoading } = useRegulatorEnforcement();
  const { data: licences, loading: licencesLoading } = useRegulatorLicences();

  // KPI computations
  const pendingCount = filings.length > 0
    ? filings.filter(f => !/closed|complete|granted|issued/i.test(f.status)).length
    : 84;

  const slaBreachedCount = filings.length > 0
    ? filings.filter(f => (f.days_remaining ?? 0) < 0).length
    : 7;

  const activeLicencesCount = licences.length > 0
    ? licences.filter(l => /active/i.test(l.status)).length
    : 312;

  const openEnforcementCount = enforcement.length > 0
    ? enforcement.filter(e => !/closed/i.test(e.status)).length
    : 23;

  // Mapped live rows
  const inboxRows: InboxRow[] = filings.length > 0
    ? filings.map(mapFilingToInboxRow)
    : INBOX_ROWS_FALLBACK;

  const enforcementRows: EnforcementRow[] = enforcement.length > 0
    ? enforcement.map(mapEnforcementRow)
    : ENFORCEMENT_ROWS_FALLBACK;

  const licenceRows: LicenceRow[] = mapLicencesToMatrix(licences);

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* Page title */}
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0, letterSpacing: '-0.02em' }}>
          Regulatory Oversight Analytics
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--oe-text-3)', marginTop: '4px' }}>
          Live regulatory register — ERA 2006 · NERSA §10 · FMA 2012 · POPIA
        </p>
      </div>

      {/* KPI Row */}
      <StatGrid cols={5}>
        <StatCard
          label="Open Cases"
          value={filingsLoading ? '…' : String(pendingCount)}
          variant="rose"
          icon="flag"
        />
        <StatCard
          label="SLA Breaches (30d)"
          value={filingsLoading ? '…' : String(slaBreachedCount)}
          variant="rose"
          icon="alert-triangle"
        />
        <StatCard
          label="Licences Active"
          value={licencesLoading ? '…' : String(activeLicencesCount)}
          variant="green"
          icon="certificate"
        />
        <StatCard
          label="Enforcement Actions YTD"
          value={enforcementLoading ? '…' : String(openEnforcementCount)}
          variant="amber"
          icon="shield"
        />
        <StatCard label="Avg Resolution Time" value="18.4" unit="days" variant="blue" icon="clock" />
      </StatGrid>

      {/* Regulatory Inbox SLA Table */}
      <div>
        {sectionHeader('Regulatory Inbox — SLA Status', 'Open Cases')}
        <DataTable
          columns={INBOX_COLS}
          rows={inboxRows}
          compact
          stickyHeader
        />
      </div>

      {/* Enforcement Actions Table */}
      <div>
        {sectionHeader('Enforcement Actions', 'YTD Enforcement Register')}
        <DataTable
          columns={ENFORCEMENT_COLS}
          rows={enforcementRows}
          compact
          stickyHeader
        />
      </div>

      {/* Licence Status Summary */}
      <div>
        {sectionHeader('Licence Status Summary', 'Licence Register by Class')}
        <DataTable
          columns={LICENCE_COLS}
          rows={licenceRows}
          compact
          stickyHeader
        />
      </div>

      {/* SLA Performance Trend — inline table (static trend data) */}
      <div>
        {sectionHeader('SLA Performance Trend', '6-Month SLA Metrics')}
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
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--oe-grad-table-head)' }}>
                  {['Month', 'On-Time (%)', 'Avg Days', 'Breaches'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 14px',
                        borderBottom: '1px solid var(--oe-border)',
                        textAlign: h === 'Month' ? 'left' : 'right',
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: 'var(--oe-text-3)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SLA_ROWS.map((row, i) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: i < SLA_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none',
                      background: row.isTotal ? 'var(--oe-surf)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '0 14px', height: '44px', fontWeight: row.isTotal ? 700 : 400, color: 'var(--oe-text-1)', whiteSpace: 'nowrap' }}>
                      {row.month}
                    </td>
                    <td
                      style={{
                        padding: '0 14px',
                        height: '44px',
                        ...MONO,
                        fontWeight: 600,
                        color: onTimeColor(row.onTime),
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.onTime.toFixed(1)}%
                    </td>
                    <td style={{ padding: '0 14px', height: '44px', ...MONO, color: 'var(--oe-text-1)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {row.avgDays.toFixed(1)}
                    </td>
                    <td
                      style={{
                        padding: '0 14px',
                        height: '44px',
                        ...MONO,
                        fontWeight: row.breaches > 0 ? 600 : 400,
                        color: row.breaches === 0 ? 'var(--oe-text-3)' : row.breaches >= 7 ? 'var(--oe-rose)' : 'var(--oe-amber)',
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.breaches}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}

export default RegulatorAnalytics;
