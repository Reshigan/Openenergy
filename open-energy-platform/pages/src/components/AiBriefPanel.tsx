// ═══════════════════════════════════════════════════════════════════════════
// AiBriefPanel — one collapsible card surfacing the AI briefing for the
// caller's role. Pulls POST /api/ai-briefs/:role on demand, renders the
// narrative headline and a prioritised action list.
// Shown at the top of each SuitePage workbench.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useCallback, useState } from 'react';
import { Sparkles, Loader2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../lib/api';
import { NarrativeText } from './NarrativeText';

export type BriefRole =
  | 'regulator' | 'grid_operator' | 'trader' | 'lender'
  | 'ipp_developer' | 'offtaker' | 'carbon_fund' | 'admin';

interface BriefAction {
  priority?: string;
  title?: string;
  rationale?: string;
  entity_type?: string;
  entity_id?: string;
  statutory_basis?: string;
  domain?: string;
  recommended_remedy?: string;
  est_pnl_zar?: number;
  est_saving_zar?: number;
  est_tco2e_reduction?: number;
  eta_minutes?: number;
  due_by?: string;
}

interface BriefResponse {
  text: string;
  fallback?: boolean;
  model?: string;
  structured?: { actions?: BriefAction[] };
}

export function AiBriefPanel({ role, accentFrom = '#0a6ed1', accentTo = '#5d36ff' }: {
  role: BriefRole;
  accentFrom?: string;
  accentTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState<BriefResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.post(`/ai-briefs/${role}`, {});
      setBrief(resp.data?.data as BriefResponse);
      setOpen(true);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string; message?: string } }; message?: string };
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to load brief');
    } finally {
      setLoading(false);
    }
  }, [role]);

  const actions = (brief?.structured?.actions || []) as BriefAction[];

  return (
    <section
      className="rounded-xl border bg-white overflow-hidden"
      style={{ borderColor: '#e5e5e5' }}
    >
      <header
        className="px-5 py-3.5 border-b flex items-center justify-between gap-3"
        style={{ borderColor: '#f0f1f2' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0"
            style={{ background: `linear-gradient(135deg, ${accentFrom} 0%, ${accentTo} 100%)` }}
          >
            <Sparkles size={18} />
          </div>
          <div className="leading-tight min-w-0">
            <h2 className="text-[14px] font-semibold" style={{ color: '#32363a' }}>
              AI briefing — {role.replace('_', ' ')}
            </h2>
            <p className="text-[12px] truncate" style={{ color: '#6a6d70' }}>
              Prioritised actions drawn from your live workbench data.
              {brief?.fallback ? ' (Deterministic fallback — AI binding unavailable.)' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {brief && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="h-8 w-8 rounded-md border flex items-center justify-center"
              style={{ borderColor: '#d0d5dd', color: '#6a6d70' }}
              aria-label={open ? 'Collapse brief' : 'Expand brief'}
            >
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="h-9 px-3.5 rounded-lg text-[13px] font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${accentFrom} 0%, ${accentTo} 100%)` }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {brief ? 'Refresh' : 'Generate'}
          </button>
        </div>
      </header>

      {error && (
        <div
          className="px-5 py-3 text-[13px] inline-flex items-center gap-2"
          style={{ background: '#ffebee', color: '#bb0000' }}
        >
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {open && brief && (
        <div className="p-5 space-y-4">
          {brief.text && (
            <div className="rounded-md p-3" style={{ background: '#f7f8f9' }}>
              <NarrativeText text={brief.text} />
            </div>
          )}

          {actions.length > 0 && (
            <div>
              <h3
                className="text-[11px] uppercase tracking-wider mb-2"
                style={{ color: '#6a6d70' }}
              >
                Prioritised actions ({actions.length})
              </h3>
              <ul className="space-y-2">
                {actions.map((a, i) => (
                  <li
                    key={i}
                    className="rounded-lg border p-3 flex items-start gap-3"
                    style={{ borderColor: '#e5e5e5' }}
                  >
                    <PriorityDot priority={a.priority} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold" style={{ color: '#32363a' }}>
                        {a.title || 'Action'}
                      </div>
                      {a.rationale && (
                        <p className="text-[12px] mt-0.5" style={{ color: '#6a6d70' }}>
                          {a.rationale}
                        </p>
                      )}
                      <div className="text-[11px] mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: '#89919a' }}>
                        {a.entity_type && a.entity_id && (
                          <span>{a.entity_type} · {a.entity_id}</span>
                        )}
                        {a.statutory_basis && <span>statute: {a.statutory_basis}</span>}
                        {a.domain && <span>domain: {a.domain}</span>}
                        {a.recommended_remedy && <span>remedy: {a.recommended_remedy}</span>}
                        {a.eta_minutes != null && <span>ETA: {a.eta_minutes} min</span>}
                        {a.due_by && <span>due: {a.due_by}</span>}
                        {a.est_pnl_zar != null && <span>P/L: R{a.est_pnl_zar.toLocaleString('en-ZA')}</span>}
                        {a.est_saving_zar != null && <span>save: R{a.est_saving_zar.toLocaleString('en-ZA')}</span>}
                        {a.est_tco2e_reduction != null && <span>tCO₂e: {a.est_tco2e_reduction}</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PriorityDot({ priority }: { priority?: string }) {
  const color = priority === 'urgent' ? '#bb0000'
    : priority === 'high' ? '#b04e0f'
    : priority === 'normal' ? '#0a6ed1'
    : '#89919a';
  return (
    <span
      className="mt-1.5 w-2 h-2 rounded-full shrink-0"
      style={{ background: color }}
      aria-label={`Priority: ${priority || 'low'}`}
    />
  );
}

export default AiBriefPanel;
