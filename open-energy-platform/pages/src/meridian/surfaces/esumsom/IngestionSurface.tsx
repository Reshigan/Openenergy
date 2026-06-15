// pages/src/meridian/surfaces/esumsom/IngestionSurface.tsx
//
// Meridian surface — "Ingestion" (esco / esums_owner O&M role). Extracted verbatim from the
// `ingestion` tab body of the retired EsumsOmPage SuitePage husk (E2.2). Self-contained:
// it renders a single-tab SuitePage so the inline SuiteTable behaviour (columns, date
// formatting, StatusPill) is preserved identically. Registered as `esco:ingestion`
// in surfaces.tsx and reached from Atlas (⌘K) via the roleData feature key `ingestion`.
import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../../../components/SuitePage';

export default function IngestionSurface(_props: { role: string }) {
  const tabs: TabSpec[] = [
    {
      key: 'ingestion',
      label: 'Ingestion',
      endpoint: '/esums/ingestion',
      description: 'OEM connections (Huawei FusionSolar, SolarEdge, SMA, Sungrow, Modbus TCP, Eskom AMR, ...) with last-poll status.',
      columns: [
        { key: 'site_id', label: 'Site' },
        { key: 'adapter', label: 'Adapter' },
        { key: 'endpoint_url', label: 'Endpoint' },
        { key: 'polling_minutes', label: 'Poll (min)', align: 'right', number: true },
        { key: 'last_poll_at', label: 'Last poll', date: true },
        { key: 'last_status', label: 'Status', render: (r) => <StatusPill status={String(r.last_status)} /> },
      ],
    },
  ];
  return (
    <SuitePage
      eyebrow="Esums · Operations"
      title="Ingestion"
      subtitle="OEM connections with last-poll status."
      tabs={tabs}
      initialTab="ingestion"
      aiBriefAccent={{ from: '#1e3a5f', to: '#336a38' }}
    />
  );
}
