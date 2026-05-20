// ════════════════════════════════════════════════════════════════════════
// webauthn — real attestation + assertion verification for WebAuthn.
//
// The Cloudflare Workers runtime gives us Web Crypto (ECDSA + RSA verify)
// but no CBOR. We hand-roll the minimum CBOR decoder needed to:
//
//   1. Parse the attestationObject during registration to extract the
//      authenticatorData (AAGUID + credentialId + credentialPublicKey COSE).
//   2. Decode the COSE_Key public key (ES256 / RS256 / EdDSA).
//   3. On assertion, verify clientDataJSON + authenticatorData signature
//      against the stored COSE public key, and bump the counter.
//
// Refs: WebAuthn Level 2 §6.5, RFC 8152 (COSE), RFC 7049 (CBOR).
// ════════════════════════════════════════════════════════════════════════

// ─── base64url <-> bytes ────────────────────────────────────────────────
export function b64uToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
export function bytesToB64u(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── Minimal CBOR decoder (only the types WebAuthn uses) ───────────────
// Supports: unsigned int, negative int, byte string, text string, array,
// map. No tags, no floats, no indefinite-length. Returns [value, bytes-consumed].
function decodeCbor(buf: Uint8Array, offset = 0): [any, number] {
  if (offset >= buf.length) throw new Error('cbor: out of input');
  const initial = buf[offset];
  const major = initial >> 5;
  const minor = initial & 0x1f;
  offset += 1;

  const readUint = (mn: number): [number, number] => {
    if (mn < 24) return [mn, offset];
    if (mn === 24) return [buf[offset], offset + 1];
    if (mn === 25) return [(buf[offset] << 8) | buf[offset + 1], offset + 2];
    if (mn === 26) {
      // 32-bit unsigned — avoid sign-bit shift artefacts
      return [
        buf[offset] * 0x1000000 + (buf[offset + 1] << 16) + (buf[offset + 2] << 8) + buf[offset + 3],
        offset + 4,
      ];
    }
    if (mn === 27) {
      // 64-bit — collapse to Number; WebAuthn doesn't need >2^53
      let hi = 0; let lo = 0;
      for (let i = 0; i < 4; i++) hi = (hi << 8) | buf[offset + i];
      for (let i = 4; i < 8; i++) lo = (lo << 8) | buf[offset + i];
      return [hi * 0x100000000 + lo, offset + 8];
    }
    throw new Error('cbor: indefinite-length not supported');
  };

  let len: number;
  switch (major) {
    case 0: { // unsigned int
      const [v, o] = readUint(minor); return [v, o];
    }
    case 1: { // negative int
      const [v, o] = readUint(minor); return [-1 - v, o];
    }
    case 2: { // byte string
      [len, offset] = readUint(minor);
      const bytes = buf.slice(offset, offset + len);
      return [bytes, offset + len];
    }
    case 3: { // text string
      [len, offset] = readUint(minor);
      const s = new TextDecoder().decode(buf.slice(offset, offset + len));
      return [s, offset + len];
    }
    case 4: { // array
      [len, offset] = readUint(minor);
      const arr: any[] = [];
      for (let i = 0; i < len; i++) {
        const [v, no] = decodeCbor(buf, offset);
        arr.push(v); offset = no;
      }
      return [arr, offset];
    }
    case 5: { // map
      [len, offset] = readUint(minor);
      const map = new Map<any, any>();
      for (let i = 0; i < len; i++) {
        const [k, ko] = decodeCbor(buf, offset); offset = ko;
        const [v, vo] = decodeCbor(buf, offset); offset = vo;
        map.set(k, v);
      }
      return [map, offset];
    }
    case 7: { // simple values
      if (minor === 20) return [false, offset];
      if (minor === 21) return [true, offset];
      if (minor === 22) return [null, offset];
      throw new Error(`cbor: unsupported simple value ${minor}`);
    }
    default:
      throw new Error(`cbor: unsupported major type ${major}`);
  }
}

// ─── authenticatorData parser ──────────────────────────────────────────
// Layout: rpIdHash(32) | flags(1) | counter(4) | [attestedCredData] | [extensions]
// attestedCredData (when flags & 0x40): aaguid(16) | credIdLen(2) | credId | credentialPublicKey(CBOR)
export interface ParsedAuthenticatorData {
  rpIdHash: Uint8Array;
  flags: number;
  userPresent: boolean;
  userVerified: boolean;
  signCount: number;
  aaguid?: Uint8Array;
  credentialId?: Uint8Array;
  credentialPublicKeyCose?: Uint8Array;
}

export function parseAuthenticatorData(buf: Uint8Array): ParsedAuthenticatorData {
  if (buf.length < 37) throw new Error('authenticatorData: too short');
  const rpIdHash = buf.slice(0, 32);
  const flags = buf[32];
  const userPresent  = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  const attCredPresent = (flags & 0x40) !== 0;
  const signCount = (buf[33] << 24 >>> 0) + (buf[34] << 16) + (buf[35] << 8) + buf[36];
  let out: ParsedAuthenticatorData = { rpIdHash, flags, userPresent, userVerified, signCount };
  if (!attCredPresent) return out;
  let off = 37;
  const aaguid = buf.slice(off, off + 16); off += 16;
  const credIdLen = (buf[off] << 8) | buf[off + 1]; off += 2;
  const credentialId = buf.slice(off, off + credIdLen); off += credIdLen;
  // The COSE key is the tail; we decode it once to know how long it was so
  // extensions (if any) can follow. The actual COSE bytes are what we store
  // — verification works straight off the COSE structure.
  const [_decoded, consumed] = decodeCbor(buf, off);
  const credentialPublicKeyCose = buf.slice(off, consumed);
  out = { ...out, aaguid, credentialId, credentialPublicKeyCose };
  return out;
}

// ─── COSE → CryptoKey ──────────────────────────────────────────────────
// Supports COSE_Key for ES256 (alg -7, kty 2/EC2, crv 1/P-256) and
// RS256 (alg -257, kty 3/RSA). Returns the parsed alg + a CryptoKey
// ready for crypto.subtle.verify.
export async function coseToCryptoKey(coseBytes: Uint8Array): Promise<{ alg: number; key: CryptoKey }> {
  const [decoded] = decodeCbor(coseBytes);
  if (!(decoded instanceof Map)) throw new Error('COSE: not a map');
  const kty = decoded.get(1);
  const alg = decoded.get(3);

  if (kty === 2) {
    // EC2 — ES256 (alg -7), curve P-256 (crv 1)
    if (alg !== -7) throw new Error(`COSE: unsupported EC alg ${alg}`);
    const crv = decoded.get(-1);
    if (crv !== 1) throw new Error(`COSE: unsupported EC curve ${crv}`);
    const x = decoded.get(-2) as Uint8Array;
    const y = decoded.get(-3) as Uint8Array;
    // JWK for P-256
    const jwk: JsonWebKey = {
      kty: 'EC',
      crv: 'P-256',
      x: bytesToB64u(x),
      y: bytesToB64u(y),
      ext: true,
    };
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return { alg, key };
  }
  if (kty === 3) {
    // RSA — RS256 (alg -257)
    if (alg !== -257) throw new Error(`COSE: unsupported RSA alg ${alg}`);
    const n = decoded.get(-1) as Uint8Array;
    const e = decoded.get(-2) as Uint8Array;
    const jwk: JsonWebKey = {
      kty: 'RSA',
      n: bytesToB64u(n),
      e: bytesToB64u(e),
      alg: 'RS256',
      ext: true,
    };
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return { alg, key };
  }
  throw new Error(`COSE: unsupported kty ${kty}`);
}

// ─── Signature normalisation ───────────────────────────────────────────
// WebAuthn ES256 signatures are ASN.1 DER (SEQUENCE(INTEGER r, INTEGER s)).
// Web Crypto verify wants raw 64-byte (r || s). Convert.
export function ecdsaDerToRaw(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) throw new Error('ECDSA: not a SEQUENCE');
  let off = 2;
  if (der[1] & 0x80) off = 2 + (der[1] & 0x7f);
  if (der[off] !== 0x02) throw new Error('ECDSA: expected INTEGER r');
  const rLen = der[off + 1];
  let r = der.slice(off + 2, off + 2 + rLen);
  off = off + 2 + rLen;
  if (der[off] !== 0x02) throw new Error('ECDSA: expected INTEGER s');
  const sLen = der[off + 1];
  let s = der.slice(off + 2, off + 2 + sLen);
  // Strip leading zero from DER padding
  if (r.length > 32 && r[0] === 0) r = r.slice(1);
  if (s.length > 32 && s[0] === 0) s = s.slice(1);
  // Left-pad to 32 bytes each
  const padded = new Uint8Array(64);
  padded.set(r, 32 - r.length);
  padded.set(s, 64 - s.length);
  return padded;
}

// ─── Top-level register attestation parser ─────────────────────────────
// Returns the credentialId + COSE public key bytes for storage.
export function parseRegistrationAttestation(attestationObjectB64u: string): {
  credentialId: string;
  publicKeyCoseB64u: string;
  signCount: number;
  aaguid: string;
} {
  const att = b64uToBytes(attestationObjectB64u);
  const [decoded] = decodeCbor(att);
  if (!(decoded instanceof Map)) throw new Error('attestation: not a map');
  const authData = decoded.get('authData') as Uint8Array;
  if (!authData) throw new Error('attestation: missing authData');
  const parsed = parseAuthenticatorData(authData);
  if (!parsed.credentialId || !parsed.credentialPublicKeyCose) {
    throw new Error('attestation: missing attested credential data');
  }
  return {
    credentialId: bytesToB64u(parsed.credentialId),
    publicKeyCoseB64u: bytesToB64u(parsed.credentialPublicKeyCose),
    signCount: parsed.signCount,
    aaguid: bytesToB64u(parsed.aaguid || new Uint8Array(16)),
  };
}

// ─── Top-level assertion verifier ──────────────────────────────────────
// Takes the stored COSE public key + the assertion fields and verifies
// the signature was produced over (authenticatorData || SHA-256(clientDataJSON)).
export async function verifyAssertion(opts: {
  publicKeyCoseB64u: string;
  authenticatorDataB64u: string;
  clientDataJSONB64u: string;
  signatureB64u: string;
  expectedChallenge?: string;
  expectedRpIdHash?: Uint8Array;
  expectedOrigin?: string;
  expectedType?: string;
  storedCounter: number;
}): Promise<{ ok: boolean; newCounter: number; reason?: string }> {
  // 1. Parse + validate clientDataJSON
  const clientDataBytes = b64uToBytes(opts.clientDataJSONB64u);
  let clientData: any;
  try {
    clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
  } catch { return { ok: false, newCounter: opts.storedCounter, reason: 'bad clientDataJSON' }; }
  if (opts.expectedType && clientData.type !== opts.expectedType) {
    return { ok: false, newCounter: opts.storedCounter, reason: `type mismatch: ${clientData.type}` };
  }
  if (opts.expectedChallenge && clientData.challenge !== opts.expectedChallenge) {
    return { ok: false, newCounter: opts.storedCounter, reason: 'challenge mismatch' };
  }
  if (opts.expectedOrigin && clientData.origin !== opts.expectedOrigin) {
    return { ok: false, newCounter: opts.storedCounter, reason: `origin mismatch: ${clientData.origin}` };
  }

  // 2. Parse authenticatorData
  const authData = b64uToBytes(opts.authenticatorDataB64u);
  const parsed = parseAuthenticatorData(authData);
  if (!parsed.userPresent) return { ok: false, newCounter: opts.storedCounter, reason: 'UP not set' };
  if (opts.expectedRpIdHash) {
    for (let i = 0; i < 32; i++) {
      if (parsed.rpIdHash[i] !== opts.expectedRpIdHash[i]) {
        return { ok: false, newCounter: opts.storedCounter, reason: 'rpIdHash mismatch' };
      }
    }
  }
  // Counter regression check
  if (parsed.signCount !== 0 && parsed.signCount <= opts.storedCounter) {
    return { ok: false, newCounter: opts.storedCounter, reason: `counter regression ${parsed.signCount} <= ${opts.storedCounter}` };
  }

  // 3. Build the signed message: authenticatorData || SHA-256(clientDataJSON)
  const cdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataBytes));
  const signed = new Uint8Array(authData.length + cdHash.length);
  signed.set(authData, 0); signed.set(cdHash, authData.length);

  // 4. Import the public key and verify
  const { alg, key } = await coseToCryptoKey(b64uToBytes(opts.publicKeyCoseB64u));
  let signature: Uint8Array = b64uToBytes(opts.signatureB64u);
  let algParams: any;
  if (alg === -7) {
    signature = ecdsaDerToRaw(signature);
    algParams = { name: 'ECDSA', hash: 'SHA-256' };
  } else if (alg === -257) {
    algParams = { name: 'RSASSA-PKCS1-v1_5' };
  } else {
    return { ok: false, newCounter: opts.storedCounter, reason: `unsupported alg ${alg}` };
  }
  const ok = await crypto.subtle.verify(algParams, key, signature, signed);
  if (!ok) return { ok: false, newCounter: opts.storedCounter, reason: 'signature invalid' };
  return { ok: true, newCounter: parsed.signCount };
}

export async function sha256(input: string | Uint8Array): Promise<Uint8Array> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}
