// pages/src/meridian/surfaces/offtaker/PpaPortfolioSurface.tsx
//
// Meridian surface — "PPA portfolio" (offtaker role). The offtaker's book of power-purchase
// agreements (GET /api/roles/offtaker/ppa-portfolio) with an Add-PPA initiator
// (POST /api/roles/offtaker/ppa-portfolio — only counterparty_name is required; everything else
// optional, status defaults to 'signed'). This is the portfolio inventory; per-contract workflow
// (variations, indexation, termination) runs through the dedicated chains. Bucket B / L3 — list +
// structured create with server validation. Registered as `offtaker:ppa_portfolio`, reached via
// the roleData feature key `ppa_portfolio`.
import React, { useEffect, useState } from 'react';
import { ListingTable, ActionModal, Pill, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

const num = (v: any, dp = 0) => (v == null ? '—' : Number(v).toLocaleString('en-ZA', { maximumFractionDigits: dp }));

// Consolidated portfolio rollup — one "master PPA" view across every underlying contract.
interface PpaRow { capacity_mw?: number; price_zar_per_mwh?: number; expected_p50_gwh_yr?: number; ppa_end_date?: string; counterparty_name?: string; status?: string }
function summarise(rows: PpaRow[]) {
  const n = rows.length;
  const totalMw = rows.reduce((s, r) => s + (Number(r.capacity_mw) || 0), 0);
  const totalP50 = rows.reduce((s, r) => s + (Number(r.expected_p50_gwh_yr) || 0), 0);
  const wSum = rows.reduce((s, r) => s + (Number(r.capacity_mw) || 0) * (Number(r.price_zar_per_mwh) || 0), 0);
  const priced = rows.filter((r) => Number(r.price_zar_per_mwh) > 0);
  const blended = totalMw > 0 && wSum > 0 ? wSum / totalMw
    : priced.length ? priced.reduce((s, r) => s + Number(r.price_zar_per_mwh), 0) / priced.length : null;
  const ends = rows.map((r) => r.ppa_end_date).filter(Boolean).sort() as string[];
  const counterparties = new Set(rows.map((r) => r.counterparty_name).filter(Boolean)).size;
  const active = rows.filter((r) => /active|signed|operational|delivering/i.test(r.status || '')).length;
  return { n, totalMw, totalP50, blended, firstExpiry: ends[0], counterparties, active };
}

function MasterPpaCard({ s }: { s: ReturnType<typeof summarise> }) {
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
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.02em' }}>Consolidated PPA — Goldrush offtake portfolio</span>
        <Pill tone="good">{s.active}/{s.n} active</Pill>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 18 }}>
        {cell('Contracted capacity', `${num(s.totalMw, 1)} MW`)}
        {cell('Blended price', s.blended != null ? `R ${num(s.blended)}/MWh` : '—')}
        {cell('Expected energy', `${num(s.totalP50, 1)} GWh/yr`)}
        {cell('Sites / sellers', `${s.counterparties}`)}
        {cell('First expiry', s.firstExpiry ? new Date(s.firstExpiry).toLocaleDateString() : '—')}
      </div>
    </div>
  );
}

function statusTone(s?: string): 'good' | 'warn' | 'bad' | 'neutral' | 'info' {
  if (!s) return 'neutral';
  if (/active|signed|operational|delivering/i.test(s)) return 'good';
  if (/expired|terminated|lapsed/i.test(s)) return 'bad';
  if (/pending|negotiation|draft/i.test(s)) return 'warn';
  return 'info';
}

const ADD_FIELDS: FieldSpec[] = [
  { key: 'counterparty_name', label: 'Counterparty', required: true, placeholder: 'Generator / seller' },
  { key: 'contract_ref', label: 'Contract reference', placeholder: 'PPA-####' },
  { key: 'technology', label: 'Technology', type: 'select', options: [
    { value: 'solar_pv', label: 'Solar PV' }, { value: 'wind', label: 'Wind' },
    { value: 'bess', label: 'Battery storage' }, { value: 'hydro', label: 'Hydro' },
    { value: 'biomass', label: 'Biomass' }, { value: 'gas', label: 'Gas' }, { value: 'hybrid', label: 'Hybrid' },
  ] },
  { key: 'capacity_mw', label: 'Capacity (MW)', type: 'number' },
  { key: 'ppa_term_years', label: 'Term (years)', type: 'number' },
  { key: 'ppa_start_date', label: 'Start date', type: 'date' },
  { key: 'ppa_end_date', label: 'End date', type: 'date' },
  { key: 'price_zar_per_mwh', label: 'Price (R/MWh)', type: 'number' },
  { key: 'indexation', label: 'Indexation', placeholder: 'e.g. CPI, fixed 4.5%' },
  { key: 'expected_p50_gwh_yr', label: 'Expected P50 (GWh/yr)', type: 'number' },
  { key: 'green_attributes', label: 'Green attributes', type: 'select', options: [
    { value: 'bundled', label: 'Bundled (RECs included)' }, { value: 'unbundled', label: 'Unbundled' }, { value: 'none', label: 'None' },
  ] },
  { key: 'status', label: 'Status', type: 'select', defaultValue: 'signed', options: [
    { value: 'signed', label: 'Signed' }, { value: 'negotiation', label: 'In negotiation' },
    { value: 'active', label: 'Active' }, { value: 'expired', label: 'Expired' },
  ] },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];

export default function PpaPortfolioSurface(_props: { role: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [summary, setSummary] = useState<ReturnType<typeof summarise> | null>(null);

  useEffect(() => {
    let live = true;
    api.get('/roles/offtaker/ppa-portfolio')
      .then((r) => { if (live && r.data?.success) setSummary(summarise(r.data.data as PpaRow[])); })
      .catch(() => { /* summary is enhancement only */ });
    return () => { live = false; };
  }, [refreshKey]);

  return (
    <div>
      {summary && summary.n > 0 && <MasterPpaCard s={summary} />}

      <div className="flex items-center justify-between mb-3">
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3, #8a8f98)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Underlying contracts</span>
        <button type="button" onClick={() => setAdding(true)}
          className="h-9 px-4 rounded-md bg-[var(--petrol)] text-white text-[13px] font-semibold">+ Add PPA</button>
      </div>

      <ListingTable
        key={refreshKey}
        endpoint="/roles/offtaker/ppa-portfolio"
        rowKey={(r) => r.id ?? r.contract_ref}
        empty={{ title: 'No PPAs', description: 'Add the power-purchase agreements in your offtake book.' }}
        columns={[
          { key: 'contract_ref', label: 'Contract', render: (r) => <span className="font-mono text-[11px]">{r.contract_ref || '—'}</span> },
          { key: 'counterparty_name', label: 'Counterparty' },
          { key: 'technology', label: 'Tech' },
          { key: 'capacity_mw', label: 'MW', align: 'right', render: (r) => num(r.capacity_mw, 1) },
          { key: 'price_zar_per_mwh', label: 'R/MWh', align: 'right', render: (r) => num(r.price_zar_per_mwh) },
          { key: 'indexation', label: 'Indexation', render: (r) => r.indexation || '—' },
          { key: 'expected_p50_gwh_yr', label: 'P50 GWh/yr', align: 'right', render: (r) => num(r.expected_p50_gwh_yr, 1) },
          { key: 'ppa_end_date', label: 'Expiry', render: (r) => (r.ppa_end_date ? new Date(r.ppa_end_date).toLocaleDateString() : '—') },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={statusTone(r.status)}>{r.status || '—'}</Pill> },
        ]}
      />

      {adding && (
        <ActionModal
          title="Add PPA"
          submitLabel="Add to portfolio"
          cta="primary"
          fields={ADD_FIELDS}
          onClose={() => setAdding(false)}
          onSubmit={async (v) => {
            await api.post('/roles/offtaker/ppa-portfolio', v);
            setAdding(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
