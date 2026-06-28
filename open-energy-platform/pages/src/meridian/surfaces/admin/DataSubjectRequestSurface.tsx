// pages/src/meridian/surfaces/admin/DataSubjectRequestSurface.tsx
//
// Meridian surface — "POPIA data subject requests (W233)" (admin role). Extracted verbatim from
// the inline `DataSubjectRequestTab` body of the AdminWorkstationPage husk (E2.1). Self-
// contained: lists POPIA data-subject requests and drives the W233 chain (acknowledge → verify
// identity → map data → legal assessment → draft response → fulfill / refuse / erase / uphold).
// Actions are limited to those valid from each row's current state (DSR_TRANSITIONS). Reads/writes
// against /api/admin/dsr. The husk's optional `onRefresh` is dropped; refresh is local via the
// `refreshKey` bump. Registered as `admin:popia` in surfaces.tsx, reached from Atlas (⌘K) via the
// roleData feature key `popia`. Non-chain operational surface (Bucket E).
import React from 'react';
import { Pill, ActionModal } from '../../../components/launch/WorkstationShell';
import { statusLabel } from '../../ease/statusLabel';

type DsrRow = {
  id: string;
  requester_name: string;
  requester_email: string;
  request_type: string;
  chain_status: string;
  sla_days: number;
  sla_deadline: string | null;
  ir_notified: number;
  response_ref: string | null;
  created_at: string;
};

type DsrStats = {
  total: number;
  open: number;
  fulfilled: number;
  refused: number;
  overdue: number;
};

const DSR_TRANSITIONS: Record<string, string[]> = {
  received: ['acknowledge', 'withdraw'],
  acknowledged: ['verify_identity', 'withdraw'],
  identity_verified: ['map_data', 'withdraw'],
  data_mapped: ['commence_legal_assessment'],
  legal_assessment: ['draft_response'],
  response_drafted: ['fulfill', 'partially_disclose', 'refuse', 'complete_erasure', 'uphold_objection'],
  fulfilled: [],
  partial_disclosure: [],
  refused: [],
  erasure_completed: [],
  objection_upheld: [],
  withdrawn: [],
};

const DSR_ACTION_LABELS: Record<string, string> = {
  acknowledge: 'Acknowledge receipt',
  verify_identity: 'Verify identity',
  map_data: 'Map data holdings',
  commence_legal_assessment: 'Commence legal assessment',
  draft_response: 'Draft response',
  fulfill: 'Fulfill — provide data',
  partially_disclose: 'Partially disclose',
  refuse: 'Refuse (with grounds)',
  complete_erasure: 'Complete erasure',
  uphold_objection: 'Uphold objection',
  withdraw: 'Withdraw',
};

const DSR_DESTRUCTIVE = new Set(['refuse', 'withdraw', 'partially_disclose']);

function dsrStatusTone(s: string): 'good' | 'bad' | 'warn' | 'info' | 'neutral' {
  if (s === 'fulfilled' || s === 'erasure_completed' || s === 'objection_upheld') return 'good';
  if (s === 'refused') return 'bad';
  if (s === 'partial_disclosure') return 'warn';
  if (s === 'withdrawn') return 'neutral';
  return 'info';
}

export default function DataSubjectRequestSurface(_props: { role: string }) {
  const [data, setData] = React.useState<{ requests: DsrRow[]; stats: DsrStats } | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [creating, setCreating] = React.useState(false);
  const [actionTarget, setActionTarget] = React.useState<DsrRow | null>(null);

  const bump = () => { setRefreshKey(k => k + 1); };

  React.useEffect(() => {
    fetch('/api/admin/dsr', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.json())
      .then((j: { data: { requests: DsrRow[]; stats: DsrStats } }) => setData(j.data))
      .catch(() => null);
  }, [refreshKey]);

  if (!data) return <div className="p-6 text-[13px] text-[var(--oe-outline)]">Loading…</div>;

  const { requests, stats } = data;

  const statCards = [
    { label: 'Total', value: stats.total },
    { label: 'Open', value: stats.open },
    { label: 'Fulfilled', value: stats.fulfilled },
    { label: 'Refused', value: stats.refused },
    { label: 'Overdue', value: stats.overdue },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        {statCards.map(s => (
          <div key={s.label} className="flex-1 min-w-[100px] rounded-lg border border-[var(--oe-surface-container)] bg-[var(--oe-surface-container-lowest)] px-4 py-3">
            <div className="text-[11px] text-[var(--oe-outline)] uppercase tracking-wide">{s.label}</div>
            <div className={`text-[22px] font-semibold ${s.label === 'Overdue' && s.value > 0 ? 'text-[var(--oxide-deep)]' : 'text-[var(--oe-on-surface)]'}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-1.5 rounded-lg bg-[var(--oe-primary)] text-white text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)]"
        >
          + Log DSR
        </button>
      </div>

      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-[var(--oe-surface-container)]">
            {['Ref', 'Requester', 'Type', 'Status', 'SLA deadline', 'IR notified', ''].map(h => (
              <th key={h} className="text-left py-2 px-2 text-[var(--oe-outline)] font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {requests.map(row => {
            const overdue = row.sla_deadline && row.sla_deadline < new Date().toISOString() && !['fulfilled','partial_disclosure','refused','erasure_completed','objection_upheld','withdrawn'].includes(row.chain_status);
            return (
              <tr key={row.id} className="border-b border-[var(--oe-surface-container-low)] hover:bg-[var(--oe-surface-container-lowest)]">
                <td className="py-2 px-2 font-mono text-[10px] text-[var(--oe-outline)]">{row.response_ref ?? row.id.slice(0, 8)}</td>
                <td className="py-2 px-2 text-[var(--oe-on-surface)]">
                  <div className="font-medium">{row.requester_name}</div>
                  <div className="text-[var(--oe-outline)] text-[10px]">{row.requester_email}</div>
                </td>
                <td className="py-2 px-2"><Pill tone="info">{row.request_type}</Pill></td>
                <td className="py-2 px-2"><Pill tone={dsrStatusTone(row.chain_status)}>{statusLabel(row.chain_status).text}</Pill></td>
                <td className="py-2 px-2">
                  {row.sla_deadline
                    ? <span className={overdue ? 'text-[var(--oxide-deep)] font-medium' : 'text-[var(--oe-on-surface-variant)]'}>{new Date(row.sla_deadline).toLocaleDateString()}</span>
                    : <span className="text-[var(--oe-outline)]">—</span>}
                </td>
                <td className="py-2 px-2">{row.ir_notified ? <Pill tone="warn">Yes</Pill> : <span className="text-[var(--oe-outline)]">—</span>}</td>
                <td className="py-2 px-2">
                  {(DSR_TRANSITIONS[row.chain_status] ?? []).length > 0 && (
                    <button
                      onClick={() => setActionTarget(row)}
                      className="text-[var(--oe-primary)] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--oe-primary)] rounded-md"
                    >
                      Action
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {requests.length === 0 && (
            <tr><td colSpan={7} className="py-8 text-center text-[var(--oe-outline)]">No data subject requests</td></tr>
          )}
        </tbody>
      </table>

      {creating && (
        <ActionModal
          title="Log Data Subject Request (POPIA)"
          fields={[
            { key: 'requester_name', label: 'Requester name', required: true },
            { key: 'requester_email', label: 'Requester email', required: true },
            { key: 'requester_id_number', label: 'SA ID / passport number' },
            { key: 'relationship', label: 'Relationship to data', type: 'select', required: true,
              options: [{ value: 'data_subject', label: 'Data subject' }, { value: 'authorised_representative', label: 'Authorised representative' }, { value: 'guardian', label: 'Guardian' }] },
            { key: 'request_type', label: 'Request type', type: 'select', required: true,
              options: ['access','correction','deletion','objection','portability','restriction'].map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) })) },
            { key: 'data_categories', label: 'Data categories (comma-separated)' },
          ]}
          submitLabel="Log request"
          onClose={() => setCreating(false)}
          onSubmit={async (v) => {
            const cats = (v.data_categories as string)?.split(',').map((s: string) => s.trim()).filter(Boolean);
            const res = await fetch('/api/admin/dsr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({ ...v, data_categories: cats?.length ? cats : undefined }),
            });
            if (!res.ok) throw new Error(await res.text());
            setCreating(false); bump();
          }}
        />
      )}

      {actionTarget && (
        <ActionModal
          title={`Action — ${actionTarget.requester_name} (${actionTarget.request_type})`}
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true,
              options: (DSR_TRANSITIONS[actionTarget.chain_status] ?? []).map(a => ({ value: a, label: DSR_ACTION_LABELS[a] ?? a })) },
            { key: 'legal_ground_for_refusal', label: 'Legal ground for refusal (POPIA §11)' },
            { key: 'reason_detail', label: 'Notes', type: 'textarea' },
          ]}
          submitLabel="Submit"
          cta={DSR_DESTRUCTIVE.has(actionTarget.chain_status) ? 'danger' : 'primary'}
          onClose={() => setActionTarget(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/admin/dsr/${actionTarget.id}/action`, {
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
