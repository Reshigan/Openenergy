// ═══════════════════════════════════════════════════════════════════════════
// crypto-aead.test.ts - AES-256-GCM field-encryption helper (src/utils/crypto-aead.ts)
//
// Verifies the dark-by-default seam: live AES-GCM only when env.KYC_ENC_KEY is
// set, otherwise plaintext passthrough. Fail-closed contract is THROW on a
// garbled v1: ciphertext (the GCM auth tag check rejects tampered input).
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { encryptField, decryptField } from '../src/utils/crypto-aead';

// A deterministic, valid 32-byte (256-bit) base64 key literal for the gate-open env.
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

describe('crypto-aead field encryption', () => {
  it('round-trips a value when the gate is open', async () => {
    const env = gateOpenEnv();
    const ct = await encryptField(env as never, 'sensitive-name.pdf');
    expect(ct.startsWith('v1:')).toBe(true);
    expect(ct).not.toBe('sensitive-name.pdf');
    const pt = await decryptField(env as never, ct);
    expect(pt).toBe('sensitive-name.pdf');
  });

  it('encrypt is a no-op when the gate is closed (no KYC_ENC_KEY)', async () => {
    const env = gateClosedEnv();
    const ct = await encryptField(env as never, 'plain');
    expect(ct).toBe('plain');
    expect(ct.startsWith('v1:')).toBe(false);
  });

  it('decrypt FAILS CLOSED (throws) when the gate is closed — never returns plaintext', async () => {
    // Fail-closed contract: a read with no key configured is a
    // misconfiguration, not a "dev convenience". Returning either the raw
    // ciphertext blob or a legacy plaintext value would let a production
    // deployment read KYC fields with no key for months. Must throw.
    const env = gateClosedEnv();
    await expect(decryptField(env as never, 'plain')).rejects.toThrow(/KYC_ENC_KEY/);
    await expect(decryptField(env as never, 'v1:deadbeef:cafe')).rejects.toThrow(/KYC_ENC_KEY/);
  });

  it('reads a v1: value back when the same key is configured', async () => {
    const env = gateOpenEnv();
    const ct = await encryptField(env as never, 'company-registration.pdf');
    expect(ct.startsWith('v1:')).toBe(true);
    const pt = await decryptField(env as never, ct);
    expect(pt).toBe('company-registration.pdf');
  });

  it('passes legacy plaintext through on read even when the key is set', async () => {
    const env = gateOpenEnv();
    const pt = await decryptField(env as never, 'no-prefix-legacy-value');
    expect(pt).toBe('no-prefix-legacy-value');
  });

  it('fails closed (throws) on a garbled v1: ciphertext', async () => {
    const env = gateOpenEnv();
    await expect(decryptField(env as never, 'v1:bad:bad')).rejects.toThrow();
  });

  it('fails closed (throws) reading a v1: value when the key is now unset', async () => {
    // Cross-state: a value encrypted while the secret was configured must NOT
    // silently read back as garbage if the secret later disappears. Decrypting
    // a v1: ciphertext with the gate closed is a misconfiguration, not legacy
    // plaintext, so the seam fails closed rather than returning the raw token.
    const open = gateOpenEnv();
    const ct = await encryptField(open as never, 'tax-clearance.pdf');
    expect(ct.startsWith('v1:')).toBe(true);
    const closed = gateClosedEnv();
    await expect(decryptField(closed as never, ct)).rejects.toThrow();
  });

  it('uses a fresh IV per call (same plaintext yields different ciphertext)', async () => {
    const env = gateOpenEnv();
    const a = await encryptField(env as never, 'repeat-me.pdf');
    const b = await encryptField(env as never, 'repeat-me.pdf');
    expect(a).not.toBe(b);
    expect(await decryptField(env as never, a)).toBe('repeat-me.pdf');
    expect(await decryptField(env as never, b)).toBe('repeat-me.pdf');
  });

  it('round-trips an empty string', async () => {
    const env = gateOpenEnv();
    const ct = await encryptField(env as never, '');
    expect(ct.startsWith('v1:')).toBe(true);
    expect(await decryptField(env as never, ct)).toBe('');
  });

  it('round-trips a UTF-8 unicode string', async () => {
    const env = gateOpenEnv();
    const value = 'naïve-café.pdf';
    const ct = await encryptField(env as never, value);
    expect(ct.startsWith('v1:')).toBe(true);
    expect(await decryptField(env as never, ct)).toBe(value);
  });
});
