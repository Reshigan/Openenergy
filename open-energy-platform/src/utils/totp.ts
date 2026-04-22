// RFC 6238 TOTP (Time-based One-Time Password) implementation using Web Crypto.
// Works on Cloudflare Workers — no Node.js dependencies.
//
// Defaults: SHA-1, 6 digits, 30-second step, ±1 step drift window.

const STEP_SECONDS = 30;
const DIGITS = 6;
const DRIFT_STEPS = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function randomBase32Secret(bytes = 20): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base32Encode(buf);
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  while (out.length % 8 !== 0) out += '=';
  return out;
}

export function base32Decode(str: string): Uint8Array {
  const clean = str.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

async function hmacSha1(key: Uint8Array, counter: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, counter);
  return new Uint8Array(sig);
}

function counterBytes(counter: number): Uint8Array {
  const buf = new Uint8Array(8);
  let v = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = v & 0xff;
    v = Math.floor(v / 256);
  }
  return buf;
}

export async function totpGenerate(secretBase32: string, timestampSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const counter = Math.floor(timestampSec / STEP_SECONDS);
  return await hotp(secretBase32, counter);
}

async function hotp(secretBase32: string, counter: number): Promise<string> {
  const key = base32Decode(secretBase32);
  const mac = await hmacSha1(key, counterBytes(counter));
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  const mod = 10 ** DIGITS;
  return String(code % mod).padStart(DIGITS, '0');
}

export async function totpVerify(secretBase32: string, code: string, timestampSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const baseCounter = Math.floor(timestampSec / STEP_SECONDS);
  for (let d = -DRIFT_STEPS; d <= DRIFT_STEPS; d++) {
    const candidate = await hotp(secretBase32, baseCounter + d);
    if (constantTimeEq(candidate, code)) return true;
  }
  return false;
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function otpauthUri(params: { issuer: string; account: string; secret: string }): string {
  const label = encodeURIComponent(`${params.issuer}:${params.account}`);
  const qs = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${qs.toString()}`;
}

export function generateBackupCodes(n = 10): string[] {
  const codes: string[] = [];
  const buf = new Uint8Array(n * 5);
  crypto.getRandomValues(buf);
  for (let i = 0; i < n; i++) {
    const chunk = buf.slice(i * 5, i * 5 + 5);
    const hex = Array.from(chunk).map((b) => b.toString(16).padStart(2, '0')).join('');
    codes.push(hex.slice(0, 4) + '-' + hex.slice(4, 8));
  }
  return codes;
}
