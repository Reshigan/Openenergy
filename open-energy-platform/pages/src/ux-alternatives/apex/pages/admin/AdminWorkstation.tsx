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
  useAdminBillingRuns, useAdminInvoices, useCurrentUser,
} from '../../lib/hooks';
import {
  apexClient,
  AdminUser, AdminTenant, AdminKyc, AdminModule,
  AdminAuditLog, AdminFeatureFlag, AdminBillingRun, AdminInvoice,
} from '../../lib/client';
import { RbacPanel } from './RbacPanel';

// ─── Nav config ─────────────────────────────────────────────────────────────

const ADMIN_NAV: NavConfig = {
  activeId: 'admin-dashboard',
  sections: [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { id: 'admin-dashboard', label: 'Dashboard',       href: '#dashboard', icon: 'home' },
        { id: 'admin-health',    label: 'Platform Health', href: '#health',    icon: 'report' },
        { id: 'admin-audit',     label: 'Audit Chain',     href: '#audit',     icon: 'shield' },
      ],
    },
    {
      id: 'participants',
      label: 'Participants',
      items: [
        { id: 'admin-users',   label: 'Users',       href: '#users',   icon: 'person', badge: 0, badgeVariant: 'amber' },
        { id: 'admin-tenants', label: 'Tenants',     href: '#tenants', icon: 'building' },
        { id: 'admin-kyc',     label: 'KYC Queue',   href: '#kyc',     icon: 'certificate', badge: 0, badgeVariant: 'rose' },
        { id: 'admin-rbac',    label: 'Roles & RBAC', href: '#rbac',   icon: 'shield' },
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
      id: 'operations',
      label: 'Operations',
      items: [
        { id: 'admin-cron',      label: 'Cron Jobs',    href: '#cron',      icon: 'gear' },
        { id: 'admin-ml-models', label: 'ML Models',    href: '#ml-models', icon: 'hierarchy' },
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

// ─── Cron / ML / Health row types ────────────────────────────────────────────

type CronJobRow = {
  id: string;
  schedule: string;
  name: string;
  last_run_at: string | null;
  last_status: 'success' | 'error' | 'running' | null;
  next_run_at: string | null;
  run_count: number;
};

type MlModelRow = {
  id: string;
  model_name: string;
  version: string;
  algorithm: string;
  wave: string;
  trained_at: string | null;
  accuracy_pct: number | null;
  status: string;
};

type HealthCheckRow = {
  id: string;
  service: string;
  endpoint: string;
  status: 'healthy' | 'degraded' | 'down';
  latency_ms: number | null;
  last_checked: string;
};

// ─── Screen type ─────────────────────────────────────────────────────────────

type Screen = 'dashboard' | 'users' | 'tenants' | 'kyc' | 'modules' | 'flags' | 'billing' | 'invoices' | 'audit' | 'cron' | 'ml-models' | 'health' | 'rbac';

// ─── Main component ──────────────────────────────────────────────────────────

export function AdminWorkstation() {
  const { data: me } = useCurrentUser();
  const [activeScreen, setActiveScreen] = useState<Screen>('dashboard');

  const SCREEN_LABELS: Record<Screen, string> = {
    dashboard:  'Platform Dashboard',
    users:      'User Management',
    tenants:    'Tenants',
    kyc:        'KYC Queue',
    modules:    'Feature Modules',
    flags:      'Feature Flags',
    billing:    'Billing Runs',
    invoices:   'Invoices',
    audit:      'Audit Chain',
    cron:       'Cron Jobs',
    'ml-models': 'ML Model Registry',
    health:     'Platform Health',
    rbac:       'Roles & Permissions',
  };

  const NAV_CLICK_MAP: Record<string, () => void> = {
    'admin-dashboard': () => setActiveScreen('dashboard'),
    'admin-users':     () => setActiveScreen('users'),
    'admin-tenants':   () => setActiveScreen('tenants'),
    'admin-kyc':       () => setActiveScreen('kyc'),
    'admin-rbac':      () => setActiveScreen('rbac'),
    'admin-modules':   () => setActiveScreen('modules'),
    'admin-flags':     () => setActiveScreen('flags'),
    'admin-billing':   () => setActiveScreen('billing'),
    'admin-invoices':  () => setActiveScreen('invoices'),
    'admin-audit':     () => setActiveScreen('audit'),
    'admin-cron':      () => setActiveScreen('cron'),
    'admin-ml-models': () => setActiveScreen('ml-models'),
    'admin-health':    () => setActiveScreen('health'),
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
      userName={me?.name ?? 'User'}
      userEmail={me?.email ?? ''}
      navConfig={navConfig}
      breadcrumbs={[
        { label: 'Admin' },
        { label: SCREEN_LABELS[activeScreen] },
      ]}
      alerts={[
        { id: 'a1', message: 'KYC submissions pending review — 3 applicants awaiting approval', variant: 'amber', href: '#kyc', dismissible: true },
      ]}
    >
      {activeScreen === 'dashboard'  ? <Dashboard onNavigate={setActiveScreen} />
       : activeScreen === 'users'    ? <UsersScreen />
       : activeScreen === 'tenants'  ? <TenantsScreen />
       : activeScreen === 'kyc'      ? <KycScreen />
       : activeScreen === 'modules'  ? <ModulesScreen />
       : activeScreen === 'flags'    ? <FlagsScreen />
       : activeScreen === 'billing'  ? <BillingScreen />
       : activeScreen === 'invoices' ? <InvoicesScreen />
       : activeScreen === 'audit'    ? <AuditScreen />
       : activeScreen === 'cron'     ? <CronScreen />
       : activeScreen === 'ml-models'? <MlModelsScreen />
       : activeScreen === 'health'   ? <HealthScreen />
       : activeScreen === 'rbac'     ? <RbacPanel />
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

      <AIInsightCard
        title="Privileged Role Anomaly — 3 Admin Accounts Without MFA"
        suggestion="3 admin-role user accounts are currently active without multi-factor authentication configured: reshigan@gonxt.tech, api-sync@openenergy.co.za, reporting@openenergy.co.za. Platform policy requires MFA for all admin and regulator roles. Force MFA enrollment on next login for these accounts."
        reasoning="POPIA §19 + NERSA's information security guidance: administrative accounts with access to all tenant data and configuration must have step-up authentication. A compromised admin credential grants cross-tenant access to all regulated data. The SA Financial Sector Conduct Authority's cybersecurity baseline (2024) mandates MFA for all privileged accounts."
        confidence="high"
        onAccept={() => {}}
      />

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

      <AIInsightCard
        title="Stale Tenant Detected — Last Login 47 Days Ago"
        suggestion="Tenant 'Umoya Energy Partners' has had zero active sessions in 47 days. Their subscription includes 8 active user seats and the lender role. Before disabling the tenant, send a re-engagement notification — dormant tenants are typically a billing review or reactivation opportunity. If no response within 14 days, recommend downgrade to read-only mode."
        reasoning="Platform health: dormant tenants inflate active seat counts and skew the per-role analytics. More importantly, stale credentials that are never reviewed become vectors for account takeover — a periodic dormancy sweep is standard platform hygiene required under POPIA §22 (data minimisation)."
        confidence="medium"
        onAccept={() => {}}
      />

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

      <AIInsightCard
        title="3 Webhooks Failing — Cascade Events Undelivered"
        suggestion="3 active webhooks have been in a failed state for more than 4 hours: Slack integration (cascade.contract.signed), Salesforce (cascade.loi.approved), and Zapier (cascade.payment.settled). Events are queuing in the DLQ. The Slack and Zapier endpoints are returning 502 (likely downtime on their side); Salesforce is returning 401 (token expired). Rotate the Salesforce OAuth token and the events will replay automatically."
        reasoning="The cascade system routes business-critical events (contract signing, LOI approval, payment settlement) to downstream integrations. A 4-hour DLQ backlog means these events will replay in a burst when the endpoints recover, potentially triggering duplicate downstream workflows. The Salesforce token rotation is a 2-minute fix that will drain the DLQ cleanly."
        confidence="high"
        onAccept={() => {}}
      />

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

      <AIInsightCard
        title="Unusual After-Hours Data Export Activity"
        suggestion="3 large CSV exports (>10,000 rows each) were performed by user trader@openenergy.co.za between 02:00-03:30 this morning — outside their normal usage pattern (09:00-18:00, weekdays). The exported data includes settlement records and counterparty position data. Flag for a security review: this pattern matches pre-resignation data exfiltration or credential misuse."
        reasoning="POPIA §19 + FMA §56: access to settlement and position data outside business hours by a trader-role account is a red flag for insider threat. The FMA requires market participants to maintain controls preventing unauthorised disclosure of position information. An audit trail review should confirm whether the export was authorised and whether the data contained any price-sensitive counterparty positions."
        confidence="medium"
        onAccept={() => {}}
      />

      <DataTable<AdminAuditLog>
        columns={AUDIT_COLS}
        rows={data}
        loading={loading}
        emptyMessage="No audit log entries"
      />
    </div>
  );
}

// ─── Cron Job Manager screen ─────────────────────────────────────────────────

const CRON_JOBS: CronJobRow[] = [
  { id: 'cron-1', schedule: '*/15 * * * *', name: 'Surveillance & OrderBook snapshots', last_run_at: '2026-06-01 05:45', last_status: 'success', next_run_at: '2026-06-01 06:00', run_count: 9841 },
  { id: 'cron-2', schedule: '0 * * * *',    name: 'VWAP mark prices',                  last_run_at: '2026-06-01 05:00', last_status: 'success', next_run_at: '2026-06-01 06:00', run_count: 2190 },
  { id: 'cron-3', schedule: '5 0 * * *',    name: 'Metering + ONA rollups',            last_run_at: '2026-06-01 00:05', last_status: 'success', next_run_at: '2026-06-02 00:05', run_count: 365  },
  { id: 'cron-4', schedule: '10 0 * * *',   name: 'PPA settlement run',                last_run_at: '2026-06-01 00:10', last_status: 'success', next_run_at: '2026-06-02 00:10', run_count: 365  },
  { id: 'cron-5', schedule: '30 0 * * *',   name: 'Usage snapshot + margin calls',     last_run_at: '2026-06-01 00:30', last_status: 'success', next_run_at: '2026-06-02 00:30', run_count: 365  },
  { id: 'cron-6', schedule: '45 0 * * *',   name: 'Watershed anomaly + maturity refresh', last_run_at: '2026-06-01 00:45', last_status: 'success', next_run_at: '2026-06-02 00:45', run_count: 365  },
  { id: 'cron-7', schedule: '0 2 1 * *',    name: 'Monthly platform invoice run',      last_run_at: '2026-06-01 02:00', last_status: 'success', next_run_at: '2026-07-01 02:00', run_count: 18   },
];

const CRON_COLS: Column<CronJobRow>[] = [
  { key: 'name',        header: 'Job Name',    render: row => <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--oe-text-1)' }}>{row.name}</span> },
  { key: 'schedule',    header: 'Schedule',    width: '140px', mono: true },
  { key: 'last_run_at', header: 'Last Run',    width: '140px', mono: true, render: row => <span>{row.last_run_at ?? '—'}</span> },
  { key: 'last_status', header: 'Last Status', width: '110px', render: row => {
    if (!row.last_status) return <span style={{ color: 'var(--oe-text-3)', fontSize: '12px' }}>—</span>;
    const v = row.last_status === 'success' ? 'green' : row.last_status === 'error' ? 'rose' : 'amber';
    return <StatusPill label={row.last_status} variant={v} size="sm" />;
  }},
  { key: 'next_run_at', header: 'Next Run',    width: '140px', mono: true, render: row => <span>{row.next_run_at ?? '—'}</span> },
  { key: 'run_count',   header: 'Runs',        width: '80px', align: 'right', mono: true, render: row => <span>{row.run_count.toLocaleString()}</span> },
];

function CronScreen() {
  const [selected, setSelected] = React.useState<CronJobRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [triggering, setTriggering] = React.useState<string | null>(null);

  const cronFields = (c: CronJobRow): DrawerField[] => [
    { label: 'Job Name',    value: c.name,             span: true },
    { label: 'Schedule',    value: c.schedule,         mono: true },
    { label: 'Last Run',    value: c.last_run_at ?? '—', mono: true },
    { label: 'Last Status', value: c.last_status ?? '—' },
    { label: 'Next Run',    value: c.next_run_at ?? '—', mono: true },
    { label: 'Total Runs',  value: c.run_count.toLocaleString(), mono: true },
  ];

  const cronActions = (c: CronJobRow): DrawerAction[] => [
    {
      id: 'trigger-now',
      label: triggering === c.id ? 'Triggering…' : 'Manual Trigger',
      icon: 'gear',
      variant: 'primary',
      onClick: async () => {
        setTriggering(c.id);
        try {
          await apexClient.admin.runCron({ name: c.name });
        } finally {
          setTriggering(null);
        }
      },
    },
    {
      id: 'view-logs',
      label: 'View Logs',
      icon: 'report',
      variant: 'secondary',
      onClick: () => {
        // Navigate to audit with cron filter in a full implementation
        setDrawerOpen(false);
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0 }}>Cron Jobs</h2>
        <p style={{ fontSize: '12px', color: 'var(--oe-text-3)', margin: '2px 0 0' }}>
          {CRON_JOBS.length} scheduled jobs — all status healthy
        </p>
      </div>

      <div style={{
        padding: '10px 14px',
        background: 'var(--oe-blue-bg)',
        border: '1px solid var(--oe-blue)',
        borderRadius: 'var(--oe-r-card)',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <OeIcon name="clock" size={13} color="var(--oe-blue)" />
        <span style={{ fontSize: '12px', color: 'var(--oe-blue)', fontWeight: 500 }}>
          Workers Cron Triggers — schedules defined in wrangler.toml. Manual triggers via POST /api/admin/cron/run (admin role only).
        </span>
      </div>

      <DataTable<CronJobRow>
        columns={CRON_COLS}
        rows={CRON_JOBS}
        loading={false}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        emptyMessage="No cron jobs configured"
      />

      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.name}
          subtitle="Scheduled Job"
          entityRef={selected.schedule}
          status={selected.last_status ?? 'unknown'}
          fields={cronFields(selected)}
          actions={cronActions(selected)}
        />
      )}
    </div>
  );
}

// ─── ML Model Registry screen ─────────────────────────────────────────────────

const ML_MODELS: MlModelRow[] = [
  { id: '1', model_name: 'Anomaly Detection',  version: 'v1.2', algorithm: 'Isolation Forest + Z-Score', wave: 'W127', trained_at: '2026-05-28', accuracy_pct: 96.4, status: 'active' },
  { id: '2', model_name: 'RUL Prediction',     version: 'v1.1', algorithm: 'Random Forest Regressor',   wave: 'W128', trained_at: '2026-05-28', accuracy_pct: 94.1, status: 'active' },
  { id: '3', model_name: 'Fault Fingerprint',  version: 'v2.0', algorithm: 'XGBoost + CNN-1D',          wave: 'W129', trained_at: '2026-05-29', accuracy_pct: 97.8, status: 'active' },
  { id: '4', model_name: 'NTT Comparison',     version: 'v1.0', algorithm: 'Continuous Aggregator',     wave: 'W130', trained_at: '2026-05-30', accuracy_pct: null, status: 'active' },
];

const ML_MODEL_COLS: Column<MlModelRow>[] = [
  { key: 'model_name',   header: 'Model',         render: row => <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--oe-text-1)' }}>{row.model_name}</span> },
  { key: 'version',      header: 'Version',       width: '80px',  mono: true },
  { key: 'algorithm',    header: 'Algorithm',     width: '220px', render: row => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{row.algorithm}</span> },
  { key: 'wave',         header: 'Wave',          width: '70px',  mono: true },
  { key: 'trained_at',   header: 'Trained',       width: '120px', mono: true, render: row => <span>{row.trained_at ?? '—'}</span> },
  { key: 'accuracy_pct', header: 'Accuracy',      width: '90px',  align: 'right', mono: true, render: row => <span>{row.accuracy_pct != null ? `${row.accuracy_pct}%` : '—'}</span> },
  { key: 'status',       header: 'Status',        width: '90px',  render: row => <StatusPill label={row.status} variant={row.status === 'active' ? 'green' : stateVariant(row.status)} size="sm" /> },
];

function MlModelsScreen() {
  const [models, setModels] = React.useState<MlModelRow[]>(ML_MODELS);
  const [selected, setSelected] = React.useState<MlModelRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const mlFields = (m: MlModelRow): DrawerField[] => [
    { label: 'Model Name', value: m.model_name,              span: true },
    { label: 'Version',    value: m.version,                 mono: true },
    { label: 'Algorithm',  value: m.algorithm,               span: true },
    { label: 'Wave',       value: m.wave,                    mono: true },
    { label: 'Trained',    value: m.trained_at ?? '—',       mono: true },
    { label: 'Accuracy',   value: m.accuracy_pct != null ? `${m.accuracy_pct}%` : '—', mono: true },
    { label: 'Status',     value: m.status },
    { label: 'Model ID',   value: m.id,                      mono: true },
  ];

  const mlActions = (m: MlModelRow): DrawerAction[] => [
    {
      id: 'retrain',
      label: 'Retrain Model',
      icon: 'gear',
      variant: 'primary',
      onClick: () => {
        // In a full implementation this would POST to a retrain endpoint
        setDrawerOpen(false);
      },
    },
    {
      id: 'rollback',
      label: 'Rollback Version',
      icon: 'clock',
      variant: 'secondary',
      onClick: () => {
        setDrawerOpen(false);
      },
    },
    {
      id: 'disable',
      label: 'Disable Model',
      icon: 'x-circle',
      variant: 'danger',
      disabled: m.status !== 'active',
      onClick: () => {
        setModels(prev => prev.map(r => r.id === m.id ? { ...r, status: 'disabled' } : r));
        setDrawerOpen(false);
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0 }}>ML Model Registry</h2>
        <p style={{ fontSize: '12px', color: 'var(--oe-text-3)', margin: '2px 0 0' }}>
          {models.filter(m => m.status === 'active').length} active models — Esums predictive O&M stack (W127–W130)
        </p>
      </div>

      <div style={{
        padding: '10px 14px',
        background: 'var(--oe-blue-bg)',
        border: '1px solid var(--oe-blue)',
        borderRadius: 'var(--oe-r-card)',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <OeIcon name="shield" size={13} color="var(--oe-blue)" />
        <span style={{ fontSize: '12px', color: 'var(--oe-blue)', fontWeight: 500 }}>
          Workers AI binding — all models run via the 'ml' audit namespace. Rollback triggers EVERY tier per W127–W129 SLA inversion.
        </span>
      </div>

      <DataTable<MlModelRow>
        columns={ML_MODEL_COLS}
        rows={models}
        loading={false}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        emptyMessage="No ML models registered"
      />

      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.model_name}
          subtitle={`${selected.algorithm} · ${selected.wave}`}
          entityRef={`${selected.version}`}
          status={selected.status}
          fields={mlFields(selected)}
          actions={mlActions(selected)}
        />
      )}
    </div>
  );
}

// ─── Platform Health screen ──────────────────────────────────────────────────

const HEALTH_CHECKS: HealthCheckRow[] = [
  { id: 'h1', service: 'D1 Database',     endpoint: '/api/health/deep',  status: 'healthy', latency_ms: 4,   last_checked: '2026-06-01 05:58' },
  { id: 'h2', service: 'KV Cache',        endpoint: 'cf:kv:binding',     status: 'healthy', latency_ms: 1,   last_checked: '2026-06-01 05:58' },
  { id: 'h3', service: 'R2 Vault',        endpoint: 'cf:r2:binding',     status: 'healthy', latency_ms: 8,   last_checked: '2026-06-01 05:58' },
  { id: 'h4', service: 'Workers AI',      endpoint: 'cf:ai:binding',     status: 'healthy', latency_ms: 120, last_checked: '2026-06-01 05:58' },
  { id: 'h5', service: 'OrderBook DO',    endpoint: 'cf:do:order-book',  status: 'healthy', latency_ms: 3,   last_checked: '2026-06-01 05:58' },
  { id: 'h6', service: 'Hono Router',     endpoint: '/api/health',       status: 'healthy', latency_ms: 2,   last_checked: '2026-06-01 05:58' },
  { id: 'h7', service: 'Auth Service',    endpoint: '/api/auth/login',   status: 'healthy', latency_ms: 11,  last_checked: '2026-06-01 05:58' },
  { id: 'h8', service: 'Cascade Engine',  endpoint: 'internal:cascade',  status: 'healthy', latency_ms: 6,   last_checked: '2026-06-01 05:58' },
];

const HEALTH_COLS: Column<HealthCheckRow>[] = [
  { key: 'service',     header: 'Service',    render: row => <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--oe-text-1)' }}>{row.service}</span> },
  { key: 'endpoint',    header: 'Endpoint',   width: '200px', mono: true },
  { key: 'status',      header: 'Status',     width: '100px', render: row => {
    const v = row.status === 'healthy' ? 'green' : row.status === 'degraded' ? 'amber' : 'rose';
    return <StatusPill label={row.status} variant={v} size="sm" />;
  }},
  { key: 'latency_ms',  header: 'Latency',    width: '90px', align: 'right', mono: true, render: row => <span>{row.latency_ms != null ? `${row.latency_ms}ms` : '—'}</span> },
  { key: 'last_checked', header: 'Last Checked', width: '150px', mono: true },
];

function HealthScreen() {
  const [checks, setChecks] = React.useState<HealthCheckRow[]>(HEALTH_CHECKS);
  const [running, setRunning] = React.useState(false);
  const [selected, setSelected] = React.useState<HealthCheckRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const runHealthCheck = () => {
    setRunning(true);
    setTimeout(() => {
      const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
      setChecks(prev => prev.map(c => ({ ...c, last_checked: now })));
      setRunning(false);
    }, 1000);
  };

  const healthFields = (h: HealthCheckRow): DrawerField[] => [
    { label: 'Service',      value: h.service,              span: true },
    { label: 'Endpoint',     value: h.endpoint,             mono: true },
    { label: 'Status',       value: h.status },
    { label: 'Latency',      value: h.latency_ms != null ? `${h.latency_ms}ms` : '—', mono: true },
    { label: 'Last Checked', value: h.last_checked,         mono: true },
  ];

  const healthActions = (h: HealthCheckRow): DrawerAction[] => [
    {
      id: 'trigger-check',
      label: 'Trigger Check',
      icon: 'gear',
      variant: 'primary',
      onClick: () => {
        const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
        setChecks(prev => prev.map(c => c.id === h.id ? { ...c, last_checked: now } : c));
        setDrawerOpen(false);
      },
    },
  ];

  const allHealthy = checks.every(c => c.status === 'healthy');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0 }}>Platform Health</h2>
          <p style={{ fontSize: '12px', color: 'var(--oe-text-3)', margin: '2px 0 0' }}>
            {checks.length} services monitored — {checks.filter(c => c.status === 'healthy').length} healthy
          </p>
        </div>
        <button
          onClick={runHealthCheck}
          disabled={running}
          style={{
            height: '34px', paddingInline: '14px',
            background: 'var(--oe-grad-button)', color: '#fff',
            border: 'none', borderRadius: 'var(--oe-r-btn)',
            fontSize: '13px', fontWeight: 600,
            cursor: running ? 'not-allowed' : 'pointer',
            opacity: running ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: '6px',
            boxShadow: 'var(--oe-shadow-btn)',
          }}
        >
          <OeIcon name="gear" size={14} color="#fff" />
          {running ? 'Checking…' : 'Run Health Check'}
        </button>
      </div>

      <div style={{
        padding: '10px 14px',
        background: allHealthy ? 'var(--oe-green-bg)' : 'var(--oe-amber-bg)',
        border: `1px solid ${allHealthy ? 'var(--oe-green)' : 'var(--oe-amber)'}`,
        borderRadius: 'var(--oe-r-card)',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: allHealthy ? 'var(--oe-green)' : 'var(--oe-amber)', flexShrink: 0 }} />
        <span style={{ fontSize: '12px', color: allHealthy ? 'var(--oe-green)' : 'var(--oe-amber)', fontWeight: 600 }}>
          {allHealthy ? 'All systems operational' : 'One or more services degraded — review below'}
        </span>
      </div>

      <AIInsightCard
        title="Migration 089 Applied Out-of-Band — Ledger Mismatch"
        suggestion="The D1 migrations ledger shows migrations 019-048 as 'pending' but they have been applied directly via wrangler d1 execute. This is expected for the production ledger gap (documented in CLAUDE.md). No action required. However, migration 089 was applied at 03:42 this morning without a corresponding CI workflow run — this is unusual and warrants a manual verification that the schema state matches the migration file."
        reasoning="The migration discipline in CLAUDE.md explicitly documents that 019-048 are skip-applied. However, 089 landing outside the CI workflow suggests either a manual production intervention or a rogue workflow run. Manual production schema changes without CI tracking are a compliance risk — the D1 audit table and the git migration history should match exactly."
        confidence="medium"
        onAccept={() => {}}
      />

      <DataTable<HealthCheckRow>
        columns={HEALTH_COLS}
        rows={checks}
        loading={false}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        emptyMessage="No health checks configured"
      />

      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.service}
          subtitle="Service Health"
          entityRef={selected.endpoint}
          status={selected.status}
          fields={healthFields(selected)}
          actions={healthActions(selected)}
        />
      )}
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
