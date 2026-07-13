import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import { FioriTile } from '../FioriTile';
import { EmptyState } from '../EmptyState';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { Search, LifeBuoy, Mail, Unlock, KeyRound, LogOut, UserCheck, Activity } from 'lucide-react';
import { StitchPage } from '../StitchPage';

// ---------------------------------------------------------------------------
// Support Console
// Narrower counterpart to /admin. Lets support staff search participants,
// see their audit trail, issue one-off password reset links, clear
// brute-force lockouts, list + revoke sessions, and launch a time-boxed
// impersonation session. Mirrors endpoints in src/routes/support.ts.
// ---------------------------------------------------------------------------

type Participant = {
  id: string;
  email: string;
  name: string;
  company_name: string | null;
  role: string;
  status: string;
  kyc_status: string;
  tenant_id: string | null;
  email_verified: number;
  last_login: string | null;
  created_at: string;
};

type AuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  changes: string | null;
  ip_address: string | null;
  created_at: string;
};

type SessionRow = {
  id: string;
  issued_at: string;
  expires_at: string;
  last_used_at: string | null;
  user_agent: string | null;
  ip: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export function Support() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Participant | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 5000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const search = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      const r = await api.get(`/support/participants${params.toString() ? `?${params}` : ''}`);
      setResults((r.data?.data || []) as Participant[]);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void search(); }, []); // initial load

  const loadDetail = useCallback(async (p: Participant) => {
    setSelected(p);
    setResetLink(null);
    setErr(null);
    try {
      const [auditRes, sessRes] = await Promise.all([
        api.get(`/support/participants/${p.id}/audit?limit=200`),
        api.get(`/support/participants/${p.id}/sessions`),
      ]);
      setAudit((auditRes.data?.data || []) as AuditRow[]);
      setSessions((sessRes.data?.data || []) as SessionRow[]);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'Failed to load participant detail');
    }
  }, []);

  const issueResetLink = useCallback(async () => {
    if (!selected) return;
    setBusy('reset');
    try {
      const r = await api.post(`/support/participants/${selected.id}/reset-link`, {});
      const link = r.data?.data?.reset_url as string | undefined;
      setResetLink(link || null);
      flashToast('Reset link issued — copy & send out-of-band');
    } catch (e: any) {
      flashToast(e?.response?.data?.error || 'Failed to issue reset link');
    } finally { setBusy(null); }
  }, [selected, flashToast]);

  const unlock = useCallback(async () => {
    if (!selected) return;
    setBusy('unlock');
    try {
      const r = await api.post(`/support/participants/${selected.id}/unlock`, {});
      const cleared = r.data?.data?.cleared_attempts ?? 0;
      flashToast(`Lockout cleared — removed ${cleared} failed attempts`);
    } catch (e: any) {
      flashToast(e?.response?.data?.error || 'Failed to clear lockout');
    } finally { setBusy(null); }
  }, [selected, flashToast]);

  const revokeSession = useCallback(async (sid: string) => {
    if (!selected) return;
    if (!window.confirm('Revoke this session? User will need to log in again.')) return;
    setBusy(`revoke-${sid}`);
    try {
      await api.post(`/support/participants/${selected.id}/sessions/${sid}/revoke`, { reason: 'support_revoked' });
      flashToast('Session revoked');
      await loadDetail(selected);
    } catch (e: any) {
      flashToast(e?.response?.data?.error || 'Revoke failed');
    } finally { setBusy(null); }
  }, [selected, flashToast, loadDetail]);

  const impersonate = useCallback(async () => {
    if (!selected) return;
    const reason = window.prompt('Reason for impersonation (will be audit-logged):', '');
    if (!reason || !reason.trim()) return;
    setBusy('impersonate');
    try {
      const r = await api.post(`/support/participants/${selected.id}/impersonate`, { reason: reason.trim() });
      const token = r.data?.data?.access_token as string | undefined;
      if (!token) {
        flashToast('Impersonation failed — no token returned');
        return;
      }
      // Store so the Axios interceptor picks it up on the next request.
      sessionStorage.setItem('oe_impersonation_active', '1');
      sessionStorage.setItem('oe_impersonation_original_token', localStorage.getItem('token') || '');
      localStorage.setItem('token', token);
      flashToast('Impersonating — page will reload');
      setTimeout(() => { window.location.href = '/cockpit'; }, 600);
    } catch (e: any) {
      flashToast(e?.response?.data?.error || 'Impersonation failed');
    } finally { setBusy(null); }
  }, [selected, flashToast]);

  const stats = useMemo(() => ({
    total: results.length,
    active: results.filter(r => r.status === 'active').length,
    pending: results.filter(r => r.status === 'pending').length,
    suspended: results.filter(r => r.status === 'suspended').length,
  }), [results]);

  return (
    <StitchPage
      eyebrowIcon={LifeBuoy}
      eyebrowLabel="Support"
      title="Support Console"
      subtitle={user?.role === 'admin'
        ? 'Admin-view of support tools. All writes are audit-logged.'
        : 'Triage user issues. All writes are audit-logged and visible to admins.'}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <FioriTile title="Results" value={String(stats.total)} />
        <FioriTile title="Active" value={String(stats.active)} accent="green" />
        <FioriTile title="Pending" value={String(stats.pending)} accent="amber" />
        <FioriTile title="Suspended" value={String(stats.suspended)} accent="red" />
      </div>

      {toast && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'color-mix(in oklch, var(--accent, oklch(0.46 0.16 55)) 14%, var(--s1, oklch(0.97 0.04 55)))', border: '1px solid var(--accent, oklch(0.85 0.10 55))', color: 'var(--accent, oklch(0.46 0.16 55))' }}>
          {toast}
        </div>
      )}

      {err && <ErrorBanner message={err} />}

      <div className="p-4" style={{ background: 'var(--s1, oklch(0.99 0.002 80))', border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))', borderRadius: '12px' }}>
        <form onSubmit={(e) => { e.preventDefault(); void search(); }} className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by email, name, or company…"
              className="w-full pl-10 pr-3 py-2 rounded-lg"
              style={{ border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))', background: 'var(--s1, oklch(0.99 0.002 80))', color: 'var(--ink, oklch(0.17 0.010 250))' }}
            />
          </div>
          <button type="submit" disabled={loading} className="px-4 py-2 text-white rounded-lg disabled:opacity-50" style={{ background: 'var(--accent, oklch(0.46 0.16 55))' }}>{loading ? 'Searching…' : 'Search'}</button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 overflow-hidden" style={{ background: 'var(--s1, oklch(0.99 0.002 80))', border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))', borderRadius: '12px' }}>
          <div className="px-4 py-2 text-xs uppercase tracking-wide" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))', background: 'var(--s1, oklch(0.96 0.003 250))', borderBottom: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
            Participants
          </div>
          {loading ? (
            <div className="p-4"><Skeleton /></div>
          ) : results.length === 0 ? (
            <EmptyState title="No matches" description="Adjust the query and search again." />
          ) : (
            <ul className="max-h-[640px] overflow-auto">
              {results.map(p => (
                <li key={p.id} style={{ borderTop: '1px solid var(--border-subtle, oklch(0.91 0.005 250))' }}>
                  <button type="button"
                    onClick={() => void loadDetail(p)}
                    className="w-full text-left px-4 py-3"
                    style={{ background: selected?.id === p.id ? 'color-mix(in oklch, var(--accent, oklch(0.46 0.16 55)) 14%, var(--s1, oklch(0.97 0.04 55)))' : 'transparent' }}
                  >
                    <div className="text-sm font-medium" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>{p.name}</div>
                    <div className="text-xs" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }}>{p.email}</div>
                    <div className="flex gap-2 mt-1 text-xs">
                      <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--s2, oklch(0.93 0.008 250))', color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>{p.role}</span>
                      <span className="px-1.5 py-0.5 rounded"
                        style={p.status === 'active'
                          ? { background: 'color-mix(in oklch, var(--good, oklch(0.55 0.18 145)) 14%, var(--s1, oklch(0.97 0.04 150)))', color: 'var(--good, oklch(0.45 0.15 150))' }
                          : p.status === 'pending'
                            ? { background: 'color-mix(in oklch, var(--accent, oklch(0.46 0.16 55)) 14%, var(--s1, oklch(0.97 0.04 55)))', color: 'var(--accent, oklch(0.46 0.16 55))' }
                            : { background: 'color-mix(in oklch, var(--bad, oklch(0.55 0.22 25)) 14%, var(--s1, oklch(0.97 0.04 20)))', color: 'var(--bad, oklch(0.48 0.20 20))' }}>
                        {p.status}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {!selected ? (
            <EmptyState title="Select a participant" description="Pick a user from the list to see their audit log and support actions." />
          ) : (
            <>
              <div className="p-5" style={{ background: 'var(--s1, oklch(0.99 0.002 80))', border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))', borderRadius: '12px' }}>
                <div className="flex flex-wrap gap-4 items-start justify-between">
                  <div>
                    <div className="text-lg font-semibold" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>{selected.name}</div>
                    <div className="text-sm" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }}>{selected.email}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }}>
                      Role <b style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>{selected.role}</b> · Status <b style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>{selected.status}</b> · Tenant <b style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>{selected.tenant_id || 'default'}</b> · Last login {formatDate(selected.last_login)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button"
                      onClick={() => void issueResetLink()}
                      disabled={busy === 'reset'}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg"
                      style={{ border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))', color: 'var(--ink-2, oklch(0.40 0.009 250))', background: 'var(--s1, oklch(0.99 0.002 80))' }}
                    >
                      <KeyRound size={14} /> Reset link
                    </button>
                    <button type="button"
                      onClick={() => void unlock()}
                      disabled={busy === 'unlock'}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg"
                      style={{ border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))', color: 'var(--ink-2, oklch(0.40 0.009 250))', background: 'var(--s1, oklch(0.99 0.002 80))' }}
                    >
                      <Unlock size={14} /> Clear lockout
                    </button>
                    <button type="button"
                      onClick={() => void impersonate()}
                      disabled={busy === 'impersonate' || selected.role === 'admin' || selected.role === 'support'}
                      title={selected.role === 'admin' || selected.role === 'support' ? 'Cannot impersonate admin/support' : 'Start time-boxed impersonation'}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50"
                      style={{ background: 'var(--accent, oklch(0.46 0.16 55))' }}
                    >
                      <UserCheck size={14} /> Impersonate
                    </button>
                  </div>
                </div>
                {resetLink && (
                  <div className="mt-4 p-3 rounded text-xs" style={{ background: 'color-mix(in oklch, var(--accent, oklch(0.46 0.16 55)) 14%, var(--s1, oklch(0.97 0.04 55)))', border: '1px solid var(--accent, oklch(0.85 0.10 55))' }}>
                    <div className="flex items-center gap-1 font-semibold mb-1" style={{ color: 'var(--accent, oklch(0.46 0.16 55))' }}><Mail size={12} /> One-off reset link (expires in 60 min)</div>
                    <code className="block break-all" style={{ color: 'var(--accent, oklch(0.40 0.15 55))' }}>{resetLink}</code>
                  </div>
                )}
              </div>

              <div style={{ background: 'var(--s1, oklch(0.99 0.002 80))', border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))', borderRadius: '12px', overflow: 'hidden' }}>
                <div className="px-4 py-2 text-xs uppercase tracking-wide flex items-center gap-1" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))', background: 'var(--s1, oklch(0.96 0.003 250))', borderBottom: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
                  <LogOut size={12} /> Sessions ({sessions.length})
                </div>
                {sessions.length === 0 ? (
                  <div className="p-4 text-sm" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }}>No sessions.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'var(--s1, oklch(0.96 0.003 250))' }}>
                        <th className="px-3 py-2 text-left text-xs" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }}>Issued</th>
                        <th className="px-3 py-2 text-left text-xs" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }}>Last used</th>
                        <th className="px-3 py-2 text-left text-xs" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }}>IP</th>
                        <th className="px-3 py-2 text-left text-xs" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }}>Status</th>
                        <th className="px-3 py-2 text-right text-xs" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map(s => (
                        <tr key={s.id} style={{ borderTop: '1px solid var(--border-subtle, oklch(0.91 0.005 250))' }}>
                          <td className="px-3 py-2" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>{formatDate(s.issued_at)}</td>
                          <td className="px-3 py-2" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>{formatDate(s.last_used_at)}</td>
                          <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>{s.ip || '—'}</td>
                          <td className="px-3 py-2">
                            {s.revoked_at
                              ? <span style={{ color: 'var(--bad, oklch(0.48 0.20 20))' }}>revoked</span>
                              : <span style={{ color: 'var(--good, oklch(0.45 0.15 150))' }}>active</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {!s.revoked_at && (
                              <button type="button"
                                onClick={() => void revokeSession(s.id)}
                                disabled={busy === `revoke-${s.id}`}
                                className="text-xs px-2 py-1 rounded"
                                style={{ color: 'var(--bad, oklch(0.48 0.20 20))', background: 'color-mix(in oklch, var(--bad, oklch(0.55 0.22 25)) 14%, var(--s1, oklch(0.97 0.04 20)))' }}
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ background: 'var(--s1, oklch(0.99 0.002 80))', border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))', borderRadius: '12px', overflow: 'hidden' }}>
                <div className="px-4 py-2 text-xs uppercase tracking-wide flex items-center gap-1" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))', background: 'var(--s1, oklch(0.96 0.003 250))', borderBottom: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
                  <Activity size={12} /> Audit trail ({audit.length})
                </div>
                {audit.length === 0 ? (
                  <div className="p-4 text-sm" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }}>No audit entries.</div>
                ) : (
                  <ul className="max-h-[500px] overflow-auto">
                    {audit.map(a => (
                      <li key={a.id} className="px-4 py-2 text-xs" style={{ borderTop: '1px solid var(--border-subtle, oklch(0.91 0.005 250))' }}>
                        <div className="flex items-center justify-between">
                          <span className="font-mono" style={{ color: 'var(--accent, oklch(0.46 0.16 55))' }}>{a.action}</span>
                          <span style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }}>{formatDate(a.created_at)}</span>
                        </div>
                        {a.changes && (
                          <details className="mt-1">
                            <summary className="cursor-pointer" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }}>changes</summary>
                            <pre className="mt-1 text-[11px] p-2 rounded overflow-auto" style={{ background: 'var(--s1, oklch(0.96 0.003 250))', color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>{a.changes}</pre>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </StitchPage>
  );
}

export default Support;
