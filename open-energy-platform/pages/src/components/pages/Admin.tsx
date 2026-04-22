import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, Settings, Shield, Activity, DollarSign, RefreshCw,
  ClipboardList, BarChart2, AlertTriangle, CheckCircle, XCircle,
  Plus, Trash2, Edit3, Building2, Mail, Copy,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';

type KycStatus = 'pending' | 'in_review' | 'approved' | 'rejected';
type UserStatus = 'pending' | 'active' | 'suspended' | 'rejected';

interface ParticipantRow {
  id: string;
  email: string;
  name: string;
  company_name?: string;
  role: string;
  status: UserStatus;
  kyc_status: KycStatus;
  subscription_tier?: string;
  bbbee_level?: number;
  tenant_id?: string;
  email_verified?: number;
  last_login?: string;
  created_at: string;
}

interface ModuleRow {
  id?: string;
  module_key: string;
  display_name: string;
  description?: string;
  category?: string;
  enabled: number;
  required_role?: string | null;
  price_monthly?: number | null;
}

interface TenantRow {
  id: string;
  slug: string;
  display_name: string;
  description?: string | null;
  participant_count?: number;
  created_at: string;
}

interface AuditRow {
  id: string;
  actor_id: string;
  actor_name?: string;
  actor_role?: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  changes?: string;
  created_at: string;
}

interface StatsSnapshot {
  participants_by_status: Array<{ status: string; n: number }>;
  contracts_by_phase: Array<{ phase: string; n: number }>;
  trades_30d: { n?: number; volume_mwh?: number };
  invoices_by_status: Array<{ status: string; n: number; total: number }>;
}

interface BillingSnapshot {
  tiers: Array<{ subscription_tier: string; n: number }>;
  monthly_recurring_zar: number;
  rate_card: Record<string, number>;
}

type TabKey = 'overview' | 'kyc' | 'users' | 'modules' | 'tenants' | 'audit' | 'billing';

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'overview', label: 'Overview', icon: <BarChart2 className="w-4 h-4" /> },
  { key: 'kyc', label: 'KYC Queue', icon: <Shield className="w-4 h-4" /> },
  { key: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
  { key: 'modules', label: 'Modules', icon: <Settings className="w-4 h-4" /> },
  { key: 'tenants', label: 'Tenants', icon: <Building2 className="w-4 h-4" /> },
  { key: 'audit', label: 'Audit Logs', icon: <ClipboardList className="w-4 h-4" /> },
  { key: 'billing', label: 'Billing', icon: <DollarSign className="w-4 h-4" /> },
];

const STATUS_PILL: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  in_review: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  suspended: 'bg-gray-200 text-gray-700',
};

const formatZAR = (value: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value || 0);

export function Admin() {
  const [tab, setTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<StatsSnapshot | null>(null);
  const [kyc, setKyc] = useState<ParticipantRow[]>([]);
  const [kycFilter, setKycFilter] = useState<KycStatus>('pending');
  const [users, setUsers] = useState<ParticipantRow[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userDebounce, setUserDebounce] = useState('');
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const h = setTimeout(() => setUserDebounce(userSearch.trim()), 300);
    return () => clearTimeout(h);
  }, [userSearch]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'overview') {
        const res = await api.get('/admin/stats');
        setStats(res.data?.data || null);
      } else if (tab === 'kyc') {
        const res = await api.get(`/admin/kyc?status=${kycFilter}`);
        setKyc(res.data?.data || []);
      } else if (tab === 'users') {
        // Fetch tenants in parallel so the "Create user" tenant picker is
        // populated without requiring the admin to visit the Tenants tab
        // first (Devin Review finding — tenants list was otherwise empty).
        const qs = userDebounce ? `?q=${encodeURIComponent(userDebounce)}` : '';
        const [usersRes, tenantsRes] = await Promise.all([
          api.get(`/admin/users${qs}`),
          api.get('/admin/tenants'),
        ]);
        setUsers(usersRes.data?.data || []);
        setTenants(tenantsRes.data?.data || []);
      } else if (tab === 'modules') {
        const res = await api.get('/admin/modules');
        setModules(res.data?.data || []);
      } else if (tab === 'tenants') {
        const res = await api.get('/admin/tenants');
        setTenants(res.data?.data || []);
      } else if (tab === 'audit') {
        const res = await api.get('/admin/audit-logs?page_size=100');
        setAudit(res.data?.data || []);
      } else if (tab === 'billing') {
        const res = await api.get('/admin/billing');
        setBilling(res.data?.data || null);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, [tab, kycFilter, userDebounce]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const decideKyc = useCallback(async (id: string, next: KycStatus, notes?: string) => {
    try {
      await api.put(`/admin/kyc/${id}`, { kyc_status: next, notes });
      await fetchAll();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to update KYC');
    }
  }, [fetchAll]);

  const setUserStatus = useCallback(async (id: string, status: UserStatus) => {
    try {
      await api.put(`/admin/users/${id}`, { status });
      await fetchAll();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to update user');
    }
  }, [fetchAll]);

  const toggleModule = useCallback(async (key: string, enabled: boolean) => {
    try {
      await api.put(`/admin/modules/${key}`, { enabled });
      await fetchAll();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to toggle module');
    }
  }, [fetchAll]);

  const createModule = useCallback(async (input: { module_key: string; display_name: string; description?: string; price_monthly?: number; required_role?: string | null }) => {
    try {
      await api.post('/admin/modules', input);
      flashToast(`Module “${input.display_name}” created.`);
      await fetchAll();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to create module');
    }
  }, [fetchAll, flashToast]);

  const updateModule = useCallback(async (key: string, patch: Partial<ModuleRow>) => {
    try {
      await api.put(`/admin/modules/${key}`, patch);
      flashToast(`Module “${key}” updated.`);
      await fetchAll();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to update module');
    }
  }, [fetchAll, flashToast]);

  const deleteModule = useCallback(async (key: string) => {
    if (!window.confirm(`Delete module “${key}”? This clears per-participant overrides and cannot be undone.`)) return;
    try {
      await api.delete(`/admin/modules/${key}`);
      flashToast(`Module “${key}” deleted.`);
      await fetchAll();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to delete module');
    }
  }, [fetchAll, flashToast]);

  const createUser = useCallback(async (input: { email: string; name: string; role: string; company_name?: string; tenant_id?: string }) => {
    try {
      const res = await api.post('/admin/users', input);
      const url = res.data?.data?.reset_url;
      if (url) {
        try { await navigator.clipboard?.writeText(url); } catch { /* ignore */ }
        flashToast(`User created. Reset link copied to clipboard: ${url}`);
      } else {
        flashToast('User created.');
      }
      await fetchAll();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to create user');
    }
  }, [fetchAll, flashToast]);

  const deleteUser = useCallback(async (id: string, email: string) => {
    if (!window.confirm(`Suspend user ${email}? Active sessions will be revoked. (Rows are never deleted — integrity is preserved.)`)) return;
    try {
      await api.delete(`/admin/users/${id}`);
      flashToast(`User ${email} suspended.`);
      await fetchAll();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to suspend user');
    }
  }, [fetchAll, flashToast]);

  const issuePasswordReset = useCallback(async (id: string, email: string) => {
    try {
      const res = await api.post(`/admin/users/${id}/password-reset`, {});
      const url = res.data?.data?.reset_url;
      if (url) {
        try { await navigator.clipboard?.writeText(url); } catch { /* ignore */ }
        flashToast(`Reset link for ${email} copied to clipboard.`);
      } else {
        flashToast(`Reset link issued for ${email}.`);
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to issue reset link');
    }
  }, [flashToast]);

  const createTenant = useCallback(async (input: { display_name: string; slug?: string; description?: string }) => {
    try {
      await api.post('/admin/tenants', input);
      flashToast(`Tenant “${input.display_name}” created.`);
      await fetchAll();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to create tenant');
    }
  }, [fetchAll, flashToast]);

  const updateTenant = useCallback(async (id: string, patch: { display_name?: string; description?: string | null }) => {
    try {
      await api.put(`/admin/tenants/${id}`, patch);
      flashToast(`Tenant “${id}” updated.`);
      await fetchAll();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to update tenant');
    }
  }, [fetchAll, flashToast]);

  const deleteTenant = useCallback(async (id: string) => {
    if (!window.confirm(`Delete tenant “${id}”? Only tenants without participants can be deleted.`)) return;
    try {
      await api.delete(`/admin/tenants/${id}`);
      flashToast(`Tenant “${id}” deleted.`);
      await fetchAll();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to delete tenant');
    }
  }, [fetchAll, flashToast]);

  const overviewTiles = useMemo(() => {
    const total = (rows: Array<{ n: number }> = []) => rows.reduce((s, r) => s + Number(r.n || 0), 0);
    return [
      { label: 'Participants', value: total(stats?.participants_by_status) },
      { label: 'Contracts', value: total(stats?.contracts_by_phase) },
      { label: 'Trades (30d)', value: Number(stats?.trades_30d?.n || 0) },
      { label: 'MWh traded (30d)', value: Math.round(Number(stats?.trades_30d?.volume_mwh || 0)).toLocaleString() },
    ];
  }, [stats]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Admin</h1>
          <p className="text-ionex-text-mute">KYC queue, users, modules, audit logs, billing.</p>
        </div>
        <button onClick={fetchAll} className="p-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50" aria-label="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {overviewTiles.map(t => (
          <div key={t.label} className="p-4 bg-white border border-ionex-border-100 rounded-xl">
            <p className="text-xs uppercase tracking-wide text-ionex-text-mute">{t.label}</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{t.value}</p>
          </div>
        ))}
      </div>

      <div className="border-b border-ionex-border-100 flex gap-6 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 pb-3 border-b-2 transition-colors ${tab === t.key ? 'border-ionex-brand text-ionex-brand font-semibold' : 'border-transparent text-ionex-text-mute hover:text-gray-900'}`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {loading && <Skeleton variant="card" rows={4} />}
      {error && <ErrorBanner message={error} onRetry={fetchAll} />}

      {!loading && !error && tab === 'overview' && <OverviewPanel stats={stats} />}

      {!loading && !error && tab === 'kyc' && (
        <KycPanel kyc={kyc} filter={kycFilter} onFilterChange={setKycFilter} onDecide={decideKyc} />
      )}

      {!loading && !error && tab === 'users' && (
        <UsersPanel
          users={users}
          tenants={tenants}
          search={userSearch}
          onSearchChange={setUserSearch}
          onSetStatus={setUserStatus}
          onCreate={createUser}
          onDelete={deleteUser}
          onIssueReset={issuePasswordReset}
        />
      )}

      {!loading && !error && tab === 'modules' && (
        <ModulesPanel modules={modules} onToggle={toggleModule} onCreate={createModule} onUpdate={updateModule} onDelete={deleteModule} />
      )}

      {!loading && !error && tab === 'tenants' && (
        <TenantsPanel tenants={tenants} onCreate={createTenant} onUpdate={updateTenant} onDelete={deleteTenant} />
      )}

      {!loading && !error && tab === 'audit' && (
        <AuditPanel rows={audit} />
      )}

      {!loading && !error && tab === 'billing' && (
        <BillingPanel billing={billing} />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 max-w-md bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg text-sm flex items-start gap-3" role="status" aria-live="polite">
          <Copy className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="break-all">{toast}</span>
        </div>
      )}
    </div>
  );
}

function OverviewPanel({ stats }: { stats: StatsSnapshot | null }) {
  if (!stats) return <EmptyState icon={<BarChart2 className="w-8 h-8" />} title="No stats" description="Stats are being collected." />;
  const Section = ({ title, rows, valueKey }: { title: string; rows: any[]; valueKey: string }) => (
    <div className="p-5 bg-white rounded-xl border border-ionex-border-100">
      <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
      {(!rows || rows.length === 0) ? (
        <p className="text-sm text-ionex-text-mute">No data</p>
      ) : (
        <ul className="divide-y divide-ionex-border-100">
          {rows.map((r, i) => (
            <li key={i} className="py-2 flex justify-between text-sm">
              <span className="capitalize text-gray-700">{r[valueKey]}</span>
              <span className="font-semibold">{r.n}{r.total != null ? ` · ${formatZAR(r.total)}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Section title="Participants by status" rows={stats.participants_by_status} valueKey="status" />
      <Section title="Contracts by phase" rows={stats.contracts_by_phase} valueKey="phase" />
      <Section title="Invoices by status" rows={stats.invoices_by_status} valueKey="status" />
      <div className="p-5 bg-white rounded-xl border border-ionex-border-100">
        <h3 className="font-semibold text-gray-900 mb-3">Trade activity (30d)</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-ionex-text-mute">Matched trades</p>
            <p className="text-xl font-semibold">{Number(stats.trades_30d?.n || 0)}</p>
          </div>
          <div>
            <p className="text-ionex-text-mute">Volume (MWh)</p>
            <p className="text-xl font-semibold">{Math.round(Number(stats.trades_30d?.volume_mwh || 0)).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function KycPanel({ kyc, filter, onFilterChange, onDecide }: {
  kyc: ParticipantRow[];
  filter: KycStatus;
  onFilterChange: (v: KycStatus) => void;
  onDecide: (id: string, next: KycStatus, notes?: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(['pending', 'in_review', 'approved', 'rejected'] as KycStatus[]).map(s => (
          <button
            key={s}
            onClick={() => onFilterChange(s)}
            className={`px-3 py-1.5 rounded-full text-sm border ${filter === s ? 'bg-ionex-brand text-white border-ionex-brand' : 'bg-white border-ionex-border-200 text-gray-700 hover:bg-gray-50'}`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>
      {kyc.length === 0 ? (
        <EmptyState icon={<Shield className="w-8 h-8" />} title="No KYC requests" description={`No participants with status "${filter}".`} />
      ) : (
        <div className="bg-white rounded-xl border border-ionex-border-100 divide-y divide-ionex-border-100">
          {kyc.map(p => (
            <div key={p.id} className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{p.name}{p.company_name ? ` · ${p.company_name}` : ''}</p>
                <p className="text-sm text-ionex-text-mute">{p.email} · {p.role}</p>
                <p className="text-xs text-ionex-text-mute">Submitted {new Date(p.created_at).toLocaleString()}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {filter !== 'approved' && (
                  <button
                    onClick={() => onDecide(p.id, 'approved', 'KYC verified.')}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 flex items-center gap-1"
                  >
                    <CheckCircle className="w-4 h-4" /> Approve
                  </button>
                )}
                {filter !== 'in_review' && filter !== 'approved' && (
                  <button
                    onClick={() => onDecide(p.id, 'in_review', 'Requires additional review.')}
                    className="px-3 py-1.5 border border-blue-300 text-blue-700 rounded-lg text-sm hover:bg-blue-50 flex items-center gap-1"
                  >
                    <AlertTriangle className="w-4 h-4" /> Hold
                  </button>
                )}
                {filter !== 'rejected' && (
                  <button
                    onClick={() => {
                      const reason = prompt('Reason for rejection?') || 'KYC rejected.';
                      onDecide(p.id, 'rejected', reason);
                    }}
                    className="px-3 py-1.5 border border-red-300 text-red-700 rounded-lg text-sm hover:bg-red-50 flex items-center gap-1"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UsersPanel({ users, tenants, search, onSearchChange, onSetStatus, onCreate, onDelete, onIssueReset }: {
  users: ParticipantRow[];
  tenants: TenantRow[];
  search: string;
  onSearchChange: (v: string) => void;
  onSetStatus: (id: string, status: UserStatus) => void;
  onCreate: (input: { email: string; name: string; role: string; company_name?: string; tenant_id?: string }) => void;
  onDelete: (id: string, email: string) => void;
  onIssueReset: (id: string, email: string) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'offtaker', company_name: '', tenant_id: 'default' });
  const resetForm = () => setForm({ email: '', name: '', role: 'offtaker', company_name: '', tenant_id: 'default' });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search by name, email, or company"
          className="flex-1 min-w-[260px] max-w-md px-3 py-2 border border-ionex-border-200 rounded-lg"
        />
        <button
          onClick={() => { resetForm(); setShowCreate(true); }}
          className="px-3 py-2 bg-ionex-brand text-white rounded-lg text-sm hover:bg-ionex-brand-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Create user
        </button>
      </div>
      {showCreate && (
        <div className="p-4 bg-white border border-ionex-border-100 rounded-xl space-y-3">
          <h3 className="font-semibold text-gray-900">New user</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-ionex-text-mute">Email *</span>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg" placeholder="jane@example.co.za" />
            </label>
            <label className="text-sm">
              <span className="text-ionex-text-mute">Name *</span>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg" />
            </label>
            <label className="text-sm">
              <span className="text-ionex-text-mute">Role</span>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg bg-white">
                {['admin','trader','ipp_developer','offtaker','lender','carbon_fund','grid_operator','regulator','support'].map(r => (
                  <option key={r} value={r}>{r.replace('_',' ')}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-ionex-text-mute">Tenant</span>
              <select value={form.tenant_id} onChange={e => setForm({ ...form, tenant_id: e.target.value })} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg bg-white">
                <option value="default">default</option>
                {tenants.filter(t => t.id !== 'default').map(t => (
                  <option key={t.id} value={t.id}>{t.display_name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm md:col-span-2">
              <span className="text-ionex-text-mute">Company name (optional)</span>
              <input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg" />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm border border-ionex-border-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button
              disabled={!form.email || !form.name}
              onClick={() => {
                onCreate({
                  email: form.email.trim(),
                  name: form.name.trim(),
                  role: form.role,
                  company_name: form.company_name.trim() || undefined,
                  tenant_id: form.tenant_id,
                });
                setShowCreate(false);
                resetForm();
              }}
              className="px-3 py-2 text-sm bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Mail className="w-4 h-4" /> Create &amp; copy reset link
            </button>
          </div>
        </div>
      )}
      {users.length === 0 ? (
        <EmptyState icon={<Users className="w-8 h-8" />} title="No users" description="Try a different search." />
      ) : (
        <div className="bg-white rounded-xl border border-ionex-border-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-ionex-text-mute">
              <tr>
                <th className="p-3 font-medium">User</th>
                <th className="p-3 font-medium">Role</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">KYC</th>
                <th className="p-3 font-medium">Tier</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ionex-border-100">
              {users.map(u => (
                <tr key={u.id}>
                  <td className="p-3">
                    <p className="font-medium text-gray-900">{u.name}</p>
                    <p className="text-xs text-ionex-text-mute">{u.email}{u.company_name ? ` · ${u.company_name}` : ''}</p>
                  </td>
                  <td className="p-3 capitalize">{u.role.replace('_', ' ')}</td>
                  <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs ${STATUS_PILL[u.status] || 'bg-gray-100 text-gray-700'}`}>{u.status}</span></td>
                  <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs ${STATUS_PILL[u.kyc_status] || 'bg-gray-100 text-gray-700'}`}>{u.kyc_status}</span></td>
                  <td className="p-3 capitalize">{u.subscription_tier || '—'}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {u.status !== 'active' && (
                      <button onClick={() => onSetStatus(u.id, 'active')} className="text-xs text-green-700 hover:underline mr-3">Activate</button>
                    )}
                    {u.status !== 'suspended' && (
                      <button onClick={() => onSetStatus(u.id, 'suspended')} className="text-xs text-red-700 hover:underline mr-3">Suspend</button>
                    )}
                    <button onClick={() => onIssueReset(u.id, u.email)} className="text-xs text-blue-700 hover:underline mr-3">Reset link</button>
                    <button onClick={() => onDelete(u.id, u.email)} className="text-xs text-red-700 hover:underline" aria-label={`Suspend ${u.email}`}><Trash2 className="w-3.5 h-3.5 inline" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ModulesPanel({ modules, onToggle, onCreate, onUpdate, onDelete }: {
  modules: ModuleRow[];
  onToggle: (key: string, enabled: boolean) => void;
  onCreate: (input: { module_key: string; display_name: string; description?: string; price_monthly?: number; required_role?: string | null }) => void;
  onUpdate: (key: string, patch: Partial<ModuleRow>) => void;
  onDelete: (key: string) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [form, setForm] = useState({ module_key: '', display_name: '', description: '', price_monthly: '', required_role: '' });
  const [editForm, setEditForm] = useState({ display_name: '', description: '', price_monthly: '', required_role: '' });
  const resetForm = () => setForm({ module_key: '', display_name: '', description: '', price_monthly: '', required_role: '' });
  const beginEdit = (m: ModuleRow) => {
    setEditKey(m.module_key);
    setEditForm({
      display_name: m.display_name,
      description: m.description || '',
      price_monthly: m.price_monthly != null ? String(m.price_monthly) : '',
      required_role: m.required_role || '',
    });
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          onClick={() => { resetForm(); setShowCreate(true); }}
          className="px-3 py-2 bg-ionex-brand text-white rounded-lg text-sm hover:bg-ionex-brand-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add module
        </button>
      </div>
      {showCreate && (
        <div className="p-4 bg-white border border-ionex-border-100 rounded-xl space-y-3">
          <h3 className="font-semibold text-gray-900">New module</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-ionex-text-mute">Module key *</span>
              <input value={form.module_key} onChange={e => setForm({ ...form, module_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg font-mono" placeholder="ona_advanced" />
            </label>
            <label className="text-sm">
              <span className="text-ionex-text-mute">Display name *</span>
              <input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg" />
            </label>
            <label className="text-sm">
              <span className="text-ionex-text-mute">Price / month (ZAR)</span>
              <input type="number" min="0" value={form.price_monthly} onChange={e => setForm({ ...form, price_monthly: e.target.value })} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg" />
            </label>
            <label className="text-sm">
              <span className="text-ionex-text-mute">Required role (optional)</span>
              <input value={form.required_role} onChange={e => setForm({ ...form, required_role: e.target.value })} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg" placeholder="admin" />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="text-ionex-text-mute">Description</span>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg" />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm border border-ionex-border-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button
              disabled={!form.module_key || !form.display_name}
              onClick={() => {
                onCreate({
                  module_key: form.module_key.trim(),
                  display_name: form.display_name.trim(),
                  description: form.description.trim() || undefined,
                  price_monthly: form.price_monthly ? Number(form.price_monthly) : undefined,
                  required_role: form.required_role.trim() || null,
                });
                setShowCreate(false);
                resetForm();
              }}
              className="px-3 py-2 text-sm bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-700 disabled:opacity-50"
            >Create module</button>
          </div>
        </div>
      )}
      {modules.length === 0 ? (
        <EmptyState icon={<Settings className="w-8 h-8" />} title="No modules" description="Module catalogue is empty. Use “Add module” to create one." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {modules.map(m => (
            <div key={m.module_key} className="p-4 bg-white border border-ionex-border-100 rounded-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{m.display_name}</p>
                  <p className="text-xs text-ionex-text-mute">{m.module_key}{m.category ? ` · ${m.category}` : ''}{m.required_role ? ` · requires ${m.required_role}` : ''}{m.price_monthly != null ? ` · ${formatZAR(Number(m.price_monthly))}/mo` : ''}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input type="checkbox" checked={!!m.enabled} onChange={e => onToggle(m.module_key, e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-300 peer-checked:bg-ionex-brand rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
                </label>
              </div>
              {editKey === m.module_key ? (
                <div className="mt-3 space-y-2 border-t border-ionex-border-100 pt-3">
                  <input value={editForm.display_name} onChange={e => setEditForm({ ...editForm, display_name: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-ionex-border-200 rounded" placeholder="Display name" />
                  <textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={2} className="w-full px-2 py-1.5 text-sm border border-ionex-border-200 rounded" placeholder="Description" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" min="0" value={editForm.price_monthly} onChange={e => setEditForm({ ...editForm, price_monthly: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-ionex-border-200 rounded" placeholder="Price / month" />
                    <input value={editForm.required_role} onChange={e => setEditForm({ ...editForm, required_role: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-ionex-border-200 rounded" placeholder="Required role" />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setEditKey(null)} className="text-xs text-gray-700 hover:underline">Cancel</button>
                    <button
                      onClick={() => {
                        onUpdate(m.module_key, {
                          display_name: editForm.display_name.trim(),
                          description: editForm.description.trim(),
                          price_monthly: editForm.price_monthly ? Number(editForm.price_monthly) : null,
                          required_role: editForm.required_role.trim() || null,
                        });
                        setEditKey(null);
                      }}
                      className="text-xs text-ionex-brand hover:underline"
                    >Save</button>
                  </div>
                </div>
              ) : (
                <>
                  {m.description && <p className="text-sm text-gray-600 mt-2">{m.description}</p>}
                  <div className="mt-3 flex gap-3">
                    <button onClick={() => beginEdit(m)} className="text-xs text-blue-700 hover:underline flex items-center gap-1"><Edit3 className="w-3.5 h-3.5" /> Edit</button>
                    <button onClick={() => onDelete(m.module_key)} className="text-xs text-red-700 hover:underline flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TenantsPanel({ tenants, onCreate, onUpdate, onDelete }: {
  tenants: TenantRow[];
  onCreate: (input: { display_name: string; slug?: string; description?: string }) => void;
  onUpdate: (id: string, patch: { display_name?: string; description?: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ display_name: '', slug: '', description: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ display_name: '', description: '' });
  const resetForm = () => setForm({ display_name: '', slug: '', description: '' });
  const beginEdit = (t: TenantRow) => {
    setEditId(t.id);
    setEditForm({ display_name: t.display_name, description: t.description || '' });
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ionex-text-mute">Tenants isolate participants, contracts, trades, and reports. The <code>default</code> tenant is reserved and cannot be deleted.</p>
        <button
          onClick={() => { resetForm(); setShowCreate(true); }}
          className="px-3 py-2 bg-ionex-brand text-white rounded-lg text-sm hover:bg-ionex-brand-700 flex items-center gap-2 flex-shrink-0"
        >
          <Plus className="w-4 h-4" /> New tenant
        </button>
      </div>
      {showCreate && (
        <div className="p-4 bg-white border border-ionex-border-100 rounded-xl space-y-3">
          <h3 className="font-semibold text-gray-900">New tenant</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-ionex-text-mute">Display name *</span>
              <input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg" placeholder="Vantax Group" />
            </label>
            <label className="text-sm">
              <span className="text-ionex-text-mute">Slug (optional)</span>
              <input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg font-mono" placeholder="vantax-group" />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="text-ionex-text-mute">Description</span>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg" />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm border border-ionex-border-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button
              disabled={!form.display_name}
              onClick={() => {
                onCreate({
                  display_name: form.display_name.trim(),
                  slug: form.slug.trim() || undefined,
                  description: form.description.trim() || undefined,
                });
                setShowCreate(false);
                resetForm();
              }}
              className="px-3 py-2 text-sm bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-700 disabled:opacity-50"
            >Create tenant</button>
          </div>
        </div>
      )}
      {tenants.length === 0 ? (
        <EmptyState icon={<Building2 className="w-8 h-8" />} title="No tenants" description="No tenants seeded yet." />
      ) : (
        <div className="bg-white rounded-xl border border-ionex-border-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-ionex-text-mute">
              <tr>
                <th className="p-3 font-medium">Tenant</th>
                <th className="p-3 font-medium">Slug</th>
                <th className="p-3 font-medium">Members</th>
                <th className="p-3 font-medium">Created</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ionex-border-100">
              {tenants.map(t => (
                <tr key={t.id}>
                  <td className="p-3">
                    {editId === t.id ? (
                      <div className="space-y-2">
                        <input value={editForm.display_name} onChange={e => setEditForm({ ...editForm, display_name: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-ionex-border-200 rounded" />
                        <textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={2} className="w-full px-2 py-1.5 text-sm border border-ionex-border-200 rounded" placeholder="Description" />
                      </div>
                    ) : (
                      <div>
                        <p className="font-medium text-gray-900 flex items-center gap-2"><Building2 className="w-4 h-4 text-ionex-text-mute" />{t.display_name}</p>
                        {t.description && <p className="text-xs text-ionex-text-mute mt-0.5">{t.description}</p>}
                      </div>
                    )}
                  </td>
                  <td className="p-3 font-mono text-xs text-ionex-text-mute">{t.slug}</td>
                  <td className="p-3">{t.participant_count ?? 0}</td>
                  <td className="p-3 text-xs text-ionex-text-mute">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {editId === t.id ? (
                      <>
                        <button onClick={() => setEditId(null)} className="text-xs text-gray-700 hover:underline mr-3">Cancel</button>
                        <button
                          onClick={() => {
                            onUpdate(t.id, {
                              display_name: editForm.display_name.trim(),
                              description: editForm.description.trim() || null,
                            });
                            setEditId(null);
                          }}
                          className="text-xs text-ionex-brand hover:underline"
                        >Save</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => beginEdit(t)} className="text-xs text-blue-700 hover:underline mr-3"><Edit3 className="w-3.5 h-3.5 inline mr-1" />Edit</button>
                        {t.id !== 'default' && (
                          <button
                            onClick={() => onDelete(t.id)}
                            disabled={(t.participant_count ?? 0) > 0}
                            title={(t.participant_count ?? 0) > 0 ? 'Move or suspend tenant members before deleting' : 'Delete tenant'}
                            className="text-xs text-red-700 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                          ><Trash2 className="w-3.5 h-3.5 inline mr-1" />Delete</button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AuditPanel({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) return <EmptyState icon={<ClipboardList className="w-8 h-8" />} title="No audit entries" description="No actions have been logged yet." />;
  return (
    <div className="bg-white rounded-xl border border-ionex-border-100 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-ionex-text-mute">
          <tr>
            <th className="p-3 font-medium">When</th>
            <th className="p-3 font-medium">Actor</th>
            <th className="p-3 font-medium">Action</th>
            <th className="p-3 font-medium">Entity</th>
            <th className="p-3 font-medium">Changes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ionex-border-100">
          {rows.map(r => (
            <tr key={r.id}>
              <td className="p-3 text-ionex-text-mute">{new Date(r.created_at).toLocaleString()}</td>
              <td className="p-3">
                <p className="font-medium text-gray-900">{r.actor_name || r.actor_id}</p>
                {r.actor_role && <p className="text-xs text-ionex-text-mute capitalize">{r.actor_role.replace('_', ' ')}</p>}
              </td>
              <td className="p-3 font-mono text-xs">{r.action}</td>
              <td className="p-3 font-mono text-xs">{r.entity_type}{r.entity_id ? ` · ${r.entity_id}` : ''}</td>
              <td className="p-3 font-mono text-xs max-w-xs truncate" title={r.changes || ''}>{r.changes || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BillingPanel({ billing }: { billing: BillingSnapshot | null }) {
  if (!billing) return <EmptyState icon={<DollarSign className="w-8 h-8" />} title="No billing data" description="Billing snapshot is empty." />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="p-5 bg-white border border-ionex-border-100 rounded-xl">
        <p className="text-xs uppercase tracking-wide text-ionex-text-mute">Monthly recurring revenue</p>
        <p className="text-3xl font-bold text-gray-900 mt-2">{formatZAR(billing.monthly_recurring_zar)}</p>
        <p className="text-xs text-ionex-text-mute mt-1">Based on active participants × tier rate</p>
      </div>
      <div className="p-5 bg-white border border-ionex-border-100 rounded-xl">
        <p className="font-semibold text-gray-900 mb-3">Tier rate card</p>
        <ul className="text-sm space-y-1">
          {Object.entries(billing.rate_card).map(([tier, rate]) => (
            <li key={tier} className="flex justify-between">
              <span className="capitalize text-gray-700">{tier}</span>
              <span className="font-mono">{formatZAR(Number(rate))}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="p-5 bg-white border border-ionex-border-100 rounded-xl md:col-span-2">
        <p className="font-semibold text-gray-900 mb-3">Active participants by tier</p>
        {billing.tiers.length === 0 ? (
          <p className="text-sm text-ionex-text-mute">No active participants.</p>
        ) : (
          <ul className="divide-y divide-ionex-border-100">
            {billing.tiers.map(t => {
              const rate = billing.rate_card[t.subscription_tier] || 0;
              return (
                <li key={t.subscription_tier} className="py-2 flex justify-between text-sm">
                  <span className="capitalize text-gray-700">{t.subscription_tier || '—'}</span>
                  <span className="font-mono">{t.n} × {formatZAR(rate)} = {formatZAR(rate * Number(t.n || 0))}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
