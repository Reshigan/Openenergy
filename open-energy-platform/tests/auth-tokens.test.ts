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

  it('rotateSession: replay of an already-rotated token returns null (old hash gone)', async () => {
    // Sequential replay: caller A rotates first (hash overwritten), caller B
    // re-presents the same old refresh token. B's SELECT finds no row whose
    // refresh_token_hash equals the old hash, so rotateSession returns null
    // without issuing a new token. B is silently logged out — no new token
    // leaked to a replayed credential.
    const s1 = await createSession({ db: db as any, participantId: 'p_alice', accessJti: 'jti_a1' });
    const rot = await rotateSession(db as any, s1.refreshToken, 'jti_new');
    expect(rot).not.toBeNull();
    expect(rot!.newRefreshToken).not.toBe(s1.refreshToken);
    // Replaying the original token: SELECT by the old hash returns null.
    expect(await rotateSession(db as any, s1.refreshToken, 'jti_replay')).toBeNull();
  });

  it('rotateSession: concurrent race (changes===0) revokes the whole session family', async () => {
    // True race window: both callers SELECT the row before either UPDATEs.
    // The atomic UPDATE ensures exactly one caller gets changes>0; the other
    // gets changes===0 and treats it as a replay signal, revoking EVERY live
    // session for the participant (we don't track per-token family ids, so
    // participant-wide revocation is the practical containment). This forces
    // a full re-login, which is the right move when a refresh token is used
    // twice. We simulate the race with the mock's failNextRotationUpdate flag.
    const s1 = await createSession({ db: db as any, participantId: 'p_alice', accessJti: 'jti_a1' });
    const s2 = await createSession({ db: db as any, participantId: 'p_alice', accessJti: 'jti_a2' });
    // Arm the race: the next rotation UPDATE returns changes=0 (as if another
    // caller beat us to it between our SELECT and UPDATE).
    db.failNextRotationUpdate = true;
    const rot = await rotateSession(db as any, s1.refreshToken, 'jti_new');
    expect(rot).toBeNull();
    // Family revocation fired: every live session for p_alice is now revoked.
    // s1 (the replayed one) and s2 (an innocent sibling) both dead.
    expect(await rotateSession(db as any, s1.refreshToken, 'next')).toBeNull();
    expect(await rotateSession(db as any, s2.refreshToken, 'next')).toBeNull();
    // An unrelated participant is unaffected.
    const bob = await createSession({ db: db as any, participantId: 'p_bob', accessJti: 'jti_b1' });
    expect(await rotateSession(db as any, bob.refreshToken, 'next')).not.toBeNull();
  });

  it('rotateSession: a revoked token (explicit logout) returns null without revoking the family', async () => {
    // Explicit logout revokes one session. A later replay of that token must
    // return null, but it must NOT trip the family-revocation path — the
    // SELECT finds a row with revoked_at set, so the function returns null
    // before reaching the atomic UPDATE. Other sessions for the participant
    // stay alive.
    const s1 = await createSession({ db: db as any, participantId: 'p_alice', accessJti: 'jti_a1' });
    const s2 = await createSession({ db: db as any, participantId: 'p_alice', accessJti: 'jti_a2' });
    await revokeSessionByRefresh(db as any, s1.refreshToken, 'user_logout');
    expect(await rotateSession(db as any, s1.refreshToken, 'next')).toBeNull();
    // s2 is untouched — family revocation did NOT fire.
    expect(await rotateSession(db as any, s2.refreshToken, 'next')).not.toBeNull();
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

  it('composite lockout: trips on the EMAIL dimension (attacker-driven lockout protects the victim)', async () => {
    // 5 bad passwords for alice@example.com from 5 DIFFERENT IPs. Each IP
    // bucket has only 1 failure (below threshold), but the email bucket has
    // 5 (>= threshold) — so the email dimension trips. This is the intended
    // behavior: an attacker cannot evade the per-email lockout by rotating
    // IPs, and a victim whose password is being stuffed gets protected.
    const db = new MockD1();
    for (let i = 1; i <= authConfig.lockoutThreshold; i++) {
      await recordLoginAttempt(db as any, 'alice@example.com', `10.0.0.${i}`, false, 'bad_password');
    }
    const state = await isLockedOut(db as any, 'alice@example.com', '10.0.0.99');
    expect(state.locked).toBe(true);
    expect(state.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('composite lockout: trips on the IP dimension (credential stuffing from one IP against many accounts)', async () => {
    // 5 bad passwords from the SAME IP against 5 DIFFERENT emails. Each email
    // bucket has only 1 failure (below threshold), but the IP bucket has 5
    // (>= threshold) — so the IP dimension trips. This is the intended
    // behavior: a credential stuffer rotating target accounts from one IP
    // cannot evade the per-IP lockout.
    const db = new MockD1();
    for (let i = 1; i <= authConfig.lockoutThreshold; i++) {
      await recordLoginAttempt(db as any, `victim${i}@example.com`, '203.0.113.7', false, 'bad_password');
    }
    const state = await isLockedOut(db as any, 'newvictim@example.com', '203.0.113.7');
    expect(state.locked).toBe(true);
    expect(state.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('composite lockout: a missing IP skips the IP dimension (cannot evade via null IP, only relax it)', async () => {
    // 4 failures from a null IP — below threshold, not locked. ip=null means
    // the IP dimension is not consulted, so the IP bucket cannot be used to
    // trip OR to evade. The email dimension alone decides.
    const db = new MockD1();
    for (let i = 0; i < authConfig.lockoutThreshold - 1; i++) {
      await recordLoginAttempt(db as any, 'alice@example.com', null, false);
    }
    expect((await isLockedOut(db as any, 'alice@example.com', null)).locked).toBe(false);
  });

  it('composite lockout: one IP hitting threshold locks that IP even for a different email', async () => {
    // Confirms the IP dimension is independent of the email being checked.
    const db = new MockD1();
    for (let i = 1; i <= authConfig.lockoutThreshold; i++) {
      await recordLoginAttempt(db as any, `a${i}@example.com`, '198.51.100.1', false);
    }
    const state = await isLockedOut(db as any, 'never-attacked@example.com', '198.51.100.1');
    expect(state.locked).toBe(true);
  });
});
