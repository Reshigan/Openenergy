// pages/src/meridian/surfaces/regulator/ReportsSurface.tsx
//
// Meridian surface — "Reports & Exports" (regulator role). Extracted verbatim from the
// `reports` tab body of the RegulatorWorkstationPage husk (E2.8d). Self-contained: renders the
// shared ReportPanel for each regulator report config (statutory submissions, levy assessments,
// disposition cases). Registered as `regulator:reports` in surfaces.tsx, reached from Atlas
// (⌘K) via the roleData feature key `reports` (added in E2.8d — the husk reports tab had no
// roleData feature). Bucket D (report panel surface).
import React from 'react';
import { ReportPanel, type ReportConfig } from '../../../components/launch/ReportPanel';

const REGULATOR_REPORTS: ReportConfig[] = [
  {
    title: 'Statutory Report Submissions',
    endpoint: '/api/reports?role=regulator',
    columns: [
      { key: 'report_type', label: 'Type' },
      { key: 'period', label: 'Period' },
      { key: 'status', label: 'Status' },
      { key: 'submitted_at', label: 'Submitted' },
    ],
    dateKey: 'submitted_at',
    pivotGroupBy: 'report_type',
    mailSubject: 'CEC — Regulator Statutory Reports',
  },
  {
    title: 'Levy Assessments',
    endpoint: '/api/regulator/levies',
    columns: [
      { key: 'levy_ref', label: 'Reference' },
      { key: 'licensee_id', label: 'Licensee' },
      { key: 'levy_amount_zar', label: 'ZAR', numeric: true },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Assessed' },
    ],
    filters: [{ key: 'chain_status', label: 'Status', type: 'select', options: [{ value: 'assessed', label: 'Assessed' }, { value: 'final_demand', label: 'Final Demand' }, { value: 'enforcement', label: 'Enforcement' }, { value: 'paid', label: 'Paid' }] }],
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC — NERSA Levy Assessments Report',
  },
  {
    title: 'Disposition Cases',
    endpoint: '/api/regulator/disposition-cases',
    columns: [
      { key: 'case_ref', label: 'Reference' },
      { key: 'subject_id', label: 'Subject' },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Filed' },
    ],
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC — Disposition Cases Report',
  },
];

export default function ReportsSurface(_props: { role: string }) {
  return (
    <div className="space-y-8">
      {REGULATOR_REPORTS.map((cfg) => (
        <div key={cfg.endpoint} className="space-y-2">
          <p className="text-xs font-semibold text-[var(--ink3)] uppercase tracking-wide">{cfg.title}</p>
          <ReportPanel config={cfg} />
        </div>
      ))}
    </div>
  );
}
