// ═══════════════════════════════════════════════════════════════════════════
// KYC self-service submission - mounted at /api/onboarding/kyc. Authed users.
//
// This DEEPENS the existing per-document KYC infrastructure rather than adding a
// new case/evidence table. Every uploaded document is one row in the EXISTING
// oe_kyc_submissions table (migration 060 + 511) plus one R2 object; POST
// /submit then flips the caller's participants.kyc_status to 'in_review' so the
// reviewer inbox picks it up.
//
// Ownership + tenancy fence: every endpoint acts on the CALLER only. There is
// no targetParticipantId anywhere in any request body - participant_id comes
// from getCurrentUser(c).id and tenant from getTenantId(c), so a caller can
// only ever read/write its own rows. The r2_key is built ONLY from those owned
// ids plus the static-allow-list document_type; no free request text is ever
// interpolated into a key or a SQL identifier.
//
// Security invariant: every table/column name below is a static literal; every
// request value binds to a ? placeholder. document_type is validated against
// the static KYC_DOC_TYPES allow-list BEFORE any side effect (R2 put / INSERT).
// file_name is AEAD-encrypted on write (dark-by-default plaintext when
// KYC_ENC_KEY is unset) and decrypted on read via the crypto-aead seam.
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { getTenantId } from '../utils/tenant';
import { fireCascade } from '../utils/cascade';
import { encryptField, decryptField } from '../utils/crypto-aead';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

// The exact set of document types the platform accepts. This is the single
// source of truth: document_type is validated against it before any write, and
// it is the only request-derived value allowed into the r2_key path (besides
// owned ids). It is NEVER a SQL identifier or a raw path segment.
const KYC_DOC_TYPES = [
  'id_document',
  'proof_of_address',
  'company_registration',
  'tax_clearance',
  'bank_confirmation',
  'nersa_licence',
] as const;
type KycDocType = (typeof KYC_DOC_TYPES)[number];

function isKycDocType(v: string): v is KycDocType {
  return (KYC_DOC_TYPES as readonly string[]).includes(v);
}

// Decode a base64 string to raw bytes. Works in both the Worker and Node 18+
// (atob is a global in both).
function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// ─── List the caller's KYC state + their own documents ──────────────────────
// Returns participants.kyc_status plus this caller's oe_kyc_submissions rows
// (WHERE participant_id = caller id), file_name DECRYPTED, grouped by
// document_type. Never returns r2_key or any raw encrypted value to the client.
r.get('/', async (c) => {
  const user = getCurrentUser(c);

  const participant = await c.env.DB
    .prepare('SELECT kyc_status FROM participants WHERE id = ?')
    .bind(user.id)
    .first<{ kyc_status: string | null }>();

  const subs = await c.env.DB
    .prepare(
      `SELECT id, document_type, file_name, mime_type, size_bytes, status, submitted_at
       FROM oe_kyc_submissions
       WHERE participant_id = ?
       ORDER BY submitted_at ASC`,
    )
    .bind(user.id)
    .all<{
      id: string;
      document_type: string;
      file_name: string | null;
      mime_type: string | null;
      size_bytes: number | null;
      status: string;
      submitted_at: string;
    }>();

  const documents: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of subs.results) {
    let fileName: string | null = row.file_name;
    let decryptError = false;
    if (row.file_name != null) {
      try {
        fileName = await decryptField(c.env, row.file_name);
      } catch {
        // A stored value that will not decrypt (tampered, or written under a key
        // that is no longer configured) must not 500 the whole status page. Show
        // the document with a null name; kyc_status and the rest of the list stay
        // visible so onboarding is never blocked by one bad row.
        fileName = null;
        decryptError = true;
        // Structured warn so an operator can find the offending row without the
        // raw ciphertext or key ever being logged. This is the audit signal a
        // silent null swallow would otherwise hide.
        console.warn(
          JSON.stringify({
            level: 'warn',
            event: 'kyc.file_name.decrypt_failed',
            submission_id: row.id,
            participant_id: user.id,
            tenant_id: getTenantId(c),
            document_type: row.document_type,
          }),
        );
      }
    }
    const doc: Record<string, unknown> = {
      id: row.id,
      file_name: fileName,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      status: row.status,
      submitted_at: row.submitted_at,
    };
    // Surface a non-blocking flag only when decryption failed, so the client can
    // prompt a re-upload instead of showing a nameless document with no reason.
    if (decryptError) doc.decrypt_error = true;
    (documents[row.document_type] ||= []).push(doc);
  }

  return c.json({
    success: true,
    data: {
      kyc_status: participant?.kyc_status || 'pending',
      documents,
    },
  });
});

// ─── Upload one piece of evidence ───────────────────────────────────────────
// Body: { document_type, file_name, mime_type, content_base64 }. Validates the
// document_type against the static allow-list FIRST (400 before any R2 write or
// DB insert), then stores the bytes in R2 and inserts one pending row.
r.post('/evidence', async (c) => {
  const user = getCurrentUser(c);
  const tenant = getTenantId(c);

  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const documentType = String(body.document_type || '').trim();
  const fileName = String(body.file_name || '');
  const mimeType = body.mime_type == null ? null : String(body.mime_type);
  const contentBase64 = String(body.content_base64 || '');

  // Validate the allow-list value BEFORE any side effect.
  if (!isKycDocType(documentType)) {
    return c.json({ success: false, error: 'Unknown document type' }, 400);
  }
  if (contentBase64.length === 0) {
    return c.json({ success: false, error: 'content_base64 is required' }, 400);
  }

  let bytes: Uint8Array;
  try {
    bytes = b64ToBytes(contentBase64);
  } catch {
    return c.json({ success: false, error: 'content_base64 is not valid base64' }, 400);
  }

  const id = crypto.randomUUID();
  // r2_key is built ONLY from validated/owned ids - never from request free-text.
  const r2Key = `kyc/${tenant}/${user.id}/${id}`;
  await c.env.R2.put(r2Key, bytes);

  const encName = await encryptField(c.env, fileName);
  const submittedAt = new Date().toISOString();

  await c.env.DB
    .prepare(
      `INSERT INTO oe_kyc_submissions
         (id, participant_id, document_type, r2_key, file_name, mime_type, size_bytes, status, tenant_id, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .bind(id, user.id, documentType, r2Key, encName, mimeType, bytes.byteLength, tenant, submittedAt)
    .run();

  return c.json({ success: true, data: { id, document_type: documentType, status: 'pending' } });
});

// ─── Submit the KYC pack for review ─────────────────────────────────────────
// Flips the caller's participants.kyc_status to 'in_review' and fires a cascade
// so the reviewer inbox / audit chain picks it up.
r.post('/submit', async (c) => {
  const user = getCurrentUser(c);

  await c.env.DB
    .prepare(`UPDATE participants SET kyc_status = 'in_review', updated_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), user.id)
    .run();

  await fireCascade({
    event: 'kyc.submitted',
    actor_id: user.id,
    entity_type: 'participant',
    entity_id: user.id,
    data: { kyc_status: 'in_review' },
    env: c.env,
  });

  return c.json({ success: true, data: { kyc_status: 'in_review' } });
});

export default r;
