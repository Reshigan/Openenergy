import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award, BadgeCheck, BarChart3, Briefcase, Calendar, ChevronRight, ClipboardList,
  ExternalLink, FileText, Loader2, Plus, Search, Send, Target, TrendingUp, Users, X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import { Skeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { ErrorBanner } from '../ErrorBanner';
import { ExportBar } from '../ExportBar';
import { StitchPage } from '../StitchPage';
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

type Tab = 'browse' | 'mine' | 'mybids' | 'evaluation' | 'awards';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'browse',     label: 'Open RFPs',  icon: Search },
  { id: 'mine',       label: 'My RFPs',    icon: ClipboardList },
  { id: 'mybids',     label: 'My Bids',    icon: Send },
  { id: 'evaluation', label: 'Evaluation', icon: BarChart3 },
  { id: 'awards',     label: 'Awards',     icon: Award },
];

const formatZAR = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val || 0);
const num = (val: number, digits = 0) => new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(val || 0);

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
  const [tab, setTab] = useState<Tab>(user?.role === 'ipp_developer' || user?.role === 'trader' ? 'browse' : 'mine');

  return (
    <StitchPage
      eyebrowIcon={Briefcase}
      eyebrowLabel="Procurement"
      title="Procurement Hub"
      subtitle="Issue RFPs, track bids, run multi-criteria evaluation, and award contracts that flow into LOIs."
      tabs={TABS}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
    >
      {tab === 'browse' && <BrowseTab />}
      {tab === 'mine' && <MyRfpsTab />}
      {tab === 'mybids' && <MyBidsTab />}
      {tab === 'evaluation' && <EvaluationTab />}
      {tab === 'awards' && <AwardsTab />}
    </StitchPage>
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

  if (loading) return <Skeleton variant="card" rows={3} />;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#dde4ec] bg-white p-4 flex items-center justify-between gap-3">
        <div className="text-[13px] text-[#3d4756]">{filtered.length} open opportunities</div>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#6b7685]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search RFPs…" className="h-9 pl-7 pr-3 rounded-md border border-[#dde4ec] text-[13px] w-64" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<FileText className="w-8 h-8" />} title="No open RFPs" description="Check back later or expand your search." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((r) => (
            <button key={r.id} onClick={() => setSelected(r)}
              className="text-left rounded-xl border border-[#dde4ec] bg-white p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display font-semibold text-[14px] text-[#0f1c2e] line-clamp-2">{r.title}</h3>
                <StatusPill status={r.status} />
              </div>
              <p className="mt-2 text-[12px] text-[#3d4756] line-clamp-2">{r.description}</p>
              <div className="mt-3 flex items-center justify-between text-[11px] text-[#6b7685]">
                <span className="inline-flex items-center gap-1"><Users size={11} />{r.bid_count || 0} bids</span>
                <span className="inline-flex items-center gap-1"><Calendar size={11} />{r.deadline ? new Date(r.deadline).toLocaleDateString() : '—'}</span>
              </div>
              <div className="mt-2 text-[12px] font-mono text-[#3d4756]">{formatZAR(r.budget_min || 0)} – {formatZAR(r.budget_max || 0)}</div>
              <div className="mt-3 inline-flex items-center gap-1 text-[12px] text-[#3b82c4] font-semibold">View &amp; bid <ChevronRight size={12} /></div>
            </button>
          ))}
        </div>
      )}

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
    setRfps(((r.data?.data || []) as Rfp[]).filter((x) => ((x as Rfp & { creator_id?: string }).creator_id || x.issued_by) === user?.id));
    setLoading(false);
  }, [user?.id]);
  useEffect(() => { refresh(); }, [refresh]);

  const counts = useMemo(() => ({
    open: rfps.filter((r) => r.status === 'open').length,
    evaluation: rfps.filter((r) => r.status === 'evaluation').length,
    awarded: rfps.filter((r) => r.status === 'awarded').length,
    closed: rfps.filter((r) => r.status === 'closed').length,
  }), [rfps]);

  if (loading) return <Skeleton variant="card" rows={3} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Open"        value={num(counts.open)}        icon={ClipboardList} />
        <KPI label="Evaluation"  value={num(counts.evaluation)}  icon={BarChart3} />
        <KPI label="Awarded"     value={num(counts.awarded)}     icon={Award} tone="up" />
        <KPI label="Closed"      value={num(counts.closed)}      icon={X} />
      </div>
      <div className="rounded-xl border border-[#dde4ec] bg-white p-4 flex items-center justify-between">
        <div className="text-[13px] text-[#3d4756]">{rfps.length} RFPs you've issued</div>
        <button onClick={() => setShowCreate(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold inline-flex items-center gap-1"><Plus size={14} /> New RFP</button>
      </div>
      <Card title="Your RFPs">
        {rfps.length === 0 ? <EmptyMsg>You haven't issued any RFPs yet.</EmptyMsg> : (
          <div className="overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#fafbfd]">
                <tr className="text-[11px] uppercase text-[#6b7685]">
                  <th className="px-4 py-2 text-left">Title</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-right">Budget</th>
                  <th className="px-4 py-2 text-right">Bids</th>
                  <th className="px-4 py-2 text-left">Deadline</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rfps.map((r) => (
                  <tr key={r.id} onClick={() => setSelected(r)} className="border-t border-[#eef2f7] hover:bg-[#fafbfd] cursor-pointer">
                    <td className="px-4 py-2 font-medium">{r.title}</td>
                    <td className="px-4 py-2 capitalize">{r.project_type || '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatZAR(r.budget_max || 0)}</td>
                    <td className="px-4 py-2 text-right font-mono">{r.bid_count || 0}</td>
                    <td className="px-4 py-2 font-mono text-[11px]">{r.deadline ? new Date(r.deadline).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-2"><StatusPill status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
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
  if (loading) return <Skeleton variant="card" rows={3} />;
  const totalValue = bids.reduce((s, b) => s + (b.proposed_price || 0), 0);
  const won = bids.filter((b) => b.status === 'awarded' || b.rfp_status === 'awarded').length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Bids submitted" value={num(bids.length)} icon={Send} />
        <KPI label="Won"            value={num(won)}        icon={Award} tone="up" />
        <KPI label="Win rate"       value={`${num(bids.length > 0 ? (won / bids.length) * 100 : 0, 1)}%`} icon={TrendingUp} />
        <KPI label="Total bid value" value={formatZAR(totalValue)} icon={Target} />
      </div>
      <Card title="My bids">
        {bids.length === 0 ? <EmptyMsg>You haven't bid on any RFPs yet.</EmptyMsg> : (
          <>
            <ExportBar data={bids} filename="my_bids" />
            <div className="overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-[#fafbfd]">
                  <tr className="text-[11px] uppercase text-[#6b7685]">
                    <th className="px-4 py-2 text-left">RFP</th>
                    <th className="px-4 py-2 text-right">Proposed price</th>
                    <th className="px-4 py-2 text-right">Score</th>
                    <th className="px-4 py-2 text-left">Submitted</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bids.map((b) => (
                    <tr key={b.id} className="border-t border-[#eef2f7]">
                      <td className="px-4 py-2">{b.rfp_title || b.rfp_id}</td>
                      <td className="px-4 py-2 text-right font-mono">{formatZAR(b.proposed_price || 0)}</td>
                      <td className="px-4 py-2 text-right font-mono">{b.overall_score ? num(b.overall_score, 1) : '—'}</td>
                      <td className="px-4 py-2 font-mono text-[11px]">{b.submitted_at ? new Date(b.submitted_at).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-2"><StatusPill status={b.status || b.rfp_status || 'submitted'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
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
      setRfps(((r.data?.data || []) as Rfp[]).filter((x) => ((x as Rfp & { creator_id?: string }).creator_id || x.issued_by) === user?.id && (x.bid_count || 0) > 0));
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
    // Price-weighted: cheapest = 100, scale linearly. Combined: 40% price, 25% technical, 20% sustainability, 15% delivery.
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
      <Card title="RFPs ready to evaluate">
        {rfps.length === 0 ? <EmptyMsg>No RFPs with submitted bids yet.</EmptyMsg> : (
          <div className="space-y-2">
            {rfps.map((r) => (
              <button key={r.id} onClick={() => loadBids(r)} className="w-full flex items-center justify-between p-3 rounded-md border border-[#dde4ec] hover:border-[#3b82c4] hover:bg-[#fafbfd] text-left">
                <div>
                  <div className="text-[13px] font-semibold text-[#0f1c2e]">{r.title}</div>
                  <div className="text-[11px] text-[#6b7685] mt-0.5">{r.bid_count || 0} bids · deadline {r.deadline ? new Date(r.deadline).toLocaleDateString() : '—'}</div>
                </div>
                <ChevronRight size={16} className="text-[#3b82c4]" />
              </button>
            ))}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#dde4ec] bg-white p-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Evaluating</div>
          <div className="font-display font-semibold text-[14px] text-[#0f1c2e]">{selectedRfp.title}</div>
        </div>
        <button onClick={() => { setSelectedRfp(null); setBids([]); }} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[12px] font-semibold">← Back</button>
      </div>
      <div className="rounded-xl border border-[#dde4ec] bg-white p-3 text-[12px] text-[#3d4756]">
        Weights: <strong>Price 40%</strong> · Technical 25% · Sustainability 20% · Delivery 15%. Adjust 0–100 sliders below; ranking updates live.
      </div>
      <Card title={`${ranked.length} bids — ranked`}>
        <div className="overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-[#fafbfd]">
              <tr className="text-[11px] uppercase text-[#6b7685]">
                <th className="px-3 py-2 text-left w-8">#</th>
                <th className="px-3 py-2 text-left">Bidder</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 w-32">Technical</th>
                <th className="px-3 py-2 w-32">Sustainability</th>
                <th className="px-3 py-2 w-32">Delivery</th>
                <th className="px-3 py-2 text-right">Overall</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((b, i) => {
                const s = scoring[b.id] || { technical: 70, sustainability: 70, delivery: 70 };
                const overall = calcOverall.get(b.id) || 0;
                const setS = (k: 'technical' | 'sustainability' | 'delivery', v: number) =>
                  setScoring((p) => ({ ...p, [b.id]: { ...s, [k]: v } }));
                return (
                  <tr key={b.id} className={`border-t border-[#eef2f7] ${i === 0 ? 'bg-[#dbecfb]/30' : ''}`}>
                    <td className="px-3 py-2 font-mono">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{b.bidder_name || b.bidder_id || 'Anonymous'}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatZAR(b.proposed_price || 0)}</td>
                    <td className="px-3 py-2"><Slider value={s.technical} onChange={(v) => setS('technical', v)} /></td>
                    <td className="px-3 py-2"><Slider value={s.sustainability} onChange={(v) => setS('sustainability', v)} /></td>
                    <td className="px-3 py-2"><Slider value={s.delivery} onChange={(v) => setS('delivery', v)} /></td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-[#1a3a5c]">{num(overall, 1)}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => award(b.id)} className="text-[12px] text-[#1a8a5b] hover:underline font-semibold inline-flex items-center gap-1">
                        <BadgeCheck size={12} /> Award
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 pb-5 pt-3 flex items-center justify-end gap-2">
          <button onClick={persistScores} className="h-9 px-4 rounded-md border border-[#dde4ec] text-[#1a3a5c] text-[12px] font-semibold">Save scores</button>
        </div>
      </Card>
    </div>
  );
}

function Slider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-[#3b82c4]" />
      <span className="text-[11px] font-mono w-8 text-right">{value}</span>
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
  if (loading) return <Skeleton variant="card" rows={3} />;
  return (
    <Card title="Awarded RFPs → LOIs">
      {rfps.length === 0 ? <EmptyMsg>No awards yet. Use the Evaluation tab to score and award bids.</EmptyMsg> : (
        <div className="overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-[#fafbfd]">
              <tr className="text-[11px] uppercase text-[#6b7685]">
                <th className="px-4 py-2 text-left">RFP</th>
                <th className="px-4 py-2 text-left">Awarded to</th>
                <th className="px-4 py-2 text-right">Value</th>
                <th className="px-4 py-2 text-right">Linked LOI</th>
              </tr>
            </thead>
            <tbody>
              {rfps.map((r) => (
                <tr key={r.id} className="border-t border-[#eef2f7]">
                  <td className="px-4 py-2 font-medium">{r.title}</td>
                  <td className="px-4 py-2">{r.awarded_to || '—'}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatZAR(r.budget_max || 0)}</td>
                  <td className="px-4 py-2 text-right">
                    <a href="/lois" className="text-[12px] text-[#3b82c4] inline-flex items-center gap-1 hover:underline">View LOIs <ExternalLink size={11} /></a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
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
    <Modal onClose={onClose} title="Create RFP">
      <form onSubmit={submit} className="space-y-3">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <Field label="Title"><input required value={data.title} onChange={(e) => setData({ ...data, title: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></Field>
        <Field label="Description"><textarea value={data.description} onChange={(e) => setData({ ...data, description: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-md border border-[#dde4ec] text-[13px]" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Project type"><select value={data.project_type} onChange={(e) => setData({ ...data, project_type: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
            <option value="ppa">PPA</option><option value="reip">REIPPP</option><option value="storage">Storage</option><option value="wheeling">Wheeling</option>
          </select></Field>
          <Field label="Deadline"><input type="date" value={data.deadline} onChange={(e) => setData({ ...data, deadline: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></Field>
          <Field label="Min budget (ZAR)"><input type="number" value={data.budget_min} onChange={(e) => setData({ ...data, budget_min: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></Field>
          <Field label="Max budget (ZAR)"><input type="number" value={data.budget_max} onChange={(e) => setData({ ...data, budget_max: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[13px] font-semibold">Cancel</button>
          <button type="submit" disabled={loading} className="h-9 px-4 rounded-md bg-[#1a3a5c] text-white text-[13px] font-semibold disabled:opacity-50">{loading ? 'Creating…' : 'Create RFP'}</button>
        </div>
      </form>
    </Modal>
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
    <Modal onClose={onClose} title={rfp.title} wide>
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[12px]">
          <StatusPill status={rfp.status} />
          <span className="text-[#6b7685]">·</span>
          <span className="text-[#3d4756]">{rfp.bid_count || 0} bids submitted</span>
          {rfp.deadline && <><span className="text-[#6b7685]">·</span><span className="text-[#3d4756]">Deadline {new Date(rfp.deadline).toLocaleDateString()}</span></>}
        </div>
        <p className="text-[13px] text-[#3d4756] whitespace-pre-line">{rfp.description}</p>
        <div className="text-[12px] text-[#6b7685]">Budget range: <span className="font-mono text-[#0f1c2e]">{formatZAR(rfp.budget_min || 0)} – {formatZAR(rfp.budget_max || 0)}</span></div>
        {!isIssuer && rfp.status === 'open' && (
          <form onSubmit={submit} className="rounded-md border border-[#dde4ec] p-4 mt-3 space-y-3">
            <div className="text-[12px] font-semibold text-[#0f1c2e]">Submit a bid</div>
            {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
            <Field label="Proposed price (ZAR)"><input required type="number" value={bidPrice} onChange={(e) => setBidPrice(e.target.value)} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></Field>
            <Field label="Terms / commercial offer"><textarea value={bidTerms} onChange={(e) => setBidTerms(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-md border border-[#dde4ec] text-[13px]" /></Field>
            <div className="flex justify-end">
              <button type="submit" disabled={submitting} className="h-9 px-4 rounded-md bg-[#1a3a5c] text-white text-[13px] font-semibold disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit bid'}</button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

// ─────────── shared bits ───────────
function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`bg-white rounded-xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} mx-4 max-h-[90vh] overflow-auto`}>
        <header className="px-5 py-3 border-b border-[#eef2f7] flex items-center justify-between">
          <div className="font-display font-semibold text-[15px] text-[#0f1c2e]">{title}</div>
          <button onClick={onClose} aria-label="Close dialog" className="text-[#6b7685] hover:text-[#0f1c2e]"><X size={18} /></button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
function KPI({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub?: string; icon: React.ComponentType<{ size?: number }>; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
      <div className="flex items-center justify-between"><div className="text-[10px] uppercase tracking-wider text-[#6b7685]">{label}</div><Icon size={14} /></div>
      <div className={`mt-1 text-[22px] font-semibold font-mono ${tone === 'up' ? 'text-[#1a8a5b]' : tone === 'down' ? 'text-[#c0392b]' : 'text-[#0f1c2e]'}`}>{value}</div>
      {sub && <div className="text-[11px] text-[#6b7685] mt-1">{sub}</div>}
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#dde4ec] bg-white">
      <header className="px-5 py-3 border-b border-[#eef2f7] font-display font-semibold text-[14px] text-[#0f1c2e]">{title}</header>
      <div className="p-5">{children}</div>
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-semibold uppercase tracking-wider text-[#6b7685]">{label}</span><div className="mt-1">{children}</div></label>;
}
function EmptyMsg({ children }: { children: React.ReactNode }) { return <div className="py-6 text-center text-[13px] text-[#6b7685]">{children}</div>; }
function StatusPill({ status }: { status: string }) {
  const c: Record<string, string> = {
    open: 'bg-[#cdf0dd] text-[#1a8a5b]',
    evaluation: 'bg-[#dbecfb] text-[#3b82c4]',
    awarded: 'bg-[#cdf0dd] text-[#1a8a5b]',
    closed: 'bg-[#eef2f7] text-[#6b7685]',
    cancelled: 'bg-[#fde0db] text-[#c0392b]',
    submitted: 'bg-[#dbecfb] text-[#3b82c4]',
    shortlisted: 'bg-[#fce5c4] text-[#c97a14]',
    rejected: 'bg-[#fde0db] text-[#c0392b]',
  };
  return <span className={`px-2 py-[2px] text-[10px] uppercase font-semibold rounded ${c[status] || 'bg-[#eef2f7] text-[#6b7685]'}`}>{status}</span>;
}

export default ProcurementHub;
