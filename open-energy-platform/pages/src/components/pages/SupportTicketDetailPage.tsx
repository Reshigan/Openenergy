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
import { ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { statusLabel } from '../../shared/ease/statusLabel';

// ── design tokens ──────────────────────────────────────────────────────
const BG      = 'var(--s0, oklch(0.96 0.003 250))';
const BG1     = 'var(--s1, oklch(0.99 0.002 80))';
const BG2     = 'var(--s2, oklch(0.93 0.004 250))';
const BORDER  = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1     = 'var(--ink, oklch(0.17 0.010 250))';
const TX2     = 'var(--ink-2, oklch(0.40 0.009 250))';
const TX3     = 'var(--ink-2, oklch(0.60 0.007 250))';
const ACC     = 'var(--accent, oklch(0.46 0.16 55))';
const BAD     = 'var(--bad, oklch(0.48 0.20 20))';
const BAD_BG  = 'color-mix(in oklab, var(--bad) 15%, var(--s1))';
const WARN    = 'var(--accent, oklch(0.50 0.18 55))';
const WARN_BG = 'color-mix(in oklab, var(--warn) 15%, var(--s1))';
const GOOD    = 'var(--good, oklch(0.40 0.16 155))';
const GOOD_BG = 'color-mix(in oklab, var(--good) 15%, var(--s1))';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

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

// ── helpers ────────────────────────────────────────────────────────────
function statusColors(status: Ticket['status']): { bg: string; color: string } {
  if (status === 'resolved' || status === 'closed') return { bg: GOOD_BG, color: GOOD };
  if (status === 'open') return { bg: BAD_BG, color: BAD };
  return { bg: WARN_BG, color: WARN };
}

function priorityColors(p: Ticket['priority']): { bg: string; color: string } {
  if (p === 'urgent') return { bg: BAD_BG, color: BAD };
  if (p === 'high') return { bg: WARN_BG, color: WARN };
  return { bg: BG2, color: TX2 };
}

function escalationColors(s: Escalation['status']): { bg: string; color: string } {
  if (s === 'resolved') return { bg: GOOD_BG, color: GOOD };
  if (s === 'rejected') return { bg: BAD_BG, color: BAD };
  return { bg: WARN_BG, color: WARN };
}

function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <span style={{
      background: bg, color, padding: '2px 8px',
      borderRadius: 12, fontSize: 11, fontWeight: 600,
    }}>
      {children}
    </span>
  );
}

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

  if (loading) return <div style={{ padding: 24 }}><Skeleton variant="card" rows={6} /></div>;
  if (err) return <div style={{ padding: 24 }}><ErrorBanner message={err} onRetry={() => void load()} /></div>;
  if (!ticket) return null;

  const sc = statusColors(ticket.status);
  const pc = priorityColors(ticket.priority);
  const publicComments = comments.filter(c => c.visibility === 'public');
  const internalComments = comments.filter(c => c.visibility === 'internal');

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      height: 'calc(100vh - 50px)',
      background: BG,
      overflow: 'hidden',
    }}>
      {/* ── LEFT COLUMN ── */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>
            Ticket · {ticket.ticket_number}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0, lineHeight: 1.3 }}>
            {ticket.subject}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <Badge bg={sc.bg} color={sc.color}>{statusLabel(ticket.status).text}</Badge>
            <Badge bg={BG2} color={TX2}>{ticket.category}</Badge>
            <Badge bg={pc.bg} color={pc.color}>{ticket.priority}</Badge>
            <span style={{ fontSize: 12, color: TX3, marginLeft: 4 }}>
              Filed {new Date(ticket.created_at).toLocaleString()}
            </span>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Comments</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>{comments.length}</div>
          </div>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Internal</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>{internalComments.length}</div>
          </div>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Escalations</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: escalations.length > 0 ? WARN : TX1, fontFamily: MONO, marginTop: 4 }}>{escalations.length}</div>
          </div>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Updated</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: TX1, marginTop: 6 }}>
              {new Date(ticket.updated_at).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Description */}
        {ticket.description && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Description
            </div>
            <div style={{ fontSize: 13, color: TX1, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {ticket.description}
            </div>
          </div>
        )}

        {/* Resolution */}
        {ticket.resolution && (
          <div style={{ background: GOOD_BG, border: `1px solid ${GOOD}`, borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GOOD, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Resolution
            </div>
            <div style={{ fontSize: 13, color: TX1, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {ticket.resolution}
            </div>
            {ticket.resolved_at && (
              <div style={{ fontSize: 11, color: TX3, marginTop: 8, fontFamily: MONO }}>
                Resolved {new Date(ticket.resolved_at).toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* Escalations */}
        {escalations.length > 0 && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Escalations ({escalations.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {escalations.map(e => {
                const ec = escalationColors(e.status);
                return (
                  <div key={e.id} style={{
                    background: WARN_BG, border: `1px solid ${WARN}`,
                    borderRadius: 6, padding: '10px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Badge bg={ec.bg} color={ec.color}>{e.status}</Badge>
                      <span style={{ fontSize: 12, color: TX2 }}>
                        → <span style={{ fontFamily: MONO }}>{e.escalated_to}</span>
                      </span>
                      <span style={{ fontSize: 11, color: TX3, marginLeft: 'auto', fontFamily: MONO }}>
                        {new Date(e.escalated_at).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: TX1 }}>{e.reason}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Conversation */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Conversation ({comments.length} comment{comments.length === 1 ? '' : 's'})
          </div>
          {comments.length === 0 ? (
            <div style={{ fontSize: 13, color: TX3, padding: '12px 0' }}>No replies yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {comments.map((c, i) => (
                <div key={c.id} style={{
                  border: `1px solid ${c.visibility === 'internal' ? WARN : BORDER}`,
                  background: c.visibility === 'internal' ? WARN_BG : i % 2 === 1 ? BG2 : BG1,
                  borderRadius: 6, padding: '10px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: TX3, fontFamily: MONO }}>
                      {c.author_id.slice(0, 14)}…
                    </span>
                    <span style={{ fontSize: 11, color: TX3 }}>
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                    {c.visibility === 'internal' && (
                      <Badge bg={WARN_BG} color={WARN}>internal</Badge>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: TX1, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {c.body}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reply box */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Add a comment
          </div>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="Type your reply…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 12px', border: `1px solid ${BORDER}`,
              borderRadius: 6, resize: 'none', fontSize: 13,
              color: TX1, background: BG, outline: 'none', lineHeight: 1.5,
              fontFamily: 'inherit',
            }}
          />
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {isAgent ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: TX3 }}>
                <span>Visibility:</span>
                {(['public', 'internal'] as const).map(v => (
                  <button
                    type="button" key={v}
                    onClick={() => setReplyVisibility(v)}
                    style={{
                      padding: '3px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer', fontWeight: 600,
                      background: replyVisibility === v ? ACC : 'transparent',
                      color: replyVisibility === v ? '#fff' : TX2,
                      border: replyVisibility === v ? 'none' : `1px solid ${BORDER}`,
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            ) : <div />}
            <button
              type="button"
              onClick={postComment}
              disabled={posting || !reply.trim()}
              style={{
                background: ACC, color: '#fff', border: 'none',
                padding: '8px 16px', borderRadius: 6, fontWeight: 600,
                cursor: posting || !reply.trim() ? 'not-allowed' : 'pointer',
                fontSize: 13, opacity: posting || !reply.trim() ? 0.5 : 1,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <Send size={12} /> {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div style={{
        borderLeft: `1px solid ${BORDER}`,
        background: BG1,
        overflowY: 'auto',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Navigation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={() => navigate('/cockpit')}
            style={{
              background: 'transparent', color: TX2, border: `1px solid ${BORDER}`,
              padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer',
              fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <ArrowLeft size={13} /> Workstation
          </button>
          <button
            type="button"
            onClick={() => void load()}
            style={{
              background: 'transparent', color: TX2, border: `1px solid ${BORDER}`,
              padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer',
              fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {/* Agent actions */}
        {isAgent && ticket.status !== 'resolved' && ticket.status !== 'closed' && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Agent Actions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={() => setTransitioning(true)}
                style={{
                  background: ACC, color: '#fff', border: 'none',
                  padding: '8px 16px', borderRadius: 6, fontWeight: 600,
                  cursor: 'pointer', fontSize: 13,
                }}
              >
                Transition Status
              </button>
              <button
                type="button"
                onClick={() => setEscalating(true)}
                style={{
                  background: 'transparent', color: ACC, border: `1px solid ${ACC}`,
                  padding: '8px 16px', borderRadius: 6, fontWeight: 600,
                  cursor: 'pointer', fontSize: 13,
                }}
              >
                Escalate Ticket
              </button>
            </div>
          </div>
        )}

        {/* Ticket metadata */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Ticket Details
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Ticket #', value: ticket.ticket_number },
              { label: 'Status', value: <Badge bg={sc.bg} color={sc.color}>{statusLabel(ticket.status).text}</Badge> },
              { label: 'Priority', value: <Badge bg={pc.bg} color={pc.color}>{ticket.priority}</Badge> },
              { label: 'Category', value: ticket.category },
              { label: 'Reporter', value: ticket.reporter_id.slice(0, 16) + '…' },
              { label: 'Assignee', value: ticket.assignee_id ? ticket.assignee_id.slice(0, 16) + '…' : '—' },
              { label: 'Filed', value: new Date(ticket.created_at).toLocaleDateString() },
              { label: 'Updated', value: new Date(ticket.updated_at).toLocaleDateString() },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: TX3 }}>{row.label}</span>
                <span style={{ fontSize: 12, color: TX1, fontFamily: typeof row.value === 'string' ? MONO : undefined, fontWeight: 500 }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Conversation summary */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Activity Summary
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: TX3 }}>Total comments</span>
              <span style={{ fontSize: 12, color: TX1, fontFamily: MONO, fontWeight: 600 }}>{comments.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: TX3 }}>Public</span>
              <span style={{ fontSize: 12, color: TX1, fontFamily: MONO, fontWeight: 600 }}>{publicComments.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: TX3 }}>Internal</span>
              <span style={{ fontSize: 12, color: WARN, fontFamily: MONO, fontWeight: 600 }}>{internalComments.length}</span>
            </div>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, marginTop: 2 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: TX3 }}>Escalations</span>
              <span style={{ fontSize: 12, color: escalations.length > 0 ? WARN : TX1, fontFamily: MONO, fontWeight: 600 }}>{escalations.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
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
