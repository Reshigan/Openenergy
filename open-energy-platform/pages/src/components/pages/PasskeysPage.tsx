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
      <div className="widget-card p-4 mb-4">
        <div className="text-[13px] font-semibold text-[#0f1c2e] mb-1">Add a new passkey</div>
        <p className="text-[12px] text-[#3a4658] mb-2">
          You'll be prompted by your browser to use a built-in authenticator (Touch ID, Windows Hello)
          or a roaming security key (YubiKey, Solo, etc.).
        </p>
        {!supported && <div className="text-[12px] text-[#c0392b] mb-2">Your browser doesn't support WebAuthn.</div>}
        <div className="flex items-center gap-2">
          <input placeholder="Device name (optional)"
                 className="h-8 px-2 rounded border border-[#dde4ec] text-[12px] flex-1 max-w-sm"
                 value={deviceName} onChange={(e) => setDeviceName(e.target.value)}/>
          <button disabled={busy || !supported} onClick={enroll}
                  className="h-8 px-3 rounded bg-[#1a3a5c] text-white text-[12px] font-semibold disabled:opacity-50 inline-flex items-center gap-1">
            <Fingerprint size={13}/> {busy ? 'Enrolling…' : 'Enrol passkey'}
          </button>
        </div>
        {err && <div className="text-[12px] text-[#c0392b] mt-2"><AlertCircle size={13} className="inline mr-1"/>{err}</div>}
        {ack && <div className="text-[12px] text-[#1a8a5b] mt-2"><CheckCircle2 size={13} className="inline mr-1"/>{ack}</div>}
      </div>

      <div className="widget-card">
        <header className="widget-card-header flex items-center">
          <div className="widget-card-title">Your passkeys</div>
          <button onClick={load} className="ml-auto h-8 px-2 rounded border border-[#dde4ec] text-[11px] inline-flex items-center gap-1"><RefreshCw size={11}/>Refresh</button>
        </header>
        <ul className="divide-y divide-[#eef2f7]">
          {creds.map((c) => (
            <li key={c.id} className="px-4 py-3 flex items-center gap-3">
              <Fingerprint size={16} className={c.revoked_at ? 'text-[#6b7685]' : 'text-[#1a3a5c]'}/>
              <div className="flex-1">
                <div className="font-semibold text-[13px] text-[#0f1c2e]">{c.device_name}</div>
                <div className="text-[11px] text-[#6b7685]">
                  Added {new Date(c.created_at).toLocaleDateString('en-ZA')}
                  {c.last_used_at && ` · last used ${new Date(c.last_used_at).toLocaleDateString('en-ZA')}`}
                  {c.revoked_at && ` · revoked ${new Date(c.revoked_at).toLocaleDateString('en-ZA')}`}
                </div>
              </div>
              {!c.revoked_at && (
                <button onClick={() => revoke(c.id)} className="text-[11px] text-[#c0392b] underline inline-flex items-center gap-1">
                  <X size={11}/> Revoke
                </button>
              )}
            </li>
          ))}
          {creds.length === 0 && <li className="px-4 py-6 text-center text-[12px] text-[#6b7685]">No passkeys enrolled yet.</li>}
        </ul>
      </div>
    </StitchPage>
  );
}
