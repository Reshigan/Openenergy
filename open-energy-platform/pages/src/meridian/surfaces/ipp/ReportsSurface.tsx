// pages/src/meridian/surfaces/ipp/ReportsSurface.tsx — IPP "Reports & exports" surface.
// Bucket D: extracted verbatim from the retired IppWorkstationPage `reports` tab body — the
// 4 ReportPanel configs plus 7 print/CSV report sections that lazy-load their backing chain
// tabs. Self-contained `{ role }` body; carries its own IPP_REPORTS config + lazy imports.
import React from 'react';
import { ReportPanel, type ReportConfig } from '../../../components/launch/ReportPanel';

const IppAnnualReportTab = React.lazy(() => import('../../../components/ipp/IppAnnualReportTab').then(m => ({ default: m.IppAnnualReportTab })));
const IppQuarterlyGenReportTab = React.lazy(() => import('../../../components/ipp/IppQuarterlyGenReportTab').then(m => ({ default: m.IppQuarterlyGenReportTab })));
const IppReippppReportsTab = React.lazy(() => import('../../../components/ipp/IppReippppReportsTab').then(m => ({ default: m.IppReippppReportsTab })));
const IppLenderReportingTab = React.lazy(() => import('../../../components/ipp/IppLenderReportingTab').then(m => ({ default: m.IppLenderReportingTab })));
const IppEmpComplianceReportTab = React.lazy(() => import('../../../components/ipp/IppEmpComplianceReportTab').then(m => ({ default: m.IppEmpComplianceReportTab })));
const IppEcoReportTab = React.lazy(() => import('../../../components/ipp/IppEcoReportTab').then(m => ({ default: m.IppEcoReportTab })));
const IppLcReportTab = React.lazy(() => import('../../../components/ipp/IppLcReportTab').then(m => ({ default: m.IppLcReportTab })));

const IPP_REPORTS: ReportConfig[] = [
  {
    title: 'REIPPPP Compliance Reports',
    endpoint: '/api/ipp/reipppp-reports',
    columns: [
      { key: 'report_ref', label: 'Reference' },
      { key: 'report_type', label: 'Type' },
      { key: 'period', label: 'Period' },
      { key: 'chain_status', label: 'Status' },
      { key: 'submitted_at', label: 'Submitted' },
    ],
    dateKey: 'submitted_at',
    pivotGroupBy: 'report_type',
    mailSubject: 'CEC: REIPPPP Compliance Reports',
  },
  {
    title: 'Milestone Variance Reports',
    endpoint: '/api/ipp/milestone-variance',
    columns: [
      { key: 'report_ref', label: 'Reference' },
      { key: 'project_name', label: 'Project' },
      { key: 'variance_tier', label: 'Tier' },
      { key: 'delay_days', label: 'Delay (days)', numeric: true },
      { key: 'chain_status', label: 'Status' },
    ],
    pivotGroupBy: 'variance_tier',
    mailSubject: 'CEC: IPP Milestone Variance Reports',
  },
  {
    title: 'DSCR Reports',
    endpoint: '/api/ipp/dscr-reports',
    columns: [
      { key: 'report_ref', label: 'Reference' },
      { key: 'dscr_ratio', label: 'DSCR Ratio', numeric: true },
      { key: 'reporting_period', label: 'Period' },
      { key: 'chain_status', label: 'Status' },
    ],
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC: IPP DSCR Reports',
  },
  {
    title: 'Annual Generation Reports',
    endpoint: '/api/ipp/quarterly-gen-reports',
    columns: [
      { key: 'report_ref', label: 'Reference' },
      { key: 'period', label: 'Period' },
      { key: 'energy_generated_mwh', label: 'MWh Generated', numeric: true },
      { key: 'capacity_factor_pct', label: 'Capacity Factor %', numeric: true },
      { key: 'chain_status', label: 'Status' },
    ],
    pivotGroupBy: 'period',
    mailSubject: 'CEC: IPP Generation Reports',
  },
];

function exportCsv(section: string, file: string) {
  const a = document.createElement('a');
  a.href = `/api/reports/export?section=${section}&format=csv`;
  a.download = file;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function ReportsSurface(_props: { role: string }) {
  return (
    <div className="space-y-8">
      {IPP_REPORTS.map(cfg => (
        <div key={cfg.endpoint} className="space-y-2">
          <p className="text-xs font-semibold text-[var(--ink3)] uppercase tracking-wide">{cfg.title}</p>
          <ReportPanel config={cfg} />
        </div>
      ))}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--ink3)] uppercase tracking-wide">Annual compliance report</p>
        <div className="flex gap-2 mb-4">
          <button type="button" onClick={() => exportCsv('ipp-annual', 'ipp-annual-report.csv')} className="btn pri">Export CSV</button>
          <button type="button" onClick={() => window.print()} className="btn ghost">Print / PDF</button>
        </div>
        <React.Suspense fallback={<div className="animate-pulse h-32 bg-[var(--raised)] rounded-md" />}><IppAnnualReportTab /></React.Suspense>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--ink3)] uppercase tracking-wide">DMRE quarterly generation report</p>
        <div className="flex gap-2 mb-4">
          <button type="button" onClick={() => exportCsv('ipp-quarterly-gen', 'ipp-quarterly-gen-report.csv')} className="btn pri">Export CSV</button>
          <button type="button" onClick={() => window.print()} className="btn ghost">Print / PDF</button>
        </div>
        <React.Suspense fallback={<div className="animate-pulse h-32 bg-[var(--raised)] rounded-md" />}><IppQuarterlyGenReportTab /></React.Suspense>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--ink3)] uppercase tracking-wide">REIPPPP annual progress report</p>
        <div className="flex gap-2 mb-4">
          <button type="button" onClick={() => exportCsv('ipp-reipppp', 'ipp-reipppp-report.csv')} className="btn pri">Export CSV</button>
          <button type="button" onClick={() => window.print()} className="btn ghost">Print / PDF</button>
        </div>
        <React.Suspense fallback={<div className="animate-pulse h-32 bg-[var(--raised)] rounded-md" />}><IppReippppReportsTab /></React.Suspense>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--ink3)] uppercase tracking-wide">Lender reporting covenant</p>
        <div className="flex gap-2 mb-4">
          <button type="button" onClick={() => exportCsv('ipp-lender-reporting', 'ipp-lender-reporting.csv')} className="btn pri">Export CSV</button>
          <button type="button" onClick={() => window.print()} className="btn ghost">Print / PDF</button>
        </div>
        <React.Suspense fallback={<div className="animate-pulse h-32 bg-[var(--raised)] rounded-md" />}><IppLenderReportingTab /></React.Suspense>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--ink3)] uppercase tracking-wide">EMP annual compliance report</p>
        <div className="flex gap-2 mb-4">
          <button type="button" onClick={() => exportCsv('ipp-emp-compliance', 'ipp-emp-compliance-report.csv')} className="btn pri">Export CSV</button>
          <button type="button" onClick={() => window.print()} className="btn ghost">Print / PDF</button>
        </div>
        <React.Suspense fallback={<div className="animate-pulse h-32 bg-[var(--raised)] rounded-md" />}><IppEmpComplianceReportTab /></React.Suspense>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--ink3)] uppercase tracking-wide">ECO audit report</p>
        <div className="flex gap-2 mb-4">
          <button type="button" onClick={() => exportCsv('ipp-eco', 'ipp-eco-report.csv')} className="btn pri">Export CSV</button>
          <button type="button" onClick={() => window.print()} className="btn ghost">Print / PDF</button>
        </div>
        <React.Suspense fallback={<div className="animate-pulse h-32 bg-[var(--raised)] rounded-md" />}><IppEcoReportTab /></React.Suspense>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--ink3)] uppercase tracking-wide">Local content &amp; SED compliance</p>
        <div className="flex gap-2 mb-4">
          <button type="button" onClick={() => exportCsv('ipp-lc', 'ipp-lc-report.csv')} className="btn pri">Export CSV</button>
          <button type="button" onClick={() => window.print()} className="btn ghost">Print / PDF</button>
        </div>
        <React.Suspense fallback={<div className="animate-pulse h-32 bg-[var(--raised)] rounded-md" />}><IppLcReportTab /></React.Suspense>
      </div>
    </div>
  );
}
