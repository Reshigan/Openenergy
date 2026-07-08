// pages/src/meridian/surfaces/esumsom/SettlementInvoicesSurface.tsx
//
// Meridian surface — "Invoices" (esco / esums_owner O&M role). Extracted verbatim from the
// `settlement_invoices` tab body of the retired EsumsOmPage SuitePage husk (E2.2). Self-contained:
// it renders a single-tab SuitePage so the inline SuiteTable behaviour (columns, currency/date
// formatting, StatusPill, rowActions) is preserved identically. Registered as `esco:settlement-invoices`
// in surfaces.tsx and reached from Atlas (⌘K) via the roleData feature key `settlement_invoices`.
import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../../../components/SuitePage';
import { settlementInvoicesViz } from './viz';

export default function SettlementInvoicesSurface(_props: { role: string }) {
  const tabs: TabSpec[] = [
    {
      key: 'settlement_invoices',
      label: 'Invoices',
      endpoint: '/esums/settlement-invoices',
      description: 'Monthly settlement invoices derived from the accruals ledger. Each invoice covers one station for one calendar month. Actions: issue → acknowledge → pay / dispute / void.',
      viz: settlementInvoicesViz,
      columns: [
        { key: 'invoice_number', label: 'Invoice #' },
        { key: 'station_name',   label: 'Station' },
        { key: 'period_start',   label: 'Period',    date: true },
        { key: 'kwh_generated',  label: 'kWh',       align: 'right', number: true },
        { key: 'total_zar',      label: 'Total (R)',  align: 'right', currency: true },
        { key: 'savings_zar',    label: 'Savings (R)',align: 'right', currency: true },
        { key: 'status',         label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'issued_at',      label: 'Issued',    date: true },
        { key: 'paid_at',        label: 'Paid',      date: true },
      ],
      rowActions: [
        { label: 'Issue', tone: 'primary', endpoint: '/esums/settlement-invoices/{id}', method: 'PATCH',
          form: { title: 'Issue invoice', endpoint: '', extraBody: { action: 'issue' }, fields: [
            { name: 'notes', type: 'textarea', label: 'Notes', required: false },
          ] as any}},
        { label: 'Acknowledge', tone: 'default', endpoint: '/esums/settlement-invoices/{id}', method: 'PATCH',
          form: { title: 'Acknowledge invoice', endpoint: '', extraBody: { action: 'acknowledge' }, fields: [] as any }},
        { label: 'Mark paid', tone: 'primary', endpoint: '/esums/settlement-invoices/{id}', method: 'PATCH',
          form: { title: 'Mark invoice paid', endpoint: '', extraBody: { action: 'pay' }, fields: [
            { name: 'payment_ref', type: 'text', label: 'Payment reference', required: true },
          ] as any}},
        { label: 'Dispute', tone: 'danger', endpoint: '/esums/settlement-invoices/{id}', method: 'PATCH',
          form: { title: 'Dispute invoice', endpoint: '', extraBody: { action: 'dispute' }, fields: [
            { name: 'notes', type: 'textarea', label: 'Dispute reason', required: true },
          ] as any}},
      ],
    },
  ];
  return (
    <SuitePage
      eyebrow="O&M · Operations"
      title="Invoices"
      subtitle="Monthly settlement invoices derived from the accruals ledger."
      tabs={tabs}
      initialTab="settlement_invoices"
      aiBriefAccent={{ from: '#1e3a5f', to: '#336a38' }}
    />
  );
}
