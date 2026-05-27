// ═══════════════════════════════════════════════════════════════════════════
// Margin gate state — derives gate_status from oe_margin_calls for a member.
//
// Rules:
//   • No open calls → 'clear'
//   • Open calls all within deadline → 'warning'
//   • Any call past deadline + still open → 'blocked'
// Manual override (override_by set) trumps derived state.
// ═══════════════════════════════════════════════════════════════════════════

export type GateState = {
  member_id: string;
  gate_status: 'clear' | 'warning' | 'blocked';
  open_call_count: number;
  overdue_call_count: number;
  total_call_amount_zar: number;
  earliest_deadline: string | null;
  manual_override: number;
};

export async function recomputeMarginGate(env: any, memberId: string): Promise<GateState> {
  const db = env.DB as D1Database;
  const existing = await db.prepare(`SELECT manual_override FROM margin_enforcement_state WHERE member_id = ?`).bind(memberId).first<any>();
  if (existing?.manual_override) {
    const row = await db.prepare(`SELECT * FROM margin_enforcement_state WHERE member_id = ?`).bind(memberId).first<any>();
    return {
      member_id: memberId,
      gate_status: row.gate_status as any,
      open_call_count: row.open_call_count || 0,
      overdue_call_count: row.overdue_call_count || 0,
      total_call_amount_zar: row.total_call_amount_zar || 0,
      earliest_deadline: row.earliest_deadline,
      manual_override: 1,
    };
  }

  // Aggregate from oe_margin_calls (the Wave 2/L5 margin table).
  const agg = await db.prepare(`
    SELECT
      COUNT(*) AS open_count,
      SUM(CASE WHEN datetime(deadline_at) < datetime('now') THEN 1 ELSE 0 END) AS overdue_count,
      COALESCE(SUM(initial_margin_zar + variation_margin_zar), 0) AS total_amount,
      MIN(deadline_at) AS earliest
      FROM oe_margin_calls
     WHERE member_id = ? AND status IN ('open','posted')
  `).bind(memberId).first<any>().catch(() => null);

  const open = Number(agg?.open_count || 0);
  const overdue = Number(agg?.overdue_count || 0);
  const total = Number(agg?.total_amount || 0);
  const earliest = agg?.earliest || null;

  let status: 'clear' | 'warning' | 'blocked' = 'clear';
  if (overdue > 0) status = 'blocked';
  else if (open > 0) status = 'warning';

  await db.prepare(`
    INSERT INTO margin_enforcement_state (member_id, gate_status, open_call_count, overdue_call_count, total_call_amount_zar, earliest_deadline, last_evaluated_at)
    VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(member_id) DO UPDATE SET
      gate_status = excluded.gate_status,
      open_call_count = excluded.open_call_count,
      overdue_call_count = excluded.overdue_call_count,
      total_call_amount_zar = excluded.total_call_amount_zar,
      earliest_deadline = excluded.earliest_deadline,
      last_evaluated_at = datetime('now')
  `).bind(memberId, status, open, overdue, total, earliest).run();

  return {
    member_id: memberId,
    gate_status: status,
    open_call_count: open,
    overdue_call_count: overdue,
    total_call_amount_zar: total,
    earliest_deadline: earliest,
    manual_override: 0,
  };
}

// Pre-trade guard adapter. Returns { allow, reason_code, severity } so the
// existing pre-trade composition can fold this in alongside credit / mark-age
// / kyc / halt guards.
export async function marginGateGuard(env: any, memberId: string): Promise<{ allow: boolean; reason_code?: string; severity?: 'info' | 'warn' | 'error' }> {
  const db = env.DB as D1Database;
  const row = await db.prepare(`SELECT gate_status FROM margin_enforcement_state WHERE member_id = ?`).bind(memberId).first<any>();
  const status = row?.gate_status || 'clear';
  if (status === 'blocked') {
    return { allow: false, reason_code: 'MARGIN_GATE_BLOCKED', severity: 'error' };
  }
  if (status === 'warning') {
    return { allow: true, reason_code: 'MARGIN_GATE_WARNING', severity: 'warn' };
  }
  return { allow: true };
}
