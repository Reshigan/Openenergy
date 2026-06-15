// pages/src/meridian/surfaces/admin/BillingSurface.tsx
//
// Meridian surface — "Billing runs" (admin role). Extracted verbatim from the inline
// `BillingTab` body of the AdminWorkstationPage husk (E2.1). Self-contained: lists platform
// billing runs via the shared ListingTable against /admin-platform/billing-runs and schedules a
// run via POST /admin-platform/billing-runs. The husk's `onRefresh` is replaced by a local
// `bump` key that remounts the ListingTable after a successful schedule. Registered as
// `admin:billing` in surfaces.tsx, reached from Atlas (⌘K) via the roleData feature key
// `billing`. Non-chain CRUD surface (Bucket B).
import React, { useState } from 'react';
import { ListingTable, Pill, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

function Header({ onCreate, label }: { onCreate: () => void; label: string }) {
  return (
    <div className="flex justify-end mb-3">
      <button type="button" onClick={onCreate} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold">
        + {label}
      </button>
    </div>
  );
}

export default function BillingSurface(_props: { role: string }) {
  const [filing, setFiling] = useState(false);
  const [bump, setBump] = useState(0);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Run billing" />
      <ListingTable
        key={`billing-runs-${bump}`}
        endpoint="/admin-platform/billing-runs"
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin-platform/billing-runs/${r.id}`}
        empty={{ title: 'No billing runs', description: 'Monthly / adhoc / correction billing runs will appear here with outcome and total invoiced.' }}
        columns={[
          { key: 'run_type', label: 'Type', render: (r) => <Pill tone="info">{r.run_type}</Pill> },
          { key: 'period_start', label: 'Period', render: (r) => `${r.period_start} → ${r.period_end}` },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'completed' ? 'good' : r.status === 'failed' ? 'bad' : 'warn'}>{r.status.replace(/_/g, ' ')}</Pill> },
          { key: 'tenants_billed', label: 'Tenants', align: 'right' },
          { key: 'total_zar', label: 'Total', align: 'right', render: (r) => formatZAR(r.total_zar) },
          { key: 'completed_at', label: 'Completed', render: (r) => r.completed_at ? new Date(r.completed_at).toLocaleString() : '—' },
        ]}
      />
      {filing && (
        <ActionModal
          title="Schedule billing run"
          submitLabel="Schedule"
          fields={[
            { key: 'run_type', label: 'Run type', type: 'select', required: true, options: [
              { value: 'monthly', label: 'Monthly' },
              { value: 'adhoc', label: 'Ad hoc' },
              { value: 'correction', label: 'Correction' },
            ] },
            { key: 'period_start', label: 'Period start', type: 'date', required: true },
            { key: 'period_end', label: 'Period end', type: 'date', required: true },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/admin-platform/billing-runs', v);
            setFiling(false); setBump((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
