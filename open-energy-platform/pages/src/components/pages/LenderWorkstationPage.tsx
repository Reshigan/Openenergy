import React from 'react';
import { WorkstationShell, ListingTable, Pill } from '../launch/WorkstationShell';
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
