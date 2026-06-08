// ═══════════════════════════════════════════════════════════════════════════
// MarginGateWidget — Wave 3 clearing-member margin gate board.
//
// Lists all clearing members + their gate state (clear / warning / blocked).
// Admin can recompute or apply a manual override with reason.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

type GateRow = {
  member_id: string;
  gate_status: 'clear' | 'warning' | 'blocked';
  open_call_count: number;
  overdue_call_count: number;
  total_call_amount_zar: number;
  earliest_deadline: string | null;
  last_evaluated_at: string;
  manual_override: 0 | 1;
  override_reason: string | null;
  override_by: string | null;
};

const GATE_PILL: Record<string, string> = {
  clear: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-800',
  blocked: 'bg-red-100 text-red-700',
};

const ZAR = (n: number) => `R${Math.round(Math.abs(n || 0)).toLocaleString('en-ZA')}`;

export function MarginGateWidget() {
  const { user } = useAuth();
  const [rows, setRows] = useState<GateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [overrideRow, setOverrideRow] = useState<GateRow | null>(null);

  const canManage = user?.role === 'admin' || user?.role === 'support';

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.get('/clearing/margin-gate');
      setRows((r.data?.data || []) as GateRow[]);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'Failed to load margin gate');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const recompute = async (memberId: string) => {
    setBusy(memberId);
    setErr(null);
    try {
      await api.post(`/clearing/margin-gate/${memberId}/recompute`, {});
      await load();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to recompute');
    } finally {
      setBusy(null);
    }
  };

  const clearOverride = async (memberId: string) => {
    setBusy(memberId);
    setErr(null);
    try {
      await api.delete(`/clearing/margin-gate/${memberId}/override`);
      await load();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to clear override');
    } finally {
      setBusy(null);
    }
  };

  const blocked = rows.filter(r => r.gate_status === 'blocked');
  const warning = rows.filter(r => r.gate_status === 'warning');
  const clear = rows.filter(r => r.gate_status === 'clear');

  return (
    <div className="space-y-4" data-testid="margin-gate-widget">
      {/* Top KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KpiTile label="Blocked" count={blocked.length} accent="bg-red-50 border-red-200 text-red-900" />
        <KpiTile label="Warning" count={warning.length} accent="bg-amber-50 border-amber-200 text-amber-900" />
        <KpiTile label="Clear" count={clear.length} accent="bg-green-50 border-green-200 text-green-900" />
      </div>

      {err && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{err}</div>}

      {/* Member table */}
      <div className="rounded-xl border border-ionex-border-100 bg-white overflow-hidden" data-testid="margin-gate-table">
        <div className="px-4 py-2 border-b border-ionex-border-100 text-[11px] uppercase tracking-wide font-semibold text-ionex-text-mute">
          Clearing members — gate status
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-ionex-text-mute">
            <tr>
              <th className="px-4 py-2">Member</th>
              <th className="px-4 py-2">Gate</th>
              <th className="px-4 py-2">Open calls</th>
              <th className="px-4 py-2">Overdue</th>
              <th className="px-4 py-2">Total call</th>
              <th className="px-4 py-2">Deadline</th>
              <th className="px-4 py-2">Override</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-ionex-text-mute">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-ionex-text-mute">No clearing members.</td></tr>
            ) : rows.map(r => (
              <tr key={r.member_id} className="border-t border-ionex-border-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs">{r.member_id}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] capitalize font-semibold ${GATE_PILL[r.gate_status]}`}>
                    {r.gate_status}
                  </span>
                </td>
                <td className="px-4 py-2">{r.open_call_count}</td>
                <td className={`px-4 py-2 ${r.overdue_call_count ? 'text-red-700 font-semibold' : ''}`}>{r.overdue_call_count}</td>
                <td className="px-4 py-2">{ZAR(r.total_call_amount_zar)}</td>
                <td className="px-4 py-2 text-xs">
                  {r.earliest_deadline ? new Date(r.earliest_deadline).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-2">
                  {r.manual_override ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-100 text-purple-700" title={r.override_reason || ''}>
                      override · {r.override_by}
                    </span>
                  ) : (
                    <span className="text-ionex-text-mute">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {canManage && (
                    <div className="flex gap-1">
                      <button type="button"
                        onClick={() => void recompute(r.member_id)}
                        disabled={busy === r.member_id}
                        className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
                      >
                        Recompute
                      </button>
                      <button type="button"
                        onClick={() => setOverrideRow(r)}
                        className="px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded hover:bg-purple-100"
                        data-testid="margin-gate-override"
                      >
                        Override
                      </button>
                      {r.manual_override === 1 && (
                        <button type="button"
                          onClick={() => void clearOverride(r.member_id)}
                          disabled={busy === r.member_id}
                          className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 disabled:opacity-50"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {overrideRow && (
        <OverrideModal
          row={overrideRow}
          onClose={() => setOverrideRow(null)}
          onSave={async (status, reason) => {
            try {
              await api.post(`/clearing/margin-gate/${overrideRow.member_id}/override`, { gate_status: status, reason });
              setOverrideRow(null);
              await load();
            } catch (e: any) {
              setErr(e?.response?.data?.error || 'Failed to set override');
            }
          }}
        />
      )}
    </div>
  );
}

function KpiTile({ label, count, accent }: { label: string; count: number; accent: string }) {
  return (
    <div className={`rounded-xl border p-3 ${accent}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-75">{label}</div>
      <div className="mt-1 text-[24px] font-bold">{count}</div>
    </div>
  );
}

function OverrideModal({ row, onClose, onSave }: { row: GateRow; onClose: () => void; onSave: (status: 'clear' | 'warning' | 'blocked', reason: string) => Promise<void> }) {
  const [status, setStatus] = useState<'clear' | 'warning' | 'blocked'>(row.gate_status);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 3) return;
    setSaving(true);
    try { await onSave(status, reason); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-3">Override margin gate — {row.member_id}</h3>
        <p className="text-sm text-ionex-text-mute mb-3">
          Manual override trumps the derived state. All overrides are audit-logged.
        </p>
        <label className="block text-sm">
          <span className="text-ionex-text-mute">Target gate</span>
          <select value={status} onChange={e => setStatus(e.target.value as any)} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded">
            <option value="clear">Clear</option>
            <option value="warning">Warning</option>
            <option value="blocked">Blocked</option>
          </select>
        </label>
        <label className="block text-sm mt-3">
          <span className="text-ionex-text-mute">Reason (required, ≥3 chars)</span>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="Why are you overriding the derived state?"
            className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded resize-none"
          />
        </label>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-3 py-1.5 border border-ionex-border-200 rounded text-sm">Cancel</button>
          <button type="button"
            onClick={() => void submit()}
            disabled={saving || reason.trim().length < 3}
            className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Apply override'}
          </button>
        </div>
      </div>
    </div>
  );
}
