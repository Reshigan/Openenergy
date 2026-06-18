// pages/src/meridian/surfaces/lender/ReportsSurface.tsx
//
// Meridian surface — "Reports & Exports" (lender role). Extracted verbatim from the `reports`
// tab body of the LenderWorkstationPage husk (E2.8e). Self-contained: renders the shared
// ReportPanel for each lender report config (covenant certificates, DSCR monitoring, drawdown
// records, EP IV ESAP monitoring). Registered as `lender:reports` in surfaces.tsx, reached from
// Atlas (⌘K) via the roleData feature key `reports` (added in E2.8e — the husk reports tab had
// no roleData feature). Bucket D (report panel surface).
import React from 'react';
import { useParams } from 'react-router-dom';
import { ReportPanel, type ReportConfig } from '../../../components/launch/ReportPanel';

const LENDER_REPORTS: ReportConfig[] = [
  {
    title: 'Covenant Certificates',
    endpoint: '/api/lender/covenant-certs',
    columns: [
      { key: 'cert_ref', label: 'Reference' },
      { key: 'borrower_id', label: 'Borrower' },
      { key: 'reporting_period', label: 'Period' },
      { key: 'chain_status', label: 'Status' },
      { key: 'submitted_at', label: 'Submitted' },
    ],
    dateKey: 'submitted_at',
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC — Lender Covenant Certificates Report',
  },
  {
    title: 'DSCR Monitoring',
    endpoint: '/api/lender/dscr-monitoring',
    columns: [
      { key: 'facility_ref', label: 'Facility' },
      { key: 'reporting_period', label: 'Period' },
      { key: 'dscr_ratio', label: 'DSCR', numeric: true },
      { key: 'dscr_covenant', label: 'Covenant', numeric: true },
      { key: 'breach_status', label: 'Breach' },
    ],
    pivotGroupBy: 'breach_status',
    mailSubject: 'CEC — DSCR Monitoring Report',
  },
  {
    title: 'Drawdown Records',
    endpoint: '/api/lender/drawdowns',
    columns: [
      { key: 'drawdown_ref', label: 'Reference' },
      { key: 'facility_ref', label: 'Facility' },
      { key: 'amount_zar', label: 'Amount ZAR', numeric: true },
      { key: 'chain_status', label: 'Status' },
      { key: 'disbursed_at', label: 'Disbursed' },
    ],
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC — Lender Drawdown Report',
  },
  {
    title: 'EP IV ESAP Monitoring',
    endpoint: '/api/lender/esap-monitoring',
    columns: [
      { key: 'esap_ref', label: 'Reference' },
      { key: 'ep_category', label: 'EP Category' },
      { key: 'ps_standard', label: 'PS Standard' },
      { key: 'chain_status', label: 'Status' },
      { key: 'review_due', label: 'Due' },
    ],
    pivotGroupBy: 'ep_category',
    mailSubject: 'CEC — EP IV ESAP Report',
  },
];

// One surface component serves three Atlas tiles. The default `reports` tile shows the full
// bundle; the focused tiles (`facility_reports`, `covenant_reports`) render a relevant subset so
// each tile is a distinct view, not a duplicate page. Keyed by the `:key` route param the tile
// was reached through (MeridianSurfacePage → /surface/:key).
const REPORT_SUBSETS: Record<string, string[]> = {
  facility_reports: ['Drawdown Records', 'DSCR Monitoring'],
  covenant_reports: ['Covenant Certificates', 'EP IV ESAP Monitoring'],
};

export default function ReportsSurface(_props: { role: string }) {
  const { key = '' } = useParams();
  const subset = REPORT_SUBSETS[key];
  const reports = subset ? LENDER_REPORTS.filter((c) => subset.includes(c.title)) : LENDER_REPORTS;
  return (
    <div className="space-y-8">
      {reports.map((cfg) => (
        <div key={cfg.endpoint} className="space-y-2">
          <p className="text-xs font-semibold text-[var(--ink2)] uppercase tracking-wide">{cfg.title}</p>
          <ReportPanel config={cfg} />
        </div>
      ))}
    </div>
  );
}
