// pages/src/meridian/surfaces/offtaker/BudgetsSurface.tsx
//
// Meridian surface — "Budget vs actual" (offtaker role). Extracted verbatim from the inline
// `BudgetsTab` body of the OfftakerWorkstationPage husk (E2.6). Self-contained: period selector
// + budget-vs-actual ListingTable + "set budget" ActionModal. Registered as `offtaker:budgets`
// in surfaces.tsx, reached from Atlas (⌘K) via the roleData feature key `budgets` (added in E2.6).
// Non-chain master-data surface (Bucket B).
import React, { useState } from 'react';
import { ListingTable, Pill, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

export default function BudgetsSurface(_props: { role: string }) {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-end gap-3">
        <label className="block text-[13px]">
          <span className="text-[var(--ink3)]">Period (YYYY-MM)</span>
          <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-05" className="mt-1 h-9 px-3 border border-[var(--line)] rounded-md text-[13px]" />
        </label>
        <button type="button" onClick={() => setCreating(true)} className="h-9 px-3 rounded-md bg-[var(--petrol)] text-white text-[12px] font-semibold">
          + Set budget
        </button>
      </div>
      <ListingTable
        key={refreshKey}
        endpoint={`/offtaker-suite/budget-vs-actual?period=${encodeURIComponent(period)}`}
        rowKey={(r) => `${r.delivery_point_id || ''}-${r.site_group_id || ''}-${r.cost_centre || ''}`}
        empty={{ title: 'No budget lines for period', description: 'Use “+ Set budget” to add a budget line for this period.' }}
        columns={[
          { key: 'site_group_id', label: 'Group', render: (r) => r.site_group_id ? <span className="font-mono text-[11px]">{r.site_group_id.slice(0, 10)}…</span> : '—' },
          { key: 'delivery_point_id', label: 'Site', render: (r) => r.delivery_point_id ? <span className="font-mono text-[11px]">{r.delivery_point_id.slice(0, 10)}…</span> : '—' },
          { key: 'cost_centre', label: 'Cost centre', render: (r) => r.cost_centre || '—' },
          { key: 'budgeted_kwh', label: 'Budget kWh', align: 'right', render: (r) => r.budgeted_kwh != null ? Number(r.budgeted_kwh).toLocaleString() : '—' },
          { key: 'actual_kwh', label: 'Actual kWh', align: 'right', render: (r) => r.actual_kwh != null ? Number(r.actual_kwh).toLocaleString() : '—' },
          { key: 'variance_pct', label: 'Variance %', align: 'right', render: (r) => {
            if (r.variance_pct == null) return '—';
            const v = Number(r.variance_pct);
            const tone = Math.abs(v) > 10 ? 'bad' : Math.abs(v) > 5 ? 'warn' : 'good';
            return <Pill tone={tone}>{v.toFixed(1)}%</Pill>;
          } },
        ]}
      />
      {creating && (
        <ActionModal
          title="Set budget line"
          submitLabel="Save"
          fields={[
            { key: 'period', label: 'Period (YYYY-MM)', required: true, defaultValue: period },
            { key: 'site_group_id', label: 'Site group ID (optional)' },
            { key: 'delivery_point_id', label: 'Delivery point (optional)', type: 'lookup', lookupEndpoint: '/api/lookup/sites', lookupAutoFill: { site_name: 'name' } },
            { key: 'budgeted_kwh', label: 'Budget kWh', type: 'number' },
            { key: 'budgeted_zar', label: 'Budget ZAR', type: 'number' },
            { key: 'cost_centre', label: 'Cost centre' },
          ] as FieldSpec[]}
          onClose={() => setCreating(false)}
          onSubmit={async (v) => {
            const body: any = { period: v.period };
            if (v.site_group_id) body.site_group_id = v.site_group_id;
            if (v.delivery_point_id) body.delivery_point_id = v.delivery_point_id;
            if (v.budgeted_kwh) body.budgeted_kwh = Number(v.budgeted_kwh);
            if (v.budgeted_zar) body.budgeted_zar = Number(v.budgeted_zar);
            if (v.cost_centre) body.cost_centre = v.cost_centre;
            await api.post('/offtaker-suite/budgets', body);
            setCreating(false); refresh();
          }}
        />
      )}
    </div>
  );
}
