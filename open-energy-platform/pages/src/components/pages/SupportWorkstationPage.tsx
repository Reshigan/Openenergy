import React, { useState } from 'react';
import { WorkstationShell, ListingTable, Pill } from '../launch/WorkstationShell';
import { api } from '../../lib/api';
import { X } from 'lucide-react';

export function SupportWorkstationPage() {
  const [filing, setFiling] = useState(false);
  return (
    <>
      <WorkstationShell
        eyebrow="Support · Workstation"
        title="Support workstation"
        subtitle="Tickets · Escalations · Cross-tenant access audit. All the support tooling — no external ticketing system needed."
        backHref="/support"
        backLabel="Support console"
        tabs={[
          {
            key: 'tickets',
            label: 'Tickets',
            body: ({ onRefresh }) => (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button onClick={() => setFiling(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
                    + File ticket
                  </button>
                </div>
                <ListingTable
                  endpoint="/support/tickets"
                  rowKey={(r) => r.id}
                  empty={{ title: 'No tickets', description: 'Tickets reported by users (or filed on their behalf) will appear here.' }}
                  columns={[
                    { key: 'ticket_number', label: 'Ticket', render: (r) => <span className="font-mono text-[11px]">{r.ticket_number}</span> },
                    { key: 'subject', label: 'Subject', render: (r) => <span className="block truncate max-w-md" title={r.subject}>{r.subject}</span> },
                    { key: 'category', label: 'Category', render: (r) => <Pill tone="info">{r.category}</Pill> },
                    { key: 'priority', label: 'Priority', render: (r) => <Pill tone={r.priority === 'urgent' ? 'bad' : r.priority === 'high' ? 'warn' : 'neutral'}>{r.priority}</Pill> },
                    { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'resolved' || r.status === 'closed' ? 'good' : r.status === 'open' ? 'bad' : 'warn'}>{r.status.replace(/_/g, ' ')}</Pill> },
                    { key: 'created_at', label: 'Filed', render: (r) => new Date(r.created_at).toLocaleString() },
                  ]}
                />
                {filing && <FileTicketModal onClose={() => setFiling(false)} onDone={() => { setFiling(false); onRefresh(); }} />}
              </div>
            ),
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
            body: () => (
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
            ),
          },
        ]}
      />
    </>
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
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
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
            <button onClick={onClose} className="px-4 py-2 border border-[#dde4ec] rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 bg-[#1a3a5c] text-white rounded-lg disabled:opacity-50">
              {saving ? 'Filing…' : 'File ticket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
