// ═══════════════════════════════════════════════════════════════════════════
// ScenarioBuilderModal — user-defined scenarios for the trader Risk tab.
// Pick factors → set shock magnitudes (%) → name → save → run-now (optional).
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Factor = { id: string; name: string; factor_type: string; unit: string };
type ShockRow = { factor_id: string; shock_pct: string };

export function ScenarioBuilderModal({
  portfolioId, onClose, onSaved,
}: { portfolioId: string; onClose: () => void; onSaved: () => void }) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [shocks, setShocks] = useState<ShockRow[]>([{ factor_id: '', shock_pct: '' }]);
  const [runAfter, setRunAfter] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void api.get('/risk/factors').then((r) => setFactors(r.data?.data || []));
  }, []);

  const addRow = () => setShocks((s) => [...s, { factor_id: '', shock_pct: '' }]);
  const removeRow = (i: number) => setShocks((s) => s.filter((_, k) => k !== i));
  const setRow = (i: number, patch: Partial<ShockRow>) =>
    setShocks((s) => s.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    setErr(null);
    if (!name.trim()) { setErr('Name required'); return; }
    const valid = shocks
      .filter((s) => s.factor_id && s.shock_pct !== '')
      .map((s) => ({ factor_id: s.factor_id, shock_pct: Number(s.shock_pct) / 100 }));
    if (!valid.length) { setErr('At least one factor shock required'); return; }
    setSaving(true);
    try {
      const created = await api.post('/risk/scenarios', {
        name: name.trim(),
        description: description.trim() || undefined,
        factor_shocks: valid,
      });
      const scenarioId = created.data?.data?.id;
      if (runAfter && scenarioId && portfolioId) {
        await api.post(`/risk/scenarios/${scenarioId}/run?portfolio_id=${portfolioId}`, {});
      }
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="scenario-builder">
        <div className="p-5 border-b border-[#e5ebf2]">
          <h3 className="text-[16px] font-semibold text-[#0f1c2e]">Build scenario</h3>
          <p className="text-[12px] text-[#6b7685] mt-1">Pick factors, set % shocks, save. If "Run now" is checked we'll re-mark this portfolio against the scenario immediately.</p>
        </div>
        <div className="p-5 space-y-4 text-[13px]">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[#6b7685] mb-1">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-9 px-2 border border-[#dbe4ee] rounded" placeholder="e.g. Eskom Tariff +25%" data-testid="scenario-name" />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[#6b7685] mb-1">Description (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-2 py-1 border border-[#dbe4ee] rounded" />
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-[11px] uppercase tracking-wider text-[#6b7685]">Factor shocks</label>
              <button onClick={addRow} className="text-[11px] px-2 py-1 bg-[#f4f7fb] rounded border border-[#dbe4ee]" data-testid="scenario-add-row">+ Add</button>
            </div>
            <div className="space-y-2">
              {shocks.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <select value={r.factor_id} onChange={(e) => setRow(i, { factor_id: e.target.value })} className="flex-1 h-9 px-2 border border-[#dbe4ee] rounded">
                    <option value="">— pick factor —</option>
                    {factors.map((f) => (
                      <option key={f.id} value={f.id}>{f.name} ({f.unit})</option>
                    ))}
                  </select>
                  <input type="number" step="0.5" value={r.shock_pct} onChange={(e) => setRow(i, { shock_pct: e.target.value })}
                    className="w-28 h-9 px-2 border border-[#dbe4ee] rounded text-right font-mono" placeholder="% shock" />
                  {shocks.length > 1 && (
                    <button onClick={() => removeRow(i)} className="h-9 px-2 text-[12px] text-red-600 border border-red-200 rounded">✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={runAfter} onChange={(e) => setRunAfter(e.target.checked)} />
            Run on this portfolio after save
          </label>
          {err && <div className="text-red-700 text-[12px]">{err}</div>}
        </div>
        <div className="px-5 py-3 border-t border-[#e5ebf2] flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-3 rounded border border-[#dbe4ee] text-[12px]">Cancel</button>
          <button onClick={submit} disabled={saving} className="h-9 px-3 rounded bg-[#1a3a5c] text-white text-[12px] font-semibold disabled:opacity-50" data-testid="scenario-save">
            {saving ? 'Saving…' : 'Save scenario'}
          </button>
        </div>
      </div>
    </div>
  );
}
