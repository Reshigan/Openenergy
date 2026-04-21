// ═══════════════════════════════════════════════════════════════════════════
// Contracts Routes — Create, Read, Update, Delete contract documents
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

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

// POST /contracts — Create new contract
contracts.post('/', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json();

  const {
    title, description, phase, contract_type,
    counterparty_id, project_id, commercial_terms
  } = body;

  if (!title || !phase || !contract_type) {
    return c.json({ success: false, error: 'Title, phase, and contract_type are required' }, 400);
  }

  const contractId = 'ct_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const termsJson = commercial_terms ? JSON.stringify(commercial_terms) : null;

  await c.env.DB.prepare(`
    INSERT INTO contract_documents (
      id, title, document_type, phase, creator_id, counterparty_id, project_id, commercial_terms, tenant_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'default', ?, ?)
  `).bind(
    contractId, title, contract_type, phase, user.id, counterparty_id || user.id, project_id || null, termsJson, new Date().toISOString(), new Date().toISOString()
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

// POST /contracts/:id/sign — current user signs the document; fires contract.signed if all signed
contracts.post('/:id/sign', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const { signature_r2_key, document_hash } = await c.req.json().catch(() => ({}));

  const contract = await c.env.DB.prepare('SELECT id, creator_id, counterparty_id FROM contract_documents WHERE id = ?').bind(id).first();
  if (!contract) return c.json({ success: false, error: 'Contract not found' }, 404);

  const signatory = await c.env.DB.prepare(
    'SELECT id, signed FROM document_signatories WHERE document_id = ? AND participant_id = ?'
  ).bind(id, user.id).first();
  if (!signatory) return c.json({ success: false, error: 'Not listed as a signatory on this contract' }, 403);
  if (signatory.signed) return c.json({ success: false, error: 'Already signed' }, 400);

  await c.env.DB.prepare(`
    UPDATE document_signatories
    SET signed = 1, signed_at = ?, signature_r2_key = ?, document_hash_at_signing = ?
    WHERE id = ?
  `).bind(
    new Date().toISOString(),
    signature_r2_key || null,
    document_hash || null,
    signatory.id
  ).run();

  const pending = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM document_signatories WHERE document_id = ? AND signed = 0'
  ).bind(id).first();

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

  return c.json({ success: true, data: { signed_by: user.id, all_signed: allSigned } });
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

  const { title, description, phase, contract_type, status, commercial_terms } = body;
  const termsJson = commercial_terms ? JSON.stringify(commercial_terms) : null;

  await c.env.DB.prepare(`
    UPDATE contract_documents SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      phase = COALESCE(?, phase),
      document_type = COALESCE(?, document_type),
      status = COALESCE(?, status),
      commercial_terms = COALESCE(?, commercial_terms),
      updated_at = ?
    WHERE id = ?
  `).bind(title, description, phase, contract_type, status, termsJson, new Date().toISOString(), id).run();

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
