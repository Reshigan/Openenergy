// pages/src/meridian/surfaces/offtaker/PpaPortfolioSurface.tsx
//
// Meridian surface — "PPA portfolio" (offtaker role). The offtaker's book of power-purchase
// agreements (GET /api/roles/offtaker/ppa-portfolio) with an Add-PPA initiator
// (POST /api/roles/offtaker/ppa-portfolio — only counterparty_name is required; everything else
// optional, status defaults to 'signed'). This is the portfolio inventory; per-contract workflow
// (variations, indexation, termination) runs through the dedicated chains. Bucket B / L3 — list +
// structured create with server validation. Registered as `offtaker:ppa_portfolio`, reached via
// the roleData feature key `ppa_portfolio`.
import React, { useState } from 'react';
import { ListingTable, ActionModal, Pill, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

const num = (v: any, dp = 0) => (v == null ? '—' : Number(v).toLocaleString('en-ZA', { maximumFractionDigits: dp }));

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

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
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
