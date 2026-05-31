import React, { useCallback, useEffect, useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import { api } from '../../lib/api';
import { CurtailmentClaimTab } from '../offtaker/CurtailmentClaimTab';
import { ObligationsTab } from '../offtaker/ObligationsTab';
import { PaymentSecurityChainTab } from '../offtaker/PaymentSecurityChainTab';
import { PpaChangeInLawChainTab } from '../offtaker/PpaChangeInLawChainTab';
import { PpaContractChainTab } from '../offtaker/PpaContractChainTab';
import { PpaAnnualReconChainTab } from '../offtaker/PpaAnnualReconChainTab';
import { PpaNominationChainTab } from '../offtaker/PpaNominationChainTab';
import { PpaTerminationChainTab } from '../offtaker/PpaTerminationChainTab';
import { RecLifecycleChainTab } from '../offtaker/RecLifecycleChainTab';
import { TariffIndexationTab } from '../offtaker/TariffIndexationTab';
import { StrateSwiftConnectorTab } from '../strateSwiftConnector/StrateSwiftConnectorTab';
import { SapOracleErpConnectorTab } from '../sapOracleErpConnector/SapOracleErpConnectorTab';
import { GovernmentFilingConnectorTab } from '../governmentFilingConnector/GovernmentFilingConnectorTab';

export function OfftakerWorkstationPage() {
  const kpis = useWorkstationKpis('offtaker');
  const sitesPanel = useWorkstationPanel('Delivery points', '/offtaker-suite/sites', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[#dbecfb] text-[#1a3a5c]">{r.tariff_type || r.tariff || 'tariff'}</span>,
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
      tabs={[
        { key: 'sites', label: 'Sites & groups', body: ({ onRefresh }) => <SitesTab onRefresh={onRefresh} /> },
        { key: 'tariffs', label: 'Tariffs', body: () => <TariffsTab /> },
        { key: 'budgets', label: 'Budget vs actual', body: ({ onRefresh }) => <BudgetsTab onRefresh={onRefresh} /> },
        { key: 'bills', label: 'Bill upload & AI', body: ({ onRefresh }) => <BillUploadTab onRefresh={onRefresh} /> },
        { key: 'recs', label: 'RECs portfolio', body: ({ onRefresh }) => <RecsTab onRefresh={onRefresh} /> },
        { key: 'scope2', label: 'Scope 2', body: ({ onRefresh }) => <Scope2Tab onRefresh={onRefresh} /> },
        { key: 'ppa_contract', label: 'PPA contracts', body: () => <PpaContractChainTab /> },
        { key: 'ppa_nomination', label: 'PPA nominations', body: () => <PpaNominationChainTab /> },
        { key: 'ppa_annual_recon', label: 'PPA annual reconciliation', body: () => <PpaAnnualReconChainTab /> },
        { key: 'payment_security', label: 'Payment security', body: () => <PaymentSecurityChainTab /> },
        { key: 'tariff_indexation', label: 'Tariff indexation', body: () => <TariffIndexationTab /> },
        { key: 'curtailment_claim', label: 'Curtailment claims', body: () => <CurtailmentClaimTab /> },
        { key: 'change_in_law', label: 'PPA change-in-law', body: () => <PpaChangeInLawChainTab /> },
        { key: 'rec_lifecycle', label: 'REC lifecycle', body: () => <RecLifecycleChainTab /> },
        { key: 'ppa_termination', label: 'PPA termination', body: () => <PpaTerminationChainTab /> },
        { key: 'obligations', label: 'Obligations register', body: () => <ObligationsTab /> },
        { key: 'strate-swift-connectors', label: 'Settlement rails (W124)', body: () => <StrateSwiftConnectorTab /> },
        { key: 'sap-oracle-erp-connectors', label: 'ERP connectors (W125)', body: () => <SapOracleErpConnectorTab /> },
        { key: 'government-filing-connectors', label: 'Filing connectors (W126)', body: () => <GovernmentFilingConnectorTab /> },
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

type MixResult = {
  mix: MixItem[];
  savings_pct?: number;
  carbon_tco2e?: number;
  warnings?: string[];
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
      await loadBills();
      onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'upload failed');
    } finally {
      setUploading(false);
    }
  };

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
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'optimize failed');
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <div className="space-y-4">
      {err && <div className="text-[12px] text-red-700">{err}</div>}

      {/* AI assist banner — "why" + 1-click */}
      <div className="rounded-xl border border-[#cfe0d6] bg-[#f4faf6] p-4 flex items-start gap-3">
        <div className="h-8 w-8 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold flex items-center justify-center">AI</div>
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
        <button
          onClick={upload}
          disabled={uploading}
          className="h-9 px-4 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold disabled:opacity-60"
        >
          {uploading ? 'Analysing…' : 'Analyse bill'}
        </button>
        <button
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
            <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
              <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Next step</div>
              <div className="text-[13px] mt-1 text-[#0f1c2e]">Draft LOI from this mix — routes to each developer's action queue.</div>
            </div>
          </div>
          {mix.warnings && mix.warnings.length > 0 && (
            <ul className="mt-2 text-[12px] text-[#a16207] list-disc pl-5">
              {mix.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
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
