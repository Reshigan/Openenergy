// ════════════════════════════════════════════════════════════════════════
// public-legal — public legal-information surface.
//
//   /api/public/legal/paia-manual          PAIA s.14 manual (public)
//   /api/public/legal/paia-requests        POST a PAIA request (public)
//   /api/public/legal/policies             public retention policy register
//
// Mounted at /api/public/legal so unauthenticated visitors can submit
// PAIA requests, view the manual, and inspect the retention register.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';

const r = new Hono<HonoEnv>();

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

r.get('/paia-manual', async (c) => {
  const policies = await c.env.DB.prepare(
    `SELECT data_type, lawful_basis, legal_reference, retention_days, notes
     FROM oe_popia_retention_policies ORDER BY data_type`
  ).all<any>().catch(() => ({ results: [] as any[] }));
  return c.json({
    success: true,
    data: {
      title: 'PAIA Section 14 Manual — GONXT Technology (Pty) Ltd',
      generated_at: new Date().toISOString(),
      information_officer: {
        name: 'GONXT Information Officer',
        email: 'privacy@gonxt.tech',
        postal_address: 'Cape Town, Western Cape, South Africa',
      },
      regulator: {
        name: 'Information Regulator (South Africa)',
        complaint_form: 'POPIA / PAIA combined complaint form',
        url: 'https://inforegulator.org.za',
      },
      records_held: ((policies.results || []) as any[]).map((p: any) => ({
        record_type: p.data_type,
        purpose: p.notes || 'Platform operation',
        retention_days: p.retention_days,
        lawful_basis: p.lawful_basis,
        legal_reference: p.legal_reference,
      })),
      sar_process: {
        request_endpoint: '/api/public/legal/paia-requests',
        statutory_deadline_days: 30,
        fee_note: 'No fee for first request per calendar year for personal data subjects.',
      },
    },
  });
});

r.get('/policies', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT data_type, lawful_basis, legal_reference, retention_days, notes
     FROM oe_popia_retention_policies ORDER BY data_type`
  ).all<any>().catch(() => ({ results: [] as any[] }));
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/paia-requests', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  const requester_name = String(b.requester_name || '').slice(0, 200);
  const requester_email = String(b.requester_email || '').slice(0, 200);
  const subject = String(b.subject || '').slice(0, 500);
  const body = String(b.body || '').slice(0, 5000);
  if (!requester_name || !requester_email || !subject || !body) {
    return c.json({ success: false, error: 'requester_name + requester_email + subject + body required' }, 400);
  }
  // Light email shape check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requester_email)) {
    return c.json({ success: false, error: 'requester_email invalid' }, 400);
  }
  const id = genId('paia');
  const compactBody = `Subject: ${subject}\n\n${body}`;
  await c.env.DB.prepare(`
    INSERT INTO oe_popia_sar_requests
      (id, subject_email, subject_name, request_type, request_body, status, due_at, ip)
    VALUES (?,?,?,?,?,?,datetime('now','+30 days'),?)
  `).bind(
    id, requester_email, requester_name, 'paia_access', compactBody, 'open',
    c.req.header('cf-connecting-ip') || null,
  ).run().catch(() => null);
  return c.json({ success: true, data: { id, ack: 'Your PAIA request has been received. We will respond within 30 days.' } }, 201);
});

export default r;
