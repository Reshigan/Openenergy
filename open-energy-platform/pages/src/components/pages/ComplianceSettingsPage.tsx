// ════════════════════════════════════════════════════════════════════════
// ComplianceSettingsPage — /settings/compliance
//
// Tabs: MFA · KYC · POPIA self-service · Regulator reports (admins only)
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, Check, CheckCircle, Download, FileCheck, FileText, KeyRound,
  Lock, Loader2, RefreshCw, ShieldCheck, Trash2, UploadCloud, XCircle,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import { StitchPage } from '../StitchPage';

type Tab = 'mfa' | 'kyc' | 'popia' | 'regulator';

export function ComplianceSettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('mfa');
  const isAdmin = ['admin', 'support', 'regulator'].includes(user?.role || '');
  return (
    <StitchPage
      eyebrowIcon={ShieldCheck}
      eyebrowLabel="Compliance"
      title="Compliance &amp; security"
      subtitle="MFA, KYC, POPIA data rights, regulator reports. Aligned to NERSA, POPIA, FAIS."
    >
      <div className="border-b border-[#dde4ec] flex flex-wrap gap-1">
        {([
          { k: 'mfa',       label: 'MFA',                icon: <Lock size={13} /> },
          { k: 'kyc',       label: 'KYC',                icon: <FileCheck size={13} /> },
          { k: 'popia',     label: 'POPIA data rights',  icon: <ShieldCheck size={13} /> },
          ...(isAdmin ? [{ k: 'regulator' as Tab, label: 'Regulator packs', icon: <FileText size={13} /> }] : []),
        ] as Array<{ k: Tab; label: string; icon: React.ReactNode }>).map((t) => (
          <button type="button" key={t.k} onClick={() => setTab(t.k)}
            className={`h-10 px-4 text-[12px] font-semibold inline-flex items-center gap-1 border-b-2 transition-colors ${tab === t.k ? 'border-[#3b82c4] text-[#3b82c4]' : 'border-transparent text-[#6b7685] hover:text-[#0f1c2e]'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'mfa'       && <MfaTab />}
      {tab === 'kyc'       && <KycTab isAdmin={isAdmin} />}
      {tab === 'popia'     && <PopiaTab />}
      {tab === 'regulator' && isAdmin && <RegulatorTab />}
    </StitchPage>
  );
}

// ─── MFA Tab ─────────────────────────────────────────────────────────────
function MfaTab() {
  const [state, setState] = useState<any>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.get('/mfa/status').then((r) => setState(r.data?.data));
  useEffect(() => { void load(); }, []);

  const enroll = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.post('/mfa/enroll', {});
      setSecret(r.data?.data?.secret_b32);
      setOtpauth(r.data?.data?.otpauth_uri);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message);
    } finally { setBusy(false); }
  };

  const verify = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.post('/mfa/verify', { code: code.replace(/\s/g, '') });
      if (r.data?.data?.recovery_codes) setRecoveryCodes(r.data.data.recovery_codes);
      setOtpauth(null); setSecret(null); setCode('');
      void load();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'invalid code');
    } finally { setBusy(false); }
  };

  const reset = async () => {
    if (!confirm('Disable MFA on your account? Your recovery codes will be invalidated.')) return;
    await api.post('/mfa/reset', {});
    setRecoveryCodes(null);
    void load();
  };

  return (
    <div className="mt-3 space-y-3">
      <section className="widget-card p-4">
        <div className="flex items-center gap-2">
          <Lock size={16} className="text-[#3b82c4]" />
          <span className="text-[14px] font-semibold text-[#0f1c2e]">Two-factor authentication</span>
          {state?.verified
            ? <span className="ml-auto px-2 py-0.5 rounded text-[10px] widget-tone-good font-bold">ENABLED</span>
            : <span className="ml-auto px-2 py-0.5 rounded text-[10px] widget-tone-amber font-bold">DISABLED</span>}
        </div>
        <p className="text-[12px] text-[#3d4756] mt-2">
          TOTP-based MFA (RFC 6238). Compatible with Google Authenticator, Authy, 1Password, etc.
        </p>

        {!state?.verified && !otpauth && (
          <button type="button" onClick={enroll} disabled={busy}
                  className="mt-3 h-9 px-3 rounded bg-[#1a3a5c] text-white text-[12px] font-semibold disabled:opacity-50">
            {busy ? 'Enrolling…' : 'Enable MFA'}
          </button>
        )}

        {otpauth && secret && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 items-start">
            <div className="bg-white p-2 rounded border border-[#dde4ec] inline-block">
              <QRCodeSVG value={otpauth} size={180} bgColor="#ffffff" fgColor="#0f1c2e" />
            </div>
            <div className="space-y-2 text-[12px]">
              <div>
                <div className="text-[11px] text-[#6b7685] uppercase tracking-wider font-bold">1. Scan with your authenticator app</div>
                <div className="text-[11px] text-[#3d4756] mt-1">Or paste this secret manually:</div>
                <code className="block mt-1 font-mono text-[11px] bg-[#f8fafc] border border-[#dde4ec] px-2 py-1 rounded break-all">{secret}</code>
              </div>
              <div>
                <div className="text-[11px] text-[#6b7685] uppercase tracking-wider font-bold">2. Enter the 6-digit code</div>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123 456" autoComplete="one-time-code"
                       className="mt-1 h-9 w-32 px-2 rounded border border-[#dde4ec] font-mono text-[15px] tracking-widest" />
                <button type="button" onClick={verify} disabled={busy || code.length < 6}
                        className="ml-2 h-9 px-3 rounded bg-[#1a3a5c] text-white text-[12px] font-semibold disabled:opacity-50">
                  {busy ? 'Verifying…' : 'Verify'}
                </button>
              </div>
              {error && <div className="text-[11px] text-[#c0392b]">{error}</div>}
            </div>
          </div>
        )}

        {recoveryCodes && (
          <div className="mt-4 rounded-lg border border-[#1a8a5b] widget-tone-good p-3">
            <div className="text-[12px] font-bold widget-tone-good-text inline-flex items-center gap-1">
              <CheckCircle size={14} /> MFA enabled — save your recovery codes
            </div>
            <p className="text-[11px] text-[#3d4756] mt-1">
              Each code works once. Store them somewhere safe — they're the only way back in if you lose your authenticator.
            </p>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-1 font-mono text-[11px]">
              {recoveryCodes.map((c) => (
                <code key={c} className="block bg-white border border-[#dde4ec] px-2 py-1 rounded text-center">{c}</code>
              ))}
            </div>
            <button type="button" onClick={() => setRecoveryCodes(null)}
                    className="mt-2 h-8 px-3 rounded bg-[#1a3a5c] text-white text-[12px] font-semibold">
              I've saved them
            </button>
          </div>
        )}

        {state?.verified && !otpauth && (
          <div className="mt-3 space-y-2 text-[12px] text-[#3d4756]">
            <div>Recovery codes remaining: <strong>{state.recovery_codes_remaining}</strong></div>
            <div>Last used: <strong>{state.last_used_at ? new Date(state.last_used_at).toLocaleString() : 'never'}</strong></div>
            <button type="button" onClick={reset} className="h-8 px-3 rounded bg-white border border-[#c0392b] text-[#c0392b] text-[12px] font-semibold inline-flex items-center gap-1">
              <Trash2 size={12} /> Disable MFA
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── KYC Tab ─────────────────────────────────────────────────────────────
const DOC_LABELS: Record<string, string> = {
  id_document:          'ID document (RSA ID / passport)',
  proof_of_address:     'Proof of address (< 3 months old)',
  company_registration: 'Company registration (CIPC docs)',
  tax_clearance:        'Tax clearance certificate',
  bank_confirmation:    'Bank confirmation letter',
  nersa_licence:        'NERSA licence (if applicable)',
};

function KycTab({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [docType, setDocType] = useState('id_document');
  const [busy, setBusy] = useState(false);
  const [adminView, setAdminView] = useState(isAdmin);
  const load = () => api.get(`/kyc/submissions${adminView ? '?status=pending' : ''}`).then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, [adminView]);

  const submit = async (f: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('document_type', docType);
      fd.append('file', f);
      const r = await fetch('/api/kyc/submit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        body: fd,
      });
      if (!r.ok) throw new Error('upload failed');
      void load();
    } catch (e: any) { alert(e?.message || 'upload failed'); }
    finally { setBusy(false); }
  };

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    const notes = prompt(`${decision === 'rejected' ? 'Rejection' : 'Approval'} notes (optional):`) || '';
    await api.post(`/kyc/${id}/decide`, { decision, notes });
    void load();
  };

  return (
    <div className="mt-3 space-y-3">
      {isAdmin && (
        <div className="flex gap-2 text-[12px]">
          <button type="button" onClick={() => setAdminView(false)} className={`h-8 px-2.5 rounded-full text-[11px] font-semibold border ${!adminView ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]' : 'bg-white border-[#dde4ec]'}`}>My submissions</button>
          <button type="button" onClick={() => setAdminView(true)}  className={`h-8 px-2.5 rounded-full text-[11px] font-semibold border ${adminView ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]' : 'bg-white border-[#dde4ec]'}`}>Pending review queue</button>
        </div>
      )}
      {!adminView && (
        <section className="widget-card">
          <header className="widget-card-header">
            <div className="widget-card-title">Submit a document</div>
            <div className="widget-card-subtitle">PDF / JPG / PNG, max 10 MB. We use POPIA-compliant encrypted R2 storage.</div>
          </header>
          <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
            <select value={docType} onChange={(e) => setDocType(e.target.value)}
                    className="h-9 px-2 rounded border border-[#dde4ec] text-[12px]">
              {Object.entries(DOC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="h-9 px-3 rounded border border-dashed border-[#dde4ec] text-[12px] inline-flex items-center justify-center gap-1 cursor-pointer">
              <UploadCloud size={14} /> Choose file
              <input type="file" hidden accept="application/pdf,image/*" disabled={busy}
                     onChange={(e) => { const f = e.target.files?.[0]; if (f) void submit(f); e.currentTarget.value = ''; }} />
            </label>
            {busy && <span className="text-[11px] text-[#6b7685] inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Uploading…</span>}
          </div>
        </section>
      )}
      <section className="widget-card">
        <header className="widget-card-header">
          <div className="widget-card-title">{adminView ? 'Pending submissions' : 'My submissions'}</div>
          <button type="button" onClick={load} className="text-[11px] inline-flex items-center gap-1 text-[#3b82c4]"><RefreshCw size={11} /> Refresh</button>
        </header>
        <div className="p-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                {adminView && <th className="text-left">Participant</th>}
                <th className="text-left">Type</th><th className="text-left">File</th>
                <th className="text-left">Submitted</th><th className="text-left">Status</th>
                {adminView && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {adminView && <td className="text-[11px]">{r.participant_name || r.participant_id}</td>}
                  <td>{DOC_LABELS[r.document_type] || r.document_type}</td>
                  <td className="font-mono text-[11px]">{r.file_name || '—'}</td>
                  <td className="font-mono text-[11px]">{new Date(r.submitted_at).toLocaleString()}</td>
                  <td>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      r.status === 'approved' ? 'widget-tone-good' :
                      r.status === 'rejected' ? 'widget-tone-bad' :
                      r.status === 'pending'  ? 'widget-tone-amber' : 'widget-tone-info'
                    }`}>{r.status}</span>
                  </td>
                  {adminView && (
                    <td className="text-right space-x-2">
                      {r.status === 'pending' && (
                        <>
                          <button type="button" onClick={() => decide(r.id, 'approved')} className="text-[11px] text-[#1a8a5b] font-semibold">Approve</button>
                          <button type="button" onClick={() => decide(r.id, 'rejected')} className="text-[11px] text-[#c0392b] font-semibold">Reject</button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={adminView ? 6 : 5} className="text-[#6b7685] italic py-3">No submissions.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ─── POPIA Tab ───────────────────────────────────────────────────────────
function PopiaTab() {
  const [data, setData] = useState<{ exports: any[]; deletions: any[] }>({ exports: [], deletions: [] });
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/popia/requests').then((r) => setData(r.data?.data || { exports: [], deletions: [] }));
  useEffect(() => { void load(); }, []);

  const requestExport = async () => {
    setBusy(true);
    try { await api.post('/popia/export', {}); void load(); }
    finally { setBusy(false); }
  };
  const download = (id: string) => {
    window.location.href = `/api/popia/export/${id}/download`;
  };
  const requestErasure = async () => {
    const reason = prompt('Tell us why (optional):') || '';
    if (!confirm('This starts a 30-day cooling-off period. After 30 days your PII will be deleted (audit chains preserved). Proceed?')) return;
    setBusy(true);
    try {
      const r = await api.post('/popia/erasure', { reason }).catch((e: any) => e?.response);
      if (r?.data?.success === false) alert(r.data.error);
      void load();
    } finally { setBusy(false); }
  };
  const cancelErasure = async (id: string) => {
    await api.post(`/popia/erasure/${id}/cancel`, {});
    void load();
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section className="widget-card p-4">
          <div className="flex items-center gap-2">
            <Download size={16} className="text-[#3b82c4]" />
            <span className="text-[14px] font-semibold text-[#0f1c2e]">Section 23 — Right of access</span>
          </div>
          <p className="text-[12px] text-[#3d4756] mt-2">Download all personal information we hold about you in a portable JSON archive. Ready within seconds.</p>
          <button type="button" onClick={requestExport} disabled={busy}
                  className="mt-3 h-9 px-3 rounded bg-[#1a3a5c] text-white text-[12px] font-semibold disabled:opacity-50">
            {busy ? 'Generating…' : 'Request data export'}
          </button>
          <ul className="mt-3 divide-y divide-[#eef2f7] text-[11px]">
            {data.exports.map((e) => (
              <li key={e.id} className="py-2 flex items-center gap-2">
                <span className="font-mono text-[10px]">{new Date(e.requested_at).toLocaleString()}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${e.status === 'ready' ? 'widget-tone-good' : 'widget-tone-info'}`}>{e.status}</span>
                {e.status === 'ready' && (
                  <button type="button" onClick={() => download(e.id)} className="ml-auto text-[#3b82c4]">Download</button>
                )}
              </li>
            ))}
            {!data.exports.length && <li className="py-2 text-[#6b7685] italic">No requests yet.</li>}
          </ul>
        </section>
        <section className="widget-card p-4">
          <div className="flex items-center gap-2">
            <Trash2 size={16} className="text-[#c0392b]" />
            <span className="text-[14px] font-semibold text-[#0f1c2e]">Section 24 — Right to erasure</span>
          </div>
          <p className="text-[12px] text-[#3d4756] mt-2">Request deletion of your account. 30-day cooling-off before execution. Audit chains are preserved per POPIA s.14(2)(d) (legal obligation).</p>
          <button type="button" onClick={requestErasure} disabled={busy}
                  className="mt-3 h-9 px-3 rounded bg-white border border-[#c0392b] text-[#c0392b] text-[12px] font-semibold disabled:opacity-50">
            Request erasure
          </button>
          <ul className="mt-3 divide-y divide-[#eef2f7] text-[11px]">
            {data.deletions.map((d) => (
              <li key={d.id} className="py-2 flex items-center gap-2">
                <span className="font-mono text-[10px]">{new Date(d.requested_at).toLocaleString()}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${d.status === 'cooling_off' ? 'widget-tone-amber' : d.status === 'completed' ? 'widget-tone-bad' : 'widget-tone-info'}`}>{d.status.replace(/_/g, ' ')}</span>
                {d.status === 'cooling_off' && (
                  <>
                    <span className="text-[10px] text-[#6b7685]">deletes {new Date(d.scheduled_for).toLocaleDateString()}</span>
                    <button type="button" onClick={() => cancelErasure(d.id)} className="ml-auto text-[#3b82c4]">Cancel</button>
                  </>
                )}
              </li>
            ))}
            {!data.deletions.length && <li className="py-2 text-[#6b7685] italic">No requests yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

// ─── Regulator Tab (admin only) ──────────────────────────────────────────
function RegulatorTab() {
  const [nersa, setNersa] = useState<any[]>([]);
  const [sars, setSars] = useState<any[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [sarsType, setSarsType] = useState<'vat201' | 'irp6' | 'carbon_tax'>('vat201');
  const [sarsLabel, setSarsLabel] = useState(`${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const load = async () => {
    const [n, s] = await Promise.all([api.get('/regulator/nersa/quarterly'), api.get('/regulator/sars/reports')]);
    setNersa(n.data?.data || []);
    setSars(s.data?.data || []);
  };
  useEffect(() => { void load(); }, []);
  const generateNersa = async () => {
    await api.post('/regulator/nersa/quarterly', { year, quarter });
    void load();
  };
  const generateSars = async () => {
    await api.post('/regulator/sars/generate', { period_type: sarsType, period_label: sarsLabel });
    void load();
  };
  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section className="widget-card">
          <header className="widget-card-header">
            <div>
              <div className="widget-card-title">NERSA quarterly return</div>
              <div className="widget-card-subtitle">Aggregates trade_fills + participants + grid_outages. Per-trade audit chain verifiable via /api/audit/verify.</div>
            </div>
          </header>
          <div className="p-3 flex gap-2 items-center">
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-9 w-24 px-2 rounded border border-[#dde4ec] text-[12px] font-mono" />
            <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} className="h-9 px-2 rounded border border-[#dde4ec] text-[12px]">
              <option value={1}>Q1</option><option value={2}>Q2</option><option value={3}>Q3</option><option value={4}>Q4</option>
            </select>
            <button type="button" onClick={generateNersa} className="h-9 px-3 rounded bg-[#1a3a5c] text-white text-[12px] font-semibold">Generate</button>
          </div>
          <ul className="divide-y divide-[#eef2f7] text-[11px]">
            {nersa.map((r) => (
              <li key={r.id} className="px-3 py-2 flex items-center gap-2">
                <span className="font-mono">{r.year} Q{r.quarter}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${r.status === 'generated' ? 'widget-tone-good' : 'widget-tone-info'}`}>{r.status}</span>
                <span className="text-[#6b7685] ml-auto font-mono">{r.r2_key}</span>
              </li>
            ))}
            {!nersa.length && <li className="px-3 py-2 text-[#6b7685] italic">No quarterly returns yet.</li>}
          </ul>
        </section>
        <section className="widget-card">
          <header className="widget-card-header">
            <div>
              <div className="widget-card-title">SARS pack</div>
              <div className="widget-card-subtitle">VAT201 (output VAT), IRP6 provisional, or Carbon Tax. Figures from invoices + carbon_vintages.</div>
            </div>
          </header>
          <div className="p-3 flex gap-2 items-center">
            <select value={sarsType} onChange={(e) => setSarsType(e.target.value as any)} className="h-9 px-2 rounded border border-[#dde4ec] text-[12px]">
              <option value="vat201">VAT201</option>
              <option value="irp6">IRP6</option>
              <option value="carbon_tax">Carbon tax</option>
            </select>
            <input value={sarsLabel} onChange={(e) => setSarsLabel(e.target.value)} placeholder={sarsType === 'vat201' ? '2026/02' : '2026'} className="h-9 w-28 px-2 rounded border border-[#dde4ec] text-[12px] font-mono" />
            <button type="button" onClick={generateSars} className="h-9 px-3 rounded bg-[#1a3a5c] text-white text-[12px] font-semibold">Generate</button>
          </div>
          <ul className="divide-y divide-[#eef2f7] text-[11px]">
            {sars.map((r) => (
              <li key={r.id} className="px-3 py-2 flex items-center gap-2">
                <span className="font-mono">{r.period_type} · {r.period_label}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${r.status === 'generated' ? 'widget-tone-good' : 'widget-tone-info'}`}>{r.status}</span>
                <span className="text-[#6b7685] ml-auto font-mono">{r.r2_key}</span>
              </li>
            ))}
            {!sars.length && <li className="px-3 py-2 text-[#6b7685] italic">No SARS packs yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

export default ComplianceSettingsPage;
