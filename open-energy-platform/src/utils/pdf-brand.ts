/**
 * Open Energy — Branded PDF Generator
 *
 * Builds A4 PDFs using pdf-lib with the OE visual identity:
 *   • Navy header bar  (#0B1F3A  →  rgb(0.043, 0.122, 0.227))
 *   • Gold accent line (#F59E0B  →  rgb(0.961, 0.620, 0.043))
 *   • Helvetica / Helvetica-Bold (standard 14 — no embed needed)
 *   • Monochrome body, 36pt margins
 *
 * Exported helpers
 *   buildInvoicePdf          → settlement / platform invoice
 *   buildCarbonCertPdf       → carbon retirement certificate
 *   buildCovenantReportPdf   → lender covenant test report
 *   buildWorkOrderPdf        → O&M work order
 *   buildStageGatePdf        → IPP stage gate decision record
 *   buildAuditExportPdf      → NERSA audit block export
 *   buildSettlementSummaryPdf → daily / monthly settlement summary
 */

import { PDFDocument, PDFPage, PDFFont, rgb, StandardFonts } from 'pdf-lib';

// ─── Brand constants ─────────────────────────────────────────────────────────

const NAVY  = rgb(0.043, 0.122, 0.227);
const GOLD  = rgb(0.961, 0.620, 0.043);
const WHITE = rgb(1, 1, 1);
const DARK  = rgb(0.133, 0.133, 0.173);   // body text
const MID   = rgb(0.4,   0.4,   0.45);    // secondary text
const LIGHT = rgb(0.78,  0.78,  0.8);     // borders / dividers
const GREEN = rgb(0.059, 0.616, 0.447);
const ROSE  = rgb(0.882, 0.239, 0.282);

// A4 dimensions in points
const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 36;
const CONTENT_W = A4_W - MARGIN * 2;
const HEADER_H = 76;
const FOOTER_H = 36;

// ─── Core page factory ────────────────────────────────────────────────────────

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

async function makeFonts(doc: PDFDocument): Promise<Fonts> {
  const [regular, bold, italic] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.HelveticaOblique),
  ]);
  return { regular, bold, italic };
}

function drawHeader(page: PDFPage, fonts: Fonts, docType: string): void {
  const { bold, regular } = fonts;
  const h = A4_H;

  // Navy background
  page.drawRectangle({ x: 0, y: h - HEADER_H, width: A4_W, height: HEADER_H, color: NAVY });

  // OE monogram badge (24×24 box)
  const badgeX = MARGIN;
  const badgeY = h - HEADER_H + (HEADER_H - 24) / 2;
  page.drawRectangle({ x: badgeX, y: badgeY, width: 24, height: 24, color: GOLD });
  page.drawText('OE', { x: badgeX + 3, y: badgeY + 7, size: 10, font: bold, color: NAVY });

  // Wordmark
  page.drawText('OPEN ENERGY', {
    x: badgeX + 30, y: h - HEADER_H + 28,
    size: 15, font: bold, color: WHITE,
  });
  page.drawText('PLATFORM', {
    x: badgeX + 30, y: h - HEADER_H + 14,
    size: 7.5, font: regular, color: rgb(0.65, 0.75, 0.87),
  });

  // Doc type right-aligned
  const typeW = regular.widthOfTextAtSize(docType, 8);
  page.drawText(docType.toUpperCase(), {
    x: A4_W - MARGIN - typeW, y: h - HEADER_H + 20,
    size: 8, font: regular, color: rgb(0.65, 0.75, 0.87),
  });

  // URL right-aligned bottom
  const urlText = 'oe.vantax.co.za';
  const urlW = regular.widthOfTextAtSize(urlText, 7);
  page.drawText(urlText, {
    x: A4_W - MARGIN - urlW, y: h - HEADER_H + 8,
    size: 7, font: regular, color: rgb(0.45, 0.55, 0.70),
  });

  // Gold accent line below header
  page.drawRectangle({ x: 0, y: h - HEADER_H - 2, width: A4_W, height: 2, color: GOLD });
}

function drawFooter(page: PDFPage, fonts: Fonts, pageNum: number, totalPages: number, refNum?: string): void {
  const { regular } = fonts;

  // Top border of footer
  page.drawLine({
    start: { x: MARGIN, y: FOOTER_H + 4 },
    end:   { x: A4_W - MARGIN, y: FOOTER_H + 4 },
    thickness: 0.5,
    color: LIGHT,
  });

  // Left: legal notice
  page.drawText('Confidential — Open Energy Platform | Issued under NERSA/JSE-SRL regulatory framework', {
    x: MARGIN, y: FOOTER_H - 4,
    size: 6, font: regular, color: MID,
  });

  // Right: ref + page
  const pageText = `Page ${pageNum} of ${totalPages}${refNum ? `  ·  Ref: ${refNum}` : ''}`;
  const pageW = regular.widthOfTextAtSize(pageText, 6.5);
  page.drawText(pageText, {
    x: A4_W - MARGIN - pageW, y: FOOTER_H - 4,
    size: 6.5, font: regular, color: MID,
  });
}

function drawSection(page: PDFPage, fonts: Fonts, title: string, y: number): number {
  const { bold } = fonts;
  // Section title bar
  page.drawRectangle({ x: MARGIN, y: y - 16, width: CONTENT_W, height: 18, color: rgb(0.95, 0.96, 0.98) });
  page.drawRectangle({ x: MARGIN, y: y - 16, width: 3, height: 18, color: NAVY });
  page.drawText(title.toUpperCase(), {
    x: MARGIN + 9, y: y - 10,
    size: 7.5, font: bold, color: NAVY,
  });
  return y - 16 - 10; // next Y
}

type Row = { label: string; value: string; mono?: boolean };

function drawMetadataGrid(page: PDFPage, fonts: Fonts, rows: Row[], startY: number, cols = 2): number {
  const { bold, regular } = fonts;
  const colW = CONTENT_W / cols;
  let y = startY;
  let col = 0;

  for (const row of rows) {
    const x = MARGIN + col * colW;
    page.drawText(row.label.toUpperCase(), {
      x, y,
      size: 7, font: bold, color: MID,
    });
    page.drawText(row.value || '—', {
      x, y: y - 12,
      size: 9, font: row.mono ? regular : regular, color: DARK,
    });

    col++;
    if (col >= cols) { col = 0; y -= 32; }
  }
  if (col > 0) y -= 32; // flush last partial row
  return y - 4;
}

interface TableColumn { header: string; width: number; mono?: boolean; align?: 'left' | 'right' | 'center' }
type TableRow = Record<string, string>;

function drawTable(
  page: PDFPage,
  fonts: Fonts,
  columns: TableColumn[],
  rows: TableRow[],
  startY: number,
): number {
  const { bold, regular } = fonts;
  const rowH = 18;
  let y = startY;

  // Header row
  page.drawRectangle({ x: MARGIN, y: y - rowH, width: CONTENT_W, height: rowH, color: NAVY });
  let cx = MARGIN + 6;
  for (const col of columns) {
    page.drawText(col.header.toUpperCase(), {
      x: col.align === 'right' ? cx + col.width - 6 - bold.widthOfTextAtSize(col.header.toUpperCase(), 7) : cx,
      y: y - 12,
      size: 7, font: bold, color: WHITE,
    });
    cx += col.width;
  }
  y -= rowH;

  // Data rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const bg = i % 2 === 0 ? WHITE : rgb(0.97, 0.97, 0.99);
    page.drawRectangle({ x: MARGIN, y: y - rowH, width: CONTENT_W, height: rowH, color: bg });
    cx = MARGIN + 6;
    for (const col of columns) {
      const text = String(row[col.header] ?? row[Object.keys(row)[columns.indexOf(col)]] ?? '—');
      const truncated = text.length > 50 ? text.slice(0, 48) + '…' : text;
      page.drawText(truncated, {
        x: col.align === 'right' ? cx + col.width - 6 - regular.widthOfTextAtSize(truncated, 8) : cx,
        y: y - 12,
        size: 8, font: regular, color: DARK,
      });
      cx += col.width;
    }
    // Row border
    page.drawLine({
      start: { x: MARGIN, y: y - rowH },
      end:   { x: MARGIN + CONTENT_W, y: y - rowH },
      thickness: 0.25, color: LIGHT,
    });
    y -= rowH;
  }

  // Table border
  page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height: rowH * (rows.length + 1), color: undefined, borderColor: LIGHT, borderWidth: 0.5 });
  return y - 8;
}

function drawStatusBadge(page: PDFPage, fonts: Fonts, status: string, x: number, y: number): void {
  const { bold } = fonts;
  const upper = status.toUpperCase().replace(/_/g, ' ');
  const isGreen = /paid|complete|pass|approved|active|issued|settled|certified/.test(status);
  const isRed   = /fail|breach|reject|default|cancelled|expired|critical/.test(status);
  const bg  = isGreen ? rgb(0.9, 0.98, 0.94) : isRed ? rgb(0.99, 0.92, 0.92) : rgb(0.95, 0.96, 0.98);
  const txt = isGreen ? GREEN : isRed ? ROSE : MID;
  const w = bold.widthOfTextAtSize(upper, 7.5) + 10;
  page.drawRectangle({ x, y: y - 3, width: w, height: 13, color: bg, borderColor: isGreen ? GREEN : isRed ? ROSE : LIGHT, borderWidth: 0.5 });
  page.drawText(upper, { x: x + 5, y: y + 1, size: 7.5, font: bold, color: txt });
}

// ─── Document: Invoice ────────────────────────────────────────────────────────

export interface InvoiceData {
  invoice_number: string;
  invoice_type?: string;
  from_name: string;
  to_name: string;
  period_start?: string;
  period_end?: string;
  due_date?: string;
  created_at?: string;
  status: string;
  line_items: Array<{ description: string; quantity?: number | string; unit_price?: number; amount: number }>;
  subtotal: number;
  vat_rate?: number;
  vat_amount?: number;
  total_amount: number;
  currency?: string;
  project_name?: string;
  notes?: string;
}

export async function buildInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = await makeFonts(doc);
  const { bold, regular, italic } = fonts;
  const page = doc.addPage([A4_W, A4_H]);
  const h = A4_H;

  drawHeader(page, fonts, 'Tax Invoice');

  // Title block
  let y = h - HEADER_H - 16;
  page.drawText(`INVOICE ${data.invoice_number}`, {
    x: MARGIN, y,
    size: 18, font: bold, color: NAVY,
  });
  y -= 20;
  drawStatusBadge(page, fonts, data.status, MARGIN, y);
  y -= 28;

  // Party meta
  y = drawMetadataGrid(page, fonts, [
    { label: 'Issued By',    value: data.from_name },
    { label: 'Billed To',   value: data.to_name },
    { label: 'Invoice Date', value: data.created_at ? data.created_at.slice(0, 10) : '—' },
    { label: 'Due Date',     value: data.due_date ? data.due_date.slice(0, 10) : '—' },
    { label: 'Period',       value: data.period_start ? `${data.period_start.slice(0,10)} – ${(data.period_end ?? '').slice(0,10)}` : '—' },
    { label: 'Invoice Type', value: (data.invoice_type ?? 'standard').replace(/_/g, ' ') },
    ...(data.project_name ? [{ label: 'Project', value: data.project_name }] : []),
  ], y);

  // Line items table
  y -= 8;
  y = drawSection(page, fonts, 'Line Items', y);
  y -= 6;
  const cur = data.currency ?? 'ZAR';
  const fmtAmt = (n: number) => `${cur} ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const tableRows = (data.line_items ?? []).map(li => ({
    'Description': li.description,
    'Qty': String(li.quantity ?? '1'),
    'Unit Price': li.unit_price != null ? fmtAmt(li.unit_price) : '—',
    'Amount': fmtAmt(li.amount),
  }));

  if (tableRows.length > 0) {
    y = drawTable(page, fonts, [
      { header: 'Description', width: 270 },
      { header: 'Qty',         width: 50,  align: 'right' },
      { header: 'Unit Price',  width: 100, align: 'right' },
      { header: 'Amount',      width: 103, align: 'right' },
    ], tableRows, y);
  }

  // Totals block (right-aligned)
  y -= 8;
  const totalsX = A4_W - MARGIN - 200;
  const lineY = (n: number) => y - n * 16;

  const totals: [string, string][] = [
    ['Subtotal',   fmtAmt(data.subtotal)],
    [`VAT (${Math.round((data.vat_rate ?? 0.15) * 100)}%)`, fmtAmt(data.vat_amount ?? data.subtotal * (data.vat_rate ?? 0.15))],
  ];

  totals.forEach(([label, val], i) => {
    page.drawText(label, { x: totalsX, y: lineY(i), size: 9, font: regular, color: MID });
    const vw = regular.widthOfTextAtSize(val, 9);
    page.drawText(val, { x: A4_W - MARGIN - vw, y: lineY(i), size: 9, font: regular, color: DARK });
  });

  // Total amount box
  const totalY = lineY(totals.length);
  page.drawRectangle({ x: totalsX - 6, y: totalY - 6, width: 200 + 6 + MARGIN, height: 22, color: NAVY });
  page.drawText('TOTAL DUE', { x: totalsX, y: totalY + 2, size: 9, font: bold, color: GOLD });
  const totalStr = fmtAmt(data.total_amount);
  const tW = bold.widthOfTextAtSize(totalStr, 11);
  page.drawText(totalStr, { x: A4_W - MARGIN - tW - 6, y: totalY + 1, size: 11, font: bold, color: WHITE });

  // Notes
  if (data.notes) {
    const notesY = totalY - 32;
    page.drawText('Notes:', { x: MARGIN, y: notesY, size: 8, font: bold, color: MID });
    page.drawText(data.notes.slice(0, 220), { x: MARGIN, y: notesY - 12, size: 8, font: italic, color: MID, maxWidth: CONTENT_W });
  }

  drawFooter(page, fonts, 1, 1, data.invoice_number);
  return doc.save();
}

// ─── Document: Carbon Retirement Certificate ──────────────────────────────────

export interface CarbonCertData {
  retirement_id: string;
  certificate_ref?: string;
  owner_name: string;
  beneficiary: string;
  project_name: string;
  registry: string;
  methodology: string;
  vintage: number | string;
  quantity: number;
  standard: string;
  scope: string;
  reason: string;
  retired_at: string;
  value_zar?: number;
}

export async function buildCarbonCertPdf(data: CarbonCertData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = await makeFonts(doc);
  const { bold, regular, italic } = fonts;
  const page = doc.addPage([A4_W, A4_H]);
  const h = A4_H;

  drawHeader(page, fonts, 'Carbon Retirement Certificate');

  let y = h - HEADER_H - 20;

  // Certificate banner
  page.drawRectangle({ x: MARGIN, y: y - 60, width: CONTENT_W, height: 60, color: rgb(0.95, 0.98, 0.95) });
  page.drawRectangle({ x: MARGIN, y: y - 60, width: CONTENT_W, height: 60, borderColor: GREEN, borderWidth: 1 });
  page.drawText('CERTIFICATE OF CARBON CREDIT RETIREMENT', {
    x: MARGIN + 16, y: y - 20,
    size: 14, font: bold, color: GREEN,
  });
  const subText = `This certifies that ${Number(data.quantity).toLocaleString('en-ZA')} tCO₂e have been permanently retired`;
  page.drawText(subText, { x: MARGIN + 16, y: y - 36, size: 9, font: italic, color: DARK });
  const certRef = data.certificate_ref ?? `CERT-${data.retirement_id.slice(-8).toUpperCase()}`;
  page.drawText(`Ref: ${certRef}`, { x: MARGIN + 16, y: y - 50, size: 8, font: regular, color: MID });
  y -= 76;

  // Metadata grid
  y = drawMetadataGrid(page, fonts, [
    { label: 'Issuing Party',     value: data.owner_name },
    { label: 'Beneficiary',       value: data.beneficiary },
    { label: 'Registry',          value: data.registry },
    { label: 'Standard',          value: data.standard },
    { label: 'Methodology',       value: data.methodology },
    { label: 'Vintage Year',      value: String(data.vintage) },
    { label: 'Quantity Retired',  value: `${Number(data.quantity).toLocaleString('en-ZA')} tCO₂e` },
    { label: 'Scope',             value: data.scope },
    { label: 'Purpose',           value: data.reason },
    { label: 'Retirement Date',   value: data.retired_at.slice(0, 10) },
    ...(data.value_zar ? [{ label: 'Market Value (ZAR)', value: `R ${Number(data.value_zar).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` }] : []),
    { label: 'Project Name',      value: data.project_name },
  ], y);

  y -= 8;
  y = drawSection(page, fonts, 'Project Details', y);
  y -= 16;
  page.drawText(`The above-named carbon credits were generated by the project "${data.project_name}" and`, {
    x: MARGIN, y, size: 9, font: regular, color: DARK,
  });
  y -= 14;
  page.drawText(`verified under the ${data.standard} standard, methodology ${data.methodology}.`, {
    x: MARGIN, y, size: 9, font: regular, color: DARK,
  });
  y -= 14;
  page.drawText(`Once retired, these credits cannot be transferred, sold, or re-used. This retirement is`, {
    x: MARGIN, y, size: 9, font: regular, color: DARK,
  });
  y -= 14;
  page.drawText(`permanent and irrevocable in accordance with the ${data.registry} registry protocol.`, {
    x: MARGIN, y, size: 9, font: regular, color: DARK,
  });

  // Signature line
  y -= 48;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 160, y }, thickness: 0.5, color: LIGHT });
  page.drawLine({ start: { x: A4_W - MARGIN - 160, y }, end: { x: A4_W - MARGIN, y }, thickness: 0.5, color: LIGHT });
  page.drawText('Authorised by Open Energy Platform', { x: MARGIN, y: y - 12, size: 7, font: regular, color: MID });
  page.drawText(`Date: ${data.retired_at.slice(0,10)}`, { x: A4_W - MARGIN - 120, y: y - 12, size: 7, font: regular, color: MID });

  drawFooter(page, fonts, 1, 1, certRef);
  return doc.save();
}

// ─── Document: Covenant Test Report ──────────────────────────────────────────

export interface CovenantTestReportData {
  facility_ref: string;
  borrower_name: string;
  lender_name?: string;
  test_period: string;
  dscr?: number;
  covenants: Array<{
    code: string;
    name: string;
    type: string;
    operator: string;
    threshold: number;
    measured_value?: number;
    result?: 'pass' | 'warn' | 'breach';
    notes?: string;
  }>;
  overall_result: 'pass' | 'warn' | 'breach';
  notes?: string;
  prepared_by?: string;
}

export async function buildCovenantReportPdf(data: CovenantTestReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = await makeFonts(doc);
  const { bold, regular } = fonts;
  const page = doc.addPage([A4_W, A4_H]);
  const h = A4_H;

  drawHeader(page, fonts, 'Covenant Test Report');

  let y = h - HEADER_H - 16;
  page.drawText('COVENANT COMPLIANCE REPORT', { x: MARGIN, y, size: 16, font: bold, color: NAVY });
  y -= 20;
  drawStatusBadge(page, fonts, data.overall_result, MARGIN, y);
  y -= 28;

  y = drawMetadataGrid(page, fonts, [
    { label: 'Facility Reference', value: data.facility_ref },
    { label: 'Borrower',           value: data.borrower_name },
    { label: 'Test Period',        value: data.test_period },
    { label: 'Overall Result',     value: data.overall_result.toUpperCase() },
    ...(data.dscr != null ? [{ label: 'DSCR (Current)', value: data.dscr.toFixed(2) + 'x' }] : []),
    ...(data.lender_name ? [{ label: 'Lender', value: data.lender_name }] : []),
    ...(data.prepared_by ? [{ label: 'Prepared By', value: data.prepared_by }] : []),
  ], y);

  y -= 8;
  y = drawSection(page, fonts, 'Covenant Results', y);
  y -= 6;

  const tableRows = data.covenants.map(c => ({
    'Code':       c.code,
    'Covenant':   c.name,
    'Threshold':  `${c.operator} ${c.threshold}`,
    'Measured':   c.measured_value != null ? String(c.measured_value) : '—',
    'Result':     (c.result ?? 'pending').toUpperCase(),
  }));

  y = drawTable(page, fonts, [
    { header: 'Code',      width: 70 },
    { header: 'Covenant',  width: 180 },
    { header: 'Threshold', width: 90, align: 'right' },
    { header: 'Measured',  width: 80, align: 'right' },
    { header: 'Result',    width: 103 },
  ], tableRows, y);

  // Notes
  if (data.notes) {
    y -= 16;
    page.drawText('Additional Notes:', { x: MARGIN, y, size: 8, font: bold, color: MID });
    y -= 14;
    page.drawText(data.notes.slice(0, 300), { x: MARGIN, y, size: 8, font: regular, color: DARK, maxWidth: CONTENT_W });
  }

  // Signature block
  y = Math.min(y - 40, FOOTER_H + 80);
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 180, y }, thickness: 0.5, color: LIGHT });
  page.drawLine({ start: { x: A4_W - MARGIN - 180, y }, end: { x: A4_W - MARGIN, y }, thickness: 0.5, color: LIGHT });
  page.drawText('Prepared / Credit Officer', { x: MARGIN, y: y - 12, size: 7, font: regular, color: MID });
  page.drawText('Reviewed / Fund Manager', { x: A4_W - MARGIN - 150, y: y - 12, size: 7, font: regular, color: MID });

  drawFooter(page, fonts, 1, 1, data.facility_ref);
  return doc.save();
}

// ─── Document: Work Order ────────────────────────────────────────────────────

export interface WorkOrderData {
  wo_ref: string;
  site_name: string;
  asset_name?: string;
  asset_type?: string;
  priority: string;
  wo_type: string;
  description?: string;
  technician?: string;
  created_at: string;
  scheduled_date?: string;
  completed_at?: string;
  duration_h?: number;
  parts_used?: Array<{ part_number: string; description: string; qty: number; cost_zar: number }>;
  status: string;
  sla_met?: boolean;
  parts_cost_zar?: number;
  labour_cost_zar?: number;
  total_cost_zar?: number;
  resolution_notes?: string;
}

export async function buildWorkOrderPdf(data: WorkOrderData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = await makeFonts(doc);
  const { bold, regular } = fonts;
  const page = doc.addPage([A4_W, A4_H]);
  const h = A4_H;

  drawHeader(page, fonts, 'Work Order');

  let y = h - HEADER_H - 16;
  page.drawText(`WORK ORDER  ${data.wo_ref}`, { x: MARGIN, y, size: 16, font: bold, color: NAVY });
  y -= 20;
  drawStatusBadge(page, fonts, data.status, MARGIN, y);
  const priBg = data.priority === 'P1' ? rgb(0.99, 0.92, 0.92) : data.priority === 'P2' ? rgb(1, 0.97, 0.88) : rgb(0.95, 0.96, 0.98);
  const priColor = data.priority === 'P1' ? ROSE : data.priority === 'P2' ? GOLD : MID;
  const priW = bold.widthOfTextAtSize(data.priority, 8) + 10;
  page.drawRectangle({ x: MARGIN + 90, y: y - 3, width: priW, height: 13, color: priBg, borderColor: priColor, borderWidth: 0.5 });
  page.drawText(data.priority, { x: MARGIN + 95, y: y + 1, size: 8, font: bold, color: priColor });
  y -= 28;

  y = drawMetadataGrid(page, fonts, [
    { label: 'Site',           value: data.site_name },
    { label: 'Asset',          value: data.asset_name ?? '—' },
    { label: 'Asset Type',     value: data.asset_type ?? '—' },
    { label: 'WO Type',        value: data.wo_type.replace(/_/g, ' ') },
    { label: 'Technician',     value: data.technician ?? 'Unassigned' },
    { label: 'Created',        value: data.created_at.slice(0, 10) },
    { label: 'Scheduled',      value: data.scheduled_date ? data.scheduled_date.slice(0, 10) : '—' },
    { label: 'Completed',      value: data.completed_at ? data.completed_at.slice(0, 10) : '—' },
    { label: 'Duration (h)',   value: data.duration_h != null ? `${data.duration_h}h` : '—' },
    { label: 'SLA Met',        value: data.sla_met == null ? '—' : data.sla_met ? 'Yes' : 'No' },
  ], y);

  if (data.description) {
    y -= 4;
    y = drawSection(page, fonts, 'Description / Work Performed', y);
    y -= 14;
    page.drawText(data.description.slice(0, 400), { x: MARGIN, y, size: 9, font: regular, color: DARK, maxWidth: CONTENT_W });
    y -= 28;
  }

  if (data.parts_used && data.parts_used.length > 0) {
    y = drawSection(page, fonts, 'Parts Used', y);
    y -= 6;
    y = drawTable(page, fonts, [
      { header: 'Part #',      width: 100 },
      { header: 'Description', width: 240 },
      { header: 'Qty',         width: 60,  align: 'right' },
      { header: 'Cost (ZAR)',  width: 123, align: 'right' },
    ], data.parts_used.map(p => ({
      'Part #':      p.part_number,
      'Description': p.description,
      'Qty':         String(p.qty),
      'Cost (ZAR)':  `R ${p.cost_zar.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`,
    })), y);
  }

  // Cost summary
  if (data.total_cost_zar != null) {
    y -= 12;
    const costsX = A4_W - MARGIN - 180;
    const costs: [string, string][] = [
      ...(data.labour_cost_zar != null ? [['Labour Cost', `R ${data.labour_cost_zar.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`] as [string, string]] : []),
      ...(data.parts_cost_zar  != null ? [['Parts Cost',  `R ${data.parts_cost_zar.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`]  as [string, string]] : []),
      ['Total Cost', `R ${data.total_cost_zar.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`],
    ];
    costs.forEach(([label, val], i) => {
      const isTotal = i === costs.length - 1;
      page.drawText(label, { x: costsX, y: y - i * 16, size: 9, font: isTotal ? bold : regular, color: isTotal ? NAVY : MID });
      const vw = (isTotal ? bold : regular).widthOfTextAtSize(val, 9);
      page.drawText(val, { x: A4_W - MARGIN - vw, y: y - i * 16, size: 9, font: isTotal ? bold : regular, color: isTotal ? NAVY : DARK });
    });
  }

  if (data.resolution_notes) {
    y -= 48;
    page.drawText('Resolution Notes:', { x: MARGIN, y, size: 8, font: bold, color: MID });
    y -= 14;
    page.drawText(data.resolution_notes.slice(0, 300), { x: MARGIN, y, size: 8, font: regular, color: DARK, maxWidth: CONTENT_W });
  }

  drawFooter(page, fonts, 1, 1, data.wo_ref);
  return doc.save();
}

// ─── Document: Stage Gate Decision ───────────────────────────────────────────

export interface StageGateData {
  gate_ref: string;
  gate_name: string;
  project_name: string;
  developer_name: string;
  decision: 'approved' | 'conditional' | 'rejected' | 'pending';
  decision_date?: string;
  submitted_at?: string;
  officer_name?: string;
  conditions?: string[];
  rejections?: string[];
  notes?: string;
  next_gate?: string;
}

export async function buildStageGatePdf(data: StageGateData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = await makeFonts(doc);
  const { bold, regular } = fonts;
  const page = doc.addPage([A4_W, A4_H]);
  const h = A4_H;

  drawHeader(page, fonts, 'Stage Gate Decision');

  let y = h - HEADER_H - 16;
  page.drawText('STAGE GATE DECISION RECORD', { x: MARGIN, y, size: 16, font: bold, color: NAVY });
  y -= 20;
  drawStatusBadge(page, fonts, data.decision, MARGIN, y);
  y -= 32;

  y = drawMetadataGrid(page, fonts, [
    { label: 'Gate Reference',  value: data.gate_ref },
    { label: 'Gate Name',       value: data.gate_name },
    { label: 'Project',         value: data.project_name },
    { label: 'Developer',       value: data.developer_name },
    { label: 'Submitted',       value: data.submitted_at ? data.submitted_at.slice(0,10) : '—' },
    { label: 'Decision Date',   value: data.decision_date ? data.decision_date.slice(0,10) : '—' },
    { label: 'Decision Officer', value: data.officer_name ?? '—' },
    { label: 'Next Gate',       value: data.next_gate ?? '—' },
  ], y);

  if (data.conditions && data.conditions.length > 0) {
    y -= 8;
    y = drawSection(page, fonts, 'Conditions Attached', y);
    y -= 14;
    data.conditions.forEach((c, i) => {
      page.drawText(`${i + 1}.  ${c}`, { x: MARGIN, y, size: 9, font: regular, color: DARK, maxWidth: CONTENT_W });
      y -= 16;
    });
  }

  if (data.rejections && data.rejections.length > 0) {
    y -= 8;
    y = drawSection(page, fonts, 'Rejection Grounds', y);
    y -= 14;
    data.rejections.forEach((r, i) => {
      page.drawText(`${i + 1}.  ${r}`, { x: MARGIN, y, size: 9, font: regular, color: ROSE, maxWidth: CONTENT_W });
      y -= 16;
    });
  }

  if (data.notes) {
    y -= 8;
    y = drawSection(page, fonts, 'Notes', y);
    y -= 14;
    page.drawText(data.notes.slice(0, 400), { x: MARGIN, y, size: 9, font: regular, color: DARK, maxWidth: CONTENT_W });
  }

  // Signature
  const sigY = Math.min(y - 40, FOOTER_H + 80);
  page.drawLine({ start: { x: MARGIN, y: sigY }, end: { x: MARGIN + 200, y: sigY }, thickness: 0.5, color: LIGHT });
  page.drawText('NERSA / Authorising Officer', { x: MARGIN, y: sigY - 12, size: 7, font: regular, color: MID });

  drawFooter(page, fonts, 1, 1, data.gate_ref);
  return doc.save();
}

// ─── Document: Settlement Summary ────────────────────────────────────────────

export interface SettlementSummaryData {
  period: string;
  run_ref: string;
  participants: Array<{
    name: string;
    role: string;
    gross_bought_mwh: number;
    gross_sold_mwh: number;
    net_position_mwh: number;
    net_amount_zar: number;
    status: string;
  }>;
  total_volume_mwh: number;
  total_gmv_zar: number;
  run_at?: string;
}

export async function buildSettlementSummaryPdf(data: SettlementSummaryData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = await makeFonts(doc);
  const { bold, regular } = fonts;
  const page = doc.addPage([A4_W, A4_H]);
  const h = A4_H;

  drawHeader(page, fonts, 'Settlement Summary');

  let y = h - HEADER_H - 16;
  page.drawText('DAILY SETTLEMENT SUMMARY', { x: MARGIN, y, size: 16, font: bold, color: NAVY });
  y -= 20;
  page.drawText(data.period, { x: MARGIN, y, size: 11, font: regular, color: MID });
  y -= 28;

  y = drawMetadataGrid(page, fonts, [
    { label: 'Settlement Run',    value: data.run_ref },
    { label: 'Period',            value: data.period },
    { label: 'Total Volume',      value: `${Number(data.total_volume_mwh).toLocaleString('en-ZA')} MWh` },
    { label: 'Gross Market Value',value: `R ${Number(data.total_gmv_zar).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` },
    { label: 'Run At',            value: data.run_at ? data.run_at.slice(0, 16) : '—' },
    { label: 'Participants',      value: String(data.participants.length) },
  ], y);

  y -= 8;
  y = drawSection(page, fonts, 'Participant Positions', y);
  y -= 6;

  y = drawTable(page, fonts, [
    { header: 'Participant',  width: 170 },
    { header: 'Role',         width: 80 },
    { header: 'Bought (MWh)', width: 85, align: 'right' },
    { header: 'Sold (MWh)',   width: 85, align: 'right' },
    { header: 'Net (ZAR)',    width: 103, align: 'right' },
  ], data.participants.map(p => ({
    'Participant':  p.name,
    'Role':         p.role.replace(/_/g, ' '),
    'Bought (MWh)': p.gross_bought_mwh.toFixed(2),
    'Sold (MWh)':   p.gross_sold_mwh.toFixed(2),
    'Net (ZAR)':    (p.net_amount_zar >= 0 ? '+' : '') + `R ${p.net_amount_zar.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`,
  })), y);

  // Grand total row
  y -= 4;
  page.drawRectangle({ x: MARGIN, y: y - 20, width: CONTENT_W, height: 20, color: rgb(0.95, 0.96, 0.98) });
  page.drawText('TOTAL GMV', { x: MARGIN + 6, y: y - 13, size: 8, font: bold, color: NAVY });
  const gmvStr = `R ${Number(data.total_gmv_zar).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
  const gmvW = bold.widthOfTextAtSize(gmvStr, 9);
  page.drawText(gmvStr, { x: A4_W - MARGIN - gmvW - 6, y: y - 13, size: 9, font: bold, color: NAVY });

  drawFooter(page, fonts, 1, 1, data.run_ref);
  return doc.save();
}

// ─── Document: Audit Export ───────────────────────────────────────────────────

export interface AuditExportData {
  export_ref: string;
  period_label: string;
  entity_count: number;
  block_count: number;
  chain_integrity: 'verified' | 'gap_detected' | 'pending';
  generated_by?: string;
  generated_at?: string;
  blocks: Array<{
    seq: number;
    actor?: string;
    entity_type: string;
    action: string;
    hash: string;
    timestamp: string;
  }>;
}

export async function buildAuditExportPdf(data: AuditExportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = await makeFonts(doc);
  const { bold, regular } = fonts;
  const page = doc.addPage([A4_W, A4_H]);
  const h = A4_H;

  drawHeader(page, fonts, 'NERSA Audit Export');

  let y = h - HEADER_H - 16;
  page.drawText('REGULATORY AUDIT BLOCK EXPORT', { x: MARGIN, y, size: 16, font: bold, color: NAVY });
  y -= 20;
  drawStatusBadge(page, fonts, data.chain_integrity, MARGIN, y);
  y -= 32;

  y = drawMetadataGrid(page, fonts, [
    { label: 'Export Reference', value: data.export_ref },
    { label: 'Period',           value: data.period_label },
    { label: 'Total Blocks',     value: String(data.block_count) },
    { label: 'Entity Records',   value: String(data.entity_count) },
    { label: 'Chain Integrity',  value: data.chain_integrity.replace(/_/g, ' ').toUpperCase() },
    { label: 'Generated By',     value: data.generated_by ?? 'Open Energy Platform' },
    { label: 'Generated At',     value: data.generated_at ? data.generated_at.slice(0,16) : '—' },
  ], y);

  y -= 8;
  y = drawSection(page, fonts, `Audit Blocks (showing first ${Math.min(data.blocks.length, 20)})`, y);
  y -= 6;

  const blockRows = data.blocks.slice(0, 20).map(b => ({
    'Seq':         String(b.seq),
    'Action':      b.action,
    'Entity':      b.entity_type,
    'Actor':       b.actor ?? '—',
    'Hash':        b.hash.slice(0, 12) + '…',
    'Timestamp':   b.timestamp.slice(0, 16),
  }));

  y = drawTable(page, fonts, [
    { header: 'Seq',       width: 40 },
    { header: 'Action',    width: 120 },
    { header: 'Entity',    width: 100 },
    { header: 'Actor',     width: 80 },
    { header: 'Hash',      width: 90, mono: true },
    { header: 'Timestamp', width: 93, mono: true },
  ], blockRows, y);

  if (data.blocks.length > 20) {
    y -= 10;
    page.drawText(`… and ${data.blocks.length - 20} additional blocks. Full dataset available via NERSA certified export.`, {
      x: MARGIN, y, size: 8, font: regular, color: MID,
    });
  }

  drawFooter(page, fonts, 1, 1, data.export_ref);
  return doc.save();
}
