// pages/src/meridian/surfaces/grid/ReportsSurface.tsx
//
// Meridian surface — "Reports & Exports" (grid_operator role). Extracted verbatim from the
// `reports` tab body of the GridOpsWorkstationPage husk (E2.5). Self-contained: a ReportPanel for
// each grid report config (wheeling charges, dispatch nominations, grid code compliance).
// Bucket D (report panel surface). Registered as `grid_operator:reports` in surfaces.tsx, reached
// from Atlas (⌘K) via the roleData feature key `reports` (added in E2.5 — the husk reports tab
// had no roleData feature).
import React from 'react';
import { ReportPanel, type ReportConfig } from '../../../components/launch/ReportPanel';

const GRID_REPORTS: ReportConfig[] = [
  {
    title: 'Wheeling Charges',
    endpoint: '/api/grid/wheeling-charges',
    columns: [
      { key: 'charge_ref', label: 'Reference' },
      { key: 'licensee_id', label: 'Licensee' },
      { key: 'amount_zar', label: 'ZAR', numeric: true },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Filed' },
    ],
    filters: [{ key: 'chain_status', label: 'Status', type: 'select', options: [{ value: 'invoiced', label: 'Invoiced' }, { value: 'disputed', label: 'Disputed' }, { value: 'settled', label: 'Settled' }] }],
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC — Grid Wheeling Charges Report',
  },
  {
    title: 'Dispatch Nominations',
    endpoint: '/api/grid/dispatch-nominations',
    columns: [
      { key: 'trading_day', label: 'Trading Day' },
      { key: 'scheduled_mwh', label: 'Scheduled MWh', numeric: true },
      { key: 'actual_mwh', label: 'Actual MWh', numeric: true },
      { key: 'imbalance_mwh', label: 'Imbalance MWh', numeric: true },
      { key: 'nomination_status', label: 'Status' },
    ],
    dateKey: 'trading_day',
    pivotGroupBy: 'nomination_status',
    mailSubject: 'CEC — Dispatch Nominations Report',
  },
  {
    title: 'Grid Code Compliance',
    endpoint: '/api/grid/code-compliance',
    columns: [
      { key: 'compliance_ref', label: 'Reference' },
      { key: 'requirement_code', label: 'Code' },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Filed' },
    ],
    pivotGroupBy: 'requirement_code',
    mailSubject: 'CEC — Grid Code Compliance Report',
  },
];

export default function ReportsSurface(_props: { role: string }) {
  return (
    <div className="space-y-8">
      {GRID_REPORTS.map((cfg) => (
        <div key={cfg.endpoint} className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cfg.title}</p>
          <ReportPanel config={cfg} />
        </div>
      ))}
    </div>
  );
}
