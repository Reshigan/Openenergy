// ════════════════════════════════════════════════════════════════════════
// VintageDetailPage — drill-in for /carbon-registry/vintages/:id
//
// Single vintage workflow record: current stage + retirement summary +
// related retirement certificates issued against this vintage.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';

const STAGE_OPTIONS = [
  { value: 'validated', label: 'Validated' },
  { value: 'listed', label: 'Listed' },
  { value: 'traded', label: 'Traded' },
  { value: 'retired_partial', label: 'Retired (partial)' },
  { value: 'retired_full', label: 'Retired (full)' },
  { value: 'expired', label: 'Expired' },
];

export function VintageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [row, setRow] = useState<any>(null);
  const [certs, setCerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setErr(null);
    try {
      // Pull list + filter — no GET-by-id endpoint, but workflow list is bounded
      const res = await api.get('/carbon-registry/vintage-workflow');
      const all = (res.data?.data as any[]) || [];
      setRow(all.find(r => r.id === id) || null);
      const c = await api.get('/carbon-registry/retirement-certificates').catch(() => ({ data: { data: [] } }));
      const allCerts = (c.data?.data as any[]) || [];
      setCerts(allCerts.filter(rc => rc.retirement_id === (all.find(r => r.id === id)?.vintage_id)));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={6} /></div>;
  if (err) return <div className="p-6"><ErrorBanner message={err} onRetry={() => void load()} /></div>;
  if (!row) return <div className="p-6"><ErrorBanner message="Vintage workflow row not found" /></div>;

  return (
    <div className="p-6 lg:p-10 space-y-4 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[12px]" style={{ color: '#6b7685' }}>
            <Link to="/carbon-registry/workstation" className="hover:underline">Carbon workstation</Link>
            <span>/</span>
            <span style={{ color: '#0f1c2e', fontWeight: 600 }}>Vintage</span>
          </div>
          <h1 className="mt-2 font-display text-[24px] font-bold tracking-tight" style={{ color: 'var(--oe-on-surface)' }}>
            Vintage <span className="font-mono text-[20px]">{(row.vintage_id || '').slice(0, 16)}…</span>
          </h1>
          <p className="text-[13px] text-[#3d4756]">
            <Pill tone={row.current_stage === 'retired_full' ? 'good' : 'info'}>{row.current_stage.replace(/_/g, ' ')}</Pill>
            {' '}· last updated {new Date(row.updated_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/carbon-registry/workstation')} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <ArrowLeft size={12} /> Workstation
          </button>
          <button onClick={() => void load()} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
          {row.current_stage !== 'retired_full' && row.current_stage !== 'expired' && (
            <button onClick={() => setAdvancing(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
              Advance stage
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Current stage" value={row.current_stage.replace(/_/g, ' ')} />
        <Kpi label="Retired tCO₂e" value={Number(row.retired_volume_tco2e || 0).toFixed(1)} />
        <Kpi label="Outstanding tCO₂e" value={Number(row.outstanding_tco2e || 0).toFixed(1)} />
        <Kpi label="Certificates issued" value={String(certs.length)} />
      </div>

      {row.notes && (
        <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
          <div className="text-[10px] uppercase tracking-wide text-[#6b7685] mb-1">Notes</div>
          <div className="text-[13px] whitespace-pre-wrap">{row.notes}</div>
        </div>
      )}

      <Section title={`Retirement certificates (${certs.length})`}>
        {certs.length === 0 ? <Empty label="No certificates issued for this vintage." /> : (
          <Table headers={['Certificate', 'Beneficiary', 'tCO₂e', 'Status', 'Issued']}>
            {certs.map(c => (
              <tr key={c.id} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2"><span className="font-mono text-[11px]">{c.certificate_number}</span></td>
                <td className="px-4 py-2">{c.beneficiary_name || '—'}</td>
                <td className="px-4 py-2">{Number(c.retired_volume_tco2e || 0).toFixed(1)}</td>
                <td className="px-4 py-2"><Pill tone={c.status === 'delivered' ? 'good' : c.status === 'revoked' ? 'bad' : 'info'}>{c.status}</Pill></td>
                <td className="px-4 py-2 text-[11px]">{c.issued_at ? new Date(c.issued_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {advancing && (
        <ActionModal
          title={`Advance vintage stage · current: ${row.current_stage}`}
          submitLabel="Advance"
          fields={[
            { key: 'to_stage', label: 'Next stage', type: 'select', required: true, options: STAGE_OPTIONS },
          ] as FieldSpec[]}
          onClose={() => setAdvancing(false)}
          onSubmit={async (v) => {
            await api.post(`/carbon-registry/vintage-workflow/${id}/advance`, { to_stage: v.to_stage });
            setAdvancing(false); await load();
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
