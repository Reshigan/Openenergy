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
import { StitchPage } from '../StitchPage';

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

type Tab = 'holdings' | 'issuance' | 'retire' | 'nav' | 'market';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'holdings', label: 'Holdings',         icon: Leaf },
  { id: 'issuance', label: 'Issuance Pipeline', icon: GitMerge },
  { id: 'retire',   label: 'Retirement',        icon: Award },
  { id: 'nav',      label: 'Fund NAV',          icon: BarChart3 },
  { id: 'market',   label: 'Marketplace',       icon: TrendingUp },
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

  return (
    <StitchPage
      eyebrowIcon={Leaf}
      eyebrowLabel="Carbon Markets"
      title="Carbon portfolio"
      subtitle="Track VCU/REC holdings, issuance pipeline, retirement certificates and AI-computed fund NAV."
      tabs={TABS}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
    >
      {tab === 'holdings' && <HoldingsTab />}
      {tab === 'issuance' && <IssuanceTab />}
      {tab === 'retire' && <RetirementTab />}
      {tab === 'nav' && <NavTab />}
      {tab === 'market' && <MarketTab />}
    </StitchPage>
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
    const colours = ['#1a3a5c', '#3b82c4', '#1f9b95', '#5fa8e8', '#7e57c2', '#c97a14'];
    return Array.from(map.entries()).map(([name, value], i) => ({ name, value, color: colours[i % colours.length] }));
  }, [credits]);

  if (loading) return <Skeleton variant="card" rows={4} />;
  if (error) return <ErrorBanner message={error} onRetry={refresh} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total holdings" value={`${num(balance.total)} tCO₂e`} icon={Leaf} />
        <KPI label="Available"      value={`${num(balance.available)} tCO₂e`} icon={CheckCircle2} tone="up" />
        <KPI label="Retired"        value={`${num(balance.retired)} tCO₂e`} icon={Award} />
        <KPI label="Mark value"     value={formatZAR(balance.value)} icon={Target} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Vintage distribution">
          {vintageData.length === 0 ? <EmptyMsg>No credits yet.</EmptyMsg> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={vintageData}>
                <XAxis dataKey="vintage" fontSize={10} stroke="#6b7685" />
                <YAxis fontSize={10} stroke="#6b7685" />
                <Tooltip formatter={(v: number) => [`${num(v)} tCO₂e`, 'Credits']} />
                <Bar dataKey="qty" radius={[4, 4, 0, 0]} fill="#3b82c4" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="By methodology">
          {methodologyData.length === 0 ? <EmptyMsg>No credits yet.</EmptyMsg> : (
            <div className="grid grid-cols-2 items-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={methodologyData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2} stroke="#fff">
                    {methodologyData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [`${num(v)} tCO₂e`, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1">
                {methodologyData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-[12px]">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                    <span className="text-[#3d4756]">{d.name}</span>
                    <span className="ml-auto font-mono">{num(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card title="Credit holdings">
        {credits.length === 0 ? <EmptyState icon={<Leaf className="w-8 h-8" />} title="No carbon credits" description="Purchase credits or wait for project issuance." /> : (
          <>
            <ExportBar data={credits} filename="carbon_credits" />
            <div className="overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-[#fafbfd]">
                  <tr className="text-[11px] uppercase text-[#6b7685]">
                    <th className="px-4 py-2 text-left">Project</th>
                    <th className="px-4 py-2 text-left">Methodology</th>
                    <th className="px-4 py-2 text-left">Vintage</th>
                    <th className="px-4 py-2 text-right">Quantity</th>
                    <th className="px-4 py-2 text-right">Price</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {credits.map((c, i) => (
                    <tr key={c.id || i} className="border-t border-[#eef2f7] hover:bg-[#fafbfd]">
                      <td className="px-4 py-2">{c.project_id ? <EntityLink id={c.project_id} type="project" /> : (c.project_name || '—')}</td>
                      <td className="px-4 py-2 text-[#3d4756]">{c.methodology || '—'}</td>
                      <td className="px-4 py-2 font-mono">{c.vintage || '—'}</td>
                      <td className="px-4 py-2 text-right font-mono">{num(c.quantity || 0)} tCO₂e</td>
                      <td className="px-4 py-2 text-right font-mono">{formatZAR(c.price_per_credit || 150)}</td>
                      <td className="px-4 py-2"><StatusPill status={c.status || 'available'} /></td>
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
    <div className="space-y-4">
      <div className="rounded-xl border border-[#dde4ec] bg-white p-4 flex items-center justify-between">
        <div className="text-[13px] text-[#3d4756]">{pipeline.length} projects across the registry pipeline.</div>
        <button type="button" className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold inline-flex items-center gap-1"><Plus size={14} /> Register project</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {stages.map((s) => {
          const items = grouped.get(s) || [];
          return (
            <div key={s} className="rounded-xl border border-[#dde4ec] bg-[#fafbfd] flex flex-col">
              <header className="px-3 py-2 border-b border-[#eef2f7] flex items-center justify-between">
                <div className="text-[11px] uppercase font-semibold tracking-wider text-[#3d4756]">{stageLabels[s]}</div>
                <div className="text-[11px] font-mono text-[#6b7685]">{items.length}</div>
              </header>
              <div className="p-2 space-y-2 min-h-[200px]">
                {items.map((p) => (
                  <div key={p.id} className="rounded-md border border-[#dde4ec] bg-white p-3 hover:shadow-md transition-shadow">
                    <div className="text-[12px] font-semibold text-[#0f1c2e] truncate">{p.project_name}</div>
                    <div className="text-[10px] text-[#6b7685] mt-1 flex items-center gap-1"><Factory size={10} /> {p.methodology}</div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-[14px] font-mono font-semibold">{num(p.estimated_credits || 0)}</span>
                      <span className="text-[10px] text-[#6b7685]">tCO₂e</span>
                    </div>
                    <div className="mt-1 text-[10px] text-[#6b7685] font-mono">Vintage {p.vintage}</div>
                    {p.verifier && <div className="mt-1 text-[10px] text-[#3d4756]">Verifier: {p.verifier}</div>}
                  </div>
                ))}
                {items.length === 0 && <div className="text-[11px] text-[#6b7685] text-center pt-8">—</div>}
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KPI label="Total retired"      value={`${num(totalRetired)} tCO₂e`} icon={Award} />
        <KPI label="Certificates"       value={num(retired.length)}          icon={FileText} />
        <KPI label="Available to retire" value={`${num(available.reduce((s, c) => s + (c.quantity || 0), 0))} tCO₂e`} icon={Leaf} tone="up" />
      </div>

      <div className="rounded-xl border border-[#dde4ec] bg-white p-5 flex items-center justify-between">
        <div>
          <div className="font-display font-semibold text-[14px] text-[#0f1c2e]">Retire carbon credits</div>
          <div className="text-[12px] text-[#3d4756] mt-1">Generate a verifiable retirement certificate stored in the platform vault.</div>
        </div>
        <button type="button" onClick={() => setShowModal(true)} className="h-9 px-4 rounded-md bg-[#c2873a] text-white text-[13px] font-semibold inline-flex items-center gap-2">
          <Award size={14} /> Retire credits
        </button>
      </div>

      <Card title="Retirement certificates">
        {retired.length === 0 ? <EmptyMsg>No retirements yet.</EmptyMsg> : (
          <div className="overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#fafbfd]">
                <tr className="text-[11px] uppercase text-[#6b7685]">
                  <th className="px-4 py-2 text-left">Project</th>
                  <th className="px-4 py-2 text-left">Methodology</th>
                  <th className="px-4 py-2 text-left">Vintage</th>
                  <th className="px-4 py-2 text-right">Quantity</th>
                  <th className="px-4 py-2 text-left">Serial</th>
                  <th className="px-4 py-2 text-right">Certificate</th>
                </tr>
              </thead>
              <tbody>
                {retired.map((c, i) => (
                  <tr key={c.id || i} className="border-t border-[#eef2f7]">
                    <td className="px-4 py-2">{c.project_name || '—'}</td>
                    <td className="px-4 py-2 text-[#3d4756]">{c.methodology || '—'}</td>
                    <td className="px-4 py-2 font-mono">{c.vintage || '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{num(c.quantity || 0)} tCO₂e</td>
                    <td className="px-4 py-2 font-mono text-[11px] text-[#6b7685]">{c.serial_number || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      {c.retirement_certificate_url ? (
                        <a href={c.retirement_certificate_url} target="_blank" rel="noreferrer" className="text-[12px] text-[#3b82c4] inline-flex items-center gap-1 hover:underline">
                          <ExternalLink size={12} /> Open
                        </a>
                      ) : <span className="text-[11px] text-[#6b7685]">Pending</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="px-5 py-3 border-b border-[#eef2f7] flex items-center gap-2">
          <Award size={16} /> <h3 className="font-display font-semibold text-[15px] text-[#0f1c2e]">Retire carbon credits</h3>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          <Field label="Credit"><select required value={creditId} onChange={(e) => setCreditId(e.target.value)} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
            {credits.map((c) => <option key={c.id} value={c.id}>{c.project_name || c.id} · {c.methodology} · {c.vintage} · {num(c.quantity || 0)} tCO₂e</option>)}
            {credits.length === 0 && <option>— no available credits —</option>}
          </select></Field>
          <Field label="Quantity (tCO₂e)"><input type="number" required value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></Field>
          <Field label="Beneficiary (optional)"><input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder="On behalf of…" className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></Field>
          <Field label="Reason"><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-md border border-[#dde4ec] text-[13px]" placeholder="Reason / claim period / project alignment" /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[13px] font-semibold">Cancel</button>
            <button type="submit" disabled={loading || !creditId} className="h-9 px-4 rounded-md bg-[#c2873a] text-white text-[13px] font-semibold disabled:opacity-50">
              {loading ? 'Retiring…' : 'Retire & generate certificate'}
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Fund NAV"        value={formatZAR(summary?.nav || 0)} icon={BarChart3} />
        <KPI label="Total credits"   value={`${num(summary?.total_credits || 0)} tCO₂e`} icon={Leaf} />
        <KPI label="Weighted price"  value={formatZAR(summary?.weighted_price || 0)} icon={Target} />
        <KPI label="Last computed"   value={summary?.updated_at ? new Date(summary.updated_at).toLocaleDateString() : '—'} icon={Clock} sub={summary?.updated_at ? new Date(summary.updated_at).toLocaleTimeString() : undefined} />
      </div>
      <div className="rounded-xl border border-[#dde4ec] bg-white p-5 flex items-center justify-between">
        <div>
          <div className="font-display font-semibold text-[14px] text-[#0f1c2e] flex items-center gap-2"><Sparkles size={14} /> AI NAV computation</div>
          <div className="text-[12px] text-[#3d4756] mt-1">Rebuilds the methodology / vintage breakdown using live market prices.</div>
        </div>
        <button type="button" onClick={compute} disabled={computing} className="h-9 px-4 rounded-md bg-[#c2873a] text-white text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
          {computing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Compute now
        </button>
      </div>
      {narrative && (
        <Card title="NAV commentary">
          <NarrativeText text={narrative} />
        </Card>
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
    <Card title="Options book">
      {options.length === 0 ? <EmptyMsg>No active options.</EmptyMsg> : (
        <div className="overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-[#fafbfd]">
              <tr className="text-[11px] uppercase text-[#6b7685]">
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-right">Strike</th>
                <th className="px-4 py-2 text-right">Expiry</th>
                <th className="px-4 py-2 text-right">Δ / Γ</th>
              </tr>
            </thead>
            <tbody>
              {options.map((o, i) => (
                <tr key={i} className="border-t border-[#eef2f7]">
                  <td className="px-4 py-2">
                    <span className={`px-2 py-[2px] text-[10px] uppercase font-semibold rounded ${(o.type as string) === 'call' ? 'bg-[#cdf0dd] text-[#1a8a5b]' : 'bg-[#fde0db] text-[#c0392b]'}`}>
                      {(o.type as string)?.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{formatZAR(Number(o.strike || 0))}</td>
                  <td className="px-4 py-2 text-right font-mono">{(o.expiry as string) || '—'}</td>
                  <td className="px-4 py-2 text-right font-mono">Δ {o.delta as number} | Γ {o.gamma as number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ────────────── shared ──────────────
function KPI({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub?: string; icon: React.ComponentType<{ size?: number }>; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">{label}</div>
        <Icon size={14} />
      </div>
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
    available: 'bg-[#cdf0dd] text-[#1a8a5b]',
    issued: 'bg-[#dbecfb] text-[#3b82c4]',
    pending: 'bg-[#fce5c4] text-[#c97a14]',
    verifying: 'bg-[#fce5c4] text-[#c97a14]',
    retired: 'bg-[#eef2f7] text-[#6b7685]',
  };
  return <span className={`px-2 py-[2px] text-[10px] uppercase font-semibold rounded ${c[status] || 'bg-[#eef2f7] text-[#6b7685]'}`}>{status}</span>;
}

export default Carbon;
