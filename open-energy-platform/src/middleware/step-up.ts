// ════════════════════════════════════════════════════════════════════════
// step-up — sensitive-operation MFA gate.
//
// Usage on any handler:
//
//   import { requireStepUp } from '../middleware/step-up';
//   router.post('/invoices', requireStepUp('invoice.issue.high'), async (c) => { … });
//
// Checks the most recent successful MFA challenge for the user. If it
// falls inside the role's step_up_grace_seconds, the call proceeds; else
// returns 401 with a `step_up_required` body the SPA uses to mount the
// re-auth challenge dialog.
//
// High-risk ops (listed in HIGH_RISK_OPS — irrevocable money moves, security-
// surface mutations) demand a RECENT fresh challenge: a tight, fixed
// HIGH_RISK_GRACE_SECONDS window that ignores the role's generous normal
// grace. It must be > 0 — a literal zero window can never be satisfied (even a
// challenge completed the same instant fails `age <= 0`), which would brick
// the gated endpoint permanently. 120s is short enough to force a re-auth per
// sensitive action while leaving the SPA's challenge→retry round-trip room.
// ════════════════════════════════════════════════════════════════════════

import { Context, Next } from 'hono';
import { HonoEnv } from '../utils/types';
import { getCurrentUser } from './auth';
import { randomId } from '../utils/auth-tokens';

const HIGH_RISK_OPS = new Set([
  'invoice.issue.high',
  'settlement.transfer',
  'licence.revoke',
  'mfa.reset',
  'api_key.create',
  'webhook.create',
  'kyc.tier_upgrade',
  'admin.role_change',
  'participant.delete',
]);

/** Fresh-challenge window (seconds) for HIGH_RISK_OPS. Must stay > 0. */
export const HIGH_RISK_GRACE_SECONDS = 120;

export function requireStepUp(opType: string) {
  return async (c: Context<HonoEnv>, next: Next) => {
    const user = getCurrentUser(c);
    const policyRow = await c.env.DB.prepare(
      `SELECT step_up_grace_seconds FROM oe_mfa_policies WHERE role = ?`,
    ).bind(user.role).first<{ step_up_grace_seconds: number }>().catch(() => null);
    const grace = HIGH_RISK_OPS.has(opType)
      ? HIGH_RISK_GRACE_SECONDS
      : Number(policyRow?.step_up_grace_seconds || 900);

    if (grace > 0) {
      const row = await c.env.DB.prepare(`
        SELECT id, authenticated_at, expires_at FROM oe_step_up_sessions
        WHERE participant_id = ? AND op_type IN (?, '*')
          AND expires_at > datetime('now')
        ORDER BY authenticated_at DESC LIMIT 1
      `).bind(user.id, opType).first<any>().catch(() => null);
      if (row) {
        // SQLite's `datetime('now')` default stores `YYYY-MM-DD HH:MM:SS` in UTC
        // with no zone marker; `new Date()` would parse that as *local* time and
        // skew the freshness window by the host's UTC offset. Normalise to an
        // explicit UTC instant so the gate is correct regardless of timezone
        // (Workers run UTC; dev/test machines may not).
        const ts = String(row.authenticated_at);
        const iso = /[TZ]/.test(ts) ? ts : ts.replace(' ', 'T') + 'Z';
        const age = (Date.now() - new Date(iso).getTime()) / 1000;
        if (age <= grace) return next();
      }
    }
    return c.json({
      success: false,
      error: 'step_up_required',
      data: {
        op_type: opType,
        message: 'This action requires a fresh MFA challenge.',
        grace_seconds: grace,
        challenge_url: '/api/mfa/challenge',
      },
    }, 401);
  };
}

/** Record a successful step-up challenge for the current user. */
export async function recordStepUpAuth(
  env: HonoEnv['Bindings'],
  participantId: string,
  opType: string,
  method: 'totp' | 'webauthn' | 'recovery',
  graceSeconds: number,
): Promise<void> {
  const id = randomId('stup_');
  const expiresAt = new Date(Date.now() + graceSeconds * 1000).toISOString();
  await env.DB.prepare(`
    INSERT INTO oe_step_up_sessions (id, participant_id, op_type, method, expires_at)
    VALUES (?,?,?,?,?)
  `).bind(id, participantId, opType, method, expiresAt).run();
}
