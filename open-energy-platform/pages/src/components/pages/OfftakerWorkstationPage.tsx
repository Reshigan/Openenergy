import React, { useCallback, useEffect, useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import { api } from '../../lib/api';
import { OfftakerUseClaimTab } from '../offtaker/OfftakerUseClaimTab';
import { ObligationsTab } from '../offtaker/ObligationsTab';
import { PpaChangeInLawChainTab } from '../offtaker/PpaChangeInLawChainTab';
import { PpaAnnualReconChainTab } from '../offtaker/PpaAnnualReconChainTab';
import { PpaNominationChainTab } from '../offtaker/PpaNominationChainTab';
import { StrateSwiftConnectorTab } from '../strateSwiftConnector/StrateSwiftConnectorTab';
import { SapOracleErpConnectorTab } from '../sapOracleErpConnector/SapOracleErpConnectorTab';
import { GovernmentFilingConnectorTab } from '../governmentFilingConnector/GovernmentFilingConnectorTab';
import { WheelingChargesTab } from '../grid/WheelingChargesTab';
import { ReportPanel, type ReportConfig } from '../launch/ReportPanel';
import type { TourDef } from '../launch/ProductTour';

const OFFTAKER_REPORTS: ReportConfig[] = [
  {
    title: 'PPA Contracts',
    endpoint: '/api/offtaker/ppa-contracts',
    columns: [
      { key: 'contract_ref', label: 'Reference' },
      { key: 'seller_name', label: 'Seller' },
      { key: 'capacity_mw', label: 'MW', numeric: true },
      { key: 'tariff_zar_per_mwh', label: 'ZAR/MWh', numeric: true },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Filed' },
    ],
    filters: [{ key: 'chain_status', label: 'Status', type: 'select', options: [{ value: 'in_force', label: 'In Force' }, { value: 'negotiation', label: 'Negotiation' }, { value: 'expired', label: 'Expired' }] }],
    dateKey: 'created_at',
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC — Offtaker PPA Contracts Report',
  },
  {
    title: 'Statutory Report Submissions',
    endpoint: '/api/reports?role=offtaker',
    columns: [
      { key: 'report_type', label: 'Type' },
      { key: 'period', label: 'Period' },
      { key: 'status', label: 'Status' },
      { key: 'submitted_at', label: 'Submitted' },
    ],
    dateKey: 'submitted_at',
    pivotGroupBy: 'report_type',
    mailSubject: 'CEC — Offtaker Statutory Reports',
  },
  {
    title: 'Green Tariff Disclosures',
    endpoint: '/api/offtaker/green-tariff',
    columns: [
      { key: 'disclosure_type', label: 'Standard' },
      { key: 'label_year', label: 'Year' },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Created' },
    ],
    dateKey: 'created_at',
    pivotGroupBy: 'disclosure_type',
    mailSubject: 'CEC — Green Tariff Disclosures',
  },
  {
    title: 'Scope 2 Emissions',
    endpoint: '/api/offtaker/scope2',
    columns: [
      { key: 'reporting_standard', label: 'Standard' },
      { key: 'fiscal_year', label: 'Year' },
      { key: 'scope2_mwh', label: 'MWh', numeric: true },
      { key: 'status', label: 'Status' },
    ],
    dateKey: 'created_at',
    pivotGroupBy: 'reporting_standard',
    mailSubject: 'CEC — Scope 2 Emissions Report',
  },
];

const OFFTAKER_TOUR: TourDef = {
  id: 'offtaker-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'Offtaker workstation', body: 'Manage your renewable energy procurement portfolio from PPA execution through to monthly billing, REC retirement, and regulatory disclosure.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Portfolio KPIs', body: 'Active PPAs, upcoming take-or-pay obligations, REC retirement status, and curtailment claims in flight.', placement: 'bottom' },
    { target: 'tab-nav', title: 'Procurement lifecycle tabs', body: 'From PPA contracting to tariff indexation, take-or-pay monitoring, and Scope 2 disclosure — all in one workstation.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start', body: 'Guided wizards for executing a PPA, retiring RECs, or lodging a curtailment claim — with AI hints at each step.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'Browse all offtaker actions across your procurement, compliance, and sustainability obligations.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'Generator invoices, tariff indexation notices, and payment security expiry alerts require action here.', placement: 'left' },
  ],
};

export function OfftakerWorkstationPage() {
  const kpis = useWorkstationKpis('offtaker');
  const sitesPanel = useWorkstationPanel('Delivery points', '/offtaker-suite/sites', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[oklch(0.94_0.02_250)] text-[oklch(0.46_0.16_55)]">{r.tariff_type || r.tariff || 'tariff'}</span>,
    text: <span>{r.name || r.site_name} · {r.suburb || r.city || ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.monthly_kwh ? `${Math.round(r.monthly_kwh).toLocaleString()} kWh/m` : ''}</span>,
  }), 'No delivery points yet.');
  const rfpPanel = useWorkstationPanel('Active RFPs', '/offtaker-suite/rfps', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[#fff4d6] text-[#a06200]">{r.status || 'open'}</span>,
    text: <span>{r.title || r.rfp_title} · {r.target_volume_gwh ? `${r.target_volume_gwh} GWh` : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.closing_date ? new Date(r.closing_date).toLocaleDateString('en-ZA') : ''}</span>,
  }), 'No active RFPs.');
  const panels = [sitesPanel, rfpPanel].filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <WorkstationShell
      role="offtaker"
      eyebrow="Offtaker · Workstation"
      title="Offtaker workstation"
      subtitle="Delivery points · Tariffs · Budgets · RECs · Scope 2. Day-to-day energy ops for a corporate consumer."
      backHref="/offtaker-suite"
      backLabel="Offtaker suite"
      kpis={kpis}
      panels={panels}
      tour={OFFTAKER_TOUR}
      tabs={[
        { key: 'change_in_law', label: 'PPA change-in-law', group: 'Contracts', chainKey: 'ppa_change_in_law', body: () => <PpaChangeInLawChainTab /> },
        { key: 'ppa_nomination', label: 'PPA nominations', group: 'Contracts', chainKey: 'ppa_nomination', body: () => <PpaNominationChainTab /> },
        { key: 'ppa_annual_recon', label: 'PPA annual reconciliation', group: 'Contracts', chainKey: 'ppa_annual_recon', body: () => <PpaAnnualReconChainTab /> },
        { key: 'wheeling_access', label: 'Wheeling access (W219)', group: 'Contracts', chainKey: 'wheeling_access', body: ({ onRefresh }) => <WheelingAccessTab onRefresh={onRefresh} /> },
        { key: 'virtual_ppa_settlement', label: 'Virtual PPA / CfD (W229)', group: 'Contracts', chainKey: 'virtual_ppa_settlement', body: ({ onRefresh }) => <VirtualPpaSettlementTab onRefresh={onRefresh} /> },
        { key: 'wheeling_charges', label: 'Wheeling charges', group: 'Contracts', body: () => <WheelingChargesTab scope="offtaker" /> },
        { key: 'sites', label: 'Sites & groups', group: 'Operations', body: ({ onRefresh }) => <SitesTab onRefresh={onRefresh} /> },
        { key: 'tariffs', label: 'Tariffs', group: 'Operations', body: () => <TariffsTab /> },
        { key: 'budgets', label: 'Budget vs actual', group: 'Operations', body: ({ onRefresh }) => <BudgetsTab onRefresh={onRefresh} /> },
        { key: 'bills', label: 'Bill upload & AI', group: 'Operations', body: ({ onRefresh }) => <BillUploadTab onRefresh={onRefresh} /> },
        { key: 'unserved_energy_claims', label: 'USE Claims', group: 'Operations', chainKey: 'unserved_energy_claim', body: () => <OfftakerUseClaimTab /> },
        { key: 'obligations', label: 'Obligations register', group: 'Security', body: () => <ObligationsTab /> },
        { key: 'slb_kpi', label: 'SLB KPI ratchet (W204)', group: 'Contracts', chainKey: 'slb_kpi_ratchet', body: ({ onRefresh }) => <SlbKpiTab onRefresh={onRefresh} /> },
        { key: 'green_tariff', label: 'Green tariff disclosure (W210)', group: 'Compliance', chainKey: 'green_tariff_disclosure', body: ({ onRefresh }) => <GreenTariffTab onRefresh={onRefresh} /> },
        { key: 'recs', label: 'RECs portfolio', group: 'Compliance', body: ({ onRefresh }) => <RecsTab onRefresh={onRefresh} /> },
        { key: 'scope2', label: 'Scope 2', group: 'Compliance', body: ({ onRefresh }) => <Scope2Tab onRefresh={onRefresh} /> },
        { key: 'strate-swift-connectors', label: 'Settlement rails', group: 'Compliance', body: () => <StrateSwiftConnectorTab /> },
        { key: 'sap-oracle-erp-connectors', label: 'ERP connectors', group: 'Compliance', body: () => <SapOracleErpConnectorTab /> },
        { key: 'government-filing-connectors', label: 'Filing connectors', group: 'Compliance', body: () => <GovernmentFilingConnectorTab /> },
        { key: 'reports', label: 'Reports & Exports', group: 'Reporting',
          body: () => (
            <div className="space-y-8">
              {OFFTAKER_REPORTS.map(cfg => (
                <div key={cfg.endpoint} className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cfg.title}</p>
                  <ReportPanel config={cfg} />
                </div>
              ))}
            </div>
          ),
        },
        { key: 'audit', label: 'Audit & compliance', group: 'Compliance',
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
        <button type="button" onClick={() => setCreating(true)} className="h-9 px-3 rounded-md bg-[oklch(0.46_0.16_55)] text-white text-[12px] font-semibold">
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
        <button type="button" onClick={() => setCreating(true)} className="h-9 px-3 rounded-md bg-[oklch(0.46_0.16_55)] text-white text-[12px] font-semibold">
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
        <button type="button" onClick={() => setTransferring(true)} className="h-9 px-3 rounded-md bg-white border border-[#dde4ec] text-[12px] font-semibold">Transfer certificate</button>
        <button type="button" onClick={() => setRetiring(true)} className="h-9 px-3 rounded-md bg-[oklch(0.46_0.16_55)] text-white text-[12px] font-semibold">Retire certificate</button>
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
            { key: 'to_participant_id', label: 'New owner participant', required: true, type: 'lookup', lookupEndpoint: '/api/lookup/participants' },
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
        <button type="button" onClick={() => setFiling(true)} className="h-9 px-3 rounded-md bg-[oklch(0.46_0.16_55)] text-white text-[12px] font-semibold">
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

// ──────────────────────────────────────────────────────────────────────────
// Bill upload & AI analytics tab
//   - Paste raw bill text (or upload a .txt/.csv extract)
//   - POST /ai/offtaker/bills → server-side AI extracts profile
//   - Then POST /ai/offtaker/optimize → AI recommends a PPA mix
//   - Last 20 bills + their parsed profile shown in a history table
// ──────────────────────────────────────────────────────────────────────────
type BillProfile = {
  annual_kwh?: number;
  peak_pct?: number;
  standard_pct?: number;
  offpeak_pct?: number;
  avg_tariff_zar_per_kwh?: number;
  demand_charge_zar_per_kva?: number;
  tou_risk?: 'low' | 'medium' | 'high' | string;
};

type BillRow = {
  id: string;
  source: string | null;
  created_at: string;
  meta: { site?: string; period?: string } & Record<string, unknown>;
  profile: BillProfile;
};

type MixItem = {
  project_id: string;
  project_name: string;
  share_pct: number;
  mwh_per_year: number;
  blended_price: number;
  rationale?: string;
};

function OptionGroup({
  title, options, actionLabel, onAct, busyId,
}: {
  title: string;
  options: OfftakerOption[];
  actionLabel: string;
  onAct: (opt: OfftakerOption) => void;
  busyId: string | null;
}) {
  return (
    <div>
      <div className="text-[12px] font-semibold text-[#6b7685] mb-2">{title}</div>
      <div className="rounded-xl border border-[#dde4ec] bg-white overflow-x-auto text-[#0f1c2e]">
        <table className="w-full text-[12px]">
          <thead className="bg-[#f4f6f8] text-[#6b7685]">
            <tr>
              <th className="text-left p-2">Option</th>
              <th className="text-right p-2">MWh / yr</th>
              <th className="text-right p-2">R/MWh</th>
              <th className="text-right p-2">Est. saving / yr</th>
              <th className="text-right p-2">CO₂ avoided</th>
              <th className="text-left p-2">When</th>
              <th className="text-right p-2" aria-label="action" />
            </tr>
          </thead>
          <tbody>
            {options.map((o) => (
              <tr key={o.option_id} className="border-t border-[#eef1f5]">
                <td className="p-2 font-semibold">{o.title}</td>
                <td className="p-2 text-right">{Number(o.annual_mwh || 0).toLocaleString()}</td>
                <td className="p-2 text-right">
                  {o.blended_price_zar_per_mwh == null
                    ? <span className="text-[#6b7685]">Contact seller</span>
                    : `${o.price_basis === 'indicative' ? '~R ' : 'R '}${Number(o.blended_price_zar_per_mwh).toLocaleString()}`}
                </td>
                <td className="p-2 text-right">
                  {o.est_saving_zar == null
                    ? <span className="text-[#6b7685]">—</span>
                    : `R ${Number(o.est_saving_zar).toLocaleString()} (${Number(o.est_saving_pct ?? 0)}%)`}
                </td>
                <td className="p-2 text-right">{Number(o.co2_avoided_tco2e || 0).toLocaleString()} t</td>
                <td className="p-2">{o.availability === 'now' ? 'Now' : (o.cod_estimate || 'Upcoming')}</td>
                <td className="p-2 text-right">
                  <button type="button"
                    onClick={() => onAct(o)}
                    disabled={busyId !== null}
                    className="h-8 px-3 rounded-md bg-[oklch(0.46_0.16_55)] text-white text-[11px] font-semibold disabled:opacity-60"
                  >
                    {busyId === o.option_id ? '…' : actionLabel}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type MixResult = {
  mix: MixItem[];
  savings_pct?: number;
  carbon_tco2e?: number;
  warnings?: string[];
};

type OfftakerOption = {
  option_id: string;
  kind: 'project' | 'listing';
  title: string;
  target_participant_id: string;
  availability: 'now' | 'upcoming';
  cod_estimate: string | null;
  annual_mwh: number;
  price_basis: 'listed' | 'indicative' | 'contact_seller';
  // null ⇒ withheld (contact_seller); cost/saving null in lockstep.
  blended_price_zar_per_mwh: number | null;
  est_annual_cost_zar: number | null;
  est_saving_zar: number | null;
  est_saving_pct: number | null;
  co2_avoided_tco2e: number;
  rationale: string;
};

type OfftakerOptions = {
  available_now: OfftakerOption[];
  upcoming_projects: OfftakerOption[];
};

function BillUploadTab({ onRefresh }: { onRefresh: () => void }) {
  const [bills, setBills] = useState<BillRow[]>([]);
  const [siteName, setSiteName] = useState<string>('Sandton head office');
  const [period, setPeriod] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [content, setContent] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [latest, setLatest] = useState<{ id: string; profile: BillProfile } | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [mix, setMix] = useState<MixResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [options, setOptions] = useState<OfftakerOptions | null>(null);
  const [loiBusy, setLoiBusy] = useState<string | null>(null); // option_id, or '__mix__' for the whole-mix draft
  const [loiMsg, setLoiMsg] = useState<string | null>(null);

  const loadBills = useCallback(async () => {
    try {
      const r = await api.get('/ai/offtaker/bills');
      const rows = (r.data?.data || []) as BillRow[];
      setBills(rows);
      if (!latest && rows.length > 0) {
        setLatest({ id: rows[0].id, profile: rows[0].profile });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to load bills');
    }
  }, [latest]);

  useEffect(() => { loadBills(); }, [loadBills]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setContent(text);
  };

  const upload = async () => {
    setUploading(true);
    setErr(null);
    try {
      const body = {
        source: 'text',
        content: content || sampleBillText(siteName, period),
        meta: { site: siteName, period },
      };
      const r = await api.post('/ai/offtaker/bills', body);
      const data = r.data?.data || {};
      setLatest({ id: data.bill_id, profile: (data.structured || {}) as BillProfile });
      setMix(null);
      setOptions(null);
      setLoiMsg(null);
      await loadBills();
      onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'upload failed');
    } finally {
      setUploading(false);
    }
  };

  const loadOptions = useCallback(async (billId: string) => {
    try {
      const r = await api.get('/offtaker/options', { params: { bill_id: billId } });
      setOptions((r.data?.data || { available_now: [], upcoming_projects: [] }) as OfftakerOptions);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to load options');
    }
  }, []);

  const optimize = async () => {
    if (!latest) return;
    setOptimizing(true);
    setErr(null);
    try {
      const r = await api.post('/ai/offtaker/optimize', {
        bill_id: latest.id,
        horizon_years: 15,
      });
      const structured = (r.data?.data?.structured || {}) as MixResult;
      setMix(structured);
      await loadOptions(latest.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'optimize failed');
    } finally {
      setOptimizing(false);
    }
  };

  const draftFromMix = async () => {
    if (!mix?.mix?.length) return;
    setLoiBusy('__mix__');
    setLoiMsg(null);
    setErr(null);
    try {
      const r = await api.post('/ai/offtaker/loi', { mix: mix.mix, horizon_years: 15 });
      const n = ((r.data?.data?.drafts as unknown[]) || []).length;
      setLoiMsg(`${n} Letter${n === 1 ? '' : 's'} of Intent drafted — each developer has been notified. Open "Letters of Intent" to send.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to draft LOIs');
    } finally {
      setLoiBusy(null);
    }
  };

  const draftOne = async (opt: OfftakerOption) => {
    setLoiBusy(opt.option_id);
    setLoiMsg(null);
    setErr(null);
    try {
      const r = await api.post('/ai/offtaker/loi', {
        mix: [{ project_id: opt.option_id, share_pct: 100, mwh_per_year: opt.annual_mwh, blended_price: opt.blended_price_zar_per_mwh ?? null }],
        horizon_years: 15,
      });
      const n = ((r.data?.data?.drafts as unknown[]) || []).length;
      setLoiMsg(n > 0
        ? `LOI drafted for ${opt.title} — the developer has been notified.`
        : `No LOI drafted for ${opt.title} (the developer may be in another tenant).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to draft LOI');
    } finally {
      setLoiBusy(null);
    }
  };

  const inquire = async (opt: OfftakerOption) => {
    setLoiBusy(opt.option_id);
    setLoiMsg(null);
    setErr(null);
    try {
      await api.post(`/marketplace/listings/${opt.option_id}/inquire`, {
        message: `Interested in ${opt.title} — approx ${opt.annual_mwh.toLocaleString()} MWh/yr.`,
      });
      setLoiMsg(`Inquiry sent for ${opt.title} — the seller has been notified.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to send inquiry');
    } finally {
      setLoiBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {err && <div className="text-[12px] text-red-700">{err}</div>}

      {/* AI assist banner — "why" + 1-click */}
      <div className="rounded-xl border border-[#cfe0d6] bg-[#f4faf6] p-4 flex items-start gap-3">
        <div className="h-8 w-8 rounded-md bg-[oklch(0.46_0.16_55)] text-white text-[12px] font-semibold flex items-center justify-center">AI</div>
        <div className="flex-1 text-[13px] text-[#0f1c2e]">
          <div className="font-semibold mb-1">Bill analyser</div>
          <div className="text-[#3d4756]">
            Paste an Eskom or municipal utility bill below. The platform extracts your annual consumption,
            TOU split, demand charges and tariff exposure — then recommends a fixed-price PPA mix
            from operating + under-construction projects. Why this matters: every 1% improvement in
            blended tariff translates to ZAR 24k/yr per GWh of consumption.
          </div>
        </div>
      </div>

      {/* Upload form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block text-[13px]">
          <span className="text-[#6b7685]">Site</span>
          <input value={siteName} onChange={(e) => setSiteName(e.target.value)} className="mt-1 h-9 w-full px-3 border border-[#dde4ec] rounded-md text-[13px] bg-white" />
        </label>
        <label className="block text-[13px]">
          <span className="text-[#6b7685]">Billing period (YYYY-MM)</span>
          <input value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1 h-9 w-full px-3 border border-[#dde4ec] rounded-md text-[13px] bg-white" />
        </label>
        <label className="block text-[13px]">
          <span className="text-[#6b7685]">Upload .txt / .csv extract</span>
          <input type="file" accept=".txt,.csv,.json,text/plain,text/csv" onChange={handleFileChange} className="mt-1 h-9 w-full text-[12px]" />
        </label>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={`Paste extracted bill text here, e.g.:\n\nESKOM MEGAFLEX — period ${period}\nDemand charge       2,500 kVA   R 535,500\nEnergy (peak)     180,000 kWh   R 1,140,300\nEnergy (standard) 540,000 kWh   R 1,118,400\nEnergy (off-peak) 280,000 kWh   R   316,400\nTotal energy    1,000,000 kWh\n\nOr leave blank to use the sample profile for ${siteName}.`}
        className="w-full h-32 px-3 py-2 border border-[#dde4ec] rounded-md text-[12px] font-mono bg-white text-[#0f1c2e]"
      />
      <div className="flex justify-end gap-2">
        <button type="button"
          onClick={upload}
          disabled={uploading}
          className="h-9 px-4 rounded-md bg-[oklch(0.46_0.16_55)] text-white text-[12px] font-semibold disabled:opacity-60"
        >
          {uploading ? 'Analysing…' : 'Analyse bill'}
        </button>
        <button type="button"
          onClick={optimize}
          disabled={!latest || optimizing}
          className="h-9 px-4 rounded-md bg-[#0f7553] text-white text-[12px] font-semibold disabled:opacity-60"
        >
          {optimizing ? 'Optimising…' : 'Optimise PPA mix'}
        </button>
      </div>

      {/* Latest profile */}
      {latest && (
        <div>
          <h3 className="text-[13px] font-semibold text-[#3d4756] mb-2">Latest analysed profile</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Annual kWh" value={latest.profile.annual_kwh} unit="kWh" />
            <Card label="Avg tariff" value={latest.profile.avg_tariff_zar_per_kwh} unit="R/kWh" />
            <Card label="Demand charge" value={latest.profile.demand_charge_zar_per_kva} unit="R/kVA" />
            <RiskCard risk={latest.profile.tou_risk} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <BarRow label="Peak"     value={pct(latest.profile.peak_pct)} tone="bad" />
            <BarRow label="Standard" value={pct(latest.profile.standard_pct)} tone="warn" />
            <BarRow label="Off-peak" value={pct(latest.profile.offpeak_pct)} tone="good" />
          </div>
        </div>
      )}

      {/* AI mix recommendation */}
      {mix && mix.mix && mix.mix.length > 0 && (
        <div>
          <h3 className="text-[13px] font-semibold text-[#3d4756] mb-2">Recommended PPA mix · 15 yr horizon</h3>
          <div className="rounded-xl border border-[#dde4ec] bg-white overflow-x-auto text-[#0f1c2e]">
            <table className="w-full text-[12px]">
              <thead className="bg-[#f4f6f8] text-[#6b7685]">
                <tr>
                  <th className="text-left p-2">Project</th>
                  <th className="text-right p-2">Share</th>
                  <th className="text-right p-2">MWh / yr</th>
                  <th className="text-right p-2">Blended R/MWh</th>
                  <th className="text-left p-2">Rationale</th>
                </tr>
              </thead>
              <tbody>
                {mix.mix.map((m, idx) => (
                  <tr key={idx} className="border-t border-[#eef1f5]">
                    <td className="p-2 font-semibold">{m.project_name}</td>
                    <td className="p-2 text-right">{Number(m.share_pct || 0).toFixed(1)}%</td>
                    <td className="p-2 text-right">{Number(m.mwh_per_year || 0).toLocaleString()}</td>
                    <td className="p-2 text-right">R {Number(m.blended_price || 0).toLocaleString()}</td>
                    <td className="p-2 text-[#3d4756]">{m.rationale || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            <Card label="Estimated savings" value={mix.savings_pct} unit="%" />
            <Card label="Annual CO₂ avoided" value={mix.carbon_tco2e} unit="tCO₂e" />
            <div className="rounded-xl border border-[#dde4ec] bg-white p-4 flex flex-col justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Next step</div>
                <div className="text-[13px] mt-1 text-[#0f1c2e]">Draft an LOI to every developer in this mix. Each one lands in the developer's action queue.</div>
              </div>
              <button type="button"
                onClick={draftFromMix}
                disabled={loiBusy !== null}
                className="mt-3 h-9 px-4 rounded-md bg-[oklch(0.46_0.16_55)] text-white text-[12px] font-semibold disabled:opacity-60"
              >
                {loiBusy === '__mix__' ? 'Drafting…' : 'Draft LOIs from this mix'}
              </button>
            </div>
          </div>
          {loiMsg && <div className="mt-2 text-[12px] text-[#0f7553]">{loiMsg}</div>}
          {mix.warnings && mix.warnings.length > 0 && (
            <ul className="mt-2 text-[12px] text-[#a16207] list-disc pl-5">
              {mix.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Procurement options — available now + upcoming, each scored vs the bill */}
      {options && (options.available_now.length > 0 || options.upcoming_projects.length > 0) && (
        <div className="space-y-4">
          <h3 className="text-[13px] font-semibold text-[#3d4756]">Procurement options matched to this bill</h3>
          {loiMsg && <div className="text-[12px] text-[#0f7553]">{loiMsg}</div>}
          {options.available_now.length > 0 && (
            <OptionGroup title="Available now · marketplace" options={options.available_now} actionLabel="Send inquiry" onAct={inquire} busyId={loiBusy} />
          )}
          {options.upcoming_projects.length > 0 && (
            <OptionGroup title="Upcoming projects" options={options.upcoming_projects} actionLabel="Draft LOI" onAct={draftOne} busyId={loiBusy} />
          )}
        </div>
      )}

      {/* History */}
      <div>
        <h3 className="text-[13px] font-semibold text-[#3d4756] mb-2">Recent analyses</h3>
        {bills.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#dde4ec] p-6 text-center text-[12px] text-[#6b7685]">
            No bills analysed yet — paste one above to start.
          </div>
        ) : (
          <div className="rounded-xl border border-[#dde4ec] bg-white overflow-x-auto text-[#0f1c2e]">
            <table className="w-full text-[12px]">
              <thead className="bg-[#f4f6f8] text-[#6b7685]">
                <tr>
                  <th className="text-left p-2">Uploaded</th>
                  <th className="text-left p-2">Site</th>
                  <th className="text-left p-2">Period</th>
                  <th className="text-right p-2">Annual kWh</th>
                  <th className="text-right p-2">R/kWh</th>
                  <th className="text-left p-2">TOU risk</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr
                    key={b.id}
                    className="border-t border-[#eef1f5] hover:bg-[#f9fbfd] cursor-pointer"
                    onClick={() => setLatest({ id: b.id, profile: b.profile })}
                  >
                    <td className="p-2">{new Date(b.created_at).toLocaleDateString()}</td>
                    <td className="p-2">{b.meta?.site || '—'}</td>
                    <td className="p-2">{b.meta?.period || '—'}</td>
                    <td className="p-2 text-right">{b.profile?.annual_kwh ? Number(b.profile.annual_kwh).toLocaleString() : '—'}</td>
                    <td className="p-2 text-right">{b.profile?.avg_tariff_zar_per_kwh ? Number(b.profile.avg_tariff_zar_per_kwh).toFixed(2) : '—'}</td>
                    <td className="p-2"><Pill tone={touTone(b.profile?.tou_risk)}>{b.profile?.tou_risk || 'unknown'}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function pct(v: number | undefined): number {
  if (v == null) return 0;
  return v > 1 ? v : v * 100;
}

function touTone(risk: string | undefined): 'good' | 'warn' | 'bad' | 'neutral' {
  if (!risk) return 'neutral';
  const r = String(risk).toLowerCase();
  if (r === 'high') return 'bad';
  if (r === 'medium') return 'warn';
  if (r === 'low') return 'good';
  return 'neutral';
}

function RiskCard({ risk }: { risk: string | undefined }) {
  const tone = touTone(risk);
  const bg = tone === 'bad' ? '#fdecea' : tone === 'warn' ? '#fef6e7' : tone === 'good' ? '#eaf6ee' : '#f4f6f8';
  const fg = tone === 'bad' ? '#a4161a' : tone === 'warn' ? '#7a5b00' : tone === 'good' ? '#0f7553' : '#0f1c2e';
  return (
    <div className="rounded-xl border border-[#dde4ec] p-4" style={{ background: bg }}>
      <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">TOU exposure</div>
      <div className="text-[20px] font-semibold mt-1" style={{ color: fg }}>{(risk || 'unknown').toUpperCase()}</div>
    </div>
  );
}

function BarRow({ label, value, tone }: { label: string; value: number; tone: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#a4161a' : tone === 'warn' ? '#c08a00' : '#0f7553';
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white p-3">
      <div className="flex justify-between items-baseline">
        <span className="text-[11px] uppercase tracking-wider text-[#6b7685]">{label}</span>
        <span className="text-[13px] font-semibold text-[#0f1c2e]">{value.toFixed(1)}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-[#eef1f5] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: color }} />
      </div>
    </div>
  );
}

function sampleBillText(site: string, period: string): string {
  return `ESKOM MEGAFLEX — ${site} — period ${period}
Notified maximum demand      2,500 kVA   R 535,500.00
Demand charge                              R 535,500.00
Energy charge (peak)          180,000 kWh  R 1,140,300.00
Energy charge (standard)      540,000 kWh  R 1,118,400.00
Energy charge (off-peak)      280,000 kWh  R   316,400.00
Total energy                1,000,000 kWh  R 2,575,100.00
Network access charge                       R   125,000.00
Service & administration                    R    18,500.00
Environmental levy            1,000,000 kWh R   3,500.00
Affordability subsidy charge  1,000,000 kWh R     950.00
Total billed (excl VAT)                     R 3,258,550.00`;
}

// ─── W204: SLB KPI & Sustainability-Linked PPA Ratchet ───────────────────────
type SlbModalMode = 'create' | { type: 'action'; id: string; currentStatus: string } | null;

function SlbKpiTab({ onRefresh }: { onRefresh?: () => void }) {
  const [modal, setModal] = useState<SlbModalMode>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  const statusTone = (s: string) => {
    if (['ratchet_applied', 'ratchet_waived'].includes(s)) return 'good' as const;
    if (['kpi_missed', 'withdrawn'].includes(s)) return 'bad' as const;
    if (['ratchet_disputed', 'arbitration'].includes(s)) return 'warn' as const;
    return 'neutral' as const;
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button type="button"
          className="px-3 py-1.5 rounded bg-[oklch(0.46_0.16_55)] text-white text-sm font-medium hover:bg-[#1f4a78]"
          onClick={() => setModal('create')}
        >
          + New KPI period
        </button>
      </div>

      <ListingTable
        key={refreshKey}
        endpoint="/slb-kpi-ratchets"
        rowKey={(r) => r.id}
        empty={{ title: 'No SLB KPI periods', description: 'Track sustainability-linked PPA KPI measurements and ratchet calculations.' }}
        columns={[
          { key: 'kpi_period', label: 'Period', render: (r) => r.kpi_period },
          { key: 'slb_tier', label: 'Tier', render: (r) => <Pill tone="info">{String(r.slb_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'kpi_name', label: 'KPI', render: (r) => r.kpi_name || '—' },
          { key: 'kpi_target_value', label: 'Target', align: 'right', render: (r) => r.kpi_target_value != null ? `${r.kpi_target_value} ${r.kpi_unit || ''}` : '—' },
          { key: 'kpi_actual_value', label: 'Actual', align: 'right', render: (r) => r.kpi_actual_value != null ? `${r.kpi_actual_value} ${r.kpi_unit || ''}` : '—' },
          { key: 'ratchet_basis_points', label: 'Ratchet (bps)', align: 'right', render: (r) => r.ratchet_basis_points != null ? `${r.ratchet_basis_points}bps` : '—' },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={statusTone(r.chain_status)}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">On track</Pill> },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="New SLB KPI period"
          submitLabel="Create"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/slb-kpi-ratchets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                slb_tier: v.slb_tier,
                kpi_period: v.kpi_period,
                period_start: v.period_start,
                period_end: v.period_end,
                kpi_name: v.kpi_name || undefined,
                kpi_target_value: v.kpi_target_value ? parseFloat(v.kpi_target_value) : undefined,
                kpi_unit: v.kpi_unit || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            { key: 'kpi_period', label: 'KPI period (e.g. 2026-Q2)', required: true, placeholder: '2026-Q2' },
            { key: 'period_start', label: 'Period start', type: 'date', required: true },
            { key: 'period_end', label: 'Period end', type: 'date', required: true },
            {
              key: 'slb_tier', label: 'SLB tier', type: 'select', required: true, defaultValue: 'green_finance',
              options: [
                { value: 'voluntary', label: 'Voluntary (30d SLA)' },
                { value: 'green_finance', label: 'Green finance (45d SLA)' },
                { value: 'listed', label: 'Listed / JSE (60d SLA)' },
                { value: 'regulatory', label: 'Regulatory (90d SLA)' },
              ],
            },
            { key: 'kpi_name', label: 'KPI name', required: false, placeholder: 'RE percentage' },
            { key: 'kpi_target_value', label: 'KPI target value', type: 'number', required: false },
            { key: 'kpi_unit', label: 'KPI unit', required: false, placeholder: '%' },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title={`Advance SLB KPI — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit action"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/slb-kpi-ratchets/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                reason: v.reason || undefined,
                kpi_actual_value: v.kpi_actual_value ? parseFloat(v.kpi_actual_value) : undefined,
                kpi_data_source: v.kpi_data_source || undefined,
                ratchet_basis_points: v.ratchet_basis_points ? parseFloat(v.ratchet_basis_points) : undefined,
                ratchet_direction: v.ratchet_direction || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            {
              key: 'action', label: 'Action', type: 'select', required: true,
              options: [
                { value: 'start_measurement', label: 'Start KPI measurement' },
                { value: 'submit_kpi_data', label: 'Submit KPI data' },
                { value: 'request_verification', label: 'Request independent verification' },
                { value: 'certify_kpi', label: 'Certify KPI (verifier sign-off)' },
                { value: 'calculate_ratchet', label: 'Calculate ratchet' },
                { value: 'agree_ratchet', label: 'Agree ratchet amount' },
                { value: 'raise_dispute', label: 'Raise dispute on ratchet' },
                { value: 'refer_to_arbitration', label: 'Refer to arbitration' },
                { value: 'resolve_arbitration', label: 'Resolve arbitration' },
                { value: 'apply_ratchet', label: 'Apply ratchet to PPA' },
                { value: 'waive_ratchet', label: 'Waive ratchet (mutual)' },
                { value: 'record_kpi_miss', label: 'Record KPI miss (step-up applies)' },
                { value: 'withdraw', label: 'Withdraw' },
              ],
            },
            { key: 'kpi_actual_value', label: 'KPI actual value', type: 'number', required: false },
            { key: 'kpi_data_source', label: 'Data source', type: 'select', required: false, options: [
              { value: 'solax_api', label: 'Solax API' },
              { value: 'metering', label: 'Metering' },
              { value: 'manual', label: 'Manual' },
            ] },
            { key: 'ratchet_basis_points', label: 'Ratchet (basis points)', type: 'number', required: false },
            { key: 'ratchet_direction', label: 'Ratchet direction', type: 'select', required: false, options: [
              { value: 'step_down', label: 'Step down (KPI met)' },
              { value: 'step_up', label: 'Step up (KPI missed)' },
              { value: 'neutral', label: 'Neutral' },
            ] },
            { key: 'reason', label: 'Notes / reason', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  );
}

// ─── W210: Green Tariff Disclosure Tab ────────────────────────────────────────
const GT_CLASS_TONE: Record<string, 'bad' | 'warn' | 'neutral' | 'info'> = {
  sbti_aligned: 'bad', corporate_ppa: 'warn', utility_green_tariff: 'info', voluntary: 'neutral',
};

function GreenTariffTab({ onRefresh }: { onRefresh?: () => void }) {
  const [modal, setModal] = useState<null | { type: 'create' } | { type: 'action'; id: string; currentStatus: string; cls: string; period: string }>(null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setModal({ type: 'create' })} className="h-9 px-3 rounded-md bg-[oklch(0.46_0.16_55)] text-white text-[12px] font-semibold">
          + New disclosure
        </button>
      </div>

      <ListingTable
        endpoint="/green-tariff-disclosures"
        rowKey={(r) => r.id}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status, cls: r.green_tariff_class, period: r.disclosure_period })}
        empty={{ title: 'No green tariff disclosures', description: 'GHG Protocol Scope 2 / CDP / SBTi green tariff disclosures will appear here.' }}
        columns={[
          { key: 'disclosure_period', label: 'Period', render: (r) => <span className="font-semibold text-[12px]">{r.disclosure_period as string}</span> },
          { key: 'green_tariff_class', label: 'Class', render: (r) => <Pill tone={GT_CLASS_TONE[r.green_tariff_class as string] ?? 'neutral'}>{String(r.green_tariff_class).replace(/_/g, ' ')}</Pill> },
          { key: 'match_percentage', label: 'Match %', render: (r) => r.match_percentage != null ? <span className={`font-semibold ${Number(r.match_percentage) >= 100 ? 'text-green-700' : Number(r.match_percentage) >= 75 ? 'text-amber-600' : 'text-red-600'}`}>{Number(r.match_percentage).toFixed(1)}%</span> : <span className="text-[#8fa3bd]">—</span> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['disclosed'].includes(r.chain_status as string) ? 'good' : ['rejected', 'withdrawn'].includes(r.chain_status as string) ? 'bad' : 'warn'}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'created_at', label: 'Created', render: (r) => new Date(r.created_at as string).toLocaleDateString() },
        ]}
      />

      {modal?.type === 'create' && (
        <ActionModal
          title="New green tariff disclosure"
          submitLabel="Create"
          fields={[
            { key: 'disclosure_period', label: 'Disclosure period (e.g. 2025, 2025-Q4)', required: true },
            { key: 'green_tariff_class', label: 'Class', type: 'select', required: true, options: [
              { value: 'voluntary', label: 'Voluntary (14d SLA)' },
              { value: 'utility_green_tariff', label: 'Utility green tariff (21d SLA)' },
              { value: 'corporate_ppa', label: 'Corporate PPA (30d SLA)' },
              { value: 'sbti_aligned', label: 'SBTi-aligned (45d SLA)' },
            ]} as FieldSpec,
            { key: 'ppa_ref', label: 'PPA reference (optional)' },
            { key: 'consumption_mwh', label: 'Total consumption (MWh)', type: 'number' },
            { key: 'contracted_green_mwh', label: 'Contracted green MWh', type: 'number' },
            { key: 'generation_technology', label: 'Generation technology', type: 'select', options: [
              { value: 'solar_pv', label: 'Solar PV' },
              { value: 'wind_onshore', label: 'Wind (onshore)' },
              { value: 'wind_offshore', label: 'Wind (offshore)' },
              { value: 'hydro', label: 'Hydro' },
              { value: 'biomass', label: 'Biomass' },
              { value: 'gas', label: 'Gas' },
              { value: 'coal', label: 'Coal' },
              { value: 'battery', label: 'Battery' },
            ] },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/green-tariff-disclosures', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({ ...v, consumption_mwh: v.consumption_mwh ? Number(v.consumption_mwh) : undefined, contracted_green_mwh: v.contracted_green_mwh ? Number(v.contracted_green_mwh) : undefined }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); onRefresh?.();
          }}
        />
      )}

      {modal?.type === 'action' && (
        <ActionModal
          title={`Green tariff — ${modal.cls} — ${modal.period}`}
          submitLabel="Submit action"
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: [
              { value: 'start_eligibility', label: 'Start eligibility check' },
              { value: 'begin_attribute_matching', label: 'Begin attribute matching' },
              { value: 'submit_for_review', label: 'Submit for independent review' },
              { value: 'approve_review', label: 'Approve review' },
              { value: 'issue_label', label: 'Issue green label' },
              { value: 'submit_to_cdp', label: 'Submit to CDP/SBTi' },
              { value: 'complete_disclosure', label: 'Complete disclosure' },
              { value: 'reject', label: 'Reject' },
              { value: 'withdraw', label: 'Withdraw' },
            ]} as FieldSpec,
            { key: 'matched_rec_mwh', label: 'Matched REC MWh', type: 'number' },
            { key: 'match_percentage', label: 'Match percentage', type: 'number' },
            { key: 'rec_serial_from', label: 'REC serial (from)' },
            { key: 'rec_serial_to', label: 'REC serial (to)' },
            { key: 'irec_registry', label: 'I-REC registry', type: 'select', options: [
              { value: 'i_rec', label: 'I-REC' },
              { value: 'sarec', label: 'SAREC' },
              { value: 'eu_go', label: 'EU-GO' },
              { value: 'tigr', label: 'TIGR' },
            ] },
            { key: 'reviewer_name', label: 'Reviewer name' },
            { key: 'label_certificate_number', label: 'Label certificate number' },
            { key: 'cdp_submission_ref', label: 'CDP submission reference' },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/green-tariff-disclosures/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({ ...v, matched_rec_mwh: v.matched_rec_mwh ? Number(v.matched_rec_mwh) : undefined, match_percentage: v.match_percentage ? Number(v.match_percentage) : undefined }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); onRefresh?.();
          }}
        />
      )}
    </div>
  );
}

// ── W219: Offtaker Wheeling Access Application ────────────────────────────────
const WHEEL_TIER_TONE: Record<string, string> = {
  small_embedded:      'bg-[oklch(0.97_0.003_250)] text-[oklch(0.46_0.16_55)]',
  medium_distributed:  'bg-purple-50 text-purple-700',
  large_industrial:    'bg-amber-50 text-amber-700',
  bulk_transmission:   'bg-rose-50 text-rose-700',
};

function wheelStatusTone(s: string): string {
  if (['active'].includes(s)) return 'bg-emerald-100 text-emerald-800';
  if (['terminated', 'expired'].includes(s)) return 'bg-red-100 text-red-800';
  if (['withdrawn'].includes(s)) return 'bg-gray-100 text-gray-600';
  if (['renewal_due'].includes(s)) return 'bg-orange-100 text-orange-800';
  if (['agreement_signed'].includes(s)) return 'bg-green-100 text-green-800';
  return 'bg-slate-100 text-slate-700';
}

type WheelModal = { id: string; wheel_tier: string; requested_capacity_mw?: number } | null;

// ─── W229 Virtual/Financial PPA CfD Settlement ──────────────────────────────

type VppaSettlementRow = {
  id: string;
  contract_ref: string;
  generator_id: string;
  offtaker_id: string;
  settlement_period: string;
  reference_index: string;
  notional_mwh: number;
  strike_price_zar_per_mwh: number;
  reference_price_zar_per_mwh: number | null;
  settlement_amount_zar: number | null;
  paying_party: 'generator' | 'offtaker' | null;
  settlement_tier: string | null;
  chain_status: string;
  sla_deadline: string | null;
  sla_breached: boolean | number;
  hours_until_sla: number | null;
  is_terminal: boolean;
  created_at: string;
};
type VppaStats = {
  total: number;
  settled: number;
  in_dispute: number;
  overdue: number;
  outstanding_zar: number;
};

// Mirror of SETTLEMENT_VALID_TRANSITIONS — kept inline so SPA doesn't import backend spec.
const VPPA_TRANSITIONS: Record<string, string[]> = {
  reference_price_pending: ['publish_reference_price', 'cancel'],
  calculated:              ['issue_statement', 'cancel'],
  statement_issued:        ['acknowledge', 'dispute', 'cancel'],
  payment_pending:         ['record_payment', 'record_partial_payment', 'dispute', 'mark_overdue'],
  disputed:                ['begin_recalculation', 'escalate_to_isda'],
  recalculating:           ['confirm_recalculation', 'escalate_to_isda'],
  isda_determination:      ['confirm_recalculation'],
  partially_settled:       ['record_payment', 'mark_overdue', 'write_off'],
  overdue:                 ['record_payment', 'record_partial_payment', 'write_off'],
  settled:                 [],
  written_off:             [],
  cancelled:               [],
};
const VPPA_ACTION_LABELS: Record<string, string> = {
  publish_reference_price: 'Publish ref. price',
  issue_statement:         'Issue statement',
  acknowledge:             'Acknowledge',
  dispute:                 'Dispute',
  begin_recalculation:     'Begin recalculation',
  escalate_to_isda:        'Escalate to ISDA',
  confirm_recalculation:   'Confirm recalculation',
  record_payment:          'Record payment',
  record_partial_payment:  'Partial payment',
  mark_overdue:            'Mark overdue',
  write_off:               'Write off',
  cancel:                  'Cancel',
};
const VPPA_DESTRUCTIVE = new Set(['write_off', 'cancel', 'escalate_to_isda']);

function vppaStatusTone(status: string): 'good' | 'bad' | 'warn' | 'info' | 'neutral' {
  if (status === 'settled') return 'good';
  if (['overdue', 'written_off', 'isda_determination'].includes(status)) return 'bad';
  if (['disputed', 'recalculating', 'partially_settled'].includes(status)) return 'warn';
  if (status === 'cancelled') return 'neutral';
  return 'info';
}
function vppaPaying(party: string | null): string {
  if (party === 'generator') return 'Gen pays';
  if (party === 'offtaker') return 'You pay';
  return '—';
}
function zarFmt(n: number | null | undefined): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n || 0);
}

function VirtualPpaSettlementTab({ onRefresh }: { onRefresh?: () => void }) {
  const [rows, setRows] = useState<VppaSettlementRow[]>([]);
  const [stats, setStats] = useState<VppaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [opening, setOpening] = useState(false);
  // For publish_reference_price action which needs a numeric input
  const [pubModal, setPubModal] = useState<{ id: string } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get('/offtaker/virtual-ppa-settlement?per_page=200');
      setRows((res.data?.data?.settlements as VppaSettlementRow[]) || []);
      setStats((res.data?.data?.stats as VppaStats) || null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const act = React.useCallback(async (id: string, action: string, extra?: Record<string, unknown>) => {
    setBusy(id);
    setRowErr((m) => { const n = { ...m }; delete n[id]; return n; });
    try {
      await api.post(`/offtaker/virtual-ppa-settlement/${id}/action`, { action, ...extra });
      await load();
      onRefresh?.();
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.error || (e instanceof Error ? e.message : 'action failed');
      setRowErr((m) => ({ ...m, [id]: msg }));
    } finally {
      setBusy(null);
    }
  }, [load, onRefresh]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[12px] leading-relaxed text-[#3d4756] max-w-2xl">
          Virtual / financial PPA settlement (CfD) — W229 chain. Each period, a reference price
          is published against a fixed strike; the differential determines who pays whom. Disputes
          escalate to ISDA Calculation Agent determination. SLA is INVERTED: larger differentials
          get the longest verification window before payment is due.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button"
            onClick={() => setOpening(true)}
            className="h-8 px-3 rounded-md bg-[oklch(0.46_0.16_55)] text-white text-[12px] font-semibold hover:bg-[#16324f]"
          >
            Open settlement period
          </button>
          <button type="button"
            onClick={() => void load()}
            className="h-8 px-3 rounded-md border border-[#dde4ec] bg-white text-[12px] font-medium text-[#3d4756] hover:bg-[#f8fafc]"
          >
            Refresh
          </button>
        </div>
      </div>

      {stats && (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[12px] text-[#3d4756]">
          <span><span className="text-[#6b7685]">Total</span> <span className="tabular-nums font-medium text-[#0f1c2e]">{stats.total}</span></span>
          <span><span className="text-[#6b7685]">Settled</span> <span className="tabular-nums font-medium text-[#2a7a4f]">{stats.settled}</span></span>
          <span><span className="text-[#6b7685]">In dispute</span> <span className="tabular-nums font-medium text-[#b4453a]">{stats.in_dispute}</span></span>
          <span><span className="text-[#6b7685]">Overdue</span> <span className="tabular-nums font-medium text-[#b4453a]">{stats.overdue}</span></span>
          <span><span className="text-[#6b7685]">Outstanding</span> <span className="tabular-nums font-medium text-[#0f1c2e]">{zarFmt(stats.outstanding_zar)}</span></span>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-[#dde4ec] bg-white p-6 text-[12px] text-[#6b7685]">Loading settlements…</div>
      ) : err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[12px] text-red-700">{err}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[#dde4ec] bg-[#f8fafc] p-6 text-center">
          <div className="text-[13px] font-semibold text-[#0f1c2e]">No settlement periods yet</div>
          <div className="text-[12px] text-[#6b7685] mt-1">Open a CfD settlement period to start the W229 reconciliation chain.</div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#dde4ec] bg-white overflow-x-auto text-[#0f1c2e]">
          <table className="w-full text-[13px] min-w-[920px]">
            <thead className="bg-[#f8fafc] text-left text-[10px] uppercase tracking-wide text-[#6b7685]">
              <tr>
                <th className="px-4 py-2">Contract / Period</th>
                <th className="px-4 py-2 text-right">Settlement (ZAR)</th>
                <th className="px-4 py-2">Paying party</th>
                <th className="px-4 py-2">Tier</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">SLA</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rowBusy = busy === r.id;
                const breached = r.sla_breached === true || r.sla_breached === 1;
                const actions = VPPA_TRANSITIONS[r.chain_status] ?? [];
                return (
                  <React.Fragment key={r.id}>
                    <tr className="border-t border-[#e5ebf2] align-top">
                      <td className="px-4 py-2">
                        <div className="font-mono text-[11px] text-[#0f1c2e]">{r.contract_ref}</div>
                        <div className="text-[11px] text-[#6b7685]">{r.settlement_period} · {r.reference_index.replace(/_/g, ' ')}</div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-[12px]">
                        {r.settlement_amount_zar != null ? zarFmt(r.settlement_amount_zar) : '—'}
                      </td>
                      <td className="px-4 py-2 text-[12px]">{vppaPaying(r.paying_party)}</td>
                      <td className="px-4 py-2">
                        {r.settlement_tier ? <Pill tone="info">{r.settlement_tier}</Pill> : <span className="text-[#9aa6b4]">—</span>}
                      </td>
                      <td className="px-4 py-2">
                        <Pill tone={vppaStatusTone(r.chain_status)}>{r.chain_status.replace(/_/g, ' ')}</Pill>
                      </td>
                      <td className="px-4 py-2 text-[11px] whitespace-nowrap">
                        {breached ? (
                          <span className="text-[#b4453a] font-medium">Breached</span>
                        ) : r.hours_until_sla != null ? (
                          <span className={r.hours_until_sla < 24 ? 'text-[#b4453a]' : 'text-[#6b7685]'}>{r.hours_until_sla}h left</span>
                        ) : (
                          <span className="text-[#9aa6b4]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-[11px] text-[#6b7685] whitespace-nowrap">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 whitespace-nowrap">
                          {actions.length === 0 ? (
                            <span className="text-[11px] text-[#9aa6b4]">Terminal</span>
                          ) : (
                            actions.map((a) => (
                              <button type="button"
                                key={a}
                                onClick={() => {
                                  if (a === 'publish_reference_price') { setPubModal({ id: r.id }); return; }
                                  void act(r.id, a);
                                }}
                                disabled={rowBusy}
                                className={`text-[11px] font-medium hover:underline disabled:opacity-40 ${VPPA_DESTRUCTIVE.has(a) ? 'text-[#b4453a]' : 'text-[oklch(0.46_0.16_55)]'}`}
                              >
                                {VPPA_ACTION_LABELS[a] ?? a}
                              </button>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                    {rowErr[r.id] && (
                      <tr className="border-t border-[#e5ebf2] bg-[#fdf6f5]">
                        <td colSpan={8} className="px-4 py-2 text-[11px] text-[#b4453a]">{rowErr[r.id]}</td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {opening && (
        <ActionModal
          title="Open CfD settlement period"
          submitLabel="Open period"
          fields={[
            { key: 'contract_ref', label: 'Contract reference', required: true },
            { key: 'generator_id', label: 'Generator', required: true, type: 'lookup', lookupEndpoint: '/api/lookup/participants', lookupAutoFill: { generator_name: 'name' } },
            { key: 'settlement_period', label: 'Settlement period (YYYY-MM)', required: true },
            { key: 'reference_index', label: 'Reference index', type: 'select', required: true, options: [
              { value: 'day_ahead_market', label: 'Day-ahead market' },
              { value: 'eskom_megaflex', label: 'Eskom Megaflex' },
              { value: 'ifrt_reference', label: 'IFRT reference' },
              { value: 'wholesale_pool', label: 'Wholesale pool' },
            ] },
            { key: 'notional_mwh', label: 'Notional MWh', type: 'number', required: true },
            { key: 'strike_price_zar_per_mwh', label: 'Strike price (ZAR/MWh)', type: 'number', required: true },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => setOpening(false)}
          onSubmit={async (v) => {
            try {
              await api.post('/offtaker/virtual-ppa-settlement/open', {
                ...v,
                notional_mwh: v.notional_mwh ? Number(v.notional_mwh) : undefined,
                strike_price_zar_per_mwh: v.strike_price_zar_per_mwh ? Number(v.strike_price_zar_per_mwh) : undefined,
              });
            } catch (e: unknown) {
              throw new Error((e as any)?.response?.data?.error || 'Failed to open settlement period');
            }
            setOpening(false);
            await load();
            onRefresh?.();
          }}
        />
      )}

      {pubModal && (
        <ActionModal
          title="Publish reference price"
          submitLabel="Publish"
          fields={[
            { key: 'reference_price_zar_per_mwh', label: 'Reference price (ZAR/MWh)', type: 'number', required: true },
            { key: 'reason', label: 'Source / notes' },
          ] as FieldSpec[]}
          onClose={() => setPubModal(null)}
          onSubmit={async (v) => {
            try {
              await act(pubModal.id, 'publish_reference_price', {
                reference_price_zar_per_mwh: Number(v.reference_price_zar_per_mwh),
                reason: v.reason,
              });
            } catch (e: unknown) {
              throw new Error((e as any)?.response?.data?.error || 'Failed to publish reference price');
            }
            setPubModal(null);
          }}
        />
      )}
    </div>
  );
}

function WheelingAccessTab({ onRefresh }: { onRefresh?: () => void }) {
  const [data, setData] = React.useState<any[]>([]);
  const [kpis, setKpis] = React.useState<any>({});
  const [modal, setModal] = React.useState<WheelModal>(null);
  const [createModal, setCreateModal] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const bump = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  React.useEffect(() => {
    fetch('/api/wheeling-access', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(j => { setData(j.data ?? []); setKpis(j.kpis ?? {}); });
  }, [refreshKey]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', val: kpis.total ?? 0 },
          { label: 'Active', val: kpis.active ?? 0 },
          { label: 'In progress', val: kpis.in_progress ?? 0 },
          { label: 'Renewal due', val: kpis.renewal_due ?? 0 },
        ].map(k => (
          <div key={k.label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-semibold text-gray-900">{k.val}</div>
            <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">{data.length} wheeling access applications</span>
        <button type="button"
          onClick={() => setCreateModal(true)}
          className="text-sm bg-[oklch(0.46_0.16_55)] text-white px-3 py-1.5 rounded-md hover:bg-[oklch(0.40_0.15_55)]"
        >+ New access application</button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Tier', 'Capacity (MW)', 'Voltage (kV)', 'IPP ref', 'Status', 'SLA deadline', ''].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {data.map((row: any) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${WHEEL_TIER_TONE[row.wheel_tier] ?? 'bg-gray-100 text-gray-700'}`}>
                    {row.wheel_tier?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-700">{row.requested_capacity_mw ?? '—'}</td>
                <td className="px-3 py-2 text-gray-600">{row.voltage_level_kv ? `${row.voltage_level_kv} kV` : '—'}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{row.ipp_ref ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${wheelStatusTone(row.chain_status)}`}>
                    {row.chain_status?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-500 text-xs">{row.sla_deadline ? new Date(row.sla_deadline).toLocaleDateString() : '—'}</td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => setModal({ id: row.id, wheel_tier: row.wheel_tier, requested_capacity_mw: row.requested_capacity_mw })}
                    className="text-xs text-[oklch(0.46_0.16_55)] hover:underline">Action</button>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">No wheeling access applications found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {createModal && (
        <ActionModal
          title="New wheeling access application"
          submitLabel="Submit application"
          fields={[
            { key: 'wheel_tier', label: 'Tier', type: 'select', required: true, options: [
              { value: 'small_embedded', label: 'Small embedded (<1 MW)' },
              { value: 'medium_distributed', label: 'Medium distributed (1–10 MW)' },
              { value: 'large_industrial', label: 'Large industrial (10–100 MW)' },
              { value: 'bulk_transmission', label: 'Bulk transmission (>100 MW)' },
            ]} as FieldSpec,
            { key: 'requested_capacity_mw', label: 'Requested capacity (MW)', type: 'number' },
            { key: 'wheeling_distance_km', label: 'Wheeling distance (km)', type: 'number' },
            { key: 'voltage_level_kv', label: 'Voltage level (kV)', type: 'number' },
            { key: 'ipp_ref', label: 'IPP / generator reference' },
            { key: 'gca_ref', label: 'GCA reference (W28)' },
            { key: 'ppa_ref', label: 'PPA reference (W22)' },
            { key: 'wheeling_route_description', label: 'Wheeling route description', type: 'textarea' },
            { key: 'reason', label: 'Application notes' },
          ] as FieldSpec[]}
          onClose={() => setCreateModal(false)}
          onSubmit={async (v) => {
            const res = await fetch('/api/wheeling-access', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                ...v,
                requested_capacity_mw: v.requested_capacity_mw ? Number(v.requested_capacity_mw) : undefined,
                wheeling_distance_km: v.wheeling_distance_km ? Number(v.wheeling_distance_km) : undefined,
                voltage_level_kv: v.voltage_level_kv ? Number(v.voltage_level_kv) : undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setCreateModal(false); bump();
          }}
        />
      )}

      {modal && (
        <ActionModal
          title={`Wheeling access — ${modal.wheel_tier?.replace(/_/g, ' ')} — ${modal.requested_capacity_mw ?? '?'}MW`}
          submitLabel="Submit action"
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: [
              { value: 'commence_feasibility', label: 'Commence feasibility study' },
              { value: 'commence_impact_assessment', label: 'Commence impact assessment' },
              { value: 'issue_terms', label: 'Issue indicative terms' },
              { value: 'commence_negotiation', label: 'Commence negotiation' },
              { value: 'execute_agreement', label: 'Execute wheeling agreement' },
              { value: 'activate', label: 'Activate wheeling' },
              { value: 'request_modification', label: 'Request modification' },
              { value: 'flag_renewal', label: 'Flag renewal due' },
              { value: 'terminate', label: 'Terminate agreement' },
              { value: 'expire', label: 'Mark as expired' },
              { value: 'withdraw', label: 'Withdraw application' },
            ]} as FieldSpec,
            { key: 'feasibility_ref', label: 'Feasibility study reference' },
            { key: 'impact_study_ref', label: 'Impact assessment reference' },
            { key: 'network_constraints', label: 'Network constraints / findings', type: 'textarea' },
            { key: 'indicative_terms_ref', label: 'Indicative terms reference' },
            { key: 'agreement_ref', label: 'Wheeling agreement number' },
            { key: 'agreement_expiry', label: 'Agreement expiry date' },
            { key: 'wheeling_charge_tariff', label: 'Wheeling charge tariff class' },
            { key: 'modification_description', label: 'Modification description', type: 'textarea' },
            { key: 'renewal_due_date', label: 'Renewal due date' },
            { key: 'termination_reason', label: 'Termination reason', type: 'textarea' },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/wheeling-access/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify(v),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); bump();
          }}
        />
      )}
    </div>
  );
}
