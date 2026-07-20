// ═══════════════════════════════════════════════════════════════════════════
// FundingOptionsPanel — the "pop up options when an IPP loads a project for
// funding" surface. Lists every standing carbon-fund + lender offer aimed at
// the IPP, scored for fit against this project, and lets the developer
// multi-select one / some / all and fire cross-chain engagement in one click.
//
// GET  /api/projects/:id/funding-options → { carbon[], funding[], ...figures }
// POST /api/projects/:id/engage { offer_ids[], note } → handshake + cascade push
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { OEIcon } from '../OEIcon';

interface FundingOffer {
  offer_id: string;
  offeror_role: string;
  category: 'carbon' | 'funding';
  offer_kind: string;
  registry_standard: string | null;
  headline: string;
  est_value_zar: number | null;
  fit_score: number;
  fit_reason: string;
}

interface FundingOptions {
  project_id: string;
  annual_mwh: number;
  annual_tco2e: number;
  est_capex_zar: number;
  carbon: FundingOffer[];
  funding: FundingOffer[];
}

const KIND_LABEL: Record<string, string> = {
  carbon_rec: 'REC offtake',
  carbon_voluntary: 'Voluntary credits',
  carbon_involuntary: 'Compliance credits',
  funding_senior_debt: 'Senior debt',
  funding_mezzanine: 'Mezzanine',
  funding_equity: 'Equity',
};

const fmtZAR = (n: number | null): string =>
  n == null ? 'on application' : 'R' + Math.round(n).toLocaleString('en-ZA');

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 75 ? 'var(--good, #15803d)' : score >= 50 ? '#b45309' : 'var(--ink-2, #64748b)';
  const bg = score >= 75 ? 'color-mix(in oklab, var(--good) 15%, var(--s1))' : score >= 50 ? 'color-mix(in oklab, var(--warn) 15%, var(--s1))' : '#f1f5f9';
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: tone, background: bg }}>
      {score}% fit
    </span>
  );
}

function OfferCard({
  offer, selected, onToggle,
}: { offer: FundingOffer; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full text-left rounded-lg border p-3 transition-colors"
      style={{
        borderColor: selected ? 'oklch(0.46 0.16 55)' : 'var(--border-subtle, #e2e8f0)',
        background: selected ? 'oklch(0.97 0.02 55)' : '#fff',
        boxShadow: selected ? '0 0 0 1px oklch(0.46 0.16 55)' : 'none',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 h-4 w-4 rounded flex items-center justify-center shrink-0"
          style={{
            background: selected ? 'oklch(0.46 0.16 55)' : '#fff',
            border: selected ? 'none' : '1.5px solid var(--border-strong, #cbd5e1)',
          }}
        >
          {selected && <OEIcon name="check" size={11} className="text-white" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-slate-900">{offer.headline}</span>
            <ScoreBadge score={offer.fit_score} />
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
            <span className="font-medium text-slate-600">{KIND_LABEL[offer.offer_kind] ?? offer.offer_kind.replace(/_/g, ' ')}</span>
            {offer.registry_standard && <span>· {offer.registry_standard.replace(/_/g, ' ')}</span>}
            <span>· {offer.offeror_role.replace(/_/g, ' ')}</span>
          </div>
          <div className="mt-1 text-[12px] text-slate-600">{offer.fit_reason}</div>
          <div className="mt-1 text-[12px] font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>
            {offer.category === 'carbon' ? `${fmtZAR(offer.est_value_zar)}/yr indicative` : `${fmtZAR(offer.est_value_zar)} facility`}
          </div>
        </div>
      </div>
    </button>
  );
}

export function FundingOptionsPanel({ projectId }: { projectId: string }) {
  const [opts, setOpts] = useState<FundingOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [engaging, setEngaging] = useState(false);
  const [engagedCount, setEngagedCount] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api.get(`/projects/${projectId}/funding-options`)
      .then((res) => { if (live) { setOpts(res.data?.data ?? null); setError(null); } })
      .catch((e) => { if (live) setError(e?.response?.data?.error || 'Could not load funding options'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [projectId]);

  const all = useMemo(() => [...(opts?.carbon ?? []), ...(opts?.funding ?? [])], [opts]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const selectAll = () => setSelected(new Set(all.map((o) => o.offer_id)));
  const clearAll = () => setSelected(new Set());

  const engage = async () => {
    if (selected.size === 0) return;
    setEngaging(true);
    try {
      const res = await api.post(`/projects/${projectId}/engage`, {
        offer_ids: [...selected], note: note.trim() || undefined,
      });
      setEngagedCount(res.data?.data?.engaged?.length ?? selected.size);
      setSelected(new Set());
      setNote('');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Engagement failed');
    } finally {
      setEngaging(false);
    }
  };

  if (loading) return <div className="p-6 text-[13px] text-slate-500">Loading funding options…</div>;
  if (error && !opts) return <div className="p-6 text-[13px] text-rose-600">{error}</div>;
  if (!opts) return null;

  if (all.length === 0) {
    return (
      <div className="p-6 text-[13px] text-slate-500">
        No standing carbon-fund or lender offers match this project yet. New offers appear here automatically.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {engagedCount != null && (
        <div className="rounded-lg border p-3 text-[13px] flex items-center gap-2"
          style={{ borderColor: '#86efac', background: '#f0fdf4', color: 'var(--good, #15803d)' }}>
          <OEIcon name="check" size={15} />
          Engaged {engagedCount} offer{engagedCount === 1 ? '' : 's'}. Each offeror has a new request in their inbox; track them on the Deal Desk.
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-[12px] text-slate-500">
          ~{Math.round(opts.annual_mwh).toLocaleString('en-ZA')} MWh/yr · {Math.round(opts.annual_tco2e).toLocaleString('en-ZA')} tCO₂e/yr · build ≈ {fmtZAR(opts.est_capex_zar)}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={selectAll} className="text-[12px] font-medium text-slate-600 hover:text-slate-900">Select all</button>
          <span className="text-slate-300">·</span>
          <button type="button" onClick={clearAll} className="text-[12px] font-medium text-slate-600 hover:text-slate-900">Clear</button>
        </div>
      </div>

      {opts.carbon.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Carbon offers</h4>
          {opts.carbon.map((o) => (
            <OfferCard key={o.offer_id} offer={o} selected={selected.has(o.offer_id)} onToggle={() => toggle(o.offer_id)} />
          ))}
        </section>
      )}

      {opts.funding.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Funding offers</h4>
          {opts.funding.map((o) => (
            <OfferCard key={o.offer_id} offer={o} selected={selected.has(o.offer_id)} onToggle={() => toggle(o.offer_id)} />
          ))}
        </section>
      )}

      <div className="sticky bottom-0 bg-surface-v2 border-t pt-3 space-y-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note to the offerors (e.g. target close date, data-room access)…"
          rows={2}
          className="w-full text-[13px] rounded-md border border-slate-200 p-2 resize-none focus:outline-none focus:ring-1"
          style={{ }}
        />
        {error && opts && <div className="text-[12px] text-rose-600">{error}</div>}
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-slate-500">{selected.size} selected</span>
          <button
            type="button"
            onClick={engage}
            disabled={selected.size === 0 || engaging}
            className="h-9 px-4 rounded-md text-white text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
            style={{ background: 'oklch(0.46 0.16 55)' }}
          >
            <OEIcon name="flow" size={14} />
            {engaging ? 'Engaging…' : `Engage ${selected.size || ''}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}

export default FundingOptionsPanel;
