// ═══════════════════════════════════════════════════════════════════════════
// Layer C — Cross-Role Push.
// pushRoleAction() writes a pending row to oe_role_action_queue so the target
// role's workstation IncomingPanel surfaces it. pendingCountForRole() reads the
// badge count, KV-cached (TTL 30s) so thousands of workstation polls don't
// hammer D1 at national scale; the cache is invalidated on every push.
// ═══════════════════════════════════════════════════════════════════════════
import type { HonoBindings } from './types';
import type { PlatformRole } from './platform-event';

export interface RoleActionInput {
  target_role: PlatformRole | string;
  target_participant_id?: string;
  source_event: string;
  source_chain_key?: string;
  source_entity_type: string;
  source_entity_id: string;
  title: string;
  body?: Record<string, unknown>;
  cross_option?: { action_label: string; target_route: string; prefill?: Record<string, unknown> };
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  sla_due_at?: string;
}

function pendingCacheKey(role: string): string {
  return `role_queue_pending:${role}`;
}

export async function pushRoleAction(env: HonoBindings, input: RoleActionInput): Promise<string> {
  const id = `raq_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO oe_role_action_queue
       (id, target_role, target_participant_id, source_event, source_chain_key,
        source_entity_type, source_entity_id, title, body_json, cross_option_json,
        priority, status, sla_due_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
  ).bind(
    id, input.target_role, input.target_participant_id ?? null, input.source_event,
    input.source_chain_key ?? null, input.source_entity_type, input.source_entity_id,
    input.title, JSON.stringify(input.body ?? {}),
    input.cross_option ? JSON.stringify(input.cross_option) : null,
    input.priority ?? 'normal', input.sla_due_at ?? null, now, now,
  ).run();

  // Invalidate the cached pending count for this role.
  try { await env.KV.delete(pendingCacheKey(String(input.target_role))); } catch { /* best-effort */ }

  return id;
}

export async function pendingCountForRole(env: HonoBindings, role: PlatformRole | string): Promise<number> {
  const key = pendingCacheKey(String(role));

  // KV fast path.
  try {
    const cached = await env.KV.get(key);
    if (cached != null) return parseInt(cached, 10) || 0;
  } catch { /* fall through to D1 */ }

  const row = (await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM oe_role_action_queue WHERE target_role = ? AND status = 'pending'`,
  ).bind(role).first()) as { n: number } | null;
  const count = row?.n ?? 0;

  try { await env.KV.put(key, String(count), { expirationTtl: 30 }); } catch { /* best-effort */ }
  return count;
}
