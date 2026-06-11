import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award, BadgeCheck, BarChart3, Briefcase, Calendar, ChevronRight, ClipboardList,
  ExternalLink, FileText, Plus, Search, Send, Target, TrendingUp, Users, X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import { Skeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { ErrorBanner } from '../ErrorBanner';
import { ExportBar } from '../ExportBar';
import { EntityLink } from '../EntityLink';
import { useEscapeKey } from '../../hooks/useEscapeKey';

/* ════════════════════════════════════════════════════════════════════════
 * Procurement Hub — Offtaker / IPP Developer
 *
 * Five tabs:
 *   1. RFPs        — open RFPs (browse + bid)
 *   2. My RFPs     — RFPs I issued (offtaker view) with bid count
 *   3. My Bids     — bids I've submitted (IPP view)
 *   4. Evaluation  — score bids on price / technical / sustainability / delivery
 *   5. Awards      — awarded RFPs → linked LOIs
 * ═══════════════════════════════════════════════════════════════════════ */

// ── Design tokens ──────────────────────────────────────────────────────
const BG      = 'oklch(0.96 0.003 250)';
const BG1     = 'oklch(0.99 0.002 80)';
const BG2     = 'oklch(0.93 0.004 250)';
const BORDER  = 'oklch(0.87 0.006 250)';
const TX1     = 'oklch(0.17 0.010 250)';
const TX2     = 'oklch(0.40 0.009 250)';
const TX3     = 'oklch(0.60 0.007 250)';
const ACC     = 'oklch(0.46 0.16 55)';
const ACC_BG  = 'oklch(0.96 0.05 55)';
const BAD     = 'oklch(0.48 0.20 20)';
const BAD_BG  = 'oklch(0.97 0.04 20)';
const WARN    = 'oklch(0.50 0.18 55)';
const WARN_BG = 'oklch(0.96 0.05 55)';
const GOOD    = 'oklch(0.40 0.16 155)';
const GOOD_BG = 'oklch(0.95 0.04 155)';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

type Tab = 'browse' | 'mine' | 'mybids' | 'evaluation' | 'awards';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'browse',     label: 'Open RFPs',  icon: Search },
  { id: 'mine',       label: 'My RFPs',    icon: ClipboardList },
  { id: 'mybids',     label: 'My Bids',    icon: Send },
  { id: 'evaluation', label: 'Evaluation', icon: BarChart3 },
  { id: 'awards',     label: 'Awards',     icon: Award },
];

const formatZAR = (val: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val || 0);
const num = (val: number, digits = 0) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(val || 0);

interface Rfp {
  id: string;
  title: string;
  description?: string;
  status: 'open' | 'closed' | 'awarded' | 'cancelled' | 'evaluation';
  budget_min?: number;
  budget_max?: number;
  deadline?: string;
  project_type?: string;
  bid_count?: number;
  awarded_to?: string;
  issued_by?: string;
  issued_by_name?: string;
}

interface Bid {
  id: string;
  rfp_id: string;
  rfp_title?: string;
  rfp_status?: string;
  proposed_price?: number;
  proposed_terms?: string;
  bidder_id?: string;
  bidder_name?: string;
  status?: 'submitted' | 'shortlisted' | 'awarded' | 'rejected';
  submitted_at?: string;
  technical_score?: number;
  sustainability_score?: number;
  delivery_score?: number;
  overall_score?: number;
}

export function ProcurementHub() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>(
    user?.role === 'ipp_developer' || user?.role === 'trader' ? 'browse' : 'mine'
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 50px)', background: BG, overflow: 'hidden' }}>
      {/* Page header */}
      <div style={{ background: BG1, borderBottom: `1px solid ${BORDER}`, padding: '16px 28px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Briefcase size={16} style={{ color: ACC }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Procurement</span>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: TX1, margin: '0 0 2px' }}>Procurement Hub</h1>
        <p style={{ fontSize: 13, color: TX2, margin: '0 0 14px' }}>
          Issue RFPs, track bids, run multi-criteria evaluation, and award contracts that flow into LOIs.
        </p>
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px',
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  color: active ? ACC : TX2,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active ? `2px solid ${ACC}` : '2px solid transparent',
                  cursor: 'pointer',
                  marginBottom: -1,
                }}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'browse'     && <BrowseTab />}
        {tab === 'mine'       && <MyRfpsTab />}
        {tab === 'mybids'     && <MyBidsTab />}
        {tab === 'evaluation' && <EvaluationTab />}
        {tab === 'awards'     && <AwardsTab />}
      </div>
    </div>
  );
}

// ─────────── Browse open RFPs ───────────
function BrowseTab() {
  const [rfps, setRfps] = useState<Rfp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Rfp | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await api.get('/procurement/rfps').catch(() => ({ data: { success: true, data: [] } }));
    setRfps(((r.data?.data || []) as Rfp[]).filter((x) => x.status === 'open' || x.status === 'evaluation'));
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    if (!search) return rfps;
    const s = search.toLowerCase();
    return rfps.filter((r) => r.title?.toLowerCase().includes(s) || r.description?.toLowerCase().includes(s));
  }, [rfps, search]);

  const open = rfps.filter((r) => r.status === 'open').length;
  const inEval = rfps.filter((r) => r.status === 'evaluation').length;
  const totalBids = rfps.reduce((s, r) => s + (r.bid_count || 0), 0);

  if (loading) return (
    <div style={{ padding: '24px 28px' }}><Skeleton variant="card" rows={3} /></div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', height: '100%', overflow: 'hidden' }}>
      {/* LEFT */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <KpiCard label="Open RFPs" value={num(open)} />
          <KpiCard label="In Evaluation" value={num(inEval)} />
          <KpiCard label="Total Bids" value={num(totalBids)} />
          <KpiCard label="Showing" value={num(filtered.length)} />
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={<FileText size={32} />} title="No open RFPs" description="Check back later or expand your search." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {filtered.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => setSelected(r)}
                style={{
                  textAlign: 'left',
                  background: BG1,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: '16px 18px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = ACC)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: TX1, lineHeight: 1.3 }}>{r.title}</span>
                  <StatusBadge status={r.status} />
                </div>
                <p style={{ fontSize: 12, color: TX2, margin: '0 0 10px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {r.description}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: TX3 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Users size={11} />{r.bid_count || 0} bids</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={11} />{r.deadline ? new Date(r.deadline).toLocaleDateString() : '—'}</span>
                </div>
                <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 12, color: TX1 }}>
                  {formatZAR(r.budget_min || 0)} – {formatZAR(r.budget_max || 0)}
                </div>
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: ACC }}>
                  View &amp; bid <ChevronRight size={12} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* RIGHT */}
      <div style={{ borderLeft: `1px solid ${BORDER}`, background: BG1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionCard title="Search">
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: TX3, pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search RFPs…"
              style={{ width: '100%', height: 36, paddingLeft: 32, paddingRight: 12, borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 13, color: TX1, background: BG, boxSizing: 'border-box', outline: 'none' }}
            />
          </div>
        </SectionCard>

        <SectionCard title="Summary">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <StatRow label="Open" value={num(open)} color={GOOD} />
            <StatRow label="In evaluation" value={num(inEval)} color={ACC} />
            <StatRow label="Total bids across RFPs" value={num(totalBids)} />
            <StatRow label="Showing (filtered)" value={num(filtered.length)} />
          </div>
        </SectionCard>
      </div>

      {selected && <RfpDetailModal rfp={selected} onClose={() => setSelected(null)} onUpdate={refresh} />}
    </div>
  );
}

// ─────────── My RFPs (issuer view) ───────────
function MyRfpsTab() {
  const [rfps, setRfps] = useState<Rfp[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Rfp | null>(null);
  const { user } = useAuth();

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await api.get('/procurement/rfps').catch(() => ({ data: { success: true, data: [] } }));
    setRfps(((r.data?.data || []) as Rfp[]).filter(
      (x) => ((x as Rfp & { creator_id?: string }).creator_id || x.issued_by) === user?.id
    ));
    setLoading(false);
  }, [user?.id]);
  useEffect(() => { refresh(); }, [refresh]);

  const counts = useMemo(() => ({
    open: rfps.filter((r) => r.status === 'open').length,
    evaluation: rfps.filter((r) => r.status === 'evaluation').length,
    awarded: rfps.filter((r) => r.status === 'awarded').length,
    closed: rfps.filter((r) => r.status === 'closed').length,
  }), [rfps]);

  if (loading) return (
    <div style={{ padding: '24px 28px' }}><Skeleton variant="card" rows={3} /></div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', height: '100%', overflow: 'hidden' }}>
      {/* LEFT */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <KpiCard label="Open" value={num(counts.open)} />
          <KpiCard label="Evaluation" value={num(counts.evaluation)} />
          <KpiCard label="Awarded" value={num(counts.awarded)} accent={GOOD} />
          <KpiCard label="Closed" value={num(counts.closed)} accent={TX3} />
        </div>

        {/* Table */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Your RFPs
          </div>
          {rfps.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: TX3 }}>You haven't issued any RFPs yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  {['Title', 'Type', 'Budget', 'Bids', 'Deadline', 'Status'].map((h, i) => (
                    <th key={h} style={{ textAlign: i >= 2 && i <= 3 ? 'right' : 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rfps.map((r, i) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = ACC_BG)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 1 ? BG2 : 'transparent')}
                  >
                    <td style={{ padding: '10px 12px', color: TX1, fontWeight: 600 }}>{r.title}</td>
                    <td style={{ padding: '10px 12px', color: TX2, textTransform: 'capitalize' }}>{r.project_type || '—'}</td>
                    <td style={{ padding: '10px 12px', color: TX1, fontFamily: MONO, textAlign: 'right' }}>{formatZAR(r.budget_max || 0)}</td>
                    <td style={{ padding: '10px 12px', color: TX1, fontFamily: MONO, textAlign: 'right' }}>{r.bid_count || 0}</td>
                    <td style={{ padding: '10px 12px', color: TX2, fontFamily: MONO, fontSize: 11 }}>{r.deadline ? new Date(r.deadline).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '10px 12px' }}><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ borderLeft: `1px solid ${BORDER}`, background: BG1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionCard title="Actions">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: ACC, color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
          >
            <Plus size={14} /> New RFP
          </button>
        </SectionCard>

        <SectionCard title="Pipeline">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <StatRow label="Open" value={num(counts.open)} color={GOOD} />
            <StatRow label="In evaluation" value={num(counts.evaluation)} color={ACC} />
            <StatRow label="Awarded" value={num(counts.awarded)} color={GOOD} />
            <StatRow label="Closed" value={num(counts.closed)} color={TX3} />
            <StatRow label="Total issued" value={num(rfps.length)} />
          </div>
        </SectionCard>
      </div>

      {showCreate && <CreateRfpModal onClose={() => setShowCreate(false)} onCreated={refresh} />}
      {selected && <RfpDetailModal rfp={selected} onClose={() => setSelected(null)} onUpdate={refresh} />}
    </div>
  );
}

// ─────────── My Bids ───────────
function MyBidsTab() {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get('/procurement/bids').catch(() => ({ data: { success: true, data: [] } })).then((r) => {
      setBids((r.data?.data || []) as Bid[]); setLoading(false);
    });
  }, []);

  if (loading) return (
    <div style={{ padding: '24px 28px' }}><Skeleton variant="card" rows={3} /></div>
  );

  const totalValue = bids.reduce((s, b) => s + (b.proposed_price || 0), 0);
  const won = bids.filter((b) => b.status === 'awarded' || b.rfp_status === 'awarded').length;
  const winRate = bids.length > 0 ? (won / bids.length) * 100 : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', height: '100%', overflow: 'hidden' }}>
      {/* LEFT */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <KpiCard label="Bids Submitted" value={num(bids.length)} />
          <KpiCard label="Won" value={num(won)} accent={GOOD} />
          <KpiCard label="Win Rate" value={`${num(winRate, 1)}%`} accent={won > 0 ? GOOD : TX2} />
          <KpiCard label="Total Bid Value" value={formatZAR(totalValue)} />
        </div>

        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            My Bids
          </div>
          {bids.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: TX3 }}>You haven't bid on any RFPs yet.</div>
          ) : (
            <>
              <div style={{ padding: '8px 12px' }}>
                <ExportBar data={bids} filename="my_bids" />
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>RFP</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Proposed Price</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Submitted</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bids.map((b, i) => (
                    <tr key={b.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                      <td style={{ padding: '10px 12px', color: TX1 }}>{b.rfp_title || b.rfp_id}</td>
                      <td style={{ padding: '10px 12px', color: TX1, fontFamily: MONO, textAlign: 'right' }}>{formatZAR(b.proposed_price || 0)}</td>
                      <td style={{ padding: '10px 12px', color: TX1, fontFamily: MONO, textAlign: 'right' }}>{b.overall_score ? num(b.overall_score, 1) : '—'}</td>
                      <td style={{ padding: '10px 12px', color: TX2, fontFamily: MONO, fontSize: 11 }}>{b.submitted_at ? new Date(b.submitted_at).toLocaleDateString() : '—'}</td>
                      <td style={{ padding: '10px 12px' }}><StatusBadge status={b.status || b.rfp_status || 'submitted'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ borderLeft: `1px solid ${BORDER}`, background: BG1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionCard title="Bid Performance">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <StatRow label="Total bids" value={num(bids.length)} />
            <StatRow label="Won" value={num(won)} color={GOOD} />
            <StatRow label="Win rate" value={`${num(winRate, 1)}%`} color={won > 0 ? GOOD : TX2} />
            <StatRow label="Total bid value" value={formatZAR(totalValue)} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// ─────────── Evaluation ───────────
function EvaluationTab() {
  const [rfps, setRfps] = useState<Rfp[]>([]);
  const [selectedRfp, setSelectedRfp] = useState<Rfp | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [scoring, setScoring] = useState<Record<string, { technical: number; sustainability: number; delivery: number }>>({});
  const { user } = useAuth();

  useEffect(() => {
    api.get('/procurement/rfps').catch(() => ({ data: { success: true, data: [] } })).then((r) => {
      setRfps(((r.data?.data || []) as Rfp[]).filter(
        (x) => ((x as Rfp & { creator_id?: string }).creator_id || x.issued_by) === user?.id && (x.bid_count || 0) > 0
      ));
    });
  }, [user?.id]);

  const loadBids = async (rfp: Rfp) => {
    setSelectedRfp(rfp);
    const r = await api.get(`/procurement/rfps/${rfp.id}`).catch(() => ({ data: { success: true, data: { bids: [] } } }));
    const list = (r.data?.data?.bids || []) as Bid[];
    setBids(list);
    const initial: typeof scoring = {};
    for (const b of list) initial[b.id] = {
      technical: b.technical_score ?? 70,
      sustainability: b.sustainability_score ?? 70,
      delivery: b.delivery_score ?? 70,
    };
    setScoring(initial);
  };

  const calcOverall = useMemo(() => {
    if (bids.length === 0) return new Map<string, number>();
    const minPrice = Math.min(...bids.map((b) => b.proposed_price || Infinity));
    const m = new Map<string, number>();
    for (const b of bids) {
      const priceScore = b.proposed_price ? (minPrice / b.proposed_price) * 100 : 0;
      const s = scoring[b.id] || { technical: 70, sustainability: 70, delivery: 70 };
      const overall = (priceScore * 0.40) + (s.technical * 0.25) + (s.sustainability * 0.20) + (s.delivery * 0.15);
      m.set(b.id, overall);
    }
    return m;
  }, [bids, scoring]);

  const ranked = useMemo(() => {
    return [...bids].sort((a, b) => (calcOverall.get(b.id) || 0) - (calcOverall.get(a.id) || 0));
  }, [bids, calcOverall]);

  const persistScores = async () => {
    if (!selectedRfp) return;
    await api.post(`/procurement/rfps/${selectedRfp.id}/evaluate`, { scoring }).catch(() => undefined);
  };

  const award = async (bidId: string) => {
    if (!selectedRfp) return;
    await api.post(`/procurement/rfps/${selectedRfp.id}/award`, { bid_id: bidId });
    setSelectedRfp(null); setBids([]);
  };

  if (selectedRfp === null) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', height: '100%', overflow: 'hidden' }}>
        {/* LEFT */}
        <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              RFPs Ready to Evaluate
            </div>
            <div style={{ padding: 16 }}>
              {rfps.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: TX3 }}>No RFPs with submitted bids yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rfps.map((r) => (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => loadBids(r)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG, cursor: 'pointer', textAlign: 'left', width: '100%' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACC; e.currentTarget.style.background = ACC_BG; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = BG; }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: TX1 }}>{r.title}</div>
                        <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>
                          {r.bid_count || 0} bids · deadline {r.deadline ? new Date(r.deadline).toLocaleDateString() : '—'}
                        </div>
                      </div>
                      <ChevronRight size={16} style={{ color: ACC }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ borderLeft: `1px solid ${BORDER}`, background: BG1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard title="How scoring works">
            <div style={{ fontSize: 12, color: TX2, lineHeight: 1.6 }}>
              <div style={{ marginBottom: 6, fontWeight: 700, color: TX1 }}>Weights</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <StatRow label="Price" value="40%" color={ACC} />
                <StatRow label="Technical" value="25%" />
                <StatRow label="Sustainability" value="20%" />
                <StatRow label="Delivery" value="15%" />
              </div>
              <p style={{ marginTop: 10, fontSize: 11, color: TX3 }}>
                Cheapest bid receives price score of 100; others scale linearly. Adjust 0–100 sliders in the evaluation table.
              </p>
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', height: '100%', overflow: 'hidden' }}>
      {/* LEFT */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
        {/* Evaluating header */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Evaluating</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: TX1, marginTop: 2 }}>{selectedRfp.title}</div>
          </div>
          <button
            type="button"
            onClick={() => { setSelectedRfp(null); setBids([]); }}
            style={{ background: 'transparent', color: TX2, border: `1px solid ${BORDER}`, padding: '7px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 12 }}
          >
            ← Back
          </button>
        </div>

        <div style={{ background: ACC_BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: TX2 }}>
          Weights: <strong style={{ color: TX1 }}>Price 40%</strong> · Technical 25% · Sustainability 20% · Delivery 15%. Adjust 0–100 sliders; ranking updates live.
        </div>

        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {ranked.length} bids — ranked
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  {['#', 'Bidder', 'Price', 'Technical', 'Sustainability', 'Delivery', 'Overall', 'Action'].map((h, i) => (
                    <th key={h} style={{
                      textAlign: i === 2 || i === 6 ? 'right' : 'left',
                      padding: '8px 10px',
                      color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((b, i) => {
                  const s = scoring[b.id] || { technical: 70, sustainability: 70, delivery: 70 };
                  const overall = calcOverall.get(b.id) || 0;
                  const setS = (k: 'technical' | 'sustainability' | 'delivery', v: number) =>
                    setScoring((p) => ({ ...p, [b.id]: { ...s, [k]: v } }));
                  return (
                    <tr key={b.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i === 0 ? 'oklch(0.95 0.04 155 / 0.25)' : i % 2 === 1 ? BG2 : 'transparent' }}>
                      <td style={{ padding: '10px 10px', fontFamily: MONO, color: TX2 }}>{i + 1}</td>
                      <td style={{ padding: '10px 10px', fontWeight: 600, color: TX1 }}>{b.bidder_name || b.bidder_id || 'Anonymous'}</td>
                      <td style={{ padding: '10px 10px', fontFamily: MONO, textAlign: 'right', color: TX1 }}>{formatZAR(b.proposed_price || 0)}</td>
                      <td style={{ padding: '10px 10px' }}><Slider value={s.technical} onChange={(v) => setS('technical', v)} /></td>
                      <td style={{ padding: '10px 10px' }}><Slider value={s.sustainability} onChange={(v) => setS('sustainability', v)} /></td>
                      <td style={{ padding: '10px 10px' }}><Slider value={s.delivery} onChange={(v) => setS('delivery', v)} /></td>
                      <td style={{ padding: '10px 10px', fontFamily: MONO, fontWeight: 700, textAlign: 'right', color: TX1 }}>{num(overall, 1)}</td>
                      <td style={{ padding: '10px 10px' }}>
                        <button
                          type="button"
                          onClick={() => award(b.id)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: GOOD, background: GOOD_BG, border: `1px solid ${GOOD}`, borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
                        >
                          <BadgeCheck size={12} /> Award
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${BORDER}` }}>
            <button
              type="button"
              onClick={persistScores}
              style={{ background: 'transparent', color: ACC, border: `1px solid ${ACC}`, padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
            >
              Save scores
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ borderLeft: `1px solid ${BORDER}`, background: BG1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionCard title="Scoring Weights">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <StatRow label="Price" value="40%" color={ACC} />
            <StatRow label="Technical" value="25%" />
            <StatRow label="Sustainability" value="20%" />
            <StatRow label="Delivery" value="15%" />
          </div>
        </SectionCard>
        <SectionCard title="Bid Stats">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <StatRow label="Total bids" value={num(bids.length)} />
            <StatRow label="Top score" value={ranked.length > 0 ? num(calcOverall.get(ranked[0]?.id) || 0, 1) : '—'} color={GOOD} />
            <StatRow label="Lowest price" value={bids.length > 0 ? formatZAR(Math.min(...bids.map((b) => b.proposed_price || Infinity))) : '—'} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Slider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 100 }}>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: ACC }}
      />
      <span style={{ fontSize: 11, fontFamily: MONO, width: 28, textAlign: 'right', color: TX1 }}>{value}</span>
    </div>
  );
}

// ─────────── Awards ───────────
function AwardsTab() {
  const [rfps, setRfps] = useState<Rfp[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get('/procurement/rfps').catch(() => ({ data: { success: true, data: [] } })).then((r) => {
      setRfps(((r.data?.data || []) as Rfp[]).filter((x) => x.status === 'awarded')); setLoading(false);
    });
  }, []);

  if (loading) return (
    <div style={{ padding: '24px 28px' }}><Skeleton variant="card" rows={3} /></div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', height: '100%', overflow: 'hidden' }}>
      {/* LEFT */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Awarded RFPs → LOIs
          </div>
          {rfps.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: TX3 }}>
              No awards yet. Use the Evaluation tab to score and award bids.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  {['RFP', 'Awarded To', 'Value', 'Linked LOI'].map((h, i) => (
                    <th key={h} style={{ textAlign: i >= 2 ? 'right' : 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rfps.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: TX1 }}>{r.title}</td>
                    <td style={{ padding: '10px 12px', color: TX2 }}>{r.awarded_to || '—'}</td>
                    <td style={{ padding: '10px 12px', fontFamily: MONO, textAlign: 'right', color: TX1 }}>{formatZAR(r.budget_max || 0)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <a href="/lois" style={{ fontSize: 12, color: ACC, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', fontWeight: 600 }}>
                        View LOIs <ExternalLink size={11} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ borderLeft: `1px solid ${BORDER}`, background: BG1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionCard title="Awards Summary">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <StatRow label="Total awarded" value={num(rfps.length)} color={GOOD} />
            <StatRow
              label="Total awarded value"
              value={formatZAR(rfps.reduce((s, r) => s + (r.budget_max || 0), 0))}
            />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// ─────────── Modals ───────────
function CreateRfpModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  useEscapeKey(onClose);
  const [data, setData] = useState({ title: '', description: '', budget_min: '', budget_max: '', deadline: '', project_type: 'ppa' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      await api.post('/procurement/rfps', { ...data, budget_min: Number(data.budget_min) || 0, budget_max: Number(data.budget_max) || 0 });
      onCreated(); onClose();
    } catch (e: unknown) { setError((e as Error).message || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <ModalShell onClose={onClose} title="Create RFP">
      <form onSubmit={submit}>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: error ? 12 : 0 }}>
          <FieldGroup label="Title">
            <input required value={data.title} onChange={(e) => setData({ ...data, title: e.target.value })} style={inputStyle} />
          </FieldGroup>
          <FieldGroup label="Description">
            <textarea value={data.description} onChange={(e) => setData({ ...data, description: e.target.value })} rows={3} style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical' }} />
          </FieldGroup>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FieldGroup label="Project type">
              <select value={data.project_type} onChange={(e) => setData({ ...data, project_type: e.target.value })} style={inputStyle}>
                <option value="ppa">PPA</option>
                <option value="reip">REIPPP</option>
                <option value="storage">Storage</option>
                <option value="wheeling">Wheeling</option>
              </select>
            </FieldGroup>
            <FieldGroup label="Deadline">
              <input type="date" value={data.deadline} onChange={(e) => setData({ ...data, deadline: e.target.value })} style={inputStyle} />
            </FieldGroup>
            <FieldGroup label="Min budget (ZAR)">
              <input type="number" value={data.budget_min} onChange={(e) => setData({ ...data, budget_min: e.target.value })} style={inputStyle} />
            </FieldGroup>
            <FieldGroup label="Max budget (ZAR)">
              <input type="number" value={data.budget_max} onChange={(e) => setData({ ...data, budget_max: e.target.value })} style={inputStyle} />
            </FieldGroup>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ background: 'transparent', color: TX2, border: `1px solid ${BORDER}`, padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ background: ACC, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Creating…' : 'Create RFP'}
            </button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

function RfpDetailModal({ rfp, onClose, onUpdate }: { rfp: Rfp; onClose: () => void; onUpdate: () => void }) {
  useEscapeKey(onClose);
  const { user } = useAuth();
  const [bidPrice, setBidPrice] = useState('');
  const [bidTerms, setBidTerms] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isIssuer = user?.id === (rfp as Rfp & { creator_id?: string }).creator_id || user?.id === rfp.issued_by;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true); setError(null);
    try {
      await api.post(`/procurement/rfps/${rfp.id}/bid`, { proposed_price: Number(bidPrice), proposed_terms: bidTerms });
      onUpdate(); onClose();
    } catch (e: unknown) { setError((e as Error).message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  return (
    <ModalShell onClose={onClose} title={rfp.title} wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
          <StatusBadge status={rfp.status} />
          <span style={{ color: TX3 }}>·</span>
          <span style={{ color: TX2 }}>{rfp.bid_count || 0} bids submitted</span>
          {rfp.deadline && (
            <>
              <span style={{ color: TX3 }}>·</span>
              <span style={{ color: TX2 }}>Deadline {new Date(rfp.deadline).toLocaleDateString()}</span>
            </>
          )}
        </div>
        <p style={{ fontSize: 13, color: TX2, margin: 0, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{rfp.description}</p>
        <div style={{ fontSize: 12, color: TX3 }}>
          Budget range: <span style={{ fontFamily: MONO, color: TX1 }}>{formatZAR(rfp.budget_min || 0)} – {formatZAR(rfp.budget_max || 0)}</span>
        </div>
        {!isIssuer && rfp.status === 'open' && (
          <form onSubmit={submit} style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginTop: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TX1, marginBottom: 12 }}>Submit a bid</div>
            {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <FieldGroup label="Proposed price (ZAR)">
                <input required type="number" value={bidPrice} onChange={(e) => setBidPrice(e.target.value)} style={inputStyle} />
              </FieldGroup>
              <FieldGroup label="Terms / commercial offer">
                <textarea value={bidTerms} onChange={(e) => setBidTerms(e.target.value)} rows={3} style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical' }} />
              </FieldGroup>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" disabled={submitting} style={{ background: ACC, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: submitting ? 0.6 : 1 }}>
                  {submitting ? 'Submitting…' : 'Submit bid'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </ModalShell>
  );
}

// ─────────── Shared primitives ───────────
const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  padding: '0 12px',
  borderRadius: 6,
  border: `1px solid ${BORDER}`,
  fontSize: 13,
  color: TX1,
  background: BG1,
  boxSizing: 'border-box',
  outline: 'none',
};

function ModalShell({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div style={{ background: BG1, borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', width: '100%', maxWidth: wide ? 680 : 480, margin: '0 16px', maxHeight: '90vh', overflow: 'auto', border: `1px solid ${BORDER}` }}>
        <header style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>{title}</div>
          <button type="button" onClick={onClose} aria-label="Close dialog" style={{ background: 'none', border: 'none', cursor: 'pointer', color: TX3, display: 'flex', alignItems: 'center' }}>
            <X size={18} />
          </button>
        </header>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 100 }}>
      <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || TX1, fontFamily: MONO, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
      <span style={{ color: TX2 }}>{label}</span>
      <span style={{ color: color || TX1, fontFamily: MONO, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    open:        { bg: GOOD_BG, color: GOOD },
    evaluation:  { bg: 'oklch(0.94 0.04 240)', color: 'oklch(0.35 0.14 240)' },
    awarded:     { bg: GOOD_BG, color: GOOD },
    closed:      { bg: BG2, color: TX2 },
    cancelled:   { bg: BAD_BG, color: BAD },
    submitted:   { bg: 'oklch(0.94 0.04 240)', color: 'oklch(0.35 0.14 240)' },
    shortlisted: { bg: WARN_BG, color: WARN },
    rejected:    { bg: BAD_BG, color: BAD },
  };
  const s = map[status] || { bg: BG2, color: TX2 };
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {status}
    </span>
  );
}

export default ProcurementHub;
