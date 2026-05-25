// ════════════════════════════════════════════════════════════════════════
// ai-assistant — conversational assistant available from any surface.
//
// /api/ai-assistant
//   POST   /sessions                start a session
//   GET    /sessions                caller's sessions
//   GET    /sessions/:id            session detail with message history
//   POST   /sessions/:id/messages   send a user message; returns assistant
//                                    reply with optional tool_call proposals
//   POST   /actions/:id/execute     execute a proposed tool call after
//                                    explicit user confirmation
//
// Backed by the Workers AI binding for the model layer. If AI is not
// bound (local dev), falls back to a deterministic rule-based responder
// so the UX still works.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ─── System prompt + tool catalog ───────────────────────────────────────
const SYSTEM_PROMPT = `You are the Open Energy Platform assistant.
You help SA energy traders, IPPs, lenders, offtakers, grid operators and
regulators navigate the platform. Be concise, surface numbers, and only
propose actions the user can take with their own role. When you suggest
a mutation (create WO, file fault, run dispatch), emit a tool_call object
the UI will surface as a one-click confirm — never execute on your own.`;

// Tool catalog — assistant can propose these as tool_calls and the UI
// shows a confirm-and-execute button.
const TOOLS = [
  { name: 'create_work_order',     description: 'Create an Esums work order',
    params: { site_id: 'string', title: 'string', priority: 'critical|high|medium|low', category: 'string' } },
  { name: 'acknowledge_fault',     description: 'Acknowledge an open fault',
    params: { fault_id: 'string' } },
  { name: 'submit_algo_execution', description: 'Submit a TWAP/VWAP/POV algo',
    params: { algo_type: 'twap|vwap|pov', side: 'buy|sell', energy_type: 'string', volume_mwh: 'number', start_at: 'iso', end_at: 'iso' } },
  { name: 'request_drawdown',      description: 'Request IPP construction drawdown',
    params: { project_id: 'string', requested_amount_zar: 'number', required_by: 'iso' } },
  { name: 'submit_rfq_quote',      description: 'Submit a quote on an open RFQ',
    params: { rfq_id: 'string', price_zar: 'number', volume_offered_mwh: 'number' } },
  { name: 'place_bid',             description: 'Bid on a live auction',
    params: { auction_id: 'string', bid_amount_zar: 'number' } },
];

// ─── Fast retrieval — pull live numbers the model can ground in ─────────
async function retrieveContext(env: HonoEnv['Bindings'], userId: string): Promise<string> {
  const lines: string[] = [];
  try {
    const f = await env.DB.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(hourly_loss_zar),0) AS h FROM om_faults WHERE status IN ('open','acknowledged','in_progress')`).first<any>();
    lines.push(`open_faults=${f?.c || 0} bleed_rate_zar_hour=${Math.round(Number(f?.h || 0))}`);
    const w = await env.DB.prepare(`SELECT COUNT(*) AS c FROM om_work_orders WHERE assigned_to = ? AND status NOT IN ('completed','verified','closed','cancelled')`).bind(userId).first<any>();
    lines.push(`my_open_wos=${w?.c || 0}`);
    const o = await env.DB.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(annual_upside_zar),0) AS u FROM (SELECT 0 AS annual_upside_zar) WHERE 0`).first<any>().catch(() => null);
    if (o) lines.push(`opportunities=${o.c || 0}`);
  } catch { /* swallow */ }
  return lines.join(' · ');
}

// ─── Deterministic fallback responder ────────────────────────────────────
function fallbackResponse(message: string, context: string): { content: string; tool_calls: any[] } {
  const m = message.toLowerCase();
  const tool_calls: any[] = [];
  let content = '';
  if (m.includes('fault')) {
    content = `Live context: ${context}. Tap a fault in the Esums cockpit to acknowledge or dispatch a technician.`;
    if (m.includes('acknowledge')) tool_calls.push({ tool: 'acknowledge_fault', params: { fault_id: '<select-from-fault-list>' } });
  } else if (m.includes('work order') || m.includes('wo')) {
    content = `Open work orders: ${context}. Need to create one? I can prepare a draft.`;
    if (m.includes('create') || m.includes('new')) tool_calls.push({ tool: 'create_work_order', params: { site_id: '<pick-site>', title: '<title>', priority: 'medium', category: 'corrective' } });
  } else if (m.includes('algo') || m.includes('twap') || m.includes('vwap')) {
    content = 'I can stage a TWAP/VWAP execution. Tell me side, volume and window.';
    tool_calls.push({ tool: 'submit_algo_execution', params: { algo_type: 'twap', side: 'buy', energy_type: 'solar', volume_mwh: 0, start_at: '', end_at: '' } });
  } else {
    content = `I'm here to help across trading, settlement, Esums, IPP, lender, carbon and regulator surfaces. Live numbers: ${context}. Ask me to "show open faults", "summarise my work orders", "stage a TWAP execution" or "request a drawdown".`;
  }
  return { content, tool_calls };
}

// ─── Workers AI invocation ──────────────────────────────────────────────
async function callWorkersAi(env: any, history: Array<{ role: string; content: string }>, context: string): Promise<{ content: string; tool_calls: any[] }> {
  // Honour the platform-wide OE_AI_DISABLED kill-switch — fallback responder
  // is fully deterministic and incurs zero Workers-AI cost.
  if (env.OE_AI_DISABLED === '1' || env.OE_AI_DISABLED === 'true') {
    const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content || '';
    return fallbackResponse(lastUser, context);
  }
  if (!env.AI || typeof env.AI.run !== 'function') {
    return fallbackResponse(history[history.length - 1]?.content || '', context);
  }
  try {
    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nLive numbers right now: ${context}\n\nAvailable tools (emit tool_call lines as JSON if relevant): ${JSON.stringify(TOOLS)}` },
      ...history.slice(-8),
    ];
    const resp: any = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages, max_tokens: 600 });
    const out = String(resp?.response || resp?.result || '').trim();
    // Extract tool_calls from any JSON code-blocks
    const tool_calls: any[] = [];
    const toolMatches = out.matchAll(/```(?:json)?\n?(\{[\s\S]*?\})\n?```/g);
    for (const m of toolMatches) {
      try { tool_calls.push(JSON.parse(m[1])); } catch { /* ignore */ }
    }
    const stripped = out.replace(/```(?:json)?\n?[\s\S]*?```/g, '').trim();
    return { content: stripped || out, tool_calls };
  } catch {
    return fallbackResponse(history[history.length - 1]?.content || '', context);
  }
}

// ─── Endpoints ──────────────────────────────────────────────────────────
r.get('/sessions', async (c) => {
  const user = getCurrentUser(c);
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_ai_sessions WHERE participant_id = ? ORDER BY last_message_at DESC LIMIT 50`).bind(user.id).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/sessions', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  const id = genId('ais');
  await c.env.DB.prepare(`
    INSERT INTO oe_ai_sessions (id, participant_id, surface_context, title, last_message_at)
    VALUES (?,?,?,?,datetime('now'))
  `).bind(id, user.id, b.surface_context || null, b.title || 'New chat').run();
  return c.json({ success: true, data: { id } }, 201);
});

r.get('/sessions/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const sess = await c.env.DB.prepare(`SELECT * FROM oe_ai_sessions WHERE id = ? AND participant_id = ?`).bind(id, user.id).first<any>();
  if (!sess) return c.json({ success: false, error: 'not found' }, 404);
  const messages = await c.env.DB.prepare(`SELECT * FROM oe_ai_messages WHERE session_id = ? ORDER BY created_at ASC`).bind(id).all();
  return c.json({ success: true, data: { session: sess, messages: messages.results || [] } });
});

r.post('/sessions/:id/messages', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.content) return c.json({ success: false, error: 'content required' }, 400);
  const sess = await c.env.DB.prepare(`SELECT * FROM oe_ai_sessions WHERE id = ? AND participant_id = ?`).bind(id, user.id).first<any>();
  if (!sess) return c.json({ success: false, error: 'not found' }, 404);
  // Store user message
  const userMsgId = genId('aim');
  await c.env.DB.prepare(`
    INSERT INTO oe_ai_messages (id, session_id, role, content) VALUES (?,?,?,?)
  `).bind(userMsgId, id, 'user', String(b.content)).run();
  // Build history + call model
  const history = await c.env.DB.prepare(`SELECT role, content FROM oe_ai_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 20`).bind(id).all<{ role: string; content: string }>();
  const context = await retrieveContext(c.env, user.id);
  const reply = await callWorkersAi(c.env as any, (history.results || []) as any[], context);
  const assistantMsgId = genId('aim');
  await c.env.DB.prepare(`
    INSERT INTO oe_ai_messages (id, session_id, role, content, tool_calls_json)
    VALUES (?,?,?,?,?)
  `).bind(assistantMsgId, id, 'assistant', reply.content, reply.tool_calls.length ? JSON.stringify(reply.tool_calls) : null).run();
  // Persist tool-call proposals as actions awaiting user confirm
  const proposedActions: any[] = [];
  for (const tc of reply.tool_calls) {
    const actionId = genId('aia');
    await c.env.DB.prepare(`
      INSERT INTO oe_ai_actions (id, message_id, action_kind, payload_json, outcome)
      VALUES (?,?,?,?,?)
    `).bind(actionId, assistantMsgId, String(tc.tool || tc.name || 'unknown'), JSON.stringify(tc.params || tc.arguments || {}), 'proposed').run();
    proposedActions.push({ id: actionId, tool: tc.tool || tc.name, params: tc.params || tc.arguments });
  }
  await c.env.DB.prepare(`UPDATE oe_ai_sessions SET last_message_at = datetime('now'), message_count = message_count + 2 WHERE id = ?`).bind(id).run();
  return c.json({ success: true, data: { message_id: assistantMsgId, content: reply.content, proposed_actions: proposedActions } });
});

// User clicks "Confirm and execute" on a proposed action
r.post('/actions/:id/execute', async (c) => {
  void getCurrentUser(c);
  const id = c.req.param('id');
  const action = await c.env.DB.prepare(`SELECT * FROM oe_ai_actions WHERE id = ?`).bind(id).first<any>();
  if (!action) return c.json({ success: false, error: 'not found' }, 404);
  if (action.outcome !== 'proposed') return c.json({ success: false, error: `already ${action.outcome}` }, 409);
  // Mark accepted; the SPA actually invokes the matching API endpoint and
  // reports back via /actions/:id/complete. This lets all step-up gates
  // apply on the real surface (no AI-side bypass).
  await c.env.DB.prepare(`UPDATE oe_ai_actions SET outcome = 'accepted' WHERE id = ?`).bind(id).run();
  return c.json({ success: true, data: { id, kind: action.action_kind, payload: JSON.parse(action.payload_json) } });
});

r.post('/actions/:id/complete', async (c) => {
  void getCurrentUser(c);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const outcome = b.outcome === 'executed' ? 'executed' : 'failed';
  await c.env.DB.prepare(`
    UPDATE oe_ai_actions SET outcome = ?, executed_at = datetime('now'), result_json = ?
    WHERE id = ?
  `).bind(outcome, b.result ? JSON.stringify(b.result) : null, id).run();
  return c.json({ success: true });
});

// Pin / unpin / delete session
r.post('/sessions/:id/pin', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`UPDATE oe_ai_sessions SET pinned = ? WHERE id = ? AND participant_id = ?`).bind(b.pinned ? 1 : 0, id, user.id).run();
  return c.json({ success: true });
});

r.delete('/sessions/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM oe_ai_messages WHERE session_id = ?`).bind(id).run();
  await c.env.DB.prepare(`DELETE FROM oe_ai_sessions WHERE id = ? AND participant_id = ?`).bind(id, user.id).run();
  return c.json({ success: true });
});

export default r;
