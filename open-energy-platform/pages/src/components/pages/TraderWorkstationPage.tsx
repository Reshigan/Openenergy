import React, { useEffect, useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import { RiskTab } from '../risk/RiskTab';
import { MmComplianceTab } from '../trader/MmComplianceTab';
import { SettlementFailChainTab } from '../settlement-fail/SettlementFailChainTab';
import { BenchmarkTransitionChainTab } from '../benchmark-transition/BenchmarkTransitionChainTab';
import { PreTradeCreditChainTab } from '../trader/PreTradeCreditChainTab';
import { PnlAttributionChainTab } from '../trader/PnlAttributionChainTab';
import { StrateSwiftConnectorTab } from '../strateSwiftConnector/StrateSwiftConnectorTab';
import { SapOracleErpConnectorTab } from '../sapOracleErpConnector/SapOracleErpConnectorTab';
import { GovernmentFilingConnectorTab } from '../governmentFilingConnector/GovernmentFilingConnectorTab';
import { api } from '../../lib/api';
import { ReportPanel, type ReportConfig } from '../launch/ReportPanel';
import type { WizardSpec } from '../launch/WizardModal';
import type { TourDef } from '../launch/ProductTour';

const TRADER_REPORTS: ReportConfig[] = [
  {
    title: 'Trade Settlement',
    endpoint: '/api/settlement/cycles',
    columns: [
      { key: 'trade_date', label: 'Trade Date' },
      { key: 'total_trades', label: 'Trades', numeric: true },
      { key: 'total_volume_mwh', label: 'Volume MWh', numeric: true },
      { key: 'total_value_zar', label: 'Value ZAR', numeric: true },
      { key: 'status', label: 'Status' },
    ],
    dateKey: 'trade_date',
    pivotGroupBy: 'status',
    mailSubject: 'CEC — Trade Settlement Report',
  },
  {
    title: 'Best Execution Records',
    endpoint: '/api/trader/best-execution',
    columns: [
      { key: 'order_ref', label: 'Order' },
      { key: 'instrument', label: 'Instrument' },
      { key: 'executed_volume_mwh', label: 'MWh', numeric: true },
      { key: 'executed_price_zar', label: 'ZAR/MWh', numeric: true },
      { key: 'slippage_zar', label: 'Slippage', numeric: true },
      { key: 'chain_status', label: 'Status' },
    ],
    pivotGroupBy: 'instrument',
    mailSubject: 'CEC — Best Execution Report',
  },
  {
    title: 'FSCA Trade Reports',
    endpoint: '/api/trader/trade-reports',
    columns: [
      { key: 'report_ref', label: 'Reference' },
      { key: 'reporting_period', label: 'Period' },
      { key: 'total_trades_reported', label: 'Trades', numeric: true },
      { key: 'chain_status', label: 'Status' },
      { key: 'submitted_at', label: 'Submitted' },
    ],
    dateKey: 'submitted_at',
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC — FSCA Trade Reports',
  },
];

const TRADER_WIZARDS: WizardSpec[] = [
  {
    id: 'trader-complete-setup',
    title: 'Set up your trader workstation',
    subtitle: 'Walk through every trading, risk, compliance, and settlement workflow available to you',
    steps: [
      {
        title: 'Trading setup',
        description: 'Configure your default trading preferences. The Order book, Pre-trade credit, Best-execution RFQ, and Trade allocation tabs are all in this group.',
        aiHint: 'Pre-trade credit limits are the most common cause of order rejections for new traders. Set them generously at first — you can tighten them once you know your typical order sizes. The pre-trade guard also checks mark age; if VWAP data is stale the guard rejects orders.',
        fields: [
          { key: 'default_energy_types', label: 'Energy types you will trade', type: 'select', options: [{ value: 'solar', label: 'Solar' }, { value: 'wind', label: 'Wind' }, { value: 'all', label: 'All markets' }] },
          { key: 'max_order_size_mwh', label: 'Max single order size (MWh)', type: 'number', placeholder: 'e.g. 500 — sets initial pre-trade guard limit' },
          { key: 'default_counterparty', label: 'Primary settlement counterparty', type: 'text', placeholder: 'STRATE LEI or counterparty name' },
        ],
      },
      {
        title: 'Risk management',
        description: 'Set up your Risk dashboard, Margin management, P&L attribution, Position limits, and Counterparty default workflows.',
        aiHint: 'Daily VaR is calculated using 10-day 99% confidence — set your soft limit at 80% of your firm\'s regulatory capital buffer. Position limit breach (Wave W29) starts a 10-state FSCA §41 workflow — set limits you can actually operate within.',
        fields: [
          { key: 'var_limit_zar', label: 'Daily VaR soft limit (ZAR)', type: 'number', placeholder: 'e.g. 5000000' },
          { key: 'position_limit_mw', label: 'Max net position (MW)', type: 'number', placeholder: 'e.g. 200' },
          { key: 'margin_call_contact', label: 'Margin call notification email', type: 'text', placeholder: 'risk@firm.co.za' },
        ],
      },
      {
        title: 'Post-trade & settlement',
        description: 'Configure Trade allocation, Settlement fails, Benchmark transition, and Settlement rails (STRATE/SWIFT) workflows.',
        aiHint: 'STRATE settlement is T+3 for energy derivatives. If your firm has a direct STRATE member connection, link it here. Otherwise CEC acts as your settlement agent. CSDR penalties apply for fails beyond T+7.',
        fields: [
          { key: 'settlement_agent', label: 'Settlement arrangement', type: 'select', options: [{ value: 'open_energy', label: 'CEC as settlement agent' }, { value: 'direct_strate', label: 'Direct STRATE member' }, { value: 'custodian', label: 'Custodian bank' }] },
          { key: 'strate_lei', label: 'STRATE LEI code', type: 'text', placeholder: 'Leave blank if using the CEC agent' },
        ],
      },
      {
        title: 'FSCA compliance',
        description: 'Set up FSCA conduct reports, STOR filing, Market-maker compliance, Cross-border pre-approvals, and ISDA agreement register.',
        aiHint: 'FSCA periodic conduct reports are due quarterly for retail-tier traders, monthly for market-makers. The system auto-generates the report draft — you review and submit. STORs must be filed within 24h of identifying suspicious activity.',
        fields: [
          { key: 'fsca_reg_number', label: 'FSCA authorisation number', type: 'text', placeholder: 'e.g. FSP 12345' },
          { key: 'is_market_maker', label: 'Are you a market maker?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes — monthly FSCA reporting + MM compliance chain' }, { value: 'no', label: 'No — quarterly reporting' }] },
          { key: 'stor_contact', label: 'STOR reporting officer', type: 'text', placeholder: 'Name and email of compliance officer' },
        ],
      },
      {
        title: 'Algo trading & trade reporting',
        description: 'Set up Algo certification (FSCA/MiFID RTS6), Trade repository reporting, and the post-trade recon chain.',
        aiHint: 'Every algorithm deployed in live trading must have a valid certification record. The kill switch URL is tested monthly by the exchange ops team. Trade repository reporting to the FSCA TR is mandatory within T+1 for all OTC derivatives above the threshold.',
        fields: [
          { key: 'algo_systems_count', label: 'Number of algo systems to certify', type: 'number', placeholder: '0 if manual trading only' },
          { key: 'tr_reporting_flag', label: 'Trade repository reporting required?', type: 'select', options: [{ value: 'yes', label: 'Yes — FMA §2012 applies' }, { value: 'no', label: 'No — below threshold' }] },
        ],
      },
    ],
    submitLabel: 'Save trading setup',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ role: 'trader', ...values }) }).catch(() => {});
    },
  },
  {
    id: 'trader-place-order',
    title: 'Place your first order',
    subtitle: 'Submit a bid or offer into the CEC exchange',
    steps: [
      {
        title: 'Product',
        description: 'Choose what you are trading and when.',
        aiHint: 'Energy type and delivery date determine which order book your order lands in. Mismatched dates are the most common new-trader mistake.',
        fields: [
          { key: 'energy_type', label: 'Energy type', type: 'select', required: true, options: [{ value: 'solar', label: 'Solar' }, { value: 'wind', label: 'Wind' }, { value: 'hydro', label: 'Hydro' }, { value: 'gas', label: 'Gas' }, { value: 'coal', label: 'Coal' }, { value: 'nuclear', label: 'Nuclear' }] },
          { key: 'delivery_date', label: 'Delivery date', type: 'date', required: true },
          { key: 'side', label: 'Side', type: 'select', required: true, options: [{ value: 'buy', label: 'Buy (bid)' }, { value: 'sell', label: 'Sell (offer)' }] },
        ],
      },
      {
        title: 'Price & size',
        description: 'Set the volume and limit price for your order.',
        aiHint: 'Use the VWAP mark visible in the KPI row as a reference price. Orders more than 15% from the mark will be flagged by the pre-trade guard.',
        fields: [
          { key: 'volume_mwh', label: 'Volume (MWh)', type: 'number', required: true, placeholder: 'e.g. 100' },
          { key: 'price_zar_mwh', label: 'Limit price (R/MWh)', type: 'number', required: true, placeholder: 'e.g. 1450.00' },
        ],
      },
      {
        title: 'Confirm',
        description: 'Review your order before it is submitted to the matching engine.',
        aiHint: 'Once submitted, the order enters the open book immediately. You can cancel or amend from the Open orders tab.',
        fields: [
          { key: 'notes', label: 'Trading notes (optional)', type: 'textarea', placeholder: 'Internal reference, strategy notes, etc.' },
        ],
      },
    ],
    submitLabel: 'Submit order',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/trading/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ energy_type: values.energy_type, delivery_date: values.delivery_date, side: values.side, volume_mwh: Number(values.volume_mwh), price_zar_mwh: Number(values.price_zar_mwh), notes: values.notes }) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Order submission failed'); }
    },
  },
  {
    id: 'trader-algo-cert',
    title: 'Register an algo trading system',
    subtitle: 'FSCA / FMA RTS-6 certification before live deployment',
    steps: [
      {
        title: 'System identity',
        description: 'Identify the algorithm and its owner.',
        aiHint: 'The system_name must be unique per firm. Use a naming convention like FIRM-STRAT-VERSION (e.g. OEC-MKTMK-V2).',
        fields: [
          { key: 'system_name', label: 'System name', type: 'text', required: true, placeholder: 'e.g. OEC-MKTMK-V2' },
          { key: 'vendor', label: 'Vendor / developer', type: 'text', placeholder: 'In-house or third-party' },
          { key: 'strategy_type', label: 'Strategy type', type: 'select', required: true, options: [{ value: 'market_making', label: 'Market making' }, { value: 'arbitrage', label: 'Arbitrage' }, { value: 'execution', label: 'Execution algorithm' }, { value: 'prop', label: 'Proprietary trading' }] },
        ],
      },
      {
        title: 'Kill switch',
        description: 'Provide the technical details needed by the exchange for emergency disconnect.',
        aiHint: 'FSCA requires a kill switch that can halt all open orders within 500ms. The kill_switch_url is called by exchange operations during a market halt.',
        fields: [
          { key: 'kill_switch_url', label: 'Kill switch endpoint URL', type: 'text', required: true, placeholder: 'https://…/kill' },
          { key: 'max_order_rate', label: 'Max order rate (per second)', type: 'number', placeholder: 'e.g. 10' },
        ],
      },
      {
        title: 'Certification scope',
        description: 'Describe the certification testing already completed.',
        aiHint: 'Certification covers: pre-deployment testing, real-time risk controls, annual review. FSCA typically takes 5–15 business days to review.',
        fields: [
          { key: 'testing_environment', label: 'Testing environment used', type: 'select', options: [{ value: 'uat', label: 'UAT / sandbox' }, { value: 'prod_mirror', label: 'Production mirror' }] },
          { key: 'certification_date', label: 'Testing completed date', type: 'date', required: true },
          { key: 'operator_attestation', label: 'Operator attestation', type: 'textarea', required: true, placeholder: 'I confirm that the system has been tested against the CEC algo-certification checklist and meets all FSCA RTS-6 requirements…' },
        ],
      },
    ],
    submitLabel: 'Submit for certification',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/algo-cert', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Certification submission failed'); }
    },
  },
  {
    id: 'trader-stor',
    title: 'Submit a STOR (Suspicious Transaction Report)',
    subtitle: 'FSCA FMA Chapter X — report to the regulator',
    steps: [
      {
        title: 'Subject',
        description: 'Who or what is the subject of this report?',
        aiHint: 'A STOR must be filed as soon as you have reasonable grounds to suspect market abuse — not after investigation is complete.',
        fields: [
          { key: 'subject_name', label: 'Subject name / account', type: 'text', required: true },
          { key: 'subject_type', label: 'Subject type', type: 'select', options: [{ value: 'participant', label: 'Market participant' }, { value: 'order', label: 'Specific order' }, { value: 'pattern', label: 'Trading pattern' }] },
          { key: 'energy_type', label: 'Affected market', type: 'select', options: [{ value: 'solar', label: 'Solar' }, { value: 'wind', label: 'Wind' }, { value: 'all', label: 'All markets' }] },
        ],
      },
      {
        title: 'Incident',
        description: 'Describe what was observed and when.',
        aiHint: 'Be factual and specific. Include order IDs, timestamps, and the reason you suspect manipulation or insider trading.',
        fields: [
          { key: 'incident_date', label: 'Incident date', type: 'date', required: true },
          { key: 'description', label: 'Description of suspicious activity', type: 'textarea', required: true, placeholder: 'Describe the order pattern, timing, or information that raised concern…' },
        ],
      },
      {
        title: 'Classification',
        description: 'Classify the suspected market abuse type.',
        fields: [
          { key: 'abuse_type', label: 'Suspected abuse type', type: 'select', required: true, options: [{ value: 'insider_trading', label: 'Insider trading' }, { value: 'market_manipulation', label: 'Market manipulation' }, { value: 'spoofing', label: 'Spoofing / layering' }, { value: 'wash_trading', label: 'Wash trading' }, { value: 'other', label: 'Other' }] },
          { key: 'urgency', label: 'Urgency', type: 'select', options: [{ value: 'immediate', label: 'Immediate — active manipulation' }, { value: 'standard', label: 'Standard — historical pattern' }] },
        ],
      },
    ],
    submitLabel: 'File STOR',
    cta: 'danger',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/market-abuse', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'STOR submission failed'); }
    },
  },
  {
    id: 'trader-rfq',
    title: 'Submit an RFQ',
    subtitle: 'Request for quotation — buy-side price discovery',
    steps: [
      {
        title: 'RFQ details',
        fields: [
          { key: 'buyer_id', label: 'Buyer ID', type: 'text', required: true, placeholder: 'Your firm LEI or participant ID' },
          { key: 'product_type', label: 'Product type', type: 'select', required: true, options: [{ value: 'power_ppa', label: 'Power PPA' }, { value: 'renewable_certificate', label: 'Renewable certificate' }, { value: 'carbon_credit', label: 'Carbon credit' }] },
          { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Describe your requirements…' },
          { key: 'volume_mwh', label: 'Volume (MWh)', type: 'number', required: true, placeholder: 'e.g. 10000' },
        ],
      },
      {
        title: 'Pricing & timeline',
        fields: [
          { key: 'target_price_zar', label: 'Target price (ZAR)', type: 'number', placeholder: 'e.g. 750' },
          { key: 'max_price_zar', label: 'Maximum price (ZAR)', type: 'number', placeholder: 'e.g. 900' },
          { key: 'quote_deadline', label: 'Quote deadline', type: 'date', required: true },
          { key: 'award_deadline', label: 'Award deadline', type: 'date', required: true },
        ],
      },
    ],
    submitLabel: 'Submit RFQ',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/trader/rfqs', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'trader-best-exec',
    title: 'Record best execution',
    subtitle: 'FSCA Conduct Standard 1/2020 — post-execution record',
    steps: [
      {
        title: 'Order details',
        fields: [
          { key: 'order_ref', label: 'Order reference', type: 'text', required: true, placeholder: 'e.g. ORD-2026-0042' },
          { key: 'instrument', label: 'Instrument', type: 'select', required: true, options: [{ value: 'solar_pv_day_ahead', label: 'Solar PV day-ahead' }, { value: 'wind_day_ahead', label: 'Wind day-ahead' }, { value: 'baseload_forward', label: 'Baseload forward' }] },
          { key: 'order_side', label: 'Side', type: 'select', required: true, options: [{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }] },
          { key: 'ordered_volume_mwh', label: 'Ordered volume (MWh)', type: 'number', required: true },
          { key: 'ordered_price_zar', label: 'Ordered price (ZAR/MWh)', type: 'number', required: true },
        ],
      },
      {
        title: 'Execution outcome',
        fields: [
          { key: 'executed_volume_mwh', label: 'Executed volume (MWh)', type: 'number', required: true },
          { key: 'executed_price_zar', label: 'Executed price (ZAR/MWh)', type: 'number', required: true },
          { key: 'best_venue', label: 'Best execution venue', type: 'text', placeholder: 'e.g. OE Exchange, bilateral OTC' },
        ],
      },
    ],
    submitLabel: 'Record execution',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/trader/best-execution', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'trader-trade-report',
    title: 'File FSCA trade report',
    subtitle: 'FMA 2012 — trade repository reporting',
    steps: [
      {
        title: 'Report period',
        fields: [
          { key: 'reporting_period', label: 'Reporting period', type: 'text', required: true, placeholder: 'e.g. 2026-Q2' },
          { key: 'report_type', label: 'Report type', type: 'select', required: true, options: [{ value: 'otc_derivatives', label: 'OTC derivatives' }, { value: 'exchange_traded', label: 'Exchange traded' }, { value: 'both', label: 'Both' }] },
        ],
      },
      {
        title: 'Submission details',
        fields: [
          { key: 'total_trades_reported', label: 'Total trades reported', type: 'number', required: true },
          { key: 'total_notional_zar', label: 'Total notional (ZAR)', type: 'number', required: true },
          { key: 'reporting_obligation', label: 'Reporting obligation', type: 'select', required: true, options: [{ value: 'fma_s17', label: 'FMA §17' }, { value: 'fsca_conduct_standard', label: 'FSCA Conduct Standard' }, { value: 'dodd_frank_comparable', label: 'Dodd-Frank comparable' }] },
        ],
      },
    ],
    submitLabel: 'File report',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/trader/trade-reports', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'trader-algo-cert-new',
    title: 'Register algo certification',
    subtitle: 'FSCA / MiFID RTS-6 — pre-deployment governance gate',
    steps: [
      {
        title: 'System details',
        fields: [
          { key: 'system_name', label: 'System name', type: 'text', required: true, placeholder: 'e.g. OEC-MKTMK-V3' },
          { key: 'system_version', label: 'System version', type: 'text', required: true, placeholder: 'e.g. 3.1.0' },
          { key: 'kill_switch_mechanism', label: 'Kill switch mechanism', type: 'select', required: true, options: [{ value: 'automated_hard_limit', label: 'Automated hard limit' }, { value: 'manual_override', label: 'Manual override' }, { value: 'dual_key', label: 'Dual-key authorisation' }] },
        ],
      },
      {
        title: 'Governance',
        fields: [
          { key: 'testing_completed_at', label: 'Testing completed date', type: 'date', required: true },
          { key: 'responsible_officer', label: 'Responsible officer', type: 'text', required: true, placeholder: 'Name and email' },
          { key: 'certification_tier', label: 'Certification tier', type: 'select', required: true, options: [{ value: 'retail', label: 'Retail' }, { value: 'wholesale', label: 'Wholesale' }, { value: 'market_maker', label: 'Market maker' }, { value: 'systemic', label: 'Systemic' }] },
        ],
      },
    ],
    submitLabel: 'Register certification',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/trader/algo-certifications', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'trader-position-limit',
    title: 'Report position limit breach',
    subtitle: 'FSCA §41 — 10-state position limit breach workflow',
    steps: [
      {
        title: 'Breach details',
        fields: [
          { key: 'instrument', label: 'Instrument', type: 'text', required: true, placeholder: 'e.g. solar_pv_day_ahead' },
          { key: 'breach_type', label: 'Breach type', type: 'select', required: true, options: [{ value: 'gross_limit', label: 'Gross limit' }, { value: 'net_limit', label: 'Net limit' }, { value: 'concentration', label: 'Concentration' }] },
          { key: 'breach_magnitude_mwh', label: 'Breach magnitude (MWh)', type: 'number', required: true },
        ],
      },
      {
        title: 'Remediation',
        fields: [
          { key: 'reduction_plan', label: 'Reduction plan', type: 'textarea', required: true, placeholder: 'Describe how you will bring the position back within limits…' },
          { key: 'estimated_compliance_date', label: 'Estimated compliance date', type: 'date', required: true },
        ],
      },
    ],
    submitLabel: 'Report breach',
    cta: 'danger',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/trader/position-limits', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'trader-counterparty-margin',
    title: 'Raise counterparty margin call (W68)',
    steps: [
      {
        title: 'Event details',
        description: 'Capture the margin shortfall event and due date.',
        aiHint: 'Margin calls must be delivered by the contractual notice deadline. Missing the due_by timestamp starts the default management clock under CPMI-IOSCO PFMI.',
        fields: [
          { key: 'counterparty_id', label: 'Counterparty ID', type: 'text', required: true },
          { key: 'event_type', label: 'Event type', type: 'select', options: [{ value: 'initial_margin_call', label: 'Initial margin call' }, { value: 'variation_margin_call', label: 'Variation margin call' }, { value: 'default_notice', label: 'Default notice' }] },
          { key: 'margin_shortfall_zar', label: 'Margin shortfall (ZAR)', type: 'number', required: true },
          { key: 'due_by', label: 'Due by', type: 'date', required: true },
        ],
      },
      {
        title: 'Default management',
        description: 'Set the recovery strategy and escalation contacts.',
        aiHint: 'If the cure period lapses, the close-out netting provisions under the ISDA agreement activate. Engage enforcement counsel early for large exposures.',
        fields: [
          { key: 'recovery_strategy', label: 'Recovery strategy', type: 'select', options: [{ value: 'cure_period', label: 'Cure period' }, { value: 'close_out', label: 'Close-out netting' }, { value: 'default_fund', label: 'Default fund draw' }, { value: 'resolution', label: 'Resolution' }] },
          { key: 'enforcement_counsel', label: 'Enforcement counsel', type: 'text' },
          { key: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    ],
    onSubmit: async (values) => {
      await api.post('/counterparty-margin', values);
    },
  },
  {
    id: 'trader-trade-allocation',
    title: 'New trade allocation (W76)',
    steps: [
      {
        title: 'Block trade details',
        description: 'Identify the block trade being allocated.',
        aiHint: 'Block trades must be allocated to sub-accounts before the CTM affirmation deadline. Late allocations incur CSDR penalties from T+2.',
        fields: [
          { key: 'block_trade_ref', label: 'Block trade reference', type: 'text', required: true },
          { key: 'total_notional_zar', label: 'Total notional (ZAR)', type: 'number', required: true },
          { key: 'trade_date', label: 'Trade date', type: 'date', required: true },
          { key: 'product_type', label: 'Product type', type: 'select', options: [{ value: 'energy_derivative', label: 'Energy derivative' }, { value: 'otc_forward', label: 'OTC forward' }, { value: 'auction_contract', label: 'Auction contract' }] },
        ],
      },
      {
        title: 'Allocation accounts',
        description: 'Define the per-account split and affirmation deadline.',
        aiHint: 'Each line must sum to 100%. CTM reference links this allocation to the Omgeo confirmation chain for STP matching.',
        fields: [
          { key: 'allocation_accounts', label: 'Allocation accounts', type: 'textarea', required: true, placeholder: 'Account ID, share %; one per line' },
          { key: 'ctm_reference', label: 'CTM reference', type: 'text', placeholder: 'Omgeo CTM ref if applicable' },
          { key: 'affirmation_deadline', label: 'Affirmation deadline', type: 'date', required: true },
        ],
      },
    ],
    onSubmit: async (values) => {
      await api.post('/trade-allocations', values);
    },
  },
  {
    id: 'trader-settlement-fail',
    title: 'Log settlement fail',
    steps: [
      {
        title: 'Fail details',
        description: 'Record the failed settlement instruction.',
        aiHint: 'Settlement fails must be logged by end of day T+1. CSDR penalties accrue from T+2 for equity-linked instruments and T+4 for bonds.',
        fields: [
          { key: 'trade_ref', label: 'Trade reference', type: 'text', required: true },
          { key: 'fail_date', label: 'Fail date', type: 'date', required: true },
          { key: 'fail_type', label: 'Fail type', type: 'select', options: [{ value: 'delivery_fail', label: 'Delivery fail' }, { value: 'payment_fail', label: 'Payment fail' }, { value: 'custodian_fail', label: 'Custodian fail' }, { value: 'nostro_fail', label: 'Nostro fail' }] },
          { key: 'failing_party', label: 'Failing party', type: 'select', options: [{ value: 'us', label: 'Us' }, { value: 'counterparty', label: 'Counterparty' }, { value: 'custodian', label: 'Custodian' }] },
          { key: 'notional_zar', label: 'Notional (ZAR)', type: 'number', required: true },
        ],
      },
      {
        title: 'Resolution',
        description: 'Set the resolution approach and expected settlement date.',
        aiHint: 'Buy-in procedures under CSDR must be initiated by the CSD no later than 4 business days after the intended settlement date.',
        fields: [
          { key: 'resolution_approach', label: 'Resolution approach', type: 'select', options: [{ value: 'buy_in', label: 'Buy-in' }, { value: 'bilateral_cancel', label: 'Bilateral cancellation' }, { value: 'extension', label: 'Extension' }] },
          { key: 'expected_resolution_date', label: 'Expected resolution date', type: 'date' },
          { key: 'csdr_penalty_applicable', label: 'CSDR penalty applicable', type: 'select', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    ],
    onSubmit: async (values) => {
      await api.post('/settlement-fails', values);
    },
  },
  {
    id: 'trader-benchmark',
    title: 'Initiate benchmark transition',
    steps: [
      {
        title: 'Transition details',
        description: 'Identify the legacy and replacement benchmarks.',
        aiHint: 'ZARONIA replaced JIBAR as the primary overnight reference rate effective 2026. Fallback language must be confirmed before executing any transition.',
        fields: [
          { key: 'legacy_benchmark', label: 'Legacy benchmark', type: 'select', options: [{ value: 'JIBAR_3M', label: 'JIBAR 3M' }, { value: 'JIBAR_6M', label: 'JIBAR 6M' }, { value: 'JIBAR_1M', label: 'JIBAR 1M' }, { value: 'LIBOR_USD', label: 'LIBOR USD' }, { value: 'EURIBOR', label: 'EURIBOR' }] },
          { key: 'new_benchmark', label: 'New benchmark', type: 'select', options: [{ value: 'ZARONIA', label: 'ZARONIA' }, { value: 'SOFR', label: 'SOFR' }, { value: 'ESTR', label: 'ESTR' }, { value: 'SONIA', label: 'SONIA' }] },
          { key: 'transition_date', label: 'Transition date', type: 'date', required: true },
          { key: 'notional_zar', label: 'Notional (ZAR)', type: 'number', required: true },
        ],
      },
      {
        title: 'Documentation',
        description: 'Confirm all legal and regulatory documentation requirements.',
        aiHint: 'ISDA protocol adherence is required for multi-lateral transition. Client notification must precede the transition date.',
        fields: [
          { key: 'client_notification_sent', label: 'Client notification sent', type: 'select', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'fallback_language_confirmed', label: 'Fallback language confirmed', type: 'select', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'isda_protocol_adhered', label: 'ISDA protocol adhered', type: 'select', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'legal_review_ref', label: 'Legal review reference', type: 'text' },
        ],
      },
    ],
    onSubmit: async (values) => {
      await api.post('/benchmark-transitions', values);
    },
  },
  {
    id: 'trader-fsca-compliance',
    title: 'Submit FSCA compliance report (W201)',
    steps: [
      {
        title: 'Report details',
        description: 'Provide the reporting period and FSP licence details.',
        aiHint: 'FSCA annual compliance reports are due within 4 months of financial year-end. Late submissions attract administrative penalties under FAIS.',
        fields: [
          { key: 'reporting_period', label: 'Reporting period', type: 'text', required: true, placeholder: 'e.g. Q1 2026' },
          { key: 'report_type', label: 'Report type', type: 'select', options: [{ value: 'quarterly', label: 'Quarterly' }, { value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual' }] },
          { key: 'fsp_licence_number', label: 'FSP licence number', type: 'text', required: true },
          { key: 'total_trades_count', label: 'Total trades count', type: 'number' },
          { key: 'total_notional_zar', label: 'Total notional (ZAR)', type: 'number' },
        ],
      },
      {
        title: 'Attestation',
        description: 'Compliance officer sign-off and deficiency disclosure.',
        aiHint: 'Board approval is required for annual reports. Any deficiencies must be disclosed with a remediation plan — omissions constitute a separate FSCA violation.',
        fields: [
          { key: 'compliance_officer_name', label: 'Compliance officer name', type: 'text', required: true },
          { key: 'board_approved', label: 'Board approved', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'deficiency_description', label: 'Deficiency description', type: 'textarea', placeholder: 'Any deficiencies to disclose' },
          { key: 'remediation_plan', label: 'Remediation plan', type: 'textarea' },
        ],
      },
    ],
    onSubmit: async (values) => {
      await api.post('/fsca-compliance-reports', values);
    },
  },
  {
    id: 'trader-fsca-conduct',
    title: 'Submit FSCA conduct report (W216)',
    steps: [
      {
        title: 'Report period',
        description: 'Identify the FSP class and reporting period.',
        aiHint: 'Market makers must file monthly; retail-tier traders quarterly. The SLA is calculated from period-end, not submission date.',
        fields: [
          { key: 'report_year', label: 'Report year', type: 'number', required: true },
          { key: 'fsp_class', label: 'FSP class', type: 'select', required: true, options: [{ value: 'category_1', label: 'Category I' }, { value: 'category_2', label: 'Category II' }, { value: 'market_maker', label: 'Market maker' }, { value: 'systemic', label: 'Systemic' }] },
          { key: 'reporting_period_start', label: 'Reporting period start', type: 'date', required: true },
          { key: 'reporting_period_end', label: 'Reporting period end', type: 'date', required: true },
          { key: 'client_count', label: 'Client count', type: 'number' },
          { key: 'complaint_count', label: 'Complaint count', type: 'number' },
        ],
      },
      {
        title: 'Compliance attestation',
        description: 'Record exceptions, breaches, and board sign-off.',
        aiHint: 'Best-execution exceptions above zero require narrative explanation. Conduct breaches above zero trigger automatic FSCA escalation.',
        fields: [
          { key: 'best_ex_exceptions', label: 'Best-ex exceptions', type: 'number', placeholder: '0 if none' },
          { key: 'conduct_breaches', label: 'Conduct breaches', type: 'number', placeholder: '0 if none' },
          { key: 'compliance_officer_name', label: 'Compliance officer name', type: 'text', required: true },
          { key: 'board_sign_off_date', label: 'Board sign-off date', type: 'date', required: true },
        ],
      },
    ],
    onSubmit: async (values) => {
      await api.post('/fsca-conduct-reports', values);
    },
  },
  {
    id: 'trader-cross-border',
    title: 'Apply for cross-border pre-approval (W222)',
    steps: [
      {
        title: 'Transaction details',
        description: 'Classify the cross-border transaction and counterparty jurisdiction.',
        aiHint: 'SARB ExCon approval is required for all cross-border capital flows above the single discretionary allowance threshold. FSCA approval is additionally required for OTC derivatives.',
        fields: [
          { key: 'cbt_tier', label: 'CBT tier', type: 'select', required: true, options: [{ value: 'small', label: 'Small' }, { value: 'standard', label: 'Standard' }, { value: 'large', label: 'Large' }, { value: 'systemic', label: 'Systemic' }] },
          { key: 'counterparty_jurisdiction', label: 'Counterparty jurisdiction', type: 'text', required: true, placeholder: 'e.g. Zambia, Zimbabwe, Mozambique' },
          { key: 'trade_type', label: 'Trade type', type: 'select', required: true, options: [{ value: 'energy_derivative', label: 'Energy derivative' }, { value: 'carbon_credit', label: 'Carbon credit' }, { value: 'ancillary_service', label: 'Ancillary service' }, { value: 'ppa_assignment', label: 'PPA assignment' }] },
          { key: 'notional_zar', label: 'Notional (ZAR)', type: 'number', required: true },
          { key: 'underlying_trade_ref', label: 'Underlying trade reference', type: 'text' },
        ],
      },
      {
        title: 'Regulatory',
        description: 'Provide application references and confirm currency control status.',
        aiHint: 'Section 9 exemptions apply to SADC member state energy transactions below R500m. Confirm with SARB legal before claiming the exemption.',
        fields: [
          { key: 'sarb_application_ref', label: 'SARB application reference', type: 'text' },
          { key: 'fsca_application_ref', label: 'FSCA application reference', type: 'text' },
          { key: 'currency_control_applicable', label: 'Currency control applicable', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'section_9_exemption', label: 'Section 9 exemption', type: 'select', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    ],
    onSubmit: async (values) => {
      await api.post('/cross-border-trades', values);
    },
  },
  {
    id: 'trader-isda',
    title: 'Register ISDA agreement (W232)',
    steps: [
      {
        title: 'Agreement details',
        description: 'Identify the counterparty and agreement type.',
        aiHint: 'ISDA 2002 is the preferred master agreement for energy OTC trades in South Africa. CSA elections determine margin mechanics under UMR rules.',
        fields: [
          { key: 'counterparty_name', label: 'Counterparty name', type: 'text', required: true },
          { key: 'counterparty_type', label: 'Counterparty type', type: 'select', required: true, options: [{ value: 'bank', label: 'Bank' }, { value: 'broker', label: 'Broker' }, { value: 'energy_company', label: 'Energy company' }, { value: 'ccp', label: 'CCP' }, { value: 'other', label: 'Other' }] },
          { key: 'agreement_type', label: 'Agreement type', type: 'select', required: true, options: [{ value: 'isda_2002', label: 'ISDA 2002' }, { value: 'isda_2018', label: 'ISDA 2018' }, { value: 'isda_csa', label: 'ISDA CSA' }, { value: 'credit_support_annex', label: 'Credit support annex' }] },
          { key: 'average_notional_zar', label: 'Average notional (ZAR)', type: 'number' },
        ],
      },
      {
        title: 'Credit support',
        description: 'Configure VM CSA, UMR, and netting elections.',
        aiHint: 'VM CSA is mandatory for all in-scope counterparties under SARB Directive 3/2023. Initial margin thresholds apply to bilateral non-cleared derivatives above the €50m threshold.',
        fields: [
          { key: 'vm_csa_included', label: 'VM CSA included', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'umr_applicable', label: 'UMR applicable', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'initial_margin_threshold_zar', label: 'Initial margin threshold (ZAR)', type: 'number' },
          { key: 'independent_amount_zar', label: 'Independent amount (ZAR)', type: 'number' },
          { key: 'netting_election', label: 'Netting election', type: 'select', required: true, options: [{ value: 'single_agreement', label: 'Single agreement' }, { value: 'cross_product', label: 'Cross-product' }] },
        ],
      },
    ],
    onSubmit: async (values) => {
      await api.post('/isda-agreements', values);
    },
  },
  {
    id: 'trader-mm-compliance',
    title: 'Log MM compliance obligation (W9)',
    steps: [
      {
        title: 'Obligation details',
        description: 'Record the market-making obligation for the trading day.',
        aiHint: 'MM obligations are assessed per energy type per trading day. Spread obligations tighten during peak trading hours (09:00–16:00 SAST).',
        fields: [
          { key: 'energy_type', label: 'Energy type', type: 'select', required: true, options: [{ value: 'solar', label: 'Solar' }, { value: 'wind', label: 'Wind' }, { value: 'gas', label: 'Gas' }, { value: 'all', label: 'All' }] },
          { key: 'trading_day', label: 'Trading day', type: 'date', required: true },
          { key: 'obligation_type', label: 'Obligation type', type: 'select', options: [{ value: 'bid_ask_spread', label: 'Bid-ask spread' }, { value: 'minimum_size', label: 'Minimum size' }, { value: 'quote_uptime', label: 'Quote uptime' }, { value: 'price_quality', label: 'Price quality' }] },
          { key: 'bid_ask_spread_pct', label: 'Bid-ask spread (%)', type: 'number' },
          { key: 'minimum_quote_mwh', label: 'Minimum quote (MWh)', type: 'number' },
        ],
      },
      {
        title: 'Performance',
        description: 'Record actual quotes placed and honoured.',
        aiHint: '3 consecutive misses trigger the warning state in the W9 chain. The remediation plan is required before the breach escalates to FSCA.',
        fields: [
          { key: 'quotes_placed', label: 'Quotes placed', type: 'number', required: true },
          { key: 'quotes_honoured', label: 'Quotes honoured', type: 'number', required: true },
          { key: 'consecutive_miss_count', label: 'Consecutive miss count', type: 'number', placeholder: 'Resets to 0 on compliant day' },
          { key: 'remediation_plan', label: 'Remediation plan', type: 'textarea', placeholder: 'Required if consecutive_miss_count >= 3' },
        ],
      },
    ],
    onSubmit: async (values) => {
      await api.post('/mm-obligations', values);
    },
  },
  {
    id: 'trader-pretrade-check',
    title: 'Run pre-trade credit check',
    steps: [
      {
        title: 'Order parameters',
        description: 'Provide order details to run the pre-trade guard check.',
        aiHint: 'The pre-trade guard checks credit exposure, position limits, mark age, and trading halts. A green result means the order will not be rejected by the guard — it is not a guarantee of execution.',
        fields: [
          { key: 'energy_type', label: 'Energy type', type: 'select', required: true, options: [{ value: 'solar', label: 'Solar' }, { value: 'wind', label: 'Wind' }, { value: 'gas', label: 'Gas' }] },
          { key: 'volume_mwh', label: 'Volume (MWh)', type: 'number', required: true },
          { key: 'price_zar_mwh', label: 'Price (ZAR/MWh)', type: 'number', required: true },
          { key: 'delivery_date', label: 'Delivery date', type: 'date', required: true },
          { key: 'counterparty_id', label: 'Counterparty ID', type: 'text', required: true, placeholder: 'Counterparty LEI or ID' },
        ],
      },
    ],
    onSubmit: async (values) => {
      await api.post('/pretrade-credit-check', values);
    },
  },
  {
    id: 'trader-pnl-attr',
    title: 'Record daily P&L attribution',
    steps: [
      {
        title: 'P&L breakdown',
        description: 'Record the daily P&L attribution by Greek and desk.',
        aiHint: 'Residual P&L above 5% of total P&L requires a narrative explanation in the notes field for risk officer review.',
        fields: [
          { key: 'trade_date', label: 'Trade date', type: 'date', required: true },
          { key: 'desk_name', label: 'Desk name', type: 'text', required: true },
          { key: 'realised_pnl_zar', label: 'Realised P&L (ZAR)', type: 'number', required: true },
          { key: 'unrealised_pnl_zar', label: 'Unrealised P&L (ZAR)', type: 'number', required: true },
          { key: 'delta_pnl_zar', label: 'Delta P&L (ZAR)', type: 'number' },
          { key: 'gamma_pnl_zar', label: 'Gamma P&L (ZAR)', type: 'number' },
          { key: 'vega_pnl_zar', label: 'Vega P&L (ZAR)', type: 'number' },
          { key: 'residual_pnl_zar', label: 'Residual P&L (ZAR)', type: 'number' },
          { key: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    ],
    onSubmit: async (values) => {
      await api.post('/pnl-attribution', values);
    },
  },
];

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
      wizards={TRADER_WIZARDS}
      tour={TRADER_TOUR}
      tabs={[
        { key: 'orders', label: 'Open orders', group: 'Active trading', body: ({ onRefresh }) => <OrdersTab onRefresh={onRefresh} /> },
        { key: 'rejections', label: 'Rejections', group: 'Active trading', body: () => <RejectionsTab /> },
        { key: 'pretrade-credit', label: 'Pre-trade credit & settlement risk', group: 'Active trading', chainKey: 'pretrade_credit_check', body: () => <PreTradeCreditChainTab /> },
        { key: 'pnl-attribution', label: 'Daily P&L attribution', group: 'Active trading', chainKey: 'pnl_attribution', body: () => <PnlAttributionChainTab /> },
        { key: 'risk', label: 'Risk dashboard', group: 'Risk & margin', body: () => <RiskTab /> },
        { key: 'margin', label: 'Margin calls', group: 'Risk & margin', body: ({ onRefresh }) => <MarginTab onRefresh={onRefresh} /> },
        { key: 'exceptions', label: 'Post-trade exceptions', group: 'Post-trade & settlement', body: ({ onRefresh }) => <ExceptionsTab onRefresh={onRefresh} /> },
        { key: 'settlement-fail', label: 'Settlement fails', group: 'Post-trade & settlement', chainKey: 'settlement_fail', body: () => <SettlementFailChainTab /> },
        { key: 'benchmark-transition', label: 'Benchmark transition', group: 'Post-trade & settlement', chainKey: 'benchmark_transition', body: () => <BenchmarkTransitionChainTab /> },
        { key: 'fsca-compliance', label: 'FSCA compliance report (W201)', group: 'Compliance & reporting', chainKey: 'fsca_compliance_report', body: ({ onRefresh }) => <FscaComplianceTab onRefresh={onRefresh} /> },
        { key: 'fsca_conduct_reports', label: 'FSCA conduct reports (W216)', group: 'Compliance & reporting', chainKey: 'fsca_conduct_report', body: ({ onRefresh }) => <FscaConductReportTab onRefresh={onRefresh} /> },
        { key: 'cross_border_trades', label: 'Cross-border pre-approvals (W222)', group: 'Compliance & reporting', chainKey: 'cross_border_trade', body: ({ onRefresh }) => <CrossBorderTradeTab onRefresh={onRefresh} /> },
        { key: 'isda_agreements', label: 'ISDA agreements (W232)', group: 'Compliance & reporting', chainKey: 'isda_agreement', body: ({ onRefresh }) => <IsdaAgreementTab onRefresh={onRefresh} /> },
        { key: 'mm-compliance', label: 'MM compliance', group: 'Compliance & reporting', chainKey: 'oe_mm_obligations', body: () => <MmComplianceTab /> },
        { key: 'strate-swift-connectors', label: 'Settlement rails', group: 'Compliance & reporting', body: () => <StrateSwiftConnectorTab /> },
        { key: 'sap-oracle-erp-connectors', label: 'ERP connectors', group: 'Compliance & reporting', body: () => <SapOracleErpConnectorTab /> },
        { key: 'government-filing-connectors', label: 'Filing connectors', group: 'Compliance & reporting', body: () => <GovernmentFilingConnectorTab /> },
        { key: 'reports', label: 'Reports & Exports', group: 'Compliance & reporting',
          body: () => (
            <div className="space-y-8">
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#1e2a38]">Export</p>
                  <p className="text-xs text-[#4a5568]">Download trader data for offline analysis or regulatory submission.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const url = '/api/reports/export?role=trader&format=csv';
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'trader-report.csv';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    }}
                    className="px-3 py-1.5 text-xs bg-[#c2873a] text-white rounded hover:bg-[#a3702f]"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3 py-1.5 text-xs bg-[#2d3748] text-white rounded hover:bg-[#1e2a38]"
                  >
                    Print / PDF
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { label: 'P&L attribution', description: 'Daily P&L attribution by book and strategy. View and manage W-pnl attribution chain.', tabKey: 'pnl-attribution' },
                ].map(link => (
                  <a
                    key={link.tabKey}
                    href={`#tab-${link.tabKey}`}
                    onClick={(e) => {
                      e.preventDefault();
                      const btn = document.querySelector<HTMLButtonElement>(`[data-tab-key="${link.tabKey}"]`);
                      btn?.click();
                    }}
                    className="block rounded-lg border border-[#dde4ec] bg-white p-4 hover:border-blue-400 hover:shadow-sm transition-all"
                  >
                    <p className="text-sm font-semibold text-[#1e2a38]">{link.label}</p>
                    <p className="mt-1 text-xs text-[#4a5568]">{link.description}</p>
                  </a>
                ))}
              </div>

              {TRADER_REPORTS.map(cfg => (
                <div key={cfg.endpoint} className="space-y-2">
                  <p className="text-xs font-semibold text-[#4a5568] uppercase tracking-wide">{cfg.title}</p>
                  <ReportPanel config={cfg} />
                </div>
              ))}
            </div>
          ),
        },
        { key: 'audit', label: 'Audit & compliance', group: 'Compliance & reporting',
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
                <button type="button" onClick={() => setAmending(r)} className="px-2 py-1 text-[11px] bg-[#c2873a] text-white rounded">Amend</button>
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
      <button type="button" onClick={() => { setOpen(true); if (!data) void load(); }} className="px-2 py-1 text-[11px] bg-[#c2873a] text-white rounded">AI: why?</button>
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
        <button type="button" onClick={() => setFiling(true)} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold">
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
              <button type="button" onClick={() => setTransitioning(r)} className="px-2 py-1 text-[11px] bg-[#c2873a] text-white rounded">Transition</button>
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
        <button type="button" onClick={runScan} disabled={running} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold disabled:opacity-50">
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
          className="px-3 py-1.5 bg-[#c2873a] text-white text-xs rounded hover:bg-[#a3702f]">
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
              className="text-[oklch(0.46_0.16_55)] text-xs underline">Action</button>
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
        className="mb-4 px-4 py-2 bg-[#c2873a] text-white text-sm rounded hover:bg-[#a3702f]"
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
  small:    'bg-[oklch(0.97_0.003_250)] text-[oklch(0.46_0.16_55)]',
  standard: 'bg-purple-50 text-purple-700',
  large:    'bg-amber-50 text-amber-700',
  systemic: 'bg-rose-50 text-rose-700',
};

function cbtStatusTone(s: string): string {
  if (['trade_executed'].includes(s)) return 'bg-green-100 text-green-800';
  if (['fsca_rejected', 'sarb_rejected'].includes(s)) return 'bg-red-100 text-red-800';
  if (['withdrawn', 'expired'].includes(s)) return 'bg-[#eef2f7] text-[#3d4756]';
  if (['fully_approved'].includes(s)) return 'bg-emerald-100 text-emerald-800';
  if (['fsca_approved'].includes(s)) return 'bg-[oklch(0.94_0.008_250)] text-[oklch(0.40_0.009_250)]';
  return 'bg-[#eef2f7] text-[#2d3748]';
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
          <div key={k.label} className="bg-white border border-[#dde4ec] rounded-lg p-3 text-center">
            <div className="text-2xl font-semibold text-[#0f1c2e]">{k.val}</div>
            <div className="text-xs text-[#6b7685] mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <span className="text-sm text-[#6b7685]">{data.length} cross-border pre-approvals</span>
        <button type="button" onClick={() => setCreateModal(true)}
          className="text-sm bg-[#c2873a] text-white px-3 py-1.5 rounded-md hover:bg-[#a3702f]">
          + New pre-approval request
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[#dde4ec] text-sm">
          <thead className="bg-[#f8fafc]">
            <tr>
              {['Tier', 'Jurisdiction', 'Trade type', 'Notional (ZAR)', 'Status', 'SLA deadline', ''].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-[#6b7685] uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-[#eef2f7]">
            {data.map((row: any) => (
              <tr key={row.id} className="hover:bg-[#eef2f7]">
                <td className="px-3 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${CBT_TIER_TONE[row.cbt_tier] ?? 'bg-[#eef2f7] text-[#2d3748]'}`}>
                    {row.cbt_tier}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-[#2d3748]">{row.counterparty_jurisdiction ?? '—'}</td>
                <td className="px-3 py-2 text-[#3d4756]">{row.trade_type?.replace(/_/g, ' ') ?? '—'}</td>
                <td className="px-3 py-2 text-[#2d3748]">{row.notional_zar ? `R${Number(row.notional_zar).toLocaleString()}` : '—'}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cbtStatusTone(row.chain_status)}`}>
                    {row.chain_status?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 text-[#6b7685] text-xs">{row.sla_deadline ? new Date(row.sla_deadline).toLocaleDateString() : '—'}</td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => setModal({ id: row.id, cbt_tier: row.cbt_tier, counterparty_jurisdiction: row.counterparty_jurisdiction, notional_zar: row.notional_zar })}
                    className="text-xs text-[oklch(0.46_0.16_55)] hover:underline">Action</button>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-[#9aa5b4]">No cross-border pre-approvals found</td></tr>
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

// ── W232: ISDA Agreement & CSA Tab ──────────────────────────────────────────

type IsdaRow = {
  id: string;
  counterparty_name: string;
  counterparty_type: string;
  counterparty_tier: string;
  agreement_type: string;
  chain_status: string;
  vm_csa_included: number;
  umr_applicable: number;
  sla_deadline: string | null;
  updated_at: string;
};

type IsdaStats = {
  total: number;
  active: number;
  negotiating: number;
  terminated: number;
  sla_breached: number;
};

const ISDA_TRANSITIONS: Record<string, string[]> = {
  draft: ['issue_term_sheet'],
  term_sheet_issued: ['submit_for_counterparty_review'],
  counterparty_review: ['open_negotiation', 'terminate'],
  negotiation: ['agree_credit_terms', 'terminate'],
  credit_terms_agreed: ['submit_for_legal_review'],
  legal_review: ['notify_regulators', 'terminate'],
  regulatory_notification: ['execute_agreement', 'terminate'],
  executed: ['activate'],
  active: ['request_amendment', 'terminate', 'suspend'],
  amendment_requested: ['approve_amendment', 'terminate'],
  terminated: [],
  suspended: ['activate', 'terminate'],
};

const ISDA_ACTION_LABELS: Record<string, string> = {
  issue_term_sheet: 'Issue term sheet',
  submit_for_counterparty_review: 'Submit for counterparty review',
  open_negotiation: 'Open negotiation',
  agree_credit_terms: 'Agree credit terms',
  submit_for_legal_review: 'Submit for legal review',
  notify_regulators: 'Notify regulators',
  execute_agreement: 'Execute agreement',
  activate: 'Activate',
  request_amendment: 'Request amendment',
  approve_amendment: 'Approve amendment',
  terminate: 'Terminate',
  suspend: 'Suspend',
};

const ISDA_DESTRUCTIVE = new Set(['terminate', 'suspend']);

function isdaStatusTone(s: string): 'good' | 'bad' | 'warn' | 'info' | 'neutral' {
  if (s === 'active') return 'good';
  if (s === 'terminated' || s === 'suspended') return 'bad';
  if (['negotiation', 'legal_review', 'regulatory_notification'].includes(s)) return 'warn';
  if (['executed', 'credit_terms_agreed'].includes(s)) return 'info';
  return 'neutral';
}

function IsdaAgreementTab({ onRefresh }: { onRefresh?: () => void }) {
  const [data, setData] = React.useState<{ agreements: IsdaRow[]; stats: IsdaStats } | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [creating, setCreating] = React.useState(false);
  const [actionTarget, setActionTarget] = React.useState<IsdaRow | null>(null);

  const bump = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  React.useEffect(() => {
    fetch('/api/trader/isda-agreement', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.json())
      .then((j: { data: { agreements: IsdaRow[]; stats: IsdaStats } }) => setData(j.data))
      .catch(() => null);
  }, [refreshKey]);

  if (!data) return <div className="p-6 text-[13px] text-[var(--oe-outline)]">Loading…</div>;

  const { agreements, stats } = data;

  const statCards = [
    { label: 'Total', value: stats.total },
    { label: 'Active', value: stats.active },
    { label: 'Negotiating', value: stats.negotiating },
    { label: 'Terminated', value: stats.terminated },
    { label: 'SLA breached', value: stats.sla_breached },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        {statCards.map(s => (
          <div key={s.label} className="flex-1 min-w-[100px] rounded-xl border border-[var(--oe-surface-container)] bg-[var(--oe-surface-container-lowest)] px-4 py-3">
            <div className="text-[11px] text-[var(--oe-outline)] uppercase tracking-wide">{s.label}</div>
            <div className="text-[22px] font-semibold text-[var(--oe-on-surface)]">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-1.5 rounded-lg bg-[var(--oe-primary)] text-white text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)]"
        >
          + New ISDA agreement
        </button>
      </div>

      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-[var(--oe-surface-container)]">
            {['Counterparty', 'Type', 'Tier', 'VM CSA', 'UMR', 'Status', 'SLA deadline', ''].map(h => (
              <th key={h} className="text-left py-2 px-2 text-[var(--oe-outline)] font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agreements.map(row => {
            const overdue = row.sla_deadline && row.sla_deadline < new Date().toISOString() && !['active', 'executed', 'terminated', 'suspended'].includes(row.chain_status);
            return (
              <tr key={row.id} className="border-b border-[var(--oe-surface-container-low)] hover:bg-[var(--oe-surface-container-lowest)]">
                <td className="py-2 px-2 font-medium text-[var(--oe-on-surface)]">{row.counterparty_name}</td>
                <td className="py-2 px-2 text-[var(--oe-on-surface-variant)]">{row.agreement_type.replace(/_/g, ' ')}</td>
                <td className="py-2 px-2 text-[var(--oe-on-surface-variant)]">{row.counterparty_tier.replace(/_/g, ' ')}</td>
                <td className="py-2 px-2">{row.vm_csa_included ? <Pill tone="info">Yes</Pill> : <span className="text-[var(--oe-outline)]">—</span>}</td>
                <td className="py-2 px-2">{row.umr_applicable ? <Pill tone="warn">Applicable</Pill> : <span className="text-[var(--oe-outline)]">—</span>}</td>
                <td className="py-2 px-2"><Pill tone={isdaStatusTone(row.chain_status)}>{row.chain_status.replace(/_/g, ' ')}</Pill></td>
                <td className="py-2 px-2">
                  {row.sla_deadline
                    ? <span className={overdue ? 'text-red-600 font-medium' : 'text-[var(--oe-on-surface-variant)]'}>{new Date(row.sla_deadline).toLocaleDateString()}</span>
                    : <span className="text-[var(--oe-outline)]">—</span>}
                </td>
                <td className="py-2 px-2">
                  {(ISDA_TRANSITIONS[row.chain_status] ?? []).length > 0 && (
                    <button
                      onClick={() => setActionTarget(row)}
                      className="text-[var(--oe-primary)] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--oe-primary)] rounded"
                    >
                      Action
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {agreements.length === 0 && (
            <tr><td colSpan={8} className="py-8 text-center text-[var(--oe-outline)]">No ISDA agreements</td></tr>
          )}
        </tbody>
      </table>

      {creating && (
        <ActionModal
          title="New ISDA Agreement"
          fields={[
            { key: 'counterparty_id', label: 'Counterparty', type: 'lookup', required: true, lookupEndpoint: '/api/lookup/participants', lookupAutoFill: { counterparty_name: 'name' } },
            { key: 'counterparty_name', label: 'Counterparty name', required: true },
            { key: 'counterparty_type', label: 'Counterparty type', type: 'select', required: true,
              options: ['domestic_bank','foreign_bank','broker_dealer','ccpcentral','corporate','sfp'].map(v => ({ value: v, label: v.replace(/_/g, ' ') })) },
            { key: 'agreement_type', label: 'Agreement type', type: 'select', required: true,
              options: ['isda_2002','isda_1992','isda_2002_with_csa','isda_2002_with_vm_csa'].map(v => ({ value: v, label: v.replace(/_/g, ' ').toUpperCase() })) },
            { key: 'average_notional_zar', label: 'Avg. notional (ZAR)', type: 'number' },
            { key: 'vm_csa_included', label: 'VM CSA included?', type: 'select',
              options: [{ value: '0', label: 'No' }, { value: '1', label: 'Yes' }] },
            { key: 'umr_applicable', label: 'UMR applicable (SARB D3/2023)?', type: 'select',
              options: [{ value: '0', label: 'No' }, { value: '1', label: 'Yes' }] },
          ]}
          submitLabel="Open agreement"
          onClose={() => setCreating(false)}
          onSubmit={async (v) => {
            const res = await fetch('/api/trader/isda-agreement', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                ...v,
                vm_csa_included: Number(v.vm_csa_included ?? 0),
                umr_applicable: Number(v.umr_applicable ?? 0),
                average_notional_zar: v.average_notional_zar ? Number(v.average_notional_zar) : undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setCreating(false); bump();
          }}
        />
      )}

      {actionTarget && (
        <ActionModal
          title={`Action — ${actionTarget.counterparty_name}`}
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true,
              options: (ISDA_TRANSITIONS[actionTarget.chain_status] ?? []).map(a => ({ value: a, label: ISDA_ACTION_LABELS[a] ?? a })) },
            { key: 'reason_code', label: 'Reason code' },
            { key: 'reason_detail', label: 'Reason detail', type: 'textarea' },
          ]}
          submitLabel="Submit"
          cta={ISDA_DESTRUCTIVE.has(actionTarget.chain_status) ? 'danger' : 'primary'}
          onClose={() => setActionTarget(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/trader/isda-agreement/${actionTarget.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify(v),
            });
            if (!res.ok) throw new Error(await res.text());
            setActionTarget(null); bump();
          }}
        />
      )}
    </div>
  );
}
