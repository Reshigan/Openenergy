// Wave 83 — NERSA Consultation Notice & Public-Comment Period tab.
//
// NERSA's PUBLIC-ENGAGEMENT engine: every material rule, methodology, licence
// condition or tariff determination has to be Gazette-published and put out for
// public comment before adoption (ERA 4/2006 s.10, PAJA 3/2000 s.4 + NERSA's
// Rules of Procedure). The 12-state P6 lifecycle runs:
//
//   drafted → published → open_for_comment → comment_period_closed
//     → analysis → response_drafted → adopted                       (clean path)
//
// optional hearing branch:
//   comment_period_closed → hearing_scheduled → hearing_held → analysis
//
// on_hold (legal review pause; resume → analysis), withdrawn, cancelled.
//
// DISTINCT from W31 disposition (OUTCOME of a NERSA case) and W43 MYPD (WHAT a
// licensee charges) — W83 is the DUE-PROCESS engine that PRECEDES adoption of
// any material instrument.
//
// W83 distinctive layer (beats ACER consultation portal / FERC eFiling / Ofgem
// consultation hub / AER consultation register / BEREC public-consultation):
// live consultation-health battery — comments received, stakeholder-balance
// index, representativeness coverage, statutory-period validity flag, judicial-
// review risk score, days remaining, extension visibility.
//
// SIGNATURE = TRANSPARENCY-driven reportability:
//   withdraw_notice crosses regulator EVERY tier — pulling a published
//                   consultation is always notifiable to PAJA / Council;
//   adopt_decision crosses EVERY tier when binding else material+landmark;
//   extend_comment_period crosses material+landmark;
//   sla_breached crosses material+landmark.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

const BG     = 'var(--s0, oklch(0.96 0.003 250))';
const BG1    = 'var(--s1, oklch(0.99 0.002 80))';
const BG2    = 'var(--s2, oklch(0.93 0.004 250))';
const BORDER = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1    = 'var(--ink, oklch(0.17 0.010 250))';
const TX2    = 'var(--ink-2, oklch(0.40 0.009 250))';
const TX3    = 'var(--ink-2, oklch(0.60 0.007 250))';
const ACC    = 'var(--accent, oklch(0.46 0.16 55))';
const BAD    = 'var(--bad, oklch(0.48 0.20 20))';
const WARN   = 'var(--accent, oklch(0.50 0.18 55))';
const GOOD   = 'var(--good, oklch(0.40 0.16 155))';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'drafted' | 'published' | 'open_for_comment' | 'comment_period_closed'
  | 'hearing_scheduled' | 'hearing_held' | 'analysis' | 'response_drafted'
  | 'adopted' | 'on_hold' | 'withdrawn' | 'cancelled';

type Tier = 'minor' | 'standard' | 'material' | 'landmark';
type Kind = 'rulemaking' | 'methodology' | 'licence_condition' | 'code_amendment' | 'policy' | 'rates_decision';
type Klass = 'binding' | 'guidance' | 'consultative';

interface NoticeRow {
  [key: string]: unknown;
  id: string;
  notice_number: string;
  notice_title: string;
  era_section: string | null;
  gazette_number: string | null;
  gazette_publication_at: string | null;
  consultation_kind: Kind;
  consultation_class: Klass;
  consultation_tier: Tier;
  affected_parties_estimate: number;
  is_binding_class: number;
  comment_period_start_at: string | null;
  comment_period_end_at: string | null;
  comment_period_minimum_days: number | null;
  extension_count: number;
  comments_received_count: number;
  industry_comments_count: number;
  consumer_comments_count: number;
  civil_society_comments_count: number;
  ipp_comments_count: number;
  government_comments_count: number;
  provinces_represented: number;
  sectors_represented: number;
  questions_total: number;
  questions_answered: number;
  hearing_scheduled_at: string | null;
  hearing_held_at: string | null;
  hearing_venue: string | null;
  presiding_member_name: string | null;
  response_document_ref: string | null;
  decision_reasons: string | null;
  adopted_decision_ref: string | null;
  procedural_validity_flag: number;
  judicial_review_risk_score: number;
  predicted_consultation_days: number | null;
  consultation_summary: string | null;
  chain_status: ChainStatus;
  drafted_at: string;
  published_at: string | null;
  open_for_comment_at: string | null;
  comment_period_closed_at: string | null;
  hearing_scheduled_at_status: string | null;
  hearing_held_at_status: string | null;
  analysis_at: string | null;
  response_drafted_at: string | null;
  adopted_at: string | null;
  on_hold_at: string | null;
  withdrawn_at: string | null;
  cancelled_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  draft_basis: string | null;
  publish_basis: string | null;
  open_basis: string | null;
  extension_basis: string | null;
  close_basis: string | null;
  hearing_basis: string | null;
  analysis_basis: string | null;
  response_basis: string | null;
  adoption_basis: string | null;
  hold_basis: string | null;
  withdrawal_basis: string | null;
  cancellation_basis: string | null;
  reason_code: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  is_reportable_flag?: boolean;
  is_binding_class_flag?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  breach_crosses_regulator?: boolean;
  comments_received_count_live?: number;
  balance_index_live?: number;
  representativeness_index_live?: number;
  coverage_completeness_pct_live?: number;
  procedural_validity_flag_live?: boolean;
  judicial_review_risk_score_live?: number;
  days_in_comment_period_live?: number | null;
  days_until_deadline_live?: number | null;
  extension_count_live?: number;
  predicted_consultation_days_live?: number;
}

interface KpiSummary {
  total: number;
  open_count: number;
  adopted_count: number;
  on_hold_count: number;
  withdrawn_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  binding_count: number;
  total_comments: number;
  total_extensions: number;
  high_judicial_risk_count: number;
  procedurally_invalid_count: number;
  total_affected_parties: number;
}

const ALL_STATES = [
  'drafted', 'published', 'open_for_comment', 'comment_period_closed',
  'analysis', 'response_drafted', 'adopted',
] as const;

const BRANCH_STATES = [
  'hearing_scheduled', 'hearing_held', 'on_hold', 'withdrawn', 'cancelled',
] as const;

const FILTERS = [
  { key: 'active',                label: 'Active' },
  { key: 'all',                   label: 'All' },
  { key: 'minor',                 label: 'Minor' },
  { key: 'standard',              label: 'Standard' },
  { key: 'material',              label: 'Material' },
  { key: 'landmark',              label: 'Landmark' },
  { key: 'open_for_comment',      label: 'Open for comment' },
  { key: 'comment_period_closed', label: 'Comments closed' },
  { key: 'hearing_scheduled',     label: 'Hearing scheduled' },
  { key: 'analysis',              label: 'Analysis' },
  { key: 'response_drafted',      label: 'Response drafted' },
  { key: 'binding',               label: 'Binding' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'adopted',               label: 'Adopted' },
  { key: 'on_hold',               label: 'On hold' },
  { key: 'withdrawn',             label: 'Withdrawn' },
];

const TERMINAL_STATES: ChainStatus[] = ['adopted', 'withdrawn', 'cancelled'];

const KIND_LABEL: Record<Kind, string> = {
  rulemaking:        'Rulemaking',
  methodology:       'Methodology',
  licence_condition: 'Licence condition',
  code_amendment:    'Code amendment',
  policy:            'Policy',
  rates_decision:    'Rates decision',
};

const CLASS_LABEL: Record<Klass, string> = {
  binding:      'Binding',
  guidance:     'Guidance',
  consultative: 'Consultative',
};

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function getActions(row: NoticeRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;
  const terminal = TERMINAL_STATES.includes(s);

  if (s === 'drafted') {
    actions.push({
      key: 'publish-notice',
      label: 'Publish notice (secretariat)',
      tone: 'primary',
      fields: [
        { key: 'publish_basis', label: 'Publish basis — notice gazetted ahead of comment period', type: 'textarea', required: true },
        { key: 'gazette_number', label: 'Gazette number (e.g. GG-49801)', type: 'text', required: false },
      ],
      cascadeTo: ['regulator', 'admin'],
    });
    actions.push({
      key: 'cancel',
      label: 'Cancel (admin)',
      tone: 'danger',
      fields: [
        { key: 'cancellation_basis', label: 'Cancellation basis — admin cancel (drafting error / duplicate)', type: 'textarea', required: true },
        { key: 'reason_code', label: 'Reason code (e.g. drafting_error / duplicate)', type: 'text', required: false },
      ],
    });
  }

  if (s === 'published') {
    actions.push({
      key: 'open-comment-period',
      label: 'Open comment period (secretariat)',
      tone: 'primary',
      fields: [
        { key: 'open_basis', label: 'Open basis — opening the public comment period', type: 'textarea', required: true },
        { key: 'comment_period_start_at', label: 'Comment period start (ISO datetime, blank = now)', type: 'text', required: false },
        { key: 'comment_period_end_at', label: 'Comment period end (ISO datetime, blank = +statutory)', type: 'text', required: false },
      ],
      cascadeTo: ['regulator', 'admin'],
    });
    actions.push({
      key: 'cancel',
      label: 'Cancel (admin)',
      tone: 'danger',
      fields: [
        { key: 'cancellation_basis', label: 'Cancellation basis — admin cancel (drafting error / duplicate)', type: 'textarea', required: true },
        { key: 'reason_code', label: 'Reason code (e.g. drafting_error / duplicate)', type: 'text', required: false },
      ],
    });
  }

  if (s === 'open_for_comment') {
    actions.push({
      key: 'close-comment-period',
      label: 'Close comment period (secretariat)',
      tone: 'primary',
      fields: [
        { key: 'close_basis', label: 'Close basis — comment period closed', type: 'textarea', required: true },
        { key: 'comments_received_count', label: 'Comments received count (total)', type: 'text', required: false },
      ],
      cascadeTo: ['regulator', 'admin'],
    });
    actions.push({
      key: 'extend-comment-period',
      label: 'Extend comment period (secretariat)',
      tone: 'warn',
      fields: [
        { key: 'extension_basis', label: 'Extension basis — extending the open comment period', type: 'textarea', required: true },
        { key: 'comment_period_end_at', label: 'New comment period end (ISO datetime)', type: 'text', required: false },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'comment_period_closed') {
    actions.push({
      key: 'begin-analysis',
      label: 'Begin analysis (panel)',
      tone: 'primary',
      fields: [
        { key: 'analysis_basis', label: 'Analysis basis — secretariat begins consolidated analysis of submissions', type: 'textarea', required: true },
      ],
      cascadeTo: ['admin'],
    });
    actions.push({
      key: 'reopen-for-comment',
      label: 'Reopen for comment (secretariat)',
      tone: 'warn',
      fields: [
        { key: 'open_basis', label: 'Reopen basis — comment period reopened (e.g. new material received)', type: 'textarea', required: true },
        { key: 'comment_period_end_at', label: 'New comment period end (ISO datetime)', type: 'text', required: false },
      ],
    });
    actions.push({
      key: 'schedule-hearing',
      label: 'Schedule hearing (presiding member)',
      tone: 'ghost',
      fields: [
        { key: 'hearing_basis', label: 'Hearing-schedule basis', type: 'textarea', required: true },
        { key: 'hearing_scheduled_at', label: 'Hearing date+time (ISO datetime)', type: 'text', required: false },
        { key: 'hearing_venue', label: 'Hearing venue', type: 'text', required: false },
        { key: 'presiding_member_name', label: 'Presiding member', type: 'text', required: false },
      ],
    });
  }

  if (s === 'hearing_scheduled') {
    actions.push({
      key: 'hold-hearing',
      label: 'Record hearing held (presiding member)',
      tone: 'primary',
      fields: [
        { key: 'hearing_basis', label: 'Hearing-held basis — record the public hearing held', type: 'textarea', required: true },
        { key: 'hearing_held_at', label: 'Hearing held at (ISO datetime, blank = now)', type: 'text', required: false },
      ],
    });
  }

  if (s === 'hearing_held') {
    actions.push({
      key: 'begin-analysis',
      label: 'Begin analysis (panel)',
      tone: 'primary',
      fields: [
        { key: 'analysis_basis', label: 'Analysis basis — secretariat begins consolidated analysis of submissions', type: 'textarea', required: true },
      ],
      cascadeTo: ['admin'],
    });
  }

  if (s === 'analysis') {
    actions.push({
      key: 'draft-response',
      label: 'Draft consolidated response (panel)',
      tone: 'primary',
      fields: [
        { key: 'response_basis', label: 'Response basis — consolidated response with reasons drafted', type: 'textarea', required: true },
        { key: 'response_document_ref', label: 'Response document reference (e.g. NRD-2026-007-RD)', type: 'text', required: false },
      ],
    });
  }

  if (s === 'response_drafted') {
    actions.push({
      key: 'adopt-decision',
      label: 'Adopt decision (Council)',
      tone: 'primary',
      fields: [
        { key: 'adoption_basis', label: 'Adoption basis — Council adopts the decision', type: 'textarea', required: true },
        { key: 'adopted_decision_ref', label: 'Adopted decision reference (e.g. NRD-2026-007-DEC)', type: 'text', required: false },
        { key: 'decision_reasons', label: 'Decision reasons (short summary)', type: 'textarea', required: false },
      ],
      cascadeTo: ['regulator', 'admin'],
    });
  }

  if (s === 'on_hold') {
    actions.push({
      key: 'resume',
      label: 'Resume after hold',
      tone: 'primary',
      fields: [
        { key: 'analysis_basis', label: 'Resume basis — exit hold, return to analysis', type: 'textarea', required: true },
      ],
    });
  }

  // Cross-state secondary actions
  if (!terminal && s !== 'on_hold' && s !== 'drafted') {
    actions.push({
      key: 'place-on-hold',
      label: 'Place on hold (legal review)',
      tone: 'warn',
      fields: [
        { key: 'hold_basis', label: 'Hold basis — pause the consultation (legal review or material change)', type: 'textarea', required: true },
        { key: 'reason_code', label: 'Reason code (e.g. legal_review)', type: 'text', required: false },
      ],
    });
  }

  if (!terminal && s !== 'drafted') {
    actions.push({
      key: 'withdraw-notice',
      label: 'Withdraw notice (regulator)',
      tone: 'danger',
      fields: [
        { key: 'withdrawal_basis', label: 'Withdrawal basis — NERSA pulls the consultation (TRANSPARENCY — always reportable)', type: 'textarea', required: true },
        { key: 'reason_code', label: 'Reason code (e.g. duplicate / superseded / public_interest)', type: 'text', required: false },
      ],
      cascadeTo: ['regulator', 'admin'],
    });
  }

  return actions;
}

function renderDetail(row: NoticeRow): React.ReactNode {
  const balPct = Math.round((row.balance_index_live ?? 0) * 100);
  const repPct = Math.round((row.representativeness_index_live ?? 0) * 100);
  const risk = row.judicial_review_risk_score_live ?? row.judicial_review_risk_score ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Live consultation-health battery */}
      <div>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 8 }}>
          Live consultation-health battery
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <DetailPair label="Balance index" value={`${balPct}%`} />
          <DetailPair label="Representativeness" value={`${repPct}%`} />
          <DetailPair label="Coverage" value={`${row.coverage_completeness_pct_live ?? 0}%`} />
          <DetailPair label="Judicial-review risk" value={`${risk} / 100`} />
          <DetailPair label="Procedural validity" value={row.procedural_validity_flag_live ? 'OK' : 'AT-RISK'} />
          <DetailPair label="Days in comment period" value={row.days_in_comment_period_live != null ? `${row.days_in_comment_period_live}d` : '—'} />
          <DetailPair label="Days until close" value={row.days_until_deadline_live != null ? `${row.days_until_deadline_live}d` : '—'} />
          <DetailPair label="Predicted total" value={`${row.predicted_consultation_days_live ?? 0}d`} />
        </div>
      </div>

      {/* Stakeholder mix */}
      <div>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 8 }}>
          Stakeholder mix
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <DetailPair label="Industry" value={fmtCount(row.industry_comments_count)} />
          <DetailPair label="Consumer" value={fmtCount(row.consumer_comments_count)} />
          <DetailPair label="Civil society" value={fmtCount(row.civil_society_comments_count)} />
          <DetailPair label="IPP" value={fmtCount(row.ipp_comments_count)} />
          <DetailPair label="Government" value={fmtCount(row.government_comments_count)} />
          <DetailPair label="Provinces" value={`${row.provinces_represented} / 9`} />
          <DetailPair label="Sectors" value={`${row.sectors_represented} / 8`} />
          <DetailPair label="Questions" value={`${row.questions_answered} / ${row.questions_total}`} />
        </div>
      </div>

      {/* Consultation info */}
      <div>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 8 }}>
          Notice details
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          <DetailPair label="Notice #" value={row.notice_number} />
          <DetailPair label="Kind" value={KIND_LABEL[row.consultation_kind]} />
          <DetailPair label="Class" value={CLASS_LABEL[row.consultation_class]} />
          <DetailPair label="Tier" value={row.consultation_tier} />
          <DetailPair label="Gazette" value={row.gazette_number ?? '—'} />
          <DetailPair label="Gazette published" value={fmtDate(row.gazette_publication_at)} />
          <DetailPair label="ERA section" value={row.era_section ?? '—'} />
          <DetailPair label="Statutory min days" value={row.comment_period_minimum_days != null ? `${row.comment_period_minimum_days}d` : '—'} />
          <DetailPair label="Comment period start" value={fmtDate(row.comment_period_start_at)} />
          <DetailPair label="Comment period end" value={fmtDate(row.comment_period_end_at)} />
          <DetailPair label="Comments received" value={fmtCount(row.comments_received_count_live ?? row.comments_received_count)} />
          <DetailPair label="Extensions" value={String(row.extension_count_live ?? row.extension_count)} />
          <DetailPair label="Affected parties est." value={row.affected_parties_estimate.toLocaleString('en-ZA')} />
          <DetailPair label="Hearing scheduled for" value={fmtDate(row.hearing_scheduled_at)} />
          <DetailPair label="Hearing venue" value={row.hearing_venue ?? '—'} />
          <DetailPair label="Hearing held" value={fmtDate(row.hearing_held_at)} />
          <DetailPair label="Presiding member" value={row.presiding_member_name ?? '—'} />
          <DetailPair label="Response doc" value={row.response_document_ref ?? '—'} />
          <DetailPair label="Adopted decision" value={row.adopted_decision_ref ?? '—'} />
          <DetailPair label="Drafted at" value={fmtDate(row.drafted_at)} />
          <DetailPair label="Published at" value={fmtDate(row.published_at)} />
          <DetailPair label="Opened at" value={fmtDate(row.open_for_comment_at)} />
          <DetailPair label="Closed at" value={fmtDate(row.comment_period_closed_at)} />
          <DetailPair label="Analysis at" value={fmtDate(row.analysis_at)} />
          <DetailPair label="Response drafted" value={fmtDate(row.response_drafted_at)} />
          <DetailPair label="Adopted at" value={fmtDate(row.adopted_at)} />
          <DetailPair label="On hold at" value={fmtDate(row.on_hold_at)} />
          <DetailPair label="Withdrawn at" value={fmtDate(row.withdrawn_at)} />
          <DetailPair label="Cancelled at" value={fmtDate(row.cancelled_at)} />
          <DetailPair label="Reportable" value={row.is_reportable_flag ? 'Yes' : 'No'} />
          <DetailPair label="Binding class" value={row.is_binding_class_flag ? 'Yes' : 'No'} />
          <DetailPair label="Reason code" value={row.reason_code ?? '—'} />
          <DetailPair label="Escalation level" value={row.escalation_level > 0 ? `Level ${row.escalation_level}` : '—'} />
        </div>
      </div>

      {/* Basis blocks */}
      {[
        { label: 'Consultation summary', text: row.consultation_summary },
        { label: 'Decision reasons', text: row.decision_reasons },
        { label: 'Draft basis', text: row.draft_basis },
        { label: 'Publish basis', text: row.publish_basis },
        { label: 'Open basis', text: row.open_basis },
        { label: 'Extension basis', text: row.extension_basis },
        { label: 'Close basis', text: row.close_basis },
        { label: 'Hearing basis', text: row.hearing_basis },
        { label: 'Analysis basis', text: row.analysis_basis },
        { label: 'Response basis', text: row.response_basis },
        { label: 'Adoption basis', text: row.adoption_basis },
        { label: 'Hold basis', text: row.hold_basis },
        { label: 'Withdrawal basis', text: row.withdrawal_basis },
        { label: 'Cancellation basis', text: row.cancellation_basis },
      ].filter(b => b.text).map(b => (
        <div key={b.label}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 4 }}>{b.label}</div>
          <div style={{ fontSize: 12, color: TX1, whiteSpace: 'pre-wrap', background: BG2, borderRadius: 4, padding: '6px 8px' }}>{b.text}</div>
        </div>
      ))}
    </div>
  );
}

export function ConsultationNoticeChainTab() {
  const [rows, setRows] = useState<NoticeRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: NoticeRow[] } & KpiSummary }>('/consultation-notice/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setSummary({
          total: d.total, open_count: d.open_count, adopted_count: d.adopted_count,
          on_hold_count: d.on_hold_count, withdrawn_count: d.withdrawn_count,
          cancelled_count: d.cancelled_count, breached: d.breached,
          reportable_total: d.reportable_total, binding_count: d.binding_count,
          total_comments: d.total_comments, total_extensions: d.total_extensions,
          high_judicial_risk_count: d.high_judicial_risk_count,
          procedurally_invalid_count: d.procedurally_invalid_count,
          total_affected_parties: d.total_affected_parties,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load consultation notices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    await api.post(`/consultation-notice/chain/${rowId}/${key}`, values);
    await load();
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: NoticeRow; events: ChainEvent[] } }>(
        `/consultation-notice/chain/${id}`,
      );
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events || [] }));
    } catch {
      // silent — ChainCard shows empty events
    }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return !!r.sla_breached;
      if (filter === 'reportable') return !!r.is_reportable_flag;
      if (filter === 'binding')    return !!r.is_binding_class_flag;
      if (filter === 'minor' || filter === 'standard' || filter === 'material' || filter === 'landmark') {
        return r.consultation_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  return (
    <div style={{ padding: '20px', background: BG, minHeight: '100vh' }}>
      <header style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: TX1, margin: 0 }}>
          Consultation notice &amp; public-comment period
        </h2>
        <p style={{ fontSize: 12, color: TX2, marginTop: 4, lineHeight: 1.5 }}>
          12-stage NERSA public-engagement chain (ERA 4/2006 s.10 · PAJA 3/2000 s.4 · NERSA Rules of Procedure).
          INVERTED SLA: landmark gets longer windows. Live consultation-health battery beats ACER/FERC/Ofgem/AER/BEREC.
          SIGNATURE: withdraw_notice crosses regulator every tier; adopt_decision crosses every tier when binding.
        </p>
      </header>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 16 }}>
        <KpiTile label="Total" value={summary?.total ?? rows.length} />
        <KpiTile label="Open" value={summary?.open_count ?? 0} />
        <KpiTile label="Adopted" value={summary?.adopted_count ?? 0} tone="ok" />
        <KpiTile label="On hold" value={summary?.on_hold_count ?? 0} tone={(summary?.on_hold_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Withdrawn" value={summary?.withdrawn_count ?? 0} tone={(summary?.withdrawn_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="SLA breached" value={summary?.breached ?? 0} tone={(summary?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Reportable" value={summary?.reportable_total ?? 0} tone={(summary?.reportable_total ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Binding" value={summary?.binding_count ?? 0} />
        <KpiTile label="Comments" value={fmtCount(summary?.total_comments ?? 0)} />
        <KpiTile label="Extensions" value={summary?.total_extensions ?? 0} />
        <KpiTile label="Judicial-risk≥50" value={summary?.high_judicial_risk_count ?? 0} tone={(summary?.high_judicial_risk_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Procedurally invalid" value={summary?.procedurally_invalid_count ?? 0} tone={(summary?.procedurally_invalid_count ?? 0) > 0 ? 'bad' : undefined} />
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            style={{
              padding: '3px 10px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
              background: filter === f.key ? ACC : BG1,
              color: filter === f.key ? '#fff' : TX2,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 4, background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', border: `1px solid ${BAD}`, color: BAD, fontSize: 12 }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: TX3, fontSize: 13 }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: TX3, fontSize: 13 }}>No consultations match.</div>
          )}
          {filtered.map((row) => (
            <ChainCard
              key={row.id}
              item={{
                ...row,
                case_number: row.notice_number,
              }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={row.notice_title}
              meta={
                <span style={{ fontSize: 11, color: TX2 }}>
                  {KIND_LABEL[row.consultation_kind]} · {CLASS_LABEL[row.consultation_class]} · {row.consultation_tier}
                  {row.is_binding_class_flag ? ' · binding' : ''}
                  {row.era_section ? ` · ${row.era_section}` : ''}
                  {' · '}comments {fmtCount(row.comments_received_count_live ?? row.comments_received_count)}
                  {' · '}balance {Math.round((row.balance_index_live ?? 0) * 100)}%
                  {' · '}judicial risk {row.judicial_review_risk_score_live ?? row.judicial_review_risk_score}
                  {row.is_reportable_flag ? ' · reportable' : ''}
                </span>
              }
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              onExpand={handleExpand}
              events={expandedEvents[row.id]}
              detail={renderDetail(row)}
              cascadeTo={['regulator', 'admin']}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: MONO, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 12, color: TX1, marginTop: 2 }}>{value}</div>
    </div>
  );
}

export default ConsultationNoticeChainTab;
