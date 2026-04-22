import { describe, it, expect } from 'vitest';
import {
  base32Encode,
  base32Decode,
  randomBase32Secret,
  totpGenerate,
  totpVerify,
  otpauthUri,
  generateBackupCodes,
} from '../src/utils/totp';

describe('totp base32 round-trip', () => {
  it('decodes what it encodes', () => {
    const raw = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55]);
    const b32 = base32Encode(raw);
    const back = base32Decode(b32);
    expect(Array.from(back)).toEqual(Array.from(raw));
  });

  it('handles padding and case/whitespace in decode', () => {
    const raw = new Uint8Array([1, 2, 3, 4, 5]);
    const b32 = base32Encode(raw).toLowerCase();
    const padded = '  ' + b32 + '  ';
    const back = base32Decode(padded);
    expect(Array.from(back)).toEqual(Array.from(raw));
  });

  it('throws on invalid characters', () => {
    expect(() => base32Decode('not-valid-base32!')).toThrow(/Invalid base32/);
  });
});

describe('randomBase32Secret', () => {
  it('produces a base32-encoded secret of expected length', () => {
    const s = randomBase32Secret();
    // 20 bytes = 160 bits = 32 base32 chars (no padding).
    expect(s.replace(/=+$/, '').length).toBe(32);
  });

  it('produces different values across calls', () => {
    expect(randomBase32Secret()).not.toBe(randomBase32Secret());
  });
});

describe('RFC 6238 TOTP vectors', () => {
  // Known RFC 6238 Appendix B value for key "12345678901234567890" (ASCII),
  // T = 59 sec → 94287082 (8-digit) → last 6 digits: 287082.
  const SECRET_ASCII = '12345678901234567890';
  const SECRET_B32 = base32Encode(new TextEncoder().encode(SECRET_ASCII));

  it('matches the RFC T=59 vector (6 digits)', async () => {
    const code = await totpGenerate(SECRET_B32, 59);
    expect(code).toBe('287082');
  });

  it('matches the RFC T=1111111109 vector (6 digits)', async () => {
    // RFC 6238 Appendix B reference code at T=1111111109 is 07081804 (8-digit).
    // Last 6 digits = 081804.
    const code = await totpGenerate(SECRET_B32, 1111111109);
    expect(code).toBe('081804');
  });
});

describe('totpVerify drift window', () => {
  it('accepts code from one step before the current time', async () => {
    const secret = randomBase32Secret();
    const now = 1_700_000_000;
    const earlier = await totpGenerate(secret, now - 30);
    expect(await totpVerify(secret, earlier, now)).toBe(true);
  });

  it('accepts code from one step after the current time', async () => {
    const secret = randomBase32Secret();
    const now = 1_700_000_000;
    const later = await totpGenerate(secret, now + 30);
    expect(await totpVerify(secret, later, now)).toBe(true);
  });

  it('rejects code from two steps before (outside drift)', async () => {
    const secret = randomBase32Secret();
    const now = 1_700_000_000;
    const earlier = await totpGenerate(secret, now - 60);
    expect(await totpVerify(secret, earlier, now)).toBe(false);
  });

  it('rejects malformed codes without a crypto call', async () => {
    const secret = randomBase32Secret();
    expect(await totpVerify(secret, 'abcdef', 0)).toBe(false);
    expect(await totpVerify(secret, '12345', 0)).toBe(false);
    expect(await totpVerify(secret, '1234567', 0)).toBe(false);
  });
});

describe('otpauthUri', () => {
  it('builds a standard otpauth URI with required params', () => {
    const uri = otpauthUri({
      issuer: 'Open Energy',
      account: 'admin@openenergy.co.za',
      secret: 'JBSWY3DPEHPK3PXP',
    });
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain(encodeURIComponent('Open Energy:admin@openenergy.co.za'));
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=Open+Energy');
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});

describe('generateBackupCodes', () => {
  it('produces the requested number of codes', () => {
    const codes = generateBackupCodes(8);
    expect(codes.length).toBe(8);
  });

  it('formats each code as XXXX-XXXX hex', () => {
    const codes = generateBackupCodes(5);
    for (const c of codes) {
      expect(c).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}$/);
    }
  });

  it('produces distinct codes across a single call', () => {
    const codes = generateBackupCodes(10);
    expect(new Set(codes).size).toBe(10);
  });
});
