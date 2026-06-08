// ════════════════════════════════════════════════════════════════════════
// PublicLegalPage — /legal (public, no auth)
//
// Public legal-information hub:
//   • PAIA s.14 manual (records held, info officer, request process)
//   • Retention policy register
//   • Submit a PAIA request (form -> POST /api/public/legal/paia-requests)
//   • Tariff applications + decisions (regulator-l5 public views)
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { Scale, FileText, ShieldCheck, Send, Gavel, AlertCircle, CheckCircle2 } from 'lucide-react';

type Manual = {
  title: string; generated_at: string;
  information_officer: { name: string; email: string; postal_address: string };
  regulator: { name: string; complaint_form: string; url: string };
  records_held: Array<{ record_type: string; purpose: string; retention_days: number; lawful_basis: string; legal_reference: string | null }>;
  sar_process: { request_endpoint: string; statutory_deadline_days: number; fee_note: string };
};

type App = { id: string; title: string; applicant_kind?: string; applicant_id?: string; submitted_at?: string; status: string; tariff_category?: string };
type Decision = { id: string; application_id?: string; decision: string; published_at?: string; effective_from?: string; reference?: string; summary?: string };

export function PublicLegalPage() {
  const [manual, setManual] = useState<Manual | null>(null);
  const [apps, setApps] = useState<App[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [tab, setTab] = useState<'overview' | 'paia' | 'applications' | 'decisions' | 'submit'>('overview');

  useEffect(() => {
    void fetch('/api/public/legal/paia-manual').then((r) => r.json()).then((j) => j.success && setManual(j.data)).catch(() => undefined);
    void fetch('/api/public/regulator/applications').then((r) => r.json()).then((j) => j.success && setApps(j.data || [])).catch(() => undefined);
    void fetch('/api/public/regulator/decisions').then((r) => r.json()).then((j) => j.success && setDecisions(j.data || [])).catch(() => undefined);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <header className="p-6 lg:p-10 pb-4">
        <div className="max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#6b7685] bg-white border border-[#dde4ec] rounded-full px-3 py-1 mb-2">
            <Scale size={12} /> Legal · public information
          </div>
          <h1 className="font-display text-[28px] font-bold tracking-tight leading-tight" style={{ color: 'var(--oe-on-surface)' }}>
            Public legal information
          </h1>
          <p className="text-[13px] text-[#3d4756] mt-1 max-w-3xl">
            Operated under POPIA, PAIA, ERA 2006, and the NERSA Grid Code. PAIA manual, retention register, tariff applications and published decisions.
          </p>
        </div>
      </header>

      <nav className="bg-white border-b border-[#dde4ec]">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 flex flex-wrap gap-1 py-2">
          {([
            ['overview', 'Overview', FileText],
            ['paia', 'PAIA manual', ShieldCheck],
            ['applications', 'Tariff applications', Gavel],
            ['decisions', 'Decisions', CheckCircle2],
            ['submit', 'Submit request', Send],
          ] as const).map(([key, label, Icon]) => (
            <button type="button"
              key={key}
              onClick={() => setTab(key)}
              className={`h-9 px-3 rounded-md text-[12px] font-semibold inline-flex items-center gap-1.5 ${
                tab === key ? 'bg-[#1a3a5c] text-white' : 'text-[#0f1c2e] hover:bg-[#eef2f7]'
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-6 lg:p-10 space-y-4">
        {tab === 'overview' && <Overview manual={manual} appCount={apps.length} decisionCount={decisions.length} />}
        {tab === 'paia' && <PaiaManual manual={manual} />}
        {tab === 'applications' && <Applications apps={apps} />}
        {tab === 'decisions' && <Decisions decisions={decisions} />}
        {tab === 'submit' && <SubmitForm />}

        <footer className="text-center text-[11px] text-[#6b7685] pt-2">
          Consolidated Energy Cockpit · oe.vantax.co.za · operated by GONXT Technology (Pty) Ltd
        </footer>
      </main>
    </div>
  );
}

function Overview({ manual, appCount, decisionCount }: { manual: Manual | null; appCount: number; decisionCount: number }) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Card title="PAIA records" value={manual?.records_held.length || 0} caption="record categories declared" />
      <Card title="Tariff applications" value={appCount} caption="currently published" />
      <Card title="Decisions" value={decisionCount} caption="published in the register" />
      <div className="md:col-span-3 widget-card p-4">
        <div className="text-[13px] font-semibold text-[#0f1c2e] mb-1">About this page</div>
        <p className="text-[12px] text-[#3a4658] leading-relaxed">
          This page is published under section 14 of the Promotion of Access to Information Act (PAIA, Act 2 of 2000)
          and section 18 of the Protection of Personal Information Act (POPIA, Act 4 of 2013). It documents the data
          held by the Consolidated Energy Cockpit (CEC), who to contact to request access or correction, and how tariff applications
          and regulator decisions are made available to the public.
        </p>
      </div>
    </section>
  );
}

function Card({ title, value, caption }: { title: string; value: number; caption: string }) {
  return (
    <div className="widget-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-[#6b7685]">{title}</div>
      <div className="text-[24px] font-bold text-[#0f1c2e]">{value}</div>
      <div className="text-[11px] text-[#6b7685]">{caption}</div>
    </div>
  );
}

function PaiaManual({ manual }: { manual: Manual | null }) {
  if (!manual) return <div className="widget-card p-6 text-center text-[12px] text-[#6b7685]">Loading manual…</div>;
  return (
    <section className="space-y-3">
      <div className="widget-card p-4">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">{manual.title}</div>
        <div className="text-[11px] text-[#6b7685] mt-0.5">Generated {new Date(manual.generated_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</div>
      </div>
      <div className="widget-card p-4">
        <div className="text-[13px] font-semibold text-[#0f1c2e] mb-2">Information Officer</div>
        <dl className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[12px]">
          <div><dt className="text-[#6b7685]">Name</dt><dd className="font-semibold text-[#0f1c2e]">{manual.information_officer.name}</dd></div>
          <div><dt className="text-[#6b7685]">Email</dt><dd className="font-mono text-[#0f1c2e]">{manual.information_officer.email}</dd></div>
          <div><dt className="text-[#6b7685]">Postal address</dt><dd className="text-[#0f1c2e]">{manual.information_officer.postal_address}</dd></div>
        </dl>
      </div>
      <div className="widget-card p-4">
        <div className="text-[13px] font-semibold text-[#0f1c2e] mb-2">Regulator</div>
        <dl className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[12px]">
          <div><dt className="text-[#6b7685]">Authority</dt><dd className="font-semibold text-[#0f1c2e]">{manual.regulator.name}</dd></div>
          <div><dt className="text-[#6b7685]">Form</dt><dd className="text-[#0f1c2e]">{manual.regulator.complaint_form}</dd></div>
          <div><dt className="text-[#6b7685]">Website</dt><dd className="font-mono text-[#0f1c2e]"><a className="underline" href={manual.regulator.url} target="_blank" rel="noreferrer">{manual.regulator.url}</a></dd></div>
        </dl>
      </div>
      <div className="widget-card">
        <header className="widget-card-header"><div className="widget-card-title">Records held</div></header>
        <div className="p-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[#6b7685]">
                <th className="py-1">Record type</th>
                <th className="py-1">Purpose</th>
                <th className="py-1">Lawful basis</th>
                <th className="py-1">Legal reference</th>
                <th className="py-1 text-right">Retention (days)</th>
              </tr>
            </thead>
            <tbody>
              {manual.records_held.length === 0 ? (
                <tr><td colSpan={5} className="py-2 italic text-[#6b7685]">No retention policies published yet.</td></tr>
              ) : manual.records_held.map((r) => (
                <tr key={r.record_type} className="border-t border-[#eef2f7]">
                  <td className="py-2 font-mono">{r.record_type}</td>
                  <td className="py-2">{r.purpose}</td>
                  <td className="py-2">{r.lawful_basis}</td>
                  <td className="py-2 text-[#6b7685]">{r.legal_reference || '—'}</td>
                  <td className="py-2 text-right font-mono">{r.retention_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="widget-card p-4 text-[12px] text-[#3a4658]">
        <div className="text-[13px] font-semibold text-[#0f1c2e] mb-1">How to request access</div>
        <p>{manual.sar_process.fee_note}</p>
        <p className="mt-1">Statutory response deadline: <span className="font-semibold">{manual.sar_process.statutory_deadline_days} days</span> from receipt.</p>
        <p className="mt-1">Submit through the form on the "Submit request" tab — or email <span className="font-mono">{manual.information_officer.email}</span>.</p>
      </div>
    </section>
  );
}

function Applications({ apps }: { apps: App[] }) {
  if (apps.length === 0) return <div className="widget-card p-6 text-center text-[12px] text-[#6b7685]">No tariff applications currently in the public register.</div>;
  return (
    <section className="widget-card">
      <header className="widget-card-header"><div className="widget-card-title">Tariff applications</div></header>
      <ul className="divide-y divide-[#eef2f7]">
        {apps.map((a) => (
          <li key={a.id} className="px-4 py-3">
            <div className="text-[13px] font-semibold text-[#0f1c2e]">{a.title}</div>
            <div className="text-[11px] text-[#6b7685] mt-0.5">
              {a.applicant_kind || 'applicant'}{a.applicant_id ? ` · ${a.applicant_id}` : ''}
              {a.tariff_category ? ` · ${a.tariff_category}` : ''}
              {a.submitted_at ? ` · submitted ${new Date(a.submitted_at).toLocaleDateString('en-ZA')}` : ''}
            </div>
            <div className="mt-1 inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#eef2f7] text-[#0f1c2e]">{a.status}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Decisions({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) return <div className="widget-card p-6 text-center text-[12px] text-[#6b7685]">No published decisions yet.</div>;
  return (
    <section className="widget-card">
      <header className="widget-card-header"><div className="widget-card-title">Published decisions</div></header>
      <ul className="divide-y divide-[#eef2f7]">
        {decisions.map((d) => (
          <li key={d.id} className="px-4 py-3">
            <div className="text-[13px] font-semibold text-[#0f1c2e]">{d.reference || d.id}</div>
            <div className="text-[11px] text-[#6b7685] mt-0.5">
              Decision: <span className="font-semibold uppercase">{d.decision}</span>
              {d.published_at ? ` · published ${new Date(d.published_at).toLocaleDateString('en-ZA')}` : ''}
              {d.effective_from ? ` · effective ${new Date(d.effective_from).toLocaleDateString('en-ZA')}` : ''}
            </div>
            {d.summary && <p className="text-[12px] text-[#3a4658] mt-1 leading-relaxed">{d.summary}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SubmitForm() {
  const [form, setForm] = useState({ requester_name: '', requester_email: '', subject: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setAck(null); setErr(null);
    try {
      const r = await fetch('/api/public/legal/paia-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || 'submission failed');
      setAck(j.data?.ack || 'Submitted.');
      setForm({ requester_name: '', requester_email: '', subject: '', body: '' });
    } catch (e: any) {
      setErr(e?.message || 'submission failed');
    } finally { setBusy(false); }
  };

  return (
    <section className="widget-card p-4 space-y-3">
      <div className="text-[13px] font-semibold text-[#0f1c2e]">Submit a PAIA / POPIA request</div>
      <p className="text-[12px] text-[#3a4658] leading-relaxed">
        Use this form to request access to or correction of information held about you. We will respond within 30 days.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-[11px] font-semibold text-[#3a4658]">
          Your name
          <input className="mt-1 w-full h-9 px-2 rounded border border-[#dde4ec] text-[12px]"
                 value={form.requester_name} onChange={(e) => setForm({ ...form, requester_name: e.target.value })}/>
        </label>
        <label className="text-[11px] font-semibold text-[#3a4658]">
          Your email
          <input type="email" className="mt-1 w-full h-9 px-2 rounded border border-[#dde4ec] text-[12px]"
                 value={form.requester_email} onChange={(e) => setForm({ ...form, requester_email: e.target.value })}/>
        </label>
        <label className="text-[11px] font-semibold text-[#3a4658] md:col-span-2">
          Subject
          <input className="mt-1 w-full h-9 px-2 rounded border border-[#dde4ec] text-[12px]"
                 value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}/>
        </label>
        <label className="text-[11px] font-semibold text-[#3a4658] md:col-span-2">
          Detailed request
          <textarea rows={6} className="mt-1 w-full p-2 rounded border border-[#dde4ec] text-[12px]"
                 value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}/>
        </label>
      </div>
      {ack && <div className="text-[12px] flex items-center gap-1 text-[#1a8a5b]"><CheckCircle2 size={14}/> {ack}</div>}
      {err && <div className="text-[12px] flex items-center gap-1 text-[#c0392b]"><AlertCircle size={14}/> {err}</div>}
      <button type="button" disabled={busy} onClick={submit}
              className="h-9 px-4 rounded bg-[#1a3a5c] text-white text-[12px] font-semibold inline-flex items-center gap-1 disabled:opacity-50">
        <Send size={13}/> {busy ? 'Submitting…' : 'Submit request'}
      </button>
    </section>
  );
}
