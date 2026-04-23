// ═══════════════════════════════════════════════════════════════════════════
// IPP developer lifecycle routes — EPC contracts, variations, LDs;
// environmental authorisations + conditions; land & servitude register;
// insurance policies & claims; community engagements + ED/SED spend.
// Mounted at /api/ipp.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const ipp = new Hono<HonoEnv>();
ipp.use('*', authMiddleware);

function canWrite(role: string): boolean {
  return role === 'ipp_developer' || role === 'admin';
}
function genId(p: string) { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

// ─── EPC contracts ─────────────────────────────────────────────────────────
ipp.post('/epc', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['project_id', 'contractor_name']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('epc');
  const createdAt = new Date().toISOString();
  const status = (b.status as string) || 'draft';
  await c.env.DB.prepare(
    `INSERT INTO epc_contracts
       (id, project_id, contract_document_id, epc_contractor_participant_id, contractor_name,
        lump_sum_zar, target_completion_date, commissioning_date, taking_over_certificate_date,
        defects_liability_until, performance_security_zar, ld_cap_percentage, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, b.project_id, b.contract_document_id || null,
    b.epc_contractor_participant_id || null, b.contractor_name,
    b.lump_sum_zar == null ? null : Number(b.lump_sum_zar),
    b.target_completion_date || null, b.commissioning_date || null,
    b.taking_over_certificate_date || null, b.defects_liability_until || null,
    b.performance_security_zar == null ? null : Number(b.performance_security_zar),
    b.ld_cap_percentage == null ? null : Number(b.ld_cap_percentage),
    status, createdAt,
  ).run();
  const row = {
    id,
    project_id: b.project_id,
    contract_document_id: b.contract_document_id || null,
    epc_contractor_participant_id: b.epc_contractor_participant_id || null,
    contractor_name: b.contractor_name,
    lump_sum_zar: b.lump_sum_zar == null ? null : Number(b.lump_sum_zar),
    target_completion_date: b.target_completion_date || null,
    commissioning_date: b.commissioning_date || null,
    taking_over_certificate_date: b.taking_over_certificate_date || null,
    defects_liability_until: b.defects_liability_until || null,
    performance_security_zar: b.performance_security_zar == null ? null : Number(b.performance_security_zar),
    ld_cap_percentage: b.ld_cap_percentage == null ? null : Number(b.ld_cap_percentage),
    status,
    created_at: createdAt,
  };
  return c.json({ success: true, data: row }, 201);
});

ipp.post('/epc/:id/variations', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const epcId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['variation_number', 'description', 'value_zar']) {
    if (b[k] == null) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('epv');
  await c.env.DB.prepare(
    `INSERT INTO epc_variations
       (id, epc_contract_id, variation_number, description, value_zar, time_impact_days, status)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, 0), 'proposed')`,
  ).bind(
    id, epcId, b.variation_number, b.description,
    Number(b.value_zar),
    b.time_impact_days == null ? null : Number(b.time_impact_days),
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM epc_variations WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

ipp.post('/epc/:id/lds', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const epcId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.event_type || !b.event_date || b.calculated_amount_zar == null) {
    return c.json({ success: false, error: 'event_type, event_date, calculated_amount_zar required' }, 400);
  }

  // Cap enforcement — compute total LDs already assessed on this contract.
  const cap = await c.env.DB.prepare(
    `SELECT ec.ld_cap_percentage, ec.lump_sum_zar,
            COALESCE(SUM(ld.capped_amount_zar), 0) AS to_date
       FROM epc_contracts ec
       LEFT JOIN epc_liquidated_damages ld ON ld.epc_contract_id = ec.id
      WHERE ec.id = ?
      GROUP BY ec.id`,
  ).bind(epcId).first<{ ld_cap_percentage: number | null; lump_sum_zar: number | null; to_date: number }>();

  const calculated = Number(b.calculated_amount_zar);
  let capped = calculated;
  if (cap?.ld_cap_percentage && cap.lump_sum_zar) {
    const maxTotal = (cap.ld_cap_percentage / 100) * cap.lump_sum_zar;
    const headroom = Math.max(0, maxTotal - cap.to_date);
    capped = Math.min(calculated, headroom);
  }

  const id = genId('ld');
  await c.env.DB.prepare(
    `INSERT INTO epc_liquidated_damages
       (id, epc_contract_id, event_type, event_date, description,
        calculated_amount_zar, capped_amount_zar, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'assessed')`,
  ).bind(id, epcId, b.event_type, b.event_date, b.description || null, calculated, capped).run();
  const row = await c.env.DB.prepare('SELECT * FROM epc_liquidated_damages WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

ipp.get('/epc/:id', async (c) => {
  const id = c.req.param('id');
  const epc = await c.env.DB.prepare('SELECT * FROM epc_contracts WHERE id = ?').bind(id).first();
  if (!epc) return c.json({ success: false, error: 'EPC contract not found' }, 404);
  const vars = await c.env.DB.prepare(
    'SELECT * FROM epc_variations WHERE epc_contract_id = ? ORDER BY raised_at DESC',
  ).bind(id).all();
  const lds = await c.env.DB.prepare(
    'SELECT * FROM epc_liquidated_damages WHERE epc_contract_id = ? ORDER BY event_date DESC',
  ).bind(id).all();
  return c.json({
    success: true,
    data: { ...epc, variations: vars.results || [], liquidated_damages: lds.results || [] },
  });
});

// ─── Environmental authorisations ──────────────────────────────────────────
ipp.post('/environmental/authorisations', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['project_id', 'authorisation_type']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('envauth');
  await c.env.DB.prepare(
    `INSERT INTO environmental_authorisations
       (id, project_id, authorisation_type, reference_number, competent_authority,
        applied_date, decision_date, decision, conditions_text, expiry_date, document_r2_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, b.project_id, b.authorisation_type, b.reference_number || null,
    b.competent_authority || null, b.applied_date || null, b.decision_date || null,
    b.decision || null, b.conditions_text || null, b.expiry_date || null,
    b.document_r2_key || null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM environmental_authorisations WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

ipp.post('/environmental/authorisations/:id/conditions', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const authId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.condition_reference || !b.condition_text) {
    return c.json({ success: false, error: 'condition_reference and condition_text required' }, 400);
  }
  const id = genId('envc');
  await c.env.DB.prepare(
    `INSERT INTO environmental_compliance
       (id, authorisation_id, condition_reference, condition_text, due_date,
        compliance_status, evidence_r2_key)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, 'pending'), ?)`,
  ).bind(
    id, authId, b.condition_reference, b.condition_text, b.due_date || null,
    b.compliance_status || null, b.evidence_r2_key || null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM environmental_compliance WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

ipp.get('/environmental/authorisations/:project_id', async (c) => {
  const projectId = c.req.param('project_id');
  const auths = await c.env.DB.prepare(
    `SELECT * FROM environmental_authorisations WHERE project_id = ? ORDER BY applied_date DESC`,
  ).bind(projectId).all();
  const ids = (auths.results || []).map((a: Record<string, unknown>) => a.id as string);
  if (ids.length === 0) return c.json({ success: true, data: auths.results || [] });
  const placeholders = ids.map(() => '?').join(',');
  const conds = await c.env.DB.prepare(
    `SELECT * FROM environmental_compliance WHERE authorisation_id IN (${placeholders})`,
  ).bind(...ids).all();
  const byAuth = new Map<string, unknown[]>();
  for (const row of conds.results || []) {
    const r = row as Record<string, unknown>;
    const aid = r.authorisation_id as string;
    if (!byAuth.has(aid)) byAuth.set(aid, []);
    byAuth.get(aid)!.push(r);
  }
  const enriched = (auths.results || []).map((a: Record<string, unknown>) => ({
    ...a,
    conditions: byAuth.get(a.id as string) || [],
  }));
  return c.json({ success: true, data: enriched });
});

// ─── Land & servitudes ─────────────────────────────────────────────────────
ipp.post('/land/parcels', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.project_id) return c.json({ success: false, error: 'project_id is required' }, 400);
  const id = genId('lp');
  await c.env.DB.prepare(
    `INSERT INTO land_parcels
       (id, project_id, parcel_number, sg_diagram, lpi, ownership_type, area_hectares,
        registered_owner, title_deed_number, deed_registration_date, lease_start_date,
        lease_end_date, monthly_rent_zar, splumap_rezoning_status, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'identified'))`,
  ).bind(
    id, b.project_id, b.parcel_number || null, b.sg_diagram || null, b.lpi || null,
    b.ownership_type || null,
    b.area_hectares == null ? null : Number(b.area_hectares),
    b.registered_owner || null, b.title_deed_number || null, b.deed_registration_date || null,
    b.lease_start_date || null, b.lease_end_date || null,
    b.monthly_rent_zar == null ? null : Number(b.monthly_rent_zar),
    b.splumap_rezoning_status || null, b.status || null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM land_parcels WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

ipp.get('/land/parcels/:project_id', async (c) => {
  const pid = c.req.param('project_id');
  const rs = await c.env.DB.prepare(
    `SELECT * FROM land_parcels WHERE project_id = ? ORDER BY parcel_number`,
  ).bind(pid).all();
  return c.json({ success: true, data: rs.results || [] });
});

ipp.post('/land/servitudes', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.project_id || !b.servitude_type) {
    return c.json({ success: false, error: 'project_id and servitude_type are required' }, 400);
  }
  const id = genId('sv');
  await c.env.DB.prepare(
    `INSERT INTO servitudes
       (id, project_id, servitude_type, parcel_number, grantor, consideration_zar,
        registered_at_deeds, registration_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, b.project_id, b.servitude_type, b.parcel_number || null, b.grantor || null,
    b.consideration_zar == null ? null : Number(b.consideration_zar),
    b.registered_at_deeds ? 1 : 0, b.registration_date || null, b.notes || null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM servitudes WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

// ─── Insurance ─────────────────────────────────────────────────────────────
ipp.post('/insurance/policies', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['project_id', 'policy_number', 'policy_type', 'insurer', 'period_start', 'period_end']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('ins');
  await c.env.DB.prepare(
    `INSERT INTO insurance_policies
       (id, project_id, policy_number, policy_type, insurer, broker,
        period_start, period_end, sum_insured_zar, premium_zar, deductible_zar,
        lenders_noted, document_r2_key, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
  ).bind(
    id, b.project_id, b.policy_number, b.policy_type, b.insurer, b.broker || null,
    b.period_start, b.period_end,
    b.sum_insured_zar == null ? null : Number(b.sum_insured_zar),
    b.premium_zar == null ? null : Number(b.premium_zar),
    b.deductible_zar == null ? null : Number(b.deductible_zar),
    b.lenders_noted ? 1 : 0, b.document_r2_key || null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM insurance_policies WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

ipp.post('/insurance/policies/:id/claim', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const policyId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.claim_number) return c.json({ success: false, error: 'claim_number required' }, 400);
  const id = genId('clm');
  await c.env.DB.prepare(
    `INSERT INTO insurance_claims
       (id, policy_id, claim_number, loss_event_date, notified_at, quantum_zar, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, policyId, b.claim_number, b.loss_event_date || null, b.notified_at || null,
    b.quantum_zar == null ? null : Number(b.quantum_zar), b.description || null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM insurance_claims WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

ipp.get('/insurance/expiring', async (c) => {
  const days = Number(c.req.query('within_days') || 90);
  const rs = await c.env.DB.prepare(
    `SELECT * FROM insurance_policies
      WHERE status = 'active' AND period_end <= date('now', ?)
      ORDER BY period_end ASC LIMIT 200`,
  ).bind(`+${days} days`).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ─── Community engagement ──────────────────────────────────────────────────
ipp.post('/community/stakeholders', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.project_id || !b.stakeholder_name) {
    return c.json({ success: false, error: 'project_id and stakeholder_name are required' }, 400);
  }
  const id = genId('cs');
  await c.env.DB.prepare(
    `INSERT INTO community_stakeholders
       (id, project_id, stakeholder_name, stakeholder_type, contact_person, phone, email, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, b.project_id, b.stakeholder_name, b.stakeholder_type || null,
    b.contact_person || null, b.phone || null, b.email || null, b.notes || null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM community_stakeholders WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

ipp.post('/community/engagements', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.project_id || !b.engagement_type || !b.engagement_date) {
    return c.json({ success: false, error: 'project_id, engagement_type, engagement_date required' }, 400);
  }
  const id = genId('ce');
  await c.env.DB.prepare(
    `INSERT INTO community_engagements
       (id, project_id, stakeholder_id, engagement_type, engagement_date, attendees_count,
        topic, outcome, commitments, follow_up_date, evidence_r2_key, logged_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, b.project_id, b.stakeholder_id || null, b.engagement_type, b.engagement_date,
    b.attendees_count == null ? null : Number(b.attendees_count),
    b.topic || null, b.outcome || null, b.commitments || null,
    b.follow_up_date || null, b.evidence_r2_key || null, user.id,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM community_engagements WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

// ED / SED spend register & summary
ipp.post('/community/ed-sed', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['project_id', 'category', 'period', 'amount_zar']) {
    if (!b[k] && b[k] !== 0) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('ed');
  await c.env.DB.prepare(
    `INSERT INTO ed_sed_spend
       (id, project_id, category, period, amount_zar, beneficiary, description, reipppp_bid_window, evidence_r2_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, b.project_id, b.category, b.period, Number(b.amount_zar),
    b.beneficiary || null, b.description || null,
    b.reipppp_bid_window || null, b.evidence_r2_key || null,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

ipp.get('/community/ed-sed/:project_id/summary', async (c) => {
  const pid = c.req.param('project_id');
  const rs = await c.env.DB.prepare(
    `SELECT category, COUNT(*) AS n, SUM(amount_zar) AS total_zar
       FROM ed_sed_spend WHERE project_id = ?
      GROUP BY category ORDER BY total_zar DESC`,
  ).bind(pid).all();
  return c.json({ success: true, data: rs.results || [] });
});

export default ipp;
