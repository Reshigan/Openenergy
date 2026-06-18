// ═══════════════════════════════════════════════════════════════════════════
// Sandbox demo-tenant seeder.
//
// Seeds a deterministic, idempotent set of DEMO entities into the reserved
// `sandbox_<participant_id>` tenant so a freshly onboarded user can practice
// transactions in isolation. Because every read/write is tenant-fenced, these
// rows are invisible to the caller's real tenant and vice-versa.
//
// GOLDRUSH INVARIANT (load-bearing): demo / synthetic rows are EVER inserted
// ONLY into a `sandbox_*` tenant. NEVER into a real tenant ('default', 't_*',
// or any other non-sandbox id). seedSandboxTenant() asserts isSandboxTenant()
// before any INSERT and THROWS otherwise, so NXT Energy Goldrush sites and
// every real tenant stay untouched.
//
// SECURITY INVARIANT: table/column names in the SQL come only from the static
// string literals below. The participant id and tenant id bind ONLY through
// '?' placeholders, never interpolated into SQL text.
//
// Idempotency: demo rows use deterministic ids (demo_<participantId>_ppaN) and
// INSERT OR IGNORE, so re-running without reset is a pure no-op. The route
// passes { reset: true } so re-entering the sandbox produces the exact same
// clean demo set with no duplicate pile-up.
// ═══════════════════════════════════════════════════════════════════════════
import type { D1Database } from '@cloudflare/workers-types';
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { sandboxTenantId, isSandboxTenant } from '../utils/tenant';

interface DemoPortfolioRow {
  idSuffix: string;
  counterparty_name: string;
  technology: string;
  capacity_mw: number;
  status: string;
}

// Deterministic demo set. Kept small (1-2 rows) and explicit so the practice
// workspace is recognisable but never confused with real data.
const DEMO_PORTFOLIO: DemoPortfolioRow[] = [
  {
    idSuffix: 'ppa1',
    counterparty_name: 'Demo Offtaker (sandbox practice)',
    technology: 'solar_pv',
    capacity_mw: 10,
    status: 'negotiating',
  },
  {
    idSuffix: 'ppa2',
    counterparty_name: 'Demo Wind Buyer (sandbox practice)',
    technology: 'wind',
    capacity_mw: 25,
    status: 'negotiating',
  },
];

/**
 * Seed (or reset) the isolated demo entities for a participant's sandbox
 * tenant. Returns the resolved tenant id and the number of demo rows present
 * after seeding.
 */
export async function seedSandboxTenant(
  db: D1Database,
  participantId: string,
  opts?: { reset?: boolean },
): Promise<{ tenantId: string; seeded: number }> {
  const tenantId = sandboxTenantId(participantId);

  // Load-bearing Goldrush guard: refuse to write demo data anywhere but a
  // sandbox tenant. sandboxTenantId always returns sandbox_*, so this only
  // ever trips if the namespace contract is broken upstream.
  if (!isSandboxTenant(tenantId)) {
    throw new Error('refusing to seed demo data into a non-sandbox tenant');
  }

  if (opts?.reset) {
    await db
      .prepare('DELETE FROM off_ppa_portfolio WHERE participant_id = ? AND tenant_id = ?')
      .bind(participantId, tenantId)
      .run();
  }

  for (const row of DEMO_PORTFOLIO) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO off_ppa_portfolio
           (id, participant_id, tenant_id, counterparty_name, technology, capacity_mw, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(
        `demo_${participantId}_${row.idSuffix}`,
        participantId,
        tenantId,
        row.counterparty_name,
        row.technology,
        row.capacity_mw,
        row.status,
      )
      .run();
  }

  const countRow = (await db
    .prepare('SELECT COUNT(*) AS n FROM off_ppa_portfolio WHERE participant_id = ? AND tenant_id = ?')
    .bind(participantId, tenantId)
    .first<{ n: number }>()) ?? { n: 0 };

  return { tenantId, seeded: countRow.n };
}

/**
 * OPTIONAL cascade-side consistency rule. The route already seeds synchronously
 * in the HTTP path; this rule re-seeds on the 'onboarding.sandbox_entered'
 * event purely for audit/consistency and is idempotent (reset:false means a
 * pure no-op when the deterministic rows already exist). Correctness of the
 * route response never depends on this firing.
 */
export function registerSandboxSeedRules(): void {
  registerCascadeRule({
    id: 'sandbox_seed.entered',
    match: (ctx: CascadeContext) => ctx.event === 'onboarding.sandbox_entered',
    run: async (ctx: CascadeContext) => {
      await seedSandboxTenant(ctx.env.DB, ctx.entity_id, { reset: false });
    },
  });
}
