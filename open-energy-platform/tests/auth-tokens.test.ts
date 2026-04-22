import { describe, it, expect, beforeEach } from 'vitest';
import {
  randomId,
  randomOpaqueToken,
  sha256Hex,
  createSession,
  rotateSession,
  revokeSessionByRefresh,
  revokeAllSessionsForParticipant,
  createPasswordResetToken,
  consumePasswordResetToken,
  createEmailVerificationToken,
  consumeEmailVerificationToken,
  recordLoginAttempt,
  isLockedOut,
  authConfig,
} from '../src/utils/auth-tokens';
import { MockD1 } from './helpers/d1-mock';

describe('token primitives', () => {
  it('randomId applies prefix and generates 32 hex chars', () => {
    const id = randomId('sess_');
    expect(id.startsWith('sess_')).toBe(true);
    expect(id.slice(5)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('randomId produces distinct values', () => {
    expect(randomId('x_')).not.toBe(randomId('x_'));
  });

  it('randomOpaqueToken produces hex of requested length (2 chars/byte)', () => {
    expect(randomOpaqueToken(16)).toMatch(/^[0-9a-f]{32}$/);
    expect(randomOpaqueToken(32)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sha256Hex matches known vector for empty string', async () => {
    const hash = await sha256Hex('');
    // Known SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('createSession + rotateSession + revoke', () => {
  let db: MockD1;
  beforeEach(() => { db = new MockD1(); });

  it('creates a session row with hashed refresh token (raw not stored)', async () => {
    const s = await createSession({
      db: db as any,
      participantId: 'p_alice',
      accessJti: 'jti_1',
      userAgent: 'test-agent',
      ip: '1.2.3.4',
    });
    const row = db.tables['sessions'][0];
    const expectedHash = await sha256Hex(s.refreshToken);
    expect(row.refresh_token_hash).toBe(expectedHash);
    expect(row.refresh_token_hash).not.toBe(s.refreshToken);
    expect(row.participant_id).toBe('p_alice');
  });

  it('rotateSession issues a NEW refresh token and updates the row', async () => {
    const s = await createSession({ db: db as any, participantId: 'p_alice', accessJti: 'jti_1' });
    const rot = await rotateSession(db as any, s.refreshToken, 'jti_2');
    expect(rot).not.toBeNull();
    expect(rot!.newRefreshToken).not.toBe(s.refreshToken);
    // Old hash has been overwritten — can't rotate again with the old token.
    const replay = await rotateSession(db as any, s.refreshToken, 'jti_3');
    expect(replay).toBeNull();
  });

  it('rotateSession returns null for a revoked session', async () => {
    const s = await createSession({ db: db as any, participantId: 'p_alice', accessJti: 'jti_1' });
    const revoked = await revokeSessionByRefresh(db as any, s.refreshToken, 'user_logout');
    expect(revoked).toBe(true);
    expect(await rotateSession(db as any, s.refreshToken, 'jti_2')).toBeNull();
  });

  it('rotateSession returns null for an expired session', async () => {
    const s = await createSession({ db: db as any, participantId: 'p_alice', accessJti: 'jti_1' });
    // Backdate the expiry.
    db.tables['sessions'][0].refresh_expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await rotateSession(db as any, s.refreshToken, 'jti_2')).toBeNull();
  });

  it('revokeAllSessionsForParticipant revokes every live session for that participant', async () => {
    const s1 = await createSession({ db: db as any, participantId: 'p_alice', accessJti: 'jti_a1' });
    const s2 = await createSession({ db: db as any, participantId: 'p_alice', accessJti: 'jti_a2' });
    const s3 = await createSession({ db: db as any, participantId: 'p_bob', accessJti: 'jti_b1' });
    await revokeAllSessionsForParticipant(db as any, 'p_alice', 'password_changed');
    expect(await rotateSession(db as any, s1.refreshToken, 'new')).toBeNull();
    expect(await rotateSession(db as any, s2.refreshToken, 'new')).toBeNull();
    expect(await rotateSession(db as any, s3.refreshToken, 'new')).not.toBeNull();
  });
});

describe('password reset tokens', () => {
  let db: MockD1;
  beforeEach(() => { db = new MockD1(); });

  it('create + consume returns the participantId once, then null on replay', async () => {
    const raw = await createPasswordResetToken(db as any, 'p_alice', '1.2.3.4');
    expect(await consumePasswordResetToken(db as any, raw)).toBe('p_alice');
    expect(await consumePasswordResetToken(db as any, raw)).toBeNull();
  });

  it('rejects a token for which the raw value does not hash to a stored row', async () => {
    await createPasswordResetToken(db as any, 'p_alice', null);
    expect(await consumePasswordResetToken(db as any, 'nope-nope-nope')).toBeNull();
  });

  it('rejects an expired token', async () => {
    const raw = await createPasswordResetToken(db as any, 'p_alice', null);
    db.tables['password_reset_tokens'][0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await consumePasswordResetToken(db as any, raw)).toBeNull();
  });
});

describe('email verification tokens', () => {
  it('create + consume returns participantId once', async () => {
    const db = new MockD1();
    const raw = await createEmailVerificationToken(db as any, 'p_alice');
    expect(await consumeEmailVerificationToken(db as any, raw)).toBe('p_alice');
    expect(await consumeEmailVerificationToken(db as any, raw)).toBeNull();
  });
});

describe('login lockout', () => {
  it('not locked before threshold failures', async () => {
    const db = new MockD1();
    for (let i = 0; i < authConfig.lockoutThreshold - 1; i++) {
      await recordLoginAttempt(db as any, 'alice@example.com', '1.1.1.1', false, 'bad_password');
    }
    const state = await isLockedOut(db as any, 'alice@example.com');
    expect(state.locked).toBe(false);
    expect(state.attempts).toBe(authConfig.lockoutThreshold - 1);
  });

  it('locks after threshold failures within the window', async () => {
    const db = new MockD1();
    for (let i = 0; i < authConfig.lockoutThreshold; i++) {
      await recordLoginAttempt(db as any, 'alice@example.com', '1.1.1.1', false);
    }
    const state = await isLockedOut(db as any, 'alice@example.com');
    expect(state.locked).toBe(true);
    expect(state.retryAfterSeconds).toBeGreaterThan(0);
    expect(state.retryAfterSeconds).toBeLessThanOrEqual(authConfig.lockoutDurationMinutes * 60);
  });

  it('lowercases the email so the key is case-insensitive', async () => {
    const db = new MockD1();
    for (let i = 0; i < authConfig.lockoutThreshold; i++) {
      await recordLoginAttempt(db as any, 'Alice@Example.COM', null, false);
    }
    expect((await isLockedOut(db as any, 'alice@example.com')).locked).toBe(true);
  });

  it('successful attempts are recorded but do not count toward the lockout', async () => {
    const db = new MockD1();
    for (let i = 0; i < authConfig.lockoutThreshold; i++) {
      await recordLoginAttempt(db as any, 'alice@example.com', null, true);
    }
    expect((await isLockedOut(db as any, 'alice@example.com')).locked).toBe(false);
  });
});
