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
  });
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
  const id = c.req.param('id');
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
    });
  }
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
  });
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

  for (const rule of rules) {
    const params = safeParseJson(rule.parameters_json);
    const findings = await detectForRule(env, rule.rule_type, rule.rule_code, params);
    for (const f of findings) {
      const exists = await env.DB.prepare(
        `SELECT id FROM regulator_surveillance_alerts
           WHERE rule_code = ? AND entity_id = ? AND status IN ('open','investigating')`,
      ).bind(rule.rule_code, f.entity_id).first();
      if (exists) continue;
      const id = `rsa_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      await env.DB.prepare(
        `INSERT INTO regulator_surveillance_alerts
           (id, rule_id, rule_code, participant_id, entity_type, entity_id, severity, details_json, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      ).bind(
        id, rule.id, rule.rule_code, f.participant_id, f.entity_type, f.entity_id,
        rule.severity, JSON.stringify(f.details),
      ).run();
      // Fire the cascade so regulators + flagged participants get a
      // notification. Only critical/high alerts push — medium/low are
      // viewable in the workbench but don't page people.
      if (rule.severity === 'critical' || rule.severity === 'high') {
        await fireCascade({
          event: 'regulator.surveillance_alert_raised',
          entity_type: 'regulator_surveillance_alerts',
          entity_id: id,
          data: {
            rule_code: rule.rule_code,
            severity: rule.severity,
            participant_id: f.participant_id,
          },
          env,
        });
      }
      inserted.push({
        rule_code: rule.rule_code,
        entity_id: f.entity_id,
        participant_id: f.participant_id,
        severity: rule.severity,
      });
    }
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
  ruleCode: string,
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

export default suite;
