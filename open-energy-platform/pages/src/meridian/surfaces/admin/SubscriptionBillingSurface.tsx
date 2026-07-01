// pages/src/meridian/surfaces/admin/SubscriptionBillingSurface.tsx
//
// Meridian surface — "Subscription billing (W228)" (admin role). Extracted verbatim from the
// inline `SubscriptionBillingTab` body of the AdminWorkstationPage husk (E2.1). Self-contained:
// platform SaaS-invoice oversight. Monthly invoices run as a W228 chain with a cron dunning
// ladder; admin exits are waive / write off / cancel / reactivate. Actions are limited to those
// valid from each row's current state (SUB_TRANSITIONS mirrors INVOICE_VALID_TRANSITIONS in
// src/utils/subscription-billing-spec.ts — kept in sync with W228). Registered as
// `admin:subscription_billing` in surfaces.tsx, reached from Atlas (⌘K) via the roleData feature
// key `subscription_billing` (added in E2.1 — the husk tab had no roleData feature). Non-chain
// operational surface (Bucket D).
import React, { useState } from 'react';
import { Pill, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';
import { statusLabel } from '../../ease/statusLabel';

type SubInvoice = {
  id: string;
  participant_id: string;
  billing_period: string;
  subscription_tier: 'starter' | 'professional' | 'enterprise';
  net_payable_zar: number;
  chain_status: string;
  hours_until_sla: number | null;
  sla_breached: boolean | number;
  is_terminal: boolean;
  created_at: string;
};
type SubStats = {
  total: number;
  paid: number;
  overdue: number;
  suspended: number;
  arr_at_risk: number;
};

// Mirror of INVOICE_VALID_TRANSITIONS in src/utils/subscription-billing-spec.ts.
// Kept inline so the SPA does not import backend spec; keep in sync with W228.
const SUB_TRANSITIONS: Record<string, string[]> = {
  draft:           ['issue', 'cancel'],
  issued:          ['acknowledge', 'cancel'],
  payment_pending: ['record_payment', 'mark_overdue', 'waive', 'cancel'],
  paid:            [],
  overdue:         ['record_payment', 'send_dunning_1', 'waive', 'write_off'],
  dunning_1:       ['record_payment', 'send_dunning_2', 'waive', 'write_off'],
  dunning_2:       ['record_payment', 'suspend_account', 'waive', 'write_off'],
  suspended:       ['reactivate', 'write_off'],
  cancelled:       [],
  waived:          [],
  written_off:     [],
};
const SUB_ACTION_LABELS: Record<string, string> = {
  issue: 'Issue',
  acknowledge: 'Acknowledge',
  record_payment: 'Record payment',
  mark_overdue: 'Mark overdue',
  send_dunning_1: 'Send dunning 1',
  send_dunning_2: 'Send dunning 2',
  suspend_account: 'Suspend',
  reactivate: 'Reactivate',
  waive: 'Waive',
  write_off: 'Write off',
  cancel: 'Cancel',
};

function zar(n: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n || 0);
}
function subStatusTone(status: string): 'good' | 'bad' | 'info' | 'neutral' {
  if (status === 'paid') return 'good';
  if (['suspended', 'written_off', 'overdue', 'dunning_1', 'dunning_2'].includes(status)) return 'bad';
  if (['cancelled', 'waived'].includes(status)) return 'neutral';
  return 'info';
}

export default function SubscriptionBillingSurface(_props: { role: string }) {
  const [rows, setRows] = useState<SubInvoice[]>([]);
  const [stats, setStats] = useState<SubStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);

  const load = React.useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get('/subscription/billing?per_page=200');
      setRows((res.data?.data?.invoices as SubInvoice[]) || []);
      setStats((res.data?.data?.stats as SubStats) || null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const act = React.useCallback(async (id: string, action: string) => {
    setBusy(id);
    setRowErr((m) => { const n = { ...m }; delete n[id]; return n; });
    try {
      await api.post(`/subscription/billing/${id}/action`, { action });
      await load();
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.error || (e instanceof Error ? e.message : 'action failed');
      setRowErr((m) => ({ ...m, [id]: msg }));
    } finally {
      setBusy(null);
    }
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[12px] leading-relaxed text-[var(--ink2)] max-w-2xl">
          Monthly SaaS invoices run as a billing chain: draft to issued to payment_pending to paid,
          with a cron dunning ladder (overdue, dunning_1, dunning_2, suspended). Admin exits are
          waive, write off, cancel and reactivate. Actions below are limited to those valid from
          each row's current state.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button"
            onClick={() => setGenerating(true)}
            className="btn pri"
          >
            Generate invoice
          </button>
          <button type="button"
            onClick={() => void load()}
            className="btn ghost"
          >
            Refresh
          </button>
        </div>
      </div>

      {stats && (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[12px] text-[var(--ink2)]">
          <span><span className="text-[var(--ink3)]">Total</span> <span className="tabular-nums font-medium text-[var(--ink)]">{stats.total}</span></span>
          <span><span className="text-[var(--ink3)]">Overdue</span> <span className="tabular-nums font-medium text-[var(--oxide-deep)]">{stats.overdue}</span></span>
          <span><span className="text-[var(--ink3)]">Suspended</span> <span className="tabular-nums font-medium text-[var(--oxide-deep)]">{stats.suspended}</span></span>
          <span><span className="text-[var(--ink3)]">ARR at risk</span> <span className="tabular-nums font-medium text-[var(--ink)]">{zar(stats.arr_at_risk)}</span></span>
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-[var(--line)] bg-white p-6 text-[12px] text-[var(--ink3)]">Loading invoices…</div>
      ) : err ? (
        <div className="rounded-lg border border-[var(--oxide)] bg-[var(--oxide-tint)] p-4 text-[12px] text-[var(--oxide-deep)]">{err}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--raised)] p-6 text-center">
          <div className="text-[13px] font-semibold text-[var(--ink)]">No invoices yet</div>
          <div className="text-[12px] text-[var(--ink3)] mt-1">Generate a monthly subscription invoice to start the billing chain.</div>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--line)] bg-white overflow-x-auto text-[var(--ink)]">
          <table className="w-full text-[13px] min-w-[860px]">
            <thead className="bg-[var(--raised)] text-left text-[10px] uppercase tracking-wide text-[var(--ink3)]">
              <tr>
                <th className="px-4 py-2">Participant</th>
                <th className="px-4 py-2">Period</th>
                <th className="px-4 py-2">Tier</th>
                <th className="px-4 py-2 text-right">Net payable</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">SLA</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rowBusy = busy === r.id;
                const breached = r.sla_breached === true || r.sla_breached === 1;
                const actions = SUB_TRANSITIONS[r.chain_status] ?? [];
                return (
                  <React.Fragment key={r.id}>
                    <tr className="border-t border-[var(--line)] align-top">
                      <td className="px-4 py-2 font-mono text-[11px]" title={r.participant_id}>{(r.participant_id || '').slice(0, 14)}</td>
                      <td className="px-4 py-2 text-[12px] tabular-nums">{r.billing_period}</td>
                      <td className="px-4 py-2"><Pill tone="info">{r.subscription_tier}</Pill></td>
                      <td className="px-4 py-2 text-right tabular-nums text-[12px]">{zar(r.net_payable_zar)}</td>
                      <td className="px-4 py-2"><Pill tone={subStatusTone(r.chain_status)}>{statusLabel(r.chain_status).text}</Pill></td>
                      <td className="px-4 py-2 text-[11px] whitespace-nowrap">
                        {breached ? (
                          <span className="text-[var(--oxide-deep)] font-medium">Breached</span>
                        ) : r.hours_until_sla != null ? (
                          <span className={r.hours_until_sla < 24 ? 'text-[var(--oxide-deep)]' : 'text-[var(--ink3)]'}>{r.hours_until_sla}h left</span>
                        ) : (
                          <span className="text-[var(--ink3)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-[11px] text-[var(--ink3)] whitespace-nowrap">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 whitespace-nowrap">
                          {actions.length === 0 ? (
                            <span className="text-[11px] text-[var(--ink3)]">Terminal</span>
                          ) : (
                            actions.map((a) => (
                              <button type="button"
                                key={a}
                                onClick={() => void act(r.id, a)}
                                disabled={rowBusy}
                                className={`text-[11px] font-medium hover:underline disabled:opacity-40 ${a === 'write_off' || a === 'suspend_account' || a === 'cancel' ? 'text-[var(--oxide-deep)]' : 'text-[var(--petrol)]'}`}
                              >
                                {SUB_ACTION_LABELS[a] ?? a}
                              </button>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                    {rowErr[r.id] && (
                      <tr className="border-t border-[var(--line)] bg-[var(--oxide-tint)]">
                        <td colSpan={8} className="px-4 py-2 text-[11px] text-[var(--oxide-deep)]">{rowErr[r.id]}</td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {generating && (
        <ActionModal
          title="Generate subscription invoice"
          submitLabel="Generate"
          fields={[
            { key: 'participant_id', label: 'Participant', required: true, type: 'lookup', lookupEndpoint: '/api/lookup/participants', lookupAutoFill: { name: 'participant_name', email: 'participant_email' } },
            { key: 'billing_period', label: 'Billing period (YYYY-MM)', required: true },
            { key: 'subscription_tier', label: 'Tier', type: 'select', required: true, options: [
              { value: 'starter', label: 'Starter' },
              { value: 'professional', label: 'Professional' },
              { value: 'enterprise', label: 'Enterprise' },
            ] },
          ] as FieldSpec[]}
          onClose={() => setGenerating(false)}
          onSubmit={async (v) => {
            try {
              await api.post('/subscription/billing/generate', v);
            } catch (e: unknown) {
              // Surface the server's reason (e.g. 409 "Invoice already exists
              // for 2026-06") instead of the generic axios status message.
              throw new Error((e as any)?.response?.data?.error || 'Failed to generate invoice');
            }
            setGenerating(false);
            await load();
          }}
        />
      )}
    </div>
  );
}
