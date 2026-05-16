import React from 'react';
import { WorkstationShell, ListingTable, Pill } from '../launch/WorkstationShell';

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

export function AdminWorkstationPage() {
  return (
    <WorkstationShell
      eyebrow="Admin · Workstation"
      title="Platform admin workstation"
      subtitle="Tenant lifecycle · Billing runs · Feature-flag overrides. Audit trail for every platform-level change."
      backHref="/admin-platform"
      backLabel="Admin platform"
      tabs={[
        {
          key: 'tenant_events',
          label: 'Tenant lifecycle',
          body: () => (
            <ListingTable
              endpoint="/admin-platform/tenant-events"
              rowKey={(r) => r.id}
              empty={{ title: 'No tenant events yet', description: 'Provisioned / activated / KYC / suspended / offboarded / data-erased events for every tenant will appear here.' }}
              columns={[
                { key: 'tenant_id', label: 'Tenant', render: (r) => <span className="font-mono text-[11px]">{(r.tenant_id || '').slice(0, 12)}…</span> },
                { key: 'event_type', label: 'Event', render: (r) => <Pill tone={r.event_type === 'activated' || r.event_type === 'reactivated' || r.event_type === 'kyc_approved' ? 'good' : r.event_type === 'suspended' || r.event_type === 'offboarded' || r.event_type === 'kyc_rejected' || r.event_type === 'data_erased' ? 'bad' : 'info'}>{r.event_type.replace(/_/g, ' ')}</Pill> },
                { key: 'actor_id', label: 'Actor', render: (r) => <span className="font-mono text-[11px]">{(r.actor_id || '').slice(0, 12)}…</span> },
                { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
                { key: 'reason', label: 'Reason', render: (r) => <span className="block truncate max-w-md" title={r.reason || ''}>{r.reason || '—'}</span> },
              ]}
            />
          ),
        },
        {
          key: 'billing',
          label: 'Billing runs',
          body: () => (
            <ListingTable
              endpoint="/admin-platform/billing-runs"
              rowKey={(r) => r.id}
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
          ),
        },
        {
          key: 'flags',
          label: 'Flag overrides',
          body: () => (
            <ListingTable
              endpoint="/admin-platform/flag-overrides"
              rowKey={(r) => r.id}
              empty={{ title: 'No flag overrides', description: 'Every feature-flag override (global / tenant / user) is audit-logged here.' }}
              columns={[
                { key: 'flag_key', label: 'Flag', render: (r) => <span className="font-mono text-[11px]">{r.flag_key}</span> },
                { key: 'scope_type', label: 'Scope', render: (r) => <Pill tone="info">{r.scope_type}</Pill> },
                { key: 'previous_value', label: 'Was', render: (r) => r.previous_value || '—' },
                { key: 'new_value', label: 'Now' },
                { key: 'reason', label: 'Reason', render: (r) => <span className="block truncate max-w-md" title={r.reason || ''}>{r.reason || '—'}</span> },
                { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
              ]}
            />
          ),
        },
      ]}
    />
  );
}
