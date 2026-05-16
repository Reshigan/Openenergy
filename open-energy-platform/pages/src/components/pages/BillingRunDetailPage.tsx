// ════════════════════════════════════════════════════════════════════════
// BillingRunDetailPage — drill-in for /admin-platform/billing-runs/:id
//
// Single billing-run record: period + run type + outcome + KPI tiles.
// Linked tenant_invoices (if any) are surfaced for review.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { Pill } from '../launch/WorkstationShell';

type Run = {
  id: string;
  run_type: 'monthly' | 'adhoc' | 'correction';
  period_start: string;
  period_end: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partially_completed';
  tenants_billed: number;
  total_zar: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  initiated_by: string | null;
  created_at: string;
};

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

export function BillingRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<Run | null>(null);
  const [tenantInvoices, setTenantInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setErr(null);
    try {
      const res = await api.get('/admin-platform/billing-runs');
      const all = (res.data?.data as Run[]) || [];
      setRun(all.find(r => r.id === id) || null);
      // Best-effort: pull tenant invoices for the same period if endpoint exists.
      const r = all.find(x => x.id === id);
      if (r) {
        const tiRes = await api.get(`/admin-platform/tenant-invoices?period_start=${r.period_start}&period_end=${r.period_end}`)
          .catch(() => ({ data: { data: [] } }));
        setTenantInvoices((tiRes.data?.data as any[]) || []);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={6} /></div>;
  if (err) return <div className="p-6"><ErrorBanner message={err} onRetry={() => void load()} /></div>;
  if (!run) return <div className="p-6"><ErrorBanner message="Billing run not found" /></div>;

  const duration = run.started_at && run.completed_at
    ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
    : null;

  return (
    <div className="p-6 lg:p-10 space-y-4 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[12px]" style={{ color: '#6b7685' }}>
            <Link to="/admin-platform/workstation?tab=billing" className="hover:underline">Admin workstation</Link>
            <span>/</span>
            <span style={{ color: '#0f1c2e', fontWeight: 600 }}>Billing run</span>
          </div>
          <h1 className="mt-2 font-display text-[24px] font-bold tracking-tight" style={{ color: 'var(--oe-on-surface)' }}>
            {run.run_type === 'monthly' ? 'Monthly' : run.run_type === 'correction' ? 'Correction' : 'Ad-hoc'} billing · {run.period_start} → {run.period_end}
          </h1>
          <p className="text-[13px] text-[#3d4756]">
            <Pill tone={run.status === 'completed' ? 'good' : run.status === 'failed' ? 'bad' : 'warn'}>
              {run.status.replace(/_/g, ' ')}
            </Pill>
            {' '}· created {new Date(run.created_at).toLocaleString()}
            {run.initiated_by && <> by <span className="font-mono text-[11px]">{run.initiated_by.slice(0, 14)}…</span></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/admin-platform/workstation?tab=billing')} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <ArrowLeft size={12} /> Workstation
          </button>
          <button onClick={() => void load()} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Tenants billed" value={String(run.tenants_billed)} />
        <Kpi label="Total invoiced" value={formatZAR(run.total_zar)} />
        <Kpi label="Avg per tenant" value={run.tenants_billed > 0 ? formatZAR(run.total_zar / run.tenants_billed) : '—'} />
        <Kpi label="Duration" value={duration != null ? `${duration}s` : '—'} />
      </div>

      {run.error_message && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="text-[10px] uppercase tracking-wide text-red-700 mb-1">Error</div>
          <div className="text-[13px] whitespace-pre-wrap text-red-700">{run.error_message}</div>
        </div>
      )}

      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#6b7685' }}>Run timeline</h2>
        <div className="rounded-xl border border-[#dde4ec] bg-white p-4 space-y-2 text-[13px]">
          <div className="flex items-center gap-2">
            <Pill tone="info">Created</Pill>
            <span className="text-[#6b7685]">{new Date(run.created_at).toLocaleString()}</span>
          </div>
          {run.started_at && (
            <div className="flex items-center gap-2">
              <Pill tone="info">Started</Pill>
              <span className="text-[#6b7685]">{new Date(run.started_at).toLocaleString()}</span>
            </div>
          )}
          {run.completed_at && (
            <div className="flex items-center gap-2">
              <Pill tone={run.status === 'completed' ? 'good' : run.status === 'failed' ? 'bad' : 'warn'}>
                {run.status === 'completed' ? 'Completed' : run.status === 'failed' ? 'Failed' : 'Stopped'}
              </Pill>
              <span className="text-[#6b7685]">{new Date(run.completed_at).toLocaleString()}</span>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#6b7685' }}>
          Tenant invoices for this period ({tenantInvoices.length})
        </h2>
        {tenantInvoices.length === 0 ? (
          <div className="rounded-xl border border-[#dde4ec] bg-white p-4 text-[12px] text-[#6b7685]">
            No tenant invoices linked to this period (endpoint may not be exposed yet, or the run hasn't produced invoices).
          </div>
        ) : (
          <div className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-[#f8fafc] text-left text-[10px] uppercase tracking-wide text-[#6b7685]">
                <tr>
                  <th className="px-4 py-2">Invoice</th>
                  <th className="px-4 py-2">Tenant</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {tenantInvoices.map(ti => (
                  <tr key={ti.id} className="border-t border-[#e5ebf2]">
                    <td className="px-4 py-2"><span className="font-mono text-[11px]">{ti.invoice_number || ti.id.slice(0, 14)}…</span></td>
                    <td className="px-4 py-2"><span className="font-mono text-[11px]">{(ti.tenant_id || '').slice(0, 14)}…</span></td>
                    <td className="px-4 py-2">{formatZAR(ti.amount_zar || ti.total_amount || 0)}</td>
                    <td className="px-4 py-2"><Pill tone={ti.status === 'paid' ? 'good' : 'info'}>{ti.status || '—'}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
