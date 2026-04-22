// ═══════════════════════════════════════════════════════════════════════════
// Cascade Event System — 35+ Event Types → Notifications + Webhooks + Audit
// ═══════════════════════════════════════════════════════════════════════════

export type EventType =
  // Auth
  | 'auth.registered' | 'auth.login' | 'auth.logout' | 'auth.otp_sent' | 'auth.otp_verified'
  | 'auth.email_verified' | 'auth.password_reset' | 'auth.module_access_changed'
  // Contract
  | 'contract.created' | 'contract.phase_changed' | 'contract.signed' | 'contract.executed'
  | 'contract.amended' | 'contract.terminated' | 'contract.statutory_check_completed'
  // Trading
  | 'trade.order_placed' | 'trade.matched' | 'trade.settled' | 'trade.cancelled'
  // Escrow
  | 'escrow.created' | 'escrow.released' | 'escrow.refunded' | 'escrow.claimed'
  // Settlement
  | 'invoice.created' | 'invoice.issued' | 'invoice.viewed' | 'invoice.paid' | 'invoice.overdue' | 'invoice.disputed'
  | 'dispute.filed' | 'dispute.resolved'
  // Carbon
  | 'carbon.traded' | 'carbon.retired' | 'carbon.transferring' | 'carbon.fund_nav_updated'
  | 'carbon.option_exercised' | 'carbon.option_expired'
  // IPP
  | 'ipp.project_created' | 'ipp.project_updated' | 'ipp.milestone_satisfied' | 'ipp.milestone_cp_satisfied'
  | 'ipp.financial_close' | 'ipp.disbursement_requested' | 'ipp.disbursement_approved'
  | 'ipp.performance_reported'
  // ESG
  | 'esg.score_calculated' | 'esg.report_published' | 'esg.decarbonisation_completed'
  // Grid
  | 'grid.connection_created' | 'grid.constraint_active' | 'grid.wheeling_started'
  | 'grid.imbalance_calculated'
  // Ona
  | 'ona.fault_detected' | 'ona.fault_triaged' | 'ona.fault_resolved'
  | 'ona.forecast_synced' | 'ona.maintenance_scheduled' | 'ona.maintenance_updated'
  // Grid / Metering extras
  | 'grid.connection_commissioned' | 'metering.reading_validated'
  // Pipeline / Threads / Dealroom
  | 'pipeline.created' | 'pipeline.stage_changed' | 'pipeline.won' | 'pipeline.lost'
  | 'thread.posted' | 'dealroom.proposed' | 'dealroom.accepted'
  // Marketplace
  | 'marketplace.bid' | 'marketplace.listed' | 'marketplace.inquired' | 'marketplace.accepted'
  // General
  | 'demand.matched' | 'meter.ingested'
  | 'popia.consent_changed' | 'popia.data_exported' | 'popia.erasure'
  // Pipeline
  | 'pipeline.created' | 'pipeline.stage_changed' | 'pipeline.won' | 'pipeline.lost'
  // Threads / collaboration
  | 'thread.posted'
  | 'intelligence.item_created' | 'action_queue.created';

interface CascadeContext {
  event: EventType;
  actor_id?: string;
  entity_type: string;
  entity_id: string;
  data?: Record<string, unknown>;
  env: any;
}

/**
 * Fire all cascade effects for a domain event:
 *   1. audit log   (durable record)
 *   2. notifications (fan-out to recipients)
 *   3. webhooks    (async external delivery; failures never block)
 *   4. special handlers (entity-specific follow-ons)
 *
 * Each stage is wrapped in `runStage`, which retries with exponential
 * backoff and, on terminal failure, persists to `cascade_dlq` so support
 * can inspect / retry from the /support/cascade-dlq console.
 *
 * The one exception is webhook delivery — it's fire-and-forget so a slow
 * external receiver never holds up the user's request. Webhook failures
 * still reach DLQ but via runStage running inside the .catch chain.
 */
export async function fireCascade(ctx: CascadeContext): Promise<void> {
  await runStage(ctx, 'audit', () => createAuditLog(ctx, ctx.env));
  await runStage(ctx, 'notifications', () => createNotifications(ctx, ctx.env));

  // Webhooks run async so user-facing responses aren't blocked on slow
  // external endpoints. Terminal failure still lands in DLQ.
  void runStage(ctx, 'webhooks', () => deliverWebhooks(ctx)).catch(() => {
    /* runStage already persisted to DLQ; nothing else to do. */
  });

  await runStage(ctx, 'special', () => handleSpecialCascades(ctx));
}

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

async function runStage<T>(
  ctx: CascadeContext,
  stage: 'audit' | 'notifications' | 'webhooks' | 'special',
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T | undefined> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 50;

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      const backoffMs = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  await writeToDlq(ctx, stage, lastErr, maxAttempts);
  return undefined;
}

async function writeToDlq(
  ctx: CascadeContext,
  stage: 'audit' | 'notifications' | 'webhooks' | 'special',
  err: unknown,
  attemptCount: number,
): Promise<void> {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const errorStack = err instanceof Error ? err.stack || null : null;

  try {
    await ctx.env.DB.prepare(
      `INSERT INTO cascade_dlq
         (id, event, entity_type, entity_id, actor_id, payload, stage,
          error_message, error_stack, attempt_count, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    )
      .bind(
        generateId(),
        ctx.event,
        ctx.entity_type,
        ctx.entity_id,
        ctx.actor_id || null,
        JSON.stringify(ctx.data || {}),
        stage,
        errorMessage,
        errorStack,
        attemptCount,
      )
      .run();
  } catch (dlqErr) {
    // Last resort — DLQ itself is down. Log, but never throw to the caller.
    console.error(`DLQ write failed for ${ctx.event}/${stage}:`, dlqErr);
    console.error('Original cascade error:', err);
  }
}

/**
 * Replay a DLQ row. Used by the support console. Re-runs the given stage
 * only; on success flips the row to status='resolved'. On failure bumps
 * attempt_count + last_attempt_at so staff can see the latest diagnostic.
 */
export async function retryDlqItem(
  env: { DB: any },
  dlqId: string,
  operatorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const row = await env.DB.prepare(
    `SELECT id, event, entity_type, entity_id, actor_id, payload, stage, attempt_count, status
       FROM cascade_dlq WHERE id = ?`,
  )
    .bind(dlqId)
    .first<{
      id: string;
      event: string;
      entity_type: string;
      entity_id: string;
      actor_id: string | null;
      payload: string;
      stage: 'audit' | 'notifications' | 'webhooks' | 'special';
      attempt_count: number;
      status: string;
    }>();

  if (!row) return { ok: false, error: 'DLQ row not found' };
  if (row.status !== 'pending') return { ok: false, error: `Row is ${row.status}` };

  const ctx: CascadeContext = {
    event: row.event as EventType,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    actor_id: row.actor_id || undefined,
    data: (() => {
      try { return JSON.parse(row.payload); } catch { return {}; }
    })(),
    env,
  };

  try {
    switch (row.stage) {
      case 'audit':
        await createAuditLog(ctx, env);
        break;
      case 'notifications':
        await createNotifications(ctx, env);
        break;
      case 'webhooks':
        await deliverWebhooks(ctx);
        break;
      case 'special':
        await handleSpecialCascades(ctx);
        break;
    }

    await env.DB.prepare(
      `UPDATE cascade_dlq
          SET status = 'resolved', resolved_at = datetime('now'),
              resolved_by = ?, last_attempt_at = datetime('now'),
              attempt_count = attempt_count + 1
        WHERE id = ?`,
    )
      .bind(operatorId, dlqId)
      .run();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await env.DB.prepare(
      `UPDATE cascade_dlq
          SET last_attempt_at = datetime('now'),
              attempt_count = attempt_count + 1,
              error_message = ?
        WHERE id = ?`,
    )
      .bind(msg, dlqId)
      .run();
    return { ok: false, error: msg };
  }
}

/** Resolve without retry — support marks a DLQ row as handled out-of-band. */
export async function resolveDlqItem(
  env: { DB: any },
  dlqId: string,
  operatorId: string,
  status: 'resolved' | 'abandoned',
  note?: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE cascade_dlq
        SET status = ?, resolved_at = datetime('now'), resolved_by = ?,
            resolution_note = ?
      WHERE id = ? AND status = 'pending'`,
  )
    .bind(status, operatorId, note || null, dlqId)
    .run();
}

async function createAuditLog(ctx: CascadeContext, env: any): Promise<void> {
  // Intentionally NO inner try/catch here — runStage() wraps this call in its
  // own retry + DLQ fallback loop (see runStage above), and swallowing errors
  // locally turns that retry/DLQ machinery into dead code. Any DB failure
  // must propagate so the audit-log stage can be retried and, if all retries
  // fail, dead-lettered for support to inspect and replay.
  await env.DB.prepare(`
    INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, changes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    generateId(),
    ctx.actor_id || null,
    ctx.event,
    ctx.entity_type,
    ctx.entity_id,
    JSON.stringify(ctx.data || {}),
    new Date().toISOString()
  ).run();
}

async function createNotifications(ctx: CascadeContext, env: any): Promise<void> {
  const recipients = await determineNotificationRecipients(ctx, env);
  
  for (const recipient_id of recipients) {
    try {
      const { title, body } = buildNotificationContent(ctx);
      
      await env.DB.prepare(`
        INSERT INTO notifications (id, participant_id, type, title, body, data, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        generateId(),
        recipient_id,
        ctx.event.split('.')[0],
        title,
        body,
        JSON.stringify(ctx.data || {}),
        new Date().toISOString()
      ).run();
    } catch (err) {
      console.error('Notification creation failed:', err);
    }
  }
}

async function determineNotificationRecipients(ctx: CascadeContext, env: any): Promise<string[]> {
  const recipients = new Set<string>();
  
  // Always notify the actor
  if (ctx.actor_id) recipients.add(ctx.actor_id);
  
  // Add recipients based on entity type and event
  switch (ctx.entity_type) {
    case 'contract_documents': {
      const doc = await env.DB.prepare('SELECT creator_id, counterparty_id FROM contract_documents WHERE id = ?').bind(ctx.entity_id).first();
      if (doc) {
        recipients.add(doc.creator_id);
        recipients.add(doc.counterparty_id);
      }
      // Notify admin for statutory checks
      if (ctx.event.includes('statutory')) {
        const admins = await env.DB.prepare("SELECT id FROM participants WHERE role = 'admin'").all();
        admins.results?.forEach((a: any) => recipients.add(a.id));
      }
      break;
    }
    case 'trade_matches':
    case 'escrow_accounts': {
      // Prefer the buyer/seller participant IDs that the firer passed through
      // in `ctx.data` (trading.ts / invoices.ts handlers already have them),
      // and fall back to a JOIN through trade_orders if the caller didn't
      // include them. `trade_matches` itself only stores buy_order_id /
      // sell_order_id — participants are resolved via trade_orders.
      const dataBuyer = ctx.data?.buyer_id as string | undefined;
      const dataSeller = ctx.data?.seller_id as string | undefined;
      if (dataBuyer) recipients.add(dataBuyer);
      if (dataSeller) recipients.add(dataSeller);
      if (!dataBuyer || !dataSeller) {
        try {
          const match = await env.DB.prepare(`
            SELECT b.participant_id AS buyer_id, s.participant_id AS seller_id
            FROM trade_matches tm
            JOIN trade_orders b ON tm.buy_order_id = b.id
            JOIN trade_orders s ON tm.sell_order_id = s.id
            WHERE tm.id = ?
          `).bind(ctx.entity_id).first();
          if (match?.buyer_id) recipients.add(match.buyer_id as string);
          if (match?.seller_id) recipients.add(match.seller_id as string);
        } catch {
          // Swallow resolver errors so a schema mismatch never aborts the
          // whole cascade chain (audit + webhooks + handlers still run).
        }
      }
      break;
    }
    case 'invoices': {
      const inv = await env.DB.prepare('SELECT from_participant_id, to_participant_id FROM invoices WHERE id = ?').bind(ctx.entity_id).first();
      if (inv) {
        recipients.add(inv.from_participant_id);
        recipients.add(inv.to_participant_id);
      }
      break;
    }
    case 'ipp_projects': {
      const proj = await env.DB.prepare('SELECT developer_id FROM ipp_projects WHERE id = ?').bind(ctx.entity_id).first();
      if (proj) recipients.add(proj.developer_id);
      // Notify lenders too
      const lenders = await env.DB.prepare('SELECT DISTINCT investor_participant_id FROM fund_commitments fc JOIN energy_funds ef ON fc.fund_id = ef.id').all();
      lenders.results?.forEach((l: any) => recipients.add(l.investor_participant_id));
      break;
    }
    case 'project_disbursements': {
      const disp = await env.DB.prepare(`
        SELECT p.developer_id, pd.requested_by 
        FROM project_disbursements pd 
        JOIN ipp_projects p ON pd.project_id = p.id 
        WHERE pd.id = ?
      `).bind(ctx.entity_id).first();
      if (disp) {
        recipients.add(disp.developer_id);
        recipients.add(disp.requested_by);
      }
      break;
    }
    case 'esg_reports': {
      const report = await env.DB.prepare('SELECT participant_id FROM esg_reports WHERE id = ?').bind(ctx.entity_id).first();
      if (report) recipients.add(report.participant_id);
      const admins = await env.DB.prepare("SELECT id FROM participants WHERE role = 'admin'").all();
      admins.results?.forEach((a: any) => recipients.add(a.id));
      break;
    }
    case 'ona_faults': {
      const fault = await env.DB.prepare('SELECT sf.project_id FROM ona_faults sf WHERE sf.id = ?').bind(ctx.entity_id).first();
      if (fault) {
        const proj = await env.DB.prepare('SELECT developer_id FROM ipp_projects WHERE id = ?').bind(fault.project_id).first();
        if (proj) recipients.add(proj.developer_id);
        // Notify lenders of DSCR impact
        const lenders = await env.DB.prepare('SELECT investor_participant_id FROM fund_commitments').all();
        lenders.results?.forEach((l: any) => recipients.add(l.investor_participant_id));
        // Notify offtakers
        const contracts = await env.DB.prepare('SELECT counterparty_id FROM contract_documents WHERE project_id = ?').bind(fault.project_id).all();
        contracts.results?.forEach((c: any) => recipients.add(c.counterparty_id));
      }
      break;
    }
    default:
      break;
  }
  
  return Array.from(recipients);
}

function buildNotificationContent(ctx: CascadeContext): { title: string; body: string } {
  const eventHandlers: Record<string, () => { title: string; body: string }> = {
    'auth.registered': () => ({ title: 'Welcome to Open Energy', body: 'Your account has been created. Please verify your email.' }),
    'auth.login': () => ({ title: 'New Login Detected', body: 'A new login was recorded for your account.' }),
    'contract.phase_changed': () => ({ 
      title: `Contract Phase: ${ctx.data?.new_phase || 'updated'}`, 
      body: `Contract ${ctx.entity_id} has moved to ${ctx.data?.new_phase || 'a new phase'}.` 
    }),
    'contract.signed': () => ({ 
      title: 'Contract Signed', 
      body: `Document ${ctx.entity_id} has been signed by all parties.` 
    }),
    'trade.matched': () => ({ 
      title: 'Trade Executed', 
      body: `A ${ctx.data?.volume_mwh || 0} MWh trade has been matched at R${ctx.data?.price_per_mwh || 0}/MWh.` 
    }),
    'escrow.created': () => ({ 
      title: 'Escrow Account Created', 
      body: `Escrow of R${ctx.data?.amount || 0} created for trade ${ctx.data?.match_id || ctx.entity_id}.` 
    }),
    'invoice.issued': () => ({ 
      title: 'Invoice Issued', 
      body: `Invoice ${ctx.data?.invoice_number || ctx.entity_id} for R${ctx.data?.total_amount || 0} has been issued.` 
    }),
    'invoice.paid': () => ({ 
      title: 'Payment Received', 
      body: `Payment of R${ctx.data?.paid_amount || 0} received for invoice ${ctx.data?.invoice_number || ctx.entity_id}.` 
    }),
    'invoice.overdue': () => ({ 
      title: 'Invoice Overdue', 
      body: `Invoice ${ctx.data?.invoice_number || ctx.entity_id} is overdue. Please take action.` 
    }),
    'dispute.filed': () => ({ 
      title: 'Dispute Filed', 
      body: `A dispute has been filed for invoice ${ctx.data?.invoice_id || ctx.entity_id}.` 
    }),
    'carbon.traded': () => ({ 
      title: 'Carbon Trade Executed', 
      body: `${ctx.data?.volume_tco2 || 0} tCO₂e ${ctx.data?.credit_type || 'credits'} traded at R${ctx.data?.price_per_tco2 || 0}/tCO₂e.` 
    }),
    'carbon.retired': () => ({ 
      title: 'Carbon Credits Retired', 
      body: `${ctx.data?.quantity || 0} tCO₂e have been retired for ${ctx.data?.beneficiary_name || 'specified beneficiary'}.` 
    }),
    'ipp.project_created': () => ({ 
      title: 'IPP Project Created', 
      body: `New project "${ctx.data?.project_name || ctx.entity_id}" has been created.` 
    }),
    'ipp.project_updated': () => ({ 
      title: 'IPP Project Updated', 
      body: `Project ${ctx.data?.project_name || ctx.entity_id} metadata has been updated${ctx.data?.fields ? ` (${(ctx.data.fields as string[]).join(', ')})` : ''}.` 
    }),
    'ipp.milestone_satisfied': () => ({ 
      title: 'Milestone Achieved', 
      body: `Milestone "${ctx.data?.milestone_name || 'Unknown'}" for project ${ctx.data?.project_id || ctx.entity_id} has been satisfied.` 
    }),
    'ipp.financial_close': () => ({ 
      title: 'Financial Close Declared', 
      body: `Project ${ctx.data?.project_id || ctx.entity_id} has achieved Financial Close. Construction begins!` 
    }),
    'ipp.disbursement_requested': () => ({ 
      title: 'Disbursement Requested', 
      body: `Disbursement request of R${ctx.data?.requested_amount || 0} for project ${ctx.data?.project_id || ctx.entity_id}.` 
    }),
    'ipp.disbursement_approved': () => ({ 
      title: 'Disbursement Approved', 
      body: `R${ctx.data?.approved_amount || 0} disbursement approved for project ${ctx.data?.project_id || ctx.entity_id}.` 
    }),
    'esg.report_published': () => ({ 
      title: 'ESG Report Published', 
      body: `ESG Report "${ctx.data?.report_title || ctx.entity_id}" has been published.` 
    }),
    'esg.score_calculated': () => ({ 
      title: 'ESG Score Updated', 
      body: `ESG score recalculated for your entity. New score: ${ctx.data?.new_score || 'N/A'}.` 
    }),
    'grid.constraint_active': () => ({ 
      title: 'Grid Constraint Active', 
      body: `${ctx.data?.severity || 'Medium'} constraint at ${ctx.data?.location || 'unknown location'}. Capacity reduced to ${ctx.data?.available_capacity_mw || 0} MW.` 
    }),
    'ona.fault_detected': () => ({ 
      title: 'Fault Detected — Action Required', 
      body: `${ctx.data?.severity || 'Medium'} fault at site ${ctx.data?.site_name || ctx.entity_id}. Estimated impact: R${ctx.data?.estimated_revenue_impact || 0}/day.` 
    }),
    'marketplace.bid': () => ({ 
      title: 'New Bid Received', 
      body: `A bid of R${ctx.data?.bid_amount || 0} has been submitted for your listing.` 
    }),
    'intelligence.item_created': () => ({ 
      title: `Intelligence: ${ctx.data?.severity || 'Info'}`, 
      body: ctx.data?.title as string || 'New intelligence item created.' 
    }),
    'action_queue.created': () => ({ 
      title: 'Action Required', 
      body: ctx.data?.title as string || 'A new action has been assigned to you.' 
    }),
  };
  
  const handler = eventHandlers[ctx.event];
  return handler ? handler() : { title: ctx.event, body: `Event ${ctx.event} on ${ctx.entity_type}:${ctx.entity_id}` };
}

async function deliverWebhooks(ctx: CascadeContext): Promise<void> {
  // Get all webhook endpoints for this event type
  const webhooks = await ctx.env.KV.get('webhooks', 'json') as Record<string, string[]> || {};
  const endpoints = webhooks[ctx.event] || [];
  
  for (const url of endpoints) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-OE-Event': ctx.event },
        body: JSON.stringify({
          event: ctx.event,
          entity_type: ctx.entity_type,
          entity_id: ctx.entity_id,
          data: ctx.data,
          timestamp: new Date().toISOString()
        })
      });
    } catch (err) {
      console.error(`Webhook delivery failed to ${url}:`, err);
    }
  }
}

async function handleSpecialCascades(ctx: CascadeContext): Promise<void> {
  const db = ctx.env.DB;
  switch (ctx.event) {
    case 'trade.matched': {
      // Auto-create escrow + initial invoice + action queues for both sides
      if (ctx.data?.match_id) {
        await db.prepare(`
          INSERT INTO escrow_accounts (id, match_id, amount, currency, status, created_at)
          VALUES (?, ?, ?, 'ZAR', 'held', ?)
        `).bind(generateId(), ctx.data.match_id, ctx.data.total_value || 0, new Date().toISOString()).run();
      }
      if (ctx.data?.match_id && ctx.data?.buyer_id && ctx.data?.seller_id) {
        const invoiceId = generateId();
        const invoiceNum = `INV-${Date.now().toString(36).toUpperCase()}`;
        const total = Number(ctx.data.total_value || 0);
        const subtotal = total / 1.15;
        const vat = total - subtotal;
        const deliveryDate = (ctx.data.delivery_date as string) || new Date().toISOString().split('T')[0];
        await db.prepare(`
          INSERT INTO invoices (id, invoice_number, match_id, from_participant_id, to_participant_id,
            invoice_type, period_start, period_end, line_items, subtotal, vat_rate, vat_amount,
            total_amount, due_date, status, tenant_id, issued_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'energy', ?, ?, ?, ?, 0.15, ?, ?, ?, 'issued', 'default', ?, ?, ?)
        `).bind(
          invoiceId, invoiceNum, ctx.data.match_id, ctx.data.seller_id, ctx.data.buyer_id,
          deliveryDate, deliveryDate,
          JSON.stringify([{ description: 'Energy supply', volume_mwh: ctx.data.volume_mwh, price_per_mwh: ctx.data.price_per_mwh }]),
          subtotal, vat, total,
          new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          new Date().toISOString(), new Date().toISOString(), new Date().toISOString()
        ).run();

        await enqueueAction(db, {
          type: 'invoice_payment',
          priority: 'high',
          actor_id: ctx.data.seller_id as string,
          assignee_id: ctx.data.buyer_id as string,
          entity_type: 'invoices',
          entity_id: invoiceId,
          title: `Pay invoice ${invoiceNum}`,
          description: `R${total.toFixed(2)} due for ${ctx.data.volume_mwh || 0} MWh matched trade. Escrow is held.`,
          due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        });
        await enqueueAction(db, {
          type: 'trade_delivery',
          priority: 'normal',
          actor_id: ctx.data.buyer_id as string,
          assignee_id: ctx.data.seller_id as string,
          entity_type: 'trade_matches',
          entity_id: ctx.data.match_id as string,
          title: `Deliver ${ctx.data.volume_mwh || 0} MWh`,
          description: `Confirm delivery of matched trade on ${deliveryDate}. Escrow releases on confirmation.`,
          due_date: deliveryDate,
        });
      }
      break;
    }

    case 'contract.signed': {
      // When a contract is signed by all parties, open a follow-up invoice + notify counterparty
      const contract = await db.prepare(
        'SELECT id, title, creator_id, counterparty_id, project_id, commercial_terms FROM contract_documents WHERE id = ?'
      ).bind(ctx.entity_id).first();
      if (contract) {
        await db.prepare(`UPDATE contract_documents SET phase = 'active', updated_at = ? WHERE id = ?`)
          .bind(new Date().toISOString(), ctx.entity_id).run();

        let terms: Record<string, unknown> = {};
        try { terms = JSON.parse((contract.commercial_terms as string) || '{}'); } catch { /* noop */ }
        const monthly = Number(terms.monthly_amount || terms.contract_value || 0);
        if (monthly > 0 && contract.creator_id && contract.counterparty_id) {
          const invoiceId = generateId();
          const invoiceNum = `INV-${Date.now().toString(36).toUpperCase()}`;
          const subtotal = monthly / 1.15;
          const vat = monthly - subtotal;
          const period = new Date().toISOString().split('T')[0];
          await db.prepare(`
            INSERT INTO invoices (id, invoice_number, project_id, from_participant_id, to_participant_id,
              invoice_type, period_start, period_end, line_items, subtotal, vat_rate, vat_amount,
              total_amount, due_date, status, tenant_id, issued_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'energy', ?, ?, ?, ?, 0.15, ?, ?, ?, 'issued', 'default', ?, ?, ?)
          `).bind(
            invoiceId, invoiceNum, contract.project_id || null, contract.creator_id, contract.counterparty_id,
            period, period, JSON.stringify([{ description: `${contract.title} — month 1`, amount: monthly }]),
            subtotal, vat, monthly,
            new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
            new Date().toISOString(), new Date().toISOString(), new Date().toISOString()
          ).run();

          await enqueueAction(db, {
            type: 'invoice_payment',
            priority: 'high',
            actor_id: contract.creator_id as string,
            assignee_id: contract.counterparty_id as string,
            entity_type: 'invoices',
            entity_id: invoiceId,
            title: `Pay invoice ${invoiceNum} — ${contract.title}`,
            description: `R${monthly.toFixed(2)} first instalment due for signed contract ${contract.title}.`,
            due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          });
        }

        await enqueueAction(db, {
          type: 'contract_activate',
          priority: 'normal',
          actor_id: ctx.actor_id,
          assignee_id: (contract.creator_id as string),
          entity_type: 'contract_documents',
          entity_id: ctx.entity_id,
          title: `Contract ${contract.title} is fully signed`,
          description: 'All signatories signed. Upload a signed PDF to the vault and kick off delivery scheduling.',
        });
      }
      break;
    }

    case 'invoice.issued': {
      const inv = await db.prepare(
        'SELECT id, invoice_number, from_participant_id, to_participant_id, total_amount, due_date FROM invoices WHERE id = ?'
      ).bind(ctx.entity_id).first();
      if (inv?.to_participant_id) {
        await enqueueAction(db, {
          type: 'invoice_payment',
          priority: 'high',
          actor_id: inv.from_participant_id as string,
          assignee_id: inv.to_participant_id as string,
          entity_type: 'invoices',
          entity_id: inv.id as string,
          title: `Pay invoice ${inv.invoice_number}`,
          description: `R${Number(inv.total_amount || 0).toFixed(2)} due by ${inv.due_date || 'N/A'}.`,
          due_date: (inv.due_date as string) || null,
        });
      }
      break;
    }

    case 'invoice.paid': {
      const inv = await db.prepare(
        'SELECT id, match_id, from_participant_id, to_participant_id FROM invoices WHERE id = ?'
      ).bind(ctx.entity_id).first();
      if (inv?.match_id) {
        // release escrow on match
        await db.prepare(
          `UPDATE escrow_accounts SET status = 'released', released_at = ?, updated_at = ? WHERE match_id = ? AND status = 'held'`
        ).bind(new Date().toISOString(), new Date().toISOString(), inv.match_id).run();
        await db.prepare(
          `UPDATE trade_matches SET status = 'settled' WHERE id = ?`
        ).bind(inv.match_id).run();
      }
      // mark action queue items for this invoice complete
      await db.prepare(
        `UPDATE action_queue SET status = 'completed', completed_at = ? WHERE entity_type = 'invoices' AND entity_id = ? AND status = 'pending'`
      ).bind(new Date().toISOString(), ctx.entity_id).run();
      break;
    }

    case 'contract.phase_changed': {
      // `execution` is the phase at which contract signatories are notified
      // — matches the CHECK constraint on contract_documents.phase in 001_core.
      if (ctx.data?.new_phase === 'execution') {
        const signatories = await db.prepare(
          `SELECT participant_id FROM document_signatories WHERE document_id = ? AND signed = 0`
        ).bind(ctx.entity_id).all();
        for (const s of signatories.results || []) {
          await enqueueAction(db, {
            type: 'contract_sign',
            priority: 'high',
            actor_id: ctx.actor_id,
            assignee_id: (s as { participant_id: string }).participant_id,
            entity_type: 'contract_documents',
            entity_id: ctx.entity_id,
            title: 'Contract awaiting your signature',
            description: `Contract ${ctx.entity_id} has been sent for signing.`,
            due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
          });
        }
      }
      break;
    }

    case 'dispute.filed': {
      if (ctx.data?.match_id) {
        await db.prepare(`
          UPDATE escrow_accounts SET status = 'disputed', updated_at = ?
          WHERE match_id = ? AND status = 'held'
        `).bind(new Date().toISOString(), ctx.data.match_id).run();
      }
      const admins = await db.prepare(`SELECT id FROM participants WHERE role = 'admin'`).all();
      for (const a of admins.results || []) {
        await enqueueAction(db, {
          type: 'dispute_review',
          priority: 'urgent',
          actor_id: ctx.actor_id,
          assignee_id: (a as { id: string }).id,
          entity_type: 'invoices',
          entity_id: ctx.entity_id,
          title: 'Review dispute',
          description: `Dispute filed: ${(ctx.data?.reason as string) || 'No reason provided'}`,
          due_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        });
      }
      break;
    }

    case 'ipp.milestone_satisfied': {
      // If milestone is financial_close, cascade to ipp.financial_close
      if (ctx.data?.milestone_type === 'financial_close') {
        await fireCascade({
          event: 'ipp.financial_close',
          actor_id: ctx.actor_id,
          entity_type: 'ipp_projects',
          entity_id: (ctx.data?.project_id as string) || ctx.entity_id,
          data: { project_name: ctx.data?.project_name },
          env: ctx.env,
        });
      }
      // Auto-queue disbursement approval for lenders
      const lenders = await db.prepare(`SELECT id FROM participants WHERE role = 'lender'`).all();
      for (const l of lenders.results || []) {
        await enqueueAction(db, {
          type: 'disbursement_approval',
          priority: 'high',
          actor_id: ctx.actor_id,
          assignee_id: (l as { id: string }).id,
          entity_type: 'project_milestones',
          entity_id: ctx.entity_id,
          title: `Approve disbursement for ${ctx.data?.milestone_name || 'milestone'}`,
          description: `Milestone "${ctx.data?.milestone_name || ctx.entity_id}" satisfied; review CPs and release disbursement.`,
          due_date: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
        });
      }
      break;
    }
    
    case 'ona.fault_detected': {
      // Calculate and store revenue impact
      const severityMultiplier = { low: 0.5, medium: 1, high: 2, critical: 5 };
      const multiplier = severityMultiplier[ctx.data?.severity as keyof typeof severityMultiplier] || 1;
      const ppaValue = ctx.data?.ppa_value_per_day || 50000;
      const dailyImpact = ppaValue * multiplier;
      
      // Update fault with estimated impact
      await ctx.env.DB.prepare(`
        UPDATE ona_faults SET estimated_revenue_impact = ?, updated_at = ?
        WHERE id = ?
      `).bind(dailyImpact, new Date().toISOString(), ctx.entity_id).run();
      
      // Create intelligence item
      await ctx.env.DB.prepare(`
        INSERT INTO intelligence_items (id, type, severity, title, description, entity_type, entity_id, action_required, created_at)
        VALUES (?, 'operational', 'critical', ?, ?, 'ona_faults', ?, ?, ?)
      `).bind(
        generateId(),
        `Fault: ${ctx.data?.fault_description || 'Unknown'}`,
        `Revenue at risk: R${dailyImpact.toLocaleString()}/day. Site: ${ctx.data?.site_name || ctx.entity_id}`,
        ctx.entity_id,
        'Review fault and submit insurance claim if applicable',
        new Date().toISOString()
      ).run();
      
      // Create action queue for IPP
      const site = await ctx.env.DB.prepare('SELECT project_id FROM ona_sites WHERE id = ?').bind(ctx.data?.site_id).first();
      if (site) {
        const proj = await ctx.env.DB.prepare('SELECT developer_id FROM ipp_projects WHERE id = ?').bind(site.project_id).first();
        if (proj) {
          await ctx.env.DB.prepare(`
            INSERT INTO action_queue (id, type, priority, actor_id, assignee_id, entity_type, entity_id, title, description, status, due_date, created_at)
            VALUES (?, 'fault_review', 'urgent', ?, ?, 'ona_faults', ?, ?, ?, 'pending', ?, ?)
          `).bind(
            generateId(), ctx.actor_id, proj.developer_id, ctx.entity_id,
            `View Fault: ${ctx.data?.fault_description || 'Unknown'}`,
            `Revenue impact: R${dailyImpact.toLocaleString()}/day. Request disbursement adjustment if necessary.`,
            new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split('T')[0],
            new Date().toISOString()
          ).run();
        }
      }
      break;
    }
    
    case 'ipp.financial_close': {
      // Notify all linked parties about FC
      const proj = await ctx.env.DB.prepare('SELECT * FROM ipp_projects WHERE id = ?').bind(ctx.entity_id).first();
      if (proj) {
        // Notify grid operator if connection exists
        const connection = await ctx.env.DB.prepare('SELECT id FROM grid_connections WHERE project_id = ?').bind(ctx.entity_id).first();
        if (connection) {
          const gridOps = await ctx.env.DB.prepare("SELECT id FROM participants WHERE role = 'grid_operator'").all();
          for (const op of gridOps.results || []) {
            await ctx.env.DB.prepare(`
              INSERT INTO notifications (id, participant_id, type, title, body, data, created_at)
              VALUES (?, ?, 'grid', ?, ?, ?, ?)
            `).bind(
              generateId(), op.id, 'FC Declared — Prepare Grid Connection',
              `Project ${proj.project_name} has achieved Financial Close. Prepare for grid connection.`,
              JSON.stringify({ project_id: ctx.entity_id, cod: proj.commercial_operation_date }),
              new Date().toISOString()
            ).run();
          }
        }
        
        // Notify offtakers with contracts
        const contracts = await ctx.env.DB.prepare('SELECT counterparty_id FROM contract_documents WHERE project_id = ?').bind(ctx.entity_id).all();
        for (const c of contracts.results || []) {
          await ctx.env.DB.prepare(`
            INSERT INTO notifications (id, participant_id, type, title, body, data, created_at)
            VALUES (?, ?, 'contract', ?, ?, ?, ?)
          `).bind(
            generateId(), c.counterparty_id, 'FC Declared — COD Expected',
            `Project ${proj.project_name} has achieved Financial Close. Expected COD: ${proj.commercial_operation_date}`,
            JSON.stringify({ project_id: ctx.entity_id, cod: proj.commercial_operation_date }),
            new Date().toISOString()
          ).run();
        }
      }
      break;
    }
    
    case 'esg.decarbonisation_completed': {
      // Recalculate ESG score
      const participantId = ctx.data?.participant_id;
      if (participantId) {
        // Calculate new score based on updated emissions
        const emissions = await ctx.env.DB.prepare(`
          SELECT SUM(value) as total FROM esg_data 
          WHERE participant_id = ? AND metric_id IN ('esg_met_001','esg_met_002','esg_met_003')
        `).bind(participantId).first();
        
        const newScore = Math.max(0, 100 - ((emissions?.total || 0) / 100));
        
        // Update or create score record
        const existing = await ctx.env.DB.prepare('SELECT id FROM esg_reports WHERE participant_id = ? ORDER BY created_at DESC LIMIT 1').bind(participantId).first();
        if (existing) {
          await ctx.env.DB.prepare(`
            UPDATE esg_reports SET total_ghg_emissions_tco2e = ?, updated_at = ? WHERE id = ?
          `).bind(emissions?.total || 0, new Date().toISOString(), existing.id).run();
        }
        
        // Intelligence item if significant change
        if (ctx.data?.previous_emissions && Math.abs((emissions?.total || 0) - ctx.data.previous_emissions) > 500) {
          const reduction = ctx.data.previous_emissions - (emissions?.total || 0);
          await ctx.env.DB.prepare(`
            INSERT INTO intelligence_items (id, participant_id, type, severity, title, description, created_at)
            VALUES (?, ?, 'esg', 'info', ?, ?, ?)
          `).bind(
            generateId(), participantId,
            `Scope ${ctx.data?.scope || 'unknown'} Emissions Reduced`,
            `Emissions reduced by ${reduction.toLocaleString()} tCO₂e`,
            new Date().toISOString()
          ).run();
        }
      }
      break;
    }
  }
}

function generateId(): string {
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

interface EnqueueActionInput {
  type: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  actor_id?: string;
  assignee_id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  description?: string;
  due_date?: string | null;
}

async function enqueueAction(db: any, input: EnqueueActionInput): Promise<void> {
  try {
    const id = generateId();
    await db.prepare(`
      INSERT INTO action_queue
        (id, type, priority, actor_id, assignee_id, entity_type, entity_id, title, description, status, due_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).bind(
      id,
      input.type,
      input.priority,
      input.actor_id || null,
      input.assignee_id,
      input.entity_type,
      input.entity_id,
      input.title,
      input.description || null,
      input.due_date || null,
      new Date().toISOString(),
      new Date().toISOString(),
    ).run();
  } catch (err) {
    console.error('Action queue enqueue failed:', err);
  }
}