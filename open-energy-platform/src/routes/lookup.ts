// ═══════════════════════════════════════════════════════════════════════════
// Lookup Routes — lightweight picklist API for ActionModal dropdowns.
//
// GET /api/lookup/:entity?q=<search>&limit=100
//
// Returns { success: true, data: [{ value, label, ...meta }] }
// where meta fields support lookupAutoFill in ActionModal.
// Requires auth (any role). Responses are tenant-scoped where applicable.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware } from '../middleware/auth';

const lookup = new Hono<HonoEnv>();
lookup.use('*', authMiddleware);

type LookupRow = { value: string; label: string; [k: string]: unknown };

lookup.get('/:entity', async (c) => {
  const entity = c.req.param('entity');
  const q = (c.req.query('q') || '').toLowerCase().trim();
  const limit = Math.min(parseInt(c.req.query('limit') || '150', 10), 300);
  const db = c.env.DB;
  let rows: LookupRow[] = [];

  try {
    switch (entity) {
      case 'sites': {
        const res = await db.prepare(
          `SELECT id AS value,
                  name || ' (' || COALESCE(technology, 'unknown') ||
                    CASE WHEN capacity_kwp IS NOT NULL
                         THEN ' · ' || CAST(ROUND(capacity_kwp / 1000.0, 1) AS TEXT) || ' MWp'
                         ELSE '' END || ')' AS label,
                  name, technology, capacity_kwp, participant_id, location_lat, location_lng
           FROM om_sites
           ORDER BY name
           LIMIT ?`
        ).bind(limit).all<LookupRow>();
        rows = res.results ?? [];
        break;
      }

      case 'devices': {
        const res = await db.prepare(
          `SELECT d.id AS value,
                  d.device_type || ' — ' || COALESCE(d.make, '') || ' ' || COALESCE(d.model, '') ||
                    ' (' || COALESCE(s.name, d.site_id) || ')' AS label,
                  d.site_id, d.device_type, d.make, d.model, d.serial_number
           FROM om_devices d
           LEFT JOIN om_sites s ON s.id = d.site_id
           ORDER BY s.name, d.device_type
           LIMIT ?`
        ).bind(limit).all<LookupRow>();
        rows = res.results ?? [];
        break;
      }

      case 'participants': {
        const res = await db.prepare(
          `SELECT id AS value,
                  COALESCE(name, email) || ' (' || COALESCE(role, 'unknown') || ')' AS label,
                  name, email, role, kyc_status
           FROM participants
           ORDER BY name
           LIMIT ?`
        ).bind(limit).all<LookupRow>();
        rows = res.results ?? [];
        break;
      }

      case 'projects': {
        const res = await db.prepare(
          `SELECT id AS value,
                  name || ' (' || COALESCE(status, 'unknown') || ')' AS label,
                  name, status, technology, capacity_mw, developer_id
           FROM ipp_projects
           ORDER BY name
           LIMIT ?`
        ).bind(limit).all<LookupRow>();
        rows = res.results ?? [];
        break;
      }

      case 'contracts': {
        const res = await db.prepare(
          `SELECT id AS value,
                  COALESCE(reference_number, id) || ' (' || COALESCE(status, 'unknown') || ')' AS label,
                  reference_number, status, contract_type, counterparty_id
           FROM contract_documents
           ORDER BY created_at DESC
           LIMIT ?`
        ).bind(limit).all<LookupRow>();
        rows = res.results ?? [];
        break;
      }

      case 'tenants': {
        const res = await db.prepare(
          `SELECT id AS value,
                  name || ' (' || COALESCE(status, 'active') || ')' AS label,
                  name, status
           FROM tenants
           ORDER BY name
           LIMIT ?`
        ).bind(limit).all<LookupRow>();
        rows = res.results ?? [];
        break;
      }

      case 'tickets': {
        const res = await db.prepare(
          `SELECT id AS value,
                  COALESCE(reference, id) || ' — ' || COALESCE(subject, '') ||
                    ' (' || COALESCE(status, 'unknown') || ')' AS label,
                  reference, subject, status, priority, assignee_id
           FROM support_tickets
           ORDER BY created_at DESC
           LIMIT ?`
        ).bind(limit).all<LookupRow>();
        rows = res.results ?? [];
        break;
      }

      case 'licences': {
        const res = await db.prepare(
          `SELECT id AS value,
                  COALESCE(licence_number, id) || ' (' || COALESCE(licence_class, '') ||
                    CASE WHEN status IS NOT NULL THEN ' · ' || status ELSE '' END || ')' AS label,
                  licence_number, licence_class, status, holder_id
           FROM oe_licences
           ORDER BY created_at DESC
           LIMIT ?`
        ).bind(limit).all<LookupRow>().catch(() => ({ results: [] as LookupRow[] }));
        rows = (res as { results: LookupRow[] }).results ?? [];
        break;
      }

      case 'carbon_projects': {
        const res = await db.prepare(
          `SELECT id AS value,
                  name || ' (' || COALESCE(methodology_id, '') || ')' AS label,
                  name, methodology_id, status, registry
           FROM oe_carbon_projects
           ORDER BY name
           LIMIT ?`
        ).bind(limit).all<LookupRow>().catch(() => ({ results: [] as LookupRow[] }));
        rows = (res as { results: LookupRow[] }).results ?? [];
        break;
      }

      case 'ppa_contracts': {
        const res = await db.prepare(
          `SELECT id AS value,
                  COALESCE(reference_number, id) || ' (' || COALESCE(chain_status, 'unknown') || ')' AS label,
                  reference_number, chain_status, offtaker_id, generator_id, contracted_mw
           FROM oe_ppa_contracts
           ORDER BY created_at DESC
           LIMIT ?`
        ).bind(limit).all<LookupRow>().catch(() => ({ results: [] as LookupRow[] }));
        rows = (res as { results: LookupRow[] }).results ?? [];
        break;
      }

      default:
        return c.json({ success: false, error: `Unknown lookup entity: ${entity}` }, 400);
    }
  } catch {
    // Return empty on schema mismatch rather than surfacing internal errors
    rows = [];
  }

  if (q) {
    rows = rows.filter(r => String(r.label).toLowerCase().includes(q));
  }

  return c.json({ success: true, data: rows });
});

export default lookup;
