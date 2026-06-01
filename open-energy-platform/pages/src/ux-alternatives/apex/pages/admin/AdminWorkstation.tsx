/**
 * Admin Workstation — platform operator command centre
 *
 * Screens:
 *   dashboard  Platform health + KPIs + action queue
 *   users      User management (create / edit / reset / delete)
 *   tenants    Tenant management (provision / suspend / reactivate)
 *   kyc        KYC approval queue
 *   modules    Feature module toggles
 *   flags      Feature flag management
 *   billing    Billing runs + invoice ledger
 *   audit      Cross-platform immutable audit chain
 */

import React, { useState } from 'react';
import { AppShell, NavConfig } from '../../components/shell/AppShell';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StatusPill, stateVariant } from '../../components/display/StatusPill';
import { AIInsightCard } from '../../components/display/AIInsightCard';
import { Timeline, TimelineEvent } from '../../components/display/Timeline';
import { OeIcon } from '../../components/icons/Icons';
import { DetailDrawer, DrawerField, DrawerAction } from '../../components/display/DetailDrawer';
import {
  useAdminStats, useAdminUsers, useAdminTenants, useAdminKyc,
  useAdminModules, useAdminAuditLogs, useAdminFlags,
  useAdminBillingRuns, useAdminInvoices,
} from '../../lib/hooks';
import {
  apexClient,
  AdminUser, AdminTenant, AdminKyc, AdminModule,
  AdminAuditLog, AdminFeatureFlag, AdminBillingRun, AdminInvoice,
} from '../../lib/client';

// ─── Nav config ─────────────────────────────────────────────────────────────

const ADMIN_NAV: NavConfig = {
  activeId: 'admin-dashboard',
  sections: [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { id: 'admin-dashboard', label: 'Dashboard',    href: '#dashboard', icon: 'home' },
        { id: 'admin-audit',     label: 'Audit Chain',  href: '#audit',     icon: 'shield' },
      ],
    },
    {
      id: 'participants',
      label: 'Participants',
      items: [
        { id: 'admin-users',   label: 'Users',    href: '#users',   icon: 'person', badge: 0, badgeVariant: 'amber' },
        { id: 'admin-tenants', label: 'Tenants',  href: '#tenants', icon: 'building' },
        { id: 'admin-kyc',     label: 'KYC Queue', href: '#kyc',    icon: 'certificate', badge: 0, badgeVariant: 'rose' },
      ],
    },
    {
      id: 'platform',
      label: 'Platform Config',
      items: [
        { id: 'admin-modules', label: 'Modules',  href: '#modules', icon: 'gear' },
        { id: 'admin-flags',   label: 'Flags',    href: '#flags',   icon: 'flag' },
      ],
    },
    {
      id: 'finance',
      label: 'Billing',
      items: [
        { id: 'admin-billing',  label: 'Billing Runs', href: '#billing',  icon: 'dollar' },
        { id: 'admin-invoices', label: 'Invoices',     href: '#invoices', icon: 'report' },
      ],
    },
  ],
};

// ─── Column definitions ──────────────────────────────────────────────────────

const USER_COLS: Column<AdminUser>[] = [
  { key: 'email',        header: 'Email',      width: '220px', mono: true },
  { key: 'name',         header: 'Name',       width: '160px', render: row => <span>{row.name ?? '—'}</span> },
  { key: 'role',         header: 'Role',       width: '120px', render: row => <StatusPill label={row.role} variant="default" size="sm" /> },
  { key: 'company_name', header: 'Company',    width: '160px', render: row => <span>{row.company_name ?? '—'}</span> },
  { key: 'kyc_status',   header: 'KYC',        width: '110px', render: row => <StatusPill label={row.kyc_status ?? 'unknown'} variant={stateVariant(row.kyc_status ?? '')} size="sm" /> },
  { key: 'is_active',    header: 'Active',     width: '80px',  render: row => <StatusPill label={row.is_active ? 'active' : 'inactive'} variant={row.is_active ? 'green' : 'default'} size="sm" /> },
  { key: 'created_at',   header: 'Joined',     width: '130px', mono: true },
];

const TENANT_COLS: Column<AdminTenant>[] = [
  { key: 'name',              header: 'Tenant',     width: '200px' },
  { key: 'slug',              header: 'Slug',       width: '140px', mono: true },
  { key: 'plan_id',           header: 'Plan',       width: '100px', render: row => <span>{row.plan_id ?? '—'}</span> },
  { key: 'participant_count', header: 'Users',      width: '80px',  align: 'right', mono: true, render: row => <span>{row.participant_count ?? 0}</span> },
  { key: 'status',            header: 'Status',     width: '110px', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
  { key: 'created_at',        header: 'Created',    width: '130px', mono: true },
];

const KYC_COLS: Column<AdminKyc>[] = [
  { key: 'id',           header: 'Ref',        width: '90px',  mono: true, render: row => <span>{row.id.slice(-8)}</span> },
  { key: 'user_email',   header: 'Email',      width: '200px', mono: true, render: row => <span>{row.user_email ?? row.user_id}</span> },
  { key: 'user_name',    header: 'Name',       width: '150px', render: row => <span>{row.user_name ?? '—'}</span> },
  { key: 'status',       header: 'Status',     width: '110px', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
  { key: 'submitted_at', header: 'Submitted',  width: '140px', mono: true },
  { key: 'notes',        header: 'Notes',      render: row => <span style={{ color: 'var(--oe-text-3)', fontSize: '12px' }}>{row.notes ?? '—'}</span> },
];

const MODULE_COLS: Column<AdminModule>[] = [
  { key: 'key',         header: 'Key',         width: '180px', mono: true },
  { key: 'name',        header: 'Module',      width: '200px' },
  { key: 'description', header: 'Description', render: row => <span style={{ color: 'var(--oe-text-3)', fontSize: '12px' }}>{row.description ?? '—'}</span> },
  { key: 'enabled',     header: 'Enabled',     width: '90px',  render: row => <StatusPill label={row.enabled ? 'on' : 'off'} variant={row.enabled ? 'green' : 'default'} /> },
  { key: 'updated_at',  header: 'Updated',     width: '140px', mono: true, render: row => <span>{row.updated_at ?? '—'}</span> },
];

const FLAG_COLS: Column<AdminFeatureFlag>[] = [
  { key: 'flag_key',            header: 'Flag Key',   width: '200px', mono: true },
  { key: 'name',                header: 'Name',       width: '180px', render: row => <span>{row.name ?? '—'}</span> },
  { key: 'enabled',             header: 'Enabled',    width: '90px',  render: row => <StatusPill label={row.enabled ? 'on' : 'off'} variant={row.enabled ? 'green' : 'default'} /> },
  { key: 'rollout_percentage',  header: 'Rollout %',  width: '100px', align: 'right', mono: true, render: row => <span>{row.rollout_percentage != null ? `${row.rollout_percentage}%` : '—'}</span> },
  { key: 'updated_at',          header: 'Updated',    width: '140px', mono: true, render: row => <span>{row.updated_at ?? '—'}</span> },
];

const BILLING_COLS: Column<AdminBillingRun>[] = [
  { key: 'id',            header: 'Run ID',       width: '130px', mono: true, render: row => <span>{row.id.slice(-10)}</span> },
  { key: 'run_date',      header: 'Run Date',     width: '140px', mono: true },
  { key: 'invoice_count', header: 'Invoices',     width: '90px',  align: 'right', mono: true, render: row => <span>{row.invoice_count ?? 0}</span> },
  { key: 'total_amount',  header: 'Total (ZAR)',  width: '130px', align: 'right', mono: true, render: row => <span>{row.total_amount != null ? 'R' + (row.total_amount / 1e6).toFixed(2) + 'M' : '—'}</span> },
  { key: 'status',        header: 'Status',       width: '110px', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
];

const INVOICE_COLS: Column<AdminInvoice>[] = [
  { key: 'invoice_number', header: 'Invoice #',    width: '160px', mono: true },
  { key: 'tenant_name',    header: 'Tenant',       width: '180px', render: row => <span>{row.tenant_name ?? row.tenant_id ?? '—'}</span> },
  { key: 'amount',         header: 'Amount (ZAR)', width: '130px', align: 'right', mono: true, render: row => <span>{'R' + (row.amount / 1000).toFixed(0) + 'k'}</span> },
  { key: 'status',         header: 'Status',       width: '110px', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
  { key: 'due_date',       header: 'Due',          width: '120px', mono: true, render: row => <span>{row.due_date ?? '—'}</span> },
  { key: 'created_at',     header: 'Created',      width: '130px', mono: true },
];

const AUDIT_COLS: Column<AdminAuditLog>[] = [
  { key: 'id',          header: 'Ref',         width: '90px',  mono: true, render: row => <span>{row.id.slice(-8)}</span> },
  { key: 'action',      header: 'Action',      width: '220px' },
  { key: 'user_email',  header: 'Actor',       width: '190px', mono: true, render: row => <span>{row.user_email ?? row.user_id ?? 'system'}</span> },
  { key: 'entity_type', header: 'Entity',      width: '130px', render: row => <span>{row.entity_type ?? '—'}</span> },
  { key: 'ip_address',  header: 'IP',          width: '130px', mono: true, render: row => <span>{row.ip_address ?? '—'}</span> },
  { key: 'created_at',  header: 'Timestamp',   mono: true },
];

// ─── Screen type ─────────────────────────────────────────────────────────────

type Screen = 'dashboard' | 'users' | 'tenants' | 'kyc' | 'modules' | 'flags' | 'billing' | 'invoices' | 'audit';

// ─── Main component ──────────────────────────────────────────────────────────

export function AdminWorkstation() {
  const [activeScreen, setActiveScreen] = useState<Screen>('dashboard');

  const SCREEN_LABELS: Record<Screen, string> = {
    dashboard: 'Platform Dashboard',
    users:     'User Management',
    tenants:   'Tenants',
    kyc:       'KYC Queue',
    modules:   'Feature Modules',
    flags:     'Feature Flags',
    billing:   'Billing Runs',
    invoices:  'Invoices',
    audit:     'Audit Chain',
  };

  const NAV_CLICK_MAP: Record<string, () => void> = {
    'admin-dashboard': () => setActiveScreen('dashboard'),
    'admin-users':     () => setActiveScreen('users'),
    'admin-tenants':   () => setActiveScreen('tenants'),
    'admin-kyc':       () => setActiveScreen('kyc'),
    'admin-modules':   () => setActiveScreen('modules'),
    'admin-flags':     () => setActiveScreen('flags'),
    'admin-billing':   () => setActiveScreen('billing'),
    'admin-invoices':  () => setActiveScreen('invoices'),
    'admin-audit':     () => setActiveScreen('audit'),
  };

  const navConfig = {
    ...ADMIN_NAV,
    activeId: `admin-${activeScreen}`,
    sections: ADMIN_NAV.sections.map(section => ({
      ...section,
      items: section.items.map(item => ({
        ...item,
        onClick: NAV_CLICK_MAP[item.id],
      })),
    })),
  };

  return (
    <AppShell
      role="admin"
      userName="Platform Admin"
      userEmail="admin@openenergy.co.za"
      navConfig={navConfig}
      breadcrumbs={[
        { label: 'Admin' },
        { label: SCREEN_LABELS[activeScreen] },
      ]}
      alerts={[
        { id: 'a1', message: 'KYC submissions pending review — 3 applicants awaiting approval', variant: 'amber', href: '#kyc', dismissible: true },
      ]}
    >
      {activeScreen === 'dashboard' ? <Dashboard onNavigate={setActiveScreen} />
       : activeScreen === 'users'   ? <UsersScreen />
       : activeScreen === 'tenants' ? <TenantsScreen />
       : activeScreen === 'kyc'     ? <KycScreen />
       : activeScreen === 'modules' ? <ModulesScreen />
       : activeScreen === 'flags'   ? <FlagsScreen />
       : activeScreen === 'billing' ? <BillingScreen />
       : activeScreen === 'invoices'? <InvoicesScreen />
       : activeScreen === 'audit'   ? <AuditScreen />
       : <Dashboard onNavigate={setActiveScreen} />}
    </AppShell>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

function Dashboard({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { data: stats, loading } = useAdminStats();
  const { data: kyc } = useAdminKyc({ status: 'pending' });

  const pendingKyc = kyc.length;

  const recentActivity: TimelineEvent[] = [
    { id: 'e1', timestamp: 'Today 06:00', actor: 'system',       action: 'Platform billing run completed',     variant: 'green' },
    { id: 'e2', timestamp: 'Today 08:14', actor: 'system',       action: 'New KYC submission — Boland Energy', variant: 'amber' },
    { id: 'e3', timestamp: 'Today 09:31', actor: 'admin',        action: 'Feature flag deployed — algos v2',  variant: 'default' },
    { id: 'e4', timestamp: 'Today 10:05', actor: 'admin',        action: 'Tenant provisioned — SolarTrade SA', variant: 'green' },
    { id: 'e5', timestamp: 'Today 11:22', actor: 'system',       action: 'Password reset request — 3 users',  variant: 'default' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* KPI strip */}
      <StatGrid>
        <StatCard
          label="Total Users"
          value={loading ? '—' : String(stats?.total_users ?? 0)}
          variant="default"
          delta="+12"
          deltaLabel="this month"
          positive
        />
        <StatCard
          label="Active Users"
          value={loading ? '—' : String(stats?.active_users ?? 0)}
          variant="green"
        />
        <StatCard
          label="Tenants"
          value={loading ? '—' : String(stats?.total_tenants ?? 0)}
          variant="default"
        />
        <StatCard
          label="Pending KYC"
          value={loading ? '—' : String(stats?.pending_kyc ?? pendingKyc)}
          variant={pendingKyc > 0 ? 'amber' : 'green'}
          subtext={pendingKyc > 0 ? 'Awaiting review' : 'All reviewed'}
        />
        <StatCard
          label="Platform GMV"
          value={loading ? '—' : stats?.platform_gmv_zar != null
            ? 'R' + (stats.platform_gmv_zar / 1e9).toFixed(1) + 'B'
            : '—'}
          unit="ZAR"
          variant="default"
        />
      </StatGrid>

      {/* Two-column: activity + AI suggestions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Platform health */}
          <SectionCard title="Platform Health" icon="shield">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '4px 0' }}>
              <HealthRow label="API Gateway"          status="operational" />
              <HealthRow label="D1 Database"          status="operational" />
              <HealthRow label="Order Book DO"        status="operational" />
              <HealthRow label="KV Cache"             status="operational" />
              <HealthRow label="Cron Scheduler"       status="operational" />
              <HealthRow label="R2 Vault"             status="operational" />
              <HealthRow label="Workers AI (binding)" status="operational" />
              <HealthRow label="Audit Chain"          status="operational" />
            </div>
          </SectionCard>

          {/* Recent activity */}
          <SectionCard title="Recent Activity" icon="clock">
            <Timeline events={recentActivity} />
          </SectionCard>
        </div>

        {/* AI suggestions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
            AI Insights
          </div>
          <AIInsightCard
            title="3 KYC submissions aging past SLA"
            reasoning="Boland Energy, Cape Biomass, and Karoo Solar submitted 48+ hours ago without review."
            suggestion="Review and approve or reject the pending submissions to meet the 24-hour SLA."
            confidence="high"
            onAccept={() => onNavigate('kyc')}
          />
          <AIInsightCard
            title="Billing run due in 2 days"
            reasoning="Monthly billing cycle closes on the 1st. 4 tenant subscriptions have unpaid prior invoices."
            suggestion="Trigger the monthly billing run to generate and send invoices before the cycle closes."
            confidence="medium"
            onAccept={() => onNavigate('billing')}
          />
          <AIInsightCard
            title="Algo kill-switch circuit untested"
            reasoning="3 algo systems are live but kill-switch circuit tests have not run in 30+ days per FSCA guidance."
            suggestion="Review feature flags to confirm kill-switch gates are active and tested."
            confidence="medium"
            onAccept={() => onNavigate('flags')}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Platform health row helper ──────────────────────────────────────────────

function HealthRow({ label, status }: { label: string; status: 'operational' | 'degraded' | 'down' }) {
  const color = status === 'operational' ? 'var(--oe-green)' : status === 'degraded' ? 'var(--oe-amber)' : 'var(--oe-rose)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--oe-border-2)' }}>
      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '12px', color: 'var(--oe-text-2)', flex: 1 }}>{label}</span>
      <span style={{ fontSize: '10px', color, fontWeight: 600 }}>{status}</span>
    </div>
  );
}

// ─── Section card wrapper ─────────────────────────────────────────────────────

function SectionCard({ title, icon, children }: { title: string; icon?: 'clock' | 'shield' | 'gear' | 'flag' | 'report' | 'dollar' | 'folder'; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--oe-canvas)',
      border: '1px solid var(--oe-border)',
      borderRadius: 'var(--oe-r-card)',
      padding: '16px',
      boxShadow: 'var(--oe-shadow-card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        {icon && <OeIcon name={icon as any} size={14} color="var(--oe-text-3)" />}
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--oe-text-2)', letterSpacing: '0.01em' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Users screen ────────────────────────────────────────────────────────────

function UsersScreen() {
  const { data, loading, refetch } = useAdminUsers();
  const [selected, setSelected] = React.useState<AdminUser | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [showCreate, setShowCreate] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const [newEmail,   setNewEmail]   = React.useState('');
  const [newName,    setNewName]    = React.useState('');
  const [newRole,    setNewRole]    = React.useState('trader');
  const [newCompany, setNewCompany] = React.useState('');

  const userFields = (u: AdminUser): DrawerField[] => [
    { label: 'Email',    value: u.email,        mono: true, span: true },
    { label: 'Name',     value: u.name ?? '—' },
    { label: 'Role',     value: u.role },
    { label: 'Company',  value: u.company_name ?? '—' },
    { label: 'KYC',      value: u.kyc_status ?? 'unknown' },
    { label: 'Active',   value: u.is_active ? 'Yes' : 'No' },
    { label: 'Joined',   value: u.created_at,   mono: true },
    { label: 'Last Login', value: u.last_login ?? 'Never', mono: true },
    { label: 'User ID',  value: u.id.slice(-12), mono: true },
  ];

  const userActions = (u: AdminUser): DrawerAction[] => [
    {
      id: 'reset-password',
      label: 'Reset Password',
      icon: 'lock',
      variant: 'secondary',
      onClick: async () => {
        await apexClient.admin.resetPassword(u.id);
      },
    },
    {
      id: 'toggle-active',
      label: u.is_active ? 'Deactivate User' : 'Activate User',
      icon: 'approve',
      variant: u.is_active ? 'danger' : 'secondary',
      onClick: async () => {
        await apexClient.admin.updateUser(u.id, { is_active: !u.is_active });
        refetch();
      },
    },
    {
      id: 'delete',
      label: 'Delete User',
      icon: 'x-circle',
      variant: 'danger',
      onClick: async () => {
        await apexClient.admin.deleteUser(u.id);
        setDrawerOpen(false);
        refetch();
      },
    },
  ];

  const handleCreate = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      await apexClient.admin.createUser({ email: newEmail, name: newName, role: newRole, company_name: newCompany, password: 'Demo@2024!' });
      setShowCreate(false);
      setNewEmail(''); setNewName(''); setNewRole('trader'); setNewCompany('');
      refetch();
    } catch (e: unknown) {
      setCreateError((e as Error).message ?? 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0 }}>Users</h2>
          <p style={{ fontSize: '12px', color: 'var(--oe-text-3)', margin: '2px 0 0' }}>
            {data.length} registered participants
          </p>
        </div>
        <button
          onClick={() => setShowCreate(s => !s)}
          style={{
            height: '34px', paddingInline: '14px',
            background: 'var(--oe-grad-button)', color: '#fff',
            border: 'none', borderRadius: 'var(--oe-r-btn)',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
            boxShadow: 'var(--oe-shadow-btn)',
          }}
        >
          <OeIcon name="plus" size={14} color="#fff" />
          Add User
        </button>
      </div>

      {/* Inline create form */}
      {showCreate && (
        <div style={{
          padding: '16px',
          background: 'var(--oe-surf)',
          border: '1px solid var(--oe-border)',
          borderRadius: 'var(--oe-r-card)',
        }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--oe-text-2)', margin: '0 0 12px' }}>New User</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <FormField label="Email" value={newEmail} onChange={setNewEmail} placeholder="user@domain.co.za" mono />
            <FormField label="Name"  value={newName}  onChange={setNewName}  placeholder="Full name" />
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Role</div>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                style={{ width: '100%', height: '34px', padding: '0 8px', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-input)', fontSize: '12px', background: '#fff', color: 'var(--oe-text-1)' }}
              >
                {['admin','trader','ipp_developer','lender','offtaker','carbon_fund','regulator','grid_operator','support'].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <FormField label="Company" value={newCompany} onChange={setNewCompany} placeholder="Entity name" />
          </div>
          {createError && (
            <div style={{ padding: '8px 10px', background: 'var(--oe-rose-bg)', borderRadius: '6px', color: 'var(--oe-rose)', fontSize: '12px', marginBottom: '10px' }}>
              {createError}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleCreate}
              disabled={!newEmail || creating}
              style={{ height: '32px', paddingInline: '14px', background: 'var(--oe-navy-1)', color: '#fff', border: 'none', borderRadius: 'var(--oe-r-btn)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: (!newEmail || creating) ? 0.5 : 1 }}
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              style={{ height: '32px', paddingInline: '14px', background: 'transparent', color: 'var(--oe-text-2)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-btn)', fontSize: '13px', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <DataTable<AdminUser>
        columns={USER_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        emptyMessage="No users found"
      />

      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.name ?? selected.email}
          subtitle={selected.role}
          entityRef={selected.id.slice(-12)}
          status={selected.is_active ? 'active' : 'inactive'}
          fields={userFields(selected)}
          actions={userActions(selected)}
          onActionComplete={refetch}
        />
      )}
    </div>
  );
}

// ─── Tenants screen ──────────────────────────────────────────────────────────

function TenantsScreen() {
  const { data, loading, refetch } = useAdminTenants();
  const [selected, setSelected] = React.useState<AdminTenant | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [showCreate, setShowCreate] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newSlug, setNewSlug] = React.useState('');

  const tenantFields = (t: AdminTenant): DrawerField[] => [
    { label: 'Name',   value: t.name,          span: true },
    { label: 'Slug',   value: t.slug,           mono: true },
    { label: 'Plan',   value: t.plan_id ?? '—' },
    { label: 'Users',  value: String(t.participant_count ?? 0), mono: true },
    { label: 'Status', value: t.status },
    { label: 'Created', value: t.created_at,   mono: true },
    { label: 'Tenant ID', value: t.id.slice(-12), mono: true },
  ];

  const tenantActions = (t: AdminTenant): DrawerAction[] => [
    {
      id: 'suspend',
      label: 'Suspend Tenant',
      icon: 'lock',
      variant: 'danger',
      disabled: t.status === 'suspended',
      onClick: async () => {
        await apexClient.admin.suspendTenant(t.id);
        setDrawerOpen(false);
        refetch();
      },
    },
    {
      id: 'reactivate',
      label: 'Reactivate Tenant',
      icon: 'check-circle',
      variant: 'secondary',
      disabled: t.status === 'active',
      onClick: async () => {
        await apexClient.admin.reactivateTenant(t.id);
        setDrawerOpen(false);
        refetch();
      },
    },
  ];

  const handleCreate = async () => {
    setCreating(true);
    try {
      await apexClient.admin.createTenant({ name: newName, slug: newSlug });
      setShowCreate(false);
      setNewName(''); setNewSlug('');
      refetch();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0 }}>Tenants</h2>
          <p style={{ fontSize: '12px', color: 'var(--oe-text-3)', margin: '2px 0 0' }}>{data.length} tenants provisioned</p>
        </div>
        <button
          onClick={() => setShowCreate(s => !s)}
          style={{ height: '34px', paddingInline: '14px', background: 'var(--oe-grad-button)', color: '#fff', border: 'none', borderRadius: 'var(--oe-r-btn)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: 'var(--oe-shadow-btn)' }}
        >
          <OeIcon name="plus" size={14} color="#fff" />
          Add Tenant
        </button>
      </div>

      {showCreate && (
        <div style={{ padding: '16px', background: 'var(--oe-surf)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--oe-text-2)', margin: '0 0 12px' }}>New Tenant</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <FormField label="Name" value={newName} onChange={v => { setNewName(v); setNewSlug(v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')); }} placeholder="Tenant display name" />
            <FormField label="Slug" value={newSlug} onChange={setNewSlug} placeholder="unique-slug" mono />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleCreate} disabled={!newName || !newSlug || creating} style={{ height: '32px', paddingInline: '14px', background: 'var(--oe-navy-1)', color: '#fff', border: 'none', borderRadius: 'var(--oe-r-btn)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: (!newName || !newSlug || creating) ? 0.5 : 1 }}>
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button onClick={() => setShowCreate(false)} style={{ height: '32px', paddingInline: '14px', background: 'transparent', color: 'var(--oe-text-2)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-btn)', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <DataTable<AdminTenant> columns={TENANT_COLS} rows={data} loading={loading} onRowClick={row => { setSelected(row); setDrawerOpen(true); }} emptyMessage="No tenants found" />

      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.name}
          subtitle={selected.slug}
          entityRef={selected.id.slice(-10)}
          status={selected.status}
          fields={tenantFields(selected)}
          actions={tenantActions(selected)}
          onActionComplete={refetch}
        />
      )}
    </div>
  );
}

// ─── KYC screen ──────────────────────────────────────────────────────────────

function KycScreen() {
  const { data, loading, refetch } = useAdminKyc();
  const [selected, setSelected] = React.useState<AdminKyc | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [notes, setNotes] = React.useState('');

  const kycFields = (k: AdminKyc): DrawerField[] => [
    { label: 'Applicant',    value: k.user_name ?? '—',                 span: true },
    { label: 'Email',        value: k.user_email ?? k.user_id,          mono: true },
    { label: 'Status',       value: k.status },
    { label: 'Submitted',    value: k.submitted_at,                     mono: true },
    { label: 'Reviewed',     value: k.reviewed_at ?? 'Not yet',         mono: true },
    { label: 'Notes',        value: k.notes ?? '—',                     span: true },
  ];

  const kycActions = (k: AdminKyc): DrawerAction[] => [
    {
      id: 'approve',
      label: 'Approve KYC',
      icon: 'check-circle',
      variant: 'primary',
      disabled: k.status === 'approved',
      onClick: async () => {
        await apexClient.admin.reviewKyc(k.id, { status: 'approved', notes });
        setDrawerOpen(false);
        refetch();
      },
    },
    {
      id: 'reject',
      label: 'Reject KYC',
      icon: 'x-circle',
      variant: 'danger',
      disabled: k.status === 'rejected',
      onClick: async () => {
        await apexClient.admin.reviewKyc(k.id, { status: 'rejected', notes });
        setDrawerOpen(false);
        refetch();
      },
    },
  ];

  const pending = data.filter(k => k.status === 'pending' || k.status === 'submitted');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0 }}>KYC Queue</h2>
        <p style={{ fontSize: '12px', color: 'var(--oe-text-3)', margin: '2px 0 0' }}>
          {pending.length} pending · {data.length} total
        </p>
      </div>

      {pending.length > 0 && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--oe-amber-bg)',
          border: '1px solid var(--oe-amber)',
          borderRadius: 'var(--oe-r-card)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <OeIcon name="clock" size={14} color="var(--oe-amber)" />
          <span style={{ fontSize: '12px', color: 'var(--oe-amber)', fontWeight: 600 }}>
            {pending.length} KYC submission{pending.length !== 1 ? 's' : ''} awaiting review — SLA 24 hours
          </span>
        </div>
      )}

      <DataTable<AdminKyc>
        columns={KYC_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setNotes(row.notes ?? ''); setDrawerOpen(true); }}
        emptyMessage="No KYC submissions"
      />

      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.user_name ?? selected.user_email ?? 'Applicant'}
          subtitle="KYC Application"
          entityRef={selected.id.slice(-10)}
          status={selected.status}
          fields={kycFields(selected)}
          actions={kycActions(selected)}
          onActionComplete={refetch}
        >
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
              Review Notes
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add notes for this review decision…"
              rows={3}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-input)', fontSize: '12px', resize: 'vertical', fontFamily: 'inherit', color: 'var(--oe-text-1)' }}
            />
          </div>
        </DetailDrawer>
      )}
    </div>
  );
}

// ─── Modules screen ──────────────────────────────────────────────────────────

function ModulesScreen() {
  const { data, loading, refetch } = useAdminModules();
  const [toggling, setToggling] = React.useState<string | null>(null);

  const toggle = async (mod: AdminModule) => {
    setToggling(mod.key);
    try {
      await apexClient.admin.updateModule(mod.key, { enabled: !mod.enabled });
      refetch();
    } finally {
      setToggling(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0 }}>Feature Modules</h2>
        <p style={{ fontSize: '12px', color: 'var(--oe-text-3)', margin: '2px 0 0' }}>
          Enable or disable platform modules per-tenant
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--oe-text-3)', fontSize: '13px' }}>Loading modules…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {data.map(mod => (
            <div key={mod.key} style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              padding: '12px 16px',
              background: 'var(--oe-canvas)',
              border: '1px solid var(--oe-border)',
              borderRadius: 'var(--oe-r-card)',
              boxShadow: 'var(--oe-shadow-card)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--oe-text-1)' }}>{mod.name}</span>
                  <span style={{ fontSize: '10px', color: 'var(--oe-text-3)', fontFamily: 'var(--oe-font-mono)' }}>{mod.key}</span>
                </div>
                {mod.description && (
                  <p style={{ fontSize: '11px', color: 'var(--oe-text-3)', margin: '2px 0 0' }}>{mod.description}</p>
                )}
              </div>
              <button
                onClick={() => toggle(mod)}
                disabled={toggling === mod.key}
                style={{
                  height: '28px', width: '52px',
                  borderRadius: '14px',
                  background: mod.enabled ? 'var(--oe-green)' : 'var(--oe-surf-3)',
                  border: 'none', cursor: toggling === mod.key ? 'not-allowed' : 'pointer',
                  position: 'relative',
                  transition: 'background 150ms ease',
                  flexShrink: 0,
                }}
                aria-label={mod.enabled ? 'Disable module' : 'Enable module'}
              >
                <span style={{
                  position: 'absolute',
                  top: '3px',
                  left: mod.enabled ? 'calc(100% - 25px)' : '3px',
                  width: '22px', height: '22px',
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  transition: 'left 150ms var(--oe-ease)',
                  display: 'block',
                }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Feature flags screen ────────────────────────────────────────────────────

function FlagsScreen() {
  const { data, loading, refetch } = useAdminFlags();
  const [selected, setSelected] = React.useState<AdminFeatureFlag | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [updating, setUpdating] = React.useState(false);
  const [rollout, setRollout] = React.useState('');

  const flagFields = (f: AdminFeatureFlag): DrawerField[] => [
    { label: 'Flag Key',   value: f.flag_key,                             mono: true, span: true },
    { label: 'Name',       value: f.name ?? '—' },
    { label: 'Enabled',    value: f.enabled ? 'Yes' : 'No' },
    { label: 'Rollout',    value: f.rollout_percentage != null ? `${f.rollout_percentage}%` : '100%', mono: true },
    { label: 'Updated',    value: f.updated_at ?? '—',                    mono: true },
    { label: 'Description', value: f.description ?? '—',                  span: true },
  ];

  const flagActions = (f: AdminFeatureFlag): DrawerAction[] => [
    {
      id: 'toggle',
      label: f.enabled ? 'Disable Flag' : 'Enable Flag',
      icon: f.enabled ? 'x-circle' : 'check-circle',
      variant: f.enabled ? 'danger' : 'primary',
      onClick: async () => {
        setUpdating(true);
        await apexClient.admin.updateFlag(f.id, { enabled: !f.enabled });
        setUpdating(false);
        setDrawerOpen(false);
        refetch();
      },
    },
    {
      id: 'set-rollout',
      label: 'Update Rollout %',
      icon: 'flag',
      variant: 'secondary',
      onClick: async () => {
        const pct = parseInt(rollout, 10);
        if (isNaN(pct) || pct < 0 || pct > 100) return;
        await apexClient.admin.updateFlag(f.id, { rollout_percentage: pct });
        setDrawerOpen(false);
        refetch();
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0 }}>Feature Flags</h2>
        <p style={{ fontSize: '12px', color: 'var(--oe-text-3)', margin: '2px 0 0' }}>Platform-wide feature gate configuration</p>
      </div>

      <DataTable<AdminFeatureFlag>
        columns={FLAG_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setRollout(String(row.rollout_percentage ?? 100)); setDrawerOpen(true); }}
        emptyMessage="No feature flags configured"
      />

      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.name ?? selected.flag_key}
          subtitle="Feature Flag"
          entityRef={selected.flag_key}
          status={selected.enabled ? 'enabled' : 'disabled'}
          fields={flagFields(selected)}
          actions={!updating ? flagActions(selected) : []}
          onActionComplete={refetch}
        >
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Rollout Percentage (0–100)</div>
            <input
              type="number"
              min={0} max={100}
              value={rollout}
              onChange={e => setRollout(e.target.value)}
              style={{ width: '100%', height: '34px', padding: '0 10px', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-input)', fontSize: '13px', fontFamily: 'var(--oe-font-mono)', color: 'var(--oe-text-1)' }}
            />
          </div>
        </DetailDrawer>
      )}
    </div>
  );
}

// ─── Billing screen ──────────────────────────────────────────────────────────

function BillingScreen() {
  const { data, loading, refetch } = useAdminBillingRuns();
  const [running, setRunning] = React.useState(false);

  const triggerBillingRun = async () => {
    setRunning(true);
    try {
      await apexClient.admin.runBilling();
      refetch();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0 }}>Billing Runs</h2>
          <p style={{ fontSize: '12px', color: 'var(--oe-text-3)', margin: '2px 0 0' }}>Monthly invoice cycles</p>
        </div>
        <button
          onClick={triggerBillingRun}
          disabled={running}
          style={{ height: '34px', paddingInline: '14px', background: 'var(--oe-grad-button)', color: '#fff', border: 'none', borderRadius: 'var(--oe-r-btn)', fontSize: '13px', fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer', opacity: running ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px', boxShadow: 'var(--oe-shadow-btn)' }}
        >
          {running ? 'Running…' : 'Trigger Billing Run'}
        </button>
      </div>

      <DataTable<AdminBillingRun>
        columns={BILLING_COLS}
        rows={data}
        loading={loading}
        emptyMessage="No billing runs found"
      />
    </div>
  );
}

// ─── Invoices screen ─────────────────────────────────────────────────────────

function InvoicesScreen() {
  const { data, loading } = useAdminInvoices();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0 }}>Invoices</h2>
        <p style={{ fontSize: '12px', color: 'var(--oe-text-3)', margin: '2px 0 0' }}>{data.length} invoices</p>
      </div>
      <DataTable<AdminInvoice> columns={INVOICE_COLS} rows={data} loading={loading} emptyMessage="No invoices found" />
    </div>
  );
}

// ─── Audit chain screen ──────────────────────────────────────────────────────

function AuditScreen() {
  const { data, loading } = useAdminAuditLogs({ limit: 200 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <OeIcon name="shield" size={16} color="var(--oe-text-3)" />
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0 }}>Platform Audit Chain</h2>
          <p style={{ fontSize: '12px', color: 'var(--oe-text-3)', margin: '2px 0 0' }}>Immutable record — last 200 events</p>
        </div>
      </div>

      <div style={{
        padding: '10px 14px',
        background: 'var(--oe-blue-bg)',
        border: '1px solid var(--oe-blue)',
        borderRadius: 'var(--oe-r-card)',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <OeIcon name="lock" size={13} color="var(--oe-blue)" />
        <span style={{ fontSize: '12px', color: 'var(--oe-blue)', fontWeight: 500 }}>
          SHA-256 hash chained — each record references its predecessor. Export for NERSA / SARS submission via Reports.
        </span>
      </div>

      <DataTable<AdminAuditLog>
        columns={AUDIT_COLS}
        rows={data}
        loading={loading}
        emptyMessage="No audit log entries"
      />
    </div>
  );
}

// ─── Shared form field helper ─────────────────────────────────────────────────

function FormField({
  label, value, onChange, placeholder, mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', height: '34px', padding: '0 10px',
          border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-input)',
          fontSize: '12px',
          fontFamily: mono ? 'var(--oe-font-mono)' : 'inherit',
          color: 'var(--oe-text-1)',
          background: '#fff',
        }}
      />
    </div>
  );
}
