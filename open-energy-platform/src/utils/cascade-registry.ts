// ═══════════════════════════════════════════════════════════════════════════
// Layer A — Cascade Registry.
// Self-registering rule files replace the 780-line handleSpecialCascades
// switch. Each rule declares match(ctx) + run(ctx). runCascadeRegistry() is
// invoked as a fireCascade stage; it evaluates every rule, runs matches,
// and writes an oe_cascade_rule_audit row per run. Error-isolated: a failing
// rule never breaks the cascade.
//   mode 'drive'  → reaction auto-progresses downstream (unattended default)
//   mode 'block'  → enforced upstream at the guard (W2); audited here as a hook
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from './cascade';

export interface CascadeRule {
  id: string;
  match: (ctx: CascadeContext) => boolean;
  run: (ctx: CascadeContext) => Promise<void>;
  mode?: 'drive' | 'block';
}

const REGISTRY: CascadeRule[] = [];

export function registerCascadeRule(rule: CascadeRule): void {
  if (REGISTRY.some(r => r.id === rule.id)) return; // idempotent under repeat imports
  REGISTRY.push(rule);
}

export function listCascadeRules(): ReadonlyArray<CascadeRule> {
  return REGISTRY;
}

/** Test-only: clears the global registry so each test starts clean. */
export function _resetRegistryForTests(): void {
  REGISTRY.length = 0;
}

function genId(): string {
  // crypto.randomUUID matches the other ecosystem layers (rev_/raq_/pev_) and
  // removes the millisecond-collision risk of the prior Math.random()+Date.now().
  return `cra_${crypto.randomUUID()}`;
}

async function auditOutcome(
  ctx: CascadeContext,
  rule: CascadeRule,
  outcome: 'ran' | 'blocked' | 'error',
  detail?: string,
): Promise<void> {
  try {
    await ctx.env.DB.prepare(
      `INSERT INTO oe_cascade_rule_audit
         (id, rule_id, source_event, source_entity_type, source_entity_id, mode, outcome, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      genId(), rule.id, ctx.event, ctx.entity_type, ctx.entity_id,
      rule.mode ?? 'drive', outcome, detail ?? null, new Date().toISOString(),
    ).run();
  } catch {
    /* audit is best-effort; never let it break the cascade */
  }
}

export async function runCascadeRegistry(ctx: CascadeContext): Promise<void> {
  const matched = REGISTRY.filter(rule => {
    try { return rule.match(ctx); } catch { return false; }
  });
  await Promise.allSettled(matched.map(rule =>
    rule.run(ctx)
      .then(() => auditOutcome(ctx, rule, 'ran'))
      .catch((e: unknown) => auditOutcome(ctx, rule, 'error', (e as Error).message)),
  ));
}
