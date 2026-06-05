import React, { useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import { api } from '../../lib/api';
import { InboxTab } from '../regulator/InboxTab';
import { NoticesTab } from '../regulator/NoticesTab';
import { EnforcementActionChainTab } from '../regulator/EnforcementActionChainTab';
import { EnforcementActionS35ChainTab } from '../regulator/EnforcementActionS35ChainTab';
import { EsgDisclosureChainTab } from '../carbon/EsgDisclosureChainTab';
import { RegulatorExportPackTab } from '../regulatorExport/RegulatorExportPackTab';
import { ReconciliationAttestationTab } from '../reconciliation/ReconciliationAttestationTab';
import { ControlEnvironmentAuditTab } from '../controlEnvironment/ControlEnvironmentAuditTab';
import { GovernmentFilingConnectorTab } from '../governmentFilingConnector/GovernmentFilingConnectorTab';
import StageGateTab from '../stageGate/StageGateTab';

function Header({ onCreate, label }: { onCreate: () => void; label: string }) {
  return (
    <div className="flex justify-end mb-3">
      <button onClick={onCreate} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
        + {label}
      </button>
    </div>
  );
}

const LICENCE_TRANSITIONS = [
  { value: 'pending_hearing', label: 'Schedule hearing' },
  { value: 'decided', label: 'Decide' },
  { value: 'executed', label: 'Execute' },
  { value: 'appealed', label: 'Appeal' },
  { value: 'reversed', label: 'Reverse' },
];

export function RegulatorWorkstationPage() {
  const kpis = useWorkstationKpis('regulator');
  const alertsPanel = useWorkstationPanel('Surveillance alerts', '/regulator/surveillance', (r) => ({
    id: r.id,
    lead: <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${r.severity === 'critical' ? 'bg-[#fbe9e6] text-[#c0392b]' : 'bg-[#fff4d6] text-[#a06200]'}`}>{r.severity || r.status || '—'}</span>,
    text: <span>{r.rule_label || r.title || r.rule_name} · {r.market || r.scope || ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.opened_at ? new Date(r.opened_at).toLocaleDateString('en-ZA') : ''}</span>,
  }), 'No active surveillance alerts.');
  const licencesPanel = useWorkstationPanel('Open licence actions', '/regulator/licences', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[#dbecfb] text-[#1a3a5c]">{r.status || 'pending'}</span>,
    text: <span>{r.licence_type} · {r.licensee_name || r.applicant}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.due_date ? new Date(r.due_date).toLocaleDateString('en-ZA') : ''}</span>,
  }), 'No open licence actions.');
  const panels = [alertsPanel, licencesPanel].filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <WorkstationShell
      role="regulator"
      eyebrow="Regulator · Workstation"
      title="Regulator workstation"
      subtitle="Surveillance triage · Licence action workflow · Enforcement case events."
      backHref="/regulator-suite"
      backLabel="Regulator suite"
      kpis={kpis}
      panels={panels}
      tabs={[
        { key: 'inbox', label: 'Inbox', body: () => <InboxTab /> },
        { key: 'notices', label: 'Compliance notices', body: () => <NoticesTab /> },
        { key: 'surveillance', label: 'Surveillance triage', body: ({ onRefresh }) => <SurveillanceTab onRefresh={onRefresh} /> },
        { key: 'licences', label: 'Licence actions', body: ({ onRefresh }) => <LicencesTab onRefresh={onRefresh} /> },
        { key: 'enforcement', label: 'Enforcement events', body: ({ onRefresh }) => <EnforcementTab onRefresh={onRefresh} /> },
        { key: 'enforcement-action', label: 'Enforcement actions (ERA s35)', body: () => <EnforcementActionChainTab /> },
        { key: 'enforcement-action-s35', label: 'Enforcement actions (s35 lifecycle)', body: () => <EnforcementActionS35ChainTab /> },
        { key: 'esg-disclosure', label: 'ESG disclosure (read-only)', body: () => <EsgDisclosureChainTab /> },
        { key: 'regulator-exports', label: 'Incoming exports (W119)',
          body: () => <RegulatorExportPackTab regulatorView />,
        },
        { key: 'icfr-attestations', label: 'ICFR attestations (W120)',
          body: () => <ReconciliationAttestationTab regulatorView />,
        },
        { key: 'external-controls', label: 'External controls (W121)',
          body: () => <ControlEnvironmentAuditTab regulatorView />,
        },
        { key: 'government-filing-connectors', label: 'Filing connectors (W126)',
          body: () => <GovernmentFilingConnectorTab />,
        },
        { key: 'stage-gates', label: 'Stage gates (W131)',
          body: () => <StageGateTab readOnly />,
        },
        { key: 'public-consultations', label: 'Public consultations (W209)',
          body: ({ onRefresh }) => <PublicConsultationTab onRefresh={onRefresh} />,
        },
        { key: 'audit', label: 'Audit & compliance',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/regulator"
              reconHint="licence_number,licensee_name,status,capacity_mw"
              reconSourceOptions={['dmre', 'nersa_internal', 'eskom']}
              onChange={onRefresh}
            />
          ),
        },
      ]}
    />
  );
}

function SurveillanceTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Triage alert" />
      <ListingTable
        endpoint="/regulator/surveillance/triage"
        rowKey={(r) => r.id}
        empty={{ title: 'No triage decisions yet', description: 'Surveillance alert triage decisions (false positive / monitor / escalate / contact party / close) will appear here.' }}
        columns={[
          { key: 'alert_id', label: 'Alert', render: (r) => <span className="font-mono text-[11px]">{(r.alert_id || '').slice(0, 12)}…</span> },
          { key: 'decision', label: 'Decision', render: (r) => <Pill tone={r.decision === 'false_positive' || r.decision === 'close_no_action' ? 'good' : r.decision === 'escalate_to_enforcement' ? 'bad' : 'warn'}>{r.decision.replace(/_/g, ' ')}</Pill> },
          { key: 'rationale', label: 'Rationale', render: (r) => <span className="block truncate max-w-md" title={r.rationale || ''}>{r.rationale || '—'}</span> },
          { key: 'triaged_at', label: 'Triaged', render: (r) => new Date(r.triaged_at).toLocaleString() },
          { key: 'next_review_at', label: 'Review by', render: (r) => r.next_review_at ? new Date(r.next_review_at).toLocaleDateString() : '—' },
        ]}
      />
      {filing && (
        <ActionModal
          title="Triage surveillance alert"
          submitLabel="Save triage"
          fields={[
            { key: 'alert_id', label: 'Alert ID', required: true },
            { key: 'decision', label: 'Decision', type: 'select', required: true, options: [
              { value: 'false_positive', label: 'False positive' },
              { value: 'monitor', label: 'Monitor' },
              { value: 'contact_party', label: 'Contact party' },
              { value: 'escalate_to_enforcement', label: 'Escalate to enforcement' },
              { value: 'close_no_action', label: 'Close — no action' },
            ] },
            { key: 'rationale', label: 'Rationale', type: 'textarea' },
            { key: 'enforcement_case_id', label: 'Enforcement case ID (if escalating)' },
            { key: 'next_review_at', label: 'Next review at', type: 'date' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/regulator/surveillance/triage', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function LicencesTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  const [transitioning, setTransitioning] = useState<any | null>(null);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="File licence action" />
      <ListingTable
        endpoint="/regulator/licence-actions"
        rowKey={(r) => r.id}
        rowHref={(r) => `/regulator/licence-actions/${r.id}`}
        empty={{ title: 'No licence actions yet', description: 'Grant, vary, suspend, revoke, reinstate and renew workflows will appear here.' }}
        columns={[
          { key: 'action_type', label: 'Action', render: (r) => <Pill tone={r.action_type === 'grant' || r.action_type === 'renew' || r.action_type === 'reinstate' ? 'good' : r.action_type === 'revoke' || r.action_type === 'suspend' ? 'bad' : 'warn'}>{r.action_type}</Pill> },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'executed' || r.status === 'decided' ? 'good' : r.status === 'reversed' ? 'bad' : 'info'}>{r.status.replace(/_/g, ' ')}</Pill> },
          { key: 'licence_id', label: 'Licence', render: (r) => r.licence_id ? <span className="font-mono text-[11px]">{r.licence_id.slice(0, 12)}…</span> : '—' },
          { key: 'application_id', label: 'Application', render: (r) => r.application_id ? <span className="font-mono text-[11px]">{r.application_id.slice(0, 12)}…</span> : '—' },
          { key: 'initiated_at', label: 'Initiated', render: (r) => new Date(r.initiated_at).toLocaleDateString() },
          { key: 'decided_at', label: 'Decided', render: (r) => r.decided_at ? new Date(r.decided_at).toLocaleDateString() : '—' },
          { key: '_actions', label: '', render: (r) => (
            r.status !== 'executed' && r.status !== 'reversed' && (
              <button onClick={() => setTransitioning(r)} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">Transition</button>
            )
          ) },
        ]}
      />
      {filing && (
        <ActionModal
          title="File licence action"
          submitLabel="File"
          fields={[
            { key: 'action_type', label: 'Action type', type: 'select', required: true, options: [
              { value: 'grant', label: 'Grant' },
              { value: 'vary', label: 'Vary' },
              { value: 'suspend', label: 'Suspend' },
              { value: 'revoke', label: 'Revoke' },
              { value: 'reinstate', label: 'Reinstate' },
              { value: 'renew', label: 'Renew' },
            ] },
            { key: 'licence_id', label: 'Licence ID' },
            { key: 'application_id', label: 'Application ID' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/regulator/licence-actions', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
      {transitioning && (
        <ActionModal
          title={`Licence action transition · current: ${transitioning.status}`}
          submitLabel="Transition"
          fields={[
            { key: 'to', label: 'To', type: 'select', required: true, options: LICENCE_TRANSITIONS },
            { key: 'rationale', label: 'Decision rationale', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setTransitioning(null)}
          onSubmit={async (v) => {
            await api.post(`/regulator/licence-actions/${transitioning.id}/transition`, v);
            setTransitioning(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function EnforcementTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Log enforcement event" />
      <ListingTable
        endpoint="/regulator/enforcement-events"
        rowKey={(r) => r.id}
        empty={{ title: 'No enforcement events', description: 'Case opened / evidence filed / hearings / findings / appeals events will appear here.' }}
        columns={[
          { key: 'case_id', label: 'Case', render: (r) => <span className="font-mono text-[11px]">{(r.case_id || '').slice(0, 12)}…</span> },
          { key: 'event_type', label: 'Event', render: (r) => <Pill tone={r.event_type === 'closed' ? 'good' : r.event_type === 'finding_issued' || r.event_type === 'appeal_lodged' ? 'bad' : 'info'}>{r.event_type.replace(/_/g, ' ')}</Pill> },
          { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
          { key: 'notes', label: 'Notes', render: (r) => <span className="block truncate max-w-md" title={r.notes || ''}>{r.notes || '—'}</span> },
        ]}
      />
      {filing && (
        <ActionModal
          title="Log enforcement case event"
          submitLabel="Log"
          fields={[
            { key: 'case_id', label: 'Case ID', required: true },
            { key: 'event_type', label: 'Event type', type: 'select', required: true, options: [
              { value: 'opened', label: 'Opened' },
              { value: 'evidence_filed', label: 'Evidence filed' },
              { value: 'hearing_scheduled', label: 'Hearing scheduled' },
              { value: 'hearing_held', label: 'Hearing held' },
              { value: 'finding_issued', label: 'Finding issued' },
              { value: 'appeal_lodged', label: 'Appeal lodged' },
              { value: 'appeal_decided', label: 'Appeal decided' },
              { value: 'closed', label: 'Closed' },
            ] },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/regulator/enforcement-events', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

// ─── W209: Public Consultation Tab ────────────────────────────────────────────
const PC_TIER_TONE: Record<string, 'bad' | 'warn' | 'neutral' | 'info'> = {
  emergency: 'bad', national: 'bad', significant: 'warn', routine: 'info',
};

function PublicConsultationTab({ onRefresh }: { onRefresh: () => void }) {
  const [modal, setModal] = useState<null | { type: 'create' } | { type: 'action'; id: string; currentStatus: string; tier: string; title: string }>(null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setModal({ type: 'create' })} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
          + New consultation
        </button>
      </div>

      <ListingTable
        endpoint="/public-consultations"
        rowKey={(r) => r.id}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status, tier: r.consultation_tier, title: r.title })}
        empty={{ title: 'No public consultations', description: 'NERSA/DMRE public participation processes will appear here.' }}
        columns={[
          { key: 'title', label: 'Title', render: (r) => <span className="block truncate max-w-xs font-medium" title={r.title as string}>{r.title as string}</span> },
          { key: 'consultation_type', label: 'Type', render: (r) => <span className="text-[11px]">{String(r.consultation_type).replace(/_/g, ' ')}</span> },
          { key: 'consultation_tier', label: 'Tier', render: (r) => <Pill tone={PC_TIER_TONE[r.consultation_tier as string] ?? 'neutral'}>{String(r.consultation_tier)}</Pill> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['closed'].includes(r.chain_status as string) ? 'good' : ['appealed', 'withdrawn'].includes(r.chain_status as string) ? 'bad' : 'warn'}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'created_at', label: 'Created', render: (r) => new Date(r.created_at as string).toLocaleDateString() },
        ]}
      />

      {modal?.type === 'create' && (
        <ActionModal
          title="New public consultation"
          submitLabel="Create"
          fields={[
            { key: 'title', label: 'Title', required: true },
            { key: 'consultation_type', label: 'Type', type: 'select', required: true, options: [
              { value: 'tariff_determination', label: 'Tariff determination' },
              { value: 'licence_application', label: 'Licence application' },
              { value: 'licence_amendment', label: 'Licence amendment' },
              { value: 'code_revision', label: 'Code revision' },
              { value: 'policy_review', label: 'Policy review' },
              { value: 'emergency_determination', label: 'Emergency determination' },
            ]} as FieldSpec,
            { key: 'consultation_tier', label: 'Tier', type: 'select', required: true, options: [
              { value: 'emergency', label: 'Emergency (7d SLA)' },
              { value: 'routine', label: 'Routine (30d SLA)' },
              { value: 'significant', label: 'Significant (60d SLA)' },
              { value: 'national', label: 'National (90d SLA)' },
            ]} as FieldSpec,
            { key: 'description', label: 'Description', type: 'textarea' },
            { key: 'reference_number', label: 'NERSA reference number' },
            { key: 'licence_ref', label: 'Licence reference (optional)' },
            { key: 'tariff_ref', label: 'Tariff determination reference (optional)' },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            await api.post('/public-consultations', v);
            setModal(null); onRefresh();
          }}
        />
      )}

      {modal?.type === 'action' && (
        <ActionModal
          title={`Consultation — ${modal.tier} — ${String(modal.title).slice(0, 50)}${String(modal.title).length > 50 ? '…' : ''}`}
          submitLabel="Submit action"
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: [
              { value: 'publish_notice', label: 'Publish notice' },
              { value: 'open_objection_period', label: 'Open objection period' },
              { value: 'close_submissions', label: 'Close submissions' },
              { value: 'start_analysis', label: 'Start analysis' },
              { value: 'draft_determination', label: 'Draft determination' },
              { value: 'issue_determination', label: 'Issue determination' },
              { value: 'lodge_appeal', label: 'Lodge appeal (PAJA §6)' },
              { value: 'resolve_appeal', label: 'Resolve appeal' },
              { value: 'close_consultation', label: 'Close consultation' },
              { value: 'withdraw', label: 'Withdraw' },
            ]} as FieldSpec,
            { key: 'gazette_number', label: 'Gazette number' },
            { key: 'comment_deadline', label: 'Comment deadline', type: 'date' },
            { key: 'objection_deadline', label: 'Objection deadline', type: 'date' },
            { key: 'submissions_count', label: 'Submissions received', type: 'number' },
            { key: 'determination_summary', label: 'Determination summary', type: 'textarea' },
            { key: 'determination_ref', label: 'Determination reference' },
            { key: 'appeal_grounds', label: 'Appeal grounds' },
            { key: 'appeal_outcome', label: 'Appeal outcome', type: 'select', options: [
              { value: 'upheld', label: 'Upheld' },
              { value: 'dismissed', label: 'Dismissed' },
              { value: 'settled', label: 'Settled' },
            ]} as FieldSpec,
            { key: 'reason', label: 'Internal notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            await api.post(`/public-consultations/${modal.id}/action`, {
              ...v,
              submissions_count: v.submissions_count ? Number(v.submissions_count) : undefined,
            });
            setModal(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}
