// ═══════════════════════════════════════════════════════════════════════════
// IPP developer lifecycle routes — EPC contracts, variations, LDs;
// environmental authorisations + conditions; land & servitude register;
// insurance policies & claims; community engagements + ED/SED spend.
// Mounted at /api/ipp.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { appendAudit, getChainHead, verifyChain } from '../utils/audit-chain';
import { fireCascade } from '../utils/cascade';

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

  await appendAudit({
    env: c.env, entity_type: 'ipp', entity_id: id,
    event_type: 'epc.created', actor_id: user.id,
    payload: {
      epc_id: id, project_id: String(b.project_id),
      contractor_name: String(b.contractor_name),
      lump_sum_zar: row.lump_sum_zar, status,
    },
  }).catch((e) => console.warn('audit_epc_created_failed', (e as Error).message));

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

  await appendAudit({
    env: c.env, entity_type: 'ipp', entity_id: id,
    event_type: 'epc.variation_added', actor_id: user.id,
    payload: {
      variation_id: id, epc_id: epcId,
      variation_number: b.variation_number, value_zar: Number(b.value_zar),
      time_impact_days: b.time_impact_days == null ? null : Number(b.time_impact_days),
    },
  }).catch((e) => console.warn('audit_variation_failed', (e as Error).message));

  await fireCascade({
    event: 'ipp.epc_variation_raised',
    actor_id: user.id,
    entity_type: 'epc_variations',
    entity_id: id,
    data: {
      variation_id: id, epc_id: epcId,
      variation_number: b.variation_number, value_zar: Number(b.value_zar),
      time_impact_days: b.time_impact_days == null ? null : Number(b.time_impact_days),
    },
    env: c.env,
    skipAudit: true,
  });

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

  await appendAudit({
    env: c.env, entity_type: 'ipp', entity_id: id,
    event_type: 'epc.ld_assessed', actor_id: user.id,
    payload: {
      ld_id: id, epc_id: epcId, event_type: b.event_type, event_date: b.event_date,
      calculated_amount_zar: calculated, capped_amount_zar: capped,
    },
  }).catch((e) => console.warn('audit_ld_assessed_failed', (e as Error).message));

  await fireCascade({
    event: 'ipp.ld_assessed',
    actor_id: user.id,
    entity_type: 'epc_liquidated_damages',
    entity_id: id,
    data: {
      ld_id: id, epc_contract_id: epcId,
      event_type: b.event_type, event_date: b.event_date,
      calculated_amount_zar: calculated, capped_amount_zar: capped,
    },
    env: c.env,
    skipAudit: true,
  });

  return c.json({ success: true, data: row }, 201);
});

ipp.get('/epc/list/:project_id', async (c) => {
  const projectId = c.req.param('project_id');
  const rows = await c.env.DB.prepare(
    `SELECT id, project_id, contractor_name, contract_value_zar, contract_date, commercial_operation_date, status
       FROM epc_contracts WHERE project_id = ? ORDER BY contract_date DESC`,
  ).bind(projectId).all();
  return c.json({ success: true, data: rows.results || [] });
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
  await fireCascade({
    event: 'ipp.ea_granted',
    actor_id: user.id,
    entity_type: 'environmental_authorisations',
    entity_id: id,
    data: {
      id, project_id: b.project_id as string,
      authorisation_type: b.authorisation_type as string,
      competent_authority: (b.competent_authority as string) || null,
      decision: (b.decision as string) || null,
      expiry_date: (b.expiry_date as string) || null,
    },
    env: c.env,
  });
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

  await appendAudit({
    env: c.env, entity_type: 'ipp', entity_id: id,
    event_type: 'insurance.claim_filed', actor_id: user.id,
    payload: {
      claim_id: id, policy_id: policyId, claim_number: b.claim_number,
      loss_event_date: b.loss_event_date || null,
      quantum_zar: b.quantum_zar == null ? null : Number(b.quantum_zar),
    },
  }).catch((e) => console.warn('audit_claim_filed_failed', (e as Error).message));

  await fireCascade({
    event: 'ipp.insurance_claim_filed',
    actor_id: user.id,
    entity_type: 'insurance_claims',
    entity_id: id,
    data: {
      claim_id: id, policy_id: policyId,
      claim_number: b.claim_number as string,
      loss_event_date: (b.loss_event_date as string) || null,
      quantum_zar: b.quantum_zar == null ? null : Number(b.quantum_zar),
    },
    env: c.env,
    skipAudit: true,
  });

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
  // POPIA + REIPPPP audit: a grievance is a regulator-grade event; the
  // generic engagement log is not. Only fire the cascade for grievances so
  // the notification fan-out doesn't drown out the developer with low-stakes
  // meeting minutes.
  if (String(b.engagement_type).toLowerCase() === 'grievance') {
    await fireCascade({
      event: 'ipp.community_grievance_logged',
      actor_id: user.id,
      entity_type: 'community_engagements',
      entity_id: id,
      data: {
        id, project_id: b.project_id as string,
        engagement_date: b.engagement_date as string,
        stakeholder_id: (b.stakeholder_id as string) || null,
        topic: (b.topic as string) || null,
        commitments: (b.commitments as string) || null,
        follow_up_date: (b.follow_up_date as string) || null,
      },
      env: c.env,
    });
  }
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

// ════════════════════════════════════════════════════════════════════════
// L5 — Tamper-evident audit, NERSA generation-licence report, milestone recon.
// ════════════════════════════════════════════════════════════════════════

// Full-chain IPP audit + export packs are officer-only (admin/support/
// regulator), matching the officer-gated POST /audit/export and the actor_id
// scoping in GET /audit/events.
const ippAuditOfficer = (role: string): boolean =>
  role === 'admin' || role === 'support' || role === 'regulator';

ipp.get('/audit/head', async (c) => {
  const user = getCurrentUser(c);
  if (!ippAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const head = await getChainHead(c.env, 'ipp');
  return c.json({ success: true, data: head });
});

ipp.get('/audit/events', async (c) => {
  const user = getCurrentUser(c);
  const limit = Math.min(200, Number(c.req.query('limit') || 50));
  const where: string[] = [`entity_type = 'ipp'`];
  const binds: unknown[] = [];
  const isOfficer = user.role === 'admin' || user.role === 'regulator' || user.role === 'support';
  if (!isOfficer) { where.push('actor_id = ?'); binds.push(user.id); }
  const rs = await c.env.DB.prepare(
    `SELECT id, entity_id, event_type, actor_id, sequence_no, content_hash, prev_hash, created_at, payload_json
       FROM audit_events WHERE ${where.join(' AND ')}
      ORDER BY sequence_no DESC LIMIT ?`,
  ).bind(...binds, limit).all();
  return c.json({ success: true, data: rs.results || [] });
});

ipp.post('/audit/verify', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const fromSeq = Number(c.req.query('from_seq') || 1) || 1;
  const result = await verifyChain(c.env, 'ipp', fromSeq);
  return c.json({ success: result.ok, data: result });
});

// POST /ipp/audit/export — NERSA generation-licence quarterly compliance
// register. One row per project with EPC + environmental + insurance state.
// Required for licensed generators (ERA 2006 s.10(2)(g) / NERSA Generation
// Licence Standard Conditions Sec 9).
ipp.post('/audit/export', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator' && user.role !== 'ipp_developer') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { from?: string; to?: string };
  const from = body.from || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = body.to || new Date().toISOString().slice(0, 10);

  // Projects + EPC state + active insurance count + open environmental
  // conditions. We join carefully so projects without EPCs / insurance
  // still appear (LEFT JOIN).
  const rows = await c.env.DB.prepare(
    `SELECT p.id AS project_id, p.name, p.technology, p.capacity_mw,
            p.cod_target_date, p.lifecycle_stage,
            (SELECT MIN(ec.status) FROM epc_contracts ec WHERE ec.project_id = p.id) AS epc_status,
            (SELECT COUNT(*) FROM insurance_policies ip WHERE ip.project_id = p.id AND ip.status = 'active') AS active_policies,
            (SELECT COUNT(*) FROM environmental_compliance evc
              INNER JOIN environmental_authorisations ea ON ea.id = evc.authorisation_id
             WHERE ea.project_id = p.id AND evc.status != 'closed') AS open_env_conditions,
            (SELECT COUNT(*) FROM project_milestones pm WHERE pm.project_id = p.id AND pm.status = 'satisfied') AS milestones_satisfied,
            (SELECT COUNT(*) FROM project_milestones pm WHERE pm.project_id = p.id) AS milestones_total
       FROM projects p
      WHERE p.created_at <= ?
      ORDER BY p.created_at ASC`,
  ).bind(`${to}T23:59:59`).all<any>().catch(() => ({ results: [] } as any));
  const data = rows.results || [];

  const header = ['project_id','project_name','technology','capacity_mw','cod_target',
                  'lifecycle_stage','epc_status','active_insurance_policies',
                  'open_environmental_conditions','milestones_satisfied','milestones_total'].join(',');
  const csvLines = [header];
  for (const r of data as Array<Record<string, any>>) {
    csvLines.push([
      r.project_id, csvEscape(r.name || ''), r.technology || '',
      r.capacity_mw ?? '', r.cod_target_date || '',
      r.lifecycle_stage || '', r.epc_status || '',
      r.active_policies ?? 0, r.open_env_conditions ?? 0,
      r.milestones_satisfied ?? 0, r.milestones_total ?? 0,
    ].join(','));
  }
  const csv = csvLines.join('\n') + '\n';
  const csvBytes = new TextEncoder().encode(csv);
  const csvSha = await sha256OfBytes(csvBytes);

  const head = await getChainHead(c.env, 'ipp');
  const exportId = 'exp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-exports/ipp/${exportId}/generation-licence-register.csv`;
  const manifestKey = `audit-exports/ipp/${exportId}/manifest.json`;
  const manifest = {
    export_id: exportId, entity_type: 'ipp', from, to,
    generated_at: new Date().toISOString(), generated_by: user.id, row_count: data.length,
    csv: { r2_key: csvKey, sha256: csvSha, bytes: csvBytes.byteLength },
    chain: {
      head_hash: head?.head_hash || null,
      head_sequence: head?.head_sequence || 0,
      last_verified_at: head?.last_verified_at || null,
    },
    format: { profile: 'NERSA Generation Licence Standard Conditions Sec 9 v1', encoding: 'utf-8' },
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
     VALUES (?, 'ipp', ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(exportId, from, to, data.length, csvKey, manifestKey,
         head?.head_hash || '', user.id).run();

  await appendAudit({
    env: c.env, entity_type: 'ipp', entity_id: exportId,
    event_type: 'audit.export_generated', actor_id: user.id,
    payload: { export_id: exportId, from, to, row_count: data.length, csv_sha256: csvSha },
  }).catch(() => {});

  return c.json({
    success: true,
    data: { export_id: exportId, row_count: data.length, csv_r2_key: csvKey, manifest_r2_key: manifestKey, manifest },
  }, 201);
});

ipp.get('/audit/exports', async (c) => {
  const user = getCurrentUser(c);
  if (!ippAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const rs = await c.env.DB.prepare(
    `SELECT id, from_ts, to_ts, row_count, csv_r2_key, manifest_r2_key,
            chain_head_hash, generated_by, generated_at
       FROM audit_exports WHERE entity_type = 'ipp'
      ORDER BY generated_at DESC LIMIT 50`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

ipp.get('/audit/exports/:id/manifest', async (c) => {
  const user = getCurrentUser(c);
  if (!ippAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT manifest_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'ipp'`,
  ).bind(id).first<{ manifest_r2_key: string }>();
  if (!row) return c.json({ success: false, error: 'Export not found' }, 404);
  const obj = await c.env.R2.get(row.manifest_r2_key);
  if (!obj) return c.json({ success: false, error: 'Manifest object missing in R2' }, 404);
  const text = await obj.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* */ }
  return c.json({ success: true, data: parsed ?? { raw: text } });
});

ipp.get('/audit/exports/:id/csv', async (c) => {
  const user = getCurrentUser(c);
  if (!ippAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT csv_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'ipp'`,
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

// POST /ipp/audit/recon — milestone reconciliation against lender / investor
// statement of completion. CSV columns:
//   project_id, milestone_name, satisfied_at, evidence_ref
// Matches against project_milestones (status='satisfied').
ipp.post('/audit/recon', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'lender' && user.role !== 'ipp_developer') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { source?: string; csv?: string };
  const source = (body.source || 'lender_ie').toLowerCase();
  if (typeof body.csv !== 'string' || body.csv.length < 10) {
    return c.json({ success: false, error: 'csv body required' }, 400);
  }
  const lines = body.csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return c.json({ success: false, error: 'csv must have header + ≥1 row' }, 400);
  const headers = lines[0].split(',').map((h) => h.trim());
  const need = ['project_id','milestone_name','satisfied_at','evidence_ref'];
  for (const k of need) {
    if (!headers.includes(k)) return c.json({ success: false, error: `csv missing column: ${k}` }, 400);
  }
  const idxOf = (k: string) => headers.indexOf(k);
  type TheirRow = { project_id: string; milestone_name: string; satisfied_at: string; evidence_ref: string };
  const theirs: TheirRow[] = [];
  for (const ln of lines.slice(1)) {
    const cols = ln.split(',');
    theirs.push({
      project_id: (cols[idxOf('project_id')] || '').trim(),
      milestone_name: (cols[idxOf('milestone_name')] || '').trim(),
      satisfied_at: (cols[idxOf('satisfied_at')] || '').trim(),
      evidence_ref: (cols[idxOf('evidence_ref')] || '').trim(),
    });
  }

  const runId = 'recon_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-recon/ipp/${runId}/lender.csv`;
  await c.env.R2.put(csvKey, new TextEncoder().encode(body.csv), {
    httpMetadata: { contentType: 'text/csv' },
  }).catch(() => null);

  const ours = await c.env.DB.prepare(
    `SELECT project_id, name AS milestone_name, satisfied_at
       FROM project_milestones WHERE status = 'satisfied'`,
  ).all<{ project_id: string; milestone_name: string; satisfied_at: string }>().catch(() => ({ results: [] } as any));
  const ourKey = (r: { project_id: string; milestone_name: string }) =>
    `${r.project_id}|${r.milestone_name.trim().toLowerCase()}`;
  const ourByKey = new Map<string, any>();
  for (const r of (ours.results || []) as any[]) ourByKey.set(ourKey(r), r);

  const matched = new Set<string>();
  type Break = { type: string; project_id: string | null; our: unknown; their: unknown; field: string | null };
  const breaks: Break[] = [];
  for (const t of theirs) {
    const k = `${t.project_id}|${t.milestone_name.trim().toLowerCase()}`;
    const o = ourByKey.get(k);
    if (!o) {
      breaks.push({ type: 'missing_in_ours', project_id: t.project_id, our: null, their: t, field: null });
      continue;
    }
    matched.add(k);
  }
  for (const [k, o] of ourByKey.entries()) {
    if (!matched.has(k)) {
      breaks.push({ type: 'missing_in_theirs', project_id: o.project_id, our: o, their: null, field: null });
    }
  }

  const matchedCount = theirs.length - breaks.filter((b) => b.type === 'missing_in_ours').length;
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO audit_recon_runs
       (id, entity_type, source, uploaded_csv_r2_key, row_count,
        matched_count, break_count, status, started_at, finished_at, started_by)
     VALUES (?, 'ipp', ?, ?, ?, ?, ?, 'complete', ?, ?, ?)`,
  ).bind(runId, source, csvKey, theirs.length, matchedCount,
         breaks.length, now, now, user.id).run();

  if (breaks.length > 0) {
    const inserts = breaks.map((b) => c.env.DB.prepare(
      `INSERT INTO audit_recon_breaks
         (id, run_id, break_type, external_ref, our_value, their_value, field, resolution)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
    ).bind(
      'brk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      runId, b.type, b.project_id,
      b.our != null ? JSON.stringify(b.our) : null,
      b.their != null ? JSON.stringify(b.their) : null,
      b.field,
    ));
    await c.env.DB.batch(inserts);
  }

  await appendAudit({
    env: c.env, entity_type: 'ipp', entity_id: runId,
    event_type: 'audit.recon_run', actor_id: user.id,
    payload: { run_id: runId, source, row_count: theirs.length, break_count: breaks.length },
  }).catch(() => {});

  return c.json({
    success: true,
    data: { run_id: runId, source, row_count: theirs.length, matched_count: matchedCount, break_count: breaks.length },
  }, 201);
});

ipp.get('/audit/recon', async (c) => {
  const user = getCurrentUser(c);
  // Recon reads match recon-write (admin/lender/ipp_developer) + support.
  if (!['admin', 'support', 'lender', 'ipp_developer'].includes(user.role)) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT id, source, row_count, matched_count, break_count, status,
            started_at, finished_at
       FROM audit_recon_runs WHERE entity_type = 'ipp'
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

export default ipp;
