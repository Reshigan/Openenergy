// pages/src/meridian/surfaces/esumsom/MaintenanceSurface.tsx
//
// Meridian surface — "Maintenance" (esco / esums_owner O&M role). Extracted verbatim from the
// `maintenance` tab body of the retired EsumsOmPage SuitePage husk (E2.2). Self-contained:
// it renders a single-tab SuitePage so the inline SuiteTable behaviour (columns, date
// formatting, StatusPill) is preserved identically. Registered as `esco:maintenance`
// in surfaces.tsx and reached from Atlas (⌘K) via the roleData feature key `maintenance`.
import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../../../components/SuitePage';
import { maintenanceViz } from './viz';

export default function MaintenanceSurface(_props: { role: string }) {
  const tabs: TabSpec[] = [
    {
      key: 'maintenance',
      label: 'Maintenance',
      endpoint: '/esums/maintenance',
      description: 'Scheduled preventive maintenance. Auto-creates work orders 7 days before due date.',
      viz: maintenanceViz,
      columns: [
        { key: 'site_id', label: 'Site' },
        { key: 'task_type', label: 'Task' },
        { key: 'next_due_at', label: 'Next due', date: true },
        { key: 'frequency_days', label: 'Cycle (d)', align: 'right', number: true },
        { key: 'estimated_duration_minutes', label: 'Est. min', align: 'right', number: true },
        { key: 'required_skill', label: 'Skill' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
    },
  ];
  return (
    <SuitePage
      eyebrow="O&M · Operations"
      title="Maintenance"
      subtitle="Scheduled preventive maintenance with auto-generated work orders."
      tabs={tabs}
      initialTab="maintenance"
      aiBriefAccent={{ from: '#1e3a5f', to: '#336a38' }}
    />
  );
}
