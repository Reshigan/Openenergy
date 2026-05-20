// ════════════════════════════════════════════════════════════════════════
// OpsL5Page — /ops/l5
//
// Unified operator workbench for everything shipped in batches 4-11.
// 5 areas × multiple tabs each.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, AlertOctagon, BarChart3, Brain, Calendar, Check,
  Clock, Coins, Eye, FileCheck, FileText, Flag, Gavel, Hammer, Layers,
  Leaf, Network, Radio, Settings, Shield, ShieldCheck, Sparkles, TrendingUp,
  Users, Wind, Zap,
} from 'lucide-react';
import { api } from '../../lib/api';
import { StitchPage } from '../StitchPage';

type Area = 'grid' | 'regulator' | 'trading-clearing' | 'marketplace' | 'audit';

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

export function OpsL5Page() {
  const [area, setArea] = useState<Area>('grid');
  return (
    <StitchPage
      eyebrowIcon={Layers}
      eyebrowLabel="Ops · L5"
      title="L5 operations console"
      subtitle="Grid dispatch + ancillary · regulator workflow · clearing + surveillance · marketplace + auctions · audit Merkle proofs."
    >
      <div className="border-b border-[#dde4ec] flex flex-wrap gap-1">
        {([
          { k: 'grid',             label: 'Grid',             icon: <Zap size={13} /> },
          { k: 'regulator',        label: 'Regulator',        icon: <Gavel size={13} /> },
          { k: 'trading-clearing', label: 'Trading/Clearing', icon: <TrendingUp size={13} /> },
          { k: 'marketplace',      label: 'Marketplace',      icon: <Users size={13} /> },
          { k: 'audit',            label: 'Audit',            icon: <ShieldCheck size={13} /> },
        ] as Array<{ k: Area; label: string; icon: React.ReactNode }>).map((t) => (
          <button key={t.k} onClick={() => setArea(t.k)}
            className={`h-10 px-3 text-[12px] font-semibold inline-flex items-center gap-1 border-b-2 transition-colors ${area === t.k ? 'border-[#3b82c4] text-[#3b82c4]' : 'border-transparent text-[#6b7685] hover:text-[#0f1c2e]'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {area === 'grid'             && <GridArea />}
      {area === 'regulator'        && <RegulatorArea />}
      {area === 'trading-clearing' && <TradingClearingArea />}
      {area === 'marketplace'      && <MarketplaceArea />}
      {area === 'audit'            && <AuditArea />}
    </StitchPage>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// GRID
// ═════════════════════════════════════════════════════════════════════════
function GridArea() {
  type T = 'constraints' | 'dispatch' | 'ancillary' | 'frequency' | 'wheeling' | 'curtailment' | 'blackstart';
  const [tab, setTab] = useState<T>('dispatch');
  return (
    <div className="mt-3 space-y-3">
      <SubTabs<T> value={tab} onChange={setTab} items={[
        { k: 'dispatch',    label: 'Dispatch'  },
        { k: 'constraints', label: 'Constraints' },
        { k: 'ancillary',   label: 'Ancillary' },
        { k: 'frequency',   label: 'Frequency' },
        { k: 'wheeling',    label: 'Wheeling'  },
        { k: 'curtailment', label: 'Curtailment' },
        { k: 'blackstart',  label: 'Black-start' },
      ]} />
      {tab === 'constraints' && <GridConstraintsTab />}
      {tab === 'dispatch'    && <GridDispatchTab />}
      {tab === 'ancillary'   && <GridAncillaryTab />}
      {tab === 'frequency'   && <GridFrequencyTab />}
      {tab === 'wheeling'    && <GridWheelingTab />}
      {tab === 'curtailment' && <GridCurtailmentTab />}
      {tab === 'blackstart'  && <GridBlackstartTab />}
    </div>
  );
}

function GridConstraintsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => api.get('/grid-l5/constraints?active=1').then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  return (
    <Section title={`Active grid constraints (${rows.length})`}>
      <Table headers={['Zone', 'Type', 'Limit (MW)', 'Direction', 'Source', '']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[11px]">{r.zone}</td>
            <td>{r.constraint_type.replace(/_/g, ' ')}</td>
            <td className="text-right font-mono">{r.limit_mw}</td>
            <td className="capitalize">{r.direction}</td>
            <td className="font-mono text-[10px]">{r.source || '—'}</td>
            <td className="text-right">
              <button onClick={async () => { await api.post(`/grid-l5/constraints/${r.id}/deactivate`, {}).catch(() => null); void load(); }}
                      className="text-[11px] text-[#c0392b]">Deactivate</button>
            </td>
          </tr>
        ))}
        {!rows.length && <Empty cols={6} />}
      </Table>
    </Section>
  );
}

function GridDispatchTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [newRun, setNewRun] = useState({ interval_start: new Date(Date.now() + 30 * 60_000).toISOString().slice(0, 16), demand_mw: '' });
  const load = () => api.get('/grid-l5/dispatch/runs').then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  const optimize = async (id: string) => {
    try { const r = await api.post(`/grid-l5/dispatch/runs/${id}/optimize`, {}); alert(`Cleared ${r.data?.data?.cleared_mw} MW @ ${formatZAR(r.data?.data?.marginal_price_zar)} marginal`); void load(); }
    catch (e: any) { alert(e?.response?.data?.error === 'step_up_required' ? 'Step-up MFA required' : 'failed'); }
  };
  const createRun = async () => {
    setCreating(true);
    try {
      const r = await api.post('/grid-l5/dispatch/runs', {
        interval_start: new Date(newRun.interval_start).toISOString(),
        total_demand_mw: Number(newRun.demand_mw),
      });
      if (!r.data?.success) throw new Error(r.data?.error || 'failed');
      setNewRun({ ...newRun, demand_mw: '' });
      await load();
    } catch (e: any) { alert(e?.response?.data?.error || e?.message || 'failed'); }
    finally { setCreating(false); }
  };
  return (
    <>
      <div className="flex justify-end items-end gap-2 mb-2 text-[11px]">
        <label className="font-semibold text-[#3a4658]">Interval
          <input type="datetime-local" className="ml-1 h-7 px-2 rounded border border-[#dde4ec]"
                 value={newRun.interval_start} onChange={(e) => setNewRun({ ...newRun, interval_start: e.target.value })}/>
        </label>
        <label className="font-semibold text-[#3a4658]">Demand (MW)
          <input type="number" className="ml-1 h-7 px-2 rounded border border-[#dde4ec] w-24 font-mono"
                 value={newRun.demand_mw} onChange={(e) => setNewRun({ ...newRun, demand_mw: e.target.value })}/>
        </label>
        <button disabled={creating || !newRun.demand_mw} onClick={createRun}
                className="h-7 px-3 rounded bg-[#1a3a5c] text-white font-semibold disabled:opacity-50">
          {creating ? 'Creating…' : 'New run'}
        </button>
      </div>
    <Section title="Economic dispatch runs (last 7 days)">
      <Table headers={['Interval', 'Demand', 'Supply', 'Marginal', 'Status', '']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[10px]">{new Date(r.interval_start).toLocaleString()}</td>
            <td className="text-right font-mono">{r.total_demand_mw ? `${Number(r.total_demand_mw).toFixed(0)} MW` : '—'}</td>
            <td className="text-right font-mono">{r.total_supply_mw ? `${Number(r.total_supply_mw).toFixed(0)} MW` : '—'}</td>
            <td className="text-right font-mono">{r.marginal_price_zar ? `R${Number(r.marginal_price_zar).toFixed(0)}` : '—'}</td>
            <td><Pill status={r.status} /></td>
            <td className="text-right space-x-2">
              {r.status === 'queued' && <button onClick={() => optimize(r.id)} className="text-[11px] text-[#3b82c4]">Optimize</button>}
              {r.status === 'optimized' && <button onClick={async () => { await api.post(`/grid-l5/dispatch/runs/${r.id}/publish`, {}).catch(() => null); void load(); }} className="text-[11px] widget-tone-good-text font-semibold">Publish</button>}
            </td>
          </tr>
        ))}
        {!rows.length && <Empty cols={6} />}
      </Table>
    </Section>
    </>
  );
}

function GridAncillaryTab() {
  const [contracts, setContracts] = useState<any[]>([]);
  useEffect(() => { void api.get('/grid-l5/ancillary/contracts').then((r) => setContracts(r.data?.data || [])); }, []);
  return (
    <Section title="Ancillary service contracts">
      <Table headers={['Participant', 'Service', 'Capacity (MW)', 'Effective', 'Performance', 'Status']}>
        {contracts.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[11px]">{r.participant_id}</td>
            <td className="font-mono">{r.service_type.toUpperCase()}</td>
            <td className="text-right font-mono">{r.capacity_mw}</td>
            <td className="font-mono text-[10px]">{new Date(r.start_at).toLocaleDateString()} → {new Date(r.end_at).toLocaleDateString()}</td>
            <td className="text-right font-mono">{r.performance_score != null ? `${(Number(r.performance_score) * 100).toFixed(0)}%` : '—'}</td>
            <td><Pill status={r.status} /></td>
          </tr>
        ))}
        {!contracts.length && <Empty cols={6} />}
      </Table>
    </Section>
  );
}

function GridFrequencyTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void api.get('/grid-l5/frequency/events').then((r) => setRows(r.data?.data || [])); }, []);
  return (
    <Section title="Frequency events (last 30 days)">
      <Table headers={['Detected', 'Classification', 'Min Hz', 'Deviation mHz', 'Severity']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[10px]">{new Date(r.detected_at).toLocaleString()}</td>
            <td className="font-mono">{r.classification?.replace(/_/g, ' ')}</td>
            <td className="text-right font-mono">{Number(r.min_frequency_hz).toFixed(3)}</td>
            <td className="text-right font-mono widget-tone-bad-text">{r.max_deviation_mhz?.toFixed(0)}</td>
            <td><Pill status={r.severity} /></td>
          </tr>
        ))}
        {!rows.length && <Empty cols={5} />}
      </Table>
    </Section>
  );
}

function GridWheelingTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void api.get('/grid-l5/wheeling').then((r) => setRows(r.data?.data || [])); }, []);
  return (
    <Section title="Wheeling agreements">
      <Table headers={['Generator', 'Offtaker', 'Inject', 'Withdraw', 'MW', 'Loss %', 'Tariff R/MWh', 'Status']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[10px]">{r.generator_id}</td>
            <td className="font-mono text-[10px]">{r.offtaker_id}</td>
            <td className="font-mono">{r.injection_point}</td>
            <td className="font-mono">{r.withdrawal_point}</td>
            <td className="text-right font-mono">{r.contracted_mw}</td>
            <td className="text-right font-mono">{r.loss_factor_pct}%</td>
            <td className="text-right font-mono">R{r.wheeling_tariff_zar_per_mwh}</td>
            <td><Pill status={r.status} /></td>
          </tr>
        ))}
        {!rows.length && <Empty cols={8} />}
      </Table>
    </Section>
  );
}

function GridCurtailmentTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void api.get('/grid-l5/curtailment?days=30').then((r) => setRows(r.data?.data || [])); }, []);
  const totalLoss = rows.reduce((s, r) => s + Number(r.estimated_loss_zar || 0), 0);
  return (
    <Section title={`Curtailment events (30d) · Total estimated loss ${formatZAR(totalLoss)}`}>
      <Table headers={['Started', 'Type', 'Pre (MW)', 'Curtail (MW)', 'Curtailed MWh', 'Loss', 'Compensation']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[10px]">{new Date(r.started_at).toLocaleString()}</td>
            <td>{r.curtail_type.replace(/_/g, ' ')}</td>
            <td className="text-right font-mono">{r.pre_curtail_mw}</td>
            <td className="text-right font-mono">{r.curtail_mw}</td>
            <td className="text-right font-mono">{r.curtailed_mwh ? Number(r.curtailed_mwh).toFixed(1) : '—'}</td>
            <td className="text-right font-mono widget-tone-bad-text">{r.estimated_loss_zar ? formatZAR(r.estimated_loss_zar) : '—'}</td>
            <td className="text-right font-mono widget-tone-good-text">{r.compensation_zar ? formatZAR(r.compensation_zar) : '—'}</td>
          </tr>
        ))}
        {!rows.length && <Empty cols={7} />}
      </Table>
    </Section>
  );
}

function GridBlackstartTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void api.get('/grid-l5/blackstart').then((r) => setRows(r.data?.data || [])); }, []);
  return (
    <Section title="Black-start units">
      <Table headers={['Participant', 'Capacity (MW)', 'Startup (min)', 'Last tested', 'Result', 'Monthly fee', 'Status']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[11px]">{r.participant_id}</td>
            <td className="text-right font-mono">{r.capacity_mw}</td>
            <td className="text-right font-mono">{r.startup_minutes}</td>
            <td className="font-mono text-[10px]">{r.last_tested_at ? new Date(r.last_tested_at).toLocaleDateString() : 'never'}</td>
            <td><Pill status={r.test_result || 'untested'} /></td>
            <td className="text-right font-mono">{r.payment_zar_per_month ? formatZAR(r.payment_zar_per_month) : '—'}</td>
            <td><Pill status={r.status} /></td>
          </tr>
        ))}
        {!rows.length && <Empty cols={7} />}
      </Table>
    </Section>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// REGULATOR
// ═════════════════════════════════════════════════════════════════════════
function RegulatorArea() {
  type T = 'applications' | 'hearings' | 'decisions' | 'appeals' | 'audits';
  const [tab, setTab] = useState<T>('applications');
  return (
    <div className="mt-3 space-y-3">
      <SubTabs<T> value={tab} onChange={setTab} items={[
        { k: 'applications', label: 'Applications' },
        { k: 'hearings',     label: 'Hearings'     },
        { k: 'decisions',    label: 'Decisions'    },
        { k: 'appeals',      label: 'Appeals'      },
        { k: 'audits',       label: 'Audits'       },
      ]} />
      {tab === 'applications' && <RegApplicationsTab />}
      {tab === 'hearings'     && <RegHearingsTab />}
      {tab === 'decisions'    && <RegDecisionsTab />}
      {tab === 'appeals'      && <RegAppealsTab />}
      {tab === 'audits'       && <RegAuditsTab />}
    </div>
  );
}

function RegApplicationsTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void api.get('/regulator-l5/applications').then((r) => setRows(r.data?.data || [])); }, []);
  return (
    <Section title="Tariff applications">
      <Table headers={['Ref', 'Applicant', 'Type', 'Filed', 'Comment deadline', 'Status']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[11px]">{r.application_ref}</td>
            <td className="font-mono text-[11px]">{r.applicant_id}</td>
            <td>{r.application_type.toUpperCase()}</td>
            <td className="font-mono text-[10px]">{r.filing_date}</td>
            <td className="font-mono text-[10px]">{r.comment_period_ends}</td>
            <td><Pill status={r.status} /></td>
          </tr>
        ))}
        {!rows.length && <Empty cols={6} />}
      </Table>
    </Section>
  );
}

function RegHearingsTab() {
  return <Section title="Hearings"><div className="widget-empty">Hearing schedule view — coming as part of the regulator workstation.</div></Section>;
}

function RegDecisionsTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void api.get('/public/regulator/decisions').then((r) => setRows(r.data?.data || [])); }, []);
  return (
    <Section title="Published decisions">
      <Table headers={['Ref', 'Type', 'Approved revenue', 'Approved tariff', 'Decided', 'Published']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[11px]">{r.decision_ref}</td>
            <td><Pill status={r.decision_type} /></td>
            <td className="text-right font-mono">{r.approved_revenue_zar ? formatZAR(r.approved_revenue_zar) : '—'}</td>
            <td className="text-right font-mono">{r.approved_tariff_zar_kwh ? `R${Number(r.approved_tariff_zar_kwh).toFixed(2)}/kWh` : '—'}</td>
            <td className="font-mono text-[10px]">{new Date(r.decided_at).toLocaleDateString()}</td>
            <td className="font-mono text-[10px]">{r.published_at ? new Date(r.published_at).toLocaleDateString() : '—'}</td>
          </tr>
        ))}
        {!rows.length && <Empty cols={6} />}
      </Table>
    </Section>
  );
}

function RegAppealsTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void api.get('/regulator-l5/appeals').then((r) => setRows(r.data?.data || [])); }, []);
  return (
    <Section title="Appeals">
      <Table headers={['Decision', 'Forum', 'Matter #', 'Filed', 'Status']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[10px]">{r.decision_id}</td>
            <td>{r.forum.replace(/_/g, ' ')}</td>
            <td className="font-mono text-[11px]">{r.matter_number || '—'}</td>
            <td className="font-mono text-[10px]">{new Date(r.filed_at).toLocaleDateString()}</td>
            <td><Pill status={r.status} /></td>
          </tr>
        ))}
        {!rows.length && <Empty cols={5} />}
      </Table>
    </Section>
  );
}

function RegAuditsTab() {
  return <Section title="Compliance audits"><div className="widget-empty">Open compliance audits from the regulator workstation.</div></Section>;
}

// ═════════════════════════════════════════════════════════════════════════
// TRADING / CLEARING
// ═════════════════════════════════════════════════════════════════════════
function TradingClearingArea() {
  type T = 'blocks' | 'surveillance' | 'mm' | 'clearing';
  const [tab, setTab] = useState<T>('surveillance');
  return (
    <div className="mt-3 space-y-3">
      <SubTabs<T> value={tab} onChange={setTab} items={[
        { k: 'surveillance', label: 'Surveillance' },
        { k: 'blocks',       label: 'Block trades' },
        { k: 'mm',           label: 'MM obligations' },
        { k: 'clearing',     label: 'Clearing fund' },
      ]} />
      {tab === 'surveillance' && <SurveillanceTab />}
      {tab === 'blocks'       && <BlocksTab />}
      {tab === 'mm'           && <MmTab />}
      {tab === 'clearing'     && <ClearingTab />}
    </div>
  );
}

function SurveillanceTab() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => api.get('/trading-clearing-l5/surveillance/alerts').then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  const scan = async () => { const r = await api.post('/trading-clearing-l5/surveillance/scan', {}); alert(`Scan flagged ${r.data?.data?.flagged_count} new alerts`); void load(); };
  const review = async (id: string, status: string) => { await api.post(`/trading-clearing-l5/surveillance/alerts/${id}/review`, { status }); void load(); };
  return (
    <>
      <div className="flex justify-end">
        <button onClick={scan} className="h-8 px-3 rounded bg-[#1a3a5c] text-white text-[11px] font-semibold">Run scan now</button>
      </div>
      <Section title="Open surveillance alerts">
        <Table headers={['Type', 'Participant', 'Severity', 'Score', 'Detected', 'Status', '']}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.alert_type.replace(/_/g, ' ')}</td>
              <td className="font-mono text-[11px]">{r.participant_id}</td>
              <td><Pill status={r.severity} /></td>
              <td className="text-right font-mono">{r.score != null ? Number(r.score).toFixed(2) : '—'}</td>
              <td className="font-mono text-[10px]">{new Date(r.detected_at).toLocaleString()}</td>
              <td><Pill status={r.status} /></td>
              <td className="text-right space-x-1">
                {r.status === 'open' && (
                  <>
                    <button onClick={() => review(r.id, 'under_review')} className="text-[11px]">Review</button>
                    <button onClick={() => review(r.id, 'false_positive')} className="text-[11px] widget-tone-good-text">FP</button>
                    <button onClick={() => review(r.id, 'confirmed')} className="text-[11px] widget-tone-bad-text">Confirm</button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {!rows.length && <Empty cols={7} />}
        </Table>
      </Section>
    </>
  );
}

function BlocksTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void api.get('/trading-clearing-l5/blocks').then((r) => setRows(r.data?.data || [])); }, []);
  return (
    <Section title="Block trades">
      <Table headers={['Trade time', 'Buyer/Seller', 'Energy', 'Volume', 'Price', 'Value', 'Status']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[10px]">{new Date(r.trade_time).toLocaleString()}</td>
            <td className="font-mono text-[10px]">{r.buyer_id} ← {r.seller_id}</td>
            <td>{r.energy_type}</td>
            <td className="text-right font-mono">{r.volume_mwh} MWh</td>
            <td className="text-right font-mono">R{r.price_zar_mwh}/MWh</td>
            <td className="text-right font-mono">{formatZAR(r.value_zar)}</td>
            <td><Pill status={r.status} /></td>
          </tr>
        ))}
        {!rows.length && <Empty cols={7} />}
      </Table>
    </Section>
  );
}

function MmTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void api.get('/trading-clearing-l5/mm/obligations').then((r) => setRows(r.data?.data || [])); }, []);
  return (
    <Section title="Market maker obligations">
      <Table headers={['Participant', 'Energy', 'Type', '2-sided min', 'Spread bps', 'Uptime', 'Fee/mo']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[11px]">{r.participant_id}</td>
            <td>{r.energy_type}</td>
            <td>{r.obligation_type.replace(/_/g, ' ')}</td>
            <td className="text-right font-mono">{r.two_sided_minutes_per_day || '—'}</td>
            <td className="text-right font-mono">{r.max_spread_bps || '—'}</td>
            <td className="text-right font-mono">{r.uptime_target_pct ? `${r.uptime_target_pct}%` : '—'}</td>
            <td className="text-right font-mono">{r.monthly_fee_zar ? formatZAR(r.monthly_fee_zar) : '—'}</td>
          </tr>
        ))}
        {!rows.length && <Empty cols={7} />}
      </Table>
    </Section>
  );
}

function ClearingTab() {
  const [funds, setFunds] = useState<any[]>([]);
  const [losses, setLosses] = useState<any[]>([]);
  useEffect(() => {
    void api.get('/trading-clearing-l5/clearing/funds').then((r) => setFunds(r.data?.data || []));
    void api.get('/trading-clearing-l5/clearing/loss-events').then((r) => setLosses(r.data?.data || []));
  }, []);
  return (
    <>
      <Section title="Clearing funds">
        <Table headers={['Year', 'Size', 'Status']}>
          {funds.map((f) => <tr key={f.id}><td>{f.fund_year}</td><td className="text-right font-mono">{formatZAR(f.total_size_zar)}</td><td><Pill status={f.status} /></td></tr>)}
          {!funds.length && <Empty cols={3} />}
        </Table>
      </Section>
      <Section title="Default loss waterfalls">
        <Table headers={['Loss', 'Margin used', 'DF used', 'CH capital', 'Mutualised', 'Status']}>
          {losses.map((l) => (
            <tr key={l.id}>
              <td className="text-right font-mono widget-tone-bad-text">{formatZAR(l.loss_amount_zar)}</td>
              <td className="text-right font-mono">{formatZAR(l.defaulter_margin_used_zar)}</td>
              <td className="text-right font-mono">{formatZAR(l.defaulter_default_fund_used_zar)}</td>
              <td className="text-right font-mono">{formatZAR(l.clearing_house_capital_used_zar)}</td>
              <td className="text-right font-mono widget-tone-amber">{formatZAR(l.mutualised_amount_zar)}</td>
              <td><Pill status={l.status} /></td>
            </tr>
          ))}
          {!losses.length && <Empty cols={6} />}
        </Table>
      </Section>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// MARKETPLACE
// ═════════════════════════════════════════════════════════════════════════
function MarketplaceArea() {
  type T = 'rfqs' | 'auctions';
  const [tab, setTab] = useState<T>('rfqs');
  return (
    <div className="mt-3 space-y-3">
      <SubTabs<T> value={tab} onChange={setTab} items={[
        { k: 'rfqs',     label: 'RFQs'     },
        { k: 'auctions', label: 'Auctions' },
      ]} />
      {tab === 'rfqs'     && <RfqsTab />}
      {tab === 'auctions' && <AuctionsTab />}
    </div>
  );
}

function RfqsTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void api.get('/marketplace-l5/rfqs').then((r) => setRows(r.data?.data || [])); }, []);
  return (
    <Section title="RFQs">
      <Table headers={['Ref', 'Buyer', 'Product', 'Volume', 'Target', 'Quote deadline', 'Status']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[11px]">{r.rfq_number}</td>
            <td className="font-mono text-[11px]">{r.buyer_id}</td>
            <td>{r.product_type}</td>
            <td className="text-right font-mono">{r.volume_mwh ? `${r.volume_mwh} MWh` : '—'}</td>
            <td className="text-right font-mono">{r.target_price_zar ? `R${r.target_price_zar}` : '—'}</td>
            <td className="font-mono text-[10px]">{new Date(r.quote_deadline).toLocaleString()}</td>
            <td><Pill status={r.status} /></td>
          </tr>
        ))}
        {!rows.length && <Empty cols={7} />}
      </Table>
    </Section>
  );
}

function AuctionsTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void api.get('/marketplace-l5/auctions').then((r) => setRows(r.data?.data || [])); }, []);
  return (
    <Section title="Auctions">
      <Table headers={['Ref', 'Type', 'Product', 'Volume', 'Reserve', 'Window', 'Bids', 'Status']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[11px]">{r.auction_number}</td>
            <td>{r.auction_type.replace(/_/g, ' ')}</td>
            <td>{r.product_type}</td>
            <td className="text-right font-mono">{r.volume_mwh}</td>
            <td className="text-right font-mono">{r.reserve_price_zar ? `R${r.reserve_price_zar}` : '—'}</td>
            <td className="font-mono text-[10px]">{new Date(r.starts_at).toLocaleString()} → {new Date(r.ends_at).toLocaleString()}</td>
            <td className="text-right font-mono">{r.total_bids}</td>
            <td><Pill status={r.status} /></td>
          </tr>
        ))}
        {!rows.length && <Empty cols={8} />}
      </Table>
    </Section>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// AUDIT
// ═════════════════════════════════════════════════════════════════════════
function AuditArea() {
  const [roots, setRoots] = useState<any[]>([]);
  const [attestors, setAttestors] = useState<any[]>([]);
  const [buildEntity, setBuildEntity] = useState('audit_events');
  const [buildDay, setBuildDay] = useState(new Date(Date.now() - 86_400_000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = () => {
    void fetch('/api/public/audit/merkle/roots').then((r) => r.json()).then((j) => setRoots(j?.data || []));
    void api.get('/audit-l5/attestors').then((r) => setAttestors(r.data?.data || []));
  };
  useEffect(refresh, []);
  const build = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post('/audit-l5/merkle/build', { entity_type: buildEntity, day: buildDay });
      if (!r.data?.success) throw new Error(r.data?.error || 'failed');
      setMsg(`Built root for ${buildDay}/${buildEntity}: ${r.data.data?.event_count} events`);
      refresh();
    } catch (e: any) {
      const d = e?.response?.data;
      setMsg(d?.step_up_required ? 'Step-up auth required.' : (d?.error || e?.message || 'failed'));
    } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 space-y-3">
      <Section title="Build daily Merkle root">
        <div className="p-3 flex flex-wrap items-end gap-2 text-[11px]">
          <label className="font-semibold text-[#3a4658]">Entity type
            <input className="block mt-1 h-7 px-2 rounded border border-[#dde4ec] font-mono w-48"
                   value={buildEntity} onChange={(e) => setBuildEntity(e.target.value)}/>
          </label>
          <label className="font-semibold text-[#3a4658]">Day
            <input type="date" className="block mt-1 h-7 px-2 rounded border border-[#dde4ec]"
                   value={buildDay} onChange={(e) => setBuildDay(e.target.value)}/>
          </label>
          <button onClick={build} disabled={busy} className="h-7 px-3 rounded bg-[#1a3a5c] text-white font-semibold disabled:opacity-50">
            {busy ? 'Building…' : 'Build root'}
          </button>
          {msg && <span className="text-[#3a4658]">{msg}</span>}
        </div>
      </Section>
      <Section title="Daily Merkle roots (open data, verify externally)">
        <Table headers={['Day', 'Entity type', 'Events', 'Root', 'Signed', 'Attestor co-sign']}>
          {roots.map((r) => (
            <tr key={`${r.day}-${r.entity_type}`}>
              <td className="font-mono">{r.day}</td>
              <td>{r.entity_type}</td>
              <td className="text-right font-mono">{r.event_count}</td>
              <td className="font-mono text-[10px]">{String(r.merkle_root).slice(0, 16)}…</td>
              <td>{r.platform_signature ? <span className="widget-tone-good-text">✓</span> : <span className="text-[#6b7685]">—</span>}</td>
              <td>{r.attestor_signature ? <span className="widget-tone-good-text">✓ {r.attestor_id}</span> : <span className="text-[#6b7685]">none</span>}</td>
            </tr>
          ))}
          {!roots.length && <Empty cols={6} />}
        </Table>
      </Section>
      <Section title="Registered attestors">
        <Table headers={['Name', 'Org', 'Scope', 'Status']}>
          {attestors.map((a) => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td>{a.organisation || '—'}</td>
              <td className="font-mono text-[10px]">{a.scope_entity_types || 'all'}</td>
              <td><Pill status={a.active === 1 ? 'active' : 'inactive'} /></td>
            </tr>
          ))}
          {!attestors.length && <Empty cols={4} />}
        </Table>
      </Section>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════
function SubTabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<{ k: T; label: string }> }) {
  return (
    <div className="flex flex-wrap gap-1 text-[11px]">
      {items.map((t) => (
        <button key={t.k} onClick={() => onChange(t.k)}
                className={`h-7 px-2.5 rounded-full font-semibold border ${value === t.k ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]' : 'bg-white border-[#dde4ec]'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

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
    ['active', 'operational', 'satisfied', 'completed', 'settled', 'cleared', 'cured', 'registered', 'issued', 'fulfilled', 'approved', 'awarded', 'passed', 'published', 'accepted', 'granted'].includes(s) ? 'widget-tone-good' :
    ['breach', 'hard_breach', 'critical', 'failed', 'rejected', 'capped', 'override_granted', 'major_outage', 'refused', 'confirmed', 'bust'].includes(s) ? 'widget-tone-bad' :
    ['warning', 'major', 'pending', 'partial', 'open', 'cps_pending', 'submitted', 'in_progress', 'accruing', 'pending_review', 'novated', 'net_calculated', 'paused', 'running', 'scheduled', 'live', 'investigating', 'in_comment_period', 'modified', 'deferred', 'under_review'].includes(s) ? 'widget-tone-amber' :
    'widget-tone-info';
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${tone}`}>{status?.replace(/_/g, ' ')}</span>;
}

export default OpsL5Page;
