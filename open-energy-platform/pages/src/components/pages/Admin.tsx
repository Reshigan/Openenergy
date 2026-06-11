import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Users, Settings, Shield, Activity, DollarSign, RefreshCw,
  ClipboardList, BarChart2, AlertTriangle, CheckCircle, XCircle,
  Plus, Trash2, Edit3, Building2, Mail, Copy,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';

// ─── Design tokens ───────────────────────────────────────────────────────────
const BG      = 'oklch(0.96 0.003 250)';
const BG1     = 'oklch(0.99 0.002 80)';
const BG2     = 'oklch(0.93 0.004 250)';
const BORDER  = 'oklch(0.87 0.006 250)';
const TX1     = 'oklch(0.17 0.010 250)';
const TX2     = 'oklch(0.40 0.009 250)';
const TX3     = 'oklch(0.60 0.007 250)';
const ACC     = 'oklch(0.46 0.16 55)';
const ACC_BG  = 'oklch(0.96 0.05 55)';
const BAD     = 'oklch(0.48 0.20 20)';
const BAD_BG  = 'oklch(0.97 0.04 20)';
const WARN    = 'oklch(0.50 0.18 55)';
const WARN_BG = 'oklch(0.96 0.05 55)';
const GOOD    = 'oklch(0.40 0.16 155)';
const GOOD_BG = 'oklch(0.95 0.04 155)';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

// ─── Types ────────────────────────────────────────────────────────────────────
type KycStatus  = 'pending' | 'in_review' | 'approved' | 'rejected';
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
  { key: 'overview', label: 'Overview',   icon: <BarChart2   size={14} /> },
  { key: 'kyc',      label: 'KYC Queue',  icon: <Shield      size={14} /> },
  { key: 'users',    label: 'Users',      icon: <Users       size={14} /> },
  { key: 'modules',  label: 'Modules',    icon: <Settings    size={14} /> },
  { key: 'tenants',  label: 'Tenants',    icon: <Building2   size={14} /> },
  { key: 'audit',    label: 'Audit Logs', icon: <ClipboardList size={14} /> },
  { key: 'billing',  label: 'Billing',    icon: <DollarSign  size={14} /> },
];

const formatZAR = (value: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value || 0);

function statusPill(s: string): React.CSSProperties {
  if (s === 'active' || s === 'approved')   return { background: GOOD_BG, color: GOOD };
  if (s === 'pending' || s === 'in_review') return { background: WARN_BG, color: WARN };
  if (s === 'rejected' || s === 'suspended') return { background: BAD_BG, color: BAD };
  return { background: BG2, color: TX2 };
}

// ─── Main component ────────────────────────────────────────────────────────────
export function Admin() {
  const [tab, setTab]           = useState<TabKey>('overview');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const [stats,   setStats]   = useState<StatsSnapshot | null>(null);
  const [kyc,     setKyc]     = useState<ParticipantRow[]>([]);
  const [kycFilter, setKycFilter] = useState<KycStatus>('pending');
  const [users,   setUsers]   = useState<ParticipantRow[]>([]);
  const [userSearch,  setUserSearch]  = useState('');
  const [userDebounce, setUserDebounce] = useState('');
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [audit,   setAudit]   = useState<AuditRow[]>([]);
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);
  const [toast,   setToast]   = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 4000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

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
    } catch (err: any) { alert(err?.response?.data?.error || 'Failed to update KYC'); }
  }, [fetchAll]);

  const setUserStatus = useCallback(async (id: string, status: UserStatus) => {
    try {
      await api.put(`/admin/users/${id}`, { status });
      await fetchAll();
    } catch (err: any) { alert(err?.response?.data?.error || 'Failed to update user'); }
  }, [fetchAll]);

  const toggleModule = useCallback(async (key: string, enabled: boolean) => {
    try {
      await api.put(`/admin/modules/${key}`, { enabled });
      await fetchAll();
    } catch (err: any) { alert(err?.response?.data?.error || 'Failed to toggle module'); }
  }, [fetchAll]);

  const createModule = useCallback(async (input: { module_key: string; display_name: string; description?: string; price_monthly?: number; required_role?: string | null }) => {
    try {
      await api.post('/admin/modules', input);
      flashToast(`Module "${input.display_name}" created.`);
      await fetchAll();
    } catch (err: any) { alert(err?.response?.data?.error || 'Failed to create module'); }
  }, [fetchAll, flashToast]);

  const updateModule = useCallback(async (key: string, patch: Partial<ModuleRow>) => {
    try {
      await api.put(`/admin/modules/${key}`, patch);
      flashToast(`Module "${key}" updated.`);
      await fetchAll();
    } catch (err: any) { alert(err?.response?.data?.error || 'Failed to update module'); }
  }, [fetchAll, flashToast]);

  const deleteModule = useCallback(async (key: string) => {
    if (!window.confirm(`Delete module "${key}"? This clears per-participant overrides and cannot be undone.`)) return;
    try {
      await api.delete(`/admin/modules/${key}`);
      flashToast(`Module "${key}" deleted.`);
      await fetchAll();
    } catch (err: any) { alert(err?.response?.data?.error || 'Failed to delete module'); }
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
    } catch (err: any) { alert(err?.response?.data?.error || 'Failed to create user'); }
  }, [fetchAll, flashToast]);

  const deleteUser = useCallback(async (id: string, email: string) => {
    if (!window.confirm(`Suspend user ${email}? Active sessions will be revoked. (Rows are never deleted — integrity is preserved.)`)) return;
    try {
      await api.delete(`/admin/users/${id}`);
      flashToast(`User ${email} suspended.`);
      await fetchAll();
    } catch (err: any) { alert(err?.response?.data?.error || 'Failed to suspend user'); }
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
    } catch (err: any) { alert(err?.response?.data?.error || 'Failed to issue reset link'); }
  }, [flashToast]);

  const createTenant = useCallback(async (input: { display_name: string; slug?: string; description?: string }) => {
    try {
      await api.post('/admin/tenants', input);
      flashToast(`Tenant "${input.display_name}" created.`);
      await fetchAll();
    } catch (err: any) { alert(err?.response?.data?.error || 'Failed to create tenant'); }
  }, [fetchAll, flashToast]);

  const updateTenant = useCallback(async (id: string, patch: { display_name?: string; description?: string | null }) => {
    try {
      await api.put(`/admin/tenants/${id}`, patch);
      flashToast(`Tenant "${id}" updated.`);
      await fetchAll();
    } catch (err: any) { alert(err?.response?.data?.error || 'Failed to update tenant'); }
  }, [fetchAll, flashToast]);

  const deleteTenant = useCallback(async (id: string) => {
    if (!window.confirm(`Delete tenant "${id}"? Only tenants without participants can be deleted.`)) return;
    try {
      await api.delete(`/admin/tenants/${id}`);
      flashToast(`Tenant "${id}" deleted.`);
      await fetchAll();
    } catch (err: any) { alert(err?.response?.data?.error || 'Failed to delete tenant'); }
  }, [fetchAll, flashToast]);

  const overviewTiles = useMemo(() => {
    const total = (rows: Array<{ n: number }> = []) => rows.reduce((s, r) => s + Number(r.n || 0), 0);
    return [
      { label: 'Participants',     value: total(stats?.participants_by_status) },
      { label: 'Contracts',        value: total(stats?.contracts_by_phase) },
      { label: 'Trades (30d)',     value: Number(stats?.trades_30d?.n || 0) },
      { label: 'MWh (30d)',        value: Math.round(Number(stats?.trades_30d?.volume_mwh || 0)).toLocaleString() },
    ];
  }, [stats]);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      height: 'calc(100vh - 50px)',
      background: BG,
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* ── LEFT COLUMN ──────────────────────────────────────────────────── */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>Platform Admin</h1>
              <p style={{ fontSize: 13, color: TX2, margin: '4px 0 0' }}>KYC queue · users · modules · audit logs · billing</p>
            </div>
            <button
              type="button"
              onClick={fetchAll}
              aria-label="Refresh"
              style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: TX2, fontSize: 13 }}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {overviewTiles.map(t => (
            <div key={t.label} style={{
              background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: '12px 16px', flex: 1, minWidth: 100,
            }}>
              <div style={{ fontSize: 10, color: TX3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{t.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>{t.value}</div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: `2px solid ${BORDER}`, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? ACC : TX2,
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${tab === t.key ? ACC : 'transparent'}`,
                marginBottom: -2,
                cursor: 'pointer',
                transition: 'color 0.15s',
              }}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Content area */}
        {loading && <Skeleton variant="card" rows={4} />}
        {error   && <ErrorBanner message={error} onRetry={fetchAll} />}

        {!loading && !error && tab === 'overview' && <OverviewPanel stats={stats} />}
        {!loading && !error && tab === 'kyc' && (
          <KycPanel kyc={kyc} filter={kycFilter} onFilterChange={setKycFilter} onDecide={decideKyc} />
        )}
        {!loading && !error && tab === 'users' && (
          <UsersPanel
            users={users} tenants={tenants}
            search={userSearch} onSearchChange={setUserSearch}
            onSetStatus={setUserStatus} onCreate={createUser}
            onDelete={deleteUser} onIssueReset={issuePasswordReset}
          />
        )}
        {!loading && !error && tab === 'modules' && (
          <ModulesPanel modules={modules} onToggle={toggleModule} onCreate={createModule} onUpdate={updateModule} onDelete={deleteModule} />
        )}
        {!loading && !error && tab === 'tenants' && (
          <TenantsPanel tenants={tenants} onCreate={createTenant} onUpdate={updateTenant} onDelete={deleteTenant} />
        )}
        {!loading && !error && tab === 'audit' && <AuditPanel rows={audit} />}
        {!loading && !error && tab === 'billing' && <BillingPanel billing={billing} />}
      </div>

      {/* ── RIGHT COLUMN ─────────────────────────────────────────────────── */}
      <div style={{
        borderLeft: `1px solid ${BORDER}`,
        background: BG1,
        overflowY: 'auto',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Section label */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Shield size={16} style={{ color: ACC }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Admin Panel</span>
          </div>
          <p style={{ fontSize: 12, color: TX3, margin: 0 }}>Platform administration and configuration controls.</p>
        </div>

        {/* Active tab context */}
        <div style={{ background: ACC_BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Active View</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: ACC, display: 'flex' }}>
              {TABS.find(t => t.key === tab)?.icon}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: TX1 }}>{TABS.find(t => t.key === tab)?.label}</span>
          </div>
        </div>

        {/* KYC filter — shown when on kyc tab */}
        {tab === 'kyc' && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>KYC Filter</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(['pending', 'in_review', 'approved', 'rejected'] as KycStatus[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setKycFilter(s)}
                  style={{
                    textAlign: 'left',
                    padding: '7px 12px',
                    borderRadius: 6,
                    border: `1px solid ${kycFilter === s ? ACC : BORDER}`,
                    background: kycFilter === s ? ACC_BG : 'transparent',
                    color: kycFilter === s ? ACC : TX2,
                    fontSize: 13,
                    fontWeight: kycFilter === s ? 600 : 400,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* User search — shown when on users tab */}
        {tab === 'users' && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Search Users</div>
            <input
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              placeholder="Name, email, or company…"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '8px 10px', border: `1px solid ${BORDER}`,
                borderRadius: 6, fontSize: 13, color: TX1,
                background: BG2, outline: 'none',
              }}
            />
          </div>
        )}

        {/* Quick navigation */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Navigate</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TABS.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', borderRadius: 6,
                  border: 'none',
                  background: tab === t.key ? ACC_BG : 'transparent',
                  color: tab === t.key ? ACC : TX2,
                  fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ color: tab === t.key ? ACC : TX3, display: 'flex' }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Platform stats summary */}
        {stats && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Participant Status</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {(stats.participants_by_status || []).map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: TX2, textTransform: 'capitalize' }}>{r.status}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, fontFamily: MONO,
                    ...statusPill(r.status),
                    padding: '2px 8px', borderRadius: 10,
                  }}>{r.n}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Billing MRR quick-view */}
        {billing && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Monthly Recurring</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: TX1, fontFamily: MONO }}>{formatZAR(billing.monthly_recurring_zar)}</div>
            <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>active participants × tier rate</div>
          </div>
        )}
      </div>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed', bottom: 24, right: 24, maxWidth: 420,
            background: TX1, color: '#fff',
            padding: '12px 16px', borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
            fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 10, zIndex: 9999,
          }}
        >
          <Copy size={14} style={{ marginTop: 2, flexShrink: 0 }} />
          <span style={{ wordBreak: 'break-all' }}>{toast}</span>
        </div>
      )}
    </div>
  );
}

export default Admin;

// ─── Sub-panels ───────────────────────────────────────────────────────────────

function OverviewPanel({ stats }: { stats: StatsSnapshot | null }) {
  if (!stats) return <EmptyState icon={<BarChart2 className="w-8 h-8" />} title="No stats" description="Stats are being collected." />;

  const Section = ({ title, rows, valueKey }: { title: string; rows: any[]; valueKey: string }) => (
    <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{title}</div>
      {(!rows || rows.length === 0) ? (
        <p style={{ fontSize: 13, color: TX3 }}>No data</p>
      ) : (
        <div>
          {rows.map((r, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '8px 0',
              borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : 'none',
              fontSize: 13,
            }}>
              <span style={{ color: TX2, textTransform: 'capitalize' }}>{r[valueKey]}</span>
              <span style={{ fontFamily: MONO, fontWeight: 600, color: TX1 }}>
                {r.n}{r.total != null ? ` · ${formatZAR(r.total)}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <Section title="Participants by status" rows={stats.participants_by_status} valueKey="status" />
      <Section title="Contracts by phase"     rows={stats.contracts_by_phase}     valueKey="phase"  />
      <Section title="Invoices by status"     rows={stats.invoices_by_status}     valueKey="status" />
      <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Trade Activity (30d)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: TX3, marginBottom: 2 }}>Matched trades</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: TX1, fontFamily: MONO }}>{Number(stats.trades_30d?.n || 0)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: TX3, marginBottom: 2 }}>Volume (MWh)</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: TX1, fontFamily: MONO }}>{Math.round(Number(stats.trades_30d?.volume_mwh || 0)).toLocaleString()}</div>
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
  const [rejectTarget, setRejectTarget] = useState<ParticipantRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  return (
    <div>
      {/* Reject modal */}
      {rejectTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000,
        }}>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 24, width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: TX1, marginBottom: 6 }}>Reject KYC</div>
            <div style={{ fontSize: 13, color: TX2, marginBottom: 12 }}>{rejectTarget.name} — {rejectTarget.email}</div>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Reason for rejection…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, color: TX1, background: BG2, resize: 'vertical', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => { setRejectTarget(null); setRejectReason(''); }}
                style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: TX2, fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button"
                onClick={() => {
                  onDecide(rejectTarget.id, 'rejected', rejectReason || 'KYC rejected.');
                  setRejectTarget(null);
                  setRejectReason('');
                }}
                style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: BAD, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {kyc.length === 0 ? (
        <EmptyState icon={<Shield className="w-8 h-8" />} title="No KYC requests" description={`No participants with status "${filter}".`} />
      ) : (
        <div>
          {kyc.map((p, i) => (
            <div key={p.id} style={{
              background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: '14px 16px', marginBottom: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: TX1 }}>{p.name}{p.company_name ? ` · ${p.company_name}` : ''}</div>
                  <div style={{ fontSize: 12, color: TX2, marginTop: 2 }}>{p.email} · {p.role}</div>
                  <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>Submitted {new Date(p.created_at).toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ ...statusPill(p.kyc_status), padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{p.kyc_status}</span>
                  {filter !== 'approved' && (
                    <button type="button"
                      onClick={() => onDecide(p.id, 'approved', 'KYC verified.')}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: 'none', background: GOOD, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      <CheckCircle size={13} /> Approve
                    </button>
                  )}
                  {filter !== 'in_review' && filter !== 'approved' && (
                    <button type="button"
                      onClick={() => onDecide(p.id, 'in_review', 'Requires additional review.')}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: WARN_BG, color: WARN, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      <AlertTriangle size={13} /> Hold
                    </button>
                  )}
                  {filter !== 'rejected' && (
                    <button type="button"
                      onClick={() => { setRejectTarget(p); setRejectReason(''); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BAD_BG, color: BAD, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      <XCircle size={13} /> Reject
                    </button>
                  )}
                </div>
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
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button type="button"
          onClick={() => { resetForm(); setShowCreate(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, border: 'none', background: ACC, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> Create user
        </button>
      </div>

      {showCreate && (
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '18px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TX1, marginBottom: 14 }}>New user</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ fontSize: 12 }}>
              <span style={{ color: TX2, display: 'block', marginBottom: 4 }}>Email *</span>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="jane@example.co.za"
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, color: TX1, background: BG2 }} />
            </label>
            <label style={{ fontSize: 12 }}>
              <span style={{ color: TX2, display: 'block', marginBottom: 4 }}>Name *</span>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, color: TX1, background: BG2 }} />
            </label>
            <label style={{ fontSize: 12 }}>
              <span style={{ color: TX2, display: 'block', marginBottom: 4 }}>Role</span>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, color: TX1, background: BG2 }}>
                {['admin','trader','ipp_developer','offtaker','lender','carbon_fund','grid_operator','regulator','support'].map(r => (
                  <option key={r} value={r}>{r.replace('_', ' ')}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12 }}>
              <span style={{ color: TX2, display: 'block', marginBottom: 4 }}>Tenant</span>
              <select value={form.tenant_id} onChange={e => setForm({ ...form, tenant_id: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, color: TX1, background: BG2 }}>
                <option value="default">default</option>
                {tenants.filter(t => t.id !== 'default').map(t => (
                  <option key={t.id} value={t.id}>{t.display_name}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, gridColumn: '1 / -1' }}>
              <span style={{ color: TX2, display: 'block', marginBottom: 4 }}>Company name (optional)</span>
              <input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, color: TX1, background: BG2 }} />
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={() => setShowCreate(false)}
              style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: TX2, fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="button"
              disabled={!form.email || !form.name}
              onClick={() => {
                onCreate({ email: form.email.trim(), name: form.name.trim(), role: form.role, company_name: form.company_name.trim() || undefined, tenant_id: form.tenant_id });
                setShowCreate(false);
                resetForm();
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, border: 'none', background: ACC, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (!form.email || !form.name) ? 0.5 : 1 }}>
              <Mail size={13} /> Create &amp; copy reset link
            </button>
          </div>
        </div>
      )}

      {users.length === 0 ? (
        <EmptyState icon={<Users className="w-8 h-8" />} title="No users" description="Try a different search." />
      ) : (
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BORDER}`, background: BG2 }}>
                {['User', 'Role', 'Status', 'KYC', 'Tier', 'Actions'].map((h, i) => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: i === 5 ? 'right' : 'left', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600, color: TX1 }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: TX3 }}>{u.email}{u.company_name ? ` · ${u.company_name}` : ''}</div>
                  </td>
                  <td style={{ padding: '10px 12px', color: TX2, textTransform: 'capitalize', fontSize: 12 }}>{u.role.replace('_', ' ')}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ ...statusPill(u.status), padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{u.status}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ ...statusPill(u.kyc_status), padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{u.kyc_status}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: TX2, fontSize: 12, textTransform: 'capitalize' }}>{u.subscription_tier || '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {u.status !== 'active' && (
                      <button type="button" onClick={() => onSetStatus(u.id, 'active')}
                        style={{ background: 'none', border: 'none', color: GOOD, fontSize: 12, cursor: 'pointer', marginRight: 8 }}>Activate</button>
                    )}
                    {u.status !== 'suspended' && (
                      <button type="button" onClick={() => onSetStatus(u.id, 'suspended')}
                        style={{ background: 'none', border: 'none', color: BAD, fontSize: 12, cursor: 'pointer', marginRight: 8 }}>Suspend</button>
                    )}
                    <button type="button" onClick={() => onIssueReset(u.id, u.email)}
                      style={{ background: 'none', border: 'none', color: ACC, fontSize: 12, cursor: 'pointer', marginRight: 8 }}>Reset link</button>
                    <button type="button" onClick={() => onDelete(u.id, u.email)} aria-label={`Suspend ${u.email}`}
                      style={{ background: 'none', border: 'none', color: BAD, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                      <Trash2 size={13} />
                    </button>
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
  const [editKey,   setEditKey]   = useState<string | null>(null);
  const [form,     setForm]     = useState({ module_key: '', display_name: '', description: '', price_monthly: '', required_role: '' });
  const [editForm, setEditForm] = useState({ display_name: '', description: '', price_monthly: '', required_role: '' });
  const resetForm = () => setForm({ module_key: '', display_name: '', description: '', price_monthly: '', required_role: '' });
  const beginEdit = (m: ModuleRow) => {
    setEditKey(m.module_key);
    setEditForm({ display_name: m.display_name, description: m.description || '', price_monthly: m.price_monthly != null ? String(m.price_monthly) : '', required_role: m.required_role || '' });
  };

  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, color: TX1, background: BG2 };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button type="button"
          onClick={() => { resetForm(); setShowCreate(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, border: 'none', background: ACC, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> Add module
        </button>
      </div>

      {showCreate && (
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '18px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TX1, marginBottom: 14 }}>New module</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ fontSize: 12 }}>
              <span style={{ color: TX2, display: 'block', marginBottom: 4 }}>Module key *</span>
              <input value={form.module_key} onChange={e => setForm({ ...form, module_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} placeholder="ona_advanced" style={{ ...inputStyle, fontFamily: MONO }} />
            </label>
            <label style={{ fontSize: 12 }}>
              <span style={{ color: TX2, display: 'block', marginBottom: 4 }}>Display name *</span>
              <input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} style={inputStyle} />
            </label>
            <label style={{ fontSize: 12 }}>
              <span style={{ color: TX2, display: 'block', marginBottom: 4 }}>Price / month (ZAR)</span>
              <input type="number" min="0" value={form.price_monthly} onChange={e => setForm({ ...form, price_monthly: e.target.value })} style={inputStyle} />
            </label>
            <label style={{ fontSize: 12 }}>
              <span style={{ color: TX2, display: 'block', marginBottom: 4 }}>Required role (optional)</span>
              <input value={form.required_role} onChange={e => setForm({ ...form, required_role: e.target.value })} placeholder="admin" style={inputStyle} />
            </label>
            <label style={{ fontSize: 12, gridColumn: '1 / -1' }}>
              <span style={{ color: TX2, display: 'block', marginBottom: 4 }}>Description</span>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={() => setShowCreate(false)}
              style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: TX2, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button type="button"
              disabled={!form.module_key || !form.display_name}
              onClick={() => {
                onCreate({ module_key: form.module_key.trim(), display_name: form.display_name.trim(), description: form.description.trim() || undefined, price_monthly: form.price_monthly ? Number(form.price_monthly) : undefined, required_role: form.required_role.trim() || null });
                setShowCreate(false); resetForm();
              }}
              style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: ACC, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (!form.module_key || !form.display_name) ? 0.5 : 1 }}>
              Create module
            </button>
          </div>
        </div>
      )}

      {modules.length === 0 ? (
        <EmptyState icon={<Settings className="w-8 h-8" />} title="No modules" description='Module catalogue is empty. Use "Add module" to create one.' />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {modules.map(m => (
            <div key={m.module_key} style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: TX1 }}>{m.display_name}</div>
                  <div style={{ fontSize: 11, color: TX3, fontFamily: MONO, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.module_key}{m.category ? ` · ${m.category}` : ''}{m.required_role ? ` · ${m.required_role}` : ''}{m.price_monthly != null ? ` · ${formatZAR(Number(m.price_monthly))}/mo` : ''}
                  </div>
                </div>
                {/* Toggle */}
                <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <input type="checkbox" checked={!!m.enabled} onChange={e => onToggle(m.module_key, e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                  <div style={{
                    width: 40, height: 22, borderRadius: 11,
                    background: m.enabled ? ACC : BORDER,
                    position: 'relative', transition: 'background 0.2s',
                  }}>
                    <div style={{
                      position: 'absolute', top: 3, left: m.enabled ? 21 : 3,
                      width: 16, height: 16, borderRadius: 8,
                      background: '#fff', transition: 'left 0.2s',
                    }} />
                  </div>
                </label>
              </div>

              {editKey === m.module_key ? (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
                  <input value={editForm.display_name} onChange={e => setEditForm({ ...editForm, display_name: e.target.value })} placeholder="Display name"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 5, background: BG2, color: TX1, marginBottom: 6 }} />
                  <textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={2} placeholder="Description"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 5, background: BG2, color: TX1, resize: 'vertical', marginBottom: 6 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                    <input type="number" min="0" value={editForm.price_monthly} onChange={e => setEditForm({ ...editForm, price_monthly: e.target.value })} placeholder="Price / month"
                      style={{ padding: '6px 8px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 5, background: BG2, color: TX1 }} />
                    <input value={editForm.required_role} onChange={e => setEditForm({ ...editForm, required_role: e.target.value })} placeholder="Required role"
                      style={{ padding: '6px 8px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 5, background: BG2, color: TX1 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" onClick={() => setEditKey(null)}
                      style={{ background: 'none', border: 'none', color: TX2, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                    <button type="button"
                      onClick={() => {
                        onUpdate(m.module_key, { display_name: editForm.display_name.trim(), description: editForm.description.trim(), price_monthly: editForm.price_monthly ? Number(editForm.price_monthly) : null, required_role: editForm.required_role.trim() || null });
                        setEditKey(null);
                      }}
                      style={{ background: 'none', border: 'none', color: ACC, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                  </div>
                </div>
              ) : (
                <>
                  {m.description && <p style={{ fontSize: 12, color: TX2, margin: '8px 0 0' }}>{m.description}</p>}
                  <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                    <button type="button" onClick={() => beginEdit(m)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: ACC, fontSize: 12, cursor: 'pointer' }}>
                      <Edit3 size={12} /> Edit
                    </button>
                    <button type="button" onClick={() => onDelete(m.module_key)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: BAD, fontSize: 12, cursor: 'pointer' }}>
                      <Trash2 size={12} /> Delete
                    </button>
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
  const [form,      setForm]      = useState({ display_name: '', slug: '', description: '' });
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editForm,  setEditForm]  = useState({ display_name: '', description: '' });
  const resetForm = () => setForm({ display_name: '', slug: '', description: '' });
  const beginEdit = (t: TenantRow) => {
    setEditId(t.id);
    setEditForm({ display_name: t.display_name, description: t.description || '' });
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 12, color: TX3, margin: 0 }}>Tenants isolate participants, contracts, trades, and reports. The <code style={{ fontFamily: MONO, fontSize: 11 }}>default</code> tenant cannot be deleted.</p>
        <button type="button"
          onClick={() => { resetForm(); setShowCreate(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, border: 'none', background: ACC, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
          <Plus size={14} /> New tenant
        </button>
      </div>

      {showCreate && (
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '18px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TX1, marginBottom: 14 }}>New tenant</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ fontSize: 12 }}>
              <span style={{ color: TX2, display: 'block', marginBottom: 4 }}>Display name *</span>
              <input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="Vantax Group"
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, color: TX1, background: BG2 }} />
            </label>
            <label style={{ fontSize: 12 }}>
              <span style={{ color: TX2, display: 'block', marginBottom: 4 }}>Slug (optional)</span>
              <input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="vantax-group"
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, color: TX1, background: BG2, fontFamily: MONO }} />
            </label>
            <label style={{ fontSize: 12, gridColumn: '1 / -1' }}>
              <span style={{ color: TX2, display: 'block', marginBottom: 4 }}>Description</span>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2}
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, color: TX1, background: BG2, resize: 'vertical' }} />
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={() => setShowCreate(false)}
              style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: TX2, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button type="button"
              disabled={!form.display_name}
              onClick={() => {
                onCreate({ display_name: form.display_name.trim(), slug: form.slug.trim() || undefined, description: form.description.trim() || undefined });
                setShowCreate(false); resetForm();
              }}
              style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: ACC, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: !form.display_name ? 0.5 : 1 }}>
              Create tenant
            </button>
          </div>
        </div>
      )}

      {tenants.length === 0 ? (
        <EmptyState icon={<Building2 className="w-8 h-8" />} title="No tenants" description="No tenants seeded yet." />
      ) : (
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BORDER}`, background: BG2 }}>
                {['Tenant', 'Slug', 'Members', 'Created', 'Actions'].map((h, i) => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: i === 4 ? 'right' : 'left', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((t, i) => (
                <tr key={t.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                  <td style={{ padding: '10px 12px' }}>
                    {editId === t.id ? (
                      <div>
                        <input value={editForm.display_name} onChange={e => setEditForm({ ...editForm, display_name: e.target.value })}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 5, background: BG, color: TX1, marginBottom: 5 }} />
                        <textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={2} placeholder="Description"
                          style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 5, background: BG, color: TX1, resize: 'vertical' }} />
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontWeight: 600, color: TX1, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Building2 size={13} style={{ color: TX3 }} />{t.display_name}
                        </div>
                        {t.description && <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>{t.description}</div>}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 11, color: TX3 }}>{t.slug}</td>
                  <td style={{ padding: '10px 12px', color: TX2, fontFamily: MONO }}>{t.participant_count ?? 0}</td>
                  <td style={{ padding: '10px 12px', fontSize: 11, color: TX3 }}>{new Date(t.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {editId === t.id ? (
                      <>
                        <button type="button" onClick={() => setEditId(null)}
                          style={{ background: 'none', border: 'none', color: TX2, fontSize: 12, cursor: 'pointer', marginRight: 10 }}>Cancel</button>
                        <button type="button"
                          onClick={() => { onUpdate(t.id, { display_name: editForm.display_name.trim(), description: editForm.description.trim() || null }); setEditId(null); }}
                          style={{ background: 'none', border: 'none', color: ACC, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => beginEdit(t)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: ACC, fontSize: 12, cursor: 'pointer', marginRight: 10 }}>
                          <Edit3 size={12} /> Edit
                        </button>
                        {t.id !== 'default' && (
                          <button type="button"
                            onClick={() => onDelete(t.id)}
                            disabled={(t.participant_count ?? 0) > 0}
                            title={(t.participant_count ?? 0) > 0 ? 'Move or suspend tenant members before deleting' : 'Delete tenant'}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: BAD, fontSize: 12, cursor: 'pointer', opacity: (t.participant_count ?? 0) > 0 ? 0.4 : 1 }}>
                            <Trash2 size={12} /> Delete
                          </button>
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
    <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${BORDER}`, background: BG2 }}>
            {['When', 'Actor', 'Action', 'Entity', 'Changes'].map(h => (
              <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
              <td style={{ padding: '10px 12px', color: TX3, fontSize: 11, whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString()}</td>
              <td style={{ padding: '10px 12px' }}>
                <div style={{ fontWeight: 600, color: TX1 }}>{r.actor_name || r.actor_id}</div>
                {r.actor_role && <div style={{ fontSize: 11, color: TX3, textTransform: 'capitalize' }}>{r.actor_role.replace('_', ' ')}</div>}
              </td>
              <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 11, color: TX2 }}>{r.action}</td>
              <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 11, color: TX2 }}>{r.entity_type}{r.entity_id ? ` · ${r.entity_id}` : ''}</td>
              <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 11, color: TX3, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.changes || ''}>{r.changes || '—'}</td>
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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* MRR */}
      <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '18px 20px' }}>
        <div style={{ fontSize: 11, color: TX3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Monthly Recurring Revenue</div>
        <div style={{ fontSize: 32, fontWeight: 700, color: TX1, fontFamily: MONO, margin: '8px 0 4px' }}>{formatZAR(billing.monthly_recurring_zar)}</div>
        <div style={{ fontSize: 11, color: TX3 }}>Active participants × tier rate</div>
      </div>

      {/* Rate card */}
      <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '18px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Tier Rate Card</div>
        {Object.entries(billing.rate_card).map(([tier, rate], i) => (
          <div key={tier} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '7px 0', borderBottom: i < Object.keys(billing.rate_card).length - 1 ? `1px solid ${BORDER}` : 'none',
            fontSize: 13,
          }}>
            <span style={{ color: TX2, textTransform: 'capitalize' }}>{tier}</span>
            <span style={{ fontFamily: MONO, fontWeight: 600, color: TX1 }}>{formatZAR(Number(rate))}</span>
          </div>
        ))}
      </div>

      {/* Participants by tier */}
      <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '18px 20px', gridColumn: '1 / -1' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Active Participants by Tier</div>
        {billing.tiers.length === 0 ? (
          <p style={{ fontSize: 13, color: TX3 }}>No active participants.</p>
        ) : (
          billing.tiers.map((t, i) => {
            const rate = billing.rate_card[t.subscription_tier] || 0;
            return (
              <div key={t.subscription_tier} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0', borderBottom: i < billing.tiers.length - 1 ? `1px solid ${BORDER}` : 'none',
                fontSize: 13,
              }}>
                <span style={{ color: TX2, textTransform: 'capitalize' }}>{t.subscription_tier || '—'}</span>
                <span style={{ fontFamily: MONO, color: TX1 }}>{t.n} × {formatZAR(rate)} = {formatZAR(rate * Number(t.n || 0))}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
