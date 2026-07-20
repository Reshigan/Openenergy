// pages/src/meridian/surfaces/offtaker/BillingSurface.tsx
//
// Meridian surface — "Invoices & billing" (offtaker role). The settlement-invoice register
// (GET /api/invoices) with the three lifecycle transitions wired as per-row actions: issue a
// draft (POST /api/invoices/:id/issue, no body), record payment (POST /api/invoices/:id/pay
// {paid_amount,payment_reference}) and raise a dispute (POST /api/invoices/:id/dispute {reason}).
// Distinct from `offtaker:bills` (the AI utility-bill analyser). Bucket B / L4 — state machine
// transitions with audit on the server. Registered as `offtaker:billing`, reached from Atlas via
// the roleData feature key `billing`.
import React, { useState } from 'react';
import { ListingTable, ActionModal, Pill, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

function statusTone(s: string): 'good' | 'warn' | 'bad' | 'neutral' | 'info' {
  if (s === 'paid') return 'good';
  if (s === 'disputed') return 'bad';
  if (s === 'issued') return 'warn';
  if (s === 'draft') return 'neutral';
  return 'info';
}

const zar = (v: any, ccy = 'ZAR') =>
  v == null ? '—' : `${ccy === 'ZAR' ? 'R' : ccy + ' '}${Number(v).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}`;

export default function BillingSurface(_props: { role: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [sel, setSel] = useState<{ id: string; action: 'pay' | 'dispute' } | null>(null);
  const refresh = () => setRefreshKey((k) => k + 1);

  const issue = async (id: string) => {
    setBusy(id);
    try { await api.post(`/invoices/${id}/issue`); refresh(); } finally { setBusy(null); }
  };

  return (
    <div>
      <ListingTable
        key={refreshKey}
        endpoint="/invoices"
        rowKey={(r) => r.id}
        empty={{ title: 'No invoices', description: 'Settlement and platform invoices will appear here once raised.' }}
        columns={[
          { key: 'invoice_number', label: 'Invoice', render: (r) => <span className="font-mono text-[11px]">{r.invoice_number}</span> },
          { key: 'invoice_type', label: 'Type' },
          { key: 'to_name', label: 'Counterparty', render: (r) => r.to_name || r.from_name || '—' },
          { key: 'total_amount', label: 'Total', align: 'right', render: (r) => zar(r.total_amount, r.currency) },
          { key: 'due_date', label: 'Due', render: (r) => (r.due_date ? new Date(r.due_date).toLocaleDateString() : '—') },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={statusTone(r.status)}>{r.status}</Pill> },
          {
            key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex gap-1 justify-end">
                {r.status === 'draft' && (
                  <button type="button" disabled={busy === r.id} onClick={() => issue(r.id)}
                    className="btn pri">
                    {busy === r.id ? '…' : 'Issue'}
                  </button>
                )}
                {r.status === 'issued' && (
                  <>
                    <button type="button" onClick={() => setSel({ id: r.id, action: 'pay' })}
                      className="btn pri">Pay</button>
                    <button type="button" onClick={() => setSel({ id: r.id, action: 'dispute' })}
                      className="btn ox">Dispute</button>
                  </>
                )}
              </div>
            ),
          },
        ]}
      />

      {sel?.action === 'pay' && (
        <ActionModal
          title="Record payment"
          submitLabel="Record payment"
          cta="primary"
          fields={[
            { key: 'paid_amount', label: 'Amount paid (ZAR)', type: 'number' },
            { key: 'payment_reference', label: 'Payment reference', placeholder: 'EFT / proof-of-payment ref' },
          ] as FieldSpec[]}
          onClose={() => setSel(null)}
          onSubmit={async (v) => { await api.post(`/invoices/${sel.id}/pay`, v); setSel(null); refresh(); }}
        />
      )}
      {sel?.action === 'dispute' && (
        <ActionModal
          title="Dispute invoice"
          submitLabel="Raise dispute"
          cta="danger"
          fields={[
            { key: 'reason', label: 'Reason', type: 'textarea', required: true, placeholder: 'Grounds for dispute' },
          ] as FieldSpec[]}
          onClose={() => setSel(null)}
          onSubmit={async (v) => { await api.post(`/invoices/${sel.id}/dispute`, v); setSel(null); refresh(); }}
        />
      )}
    </div>
  );
}
