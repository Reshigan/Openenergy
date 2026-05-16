// ════════════════════════════════════════════════════════════════════════
// SupportTicketDetailPage — drill-in for /support/tickets/:id
//
// Full conversation view: ticket header + escalations + comments thread
// with inline reply box. Visibility toggle (public / internal) for
// support agents.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Send } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';

type Ticket = {
  id: string;
  ticket_number: string;
  reporter_id: string;
  tenant_id: string | null;
  subject: string;
  description: string | null;
  category: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed';
  assignee_id: string | null;
  resolution: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
};

type Comment = {
  id: string;
  ticket_id: string;
  author_id: string;
  body: string;
  visibility: 'public' | 'internal';
  created_at: string;
};

type Escalation = {
  id: string;
  ticket_id: string;
  escalated_by: string;
  escalated_to: string;
  reason: string;
  status: 'open' | 'accepted' | 'resolved' | 'rejected';
  escalated_at: string;
  resolved_at: string | null;
};

export function SupportTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [replyVisibility, setReplyVisibility] = useState<'public' | 'internal'>('public');
  const [posting, setPosting] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [escalating, setEscalating] = useState(false);

  const isAgent = user?.role === 'support' || user?.role === 'admin';

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setErr(null);
    try {
      const res = await api.get(`/support/tickets/${id}`);
      setTicket(res.data?.data?.ticket);
      setComments((res.data?.data?.comments as Comment[]) || []);
      setEscalations((res.data?.data?.escalations as Escalation[]) || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const postComment = async () => {
    if (!reply.trim()) return;
    setPosting(true);
    try {
      await api.post(`/support/tickets/${id}/comments`, { body: reply, visibility: replyVisibility });
      setReply('');
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'post failed');
    } finally {
      setPosting(false);
    }
  };

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={6} /></div>;
  if (err) return <div className="p-6"><ErrorBanner message={err} onRetry={() => void load()} /></div>;
  if (!ticket) return null;

  return (
    <div className="p-6 lg:p-10 space-y-4 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#6b7685]">
            Ticket · <span className="font-mono">{ticket.ticket_number}</span>
          </div>
          <h1 className="mt-2 font-display text-[24px] font-bold tracking-tight" style={{ color: 'var(--oe-on-surface)' }}>
            {ticket.subject}
          </h1>
          <p className="text-[13px] text-[#3d4756]">
            <Pill tone={ticket.status === 'resolved' || ticket.status === 'closed' ? 'good' : ticket.status === 'open' ? 'bad' : 'warn'}>{ticket.status.replace(/_/g, ' ')}</Pill>
            {' '}<Pill tone="info">{ticket.category}</Pill>
            {' '}<Pill tone={ticket.priority === 'urgent' ? 'bad' : ticket.priority === 'high' ? 'warn' : 'neutral'}>{ticket.priority}</Pill>
            {' '}· filed {new Date(ticket.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/support/workstation')} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <ArrowLeft size={12} /> Workstation
          </button>
          <button onClick={() => void load()} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
          {isAgent && ticket.status !== 'resolved' && ticket.status !== 'closed' && (
            <>
              <button onClick={() => setTransitioning(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
                Transition
              </button>
              <button onClick={() => setEscalating(true)} className="h-9 px-3 rounded-md bg-amber-600 text-white text-[12px] font-semibold">
                Escalate
              </button>
            </>
          )}
        </div>
      </header>

      {ticket.description && (
        <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
          <div className="text-[10px] uppercase tracking-wide text-[#6b7685] mb-1">Description</div>
          <div className="text-[13px] whitespace-pre-wrap">{ticket.description}</div>
        </div>
      )}

      {ticket.resolution && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="text-[10px] uppercase tracking-wide text-green-700 mb-1">Resolution</div>
          <div className="text-[13px] whitespace-pre-wrap">{ticket.resolution}</div>
          {ticket.resolved_at && (
            <div className="text-[11px] text-[#6b7685] mt-1">Resolved {new Date(ticket.resolved_at).toLocaleString()}</div>
          )}
        </div>
      )}

      {escalations.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#6b7685' }}>Escalations ({escalations.length})</h2>
          <div className="space-y-2">
            {escalations.map(e => (
              <div key={e.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 text-[12px]">
                  <Pill tone={e.status === 'resolved' ? 'good' : e.status === 'rejected' ? 'bad' : 'warn'}>{e.status}</Pill>
                  <span className="text-[#6b7685]">→ <span className="font-mono">{e.escalated_to}</span></span>
                  <span className="text-[#6b7685] ml-auto">{new Date(e.escalated_at).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-[12px]">{e.reason}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#6b7685' }}>
          Conversation ({comments.length} comment{comments.length === 1 ? '' : 's'})
        </h2>
        {comments.length === 0 ? (
          <div className="rounded-xl border border-[#dde4ec] bg-white p-4 text-[12px] text-[#6b7685]">No replies yet.</div>
        ) : (
          <div className="space-y-2">
            {comments.map(c => (
              <div key={c.id} className={`rounded-xl border p-3 ${c.visibility === 'internal' ? 'border-amber-200 bg-amber-50' : 'border-[#dde4ec] bg-white'}`}>
                <div className="flex items-center gap-2 text-[11px] text-[#6b7685]">
                  <span className="font-mono">{c.author_id.slice(0, 14)}…</span>
                  <span>·</span>
                  <span>{new Date(c.created_at).toLocaleString()}</span>
                  {c.visibility === 'internal' && <Pill tone="warn">internal</Pill>}
                </div>
                <div className="mt-1 text-[13px] whitespace-pre-wrap">{c.body}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reply box */}
      <section>
        <div className="rounded-xl border border-[#dde4ec] bg-white p-3">
          <div className="text-[10px] uppercase tracking-wide text-[#6b7685] mb-2">Add a comment</div>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="Type your reply…"
            className="w-full px-3 py-2 border border-[#dde4ec] rounded-lg resize-none text-[13px]"
          />
          <div className="mt-2 flex items-center justify-between">
            {isAgent ? (
              <div className="flex items-center gap-2 text-[11px] text-[#6b7685]">
                Visibility:
                {(['public', 'internal'] as const).map(v => (
                  <button key={v} onClick={() => setReplyVisibility(v)}
                    className={`px-2 py-0.5 rounded ${replyVisibility === v ? 'bg-[#1a3a5c] text-white' : 'border border-[#dde4ec] text-[#3d4756]'}`}>
                    {v}
                  </button>
                ))}
              </div>
            ) : <div />}
            <button onClick={postComment} disabled={posting || !reply.trim()} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold inline-flex items-center gap-1 disabled:opacity-50">
              <Send size={12} /> {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      </section>

      {transitioning && (
        <ActionModal
          title={`Transition ticket · current: ${ticket.status}`}
          submitLabel="Transition"
          fields={[
            { key: 'to', label: 'To', type: 'select', required: true, options: [
              { value: 'in_progress', label: 'In progress' },
              { value: 'waiting_on_customer', label: 'Waiting on customer' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'closed', label: 'Closed' },
            ] },
            { key: 'resolution', label: 'Resolution (resolved/closed only)', type: 'textarea' },
            { key: 'assignee_id', label: 'Assignee ID (optional)' },
          ] as FieldSpec[]}
          onClose={() => setTransitioning(false)}
          onSubmit={async (v) => {
            await api.post(`/support/tickets/${id}/transition`, v);
            setTransitioning(false); await load();
          }}
        />
      )}
      {escalating && (
        <ActionModal
          title="Escalate ticket"
          submitLabel="Escalate"
          cta="danger"
          fields={[
            { key: 'escalated_to', label: 'Escalate to (participant ID or team)', required: true },
            { key: 'reason', label: 'Reason', type: 'textarea', required: true },
          ] as FieldSpec[]}
          onClose={() => setEscalating(false)}
          onSubmit={async (v) => {
            await api.post(`/support/tickets/${id}/escalate`, v);
            setEscalating(false); await load();
          }}
        />
      )}
    </div>
  );
}
