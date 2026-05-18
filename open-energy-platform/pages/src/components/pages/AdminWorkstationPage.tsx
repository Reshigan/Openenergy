import React, { useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { api } from '../../lib/api';

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

function Header({ onCreate, label }: { onCreate: () => void; label: string }) {
  return (
    <div className="flex justify-end mb-3">
      <button onClick={onCreate} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
        + {label}
      </button>
    </div>
  );
}

export function AdminWorkstationPage() {
  return (
    <WorkstationShell
      eyebrow="Admin · Workstation"
      title="Platform admin workstation"
      subtitle="Tenant lifecycle · Billing runs · Feature-flag overrides. Audit trail for every platform-level change."
      backHref="/admin-platform"
      backLabel="Admin platform"
      tabs={[
        { key: 'tenant_events', label: 'Tenant lifecycle', body: ({ onRefresh }) => <TenantTab onRefresh={onRefresh} /> },
        { key: 'billing', label: 'Billing runs', body: ({ onRefresh }) => <BillingTab onRefresh={onRefresh} /> },
        { key: 'flags', label: 'Flag overrides', body: ({ onRefresh }) => <FlagsTab onRefresh={onRefresh} /> },
        { key: 'settlement_audit', label: 'Settlement audit',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/settlement"
              reconHint="bank_ref,value_date,amount_zar,narrative"
              reconSourceOptions={['bank', 'absa', 'standard_bank', 'fnb', 'nedbank']}
              onChange={onRefresh}
            />
          ),
        },
        { key: 'platform_audit', label: 'Platform audit',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/admin-platform"
              reconHint="billing_run_id,tenant_id,amount_zar,period_end"
              reconSourceOptions={['billing_processor', 'stripe', 'paystack', 'manual']}
              onChange={onRefresh}
            />
          ),
        },
        { key: 'pii_access', label: 'PII access log',
          body: () => <PiiAccessTab />,
        },
      ]}
    />
  );
}

function TenantTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Log tenant event" />
      <ListingTable
        endpoint="/admin-platform/tenant-events"
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin-platform/tenants/${r.tenant_id}`}
        empty={{ title: 'No tenant events yet', description: 'Provisioned / activated / KYC / suspended / offboarded / data-erased events for every tenant will appear here.' }}
        columns={[
          { key: 'tenant_id', label: 'Tenant', render: (r) => <span className="font-mono text-[11px]">{(r.tenant_id || '').slice(0, 12)}…</span> },
          { key: 'event_type', label: 'Event', render: (r) => <Pill tone={r.event_type === 'activated' || r.event_type === 'reactivated' || r.event_type === 'kyc_approved' ? 'good' : r.event_type === 'suspended' || r.event_type === 'offboarded' || r.event_type === 'kyc_rejected' || r.event_type === 'data_erased' ? 'bad' : 'info'}>{r.event_type.replace(/_/g, ' ')}</Pill> },
          { key: 'actor_id', label: 'Actor', render: (r) => <span className="font-mono text-[11px]">{(r.actor_id || '').slice(0, 12)}…</span> },
          { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
          { key: 'reason', label: 'Reason', render: (r) => <span className="block truncate max-w-md" title={r.reason || ''}>{r.reason || '—'}</span> },
        ]}
      />
      {filing && (
        <ActionModal
          title="Log tenant lifecycle event"
          submitLabel="Log"
          fields={[
            { key: 'tenant_id', label: 'Tenant ID', required: true },
            { key: 'event_type', label: 'Event', type: 'select', required: true, options: [
              { value: 'provisioned', label: 'Provisioned' },
              { value: 'activated', label: 'Activated' },
              { value: 'plan_changed', label: 'Plan changed' },
              { value: 'kyc_approved', label: 'KYC approved' },
              { value: 'kyc_rejected', label: 'KYC rejected' },
              { value: 'suspended', label: 'Suspended' },
              { value: 'reactivated', label: 'Reactivated' },
              { value: 'offboarded', label: 'Offboarded' },
              { value: 'data_exported', label: 'Data exported' },
              { value: 'data_erased', label: 'Data erased' },
            ] },
            { key: 'reason', label: 'Reason', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/admin-platform/tenant-events', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function BillingTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Run billing" />
      <ListingTable
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
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function FlagsTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Override flag" />
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
      {filing && (
        <ActionModal
          title="Override feature flag"
          submitLabel="Override"
          fields={[
            { key: 'flag_key', label: 'Flag key', required: true, placeholder: 'e.g. trade.allow_advanced_modifiers' },
            { key: 'scope_type', label: 'Scope', type: 'select', required: true, options: [
              { value: 'global', label: 'Global' },
              { value: 'tenant', label: 'Tenant' },
              { value: 'user', label: 'User' },
            ] },
            { key: 'scope_id', label: 'Scope ID (if tenant/user)' },
            { key: 'previous_value', label: 'Previous value' },
            { key: 'new_value', label: 'New value', required: true },
            { key: 'reason', label: 'Reason', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/admin-platform/flag-overrides', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function PiiAccessTab() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[#dde4ec] bg-white p-4 text-[12px] text-[#3d4756]">
        Every cross-tenant read of personal information is logged here under
        POPIA s.18 (accountability) + s.19 (security safeguards). Each entry
        is also chained on the <span className="font-mono">admin</span> audit
        chain via the cascade hook, so this view is tamper-evident — a
        regulator can verify any row against the chain head.
      </div>
      <ListingTable
        endpoint="/popia/pii-access"
        rowKey={(r) => r.id}
        empty={{ title: 'No PII access logged', description: 'Cross-tenant data access by admins / support / regulators will appear here as it happens.' }}
        columns={[
          { key: 'created_at', label: 'When', render: (r) => new Date(r.created_at).toLocaleString() },
          { key: 'actor_id', label: 'Actor', render: (r) => <span className="font-mono text-[11px]">{(r.actor_id || '').slice(0, 16)}…</span> },
          { key: 'access_type', label: 'Type', render: (r) => <Pill tone={r.access_type === 'impersonation' ? 'bad' : 'info'}>{(r.access_type || '').replace(/_/g, ' ')}</Pill> },
          { key: 'subject_id', label: 'Subject', render: (r) => <span className="font-mono text-[11px]">{(r.subject_id || '').slice(0, 16)}…</span> },
          { key: 'justification', label: 'Justification', render: (r) => <span className="block truncate max-w-md" title={r.justification || ''}>{r.justification || '—'}</span> },
        ]}
      />
    </div>
  );
}
