// pages/src/meridian/surfaces/offtaker/SettlementBillsSurface.tsx
//
// Meridian surface — "Solar settlement invoices" (offtaker / C&I host role). The payer-side
// view of the same /esums/settlement-invoices ledger the esco SettlementInvoicesSurface renders
// from the seller side. For a behind-the-meter C&I host (e.g. Goldrush) these are the monthly
// bills the operator (GoNXT) issues for delivered solar. Columns track the real invoice payload
// (kwh_delivered, tariff, VAT, total); actions are the payer transitions only (acknowledge / pay
// / dispute) — issuing is the seller's action, so it is intentionally absent here.
import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../../../components/SuitePage';

export default function SettlementBillsSurface(_props: { role: string }) {
  const tabs: TabSpec[] = [
    {
      key: 'settlement_bills',
      label: 'Invoices',
      endpoint: '/esums/settlement-invoices',
      description: 'Monthly settlement invoices for delivered solar, one per site per calendar month. Acknowledge, pay, or dispute each bill.',
      columns: [
        { key: 'invoice_number',          label: 'Invoice #' },
        { key: 'station_name',            label: 'Site' },
        { key: 'from_name',               label: 'Supplier' },
        { key: 'period_start',            label: 'Period',     date: true },
        { key: 'kwh_delivered',           label: 'kWh',        align: 'right', number: true },
        { key: 'tariff_rate_zar_per_kwh', label: 'R/kWh',      align: 'right', number: true },
        { key: 'total_zar',               label: 'Total (R)',  align: 'right', currency: true },
        { key: 'status',                  label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'issued_at',               label: 'Issued',     date: true },
        { key: 'paid_at',                 label: 'Paid',       date: true },
      ],
      rowActions: [
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
      eyebrow="Energy · Bills"
      title="Solar settlement invoices"
      subtitle="Monthly bills for the solar your sites consumed, issued by your operator."
      tabs={tabs}
      initialTab="settlement_bills"
      aiBriefAccent={{ from: '#1e3a5f', to: '#336a38' }}
    />
  );
}
