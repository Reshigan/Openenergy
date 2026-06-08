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
import { StrateSwiftConnectorTab } from '../strateSwiftConnector/StrateSwiftConnectorTab';
import { SapOracleErpConnectorTab } from '../sapOracleErpConnector/SapOracleErpConnectorTab';
import { GovernmentFilingConnectorTab } from '../governmentFilingConnector/GovernmentFilingConnectorTab';
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
        { key: 'orders', label: 'Open orders', group: 'Trading', body: ({ onRefresh }) => <OrdersTab onRefresh={onRefresh} /> },
        { key: 'rejections', label: 'Rejections', group: 'Trading', body: () => <RejectionsTab /> },
        { key: 'pretrade-credit', label: 'Pre-trade credit & settlement risk', group: 'Trading', chainKey: 'pretrade_credit_check', body: () => <PreTradeCreditChainTab /> },
        { key: 'pnl-attribution', label: 'Daily P&L attribution', group: 'Trading', chainKey: 'pnl_attribution', body: () => <PnlAttributionChainTab /> },
        { key: 'risk', label: 'Risk dashboard', group: 'Risk', body: () => <RiskTab /> },
        { key: 'margin', label: 'Margin calls', group: 'Risk', body: ({ onRefresh }) => <MarginTab onRefresh={onRefresh} /> },
        { key: 'market-abuse', label: 'Market surveillance', group: 'Risk', chainKey: 'market_abuse_case', body: () => <MarketAbuseChainTab /> },
        { key: 'counterparty-margin', label: 'Counterparty default', group: 'Risk', chainKey: 'counterparty_margin', body: () => <CounterpartyMarginChainTab /> },
        { key: 'algo-cert', label: 'Algo certification', group: 'Risk', chainKey: 'algo_certification', body: () => <AlgoCertChainTab /> },
        { key: 'exceptions', label: 'Post-trade exceptions', group: 'Post-trade', body: ({ onRefresh }) => <ExceptionsTab onRefresh={onRefresh} /> },
        { key: 'trade-allocation', label: 'Trade allocation', group: 'Post-trade', chainKey: 'trade_allocation', body: () => <TradeAllocationChainTab /> },
        { key: 'settlement-fail', label: 'Settlement fails', group: 'Post-trade', chainKey: 'settlement_fail', body: () => <SettlementFailChainTab /> },
        { key: 'benchmark-transition', label: 'Benchmark transition', group: 'Post-trade', chainKey: 'benchmark_transition', body: () => <BenchmarkTransitionChainTab /> },
        { key: 'best-ex', label: 'Best execution', group: 'Post-trade', chainKey: 'best_execution', body: () => <BestExecutionTab /> },
        { key: 'trade-reporting', label: 'Trade reporting', group: 'Post-trade', chainKey: 'trade_report', body: () => <TradeReportingChainTab /> },
        { key: 'fsca-compliance', label: 'FSCA compliance report (W201)', group: 'Compliance', chainKey: 'fsca_compliance_report', body: ({ onRefresh }) => <FscaComplianceTab onRefresh={onRefresh} /> },
        { key: 'fsca_conduct_reports', label: 'FSCA conduct reports (W216)', group: 'Compliance', chainKey: 'fsca_conduct_report', body: ({ onRefresh }) => <FscaConductReportTab onRefresh={onRefresh} /> },
        { key: 'cross_border_trades', label: 'Cross-border pre-approvals (W222)', group: 'Compliance', chainKey: 'cross_border_trade', body: ({ onRefresh }) => <CrossBorderTradeTab onRefresh={onRefresh} /> },
        { key: 'mm-compliance', label: 'MM compliance', group: 'Compliance', chainKey: 'oe_mm_obligations', body: () => <MmComplianceTab /> },
        { key: 'poslimit', label: 'Position limits', group: 'Compliance', chainKey: 'poslimit_case', body: () => <PoslimitChainTab /> },
        { key: 'strate-swift-connectors', label: 'Settlement rails', group: 'Compliance', body: () => <StrateSwiftConnectorTab /> },
        { key: 'sap-oracle-erp-connectors', label: 'ERP connectors', group: 'Compliance', body: () => <SapOracleErpConnectorTab /> },
        { key: 'government-filing-connectors', label: 'Filing connectors', group: 'Compliance', body: () => <GovernmentFilingConnectorTab /> },
        { key: 'audit', label: 'Audit & compliance', group: 'Compliance',
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
                <button type="button" onClick={() => setAmending(r)} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">Amend</button>
                <button type="button" onClick={() => setCancelling(r)} className="px-2 py-1 text-[11px] bg-red-600 text-white rounded">Cancel</button>
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
      <button type="button" onClick={() => { setOpen(true); if (!data) void load(); }} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">AI: why?</button>
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
        <button type="button" onClick={() => setFiling(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
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
              <button type="button" onClick={() => setTransitioning(r)} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">Transition</button>
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
        <button type="button" onClick={runScan} disabled={running} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold disabled:opacity-50">
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

// ── W201: FSCA Annual Compliance Certificate & Compliance Officer Report ───────
const FSCC_STATUS_TONE: Record<string, 'good' | 'warn' | 'bad' | 'neutral'> = {
  report_scheduled: 'neutral', data_gathering: 'neutral', drafting: 'neutral',
  internal_review: 'warn',     co_sign_off: 'warn',       submitted: 'warn',
  under_review: 'warn',        queries_received: 'warn',  queries_responded: 'warn',
  filed: 'good',               refiled: 'good',           deficiency_found: 'bad',
  remediation: 'bad',          revocation_risk: 'bad',
};

const FSP_CLASS_TONE: Record<string, 'good' | 'warn' | 'bad' | 'neutral'> = {
  micro: 'neutral', standard: 'neutral', large: 'warn', systemic: 'bad',
};

const FSCC_ACTIONS = [
  { label: 'Open period',   value: 'open_period' },
  { label: 'Start drafting', value: 'start_drafting' },
  { label: 'Submit for internal review', value: 'submit_for_internal_review' },
  { label: 'Request CO sign-off', value: 'request_co_sign_off' },
  { label: 'CO sign',       value: 'co_sign' },
  { label: 'Raise FSCA queries', value: 'fsca_raises_queries' },
  { label: 'Respond to queries', value: 'respond_to_queries' },
  { label: 'File clean',    value: 'file_clean' },
  { label: 'Flag deficiency', value: 'flag_deficiency' },
  { label: 'Start remediation', value: 'start_remediation' },
  { label: 'Refile',        value: 'refile' },
  { label: 'Flag revocation risk', value: 'flag_revocation_risk' },
];

function FscaComplianceTab({ onRefresh }: { onRefresh: () => void }) {
  const [creating, setCreating] = useState(false);
  const [acting, setActing] = useState<{ id: string; status: string } | null>(null);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button type="button" onClick={() => setCreating(true)}
          className="px-3 py-1.5 bg-[#1a3a5c] text-white text-xs rounded hover:bg-[#1e4a72]">
          + New compliance report
        </button>
      </div>

      <ListingTable
        endpoint="/fsca-compliance-reports"
        rowKey={(r) => r.id}
        empty={{ title: 'No compliance reports', description: 'Create a new annual compliance report to track your FSCA filing.' }}
        columns={[
          { key: 'report_year',      label: 'Year' },
          { key: 'fsp_licence_number', label: 'FSP Licence' },
          { key: 'fsp_class',        label: 'FSP class', render: (r) => <Pill tone={FSP_CLASS_TONE[r.fsp_class] ?? 'neutral'}>{r.fsp_class}</Pill> },
          { key: 'chain_status',     label: 'Status', render: (r) => <Pill tone={FSCC_STATUS_TONE[r.chain_status] ?? 'neutral'}>{r.chain_status?.replace(/_/g,' ')}</Pill> },
          { key: 'compliance_officer_name', label: 'CO' },
          { key: 'fsca_reference',   label: 'FSCA ref' },
          { key: 'sla_deadline',     label: 'SLA deadline', render: (r) => r.sla_deadline ? new Date(r.sla_deadline).toLocaleDateString() : '—' },
          { key: 'sla_breached',     label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">BREACHED</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'actions',          label: '', render: (r) => (
            <button type="button" onClick={() => setActing({ id: r.id, status: r.chain_status })}
              className="text-[#1a3a5c] text-xs underline">Action</button>
          )},
        ]}
      />

      {creating && (
        <ActionModal
          title="New FSCA Compliance Report"
          fields={[
            { key: 'report_year',   type: 'number', label: 'Report year', required: true },
            { key: 'fsp_licence_number', type: 'text', label: 'FSP licence number' },
            { key: 'fsp_class', type: 'select', label: 'FSP class', required: true,
              options: [
                { value: 'micro',    label: 'Micro (< R2m revenue)' },
                { value: 'standard', label: 'Standard (recommended)' },
                { value: 'large',    label: 'Large (> R50m AUM)' },
                { value: 'systemic', label: 'Systemic (> R500m AUM)' },
              ]},
            { key: 'reporting_period_start', type: 'date', label: 'Period start', required: true },
            { key: 'reporting_period_end',   type: 'date', label: 'Period end',   required: true },
            { key: 'compliance_officer_name', type: 'text', label: 'Compliance officer name' },
            { key: 'reason', type: 'textarea', label: 'Notes' },
          ] as FieldSpec[]}
          onSubmit={async (v) => { await api.post('/fsca-compliance-reports', v); setCreating(false); onRefresh(); }}
          onClose={() => setCreating(false)}
        />
      )}

      {acting && (
        <ActionModal
          title={`Action — ${acting.status?.replace(/_/g,' ')}`}
          fields={[
            { key: 'action', type: 'select', label: 'Action', required: true,
              options: FSCC_ACTIONS },
            { key: 'fsca_reference', type: 'text', label: 'FSCA reference (for CO sign)' },
            { key: 'compliance_officer_name', type: 'text', label: 'Compliance officer name (for CO sign)' },
            { key: 'deficiency_description', type: 'textarea', label: 'Deficiency description' },
            { key: 'remediation_plan', type: 'textarea', label: 'Remediation plan' },
            { key: 'revocation_risk_reason', type: 'textarea', label: 'Revocation risk reason' },
            { key: 'reason', type: 'textarea', label: 'Notes / reason', required: true },
          ] as FieldSpec[]}
          onSubmit={async (v) => { await api.post(`/fsca-compliance-reports/${acting.id}/action`, v); setActing(null); onRefresh(); }}
          onClose={() => setActing(null)}
        />
      )}
    </div>
  );
}

// ─── W216: Trader FSCA Periodic Conduct Report ────────────────────────────────
const FCR_TIER_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good' | 'neutral'> = {
  retail: 'info',
  professional: 'info',
  market_maker: 'warn',
  systemic: 'bad',
};

function fcrStatusTone(s: string): 'info' | 'warn' | 'bad' | 'good' | 'neutral' {
  if (s === 'accepted') return 'good';
  if (s === 'rejected' || s === 'escalated') return 'bad';
  if (s === 'fsca_queries') return 'warn';
  return 'info';
}

type FcrModal = null | 'create' | { type: 'action'; id: string; currentStatus: string };

function FscaConductReportTab({ onRefresh }: { onRefresh: () => void }) {
  const [modal, setModal] = useState<FcrModal>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => { setRefreshKey(k => k + 1); onRefresh(); };

  return (
    <div>
      <button type="button"
        onClick={() => setModal('create')}
        className="mb-4 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
      >
        Open reporting period
      </button>
      <ListingTable
        endpoint="/fsca-conduct-reports"
        key={refreshKey}
        rowKey={(r) => r.id}
        empty={{ title: 'No conduct reports', description: 'FSCA periodic conduct reports will appear here.' }}
        columns={[
          { key: 'reporting_period', label: 'Period', render: (r) => <span className="font-mono text-[11px]">{r.reporting_period} / {r.reporting_year}</span> },
          { key: 'report_tier', label: 'Tier', render: (r) => <Pill tone={FCR_TIER_TONE[r.report_tier] ?? 'neutral'}>{String(r.report_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={fcrStatusTone(r.chain_status)}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'best_ex_exceptions', label: 'Best-ex exceptions', align: 'right', render: (r) => r.best_ex_exceptions ?? 0 },
          { key: 'conduct_breaches', label: 'Conduct breaches', align: 'right', render: (r) => r.conduct_breaches ?? 0 },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="Open FSCA conduct report period"
          submitLabel="Open"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/fsca-conduct-reports', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                reporting_period: v.reporting_period,
                reporting_year: parseInt(v.reporting_year, 10),
                is_annual: v.is_annual === 'true',
                report_tier: v.report_tier,
                total_notional_zar: v.total_notional_zar ? parseFloat(v.total_notional_zar) : undefined,
                client_count: v.client_count ? parseInt(v.client_count, 10) : undefined,
                complaint_count: v.complaint_count ? parseInt(v.complaint_count, 10) : undefined,
                compliance_officer: v.compliance_officer || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); bump();
          }}
          fields={[
            { key: 'reporting_period', label: 'Reporting period', required: true, placeholder: 'Q4-2025 / Annual-2025' },
            { key: 'reporting_year', label: 'Reporting year', type: 'number', required: true },
            { key: 'is_annual', label: 'Annual report?', type: 'select', required: false, options: [{ value: 'false', label: 'Quarterly' }, { value: 'true', label: 'Annual' }] },
            {
              key: 'report_tier', label: 'Participant tier', type: 'select', required: true, defaultValue: 'professional',
              options: [
                { value: 'retail', label: 'Retail — lighter requirements (30d SLA)' },
                { value: 'professional', label: 'Professional / wholesale (45d SLA)' },
                { value: 'market_maker', label: 'Designated market-maker (60d SLA)' },
                { value: 'systemic', label: 'Systemic — >R1bn notional (90d SLA)' },
              ],
            },
            { key: 'total_notional_zar', label: 'Total notional (ZAR)', type: 'number', required: false },
            { key: 'client_count', label: 'Client count', type: 'number', required: false },
            { key: 'complaint_count', label: 'Complaints received', type: 'number', required: false },
            { key: 'compliance_officer', label: 'Compliance officer', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title={`Conduct report action — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/fsca-conduct-reports/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                compliance_officer: v.compliance_officer || undefined,
                board_sign_off_date: v.board_sign_off_date || undefined,
                board_signatory: v.board_signatory || undefined,
                fsca_submission_ref: v.fsca_submission_ref || undefined,
                fsca_acknowledgement_ref: v.fsca_acknowledgement_ref || undefined,
                query_summary: v.query_summary || undefined,
                query_response_ref: v.query_response_ref || undefined,
                best_ex_exceptions: v.best_ex_exceptions ? parseInt(v.best_ex_exceptions, 10) : undefined,
                conduct_breaches: v.conduct_breaches ? parseInt(v.conduct_breaches, 10) : undefined,
                rejection_reason: v.rejection_reason || undefined,
                escalation_reason: v.escalation_reason || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); bump();
          }}
          fields={[
            {
              key: 'action', label: 'Action', type: 'select', required: true,
              options: [
                { value: 'commence_review', label: 'Commence internal review' },
                { value: 'approve_board', label: 'Board approval obtained' },
                { value: 'submit_to_fsca', label: 'Submit to FSCA' },
                { value: 'record_queries', label: 'Record FSCA queries' },
                { value: 'respond_to_queries', label: 'Respond to queries' },
                { value: 'accept', label: 'Accept (FSCA accepted)' },
                { value: 'reject', label: 'Reject — must resubmit' },
                { value: 'escalate', label: 'Escalate — material breach' },
                { value: 'withdraw', label: 'Withdraw' },
              ],
            },
            { key: 'compliance_officer', label: 'Compliance officer', required: false },
            { key: 'board_sign_off_date', label: 'Board sign-off date', required: false },
            { key: 'board_signatory', label: 'Board signatory', required: false },
            { key: 'fsca_submission_ref', label: 'FSCA submission reference', required: false },
            { key: 'fsca_acknowledgement_ref', label: 'FSCA acknowledgement reference', required: false },
            { key: 'query_summary', label: 'Query summary', type: 'textarea', required: false },
            { key: 'query_response_ref', label: 'Query response reference', required: false },
            { key: 'best_ex_exceptions', label: 'Best-ex exceptions', type: 'number', required: false },
            { key: 'conduct_breaches', label: 'Conduct breaches', type: 'number', required: false },
            { key: 'rejection_reason', label: 'Rejection reason', type: 'textarea', required: false },
            { key: 'escalation_reason', label: 'Escalation reason', type: 'textarea', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  );
}

// ── W222: Trader Cross-Border Transaction & Regulatory Pre-Approval ──────────
const CBT_TIER_TONE: Record<string, string> = {
  small:    'bg-blue-50 text-blue-700',
  standard: 'bg-purple-50 text-purple-700',
  large:    'bg-amber-50 text-amber-700',
  systemic: 'bg-rose-50 text-rose-700',
};

function cbtStatusTone(s: string): string {
  if (['trade_executed'].includes(s)) return 'bg-green-100 text-green-800';
  if (['fsca_rejected', 'sarb_rejected'].includes(s)) return 'bg-red-100 text-red-800';
  if (['withdrawn', 'expired'].includes(s)) return 'bg-gray-100 text-gray-600';
  if (['fully_approved'].includes(s)) return 'bg-emerald-100 text-emerald-800';
  if (['fsca_approved'].includes(s)) return 'bg-blue-100 text-blue-800';
  return 'bg-slate-100 text-slate-700';
}

type CbtModal = { id: string; cbt_tier: string; counterparty_jurisdiction?: string; notional_zar?: number } | null;

function CrossBorderTradeTab({ onRefresh }: { onRefresh?: () => void }) {
  const [data, setData] = React.useState<any[]>([]);
  const [kpis, setKpis] = React.useState<any>({});
  const [modal, setModal] = React.useState<CbtModal>(null);
  const [createModal, setCreateModal] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const bump = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  React.useEffect(() => {
    fetch('/api/cross-border-trades', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(j => { setData(j.data ?? []); setKpis(j.kpis ?? {}); });
  }, [refreshKey]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', val: kpis.total ?? 0 },
          { label: 'Pending approval', val: kpis.pending_approval ?? 0 },
          { label: 'Fully approved', val: kpis.approved ?? 0 },
          { label: 'Executed', val: kpis.executed ?? 0 },
        ].map(k => (
          <div key={k.label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-semibold text-gray-900">{k.val}</div>
            <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">{data.length} cross-border pre-approvals</span>
        <button type="button" onClick={() => setCreateModal(true)}
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700">
          + New pre-approval request
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Tier', 'Jurisdiction', 'Trade type', 'Notional (ZAR)', 'Status', 'SLA deadline', ''].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {data.map((row: any) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${CBT_TIER_TONE[row.cbt_tier] ?? 'bg-gray-100 text-gray-700'}`}>
                    {row.cbt_tier}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-gray-700">{row.counterparty_jurisdiction ?? '—'}</td>
                <td className="px-3 py-2 text-gray-600">{row.trade_type?.replace(/_/g, ' ') ?? '—'}</td>
                <td className="px-3 py-2 text-gray-700">{row.notional_zar ? `R${Number(row.notional_zar).toLocaleString()}` : '—'}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cbtStatusTone(row.chain_status)}`}>
                    {row.chain_status?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-500 text-xs">{row.sla_deadline ? new Date(row.sla_deadline).toLocaleDateString() : '—'}</td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => setModal({ id: row.id, cbt_tier: row.cbt_tier, counterparty_jurisdiction: row.counterparty_jurisdiction, notional_zar: row.notional_zar })}
                    className="text-xs text-blue-600 hover:underline">Action</button>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">No cross-border pre-approvals found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {createModal && (
        <ActionModal
          title="New cross-border pre-approval request"
          submitLabel="Submit request"
          fields={[
            { key: 'cbt_tier', label: 'Tier', type: 'select', required: true, options: [
              { value: 'small', label: 'Small (<R10M)' },
              { value: 'standard', label: 'Standard (R10M–R100M)' },
              { value: 'large', label: 'Large (R100M–R1B)' },
              { value: 'systemic', label: 'Systemic (>R1B)' },
            ]} as FieldSpec,
            { key: 'counterparty_jurisdiction', label: 'Counterparty jurisdiction (ISO 3166)' },
            { key: 'counterparty_type', label: 'Counterparty type', type: 'select', options: [
              { value: 'non_resident_firm', label: 'Non-resident firm' },
              { value: 'foreign_gov', label: 'Foreign government entity' },
              { value: 'multilateral', label: 'Multilateral institution' },
              { value: 'sadc_member', label: 'SADC member state entity' },
              { value: 'eu_firm', label: 'EU-regulated firm' },
              { value: 'other', label: 'Other' },
            ]} as FieldSpec,
            { key: 'trade_type', label: 'Trade type', type: 'select', options: [
              { value: 'spot_energy', label: 'Spot energy' },
              { value: 'forward_contract', label: 'Forward contract' },
              { value: 'option', label: 'Option' },
              { value: 'swap', label: 'Swap' },
              { value: 'emissions_credit', label: 'Emissions credit' },
            ]} as FieldSpec,
            { key: 'notional_zar', label: 'Notional value (ZAR)', type: 'number' },
            { key: 'underlying_trade_ref', label: 'Underlying trade reference (W44)' },
            { key: 'reason', label: 'Transaction rationale' },
          ] as FieldSpec[]}
          onClose={() => setCreateModal(false)}
          onSubmit={async (v) => {
            const res = await fetch('/api/cross-border-trades', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({ ...v, notional_zar: v.notional_zar ? Number(v.notional_zar) : undefined }),
            });
            if (!res.ok) throw new Error(await res.text());
            setCreateModal(false); bump();
          }}
        />
      )}

      {modal && (
        <ActionModal
          title={`Cross-border pre-approval — ${modal.cbt_tier} — ${modal.counterparty_jurisdiction} — R${modal.notional_zar?.toLocaleString() ?? '?'}`}
          submitLabel="Submit action"
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: [
              { value: 'submit_fsca_application', label: 'Submit FSCA application' },
              { value: 'submit_sarb_application', label: 'Submit SARB ExCon application' },
              { value: 'fsca_review_commenced', label: 'FSCA review commenced' },
              { value: 'sarb_review_commenced', label: 'SARB review commenced' },
              { value: 'fsca_grant_approval', label: 'FSCA grants approval' },
              { value: 'obtain_full_approval', label: 'Obtain full approval (FSCA + SARB)' },
              { value: 'execute_trade', label: 'Execute trade' },
              { value: 'fsca_reject', label: 'FSCA rejects' },
              { value: 'sarb_reject', label: 'SARB rejects' },
              { value: 'withdraw', label: 'Withdraw application' },
              { value: 'expire', label: 'Mark approval expired' },
            ]} as FieldSpec,
            { key: 'fsca_application_ref', label: 'FSCA application reference' },
            { key: 'fsca_approval_ref', label: 'FSCA approval reference' },
            { key: 'fsca_rejection_reason', label: 'FSCA rejection reason' },
            { key: 'sarb_application_ref', label: 'SARB ExCon application reference' },
            { key: 'sarb_approval_ref', label: 'SARB approval reference' },
            { key: 'sarb_rejection_reason', label: 'SARB rejection reason' },
            { key: 'trade_executed_at', label: 'Trade execution timestamp (ISO 8601)' },
            { key: 'trade_settlement_date', label: 'Settlement date' },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/cross-border-trades/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify(v),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); bump();
          }}
        />
      )}
    </div>
  );
}
