// ═══════════════════════════════════════════════════════════════════════════
// Notification Engine — extracted from cascade.ts.
// Handles: recipient resolution, content building, batch INSERT into
// notifications table, and the KV caches that power recipient resolution.
// CascadeContext is structurally compatible with NotifCtx; callers that
// have a full CascadeContext can pass it directly.
// ═══════════════════════════════════════════════════════════════════════════

interface NotifCtx {
  event: string;
  entity_type: string;
  entity_id: string;
  data?: Record<string, unknown>;
  actor_id?: string;
  env: any;
}

// ── Project-developer KV cache ───────────────────────────────────────────

const PROJECT_DEV_CACHE_PREFIX = 'cascade:project_developer:';
const PROJECT_DEV_TTL_SECONDS = 3600;
const PROJECT_DEV_MISSING = '__missing__';

/**
 * Cached lookup of a project's developer_id. ipp_projects.developer_id is
 * essentially immutable (ownership transfer is a legal event, not a
 * runtime one) so a 1-hour TTL is safe. The cascade resolver calls this
 * for every project-scoped event — EPC variations, insurance claims,
 * environmental compliance, community engagement, ED/SED spend.
 *
 * Cache key: `cascade:project_developer:<project_id>`.
 * Sentinel `__missing__` prevents repeat D1 hits for deleted projects.
 */
export async function cachedProjectDeveloper(
  env: { DB: any; KV: any },
  projectId: string,
): Promise<string | null> {
  const key = PROJECT_DEV_CACHE_PREFIX + projectId;
  try {
    const cached = await env.KV.get(key);
    if (cached === PROJECT_DEV_MISSING) return null;
    if (cached) return cached;
  } catch { /* KV miss → DB */ }
  try {
    const row = await env.DB
      .prepare('SELECT developer_id FROM ipp_projects WHERE id = ?')
      .bind(projectId)
      .first() as { developer_id?: string } | null;
    const dev = row?.developer_id || null;
    try {
      await env.KV.put(key, dev ?? PROJECT_DEV_MISSING, { expirationTtl: PROJECT_DEV_TTL_SECONDS });
    } catch { /* soft */ }
    return dev;
  } catch {
    return null;
  }
}

/** Drop the cached developer_id for a project. Call from the one place that
 *  can change it (admin re-assignment). */
export async function invalidateProjectDeveloperCache(
  env: { KV: { delete: (k: string) => Promise<unknown> } },
  projectId: string,
): Promise<void> {
  try { await env.KV.delete(PROJECT_DEV_CACHE_PREFIX + projectId); } catch { /* soft */ }
}

// ── Role-roster KV cache ─────────────────────────────────────────────────

/**
 * Add every active participant holding any of the listed roles to the
 * recipients set.
 *
 * COST: fireCascade() invokes this once per cascade for the "broadcast to
 * role" recipient groups. On a busy day that's hundreds of calls, each
 * issuing an identical `SELECT id FROM participants WHERE role IN (...)`
 * query that changes only when someone creates / suspends an account.
 *
 * We cache the result per role-group in KV for 60 s. Cache key is the
 * sorted role list joined with `|`. Admin mutations that change a
 * participant's role/status invalidate via `invalidateRoleRosterCache()`.
 */
const ROLE_ROSTER_CACHE_PREFIX = 'cascade:role_roster:';
const ROLE_ROSTER_TTL_SECONDS = 60;

async function addRolesTo(env: any, recipients: Set<string>, roles: string[]): Promise<void> {
  if (roles.length === 0) return;
  const sortedKey = ROLE_ROSTER_CACHE_PREFIX + [...roles].sort().join('|');

  try {
    const cached = await env.KV.get(sortedKey, 'json') as string[] | null;
    if (cached) {
      for (const id of cached) recipients.add(id);
      return;
    }
  } catch { /* KV miss → fall through to D1. */ }

  const placeholders = roles.map(() => '?').join(',');
  try {
    const rows = await env.DB.prepare(
      `SELECT id FROM participants WHERE role IN (${placeholders}) AND status = 'active' LIMIT 50`,
    ).bind(...roles).all();
    const ids = ((rows.results || []) as Array<{ id: string }>).map((r) => r.id);
    for (const id of ids) recipients.add(id);
    try {
      await env.KV.put(sortedKey, JSON.stringify(ids), { expirationTtl: ROLE_ROSTER_TTL_SECONDS });
    } catch { /* soft */ }
  } catch {
    /* swallow — cascade still runs for explicit recipients */
  }
}

/**
 * Drop every role-roster cache entry. The admin UI calls this when a
 * participant's role or status changes. Over-broad by design: there's no
 * cheap way to know which role-lists the participant appears in, so we
 * clear them all. The cache rebuilds naturally within the TTL.
 */
export async function invalidateRoleRosterCache(env: { KV: { list: (opts: { prefix: string }) => Promise<{ keys: Array<{ name: string }> }>; delete: (k: string) => Promise<unknown> } }): Promise<void> {
  try {
    const list = await env.KV.list({ prefix: ROLE_ROSTER_CACHE_PREFIX });
    await Promise.all(list.keys.map((k) => env.KV.delete(k.name).catch(() => null)));
  } catch { /* soft */ }
}

// ── Recipient resolution ─────────────────────────────────────────────────

export async function determineNotificationRecipients(ctx: NotifCtx, env: any): Promise<string[]> {
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
      const dev = await cachedProjectDeveloper(env, ctx.entity_id);
      if (dev) recipients.add(dev);
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
        const dev = await cachedProjectDeveloper(env, fault.project_id);
        if (dev) recipients.add(dev);
        // Notify lenders of DSCR impact
        const lenders = await env.DB.prepare('SELECT investor_participant_id FROM fund_commitments').all();
        lenders.results?.forEach((l: any) => recipients.add(l.investor_participant_id));
        // Notify offtakers
        const contracts = await env.DB.prepare('SELECT counterparty_id FROM contract_documents WHERE project_id = ?').bind(fault.project_id).all();
        contracts.results?.forEach((c: any) => recipients.add(c.counterparty_id));
      }
      break;
    }
    // ─── National-scale recipient resolution ─────────────────────────────
    case 'regulator_licences': {
      try {
        const row = await env.DB
          .prepare('SELECT licensee_participant_id FROM regulator_licences WHERE id = ?')
          .bind(ctx.entity_id).first();
        if (row?.licensee_participant_id) recipients.add(row.licensee_participant_id as string);
      } catch { /* schema missing on older deploys */ }
      await addRolesTo(env, recipients, ['regulator']);
      break;
    }
    case 'regulator_tariff_submissions':
    case 'regulator_tariff_decisions': {
      try {
        const row = await env.DB
          .prepare(`SELECT licensee_participant_id FROM regulator_tariff_submissions WHERE id = ?
                    UNION ALL
                    SELECT s.licensee_participant_id FROM regulator_tariff_decisions d
                      JOIN regulator_tariff_submissions s ON s.id = d.submission_id
                     WHERE d.id = ?`)
          .bind(ctx.entity_id, ctx.entity_id).first();
        if (row?.licensee_participant_id) recipients.add(row.licensee_participant_id as string);
      } catch { /* */ }
      await addRolesTo(env, recipients, ['regulator']);
      break;
    }
    case 'regulator_enforcement_cases':
    case 'regulator_surveillance_alerts': {
      if (ctx.data?.respondent_participant_id) recipients.add(ctx.data.respondent_participant_id as string);
      if (ctx.data?.participant_id) recipients.add(ctx.data.participant_id as string);
      await addRolesTo(env, recipients, ['regulator']);
      break;
    }
    case 'dispatch_instructions': {
      if (ctx.data?.participant_id) recipients.add(ctx.data.participant_id as string);
      await addRolesTo(env, recipients, ['grid_operator']);
      break;
    }
    case 'curtailment_notices':
    case 'grid_outages': {
      // National / zonal — notify all grid operators + IPPs.
      await addRolesTo(env, recipients, ['grid_operator', 'ipp_developer']);
      break;
    }
    case 'ancillary_service_tenders': {
      // Open tenders are broadcast to active generators.
      await addRolesTo(env, recipients, ['ipp_developer', 'grid_operator', 'trader']);
      break;
    }
    case 'margin_calls': {
      if (ctx.data?.participant_id) recipients.add(ctx.data.participant_id as string);
      await addRolesTo(env, recipients, ['admin']);
      break;
    }
    case 'credit_limits': {
      if (ctx.data?.participant_id) recipients.add(ctx.data.participant_id as string);
      break;
    }
    case 'covenants':
    case 'covenant_tests':
    case 'covenant_waivers': {
      // Lender + IPP developer of the linked project.
      if (ctx.data?.lender_participant_id) recipients.add(ctx.data.lender_participant_id as string);
      if (ctx.data?.project_id) {
        const dev = await cachedProjectDeveloper(env, ctx.data.project_id as string);
        if (dev) recipients.add(dev);
      }
      break;
    }
    case 'ie_certifications': {
      if (ctx.data?.ie_participant_id) recipients.add(ctx.data.ie_participant_id as string);
      if (ctx.data?.project_id) {
        const dev = await cachedProjectDeveloper(env, ctx.data.project_id as string);
        if (dev) recipients.add(dev);
      }
      await addRolesTo(env, recipients, ['lender']);
      break;
    }
    case 'epc_contracts':
    case 'epc_variations':
    case 'epc_liquidated_damages':
    case 'environmental_authorisations':
    case 'environmental_compliance':
    case 'insurance_policies':
    case 'insurance_claims':
    case 'community_engagements':
    case 'ed_sed_spend': {
      if (ctx.data?.project_id) {
        const dev = await cachedProjectDeveloper(env, ctx.data.project_id as string);
        if (dev) recipients.add(dev);
      }
      break;
    }
    case 'rec_retirements':
    case 'scope2_disclosures': {
      if (ctx.data?.retiring_participant_id) recipients.add(ctx.data.retiring_participant_id as string);
      if (ctx.data?.participant_id) recipients.add(ctx.data.participant_id as string);
      break;
    }
    case 'mrv_submissions':
    case 'mrv_verifications':
    case 'carbon_tax_offset_claims': {
      if (ctx.data?.submitted_by) recipients.add(ctx.data.submitted_by as string);
      if (ctx.data?.taxpayer_participant_id) recipients.add(ctx.data.taxpayer_participant_id as string);
      await addRolesTo(env, recipients, ['carbon_fund']);
      break;
    }
    case 'tenants':
    case 'tenant_subscriptions':
    case 'tenant_invoices':
    case 'feature_flags': {
      await addRolesTo(env, recipients, ['admin']);
      break;
    }
    default:
      break;
  }

  return Array.from(recipients);
}

// ── Notification content ─────────────────────────────────────────────────

export function buildNotificationContent(ctx: NotifCtx): { title: string; body: string } {
  const eventHandlers: Record<string, () => { title: string; body: string }> = {
    'auth.registered': () => ({ title: 'Welcome to the Consolidated Energy Cockpit', body: 'Your account has been created. Please verify your email.' }),
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

    // ─── National-scale notifications ──────────────────────────────────
    'regulator.licence_suspended': () => ({
      title: 'Licence suspended',
      body: `Licence ${ctx.data?.licence_number || ctx.entity_id} has been suspended by the regulator.`,
    }),
    'regulator.licence_revoked': () => ({
      title: 'Licence revoked',
      body: `Licence ${ctx.data?.licence_number || ctx.entity_id} has been revoked. Operations under this licence must cease immediately.`,
    }),
    'regulator.tariff_determined': () => ({
      title: 'Tariff determination issued',
      body: `Determination ${ctx.data?.decision_number || ''} effective ${ctx.data?.effective_from || 'soon'}.`,
    }),
    'regulator.enforcement_finding': () => ({
      title: 'Enforcement finding issued',
      body: `Case ${ctx.entity_id}: penalty R${ctx.data?.penalty_amount_zar || 0}. See the case file for details.`,
    }),
    'regulator.surveillance_alert_raised': () => ({
      title: `Surveillance alert: ${ctx.data?.rule_code || 'market abuse'}`,
      body: `Severity ${ctx.data?.severity || 'medium'}. Review in the Regulator workbench.`,
    }),
    'regulator.surveillance_escalated': () => ({
      title: 'Alert escalated to enforcement',
      body: `Surveillance alert escalated to formal enforcement case ${ctx.data?.case_id || ''}.`,
    }),

    'grid.instruction_issued': () => ({
      title: `Dispatch instruction: ${ctx.data?.instruction_type || 'action required'}`,
      body: `Target ${ctx.data?.target_mw || 0} MW effective ${ctx.data?.effective_from || 'now'}. Acknowledge in the Grid workbench.`,
    }),
    'grid.instruction_non_compliant': () => ({
      title: 'Dispatch non-compliance flagged',
      body: `Instruction ${ctx.entity_id} assessed non-compliant. Penalty: R${ctx.data?.penalty_amount_zar || 0}.`,
    }),
    'grid.curtailment_issued': () => ({
      title: `Curtailment notice — ${ctx.data?.severity || 'advisory'}`,
      body: `Zone ${ctx.data?.affected_zone || 'national'}: ${ctx.data?.curtailment_mw || 0} MW curtailment in effect.`,
    }),
    'grid.outage_reported': () => ({
      title: 'Grid outage reported',
      body: `Outage ${ctx.data?.outage_number || ctx.entity_id}: ${ctx.data?.affected_load_mw || 0} MW / ${ctx.data?.affected_customers || 0} customers affected.`,
    }),

    'trader.margin_call_issued': () => ({
      title: 'Margin call issued',
      body: `Shortfall R${ctx.data?.shortfall_zar || 0}. Due by ${ctx.data?.due_by || 'end of next business day'}.`,
    }),
    'trader.credit_limit_set': () => ({
      title: 'Trading credit limit updated',
      body: `New limit R${ctx.data?.limit_zar || 0} effective ${ctx.data?.effective_from || 'immediately'}.`,
    }),
    'trader.clearing_run_complete': () => ({
      title: 'Clearing run settled',
      body: `Trading day ${ctx.data?.trading_day || ''}: net R${ctx.data?.total_net_zar || 0} across ${ctx.data?.obligations_count || 0} participants.`,
    }),

    'lender.covenant_breach': () => ({
      title: `Covenant breach: ${ctx.data?.covenant_code || ''}`,
      body: `Measured ${ctx.data?.measured_value ?? 'n/a'} vs threshold ${ctx.data?.threshold ?? 'n/a'}. Material-adverse-effect: ${ctx.data?.material_adverse_effect ? 'YES' : 'no'}.`,
    }),
    'lender.covenant_warn': () => ({
      title: `Covenant warning: ${ctx.data?.covenant_code || ''}`,
      body: `Approaching threshold. Measured ${ctx.data?.measured_value ?? 'n/a'} vs ${ctx.data?.threshold ?? 'n/a'}.`,
    }),
    'lender.covenant_waived': () => ({
      title: 'Covenant waiver granted',
      body: `Waiver for ${ctx.data?.covenant_code || ''} until ${ctx.data?.requested_until || 'further notice'}.`,
    }),
    'lender.ie_certified': () => ({
      title: 'IE certification approved',
      body: `Certificate ${ctx.data?.cert_number || ''}: drawdown of R${ctx.data?.certified_amount_zar || 0} cleared.`,
    }),

    'ipp.ea_condition_breach': () => ({
      title: 'Environmental Authorisation condition breached',
      body: `Condition ${ctx.data?.condition_reference || ''} flagged non-compliant. Compliance and reporting action required.`,
    }),
    'ipp.insurance_expiring': () => ({
      title: 'Insurance policy expiring soon',
      body: `Policy ${ctx.data?.policy_number || ''} expires ${ctx.data?.period_end || 'soon'} — renew to stay covenant-compliant.`,
    }),
    'ipp.ld_assessed': () => ({
      title: 'Liquidated damages assessed',
      body: `R${ctx.data?.capped_amount_zar || ctx.data?.calculated_amount_zar || 0} assessed under EPC ${ctx.data?.epc_contract_id || ''}.`,
    }),

    'offtaker.rec_retired': () => ({
      title: 'RECs retired',
      body: `${ctx.data?.consumption_mwh || 0} MWh retired against ${ctx.data?.retirement_purpose || 'Scope 2'} claim.`,
    }),
    'offtaker.budget_exceeded': () => ({
      title: 'Energy budget exceeded',
      body: `Period ${ctx.data?.period || ''} consumption exceeded budget by ${ctx.data?.variance_pct || 0}%.`,
    }),

    'carbon.mrv_verified': () => ({
      title: 'MRV verification issued',
      body: `Opinion: ${ctx.data?.opinion || 'unknown'}. Verified reductions: ${ctx.data?.verified_reductions_tco2e || 0} tCO₂e.`,
    }),
    'carbon.tax_claim_submitted': () => ({
      title: 'Carbon Tax offset claim submitted',
      body: `Tax year ${ctx.data?.tax_year || ''}: R${ctx.data?.offset_applied_zar || 0} offset applied, net R${ctx.data?.net_tax_liability_zar || 0}.`,
    }),

    'tenant.provisioned': () => ({
      title: 'Tenant provisioned',
      body: `Tenant ${ctx.data?.tenant_id || ctx.entity_id} is active on the ${ctx.data?.tier || 'standard'} plan.`,
    }),
    'tenant.invoice_issued': () => ({
      title: 'Platform invoice issued',
      body: `Invoice ${ctx.data?.invoice_number || ''} — R${ctx.data?.total_zar || 0} due ${ctx.data?.due_at || 'in 30 days'}.`,
    }),
  };

  const handler = eventHandlers[ctx.event];
  return handler ? handler() : { title: ctx.event, body: `Event ${ctx.event} on ${ctx.entity_type}:${ctx.entity_id}` };
}

// ── generateId ───────────────────────────────────────────────────────────

export function generateId(): string {
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// ── Batch notification INSERT ─────────────────────────────────────────────

export async function createNotifications(ctx: NotifCtx, env: any): Promise<void> {
  const recipients = await determineNotificationRecipients(ctx, env);
  if (recipients.length === 0) return;

  // COST: batch every notification INSERT into a single D1 round-trip via
  // env.DB.batch(). Previously this was N round-trips (one per recipient),
  // which on a large-fanout event (e.g. curtailment notice broadcast to
  // every grid operator + IPP developer) could mean 50+ D1 queries for a
  // single domain event.
  const { title, body } = buildNotificationContent(ctx);
  const dataJson = JSON.stringify(ctx.data || {});
  const type = ctx.event.split('.')[0];
  const now = new Date().toISOString();

  const statements = recipients.map((recipient_id) =>
    env.DB.prepare(
      `INSERT INTO notifications (id, participant_id, type, title, body, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      generateId(),
      recipient_id,
      type,
      title,
      body,
      dataJson,
      now,
    ),
  );
  try {
    // D1 batch() runs all statements in a single server round-trip and
    // wraps them in an implicit transaction — atomicity is a bonus.
    await env.DB.batch(statements);
  } catch (err) {
    // If batch() isn't available (older D1 client, test stub) or fails
    // mid-transaction, fall back to per-statement writes so the cascade
    // still delivers as much as possible.
    console.warn('notification_batch_failed', (err as Error).message);
    for (const stmt of statements) {
      try { await stmt.run(); } catch (e) { console.error('Notification creation failed:', e); }
    }
  }
}
