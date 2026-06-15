// pages/src/meridian/surfaces/admin/ReportsSurface.tsx
//
// Meridian surface — "Reports & Exports" (admin role). Extracted verbatim from the `reports`
// tab body (and the ADMIN_REPORTS config) of the AdminWorkstationPage husk (E2.1). Self-
// contained: renders the shared ReportPanel for each admin report config (Platform Events,
// Role Action Queue). Registered as `admin:reports` in surfaces.tsx, reached from Atlas (⌘K)
// via the roleData feature key `reports` (added in E2.1 — the husk reports tab had no roleData
// feature). Bucket D (report panel surface).
import React from 'react';
import { ReportPanel, type ReportConfig } from '../../../components/launch/ReportPanel';

const ADMIN_REPORTS: ReportConfig[] = [
  {
    title: 'Platform Events',
    endpoint: '/api/platform-events',
    columns: [
      { key: 'event', label: 'Event' },
      { key: 'chain_key', label: 'Chain' },
      { key: 'entity_type', label: 'Entity Type' },
      { key: 'actor_id', label: 'Actor' },
      { key: 'occurred_at', label: 'Occurred' },
    ],
    dateKey: 'occurred_at',
    pivotGroupBy: 'chain_key',
    mailSubject: 'CEC — Platform Events Report',
  },
  {
    title: 'Role Action Queue',
    endpoint: '/api/role-actions',
    columns: [
      { key: 'target_role', label: 'Role' },
      { key: 'title', label: 'Title' },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Status' },
      { key: 'sla_due_at', label: 'SLA Due' },
    ],
    filters: [{ key: 'status', label: 'Status', type: 'select', options: [{ value: 'pending', label: 'Pending' }, { value: 'actioned', label: 'Actioned' }, { value: 'dismissed', label: 'Dismissed' }] }],
    pivotGroupBy: 'target_role',
    mailSubject: 'CEC — Role Action Queue Report',
  },
];

export default function ReportsSurface(_props: { role: string }) {
  return (
    <div className="space-y-8">
      {ADMIN_REPORTS.map((cfg) => (
        <div key={cfg.endpoint} className="space-y-2">
          <p className="text-xs font-semibold text-[#4a5568] uppercase tracking-wide">{cfg.title}</p>
          <ReportPanel config={cfg} />
        </div>
      ))}
    </div>
  );
}
