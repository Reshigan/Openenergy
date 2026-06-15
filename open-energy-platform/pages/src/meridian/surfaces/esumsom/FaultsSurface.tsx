// pages/src/meridian/surfaces/esumsom/FaultsSurface.tsx
//
// Meridian surface — "Faults" (esco / esums_owner O&M role). Extracted verbatim from the
// `faults` tab body of the retired EsumsOmPage SuitePage husk (E2.2). Self-contained:
// it renders a single-tab SuitePage so the inline SuiteTable behaviour (columns, currency/date
// formatting, StatusPill, rowActions) is preserved identically. Registered as `esco:faults`
// in surfaces.tsx and reached from Atlas (⌘K) via the roleData feature key `faults`.
import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../../../components/SuitePage';

export default function FaultsSurface(_props: { role: string }) {
  const tabs: TabSpec[] = [
    {
      key: 'faults',
      label: 'Faults',
      endpoint: '/esums/faults',
      description: 'Live fault register with Revenue Impact Engine. Hourly bleed + total loss accumulate in real time.',
      columns: [
        { key: 'site_id',     label: 'Site' },
        { key: 'category',    label: 'Category' },
        { key: 'severity',    label: 'Severity', render: (r) => <StatusPill status={String(r.severity)} /> },
        { key: 'description', label: 'Description' },
        { key: 'detected_at', label: 'Detected', date: true },
        { key: 'hourly_loss_zar', label: 'R/h',  align: 'right', currency: true },
        { key: 'total_loss_zar',  label: 'Lost', align: 'right', currency: true },
        { key: 'status',      label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      rowActions: [
        { label: 'Acknowledge', tone: 'primary', endpoint: '/esums/faults/{id}/acknowledge', confirm: 'Acknowledge this fault?' },
        { label: 'Resolve',     tone: 'default', endpoint: '/esums/faults/{id}/resolve',
          form: { title: 'Resolve fault', endpoint: '', fields: [
            { name: 'root_cause', label: 'Root cause', type: 'textarea', required: true },
          ]}},
      ],
    },
  ];
  return (
    <SuitePage
      eyebrow="Esums · Operations"
      title="Faults"
      subtitle="Live fault register with Revenue Impact Engine."
      tabs={tabs}
      initialTab="faults"
      aiBriefAccent={{ from: '#1e3a5f', to: '#336a38' }}
    />
  );
}
