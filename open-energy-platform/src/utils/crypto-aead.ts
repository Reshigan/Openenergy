// ═══════════════════════════════════════════════════════════════════════════
// AEAD field encryption seam - AES-256-GCM at-rest protection for sensitive
// KYC values (file names, document references, free-text notes).
// ═══════════════════════════════════════════════════════════════════════════
//
// encryptField()/decryptField() are the single place a sensitive string value
// is turned into (and back from) its at-rest form.
//
// ENCRYPT is dark-by-default: when env.KYC_ENC_KEY is unset the plaintext is
// returned unchanged so callers can wire field protection in safely long
// before the gate is deliberately opened in production. (A throw here would
// 500 every KYC write in dev/test, which is a worse outcome than plaintext.)
//
// DECRYPT is FAIL-CLOSED: when env.KYC_ENC_KEY is unset, decryptField THROWS
// rather than returning a possibly-ciphertext / possibly-plaintext value. A
// missing key on a read path is a misconfiguration, not a "dev convenience" —
// returning a stored ciphertext blob as if it were plaintext would corrupt
// downstream consumers, and returning legacy plaintext silently would let a
// production deployment run for months reading KYC values with no key
// configured. Operators who want reads to succeed must set KYC_ENC_KEY in
// every environment (dev included). The onboarding-kyc caller already wraps
// decryptField in try/catch and surfaces a decrypt_error flag.
//
// Stored format is `v1:<base64 iv>:<base64 ciphertext+tag>`. The "v1" version
// prefix is what lets us rotate later: a future "v2:" (new key, new scheme) can
// be introduced with a dual-read decrypt that recognises both prefixes, then a
// backfill, without a flag-day. A value with NO known prefix is legacy
// plaintext — but we only hand it back when a key IS configured (so the
// operator has chosen to turn the gate on; un-encrypted rows then read back
// verbatim until they're re-written).
//
// The key is a 32-byte (256-bit) value delivered as a base64 secret via
// `wrangler secret put KYC_ENC_KEY`. It is NOT in wrangler.toml and never
// committed. A misconfigured key (wrong decoded length) is a hard error on
// encrypt rather than a silent downgrade to a weaker cipher.
//
// Fail-closed contract on read: a v1: value whose auth tag does not verify
// (tampered, truncated, wrong key, malformed base64) THROWS. The GCM tag check
// inside crypto.subtle.decrypt gives us this for free. We never return a
// partial or wrong-but-plausible plaintext.
//
// Security: this helper only ever transforms VALUES that get bound to ?
// placeholders. It never touches SQL identifiers (table/column names), which
// come exclusively from static literals elsewhere in the codebase.
//
// Runtime: crypto.subtle / crypto.getRandomValues are globals in the Worker and
// in Node 18+ (vitest), so the same code path runs in both.
// ═══════════════════════════════════════════════════════════════════════════

import type { HonoBindings } from './types';

const VERSION_PREFIX = 'v1:';
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12;  // 96-bit GCM nonce (recommended), random per message

// ── base64 helpers (work in both the Worker and Node 18+ via btoa/atob) ──────
function b64encode(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i++) {
    binary += String.fromCharCode(view[i]);
  }
  return btoa(binary);
}

function b64decode(s: string): Uint8Array {
  const binary = atob(s);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ── Key import ───────────────────────────────────────────────────────────────
// Decode the base64 secret to raw bytes and validate the 256-bit length before
// importing. A wrong-length key is a configuration error: throw rather than
// downgrade.
async function importKey(secret: string): Promise<CryptoKey> {
  let raw: Uint8Array;
  try {
    raw = b64decode(secret);
  } catch {
    throw new Error('crypto-aead: KYC_ENC_KEY is not valid base64');
  }
  if (raw.length !== KEY_BYTES) {
    throw new Error(
      `crypto-aead: KYC_ENC_KEY must decode to ${KEY_BYTES} bytes (got ${raw.length})`,
    );
  }
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function keyOf(env: HonoBindings): string | undefined {
  const k = (env as unknown as { KYC_ENC_KEY?: unknown }).KYC_ENC_KEY;
  return typeof k === 'string' && k.length > 0 ? k : undefined;
}

// ── Seam ─────────────────────────────────────────────────────────────────────

/**
 * Encrypt a sensitive string for at-rest storage.
 * Gate closed (no KYC_ENC_KEY): returns plaintext unchanged.
 * Gate open: returns `v1:<base64 iv>:<base64 ciphertext+tag>`.
 */
export async function encryptField(env: HonoBindings, plaintext: string): Promise<string> {
  const secret = keyOf(env);
  if (!secret) return plaintext; // dark by default

  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );
  return `${VERSION_PREFIX}${b64encode(iv)}:${b64encode(ciphertext)}`;
}

/**
 * Decrypt an at-rest value.
 * FAIL-CLOSED contract: throws when KYC_ENC_KEY is unset (a read without the
 * key configured is a misconfiguration, not legacy plaintext). When the key
 * is set, a value with no known version prefix is returned unchanged (legacy
 * plaintext written before encryption existed); a `v1:` value is decrypted
 * and throws on any integrity/format failure (the GCM auth tag rejects
 * tampered/truncated/wrong-key input).
 */
export async function decryptField(env: HonoBindings, stored: string): Promise<string> {
  const secret = keyOf(env);
  if (!secret) {
    // No key configured AND a decrypt was requested. Fail closed: returning
    // either the raw ciphertext blob or a legacy plaintext value would let a
    // production deployment read KYC fields with no key configured, which is
    // the exact misconfiguration this seam exists to prevent. The caller
    // (onboarding-kyc.ts) wraps this in try/catch and surfaces decrypt_error.
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'crypto_aead.decrypt_no_key',
        message: 'decryptField called but KYC_ENC_KEY is not set — failing closed',
      }),
    );
    throw new Error('crypto-aead: KYC_ENC_KEY is not set; decrypt fails closed');
  }

  if (!stored.startsWith(VERSION_PREFIX)) {
    return stored; // legacy plaintext / pre-encryption value (key is configured)
  }

  const rest = stored.slice(VERSION_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep < 0) {
    throw new Error('crypto-aead: malformed v1: value (missing iv/ciphertext separator)');
  }
  const ivB64 = rest.slice(0, sep);
  const ctB64 = rest.slice(sep + 1);

  let iv: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    iv = b64decode(ivB64);
    ciphertext = b64decode(ctB64);
  } catch {
    throw new Error('crypto-aead: malformed v1: value (invalid base64)');
  }
  if (iv.length !== IV_BYTES) {
    throw new Error('crypto-aead: malformed v1: value (bad iv length)');
  }

  const key = await importKey(secret);
  // The GCM auth tag is verified inside decrypt; a tampered/truncated/wrong-key
  // ciphertext rejects here, which is our fail-closed guarantee.
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return decoder.decode(plain);
}
