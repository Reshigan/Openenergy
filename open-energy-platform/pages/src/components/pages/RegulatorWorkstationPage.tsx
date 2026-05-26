import React, { useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import { api } from '../../lib/api';

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
        { key: 'surveillance', label: 'Surveillance triage', body: ({ onRefresh }) => <SurveillanceTab onRefresh={onRefresh} /> },
        { key: 'licences', label: 'Licence actions', body: ({ onRefresh }) => <LicencesTab onRefresh={onRefresh} /> },
        { key: 'enforcement', label: 'Enforcement events', body: ({ onRefresh }) => <EnforcementTab onRefresh={onRefresh} /> },
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
