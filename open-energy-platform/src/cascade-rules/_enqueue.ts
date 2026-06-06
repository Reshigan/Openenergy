// ═══════════════════════════════════════════════════════════════════════════
// Layer A — shared action-queue helpers for cascade rule files.
// Lifted verbatim from the legacy handleSpecialCascades helpers so migrated
// rules write byte-identical rows. genId() reproduces the original
// generateId() 'id_'+base36 format exactly (NOT crypto.randomUUID) so replayed
// and migrated cascades are indistinguishable from the pre-migration behavior.
// ═══════════════════════════════════════════════════════════════════════════

/** Legacy id generator — 'id_'+base36(time)+base36(random). Byte-faithful to
 *  the pre-migration handleSpecialCascades generateId(). */
export function genId(): string {
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/** Days-from-now helper for action_queue.due_date (YYYY-MM-DD). */
export function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface EnqueueActionInput {
  type: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  actor_id?: string;
  assignee_id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  description?: string;
  due_date?: string | null;
}

export async function enqueueAction(db: any, input: EnqueueActionInput): Promise<void> {
  await enqueueActions(db, [input]);
}

/**
 * Batched variant — inserts many action_queue rows in a single
 * env.DB.batch() round-trip. Falls back to per-row INSERTs if batch()
 * fails so forward progress is preserved.
 */
export async function enqueueActions(db: any, inputs: EnqueueActionInput[]): Promise<void> {
  if (inputs.length === 0) return;
  const now = new Date().toISOString();
  const stmts = inputs.map((input) =>
    db.prepare(`
      INSERT INTO action_queue
        (id, type, priority, actor_id, assignee_id, entity_type, entity_id, title, description, status, due_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).bind(
      genId(),
      input.type,
      input.priority,
      input.actor_id || null,
      input.assignee_id,
      input.entity_type,
      input.entity_id,
      input.title,
      input.description || null,
      input.due_date || null,
      now,
      now,
    ),
  );
  try {
    if (typeof db.batch === 'function') {
      await db.batch(stmts);
      return;
    }
  } catch (err) {
    console.warn('action_queue_batch_failed', (err as Error).message);
  }
  // Fallback: sequential.
  for (const stmt of stmts) {
    try { await stmt.run(); } catch (err) { console.error('Action queue enqueue failed:', err); }
  }
}
