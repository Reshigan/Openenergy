// ════════════════════════════════════════════════════════════════════════
// ThreadPanel — embeddable comments on any entity.
//
// Drop into a detail page:
//   <ThreadPanel entityType="contracts" entityId={contract.id} />
// Backend: GET /api/threads?entity_type=…&entity_id=…, POST /api/threads,
// DELETE /api/threads/:id. The backend cascade fires thread.posted which
// drops a notification for participants the comment @mentions.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { api } from '../lib/api';

type Thread = {
  id: string;
  entity_type: string;
  entity_id: string;
  participant_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  author_name?: string;
  author_role?: string;
};

function initials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ThreadPanel({
  entityType,
  entityId,
  title = 'Discussion',
  currentParticipantId,
}: {
  entityType: string;
  entityId: string;
  title?: string;
  currentParticipantId?: string;
}) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get(`/threads?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`);
      setThreads((r.data?.data || []) as Thread[]);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally { setLoading(false); }
  }, [entityType, entityId]);
  useEffect(() => { void load(); }, [load]);

  const post = async () => {
    const content = draft.trim();
    if (!content) return;
    setSending(true); setErr(null);
    try {
      await api.post('/threads', { entity_type: entityType, entity_id: entityId, content });
      setDraft('');
      await load();
      taRef.current?.focus();
    } catch (er: unknown) {
      setErr(er instanceof Error ? er.message : 'post failed');
    } finally { setSending(false); }
  };

  const del = async (id: string) => {
    if (!confirm('Delete comment?')) return;
    try {
      await api.delete(`/threads/${id}`);
      await load();
    } catch (er: unknown) {
      setErr(er instanceof Error ? er.message : 'delete failed');
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void post(); }
  };

  return (
    <section className="rounded-xl border border-[#dde4ec] bg-white">
      <header className="px-5 py-3 border-b border-[#eef2f7] flex items-center gap-2">
        <MessageSquare size={14} />
        <div className="font-display font-semibold text-[14px] text-[#0f1c2e]">{title}</div>
        <span className="text-[11px] text-[#6b7685] font-normal">{threads.length}</span>
      </header>
      <div className="p-4 space-y-3">
        {err && <div className="text-[12px] text-red-700">{err}</div>}
        {loading ? (
          <div className="text-[12px] text-[#6b7685]">Loading…</div>
        ) : threads.length === 0 ? (
          <div className="text-[12px] text-[#6b7685] py-2">No comments yet. Tag teammates with @name.</div>
        ) : (
          <ul className="space-y-3">
            {threads.map((t) => (
              <li key={t.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-[#dbecfb] text-[#1a3a5c] flex items-center justify-center font-semibold text-[11px] flex-shrink-0">
                  {initials(t.author_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px]">
                    <span className="font-semibold text-[#0f1c2e]">{t.author_name || 'Unknown'}</span>
                    {t.author_role && <span className="ml-2 text-[10px] text-[#6b7685] uppercase">{t.author_role}</span>}
                    <span className="ml-2 text-[10px] text-[#6b7685]">{new Date(t.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-[13px] text-[#3d4756] whitespace-pre-wrap mt-0.5">{t.content}</div>
                </div>
                {currentParticipantId && t.participant_id === currentParticipantId && (
                  <button onClick={() => del(t.id)} title="Delete" className="p-1 text-[#6b7685] hover:text-[#c0392b]">
                    <Trash2 size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="pt-2 border-t border-[#eef2f7]">
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            rows={2}
            placeholder="Add a comment. ⌘+Enter to post. Tag with @name."
            className="w-full px-3 py-2 border border-[#dde4ec] rounded-lg text-[12px] resize-none"
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={post}
              disabled={sending || !draft.trim()}
              className="h-8 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Send size={12} /> {sending ? 'Posting…' : 'Comment'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
