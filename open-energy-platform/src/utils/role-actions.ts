// ═══════════════════════════════════════════════════════════════════════════
// Layer C — Cross-Role Push.
// pushRoleAction() writes a pending row to oe_role_action_queue so the target
// role's workstation IncomingPanel surfaces it. pendingCountForRole() reads the
// badge count, KV-cached (TTL 30s) so thousands of workstation polls don't
// hammer D1 at national scale; the cache is invalidated on every push.
// ═══════════════════════════════════════════════════════════════════════════
import type { HonoBindings } from './types';
import type { PlatformRole } from './platform-event';

export type RoleActionPriority = 'low' | 'normal' | 'high' | 'urgent';

/** Canonical runtime set of valid role-action priorities (single source for
 *  the RoleActionPriority union above) so producers can validate raw input. */
export const ROLE_ACTION_PRIORITIES: ReadonlySet<RoleActionPriority> = new Set([
  'low', 'normal', 'high', 'urgent',
]);

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
  priority?: RoleActionPriority;
  sla_due_at?: string;
}

export function pendingCacheKey(role: string, participantId?: string | null): string {
  return participantId != null
    ? `role_queue_pending:${role}:${participantId}`
    : `role_queue_pending:${role}`;
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

  const role = String(input.target_role);
  // Always invalidate the role-only key (global badge count includes the new row).
  try { await env.KV.delete(pendingCacheKey(role)); } catch { /* best-effort */ }
  // Also invalidate the participant-scoped key when the push targets a specific participant.
  // Role-wide rows (target_participant_id NULL) affect every participant's scoped key and
  // cannot be enumerated; the 30s KV TTL bounds that staleness — intentional.
  if (input.target_participant_id) {
    try { await env.KV.delete(pendingCacheKey(role, input.target_participant_id)); } catch { /* best-effort */ }
  }

  return id;
}

export async function pendingCountForRole(
  env: HonoBindings,
  role: PlatformRole | string,
  participantId?: string | null,
): Promise<number> {
  const key = pendingCacheKey(String(role), participantId);

  // KV fast path.
  try {
    const cached = await env.KV.get(key);
    if (cached != null) return parseInt(cached, 10) || 0;
  } catch { /* fall through to D1 */ }

  let row: { n: number } | null;
  if (participantId != null) {
    // Scoped: role-wide rows + rows targeted to this participant (mirrors the list SCOPE predicate).
    row = (await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM oe_role_action_queue
        WHERE target_role = ? AND status = 'pending'
          AND (target_participant_id IS NULL OR target_participant_id = ?)`,
    ).bind(role, participantId).first()) as { n: number } | null;
  } else {
    // Role-only global count (backward-compat, no participant filter).
    row = (await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM oe_role_action_queue WHERE target_role = ? AND status = 'pending'`,
    ).bind(role).first()) as { n: number } | null;
  }
  const count = row?.n ?? 0;

  try { await env.KV.put(key, String(count), { expirationTtl: 30 }); } catch { /* best-effort */ }
  return count;
}
