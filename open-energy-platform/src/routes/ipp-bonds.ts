// ═══════════════════════════════════════════════════════════════════════════
// Wave 10 — IPP performance-bond / insurance expiry-escalation routes.
//
// Flat-mounted at /api/ipp/bonds.
//
// Roles (per [[feedback_role_ux_depth]]):
//   • READ_ROLES: admin/support/ipp/regulator/lender (lenders see bonds on
//     the projects they finance via the same scope filter — for now they get
//     all bonds, scope-deepening is Wave 11+).
//   • WRITE_ROLES: admin/support/ipp (operators register/replace their own
//     bonds; admin sees and acts on all).
//
// Every state-changing mutation fires the matching ipp.bond_* cascade.
// Daily 05:00 UTC cron sweep (wired in src/index.ts) walks every active
// bond + every non-terminal insurance policy and advances the cycle.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  expiryStatusFor,
  daysUntil,
  cureDeadlineFor,
  STATUS_LABEL,
  type ExpiryStatus,
} from '../utils/bond-expiry-spec';

const ADMIN_WRITE = new Set(['admin', 'support']);
const IPP_WRITE   = new Set(['admin', 'support', 'ipp']);
const READ_ROLES  = new Set(['admin', 'support', 'ipp', 'regulator', 'lender']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface BondRow {
  id: string;
  project_id: string;
  bond_number: string;
  bond_type: string;
  issuer: string;
  beneficiary: string | null;
  face_value_zar: number;
  currency: string;
  issued_at: string;
  expiry_at: string;
  release_conditions: string | null;
  document_r2_key: string | null;
  status: string;
  expiry_status: ExpiryStatus;
  last_warning_at: string | null;
  last_cycle_1_at: string | null;
  last_cycle_2_at: string | null;
  last_cycle_3_at: string | null;
  last_escalated_at: string | null;
  last_acknowledged_at: string | null;
  last_acknowledged_by: string | null;
  replaced_by_bond_id: string | null;
  claim_amount_zar: number | null;
  claim_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface NoticeRow {
  id: string;
  bond_id: string;
  project_id: string;
  cycle: number;
  title: string;
  body_json: string | null;
  status: string;
  issued_at: string;
  issued_by: string;
  cure_deadline_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  escalated_at: string | null;
  parent_notice_id: string | null;
  created_at: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ─── List bonds (+ filter by expiry_status, project_id) ──────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const exp = c.req.query('expiry_status');
  const proj = c.req.query('project_id');
  let sql = 'SELECT * FROM ipp_performance_bonds WHERE 1=1';
  const params: unknown[] = [];

  if (exp)  { sql += ' AND expiry_status = ?'; params.push(exp); }
  if (proj) { sql += ' AND project_id = ?';    params.push(proj); }

  sql += ' ORDER BY expiry_at ASC LIMIT 500';
  const { results } = await c.env.DB.prepare(sql).bind(...params).all<BondRow>();

  const enriched = (results || []).map((b) => ({
    ...b,
    days_until_expiry: daysUntil(b.expiry_at, new Date()),
    expiry_status_label: STATUS_LABEL[b.expiry_status] ?? b.expiry_status,
  }));

  return c.json({ success: true, data: enriched });
});

// ─── Drill-down: bond + notice history ───────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const bond = await c.env.DB
    .prepare('SELECT * FROM ipp_performance_bonds WHERE id = ?')
    .bind(id).first<BondRow>();
  if (!bond) return c.json({ success: false, error: 'Not found' }, 404);

  const notices = await c.env.DB
    .prepare('SELECT * FROM ipp_bond_notices WHERE bond_id = ? ORDER BY issued_at DESC LIMIT 50')
    .bind(id).all<NoticeRow>();

  return c.json({
    success: true,
    data: {
      bond: {
        ...bond,
        days_until_expiry: daysUntil(bond.expiry_at, new Date()),
        expiry_status_label: STATUS_LABEL[bond.expiry_status] ?? bond.expiry_status,
      },
      notices: notices.results || [],
    },
  });
});

// ─── Register a new bond ─────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !IPP_WRITE.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    bond_number: string;
    bond_type: string;
    issuer: string;
    beneficiary?: string;
    face_value_zar: number;
    currency?: string;
    issued_at: string;
    expiry_at: string;
    release_conditions?: string;
    document_r2_key?: string;
  }>();

  if (!body.project_id || !body.bond_number || !body.bond_type || !body.issuer ||
      !body.face_value_zar || !body.issued_at || !body.expiry_at) {
    return c.json({ success: false, error: 'project_id, bond_number, bond_type, issuer, face_value_zar, issued_at, expiry_at all required' }, 400);
  }

  const id = newId('bond');
  const initialStatus = expiryStatusFor(body.expiry_at, 'active', new Date());

  await c.env.DB.prepare(`
    INSERT INTO ipp_performance_bonds (
      id, project_id, bond_number, bond_type, issuer, beneficiary,
      face_value_zar, currency, issued_at, expiry_at, release_conditions,
      document_r2_key, status, expiry_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `).bind(
    id, body.project_id, body.bond_number, body.bond_type, body.issuer,
    body.beneficiary ?? null, body.face_value_zar, body.currency ?? 'ZAR',
    body.issued_at, body.expiry_at, body.release_conditions ?? null,
    body.document_r2_key ?? null, initialStatus,
  ).run();

  return c.json({
    success: true,
    data: { id, expiry_status: initialStatus },
  });
});

// ─── Acknowledge a notice / bond cycle ───────────────────────────────────────
app.post('/:id/acknowledge', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !IPP_WRITE.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const bond = await c.env.DB
    .prepare('SELECT * FROM ipp_performance_bonds WHERE id = ?')
    .bind(id).first<BondRow>();
  if (!bond) return c.json({ success: false, error: 'Not found' }, 404);

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE ipp_performance_bonds
    SET last_acknowledged_at = ?, last_acknowledged_by = ?, updated_at = ?
    WHERE id = ?
  `).bind(nowIso, user.id, nowIso, id).run();

  // Mark the latest 'issued' notice as 'acknowledged'.
  await c.env.DB.prepare(`
    UPDATE ipp_bond_notices SET status = 'acknowledged', acknowledged_at = ?, acknowledged_by = ?
    WHERE id = (
      SELECT id FROM ipp_bond_notices
      WHERE bond_id = ? AND status = 'issued'
      ORDER BY issued_at DESC LIMIT 1
    )
  `).bind(nowIso, user.id, id).run();

  await fireCascade({
    event: 'ipp.bond_acknowledged',
    actor_id: user.id,
    entity_type: 'ipp_performance_bonds',
    entity_id: id,
    data: {
      project_id: bond.project_id,
      bond_number: bond.bond_number,
      cycle: bond.expiry_status,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { acknowledged_at: nowIso } });
});

// ─── Release a bond (terminal — clears expiry tracking) ──────────────────────
app.post('/:id/release', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !ADMIN_WRITE.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const bond = await c.env.DB
    .prepare('SELECT * FROM ipp_performance_bonds WHERE id = ?')
    .bind(id).first<BondRow>();
  if (!bond) return c.json({ success: false, error: 'Not found' }, 404);

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE ipp_performance_bonds
    SET status = 'released', expiry_status = 'green', updated_at = ?
    WHERE id = ?
  `).bind(nowIso, id).run();

  await fireCascade({
    event: 'ipp.bond_released',
    actor_id: user.id,
    entity_type: 'ipp_performance_bonds',
    entity_id: id,
    data: { project_id: bond.project_id, bond_number: bond.bond_number },
    env: c.env,
  });

  return c.json({ success: true });
});

// ─── Replace a bond with a fresh one (operator renewal) ──────────────────────
app.post('/:id/replace', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !IPP_WRITE.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const oldId = c.req.param('id');
  const body = await c.req.json<{
    bond_number: string;
    issuer: string;
    face_value_zar: number;
    issued_at: string;
    expiry_at: string;
    beneficiary?: string;
    release_conditions?: string;
  }>();

  const old = await c.env.DB
    .prepare('SELECT * FROM ipp_performance_bonds WHERE id = ?')
    .bind(oldId).first<BondRow>();
  if (!old) return c.json({ success: false, error: 'Not found' }, 404);

  const newBondId = newId('bond');
  const initialStatus = expiryStatusFor(body.expiry_at, 'active', new Date());
  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO ipp_performance_bonds (
      id, project_id, bond_number, bond_type, issuer, beneficiary,
      face_value_zar, currency, issued_at, expiry_at, release_conditions,
      status, expiry_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ZAR', ?, ?, ?, 'active', ?)
  `).bind(
    newBondId, old.project_id, body.bond_number, old.bond_type, body.issuer,
    body.beneficiary ?? old.beneficiary, body.face_value_zar,
    body.issued_at, body.expiry_at,
    body.release_conditions ?? old.release_conditions,
    initialStatus,
  ).run();

  await c.env.DB.prepare(`
    UPDATE ipp_performance_bonds
    SET status = 'replaced', expiry_status = 'green', replaced_by_bond_id = ?, updated_at = ?
    WHERE id = ?
  `).bind(newBondId, nowIso, oldId).run();

  await fireCascade({
    event: 'ipp.bond_replaced',
    actor_id: user.id,
    entity_type: 'ipp_performance_bonds',
    entity_id: oldId,
    data: {
      project_id: old.project_id,
      old_bond_number: old.bond_number,
      new_bond_id: newBondId,
      new_bond_number: body.bond_number,
    },
    env: c.env,
  });

  return c.json({
    success: true,
    data: { new_bond_id: newBondId, expiry_status: initialStatus },
  });
});

// ─── Forfeit / call (terminal — operator failed to renew, beneficiary calls) ─
app.post('/:id/forfeit', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !ADMIN_WRITE.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const body = await c.req.json<{ claim_amount_zar?: number; claim_reason?: string }>();

  const bond = await c.env.DB
    .prepare('SELECT * FROM ipp_performance_bonds WHERE id = ?')
    .bind(id).first<BondRow>();
  if (!bond) return c.json({ success: false, error: 'Not found' }, 404);

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE ipp_performance_bonds
    SET status = 'forfeited', expiry_status = 'green',
        claim_amount_zar = ?, claim_reason = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    body.claim_amount_zar ?? bond.face_value_zar,
    body.claim_reason ?? null, nowIso, id,
  ).run();

  await fireCascade({
    event: 'ipp.bond_forfeited',
    actor_id: user.id,
    entity_type: 'ipp_performance_bonds',
    entity_id: id,
    data: {
      project_id: bond.project_id,
      bond_number: bond.bond_number,
      claim_amount_zar: body.claim_amount_zar ?? bond.face_value_zar,
      claim_reason: body.claim_reason ?? null,
    },
    env: c.env,
  });

  return c.json({ success: true });
});

export default app;

// ═══════════════════════════════════════════════════════════════════════════
// Cron-driven sweep — exported for src/index.ts to call from the daily 05:00
// scheduled handler.  Walks active bonds + non-terminal insurance policies,
// re-derives expiry_status, persists transitions, writes a notice row +
// fires fire-once cascades on each cycle entry.
// ═══════════════════════════════════════════════════════════════════════════

interface SweepEnv {
  DB: D1Database;
  [key: string]: unknown;
}

export async function bondExpirySweep(env: SweepEnv & { CASCADE_QUEUE?: unknown; AI?: unknown }): Promise<{
  bonds_evaluated: number;
  bonds_advanced: number;
  insurance_evaluated: number;
  insurance_advanced: number;
}> {
  const now = new Date();
  const nowIso = now.toISOString();
  let bondsAdv = 0;
  let insAdv = 0;

  // Bonds.
  const bonds = await env.DB
    .prepare(`SELECT * FROM ipp_performance_bonds WHERE status = 'active'`)
    .all<BondRow>();
  const bondRows = bonds.results || [];

  for (const b of bondRows) {
    const prev: ExpiryStatus = (b.expiry_status ?? 'green') as ExpiryStatus;
    const next = expiryStatusFor(b.expiry_at, b.status, now);
    if (next === prev) continue;

    // Advance.
    const sets: string[] = ['expiry_status = ?', 'updated_at = ?'];
    const params: unknown[] = [next, nowIso];

    if (next === 'warning')   { sets.push('last_warning_at = ?');   params.push(nowIso); }
    if (next === 'cycle_1')   { sets.push('last_cycle_1_at = ?');   params.push(nowIso); }
    if (next === 'cycle_2')   { sets.push('last_cycle_2_at = ?');   params.push(nowIso); }
    if (next === 'cycle_3')   { sets.push('last_cycle_3_at = ?');   params.push(nowIso); }
    if (next === 'escalated') { sets.push('last_escalated_at = ?'); params.push(nowIso); }

    params.push(b.id);
    await env.DB.prepare(`UPDATE ipp_performance_bonds SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...params).run();

    // Issue notice row for cycle entries (skip 'green').
    if (next !== 'green') {
      const cycle = next === 'warning' ? 0
                  : next === 'cycle_1' ? 1
                  : next === 'cycle_2' ? 2
                  : next === 'cycle_3' ? 3
                  : 3;
      const noticeId = newId('bn');
      await env.DB.prepare(`
        INSERT INTO ipp_bond_notices (
          id, bond_id, project_id, cycle, title, body_json,
          status, issued_at, issued_by, cure_deadline_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'system', ?)
      `).bind(
        noticeId, b.id, b.project_id, cycle,
        `${STATUS_LABEL[next] ?? next} — bond ${b.bond_number} (${b.bond_type})`,
        JSON.stringify({
          days_until_expiry: daysUntil(b.expiry_at, now),
          face_value_zar: b.face_value_zar,
        }),
        next === 'escalated' ? 'escalated' : 'issued',
        nowIso,
        cureDeadlineFor(next, now),
      ).run();

      // Mark prior notices as superseded.
      await env.DB.prepare(`
        UPDATE ipp_bond_notices SET status = 'superseded'
        WHERE bond_id = ? AND status = 'issued' AND id <> ?
      `).bind(b.id, noticeId).run();
    }

    // Fire-once cascades.
    if (next === 'warning') {
      await fireCascade({
        event: 'ipp.bond_warning',
        actor_id: 'system',
        entity_type: 'ipp_performance_bonds',
        entity_id: b.id,
        data: { project_id: b.project_id, bond_number: b.bond_number, days_until_expiry: daysUntil(b.expiry_at, now) },
        env: env as never,
      });
    } else if (next === 'cycle_1') {
      await fireCascade({
        event: 'ipp.bond_cycle_1_notice',
        actor_id: 'system',
        entity_type: 'ipp_performance_bonds',
        entity_id: b.id,
        data: { project_id: b.project_id, bond_number: b.bond_number },
        env: env as never,
      });
    } else if (next === 'cycle_2') {
      await fireCascade({
        event: 'ipp.bond_cycle_2_notice',
        actor_id: 'system',
        entity_type: 'ipp_performance_bonds',
        entity_id: b.id,
        data: { project_id: b.project_id, bond_number: b.bond_number },
        env: env as never,
      });
    } else if (next === 'cycle_3') {
      await fireCascade({
        event: 'ipp.bond_cycle_3_notice',
        actor_id: 'system',
        entity_type: 'ipp_performance_bonds',
        entity_id: b.id,
        data: { project_id: b.project_id, bond_number: b.bond_number },
        env: env as never,
      });
    } else if (next === 'escalated') {
      await fireCascade({
        event: 'ipp.bond_expiry_escalated',
        actor_id: 'system',
        entity_type: 'ipp_performance_bonds',
        entity_id: b.id,
        data: {
          project_id: b.project_id,
          bond_number: b.bond_number,
          face_value_zar: b.face_value_zar,
          days_overdue: -daysUntil(b.expiry_at, now),
        },
        env: env as never,
      });
    }
    bondsAdv++;
  }

  // Insurance policies — derive expiry_status from end_date + status.
  interface InsuranceRow {
    id: string;
    project_id?: string;
    end_date?: string;
    expiry_date?: string;
    status: string;
    expiry_status: ExpiryStatus | null;
  }
  const ins = await env.DB
    .prepare(`SELECT id, project_id, end_date, expiry_date, status, expiry_status FROM insurance_policies WHERE status NOT IN ('cancelled','expired','replaced')`)
    .all<InsuranceRow>();
  const insRows = ins.results || [];

  for (const p of insRows) {
    const expiryAt = p.end_date ?? p.expiry_date;
    if (!expiryAt) continue;
    const prev: ExpiryStatus = (p.expiry_status ?? 'green') as ExpiryStatus;
    const next = expiryStatusFor(expiryAt, p.status, now);
    if (next === prev) continue;

    const sets: string[] = ['expiry_status = ?'];
    const params: unknown[] = [next];

    if (next === 'warning')   { sets.push('last_warning_at = ?');   params.push(nowIso); }
    if (next === 'cycle_1')   { sets.push('last_cycle_1_at = ?');   params.push(nowIso); }
    if (next === 'cycle_2')   { sets.push('last_cycle_2_at = ?');   params.push(nowIso); }
    if (next === 'cycle_3')   { sets.push('last_cycle_3_at = ?');   params.push(nowIso); }
    if (next === 'escalated') { sets.push('last_escalated_at = ?'); params.push(nowIso); }

    params.push(p.id);
    await env.DB.prepare(`UPDATE insurance_policies SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...params).run();
    insAdv++;
  }

  return {
    bonds_evaluated: bondRows.length,
    bonds_advanced: bondsAdv,
    insurance_evaluated: insRows.length,
    insurance_advanced: insAdv,
  };
}
