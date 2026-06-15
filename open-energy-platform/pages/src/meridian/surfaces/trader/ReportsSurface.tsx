// pages/src/meridian/surfaces/trader/ReportsSurface.tsx
//
// Meridian surface — "Reports & Exports" (trader role). Extracted verbatim from the `reports`
// tab body of the TraderWorkstationPage husk (E2.3). Self-contained: CSV/print export controls
// + a ReportPanel for each trader report config (trade settlement, best-execution, FSCA trade
// reports). The husk's in-page quick-jump to the `pnl-attribution` tab is now a router link to
// the P&L attribution ledger (/ledger/pnl_attribution). Bucket D (report panel surface).
// Registered as `trader:reports` in surfaces.tsx, reached from Atlas (⌘K) via the roleData
// feature key `reports` (added in E2.3 — the husk reports tab had no roleData feature).
import React from 'react';
import { Link } from 'react-router-dom';
import { ReportPanel, type ReportConfig } from '../../../components/launch/ReportPanel';

const TRADER_REPORTS: ReportConfig[] = [
  {
    title: 'Trade Settlement',
    endpoint: '/api/settlement/cycles',
    columns: [
      { key: 'trade_date', label: 'Trade Date' },
      { key: 'total_trades', label: 'Trades', numeric: true },
      { key: 'total_volume_mwh', label: 'Volume MWh', numeric: true },
      { key: 'total_value_zar', label: 'Value ZAR', numeric: true },
      { key: 'status', label: 'Status' },
    ],
    dateKey: 'trade_date',
    pivotGroupBy: 'status',
    mailSubject: 'CEC — Trade Settlement Report',
  },
  {
    title: 'Best Execution Records',
    endpoint: '/api/trader/best-execution',
    columns: [
      { key: 'order_ref', label: 'Order' },
      { key: 'instrument', label: 'Instrument' },
      { key: 'executed_volume_mwh', label: 'MWh', numeric: true },
      { key: 'executed_price_zar', label: 'ZAR/MWh', numeric: true },
      { key: 'slippage_zar', label: 'Slippage', numeric: true },
      { key: 'chain_status', label: 'Status' },
    ],
    pivotGroupBy: 'instrument',
    mailSubject: 'CEC — Best Execution Report',
  },
  {
    title: 'FSCA Trade Reports',
    endpoint: '/api/trader/trade-reports',
    columns: [
      { key: 'report_ref', label: 'Reference' },
      { key: 'reporting_period', label: 'Period' },
      { key: 'total_trades_reported', label: 'Trades', numeric: true },
      { key: 'chain_status', label: 'Status' },
      { key: 'submitted_at', label: 'Submitted' },
    ],
    dateKey: 'submitted_at',
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC — FSCA Trade Reports',
  },
];

export default function ReportsSurface(_props: { role: string }) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[#1e2a38]">Export</p>
          <p className="text-xs text-[#4a5568]">Download trader data for offline analysis or regulatory submission.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              const url = '/api/reports/export?role=trader&format=csv';
              const a = document.createElement('a');
              a.href = url;
              a.download = 'trader-report.csv';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }}
            className="px-3 py-1.5 text-xs bg-[#c2873a] text-white rounded hover:bg-[#a3702f]"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 text-xs bg-[#2d3748] text-white rounded hover:bg-[#1e2a38]"
          >
            Print / PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link
          to="/ledger/pnl_attribution"
          className="block rounded-lg border border-[#dde4ec] bg-white p-4 hover:border-blue-400 hover:shadow-sm transition-all"
        >
          <p className="text-sm font-semibold text-[#1e2a38]">P&amp;L attribution</p>
          <p className="mt-1 text-xs text-[#4a5568]">Daily P&amp;L attribution by book and strategy. View and manage the P&amp;L attribution chain.</p>
        </Link>
      </div>

      {TRADER_REPORTS.map((cfg) => (
        <div key={cfg.endpoint} className="space-y-2">
          <p className="text-xs font-semibold text-[#4a5568] uppercase tracking-wide">{cfg.title}</p>
          <ReportPanel config={cfg} />
        </div>
      ))}
    </div>
  );
}
