// ═══════════════════════════════════════════════════════════════════════════
// POPIA Section 19 PII access accounting.
//
// When an actor (typically admin / regulator / support) views or exports the
// personal data of another participant, we MUST record it. The log is the
// foundation for:
//   • Section 23(1) — data subject's right to know who has accessed their info
//   • Section 22   — security compromise investigations
//   • Section 19   — "accountability" general principle
//
// Usage (in a route handler):
//   await logPiiAccess(c.env, {
//     actor_id: user.id,
//     subject_id: targetParticipantId,
//     access_type: 'admin_view',
//     justification: 'Admin viewing KYC queue',
//   });
//
// Self-reads (actor_id === subject_id) are skipped — a user reading their own
// data doesn't need an audit entry.
// ═══════════════════════════════════════════════════════════════════════════

export type PiiAccessType =
  | 'dsar_export'      // full data export under s.23
  | 'impersonation'    // support logged in as subject
  | 'admin_view'       // admin console displayed subject's data
  | 'support_view'     // support console displayed subject's data
  | 'regulator_view'   // regulator pulled subject's data (market data request)
  | 'cross_tenant_view'; // cross-tenant resource read by a privileged actor

export interface PiiAccessEntry {
  actor_id: string;
  subject_id: string;
  access_type: PiiAccessType;
  justification?: string;
}

function genPiiId(): string {
  return 'pii_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Insert one row into popia_pii_access_log. Silently swallows DB errors so a
 * log write failure never breaks the caller's primary action — POPIA
 * accountability is important but not worth surfacing as a 500 to the user.
 * Errors still surface via the cascade DLQ when called from fireCascade paths.
 */
export async function logPiiAccess(
  env: { DB: { prepare: (sql: string) => { bind: (...args: unknown[]) => { run: () => Promise<unknown> } } } },
  entry: PiiAccessEntry,
): Promise<void> {
  if (!entry.actor_id || !entry.subject_id) return;
  if (entry.actor_id === entry.subject_id) return; // no log for self-access
  try {
    await env.DB
      .prepare(
        `INSERT INTO popia_pii_access_log
           (id, actor_id, subject_id, access_type, justification, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(
        genPiiId(),
        entry.actor_id,
        entry.subject_id,
        entry.access_type,
        entry.justification || null,
      )
      .run();
  } catch (err) {
    // Last-resort logging. Don't throw — the caller's main path must complete.
    console.warn('pii_access_log_failed', (err as Error).message);
  }
}

/**
 * Log a batch of accesses at once — used after bulk list endpoints that
 * surface many subjects' data in a single response. Skips self-reads and
 * duplicates inside the batch. Keeps the DB roundtrips linear so this stays
 * friendly inside a Workers request budget.
 */
export async function logPiiAccessBatch(
  env: { DB: { prepare: (sql: string) => { bind: (...args: unknown[]) => { run: () => Promise<unknown> } } } },
  actor_id: string,
  subject_ids: string[],
  access_type: PiiAccessType,
  justification?: string,
): Promise<void> {
  if (!actor_id) return;
  const unique = Array.from(new Set(subject_ids.filter((id) => id && id !== actor_id)));
  for (const subject_id of unique) {
    await logPiiAccess(env, { actor_id, subject_id, access_type, justification });
  }
}

/**
 * Infer the appropriate access_type from the caller's role. Used when a
 * single read endpoint is reachable by multiple roles and we want a
 * consistent log entry shape without the caller having to care.
 */
export function inferAccessType(role: string): PiiAccessType {
  switch (role) {
    case 'admin':      return 'admin_view';
    case 'support':    return 'support_view';
    case 'regulator':  return 'regulator_view';
    default:           return 'cross_tenant_view';
  }
}
