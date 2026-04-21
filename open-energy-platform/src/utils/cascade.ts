// ═══════════════════════════════════════════════════════════════════════════
// Cascade Event System — 35+ Event Types → Notifications + Webhooks + Audit
// ═══════════════════════════════════════════════════════════════════════════

export type EventType =
  // Auth
  | 'auth.registered' | 'auth.login' | 'auth.logout' | 'auth.otp_sent' | 'auth.otp_verified'
  | 'auth.password_reset' | 'auth.module_access_changed'
  // Contract
  | 'contract.created' | 'contract.phase_changed' | 'contract.signed' | 'contract.executed'
  | 'contract.amended' | 'contract.terminated' | 'contract.statutory_check_completed'
  // Trading
  | 'trade.order_placed' | 'trade.matched' | 'trade.settled' | 'trade.cancelled'
  // Escrow
  | 'escrow.created' | 'escrow.released' | 'escrow.refunded' | 'escrow.claimed'
  // Settlement
  | 'invoice.created' | 'invoice.issued' | 'invoice.viewed' | 'invoice.paid' | 'invoice.overdue'
  | 'dispute.filed' | 'dispute.resolved'
  // Carbon
  | 'carbon.traded' | 'carbon.retired' | 'carbon.transferring' | 'carbon.fund_nav_updated'
  | 'carbon.option_exercised' | 'carbon.option_expired'
  // IPP
  | 'ipp.project_created' | 'ipp.milestone_satisfied' | 'ipp.milestone_cp_satisfied'
  | 'ipp.financial_close' | 'ipp.disbursement_requested' | 'ipp.disbursement_approved'
  | 'ipp.performance_reported'
  // ESG
  | 'esg.score_calculated' | 'esg.report_published' | 'esg.decarbonisation_completed'
  // Grid
  | 'grid.connection_created' | 'grid.constraint_active' | 'grid.wheeling_started'
  | 'grid.imbalance_calculated'
  // Ona
  | 'ona.fault_detected' | 'ona.forecast_synced' | 'ona.maintenance_scheduled'
  // General
  | 'demand.matched' | 'marketplace.bid' | 'meter.ingested'
  | 'popia.consent_changed' | 'popia.data_exported' | 'popia.erasure'
  | 'intelligence.item_created' | 'action_queue.created';

interface CascadeContext {
  event: EventType;
  actor_id?: string;
  entity_type: string;
  entity_id: string;
  data?: Record<string, unknown>;
  env: any;
}

export async function fireCascade(ctx: CascadeContext): Promise<void> {
  const { event, actor_id, entity_type, entity_id, data, env } = ctx;
  
  // 1. Create audit log entry
  await createAuditLog(ctx, env);
  
  // 2. Create notification entries for relevant parties
  await createNotifications(ctx, env);
  
  // 3. Trigger webhook delivery (async)
  deliverWebhooks(ctx).catch(console.error);
  
  // 4. Handle special cascade logic
  await handleSpecialCascades(ctx);
}

async function createAuditLog(ctx: CascadeContext, env: any): Promise<void> {
  try {
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
  } catch (err) {
    console.error('Audit log creation failed:', err);
  }
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
      const match = await env.DB.prepare(`
        SELECT tm.buy_participant_id, tm.sell_participant_id 
        FROM trade_matches tm WHERE tm.id = ?
      `).bind(ctx.entity_id).first();
      if (match) {
        recipients.add(match.buy_participant_id);
        recipients.add(match.sell_participant_id);
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
      lenders.results?.forEach((l: any) => recipients.add(l.investment_participant_id));
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
        lenders.results?.forEach((l: any) => recipients.add(l.investment_participant_id));
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
  switch (ctx.event) {
    case 'trade.matched': {
      // Auto-create escrow for matched trade
      if (ctx.data?.match_id) {
        await env.DB.prepare(`
          INSERT INTO escrow_accounts (id, match_id, amount, currency, status, created_at)
          VALUES (?, ?, ?, 'ZAR', 'held', ?)
        `).bind(generateId(), ctx.data.match_id, ctx.data.total_value || 0, new Date().toISOString()).run();
      }
      // Auto-create invoice
      if (ctx.data?.match_id && ctx.data?.buyer_id && ctx.data?.seller_id) {
        const invoiceNum = `INV-${Date.now().toString(36).toUpperCase()}`;
        await env.DB.prepare(`
          INSERT INTO invoices (id, invoice_number, match_id, from_participant_id, to_participant_id, 
            invoice_type, period_start, period_end, line_items, subtotal, vat_rate, vat_amount, 
            total_amount, due_date, status, created_at)
          VALUES (?, ?, ?, ?, ?, 'energy', ?, ?, ?, ?, 0.15, ?, ?, ?, 'issued', ?)
        `).bind(
          generateId(), invoiceNum, ctx.data.match_id, ctx.data.seller_id, ctx.data.buyer_id,
          ctx.data.delivery_date || new Date().toISOString().split('T')[0],
          ctx.data.delivery_date || new Date().toISOString().split('T')[0],
          JSON.stringify([{ description: 'Energy supply', volume_mwh: ctx.data.volume_mwh, price_per_mwh: ctx.data.price_per_mwh }]),
          ctx.data.total_value || 0,
          (ctx.data.total_value || 0) * 0.15,
          (ctx.data.total_value || 0) * 1.15,
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          new Date().toISOString()
        ).run();
      }
      break;
    }
    
    case 'dispute.filed': {
      // Freeze linked escrow
      if (ctx.data?.match_id) {
        await env.DB.prepare(`
          UPDATE escrow_accounts SET status = 'disputed', updated_at = ? 
          WHERE match_id = ? AND status = 'held'
        `).bind(new Date().toISOString(), ctx.data.match_id).run();
      }
      // Create action queue for admin
      await env.DB.prepare(`
        INSERT INTO action_queue (id, type, priority, entity_type, entity_id, title, description, status, created_at)
        VALUES (?, 'review', 'high', 'settlement_disputes', ?, 'Review Dispute', ?, 'pending', ?)
      `).bind(generateId(), ctx.entity_id, `Dispute filed: ${ctx.data?.reason || 'No reason provided'}`, new Date().toISOString()).run();
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