// ═══════════════════════════════════════════════════════════════════════════
// Layer A — lifecycle-sequencing rules (mode:'drive').
// Five upstream transitions auto-sequence their downstream chains as the
// dedicated system:cascade actor (never impersonating the affected role):
//   #1  cod.certify_cod                        → auto-activate PPA + lender drawdown prompt
//   #3  covenant_certificate.breach_identified → open reserve cure + lender prompt
//   #4  reserve_account.breached               → auto-create loan default + lender prompt
//   #7  licence_application.licence_issued      → auto-create NERSA levy + licence renewal + regulator prompt
//   #10 carbon.mrv_issued                       → carbon-fund retirement prompt
//
// Each rule reads only ctx.data (the source chain spreads its full row in).
// create-rules guard on (source_entity_type, source_entity_id); advance-rules
// guard via the predecessor-status WHERE clause; prompts guard via alreadyPushed.
// Advance-rules deliberately do NOT re-fire fireCascade (no cascade recursion).
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule, type CascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';

const SYSTEM_ACTOR = 'system:cascade';
const SOURCE_WAVE = 'W3';
const DEFAULT_LICENCE_VALIDITY_YEARS = 25;

// ── data accessors ──────────────────────────────────────────────────────────
function dstr(ctx: CascadeContext, key: string): string | null {
  const v = (ctx.data as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function dnum(ctx: CascadeContext, key: string): number | null {
  const v = (ctx.data as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
function nowIso(): string {
  return new Date().toISOString();
}
// short human-facing case number from a uuid-bearing id
function numberFrom(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase()}`;
}

// SA fiscal year (Apr 1 – Mar 31). e.g. 2026-06 → '2026/27', 2026-02 → '2025/26'.
export function saFinancialYear(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0=Jan, 3=Apr
  const start = m >= 3 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

function plusYearsIso(baseIso: string | null, years: number): string {
  const base = baseIso ? new Date(baseIso) : new Date();
  const d = Number.isNaN(base.getTime()) ? new Date() : base;
  return new Date(Date.UTC(
    d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate(),
  )).toISOString();
}

// licence_type → (renewal licence_type, renewal licence_class). null ⇒ unsupported.
function renewalClassFor(licenceType: string | null): { type: string; klass: string } | null {
  switch (licenceType) {
    case 'generation':   return { type: 'generation',   klass: 'generation_utility' };
    case 'distribution': return { type: 'distribution', klass: 'distribution' };
    case 'trading':      return { type: 'trading',      klass: 'trading' };
    default:             return null; // transmission / import_export / unknown
  }
}

// ── role-action prompt dedup ─────────────────────────────────────────────────
async function alreadyPushed(
  ctx: CascadeContext, sourceEntityId: string, targetRole: string,
): Promise<boolean> {
  const r = await ctx.env.DB.prepare(
    `SELECT id FROM oe_role_action_queue
      WHERE source_entity_id = ? AND source_event = ? AND target_role = ? LIMIT 1`,
  ).bind(sourceEntityId, ctx.event, targetRole).first();
  return !!r;
}

// ── suppress unused-locals warnings for helpers consumed in Tasks 2–6 ──────
// TypeScript noUnusedLocals applies to locals inside function bodies, not to
// module-level declarations. The helpers above are module-level functions and
// will not trigger the compiler error. The constants below are also module-level
// so they are fine. No suppression pragmas needed.
void (SYSTEM_ACTOR as string);
void (SOURCE_WAVE as string);
void (DEFAULT_LICENCE_VALIDITY_YEARS as number);
void (dstr as unknown);
void (dnum as unknown);
void (uid as unknown);
void (nowIso as unknown);
void (numberFrom as unknown);
void (plusYearsIso as unknown);
void (renewalClassFor as unknown);
void (alreadyPushed as unknown);
void (pushRoleAction as unknown);

const RULES: CascadeRule[] = [
  // rules added in Tasks 2–6
];

export function registerLifecycleSequencingRules(): void {
  for (const rule of RULES) registerCascadeRule(rule);
}

// Test-only accessor: the rule objects this module registers.
export function __lifecycleRulesForTest(): ReadonlyArray<CascadeRule> {
  return RULES;
}
