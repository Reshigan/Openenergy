// Wave 141 — IPP Progress Claims & Payment Certificates
// JBCC + NEC4 + REIPPPP payment milestones + Equator Principles EP4 disbursement certification.
// INVERTED SLA: major 720h (most time) → minor 72h (least time).
// SIGNATURE: certify_by_engineer EVERY tier on floor_ie_milestone_payment;
//            record_final_account EVERY tier;
//            approve_payment when floor_lender_certification_required.

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import { badDate, badEnum } from '../utils/validation';
import {
  nextStatus,
  isHardTerminal,
  SLA_HOURS,
  slaDeadlineFor,
  slaHoursRemaining,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  eventTypeFor,
  statusTsCol,
  type ClaimStatus,
  type ClaimAction,
  type ClaimTier,
} from '../utils/ipp-progress-claim-spec';

const READ_ROLES = new Set([
  'admin', 'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);
const WRITE_ROLES = new Set(['admin', 'ipp_developer']);

interface ClaimRow {
  id: string;
  project_id: string;
  project_name: string | null;
  claim_number: string | null;
  chain_status: ClaimStatus;
  claim_type: string | null;
  claim_tier: ClaimTier | null;
  contractor_name: string | null;
  subcontractor_ref: string | null;
  claim_period_from: string | null;
  claim_period_to: string | null;
  contractor_invoice_ref: string | null;
  claim_amount_zar: number;
  qs_assessed_zar: number | null;
  certified_amount_zar: number | null;
  approved_amount_zar: number | null;
  retention_amount_zar: number | null;
  vat_amount_zar: number | null;
  net_payable_zar: number | null;
  previous_certified_total_zar: number | null;
  this_period_zar: number | null;
  contract_completion_pct: number | null;
  qs_notes: string | null;
  pm_notes: string | null;
  engineer_certification_notes: string | null;
  dispute_reason: string | null;
  rejection_reason: string | null;
  suspension_reason: string | null;
  floor_ie_milestone_payment: number;
  floor_lender_certification_required: number;
  floor_retention_release: number;
  floor_variation_included: number;
  floor_defects_outstanding: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  regulator_ref: string | null;
  change_order_ref: string | null;
  milestone_ref: string | null;
  drawdown_ref: string | null;
  submitted_at: string | null;
  quantity_survey_review_at: string | null;
  pm_review_at: string | null;
  engineer_certified_at: string | null;
  approved_at: string | null;
  payment_processed_at: string | null;
  closed_at: string | null;
  disputed_at: string | null;
  suspended_at: string | null;
  rejected_at: string | null;
  partial_payment_at: string | null;
  final_account_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const OPEN_STATUSES = new Set<ClaimStatus>([
  'submitted', 'quantity_survey_review', 'pm_review', 'engineer_certified',
  'approved', 'disputed', 'suspended', 'partial_payment',
]);

function decorateLiveFields(row: ClaimRow, now: Date) {
  const stateAt = (row as any)[statusTsCol(row.chain_status)] as string | null;
  const timeInState = stateAt
    ? Math.round((now.getTime() - new Date(stateAt).getTime()) / 3600000)
    : null;
  const isOpen = OPEN_STATUSES.has(row.chain_status);
  const isSignature = !!(
    (row.chain_status === 'engineer_certified' && row.floor_ie_milestone_payment) ||
    row.chain_status === 'final_account'
  );

  return {
    ...row,
    time_in_state_hours_live: timeInState,
    sla_remaining_hours_live: slaHoursRemaining(row.sla_deadline_at, now),
    is_open_live: isOpen,
    is_signature_live: isSignature,
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

// ─── GET /api/ipp-progress-claim ──────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const rows = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_progress_claims ORDER BY created_at DESC',
  ).all<ClaimRow>();

  const now = new Date();
  const data = (rows.results ?? []).map(r => decorateLiveFields(r, now));

  const pendingPaymentCount = data.filter(r =>
    r.chain_status === 'engineer_certified' || r.chain_status === 'approved',
  ).length;
  const disputedCount = data.filter(r => r.chain_status === 'disputed').length;

  const totalCertifiedZar = data.reduce((sum, r) => sum + (r.certified_amount_zar ?? 0), 0);
  const totalApprovedZar = data.reduce((sum, r) => sum + (r.approved_amount_zar ?? 0), 0);
  const totalPaidZar = data
    .filter(r => r.chain_status === 'payment_processed' || r.chain_status === 'closed' || r.chain_status === 'final_account')
    .reduce((sum, r) => sum + (r.net_payable_zar ?? 0), 0);

  const dashboard = {
    progress_claims: {
      total_count: data.length,
      pending_payment_count: pendingPaymentCount,
      disputed_count: disputedCount,
      total_certified_zar: totalCertifiedZar,
      total_approved_zar: totalApprovedZar,
      total_paid_zar: totalPaidZar,
      sla_breached_count: data.filter(r => r.sla_breached).length,
    },
  };

  return c.json({ data, dashboard });
});

// ─── GET /api/ipp-progress-claim/:id ─────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_progress_claims WHERE id = ?',
  ).bind(c.req.param('id')).first<ClaimRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  const events = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_pcn_events WHERE claim_id = ? ORDER BY created_at ASC',
  ).bind(row.id).all();

  return c.json({
    data: {
      claim: decorateLiveFields(row, new Date()),
      events: events.results ?? [],
    },
  });
});

// ─── POST /api/ipp-progress-claim ─────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = (await c.req.json().catch(() => ({}))) as {
    project_id?: string;
    project_name?: string;
    claim_number?: string;
    claim_type?: string;
    claim_tier?: ClaimTier;
    contractor_name?: string;
    subcontractor_ref?: string;
    claim_period_from?: string;
    claim_period_to?: string;
    contractor_invoice_ref?: string;
    claim_amount_zar?: number;
    previous_certified_total_zar?: number;
    contract_completion_pct?: number;
    floor_ie_milestone_payment?: number;
    floor_lender_certification_required?: number;
    floor_retention_release?: number;
    floor_variation_included?: number;
    floor_defects_outstanding?: number;
    change_order_ref?: string;
    milestone_ref?: string;
    drawdown_ref?: string;
    [k: string]: unknown;
  };

  if (!body.project_id || body.claim_amount_zar == null || !body.claim_type || !body.claim_tier) {
    return c.json(
      { error: 'project_id, claim_amount_zar, claim_type, and claim_tier are required' },
      400,
    );
  }

  const enumErr = badEnum('claim_tier', body.claim_tier, ['major', 'significant', 'standard', 'minor']);
  if (enumErr) return c.json({ error: enumErr }, 400);

  const dateErr =
    badDate('claim_period_from', body.claim_period_from) ??
    badDate('claim_period_to', body.claim_period_to);
  if (dateErr) return c.json({ error: dateErr }, 400);

  const tier = body.claim_tier as ClaimTier;
  const now = new Date();
  const slaHrs = SLA_HOURS[tier];
  const slaDeadline = slaDeadlineFor(tier, now);

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM oe_ipp_progress_claims',
  ).first<{ cnt: number }>();
  const cnt = countRow?.cnt ?? 0;
  const id = `pcn-${String(cnt + 1).padStart(3, '0')}`;

  const claimNumber = body.claim_number || `PCN-${String(cnt + 1).padStart(3, '0')}`;

  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_progress_claims (
      id, project_id, project_name, claim_number, chain_status,
      claim_type, claim_tier, contractor_name, subcontractor_ref,
      claim_period_from, claim_period_to, contractor_invoice_ref,
      claim_amount_zar, previous_certified_total_zar, contract_completion_pct,
      floor_ie_milestone_payment, floor_lender_certification_required,
      floor_retention_release, floor_variation_included, floor_defects_outstanding,
      change_order_ref, milestone_ref, drawdown_ref,
      sla_target_hours, sla_deadline_at,
      sla_breached, sla_breach_count, is_reportable,
      submitted_at, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, 'submitted',
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      0, 0, 0,
      ?, ?, ?, ?
    )
  `).bind(
    id, body.project_id, body.project_name ?? null, claimNumber,
    body.claim_type, tier, body.contractor_name ?? null, body.subcontractor_ref ?? null,
    body.claim_period_from ?? null, body.claim_period_to ?? null, body.contractor_invoice_ref ?? null,
    body.claim_amount_zar, body.previous_certified_total_zar ?? null, body.contract_completion_pct ?? null,
    Number(body.floor_ie_milestone_payment ?? 0),
    Number(body.floor_lender_certification_required ?? 0),
    Number(body.floor_retention_release ?? 0),
    Number(body.floor_variation_included ?? 0),
    Number(body.floor_defects_outstanding ?? 0),
    body.change_order_ref ?? null, body.milestone_ref ?? null, body.drawdown_ref ?? null,
    slaHrs, slaDeadline.toISOString(),
    now.toISOString(), user.id, now.toISOString(), now.toISOString(),
  ).run();

  const created = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_progress_claims WHERE id = ?',
  ).bind(id).first<ClaimRow>();

  await fireCascade({
    event: 'ipp_progress_claim.commence_qs_review' as any,
    actor_id: user.id,
    entity_type: 'ipp_progress_claim',
    entity_id: id,
    data: {
      action: 'create',
      claim_type: body.claim_type,
      claim_tier: tier,
      claim_amount_zar: body.claim_amount_zar,
      project_id: body.project_id,
      floor_ie_milestone_payment: Number(body.floor_ie_milestone_payment ?? 0),
      floor_lender_certification_required: Number(body.floor_lender_certification_required ?? 0),
    },
    env: c.env,
  });

  return c.json({ data: decorateLiveFields(created!, new Date()) }, 201);
});

// ─── POST /api/ipp-progress-claim/:id/:action ─────────────────────────────────
app.post('/:id/:action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const { id, action } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as {
    notes?: string;
    qs_assessed_zar?: number;
    qs_notes?: string;
    pm_notes?: string;
    certified_amount_zar?: number;
    engineer_certification_notes?: string;
    approved_amount_zar?: number;
    retention_amount_zar?: number;
    vat_amount_zar?: number;
    net_payable_zar?: number;
    this_period_zar?: number;
    contract_completion_pct?: number;
    dispute_reason?: string;
    rejection_reason?: string;
    suspension_reason?: string;
    [k: string]: unknown;
  };

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_progress_claims WHERE id = ?',
  ).bind(id).first<ClaimRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);
  if (user.role !== 'admin' && row.created_by !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  if (isHardTerminal(row.chain_status)) {
    return c.json({ error: `Claim is in terminal state: ${row.chain_status}` }, 409);
  }

  const claimAction = action as ClaimAction;
  const toStatus = nextStatus(row.chain_status, claimAction);
  if (toStatus === null) {
    return c.json({ error: `Action '${action}' not allowed from '${row.chain_status}'` }, 422);
  }

  const now = new Date();

  const regulatorCrossed = crossesIntoRegulator(claimAction, {
    floor_ie_milestone_payment: row.floor_ie_milestone_payment,
    floor_lender_certification_required: row.floor_lender_certification_required,
  });

  const updates: string[] = ['chain_status = ?', 'updated_at = ?'];
  const vals: unknown[] = [toStatus, now.toISOString()];

  // Record state timestamp
  const tsCol = statusTsCol(toStatus);
  updates.push(`${tsCol} = ?`);
  vals.push(now.toISOString());

  if (regulatorCrossed) {
    updates.push('is_reportable = 1');
    if (!row.regulator_ref) {
      const tierPart = (row.claim_tier ?? 'standard').toUpperCase();
      const ref = `W141-PCN-${tierPart}-${now.getFullYear()}-${id.replace('pcn-', '').toUpperCase()}`;
      updates.push('regulator_ref = ?');
      vals.push(ref);
    }
  }

  // Optional field updates based on action
  if (body.qs_assessed_zar != null)         { updates.push('qs_assessed_zar = ?');               vals.push(body.qs_assessed_zar); }
  if (body.qs_notes)                         { updates.push('qs_notes = ?');                       vals.push(body.qs_notes); }
  if (body.pm_notes)                         { updates.push('pm_notes = ?');                       vals.push(body.pm_notes); }
  if (body.certified_amount_zar != null)     { updates.push('certified_amount_zar = ?');           vals.push(body.certified_amount_zar); }
  if (body.engineer_certification_notes)     { updates.push('engineer_certification_notes = ?');   vals.push(body.engineer_certification_notes); }
  if (body.approved_amount_zar != null)      { updates.push('approved_amount_zar = ?');            vals.push(body.approved_amount_zar); }
  if (body.retention_amount_zar != null)     { updates.push('retention_amount_zar = ?');           vals.push(body.retention_amount_zar); }
  if (body.vat_amount_zar != null)           { updates.push('vat_amount_zar = ?');                 vals.push(body.vat_amount_zar); }
  if (body.net_payable_zar != null)          { updates.push('net_payable_zar = ?');                vals.push(body.net_payable_zar); }
  if (body.this_period_zar != null)          { updates.push('this_period_zar = ?');                vals.push(body.this_period_zar); }
  if (body.contract_completion_pct != null)  { updates.push('contract_completion_pct = ?');        vals.push(body.contract_completion_pct); }
  if (body.dispute_reason)                   { updates.push('dispute_reason = ?');                 vals.push(body.dispute_reason); }
  if (body.rejection_reason)                 { updates.push('rejection_reason = ?');               vals.push(body.rejection_reason); }
  if (body.suspension_reason)                { updates.push('suspension_reason = ?');              vals.push(body.suspension_reason); }

  vals.push(id);
  await c.env.DB.prepare(
    `UPDATE oe_ipp_progress_claims SET ${updates.join(', ')} WHERE id = ?`,
  ).bind(...vals).run();

  // Write event row
  const eventId = `pcnevt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const eventType = eventTypeFor(claimAction);
  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_pcn_events
      (id, claim_id, action, from_status, to_status, actor_id, actor_role, notes, regulator_crossed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId, id, claimAction,
    row.chain_status, toStatus,
    user.id, user.role,
    body.notes ?? body.dispute_reason ?? body.rejection_reason ?? body.suspension_reason ?? null,
    regulatorCrossed ? 1 : 0,
    now.toISOString(),
  ).run();

  await fireCascade({
    event: eventType as any,
    actor_id: user.id,
    entity_type: 'ipp_progress_claim',
    entity_id: id,
    data: {
      action: claimAction,
      from_status: row.chain_status,
      to_status: toStatus,
      claim_tier: row.claim_tier,
      claim_type: row.claim_type,
      claim_amount_zar: row.claim_amount_zar,
      floor_ie_milestone_payment: row.floor_ie_milestone_payment,
      floor_lender_certification_required: row.floor_lender_certification_required,
      regulator_crossed: regulatorCrossed,
      is_reportable: regulatorCrossed,
    },
    env: c.env,
  });

  const updated = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_progress_claims WHERE id = ?',
  ).bind(id).first<ClaimRow>();

  return c.json({ data: decorateLiveFields(updated!, new Date()) });
});

export default app;

// ─── Cron: SLA sweep (runs in */15 shared slot) ──────────────────────────────
export async function ippProgressClaimSlaSweep(env: HonoEnv['Bindings']): Promise<{ swept: number; crossed: number }> {
  const now = new Date();
  const openRows = await env.DB.prepare(`
    SELECT * FROM oe_ipp_progress_claims
    WHERE sla_breached = 0
      AND sla_deadline_at IS NOT NULL
      AND chain_status NOT IN ('closed', 'rejected', 'final_account')
  `).all<ClaimRow>();

  let swept = 0;
  let crossed = 0;

  for (const row of (openRows.results ?? [])) {
    if (!row.sla_deadline_at) continue;
    if (new Date(row.sla_deadline_at) <= now) {
      swept++;
      const tier = (row.claim_tier ?? 'standard') as ClaimTier;
      const reg = slaBreachCrossesIntoRegulator(tier, {
        floor_ie_milestone_payment: !!row.floor_ie_milestone_payment,
        floor_lender_certification_required: !!row.floor_lender_certification_required,
      });
      if (reg) crossed++;

      await env.DB.prepare(`
        UPDATE oe_ipp_progress_claims
        SET sla_breached = 1,
            sla_breach_count = sla_breach_count + 1,
            ${reg ? 'is_reportable = 1,' : ''}
            updated_at = ?
        WHERE id = ?
      `).bind(now.toISOString(), row.id).run();

      await fireCascade({
        event: 'ipp_progress_claim.flag_overdue' as any,
        actor_id: 'cron',
        entity_type: 'ipp_progress_claim',
        entity_id: row.id,
        data: {
          action: 'sla_breached',
          claim_tier: row.claim_tier,
          claim_type: row.claim_type,
          claim_amount_zar: row.claim_amount_zar,
          floor_ie_milestone_payment: row.floor_ie_milestone_payment,
          floor_lender_certification_required: row.floor_lender_certification_required,
          regulator_crossed: reg,
        },
        env,
      });
    }
  }

  return { swept, crossed };
}
