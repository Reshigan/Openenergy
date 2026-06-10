// ═══════════════════════════════════════════════════════════════════════════
// /api/feed — Unified activity feed for all roles.
// Reads from oe_role_action_queue (written by pushRoleAction() in every
// cascade that calls fireCascade). Returns urgency-grouped items with SLA
// countdown, cross-role action options, and per-role badge counts.
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { pendingCountForRole } from '../utils/role-actions';

const feed = new Hono<HonoEnv>();
feed.use('*', authMiddleware);

type FeedPriority = 'urgent' | 'high' | 'normal' | 'low';
type FeedUrgency  = 'urgent' | 'caution' | 'info';

function priorityToUrgency(p: FeedPriority): FeedUrgency {
  if (p === 'urgent') return 'urgent';
  if (p === 'high')   return 'caution';
  return 'info';
}

// Derive a human-readable category from the source_chain_key for filter pills.
function deriveCategory(chainKey: string | null, entityType: string | null): string {
  const k = (chainKey ?? '').toLowerCase();
  const e = (entityType ?? '').toLowerCase();
  if (/stage_gate|milestone|cod|commissioning|construction/.test(k + e)) return 'construction';
  if (/procurement|rfp|rfq|bid|tender/.test(k + e))                       return 'procurement';
  if (/hse|incident|permit|ptw|sheq|safety/.test(k + e))                  return 'hse';
  if (/carbon|mrv|erpa|rec|retirement|offset|itmo|article6/.test(k + e))  return 'carbon';
  if (/licence|sseg|registration|adjudication/.test(k + e))               return 'licensing';
  if (/compliance|inspection|enforcement|levy|surveillance/.test(k + e))  return 'compliance';
  if (/drawdown|covenant|payment|settlement|levy|margin|dscr|lender/.test(k + e)) return 'finance';
  if (/algo|market_abuse|stor|trade_report|allocation|best_exec/.test(k + e))     return 'trading';
  if (/grid|dispatch|curtailment|ancillary|reserve|wheeling/.test(k + e)) return 'grid';
  return 'other';
}

// Extract W-number from chain key like "w49_licence_application" → 49
function extractWave(chainKey: string | null): number | null {
  if (!chainKey) return null;
  const m = chainKey.match(/^w(\d+)_/i);
  return m ? parseInt(m[1], 10) : null;
}

// Compute SLA remaining in ms (null if no deadline or already passed)
function slaRemaining(sla: string | null): number | null {
  if (!sla) return null;
  const ms = new Date(sla).getTime() - Date.now();
  return ms > 0 ? ms : 0;
}

interface RawQueueRow {
  id: string;
  target_role: string;
  source_event: string;
  source_chain_key: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  title: string;
  body_json: string | null;
  cross_option_json: string | null;
  priority: FeedPriority;
  status: string;
  sla_due_at: string | null;
  created_at: string;
  updated_at: string;
}

function shapeFeedItem(row: RawQueueRow) {
  const urgency = priorityToUrgency(row.priority);
  const remaining = slaRemaining(row.sla_due_at);
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(row.body_json ?? '{}'); } catch { /* ok */ }
  let crossOption: unknown = null;
  try { crossOption = JSON.parse(row.cross_option_json ?? 'null'); } catch { /* ok */ }
  return {
    id: row.id,
    urgency,
    priority: row.priority,
    title: row.title,
    body,
    source_event: row.source_event,
    source_chain_key: row.source_chain_key,
    source_entity_type: row.source_entity_type,
    source_entity_id: row.source_entity_id,
    category: deriveCategory(row.source_chain_key, row.source_entity_type),
    wave: extractWave(row.source_chain_key),
    sla_due_at: row.sla_due_at,
    sla_remaining_ms: remaining,
    cross_option: crossOption,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ── GET /api/feed ────────────────────────────────────────────────────────────
// Query params:
//   urgency  = urgent | caution | info | all  (default: all)
//   category = construction | procurement | hse | carbon | licensing |
//              compliance | finance | trading | grid | all  (default: all)
//   status   = pending | acknowledged | all  (default: pending)
//   limit    = 1-100  (default: 50)
//   cursor   = last id for pagination
//   role     = override role (admin only)
feed.get('/', async (c) => {
  const user = getCurrentUser(c);
  const q   = c.req.query();

  // Role resolution — admins can view any role's queue
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let targetRole: any = user.role;
  if (q.role && (user.role === 'admin' || user.role === 'support')) {
    targetRole = q.role;
  }

  const urgencyFilter   = q.urgency   ?? 'all';
  const categoryFilter  = q.category  ?? 'all';
  const statusFilter    = q.status    ?? 'pending';
  const limit           = Math.min(parseInt(q.limit ?? '50', 10) || 50, 100);
  const cursor          = q.cursor ?? null;

  // Build WHERE clause
  const conditions: string[] = [
    `target_role = ?`,
    `(target_participant_id IS NULL OR target_participant_id = ?)`,
  ];
  const binds: unknown[] = [targetRole, user.id];

  if (statusFilter !== 'all') {
    conditions.push(`status = ?`);
    binds.push(statusFilter === 'pending' ? 'pending' : statusFilter);
  } else {
    conditions.push(`status IN ('pending','acknowledged')`);
  }

  // Urgency filter — map back to priority values
  if (urgencyFilter === 'urgent') {
    conditions.push(`priority = 'urgent'`);
  } else if (urgencyFilter === 'caution') {
    conditions.push(`priority = 'high'`);
  } else if (urgencyFilter === 'info') {
    conditions.push(`priority IN ('normal','low')`);
  }

  // Cursor pagination
  if (cursor) {
    conditions.push(`id < ?`);
    binds.push(cursor);
  }

  const where = conditions.join(' AND ');

  const [rows, countRows] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, target_role, source_event, source_chain_key, source_entity_type,
              source_entity_id, title, body_json, cross_option_json, priority,
              status, sla_due_at, created_at, updated_at
       FROM oe_role_action_queue
       WHERE ${where}
       ORDER BY
         CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
         CASE WHEN sla_due_at IS NOT NULL THEN sla_due_at ELSE '9999' END ASC,
         created_at DESC
       LIMIT ?`,
    ).bind(...binds, limit).all<RawQueueRow>(),

    c.env.DB.prepare(
      `SELECT priority, COUNT(*) AS n
       FROM oe_role_action_queue
       WHERE target_role = ?
         AND (target_participant_id IS NULL OR target_participant_id = ?)
         AND status IN ('pending','acknowledged')
       GROUP BY priority`,
    ).bind(targetRole, user.id).all<{ priority: string; n: number }>(),
  ]);

  const items = (rows.results ?? [])
    .map(shapeFeedItem)
    .filter((item) => {
      if (categoryFilter === 'all') return true;
      return item.category === categoryFilter;
    });

  // Aggregate counts
  const countMap: Record<string, number> = {};
  for (const r of countRows.results ?? []) countMap[r.priority] = r.n;
  const urgentCount  = countMap['urgent']  ?? 0;
  const cautionCount = countMap['high']    ?? 0;
  const infoCount    = (countMap['normal'] ?? 0) + (countMap['low'] ?? 0);
  const totalCount   = urgentCount + cautionCount + infoCount;

  const nextCursor = items.length === limit ? items[items.length - 1]?.id ?? null : null;

  return c.json({
    success: true,
    data: {
      items,
      counts: { urgent: urgentCount, caution: cautionCount, info: infoCount, total: totalCount },
      next_cursor: nextCursor,
      role: targetRole,
    },
  });
});

// ── GET /api/feed/badge-counts ────────────────────────────────────────────────
// Returns pending counts for every role — used to populate the top nav role
// tab badges. Admin/support only; regular users get their own count only.
feed.get('/badge-counts', async (c) => {
  const user = getCurrentUser(c);
  const isPrivileged = user.role === 'admin' || user.role === 'support';

  if (!isPrivileged) {
    // Return just own role count
    const n = await pendingCountForRole(c.env, user.role, user.id);
    return c.json({ success: true, data: { [user.role]: n } });
  }

  // Single GROUP BY query instead of N parallel per-role queries
  const rows = await c.env.DB.prepare(
    `SELECT target_role, COUNT(*) AS n
     FROM oe_role_action_queue
     WHERE status = 'pending'
     GROUP BY target_role`,
  ).all<{ target_role: string; n: number }>();

  const data: Record<string, number> = {};
  for (const r of rows.results ?? []) data[r.target_role] = r.n;

  return c.json({
    success: true,
    data,
  });
});

// ── PATCH /api/feed/:id/acknowledge ─────────────────────────────────────────
feed.patch('/:id/acknowledge', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `UPDATE oe_role_action_queue
     SET status = 'acknowledged', actioned_by = ?, actioned_at = ?, updated_at = ?
     WHERE id = ? AND target_role = ? AND status = 'pending'`,
  ).bind(user.id, now, now, id, user.role).run();

  return c.json({ success: true });
});

// ── PATCH /api/feed/:id/dismiss ──────────────────────────────────────────────
feed.patch('/:id/dismiss', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `UPDATE oe_role_action_queue
     SET status = 'dismissed', actioned_by = ?, actioned_at = ?, updated_at = ?
     WHERE id = ? AND target_role = ? AND status IN ('pending','acknowledged')`,
  ).bind(user.id, now, now, id, user.role).run();

  return c.json({ success: true });
});

// ── PATCH /api/feed/:id/action ───────────────────────────────────────────────
// Mark as actioned (user clicked the cross_option CTA)
feed.patch('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `UPDATE oe_role_action_queue
     SET status = 'actioned', actioned_by = ?, actioned_at = ?, updated_at = ?
     WHERE id = ? AND target_role = ? AND status IN ('pending','acknowledged')`,
  ).bind(user.id, now, now, id, user.role).run();

  return c.json({ success: true });
});

export default feed;
