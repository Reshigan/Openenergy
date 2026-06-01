// SelfManagePanel — per-role self-management drawer.
//
// Covers: profile editing, permission viewer, invitation management.
// Embedded in the AppShell topbar profile button (or any workstation's
// profile action).  Works for every role — admin/support also get a
// quick link to the full RBAC admin screen.

import React, { useEffect, useState } from 'react';
import { api } from '../../../../lib/api';
import { OeIcon } from '../icons/Icons';
import { StatusPill } from '../display/StatusPill';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MyProfile {
  id: string;
  email: string;
  name: string;
  company_name: string | null;
  role: string;
  status: string;
  subscription_tier: string;
  phone: string | null;
  job_title: string | null;
  org_website: string | null;
  bio: string | null;
  email_verified: number;
  last_login: string | null;
  permissions: string[];
  can_invite_roles: string[];
}

interface MyInvitation {
  id: string;
  email: string | null;
  role: string;
  organization: string | null;
  status: string;
  expires_at: string;
  accepted_by_name: string | null;
  token: string;
}

type SubTab = 'profile' | 'permissions' | 'invitations';

interface SelfManagePanelProps {
  open: boolean;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin: 'Platform Administrator', support: 'Platform Support',
  trader: 'Energy Trader', ipp_developer: 'IPP Developer',
  lender: 'Project Finance Lender', offtaker: 'Offtaker / Corporate Buyer',
  carbon_fund: 'Carbon Fund / Registry', grid_operator: 'Grid Operator',
  regulator: 'Regulator (NERSA/DMRE)',
};

const DOMAIN_COLOR: Record<string, string> = {
  trading: '#4f9cf9', settlement: '#7c6af7', carbon: '#34c759', ipp: '#f59e0b',
  lender: '#06b6d4', offtaker: '#ec4899', grid: '#8b5cf6', regulator: '#ef4444',
  esums: '#10b981', documents: '#6b7280', audit: '#0B1F3A', users: '#d97706',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function SelfManagePanel({ open, onClose }: SelfManagePanelProps) {
  const [tab, setTab] = useState<SubTab>('profile');
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [invitations, setInvitations] = useState<MyInvitation[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [newInvRole, setNewInvRole] = useState('');
  const [newInvEmail, setNewInvEmail] = useState('');
  const [newInvOrg, setNewInvOrg] = useState('');
  const [invResult, setInvResult] = useState<{ token: string; invite_url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Form state
  const [form, setForm] = useState({ name: '', phone: '', job_title: '', org_website: '', bio: '', company_name: '' });

  useEffect(() => {
    if (!open) return;
    api.get('/rbac/me').then(r => {
      const p = (r.data as any).data as MyProfile;
      setProfile(p);
      setForm({ name: p.name ?? '', phone: p.phone ?? '', job_title: p.job_title ?? '', org_website: p.org_website ?? '', bio: p.bio ?? '', company_name: p.company_name ?? '' });
    });
  }, [open]);

  useEffect(() => {
    if (open && tab === 'invitations') {
      api.get('/rbac/me/invitations').then(r => setInvitations((r.data as any).data ?? []));
    }
  }, [open, tab]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (open && e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/rbac/me', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setProfile(prev => prev ? { ...prev, ...form } : prev);
    } finally { setSaving(false); }
  };

  const handleInvite = async () => {
    if (!newInvRole) return;
    setInviting(true);
    setInvResult(null);
    try {
      const r = await api.post('/rbac/me/invitations', { role: newInvRole, email: newInvEmail || undefined, organization: newInvOrg || undefined });
      const data = (r.data as any).data;
      setInvResult(data);
      setInvitations(prev => [{ id: data.id, email: newInvEmail || null, role: newInvRole, organization: newInvOrg || null, status: 'pending', expires_at: data.expires_at, accepted_by_name: null, token: data.token }, ...prev]);
      setNewInvEmail(''); setNewInvOrg('');
    } finally { setInviting(false); }
  };

  const handleRevoke = async (invId: string) => {
    await api.delete(`/rbac/me/invitations/${invId}`);
    setInvitations(prev => prev.map(i => i.id === invId ? { ...i, status: 'revoked' } : i));
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(`${window.location.origin}${url}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  if (!open) return null;

  const permsByDomain: Record<string, string[]> = {};
  for (const perm of profile?.permissions ?? []) {
    const [domain] = perm.split('.');
    if (!permsByDomain[domain]) permsByDomain[domain] = [];
    permsByDomain[domain].push(perm.split('.')[1]);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(11,31,58,0.4)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301,
        width: 'min(480px, 100vw)', background: 'var(--oe-surface)',
        borderLeft: '1px solid var(--oe-border)', boxShadow: '-16px 0 60px rgba(11,31,58,0.2)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 0', borderBottom: '1px solid var(--oe-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--oe-text-1)', lineHeight: 1.2 }}>
                {profile?.name ?? 'My Account'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--oe-text-3)', marginTop: '2px' }}>
                {ROLE_LABELS[profile?.role ?? ''] ?? profile?.role}
              </div>
            </div>
            <button onClick={onClose} style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--oe-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <OeIcon name="close" size={14} color="var(--oe-text-3)" />
            </button>
          </div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '2px', marginBottom: '-1px' }}>
            {(['profile', 'permissions', 'invitations'] as SubTab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  padding: '7px 14px', background: 'transparent', border: 'none',
                  borderBottom: tab === t ? '2px solid var(--oe-navy)' : '2px solid transparent',
                  color: tab === t ? 'var(--oe-navy)' : 'var(--oe-text-3)',
                  fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 80ms',
                  textTransform: 'capitalize',
                }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* ── Profile tab ── */}
          {tab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { label: 'Full name', field: 'name', type: 'text' },
                { label: 'Company / Organisation', field: 'company_name', type: 'text' },
                { label: 'Job title', field: 'job_title', type: 'text' },
                { label: 'Phone', field: 'phone', type: 'tel' },
                { label: 'Website', field: 'org_website', type: 'url' },
              ].map(({ label, field, type }) => (
                <div key={field}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>{label}</label>
                  <input type={type} value={(form as any)[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid var(--oe-border)', background: 'var(--oe-surf)', color: 'var(--oe-text-1)', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>Bio</label>
                <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} rows={3}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid var(--oe-border)', background: 'var(--oe-surf)', color: 'var(--oe-text-1)', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              {/* Read-only fields */}
              <div style={{ padding: '12px', background: 'var(--oe-surf-2)', borderRadius: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '12px' }}>
                <div><span style={{ color: 'var(--oe-text-4)' }}>Email</span><div style={{ color: 'var(--oe-text-2)', fontFamily: 'var(--oe-font-mono)', fontSize: '11px' }}>{profile?.email}</div></div>
                <div><span style={{ color: 'var(--oe-text-4)' }}>Role</span><div style={{ marginTop: '2px' }}><StatusPill label={profile?.role ?? ''} variant="default" size="sm" /></div></div>
                <div><span style={{ color: 'var(--oe-text-4)' }}>Status</span><div style={{ marginTop: '2px' }}><StatusPill label={profile?.status ?? ''} variant={profile?.status === 'active' ? 'green' : 'amber'} size="sm" /></div></div>
                <div><span style={{ color: 'var(--oe-text-4)' }}>Plan</span><div style={{ color: 'var(--oe-text-2)', textTransform: 'capitalize' }}>{profile?.subscription_tier}</div></div>
                <div><span style={{ color: 'var(--oe-text-4)' }}>Email verified</span><div style={{ color: 'var(--oe-text-2)' }}>{profile?.email_verified ? 'Yes' : 'No'}</div></div>
                <div><span style={{ color: 'var(--oe-text-4)' }}>Last login</span><div style={{ color: 'var(--oe-text-2)', fontFamily: 'var(--oe-font-mono)', fontSize: '11px' }}>{profile?.last_login?.slice(0, 16) ?? '—'}</div></div>
              </div>

              <button onClick={handleSave} disabled={saving}
                style={{ padding: '10px', borderRadius: '8px', background: saved ? 'var(--oe-green)' : 'var(--oe-navy)', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.8 : 1, transition: 'background 200ms' }}>
                {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
              </button>
            </div>
          )}

          {/* ── Permissions tab ── */}
          {tab === 'permissions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--oe-text-3)', lineHeight: 1.5 }}>
                Permissions are assigned by role and cannot be individually modified. Contact support to change your role.
              </p>
              {Object.entries(permsByDomain).map(([domain, actions]) => (
                <div key={domain} style={{ border: '1px solid var(--oe-border)', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', background: 'var(--oe-surf-2)', borderBottom: '1px solid var(--oe-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: DOMAIN_COLOR[domain] ?? 'var(--oe-text-4)', flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: DOMAIN_COLOR[domain] ?? 'var(--oe-text-3)' }}>{domain}</span>
                  </div>
                  <div style={{ padding: '8px 12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {actions.map(action => (
                      <StatusPill key={action} label={action} variant={action === 'write' || action === 'approve' ? 'amber' : action === 'export' ? 'blue' : 'green'} size="sm" />
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(permsByDomain).length === 0 && (
                <div style={{ color: 'var(--oe-text-4)', fontSize: '13px', padding: '32px', textAlign: 'center' }}>No permissions loaded</div>
              )}
            </div>
          )}

          {/* ── Invitations tab ── */}
          {tab === 'invitations' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Create invitation */}
              {(profile?.can_invite_roles?.length ?? 0) > 0 && (
                <div style={{ border: '1px solid var(--oe-border)', borderRadius: '10px', padding: '16px', background: 'var(--oe-surf)' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: 'var(--oe-text-1)' }}>Create invitation</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--oe-text-3)', display: 'block', marginBottom: '4px' }}>Role to invite</label>
                      <select value={newInvRole} onChange={e => setNewInvRole(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--oe-border)', background: 'var(--oe-surf)', color: 'var(--oe-text-1)', fontSize: '13px' }}>
                        <option value="">— select —</option>
                        {profile?.can_invite_roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--oe-text-3)', display: 'block', marginBottom: '4px' }}>Email (optional)</label>
                      <input type="email" value={newInvEmail} onChange={e => setNewInvEmail(e.target.value)} placeholder="pre-fill registrant's email"
                        style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--oe-border)', background: 'var(--oe-surf)', color: 'var(--oe-text-1)', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--oe-text-3)', display: 'block', marginBottom: '4px' }}>Organisation (optional)</label>
                      <input type="text" value={newInvOrg} onChange={e => setNewInvOrg(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--oe-border)', background: 'var(--oe-surf)', color: 'var(--oe-text-1)', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                    <button onClick={handleInvite} disabled={!newInvRole || inviting}
                      style={{ padding: '9px', borderRadius: '7px', background: 'var(--oe-navy)', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: !newInvRole || inviting ? 'not-allowed' : 'pointer', opacity: !newInvRole ? 0.5 : 1 }}>
                      {inviting ? 'Generating link…' : 'Generate invitation link'}
                    </button>
                    {invResult && (
                      <div style={{ background: 'rgba(52,199,89,0.1)', border: '1px solid rgba(52,199,89,0.3)', borderRadius: '7px', padding: '10px 12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#34c759', marginBottom: '6px' }}>Link generated — share this:</div>
                        <div style={{ fontFamily: 'var(--oe-font-mono)', fontSize: '11px', color: 'var(--oe-text-2)', wordBreak: 'break-all', marginBottom: '8px' }}>
                          {window.location.origin}{invResult.invite_url}
                        </div>
                        <button onClick={() => copyLink(invResult.invite_url)}
                          style={{ padding: '5px 12px', borderRadius: '5px', background: '#34c759', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                          {copied ? 'Copied!' : 'Copy link'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* My invitations list */}
              <div>
                <h4 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, color: 'var(--oe-text-1)' }}>My invitations</h4>
                {invitations.length === 0 && <div style={{ fontSize: '12px', color: 'var(--oe-text-4)', padding: '16px', textAlign: 'center' }}>No invitations yet</div>}
                {invitations.map(inv => (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderBottom: '1px solid var(--oe-border)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '2px' }}>
                        <StatusPill label={inv.role} variant="default" size="sm" />
                        <StatusPill label={inv.status} variant={inv.status === 'accepted' ? 'green' : inv.status === 'pending' ? 'amber' : 'default'} size="sm" />
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--oe-text-3)', fontFamily: 'var(--oe-font-mono)' }}>
                        {inv.email ?? 'open link'} · exp {inv.expires_at.slice(0, 10)}
                      </div>
                      {inv.accepted_by_name && <div style={{ fontSize: '11px', color: 'var(--oe-green)' }}>Accepted by {inv.accepted_by_name}</div>}
                    </div>
                    {inv.status === 'pending' && (
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button onClick={() => copyLink(`/register?token=${inv.token}`)}
                          style={{ padding: '4px 10px', borderRadius: '5px', background: 'var(--oe-surf-2)', border: '1px solid var(--oe-border)', color: 'var(--oe-text-2)', fontSize: '11px', cursor: 'pointer' }}>
                          Copy
                        </button>
                        <button onClick={() => handleRevoke(inv.id)}
                          style={{ padding: '4px 10px', borderRadius: '5px', background: 'transparent', border: '1px solid var(--oe-border)', color: 'var(--oe-rose)', fontSize: '11px', cursor: 'pointer' }}>
                          Revoke
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default SelfManagePanel;
