// ════════════════════════════════════════════════════════════════════════
// LicenceActionDetailPage — drill-in for /regulator/licence-actions/:id
//
// Single licence action workflow record: action type + current status +
// initiated/decided/executed timestamps + transition history (derived
// from the row's timestamps) + transition action button.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';

const LICENCE_TRANSITIONS = [
  { value: 'pending_hearing', label: 'Schedule hearing' },
  { value: 'decided', label: 'Decide' },
  { value: 'executed', label: 'Execute' },
  { value: 'appealed', label: 'Appeal' },
  { value: 'reversed', label: 'Reverse' },
];

export function LicenceActionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [row, setRow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setErr(null);
    try {
      const res = await api.get('/regulator/licence-actions');
      const all = (res.data?.data as any[]) || [];
      setRow(all.find(r => r.id === id) || null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={6} /></div>;
  if (err) return <div className="p-6"><ErrorBanner message={err} onRetry={() => void load()} /></div>;
  if (!row) return <div className="p-6"><ErrorBanner message="Licence action not found" /></div>;

  type Tone = 'info' | 'good' | 'bad';
  const timelineRaw: Array<{ ts: string | null; label: string; tone: Tone }> = [
    { ts: row.initiated_at, label: 'Initiated', tone: 'info' },
    { ts: row.decided_at, label: 'Decided', tone: 'good' },
    { ts: row.status === 'executed' ? row.updated_at : null, label: 'Executed', tone: 'good' },
    { ts: row.status === 'appealed' ? row.updated_at : null, label: 'Appealed', tone: 'bad' },
    { ts: row.status === 'reversed' ? row.updated_at : null, label: 'Reversed', tone: 'bad' },
  ];
  const timeline = timelineRaw.filter((t): t is { ts: string; label: string; tone: Tone } => t.ts != null);

  return (
    <div className="p-6 lg:p-10 space-y-4 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[12px]" style={{ color: '#6b7685' }}>
            <Link to="/regulator-suite/workstation" className="hover:underline">Regulator workstation</Link>
            <span>/</span>
            <span style={{ color: '#0f1c2e', fontWeight: 600 }}>Licence action</span>
          </div>
          <h1 className="mt-2 font-display text-[24px] font-bold tracking-tight" style={{ color: 'var(--oe-on-surface)' }}>
            <span className="capitalize">{row.action_type}</span>
          </h1>
          <p className="text-[13px] text-[#3d4756]">
            <Pill tone={row.status === 'executed' || row.status === 'decided' ? 'good' : row.status === 'reversed' ? 'bad' : 'info'}>{row.status.replace(/_/g, ' ')}</Pill>
            {row.licence_id && <> · Licence <span className="font-mono text-[11px]">{row.licence_id.slice(0, 14)}…</span></>}
            {row.application_id && <> · Application <span className="font-mono text-[11px]">{row.application_id.slice(0, 14)}…</span></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => navigate('/regulator-suite/workstation?tab=licences')} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <ArrowLeft size={12} /> Workstation
          </button>
          <button type="button" onClick={() => void load()} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
          {row.status !== 'executed' && row.status !== 'reversed' && (
            <button type="button" onClick={() => setTransitioning(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
              Transition
            </button>
          )}
        </div>
      </header>

      {row.decision_rationale && (
        <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
          <div className="text-[10px] uppercase tracking-wide text-[#6b7685] mb-1">Decision rationale</div>
          <div className="text-[13px] whitespace-pre-wrap">{row.decision_rationale}</div>
        </div>
      )}

      {row.notes && (
        <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
          <div className="text-[10px] uppercase tracking-wide text-[#6b7685] mb-1">Notes</div>
          <div className="text-[13px] whitespace-pre-wrap">{row.notes}</div>
        </div>
      )}

      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#6b7685' }}>Timeline</h2>
        <div className="rounded-xl border border-[#dde4ec] bg-white p-4 space-y-2">
          {timeline.map((t, idx) => (
            <div key={idx} className="flex items-center gap-3 text-[13px]">
              <Pill tone={t.tone}>{t.label}</Pill>
              <span className="text-[#6b7685]">{new Date(t.ts!).toLocaleString()}</span>
            </div>
          ))}
          {row.appeal_deadline && (
            <div className="flex items-center gap-3 text-[13px]">
              <Pill tone="warn">Appeal deadline</Pill>
              <span className="text-[#6b7685]">{new Date(row.appeal_deadline).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </section>

      {transitioning && (
        <ActionModal
          title={`Transition licence action · current: ${row.status}`}
          submitLabel="Transition"
          fields={[
            { key: 'to', label: 'To', type: 'select', required: true, options: LICENCE_TRANSITIONS },
            { key: 'rationale', label: 'Decision rationale', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setTransitioning(false)}
          onSubmit={async (v) => {
            await api.post(`/regulator/licence-actions/${id}/transition`, v);
            setTransitioning(false); await load();
          }}
        />
      )}
    </div>
  );
}
