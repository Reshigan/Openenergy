import { useEffect, useState } from 'react';
import { api } from '../../context/AuthContext';
import { ShieldCheck, KeyRound, Smartphone, Laptop, RefreshCcw } from 'lucide-react';

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

  // Change password state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

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
    const pw = prompt('Confirm your current password to disable MFA:');
    if (!pw) return;
    try {
      const res = await api.post('/auth/mfa/disable', { current_password: pw });
      if (res.data?.success) {
        setMfaEnabled(false);
        setBackupCodes(null);
        setMfaMsg({ kind: 'ok', text: 'MFA disabled.' });
      } else {
        setMfaMsg({ kind: 'err', text: res.data?.error || 'Disable failed' });
      }
    } catch (e: any) {
      setMfaMsg({ kind: 'err', text: e?.response?.data?.error || 'Disable failed' });
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPw.length < 8) { setPwMsg({ kind: 'err', text: 'New password must be at least 8 characters.' }); return; }
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
    }
  }

  async function revokeSession(id: string) {
    if (!confirm('Revoke this session? Any active login from it will be terminated.')) return;
    try {
      await api.post(`/auth/sessions/${id}/revoke`);
      loadSessions();
    } catch { /* noop */ }
  }

  const qrSrc = mfaSetup ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(mfaSetup.otpauth_uri)}&size=180x180` : '';

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-center gap-3">
        <ShieldCheck className="text-blue-600" />
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: '#32363a' }}>Security</h1>
          <p className="text-[13px]" style={{ color: '#6a6d70' }}>Two-factor authentication, password, and active sessions.</p>
        </div>
      </header>

      {/* MFA */}
      <section className="bg-white border rounded-xl p-5" style={{ borderColor: '#e5e5e5' }}>
        <div className="flex items-center gap-2 mb-3">
          <Smartphone size={18} className="text-purple-600" />
          <h2 className="text-[16px] font-semibold">Two-factor authentication (TOTP)</h2>
          {mfaEnabled && <span className="ml-auto fiori-chip good">Enabled</span>}
          {!mfaEnabled && <span className="ml-auto fiori-chip critical">Disabled</span>}
        </div>
        {mfaMsg && (
          <div className={`mb-3 rounded-lg border px-3 py-2 text-[13px] ${mfaMsg.kind === 'ok' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{mfaMsg.text}</div>
        )}
        {!mfaEnabled && !mfaSetup && (
          <button className="btn btn-primary" onClick={startMfaSetup}>Enable MFA</button>
        )}
        {!mfaEnabled && mfaSetup && (
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <img src={qrSrc} alt="TOTP QR code" className="w-[180px] h-[180px] border rounded-lg" style={{ borderColor: '#e5e5e5' }} />
            <div className="flex-1 space-y-3">
              <div>
                <div className="text-[12px] font-semibold text-gray-500 uppercase tracking-widest">Manual secret</div>
                <div className="font-mono text-[13px] break-all select-all">{mfaSetup.secret}</div>
              </div>
              <p className="text-[13px]" style={{ color: '#6a6d70' }}>
                Scan the QR with Google Authenticator / Authy / 1Password, then enter the 6-digit code below to confirm.
              </p>
              <div className="flex gap-2">
                <input value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))} maxLength={6} className="input font-mono tracking-[0.4em] text-center" placeholder="123456" />
                <button className="btn btn-primary" onClick={confirmMfa} disabled={mfaCode.length !== 6}>Confirm</button>
              </div>
            </div>
          </div>
        )}
        {mfaEnabled && (
          <div className="flex flex-col gap-3">
            <p className="text-[13px]" style={{ color: '#6a6d70' }}>Two-factor authentication is active on this account. You'll be challenged for a 6-digit code at every login.</p>
            <div>
              <button className="btn btn-secondary" onClick={disableMfa}>Disable MFA</button>
            </div>
          </div>
        )}
        {backupCodes && (
          <div className="mt-4 rounded-lg border px-3 py-3 text-[12px]" style={{ background: '#fff7e0', borderColor: '#e8c66c', color: '#6a4e00' }}>
            <div className="font-semibold mb-2">Backup codes — store these somewhere safe. Each code works once.</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 font-mono">
              {backupCodes.map((c) => <div key={c} className="bg-white/60 border rounded px-2 py-1 text-center">{c}</div>)}
            </div>
          </div>
        )}
      </section>

      {/* Change password */}
      <section className="bg-white border rounded-xl p-5" style={{ borderColor: '#e5e5e5' }}>
        <div className="flex items-center gap-2 mb-3">
          <KeyRound size={18} className="text-blue-600" />
          <h2 className="text-[16px] font-semibold">Change password</h2>
        </div>
        {pwMsg && (
          <div className={`mb-3 rounded-lg border px-3 py-2 text-[13px] ${pwMsg.kind === 'ok' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{pwMsg.text}</div>
        )}
        <form onSubmit={changePassword} className="grid md:grid-cols-2 gap-3 max-w-xl">
          <div className="md:col-span-2">
            <label className="label">Current password</label>
            <input type="password" required value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="label">New password (min 8 chars)</label>
            <input type="password" required value={newPw} onChange={(e) => setNewPw(e.target.value)} className="input" />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="btn btn-primary">Change password</button>
          </div>
        </form>
      </section>

      {/* Sessions */}
      <section className="bg-white border rounded-xl p-5" style={{ borderColor: '#e5e5e5' }}>
        <div className="flex items-center gap-2 mb-3">
          <Laptop size={18} className="text-slate-700" />
          <h2 className="text-[16px] font-semibold">Active sessions</h2>
          <button className="ml-auto btn btn-secondary" onClick={loadSessions}><RefreshCcw size={14} /> Refresh</button>
        </div>
        {sessions.length === 0 && <div className="text-[13px] text-gray-500">No sessions recorded yet.</div>}
        <div className="divide-y">
          {sessions.map((s) => (
            <div key={s.id} className="py-3 flex flex-col md:flex-row md:items-center gap-2">
              <div className="flex-1">
                <div className="text-[13px] font-semibold">{s.user_agent ? s.user_agent.slice(0, 80) : 'Unknown device'}</div>
                <div className="text-[12px] text-gray-500">
                  IP {s.ip || '—'} · issued {new Date(s.issued_at).toLocaleString()} · expires {new Date(s.expires_at).toLocaleString()}
                  {s.revoked_at && <> · <span className="text-red-600 font-semibold">revoked ({s.revoked_reason || 'unknown'})</span></>}
                </div>
              </div>
              {!s.revoked_at && (
                <button className="btn btn-secondary text-red-600" onClick={() => revokeSession(s.id)}>Revoke</button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
