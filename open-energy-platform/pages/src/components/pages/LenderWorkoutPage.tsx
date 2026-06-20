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

// ── Design tokens ────────────────────────────────────────────────────────────
const BG      = 'oklch(0.96 0.003 250)';
const BG1     = 'oklch(0.99 0.002 80)';
const BG2     = 'oklch(0.93 0.004 250)';
const BORDER  = 'oklch(0.87 0.006 250)';
const TX1     = 'oklch(0.17 0.010 250)';
const TX2     = 'oklch(0.40 0.009 250)';
const TX3     = 'oklch(0.60 0.007 250)';
const ACC     = 'oklch(0.46 0.16 280)';
const ACC_BG  = 'oklch(0.96 0.05 280)';
const BAD     = 'oklch(0.48 0.20 20)';
const BAD_BG  = 'oklch(0.97 0.04 20)';
const WARN    = 'oklch(0.50 0.18 55)';
const WARN_BG = 'oklch(0.96 0.05 55)';
const GOOD    = 'oklch(0.40 0.16 155)';
const GOOD_BG = 'oklch(0.95 0.04 155)';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

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

// ── Status/severity helpers ──────────────────────────────────────────────────
function statusColors(s: string): { bg: string; color: string } {
  if (s === 'open')         return { bg: BAD_BG,  color: BAD  };
  if (s === 'investigating') return { bg: WARN_BG, color: WARN };
  if (s === 'resolved')     return { bg: GOOD_BG, color: GOOD };
  return { bg: BG2, color: TX2 };
}

function severityColors(s: string): { bg: string; color: string } {
  if (s === 'critical') return { bg: BAD_BG,  color: BAD  };
  if (s === 'high')     return { bg: WARN_BG, color: WARN };
  if (s === 'medium')   return { bg: ACC_BG,  color: ACC  };
  return { bg: BG2, color: TX2 };
}

function actionColors(a: string): { bg: string; color: string } {
  if (a === 'acceleration_notice') return { bg: BAD_BG,  color: BAD  };
  if (a === 'waiver_request')      return { bg: WARN_BG, color: WARN };
  if (a === 'cure_plan')           return { bg: GOOD_BG, color: GOOD };
  if (a === 'workout')             return { bg: ACC_BG,  color: ACC  };
  return { bg: BG2, color: TX2 };
}

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

  // ── KPI counts ──────────────────────────────────────────────────────────
  const total        = rows.length;
  const openCount    = rows.filter(r => r.status === 'open').length;
  const invCount     = rows.filter(r => r.status === 'investigating').length;
  const critCount    = rows.filter(r => r.severity === 'critical').length;
  const resolvedCount = rows.filter(r => r.status === 'resolved').length;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      height: 'calc(100vh - 50px)',
      background: BG,
      overflow: 'hidden',
    }}>
      {/* ── LEFT COLUMN ── */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>

        {/* Page header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <button
              type="button"
              onClick={() => navigate('/horizon')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'transparent', border: `1px solid ${BORDER}`,
                color: TX2, borderRadius: 6, padding: '4px 10px',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <ArrowLeft size={12} /> Lender suite
            </button>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>Covenant Workout Queue</h1>
          <p style={{ fontSize: 13, color: TX2, margin: '4px 0 0' }}>
            Cure plans, waivers, amendments and accelerations against every breached covenant. AI advisor inline per row.
          </p>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total', value: total, color: TX1 },
            { label: 'Open', value: openCount, color: BAD },
            { label: 'Investigating', value: invCount, color: WARN },
            { label: 'Critical', value: critCount, color: BAD },
            { label: 'Resolved', value: resolvedCount, color: GOOD },
          ].map(k => (
            <div key={k.label} style={{
              background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: '12px 16px', flex: 1, minWidth: 90,
            }}>
              <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {k.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: k.color, fontFamily: MONO, marginTop: 4 }}>
                {k.value}
              </div>
            </div>
          ))}
        </div>

        {/* Error / loading / empty */}
        {loading && <Skeleton variant="card" rows={4} />}
        {err && <ErrorBanner message={err} onRetry={() => void load()} />}
        {!loading && !err && rows.length === 0 && (
          <EmptyState title="Empty queue" description="Workout actions filed against breached covenants will appear here." />
        )}

        {/* Main table */}
        {!loading && !err && rows.length > 0 && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  {['Covenant', 'Test', 'Action', 'Severity', 'Status', 'Filed', 'Cure by', 'Transitions'].map(col => (
                    <th key={col} style={{
                      textAlign: 'left', padding: '8px 12px',
                      color: TX2, fontWeight: 600, fontSize: 11,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      background: BG2,
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((a, i) => {
                  const sc = statusColors(a.status);
                  const sevc = severityColors(a.severity);
                  const ac = actionColors(a.action_type);
                  const advice = advices[a.id];
                  return (
                    <React.Fragment key={a.id}>
                      <tr style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                        <td style={{ padding: '10px 12px', color: TX1 }}>
                          <div style={{ fontWeight: 600, fontFamily: MONO, fontSize: 12 }}>{a.covenant_code}</div>
                          <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>{a.covenant_name}</div>
                        </td>
                        <td style={{ padding: '10px 12px', color: TX2, fontSize: 11, fontFamily: MONO }}>
                          {a.test_period || '—'}{' '}
                          {a.measured_value != null && a.threshold != null
                            ? <span>{a.measured_value} / {a.threshold}</span>
                            : null}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            background: ac.bg, color: ac.color,
                            padding: '2px 8px', borderRadius: 12,
                            fontSize: 11, fontWeight: 600,
                          }}>
                            {a.action_type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            background: sevc.bg, color: sevc.color,
                            padding: '2px 8px', borderRadius: 12,
                            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                          }}>
                            {a.severity}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            background: sc.bg, color: sc.color,
                            padding: '2px 8px', borderRadius: 12,
                            fontSize: 11, fontWeight: 600,
                          }}>
                            {a.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: TX3, fontSize: 11, fontFamily: MONO }}>
                          {new Date(a.filed_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '10px 12px', color: TX3, fontSize: 11, fontFamily: MONO }}>
                          {a.cure_deadline ? new Date(a.cure_deadline).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {a.status === 'open' && (
                              <button
                                type="button"
                                onClick={() => transition(a.id, 'investigating')}
                                style={{
                                  padding: '3px 8px', fontSize: 11, fontWeight: 600,
                                  background: WARN_BG, color: WARN,
                                  border: 'none', borderRadius: 4, cursor: 'pointer',
                                }}
                              >
                                Investigate
                              </button>
                            )}
                            {(a.status === 'open' || a.status === 'investigating') && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setTransitioning({ ...a, status: 'resolved' as WorkoutAction['status'] })}
                                  style={{
                                    padding: '3px 8px', fontSize: 11, fontWeight: 600,
                                    background: GOOD_BG, color: GOOD,
                                    border: 'none', borderRadius: 4, cursor: 'pointer',
                                  }}
                                >
                                  Resolve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTransitioning({ ...a, status: 'rejected' as WorkoutAction['status'] })}
                                  style={{
                                    padding: '3px 8px', fontSize: 11, fontWeight: 600,
                                    background: BG2, color: TX2,
                                    border: 'none', borderRadius: 4, cursor: 'pointer',
                                  }}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {(a.status === 'resolved' || a.status === 'rejected') && (
                              <span style={{ fontSize: 11, color: TX3 }}>{a.resolution_outcome || '—'}</span>
                            )}
                            {!advice && a.status !== 'resolved' && a.status !== 'rejected' && (
                              <button
                                type="button"
                                onClick={() => advise(a)}
                                style={{
                                  padding: '3px 8px', fontSize: 11, fontWeight: 600,
                                  background: ACC_BG, color: ACC,
                                  border: 'none', borderRadius: 4, cursor: 'pointer',
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                }}
                              >
                                <Lightbulb size={11} /> Advise
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* AI advice inline card */}
                      {advice && (
                        <tr>
                          <td colSpan={8} style={{ padding: '0 12px 12px', background: i % 2 === 1 ? BG2 : 'transparent' }}>
                            <div style={{
                              background: ACC_BG,
                              border: `1px solid ${BORDER}`,
                              borderRadius: 8,
                              padding: '12px 16px',
                              display: 'flex',
                              gap: 12,
                              alignItems: 'flex-start',
                            }}>
                              <Lightbulb size={16} style={{ color: ACC, flexShrink: 0, marginTop: 2 }} />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: TX1 }}>
                                  AI recommendation:{' '}
                                  <span style={{ textTransform: 'uppercase', color: ACC }}>
                                    {advice.recommendation.replace(/_/g, ' ')}
                                  </span>
                                  <span style={{ marginLeft: 8, fontSize: 11, color: TX3, fontWeight: 400, fontFamily: MONO }}>
                                    {(advice.confidence * 100).toFixed(0)}% confidence · {advice.source}
                                  </span>
                                </div>
                                <p style={{ margin: '6px 0 10px', fontSize: 12, color: TX2, lineHeight: 1.5 }}>
                                  {advice.rationale}
                                </p>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  {advice.advice_id && (
                                    <button
                                      type="button"
                                      onClick={() => acceptAdvice(advice.advice_id)}
                                      style={{
                                        padding: '4px 12px', fontSize: 11, fontWeight: 600,
                                        background: ACC, color: '#fff',
                                        border: 'none', borderRadius: 4, cursor: 'pointer',
                                      }}
                                    >
                                      Accept
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => dismissAdvice(a.id)}
                                    style={{
                                      padding: '4px 12px', fontSize: 11, fontWeight: 600,
                                      background: BG1, color: TX2,
                                      border: `1px solid ${BORDER}`, borderRadius: 4, cursor: 'pointer',
                                      display: 'inline-flex', alignItems: 'center', gap: 4,
                                    }}
                                  >
                                    <X size={10} /> Dismiss
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div style={{
        borderLeft: `1px solid ${BORDER}`,
        background: BG1,
        overflowY: 'auto',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>

        {/* Refresh */}
        <button
          type="button"
          onClick={() => void load()}
          style={{
            background: ACC, color: '#fff', border: 'none',
            padding: '9px 16px', borderRadius: 6, fontWeight: 600,
            cursor: 'pointer', fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <RefreshCw size={13} /> Refresh queue
        </button>

        {/* Status filter */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Filter by status
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(['all', 'open', 'investigating', 'resolved', 'rejected'] as const).map(s => {
              const active = status === s;
              const sc = s === 'all' ? { bg: ACC_BG, color: ACC } : statusColors(s);
              return (
                <button
                  type="button"
                  key={s}
                  onClick={() => setStatus(s)}
                  style={{
                    padding: '7px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    textAlign: 'left', cursor: 'pointer', textTransform: 'capitalize',
                    background: active ? (s === 'all' ? ACC : sc.bg) : 'transparent',
                    color: active ? (s === 'all' ? ACC : sc.color) : TX2,
                    border: active ? `1px solid ${s === 'all' ? ACC : sc.color}` : `1px solid transparent`,
                    transition: 'all 0.12s',
                  }}
                >
                  {s.replace(/_/g, ' ')}
                  {s !== 'all' && (
                    <span style={{ float: 'right', fontFamily: MONO, fontSize: 11, color: TX3 }}>
                      {rows.filter(r => r.status === s).length}
                    </span>
                  )}
                  {s === 'all' && (
                    <span style={{ float: 'right', fontFamily: MONO, fontSize: 11, color: TX3 }}>
                      {rows.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary stats */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Queue summary
          </div>
          {[
            { label: 'Open breaches', value: openCount, color: BAD },
            { label: 'Under investigation', value: invCount, color: WARN },
            { label: 'Critical severity', value: critCount, color: BAD },
            { label: 'Resolved', value: resolvedCount, color: GOOD },
          ].map(stat => (
            <div key={stat.label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '7px 0', borderBottom: `1px solid ${BORDER}`,
            }}>
              <span style={{ fontSize: 12, color: TX2 }}>{stat.label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: stat.color }}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>

        {/* Severity breakdown */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Severity breakdown
          </div>
          {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
            const count = rows.filter(r => r.severity === sev).length;
            const c = severityColors(sev);
            return (
              <div key={sev} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 0', borderBottom: `1px solid ${BORDER}`,
              }}>
                <span style={{
                  background: c.bg, color: c.color,
                  padding: '2px 8px', borderRadius: 12,
                  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                }}>
                  {sev}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: c.color }}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>

        {/* AI advice tip */}
        <div style={{ background: ACC_BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Lightbulb size={15} style={{ color: ACC, flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: TX1, marginBottom: 4 }}>
                AI Covenant Advisor
              </div>
              <p style={{ fontSize: 11, color: TX2, margin: 0, lineHeight: 1.5 }}>
                Click <strong>Advise</strong> on any open or investigating row to get a deterministic recommendation — cure plan, waiver, amendment or acceleration — with confidence score and rationale.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Resolve/Reject modal ── */}
      {transitioning && (
        <ResolveModal
          action={transitioning}
          onClose={() => setTransitioning(null)}
          onSubmit={async (notes, outcome) => {
            const to = transitioning.status as 'resolved' | 'rejected';
            setTransitioning(null);
            await transition(transitioning.id, to, notes, outcome);
          }}
        />
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
  const [modalErr, setModalErr] = useState<string | null>(null);

  const submit = async () => {
    if (notes.trim().length < 3) { setModalErr('Notes ≥3 chars required.'); return; }
    setSaving(true); setModalErr(null);
    try { await onSubmit(notes, outcome); } catch (e: unknown) {
      setModalErr(e instanceof Error ? e.message : 'failed');
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: BG1, borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto',
          border: `1px solid ${BORDER}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TX1 }}>
            {isResolved ? 'Resolve' : 'Reject'} workout action
            <span style={{ marginLeft: 8, fontFamily: MONO, fontSize: 13, color: TX3, fontWeight: 400 }}>
              {action.covenant_code}
            </span>
          </h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TX2 }}>
            <X size={18} />
          </button>
        </div>

        {/* Modal body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {modalErr && (
            <div style={{ background: BAD_BG, color: BAD, padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
              {modalErr}
            </div>
          )}

          <label style={{ display: 'block', fontSize: 13 }}>
            <span style={{ color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Outcome
            </span>
            <select
              value={outcome}
              onChange={e => setOutcome(e.target.value)}
              style={{
                marginTop: 6, width: '100%', padding: '8px 12px',
                border: `1px solid ${BORDER}`, borderRadius: 6,
                fontSize: 13, color: TX1, background: BG,
              }}
            >
              {isResolved ? (
                <>
                  <option value="cured">Cured (test now passes)</option>
                  <option value="waived">Waived</option>
                  <option value="amended_terms">Amended terms</option>
                  <option value="accelerated">Accelerated</option>
                  <option value="written_off">Written off</option>
                </>
              ) : (
                <option value="no_action">No action — not material</option>
              )}
            </select>
          </label>

          <label style={{ display: 'block', fontSize: 13 }}>
            <span style={{ color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Notes
            </span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              placeholder="What changed? ≥3 chars required."
              style={{
                marginTop: 6, width: '100%', padding: '8px 12px',
                border: `1px solid ${BORDER}`, borderRadius: 6,
                fontSize: 13, color: TX1, background: BG,
                resize: 'none', boxSizing: 'border-box',
              }}
            />
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px', border: `1px solid ${BORDER}`,
                borderRadius: 6, background: 'transparent',
                color: TX2, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              style={{
                padding: '8px 16px', border: 'none', borderRadius: 6,
                background: isResolved ? GOOD : TX2,
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : (isResolved ? 'Resolve' : 'Reject')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LenderWorkoutPage;
