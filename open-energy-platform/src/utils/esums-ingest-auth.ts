// ════════════════════════════════════════════════════════════════════════
// Esums ingest-key verification.
//
// Devices and CSV uploads authenticate with a per-site opaque token instead
// of a user JWT. We store SHA-256(token) in om_ingest_keys.token_hash and
// look it up here. The raw token is returned exactly once at creation.
// ════════════════════════════════════════════════════════════════════════

import type { HonoEnv } from './types';

export interface IngestKey {
  id: string;
  site_id: string;
  label: string;
  scope: string;
  expires_at: string | null;
  revoked: number;
}

export async function hashToken(raw: string): Promise<string> {
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function randomIngestToken(): string {
  return 'esi_' + Array.from(crypto.getRandomValues(new Uint8Array(28)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function extractBearer(header: string | undefined | null): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** Verify an ingest token and bump usage counters. Returns null when invalid. */
export async function verifyIngestKey(
  env: HonoEnv['Bindings'],
  token: string,
): Promise<IngestKey | null> {
  if (!token || token.length < 16) return null;
  const tokenHash = await hashToken(token);
  const key = await env.DB.prepare(
    `SELECT id, site_id, label, scope, expires_at, revoked
       FROM om_ingest_keys WHERE token_hash = ?`,
  ).bind(tokenHash).first<IngestKey>();
  if (!key) return null;
  if (key.revoked) return null;
  if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) return null;
  // Fire-and-forget usage update — failure to bump counters must NOT block ingestion.
  await env.DB.prepare(
    `UPDATE om_ingest_keys SET last_used_at = datetime('now'), use_count = use_count + 1 WHERE id = ?`,
  ).bind(key.id).run().catch(() => {});
  return key;
}
