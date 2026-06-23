// Layer A - onboarding provisioning.
// Turns wizard data into real entities, then writes a getting-started MANIFEST
// onto the provisioning-log row so the SPA can show "what next" instead of
// dropping the operator on an empty workspace:
//   esums_owner  → om_sites row           (commissioning_status='planned')
//   esco         → om_sites row           (same archetype: operates sites/O&M)
//   ipp_developer→ ipp_projects row       (status='development')
//   trader       → oe_position_limits row (electricity desk limits from risk step)
//   offtaker     → off_ppa_portfolio row  (status='negotiating' procurement intent)
//   other roles  → no business entity, manifest-only (logged as kind='manifest')
//
// Why seed-vs-manifest: a real row is created ONLY where the target is a
// persistent OPERATING object (a site, a project, a desk-limit config, a buyer
// procurement portfolio) AND the wizard collected enough to populate it. Four
// roles now seed (esums_owner, ipp_developer, trader, offtaker). The remaining
// five (lender, carbon_fund, grid_operator, regulator, support) stay manifest
// only: lender/carbon_fund/grid_operator's real artifacts are regulated chain
// CASES that must be initiated through the proper workflow rather than silently
// faked at signup, epc_contractor's work materialises from construction-chain
// cases against an IPP project (not a self-seeded entity), and regulator/support are oversight roles whose work
// materialises from crossings of OTHER roles' chains, so there is nothing to
// seed up front. Those get a manifest only.
//
// Idempotency: guarded on oe_onboarding_provisioning_log UNIQUE (participant_id, kind);
// alreadyProvisioned short-circuits the whole rule on a re-fire.
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { genId } from './_enqueue';
import { buildOnboardingManifest, type ProvisionRef } from './onboarding-manifest';

function parseData(raw: string | null): Record<string, unknown> {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

async function alreadyProvisioned(db: any, participantId: string): Promise<boolean> {
  const r = await db
    .prepare(`SELECT 1 AS x FROM oe_onboarding_provisioning_log WHERE participant_id = ? LIMIT 1`)
    .bind(participantId).first();
  return !!r;
}

async function logProvision(
  db: any, participantId: string, role: string, kind: string,
  entityType: string | null, entityId: string | null, detail: Record<string, unknown>,
  manifest: Record<string, unknown>,
): Promise<void> {
  await db.prepare(
    `INSERT OR IGNORE INTO oe_onboarding_provisioning_log
       (id, participant_id, role, kind, entity_type, entity_id, detail_json, manifest, created_at)
     VALUES (?,?,?,?,?,?,?,?,datetime('now'))`,
  ).bind(
    genId(), participantId, role, kind, entityType, entityId,
    JSON.stringify(detail), JSON.stringify(manifest),
  ).run();
}

// Idempotent provisioning core. Extracted so the onboarding HTTP handler
// (POST /api/onboarding/complete) can run it SYNCHRONOUSLY in the request path
// AND the cascade rule can re-run it for audit/consistency. This split matters
// in production: env.QUEUE is provisioned there, so the cascade rule runs async
// AFTER the HTTP response - the getting-started manifest and any seeded entity
// must be written before the handler returns or the operator lands on an empty
// workspace until the queue drains. alreadyProvisioned short-circuits a re-fire,
// so calling this from both places writes exactly one log row.
//
// roleOverride carries the logical role from the caller (e.g. 'esums_owner' is
// stored in the JWT but is NOT in the participants DB CHECK), falling back to
// the stored participant role when absent.
export async function provisionOnboarding(
  db: any,
  participantId: string,
  roleOverride?: string | null,
): Promise<void> {
  if (await alreadyProvisioned(db, participantId)) return;

  const participantRow = (await db
    .prepare(`SELECT role, onboarding_data, tenant_id FROM participants WHERE id = ?`)
    .bind(participantId).first()) as { role: string; onboarding_data: string | null; tenant_id?: string | null } | null;
  if (!participantRow) return;

  const role = (typeof roleOverride === 'string' && roleOverride) ? roleOverride : participantRow.role;
  const data = parseData(participantRow.onboarding_data);

  // The provisioned entity (if any) is referenced in the manifest so the SPA
  // can deep-link straight to the thing the cascade just created.
  let ref: ProvisionRef = null;

  if (role === 'esums_owner' || role === 'esco') {
    const siteName = typeof data.site_name === 'string' && data.site_name ? data.site_name : 'My site';
    const capacityMw = (num(data.installed_capacity_kw) ?? 0) / 1000;
    const siteId = genId();
    await db.prepare(
      `INSERT INTO om_sites (id, name, participant_id, capacity_mw, commissioning_status, created_at)
       VALUES (?, ?, ?, ?, 'planned', datetime('now'))`,
    ).bind(siteId, siteName, participantId, capacityMw).run();
    ref = { kind: 'om_site', entityType: 'om_sites', entityId: siteId, detail: { site_name: siteName, capacity_mw: capacityMw } };

  } else if (role === 'ipp_developer') {
    const capacityMw = num(data.installed_capacity_mw) ?? 0;
    const techArr = Array.isArray(data.technology) ? data.technology : (data.technology ? [data.technology] : ['solar_pv']);
    const technology = String(techArr[0] || 'solar_pv');
    const projectName = typeof data.project_name === 'string' && data.project_name ? data.project_name : `${participantId} IPP Project`;
    const projectId = genId();
    await db.prepare(
      `INSERT INTO ipp_projects (id, project_name, developer_id, structure_type, technology, capacity_mw, location, status, created_at)
       VALUES (?, ?, ?, 'build_own_operate', ?, ?, 'South Africa', 'development', datetime('now'))`,
    ).bind(projectId, projectName, participantId, technology, capacityMw).run();
    ref = { kind: 'ipp_project', entityType: 'ipp_projects', entityId: projectId, detail: { project_name: projectName, capacity_mw: capacityMw, technology } };

  } else if (role === 'trader') {
    // Seed the desk's electricity position-limit config from the risk-limits
    // step. This is a persistent CONFIG row (PK participant_id+energy_type)
    // that pre-trade-guards reads - not a chain case. VaR limit (a max loss)
    // is stored as a negative daily P&L floor. INSERT OR IGNORE: the PK guards
    // a re-seed even though alreadyProvisioned already short-circuits re-fires.
    const maxPos = num(data.max_open_position_mwh) ?? 0;
    const varLimit = num(data.daily_var_limit_zar);
    const pnlFloor = varLimit != null ? -Math.abs(varLimit) : null;
    await db.prepare(
      `INSERT OR IGNORE INTO oe_position_limits
         (participant_id, energy_type, net_long_limit_mwh, net_short_limit_mwh, daily_pnl_floor_zar, set_by, set_at)
       VALUES (?, 'electricity', ?, ?, ?, ?, datetime('now'))`,
    ).bind(participantId, maxPos, maxPos, pnlFloor, participantId).run();

    // A desk with NO credit_limits row trips CREDIT_HEADROOM_EXCEEDED on its
    // first order (pre-trade-guards), and kyc_status defaults to 'pending' which
    // trips KYC_INCOMPLETE — so a freshly onboarded trader could not place a
    // single order. Seed an aggregate credit line from the wizard credit step
    // (falling back to the position notional) and approve KYC. credit_limits has
    // no natural unique key, so guard the re-seed on a NOT EXISTS check rather
    // than INSERT OR IGNORE. market_access is left at its 'full_trading' default
    // (the DB CHECK does not even allow 'unverified'), so it is not a blocker.
    const creditLine = num(data.credit_limit_zar) ?? (maxPos > 0 ? maxPos * 1_000_000 : 10_000_000);
    await db.prepare(
      `INSERT INTO credit_limits (id, participant_id, limit_zar, basis, scope, effective_from, set_by)
       SELECT ?, ?, ?, 'aggregate', 'platform', datetime('now'), ?
        WHERE NOT EXISTS (SELECT 1 FROM credit_limits WHERE participant_id = ? AND scope = 'platform')`,
    ).bind(genId(), participantId, creditLine, participantId, participantId).run();
    await db.prepare(
      `UPDATE participants SET kyc_status = 'approved' WHERE id = ? AND (kyc_status IS NULL OR kyc_status != 'approved')`,
    ).bind(participantId).run();

    ref = {
      kind: 'position_limit', entityType: 'oe_position_limits', entityId: participantId,
      detail: { energy_type: 'electricity', net_long_limit_mwh: maxPos, daily_pnl_floor_zar: pnlFloor },
    };

  } else if (role === 'offtaker') {
    // Seed a draft PPA-portfolio entry capturing the buyer's procurement
    // intent so the offtaker lands on a real "find generation" starting
    // point rather than an empty workspace. This is a persistent buyer
    // PORTFOLIO row (off_ppa_portfolio, created in migration 047), not a
    // chain case: the actual PPA is negotiated later through the proper
    // workflow, so the row starts at status='negotiating' with a placeholder
    // counterparty. Scoped to the participant's OWN tenant.
    const tenantId = (participantRow as any)?.tenant_id || 'default';
    const technology = (typeof data.preferred_technology === 'string' && data.preferred_technology)
      ? data.preferred_technology : 'solar_pv';
    const capacityMw = num(data.peak_demand_mw);
    const portfolioId = genId();
    await db.prepare(
      `INSERT INTO off_ppa_portfolio
         (id, participant_id, tenant_id, counterparty_name, technology, capacity_mw, status, created_at)
       VALUES (?, ?, ?, 'To be selected', ?, ?, 'negotiating', datetime('now'))`,
    ).bind(portfolioId, participantId, tenantId, technology, capacityMw).run();
    ref = {
      kind: 'ppa_portfolio', entityType: 'off_ppa_portfolio', entityId: portfolioId,
      detail: { technology, capacity_mw: capacityMw, status: 'negotiating' },
    };
  }

  // Manifest-only roles (and seed roles too) all get a getting-started manifest.
  const manifest = buildOnboardingManifest(role, data, ref);
  if (ref) {
    await logProvision(db, participantId, role, ref.kind, ref.entityType, ref.entityId, ref.detail, manifest);
  } else {
    await logProvision(db, participantId, role, 'manifest', null, null, {}, manifest);
  }
}

export function registerOnboardingProvisioningRules(): void {
  registerCascadeRule({
    id: 'onboarding_provisioning.completed',
    match: (ctx: CascadeContext) => ctx.event === 'onboarding.completed',
    run: async (ctx: CascadeContext) => {
      await provisionOnboarding(
        ctx.env.DB,
        ctx.entity_id,
        typeof ctx.data?.role === 'string' ? ctx.data.role : null,
      );
    },
  });
}
