// ═══════════════════════════════════════════════════════════════════════════
// Multi-tenant isolation helpers (PR-Prod-2).
//
// Every authenticated request has `auth.user.tenant_id` populated by the auth
// middleware. These helpers guarantee that a participant of tenant A can
// never read/write resources whose owning participant sits in tenant B.
//
// The platform uses `participant.tenant_id` as the tenant anchor. Resources
// (contracts, trades, invoices, LOIs, marketplace listings, etc.) are linked
// to participants via `creator_id` / `counterparty_id` / `participant_id` /
// `from_participant_id` / `to_participant_id`. We therefore verify tenancy
// by looking up the owner participant's tenant and comparing against the
// caller's tenant.
// ═══════════════════════════════════════════════════════════════════════════
import { Context } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { HonoEnv, AppError, ErrorCode, AuthContext } from './types';

export function getAuth(c: Context<HonoEnv>): AuthContext {
  const auth = c.get('auth') as AuthContext | undefined;
  if (!auth?.user) {
    throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
  }
  return auth;
}

export function getTenantId(c: Context<HonoEnv>): string {
  return getAuth(c).user.tenant_id || 'default';
}

export function isAdmin(c: Context<HonoEnv>): boolean {
  return getAuth(c).user.role === 'admin';
}

/**
 * Throws FORBIDDEN if `targetParticipantId` is not in the caller's tenant.
 * Admins bypass the check (platform operators need cross-tenant visibility).
 */
export async function assertSameTenantParticipant(
  c: Context<HonoEnv>,
  targetParticipantId: string
): Promise<void> {
  if (isAdmin(c)) return;
  const callerTenant = getTenantId(c);
  const row = await c.env.DB.prepare('SELECT tenant_id FROM participants WHERE id = ?')
    .bind(targetParticipantId)
    .first<{ tenant_id: string | null }>();
  if (!row) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Participant not found', 404);
  }
  const targetTenant = row.tenant_id || 'default';
  if (targetTenant !== callerTenant) {
    throw new AppError(ErrorCode.FORBIDDEN, 'Cross-tenant access denied', 403);
  }
}

/**
 * Ensures the caller and the given resource's owning participant belong to
 * the same tenant. `ownerColumn` is the FK column to participants(id); common
 * values are 'creator_id', 'counterparty_id', 'participant_id',
 * 'from_participant_id', 'to_participant_id'.
 *
 * Tables that directly carry a `tenant_id` column are handled by
 * {@link assertResourceTenant} instead.
 */
export async function assertSameTenantForResource(
  c: Context<HonoEnv>,
  table: string,
  resourceId: string,
  ownerColumn: string = 'creator_id'
): Promise<void> {
  if (isAdmin(c)) return;
  // Validate identifiers to avoid SQL injection via column name
  if (!/^[a-z_][a-z0-9_]*$/i.test(table) || !/^[a-z_][a-z0-9_]*$/i.test(ownerColumn)) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'Invalid tenant-scope identifier', 500);
  }
  const sql = `SELECT p.tenant_id AS tenant_id
               FROM ${table} r
               JOIN participants p ON p.id = r.${ownerColumn}
               WHERE r.id = ?`;
  const row = await c.env.DB.prepare(sql).bind(resourceId).first<{ tenant_id: string | null }>();
  if (!row) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Resource not found', 404);
  }
  const callerTenant = getTenantId(c);
  const targetTenant = row.tenant_id || 'default';
  if (targetTenant !== callerTenant) {
    throw new AppError(ErrorCode.FORBIDDEN, 'Cross-tenant access denied', 403);
  }
}

/**
 * Variant for tables with direct `tenant_id` column (e.g. contract_documents,
 * participants). Cheaper than the JOIN variant.
 */
export async function assertResourceTenant(
  c: Context<HonoEnv>,
  table: string,
  resourceId: string
): Promise<void> {
  if (isAdmin(c)) return;
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'Invalid tenant-scope identifier', 500);
  }
  const sql = `SELECT tenant_id FROM ${table} WHERE id = ?`;
  const row = await c.env.DB.prepare(sql).bind(resourceId).first<{ tenant_id: string | null }>();
  if (!row) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Resource not found', 404);
  }
  const callerTenant = getTenantId(c);
  const targetTenant = row.tenant_id || 'default';
  if (targetTenant !== callerTenant) {
    throw new AppError(ErrorCode.FORBIDDEN, 'Cross-tenant access denied', 403);
  }
}

/**
 * Resolve (or create) the tenant for a primary self-registering participant.
 *
 * Self-register with no invitation should bootstrap a NEW tenant keyed off the
 * company's identity so the first member is not dumped into the shared
 * 'default' tenant. A deterministic id/slug derived from the same key makes
 * this idempotent: a second self-register for the same company rejoins the
 * same tenant instead of creating a duplicate.
 *
 * Key precedence: a non-empty trimmed reg_number, else a non-empty trimmed
 * company_name. Absent both, returns 'default' (preserves today's behaviour
 * for company-less self-registers).
 *
 * SECURITY INVARIANT: table/column names in the SQL come only from this static
 * string literal; the request-derived slug/id/display_name values bind ONLY
 * through '?' placeholders. No request value is interpolated into SQL text.
 */
export async function resolveOrCreateTenant(
  env: { DB: D1Database },
  opts: { company_name?: string | null; reg_number?: string | null },
): Promise<string> {
  const regNumber = (opts.reg_number ?? '').trim();
  const companyName = (opts.company_name ?? '').trim();
  const key = regNumber || companyName;
  if (!key) return 'default';

  const slug = key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (!slug) return 'default';

  const id = `t_${slug}`;
  const displayName = companyName || regNumber || slug;

  await env.DB.prepare(
    `INSERT OR IGNORE INTO tenants (id, slug, display_name, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
  ).bind(id, slug, displayName).run();

  return id;
}

// ═══════════════════════════════════════════════════════════════════════════
// Reserved SANDBOX tenant-id namespace.
//
// `sandbox_<participant_id>` is a reserved tenant id that holds isolated DEMO
// data so a freshly onboarded user can practice transactions without touching
// any real tenant. Because every read/write is tenant-fenced (see the
// assert*Tenant helpers above), sandbox rows are invisible to the caller's
// real tenant and vice-versa.
//
// GOLDRUSH INVARIANT: demo / synthetic rows are EVER inserted ONLY into a
// `sandbox_*` tenant. NEVER into a real tenant ('default', 't_*', or any other
// non-sandbox id). NXT Energy Goldrush sites and every real tenant must stay
// untouched. Seed code MUST assert isSandboxTenant() before any INSERT.
//
// SECURITY INVARIANT: the participant id binds ONLY through '?' placeholders in
// SQL, never interpolated into SQL text. sandboxTenantId additionally validates
// the id charset so the reserved namespace stays clean.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the reserved sandbox tenant id for a participant: `sandbox_<id>`.
 * Validates the participant id charset defensively to keep the namespace clean
 * (ids already come from getCurrentUser, but we never trust shape).
 */
export function sandboxTenantId(participantId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(participantId)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid participant id', 400);
  }
  return `sandbox_${participantId}`;
}

/** True iff the tenant id sits in the reserved sandbox namespace. */
export function isSandboxTenant(tenantId: string | null | undefined): boolean {
  return !!tenantId && tenantId.startsWith('sandbox_');
}

/**
 * Returns the set of participant IDs in the caller's tenant. Useful for
 * scoping aggregated list queries when individual per-row checks would be
 * prohibitively chatty.
 */
export async function participantsInCallerTenant(c: Context<HonoEnv>): Promise<string[]> {
  const tenant = getTenantId(c);
  const rs = await c.env.DB.prepare('SELECT id FROM participants WHERE COALESCE(NULLIF(tenant_id, \'\'), \'default\') = ?')
    .bind(tenant)
    .all<{ id: string }>();
  return (rs.results || []).map((r) => r.id);
}
