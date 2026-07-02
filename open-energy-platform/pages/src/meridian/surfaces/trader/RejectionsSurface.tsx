// pages/src/meridian/surfaces/trader/RejectionsSurface.tsx
//
// Meridian surface — "Rejections" (trader role). Extracted verbatim from the inline
// `RejectionsTab` + `ExplainButton` bodies of the TraderWorkstationPage husk (E2.3). Lists
// pre-trade guard rejections with the inline AI "why?" explainer. Non-chain listing surface
// (Bucket B). Registered as `trader:rejections` in surfaces.tsx, reached from Atlas (⌘K) via
// the roleData feature key `rejections`.
import React, { useState } from 'react';
import { ListingTable, Pill } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

export default function RejectionsSurface(_props: { role: string }) {
  return (
    <ListingTable
      endpoint="/trading/rejections"
      rowKey={(r) => r.id}
      empty={{ title: 'No rejections', description: 'Pre-trade rejections (insufficient credit, halt, stale mark, etc.) land here for review.' }}
      columns={[
        { key: 'attempted_at', label: 'When', render: (r) => new Date(r.attempted_at).toLocaleString() },
        { key: 'side', label: 'Side', render: (r) => <Pill tone={r.side === 'buy' ? 'info' : 'neutral'}>{r.side}</Pill> },
        { key: 'energy_type', label: 'Energy' },
        { key: 'volume_mwh', label: 'Vol', align: 'right', render: (r) => Number(r.volume_mwh).toFixed(1) },
        { key: 'price_zar_mwh', label: 'Price', align: 'right', render: (r) => r.price_zar_mwh != null ? Number(r.price_zar_mwh).toFixed(2) : '—' },
        { key: 'reason_code', label: 'Reason', render: (r) => <Pill tone="bad">{(r.reason_code || '').replace(/_/g, ' ')}</Pill> },
        { key: '_explain', label: '', render: (r) => <ExplainButton id={r.id} /> },
      ]}
    />
  );
}

function ExplainButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get(`/trading/rejections/${id}/explain`);
      setData(r.data?.data || null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally { setLoading(false); }
  };
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); if (!data) void load(); }} className="btn pri">AI: why?</button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-[var(--line)]">
              <h3 className="text-[16px] font-semibold text-[var(--ink)]">Why was this rejected?</h3>
            </div>
            <div className="p-5 text-[13px] space-y-3">
              {loading && <div className="text-[var(--ink3)]">Loading…</div>}
              {err && <div className="text-[var(--oxide-deep)]">{err}</div>}
              {data && (
                <>
                  <p className="leading-relaxed">{data.explanation || data.summary || '—'}</p>
                  {Array.isArray(data.remediations) && data.remediations.length > 0 && (
                    <div className="rounded-lg bg-[var(--raised)] p-3 space-y-1">
                      <div className="text-[11px] uppercase tracking-wider text-[var(--ink3)]">Suggested next steps</div>
                      {data.remediations.map((rem: any, i: number) => (
                        <div key={i} className="text-[12px]">• {rem.label || rem.title || rem}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
