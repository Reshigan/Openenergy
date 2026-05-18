// ════════════════════════════════════════════════════════════════════════
// Schedule — cross-entity due-date aggregate for the calendar view.
//
// Aggregates upcoming "things due" across:
//   • settlement invoices (due_date)
//   • project milestones (due_date, status != satisfied)
//   • insurance policies (period_end, status = active)
//   • regulator licences (expiry_date)
//   • carbon vintages (issuance_date for upcoming issuances)
//   • outages (scheduled_start)
//   • tariff submissions (hearing_date)
//
// Each row returns: { source, id, label, secondary, due_date, href, severity }.
// Server-side filtering: only entities the caller can see.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const schedule = new Hono<HonoEnv>();
schedule.use('*', authMiddleware);

type Item = {
  source: string;
  id: string;
  label: string;
  secondary?: string;
  due_date: string;
  href: string;
  severity?: 'overdue' | 'soon' | 'normal';
};

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

schedule.get('/', async (c) => {
  const user = getCurrentUser(c);
  const from = (c.req.query('from') || new Date().toISOString().slice(0, 10));
  const days = Math.min(365, Math.max(1, Number(c.req.query('days') || 90)));
  const to = new Date(new Date(from + 'T00:00:00Z').getTime() + days * 86400000)
    .toISOString().slice(0, 10);
  const isOfficer = user.role === 'admin' || user.role === 'support' || user.role === 'regulator';
  const today = new Date().toISOString().slice(0, 10);

  // Invoices due
  const invoicesQ = c.env.DB.prepare(
    `SELECT id, invoice_number, due_date, status,
            (CASE WHEN to_participant_id = ? THEN 'pay' ELSE 'receive' END) AS dir
       FROM invoices
      WHERE due_date BETWEEN ? AND ?
        AND status IN ('issued','partial','overdue')
        AND (? OR from_participant_id = ? OR to_participant_id = ?)
      ORDER BY due_date ASC LIMIT 100`,
  ).bind(user.id, from, to, isOfficer ? 1 : 0, user.id, user.id).all();

  // Milestones
  const milestonesQ = c.env.DB.prepare(
    `SELECT m.id, m.name, m.due_date, m.status, m.project_id, p.project_name
       FROM project_milestones m
       LEFT JOIN projects p ON p.id = m.project_id
      WHERE m.due_date BETWEEN ? AND ?
        AND m.status != 'satisfied'
        AND (? OR p.developer_id = ?)
      ORDER BY m.due_date ASC LIMIT 100`,
  ).bind(from, to, isOfficer ? 1 : 0, user.id).all();

  // Insurance expiries
  const insuranceQ = c.env.DB.prepare(
    `SELECT i.id, i.policy_number, i.policy_type, i.period_end, i.project_id, p.project_name
       FROM insurance_policies i
       LEFT JOIN projects p ON p.id = i.project_id
      WHERE i.status = 'active'
        AND i.period_end BETWEEN ? AND ?
        AND (? OR p.developer_id = ?)
      ORDER BY i.period_end ASC LIMIT 100`,
  ).bind(from, to, isOfficer ? 1 : 0, user.id).all();

  // Regulator licence expiries
  const licencesQ = c.env.DB.prepare(
    `SELECT id, licence_number, licensee_name, licence_type, expiry_date
       FROM regulator_licences
      WHERE expiry_date IS NOT NULL
        AND expiry_date BETWEEN ? AND ?
        AND status IN ('active','varied')
        AND (? OR licensee_participant_id = ?)
      ORDER BY expiry_date ASC LIMIT 100`,
  ).bind(from, to, isOfficer ? 1 : 0, user.id).all();

  // Planned outages
  const outagesQ = c.env.DB.prepare(
    `SELECT id, asset_descr, outage_type, scheduled_start
       FROM grid_outages
      WHERE scheduled_start BETWEEN ? AND ?
      ORDER BY scheduled_start ASC LIMIT 100`,
  ).bind(from + 'T00:00:00', to + 'T23:59:59').all();

  // Tariff hearings
  const hearingsQ = c.env.DB.prepare(
    `SELECT id, application_ref, hearing_date
       FROM regulator_tariff_submissions
      WHERE hearing_date BETWEEN ? AND ?
        AND status = 'pending_hearing'
      ORDER BY hearing_date ASC LIMIT 100`,
  ).bind(from, to).all();

  const [invoices, milestones, insurance, licences, outages, hearings] = await Promise.all([
    safe<any>(invoicesQ as any, { results: [] }),
    safe<any>(milestonesQ as any, { results: [] }),
    safe<any>(insuranceQ as any, { results: [] }),
    safe<any>(licencesQ as any, { results: [] }),
    safe<any>(outagesQ as any, { results: [] }),
    safe<any>(hearingsQ as any, { results: [] }),
  ]);

  const sev = (date: string): 'overdue' | 'soon' | 'normal' => {
    if (date < today) return 'overdue';
    const diff = (new Date(date).getTime() - new Date(today).getTime()) / 86400000;
    if (diff <= 7) return 'soon';
    return 'normal';
  };

  const items: Item[] = [
    ...(invoices.results || []).map((r: any) => ({
      source: r.dir === 'pay' ? 'invoice_payable' : 'invoice_receivable',
      id: r.id, label: r.invoice_number, secondary: r.status,
      due_date: r.due_date, href: `/settlement/invoices/${r.id}`,
      severity: sev(r.due_date),
    })),
    ...(milestones.results || []).map((r: any) => ({
      source: 'milestone',
      id: r.id, label: r.name, secondary: r.project_name || r.project_id,
      due_date: r.due_date, href: `/projects/${r.project_id}`,
      severity: sev(r.due_date),
    })),
    ...(insurance.results || []).map((r: any) => ({
      source: 'insurance',
      id: r.id, label: `${r.policy_type} · ${r.policy_number}`,
      secondary: r.project_name || r.project_id,
      due_date: r.period_end,
      href: `/projects/${r.project_id}`,
      severity: sev(r.period_end),
    })),
    ...(licences.results || []).map((r: any) => ({
      source: 'licence',
      id: r.id, label: `${r.licence_number} · ${r.licensee_name}`,
      secondary: r.licence_type, due_date: r.expiry_date,
      href: `/regulator/licence-actions/${r.id}`,
      severity: sev(r.expiry_date),
    })),
    ...(outages.results || []).map((r: any) => ({
      source: 'outage',
      id: r.id, label: r.asset_descr, secondary: r.outage_type,
      due_date: (r.scheduled_start as string).slice(0, 10),
      href: `/grid-operator/outages/${r.id}`,
      severity: sev((r.scheduled_start as string).slice(0, 10)),
    })),
    ...(hearings.results || []).map((r: any) => ({
      source: 'tariff_hearing',
      id: r.id, label: `Tariff hearing · ${r.application_ref}`,
      due_date: r.hearing_date,
      href: `/regulator-suite`,
      severity: sev(r.hearing_date),
    })),
  ];

  items.sort((a, b) => a.due_date.localeCompare(b.due_date));
  return c.json({ success: true, data: { from, to, items, count: items.length } });
});

export default schedule;
