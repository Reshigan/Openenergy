// pages/src/meridian/surfaces/esco/SitesPortfolioSurface.tsx
//
// Meridian surface — "Sites under management" (esco role). Extracted verbatim from the
// `sites-portfolio` tab body of the retired EscoWorkstationPage husk (E2.8a). Self-contained:
// it fetches its own data via the shared ListingTable against /esums/commissioning. No
// dependency on workstation-page-local state. Registered as `esco:sites-portfolio` in
// surfaces.tsx and reached from Atlas (⌘K) via the roleData feature key `sites-portfolio`.
import React from 'react';
import { ListingTable } from '../../../components/launch/WorkstationShell';
import { StatusPill } from '../../../meridian/components';

export default function SitesPortfolioSurface(_props: { role: string }) {
  return (
    <ListingTable
      endpoint="/esums/commissioning"
      rowKey={(r) => r.id}
      empty={{ title: 'No sites', description: 'Commissioned sites under O&M management will appear here.' }}
      columns={[
        { key: 'site_name', label: 'Site', render: (r) => <span className="font-medium">{r.site_name}</span> },
        { key: 'installed_capacity_kw', label: 'Capacity', render: (r) => r.installed_capacity_kw != null ? `${(r.installed_capacity_kw / 1000).toFixed(1)} MW` : '—' },
        { key: 'chain_status', label: 'Status', render: (r) => <StatusPill status={r.chain_status} tone={r.chain_status === 'in_om' ? 'good' : r.chain_status === 'failed' ? 'bad' : 'warn'} /> },
        { key: 'client_name', label: 'Client' },
        { key: 'created_at', label: 'Commissioned', render: (r) => new Date(r.created_at).toLocaleDateString() },
      ]}
    />
  );
}
