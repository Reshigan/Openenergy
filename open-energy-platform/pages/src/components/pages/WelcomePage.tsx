// ════════════════════════════════════════════════════════════════════════
// WelcomePage — /welcome (public, no auth)
//
// The logged-out marketing landing for Open Energy. One scrolling page:
// hero → what it is → who it serves → why on-platform (the moat) →
// compliance → call to action → footer. Self-contained styling (this page
// stands apart from the authed app chrome); copy is real, credentials true.
// ════════════════════════════════════════════════════════════════════════

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Layers, Repeat, FileCheck2, ScanLine } from 'lucide-react';

// A committed dark hero, a cool near-white body — the current/signal accent is
// a teal-cyan, deliberately NOT the navy-and-gold fintech reflex.
const INK   = 'var(--ink, oklch(0.18 0.028 250))';
const INK2  = 'oklch(0.24 0.030 250)';
const PAPER = 'var(--s1, oklch(0.985 0.004 250))';
const CARD  = 'var(--s1, oklch(1 0 0))';
const BORDER= 'var(--border-subtle, oklch(0.88 0.006 250))';
const TX1   = 'var(--ink, oklch(0.19 0.012 250))';
const TX2   = 'var(--ink-2, oklch(0.42 0.010 250))';
const TX3   = 'var(--ink-2, oklch(0.60 0.008 250))';
const CUR   = 'oklch(0.70 0.135 195)';   // current — teal-cyan signal
const CURD  = 'oklch(0.55 0.13 200)';    // deeper current for text-on-light
const EMBER = 'oklch(0.74 0.15 62)';     // sparing warm accent

const SCOPE = [
  { k: 'Power trading', d: 'Continuous order book across energy types and delivery days, pre-trade gated and surveilled.' },
  { k: 'PPAs & offtake', d: 'Template-driven contracts drafted, e-signed and executed on-venue under the ECT Act.' },
  { k: 'Carbon & RECs', d: 'Certified issuance, serialised registry transfer, retirement — claims a buyer can resell.' },
  { k: 'IPP lifecycle', d: 'REIPPPP project delivery: WBS, EVM, document control, RFIs, change orders, stage gates.' },
  { k: 'Settlement', d: 'Imbalance, VWAP marks, margin, close-out netting — one net figure per counterparty.' },
  { k: 'Regulatory', d: 'Trade reporting, certified NERSA / FSCA / SARB exports, tamper-evident audit chain.' },
];

const ROLES = ['Trader', 'IPP', 'Offtaker', 'Lender', 'Carbon registry', 'Regulator', 'Grid operator', 'Wind / Solar', 'Support', 'Operator'];

const MOAT = [
  { icon: Repeat,     t: 'Netted settlement', d: 'One net figure per counterparty instead of gross bilateral cash movements and full per-trade credit exposure.' },
  { icon: FileCheck2, t: 'Certified issuance', d: 'Serialised, certified RECs and carbon units with on-registry transfer — off-platform claims are un-resellable.' },
  { icon: ScanLine,   t: 'Reconciliation', d: 'Nightly STRATE/SWIFT, ERP and government-filing sweeps surface off-venue activity as a break, not invisibly.' },
  { icon: Layers,     t: 'Certified exports', d: 'Regulator-ready NERSA / FSCA / SARB packs generated for you — no hand-built audit file per filing.' },
];

const CREDS = ['ERA 2006', 'NERSA Grid Code', 'POPIA', 'Financial Markets Act', 'Carbon Tax Act', 'REIPPPP', 'JSE-SRL'];

export function WelcomePage() {
  return (
    <div style={{ background: PAPER, color: TX1 }} className="min-h-screen">
      <style>{`
        @keyframes oe-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .oe-rise { animation: oe-rise 0.7s cubic-bezier(0.16,1,0.3,1) both; }
        .oe-d1 { animation-delay: 0.06s } .oe-d2 { animation-delay: 0.12s }
        .oe-d3 { animation-delay: 0.18s } .oe-d4 { animation-delay: 0.24s }
        .oe-cta { transition: transform .18s cubic-bezier(0.16,1,0.3,1), box-shadow .18s ease; }
        .oe-cta:hover { transform: translateY(-1px); }
        .oe-scope { transition: border-color .18s ease, transform .18s cubic-bezier(0.16,1,0.3,1); }
        .oe-scope:hover { border-color: ${CURD}; transform: translateY(-2px); }
        @media (prefers-reduced-motion: reduce) {
          .oe-rise { animation: none; } .oe-cta:hover, .oe-scope:hover { transform: none; }
        }
      `}</style>

      {/* ── Top nav ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 backdrop-blur" style={{ background: 'oklch(0.985 0.004 250 / 0.85)', borderBottom: `1px solid ${BORDER}` }}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-bold tracking-tight text-[16px]">
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: CUR, boxShadow: `0 0 12px ${CUR}` }} />
            Open Energy
          </div>
          <nav className="flex items-center gap-2 text-[13px]">
            <Link to="/legal" className="px-3 py-2 rounded-md font-medium" style={{ color: TX2 }}>Legal</Link>
            <Link to="/login" className="px-3 py-2 rounded-md font-semibold" style={{ color: TX1 }}>Sign in</Link>
            <Link to="/register" className="oe-cta px-3.5 py-2 rounded-md font-semibold text-white inline-flex items-center gap-1"
                  style={{ background: INK }}>
              Request access <ArrowRight size={14} />
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ background: INK, color: 'var(--s1, oklch(0.97 0.006 250))' }} className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0" style={{
          background: `radial-gradient(80% 120% at 78% -10%, ${CUR.replace(')', ' / 0.20)')}, transparent 60%), radial-gradient(60% 90% at 0% 110%, ${EMBER.replace(')', ' / 0.10)')}, transparent 55%)`,
        }} />
        <div className="relative max-w-6xl mx-auto px-6 py-20 lg:py-28">
          <div className="max-w-[46rem]">
            <div className="oe-rise inline-flex items-center gap-2 text-[12px] font-medium rounded-full px-3 py-1 mb-6"
                 style={{ color: CUR, background: 'oklch(1 0 0 / 0.06)', border: `1px solid oklch(1 0 0 / 0.12)` }}>
              <ShieldCheck size={13} /> Regulated South African energy exchange
            </div>
            <h1 className="oe-rise oe-d1 font-display font-bold tracking-tight leading-[1.03]"
                style={{ fontSize: 'clamp(2.4rem, 6vw, 4.4rem)', textWrap: 'balance' }}>
              Trade energy, carbon and capacity on one accountable venue.
            </h1>
            <p className="oe-rise oe-d2 mt-6 text-[16px] leading-relaxed" style={{ color: 'var(--border-strong, oklch(0.82 0.012 250))', maxWidth: '38rem' }}>
              Open Energy clears power, PPAs, carbon and the full IPP lifecycle end to end —
              matched, contracted, settled and audit-chained in one place. On-platform is the
              cheapest, most compliant and most defensible way to transact.
            </p>
            <div className="oe-rise oe-d3 mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="oe-cta inline-flex items-center gap-2 px-5 py-3 rounded-lg font-semibold text-[15px]"
                    style={{ background: CUR, color: INK, boxShadow: `0 8px 30px ${CUR.replace(')', ' / 0.35)')}` }}>
                Request access <ArrowRight size={16} />
              </Link>
              <Link to="/login" className="oe-cta inline-flex items-center px-5 py-3 rounded-lg font-semibold text-[15px]"
                    style={{ color: 'var(--s1, oklch(0.97 0.006 250))', border: `1px solid oklch(1 0 0 / 0.18)` }}>
                Sign in
              </Link>
            </div>
            <div className="oe-rise oe-d4 mt-10 flex flex-wrap gap-x-5 gap-y-2 text-[12px]" style={{ color: 'var(--ink-2, oklch(0.72 0.010 250))' }}>
              {CREDS.map((c) => <span key={c}>{c}</span>)}
            </div>
          </div>
        </div>
      </section>

      {/* ── What it is (scope) ───────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16 lg:py-20">
        <div className="max-w-2xl">
          <h2 className="font-display text-[28px] font-bold tracking-tight" style={{ textWrap: 'balance' }}>
            One exchange for the whole energy transaction
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed" style={{ color: TX2 }}>
            Not a trading screen bolted to a document store. Every object — from an order to a
            settlement to a regulator filing — is a governed state machine with server-side
            validation and an evidence chain.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SCOPE.map((s) => (
            <div key={s.k} className="oe-scope rounded-xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <div className="text-[15px] font-semibold" style={{ color: TX1 }}>{s.k}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: TX2 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Who it serves ─────────────────────────────────────────────────── */}
      <section style={{ background: INK2, color: 'var(--s1, oklch(0.96 0.006 250))' }}>
        <div className="max-w-6xl mx-auto px-6 py-16 lg:py-20 grid gap-10 lg:grid-cols-[1fr_1.3fr] items-center">
          <div>
            <h2 className="font-display text-[28px] font-bold tracking-tight" style={{ textWrap: 'balance' }}>
              Ten roles, one shared ledger
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed" style={{ color: 'var(--border-strong, oklch(0.80 0.012 250))' }}>
              Each participant sees the same transaction from their own side — a two-sided,
              cross-role thread — with role-scoped actions and full audit visibility.
            </p>
          </div>
          <ul className="flex flex-wrap gap-2.5">
            {ROLES.map((r) => (
              <li key={r} className="px-3.5 py-2 rounded-full text-[13px] font-medium"
                  style={{ background: 'oklch(1 0 0 / 0.07)', border: `1px solid oklch(1 0 0 / 0.12)`, color: 'oklch(0.92 0.008 250)' }}>
                {r}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Why on-platform (the moat) ────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16 lg:py-20">
        <div className="max-w-2xl">
          <h2 className="font-display text-[28px] font-bold tracking-tight" style={{ textWrap: 'balance' }}>
            Why everything clears here
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed" style={{ color: TX2 }}>
            We don't police participants — we make off-platform the expensive, exposed,
            non-compliant path. Four layers, each covering the next.
          </p>
        </div>
        <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {MOAT.map(({ icon: Icon, t, d }) => (
            <div key={t} className="flex gap-4">
              <div className="shrink-0 grid place-items-center rounded-lg" style={{ width: 40, height: 40, background: 'oklch(0.70 0.135 195 / 0.12)', color: CURD }}>
                <Icon size={19} />
              </div>
              <div>
                <div className="text-[15px] font-semibold" style={{ color: TX1 }}>{t}</div>
                <p className="mt-1 text-[13px] leading-relaxed" style={{ color: TX2 }}>{d}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-10 text-[13px]" style={{ color: TX3 }}>
          Participation terms carry an on-venue exclusivity clause for every covered product —
          see the <Link to="/legal" className="font-semibold underline" style={{ color: CURD }}>Terms of Service</Link>.
        </p>
      </section>

      {/* ── Compliance credentials ────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pb-4">
        <div className="rounded-2xl p-8 lg:p-10" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div className="text-[12px] font-semibold" style={{ color: EMBER }}>Aligned to South African market regulation</div>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            {CREDS.map((c) => (
              <span key={c} className="text-[15px] font-semibold" style={{ color: TX1 }}>{c}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA band ──────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
        <div className="rounded-2xl px-8 py-12 lg:px-14 lg:py-16 text-center relative overflow-hidden" style={{ background: INK, color: 'var(--s1, oklch(0.97 0.006 250))' }}>
          <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(60% 120% at 50% -20%, ${CUR.replace(')', ' / 0.22)')}, transparent 60%)` }} />
          <div className="relative">
            <h2 className="font-display font-bold tracking-tight mx-auto" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', textWrap: 'balance', maxWidth: '24ch' }}>
              Bring your energy business onto an accountable venue.
            </h2>
            <p className="mt-4 text-[15px] mx-auto" style={{ color: 'var(--border-strong, oklch(0.82 0.012 250))', maxWidth: '46ch' }}>
              Admission runs through onboarding and KYC. Request access and we'll take it from there.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 justify-center">
              <Link to="/register" className="oe-cta inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-[15px]"
                    style={{ background: CUR, color: INK }}>
                Request access <ArrowRight size={16} />
              </Link>
              <Link to="/login" className="oe-cta inline-flex items-center px-6 py-3 rounded-lg font-semibold text-[15px]"
                    style={{ color: 'var(--s1, oklch(0.97 0.006 250))', border: `1px solid oklch(1 0 0 / 0.18)` }}>
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${BORDER}` }}>
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row justify-between gap-4 text-[12px]" style={{ color: TX3 }}>
          <div className="flex items-center gap-2 font-display font-bold" style={{ color: TX1 }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: CUR }} /> Open Energy
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Link to="/legal" style={{ color: TX2 }}>Legal &amp; PAIA</Link>
            <Link to="/legal" style={{ color: TX2 }}>Privacy</Link>
            <Link to="/legal" style={{ color: TX2 }}>Terms</Link>
            <Link to="/login" style={{ color: TX2 }}>Sign in</Link>
          </div>
          <div>Open Energy (a Vantax product) · operated by GONXT Technology (Pty) Ltd</div>
        </div>
      </footer>
    </div>
  );
}
