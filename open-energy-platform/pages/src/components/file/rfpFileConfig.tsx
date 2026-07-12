// ════════════════════════════════════════════════════════════════════════
// rfpFileConfig — tab map + hero for the procurement RFP file.
//
// Consumed by RfpDetail.tsx. Mirrors the project / contract file pattern:
//   - The shell fetches /procurement/rfps/:id/file once.
//   - heroFor() builds the gradient hero from data.rfp + summary.
//   - Each tab pulls rows from the matching aggregator section.
//
// Aggregator shape (src/routes/procurement.ts → /:id/file):
//   { rfp, phase, summary, specification, bidders, evaluation, award, audit, ai_suggestions }
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

// ── Shape of /procurement/rfps/:id/file response ──────────────────────────
export interface RfpFileData {
  rfp: {
    id: string;
    title: string;
    description?: string;
    rfp_reference?: string;
    closing_date?: string;
    evaluation_date?: string;
    budget?: number;
    currency?: string;
    status?: string;
    created_at?: string;
    creator_name?: string;
    creator_company?: string;
  };
  phase: string;
  summary: EntityFileSummary;
  specification: {
    description?: string;
    rfp_reference?: string;
    closing_date?: string;
    evaluation_date?: string;
    budget?: number;
    currency?: string;
    creator_name?: string;
    creator_company?: string;
  };
  bidders: { bids: any[] };
  evaluation: { scored_bids: any[] };
  award: { record: any | null; linked_contract: any | null };
  audit: { events: any[]; logs: any[] };
  ai_suggestions: any[];
}

// ── Hero ──────────────────────────────────────────────────────────────────
export function rfpHero(data: RfpFileData): EntityFileHero {
  const r = data.rfp;
  const s = data.summary;
  const phaseLabel: Record<string, string> = {
    draft: 'Draft',
    published: 'Open for bids',
    evaluation: 'Under evaluation',
    awarded: 'Awarded',
    cancelled: 'Cancelled',
  };
  const daysToClose = s.days_to_close != null ? Number(s.days_to_close) : null;
  const daysTone: 'good' | 'warn' | 'bad' = daysToClose == null
    ? 'neutral' as 'good'
    : daysToClose < 0 ? 'bad' : daysToClose < 7 ? 'warn' : 'good';
  return {
    eyebrowIcon: ({ size }) => <OEIcon name="cart" size={size || 12} />,
    eyebrowLabel: `Procurement RFP · ${phaseLabel[r.status || ''] || r.status || 'unknown'}`,
    title: r.title || 'Untitled RFP',
    subtitle: `${r.rfp_reference || 'No reference'} · Issued by ${r.creator_company || r.creator_name || 'Unknown'}`,
    accentFrom: '#143d35',
    accentTo: '#0a1e1a',
    kpis: [
      {
        key: 'bids',
        label: 'Bids received',
        value: `${Number(s.bids_total || 0)}`,
      },
      {
        key: 'budget',
        label: 'Budget',
        value: fmtZAR(Number(s.budget_zar || 0)),
      },
      {
        key: 'closing',
        label: 'Closes in',
        value: daysToClose == null
          ? '—'
          : daysToClose < 0
            ? `${Math.abs(daysToClose)}d ago`
            : `${daysToClose}d`,
        tone: daysTone,
      },
      {
        key: 'evaluated',
        label: 'Evaluated',
        value: `${Number(s.bids_evaluated || 0)} / ${Number(s.bids_total || 0)}`,
      },
    ],
  };
}

// ── Tabs ──────────────────────────────────────────────────────────────────
export const rfpFileTabs: EntityFileTab<RfpFileData>[] = [
  // ── Overview ────────────────────────────────────────────────────────────
  {
    id: 'overview',
    label: 'Overview',
    icon: ({ size }) => <OEIcon name="dashboard" size={size} />,
    render: (data) => {
      const r = data.rfp;
      const s = data.summary;
      return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <FileSection title="RFP facts">
            <div className="p-5">
              <dl className="text-[13px] space-y-2">
                <Row label="Reference" value={r.rfp_reference || '—'} />
                <Row label="Status" value={<StatusCell value={r.status} />} />
                <Row label="Issued by" value={r.creator_company || r.creator_name || '—'} />
                <Row label="Budget" value={r.budget ? fmtZAR(r.budget) : '—'} />
                <Row label="Currency" value={r.currency || 'ZAR'} />
                <Row label="Closing date" value={fmtDate(r.closing_date)} />
                <Row label="Evaluation date" value={fmtDate(r.evaluation_date)} />
                <Row label="Created" value={fmtDate(r.created_at)} />
              </dl>
            </div>
          </FileSection>

          <div className="lg:col-span-2 space-y-4">
            <FileSection title="Bid market snapshot">
              <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                <MicroKpi label="Bids submitted" value={Number(s.bids_submitted || 0)} />
                <MicroKpi label="Shortlisted" value={Number(s.bids_shortlisted || 0)} tone={Number(s.bids_shortlisted || 0) > 0 ? 'good' : undefined} />
                <MicroKpi label="Awarded" value={Number(s.bids_awarded || 0)} tone={Number(s.bids_awarded || 0) > 0 ? 'good' : undefined} />
                <MicroKpi label="Rejected" value={Number(s.bids_rejected || 0)} />
                <MicroKpi label="Lowest bid" value={fmtZAR(Number(s.lowest_bid_zar || 0))} />
                <MicroKpi label="Total bid value" value={fmtZAR(Number(s.total_bid_value_zar || 0))} />
                <MicroKpi
                  label="Vs budget"
                  value={s.budget_zar && Number(s.budget_zar) > 0 && s.lowest_bid_zar
                    ? `${fmtNum((Number(s.lowest_bid_zar) / Number(s.budget_zar)) * 100, 0)}%`
                    : '—'}
                  tone={
                    s.budget_zar && Number(s.lowest_bid_zar) > Number(s.budget_zar) ? 'bad'
                      : s.budget_zar && Number(s.lowest_bid_zar) > 0 ? 'good'
                      : undefined
                  }
                />
                <MicroKpi label="Linked contract" value={Number(s.linked_contract || 0) ? 'Yes' : 'No'} tone={Number(s.linked_contract || 0) ? 'good' : undefined} />
              </div>
            </FileSection>

            <FileSection title="Specification (excerpt)" subtitle="Full text on the Specification tab.">
              <div className="px-5 py-4 text-[13px] text-[var(--ink, #0f1c2e)] whitespace-pre-wrap leading-relaxed">
                {r.description ? r.description.slice(0, 480) + (r.description.length > 480 ? '…' : '') : 'No specification provided.'}
              </div>
            </FileSection>
          </div>
        </div>
      );
    },
  },

  // ── Specification ───────────────────────────────────────────────────────
  {
    id: 'specification',
    label: 'Specification',
    icon: ({ size }) => <OEIcon name="doc" size={size} />,
    render: (data) => (
      <FileSection title="Full specification" subtitle={data.specification.rfp_reference || ''}>
        <div className="px-5 py-4 text-[13px] text-[var(--ink, #0f1c2e)] whitespace-pre-wrap leading-relaxed">
          {data.specification.description || 'No specification text on file.'}
        </div>
        <div className="px-5 py-3 border-t border-[var(--s2, #eef2f7)] grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
          <Kv label="Reference" value={data.specification.rfp_reference || '—'} />
          <Kv label="Closing" value={fmtDate(data.specification.closing_date)} />
          <Kv label="Evaluation" value={fmtDate(data.specification.evaluation_date)} />
          <Kv label="Budget" value={data.specification.budget ? fmtZAR(data.specification.budget) : '—'} />
          <Kv label="Issuer" value={data.specification.creator_company || data.specification.creator_name || '—'} />
          <Kv label="Currency" value={data.specification.currency || 'ZAR'} />
        </div>
      </FileSection>
    ),
  },

  // ── Bidders ─────────────────────────────────────────────────────────────
  {
    id: 'bidders',
    label: 'Bidders',
    icon: ({ size }) => <OEIcon name="people" size={size} />,
    badgeFromSummary: (s) => Number(s.bids_total || 0),
    render: (data) => (
      <FileSection title="All bids" subtitle="Every submission against this RFP, sorted by ranked / weighted score.">
        <FileTable
          rows={data.bidders.bids as any[]}
          emptyMessage="No bids submitted yet."
          columns={[
            { key: 'bidder_company', label: 'Bidder', render: (r: any) => r.bidder_company || r.bidder_name || '—' },
            { key: 'bbbee_level', label: 'B-BBEE', align: 'right', mono: true, render: (r: any) => r.bbbee_level != null ? `L${r.bbbee_level}` : '—' },
            { key: 'bid_amount', label: 'Bid', align: 'right', mono: true, render: (r: any) => fmtZAR(r.bid_amount) },
            { key: 'overall_score', label: 'Score', align: 'right', mono: true, render: (r: any) => r.overall_score != null ? fmtNum(r.overall_score, 1) : '—' },
            { key: 'rank', label: 'Rank', align: 'right', mono: true, render: (r: any) => r.rank != null ? `#${r.rank}` : '—' },
            { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            { key: 'submitted_at', label: 'Submitted', mono: true, render: (r: any) => fmtDate(r.submitted_at) },
          ]}
        />
      </FileSection>
    ),
  },

  // ── Evaluation ──────────────────────────────────────────────────────────
  {
    id: 'evaluation',
    label: 'Evaluation',
    icon: ({ size }) => <OEIcon name="scale" size={size} />,
    badgeFromSummary: (s) => Number(s.bids_evaluated || 0),
    render: (data) => (
      <FileSection title="Scoring matrix" subtitle="Price 40% · Technical 25% · Sustainability 20% · Delivery 15%.">
        <FileTable
          rows={data.evaluation.scored_bids as any[]}
          emptyMessage="No bids scored yet."
          columns={[
            { key: 'bidder_company', label: 'Bidder', render: (r: any) => r.bidder_company || r.bidder_name || '—' },
            { key: 'bid_amount', label: 'Bid', align: 'right', mono: true, render: (r: any) => fmtZAR(r.bid_amount) },
            { key: 'technical_score', label: 'Technical', align: 'right', mono: true, render: (r: any) => r.technical_score != null ? fmtNum(r.technical_score, 1) : '—' },
            { key: 'sustainability_score', label: 'Sustain', align: 'right', mono: true, render: (r: any) => r.sustainability_score != null ? fmtNum(r.sustainability_score, 1) : '—' },
            { key: 'delivery_score', label: 'Delivery', align: 'right', mono: true, render: (r: any) => r.delivery_score != null ? fmtNum(r.delivery_score, 1) : '—' },
            { key: 'overall_score', label: 'Overall', align: 'right', mono: true, render: (r: any) => r.overall_score != null ? fmtNum(r.overall_score, 1) : '—' },
            { key: 'rank', label: 'Rank', align: 'right', mono: true, render: (r: any) => r.rank != null ? `#${r.rank}` : '—' },
            { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
          ]}
        />
      </FileSection>
    ),
  },

  // ── Award ───────────────────────────────────────────────────────────────
  {
    id: 'award',
    label: 'Award',
    icon: ({ size }) => <OEIcon name="badge" size={size} />,
    badgeFromSummary: (s) => Number(s.bids_awarded || 0),
    render: (data) => (
      <>
        <FileSection title="Award record" subtitle="Issued under PFMA s.51 — must be followed by a contract within 14 days.">
          {data.award.record ? (
            <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3 text-[13px]">
              <Kv label="Winning bid" value={data.award.record.winning_bid_id || '—'} />
              <Kv label="Award value" value={fmtZAR(data.award.record.award_value)} />
              <Kv label="Currency" value={data.award.record.currency || 'ZAR'} />
              <Kv label="Awarded" value={fmtDate(data.award.record.awarded_at)} />
              <Kv label="Awarded by" value={data.award.record.awarded_by_name || data.award.record.awarded_by || '—'} />
              <Kv label="Notes" value={data.award.record.notes || '—'} />
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-[13px] text-[var(--ink-2, #6b7685)]">No award has been issued yet.</div>
          )}
        </FileSection>

        <FileSection title="Linked contract" subtitle="LOI / term sheet / PPA that follows from this award.">
          {data.award.linked_contract ? (
            <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3 text-[13px]">
              <Kv label="Document" value={
                <a href={`/contracts/${data.award.linked_contract.id}`} className="text-[var(--info, #1a5d97)] font-semibold hover:underline">
                  {data.award.linked_contract.title}
                </a>
              } />
              <Kv label="Type" value={(data.award.linked_contract.document_type || '').replace(/_/g, ' ') || '—'} />
              <Kv label="Phase" value={<StatusCell value={data.award.linked_contract.phase} />} />
              <Kv label="Created" value={fmtDate(data.award.linked_contract.created_at)} />
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-[13px] text-[var(--ink-2, #6b7685)]">No contract document has been linked to this award yet.</div>
          )}
        </FileSection>
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
              { key: 'sequence_no', label: 'Seq', align: 'right', mono: true },
              { key: 'event_type', label: 'Event', render: (r: any) => (r.event_type || '').replace(/_/g, ' ') },
              { key: 'created_at', label: 'When', mono: true, render: (r: any) => fmtDate(r.created_at) },
              { key: 'actor_id', label: 'Actor', mono: true },
              { key: 'content_hash', label: 'Hash', mono: true, render: (r: any) => r.content_hash ? String(r.content_hash).slice(0, 12) + '…' : '—' },
            ]}
          />
        </FileSection>
        <FileSection title="Activity log" subtitle="Free-form mutations recorded against this RFP.">
          <FileTable
            rows={data.audit.logs as any[]}
            emptyMessage="No activity recorded."
            columns={[
              { key: 'action', label: 'Action' },
              { key: 'actor_name', label: 'Actor' },
              { key: 'created_at', label: 'When', mono: true, render: (r: any) => fmtDate(r.created_at) },
              { key: 'ip_address', label: 'From', mono: true },
            ]}
          />
        </FileSection>
      </>
    ),
  },
];

// ── Small utility cells (mirrors projectFileConfig) ───────────────────────
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
