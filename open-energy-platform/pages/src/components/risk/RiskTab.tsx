// ═══════════════════════════════════════════════════════════════════════════
// RiskTab — Wave 2 trading-risk surface for the Trader workstation.
//
// Bloomberg-density layout:
//   • Top strip: portfolio picker + as-of + VaR 95% / VaR 99% / ES KPIs +
//     "AI: explain VaR" inline assist.
//   • Middle: 30-day VaR history sparkline (SVG).
//   • Bottom: factor-contribution table (from explain-var) + system
//     scenario results table (sortable by P&L impact).
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ScenarioBuilderModal } from './ScenarioBuilderModal';

type Portfolio = { id: string; name: string; basis_filter_json: string; is_system: number };
type VarRow = { as_of_date: string; var_amount_zar: number; es_amount_zar: number; confidence: number };
type Scenario = { id: string; name: string; description?: string; is_system: number; factor_shocks_json: string };
type ScenarioResult = { id: string; scenario_id: string; portfolio_id: string; as_of_date: string; pnl_impact_zar: number };
type Driver = { factor_id: string; name: string; contribution_zar: number; pct_of_gross: number; positions: number; why: string };

const ZAR = (n: number) => `R${Math.round(Math.abs(n)).toLocaleString('en-ZA')}`;
const signed = (n: number) => `${n < 0 ? '−' : ''}${ZAR(n)}`;

export function RiskTab() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [portfolioId, setPortfolioId] = useState<string>('');
  const [varLatest, setVarLatest] = useState<Record<string, VarRow | null>>({});
  const [varHistory, setVarHistory] = useState<VarRow[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioResults, setScenarioResults] = useState<ScenarioResult[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [explainSummary, setExplainSummary] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);

  useEffect(() => {
    void api.get('/risk/portfolios').then((r) => {
      const list: Portfolio[] = r.data?.data || [];
      setPortfolios(list);
      if (list.length && !portfolioId) setPortfolioId(list[0].id);
    });
    void api.get('/risk/scenarios').then((r) => setScenarios(r.data?.data || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!portfolioId) return;
    void api.get(`/risk/portfolios/${portfolioId}/var?confidence=0.95`).then((r) => {
      setVarLatest((p) => ({ ...p, '0.95': r.data?.data || null }));
    });
    void api.get(`/risk/portfolios/${portfolioId}/var?confidence=0.99`).then((r) => {
      setVarLatest((p) => ({ ...p, '0.99': r.data?.data || null }));
    });
    void api.get(`/risk/portfolios/${portfolioId}/var/history?days=30&confidence=0.95`).then((r) => {
      setVarHistory(r.data?.data || []);
    });
    void loadScenarioResults(portfolioId);
    setDrivers([]);
    setExplainSummary('');
  }, [portfolioId]);

  const loadScenarioResults = async (pid: string) => {
    const all: ScenarioResult[] = [];
    for (const s of scenarios.length ? scenarios : (await api.get('/risk/scenarios').then((r) => r.data?.data || []))) {
      const r = await api.get(`/risk/scenarios/${s.id}/results?portfolio_id=${pid}`);
      const rows: ScenarioResult[] = r.data?.data || [];
      if (rows.length) all.push(rows[0]); // latest only
    }
    setScenarioResults(all);
  };

  const recompute = async () => {
    if (!portfolioId) return;
    setRunning(true);
    try {
      await api.post(`/risk/portfolios/${portfolioId}/var/recompute`, {});
      const r95 = await api.get(`/risk/portfolios/${portfolioId}/var?confidence=0.95`);
      const r99 = await api.get(`/risk/portfolios/${portfolioId}/var?confidence=0.99`);
      setVarLatest({ '0.95': r95.data?.data || null, '0.99': r99.data?.data || null });
      const h = await api.get(`/risk/portfolios/${portfolioId}/var/history?days=30&confidence=0.95`);
      setVarHistory(h.data?.data || []);
    } finally {
      setRunning(false);
    }
  };

  const explain = async () => {
    if (!portfolioId) return;
    try {
      const r = await api.post('/ai/risk/explain-var', { portfolio_id: portfolioId, confidence: 0.95 });
      setExplainSummary(r.data?.data?.summary || '');
      setDrivers(r.data?.data?.drivers || []);
    } catch {
      setExplainSummary('Unable to load AI explanation — ensure a portfolio with positions exists.');
    }
  };

  const v95 = varLatest['0.95'];
  const v99 = varLatest['0.99'];

  const scenarioRows = useMemo(() => {
    const byId = new Map(scenarios.map((s) => [s.id, s]));
    return scenarioResults
      .map((r) => ({ ...r, name: byId.get(r.scenario_id)?.name || r.scenario_id }))
      .sort((a, b) => a.pnl_impact_zar - b.pnl_impact_zar); // worst (most negative) first
  }, [scenarios, scenarioResults]);

  return (
    <div className="space-y-4" data-testid="risk-tab">
      {/* Top strip */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-[#0f1c2e] text-white rounded-lg">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] uppercase tracking-wider text-[#7a90a8]">Portfolio</label>
          <select
            value={portfolioId}
            onChange={(e) => setPortfolioId(e.target.value)}
            className="mt-1 w-full h-9 px-2 bg-[#16273e] border border-[#2c4868] rounded text-[13px]"
            data-testid="risk-portfolio-select"
          >
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <Kpi label="As of" value={v95?.as_of_date || '—'} mono />
        <Kpi label="VaR 95%" value={v95 ? ZAR(v95.var_amount_zar) : '—'} accent="amber" mono />
        <Kpi label="VaR 99%" value={v99 ? ZAR(v99.var_amount_zar) : '—'} accent="red" mono testId="risk-var-99" />
        <Kpi label="ES 95%" value={v95 ? ZAR(v95.es_amount_zar) : '—'} mono />
        <div className="flex gap-2">
          <button type="button" onClick={recompute} disabled={running} className="h-9 px-3 rounded bg-[#2a64a8] text-white text-[12px] font-semibold disabled:opacity-50">
            {running ? 'Computing…' : 'Recompute'}
          </button>
          <button type="button" onClick={explain} className="h-9 px-3 rounded bg-[#2a64a8] text-white text-[12px] font-semibold" data-testid="risk-explain">
            AI: explain VaR
          </button>
          <button type="button" onClick={() => setBuilderOpen(true)} className="h-9 px-3 rounded bg-[#2a64a8] text-white text-[12px] font-semibold" data-testid="risk-new-scenario">
            + Scenario
          </button>
        </div>
      </div>

      {/* AI explain card */}
      {explainSummary && (
        <div className="p-3 rounded-lg border border-[#dbe4ee] bg-[#f7fbff] text-[13px]" data-testid="risk-explain-card">
          <div className="text-[10px] uppercase tracking-wider text-[#5a7090] mb-1">AI · Why this VaR</div>
          <p className="leading-relaxed text-[#0f1c2e]">{explainSummary}</p>
        </div>
      )}

      {/* 30-day sparkline */}
      <div className="p-4 bg-white border border-[#e5ebf2] rounded-lg">
        <div className="text-[11px] uppercase tracking-wider text-[#6b7685] mb-2">VaR 95% — last 30 days</div>
        <VarSparkline rows={varHistory} />
      </div>

      {/* Factor + scenario tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-[#e5ebf2] rounded-lg" data-testid="risk-factors-card">
          <div className="px-4 py-2 border-b border-[#e5ebf2] text-[11px] uppercase tracking-wider text-[#6b7685]">
            Top factor contributors
          </div>
          {drivers.length === 0 ? (
            <div className="p-4 text-[12px] text-[#6b7685]">Run "AI: explain VaR" to populate.</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-[#f4f7fb] text-[#6b7685]">
                <tr><th className="text-left px-3 py-2">Factor</th><th className="text-right px-3 py-2">Gross ZAR</th><th className="text-right px-3 py-2">% gross</th></tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.factor_id} className="border-t border-[#eef2f6]">
                    <td className="px-3 py-2"><div className="font-medium">{d.name}</div><div className="text-[10px] text-[#6b7685]">{d.why}</div></td>
                    <td className="px-3 py-2 text-right font-mono">{ZAR(d.contribution_zar)}</td>
                    <td className="px-3 py-2 text-right font-mono">{Math.round(d.pct_of_gross * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white border border-[#e5ebf2] rounded-lg" data-testid="risk-scenarios-card">
          <div className="px-4 py-2 border-b border-[#e5ebf2] text-[11px] uppercase tracking-wider text-[#6b7685]">
            Scenario results — most adverse first
          </div>
          {scenarioRows.length === 0 ? (
            <div className="p-4 text-[12px] text-[#6b7685]">No scenarios have run on this portfolio yet — wait for the nightly cron or open a scenario builder.</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-[#f4f7fb] text-[#6b7685]">
                <tr><th className="text-left px-3 py-2">Scenario</th><th className="text-right px-3 py-2">P&L impact</th><th className="text-right px-3 py-2">As of</th></tr>
              </thead>
              <tbody>
                {scenarioRows.map((r) => (
                  <tr key={r.id} className="border-t border-[#eef2f6]">
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className={`px-3 py-2 text-right font-mono ${r.pnl_impact_zar < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {signed(r.pnl_impact_zar)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[#6b7685]">{r.as_of_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {builderOpen && (
        <ScenarioBuilderModal
          portfolioId={portfolioId}
          onClose={() => setBuilderOpen(false)}
          onSaved={() => {
            setBuilderOpen(false);
            void api.get('/risk/scenarios').then((r) => setScenarios(r.data?.data || []));
            if (portfolioId) void loadScenarioResults(portfolioId);
          }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, accent, mono, testId }: { label: string; value: string; accent?: 'amber' | 'red'; mono?: boolean; testId?: string }) {
  const color = accent === 'red' ? 'text-red-300' : accent === 'amber' ? 'text-amber-300' : 'text-white';
  return (
    <div className="min-w-[120px]" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-wider text-[#7a90a8]">{label}</div>
      <div className={`mt-1 text-[18px] font-bold ${color} ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function VarSparkline({ rows }: { rows: VarRow[] }) {
  if (!rows.length) return <div className="text-[12px] text-[#6b7685]">No history yet.</div>;
  const values = rows.map((r) => r.var_amount_zar);
  const max = Math.max(...values, 1);
  const W = 600, H = 80, pad = 4;
  const stepX = (W - pad * 2) / Math.max(1, rows.length - 1);
  const points = rows.map((r, i) => {
    const x = pad + i * stepX;
    const y = H - pad - ((r.var_amount_zar) / max) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M ${points.join(' L ')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20">
      <path d={path} fill="none" stroke="#c0392b" strokeWidth={1.5} />
      {rows.map((r, i) => (
        <circle key={i} cx={pad + i * stepX} cy={H - pad - (r.var_amount_zar / max) * (H - pad * 2)} r={2} fill="#c0392b">
          <title>{`${r.as_of_date} · ${ZAR(r.var_amount_zar)}`}</title>
        </circle>
      ))}
    </svg>
  );
}
