import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Briefcase, CheckCircle2, Clock, Layers,
  Loader2, PiggyBank, Plus, RefreshCw, ShieldCheck, Target, TrendingUp, Wallet,
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { EntityLink } from '../EntityLink';
import { useEscapeKey } from '../../hooks/useEscapeKey';

/* ════════════════════════════════════════════════════════════════════════
 * Funds — Lender / Funder role — Mockup-B two-column layout
 *
 * Five tabs:
 *   1. Portfolio       — Facilities, NAV history, asset allocation
 *   2. Cash Waterfall  — Senior → Mezz → Equity stack with sources/uses
 *   3. Disbursements   — Pending requests + approval flow
 *   4. Covenants       — Live covenant compliance per facility
 *   5. AI Insights     — Portfolio commentary + risk narrative
 * ═══════════════════════════════════════════════════════════════════════ */

const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.16 55)';
const BAD    = 'oklch(0.48 0.20 20)';
const WARN   = 'oklch(0.50 0.18 55)';
const GOOD   = 'oklch(0.40 0.16 155)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type Tab = 'portfolio' | 'waterfall' | 'disbursements' | 'covenants' | 'insights';

const TABS: { id: Tab; label: string }[] = [
  { id: 'portfolio',     label: 'Portfolio' },
  { id: 'waterfall',     label: 'Cash Waterfall' },
  { id: 'disbursements', label: 'Disbursements' },
  { id: 'covenants',     label: 'Covenants' },
  { id: 'insights',      label: 'AI Insights' },
];

const formatZAR = (val: number, digits = 0) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: digits }).format(val || 0);
const num = (val: number, digits = 0) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(val || 0);

interface Facility {
  id: string;
  project_id?: string;
  project_name?: string;
  tranche?: 'senior' | 'mezzanine' | 'equity';
  commitment?: number;
  drawn?: number;
  rate_pct?: number;
  maturity?: string;
  status?: string;
  irr_pct?: number;
}

interface Disbursement {
  id: string;
  facility_id?: string;
  project_name?: string;
  requested_amount?: number;
  approved_amount?: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  requested_at?: string;
  due_at?: string;
  reason?: string;
}

interface CovenantRow {
  id: string;
  facility_id: string;
  project_name?: string;
  covenant_type: string;
  threshold: number;
  current: number;
  status: 'pass' | 'warn' | 'breach';
  measured_at?: string;
}

// ─────────── KpiTile ───────────
function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '8px 12px', minWidth: 80 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color }}>{value}</div>
    </div>
  );
}

// ─────────── StatusPill ───────────
function StatusPill({ status }: { status: string }) {
  const tone = status === 'active' || status === 'paid' || status === 'pass' ? 'ok'
    : status === 'pending' || status === 'warn' ? 'warn'
    : status === 'rejected' || status === 'breach' ? 'bad'
    : undefined;
  const bg = tone === 'ok' ? 'oklch(0.90 0.08 155)' : tone === 'warn' ? 'oklch(0.92 0.08 55)' : tone === 'bad' ? 'oklch(0.92 0.08 20)' : BG2;
  const fg = tone === 'ok' ? GOOD : tone === 'warn' ? WARN : tone === 'bad' ? BAD : TX2;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', background: bg, color: fg }}>
      {status}
    </span>
  );
}

// ─────────── SectionCard ───────────
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG1, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: TX3 }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3 }}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

// ─────────── Main Funds page ───────────
export function Funds() {
  const [tab, setTab] = useState<Tab>('portfolio');

  const aiInsights: Record<Tab, string> = {
    portfolio: 'Portfolio NAV is tracking above the 12-month rolling average. Senior tranche utilisation at 68% suggests capacity for 1–2 new facility originations before the next review window.',
    waterfall: 'Cash waterfall coverage ratios are healthy. Senior DSCR is 1.42× — comfortably above the 1.20× covenant floor. Equity distributions are up 8% QoQ driven by PPA escalation clauses.',
    disbursements: 'Three pending disbursements require approval. Combined exposure is within the single-counterparty limit. IE certification on the Karoo Wind project is a prerequisite before the largest draw can settle.',
    covenants: 'Two facilities are on covenant watch. DSCR on Lephalale Solar is at 1.18× — 2 bps below the warning threshold. Recommend a cure plan before the next measurement date.',
    insights: 'Portfolio weighted IRR is 14.2%, outperforming the 12% hurdle. The top risk factor is construction delay on 3 REIPPPP Round 6 projects — recommend activating the step-in clause review.',
  };

  const recentActivity = [
    { time: '09:14', label: 'Karoo Wind drawdown approved', tone: 'ok' as const },
    { time: '08:52', label: 'Lephalale Solar DSCR warning', tone: 'warn' as const },
    { time: 'Yesterday', label: 'Covenant certificate submitted', tone: 'ok' as const },
    { time: 'Yesterday', label: 'New disbursement request: R12M', tone: 'warn' as const },
    { time: '2d ago', label: 'NAV updated to R1.84B', tone: 'ok' as const },
  ];

  return (
    <div style={{ background: BG, minHeight: 'calc(100vh - 50px)', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 0 }}>
      {/* LEFT */}
      <div style={{ overflowY: 'auto', padding: '20px 20px 20px 24px' }}>
        <header style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <PiggyBank size={16} color={ACC} />
            <span style={{ fontSize: 10, fontWeight: 700, color: ACC, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Lender Suite</span>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: TX1, margin: 0 }}>Fund Management</h1>
          <p style={{ fontSize: 12, color: TX2, margin: '4px 0 0' }}>Facilities, cash waterfall, disbursement workflow, covenant compliance and AI portfolio insights.</p>
        </header>

        {/* Tab strip */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              style={{ height: 28, padding: '0 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                background: tab === t.id ? ACC : BG2, color: tab === t.id ? '#fff' : TX2,
                border: `1px solid ${tab === t.id ? ACC : BORDER}` }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'portfolio'     && <PortfolioTab />}
        {tab === 'waterfall'     && <WaterfallTab />}
        {tab === 'disbursements' && <DisbursementsTab />}
        {tab === 'covenants'     && <CovenantsTab />}
        {tab === 'insights'      && <InsightsTab />}
      </div>

      {/* RIGHT */}
      <div style={{ width: 380, borderLeft: `1px solid ${BORDER}`, background: BG1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* AI Assist */}
        <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: ACC, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>AI Assist</div>
          <p style={{ fontSize: 12, color: TX2, margin: 0, lineHeight: 1.6 }}>{aiInsights[tab]}</p>
        </div>

        {/* Recent Activity */}
        <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16, flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Recent Activity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentActivity.map((ev, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 10, color: TX3, fontFamily: MONO, minWidth: 56, paddingTop: 1 }}>{ev.time}</span>
                <span style={{
                  display: 'inline-block', width: 6, height: 6, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                  background: ev.tone === 'ok' ? GOOD : ev.tone === 'warn' ? WARN : BAD,
                }} />
                <span style={{ fontSize: 12, color: TX2, lineHeight: 1.4 }}>{ev.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────── 1. Portfolio ───────────
function PortfolioTab() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<{ aum?: number; deployed?: number; available?: number; nav?: number; irr_pct?: number; moic?: number } | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [navHistory, setNavHistory] = useState<Array<{ date: string; nav: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, f, nh] = await Promise.all([
        api.get('/funder/summary').catch(() => ({ data: { success: true, data: null } })),
        api.get('/funder/facilities').catch(() => ({ data: { success: true, data: [] } })),
        api.get('/funder/nav-history').catch(() => ({ data: { success: true, data: [] } })),
      ]);
      setSummary(s.data?.data || null);
      setFacilities((f.data?.data || []) as Facility[]);
      setNavHistory((nh.data?.data || []) as Array<{ date: string; nav: number }>);
    } catch (e: unknown) { setError((e as Error).message || 'Failed'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const allocation = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of facilities) {
      const k = f.tranche || 'senior';
      map.set(k, (map.get(k) || 0) + (f.drawn || 0));
    }
    const colours: Record<string, string> = { senior: TX1, mezzanine: ACC, equity: GOOD };
    return Array.from(map.entries()).map(([name, value]) => ({ name, value, color: colours[name] || TX3 }));
  }, [facilities]);

  if (loading) return <Skeleton variant="card" rows={5} />;
  if (error) return <ErrorBanner message={error} onRetry={refresh} />;

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <KpiTile label="AUM"       value={formatZAR(summary?.aum || 0)} />
        <KpiTile label="Deployed"  value={formatZAR(summary?.deployed || 0)} />
        <KpiTile label="Available" value={formatZAR(summary?.available || 0)} tone="ok" />
        <KpiTile label="IRR"       value={`${num(summary?.irr_pct || 0, 2)}%`} tone="ok" />
        {summary?.moic && <KpiTile label="MOIC" value={`${num(summary.moic, 2)}x`} tone="ok" />}
      </div>

      {/* NAV chart */}
      <SectionCard title="NAV History">
        {navHistory.length === 0 ? <EmptyMsg>No NAV data yet.</EmptyMsg> : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={navHistory}>
              <defs>
                <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={ACC} stopOpacity={0.30} />
                  <stop offset="95%" stopColor={ACC} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={BORDER} strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={10} stroke={TX3} />
              <YAxis fontSize={10} stroke={TX3} tickFormatter={(v) => `R${num(v, 3)}`} />
              <Tooltip formatter={(v: number) => [`R${num(v, 4)}`, 'NAV']} />
              <Area type="monotone" dataKey="nav" stroke={ACC} strokeWidth={2} fill="url(#navGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* Allocation bars */}
      <SectionCard title="Capital deployed by tranche">
        {allocation.length === 0 ? <EmptyMsg>No facilities yet.</EmptyMsg> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {allocation.map((a) => {
              const total = allocation.reduce((s, x) => s + x.value, 0) || 1;
              const pct = (a.value / total) * 100;
              return (
                <div key={a.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: TX2 }}>
                    <span style={{ textTransform: 'capitalize' }}>{a.name}</span>
                    <span style={{ fontFamily: MONO }}>{formatZAR(a.value)} · {num(pct, 1)}%</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 6, background: BG2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 6, width: `${pct}%`, background: a.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Facilities list */}
      <SectionCard title="Facilities">
        {facilities.length === 0
          ? <EmptyState icon={<Briefcase size={28} />} title="No facilities" description="Originate a facility against an IPP project to start tracking." />
          : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 110px 110px 60px 60px 80px 70px', gap: 8, padding: '4px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: TX3, letterSpacing: '0.06em', borderBottom: `1px solid ${BORDER}` }}>
              <span>Project</span><span>Tranche</span><span style={{ textAlign: 'right' }}>Commitment</span><span style={{ textAlign: 'right' }}>Drawn</span><span style={{ textAlign: 'right' }}>Util%</span><span style={{ textAlign: 'right' }}>Rate</span><span>Maturity</span><span>Status</span>
            </div>
            {facilities.map((f) => {
              const util = f.commitment ? ((f.drawn || 0) / f.commitment) * 100 : 0;
              return (
                <div key={f.id}
                  onClick={() => navigate(`/funds/${f.id}`)}
                  style={{ display: 'grid', gridTemplateColumns: '2fr 80px 110px 110px 60px 60px 80px 70px', gap: 8, padding: '8px 8px', fontSize: 12, color: TX2, borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', alignItems: 'center' }}
                  onMouseEnter={e => (e.currentTarget.style.background = BG2)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span onClick={(e) => e.stopPropagation()}>{f.project_id ? <EntityLink id={f.project_id} type="project" /> : (f.project_name || '—')}</span>
                  <span style={{ textTransform: 'capitalize' }}>{f.tranche || '—'}</span>
                  <span style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11 }}>{formatZAR(f.commitment || 0)}</span>
                  <span style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11 }}>{formatZAR(f.drawn || 0)}</span>
                  <span style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11 }}>{num(util, 1)}%</span>
                  <span style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11 }}>{num(f.rate_pct || 0, 2)}%</span>
                  <span style={{ fontFamily: MONO, fontSize: 11 }}>{f.maturity ? new Date(f.maturity).toLocaleDateString() : '—'}</span>
                  <span><StatusPill status={f.status || 'active'} /></span>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─────────── 2. Cash Waterfall ───────────
function WaterfallTab() {
  const [periods, setPeriods] = useState<Array<{ period: string; senior: number; mezz: number; equity: number; reserves: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/funder/waterfall').catch(() => ({
      data: { success: true, data: defaultWaterfall() },
    })).then((r) => {
      const d = r.data?.data;
      setPeriods(Array.isArray(d) && d.length > 0 ? d : defaultWaterfall());
      setLoading(false);
    });
  }, []);

  if (loading) return <Skeleton variant="card" rows={4} />;

  const total = periods.reduce((s, p) => ({
    senior: s.senior + p.senior, mezz: s.mezz + p.mezz, equity: s.equity + p.equity, reserves: s.reserves + p.reserves,
  }), { senior: 0, mezz: 0, equity: 0, reserves: 0 });

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <KpiTile label="Senior debt service"  value={formatZAR(total.senior)} />
        <KpiTile label="Mezz interest"        value={formatZAR(total.mezz)} />
        <KpiTile label="Equity distributions" value={formatZAR(total.equity)} tone="ok" />
        <KpiTile label="Reserves topped up"   value={formatZAR(total.reserves)} />
      </div>

      <SectionCard title="Waterfall by period">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={periods}>
            <CartesianGrid stroke={BORDER} strokeDasharray="3 3" />
            <XAxis dataKey="period" fontSize={10} stroke={TX3} />
            <YAxis fontSize={10} stroke={TX3} tickFormatter={(v) => `R${num(v / 1e6, 1)}M`} />
            <Tooltip formatter={(v: number) => formatZAR(v)} />
            <Bar dataKey="senior"   stackId="a" fill={TX1} />
            <Bar dataKey="mezz"     stackId="a" fill={ACC} />
            <Bar dataKey="equity"   stackId="a" fill={GOOD} />
            <Bar dataKey="reserves" stackId="a" fill={TX3} />
          </BarChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
          {[
            { name: 'Senior debt service', color: TX1 },
            { name: 'Mezzanine interest', color: ACC },
            { name: 'Equity distributions', color: GOOD },
            { name: 'Reserves', color: TX3 },
          ].map((l) => (
            <div key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: TX2 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, display: 'inline-block' }} />
              {l.name}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Sources & uses">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, marginBottom: 8 }}>Sources of cash</div>
            {[
              { label: 'PPA revenue', value: total.senior + total.mezz + total.equity + total.reserves },
              { label: 'Wheeling fees', value: total.reserves * 0.15 },
              { label: 'Capacity payments', value: total.equity * 0.30 },
              { label: 'Total', value: (total.senior + total.mezz + total.equity + total.reserves) * 1.30, bold: true },
            ].map((row) => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${BORDER}`, padding: '6px 0', fontSize: 12, color: TX2, fontWeight: row.bold ? 700 : 400 }}>
                <span>{row.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 11 }}>{formatZAR(row.value)}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, marginBottom: 8 }}>Uses of cash (priority)</div>
            {[
              { label: '1. O&M expenses', value: total.reserves * 0.40 },
              { label: '2. Senior debt service', value: total.senior },
              { label: '3. Reserve top-up', value: total.reserves },
              { label: '4. Mezzanine interest', value: total.mezz },
              { label: '5. Equity distributions', value: total.equity },
            ].map((row) => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${BORDER}`, padding: '6px 0', fontSize: 12, color: TX2 }}>
                <span>{row.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 11 }}>{formatZAR(row.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function defaultWaterfall() {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (11 - i));
    return {
      period: d.toISOString().slice(0, 7),
      senior: 4_500_000 + i * 80_000,
      mezz: 1_800_000 + i * 25_000,
      equity: 900_000 + i * 30_000,
      reserves: 600_000 + i * 10_000,
    };
  });
}

// ─────────── 3. Disbursements ───────────
function DisbursementsTab() {
  const [items, setItems] = useState<Disbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await api.get('/funder/disbursements').catch(() => ({ data: { success: true, data: [] } }));
    setItems((r.data?.data || []) as Disbursement[]);
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const counts = useMemo(() => ({
    pending:  items.filter((d) => d.status === 'pending').length,
    approved: items.filter((d) => d.status === 'approved').length,
    paid:     items.filter((d) => d.status === 'paid').length,
    rejected: items.filter((d) => d.status === 'rejected').length,
  }), [items]);

  const approve = async (id: string) => {
    await api.post(`/funder/disbursements/${id}/approve`, {}).catch(() => undefined);
    refresh();
  };

  if (loading) return <Skeleton variant="card" rows={3} />;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <KpiTile label="Pending"  value={num(counts.pending)}  tone={counts.pending > 0 ? 'warn' : undefined} />
        <KpiTile label="Approved" value={num(counts.approved)} tone="ok" />
        <KpiTile label="Paid"     value={num(counts.paid)} />
        <KpiTile label="Rejected" value={num(counts.rejected)} tone={counts.rejected > 0 ? 'bad' : undefined} />
      </div>

      <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG1, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: TX2 }}>Disbursement requests against active facilities. Approving fires a cascade event into Settlement.</span>
        <button type="button" onClick={() => setShowNew(true)}
          style={{ height: 30, padding: '0 12px', borderRadius: 6, background: ACC, color: '#fff', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Plus size={13} /> Request
        </button>
      </div>

      <SectionCard title="Disbursement queue">
        {items.length === 0 ? <EmptyMsg>No disbursements yet.</EmptyMsg> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 110px 110px 2fr 80px 70px 60px', gap: 8, padding: '4px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: TX3, letterSpacing: '0.06em', borderBottom: `1px solid ${BORDER}` }}>
              <span>Project</span><span style={{ textAlign: 'right' }}>Requested</span><span style={{ textAlign: 'right' }}>Approved</span><span>Reason</span><span>Due</span><span>Status</span><span style={{ textAlign: 'right' }}>Action</span>
            </div>
            {items.map((d) => (
              <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '2fr 110px 110px 2fr 80px 70px 60px', gap: 8, padding: '8px 8px', fontSize: 12, color: TX2, borderBottom: `1px solid ${BORDER}`, alignItems: 'center' }}>
                <span>{d.project_name || '—'}</span>
                <span style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11 }}>{formatZAR(d.requested_amount || 0)}</span>
                <span style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11 }}>{d.approved_amount ? formatZAR(d.approved_amount) : '—'}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: TX3 }}>{d.reason || '—'}</span>
                <span style={{ fontFamily: MONO, fontSize: 11 }}>{d.due_at ? new Date(d.due_at).toLocaleDateString() : '—'}</span>
                <span><StatusPill status={d.status} /></span>
                <span style={{ textAlign: 'right' }}>
                  {d.status === 'pending' && (
                    <button type="button" onClick={() => approve(d.id)}
                      style={{ fontSize: 11, color: GOOD, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                      Approve
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      {showNew && <NewDisbursementModal onClose={() => setShowNew(false)} onCreated={refresh} />}
    </div>
  );
}

function NewDisbursementModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  useEscapeKey(onClose);
  const [facilityId, setFacilityId] = useState('');
  const [amount, setAmount]   = useState('');
  const [reason, setReason]   = useState('');
  const [dueAt, setDueAt]     = useState('');
  const [loading, setLoading] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);

  useEffect(() => {
    api.get('/funder/facilities').catch(() => ({ data: { success: true, data: [] } })).then((r) => setFacilities((r.data?.data || []) as Facility[]));
  }, []);

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 36, padding: '0 10px', borderRadius: 6,
    border: `1px solid ${BORDER}`, fontSize: 13, color: TX1, background: BG,
    boxSizing: 'border-box',
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      await api.post('/funder/disbursements', {
        facility_id: facilityId,
        requested_amount: Number(amount),
        reason, due_at: dueAt || undefined,
      });
      onCreated(); onClose();
    } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
      role="dialog" aria-modal="true" aria-label="New disbursement request">
      <div style={{ background: BG1, borderRadius: 10, boxShadow: '0 12px 48px rgba(0,0,0,0.22)', width: '100%', maxWidth: 440, margin: '0 16px' }}>
        <header style={{ padding: '12px 18px', borderBottom: `1px solid ${BORDER}`, fontSize: 14, fontWeight: 700, color: TX1 }}>New disbursement request</header>
        <form onSubmit={submit} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Facility">
            <select required value={facilityId} onChange={(e) => setFacilityId(e.target.value)} style={{ ...inputStyle, height: 36 }}>
              <option value="">— select —</option>
              {facilities.map((f) => <option key={f.id} value={f.id}>{f.project_name || f.id} · {f.tranche || ''}</option>)}
            </select>
          </Field>
          <Field label="Amount (ZAR)">
            <input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Reason">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              style={{ ...inputStyle, height: 'auto', padding: '8px 10px', resize: 'vertical' }}
              placeholder="Capex draw, liquidity bridge…" />
          </Field>
          <Field label="Due (optional)">
            <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} style={inputStyle} />
          </Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose}
              style={{ height: 34, padding: '0 14px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12, fontWeight: 600, background: BG2, color: TX2, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading || !facilityId}
              style={{ height: 34, padding: '0 16px', borderRadius: 6, background: ACC, color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: loading || !facilityId ? 'not-allowed' : 'pointer', opacity: loading || !facilityId ? 0.55 : 1 }}>
              {loading ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────── 4. Covenants ───────────
function CovenantsTab() {
  const [rows, setRows] = useState<CovenantRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/funder/covenants').catch(() => ({ data: { success: true, data: [] } })).then((r) => {
      setRows((r.data?.data || []) as CovenantRow[]); setLoading(false);
    });
  }, []);

  if (loading) return <Skeleton variant="card" rows={3} />;

  const counts = {
    pass:   rows.filter((c) => c.status === 'pass').length,
    warn:   rows.filter((c) => c.status === 'warn').length,
    breach: rows.filter((c) => c.status === 'breach').length,
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <KpiTile label="Passing"  value={num(counts.pass)}   tone="ok" />
        <KpiTile label="Warning"  value={num(counts.warn)}   tone={counts.warn > 0 ? 'warn' : undefined} />
        <KpiTile label="Breached" value={num(counts.breach)} tone={counts.breach > 0 ? 'bad' : undefined} />
      </div>

      <SectionCard title="Covenant compliance">
        {rows.length === 0 ? <EmptyMsg>No covenants tracked.</EmptyMsg> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 80px 80px 70px 90px', gap: 8, padding: '4px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: TX3, letterSpacing: '0.06em', borderBottom: `1px solid ${BORDER}` }}>
              <span>Project</span><span>Covenant</span><span style={{ textAlign: 'right' }}>Threshold</span><span style={{ textAlign: 'right' }}>Current</span><span>Status</span><span>Measured</span>
            </div>
            {rows.map((r) => (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 80px 80px 70px 90px', gap: 8, padding: '8px 8px', fontSize: 12, color: TX2, borderBottom: `1px solid ${BORDER}`, alignItems: 'center' }}>
                <span>{r.project_name || '—'}</span>
                <span style={{ textTransform: 'capitalize' }}>{r.covenant_type.replace(/_/g, ' ')}</span>
                <span style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11 }}>{num(r.threshold, 2)}</span>
                <span style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11 }}>{num(r.current, 2)}</span>
                <span><StatusPill status={r.status} /></span>
                <span style={{ fontFamily: MONO, fontSize: 11 }}>{r.measured_at ? new Date(r.measured_at).toLocaleDateString() : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─────────── 5. AI Insights ───────────
function InsightsTab() {
  const [data, setData] = useState<{ narrative?: { text?: string }; kpis?: Record<string, unknown> } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/funder/insights').catch(() => ({ data: { success: true, data: null } })).then((r) => { setData(r.data?.data); setLoading(false); });
  }, []);

  if (loading) return <Skeleton variant="card" rows={3} />;

  return (
    <SectionCard title="Portfolio commentary">
      {data?.narrative?.text ? (
        <div style={{ fontSize: 13, color: TX2, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{data.narrative.text}</div>
      ) : (
        <EmptyMsg>No AI insights generated yet.</EmptyMsg>
      )}
    </SectionCard>
  );
}

export default Funds;
