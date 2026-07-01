// pages/src/meridian/surfaces/support/TicketsSurface.tsx
//
// Meridian surface — "Tickets" (support role). Extracted verbatim from the `tickets` tab body
// of the SupportWorkstationPage husk (E2.4). Self-contained: ListingTable of support tickets
// with File / Transition / Escalate actions + the FileTicketModal (moved here from the husk).
// Bucket B (non-chain inline CRUD — the `tickets` listing is not the `support_tickets` chain).
// Registered as `support:tickets`, reached from Atlas (⌘K) via the roleData feature key `tickets`.
import React, { useState } from 'react';
import { ListingTable, Pill, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';
import { X } from 'lucide-react';
import { statusLabel } from '../../ease/statusLabel';

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
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[var(--line)] flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-[var(--ink)]">File a ticket</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="text-[12px] text-[var(--oxide-deep)]">{err}</div>}
          <label className="block text-[13px]">
            <span className="text-[var(--ink3)]">Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[var(--line)] rounded-lg" />
          </label>
          <label className="block text-[13px]">
            <span className="text-[var(--ink3)]">Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="mt-1 w-full px-3 py-2 border border-[var(--line)] rounded-lg resize-none" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[13px]">
              <span className="text-[var(--ink3)]">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[var(--line)] rounded-lg">
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
              <span className="text-[var(--ink3)]">Priority</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[var(--line)] rounded-lg">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn ghost">Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className="btn pri">
              {saving ? 'Filing…' : 'File ticket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TicketsSurface(_props: { role: string }) {
  const [filing, setFiling] = useState(false);
  const [transitioning, setTransitioning] = useState<any | null>(null);
  const [escalating, setEscalating] = useState<any | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const onRefresh = () => setRefreshKey((k) => k + 1);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setFiling(true)} className="btn pri">
          + File ticket
        </button>
      </div>
      <ListingTable
        key={refreshKey}
        endpoint="/support/tickets"
        rowKey={(r) => r.id}
        rowHref={(r) => `/support/tickets/${r.id}`}
        empty={{ title: 'No tickets', description: 'Tickets reported by users (or filed on their behalf) will appear here.' }}
        columns={[
          { key: 'ticket_number', label: 'Ticket', render: (r) => <span className="font-mono text-[11px]">{r.ticket_number}</span> },
          { key: 'subject', label: 'Subject', render: (r) => <span className="block truncate max-w-md" title={r.subject}>{r.subject}</span> },
          { key: 'category', label: 'Category', render: (r) => <Pill tone="info">{r.category}</Pill> },
          { key: 'priority', label: 'Priority', render: (r) => <Pill tone={r.priority === 'urgent' ? 'bad' : r.priority === 'high' ? 'warn' : 'neutral'}>{r.priority}</Pill> },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'resolved' || r.status === 'closed' ? 'good' : r.status === 'open' ? 'bad' : 'warn'}>{statusLabel(r.status).text}</Pill> },
          { key: 'created_at', label: 'Filed', render: (r) => new Date(r.created_at).toLocaleString() },
          { key: '_actions', label: '', render: (r) => (
            (r.status !== 'resolved' && r.status !== 'closed') ? (
              <div className="flex gap-1">
                <button type="button" onClick={() => setTransitioning(r)} className="btn pri">Transition</button>
                <button type="button" onClick={() => setEscalating(r)} className="btn ghost">Escalate</button>
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
  );
}
