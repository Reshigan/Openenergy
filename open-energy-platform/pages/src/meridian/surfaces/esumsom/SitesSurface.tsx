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
      description: 'Generation sites with live KPIs. Click into a site for the asset-level dashboard.',
      viz: sitesViz,
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
