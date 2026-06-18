// pages/src/meridian/surfaces/support/ReportsSurface.tsx
//
// Meridian surface — "Reports & Exports" (support role). Extracted verbatim from the `reports`
// tab body of the SupportWorkstationPage husk (E2.4). Self-contained: a ReportPanel for each
// support report config (SLA performance, CSAT records, problem records). Bucket D (report panel
// surface). Registered as `support:reports`, reached from Atlas (⌘K) via the roleData feature key
// `reports` (added in E2.4 — the husk reports tab had no roleData feature).
import React from 'react';
import { ReportPanel, type ReportConfig } from '../../../components/launch/ReportPanel';

const SUPPORT_REPORTS: ReportConfig[] = [
  {
    title: 'SLA Performance Reports',
    endpoint: '/api/support/sla-reports',
    columns: [
      { key: 'report_ref', label: 'Reference' },
      { key: 'report_period', label: 'Period' },
      { key: 'p1_adherence_pct', label: 'P1 %', numeric: true },
      { key: 'p2_adherence_pct', label: 'P2 %', numeric: true },
      { key: 'chain_status', label: 'Status' },
    ],
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC — SLA Performance Report',
  },
  {
    title: 'CSAT Records',
    endpoint: '/api/support/csat',
    columns: [
      { key: 'ticket_ref', label: 'Ticket' },
      { key: 'csat_score', label: 'CSAT Score', numeric: true },
      { key: 'priority', label: 'Priority' },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Filed' },
    ],
    filters: [{ key: 'priority', label: 'Priority', type: 'select', options: [{ value: 'P1', label: 'P1 Critical' }, { value: 'P2', label: 'P2 High' }, { value: 'P3', label: 'P3 Medium' }, { value: 'P4', label: 'P4 Low' }] }],
    pivotGroupBy: 'priority',
    mailSubject: 'CEC — CSAT Records Report',
  },
  {
    title: 'Problem Records',
    endpoint: '/api/support/problem-records',
    columns: [
      { key: 'problem_ref', label: 'Reference' },
      { key: 'description', label: 'Description' },
      { key: 'impact_tier', label: 'Impact' },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Opened' },
    ],
    pivotGroupBy: 'impact_tier',
    mailSubject: 'CEC — Problem Records Report',
  },
];

export default function ReportsSurface(_props: { role: string }) {
  return (
    <div className="space-y-8">
      {SUPPORT_REPORTS.map((cfg) => (
        <div key={cfg.endpoint} className="space-y-2">
          <p className="text-xs font-semibold text-[var(--ink3)] uppercase tracking-wide">{cfg.title}</p>
          <ReportPanel config={cfg} />
        </div>
      ))}
    </div>
  );
}
