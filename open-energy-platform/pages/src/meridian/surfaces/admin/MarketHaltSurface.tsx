// pages/src/meridian/surfaces/admin/MarketHaltSurface.tsx
//
// Meridian surface — "Market halt controls" (admin role). The operator control
// for the single hardest pre-trade gate: a halt on a market stops every order on
// that shard (read by trading.ts from KV, enforced in pre-trade-guards.ts). One
// row per market (each energy type + an "All markets" fallback); set a halt with
// a mandatory reason, or lift an active one. Backed by GET/POST /api/admin/market-halt.
//
// The "All markets" (_all) halt overlays every per-type market exactly the way the
// trading reader resolves it: a per-type halt wins, _all applies where no per-type
// halt is set. So a market can read halted "via All markets" with no key of its own
// — those rows point their Lift action at the _all row (you cannot lift an inherited
// halt from the market it falls through to), and a platform-wide banner makes the
// overlay explicit. Every set/lift fires a cascade → audit chain. Registered as
// `admin:market_halt`, reached via the roleData feature key `market_halt`.
import React, { useCallback, useEffect, useState } from 'react';
import { ActionModal, Pill, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

type Row = {
  scope: string; scope_label: string; active: boolean;
  state: string; state_label: string;
  via: 'self' | '_all' | null;
  reason: string | null; set_by: string | null; set_at: string | null;
};
type StateOpt = { value: string; label: string };

export default function MarketHaltSurface(_props: { role: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [states, setStates] = useState<StateOpt[]>([]);
  const [canHalt, setCanHalt] = useState(false);
  const [allHalted, setAllHalted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [haltScope, setHaltScope] = useState<Row | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return api.get('/admin/market-halt')
      .then((res) => {
        const d = res.data || {};
        setRows(d.data || []);
        setStates(d.states || []);
        setCanHalt(!!d.can_halt);
        setAllHalted(!!d.all_halted);
        setLoadError(null);
      })
      .catch((e) => {
        setLoadError(e?.response?.data?.error || 'Could not load market halt state.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Lift always targets the scope the halt actually lives on: an inherited (_all)
  // halt is lifted from the _all row, never from the market it falls through to.
  const lift = async (scope: string) => {
    setActionError(null);
    try {
      await api.post('/admin/market-halt/lift', { scope });
    } catch (e: any) {
      setActionError(e?.response?.data?.error || 'Failed to lift halt.');
    } finally {
      load();
    }
  };

  const activeCount = rows.filter((r) => r.active).length;

  return (
    <div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 mb-4 text-[12px] text-slate-600">
        A halt stops <strong>every order</strong> on the affected market — it is the hardest pre-trade gate.
        Trading reads these from cache with no deploy; set/lift takes effect on the next order.
        {!canHalt && ' You have read-only access; only admin or regulator roles can change a halt.'}
      </div>

      {allHalted && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 mb-4 text-[12px] text-amber-800">
          <strong>All markets are halted.</strong> Every market without its own halt is closed via the
          platform-wide fallback — lift it from the “All markets” row below.
        </div>
      )}

      {loadError && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 mb-4 text-[12px] text-red-700 flex items-center justify-between">
          <span>{loadError}</span>
          <button onClick={load} className="underline hover:no-underline">Retry</button>
        </div>
      )}
      {actionError && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 mb-4 text-[12px] text-red-700">
          {actionError}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <Pill tone={activeCount ? 'bad' : 'good'}>
          {activeCount ? `${activeCount} market${activeCount > 1 ? 's' : ''} halted` : 'All markets open'}
        </Pill>
        <button onClick={load} className="text-[12px] text-slate-500 hover:text-slate-800">Refresh</button>
      </div>

      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-slate-500 border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-2 font-medium">Market</th>
              <th className="text-left px-4 py-2 font-medium">State</th>
              <th className="text-left px-4 py-2 font-medium">Reason</th>
              <th className="text-left px-4 py-2 font-medium">Set</th>
              <th className="text-right px-4 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>}
            {!loading && loadError && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-red-400">Unavailable.</td></tr>}
            {!loading && !loadError && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No markets.</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.scope} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-800 capitalize">{r.scope_label}</td>
                <td className="px-4 py-2">
                  <Pill tone={r.active ? 'bad' : 'good'}>{r.active ? r.state_label : 'Open'}</Pill>
                  {r.via === '_all' && <span className="ml-2 text-[11px] text-slate-400">via All markets</span>}
                </td>
                <td className="px-4 py-2 text-slate-600 max-w-[280px] truncate" title={r.reason || ''}>{r.reason || '—'}</td>
                <td className="px-4 py-2 text-slate-500 text-[12px]">
                  {r.set_at ? new Date(r.set_at).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-2 text-right">
                  {!canHalt && <span className="text-slate-300 text-[12px]">—</span>}
                  {canHalt && r.via === 'self' && (
                    <button onClick={() => lift(r.scope)} className="px-2.5 py-1 rounded text-[12px] bg-slate-100 text-slate-700 hover:bg-slate-200">Lift</button>
                  )}
                  {canHalt && r.via === '_all' && (
                    <span className="text-slate-400 text-[12px]">lift via All markets</span>
                  )}
                  {canHalt && r.via === null && (
                    <button onClick={() => setHaltScope(r)} className="px-2.5 py-1 rounded text-[12px] bg-[oklch(0.46_0.16_55)] text-white hover:opacity-90">Halt</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {haltScope && (
        <ActionModal
          title={`Halt — ${haltScope.scope_label}`}
          cta="danger"
          submitLabel="Halt market"
          fields={[
            { key: 'state', label: 'Halt type', type: 'select', required: true,
              options: states.map((s) => ({ value: s.value, label: s.label })),
              defaultValue: states[0]?.value },
            { key: 'reason', label: 'Reason', type: 'textarea', required: true,
              placeholder: 'Why this market is being halted (recorded on the audit chain).' },
          ] as FieldSpec[]}
          onClose={() => setHaltScope(null)}
          onSubmit={async (v) => {
            await api.post('/admin/market-halt', { scope: haltScope.scope, state: v.state, reason: v.reason });
            setHaltScope(null);
            load();
          }}
        />
      )}
    </div>
  );
}
