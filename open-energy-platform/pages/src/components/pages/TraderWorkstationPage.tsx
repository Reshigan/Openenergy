import React, { useEffect, useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import { RiskTab } from '../risk/RiskTab';
import { MmComplianceTab } from '../trader/MmComplianceTab';
import { PoslimitChainTab } from '../poslimit/PoslimitChainTab';
import { BestExecutionTab } from '../trader/BestExecutionTab';
import { TradeReportingChainTab } from '../trader/TradeReportingChainTab';
import { MarketAbuseChainTab } from '../trader/MarketAbuseChainTab';
import { AlgoCertChainTab } from '../trader/AlgoCertChainTab';
import { CounterpartyMarginChainTab } from '../counterparty-margin/CounterpartyMarginChainTab';
import { TradeAllocationChainTab } from '../trade-allocation/TradeAllocationChainTab';
import { SettlementFailChainTab } from '../settlement-fail/SettlementFailChainTab';
import { BenchmarkTransitionChainTab } from '../benchmark-transition/BenchmarkTransitionChainTab';
import { PreTradeCreditChainTab } from '../trader/PreTradeCreditChainTab';
import { PnlAttributionChainTab } from '../trader/PnlAttributionChainTab';
import { api } from '../../lib/api';

export function TraderWorkstationPage() {
  const kpis = useWorkstationKpis('trader');
  const openOrders = useWorkstationPanel('Open orders', '/trading/orders', (r) => ({
    id: r.id,
    lead: <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${r.side === 'buy' ? 'bg-[#dbecfb] text-[#1a3a5c]' : 'bg-[#fbe9e6] text-[#c0392b]'}`}>{r.side}</span>,
    text: <span>{r.energy_type} · {Number(r.volume_mwh || 0).toFixed(1)} MWh · R{Number(r.price || 0).toFixed(2)}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.delivery_date}</span>,
  }), 'No open orders.');
  const rejections = useWorkstationPanel('Pre-trade rejections', '/trading/rejections', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[#fbe9e6] text-[#c0392b]">{(r.reason_code || '—').slice(0, 16)}</span>,
    text: <span>{r.energy_type} · {Number(r.volume_mwh || 0).toFixed(1)} MWh</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.attempted_at ? new Date(r.attempted_at).toLocaleTimeString() : '—'}</span>,
  }), 'No rejections today.');
  const panels = [openOrders, rejections].filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <WorkstationShell
      role="trader"
      eyebrow="Trader · Workstation"
      title="Trader workstation"
      subtitle="Open orders · Rejections · Exceptions · Margin calls · Audit. Every workflow a trader needs after the order is placed."
      backHref="/trader-risk"
      backLabel="Trader risk"
      kpis={kpis}
      panels={panels}
      tabs={[
        { key: 'orders', label: 'Open orders', body: ({ onRefresh }) => <OrdersTab onRefresh={onRefresh} /> },
        { key: 'rejections', label: 'Rejections', body: () => <RejectionsTab /> },
        { key: 'exceptions', label: 'Post-trade exceptions', body: ({ onRefresh }) => <ExceptionsTab onRefresh={onRefresh} /> },
        { key: 'margin', label: 'Margin calls', body: ({ onRefresh }) => <MarginTab onRefresh={onRefresh} /> },
        { key: 'pretrade-credit', label: 'Pre-trade credit & settlement risk', body: () => <PreTradeCreditChainTab /> },
        { key: 'pnl-attribution', label: 'Daily P&L attribution', body: () => <PnlAttributionChainTab /> },
        { key: 'risk', label: 'Risk', body: () => <RiskTab /> },
        { key: 'mm-compliance', label: 'MM compliance', body: () => <MmComplianceTab /> },
        { key: 'poslimit', label: 'Position limits', body: () => <PoslimitChainTab /> },
        { key: 'best-ex', label: 'Best execution', body: () => <BestExecutionTab /> },
        { key: 'trade-reporting', label: 'Trade reporting', body: () => <TradeReportingChainTab /> },
        { key: 'market-abuse', label: 'Market surveillance', body: () => <MarketAbuseChainTab /> },
        { key: 'algo-cert', label: 'Algo certification', body: () => <AlgoCertChainTab /> },
        { key: 'counterparty-margin', label: 'Counterparty default', body: () => <CounterpartyMarginChainTab /> },
        { key: 'trade-allocation', label: 'Trade allocation', body: () => <TradeAllocationChainTab /> },
        { key: 'settlement-fail', label: 'Settlement fails', body: () => <SettlementFailChainTab /> },
        { key: 'benchmark-transition', label: 'Benchmark transition', body: () => <BenchmarkTransitionChainTab /> },
        { key: 'audit', label: 'Audit & compliance',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/trading"
              reconHint="external_ref,matched_at,energy_type,volume_mwh,price_zar_mwh"
              reconSourceOptions={['counterparty', 'broker', 'jse']}
              onChange={onRefresh}
            />
          ),
        },
      ]}
    />
  );
}

function OrdersTab({ onRefresh }: { onRefresh: () => void }) {
  const [cancelling, setCancelling] = useState<any | null>(null);
  const [amending, setAmending] = useState<any | null>(null);
  return (
    <div>
      <ListingTable
        endpoint="/trading/orders"
        rowKey={(r) => r.id}
        rowHref={(r) => `/trading/orders/${r.id}`}
        empty={{ title: 'No orders', description: 'Orders you place will appear here. Use the trading desk to submit.' }}
        columns={[
          { key: 'id', label: 'Order', render: (r) => <span className="font-mono text-[11px]">{(r.id || '').slice(0, 12)}…</span> },
          { key: 'side', label: 'Side', render: (r) => <Pill tone={r.side === 'buy' ? 'info' : 'neutral'}>{r.side}</Pill> },
          { key: 'energy_type', label: 'Energy' },
          { key: 'volume_mwh', label: 'Vol (MWh)', align: 'right', render: (r) => `${Number(r.remaining_volume_mwh ?? r.volume_mwh).toFixed(1)} / ${Number(r.volume_mwh).toFixed(1)}` },
          { key: 'price', label: 'Price', align: 'right', render: (r) => r.price != null ? Number(r.price).toFixed(2) : '—' },
          { key: 'delivery_date', label: 'Delivery', render: (r) => r.delivery_date || '—' },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'filled' ? 'good' : r.status === 'cancelled' ? 'bad' : 'warn'}>{(r.status || '').replace(/_/g, ' ')}</Pill> },
          { key: '_actions', label: '', render: (r) => (
            (r.status === 'open' || r.status === 'partially_filled') ? (
              <div className="flex gap-1">
                <button onClick={() => setAmending(r)} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">Amend</button>
                <button onClick={() => setCancelling(r)} className="px-2 py-1 text-[11px] bg-red-600 text-white rounded">Cancel</button>
              </div>
            ) : null
          ) },
        ]}
      />
      {cancelling && (
        <ActionModal
          title={`Cancel order ${(cancelling.id || '').slice(0, 12)}…`}
          submitLabel="Cancel order"
          cta="danger"
          fields={[
            { key: 'reason', label: 'Cancellation reason', type: 'textarea', required: true, helperText: 'Audited — keep it specific.' },
          ] as FieldSpec[]}
          onClose={() => setCancelling(null)}
          onSubmit={async (v) => {
            await api.post(`/trading/orders/${cancelling.id}/cancel`, { reason: v.reason });
            setCancelling(null); onRefresh();
          }}
        />
      )}
      {amending && (
        <ActionModal
          title={`Amend order ${(amending.id || '').slice(0, 12)}…`}
          submitLabel="Submit amendment"
          fields={[
            { key: 'price', label: 'New price (blank = keep)', type: 'number', placeholder: String(amending.price ?? '') },
            { key: 'volume_mwh', label: 'New volume MWh (blank = keep)', type: 'number', placeholder: String(amending.volume_mwh ?? '') },
            { key: 'reason', label: 'Reason', type: 'textarea', required: true, helperText: 'Audited — amendments are tracked in order_amendments.' },
          ] as FieldSpec[]}
          onClose={() => setAmending(null)}
          onSubmit={async (v) => {
            const body: any = { reason: v.reason };
            if (v.price) body.price = Number(v.price);
            if (v.volume_mwh) body.volume_mwh = Number(v.volume_mwh);
            await api.post(`/trading/orders/${amending.id}/amend`, body);
            setAmending(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function RejectionsTab() {
  return (
    <ListingTable
      endpoint="/trading/rejections"
      rowKey={(r) => r.id}
      empty={{ title: 'No rejections', description: 'Pre-trade rejections (insufficient credit, halt, stale mark, etc.) land here for review.' }}
      columns={[
        { key: 'attempted_at', label: 'When', render: (r) => new Date(r.attempted_at).toLocaleString() },
        { key: 'side', label: 'Side', render: (r) => <Pill tone={r.side === 'buy' ? 'info' : 'neutral'}>{r.side}</Pill> },
        { key: 'energy_type', label: 'Energy' },
        { key: 'volume_mwh', label: 'Vol', align: 'right', render: (r) => Number(r.volume_mwh).toFixed(1) },
        { key: 'price_zar_mwh', label: 'Price', align: 'right', render: (r) => r.price_zar_mwh != null ? Number(r.price_zar_mwh).toFixed(2) : '—' },
        { key: 'reason_code', label: 'Reason', render: (r) => <Pill tone="bad">{(r.reason_code || '').replace(/_/g, ' ')}</Pill> },
        { key: '_explain', label: '', render: (r) => <ExplainButton id={r.id} /> },
      ]}
    />
  );
}

function ExplainButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get(`/trading/rejections/${id}/explain`);
      setData(r.data?.data || null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally { setLoading(false); }
  };
  return (
    <>
      <button onClick={() => { setOpen(true); if (!data) void load(); }} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">AI: why?</button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-[#e5ebf2]">
              <h3 className="text-[16px] font-semibold text-[#0f1c2e]">Why was this rejected?</h3>
            </div>
            <div className="p-5 text-[13px] space-y-3">
              {loading && <div className="text-[#6b7685]">Loading…</div>}
              {err && <div className="text-red-700">{err}</div>}
              {data && (
                <>
                  <p className="leading-relaxed">{data.explanation || data.summary || '—'}</p>
                  {Array.isArray(data.remediations) && data.remediations.length > 0 && (
                    <div className="rounded-lg bg-[#f8fafc] p-3 space-y-1">
                      <div className="text-[11px] uppercase tracking-wider text-[#6b7685]">Suggested next steps</div>
                      {data.remediations.map((rem: any, i: number) => (
                        <div key={i} className="text-[12px]">• {rem.label || rem.title || rem}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ExceptionsTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  const [transitioning, setTransitioning] = useState<any | null>(null);
  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setFiling(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
          + File exception
        </button>
      </div>
      <ListingTable
        endpoint="/trading/exceptions"
        rowKey={(r) => r.id}
        empty={{ title: 'No exceptions', description: 'Post-trade mismatches (price, volume, settlement) appear here for triage.' }}
        columns={[
          { key: 'reported_at', label: 'When', render: (r) => new Date(r.reported_at).toLocaleString() },
          { key: 'match_id', label: 'Match', render: (r) => <span className="font-mono text-[11px]">{(r.match_id || '').slice(0, 12)}…</span> },
          { key: 'exception_type', label: 'Type', render: (r) => <Pill tone="info">{(r.exception_type || '').replace(/_/g, ' ')}</Pill> },
          { key: 'severity', label: 'Severity', render: (r) => <Pill tone={r.severity === 'critical' ? 'bad' : r.severity === 'high' ? 'warn' : 'neutral'}>{r.severity}</Pill> },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'resolved' ? 'good' : r.status === 'rejected' ? 'bad' : 'warn'}>{r.status}</Pill> },
          { key: '_actions', label: '', render: (r) => (
            r.status !== 'resolved' && r.status !== 'rejected' ? (
              <button onClick={() => setTransitioning(r)} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">Transition</button>
            ) : null
          ) },
        ]}
      />
      {filing && (
        <ActionModal
          title="File post-trade exception"
          submitLabel="File"
          fields={[
            { key: 'match_id', label: 'Match ID', required: true, placeholder: 'match_…' },
            { key: 'exception_type', label: 'Type', type: 'select', required: true, options: [
              { value: 'price_mismatch', label: 'Price mismatch' },
              { value: 'volume_mismatch', label: 'Volume mismatch' },
              { value: 'settlement_dispute', label: 'Settlement dispute' },
              { value: 'unmatched', label: 'Unmatched' },
              { value: 'duplicate', label: 'Duplicate' },
              { value: 'other', label: 'Other' },
            ] },
            { key: 'severity', label: 'Severity', type: 'select', required: true, options: [
              { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' },
            ] },
            { key: 'reason', label: 'Reason', type: 'textarea', required: true },
            { key: 'expected_value', label: 'Expected value (optional)' },
            { key: 'actual_value', label: 'Actual value (optional)' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/trading/exceptions', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
      {transitioning && (
        <ActionModal
          title={`Exception transition · current: ${transitioning.status}`}
          submitLabel="Transition"
          fields={[
            { key: 'to', label: 'To', type: 'select', required: true, options: [
              { value: 'investigating', label: 'Investigating' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'rejected', label: 'Rejected' },
            ] },
            { key: 'outcome', label: 'Outcome (resolved/rejected)', type: 'select', options: [
              { value: 'adjusted', label: 'Adjusted' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'no_action', label: 'No action' },
            ] },
            { key: 'notes', label: 'Notes (≥3 chars on terminal transitions)', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setTransitioning(null)}
          onSubmit={async (v) => {
            await api.post(`/trading/exceptions/${transitioning.id}/transition`, v);
            setTransitioning(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function MarginTab({ onRefresh }: { onRefresh: () => void }) {
  const [running, setRunning] = useState(false);
  const runScan = async () => {
    setRunning(true);
    try {
      await api.post('/trader-risk/margin-calls/run', {});
      onRefresh();
    } catch {
      // Best-effort — non-risk-officer roles get a 403 and that's fine.
    } finally { setRunning(false); }
  };
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={runScan} disabled={running} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold disabled:opacity-50">
          {running ? 'Running…' : 'Run margin scan'}
        </button>
      </div>
      <ListingTable
        endpoint="/trader-risk/margin-calls"
        rowKey={(r) => r.id}
        empty={{ title: 'No margin calls', description: 'When exposure exceeds posted collateral, calls land here with a due-by timestamp.' }}
        columns={[
          { key: 'as_of', label: 'As of', render: (r) => new Date(r.as_of).toLocaleString() },
          { key: 'exposure_zar', label: 'Exposure', align: 'right', render: (r) => Number(r.exposure_zar || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' }) },
          { key: 'initial_margin_zar', label: 'IM', align: 'right', render: (r) => Number(r.initial_margin_zar || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' }) },
          { key: 'posted_collateral_zar', label: 'Posted', align: 'right', render: (r) => Number(r.posted_collateral_zar || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' }) },
          { key: 'shortfall_zar', label: 'Shortfall', align: 'right', render: (r) => <span className="text-red-700 font-semibold">{Number(r.shortfall_zar || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</span> },
          { key: 'due_by', label: 'Due by', render: (r) => r.due_by ? new Date(r.due_by).toLocaleString() : '—' },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'met' ? 'good' : r.status === 'defaulted' ? 'bad' : 'warn'}>{r.status}</Pill> },
        ]}
      />
    </div>
  );
}

