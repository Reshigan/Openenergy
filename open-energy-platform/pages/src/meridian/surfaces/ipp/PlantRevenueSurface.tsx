// pages/src/meridian/surfaces/ipp/PlantRevenueSurface.tsx
//
// Meridian surface — "Plant performance & revenue" (ipp_developer role). The operational
// post-COD view an IPP actually wants: per-plant metered generation (MWh) and the money it
// settled, straight off the physical private-wire invoice lines
// (GET /api/esums/settlement-invoices — esums_settlement_invoices, scoped to the caller as
// from_participant). The Horizon generation/revenue KPI tiles point here. Each row is one
// monthly invoice line per plant; we roll them up per plant (lifetime generation + paid +
// outstanding) and a portfolio total on top. List + drill — read-only operational truth; the
// invoice lifecycle (issue/dispute/pay) runs through the dedicated settlement chain.
import React, { useEffect, useState } from 'react';
import { Pill } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

const num = (v: any, dp = 0) => (v == null ? '—' : Number(v).toLocaleString('en-ZA', { maximumFractionDigits: dp }));
const zar = (v: any) => (v == null ? '—' : `R ${Number(v).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`);

interface InvoiceRow {
  id: string;
  station_id: string;
  station_name?: string;
  to_name?: string;
  period_start?: string;
  period_end?: string;
  kwh_delivered?: number;
  tariff_rate_zar_per_kwh?: number;
  gross_revenue_zar?: number;
  total_zar?: number;
  status?: string;
  invoice_number?: string;
}

interface PlantRollup {
  station_id: string;
  station_name: string;
  offtaker?: string;
  lines: number;
  mwh: number;
  paid: number;
  outstanding: number;
  lastPeriod?: string;
  blendedTariff: number | null;
}

function rollupByPlant(rows: InvoiceRow[]): PlantRollup[] {
  const m = new Map<string, PlantRollup>();
  for (const r of rows) {
    const key = r.station_id;
    let p = m.get(key);
    if (!p) {
      p = { station_id: key, station_name: r.station_name || key, offtaker: r.to_name,
        lines: 0, mwh: 0, paid: 0, outstanding: 0, lastPeriod: undefined, blendedTariff: null };
      m.set(key, p);
    }
    p.lines += 1;
    p.mwh += (Number(r.kwh_delivered) || 0) / 1000;
    const total = Number(r.total_zar) || 0;
    if (r.status === 'paid') p.paid += total; else p.outstanding += total;
    if (!p.lastPeriod || (r.period_start && r.period_start > p.lastPeriod)) p.lastPeriod = r.period_start;
  }
  // blended tariff = lifetime revenue / lifetime kWh, per plant
  for (const p of m.values()) {
    const kwh = p.mwh * 1000;
    p.blendedTariff = kwh > 0 ? (p.paid + p.outstanding) / kwh : null;
  }
  return [...m.values()].sort((a, b) => b.mwh - a.mwh);
}

function PortfolioCard({ plants }: { plants: PlantRollup[] }) {
  const mwh = plants.reduce((s, p) => s + p.mwh, 0);
  const paid = plants.reduce((s, p) => s + p.paid, 0);
  const outstanding = plants.reduce((s, p) => s + p.outstanding, 0);
  const cell = (label: string, value: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3, #8a8f98)' }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text1, #fff)' }}>{value}</span>
    </div>
  );
  return (
    <div style={{ border: '1px solid var(--border, #2a2d34)', borderRadius: 12, padding: '18px 20px', marginBottom: 18,
      background: 'linear-gradient(135deg, color-mix(in oklab, var(--petrol) 14%, transparent), transparent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.02em' }}>Portfolio — metered generation &amp; settled revenue</span>
        <Pill tone="good">{plants.length} {plants.length === 1 ? 'plant' : 'plants'}</Pill>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 18 }}>
        {cell('Generation', `${num(mwh, 1)} MWh`)}
        {cell('Settled revenue', zar(paid))}
        {cell('Outstanding', zar(outstanding))}
        {cell('Total billed', zar(paid + outstanding))}
      </div>
    </div>
  );
}

function statusTone(s?: string): 'good' | 'warn' | 'bad' | 'neutral' | 'info' {
  if (!s) return 'neutral';
  if (/paid/i.test(s)) return 'good';
  if (/dispute|void|overdue/i.test(s)) return 'bad';
  if (/issued|draft|pending/i.test(s)) return 'warn';
  return 'info';
}

export default function PlantRevenueSurface(_props: { role: string }) {
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    api.get('/esums/settlement-invoices?limit=200')
      .then((r) => { if (live) setRows((r.data?.data as InvoiceRow[]) || []); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, []);

  if (error) return <div className="mer mer-error" role="alert">Could not load settlement data.</div>;
  if (!rows) return <div className="mer mer-loading" aria-busy="true">Loading plant performance…</div>;
  if (rows.length === 0) {
    return <div className="mer" style={{ padding: 24, color: 'var(--text3,#8a8f98)' }}>
      No settled generation yet. Once the monthly accrual run materialises invoices for your plants, per-plant generation and revenue appear here.
    </div>;
  }

  const plants = rollupByPlant(rows);

  return (
    <div>
      <PortfolioCard plants={plants} />

      <div className="flex items-center justify-between mb-3">
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3, #8a8f98)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Per-plant performance &amp; revenue</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="mer-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text3,#8a8f98)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <th style={{ padding: '8px 10px' }}>Plant</th>
              <th style={{ padding: '8px 10px' }}>Offtaker</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Generation MWh</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Blended R/kWh</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Settled</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Outstanding</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Months</th>
              <th style={{ padding: '8px 10px' }}>Last period</th>
            </tr>
          </thead>
          <tbody>
            {plants.map((p) => (
              <tr key={p.station_id} style={{ borderTop: '1px solid var(--border,#2a2d34)' }}>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{p.station_name}</td>
                <td style={{ padding: '8px 10px' }}>{p.offtaker || '—'}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{num(p.mwh, 1)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{p.blendedTariff != null ? num(p.blendedTariff, 3) : '—'}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{zar(p.paid)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  {p.outstanding > 0 ? <span style={{ color: 'var(--amber,#d9a441)' }}>{zar(p.outstanding)}</span> : zar(0)}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{p.lines}</td>
                <td style={{ padding: '8px 10px' }}>{p.lastPeriod ? new Date(p.lastPeriod).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short' }) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-5 mb-3">
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3, #8a8f98)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Settlement invoice lines</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="mer-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text3,#8a8f98)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <th style={{ padding: '8px 10px' }}>Invoice</th>
              <th style={{ padding: '8px 10px' }}>Plant</th>
              <th style={{ padding: '8px 10px' }}>Period</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>kWh</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total</th>
              <th style={{ padding: '8px 10px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border,#2a2d34)' }}>
                <td style={{ padding: '8px 10px', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{r.invoice_number || r.id.slice(0, 10)}</td>
                <td style={{ padding: '8px 10px' }}>{r.station_name || r.station_id}</td>
                <td style={{ padding: '8px 10px' }}>{r.period_start ? new Date(r.period_start).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short' }) : '—'}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{num(r.kwh_delivered)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{zar(r.total_zar)}</td>
                <td style={{ padding: '8px 10px' }}><Pill tone={statusTone(r.status)}>{r.status || '—'}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
