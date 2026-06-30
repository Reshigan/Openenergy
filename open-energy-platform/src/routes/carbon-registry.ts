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
import { cachedAll } from '../utils/reference-cache';
import { appendAudit, getChainHead, verifyChain } from '../utils/audit-chain';

const cr = new Hono<HonoEnv>();
cr.use('*', authMiddleware);

function canWrite(role: string): boolean {
  return role === 'carbon_fund' || role === 'admin' || role === 'regulator';
}
function genId(p: string) { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

// ─── Registry metadata ─────────────────────────────────────────────────────
cr.get('/registries', async (c) => {
  // The registry catalog is operator-maintained and changes rarely
  // (adding a new domestic registry is a once-per-year event). Cache
  // in KV for 1 hour to eliminate the per-page D1 read.
  const rows = await cachedAll(
    c.env as unknown as { DB: HonoEnv['Bindings']['DB']; KV: HonoEnv['Bindings']['KV'] },
    'carbon_registries',
    `SELECT id, registry_code, registry_name, registry_type,
            api_base_url, sa_carbon_tax_eligible, enabled
       FROM carbon_registries WHERE enabled = 1 ORDER BY registry_name`,
    { ttlSeconds: 3600 },
  );
  return c.json({ success: true, data: rows });
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

  await fireCascade({
    event: 'carbon.vintage_issued',
    actor_id: user.id,
    entity_type: 'credit_vintages',
    entity_id: id,
    data: {
      vintage_id: id,
      project_id: b.project_id,
      registry_id: b.registry_id,
      vintage_year: Number(b.vintage_year),
      serial_prefix: b.serial_prefix,
      serial_start: start,
      serial_end: end,
      quantity,
      sa_carbon_tax_eligible: !!b.sa_carbon_tax_eligible,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, quantity } }, 201);
});

cr.get('/vintages', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT v.*, r.registry_name, p.project_name
       FROM credit_vintages v
       JOIN carbon_registries r ON r.id = v.registry_id
       JOIN carbon_projects p ON p.id = v.project_id
       ORDER BY v.vintage_year DESC LIMIT 200`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
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

  await appendAudit({
    env: c.env, entity_type: 'carbon', entity_id: serial.id,
    event_type: 'serial.transferred', actor_id: user.id,
    payload: {
      serial_id: serial.id, vintage_id: serial.vintage_id,
      from_participant_id: serial.owner_participant_id,
      to_participant_id: b.to_participant_id,
      quantity: qty,
      serial_range: { from: transferStart, to: transferEnd },
    },
  }).catch((e) => console.warn('audit_serial_transfer_failed', (e as Error).message));

  await fireCascade({
    event: 'carbon.serial_transferred',
    actor_id: user.id,
    entity_type: 'credit_serials',
    entity_id: serial.id,
    data: {
      serial_id: serial.id,
      vintage_id: serial.vintage_id,
      from_participant_id: serial.owner_participant_id,
      to_participant_id: b.to_participant_id,
      quantity: qty,
      serial_range: { from: transferStart, to: transferEnd },
    },
    env: c.env,
    skipAudit: true,
  });

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

  await appendAudit({
    env: c.env, entity_type: 'carbon', entity_id: String(b.serial_id),
    event_type: 'serial.retired', actor_id: user.id,
    payload: {
      serial_id: b.serial_id, vintage_id: serial.vintage_id,
      retirement_id: b.retirement_id, quantity: serial.quantity,
    },
  }).catch((e) => console.warn('audit_serial_retire_failed', (e as Error).message));

  await fireCascade({
    event: 'carbon.serial_retired',
    actor_id: user.id,
    entity_type: 'credit_serials',
    entity_id: String(b.serial_id),
    data: {
      serial_id: b.serial_id,
      vintage_id: serial.vintage_id,
      retirement_id: b.retirement_id,
      quantity: serial.quantity,
      owner_participant_id: serial.owner_participant_id,
    },
    env: c.env,
    skipAudit: true,
  });

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

  await fireCascade({
    event: 'carbon.mrv_submitted',
    actor_id: user.id,
    entity_type: 'mrv_submissions',
    entity_id: id,
    data: {
      submission_id: id,
      project_id: b.project_id,
      reporting_period_start: b.reporting_period_start,
      reporting_period_end: b.reporting_period_end,
      claimed_reductions_tco2e: Number(b.claimed_reductions_tco2e),
    },
    env: c.env,
  });

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

// GET /carbon-registry/pipeline — Kanban view of project verification stages
//
// Combines `carbon_credits` (already-issued / available) with
// `carbon_tax_offset_claims` source-projects, computing a stage that maps to
// the issuance pipeline UI: listed → verifying → verified → issued → available.
cr.get('/pipeline', async (c) => {
  const user = getCurrentUser(c);
  // Best-effort: registry-side projects table exists in some seeds, plain
  // carbon_credits in others. We aggregate everything we have into a single
  // rolled-up list keyed by project_id + methodology + vintage.
  type Row = { id: string; project_name: string; methodology: string; vintage: number; estimated_credits: number; stage: string; verifier?: string; expected_issuance?: string };
  const out: Row[] = [];

  // Pull from the live `carbon_holdings` + `carbon_projects` tables (legacy
  // `carbon_credits` was renamed in v2 and the join target is the carbon
  // registry project, not the IPP project).
  const credits = await c.env.DB.prepare(
    `SELECT h.id, h.project_id, h.vintage_year AS vintage, h.quantity, h.status, h.created_at,
            p.project_name, p.methodology, p.project_type, p.developer_id, p.project_number AS serial_number
       FROM carbon_holdings h
       LEFT JOIN carbon_projects p ON p.id = h.project_id
      WHERE (h.participant_id = ? OR ? IN ('admin','regulator','carbon_fund'))
      ORDER BY h.created_at DESC LIMIT 200`,
  ).bind(user.id, user.role).all().catch(() => ({ results: [] as Array<Record<string, unknown>> }));

  for (const r of (credits.results || []) as Array<Record<string, unknown>>) {
    const status = String(r.status || 'available');
    const stage =
      status === 'available' ? 'available' :
      status === 'issued'    ? 'issued' :
      status === 'verified'  ? 'verified' :
      status === 'verifying' ? 'verifying' : 'listed';
    out.push({
      id: String(r.id),
      project_name: String(r.project_name || `Project ${String(r.project_id || '').slice(0, 6)}`),
      methodology: String(r.methodology || 'VCS'),
      vintage: Number(r.vintage || 0),
      estimated_credits: Number(r.quantity || 0),
      stage,
      verifier: undefined,
      expected_issuance: undefined,
    });
  }

  return c.json({ success: true, data: out });
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

// ────────────────────────────────────────────────────────────────────────
// L4 endpoints — vintage workflow, MRV submissions, retirement certificates
// (migration 056). All catch missing-table errors gracefully.
// ────────────────────────────────────────────────────────────────────────

cr.get('/vintage-workflow', async (c) => {
  const user = getCurrentUser(c);
  const rows = await c.env.DB.prepare(
    `SELECT * FROM carbon_vintage_workflow
      WHERE participant_id = ? OR ? IN ('admin','regulator')
      ORDER BY updated_at DESC LIMIT 200`,
  ).bind(user.id, user.role).all().catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

cr.post('/vintage-workflow/:id/advance', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));
  const nextStage = String(body.to_stage || '').trim();
  if (!nextStage) return c.json({ success: false, error: 'to_stage required' }, 400);
  await c.env.DB.prepare(
    `UPDATE carbon_vintage_workflow SET current_stage = ?, updated_at = datetime('now') WHERE id = ?`,
  ).bind(nextStage, id).run().catch(() => {});
  return c.json({ success: true });
});

cr.get('/mrv-submissions', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status');
  const where: string[] = ["(participant_id = ? OR ? IN ('admin','regulator'))"];
  const binds: unknown[] = [user.id, user.role];
  if (status) { where.push('status = ?'); binds.push(status); }
  const rows = await c.env.DB.prepare(
    `SELECT * FROM carbon_mrv_workflow WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(submitted_at, created_at) DESC LIMIT 200`,
  ).bind(...binds).all().catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

cr.post('/mrv-submissions', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as any;
  if (!body.project_id || !body.period_start || !body.period_end) {
    return c.json({ success: false, error: 'project_id, period_start, period_end required' }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO carbon_mrv_workflow (id, project_id, participant_id, period_start, period_end, status, notes)
     VALUES (?, ?, ?, ?, ?, 'draft', ?)`,
  ).bind(id, body.project_id, user.id, body.period_start, body.period_end, body.notes || null).run();
  return c.json({ success: true, data: { id } });
});

cr.post('/mrv-submissions/:id/transition', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as any;
  const to = String(body.to || '').trim();
  if (!['submitted', 'under_verification', 'verified', 'rejected', 'published'].includes(to)) {
    return c.json({ success: false, error: 'invalid transition' }, 400);
  }
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE carbon_mrv_workflow
       SET status = ?,
           submitted_at = CASE WHEN ? = 'submitted' AND submitted_at IS NULL THEN ? ELSE submitted_at END,
           submitted_by = CASE WHEN ? = 'submitted' AND submitted_by IS NULL THEN ? ELSE submitted_by END,
           verified_at  = CASE WHEN ? = 'verified'  AND verified_at  IS NULL THEN ? ELSE verified_at  END,
           verified_by  = CASE WHEN ? = 'verified'  AND verified_by  IS NULL THEN ? ELSE verified_by  END,
           rejection_reason = COALESCE(?, rejection_reason),
           reduction_tco2e = COALESCE(?, reduction_tco2e),
           updated_at = ?
     WHERE id = ?`,
  ).bind(
    to,
    to, now, to, user.id,
    to, now, to, user.id,
    body.rejection_reason || null,
    body.reduction_tco2e ?? null,
    now,
    id,
  ).run().catch(() => {});

  await appendAudit({
    env: c.env, entity_type: 'carbon', entity_id: id,
    event_type: 'mrv.transitioned', actor_id: user.id,
    payload: {
      mrv_id: id, to_status: to,
      reduction_tco2e: body.reduction_tco2e ?? null,
      rejection_reason: body.rejection_reason || null,
    },
  }).catch((e) => console.warn('audit_mrv_transition_failed', (e as Error).message));

  return c.json({ success: true });
});

cr.get('/retirement-certificates', async (c) => {
  const user = getCurrentUser(c);
  const rows = await c.env.DB.prepare(
    `SELECT * FROM carbon_retirement_certificates
      WHERE participant_id = ? OR ? IN ('admin','regulator')
      ORDER BY created_at DESC LIMIT 200`,
  ).bind(user.id, user.role).all().catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

cr.post('/retirement-certificates/issue', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as any;
  if (!body.retirement_id || !body.retired_volume_tco2e) {
    return c.json({ success: false, error: 'retirement_id + retired_volume_tco2e required' }, 400);
  }
  const id = crypto.randomUUID();
  const certNumber = `OE-CERT-${new Date().getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`;
  await c.env.DB.prepare(
    `INSERT INTO carbon_retirement_certificates
       (id, retirement_id, participant_id, beneficiary_name, beneficiary_email,
        retired_volume_tco2e, certificate_number, status, issued_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'issued', datetime('now'))`,
  ).bind(
    id, body.retirement_id, user.id,
    body.beneficiary_name || null, body.beneficiary_email || null,
    body.retired_volume_tco2e, certNumber,
  ).run();

  await appendAudit({
    env: c.env, entity_type: 'carbon', entity_id: id,
    event_type: 'retirement_certificate.issued', actor_id: user.id,
    payload: {
      certificate_id: id, certificate_number: certNumber,
      retirement_id: body.retirement_id,
      retired_volume_tco2e: Number(body.retired_volume_tco2e),
      beneficiary_name: body.beneficiary_name || null,
    },
  }).catch((e) => console.warn('audit_cert_issued_failed', (e as Error).message));

  await fireCascade({
    event: 'carbon.retirement_certificate_issued',
    actor_id: user.id,
    entity_type: 'carbon_retirement_certificates',
    entity_id: id,
    data: {
      certificate_id: id,
      certificate_number: certNumber,
      retirement_id: body.retirement_id,
      retired_volume_tco2e: Number(body.retired_volume_tco2e),
      beneficiary_name: body.beneficiary_name || null,
    },
    env: c.env,
    skipAudit: true,
  });

  return c.json({ success: true, data: { id, certificate_number: certNumber } });
});

// ════════════════════════════════════════════════════════════════════════
// L5 — Tamper-evident audit, Verra-shape export, registry reconciliation.
// ════════════════════════════════════════════════════════════════════════

// Full-chain carbon audit + export packs are officer-only (admin/support/
// regulator), matching the officer-gated POST /audit/export and the actor_id
// scoping in GET /audit/events.
const carbonAuditOfficer = (role: string): boolean =>
  role === 'admin' || role === 'support' || role === 'regulator';

cr.get('/audit/head', async (c) => {
  const user = getCurrentUser(c);
  if (!carbonAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const head = await getChainHead(c.env, 'carbon');
  return c.json({ success: true, data: head });
});

cr.get('/audit/events', async (c) => {
  const user = getCurrentUser(c);
  const limit = Math.min(200, Number(c.req.query('limit') || 50));
  const beforeSeq = c.req.query('before_seq');
  const where: string[] = [`entity_type = 'carbon'`];
  const binds: unknown[] = [];
  const isOfficer = user.role === 'admin' || user.role === 'regulator' || user.role === 'support';
  if (!isOfficer) { where.push('actor_id = ?'); binds.push(user.id); }
  if (beforeSeq) { where.push('sequence_no < ?'); binds.push(Number(beforeSeq)); }
  const rs = await c.env.DB.prepare(
    `SELECT id, entity_id, event_type, actor_id, sequence_no,
            content_hash, prev_hash, created_at, payload_json
       FROM audit_events
      WHERE ${where.join(' AND ')}
      ORDER BY sequence_no DESC
      LIMIT ?`,
  ).bind(...binds, limit).all();
  return c.json({ success: true, data: rs.results || [] });
});

cr.post('/audit/verify', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const fromSeq = Number(c.req.query('from_seq') || 1) || 1;
  const result = await verifyChain(c.env, 'carbon', fromSeq);
  return c.json({ success: result.ok, data: result });
});

// POST /carbon-registry/audit/export — Verra-shape retirement register CSV.
// Columns: certificate_number, retirement_id, vintage_id, serial_range,
//          retired_tco2e, beneficiary, retired_at, registry, project_id
cr.post('/audit/export', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator' && user.role !== 'carbon_fund') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { from?: string; to?: string };
  const from = body.from || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = body.to || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return c.json({ success: false, error: 'from/to must be YYYY-MM-DD' }, 400);
  }

  const rows = await c.env.DB.prepare(
    `SELECT cs.id AS serial_id, cs.retirement_ref, cs.serial_start, cs.serial_end,
            cs.quantity, cs.retired_at, cs.vintage_id, cs.owner_participant_id,
            cv.vintage_year, cv.registry_code, cv.project_id, p.name AS beneficiary_name
       FROM credit_serials cs
       LEFT JOIN credit_vintages cv ON cv.id = cs.vintage_id
       LEFT JOIN participants p ON p.id = cs.owner_participant_id
      WHERE cs.status = 'retired'
        AND substr(cs.retired_at, 1, 10) BETWEEN ? AND ?
      ORDER BY cs.retired_at ASC`,
  ).bind(from, to).all<{
    serial_id: string; retirement_ref: string | null;
    serial_start: number; serial_end: number; quantity: number;
    retired_at: string; vintage_id: string; owner_participant_id: string;
    vintage_year: number | null; registry_code: string | null;
    project_id: string | null; beneficiary_name: string | null;
  }>();
  const data = rows.results || [];

  const header = ['serial_id','retirement_ref','vintage_id','vintage_year','registry',
                  'project_id','serial_start','serial_end','quantity_tco2e',
                  'retired_at','beneficiary_id','beneficiary_name'].join(',');
  const csvLines = [header];
  for (const r of data) {
    csvLines.push([
      r.serial_id, r.retirement_ref || '',
      r.vintage_id, r.vintage_year || '',
      r.registry_code || '', r.project_id || '',
      r.serial_start, r.serial_end, r.quantity,
      r.retired_at,
      r.owner_participant_id,
      csvEscape(r.beneficiary_name || ''),
    ].join(','));
  }
  const csv = csvLines.join('\n') + '\n';
  const csvBytes = new TextEncoder().encode(csv);
  const csvSha = await sha256OfBytes(csvBytes);

  const head = await getChainHead(c.env, 'carbon');
  const exportId = 'exp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-exports/carbon/${exportId}/retirements.csv`;
  const manifestKey = `audit-exports/carbon/${exportId}/manifest.json`;
  const manifest = {
    export_id: exportId, entity_type: 'carbon', from, to,
    generated_at: new Date().toISOString(), generated_by: user.id, row_count: data.length,
    csv: { r2_key: csvKey, sha256: csvSha, bytes: csvBytes.byteLength },
    chain: {
      head_hash: head?.head_hash || null,
      head_sequence: head?.head_sequence || 0,
      last_verified_at: head?.last_verified_at || null,
    },
    format: { profile: 'Verra VCS retirement register v1', encoding: 'utf-8' },
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
     VALUES (?, 'carbon', ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(exportId, from, to, data.length, csvKey, manifestKey,
         head?.head_hash || '', user.id).run();

  await appendAudit({
    env: c.env, entity_type: 'carbon', entity_id: exportId,
    event_type: 'audit.export_generated', actor_id: user.id,
    payload: { export_id: exportId, from, to, row_count: data.length, csv_sha256: csvSha },
  }).catch(() => {});

  await fireCascade({
    event: 'carbon.audit_exported',
    actor_id: user.id,
    entity_type: 'audit_exports',
    entity_id: exportId,
    data: {
      export_id: exportId,
      entity: 'carbon',
      from,
      to,
      row_count: data.length,
      csv_sha256: csvSha,
      profile: 'Verra VCS retirement register v1',
    },
    env: c.env,
    skipAudit: true,
  });

  return c.json({
    success: true,
    data: { export_id: exportId, row_count: data.length, csv_r2_key: csvKey, manifest_r2_key: manifestKey, manifest },
  }, 201);
});

cr.get('/audit/exports', async (c) => {
  const user = getCurrentUser(c);
  if (!carbonAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const rs = await c.env.DB.prepare(
    `SELECT id, from_ts, to_ts, row_count, csv_r2_key, manifest_r2_key,
            chain_head_hash, generated_by, generated_at
       FROM audit_exports WHERE entity_type = 'carbon'
      ORDER BY generated_at DESC LIMIT 50`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

cr.get('/audit/exports/:id/manifest', async (c) => {
  const user = getCurrentUser(c);
  if (!carbonAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT manifest_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'carbon'`,
  ).bind(id).first<{ manifest_r2_key: string }>();
  if (!row) return c.json({ success: false, error: 'Export not found' }, 404);
  const obj = await c.env.R2.get(row.manifest_r2_key);
  if (!obj) return c.json({ success: false, error: 'Manifest object missing in R2' }, 404);
  const text = await obj.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* */ }
  return c.json({ success: true, data: parsed ?? { raw: text } });
});

cr.get('/audit/exports/:id/csv', async (c) => {
  const user = getCurrentUser(c);
  if (!carbonAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT csv_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'carbon'`,
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

// POST /carbon-registry/audit/recon — registry reconciliation. Body:
//   { source: 'verra'|'gold_standard'|'cdm'|'sa_redd', csv: 'header,row1\n…' }
// CSV columns: serial_id, retirement_ref, quantity_tco2e, retired_at
// Matches against credit_serials where status='retired'. Breaks:
//   • missing_in_ours      — registry shows a retirement we don't have
//   • missing_in_theirs    — we recorded a retirement the registry hasn't reflected
//   • field_mismatch       — quantity differs by >0.0001 tCO2e
cr.post('/audit/recon', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator' && user.role !== 'carbon_fund') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { source?: string; csv?: string };
  const source = (body.source || 'verra').toLowerCase();
  if (typeof body.csv !== 'string' || body.csv.length < 10) {
    return c.json({ success: false, error: 'csv body required' }, 400);
  }
  const lines = body.csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return c.json({ success: false, error: 'csv must have header + ≥1 row' }, 400);
  const headers = lines[0].split(',').map((h) => h.trim());
  const need = ['serial_id','retirement_ref','quantity_tco2e','retired_at'];
  for (const k of need) {
    if (!headers.includes(k)) return c.json({ success: false, error: `csv missing column: ${k}` }, 400);
  }
  const idxOf = (k: string) => headers.indexOf(k);
  type TheirRow = { serial_id: string; retirement_ref: string; quantity_tco2e: number; retired_at: string };
  const theirs: TheirRow[] = [];
  for (const ln of lines.slice(1)) {
    const cols = ln.split(',');
    theirs.push({
      serial_id: (cols[idxOf('serial_id')] || '').trim(),
      retirement_ref: (cols[idxOf('retirement_ref')] || '').trim(),
      quantity_tco2e: Number(cols[idxOf('quantity_tco2e')] || 0),
      retired_at: (cols[idxOf('retired_at')] || '').trim(),
    });
  }

  const runId = 'recon_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-recon/carbon/${runId}/registry.csv`;
  await c.env.R2.put(csvKey, new TextEncoder().encode(body.csv), {
    httpMetadata: { contentType: 'text/csv' },
  }).catch(() => null);

  const ours = await c.env.DB.prepare(
    `SELECT id AS serial_id, retirement_ref, quantity AS quantity_tco2e, retired_at
       FROM credit_serials WHERE status = 'retired'`,
  ).all<{ serial_id: string; retirement_ref: string | null; quantity_tco2e: number; retired_at: string }>();
  type OurRow = (typeof ours)['results'][number];
  const ourBySerial = new Map<string, OurRow>();
  for (const r of (ours.results || []) as OurRow[]) ourBySerial.set(r.serial_id, r);

  const matched = new Set<string>();
  type Break = { type: string; serial_id: string | null; our: unknown; their: unknown; field: string | null };
  const breaks: Break[] = [];
  for (const t of theirs) {
    if (!t.serial_id) {
      breaks.push({ type: 'missing_in_ours', serial_id: null, our: null, their: t, field: null });
      continue;
    }
    const o = ourBySerial.get(t.serial_id);
    if (!o) {
      breaks.push({ type: 'missing_in_ours', serial_id: t.serial_id, our: null, their: t, field: null });
      continue;
    }
    matched.add(t.serial_id);
    if (Math.abs(Number(o.quantity_tco2e) - Number(t.quantity_tco2e)) > 1e-4) {
      breaks.push({ type: 'field_mismatch', serial_id: t.serial_id, our: o, their: t, field: 'quantity_tco2e' });
    }
  }
  for (const [sid, o] of ourBySerial.entries()) {
    if (!matched.has(sid) && !theirs.some((t) => t.serial_id === sid)) {
      breaks.push({ type: 'missing_in_theirs', serial_id: sid, our: o, their: null, field: null });
    }
  }

  const matchedCount = theirs.length - breaks.filter((b) => b.type !== 'field_mismatch').length;
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO audit_recon_runs
       (id, entity_type, source, uploaded_csv_r2_key, row_count,
        matched_count, break_count, status, started_at, finished_at, started_by)
     VALUES (?, 'carbon', ?, ?, ?, ?, ?, 'complete', ?, ?, ?)`,
  ).bind(runId, source, csvKey, theirs.length, matchedCount,
         breaks.length, now, now, user.id).run();

  if (breaks.length > 0) {
    const inserts = breaks.map((b) => c.env.DB.prepare(
      `INSERT INTO audit_recon_breaks
         (id, run_id, break_type, external_ref, our_value, their_value, field, resolution)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
    ).bind(
      'brk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      runId, b.type, b.serial_id,
      b.our != null ? JSON.stringify(b.our) : null,
      b.their != null ? JSON.stringify(b.their) : null,
      b.field,
    ));
    await c.env.DB.batch(inserts);
  }

  await appendAudit({
    env: c.env, entity_type: 'carbon', entity_id: runId,
    event_type: 'audit.recon_run', actor_id: user.id,
    payload: { run_id: runId, source, row_count: theirs.length, break_count: breaks.length },
  }).catch(() => {});

  await fireCascade({
    event: 'carbon.recon_completed',
    actor_id: user.id,
    entity_type: 'audit_recon_runs',
    entity_id: runId,
    data: {
      run_id: runId,
      entity: 'carbon',
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

cr.get('/audit/recon', async (c) => {
  const user = getCurrentUser(c);
  // Recon reads match recon-write (admin/regulator/carbon_fund) + support.
  if (!['admin', 'regulator', 'support', 'carbon_fund'].includes(user.role)) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT id, source, row_count, matched_count, break_count, status,
            started_at, finished_at
       FROM audit_recon_runs WHERE entity_type = 'carbon'
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

export default cr;
