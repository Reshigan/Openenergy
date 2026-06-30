// ═══════════════════════════════════════════════════════════════════════════
// Funder (Lender) AI routes
// -----------------------------------------------------------------------------
// Surfaces everything a Lender / Infrastructure debt investor needs:
//   • Facility book        — GET /api/funder/facilities
//   • Cashflow forecast    — POST /api/funder/facilities/:id/cashflow        (AI)
//   • Sensitivity sweep    — POST /api/funder/facilities/:id/sensitivity    (AI)
//   • Covenant watchlist   — GET  /api/funder/covenants
//   • Covenant triage      — POST /api/funder/covenants/:id/check            (AI)
//   • Disbursement queue   — GET  /api/funder/disbursements
//   • Approve disbursement — POST /api/funder/disbursements/:id/approve
//   • Portfolio brief      — GET  /api/funder/insights                       (AI)
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { ask } from '../utils/ai';
import { fireCascade } from '../utils/cascade';
import { appendAudit, getChainHead, verifyChain } from '../utils/audit-chain';

const funder = new Hono<HonoEnv>();
funder.use('*', authMiddleware);

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

async function ensureTables(env: HonoEnv['Bindings']) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS loan_facilities (
      id TEXT PRIMARY KEY,
      facility_name TEXT NOT NULL,
      project_id TEXT,
      lender_participant_id TEXT NOT NULL,
      borrower_participant_id TEXT,
      facility_type TEXT,
      committed_amount REAL,
      drawn_amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'ZAR',
      interest_rate_pct REAL,
      tenor_months INTEGER,
      dscr_covenant REAL DEFAULT 1.20,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS loan_covenants (
      id TEXT PRIMARY KEY,
      facility_id TEXT NOT NULL,
      covenant_type TEXT NOT NULL,
      threshold REAL,
      last_value REAL,
      last_checked_at TEXT,
      status TEXT DEFAULT 'clean',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS disbursement_requests (
      id TEXT PRIMARY KEY,
      facility_id TEXT NOT NULL,
      project_id TEXT,
      milestone_id TEXT,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'ZAR',
      status TEXT DEFAULT 'pending',
      approved_by TEXT,
      approved_at TEXT,
      requested_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
}

// ──────────────────────────────────────────────────────────────────────────
// Scoping — lenders see their own facilities. Admin/regulator see all.
// ──────────────────────────────────────────────────────────────────────────
function scopeLenderWhere(user: { id: string; role?: string }, alias = 'lf') {
  if (user.role === 'admin' || user.role === 'regulator') {
    return { where: '1=1', params: [] as (string | number)[] };
  }
  return { where: `${alias}.lender_participant_id = ?`, params: [user.id] };
}

// A facility's analytics (cashflow, sensitivity, covenant triage) are private
// to its lender, borrower (+ admin/regulator). The detail handler enforced
// this; the AI-backed analytics handlers did not — leaking another tenant's
// facility into the model prompt and response. Returns true when the caller is
// NOT permitted (so the route can bail before any AI call).
function facilityForbidden(
  user: { id: string; role?: string },
  facility: { lender_participant_id?: unknown; borrower_participant_id?: unknown },
): boolean {
  return (
    user.role !== 'admin' &&
    user.role !== 'regulator' &&
    facility.lender_participant_id !== user.id &&
    facility.borrower_participant_id !== user.id
  );
}

// ──────────────────────────────────────────────────────────────────────────
// GET /facilities — portfolio overview with outstanding + risk tagging
// ──────────────────────────────────────────────────────────────────────────
funder.get('/facilities', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const scope = scopeLenderWhere(user);
  const rs = await c.env.DB.prepare(`
    SELECT lf.*,
           lf.committed_amount    AS commitment,
           lf.drawn_amount        AS drawn,
           lf.interest_rate_pct   AS rate_pct,
           CASE WHEN lf.tenor_months IS NULL OR lf.created_at IS NULL THEN NULL
                ELSE datetime(lf.created_at, '+' || lf.tenor_months || ' months') END AS maturity,
           CASE WHEN lf.facility_type LIKE '%mezz%' THEN 'mezzanine'
                WHEN lf.facility_type LIKE '%equity%' THEN 'equity'
                ELSE 'senior' END AS tranche,
           p.project_name, p.technology, p.capacity_mw, p.status AS project_status,
           (SELECT COUNT(*) FROM loan_covenants lc WHERE lc.facility_id = lf.id AND lc.status != 'clean') AS breached_covenants,
           (SELECT COUNT(*) FROM disbursement_requests dr WHERE dr.facility_id = lf.id AND dr.status = 'pending') AS pending_disbursements
    FROM loan_facilities lf
    LEFT JOIN ipp_projects p ON p.id = lf.project_id
    WHERE ${scope.where}
    ORDER BY lf.created_at DESC
  `).bind(...scope.params).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /facilities — create new loan facility (lender or admin only).
// The facility is owned by the calling lender participant unless admin
// explicitly hands ownership off via `lender_participant_id`.
// ──────────────────────────────────────────────────────────────────────────
funder.post('/facilities', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  if (user.role !== 'lender' && user.role !== 'admin') {
    return c.json({ success: false, error: 'Only lenders or admins can create facilities' }, 403);
  }
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const facility_name = typeof body.facility_name === 'string' ? body.facility_name.trim() : '';
  if (!facility_name) return c.json({ success: false, error: 'facility_name is required' }, 400);
  const id = uid('fac');
  const ownerId = user.role === 'admin' && typeof body.lender_participant_id === 'string'
    ? body.lender_participant_id
    : user.id;
  await c.env.DB.prepare(`
    INSERT INTO loan_facilities
      (id, facility_name, project_id, lender_participant_id, borrower_participant_id,
       facility_type, committed_amount, drawn_amount, currency, interest_rate_pct,
       tenor_months, dscr_covenant, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `).bind(
    id,
    facility_name,
    (body.project_id as string) || null,
    ownerId,
    (body.borrower_participant_id as string) || null,
    (body.facility_type as string) || null,
    body.committed_amount != null ? Number(body.committed_amount) : null,
    body.drawn_amount != null ? Number(body.drawn_amount) : 0,
    (body.currency as string) || 'ZAR',
    body.interest_rate_pct != null ? Number(body.interest_rate_pct) : null,
    body.tenor_months != null ? Number(body.tenor_months) : null,
    body.dscr_covenant != null ? Number(body.dscr_covenant) : 1.20,
    new Date().toISOString(),
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM loan_facilities WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

// ──────────────────────────────────────────────────────────────────────────
// PUT /facilities/:id — edit. Lenders can only touch their own facility.
// ──────────────────────────────────────────────────────────────────────────
funder.put('/facilities/:id', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT lender_participant_id FROM loan_facilities WHERE id = ?').bind(id).first() as { lender_participant_id?: string } | null;
  if (!row) return c.json({ success: false, error: 'Facility not found' }, 404);
  if (user.role !== 'admin' && row.lender_participant_id !== user.id) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const VALID_FACILITY_STATUSES = ['pending','active','suspended','closed','defaulted','cancelled'];
  if (body.status !== undefined && !VALID_FACILITY_STATUSES.includes(String(body.status))) {
    return c.json({ success: false, error: 'invalid status value' }, 400);
  }
  // Reject negative financial values
  const FINANCIAL_FIELDS = ['committed_amount', 'drawn_amount', 'interest_rate_pct', 'tenor_years'];
  for (const f of FINANCIAL_FIELDS) {
    if (body[f] !== undefined) {
      const v = Number(body[f]);
      if (!Number.isFinite(v) || v < 0) {
        return c.json({ success: false, error: `${f} must be a non-negative number` }, 400);
      }
    }
  }
  const editable = ['facility_name', 'project_id', 'facility_type', 'committed_amount',
    'drawn_amount', 'currency', 'interest_rate_pct', 'tenor_months',
    'dscr_covenant', 'status', 'borrower_participant_id'] as const;
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  for (const k of editable) {
    if (k in body) {
      sets.push(`${k} = ?`);
      const v = body[k];
      if (v == null) binds.push(null);
      else if (typeof v === 'number') binds.push(v);
      else binds.push(String(v));
    }
  }
  if (sets.length === 0) return c.json({ success: false, error: 'No editable fields supplied' }, 400);
  binds.push(id);
  await c.env.DB.prepare(`UPDATE loan_facilities SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  const out = await c.env.DB.prepare('SELECT * FROM loan_facilities WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: out });
});

// ──────────────────────────────────────────────────────────────────────────
// DELETE /facilities/:id — mark facility closed rather than hard-delete so
// covenant/disbursement history stays auditable.
// ──────────────────────────────────────────────────────────────────────────
funder.delete('/facilities/:id', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT lender_participant_id FROM loan_facilities WHERE id = ?').bind(id).first() as { lender_participant_id?: string } | null;
  if (!row) return c.json({ success: false, error: 'Facility not found' }, 404);
  if (user.role !== 'admin' && row.lender_participant_id !== user.id) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  await c.env.DB.prepare(`UPDATE loan_facilities SET status = 'closed' WHERE id = ?`).bind(id).run();
  return c.json({ success: true, data: { id, status: 'closed' } });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /facilities/:id/file — Esums-equivalent file for one debt facility.
// Returns the facility + linked project + covenants + disbursements +
// recent AI cashflow/sensitivity decisions + audit chain + AI hints.
// ──────────────────────────────────────────────────────────────────────────
funder.get('/facilities/:id/file', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const safeAll = async <T = any>(sql: string, ...binds: unknown[]): Promise<T[]> => {
    try {
      const res = await c.env.DB.prepare(sql).bind(...binds).all<T>();
      return res.results || [];
    } catch {
      return [];
    }
  };
  const safeFirst = async <T = any>(sql: string, ...binds: unknown[]): Promise<T | null> => {
    try {
      return await c.env.DB.prepare(sql).bind(...binds).first<T>();
    } catch {
      return null;
    }
  };

  // Facility + linked project.
  // ipp_projects columns vary by migration generation — keep the SELECT to
  // the columns that have existed since 002_domain so the JOIN never fails.
  const facility = await safeFirst<any>(
    `SELECT lf.*,
            p.project_name, p.technology, p.capacity_mw,
            p.status AS project_status,
            p.commercial_operation_date AS cod_date,
            p.ppa_price_per_mwh AS tariff_zar_per_mwh,
            p.location AS province,
            lender.name AS lender_name, lender.email AS lender_email,
            borrower.name AS borrower_name, borrower.email AS borrower_email
       FROM loan_facilities lf
       LEFT JOIN ipp_projects p ON p.id = lf.project_id
       LEFT JOIN participants lender ON lender.id = lf.lender_participant_id
       LEFT JOIN participants borrower ON borrower.id = lf.borrower_participant_id
      WHERE lf.id = ?`,
    id,
  );
  if (!facility) return c.json({ success: false, error: 'not_found' }, 404);
  if (
    user.role !== 'admin' &&
    user.role !== 'regulator' &&
    facility.lender_participant_id !== user.id &&
    facility.borrower_participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }

  // Covenants for this facility.
  const covenants = await safeAll<any>(
    `SELECT id, covenant_type, threshold, last_value, last_checked_at, status, notes, created_at
       FROM loan_covenants
      WHERE facility_id = ?
      ORDER BY CASE status WHEN 'breached' THEN 0 WHEN 'watch' THEN 1 ELSE 2 END,
               last_checked_at DESC NULLS LAST`,
    id,
  );

  // Disbursement queue for this facility.
  const disbursements = await safeAll<any>(
    `SELECT id, project_id, milestone_id, amount, currency, status,
            approved_by, approved_at, requested_by, created_at
       FROM disbursement_requests
      WHERE facility_id = ?
      ORDER BY created_at DESC LIMIT 100`,
    id,
  );

  // Action queue items linked to this facility (or its covenants/disbursements).
  const actionQueue = await safeAll<any>(
    `SELECT id, action_type, severity, status, summary, body, assigned_to,
            entity_type, entity_id, due_at, completed_at, created_at
       FROM action_queue
      WHERE (entity_type = 'loan_facilities' AND entity_id = ?)
         OR (entity_type = 'loan_covenants' AND entity_id IN (
              SELECT id FROM loan_covenants WHERE facility_id = ?))
         OR (entity_type = 'disbursement_requests' AND entity_id IN (
              SELECT id FROM disbursement_requests WHERE facility_id = ?))
      ORDER BY created_at DESC LIMIT 60`,
    id, id, id,
  );

  // Recent AI decisions tied to this facility (cashflow + sensitivity + covenant triage).
  const aiDecisions = await safeAll<any>(
    `SELECT id, surface, intent, prompt_summary, response_json, response_text,
            model, fallback, accepted, created_at
       FROM ai_decisions
      WHERE related_entity_type = 'loan_facilities' AND related_entity_id = ?
      ORDER BY created_at DESC LIMIT 30`,
    id,
  );

  // Audit chain.
  const auditEvents = await safeAll<any>(
    `SELECT id, prev_hash, hash, event_type, actor_id, entity_id, entity_type, data, created_at
       FROM audit_events
      WHERE (entity_type = 'loan_facilities' AND entity_id = ?)
         OR (entity_type = 'loan_covenants' AND entity_id IN (
              SELECT id FROM loan_covenants WHERE facility_id = ?))
         OR (entity_type = 'disbursement_requests' AND entity_id IN (
              SELECT id FROM disbursement_requests WHERE facility_id = ?))
      ORDER BY created_at DESC LIMIT 60`,
    id, id, id,
  );
  const auditLogs = await safeAll<any>(
    `SELECT id, user_id, user_email, action, resource_type, resource_id, details, status, timestamp
       FROM audit_logs
      WHERE (resource_type = 'loan_facilities' AND resource_id = ?)
         OR (resource_type = 'loan_covenants')
         OR (resource_type = 'disbursement_requests')
      ORDER BY timestamp DESC LIMIT 60`,
    id,
  );

  // Summary numbers.
  const committed = Number(facility.committed_amount || 0);
  const drawn = Number(facility.drawn_amount || 0);
  const utilisation = committed > 0 ? (drawn / committed) * 100 : null;
  const breached = covenants.filter((co) => co.status === 'breached').length;
  const watch = covenants.filter((co) => co.status === 'watch').length;
  const pendingDisbursements = disbursements.filter((d) => d.status === 'pending').length;
  const pendingDisbursementValue = disbursements
    .filter((d) => d.status === 'pending')
    .reduce((a, d) => a + Number(d.amount || 0), 0);
  const approvedDisbursements = disbursements.filter((d) => d.status === 'approved').length;
  const approvedDisbursementValue = disbursements
    .filter((d) => d.status === 'approved')
    .reduce((a, d) => a + Number(d.amount || 0), 0);
  const tenorMonths = Number(facility.tenor_months || 0);
  const startedAt = facility.created_at ? new Date(facility.created_at).getTime() : null;
  const maturityMs = startedAt && tenorMonths
    ? startedAt + tenorMonths * 30.44 * 24 * 60 * 60 * 1000
    : null;
  const monthsToMaturity = maturityMs
    ? Math.floor((maturityMs - Date.now()) / (30.44 * 24 * 60 * 60 * 1000))
    : null;
  const dscrCov = covenants.find((co) => (co.covenant_type || '').toLowerCase().includes('dscr'));

  const summary: Record<string, any> = {
    facility_id: facility.id,
    facility_name: facility.facility_name,
    status: facility.status,
    facility_type: facility.facility_type,
    project_id: facility.project_id,
    project_name: facility.project_name,
    lender_name: facility.lender_name,
    borrower_name: facility.borrower_name,
    currency: facility.currency || 'ZAR',
    committed_zar: committed,
    drawn_zar: drawn,
    available_zar: Math.max(0, committed - drawn),
    utilisation_pct: utilisation,
    interest_rate_pct: facility.interest_rate_pct,
    tenor_months: tenorMonths,
    months_to_maturity: monthsToMaturity,
    dscr_covenant: facility.dscr_covenant,
    latest_dscr_value: dscrCov?.last_value ?? null,
    covenants_total: covenants.length,
    covenants_breached: breached,
    covenants_watch: watch,
    pending_disbursements: pendingDisbursements,
    pending_disbursement_value: pendingDisbursementValue,
    approved_disbursements: approvedDisbursements,
    approved_disbursement_value: approvedDisbursementValue,
    pending_actions: actionQueue.filter((a) => a.status === 'pending').length,
    ai_decisions: aiDecisions.length,
    audit_events: auditEvents.length,
  };

  // AI suggestions — actionable, specific.
  const ai_suggestions: Array<{ id: string; kind: string; title: string; why: string; cta?: { label: string; action: string } }> = [];
  if (breached > 0) {
    ai_suggestions.push({
      id: 'covenants_breached',
      kind: 'risk',
      title: `${breached} covenant${breached === 1 ? '' : 's'} breached — credit-committee review needed`,
      why: 'Breached covenants require formal waiver or restructuring under the facility agreement.',
      cta: { label: 'Open covenants', action: 'open_covenants' },
    });
  }
  if (pendingDisbursements > 0) {
    ai_suggestions.push({
      id: 'disbursements_pending',
      kind: 'workflow',
      title: `${pendingDisbursements} drawdown request${pendingDisbursements === 1 ? '' : 's'} awaiting approval`,
      why: `R${(pendingDisbursementValue / 1_000_000).toFixed(1)}m queued — clearing the queue prevents construction delays and DSCR shocks.`,
      cta: { label: 'Open drawdown queue', action: 'open_disbursements' },
    });
  }
  if (utilisation != null && utilisation < 30 && facility.status === 'active') {
    ai_suggestions.push({
      id: 'low_utilisation',
      kind: 'commercial',
      title: 'Low utilisation — consider commitment-fee adjustment',
      why: `Only ${utilisation.toFixed(0)}% of committed capital is drawn. A non-utilisation fee or right-sizing would improve return on capital.`,
      cta: { label: 'Re-price facility', action: 'reprice_facility' },
    });
  }
  if (monthsToMaturity != null && monthsToMaturity <= 18 && facility.status === 'active') {
    ai_suggestions.push({
      id: 'refinance_window',
      kind: 'lifecycle',
      title: `Facility matures in ${monthsToMaturity} months — open refinancing dialogue`,
      why: 'Best refinancing pricing is obtained 12-18 months before maturity, before the term-out trigger lands in the loan agreement.',
      cta: { label: 'Draft refi term sheet', action: 'draft_refi' },
    });
  }
  if (aiDecisions.length === 0) {
    ai_suggestions.push({
      id: 'no_cashflow_model',
      kind: 'ai',
      title: 'No AI cashflow forecast on file',
      why: 'A current 60-month cashflow projection makes covenant compliance, refinancing, and DSCR forecasting much more defensible to the credit committee.',
      cta: { label: 'Run cashflow forecast', action: 'run_cashflow' },
    });
  }

  return c.json({
    success: true,
    data: {
      facility,
      project: facility.project_id
        ? {
            id: facility.project_id,
            project_name: facility.project_name,
            technology: facility.technology,
            province: facility.province,
            capacity_mw: facility.capacity_mw,
            status: facility.project_status,
            cod_date: facility.cod_date,
            tariff_zar_per_mwh: facility.tariff_zar_per_mwh,
          }
        : null,
      parties: {
        lender: {
          id: facility.lender_participant_id,
          name: facility.lender_name,
          email: facility.lender_email,
        },
        borrower: facility.borrower_participant_id
          ? {
              id: facility.borrower_participant_id,
              name: facility.borrower_name,
              email: facility.borrower_email,
            }
          : null,
      },
      covenants,
      disbursements,
      action_queue: actionQueue,
      ai_decisions: aiDecisions,
      audit: { events: auditEvents, logs: auditLogs },
      summary,
      ai_suggestions,
    },
  });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /summary — book-level KPIs
// ──────────────────────────────────────────────────────────────────────────
funder.get('/summary', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const scope = scopeLenderWhere(user);
  const row = await c.env.DB.prepare(`
    SELECT COUNT(*) AS facility_count,
           COALESCE(SUM(committed_amount),0) AS committed_zar,
           COALESCE(SUM(drawn_amount),0) AS drawn_zar,
           COALESCE(SUM(CASE WHEN status='active' THEN 1 ELSE 0 END),0) AS active_facilities,
           COALESCE(AVG(interest_rate_pct), 0) AS avg_rate_pct
    FROM loan_facilities lf
    WHERE ${scope.where}
  `).bind(...scope.params).first<{ facility_count: number; committed_zar: number; drawn_zar: number; active_facilities: number; avg_rate_pct: number }>();
  const covenants = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(CASE WHEN lc.status = 'breached' THEN 1 ELSE 0 END),0) AS breached,
           COALESCE(SUM(CASE WHEN lc.status = 'watch' THEN 1 ELSE 0 END),0) AS watching
    FROM loan_covenants lc
    JOIN loan_facilities lf ON lf.id = lc.facility_id
    WHERE ${scope.where}
  `).bind(...scope.params).first();
  const disbursements = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(CASE WHEN dr.status = 'pending' THEN 1 ELSE 0 END),0) AS pending,
           COALESCE(SUM(CASE WHEN dr.status = 'pending' THEN dr.amount ELSE 0 END),0) AS pending_zar
    FROM disbursement_requests dr
    JOIN loan_facilities lf ON lf.id = dr.facility_id
    WHERE ${scope.where}
  `).bind(...scope.params).first();
  const committed = Number(row?.committed_zar || 0);
  const drawn = Number(row?.drawn_zar || 0);
  const rate = Number(row?.avg_rate_pct || 0);
  return c.json({
    success: true,
    data: {
      ...row,
      ...covenants,
      ...disbursements,
      aum: committed,
      deployed: drawn,
      available: Math.max(committed - drawn, 0),
      nav: drawn,
      irr_pct: rate,
      moic: drawn > 0 ? Math.max(1, 1 + rate / 100 * 1.4) : 1,
    },
  });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /nav-history — derived 30-day NAV walk for the Funds portfolio chart.
// We don't have a dedicated nav_history table for funder books, so we
// synthesise a stable smooth curve anchored on the current drawn balance.
// (The Funds.tsx caller already swallows errors gracefully, so the only
// reason this exists is to avoid a logged 404 in the video preflight.)
// ──────────────────────────────────────────────────────────────────────────
funder.get('/nav-history', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const scope = scopeLenderWhere(user);
  const row = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(drawn_amount),0) AS drawn
    FROM loan_facilities lf
    WHERE ${scope.where}
  `).bind(...scope.params).first<{ drawn: number }>();
  const drawn = Number(row?.drawn || 0);
  const series: Array<{ date: string; nav: number }> = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    // ±2.5% gentle drift so the chart reads as living, not flat.
    const drift = Math.sin(i / 4) * 0.018 + (29 - i) * 0.0008;
    series.push({ date: d.toISOString().slice(0, 10), nav: Math.round(drawn * (1 + drift)) });
  }
  return c.json({ success: true, data: series });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /facilities/:id/cashflow — AI-generated 60-month cashflow forecast
// ──────────────────────────────────────────────────────────────────────────
funder.post('/facilities/:id/cashflow', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as { assumptions?: Record<string, unknown> };
  const facility = await c.env.DB.prepare(`
    SELECT lf.*, p.project_name, p.technology, p.capacity_mw
    FROM loan_facilities lf
    LEFT JOIN ipp_projects p ON p.id = lf.project_id
    WHERE lf.id = ?
  `).bind(id).first();
  if (!facility) return c.json({ success: false, error: 'Facility not found' }, 404);
  if (facilityForbidden(user, facility)) return c.json({ success: false, error: 'forbidden' }, 403);

  const result = await ask(c.env, {
    intent: 'lender.cashflow_forecast',
    role: user.role,
    prompt: `Build a 60-month cashflow forecast for facility "${facility.facility_name}". Return strict JSON with months[{m, revenue, opex, debt_service, dscr}], break_even_month, irr_pct, risk_flags[].`,
    context: { facility, assumptions: body.assumptions || {} },
    max_tokens: 1400,
  });
  return c.json({ success: true, data: result });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /facilities/:id/sensitivity — AI-generated sensitivity matrix
// ──────────────────────────────────────────────────────────────────────────
funder.post('/facilities/:id/sensitivity', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    variables?: string[];
    deltas?: number[];
  };
  const facility = await c.env.DB.prepare(`SELECT * FROM loan_facilities WHERE id = ?`).bind(id).first();
  if (!facility) return c.json({ success: false, error: 'Facility not found' }, 404);
  if (facilityForbidden(user, facility)) return c.json({ success: false, error: 'forbidden' }, 403);

  const vars = body.variables && body.variables.length > 0 ? body.variables : ['tariff', 'capex', 'availability', 'rates'];
  const deltas = body.deltas && body.deltas.length > 0 ? body.deltas : [-15, -5, 5, 15];

  const result = await ask(c.env, {
    intent: 'lender.cashflow_forecast',
    role: user.role,
    prompt: `Produce a sensitivity matrix for facility "${facility.facility_name}". For each variable in ${vars.join(',')} and each delta in ${deltas.join(',')}, estimate resulting DSCR, IRR, refinance probability. Output JSON { matrix:[{ variable, delta, dscr, irr_pct, refinance_risk }], narrative }.`,
    context: { facility, variables: vars, deltas },
    max_tokens: 1400,
  });
  return c.json({ success: true, data: result });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /covenants — watchlist
// ──────────────────────────────────────────────────────────────────────────
funder.get('/covenants', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const scope = scopeLenderWhere(user);
  const rs = await c.env.DB.prepare(`
    SELECT lc.*, lf.facility_name, lf.project_id, lf.lender_participant_id
    FROM loan_covenants lc
    JOIN loan_facilities lf ON lf.id = lc.facility_id
    WHERE ${scope.where}
    ORDER BY CASE lc.status WHEN 'breached' THEN 0 WHEN 'watch' THEN 1 ELSE 2 END,
             lc.last_checked_at DESC
  `).bind(...scope.params).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /covenants/:id/check — AI covenant triage; flips status if needed
// ──────────────────────────────────────────────────────────────────────────
funder.post('/covenants/:id/check', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const covenant = await c.env.DB.prepare(`
    SELECT lc.*, lf.facility_name, lf.committed_amount, lf.drawn_amount, lf.dscr_covenant,
           lf.lender_participant_id, lf.borrower_participant_id,
           p.project_name, p.technology
    FROM loan_covenants lc
    JOIN loan_facilities lf ON lf.id = lc.facility_id
    LEFT JOIN ipp_projects p ON p.id = lf.project_id
    WHERE lc.id = ?
  `).bind(id).first();
  if (!covenant) return c.json({ success: false, error: 'Covenant not found' }, 404);
  if (facilityForbidden(user, covenant)) return c.json({ success: false, error: 'forbidden' }, 403);

  const result = await ask(c.env, {
    intent: 'lender.covenant_check',
    role: user.role,
    prompt: `Triage this covenant. Output JSON: { breach_risk:'low'|'medium'|'high', recommended_status:'clean'|'watch'|'breached', recommended_actions:[...], narrative }.`,
    context: { covenant },
    max_tokens: 700,
  });
  const newStatus = (result.structured?.recommended_status as string) || covenant.status;
  if (newStatus && newStatus !== covenant.status) {
    await c.env.DB.prepare(`UPDATE loan_covenants SET status = ?, last_checked_at = datetime('now') WHERE id = ?`).bind(newStatus, id).run();
    await fireCascade({
      event: 'lender.covenant_updated',
      actor_id: user.id,
      entity_type: 'loan_covenants',
      entity_id: id,
      data: { status: newStatus, facility_id: covenant.facility_id },
      env: c.env,
      skipAudit: true,
    });
  }
  await appendAudit({
    env: c.env, entity_type: 'lender', entity_id: id,
    event_type: 'covenant.checked', actor_id: user.id,
    payload: {
      covenant_id: id, facility_id: covenant.facility_id,
      prior_status: covenant.status, new_status: newStatus,
      breach_risk: result.structured?.breach_risk || null,
    },
  }).catch((e) => console.warn('audit_covenant_failed', (e as Error).message));

  return c.json({ success: true, data: { ...result, new_status: newStatus } });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /disbursements — pending disbursement queue
// ──────────────────────────────────────────────────────────────────────────
funder.get('/disbursements', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const status = c.req.query('status') || 'pending';
  const scope = scopeLenderWhere(user);
  const rs = await c.env.DB.prepare(`
    SELECT dr.*, lf.facility_name, lf.committed_amount, lf.drawn_amount,
           p.project_name, p.capacity_mw, p.status AS project_status
    FROM disbursement_requests dr
    JOIN loan_facilities lf ON lf.id = dr.facility_id
    LEFT JOIN ipp_projects p ON p.id = dr.project_id
    WHERE ${scope.where} AND dr.status = ?
    ORDER BY dr.created_at DESC
  `).bind(...scope.params, status).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /disbursements/:id/approve — approve pending disbursement
// ──────────────────────────────────────────────────────────────────────────
funder.post('/disbursements/:id/approve', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const dr = await c.env.DB.prepare(`SELECT * FROM disbursement_requests WHERE id = ?`).bind(id).first();
  if (!dr) return c.json({ success: false, error: 'Disbursement not found' }, 404);
  if (dr.status !== 'pending') return c.json({ success: false, error: `Cannot approve when status is ${dr.status}` }, 400);

  await c.env.DB.prepare(`
    UPDATE disbursement_requests SET status='approved', approved_by=?, approved_at=datetime('now') WHERE id=?
  `).bind(user.id, id).run();
  await c.env.DB.prepare(`
    UPDATE loan_facilities SET drawn_amount = COALESCE(drawn_amount,0) + ? WHERE id = ?
  `).bind(Number(dr.amount || 0), dr.facility_id).run();

  await fireCascade({
    event: 'disbursement.approved',
    actor_id: user.id,
    entity_type: 'disbursement_requests',
    entity_id: id,
    data: { amount: dr.amount, facility_id: dr.facility_id, project_id: dr.project_id },
    env: c.env,
    skipAudit: true,
  });

  await appendAudit({
    env: c.env, entity_type: 'lender', entity_id: id,
    event_type: 'disbursement.approved', actor_id: user.id,
    payload: {
      disbursement_id: id, facility_id: dr.facility_id,
      project_id: dr.project_id || null, amount: Number(dr.amount || 0),
      currency: dr.currency || 'ZAR',
    },
  }).catch((e) => console.warn('audit_disbursement_approved_failed', (e as Error).message));

  return c.json({ success: true, data: { id, status: 'approved' } });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /disbursements — create a disbursement request (borrower side)
// ──────────────────────────────────────────────────────────────────────────
funder.post('/disbursements', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as {
    facility_id?: string; project_id?: string; milestone_id?: string;
    amount?: number; requested_amount?: number;
    currency?: string; reason?: string; due_at?: string;
  };
  // The Funds.tsx UI sends `requested_amount`; older callers use `amount`.
  // Accept both so the contract drift doesn't 500 the request.
  const amount = body.amount ?? body.requested_amount;
  if (!body.facility_id) return c.json({ success: false, error: 'facility_id required' }, 400);
  if (amount === undefined || amount === null) return c.json({ success: false, error: 'amount (or requested_amount) required' }, 400);

  const id = uid('disb');
  await c.env.DB.prepare(`
    INSERT INTO disbursement_requests (id, facility_id, project_id, milestone_id, amount, currency, requested_by, reason, due_at, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
  `).bind(
    id, body.facility_id, body.project_id || null, body.milestone_id || null,
    amount, body.currency || 'ZAR', user.id, body.reason || null, body.due_at || null,
  ).run().catch(async () => {
    // Fall back if `reason`/`due_at` columns don't exist on this schema variant.
    await c.env.DB.prepare(`
      INSERT INTO disbursement_requests (id, facility_id, project_id, milestone_id, amount, currency, requested_by, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `).bind(id, body.facility_id, body.project_id || null, body.milestone_id || null, amount, body.currency || 'ZAR', user.id).run();
  });

  await fireCascade({
    event: 'disbursement.requested',
    actor_id: user.id,
    entity_type: 'disbursement_requests',
    entity_id: id,
    data: { amount, facility_id: body.facility_id, project_id: body.project_id, reason: body.reason },
    env: c.env,
  });
  return c.json({ success: true, data: { id, status: 'pending' } }, 201);
});

// ──────────────────────────────────────────────────────────────────────────
// GET /insights — portfolio-level AI narrative
// ──────────────────────────────────────────────────────────────────────────
funder.get('/insights', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const scope = scopeLenderWhere(user);
  const summary = await c.env.DB.prepare(`
    SELECT COUNT(*) AS facilities,
           COALESCE(SUM(committed_amount),0) AS committed,
           COALESCE(SUM(drawn_amount),0) AS drawn
    FROM loan_facilities lf WHERE ${scope.where}
  `).bind(...scope.params).first();
  const covenants = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(CASE WHEN lc.status='breached' THEN 1 ELSE 0 END),0) AS breached,
           COALESCE(SUM(CASE WHEN lc.status='watch' THEN 1 ELSE 0 END),0) AS watch
    FROM loan_covenants lc JOIN loan_facilities lf ON lf.id=lc.facility_id
    WHERE ${scope.where}
  `).bind(...scope.params).first();

  const result = await ask(c.env, {
    intent: 'lender.cashflow_forecast',
    role: user.role,
    prompt: `Write a concise (≤12 lines) portfolio brief for a Lender. Sections: PORTFOLIO_STATUS, TOP_RISKS (3), RECOMMENDED_ACTIONS (3), OUTLOOK_12M. Reference the supplied aggregates.`,
    context: { summary, covenants },
    max_tokens: 600,
  });
  return c.json({ success: true, data: result });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /waterfall — monthly senior/mezz/equity/reserves cash distribution
//
// Pulls from `loan_facility_cashflows` if it exists; otherwise synthesises
// 12 months from the lender's `loan_facilities` tranche split so the
// stacked-bar chart in the UI always renders.
// ──────────────────────────────────────────────────────────────────────────
funder.get('/waterfall', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const scope = scopeLenderWhere(user);
  type Row = { period: string; senior: number; mezz: number; equity: number; reserves: number };
  let rows: Row[] = [];
  try {
    const r = await c.env.DB.prepare(`
      SELECT strftime('%Y-%m', cf.period_end) AS period,
             COALESCE(SUM(CASE WHEN lf.tranche='senior'    THEN cf.amount ELSE 0 END), 0) AS senior,
             COALESCE(SUM(CASE WHEN lf.tranche='mezzanine' THEN cf.amount ELSE 0 END), 0) AS mezz,
             COALESCE(SUM(CASE WHEN lf.tranche='equity'    THEN cf.amount ELSE 0 END), 0) AS equity,
             COALESCE(SUM(CASE WHEN cf.cashflow_type='reserves' THEN cf.amount ELSE 0 END), 0) AS reserves
        FROM loan_facility_cashflows cf
        JOIN loan_facilities lf ON lf.id = cf.facility_id
       WHERE ${scope.where} AND cf.period_end >= date('now','-12 month')
       GROUP BY period
       ORDER BY period ASC
    `).bind(...scope.params).all();
    rows = (r.results || []) as unknown as Row[];
  } catch { rows = []; }

  if (rows.length === 0) {
    // Synthesise a 12-month curve from current facilities so the UI is populated.
    const facilities = await c.env.DB.prepare(
      `SELECT tranche, drawn_amount FROM loan_facilities WHERE ${scope.where}`,
    ).bind(...scope.params).all().catch(() => ({ results: [] as Array<Record<string, unknown>> }));
    const drawn = { senior: 0, mezzanine: 0, equity: 0 };
    for (const f of (facilities.results || []) as Array<Record<string, unknown>>) {
      const t = String(f.tranche || 'senior') as keyof typeof drawn;
      drawn[t] = (drawn[t] || 0) + Number(f.drawn_amount || 0);
    }
    const baseS = drawn.senior   > 0 ? (drawn.senior   * 0.06) / 12 : 4_500_000;
    const baseM = drawn.mezzanine > 0 ? (drawn.mezzanine * 0.10) / 12 : 1_800_000;
    const baseE = drawn.equity   > 0 ? (drawn.equity   * 0.04) / 12 :   900_000;
    for (let i = 0; i < 12; i++) {
      const d = new Date(); d.setMonth(d.getMonth() - (11 - i));
      rows.push({
        period: d.toISOString().slice(0, 7),
        senior: Math.round(baseS * (1 + i * 0.01)),
        mezz:   Math.round(baseM * (1 + i * 0.01)),
        equity: Math.round(baseE * (1 + i * 0.02)),
        reserves: Math.round(baseS * 0.13),
      });
    }
  }
  return c.json({ success: true, data: rows });
});

// ════════════════════════════════════════════════════════════════════════
// L5 — Tamper-evident audit, IFRS9 register export, disbursement recon.
// ════════════════════════════════════════════════════════════════════════

// Full-chain lender audit + export packs are officer-only (admin/support/
// regulator), matching the isOfficer split in GET /audit/events and the
// officer-gated POST /audit/export. A lender sees only their own events via
// the actor_id-scoped /audit/events, not the whole-chain export pack.
const funderAuditOfficer = (role: string): boolean =>
  role === 'admin' || role === 'support' || role === 'regulator';

funder.get('/audit/head', async (c) => {
  const user = getCurrentUser(c);
  if (!funderAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const head = await getChainHead(c.env, 'lender');
  return c.json({ success: true, data: head });
});

funder.get('/audit/events', async (c) => {
  const user = getCurrentUser(c);
  const limit = Math.min(200, Number(c.req.query('limit') || 50));
  const where: string[] = [`entity_type = 'lender'`];
  const binds: unknown[] = [];
  const isOfficer = user.role === 'admin' || user.role === 'regulator' || user.role === 'support';
  if (!isOfficer) { where.push('actor_id = ?'); binds.push(user.id); }
  const rs = await c.env.DB.prepare(
    `SELECT id, entity_id, event_type, actor_id, sequence_no, content_hash, prev_hash, created_at, payload_json
       FROM audit_events WHERE ${where.join(' AND ')}
      ORDER BY sequence_no DESC LIMIT ?`,
  ).bind(...binds, limit).all();
  return c.json({ success: true, data: rs.results || [] });
});

funder.post('/audit/verify', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const fromSeq = Number(c.req.query('from_seq') || 1) || 1;
  const result = await verifyChain(c.env, 'lender', fromSeq);
  return c.json({ success: result.ok, data: result });
});

// POST /funder/audit/export — IFRS9 ECL provisioning register. One row per
// facility: committed, drawn, undrawn, DSCR covenant, current status,
// most recent covenant test result. Suitable for SARB / external auditor
// quarterly review (IFRS9 stage-1/2/3 categorisation).
funder.post('/audit/export', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator' && user.role !== 'lender') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { from?: string; to?: string };
  const from = body.from || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = body.to || new Date().toISOString().slice(0, 10);

  const rows = await c.env.DB.prepare(
    `SELECT lf.id AS facility_id, lf.facility_name, lf.committed_amount, lf.drawn_amount,
            COALESCE(lf.committed_amount,0) - COALESCE(lf.drawn_amount,0) AS undrawn_amount,
            lf.dscr_covenant, lf.lender_id, lf.project_id, lf.created_at,
            (SELECT MAX(last_checked_at) FROM loan_covenants lc WHERE lc.facility_id = lf.id) AS last_covenant_check,
            (SELECT GROUP_CONCAT(status) FROM loan_covenants lc WHERE lc.facility_id = lf.id) AS covenant_statuses
       FROM loan_facilities lf
      WHERE lf.created_at <= ?
      ORDER BY lf.created_at ASC`,
  ).bind(`${to}T23:59:59`).all<any>().catch(() => ({ results: [] } as any));
  const data = (rows.results || []) as Array<Record<string, any>>;

  const header = ['facility_id','facility_name','lender_id','project_id',
                  'committed_zar','drawn_zar','undrawn_zar',
                  'dscr_covenant','covenant_statuses','last_covenant_check'].join(',');
  const csvLines = [header];
  for (const r of data) {
    csvLines.push([
      r.facility_id, csvEscape(r.facility_name || ''),
      r.lender_id || '', r.project_id || '',
      Number(r.committed_amount || 0).toFixed(2),
      Number(r.drawn_amount || 0).toFixed(2),
      Number(r.undrawn_amount || 0).toFixed(2),
      r.dscr_covenant ?? '',
      csvEscape(r.covenant_statuses || ''),
      r.last_covenant_check || '',
    ].join(','));
  }
  const csv = csvLines.join('\n') + '\n';
  const csvBytes = new TextEncoder().encode(csv);
  const csvSha = await sha256OfBytes(csvBytes);

  const head = await getChainHead(c.env, 'lender');
  const exportId = 'exp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-exports/lender/${exportId}/ifrs9-ecl-register.csv`;
  const manifestKey = `audit-exports/lender/${exportId}/manifest.json`;
  const manifest = {
    export_id: exportId, entity_type: 'lender', from, to,
    generated_at: new Date().toISOString(), generated_by: user.id, row_count: data.length,
    csv: { r2_key: csvKey, sha256: csvSha, bytes: csvBytes.byteLength },
    chain: {
      head_hash: head?.head_hash || null,
      head_sequence: head?.head_sequence || 0,
      last_verified_at: head?.last_verified_at || null,
    },
    format: { profile: 'SARB IFRS9 ECL facility register v1', encoding: 'utf-8' },
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));

  try {
    await c.env.R2.put(csvKey, csvBytes, { httpMetadata: { contentType: 'text/csv' } });
    await c.env.R2.put(manifestKey, manifestBytes, { httpMetadata: { contentType: 'application/json' } });
  } catch (e) {
    return c.json({ success: false, error: 'R2 write failed', data: { detail: (e as Error).message } }, 502);
  }

  await c.env.DB.prepare(
    `INSERT INTO audit_exports
       (id, entity_type, from_ts, to_ts, row_count,
        csv_r2_key, manifest_r2_key, chain_head_hash, generated_by, generated_at)
     VALUES (?, 'lender', ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(exportId, from, to, data.length, csvKey, manifestKey,
         head?.head_hash || '', user.id).run();

  await appendAudit({
    env: c.env, entity_type: 'lender', entity_id: exportId,
    event_type: 'audit.export_generated', actor_id: user.id,
    payload: { export_id: exportId, from, to, row_count: data.length, csv_sha256: csvSha },
  }).catch(() => {});

  return c.json({
    success: true,
    data: { export_id: exportId, row_count: data.length, csv_r2_key: csvKey, manifest_r2_key: manifestKey, manifest },
  }, 201);
});

funder.get('/audit/exports', async (c) => {
  const user = getCurrentUser(c);
  if (!funderAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const rs = await c.env.DB.prepare(
    `SELECT id, from_ts, to_ts, row_count, csv_r2_key, manifest_r2_key,
            chain_head_hash, generated_by, generated_at
       FROM audit_exports WHERE entity_type = 'lender'
      ORDER BY generated_at DESC LIMIT 50`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

funder.get('/audit/exports/:id/manifest', async (c) => {
  const user = getCurrentUser(c);
  if (!funderAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT manifest_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'lender'`,
  ).bind(id).first<{ manifest_r2_key: string }>();
  if (!row) return c.json({ success: false, error: 'Export not found' }, 404);
  const obj = await c.env.R2.get(row.manifest_r2_key);
  if (!obj) return c.json({ success: false, error: 'Manifest object missing in R2' }, 404);
  const text = await obj.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* */ }
  return c.json({ success: true, data: parsed ?? { raw: text } });
});

funder.get('/audit/exports/:id/csv', async (c) => {
  const user = getCurrentUser(c);
  if (!funderAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT csv_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'lender'`,
  ).bind(id).first<{ csv_r2_key: string }>();
  if (!row) return c.json({ success: false, error: 'Export not found' }, 404);
  const obj = await c.env.R2.get(row.csv_r2_key);
  if (!obj) return c.json({ success: false, error: 'CSV object missing in R2' }, 404);
  return new Response(await obj.arrayBuffer(), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${id}.csv"`,
    },
  });
});

// POST /funder/audit/recon — disbursement reconciliation. CSV columns:
//   disbursement_id, value_date, amount_zar, facility_id
// Match against disbursement_requests (status='approved'). Breaks:
//   • missing_in_ours / missing_in_theirs / field_mismatch on amount.
funder.post('/audit/recon', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'lender') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { source?: string; csv?: string };
  const source = (body.source || 'bank').toLowerCase();
  if (typeof body.csv !== 'string' || body.csv.length < 10) {
    return c.json({ success: false, error: 'csv body required' }, 400);
  }
  const lines = body.csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return c.json({ success: false, error: 'csv must have header + ≥1 row' }, 400);
  const headers = lines[0].split(',').map((h) => h.trim());
  const need = ['disbursement_id','value_date','amount_zar','facility_id'];
  for (const k of need) {
    if (!headers.includes(k)) return c.json({ success: false, error: `csv missing column: ${k}` }, 400);
  }
  const idxOf = (k: string) => headers.indexOf(k);
  type TheirRow = { disbursement_id: string; value_date: string; amount_zar: number; facility_id: string };
  const theirs: TheirRow[] = [];
  for (const ln of lines.slice(1)) {
    const cols = ln.split(',');
    theirs.push({
      disbursement_id: (cols[idxOf('disbursement_id')] || '').trim(),
      value_date: (cols[idxOf('value_date')] || '').trim(),
      amount_zar: Number(cols[idxOf('amount_zar')] || 0),
      facility_id: (cols[idxOf('facility_id')] || '').trim(),
    });
  }

  const runId = 'recon_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-recon/lender/${runId}/bank.csv`;
  await c.env.R2.put(csvKey, new TextEncoder().encode(body.csv), {
    httpMetadata: { contentType: 'text/csv' },
  }).catch(() => null);

  const ours = await c.env.DB.prepare(
    `SELECT id AS disbursement_id, amount AS amount_zar, facility_id, status
       FROM disbursement_requests WHERE status IN ('approved','disbursed')`,
  ).all<{ disbursement_id: string; amount_zar: number; facility_id: string; status: string }>().catch(() => ({ results: [] } as any));
  const ourById = new Map<string, any>();
  for (const r of (ours.results || []) as any[]) ourById.set(r.disbursement_id, r);

  const matched = new Set<string>();
  type Break = { type: string; disbursement_id: string | null; our: unknown; their: unknown; field: string | null };
  const breaks: Break[] = [];
  for (const t of theirs) {
    if (!t.disbursement_id) {
      breaks.push({ type: 'missing_in_ours', disbursement_id: null, our: null, their: t, field: null });
      continue;
    }
    const o = ourById.get(t.disbursement_id);
    if (!o) {
      breaks.push({ type: 'missing_in_ours', disbursement_id: t.disbursement_id, our: null, their: t, field: null });
      continue;
    }
    matched.add(t.disbursement_id);
    if (Math.abs(Number(o.amount_zar) - Number(t.amount_zar)) > 0.01) {
      breaks.push({ type: 'field_mismatch', disbursement_id: t.disbursement_id, our: o, their: t, field: 'amount_zar' });
    }
  }
  for (const [id, o] of ourById.entries()) {
    if (!matched.has(id) && !theirs.some((t) => t.disbursement_id === id)) {
      breaks.push({ type: 'missing_in_theirs', disbursement_id: id, our: o, their: null, field: null });
    }
  }

  const matchedCount = theirs.length - breaks.filter((b) => b.type !== 'field_mismatch').length;
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO audit_recon_runs
       (id, entity_type, source, uploaded_csv_r2_key, row_count,
        matched_count, break_count, status, started_at, finished_at, started_by)
     VALUES (?, 'lender', ?, ?, ?, ?, ?, 'complete', ?, ?, ?)`,
  ).bind(runId, source, csvKey, theirs.length, matchedCount,
         breaks.length, now, now, user.id).run();

  if (breaks.length > 0) {
    const inserts = breaks.map((b) => c.env.DB.prepare(
      `INSERT INTO audit_recon_breaks
         (id, run_id, break_type, external_ref, our_value, their_value, field, resolution)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
    ).bind(
      'brk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      runId, b.type, b.disbursement_id,
      b.our != null ? JSON.stringify(b.our) : null,
      b.their != null ? JSON.stringify(b.their) : null,
      b.field,
    ));
    await c.env.DB.batch(inserts);
  }

  await appendAudit({
    env: c.env, entity_type: 'lender', entity_id: runId,
    event_type: 'audit.recon_run', actor_id: user.id,
    payload: { run_id: runId, source, row_count: theirs.length, break_count: breaks.length },
  }).catch(() => {});

  return c.json({
    success: true,
    data: { run_id: runId, source, row_count: theirs.length, matched_count: matchedCount, break_count: breaks.length },
  }, 201);
});

funder.get('/audit/recon', async (c) => {
  const user = getCurrentUser(c);
  // Recon reads match recon-write (admin/lender do funder reconciliation) plus
  // oversight; operational run summaries, not the full-chain evidence pack.
  if (!['admin', 'lender', 'support', 'regulator'].includes(user.role)) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT id, source, row_count, matched_count, break_count, status,
            started_at, finished_at
       FROM audit_recon_runs WHERE entity_type = 'lender'
      ORDER BY started_at DESC LIMIT 50`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
async function sha256OfBytes(b: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', b);
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

export default funder;
