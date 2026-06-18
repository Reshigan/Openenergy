// pages/src/meridian/surfaces/carbon/ReportsSurface.tsx
//
// Meridian surface — "Reports & Exports" (carbon_fund role). Extracted verbatim from the
// `reports` tab body of the CarbonWorkstationPage husk (E2.8c). Self-contained: renders the
// shared ReportPanel for each carbon report config (issuances, retirements, offset claims).
// Registered as `carbon_fund:reports` in surfaces.tsx, reached from Atlas (⌘K) via the
// roleData feature key `reports` (added in E2.8c — the husk reports tab had no roleData
// feature). Bucket D (report panel surface).
import React from 'react';
import { ReportPanel, type ReportConfig } from '../../../components/launch/ReportPanel';

const CARBON_REPORTS: ReportConfig[] = [
  {
    title: 'Carbon Issuances',
    endpoint: '/api/carbon/issuances',
    columns: [
      { key: 'issuance_ref', label: 'Reference' },
      { key: 'quantity_tco2e', label: 'tCO₂e', numeric: true },
      { key: 'vintage_year', label: 'Vintage' },
      { key: 'status', label: 'Status' },
      { key: 'created_at', label: 'Issued' },
    ],
    filters: [{ key: 'status', label: 'Status', type: 'select', options: [{ value: 'issued', label: 'Issued' }, { value: 'retired', label: 'Retired' }, { value: 'cancelled', label: 'Cancelled' }] }],
    pivotGroupBy: 'vintage_year',
    mailSubject: 'CEC — Carbon Issuances Report',
  },
  {
    title: 'Retirement Statements',
    endpoint: '/api/carbon/retirements',
    columns: [
      { key: 'retirement_ref', label: 'Reference' },
      { key: 'quantity_tco2e', label: 'tCO₂e', numeric: true },
      { key: 'beneficiary_name', label: 'Beneficiary' },
      { key: 'retired_at', label: 'Date' },
    ],
    dateKey: 'retired_at',
    pivotGroupBy: 'beneficiary_name',
    mailSubject: 'CEC — Carbon Retirements Report',
  },
  {
    title: 'Carbon Tax Offset Claims',
    endpoint: '/api/carbon/offset-claims',
    columns: [
      { key: 'claim_ref', label: 'Reference' },
      { key: 'offset_quantity_tco2e', label: 'tCO₂e', numeric: true },
      { key: 'chain_status', label: 'Status' },
      { key: 'submitted_at', label: 'Submitted' },
    ],
    dateKey: 'submitted_at',
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC — Carbon Offset Claims Report',
  },
];

export default function ReportsSurface(_props: { role: string }) {
  return (
    <div className="space-y-8">
      {CARBON_REPORTS.map((cfg) => (
        <div key={cfg.endpoint} className="space-y-2">
          <p className="text-xs font-semibold text-[var(--ink2)] uppercase tracking-wide">{cfg.title}</p>
          <ReportPanel config={cfg} />
        </div>
      ))}
    </div>
  );
}
