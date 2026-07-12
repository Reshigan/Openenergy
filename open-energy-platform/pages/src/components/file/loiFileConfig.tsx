// ════════════════════════════════════════════════════════════════════════
// loiFileConfig — tab map + hero for the Letter-of-Intent file.
//
// Consumed by LoiDetail.tsx. Mirrors the project / contract / RFP files.
// Aggregator shape (src/routes/lois.ts → /:id/file):
//   { loi, mix, project, counterparty, contract, lifecycle, audit,
//     summary, ai_suggestions }
// ════════════════════════════════════════════════════════════════════════

import React from 'react';
import { OEIcon } from '../OEIcon';
import {
  FileSection,
  FileTable,
  StatusCell,
  fmtDate,
  fmtZAR,
  fmtNum,
} from './FileTable';
import type { EntityFileHero, EntityFileTab, EntityFileSummary } from './EntityFileShell';

// ── Shape of /lois/:id/file response ──────────────────────────────────────
export interface LoiFileData {
  loi: {
    id: string;
    from_participant_id: string;
    to_participant_id: string | null;
    project_id: string | null;
    mix_json: string | null;
    body_md: string | null;
    status: string;
    horizon_years: number | null;
    annual_mwh: number | null;
    blended_price: number | null;
    notes: string | null;
    decline_reason: string | null;
    resulting_contract_document_id: string | null;
    sent_at: string | null;
    resolved_at: string | null;
    resolved_by: string | null;
    created_at: string;
    updated_at: string | null;
    from_name?: string | null;
    to_name?: string | null;
    project_name?: string | null;
    project_technology?: string | null;
    project_capacity_mw?: number | null;
  };
  mix: Record<string, number>;
  project: any | null;
  counterparty: {
    from: { id: string; name?: string | null; email?: string | null; role?: string | null };
    to: { id: string | null; name?: string | null; email?: string | null; role?: string | null };
    kyc: any[];
    risk_scores: any[];
  };
  contract: { record: any; signatories: any[] } | null;
  lifecycle: { action_queue: any[]; notifications: any[] };
  audit: { events: any[]; logs: any[] };
  summary: EntityFileSummary;
  ai_suggestions: any[];
}

// ── Hero ──────────────────────────────────────────────────────────────────
export function loiHero(data: LoiFileData): EntityFileHero {
  const l = data.loi;
  const s = data.summary;
  const statusLabel: Record<string, string> = {
    drafted: 'Drafted',
    sent: 'Sent — awaiting response',
    signed: 'Signed',
    withdrawn: 'Withdrawn',
    expired: 'Expired',
  };
  const days = s.days_outstanding != null ? Number(s.days_outstanding) : null;
  const tone: 'good' | 'warn' | 'bad' | undefined =
    l.status === 'signed' ? 'good'
      : l.status === 'withdrawn' || l.status === 'expired' ? 'bad'
      : days != null && days > 14 ? 'warn'
      : days != null ? 'good'
      : undefined;
  return {
    eyebrowIcon: ({ size }) => <OEIcon name="loi" size={size || 12} />,
    eyebrowLabel: `Letter of Intent · ${statusLabel[l.status] || l.status}`,
    title: `LOI ${l.id} · ${l.project_name || 'No project'}`,
    subtitle: `${l.from_name || l.from_participant_id} → ${l.to_name || l.to_participant_id || 'Unassigned'}`,
    accentFrom: '#3a1f5d',
    accentTo: '#1a0d2b',
    kpis: [
      {
        key: 'value',
        label: 'Total contract value',
        value: fmtZAR(Number(s.total_contract_value_zar || 0)),
      },
      {
        key: 'volume',
        label: 'Annual volume',
        value: l.annual_mwh ? `${fmtNum(l.annual_mwh, 0)} MWh` : '—',
      },
      {
        key: 'price',
        label: 'Blended price',
        value: l.blended_price ? `R${fmtNum(l.blended_price, 0)}/MWh` : '—',
      },
      {
        key: 'horizon',
        label: 'Horizon',
        value: l.horizon_years ? `${l.horizon_years} yrs` : '—',
        tone,
      },
    ],
  };
}

// ── Tabs ──────────────────────────────────────────────────────────────────
export const loiFileTabs: EntityFileTab<LoiFileData>[] = [
  // ── Overview ────────────────────────────────────────────────────────────
  {
    id: 'overview',
    label: 'Overview',
    icon: ({ size }) => <OEIcon name="dashboard" size={size} />,
    render: (data) => {
      const l = data.loi;
      const s = data.summary;
      return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <FileSection title="LOI facts">
            <div className="p-5">
              <dl className="text-[13px] space-y-2">
                <Row label="LOI id" value={<span className="font-mono">{l.id}</span>} />
                <Row label="Status" value={<StatusCell value={l.status} />} />
                <Row label="Sent" value={fmtDate(l.sent_at)} />
                <Row label="Resolved" value={fmtDate(l.resolved_at)} />
                <Row label="Created" value={fmtDate(l.created_at)} />
                <Row label="Project" value={l.project_name || '—'} />
                <Row label="Direction" value={String(s.direction || '—')} />
              </dl>
            </div>
          </FileSection>

          <div className="lg:col-span-2 space-y-4">
            <FileSection title="Commercial snapshot">
              <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                <MicroKpi label="Annual MWh" value={l.annual_mwh ? fmtNum(l.annual_mwh, 0) : '—'} />
                <MicroKpi label="Blended R/MWh" value={l.blended_price ? `R${fmtNum(l.blended_price, 0)}` : '—'} />
                <MicroKpi label="Horizon (yrs)" value={l.horizon_years || '—'} />
                <MicroKpi label="Total value" value={fmtZAR(Number(s.total_contract_value_zar || 0))} tone="good" />
                <MicroKpi
                  label="Days outstanding"
                  value={s.days_outstanding != null ? `${s.days_outstanding}d` : '—'}
                  tone={s.days_outstanding != null && Number(s.days_outstanding) > 14 ? 'warn' : undefined}
                />
                <MicroKpi
                  label="Resolved in"
                  value={s.days_to_resolve != null ? `${s.days_to_resolve}d` : '—'}
                  tone={s.days_to_resolve != null ? 'good' : undefined}
                />
                <MicroKpi label="Audit events" value={Number(s.audit_events || 0)} />
                <MicroKpi
                  label="Contract"
                  value={s.resulting_contract_id ? 'Linked' : 'None'}
                  tone={s.resulting_contract_id ? 'good' : undefined}
                />
              </div>
            </FileSection>

            <FileSection title="LOI body" subtitle="As drafted and sent to the counterparty.">
              <pre className="px-5 py-4 text-[12.5px] text-[var(--ink, #0f1c2e)] whitespace-pre-wrap leading-relaxed font-sans">
                {l.body_md || 'No body provided.'}
              </pre>
              {l.notes && (
                <div className="px-5 pb-4 text-[13px] text-[#3a4452] border-t border-[var(--s2, #eef2f7)] pt-3">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">Internal notes</span>
                  <div className="mt-1 whitespace-pre-wrap">{l.notes}</div>
                </div>
              )}
              {l.decline_reason && (
                <div className="px-5 pb-4 text-[13px] text-[#b3261e] border-t border-[#fce4e3] pt-3 bg-[#fff6f5]">
                  <span className="text-[10px] uppercase tracking-wider text-[#b3261e]">Decline reason</span>
                  <div className="mt-1 whitespace-pre-wrap">{l.decline_reason}</div>
                </div>
              )}
            </FileSection>
          </div>
        </div>
      );
    },
  },

  // ── Counterparties ──────────────────────────────────────────────────────
  {
    id: 'counterparty',
    label: 'Counterparties',
    icon: ({ size }) => <OEIcon name="people" size={size} />,
    render: (data) => (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FileSection title="From (sender)">
          <div className="p-5 space-y-2 text-[13px]">
            <Row label="Name" value={data.counterparty.from.name || '—'} />
            <Row label="Email" value={data.counterparty.from.email || '—'} />
            <Row label="Role" value={(data.counterparty.from.role || '').replace(/_/g, ' ') || '—'} />
            <Row label="Participant id" value={<span className="font-mono text-[12px]">{data.counterparty.from.id}</span>} />
          </div>
        </FileSection>
        <FileSection title="To (recipient)">
          <div className="p-5 space-y-2 text-[13px]">
            <Row label="Name" value={data.counterparty.to.name || '—'} />
            <Row label="Email" value={data.counterparty.to.email || '—'} />
            <Row label="Role" value={(data.counterparty.to.role || '').replace(/_/g, ' ') || '—'} />
            <Row label="Participant id" value={<span className="font-mono text-[12px]">{data.counterparty.to.id || '—'}</span>} />
          </div>
        </FileSection>
        <div className="md:col-span-2">
          <FileSection title="KYC + risk" subtitle="Screenings + risk scores for both parties.">
            <FileTable
              rows={data.counterparty.kyc as any[]}
              emptyMessage="No KYC screenings recorded for either party."
              columns={[
                { key: 'participant_id', label: 'Participant', mono: true },
                { key: 'screening_type', label: 'Type', render: (r: any) => (r.screening_type || '').replace(/_/g, ' ') },
                { key: 'overall_risk', label: 'Risk', render: (r: any) => <StatusCell value={r.overall_risk} /> },
                { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
                { key: 'completed_at', label: 'Completed', mono: true, render: (r: any) => fmtDate(r.completed_at) },
              ]}
            />
            {data.counterparty.risk_scores.length > 0 && (
              <div className="px-5 py-3 border-t border-[var(--s2, #eef2f7)] grid grid-cols-2 md:grid-cols-4 gap-3">
                {data.counterparty.risk_scores.map((r: any) => (
                  <Kv key={r.participant_id} label={r.participant_id} value={`${r.band || '—'} (${r.score ?? '—'})`} />
                ))}
              </div>
            )}
          </FileSection>
        </div>
      </div>
    ),
  },

  // ── Project ─────────────────────────────────────────────────────────────
  {
    id: 'project',
    label: 'Project',
    icon: ({ size }) => <OEIcon name="workflow" size={size} />,
    render: (data) => (
      <FileSection title="Linked project" subtitle={data.loi.project_id ? `Open via the Project file for full lifecycle.` : 'No project attached to this LOI.'}>
        {data.project ? (
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
            <Kv label="Name" value={
              <a href={`/projects/${data.project.id}`} className="text-[var(--info, #1a5d97)] font-semibold hover:underline">
                {data.project.project_name || data.project.id}
              </a>
            } />
            <Kv label="Technology" value={(data.project.technology || '').replace(/_/g, ' ') || '—'} />
            <Kv label="Province" value={data.project.province || '—'} />
            <Kv label="Capacity" value={data.project.capacity_mw ? `${data.project.capacity_mw} MW` : '—'} />
            <Kv label="Status" value={<StatusCell value={data.project.status} />} />
            <Kv label="COD" value={fmtDate(data.project.cod_date)} />
            <Kv label="Tariff R/MWh" value={data.project.tariff_zar_per_mwh ? `R${fmtNum(data.project.tariff_zar_per_mwh, 0)}` : '—'} />
            <Kv label="Contracted" value={data.project.contracted_capacity_mw ? `${data.project.contracted_capacity_mw} MW` : '—'} />
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-[13px] text-[var(--ink-2, #6b7685)]">No project attached to this LOI.</div>
        )}
      </FileSection>
    ),
  },

  // ── Mix ─────────────────────────────────────────────────────────────────
  {
    id: 'mix',
    label: 'Energy mix',
    icon: ({ size }) => <OEIcon name="dashboard" size={size} />,
    render: (data) => {
      const entries = Object.entries(data.mix || {});
      return (
        <FileSection title="Generation mix" subtitle="Output of the bill→mix flow that produced this LOI.">
          {entries.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-[var(--ink-2, #6b7685)]">No mix breakdown available.</div>
          ) : (
            <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              {entries.map(([k, v]) => (
                <MicroKpi key={k} label={k} value={`${fmtNum(Number(v), 0)}%`} tone="good" />
              ))}
            </div>
          )}
        </FileSection>
      );
    },
  },

  // ── Lifecycle ───────────────────────────────────────────────────────────
  {
    id: 'lifecycle',
    label: 'Lifecycle',
    icon: ({ size }) => <OEIcon name="clock" size={size} />,
    badgeFromSummary: (s) => Number(s.pending_actions || 0),
    render: (data) => (
      <>
        <FileSection title="Action queue" subtitle="Pending and resolved tasks emitted by the LOI cascade.">
          <FileTable
            rows={data.lifecycle.action_queue as any[]}
            emptyMessage="No action queue items for this LOI."
            columns={[
              { key: 'action_type', label: 'Action', render: (r: any) => (r.action_type || '').replace(/_/g, ' ') },
              { key: 'assigned_to', label: 'Assigned', mono: true },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
              { key: 'due_at', label: 'Due', mono: true, render: (r: any) => fmtDate(r.due_at) },
              { key: 'completed_at', label: 'Completed', mono: true, render: (r: any) => fmtDate(r.completed_at) },
            ]}
          />
        </FileSection>
        <FileSection title="Notifications" subtitle="Messages sent in connection with this LOI.">
          <FileTable
            rows={data.lifecycle.notifications as any[]}
            emptyMessage="No notifications recorded."
            columns={[
              { key: 'type', label: 'Type', render: (r: any) => (r.type || '').replace(/_/g, ' ') },
              { key: 'participant_id', label: 'Recipient', mono: true },
              { key: 'title', label: 'Title' },
              { key: 'created_at', label: 'When', mono: true, render: (r: any) => fmtDate(r.created_at) },
            ]}
          />
        </FileSection>
      </>
    ),
  },

  // ── Resulting contract ──────────────────────────────────────────────────
  {
    id: 'contract',
    label: 'Resulting contract',
    icon: ({ size }) => <OEIcon name="doc" size={size} />,
    badgeFromSummary: (s) => (s.resulting_contract_id ? 1 : 0),
    render: (data) => (
      <>
        <FileSection title="Linked contract document">
          {data.contract ? (
            <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
              <Kv label="Contract" value={
                <a href={`/contracts/${data.contract.record.id}`} className="text-[var(--info, #1a5d97)] font-semibold hover:underline">
                  {data.contract.record.title || data.contract.record.id}
                </a>
              } />
              <Kv label="Type" value={(data.contract.record.document_type || '').replace(/_/g, ' ') || '—'} />
              <Kv label="Phase" value={<StatusCell value={data.contract.record.phase} />} />
              <Kv label="Created" value={fmtDate(data.contract.record.created_at)} />
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-[13px] text-[var(--ink-2, #6b7685)]">
              {data.loi.status === 'signed'
                ? 'LOI marked signed but the contract document has not been generated yet.'
                : 'No contract — the LOI has not been signed.'}
            </div>
          )}
        </FileSection>
        {data.contract && (
          <FileSection title="Signatories" subtitle="Required signers on the resulting term sheet.">
            <FileTable
              rows={data.contract.signatories as any[]}
              emptyMessage="No signatories on the resulting contract yet."
              columns={[
                { key: 'party_participant_id', label: 'Party', mono: true },
                { key: 'signing_role', label: 'Role', render: (r: any) => (r.signing_role || '').replace(/_/g, ' ') },
                { key: 'signed_at', label: 'Signed', mono: true, render: (r: any) => fmtDate(r.signed_at) },
                { key: 'signature_method', label: 'Method' },
              ]}
            />
          </FileSection>
        )}
      </>
    ),
  },

  // ── Audit ───────────────────────────────────────────────────────────────
  {
    id: 'audit',
    label: 'Audit',
    icon: ({ size }) => <OEIcon name="clock" size={size} />,
    badgeFromSummary: (s) => Number(s.audit_events || 0),
    render: (data) => (
      <>
        <FileSection title="Tamper-evident events" subtitle="Each event hash-anchors the previous one.">
          <FileTable
            rows={data.audit.events as any[]}
            emptyMessage="No tamper-evident events emitted yet."
            columns={[
              { key: 'event_type', label: 'Event', render: (r: any) => (r.event_type || '').replace(/_/g, ' ') },
              { key: 'created_at', label: 'When', mono: true, render: (r: any) => fmtDate(r.created_at) },
              { key: 'actor_id', label: 'Actor', mono: true },
              { key: 'hash', label: 'Hash', mono: true, render: (r: any) => r.hash ? String(r.hash).slice(0, 12) + '…' : '—' },
            ]}
          />
        </FileSection>
        <FileSection title="Activity log" subtitle="Free-form mutations recorded against this LOI.">
          <FileTable
            rows={data.audit.logs as any[]}
            emptyMessage="No activity recorded."
            columns={[
              { key: 'action', label: 'Action' },
              { key: 'user_email', label: 'Actor' },
              { key: 'timestamp', label: 'When', mono: true, render: (r: any) => fmtDate(r.timestamp) },
              { key: 'status', label: 'Status' },
            ]}
          />
        </FileSection>
      </>
    ),
  },
];

// ── Small utility cells (mirrors other entity file configs) ───────────────
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-[var(--ink-2, #6b7685)]">{label}</dt>
      <dd className="text-[var(--ink, #0f1c2e)] font-medium text-right">{value}</dd>
    </div>
  );
}

function Kv({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle, #dde4ec)] bg-[var(--s1, #fafbfd)] p-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">{label}</div>
      <div className="mt-1 text-[var(--ink, #0f1c2e)] font-semibold leading-tight">{value}</div>
    </div>
  );
}

function MicroKpi({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  const toneColor =
    tone === 'good' ? '#1f8a4f'
      : tone === 'warn' ? '#b27a00'
      : tone === 'bad' ? '#b3261e'
      : 'var(--ink, #0f1c2e)';
  return (
    <div className="rounded-lg border border-[var(--border-subtle, #dde4ec)] bg-surface-v2 p-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">{label}</div>
      <div className="mt-1 font-mono text-[18px] font-bold leading-tight" style={{ fontVariantNumeric: 'tabular-nums', color: toneColor }}>
        {value}
      </div>
    </div>
  );
}
