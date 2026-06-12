// ════════════════════════════════════════════════════════════════════════
// PDF — /api/pdf
//
// Generates branded PDFs on demand.  Each endpoint returns application/pdf
// directly, or { success, data: { r2_key } } when ?persist=1.
//
// GET /api/pdf/invoice/:id
// GET /api/pdf/carbon-cert/:retirement_id
// GET /api/pdf/covenant-report/:facility_id   [?period=YYYY-MM]
// GET /api/pdf/work-order/:wo_id
// GET /api/pdf/stage-gate/:gate_id
// GET /api/pdf/settlement/:run_id
// GET /api/pdf/audit-export                   [?limit=&since=&entity_type=&persist=1]
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import {
  buildInvoicePdf, type InvoiceData,
  buildCarbonCertPdf, type CarbonCertData,
  buildCovenantReportPdf, type CovenantTestReportData,
  buildWorkOrderPdf, type WorkOrderData,
  buildStageGatePdf, type StageGateData,
  buildSettlementSummaryPdf, type SettlementSummaryData,
  buildAuditExportPdf, type AuditExportData,
} from '../utils/pdf-brand';

const pdf = new Hono<HonoEnv>();
pdf.use('*', authMiddleware);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

async function persistToR2(
  env: HonoEnv['Bindings'],
  bytes: Uint8Array,
  docType: string,
  entityType: string,
  entityId: string,
  actorId: string,
): Promise<string> {
  const r2Key = `generated/${docType}/${entityId}/${Date.now()}.pdf`;
  await (env as any).OE_VAULT.put(r2Key, bytes, {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: {
      entity_type: entityType,
      entity_id: entityId,
      actor_id: actorId,
      generated_at: new Date().toISOString(),
    },
  }).catch(() => {});

  await (env as any).DB.prepare(
    `INSERT OR IGNORE INTO generated_documents (id, doc_type, entity_type, entity_id, r2_key, generated_by, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), docType, entityType, entityId,
    r2Key, actorId, new Date().toISOString(),
  ).run().catch(() => {});

  return r2Key;
}

// ─── Invoice ──────────────────────────────────────────────────────────────────

pdf.get('/invoice/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const inv = await c.env.DB.prepare(`
    SELECT i.*, fp.name as from_name, tp.name as to_name, p.name as project_name
    FROM invoices i
    LEFT JOIN participants fp ON fp.id = i.from_participant_id
    LEFT JOIN participants tp ON tp.id = i.to_participant_id
    LEFT JOIN ipp_projects  p  ON p.id  = i.project_id
    WHERE i.id = ?
      AND (i.from_participant_id = ? OR i.to_participant_id = ? OR ? IN ('admin','regulator'))
  `).bind(id, user.id, user.id, user.role).first<any>();

  if (!inv) return c.json({ success: false, error: 'Invoice not found' }, 404);

  let lineItems: any[] = [];
  try { lineItems = JSON.parse(inv.line_items ?? '[]'); } catch {}

  const data: InvoiceData = {
    invoice_number: inv.invoice_number,
    invoice_type:   inv.invoice_type,
    from_name:      inv.from_name ?? 'Unknown',
    to_name:        inv.to_name ?? 'Unknown',
    period_start:   inv.period_start,
    period_end:     inv.period_end,
    due_date:       inv.due_date,
    created_at:     inv.created_at,
    status:         inv.status,
    line_items:     lineItems,
    subtotal:       Number(inv.subtotal ?? 0),
    vat_rate:       Number(inv.vat_rate ?? 0.15),
    vat_amount:     Number(inv.vat_amount ?? 0),
    total_amount:   Number(inv.total_amount ?? 0),
    currency:       inv.currency ?? 'ZAR',
    project_name:   inv.project_name,
  };

  const bytes = await buildInvoicePdf(data);

  if (c.req.query('persist') === '1') {
    const key = await persistToR2(c.env, bytes, 'invoice', 'invoices', id, user.id);
    return c.json({ success: true, data: { r2_key: key } });
  }

  return pdfResponse(bytes, `OE-Invoice-${inv.invoice_number ?? id.slice(-8).toUpperCase()}`);
});

// ─── Carbon Retirement Certificate ───────────────────────────────────────────

pdf.get('/carbon-cert/:retirement_id', async (c) => {
  const user = getCurrentUser(c);
  const retId = c.req.param('retirement_id');

  const row = await c.env.DB.prepare(`
    SELECT cr.*, cc.registry, cc.methodology, cc.vintage, cc.credit_type,
           p.project_name, part.name as owner_name
    FROM carbon_retirements cr
    JOIN carbon_credits cc ON cc.id = cr.credit_id
    LEFT JOIN carbon_projects  p    ON p.id    = cc.project_id
    LEFT JOIN participants     part ON part.id  = cc.owner_id
    WHERE cr.id = ?
      AND (cc.owner_id = ? OR ? IN ('admin','regulator','carbon_fund'))
  `).bind(retId, user.id, user.role).first<any>();

  if (!row) return c.json({ success: false, error: 'Retirement not found' }, 404);

  const data: CarbonCertData = {
    retirement_id:   retId,
    certificate_ref: row.certificate_ref,
    owner_name:      row.owner_name ?? 'Unknown',
    beneficiary:     row.beneficiary ?? 'Undisclosed',
    project_name:    row.project_name ?? 'Carbon Project',
    registry:        row.registry ?? 'Unknown',
    methodology:     row.methodology ?? 'Unknown',
    vintage:         row.vintage,
    quantity:        Number(row.quantity),
    standard:        row.standard ?? row.registry ?? 'Voluntary',
    scope:           row.scope ?? 'Scope 1',
    reason:          row.reason ?? 'Voluntary cancellation',
    retired_at:      row.retired_at,
    value_zar:       row.value_zar ? Number(row.value_zar) : undefined,
  };

  const bytes = await buildCarbonCertPdf(data);

  if (c.req.query('persist') === '1') {
    const key = await persistToR2(c.env, bytes, 'carbon_cert', 'carbon_retirements', retId, user.id);
    return c.json({ success: true, data: { r2_key: key } });
  }

  return pdfResponse(bytes, `OE-CarbonCert-${retId.slice(-8).toUpperCase()}`);
});

// ─── Covenant Test Report ─────────────────────────────────────────────────────

pdf.get('/covenant-report/:facility_id', async (c) => {
  const user = getCurrentUser(c);
  const facId = c.req.param('facility_id');
  const period = c.req.query('period');

  const facility = await c.env.DB.prepare(`
    SELECT cf.*, p.project_name, part.name as borrower_name, lpart.name as lender_name
    FROM credit_facility_applications cf
    LEFT JOIN ipp_projects  p     ON p.id    = cf.project_id
    LEFT JOIN participants  part  ON part.id = cf.applicant_id
    LEFT JOIN participants  lpart ON lpart.id = cf.reviewer_id
    WHERE cf.id = ?
      AND (cf.applicant_id = ? OR cf.reviewer_id = ? OR ? IN ('admin','regulator'))
  `).bind(facId, user.id, user.id, user.role).first<any>();

  if (!facility) return c.json({ success: false, error: 'Facility not found' }, 404);

  const covSQL = period
    ? `SELECT c.*, t.measured_value, t.result, t.test_period, t.notes as test_notes
       FROM covenants c
       LEFT JOIN covenant_tests t ON t.covenant_id = c.id AND t.test_period = ?
       WHERE c.project_id = ? ORDER BY c.covenant_code`
    : `SELECT c.*, t.measured_value, t.result, t.test_period, t.notes as test_notes
       FROM covenants c
       LEFT JOIN covenant_tests t ON t.covenant_id = c.id
         AND t.test_period = (SELECT MAX(t2.test_period) FROM covenant_tests t2 WHERE t2.covenant_id = c.id)
       WHERE c.project_id = ? ORDER BY c.covenant_code`;

  const covenants = await c.env.DB.prepare(covSQL)
    .bind(...(period ? [period, facility.project_id ?? facId] : [facility.project_id ?? facId]))
    .all<any>()
    .then(r => r.results ?? [])
    .catch(() => [] as any[]);

  const overallResult = covenants.some((r: any) => r.result === 'breach') ? 'breach'
    : covenants.some((r: any) => r.result === 'warn') ? 'warn' : 'pass';

  const data: CovenantTestReportData = {
    facility_ref:   facId.slice(-10).toUpperCase(),
    borrower_name:  facility.borrower_name ?? 'Unknown',
    lender_name:    facility.lender_name,
    test_period:    period ?? (covenants[0] as any)?.test_period ?? 'Latest',
    dscr:           facility.dscr ? Number(facility.dscr) : undefined,
    covenants: covenants.map((r: any) => ({
      code:           r.covenant_code ?? '—',
      name:           r.covenant_name ?? '—',
      type:           r.covenant_type ?? 'financial',
      operator:       r.operator ?? '≥',
      threshold:      Number(r.threshold ?? 0),
      measured_value: r.measured_value != null ? Number(r.measured_value) : undefined,
      result:         r.result as any,
      notes:          r.test_notes,
    })),
    overall_result: overallResult as any,
    prepared_by:    'Consolidated Energy Cockpit',
  };

  const bytes = await buildCovenantReportPdf(data);

  if (c.req.query('persist') === '1') {
    const key = await persistToR2(c.env, bytes, 'covenant_report', 'credit_facility_applications', facId, user.id);
    return c.json({ success: true, data: { r2_key: key } });
  }

  return pdfResponse(bytes, `OE-CovenantReport-${facId.slice(-8).toUpperCase()}`);
});

// ─── Work Order ───────────────────────────────────────────────────────────────

pdf.get('/work-order/:wo_id', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support', 'ipp_developer', 'regulator'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const woId = c.req.param('wo_id');

  const wo = await c.env.DB.prepare(`
    SELECT w.*, s.site_name, d.asset_name, d.asset_type
    FROM om_work_orders w
    LEFT JOIN om_sites   s ON s.id = w.site_id
    LEFT JOIN om_devices d ON d.id = w.device_id
    WHERE w.id = ?
      AND (s.participant_id = ? OR s.om_contractor_id = ? OR ? IN ('admin','support','regulator'))
  `).bind(woId, user.id, user.id, user.role).first<any>();

  if (!wo) return c.json({ success: false, error: 'Work order not found' }, 404);

  let partsUsed: any[] = [];
  try { partsUsed = JSON.parse(wo.parts_used ?? '[]'); } catch {}

  const data: WorkOrderData = {
    wo_ref:           wo.wo_ref ?? wo.id.slice(-8).toUpperCase(),
    site_name:        wo.site_name ?? 'Unknown Site',
    asset_name:       wo.asset_name,
    asset_type:       wo.asset_type,
    priority:         wo.priority ?? 'P3',
    wo_type:          wo.wo_type ?? 'corrective',
    description:      wo.description,
    technician:       wo.technician,
    created_at:       wo.created_at,
    scheduled_date:   wo.scheduled_date,
    completed_at:     wo.completed_at,
    duration_h:       wo.duration_h ? Number(wo.duration_h) : undefined,
    parts_used:       partsUsed,
    status:           wo.chain_status ?? wo.status ?? 'open',
    sla_met:          wo.sla_met == null ? undefined : Boolean(wo.sla_met),
    parts_cost_zar:   wo.parts_cost_zar ? Number(wo.parts_cost_zar) : undefined,
    labour_cost_zar:  wo.labour_cost_zar ? Number(wo.labour_cost_zar) : undefined,
    total_cost_zar:   wo.total_cost_zar ? Number(wo.total_cost_zar) : undefined,
    resolution_notes: wo.resolution_notes,
  };

  const bytes = await buildWorkOrderPdf(data);

  if (c.req.query('persist') === '1') {
    const key = await persistToR2(c.env, bytes, 'work_order', 'om_work_orders', woId, user.id);
    return c.json({ success: true, data: { r2_key: key } });
  }

  return pdfResponse(bytes, `OE-WO-${data.wo_ref}`);
});

// ─── Stage Gate ───────────────────────────────────────────────────────────────

pdf.get('/stage-gate/:gate_id', async (c) => {
  const user = getCurrentUser(c);
  const gateId = c.req.param('gate_id');

  let gateRow: any = await c.env.DB.prepare(`
    SELECT g.*, p.project_name, dev.name as developer_name, off.name as officer_name
    FROM oe_ipp_stage_gates g
    LEFT JOIN ipp_projects  p   ON p.id   = g.project_id
    LEFT JOIN participants  dev ON dev.id = p.developer_id
    LEFT JOIN participants  off ON off.id = g.officer_id
    WHERE g.id = ?
      AND (p.developer_id = ? OR ? IN ('admin','regulator','lender'))
  `).bind(gateId, user.id, user.role).first<any>().catch(() => null);

  if (!gateRow) {
    gateRow = await c.env.DB.prepare(`
      SELECT c.*, p.project_name, dev.name as developer_name
      FROM ipp_cod_chain c
      LEFT JOIN ipp_projects  p   ON p.id   = c.project_id
      LEFT JOIN participants  dev ON dev.id = p.developer_id
      WHERE c.id = ?
        AND (p.developer_id = ? OR ? IN ('admin','regulator','lender'))
    `).bind(gateId, user.id, user.role).first<any>().catch(() => null);
  }

  if (!gateRow) return c.json({ success: false, error: 'Stage gate not found' }, 404);

  let conditions: string[] = [];
  let rejections: string[] = [];
  try {
    const flags = JSON.parse(gateRow.flags_json ?? '{}');
    conditions = flags.conditions ?? [];
    rejections = flags.rejections ?? [];
  } catch {}

  const statusRaw: string = gateRow.decision ?? gateRow.chain_status ?? '';
  const decision = statusRaw === 'approved' ? 'approved' : statusRaw === 'rejected' ? 'rejected' : 'pending';

  const data: StageGateData = {
    gate_ref:       gateId.slice(-10).toUpperCase(),
    gate_name:      gateRow.gate_name ?? (statusRaw.replace(/_/g, ' ').toUpperCase() || 'Stage Gate'),
    project_name:   gateRow.project_name ?? '—',
    developer_name: gateRow.developer_name ?? '—',
    decision,
    decision_date:  gateRow.decision_at,
    submitted_at:   gateRow.submitted_at ?? gateRow.created_at,
    officer_name:   gateRow.officer_name,
    conditions,
    rejections,
    next_gate:      gateRow.next_gate,
  };

  const bytes = await buildStageGatePdf(data);

  if (c.req.query('persist') === '1') {
    await persistToR2(c.env, bytes, 'stage_gate', 'ipp_stage_gates', gateId, user.id);
  }

  return pdfResponse(bytes, `OE-StageGate-${data.gate_ref}`);
});

// ─── Settlement Summary ───────────────────────────────────────────────────────

pdf.get('/settlement/:run_id', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'trader', 'regulator'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const runId = c.req.param('run_id');

  const run = await c.env.DB.prepare(`SELECT * FROM oe_settlement_runs WHERE id = ?`)
    .bind(runId).first<any>().catch(() => null);

  const invoices = await c.env.DB.prepare(`
    SELECT i.total_amount, i.status, i.from_participant_id,
           fp.name as from_name, fp.role as from_role
    FROM invoices i
    LEFT JOIN participants fp ON fp.id = i.from_participant_id
    WHERE i.settlement_run_id = ?
      AND (i.from_participant_id = ? OR i.to_participant_id = ? OR ? IN ('admin','regulator'))
    ORDER BY i.created_at DESC LIMIT 200
  `).bind(runId, user.id, user.id, user.role).all<any>().then(r => r.results ?? []).catch(() => [] as any[]);

  const participantMap = new Map<string, SettlementSummaryData['participants'][0]>();
  for (const inv of invoices) {
    const key = inv.from_participant_id;
    const amt = Number(inv.total_amount ?? 0);
    const existing = participantMap.get(key);
    if (existing) {
      existing.net_amount_zar += amt;
    } else {
      participantMap.set(key, {
        name: inv.from_name ?? 'Unknown',
        role: inv.from_role ?? 'participant',
        gross_bought_mwh: 0,
        gross_sold_mwh: 0,
        net_position_mwh: 0,
        net_amount_zar: amt,
        status: inv.status,
      });
    }
  }

  const totalGmv = invoices.reduce((s: number, i: any) => s + Number(i.total_amount ?? 0), 0);

  const data: SettlementSummaryData = {
    period:           run?.period ?? new Date().toISOString().slice(0, 10),
    run_ref:          (run?.id ?? runId).slice(-10).toUpperCase(),
    participants:     Array.from(participantMap.values()),
    total_volume_mwh: run?.total_volume_mwh ? Number(run.total_volume_mwh) : invoices.length,
    total_gmv_zar:    totalGmv,
    run_at:           run?.created_at ?? new Date().toISOString(),
  };

  const bytes = await buildSettlementSummaryPdf(data);
  return pdfResponse(bytes, `OE-Settlement-${data.run_ref}`);
});

// ─── Audit Export ─────────────────────────────────────────────────────────────

pdf.get('/audit-export', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'regulator'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const limit = Math.min(500, Number(c.req.query('limit') ?? 100));
  const since = c.req.query('since');
  const entityType = c.req.query('entity_type');

  const where: string[] = [];
  const binds: unknown[] = [];
  if (since) { where.push('ab.timestamp >= ?'); binds.push(since); }
  if (entityType) { where.push('ab.entity_type = ?'); binds.push(entityType); }

  const blocks = await c.env.DB.prepare(`
    SELECT ab.*, p.name as actor_name
    FROM audit_blocks ab
    LEFT JOIN participants p ON p.id = ab.actor_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ab.seq ASC LIMIT ?
  `).bind(...binds, limit).all<any>().then(r => r.results ?? []).catch(() => [] as any[]);

  const exportRef = `NERSA-${Date.now().toString(36).toUpperCase()}`;

  const data: AuditExportData = {
    export_ref:      exportRef,
    period_label:    since ? `From ${since}` : `Last ${limit} blocks`,
    entity_count:    new Set(blocks.map((b: any) => b.entity_id)).size,
    block_count:     blocks.length,
    chain_integrity: blocks.length > 0 ? 'verified' : 'pending',
    generated_by:    user.email ?? 'Platform Admin',
    generated_at:    new Date().toISOString(),
    blocks: blocks.map((b: any) => ({
      seq:         b.seq,
      actor:       b.actor_name ?? b.actor_id,
      entity_type: b.entity_type,
      action:      b.action,
      hash:        b.hash,
      timestamp:   b.timestamp,
    })),
  };

  const bytes = await buildAuditExportPdf(data);

  if (c.req.query('persist') === '1') {
    await persistToR2(c.env, bytes, 'audit_export', 'audit_blocks', 'bulk', user.id);
  }

  return pdfResponse(bytes, `OE-AuditExport-${exportRef}`);
});

export default pdf;
