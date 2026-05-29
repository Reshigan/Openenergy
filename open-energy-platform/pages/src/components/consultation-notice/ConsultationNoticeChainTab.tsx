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

type ChainStatus =
  | 'drafted' | 'published' | 'open_for_comment' | 'comment_period_closed'
  | 'hearing_scheduled' | 'hearing_held' | 'analysis' | 'response_drafted'
  | 'adopted' | 'on_hold' | 'withdrawn' | 'cancelled';

type Tier = 'minor' | 'standard' | 'material' | 'landmark';

type Kind = 'rulemaking' | 'methodology' | 'licence_condition' | 'code_amendment' | 'policy' | 'rates_decision';

type Klass = 'binding' | 'guidance' | 'consultative';

interface NoticeRow {
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

interface NoticeEvent {
  id: string;
  notice_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
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

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  drafted:               { bg: '#e3e7ec', fg: '#557',    label: 'Drafted' },
  published:             { bg: '#dbecfb', fg: '#1a3a5c', label: 'Published' },
  open_for_comment:      { bg: '#dbecfb', fg: '#1a3a5c', label: 'Open for comment' },
  comment_period_closed: { bg: '#fff4d6', fg: '#a06200', label: 'Comments closed' },
  hearing_scheduled:     { bg: '#fff4d6', fg: '#a06200', label: 'Hearing scheduled' },
  hearing_held:          { bg: '#ffe9d6', fg: '#8a4a00', label: 'Hearing held' },
  analysis:              { bg: '#fff4d6', fg: '#a06200', label: 'Analysis' },
  response_drafted:      { bg: '#ffe4b5', fg: '#8a4a00', label: 'Response drafted' },
  adopted:               { bg: '#d4edda', fg: '#155724', label: 'Adopted' },
  on_hold:               { bg: '#ffe4b5', fg: '#8a4a00', label: 'On hold' },
  withdrawn:             { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
  cancelled:             { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor (<50)' },
  standard: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard (<500)' },
  material: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Material (<5000)' },
  landmark: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Landmark (≥5000)' },
};

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

const FILTERS: Array<{ key: string; label: string }> = [
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

type ActionKind =
  | 'publish-notice' | 'open-comment-period' | 'extend-comment-period'
  | 'close-comment-period' | 'reopen-for-comment' | 'schedule-hearing'
  | 'hold-hearing' | 'begin-analysis' | 'draft-response' | 'adopt-decision'
  | 'place-on-hold' | 'resume' | 'withdraw-notice' | 'cancel';

const PRIMARY_ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  drafted:               'publish-notice',
  published:             'open-comment-period',
  open_for_comment:      'close-comment-period',
  comment_period_closed: 'begin-analysis',
  hearing_scheduled:     'hold-hearing',
  hearing_held:          'begin-analysis',
  analysis:              'draft-response',
  response_drafted:      'adopt-decision',
  on_hold:               'resume',
  adopted:               null,
  withdrawn:             null,
  cancelled:             null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'publish-notice':        'Publish notice (secretariat)',
  'open-comment-period':   'Open comment period (secretariat)',
  'extend-comment-period': 'Extend comment period (secretariat)',
  'close-comment-period':  'Close comment period (secretariat)',
  'reopen-for-comment':    'Reopen for comment (secretariat)',
  'schedule-hearing':      'Schedule hearing (presiding member)',
  'hold-hearing':          'Record hearing held (presiding member)',
  'begin-analysis':        'Begin analysis (panel)',
  'draft-response':        'Draft consolidated response (panel)',
  'adopt-decision':        'Adopt decision (Council)',
  'place-on-hold':         'Place on hold (legal review)',
  'resume':                'Resume after hold',
  'withdraw-notice':       'Withdraw notice (regulator)',
  'cancel':                'Cancel (admin)',
};

const TERMINAL_STATES: ChainStatus[] = ['adopted', 'withdrawn', 'cancelled'];

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function ConsultationNoticeChainTab() {
  const [rows, setRows] = useState<NoticeRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<NoticeRow | null>(null);
  const [events, setEvents] = useState<NoticeEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: NoticeRow[] } & KpiSummary }>('/consultation-notice/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
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

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: NoticeRow; events: NoticeEvent[] } }>(
        `/consultation-notice/chain/${id}`,
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load consultation history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable_flag;
      if (filter === 'binding')    return r.is_binding_class_flag;
      if (filter === 'minor' || filter === 'standard' || filter === 'material' || filter === 'landmark') {
        return r.consultation_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: NoticeRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'publish-notice') {
        const basis = window.prompt('Publish basis — notice gazetted ahead of comment period:');
        if (!basis) return;
        const gz = window.prompt('Gazette number (e.g. GG-49801):', row.gazette_number || '') || '';
        body = { publish_basis: basis };
        if (gz) body.gazette_number = gz;
      } else if (action === 'open-comment-period') {
        const basis = window.prompt('Open basis — opening the public comment period:');
        if (!basis) return;
        const start = window.prompt('Comment period start (ISO datetime, blank = now):') || '';
        const end = window.prompt('Comment period end (ISO datetime, blank = +statutory):') || '';
        body = { open_basis: basis };
        if (start) body.comment_period_start_at = start;
        if (end) body.comment_period_end_at = end;
      } else if (action === 'extend-comment-period') {
        const basis = window.prompt('Extension basis — extending the open comment period:');
        if (!basis) return;
        const newEnd = window.prompt('New comment period end (ISO datetime):') || '';
        body = { extension_basis: basis };
        if (newEnd) body.comment_period_end_at = newEnd;
      } else if (action === 'close-comment-period') {
        const basis = window.prompt('Close basis — comment period closed:');
        if (!basis) return;
        const received = window.prompt('Comments received count (total):', String(row.comments_received_count || 0));
        body = { close_basis: basis };
        if (received && !Number.isNaN(Number(received))) body.comments_received_count = Number(received);
      } else if (action === 'reopen-for-comment') {
        const basis = window.prompt('Reopen basis — comment period reopened (e.g. new material received):');
        if (!basis) return;
        const newEnd = window.prompt('New comment period end (ISO datetime):') || '';
        body = { open_basis: basis };
        if (newEnd) body.comment_period_end_at = newEnd;
      } else if (action === 'schedule-hearing') {
        const basis = window.prompt('Hearing-schedule basis:');
        if (!basis) return;
        const at = window.prompt('Hearing date+time (ISO datetime):') || '';
        const venue = window.prompt('Hearing venue:', row.hearing_venue || '') || '';
        const presiding = window.prompt('Presiding member:', row.presiding_member_name || '') || '';
        body = { hearing_basis: basis };
        if (at) body.hearing_scheduled_at = at;
        if (venue) body.hearing_venue = venue;
        if (presiding) body.presiding_member_name = presiding;
      } else if (action === 'hold-hearing') {
        const basis = window.prompt('Hearing-held basis — record the public hearing held:');
        if (!basis) return;
        const at = window.prompt('Hearing held at (ISO datetime, blank = now):') || '';
        body = { hearing_basis: basis };
        if (at) body.hearing_held_at = at;
      } else if (action === 'begin-analysis') {
        const basis = window.prompt('Analysis basis — secretariat begins consolidated analysis of submissions:');
        if (!basis) return;
        body = { analysis_basis: basis };
      } else if (action === 'draft-response') {
        const basis = window.prompt('Response basis — consolidated response with reasons drafted:');
        if (!basis) return;
        const ref = window.prompt('Response document reference (e.g. NRD-2026-007-RD):', row.response_document_ref || '') || '';
        body = { response_basis: basis };
        if (ref) body.response_document_ref = ref;
      } else if (action === 'adopt-decision') {
        const basis = window.prompt('Adoption basis — Council adopts the decision:');
        if (!basis) return;
        const ref = window.prompt('Adopted decision reference (e.g. NRD-2026-007-DEC):', row.adopted_decision_ref || '') || '';
        const reasons = window.prompt('Decision reasons (short summary):', row.decision_reasons || '') || '';
        body = { adoption_basis: basis };
        if (ref) body.adopted_decision_ref = ref;
        if (reasons) body.decision_reasons = reasons;
      } else if (action === 'place-on-hold') {
        const basis = window.prompt('Hold basis — pause the consultation (legal review or material change):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. legal_review):', 'legal_review') || '';
        body = { hold_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'resume') {
        const basis = window.prompt('Resume basis — exit hold, return to analysis:');
        if (!basis) return;
        body = { analysis_basis: basis };
      } else if (action === 'withdraw-notice') {
        const basis = window.prompt('Withdrawal basis — NERSA pulls the consultation (TRANSPARENCY — always reportable):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. duplicate / superseded / public_interest):', 'superseded') || '';
        body = { withdrawal_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'cancel') {
        const basis = window.prompt('Cancellation basis — admin cancel (drafting error / duplicate):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. drafting_error / duplicate):', 'drafting_error') || '';
        body = { cancellation_basis: basis };
        if (reason) body.reason_code = reason;
      }
      await api.post(`/consultation-notice/chain/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action}`);
    }
  }, [load, loadEvents, selected]);

  return (
    <div className="p-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Consultation notice &amp; public-comment period</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage NERSA public-engagement chain (ERA 4/2006 s.10 · PAJA 3/2000 s.4 · NERSA Rules of Procedure) ·
            drafted → published → open for comment → comments closed → analysis → response drafted → adopted. Optional
            hearing branch (comments closed → hearing scheduled → hearing held → analysis), an on-hold pause for legal
            review (resume → analysis), and withdraw / cancel terminals. This is the DUE-PROCESS engine that PRECEDES
            every NERSA disposition (W31) and every tariff determination (W43). INVERTED SLA: the larger the
            consultation, the longer every window (landmark policy reform gets 60+ days; minor reporting rule gets the
            shortest). Live consultation-health battery on every record (balance index across stakeholder buckets,
            representativeness across provinces/sectors, coverage of questions, statutory-period validity flag,
            judicial-review risk score) — beats ACER/FERC/Ofgem/AER/BEREC linear consultation portals. The W83 SIGNATURE
            is TRANSPARENCY: withdraw_notice crosses regulator EVERY tier (pulling a published consultation is always
            notifiable to PAJA/Council), adopt_decision crosses EVERY tier when binding-class else material+landmark
            only, extend_comment_period + sla_breached cross material+landmark only.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Adopted" value={kpis?.adopted_count ?? 0} tone="ok" />
        <Kpi label="On hold" value={kpis?.on_hold_count ?? 0} tone={(kpis?.on_hold_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Withdrawn" value={kpis?.withdrawn_count ?? 0} tone={(kpis?.withdrawn_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Binding" value={kpis?.binding_count ?? 0} />
        <Kpi label="Comments" value={fmtCount(kpis?.total_comments ?? 0)} />
        <Kpi label="Extensions" value={kpis?.total_extensions ?? 0} />
        <Kpi label="Judicial-risk≥50" value={kpis?.high_judicial_risk_count ?? 0} tone={(kpis?.high_judicial_risk_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Procedurally invalid" value={kpis?.procedurally_invalid_count ?? 0} tone={(kpis?.procedurally_invalid_count ?? 0) > 0 ? 'bad' : 'ok'} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#0c2a4d] text-white'
                : 'bg-white text-[#4a5568] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">{err}</div>
      )}
      {loading ? (
        <div className="rounded border border-[#d8dde6] bg-white px-4 py-6 text-center text-sm text-[#4a5568]">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded border border-[#d8dde6] bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-[#f3f5f9]">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Notice #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Title</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Kind</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Class</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Comments</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Balance</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Risk</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.consultation_tier];
                const balPct = Math.round((r.balance_index_live ?? 0) * 100);
                const risk = r.judicial_review_risk_score_live ?? 0;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.notice_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to NERSA Council">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[220px] truncate" title={r.notice_title}>
                      {r.notice_title}
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{KIND_LABEL[r.consultation_kind]}</td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      {CLASS_LABEL[r.consultation_class]}
                      {r.is_binding_class_flag && <span className="ml-1 text-[#9b1f1f]" title="Binding determination">⚖</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtCount(r.comments_received_count_live ?? r.comments_received_count)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${balPct < 40 ? 'text-[#a06200]' : 'text-[#155724]'}`}>{balPct}%</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${risk >= 50 ? 'text-[#9b1f1f] font-medium' : 'text-[#4a5568]'}`}>{risk}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-[#4a5568]">No consultations match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0c2a4d';
  return (
    <div className="rounded border border-[#d8dde6] bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct,
}: {
  row: NoticeRow;
  events: NoticeEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: NoticeRow) => void;
}) {
  const primary = PRIMARY_ACTION_FOR_STATE[row.chain_status];
  const canExtend = row.chain_status === 'open_for_comment';
  const canReopen = row.chain_status === 'comment_period_closed';
  const canScheduleHearing = row.chain_status === 'comment_period_closed';
  const canHold = !TERMINAL_STATES.includes(row.chain_status) && row.chain_status !== 'on_hold' && row.chain_status !== 'drafted';
  const canWithdraw = !TERMINAL_STATES.includes(row.chain_status) && row.chain_status !== 'drafted';
  const canCancel = row.chain_status === 'drafted' || row.chain_status === 'published';
  const balPct = Math.round((row.balance_index_live ?? 0) * 100);
  const repPct = Math.round((row.representativeness_index_live ?? 0) * 100);
  const risk = row.judicial_review_risk_score_live ?? 0;

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[760px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.notice_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.notice_title}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.consultation_tier].label} · {KIND_LABEL[row.consultation_kind]} · {CLASS_LABEL[row.consultation_class]}
                {row.is_binding_class_flag ? ' · binding' : ''}
                {row.era_section ? ` · ${row.era_section}` : ''}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                Affected parties est. {row.affected_parties_estimate.toLocaleString('en-ZA')} ·
                comments received {row.comments_received_count_live ?? row.comments_received_count} ·
                extensions {row.extension_count_live ?? row.extension_count}
                {row.escalation_level > 0 ? ` · escalation lvl ${row.escalation_level}` : ''}
              </div>
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Live consultation-health battery</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            <Pair label="Balance index" value={`${balPct}%`} />
            <Pair label="Representativeness" value={`${repPct}%`} />
            <Pair label="Coverage" value={`${row.coverage_completeness_pct_live ?? 0}%`} />
            <Pair label="Judicial-review risk" value={`${risk} / 100`} />
            <Pair label="Procedural validity" value={row.procedural_validity_flag_live ? 'OK' : 'AT-RISK'} />
            <Pair label="Days in comment period" value={row.days_in_comment_period_live != null ? `${row.days_in_comment_period_live}d` : '—'} />
            <Pair label="Days until close" value={row.days_until_deadline_live != null ? `${row.days_until_deadline_live}d` : '—'} />
            <Pair label="Predicted total" value={`${row.predicted_consultation_days_live ?? 0}d`} />
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Stakeholder mix</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-[12px]">
            <Pair label="Industry" value={fmtCount(row.industry_comments_count)} />
            <Pair label="Consumer" value={fmtCount(row.consumer_comments_count)} />
            <Pair label="Civil society" value={fmtCount(row.civil_society_comments_count)} />
            <Pair label="IPP" value={fmtCount(row.ipp_comments_count)} />
            <Pair label="Government" value={fmtCount(row.government_comments_count)} />
            <Pair label="Provinces" value={`${row.provinces_represented} / 9`} />
            <Pair label="Sectors" value={`${row.sectors_represented} / 8`} />
            <Pair label="Questions" value={`${row.questions_answered} / ${row.questions_total}`} />
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Lifecycle</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State" value={STATE_TONE[row.chain_status].label} />
            <Pair label="Gazette" value={row.gazette_number ?? '—'} />
            <Pair label="Gazette published" value={fmtDate(row.gazette_publication_at)} />
            <Pair label="Statutory minimum days" value={row.comment_period_minimum_days != null ? `${row.comment_period_minimum_days}d` : '—'} />
            <Pair label="Comment period start" value={fmtDate(row.comment_period_start_at)} />
            <Pair label="Comment period end" value={fmtDate(row.comment_period_end_at)} />
            <Pair label="Hearing scheduled for" value={fmtDate(row.hearing_scheduled_at)} />
            <Pair label="Hearing venue" value={row.hearing_venue ?? '—'} />
            <Pair label="Hearing held" value={fmtDate(row.hearing_held_at)} />
            <Pair label="Presiding member" value={row.presiding_member_name ?? '—'} />
            <Pair label="Response doc" value={row.response_document_ref ?? '—'} />
            <Pair label="Adopted decision" value={row.adopted_decision_ref ?? '—'} />
            <Pair label="Drafted" value={fmtDate(row.drafted_at)} />
            <Pair label="Published" value={fmtDate(row.published_at)} />
            <Pair label="Opened" value={fmtDate(row.open_for_comment_at)} />
            <Pair label="Closed" value={fmtDate(row.comment_period_closed_at)} />
            <Pair label="Analysis at" value={fmtDate(row.analysis_at)} />
            <Pair label="Response drafted" value={fmtDate(row.response_drafted_at)} />
            <Pair label="Adopted at" value={fmtDate(row.adopted_at)} />
            <Pair label="On hold at" value={fmtDate(row.on_hold_at)} />
            <Pair label="Withdrawn at" value={fmtDate(row.withdrawn_at)} />
            <Pair label="Cancelled at" value={fmtDate(row.cancelled_at)} />
            <Pair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status" value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Reportable" value={row.is_reportable_flag ? 'Yes' : 'No'} />
            <Pair label="Reason code" value={row.reason_code ?? '—'} />
          </div>
          {row.consultation_summary && (
            <BasisBlock label="Consultation summary" tone="#1a3a5c" text={row.consultation_summary} />
          )}
          {row.decision_reasons && (
            <BasisBlock label="Decision reasons" tone="#155724" text={row.decision_reasons} />
          )}
          {row.draft_basis && <BasisBlock label="Draft basis" tone="#1a3a5c" text={row.draft_basis} />}
          {row.publish_basis && <BasisBlock label="Publish basis" tone="#1a3a5c" text={row.publish_basis} />}
          {row.open_basis && <BasisBlock label="Open basis" tone="#1a3a5c" text={row.open_basis} />}
          {row.extension_basis && <BasisBlock label="Extension basis" tone="#a06200" text={row.extension_basis} />}
          {row.close_basis && <BasisBlock label="Close basis" tone="#1a3a5c" text={row.close_basis} />}
          {row.hearing_basis && <BasisBlock label="Hearing basis" tone="#1a3a5c" text={row.hearing_basis} />}
          {row.analysis_basis && <BasisBlock label="Analysis basis" tone="#1a3a5c" text={row.analysis_basis} />}
          {row.response_basis && <BasisBlock label="Response basis" tone="#1a3a5c" text={row.response_basis} />}
          {row.adoption_basis && <BasisBlock label="Adoption basis" tone="#155724" text={row.adoption_basis} />}
          {row.hold_basis && <BasisBlock label="Hold basis" tone="#a06200" text={row.hold_basis} />}
          {row.withdrawal_basis && <BasisBlock label="Withdrawal basis" tone="#9b1f1f" text={row.withdrawal_basis} />}
          {row.cancellation_basis && <BasisBlock label="Cancellation basis" tone="#6b1f1f" text={row.cancellation_basis} />}
        </section>

        {(primary || canExtend || canReopen || canScheduleHearing || canHold || canWithdraw || canCancel) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {primary && (
                <button
                  onClick={() => onAct(primary, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[primary]}
                </button>
              )}
              {canExtend && (
                <button
                  onClick={() => onAct('extend-comment-period', row)}
                  className="rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  {ACTION_LABEL['extend-comment-period']}
                </button>
              )}
              {canReopen && (
                <button
                  onClick={() => onAct('reopen-for-comment', row)}
                  className="rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  {ACTION_LABEL['reopen-for-comment']}
                </button>
              )}
              {canScheduleHearing && (
                <button
                  onClick={() => onAct('schedule-hearing', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1a3a5c] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['schedule-hearing']}
                </button>
              )}
              {canHold && (
                <button
                  onClick={() => onAct('place-on-hold', row)}
                  className="rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  {ACTION_LABEL['place-on-hold']}
                </button>
              )}
              {canWithdraw && (
                <button
                  onClick={() => onAct('withdraw-notice', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['withdraw-notice']}
                </button>
              )}
              {canCancel && (
                <button
                  onClick={() => onAct('cancel', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL['cancel']}
                </button>
              )}
            </div>
          </section>
        )}

        <section className="px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Audit timeline</div>
          {events.length === 0 ? (
            <div className="text-[12px] text-[#4a5568]">No events yet.</div>
          ) : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#0c2a4d]">{e.event_type}</span>
                    <span className="text-[#4a5568] tabular-nums">{fmtDate(e.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    {(e.from_status || e.to_status) && (
                      <span className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</span>
                    )}
                    {e.actor_party && (
                      <span className="rounded bg-[#eef1f6] px-1.5 py-0.5 text-[10px] font-medium text-[#4a5568]">{e.actor_party}</span>
                    )}
                  </div>
                  {e.notes && <div className="mt-1 text-[#1a3a5c]">{e.notes}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function BasisBlock({ label, tone, text }: { label: string; tone: string; text: string }) {
  return (
    <div className="mt-3 text-[12px]">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: tone }}>{label}</div>
      <div className="whitespace-pre-wrap" style={{ color: tone }}>{text}</div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}
