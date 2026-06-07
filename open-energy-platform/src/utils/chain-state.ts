// ═══════════════════════════════════════════════════════════════════════════
// Layer D — chain-state derivation.
// open_count / terminal_count for a chain are derived from the append-only
// oe_platform_events log, NOT from the ~80 live chain tables: for each entity
// under a chain_key we take its latest source_chain_status and bucket it open
// vs terminal via a token heuristic. Zero per-chain code — a new chain appears
// automatically the moment it emits its first PlatformEvent with a chain_key.
// ═══════════════════════════════════════════════════════════════════════════
import type { HonoEnv } from './types';

type DB = HonoEnv['Bindings']['DB'];

// Substrings that mark a P6 terminal state across the platform's chains.
// Matching is case-insensitive and substring-based so e.g. 'claim_paid',
// 'force_closed', 'auto_expired', 'write_off' all resolve to terminal.
const TERMINAL_TOKENS = [
  'settled', 'closed', 'reject', 'withdraw', 'cancel', 'expire', 'retire',
  'written_off', 'write_off', 'writeoff', 'paid', 'granted', 'refused',
  'terminated', 'completed', 'archived', 'decommissioned', 'lapsed',
  'cleared', 'dismissed', 'resolved', 'void', 'abandoned',
] as const;

/** True when `status` names a P6 terminal state. Null/empty → open (false). */
export function isTerminalStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return TERMINAL_TOKENS.some((t) => s.includes(t));
}

export interface OpenTerminal {
  open_count: number;
  terminal_count: number;
}

/**
 * Count in-flight (open) vs terminal entities for a chain by reading the
 * latest event per entity_id from oe_platform_events. Bounded per chain_key.
 */
export async function computeOpenTerminal(db: DB, chainKey: string): Promise<OpenTerminal> {
  const res = await db.prepare(
    `WITH latest AS (
       SELECT entity_id, source_chain_status,
              ROW_NUMBER() OVER (
                PARTITION BY entity_id ORDER BY occurred_at DESC, id DESC
              ) AS rn
         FROM oe_platform_events
        WHERE COALESCE(NULLIF(chain_key, ''), 'unattributed') = ?
     )
     SELECT source_chain_status AS status, COUNT(*) AS c
       FROM latest WHERE rn = 1 GROUP BY source_chain_status`,
  ).bind(chainKey).all<{ status: string | null; c: number }>();

  let open = 0;
  let terminal = 0;
  for (const row of (res.results ?? [])) {
    if (isTerminalStatus(row.status)) terminal += Number(row.c) || 0;
    else open += Number(row.c) || 0;
  }
  return { open_count: open, terminal_count: terminal };
}
