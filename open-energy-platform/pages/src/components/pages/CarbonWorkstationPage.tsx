import React, { useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import { api } from '../../lib/api';
import { Article6Tab } from '../carbon/Article6Tab';
import { RegistrationChainTab } from '../carbon/RegistrationChainTab';
import { MrvChainTab } from '../carbon/MrvChainTab';
import { RetirementChainTab } from '../carbon/RetirementChainTab';
import { CarbonReversalChainTab } from '../carbon/CarbonReversalChainTab';
import { CarbonOffsetClaimChainTab } from '../carbon/CarbonOffsetClaimChainTab';
import { CreditingRenewalChainTab } from '../carbon/CreditingRenewalChainTab';
import { CarbonErpaChainTab } from '../carbon/CarbonErpaChainTab';
import { PoaCpaInclusionChainTab } from '../carbon/PoaCpaInclusionChainTab';
import { CarbonIssuanceChainTab } from '../carbon/CarbonIssuanceChainTab';
import { CcpAssessmentChainTab } from '../carbon/CcpAssessmentChainTab';
import { EsgDisclosureChainTab } from '../carbon/EsgDisclosureChainTab';
import { CreditRatingChainTab } from '../carbon/CreditRatingChainTab';

function Header({ onCreate, label }: { onCreate: () => void; label: string }) {
  return (
    <div className="flex justify-end mb-3">
      <button onClick={onCreate} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
        + {label}
      </button>
    </div>
  );
}

const STAGE_OPTIONS = [
  { value: 'validated', label: 'Validated' },
  { value: 'listed', label: 'Listed' },
  { value: 'traded', label: 'Traded' },
  { value: 'retired_partial', label: 'Retired (partial)' },
  { value: 'retired_full', label: 'Retired (full)' },
  { value: 'expired', label: 'Expired' },
];

const MRV_TRANSITIONS = [
  { value: 'submitted', label: 'Submit' },
  { value: 'under_verification', label: 'Send for verification' },
  { value: 'verified', label: 'Mark verified' },
  { value: 'rejected', label: 'Reject' },
  { value: 'published', label: 'Publish' },
];

export function CarbonWorkstationPage() {
  const kpis = useWorkstationKpis('carbon_fund');
  const vintagesPanel = useWorkstationPanel('Active vintages', '/carbon-registry/vintages', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[#dbecfb] text-[#1a3a5c]">{r.stage || r.status || '—'}</span>,
    text: <span>{r.project_name || r.name || r.serial_number} · {r.tco2e ? `${Number(r.tco2e).toLocaleString()} tCO₂e` : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.vintage_year || ''}</span>,
  }), 'No vintages yet.');
  const mrvPanel = useWorkstationPanel('Open MRV submissions', '/carbon-registry/mrv', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[#fff4d6] text-[#a06200]">{r.status || 'pending'}</span>,
    text: <span>{r.project_name || r.title} · {r.tco2e_claimed ? `${Math.round(r.tco2e_claimed).toLocaleString()} tCO₂e` : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-ZA') : ''}</span>,
  }), 'No MRV submissions.');
  const panels = [vintagesPanel, mrvPanel].filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <WorkstationShell
      role="carbon_fund"
      eyebrow="Carbon fund · Workstation"
      title="Carbon workstation"
      subtitle="Vintage workflow · MRV submissions · Retirement certificates. All flows; no external tools needed."
      backHref="/carbon-registry"
      backLabel="Carbon registry"
      kpis={kpis}
      panels={panels}
      tabs={[
        {
          key: 'vintages',
          label: 'Vintage workflow',
          body: ({ onRefresh }) => <VintagesTab onRefresh={onRefresh} />,
        },
        {
          key: 'mrv',
          label: 'MRV submissions',
          body: ({ onRefresh }) => <MrvTab onRefresh={onRefresh} />,
        },
        {
          key: 'certificates',
          label: 'Retirement certificates',
          body: ({ onRefresh }) => <CertificatesTab onRefresh={onRefresh} />,
        },
        {
          key: 'article6',
          label: 'Article 6 ITMO',
          body: () => <Article6Tab />,
        },
        {
          key: 'registration_chain',
          label: 'Project registration',
          body: () => <RegistrationChainTab />,
        },
        {
          key: 'mrv_chain',
          label: 'Verification chain',
          body: () => <MrvChainTab />,
        },
        {
          key: 'retirement_chain',
          label: 'Retirement chain',
          body: () => <RetirementChainTab />,
        },
        {
          key: 'reversal_chain',
          label: 'Reversals',
          body: () => <CarbonReversalChainTab />,
        },
        {
          key: 'offset_claim_chain',
          label: 'Tax offset claims',
          body: () => <CarbonOffsetClaimChainTab />,
        },
        {
          key: 'crediting_renewal_chain',
          label: 'Crediting renewal',
          body: () => <CreditingRenewalChainTab />,
        },
        {
          key: 'erpa_chain',
          label: 'Forward ERPA delivery',
          body: () => <CarbonErpaChainTab />,
        },
        {
          key: 'poa_cpa_inclusion_chain',
          label: 'PoA / CPA inclusion',
          body: () => <PoaCpaInclusionChainTab />,
        },
        {
          key: 'carbon_issuance_chain',
          label: 'Credit issuance',
          body: () => <CarbonIssuanceChainTab />,
        },
        {
          key: 'ccp_assessment_chain',
          label: 'CCP-eligibility assessment',
          body: () => <CcpAssessmentChainTab />,
        },
        {
          key: 'credit_rating_chain',
          label: 'Credit quality rating',
          body: () => <CreditRatingChainTab />,
        },
        {
          key: 'esg_disclosure_chain',
          label: 'ESG disclosure & assurance',
          body: () => <EsgDisclosureChainTab />,
        },
        {
          key: 'carbon_tax_returns',
          label: 'Carbon tax returns (W200)',
          body: ({ onRefresh }) => <CarbonTaxReturnsTab onRefresh={onRefresh} />,
        },
        {
          key: 'registry_transfers',
          label: 'Registry transfers (W206)',
          body: ({ onRefresh }) => <CarbonRegistryTransferTab onRefresh={onRefresh} />,
        },
        {
          key: 'audit',
          label: 'Audit & compliance',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/carbon-registry"
              reconHint="serial_id,retirement_ref,quantity_tco2e,retired_at"
              reconSourceOptions={['verra', 'gold_standard', 'cdm', 'sa_redd']}
              onChange={onRefresh}
            />
          ),
        },
      ]}
    />
  );
}

function VintagesTab({ onRefresh }: { onRefresh: () => void }) {
  const [advancing, setAdvancing] = useState<any | null>(null);
  return (
    <div>
      <ListingTable
        endpoint="/carbon-registry/vintage-workflow"
        rowKey={(r) => r.id}
        rowHref={(r) => `/carbon-registry/vintages/${r.id}`}
        empty={{ title: 'No vintages in workflow', description: 'Vintage cohorts will appear here as they progress through issued → validated → listed → traded → retired.' }}
        columns={[
          { key: 'vintage_id', label: 'Vintage', render: (r) => <span className="font-mono text-[11px]">{(r.vintage_id || '').slice(0, 12)}…</span> },
          { key: 'current_stage', label: 'Stage', render: (r) => <Pill tone={r.current_stage === 'retired_full' ? 'good' : 'info'}>{r.current_stage.replace(/_/g, ' ')}</Pill> },
          { key: 'retired_volume_tco2e', label: 'Retired tCO₂e', align: 'right', render: (r) => Number(r.retired_volume_tco2e || 0).toFixed(1) },
          { key: 'outstanding_tco2e', label: 'Outstanding tCO₂e', align: 'right', render: (r) => Number(r.outstanding_tco2e || 0).toFixed(1) },
          { key: 'updated_at', label: 'Updated', render: (r) => new Date(r.updated_at).toLocaleDateString() },
          { key: '_actions', label: '', render: (r) => (
            <button onClick={() => setAdvancing(r)} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">Advance</button>
          ) },
        ]}
      />
      {advancing && (
        <ActionModal
          title={`Advance vintage stage · current: ${advancing.current_stage}`}
          submitLabel="Advance"
          fields={[
            { key: 'to_stage', label: 'Next stage', type: 'select', required: true, options: STAGE_OPTIONS },
          ] as FieldSpec[]}
          onClose={() => setAdvancing(null)}
          onSubmit={async (v) => {
            await api.post(`/carbon-registry/vintage-workflow/${advancing.id}/advance`, { to_stage: v.to_stage });
            setAdvancing(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function MrvTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  const [transitioning, setTransitioning] = useState<any | null>(null);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="New MRV submission" />
      <ListingTable
        endpoint="/carbon-registry/mrv-submissions"
        rowKey={(r) => r.id}
        empty={{ title: 'No MRV submissions', description: 'Measurement-Reporting-Verification cycles will land here as they are drafted, submitted, verified, and published.' }}
        columns={[
          { key: 'project_id', label: 'Project', render: (r) => <span className="font-mono text-[11px]">{(r.project_id || '').slice(0, 12)}…</span> },
          { key: 'period_start', label: 'Period', render: (r) => `${r.period_start} → ${r.period_end}` },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'verified' || r.status === 'published' ? 'good' : r.status === 'rejected' ? 'bad' : 'warn'}>{r.status.replace(/_/g, ' ')}</Pill> },
          { key: 'reduction_tco2e', label: 'Reduction tCO₂e', align: 'right', render: (r) => r.reduction_tco2e != null ? Number(r.reduction_tco2e).toFixed(1) : '—' },
          { key: 'verified_at', label: 'Verified', render: (r) => r.verified_at ? new Date(r.verified_at).toLocaleDateString() : '—' },
          { key: '_actions', label: '', render: (r) => (
            r.status !== 'published' && r.status !== 'rejected' && (
              <button onClick={() => setTransitioning(r)} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">Transition</button>
            )
          ) },
        ]}
      />
      {filing && (
        <ActionModal
          title="New MRV submission"
          submitLabel="File"
          fields={[
            { key: 'project_id', label: 'Project ID', required: true, placeholder: 'project_…' },
            { key: 'period_start', label: 'Period start', type: 'date', required: true },
            { key: 'period_end', label: 'Period end', type: 'date', required: true },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/carbon-registry/mrv-submissions', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
      {transitioning && (
        <ActionModal
          title={`MRV transition · current: ${transitioning.status}`}
          submitLabel="Transition"
          fields={[
            { key: 'to', label: 'To', type: 'select', required: true, options: MRV_TRANSITIONS },
            { key: 'reduction_tco2e', label: 'Reduction tCO₂e (verification only)', type: 'number' },
            { key: 'rejection_reason', label: 'Rejection reason (rejected only)', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setTransitioning(null)}
          onSubmit={async (v) => {
            const body: any = { to: v.to };
            if (v.reduction_tco2e) body.reduction_tco2e = Number(v.reduction_tco2e);
            if (v.rejection_reason) body.rejection_reason = v.rejection_reason;
            await api.post(`/carbon-registry/mrv-submissions/${transitioning.id}/transition`, body);
            setTransitioning(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function CertificatesTab({ onRefresh }: { onRefresh: () => void }) {
  const [issuing, setIssuing] = useState(false);
  return (
    <div>
      <Header onCreate={() => setIssuing(true)} label="Issue certificate" />
      <ListingTable
        endpoint="/carbon-registry/retirement-certificates"
        rowKey={(r) => r.id}
        empty={{ title: 'No retirement certificates', description: 'Certificates issued for retired tCO₂e on behalf of buyers will appear here.' }}
        columns={[
          { key: 'certificate_number', label: 'Certificate', render: (r) => <span className="font-mono text-[11px]">{r.certificate_number}</span> },
          { key: 'beneficiary_name', label: 'Beneficiary' },
          { key: 'retired_volume_tco2e', label: 'tCO₂e', align: 'right', render: (r) => Number(r.retired_volume_tco2e || 0).toFixed(1) },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'delivered' ? 'good' : r.status === 'revoked' ? 'bad' : 'info'}>{r.status}</Pill> },
          { key: 'issued_at', label: 'Issued', render: (r) => r.issued_at ? new Date(r.issued_at).toLocaleDateString() : '—' },
        ]}
      />
      {issuing && (
        <ActionModal
          title="Issue retirement certificate"
          submitLabel="Issue"
          fields={[
            { key: 'retirement_id', label: 'Retirement ID', required: true, placeholder: 'retirement_…' },
            { key: 'retired_volume_tco2e', label: 'Retired tCO₂e', type: 'number', required: true },
            { key: 'beneficiary_name', label: 'Beneficiary name' },
            { key: 'beneficiary_email', label: 'Beneficiary email' },
          ] as FieldSpec[]}
          onClose={() => setIssuing(false)}
          onSubmit={async (v) => {
            await api.post('/carbon-registry/retirement-certificates/issue', {
              retirement_id: v.retirement_id,
              retired_volume_tco2e: Number(v.retired_volume_tco2e),
              beneficiary_name: v.beneficiary_name || undefined,
              beneficiary_email: v.beneficiary_email || undefined,
            });
            setIssuing(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

const CTR_STATUS_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good'> = {
  payment_made: 'good', submitted: 'good',
  disputed: 'bad', under_sars_review: 'warn',
  assessment_issued: 'warn', period_open: 'info',
};
const TAX_CLASS_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good'> = {
  micro: 'good', standard: 'info', large: 'warn', major: 'bad',
};
const CTR_ACTIONS = [
  { value: 'open_data_collection', label: 'Open data collection' },
  { value: 'calculate_emissions', label: 'Calculate emissions' },
  { value: 'apply_allowances', label: 'Apply allowances' },
  { value: 'prepare_return', label: 'Prepare return' },
  { value: 'approve_internally', label: 'Approve internally' },
  { value: 'submit_to_sars', label: 'Submit to SARS' },
  { value: 'acknowledge_receipt', label: 'Acknowledge receipt' },
  { value: 'commence_review', label: 'Commence review' },
  { value: 'issue_assessment', label: 'Issue assessment' },
  { value: 'record_payment', label: 'Record payment' },
  { value: 'raise_dispute', label: 'Raise dispute' },
];

function CarbonTaxReturnsTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  const [actionRow, setActionRow] = useState<Record<string, unknown> | null>(null);

  const createFields: FieldSpec[] = [
    { key: 'participant_id', label: 'Participant ID', required: true },
    { key: 'tax_class', label: 'Tax class', type: 'select', options: [
      { value: 'micro', label: 'Micro <25k tCO2e (14d SLA)' },
      { value: 'standard', label: 'Standard <100k tCO2e (30d SLA)' },
      { value: 'large', label: 'Large <500k tCO2e (60d SLA)' },
      { value: 'major', label: 'Major ≥500k tCO2e (90d SLA)' },
    ]},
    { key: 'tax_period', label: 'Tax period', required: true, placeholder: 'Q1-2025' },
    { key: 'fiscal_year', label: 'Fiscal year', type: 'number', required: true },
    { key: 'scope1_tco2e', label: 'Scope 1 (tCO2e)', type: 'number' },
    { key: 'scope2_tco2e', label: 'Scope 2 (tCO2e)', type: 'number' },
    { key: 'process_emissions_tco2e', label: 'Process emissions (tCO2e)', type: 'number' },
  ];

  const formatZAR = (v: unknown) =>
    v != null ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(v)) : '—';

  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Open return period" />
      {filing && (
        <ActionModal
          title="Open carbon tax return period"
          fields={createFields}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/carbon-tax-returns', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
      {actionRow && (
        <ActionModal
          title={`Return action: ${String(actionRow.tax_period || '')} (${String(actionRow.tax_class || '')})`}
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: CTR_ACTIONS },
            { key: 'sars_submission_ref', label: 'SARS submission ref' },
            { key: 'sars_assessment_ref', label: 'SARS assessment ref' },
            { key: 'assessment_amount', label: 'Assessment amount (ZAR)', type: 'number' },
            { key: 'net_tax_payable', label: 'Net tax payable (ZAR)', type: 'number' },
            { key: 'payment_reference', label: 'Payment reference' },
            { key: 'paid_amount', label: 'Paid amount (ZAR)', type: 'number' },
            { key: 'dispute_reason', label: 'Dispute reason', type: 'textarea' },
            { key: 'reason', label: 'Reason / note', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setActionRow(null)}
          onSubmit={async (v) => {
            await api.post(`/carbon-tax-returns/${String(actionRow.id)}/action`, v);
            setActionRow(null); onRefresh();
          }}
        />
      )}
      <ListingTable
        endpoint="/carbon-tax-returns"
        rowKey={(r) => r.id}
        columns={[
          { key: 'tax_period', label: 'Period', render: (r) => <span className="font-mono text-[11px]">{String(r.tax_period || '')} FY{r.fiscal_year}</span> },
          { key: 'tax_class', label: 'Class', render: (r) => <Pill tone={TAX_CLASS_TONE[String(r.tax_class)] ?? 'info'}>{String(r.tax_class || '')}</Pill> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={CTR_STATUS_TONE[String(r.chain_status)] ?? 'info'}>{String(r.chain_status || '').replace(/_/g, ' ')}</Pill> },
          { key: 'total_emissions_tco2e', label: 'tCO2e', align: 'right' as const, render: (r) => r.total_emissions_tco2e != null ? Number(r.total_emissions_tco2e).toFixed(1) : '—' },
          { key: 'net_tax_payable', label: 'Net payable', align: 'right' as const, render: (r) => formatZAR(r.net_tax_payable) },
          { key: 'sla_deadline', label: 'SLA', render: (r) => r.sla_deadline ? String(r.sla_deadline) : '—' },
          { key: 'sla_breached', label: 'Breach', render: (r) => r.sla_breached ? <Pill tone="bad">BREACH</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'actions', label: '', render: (r) => (
            <button onClick={() => setActionRow(r)} className="text-[11px] text-[#1a3a5c] underline">Action</button>
          )},
        ]}
      />
    </div>
  );
}

// ─── W206: Carbon Registry Transfer ───────────────────────────────────────────
type CrtModalMode = 'create' | { type: 'action'; id: string; currentStatus: string } | null;

function CarbonRegistryTransferTab({ onRefresh }: { onRefresh?: () => void }) {
  const [modal, setModal] = useState<CrtModalMode>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  const statusTone = (s: string) => {
    if (['ca_notified', 'completed'].includes(s)) return 'good' as const;
    if (['aml_rejected', 'registry_rejected'].includes(s)) return 'bad' as const;
    if (['ca_notation_required', 'transfer_in_flight'].includes(s)) return 'warn' as const;
    return 'neutral' as const;
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          className="px-3 py-1.5 rounded bg-[#1a3a5c] text-white text-sm font-medium hover:bg-[#1f4a78]"
          onClick={() => setModal('create')}
        >
          + New transfer
        </button>
      </div>

      <ListingTable
        key={refreshKey}
        endpoint="/carbon-registry-transfers"
        rowKey={(r) => r.id}
        empty={{ title: 'No registry transfers', description: 'Initiate a carbon credit registry transfer (domestic or international Art 6).' }}
        columns={[
          { key: 'transfer_type', label: 'Type', render: (r) => <Pill tone="info">{String(r.transfer_type).replace(/_/g, ' ')}</Pill> },
          { key: 'quantity_tco2e', label: 'Quantity (tCO₂e)', align: 'right', render: (r) => r.quantity_tco2e != null ? Number(r.quantity_tco2e).toLocaleString() : '—' },
          { key: 'source_registry', label: 'From', render: (r) => r.source_registry || '—' },
          { key: 'destination_registry', label: 'To', render: (r) => r.destination_registry || '—' },
          { key: 'vintage_year', label: 'Vintage', render: (r) => r.vintage_year || '—' },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={statusTone(r.chain_status)}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="New carbon registry transfer"
          submitLabel="Submit"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/carbon-registry-transfers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                transfer_type: v.transfer_type,
                quantity_tco2e: parseFloat(v.quantity_tco2e),
                vintage_year: v.vintage_year ? parseInt(v.vintage_year, 10) : undefined,
                source_registry: v.source_registry || undefined,
                destination_registry: v.destination_registry || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            {
              key: 'transfer_type', label: 'Transfer type', type: 'select', required: true, defaultValue: 'domestic',
              options: [
                { value: 'domestic', label: 'Domestic (7d SLA)' },
                { value: 'voluntary_crossregistry', label: 'Voluntary cross-registry (14d)' },
                { value: 'corsia', label: 'CORSIA (21d)' },
                { value: 'international_art6', label: 'International Art 6.2 (30d)' },
              ],
            },
            { key: 'quantity_tco2e', label: 'Quantity (tCO₂e)', type: 'number', required: true },
            { key: 'vintage_year', label: 'Vintage year', type: 'number', required: false },
            { key: 'source_registry', label: 'Source registry', required: false, placeholder: 'verra / gold_standard / dffe' },
            { key: 'destination_registry', label: 'Destination registry', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title={`Advance transfer — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit action"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/carbon-registry-transfers/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                reason: v.reason || undefined,
                aml_check_ref: v.aml_check_ref || undefined,
                registry_auth_ref: v.registry_auth_ref || undefined,
                transfer_certificate_ref: v.transfer_certificate_ref || undefined,
                unfccc_notification_ref: v.unfccc_notification_ref || undefined,
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
                { value: 'submit_aml_kyc', label: 'Submit AML/KYC check' },
                { value: 'pass_aml_kyc', label: 'AML/KYC passed' },
                { value: 'fail_aml_kyc', label: 'AML/KYC failed (reject)' },
                { value: 'submit_registry_review', label: 'Submit to source registry' },
                { value: 'authorize', label: 'Registry authorizes transfer' },
                { value: 'reject_registry', label: 'Registry rejects transfer' },
                { value: 'initiate_transfer', label: 'Initiate transfer (units in flight)' },
                { value: 'confirm_receipt', label: 'Destination registry confirms receipt' },
                { value: 'flag_ca_required', label: 'Flag: corresponding adjustment required' },
                { value: 'notify_ca', label: 'Notify UNFCCC / DNA (CA notified)' },
                { value: 'complete_domestic', label: 'Complete domestic transfer' },
                { value: 'cancel', label: 'Cancel transfer' },
              ],
            },
            { key: 'aml_check_ref', label: 'AML/KYC check reference', required: false },
            { key: 'registry_auth_ref', label: 'Registry authorization reference', required: false },
            { key: 'transfer_certificate_ref', label: 'Transfer certificate reference', required: false },
            { key: 'unfccc_notification_ref', label: 'UNFCCC notification reference', required: false },
            { key: 'reason', label: 'Notes / reason', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  );
}
