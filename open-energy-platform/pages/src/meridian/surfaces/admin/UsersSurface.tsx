// pages/src/meridian/surfaces/admin/UsersSurface.tsx
//
// Meridian surface — "Users & access" (admin role). Self-contained ListingTable over
// GET /api/admin/users + an "Invite user" ActionModal (POST /api/admin/users) and a per-row
// "Manage" ActionModal that PUTs status / role / subscription tier / B-BBEE level
// (PUT /api/admin/users/:id — step-up gated server-side; a 401 surfaces in the modal).
// Bucket B CRUD surface. Registered as `admin:users` in surfaces.tsx, reached from Atlas (⌘K)
// via the roleData feature key `users`.
import React, { useState } from 'react';
import { ListingTable, Pill, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

const ROLE_OPTS = [
  { value: 'admin', label: 'Admin' }, { value: 'trader', label: 'Trader' },
  { value: 'ipp_developer', label: 'IPP developer' }, { value: 'offtaker', label: 'Offtaker' },
  { value: 'lender', label: 'Lender' }, { value: 'carbon_fund', label: 'Carbon fund' },
  { value: 'regulator', label: 'Regulator' }, { value: 'grid_operator', label: 'Grid operator' },
  { value: 'support', label: 'Support' }, { value: 'esums_owner', label: 'ESCO / O&M' },
];
const TIER_OPTS = [
  { value: 'free', label: 'Free' }, { value: 'standard', label: 'Standard' },
  { value: 'professional', label: 'Professional' }, { value: 'enterprise', label: 'Enterprise' },
];

function statusTone(s: string): 'good' | 'warn' | 'bad' | 'neutral' {
  if (s === 'active') return 'good';
  if (s === 'suspended' || s === 'disabled') return 'bad';
  if (s === 'pending') return 'warn';
  return 'neutral';
}

export default function UsersSurface(_props: { role: string }) {
  const [inviting, setInviting] = useState(false);
  const [managing, setManaging] = useState<any | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const onRefresh = () => setRefreshKey((k) => k + 1);
  return (
    <div>
      <div className="flex justify-end mb-3">
        <button type="button" onClick={() => setInviting(true)} className="h-9 px-3 rounded-md bg-[var(--petrol)] text-white text-[12px] font-semibold">
          + Invite user
        </button>
      </div>
      <ListingTable
        key={refreshKey}
        endpoint="/admin/users"
        rowKey={(r) => r.id}
        empty={{ title: 'No users', description: 'Invite the first user to this tenant.' }}
        columns={[
          { key: 'email', label: 'User', render: (r) => (
            <div className="leading-tight">
              <div className="font-medium">{r.name || r.email}</div>
              <div className="text-[10px] text-[var(--ink3)]">{r.email}{r.company_name ? ` · ${r.company_name}` : ''}</div>
            </div>
          ) },
          { key: 'role', label: 'Role', render: (r) => <Pill tone="info">{(r.role || '—').replace(/_/g, ' ')}</Pill> },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={statusTone(r.status)}>{r.status || '—'}</Pill> },
          { key: 'kyc_status', label: 'KYC', render: (r) => <Pill tone={r.kyc_status === 'verified' ? 'good' : r.kyc_status === 'rejected' ? 'bad' : 'warn'}>{r.kyc_status || 'none'}</Pill> },
          { key: 'subscription_tier', label: 'Tier', render: (r) => <span className="text-[11px] uppercase">{r.subscription_tier || 'free'}</span> },
          { key: 'bbbee_level', label: 'B-BBEE', align: 'right', render: (r) => r.bbbee_level ?? '—' },
          { key: 'last_login', label: 'Last login', render: (r) => r.last_login ? new Date(r.last_login).toLocaleDateString() : '—' },
          { key: '_actions', label: '', render: (r) => (
            <button type="button" onClick={() => setManaging(r)} className="px-2 py-1 text-[11px] bg-[var(--petrol)] text-white rounded-md">Manage</button>
          ) },
        ]}
      />
      {inviting && (
        <ActionModal
          title="Invite user"
          submitLabel="Send invite"
          fields={[
            { key: 'email', label: 'Email', required: true, placeholder: 'name@company.co.za' },
            { key: 'name', label: 'Full name', required: true },
            { key: 'role', label: 'Role', type: 'select', required: true, options: ROLE_OPTS },
          ] as FieldSpec[]}
          onClose={() => setInviting(false)}
          onSubmit={async (v) => {
            await api.post('/admin/users', v);
            setInviting(false); onRefresh();
          }}
        />
      )}
      {managing && (
        <ActionModal
          title={`Manage ${managing.name || managing.email}`}
          submitLabel="Apply changes"
          fields={[
            { key: 'status', label: 'Status', type: 'select', defaultValue: managing.status || 'active', options: [
              { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'pending', label: 'Pending' },
            ] },
            { key: 'role', label: 'Role', type: 'select', defaultValue: managing.role, options: ROLE_OPTS },
            { key: 'subscription_tier', label: 'Subscription tier', type: 'select', defaultValue: managing.subscription_tier || 'free', options: TIER_OPTS },
            { key: 'bbbee_level', label: 'B-BBEE level (1–8, blank = unchanged)', type: 'number', placeholder: String(managing.bbbee_level ?? '') },
          ] as FieldSpec[]}
          onClose={() => setManaging(null)}
          onSubmit={async (v) => {
            const body: any = { status: v.status, role: v.role, subscription_tier: v.subscription_tier };
            if (v.bbbee_level) body.bbbee_level = Number(v.bbbee_level);
            await api.put(`/admin/users/${managing.id}`, body);
            setManaging(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}
