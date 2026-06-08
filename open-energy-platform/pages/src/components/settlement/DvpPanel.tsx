// ═══════════════════════════════════════════════════════════════════════════
// DvpPanel — Wave 3 Delivery-vs-Payment lock panel per settlement cycle.
//
// Cycle picker → state machine card:
//   open → cash_in / energy_in → locked → released
//
// Cash + energy legs confirmed independently; atomic lock fires once both
// are in. Admin "Release" action moves locked → released.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

type Cycle = {
  id: string;
  trade_date: string;
  value_date: string;
  status: string;
  total_trades: number;
  total_value_zar: number;
};

type DvpLock = {
  cycle_id: string;
  lock_status: 'open' | 'cash_in' | 'energy_in' | 'locked' | 'released';
  cash_confirmed_at: string | null;
  cash_confirmed_by: string | null;
  cash_ref: string | null;
  energy_confirmed_at: string | null;
  energy_confirmed_by: string | null;
  energy_ref: string | null;
  locked_at: string | null;
  released_at: string | null;
};

const LOCK_PILL: Record<string, string> = {
  open: 'bg-gray-200 text-gray-700',
  cash_in: 'bg-blue-100 text-blue-700',
  energy_in: 'bg-amber-100 text-amber-800',
  locked: 'bg-green-100 text-green-700',
  released: 'bg-purple-100 text-purple-700',
};

const ZAR = (n: number) => `R${Math.round(Math.abs(n || 0)).toLocaleString('en-ZA')}`;

export function DvpPanel() {
  const { user } = useAuth();
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleId, setCycleId] = useState<string>('');
  const [lock, setLock] = useState<DvpLock | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<'cash' | 'energy' | null>(null);

  const canConfirm = user?.role === 'admin' || user?.role === 'support';
  const canRelease = user?.role === 'admin';

  const loadCycles = useCallback(async () => {
    try {
      const r = await api.get('/settlement-deep/cycles');
      const rows = (r.data?.data || []) as Cycle[];
      setCycles(rows);
      if (rows.length && !cycleId) setCycleId(rows[0].id);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'Failed to load cycles');
    }
  }, [cycleId]);

  const loadLock = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await api.get(`/settlement/dvp/cycle/${id}`);
      setLock(r.data?.data || null);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'Failed to load DvP lock');
      setLock(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCycles(); }, [loadCycles]);
  useEffect(() => { void loadLock(cycleId); }, [cycleId, loadLock]);

  const confirmLeg = async (leg: 'cash' | 'energy', ref: string) => {
    if (!cycleId || !ref) return;
    setBusy(leg);
    setErr(null);
    try {
      await api.post(`/settlement/dvp/cycle/${cycleId}/${leg}`, { reference: ref });
      await loadLock(cycleId);
      setShowConfirm(null);
    } catch (e: any) {
      setErr(e?.response?.data?.error || `Failed to confirm ${leg}`);
    } finally {
      setBusy(null);
    }
  };

  const release = async () => {
    if (!cycleId) return;
    setBusy('release');
    setErr(null);
    try {
      await api.post(`/settlement/dvp/cycle/${cycleId}/release`, {});
      await loadLock(cycleId);
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to release');
    } finally {
      setBusy(null);
    }
  };

  const currentCycle = cycles.find(c => c.id === cycleId);
  const lockStatus = lock?.lock_status || 'open';
  const canConfirmCash = canConfirm && (lockStatus === 'open' || lockStatus === 'energy_in');
  const canConfirmEnergy = canConfirm && (lockStatus === 'open' || lockStatus === 'cash_in');
  const canRelease_ = canRelease && lockStatus === 'locked';

  return (
    <div className="space-y-4" data-testid="dvp-panel">
      {/* Cycle picker */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-[#0f1c2e] text-white rounded-lg">
        <div className="flex-1 min-w-[260px]">
          <label className="block text-[10px] uppercase tracking-wider text-[#7a90a8]">Settlement cycle</label>
          <select
            value={cycleId}
            onChange={e => setCycleId(e.target.value)}
            className="mt-1 w-full h-9 px-2 bg-[#16273e] border border-[#2c4868] rounded text-[13px]"
            data-testid="dvp-cycle-select"
          >
            {cycles.length === 0 && <option value="">No cycles available</option>}
            {cycles.map(c => (
              <option key={c.id} value={c.id}>
                {c.trade_date} → {c.value_date} · {c.total_trades} trades · {ZAR(c.total_value_zar)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[140px]">
          <div className="text-[10px] uppercase tracking-wider text-[#7a90a8]">Lock status</div>
          <div className="mt-1">
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${LOCK_PILL[lockStatus] || 'bg-gray-200'}`} data-testid="dvp-status">
              {lockStatus.replace(/_/g, ' ')}
            </span>
          </div>
        </div>
        {canRelease_ && (
          <button type="button"
            onClick={() => void release()}
            disabled={busy === 'release'}
            className="px-3 py-1.5 bg-purple-600 rounded text-[13px] hover:bg-purple-700 disabled:opacity-50"
            data-testid="dvp-release"
          >
            {busy === 'release' ? 'Releasing…' : 'Release'}
          </button>
        )}
      </div>

      {err && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{err}</div>}

      {loading && <div className="rounded-xl bg-gray-100 p-4 text-sm text-ionex-text-mute">Loading lock state…</div>}

      {/* State machine card */}
      {lock && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Cash leg */}
          <div className={`rounded-xl border p-4 ${lock.cash_confirmed_at ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-wide font-semibold">Cash leg</div>
              {lock.cash_confirmed_at
                ? <span className="px-2 py-0.5 rounded-full bg-green-600 text-white text-[10px]">CONFIRMED</span>
                : <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px]">PENDING</span>}
            </div>
            {lock.cash_confirmed_at ? (
              <div className="text-[12px] space-y-1">
                <div><span className="text-ionex-text-mute">When:</span> {new Date(lock.cash_confirmed_at).toLocaleString()}</div>
                <div><span className="text-ionex-text-mute">By:</span> {lock.cash_confirmed_by}</div>
                <div><span className="text-ionex-text-mute">Bank ref:</span> <span className="font-mono">{lock.cash_ref}</span></div>
              </div>
            ) : (
              <div>
                <div className="text-[12px] text-ionex-text-mute mb-2">Awaiting bank settlement confirmation.</div>
                {canConfirmCash && (
                  <button type="button"
                    onClick={() => setShowConfirm('cash')}
                    className="px-3 py-1 text-[12px] bg-blue-600 text-white rounded hover:bg-blue-700"
                    data-testid="dvp-confirm-cash"
                  >
                    Confirm cash
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Energy leg */}
          <div className={`rounded-xl border p-4 ${lock.energy_confirmed_at ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-wide font-semibold">Energy leg</div>
              {lock.energy_confirmed_at
                ? <span className="px-2 py-0.5 rounded-full bg-green-600 text-white text-[10px]">CONFIRMED</span>
                : <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px]">PENDING</span>}
            </div>
            {lock.energy_confirmed_at ? (
              <div className="text-[12px] space-y-1">
                <div><span className="text-ionex-text-mute">When:</span> {new Date(lock.energy_confirmed_at).toLocaleString()}</div>
                <div><span className="text-ionex-text-mute">By:</span> {lock.energy_confirmed_by}</div>
                <div><span className="text-ionex-text-mute">NER ref:</span> <span className="font-mono">{lock.energy_ref}</span></div>
              </div>
            ) : (
              <div>
                <div className="text-[12px] text-ionex-text-mute mb-2">Awaiting NER delivery confirmation.</div>
                {canConfirmEnergy && (
                  <button type="button"
                    onClick={() => setShowConfirm('energy')}
                    className="px-3 py-1 text-[12px] bg-amber-600 text-white rounded hover:bg-amber-700"
                    data-testid="dvp-confirm-energy"
                  >
                    Confirm energy
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pipeline diagram */}
      {lock && (
        <div className="rounded-xl border border-ionex-border-100 bg-white p-4">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-ionex-text-mute mb-3">State pipeline</div>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            {(['open', 'cash_in', 'energy_in', 'locked', 'released'] as const).map((stage, idx, arr) => {
              const isActive = stage === lockStatus;
              const order = arr.indexOf(lockStatus);
              const isPast = idx < order;
              return (
                <React.Fragment key={stage}>
                  <div className={`flex-1 text-center px-2 py-1.5 rounded ${isActive ? 'bg-ionex-brand text-white font-semibold' : isPast ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                    {stage.replace(/_/g, ' ')}
                  </div>
                  {idx < arr.length - 1 && <div className="text-gray-400">→</div>}
                </React.Fragment>
              );
            })}
          </div>
          {lock.locked_at && (
            <div className="mt-3 text-[11px] text-ionex-text-mute">
              Locked at {new Date(lock.locked_at).toLocaleString()}
              {lock.released_at && ` · Released at ${new Date(lock.released_at).toLocaleString()}`}
            </div>
          )}
        </div>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <ConfirmLegModal
          leg={showConfirm}
          onClose={() => setShowConfirm(null)}
          onConfirm={(ref) => void confirmLeg(showConfirm, ref)}
          busy={busy === showConfirm}
        />
      )}

      {currentCycle && (
        <div className="text-[11px] text-ionex-text-mute">
          Cycle: <span className="font-mono">{currentCycle.id}</span> · status {currentCycle.status} · {currentCycle.total_trades} trades · {ZAR(currentCycle.total_value_zar)}
        </div>
      )}
    </div>
  );
}

function ConfirmLegModal({ leg, onClose, onConfirm, busy }: { leg: 'cash' | 'energy'; onClose: () => void; onConfirm: (ref: string) => void; busy: boolean }) {
  const [ref, setRef] = useState('');
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-3">Confirm {leg} leg</h3>
        <p className="text-sm text-ionex-text-mute mb-3">
          {leg === 'cash'
            ? 'Enter the bank settlement reference (BNK-xxx) once funds have cleared.'
            : 'Enter the NER delivery confirmation reference once energy has been dispatched.'}
        </p>
        <input
          type="text"
          value={ref}
          onChange={e => setRef(e.target.value)}
          placeholder={leg === 'cash' ? 'BNK-260527-001' : 'NER-260527-001'}
          className="w-full px-3 py-2 border border-ionex-border-200 rounded font-mono text-sm"
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-3 py-1.5 border border-ionex-border-200 rounded text-sm">Cancel</button>
          <button type="button"
            onClick={() => onConfirm(ref)}
            disabled={busy || !ref.trim()}
            className="px-3 py-1.5 bg-ionex-brand text-white rounded text-sm disabled:opacity-50"
          >
            {busy ? 'Confirming…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
