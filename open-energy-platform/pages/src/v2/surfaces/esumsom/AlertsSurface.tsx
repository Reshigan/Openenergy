// pages/src/meridian/surfaces/esumsom/AlertsSurface.tsx
//
// Meridian surface — "Alerts" (esco / esums_owner O&M role). Extracted verbatim from the
// `alerts` tab body of the retired EsumsOmPage SuitePage husk (E2.2). Self-contained:
// it renders a single-tab SuitePage so the inline SuiteTable behaviour (columns, date
// formatting, StatusPill) is preserved identically. Registered as `esco:alerts`
// in surfaces.tsx and reached from Atlas (⌘K) via the roleData feature key `alerts`.
import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../../../components/SuitePage';
import { alertsViz } from './viz';

export default function AlertsSurface(_props: { role: string }) {
  const tabs: TabSpec[] = [
    {
      key: 'alerts',
      label: 'Alerts',
      endpoint: '/esums/alerts',
      description: 'All alerts fired across the fleet in the last 7 days.',
      viz: alertsViz,
      columns: [
        { key: 'severity', label: 'Severity', render: (r) => <StatusPill status={String(r.severity)} /> },
        { key: 'category', label: 'Category' },
        { key: 'title', label: 'Title' },
        { key: 'site_id', label: 'Site' },
        { key: 'created_at', label: 'When', date: true },
        { key: 'acknowledged_at', label: 'Ack', date: true },
      ],
    },
  ];
  return (
    <SuitePage
      eyebrow="O&M · Operations"
      title="Alerts"
      subtitle="All alerts fired across the fleet in the last 7 days."
      tabs={tabs}
      initialTab="alerts"
      aiBriefAccent={{ from: '#1e3a5f', to: '#336a38' }}
    />
  );
}
