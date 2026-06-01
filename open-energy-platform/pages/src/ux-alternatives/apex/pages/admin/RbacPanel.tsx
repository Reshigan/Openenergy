// RbacPanel — admin screen for Roles, Permissions, Registrations, Invitations
// Mounted inside AdminWorkstation as screen 'rbac'

import React, { useEffect, useState } from 'react';
import { api } from '../../../../lib/api';
import { StatusPill } from '../../components/display/StatusPill';
import { DataTable, Column } from '../../components/display/DataTable';
import { OeIcon } from '../../components/icons/Icons';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RbacRole {
  role: string;
  display_name: string;
  self_register: boolean;
  can_invite: string[];
  permissions: string[];
}

interface RbacPermission {
  key: string;
  domain: string;
  action: string;
  display_name: string;
  description: string;
}

interface PendingReg {
  id: string;
  email: string;
  full_name: string;
  company_name: string | null;
  requested_role: string;
  organization_type: string | null;
  reg_number: string | null;
  phone: string | null;
  motivation: string | null;
  created_at: string;
}

interface Invitation {
  id: string;
  email: string | null;
  role: string;
  organization: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  invited_by_name: string | null;
  accepted_by_name: string | null;
}

type SubTab = 'matrix' | 'registrations' | 'invitations';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DOMAIN_ORDER = ['trading', 'settlement', 'carbon', 'ipp', 'lender', 'offtaker', 'grid', 'regulator', 'esums', 'documents', 'audit', 'users'];
const ROLE_ORDER = ['admin', 'support', 'trader', 'ipp_developer', 'lender', 'offtaker', 'carbon_fund', 'grid_operator', 'regulator'];
const ROLE_SHORT: Record<string, string> = {
  admin: 'ADM', support: 'SUP', trader: 'TRD', ipp_developer: 'IPP',
  lender: 'LND', offtaker: 'OFF', carbon_fund: 'CRB', grid_operator: 'GRD', regulator: 'REG',
};

const DOMAIN_COLOR: Record<string, string> = {
  trading: '#4f9cf9', settlement: '#7c6af7', carbon: '#34c759', ipp: '#f59e0b',
  lender: '#06b6d4', offtaker: '#ec4899', grid: '#8b5cf6', regulator: '#ef4444',
  esums: '#10b981', documents: '#6b7280', audit: '#0B1F3A', users: '#d97706',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function RbacPanel() {
  const [tab, setTab] = useState<SubTab>('matrix');
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [permissions, setPermissions] = useState<RbacPermission[]>([]);
  const [pendingRegs, setPendingRegs] = useState<PendingReg[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState<Record<string, 'loading' | 'done' | 'error'>>({});
  const [rejectModal, setRejectModal] = useState<{ id: string; email: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/rbac/roles').then(r => (r.data as any).data ?? []),
      api.get('/rbac/permissions').then(r => (r.data as any).data ?? []),
    ]).then(([r, p]) => { setRoles(r); setPermissions(p); setLoading(false); });
  }, []);

  useEffect(() => {
    if (tab === 'registrations') {
      api.get('/rbac/registrations?status=pending').then(r => setPendingRegs((r.data as any).data ?? []));
    }
    if (tab === 'invitations') {
      api.get('/rbac/invitations').then(r => setInvitations((r.data as any).data ?? []));
    }
  }, [tab]);

  const handleApprove = async (regId: string) => {
    setActionState(s => ({ ...s, [regId]: 'loading' }));
    try {
      await api.post(`/rbac/registrations/${regId}/approve`, {});
      setActionState(s => ({ ...s, [regId]: 'done' }));
      setPendingRegs(prev => prev.filter(r => r.id !== regId));
    } catch { setActionState(s => ({ ...s, [regId]: 'error' })); }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setActionState(s => ({ ...s, [rejectModal.id]: 'loading' }));
    try {
      await api.post(`/rbac/registrations/${rejectModal.id}/reject`, { reason: rejectReason });
      setActionState(s => ({ ...s, [rejectModal.id]: 'done' }));
      setPendingRegs(prev => prev.filter(r => r.id !== rejectModal.id));
      setRejectModal(null);
      setRejectReason('');
    } catch { setActionState(s => ({ ...s, [rejectModal!.id]: 'error' })); }
  };

  const handleRevokeInv = async (invId: string) => {
    setActionState(s => ({ ...s, [`inv_${invId}`]: 'loading' }));
    try {
      await api.delete(`/rbac/me/invitations/${invId}`);
      setActionState(s => ({ ...s, [`inv_${invId}`]: 'done' }));
      setInvitations(prev => prev.map(i => i.id === invId ? { ...i, status: 'revoked' } : i));
    } catch { setActionState(s => ({ ...s, [`inv_${invId}`]: 'error' })); }
  };

  const domains = DOMAIN_ORDER.filter(d => permissions.some(p => p.domain === d));
  const sortedRoles = ROLE_ORDER.filter(r => roles.some(role => role.role === r));
  const permByDomain: Record<string, RbacPermission[]> = {};
  for (const p of permissions) {
    if (!permByDomain[p.domain]) permByDomain[p.domain] = [];
    permByDomain[p.domain].push(p);
  }
  const rolePermSet: Record<string, Set<string>> = {};
  for (const r of roles) rolePermSet[r.role] = new Set(r.permissions);

  const INV_COLS: Column<Invitation>[] = [
    { key: 'invited_by_name', header: 'Created by', width: '140px', render: r => <span>{r.invited_by_name ?? '—'}</span> },
    { key: 'email', header: 'Email', width: '200px', mono: true, render: r => <span>{r.email ?? <em style={{ color: 'var(--oe-text-4)' }}>open link</em>}</span> },
    { key: 'role', header: 'Role', width: '120px', render: r => <StatusPill label={r.role} variant="default" size="sm" /> },
    { key: 'status', header: 'Status', width: '100px', render: r => <StatusPill label={r.status} variant={r.status === 'accepted' ? 'green' : r.status === 'revoked' || r.status === 'expired' ? 'rose' : 'amber'} size="sm" /> },
    { key: 'expires_at', header: 'Expires', width: '130px', mono: true, render: r => <span>{r.expires_at.slice(0, 10)}</span> },
    {
      key: 'id', header: '', width: '80px', render: r => (
        r.status === 'pending'
          ? <button onClick={() => handleRevokeInv(r.id)} disabled={actionState[`inv_${r.id}`] === 'loading'}
              style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '5px', background: 'var(--oe-surf-2)', border: '1px solid var(--oe-border)', color: 'var(--oe-rose)', cursor: 'pointer' }}>
              Revoke
            </button>
          : null
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0', height: '100%' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '2px', padding: '0 0 16px 0', borderBottom: '1px solid var(--oe-border)', marginBottom: '20px', flexShrink: 0 }}>
        {(['matrix', 'registrations', 'invitations'] as SubTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '6px 14px', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: tab === t ? 'var(--oe-navy)' : 'transparent',
              color: tab === t ? '#fff' : 'var(--oe-text-3)',
              transition: 'all 80ms',
            }}>
            {t === 'matrix' ? 'Role Matrix' : t === 'registrations' ? `Pending Registrations${pendingRegs.length ? ` (${pendingRegs.length})` : ''}` : 'Invitations'}
          </button>
        ))}
      </div>

      {/* Matrix tab */}
      {tab === 'matrix' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ color: 'var(--oe-text-3)', fontSize: '13px', padding: '32px' }}>Loading…</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '11px', width: '100%', minWidth: '900px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 12px', background: 'var(--oe-surf)', position: 'sticky', left: 0, zIndex: 2, borderBottom: '2px solid var(--oe-border)', fontSize: '11px', color: 'var(--oe-text-3)', fontWeight: 600, minWidth: '200px' }}>
                      Permission
                    </th>
                    {sortedRoles.map(role => (
                      <th key={role} style={{ textAlign: 'center', padding: '6px 8px', background: 'var(--oe-surf)', borderBottom: '2px solid var(--oe-border)', fontSize: '11px', color: 'var(--oe-text-2)', fontWeight: 700, minWidth: '52px' }}>
                        {ROLE_SHORT[role] ?? role.slice(0, 3).toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {domains.map((domain, di) => (
                    <React.Fragment key={domain}>
                      <tr>
                        <td colSpan={sortedRoles.length + 1}
                          style={{ padding: '6px 12px', background: 'var(--oe-surf-2)', borderTop: di > 0 ? '2px solid var(--oe-border)' : undefined }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: DOMAIN_COLOR[domain] ?? 'var(--oe-text-3)' }}>
                            {domain}
                          </span>
                        </td>
                      </tr>
                      {(permByDomain[domain] ?? []).map((perm, pi) => (
                        <tr key={perm.key} style={{ background: pi % 2 === 0 ? 'transparent' : 'var(--oe-surf)' }}>
                          <td style={{ padding: '5px 12px', borderBottom: '1px solid var(--oe-border)', position: 'sticky', left: 0, background: pi % 2 === 0 ? 'var(--oe-surface)' : 'var(--oe-surf)', zIndex: 1 }}>
                            <div style={{ fontWeight: 600, color: 'var(--oe-text-1)', lineHeight: 1.2 }}>{perm.display_name}</div>
                            <div style={{ fontSize: '10px', color: 'var(--oe-text-4)', fontFamily: 'var(--oe-font-mono)' }}>{perm.key}</div>
                          </td>
                          {sortedRoles.map(role => {
                            const has = rolePermSet[role]?.has(perm.key);
                            return (
                              <td key={role} style={{ textAlign: 'center', padding: '5px', borderBottom: '1px solid var(--oe-border)' }}>
                                {has ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(52,199,89,0.15)' }}>
                                    <OeIcon name="check" size={10} color="#34c759" />
                                  </span>
                                ) : (
                                  <span style={{ display: 'inline-block', width: '10px', height: '2px', borderRadius: '1px', background: 'var(--oe-border)' }} />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>

              {/* Legend */}
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', padding: '16px 0', marginTop: '16px', borderTop: '1px solid var(--oe-border)' }}>
                {sortedRoles.map(role => {
                  const rd = roles.find(r => r.role === role);
                  return (
                    <div key={role} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--oe-text-3)', fontFamily: 'var(--oe-font-mono)' }}>{ROLE_SHORT[role]}</span>
                      <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{rd?.display_name ?? role}</span>
                      {rd?.self_register && <StatusPill label="self-reg" variant="blue" size="sm" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pending Registrations tab */}
      {tab === 'registrations' && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {pendingRegs.length === 0 && (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--oe-text-3)', fontSize: '13px' }}>
              No pending registrations
            </div>
          )}
          {pendingRegs.map(reg => (
            <div key={reg.id} style={{ border: '1px solid var(--oe-border)', borderRadius: '10px', padding: '16px 20px', background: 'var(--oe-surf)', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--oe-text-1)' }}>{reg.full_name}</span>
                  <StatusPill label={reg.requested_role} variant="blue" size="sm" />
                  {reg.company_name && <span style={{ fontSize: '12px', color: 'var(--oe-text-3)' }}>{reg.company_name}</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', fontSize: '12px', color: 'var(--oe-text-2)', marginBottom: '8px' }}>
                  <span><strong>Email:</strong> {reg.email}</span>
                  {reg.phone && <span><strong>Phone:</strong> {reg.phone}</span>}
                  {reg.reg_number && <span><strong>Reg #:</strong> {reg.reg_number}</span>}
                  {reg.organization_type && <span><strong>Org type:</strong> {reg.organization_type}</span>}
                  <span><strong>Applied:</strong> {reg.created_at.slice(0, 10)}</span>
                </div>
                {reg.motivation && (
                  <div style={{ fontSize: '12px', color: 'var(--oe-text-3)', padding: '8px', background: 'var(--oe-surf-2)', borderRadius: '6px', fontStyle: 'italic' }}>
                    "{reg.motivation}"
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                <button onClick={() => handleApprove(reg.id)}
                  disabled={actionState[reg.id] === 'loading' || actionState[reg.id] === 'done'}
                  style={{ padding: '7px 18px', borderRadius: '7px', background: 'var(--oe-green)', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: actionState[reg.id] ? 0.6 : 1 }}>
                  {actionState[reg.id] === 'loading' ? 'Approving…' : actionState[reg.id] === 'done' ? 'Approved' : 'Approve'}
                </button>
                <button onClick={() => setRejectModal({ id: reg.id, email: reg.email })}
                  style={{ padding: '7px 18px', borderRadius: '7px', background: 'var(--oe-surf-2)', color: 'var(--oe-rose)', border: '1px solid var(--oe-border)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invitations tab */}
      {tab === 'invitations' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <DataTable columns={INV_COLS} rows={invitations} emptyMessage="No invitations found" />
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,31,58,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--oe-surface)', border: '1px solid var(--oe-border)', borderRadius: '12px', padding: '24px', width: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: 'var(--oe-text-1)' }}>Reject Registration</h3>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: 'var(--oe-text-3)' }}>{rejectModal.email}</p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection (sent to applicant)…"
              style={{ width: '100%', minHeight: '80px', padding: '10px', borderRadius: '7px', border: '1px solid var(--oe-border)', background: 'var(--oe-surf)', color: 'var(--oe-text-1)', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px', justifyContent: 'flex-end' }}>
              <button onClick={() => setRejectModal(null)} style={{ padding: '8px 16px', borderRadius: '7px', background: 'var(--oe-surf-2)', border: '1px solid var(--oe-border)', color: 'var(--oe-text-2)', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleReject} style={{ padding: '8px 16px', borderRadius: '7px', background: 'var(--oe-rose)', border: 'none', color: '#fff', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
