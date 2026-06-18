// ═══════════════════════════════════════════════════════════════════════════
// Onboarding — per-role step tracking for new participants.
//
// Endpoints (all require auth):
//   GET  /state         — current step, data, completion flags
//   POST /step          — advance to next step, merging supplied data
//   POST /complete      — mark onboarding complete
//   POST /skip          — skip onboarding entirely
//
// Step sequences are role-specific (see ONBOARDING_STEPS). The esums_owner
// role is enforced at application level (not via a DB CHECK constraint).
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { AppError, ErrorCode } from '../utils/types';

const onboarding = new Hono<HonoEnv>();
onboarding.use('*', authMiddleware);

// Map AppError to its HTTP status so the sub-router returns structured errors
// both in tests and in production (the top-level onError also catches these).
onboarding.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.code, message: err.message }, err.statusCode as 400 | 401 | 403 | 404 | 409 | 500);
  }
  return c.json({ error: 'INTERNAL_ERROR', message: 'Unexpected error' }, 500);
});

// ── Step sequences per role ────────────────────────────────────────────────
const ONBOARDING_STEPS: Record<string, string[]> = {
  esums_owner:    ['welcome', 'site_setup', 'device_config', 'data_sources', 'alerts', 'complete'],
  ipp_developer:  ['welcome', 'company_profile', 'first_project', 'compliance', 'complete'],
  trader:         ['welcome', 'entity', 'risk_limits', 'complete'],
  lender:         ['welcome', 'fund_setup', 'coverage', 'complete'],
  offtaker:       ['welcome', 'entity', 'ppa_prefs', 'complete'],
  carbon_fund:    ['welcome', 'registry', 'methodology', 'complete'],
  grid_operator:  ['welcome', 'authority', 'services', 'complete'],
  regulator:      ['welcome', 'body', 'jurisdiction', 'complete'],
  support:        ['welcome', 'org', 'sla', 'complete'],
  admin:          ['welcome', 'complete'],
  esco:           ['welcome', 'org_profile', 'sites', 'complete'],
  epc_contractor: ['welcome', 'org_profile', 'project_scope', 'complete'],
};

// ── GET /state ─────────────────────────────────────────────────────────────
onboarding.get('/state', async (c) => {
  const user = getCurrentUser(c);

  const row = await c.env.DB.prepare(
    `SELECT onboarding_step, onboarding_data, onboarding_completed, onboarding_skipped
       FROM participants WHERE id = ?`,
  )
    .bind(user.id)
    .first<{
      onboarding_step: string | null;
      onboarding_data: string | null;
      onboarding_completed: number;
      onboarding_skipped: number;
    }>();

  if (!row) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Participant not found', 404);
  }

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(row.onboarding_data || '{}');
  } catch {
    data = {};
  }

  // The getting-started manifest is written by the onboarding-provisioning
  // cascade onto oe_onboarding_provisioning_log when onboarding.completed fires.
  // Surface it here so the SPA can render a real "what next" card. Most recent
  // row wins; null until the operator has completed onboarding at least once.
  let manifest: Record<string, unknown> | null = null;
  const provRow = await c.env.DB.prepare(
    `SELECT kind, manifest FROM oe_onboarding_provisioning_log
      WHERE participant_id = ? ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(user.id)
    .first<{ kind: string | null; manifest: string | null }>();
  if (provRow?.manifest) {
    try {
      const parsed = JSON.parse(provRow.manifest);
      // '{}' default (pre-manifest rows) carries no headline - treat as absent.
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) manifest = parsed;
    } catch {
      manifest = null;
    }
  }

  // Normalized envelope so the SPA can distinguish seeded-entity roles from
  // manifest-only roles and read a null-safe action list. When no usable
  // manifest survived above, this is exactly { kind: 'none', entities: [] }.
  const provisioned: { kind: string; entities: Array<{ label: string; href: string }> } = {
    kind: manifest ? (provRow?.kind || 'none') : 'none',
    entities: [],
  };
  if (manifest) {
    const nextActions = manifest.next_actions;
    if (Array.isArray(nextActions)) {
      for (const a of nextActions) {
        if (a && typeof a === 'object') {
          const action = a as Record<string, unknown>;
          if (action.label != null && action.route != null) {
            provisioned.entities.push({
              label: String(action.label),
              href: String(action.route),
            });
          }
        }
      }
    }
  }

  return c.json({
    success: true,
    data: {
      step: row.onboarding_step || 'welcome',
      data,
      completed: Boolean(row.onboarding_completed),
      skipped: Boolean(row.onboarding_skipped),
      role: user.role,
      manifest,
      provisioned,
    },
  });
});

// ── POST /step ─────────────────────────────────────────────────────────────
onboarding.post('/step', async (c) => {
  const user = getCurrentUser(c);

  let body: { step?: unknown; data?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Request body must be valid JSON', 400);
  }

  const { step, data: incomingData } = body;

  if (typeof step !== 'string' || !step) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'step is required and must be a string', 400);
  }

  const steps = ONBOARDING_STEPS[user.role] ?? ['welcome', 'complete'];

  if (!steps.includes(step)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid step "${step}" for role "${user.role}". Valid steps: ${steps.join(', ')}`,
      400,
    );
  }

  // Determine next step in sequence
  const currentIdx = steps.indexOf(step);
  const nextStep = currentIdx < steps.length - 1 ? steps[currentIdx + 1] : null;

  // Read current onboarding_data from DB and merge
  const existing = await c.env.DB.prepare(
    `SELECT onboarding_data FROM participants WHERE id = ?`,
  )
    .bind(user.id)
    .first<{ onboarding_data: string | null }>();

  let mergedData: Record<string, unknown> = {};
  try {
    mergedData = JSON.parse(existing?.onboarding_data || '{}');
  } catch {
    mergedData = {};
  }

  if (incomingData && typeof incomingData === 'object' && !Array.isArray(incomingData)) {
    mergedData = { ...mergedData, ...(incomingData as Record<string, unknown>) };
  }

  const isComplete = step === 'complete' || nextStep === null;
  const savedStep = nextStep ?? step;

  await c.env.DB.prepare(
    `UPDATE participants
        SET onboarding_step = ?,
            onboarding_data = ?,
            onboarding_completed = ?
      WHERE id = ?`,
  )
    .bind(savedStep, JSON.stringify(mergedData), isComplete ? 1 : 0, user.id)
    .run();

  return c.json({
    success: true,
    data: {
      ok: true,
      next_step: nextStep,
    },
  });
});

// ── POST /complete ─────────────────────────────────────────────────────────
onboarding.post('/complete', async (c) => {
  const user = getCurrentUser(c);

  await c.env.DB.prepare(
    `UPDATE participants
        SET onboarding_completed = 1,
            onboarding_step = 'complete'
      WHERE id = ?`,
  )
    .bind(user.id)
    .run();

  await fireCascade({
    event: 'onboarding.completed',
    actor_id: user.id,
    entity_type: 'participant',
    entity_id: user.id,
    data: { role: user.role },
    env: c.env,
  });

  return c.json({ success: true, data: { ok: true } });
});

// ── POST /skip ─────────────────────────────────────────────────────────────
onboarding.post('/skip', async (c) => {
  const user = getCurrentUser(c);

  await c.env.DB.prepare(
    `UPDATE participants
        SET onboarding_completed = 1,
            onboarding_step = 'complete',
            onboarding_skipped = 1
      WHERE id = ?`,
  )
    .bind(user.id)
    .run();

  await fireCascade({
    event: 'onboarding.skipped',
    actor_id: user.id,
    entity_type: 'participant',
    entity_id: user.id,
    data: { role: user.role },
    env: c.env,
  });

  return c.json({ success: true, data: { ok: true } });
});

export default onboarding;
