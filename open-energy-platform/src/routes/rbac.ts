// ════════════════════════════════════════════════════════════════════════
// RBAC — /api/rbac
//
// Manages permissions, invitations, self-registration, and user profiles.
//
// Public (no auth):
//   GET  /api/rbac/permissions          — full permission catalogue
//   GET  /api/rbac/roles                — role → permission matrix
//   GET  /api/rbac/roles/invitable      — which roles a given role may invite (query ?as=<role>)
//   POST /api/rbac/registrations        — self-register (goes to pending queue)
//   GET  /api/rbac/invitations/:token   — resolve invitation token (pre-fill form)
//   POST /api/rbac/invitations/:token/accept — accept invitation + create account
//
// Authenticated (any role):
//   GET  /api/rbac/me                   — own profile + permissions
//   PATCH /api/rbac/me                  — update own profile (name, phone, bio…)
//   GET  /api/rbac/me/invitations       — invitations I created
//   POST /api/rbac/me/invitations       — create invitation (within allowed roles)
//   DELETE /api/rbac/me/invitations/:id — revoke my invitation
//
// Admin + Support:
//   GET  /api/rbac/users                — user directory (all participants)
//   GET  /api/rbac/users/:id            — user detail + permissions
//   PATCH /api/rbac/users/:id           — update role / status / profile
//   GET  /api/rbac/registrations        — pending self-registration queue
//   POST /api/rbac/registrations/:id/approve — approve → convert to participant
//   POST /api/rbac/registrations/:id/reject  — reject with reason
//   GET  /api/rbac/invitations          — all invitations (admin view)
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser, hashPassword } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const rbac = new Hono<HonoEnv>();

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_ROLES = [
  'admin', 'support', 'trader', 'ipp_developer', 'lender',
  'offtaker', 'carbon_fund', 'grid_operator', 'regulator',
] as const;
// Which roles each role is allowed to invite
const INVITABLE_BY: Record<string, string[]> = {
  admin:        [...ALL_ROLES],
  support:      ['support'],
  trader:       ['trader'],
  ipp_developer: ['ipp_developer'],
  lender:       ['lender'],
  offtaker:     ['offtaker'],
  carbon_fund:  ['carbon_fund'],
  grid_operator: ['grid_operator'],
  regulator:    ['regulator'],
};

// Self-register: roles that appear on the public sign-up form
const SELF_REGISTER_ROLES: string[] = [
  'trader', 'ipp_developer', 'lender', 'offtaker', 'carbon_fund',
];

const ADMIN_ROLES = ['admin', 'support'];

const genId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);
const genToken = () => crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

function isAdmin(role: string) { return ADMIN_ROLES.includes(role); }

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getPermissionsForRole(db: any, role: string): Promise<string[]> {
  const rows = await db.prepare(
    `SELECT permission_key FROM rbac_role_permissions WHERE role = ? ORDER BY permission_key`
  ).bind(role).all().then((r: any) => r.results ?? []);
  return rows.map((r: any) => r.permission_key as string);
}

// ─── Public: Permission catalogue ─────────────────────────────────────────────

rbac.get('/permissions', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT key, domain, action, display_name, description FROM rbac_permissions ORDER BY domain, action`
  ).all().then((r: any) => r.results ?? []);
  return c.json({ success: true, data: rows });
});

rbac.get('/roles', async (c) => {
  const perms = await c.env.DB.prepare(
    `SELECT role, permission_key FROM rbac_role_permissions ORDER BY role, permission_key`
  ).all().then((r: any) => r.results ?? []);

  const matrix: Record<string, string[]> = {};
  for (const { role, permission_key } of perms as any[]) {
    if (!matrix[role]) matrix[role] = [];
    matrix[role].push(permission_key);
  }

  const result = ALL_ROLES.map(role => ({
    role,
    display_name: roleLabel(role),
    self_register: SELF_REGISTER_ROLES.includes(role),
    can_invite: INVITABLE_BY[role] ?? [],
    permissions: matrix[role] ?? [],
  }));

  return c.json({ success: true, data: result });
});

rbac.get('/roles/invitable', async (c) => {
  const as = c.req.query('as') ?? '';
  const allowed = INVITABLE_BY[as] ?? [];
  return c.json({ success: true, data: { as, can_invite: allowed } });
});

// ─── Public: Self-registration ─────────────────────────────────────────────────

rbac.get('/register/roles', (c) => {
  return c.json({
    success: true,
    data: SELF_REGISTER_ROLES.map(r => ({ role: r, display_name: roleLabel(r) })),
  });
});

rbac.post('/registrations', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}));
  const { email, password, full_name, company_name, requested_role,
          organization_type, reg_number, phone, motivation, invitation_token } = body;

  if (!email || !password || !full_name || !requested_role) {
    return c.json({ success: false, error: 'email, password, full_name and requested_role required' }, 400);
  }
  if (!SELF_REGISTER_ROLES.includes(requested_role) && !invitation_token) {
    return c.json({ success: false, error: 'Role requires an invitation link' }, 400);
  }

  // Check duplicate
  const existingPart = await c.env.DB.prepare('SELECT id FROM participants WHERE email = ?').bind(email).first();
  if (existingPart) return c.json({ success: false, error: 'Email already registered' }, 409);
  const existingReg = await c.env.DB.prepare(
    `SELECT id FROM rbac_registrations WHERE email = ? AND status = 'pending'`
  ).bind(email).first();
  if (existingReg) return c.json({ success: false, error: 'Registration already pending review' }, 409);

  // Validate invitation if provided
  let invitationId: string | null = null;
  let grantedRole = requested_role;

  if (invitation_token) {
    const inv = await c.env.DB.prepare(
      `SELECT id, role, status, expires_at FROM rbac_invitations WHERE token = ?`
    ).bind(invitation_token).first<any>();
    if (!inv) return c.json({ success: false, error: 'Invalid invitation link' }, 404);
    if (inv.status !== 'pending') return c.json({ success: false, error: `Invitation already ${inv.status}` }, 400);
    if (new Date(inv.expires_at) < new Date()) return c.json({ success: false, error: 'Invitation expired' }, 400);
    invitationId = inv.id;
    grantedRole = inv.role;
  }

  const passwordHash = await hashPassword(password);
  const id = genId();

  await c.env.DB.prepare(`
    INSERT INTO rbac_registrations
      (id, email, password_hash, full_name, company_name, requested_role,
       organization_type, reg_number, phone, motivation, invitation_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(id, email, passwordHash, full_name, company_name ?? null, grantedRole,
           organization_type ?? null, reg_number ?? null, phone ?? null,
           motivation ?? null, invitationId).run();

  await fireCascade({
    event: 'rbac.registration_submitted',
    actor_id: id,
    entity_type: 'rbac_registrations',
    entity_id: id,
    data: { email, requested_role: grantedRole, has_invitation: !!invitationId },
    env: c.env,
  });

  // If came via invitation → auto-approve
  if (invitationId) {
    return approveRegistration(c, id, null, invitationId);
  }

  return c.json({
    success: true,
    data: {
      registration_id: id,
      status: 'pending',
      message: 'Your registration is under review. You will receive an email once approved.',
    },
  });
});

// ─── Public: Invitation resolution ────────────────────────────────────────────

rbac.get('/invitations/:token', async (c) => {
  const token = c.req.param('token');
  const inv = await c.env.DB.prepare(`
    SELECT i.id, i.email, i.role, i.organization, i.note, i.status, i.expires_at,
           p.name as invited_by_name, p.company_name as invited_by_company
    FROM rbac_invitations i
    LEFT JOIN participants p ON p.id = i.invited_by
    WHERE i.token = ?
  `).bind(token).first<any>();

  if (!inv) return c.json({ success: false, error: 'Invalid invitation link' }, 404);
  if (inv.status !== 'pending') return c.json({ success: false, error: `Invitation ${inv.status}` }, 400);
  if (new Date(inv.expires_at) < new Date()) {
    await c.env.DB.prepare(`UPDATE rbac_invitations SET status='expired' WHERE id=?`).bind(inv.id).run();
    return c.json({ success: false, error: 'Invitation expired' }, 400);
  }

  return c.json({ success: true, data: inv });
});

// ─── Authenticated routes ──────────────────────────────────────────────────────

rbac.use('/me*', authMiddleware);
rbac.use('/users*', authMiddleware);
rbac.use('/registrations*', authMiddleware);
rbac.use('/invitations*', authMiddleware);

// ─── My profile ───────────────────────────────────────────────────────────────

rbac.get('/me', async (c) => {
  const user = getCurrentUser(c);
  const profile = await c.env.DB.prepare(`
    SELECT id, email, name, company_name, role, status, kyc_status,
           subscription_tier, phone, job_title, org_website, org_reg_num,
           bio, email_verified, last_login, created_at, invited_by
    FROM participants WHERE id = ?
  `).bind(user.id).first<any>();

  if (!profile) return c.json({ success: false, error: 'Profile not found' }, 404);

  const permissions = await getPermissionsForRole(c.env.DB, profile.role);
  const canInvite = INVITABLE_BY[profile.role] ?? [];

  return c.json({
    success: true,
    data: {
      ...profile,
      permissions,
      can_invite_roles: canInvite,
    },
  });
});

rbac.patch('/me', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json<any>().catch(() => ({}));

  // Only allow updating profile fields — never role or status
  const allowed = ['name', 'phone', 'job_title', 'org_website', 'org_reg_num', 'bio'] as const;
  const updates: Record<string, unknown> = {};
  for (const field of allowed) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  // company_name only if no IPP project data would break
  if (body.company_name !== undefined) updates['company_name'] = body.company_name;

  if (Object.keys(updates).length === 0) {
    return c.json({ success: false, error: 'No updatable fields provided' }, 400);
  }

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  await c.env.DB.prepare(
    `UPDATE participants SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`
  ).bind(...Object.values(updates), user.id).run();

  await fireCascade({
    event: 'rbac.profile_updated',
    actor_id: user.id,
    entity_type: 'participants',
    entity_id: user.id,
    data: { fields: Object.keys(updates) },
    env: c.env,
  });

  return c.json({ success: true });
});

// ─── My invitations ───────────────────────────────────────────────────────────

rbac.get('/me/invitations', async (c) => {
  const user = getCurrentUser(c);
  const rows = await c.env.DB.prepare(`
    SELECT i.*, p.name as accepted_by_name, p.email as accepted_by_email
    FROM rbac_invitations i
    LEFT JOIN participants p ON p.id = i.accepted_by
    WHERE i.invited_by = ?
    ORDER BY i.created_at DESC LIMIT 100
  `).bind(user.id).all().then((r: any) => r.results ?? []);
  return c.json({ success: true, data: rows });
});

rbac.post('/me/invitations', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json<any>().catch(() => ({}));
  const { role, email, organization, note, expires_hours = 72 } = body;

  if (!role) return c.json({ success: false, error: 'role required' }, 400);

  const allowed = INVITABLE_BY[user.role] ?? [];
  if (!allowed.includes(role)) {
    return c.json({
      success: false,
      error: `Your role (${user.role}) may only invite: ${allowed.join(', ')}`,
    }, 403);
  }

  const id = genId();
  const token = genToken();
  const expiresAt = new Date(Date.now() + expires_hours * 3_600_000).toISOString();

  await c.env.DB.prepare(`
    INSERT INTO rbac_invitations (id, token, invited_by, email, role, organization, note, expires_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(id, token, user.id, email ?? null, role, organization ?? null, note ?? null, expiresAt).run();

  await fireCascade({
    event: 'rbac.invitation_created',
    actor_id: user.id,
    entity_type: 'rbac_invitations',
    entity_id: id,
    data: { id, role, email, expires_at: expiresAt },
    env: c.env,
  });

  return c.json({
    success: true,
    data: {
      id,
      token,
      role,
      expires_at: expiresAt,
      invite_url: `/register?token=${token}`,
    },
  }, 201);
});

rbac.delete('/me/invitations/:id', async (c) => {
  const user = getCurrentUser(c);
  const invId = c.req.param('id');

  const inv = await c.env.DB.prepare(
    `SELECT id, invited_by, status FROM rbac_invitations WHERE id = ?`
  ).bind(invId).first<any>();

  if (!inv) return c.json({ success: false, error: 'Not found' }, 404);
  if (inv.invited_by !== user.id && !isAdmin(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  if (inv.status === 'accepted') {
    return c.json({ success: false, error: 'Cannot revoke an accepted invitation' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE rbac_invitations SET status = 'revoked' WHERE id = ?`
  ).bind(invId).run();

  return c.json({ success: true });
});

// ─── Admin: User directory ─────────────────────────────────────────────────────

rbac.get('/users', async (c) => {
  const user = getCurrentUser(c);
  if (!isAdmin(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const role = c.req.query('role');
  const status = c.req.query('status');
  const q = c.req.query('q');
  const page = Math.max(1, Number(c.req.query('page') ?? 1));
  const limit = Math.min(100, Number(c.req.query('limit') ?? 50));
  const offset = (page - 1) * limit;

  const where: string[] = [];
  const binds: unknown[] = [];
  if (role) { where.push('p.role = ?'); binds.push(role); }
  if (status) { where.push('p.status = ?'); binds.push(status); }
  if (q) { where.push(`(p.name LIKE ? OR p.email LIKE ? OR p.company_name LIKE ?)`); binds.push(`%${q}%`, `%${q}%`, `%${q}%`); }

  const sql = `
    SELECT p.id, p.email, p.name, p.company_name, p.role, p.status, p.kyc_status,
           p.subscription_tier, p.phone, p.job_title, p.email_verified,
           p.last_login, p.created_at,
           inv.name as invited_by_name
    FROM participants p
    LEFT JOIN participants inv ON inv.id = p.invited_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const [rows, total] = await Promise.all([
    c.env.DB.prepare(sql).bind(...binds, limit, offset).all().then((r: any) => r.results ?? []),
    c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM participants p ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`
    ).bind(...binds).first<any>().then((r: any) => r?.n ?? 0),
  ]);

  return c.json({ success: true, data: { users: rows, total, page, limit } });
});

rbac.get('/users/:id', async (c) => {
  const user = getCurrentUser(c);
  const targetId = c.req.param('id');
  if (!isAdmin(user.role) && user.id !== targetId) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const profile = await c.env.DB.prepare(`
    SELECT p.*, inv.name as invited_by_name
    FROM participants p
    LEFT JOIN participants inv ON inv.id = p.invited_by
    WHERE p.id = ?
  `).bind(targetId).first<any>();
  if (!profile) return c.json({ success: false, error: 'Not found' }, 404);

  const permissions = await getPermissionsForRole(c.env.DB, profile.role);
  const invitations = await c.env.DB.prepare(
    `SELECT id, email, role, status, expires_at, created_at FROM rbac_invitations WHERE invited_by = ? ORDER BY created_at DESC LIMIT 20`
  ).bind(targetId).all().then((r: any) => r.results ?? []);

  return c.json({ success: true, data: { ...profile, permissions, invitations } });
});

rbac.patch('/users/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!isAdmin(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const targetId = c.req.param('id');
  const body = await c.req.json<any>().catch(() => ({}));

  // Support can only update status/kyc; only admin can change roles
  const allowedForSupport = ['status', 'kyc_status', 'subscription_tier', 'name', 'phone', 'job_title', 'bio'];
  const allowedForAdmin = [...allowedForSupport, 'role', 'company_name', 'org_reg_num', 'org_website'];
  const allowed = user.role === 'admin' ? allowedForAdmin : allowedForSupport;

  const updates: Record<string, unknown> = {};
  for (const field of allowed) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ success: false, error: 'No updatable fields provided' }, 400);
  }

  // Validate role if changing
  if (updates.role && !(ALL_ROLES as readonly string[]).includes(updates.role as string)) {
    return c.json({ success: false, error: `Invalid role: ${updates.role}` }, 400);
  }

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  await c.env.DB.prepare(
    `UPDATE participants SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`
  ).bind(...Object.values(updates), targetId).run();

  await fireCascade({
    event: 'rbac.user_updated',
    actor_id: user.id,
    entity_type: 'participants',
    entity_id: targetId,
    data: { fields: Object.keys(updates), updated_by: user.id },
    env: c.env,
  });

  return c.json({ success: true });
});

// ─── Admin: Registration queue ─────────────────────────────────────────────────

rbac.get('/registrations', async (c) => {
  const user = getCurrentUser(c);
  if (!isAdmin(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const status = c.req.query('status') ?? 'pending';
  const rows = await c.env.DB.prepare(`
    SELECT r.*, rev.name as reviewed_by_name
    FROM rbac_registrations r
    LEFT JOIN participants rev ON rev.id = r.reviewed_by
    WHERE r.status = ?
    ORDER BY r.created_at ASC LIMIT 200
  `).bind(status).all().then((r: any) => r.results ?? []);
  return c.json({ success: true, data: rows });
});

rbac.post('/registrations/:id/approve', async (c) => {
  const user = getCurrentUser(c);
  if (!isAdmin(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const regId = c.req.param('id');
  const body = await c.req.json<any>().catch(() => ({}));
  const overrideRole = body.role;

  return approveRegistration(c, regId, user.id, null, overrideRole);
});

rbac.post('/registrations/:id/reject', async (c) => {
  const user = getCurrentUser(c);
  if (!isAdmin(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const regId = c.req.param('id');
  const body = await c.req.json<any>().catch(() => ({}));
  const reason = body.reason ?? 'Does not meet onboarding requirements';

  const reg = await c.env.DB.prepare(
    `SELECT id, status, email FROM rbac_registrations WHERE id = ?`
  ).bind(regId).first<any>();
  if (!reg) return c.json({ success: false, error: 'Not found' }, 404);
  if (reg.status !== 'pending') return c.json({ success: false, error: `Already ${reg.status}` }, 400);

  await c.env.DB.prepare(`
    UPDATE rbac_registrations
    SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now'), rejection_reason = ?
    WHERE id = ?
  `).bind(user.id, reason, regId).run();

  await fireCascade({
    event: 'rbac.registration_rejected',
    actor_id: user.id,
    entity_type: 'rbac_registrations',
    entity_id: regId,
    data: { reason, email: reg.email },
    env: c.env,
  });

  return c.json({ success: true });
});

// ─── Admin: Invitations list ───────────────────────────────────────────────────

rbac.get('/invitations', async (c) => {
  const user = getCurrentUser(c);
  if (!isAdmin(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const status = c.req.query('status');
  const rows = await c.env.DB.prepare(`
    SELECT i.*, p.name as invited_by_name, a.name as accepted_by_name
    FROM rbac_invitations i
    LEFT JOIN participants p ON p.id = i.invited_by
    LEFT JOIN participants a ON a.id = i.accepted_by
    ${status ? 'WHERE i.status = ?' : ''}
    ORDER BY i.created_at DESC LIMIT 500
  `).bind(...(status ? [status] : [])).all().then((r: any) => r.results ?? []);
  return c.json({ success: true, data: rows });
});

// ─── Approval helper ──────────────────────────────────────────────────────────

async function approveRegistration(
  c: any,
  regId: string,
  reviewerId: string | null,
  invitationId: string | null,
  overrideRole?: string,
): Promise<Response> {
  const reg = await c.env.DB.prepare(
    `SELECT * FROM rbac_registrations WHERE id = ?`
  ).bind(regId).first() as any;

  if (!reg) return c.json({ success: false, error: 'Registration not found' }, 404);
  if (reg.status !== 'pending') return c.json({ success: false, error: `Registration already ${reg.status}` }, 400);

  const role = overrideRole ?? reg.requested_role;

  // Create participant account
  const participantId = genId();
  await c.env.DB.prepare(`
    INSERT INTO participants
      (id, email, password_hash, name, company_name, role, status,
       phone, org_reg_num, email_verified, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, 1, datetime('now'))
  `).bind(
    participantId, reg.email, reg.password_hash, reg.full_name,
    reg.company_name ?? null, role, reg.phone ?? null, reg.reg_number ?? null,
  ).run();

  // Mark registration converted
  await c.env.DB.prepare(`
    UPDATE rbac_registrations
    SET status = 'converted', reviewed_by = ?, reviewed_at = datetime('now')
    WHERE id = ?
  `).bind(reviewerId ?? participantId, regId).run();

  // Mark invitation accepted if applicable
  const invId = invitationId ?? reg.invitation_id;
  if (invId) {
    await c.env.DB.prepare(`
      UPDATE rbac_invitations
      SET status = 'accepted', accepted_by = ?, accepted_at = datetime('now')
      WHERE id = ?
    `).bind(participantId, invId).run();
  }

  await fireCascade({
    event: 'rbac.registration_approved',
    actor_id: reviewerId ?? participantId,
    entity_type: 'participants',
    entity_id: participantId,
    data: { registration_id: regId, role, email: reg.email, via_invitation: !!invId },
    env: c.env,
  });

  return c.json({
    success: true,
    data: {
      participant_id: participantId,
      role,
      message: 'Account created. User may now log in.',
    },
  }, 201);
}

// ─── Label helpers ────────────────────────────────────────────────────────────

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: 'Platform Administrator',
    support: 'Platform Support',
    trader: 'Energy Trader',
    ipp_developer: 'IPP Developer',
    lender: 'Project Finance Lender',
    offtaker: 'Offtaker / Corporate Buyer',
    carbon_fund: 'Carbon Fund / Registry',
    grid_operator: 'Grid Operator (SO/DSO)',
    regulator: 'Regulator (NERSA/DMRE)',
  };
  return labels[role] ?? role;
}

export default rbac;
