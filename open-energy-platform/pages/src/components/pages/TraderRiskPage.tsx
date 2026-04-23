import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../SuitePage';

export function TraderRiskPage() {
  const tabs: TabSpec[] = [
    {
      key: 'positions',
      label: 'Positions',
      endpoint: '/trader-risk/positions',
      description: 'Net long/short per energy type × delivery day. Rebuild recalculates from fills.',
      columns: [
        { key: 'energy_type', label: 'Energy' },
        { key: 'delivery_date', label: 'Delivery', date: true },
        { key: 'net_volume_mwh', label: 'Net MWh', align: 'right', number: true },
        { key: 'avg_entry_price', label: 'Avg price', align: 'right', currency: true },
        { key: 'unrealised_pnl_zar', label: 'UPL', align: 'right', currency: true },
        { key: 'realised_pnl_zar', label: 'RPL', align: 'right', currency: true },
        { key: 'last_mark_price', label: 'Last mark', align: 'right', currency: true },
      ],
      create: {
        title: 'Rebuild positions from fills',
        endpoint: '/trader-risk/positions/rebuild',
        submitLabel: 'Rebuild',
        fields: [
          { name: 'participant_id', label: 'Participant ID', type: 'text', help: 'Leave blank to rebuild your own positions (admin/regulator/support can target another).' },
        ],
      },
    },
    {
      key: 'marks',
      label: 'Mark prices',
      endpoint: '/trader-risk/mark-prices',
      description: 'EOD mark per energy type × delivery. VWAP runs hourly via cron.',
      columns: [
        { key: 'mark_date', label: 'Date', date: true },
        { key: 'energy_type', label: 'Energy' },
        { key: 'delivery_date', label: 'Delivery', date: true },
        { key: 'mark_price_zar_mwh', label: 'R/MWh', align: 'right', currency: true },
        { key: 'source', label: 'Source' },
      ],
      create: {
        title: 'Post manual mark',
        endpoint: '/trader-risk/mark-prices',
        submitLabel: 'Post mark',
        fields: [
          { name: 'energy_type', label: 'Energy type', type: 'select', required: true, options: [
            { value: 'solar', label: 'Solar' },
            { value: 'wind', label: 'Wind' },
            { value: 'hydro', label: 'Hydro' },
            { value: 'coal', label: 'Coal' },
            { value: 'gas', label: 'Gas' },
            { value: 'nuclear', label: 'Nuclear' },
            { value: 'biomass', label: 'Biomass' },
            { value: 'storage', label: 'Storage' },
          ] },
          { name: 'delivery_date', label: 'Delivery date', type: 'date' },
          { name: 'mark_date', label: 'Mark date', type: 'date', required: true },
          { name: 'mark_price_zar_mwh', label: 'Mark (R/MWh)', type: 'number', required: true },
          { name: 'source', label: 'Source', type: 'select', options: [
            { value: 'operator_post', label: 'Operator post' },
            { value: 'vwap', label: 'VWAP' },
            { value: 'settlement', label: 'Settlement' },
          ], default: 'operator_post' },
        ],
      },
    },
    {
      key: 'credit',
      label: 'Credit check',
      endpoint: '/trader-risk/credit-check',
      params: { notional_zar: '0' },
      description:
        'Pre-trade credit posture: limit, open exposure, headroom. Use the form to test a prospective new order.',
      columns: [
        { key: 'participant_id', label: 'Participant' },
        { key: 'limit_zar', label: 'Limit', align: 'right', currency: true },
        { key: 'open_exposure_zar', label: 'Open exposure', align: 'right', currency: true },
        { key: 'incoming_notional_zar', label: 'Incoming', align: 'right', currency: true },
        { key: 'headroom_zar', label: 'Headroom', align: 'right', currency: true },
        { key: 'utilisation_pct', label: 'Util %', align: 'right', number: true },
        {
          key: 'allowed', label: 'Allowed?',
          render: (r) => <StatusPill status={r.allowed ? 'allowed' : 'blocked'} tone={r.allowed ? 'good' : 'bad'} />,
        },
      ],
    },
    {
      key: 'limits',
      label: 'Credit limits',
      endpoint: '/trader-risk/credit-limits/{participant_id}',   // requires param via create form
      description: 'Approved credit limits per participant. Admin / regulator / support only.',
      columns: [
        { key: 'limit_zar', label: 'Limit', align: 'right', currency: true },
        { key: 'basis', label: 'Basis' },
        { key: 'effective_from', label: 'From', date: true },
        { key: 'effective_to', label: 'To', date: true },
        { key: 'notes', label: 'Notes' },
      ],
      create: {
        title: 'Approve credit limit',
        endpoint: '/trader-risk/credit-limits',
        fields: [
          { name: 'participant_id', label: 'Participant ID', type: 'text', required: true },
          { name: 'limit_zar', label: 'Limit (ZAR)', type: 'number', required: true },
          { name: 'effective_from', label: 'Effective from', type: 'date', required: true },
          { name: 'effective_to', label: 'Effective to', type: 'date' },
          { name: 'basis', label: 'Basis', type: 'select', options: [
            { value: 'cash_collateral', label: 'Cash collateral' },
            { value: 'bank_guarantee', label: 'Bank guarantee' },
            { value: 'sov_bond', label: 'Sovereign bond' },
            { value: 'parental_guarantee', label: 'Parental guarantee' },
            { value: 'unsecured', label: 'Unsecured' },
          ], default: 'unsecured' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    },
    {
      key: 'collateral',
      label: 'Collateral',
      endpoint: '/trader-risk/collateral/accounts',
      description: 'Cash, bank guarantees, sovereign bonds, parental guarantees.',
      columns: [
        { key: 'account_number', label: 'Account' },
        { key: 'account_type', label: 'Type' },
        { key: 'custodian', label: 'Custodian' },
        { key: 'currency', label: 'CCY' },
        { key: 'balance_zar', label: 'Balance', align: 'right', currency: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Open collateral account',
        endpoint: '/trader-risk/collateral/accounts',
        fields: [
          { name: 'participant_id', label: 'Participant ID', type: 'text', required: true },
          { name: 'account_number', label: 'Account #', type: 'text', required: true },
          { name: 'account_type', label: 'Type', type: 'select', required: true, options: [
            { value: 'cash', label: 'Cash' },
            { value: 'bank_guarantee', label: 'Bank guarantee' },
            { value: 'sov_bond', label: 'Sovereign bond' },
            { value: 'parental_guarantee', label: 'Parental guarantee' },
            { value: 'other', label: 'Other' },
          ] },
          { name: 'currency', label: 'Currency', type: 'text', default: 'ZAR' },
          { name: 'custodian', label: 'Custodian', type: 'text' },
          { name: 'balance_zar', label: 'Opening balance (ZAR)', type: 'number' },
        ],
      },
      rowActions: [
        { label: 'Movement', endpoint: '/trader-risk/collateral/accounts/{id}/movement',
          form: { title: 'Record collateral movement', endpoint: '', fields: [
            { name: 'movement_type', label: 'Type', type: 'select', required: true, options: [
              { value: 'top_up', label: 'Top-up' },
              { value: 'margin_call', label: 'Margin call' },
              { value: 'margin_release', label: 'Margin release' },
              { value: 'withdrawal', label: 'Withdrawal' },
              { value: 'settlement_draw', label: 'Settlement draw' },
              { value: 'fee', label: 'Fee' },
              { value: 'adjustment', label: 'Adjustment' },
            ] },
            { name: 'amount_zar', label: 'Amount (ZAR, signed)', type: 'number', required: true, help: 'Positive = in, negative = out.' },
            { name: 'related_entity_type', label: 'Related entity type', type: 'text' },
            { name: 'related_entity_id', label: 'Related entity ID', type: 'text' },
            { name: 'description', label: 'Description', type: 'textarea' },
          ] },
        },
      ],
    },
    {
      key: 'margins',
      label: 'Margin calls',
      endpoint: '/trader-risk/margin-calls',
      description: 'Issued when posted collateral falls below initial margin on current exposure.',
      columns: [
        { key: 'as_of', label: 'As of', date: true },
        { key: 'exposure_zar', label: 'Exposure', align: 'right', currency: true },
        { key: 'initial_margin_zar', label: 'IM', align: 'right', currency: true },
        { key: 'posted_collateral_zar', label: 'Posted', align: 'right', currency: true },
        { key: 'shortfall_zar', label: 'Shortfall', align: 'right', currency: true },
        { key: 'due_by', label: 'Due by', date: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Run margin-call cycle',
        endpoint: '/trader-risk/margin-calls/run',
        submitLabel: 'Run',
        fields: [
          { name: 'due_by', label: 'Due by', type: 'datetime' },
        ],
      },
    },
    {
      key: 'clearing',
      label: 'Clearing runs',
      endpoint: '/trader-risk/clearing/runs',
      description: 'Multi-lateral netting per trading day.',
      columns: [
        { key: 'trading_day', label: 'Day', date: true },
        { key: 'total_gross_zar', label: 'Gross', align: 'right', currency: true },
        { key: 'total_net_zar', label: 'Net', align: 'right', currency: true },
        { key: 'netting_ratio', label: 'Ratio', align: 'right', number: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Run clearing cycle',
        endpoint: '/trader-risk/clearing/run',
        submitLabel: 'Run clearing',
        fields: [
          { name: 'trading_day', label: 'Trading day', type: 'date' },
        ],
      },
    },
  ];
  return (
    <SuitePage
      title="Trader risk console"
      subtitle="Positions, marks, credit, collateral, margin and clearing — Financial Markets Act 19/2012 aligned."
      tabs={tabs}
    />
  );
}
