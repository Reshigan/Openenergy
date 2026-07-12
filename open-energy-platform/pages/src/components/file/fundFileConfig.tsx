// ════════════════════════════════════════════════════════════════════════
// fundFileConfig — tab map + hero for the loan facility (fund) file.
//
// Consumed by FundDetail.tsx. Mirrors the project / contract / RFP / LOI
// patterns. Aggregator (src/routes/funder.ts → /facilities/:id/file) returns:
//   { facility, project, parties, covenants, disbursements, action_queue,
//     ai_decisions, audit, summary, ai_suggestions }
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

// ── Shape of /funder/facilities/:id/file response ─────────────────────────
export interface FundFileData {
  facility: any;
  project: any | null;
  parties: {
    lender: { id: string; name?: string | null; email?: string | null };
    borrower: { id: string; name?: string | null; email?: string | null } | null;
  };
  covenants: any[];
  disbursements: any[];
  action_queue: any[];
  ai_decisions: any[];
  audit: { events: any[]; logs: any[] };
  summary: EntityFileSummary;
  ai_suggestions: any[];
}

// ── Hero ──────────────────────────────────────────────────────────────────
export function fundHero(data: FundFileData): EntityFileHero {
  const f = data.facility;
  const s = data.summary;
  const statusLabel: Record<string, string> = {
    active: 'Active',
    drawdown: 'Drawdown',
    closed: 'Closed',
    matured: 'Matured',
    cancelled: 'Cancelled',
  };
  const breached = Number(s.covenants_breached || 0);
  const utilisation = s.utilisation_pct != null ? Number(s.utilisation_pct) : null;
  const tone: 'good' | 'warn' | 'bad' | undefined =
    breached > 0 ? 'bad'
      : utilisation != null && utilisation < 30 ? 'warn'
      : 'good';
  return {
    eyebrowIcon: ({ size }) => <OEIcon name="wallet" size={size || 12} />,
    eyebrowLabel: `Debt facility · ${statusLabel[f.status] || f.status}`,
    title: f.facility_name || f.id,
    subtitle: `${f.lender_name || 'Lender'} → ${f.borrower_name || 'Borrower'} · ${(f.facility_type || 'senior debt').replace(/_/g, ' ')}`,
    accentFrom: '#0e3b6e',
    accentTo: '#06223f',
    kpis: [
      {
        key: 'committed',
        label: 'Committed',
        value: fmtZAR(Number(s.committed_zar || 0)),
      },
      {
        key: 'drawn',
        label: 'Drawn',
        value: fmtZAR(Number(s.drawn_zar || 0)),
        tone,
      },
      {
        key: 'dscr',
        label: 'Latest DSCR',
        value: s.latest_dscr_value != null
          ? fmtNum(Number(s.latest_dscr_value), 2)
          : '—',
        tone: s.latest_dscr_value != null && Number(s.latest_dscr_value) < Number(s.dscr_covenant || 1.2)
          ? 'bad'
          : s.latest_dscr_value != null
            ? 'good'
            : undefined,
      },
      {
        key: 'maturity',
        label: 'Months to maturity',
        value: s.months_to_maturity != null ? `${s.months_to_maturity}` : '—',
        tone: s.months_to_maturity != null && Number(s.months_to_maturity) <= 18 ? 'warn' : undefined,
      },
    ],
  };
}

// ── Tabs ──────────────────────────────────────────────────────────────────
export const fundFileTabs: EntityFileTab<FundFileData>[] = [
  // ── Overview ────────────────────────────────────────────────────────────
  {
    id: 'overview',
    label: 'Overview',
    icon: ({ size }) => <OEIcon name="dashboard" size={size} />,
    render: (data) => {
      const f = data.facility;
      const s = data.summary;
      return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <FileSection title="Facility facts">
            <div className="p-5">
              <dl className="text-[13px] space-y-2">
                <Row label="Facility id" value={<span className="font-mono">{f.id}</span>} />
                <Row label="Type" value={(f.facility_type || '').replace(/_/g, ' ') || '—'} />
                <Row label="Status" value={<StatusCell value={f.status} />} />
                <Row label="Currency" value={f.currency || 'ZAR'} />
                <Row label="Interest rate" value={f.interest_rate_pct != null ? `${fmtNum(Number(f.interest_rate_pct), 2)}%` : '—'} />
                <Row label="Tenor" value={f.tenor_months ? `${f.tenor_months} months` : '—'} />
                <Row label="DSCR covenant" value={f.dscr_covenant ? fmtNum(Number(f.dscr_covenant), 2) : '—'} />
                <Row label="Created" value={fmtDate(f.created_at)} />
              </dl>
            </div>
          </FileSection>

          <div className="lg:col-span-2 space-y-4">
            <FileSection title="Capital snapshot">
              <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                <MicroKpi label="Committed" value={fmtZAR(Number(s.committed_zar || 0))} />
                <MicroKpi label="Drawn" value={fmtZAR(Number(s.drawn_zar || 0))} tone="good" />
                <MicroKpi label="Available" value={fmtZAR(Number(s.available_zar || 0))} />
                <MicroKpi
                  label="Utilisation"
                  value={s.utilisation_pct != null ? `${fmtNum(Number(s.utilisation_pct), 0)}%` : '—'}
                  tone={s.utilisation_pct != null && Number(s.utilisation_pct) < 30 ? 'warn' : 'good'}
                />
                <MicroKpi
                  label="Latest DSCR"
                  value={s.latest_dscr_value != null ? fmtNum(Number(s.latest_dscr_value), 2) : '—'}
                  tone={s.latest_dscr_value != null && Number(s.latest_dscr_value) < Number(s.dscr_covenant || 1.2) ? 'bad' : 'good'}
                />
                <MicroKpi
                  label="Covenants breached"
                  value={Number(s.covenants_breached || 0)}
                  tone={Number(s.covenants_breached || 0) > 0 ? 'bad' : 'good'}
                />
                <MicroKpi
                  label="Pending drawdowns"
                  value={Number(s.pending_disbursements || 0)}
                  tone={Number(s.pending_disbursements || 0) > 0 ? 'warn' : undefined}
                />
                <MicroKpi
                  label="Months to maturity"
                  value={s.months_to_maturity != null ? `${s.months_to_maturity}` : '—'}
                  tone={s.months_to_maturity != null && Number(s.months_to_maturity) <= 18 ? 'warn' : undefined}
                />
              </div>
            </FileSection>

            <FileSection title="Linked project" subtitle="Construction or operating asset financed by this facility.">
              {data.project ? (
                <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
                  <Kv label="Project" value={
                    <a href={`/projects/${data.project.id}`} className="text-[var(--info, #1a5d97)] font-semibold hover:underline">
                      {data.project.project_name || data.project.id}
                    </a>
                  } />
                  <Kv label="Technology" value={(data.project.technology || '').replace(/_/g, ' ') || '—'} />
                  <Kv label="Location" value={data.project.province || '—'} />
                  <Kv label="Capacity" value={data.project.capacity_mw ? `${data.project.capacity_mw} MW` : '—'} />
                  <Kv label="Status" value={<StatusCell value={data.project.status} />} />
                  <Kv label="COD" value={fmtDate(data.project.cod_date)} />
                  <Kv label="PPA price" value={data.project.tariff_zar_per_mwh ? `R${fmtNum(Number(data.project.tariff_zar_per_mwh), 0)}/MWh` : '—'} />
                </div>
              ) : (
                <div className="px-5 py-8 text-center text-[13px] text-[var(--ink-2, #6b7685)]">No project linked to this facility.</div>
              )}
            </FileSection>
          </div>
        </div>
      );
    },
  },

  // ── Parties ─────────────────────────────────────────────────────────────
  {
    id: 'parties',
    label: 'Parties',
    icon: ({ size }) => <OEIcon name="people" size={size} />,
    render: (data) => (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FileSection title="Lender">
          <div className="p-5 space-y-2 text-[13px]">
            <Row label="Name" value={data.parties.lender.name || '—'} />
            <Row label="Email" value={data.parties.lender.email || '—'} />
            <Row label="Participant id" value={<span className="font-mono text-[12px]">{data.parties.lender.id}</span>} />
          </div>
        </FileSection>
        <FileSection title="Borrower">
          <div className="p-5 space-y-2 text-[13px]">
            <Row label="Name" value={data.parties.borrower?.name || '—'} />
            <Row label="Email" value={data.parties.borrower?.email || '—'} />
            <Row label="Participant id" value={<span className="font-mono text-[12px]">{data.parties.borrower?.id || '—'}</span>} />
          </div>
        </FileSection>
      </div>
    ),
  },

  // ── Covenants ───────────────────────────────────────────────────────────
  {
    id: 'covenants',
    label: 'Covenants',
    icon: ({ size }) => <OEIcon name="scale" size={size} />,
    badgeFromSummary: (s) => Number(s.covenants_breached || 0) || Number(s.covenants_total || 0),
    render: (data) => (
      <FileSection title="Loan covenants" subtitle="DSCR, LLCR, leverage and any bespoke triggers — sorted breached → watch → clean.">
        <FileTable
          rows={data.covenants as any[]}
          emptyMessage="No covenants on file."
          columns={[
            { key: 'covenant_type', label: 'Type', render: (r: any) => (r.covenant_type || '').replace(/_/g, ' ') },
            { key: 'threshold', label: 'Threshold', mono: true, align: 'right', render: (r: any) => r.threshold != null ? fmtNum(Number(r.threshold), 2) : '—' },
            { key: 'last_value', label: 'Last value', mono: true, align: 'right', render: (r: any) => r.last_value != null ? fmtNum(Number(r.last_value), 2) : '—' },
            { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            { key: 'last_checked_at', label: 'Last checked', mono: true, render: (r: any) => fmtDate(r.last_checked_at) },
            { key: 'notes', label: 'Notes' },
          ]}
        />
      </FileSection>
    ),
  },

  // ── Disbursements ───────────────────────────────────────────────────────
  {
    id: 'disbursements',
    label: 'Drawdowns',
    icon: ({ size }) => <OEIcon name="currency-zar" size={size} />,
    badgeFromSummary: (s) => Number(s.pending_disbursements || 0),
    render: (data) => (
      <FileSection title="Disbursement requests" subtitle="Draw-down tranches against this facility, in chronological order.">
        <FileTable
          rows={data.disbursements as any[]}
          emptyMessage="No drawdown requests recorded."
          columns={[
            { key: 'id', label: 'Request', mono: true },
            { key: 'amount', label: 'Amount', align: 'right', mono: true, render: (r: any) => fmtZAR(Number(r.amount || 0)) },
            { key: 'currency', label: 'Currency' },
            { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            { key: 'requested_by', label: 'Requested by', mono: true },
            { key: 'approved_by', label: 'Approved by', mono: true },
            { key: 'approved_at', label: 'Approved', mono: true, render: (r: any) => fmtDate(r.approved_at) },
            { key: 'created_at', label: 'Requested', mono: true, render: (r: any) => fmtDate(r.created_at) },
          ]}
        />
      </FileSection>
    ),
  },

  // ── Actions ─────────────────────────────────────────────────────────────
  {
    id: 'actions',
    label: 'Action queue',
    icon: ({ size }) => <OEIcon name="clock" size={size} />,
    badgeFromSummary: (s) => Number(s.pending_actions || 0),
    render: (data) => (
      <FileSection title="Outstanding tasks" subtitle="All cascaded action items emitted by this facility, its covenants and drawdowns.">
        <FileTable
          rows={data.action_queue as any[]}
          emptyMessage="No action items in flight."
          columns={[
            { key: 'action_type', label: 'Action', render: (r: any) => (r.action_type || '').replace(/_/g, ' ') },
            { key: 'severity', label: 'Severity', render: (r: any) => <StatusCell value={r.severity} /> },
            { key: 'assigned_to', label: 'Assigned', mono: true },
            { key: 'entity_type', label: 'On', mono: true },
            { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            { key: 'due_at', label: 'Due', mono: true, render: (r: any) => fmtDate(r.due_at) },
            { key: 'completed_at', label: 'Completed', mono: true, render: (r: any) => fmtDate(r.completed_at) },
          ]}
        />
      </FileSection>
    ),
  },

  // ── AI history ──────────────────────────────────────────────────────────
  {
    id: 'ai',
    label: 'AI history',
    icon: ({ size }) => <OEIcon name="dashboard" size={size} />,
    badgeFromSummary: (s) => Number(s.ai_decisions || 0),
    render: (data) => (
      <FileSection title="AI decisions on this facility" subtitle="Cashflow forecasts, sensitivity sweeps, covenant triage — recorded for audit.">
        <FileTable
          rows={data.ai_decisions as any[]}
          emptyMessage="No AI activity recorded against this facility yet."
          columns={[
            { key: 'surface', label: 'Surface', render: (r: any) => (r.surface || '').replace(/_/g, ' ') },
            { key: 'intent', label: 'Intent', render: (r: any) => (r.intent || '').replace(/_/g, ' ') },
            { key: 'model', label: 'Model', mono: true },
            { key: 'accepted', label: 'Accepted', render: (r: any) => r.accepted === 1 ? 'Yes' : r.accepted === 0 ? 'Dismissed' : '—' },
            { key: 'fallback', label: 'Fallback', render: (r: any) => r.fallback ? 'Yes' : 'No' },
            { key: 'created_at', label: 'When', mono: true, render: (r: any) => fmtDate(r.created_at) },
          ]}
        />
      </FileSection>
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
              { key: 'entity_type', label: 'On', mono: true },
              { key: 'created_at', label: 'When', mono: true, render: (r: any) => fmtDate(r.created_at) },
              { key: 'actor_id', label: 'Actor', mono: true },
              { key: 'hash', label: 'Hash', mono: true, render: (r: any) => r.hash ? String(r.hash).slice(0, 12) + '…' : '—' },
            ]}
          />
        </FileSection>
        <FileSection title="Activity log" subtitle="Free-form mutations recorded against this facility and its children.">
          <FileTable
            rows={data.audit.logs as any[]}
            emptyMessage="No activity recorded."
            columns={[
              { key: 'action', label: 'Action' },
              { key: 'user_email', label: 'Actor' },
              { key: 'resource_type', label: 'On', mono: true },
              { key: 'timestamp', label: 'When', mono: true, render: (r: any) => fmtDate(r.timestamp) },
              { key: 'status', label: 'Status' },
            ]}
          />
        </FileSection>
      </>
    ),
  },
];

// ── Small utility cells ───────────────────────────────────────────────────
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
