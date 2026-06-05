// ═══════════════════════════════════════════════════════════════════════════
// Wave 191 — Station Participant Link
//
// Formalises the two-party relationship between a registered generation
// station (solax_stations) and a downstream participant entity in the
// capacity of lender, carbon_fund, offtaker, or grid_operator.
//
// On `activate_link` the station's participant reference column is updated:
//   lender       → solax_stations.lender_participant_id
//   carbon_fund  → solax_stations.carbon_participant_id
//   offtaker     → solax_stations.offtaker_participant_id
//   grid_operator → no solax_stations column update
//
// Mounted at /api/station-participant-links.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import { materializeFinancials } from './esums-accruals';
import {
  StationLinkStatus,
  StationLinkAction,
  LinkType,
  deriveLinkSla,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/station-participant-link-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer', 'lender', 'carbon_fund', 'offtaker', 'grid_operator'];

// ─── Party constraint helpers ─────────────────────────────────────────────────

// Actions that only the initiating party (or admin) may call
const INITIATOR_ACTIONS = new Set<StationLinkAction>([
  'submit_for_review',
  'submit_documentation',
  'activate_link',
]);

// Actions that only the accepting party (or admin) may call
const ACCEPTOR_ACTIONS = new Set<StationLinkAction>([
  'request_documentation',
  'commence_technical_validation',
  'commence_commercial_review',
  'commence_compliance_check',
  'approve_link',
  'reject_link',
  'expire_link',
  'suspend_link',
]);

function canActOnLink(
  userId: string,
  userRole: string,
  action: StationLinkAction,
  initiatingParticipantId: string,
  acceptingParticipantId: string,
): boolean {
  if (userRole === 'admin') return true;

  if (INITIATOR_ACTIONS.has(action)) {
    return userId === initiatingParticipantId;
  }
  if (ACCEPTOR_ACTIONS.has(action)) {
    return userId === acceptingParticipantId;
  }
  return false;
}

// Column on solax_stations to update for a given link_type on activate_link
function stationColumnForLinkType(linkType: LinkType): string | null {
  switch (linkType) {
    case 'lender':        return 'lender_participant_id';
    case 'carbon_fund':   return 'carbon_participant_id';
    case 'offtaker':      return 'offtaker_participant_id';
    case 'grid_operator': return null;
  }
}

// ─── SLA sweep (exported — called by cron) ───────────────────────────────────

export async function stationParticipantLinkSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ swept: number }> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, link_type FROM oe_station_participant_links
       WHERE sla_deadline IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_deadline <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; link_type: LinkType }>();

  const rows = breaches.results ?? [];

  for (const row of rows) {
    const reportable = slaBreachCrossesIntoRegulator(row.link_type);

    await env.DB
      .prepare(
        `UPDATE oe_station_participant_links
         SET sla_breached = 1,
             regulator_notified = CASE WHEN ? = 1 THEN 1 ELSE regulator_notified END,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(reportable ? 1 : 0, now, row.id)
      .run();

    await fireCascade({
      event: 'slink_evt_sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'station_link',
      entity_id: row.id,
      data: {
        link_type: row.link_type,
        regulator_notified: reportable,
        crosses_into_regulator: reportable,
      },
      env,
    });
  }

  return { swept: rows.length };
}

// ─── GET / — list records + KPIs ─────────────────────────────────────────────

router.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    status,
    link_type,
    station_id,
    participant_id,
    page = '1',
    per_page = '50',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(per_page) || 50));
  const pageNum = Math.max(1, parseInt(page) || 1);
  const off     = (pageNum - 1) * perPage;

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  // Scope to participant involvement unless admin/regulator
  if (['admin', 'regulator'].includes(user.role)) {
    if (participant_id) {
      clauses.push('(initiating_participant_id = ? OR accepting_participant_id = ?)');
      binds.push(participant_id, participant_id);
    }
  } else {
    clauses.push('(initiating_participant_id = ? OR accepting_participant_id = ?)');
    binds.push(user.id, user.id);
  }

  if (status)    { clauses.push('chain_status = ?'); binds.push(status); }
  if (link_type) { clauses.push('link_type = ?');    binds.push(link_type); }
  if (station_id){ clauses.push('station_id = ?');   binds.push(station_id); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_station_participant_links ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_station_participant_links ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'link_active'   THEN 1 ELSE 0 END) as active_links,
           SUM(CASE WHEN chain_status = 'link_rejected' THEN 1 ELSE 0 END) as rejected_count,
           SUM(CASE WHEN chain_status = 'link_expired'  THEN 1 ELSE 0 END) as expired_count
         FROM oe_station_participant_links ${where}`,
      )
      .bind(...[...HARD_TERMINALS], ...binds)
      .first<Record<string, unknown>>(),
  ]);

  const total = totalRow?.n ?? 0;

  return c.json({
    success: true,
    data: {
      items: rows.results ?? [],
      pagination: {
        page: pageNum,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage),
      },
      kpis,
    },
  });
});

// ─── GET /:id — single record + audit trail ──────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_station_participant_links WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  // Allow participants on this link and admins/regulators to read
  if (
    !['admin', 'regulator'].includes(user.role) &&
    row.initiating_participant_id !== user.id &&
    row.accepting_participant_id  !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const audit = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'station_link' AND entity_id = ?
       ORDER BY created_at DESC LIMIT 20`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create / propose a new link ────────────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    station_id: string;
    accepting_participant_id: string;
    link_type: LinkType;
    reference_id?: string | null;
  }>();

  if (!body.station_id || !body.accepting_participant_id || !body.link_type) {
    return c.json(
      {
        success: false,
        error: 'station_id, accepting_participant_id, and link_type are required',
      },
      400,
    );
  }

  const validLinkTypes: LinkType[] = ['lender', 'carbon_fund', 'offtaker', 'grid_operator'];
  if (!validLinkTypes.includes(body.link_type)) {
    return c.json(
      { success: false, error: `link_type must be one of: ${validLinkTypes.join(', ')}` },
      400,
    );
  }

  // Prevent self-handshake — initiator and acceptor must be different participants
  if (body.accepting_participant_id === user.id) {
    return c.json(
      { success: false, error: 'Initiator and acceptor must be different participants' },
      400,
    );
  }

  // Verify station ownership: non-admin must be station owner OR named acceptor
  if (user.role !== 'admin') {
    const station = await c.env.DB
      .prepare('SELECT participant_id FROM solax_stations WHERE id = ?')
      .bind(body.station_id)
      .first<{ participant_id: string }>();
    if (!station) {
      return c.json({ success: false, error: 'Station not found' }, 404);
    }
    if (station.participant_id !== user.id && body.accepting_participant_id !== user.id) {
      return c.json(
        { success: false, error: 'You must be the station owner or the named counterparty to propose this link' },
        403,
      );
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const id = `station_link_${crypto.randomUUID()}`;

  const slaDays = deriveLinkSla(body.link_type);
  const slaDeadline = new Date(now.getTime() + slaDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  await c.env.DB
    .prepare(
      `INSERT INTO oe_station_participant_links
         (id, station_id, initiating_participant_id, accepting_participant_id,
          link_type, reference_id,
          chain_status,
          sla_deadline, sla_breached, regulator_notified,
          actor_id,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,'link_proposed',?,0,0,?,?,?)`,
    )
    .bind(
      id,
      body.station_id,
      user.id,
      body.accepting_participant_id,
      body.link_type,
      body.reference_id ?? null,
      slaDeadline,
      user.id,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'slink_evt_proposed' as EventType,
    actor_id: user.id,
    entity_type: 'station_link',
    entity_id: id,
    data: {
      station_id: body.station_id,
      accepting_participant_id: body.accepting_participant_id,
      link_type: body.link_type,
      reference_id: body.reference_id ?? null,
      sla_deadline: slaDeadline,
    },
    env: c.env,
  });

  return c.json(
    { success: true, data: { id, link_type: body.link_type, sla_deadline: slaDeadline } },
    201,
  );
});

// ─── POST /:id/action — state machine transition ──────────────────────────────

router.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: StationLinkAction;
    reason?: string | null;
  }>();

  if (!body.action) {
    return c.json({ success: false, error: 'action is required' }, 400);
  }

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_station_participant_links WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  // Party constraint enforcement
  const action = body.action as StationLinkAction;
  const initiatingId = row.initiating_participant_id as string;
  const acceptingId  = row.accepting_participant_id  as string;

  if (!canActOnLink(user.id, user.role, action, initiatingId, acceptingId)) {
    return c.json(
      {
        success: false,
        error: `Action '${action}' is not permitted for your party on this link`,
      },
      403,
    );
  }

  const current = row.chain_status as StationLinkStatus;

  if (HARD_TERMINALS.has(current)) {
    return c.json(
      {
        success: false,
        error: `Status '${current}' is terminal — no further transitions allowed`,
      },
      400,
    );
  }

  const rule = VALID_TRANSITIONS[action];
  if (!rule) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  if (!rule.from.includes(current)) {
    return c.json(
      {
        success: false,
        error: `Cannot apply action '${action}' from status '${current}'`,
      },
      400,
    );
  }

  const nextStatus = STATE_TRANSITIONS[action];
  const linkType   = row.link_type as LinkType;
  const now        = new Date();
  const nowIso     = now.toISOString();

  const reportable = crossesIntoRegulator(action, linkType);

  // SLA breach detection
  const slaDeadline    = row.sla_deadline as string | null;
  const alreadyBreached = (row.sla_breached as number) === 1;
  let slaBreached       = alreadyBreached ? 1 : 0;
  let regulatorNotified = (row.regulator_notified as number) === 1 ? 1 : (reportable ? 1 : 0);

  if (slaDeadline && !alreadyBreached && nowIso > slaDeadline) {
    slaBreached = 1;
    if (slaBreachCrossesIntoRegulator(linkType)) {
      regulatorNotified = 1;
    }
  }

  await c.env.DB
    .prepare(
      `UPDATE oe_station_participant_links
       SET chain_status = ?,
           reason = ?,
           actor_id = ?,
           sla_breached = ?,
           regulator_notified = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextStatus,
      body.reason ?? null,
      user.id,
      slaBreached,
      regulatorNotified,
      nowIso,
      id,
    )
    .run();

  // On activate_link → update the station's participant reference column,
  // then catch-up-materialize financial records for this station.
  // This bridges historical accruals into invoices/credits immediately on link.
  if (action === 'activate_link') {
    const stationCol = stationColumnForLinkType(linkType);
    if (stationCol) {
      await c.env.DB
        .prepare(
          `UPDATE solax_stations
           SET ${stationCol} = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(acceptingId, nowIso, row.station_id as string)
        .run();
    }

    // Bridge: materialize historical invoices/credits for this station
    if (linkType === 'offtaker' || linkType === 'carbon_fund') {
      const stationOwner = await c.env.DB
        .prepare(`SELECT participant_id FROM solax_stations WHERE id = ?`)
        .bind(row.station_id as string)
        .first<{ participant_id: string }>();
      if (stationOwner) {
        materializeFinancials(stationOwner.participant_id, c.env, row.station_id as string)
          .catch(() => { /* non-fatal — next cron cycle will retry */ });
      }
    }
  }

  await fireCascade({
    event: `slink_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'station_link',
    entity_id: id,
    data: {
      action,
      from_status: current,
      to_status: nextStatus,
      reason: body.reason ?? null,
      link_type: linkType,
      station_id: row.station_id,
      initiating_participant_id: initiatingId,
      accepting_participant_id: acceptingId,
      reference_id: row.reference_id ?? null,
      regulator_notified: reportable,
      crosses_into_regulator: reportable,
    },
    env: c.env,
  });

  return c.json({
    success: true,
    data: {
      id,
      status: nextStatus,
      regulator_notified: regulatorNotified === 1,
    },
  });
});

// ─── POST /sla-sweep — internal cron endpoint ────────────────────────────────

router.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden — admin only' }, 403);
  }

  const result = await stationParticipantLinkSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export const stationParticipantLinkRoutes = router;
export default router;
