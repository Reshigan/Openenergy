import React from 'react';
import { WorkstationShell } from '../launch/WorkstationShell';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import type { TourDef } from '../launch/ProductTour';

// E2.3 — Phase E husk. All Trader workstation tabs migrated to the Meridian model:
//   • Chain tabs (pretrade_credit_check, pnl_attribution, settlement_fail, benchmark_transition,
//     fsca_compliance_report, fsca_conduct_report, cross_border_trade, isda_agreement) → /ledger/:chainKey.
//   • Non-chain order/post-trade/listing/report/audit surfaces + connectors + MM compliance →
//     /surface/:key via SURFACE_REGISTRY (see pages/src/meridian/surfaces.tsx, `trader:*`).
// The page is retained as an empty WorkstationShell (kpis + incoming panels + tour) per the
// Phase E pattern; tabs are intentionally empty.

const TRADER_TOUR: TourDef = {
  id: 'trader-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'Your trader workstation', body: 'This is your central command for every workflow from order placement to post-trade compliance. The header shows live KPIs and quick-action buttons.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Live market KPIs', body: 'Open positions, P&L, margin usage, and breach counts update in near-real time. Red figures need immediate attention.', placement: 'bottom' },
    { target: 'tab-nav', title: 'Workflow tabs', body: 'Every trading workflow has its own tab — Trading, Risk, Post-trade, Compliance. Use the search box to jump to any tab by name when the workstation has many open workflows.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start wizards', body: 'New here? Click Quick start to launch a step-by-step guided workflow. Wizards walk you through placing your first order, registering an algo system, or filing a STOR.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'Click this to see every action available to a trader — deep links into each workflow with a one-line description of what each does.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'Counterparty confirmations, margin calls, and regulatory requests land here. Act on them without navigating away from your current tab.', placement: 'left' },
  ],
};

export function TraderWorkstationPage() {
  const kpis = useWorkstationKpis('trader');
  const openOrders = useWorkstationPanel('Open orders', '/trading/orders', (r) => ({
    id: r.id,
    lead: <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${r.side === 'buy' ? 'bg-[oklch(0.94_0.02_250)] text-[oklch(0.46_0.16_55)]' : 'bg-[#fbe9e6] text-[#c0392b]'}`}>{r.side}</span>,
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
      subtitle="Pre-trade checks → Active trading → Risk & margin → Post-trade settlement → Compliance reporting"
      backHref="/trader-risk"
      backLabel="Trader risk"
      kpis={kpis}
      panels={panels}
      tour={TRADER_TOUR}
      tabs={[]}
    />
  );
}
