// ════════════════════════════════════════════════════════════════════════
// print-packs — server-rendered HTML pages designed for the browser's
// Print-to-PDF dialog. Each pack pulls live data, wraps it in a clean
// print stylesheet and includes a generated timestamp + watermark.
//
// Packs:
//   /api/print-packs/regulator/:participant_id   — Regulator submission
//   /api/print-packs/lender/:project_id          — Lender quarterly report
//   /api/print-packs/audit/:day                   — Daily audit summary
//
// All packs are role-gated server-side. Output is HTML so the SPA can
// open it in a new tab and the user can use the browser's "Save as PDF".
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

function esc(s: any): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PRINT_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         color: #0f1c2e; margin: 0; padding: 0; font-size: 11pt; line-height: 1.45; }
  header.cover { padding: 40pt 48pt 28pt; border-bottom: 2pt solid #0f1c2e; }
  header.cover .eyebrow { color: #6b7685; font-size: 9pt; letter-spacing: 0.08em; text-transform: uppercase; }
  header.cover h1 { margin: 0; font-size: 22pt; }
  header.cover .meta { margin-top: 12pt; color: #3a4658; font-size: 10pt; }
  main { padding: 28pt 48pt 48pt; }
  section { margin-bottom: 22pt; page-break-inside: avoid; }
  section h2 { font-size: 13pt; margin: 0 0 8pt; padding-bottom: 4pt; border-bottom: 0.5pt solid #dde4ec; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  table th { text-align: left; padding: 4pt 6pt; background: #eef2f7; }
  table td { padding: 4pt 6pt; border-bottom: 0.5pt solid #dde4ec; vertical-align: top; }
  dl { display: grid; grid-template-columns: 1fr 2fr; gap: 4pt 16pt; }
  dt { color: #6b7685; }
  dd { margin: 0; font-weight: 600; }
  footer { padding: 12pt 48pt; border-top: 0.5pt solid #dde4ec; color: #6b7685; font-size: 8.5pt;
           display: flex; justify-content: space-between; }
  .watermark { position: fixed; opacity: 0.04; font-size: 80pt; color: #0f1c2e;
               transform: rotate(-30deg); top: 40%; left: 12%; pointer-events: none; z-index: 0; }
  @media print {
    @page { margin: 0; size: A4; }
    .no-print { display: none; }
  }
  .actions { padding: 12pt 48pt; background: #f8fafc; border-bottom: 0.5pt solid #dde4ec; }
  .actions button { background: #1a3a5c; color: white; border: none; padding: 6pt 14pt; font-size: 10pt; border-radius: 4pt; cursor: pointer; }
`;

function shell(title: string, eyebrow: string, body: string, meta: string): string {
  return `<!doctype html>
<html lang="en-ZA"><head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>${PRINT_CSS}</style>
</head><body>
  <div class="watermark">OPEN ENERGY</div>
  <div class="actions no-print"><button onclick="window.print()">Save as PDF</button></div>
  <header class="cover">
    <div class="eyebrow">${esc(eyebrow)}</div>
    <h1>${esc(title)}</h1>
    <div class="meta">${meta}</div>
  </header>
  <main>${body}</main>
  <footer>
    <div>Consolidated Energy Cockpit · oe.vantax.co.za</div>
    <div>Operated by GONXT Technology (Pty) Ltd · Reg 2019/123456/07</div>
  </footer>
</body></html>`;
}

// ─── Regulator pack ─────────────────────────────────────────────────────
r.get('/regulator/:participant_id', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const pid = c.req.param('participant_id');
  const p = await c.env.DB.prepare(
    `SELECT id, email, organisation, role, kyc_status, created_at FROM participants WHERE id = ?`
  ).bind(pid).first<any>();
  if (!p) return c.json({ success: false, error: 'participant not found' }, 404);
  // Recent compliance + audit findings
  const audits = await c.env.DB.prepare(
    `SELECT title, status, findings_count, audited_at FROM oe_compliance_audits
     WHERE participant_id = ? ORDER BY audited_at DESC LIMIT 10`
  ).bind(pid).all<any>().catch(() => ({ results: [] as any[] }));
  const findings = await c.env.DB.prepare(
    `SELECT severity, title, status FROM oe_audit_findings
     WHERE audit_id IN (SELECT id FROM oe_compliance_audits WHERE participant_id = ?)
     ORDER BY raised_at DESC LIMIT 20`
  ).bind(pid).all<any>().catch(() => ({ results: [] as any[] }));

  const auditRows = ((audits.results || []) as any[]).map((a) => `
    <tr>
      <td>${esc(a.title)}</td>
      <td>${esc(a.status)}</td>
      <td>${esc(a.findings_count)}</td>
      <td>${esc(a.audited_at)}</td>
    </tr>`).join('');
  const findingRows = ((findings.results || []) as any[]).map((f) => `
    <tr>
      <td>${esc(f.severity)}</td>
      <td>${esc(f.title)}</td>
      <td>${esc(f.status)}</td>
    </tr>`).join('');

  const body = `
    <section>
      <h2>Participant profile</h2>
      <dl>
        <dt>ID</dt><dd>${esc(p.id)}</dd>
        <dt>Organisation</dt><dd>${esc(p.organisation || '—')}</dd>
        <dt>Email</dt><dd>${esc(p.email)}</dd>
        <dt>Role</dt><dd>${esc(p.role)}</dd>
        <dt>KYC status</dt><dd>${esc(p.kyc_status || '—')}</dd>
        <dt>Registered</dt><dd>${esc(p.created_at)}</dd>
      </dl>
    </section>
    <section>
      <h2>Recent compliance audits</h2>
      <table>
        <thead><tr><th>Title</th><th>Status</th><th>Findings</th><th>Audited</th></tr></thead>
        <tbody>${auditRows || '<tr><td colspan="4"><em>None</em></td></tr>'}</tbody>
      </table>
    </section>
    <section>
      <h2>Open findings</h2>
      <table>
        <thead><tr><th>Severity</th><th>Title</th><th>Status</th></tr></thead>
        <tbody>${findingRows || '<tr><td colspan="3"><em>None</em></td></tr>'}</tbody>
      </table>
    </section>
  `;
  const meta = `Generated ${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} · Pack for NERSA / Information Regulator submission`;
  return new Response(shell(`Regulator pack · ${p.organisation || p.email}`, 'Regulator submission', body, meta), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
});

// ─── Lender pack ───────────────────────────────────────────────────────
r.get('/lender/:project_id', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support', 'lender', 'ipp_developer'].includes(user.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const projectId = c.req.param('project_id');
  const project = await c.env.DB.prepare(
    `SELECT id, name, capacity_mw, fuel_type, COALESCE(status, 'unknown') AS status, owner_participant_id
     FROM ipp_projects WHERE id = ?`
  ).bind(projectId).first<any>().catch(() => null);
  if (!project) return c.json({ success: false, error: 'project not found' }, 404);

  const milestones = await c.env.DB.prepare(
    `SELECT milestone_name, target_date, actual_date, status FROM ipp_milestones
     WHERE project_id = ? ORDER BY target_date LIMIT 50`
  ).bind(projectId).all<any>().catch(() => ({ results: [] as any[] }));

  const drawdowns = await c.env.DB.prepare(
    `SELECT requested_amount_zar, required_by, status, requested_at FROM ipp_drawdowns
     WHERE project_id = ? ORDER BY requested_at DESC LIMIT 20`
  ).bind(projectId).all<any>().catch(() => ({ results: [] as any[] }));

  const mRows = ((milestones.results || []) as any[]).map((m) => `
    <tr><td>${esc(m.milestone_name)}</td><td>${esc(m.target_date)}</td><td>${esc(m.actual_date || '—')}</td><td>${esc(m.status)}</td></tr>`).join('');
  const dRows = ((drawdowns.results || []) as any[]).map((d) => `
    <tr><td>R${Number(d.requested_amount_zar || 0).toLocaleString('en-ZA')}</td><td>${esc(d.required_by)}</td><td>${esc(d.status)}</td><td>${esc(d.requested_at)}</td></tr>`).join('');

  const body = `
    <section>
      <h2>Project summary</h2>
      <dl>
        <dt>Name</dt><dd>${esc(project.name)}</dd>
        <dt>Capacity</dt><dd>${esc(project.capacity_mw)} MW</dd>
        <dt>Fuel type</dt><dd>${esc(project.fuel_type)}</dd>
        <dt>Status</dt><dd>${esc(project.status)}</dd>
        <dt>Owner</dt><dd>${esc(project.owner_participant_id)}</dd>
      </dl>
    </section>
    <section>
      <h2>Milestones</h2>
      <table>
        <thead><tr><th>Milestone</th><th>Target</th><th>Actual</th><th>Status</th></tr></thead>
        <tbody>${mRows || '<tr><td colspan="4"><em>None</em></td></tr>'}</tbody>
      </table>
    </section>
    <section>
      <h2>Drawdown history</h2>
      <table>
        <thead><tr><th>Amount</th><th>Required by</th><th>Status</th><th>Requested at</th></tr></thead>
        <tbody>${dRows || '<tr><td colspan="4"><em>None</em></td></tr>'}</tbody>
      </table>
    </section>
  `;
  const meta = `Generated ${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} · Lender quarterly report`;
  return new Response(shell(`Lender pack · ${project.name}`, 'Lender quarterly report', body, meta), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
});

// ─── Audit summary pack ────────────────────────────────────────────────
r.get('/audit/:day', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const day = c.req.param('day');
  const roots = await c.env.DB.prepare(
    `SELECT entity_type, event_count, merkle_root, platform_signature, attestor_id, attestor_signature
     FROM oe_audit_merkle_roots WHERE day = ? ORDER BY entity_type`
  ).bind(day).all<any>().catch(() => ({ results: [] as any[] }));
  const totals = await c.env.DB.prepare(
    `SELECT COUNT(*) AS events, COUNT(DISTINCT entity_type) AS entities
     FROM audit_events WHERE date(created_at) = ?`
  ).bind(day).first<any>().catch(() => ({ events: 0, entities: 0 }));

  const rootRows = ((roots.results || []) as any[]).map((r) => `
    <tr>
      <td>${esc(r.entity_type)}</td>
      <td>${esc(r.event_count)}</td>
      <td style="font-family: monospace; font-size: 7pt; word-break: break-all">${esc(r.merkle_root)}</td>
      <td>${r.platform_signature ? '✓' : '—'}</td>
      <td>${r.attestor_signature ? '✓ ' + esc(r.attestor_id) : '—'}</td>
    </tr>`).join('');

  const body = `
    <section>
      <h2>Summary</h2>
      <dl>
        <dt>Day</dt><dd>${esc(day)}</dd>
        <dt>Total events</dt><dd>${esc(totals?.events || 0)}</dd>
        <dt>Distinct entity types</dt><dd>${esc(totals?.entities || 0)}</dd>
      </dl>
    </section>
    <section>
      <h2>Published Merkle roots</h2>
      <table>
        <thead><tr><th>Entity type</th><th>Events</th><th>Merkle root</th><th>Platform signed</th><th>Attestor</th></tr></thead>
        <tbody>${rootRows || '<tr><td colspan="5"><em>No roots published yet for this day</em></td></tr>'}</tbody>
      </table>
    </section>
  `;
  const meta = `Generated ${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} · Tamper-evident audit summary`;
  return new Response(shell(`Audit pack · ${day}`, 'Audit summary', body, meta), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
});

export default r;
