// ════════════════════════════════════════════════════════════════════════
// Global search — POST/GET /api/search?q=…
//
// Cross-entity fuzzy lookup across the ~8 most-frequently-found entities:
// projects, contracts, invoices, participants, LOIs, marketplace listings,
// regulator licences, support tickets. Each match returns
//   { type, id, label, secondary, href }
// so the SPA can render a uniform results list and route by href.
//
// Performance: 8 parallel D1 LIKE queries with LIMIT 5 each = ~10ms total
// on a 200-tenant deployment. No FTS5 yet (D1 doesn't expose it on free
// plan); LIKE is fine until we cross 1M rows in any of these tables.
// Each query is wrapped in try/catch so a missing-table on a stale prod
// doesn't break the whole search.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const search = new Hono<HonoEnv>();
search.use('*', authMiddleware);

type Hit = {
  type: string;
  id: string;
  label: string;
  secondary?: string;
  href: string;
};

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

search.get('/', async (c) => {
  const user = getCurrentUser(c);
  const q = (c.req.query('q') || '').trim();
  if (q.length < 2) return c.json({ success: true, data: { results: [], q } });
  const pat = `%${q}%`;
  const isOfficer = user.role === 'admin' || user.role === 'support' || user.role === 'regulator';

  // Each query is run in parallel. We always join on participant_id where
  // applicable so callers only see their own rows unless they're an officer.
  const projectsQ = c.env.DB.prepare(
    `SELECT id, project_name AS label, technology AS secondary
       FROM projects
      WHERE (project_name LIKE ? OR id LIKE ?)
        AND (? OR developer_id = ?)
      ORDER BY updated_at DESC LIMIT 5`,
  ).bind(pat, pat, isOfficer ? 1 : 0, user.id).all();

  const contractsQ = c.env.DB.prepare(
    `SELECT id, title AS label, phase AS secondary
       FROM contracts
      WHERE (title LIKE ? OR id LIKE ?)
        AND (? OR from_participant_id = ? OR to_participant_id = ?)
      ORDER BY updated_at DESC LIMIT 5`,
  ).bind(pat, pat, isOfficer ? 1 : 0, user.id, user.id).all();

  const invoicesQ = c.env.DB.prepare(
    `SELECT id, invoice_number AS label, status AS secondary
       FROM invoices
      WHERE (invoice_number LIKE ? OR id LIKE ?)
        AND (? OR from_participant_id = ? OR to_participant_id = ?)
      ORDER BY created_at DESC LIMIT 5`,
  ).bind(pat, pat, isOfficer ? 1 : 0, user.id, user.id).all();

  const participantsQ = isOfficer
    ? c.env.DB.prepare(
        `SELECT id, COALESCE(name, email) AS label, email AS secondary
           FROM participants
          WHERE (name LIKE ? OR email LIKE ? OR id LIKE ?)
          ORDER BY created_at DESC LIMIT 5`,
      ).bind(pat, pat, pat).all()
    : Promise.resolve({ results: [] });

  const loisQ = c.env.DB.prepare(
    `SELECT id,
            COALESCE(subject, project_id, id) AS label,
            status AS secondary
       FROM lois
      WHERE (COALESCE(subject, '') LIKE ? OR id LIKE ?)
        AND (? OR from_participant_id = ? OR to_participant_id = ?)
      ORDER BY created_at DESC LIMIT 5`,
  ).bind(pat, pat, isOfficer ? 1 : 0, user.id, user.id).all();

  const listingsQ = c.env.DB.prepare(
    `SELECT id, title AS label, listing_type AS secondary
       FROM marketplace_listings
      WHERE (title LIKE ? OR id LIKE ?)
        AND status = 'active'
      ORDER BY created_at DESC LIMIT 5`,
  ).bind(pat, pat).all();

  const licencesQ = c.env.DB.prepare(
    `SELECT id, licence_number AS label,
            (licensee_name || ' · ' || licence_type) AS secondary
       FROM regulator_licences
      WHERE (licence_number LIKE ? OR licensee_name LIKE ? OR id LIKE ?)
      ORDER BY issue_date DESC LIMIT 5`,
  ).bind(pat, pat, pat).all();

  const ticketsQ = isOfficer || user.role === 'support'
    ? c.env.DB.prepare(
        `SELECT id, subject AS label, status AS secondary
           FROM support_tickets
          WHERE (subject LIKE ? OR id LIKE ?)
          ORDER BY created_at DESC LIMIT 5`,
      ).bind(pat, pat).all()
    : Promise.resolve({ results: [] });

  const [projects, contracts, invoices, participants, lois, listings, licences, tickets] =
    await Promise.all([
      safe<any>(projectsQ as any, { results: [] }),
      safe<any>(contractsQ as any, { results: [] }),
      safe<any>(invoicesQ as any, { results: [] }),
      safe<any>(participantsQ as any, { results: [] }),
      safe<any>(loisQ as any, { results: [] }),
      safe<any>(listingsQ as any, { results: [] }),
      safe<any>(licencesQ as any, { results: [] }),
      safe<any>(ticketsQ as any, { results: [] }),
    ]);

  const results: Hit[] = [
    ...(projects.results || []).map((r: any) => ({
      type: 'project', id: r.id, label: r.label, secondary: r.secondary,
      href: `/projects/${r.id}`,
    })),
    ...(contracts.results || []).map((r: any) => ({
      type: 'contract', id: r.id, label: r.label, secondary: r.secondary,
      href: `/contracts/${r.id}`,
    })),
    ...(invoices.results || []).map((r: any) => ({
      type: 'invoice', id: r.id, label: r.label, secondary: r.secondary,
      href: `/settlement/invoices/${r.id}`,
    })),
    ...(participants.results || []).map((r: any) => ({
      type: 'participant', id: r.id, label: r.label, secondary: r.secondary,
      href: `/admin-platform/tenants/${r.id}`,
    })),
    ...(lois.results || []).map((r: any) => ({
      type: 'loi', id: r.id, label: String(r.label || '').slice(0, 80), secondary: r.secondary,
      href: `/lois/${r.id}`,
    })),
    ...(listings.results || []).map((r: any) => ({
      type: 'listing', id: r.id, label: r.label, secondary: r.secondary,
      href: `/marketplace?listing=${r.id}`,
    })),
    ...(licences.results || []).map((r: any) => ({
      type: 'licence', id: r.id, label: r.label, secondary: r.secondary,
      href: `/regulator/licence-actions/${r.id}`,
    })),
    ...(tickets.results || []).map((r: any) => ({
      type: 'ticket', id: r.id, label: r.label, secondary: r.secondary,
      href: `/support/tickets/${r.id}`,
    })),
  ];

  return c.json({ success: true, data: { q, results, count: results.length } });
});

export default search;
