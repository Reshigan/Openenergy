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
import { Scale, FileText, ShieldCheck, Send, Gavel, AlertCircle, CheckCircle2, Lock, BookOpen } from 'lucide-react';

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
  const [tab, setTab] = useState<'overview' | 'privacy' | 'terms' | 'paia' | 'applications' | 'decisions' | 'submit'>('overview');

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
            ['privacy', 'Privacy policy', Lock],
            ['terms', 'Terms of service', BookOpen],
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
        {tab === 'privacy' && <PrivacyPolicy officer={manual?.information_officer} />}
        {tab === 'terms' && <TermsOfService />}
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

// ── Long-form legal documents ──────────────────────────────────────────────
// A single readable reading column. Sections are numbered because these ARE
// numbered legal instruments (a real sequence, not decorative scaffolding).

const EFFECTIVE = '12 July 2026';

function LegalDoc({ title, subtitle, updated, children }: { title: string; subtitle: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="widget-card p-6 lg:p-8">
      <div className="max-w-[70ch] mx-auto">
        <h2 className="font-display text-[22px] font-bold tracking-tight" style={{ color: TX1 }}>{title}</h2>
        <p className="text-[12px] mt-1" style={{ color: TX2 }}>{subtitle}</p>
        <p className="text-[11px] mt-0.5" style={{ color: TX3 }}>Effective {updated}</p>
        <div className="mt-5 space-y-5">{children}</div>
      </div>
    </article>
  );
}

function Sec({ n, heading, children }: { n: number; heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[13px] font-bold mb-1.5" style={{ color: TX1 }}>{n}. {heading}</h3>
      <div className="text-[12.5px] leading-relaxed space-y-2" style={{ color: TX2 }}>{children}</div>
    </section>
  );
}

function PrivacyPolicy({ officer }: { officer?: Manual['information_officer'] }) {
  return (
    <LegalDoc
      title="Privacy Policy"
      subtitle="How Open Energy processes personal information under the Protection of Personal Information Act 4 of 2013 (POPIA)."
      updated={EFFECTIVE}
    >
      <Sec n={1} heading="Who we are (Responsible Party)">
        <p>
          Open Energy is a product operated by GONXT Technology (Pty) Ltd ("we", "us", the "Responsible Party"),
          which runs the energy-exchange platform at <span className="font-mono">oe.vantax.co.za</span>. We are the
          Responsible Party for personal information processed on the platform, as defined in section 1 of POPIA.
        </p>
        {officer && (
          <p>
            Our Information Officer is <span className="font-semibold" style={{ color: TX1 }}>{officer.name}</span>,
            reachable at <span className="font-mono">{officer.email}</span> ({officer.postal_address}). The
            Information Officer is registered with the Information Regulator (South Africa) and handles all access,
            correction, and objection requests.
          </p>
        )}
      </Sec>

      <Sec n={2} heading="What we collect">
        <p>We process the minimum personal information needed to operate a regulated energy exchange:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><span className="font-semibold" style={{ color: TX1 }}>Identity &amp; account</span> — name, work email, role, employer/participant entity, and authentication credentials.</li>
          <li><span className="font-semibold" style={{ color: TX1 }}>KYC / onboarding</span> — company registration, director details, and regulatory licences supplied to admit a participant.</li>
          <li><span className="font-semibold" style={{ color: TX1 }}>Transaction records</span> — orders, trades, contracts, settlement and audit-chain entries you author on the platform.</li>
          <li><span className="font-semibold" style={{ color: TX1 }}>Technical</span> — IP address, device/browser metadata, and access logs used for security and abuse prevention.</li>
        </ul>
        <p>We do not collect special personal information (POPIA s26) or children's information; the platform is a business-to-business venue for admitted participants only.</p>
      </Sec>

      <Sec n={3} heading="Lawful basis &amp; purpose (POPIA s11)">
        <p>Each processing purpose rests on a lawful basis:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><span className="font-semibold" style={{ color: TX1 }}>Performance of the participation agreement</span> — operating your account, matching, clearing and settlement.</li>
          <li><span className="font-semibold" style={{ color: TX1 }}>Legal obligation</span> — trade reporting, tax and regulatory filings (NERSA, FSCA, SARS, SARB) required of a licensed venue.</li>
          <li><span className="font-semibold" style={{ color: TX1 }}>Legitimate interest</span> — surveillance, fraud/abuse prevention, and platform security, balanced against your rights.</li>
          <li><span className="font-semibold" style={{ color: TX1 }}>Consent</span> — where none of the above applies, we process only with your consent, which you may withdraw.</li>
        </ul>
      </Sec>

      <Sec n={4} heading="Who we share it with">
        <p>
          We share personal information only where necessary: with counterparties to a transaction you enter (limited to
          what the transaction requires), with regulators and market infrastructure (STRATE, SWIFT, the Information
          Regulator, NERSA, FSCA, SARB) where the law compels disclosure, and with vetted operators (Operator
          personnel) acting under a written mandate. We do not sell personal information.
        </p>
      </Sec>

      <Sec n={5} heading="Cross-border transfers (POPIA s72)">
        <p>
          Platform data is hosted on the Cloudflare edge network, which may process data outside South Africa. Where
          personal information leaves the Republic, we rely on the s72 grounds — the recipient is bound by law,
          binding corporate rules, or a contract providing adequate protection substantially similar to POPIA — or on
          your consent.
        </p>
      </Sec>

      <Sec n={6} heading="Retention">
        <p>
          We keep personal information only as long as the purpose or the law requires — see the retention register on
          the "PAIA manual" tab for per-record-type periods. Regulated trade, settlement, and audit records are
          retained for the statutory minimum (typically five years) and then de-identified or destroyed.
        </p>
      </Sec>

      <Sec n={7} heading="Your rights (POPIA ss23–25)">
        <p>You may, free of charge, request confirmation of whether we hold your information, request access to it, and
          request that we correct or delete information that is inaccurate, irrelevant, excessive, or unlawfully held.
          You may object to processing and, where processing was based on consent, withdraw that consent. Use the
          "Submit request" tab or email the Information Officer. We respond within 30 days.</p>
      </Sec>

      <Sec n={8} heading="Security safeguards (POPIA s19)">
        <p>
          We protect personal information with technical and organisational measures appropriate to the risk:
          transport encryption, scoped role-based access, tenant isolation, an append-only tamper-evident audit chain,
          and continuous surveillance. If a security compromise affects your personal information, we notify you and the
          Information Regulator as required by POPIA s22 (see the <span className="font-mono">data_breach_notification</span> workflow).
        </p>
      </Sec>

      <Sec n={9} heading="Cookies">
        <p>
          We use a single first-party token in your browser's local storage to keep you signed in. We do not use
          third-party advertising or cross-site tracking cookies.
        </p>
      </Sec>

      <Sec n={10} heading="Complaints">
        <p>
          If you are unhappy with how we handle your information, contact the Information Officer first. You may also
          complain to the Information Regulator (South Africa), JD House, 27 Stiemens Street, Braamfontein,
          Johannesburg 2001 — <span className="font-mono">complaints.IR@justice.gov.za</span>.
        </p>
      </Sec>

      <Sec n={11} heading="Changes">
        <p>We may update this policy; the effective date above marks the current version. Material changes are notified in-platform.</p>
      </Sec>
    </LegalDoc>
  );
}

function TermsOfService() {
  return (
    <LegalDoc
      title="Terms of Service (Participation Terms)"
      subtitle="The agreement governing access to and use of the Open Energy platform by admitted participants."
      updated={EFFECTIVE}
    >
      <Sec n={1} heading="Acceptance &amp; eligibility">
        <p>
          These Participation Terms form a binding agreement between you (and the participant entity you represent) and
          GONXT Technology (Pty) Ltd, operator of Open Energy. Access is limited to entities admitted through onboarding
          and KYC. By accessing the platform you warrant that you are authorised to bind your entity and that its
          regulatory licences are valid and current.
        </p>
      </Sec>

      <Sec n={2} heading="Accounts &amp; security">
        <p>
          You are responsible for all activity under your credentials. Keep them confidential, use the roles assigned to
          you, and notify us immediately of any suspected compromise. We may suspend access on reasonable suspicion of
          unauthorised use or a compliance breach.
        </p>
      </Sec>

      <Sec n={3} heading="On-venue exclusivity — all covered transactions clear on the platform">
        <p className="font-semibold" style={{ color: TX1 }}>
          This clause is the core bargain of participation. Read it carefully.
        </p>
        <p>
          For every product, instrument, or asset class you are admitted to trade on the platform (each a "Covered
          Product"), you agree to originate, execute, clear, and settle <span className="font-semibold" style={{ color: TX1 }}>all</span> transactions
          in that Covered Product exclusively on the platform. You will not enter, or cause a related party to enter,
          any off-platform, bilateral, or "side" transaction in a Covered Product with another participant that has the
          purpose or effect of moving that trade off the venue.
        </p>
        <p>
          This exclusivity rides your executed master agreements (<span className="font-mono">contract_execution</span>,
          <span className="font-mono"> isda_agreement</span>, <span className="font-mono">ppa_contract</span>) as a term
          of each, and is a condition of continued access. Trading a Covered Product off-venue is a material breach of
          these Terms and of that master agreement, independently actionable, and resolved through the platform's
          <span className="font-mono"> dispute_resolution</span> process under the Arbitration Act 15 of 2017.
        </p>
        <p>
          We enforce this economically (netting, certification, and certified regulatory exports are available only
          on-platform), through regulatory reconciliation (nightly STRATE/SWIFT, ERP, and government-filing sweeps
          surface off-venue activity as a reconciliation break), and contractually through this clause. Nothing here
          requires you to trade a product you are not admitted to, or prevents you from trading products outside the
          Covered Product set.
        </p>
      </Sec>

      <Sec n={4} heading="Trading conduct">
        <p>
          You will comply with the ERA 2006, the NERSA Grid Code, the Financial Markets Act, and all applicable market-
          conduct rules. Market abuse — manipulation, spoofing, wash trading, or trading on material non-public
          information — is prohibited and monitored by continuous surveillance. Orders are subject to pre-trade gating
          (credit, exposure, mark age, halt, and KYC checks); a rejected order is not a platform fault.
        </p>
      </Sec>

      <Sec n={5} heading="Settlement, custody &amp; fees">
        <p>
          Value and certificates settle against platform-held custody and the settlement primitives described in the
          platform documentation. Platform, subscription, and per-transaction charges are billed as published in your
          participation schedule. Late payment attracts the fees and dunning steps set out there.
        </p>
      </Sec>

      <Sec n={6} heading="Intellectual property">
        <p>
          The platform, its software, chain models, and content are owned by GONXT Technology (Pty) Ltd or its
          licensors. You receive a non-exclusive, non-transferable right to use the platform for its intended purpose
          while admitted. You retain ownership of the data you submit and grant us the licence needed to operate the
          venue and meet our legal obligations.
        </p>
      </Sec>

      <Sec n={7} heading="Disclaimers &amp; limitation of liability">
        <p>
          The platform is provided on a commercially reasonable, "as available" basis. We do not warrant uninterrupted
          operation and are not liable for market losses, the acts of counterparties, or events beyond our reasonable
          control. To the extent permitted by law, our aggregate liability is limited to the platform fees you paid in
          the three months before the event giving rise to the claim. Nothing limits liability that cannot lawfully be
          limited.
        </p>
      </Sec>

      <Sec n={8} heading="Suspension &amp; termination">
        <p>
          We may suspend or terminate access for breach of these Terms (including the on-venue exclusivity clause), loss
          of regulatory standing, or non-payment. On termination your open positions are closed out and settled per the
          platform's close-out and netting rules; obligations that by their nature survive (confidentiality, accrued
          fees, dispute resolution) continue.
        </p>
      </Sec>

      <Sec n={9} heading="Governing law &amp; dispute resolution">
        <p>
          These Terms are governed by the law of the Republic of South Africa. Disputes are referred to arbitration
          under the Arbitration Act 15 of 2017, administered through the platform's <span className="font-mono">dispute_resolution</span> chain,
          seated in Johannesburg, in English. This does not prevent either party from seeking urgent interim relief from
          a competent court.
        </p>
      </Sec>

      <Sec n={10} heading="Changes">
        <p>We may amend these Terms; the effective date marks the current version and continued use constitutes acceptance. Material changes are notified in-platform before they take effect.</p>
      </Sec>
    </LegalDoc>
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
