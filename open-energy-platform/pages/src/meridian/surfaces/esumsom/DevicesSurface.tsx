// pages/src/meridian/surfaces/esumsom/DevicesSurface.tsx
//
// Meridian surface — "Devices" (esco / esums_owner O&M role). Extracted verbatim from the
// `devices` tab body of the retired EsumsOmPage SuitePage husk (E2.2). Self-contained:
// it renders a single-tab SuitePage so the inline SuiteTable behaviour (columns, date
// formatting, StatusPill) is preserved identically. Registered as `esco:devices`
// in surfaces.tsx and reached from Atlas (⌘K) via the roleData feature key `devices`.
import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../../../components/SuitePage';

export default function DevicesSurface(_props: { role: string }) {
  const tabs: TabSpec[] = [
    {
      key: 'devices',
      label: 'Devices',
      endpoint: '/esums/devices',
      description: 'Inverters, meters, batteries and sensors across all sites. Filter by site_id.',
      columns: [
        { key: 'site_id', label: 'Site' },
        { key: 'device_type', label: 'Type' },
        { key: 'manufacturer', label: 'OEM' },
        { key: 'model', label: 'Model' },
        { key: 'rated_kw', label: 'Rated kW', align: 'right', number: true },
        { key: 'firmware_version', label: 'FW' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'last_seen_at', label: 'Last seen', date: true },
      ],
    },
  ];
  return (
    <SuitePage
      eyebrow="Esums · Operations"
      title="Devices"
      subtitle="Inverters, meters, batteries and sensors across all sites."
      tabs={tabs}
      initialTab="devices"
      aiBriefAccent={{ from: '#1e3a5f', to: '#336a38' }}
    />
  );
}
