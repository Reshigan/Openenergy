// ════════════════════════════════════════════════════════════════════════
// DepthOpsPage — /ops/depth
//
// Operator workbench for everything shipped in migrations 062 + 063.
// Tabs per area: Algos / Limits / Margin / Cycles / Defaults /
// Drawdowns / LDs / IFRS9 / Watchlist / Carbon PDDs.
//
// Each tab is a real operational surface — state-machine actions, not
// CRUD. Step-up authentication kicks in via the backend; we just relay
// the error code to the user.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertOctagon, AlertTriangle, ArrowRight, BarChart3, Building2,
  CheckCircle, Coins, Cpu, Gavel, Leaf, Settings2, ShieldAlert, TrendingUp, Zap,
} from 'lucide-react';
import { api } from '../../lib/api';
import { StitchPage } from '../StitchPage';

type Tab =
  | 'algos' | 'limits' | 'margin' | 'cycles' | 'defaults'
  | 'drawdowns' | 'lds' | 'ifrs9' | 'watchlist' | 'pdd';

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

export function DepthOpsPage() {
  const [tab, setTab] = useState<Tab>('algos');
  return (
    <StitchPage
      eyebrowIcon={Settings2}
      eyebrowLabel="Ops · Depth"
      title="Operations workbench"
      subtitle="Algo execution, position limits, margin calls, T+1 net settlement, default management, IPP drawdowns + LDs, lender IFRS 9 + watchlist, carbon PDDs."
    >
      <div className="border-b border-[#dde4ec] flex flex-wrap gap-1">
        {([
          { k: 'algos',     label: 'Algos',          icon: <Activity     size={13} /> },
          { k: 'limits',    label: 'Limits',         icon: <BarChart3    size={13} /> },
          { k: 'margin',    label: 'Margin',         icon: <Coins        size={13} /> },
          { k: 'cycles',    label: 'T+1 Cycles',     icon: <ArrowRight   size={13} /> },
          { k: 'defaults',  label: 'Defaults',       icon: <AlertOctagon size={13} /> },
          { k: 'drawdowns', label: 'Drawdowns',      icon: <Building2    size={13} /> },
          { k: 'lds',       label: 'LDs',            icon: <Gavel        size={13} /> },
          { k: 'ifrs9',     label: 'IFRS 9',         icon: <TrendingUp   size={13} /> },
          { k: 'watchlist', label: 'Watchlist',      icon: <AlertTriangle size={13} /> },
          { k: 'pdd',       label: 'Carbon PDDs',    icon: <Leaf         size={13} /> },
        ] as Array<{ k: Tab; label: string; icon: React.ReactNode }>).map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`h-10 px-3 text-[12px] font-semibold inline-flex items-center gap-1 border-b-2 transition-colors ${tab === t.k ? 'border-[#3b82c4] text-[#3b82c4]' : 'border-transparent text-[#6b7685] hover:text-[#0f1c2e]'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'algos'     && <AlgosTab />}
      {tab === 'limits'    && <LimitsTab />}
      {tab === 'margin'    && <MarginTab />}
      {tab === 'cycles'    && <CyclesTab />}
      {tab === 'defaults'  && <DefaultsTab />}
      {tab === 'drawdowns' && <DrawdownsTab />}
      {tab === 'lds'       && <LdsTab />}
      {tab === 'ifrs9'     && <Ifrs9Tab />}
      {tab === 'watchlist' && <WatchlistTab />}
      {tab === 'pdd'       && <PddTab />}
    </StitchPage>
  );
}

// ─── Algos ───────────────────────────────────────────────────────────────
function AlgosTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [draft, setDraft] = useState({
    algo_type: 'twap', energy_type: 'solar', side: 'buy',
    total_volume_mwh: 100, start_at: '', end_at: '',
  });
  const load = () => api.get('/trading-deep/algos').then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  const submit = async () => {
    if (!draft.start_at || !draft.end_at) return alert('start_at + end_at required');
    await api.post('/trading-deep/algos', {
      ...draft,
      start_at: new Date(draft.start_at).toISOString(),
      end_at: new Date(draft.end_at).toISOString(),
    });
    void load();
  };
  return (
    <div className="mt-3 space-y-3">
      <Section title="New algo execution">
        <div className="p-3 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <select value={draft.algo_type} onChange={(e) => setDraft({ ...draft, algo_type: e.target.value })} className="h-9 px-2 rounded border border-[#dde4ec] text-[12px]">
            <option value="twap">TWAP</option><option value="vwap">VWAP</option>
            <option value="pov">POV</option><option value="iceberg">Iceberg</option>
          </select>
          <select value={draft.energy_type} onChange={(e) => setDraft({ ...draft, energy_type: e.target.value })} className="h-9 px-2 rounded border border-[#dde4ec] text-[12px]">
            <option value="solar">solar</option><option value="wind">wind</option>
            <option value="power">power</option><option value="carbon">carbon</option>
          </select>
          <select value={draft.side} onChange={(e) => setDraft({ ...draft, side: e.target.value })} className="h-9 px-2 rounded border border-[#dde4ec] text-[12px]">
            <option value="buy">Buy</option><option value="sell">Sell</option>
          </select>
          <input type="number" placeholder="Volume MWh" value={draft.total_volume_mwh} onChange={(e) => setDraft({ ...draft, total_volume_mwh: Number(e.target.value) })} className="h-9 px-2 rounded border border-[#dde4ec] text-[12px] font-mono" />
          <input type="datetime-local" value={draft.start_at} onChange={(e) => setDraft({ ...draft, start_at: e.target.value })} className="h-9 px-2 rounded border border-[#dde4ec] text-[12px]" />
          <input type="datetime-local" value={draft.end_at}   onChange={(e) => setDraft({ ...draft, end_at: e.target.value })}   className="h-9 px-2 rounded border border-[#dde4ec] text-[12px]" />
        </div>
        <div className="px-3 pb-3"><button onClick={submit} className="h-9 px-3 rounded bg-[#1a3a5c] text-white text-[12px] font-semibold">Submit algo</button></div>
      </Section>
      <Section title={`Active algos (${rows.length})`}>
        <Table headers={['Algo', 'Side', 'Volume', 'Filled', 'Window', 'Status', '']}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="font-mono uppercase">{r.algo_type}</td>
              <td>{r.side}</td>
              <td className="text-right font-mono">{Number(r.total_volume_mwh).toFixed(0)} MWh</td>
              <td className="text-right font-mono">{Number(r.filled_volume_mwh).toFixed(0)}</td>
              <td className="font-mono text-[10px]">{new Date(r.start_at).toLocaleString()} → {new Date(r.end_at).toLocaleString()}</td>
              <td><Pill status={r.status} /></td>
              <td className="text-right space-x-2">
                {r.status === 'running' && <button onClick={async () => { await api.post(`/trading-deep/algos/${r.id}/pause`, {}); void load(); }} className="text-[11px]">Pause</button>}
                {r.status === 'paused'  && <button onClick={async () => { await api.post(`/trading-deep/algos/${r.id}/resume`, {}); void load(); }} className="text-[11px]">Resume</button>}
                {!['completed','cancelled'].includes(r.status) && <button onClick={async () => { await api.post(`/trading-deep/algos/${r.id}/cancel`, {}); void load(); }} className="text-[11px] text-[#c0392b]">Cancel</button>}
              </td>
            </tr>
          ))}
          {!rows.length && <Empty cols={7} />}
        </Table>
      </Section>
    </div>
  );
}

// ─── Limits ─────────────────────────────────────────────────────────────
function LimitsTab() {
  const [breaches, setBreaches] = useState<any[]>([]);
  const load = () => api.get('/trading-deep/breaches').then((r) => setBreaches(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  const override = async (id: string) => {
    const reason = prompt('Override reason (admin):');
    if (!reason) return;
    await api.post(`/trading-deep/breaches/${id}/override`, { reason }).catch((e) => alert(e?.response?.data?.error));
    void load();
  };
  return (
    <div className="mt-3 space-y-3">
      <Section title={`Position breaches (${breaches.length})`}>
        <Table headers={['Detected', 'Participant', 'Energy', 'Limit', 'Observed', 'Severity', 'Status', '']}>
          {breaches.map((b) => (
            <tr key={b.id}>
              <td className="font-mono text-[10px]">{new Date(b.detected_at).toLocaleString()}</td>
              <td className="font-mono text-[11px]">{b.participant_id}</td>
              <td>{b.energy_type}</td>
              <td className="text-right font-mono">{Number(b.limit_value).toFixed(0)}</td>
              <td className="text-right font-mono widget-tone-bad-text">{Number(b.observed_value).toFixed(0)}</td>
              <td><Pill status={b.severity} /></td>
              <td><Pill status={b.status} /></td>
              <td className="text-right space-x-2">
                {b.status === 'open' && (
                  <>
                    <button onClick={async () => { await api.post(`/trading-deep/breaches/${b.id}/clear`, {}); void load(); }} className="text-[11px] widget-tone-good-text">Clear</button>
                    <button onClick={() => override(b.id)} className="text-[11px] widget-tone-bad-text">Override</button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {!breaches.length && <Empty cols={8} />}
        </Table>
      </Section>
    </div>
  );
}

// ─── Margin ─────────────────────────────────────────────────────────────
function MarginTab() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => api.get('/trading-deep/margin-calls').then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  return (
    <Section title={`Open margin calls (${rows.filter((r) => r.status !== 'satisfied').length})`}>
      <Table headers={['Created', 'Participant', 'Required', 'Posted', 'Deadline', 'Status']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[10px]">{new Date(r.created_at).toLocaleString()}</td>
            <td className="font-mono text-[11px]">{r.participant_id}</td>
            <td className="text-right font-mono">{formatZAR(r.required_amount_zar)}</td>
            <td className="text-right font-mono">{formatZAR(r.posted_amount_zar)}</td>
            <td className="font-mono text-[10px]">{new Date(r.deadline_at).toLocaleString()}</td>
            <td><Pill status={r.status} /></td>
          </tr>
        ))}
        {!rows.length && <Empty cols={6} />}
      </Table>
    </Section>
  );
}

// ─── T+1 Cycles ─────────────────────────────────────────────────────────
function CyclesTab() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => api.get('/settlement-deep/cycles').then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  const action = async (id: string, op: 'net' | 'novate' | 'settle') => {
    try {
      const r = await api.post(`/settlement-deep/cycles/${id}/${op}`, {});
      if (op === 'net') alert(`Netted: ${r.data?.data?.net_legs} net legs (${r.data?.data?.netting_efficiency}% reduction)`);
      void load();
    } catch (e: any) {
      const err = e?.response?.data;
      if (err?.error === 'step_up_required') alert('Step-up MFA required — open the dialog from the top bar');
      else alert(err?.error || 'failed');
    }
  };
  return (
    <Section title="T+1 Settlement Cycles">
      <Table headers={['Trade date', 'Value date', 'Gross trades', 'Net legs', 'Efficiency', 'Status', '']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono">{r.trade_date}</td>
            <td className="font-mono">{r.value_date}</td>
            <td className="text-right font-mono">{r.total_trades}</td>
            <td className="text-right font-mono">{r.net_legs_count}</td>
            <td className="text-right font-mono">{r.netting_efficiency != null ? `${(r.netting_efficiency * 100).toFixed(1)}%` : '—'}</td>
            <td><Pill status={r.status} /></td>
            <td className="text-right space-x-1">
              {r.status === 'open'           && <button onClick={() => action(r.id, 'net')}     className="text-[11px] text-[#3b82c4]">Net</button>}
              {r.status === 'net_calculated' && <button onClick={() => action(r.id, 'novate')}  className="text-[11px] text-[#3b82c4]">Novate</button>}
              {r.status === 'novated'        && <button onClick={() => action(r.id, 'settle')} className="text-[11px] widget-tone-good-text font-semibold">Settle</button>}
            </td>
          </tr>
        ))}
        {!rows.length && <Empty cols={7} />}
      </Table>
    </Section>
  );
}

// ─── Defaults ───────────────────────────────────────────────────────────
function DefaultsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => api.get('/settlement-deep/defaults').then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  return (
    <Section title="Counterparty default events">
      <Table headers={['Declared', 'Participant', 'Trigger', 'Exposure', 'Status', 'Recovery']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[10px]">{new Date(r.declared_at).toLocaleString()}</td>
            <td className="font-mono text-[11px]">{r.participant_id}</td>
            <td>{r.trigger_type.replace(/_/g, ' ')}</td>
            <td className="text-right font-mono">{r.initial_exposure_zar ? formatZAR(r.initial_exposure_zar) : '—'}</td>
            <td><Pill status={r.status} /></td>
            <td className="text-right font-mono">{r.recovery_amount_zar ? formatZAR(r.recovery_amount_zar) : '—'}</td>
          </tr>
        ))}
        {!rows.length && <Empty cols={6} />}
      </Table>
    </Section>
  );
}

// ─── Drawdowns ──────────────────────────────────────────────────────────
function DrawdownsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cps, setCps] = useState<any[]>([]);
  const load = () => api.get('/ipp-deep/drawdowns').then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  const open = async (id: string) => {
    setExpanded(id);
    const r = await api.get(`/ipp-deep/drawdowns/${id}`);
    setCps(r.data?.data?.conditions_precedent || []);
  };
  return (
    <Section title="Construction drawdowns">
      <Table headers={['#', 'Project', 'Requested', 'Status', '']}>
        {rows.map((r) => (
          <React.Fragment key={r.id}>
            <tr>
              <td className="font-mono">#{r.drawdown_number}</td>
              <td className="font-mono text-[11px]">{r.project_id}</td>
              <td className="text-right font-mono">{formatZAR(r.requested_amount_zar)}</td>
              <td><Pill status={r.status} /></td>
              <td className="text-right"><button onClick={() => open(r.id)} className="text-[11px] text-[#3b82c4]">{expanded === r.id ? 'Hide CPs' : 'View CPs'}</button></td>
            </tr>
            {expanded === r.id && (
              <tr><td colSpan={5} className="px-3 py-2 bg-[#f8fafc]">
                <ul className="space-y-1 text-[11px]">
                  {cps.map((cp) => (
                    <li key={cp.id} className="flex items-center gap-2">
                      <Pill status={cp.status} />
                      <span className="font-mono">{cp.cp_type}</span>
                      <span className="text-[#6b7685]">{cp.description}</span>
                    </li>
                  ))}
                </ul>
              </td></tr>
            )}
          </React.Fragment>
        ))}
        {!rows.length && <Empty cols={5} />}
      </Table>
    </Section>
  );
}

// ─── LDs ────────────────────────────────────────────────────────────────
function LdsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => api.get('/ipp-deep/lds').then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  const accrue = async (id: string) => { await api.post(`/ipp-deep/lds/${id}/accrue`, {}); void load(); };
  return (
    <Section title="Liquidated damages">
      <Table headers={['Project', 'Event', 'Ref date', 'Delay days', 'Accrued', 'Cap', 'Status', '']}>
        {rows.map((r) => {
          const cap = Number(r.contract_price_zar) * (Number(r.cap_pct) / 100);
          return (
            <tr key={r.id}>
              <td className="font-mono text-[11px]">{r.project_id}</td>
              <td>{r.event_type.replace(/_/g, ' ')}</td>
              <td className="font-mono text-[10px]">{r.reference_date}</td>
              <td className="text-right font-mono">{r.delay_days ?? '—'}</td>
              <td className="text-right font-mono">{formatZAR(r.accrued_amount_zar)}</td>
              <td className="text-right font-mono">{formatZAR(cap)}</td>
              <td><Pill status={r.status} /></td>
              <td className="text-right">{r.status === 'accruing' && <button onClick={() => accrue(r.id)} className="text-[11px] text-[#3b82c4]">Accrue now</button>}</td>
            </tr>
          );
        })}
        {!rows.length && <Empty cols={8} />}
      </Table>
    </Section>
  );
}

// ─── IFRS 9 ────────────────────────────────────────────────────────────
function Ifrs9Tab() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => api.get('/lender-deep/ecl').then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  return (
    <Section title="IFRS 9 Expected Credit Loss staging">
      <Table headers={['Facility', 'Borrower', 'Stage', 'Exposure', 'PD', 'LGD', 'ECL']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[11px]">{r.facility_id}</td>
            <td className="font-mono text-[11px]">{r.participant_id}</td>
            <td><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              r.stage === 1 ? 'widget-tone-good' :
              r.stage === 2 ? 'widget-tone-amber' : 'widget-tone-bad'
            }`}>STAGE {r.stage}</span></td>
            <td className="text-right font-mono">{formatZAR(r.exposure_zar)}</td>
            <td className="text-right font-mono">{r.stage === 1 ? `${(Number(r.pd_12m || 0) * 100).toFixed(2)}%` : `${(Number(r.pd_lifetime || 0) * 100).toFixed(2)}%`}</td>
            <td className="text-right font-mono">{(Number(r.lgd_pct || 0) * 100).toFixed(0)}%</td>
            <td className="text-right font-mono widget-tone-bad-text">{formatZAR(r.ecl_amount_zar)}</td>
          </tr>
        ))}
        {!rows.length && <Empty cols={7} />}
      </Table>
    </Section>
  );
}

// ─── Watchlist ─────────────────────────────────────────────────────────
function WatchlistTab() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => api.get('/lender-deep/watchlist').then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  return (
    <Section title="Lender watchlist">
      <Table headers={['Added', 'Facility', 'Borrower', 'Tier', 'Trigger', 'Next review', '']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[10px]">{new Date(r.added_at).toLocaleDateString()}</td>
            <td className="font-mono text-[11px]">{r.facility_id}</td>
            <td className="font-mono text-[11px]">{r.participant_id}</td>
            <td><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.watchlist_tier === 1 ? 'widget-tone-info' : r.watchlist_tier === 2 ? 'widget-tone-amber' : 'widget-tone-bad'}`}>T{r.watchlist_tier}</span></td>
            <td>{r.trigger_signal.replace(/_/g, ' ')}</td>
            <td className="font-mono text-[10px]">{r.next_review_at ? new Date(r.next_review_at).toLocaleDateString() : '—'}</td>
            <td className="text-right"><button onClick={async () => { await api.post(`/lender-deep/watchlist/${r.id}/clear`, {}); void load(); }} className="text-[11px] widget-tone-good-text">Clear</button></td>
          </tr>
        ))}
        {!rows.length && <Empty cols={7} />}
      </Table>
    </Section>
  );
}

// ─── PDDs ──────────────────────────────────────────────────────────────
function PddTab() {
  const [pdds, setPdds] = useState<any[]>([]);
  const [monitoring, setMonitoring] = useState<any[]>([]);
  useEffect(() => {
    void api.get('/carbon-deep/pdd').then((r) => setPdds(r.data?.data || []));
    void api.get('/carbon-deep/monitoring').then((r) => setMonitoring(r.data?.data || []));
  }, []);
  return (
    <div className="mt-3 space-y-3">
      <Section title="Project Design Documents">
        <Table headers={['Project', 'Methodology', 'Registry', 'Status', 'Registry ID']}>
          {pdds.map((r) => (
            <tr key={r.id}>
              <td className="font-mono text-[11px]">{r.project_id}</td>
              <td>{r.methodology}</td>
              <td className="capitalize">{r.registry.replace(/_/g, ' ')}</td>
              <td><Pill status={r.pdd_status} /></td>
              <td className="font-mono text-[10px]">{r.registry_id || '—'}</td>
            </tr>
          ))}
          {!pdds.length && <Empty cols={5} />}
        </Table>
      </Section>
      <Section title="Monitoring periods">
        <Table headers={['Period', 'PDD', 'Measured tCO₂e', 'Ex-ante', 'Data quality', 'Status', 'Serials']}>
          {monitoring.map((r) => (
            <tr key={r.id}>
              <td className="font-mono text-[10px]">{r.period_start} → {r.period_end}</td>
              <td className="font-mono text-[10px]">{r.pdd_id}</td>
              <td className="text-right font-mono">{r.measured_tco2e ? Number(r.measured_tco2e).toLocaleString() : '—'}</td>
              <td className="text-right font-mono">{r.ex_ante_tco2e ? Number(r.ex_ante_tco2e).toLocaleString() : '—'}</td>
              <td className="text-right font-mono">{r.data_quality_pct ? `${Number(r.data_quality_pct).toFixed(0)}%` : '—'}</td>
              <td><Pill status={r.status} /></td>
              <td className="font-mono text-[10px]">{r.issued_serial_range || '—'}</td>
            </tr>
          ))}
          {!monitoring.length && <Empty cols={7} />}
        </Table>
      </Section>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="widget-card">
      <header className="widget-card-header"><div className="widget-card-title">{title}</div></header>
      {children}
    </section>
  );
}
function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="p-3 overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead><tr>{headers.map((h) => <th key={h} className="text-left">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Empty({ cols }: { cols: number }) {
  return <tr><td colSpan={cols} className="text-[#6b7685] italic py-3">No records.</td></tr>;
}
function Pill({ status }: { status: string }) {
  const s = String(status || '').toLowerCase();
  const tone =
    ['satisfied', 'completed', 'settled', 'cleared', 'cured', 'registered', 'issued', 'fulfilled', 'approved', 'disbursed', 'paid'].includes(s) ? 'widget-tone-good' :
    ['breach', 'hard_breach', 'critical', 'failed', 'rejected', 'capped', 'override_granted'].includes(s) ? 'widget-tone-bad' :
    ['warning', 'pending', 'partial', 'open', 'cps_pending', 'submitted', 'in_progress', 'accruing', 'pending_review', 'novated', 'net_calculated', 'paused', 'running'].includes(s) ? 'widget-tone-amber' :
    'widget-tone-info';
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${tone}`}>{status?.replace(/_/g, ' ')}</span>;
}

export default DepthOpsPage;
