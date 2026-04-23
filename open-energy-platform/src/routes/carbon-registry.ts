// ═══════════════════════════════════════════════════════════════════════════
// Carbon registry integration, MRV workflow, serial-tracked credit inventory,
// and Carbon Tax Act s.13 offset claim calculator.
// Mounted at /api/carbon-registry.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { applyOffsetAllowance, rangeOverlaps } from '../utils/carbon-tax';
import { fireCascade } from '../utils/cascade';

const cr = new Hono<HonoEnv>();
cr.use('*', authMiddleware);

function canWrite(role: string): boolean {
  return role === 'carbon_fund' || role === 'admin' || role === 'regulator';
}
function genId(p: string) { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

// ─── Registry metadata ─────────────────────────────────────────────────────
cr.get('/registries', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT * FROM carbon_registries WHERE enabled = 1 ORDER BY registry_name`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

cr.post('/registries/sync', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.registry_id || !b.sync_type) {
    return c.json({ success: false, error: 'registry_id and sync_type required' }, 400);
  }
  const id = genId('crsync');
  await c.env.DB.prepare(
    `INSERT INTO carbon_registry_sync_log
       (id, registry_id, sync_type, external_ref, status, request_body)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
  ).bind(
    id, b.registry_id, b.sync_type, b.external_ref || null,
    typeof b.payload === 'object' ? JSON.stringify(b.payload) : null,
  ).run();
  // Actual HTTP call to registry is out-of-band; this endpoint just logs the
  // intent. A background worker picks up pending rows and dispatches.
  return c.json({ success: true, data: { sync_id: id, status: 'pending' } }, 202);
});

// ─── Credit vintages & serials ─────────────────────────────────────────────
cr.post('/vintages', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['project_id', 'registry_id', 'vintage_year', 'serial_prefix', 'serial_start', 'serial_end', 'issuance_date']) {
    if (!b[k] && b[k] !== 0) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const start = Number(b.serial_start);
  const end = Number(b.serial_end);
  if (end < start) return c.json({ success: false, error: 'serial_end must be >= serial_start' }, 400);

  // Overlap check against existing vintages for the same (project, registry).
  const existing = await c.env.DB.prepare(
    `SELECT serial_start, serial_end FROM credit_vintages
      WHERE project_id = ? AND registry_id = ?`,
  ).bind(b.project_id, b.registry_id).all<{ serial_start: number; serial_end: number }>();
  for (const row of existing.results || []) {
    if (rangeOverlaps(
      { start, end },
      { start: row.serial_start, end: row.serial_end },
    )) {
      return c.json({
        success: false,
        error: `Serial range [${start},${end}] overlaps existing [${row.serial_start},${row.serial_end}]`,
      }, 409);
    }
  }

  const quantity = end - start + 1;
  const id = genId('cv');
  await c.env.DB.prepare(
    `INSERT INTO credit_vintages
       (id, project_id, registry_id, vintage_year, serial_prefix, serial_start, serial_end,
        credits_issued, credits_retired, methodology, issuance_date, sa_carbon_tax_eligible, verification_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
  ).bind(
    id, b.project_id, b.registry_id, Number(b.vintage_year),
    b.serial_prefix, start, end, quantity,
    b.methodology || null, b.issuance_date,
    b.sa_carbon_tax_eligible ? 1 : 0, b.verification_id || null,
  ).run();

  // Issue one initial holding serial-range row to the project developer.
  const project = await c.env.DB.prepare(
    `SELECT developer_id FROM carbon_projects WHERE id = ?`,
  ).bind(b.project_id).first<{ developer_id: string }>();
  if (project?.developer_id) {
    await c.env.DB.prepare(
      `INSERT INTO credit_serials
         (id, vintage_id, owner_participant_id, serial_start, serial_end, quantity, status)
       VALUES (?, ?, ?, ?, ?, ?, 'held')`,
    ).bind(genId('cs'), id, project.developer_id, start, end, quantity).run();
  }
  return c.json({ success: true, data: { id, quantity } }, 201);
});

cr.get('/vintages/:project_id', async (c) => {
  const pid = c.req.param('project_id');
  const rs = await c.env.DB.prepare(
    `SELECT v.*, r.registry_name
       FROM credit_vintages v JOIN carbon_registries r ON r.id = v.registry_id
      WHERE v.project_id = ? ORDER BY v.vintage_year DESC`,
  ).bind(pid).all();
  return c.json({ success: true, data: rs.results || [] });
});

cr.post('/serials/transfer', async (c) => {
  const user = getCurrentUser(c);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['serial_id', 'to_participant_id', 'quantity']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const serial = await c.env.DB.prepare(
    `SELECT * FROM credit_serials WHERE id = ?`,
  ).bind(b.serial_id).first<{
    id: string; vintage_id: string; owner_participant_id: string;
    serial_start: number; serial_end: number; quantity: number; status: string;
  }>();
  if (!serial) return c.json({ success: false, error: 'Serial block not found' }, 404);
  if (serial.status !== 'held') {
    return c.json({ success: false, error: `Cannot transfer (status: ${serial.status})` }, 400);
  }
  if (user.role !== 'admin' && serial.owner_participant_id !== user.id) {
    return c.json({ success: false, error: 'Only current owner may transfer' }, 403);
  }
  const qty = Number(b.quantity);
  if (qty <= 0 || qty > serial.quantity) {
    return c.json({ success: false, error: `quantity must be in [1, ${serial.quantity}]` }, 400);
  }

  // Split the serial block: first `qty` serials transfer, remainder stays with seller.
  const transferStart = serial.serial_start;
  const transferEnd = transferStart + qty - 1;
  const remainderStart = transferEnd + 1;
  const remainderEnd = serial.serial_end;

  await c.env.DB.prepare(
    `UPDATE credit_serials
        SET serial_start = ?, serial_end = ?, quantity = ?
      WHERE id = ?`,
  ).bind(transferStart, transferEnd, qty, serial.id).run();
  await c.env.DB.prepare(
    `UPDATE credit_serials SET owner_participant_id = ?, status = 'transferred' WHERE id = ?`,
  ).bind(b.to_participant_id, serial.id).run();

  if (remainderEnd >= remainderStart) {
    await c.env.DB.prepare(
      `INSERT INTO credit_serials
         (id, vintage_id, owner_participant_id, serial_start, serial_end, quantity, status)
       VALUES (?, ?, ?, ?, ?, ?, 'held')`,
    ).bind(
      genId('cs'), serial.vintage_id, serial.owner_participant_id,
      remainderStart, remainderEnd, remainderEnd - remainderStart + 1,
    ).run();
  }

  return c.json({ success: true, data: { transferred_quantity: qty } });
});

cr.post('/serials/retire', async (c) => {
  const user = getCurrentUser(c);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['serial_id', 'retirement_id']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const serial = await c.env.DB.prepare(
    `SELECT owner_participant_id, status, vintage_id, quantity FROM credit_serials WHERE id = ?`,
  ).bind(b.serial_id).first<{ owner_participant_id: string; status: string; vintage_id: string; quantity: number }>();
  if (!serial) return c.json({ success: false, error: 'Serial block not found' }, 404);
  if (serial.status === 'retired') return c.json({ success: false, error: 'Already retired' }, 400);
  if (user.role !== 'admin' && serial.owner_participant_id !== user.id) {
    return c.json({ success: false, error: 'Only owner may retire' }, 403);
  }
  await c.env.DB.prepare(
    `UPDATE credit_serials
        SET status = 'retired', retired_at = datetime('now'), retirement_ref = ?
      WHERE id = ?`,
  ).bind(b.retirement_id, b.serial_id).run();
  await c.env.DB.prepare(
    `UPDATE credit_vintages SET credits_retired = credits_retired + ? WHERE id = ?`,
  ).bind(serial.quantity, serial.vintage_id).run();
  return c.json({ success: true });
});

// ─── MRV workflow ──────────────────────────────────────────────────────────
cr.post('/mrv/submissions', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['project_id', 'reporting_period_start', 'reporting_period_end', 'claimed_reductions_tco2e']) {
    if (b[k] == null) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('mrv');
  await c.env.DB.prepare(
    `INSERT INTO mrv_submissions
       (id, project_id, reporting_period_start, reporting_period_end, submitted_by,
        claimed_reductions_tco2e, monitoring_methodology, monitoring_plan_r2_key,
        activity_data_r2_key, emission_factors_json, baseline_methodology,
        baseline_emissions_tco2e, project_emissions_tco2e, leakage_tco2e, status, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', datetime('now'))`,
  ).bind(
    id, b.project_id, b.reporting_period_start, b.reporting_period_end, user.id,
    Number(b.claimed_reductions_tco2e),
    b.monitoring_methodology || null, b.monitoring_plan_r2_key || null,
    b.activity_data_r2_key || null,
    typeof b.emission_factors === 'object' ? JSON.stringify(b.emission_factors) : null,
    b.baseline_methodology || null,
    b.baseline_emissions_tco2e == null ? null : Number(b.baseline_emissions_tco2e),
    b.project_emissions_tco2e == null ? null : Number(b.project_emissions_tco2e),
    b.leakage_tco2e == null ? 0 : Number(b.leakage_tco2e),
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM mrv_submissions WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

cr.post('/mrv/submissions/:id/verify', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const submissionId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.opinion || !b.verification_date) {
    return c.json({ success: false, error: 'opinion and verification_date are required' }, 400);
  }
  const id = genId('mrvv');
  await c.env.DB.prepare(
    `INSERT INTO mrv_verifications
       (id, submission_id, verifier_participant_id, verifier_accreditation,
        site_visit_date, desk_review_date, verified_reductions_tco2e, qualifications,
        opinion, verification_report_r2_key, verification_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, submissionId, user.id, b.verifier_accreditation || null,
    b.site_visit_date || null, b.desk_review_date || null,
    b.verified_reductions_tco2e == null ? null : Number(b.verified_reductions_tco2e),
    b.qualifications || null, b.opinion,
    b.verification_report_r2_key || null, b.verification_date,
  ).run();
  const status = b.opinion === 'positive' || b.opinion === 'qualified' ? 'verified' : 'rejected';
  await c.env.DB.prepare(
    `UPDATE mrv_submissions SET status = ? WHERE id = ?`,
  ).bind(status, submissionId).run();
  const submissionRow = await c.env.DB.prepare(
    `SELECT submitted_by FROM mrv_submissions WHERE id = ?`,
  ).bind(submissionId).first<{ submitted_by: string }>();
  await fireCascade({
    event: 'carbon.mrv_verified',
    actor_id: user.id,
    entity_type: 'mrv_verifications',
    entity_id: id,
    data: {
      submission_id: submissionId,
      submitted_by: submissionRow?.submitted_by,
      opinion: b.opinion,
      verified_reductions_tco2e: b.verified_reductions_tco2e,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { verification_id: id, submission_status: status } }, 201);
});

cr.get('/mrv/submissions', async (c) => {
  const user = getCurrentUser(c);
  const projectId = c.req.query('project_id');
  const rs = projectId
    ? await c.env.DB.prepare(
        `SELECT s.*, v.opinion, v.verified_reductions_tco2e
           FROM mrv_submissions s
           LEFT JOIN mrv_verifications v ON v.submission_id = s.id
          WHERE s.project_id = ? ORDER BY s.submitted_at DESC`,
      ).bind(projectId).all()
    : await c.env.DB.prepare(
        `SELECT s.*, v.opinion, v.verified_reductions_tco2e
           FROM mrv_submissions s
           LEFT JOIN mrv_verifications v ON v.submission_id = s.id
          WHERE s.submitted_by = ? OR ? = 'admin'
          ORDER BY s.submitted_at DESC LIMIT 200`,
      ).bind(user.id, user.role).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ─── Carbon Tax s.13 offset claims ─────────────────────────────────────────
cr.post('/tax-claims', async (c) => {
  const user = getCurrentUser(c);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['taxpayer_participant_id', 'tax_year', 'gross_tax_liability_zar', 'industry_group', 'tax_rate_zar_per_tco2e']) {
    if (b[k] == null) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  if (user.role !== 'admin' && b.taxpayer_participant_id !== user.id) {
    return c.json({ success: false, error: 'Can only claim for self' }, 403);
  }
  const credits = Number(b.credits_tco2e || 0);
  const r = applyOffsetAllowance({
    gross_tax_liability_zar: Number(b.gross_tax_liability_zar),
    industry_group: b.industry_group === 'annex_2' ? 'annex_2' : 'general',
    credits_tco2e: credits,
    tax_rate_zar_per_tco2e: Number(b.tax_rate_zar_per_tco2e),
  });

  const id = genId('cto');
  await c.env.DB.prepare(
    `INSERT INTO carbon_tax_offset_claims
       (id, taxpayer_participant_id, tax_year, gross_tax_liability_zar, offset_limit_pct,
        offset_limit_zar, credits_applied_tco2e, offset_value_zar, net_tax_liability_zar,
        status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
  ).bind(
    id, b.taxpayer_participant_id, Number(b.tax_year), r.gross, r.offset_limit_pct,
    r.offset_limit_zar, r.credits_used_tco2e, r.offset_applied_zar, r.net, user.id,
  ).run();
  return c.json({
    success: true,
    data: {
      claim_id: id,
      offset_limit_pct: r.offset_limit_pct,
      offset_limit_zar: r.offset_limit_zar,
      offset_applied_zar: r.offset_applied_zar,
      net_tax_liability_zar: r.net,
      credits_used_tco2e: r.credits_used_tco2e,
      credits_unused_tco2e: r.credits_unused_tco2e,
    },
  }, 201);
});

cr.post('/tax-claims/:id/attach-retirement', async (c) => {
  const user = getCurrentUser(c);
  const claimId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.retirement_id || b.credits_applied_tco2e == null) {
    return c.json({ success: false, error: 'retirement_id and credits_applied_tco2e required' }, 400);
  }
  // Fail clearly if this retirement was already attached to any claim.
  const dup = await c.env.DB.prepare(
    `SELECT claim_id FROM carbon_tax_offset_retirements WHERE retirement_id = ?`,
  ).bind(b.retirement_id).first<{ claim_id: string }>();
  if (dup) {
    return c.json({
      success: false,
      error: `Retirement already attached to claim ${dup.claim_id}`,
    }, 409);
  }
  await c.env.DB.prepare(
    `INSERT INTO carbon_tax_offset_retirements (id, claim_id, retirement_id, credits_applied_tco2e)
     VALUES (?, ?, ?, ?)`,
  ).bind(genId('ctor'), claimId, b.retirement_id, Number(b.credits_applied_tco2e)).run();
  // ensure caller role is admin OR owns the claim
  if (user.role !== 'admin') {
    const claim = await c.env.DB.prepare(
      `SELECT taxpayer_participant_id FROM carbon_tax_offset_claims WHERE id = ?`,
    ).bind(claimId).first<{ taxpayer_participant_id: string }>();
    if (!claim || claim.taxpayer_participant_id !== user.id) {
      return c.json({ success: false, error: 'Not authorised' }, 403);
    }
  }
  return c.json({ success: true });
});

cr.post('/tax-claims/:id/submit', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const claim = await c.env.DB.prepare(
    `SELECT taxpayer_participant_id, status FROM carbon_tax_offset_claims WHERE id = ?`,
  ).bind(id).first<{ taxpayer_participant_id: string; status: string }>();
  if (!claim) return c.json({ success: false, error: 'Claim not found' }, 404);
  if (user.role !== 'admin' && claim.taxpayer_participant_id !== user.id) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  if (claim.status !== 'draft') {
    return c.json({ success: false, error: `Claim already ${claim.status}` }, 400);
  }
  await c.env.DB.prepare(
    `UPDATE carbon_tax_offset_claims
        SET status = 'submitted', submitted_at = datetime('now'), sars_reference = ?
      WHERE id = ?`,
  ).bind((b.sars_reference as string) || null, id).run();
  const claimRow = await c.env.DB.prepare(
    `SELECT taxpayer_participant_id, tax_year, offset_applied_zar, net_tax_liability_zar
       FROM carbon_tax_offset_claims WHERE id = ?`,
  ).bind(id).first<{
    taxpayer_participant_id: string; tax_year: number;
    offset_applied_zar: number; net_tax_liability_zar: number;
  }>();
  await fireCascade({
    event: 'carbon.tax_claim_submitted',
    actor_id: user.id,
    entity_type: 'carbon_tax_offset_claims',
    entity_id: id,
    data: {
      taxpayer_participant_id: claimRow?.taxpayer_participant_id,
      tax_year: claimRow?.tax_year,
      offset_applied_zar: claimRow?.offset_applied_zar,
      net_tax_liability_zar: claimRow?.net_tax_liability_zar,
    },
    env: c.env,
  });
  return c.json({ success: true });
});

cr.get('/tax-claims', async (c) => {
  const user = getCurrentUser(c);
  const rs = await c.env.DB.prepare(
    `SELECT * FROM carbon_tax_offset_claims
      WHERE taxpayer_participant_id = ? OR ? = 'admin'
      ORDER BY tax_year DESC LIMIT 100`,
  ).bind(user.id, user.role).all();
  return c.json({ success: true, data: rs.results || [] });
});

export default cr;
