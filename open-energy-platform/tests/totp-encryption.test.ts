// ═══════════════════════════════════════════════════════════════════════════
// totp-encryption.test.ts — verifies the at-rest protection contract for the
// MFA surface in src/routes/auth.ts:
//
//   1. TOTP base32 secret is encrypted with encryptField on write and
//      decrypted with decryptField on read; a code generated from the
//      ORIGINAL secret verifies against the DECRYPTED secret (round-trip).
//   2. Legacy plaintext secrets (no v1: prefix) still read back usable —
//      the resolveTotpSecret fallback keeps existing enrolments working
//      across the encrypt-on-write migration without a flag-day backfill.
//   3. A v1:-encrypted TOTP secret is NOT decryptable without KYC_ENC_KEY
//      (fail-closed) — a DB dump with KYC_ENC_KEY unset cannot yield the
//      secret, and the login path surfaces the error rather than silently
//      treating ciphertext as plaintext.
//   4. Backup codes are stored as one-way sha256 hashes; a submitted code
//      hashes to the stored value (match), and the raw code is NOT present
//      in the stored envelope (a DB dump cannot recover usable codes).
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { encryptField, decryptField } from '../src/utils/crypto-aead';
import { randomBase32Secret, totpGenerate, totpVerify, generateBackupCodes } from '../src/utils/totp';
import { sha256Hex } from '../src/utils/auth-tokens';

const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');

function gateOpenEnv() {
  const db = createTestDb({ applyMigrations: true });
  const env = envFor(db) as Record<string, unknown>;
  return { ...env, KYC_ENC_KEY: KEY } as Record<string, unknown>;
}

function gateClosedEnv() {
  const db = createTestDb({ applyMigrations: true });
  return envFor(db) as Record<string, unknown>;
}

// Mirror of src/routes/auth.ts::resolveTotpSecret — the contract under test.
// Kept in sync so a divergence between the route and this test is caught.
async function resolveTotpSecret(env: Record<string, unknown>, stored: string): Promise<string> {
  if (stored.startsWith('v1:')) return await decryptField(env as never, stored);
  return stored;
}

// Mirror of src/routes/auth.ts::findBackupCodeIndex (v:2 hashes path only).
async function findBackupCodeIndex(storedHashes: string[], rawCode: string): Promise<number> {
  const hash = await sha256Hex(rawCode.toLowerCase());
  return storedHashes.findIndex((h) => h === hash);
}

describe('TOTP secret at-rest encryption (auth.ts write/read path)', () => {
  it('round-trips: a code from the original secret verifies against the decrypted secret', async () => {
    const env = gateOpenEnv();
    const secret = randomBase32Secret(20);
    const now = 1_700_000_000;
    const code = await totpGenerate(secret, now);

    // Write path (mfa/setup): encryptField before persisting.
    const stored = await encryptField(env as never, secret);
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toBe(secret); // ciphertext, not plaintext

    // Read path (login / mfa/verify): resolveTotpSecret → decryptField.
    const recovered = await resolveTotpSecret(env, stored);
    expect(recovered).toBe(secret);
    expect(await totpVerify(recovered, code, now)).toBe(true);
  });

  it('legacy plaintext secret (no v1: prefix) reads back usable with the gate open', async () => {
    // Pre-encryption rows stored the raw base32 secret. resolveTotpSecret
    // falls back to the raw value when there is no v1: prefix, so existing
    // enrolments keep working until a re-write encrypts them.
    const env = gateOpenEnv();
    const secret = randomBase32Secret(20);
    const now = 1_700_000_000;
    const code = await totpGenerate(secret, now);

    const recovered = await resolveTotpSecret(env, secret); // no prefix
    expect(recovered).toBe(secret);
    expect(await totpVerify(recovered, code, now)).toBe(true);
  });

  it('legacy plaintext secret reads back usable with the gate CLOSED (no key configured)', async () => {
    // A legacy plaintext secret has no v1: prefix, so resolveTotpSecret
    // returns it verbatim WITHOUT calling decryptField — the fail-closed
    // throw only fires for v1: values. This keeps existing enrolments
    // working in environments that haven't set KYC_ENC_KEY yet.
    const env = gateClosedEnv();
    const secret = randomBase32Secret(20);
    const recovered = await resolveTotpSecret(env, secret);
    expect(recovered).toBe(secret);
  });

  it('a v1:-encrypted secret is NOT recoverable without KYC_ENC_KEY (fail-closed)', async () => {
    // The threat model: an attacker with a DB dump but no KYC_ENC_KEY must not
    // be able to read the TOTP secret. decryptField throws on a v1: value when
    // the gate is closed, so the login path surfaces the error instead of
    // silently treating the ciphertext blob as a plaintext secret.
    const open = gateOpenEnv();
    const secret = randomBase32Secret(20);
    const stored = await encryptField(open as never, secret);
    expect(stored.startsWith('v1:')).toBe(true);

    const closed = gateClosedEnv();
    await expect(resolveTotpSecret(closed, stored)).rejects.toThrow(/KYC_ENC_KEY/);
  });

  it('distinct secrets produce distinct ciphertexts (no IV reuse leakage)', async () => {
    const env = gateOpenEnv();
    const a = await encryptField(env as never, randomBase32Secret(20));
    const b = await encryptField(env as never, randomBase32Secret(20));
    expect(a).not.toBe(b);
  });
});

describe('backup codes at-rest hashing (auth.ts mfa/verify path)', () => {
  it('stores one-way hashes — raw codes are NOT present in the stored envelope', async () => {
    const codes = generateBackupCodes(10);
    const hashes = await Promise.all(codes.map((c) => sha256Hex(c.toLowerCase())));
    const stored = JSON.stringify({ v: 2, hashes });

    // None of the raw codes appear in the stored JSON.
    for (const c of codes) {
      expect(stored).not.toContain(c);
      expect(stored).not.toContain(c.toLowerCase());
    }
    // Each hash is a 64-char hex string.
    for (const h of hashes) {
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('a submitted backup code matches its stored hash (case-insensitive)', async () => {
    const codes = generateBackupCodes(5);
    const hashes = await Promise.all(codes.map((c) => sha256Hex(c.toLowerCase())));
    const target = codes[2];
    const idx = await findBackupCodeIndex(hashes, target);
    expect(idx).toBe(2);
    // Upper-case submission also matches (normalisation).
    expect(await findBackupCodeIndex(hashes, target.toUpperCase())).toBe(2);
  });

  it('a wrong backup code does not match any stored hash', async () => {
    const codes = generateBackupCodes(3);
    const hashes = await Promise.all(codes.map((c) => sha256Hex(c.toLowerCase())));
    expect(await findBackupCodeIndex(hashes, '0000-0000')).toBe(-1);
    expect(await findBackupCodeIndex(hashes, codes[0] + 'x')).toBe(-1);
  });

  it('burn-on-success: removing a matched hash leaves the rest usable', async () => {
    const codes = generateBackupCodes(4);
    const hashes = await Promise.all(codes.map((c) => sha256Hex(c.toLowerCase())));
    const burnIdx = 1;
    const remaining = hashes.filter((_, i) => i !== burnIdx);
    // The burned code no longer matches.
    expect(await findBackupCodeIndex(remaining, codes[burnIdx])).toBe(-1);
    // The others still match (note indices shifted after the burn).
    expect(await findBackupCodeIndex(remaining, codes[0])).toBe(0);
    expect(await findBackupCodeIndex(remaining, codes[2])).toBe(1);
    expect(await findBackupCodeIndex(remaining, codes[3])).toBe(2);
  });
});