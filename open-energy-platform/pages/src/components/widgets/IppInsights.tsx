// ════════════════════════════════════════════════════════════════════════
// IppInsights — decision-support widgets for the IPP workbench.
//
//   1. EnvComplianceHeatmap — EA condition matrix (compliance status × days to deadline)
//   2. MilestoneCriticalPath — bar timeline of milestones, slip-tinted
//   3. LdCalculator — what-if liquidated damages on delay
//   4. TariffComparison — PPA vs utility tariff per MWh side-by-side
//   5. ProjectHealthScorecard — composite traffic-light over 6 dimensions
//
// All read from existing endpoints (/ipp/* + /projects/*).
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { api } from '../../lib/api';

type EaCondition = {
  id: string;
  condition_text?: string;
  reference?: string;
  due_date?: string | null;
  status: 'pending' | 'partial' | 'compliant' | 'breach';
  authorisation_id?: string;
};

type Milestone = {
  id: string;
  milestone_name?: string;
  name?: string;
  due_date?: string | null;
  achieved_date?: string | null;
  status: string;
};

type Epc = {
  id: string;
  contractor_name?: string;
  lump_sum_zar?: number;
  ld_daily_rate_zar?: number;
  ld_cap_percentage?: number;
  target_completion_date?: string | null;
};

type Project = {
  id: string;
  project_name?: string;
  capacity_mw?: number;
  total_capex_zar?: number;
  cod_date?: string | null;
  status?: string;
  irr_target_pct?: number;
  ppa_status?: string;
};

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

// ─── 1 ─── EA condition heatmap ───────────────────────────────────────
function EnvComplianceHeatmap({ conditions }: { conditions: EaCondition[] }) {
  if (!conditions.length) {
    return <section className="rounded-xl border border-[#dde4ec] bg-white p-4 text-[12px] text-[#6b7685]">No environmental authorisation conditions tracked yet.</section>;
  }
  const today = Date.now();
  const enriched = conditions.map((c) => {
    const due = c.due_date ? new Date(c.due_date).getTime() : null;
    const days = due ? Math.ceil((due - today) / 86_400_000) : null;
    return { ...c, days };
  });
  const bucket = (days: number | null, status: string) => {
    if (status === 'breach') return 'bad';
    if (status === 'compliant') return 'good';
    if (days == null) return 'info';
    if (days < 0) return 'bad';
    if (days <= 14) return 'warn';
    if (days <= 60) return 'info';
    return 'good';
  };
  const tones: Record<string, string> = {
    good: 'bg-[#e7f4ea] text-[#1a8a5b]',
    warn: 'bg-[#fef3e6] text-[#b04e0f]',
    bad:  'bg-[#fde0db] text-[#c0392b]',
    info: 'bg-[#eef2f7] text-[#3b82c4]',
  };
  return (
    <section className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">Environmental compliance heatmap</div>
        <div className="text-[11px] text-[#6b7685]">EA conditions tinted by days-to-deadline and compliance status</div>
      </header>
      <div className="p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {enriched.map((c) => {
          const tone = bucket(c.days, c.status);
          return (
            <div key={c.id} className={`rounded p-2 text-[11px] ${tones[tone]}`}>
              <div className="font-semibold truncate" title={c.condition_text}>{c.reference || c.condition_text?.slice(0, 24) || 'Condition'}</div>
              <div className="mt-1 flex items-center justify-between text-[10px] opacity-80">
                <span className="capitalize">{c.status}</span>
                <span className="font-mono">
                  {c.days == null ? '—' : c.days < 0 ? `${Math.abs(c.days)}d overdue` : `${c.days}d`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── 2 ─── Milestone critical path ────────────────────────────────────
function MilestoneCriticalPath({ milestones }: { milestones: Milestone[] }) {
  const data = useMemo(() => {
    const today = Date.now();
    return milestones
      .filter((m) => m.due_date)
      .map((m) => {
        const due = new Date(m.due_date!).getTime();
        const achieved = m.achieved_date ? new Date(m.achieved_date).getTime() : null;
        const slipDays = achieved
          ? Math.round((achieved - due) / 86_400_000)
          : (m.status === 'achieved' || m.status === 'satisfied' ? 0
             : Math.round((today - due) / 86_400_000));
        const daysToDue = Math.round((due - today) / 86_400_000);
        return {
          name: (m.milestone_name || m.name || m.id).slice(0, 28),
          slipDays,
          daysToDue,
          status: m.status,
        };
      })
      .sort((a, b) => a.daysToDue - b.daysToDue)
      .slice(0, 14);
  }, [milestones]);

  if (!data.length) {
    return <section className="rounded-xl border border-[#dde4ec] bg-white p-4 text-[12px] text-[#6b7685]">No milestones with due dates.</section>;
  }

  return (
    <section className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">Milestone critical path</div>
        <div className="text-[11px] text-[#6b7685]">Slip days vs plan — positive bars = late</div>
      </header>
      <div style={{ height: 280 }} className="px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 12, left: 60 }}>
            <CartesianGrid stroke="#eef2f7" />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7685' }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#6b7685' }} width={140} />
            <Tooltip formatter={(v: any) => `${Number(v)}d`} />
            <ReferenceLine x={0} stroke="#1a3a5c" />
            <Bar dataKey="slipDays" name="Slip days">
              {data.map((d, i) => (
                <Cell key={i} fill={d.slipDays > 14 ? '#c0392b' : d.slipDays > 0 ? '#b04e0f' : '#1a8a5b'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ─── 3 ─── LD calculator ──────────────────────────────────────────────
function LdCalculator({ epcs }: { epcs: Epc[] }) {
  const epc = epcs[0];
  const [delayDays, setDelayDays] = useState(30);
  const dailyRate = Number(epc?.ld_daily_rate_zar || 0);
  const capPct = Number(epc?.ld_cap_percentage || 10);
  const lumpSum = Number(epc?.lump_sum_zar || 0);
  const capValue = lumpSum * (capPct / 100);
  const rawLd = dailyRate * delayDays;
  const cappedLd = Math.min(rawLd, capValue);
  const utilisationPct = capValue > 0 ? Math.min(100, (rawLd / capValue) * 100) : 0;

  return (
    <section className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">Liquidated damages calculator</div>
        <div className="text-[11px] text-[#6b7685]">
          {epc ? `${epc.contractor_name} · R${dailyRate.toLocaleString()}/day · cap ${capPct}% of ${formatZAR(lumpSum)}`
               : 'No EPC contract on this project'}
        </div>
      </header>
      <div className="grid grid-cols-3 gap-3 px-4 py-3 border-b border-[#eef2f7] bg-[#fafbfd]">
        <label className="block text-[11px]">
          <div className="flex justify-between"><span>Delay days</span><span className="font-mono">{delayDays}</span></div>
          <input type="range" min={0} max={365} value={delayDays} onChange={(e) => setDelayDays(Number(e.target.value))} className="w-full accent-[#1a3a5c]" />
        </label>
        <Tile label="LD accrued (raw)"  value={formatZAR(rawLd)}    tone="warn" />
        <Tile label="LD payable (capped)" value={formatZAR(cappedLd)} tone={cappedLd >= capValue ? 'bad' : 'info'} />
      </div>
      <div className="px-4 py-3 text-[11px]">
        <div className="flex justify-between mb-1">
          <span className="text-[#6b7685]">Cap utilisation</span>
          <span className="font-mono font-semibold">{utilisationPct.toFixed(1)}%</span>
        </div>
        <div className="h-2 rounded-full bg-[#eef2f7] overflow-hidden">
          <div
            className="h-full"
            style={{
              width: `${utilisationPct}%`,
              background: utilisationPct >= 100 ? '#c0392b' : utilisationPct >= 75 ? '#b04e0f' : '#3b82c4',
            }}
          />
        </div>
      </div>
    </section>
  );
}

// ─── 4 ─── Tariff comparison ──────────────────────────────────────────
function TariffComparison({ project }: { project: Project | null }) {
  const [ppaPrice, setPpaPrice] = useState(1300);
  const [utilityPrice, setUtilityPrice] = useState(2150); // Eskom Megaflex ~ 2.15 R/kWh = 2150 R/MWh
  const annualMwh = project?.capacity_mw ? Math.round(project.capacity_mw * 0.27 * 8760) : 200_000; // 27% CF default

  const rows = [
    { tariff: 'PPA',          rate: ppaPrice,     annual: ppaPrice * annualMwh },
    { tariff: 'Utility flat', rate: utilityPrice, annual: utilityPrice * annualMwh },
    { tariff: 'Spot',         rate: 1500,         annual: 1500 * annualMwh },
  ];
  const savings = rows[1].annual - rows[0].annual;

  return (
    <section className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">Tariff comparison</div>
        <div className="text-[11px] text-[#6b7685]">
          PPA vs utility vs spot — annualised at {(annualMwh / 1000).toFixed(0)} GWh
        </div>
      </header>
      <div className="grid grid-cols-2 gap-3 px-4 py-3 border-b border-[#eef2f7] bg-[#fafbfd]">
        <label className="block text-[11px]">
          <div className="flex justify-between"><span>PPA price (R/MWh)</span><span className="font-mono">{ppaPrice}</span></div>
          <input type="range" min={500} max={3000} step={50} value={ppaPrice} onChange={(e) => setPpaPrice(Number(e.target.value))} className="w-full accent-[#1a3a5c]" />
        </label>
        <label className="block text-[11px]">
          <div className="flex justify-between"><span>Utility price (R/MWh)</span><span className="font-mono">{utilityPrice}</span></div>
          <input type="range" min={1000} max={3500} step={50} value={utilityPrice} onChange={(e) => setUtilityPrice(Number(e.target.value))} className="w-full accent-[#1a3a5c]" />
        </label>
      </div>
      <div className="p-3">
        <table className="w-full text-[12px]">
          <thead className="text-[#6b7685] text-[11px]">
            <tr><th className="text-left py-1">Tariff</th>
                <th className="text-right py-1">R/MWh</th>
                <th className="text-right py-1">Annual</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tariff} className="border-t border-[#eef2f7]">
                <td className="py-1.5">{r.tariff}</td>
                <td className="py-1.5 text-right font-mono">R{r.rate}</td>
                <td className="py-1.5 text-right font-mono">{formatZAR(r.annual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={`mt-2 text-[12px] font-semibold ${savings > 0 ? 'text-[#1a8a5b]' : 'text-[#c0392b]'}`}>
          PPA saves {formatZAR(savings)}/yr vs utility flat
        </div>
      </div>
    </section>
  );
}

// ─── 5 ─── Project health scorecard ───────────────────────────────────
function ProjectHealthScorecard({
  project, milestones, conditions, epcs,
}: { project: Project | null; milestones: Milestone[]; conditions: EaCondition[]; epcs: Epc[]; }) {
  const today = Date.now();
  const score = (val: number, good: number, warn: number) =>
    val >= good ? 'good' : val >= warn ? 'warn' : 'bad';

  const milestoneSlippage = milestones.filter((m) => {
    if (!m.due_date || m.achieved_date) return false;
    return new Date(m.due_date).getTime() < today;
  }).length;
  const totalMilestones = milestones.length;
  const onTrack = totalMilestones > 0 ? 1 - (milestoneSlippage / totalMilestones) : 1;

  const eaBreach = conditions.filter((c) => c.status === 'breach').length;
  const eaCompliant = conditions.filter((c) => c.status === 'compliant').length;
  const eaPct = conditions.length > 0 ? eaCompliant / conditions.length : 1;

  const epcOk = epcs.length > 0 && epcs.every((e) => e.target_completion_date && new Date(e.target_completion_date).getTime() >= today);
  const hasPpa = (project?.ppa_status || '').toLowerCase() === 'signed' || (project?.ppa_status || '').toLowerCase() === 'executed';
  const hasIrrTarget = !!(project?.irr_target_pct && project.irr_target_pct > 0);

  const dims = [
    { dim: 'Schedule',     val: onTrack, label: `${(onTrack * 100).toFixed(0)}% milestones on track`, tone: score(onTrack, 0.9, 0.7) },
    { dim: 'Environmental',val: eaPct,   label: eaBreach > 0 ? `${eaBreach} breach(es)` : `${(eaPct * 100).toFixed(0)}% compliant`,
                            tone: eaBreach > 0 ? 'bad' : score(eaPct, 0.9, 0.7) },
    { dim: 'EPC',          val: epcOk ? 1 : 0, label: epcs.length > 0 ? (epcOk ? 'On target' : 'Target slip') : 'No EPC',
                            tone: epcs.length === 0 ? 'info' : epcOk ? 'good' : 'warn' },
    { dim: 'PPA',          val: hasPpa ? 1 : 0, label: project?.ppa_status || '—',
                            tone: hasPpa ? 'good' : 'warn' },
    { dim: 'Financials',   val: hasIrrTarget ? 1 : 0, label: hasIrrTarget ? `Target ${project!.irr_target_pct}%` : 'No IRR target',
                            tone: hasIrrTarget ? 'good' : 'warn' },
  ];

  const tones: Record<string, string> = {
    good: 'border-[#1a8a5b] bg-[#f4faf6] text-[#1a8a5b]',
    warn: 'border-[#b04e0f] bg-[#fefaf2] text-[#b04e0f]',
    bad:  'border-[#c0392b] bg-[#fdf3f1] text-[#c0392b]',
    info: 'border-[#dde4ec] bg-white text-[#3d4756]',
  };

  return (
    <section className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">Project health scorecard</div>
        <div className="text-[11px] text-[#6b7685]">Schedule · environmental · EPC · PPA · financials</div>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3">
        {dims.map((d) => (
          <div key={d.dim} className={`rounded border p-2 ${tones[d.tone]}`}>
            <div className="text-[10px] uppercase tracking-wider opacity-80">{d.dim}</div>
            <div className="mt-1 text-[12px] font-semibold">{d.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  const map: Record<string, string> = {
    good: 'text-[#1a8a5b]', warn: 'text-[#b04e0f]', bad: 'text-[#c0392b]', info: 'text-[#3b82c4]',
  };
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">{label}</div>
      <div className={`mt-1 text-[14px] font-mono font-semibold ${map[tone]}`}>{value}</div>
    </div>
  );
}

// ─── Composite ────────────────────────────────────────────────────────
export function IppInsights() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [chosen, setChosen] = useState<string>('');
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [conditions, setConditions] = useState<EaCondition[]>([]);
  const [epcs, setEpcs] = useState<Epc[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get('/projects').then((r) => {
      const list = (r.data?.data || []) as Project[];
      setProjects(list);
      if (list.length && !chosen) setChosen(list[0].id);
    }).catch((e) => setErr(e instanceof Error ? e.message : 'load failed'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!chosen) return undefined;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get(`/projects/${chosen}/milestones`).catch(() => ({ data: { data: [] } })),
      api.get(`/ipp/environmental/conditions/${chosen}`).catch(() => ({ data: { data: [] } })),
      api.get(`/ipp/epc?project_id=${chosen}`).catch(() => ({ data: { data: [] } })),
    ]).then(([m, c, e]) => {
      if (cancelled) return;
      setMilestones((m.data?.data as Milestone[]) || []);
      setConditions((c.data?.data as EaCondition[]) || []);
      setEpcs((e.data?.data as Epc[]) || []);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [chosen]);

  const project = projects.find((p) => p.id === chosen) || null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-[#6b7685]">Project:</span>
        <select value={chosen} onChange={(e) => setChosen(e.target.value)} className="h-8 px-2 rounded border border-[#dde4ec] text-[12px] min-w-[240px]">
          {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
        </select>
      </div>
      {err && <div className="text-[12px] text-[#c0392b]">{err}</div>}
      {loading ? <div className="text-[12px] text-[#6b7685]">Loading…</div> : (
        <>
          <ProjectHealthScorecard project={project} milestones={milestones} conditions={conditions} epcs={epcs} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <EnvComplianceHeatmap conditions={conditions} />
            <MilestoneCriticalPath milestones={milestones} />
            <LdCalculator epcs={epcs} />
            <TariffComparison project={project} />
          </div>
        </>
      )}
    </div>
  );
}

export default IppInsights;
