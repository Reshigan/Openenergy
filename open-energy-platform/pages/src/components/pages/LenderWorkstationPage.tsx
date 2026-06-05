import React, { useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import { CovenantCertificateTab } from '../lender/CovenantCertificateTab';
import { CreditOriginationChainTab } from '../lender/CreditOriginationChainTab';
import { DrawdownChainTab } from '../lender/DrawdownChainTab';
import { DscrMonitoringChainTab } from '../lender/DscrMonitoringChainTab';
import { DunningTab } from '../lender/DunningTab';
import { LoanDefaultChainTab } from '../lender/LoanDefaultChainTab';
import { LoanRestructureChainTab } from '../lender/LoanRestructureChainTab';
import { LoanTransferChainTab } from '../lender/LoanTransferChainTab';
import { ReserveAccountChainTab } from '../lender/ReserveAccountChainTab';
import { SecurityPerfectionChainTab } from '../lender/SecurityPerfectionChainTab';
import { SllKpiChainTab } from '../lender/SllKpiChainTab';
import { StrateSwiftConnectorTab } from '../strateSwiftConnector/StrateSwiftConnectorTab';
import { SapOracleErpConnectorTab } from '../sapOracleErpConnector/SapOracleErpConnectorTab';
import { GovernmentFilingConnectorTab } from '../governmentFilingConnector/GovernmentFilingConnectorTab';
import StageGateTab from '../stageGate/StageGateTab';
import { LenderEsapTab } from '../lender/LenderEsapTab';
import { LenderFacilityAmendmentTab } from '../lender/LenderFacilityAmendmentTab';

export function LenderWorkstationPage() {
  const kpis = useWorkstationKpis('lender');
  const facilitiesPanel = useWorkstationPanel('Active facilities', '/lender/facilities', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[#dbecfb] text-[#1a3a5c]">{r.facility_type || r.product_type || 'facility'}</span>,
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
      tabs={[
        { key: 'facilities', label: 'Facilities', group: 'Origination', body: () => <FacilitiesTab /> },
        { key: 'credit_origination', label: 'Credit origination', group: 'Origination', body: () => <CreditOriginationChainTab /> },
        { key: 'drawdown', label: 'Drawdowns / UoP', group: 'Monitoring', body: () => <DrawdownChainTab /> },
        { key: 'covenant_cert', label: 'Covenant certificates', group: 'Monitoring', body: () => <CovenantCertificateTab /> },
        { key: 'dscr_monitoring', label: 'DSCR monitoring', group: 'Monitoring', body: () => <DscrMonitoringChainTab /> },
        { key: 'sll_kpi', label: 'SLL KPI & margin ratchet', group: 'Monitoring', body: () => <SllKpiChainTab /> },
        { key: 'loan_transfer', label: 'Loan transfer / secondary', group: 'Portfolio', body: () => <LoanTransferChainTab /> },
        { key: 'reserve_account', label: 'Reserve accounts (DSRA/MRA)', group: 'Portfolio', body: () => <ReserveAccountChainTab /> },
        { key: 'security_perfection', label: 'Security perfection', group: 'Portfolio', body: () => <SecurityPerfectionChainTab /> },
        { key: 'loan_restructure', label: 'Loan restructure & A&E', group: 'Portfolio', body: () => <LoanRestructureChainTab /> },
        { key: 'loan_default', label: 'Default & enforcement', group: 'Enforcement', body: () => <LoanDefaultChainTab /> },
        { key: 'dunning', label: 'Dunning queue', group: 'Enforcement', body: () => <DunningTab /> },
        { key: 'esap_compliance', label: 'ESAP Compliance (W195)', group: 'Risk', body: () => <LenderEsapTab /> },
        { key: 'facility_amendments', label: 'Facility Amendments', group: 'Risk', body: () => <LenderFacilityAmendmentTab /> },
        { key: 'capital_adequacy', label: 'Capital adequacy (W203)', group: 'Risk', body: ({ onRefresh }) => <CapitalAdequacyTab onRefresh={onRefresh} /> },
        { key: 'esap_monitoring_chain', label: 'EP IV ESAP monitoring (W214)', group: 'Risk', body: ({ onRefresh }) => <EsapMonitoringTab onRefresh={onRefresh} /> },
        { key: 'strate-swift-connectors', label: 'Settlement rails', group: 'Reporting', body: () => <StrateSwiftConnectorTab /> },
        { key: 'sap-oracle-erp-connectors', label: 'ERP connectors', group: 'Reporting', body: () => <SapOracleErpConnectorTab /> },
        { key: 'government-filing-connectors', label: 'Filing connectors', group: 'Reporting', body: () => <GovernmentFilingConnectorTab /> },
        { key: 'stage-gates', label: 'Stage gates', group: 'Reporting', body: () => <StageGateTab readOnly /> },
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
      endpoint="/lender/facilities"
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
        <button
          className="px-3 py-1.5 rounded bg-[#1a3a5c] text-white text-sm font-medium hover:bg-[#1f4a78]"
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
      <button
        onClick={() => setModal('create')}
        className="mb-4 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
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
            { key: 'ep_category', label: 'EP category (A/B/C)', required: false },
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
