import React, { useEffect, useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { api } from '../../lib/api';

export function OfftakerWorkstationPage() {
  return (
    <WorkstationShell
      eyebrow="Offtaker · Workstation"
      title="Offtaker workstation"
      subtitle="Delivery points · Tariffs · Budgets · RECs · Scope 2. Day-to-day energy ops for a corporate consumer."
      backHref="/offtaker-suite"
      backLabel="Offtaker suite"
      tabs={[
        { key: 'sites', label: 'Sites & groups', body: ({ onRefresh }) => <SitesTab onRefresh={onRefresh} /> },
        { key: 'tariffs', label: 'Tariffs', body: () => <TariffsTab /> },
        { key: 'budgets', label: 'Budget vs actual', body: ({ onRefresh }) => <BudgetsTab onRefresh={onRefresh} /> },
        { key: 'recs', label: 'RECs portfolio', body: ({ onRefresh }) => <RecsTab onRefresh={onRefresh} /> },
        { key: 'scope2', label: 'Scope 2', body: ({ onRefresh }) => <Scope2Tab onRefresh={onRefresh} /> },
        { key: 'audit', label: 'Audit & compliance',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/offtaker-suite"
              reconHint="certificate_serial,mwh_represented,status,registry"
              reconSourceOptions={['i_rec', 'gold_standard', 'verra']}
              onChange={onRefresh}
            />
          ),
        },
      ]}
    />
  );
}

function SitesTab({ onRefresh }: { onRefresh: () => void }) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setCreating(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
          + New site group
        </button>
      </div>
      <div>
        <h3 className="text-[13px] font-semibold text-[#3d4756] mb-2">Delivery points</h3>
        <ListingTable
          endpoint="/offtaker/delivery-points"
          rowKey={(r) => r.id}
          empty={{ title: 'No delivery points', description: 'Register your supply points to start tracking consumption and tariffs.' }}
          columns={[
            { key: 'site_name', label: 'Site', render: (r) => r.site_name || r.name },
            { key: 'meter_id', label: 'Meter', render: (r) => <span className="font-mono text-[11px]">{r.meter_id || '—'}</span> },
            { key: 'utility', label: 'Utility' },
            { key: 'tariff_code', label: 'Tariff', render: (r) => r.tariff_code || '—' },
            { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'active' ? 'good' : 'neutral'}>{r.status || 'active'}</Pill> },
          ]}
        />
      </div>
      <div>
        <h3 className="text-[13px] font-semibold text-[#3d4756] mb-2">Site groups</h3>
        <ListingTable
          endpoint="/offtaker-suite/groups"
          rowKey={(r) => r.id}
          empty={{ title: 'No site groups', description: 'Group sites for consolidated invoicing, cost-centre rollups, and budget allocation.' }}
          columns={[
            { key: 'group_name', label: 'Group' },
            { key: 'group_type', label: 'Type' },
            { key: 'billing_entity', label: 'Billing entity' },
            { key: 'member_count', label: 'Members', align: 'right' },
            { key: 'consolidated_invoice', label: 'Consolidated', render: (r) => <Pill tone={r.consolidated_invoice ? 'good' : 'neutral'}>{r.consolidated_invoice ? 'yes' : 'no'}</Pill> },
          ]}
        />
      </div>
      {creating && (
        <ActionModal
          title="Create site group"
          submitLabel="Create"
          fields={[
            { key: 'group_name', label: 'Group name', required: true },
            { key: 'group_type', label: 'Type', type: 'select', options: [
              { value: 'corporate', label: 'Corporate' },
              { value: 'campus', label: 'Campus' },
              { value: 'portfolio', label: 'Portfolio' },
            ] },
            { key: 'billing_entity', label: 'Billing entity (legal name)' },
            { key: 'vat_number', label: 'VAT number' },
            { key: 'cost_centre', label: 'Cost centre' },
          ] as FieldSpec[]}
          onClose={() => setCreating(false)}
          onSubmit={async (v) => {
            await api.post('/offtaker-suite/groups', v);
            setCreating(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function TariffsTab() {
  return (
    <ListingTable
      endpoint="/offtaker-suite/tariffs"
      rowKey={(r) => r.id}
      empty={{ title: 'No tariffs', description: 'Active utility tariffs will appear here for comparison and assignment.' }}
      columns={[
        { key: 'tariff_code', label: 'Code', render: (r) => <span className="font-mono text-[11px]">{r.tariff_code}</span> },
        { key: 'tariff_name', label: 'Name' },
        { key: 'utility', label: 'Utility' },
        { key: 'category', label: 'Category' },
        { key: 'structure_type', label: 'Structure', render: (r) => <Pill tone="info">{r.structure_type}</Pill> },
        { key: 'effective_from', label: 'Effective from' },
      ]}
    />
  );
}

function BudgetsTab({ onRefresh }: { onRefresh: () => void }) {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-end gap-3">
        <label className="block text-[13px]">
          <span className="text-[#6b7685]">Period (YYYY-MM)</span>
          <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-05" className="mt-1 h-9 px-3 border border-[#dde4ec] rounded-md text-[13px]" />
        </label>
        <button onClick={() => setCreating(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
          + Set budget
        </button>
      </div>
      <ListingTable
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
            { key: 'delivery_point_id', label: 'Delivery point ID (optional)' },
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
            setCreating(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

type RecsPortfolio = {
  participant_id: string;
  active_certificates: number;
  active_mwh: number;
  retirements: number;
  retired_mwh: number;
};

function RecsTab({ onRefresh }: { onRefresh: () => void }) {
  const [portfolio, setPortfolio] = useState<RecsPortfolio | null>(null);
  const [retiring, setRetiring] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.get('/offtaker-suite/recs/portfolio')
      .then((r) => setPortfolio((r.data?.data || null) as RecsPortfolio | null))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'failed'));
  }, [onRefresh]);
  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button onClick={() => setTransferring(true)} className="h-9 px-3 rounded-md bg-white border border-[#dde4ec] text-[12px] font-semibold">Transfer certificate</button>
        <button onClick={() => setRetiring(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">Retire certificate</button>
      </div>
      {err && <div className="text-[12px] text-red-700">{err}</div>}
      {portfolio && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Active certificates" value={portfolio.active_certificates} />
          <Card label="Active MWh" value={portfolio.active_mwh} unit="MWh" />
          <Card label="Retirements" value={portfolio.retirements} />
          <Card label="Retired MWh" value={portfolio.retired_mwh} unit="MWh" />
        </div>
      )}
      {transferring && (
        <ActionModal
          title="Transfer REC certificate"
          submitLabel="Transfer"
          fields={[
            { key: 'certificate_id', label: 'Certificate ID', required: true, placeholder: 'rec_…' },
            { key: 'to_participant_id', label: 'New owner participant ID', required: true },
          ] as FieldSpec[]}
          onClose={() => setTransferring(false)}
          onSubmit={async (v) => {
            await api.post(`/offtaker-suite/recs/certificates/${v.certificate_id}/transfer`, { to_participant_id: v.to_participant_id });
            setTransferring(false); onRefresh();
          }}
        />
      )}
      {retiring && (
        <ActionModal
          title="Retire REC certificate"
          submitLabel="Retire"
          fields={[
            { key: 'certificate_id', label: 'Certificate ID', required: true, placeholder: 'rec_…' },
            { key: 'retirement_purpose', label: 'Retirement purpose', required: true, placeholder: 'e.g. Voluntary Scope 2 disclosure 2025' },
            { key: 'retirement_certificate_number', label: 'Retirement certificate #', required: true },
            { key: 'consumption_period_start', label: 'Consumption period start', type: 'date' },
            { key: 'consumption_period_end', label: 'Consumption period end', type: 'date' },
            { key: 'consumption_mwh', label: 'Consumption MWh', type: 'number' },
            { key: 'beneficiary_name', label: 'Beneficiary name' },
            { key: 'beneficiary_statement', label: 'Beneficiary statement', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setRetiring(false)}
          onSubmit={async (v) => {
            const body: any = {
              retirement_purpose: v.retirement_purpose,
              retirement_certificate_number: v.retirement_certificate_number,
            };
            for (const k of ['consumption_period_start','consumption_period_end','beneficiary_name','beneficiary_statement']) {
              if (v[k]) body[k] = v[k];
            }
            if (v.consumption_mwh) body.consumption_mwh = Number(v.consumption_mwh);
            await api.post(`/offtaker-suite/recs/certificates/${v.certificate_id}/retire`, body);
            setRetiring(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function Scope2Tab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setFiling(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
          + New disclosure
        </button>
      </div>
      <ListingTable
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
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function Card({ label, value, unit }: { label: string; value: number | null | undefined; unit?: string }) {
  const formatted = value != null ? `${Number(value).toLocaleString()}${unit ? ' ' + unit : ''}` : '—';
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
      <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">{label}</div>
      <div className="text-[20px] font-semibold text-[#0f1c2e] mt-1">{formatted}</div>
    </div>
  );
}
