import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, Settings, Shield, Activity, DollarSign, RefreshCw,
  ClipboardList, BarChart2, AlertTriangle, CheckCircle, XCircle,
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
  module_key: string;
  display_name: string;
  description?: string;
  category?: string;
  enabled: number;
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

type TabKey = 'overview' | 'kyc' | 'users' | 'modules' | 'audit' | 'billing';

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'overview', label: 'Overview', icon: <BarChart2 className="w-4 h-4" /> },
  { key: 'kyc', label: 'KYC Queue', icon: <Shield className="w-4 h-4" /> },
  { key: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
  { key: 'modules', label: 'Modules', icon: <Settings className="w-4 h-4" /> },
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
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);

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
        const qs = userDebounce ? `?q=${encodeURIComponent(userDebounce)}` : '';
        const res = await api.get(`/admin/users${qs}`);
        setUsers(res.data?.data || []);
      } else if (tab === 'modules') {
        const res = await api.get('/admin/modules');
        setModules(res.data?.data || []);
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
        <UsersPanel users={users} search={userSearch} onSearchChange={setUserSearch} onSetStatus={setUserStatus} />
      )}

      {!loading && !error && tab === 'modules' && (
        <ModulesPanel modules={modules} onToggle={toggleModule} />
      )}

      {!loading && !error && tab === 'audit' && (
        <AuditPanel rows={audit} />
      )}

      {!loading && !error && tab === 'billing' && (
        <BillingPanel billing={billing} />
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

function UsersPanel({ users, search, onSearchChange, onSetStatus }: {
  users: ParticipantRow[];
  search: string;
  onSearchChange: (v: string) => void;
  onSetStatus: (id: string, status: UserStatus) => void;
}) {
  return (
    <div className="space-y-3">
      <input
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="Search by name, email, or company"
        className="w-full max-w-md px-3 py-2 border border-ionex-border-200 rounded-lg"
      />
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
                  <td className="p-3 text-right">
                    {u.status !== 'active' && (
                      <button onClick={() => onSetStatus(u.id, 'active')} className="text-xs text-green-700 hover:underline mr-3">Activate</button>
                    )}
                    {u.status !== 'suspended' && (
                      <button onClick={() => onSetStatus(u.id, 'suspended')} className="text-xs text-red-700 hover:underline">Suspend</button>
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

function ModulesPanel({ modules, onToggle }: { modules: ModuleRow[]; onToggle: (key: string, enabled: boolean) => void; }) {
  if (modules.length === 0) return <EmptyState icon={<Settings className="w-8 h-8" />} title="No modules" description="Module catalogue is empty." />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {modules.map(m => (
        <div key={m.module_key} className="p-4 bg-white border border-ionex-border-100 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">{m.display_name}</p>
              <p className="text-xs text-ionex-text-mute">{m.module_key}{m.category ? ` · ${m.category}` : ''}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={!!m.enabled} onChange={e => onToggle(m.module_key, e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-300 peer-checked:bg-ionex-brand rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
            </label>
          </div>
          {m.description && <p className="text-sm text-gray-600 mt-2">{m.description}</p>}
        </div>
      ))}
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
