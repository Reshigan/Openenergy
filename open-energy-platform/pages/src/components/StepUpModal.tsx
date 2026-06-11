// ════════════════════════════════════════════════════════════════════════
// StepUpModal — a real second-factor challenge for high-risk operations.
//
// Flow:
//   1. Any axios call returning 401 + { error: 'step_up_required' } is
//      intercepted (see lib/api.ts). The interceptor opens this modal
//      with the op_type, then awaits the user's challenge result.
//   2. The user picks TOTP or passkey, completes it, and the modal POSTs
//      /api/auth-deep/mfa/challenge/verify. On success the server records
//      a step-up session and the modal resolves, letting the interceptor
//      retry the original request automatically.
//
// The modal mounts globally from App.tsx and listens to a tiny in-process
// event bus exposed by lib/stepUp.ts.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { Shield, Fingerprint, KeyRound, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { subscribeStepUp, resolveStepUp } from '../lib/stepUp';

function b64uToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function bytesToB64u(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function StepUpModal() {
  const [opType, setOpType] = useState<string | null>(null);
  const [method, setMethod] = useState<'totp' | 'webauthn' | 'recovery'>('totp');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);

  useEffect(() => {
    return subscribeStepUp((opt) => {
      setOpType(opt || '*');
      setMethod('totp');
      setCode('');
      setErr(null);
      setAck(null);
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (opType && e.key === 'Escape' && !busy) close(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [opType, busy]);

  if (!opType) return null;

  const close = (success: boolean) => {
    const target = opType;
    setOpType(null);
    resolveStepUp(target, success);
  };

  const verifyTotp = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/auth-deep/mfa/challenge/verify', { op_type: opType, method: 'totp', code });
      if (!r.data?.success) throw new Error(r.data?.error || 'invalid');
      setAck('Authenticated — retrying action…');
      setTimeout(() => close(true), 500);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'invalid');
    } finally { setBusy(false); }
  };

  const verifyRecovery = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/auth-deep/mfa/challenge/verify', { op_type: opType, method: 'recovery', code });
      if (!r.data?.success) throw new Error(r.data?.error || 'invalid');
      setAck('Recovery code accepted — retrying action…');
      setTimeout(() => close(true), 500);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'invalid');
    } finally { setBusy(false); }
  };

  const verifyPasskey = async () => {
    setBusy(true); setErr(null);
    try {
      if (!window.PublicKeyCredential) throw new Error('Your browser does not support WebAuthn');
      // Issue a fresh server challenge.
      const beginR = await api.post('/auth-deep/mfa/challenge', { op_type: opType });
      if (!beginR.data?.success) throw new Error(beginR.data?.error || 'challenge failed');
      // The challenge_id from the server is base64url — pass it straight to
      // the authenticator as the challenge bytes.
      const challengeStr: string = beginR.data.data.challenge_id;
      const challengeBytes = new TextEncoder().encode(challengeStr);
      // Copy into a fresh ArrayBuffer to satisfy the strict DOM lib types.
      const challengeBuf = new ArrayBuffer(challengeBytes.byteLength);
      new Uint8Array(challengeBuf).set(challengeBytes);
      const publicKey: PublicKeyCredentialRequestOptions = {
        challenge: challengeBuf,
        timeout: 60_000,
        userVerification: 'preferred',
        rpId: window.location.hostname,
      };
      const assertion = await navigator.credentials.get({ publicKey }) as PublicKeyCredential | null;
      if (!assertion) throw new Error('cancelled');
      const asResponse = assertion.response as AuthenticatorAssertionResponse;
      const credentialId = bytesToB64u(assertion.rawId);
      // Compute what the authenticator actually signed over: the challenge
      // it received was the TextEncoder-encoded ASCII of `challengeStr`,
      // and clientDataJSON.challenge will be the base64url of those bytes.
      const expectedChallenge = bytesToB64u(challengeBytes);
      const r = await api.post('/auth-deep/mfa/challenge/verify', {
        op_type: opType,
        method: 'webauthn',
        credential_id: credentialId,
        authenticator_data_b64u: bytesToB64u(asResponse.authenticatorData),
        client_data_json_b64u: bytesToB64u(asResponse.clientDataJSON),
        signature_b64u: bytesToB64u(asResponse.signature),
        expected_challenge: expectedChallenge,
      });
      if (!r.data?.success) throw new Error(r.data?.error || 'invalid');
      setAck('Passkey verified — retrying action…');
      setTimeout(() => close(true), 500);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'verification failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-4 border-b border-[#dde4ec] flex items-center justify-between">
          <div className="inline-flex items-center gap-2">
            <Shield size={18} style={{ color: 'oklch(0.46 0.16 55)' }}/>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#6b7685]">Step-up authentication</div>
              <div className="font-semibold text-[#0f1c2e]">Confirm a fresh second factor</div>
            </div>
          </div>
          <button type="button" onClick={() => close(false)} aria-label="Cancel"><X size={16}/></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-[12px] text-[#3a4658]">
            This action (<span className="font-mono">{opType}</span>) requires a fresh second factor — your session
            credentials alone aren't sufficient.
          </p>
          <div className="flex gap-1 text-[11px]">
            {([
              ['totp', 'Authenticator code', KeyRound],
              ['webauthn', 'Passkey', Fingerprint],
              ['recovery', 'Recovery code', Shield],
            ] as const).map(([k, label, Icon]) => (
              <button type="button" key={k} onClick={() => setMethod(k)}
                className={`flex-1 h-8 px-2 rounded inline-flex items-center justify-center gap-1 ${
                  method === k ? 'bg-[#c2873a] text-white' : 'border border-[#dde4ec] text-[#0f1c2e]'
                }`}>
                <Icon size={11}/> {label}
              </button>
            ))}
          </div>

          {method === 'totp' && (
            <>
              <label className="block text-[11px] font-semibold text-[#3a4658]">6-digit code from your authenticator app
                <input type="text" inputMode="numeric" autoFocus pattern="\d{6}" maxLength={6}
                       className="mt-1 w-full h-10 px-3 rounded border border-[#dde4ec] text-[18px] font-mono tracking-widest"
                       value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}/>
              </label>
              <button type="button" disabled={busy || code.length !== 6} onClick={verifyTotp}
                      className="w-full h-9 rounded bg-[#c2873a] text-white text-[13px] font-semibold disabled:opacity-50">
                {busy ? 'Verifying…' : 'Verify code'}
              </button>
            </>
          )}

          {method === 'webauthn' && (
            <>
              <p className="text-[12px] text-[#6b7685]">
                Use your registered passkey (Touch ID, Windows Hello, security key) when prompted.
              </p>
              <button type="button" disabled={busy} onClick={verifyPasskey}
                      className="w-full h-9 rounded bg-[#c2873a] text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50">
                <Fingerprint size={14}/> {busy ? 'Waiting for passkey…' : 'Use passkey'}
              </button>
            </>
          )}

          {method === 'recovery' && (
            <>
              <label className="block text-[11px] font-semibold text-[#3a4658]">One-time recovery code
                <input type="text" autoFocus
                       className="mt-1 w-full h-10 px-3 rounded border border-[#dde4ec] text-[14px] font-mono"
                       value={code} onChange={(e) => setCode(e.target.value)}/>
              </label>
              <button type="button" disabled={busy || !code} onClick={verifyRecovery}
                      className="w-full h-9 rounded bg-[#c2873a] text-white text-[13px] font-semibold disabled:opacity-50">
                {busy ? 'Verifying…' : 'Use recovery code'}
              </button>
            </>
          )}

          {err && <div className="text-[12px] text-[#c0392b] inline-flex items-center gap-1"><AlertCircle size={13}/> {err}</div>}
          {ack && <div className="text-[12px] text-[#1a8a5b] inline-flex items-center gap-1"><CheckCircle2 size={13}/> {ack}</div>}
        </div>
        <div className="p-3 border-t border-[#dde4ec] text-right">
          <button type="button" onClick={() => close(false)} className="h-8 px-3 text-[12px] text-[#6b7685]">Cancel</button>
        </div>
      </div>
    </div>
  );
}
