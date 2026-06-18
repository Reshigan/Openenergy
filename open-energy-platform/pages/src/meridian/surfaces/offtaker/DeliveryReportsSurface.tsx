// pages/src/meridian/surfaces/offtaker/DeliveryReportsSurface.tsx
//
// Meridian surface — "Delivery performance report" (offtaker role). The delivery-performance /
// cure register built on GET /api/offtaker/obligations. Deliberately DISTINCT from the
// `offtaker:obligations` workstation tab (which runs the inline reading-verification queue):
// this surface is the reporting lens — a per-period rollup (contracted vs delivered MWh,
// fulfilment %, take-or-pay exposure) over a downloadable line-by-line register, with the cure
// action (POST /api/offtaker/obligations/:id/cure {evidence_r2_key, notes}) exposed against any
// breached obligation inside its cure window. Bucket B / L4 — period rollup + structured cure
// with evidence. Registered as `offtaker:delivery_reports`, reached via the roleData feature key
// `delivery_reports`.
import React, { useEffect, useMemo, useState } from 'react';
import { ActionModal, Pill, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

type Ob = {
  id?: string; ppa_id?: string; period_month?: string;
  contracted_mwh?: number; delivered_mwh?: number; threshold_pct?: number;
  cure_deadline_at?: string; status?: string; take_or_pay_amount_zar?: number;
  cured_at?: string; notes?: string;
};

const num = (v: any, dp = 0) => (v == null ? '—' : Number(v).toLocaleString('en-ZA', { maximumFractionDigits: dp }));
const zar = (v: any) => (v == null || Number(v) === 0 ? '—' : `R${num(v)}`);

function statusTone(s?: string): 'good' | 'warn' | 'bad' | 'neutral' | 'info' {
  if (!s) return 'neutral';
  if (/cured|met|fulfilled|settled|closed/i.test(s)) return 'good';
  if (/breach|shortfall|take_or_pay|overdue/i.test(s)) return 'bad';
  if (/pending|cure|open|due/i.test(s)) return 'warn';
  return 'info';
}

const canCure = (o: Ob) => !o.cured_at && /breach|shortfall|cure|take_or_pay|open|due/i.test(o.status || '');

function toCsv(rows: Ob[]): string {
  const head = ['period_month', 'ppa_id', 'contracted_mwh', 'delivered_mwh', 'threshold_pct', 'take_or_pay_amount_zar', 'status', 'cure_deadline_at', 'cured_at'];
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [head.join(','), ...rows.map((r) => head.map((k) => esc((r as any)[k])).join(','))].join('\n');
}

export default function DeliveryReportsSurface(_props: { role: string }) {
  const [rows, setRows] = useState<Ob[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [cureId, setCureId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get('/offtaker/obligations')
      .then((res) => {
        if (!alive) return;
        const d = res.data?.data ?? res.data;
        setRows(Array.isArray(d) ? d : []);
      })
      .catch(() => alive && setRows([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [refreshKey]);

  const byPeriod = useMemo(() => {
    const m = new Map<string, { contracted: number; delivered: number; top: number; breaches: number }>();
    for (const r of rows ?? []) {
      const k = r.period_month || '—';
      const e = m.get(k) ?? { contracted: 0, delivered: 0, top: 0, breaches: 0 };
      e.contracted += Number(r.contracted_mwh) || 0;
      e.delivered += Number(r.delivered_mwh) || 0;
      e.top += Number(r.take_or_pay_amount_zar) || 0;
      if (/breach|shortfall|take_or_pay/i.test(r.status || '')) e.breaches += 1;
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  const download = () => {
    const blob = new Blob([toCsv(rows ?? [])], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'delivery-performance.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink3)]">Fulfilment by period</div>
        <button type="button" onClick={download} disabled={!rows?.length}
          className="h-8 px-3 rounded-md border border-[var(--line)] text-[12px] font-semibold text-[var(--ink2)] disabled:opacity-50">
          Export CSV
        </button>
      </div>

      <div className="rounded-lg border border-[var(--line)] overflow-hidden mb-5">
        <table className="w-full text-[12px]">
          <thead><tr className="text-[var(--ink3)] border-b border-[var(--line)] bg-[var(--raised)]">
            <th className="text-left px-4 py-2 font-medium">Period</th>
            <th className="text-right px-4 py-2 font-medium">Contracted MWh</th>
            <th className="text-right px-4 py-2 font-medium">Delivered MWh</th>
            <th className="text-right px-4 py-2 font-medium">Fulfilment</th>
            <th className="text-right px-4 py-2 font-medium">Take-or-pay</th>
            <th className="text-right px-4 py-2 font-medium">Breaches</th>
          </tr></thead>
          <tbody>
            {byPeriod.map(([p, e]) => {
              const pct = e.contracted > 0 ? (e.delivered / e.contracted) * 100 : null;
              return (
                <tr key={p} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-2 font-medium">{p}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{num(e.contracted, 1)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{num(e.delivered, 1)}</td>
                  <td className="px-4 py-2 text-right">
                    <Pill tone={pct == null ? 'neutral' : pct >= 100 ? 'good' : pct >= 90 ? 'warn' : 'bad'}>
                      {pct == null ? '—' : `${num(pct, 1)}%`}
                    </Pill>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{zar(e.top)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{e.breaches || '—'}</td>
                </tr>
              );
            })}
            {!loading && byPeriod.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-[var(--ink3)]">No delivery obligations recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink3)] mb-2">Obligation register</div>
      <div className="rounded-lg border border-[var(--line)] overflow-hidden">
        <table className="w-full text-[12px]">
          <thead><tr className="text-[var(--ink3)] border-b border-[var(--line)] bg-[var(--raised)]">
            <th className="text-left px-4 py-2 font-medium">Period</th>
            <th className="text-left px-4 py-2 font-medium">PPA</th>
            <th className="text-right px-4 py-2 font-medium">Contracted</th>
            <th className="text-right px-4 py-2 font-medium">Delivered</th>
            <th className="text-right px-4 py-2 font-medium">Cure by</th>
            <th className="text-left px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2"></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-[var(--ink3)]">Loading…</td></tr>}
            {!loading && (rows ?? []).map((o, i) => (
              <tr key={o.id ?? i} className="border-b border-[var(--line)] last:border-0">
                <td className="px-4 py-2">{o.period_month || '—'}</td>
                <td className="px-4 py-2 font-mono text-[11px] text-[var(--ink3)]">{o.ppa_id || '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{num(o.contracted_mwh, 1)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{num(o.delivered_mwh, 1)}</td>
                <td className="px-4 py-2 text-right text-[var(--ink3)]">{o.cure_deadline_at ? new Date(o.cure_deadline_at).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-2"><Pill tone={statusTone(o.status)}>{o.status || '—'}</Pill></td>
                <td className="px-4 py-2 text-right">
                  {canCure(o) && o.id && (
                    <button type="button" onClick={() => setCureId(o.id!)}
                      className="h-7 px-2 rounded-md bg-[var(--petrol)] text-white text-[11px] font-semibold">Cure</button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && (rows ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-[var(--ink3)]">No obligations.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {cureId && (
        <ActionModal
          title="Cure delivery shortfall"
          submitLabel="Submit cure"
          cta="primary"
          fields={[
            { key: 'evidence_r2_key', label: 'Evidence reference', required: true, placeholder: 'R2 object key for cure evidence', helperText: 'Upload reference to the make-good / cure-energy proof.' },
            { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Cure narrative' },
          ] as FieldSpec[]}
          onClose={() => setCureId(null)}
          onSubmit={async (v) => {
            await api.post(`/offtaker/obligations/${cureId}/cure`, v);
            setCureId(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
