import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../context/AuthContext';
import { ShieldCheck, KeyRound, Smartphone, Laptop, RefreshCcw } from 'lucide-react';

const BG      = 'var(--s0, oklch(0.96 0.003 250))';
const BG1     = 'var(--s1, oklch(0.99 0.002 80))';
const BG2     = 'var(--s2, oklch(0.93 0.004 250))';
const BORDER  = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1     = 'var(--ink, oklch(0.17 0.010 250))';
const TX2     = 'var(--ink-2, oklch(0.40 0.009 250))';
const TX3     = 'var(--ink-2, oklch(0.60 0.007 250))';
const ACC     = 'var(--accent, oklch(0.46 0.16 55))';
const BAD     = 'var(--bad, oklch(0.48 0.20 20))';
const BAD_BG  = 'color-mix(in oklab, var(--bad) 15%, var(--s1))';
const WARN    = 'var(--accent, oklch(0.50 0.18 55))';
const WARN_BG = 'color-mix(in oklab, var(--warn) 15%, var(--s1))';
const GOOD    = 'var(--good, oklch(0.40 0.16 155))';
const GOOD_BG = 'color-mix(in oklab, var(--good) 15%, var(--s1))';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

interface SessionRow {
  id: string;
  issued_at: string;
  expires_at: string;
  last_used_at: string | null;
  user_agent: string | null;
  ip: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
}

export default function Security() {
  // MFA state
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [mfaMsg, setMfaMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Disable MFA modal state
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disablePw, setDisablePw] = useState('');

  // Revoke session confirm state
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  // Change password state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pwChanging, setPwChanging] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  async function loadMe() {
    try {
      const res = await api.get('/auth/me');
      if (res.data?.success) setMfaEnabled(!!res.data.data?.mfa_enabled);
    } catch { /* noop */ }
  }
  async function loadSessions() {
    try {
      const res = await api.get('/auth/sessions');
      if (res.data?.success) setSessions(res.data.data || []);
    } catch { /* noop */ }
  }
  useEffect(() => { loadMe(); loadSessions(); }, []);

  async function startMfaSetup() {
    setMfaMsg(null);
    try {
      const res = await api.post('/auth/mfa/setup');
      if (res.data?.success) {
        setMfaSetup(res.data.data);
      } else {
        setMfaMsg({ kind: 'err', text: res.data?.error || 'Setup failed' });
      }
    } catch (e: any) {
      setMfaMsg({ kind: 'err', text: e?.response?.data?.error || 'Setup failed' });
    }
  }

  async function confirmMfa() {
    setMfaMsg(null);
    try {
      const res = await api.post('/auth/mfa/verify', { code: mfaCode });
      if (res.data?.success) {
        setMfaEnabled(true);
        setMfaSetup(null);
        setMfaCode('');
        setBackupCodes(res.data.data?.backup_codes || null);
        setMfaMsg({ kind: 'ok', text: 'MFA enabled successfully.' });
      } else {
        setMfaMsg({ kind: 'err', text: res.data?.error || 'Invalid code' });
      }
    } catch (e: any) {
      setMfaMsg({ kind: 'err', text: e?.response?.data?.error || 'Invalid code' });
    }
  }

  async function disableMfa() {
    if (!disablePw) return;
    try {
      const res = await api.post('/auth/mfa/disable', { current_password: disablePw });
      if (res.data?.success) {
        setMfaEnabled(false);
        setBackupCodes(null);
        setMfaMsg({ kind: 'ok', text: 'MFA disabled.' });
        setShowDisableModal(false);
        setDisablePw('');
      } else {
        setMfaMsg({ kind: 'err', text: res.data?.error || 'Disable failed' });
      }
    } catch (e: any) {
      setMfaMsg({ kind: 'err', text: e?.response?.data?.error || 'Disable failed' });
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwChanging) return;
    setPwMsg(null);
    if (newPw.length < 8) { setPwMsg({ kind: 'err', text: 'New password must be at least 8 characters.' }); return; }
    setPwChanging(true);
    try {
      const res = await api.post('/auth/change-password', { current_password: currentPw, new_password: newPw });
      if (res.data?.success) {
        setPwMsg({ kind: 'ok', text: 'Password changed. All other sessions revoked.' });
        setCurrentPw(''); setNewPw('');
        loadSessions();
      } else {
        setPwMsg({ kind: 'err', text: res.data?.error || 'Change failed' });
      }
    } catch (e: any) {
      setPwMsg({ kind: 'err', text: e?.response?.data?.error || 'Change failed' });
    } finally {
      setPwChanging(false);
    }
  }

  async function revokeSession(id: string) {
    try {
      await api.post(`/auth/sessions/${id}/revoke`);
      setRevokeTarget(null);
      loadSessions();
    } catch { /* noop */ }
  }

  const activeSessions = sessions.filter(s => !s.revoked_at);
  const revokedSessions = sessions.filter(s => s.revoked_at);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    fontSize: 13,
    color: TX1,
    background: BG,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: TX2,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 4,
  };

  const sectionStyle: React.CSSProperties = {
    background: BG1,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    padding: '16px 20px',
    marginBottom: 16,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: TX2,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 12,
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      height: 'calc(100vh - 50px)',
      background: BG,
      overflow: 'hidden',
    }}>
      {/* LEFT COLUMN */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
        {/* Page header */}
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldCheck size={22} style={{ color: ACC }} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>Security</h1>
            <p style={{ fontSize: 13, color: TX2, margin: '2px 0 0' }}>Two-factor authentication, password, and active sessions.</p>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>MFA Status</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: mfaEnabled ? GOOD : BAD }}>
              {mfaEnabled ? 'Enabled' : 'Disabled'}
            </div>
          </div>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Active Sessions</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>
              {activeSessions.length}
            </div>
          </div>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Revoked</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>
              {revokedSessions.length}
            </div>
          </div>
        </div>

        {/* MFA Section */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Smartphone size={16} style={{ color: mfaEnabled ? GOOD : TX3 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: TX1 }}>Two-factor Authentication (TOTP)</span>
            <span style={{
              marginLeft: 'auto',
              background: mfaEnabled ? GOOD_BG : BAD_BG,
              color: mfaEnabled ? GOOD : BAD,
              padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
            }}>
              {mfaEnabled ? 'ENABLED' : 'DISABLED'}
            </span>
          </div>

          {mfaMsg && (
            <div style={{
              marginBottom: 14,
              borderRadius: 6,
              border: `1px solid ${mfaMsg.kind === 'ok' ? 'oklch(0.75 0.10 155)' : 'oklch(0.75 0.12 20)'}`,
              padding: '8px 12px',
              fontSize: 13,
              background: mfaMsg.kind === 'ok' ? GOOD_BG : BAD_BG,
              color: mfaMsg.kind === 'ok' ? GOOD : BAD,
            }}>
              {mfaMsg.text}
            </div>
          )}

          {!mfaEnabled && !mfaSetup && (
            <div>
              <p style={{ fontSize: 13, color: TX2, margin: '0 0 12px' }}>
                Protect your account with a TOTP authenticator app (Google Authenticator, Authy, 1Password). You'll be challenged for a 6-digit code at every login.
              </p>
              <button
                type="button"
                onClick={startMfaSetup}
                style={{ background: ACC, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
              >
                Enable MFA
              </button>
            </div>
          )}

          {!mfaEnabled && mfaSetup && (
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              <div style={{
                width: 180, height: 180, border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: 8, background: 'var(--s1, #fff)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <QRCodeSVG value={mfaSetup.otpauth_uri} size={160} level="M" includeMargin={false} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Manual secret</div>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: TX1, wordBreak: 'break-all', userSelect: 'all', background: BG2, borderRadius: 4, padding: '6px 8px' }}>
                    {mfaSetup.secret}
                  </div>
                </div>
                <p style={{ fontSize: 13, color: TX2, margin: '0 0 12px' }}>
                  Scan the QR with your authenticator app, then enter the 6-digit code to confirm.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    maxLength={6}
                    placeholder="123456"
                    style={{ ...inputStyle, fontFamily: MONO, letterSpacing: '0.4em', textAlign: 'center', width: 120 }}
                  />
                  <button
                    type="button"
                    onClick={confirmMfa}
                    disabled={mfaCode.length !== 6}
                    style={{
                      background: mfaCode.length === 6 ? ACC : TX3,
                      color: '#fff', border: 'none', padding: '8px 16px',
                      borderRadius: 6, fontWeight: 600, cursor: mfaCode.length === 6 ? 'pointer' : 'not-allowed', fontSize: 13,
                    }}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )}

          {mfaEnabled && !showDisableModal && (
            <div>
              <p style={{ fontSize: 13, color: TX2, margin: '0 0 12px' }}>
                Two-factor authentication is active. You'll be challenged for a 6-digit code at every login.
              </p>
              <button
                type="button"
                onClick={() => { setShowDisableModal(true); setDisablePw(''); setMfaMsg(null); }}
                style={{ background: 'transparent', color: BAD, border: `1px solid ${BAD}`, padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
              >
                Disable MFA
              </button>
            </div>
          )}

          {mfaEnabled && showDisableModal && (
            <div style={{ background: BAD_BG, border: `1px solid oklch(0.75 0.12 20)`, borderRadius: 6, padding: '14px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: BAD, marginBottom: 10 }}>
                Confirm your password to disable MFA
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="password"
                  value={disablePw}
                  onChange={(e) => setDisablePw(e.target.value)}
                  placeholder="Current password"
                  style={{ ...inputStyle, width: 200 }}
                />
                <button
                  type="button"
                  onClick={disableMfa}
                  disabled={!disablePw}
                  style={{
                    background: BAD, color: '#fff', border: 'none',
                    padding: '8px 14px', borderRadius: 6, fontWeight: 600,
                    cursor: disablePw ? 'pointer' : 'not-allowed', fontSize: 13,
                  }}
                >
                  Confirm Disable
                </button>
                <button
                  type="button"
                  onClick={() => { setShowDisableModal(false); setDisablePw(''); }}
                  style={{ background: 'transparent', color: TX2, border: `1px solid ${BORDER}`, padding: '8px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {backupCodes && (
            <div style={{ marginTop: 16, background: WARN_BG, border: `1px solid oklch(0.75 0.12 55)`, borderRadius: 6, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: WARN, marginBottom: 10 }}>
                Backup codes — store these somewhere safe. Each code works once.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {backupCodes.map((c) => (
                  <div key={c} style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '4px 6px', textAlign: 'center', fontFamily: MONO, fontSize: 12, color: TX1 }}>
                    {c}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sessions Section */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Laptop size={16} style={{ color: TX2 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: TX1 }}>Active Sessions</span>
            <button
              type="button"
              onClick={loadSessions}
              style={{ marginLeft: 'auto', background: 'transparent', color: TX2, border: `1px solid ${BORDER}`, padding: '4px 10px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <RefreshCcw size={12} /> Refresh
            </button>
          </div>

          {sessions.length === 0 && (
            <div style={{ fontSize: 13, color: TX3, padding: '12px 0' }}>No sessions recorded yet.</div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            {sessions.length > 0 && (
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Device / IP</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Issued</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Expires</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                  <th style={{ padding: '8px 12px' }}></th>
                </tr>
              </thead>
            )}
            <tbody>
              {sessions.map((s, i) => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                  <td style={{ padding: '10px 12px', color: TX1 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{s.user_agent ? s.user_agent.slice(0, 60) : 'Unknown device'}</div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: TX3, marginTop: 2 }}>{s.ip || '—'}</div>
                  </td>
                  <td style={{ padding: '10px 12px', color: TX2, fontSize: 12, fontFamily: MONO }}>
                    {new Date(s.issued_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '10px 12px', color: TX2, fontSize: 12, fontFamily: MONO }}>
                    {new Date(s.expires_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {s.revoked_at ? (
                      <span style={{ background: BAD_BG, color: BAD, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                        Revoked
                      </span>
                    ) : (
                      <span style={{ background: GOOD_BG, color: GOOD, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                        Active
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {!s.revoked_at && revokeTarget !== s.id && (
                      <button
                        type="button"
                        onClick={() => setRevokeTarget(s.id)}
                        style={{ background: 'transparent', color: BAD, border: `1px solid ${BAD}`, padding: '4px 10px', borderRadius: 5, fontWeight: 600, cursor: 'pointer', fontSize: 11 }}
                      >
                        Revoke
                      </button>
                    )}
                    {!s.revoked_at && revokeTarget === s.id && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: TX2 }}>Sure?</span>
                        <button
                          type="button"
                          onClick={() => revokeSession(s.id)}
                          style={{ background: BAD, color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 5, fontWeight: 600, cursor: 'pointer', fontSize: 11 }}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setRevokeTarget(null)}
                          style={{ background: 'transparent', color: TX2, border: `1px solid ${BORDER}`, padding: '4px 8px', borderRadius: 5, fontWeight: 600, cursor: 'pointer', fontSize: 11 }}
                        >
                          No
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div style={{
        borderLeft: `1px solid ${BORDER}`,
        background: BG1,
        overflowY: 'auto',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Change password */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <KeyRound size={15} style={{ color: TX2 }} />
            <div style={sectionTitleStyle}>Change Password</div>
          </div>

          {pwMsg && (
            <div style={{
              marginBottom: 12,
              borderRadius: 6,
              border: `1px solid ${pwMsg.kind === 'ok' ? 'oklch(0.75 0.10 155)' : 'oklch(0.75 0.12 20)'}`,
              padding: '8px 10px',
              fontSize: 12,
              background: pwMsg.kind === 'ok' ? GOOD_BG : BAD_BG,
              color: pwMsg.kind === 'ok' ? GOOD : BAD,
            }}>
              {pwMsg.text}
            </div>
          )}

          <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={labelStyle}>Current password</label>
              <input
                type="password"
                required
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>New password (min 8 chars)</label>
              <input
                type="password"
                required
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                style={inputStyle}
              />
            </div>
            <button
              type="submit"
              disabled={pwChanging}
              style={{
                background: pwChanging ? TX3 : ACC,
                color: '#fff', border: 'none',
                padding: '8px 16px', borderRadius: 6,
                fontWeight: 600, cursor: pwChanging ? 'not-allowed' : 'pointer', fontSize: 13,
                marginTop: 2,
              }}
            >
              {pwChanging ? 'Changing…' : 'Change Password'}
            </button>
          </form>
        </div>

        {/* Security tips */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Security Recommendations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Enable MFA', done: mfaEnabled },
              { label: 'Use a strong, unique password', done: false },
              { label: 'Review active sessions regularly', done: false },
            ].map((tip) => (
              <div key={tip.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: tip.done ? GOOD_BG : BG2,
                  border: `1px solid ${tip.done ? GOOD : BORDER}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {tip.done && <span style={{ fontSize: 9, color: GOOD, fontWeight: 900 }}>✓</span>}
                </div>
                <span style={{ color: tip.done ? TX2 : TX1 }}>{tip.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Session summary */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Session Summary</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: TX2 }}>Total sessions</span>
              <span style={{ fontFamily: MONO, fontWeight: 700, color: TX1 }}>{sessions.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: TX2 }}>Active</span>
              <span style={{ fontFamily: MONO, fontWeight: 700, color: GOOD }}>{activeSessions.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: TX2 }}>Revoked</span>
              <span style={{ fontFamily: MONO, fontWeight: 700, color: revokedSessions.length > 0 ? WARN : TX3 }}>{revokedSessions.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
