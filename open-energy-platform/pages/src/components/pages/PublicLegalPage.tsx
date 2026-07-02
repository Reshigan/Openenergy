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

const BG      = 'oklch(0.96 0.003 250)';
const BG1     = 'oklch(0.99 0.002 80)';
const BORDER  = 'oklch(0.87 0.006 250)';
const TX1     = 'oklch(0.17 0.010 250)';
const TX2     = 'oklch(0.40 0.009 250)';
const TX3     = 'oklch(0.60 0.007 250)';
const ACC     = 'oklch(0.46 0.12 230)';
const BAD     = 'oklch(0.48 0.20 20)';

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
    <div className="min-h-screen" style={{ background: BG }}>
      <header className="p-6 lg:p-10 pb-4">
        <div className="max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider rounded-full px-3 py-1 mb-2 border" style={{ color: TX3, background: BG1, borderColor: BORDER }}>
            <Scale size={12} /> Legal · public information
          </div>
          <h1 className="font-display text-[28px] font-bold tracking-tight leading-tight" style={{ color: TX1 }}>
            Public legal information
          </h1>
          <p className="text-[13px] mt-1 max-w-3xl" style={{ color: TX2 }}>
            Operated under POPIA, PAIA, ERA 2006, and the NERSA Grid Code. PAIA manual, retention register, tariff applications and published decisions.
          </p>
        </div>
      </header>

      <nav className="border-b" style={{ background: BG1, borderColor: BORDER }}>
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
              className="h-9 px-3 rounded-md text-[12px] font-semibold inline-flex items-center gap-1.5"
              style={tab === key ? { background: ACC, color: '#fff' } : { color: TX1 }}
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

        <footer className="text-center text-[11px] pt-2" style={{ color: TX3 }}>
          Open Energy (a Vantax product) · oe.vantax.co.za · operated by GONXT Technology (Pty) Ltd
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
        <div className="text-[13px] font-semibold mb-1" style={{ color: TX1 }}>About this page</div>
        <p className="text-[12px] leading-relaxed" style={{ color: TX2 }}>
          This page is published under section 14 of the Promotion of Access to Information Act (PAIA, Act 2 of 2000)
          and section 18 of the Protection of Personal Information Act (POPIA, Act 4 of 2013). It documents the data
          held by Open Energy (a Vantax product), who to contact to request access or correction, and how tariff applications
          and regulator decisions are made available to the public.
        </p>
      </div>
    </section>
  );
}

function Card({ title, value, caption }: { title: string; value: number; caption: string }) {
  return (
    <div className="widget-card p-4">
      <div className="text-[11px] uppercase tracking-wider" style={{ color: TX3 }}>{title}</div>
      <div className="text-[24px] font-bold" style={{ color: TX1 }}>{value}</div>
      <div className="text-[11px]" style={{ color: TX3 }}>{caption}</div>
    </div>
  );
}

function PaiaManual({ manual }: { manual: Manual | null }) {
  if (!manual) return <div className="widget-card p-6 text-center text-[12px]" style={{ color: TX3 }}>Loading manual…</div>;
  return (
    <section className="space-y-3">
      <div className="widget-card p-4">
        <div className="text-[13px] font-semibold" style={{ color: TX1 }}>{manual.title}</div>
        <div className="text-[11px] mt-0.5" style={{ color: TX3 }}>Generated {new Date(manual.generated_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</div>
      </div>
      <div className="widget-card p-4">
        <div className="text-[13px] font-semibold mb-2" style={{ color: TX1 }}>Information Officer</div>
        <dl className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[12px]">
          <div><dt style={{ color: TX3 }}>Name</dt><dd className="font-semibold" style={{ color: TX1 }}>{manual.information_officer.name}</dd></div>
          <div><dt style={{ color: TX3 }}>Email</dt><dd className="font-mono" style={{ color: TX1 }}>{manual.information_officer.email}</dd></div>
          <div><dt style={{ color: TX3 }}>Postal address</dt><dd style={{ color: TX1 }}>{manual.information_officer.postal_address}</dd></div>
        </dl>
      </div>
      <div className="widget-card p-4">
        <div className="text-[13px] font-semibold mb-2" style={{ color: TX1 }}>Regulator</div>
        <dl className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[12px]">
          <div><dt style={{ color: TX3 }}>Authority</dt><dd className="font-semibold" style={{ color: TX1 }}>{manual.regulator.name}</dd></div>
          <div><dt style={{ color: TX3 }}>Form</dt><dd style={{ color: TX1 }}>{manual.regulator.complaint_form}</dd></div>
          <div><dt style={{ color: TX3 }}>Website</dt><dd className="font-mono" style={{ color: TX1 }}><a className="underline" style={{ color: ACC }} href={manual.regulator.url} target="_blank" rel="noreferrer">{manual.regulator.url}</a></dd></div>
        </dl>
      </div>
      <div className="widget-card">
        <header className="widget-card-header"><div className="widget-card-title">Records held</div></header>
        <div className="p-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left" style={{ color: TX3 }}>
                <th className="py-1">Record type</th>
                <th className="py-1">Purpose</th>
                <th className="py-1">Lawful basis</th>
                <th className="py-1">Legal reference</th>
                <th className="py-1 text-right">Retention (days)</th>
              </tr>
            </thead>
            <tbody>
              {manual.records_held.length === 0 ? (
                <tr><td colSpan={5} className="py-2 italic" style={{ color: TX3 }}>No retention policies published yet.</td></tr>
              ) : manual.records_held.map((r) => (
                <tr key={r.record_type} className="border-t" style={{ borderColor: BORDER }}>
                  <td className="py-2 font-mono">{r.record_type}</td>
                  <td className="py-2">{r.purpose}</td>
                  <td className="py-2">{r.lawful_basis}</td>
                  <td className="py-2" style={{ color: TX3 }}>{r.legal_reference || '—'}</td>
                  <td className="py-2 text-right font-mono">{r.retention_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="widget-card p-4 text-[12px]" style={{ color: TX2 }}>
        <div className="text-[13px] font-semibold mb-1" style={{ color: TX1 }}>How to request access</div>
        <p>{manual.sar_process.fee_note}</p>
        <p className="mt-1">Statutory response deadline: <span className="font-semibold">{manual.sar_process.statutory_deadline_days} days</span> from receipt.</p>
        <p className="mt-1">Submit through the form on the "Submit request" tab — or email <span className="font-mono">{manual.information_officer.email}</span>.</p>
      </div>
    </section>
  );
}

function Applications({ apps }: { apps: App[] }) {
  if (apps.length === 0) return <div className="widget-card p-6 text-center text-[12px]" style={{ color: TX3 }}>No tariff applications currently in the public register.</div>;
  return (
    <section className="widget-card">
      <header className="widget-card-header"><div className="widget-card-title">Tariff applications</div></header>
      <ul className="divide-y" style={{ borderColor: BORDER }}>
        {apps.map((a) => (
          <li key={a.id} className="px-4 py-3">
            <div className="text-[13px] font-semibold" style={{ color: TX1 }}>{a.title}</div>
            <div className="text-[11px] mt-0.5" style={{ color: TX3 }}>
              {a.applicant_kind || 'applicant'}{a.applicant_id ? ` · ${a.applicant_id}` : ''}
              {a.tariff_category ? ` · ${a.tariff_category}` : ''}
              {a.submitted_at ? ` · submitted ${new Date(a.submitted_at).toLocaleDateString('en-ZA')}` : ''}
            </div>
            <div className="mt-1 inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded" style={{ background: 'oklch(0.93 0.005 250)', color: TX1 }}>{a.status}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Decisions({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) return <div className="widget-card p-6 text-center text-[12px]" style={{ color: TX3 }}>No published decisions yet.</div>;
  return (
    <section className="widget-card">
      <header className="widget-card-header"><div className="widget-card-title">Published decisions</div></header>
      <ul className="divide-y" style={{ borderColor: BORDER }}>
        {decisions.map((d) => (
          <li key={d.id} className="px-4 py-3">
            <div className="text-[13px] font-semibold" style={{ color: TX1 }}>{d.reference || d.id}</div>
            <div className="text-[11px] mt-0.5" style={{ color: TX3 }}>
              Decision: <span className="font-semibold uppercase">{d.decision}</span>
              {d.published_at ? ` · published ${new Date(d.published_at).toLocaleDateString('en-ZA')}` : ''}
              {d.effective_from ? ` · effective ${new Date(d.effective_from).toLocaleDateString('en-ZA')}` : ''}
            </div>
            {d.summary && <p className="text-[12px] mt-1 leading-relaxed" style={{ color: TX2 }}>{d.summary}</p>}
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
      <div className="text-[13px] font-semibold" style={{ color: TX1 }}>Submit a PAIA / POPIA request</div>
      <p className="text-[12px] leading-relaxed" style={{ color: TX2 }}>
        Use this form to request access to or correction of information held about you. We will respond within 30 days.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-[11px] font-semibold" style={{ color: TX2 }}>
          Your name
          <input className="mt-1 w-full h-9 px-2 rounded border text-[12px]"
                 style={{ borderColor: BORDER, background: BG1 }}
                 value={form.requester_name} onChange={(e) => setForm({ ...form, requester_name: e.target.value })}/>
        </label>
        <label className="text-[11px] font-semibold" style={{ color: TX2 }}>
          Your email
          <input type="email" className="mt-1 w-full h-9 px-2 rounded border text-[12px]"
                 style={{ borderColor: BORDER, background: BG1 }}
                 value={form.requester_email} onChange={(e) => setForm({ ...form, requester_email: e.target.value })}/>
        </label>
        <label className="text-[11px] font-semibold md:col-span-2" style={{ color: TX2 }}>
          Subject
          <input className="mt-1 w-full h-9 px-2 rounded border text-[12px]"
                 style={{ borderColor: BORDER, background: BG1 }}
                 value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}/>
        </label>
        <label className="text-[11px] font-semibold md:col-span-2" style={{ color: TX2 }}>
          Detailed request
          <textarea rows={6} className="mt-1 w-full p-2 rounded border text-[12px]"
                 style={{ borderColor: BORDER, background: BG1 }}
                 value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}/>
        </label>
      </div>
      {ack && <div className="text-[12px] flex items-center gap-1" style={{ color: 'oklch(0.45 0.15 150)' }}><CheckCircle2 size={14}/> {ack}</div>}
      {err && <div className="text-[12px] flex items-center gap-1" style={{ color: BAD }}><AlertCircle size={14}/> {err}</div>}
      <button type="button" disabled={busy} onClick={submit}
              className="h-9 px-4 rounded text-white text-[12px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
              style={{ background: ACC }}>
        <Send size={13}/> {busy ? 'Submitting…' : 'Submit request'}
      </button>
    </section>
  );
}
