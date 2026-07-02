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
import { ask } from '../utils/ai';

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
  href: string; // LIVE Meridian route only: /cockpit (creates live in-journey) or /horizon.
  probe: { sql: string };
  // One-line static rationale for the inline "next best step" assist. Used as
  // the deterministic base for `why`; AI text only enriches it when available.
  // Plain hyphens only, no dashes.
  whyFallback: string;
};

// Generic last-resort rationale. Guarantees `next_best_step.why` is never empty
// even if a definition's whyFallback and the item description were both blank.
// Plain hyphens only, no dashes.
const GENERIC_WHY = 'This is the best next step to get your workspace working.';

// Universal first item for EVERY role. The participants table always exists and
// onboarding_completed is the honest signal that the wizard was finished.
const COMPLETE_PROFILE: ChecklistItemDef = {
  key: 'complete_profile',
  label: 'Complete your profile',
  description: 'Finish the onboarding wizard to set up your workspace.',
  href: '/horizon',
  probe: { sql: `SELECT COUNT(*) AS n FROM participants WHERE id = ? AND onboarding_completed = 1` },
  whyFallback: 'Finishing your profile unlocks your role workspace and seeds your first entity.',
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
      href: '/cockpit',
      probe: { sql: `SELECT COUNT(*) AS n FROM om_sites WHERE participant_id = ?` },
      whyFallback: 'Registering a site is the entry point to commissioning and live monitoring.',
    },
    {
      key: 'add_meter',
      label: 'Add a smart meter',
      description: 'Register a meter so telemetry can flow.',
      href: '/horizon',
      probe: { sql: `SELECT COUNT(*) AS n FROM oe_smart_meter_assets WHERE owner_id = ?` },
      whyFallback: 'A meter is what lets telemetry and predictive health start flowing.',
    },
  ],
  ipp_developer: [
    COMPLETE_PROFILE,
    {
      key: 'first_project',
      label: 'Register your first project',
      description: 'Start the IPP development lifecycle.',
      href: '/cockpit',
      probe: { sql: `SELECT COUNT(*) AS n FROM ipp_projects WHERE developer_id = ?` },
      whyFallback: 'Your first project starts the development-to-COD lifecycle you track here.',
    },
    {
      key: 'advance_project',
      label: 'Advance a project past development',
      description: 'Move a project into licensing or construction.',
      href: '/horizon',
      probe: { sql: `SELECT COUNT(*) AS n FROM ipp_projects WHERE developer_id = ? AND status != 'development'` },
      whyFallback: 'Moving a project past development is how it progresses toward financial close.',
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
      whyFallback: 'Position limits switch on the pre-trade guards that let you trade safely.',
    },
  ],
  offtaker: [
    COMPLETE_PROFILE,
    {
      key: 'start_procurement',
      label: 'Start your procurement portfolio',
      description: 'Capture what generation you need.',
      href: '/cockpit',
      probe: { sql: `SELECT COUNT(*) AS n FROM off_ppa_portfolio WHERE participant_id = ?` },
      whyFallback: 'Capturing your demand is the first step to matching generation.',
    },
    {
      key: 'sign_ppa',
      label: 'Move a PPA past negotiation',
      description: 'Advance a portfolio entry beyond negotiating.',
      href: '/horizon',
      probe: { sql: `SELECT COUNT(*) AS n FROM off_ppa_portfolio WHERE participant_id = ? AND status != 'negotiating'` },
      whyFallback: 'Advancing a PPA past negotiation is what converts intent into contracted supply.',
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
  const complete = total > 0 && doneCount === total;

  // ── Inline AI "next best step" ────────────────────────────────────────────
  // The first incomplete item is the one to do next. `why` starts from that
  // item's static rationale and is only enriched by AI when the binding returns
  // a real (non-fallback) answer. An AI failure NEVER throws the endpoint - the
  // static rationale always wins on any error or fallback.
  let next_best_step: { item_key: string; why: string; action_href: string } | null = null;
  const firstIncomplete = items.find((i) => !i.done);
  if (firstIncomplete) {
    const def = defs.find((d) => d.key === firstIncomplete.key);
    let why = (def?.whyFallback || firstIncomplete.description || GENERIC_WHY);
    if (!why || !why.trim()) why = GENERIC_WHY;
    try {
      const r = await ask(c.env, {
        intent: 'generic.ask',
        role,
        prompt:
          'In one short line, explain why this is the best next onboarding step for the user. Be concrete and encouraging.',
        context: {
          item_key: firstIncomplete.key,
          label: firstIncomplete.label,
          description: firstIncomplete.description,
          static_rationale: why,
        },
      });
      if (r && !r.fallback && r.text && r.text.trim()) {
        why = r.text.trim();
      }
    } catch {
      // Keep the static rationale - never surface an AI failure to the caller.
    }
    next_best_step = {
      item_key: firstIncomplete.key,
      why,
      action_href: firstIncomplete.href,
    };
  }

  return c.json({
    success: true,
    data: {
      role,
      items,
      progress: { done: doneCount, total },
      complete,
      next_best_step,
    },
  });
});

export default onboardingChecklist;
