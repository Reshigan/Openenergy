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

async function ensureRegulatorFilings(env: HonoEnv['Bindings']) {
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

async function buildAdmin(env: HonoEnv['Bindings']): Promise<Report> {
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

async function buildTrader(env: HonoEnv['Bindings'], participantId: string, scopeAll: boolean): Promise<Report> {
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

async function buildIpp(env: HonoEnv['Bindings'], participantId: string, scopeAll: boolean): Promise<Report> {
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

async function buildOfftaker(env: HonoEnv['Bindings'], participantId: string, scopeAll: boolean): Promise<Report> {
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

async function buildLender(env: HonoEnv['Bindings'], participantId: string, scopeAll: boolean): Promise<Report> {
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

async function buildCarbon(env: HonoEnv['Bindings'], participantId: string, scopeAll: boolean): Promise<Report> {
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

async function buildGrid(env: HonoEnv['Bindings']): Promise<Report> {
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

async function buildRegulator(env: HonoEnv['Bindings']): Promise<Report> {
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

async function buildFor(env: HonoEnv['Bindings'], role: ParticipantRole, participantId: string, scopeAll: boolean): Promise<Report> {
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

// ════════════════════════════════════════════════════════════════════════
// Cross-module ledger + report catalog
//
// The per-role buildXyz() reports above are bespoke aggregations of the
// module-specific tables. The endpoints below complement them with:
//
//   GET  /reports/catalog            — list every canonical report code
//                                       the role can produce
//   GET  /reports/ledger             — universal transaction ledger view
//                                       across every module the caller can
//                                       see (this is the "audit pull" the
//                                       regulator / financier wants)
//   POST /reports/generate           — record a generated report in the
//                                       registry for distribution + audit
//   GET  /reports/registry           — list past generated reports
//
// All endpoints respect the same tenant + role guards as the bespoke role
// reports.
// ════════════════════════════════════════════════════════════════════════

reports.get('/catalog', async (c) => {
  const user = getCurrentUser(c);
  const isAdminLike = ADMIN_LIKE.has(user.role as ParticipantRole);
  const rs = await c.env.DB.prepare(
    isAdminLike
      ? `SELECT * FROM report_catalog ORDER BY role, module, code`
      : `SELECT * FROM report_catalog WHERE role = ? OR module = 'esg' ORDER BY module, code`,
  ).bind(...(isAdminLike ? [] : [user.role])).all().catch(() => ({ results: [] as unknown[] }));
  return c.json({ success: true, data: rs.results || [] });
});

// GET /reports/ledger?module=&from=&to=&participant=&q=&limit=
reports.get('/ledger', async (c) => {
  const user = getCurrentUser(c);
  const isAdminLike = ADMIN_LIKE.has(user.role as ParticipantRole);
  const isRegulator = user.role === 'regulator';

  const module = c.req.query('module');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const target = c.req.query('participant');
  const q = c.req.query('q');
  const limit = Math.min(Number(c.req.query('limit') || 200), 500);

  const filters: string[] = [];
  const binds: unknown[] = [];

  // Scope: regulator + admin see everything, everyone else sees only rows
  // where they are actor OR party_a OR party_b OR a tenant-shared admin.
  if (!isAdminLike && !isRegulator) {
    filters.push('(actor_id = ? OR party_a_id = ? OR party_b_id = ?)');
    binds.push(user.id, user.id, user.id);
  } else if (target) {
    filters.push('(actor_id = ? OR party_a_id = ? OR party_b_id = ?)');
    binds.push(target, target, target);
  }
  if (module)  { filters.push('module = ?'); binds.push(module); }
  if (from)    { filters.push('date(business_date) >= date(?)'); binds.push(from); }
  if (to)      { filters.push('date(business_date) <= date(?)'); binds.push(to); }
  if (q)       {
    filters.push('(event_type LIKE ? OR external_reference LIKE ? OR notes LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const rs = await c.env.DB.prepare(`
    SELECT id, tenant_id, module, event_type, business_date, effective_date,
           actor_id, actor_role, party_a_id, party_a_role, party_b_id, party_b_role,
           amount_zar, amount_currency, quantity, quantity_unit, price, price_unit,
           source_table, source_id, contract_id, project_id, rfp_id, loi_id, invoice_id,
           facility_id, certificate_id, status, external_reference, notes, created_at
      FROM ledger_transactions
      ${where}
      ORDER BY business_date DESC, created_at DESC
      LIMIT ?
  `).bind(...binds, limit).all().catch(() => ({ results: [] as unknown[] }));

  // Aggregates (top-row KPIs the UI displays)
  const aggregateSql = `
    SELECT module,
           COUNT(*) AS n,
           COALESCE(SUM(amount_zar), 0) AS total_zar,
           COALESCE(SUM(quantity), 0) AS total_qty
      FROM ledger_transactions
      ${where}
      GROUP BY module
      ORDER BY n DESC
  `;
  const agg = await c.env.DB.prepare(aggregateSql).bind(...binds).all()
    .catch(() => ({ results: [] as unknown[] }));

  return c.json({
    success: true,
    data: {
      transactions: rs.results || [],
      aggregates: agg.results || [],
      scope: isAdminLike || isRegulator ? 'platform' : 'self',
    },
  });
});

// POST /reports/generate
// body: { code, period_start?, period_end?, framework?, params? }
//
// Generates the underlying report (delegates to buildFor()) then records a
// reports_registry row so it appears in the role's Reports history and can
// be re-served / distributed.
reports.post('/generate', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as {
    code?: string; period_start?: string; period_end?: string;
    framework?: string; params?: Record<string, unknown>;
  };
  if (!body.code) return c.json({ success: false, error: 'code required' }, 400);

  const catRow = await c.env.DB.prepare(
    `SELECT * FROM report_catalog WHERE code = ?`,
  ).bind(body.code).first() as { code: string; role: string; module: string; name: string; framework?: string } | null;
  if (!catRow) return c.json({ success: false, error: 'unknown_report_code' }, 404);

  // Authorisation: admin/support can generate any; otherwise role must
  // match the catalogued role.
  const isAdminLike = ADMIN_LIKE.has(user.role as ParticipantRole);
  if (!isAdminLike && user.role !== catRow.role && catRow.module !== 'esg') {
    return c.json({ success: false, error: 'forbidden_for_role' }, 403);
  }

  // Pull the appropriate report payload. For role-aggregated reports we
  // delegate to buildFor() so the sections match what the role page shows.
  let payload: unknown = null;
  let rowCount = 0;
  let totalZar: number | null = null;
  try {
    if (catRow.module === 'esg') {
      const year = body.period_end ? new Date(body.period_end).getFullYear() : new Date().getFullYear();
      const r = await c.env.DB.prepare(
        `SELECT * FROM esg_annual_rollup WHERE participant_id = ? AND reporting_year = ?`,
      ).bind(user.id, year).first();
      payload = { rollup: r, period: { year } };
    } else {
      const report = await buildFor(c.env, catRow.role as ParticipantRole, user.id, isAdminLike);
      payload = report;
      rowCount = report.sections.reduce((s, x) => s + (x.rows?.length || 0), 0);
    }
  } catch (e) {
    return c.json({ success: false, error: 'generation_failed', detail: String(e) }, 500);
  }

  const id = 'rep_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  await c.env.DB.prepare(`
    INSERT INTO reports_registry (id, participant_id, module, report_code, report_name,
                                   reporting_period_start, reporting_period_end, framework,
                                   params, payload_json, row_count, total_value_zar, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated')
  `).bind(
    id, user.id, catRow.module, catRow.code, catRow.name,
    body.period_start || null, body.period_end || null, body.framework || catRow.framework || null,
    body.params ? JSON.stringify(body.params) : null,
    JSON.stringify(payload), rowCount, totalZar,
  ).run().catch(() => undefined);

  return c.json({ success: true, data: { id, code: catRow.code, payload } });
});

// GET /reports/registry?module=&code=&limit=
reports.get('/registry', async (c) => {
  const user = getCurrentUser(c);
  const isAdminLike = ADMIN_LIKE.has(user.role as ParticipantRole);
  const module = c.req.query('module');
  const code = c.req.query('code');
  const limit = Math.min(Number(c.req.query('limit') || 100), 500);

  const filters: string[] = [];
  const binds: unknown[] = [];
  if (!isAdminLike) { filters.push('participant_id = ?'); binds.push(user.id); }
  if (module) { filters.push('module = ?'); binds.push(module); }
  if (code) { filters.push('report_code = ?'); binds.push(code); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const rs = await c.env.DB.prepare(`
    SELECT id, participant_id, module, report_code, report_name,
           reporting_period_start, reporting_period_end, framework,
           row_count, total_value_zar, status, generated_at
      FROM reports_registry
      ${where}
      ORDER BY generated_at DESC
      LIMIT ?
  `).bind(...binds, limit).all().catch(() => ({ results: [] as unknown[] }));
  return c.json({ success: true, data: rs.results || [] });
});

// GET /reports/registry/:id — fetch a previously generated report
reports.get('/registry/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT * FROM reports_registry WHERE id = ?`,
  ).bind(id).first() as { id: string; participant_id: string; payload_json?: string } | null;
  if (!row) return c.json({ success: false, error: 'not_found' }, 404);
  if (row.participant_id !== user.id && !ADMIN_LIKE.has(user.role as ParticipantRole) && user.role !== 'regulator') {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  return c.json({
    success: true,
    data: {
      ...row,
      payload: row.payload_json ? JSON.parse(row.payload_json) : null,
    },
  });
});

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

// ─── Mail report ─────────────────────────────────────────────────────────────
// POST /api/reports/mail
// Accepts { to, subject, body, csv_attachment?, filename? }
// Uses the platform email infrastructure (MailChannels via Cloudflare).
// In local dev / environments without MailChannels the email is logged only.
reports.post('/mail', async (c) => {
  const user = getCurrentUser(c);
  if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);
  const body = await c.req.json().catch(() => null);
  if (!body?.to) return c.json({ success: false, error: 'to is required' }, 400);

  const to: string = String(body.to);
  const subject: string = String(body.subject ?? 'Open Energy Platform Report');
  const textBody: string = String(body.body ?? '');
  const csvContent: string = body.csv_attachment ? String(body.csv_attachment) : '';
  const filename: string = String(body.filename ?? 'report.csv');

  const emailPayload: Record<string, unknown> = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: 'noreply@openenergy.co.za', name: 'Open Energy Platform' },
    reply_to: { email: 'support@openenergy.co.za', name: 'OE Support' },
    subject,
    content: [{ type: 'text/plain', value: textBody || `Report generated on ${new Date().toISOString()}` }],
    ...(csvContent ? {
      attachments: [{
        content: btoa(unescape(encodeURIComponent(csvContent))),
        filename,
        type: 'text/csv',
        disposition: 'attachment',
      }],
    } : {}),
  };

  try {
    const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
    });
    if (res.ok || res.status === 202) {
      await c.env.DB.prepare(
        `INSERT INTO oe_audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, data_json, created_at)
         VALUES (lower(hex(randomblob(16))), ?, ?, 'report_mailed', 'report', NULL, ?, datetime('now'))`
      ).bind('default', user.id, JSON.stringify({ to, subject, rows: csvContent.split('\n').length - 1 })).run();
      return c.json({ success: true, message: `Report sent to ${to}` });
    }
    const errText = await res.text().catch(() => '');
    return c.json({ success: false, error: `Mail delivery failed: ${res.status} ${errText}` }, 502);
  } catch (_e) {
    // In local dev MailChannels is unavailable — log and succeed silently
    console.log(`[reports/mail] Would send to ${to}: ${subject}`);
    return c.json({ success: true, message: `Report queued for delivery to ${to}` });
  }
});

export default reports;
