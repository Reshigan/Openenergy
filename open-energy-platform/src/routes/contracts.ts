// ═══════════════════════════════════════════════════════════════════════════
// Contracts Routes — Create, Read, Update, Delete contract documents
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { assertSameTenantParticipant, getTenantId } from '../utils/tenant';
import { withLock, LockBusyError } from '../utils/locks';

const contracts = new Hono<HonoEnv>();

// Apply auth middleware to all routes
contracts.use('*', authMiddleware);

// GET /contracts/templates — list SA-law contract templates available to use
contracts.get('/templates', async (c) => {
  const category = c.req.query('category');
  const documentType = c.req.query('document_type');
  const filters: string[] = ['published = 1'];
  const bindings: unknown[] = [];
  if (category) { filters.push('category = ?'); bindings.push(category); }
  if (documentType) { filters.push('document_type = ?'); bindings.push(documentType); }
  const rs = await c.env.DB.prepare(
    `SELECT id, code, name, category, document_type, description, jurisdiction,
            governing_law, sa_law_references, version
     FROM contract_templates WHERE ${filters.join(' AND ')} ORDER BY category, name`,
  ).bind(...bindings).all();
  return c.json({ success: true, data: rs.results || [] });
});

// GET /contracts/templates/:code — full template with body + variables
contracts.get('/templates/:code', async (c) => {
  const code = c.req.param('code');
  const tpl = await c.env.DB.prepare(
    `SELECT * FROM contract_templates WHERE code = ? AND published = 1`,
  ).bind(code).first();
  if (!tpl) return c.json({ success: false, error: 'Template not found' }, 404);
  return c.json({ success: true, data: tpl });
});

// GET /contracts — List contracts for user
contracts.get('/', async (c) => {
  const user = getCurrentUser(c);
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20'), 100);
  const offset = (page - 1) * pageSize;

  const query = `
    SELECT cd.*,
           creator.name as creator_name,
           counterparty.name as counterparty_name
    FROM contract_documents cd
    LEFT JOIN participants creator ON cd.creator_id = creator.id
    LEFT JOIN participants counterparty ON cd.counterparty_id = counterparty.id
    WHERE (cd.creator_id = ? OR cd.counterparty_id = ?)
    ORDER BY cd.created_at DESC LIMIT ? OFFSET ?
  `;
  const params = [user.id, user.id, pageSize, offset];

  const result = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({
    success: true,
    data: result.results || [],
    pagination: {
      page,
      pageSize,
      total: result.results?.length || 0,
      totalPages: 1,
    },
  });
});

// GET /contracts/:id — Get single contract
contracts.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const contract = await c.env.DB.prepare(`
    SELECT cd.*,
           creator.name as creator_name,
           counterparty.name as counterparty_name
    FROM contract_documents cd
    LEFT JOIN participants creator ON cd.creator_id = creator.id
    LEFT JOIN participants counterparty ON cd.counterparty_id = counterparty.id
    WHERE cd.id = ?
    AND (cd.creator_id = ? OR cd.counterparty_id = ?)
  `).bind(id, user.id, user.id).first();

  if (!contract) {
    return c.json({ success: false, error: 'Contract not found' }, 404);
  }

  return c.json({ success: true, data: contract });
});

// GET /contracts/:id/rendered — full contract document: template body with
// commercial_terms variables interpolated, signatory roster, phase timeline.
// Used by the Contract Detail page to render the full legal text + sign flow.
contracts.get('/:id/rendered', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const contract = await c.env.DB.prepare(`
    SELECT cd.*,
           creator.name as creator_name,
           creator.company_name as creator_company,
           counterparty.name as counterparty_name,
           counterparty.company_name as counterparty_company
    FROM contract_documents cd
    LEFT JOIN participants creator ON cd.creator_id = creator.id
    LEFT JOIN participants counterparty ON cd.counterparty_id = counterparty.id
    WHERE cd.id = ?
    AND (cd.creator_id = ? OR cd.counterparty_id = ?)
  `).bind(id, user.id, user.id).first();

  if (!contract) {
    return c.json({ success: false, error: 'Contract not found' }, 404);
  }

  let commercialTerms: Record<string, unknown> = {};
  if (contract.commercial_terms && typeof contract.commercial_terms === 'string') {
    try { commercialTerms = JSON.parse(contract.commercial_terms) as Record<string, unknown>; } catch { commercialTerms = {}; }
  }

  let template: Record<string, unknown> | null = null;
  const templateCode = (commercialTerms.template_code as string | undefined)
    || inferTemplateCodeFromDocumentType(contract.document_type as string);
  if (templateCode) {
    template = await c.env.DB.prepare(
      `SELECT id, code, name, category, document_type, description, jurisdiction,
              governing_law, sa_law_references, template_body, variables_json, version
       FROM contract_templates WHERE code = ? AND published = 1`,
    ).bind(templateCode).first() as Record<string, unknown> | null;
  }

  // Merge defaults from template + commercial terms + party data for interpolation
  const vars: Record<string, string> = {
    seller_name: (contract.creator_company as string) || (contract.creator_name as string) || 'Seller',
    seller_reg: (commercialTerms.seller_reg as string) || '____________',
    buyer_name: (contract.counterparty_company as string) || (contract.counterparty_name as string) || 'Buyer',
    buyer_reg: (commercialTerms.buyer_reg as string) || '____________',
    contract_volume_mwh: String(commercialTerms.volume_mwh ?? '_____'),
    energy_type: String(commercialTerms.energy_type ?? 'renewable'),
    project_name: (contract.title as string) || 'Project',
    location: String(commercialTerms.location ?? 'South Africa'),
    tenor_years: String(commercialTerms.tenor_years ?? '20'),
    price_per_mwh: String(commercialTerms.price_per_mwh ?? '_____'),
    escalation_pct: String(commercialTerms.escalation ?? '4.5'),
    carbon_share: String(commercialTerms.carbon_share ?? '0'),
    effective_date: (contract.created_at as string || '').slice(0, 10),
  };
  // Add every commercial_terms key as a variable fallback
  for (const [k, v] of Object.entries(commercialTerms)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      vars[k] = String(v);
    }
  }

  let renderedBody = '';
  if (template && typeof template.template_body === 'string') {
    renderedBody = interpolateTemplate(template.template_body, vars);
  } else {
    renderedBody = defaultContractBody(contract, vars);
  }

  const signatories = await c.env.DB.prepare(
    `SELECT ds.id, ds.document_id, ds.participant_id, ds.signatory_name,
            ds.signatory_designation, ds.signed, ds.signed_at,
            ds.signature_r2_key, ds.document_hash_at_signing,
            p.name as participant_name, p.company_name as participant_company
     FROM document_signatories ds
     LEFT JOIN participants p ON ds.participant_id = p.id
     WHERE ds.document_id = ?
     ORDER BY ds.created_at ASC`,
  ).bind(id).all();

  return c.json({
    success: true,
    data: {
      contract,
      template,
      commercial_terms: commercialTerms,
      rendered_body: renderedBody,
      signatories: signatories.results || [],
      current_user_id: user.id,
      can_sign: (contract.creator_id === user.id) || (contract.counterparty_id === user.id),
    },
  });
});

function interpolateTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v !== undefined && v !== '' ? v : `{{${key}}}`;
  });
}

function inferTemplateCodeFromDocumentType(documentType: string): string | null {
  const map: Record<string, string> = {
    ppa_wheeling: 'PPA-WHEEL-SA',
    ppa_btm: 'PPA-BTM-SA',
    loi: 'LOI-SA',
    term_sheet: 'TERM-SHEET-SA',
    nda: 'NDA-SA',
    carbon_purchase: 'ERPA-SA',
    wheeling_agreement: 'PPA-WHEEL-SA',
    offtake_agreement: 'DIRECT-SUPPLY-SA',
    epc: 'EPC-SA',
    hoa: 'HOA-SA',
  };
  return map[documentType] ?? null;
}

function defaultContractBody(contract: Record<string, unknown>, vars: Record<string, string>): string {
  return `# ${contract.title}\n\n` +
    `**Document type:** ${contract.document_type}\n\n` +
    `**Parties:** ${vars.seller_name} ("Seller") and ${vars.buyer_name} ("Buyer").\n\n` +
    `**Project:** ${vars.project_name} — ${vars.location}\n\n` +
    `**Commercial terms:**\n` +
    `- Volume: ${vars.contract_volume_mwh} MWh / annum\n` +
    `- Price: ZAR ${vars.price_per_mwh}/MWh\n` +
    `- Escalation: ${vars.escalation_pct}% per annum\n` +
    `- Tenor: ${vars.tenor_years} years\n\n` +
    `**Governing law:** Laws of the Republic of South Africa. Disputes referred to arbitration under AFSA Rules in Johannesburg.\n\n` +
    `**Signed** at ____________ on this ____ day of ________ 20__.`;
}

// GET /contracts/:id/file — Full contract file aggregator.
//
// A contract document is the holder for everything that orbits a single
// agreement: the rendered legal text + signatories, phase/lifecycle history,
// commercial terms, settlement (invoices, payments, disputes), metering
// (delivered vs contracted), variations / liquidated damages, linked
// project / LOIs / O&M sites, and compliance (covenants on the project,
// environmental authorisations, counterparty KYC). The aggregator returns
// every section in one payload so ContractDetail can render as a tabbed
// container like Esums or ProjectDetail.
//
// Section conventions match /projects/:id/file:
//   - Each section is an object on the response with arrays of rows.
//   - Missing tables / missing FKs return [] (safeAll wrapper).
//   - Per-table row cap is 50.
contracts.get('/:id/file', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const contract = await c.env.DB.prepare(`
    SELECT cd.*,
           creator.name as creator_name,
           creator.company_name as creator_company,
           counterparty.name as counterparty_name,
           counterparty.company_name as counterparty_company
    FROM contract_documents cd
    LEFT JOIN participants creator ON cd.creator_id = creator.id
    LEFT JOIN participants counterparty ON cd.counterparty_id = counterparty.id
    WHERE cd.id = ?
      AND (cd.creator_id = ? OR cd.counterparty_id = ?
           OR ? IN ('admin','support','regulator','lender','grid_operator'))
  `).bind(id, user.id, user.id, user.role).first<any>();

  if (!contract) {
    return c.json({ success: false, error: 'Contract not found' }, 404);
  }

  const safeAll = async <T = any>(sql: string, params: unknown[]): Promise<T[]> =>
    c.env.DB.prepare(sql).bind(...params).all<T>().then(r => (r.results || []) as T[]).catch(() => [] as T[]);
  const safeFirst = async <T = any>(sql: string, params: unknown[]): Promise<T | null> =>
    c.env.DB.prepare(sql).bind(...params).first<T>().catch(() => null);

  // ── Commercial terms (parse JSON; merge template defaults for rendering) ──
  let commercialTerms: Record<string, unknown> = {};
  if (contract.commercial_terms && typeof contract.commercial_terms === 'string') {
    try { commercialTerms = JSON.parse(contract.commercial_terms) as Record<string, unknown>; } catch { commercialTerms = {}; }
  }

  // ── Template + rendered body ──────────────────────────────────────────
  const templateCode = (commercialTerms.template_code as string | undefined)
    || inferTemplateCodeFromDocumentType(contract.document_type as string);
  let template: Record<string, unknown> | null = null;
  if (templateCode) {
    template = await safeFirst<Record<string, unknown>>(
      `SELECT id, code, name, category, document_type, description, jurisdiction,
              governing_law, sa_law_references, template_body, variables_json, version
       FROM contract_templates WHERE code = ? AND published = 1`,
      [templateCode],
    );
  }
  const vars: Record<string, string> = {
    seller_name: (contract.creator_company as string) || (contract.creator_name as string) || 'Seller',
    seller_reg: (commercialTerms.seller_reg as string) || '____________',
    buyer_name: (contract.counterparty_company as string) || (contract.counterparty_name as string) || 'Buyer',
    buyer_reg: (commercialTerms.buyer_reg as string) || '____________',
    contract_volume_mwh: String(commercialTerms.volume_mwh ?? '_____'),
    energy_type: String(commercialTerms.energy_type ?? 'renewable'),
    project_name: (contract.title as string) || 'Project',
    location: String(commercialTerms.location ?? 'South Africa'),
    tenor_years: String(commercialTerms.tenor_years ?? '20'),
    price_per_mwh: String(commercialTerms.price_per_mwh ?? '_____'),
    escalation_pct: String(commercialTerms.escalation ?? '4.5'),
    carbon_share: String(commercialTerms.carbon_share ?? '0'),
    effective_date: (contract.created_at as string || '').slice(0, 10),
  };
  for (const [k, v] of Object.entries(commercialTerms)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      vars[k] = String(v);
    }
  }
  let renderedBody = '';
  if (template && typeof template.template_body === 'string') {
    renderedBody = interpolateTemplate(template.template_body, vars);
  } else {
    renderedBody = defaultContractBody(contract, vars);
  }

  // ── Signatories + statutory checks ────────────────────────────────────
  const [signatories, statutoryChecks] = await Promise.all([
    safeAll(
      `SELECT ds.*, p.name as participant_name, p.company_name as participant_company
       FROM document_signatories ds
       LEFT JOIN participants p ON ds.participant_id = p.id
       WHERE ds.document_id = ?
       ORDER BY ds.created_at ASC LIMIT 50`,
      [id],
    ),
    safeAll(
      `SELECT * FROM statutory_checks WHERE document_id = ? ORDER BY created_at DESC LIMIT 50`,
      [id],
    ),
  ]);

  // ── Linked project (if any) + LOIs that resolved into this contract ───
  const projectId = (contract.project_id as string | undefined) || null;
  const [linkedProject, sourceLois, linkedOmSites] = await Promise.all([
    projectId
      ? safeFirst<Record<string, unknown>>(
          `SELECT p.*, dev.name as developer_name
           FROM ipp_projects p
           LEFT JOIN participants dev ON p.developer_id = dev.id
           WHERE p.id = ?`,
          [projectId],
        )
      : Promise.resolve(null),
    safeAll(
      `SELECT * FROM loi_drafts WHERE resulting_contract_document_id = ? ORDER BY resolved_at DESC LIMIT 20`,
      [id],
    ),
    safeAll(`SELECT * FROM om_sites WHERE ppa_id = ? ORDER BY name LIMIT 10`, [id]),
  ]);

  // ── Variations & liquidated damages (via epc_contracts.contract_document_id) ─
  const [epcContracts, epcVariations, epcLDs] = await Promise.all([
    safeAll(
      `SELECT * FROM epc_contracts WHERE contract_document_id = ? ORDER BY commissioning_date DESC LIMIT 5`,
      [id],
    ),
    safeAll(
      `SELECT v.* FROM epc_variations v
       INNER JOIN epc_contracts e ON e.id = v.epc_contract_id
       WHERE e.contract_document_id = ?
       ORDER BY v.raised_at DESC LIMIT 50`,
      [id],
    ),
    safeAll(
      `SELECT l.* FROM epc_liquidated_damages l
       INNER JOIN epc_contracts e ON e.id = l.epc_contract_id
       WHERE e.contract_document_id = ?
       ORDER BY l.event_date DESC LIMIT 50`,
      [id],
    ),
  ]);

  // ── Settlement & invoicing ────────────────────────────────────────────
  // contract_documents has no direct invoice link; invoices ride on
  // project_id for PPA-style contracts. settlement_dlq is the only table
  // that stores contract_id directly.
  const [invoices, payments, disputes, dlqEntries, settlementRunEvents] = await Promise.all([
    projectId
      ? safeAll(
          `SELECT * FROM invoices WHERE project_id = ? ORDER BY COALESCE(issued_at, created_at) DESC LIMIT 50`,
          [projectId],
        )
      : Promise.resolve([]),
    projectId
      ? safeAll(
          `SELECT pm.* FROM payments pm
           INNER JOIN invoices inv ON inv.id = pm.invoice_id
           WHERE inv.project_id = ?
           ORDER BY pm.payment_date DESC LIMIT 50`,
          [projectId],
        )
      : Promise.resolve([]),
    projectId
      ? safeAll(
          `SELECT d.* FROM settlement_disputes d
           INNER JOIN invoices inv ON inv.id = d.invoice_id
           WHERE inv.project_id = ?
           ORDER BY d.created_at DESC LIMIT 50`,
          [projectId],
        )
      : Promise.resolve([]),
    safeAll(
      `SELECT * FROM settlement_dlq WHERE contract_id = ? ORDER BY created_at DESC LIMIT 20`,
      [id],
    ),
    safeAll(
      `SELECT * FROM settlement_run_events WHERE entity_type = 'contract_documents' AND entity_id = ? ORDER BY created_at DESC LIMIT 30`,
      [id],
    ),
  ]);

  // ── Metering & delivery ──────────────────────────────────────────────
  // Pull metering_readings_daily for any grid connection that lives on the
  // linked project; nominations + delivery schedule for trade-based legs.
  const [meteringDaily, nominations, deliverySchedule] = await Promise.all([
    projectId
      ? safeAll(
          `SELECT mrd.* FROM metering_readings_daily mrd
           INNER JOIN grid_connections gc ON gc.id = mrd.connection_id
           WHERE gc.project_id = ?
           ORDER BY mrd.reading_date DESC LIMIT 90`,
          [projectId],
        )
      : Promise.resolve([]),
    projectId
      ? safeAll(
          `SELECT * FROM ipp_nominations WHERE project_id = ? ORDER BY delivery_date DESC LIMIT 30`,
          [projectId],
        )
      : Promise.resolve([]),
    safeAll(
      `SELECT ds.* FROM delivery_schedule ds
       INNER JOIN trade_matches tm ON tm.id = ds.match_id
       INNER JOIN invoices inv ON inv.match_id = tm.id
       WHERE inv.project_id = ?
       ORDER BY ds.scheduled_date DESC LIMIT 30`,
      [projectId || ''],
    ),
  ]);

  // ── Compliance (covenants + env auth + counterparty KYC) ─────────────
  const counterpartyId = (contract.counterparty_id as string | undefined) || null;
  const creatorId = (contract.creator_id as string | undefined) || null;
  const [covenants, envAuths, kycScreenings, kycRiskScores] = await Promise.all([
    projectId
      ? safeAll(
          `SELECT * FROM covenants WHERE project_id = ? ORDER BY status, covenant_code LIMIT 50`,
          [projectId],
        )
      : Promise.resolve([]),
    projectId
      ? safeAll(
          `SELECT * FROM environmental_authorisations WHERE project_id = ? ORDER BY COALESCE(decision_date, applied_date, created_at) DESC LIMIT 20`,
          [projectId],
        )
      : Promise.resolve([]),
    counterpartyId
      ? safeAll(
          `SELECT * FROM oe_kyc_screenings WHERE participant_id IN (?, ?) ORDER BY created_at DESC LIMIT 20`,
          [counterpartyId, creatorId || counterpartyId],
        )
      : Promise.resolve([]),
    counterpartyId
      ? safeAll(
          `SELECT * FROM oe_kyc_risk_scores WHERE participant_id IN (?, ?) ORDER BY scored_at DESC LIMIT 10`,
          [counterpartyId, creatorId || counterpartyId],
        )
      : Promise.resolve([]),
  ]);

  // ── Audit chain (tamper-evident events keyed to this contract) ────────
  const [auditEvents, auditLogs] = await Promise.all([
    safeAll(
      `SELECT * FROM audit_events WHERE entity_type = 'contract_documents' AND entity_id = ? ORDER BY sequence_no DESC LIMIT 50`,
      [id],
    ),
    safeAll(
      `SELECT al.*, p.name as actor_name FROM audit_logs al
       LEFT JOIN participants p ON p.id = al.actor_id
       WHERE al.entity_type = 'contract_documents' AND al.entity_id = ?
       ORDER BY al.created_at DESC LIMIT 50`,
      [id],
    ),
  ]);

  // ── Summary counts (drive tab badges + hero KPIs) ────────────────────
  const sigSigned = (signatories as Array<{ signed?: number | boolean }>).filter((s) => Boolean(s.signed)).length;
  const sigTotal = signatories.length;
  const invoicesPaid = (invoices as Array<{ status?: string }>).filter((i) => i.status === 'paid').length;
  const invoicesOutstanding = (invoices as Array<{ status?: string }>).filter((i) => i.status === 'issued' || i.status === 'overdue').length;
  const covenantsBreached = (covenants as Array<{ status?: string }>).filter((c) => c.status === 'breached').length;
  const covenantsActive = (covenants as Array<{ status?: string }>).filter((c) => c.status === 'active').length;
  const variationsApproved = (epcVariations as Array<{ status?: string }>).filter((v) => v.status === 'approved').length;
  const ldsTotal = (epcLDs as Array<{ capped_amount_zar?: number }>).reduce(
    (s, l) => s + (Number(l.capped_amount_zar) || 0),
    0,
  );

  // ── AI inline assists ────────────────────────────────────────────────
  type Suggest = { key: string; tab: string; title: string; why: string; confidence?: number; accept?: { label: string; href: string } };
  const suggestions: Suggest[] = [];
  if (sigTotal > 0 && sigSigned < sigTotal) {
    suggestions.push({
      key: 'signatories_pending',
      tab: 'document',
      title: `Awaiting ${sigTotal - sigSigned} signature${sigTotal - sigSigned === 1 ? '' : 's'}`,
      why: 'Contract phase cannot advance to "signed" until every signatory has executed. Chase the outstanding parties; the audit chain records each event.',
      confidence: 0.92,
      accept: { label: 'Open document tab', href: `/contracts/${id}?tab=document` },
    });
  }
  if (statutoryChecks.length === 0) {
    suggestions.push({
      key: 'no_statutory_checks',
      tab: 'compliance',
      title: 'No statutory checks logged',
      why: 'POPIA s.18 notice, B-BBEE verification, and NERSA disclosure should each have a check row before exchange of signed counterparts.',
      confidence: 0.78,
      accept: { label: 'Open compliance tab', href: `/contracts/${id}?tab=compliance` },
    });
  }
  if (covenantsBreached > 0) {
    suggestions.push({
      key: 'project_covenants_breached',
      tab: 'compliance',
      title: `${covenantsBreached} covenant${covenantsBreached === 1 ? '' : 's'} breached on linked project`,
      why: 'Counterparty risk: any breach on the project finance side can trigger acceleration which crystallises this PPA.',
      confidence: 0.88,
      accept: { label: 'Review compliance tab', href: `/contracts/${id}?tab=compliance` },
    });
  }
  if (invoicesOutstanding > 0) {
    suggestions.push({
      key: 'invoices_outstanding',
      tab: 'settlement',
      title: `${invoicesOutstanding} invoice${invoicesOutstanding === 1 ? '' : 's'} outstanding`,
      why: 'Outstanding settlement invoices breach the payment covenant if older than the contract\'s payment terms (typically 30 days).',
      confidence: 0.85,
      accept: { label: 'Open settlement tab', href: `/contracts/${id}?tab=settlement` },
    });
  }
  if ((auditEvents as Array<unknown>).length === 0) {
    suggestions.push({
      key: 'no_audit_chain',
      tab: 'audit',
      title: 'No tamper-evident audit events yet',
      why: 'Every contract phase transition and signature should emit a chained event. Empty chain suggests this contract was created before the chain was wired or events have not been replayed.',
      confidence: 0.6,
      accept: { label: 'Open audit tab', href: `/contracts/${id}?tab=audit` },
    });
  }

  return c.json({
    success: true,
    data: {
      contract,
      phase: contract.phase || 'draft',
      summary: {
        signatories_total: sigTotal,
        signatories_signed: sigSigned,
        statutory_checks: statutoryChecks.length,
        variations_total: epcVariations.length,
        variations_approved: variationsApproved,
        liquidated_damages_total_zar: ldsTotal,
        invoices_total: invoices.length,
        invoices_paid: invoicesPaid,
        invoices_outstanding: invoicesOutstanding,
        payments_total: payments.length,
        disputes_total: disputes.length,
        metering_days: meteringDaily.length,
        nominations_total: nominations.length,
        covenants_active: covenantsActive,
        covenants_breached: covenantsBreached,
        env_authorisations_total: envAuths.length,
        kyc_screenings_total: kycScreenings.length,
        linked_om_sites: linkedOmSites.length,
        source_lois: sourceLois.length,
        audit_events: auditEvents.length,
      },
      document: {
        signatories,
        statutory_checks: statutoryChecks,
        template,
        rendered_body: renderedBody,
        can_sign: (contract.creator_id === user.id) || (contract.counterparty_id === user.id),
        current_user_id: user.id,
      },
      commercial: {
        terms: commercialTerms,
        template_code: templateCode,
      },
      settlement: {
        invoices,
        payments,
        disputes,
        dlq: dlqEntries,
        run_events: settlementRunEvents,
      },
      metering: {
        daily_readings: meteringDaily,
        nominations,
        delivery_schedule: deliverySchedule,
      },
      variations: {
        epc_contracts: epcContracts,
        epc_variations: epcVariations,
        epc_liquidated_damages: epcLDs,
      },
      linked: {
        project: linkedProject,
        source_lois: sourceLois,
        om_sites: linkedOmSites,
      },
      compliance: {
        covenants,
        env_authorisations: envAuths,
        kyc_screenings: kycScreenings,
        kyc_risk_scores: kycRiskScores,
      },
      audit: {
        events: auditEvents,
        logs: auditLogs,
      },
      ai_suggestions: suggestions,
    },
  });
});

// POST /contracts — Create new contract
contracts.post('/', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json();

  const {
    title, phase, contract_type,
    counterparty_id, project_id, commercial_terms
  } = body;

  if (!title || !phase || !contract_type) {
    return c.json({ success: false, error: 'Title, phase, and contract_type are required' }, 400);
  }

  // Validate contract_type against the schema's CHECK constraint up-front
  // so the UI gets a clear 400 instead of a 500 from D1.
  const allowedDocumentTypes = new Set([
    'loi','term_sheet','hoa',
    'ppa_wheeling','ppa_btm',
    'carbon_purchase','carbon_option_isda',
    'forward','epc',
    'wheeling_agreement','offtake_agreement','nda',
  ]);
  if (!allowedDocumentTypes.has(contract_type)) {
    return c.json({
      success: false,
      error: 'invalid_contract_type',
      detail: `contract_type must be one of: ${[...allowedDocumentTypes].join(', ')}`,
    }, 400);
  }

  // Validate phase too (CHECK in schema: draft|loi|term_sheet|hoa|legal_review|execution|active|amended|terminated|expired)
  const allowedPhases = new Set([
    'draft','loi','term_sheet','hoa','legal_review','execution','active','amended','terminated','expired',
  ]);
  if (!allowedPhases.has(phase)) {
    return c.json({
      success: false,
      error: 'invalid_phase',
      detail: `phase must be one of: ${[...allowedPhases].join(', ')}`,
    }, 400);
  }

  if (counterparty_id && counterparty_id !== user.id) {
    await assertSameTenantParticipant(c, counterparty_id);
  }

  const contractId = 'ct_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const termsJson = commercial_terms ? JSON.stringify(commercial_terms) : null;

  const tenantId = getTenantId(c);

  await c.env.DB.prepare(`
    INSERT INTO contract_documents (
      id, title, document_type, phase, creator_id, counterparty_id, project_id, commercial_terms, tenant_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    contractId, title, contract_type, phase, user.id, counterparty_id || user.id, project_id || null, termsJson, tenantId, new Date().toISOString(), new Date().toISOString()
  ).run();

  const contract = await c.env.DB.prepare('SELECT * FROM contract_documents WHERE id = ?').bind(contractId).first();

  await fireCascade({
    event: 'contract.created',
    actor_id: user.id,
    entity_type: 'contract_documents',
    entity_id: contractId,
    data: { title, phase, contract_type, counterparty_id },
    env: c.env,
  });

  return c.json({ success: true, data: contract }, 201);
});

// POST /contracts/:id/signatories — add/register a signatory slot (creator only)
contracts.post('/:id/signatories', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const { participant_id, signatory_name, signatory_designation } = await c.req.json();

  const existing = await c.env.DB.prepare('SELECT creator_id FROM contract_documents WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ success: false, error: 'Contract not found' }, 404);
  if (existing.creator_id !== user.id) return c.json({ success: false, error: 'Not authorized' }, 403);

  if (participant_id && participant_id !== user.id) {
    await assertSameTenantParticipant(c, participant_id);
  }

  const sigId = 'sig_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  await c.env.DB.prepare(`
    INSERT INTO document_signatories (id, document_id, participant_id, signatory_name, signatory_designation, signed, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).bind(sigId, id, participant_id, signatory_name || null, signatory_designation || null, new Date().toISOString()).run();

  return c.json({ success: true, data: { id: sigId } }, 201);
});

// POST /contracts/:id/phase — move contract through phases (fires contract.phase_changed)
contracts.post('/:id/phase', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const { phase } = await c.req.json();

  const existing = await c.env.DB.prepare('SELECT creator_id, counterparty_id, phase FROM contract_documents WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ success: false, error: 'Contract not found' }, 404);
  if (existing.creator_id !== user.id && existing.counterparty_id !== user.id) return c.json({ success: false, error: 'Not authorized' }, 403);
  if (!phase) return c.json({ success: false, error: 'phase is required' }, 400);

  const previous_phase = existing.phase;
  await c.env.DB.prepare('UPDATE contract_documents SET phase = ?, updated_at = ? WHERE id = ?')
    .bind(phase, new Date().toISOString(), id).run();

  await fireCascade({
    event: 'contract.phase_changed',
    actor_id: user.id,
    entity_type: 'contract_documents',
    entity_id: id,
    data: { new_phase: phase, previous_phase },
    env: c.env,
  });

  return c.json({ success: true, data: { id, phase } });
});

// POST /contracts/:id/sign — current user signs the document; fires contract.signed if all signed.
// Serialized per contract via an advisory lock so two signatories who race on the
// "last sign" don't both evaluate allSigned=true and fire the cascade twice.
contracts.post('/:id/sign', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const { signature_r2_key, document_hash } = await c.req.json().catch(() => ({}));

  try {
    const data = await withLock(
      c.env,
      `contract:sign:${id}`,
      user.id,
      async () => {
        const contract = await c.env.DB.prepare(
          'SELECT id, creator_id, counterparty_id FROM contract_documents WHERE id = ?',
        )
          .bind(id)
          .first();
        if (!contract) throw new LockBusyError('__not_found__');

        const signatory = await c.env.DB.prepare(
          'SELECT id, signed FROM document_signatories WHERE document_id = ? AND participant_id = ?',
        )
          .bind(id, user.id)
          .first<{ id: string; signed: number }>();
        if (!signatory) throw new LockBusyError('__not_signatory__');
        if (signatory.signed) throw new LockBusyError('__already_signed__');

        await c.env.DB.prepare(
          `UPDATE document_signatories
              SET signed = 1, signed_at = ?, signature_r2_key = ?, document_hash_at_signing = ?
            WHERE id = ?`,
        )
          .bind(
            new Date().toISOString(),
            signature_r2_key || null,
            document_hash || null,
            signatory.id,
          )
          .run();

        const pending = await c.env.DB.prepare(
          'SELECT COUNT(*) as count FROM document_signatories WHERE document_id = ? AND signed = 0',
        )
          .bind(id)
          .first<{ count: number }>();
        const allSigned = !pending?.count || pending.count === 0;

        if (allSigned) {
          await fireCascade({
            event: 'contract.signed',
            actor_id: user.id,
            entity_type: 'contract_documents',
            entity_id: id,
            data: { signed_by: user.id },
            env: c.env,
          });
        }

        return { signed_by: user.id, all_signed: allSigned };
      },
      { ttlSeconds: 15, context: { contract_id: id } },
    );

    return c.json({ success: true, data });
  } catch (err) {
    if (err instanceof LockBusyError) {
      // LockBusyError is raised both by the withLock helper when the advisory
      // lock is taken AND from inside the handler to carry structured
      // validation failures — we distinguish via err.key (the raw key),
      // not err.message (which is prefixed with "lock busy: " by the ctor).
      switch (err.key) {
        case '__not_found__':
          return c.json({ success: false, error: 'Contract not found' }, 404);
        case '__not_signatory__':
          return c.json({ success: false, error: 'Not listed as a signatory on this contract' }, 403);
        case '__already_signed__':
          return c.json({ success: false, error: 'Already signed' }, 400);
        default:
          return c.json({ success: false, error: 'Another signature is in progress — retry in a moment' }, 409);
      }
    }
    throw err;
  }
});

// PUT /contracts/:id — Update contract
contracts.put('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await c.env.DB.prepare('SELECT creator_id FROM contract_documents WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ success: false, error: 'Contract not found' }, 404);
  }
  if (existing.creator_id !== user.id) {
    return c.json({ success: false, error: 'Not authorized to update this contract' }, 403);
  }

  const { title, phase, contract_type, commercial_terms } = body;
  const termsJson = commercial_terms ? JSON.stringify(commercial_terms) : null;

  // D1 rejects `undefined` bindings — partial PATCH-style updates leave
  // most of these unset, so coerce each to null. The COALESCE(?, col) on
  // each column preserves the existing value when null is passed.
  //
  // `contract_documents` does not have `description` or `status` columns
  // (it's a phase-driven model, not a free-text description / status one),
  // so they're not part of the writable set.
  await c.env.DB.prepare(`
    UPDATE contract_documents SET
      title = COALESCE(?, title),
      phase = COALESCE(?, phase),
      document_type = COALESCE(?, document_type),
      commercial_terms = COALESCE(?, commercial_terms),
      updated_at = ?
    WHERE id = ?
  `).bind(
    title ?? null,
    phase ?? null,
    contract_type ?? null,
    termsJson,
    new Date().toISOString(),
    id,
  ).run();

  const contract = await c.env.DB.prepare('SELECT * FROM contract_documents WHERE id = ?').bind(id).first();

  await fireCascade({
    event: 'contract.amended',
    actor_id: user.id,
    entity_type: 'contract_documents',
    entity_id: id,
    data: { fields: Object.keys(body) },
    env: c.env,
  });

  return c.json({ success: true, data: contract });
});

// DELETE /contracts/:id — Delete contract. Fire cascade BEFORE the delete so the
// cascade resolver can still look up the counterparty, and also carry them in
// `data` as a belt-and-braces fallback.
contracts.delete('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare(
    'SELECT creator_id, counterparty_id, title FROM contract_documents WHERE id = ?',
  ).bind(id).first();
  if (!existing) {
    return c.json({ success: false, error: 'Contract not found' }, 404);
  }
  if (existing.creator_id !== user.id) {
    return c.json({ success: false, error: 'Not authorized to delete this contract' }, 403);
  }

  await fireCascade({
    event: 'contract.terminated',
    actor_id: user.id,
    entity_type: 'contract_documents',
    entity_id: id,
    data: {
      counterparty_id: existing.counterparty_id,
      creator_id: existing.creator_id,
      title: existing.title,
      reason: 'deleted_by_creator',
    },
    env: c.env,
  });

  await c.env.DB.prepare('DELETE FROM contract_documents WHERE id = ?').bind(id).run();

  return c.json({ success: true, data: { message: 'Contract deleted' } });
});

export default contracts;
