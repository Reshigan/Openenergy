// ═══════════════════════════════════════════════════════════════════════════
// Reports — detailed per-role reporting with CSV export.
// -----------------------------------------------------------------------------
// Every role has a dedicated JSON endpoint that returns a consistent shape:
//   { role, generated_at, summary: { kpi... }, sections: [{ key, label, rows }] }
// Sections are simple tables (array of flat objects) so they render directly
// in the UI and can be streamed as CSV via /reports/:role/csv?section=<key>.
//
// Authorisation:
//   - admin + support can view any role's report
//   - every other role can only view their own (role must match path)
// Tenant isolation is already enforced at the middleware + query layer, so
// the report implicitly scopes to rows owned by the participant's tenant.
// ═══════════════════════════════════════════════════════════════════════════
import { Hono, Context } from 'hono';
import { HonoEnv, ParticipantRole } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const reports = new Hono<HonoEnv>();
reports.use('*', authMiddleware);

type Row = Record<string, string | number | null>;
type Section = { key: string; label: string; rows: Row[] };
type Report = {
  role: ParticipantRole;
  generated_at: string;
  summary: Record<string, string | number>;
  sections: Section[];
};

const ADMIN_LIKE = new Set<ParticipantRole>(['admin', 'support']);

function guard(c: Context<HonoEnv>, wanted: ParticipantRole) {
  const user = getCurrentUser(c);
  if (ADMIN_LIKE.has(user.role as ParticipantRole)) return user;
  if (user.role !== wanted) {
    return null;
  }
  return user;
}

function toCsv(rows: Row[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

async function ensureRegulatorFilings(env: HonoEnv) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS regulator_filings (
      id TEXT PRIMARY KEY,
      filing_type TEXT NOT NULL,
      reporting_period TEXT NOT NULL,
      filed_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      narrative TEXT,
      evidence_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
}

// ──────────────────────────────────────────────────────────────────────────
// Per-role builders. Each returns a Report ready to serve as JSON or CSV.
// ──────────────────────────────────────────────────────────────────────────

async function buildAdmin(env: HonoEnv): Promise<Report> {
  const [
    totalParticipants, activeParticipants, pendingKyc,
    byRole, byTenant, modules, auditVolume, sessionsActive, lockoutsRecent,
  ] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) c FROM participants`).first<{ c: number }>(),
    env.DB.prepare(`SELECT COUNT(*) c FROM participants WHERE status = 'active'`).first<{ c: number }>(),
    env.DB.prepare(`SELECT COUNT(*) c FROM participants WHERE kyc_status IN ('pending','in_review')`).first<{ c: number }>(),
    env.DB.prepare(`SELECT role, COUNT(*) count FROM participants GROUP BY role ORDER BY role`).all<Row>(),
    env.DB.prepare(`SELECT COALESCE(NULLIF(tenant_id,''),'default') tenant_id, COUNT(*) count FROM participants GROUP BY tenant_id ORDER BY count DESC`).all<Row>(),
    env.DB.prepare(`SELECT module_key, display_name, enabled, price_monthly FROM modules ORDER BY display_name`).all<Row>(),
    env.DB.prepare(`SELECT action, COUNT(*) count FROM audit_logs WHERE created_at > datetime('now','-30 days') GROUP BY action ORDER BY count DESC LIMIT 25`).all<Row>(),
    env.DB.prepare(`SELECT COUNT(*) c FROM sessions WHERE revoked_at IS NULL AND datetime(expires_at) > datetime('now')`).first<{ c: number }>().catch(() => ({ c: 0 })),
    env.DB.prepare(`SELECT email, COUNT(*) attempts, MAX(attempted_at) last_attempt FROM login_attempts WHERE attempted_at > datetime('now','-1 day') AND succeeded = 0 GROUP BY email HAVING attempts >= 3 ORDER BY attempts DESC LIMIT 50`).all<Row>().catch(() => ({ results: [] as Row[] })),
  ]);

  return {
    role: 'admin',
    generated_at: new Date().toISOString(),
    summary: {
      participants_total: totalParticipants?.c ?? 0,
      participants_active: activeParticipants?.c ?? 0,
      kyc_queue: pendingKyc?.c ?? 0,
      modules: (modules.results || []).length,
      active_sessions: sessionsActive?.c ?? 0,
      audit_events_30d: (auditVolume.results || []).reduce((a, r) => a + Number(r.count || 0), 0),
    },
    sections: [
      { key: 'by_role', label: 'Participants by role', rows: byRole.results || [] },
      { key: 'by_tenant', label: 'Participants by tenant', rows: byTenant.results || [] },
      { key: 'modules', label: 'Module catalogue', rows: modules.results || [] },
      { key: 'audit_top_actions', label: 'Top audit-log actions (30d)', rows: auditVolume.results || [] },
      { key: 'recent_lockout_candidates', label: 'Failing-login accounts (24h, ≥3)', rows: lockoutsRecent.results || [] },
    ],
  };
}

async function buildTrader(env: HonoEnv, participantId: string, scopeAll: boolean): Promise<Report> {
  const where = scopeAll ? '1=1' : 'o.participant_id = ?';
  const bind = (s: D1PreparedStatement) => scopeAll ? s : s.bind(participantId);

  const orders = await bind(env.DB.prepare(`
    SELECT status, COUNT(*) count, ROUND(SUM(volume_mwh),2) volume_mwh
    FROM trade_orders o WHERE ${where} GROUP BY status ORDER BY status
  `)).all<Row>();

  const matches = scopeAll
    ? await env.DB.prepare(`
        SELECT m.id, m.matched_at, m.matched_volume_mwh, m.matched_price, m.status,
               (m.matched_volume_mwh * m.matched_price) gross_zar,
               bo.participant_id buy_participant, so.participant_id sell_participant
        FROM trade_matches m
        JOIN trade_orders bo ON bo.id = m.buy_order_id
        JOIN trade_orders so ON so.id = m.sell_order_id
        ORDER BY m.matched_at DESC LIMIT 200
      `).all<Row>()
    : await env.DB.prepare(`
        SELECT m.id, m.matched_at, m.matched_volume_mwh, m.matched_price, m.status,
               (m.matched_volume_mwh * m.matched_price) gross_zar,
               CASE WHEN bo.participant_id = ? THEN 'buy' ELSE 'sell' END side
        FROM trade_matches m
        JOIN trade_orders bo ON bo.id = m.buy_order_id
        JOIN trade_orders so ON so.id = m.sell_order_id
        WHERE bo.participant_id = ? OR so.participant_id = ?
        ORDER BY m.matched_at DESC LIMIT 200
      `).bind(participantId, participantId, participantId).all<Row>();

  const volumeMwh = (matches.results || []).reduce((a, r) => a + Number(r.matched_volume_mwh || 0), 0);
  const grossZar = (matches.results || []).reduce((a, r) => a + Number(r.gross_zar || 0), 0);
  const openOrders = (orders.results || []).find(r => r.status === 'open');

  return {
    role: 'trader',
    generated_at: new Date().toISOString(),
    summary: {
      matches: (matches.results || []).length,
      volume_mwh: Number(volumeMwh.toFixed(2)),
      gross_zar: Number(grossZar.toFixed(2)),
      open_orders: Number(openOrders?.count || 0),
    },
    sections: [
      { key: 'orders_by_status', label: 'Orders by status', rows: orders.results || [] },
      { key: 'recent_matches', label: 'Recent matches (last 200)', rows: matches.results || [] },
    ],
  };
}

async function buildIpp(env: HonoEnv, participantId: string, scopeAll: boolean): Promise<Report> {
  const projWhere = scopeAll ? '1=1' : 'developer_id = ?';
  const projBind = (s: D1PreparedStatement) => scopeAll ? s : s.bind(participantId);

  const projects = await projBind(env.DB.prepare(`
    SELECT id, project_name, technology, capacity_mw, status, commercial_operation_date
    FROM ipp_projects WHERE ${projWhere} ORDER BY commercial_operation_date DESC LIMIT 100
  `)).all<Row>();

  const contracts = await (scopeAll
    ? env.DB.prepare(`
        SELECT id, title, document_type, phase, creator_id, counterparty_id, created_at
        FROM contract_documents ORDER BY created_at DESC LIMIT 100
      `)
    : env.DB.prepare(`
        SELECT id, title, document_type, phase, creator_id, counterparty_id, created_at
        FROM contract_documents WHERE creator_id = ? OR counterparty_id = ?
        ORDER BY created_at DESC LIMIT 100
      `).bind(participantId, participantId)).all<Row>();

  const invoices = await (scopeAll
    ? env.DB.prepare(`
        SELECT id, invoice_number, invoice_type, status, total_amount, currency, issued_at, paid_at
        FROM invoices ORDER BY created_at DESC LIMIT 100
      `)
    : env.DB.prepare(`
        SELECT id, invoice_number, invoice_type, status, total_amount, currency, issued_at, paid_at
        FROM invoices WHERE from_participant_id = ?
        ORDER BY created_at DESC LIMIT 100
      `).bind(participantId)).all<Row>();

  const projectIds = (projects.results || []).map(p => String(p.id));
  let generation: { results: Row[] } = { results: [] };
  if (projectIds.length) {
    const placeholders = projectIds.map(() => '?').join(',');
    generation = await env.DB.prepare(`
      SELECT project_id, period_start, period_end, generation_mwh, availability_percentage,
             capacity_factor_percentage, net_payment_due
      FROM project_generation WHERE project_id IN (${placeholders})
      ORDER BY period_start DESC LIMIT 200
    `).bind(...projectIds).all<Row>();
  }

  const totalMw = (projects.results || []).reduce((a, r) => a + Number(r.capacity_mw || 0), 0);
  const totalGen = (generation.results || []).reduce((a, r) => a + Number(r.generation_mwh || 0), 0);
  const revenuePaid = (invoices.results || []).filter(r => r.status === 'paid').reduce((a, r) => a + Number(r.total_amount || 0), 0);

  return {
    role: 'ipp_developer',
    generated_at: new Date().toISOString(),
    summary: {
      projects: (projects.results || []).length,
      capacity_mw: Number(totalMw.toFixed(2)),
      generation_mwh: Number(totalGen.toFixed(2)),
      revenue_paid_zar: Number(revenuePaid.toFixed(2)),
      invoices: (invoices.results || []).length,
      contracts: (contracts.results || []).length,
    },
    sections: [
      { key: 'projects', label: 'Projects', rows: projects.results || [] },
      { key: 'generation', label: 'Generation (last 200 periods)', rows: generation.results || [] },
      { key: 'contracts', label: 'Contracts', rows: contracts.results || [] },
      { key: 'invoices', label: 'Invoices issued', rows: invoices.results || [] },
    ],
  };
}

async function buildOfftaker(env: HonoEnv, participantId: string, scopeAll: boolean): Promise<Report> {
  const contracts = await (scopeAll
    ? env.DB.prepare(`
        SELECT id, title, document_type, phase, creator_id, counterparty_id, created_at
        FROM contract_documents ORDER BY created_at DESC LIMIT 100
      `)
    : env.DB.prepare(`
        SELECT id, title, document_type, phase, creator_id, counterparty_id, created_at
        FROM contract_documents WHERE counterparty_id = ?
        ORDER BY created_at DESC LIMIT 100
      `).bind(participantId)).all<Row>();

  const invoices = await (scopeAll
    ? env.DB.prepare(`
        SELECT id, invoice_number, invoice_type, status, total_amount, currency, due_date, paid_at
        FROM invoices ORDER BY created_at DESC LIMIT 100
      `)
    : env.DB.prepare(`
        SELECT id, invoice_number, invoice_type, status, total_amount, currency, due_date, paid_at
        FROM invoices WHERE to_participant_id = ?
        ORDER BY created_at DESC LIMIT 100
      `).bind(participantId)).all<Row>();

  // Column names come from migrations/007_lois.sql: loi_drafts uses
  // `from_participant_id` (offtaker sender), `to_participant_id` (target IPP),
  // `annual_mwh`, `blended_price` — NOT target_ipp_id/share_pct/offtaker_id.
  const lois = await (scopeAll
    ? env.DB.prepare(`
        SELECT id, to_participant_id, status, annual_mwh, blended_price, created_at
        FROM loi_drafts ORDER BY created_at DESC LIMIT 100
      `).all<Row>().catch(() => ({ results: [] as Row[] }))
    : env.DB.prepare(`
        SELECT id, to_participant_id, status, annual_mwh, blended_price, created_at
        FROM loi_drafts WHERE from_participant_id = ?
        ORDER BY created_at DESC LIMIT 100
      `).bind(participantId).all<Row>().catch(() => ({ results: [] as Row[] })));

  const totalSpend = (invoices.results || []).reduce((a, r) => a + Number(r.total_amount || 0), 0);
  const paidSpend = (invoices.results || []).filter(r => r.status === 'paid').reduce((a, r) => a + Number(r.total_amount || 0), 0);
  const overdue = (invoices.results || []).filter(r => r.status === 'overdue').reduce((a, r) => a + Number(r.total_amount || 0), 0);
  const activeContracts = (contracts.results || []).filter(r => r.phase === 'active').length;

  return {
    role: 'offtaker',
    generated_at: new Date().toISOString(),
    summary: {
      active_contracts: activeContracts,
      invoices: (invoices.results || []).length,
      total_spend_zar: Number(totalSpend.toFixed(2)),
      paid_spend_zar: Number(paidSpend.toFixed(2)),
      overdue_zar: Number(overdue.toFixed(2)),
      lois_sent: (lois.results || []).length,
    },
    sections: [
      { key: 'contracts', label: 'Contracts', rows: contracts.results || [] },
      { key: 'invoices', label: 'Invoices received', rows: invoices.results || [] },
      { key: 'lois', label: 'LOIs sent', rows: lois.results || [] },
    ],
  };
}

async function buildLender(env: HonoEnv, participantId: string, scopeAll: boolean): Promise<Report> {
  const facilities = await (scopeAll
    ? env.DB.prepare(`
        SELECT id, facility_name, project_id, lender_participant_id, borrower_participant_id,
               facility_type, committed_amount, drawn_amount, currency, interest_rate_pct,
               tenor_months, dscr_covenant, status
        FROM loan_facilities ORDER BY created_at DESC LIMIT 200
      `)
    : env.DB.prepare(`
        SELECT id, facility_name, project_id, borrower_participant_id,
               facility_type, committed_amount, drawn_amount, currency, interest_rate_pct,
               tenor_months, dscr_covenant, status
        FROM loan_facilities WHERE lender_participant_id = ?
        ORDER BY created_at DESC LIMIT 200
      `).bind(participantId)).all<Row>();

  const facilityIds = (facilities.results || []).map(f => String(f.id));
  let disbursements: { results: Row[] } = { results: [] };
  if (facilityIds.length) {
    const placeholders = facilityIds.map(() => '?').join(',');
    disbursements = await env.DB.prepare(`
      SELECT id, facility_id, project_id, amount, currency, status, approved_at, created_at
      FROM disbursement_requests WHERE facility_id IN (${placeholders})
      ORDER BY created_at DESC LIMIT 200
    `).bind(...facilityIds).all<Row>();
  }

  const committed = (facilities.results || []).reduce((a, r) => a + Number(r.committed_amount || 0), 0);
  const drawn = (facilities.results || []).reduce((a, r) => a + Number(r.drawn_amount || 0), 0);
  const pendingDisbursements = (disbursements.results || []).filter(r => r.status === 'pending').length;

  return {
    role: 'lender',
    generated_at: new Date().toISOString(),
    summary: {
      facilities: (facilities.results || []).length,
      committed_zar: Number(committed.toFixed(2)),
      drawn_zar: Number(drawn.toFixed(2)),
      undrawn_zar: Number((committed - drawn).toFixed(2)),
      pending_disbursements: pendingDisbursements,
    },
    sections: [
      { key: 'facilities', label: 'Loan facilities', rows: facilities.results || [] },
      { key: 'disbursements', label: 'Disbursement requests', rows: disbursements.results || [] },
    ],
  };
}

async function buildCarbon(env: HonoEnv, participantId: string, scopeAll: boolean): Promise<Report> {
  const holdings = await (scopeAll
    ? env.DB.prepare(`
        SELECT id, participant_id, project_id, credit_type, quantity, vintage_year,
               cost_basis, status
        FROM carbon_holdings ORDER BY created_at DESC LIMIT 200
      `)
    : env.DB.prepare(`
        SELECT id, project_id, credit_type, quantity, vintage_year, cost_basis, status
        FROM carbon_holdings WHERE participant_id = ?
        ORDER BY created_at DESC LIMIT 200
      `).bind(participantId)).all<Row>();

  const retirements = await (scopeAll
    ? env.DB.prepare(`
        SELECT id, participant_id, project_id, quantity, beneficiary_name,
               retirement_date, created_at
        FROM carbon_retirements ORDER BY created_at DESC LIMIT 200
      `)
    : env.DB.prepare(`
        SELECT id, project_id, quantity, beneficiary_name, retirement_date, created_at
        FROM carbon_retirements WHERE participant_id = ?
        ORDER BY created_at DESC LIMIT 200
      `).bind(participantId)).all<Row>();

  const availableQty = (holdings.results || []).filter(r => r.status === 'available').reduce((a, r) => a + Number(r.quantity || 0), 0);
  const retiredQty = (retirements.results || []).reduce((a, r) => a + Number(r.quantity || 0), 0);
  const costBasis = (holdings.results || []).reduce((a, r) => a + Number(r.cost_basis || 0) * Number(r.quantity || 0), 0);

  return {
    role: 'carbon_fund',
    generated_at: new Date().toISOString(),
    summary: {
      holdings: (holdings.results || []).length,
      available_credits: Number(availableQty.toFixed(2)),
      retired_credits: Number(retiredQty.toFixed(2)),
      portfolio_cost_zar: Number(costBasis.toFixed(2)),
    },
    sections: [
      { key: 'holdings', label: 'Carbon holdings', rows: holdings.results || [] },
      { key: 'retirements', label: 'Retirements', rows: retirements.results || [] },
    ],
  };
}

async function buildGrid(env: HonoEnv): Promise<Report> {
  const [constraints, imbalance] = await Promise.all([
    env.DB.prepare(`
      SELECT id, constraint_type, location, severity, available_capacity_mw,
             start_date, end_date, status
      FROM grid_constraints ORDER BY created_at DESC LIMIT 200
    `).all<Row>(),
    env.DB.prepare(`
      SELECT id, period_start, period_end, participant_id, scheduled_kwh, actual_kwh,
             imbalance_kwh, imbalance_rate, imbalance_charge, within_tolerance
      FROM grid_imbalance ORDER BY period_start DESC LIMIT 200
    `).all<Row>(),
  ]);

  const active = (constraints.results || []).filter(r => r.status === 'active').length;
  const critical = (constraints.results || []).filter(r => r.severity === 'critical').length;
  const totalImbalance = (imbalance.results || []).reduce((a, r) => a + Math.abs(Number(r.imbalance_kwh || 0)), 0);
  const totalCharges = (imbalance.results || []).reduce((a, r) => a + Number(r.imbalance_charge || 0), 0);

  return {
    role: 'grid_operator',
    generated_at: new Date().toISOString(),
    summary: {
      constraints: (constraints.results || []).length,
      active_constraints: active,
      critical_severity: critical,
      imbalance_periods: (imbalance.results || []).length,
      total_abs_imbalance_kwh: Number(totalImbalance.toFixed(2)),
      total_imbalance_charges_zar: Number(totalCharges.toFixed(2)),
    },
    sections: [
      { key: 'constraints', label: 'Grid constraints', rows: constraints.results || [] },
      { key: 'imbalance', label: 'Imbalance events (last 200)', rows: imbalance.results || [] },
    ],
  };
}

async function buildRegulator(env: HonoEnv): Promise<Report> {
  await ensureRegulatorFilings(env);
  const [byType, byStatus, recent] = await Promise.all([
    env.DB.prepare(`
      SELECT filing_type, COUNT(*) count FROM regulator_filings
      GROUP BY filing_type ORDER BY count DESC
    `).all<Row>(),
    env.DB.prepare(`
      SELECT status, COUNT(*) count FROM regulator_filings
      GROUP BY status ORDER BY status
    `).all<Row>(),
    env.DB.prepare(`
      SELECT id, filing_type, reporting_period, filed_by, status, created_at
      FROM regulator_filings ORDER BY created_at DESC LIMIT 200
    `).all<Row>(),
  ]);

  return {
    role: 'regulator',
    generated_at: new Date().toISOString(),
    summary: {
      filings_total: (recent.results || []).length,
      filing_types: (byType.results || []).length,
    },
    sections: [
      { key: 'by_type', label: 'Filings by type', rows: byType.results || [] },
      { key: 'by_status', label: 'Filings by status', rows: byStatus.results || [] },
      { key: 'recent', label: 'Recent filings', rows: recent.results || [] },
    ],
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Router
// ──────────────────────────────────────────────────────────────────────────

async function buildFor(env: HonoEnv, role: ParticipantRole, participantId: string, scopeAll: boolean): Promise<Report> {
  switch (role) {
    case 'admin': return buildAdmin(env);
    case 'trader': return buildTrader(env, participantId, scopeAll);
    case 'ipp_developer': return buildIpp(env, participantId, scopeAll);
    case 'offtaker': return buildOfftaker(env, participantId, scopeAll);
    case 'lender': return buildLender(env, participantId, scopeAll);
    case 'carbon_fund': return buildCarbon(env, participantId, scopeAll);
    case 'grid_operator': return buildGrid(env);
    case 'regulator': return buildRegulator(env);
    case 'support':
      return buildAdmin(env);
  }
}

reports.get('/:role', async (c) => {
  const role = c.req.param('role') as ParticipantRole;
  const allowed: ParticipantRole[] = ['admin','trader','ipp_developer','offtaker','lender','carbon_fund','grid_operator','regulator','support'];
  if (!allowed.includes(role)) return c.json({ success: false, error: 'Invalid role' }, 400);
  const user = guard(c, role);
  if (!user) return c.json({ success: false, error: 'Forbidden' }, 403);
  const scopeAll = ADMIN_LIKE.has(user.role as ParticipantRole);
  const report = await buildFor(c.env, role, user.id, scopeAll);
  return c.json({ success: true, data: report });
});

reports.get('/:role/csv', async (c) => {
  const role = c.req.param('role') as ParticipantRole;
  const sectionKey = c.req.query('section');
  if (!sectionKey) return c.json({ success: false, error: 'section query param required' }, 400);
  const allowed: ParticipantRole[] = ['admin','trader','ipp_developer','offtaker','lender','carbon_fund','grid_operator','regulator','support'];
  if (!allowed.includes(role)) return c.json({ success: false, error: 'Invalid role' }, 400);
  const user = guard(c, role);
  if (!user) return c.json({ success: false, error: 'Forbidden' }, 403);
  const scopeAll = ADMIN_LIKE.has(user.role as ParticipantRole);
  const report = await buildFor(c.env, role, user.id, scopeAll);
  const section = report.sections.find(s => s.key === sectionKey);
  if (!section) return c.json({ success: false, error: 'Unknown section' }, 404);
  const csv = toCsv(section.rows);
  const filename = `report-${role}-${sectionKey}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^a-z0-9._-]/gi, '_')}"`,
    },
  });
});

export default reports;
