import React, { useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { AuditChainBlockTab } from '../audit/AuditChainBlockTab';
import { RegulatorExportPackTab } from '../regulatorExport/RegulatorExportPackTab';
import { ReconciliationAttestationTab } from '../reconciliation/ReconciliationAttestationTab';
import { ControlEnvironmentAuditTab } from '../controlEnvironment/ControlEnvironmentAuditTab';
import { StrateSwiftConnectorTab } from '../strateSwiftConnector/StrateSwiftConnectorTab';
import { SapOracleErpConnectorTab } from '../sapOracleErpConnector/SapOracleErpConnectorTab';
import { GovernmentFilingConnectorTab } from '../governmentFilingConnector/GovernmentFilingConnectorTab';
import { AnomalyDetectionMlTab } from '../anomalyDetectionMl/AnomalyDetectionMlTab';
import RulPredictionMlTab from '../rulPredictionMl/RulPredictionMlTab';
import { FaultFingerprintMlTab } from '../faultFingerprintMl/FaultFingerprintMlTab';
import { api } from '../../lib/api';

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

function Header({ onCreate, label }: { onCreate: () => void; label: string }) {
  return (
    <div className="flex justify-end mb-3">
      <button type="button" onClick={onCreate} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
        + {label}
      </button>
    </div>
  );
}

export function AdminWorkstationPage() {
  return (
    <WorkstationShell
      role="admin"
      eyebrow="Admin · Workstation"
      title="Platform admin workstation"
      subtitle="Tenant lifecycle · Billing runs · Feature-flag overrides. Audit trail for every platform-level change."
      backHref="/admin-platform"
      backLabel="Admin platform"
      tabs={[
        { key: 'tenant_events', label: 'Tenant lifecycle', body: ({ onRefresh }) => <TenantTab onRefresh={onRefresh} /> },
        { key: 'billing', label: 'Billing runs', body: ({ onRefresh }) => <BillingTab onRefresh={onRefresh} /> },
        { key: 'flags', label: 'Flag overrides', body: ({ onRefresh }) => <FlagsTab onRefresh={onRefresh} /> },
        { key: 'settlement_audit', label: 'Settlement audit',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/settlement"
              reconHint="bank_ref,value_date,amount_zar,narrative"
              reconSourceOptions={['bank', 'absa', 'standard_bank', 'fnb', 'nedbank']}
              onChange={onRefresh}
            />
          ),
        },
        { key: 'platform_audit', label: 'Platform audit',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/admin-platform"
              reconHint="billing_run_id,tenant_id,amount_zar,period_end"
              reconSourceOptions={['billing_processor', 'stripe', 'paystack', 'manual']}
              onChange={onRefresh}
            />
          ),
        },
        { key: 'pii_access', label: 'PII access log',
          body: () => <PiiAccessTab />,
        },
        { key: 'audit-chain', label: 'Audit chain (W118)',
          chainKey: 'audit_chain_block',
          body: () => <AuditChainBlockTab />,
        },
        { key: 'regulator-exports', label: 'Regulator exports (W119)',
          chainKey: 'regulator_export_pack',
          body: () => <RegulatorExportPackTab />,
        },
        { key: 'reconciliation-attestation', label: 'Reconciliation attestation (W120)',
          chainKey: 'audit_recon_runs',
          body: () => <ReconciliationAttestationTab />,
        },
        { key: 'control-environment-audit', label: 'Control environment (W121)',
          chainKey: 'control_environment_audit',
          body: () => <ControlEnvironmentAuditTab />,
        },
        { key: 'strate-swift-connectors', label: 'Settlement rails (W124)',
          body: () => <StrateSwiftConnectorTab />,
        },
        { key: 'sap-oracle-erp-connectors', label: 'ERP connectors (W125)',
          body: () => <SapOracleErpConnectorTab />,
        },
        { key: 'government-filing-connectors', label: 'Filing connectors (W126)',
          body: () => <GovernmentFilingConnectorTab />,
        },
        { key: 'anomaly-detection-ml', label: 'Anomaly ML (W127)',
          body: () => <AnomalyDetectionMlTab />,
        },
        { key: 'rul-prediction-ml', label: 'RUL Prediction ML (W128)',
          body: () => <RulPredictionMlTab />,
        },
        { key: 'fault-fingerprint-ml', label: 'Fault Fingerprint ML (W129)',
          body: () => <FaultFingerprintMlTab />,
        },
        { key: 'kyc-verifications', label: 'KYC / FICA (W198)',
          chainKey: 'kyc_verification',
          body: ({ onRefresh }) => <KycVerificationsTab onRefresh={onRefresh} />,
        },
        { key: 'cascade-dlq', label: 'Cascade DLQ',
          body: () => <CascadeDlqTab />,
        },
        { key: 'subscription-billing', label: 'Subscription billing (W228)',
          body: () => <SubscriptionBillingTab />,
        },
      ]}
    />
  );
}

function TenantTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Log tenant event" />
      <ListingTable
        endpoint="/admin-platform/tenant-events"
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin-platform/tenants/${r.tenant_id}`}
        empty={{ title: 'No tenant events yet', description: 'Provisioned / activated / KYC / suspended / offboarded / data-erased events for every tenant will appear here.' }}
        columns={[
          { key: 'tenant_id', label: 'Tenant', render: (r) => <span className="font-mono text-[11px]">{(r.tenant_id || '').slice(0, 12)}…</span> },
          { key: 'event_type', label: 'Event', render: (r) => <Pill tone={r.event_type === 'activated' || r.event_type === 'reactivated' || r.event_type === 'kyc_approved' ? 'good' : r.event_type === 'suspended' || r.event_type === 'offboarded' || r.event_type === 'kyc_rejected' || r.event_type === 'data_erased' ? 'bad' : 'info'}>{r.event_type.replace(/_/g, ' ')}</Pill> },
          { key: 'actor_id', label: 'Actor', render: (r) => <span className="font-mono text-[11px]">{(r.actor_id || '').slice(0, 12)}…</span> },
          { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
          { key: 'reason', label: 'Reason', render: (r) => <span className="block truncate max-w-md" title={r.reason || ''}>{r.reason || '—'}</span> },
        ]}
      />
      {filing && (
        <ActionModal
          title="Log tenant lifecycle event"
          submitLabel="Log"
          fields={[
            { key: 'tenant_id', label: 'Tenant ID', required: true },
            { key: 'event_type', label: 'Event', type: 'select', required: true, options: [
              { value: 'provisioned', label: 'Provisioned' },
              { value: 'activated', label: 'Activated' },
              { value: 'plan_changed', label: 'Plan changed' },
              { value: 'kyc_approved', label: 'KYC approved' },
              { value: 'kyc_rejected', label: 'KYC rejected' },
              { value: 'suspended', label: 'Suspended' },
              { value: 'reactivated', label: 'Reactivated' },
              { value: 'offboarded', label: 'Offboarded' },
              { value: 'data_exported', label: 'Data exported' },
              { value: 'data_erased', label: 'Data erased' },
            ] },
            { key: 'reason', label: 'Reason', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/admin-platform/tenant-events', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function BillingTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Run billing" />
      <ListingTable
        endpoint="/admin-platform/billing-runs"
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin-platform/billing-runs/${r.id}`}
        empty={{ title: 'No billing runs', description: 'Monthly / adhoc / correction billing runs will appear here with outcome and total invoiced.' }}
        columns={[
          { key: 'run_type', label: 'Type', render: (r) => <Pill tone="info">{r.run_type}</Pill> },
          { key: 'period_start', label: 'Period', render: (r) => `${r.period_start} → ${r.period_end}` },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'completed' ? 'good' : r.status === 'failed' ? 'bad' : 'warn'}>{r.status.replace(/_/g, ' ')}</Pill> },
          { key: 'tenants_billed', label: 'Tenants', align: 'right' },
          { key: 'total_zar', label: 'Total', align: 'right', render: (r) => formatZAR(r.total_zar) },
          { key: 'completed_at', label: 'Completed', render: (r) => r.completed_at ? new Date(r.completed_at).toLocaleString() : '—' },
        ]}
      />
      {filing && (
        <ActionModal
          title="Schedule billing run"
          submitLabel="Schedule"
          fields={[
            { key: 'run_type', label: 'Run type', type: 'select', required: true, options: [
              { value: 'monthly', label: 'Monthly' },
              { value: 'adhoc', label: 'Ad hoc' },
              { value: 'correction', label: 'Correction' },
            ] },
            { key: 'period_start', label: 'Period start', type: 'date', required: true },
            { key: 'period_end', label: 'Period end', type: 'date', required: true },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/admin-platform/billing-runs', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function FlagsTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Override flag" />
      <ListingTable
        endpoint="/admin-platform/flag-overrides"
        rowKey={(r) => r.id}
        empty={{ title: 'No flag overrides', description: 'Every feature-flag override (global / tenant / user) is audit-logged here.' }}
        columns={[
          { key: 'flag_key', label: 'Flag', render: (r) => <span className="font-mono text-[11px]">{r.flag_key}</span> },
          { key: 'scope_type', label: 'Scope', render: (r) => <Pill tone="info">{r.scope_type}</Pill> },
          { key: 'previous_value', label: 'Was', render: (r) => r.previous_value || '—' },
          { key: 'new_value', label: 'Now' },
          { key: 'reason', label: 'Reason', render: (r) => <span className="block truncate max-w-md" title={r.reason || ''}>{r.reason || '—'}</span> },
          { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
        ]}
      />
      {filing && (
        <ActionModal
          title="Override feature flag"
          submitLabel="Override"
          fields={[
            { key: 'flag_key', label: 'Flag key', required: true, placeholder: 'e.g. trade.allow_advanced_modifiers' },
            { key: 'scope_type', label: 'Scope', type: 'select', required: true, options: [
              { value: 'global', label: 'Global' },
              { value: 'tenant', label: 'Tenant' },
              { value: 'user', label: 'User' },
            ] },
            { key: 'scope_id', label: 'Scope ID (if tenant/user)' },
            { key: 'previous_value', label: 'Previous value' },
            { key: 'new_value', label: 'New value', required: true },
            { key: 'reason', label: 'Reason', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/admin-platform/flag-overrides', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function PiiAccessTab() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[#dde4ec] bg-white p-4 text-[12px] text-[#3d4756]">
        Every cross-tenant read of personal information is logged here under
        POPIA s.18 (accountability) + s.19 (security safeguards). Each entry
        is also chained on the <span className="font-mono">admin</span> audit
        chain via the cascade hook, so this view is tamper-evident — a
        regulator can verify any row against the chain head.
      </div>
      <ListingTable
        endpoint="/popia/pii-access"
        rowKey={(r) => r.id}
        empty={{ title: 'No PII access logged', description: 'Cross-tenant data access by admins / support / regulators will appear here as it happens.' }}
        columns={[
          { key: 'created_at', label: 'When', render: (r) => new Date(r.created_at).toLocaleString() },
          { key: 'actor_id', label: 'Actor', render: (r) => <span className="font-mono text-[11px]">{(r.actor_id || '').slice(0, 16)}…</span> },
          { key: 'access_type', label: 'Type', render: (r) => <Pill tone={r.access_type === 'impersonation' ? 'bad' : 'info'}>{(r.access_type || '').replace(/_/g, ' ')}</Pill> },
          { key: 'subject_id', label: 'Subject', render: (r) => <span className="font-mono text-[11px]">{(r.subject_id || '').slice(0, 16)}…</span> },
          { key: 'justification', label: 'Justification', render: (r) => <span className="block truncate max-w-md" title={r.justification || ''}>{r.justification || '—'}</span> },
        ]}
      />
    </div>
  );
}

const RISK_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good'> = {
  standard: 'good', medium: 'info', high_risk: 'warn', pep: 'bad',
};
const KYC_STATUS_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good'> = {
  verified: 'good', rejected: 'bad', lapsed: 'bad', suspended: 'warn',
  compliance_review: 'info', enhanced_due_diligence: 'warn',
};

const KYC_ACTIONS = [
  { value: 'submit_documents', label: 'Submit documents' },
  { value: 'request_more_documents', label: 'Request more documents' },
  { value: 'confirm_documents_received', label: 'Confirm documents received' },
  { value: 'run_screening', label: 'Run screening' },
  { value: 'trigger_edd', label: 'Trigger EDD' },
  { value: 'complete_edd', label: 'Complete EDD' },
  { value: 'start_review', label: 'Start review' },
  { value: 'approve_conditionally', label: 'Approve conditionally' },
  { value: 'lift_conditions', label: 'Lift conditions' },
  { value: 'verify', label: 'Verify' },
  { value: 'reject', label: 'Reject' },
  { value: 'suspend', label: 'Suspend' },
  { value: 'reinstate', label: 'Reinstate' },
  { value: 'mark_lapsed', label: 'Mark lapsed' },
];

function KycVerificationsTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  const [actionRow, setActionRow] = useState<Record<string, unknown> | null>(null);

  const createFields: FieldSpec[] = [
    { key: 'participant_id', label: 'Participant ID', required: true, placeholder: 'id_...' },
    { key: 'entity_type', label: 'Entity type', type: 'select', options: [
      { value: 'company', label: 'Company' },
      { value: 'individual', label: 'Individual' },
      { value: 'trust', label: 'Trust' },
      { value: 'fund', label: 'Fund' },
      { value: 'foreign_entity', label: 'Foreign entity' },
    ]},
    { key: 'risk_level', label: 'Risk level', type: 'select', options: [
      { value: 'standard', label: 'Standard (5d SLA)' },
      { value: 'medium', label: 'Medium (10d SLA)' },
      { value: 'high_risk', label: 'High risk (20d SLA)' },
      { value: 'pep', label: 'PEP (30d SLA)' },
    ]},
  ];

  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Create KYC record" />
      {filing && (
        <ActionModal
          title="Open KYC verification"
          fields={createFields}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/kyc-verifications', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
      {actionRow && (
        <ActionModal
          title={`KYC action on ${String(actionRow.id || '').slice(0, 20)}…`}
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: KYC_ACTIONS },
            { key: 'reason', label: 'Reason / note', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setActionRow(null)}
          onSubmit={async (v) => {
            await api.post(`/kyc-verifications/${String(actionRow.id)}/action`, v);
            setActionRow(null); onRefresh();
          }}
        />
      )}
      <ListingTable
        endpoint="/kyc-verifications"
        rowKey={(r) => r.id}
        columns={[
          { key: 'id', label: 'ID', render: (r) => <span className="font-mono text-[11px]">{String(r.id || '').slice(0, 16)}…</span> },
          { key: 'participant_id', label: 'Participant', render: (r) => <span className="font-mono text-[11px]">{String(r.participant_id || '').slice(0, 16)}…</span> },
          { key: 'entity_type', label: 'Type', render: (r) => <Pill tone="info">{String(r.entity_type || '')}</Pill> },
          { key: 'risk_level', label: 'Risk', render: (r) => <Pill tone={RISK_TONE[String(r.risk_level)] ?? 'info'}>{String(r.risk_level || '')}</Pill> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={KYC_STATUS_TONE[String(r.chain_status)] ?? 'info'}>{String(r.chain_status || '').replace(/_/g, ' ')}</Pill> },
          { key: 'sla_deadline', label: 'SLA', render: (r) => r.sla_deadline ? String(r.sla_deadline) : '—' },
          { key: 'sla_breached', label: 'Breach', render: (r) => r.sla_breached ? <Pill tone="bad">BREACH</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'actions', label: '', render: (r) => (
            <button type="button" onClick={() => setActionRow(r)} className="text-[11px] text-[#1a3a5c] underline">Action</button>
          )},
        ]}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Cascade DLQ — the #1 admin AI card ("N items stuck in DLQ") lands here. The
// read view came from monitoring.ts; the retry/resolve endpoints are admin-
// gated on the admin router. Every cascade stage that fails 3× lands a row
// here, so this surface is where an operator drains the failed-automation
// backlog: REPLAY a stage (retry) or mark it handled out-of-band (resolve).
// Inline row actions — no modal hop. Resolve expands a one-row inline form
// (resolved/abandoned + optional note) right under the row it acts on.
// ───────────────────────────────────────────────────────────────────────────

type DlqRow = {
  id: string;
  event: string;
  entity_type: string;
  entity_id: string;
  stage: string;
  error_message: string;
  attempt_count: number;
  created_at: string;
  last_attempt_at: string;
};

const STAGE_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good'> = {
  audit: 'bad', commercial: 'warn', analytics: 'info',
  registry: 'info', notifications: 'info', webhooks: 'warn', special: 'warn',
};

function CascadeDlqTab() {
  const [rows, setRows] = useState<DlqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // Per-row transient state: the id currently mid-request, the last replay
  // result, and the id whose inline resolve form is expanded.
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveStatus, setResolveStatus] = useState<'abandoned' | 'resolved'>('abandoned');
  const [resolveNote, setResolveNote] = useState('');

  const load = React.useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get('/admin/monitoring/cascade-dlq?status=pending&limit=200');
      setRows((res.data?.data as DlqRow[]) || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  async function retry(id: string) {
    setBusy(id);
    setResult((m) => { const n = { ...m }; delete n[id]; return n; });
    try {
      const res = await api.post(`/admin/cascade-dlq/${id}/retry`);
      const ok = !!res.data?.ok;
      if (ok) {
        // Resolved server-side — drop it from the pending list immediately.
        setRows((rs) => rs.filter((r) => r.id !== id));
      } else {
        setResult((m) => ({ ...m, [id]: res.data?.error || 'Replay failed — left pending' }));
        await load();
      }
    } catch (e: unknown) {
      setResult((m) => ({ ...m, [id]: e instanceof Error ? e.message : 'Retry request failed' }));
    } finally {
      setBusy(null);
    }
  }

  function openResolve(id: string) {
    setResolving(id);
    setResolveStatus('abandoned');
    setResolveNote('');
  }

  async function submitResolve(id: string) {
    setBusy(id);
    try {
      await api.post(`/admin/cascade-dlq/${id}/resolve`, {
        status: resolveStatus,
        note: resolveNote.trim() || undefined,
      });
      setResolving(null);
      setRows((rs) => rs.filter((r) => r.id !== id));
    } catch (e: unknown) {
      setResult((m) => ({ ...m, [id]: e instanceof Error ? e.message : 'Resolve request failed' }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[12px] leading-relaxed text-[#3d4756] max-w-2xl">
          Cascade stages that fail three retries dead-letter here. <strong>Retry</strong> replays
          the failed stage (audit / notifications / webhooks / registry / analytics / commercial);
          on success the row clears. <strong>Resolve</strong> marks a row handled out-of-band —
          choose <em>abandoned</em> (won't replay) or <em>resolved</em>, with an optional note for
          the audit trail. Both actions are admin-audited.
        </p>
        <button type="button"
          onClick={() => void load()}
          className="shrink-0 h-8 px-3 rounded-md border border-[#dde4ec] bg-white text-[12px] font-medium text-[#3d4756] hover:bg-[#f8fafc]"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[#dde4ec] bg-white p-6 text-[12px] text-[#6b7685]">Loading DLQ…</div>
      ) : err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[12px] text-red-700">{err}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[#dde4ec] bg-[#f8fafc] p-6 text-center">
          <div className="text-[13px] font-semibold text-[#0f1c2e]">DLQ is clear</div>
          <div className="text-[12px] text-[#6b7685] mt-1">No failed cascade stages pending. Nothing to drain.</div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#dde4ec] bg-white overflow-x-auto text-[#0f1c2e]">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead className="bg-[#f8fafc] text-left text-[10px] uppercase tracking-wide text-[#6b7685]">
              <tr>
                <th className="px-4 py-2">Event</th>
                <th className="px-4 py-2">Stage</th>
                <th className="px-4 py-2">Entity</th>
                <th className="px-4 py-2">Error</th>
                <th className="px-4 py-2 text-right">Attempts</th>
                <th className="px-4 py-2">First seen</th>
                <th className="px-4 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rowBusy = busy === r.id;
                const isResolving = resolving === r.id;
                return (
                  <React.Fragment key={r.id}>
                    <tr className="border-t border-[#e5ebf2] align-top">
                      <td className="px-4 py-2 font-mono text-[11px]">{r.event}</td>
                      <td className="px-4 py-2"><Pill tone={STAGE_TONE[r.stage] ?? 'info'}>{r.stage}</Pill></td>
                      <td className="px-4 py-2 text-[11px] text-[#3d4756]">
                        {r.entity_type}<span className="text-[#9aa6b4]"> · </span>
                        <span className="font-mono">{(r.entity_id || '').slice(0, 14)}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="block truncate max-w-[260px] text-[11px] text-[#b4453a]" title={r.error_message}>
                          {r.error_message || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-[12px]">{r.attempt_count}</td>
                      <td className="px-4 py-2 text-[11px] text-[#6b7685] whitespace-nowrap">
                        {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                          <button type="button"
                            onClick={() => void retry(r.id)}
                            disabled={rowBusy}
                            className="text-[11px] font-semibold text-[#1a3a5c] hover:underline disabled:opacity-40"
                          >
                            {rowBusy && !isResolving ? 'Retrying…' : 'Retry'}
                          </button>
                          <button type="button"
                            onClick={() => (isResolving ? setResolving(null) : openResolve(r.id))}
                            disabled={rowBusy}
                            className="text-[11px] font-medium text-[#6b7685] hover:text-[#3d4756] hover:underline disabled:opacity-40"
                          >
                            {isResolving ? 'Cancel' : 'Resolve'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {result[r.id] && !isResolving && (
                      <tr className="border-t border-[#e5ebf2] bg-[#fdf6f5]">
                        <td colSpan={7} className="px-4 py-2 text-[11px] text-[#b4453a]">{result[r.id]}</td>
                      </tr>
                    )}
                    {isResolving && (
                      <tr className="border-t border-[#e5ebf2] bg-[#f8fafc]">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-[11px] uppercase tracking-wide text-[#6b7685]">Mark</span>
                            <div className="inline-flex rounded-md border border-[#dde4ec] overflow-hidden">
                              {(['abandoned', 'resolved'] as const).map((s) => (
                                <button type="button"
                                  key={s}
                                  onClick={() => setResolveStatus(s)}
                                  className={`px-3 h-8 text-[11px] font-medium ${resolveStatus === s ? 'bg-[#1a3a5c] text-white' : 'bg-white text-[#3d4756] hover:bg-[#eef2f7]'}`}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                            <input
                              value={resolveNote}
                              onChange={(e) => setResolveNote(e.target.value)}
                              placeholder="Optional note for the audit trail"
                              className="flex-1 min-w-[200px] h-8 px-2 rounded-md border border-[#dde4ec] bg-white text-[12px] text-[#0f1c2e] placeholder:text-[#9aa6b4]"
                            />
                            <button type="button"
                              onClick={() => void submitResolve(r.id)}
                              disabled={rowBusy}
                              className="h-8 px-3 rounded-md bg-[#1a3a5c] text-white text-[11px] font-semibold disabled:opacity-40"
                            >
                              {rowBusy ? 'Saving…' : 'Confirm'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── W228 Platform Subscription Billing oversight ─────────────────────────────
type SubInvoice = {
  id: string;
  participant_id: string;
  billing_period: string;
  subscription_tier: 'starter' | 'professional' | 'enterprise';
  net_payable_zar: number;
  chain_status: string;
  hours_until_sla: number | null;
  sla_breached: boolean | number;
  is_terminal: boolean;
  created_at: string;
};
type SubStats = {
  total: number;
  paid: number;
  overdue: number;
  suspended: number;
  arr_at_risk: number;
};

// Mirror of INVOICE_VALID_TRANSITIONS in src/utils/subscription-billing-spec.ts.
// Kept inline so the SPA does not import backend spec; keep in sync with W228.
const SUB_TRANSITIONS: Record<string, string[]> = {
  draft:           ['issue', 'cancel'],
  issued:          ['acknowledge', 'cancel'],
  payment_pending: ['record_payment', 'mark_overdue', 'waive', 'cancel'],
  paid:            [],
  overdue:         ['record_payment', 'send_dunning_1', 'waive', 'write_off'],
  dunning_1:       ['record_payment', 'send_dunning_2', 'waive', 'write_off'],
  dunning_2:       ['record_payment', 'suspend_account', 'waive', 'write_off'],
  suspended:       ['reactivate', 'write_off'],
  cancelled:       [],
  waived:          [],
  written_off:     [],
};
const SUB_ACTION_LABELS: Record<string, string> = {
  issue: 'Issue',
  acknowledge: 'Acknowledge',
  record_payment: 'Record payment',
  mark_overdue: 'Mark overdue',
  send_dunning_1: 'Send dunning 1',
  send_dunning_2: 'Send dunning 2',
  suspend_account: 'Suspend',
  reactivate: 'Reactivate',
  waive: 'Waive',
  write_off: 'Write off',
  cancel: 'Cancel',
};

function zar(n: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n || 0);
}
function subStatusTone(status: string): 'good' | 'bad' | 'info' | 'neutral' {
  if (status === 'paid') return 'good';
  if (['suspended', 'written_off', 'overdue', 'dunning_1', 'dunning_2'].includes(status)) return 'bad';
  if (['cancelled', 'waived'].includes(status)) return 'neutral';
  return 'info';
}

function SubscriptionBillingTab() {
  const [rows, setRows] = useState<SubInvoice[]>([]);
  const [stats, setStats] = useState<SubStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);

  const load = React.useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get('/subscription/billing?per_page=200');
      setRows((res.data?.data?.invoices as SubInvoice[]) || []);
      setStats((res.data?.data?.stats as SubStats) || null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const act = React.useCallback(async (id: string, action: string) => {
    setBusy(id);
    setRowErr((m) => { const n = { ...m }; delete n[id]; return n; });
    try {
      await api.post(`/subscription/billing/${id}/action`, { action });
      await load();
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.error || (e instanceof Error ? e.message : 'action failed');
      setRowErr((m) => ({ ...m, [id]: msg }));
    } finally {
      setBusy(null);
    }
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[12px] leading-relaxed text-[#3d4756] max-w-2xl">
          Monthly SaaS invoices run as a W228 chain: draft to issued to payment_pending to paid,
          with a cron dunning ladder (overdue, dunning_1, dunning_2, suspended). Admin exits are
          waive, write off, cancel and reactivate. Actions below are limited to those valid from
          each row's current state.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button"
            onClick={() => setGenerating(true)}
            className="h-8 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold hover:bg-[#16324f]"
          >
            Generate invoice
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
          <span><span className="text-[#6b7685]">Overdue</span> <span className="tabular-nums font-medium text-[#b4453a]">{stats.overdue}</span></span>
          <span><span className="text-[#6b7685]">Suspended</span> <span className="tabular-nums font-medium text-[#b4453a]">{stats.suspended}</span></span>
          <span><span className="text-[#6b7685]">ARR at risk</span> <span className="tabular-nums font-medium text-[#0f1c2e]">{zar(stats.arr_at_risk)}</span></span>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-[#dde4ec] bg-white p-6 text-[12px] text-[#6b7685]">Loading invoices…</div>
      ) : err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[12px] text-red-700">{err}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[#dde4ec] bg-[#f8fafc] p-6 text-center">
          <div className="text-[13px] font-semibold text-[#0f1c2e]">No invoices yet</div>
          <div className="text-[12px] text-[#6b7685] mt-1">Generate a monthly subscription invoice to start the billing chain.</div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#dde4ec] bg-white overflow-x-auto text-[#0f1c2e]">
          <table className="w-full text-[13px] min-w-[860px]">
            <thead className="bg-[#f8fafc] text-left text-[10px] uppercase tracking-wide text-[#6b7685]">
              <tr>
                <th className="px-4 py-2">Participant</th>
                <th className="px-4 py-2">Period</th>
                <th className="px-4 py-2">Tier</th>
                <th className="px-4 py-2 text-right">Net payable</th>
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
                const actions = SUB_TRANSITIONS[r.chain_status] ?? [];
                return (
                  <React.Fragment key={r.id}>
                    <tr className="border-t border-[#e5ebf2] align-top">
                      <td className="px-4 py-2 font-mono text-[11px]" title={r.participant_id}>{(r.participant_id || '').slice(0, 14)}</td>
                      <td className="px-4 py-2 text-[12px] tabular-nums">{r.billing_period}</td>
                      <td className="px-4 py-2"><Pill tone="info">{r.subscription_tier}</Pill></td>
                      <td className="px-4 py-2 text-right tabular-nums text-[12px]">{zar(r.net_payable_zar)}</td>
                      <td className="px-4 py-2"><Pill tone={subStatusTone(r.chain_status)}>{r.chain_status.replace(/_/g, ' ')}</Pill></td>
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
                                onClick={() => void act(r.id, a)}
                                disabled={rowBusy}
                                className={`text-[11px] font-medium hover:underline disabled:opacity-40 ${a === 'write_off' || a === 'suspend_account' || a === 'cancel' ? 'text-[#b4453a]' : 'text-[#1a3a5c]'}`}
                              >
                                {SUB_ACTION_LABELS[a] ?? a}
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

      {generating && (
        <ActionModal
          title="Generate subscription invoice"
          submitLabel="Generate"
          fields={[
            { key: 'participant_id', label: 'Participant ID', required: true },
            { key: 'billing_period', label: 'Billing period (YYYY-MM)', required: true },
            { key: 'subscription_tier', label: 'Tier', type: 'select', required: true, options: [
              { value: 'starter', label: 'Starter' },
              { value: 'professional', label: 'Professional' },
              { value: 'enterprise', label: 'Enterprise' },
            ] },
          ] as FieldSpec[]}
          onClose={() => setGenerating(false)}
          onSubmit={async (v) => {
            try {
              await api.post('/subscription/billing/generate', v);
            } catch (e: unknown) {
              // Surface the server's reason (e.g. 409 "Invoice already exists
              // for 2026-06") instead of the generic axios status message.
              throw new Error((e as any)?.response?.data?.error || 'Failed to generate invoice');
            }
            setGenerating(false);
            await load();
          }}
        />
      )}
    </div>
  );
}
