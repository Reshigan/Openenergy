import React, { useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { SupportTicketChainTab } from '../support/SupportTicketChainTab';
import { ServiceContractChainTab } from '../service-contract/ServiceContractChainTab';
import { ServiceRequestChainTab } from '../support/ServiceRequestChainTab';
import { OemFcoChainTab } from '../oem-fco/OemFcoChainTab';
import { MqttOpcuaConnectorTab } from '../mqttOpcuaConnector/MqttOpcuaConnectorTab';
import { AnomalyDetectionMlTab } from '../anomalyDetectionMl/AnomalyDetectionMlTab';
import RulPredictionMlTab from '../rulPredictionMl/RulPredictionMlTab';
import { FaultFingerprintMlTab } from '../faultFingerprintMl/FaultFingerprintMlTab';
import { api } from '../../lib/api';
import { X } from 'lucide-react';
import { ReportPanel, type ReportConfig } from '../launch/ReportPanel';
import type { TourDef } from '../launch/ProductTour';

const SUPPORT_REPORTS: ReportConfig[] = [
  {
    title: 'SLA Performance Reports',
    endpoint: '/api/support/sla-reports',
    columns: [
      { key: 'report_ref', label: 'Reference' },
      { key: 'report_period', label: 'Period' },
      { key: 'p1_adherence_pct', label: 'P1 %', numeric: true },
      { key: 'p2_adherence_pct', label: 'P2 %', numeric: true },
      { key: 'chain_status', label: 'Status' },
    ],
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC — SLA Performance Report',
  },
  {
    title: 'CSAT Records',
    endpoint: '/api/support/csat',
    columns: [
      { key: 'ticket_ref', label: 'Ticket' },
      { key: 'csat_score', label: 'CSAT Score', numeric: true },
      { key: 'priority', label: 'Priority' },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Filed' },
    ],
    filters: [{ key: 'priority', label: 'Priority', type: 'select', options: [{ value: 'P1', label: 'P1 Critical' }, { value: 'P2', label: 'P2 High' }, { value: 'P3', label: 'P3 Medium' }, { value: 'P4', label: 'P4 Low' }] }],
    pivotGroupBy: 'priority',
    mailSubject: 'CEC — CSAT Records Report',
  },
  {
    title: 'Problem Records',
    endpoint: '/api/support/problem-records',
    columns: [
      { key: 'problem_ref', label: 'Reference' },
      { key: 'description', label: 'Description' },
      { key: 'impact_tier', label: 'Impact' },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Opened' },
    ],
    pivotGroupBy: 'impact_tier',
    mailSubject: 'CEC — Problem Records Report',
  },
];


const SUPPORT_TOUR: TourDef = {
  id: 'support-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'Support workstation', body: 'ITIL 4 aligned support hub — incident management, problem investigation, change enablement, firmware patches, warranty recovery, and SLA reporting.', placement: 'bottom' },
    { target: 'kpi-row', title: 'SLA KPIs', body: 'Open P1/P2 incidents, SLA compliance rate, problems under investigation, and RFCs awaiting CAB. P1 SLA breaches are platform-level emergencies.', placement: 'bottom' },
    { target: 'tab-nav', title: 'ITIL workflow tabs', body: 'Incidents, problems, changes, security remediations, spare parts, and warranty recovery — each backed by a live ITIL-4 state machine.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start', body: 'Raise a P1–P4 ticket, open a problem investigation, or submit an RFC — all with ITIL guidance and SLA timer information at each step.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'See all support actions: CSAT management, SLA performance reporting, vendor escalations, and spare parts provisioning.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'Tenant-reported incidents, security vulnerability alerts, and OEM warranty claims arrive here for triage.', placement: 'left' },
  ],
};

export function SupportWorkstationPage() {
  const [filing, setFiling] = useState(false);
  const [transitioning, setTransitioning] = useState<any | null>(null);
  const [escalating, setEscalating] = useState<any | null>(null);
  const [loggingAccess, setLoggingAccess] = useState(false);
  return (
    <>
      <WorkstationShell
        role="support"
        eyebrow="Support · Workstation"
        title="Support workstation"
        subtitle="Tickets · Escalations · Cross-tenant access audit. All the support tooling — no external ticketing system needed."
        backHref="/support"
        backLabel="Support console"
        tour={SUPPORT_TOUR}
        tabs={[
          {
            key: 'tickets',
            label: 'Tickets',
            body: ({ onRefresh }) => (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button type="button" onClick={() => setFiling(true)} className="h-9 px-3 rounded-md bg-[oklch(0.46_0.16_55)] text-white text-[12px] font-semibold">
                    + File ticket
                  </button>
                </div>
                <ListingTable
                  endpoint="/support/tickets"
                  rowKey={(r) => r.id}
                  rowHref={(r) => `/support/tickets/${r.id}`}
                  empty={{ title: 'No tickets', description: 'Tickets reported by users (or filed on their behalf) will appear here.' }}
                  columns={[
                    { key: 'ticket_number', label: 'Ticket', render: (r) => <span className="font-mono text-[11px]">{r.ticket_number}</span> },
                    { key: 'subject', label: 'Subject', render: (r) => <span className="block truncate max-w-md" title={r.subject}>{r.subject}</span> },
                    { key: 'category', label: 'Category', render: (r) => <Pill tone="info">{r.category}</Pill> },
                    { key: 'priority', label: 'Priority', render: (r) => <Pill tone={r.priority === 'urgent' ? 'bad' : r.priority === 'high' ? 'warn' : 'neutral'}>{r.priority}</Pill> },
                    { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'resolved' || r.status === 'closed' ? 'good' : r.status === 'open' ? 'bad' : 'warn'}>{r.status.replace(/_/g, ' ')}</Pill> },
                    { key: 'created_at', label: 'Filed', render: (r) => new Date(r.created_at).toLocaleString() },
                    { key: '_actions', label: '', render: (r) => (
                      (r.status !== 'resolved' && r.status !== 'closed') ? (
                        <div className="flex gap-1">
                          <button type="button" onClick={() => setTransitioning(r)} className="px-2 py-1 text-[11px] bg-[oklch(0.46_0.16_55)] text-white rounded">Transition</button>
                          <button type="button" onClick={() => setEscalating(r)} className="px-2 py-1 text-[11px] bg-amber-600 text-white rounded">Escalate</button>
                        </div>
                      ) : null
                    ) },
                  ]}
                />
                {filing && <FileTicketModal onClose={() => setFiling(false)} onDone={() => { setFiling(false); onRefresh(); }} />}
                {transitioning && (
                  <ActionModal
                    title={`Ticket ${transitioning.ticket_number} · current: ${transitioning.status}`}
                    submitLabel="Transition"
                    fields={[
                      { key: 'to', label: 'To', type: 'select', required: true, options: [
                        { value: 'in_progress', label: 'In progress' },
                        { value: 'waiting_on_customer', label: 'Waiting on customer' },
                        { value: 'resolved', label: 'Resolved' },
                        { value: 'closed', label: 'Closed' },
                      ] },
                      { key: 'resolution', label: 'Resolution (resolved/closed only)', type: 'textarea' },
                      { key: 'assignee_id', label: 'Assignee (optional)', type: 'lookup', lookupEndpoint: '/api/lookup/participants', lookupAutoFill: { assignee_name: 'name' } },
                    ] as FieldSpec[]}
                    onClose={() => setTransitioning(null)}
                    onSubmit={async (v) => {
                      await api.post(`/support/tickets/${transitioning.id}/transition`, v);
                      setTransitioning(null); onRefresh();
                    }}
                  />
                )}
                {escalating && (
                  <ActionModal
                    title={`Escalate ticket ${escalating.ticket_number}`}
                    submitLabel="Escalate"
                    fields={[
                      { key: 'escalated_to', label: 'Escalate to (participant)', type: 'lookup', lookupEndpoint: '/api/lookup/participants', required: true },
                      { key: 'reason', label: 'Reason', type: 'textarea', required: true },
                    ] as FieldSpec[]}
                    onClose={() => setEscalating(null)}
                    onSubmit={async (v) => {
                      await api.post(`/support/tickets/${escalating.id}/escalate`, v);
                      setEscalating(null); onRefresh();
                    }}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'ticket_chain',
            label: 'Ticket chain',
            chainKey: 'support_tickets',
            body: () => <SupportTicketChainTab />,
          },
          {
            key: 'service_contracts',
            label: 'Service contracts',
            chainKey: 'service_contract',
            body: () => <ServiceContractChainTab />,
          },
          {
            key: 'service-request',
            label: 'Service requests',
            chainKey: 'service_request',
            body: () => <ServiceRequestChainTab />,
          },
          {
            key: 'oem_fco',
            label: 'OEM FCO/ECN',
            chainKey: 'oem_fco',
            body: () => <OemFcoChainTab />,
          },
          {
            key: 'csat',
            label: 'CSAT lifecycle (W208)',
            chainKey: 'csat_record',
            body: ({ onRefresh }) => <CsatLifecycleTab onRefresh={onRefresh} />,
          },
          {
            key: 'sla_performance_reports',
            label: 'SLA performance reports (W217)',
            chainKey: 'sla_performance_report',
            body: ({ onRefresh }) => <SlaPerformanceReportTab onRefresh={onRefresh} />,
          },
          {
            key: 'mqtt-opcua-connectors',
            label: 'MQTT/OPC-UA connectors (W123)',
            body: () => <MqttOpcuaConnectorTab />,
          },
          {
            key: 'anomaly-detection-ml',
            label: 'Anomaly ML (W127)',
            body: () => <AnomalyDetectionMlTab />,
          },
          {
            key: 'rul-prediction-ml',
            label: 'RUL Prediction ML (W128)',
            body: () => <RulPredictionMlTab />,
          },
          {
            key: 'fault-fingerprint-ml',
            label: 'Fault Fingerprint ML (W129)',
            body: () => <FaultFingerprintMlTab />,
          },
          {
            key: 'escalations',
            label: 'Escalations',
            body: () => (
              <ListingTable
                endpoint="/support/escalations"
                rowKey={(r) => r.id}
                empty={{ title: 'No escalations', description: 'Tickets that bubble up to engineering / management will appear here.' }}
                columns={[
                  { key: 'ticket_id', label: 'Ticket', render: (r) => <span className="font-mono text-[11px]">{(r.ticket_id || '').slice(0, 12)}…</span> },
                  { key: 'escalated_to', label: 'To', render: (r) => <span className="font-mono text-[11px]">{(r.escalated_to || '').slice(0, 18)}…</span> },
                  { key: 'reason', label: 'Reason', render: (r) => <span className="block truncate max-w-md" title={r.reason}>{r.reason}</span> },
                  { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'resolved' || r.status === 'accepted' ? 'good' : r.status === 'rejected' ? 'bad' : 'warn'}>{r.status}</Pill> },
                  { key: 'escalated_at', label: 'When', render: (r) => new Date(r.escalated_at).toLocaleString() },
                ]}
              />
            ),
          },
          {
            key: 'cross_tenant',
            label: 'Cross-tenant access',
            body: ({ onRefresh }) => (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button type="button" onClick={() => setLoggingAccess(true)} className="h-9 px-3 rounded-md bg-[oklch(0.46_0.16_55)] text-white text-[12px] font-semibold">
                    + Log access
                  </button>
                </div>
                <ListingTable
                  endpoint="/support/cross-tenant-access"
                  rowKey={(r) => r.id}
                  empty={{ title: 'No cross-tenant access logs', description: 'Every cross-tenant data access is POPIA-logged here.' }}
                  columns={[
                    { key: 'agent_id', label: 'Agent', render: (r) => <span className="font-mono text-[11px]">{(r.agent_id || '').slice(0, 12)}…</span> },
                    { key: 'tenant_accessed', label: 'Tenant', render: (r) => <span className="font-mono text-[11px]">{(r.tenant_accessed || '').slice(0, 12)}…</span> },
                    { key: 'resource_type', label: 'Resource' },
                    { key: 'justification', label: 'Justification', render: (r) => <span className="block truncate max-w-md" title={r.justification}>{r.justification}</span> },
                    { key: 'accessed_at', label: 'When', render: (r) => new Date(r.accessed_at).toLocaleString() },
                  ]}
                />
                {loggingAccess && (
                  <ActionModal
                    title="Log cross-tenant access (POPIA audit)"
                    submitLabel="Log"
                    fields={[
                      { key: 'tenant_accessed', label: 'Tenant ID accessed', required: true },
                      { key: 'resource_type', label: 'Resource type', required: true, placeholder: 'e.g. invoice, contract, project' },
                      { key: 'resource_id', label: 'Resource ID (optional)' },
                      { key: 'justification', label: 'Justification', type: 'textarea', required: true, helperText: 'POPIA requires a documented reason for cross-tenant access.' },
                      { key: 'ticket_id', label: 'Linked ticket (optional)', type: 'lookup', lookupEndpoint: '/api/lookup/tickets', lookupAutoFill: { ticket_ref: 'reference' } },
                    ] as FieldSpec[]}
                    onClose={() => setLoggingAccess(false)}
                    onSubmit={async (v) => {
                      await api.post('/support/cross-tenant-access', v);
                      setLoggingAccess(false); onRefresh();
                    }}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'reports',
            label: 'Reports & Exports',
            body: () => (
              <div className="space-y-8">
                {SUPPORT_REPORTS.map(cfg => (
                  <div key={cfg.endpoint} className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cfg.title}</p>
                    <ReportPanel config={cfg} />
                  </div>
                ))}
              </div>
            ),
          },
          {
            key: 'audit',
            label: 'Audit & compliance',
            body: ({ onRefresh }) => (
              <AuditPanel
                prefix="/support"
                reconHint="external_ref,agent_email,tenant_accessed,accessed_at"
                reconSourceOptions={['zendesk', 'jira', 'freshdesk', 'manual']}
                onChange={onRefresh}
              />
            ),
          },
        ]}
      />
    </>
  );
}

// ─── W208: CSAT Lifecycle ─────────────────────────────────────────────────────
const CSAT_TIER_TONE: Record<string, 'bad' | 'warn' | 'neutral'> = {
  p1_critical: 'bad', p2_high: 'warn', p3_medium: 'neutral', p4_low: 'neutral',
};

function CsatLifecycleTab({ onRefresh }: { onRefresh: () => void }) {
  const [modal, setModal] = useState<null | { type: 'create' } | { type: 'action'; id: string; currentStatus: string; tier: string }>(null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setModal({ type: 'create' })} className="h-9 px-3 rounded-md bg-[oklch(0.46_0.16_55)] text-white text-[12px] font-semibold">
          + New CSAT record
        </button>
      </div>

      <ListingTable
        endpoint="/csat-records"
        rowKey={(r) => r.id}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status, tier: r.support_tier })}
        empty={{ title: 'No CSAT records', description: 'CSAT surveys created after ticket resolution will appear here.' }}
        columns={[
          { key: 'ticket_id', label: 'Ticket ref', render: (r) => <span className="font-mono text-[11px]">{r.ticket_id ? String(r.ticket_id).slice(0, 14) + '…' : '—'}</span> },
          { key: 'support_tier', label: 'Tier', render: (r) => <Pill tone={CSAT_TIER_TONE[r.support_tier as string] ?? 'neutral'}>{String(r.support_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['closed_satisfied'].includes(r.chain_status as string) ? 'good' : ['closed_escalated', 'no_response'].includes(r.chain_status as string) ? 'neutral' : ['escalated'].includes(r.chain_status as string) ? 'bad' : 'warn'}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'csat_score', label: 'Score', render: (r) => r.csat_score != null ? <span className={`font-semibold ${Number(r.csat_score) >= 4 ? 'text-green-700' : Number(r.csat_score) <= 2 ? 'text-red-600' : 'text-amber-600'}`}>{r.csat_score}/5</span> : <span className="text-[#8fa3bd]">—</span> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'created_at', label: 'Created', render: (r) => new Date(r.created_at as string).toLocaleDateString() },
        ]}
      />

      {modal?.type === 'create' && (
        <ActionModal
          title="New CSAT record"
          submitLabel="Create"
          fields={[
            { key: 'ticket_id', label: 'Ticket (reference)', type: 'lookup', lookupEndpoint: '/api/lookup/tickets', lookupAutoFill: { ticket_ref: 'reference' } },
            { key: 'support_tier', label: 'Support tier', type: 'select', required: true, options: [
              { value: 'p1_critical', label: 'P1 Critical (24h SLA)' },
              { value: 'p2_high', label: 'P2 High (48h SLA)' },
              { value: 'p3_medium', label: 'P3 Medium (72h SLA)' },
              { value: 'p4_low', label: 'P4 Low (120h SLA)' },
            ]} as FieldSpec,
            { key: 'sla_met', label: 'Was SLA met?', type: 'select', options: [
              { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' },
            ]} as FieldSpec,
            { key: 'resolution_time_minutes', label: 'Resolution time (minutes)', type: 'number' },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => { setModal(null); }}
          onSubmit={async (v) => {
            await api.post('/csat-records', {
              ...v,
              sla_met: v.sla_met === 'true' ? true : v.sla_met === 'false' ? false : undefined,
              resolution_time_minutes: v.resolution_time_minutes ? Number(v.resolution_time_minutes) : undefined,
            });
            setModal(null); onRefresh();
          }}
        />
      )}

      {modal?.type === 'action' && (
        <ActionModal
          title={`CSAT — ${modal.tier} — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit action"
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: [
              { value: 'send_survey', label: 'Send survey' },
              { value: 'record_response', label: 'Record response' },
              { value: 'analyse_score', label: 'Analyse score' },
              { value: 'send_follow_up', label: 'Send follow-up' },
              { value: 'record_follow_up_response', label: 'Record follow-up response' },
              { value: 'escalate_to_management', label: 'Escalate to management' },
              { value: 'close_satisfied', label: 'Close — satisfied' },
              { value: 'close_escalated', label: 'Close — escalated' },
              { value: 'expire_no_response', label: 'Expire (no response)' },
            ]} as FieldSpec,
            { key: 'csat_score', label: 'CSAT score (1–5)', type: 'number' },
            { key: 'csat_comment', label: 'Customer comment' },
            { key: 'escalation_reason', label: 'Escalation reason' },
            { key: 'reason', label: 'Internal notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            await api.post(`/csat-records/${modal.id}/action`, {
              ...v,
              csat_score: v.csat_score ? Number(v.csat_score) : undefined,
            });
            setModal(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function FileTicketModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('feature_question');
  const [priority, setPriority] = useState('normal');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!subject.trim()) { setErr('Subject required.'); return; }
    setSaving(true); setErr(null);
    try {
      await api.post('/support/tickets', { subject, description, category, priority });
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed');
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-[#0f1c2e]">File a ticket</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="text-[12px] text-red-700">{err}</div>}
          <label className="block text-[13px]">
            <span className="text-[#6b7685]">Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg" />
          </label>
          <label className="block text-[13px]">
            <span className="text-[#6b7685]">Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg resize-none" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[13px]">
              <span className="text-[#6b7685]">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg">
                <option value="access">Access</option>
                <option value="billing">Billing</option>
                <option value="feature_question">Feature question</option>
                <option value="bug">Bug</option>
                <option value="data_issue">Data issue</option>
                <option value="compliance">Compliance</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block text-[13px]">
              <span className="text-[#6b7685]">Priority</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-[#dde4ec] rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 bg-[oklch(0.46_0.16_55)] text-white rounded-lg disabled:opacity-50">
              {saving ? 'Filing…' : 'File ticket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── W217: SLA Performance Report ─────────────────────────────────────────────
const SPR_TIER_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good' | 'neutral'> = {
  standard: 'info',
  enhanced: 'info',
  critical: 'warn',
  enterprise: 'bad',
};

function sprStatusTone(s: string): 'info' | 'warn' | 'bad' | 'good' | 'neutral' {
  if (s === 'approved') return 'good';
  if (s === 'disputed' || s === 'remediation_plan') return 'bad';
  if (s === 'management_review') return 'warn';
  return 'info';
}

type SprModal = null | 'create' | { type: 'action'; id: string; currentStatus: string };

function SlaPerformanceReportTab({ onRefresh }: { onRefresh: () => void }) {
  const [modal, setModal] = useState<SprModal>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => { setRefreshKey(k => k + 1); onRefresh(); };

  return (
    <div>
      <button type="button"
        onClick={() => setModal('create')}
        className="mb-4 px-4 py-2 bg-[oklch(0.46_0.16_55)] text-white text-sm rounded hover:bg-[oklch(0.40_0.15_55)]"
      >
        Open reporting period
      </button>
      <ListingTable
        endpoint="/sla-performance-reports"
        key={refreshKey}
        rowKey={(r) => r.id}
        empty={{ title: 'No SLA performance reports', description: 'ITIL 4 SLA performance reports will appear here.' }}
        columns={[
          { key: 'reporting_period', label: 'Period', render: (r) => <span className="font-mono text-[11px]">{r.reporting_period}</span> },
          { key: 'report_tier', label: 'Tier', render: (r) => <Pill tone={SPR_TIER_TONE[r.report_tier] ?? 'neutral'}>{String(r.report_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'overall_sla_pct', label: 'SLA %', align: 'right', render: (r) => r.overall_sla_pct != null ? `${Number(r.overall_sla_pct).toFixed(1)}%` : '—' },
          { key: 'total_incidents', label: 'Incidents', align: 'right', render: (r) => r.total_incidents ?? 0 },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={sprStatusTone(r.chain_status)}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="Open SLA performance report period"
          submitLabel="Open"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/sla-performance-reports', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                reporting_period: v.reporting_period,
                period_start: v.period_start,
                period_end: v.period_end,
                report_tier: v.report_tier,
                target_sla_pct: v.target_sla_pct ? parseFloat(v.target_sla_pct) : undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); bump();
          }}
          fields={[
            { key: 'reporting_period', label: 'Reporting period', required: true, placeholder: 'Dec-2025' },
            { key: 'period_start', label: 'Period start (ISO)', required: true, placeholder: '2025-12-01T00:00:00Z' },
            { key: 'period_end', label: 'Period end (ISO)', required: true, placeholder: '2025-12-31T23:59:59Z' },
            {
              key: 'report_tier', label: 'Service tier', type: 'select', required: true, defaultValue: 'standard',
              options: [
                { value: 'standard', label: 'Standard — monthly (14d SLA)' },
                { value: 'enhanced', label: 'Enhanced — board visibility (21d SLA)' },
                { value: 'critical', label: 'Critical — mission-critical (30d SLA)' },
                { value: 'enterprise', label: 'Enterprise — weekly deep-dive (45d SLA)' },
              ],
            },
            { key: 'target_sla_pct', label: 'Target SLA %', type: 'number', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ] as FieldSpec[]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title={`SLA report action — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/sla-performance-reports/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                total_incidents: v.total_incidents ? parseInt(v.total_incidents, 10) : undefined,
                p1_count: v.p1_count ? parseInt(v.p1_count, 10) : undefined,
                p2_count: v.p2_count ? parseInt(v.p2_count, 10) : undefined,
                p1_sla_pct: v.p1_sla_pct ? parseFloat(v.p1_sla_pct) : undefined,
                p2_sla_pct: v.p2_sla_pct ? parseFloat(v.p2_sla_pct) : undefined,
                overall_sla_pct: v.overall_sla_pct ? parseFloat(v.overall_sla_pct) : undefined,
                rca_triggered: v.rca_triggered === 'true',
                rca_lead: v.rca_lead || undefined,
                rca_findings: v.rca_findings || undefined,
                root_causes: v.root_causes || undefined,
                reviewer_name: v.reviewer_name || undefined,
                remediation_plan_ref: v.remediation_plan_ref || undefined,
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
                { value: 'calculate_metrics', label: 'Calculate metrics' },
                { value: 'initiate_rca', label: 'Initiate RCA for misses' },
                { value: 'complete_rca', label: 'Complete RCA — findings ready' },
                { value: 'submit_for_review', label: 'Submit for management review' },
                { value: 'approve', label: 'Approve report' },
                { value: 'dispute', label: 'Dispute measurements' },
                { value: 'escalate_remediation', label: 'Escalate — remediation plan required' },
                { value: 'withdraw', label: 'Withdraw period' },
              ],
            },
            { key: 'total_incidents', label: 'Total incidents', type: 'number', required: false },
            { key: 'p1_count', label: 'P1 count', type: 'number', required: false },
            { key: 'p2_count', label: 'P2 count', type: 'number', required: false },
            { key: 'p1_sla_pct', label: 'P1 SLA %', type: 'number', required: false },
            { key: 'p2_sla_pct', label: 'P2 SLA %', type: 'number', required: false },
            { key: 'overall_sla_pct', label: 'Overall SLA %', type: 'number', required: false },
            { key: 'rca_triggered', label: 'RCA required?', type: 'select', required: false, options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
            { key: 'rca_lead', label: 'RCA lead', required: false },
            { key: 'rca_findings', label: 'RCA findings', type: 'textarea', required: false },
            { key: 'root_causes', label: 'Root causes (JSON)', type: 'textarea', required: false },
            { key: 'reviewer_name', label: 'Reviewer name', required: false },
            { key: 'remediation_plan_ref', label: 'Remediation plan reference', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ] as FieldSpec[]}
        />
      )}
    </div>
  );
}
