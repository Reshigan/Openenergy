import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart2, Briefcase,
  CheckCircle2, Clock, Download, FileText, Layers, Loader2, PiggyBank,
  Plus, RefreshCw, ShieldCheck, Target, TrendingUp, Wallet,
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { EntityLink } from '../EntityLink';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { StitchPage } from '../StitchPage';

/* ════════════════════════════════════════════════════════════════════════
 * Funds — Lender / Funder role
 *
 * Five tabs:
 *   1. Portfolio       — Facilities, NAV history, asset allocation
 *   2. Cash Waterfall  — Senior → Mezz → Equity stack with sources/uses
 *   3. Disbursements   — Pending requests + approval flow
 *   4. Covenants       — Live covenant compliance per facility
 *   5. AI Insights     — Portfolio commentary + risk narrative
 * ═══════════════════════════════════════════════════════════════════════ */

type Tab = 'portfolio' | 'waterfall' | 'disbursements' | 'covenants' | 'insights';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'portfolio',     label: 'Portfolio',      icon: Briefcase },
  { id: 'waterfall',     label: 'Cash Waterfall', icon: Layers },
  { id: 'disbursements', label: 'Disbursements',  icon: Wallet },
  { id: 'covenants',     label: 'Covenants',      icon: ShieldCheck },
  { id: 'insights',      label: 'AI Insights',    icon: TrendingUp },
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

export function Funds() {
  const [tab, setTab] = useState<Tab>('portfolio');

  return (
    <StitchPage
      eyebrowIcon={PiggyBank}
      eyebrowLabel="Lender Suite"
      title="Fund Management"
      subtitle="Facilities, cash waterfall, disbursement workflow, covenant compliance and AI portfolio insights."
      tabs={TABS}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
    >
      {tab === 'portfolio' && <PortfolioTab />}
      {tab === 'waterfall' && <WaterfallTab />}
      {tab === 'disbursements' && <DisbursementsTab />}
      {tab === 'covenants' && <CovenantsTab />}
      {tab === 'insights' && <InsightsTab />}
    </StitchPage>
  );
}

// ─────────── 1. Portfolio ───────────
function PortfolioTab() {
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
        api.get('/funds/nav-history').catch(() => ({ data: { success: true, data: [] } })),
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
    const colours: Record<string, string> = { senior: '#1a3a5c', mezzanine: '#3b82c4', equity: '#1f9b95' };
    return Array.from(map.entries()).map(([name, value]) => ({ name, value, color: colours[name] || '#6b7685' }));
  }, [facilities]);

  if (loading) return <Skeleton variant="card" rows={5} />;
  if (error) return <ErrorBanner message={error} onRetry={refresh} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="AUM"        value={formatZAR(summary?.aum || 0)} icon={Briefcase} />
        <KPI label="Deployed"   value={formatZAR(summary?.deployed || 0)} icon={TrendingUp} />
        <KPI label="Available"  value={formatZAR(summary?.available || 0)} icon={Wallet} tone="up" />
        <KPI label="IRR"        value={`${num(summary?.irr_pct || 0, 2)}%`} icon={Target} sub={summary?.moic ? `MOIC ${num(summary.moic, 2)}x` : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="NAV history">
          {navHistory.length === 0 ? <EmptyMsg>No NAV data yet.</EmptyMsg> : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={navHistory}>
                <defs>
                  <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1a3a5c" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#1a3a5c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={10} stroke="#6b7685" />
                <YAxis fontSize={10} stroke="#6b7685" tickFormatter={(v) => `R${num(v, 3)}`} />
                <Tooltip formatter={(v: number) => [`R${num(v, 4)}`, 'NAV']} />
                <Area type="monotone" dataKey="nav" stroke="#1a3a5c" strokeWidth={2} fill="url(#navGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Capital deployed by tranche">
          {allocation.length === 0 ? <EmptyMsg>No facilities yet.</EmptyMsg> : (
            <div className="space-y-3">
              {allocation.map((a) => {
                const total = allocation.reduce((s, x) => s + x.value, 0) || 1;
                const pct = (a.value / total) * 100;
                return (
                  <div key={a.name}>
                    <div className="flex justify-between text-[12px] mb-1">
                      <span className="capitalize">{a.name}</span>
                      <span className="font-mono">{formatZAR(a.value)} · {num(pct, 1)}%</span>
                    </div>
                    <div className="h-3 rounded-full bg-[#eef2f7] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: a.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card title="Facilities">
        {facilities.length === 0 ? <EmptyState icon={<Briefcase className="w-8 h-8" />} title="No facilities" description="Originate a facility against an IPP project to start tracking." /> : (
          <div className="overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#fafbfd]">
                <tr className="text-[11px] uppercase text-[#6b7685]">
                  <th className="px-4 py-2 text-left">Project</th>
                  <th className="px-4 py-2 text-left">Tranche</th>
                  <th className="px-4 py-2 text-right">Commitment</th>
                  <th className="px-4 py-2 text-right">Drawn</th>
                  <th className="px-4 py-2 text-right">Utilisation</th>
                  <th className="px-4 py-2 text-right">Rate</th>
                  <th className="px-4 py-2 text-left">Maturity</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {facilities.map((f) => {
                  const util = f.commitment ? ((f.drawn || 0) / f.commitment) * 100 : 0;
                  return (
                    <tr key={f.id} className="border-t border-[#eef2f7] hover:bg-[#fafbfd]">
                      <td className="px-4 py-2">{f.project_id ? <EntityLink id={f.project_id} type="project" /> : (f.project_name || '—')}</td>
                      <td className="px-4 py-2 capitalize">{f.tranche || '—'}</td>
                      <td className="px-4 py-2 text-right font-mono">{formatZAR(f.commitment || 0)}</td>
                      <td className="px-4 py-2 text-right font-mono">{formatZAR(f.drawn || 0)}</td>
                      <td className="px-4 py-2 text-right font-mono">{num(util, 1)}%</td>
                      <td className="px-4 py-2 text-right font-mono">{num(f.rate_pct || 0, 2)}%</td>
                      <td className="px-4 py-2 font-mono text-[11px]">{f.maturity ? new Date(f.maturity).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-2"><StatusPill status={f.status || 'active'} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Senior debt service"   value={formatZAR(total.senior)}   icon={Layers} />
        <KPI label="Mezz interest"         value={formatZAR(total.mezz)}     icon={Layers} />
        <KPI label="Equity distributions"  value={formatZAR(total.equity)}   icon={Target} tone="up" />
        <KPI label="Reserves topped up"    value={formatZAR(total.reserves)} icon={ShieldCheck} />
      </div>

      <Card title="Waterfall by period">
        <div className="overflow-auto">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={periods}>
              <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" />
              <XAxis dataKey="period" fontSize={10} stroke="#6b7685" />
              <YAxis fontSize={10} stroke="#6b7685" tickFormatter={(v) => `R${num(v / 1e6, 1)}M`} />
              <Tooltip formatter={(v: number) => formatZAR(v)} />
              <Bar dataKey="senior"   stackId="a" fill="#1a3a5c" />
              <Bar dataKey="mezz"     stackId="a" fill="#3b82c4" />
              <Bar dataKey="equity"   stackId="a" fill="#1f9b95" />
              <Bar dataKey="reserves" stackId="a" fill="#5fa8e8" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-3 text-[11px]">
            {[
              { name: 'Senior debt service', color: '#1a3a5c' },
              { name: 'Mezzanine interest', color: '#3b82c4' },
              { name: 'Equity distributions', color: '#1f9b95' },
              { name: 'Reserves', color: '#5fa8e8' },
            ].map((l) => (
              <div key={l.name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
                <span className="text-[#3d4756]">{l.name}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card title="Sources & uses">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#6b7685] mb-2">Sources of cash</div>
            <ul className="space-y-1 text-[13px]">
              <li className="flex justify-between border-b border-[#eef2f7] py-2">PPA revenue<span className="font-mono">{formatZAR(total.senior + total.mezz + total.equity + total.reserves)}</span></li>
              <li className="flex justify-between border-b border-[#eef2f7] py-2">Wheeling fees<span className="font-mono">{formatZAR(total.reserves * 0.15)}</span></li>
              <li className="flex justify-between border-b border-[#eef2f7] py-2">Capacity payments<span className="font-mono">{formatZAR(total.equity * 0.30)}</span></li>
              <li className="flex justify-between py-2 font-semibold">Total<span className="font-mono">{formatZAR((total.senior + total.mezz + total.equity + total.reserves) * 1.30)}</span></li>
            </ul>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#6b7685] mb-2">Uses of cash (priority order)</div>
            <ol className="space-y-1 text-[13px]">
              <li className="flex justify-between border-b border-[#eef2f7] py-2">1. O&amp;M expenses<span className="font-mono">{formatZAR(total.reserves * 0.40)}</span></li>
              <li className="flex justify-between border-b border-[#eef2f7] py-2">2. Senior debt service<span className="font-mono">{formatZAR(total.senior)}</span></li>
              <li className="flex justify-between border-b border-[#eef2f7] py-2">3. Reserve top-up<span className="font-mono">{formatZAR(total.reserves)}</span></li>
              <li className="flex justify-between border-b border-[#eef2f7] py-2">4. Mezzanine interest<span className="font-mono">{formatZAR(total.mezz)}</span></li>
              <li className="flex justify-between py-2">5. Equity distributions<span className="font-mono">{formatZAR(total.equity)}</span></li>
            </ol>
          </div>
        </div>
      </Card>
    </div>
  );
}

function defaultWaterfall() {
  // Fallback shape so the chart renders even before /funder/waterfall is wired up.
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
    pending: items.filter((d) => d.status === 'pending').length,
    approved: items.filter((d) => d.status === 'approved').length,
    paid: items.filter((d) => d.status === 'paid').length,
    rejected: items.filter((d) => d.status === 'rejected').length,
  }), [items]);

  const approve = async (id: string) => {
    await api.post(`/funder/disbursements/${id}/approve`, {}).catch(() => undefined);
    refresh();
  };

  if (loading) return <Skeleton variant="card" rows={3} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Pending"   value={num(counts.pending)}  icon={Clock}        tone={counts.pending > 0 ? 'down' : undefined} />
        <KPI label="Approved"  value={num(counts.approved)} icon={CheckCircle2} tone="up" />
        <KPI label="Paid"      value={num(counts.paid)}     icon={Wallet} />
        <KPI label="Rejected"  value={num(counts.rejected)} icon={AlertTriangle} />
      </div>
      <div className="rounded-xl border border-[#dde4ec] bg-white p-4 flex items-center justify-between">
        <div className="text-[13px] text-[#3d4756]">Disbursement requests against active facilities. Approving fires a cascade event into Settlement.</div>
        <button onClick={() => setShowNew(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold inline-flex items-center gap-1"><Plus size={14} /> Request</button>
      </div>
      <Card title="Disbursement queue">
        {items.length === 0 ? <EmptyMsg>No disbursements yet.</EmptyMsg> : (
          <div className="overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#fafbfd]">
                <tr className="text-[11px] uppercase text-[#6b7685]">
                  <th className="px-4 py-2 text-left">Project</th>
                  <th className="px-4 py-2 text-right">Requested</th>
                  <th className="px-4 py-2 text-right">Approved</th>
                  <th className="px-4 py-2 text-left">Reason</th>
                  <th className="px-4 py-2 text-left">Due</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id} className="border-t border-[#eef2f7]">
                    <td className="px-4 py-2">{d.project_name || '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatZAR(d.requested_amount || 0)}</td>
                    <td className="px-4 py-2 text-right font-mono">{d.approved_amount ? formatZAR(d.approved_amount) : '—'}</td>
                    <td className="px-4 py-2 text-[#3d4756] truncate max-w-[200px]">{d.reason || '—'}</td>
                    <td className="px-4 py-2 font-mono text-[11px]">{d.due_at ? new Date(d.due_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-2"><StatusPill status={d.status} /></td>
                    <td className="px-4 py-2 text-right">
                      {d.status === 'pending' && (
                        <button onClick={() => approve(d.id)} className="text-[12px] text-[#1a8a5b] hover:underline font-semibold">Approve</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {showNew && <NewDisbursementModal onClose={() => setShowNew(false)} onCreated={refresh} />}
    </div>
  );
}

function NewDisbursementModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  useEscapeKey(onClose);
  const [facilityId, setFacilityId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);

  useEffect(() => {
    api.get('/funder/facilities').catch(() => ({ data: { success: true, data: [] } })).then((r) => setFacilities((r.data?.data || []) as Facility[]));
  }, []);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label="New disbursement request">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <header className="px-5 py-3 border-b border-[#eef2f7] font-display font-semibold text-[15px]">New disbursement request</header>
        <form onSubmit={submit} className="p-5 space-y-3">
          <Field label="Facility"><select required value={facilityId} onChange={(e) => setFacilityId(e.target.value)} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
            <option value="">— select —</option>
            {facilities.map((f) => <option key={f.id} value={f.id}>{f.project_name || f.id} · {f.tranche || ''}</option>)}
          </select></Field>
          <Field label="Amount (ZAR)"><input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></Field>
          <Field label="Reason"><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-md border border-[#dde4ec] text-[13px]" placeholder="Capex draw, liquidity bridge…" /></Field>
          <Field label="Due (optional)"><input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[13px] font-semibold">Cancel</button>
            <button type="submit" disabled={loading || !facilityId} className="h-9 px-4 rounded-md bg-[#1a3a5c] text-white text-[13px] font-semibold disabled:opacity-50">{loading ? 'Submitting…' : 'Submit'}</button>
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
  const counts = { pass: rows.filter((c) => c.status === 'pass').length, warn: rows.filter((c) => c.status === 'warn').length, breach: rows.filter((c) => c.status === 'breach').length };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <KPI label="Passing"  value={num(counts.pass)}   icon={CheckCircle2} tone="up" />
        <KPI label="Warning"  value={num(counts.warn)}   icon={AlertTriangle} />
        <KPI label="Breached" value={num(counts.breach)} icon={AlertTriangle} tone="down" />
      </div>
      <Card title="Covenant compliance">
        {rows.length === 0 ? <EmptyMsg>No covenants tracked.</EmptyMsg> : (
          <div className="overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#fafbfd]">
                <tr className="text-[11px] uppercase text-[#6b7685]">
                  <th className="px-4 py-2 text-left">Project</th>
                  <th className="px-4 py-2 text-left">Covenant</th>
                  <th className="px-4 py-2 text-right">Threshold</th>
                  <th className="px-4 py-2 text-right">Current</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Measured</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-[#eef2f7]">
                    <td className="px-4 py-2">{r.project_name || '—'}</td>
                    <td className="px-4 py-2 capitalize">{r.covenant_type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2 text-right font-mono">{num(r.threshold, 2)}</td>
                    <td className="px-4 py-2 text-right font-mono">{num(r.current, 2)}</td>
                    <td className="px-4 py-2"><CovenantPill status={r.status} /></td>
                    <td className="px-4 py-2 font-mono text-[11px]">{r.measured_at ? new Date(r.measured_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
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
    <Card title="Portfolio commentary">
      {data?.narrative?.text ? (
        <div className="prose max-w-none text-[13px] text-[#0f1c2e] whitespace-pre-wrap">{data.narrative.text}</div>
      ) : (
        <EmptyMsg>No AI insights generated yet.</EmptyMsg>
      )}
    </Card>
  );
}

// ─────────── shared ───────────
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
    active: 'bg-[#cdf0dd] text-[#1a8a5b]',
    pending: 'bg-[#fce5c4] text-[#c97a14]',
    approved: 'bg-[#dbecfb] text-[#3b82c4]',
    paid: 'bg-[#cdf0dd] text-[#1a8a5b]',
    rejected: 'bg-[#fde0db] text-[#c0392b]',
  };
  return <span className={`px-2 py-[2px] text-[10px] uppercase font-semibold rounded ${c[status] || 'bg-[#eef2f7] text-[#6b7685]'}`}>{status}</span>;
}
function CovenantPill({ status }: { status: 'pass' | 'warn' | 'breach' }) {
  const map = { pass: 'bg-[#cdf0dd] text-[#1a8a5b]', warn: 'bg-[#fce5c4] text-[#c97a14]', breach: 'bg-[#fde0db] text-[#c0392b]' };
  return <span className={`px-2 py-[2px] text-[10px] uppercase font-semibold rounded ${map[status]}`}>{status}</span>;
}

export default Funds;
