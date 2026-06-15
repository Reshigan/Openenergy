import React, { useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { SubmittalRfiChainTab } from '../ipp/SubmittalRfiChainTab';
import { ProjectChangeOrderChainTab } from '../ipp/ProjectChangeOrderChainTab';
import type { TourDef } from '../launch/ProductTour';


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
