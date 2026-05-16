// ════════════════════════════════════════════════════════════════════════
// GridOutageDetailPage — drill-in for /grid-operator/outages/:id
//
// Per-outage response timeline. Pulls the existing outage-responses
// list filtered by outage_id and renders the response history with
// inline "Log response" modal so the operator can drive the incident
// to restored / closed from one screen.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';

type Response = {
  id: string;
  outage_id: string;
  responder_id: string;
  response_type:
    | 'acknowledged' | 'dispatched_crew' | 'rerouted' | 'restored' | 'escalated' | 'closed';
  notes: string | null;
  eta_minutes: number | null;
  responded_at: string;
};

export function GridOutageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setErr(null);
    try {
      const res = await api.get(`/grid-operator/outage-responses?outage_id=${encodeURIComponent(id)}`);
      setResponses((res.data?.data as Response[]) || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // Current state — newest non-closed response, or "closed" if any
  // close response exists.
  const sorted = [...responses].sort((a, b) =>
    new Date(b.responded_at).getTime() - new Date(a.responded_at).getTime(),
  );
  const isClosed = responses.some(r => r.response_type === 'closed');
  const isRestored = !isClosed && responses.some(r => r.response_type === 'restored');
  const latestState = isClosed ? 'closed' : isRestored ? 'restored' : (sorted[0]?.response_type || 'open');
  const firstResponse = [...responses].sort((a, b) =>
    new Date(a.responded_at).getTime() - new Date(b.responded_at).getTime(),
  )[0];

  return (
    <div className="p-6 lg:p-10 space-y-4 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[12px]" style={{ color: '#6b7685' }}>
            <Link to="/grid-operator/workstation" className="hover:underline">Grid ops workstation</Link>
            <span>/</span>
            <span style={{ color: '#0f1c2e', fontWeight: 600 }}>Outage</span>
          </div>
          <h1 className="mt-2 font-display text-[24px] font-bold tracking-tight" style={{ color: 'var(--oe-on-surface)' }}>
            Outage <span className="font-mono text-[20px]">{(id || '').slice(0, 16)}…</span>
          </h1>
          <p className="text-[13px] text-[#3d4756]">
            <Pill tone={isClosed || isRestored ? 'good' : latestState === 'escalated' ? 'bad' : 'warn'}>
              {latestState.replace(/_/g, ' ')}
            </Pill>
            {' '}· {responses.length} response{responses.length === 1 ? '' : 's'} logged
            {firstResponse && <> · first response {new Date(firstResponse.responded_at).toLocaleString()}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/grid-operator/workstation?tab=outage')} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <ArrowLeft size={12} /> Workstation
          </button>
          <button onClick={() => void load()} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
          {!isClosed && (
            <button onClick={() => setLogging(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
              + Log response
            </button>
          )}
        </div>
      </header>

      {loading && <Skeleton variant="card" rows={4} />}
      {err && <ErrorBanner message={err} onRetry={() => void load()} />}

      {!loading && !err && responses.length === 0 && (
        <div className="rounded-xl border border-[#dde4ec] bg-white p-6 text-center">
          <div className="text-[14px] font-semibold text-[#0f1c2e]">No responses logged</div>
          <div className="text-[12px] text-[#6b7685] mt-1">Log the first response (acknowledged / dispatched crew / etc.) to start the incident timeline.</div>
        </div>
      )}

      {!loading && !err && responses.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#6b7685' }}>Response timeline (newest first)</h2>
          <ol className="space-y-2">
            {sorted.map(r => (
              <li key={r.id} className="rounded-xl border border-[#dde4ec] bg-white p-3">
                <div className="flex items-center gap-2 text-[12px]">
                  <Pill tone={r.response_type === 'restored' || r.response_type === 'closed' ? 'good' : r.response_type === 'escalated' ? 'bad' : 'warn'}>
                    {r.response_type.replace(/_/g, ' ')}
                  </Pill>
                  <span className="text-[#6b7685]">by <span className="font-mono">{r.responder_id.slice(0, 14)}…</span></span>
                  <span className="text-[#6b7685] ml-auto">{new Date(r.responded_at).toLocaleString()}</span>
                </div>
                {r.eta_minutes != null && (
                  <div className="mt-1 text-[11px] text-[#6b7685]">ETA: {r.eta_minutes} min</div>
                )}
                {r.notes && <div className="mt-1 text-[13px] whitespace-pre-wrap">{r.notes}</div>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {logging && (
        <ActionModal
          title="Log outage response"
          submitLabel="Log"
          fields={[
            { key: 'response_type', label: 'Response type', type: 'select', required: true, options: [
              { value: 'acknowledged', label: 'Acknowledged' },
              { value: 'dispatched_crew', label: 'Dispatched crew' },
              { value: 'rerouted', label: 'Rerouted' },
              { value: 'restored', label: 'Restored' },
              { value: 'escalated', label: 'Escalated' },
              { value: 'closed', label: 'Closed' },
            ] },
            { key: 'eta_minutes', label: 'ETA (minutes)', type: 'number' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setLogging(false)}
          onSubmit={async (v) => {
            const body: any = { outage_id: id, response_type: v.response_type, notes: v.notes };
            if (v.eta_minutes) body.eta_minutes = Number(v.eta_minutes);
            await api.post('/grid-operator/outage-responses', body);
            setLogging(false); await load();
          }}
        />
      )}
    </div>
  );
}
