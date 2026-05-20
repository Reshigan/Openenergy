// ════════════════════════════════════════════════════════════════════════
// webauthn.test.ts — unit tests for the CBOR + COSE + assertion verifier.
//
// We mint an ES256 key with WebCrypto, hand-roll a fake authenticatorData
// + clientDataJSON, sign them, and confirm the verifier accepts the
// signature, rejects challenge tampering, rejects origin tampering, and
// rejects a counter regression.
// ════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  b64uToBytes,
  bytesToB64u,
  parseAuthenticatorData,
  coseToCryptoKey,
  ecdsaDerToRaw,
  verifyAssertion,
  sha256,
} from '../src/utils/webauthn';

// Tiny CBOR encoder — enough to build a COSE_Key for our test public key
// and a minimal attestationObject {fmt, authData, attStmt}. Hand-rolled
// to keep tests dependency-free.
function cborUint(n: number): Uint8Array {
  if (n < 24) return new Uint8Array([n]);
  if (n < 256) return new Uint8Array([0x18, n]);
  if (n < 65536) return new Uint8Array([0x19, n >> 8, n & 0xff]);
  throw new Error('cbor: too big');
}
function cborNeg(n: number): Uint8Array {
  const v = -1 - n; // n is the negative value, e.g. -1 → store 0
  const tag = 0x20;
  if (v < 24) return new Uint8Array([tag | v]);
  if (v < 256) return new Uint8Array([tag | 24, v]);
  throw new Error('cbor: neg too big');
}
function cborBytes(buf: Uint8Array): Uint8Array {
  const head = (b: number) => b < 24 ? new Uint8Array([0x40 | b]) : b < 256 ? new Uint8Array([0x58, b]) : new Uint8Array([0x59, b >> 8, b & 0xff]);
  const h = head(buf.length);
  const out = new Uint8Array(h.length + buf.length);
  out.set(h, 0); out.set(buf, h.length); return out;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total); let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
function cborMapEs256(jwk: JsonWebKey): Uint8Array {
  // map(5): {1: 2, 3: -7, -1: 1, -2: x, -3: y}
  const head = new Uint8Array([0xa5]);
  const e1 = concat(cborUint(1), cborUint(2));     // 1 (kty): 2 (EC2)
  const e2 = concat(cborUint(3), cborNeg(-7));      // 3 (alg): -7
  const e3 = concat(cborNeg(-1), cborUint(1));      // -1 (crv): 1 (P-256)
  const e4 = concat(cborNeg(-2), cborBytes(b64uToBytes(jwk.x!)));
  const e5 = concat(cborNeg(-3), cborBytes(b64uToBytes(jwk.y!)));
  return concat(head, e1, e2, e3, e4, e5);
}

describe('webauthn', () => {
  it('verifies an ES256 assertion end-to-end', async () => {
    // Mint an ES256 keypair
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey) as JsonWebKey;
    const coseBytes = cborMapEs256(jwk);
    const coseB64u = bytesToB64u(coseBytes);

    // Build authenticatorData: rpIdHash(32) + flags(1, UP=0x01) + counter(4)
    const rpId = 'oe.vantax.co.za';
    const rpIdHash = await sha256(rpId);
    const authData = new Uint8Array(37);
    authData.set(rpIdHash, 0);
    authData[32] = 0x01; // UP
    // counter = 7
    authData[33] = 0; authData[34] = 0; authData[35] = 0; authData[36] = 7;

    const origin = 'https://oe.vantax.co.za';
    const challenge = bytesToB64u(new TextEncoder().encode('chal_abc'));
    const clientData = JSON.stringify({ type: 'webauthn.get', challenge, origin });
    const clientDataBytes = new TextEncoder().encode(clientData);
    const cdHash = await sha256(clientDataBytes);

    // The thing the authenticator signs: authData || cdHash
    const signed = concat(authData, cdHash);
    const sigRaw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, signed));
    // Web Crypto produces raw r||s — verifyAssertion expects DER, so wrap it.
    const r = sigRaw.slice(0, 32);
    const s = sigRaw.slice(32, 64);
    const der = derEncodeEcdsaSig(r, s);

    const result = await verifyAssertion({
      publicKeyCoseB64u: coseB64u,
      authenticatorDataB64u: bytesToB64u(authData),
      clientDataJSONB64u: bytesToB64u(clientDataBytes),
      signatureB64u: bytesToB64u(der),
      expectedChallenge: challenge,
      expectedRpIdHash: rpIdHash,
      expectedOrigin: origin,
      expectedType: 'webauthn.get',
      storedCounter: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.newCounter).toBe(7);
  });

  it('rejects challenge tampering', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey) as JsonWebKey;
    const coseB64u = bytesToB64u(cborMapEs256(jwk));
    const rpIdHash = await sha256('oe.vantax.co.za');
    const authData = new Uint8Array(37);
    authData.set(rpIdHash, 0); authData[32] = 0x01;
    const clientData = JSON.stringify({ type: 'webauthn.get', challenge: 'real_chal', origin: 'https://oe.vantax.co.za' });
    const cdHash = await sha256(new TextEncoder().encode(clientData));
    const signed = concat(authData, cdHash);
    const sigRaw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, signed));
    const der = derEncodeEcdsaSig(sigRaw.slice(0, 32), sigRaw.slice(32, 64));
    const result = await verifyAssertion({
      publicKeyCoseB64u: coseB64u,
      authenticatorDataB64u: bytesToB64u(authData),
      clientDataJSONB64u: bytesToB64u(new TextEncoder().encode(clientData)),
      signatureB64u: bytesToB64u(der),
      expectedChallenge: 'attacker_chal',
      expectedRpIdHash: rpIdHash,
      storedCounter: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('challenge');
  });

  it('rejects origin mismatch', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey) as JsonWebKey;
    const coseB64u = bytesToB64u(cborMapEs256(jwk));
    const rpIdHash = await sha256('oe.vantax.co.za');
    const authData = new Uint8Array(37);
    authData.set(rpIdHash, 0); authData[32] = 0x01;
    const clientData = JSON.stringify({ type: 'webauthn.get', challenge: 'c', origin: 'https://evil.example.com' });
    const cdHash = await sha256(new TextEncoder().encode(clientData));
    const signed = concat(authData, cdHash);
    const sigRaw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, signed));
    const der = derEncodeEcdsaSig(sigRaw.slice(0, 32), sigRaw.slice(32, 64));
    const result = await verifyAssertion({
      publicKeyCoseB64u: coseB64u,
      authenticatorDataB64u: bytesToB64u(authData),
      clientDataJSONB64u: bytesToB64u(new TextEncoder().encode(clientData)),
      signatureB64u: bytesToB64u(der),
      expectedChallenge: 'c',
      expectedRpIdHash: rpIdHash,
      expectedOrigin: 'https://oe.vantax.co.za',
      storedCounter: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('origin');
  });

  it('rejects counter regression', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey) as JsonWebKey;
    const coseB64u = bytesToB64u(cborMapEs256(jwk));
    const rpIdHash = await sha256('oe.vantax.co.za');
    const authData = new Uint8Array(37);
    authData.set(rpIdHash, 0); authData[32] = 0x01;
    // counter = 3, but stored = 5  -> regression
    authData[33] = 0; authData[34] = 0; authData[35] = 0; authData[36] = 3;
    const clientData = JSON.stringify({ type: 'webauthn.get', challenge: 'c', origin: 'https://oe.vantax.co.za' });
    const cdHash = await sha256(new TextEncoder().encode(clientData));
    const signed = concat(authData, cdHash);
    const sigRaw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, signed));
    const der = derEncodeEcdsaSig(sigRaw.slice(0, 32), sigRaw.slice(32, 64));
    const result = await verifyAssertion({
      publicKeyCoseB64u: coseB64u,
      authenticatorDataB64u: bytesToB64u(authData),
      clientDataJSONB64u: bytesToB64u(new TextEncoder().encode(clientData)),
      signatureB64u: bytesToB64u(der),
      expectedChallenge: 'c',
      expectedRpIdHash: rpIdHash,
      expectedOrigin: 'https://oe.vantax.co.za',
      storedCounter: 5,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('counter');
  });

  it('parses authenticatorData attested credential data', () => {
    // 32 rpIdHash + 1 flags(0x41 = UP|AT) + 4 counter + 16 aaguid + 2 credIdLen + credId + COSE
    const rpIdHash = new Uint8Array(32).fill(0xaa);
    const aaguid   = new Uint8Array(16).fill(0xbb);
    const credId   = new Uint8Array([1, 2, 3, 4]);
    const cose     = new Uint8Array([0xa1, 0x01, 0x02]); // map(1): 1 -> 2 (kty=EC2)
    const authData = concat(
      rpIdHash, new Uint8Array([0x41, 0, 0, 0, 0]),
      aaguid, new Uint8Array([0, credId.length]), credId, cose,
    );
    const parsed = parseAuthenticatorData(authData);
    expect(parsed.userPresent).toBe(true);
    expect(parsed.credentialId?.length).toBe(4);
    expect(parsed.credentialPublicKeyCose?.length).toBe(3);
  });

  it('decodes ECDSA DER signatures with leading-zero padding', () => {
    // r = 0x00ab (DER-padded), s = 0xcd. Expect 32-byte raw output.
    const der = new Uint8Array([0x30, 0x07, 0x02, 0x02, 0x00, 0xab, 0x02, 0x01, 0xcd]);
    const raw = ecdsaDerToRaw(der);
    expect(raw.length).toBe(64);
    expect(raw[31]).toBe(0xab);
    expect(raw[63]).toBe(0xcd);
  });

  it('imports an ES256 COSE key into Web Crypto', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey) as JsonWebKey;
    const { alg, key } = await coseToCryptoKey(cborMapEs256(jwk));
    expect(alg).toBe(-7);
    expect(key).toBeTruthy();
  });
});

// DER-encode an ECDSA signature from raw r || s (each 32 bytes).
function derEncodeEcdsaSig(r: Uint8Array, s: Uint8Array): Uint8Array {
  const trimZero = (x: Uint8Array) => { let i = 0; while (i < x.length - 1 && x[i] === 0) i++; return x.slice(i); };
  let rT = trimZero(r); let sT = trimZero(s);
  if (rT[0] & 0x80) rT = concat(new Uint8Array([0]), rT);
  if (sT[0] & 0x80) sT = concat(new Uint8Array([0]), sT);
  const rEl = concat(new Uint8Array([0x02, rT.length]), rT);
  const sEl = concat(new Uint8Array([0x02, sT.length]), sT);
  const body = concat(rEl, sEl);
  return concat(new Uint8Array([0x30, body.length]), body);
}
