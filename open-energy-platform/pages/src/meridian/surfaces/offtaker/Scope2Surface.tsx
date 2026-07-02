// pages/src/meridian/surfaces/offtaker/Scope2Surface.tsx
//
// Meridian surface — "Scope 2" (offtaker role). Extracted verbatim from the inline `Scope2Tab`
// body of the OfftakerWorkstationPage husk (E2.6). Self-contained: lists annual location/market
// based Scope 2 disclosures + a "new disclosure" ActionModal against /offtaker-suite/scope2.
// Registered as `offtaker:scope2` in surfaces.tsx, reached from Atlas (⌘K) via the roleData
// feature key `scope2` (added in E2.6 — distinct from the `scope3` carbon_scope3_disclosure
// chain). Non-chain master-data surface (Bucket B).
import React, { useState } from 'react';
import { ListingTable, Pill, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

export default function Scope2Surface(_props: { role: string }) {
  const [filing, setFiling] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setFiling(true)} className="btn pri">
          + New disclosure
        </button>
      </div>
      <ListingTable
        key={refreshKey}
        endpoint="/offtaker-suite/scope2"
        rowKey={(r) => r.id}
        empty={{ title: 'No Scope 2 disclosures', description: 'Annual location-based / market-based emissions disclosures will appear here.' }}
        columns={[
          { key: 'reporting_year', label: 'Year' },
          { key: 'total_consumption_mwh', label: 'Consumption MWh', align: 'right', render: (r) => Number(r.total_consumption_mwh || 0).toLocaleString() },
          { key: 'location_based_emissions_tco2e', label: 'Loc-based tCO₂e', align: 'right', render: (r) => Number(r.location_based_emissions_tco2e || 0).toFixed(1) },
          { key: 'market_based_emissions_tco2e', label: 'Mkt-based tCO₂e', align: 'right', render: (r) => Number(r.market_based_emissions_tco2e || 0).toFixed(1) },
          { key: 'renewable_percentage', label: 'RE %', align: 'right', render: (r) => `${Number(r.renewable_percentage || 0).toFixed(1)}%` },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'final' ? 'good' : 'warn'}>{r.status}</Pill> },
        ]}
      />
      {filing && (
        <ActionModal
          title="New Scope 2 disclosure"
          submitLabel="Save draft"
          fields={[
            { key: 'reporting_year', label: 'Reporting year', type: 'number', required: true, defaultValue: String(new Date().getFullYear() - 1) },
            { key: 'total_consumption_mwh', label: 'Total consumption MWh', type: 'number', required: true },
            { key: 'grid_factor_tco2e_per_mwh', label: 'Grid factor (tCO₂e/MWh)', type: 'number', required: true, helperText: 'Eskom 2024: ~0.95' },
            { key: 'renewable_mwh_claimed', label: 'RE MWh claimed (RECs retired)', type: 'number' },
            { key: 'audit_reference', label: 'Audit reference' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/offtaker-suite/scope2', {
              reporting_year: Number(v.reporting_year),
              total_consumption_mwh: Number(v.total_consumption_mwh),
              grid_factor_tco2e_per_mwh: Number(v.grid_factor_tco2e_per_mwh),
              renewable_mwh_claimed: v.renewable_mwh_claimed ? Number(v.renewable_mwh_claimed) : 0,
              audit_reference: v.audit_reference || undefined,
            });
            setFiling(false); refresh();
          }}
        />
      )}
    </div>
  );
}
