// ════════════════════════════════════════════════════════════════════════
// PasskeysPage — /settings/passkeys
//
// Enrol and manage WebAuthn (FIDO2) passkeys for step-up + login. Drives:
//   POST /api/auth-deep/webauthn/register/begin
//   POST /api/auth-deep/webauthn/register/finish
//   GET  /api/auth-deep/webauthn/credentials
//   POST /api/auth-deep/webauthn/credentials/:id/revoke
//
// Requires a browser that supports navigator.credentials.create with the
// publicKey provider — covered by Chrome / Edge / Safari / Firefox 60+.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { Fingerprint, AlertCircle, CheckCircle2, X, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { StitchPage } from '../StitchPage';

type Cred = {
  id: string; device_name: string; transports: string | null;
  last_used_at: string | null; created_at: string; revoked_at: string | null;
};

function b64uToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToB64u(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function PasskeysPage() {
  const [creds, setCreds] = useState<Cred[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState('');

  const supported = typeof window !== 'undefined' && !!(window.PublicKeyCredential);

  const load = async () => {
    try {
      const r = await api.get('/auth-deep/webauthn/credentials');
      if (r.data.success) setCreds(r.data.data || []);
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'load failed'); }
  };
  useEffect(() => { void load(); }, []);

  const enroll = async () => {
    if (!supported) { setErr('Your browser does not support WebAuthn.'); return; }
    setBusy(true); setErr(null); setAck(null);
    try {
      const begin = await api.post('/auth-deep/webauthn/register/begin', {});
      if (!begin.data.success) throw new Error(begin.data.error || 'begin failed');
      const opts = begin.data.data;
      const publicKey: PublicKeyCredentialCreationOptions = {
        challenge: b64uToBytes(opts.challenge).buffer as ArrayBuffer,
        rp: opts.rp,
        user: {
          id: b64uToBytes(opts.user.id).buffer as ArrayBuffer,
          name: opts.user.name,
          displayName: opts.user.displayName,
        },
        pubKeyCredParams: opts.pubKeyCredParams,
        authenticatorSelection: opts.authenticatorSelection,
        timeout: opts.timeout,
        attestation: opts.attestation,
      };
      const cred = await navigator.credentials.create({ publicKey }) as PublicKeyCredential | null;
      if (!cred) throw new Error('credential creation cancelled');
      const att = cred.response as AuthenticatorAttestationResponse;
      // Ship the raw attestationObject + clientDataJSON. The server parses
      // the CBOR attestation, extracts the COSE public key, validates the
      // challenge from clientDataJSON, and stores it for later verification.
      const finish = await api.post('/auth-deep/webauthn/register/finish', {
        attestation_object_b64u: bytesToB64u(att.attestationObject),
        client_data_json_b64u: bytesToB64u(att.clientDataJSON),
        device_name: deviceName || ((navigator as any).userAgentData?.platform || 'Security key'),
        transports: att.getTransports?.() || [],
      });
      if (!finish.data.success) throw new Error(finish.data.error || 'finish failed');
      setAck('Passkey enrolled successfully');
      setDeviceName('');
      await load();
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'enrollment failed');
    } finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    if (!window.confirm('Revoke this passkey? You won\'t be able to use it for step-up auth.')) return;
    setBusy(true); setErr(null);
    try {
      await api.post(`/auth-deep/webauthn/credentials/${encodeURIComponent(id)}/revoke`);
      await load();
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'revoke failed'); }
    finally { setBusy(false); }
  };

  return (
    <StitchPage
      eyebrowIcon={Fingerprint}
      eyebrowLabel="Security · passkeys"
      title="Passkeys (WebAuthn / FIDO2)"
      subtitle="Hardware-backed credentials for step-up authentication on high-risk operations."
    >
      <div className="p-4 mb-4" style={{ background: 'var(--s1, oklch(0.99 0.002 80))', border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))', borderRadius: '12px' }}>
        <div className="text-[13px] font-semibold mb-1" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>Add a new passkey</div>
        <p className="text-[12px] mb-2" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>
          You'll be prompted by your browser to use a built-in authenticator (Touch ID, Windows Hello)
          or a roaming security key (YubiKey, Solo, etc.).
        </p>
        {!supported && <div className="text-[12px] mb-2" style={{ color: 'var(--bad, oklch(0.48 0.20 20))' }}>Your browser doesn't support WebAuthn.</div>}
        <div className="flex items-center gap-2">
          <input placeholder="Device name (optional)"
                 className="h-8 px-2 rounded text-[12px] flex-1 max-w-sm"
                 style={{ border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))', background: 'var(--s1, oklch(0.99 0.002 80))', color: 'var(--ink, oklch(0.17 0.010 250))' }}
                 value={deviceName} onChange={(e) => setDeviceName(e.target.value)}/>
          <button type="button" disabled={busy || !supported} onClick={enroll}
                  className="h-8 px-3 rounded text-white text-[12px] font-semibold disabled:opacity-50 inline-flex items-center gap-1"
                  style={{ background: 'var(--accent, oklch(0.46 0.16 55))' }}>
            <Fingerprint size={13}/> {busy ? 'Enrolling…' : 'Enrol passkey'}
          </button>
        </div>
        {err && <div className="text-[12px] mt-2 inline-flex items-center gap-1" style={{ color: 'var(--bad, oklch(0.48 0.20 20))' }}><AlertCircle size={13} className="inline mr-1"/>{err}</div>}
        {ack && <div className="text-[12px] mt-2 inline-flex items-center gap-1" style={{ color: 'var(--good, oklch(0.45 0.15 150))' }}><CheckCircle2 size={13} className="inline mr-1"/>{ack}</div>}
      </div>

      <div style={{ background: 'var(--s1, oklch(0.99 0.002 80))', border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))', borderRadius: '12px', overflow: 'hidden' }}>
        <header className="px-4 py-3 flex items-center" style={{ borderBottom: '1px solid var(--border-subtle, oklch(0.87 0.006 250))', background: 'var(--s1, oklch(0.96 0.003 250))' }}>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>Your passkeys</div>
          <button type="button" onClick={load} className="ml-auto h-8 px-2 rounded text-[11px] inline-flex items-center gap-1" style={{ border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))', color: 'var(--ink-2, oklch(0.40 0.009 250))', background: 'var(--s1, oklch(0.99 0.002 80))' }}><RefreshCw size={11}/>Refresh</button>
        </header>
        <ul>
          {creds.map((c) => (
            <li key={c.id} className="px-4 py-3 flex items-center gap-3" style={{ borderTop: '1px solid var(--border-subtle, oklch(0.91 0.005 250))' }}>
              <Fingerprint size={16} style={{ color: c.revoked_at ? 'var(--ink-2, oklch(0.60 0.007 250))' : 'var(--accent, oklch(0.46 0.16 55))' }}/>
              <div className="flex-1">
                <div className="font-semibold text-[13px]" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>{c.device_name}</div>
                <div className="text-[11px]" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }}>
                  Added {new Date(c.created_at).toLocaleDateString('en-ZA')}
                  {c.last_used_at && ` · last used ${new Date(c.last_used_at).toLocaleDateString('en-ZA')}`}
                  {c.revoked_at && ` · revoked ${new Date(c.revoked_at).toLocaleDateString('en-ZA')}`}
                </div>
              </div>
              {!c.revoked_at && (
                <button type="button" onClick={() => revoke(c.id)} className="text-[11px] underline inline-flex items-center gap-1" style={{ color: 'var(--bad, oklch(0.48 0.20 20))' }}>
                  <X size={11}/> Revoke
                </button>
              )}
            </li>
          ))}
          {creds.length === 0 && <li className="px-4 py-6 text-center text-[12px]" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }}>No passkeys enrolled yet.</li>}
        </ul>
      </div>
    </StitchPage>
  );
}
