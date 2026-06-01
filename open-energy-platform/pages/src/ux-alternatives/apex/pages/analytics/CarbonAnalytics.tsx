import React from 'react';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StatusPill, PillVariant } from '../../components/display/StatusPill';
import { useCarbonCredits, useCarbonProjects, useCarbonRetirements, useCarbonMrv } from '../../lib/hooks';
import type { CarbonCredit, CarbonProject } from '../../lib/client';

// ── Mock Data (fallbacks) ─────────────────────────────────────────────────────

interface CreditRow {
  id: string;
  project: string;
  standard: string;
  methodology: string;
  vintage: string;
  issued: string;
  retired: string;
  buffer: string;
  available: string;
  price: string;
  value: string;
}

const CREDIT_ROWS_FALLBACK: CreditRow[] = [
  { id: 'c1',  project: 'Sere Wind Farm',           standard: 'Article 6.4', methodology: 'AMS-I.D / wind',       vintage: '2023', issued: '42,000', retired: '31,500', buffer: '4,200', available: '6,300',  price: 'R195', value: 'R1.23' },
  { id: 'c2',  project: 'Kathu Solar Park',          standard: 'Gold Standard', methodology: 'AMS-I.A / solar PV', vintage: '2023', issued: '38,500', retired: '28,000', buffer: '3,850', available: '6,650',  price: 'R188', value: 'R1.25' },
  { id: 'c3',  project: 'De Aar Wind 2',             standard: 'Verra',         methodology: 'ACM0002 / wind',     vintage: '2022', issued: '29,400', retired: '22,000', buffer: '2,940', available: '4,460',  price: 'R175', value: 'R0.78' },
  { id: 'c4',  project: 'Cookhouse Wind',            standard: 'Article 6.4', methodology: 'AMS-I.D / wind',       vintage: '2024', issued: '24,600', retired: '14,000', buffer: '2,460', available: '8,140',  price: 'R202', value: 'R1.64' },
  { id: 'c5',  project: 'Dreunberg Solar PV',        standard: 'Gold Standard', methodology: 'AMS-I.A / solar PV', vintage: '2023', issued: '21,800', retired: '18,200', buffer: '2,180', available: '1,420',  price: 'R184', value: 'R0.26' },
  { id: 'c6',  project: 'Noupoort Wind',             standard: 'Verra',         methodology: 'ACM0002 / wind',     vintage: '2022', issued: '19,200', retired: '15,400', buffer: '1,920', available: '1,880',  price: 'R172', value: 'R0.32' },
  { id: 'c7',  project: 'Loeriesfontein 2',          standard: 'Article 6.4', methodology: 'AMS-I.D / wind',       vintage: '2024', issued: '18,500', retired: '10,200', buffer: '1,850', available: '6,450',  price: 'R198', value: 'R1.28' },
  { id: 'c8',  project: 'Sishen Solar',              standard: 'Gold Standard', methodology: 'AMS-I.A / solar PV', vintage: '2023', issued: '17,400', retired: '13,500', buffer: '1,740', available: '2,160',  price: 'R186', value: 'R0.40' },
  { id: 'c9',  project: 'Khobab Wind',               standard: 'Verra',         methodology: 'ACM0002 / wind',     vintage: '2022', issued: '15,800', retired: '12,600', buffer: '1,580', available: '1,620',  price: 'R170', value: 'R0.28' },
  { id: 'c10', project: 'Roggeveld Wind',            standard: 'Article 6.4', methodology: 'AMS-I.D / wind',       vintage: '2024', issued: '14,200', retired: '8,500',  buffer: '1,420', available: '4,280',  price: 'R205', value: 'R0.88' },
  { id: 'c11', project: 'Mulilo Sonnedix Prieska',   standard: 'Gold Standard', methodology: 'AMS-I.A / solar PV', vintage: '2023', issued: '12,600', retired: '11,000', buffer: '1,260', available: '340',    price: 'R182', value: 'R0.06' },
  { id: 'c12', project: 'Jeffreys Bay Wind',         standard: 'Verra',         methodology: 'ACM0002 / wind',     vintage: '2022', issued: '10,400', retired: '9,300',  buffer: '1,040', available: '60',     price: 'R168', value: 'R0.01' },
];

interface MrvRow {
  id: string;
  project: string;
  period: string;
  stage: string;
  submitted: string;
  verifier: string;
  expectedIssuance: string;
  status: string;
}

const MRV_ROWS_FALLBACK: MrvRow[] = [
  { id: 'm1', project: 'Sere Wind Farm',          period: 'Q4 2024',      stage: 'Verification',   submitted: '2025-01-15', verifier: 'Bureau Veritas',  expectedIssuance: '42,000 tCO2e', status: 'Under Review' },
  { id: 'm2', project: 'Kathu Solar Park',         period: 'Q3–Q4 2024',  stage: 'Validation',     submitted: '2025-02-01', verifier: 'SGS SA',          expectedIssuance: '21,500 tCO2e', status: 'Submitted' },
  { id: 'm3', project: 'Cookhouse Wind',           period: 'Q4 2024',      stage: 'Site Audit',     submitted: '2025-02-14', verifier: 'SCS Global',      expectedIssuance: '12,300 tCO2e', status: 'In Progress' },
  { id: 'm4', project: 'Loeriesfontein 2',         period: 'FY 2024',      stage: 'CRA Review',     submitted: '2025-01-28', verifier: 'DNV',             expectedIssuance: '18,500 tCO2e', status: 'Awaiting CRA' },
  { id: 'm5', project: 'Noupoort Wind',            period: 'Q3 2024',      stage: 'Issuance',       submitted: '2024-11-30', verifier: 'Bureau Veritas',  expectedIssuance: '9,600 tCO2e',  status: 'Approved' },
  { id: 'm6', project: 'Roggeveld Wind',           period: 'Q4 2024',      stage: 'Monitoring',     submitted: '—',          verifier: 'TBD',             expectedIssuance: '14,200 tCO2e', status: 'Draft' },
  { id: 'm7', project: 'Dreunberg Solar PV',       period: 'FY 2024',      stage: 'Verification',   submitted: '2025-01-10', verifier: 'SGS SA',          expectedIssuance: '10,900 tCO2e', status: 'Under Review' },
  { id: 'm8', project: 'Jeffreys Bay Wind',        period: 'Q3 2024',      stage: 'Issuance',       submitted: '2024-12-05', verifier: 'DNV',             expectedIssuance: '5,200 tCO2e',  status: 'Complete' },
];

interface RetirementRow {
  id: string;
  month: string;
  credits: string;
  buyer: string;
  standard: string;
  scope: string;
  certRef: string;
  value: string;
}

const RETIREMENT_ROWS_FALLBACK: RetirementRow[] = [
  { id: 'r1',  month: 'May 2025',  credits: '24,800', buyer: 'Anglo American Platinum',  standard: 'Gold Standard', scope: 'Scope 2', certRef: 'GS-CER-2025-0541', value: 'R4,662,400' },
  { id: 'r2',  month: 'Apr 2025',  credits: '21,500', buyer: 'Sasol Ltd',                standard: 'Article 6.4',   scope: 'Scope 1', certRef: 'A64-2025-0318',    value: 'R4,257,000' },
  { id: 'r3',  month: 'Mar 2025',  credits: '18,200', buyer: 'FirstRand Group',          standard: 'Verra',         scope: 'Scope 2', certRef: 'VCS-2025-0892',    value: 'R3,185,000' },
  { id: 'r4',  month: 'Feb 2025',  credits: '19,600', buyer: 'Shoprite Holdings',        standard: 'Gold Standard', scope: 'Scope 2', certRef: 'GS-CER-2025-0429', value: 'R3,645,600' },
  { id: 'r5',  month: 'Jan 2025',  credits: '16,400', buyer: 'MTN Group',                standard: 'Article 6.4',   scope: 'Scope 1', certRef: 'A64-2025-0104',    value: 'R3,198,000' },
  { id: 'r6',  month: 'Dec 2024',  credits: '22,100', buyer: 'Eskom Holdings',           standard: 'Verra',         scope: 'Scope 1', certRef: 'VCS-2024-1144',    value: 'R3,757,000' },
  { id: 'r7',  month: 'Nov 2024',  credits: '17,800', buyer: 'Standard Bank Group',      standard: 'Gold Standard', scope: 'Scope 2', certRef: 'GS-CER-2024-1088', value: 'R3,292,800' },
  { id: 'r8',  month: 'Oct 2024',  credits: '20,400', buyer: 'Transnet SOC',             standard: 'Article 6.4',   scope: 'Scope 1', certRef: 'A64-2024-0987',    value: 'R3,978,000' },
  { id: 'r9',  month: 'Sep 2024',  credits: '15,600', buyer: 'Nedbank Group',            standard: 'Verra',         scope: 'Scope 2', certRef: 'VCS-2024-0911',    value: 'R2,652,000' },
  { id: 'r10', month: 'Aug 2024',  credits: '21,800', buyer: 'ArcelorMittal SA',         standard: 'Gold Standard', scope: 'Scope 1', certRef: 'GS-CER-2024-0876', value: 'R4,033,000' },
];

interface ScopeRow {
  id: string;
  scope: string;
  source: string;
  currentYear: string;
  priorYear: string;
  yoyDelta: string;
  isReduction: boolean;
  intensity: string;
}

const SCOPE_ROWS: ScopeRow[] = [
  { id: 's1', scope: 'Scope 1', source: 'Direct combustion / process emissions', currentYear: '12,840', priorYear: '14,620', yoyDelta: '-12.2%', isReduction: true,  intensity: '0.042' },
  { id: 's2', scope: 'Scope 2', source: 'Grid electricity (location-based)',      currentYear: '28,600', priorYear: '26,400', yoyDelta: '+8.3%',  isReduction: false, intensity: '0.094' },
  { id: 's3', scope: 'Scope 3', source: 'Supply chain & transmission losses',     currentYear: '41,200', priorYear: '44,800', yoyDelta: '-8.0%',  isReduction: true,  intensity: '0.135' },
];

// ── Helper: standard → pill variant ─────────────────────────────────────────
function standardVariant(standard: string): PillVariant {
  if (standard === 'Article 6.4') return 'blue';
  if (standard === 'Gold Standard') return 'green';
  if (standard === 'Verra') return 'violet';
  return 'default';
}

// ── Helper: mrv stage → pill variant ────────────────────────────────────────
function mrvVariant(status: string): PillVariant {
  const s = status.toLowerCase();
  if (s === 'complete' || s === 'approved' || s === 'certified' || s === 'issued') return 'green';
  if (s === 'submitted' || s === 'under review' || s === 'awaiting cra' || s === 'in progress' || s === 'validation' || s === 'verification' || s === 'site_audit' || s === 'cra_review') return 'blue';
  if (s === 'draft') return 'default';
  return 'default';
}

// ── Column definitions ───────────────────────────────────────────────────────
const CREDIT_COLS: Column<CreditRow>[] = [
  { key: 'project',     header: 'Project',          width: '180px' },
  { key: 'standard',    header: 'Standard',         width: '110px',
    render: (r) => <StatusPill label={r.standard} variant={standardVariant(r.standard)} /> },
  { key: 'methodology', header: 'Methodology',      width: '160px' },
  { key: 'vintage',     header: 'Vintage',          width: '70px', align: 'center', mono: true },
  { key: 'issued',      header: 'Issued (tCO2e)',   width: '110px', align: 'right', mono: true },
  { key: 'retired',     header: 'Retired',          width: '90px',  align: 'right', mono: true },
  { key: 'buffer',      header: 'Buffer',           width: '90px',  align: 'right', mono: true },
  { key: 'available',   header: 'Available',        width: '90px',  align: 'right', mono: true },
  { key: 'price',       header: 'Price (ZAR)',      width: '90px',  align: 'right', mono: true },
  { key: 'value',       header: 'Value (ZAR M)',    width: '100px', align: 'right', mono: true },
];

const MRV_COLS: Column<MrvRow>[] = [
  { key: 'project',          header: 'Project',            width: '180px' },
  { key: 'period',           header: 'Reporting Period',   width: '120px' },
  { key: 'stage',            header: 'Stage',              width: '110px',
    render: (r) => <StatusPill label={r.stage} variant="blue" /> },
  { key: 'submitted',        header: 'Submitted',          width: '110px', mono: true },
  { key: 'verifier',         header: 'Verifier',           width: '140px' },
  { key: 'expectedIssuance', header: 'Expected Issuance',  width: '130px', align: 'right', mono: true },
  { key: 'status',           header: 'Status',             width: '120px',
    render: (r) => <StatusPill label={r.status} variant={mrvVariant(r.status)} /> },
];

const RETIREMENT_COLS: Column<RetirementRow>[] = [
  { key: 'month',   header: 'Month',                    width: '100px' },
  { key: 'credits', header: 'Credits Retired (tCO2e)',  width: '160px', align: 'right', mono: true },
  { key: 'buyer',   header: 'Buyer',                    width: '200px' },
  { key: 'standard',header: 'Standard',                 width: '110px',
    render: (r) => <StatusPill label={r.standard} variant={standardVariant(r.standard)} /> },
  { key: 'scope',   header: 'Scope',                    width: '80px', align: 'center' },
  { key: 'certRef', header: 'Certificate Ref',          width: '160px', mono: true },
  { key: 'value',   header: 'Value (ZAR)',              width: '120px', align: 'right', mono: true },
];

// ── Styles ───────────────────────────────────────────────────────────────────
const sectionHeader = (title: string, label: string): React.ReactElement => (
  <div
    style={{
      background: 'var(--oe-surf)',
      borderBottom: '1px solid var(--oe-border)',
      padding: '10px 16px 10px',
      marginBottom: '12px',
    }}
  >
    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
      {label}
    </div>
    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--oe-text-1)' }}>{title}</div>
  </div>
);

const MONO: React.CSSProperties = { fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' };

// ── Component ────────────────────────────────────────────────────────────────
export function CarbonAnalytics() {
  const { data: credits, loading: credLoading } = useCarbonCredits();
  const { data: projects } = useCarbonProjects();
  const { data: retirements } = useCarbonRetirements();
  const { data: mrv } = useCarbonMrv();

  // ── Computed KPIs ─────────────────────────────────────────────────────────
  const totalIssuedTco2e = credits
    .filter((c: CarbonCredit) => c.status === 'issued')
    .reduce((s: number, c: CarbonCredit) => s + (c.quantity || 0), 0);

  const totalRetiredTco2e = retirements.reduce((s, r) => s + (r.quantity || 0), 0);

  const pendingMrv = mrv.filter(m => m.status !== 'certified' && m.status !== 'issued').length;

  const article6Count = credits.filter((c: CarbonCredit) => c.registry === 'Article 6.4').length;

  const totalAvailable = credits.reduce((s: number, c: CarbonCredit) => s + (c.available_quantity || 0), 0);

  const avgPrice = credits.length > 0
    ? credits.reduce((s: number, c: CarbonCredit) => s + (c.price_per_credit || 0), 0) / credits.filter((c: CarbonCredit) => (c.price_per_credit || 0) > 0).length
    : 0;

  // ── Credit portfolio rows: group by registry and map to display shape ─────
  const creditRows: CreditRow[] = credLoading
    ? CREDIT_ROWS_FALLBACK
    : credits.slice(0, 20).map((c: CarbonCredit) => {
        const bufferQty = Math.round((c.quantity || 0) * 0.1);
        const retiredApprox = (c.quantity || 0) - (c.available_quantity || 0) - bufferQty;
        const valueM = ((c.available_quantity || 0) * (c.price_per_credit || 0)) / 1_000_000;
        return {
          id: c.id,
          project: c.project_name ?? c.project_id,
          standard: c.registry ?? '—',
          methodology: c.methodology ?? '—',
          vintage: String(c.vintage ?? '—'),
          issued: (c.quantity || 0).toLocaleString(),
          retired: Math.max(0, retiredApprox).toLocaleString(),
          buffer: bufferQty.toLocaleString(),
          available: (c.available_quantity || 0).toLocaleString(),
          price: c.price_per_credit ? `R${Math.round(c.price_per_credit)}` : '—',
          value: valueM > 0 ? `R${valueM.toFixed(2)}` : '—',
        };
      });

  // ── MRV pipeline rows ──────────────────────────────────────────────────────
  const mrvRows: MrvRow[] = mrv.length > 0
    ? mrv.slice(0, 12).map((m, i) => ({
        id: m.id,
        project: projects.find((p: CarbonProject) => p.id === m.project_id)?.project_name ?? m.project_id,
        period: m.reporting_period ?? '—',
        stage: m.stage ?? '—',
        submitted: m.created_at ? m.created_at.slice(0, 10) : '—',
        verifier: m.verifier ?? 'TBD',
        expectedIssuance: m.expected_issuance ? `${m.expected_issuance} tCO2e` : '—',
        status: m.status ?? '—',
      }))
    : MRV_ROWS_FALLBACK;

  // ── Retirement rows ────────────────────────────────────────────────────────
  const retirementRows: RetirementRow[] = retirements.length > 0
    ? retirements.slice(0, 10).map((r, i) => ({
        id: r.id,
        month: r.retired_at ? r.retired_at.slice(0, 7) : '—',
        credits: (r.quantity || 0).toLocaleString(),
        buyer: r.beneficiary ?? '—',
        standard: r.standard ?? '—',
        scope: r.scope ?? '—',
        certRef: r.certificate_ref ?? '—',
        value: r.value_zar ? `R${Math.round(r.value_zar).toLocaleString()}` : '—',
      }))
    : RETIREMENT_ROWS_FALLBACK;

  // ── KPI label helpers ──────────────────────────────────────────────────────
  const issuedLabel = credLoading
    ? '—'
    : totalIssuedTco2e > 0
      ? totalIssuedTco2e.toLocaleString()
      : '284,400';

  const retiredLabel = retirements.length > 0
    ? totalRetiredTco2e.toLocaleString()
    : '198,200';

  const availableLabel = credits.length > 0
    ? totalAvailable.toLocaleString()
    : '57,760';

  const avgPriceLabel = avgPrice > 0
    ? `R${Math.round(avgPrice)}`
    : 'R182';

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* Page title */}
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0, letterSpacing: '-0.02em' }}>
          Carbon Portfolio Analytics
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--oe-text-3)', marginTop: '4px' }}>
          Live credit register — Article 6.4 · Gold Standard · Verra
        </p>
      </div>

      {/* KPI Row */}
      <StatGrid cols={5}>
        <StatCard
          label="Total Issued"
          value={issuedLabel}
          unit="tCO2e"
          variant="navy"
          icon="leaf"
        />
        <StatCard
          label="Total Retired"
          value={retiredLabel}
          unit="tCO2e"
          variant="green"
          icon="check-circle"
        />
        <StatCard
          label="Pending MRV"
          value={mrv.length > 0 ? pendingMrv : 6}
          unit="items"
          variant="amber"
          icon="shield"
          subtext={article6Count > 0 ? `${article6Count} Art. 6.4 credits` : undefined}
        />
        <StatCard
          label="Available for Sale"
          value={availableLabel}
          unit="tCO2e"
          variant="amber"
          icon="dollar"
        />
        <StatCard
          label="Avg Price"
          value={avgPriceLabel}
          unit="/tCO2e"
          variant="green"
          icon="chart-line"
        />
      </StatGrid>

      {/* Credit Portfolio Table */}
      <div>
        {sectionHeader('Credit Portfolio', 'Carbon Credits')}
        <DataTable
          columns={CREDIT_COLS}
          rows={creditRows}
          compact
          stickyHeader
        />
      </div>

      {/* MRV Status Pipeline */}
      <div>
        {sectionHeader('MRV Status Pipeline', 'Monitoring / Reporting / Verification')}
        <DataTable
          columns={MRV_COLS}
          rows={mrvRows}
          compact
          stickyHeader
        />
      </div>

      {/* Monthly Retirement Ledger */}
      <div>
        {sectionHeader('Monthly Retirement Ledger', 'Credit Retirements')}
        <DataTable
          columns={RETIREMENT_COLS}
          rows={retirementRows}
          compact
          stickyHeader
        />
      </div>

      {/* GHG Scope Summary — inline table */}
      <div>
        {sectionHeader('GHG Scope 1 / 2 / 3 Summary', 'Emissions Inventory')}
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
                  {['Scope', 'Source', 'Current Year (tCO2e)', 'Prior Year (tCO2e)', 'YoY Delta %', 'Intensity (tCO2e/MWh)'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 14px',
                        borderBottom: '1px solid var(--oe-border)',
                        textAlign: 'left',
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
                {SCOPE_ROWS.map((row, i) => (
                  <tr
                    key={row.id}
                    style={{ borderBottom: i < SCOPE_ROWS.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}
                  >
                    <td style={{ padding: '0 14px', height: '44px', fontWeight: 700, color: 'var(--oe-text-1)', whiteSpace: 'nowrap' }}>
                      {row.scope}
                    </td>
                    <td style={{ padding: '0 14px', height: '44px', color: 'var(--oe-text-2)', whiteSpace: 'nowrap' }}>
                      {row.source}
                    </td>
                    <td style={{ padding: '0 14px', height: '44px', ...MONO, color: 'var(--oe-text-1)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {row.currentYear}
                    </td>
                    <td style={{ padding: '0 14px', height: '44px', ...MONO, color: 'var(--oe-text-2)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {row.priorYear}
                    </td>
                    <td
                      style={{
                        padding: '0 14px',
                        height: '44px',
                        ...MONO,
                        fontWeight: 600,
                        color: row.isReduction ? 'var(--oe-green)' : 'var(--oe-rose)',
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.yoyDelta}
                    </td>
                    <td style={{ padding: '0 14px', height: '44px', ...MONO, color: 'var(--oe-text-1)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {row.intensity}
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

export default CarbonAnalytics;
