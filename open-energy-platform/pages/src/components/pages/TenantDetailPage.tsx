// ════════════════════════════════════════════════════════════════════════
// TenantDetailPage — drill-in for /admin-platform/tenants/:id
//
// Single tenant view: participant header + lifecycle events filtered to
// this tenant + flag overrides scoped to this tenant + audit summary.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setErr(null);
    try {
      const t = await api.get(`/admin/tenants/${encodeURIComponent(id)}`).catch(() => null);
      setTenant(t?.data?.data);
      const ev = await api.get(`/admin-platform/tenant-events?tenant_id=${id}`).catch(() => ({ data: { data: [] } }));
      setEvents((ev.data?.data as any[]) || []);
      // Flag overrides — pull all and filter client-side by scope_id == id
      const fl = await api.get(`/admin-platform/flag-overrides`).catch(() => ({ data: { data: [] } }));
      const allFlags = (fl.data?.data as any[]) || [];
      setFlags(allFlags.filter(f => f.scope_id === id));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={6} /></div>;
  if (err) return <div className="p-6"><ErrorBanner message={err} onRetry={() => void load()} /></div>;
  if (!tenant) return <div className="p-6"><ErrorBanner message="Tenant not found" /></div>;

  return (
    <div className="p-6 lg:p-10 space-y-4 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[12px]" style={{ color: '#6b7685' }}>
            <Link to="/cockpit" className="hover:underline">Admin workstation</Link>
            <span>/</span>
            <span style={{ color: '#0f1c2e', fontWeight: 600 }}>Tenant</span>
          </div>
          <h1 className="mt-2 font-display text-[24px] font-bold tracking-tight" style={{ color: 'var(--oe-on-surface)' }}>
            {tenant.display_name || tenant.slug || id}
          </h1>
          <p className="text-[13px] text-[#3d4756]">
            <Pill tone="info">slug: {tenant.slug || '—'}</Pill>
            {' '}<Pill tone="neutral">{tenant.participant_count ?? 0} participants</Pill>
            {' '}· created {tenant.created_at ? new Date(tenant.created_at).toLocaleDateString() : '—'}
          </p>
          {tenant.description && (
            <p className="text-[12px] text-[#6b7685] mt-1 max-w-2xl">{tenant.description}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => navigate('/cockpit')} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <ArrowLeft size={12} /> Workstation
          </button>
          <button type="button" onClick={() => void load()} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
          <button type="button" onClick={() => setFiling(true)} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold">
            + Log event
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Participants" value={String(tenant.participant_count ?? 0)} />
        <Kpi label="Lifecycle events" value={String(events.length)} />
        <Kpi label="Flag overrides" value={String(flags.length)} />
        <Kpi label="Slug" value={tenant.slug || '—'} />
      </div>

      <Section title={`Lifecycle events (${events.length})`}>
        {events.length === 0 ? <Empty label="No lifecycle events. Log provisioned / activated / KYC events from here." /> : (
          <Table headers={['When', 'Event', 'Actor', 'Reason']}>
            {events.map(e => (
              <tr key={e.id} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2 text-[11px] text-[#6b7685]">{new Date(e.occurred_at).toLocaleString()}</td>
                <td className="px-4 py-2"><Pill tone={e.event_type === 'activated' || e.event_type === 'reactivated' || e.event_type === 'kyc_approved' ? 'good' : e.event_type === 'suspended' || e.event_type === 'offboarded' || e.event_type === 'kyc_rejected' ? 'bad' : 'info'}>{e.event_type.replace(/_/g, ' ')}</Pill></td>
                <td className="px-4 py-2"><span className="font-mono text-[11px]">{(e.actor_id || '').slice(0, 12)}…</span></td>
                <td className="px-4 py-2 text-[11px]"><span className="block truncate max-w-md" title={e.reason || ''}>{e.reason || '—'}</span></td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={`Tenant-scoped flag overrides (${flags.length})`}>
        {flags.length === 0 ? <Empty label="No tenant-scoped flag overrides." /> : (
          <Table headers={['Flag', 'Was', 'Now', 'Reason', 'When']}>
            {flags.map(f => (
              <tr key={f.id} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2"><span className="font-mono text-[11px]">{f.flag_key}</span></td>
                <td className="px-4 py-2">{f.previous_value || '—'}</td>
                <td className="px-4 py-2">{f.new_value}</td>
                <td className="px-4 py-2 text-[11px]"><span className="block truncate max-w-md" title={f.reason || ''}>{f.reason || '—'}</span></td>
                <td className="px-4 py-2 text-[11px] text-[#6b7685]">{new Date(f.occurred_at).toLocaleString()}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {filing && (
        <ActionModal
          title="Log tenant lifecycle event"
          submitLabel="Log"
          fields={[
            { key: 'event_type', label: 'Event', type: 'select', required: true, options: [
              { value: 'provisioned', label: 'Provisioned' },
              { value: 'activated', label: 'Activated' },
              { value: 'plan_changed', label: 'Plan changed' },
              { value: 'kyc_approved', label: 'KYC approved' },
              { value: 'kyc_rejected', label: 'KYC rejected' },
              { value: 'suspended', label: 'Suspended' },
              { value: 'reactivated', label: 'Reactivated' },
              { value: 'offboarded', label: 'Offboarded' },
              { value: 'data_exported', label: 'Data exported' },
              { value: 'data_erased', label: 'Data erased' },
            ] },
            { key: 'reason', label: 'Reason', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/admin-platform/tenant-events', { tenant_id: id, ...v });
            setFiling(false); await load();
          }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white p-3">
      <div className="text-[10px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className="mt-1 text-[16px] font-bold">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#6b7685' }}>{title}</h2>
      {children}
    </section>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="bg-[#f8fafc] text-left text-[10px] uppercase tracking-wide text-[#6b7685]">
          <tr>{headers.map(h => <th key={h} className="px-4 py-2">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="rounded-xl border border-[#dde4ec] bg-white p-4 text-[12px] text-[#6b7685]">{label}</div>;
}
