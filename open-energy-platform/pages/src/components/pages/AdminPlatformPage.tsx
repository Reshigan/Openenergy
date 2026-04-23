import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../SuitePage';

export function AdminPlatformPage() {
  const tabs: TabSpec[] = [
    {
      key: 'tenants',
      label: 'Tenants',
      endpoint: '/admin-platform/tenants',
      description: 'All tenants. Create manually, or approve provisioning requests in the next tab.',
      columns: [
        { key: 'name', label: 'Tenant' },
        { key: 'tier', label: 'Tier' },
        { key: 'country', label: 'Country' },
        { key: 'participant_count', label: 'Users', align: 'right', number: true },
        { key: 'active_plan_id', label: 'Plan' },
        { key: 'primary_contact_email', label: 'Admin email' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'created_at', label: 'Created', date: true },
      ],
      create: {
        title: 'Create tenant',
        endpoint: '/admin-platform/tenants',
        fields: [
          { name: 'id', label: 'Tenant ID (slug)', type: 'text', help: 'Leave blank to auto-generate.' },
          { name: 'name', label: 'Name', type: 'text', required: true },
          { name: 'legal_entity', label: 'Legal entity', type: 'text' },
          { name: 'registration_number', label: 'Registration #', type: 'text' },
          { name: 'vat_number', label: 'VAT #', type: 'text' },
          { name: 'primary_contact_email', label: 'Primary contact email', type: 'text' },
          { name: 'billing_email', label: 'Billing email', type: 'text' },
          { name: 'country', label: 'Country', type: 'text', default: 'ZA' },
          { name: 'tier', label: 'Tier', type: 'select', options: [
            { value: 'trial', label: 'Trial' },
            { value: 'standard', label: 'Standard' },
            { value: 'professional', label: 'Professional' },
            { value: 'enterprise', label: 'Enterprise' },
            { value: 'regulator', label: 'Regulator' },
          ], default: 'standard' },
        ],
      },
      rowActions: [
        { label: 'Suspend', tone: 'danger', endpoint: '/admin-platform/tenants/{id}/suspend',
          show: (r) => r.status === 'active', confirm: 'Suspend this tenant?' },
        { label: 'Reactivate', tone: 'primary', endpoint: '/admin-platform/tenants/{id}/reactivate',
          show: (r) => r.status === 'suspended' },
      ],
    },
    {
      key: 'provisioning',
      label: 'Provisioning requests',
      endpoint: '/admin-platform/provisioning-requests',
      params: { status: 'pending' },
      description: 'Self-serve sign-up requests awaiting admin review.',
      columns: [
        { key: 'requested_name', label: 'Tenant name' },
        { key: 'admin_email', label: 'Admin email' },
        { key: 'requested_tier', label: 'Tier' },
        { key: 'country', label: 'Country' },
        { key: 'expected_participants', label: 'Users', align: 'right', number: true },
        { key: 'primary_use_case', label: 'Use case' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'created_at', label: 'Requested', date: true },
      ],
      create: {
        title: 'Submit provisioning request',
        endpoint: '/admin-platform/provisioning-requests',
        fields: [
          { name: 'requested_name', label: 'Tenant name', type: 'text', required: true },
          { name: 'admin_email', label: 'Admin email', type: 'text', required: true },
          { name: 'admin_name', label: 'Admin name', type: 'text' },
          { name: 'requested_tier', label: 'Requested tier', type: 'select', options: [
            { value: 'trial', label: 'Trial' },
            { value: 'standard', label: 'Standard' },
            { value: 'professional', label: 'Professional' },
            { value: 'enterprise', label: 'Enterprise' },
          ], default: 'trial' },
          { name: 'legal_entity', label: 'Legal entity', type: 'text' },
          { name: 'country', label: 'Country', type: 'text', default: 'ZA' },
          { name: 'expected_participants', label: 'Expected users', type: 'number' },
          { name: 'primary_use_case', label: 'Primary use case', type: 'textarea' },
        ],
      },
      rowActions: [
        { label: 'Approve', tone: 'primary', endpoint: '/admin-platform/provisioning-requests/{id}/approve',
          confirm: 'Approve this request and provision a new tenant?' },
        { label: 'Reject', tone: 'danger', endpoint: '/admin-platform/provisioning-requests/{id}/reject',
          form: { title: 'Reject request', endpoint: '', fields: [
            { name: 'reason', label: 'Reason', type: 'textarea', required: true },
          ] },
        },
      ],
    },
    {
      key: 'plans',
      label: 'Plans',
      endpoint: '/admin-platform/plans',
      description: 'Subscription plans offered to tenants.',
      columns: [
        { key: 'plan_code', label: 'Code' },
        { key: 'plan_name', label: 'Name' },
        { key: 'tier', label: 'Tier' },
        { key: 'base_monthly_zar', label: 'Monthly ZAR', align: 'right', currency: true },
        { key: 'included_seats', label: 'Seats', align: 'right', number: true },
        { key: 'included_participants', label: 'Participants', align: 'right', number: true },
        { key: 'sla_uptime_pct', label: 'SLA %', align: 'right', number: true },
        { key: 'support_tier', label: 'Support' },
      ],
    },
    {
      key: 'invoices',
      label: 'Platform invoices',
      endpoint: '/admin-platform/invoices',
      description: 'Monthly invoices raised to tenants for platform usage.',
      columns: [
        { key: 'invoice_number', label: 'Invoice' },
        { key: 'tenant_id', label: 'Tenant' },
        { key: 'period_start', label: 'From', date: true },
        { key: 'period_end', label: 'To', date: true },
        { key: 'subtotal_zar', label: 'Subtotal', align: 'right', currency: true },
        { key: 'vat_zar', label: 'VAT', align: 'right', currency: true },
        { key: 'total_zar', label: 'Total', align: 'right', currency: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Run monthly invoice cycle',
        endpoint: '/admin-platform/invoices/run',
        submitLabel: 'Run cycle',
        fields: [
          { name: 'period_start', label: 'Period start', type: 'date', help: 'Defaults to 1st of current month.' },
          { name: 'period_end', label: 'Period end', type: 'date', help: 'Defaults to today.' },
        ],
      },
    },
    {
      key: 'subscriptions',
      label: 'Subscriptions',
      endpoint: '/admin-platform/tenants',  // use tenants list as the source
      description: 'Use New to attach a subscription to a tenant.',
      columns: [
        { key: 'name', label: 'Tenant' },
        { key: 'active_plan_id', label: 'Active plan' },
        { key: 'tier', label: 'Tier' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Attach subscription',
        endpoint: '/admin-platform/subscriptions',
        fields: [
          { name: 'tenant_id', label: 'Tenant ID', type: 'text', required: true },
          { name: 'plan_id', label: 'Plan ID', type: 'select', required: true, options: [
            { value: 'tp_trial', label: 'tp_trial (Trial)' },
            { value: 'tp_std', label: 'tp_std (Standard)' },
            { value: 'tp_pro', label: 'tp_pro (Professional)' },
            { value: 'tp_ent', label: 'tp_ent (Enterprise)' },
            { value: 'tp_reg', label: 'tp_reg (Regulator)' },
          ] },
          { name: 'period_start', label: 'Period start', type: 'date', required: true },
          { name: 'period_end', label: 'Period end', type: 'date', required: true },
          { name: 'billing_frequency', label: 'Frequency', type: 'select', required: true, options: [
            { value: 'monthly', label: 'Monthly' },
            { value: 'quarterly', label: 'Quarterly' },
            { value: 'annual', label: 'Annual' },
          ] },
          { name: 'amount_zar', label: 'Amount (ZAR)', type: 'number', required: true },
          { name: 'auto_renew', label: 'Auto-renew', type: 'checkbox', default: true },
        ],
      },
    },
    {
      key: 'flags',
      label: 'Feature flags',
      endpoint: '/admin-platform/flags',
      description:
        'Platform feature flags with rollout strategies (off / all / percentage / by_tier / by_tenant / by_role). Create per-tenant or per-participant overrides.',
      columns: [
        { key: 'flag_key', label: 'Key' },
        { key: 'description', label: 'Description' },
        { key: 'default_value', label: 'Default' },
        { key: 'rollout_strategy', label: 'Strategy' },
        { key: 'rollout_config_json', label: 'Config' },
        { key: 'enabled', label: 'Enabled?', render: (r) => <span>{r.enabled ? 'Yes' : 'No'}</span> },
      ],
      create: {
        title: 'New feature flag',
        endpoint: '/admin-platform/flags',
        fields: [
          { name: 'flag_key', label: 'Flag key', type: 'text', required: true, placeholder: 'new_matching_engine' },
          { name: 'description', label: 'Description', type: 'textarea' },
          { name: 'default_value', label: 'Default value', type: 'text', default: 'false' },
          { name: 'rollout_strategy', label: 'Strategy', type: 'select', options: [
            { value: 'off', label: 'Off' },
            { value: 'all', label: 'All' },
            { value: 'percentage', label: 'Percentage' },
            { value: 'by_tier', label: 'By tier' },
            { value: 'by_tenant', label: 'By tenant' },
            { value: 'by_role', label: 'By role' },
          ], default: 'off' },
          { name: 'rollout_config', label: 'Config (JSON)', type: 'json', help: 'e.g. {"percentage":25} or {"tiers":["pro","enterprise"]}' },
          { name: 'enabled', label: 'Enabled?', type: 'checkbox', default: true },
        ],
      },
      rowActions: [
        { label: '+ Override', endpoint: '/admin-platform/flags/{id}/overrides',
          form: { title: 'Add override', endpoint: '', fields: [
            { name: 'tenant_id', label: 'Tenant ID', type: 'text', help: 'Set tenant_id OR participant_id (or both).' },
            { name: 'participant_id', label: 'Participant ID', type: 'text' },
            { name: 'value', label: 'Value', type: 'text', required: true, placeholder: 'true / false / string' },
            { name: 'reason', label: 'Reason', type: 'textarea' },
            { name: 'expires_at', label: 'Expires at', type: 'datetime' },
          ] },
        },
        { label: 'Toggle', tone: 'primary', endpoint: '/admin-platform/flags/{id}', method: 'PUT',
          form: { title: 'Edit flag', endpoint: '', fields: [
            { name: 'default_value', label: 'Default value', type: 'text' },
            { name: 'rollout_strategy', label: 'Strategy', type: 'select', options: [
              { value: 'off', label: 'Off' }, { value: 'all', label: 'All' },
              { value: 'percentage', label: 'Percentage' }, { value: 'by_tier', label: 'By tier' },
              { value: 'by_tenant', label: 'By tenant' }, { value: 'by_role', label: 'By role' },
            ] },
            { name: 'rollout_config', label: 'Config (JSON)', type: 'json' },
            { name: 'enabled', label: 'Enabled?', type: 'checkbox' },
          ] },
        },
      ],
    },
    {
      key: 'data_tier',
      label: 'Data tier',
      endpoint: '/data-tier/snapshot',
      description:
        'D1 size + archive state. Manual triggers: daily rollup, monthly archive, audit archive.',
      columns: [
        { key: 'snapshot_at', label: 'Snapshot at' },
        { key: 'metering_rows', label: 'Metering rows', align: 'right', number: true },
        { key: 'audit_log_rows', label: 'Audit rows', align: 'right', number: true },
        { key: 'ona_forecast_rows', label: 'ONA forecasts', align: 'right', number: true },
        { key: 'archives_rows', label: 'Archives', align: 'right', number: true },
        { key: 'archives_bytes', label: 'Archive bytes', align: 'right', number: true },
      ],
      create: {
        title: 'Capture data-tier snapshot',
        endpoint: '/data-tier/snapshot',
        submitLabel: 'Capture',
        fields: [],
      },
      rowActions: [
        { label: 'Roll up today', tone: 'primary', endpoint: '/data-tier/metering/rollup-day',
          form: { title: 'Roll up metering readings', endpoint: '', fields: [
            { name: 'day', label: 'Day (YYYY-MM-DD)', type: 'date', help: 'Defaults to today.' },
          ] },
        },
        { label: 'Archive month', endpoint: '/data-tier/metering/archive-month',
          form: { title: 'Archive a month of metering', endpoint: '', fields: [
            { name: 'month', label: 'Month (YYYY-MM)', type: 'text', help: 'Defaults to current month.' },
            { name: 'connection_id', label: 'Connection ID', type: 'text', help: 'Leave blank to archive all.' },
            { name: 'dry_run', label: 'Dry run?', type: 'checkbox', default: true },
          ] },
        },
        { label: 'Archive audit day', endpoint: '/data-tier/audit/archive-day',
          form: { title: 'Archive an audit log day', endpoint: '', fields: [
            { name: 'day', label: 'Day (YYYY-MM-DD)', type: 'date', required: true },
          ] },
        },
      ],
    },
    {
      key: 'monitoring_ops',
      label: 'Ops monitoring',
      endpoint: '/admin/monitoring/cron-health',
      description:
        'National-scale cron health — each scheduled job and the timestamp of its most recent side-effect. Other ops panels live in the sibling tabs.',
      columns: [
        { key: 'cron', label: 'Cron' },
        { key: 'job', label: 'Job' },
        { key: 'last_run', label: 'Last run' },
      ],
    },
    {
      key: 'cascade_dlq',
      label: 'Cascade DLQ',
      endpoint: '/admin/monitoring/cascade-dlq',
      params: { status: 'pending' },
      description: 'Pending cascade DLQ items — retry or resolve from the Support console.',
      columns: [
        { key: 'event', label: 'Event' },
        { key: 'entity_type', label: 'Entity type' },
        { key: 'entity_id', label: 'Entity ID' },
        { key: 'stage', label: 'Stage' },
        { key: 'attempt_count', label: 'Attempts', align: 'right' as const, number: true },
        { key: 'error_message', label: 'Error' },
        { key: 'created_at', label: 'Created' },
        { key: 'last_attempt_at', label: 'Last attempt' },
      ],
    },
    {
      key: 'settlement_runs',
      label: 'Settlement runs',
      endpoint: '/admin/monitoring/settlement-runs',
      description: 'Recent settlement runs + failure rate. Retry failed runs from the Settlement workbench.',
      columns: [
        { key: 'run_type', label: 'Type' },
        { key: 'period_start', label: 'From', date: true },
        { key: 'period_end', label: 'To', date: true },
        { key: 'started_at', label: 'Started' },
        { key: 'status', label: 'Status' },
        { key: 'contracts_considered', label: 'Contracts', align: 'right' as const, number: true },
        { key: 'invoices_generated', label: 'Invoices', align: 'right' as const, number: true },
        { key: 'total_value_zar', label: 'Value', align: 'right' as const, currency: true },
        { key: 'error_message', label: 'Error' },
      ],
    },
    {
      key: 'pii_access',
      label: 'PII access log',
      endpoint: '/admin/monitoring/pii-access',
      description:
        'POPIA s.19 accountability — recent privileged reads of another participant\'s data. Self-reads are never logged.',
      columns: [
        { key: 'created_at', label: 'When' },
        { key: 'actor_email', label: 'Actor' },
        { key: 'actor_role', label: 'Actor role' },
        { key: 'subject_email', label: 'Subject' },
        { key: 'subject_role', label: 'Subject role' },
        { key: 'access_type', label: 'Type' },
        { key: 'justification', label: 'Justification' },
      ],
    },
    {
      key: 'quotas',
      label: 'Tenant quotas',
      endpoint: '/data-tier/tenant-quotas',
      description: 'Token-bucket rate limits per tenant × route prefix. Falls open when unset.',
      columns: [
        { key: 'tenant_id', label: 'Tenant' },
        { key: 'route_prefix', label: 'Route prefix' },
        { key: 'window_seconds', label: 'Window (s)', align: 'right', number: true },
        { key: 'max_requests', label: 'Max', align: 'right', number: true },
        { key: 'burst_capacity', label: 'Burst', align: 'right', number: true },
        { key: 'updated_at', label: 'Updated' },
      ],
      create: {
        title: 'Set / update tenant quota',
        endpoint: '/data-tier/tenant-quotas',
        fields: [
          { name: 'tenant_id', label: 'Tenant ID', type: 'text', required: true },
          { name: 'route_prefix', label: 'Route prefix', type: 'text', required: true, placeholder: '/api/trading or *' },
          { name: 'window_seconds', label: 'Window (seconds)', type: 'number', required: true, default: 60 },
          { name: 'max_requests', label: 'Max requests', type: 'number', required: true, default: 600 },
          { name: 'burst_capacity', label: 'Burst capacity', type: 'number', default: 100 },
        ],
      },
    },
  ];
  return (
    <SuitePage
      title="Platform administration"
      subtitle="Tenants, provisioning, subscriptions, platform invoicing, feature flags, data tier and quotas."
      tabs={tabs}
      aiBriefRole="admin"
      aiBriefAccent={{ from: '#0a6ed1', to: '#ab218e' }}
    />
  );
}
