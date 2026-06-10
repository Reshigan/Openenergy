// ════════════════════════════════════════════════════════════════════════
// LenderWorkoutPage — covenant-breach workout queue (L4 SPA for lender).
//
// Companion to migration 055 / src/routes/lender-suite.ts L4 endpoints.
// Lists every lender_covenant_actions row, shows the originating
// covenant test (DSCR, availability, etc.) inline, and exposes the
// state-machine transitions (open → investigating → resolved | rejected)
// plus a one-click "Advise" button that calls the deterministic
// covenant-advisor and surfaces the recommendation + rationale inline.
//
// Per [[feedback-ai-subtle-active]] — AI is an inline card on the row,
// not a separate tab. Accept logs to ai_lender_advice.accepted_at.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lightbulb, X, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';

type WorkoutAction = {
  id: string;
  covenant_test_id: string;
  covenant_id: string;
  status: 'open' | 'investigating' | 'resolved' | 'rejected';
  action_type:
    | 'cure_plan' | 'waiver_request' | 'amendment_request'
    | 'acceleration_notice' | 'workout' | 'no_action';
  severity: 'low' | 'medium' | 'high' | 'critical';
  filed_by: string;
  filed_at: string;
  notes: string | null;
  cure_deadline: string | null;
  resolution_outcome: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  // joined covenant + test context
  covenant_code: string;
  covenant_name: string;
  covenant_type: string;
  measured_value: number | null;
  threshold: number | null;
  result: string | null;
  test_period: string | null;
};

type Advice = {
  advice_id: string;
  recommendation:
    | 'cure_plan' | 'waiver' | 'amendment' | 'acceleration' | 'workout' | 'no_action';
  rationale: string;
  confidence: number;
  source: 'deterministic' | 'ai_gateway' | 'fallback';
};

const SEVERITY_PILL: Record<string, string> = {
  low: 'bg-[#eef2f7] text-[#2d3748]',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-100 text-red-700',
};
const STATUS_PILL: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  investigating: 'bg-amber-100 text-amber-800',
  resolved: 'bg-green-100 text-green-700',
  rejected: 'bg-[#e8ecf0] text-[#2d3748]',
};
const ACTION_PILL: Record<string, string> = {
  cure_plan: 'bg-blue-50 text-blue-700',
  waiver_request: 'bg-amber-50 text-amber-800',
  amendment_request: 'bg-indigo-50 text-indigo-700',
  acceleration_notice: 'bg-red-50 text-red-700',
  workout: 'bg-purple-50 text-purple-700',
  no_action: 'bg-[#eef2f7] text-[#2d3748]',
};

const fmtZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

export function LenderWorkoutPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<WorkoutAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('all');
  const [advices, setAdvices] = useState<Record<string, Advice>>({});
  const [transitioning, setTransitioning] = useState<WorkoutAction | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      const res = await api.get(`/lender/covenant-actions?${params.toString()}`);
      setRows((res.data?.data as WorkoutAction[]) || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to load workout queue');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const advise = async (a: WorkoutAction) => {
    try {
      const res = await api.post(`/lender/covenant-tests/${a.covenant_test_id}/advise`, {});
      setAdvices(prev => ({ ...prev, [a.id]: res.data?.data as Advice }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'advise failed';
      setAdvices(prev => ({ ...prev, [a.id]: { advice_id: '', recommendation: 'cure_plan', rationale: msg, confidence: 0, source: 'fallback' } }));
    }
  };

  const acceptAdvice = async (adviceId: string) => {
    try { await api.post(`/lender/advice/${adviceId}/accept`, {}); } catch { /* */ }
  };

  const dismissAdvice = (actionId: string) => {
    setAdvices(prev => {
      const next = { ...prev };
      delete next[actionId];
      return next;
    });
  };

  const transition = async (id: string, to: 'investigating' | 'resolved' | 'rejected', notes?: string, outcome?: string) => {
    try {
      await api.post(`/lender/covenant-actions/${id}/transition`, { to, notes, outcome });
      void load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'transition failed');
    }
  };

  return (
    <div className="p-6 lg:p-10 space-y-4 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#6b7685] bg-white border border-[#dde4ec] rounded-full px-3 py-1">
            Lender · Workout queue
          </div>
          <h1 className="mt-2 font-display text-[28px] font-bold tracking-tight" style={{ color: 'var(--oe-on-surface)' }}>Covenant workout queue</h1>
          <p className="text-[13px] text-[#3d4756]">Cure plans, waivers, amendments and accelerations against every breached covenant. AI advisor inline per row.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => navigate('/lender-suite')} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <ArrowLeft size={12} /> Lender suite
          </button>
          <button type="button" onClick={() => void load()} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[12px] text-[#6b7685]">Status:</span>
        {(['all', 'open', 'investigating', 'resolved', 'rejected'] as const).map(s => (
          <button type="button" key={s} onClick={() => setStatus(s)} className={`px-3 py-1 rounded-full text-[11px] capitalize ${status === s ? 'bg-[#c2873a] text-white' : 'bg-white border border-[#dde4ec] text-[#3d4756]'}`}>
            {s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {loading && <Skeleton variant="card" rows={4} />}
      {err && <ErrorBanner message={err} onRetry={() => void load()} />}
      {!loading && !err && rows.length === 0 && (
        <EmptyState title="Empty queue" description="Workout actions filed against breached covenants will appear here." />
      )}
      {!loading && !err && rows.length > 0 && (
        <div className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-[#f8fafc] text-left text-[10px] uppercase tracking-wide text-[#6b7685]">
              <tr>
                <th className="px-4 py-2">Covenant</th>
                <th className="px-4 py-2">Test</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Severity</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Filed</th>
                <th className="px-4 py-2">Cure by</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <React.Fragment key={a.id}>
                  <tr className="border-t border-[#e5ebf2] hover:bg-[#f8fafc]">
                    <td className="px-4 py-2">
                      <div className="font-medium">{a.covenant_code}</div>
                      <div className="text-[11px] text-[#6b7685]">{a.covenant_name}</div>
                    </td>
                    <td className="px-4 py-2 text-[11px]">
                      {a.test_period || '—'} ·{' '}
                      {a.measured_value != null && a.threshold != null
                        ? <>{a.measured_value} / {a.threshold}</>
                        : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${ACTION_PILL[a.action_type] || 'bg-[#eef2f7]'}`}>
                        {a.action_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase ${SEVERITY_PILL[a.severity] || 'bg-[#eef2f7]'}`}>{a.severity}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${STATUS_PILL[a.status] || 'bg-[#eef2f7]'}`}>{a.status}</span>
                    </td>
                    <td className="px-4 py-2 text-[11px] text-[#6b7685]">{new Date(a.filed_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-[11px] text-[#6b7685]">{a.cure_deadline ? new Date(a.cure_deadline).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {a.status === 'open' && (
                          <button type="button" onClick={() => transition(a.id, 'investigating')} className="px-2 py-1 text-[11px] bg-blue-50 text-blue-700 rounded">Investigate</button>
                        )}
                        {(a.status === 'open' || a.status === 'investigating') && (
                          <>
                            <button type="button" onClick={() => setTransitioning({ ...a, status: 'resolved' as any })} className="px-2 py-1 text-[11px] bg-green-50 text-green-700 rounded">Resolve</button>
                            <button type="button" onClick={() => setTransitioning({ ...a, status: 'rejected' as any })} className="px-2 py-1 text-[11px] bg-[#eef2f7] text-[#2d3748] rounded">Reject</button>
                          </>
                        )}
                        {(a.status === 'resolved' || a.status === 'rejected') && (
                          <span className="text-[11px] text-[#6b7685]">{a.resolution_outcome || '—'}</span>
                        )}
                        {!advices[a.id] && a.status !== 'resolved' && a.status !== 'rejected' && (
                          <button type="button" onClick={() => advise(a)} className="px-2 py-1 text-[11px] bg-amber-50 text-amber-800 rounded inline-flex items-center gap-1">
                            <Lightbulb size={12} /> Advise
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {advices[a.id] && (
                    <tr>
                      <td colSpan={8} className="px-4 py-2 bg-amber-50/50 border-t border-amber-200/60">
                        <div className="flex items-start gap-3">
                          <Lightbulb size={16} className="flex-shrink-0 mt-0.5 text-amber-700" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-semibold text-[#0f1c2e]">
                              AI recommendation: <span className="uppercase">{advices[a.id].recommendation.replace(/_/g, ' ')}</span>
                              <span className="ml-2 text-[10px] text-[#6b7685]">
                                confidence {(advices[a.id].confidence * 100).toFixed(0)}% · source {advices[a.id].source}
                              </span>
                            </div>
                            <p className="mt-1 text-[12px] text-[#3d4756]">{advices[a.id].rationale}</p>
                            <div className="mt-2 flex gap-2">
                              {advices[a.id].advice_id && (
                                <button type="button" onClick={() => acceptAdvice(advices[a.id].advice_id)} className="px-2 py-1 text-[11px] bg-[#c2873a] text-white rounded">Accept</button>
                              )}
                              <button type="button" onClick={() => dismissAdvice(a.id)} className="px-2 py-1 text-[11px] bg-white border border-[#dde4ec] text-[#3d4756] rounded inline-flex items-center gap-1">
                                <X size={10} /> Dismiss
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {transitioning && (
        <ResolveModal action={transitioning} onClose={() => setTransitioning(null)} onSubmit={async (notes, outcome) => {
          const to = transitioning.status as 'resolved' | 'rejected';
          setTransitioning(null);
          await transition(transitioning.id, to, notes, outcome);
        }} />
      )}
    </div>
  );
}

function ResolveModal({
  action,
  onClose,
  onSubmit,
}: {
  action: WorkoutAction;
  onClose: () => void;
  onSubmit: (notes: string, outcome: string) => Promise<void>;
}) {
  const isResolved = action.status === 'resolved';
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState<string>(isResolved ? 'cured' : 'no_action');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (notes.trim().length < 3) { setErr('Notes ≥3 chars required.'); return; }
    setSaving(true); setErr(null);
    try { await onSubmit(notes, outcome); } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'failed'); setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-[#0f1c2e]">{isResolved ? 'Resolve' : 'Reject'} workout action · {action.covenant_code}</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="text-[12px] text-red-700">{err}</div>}
          <label className="block text-[13px]">
            <span className="text-[#6b7685]">Outcome</span>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg">
              {isResolved ? (
                <>
                  <option value="cured">Cured (test now passes)</option>
                  <option value="waived">Waived</option>
                  <option value="amended_terms">Amended terms</option>
                  <option value="accelerated">Accelerated</option>
                  <option value="written_off">Written off</option>
                </>
              ) : (
                <>
                  <option value="no_action">No action — not material</option>
                </>
              )}
            </select>
          </label>
          <label className="block text-[13px]">
            <span className="text-[#6b7685]">Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="What changed? ≥3 chars required." className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg resize-none" />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-[#dde4ec] rounded-lg hover:bg-[#eef2f7]">Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 ${isResolved ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'}`}>
              {saving ? 'Saving…' : (isResolved ? 'Resolve' : 'Reject')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
