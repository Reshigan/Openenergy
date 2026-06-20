// pages/src/meridian/surfaces/offtaker/ReportsSurface.tsx
//
// Meridian surface — "Reports & Exports" (offtaker role). Extracted verbatim from the `reports`
// tab body (and the OFFTAKER_REPORTS config) of the OfftakerWorkstationPage husk (E2.6).
// Self-contained: renders the shared ReportPanel for each offtaker report config (PPA contracts,
// statutory submissions, green-tariff disclosures, Scope 2 emissions). Registered as
// `offtaker:reports` in surfaces.tsx, reached from Atlas (⌘K) via the roleData feature key
// `reports` (added in E2.6 — the husk reports tab had no roleData feature). Bucket D (report panel).
import React from 'react';
import { useParams } from 'react-router-dom';
import { ReportPanel, type ReportConfig } from '../../../components/launch/ReportPanel';

const OFFTAKER_REPORTS: ReportConfig[] = [
  {
    title: 'PPA Contracts',
    endpoint: '/api/offtaker/ppa-contracts',
    columns: [
      { key: 'contract_ref', label: 'Reference' },
      { key: 'seller_name', label: 'Seller' },
      { key: 'capacity_mw', label: 'MW', numeric: true },
      { key: 'tariff_zar_per_mwh', label: 'ZAR/MWh', numeric: true },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Filed' },
    ],
    filters: [{ key: 'chain_status', label: 'Status', type: 'select', options: [{ value: 'in_force', label: 'In Force' }, { value: 'negotiation', label: 'Negotiation' }, { value: 'expired', label: 'Expired' }] }],
    dateKey: 'created_at',
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC: Offtaker PPA Contracts Report',
  },
  {
    title: 'Statutory Report Submissions',
    endpoint: '/api/reports?role=offtaker',
    columns: [
      { key: 'report_type', label: 'Type' },
      { key: 'period', label: 'Period' },
      { key: 'status', label: 'Status' },
      { key: 'submitted_at', label: 'Submitted' },
    ],
    dateKey: 'submitted_at',
    pivotGroupBy: 'report_type',
    mailSubject: 'CEC: Offtaker Statutory Reports',
  },
  {
    title: 'Green Tariff Disclosures',
    endpoint: '/api/offtaker/green-tariff',
    columns: [
      { key: 'disclosure_type', label: 'Standard' },
      { key: 'label_year', label: 'Year' },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Created' },
    ],
    dateKey: 'created_at',
    pivotGroupBy: 'disclosure_type',
    mailSubject: 'CEC: Green Tariff Disclosures',
  },
  {
    title: 'Scope 2 Emissions',
    endpoint: '/api/offtaker/scope2',
    columns: [
      { key: 'reporting_standard', label: 'Standard' },
      { key: 'fiscal_year', label: 'Year' },
      { key: 'scope2_mwh', label: 'MWh', numeric: true },
      { key: 'status', label: 'Status' },
    ],
    dateKey: 'created_at',
    pivotGroupBy: 'reporting_standard',
    mailSubject: 'CEC: Scope 2 Emissions Report',
  },
];

// One surface serves both the default `reports` tile (full bundle) and the focused
// `annual_reports` tile (sustainability subset), keyed by the `:key` route param the tile was
// reached through (MeridianSurfacePage → /surface/:key) — distinct views, not duplicate pages.
const REPORT_SUBSETS: Record<string, string[]> = {
  annual_reports: ['Green Tariff Disclosures', 'Scope 2 Emissions'],
};

export default function ReportsSurface(_props: { role: string }) {
  const { key = '' } = useParams();
  const subset = REPORT_SUBSETS[key];
  const reports = subset ? OFFTAKER_REPORTS.filter((c) => subset.includes(c.title)) : OFFTAKER_REPORTS;
  return (
    <div className="space-y-8">
      {reports.map((cfg) => (
        <div key={cfg.endpoint} className="space-y-2">
          <p className="text-xs font-semibold text-[var(--ink3)] uppercase tracking-wide">{cfg.title}</p>
          <ReportPanel config={cfg} />
        </div>
      ))}
    </div>
  );
}
