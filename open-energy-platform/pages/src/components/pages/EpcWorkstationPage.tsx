import React, { useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { SubmittalRfiChainTab } from '../ipp/SubmittalRfiChainTab';
import { ProjectChangeOrderChainTab } from '../ipp/ProjectChangeOrderChainTab';
import type { WizardSpec } from '../launch/WizardModal';
import type { TourDef } from '../launch/ProductTour';

const EPC_WIZARDS: WizardSpec[] = [
  {
    id: 'epc-complete-setup',
    title: 'Set up your EPC contractor workstation',
    subtitle: 'Configure document control, quality management, safety, and project controls for your construction project',
    steps: [
      {
        title: 'Project details',
        description: 'Set up your construction project details, scope of work, and key contacts.',
        aiHint: 'The EPC workstation organises all construction-phase deliverables: submittals, RFIs, ITPs, NCRs, change orders, method statements, and site diary. Everything you submit flows into the IPP owner\'s document register — set up the client document numbering conventions before submitting your first document to avoid re-numbering headaches later.',
        fields: [
          { key: 'project_name', label: 'Project name', type: 'text', required: true, placeholder: 'e.g. Saldanha Wind Farm EPC' },
          { key: 'client_name', label: 'IPP client / owner', type: 'text', required: true, placeholder: 'e.g. Saldanha Wind Energy (Pty) Ltd' },
          { key: 'contract_value_m', label: 'EPC contract value (R million)', type: 'number', placeholder: 'e.g. 250' },
          { key: 'document_numbering', label: 'Document numbering convention', type: 'text', placeholder: 'e.g. SWF-EPC-{discipline}-{seq} as agreed with client' },
        ],
      },
      {
        title: 'Document control setup',
        description: 'Configure Submittals, RFIs, Change orders, and Technical queries workflows.',
        aiHint: 'Submittals require client approval before the associated work can commence — track required approval dates against your programme schedule. RFIs must be responded to within the contractual timeframe (usually 7–14 days); unanswered RFIs that delay your work give you a time extension entitlement. Change orders lock in scope and cost changes — never do extra work without an approved change order.',
        fields: [
          { key: 'submittal_lead_time_days', label: 'Submittal review lead time (days)', type: 'number', placeholder: 'e.g. 14 — as per contract' },
          { key: 'rfi_response_days', label: 'RFI response time required (days)', type: 'number', placeholder: 'e.g. 7 — contractual obligation on client' },
          { key: 'lead_document_controller', label: 'Document controller (name)', type: 'text', placeholder: 'Name — responsible for submittals register' },
        ],
      },
      {
        title: 'Quality management',
        description: 'Set up Inspection test plans (ITPs), Non-conformance reports (NCRs), Punch list, and Method statements.',
        aiHint: 'ITPs define hold points (client must witness) and witness points (client may witness). Never proceed past a hold point without the signed ITP witness record — doing so creates a contractual defect that can require costly rework. NCRs must be closed out before practical completion. Open NCRs at handover carry double the defect value as retention.',
        fields: [
          { key: 'itp_standard', label: 'ITP standard / methodology', type: 'select', options: [{ value: 'iso9001', label: 'ISO 9001 quality management system' }, { value: 'client_spec', label: 'Client-specified ITP format' }, { value: 'iec62446', label: 'IEC 62446 PV commissioning test plan' }] },
          { key: 'ncr_close_target_days', label: 'NCR close-out target (days)', type: 'number', placeholder: 'e.g. 14 days from issue' },
          { key: 'quality_manager', label: 'Construction quality manager', type: 'text', placeholder: 'Name and ISO 9001 lead auditor ref' },
        ],
      },
      {
        title: 'Safety & HSE',
        description: 'Configure HSE incident reporting (OHSA §24 + NEMA §30), Method statements, and safety protocols.',
        aiHint: 'OHSA §24 requires that all serious injuries and fatalities be reported to the Department of Labour within 7 days — the HSE incident chain auto-generates the required notification. All method statements must be reviewed and approved before the associated work starts. High-risk work (working at height, live electrical, confined space) requires a dedicated risk assessment and safety officer present.',
        fields: [
          { key: 'sheq_officer', label: 'Site SHEQ officer', type: 'text', required: true, placeholder: 'Name and SACPCMP CHSO registration number' },
          { key: 'incident_reporting_contact', label: 'Client HSE reporting contact', type: 'text', placeholder: 'IPP SHEQ manager name and email' },
          { key: 'lost_time_injury_target', label: 'LTI-free target (days)', type: 'number', placeholder: 'e.g. 365 days — set your project target' },
        ],
      },
    ],
    submitLabel: 'Save project setup',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/epc/project-config', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'epc-submittal',
    title: 'Submit a document for approval',
    subtitle: 'ITP-compliant submittal workflow — tracks client review against programme',
    steps: [
      {
        title: 'Document details',
        description: 'Register the document for client review.',
        aiHint: 'Submittals are categorised by discipline (structural, electrical, civil, mechanical). The submittal register tracks the review cycle — if the client takes longer than the contractual review period, you earn a time extension claim. Always submit with "Approved for Construction" status when submitting shop drawings.',
        fields: [
          { key: 'document_number', label: 'Document number', type: 'text', required: true, placeholder: 'e.g. SWF-EPC-ELC-001 Rev 0' },
          { key: 'document_title', label: 'Document title', type: 'text', required: true, placeholder: 'e.g. Single Line Diagram — Main MV Switchgear' },
          { key: 'discipline', label: 'Discipline', type: 'select', required: true, options: [{ value: 'electrical', label: 'Electrical' }, { value: 'civil', label: 'Civil / structural' }, { value: 'mechanical', label: 'Mechanical' }, { value: 'instrumentation', label: 'Instrumentation & control' }, { value: 'health_safety', label: 'Health & safety' }] },
        ],
      },
      {
        title: 'Review requirements',
        description: 'Set the required approval level and programme linkage.',
        aiHint: 'Hold points require client written approval before work can proceed. Witness points require client presence at the activity. Approval-only submittals can be reviewed offline. If this submittal is on the critical path, flag it — late approval generates an entitlement claim.',
        fields: [
          { key: 'submittal_type', label: 'Approval type', type: 'select', required: true, options: [{ value: 'hold_point', label: 'Hold point — work cannot proceed without approval' }, { value: 'witness', label: 'Witness point — client notified to attend' }, { value: 'approval', label: 'Approval required' }, { value: 'for_information', label: 'For information only' }] },
          { key: 'required_by_date', label: 'Required approval date', type: 'date', required: true },
          { key: 'critical_path', label: 'On critical path?', type: 'select', options: [{ value: 'yes', label: 'Yes — delay affects programme completion' }, { value: 'no', label: 'No — float available' }] },
        ],
      },
    ],
    submitLabel: 'Register submittal',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/ipp/submittals', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Submittal creation failed'); }
    },
  },
  {
    id: 'epc-ncr',
    title: 'Raise a Non-Conformance Report (NCR)',
    subtitle: 'ISO 9001 — defect identification and close-out',
    steps: [
      {
        title: 'Non-conformance details',
        description: 'Describe the non-conformance and its source.',
        aiHint: 'NCRs identify deviations from specifications, drawings, or workmanship standards. They can be raised by the EPC quality team (internal NCR) or by the client or IE (external NCR). External NCRs carry higher commercial risk — an unanswered external NCR gives the client grounds to withhold payment.',
        fields: [
          { key: 'ncr_title', label: 'NCR title', type: 'text', required: true, placeholder: 'Brief description of the non-conformance' },
          { key: 'ncr_source', label: 'NCR source', type: 'select', required: true, options: [{ value: 'internal', label: 'Internal quality audit' }, { value: 'client', label: 'Client-raised' }, { value: 'ie', label: 'Independent engineer-raised' }, { value: 'regulatory', label: 'Regulatory inspection' }] },
          { key: 'location', label: 'Location / reference', type: 'text', placeholder: 'e.g. Block B rows 15–18, or drawing reference' },
        ],
      },
      {
        title: 'Corrective action',
        description: 'Define the corrective action and close-out responsibility.',
        aiHint: 'Corrective actions must be specific and measurable. "Fix it" is not a corrective action. Write: what will be done, who will do it, by when, and how conformance will be verified. The NCR is only closed when the client or IE has verified the corrective action has been implemented correctly.',
        fields: [
          { key: 'corrective_action', label: 'Corrective action description', type: 'textarea', required: true, placeholder: 'Specific steps to correct the non-conformance and prevent recurrence' },
          { key: 'responsible_person', label: 'Responsible person', type: 'text', required: true, placeholder: 'Name and role' },
          { key: 'close_out_date', label: 'Target close-out date', type: 'date', required: true },
        ],
      },
    ],
    submitLabel: 'Raise NCR',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/ipp/ncr', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'NCR creation failed'); }
    },
  },
  {
    id: 'epc-hse-incident',
    title: 'Report an HSE incident',
    subtitle: 'OHSA §24 + NEMA §30 — incident reporting chain',
    steps: [
      {
        title: 'Incident classification',
        description: 'Classify the incident and immediate response taken.',
        aiHint: 'OHSA §24 requires that fatalities and serious injuries be reported to the Department of Labour within 7 days. The HSE chain auto-generates this report when you classify the incident as a fatality or serious injury. Preserve the scene until the DoL inspector has attended. First-aid incidents (no lost time) still require a site incident record even though they\'re not statutorily reportable.',
        fields: [
          { key: 'incident_type', label: 'Incident type', type: 'select', required: true, options: [{ value: 'fatality', label: 'Fatality (OHSA §24 reportable)' }, { value: 'serious_injury', label: 'Serious injury (OHSA §24 reportable)' }, { value: 'lost_time', label: 'Lost-time injury (LTI)' }, { value: 'first_aid', label: 'First aid case (FAC)' }, { value: 'near_miss', label: 'Near miss / dangerous occurrence' }, { value: 'environmental', label: 'Environmental incident (NEMA §30)' }] },
          { key: 'incident_date', label: 'Date and time of incident', type: 'date', required: true },
          { key: 'location', label: 'Location on site', type: 'text', required: true, placeholder: 'e.g. Main substation, Row 12 mounting structure' },
        ],
      },
      {
        title: 'Description & witnesses',
        description: 'Describe what happened and identify witnesses.',
        aiHint: 'Witness statements must be taken within 24 hours while memories are fresh. Record exactly what each witness saw — do not paraphrase. Include the names and contact details of all witnesses. For OHSA §24 reportable incidents, the investigation must be completed within 14 days and the report signed by a competent person.',
        fields: [
          { key: 'description', label: 'Incident description', type: 'textarea', required: true, placeholder: 'What happened? Sequence of events leading to the incident, root cause if known.' },
          { key: 'persons_involved', label: 'Person(s) involved', type: 'text', required: true, placeholder: 'Names, employers, and roles of injured/involved persons' },
          { key: 'immediate_action', label: 'Immediate action taken', type: 'textarea', placeholder: 'First aid, evacuation, scene isolation, emergency services called…' },
        ],
      },
    ],
    submitLabel: 'Report incident',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/hse/incidents', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'HSE incident creation failed'); }
    },
  },
];

const EPC_TOUR: TourDef = {
  id: 'epc-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'EPC contractor workstation', body: 'Your construction-phase project hub — submittals, RFIs, ITPs, NCRs, change orders, punch list, site diary, and HSE incident management. Everything in one place, all tracked against the programme.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Construction KPIs', body: 'Open submittals awaiting approval, RFIs pending client response, NCRs to close out, and ITPs completion rate. Red indicators flag hold points blocking construction progress.', placement: 'bottom' },
    { target: 'tab-nav', title: 'Document control tabs', body: 'Every construction deliverable: submittals, RFIs, change orders, technical queries, ITPs, NCRs, punch list, method statements, and site diary — all with full approval lifecycle tracking.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start', body: 'Register a new submittal, raise an NCR, report an HSE incident, or run the complete project setup wizard — guided with compliance reminders at every step.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'Full EPC capability index: every document control, quality, and safety workflow, grouped by area and deep-linked to the relevant workstation tab.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'Client submittal comments, RFI responses requiring your action, and NCR close-out verifications arrive here for processing.', placement: 'left' },
  ],
};

export function EpcWorkstationPage() {
  const [creatingSubmittal, setCreatingSubmittal] = useState(false);
  const [creatingRfi, setCreatingRfi] = useState(false);
  return (
    <WorkstationShell
      role="epc_contractor"
      eyebrow="EPC Contractor · Workstation"
      title="Construction workstation"
      subtitle="Site setup → Document control → Quality management → Safety & HSE → Handover"
      wizards={EPC_WIZARDS}
      tour={EPC_TOUR}
      tabs={[
        {
          key: 'submittals',
          label: 'Submittals',
          group: 'Document control',
          body: () => <SubmittalRfiChainTab />,
        },
        {
          key: 'rfis',
          label: 'RFIs',
          group: 'Document control',
          body: ({ onRefresh }) => (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button type="button" onClick={() => setCreatingRfi(true)} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold">+ New RFI</button>
              </div>
              <ListingTable
                endpoint="/ipp/rfis"
                rowKey={(r) => r.id}
                empty={{ title: 'No RFIs', description: 'Requests for information submitted to the client will appear here.' }}
                columns={[
                  { key: 'rfi_number', label: 'RFI No.', render: (r) => <span className="font-mono text-[11px]">{r.rfi_number}</span> },
                  { key: 'subject', label: 'Subject', render: (r) => <span className="block truncate max-w-xs">{r.subject}</span> },
                  { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'closed' ? 'good' : r.status === 'overdue' ? 'bad' : 'warn'}>{r.status?.replace(/_/g, ' ')}</Pill> },
                  { key: 'required_by', label: 'Response due', render: (r) => r.required_by ? new Date(r.required_by).toLocaleDateString() : '—' },
                ]}
              />
              {creatingRfi && (
                <ActionModal
                  title="Raise RFI"
                  fields={[
                    { key: 'subject', label: 'Subject', type: 'text', required: true },
                    { key: 'description', label: 'Description', type: 'textarea', required: true },
                    { key: 'discipline', label: 'Discipline', type: 'select', options: [{ value: 'electrical', label: 'Electrical' }, { value: 'civil', label: 'Civil' }, { value: 'mechanical', label: 'Mechanical' }] },
                    { key: 'required_by', label: 'Response required by', type: 'date' },
                  ]}
                  onClose={() => setCreatingRfi(false)}
                  onSubmit={async (v) => {
                    const token = localStorage.getItem('token') || '';
                    const res = await fetch('/api/ipp/rfis', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(v) });
                    if (!res.ok) throw new Error('Failed to raise RFI');
                    setCreatingRfi(false);
                    onRefresh?.();
                  }}
                />
              )}
            </div>
          ),
        },
        {
          key: 'change-orders',
          label: 'Change orders',
          group: 'Document control',
          body: () => <ProjectChangeOrderChainTab />,
        },
        {
          key: 'technical-queries',
          label: 'Technical queries',
          group: 'Document control',
          body: () => (
            <ListingTable
              endpoint="/ipp/technical-queries"
              rowKey={(r) => r.id}
              empty={{ title: 'No technical queries', description: 'Engineering technical queries will appear here.' }}
              columns={[
                { key: 'tq_number', label: 'TQ No.', render: (r) => <span className="font-mono text-[11px]">{r.tq_number}</span> },
                { key: 'subject', label: 'Subject', render: (r) => <span className="block truncate max-w-xs">{r.subject}</span> },
                { key: 'discipline', label: 'Discipline' },
                { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'closed' ? 'good' : 'warn'}>{r.status?.replace(/_/g, ' ')}</Pill> },
                { key: 'created_at', label: 'Raised', render: (r) => new Date(r.created_at).toLocaleDateString() },
              ]}
            />
          ),
        },
        {
          key: 'ncrs',
          label: 'Non-conformance reports',
          group: 'Quality management',
          body: () => (
            <ListingTable
              endpoint="/ipp/ncr"
              rowKey={(r) => r.id}
              empty={{ title: 'No NCRs', description: 'Non-conformance reports will appear here.' }}
              columns={[
                { key: 'ncr_number', label: 'NCR No.', render: (r) => <span className="font-mono text-[11px]">{r.ncr_number}</span> },
                { key: 'description', label: 'Description', render: (r) => <span className="block truncate max-w-xs">{r.description}</span> },
                { key: 'source', label: 'Source', render: (r) => <Pill tone={r.source === 'client' || r.source === 'ie' ? 'bad' : 'warn'}>{r.source}</Pill> },
                { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'closed' ? 'good' : r.status === 'overdue' ? 'bad' : 'warn'}>{r.status?.replace(/_/g, ' ')}</Pill> },
                { key: 'close_out_date', label: 'Target close', render: (r) => r.close_out_date ? new Date(r.close_out_date).toLocaleDateString() : '—' },
              ]}
            />
          ),
        },
        {
          key: 'method-statements',
          label: 'Method statements',
          group: 'Quality management',
          body: () => (
            <ListingTable
              endpoint="/ipp/method-statements"
              rowKey={(r) => r.id}
              empty={{ title: 'No method statements', description: 'Construction method statements will appear here.' }}
              columns={[
                { key: 'ms_number', label: 'MS No.', render: (r) => <span className="font-mono text-[11px]">{r.ms_number}</span> },
                { key: 'title', label: 'Title', render: (r) => <span className="block truncate max-w-xs">{r.title}</span> },
                { key: 'risk_level', label: 'Risk', render: (r) => <Pill tone={r.risk_level === 'high' ? 'bad' : r.risk_level === 'medium' ? 'warn' : 'neutral'}>{r.risk_level}</Pill> },
                { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'approved' ? 'good' : r.status === 'rejected' ? 'bad' : 'warn'}>{r.status?.replace(/_/g, ' ')}</Pill> },
                { key: 'approved_by', label: 'Approved by' },
              ]}
            />
          ),
        },
        {
          key: 'site-diary',
          label: 'Site diary',
          group: 'Site setup',
          body: () => (
            <ListingTable
              endpoint="/ipp/site-diary"
              rowKey={(r) => r.id}
              empty={{ title: 'No site diary entries', description: 'Daily site progress records will appear here.' }}
              columns={[
                { key: 'entry_date', label: 'Date', render: (r) => new Date(r.entry_date).toLocaleDateString() },
                { key: 'weather', label: 'Weather' },
                { key: 'workforce_count', label: 'Workforce', render: (r) => r.workforce_count != null ? `${r.workforce_count} persons` : '—' },
                { key: 'progress_summary', label: 'Progress', render: (r) => <span className="block truncate max-w-md">{r.progress_summary}</span> },
                { key: 'logged_by', label: 'Logged by' },
              ]}
            />
          ),
        },
        {
          key: 'audit',
          label: 'Audit trail',
          group: 'Handover & compliance',
          body: () => <AuditPanel prefix="/ipp" reconHint="event_id, entity_type, actor_id, timestamp" />,
        },
      ]}
    />
  );
}
