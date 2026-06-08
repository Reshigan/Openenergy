// Layer A — onboarding provisioning cascade rule.
// Reacts to onboarding.completed and turns wizard data into real entities:
//   esums_owner  → om_sites row at commissioning_status='planned'
//   ipp_developer→ ipp_projects row at status='development'
//   other roles  → no entity (logged as kind='none')
//
// Idempotency: guarded on oe_onboarding_provisioning_log UNIQUE (participant_id, kind).
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { genId } from './_enqueue';

function parseData(raw: string | null): Record<string, unknown> {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
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
): Promise<void> {
  await db.prepare(
    `INSERT OR IGNORE INTO oe_onboarding_provisioning_log
       (id, participant_id, role, kind, entity_type, entity_id, detail_json, created_at)
     VALUES (?,?,?,?,?,?,?,datetime('now'))`,
  ).bind(genId(), participantId, role, kind, entityType, entityId, JSON.stringify(detail)).run();
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

      if (role === 'esums_owner') {
        const siteName = typeof data.site_name === 'string' && data.site_name ? data.site_name : 'My site';
        const rawKw = data.installed_capacity_kw;
        const capacityMw = rawKw != null ? (parseFloat(String(rawKw)) || 0) / 1000 : 0;
        const siteId = genId();
        await db.prepare(
          `INSERT INTO om_sites (id, name, participant_id, capacity_mw, commissioning_status, created_at)
           VALUES (?, ?, ?, ?, 'planned', datetime('now'))`,
        ).bind(siteId, siteName, participantId, capacityMw).run();
        await logProvision(db, participantId, role, 'om_site', 'om_sites', siteId, { site_name: siteName, capacity_mw: capacityMw });

      } else if (role === 'ipp_developer') {
        const rawMw = data.installed_capacity_mw;
        const capacityMw = rawMw != null ? parseFloat(String(rawMw)) || 0 : 0;
        const techArr = Array.isArray(data.technology) ? data.technology : (data.technology ? [data.technology] : ['solar_pv']);
        const technology = String(techArr[0] || 'solar_pv');
        const projectId = genId();
        await db.prepare(
          `INSERT INTO ipp_projects (id, project_name, developer_id, structure_type, technology, capacity_mw, location, status, created_at)
           VALUES (?, ?, ?, 'build_own_operate', ?, ?, 'South Africa', 'development', datetime('now'))`,
        ).bind(projectId, `${participantId} IPP Project`, participantId, technology, capacityMw).run();
        await logProvision(db, participantId, role, 'ipp_project', 'ipp_projects', projectId, { capacity_mw: capacityMw, technology });

      } else {
        await logProvision(db, participantId, role, 'none', null, null, {});
      }
    },
  });
}
