// Layer A — onboarding provisioning cascade rule.
// Reacts to onboarding.completed and turns wizard data into real entities, then
// writes a getting-started MANIFEST onto the provisioning-log row so the SPA can
// show "what next" instead of dropping the operator on an empty workspace:
//   esums_owner  → om_sites row           (commissioning_status='planned')
//   ipp_developer→ ipp_projects row       (status='development')
//   trader       → oe_position_limits row (electricity desk limits from risk step)
//   other roles  → no business entity, manifest-only (logged as kind='manifest')
//
// Why seed-vs-manifest: a real row is created ONLY where the target is a
// persistent OPERATING object (a site, a project, a desk-limit config) AND the
// wizard collected enough to populate it. The remaining roles (lender, offtaker,
// grid_operator, regulator, carbon_fund, support) have no such standalone table —
// their real artifacts are regulated chain CASES, which must be initiated through
// the proper workflow, not silently faked at signup. Those get a manifest only.
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

export function registerOnboardingProvisioningRules(): void {
  registerCascadeRule({
    id: 'onboarding_provisioning.completed',
    match: (ctx: CascadeContext) => ctx.event === 'onboarding.completed',
    run: async (ctx: CascadeContext) => {
      const db = ctx.env.DB;
      const participantId = ctx.entity_id;

      if (await alreadyProvisioned(db, participantId)) return;

      const participantRow = (await db
        .prepare(`SELECT role, onboarding_data FROM participants WHERE id = ?`)
        .bind(participantId).first()) as { role: string; onboarding_data: string | null } | null;
      if (!participantRow) return;

      // Prefer the logical role from the cascade context (e.g. 'esums_owner' is
      // stored in the JWT and passed via data.role but is NOT in the DB CHECK).
      const role = (typeof ctx.data?.role === 'string' && ctx.data.role) ? ctx.data.role : participantRow.role;
      const data = parseData(participantRow.onboarding_data);

      // The provisioned entity (if any) is referenced in the manifest so the SPA
      // can deep-link straight to the thing the cascade just created.
      let ref: ProvisionRef = null;

      if (role === 'esums_owner') {
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
        // that pre-trade-guards reads — not a chain case. VaR limit (a max loss)
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
        ref = {
          kind: 'position_limit', entityType: 'oe_position_limits', entityId: participantId,
          detail: { energy_type: 'electricity', net_long_limit_mwh: maxPos, daily_pnl_floor_zar: pnlFloor },
        };
      }

      // Manifest-only roles (and seed roles too) all get a getting-started manifest.
      const manifest = buildOnboardingManifest(role, data, ref);
      if (ref) {
        await logProvision(db, participantId, role, ref.kind, ref.entityType, ref.entityId, ref.detail, manifest);
      } else {
        await logProvision(db, participantId, role, 'manifest', null, null, {}, manifest);
      }
    },
  });
}
