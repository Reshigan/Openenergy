// ═══════════════════════════════════════════════════════════════════════════
// Chain e-signature ceremony — generalised over (entity_type, entity_id).
//
// Lifts the native document_signatories ceremony (src/routes/contracts.ts) onto
// any Meridian chain row. Same invariants:
//   • hash-bound      — document_hash_at_signing captured at sign time
//   • vault-backed    — signature_r2_key points at the R2 artifact
//   • all-signatories gate — the chain's `<entity_type>.signed` cascade fires
//     once, only when the LAST pending signatory signs, serialised by withLock
//     so two racing signers don't both observe allSigned and double-fire.
//
// entity_type is the static Meridian chain key (validated by the caller against
// MERIDIAN_CHAINS) — it is only ever stored and bound to a `?` placeholder,
// never interpolated into SQL.
// ═══════════════════════════════════════════════════════════════════════════
import { fireCascade } from './cascade';
import { withLock, LockBusyError } from './locks';
import type { HonoEnv } from './types';

type Env = HonoEnv['Bindings'];

export interface ChainSignatory {
  id: string;
  participant_id: string;
  signatory_name: string | null;
  signatory_designation: string | null;
  signed: number;
  signed_at: string | null;
}

export async function listSignatories(
  env: Env, entityType: string, entityId: string,
): Promise<ChainSignatory[]> {
  const r = await env.DB.prepare(
    `SELECT id, participant_id, signatory_name, signatory_designation, signed, signed_at
       FROM chain_signatories WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC`,
  ).bind(entityType, entityId).all<ChainSignatory>();
  return (r.results ?? []) as ChainSignatory[];
}

// Add a signatory to the roster. The participant must share the actor's tenant
// (isolation parity with assertSameTenantParticipant in contracts.ts). Idempotent
// on (entity_type, entity_id, participant_id) via the UNIQUE index → re-adding is
// a no-op rather than a duplicate row.
export async function addSignatory(
  env: Env,
  args: {
    entityType: string; entityId: string; participantId: string;
    name?: string; designation?: string; tenantId: string;
  },
): Promise<{ added: boolean; reason?: string }> {
  const p = await env.DB.prepare('SELECT tenant_id FROM participants WHERE id = ?')
    .bind(args.participantId).first<{ tenant_id: string | null }>();
  if (!p) return { added: false, reason: 'unknown_participant' };
  if ((p.tenant_id || 'default') !== args.tenantId) return { added: false, reason: 'cross_tenant' };

  await env.DB.prepare(
    `INSERT INTO chain_signatories
       (id, entity_type, entity_id, participant_id, signatory_name, signatory_designation, tenant_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(entity_type, entity_id, participant_id) DO NOTHING`,
  ).bind(
    crypto.randomUUID(), args.entityType, args.entityId, args.participantId,
    args.name ?? null, args.designation ?? null, args.tenantId, new Date().toISOString(),
  ).run();
  return { added: true };
}

// Record the current user's signature. Serialised per entity so the all-signed
// cascade fires exactly once. Throws LockBusyError carrying a structured key for
// the route to map to an HTTP code (mirrors the contracts.ts sign handler).
export async function recordSignature(
  env: Env,
  args: {
    entityType: string; entityId: string; userId: string;
    signatureR2Key?: string; documentHash?: string;
  },
): Promise<{ signed_by: string; all_signed: boolean }> {
  return withLock(
    env,
    `chain:sign:${args.entityType}:${args.entityId}`,
    args.userId,
    async () => {
      const signatory = await env.DB.prepare(
        'SELECT id, signed FROM chain_signatories WHERE entity_type = ? AND entity_id = ? AND participant_id = ?',
      ).bind(args.entityType, args.entityId, args.userId).first<{ id: string; signed: number }>();
      if (!signatory) throw new LockBusyError('__not_signatory__');
      if (signatory.signed) throw new LockBusyError('__already_signed__');

      await env.DB.prepare(
        `UPDATE chain_signatories
            SET signed = 1, signed_at = ?, signature_r2_key = ?, document_hash_at_signing = ?
          WHERE id = ?`,
      ).bind(
        new Date().toISOString(), args.signatureR2Key || null, args.documentHash || null, signatory.id,
      ).run();

      const pending = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM chain_signatories WHERE entity_type = ? AND entity_id = ? AND signed = 0',
      ).bind(args.entityType, args.entityId).first<{ count: number }>();
      const allSigned = !pending?.count || pending.count === 0;

      if (allSigned) {
        // ponytail: generic '<entity>.signed' event; cascade rules can match it
        // per chain later. entity_type/_id attach it to the chain row so the
        // execution event fabric carries the hash-bound, vault-backed signature.
        await fireCascade({
          event: `${args.entityType}.signed` as never,
          actor_id: args.userId,
          entity_type: args.entityType,
          entity_id: args.entityId,
          data: { signed_by: args.userId, all_signed: true },
          env,
        });
      }
      return { signed_by: args.userId, all_signed: allSigned };
    },
    { ttlSeconds: 15, context: { entity_type: args.entityType, entity_id: args.entityId } },
  );
}
