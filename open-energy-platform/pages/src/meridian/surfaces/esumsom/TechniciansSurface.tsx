// pages/src/meridian/surfaces/esumsom/TechniciansSurface.tsx
//
// Meridian surface — "Team" (esco / esums_owner O&M role). Extracted verbatim from the
// `technicians` tab body of the retired EsumsOmPage SuitePage husk (E2.2). Self-contained:
// it renders a single-tab SuitePage so the inline SuiteTable behaviour (columns, StatusPill)
// is preserved identically. Registered as `esco:technicians`
// in surfaces.tsx and reached from Atlas (⌘K) via the roleData feature key `technicians`.
import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../../../components/SuitePage';

export default function TechniciansSurface(_props: { role: string }) {
  const tabs: TabSpec[] = [
    {
      key: 'technicians',
      label: 'Team',
      endpoint: '/esums/technicians',
      description: 'Field technicians: skills, certifications, current location, availability.',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        { key: 'skills', label: 'Skills' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
    },
  ];
  return (
    <SuitePage
      eyebrow="Esums · Operations"
      title="Team"
      subtitle="Field technicians: skills, certifications, availability."
      tabs={tabs}
      initialTab="technicians"
      aiBriefAccent={{ from: '#1e3a5f', to: '#336a38' }}
    />
  );
}
