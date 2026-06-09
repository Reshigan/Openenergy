// ════════════════════════════════════════════════════════════════════════
// reports-deep — regulator submission workflow + real XML formats.
//
// The JSON packs produced by 060 (oe_nersa_reports / oe_sars_reports) are
// the figures. This layer:
//   • Renders the canonical XML envelope that NERSA / SARS eFiling expect
//   • Tracks submission state (queued → submitted → acknowledged → accepted)
//   • Handles rejection + resubmission with version chaining
//   • Computes variance vs prior period for the SPA UI
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { requireStepUp } from '../middleware/step-up';
import { fireCascade } from '../utils/cascade';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const adminOnly = (role: string) => ['admin', 'support', 'regulator'].includes(role);

function xmlEscape(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[<>&'"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]!));
}

// ─── XML envelope generators ────────────────────────────────────────────
function renderNersaXml(pack: any): string {
  const totals = pack.totals || {};
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<NERSAQuarterlyReturn xmlns="http://nersa.org.za/schemas/QR/v1">',
    `  <Operator>`,
    `    <LegalName>${xmlEscape(pack.operator)}</LegalName>`,
    `    <NERSALicenceNumber>${xmlEscape(pack.licence_number || 'TBA')}</NERSALicenceNumber>`,
    `  </Operator>`,
    `  <ReportingPeriod year="${pack.period?.year}" quarter="${pack.period?.quarter}" from="${pack.period?.from}" to="${pack.period?.to}"/>`,
    `  <Sections>`,
    `    <Section ref="1" title="Trading volume">`,
    `      <Metric name="total_volume_mwh">${xmlEscape(totals.total_volume_mwh || 0)}</Metric>`,
    `    </Section>`,
    `    <Section ref="2" title="Trading value">`,
    `      <Metric name="total_value_zar">${xmlEscape(totals.total_value_zar || 0)}</Metric>`,
    `    </Section>`,
    `    <Section ref="3" title="Active participants">`,
    `      <Metric name="active_participants">${xmlEscape(totals.active_participants || 0)}</Metric>`,
    `    </Section>`,
    `    <Section ref="4" title="Active licences">`,
    `      <Metric name="active_licences">${xmlEscape(totals.active_licences || 0)}</Metric>`,
    `    </Section>`,
    `    <Section ref="5" title="Grid outages">`,
    `      <Metric name="grid_outages">${xmlEscape(totals.grid_outages || 0)}</Metric>`,
    `    </Section>`,
    `  </Sections>`,
    `  <Methodology><![CDATA[${pack.methodology || ''}]]></Methodology>`,
    `  <GeneratedAt>${xmlEscape(pack.generated_at)}</GeneratedAt>`,
    `</NERSAQuarterlyReturn>`,
  ];
  return lines.join('\n');
}

function renderSarsXml(pack: any): string {
  const f = pack.figures || {};
  if (pack.period.type === 'vat201') {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<VAT201Return xmlns="http://www.sars.gov.za/schemas/efiling/VAT201/v3">',
      `  <Vendor>`,
      `    <Name>${xmlEscape(pack.operator)}</Name>`,
      `    <VATNumber>${xmlEscape(pack.vat_number || 'TBA')}</VATNumber>`,
      `  </Vendor>`,
      `  <Period from="${pack.period.from}" to="${pack.period.to}"/>`,
      `  <Field01_GrossSalesIncl>${xmlEscape((f.gross_taxable_zar || 0).toFixed(2))}</Field01_GrossSalesIncl>`,
      `  <Field04_StandardRateOutputVAT>${xmlEscape((f.output_vat_zar || 0).toFixed(2))}</Field04_StandardRateOutputVAT>`,
      `  <Field13_TotalOutputVAT>${xmlEscape((f.output_vat_zar || 0).toFixed(2))}</Field13_TotalOutputVAT>`,
      `  <Field19_InvoiceCount>${xmlEscape(f.invoice_count || 0)}</Field19_InvoiceCount>`,
      `  <GeneratedAt>${xmlEscape(pack.generated_at)}</GeneratedAt>`,
      `</VAT201Return>`,
    ].join('\n');
  }
  if (pack.period.type === 'irp6') {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<IRP6Return xmlns="http://www.sars.gov.za/schemas/efiling/IRP6/v2">',
      `  <Taxpayer>${xmlEscape(pack.operator)}</Taxpayer>`,
      `  <YearOfAssessment>${xmlEscape(pack.period.label)}</YearOfAssessment>`,
      `  <EstimatedTaxableIncome>${xmlEscape((f.estimated_taxable_income_zar || 0).toFixed(2))}</EstimatedTaxableIncome>`,
      `  <ProvisionalTax>${xmlEscape((f.provisional_tax_zar || 0).toFixed(2))}</ProvisionalTax>`,
      `</IRP6Return>`,
    ].join('\n');
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<CarbonTaxReturn xmlns="http://www.sars.gov.za/schemas/efiling/CTR1/v1">',
    `  <Taxpayer>${xmlEscape(pack.operator)}</Taxpayer>`,
    `  <YearOfAssessment>${xmlEscape(pack.period.label)}</YearOfAssessment>`,
    `  <TotalEmissionsTCO2e>${xmlEscape((f.total_tco2e_retired || 0).toFixed(2))}</TotalEmissionsTCO2e>`,
    `  <CarbonTaxRate>${xmlEscape(f.carbon_tax_rate_per_tco2e || 190)}</CarbonTaxRate>`,
    `  <TotalLiability>${xmlEscape((f.carbon_tax_liability_zar || 0).toFixed(2))}</TotalLiability>`,
    `</CarbonTaxReturn>`,
  ].join('\n');
}

// ─── Render XML for an existing pack ───────────────────────────────────
r.get('/nersa/:id/xml', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT * FROM oe_nersa_reports WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  if (!row.r2_key) return c.json({ success: false, error: 'no pack stored' }, 409);
  const obj = await c.env.R2.get(row.r2_key);
  if (!obj) return c.json({ success: false, error: 'pack missing' }, 404);
  const pack = await obj.json() as any;
  const xml = renderNersaXml(pack);
  return new Response(xml, {
    headers: { 'content-type': 'application/xml', 'content-disposition': `attachment; filename="nersa-${row.year}-Q${row.quarter}.xml"` },
  });
});

r.get('/sars/:id/xml', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT * FROM oe_sars_reports WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  const obj = await c.env.R2.get(row.r2_key);
  if (!obj) return c.json({ success: false, error: 'pack missing' }, 404);
  const pack = await obj.json() as any;
  const xml = renderSarsXml(pack);
  return new Response(xml, {
    headers: { 'content-type': 'application/xml', 'content-disposition': `attachment; filename="sars-${row.period_type}-${row.period_label.replace('/', '-')}.xml"` },
  });
});

// ─── Submission tracking ───────────────────────────────────────────────
r.post('/submissions', requireStepUp('regulator.submit'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.report_kind || !b.report_id || !b.submitted_to) return c.json({ success: false, error: 'report_kind + report_id + submitted_to required' }, 400);

  const ALLOWED_REPORT_KINDS = ['nersa_quarterly', 'sars_carbon_tax'] as const;
  type ReportKind = typeof ALLOWED_REPORT_KINDS[number];
  if (!ALLOWED_REPORT_KINDS.includes(b.report_kind as ReportKind)) {
    return c.json({ success: false, error: 'invalid report_kind' }, 400);
  }

  const id = genId('rsub');
  // Read the underlying pack and produce + archive the XML envelope
  const reportTable = b.report_kind === 'nersa_quarterly' ? 'oe_nersa_reports' : 'oe_sars_reports';
  const rep = await c.env.DB.prepare(`SELECT * FROM ${reportTable} WHERE id = ?`).bind(b.report_id).first<any>();
  if (!rep) return c.json({ success: false, error: 'report not found' }, 404);
  if (!rep.r2_key) return c.json({ success: false, error: 'report not generated yet' }, 409);
  const obj = await c.env.R2.get(rep.r2_key);
  if (!obj) return c.json({ success: false, error: 'pack missing' }, 404);
  const pack = await obj.json() as any;
  const xml = b.report_kind === 'nersa_quarterly' ? renderNersaXml(pack) : renderSarsXml(pack);
  // Sanitize both path segments — strip anything that could traverse bucket paths
  const safeKind = (b.report_kind as string).replace(/[^a-z0-9_]/g, '_');
  const safeId   = (b.report_id   as string).replace(/[^a-z0-9_-]/g, '_');
  const envelopeKey = `submissions/${safeKind}/${safeId}.xml`;
  await c.env.R2.put(envelopeKey, xml, { httpMetadata: { contentType: 'application/xml' } });

  await c.env.DB.prepare(`
    INSERT INTO oe_report_submissions
      (id, report_kind, report_id, submitted_to, submitted_by, submission_envelope_r2_key,
       status, submitted_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(id, b.report_kind, b.report_id, b.submitted_to, user.id, envelopeKey, 'submitted', new Date().toISOString()).run();

  // Mark parent report as submitted
  await c.env.DB.prepare(`UPDATE ${reportTable} SET status = 'submitted', submitted_at = datetime('now') WHERE id = ?`).bind(b.report_id).run();

  await fireCascade({
    event: 'report.submitted_to_regulator',
    actor_id: user.id,
    entity_type: 'report_submission',
    entity_id: id,
    data: {
      id,
      report_kind: b.report_kind,
      report_id: b.report_id,
      submitted_to: b.submitted_to,
      envelope_r2_key: envelopeKey,
      submitted_by: user.id,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, envelope_r2_key: envelopeKey } }, 201);
});

r.post('/submissions/:id/acknowledge', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const newStatus = b.status === 'rejected' ? 'rejected' : (b.status === 'accepted' ? 'accepted' : 'acknowledged');
  await c.env.DB.prepare(`
    UPDATE oe_report_submissions
    SET status = ?, acknowledgment_id = ?, acknowledgment_received_at = datetime('now'),
        rejection_reason = ?
    WHERE id = ?
  `).bind(
    newStatus,
    b.acknowledgment_id || null,
    b.rejection_reason || null,
    id,
  ).run();
  await fireCascade({
    event: 'report.submission_acknowledged',
    actor_id: user.id,
    entity_type: 'report_submission',
    entity_id: String(id),
    data: {
      id, status: newStatus,
      acknowledgment_id: b.acknowledgment_id || null,
      rejection_reason: b.rejection_reason || null,
      recorded_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true });
});

r.get('/submissions', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_report_submissions ORDER BY created_at DESC LIMIT 100`).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ─── Variance (current vs prior period) ────────────────────────────────
r.get('/nersa/:id/variance', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const cur = await c.env.DB.prepare(`SELECT * FROM oe_nersa_reports WHERE id = ?`).bind(id).first<any>();
  if (!cur) return c.json({ success: false, error: 'not found' }, 404);
  // Compute previous quarter
  let py = cur.year, pq = cur.quarter - 1;
  if (pq < 1) { pq = 4; py = cur.year - 1; }
  const prev = await c.env.DB.prepare(`SELECT summary_json FROM oe_nersa_reports WHERE year = ? AND quarter = ?`).bind(py, pq).first<any>();
  if (!prev?.summary_json) return c.json({ success: true, data: { current: JSON.parse(cur.summary_json || '{}'), prior: null, variance: null } });
  const c1 = JSON.parse(cur.summary_json || '{}');
  const c0 = JSON.parse(prev.summary_json || '{}');
  const variance: Record<string, { current: number; prior: number; delta: number; pct: number | null }> = {};
  for (const key of new Set([...Object.keys(c1), ...Object.keys(c0)])) {
    const a = Number(c1[key] || 0); const b = Number(c0[key] || 0);
    variance[key] = { current: a, prior: b, delta: a - b, pct: b !== 0 ? ((a - b) / b) * 100 : null };
  }
  return c.json({ success: true, data: { current: c1, prior: c0, variance, prior_period: { year: py, quarter: pq } } });
});

export default r;
