// ═══════════════════════════════════════════════════════════════════════════
// LOI routes — list / fetch / accept / decline Letters of Intent.
//
// LOIs are drafted by the Offtaker AI hub (bill → mix → LOI) and by the IPP
// batch-outreach flow. Each LOI is a `loi_drafts` row:
//   - `from_participant_id` is the sender (offtaker or IPP)
//   - `to_participant_id`   is the receiver (the other side)
//   - status transitions: drafted → sent → { signed | withdrawn | expired }
//
// Accepting an LOI creates a `contract_documents` draft (phase='term_sheet'),
// attaches the LOI id to it, fires the `contract.created` cascade, and
// completes the outstanding `loi_review` action-queue item. The offtaker
// sees the resulting contract on their /contracts list and can progress it
// to signature in the normal way.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';

const lois = new Hono<HonoEnv>();
lois.use('*', authMiddleware);

type LoiRow = {
  id: string;
  from_participant_id: string;
  to_participant_id: string | null;
  project_id: string | null;
  mix_json: string | null;
  body_md: string | null;
  status: string;
  horizon_years: number | null;
  annual_mwh: number | null;
  blended_price: number | null;
  notes: string | null;
  decline_reason: string | null;
  resulting_contract_document_id: string | null;
  sent_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string | null;
  from_name?: string | null;
  to_name?: string | null;
  project_name?: string | null;
};

// ──────────────────────────────────────────────────────────────────────────
// GET /lois — List LOIs visible to the current user.
// Query: ?direction=sent|received|all (default=all), ?status=...
// ──────────────────────────────────────────────────────────────────────────
lois.get('/', async (c) => {
  const user = getCurrentUser(c);
  const direction = c.req.query('direction') || 'all';
  const status = c.req.query('status');

  const where: string[] = [];
  const binds: unknown[] = [];
  if (direction === 'sent') {
    where.push('l.from_participant_id = ?');
    binds.push(user.id);
  } else if (direction === 'received') {
    where.push('l.to_participant_id = ?');
    binds.push(user.id);
  } else {
    where.push('(l.from_participant_id = ? OR l.to_participant_id = ?)');
    binds.push(user.id, user.id);
  }
  if (status) {
    where.push('l.status = ?');
    binds.push(status);
  }

  const sql = `
    SELECT
      l.id, l.from_participant_id, l.to_participant_id, l.project_id,
      l.mix_json, l.body_md, l.status, l.horizon_years, l.annual_mwh, l.blended_price,
      l.notes, l.decline_reason, l.resulting_contract_document_id,
      l.sent_at, l.resolved_at, l.resolved_by, l.created_at, l.updated_at,
      fp.name AS from_name, tp.name AS to_name, pr.project_name AS project_name
    FROM loi_drafts l
    LEFT JOIN participants fp ON fp.id = l.from_participant_id
    LEFT JOIN participants tp ON tp.id = l.to_participant_id
    LEFT JOIN ipp_projects pr ON pr.id = l.project_id
    WHERE ${where.join(' AND ')}
    ORDER BY l.created_at DESC
    LIMIT 100
  `;

  const rows = await c.env.DB.prepare(sql).bind(...binds).all<LoiRow>();
  return c.json({ success: true, data: rows.results || [] });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /lois/:id — Fetch one LOI (must be sender or receiver, or admin).
// ──────────────────────────────────────────────────────────────────────────
lois.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const row = await c.env.DB.prepare(`
    SELECT
      l.id, l.from_participant_id, l.to_participant_id, l.project_id,
      l.mix_json, l.body_md, l.status, l.horizon_years, l.annual_mwh, l.blended_price,
      l.notes, l.decline_reason, l.resulting_contract_document_id,
      l.sent_at, l.resolved_at, l.resolved_by, l.created_at, l.updated_at,
      fp.name AS from_name, fp.email AS from_email, fp.role AS from_role,
      tp.name AS to_name,   tp.email AS to_email,   tp.role AS to_role,
      pr.project_name AS project_name, pr.technology AS project_technology,
      pr.capacity_mw AS project_capacity_mw
    FROM loi_drafts l
    LEFT JOIN participants fp ON fp.id = l.from_participant_id
    LEFT JOIN participants tp ON tp.id = l.to_participant_id
    LEFT JOIN ipp_projects pr ON pr.id = l.project_id
    WHERE l.id = ?
  `).bind(id).first<LoiRow>();

  if (!row) return c.json({ success: false, error: 'not_found' }, 404);

  const allowed =
    user.role === 'admin' ||
    row.from_participant_id === user.id ||
    row.to_participant_id === user.id;
  if (!allowed) return c.json({ success: false, error: 'forbidden' }, 403);

  return c.json({ success: true, data: row });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /lois/:id/file — Esums-equivalent file for one LOI.
// Aggregates the LOI row + counterparties + project + resulting contract +
// negotiation lifecycle (action_queue, audit chain, notifications) + AI hints.
// ──────────────────────────────────────────────────────────────────────────
lois.get('/:id/file', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  // SQLite helpers — never throw out of the aggregator if a table is missing.
  const safeAll = async <T = any>(sql: string, ...binds: unknown[]): Promise<T[]> => {
    try {
      const res = await c.env.DB.prepare(sql).bind(...binds).all<T>();
      return res.results || [];
    } catch {
      return [];
    }
  };
  const safeFirst = async <T = any>(sql: string, ...binds: unknown[]): Promise<T | null> => {
    try {
      return await c.env.DB.prepare(sql).bind(...binds).first<T>();
    } catch {
      return null;
    }
  };

  const loi = await safeFirst<LoiRow & { from_email?: string; from_role?: string; to_email?: string; to_role?: string; project_technology?: string; project_capacity_mw?: number }>(
    `SELECT
       l.id, l.from_participant_id, l.to_participant_id, l.project_id,
       l.mix_json, l.body_md, l.status, l.horizon_years, l.annual_mwh, l.blended_price,
       l.notes, l.decline_reason, l.resulting_contract_document_id,
       l.sent_at, l.resolved_at, l.resolved_by, l.created_at, l.updated_at,
       fp.name AS from_name, fp.email AS from_email, fp.role AS from_role,
       tp.name AS to_name,   tp.email AS to_email,   tp.role AS to_role,
       pr.project_name AS project_name, pr.technology AS project_technology,
       pr.capacity_mw AS project_capacity_mw
     FROM loi_drafts l
     LEFT JOIN participants fp ON fp.id = l.from_participant_id
     LEFT JOIN participants tp ON tp.id = l.to_participant_id
     LEFT JOIN ipp_projects pr ON pr.id = l.project_id
     WHERE l.id = ?`,
    id,
  );
  if (!loi) return c.json({ success: false, error: 'not_found' }, 404);

  const allowed =
    user.role === 'admin' ||
    user.role === 'regulator' ||
    loi.from_participant_id === user.id ||
    loi.to_participant_id === user.id;
  if (!allowed) return c.json({ success: false, error: 'forbidden' }, 403);

  // Parse mix_json safely.
  let mix: Record<string, number> = {};
  try {
    mix = JSON.parse(loi.mix_json || '{}');
  } catch {
    mix = {};
  }

  // Linked project + resulting contract.
  const project = loi.project_id
    ? await safeFirst<any>(
        `SELECT id, project_name, technology, province, capacity_mw, status, cod_date, tariff_zar_per_mwh, contracted_capacity_mw
           FROM ipp_projects WHERE id = ?`,
        loi.project_id,
      )
    : null;
  const resultingContract = loi.resulting_contract_document_id
    ? await safeFirst<any>(
        `SELECT id, title, document_type, phase, created_at, updated_at, project_id, commercial_terms
           FROM contract_documents WHERE id = ?`,
        loi.resulting_contract_document_id,
      )
    : null;
  let contractSignatories: any[] = [];
  if (resultingContract) {
    contractSignatories = await safeAll<any>(
      `SELECT id, contract_document_id, party_participant_id, signing_role, signed_at, signature_method
         FROM contract_signatories WHERE contract_document_id = ?
         ORDER BY signed_at IS NULL, signed_at`,
      resultingContract.id,
    );
  }

  // Counterparty richness — pull KYC, risk, and recent activity.
  const partyIds = [loi.from_participant_id, loi.to_participant_id].filter(Boolean) as string[];
  const kyc = partyIds.length
    ? await safeAll<any>(
        `SELECT participant_id, status, screening_type, overall_risk, completed_at, ran_at
           FROM oe_kyc_screenings
          WHERE participant_id IN (${partyIds.map(() => '?').join(',')})
          ORDER BY ran_at DESC LIMIT 20`,
        ...partyIds,
      )
    : [];
  const riskScores = partyIds.length
    ? await safeAll<any>(
        `SELECT participant_id, score, band, last_evaluated_at
           FROM oe_party_risk_scores
          WHERE participant_id IN (${partyIds.map(() => '?').join(',')})`,
        ...partyIds,
      )
    : [];

  // Lifecycle — action queue + notifications.
  const actionQueue = await safeAll<any>(
    `SELECT id, action_type, status, assigned_to, due_at, completed_at, created_at, payload_json
       FROM action_queue
      WHERE entity_type = 'loi_drafts' AND entity_id = ?
      ORDER BY created_at DESC LIMIT 40`,
    id,
  );
  const notifications = await safeAll<any>(
    `SELECT id, participant_id, type, title, body, data, created_at
       FROM notifications
      WHERE json_extract(data, '$.entity_id') = ?
        AND (json_extract(data, '$.entity_type') = 'loi_drafts' OR type LIKE 'loi_%')
      ORDER BY created_at DESC LIMIT 30`,
    id,
  );

  // Audit chain.
  const auditEvents = await safeAll<any>(
    `SELECT id, prev_hash, hash, event_type, actor_id, entity_id, entity_type, data, created_at
       FROM audit_events
      WHERE entity_type = 'loi_drafts' AND entity_id = ?
      ORDER BY created_at DESC LIMIT 50`,
    id,
  );
  const auditLogs = await safeAll<any>(
    `SELECT id, user_id, user_email, action, resource_type, resource_id, details, status, timestamp
       FROM audit_logs
      WHERE resource_type = 'loi_drafts' AND resource_id = ?
      ORDER BY timestamp DESC LIMIT 50`,
    id,
  );

  // Summary numbers.
  const sentAt = loi.sent_at ? new Date(loi.sent_at) : null;
  const resolvedAt = loi.resolved_at ? new Date(loi.resolved_at) : null;
  const now = new Date();
  const daysOutstanding =
    sentAt && !resolvedAt
      ? Math.floor((now.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;
  const daysToResolve =
    sentAt && resolvedAt
      ? Math.floor((resolvedAt.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;
  const totalContractValue =
    loi.annual_mwh && loi.blended_price && loi.horizon_years
      ? loi.annual_mwh * loi.blended_price * loi.horizon_years
      : null;
  const pendingActions = actionQueue.filter((a) => a.status === 'pending').length;
  const counterpartyKycPending = kyc.filter(
    (k) => k.participant_id === loi.to_participant_id && k.status !== 'completed',
  ).length;

  const summary = {
    loi_id: loi.id,
    status: loi.status,
    direction: loi.from_participant_id === user.id ? 'sent' : 'received',
    from_name: loi.from_name || loi.from_participant_id,
    to_name: loi.to_name || loi.to_participant_id || 'Unassigned',
    project_name: loi.project_name || '—',
    technology: loi.project_technology || '—',
    annual_mwh: loi.annual_mwh,
    blended_price_zar_per_mwh: loi.blended_price,
    horizon_years: loi.horizon_years,
    total_contract_value_zar: totalContractValue,
    sent_at: loi.sent_at,
    resolved_at: loi.resolved_at,
    decline_reason: loi.decline_reason,
    days_outstanding: daysOutstanding,
    days_to_resolve: daysToResolve,
    resulting_contract_id: loi.resulting_contract_document_id,
    contract_phase: resultingContract?.phase || null,
    signatories_total: contractSignatories.length,
    signatories_signed: contractSignatories.filter((s) => s.signed_at).length,
    pending_actions: pendingActions,
    counterparty_kyc_pending: counterpartyKycPending,
    audit_events: auditEvents.length,
  };

  // AI suggestions — keep them specific and actionable.
  const ai_suggestions: Array<{ id: string; kind: string; title: string; why: string; cta?: { label: string; action: string } }> = [];
  if (loi.status === 'drafted' && (now.getTime() - new Date(loi.created_at).getTime()) > 3 * 24 * 60 * 60 * 1000) {
    ai_suggestions.push({
      id: 'drafted_too_long',
      kind: 'workflow',
      title: 'Send this LOI — drafted but never delivered',
      why: `LOI has sat in 'drafted' for ${Math.floor((now.getTime() - new Date(loi.created_at).getTime()) / 86_400_000)} days without being sent to ${loi.to_name || 'the counterparty'}.`,
      cta: { label: 'Send LOI', action: 'send_loi' },
    });
  }
  if (loi.status === 'sent' && daysOutstanding !== null && daysOutstanding >= 14) {
    ai_suggestions.push({
      id: 'sent_no_response',
      kind: 'lifecycle',
      title: `Chase the recipient — ${daysOutstanding} days without a response`,
      why: `Standard response window is 14 days. ${loi.to_name || 'Recipient'} has not accepted, declined, or counter-offered.`,
      cta: { label: 'Send chase notification', action: 'chase_loi' },
    });
  }
  if (counterpartyKycPending > 0 && (loi.status === 'sent' || loi.status === 'drafted')) {
    ai_suggestions.push({
      id: 'kyc_blocking',
      kind: 'compliance',
      title: `Recipient KYC incomplete — ${counterpartyKycPending} screening(s) pending`,
      why: 'POPIA + FICA require KYC clearance before a binding offtake instrument can be accepted.',
      cta: { label: 'Open KYC file', action: 'open_kyc' },
    });
  }
  if (loi.status === 'signed' && !resultingContract) {
    ai_suggestions.push({
      id: 'signed_no_contract',
      kind: 'workflow',
      title: 'LOI marked signed but no contract document on file',
      why: 'Acceptance should produce a term_sheet draft in contract_documents. Re-run the accept step.',
      cta: { label: 'Generate contract', action: 'regenerate_contract' },
    });
  }
  if (loi.status === 'withdrawn' && loi.decline_reason) {
    ai_suggestions.push({
      id: 'declined_counter',
      kind: 'commercial',
      title: 'Counter-offer at revised terms',
      why: `Recipient declined with reason: "${loi.decline_reason}". A revised LOI at adjusted price or horizon may unblock the deal.`,
      cta: { label: 'Draft counter-offer', action: 'counter_offer' },
    });
  }

  return c.json({
    success: true,
    data: {
      loi,
      mix,
      project,
      counterparty: {
        from: { id: loi.from_participant_id, name: loi.from_name, email: loi.from_email, role: loi.from_role },
        to: { id: loi.to_participant_id, name: loi.to_name, email: loi.to_email, role: loi.to_role },
        kyc,
        risk_scores: riskScores,
      },
      contract: resultingContract
        ? { record: resultingContract, signatories: contractSignatories }
        : null,
      lifecycle: { action_queue: actionQueue, notifications },
      audit: { events: auditEvents, logs: auditLogs },
      summary,
      ai_suggestions,
    },
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /lois/:id/accept — Recipient accepts the LOI.
// - Creates a contract_documents draft (phase='term_sheet', type derived
//   from LOI project technology, parties copied from LOI)
// - Fires contract.created cascade
// - Completes the loi_review action_queue item
// - Updates LOI status to 'signed' with resulting_contract_document_id
// ──────────────────────────────────────────────────────────────────────────
lois.post('/:id/accept', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string;
    notes?: string;
  };

  const loi = await c.env.DB.prepare(
    `SELECT * FROM loi_drafts WHERE id = ?`,
  ).bind(id).first<LoiRow>();
  if (!loi) return c.json({ success: false, error: 'not_found' }, 404);
  if (loi.to_participant_id !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'only_recipient_may_accept' }, 403);
  }
  if (loi.status !== 'drafted' && loi.status !== 'sent') {
    return c.json({ success: false, error: `already_${loi.status}` }, 400);
  }

  const project = loi.project_id
    ? await c.env.DB.prepare(
        `SELECT id, project_name, technology FROM ipp_projects WHERE id = ?`,
      ).bind(loi.project_id).first<{ id: string; project_name: string; technology: string }>()
    : null;

  const contractId = 'ct_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const now = new Date().toISOString();
  const title = body.title || `Term sheet: ${project?.project_name || 'LOI ' + id.slice(0, 8)}`;
  const commercialTerms = {
    origin_loi_id: loi.id,
    annual_mwh: loi.annual_mwh,
    blended_price_zar_per_mwh: loi.blended_price,
    horizon_years: loi.horizon_years,
    project_id: loi.project_id,
    project_technology: project?.technology || null,
    accepted_by: user.id,
    accepted_at: now,
  };

  await c.env.DB.prepare(`
    INSERT INTO contract_documents (
      id, title, document_type, phase, creator_id, counterparty_id,
      project_id, commercial_terms, tenant_id, created_at, updated_at
    ) VALUES (?, ?, 'term_sheet', 'term_sheet', ?, ?, ?, ?, 'default', ?, ?)
  `).bind(
    contractId,
    title,
    loi.from_participant_id,
    user.id,
    loi.project_id,
    JSON.stringify(commercialTerms),
    now,
    now,
  ).run();

  await c.env.DB.prepare(`
    UPDATE loi_drafts
       SET status = 'signed',
           resulting_contract_document_id = ?,
           resolved_at = ?,
           resolved_by = ?,
           updated_at = ?
     WHERE id = ?
  `).bind(contractId, now, user.id, now, id).run();

  // Close the outstanding action-queue item(s) for this LOI.
  await c.env.DB.prepare(
    `UPDATE action_queue SET status = 'completed', completed_at = ?
       WHERE entity_type = 'loi_drafts' AND entity_id = ? AND status = 'pending'`,
  ).bind(now, id).run();

  await fireCascade({
    event: 'contract.created',
    actor_id: user.id,
    entity_type: 'contract_documents',
    entity_id: contractId,
    data: {
      contract_type: 'PPA',
      phase: 'term_sheet',
      origin_loi_id: loi.id,
      project_id: loi.project_id,
      project_name: project?.project_name,
      counterparty_id: loi.from_participant_id,
      creator_id: user.id,
      annual_mwh: loi.annual_mwh,
      blended_price: loi.blended_price,
      horizon_years: loi.horizon_years,
    },
    env: c.env,
  });

  return c.json({
    success: true,
    data: { loi_id: id, contract_document_id: contractId, status: 'signed' },
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /lois/:id/decline — Recipient declines the LOI with a reason.
// - Updates status to 'withdrawn' with decline_reason
// - Completes the loi_review action_queue item
// - Fires contract.phase_changed cascade so the sender sees the outcome
// ──────────────────────────────────────────────────────────────────────────
lois.post('/:id/decline', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const reason = (body.reason || '').trim() || 'No reason provided';

  const loi = await c.env.DB.prepare(
    `SELECT * FROM loi_drafts WHERE id = ?`,
  ).bind(id).first<LoiRow>();
  if (!loi) return c.json({ success: false, error: 'not_found' }, 404);
  if (loi.to_participant_id !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'only_recipient_may_decline' }, 403);
  }
  if (loi.status !== 'drafted' && loi.status !== 'sent') {
    return c.json({ success: false, error: `already_${loi.status}` }, 400);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE loi_drafts
       SET status = 'withdrawn',
           decline_reason = ?,
           resolved_at = ?,
           resolved_by = ?,
           updated_at = ?
     WHERE id = ?
  `).bind(reason, now, user.id, now, id).run();

  await c.env.DB.prepare(
    `UPDATE action_queue SET status = 'completed', completed_at = ?
       WHERE entity_type = 'loi_drafts' AND entity_id = ? AND status = 'pending'`,
  ).bind(now, id).run();

  // Notify the sender that their LOI was declined.
  await c.env.DB.prepare(`
    INSERT INTO notifications (id, participant_id, type, title, body, data)
    VALUES (?, ?, 'loi_declined', ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    loi.from_participant_id,
    'LOI declined',
    `${user.name} declined your LOI. Reason: ${reason}`,
    JSON.stringify({ entity_type: 'loi_drafts', entity_id: id, severity: 'warning' }),
  ).run();

  return c.json({
    success: true,
    data: { loi_id: id, status: 'withdrawn', decline_reason: reason },
  });
});

export default lois;
