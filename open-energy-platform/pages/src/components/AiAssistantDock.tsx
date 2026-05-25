// ════════════════════════════════════════════════════════════════════════
// AiAssistantDock — global, dismissible chat dock that opens from any
// page. Wired to /api/ai-assistant. Surface_context auto-derived from
// pathname so the model knows what the user is looking at.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, Loader2, CheckCircle, AlertOctagon } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api';

type Msg = { id: string; role: 'user' | 'assistant' | 'system'; content: string; tool_calls_json?: string | null; created_at: string };
type ProposedAction = { id: string; tool: string; params: Record<string, any> };

export function AiAssistantDock() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [proposed, setProposed] = useState<Record<string, ProposedAction[]>>({});
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Probe /api/health.features.ai_enabled once — if false, the operator
  // has the OE_AI_DISABLED kill-switch on and the dock should not render.
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    fetch('/api/health').then((r) => r.json())
      .then((j) => setAiEnabled(j?.features?.ai_enabled !== false))
      .catch(() => setAiEnabled(true));
  }, []);

  const surfaceFromPath = (() => {
    const p = location.pathname;
    if (p.startsWith('/esums')) return 'esums';
    if (p.startsWith('/trading') || p.startsWith('/trader')) return 'trading';
    if (p.startsWith('/settlement')) return 'settlement';
    if (p.startsWith('/lender')) return 'lender';
    if (p.startsWith('/regulator')) return 'regulator';
    if (p.startsWith('/grid')) return 'grid';
    if (p.startsWith('/carbon')) return 'carbon';
    if (p.startsWith('/marketplace')) return 'marketplace';
    return 'platform';
  })();

  const ensureSession = async () => {
    if (sessionId) return sessionId;
    const r = await api.post('/ai-assistant/sessions', { surface_context: surfaceFromPath, title: 'Chat' });
    const id = r.data?.data?.id;
    setSessionId(id);
    return id;
  };

  const send = async () => {
    const txt = draft.trim();
    if (!txt || busy) return;
    setBusy(true);
    setDraft('');
    const sid = await ensureSession();
    // Optimistic
    const userMsg: Msg = { id: `tmp-${Date.now()}`, role: 'user', content: txt, created_at: new Date().toISOString() };
    setMessages((m) => [...m, userMsg]);
    try {
      const r = await api.post(`/ai-assistant/sessions/${sid}/messages`, { content: txt });
      const d = r.data?.data;
      const assistantMsg: Msg = {
        id: d?.message_id, role: 'assistant', content: d?.content || '',
        tool_calls_json: null, created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, assistantMsg]);
      if (d?.proposed_actions?.length) {
        setProposed((p) => ({ ...p, [assistantMsg.id]: d.proposed_actions }));
      }
    } finally { setBusy(false); }
  };

  // Auto-scroll
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  const acceptAction = async (msgId: string, action: ProposedAction) => {
    const r = await api.post(`/ai-assistant/actions/${action.id}/execute`, {});
    const kind = r.data?.data?.kind;
    const payload = r.data?.data?.payload || {};
    let result: any = null; let outcome: 'executed' | 'failed' = 'executed';
    try {
      switch (kind) {
        case 'create_work_order':
          result = await api.post('/esums/work-orders', payload).then((x) => x.data); break;
        case 'acknowledge_fault':
          result = await api.post(`/esums/faults/${payload.fault_id}/acknowledge`, {}).then((x) => x.data); break;
        case 'submit_algo_execution':
          result = await api.post('/trading-deep/algos', payload).then((x) => x.data); break;
        case 'request_drawdown':
          result = await api.post('/ipp-deep/drawdowns', payload).then((x) => x.data); break;
        case 'submit_rfq_quote':
          result = await api.post(`/marketplace-l5/rfqs/${payload.rfq_id}/quotes`, payload).then((x) => x.data); break;
        case 'place_bid':
          result = await api.post(`/marketplace-l5/auctions/${payload.auction_id}/bids`, payload).then((x) => x.data); break;
        default: outcome = 'failed';
      }
    } catch (e: any) {
      outcome = 'failed';
      result = { error: e?.response?.data?.error || e?.message };
    }
    await api.post(`/ai-assistant/actions/${action.id}/complete`, { outcome, result });
    // Hide accepted action from list
    setProposed((p) => ({ ...p, [msgId]: (p[msgId] || []).filter((a) => a.id !== action.id) }));
    // Inject a system note into the chat
    setMessages((m) => [...m, {
      id: `sys-${Date.now()}`, role: 'system',
      content: outcome === 'executed' ? `✓ Executed ${kind}` : `✗ Failed: ${result?.error || 'unknown'}`,
      created_at: new Date().toISOString(),
    }]);
  };

  // Hide on unauth surfaces (login, public status, public portal/legal)
  const hideOnPaths = ['/login', '/sso-landing', '/register', '/forgot-password', '/reset-password', '/status', '/legal'];
  if (hideOnPaths.some((p) => location.pathname.startsWith(p))) return null;
  if (location.pathname.startsWith('/portal/')) return null;
  if (location.pathname.startsWith('/esums/field')) return null; // small-screen UI
  if (!localStorage.getItem('token')) return null;
  // Hide when operator has flipped OE_AI_DISABLED — /api/health returns
  // features.ai_enabled = false. The deterministic opportunity engine in
  // Esums + per-role launch boards keep the platform fully usable.
  if (aiEnabled === false) return null;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        aria-label="Open AI assistant"
        className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full bg-[#1a3a5c] hover:bg-[#0b1c30] text-white shadow-lg flex items-center justify-center transition-colors"
        style={{ boxShadow: '0 4px 14px rgba(26,58,92,0.4)' }}>
        <Sparkles size={20} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[380px] h-[560px] max-h-[80vh] rounded-xl bg-white border border-[#dde4ec] shadow-2xl flex flex-col"
         style={{ boxShadow: '0 12px 32px rgba(15,28,46,0.25)' }}>
      <header className="px-3 py-2 border-b border-[#eef2f7] flex items-center gap-2 bg-gradient-to-r from-[#1e3a5f] to-[#0b1c30] text-white rounded-t-xl">
        <Sparkles size={16} className="text-[#f6c44a]" />
        <div className="flex-1">
          <div className="text-[13px] font-semibold">Open Energy Assistant</div>
          <div className="text-[10px] opacity-80 capitalize">context: {surfaceFromPath}</div>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 hover:bg-white/10 rounded">
          <X size={16} />
        </button>
      </header>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-[13px]">
        {messages.length === 0 && (
          <div className="text-[12px] text-[#6b7685] italic py-2">
            Hi — ask me anything about your fleet, trades, settlements, or anything else on the platform.
            I can also propose actions which you confirm before they execute.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id}>
            <div className={`p-2 rounded-lg max-w-[85%] ${
              m.role === 'user' ? 'ml-auto bg-[#1a3a5c] text-white' :
              m.role === 'system' ? 'mx-auto bg-[#eef2f7] text-[#3d4756] text-[11px]' :
              'bg-[#f8fafc] border border-[#eef2f7] text-[#0f1c2e]'
            }`}>
              <div className="whitespace-pre-wrap leading-snug">{m.content}</div>
            </div>
            {proposed[m.id]?.length ? (
              <ul className="mt-1 ml-2 space-y-1">
                {proposed[m.id].map((a) => (
                  <li key={a.id} className="rounded-lg border border-[#3b82c4] bg-[#f8fbff] p-2">
                    <div className="text-[11px] font-mono text-[#3b82c4]">{a.tool}</div>
                    <pre className="text-[10px] mt-1 text-[#3d4756] whitespace-pre-wrap">{JSON.stringify(a.params, null, 2)}</pre>
                    <div className="mt-1 flex gap-1">
                      <button onClick={() => acceptAction(m.id, a)}
                              className="h-7 px-2 rounded bg-[#1a8a5b] text-white text-[11px] font-semibold inline-flex items-center gap-1">
                        <CheckCircle size={12} /> Confirm + execute
                      </button>
                      <button onClick={() => setProposed((p) => ({ ...p, [m.id]: p[m.id].filter((x) => x.id !== a.id) }))}
                              className="h-7 px-2 rounded bg-white border border-[#dde4ec] text-[#c0392b] text-[11px] font-semibold">
                        Dismiss
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
        {busy && (
          <div className="bg-[#f8fafc] border border-[#eef2f7] rounded-lg p-2 inline-flex items-center gap-2 text-[12px] text-[#6b7685]">
            <Loader2 size={14} className="animate-spin" /> Thinking…
          </div>
        )}
      </div>
      <div className="border-t border-[#eef2f7] p-2 flex gap-1">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} disabled={busy}
               onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
               placeholder="Ask anything…"
               className="flex-1 h-9 px-3 rounded border border-[#dde4ec] text-[13px]" />
        <button onClick={send} disabled={busy || !draft.trim()}
                className="h-9 px-3 rounded bg-[#1a3a5c] text-white text-[12px] font-semibold disabled:opacity-50 inline-flex items-center gap-1">
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

export default AiAssistantDock;
