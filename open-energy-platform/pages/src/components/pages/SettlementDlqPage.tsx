// ════════════════════════════════════════════════════════════════════════
// SettlementDlqPage — DLQ + AI run-failure explainer drawer
//
// Surfaces the settlement_dlq queue with an inline 'Explain' button per
// row that calls POST /settlement/runs/:id/explain — runs the
// deterministic run-failure-explainer (utility from migration 053 / src/
// utils/run-failure-explainer.ts) and shows the explanation + suggested
// action with confidence score. Operator can accept the suggestion or
// dismiss.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Lightbulb, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { Pill } from '../launch/WorkstationShell';

type DlqRow = {
  id: string;
  run_id: string;
  contract_id?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  status: 'open' | 'retrying' | 'resolved' | 'abandoned';
  attempt_count?: number;
  error_message: string | null;
  resolution_notes?: string | null;
  resolved_at?: string | null;
  created_at: string;
};

type Explanation = {
  id?: string;
  explanation: string;
  suggested_action: string;
  confidence: number;
  source: 'deterministic' | 'ai_gateway' | 'fallback';
};

export function SettlementDlqPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DlqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('open');
  const [explanations, setExplanations] = useState<Record<string, Explanation>>({});
  const [explaining, setExplaining] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get(`/settlement-auto/dlq?status=${status}`);
      setRows((res.data?.data as DlqRow[]) || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const explain = async (row: DlqRow) => {
    setExplaining(row.id);
    try {
      const res = await api.post(`/settlement/runs/${row.run_id}/explain`, {});
      setExplanations(prev => ({ ...prev, [row.id]: res.data?.data as Explanation }));
    } catch (e: unknown) {
      setExplanations(prev => ({ ...prev, [row.id]: {
        explanation: e instanceof Error ? e.message : 'explain failed',
        suggested_action: 'Retry or escalate manually.',
        confidence: 0,
        source: 'fallback',
      } }));
    } finally {
      setExplaining(null);
    }
  };

  const dismiss = (rowId: string) => {
    setExplanations(prev => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  };

  return (
    <div className="p-6 lg:p-10 space-y-4 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#6b7685] bg-white border border-[#dde4ec] rounded-full px-3 py-1">
            Settlement · DLQ
          </div>
          <h1 className="mt-2 font-display text-[28px] font-bold tracking-tight" style={{ color: 'var(--oe-on-surface)' }}>Settlement DLQ + AI explainer</h1>
          <p className="text-[13px] text-[#3d4756]">Dead-letter queue for failed settlement runs. Click 'Explain' to get a deterministic cause + suggested action; accept logs the decision for audit.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/admin/monitoring')} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <ArrowLeft size={12} /> Monitoring
          </button>
          <button onClick={() => void load()} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[12px] text-[#6b7685]">Status:</span>
        {(['open', 'retrying', 'resolved', 'abandoned'] as const).map(s => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1 rounded-full text-[11px] capitalize ${status === s ? 'bg-[#1a3a5c] text-white' : 'bg-white border border-[#dde4ec] text-[#3d4756]'}`}>
            {s}
          </button>
        ))}
      </div>

      {loading && <Skeleton variant="card" rows={4} />}
      {err && <ErrorBanner message={err} onRetry={() => void load()} />}
      {!loading && !err && rows.length === 0 && (
        <EmptyState title={`No ${status} DLQ rows`} description="DLQ entries from failed settlement runs will appear here." />
      )}
      {!loading && !err && rows.length > 0 && (
        <div className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-[#f8fafc] text-left text-[10px] uppercase tracking-wide text-[#6b7685]">
              <tr>
                <th className="px-4 py-2">Run</th>
                <th className="px-4 py-2">Period</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Attempts</th>
                <th className="px-4 py-2">Error</th>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <React.Fragment key={r.id}>
                  <tr className="border-t border-[#e5ebf2] hover:bg-[#f8fafc]">
                    <td className="px-4 py-2"><span className="font-mono text-[11px]">{(r.run_id || '').slice(0, 14)}…</span></td>
                    <td className="px-4 py-2 text-[11px]">{r.period_start ? `${r.period_start} → ${r.period_end}` : '—'}</td>
                    <td className="px-4 py-2"><Pill tone={r.status === 'resolved' ? 'good' : r.status === 'abandoned' ? 'neutral' : r.status === 'open' ? 'bad' : 'warn'}>{r.status}</Pill></td>
                    <td className="px-4 py-2 text-[11px]">{r.attempt_count ?? '—'}</td>
                    <td className="px-4 py-2 text-[11px]"><span className="block truncate max-w-md" title={r.error_message || ''}>{r.error_message || '—'}</span></td>
                    <td className="px-4 py-2 text-[11px] text-[#6b7685]">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2">
                      {!explanations[r.id] && r.status !== 'resolved' && (
                        <button onClick={() => explain(r)} disabled={explaining === r.id} className="px-2 py-1 text-[11px] bg-amber-50 text-amber-800 rounded inline-flex items-center gap-1">
                          <Lightbulb size={12} /> {explaining === r.id ? 'Explaining…' : 'Explain'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {explanations[r.id] && (
                    <tr>
                      <td colSpan={7} className="px-4 py-2 bg-amber-50/50 border-t border-amber-200/60">
                        <div className="flex items-start gap-3">
                          <Lightbulb size={16} className="flex-shrink-0 mt-0.5 text-amber-700" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-semibold text-[#0f1c2e]">
                              AI explanation
                              <span className="ml-2 text-[10px] text-[#6b7685]">
                                confidence {(explanations[r.id].confidence * 100).toFixed(0)}% · source {explanations[r.id].source}
                              </span>
                            </div>
                            <p className="mt-1 text-[12px] text-[#3d4756]">{explanations[r.id].explanation}</p>
                            <div className="mt-1 text-[12px] text-[#3d4756]"><strong>Suggested:</strong> {explanations[r.id].suggested_action}</div>
                            <div className="mt-2 flex gap-2">
                              <button onClick={() => dismiss(r.id)} className="px-2 py-1 text-[11px] bg-white border border-[#dde4ec] text-[#3d4756] rounded inline-flex items-center gap-1">
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
    </div>
  );
}
