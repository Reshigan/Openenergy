// pages/src/meridian/surfaces/esumsom/AccrualsSurface.tsx
//
// Meridian surface — "Accruals" (esco / esums_owner O&M role). Extracted verbatim from the
// `accruals` tab body of the retired EsumsOmPage SuitePage husk (E2.2). Self-contained: it
// renders a single-tab SuitePage so the inline SuiteTable behaviour (columns, currency/date
// formatting, StatusPill) is preserved identically. Registered as `esco:accruals` in
// surfaces.tsx and reached from Atlas (⌘K) via the roleData feature key `accruals`.
import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../../../components/SuitePage';
import { accrualsViz } from './viz';

export default function AccrualsSurface(_props: { role: string }) {
  const tabs: TabSpec[] = [
    {
      key: 'accruals',
      label: 'Accruals',
      endpoint: '/esums/accruals/rows',
      description: 'Real-time generation accrual ledger from Solax inverter data. Every row is a metered kWh-period with the corresponding revenue, carbon offset and savings value. This is the source-of-truth for settlement invoices and carbon credit minting — no synthetic or estimated data.',
      viz: accrualsViz,
      columns: [
        { key: 'station_name', label: 'Station' },
        { key: 'period_hour',  label: 'Period',  date: true },
        { key: 'kwh_delta',    label: 'kWh',     align: 'right', number: true },
        { key: 'revenue_zar',  label: 'Revenue', align: 'right', currency: true },
        { key: 'savings_zar',  label: 'Savings', align: 'right', currency: true },
        { key: 'carbon_tco2e', label: 'tCO₂e',  align: 'right', number: true },
        { key: 'tariff_rate_used', label: 'Grid tariff', align: 'right', number: true },
        { key: 'is_backfill',  label: 'Backfill', render: (r) => <StatusPill status={r.is_backfill ? 'yes' : 'live'} /> },
      ],
    },
  ];
  return (
    <SuitePage
      eyebrow="O&M · Operations"
      title="Accruals"
      subtitle="Real-time generation accrual ledger."
      tabs={tabs}
      initialTab="accruals"
      aiBriefAccent={{ from: '#1e3a5f', to: '#336a38' }}
    />
  );
}
