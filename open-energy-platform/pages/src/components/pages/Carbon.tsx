import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award, BarChart3, CheckCircle2, Clock, ExternalLink, Factory, FileText,
  GitMerge, Leaf, Loader2, Plus, RefreshCw, Sparkles, Target, TrendingUp,
} from 'lucide-react';
import {
  BarChart, Bar, Cell, PieChart, Pie, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { ExportBar } from '../ExportBar';
import { EntityLink } from '../EntityLink';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { NarrativeText } from '../NarrativeText';

/* ════════════════════════════════════════════════════════════════════════
 * Carbon — Carbon Fund role
 *
 * Five tabs:
 *   1. Holdings           — VCU/REC inventory + vintage chart
 *   2. Issuance Pipeline  — Kanban view of project verification stages
 *   3. Retirement         — Retire credits → generate certificate (R2-stored)
 *   4. Fund NAV           — AI-computed NAV by methodology / vintage
 *   5. Marketplace        — Listings, options book
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

type Tab = 'holdings' | 'issuance' | 'retire' | 'nav' | 'market';

const TABS: { id: Tab; label: string }[] = [
  { id: 'holdings', label: 'Holdings' },
  { id: 'issuance', label: 'Issuance Pipeline' },
  { id: 'retire',   label: 'Retirement' },
  { id: 'nav',      label: 'Fund NAV' },
  { id: 'market',   label: 'Marketplace' },
];

const formatZAR = (val: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val || 0);
const num = (val: number, digits = 0) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(val || 0);

interface Credit {
  id: string;
  project_id?: string;
  project_name?: string;
  methodology?: string;
  vintage?: number;
  quantity?: number;
  price_per_credit?: number;
  status?: 'available' | 'retired' | 'pending' | 'issued' | 'verifying';
  serial_number?: string;
  retirement_certificate_url?: string;
}

interface PipelineProject {
  id: string;
  project_name: string;
  methodology: string;
  vintage: number;
  estimated_credits: number;
  stage: 'listed' | 'verifying' | 'verified' | 'issued' | 'available';
  verifier?: string;
  expected_issuance?: string;
}

export function Carbon() {
  const [tab, setTab] = useState<Tab>('holdings');

  const tabDescriptions: Record<Tab, string> = {
    holdings: 'VCU/REC inventory by vintage and methodology',
    issuance: 'Registry pipeline — project verification stages',
    retire:   'Retire credits and generate R2-stored certificates',
    nav:      'AI-computed fund NAV by methodology and vintage',
    market:   'Active listings and options book',
  };

  return (
    <div style={{ background: BG, minHeight: 'calc(100vh - 50px)', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 0 }}>
      {/* LEFT */}
      <div style={{ overflowY: 'auto', padding: '20px 20px 20px 24px' }}>
        <header style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Leaf size={16} style={{ color: ACC }} />
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: ACC }}>Carbon Markets</span>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: TX1, margin: 0 }}>Carbon portfolio</h1>
          <p style={{ fontSize: 12, color: TX2, margin: '4px 0 0' }}>{tabDescriptions[tab]}</p>
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

        {tab === 'holdings' && <HoldingsTab />}
        {tab === 'issuance' && <IssuanceTab />}
        {tab === 'retire'   && <RetirementTab />}
        {tab === 'nav'      && <NavTab />}
        {tab === 'market'   && <MarketTab />}
      </div>

      {/* RIGHT */}
      <div style={{ width: 380, borderLeft: `1px solid ${BORDER}`, background: BG1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: ACC, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={12} /> AI Assist
          </div>
          <p style={{ fontSize: 12, color: TX2, margin: 0 }}>
            {tab === 'holdings' && 'Portfolio skewed toward pre-2022 vintages — newer credits command a 12–18% premium. Consider rebalancing toward 2023–2024 vintage for mark-value uplift.'}
            {tab === 'issuance' && 'Three projects are stalled in the Verifying stage beyond the 90-day benchmark. Early verifier engagement can reduce slippage by ~30 days.'}
            {tab === 'retire'   && 'Retiring Article 6 credits before fiscal year-end locks in the carbon-tax offset at current rates. Review the Cap 10% annex-2 limit before submitting.'}
            {tab === 'nav'      && 'Fund NAV is sensitive to Gold Standard methodology credits — they trade 22% above VCS equivalents. Recompute after any large issuance event.'}
            {tab === 'market'   && 'Implied volatility on near-dated call options has widened to 34%. Consider delta-hedging open positions before next registry settlement window.'}
          </p>
        </div>

        <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Quick actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <QuickAction icon={Award} label="Retire credits" sub="Generate certificate" onClick={() => setTab('retire')} />
            <QuickAction icon={GitMerge} label="View pipeline" sub="Registry stages" onClick={() => setTab('issuance')} />
            <QuickAction icon={BarChart3} label="Recompute NAV" sub="AI valuation" onClick={() => setTab('nav')} />
          </div>
        </div>

        <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16, flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Compliance</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ComplianceRow label="Carbon Tax Act §13" status="ok" detail="Offset cap within 10% limit" />
            <ComplianceRow label="UNFCCC Art. 6 ledger" status="ok" detail="Corresponding adjustments current" />
            <ComplianceRow label="Verra VCS audit" status="warn" detail="Periodic review due in 18 days" />
            <ComplianceRow label="DFFE DNA approval" status="ok" detail="Registration confirmed" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────── 1. Holdings ──────────────
function HoldingsTab() {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get('/carbon/credits');
      setCredits((r.data?.data || []) as Credit[]);
    } catch (e: unknown) { setError((e as Error).message || 'Failed'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const balance = useMemo(() => {
    const total = credits.reduce((s, c) => s + (c.quantity || 0), 0);
    const retired = credits.filter((c) => c.status === 'retired').reduce((s, c) => s + (c.quantity || 0), 0);
    const available = credits.filter((c) => c.status === 'available').reduce((s, c) => s + (c.quantity || 0), 0);
    const value = credits.filter((c) => c.status === 'available').reduce((s, c) => s + (c.quantity || 0) * (c.price_per_credit || 150), 0);
    return { total, retired, available, value };
  }, [credits]);

  const vintageData = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of credits) {
      const k = String(c.vintage || 'Unknown');
      map.set(k, (map.get(k) || 0) + (c.quantity || 0));
    }
    return Array.from(map.entries()).map(([vintage, qty]) => ({ vintage, qty }));
  }, [credits]);

  const methodologyData = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of credits) {
      const k = c.methodology || 'Other';
      map.set(k, (map.get(k) || 0) + (c.quantity || 0));
    }
    const colours = [
      'oklch(0.46 0.16 55)',
      'oklch(0.52 0.14 200)',
      'oklch(0.40 0.16 155)',
      'oklch(0.55 0.15 280)',
      'oklch(0.50 0.18 30)',
      'oklch(0.45 0.12 140)',
    ];
    return Array.from(map.entries()).map(([name, value], i) => ({ name, value, color: colours[i % colours.length] }));
  }, [credits]);

  if (loading) return <Skeleton variant="card" rows={4} />;
  if (error) return <ErrorBanner message={error} onRetry={refresh} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <KpiTile label="Total holdings" value={`${num(balance.total)} tCO₂e`} />
        <KpiTile label="Available" value={`${num(balance.available)} tCO₂e`} tone="ok" />
        <KpiTile label="Retired" value={`${num(balance.retired)} tCO₂e`} />
        <KpiTile label="Mark value" value={formatZAR(balance.value)} tone="ok" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <SectionCard title="Vintage distribution">
          {vintageData.length === 0 ? <EmptyMsg>No credits yet.</EmptyMsg> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={vintageData}>
                <XAxis dataKey="vintage" fontSize={10} stroke={TX3} />
                <YAxis fontSize={10} stroke={TX3} />
                <Tooltip formatter={(v: number) => [`${num(v)} tCO₂e`, 'Credits']} />
                <Bar dataKey="qty" radius={[4, 4, 0, 0]} fill={ACC} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
        <SectionCard title="By methodology">
          {methodologyData.length === 0 ? <EmptyMsg>No credits yet.</EmptyMsg> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={methodologyData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={68} paddingAngle={2} stroke="none">
                    {methodologyData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [`${num(v)} tCO₂e`, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {methodologyData.map((d) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                    <span style={{ color: TX2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                    <span style={{ fontFamily: MONO, color: TX1, fontSize: 10 }}>{num(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Credit holdings">
        {credits.length === 0
          ? <EmptyState icon={<Leaf size={28} />} title="No carbon credits" description="Purchase credits or wait for project issuance." />
          : (
            <>
              <ExportBar data={credits} filename="carbon_credits" />
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 60px 100px 90px 80px', gap: 0, padding: '4px 0', borderBottom: `1px solid ${BORDER}` }}>
                  {['Project', 'Methodology', 'Vintage', 'Quantity', 'Price', 'Status'].map(h => (
                    <div key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, padding: '0 8px' }}>{h}</div>
                  ))}
                </div>
                {credits.map((c, i) => (
                  <div key={c.id || i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 60px 100px 90px 80px', gap: 0, padding: '7px 0', borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 12, color: TX1, padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.project_id ? <EntityLink id={c.project_id} type="project" /> : (c.project_name || '—')}
                    </div>
                    <div style={{ fontSize: 12, color: TX2, padding: '0 8px' }}>{c.methodology || '—'}</div>
                    <div style={{ fontSize: 12, fontFamily: MONO, color: TX2, padding: '0 8px' }}>{c.vintage || '—'}</div>
                    <div style={{ fontSize: 12, fontFamily: MONO, color: TX1, padding: '0 8px', textAlign: 'right' }}>{num(c.quantity || 0)} tCO₂e</div>
                    <div style={{ fontSize: 12, fontFamily: MONO, color: TX1, padding: '0 8px', textAlign: 'right' }}>{formatZAR(c.price_per_credit || 150)}</div>
                    <div style={{ padding: '0 8px' }}><StatusPill status={c.status || 'available'} /></div>
                  </div>
                ))}
              </div>
            </>
          )}
      </SectionCard>
    </div>
  );
}

// ────────────── 2. Issuance Pipeline (Kanban) ──────────────
function IssuanceTab() {
  const [pipeline, setPipeline] = useState<PipelineProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/carbon-registry/pipeline').catch(() => ({ data: { success: true, data: [] } })).then((r) => {
      setPipeline((r.data?.data || []) as PipelineProject[]);
      setLoading(false);
    });
  }, []);

  const stages: PipelineProject['stage'][] = ['listed', 'verifying', 'verified', 'issued', 'available'];
  const stageLabels: Record<string, string> = {
    listed: 'Listed', verifying: 'Verifying', verified: 'Verified', issued: 'Issued', available: 'Available',
  };
  const grouped = useMemo(() => {
    const m = new Map<string, PipelineProject[]>();
    for (const s of stages) m.set(s, []);
    for (const p of pipeline) m.get(p.stage)?.push(p);
    return m;
  }, [pipeline]);

  if (loading) return <Skeleton variant="card" rows={4} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG1, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, color: TX2 }}>{pipeline.length} projects across the registry pipeline.</div>
        <button type="button" style={{ height: 30, padding: '0 12px', borderRadius: 6, background: ACC, color: '#fff', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={13} /> Register project
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {stages.map((s) => {
          const items = grouped.get(s) || [];
          return (
            <div key={s} style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '8px 10px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX2 }}>{stageLabels[s]}</span>
                <span style={{ fontSize: 10, fontFamily: MONO, color: TX3 }}>{items.length}</span>
              </div>
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 200 }}>
                {items.map((p) => (
                  <div key={p.id} style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG, padding: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TX1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.project_name}</div>
                    <div style={{ fontSize: 10, color: TX3, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}><Factory size={9} /> {p.methodology}</div>
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 3 }}>
                      <span style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: TX1 }}>{num(p.estimated_credits || 0)}</span>
                      <span style={{ fontSize: 10, color: TX3 }}>tCO₂e</span>
                    </div>
                    <div style={{ marginTop: 2, fontSize: 10, fontFamily: MONO, color: TX3 }}>Vintage {p.vintage}</div>
                    {p.verifier && <div style={{ marginTop: 2, fontSize: 10, color: TX2 }}>Verifier: {p.verifier}</div>}
                  </div>
                ))}
                {items.length === 0 && <div style={{ fontSize: 11, color: TX3, textAlign: 'center', paddingTop: 32 }}>—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────── 3. Retirement ──────────────
function RetirementTab() {
  const [retired, setRetired] = useState<Credit[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [available, setAvailable] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/carbon/credits');
      const all = (r.data?.data || []) as Credit[];
      setRetired(all.filter((c) => c.status === 'retired'));
      setAvailable(all.filter((c) => c.status === 'available'));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const totalRetired = retired.reduce((s, c) => s + (c.quantity || 0), 0);

  if (loading) return <Skeleton variant="card" rows={4} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <KpiTile label="Total retired" value={`${num(totalRetired)} tCO₂e`} />
        <KpiTile label="Certificates" value={num(retired.length)} />
        <KpiTile label="Available to retire" value={`${num(available.reduce((s, c) => s + (c.quantity || 0), 0))} tCO₂e`} tone="ok" />
      </div>

      <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG1, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: TX1 }}>Retire carbon credits</div>
          <div style={{ fontSize: 11, color: TX2, marginTop: 2 }}>Generate a verifiable retirement certificate stored in the platform vault.</div>
        </div>
        <button type="button" onClick={() => setShowModal(true)}
          style={{ height: 32, padding: '0 14px', borderRadius: 6, background: ACC, color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Award size={13} /> Retire credits
        </button>
      </div>

      <SectionCard title="Retirement certificates">
        {retired.length === 0 ? <EmptyMsg>No retirements yet.</EmptyMsg> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 60px 100px 1fr 80px', gap: 0, padding: '4px 0', borderBottom: `1px solid ${BORDER}` }}>
              {['Project', 'Methodology', 'Vintage', 'Quantity', 'Serial', 'Certificate'].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, padding: '0 8px' }}>{h}</div>
              ))}
            </div>
            {retired.map((c, i) => (
              <div key={c.id || i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 60px 100px 1fr 80px', gap: 0, padding: '7px 0', borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 12, color: TX1, padding: '0 8px' }}>{c.project_name || '—'}</div>
                <div style={{ fontSize: 12, color: TX2, padding: '0 8px' }}>{c.methodology || '—'}</div>
                <div style={{ fontSize: 12, fontFamily: MONO, color: TX2, padding: '0 8px' }}>{c.vintage || '—'}</div>
                <div style={{ fontSize: 12, fontFamily: MONO, color: TX1, padding: '0 8px', textAlign: 'right' }}>{num(c.quantity || 0)} tCO₂e</div>
                <div style={{ fontSize: 11, fontFamily: MONO, color: TX3, padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.serial_number || '—'}</div>
                <div style={{ padding: '0 8px', textAlign: 'right' }}>
                  {c.retirement_certificate_url
                    ? <a href={c.retirement_certificate_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: ACC, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                        <ExternalLink size={11} /> Open
                      </a>
                    : <span style={{ fontSize: 11, color: TX3 }}>Pending</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {showModal && <RetireModal credits={available} onClose={() => setShowModal(false)} onRetired={refresh} />}
    </div>
  );
}

function RetireModal({ credits, onClose, onRetired }: { credits: Credit[]; onClose: () => void; onRetired: () => void }) {
  useEscapeKey(onClose);
  const [creditId, setCreditId] = useState(credits[0]?.id || '');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [beneficiary, setBeneficiary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      await api.post(`/carbon/credits/${creditId}/retire`, {
        quantity: Number(quantity), reason, beneficiary,
      });
      onRetired(); onClose();
    } catch (e: unknown) { setError((e as Error).message || 'Retirement failed'); }
    finally { setLoading(false); }
  };

  const inputStyle = { width: '100%', height: 34, padding: '0 10px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12, color: TX1, background: BG, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: TX3, display: 'block', marginBottom: 4 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }} role="dialog" aria-modal="true">
      <div style={{ background: BG1, borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', width: '100%', maxWidth: 440, margin: '0 16px' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Award size={15} style={{ color: ACC }} />
          <h3 style={{ fontSize: 14, fontWeight: 700, color: TX1, margin: 0 }}>Retire carbon credits</h3>
        </div>
        <form onSubmit={submit} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          <label>
            <span style={labelStyle}>Credit</span>
            <select required value={creditId} onChange={(e) => setCreditId(e.target.value)}
              style={{ ...inputStyle, height: 34, padding: '0 10px' }}>
              {credits.map((c) => <option key={c.id} value={c.id}>{c.project_name || c.id} · {c.methodology} · {c.vintage} · {num(c.quantity || 0)} tCO₂e</option>)}
              {credits.length === 0 && <option>— no available credits —</option>}
            </select>
          </label>
          <label>
            <span style={labelStyle}>Quantity (tCO₂e)</span>
            <input type="number" required value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle} />
          </label>
          <label>
            <span style={labelStyle}>Beneficiary (optional)</span>
            <input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder="On behalf of…" style={inputStyle} />
          </label>
          <label>
            <span style={labelStyle}>Reason</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              placeholder="Reason / claim period / project alignment"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12, color: TX1, background: BG, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose}
              style={{ height: 32, padding: '0 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG, color: TX2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading || !creditId}
              style={{ height: 32, padding: '0 14px', borderRadius: 6, background: ACC, color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading || !creditId ? 0.55 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              {loading ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Retiring…</> : 'Retire & generate certificate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ────────────── 4. Fund NAV (AI computed) ──────────────
function NavTab() {
  const [summary, setSummary] = useState<{ nav?: number; updated_at?: string; total_credits?: number; weighted_price?: number } | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    api.get('/carbon/fund/summary').catch(() => ({ data: { success: true, data: null } })).then((r) => setSummary(r.data?.data || null));
  }, []);

  const compute = async () => {
    setComputing(true);
    try {
      const r = await api.post('/carbon/fund/nav/compute', {});
      setSummary(r.data?.data?.kpis || summary);
      setNarrative(r.data?.data?.narrative?.text || null);
    } finally { setComputing(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <KpiTile label="Fund NAV" value={formatZAR(summary?.nav || 0)} tone="ok" />
        <KpiTile label="Total credits" value={`${num(summary?.total_credits || 0)} tCO₂e`} />
        <KpiTile label="Weighted price" value={formatZAR(summary?.weighted_price || 0)} />
        <KpiTile label="Last computed" value={summary?.updated_at ? new Date(summary.updated_at).toLocaleDateString() : '—'} />
      </div>

      <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG1, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: TX1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={13} style={{ color: ACC }} /> AI NAV computation
          </div>
          <div style={{ fontSize: 11, color: TX2, marginTop: 2 }}>Rebuilds the methodology / vintage breakdown using live market prices.</div>
        </div>
        <button type="button" onClick={compute} disabled={computing}
          style={{ height: 32, padding: '0 14px', borderRadius: 6, background: ACC, color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: computing ? 'not-allowed' : 'pointer', opacity: computing ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
          {computing ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Computing…</> : <><RefreshCw size={12} /> Compute now</>}
        </button>
      </div>

      {narrative && (
        <SectionCard title="NAV commentary">
          <NarrativeText text={narrative} />
        </SectionCard>
      )}
    </div>
  );
}

// ────────────── 5. Marketplace (options book) ──────────────
function MarketTab() {
  const [options, setOptions] = useState<Array<Record<string, unknown>>>([]);
  useEffect(() => {
    api.get('/carbon/options').catch(() => ({ data: { success: true, data: [] } })).then((r) => setOptions((r.data?.data || []) as Array<Record<string, unknown>>));
  }, []);

  return (
    <SectionCard title="Options book">
      {options.length === 0 ? <EmptyMsg>No active options.</EmptyMsg> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr', gap: 0, padding: '4px 0', borderBottom: `1px solid ${BORDER}` }}>
            {['Type', 'Strike', 'Expiry', 'Δ / Γ'].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, padding: '0 8px' }}>{h}</div>
            ))}
          </div>
          {options.map((o, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr', gap: 0, padding: '7px 0', borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ padding: '0 8px' }}>
                <span style={{
                  padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  background: (o.type as string) === 'call' ? 'oklch(0.93 0.06 155)' : 'oklch(0.93 0.06 20)',
                  color: (o.type as string) === 'call' ? GOOD : BAD,
                }}>
                  {(o.type as string)?.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: 12, fontFamily: MONO, color: TX1, padding: '0 8px' }}>{formatZAR(Number(o.strike || 0))}</div>
              <div style={{ fontSize: 12, fontFamily: MONO, color: TX2, padding: '0 8px' }}>{(o.expiry as string) || '—'}</div>
              <div style={{ fontSize: 12, fontFamily: MONO, color: TX2, padding: '0 8px' }}>Δ {o.delta as number} | Γ {o.gamma as number}</div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ────────────── shared primitives ──────────────
function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '8px 12px', minWidth: 90 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color }}>{value}</div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG1, overflow: 'hidden' }}>
      <header style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, fontSize: 12, fontWeight: 700, color: TX1 }}>{title}</header>
      <div style={{ padding: 14 }}>{children}</div>
    </section>
  );
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: TX3 }}>{children}</div>;
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    available:  { bg: 'oklch(0.93 0.06 155)', color: GOOD },
    issued:     { bg: 'oklch(0.93 0.05 220)', color: 'oklch(0.42 0.14 220)' },
    pending:    { bg: 'oklch(0.94 0.06 55)',  color: WARN },
    verifying:  { bg: 'oklch(0.94 0.06 55)',  color: WARN },
    retired:    { bg: BG2, color: TX3 },
  };
  const s = styles[status] || { bg: BG2, color: TX3 };
  return (
    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', background: s.bg, color: s.color }}>
      {status}
    </span>
  );
}

function QuickAction({ icon: Icon, label, sub, onClick }: { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>; label: string; sub: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button type="button" onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, border: `1px solid ${hovered ? ACC : BORDER}`, background: hovered ? 'oklch(0.97 0.01 55)' : BG, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
      <Icon size={14} style={{ color: ACC, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: TX1 }}>{label}</div>
        <div style={{ fontSize: 10, color: TX3 }}>{sub}</div>
      </div>
    </button>
  );
}

function ComplianceRow({ label, status, detail }: { label: string; status: 'ok' | 'warn' | 'bad'; detail: string }) {
  const dot = status === 'ok' ? GOOD : status === 'warn' ? WARN : BAD;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, marginTop: 3, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: TX1 }}>{label}</div>
        <div style={{ fontSize: 10, color: TX3 }}>{detail}</div>
      </div>
    </div>
  );
}

export default Carbon;
