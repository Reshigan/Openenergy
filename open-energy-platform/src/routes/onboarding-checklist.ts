// ═══════════════════════════════════════════════════════════════════════════
// Onboarding getting-started checklist - per-role activation hook (L4).
//
// Endpoint (requires auth):
//   GET /checklist/:role   - per-role checklist with a data-computed `done`
//                            flag per item plus a `progress` fraction.
//
// This sits as a SIBLING of the onboarding step-tracking router under the same
// /api/onboarding base path (see mount-routes.ts). The sub-paths differ
// (/state, /step, /complete, /skip vs /checklist/:role) so the two routers
// coexist with no collision.
//
// Honesty model: each item carries a STATIC SQL probe whose `done` flag is a
// live COUNT(*) scoped to the calling participant. The checklist therefore
// stays accurate as the operator works - it never lies about progress.
//
// SECURITY INVARIANT (load-bearing):
//   Every SQL table/column identifier comes EXCLUSIVELY from the static
//   CHECKLISTS literal in this module. The :role param is validated against an
//   in-code role list and used ONLY to pick a static checklist definition; it
//   is NEVER interpolated into SQL. Request values bind only to `?` (the
//   participant id). No string interpolation of identifiers into SQL.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { AppError } from '../utils/types';

const onboardingChecklist = new Hono<HonoEnv>();
onboardingChecklist.use('*', authMiddleware);

// Map AppError to its HTTP status so the sub-router returns structured errors.
onboardingChecklist.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.code, message: err.message }, err.statusCode as 400 | 401 | 403 | 404 | 409 | 500);
  }
  return c.json({ error: 'INTERNAL_ERROR', message: 'Unexpected error' }, 500);
});

// ── Checklist item definition ───────────────────────────────────────────────
// `probe.sql` is a STATIC literal: table + column are hardcoded and it carries
// exactly one `?` for the participant id. It returns COUNT(*) AS n; done = n>0.
type ChecklistItemDef = {
  key: string;
  label: string;
  description: string;
  href: string; // LIVE Meridian route only: /horizon, /new, /atlas.
  probe: { sql: string };
};

// Universal first item for EVERY role. The participants table always exists and
// onboarding_completed is the honest signal that the wizard was finished.
const COMPLETE_PROFILE: ChecklistItemDef = {
  key: 'complete_profile',
  label: 'Complete your profile',
  description: 'Finish the onboarding wizard to set up your workspace.',
  href: '/horizon',
  probe: { sql: `SELECT COUNT(*) AS n FROM participants WHERE id = ? AND onboarding_completed = 1` },
};

// ── Static checklist definitions per role ───────────────────────────────────
// Tables/columns below are verified live in launch.ts and the onboarding
// provisioning seeds (src/cascade-rules/onboarding-provisioning.ts) and were
// confirmed against the migrations directory. Manifest-only / oversight roles
// (lender, carbon_fund, grid_operator, regulator, support, admin, esco,
// epc_contractor) get complete_profile alone - their first real artifact is a
// regulated chain case initiated through the proper workflow, so fabricating a
// probe against a table here would lie. complete_profile alone stays honest.
const CHECKLISTS: Record<string, ChecklistItemDef[]> = {
  esums_owner: [
    COMPLETE_PROFILE,
    {
      key: 'create_site',
      label: 'Register your first site',
      description: 'Your site appears in the commissioning chain.',
      href: '/new',
      probe: { sql: `SELECT COUNT(*) AS n FROM om_sites WHERE participant_id = ?` },
    },
    {
      key: 'add_meter',
      label: 'Add a smart meter',
      description: 'Register a meter so telemetry can flow.',
      href: '/horizon',
      probe: { sql: `SELECT COUNT(*) AS n FROM oe_smart_meter_assets WHERE owner_id = ?` },
    },
  ],
  ipp_developer: [
    COMPLETE_PROFILE,
    {
      key: 'first_project',
      label: 'Register your first project',
      description: 'Start the IPP development lifecycle.',
      href: '/new',
      probe: { sql: `SELECT COUNT(*) AS n FROM ipp_projects WHERE developer_id = ?` },
    },
    {
      key: 'advance_project',
      label: 'Advance a project past development',
      description: 'Move a project into licensing or construction.',
      href: '/horizon',
      probe: { sql: `SELECT COUNT(*) AS n FROM ipp_projects WHERE developer_id = ? AND status != 'development'` },
    },
  ],
  trader: [
    COMPLETE_PROFILE,
    {
      key: 'set_limits',
      label: 'Set your position limits',
      description: 'Pre-trade guards activate once limits are configured.',
      href: '/horizon',
      probe: { sql: `SELECT COUNT(*) AS n FROM oe_position_limits WHERE participant_id = ?` },
    },
  ],
  offtaker: [
    COMPLETE_PROFILE,
    {
      key: 'start_procurement',
      label: 'Start your procurement portfolio',
      description: 'Capture what generation you need.',
      href: '/new',
      probe: { sql: `SELECT COUNT(*) AS n FROM off_ppa_portfolio WHERE participant_id = ?` },
    },
    {
      key: 'sign_ppa',
      label: 'Move a PPA past negotiation',
      description: 'Advance a portfolio entry beyond negotiating.',
      href: '/horizon',
      probe: { sql: `SELECT COUNT(*) AS n FROM off_ppa_portfolio WHERE participant_id = ? AND status != 'negotiating'` },
    },
  ],
  // Manifest-only / oversight roles: complete_profile only.
  lender: [COMPLETE_PROFILE],
  carbon_fund: [COMPLETE_PROFILE],
  grid_operator: [COMPLETE_PROFILE],
  regulator: [COMPLETE_PROFILE],
  support: [COMPLETE_PROFILE],
  admin: [COMPLETE_PROFILE],
  esco: [COMPLETE_PROFILE],
  epc_contractor: [COMPLETE_PROFILE],
};

// ── GET /checklist/:role ────────────────────────────────────────────────────
onboardingChecklist.get('/checklist/:role', async (c) => {
  const user = getCurrentUser(c);
  const role = c.req.param('role') || '';

  // Authz: a participant may only read their own role's checklist; admin and
  // support may read any (oversight). Same proven pattern as launch.ts.
  if (role !== user.role && user.role !== 'admin' && user.role !== 'support') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  // Pick the STATIC definition for the role. Unknown but authorized roles fall
  // back to complete_profile only. The :role param is never used as a SQL
  // identifier - only to index this in-code map.
  const defs = CHECKLISTS[role] ?? [COMPLETE_PROFILE];

  const items: Array<{ key: string; label: string; description: string; href: string; done: boolean }> = [];
  for (const def of defs) {
    const row = await c.env.DB.prepare(def.probe.sql).bind(user.id).first<{ n: number }>();
    const done = (row?.n ?? 0) > 0;
    items.push({
      key: def.key,
      label: def.label,
      description: def.description,
      href: def.href,
      done,
    });
  }

  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;

  return c.json({
    success: true,
    data: {
      role,
      items,
      progress: { done: doneCount, total },
      complete: total > 0 && doneCount === total,
    },
  });
});

export default onboardingChecklist;
