// pages/src/meridian/surfaces/esumsom/SitesSurface.tsx
//
// Meridian surface — "Sites" (esco / esums_owner O&M role). Extracted verbatim from the
// `sites` tab body of the retired EsumsOmPage SuitePage husk (E2.2). Self-contained:
// it renders a single-tab SuitePage so the inline SuiteTable behaviour (columns, currency/date
// formatting, StatusPill) is preserved identically. Registered as `esco:sites`
// in surfaces.tsx and reached from Atlas (⌘K) via the roleData feature key `sites`.
import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../../../components/SuitePage';
import { sitesViz } from './viz';

export default function SitesSurface(_props: { role: string }) {
  const tabs: TabSpec[] = [
    {
      key: 'sites',
      label: 'Sites',
      endpoint: '/esums/sites',
      description: 'Generation sites with live KPIs. Click a site for the full asset record — capacity, commissioning lifecycle, live faults and revenue impact.',
      viz: sitesViz,
      detail: {
        summaryFields: [
          'name', 'technology', 'capacity_mw', 'capacity_kwp', 'province', 'status', 'commissioning_status',
          'device_count', 'open_faults', 'open_wos', 'revenue_lost_mtd_zar',
          'ppa_tariff_zar_mwh', 'water_tariff_zar_kl', 'latitude', 'longitude',
          'commissioning_date', 'commissioning_due_at', 'commissioning_started_at', 'devices_registered_at',
          'ingestion_wired_at', 'first_telemetry_at', 'energised_at', 'in_om_at', 'commissioning_failure_reason',
        ],
      },
      columns: [
        { key: 'name', label: 'Site' },
        { key: 'technology', label: 'Tech' },
        { key: 'capacity_mw', label: 'MW',  align: 'right', number: true },
        { key: 'province', label: 'Province' },
        { key: 'device_count', label: 'Devices', align: 'right', number: true },
        { key: 'open_faults', label: 'Open faults', align: 'right', number: true },
        { key: 'revenue_lost_mtd_zar', label: 'Lost MTD', align: 'right', currency: true },
        { key: 'open_wos', label: 'Open WOs', align: 'right', number: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
    },
  ];
  return (
    <SuitePage
      eyebrow="O&M · Operations"
      title="Sites"
      subtitle="Generation sites with live KPIs."
      tabs={tabs}
      initialTab="sites"
      aiBriefAccent={{ from: '#1e3a5f', to: '#336a38' }}
    />
  );
}
