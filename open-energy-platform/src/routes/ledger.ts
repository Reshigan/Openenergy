// ═══════════════════════════════════════════════════════════════════════════
// Meridian — GET /api/ledger/:chainKey
// Generic per-chain list: KPI strip + filter pills + card rows for one chain.
// Table/column/status values come exclusively from the static MERIDIAN_CHAINS
// literal (resolved via getChain). :chainKey 404s if unknown so it never
// reaches SQL as an identifier. ?status= is matched against the descriptor's
// static filters[].statuses and bound as parameters.
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import {
  getChain, bucketFor, attentionScore, quantumZar, listSelectCols, type ChainDescriptor,
} from '../utils/chain-registry-meridian';
import { buildPrefill } from '../utils/autofill';

export interface LedgerRow {
  id: string; ref: string; title: string; status: string;
  deadline_at: string | null; bucket: string; quantum_zar: number | null;
  counterparty: string | null; score: number;
  actions: { action: string; label: string; path: string; cascadeHint: string; tone?: string; fields?: unknown[] }[];
}

function viewerCanSee(chain: ChainDescriptor, role: string): boolean {
  if (role === 'admin') return true;
  if (chain.lanes[role]) return true;
  return chain.actions.some(a => a.roles.includes(role));
}

export function assembleLedger(chain: ChainDescriptor, rows: Record<string, unknown>[], role: string, now: number, prefill: Record<string, unknown> = {}) {
  const mapped: LedgerRow[] = rows.map(r => {
    const deadline = (r[chain.deadlineCol] as string | null) ?? null;
    const zar = quantumZar(chain, r);
    return {
      id: String(r.id ?? r[chain.refCol]),
      ref: String(r[chain.refCol] ?? r.id),
      title: chain.titleCol ? String(r[chain.titleCol] ?? chain.title) : chain.title,
      status: String(r[chain.statusCol] ?? ''),
      deadline_at: deadline,
      bucket: bucketFor(deadline, now),
      quantum_zar: zar,
      counterparty: chain.counterpartyCol ? (String(r[chain.counterpartyCol] ?? '') || null) : null,
      score: attentionScore(zar, deadline, now),
      actions: chain.actions.filter(a => a.roles.includes(role)).map(({ roles: _r, ...a }) => a),
    };
  });
  const BREACHED = 'breached'; // bucketFor returns 'breached' for an overdue deadline
  const kpis = (chain.kpis ?? []).map(k => ({
    key: k.key, label: k.label,
    value: k.compute === 'count' ? mapped.length
      : k.compute === 'count_breached' ? mapped.filter(m => m.bucket === BREACHED).length
      : mapped.reduce((s, m) => s + (m.quantum_zar ?? 0), 0),
  }));
  return {
    chain: { key: chain.key, wave: chain.wave, title: chain.title },
    filters: chain.filters ?? [],
    initiation: chain.initiation ?? null,
    prefill,
    kpis,
    rows: mapped.sort((a, b) => b.score - a.score),
  };
}

const ledger = new Hono<HonoEnv>();
ledger.use('*', authMiddleware);

// ─── Lookup pickers for initiation fields of type 'lookup' ──────────────────
// Resolves a FK-target reference list (id + display label) so the SPA can render
// a dropdown instead of a free-text id that 422s on foreign_key_violation.
// SECURITY: :source is matched against this static whitelist; the SQL string for
// each entry is a code literal (no request input ever reaches an identifier).
// Returns ALL rows (admin-visible reference data), not developer-scoped.
export const LOOKUP_SOURCES: Record<string, string> = {
  'carbon-projects':
    'SELECT id, project_name AS label FROM carbon_projects ORDER BY project_name LIMIT 500',
  'ipp-projects':
    'SELECT id, project_name AS label FROM ipp_projects ORDER BY project_name LIMIT 500',
  // O&M sites (NXT Energy Goldrush portfolio + others) — id + display name.
  'om-sites':
    'SELECT id, name AS label FROM om_sites ORDER BY name LIMIT 500',
  // Party pickers off the participants register (role values are the suffixed
  // forms: ipp_developer, grid_operator, carbon_fund). label = display name.
  'participants':
    'SELECT id, name AS label FROM participants ORDER BY name LIMIT 500',
  'ipp-developers':
    "SELECT id, name AS label FROM participants WHERE role = 'ipp_developer' ORDER BY name LIMIT 500",
  'offtakers':
    "SELECT id, name AS label FROM participants WHERE role = 'offtaker' ORDER BY name LIMIT 500",
  'lenders':
    "SELECT id, name AS label FROM participants WHERE role = 'lender' ORDER BY name LIMIT 500",
  // Lender credit facilities (W53 origination) — picker for facility_id fields.
  'lender-facilities':
    'SELECT id, facility_name AS label FROM oe_credit_facility_applications ORDER BY facility_name LIMIT 500',
  // Grid operators / BRPs — participants filtered to grid_operator role. Backs
  // imbalance brp_id, unserved-energy grid_operator_id, demand-response operator_id.
  'grid-operators':
    "SELECT id, name AS label FROM participants WHERE role = 'grid_operator' ORDER BY name LIMIT 500",
  // Support tickets — backs CSAT ticket_id. ticket_number is UNIQUE NOT NULL.
  'support-tickets':
    'SELECT id, ticket_number AS label FROM support_tickets ORDER BY ticket_number LIMIT 500',
  // O&M work orders — backs linked_wo_id / work_order_id across the Esums + HSE
  // chains. wo_number is UNIQUE NOT NULL (058_esums_om.sql).
  'om-work-orders':
    'SELECT id, wo_number AS label FROM om_work_orders ORDER BY wo_number LIMIT 500',
  // O&M fault register — backs work_order initiation fault_id (058_esums_om.sql).
  'om-faults':
    'SELECT id, fault_code AS label FROM om_faults ORDER BY fault_code LIMIT 500',
  // Substation assets (W211 lifecycle) — backs transmission_outage asset_id.
  // asset_number is the UNIQUE utility asset tag (457_w211_substation_asset_lifecycle.sql).
  'substation-assets':
    'SELECT id, asset_number AS label FROM oe_substation_assets ORDER BY asset_number LIMIT 500',
  // Warranty claims (W15/W120) — backs pr_underperformance linked_warranty_claim_id.
  // claim_number is UNIQUE NOT NULL (120_warranty_claim_chain.sql).
  'warranty-claims':
    'SELECT id, claim_number AS label FROM oe_warranty_claims ORDER BY claim_number LIMIT 500',
};

ledger.get('/lookup/:source', async (c) => {
  const sql = LOOKUP_SOURCES[c.req.param('source')];
  if (!sql) return c.json({ success: false, error: 'unknown lookup source' }, 404);
  const res = await c.env.DB.prepare(sql).all();
  const rows = (res.results ?? []) as { id: string; label: string }[];
  return c.json({ success: true, data: rows });
});

ledger.get('/:chainKey', async (c) => {
  const chain = getChain(c.req.param('chainKey'));
  if (!chain) return c.json({ success: false, error: 'unknown chain' }, 404);
  const user = getCurrentUser(c);
  if (!viewerCanSee(chain, user.role)) return c.json({ success: false, error: 'forbidden' }, 403);

  const filterKey = c.req.query('status');
  const filter = (chain.filters ?? []).find(f => f.key === filterKey);
  let sql = `SELECT ${listSelectCols(chain)} FROM ${chain.table}`;
  const binds: unknown[] = [];
  if (filter) {
    sql += ` WHERE ${chain.statusCol} IN (${filter.statuses.map(() => '?').join(',')})`;
    binds.push(...filter.statuses);
  }
  sql += ` ORDER BY (${chain.deadlineCol} IS NULL), ${chain.deadlineCol} ASC LIMIT 200`;
  const res = await c.env.DB.prepare(sql).bind(...binds).all();
  const rows = (res.results ?? []) as Record<string, unknown>[];
  // Compute autofill only when the chain offers an initiation form (the only
  // consumer of prefill); skips two D1 reads on view-only ledgers.
  const prefill = chain.initiation ? await buildPrefill(c.env, user) : {};
  return c.json({ success: true, data: assembleLedger(chain, rows, user.role, Date.now(), prefill) });
});

export default ledger;
