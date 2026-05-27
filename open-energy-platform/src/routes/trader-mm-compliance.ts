// ═══════════════════════════════════════════════════════════════════════════
// Wave 9 — Trader market-maker compliance routes.
//
// Flat-mounted at /api/trader/mm-compliance.
//
// Roles (per [[feedback_role_ux_depth]]):
//   • READ_ROLES: admin/support/trader/regulator
//   • ADMIN_WRITE: admin/support (record daily performance, excuse a miss,
//     acknowledge a breach)
//   • TRADER_WRITE: admin/support/trader (acknowledge own breach)
//
// Every mutation fires a matching cascade. Daily 05:00 UTC cron sweeps
// yesterday's performance, advances the breach state machine, and fires
// trader.mm_obligation_breach_escalated → regulator inbox 'high' once on
// the first crossing into 'escalated'.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  evaluateCompliance,
  applyDailyOutcome,
  isEscalationTransition,
  isBreachTransition,
  isWarningTransition,
  isRecoveryTransition,
  type BreachStatus,
  type ComplianceStatus,
} from '../utils/mm-compliance-spec';

const ADMIN_WRITE = new Set(['admin', 'support']);
const TRADER_ACK = new Set(['admin', 'support', 'trader']);
const READ_ROLES = new Set(['admin', 'support', 'trader', 'regulator']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ObligationRow {
  id: string;
  participant_id: string;
  energy_type: string;
  obligation_type: string;
  two_sided_minutes_per_day: number | null;
  max_spread_bps: number | null;
  uptime_target_pct: number | null;
  min_quote_volume_mwh: number | null;
  effective_from: string;
  effective_to: string;
  monthly_fee_zar: number | null;
  performance_score: number | null;
  status: string;
  consecutive_misses: number | null;
  breach_status: BreachStatus | null;
  warning_threshold: number | null;
  breach_threshold: number | null;
  escalation_threshold: number | null;
  last_breach_at: string | null;
  last_escalated_at: string | null;
  last_acknowledged_at: string | null;
  last_acknowledged_by: string | null;
  created_at: string;
}

interface PerformanceRow {
  id: string;
  obligation_id: string;
  day: string;
  two_sided_minutes: number | null;
  avg_spread_bps: number | null;
  uptime_pct: number | null;
  total_volume_mwh: number | null;
  compliant: number;
  fee_earned_zar: number | null;
  penalty_zar: number | null;
  compliance_status: ComplianceStatus | null;
  excused_reason: string | null;
  excused_by: string | null;
  excused_at: string | null;
  created_at: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function scopeFilter(role: string, userId: string): { sql: string; params: unknown[] } {
  if (role === 'admin' || role === 'support' || role === 'regulator') {
    return { sql: '', params: [] };
  }
  // trader only sees their own obligations.
  return { sql: ' AND participant_id = ?', params: [userId] };
}

// ─── List obligations with breach status + KPIs ──────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const breach = c.req.query('breach_status');
  let sql = 'SELECT * FROM oe_mm_obligations WHERE 1=1';
  const params: unknown[] = [];

  if (breach) { sql += ' AND breach_status = ?'; params.push(breach); }

  const scope = scopeFilter(user.role, user.id);
  sql += scope.sql;
  params.push(...scope.params);

  sql += ' ORDER BY created_at DESC LIMIT 500';
  const { results } = await c.env.DB.prepare(sql).bind(...params).all<ObligationRow>();
  return c.json({ success: true, data: results || [] });
});

// ─── Drill-down: obligation + recent performance history ─────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const obligation = await c.env.DB
    .prepare('SELECT * FROM oe_mm_obligations WHERE id = ?')
    .bind(id).first<ObligationRow>();
  if (!obligation) return c.json({ success: false, error: 'Not found' }, 404);

  if (user.role === 'trader' && obligation.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const perfs = await c.env.DB
    .prepare('SELECT * FROM oe_mm_performance WHERE obligation_id = ? ORDER BY day DESC LIMIT 30')
    .bind(id).all<PerformanceRow>();

  return c.json({ success: true, data: { obligation, performances: perfs.results || [] } });
});

// ─── Record a daily performance row (re-evaluates the breach state machine) ──
app.post('/:id/performance', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !ADMIN_WRITE.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const body = await c.req.json<{
    day: string;
    two_sided_minutes?: number;
    avg_spread_bps?: number;
    uptime_pct?: number;
    total_volume_mwh?: number;
  }>();

  if (!body.day) return c.json({ success: false, error: 'day required' }, 400);

  const obligation = await c.env.DB
    .prepare('SELECT * FROM oe_mm_obligations WHERE id = ?')
    .bind(id).first<ObligationRow>();
  if (!obligation) return c.json({ success: false, error: 'Not found' }, 404);

  const verdict = evaluateCompliance(
    {
      two_sided_minutes_per_day: obligation.two_sided_minutes_per_day,
      max_spread_bps: obligation.max_spread_bps,
      uptime_target_pct: obligation.uptime_target_pct,
      min_quote_volume_mwh: obligation.min_quote_volume_mwh,
      monthly_fee_zar: obligation.monthly_fee_zar,
    },
    {
      two_sided_minutes: body.two_sided_minutes,
      avg_spread_bps: body.avg_spread_bps,
      uptime_pct: body.uptime_pct,
      total_volume_mwh: body.total_volume_mwh,
    },
  );

  const perfId = newId('mmp');
  await c.env.DB.prepare(`
    INSERT INTO oe_mm_performance (
      id, obligation_id, day, two_sided_minutes, avg_spread_bps,
      uptime_pct, total_volume_mwh, compliant, fee_earned_zar, penalty_zar,
      compliance_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    perfId, id, body.day,
    body.two_sided_minutes ?? null, body.avg_spread_bps ?? null,
    body.uptime_pct ?? null, body.total_volume_mwh ?? null,
    verdict.compliance_status === 'compliant' ? 1 : 0,
    verdict.fee_earned_zar, verdict.penalty_zar,
    verdict.compliance_status,
  ).run();

  const previousBreach: BreachStatus = (obligation.breach_status as BreachStatus) ?? 'none';
  const previousMisses = Number(obligation.consecutive_misses ?? 0);
  const next = applyDailyOutcome({
    previousMisses,
    previousBreach,
    todayStatus: verdict.compliance_status,
    thresholds: {
      warning_threshold: obligation.warning_threshold,
      breach_threshold: obligation.breach_threshold,
      escalation_threshold: obligation.escalation_threshold,
    },
  });

  const nowIso = new Date().toISOString();
  const sets: string[] = [
    'consecutive_misses = ?',
    'breach_status = ?',
  ];
  const updateParams: unknown[] = [next.consecutive_misses, next.breach_status];

  if (isBreachTransition(previousBreach, next.breach_status)) {
    sets.push('last_breach_at = ?'); updateParams.push(nowIso);
  }
  if (isEscalationTransition(previousBreach, next.breach_status)) {
    sets.push('last_escalated_at = ?'); updateParams.push(nowIso);
  }
  updateParams.push(id);

  await c.env.DB
    .prepare(`UPDATE oe_mm_obligations SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...updateParams).run();

  // Always fire compliance_recorded so the audit chain captures the day.
  await fireCascade({
    event: 'trader.mm_compliance_recorded',
    actor_id: user.id,
    entity_type: 'oe_mm_performance',
    entity_id: perfId,
    data: {
      obligation_id: id,
      participant_id: obligation.participant_id,
      energy_type: obligation.energy_type,
      day: body.day,
      compliance_status: verdict.compliance_status,
      penalty_zar: verdict.penalty_zar,
      consecutive_misses: next.consecutive_misses,
    },
    env: c.env,
  });

  // State-transition cascades (fire-once).
  if (isWarningTransition(previousBreach, next.breach_status)) {
    await fireCascade({
      event: 'trader.mm_obligation_warning',
      actor_id: user.id,
      entity_type: 'oe_mm_obligations',
      entity_id: id,
      data: { participant_id: obligation.participant_id, energy_type: obligation.energy_type },
      env: c.env,
    });
  }
  if (isBreachTransition(previousBreach, next.breach_status)) {
    await fireCascade({
      event: 'trader.mm_obligation_breach',
      actor_id: user.id,
      entity_type: 'oe_mm_obligations',
      entity_id: id,
      data: { participant_id: obligation.participant_id, energy_type: obligation.energy_type },
      env: c.env,
    });
  }
  if (isEscalationTransition(previousBreach, next.breach_status)) {
    await fireCascade({
      event: 'trader.mm_obligation_breach_escalated',
      actor_id: user.id,
      entity_type: 'oe_mm_obligations',
      entity_id: id,
      data: {
        participant_id: obligation.participant_id,
        energy_type: obligation.energy_type,
        consecutive_misses: next.consecutive_misses,
      },
      env: c.env,
    });
  }
  if (isRecoveryTransition(previousBreach, next.breach_status)) {
    await fireCascade({
      event: 'trader.mm_obligation_recovered',
      actor_id: user.id,
      entity_type: 'oe_mm_obligations',
      entity_id: id,
      data: { participant_id: obligation.participant_id, energy_type: obligation.energy_type },
      env: c.env,
    });
  }

  return c.json({
    success: true,
    data: {
      performance_id: perfId,
      verdict,
      consecutive_misses: next.consecutive_misses,
      breach_status: next.breach_status,
    },
  });
});

// ─── Excuse a miss day (admin) — does NOT reset counter ──────────────────────
app.post('/performance/:perfId/excuse', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !ADMIN_WRITE.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const perfId = c.req.param('perfId');
  const body = await c.req.json<{ excused_reason: string }>();
  if (!body.excused_reason) {
    return c.json({ success: false, error: 'excused_reason required' }, 400);
  }

  const perf = await c.env.DB
    .prepare('SELECT * FROM oe_mm_performance WHERE id = ?')
    .bind(perfId).first<PerformanceRow>();
  if (!perf) return c.json({ success: false, error: 'Not found' }, 404);
  if (perf.compliance_status !== 'miss') {
    return c.json({ success: false, error: `Cannot excuse a ${perf.compliance_status} row` }, 409);
  }

  await c.env.DB.prepare(`
    UPDATE oe_mm_performance
    SET compliance_status='excused', excused_reason=?, excused_by=?, excused_at=datetime('now'),
        penalty_zar=0
    WHERE id=?
  `).bind(body.excused_reason, user.id, perfId).run();

  await fireCascade({
    event: 'trader.mm_performance_excused',
    actor_id: user.id,
    entity_type: 'oe_mm_performance',
    entity_id: perfId,
    data: { obligation_id: perf.obligation_id, day: perf.day, reason: body.excused_reason },
    env: c.env,
  });

  return c.json({ success: true });
});

// ─── Acknowledge a breach (trader on their own row) ─────────────────────────
app.post('/:id/acknowledge', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !TRADER_ACK.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const body = await c.req.json<{ notes?: string }>().catch(() => ({} as { notes?: string }));

  const obligation = await c.env.DB
    .prepare('SELECT * FROM oe_mm_obligations WHERE id = ?')
    .bind(id).first<ObligationRow>();
  if (!obligation) return c.json({ success: false, error: 'Not found' }, 404);

  if (user.role === 'trader' && obligation.participant_id !== user.id) {
    return c.json({ success: false, error: 'Not your obligation' }, 403);
  }

  if (obligation.breach_status === 'none') {
    return c.json({ success: false, error: 'Nothing to acknowledge' }, 409);
  }

  await c.env.DB.prepare(`
    UPDATE oe_mm_obligations
    SET last_acknowledged_at=datetime('now'), last_acknowledged_by=?
    WHERE id=?
  `).bind(user.id, id).run();

  await fireCascade({
    event: 'trader.mm_obligation_acknowledged',
    actor_id: user.id,
    entity_type: 'oe_mm_obligations',
    entity_id: id,
    data: {
      participant_id: obligation.participant_id,
      energy_type: obligation.energy_type,
      breach_status: obligation.breach_status,
      notes: body.notes ?? null,
    },
    env: c.env,
  });

  return c.json({ success: true });
});

export default app;
