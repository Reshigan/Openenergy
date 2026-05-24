// ═══════════════════════════════════════════════════════════════════════════
// Regulator suite — national-scale workflows issued BY the regulator.
// -----------------------------------------------------------------------------
// Companion to src/routes/regulator.ts (filings submitted by licensees).
// Statutory basis: ERA 2006, NERSA Rules on Penalties (2018), PAIA, PAJA,
// Competition Act 89/1998 (cross-regulator referrals).
// -----------------------------------------------------------------------------
// Sub-routes (all mounted under /api/regulator):
//   • /licences                 — licence register (ERA 2006 s.8)
//   • /licences/:id/conditions  — conditions attached to a licence
//   • /licences/:id/events      — lifecycle events
//   • /tariff-submissions       — MYPD-style applications (s.16)
//   • /tariff-decisions         — NERSA determinations
//   • /determinations           — public gazette (PAIA)
//   • /enforcement-cases        — investigation → finding → penalty → appeal
//   • /surveillance/rules       — rule definitions
//   • /surveillance/alerts      — alerts raised against participants
//   • /surveillance/scan        — regulator-triggered rescan (idempotent)
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { cachedAll, invalidateReference } from '../utils/reference-cache';
import { appendAudit, getChainHead, verifyChain } from '../utils/audit-chain';

const suite = new Hono<HonoEnv>();
suite.use('*', authMiddleware);

// Every write-path in this file requires regulator or admin. Reads are allowed
// for any authenticated user on public-facing registers (licences, determinations).
function canRegulate(role: string): boolean {
  return role === 'regulator' || role === 'admin';
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Licence register ──────────────────────────────────────────────────────
suite.get('/licences', async (c) => {
  const status = c.req.query('status');
  const type = c.req.query('licence_type');
  const filters: string[] = [];
  const binds: unknown[] = [];
  if (status) { filters.push('status = ?'); binds.push(status); }
  if (type) { filters.push('licence_type = ?'); binds.push(type); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rs = await c.env.DB
    .prepare(`SELECT * FROM regulator_licences ${where} ORDER BY issue_date DESC LIMIT 500`)
    .bind(...binds).all();
  return c.json({ success: true, data: rs.results || [] });
});

suite.get('/licences/:id', async (c) => {
  const id = c.req.param('id');
  const licence = await c.env.DB
    .prepare('SELECT * FROM regulator_licences WHERE id = ?').bind(id).first();
  if (!licence) return c.json({ success: false, error: 'Licence not found' }, 404);
  const conds = await c.env.DB
    .prepare('SELECT * FROM regulator_licence_conditions WHERE licence_id = ? ORDER BY condition_number')
    .bind(id).all();
  const events = await c.env.DB
    .prepare('SELECT * FROM regulator_licence_events WHERE licence_id = ? ORDER BY event_date DESC LIMIT 100')
    .bind(id).all();
  return c.json({
    success: true,
    data: { ...licence, conditions: conds.results || [], events: events.results || [] },
  });
});

suite.post('/licences', async (c) => {
  const user = getCurrentUser(c);
  if (!canRegulate(user.role)) {
    return c.json({ success: false, error: 'Only regulators may issue licences' }, 403);
  }
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const required = ['licence_number', 'licensee_name', 'licence_type', 'issue_date'];
  for (const k of required) {
    if (!b[k] || typeof b[k] !== 'string') {
      return c.json({ success: false, error: `${k} is required` }, 400);
    }
  }
  const id = genId('lic');
  await c.env.DB.prepare(
    `INSERT INTO regulator_licences
       (id, licence_number, licensee_participant_id, licensee_name, licence_type, technology,
        capacity_mw, location, issue_date, effective_date, expiry_date, status, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'active'), ?, ?)`,
  ).bind(
    id,
    b.licence_number, b.licensee_participant_id || null, b.licensee_name, b.licence_type,
    b.technology || null, Number(b.capacity_mw ?? 0), b.location || null,
    b.issue_date, b.effective_date || null, b.expiry_date || null,
    b.status || null, b.notes || null, user.id,
  ).run();
  await c.env.DB.prepare(
    `INSERT INTO regulator_licence_events (id, licence_id, event_type, event_date, details, actor_id)
     VALUES (?, ?, 'granted', ?, ?, ?)`,
  ).bind(genId('lev'), id, b.issue_date, `Licence ${b.licence_number} granted`, user.id).run();
  // COST: skip the re-SELECT by echoing the values we just inserted.
  // Defaults we didn't set explicitly (status, created_at) are filled in
  // here to match the schema.
  const row = {
    id,
    licence_number: b.licence_number,
    licensee_participant_id: b.licensee_participant_id || null,
    licensee_name: b.licensee_name,
    licence_type: b.licence_type,
    technology: b.technology || null,
    capacity_mw: Number(b.capacity_mw ?? 0),
    location: b.location || null,
    issue_date: b.issue_date,
    effective_date: b.effective_date || null,
    expiry_date: b.expiry_date || null,
    status: b.status || 'active',
    notes: b.notes || null,
    created_by: user.id,
    created_at: new Date().toISOString(),
  };
  await fireCascade({
    event: 'regulator.licence_granted',
    actor_id: user.id,
    entity_type: 'regulator_licences',
    entity_id: id,
    data: { licence_number: b.licence_number, licensee_participant_id: b.licensee_participant_id || null },
    env: c.env,
    skipAudit: true,
  });

  await appendAudit({
    env: c.env, entity_type: 'regulator', entity_id: id,
    event_type: 'licence.granted', actor_id: user.id,
    payload: {
      licence_id: id, licence_number: b.licence_number,
      licensee_participant_id: b.licensee_participant_id || null,
      licensee_name: b.licensee_name, licence_type: b.licence_type,
      technology: b.technology || null,
      capacity_mw: Number(b.capacity_mw ?? 0),
      issue_date: b.issue_date,
    },
  }).catch((e) => console.warn('audit_licence_granted_failed', (e as Error).message));

  return c.json({ success: true, data: row }, 201);
});

suite.post('/licences/:id/vary', (c) => transitionLicence(c, 'varied', 'varied'));
suite.post('/licences/:id/suspend', (c) => transitionLicence(c, 'suspended', 'suspended'));
suite.post('/licences/:id/revoke', (c) => transitionLicence(c, 'revoked', 'revoked'));
suite.post('/licences/:id/reinstate', (c) => transitionLicence(c, 'active', 'granted'));

async function transitionLicence(
  c: Context<HonoEnv>,
  newStatus: string,
  eventType: string,
) {
  const user = getCurrentUser(c);
  if (!canRegulate(user.role)) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const id = c.req.param('id') ?? '';
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const existing = await c.env.DB
    .prepare('SELECT id, status, licence_number, licensee_participant_id FROM regulator_licences WHERE id = ?')
    .bind(id).first<{ licence_number: string; licensee_participant_id: string | null; status: string }>();
  if (!existing) return c.json({ success: false, error: 'Licence not found' }, 404);
  // Batch the UPDATE + event INSERT in a single D1 round-trip, then skip
  // the re-SELECT by returning the existing row with the new status.
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE regulator_licences SET status = ? WHERE id = ?').bind(newStatus, id),
    c.env.DB.prepare(
      `INSERT INTO regulator_licence_events (id, licence_id, event_type, event_date, details, actor_id)
       VALUES (?, ?, ?, datetime('now'), ?, ?)`,
    ).bind(genId('lev'), id, eventType, (b.details as string) || null, user.id),
  ]);
  const row = { ...existing, status: newStatus };
  const eventMap: Record<string, 'regulator.licence_varied' | 'regulator.licence_suspended' | 'regulator.licence_revoked' | 'regulator.licence_reinstated'> = {
    varied: 'regulator.licence_varied',
    suspended: 'regulator.licence_suspended',
    revoked: 'regulator.licence_revoked',
    granted: 'regulator.licence_reinstated',
  };
  const event = eventMap[eventType];
  if (event) {
    await fireCascade({
      event,
      actor_id: user.id,
      entity_type: 'regulator_licences',
      entity_id: id,
      data: {
        licence_number: existing.licence_number,
        licensee_participant_id: existing.licensee_participant_id,
        details: b.details || null,
      },
      env: c.env,
      skipAudit: true,
    });
  }

  await appendAudit({
    env: c.env, entity_type: 'regulator', entity_id: id,
    event_type: `licence.${eventType}`, actor_id: user.id,
    payload: {
      licence_id: id, licence_number: existing.licence_number,
      prior_status: existing.status, new_status: newStatus,
      details: b.details || null,
    },
  }).catch((e) => console.warn('audit_licence_transition_failed', (e as Error).message));

  return c.json({ success: true, data: row });
}

suite.post('/licences/:id/conditions', async (c) => {
  const user = getCurrentUser(c);
  if (!canRegulate(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const licenceId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.condition_number || !b.condition_text) {
    return c.json({ success: false, error: 'condition_number and condition_text are required' }, 400);
  }
  const id = genId('lcd');
  await c.env.DB.prepare(
    `INSERT INTO regulator_licence_conditions
       (id, licence_id, condition_number, condition_text, category, compliance_status)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, 'compliant'))`,
  ).bind(id, licenceId, b.condition_number, b.condition_text, b.category || null, b.compliance_status || null).run();
  const row = await c.env.DB.prepare('SELECT * FROM regulator_licence_conditions WHERE id = ?').bind(id).first();

  await fireCascade({
    event: 'regulator.licence_condition_added',
    actor_id: user.id,
    entity_type: 'regulator_licence_conditions',
    entity_id: id,
    data: {
      licence_id: licenceId,
      condition_number: b.condition_number,
      category: b.category || null,
    },
    env: c.env,
  });

  return c.json({ success: true, data: row }, 201);
});

// ─── Tariff approvals ──────────────────────────────────────────────────────
suite.get('/tariff-submissions', async (c) => {
  const user = getCurrentUser(c);
  const sql = canRegulate(user.role)
    ? `SELECT * FROM regulator_tariff_submissions ORDER BY submitted_at DESC LIMIT 200`
    : `SELECT * FROM regulator_tariff_submissions WHERE licensee_participant_id = ? ORDER BY submitted_at DESC LIMIT 200`;
  const rs = canRegulate(user.role)
    ? await c.env.DB.prepare(sql).all()
    : await c.env.DB.prepare(sql).bind(user.id).all();
  return c.json({ success: true, data: rs.results || [] });
});

suite.post('/tariff-submissions', async (c) => {
  const user = getCurrentUser(c);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['reference_number', 'submission_title', 'tariff_period_start', 'tariff_period_end']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('tsub');
  await c.env.DB.prepare(
    `INSERT INTO regulator_tariff_submissions
       (id, reference_number, licensee_participant_id, licence_id, submission_title,
        tariff_period_start, tariff_period_end, requested_revenue_zar, requested_tariff_c_per_kwh,
        methodology, supporting_docs_json, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'submitted'))`,
  ).bind(
    id, b.reference_number, user.id, b.licence_id || null, b.submission_title,
    b.tariff_period_start, b.tariff_period_end,
    b.requested_revenue_zar == null ? null : Number(b.requested_revenue_zar),
    b.requested_tariff_c_per_kwh == null ? null : Number(b.requested_tariff_c_per_kwh),
    b.methodology || null,
    typeof b.supporting_docs === 'object' ? JSON.stringify(b.supporting_docs) : null,
    b.status || null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM regulator_tariff_submissions WHERE id = ?').bind(id).first();

  await fireCascade({
    event: 'regulator.tariff_submitted',
    actor_id: user.id,
    entity_type: 'regulator_tariff_submissions',
    entity_id: id,
    data: {
      reference_number: b.reference_number,
      licensee_participant_id: user.id,
      submission_title: b.submission_title,
      period_start: b.tariff_period_start,
      period_end: b.tariff_period_end,
    },
    env: c.env,
  });

  return c.json({ success: true, data: row }, 201);
});

suite.post('/tariff-submissions/:id/hearing', async (c) => {
  const user = getCurrentUser(c);
  if (!canRegulate(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.public_hearing_date) {
    return c.json({ success: false, error: 'public_hearing_date is required' }, 400);
  }
  await c.env.DB.prepare(
    `UPDATE regulator_tariff_submissions SET status = 'public_hearing', public_hearing_date = ? WHERE id = ?`,
  ).bind(b.public_hearing_date, id).run();
  const row = await c.env.DB.prepare('SELECT * FROM regulator_tariff_submissions WHERE id = ?').bind(id).first();

  await fireCascade({
    event: 'regulator.tariff_hearing_scheduled',
    actor_id: user.id,
    entity_type: 'regulator_tariff_submissions',
    entity_id: id,
    data: {
      submission_id: id,
      public_hearing_date: b.public_hearing_date,
    },
    env: c.env,
  });

  return c.json({ success: true, data: row });
});

suite.post('/tariff-submissions/:id/determine', async (c) => {
  const user = getCurrentUser(c);
  if (!canRegulate(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const submissionId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['decision_number', 'decision_date', 'effective_from']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const sub = await c.env.DB
    .prepare('SELECT requested_revenue_zar, requested_tariff_c_per_kwh FROM regulator_tariff_submissions WHERE id = ?')
    .bind(submissionId).first<{ requested_revenue_zar: number | null; requested_tariff_c_per_kwh: number | null }>();
  if (!sub) return c.json({ success: false, error: 'Submission not found' }, 404);

  const approvedRev = b.approved_revenue_zar == null ? null : Number(b.approved_revenue_zar);
  const approvedTariff = b.approved_tariff_c_per_kwh == null ? null : Number(b.approved_tariff_c_per_kwh);
  let variance: number | null = null;
  if (sub.requested_revenue_zar && approvedRev != null) {
    variance = ((approvedRev - sub.requested_revenue_zar) / sub.requested_revenue_zar) * 100;
  }
  const id = genId('tdec');
  await c.env.DB.prepare(
    `INSERT INTO regulator_tariff_decisions
       (id, submission_id, decision_number, decision_date, approved_revenue_zar,
        approved_tariff_c_per_kwh, variance_percentage, reasons, effective_from, effective_to,
        published_in_gazette, gazette_reference, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).bind(
    id, submissionId, b.decision_number, b.decision_date, approvedRev, approvedTariff,
    variance, b.reasons || null, b.effective_from, b.effective_to || null,
    b.gazette_reference || null, user.id,
  ).run();
  await c.env.DB.prepare(
    `UPDATE regulator_tariff_submissions SET status = 'determined' WHERE id = ?`,
  ).bind(submissionId).run();
  const row = await c.env.DB.prepare('SELECT * FROM regulator_tariff_decisions WHERE id = ?').bind(id).first();
  await fireCascade({
    event: 'regulator.tariff_determined',
    actor_id: user.id,
    entity_type: 'regulator_tariff_decisions',
    entity_id: id,
    data: {
      submission_id: submissionId,
      decision_number: b.decision_number,
      effective_from: b.effective_from,
      approved_revenue_zar: approvedRev,
      approved_tariff_c_per_kwh: approvedTariff,
    },
    env: c.env,
    skipAudit: true,
  });

  await appendAudit({
    env: c.env, entity_type: 'regulator', entity_id: id,
    event_type: 'tariff.determined', actor_id: user.id,
    payload: {
      decision_id: id, submission_id: submissionId,
      decision_number: b.decision_number, decision_date: b.decision_date,
      approved_revenue_zar: approvedRev,
      approved_tariff_c_per_kwh: approvedTariff,
      variance_pct: variance,
      effective_from: b.effective_from,
    },
  }).catch((e) => console.warn('audit_tariff_determined_failed', (e as Error).message));

  return c.json({ success: true, data: row }, 201);
});

// ─── Determinations (public gazette) ───────────────────────────────────────
// Read is open to any authenticated user — public register per PAIA.
suite.get('/determinations', async (c) => {
  const category = c.req.query('category');
  const q = category
    ? c.env.DB.prepare(
        'SELECT * FROM regulator_determinations WHERE category = ? ORDER BY publication_date DESC LIMIT 200',
      ).bind(category)
    : c.env.DB.prepare('SELECT * FROM regulator_determinations ORDER BY publication_date DESC LIMIT 200');
  const rs = await q.all();
  return c.json({ success: true, data: rs.results || [] });
});

suite.post('/determinations', async (c) => {
  const user = getCurrentUser(c);
  if (!canRegulate(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['reference_number', 'title', 'category', 'publication_date']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('det');
  await c.env.DB.prepare(
    `INSERT INTO regulator_determinations
       (id, reference_number, title, category, statutory_basis, summary, body_md,
        publication_date, gazette_reference, document_r2_key, published_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, b.reference_number, b.title, b.category,
    b.statutory_basis || null, b.summary || null, b.body_md || null,
    b.publication_date, b.gazette_reference || null, b.document_r2_key || null, user.id,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM regulator_determinations WHERE id = ?').bind(id).first();

  await fireCascade({
    event: 'regulator.determination_published',
    actor_id: user.id,
    entity_type: 'regulator_determinations',
    entity_id: id,
    data: {
      reference_number: b.reference_number,
      title: b.title,
      category: b.category,
      publication_date: b.publication_date,
      gazette_reference: b.gazette_reference || null,
    },
    env: c.env,
  });

  return c.json({ success: true, data: row }, 201);
});

// ─── Enforcement cases ─────────────────────────────────────────────────────
suite.get('/enforcement-cases', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status');
  const severity = c.req.query('severity');
  const filters: string[] = [];
  const binds: unknown[] = [];
  if (!canRegulate(user.role)) {
    filters.push('respondent_participant_id = ?');
    binds.push(user.id);
  }
  if (status) { filters.push('status = ?'); binds.push(status); }
  if (severity) { filters.push('severity = ?'); binds.push(severity); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rs = await c.env.DB
    .prepare(`SELECT * FROM regulator_enforcement_cases ${where} ORDER BY opened_at DESC LIMIT 200`)
    .bind(...binds).all();
  return c.json({ success: true, data: rs.results || [] });
});

suite.get('/enforcement-cases/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare('SELECT * FROM regulator_enforcement_cases WHERE id = ?').bind(id).first<{
      respondent_participant_id?: string;
    }>();
  if (!row) return c.json({ success: false, error: 'Case not found' }, 404);
  if (!canRegulate(user.role) && row.respondent_participant_id !== user.id) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const events = await c.env.DB
    .prepare('SELECT * FROM regulator_enforcement_events WHERE case_id = ? ORDER BY event_date DESC LIMIT 200')
    .bind(id).all();
  return c.json({ success: true, data: { ...row, events: events.results || [] } });
});

suite.post('/enforcement-cases', async (c) => {
  const user = getCurrentUser(c);
  if (!canRegulate(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['case_number', 'respondent_name', 'alleged_contravention']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('enf');
  await c.env.DB.prepare(
    `INSERT INTO regulator_enforcement_cases
       (id, case_number, respondent_participant_id, respondent_name, related_licence_id,
        alleged_contravention, statutory_provision, severity, status, lead_investigator_id,
        created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'medium'), 'open', ?, ?)`,
  ).bind(
    id, b.case_number, b.respondent_participant_id || null, b.respondent_name,
    b.related_licence_id || null, b.alleged_contravention, b.statutory_provision || null,
    b.severity || null, b.lead_investigator_id || null, user.id,
  ).run();
  await c.env.DB.prepare(
    `INSERT INTO regulator_enforcement_events (id, case_id, event_type, event_date, description, actor_id)
     VALUES (?, ?, 'complaint', datetime('now'), ?, ?)`,
  ).bind(genId('eev'), id, 'Case opened', user.id).run();
  const row = await c.env.DB.prepare('SELECT * FROM regulator_enforcement_cases WHERE id = ?').bind(id).first();
  await fireCascade({
    event: 'regulator.enforcement_opened',
    actor_id: user.id,
    entity_type: 'regulator_enforcement_cases',
    entity_id: id,
    data: {
      case_number: b.case_number,
      respondent_participant_id: b.respondent_participant_id || null,
      severity: b.severity || 'medium',
    },
    env: c.env,
  });
  return c.json({ success: true, data: row }, 201);
});

suite.post('/enforcement-cases/:id/events', async (c) => {
  const user = getCurrentUser(c);
  if (!canRegulate(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const caseId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.event_type || !b.event_date) {
    return c.json({ success: false, error: 'event_type and event_date are required' }, 400);
  }
  const id = genId('eev');
  await c.env.DB.prepare(
    `INSERT INTO regulator_enforcement_events
       (id, case_id, event_type, event_date, description, evidence_r2_key, actor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, caseId, b.event_type, b.event_date,
    b.description || null, b.evidence_r2_key || null, user.id,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM regulator_enforcement_events WHERE id = ?').bind(id).first();

  await fireCascade({
    event: 'regulator.enforcement_event_logged',
    actor_id: user.id,
    entity_type: 'regulator_enforcement_events',
    entity_id: id,
    data: {
      case_id: caseId,
      event_type: b.event_type,
      event_date: b.event_date,
      has_evidence: !!b.evidence_r2_key,
    },
    env: c.env,
  });

  return c.json({ success: true, data: row }, 201);
});

suite.post('/enforcement-cases/:id/finding', async (c) => {
  const user = getCurrentUser(c);
  if (!canRegulate(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.finding || !b.finding_date) {
    return c.json({ success: false, error: 'finding and finding_date are required' }, 400);
  }
  const penalty = b.penalty_amount_zar == null ? null : Number(b.penalty_amount_zar);
  const status = penalty && penalty > 0 ? 'penalty_imposed' : 'finding';
  await c.env.DB.prepare(
    `UPDATE regulator_enforcement_cases
       SET finding = ?, finding_date = ?, penalty_amount_zar = ?, penalty_description = ?, status = ?
     WHERE id = ?`,
  ).bind(b.finding, b.finding_date, penalty, b.penalty_description || null, status, id).run();
  await c.env.DB.prepare(
    `INSERT INTO regulator_enforcement_events (id, case_id, event_type, event_date, description, actor_id)
     VALUES (?, ?, 'decision', ?, ?, ?)`,
  ).bind(genId('eev'), id, b.finding_date, String(b.finding).slice(0, 500), user.id).run();
  const row = await c.env.DB.prepare('SELECT * FROM regulator_enforcement_cases WHERE id = ?').bind(id).first<{
    case_number: string; respondent_participant_id: string | null;
  }>();
  await fireCascade({
    event: 'regulator.enforcement_finding',
    actor_id: user.id,
    entity_type: 'regulator_enforcement_cases',
    entity_id: id,
    data: {
      case_number: row?.case_number,
      respondent_participant_id: row?.respondent_participant_id,
      penalty_amount_zar: penalty,
      finding: String(b.finding).slice(0, 500),
    },
    env: c.env,
  });
  return c.json({ success: true, data: row });
});

suite.post('/enforcement-cases/:id/appeal', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const row = await c.env.DB
    .prepare('SELECT respondent_participant_id, status FROM regulator_enforcement_cases WHERE id = ?')
    .bind(id).first<{ respondent_participant_id: string | null; status: string }>();
  if (!row) return c.json({ success: false, error: 'Case not found' }, 404);
  if (!canRegulate(user.role) && row.respondent_participant_id !== user.id) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const appealDate = (b.appeal_filed_at as string) || new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE regulator_enforcement_cases SET appeal_filed_at = ?, status = 'appealed' WHERE id = ?`,
  ).bind(appealDate, id).run();
  await c.env.DB.prepare(
    `INSERT INTO regulator_enforcement_events (id, case_id, event_type, event_date, description, actor_id)
     VALUES (?, ?, 'appeal_filed', ?, ?, ?)`,
  ).bind(genId('eev'), id, appealDate, (b.grounds as string) || 'Appeal filed', user.id).run();
  const out = await c.env.DB.prepare('SELECT * FROM regulator_enforcement_cases WHERE id = ?').bind(id).first();

  await fireCascade({
    event: 'regulator.enforcement_appealed',
    actor_id: user.id,
    entity_type: 'regulator_enforcement_cases',
    entity_id: id,
    data: {
      case_id: id,
      respondent_participant_id: row.respondent_participant_id,
      appeal_filed_at: appealDate,
      grounds: (b.grounds as string) || null,
    },
    env: c.env,
  });

  return c.json({ success: true, data: out });
});

// ─── Market surveillance ───────────────────────────────────────────────────
suite.get('/surveillance/rules', async (c) => {
  const rs = await c.env.DB
    .prepare('SELECT * FROM regulator_surveillance_rules ORDER BY rule_type, rule_code').all();
  return c.json({ success: true, data: rs.results || [] });
});

suite.put('/surveillance/rules/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!canRegulate(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const k of ['enabled', 'severity', 'parameters_json', 'description'] as const) {
    if (k in b) {
      sets.push(`${k} = ?`);
      const v = b[k];
      if (k === 'enabled') binds.push(v ? 1 : 0);
      else if (k === 'parameters_json' && typeof v === 'object') binds.push(JSON.stringify(v));
      else binds.push(v == null ? null : String(v));
    }
  }
  if (!sets.length) return c.json({ success: false, error: 'No fields to update' }, 400);
  binds.push(id);
  await c.env.DB.prepare(`UPDATE regulator_surveillance_rules SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  const row = await c.env.DB.prepare('SELECT * FROM regulator_surveillance_rules WHERE id = ?').bind(id).first();
  // Bust the surveillance-rules cache so the next scan sees the change.
  c.executionCtx?.waitUntil?.(invalidateReference(c.env, 'surveillance_rules_enabled'));

  await fireCascade({
    event: 'regulator.surveillance_rule_updated',
    actor_id: user.id,
    entity_type: 'regulator_surveillance_rules',
    entity_id: id,
    data: { rule_id: id, fields_updated: sets.map((s) => s.split(' ')[0]) },
    env: c.env,
  });

  return c.json({ success: true, data: row });
});

suite.get('/surveillance/alerts', async (c) => {
  const user = getCurrentUser(c);
  if (!canRegulate(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const status = c.req.query('status') || 'open';
  const rs = await c.env.DB
    .prepare(
      'SELECT * FROM regulator_surveillance_alerts WHERE status = ? ORDER BY raised_at DESC LIMIT 500',
    ).bind(status).all();
  return c.json({ success: true, data: rs.results || [] });
});

suite.post('/surveillance/alerts/:id/resolve', async (c) => {
  const user = getCurrentUser(c);
  if (!canRegulate(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const nextStatus = (b.status as string) || 'resolved';
  const allowed = ['investigating', 'escalated', 'false_positive', 'confirmed', 'resolved'];
  if (!allowed.includes(nextStatus)) {
    return c.json({ success: false, error: `status must be one of: ${allowed.join(', ')}` }, 400);
  }
  await c.env.DB.prepare(
    `UPDATE regulator_surveillance_alerts
       SET status = ?, resolved_at = CASE WHEN ? IN ('resolved','false_positive') THEN datetime('now') ELSE resolved_at END,
           resolution_notes = COALESCE(?, resolution_notes), assigned_to = COALESCE(?, assigned_to)
     WHERE id = ?`,
  ).bind(nextStatus, nextStatus, b.resolution_notes || null, b.assigned_to || user.id, id).run();
  const row = await c.env.DB.prepare('SELECT * FROM regulator_surveillance_alerts WHERE id = ?').bind(id).first();

  await fireCascade({
    event: 'regulator.surveillance_alert_resolved',
    actor_id: user.id,
    entity_type: 'regulator_surveillance_alerts',
    entity_id: id,
    data: {
      alert_id: id,
      resolution_status: nextStatus,
      resolution_notes: b.resolution_notes || null,
    },
    env: c.env,
  });

  return c.json({ success: true, data: row });
});

suite.post('/surveillance/alerts/:id/escalate', async (c) => {
  const user = getCurrentUser(c);
  if (!canRegulate(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const alert = await c.env.DB
    .prepare('SELECT * FROM regulator_surveillance_alerts WHERE id = ?').bind(id).first<{
      participant_id: string | null; rule_code: string; details_json: string | null;
    }>();
  if (!alert) return c.json({ success: false, error: 'Alert not found' }, 404);
  const caseId = genId('enf');
  const caseNum = (b.case_number as string) || `CASE-${new Date().getFullYear()}-${caseId.slice(-6).toUpperCase()}`;
  await c.env.DB.prepare(
    `INSERT INTO regulator_enforcement_cases
       (id, case_number, respondent_participant_id, respondent_name,
        alleged_contravention, severity, status, lead_investigator_id, created_by)
     VALUES (?, ?, ?, ?, ?, 'high', 'investigating', ?, ?)`,
  ).bind(
    caseId, caseNum, alert.participant_id, (b.respondent_name as string) || 'Unknown',
    `Market surveillance alert ${alert.rule_code}: ${b.grounds || 'escalation'}`,
    user.id, user.id,
  ).run();
  await c.env.DB.prepare(
    `UPDATE regulator_surveillance_alerts SET status = 'escalated', escalated_case_id = ? WHERE id = ?`,
  ).bind(caseId, id).run();
  const enfCase = await c.env.DB
    .prepare('SELECT * FROM regulator_enforcement_cases WHERE id = ?').bind(caseId).first();
  await fireCascade({
    event: 'regulator.surveillance_escalated',
    actor_id: user.id,
    entity_type: 'regulator_surveillance_alerts',
    entity_id: id,
    data: {
      case_id: caseId,
      case_number: caseNum,
      participant_id: alert.participant_id,
      rule_code: alert.rule_code,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { case: enfCase, alert_id: id } }, 201);
});

// POST /surveillance/scan — run the enabled rules over recent activity and
// insert any new alerts. Idempotent: existing open alerts for the same
// (rule_code, entity_id) are not duplicated.
suite.post('/surveillance/scan', async (c) => {
  const user = getCurrentUser(c);
  if (!canRegulate(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const inserted = await runSurveillanceScan(c.env);
  return c.json({ success: true, data: { alerts_raised: inserted.length, alerts: inserted } });
});

// Exported so a scheduled handler or cron trigger can invoke the same scan.
export async function runSurveillanceScan(env: HonoEnv['Bindings']): Promise<Array<{
  rule_code: string; entity_id: string; participant_id: string | null; severity: string;
}>> {
  // Rules are regulator-maintained and change maybe once a quarter.
  // The scan runs every 15 min; caching for 5 min cuts 4 of every 5
  // rule-set reads while keeping new rules within a single scan window
  // of going live. Toggle via the /surveillance/rules PUT endpoint
  // which busts the cache explicitly.
  const rules = await cachedAll<{
    id: string; rule_code: string; rule_type: string; severity: string; parameters_json: string | null;
  }>(
    env,
    'surveillance_rules_enabled',
    'SELECT id, rule_code, rule_type, severity, parameters_json FROM regulator_surveillance_rules WHERE enabled = 1',
    { ttlSeconds: 300 },
  );

  const inserted: Array<{ rule_code: string; entity_id: string; participant_id: string | null; severity: string }> = [];

  // COST: the previous scan ran N+1 queries per rule (1 detector + 1 exists
  // check per finding). For a rule with 20 findings that was 21 queries.
  // Now we pull every open/investigating alert for all rules in ONE query
  // up-front, build a Set of `(rule_code|entity_id)` keys, and check
  // membership in-memory. Inserts are batched via env.DB.batch().
  const openSet = new Set<string>();
  try {
    const open = await env.DB.prepare(
      `SELECT rule_code, entity_id FROM regulator_surveillance_alerts
        WHERE status IN ('open','investigating') LIMIT 5000`,
    ).all<{ rule_code: string; entity_id: string }>();
    for (const r of open.results || []) openSet.add(`${r.rule_code}|${r.entity_id}`);
  } catch {
    /* If the bulk open-alerts query fails we fall back to per-finding
       existence checks below so the scanner still makes forward progress. */
  }

  type PendingInsert = {
    id: string;
    rule: typeof rules[number];
    finding: { entity_type: string; entity_id: string; participant_id: string | null; details: Record<string, unknown> };
  };
  const pending: PendingInsert[] = [];

  for (const rule of rules) {
    const params = safeParseJson(rule.parameters_json);
    const findings = await detectForRule(env, rule.rule_type, rule.rule_code, params);
    for (const f of findings) {
      const k = `${rule.rule_code}|${f.entity_id}`;
      if (openSet.has(k)) continue;
      // Mark as intended-inserted so two findings from different rules
      // with the same (rule_code, entity_id) in the same scan don't
      // double-insert.
      openSet.add(k);
      const id = `rsa_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${pending.length}`;
      pending.push({ id, rule, finding: f });
    }
  }

  if (pending.length > 0) {
    try {
      await env.DB.batch(pending.map((p) =>
        env.DB.prepare(
          `INSERT INTO regulator_surveillance_alerts
             (id, rule_id, rule_code, participant_id, entity_type, entity_id, severity, details_json, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
        ).bind(
          p.id, p.rule.id, p.rule.rule_code, p.finding.participant_id,
          p.finding.entity_type, p.finding.entity_id,
          p.rule.severity, JSON.stringify(p.finding.details),
        ),
      ));
    } catch (err) {
      console.warn('surveillance_insert_batch_failed', (err as Error).message);
      for (const p of pending) {
        try {
          await env.DB.prepare(
            `INSERT INTO regulator_surveillance_alerts
               (id, rule_id, rule_code, participant_id, entity_type, entity_id, severity, details_json, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
          ).bind(
            p.id, p.rule.id, p.rule.rule_code, p.finding.participant_id,
            p.finding.entity_type, p.finding.entity_id,
            p.rule.severity, JSON.stringify(p.finding.details),
          ).run();
        } catch { /* skip */ }
      }
    }
  }

  for (const p of pending) {
    // Cascade only for high/critical severity (see prior comment).
    if (p.rule.severity === 'critical' || p.rule.severity === 'high') {
      await fireCascade({
        event: 'regulator.surveillance_alert_raised',
        entity_type: 'regulator_surveillance_alerts',
        entity_id: p.id,
        data: {
          rule_code: p.rule.rule_code,
          severity: p.rule.severity,
          participant_id: p.finding.participant_id,
        },
        env,
      });
    }
    inserted.push({
      rule_code: p.rule.rule_code,
      entity_id: p.finding.entity_id,
      participant_id: p.finding.participant_id,
      severity: p.rule.severity,
    });
  }
  return inserted;
}

type SurveillanceFinding = {
  entity_type: 'trade_matches' | 'trade_orders' | 'participants';
  entity_id: string;
  participant_id: string | null;
  details: Record<string, unknown>;
};

async function detectForRule(
  env: HonoEnv['Bindings'],
  ruleType: string,
  _ruleCode: string,
  params: Record<string, unknown>,
): Promise<SurveillanceFinding[]> {
  switch (ruleType) {
    case 'wash_trade': {
      const hours = Number(params.window_hours) || 24;
      const rs = await env.DB.prepare(
        `SELECT m.id AS match_id, b.participant_id AS buyer_id, s.participant_id AS seller_id,
                m.matched_volume_mwh AS volume, m.matched_price AS price
           FROM trade_matches m
           JOIN trade_orders b ON m.buy_order_id = b.id
           JOIN trade_orders s ON m.sell_order_id = s.id
          WHERE b.participant_id = s.participant_id
            AND m.matched_at >= datetime('now', ?)`,
      ).bind(`-${hours} hours`).all<{
        match_id: string; buyer_id: string; seller_id: string; volume: number; price: number;
      }>();
      return (rs.results || []).map((r) => ({
        entity_type: 'trade_matches',
        entity_id: r.match_id,
        participant_id: r.buyer_id,
        details: { pattern: 'self_match', volume_mwh: r.volume, price: r.price, window_hours: hours },
      }));
    }

    case 'concentration': {
      const windowDays = Number(params.window_days) || 30;
      const threshold = Number(params.threshold_pct) || 40;
      const rs = await env.DB.prepare(
        `WITH recent AS (
           SELECT o.participant_id AS pid, m.matched_volume_mwh AS vol
             FROM trade_matches m
             JOIN trade_orders o
               ON o.id = m.buy_order_id OR o.id = m.sell_order_id
            WHERE m.matched_at >= datetime('now', ?)
         ),
         totals AS (
           SELECT pid, SUM(vol) AS part_vol FROM recent GROUP BY pid
         ),
         grand AS (SELECT SUM(part_vol) AS grand FROM totals)
         SELECT t.pid AS pid, t.part_vol, g.grand,
                CASE WHEN g.grand > 0 THEN (t.part_vol * 100.0 / g.grand) ELSE 0 END AS share_pct
           FROM totals t, grand g
          WHERE g.grand > 0
            AND (t.part_vol * 100.0 / g.grand) >= ?`,
      ).bind(`-${windowDays} days`, threshold).all<{
        pid: string; part_vol: number; grand: number; share_pct: number;
      }>();
      return (rs.results || []).map((r) => ({
        entity_type: 'participants',
        entity_id: r.pid,
        participant_id: r.pid,
        details: {
          share_pct: Number(r.share_pct.toFixed(2)),
          participant_volume: r.part_vol,
          total_volume: r.grand,
          window_days: windowDays,
          threshold_pct: threshold,
        },
      }));
    }

    case 'circular_trade': {
      const hours = Number(params.window_hours) || 72;
      // A→B→A chain within window: participant X sells to Y, then buys from Y.
      const rs = await env.DB.prepare(
        `SELECT DISTINCT b1.participant_id AS pid, m1.id AS match1_id, m2.id AS match2_id
           FROM trade_matches m1
           JOIN trade_orders s1 ON m1.sell_order_id = s1.id
           JOIN trade_orders b1 ON m1.buy_order_id = b1.id
           JOIN trade_matches m2 ON m2.matched_at > m1.matched_at
                                AND m2.matched_at <= datetime(m1.matched_at, ?)
           JOIN trade_orders s2 ON m2.sell_order_id = s2.id
           JOIN trade_orders b2 ON m2.buy_order_id = b2.id
          WHERE s1.participant_id = b2.participant_id
            AND b1.participant_id = s2.participant_id
            AND m1.matched_at >= datetime('now', ?)`,
      ).bind(`+${hours} hours`, `-${hours} hours`).all<{
        pid: string; match1_id: string; match2_id: string;
      }>();
      return (rs.results || []).map((r) => ({
        entity_type: 'trade_matches',
        entity_id: `${r.match1_id}|${r.match2_id}`,
        participant_id: r.pid,
        details: { pattern: 'A-B-A', first_match: r.match1_id, second_match: r.match2_id, window_hours: hours },
      }));
    }

    case 'layering': {
      const minutes = Number(params.window_minutes) || 60;
      const cancelCount = Number(params.cancel_count) || 20;
      const rs = await env.DB.prepare(
        `SELECT participant_id AS pid, COUNT(*) AS cancels
           FROM trade_orders
          WHERE status = 'cancelled'
            AND updated_at >= datetime('now', ?)
          GROUP BY participant_id
         HAVING cancels >= ?`,
      ).bind(`-${minutes} minutes`, cancelCount).all<{ pid: string; cancels: number }>();
      return (rs.results || []).map((r) => ({
        entity_type: 'participants',
        entity_id: r.pid,
        participant_id: r.pid,
        details: { cancels_in_window: r.cancels, window_minutes: minutes },
      }));
    }

    case 'spoofing': {
      const sizeMult = Number(params.size_multiple) || 5;
      const minutes = Number(params.window_minutes) || 5;
      const rs = await env.DB.prepare(
        `WITH med AS (
           SELECT participant_id AS pid,
                  AVG(volume_mwh) AS avg_vol  -- SQLite has no native median; avg is a reasonable proxy
             FROM trade_orders
            WHERE created_at >= datetime('now', '-30 days')
            GROUP BY participant_id
         )
         SELECT o.id AS ord_id, o.participant_id AS pid, o.volume_mwh AS vol,
                med.avg_vol AS avg_vol
           FROM trade_orders o
           JOIN med ON med.pid = o.participant_id
          WHERE o.status = 'cancelled'
            AND o.updated_at >= datetime('now', ?)
            AND o.volume_mwh >= med.avg_vol * ?`,
      ).bind(`-${minutes} minutes`, sizeMult).all<{
        ord_id: string; pid: string; vol: number; avg_vol: number;
      }>();
      return (rs.results || []).map((r) => ({
        entity_type: 'trade_orders',
        entity_id: r.ord_id,
        participant_id: r.pid,
        details: { volume: r.vol, median_proxy: r.avg_vol, size_multiple: sizeMult },
      }));
    }

    case 'price_manipulation': {
      const windowDays = Number(params.window_days) || 30;
      const sigma = Number(params.sigma) || 3;
      // Compute mean & std per energy_type, flag matches whose price deviates > sigma
      const types = await env.DB.prepare(
        `SELECT DISTINCT b.energy_type AS et
           FROM trade_matches m JOIN trade_orders b ON b.id = m.buy_order_id
          WHERE m.matched_at >= datetime('now', ?)`,
      ).bind(`-${windowDays} days`).all<{ et: string }>();
      const findings: SurveillanceFinding[] = [];
      for (const { et } of types.results || []) {
        const stats = await env.DB.prepare(
          `SELECT AVG(matched_price) AS mean,
                  -- SQLite has no STDDEV; synthesise via sqrt(AVG(p^2) - AVG(p)^2)
                  (AVG(matched_price * matched_price) - AVG(matched_price) * AVG(matched_price)) AS variance
             FROM trade_matches m JOIN trade_orders b ON b.id = m.buy_order_id
            WHERE b.energy_type = ? AND m.matched_at >= datetime('now', ?)`,
        ).bind(et, `-${windowDays} days`).first<{ mean: number | null; variance: number | null }>();
        if (!stats?.mean || !stats.variance || stats.variance <= 0) continue;
        const std = Math.sqrt(stats.variance);
        const lower = stats.mean - sigma * std;
        const upper = stats.mean + sigma * std;
        const outliers = await env.DB.prepare(
          `SELECT m.id AS match_id, m.matched_price AS price, b.participant_id AS buyer_id
             FROM trade_matches m JOIN trade_orders b ON b.id = m.buy_order_id
            WHERE b.energy_type = ? AND m.matched_at >= datetime('now', ?)
              AND (m.matched_price < ? OR m.matched_price > ?)`,
        ).bind(et, `-${windowDays} days`, lower, upper).all<{
          match_id: string; price: number; buyer_id: string;
        }>();
        for (const o of outliers.results || []) {
          findings.push({
            entity_type: 'trade_matches',
            entity_id: o.match_id,
            participant_id: o.buyer_id,
            details: {
              price: o.price,
              energy_type: et,
              mean: Number(stats.mean.toFixed(2)),
              std: Number(std.toFixed(2)),
              sigma_threshold: sigma,
            },
          });
        }
      }
      return findings;
    }

    default:
      // Unknown rule types are no-ops — never fail the whole scan for one bad rule.
      return [];
  }
}

function safeParseJson(s: string | null): Record<string, unknown> {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ────────────────────────────────────────────────────────────────────────
// L4 endpoints — surveillance triage, licence action workflow, enforcement
// case event log (migration 056). Layer workflow audit on top of the
// existing regulator_surveillance_alerts / regulator_licences /
// regulator_enforcement_cases tables.
// ────────────────────────────────────────────────────────────────────────

suite.post('/surveillance/triage', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as any;
  if (!body.alert_id || !body.decision) {
    return c.json({ success: false, error: 'alert_id, decision required' }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO regulator_surveillance_triage
       (id, alert_id, triaged_by, decision, rationale, enforcement_case_id, next_review_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, body.alert_id, user.id, body.decision, body.rationale || null,
         body.enforcement_case_id || null, body.next_review_at || null).run();
  return c.json({ success: true, data: { id } });
});

suite.get('/surveillance/triage', async (c) => {
  const alertId = c.req.query('alert_id');
  const where: string[] = [];
  const binds: unknown[] = [];
  if (alertId) { where.push('alert_id = ?'); binds.push(alertId); }
  const rows = await c.env.DB.prepare(
    `SELECT * FROM regulator_surveillance_triage ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY triaged_at DESC LIMIT 200`,
  ).bind(...binds).all().catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

suite.post('/licence-actions', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as any;
  if (!body.action_type) {
    return c.json({ success: false, error: 'action_type required' }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO regulator_licence_action_workflow
       (id, licence_id, application_id, action_type, initiated_by, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, body.licence_id || null, body.application_id || null,
         body.action_type, user.id, body.notes || null).run();
  return c.json({ success: true, data: { id } });
});

suite.post('/licence-actions/:id/transition', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as any;
  const to = String(body.to || '').trim();
  if (!['pending_hearing', 'decided', 'executed', 'appealed', 'reversed'].includes(to)) {
    return c.json({ success: false, error: 'invalid transition' }, 400);
  }
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE regulator_licence_action_workflow
       SET status = ?,
           decided_at = CASE WHEN ? = 'decided' AND decided_at IS NULL THEN ? ELSE decided_at END,
           decided_by = CASE WHEN ? = 'decided' AND decided_by IS NULL THEN ? ELSE decided_by END,
           decision_rationale = COALESCE(?, decision_rationale),
           updated_at = ?
     WHERE id = ?`,
  ).bind(to, to, now, to, user.id, body.rationale || null, now, id).run().catch(() => {});
  return c.json({ success: true });
});

suite.get('/licence-actions', async (c) => {
  const status = c.req.query('status');
  const where: string[] = [];
  const binds: unknown[] = [];
  if (status) { where.push('status = ?'); binds.push(status); }
  const rows = await c.env.DB.prepare(
    `SELECT * FROM regulator_licence_action_workflow ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY initiated_at DESC LIMIT 200`,
  ).bind(...binds).all().catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

suite.post('/enforcement-events', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as any;
  if (!body.case_id || !body.event_type) {
    return c.json({ success: false, error: 'case_id, event_type required' }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO regulator_enforcement_case_events
       (id, case_id, event_type, actor_id, payload_json, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, body.case_id, body.event_type, user.id,
         body.payload_json || null, body.notes || null).run();
  return c.json({ success: true, data: { id } });
});

suite.get('/enforcement-events', async (c) => {
  const caseId = c.req.query('case_id');
  const where: string[] = [];
  const binds: unknown[] = [];
  if (caseId) { where.push('case_id = ?'); binds.push(caseId); }
  const rows = await c.env.DB.prepare(
    `SELECT * FROM regulator_enforcement_case_events ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY occurred_at DESC LIMIT 200`,
  ).bind(...binds).all().catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

// ════════════════════════════════════════════════════════════════════════
// L5 — Tamper-evident audit, PAIA gazette export, cross-regulator recon.
// ════════════════════════════════════════════════════════════════════════

suite.get('/audit/head', async (c) => {
  const head = await getChainHead(c.env, 'regulator');
  return c.json({ success: true, data: head });
});

suite.get('/audit/events', async (c) => {
  const user = getCurrentUser(c);
  const limit = Math.min(200, Number(c.req.query('limit') || 50));
  const where: string[] = [`entity_type = 'regulator'`];
  const binds: unknown[] = [];
  // Regulator chain is intentionally readable by anyone (PAIA transparency).
  // Non-officers only see their own events though.
  const isOfficer = user.role === 'admin' || user.role === 'regulator' || user.role === 'support';
  if (!isOfficer) { where.push('actor_id = ?'); binds.push(user.id); }
  const rs = await c.env.DB.prepare(
    `SELECT id, entity_id, event_type, actor_id, sequence_no, content_hash, prev_hash, created_at, payload_json
       FROM audit_events WHERE ${where.join(' AND ')}
      ORDER BY sequence_no DESC LIMIT ?`,
  ).bind(...binds, limit).all();
  return c.json({ success: true, data: rs.results || [] });
});

suite.post('/audit/verify', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const fromSeq = Number(c.req.query('from_seq') || 1) || 1;
  const result = await verifyChain(c.env, 'regulator', fromSeq);
  return c.json({ success: result.ok, data: result });
});

// POST /regulator/audit/export — PAIA gazette: every licence + tariff
// determination in the period. Both registers concatenated into one CSV
// since they share the public-gazette purpose under PAIA s.14.
suite.post('/audit/export', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { from?: string; to?: string };
  const from = body.from || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = body.to || new Date().toISOString().slice(0, 10);

  const licences = await c.env.DB.prepare(
    `SELECT id, licence_number, licensee_name, licence_type, technology,
            capacity_mw, location, issue_date, effective_date, expiry_date, status
       FROM regulator_licences
      WHERE substr(issue_date, 1, 10) BETWEEN ? AND ?
      ORDER BY issue_date ASC`,
  ).bind(from, to).all<any>().catch(() => ({ results: [] } as any));

  const decisions = await c.env.DB.prepare(
    `SELECT id, decision_number, submission_id, decision_date,
            approved_revenue_zar, approved_tariff_c_per_kwh, variance_percentage,
            effective_from, effective_to, gazette_reference
       FROM regulator_tariff_decisions
      WHERE substr(decision_date, 1, 10) BETWEEN ? AND ?
      ORDER BY decision_date ASC`,
  ).bind(from, to).all<any>().catch(() => ({ results: [] } as any));

  const licRows = (licences.results || []) as Array<Record<string, any>>;
  const decRows = (decisions.results || []) as Array<Record<string, any>>;

  const header = ['record_type','record_id','primary_ref','party','category',
                  'value_a','value_b','effective_from','effective_to','status'].join(',');
  const csvLines = [header];
  for (const r of licRows) {
    csvLines.push([
      'licence', r.id, r.licence_number, csvEscape(r.licensee_name || ''),
      r.licence_type, r.capacity_mw ?? '', r.technology || '',
      r.effective_date || r.issue_date, r.expiry_date || '', r.status,
    ].join(','));
  }
  for (const r of decRows) {
    csvLines.push([
      'tariff_decision', r.id, r.decision_number, '',
      'tariff_determination',
      r.approved_revenue_zar ?? '', r.approved_tariff_c_per_kwh ?? '',
      r.effective_from, r.effective_to || '', 'gazetted',
    ].join(','));
  }
  const csv = csvLines.join('\n') + '\n';
  const csvBytes = new TextEncoder().encode(csv);
  const csvSha = await sha256OfBytes(csvBytes);

  const head = await getChainHead(c.env, 'regulator');
  const exportId = 'exp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-exports/regulator/${exportId}/gazette.csv`;
  const manifestKey = `audit-exports/regulator/${exportId}/manifest.json`;
  const manifest = {
    export_id: exportId, entity_type: 'regulator', from, to,
    generated_at: new Date().toISOString(), generated_by: user.id,
    row_count: csvLines.length - 1,
    licence_count: licRows.length, decision_count: decRows.length,
    csv: { r2_key: csvKey, sha256: csvSha, bytes: csvBytes.byteLength },
    chain: {
      head_hash: head?.head_hash || null,
      head_sequence: head?.head_sequence || 0,
      last_verified_at: head?.last_verified_at || null,
    },
    format: { profile: 'NERSA PAIA s.14 gazette register v1', encoding: 'utf-8' },
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));

  try {
    await c.env.R2.put(csvKey, csvBytes, { httpMetadata: { contentType: 'text/csv' } });
    await c.env.R2.put(manifestKey, manifestBytes, { httpMetadata: { contentType: 'application/json' } });
  } catch (e) {
    return c.json({ success: false, error: 'R2 write failed', data: { detail: (e as Error).message } }, 502);
  }

  await c.env.DB.prepare(
    `INSERT INTO audit_exports
       (id, entity_type, from_ts, to_ts, row_count,
        csv_r2_key, manifest_r2_key, chain_head_hash, generated_by, generated_at)
     VALUES (?, 'regulator', ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(exportId, from, to, csvLines.length - 1, csvKey, manifestKey,
         head?.head_hash || '', user.id).run();

  await appendAudit({
    env: c.env, entity_type: 'regulator', entity_id: exportId,
    event_type: 'audit.export_generated', actor_id: user.id,
    payload: { export_id: exportId, from, to, row_count: csvLines.length - 1, csv_sha256: csvSha },
  }).catch(() => {});

  await fireCascade({
    event: 'regulator.audit_exported',
    actor_id: user.id,
    entity_type: 'audit_exports',
    entity_id: exportId,
    data: {
      export_id: exportId,
      entity: 'regulator',
      from,
      to,
      row_count: csvLines.length - 1,
      csv_sha256: csvSha,
      profile: 'NERSA PAIA s.14 gazette register v1',
    },
    env: c.env,
    skipAudit: true,
  });

  return c.json({
    success: true,
    data: { export_id: exportId, row_count: csvLines.length - 1, csv_r2_key: csvKey, manifest_r2_key: manifestKey, manifest },
  }, 201);
});

suite.get('/audit/exports', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT id, from_ts, to_ts, row_count, csv_r2_key, manifest_r2_key,
            chain_head_hash, generated_by, generated_at
       FROM audit_exports WHERE entity_type = 'regulator'
      ORDER BY generated_at DESC LIMIT 50`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });

suite.get('/audit/exports/:id/manifest', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT manifest_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'regulator'`,
  ).bind(id).first<{ manifest_r2_key: string }>();
  if (!row) return c.json({ success: false, error: 'Export not found' }, 404);
  const obj = await c.env.R2.get(row.manifest_r2_key);
  if (!obj) return c.json({ success: false, error: 'Manifest object missing in R2' }, 404);
  const text = await obj.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* */ }
  return c.json({ success: true, data: parsed ?? { raw: text } });
});

suite.get('/audit/exports/:id/csv', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT csv_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'regulator'`,
  ).bind(id).first<{ csv_r2_key: string }>();
  if (!row) return c.json({ success: false, error: 'Export not found' }, 404);
  const obj = await c.env.R2.get(row.csv_r2_key);
  if (!obj) return c.json({ success: false, error: 'CSV object missing in R2' }, 404);
  return new Response(await obj.arrayBuffer(), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${id}.csv"`,
    },
  });
});
});

// POST /regulator/audit/recon — cross-regulator reconciliation. CSV columns:
//   licence_number, licensee_name, status, capacity_mw
// Match against regulator_licences by licence_number.
suite.post('/audit/recon', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { source?: string; csv?: string };
  const source = (body.source || 'dmre').toLowerCase();
  if (typeof body.csv !== 'string' || body.csv.length < 10) {
    return c.json({ success: false, error: 'csv body required' }, 400);
  }
  const lines = body.csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return c.json({ success: false, error: 'csv must have header + ≥1 row' }, 400);
  const headers = lines[0].split(',').map((h) => h.trim());
  const need = ['licence_number','licensee_name','status','capacity_mw'];
  for (const k of need) {
    if (!headers.includes(k)) return c.json({ success: false, error: `csv missing column: ${k}` }, 400);
  }
  const idxOf = (k: string) => headers.indexOf(k);
  type TheirRow = { licence_number: string; licensee_name: string; status: string; capacity_mw: number };
  const theirs: TheirRow[] = [];
  for (const ln of lines.slice(1)) {
    const cols = ln.split(',');
    theirs.push({
      licence_number: (cols[idxOf('licence_number')] || '').trim(),
      licensee_name: (cols[idxOf('licensee_name')] || '').trim(),
      status: (cols[idxOf('status')] || '').trim(),
      capacity_mw: Number(cols[idxOf('capacity_mw')] || 0),
    });
  }

  const runId = 'recon_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-recon/regulator/${runId}/cross.csv`;
  await c.env.R2.put(csvKey, new TextEncoder().encode(body.csv), {
    httpMetadata: { contentType: 'text/csv' },
  }).catch(() => null);

  const ours = await c.env.DB.prepare(
    `SELECT id, licence_number, licensee_name, status, capacity_mw
       FROM regulator_licences`,
  ).all<{ id: string; licence_number: string; licensee_name: string; status: string; capacity_mw: number }>();
  const ourByNumber = new Map<string, any>();
  for (const r of (ours.results || []) as any[]) ourByNumber.set(r.licence_number, r);

  const matched = new Set<string>();
  type Break = { type: string; licence_number: string | null; our: unknown; their: unknown; field: string | null };
  const breaks: Break[] = [];
  for (const t of theirs) {
    const o = ourByNumber.get(t.licence_number);
    if (!o) {
      breaks.push({ type: 'missing_in_ours', licence_number: t.licence_number || null, our: null, their: t, field: null });
      continue;
    }
    matched.add(t.licence_number);
    if ((o.status || '').toLowerCase() !== (t.status || '').toLowerCase()) {
      breaks.push({ type: 'field_mismatch', licence_number: t.licence_number, our: o, their: t, field: 'status' });
    }
    if (Math.abs(Number(o.capacity_mw || 0) - Number(t.capacity_mw)) > 0.1) {
      breaks.push({ type: 'field_mismatch', licence_number: t.licence_number, our: o, their: t, field: 'capacity_mw' });
    }
  }
  for (const [n, o] of ourByNumber.entries()) {
    if (!matched.has(n) && !theirs.some((t) => t.licence_number === n)) {
      breaks.push({ type: 'missing_in_theirs', licence_number: n, our: o, their: null, field: null });
    }
  }

  const matchedCount = theirs.length - breaks.filter((b) => b.type !== 'field_mismatch').length;
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO audit_recon_runs
       (id, entity_type, source, uploaded_csv_r2_key, row_count,
        matched_count, break_count, status, started_at, finished_at, started_by)
     VALUES (?, 'regulator', ?, ?, ?, ?, ?, 'complete', ?, ?, ?)`,
  ).bind(runId, source, csvKey, theirs.length, matchedCount,
         breaks.length, now, now, user.id).run();

  if (breaks.length > 0) {
    const inserts = breaks.map((b) => c.env.DB.prepare(
      `INSERT INTO audit_recon_breaks
         (id, run_id, break_type, external_ref, our_value, their_value, field, resolution)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
    ).bind(
      'brk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      runId, b.type, b.licence_number,
      b.our != null ? JSON.stringify(b.our) : null,
      b.their != null ? JSON.stringify(b.their) : null,
      b.field,
    ));
    await c.env.DB.batch(inserts);
  }

  await appendAudit({
    env: c.env, entity_type: 'regulator', entity_id: runId,
    event_type: 'audit.recon_run', actor_id: user.id,
    payload: { run_id: runId, source, row_count: theirs.length, break_count: breaks.length },
  }).catch(() => {});

  await fireCascade({
    event: 'regulator.recon_completed',
    actor_id: user.id,
    entity_type: 'audit_recon_runs',
    entity_id: runId,
    data: {
      run_id: runId,
      entity: 'regulator',
      source,
      row_count: theirs.length,
      matched_count: matchedCount,
      break_count: breaks.length,
    },
    env: c.env,
    skipAudit: true,
  });

  return c.json({
    success: true,
    data: { run_id: runId, source, row_count: theirs.length, matched_count: matchedCount, break_count: breaks.length },
  }, 201);
});

suite.get('/audit/recon', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT id, source, row_count, matched_count, break_count, status,
            started_at, finished_at
       FROM audit_recon_runs WHERE entity_type = 'regulator'
      ORDER BY started_at DESC LIMIT 50`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
async function sha256OfBytes(b: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', b);
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

export default suite;
