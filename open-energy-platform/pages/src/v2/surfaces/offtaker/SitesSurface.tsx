// pages/src/meridian/surfaces/offtaker/SitesSurface.tsx
//
// Meridian surface — "Sites & groups" (offtaker role). Extracted verbatim from the inline
// `SitesTab` body of the OfftakerWorkstationPage husk (E2.6). Self-contained: lists delivery
// points + site groups via the shared ListingTable, and creates a site group via ActionModal.
// Registered as `offtaker:sites` in surfaces.tsx, reached from Atlas (⌘K) via the roleData
// feature key `sites` (added in E2.6). Non-chain master-data surface (Bucket B).
import React, { useState } from 'react';
import { ListingTable, Pill, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

export default function SitesSurface(_props: { role: string }) {
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => setCreating(true)} className="btn pri">
          + New site group
        </button>
      </div>
      <div>
        <h3 className="text-[13px] font-semibold text-[var(--ink2)] mb-2">Delivery points</h3>
        <ListingTable
          key={`dp-${refreshKey}`}
          endpoint="/offtaker/delivery-points"
          rowKey={(r) => r.id}
          empty={{ title: 'No delivery points', description: 'Register your supply points to start tracking consumption and tariffs.' }}
          columns={[
            { key: 'site_name', label: 'Site', render: (r) => r.site_name || r.name },
            { key: 'meter_id', label: 'Meter', render: (r) => <span className="font-mono text-[11px]">{r.meter_id || '—'}</span> },
            { key: 'utility', label: 'Utility' },
            { key: 'tariff_code', label: 'Tariff', render: (r) => r.tariff_code || '—' },
            { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'active' ? 'good' : 'neutral'}>{r.status || 'active'}</Pill> },
          ]}
        />
      </div>
      <div>
        <h3 className="text-[13px] font-semibold text-[var(--ink2)] mb-2">Site groups</h3>
        <ListingTable
          key={`sg-${refreshKey}`}
          endpoint="/offtaker-suite/groups"
          rowKey={(r) => r.id}
          empty={{ title: 'No site groups', description: 'Group sites for consolidated invoicing, cost-centre rollups, and budget allocation.' }}
          columns={[
            { key: 'group_name', label: 'Group' },
            { key: 'group_type', label: 'Type' },
            { key: 'billing_entity', label: 'Billing entity' },
            { key: 'member_count', label: 'Members', align: 'right' },
            { key: 'consolidated_invoice', label: 'Consolidated', render: (r) => <Pill tone={r.consolidated_invoice ? 'good' : 'neutral'}>{r.consolidated_invoice ? 'yes' : 'no'}</Pill> },
          ]}
        />
      </div>
      {creating && (
        <ActionModal
          title="Create site group"
          submitLabel="Create"
          fields={[
            { key: 'group_name', label: 'Group name', required: true },
            { key: 'group_type', label: 'Type', type: 'select', options: [
              { value: 'corporate', label: 'Corporate' },
              { value: 'campus', label: 'Campus' },
              { value: 'portfolio', label: 'Portfolio' },
            ] },
            { key: 'billing_entity', label: 'Billing entity (legal name)' },
            { key: 'vat_number', label: 'VAT number' },
            { key: 'cost_centre', label: 'Cost centre' },
          ] as FieldSpec[]}
          onClose={() => setCreating(false)}
          onSubmit={async (v) => {
            await api.post('/offtaker-suite/groups', v);
            setCreating(false); refresh();
          }}
        />
      )}
    </div>
  );
}
