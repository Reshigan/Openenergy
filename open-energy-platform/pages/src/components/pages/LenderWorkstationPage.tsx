import React, { useState } from 'react';
import { api } from '../../lib/api';
import { WorkstationShell, ListingTable, Pill, ActionModal } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import { DscrMonitoringChainTab } from '../lender/DscrMonitoringChainTab';
import { DunningTab } from '../lender/DunningTab';
import { LoanRestructureChainTab } from '../lender/LoanRestructureChainTab';
import { ReserveAccountChainTab } from '../lender/ReserveAccountChainTab';
import { SllKpiChainTab } from '../lender/SllKpiChainTab';
import { StrateSwiftConnectorTab } from '../strateSwiftConnector/StrateSwiftConnectorTab';
import { SapOracleErpConnectorTab } from '../sapOracleErpConnector/SapOracleErpConnectorTab';
import { GovernmentFilingConnectorTab } from '../governmentFilingConnector/GovernmentFilingConnectorTab';
import { LenderEsapTab } from '../lender/LenderEsapTab';
import { LenderFacilityAmendmentTab } from '../lender/LenderFacilityAmendmentTab';
import { ReportPanel, type ReportConfig } from '../launch/ReportPanel';
import type { TourDef } from '../launch/ProductTour';

const LENDER_REPORTS: ReportConfig[] = [
  {
    title: 'Covenant Certificates',
    endpoint: '/api/lender/covenant-certs',
    columns: [
      { key: 'cert_ref', label: 'Reference' },
      { key: 'borrower_id', label: 'Borrower' },
      { key: 'reporting_period', label: 'Period' },
      { key: 'chain_status', label: 'Status' },
      { key: 'submitted_at', label: 'Submitted' },
    ],
    dateKey: 'submitted_at',
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC — Lender Covenant Certificates Report',
  },
  {
    title: 'DSCR Monitoring',
    endpoint: '/api/lender/dscr-monitoring',
    columns: [
      { key: 'facility_ref', label: 'Facility' },
      { key: 'reporting_period', label: 'Period' },
      { key: 'dscr_ratio', label: 'DSCR', numeric: true },
      { key: 'dscr_covenant', label: 'Covenant', numeric: true },
      { key: 'breach_status', label: 'Breach' },
    ],
    pivotGroupBy: 'breach_status',
    mailSubject: 'CEC — DSCR Monitoring Report',
  },
  {
    title: 'Drawdown Records',
    endpoint: '/api/lender/drawdowns',
    columns: [
      { key: 'drawdown_ref', label: 'Reference' },
      { key: 'facility_ref', label: 'Facility' },
      { key: 'amount_zar', label: 'Amount ZAR', numeric: true },
      { key: 'chain_status', label: 'Status' },
      { key: 'disbursed_at', label: 'Disbursed' },
    ],
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC — Lender Drawdown Report',
  },
  {
    title: 'EP IV ESAP Monitoring',
    endpoint: '/api/lender/esap-monitoring',
    columns: [
      { key: 'esap_ref', label: 'Reference' },
      { key: 'ep_category', label: 'EP Category' },
      { key: 'ps_standard', label: 'PS Standard' },
      { key: 'chain_status', label: 'Status' },
      { key: 'review_due', label: 'Due' },
    ],
    pivotGroupBy: 'ep_category',
    mailSubject: 'CEC — EP IV ESAP Report',
  },
];

const LENDER_TOUR: TourDef = {
  id: 'lender-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'Lender workstation', body: 'Manage your entire renewable energy loan book from here — facility origination, drawdowns, covenant monitoring, and ESAP compliance through to enforcement.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Portfolio KPIs', body: 'Facilities at risk, active covenant breaches, upcoming CP deadlines, and DSCR alerts. Red numbers require action today.', placement: 'bottom' },
    { target: 'tab-nav', title: 'Loan lifecycle tabs', body: 'From credit origination through drawdown, covenant monitoring, and default management — each workflow is a live state machine with full audit trail.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start', body: 'Open any workflow tab and use its "+ New" action to originate a credit facility, file an ESAP report, or raise a CP clearance — each with AI hints and a full audit trail.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'Browse all lender actions including ESAP monitoring, security perfection, loan transfer, and EP IV compliance.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'IPP drawdown requests, ESAP status updates, and SARB large-exposure notifications land here for action.', placement: 'left' },
  ],
};

export function LenderWorkstationPage() {
  const kpis = useWorkstationKpis('lender');
  const facilitiesPanel = useWorkstationPanel('Active facilities', '/funder/facilities', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[oklch(0.94_0.02_250)] text-[oklch(0.46_0.16_55)]">{r.facility_type || r.product_type || 'facility'}</span>,
    text: <span>{r.facility_name || r.borrower_name || r.project_name || r.id} · {r.facility_amount_zar != null ? Number(r.facility_amount_zar).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }) : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{(r.lifecycle_stage || r.status || '').replace(/_/g, ' ')}</span>,
  }), 'No active facilities.');
  const panels = [facilitiesPanel].filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <WorkstationShell
      role="lender"
      eyebrow="Lender · Workstation"
      title="Lender workstation"
      subtitle="Origination · Drawdown · Covenants · Cure · Default. The full project-finance lifecycle a lender runs every day."
      backHref="/lender-suite"
      backLabel="Lender suite"
      kpis={kpis}
      panels={panels}
      tour={LENDER_TOUR}
      tabs={[
        { key: 'facilities', label: 'Facilities', group: 'Origination', body: () => <FacilitiesTab /> },
        { key: 'cp_clearances', label: 'CP clearance (W223)', group: 'Origination', chainKey: 'cp_clearance', body: ({ onRefresh }) => <CpClearanceTab onRefresh={onRefresh} /> },
        { key: 'dscr_monitoring', label: 'DSCR monitoring', group: 'Monitoring', chainKey: 'dscr_monitoring', body: () => <DscrMonitoringChainTab /> },
        { key: 'sll_kpi', label: 'SLL KPI & margin ratchet', group: 'Monitoring', chainKey: 'slb_kpi_ratchet', body: () => <SllKpiChainTab /> },
        { key: 'construction_cost_report', label: 'IE cost-to-complete (W231)', group: 'Monitoring', chainKey: 'construction_cost_report', body: ({ onRefresh }) => <ConstructionCostReportTab onRefresh={onRefresh} /> },
        { key: 'reserve_account', label: 'Reserve accounts (DSRA/MRA)', group: 'Portfolio', chainKey: 'reserve_account', body: () => <ReserveAccountChainTab /> },
        { key: 'loan_restructure', label: 'Loan restructure & A&E', group: 'Portfolio', chainKey: 'loan_restructure', body: () => <LoanRestructureChainTab /> },
        { key: 'dunning', label: 'Dunning queue', group: 'Enforcement', body: () => <DunningTab /> },
        { key: 'esap_compliance', label: 'ESAP Compliance (W195)', group: 'Risk', chainKey: 'esap_compliance', body: () => <LenderEsapTab /> },
        { key: 'facility_amendments', label: 'Facility Amendments', group: 'Risk', chainKey: 'facility_amendment', body: () => <LenderFacilityAmendmentTab /> },
        { key: 'capital_adequacy', label: 'Capital adequacy (W203)', group: 'Risk', chainKey: 'capital_adequacy_report', body: ({ onRefresh }) => <CapitalAdequacyTab onRefresh={onRefresh} /> },
        { key: 'esap_monitoring_chain', label: 'EP IV ESAP monitoring (W214)', group: 'Risk', chainKey: 'esap_monitoring', body: ({ onRefresh }) => <EsapMonitoringTab onRefresh={onRefresh} /> },
        { key: 'strate-swift-connectors', label: 'Settlement rails', group: 'Reporting', body: () => <StrateSwiftConnectorTab /> },
        { key: 'sap-oracle-erp-connectors', label: 'ERP connectors', group: 'Reporting', body: () => <SapOracleErpConnectorTab /> },
        { key: 'government-filing-connectors', label: 'Filing connectors', group: 'Reporting', body: () => <GovernmentFilingConnectorTab /> },
        { key: 'reports', label: 'Reports & Exports', group: 'Reporting',
          body: () => (
            <div className="space-y-8">
              {LENDER_REPORTS.map(cfg => (
                <div key={cfg.endpoint} className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cfg.title}</p>
                  <ReportPanel config={cfg} />
                </div>
              ))}
            </div>
          ),
        },
        { key: 'audit', label: 'Audit & compliance', group: 'Reporting',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/lender"
              reconHint="facility_id,covenant_test,measured_value,status"
              reconSourceOptions={['sarb', 'jse_srl', 'lender_ie']}
              onChange={onRefresh}
            />
          ),
        },
      ]}
    />
  );
}

function FacilitiesTab() {
  return (
    <ListingTable
      endpoint="/funder/facilities"
      rowKey={(r) => r.id}
      empty={{ title: 'No facilities', description: 'No active lender facilities yet. Originate one from the credit-origination tab.' }}
      columns={[
        { key: 'facility_name', label: 'Facility', render: (r) => r.facility_name || r.borrower_name || r.id },
        { key: 'facility_type', label: 'Type', render: (r) => <Pill tone="info">{(r.facility_type || r.product_type || 'unknown').replace(/_/g, ' ')}</Pill> },
        { key: 'facility_amount_zar', label: 'Amount', align: 'right', render: (r) => r.facility_amount_zar != null ? Number(r.facility_amount_zar).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }) : '—' },
        { key: 'tenor_months', label: 'Tenor', align: 'right', render: (r) => r.tenor_months != null ? `${r.tenor_months}m` : '—' },
        { key: 'lifecycle_stage', label: 'Stage', render: (r) => <Pill tone={r.lifecycle_stage === 'operational' ? 'good' : r.lifecycle_stage === 'in_default' ? 'bad' : 'neutral'}>{(r.lifecycle_stage || r.status || 'unknown').replace(/_/g, ' ')}</Pill> },
        { key: 'updated_at', label: 'Updated', render: (r) => r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—' },
      ]}
    />
  );
}

// ─── W203: Basel III Capital Adequacy ─────────────────────────────────────────
type CapModalMode = 'create' | { type: 'action'; id: string; currentStatus: string } | null;

function CapitalAdequacyTab({ onRefresh }: { onRefresh?: () => void }) {
  const [modal, setModal] = useState<CapModalMode>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  const statusTone = (s: string) => {
    if (s === 'accepted') return 'good' as const;
    if (['capital_breach', 'withdrawn'].includes(s)) return 'bad' as const;
    if (['remediation_required', 'remediation', 'queries_raised'].includes(s)) return 'warn' as const;
    return 'neutral' as const;
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button type="button"
          className="px-3 py-1.5 rounded bg-[oklch(0.46_0.16_55)] text-white text-sm font-medium hover:bg-[#1f4a78]"
          onClick={() => setModal('create')}
        >
          + New report
        </button>
      </div>

      <ListingTable
        key={refreshKey}
        endpoint="/capital-adequacy-reports"
        rowKey={(r) => r.id}
        empty={{ title: 'No capital adequacy reports', description: 'Create a SARB BA 900 Basel III capital adequacy report.' }}
        columns={[
          { key: 'report_period', label: 'Period', render: (r) => r.report_period },
          { key: 'bank_tier', label: 'Tier', render: (r) => <Pill tone="info">{String(r.bank_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'cet1_ratio', label: 'CET1%', align: 'right', render: (r) => r.cet1_ratio != null ? `${Number(r.cet1_ratio).toFixed(2)}%` : '—' },
          { key: 'total_capital_ratio', label: 'Total Cap%', align: 'right', render: (r) => r.total_capital_ratio != null ? `${Number(r.total_capital_ratio).toFixed(2)}%` : '—' },
          { key: 'rwa_total', label: 'RWA (ZAR)', align: 'right', render: (r) => r.rwa_total != null ? Number(r.rwa_total).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }) : '—' },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={statusTone(r.chain_status)}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">On track</Pill> },
          { key: 'updated_at', label: 'Updated', render: (r) => r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—' },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="New capital adequacy report"
          submitLabel="Create"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/capital-adequacy-reports', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                bank_tier: v.bank_tier,
                report_period: v.report_period,
                reporting_date: v.reporting_date,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            { key: 'report_period', label: 'Report period (e.g. 2026-Q2)', required: true, placeholder: '2026-Q2' },
            { key: 'reporting_date', label: 'Quarter end date', type: 'date', required: true },
            {
              key: 'bank_tier', label: 'Bank tier', type: 'select', required: true, defaultValue: 'mid_tier',
              options: [
                { value: 'smaller', label: 'Smaller (≤30d SLA)' },
                { value: 'mid_tier', label: 'Mid-tier (45d SLA)' },
                { value: 'large', label: 'Large (60d SLA)' },
                { value: 'systemically_important', label: 'Systemically important (90d SLA)' },
              ],
            },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title={`Advance report — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit action"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/capital-adequacy-reports/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                reason: v.reason || undefined,
                sarb_submission_ref: v.sarb_submission_ref || undefined,
                ba900_form_ref: v.ba900_form_ref || undefined,
                cet1_ratio: v.cet1_ratio ? parseFloat(v.cet1_ratio) : undefined,
                total_capital_ratio: v.total_capital_ratio ? parseFloat(v.total_capital_ratio) : undefined,
                rwa_total: v.rwa_total ? parseFloat(v.rwa_total) : undefined,
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
                { value: 'start_rwa_calc', label: 'Start RWA calculation' },
                { value: 'complete_rwa_calc', label: 'Complete RWA calculation' },
                { value: 'complete_icaap', label: 'Complete ICAAP review' },
                { value: 'board_approve', label: 'Board approve' },
                { value: 'submit_to_sarb', label: 'Submit to SARB' },
                { value: 'sarb_raises_queries', label: 'SARB raises queries' },
                { value: 'respond_to_queries', label: 'Respond to SARB queries' },
                { value: 'sarb_accept', label: 'SARB accept' },
                { value: 'flag_remediation', label: 'Flag remediation required' },
                { value: 'start_remediation', label: 'Start remediation' },
                { value: 'refile', label: 'Refile after remediation' },
                { value: 'declare_capital_breach', label: 'Declare capital breach' },
                { value: 'withdraw', label: 'Withdraw filing' },
              ],
            },
            { key: 'cet1_ratio', label: 'CET1 ratio (%)', type: 'number', required: false, placeholder: '12.5' },
            { key: 'total_capital_ratio', label: 'Total capital ratio (%)', type: 'number', required: false, placeholder: '15.0' },
            { key: 'rwa_total', label: 'Total RWA (ZAR)', type: 'number', required: false },
            { key: 'sarb_submission_ref', label: 'SARB submission ref', required: false },
            { key: 'ba900_form_ref', label: 'BA 900 form reference', required: false },
            { key: 'reason', label: 'Notes / reason', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  );
}

// ─── W214: Lender EP IV ESAP Monitoring ───────────────────────────────────────
const ESAP_TIER_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good' | 'neutral'> = {
  category_c: 'info',
  category_b: 'warn',
  category_a: 'bad',
  critical_ps: 'bad',
};

function esapStatusTone(s: string): 'info' | 'warn' | 'bad' | 'good' | 'neutral' {
  if (s === 'closed_satisfactory') return 'good';
  if (s === 'non_compliant' || s === 'closed_escalated') return 'bad';
  if (s === 'action_identified' || s === 'partial_close') return 'warn';
  return 'info';
}

type EsapModal = null | 'create' | { type: 'action'; id: string; currentStatus: string };

function EsapMonitoringTab({ onRefresh }: { onRefresh: () => void }) {
  const [modal, setModal] = useState<EsapModal>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => { setRefreshKey(k => k + 1); onRefresh(); };

  return (
    <div>
      <button type="button"
        onClick={() => setModal('create')}
        className="mb-4 px-4 py-2 bg-[oklch(0.46_0.16_55)] text-white text-sm rounded hover:bg-[oklch(0.40_0.15_55)]"
      >
        Issue ESAP record
      </button>
      <ListingTable
        endpoint="/esap-monitoring"
        key={refreshKey}
        rowKey={(r) => r.id}
        empty={{ title: 'No ESAP monitoring records', description: 'Equator Principles IV monitoring records will appear here.' }}
        columns={[
          { key: 'site_name', label: 'Site', render: (r) => r.site_name || r.project_ref || '—' },
          { key: 'esap_tier', label: 'Category', render: (r) => <Pill tone={ESAP_TIER_TONE[r.esap_tier] ?? 'neutral'}>{String(r.esap_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={esapStatusTone(r.chain_status)}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'finding_count_major', label: 'Major findings', align: 'right', render: (r) => r.finding_count_major ?? 0 },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'monitoring_cycle', label: 'Cycle', render: (r) => r.monitoring_cycle || '—' },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="Issue ESAP monitoring record"
          submitLabel="Issue"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/esap-monitoring', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                project_ref: v.project_ref || undefined,
                facility_ref: v.facility_ref || undefined,
                loan_ref: v.loan_ref || undefined,
                esap_tier: v.esap_tier,
                ep_category: v.ep_category || undefined,
                ps_triggers: v.ps_triggers || undefined,
                monitoring_cycle: v.monitoring_cycle || undefined,
                site_name: v.site_name || undefined,
                site_location: v.site_location || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); bump();
          }}
          fields={[
            { key: 'site_name', label: 'Site name', required: false },
            { key: 'site_location', label: 'Site location', required: false },
            { key: 'monitoring_cycle', label: 'Monitoring cycle', required: false, placeholder: 'Annual 2025' },
            {
              key: 'esap_tier', label: 'Equator category', type: 'select', required: true, defaultValue: 'category_b',
              options: [
                { value: 'category_c', label: 'Category C — minimal impact (21d SLA)' },
                { value: 'category_b', label: 'Category B — limited impact (45d SLA)' },
                { value: 'category_a', label: 'Category A — significant impact (90d SLA)' },
                { value: 'critical_ps', label: 'Critical PS — PS6/PS7 triggered (180d SLA)' },
              ],
            },
            { key: 'ep_category', label: 'EP category', type: 'select', required: false, options: [
              { value: 'category_a', label: 'Category A' },
              { value: 'category_b', label: 'Category B' },
              { value: 'category_c', label: 'Category C' },
              { value: 'critical_ps', label: 'Critical PS' },
            ]},
            { key: 'ps_triggers', label: 'PS triggered (JSON array)', required: false, placeholder: '["PS1","PS6"]' },
            { key: 'project_ref', label: 'Project reference', required: false },
            { key: 'facility_ref', label: 'Facility reference', required: false },
            { key: 'loan_ref', label: 'Loan reference', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title={`ESAP action — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/esap-monitoring/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                auditor_name: v.auditor_name || undefined,
                auditor_firm: v.auditor_firm || undefined,
                visit_scheduled_date: v.visit_scheduled_date || undefined,
                findings_summary: v.findings_summary || undefined,
                finding_count_major: v.finding_count_major ? parseInt(v.finding_count_major, 10) : undefined,
                finding_count_minor: v.finding_count_minor ? parseInt(v.finding_count_minor, 10) : undefined,
                cap_reference: v.cap_reference || undefined,
                cap_due_date: v.cap_due_date || undefined,
                tpa_firm: v.tpa_firm || undefined,
                tpa_outcome: v.tpa_outcome || undefined,
                escalation_reason: v.escalation_reason || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); bump();
          }}
          fields={[
            {
              key: 'action', label: 'Action', type: 'select', required: true,
              options: [
                { value: 'schedule_visit', label: 'Schedule monitoring visit' },
                { value: 'complete_visit', label: 'Complete visit — record findings' },
                { value: 'raise_action', label: 'Raise corrective action' },
                { value: 'submit_cap', label: 'Submit corrective action plan' },
                { value: 'start_remediation', label: 'Start remediation' },
                { value: 'request_tpa', label: 'Request third-party audit' },
                { value: 'record_partial_close', label: 'Record partial close' },
                { value: 'close_satisfactory', label: 'Close — satisfactory' },
                { value: 'escalate', label: 'Escalate to lenders committee' },
                { value: 'issue_non_compliance', label: 'Issue non-compliance notice' },
                { value: 'withdraw', label: 'Withdraw (project decommissioned)' },
              ],
            },
            { key: 'auditor_name', label: 'Auditor name', required: false },
            { key: 'auditor_firm', label: 'Auditor firm', required: false },
            { key: 'visit_scheduled_date', label: 'Visit scheduled date', required: false },
            { key: 'findings_summary', label: 'Findings summary', type: 'textarea', required: false },
            { key: 'finding_count_major', label: 'Major finding count', type: 'number', required: false },
            { key: 'finding_count_minor', label: 'Minor finding count', type: 'number', required: false },
            { key: 'cap_reference', label: 'CAP reference', required: false },
            { key: 'cap_due_date', label: 'CAP due date', required: false },
            { key: 'tpa_firm', label: 'TPA firm', required: false },
            { key: 'tpa_outcome', label: 'TPA outcome', type: 'select', required: false, options: [
              { value: 'satisfactory', label: 'Satisfactory' },
              { value: 'conditional', label: 'Conditional' },
              { value: 'unsatisfactory', label: 'Unsatisfactory' },
            ]},
            { key: 'escalation_reason', label: 'Escalation reason', type: 'textarea', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  );
}

// ─── W223: Lender CP Clearance ────────────────────────────────────────────────
const CP_TIER_TONE: Record<string, 'neutral' | 'info' | 'warn' | 'bad'> = {
  minor: 'neutral', standard: 'info', major: 'warn', systemic: 'bad',
};

function cpStatusTone(s: string): 'good' | 'bad' | 'warn' | 'neutral' | 'info' {
  if (s === 'drawdown_authorized') return 'good';
  if (s === 'cp_defaulted' || s === 'expired') return 'bad';
  if (s === 'under_lender_review' || s === 'cps_submitted') return 'info';
  if (s === 'cps_satisfied' || s === 'cps_partially_waived') return 'warn';
  return 'neutral';
}

type CpModal = 'create' | { type: 'action'; id: string; currentStatus: string } | null;

function CpClearanceTab({ onRefresh }: { onRefresh?: () => void }) {
  const [modal, setModal] = useState<CpModal>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button type="button"
          className="px-3 py-1.5 rounded bg-[oklch(0.46_0.16_55)] text-white text-sm font-medium hover:bg-[#1f4a78]"
          onClick={() => setModal('create')}
        >
          + New CP register
        </button>
      </div>

      <ListingTable
        key={refreshKey}
        endpoint="/cp-clearances"
        rowKey={(r) => r.id}
        empty={{ title: 'No CP registers', description: 'Open a conditions precedent register to begin tracking financial close.' }}
        columns={[
          { key: 'borrower_name', label: 'Borrower', render: (r) => String(r.borrower_name ?? r.id).slice(0, 24) },
          { key: 'cp_tier', label: 'Tier', render: (r) => <Pill tone={CP_TIER_TONE[String(r.cp_tier)] ?? 'neutral'}>{String(r.cp_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'cp_count_total', label: 'CPs', align: 'right', render: (r) => r.cp_count_total != null ? `${r.cp_count_satisfied ?? 0}/${r.cp_count_total}` : '—' },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={cpStatusTone(String(r.chain_status))}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">On track</Pill> },
          { key: 'updated_at', label: 'Updated', render: (r) => r.updated_at ? new Date(String(r.updated_at)).toLocaleDateString() : '—' },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="New CP clearance register"
          submitLabel="Create"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/cp-clearances', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                cp_tier: v.cp_tier,
                borrower_name: v.borrower_name || undefined,
                facility_ref: v.facility_ref || undefined,
                project_ref: v.project_ref || undefined,
                cp_count_total: v.cp_count_total ? Number(v.cp_count_total) : undefined,
                closing_deadline: v.closing_deadline || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            { key: 'borrower_name', label: 'Borrower name', required: true },
            { key: 'cp_tier', label: 'CP tier', type: 'select', required: true, defaultValue: 'standard', options: [
              { value: 'minor', label: 'Minor (<R50M, 7d SLA)' },
              { value: 'standard', label: 'Standard (R50M–R500M, 14d SLA)' },
              { value: 'major', label: 'Major (R500M–R5B, 21d SLA)' },
              { value: 'systemic', label: 'Systemic (>R5B, 30d SLA)' },
            ]},
            { key: 'facility_ref', label: 'Facility reference (W53)', required: false },
            { key: 'project_ref', label: 'Project reference', required: false },
            { key: 'cp_count_total', label: 'Total CP count', type: 'number', required: false },
            { key: 'closing_deadline', label: 'Long-stop date', type: 'date', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title="CP clearance action"
          submitLabel="Submit"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/cp-clearances/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                cp_count_satisfied: v.cp_count_satisfied ? Number(v.cp_count_satisfied) : undefined,
                cp_count_waived: v.cp_count_waived ? Number(v.cp_count_waived) : undefined,
                cp_count_failed: v.cp_count_failed ? Number(v.cp_count_failed) : undefined,
                cp_failed_reason: v.cp_failed_reason || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: [
              { value: 'submit_register', label: 'Submit register to borrower' },
              { value: 'agree_cp_list', label: 'Agree CP list' },
              { value: 'commence_satisfaction', label: 'Commence satisfaction period' },
              { value: 'submit_evidence', label: 'Submit evidence package' },
              { value: 'commence_review', label: 'Commence lender review' },
              { value: 'clear_cps', label: 'Clear CPs — all satisfied' },
              { value: 'waive_cps', label: 'Waive remaining CPs' },
              { value: 'authorize_drawdown', label: 'Authorize drawdown (financial close)' },
              { value: 'declare_cp_default', label: 'Declare CP default' },
              { value: 'withdraw', label: 'Withdraw deal' },
              { value: 'expire', label: 'Expire (long-stop missed)' },
            ]},
            { key: 'cp_count_satisfied', label: 'CPs satisfied count', type: 'number', required: false },
            { key: 'cp_count_waived', label: 'CPs waived count', type: 'number', required: false },
            { key: 'cp_count_failed', label: 'CPs failed count', type: 'number', required: false },
            { key: 'cp_failed_reason', label: 'CP failure reason', type: 'textarea', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  );
}

// ─── W231: Lender Construction-Period Monthly IE Cost-to-Complete ─────────────

type CcrRow = {
  id: string;
  project_id: string;
  lender_id: string;
  ipp_id: string;
  report_month: string;
  budget_tier: string;
  total_project_budget_zar: number | null;
  actual_spend_to_date_zar: number | null;
  cost_to_complete_estimate_zar: number | null;
  projected_final_cost_zar: number | null;
  physical_completion_percentage: number | null;
  ie_name: string | null;
  ie_certification_ref: string | null;
  overrun_zar: number | null;
  overrun_percentage: number | null;
  chain_status: string;
  sla_deadline: string | null;
  sla_breached: number;
  overdue?: boolean;
};

type CcrStats = {
  total: number;
  compliant: number;
  at_risk: number;
  defaulted: number;
  sla_breached_count: number;
};

const CCR_TRANSITIONS: Record<string, string[]> = {
  monitoring_period_open: ['request_report', 'cancel'],
  report_requested: ['submit_report', 'cancel'],
  report_submitted: ['commence_ie_review', 'cancel'],
  ie_review: ['certify_report'],
  ie_certified: ['confirm_budget_compliance', 'flag_cost_overrun_risk'],
  cost_overrun_risk: ['confirm_cost_overrun', 'cancel'],
  equity_injection_required: ['draw_standby_facility', 'confirm_cure', 'trigger_default'],
  standby_drawdown: ['confirm_cure', 'trigger_default'],
};

const CCR_ACTION_LABELS: Record<string, string> = {
  request_report: 'Request IE report',
  submit_report: 'Submit cost report',
  commence_ie_review: 'Commence IE review',
  certify_report: 'Certify report',
  confirm_budget_compliance: 'Confirm budget compliance',
  flag_cost_overrun_risk: 'Flag cost overrun risk',
  confirm_cost_overrun: 'Confirm overrun — equity injection required',
  draw_standby_facility: 'Draw standby facility',
  confirm_cure: 'Confirm cure / resolved',
  trigger_default: 'Trigger default event',
  cancel: 'Cancel period',
};

const CCR_DESTRUCTIVE = new Set(['trigger_default', 'cancel']);

function ccrStatusTone(s: string): 'good' | 'bad' | 'warn' | 'neutral' | 'info' {
  if (s === 'budget_compliant' || s === 'resolved') return 'good';
  if (s === 'default_triggered') return 'bad';
  if (['cost_overrun_risk', 'equity_injection_required', 'standby_drawdown'].includes(s)) return 'warn';
  if (['ie_review', 'ie_certified', 'report_submitted'].includes(s)) return 'info';
  return 'neutral';
}

const zarFmt = (v: number | null) =>
  v != null ? v.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }) : '—';

type CcrModal = 'create' | { type: 'action'; id: string; currentStatus: string } | null;

function ConstructionCostReportTab({ onRefresh }: { onRefresh?: () => void }) {
  const [modal, setModal] = useState<CcrModal>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<{ reports: CcrRow[]; stats: CcrStats } | null>(null);

  const refresh = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  React.useEffect(() => {
    fetch('/api/lender/construction-cost-report?per_page=200', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.json())
      .then((res: { data?: { reports: CcrRow[]; stats: CcrStats } }) => {
        if (res.data) setData(res.data);
      })
      .catch(() => null);
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional refresh trigger
  }, [refreshKey]);

  const stats = data?.stats;
  const reports = data?.reports ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-4 text-sm">
          {stats && (
            <>
              <span className="text-[#6b7685]">Total <strong className="text-[oklch(0.46_0.16_55)]">{stats.total}</strong></span>
              <span className="text-[#6b7685]">Compliant <strong className="text-green-700">{stats.compliant}</strong></span>
              <span className="text-[#6b7685]">At risk <strong className="text-amber-700">{stats.at_risk}</strong></span>
              <span className="text-[#6b7685]">Defaulted <strong className="text-red-700">{stats.defaulted}</strong></span>
              <span className="text-[#6b7685]">SLA breached <strong className="text-red-700">{stats.sla_breached_count}</strong></span>
            </>
          )}
        </div>
        <button type="button"
          className="px-3 py-1.5 rounded bg-[oklch(0.46_0.16_55)] text-white text-sm font-medium hover:bg-[#1f4a78]"
          onClick={() => setModal('create')}
        >
          + New period
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[#e2e8f0] text-[#6b7685] text-left text-xs uppercase tracking-wide">
              <th className="py-2 pr-3">Project / Month</th>
              <th className="py-2 pr-3">Tier</th>
              <th className="py-2 pr-3 text-right">Budget</th>
              <th className="py-2 pr-3 text-right">Proj. Final</th>
              <th className="py-2 pr-3 text-right">Overrun</th>
              <th className="py-2 pr-3 text-right">Complete %</th>
              <th className="py-2 pr-3">IE</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">SLA</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 && (
              <tr><td colSpan={10} className="py-8 text-center text-[#6b7685] text-sm">No cost reports. Open a monthly monitoring period to begin.</td></tr>
            )}
            {reports.map((r) => {
              const avail = CCR_TRANSITIONS[r.chain_status] ?? [];
              return (
                <tr key={r.id} className="border-b border-[#f0f4f8] hover:bg-[#f8fafc]">
                  <td className="py-2 pr-3 font-mono text-xs">
                    <div className="font-medium text-[oklch(0.46_0.16_55)]">{r.project_id.slice(0, 16)}</div>
                    <div className="text-[#6b7685]">{r.report_month}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <Pill tone={r.budget_tier === 'mega' ? 'bad' : r.budget_tier === 'large' ? 'warn' : 'neutral'}>
                      {r.budget_tier}
                    </Pill>
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs">{zarFmt(r.total_project_budget_zar)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-xs">{zarFmt(r.projected_final_cost_zar)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-xs">
                    {r.overrun_percentage != null
                      ? <span className={r.overrun_percentage > 5 ? 'text-red-700 font-bold' : 'text-amber-700'}>{r.overrun_percentage.toFixed(1)}%</span>
                      : '—'}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs">
                    {r.physical_completion_percentage != null ? `${r.physical_completion_percentage.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2 pr-3 text-xs text-[#6b7685]">{r.ie_name ?? '—'}</td>
                  <td className="py-2 pr-3">
                    <Pill tone={ccrStatusTone(r.chain_status)}>{r.chain_status.replace(/_/g, ' ')}</Pill>
                  </td>
                  <td className="py-2 pr-3">
                    {r.sla_breached ? <Pill tone="bad">Breached</Pill> : r.overdue ? <Pill tone="warn">Overdue</Pill> : <Pill tone="good">On track</Pill>}
                  </td>
                  <td className="py-2">
                    {avail.length > 0 && (
                      <button type="button"
                        className="px-2 py-1 rounded bg-[#f0f4f8] text-[oklch(0.46_0.16_55)] text-xs font-medium hover:bg-[#e2e8f0]"
                        onClick={() => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
                      >
                        Action
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal === 'create' && (
        <ActionModal
          title="Open monthly monitoring period"
          submitLabel="Open"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/lender/construction-cost-report', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                project_id: v.project_id,
                ipp_id: v.ipp_id,
                report_month: v.report_month,
                total_project_budget_zar: v.total_project_budget_zar ? Number(v.total_project_budget_zar) : undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            { key: 'project_id', label: 'Project', type: 'lookup', lookupEndpoint: '/api/lookup/projects', required: true },
            { key: 'ipp_id', label: 'IPP participant', type: 'lookup', lookupEndpoint: '/api/lookup/participants', required: true },
            { key: 'report_month', label: 'Report month (YYYY-MM)', required: true, placeholder: '2026-06' },
            { key: 'total_project_budget_zar', label: 'Total project budget (ZAR)', type: 'number', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (() => {
        const avail = CCR_TRANSITIONS[modal.currentStatus] ?? [];
        return (
          <ActionModal
            title="IE cost report action"
            submitLabel="Submit"
            onClose={() => setModal(null)}
            onSubmit={async (v) => {
              const res = await fetch(`/api/lender/construction-cost-report/${modal.id}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({
                  action: v.action,
                  actual_spend_to_date_zar: v.actual_spend_to_date_zar ? Number(v.actual_spend_to_date_zar) : undefined,
                  cost_to_complete_estimate_zar: v.cost_to_complete_estimate_zar ? Number(v.cost_to_complete_estimate_zar) : undefined,
                  physical_completion_percentage: v.physical_completion_percentage ? Number(v.physical_completion_percentage) : undefined,
                  overrun_zar: v.overrun_zar ? Number(v.overrun_zar) : undefined,
                  overrun_percentage: v.overrun_percentage ? Number(v.overrun_percentage) : undefined,
                  equity_injection_required_zar: v.equity_injection_required_zar ? Number(v.equity_injection_required_zar) : undefined,
                  ie_name: v.ie_name || undefined,
                  ie_certification_ref: v.ie_certification_ref || undefined,
                  reason: v.reason || undefined,
                }),
              });
              if (!res.ok) throw new Error(await res.text());
              setModal(null);
              refresh();
            }}
            fields={[
              { key: 'action', label: 'Action', type: 'select', required: true, options: avail.map(a => ({ value: a, label: CCR_ACTION_LABELS[a] ?? a })) },
              { key: 'actual_spend_to_date_zar', label: 'Actual spend to date (ZAR)', type: 'number', required: false },
              { key: 'cost_to_complete_estimate_zar', label: 'IE cost-to-complete estimate (ZAR)', type: 'number', required: false },
              { key: 'physical_completion_percentage', label: 'Physical completion (%)', type: 'number', required: false },
              { key: 'overrun_zar', label: 'Overrun amount (ZAR)', type: 'number', required: false },
              { key: 'overrun_percentage', label: 'Overrun %', type: 'number', required: false },
              { key: 'equity_injection_required_zar', label: 'Equity injection required (ZAR)', type: 'number', required: false },
              { key: 'ie_name', label: 'IE firm name', required: false },
              { key: 'ie_certification_ref', label: 'IE report reference', required: false },
              { key: 'reason', label: 'Notes', type: 'textarea', required: false },
            ]}
          />
        );
      })()}
    </div>
  );
}
