// Wave 33 — Regulator Licence Renewal / Amendment chain.
//
// 11-state lifecycle for NERSA-issued energy licence renewals under
// Electricity Regulation Act 2006 s.14-s.16. Forward path:
//   renewal_initiated → application_filed → completeness_check →
//   public_consultation → evaluation → decision_drafted → council_voted →
//   granted / amended / refused
// Branch terminal:
//   withdrawn — applicant withdrew before Council vote
//
// INVERTED class SLA — generation_utility gets MOST time (network impact +
// financial diligence + s10 consultation); trading gets LEAST. Evaluation
// for utility anchors at 180 days (s14(2)(b) 6-month statutory window).
// Reportability: refused crosses ALL classes; granted+amended cross only
// for generation_utility; sla_breached crosses ALL (s14(2)(b) hard line).
// Split-write: NERSA officer drives 9 of 11 actions; licensee does
// file_application + withdraw.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'renewal_initiated' | 'application_filed' | 'completeness_check'
  | 'public_consultation' | 'evaluation' | 'decision_drafted' | 'council_voted'
  | 'granted' | 'amended' | 'refused' | 'withdrawn';

type LicenceClass =
  | 'generation_utility' | 'generation_embedded' | 'generation_sseg'
  | 'distribution' | 'trading';

type LicenceType = 'generation' | 'distribution' | 'trading';

interface RenewalRow {
  id: string;
  case_number: string;
  licence_id: string;
  licence_number: string | null;
  licence_type: LicenceType;
  licence_class: LicenceClass;
  capacity_mw: number | null;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  applicant_party_id: string;
  applicant_party_name: string;
  facility_name: string | null;
  facility_province: string | null;
  current_expiry_date: string;
  requested_expiry_date: string | null;
  granted_expiry_date: string | null;
  application_pack_ref: string | null;
  completeness_findings: string | null;
  completeness_ref: string | null;
  consultation_notice_ref: string | null;
  consultation_responses_count: number | null;
  technical_findings: string | null;
  technical_evaluation_ref: string | null;
  financial_findings: string | null;
  financial_evaluation_ref: string | null;
  decision_rod_ref: string | null;
  council_meeting_ref: string | null;
  council_vote_outcome: string | null;
  conditions_attached: string | null;
  amendment_summary: string | null;
  refusal_grounds: string | null;
  withdrawal_basis: string | null;
  withdrawal_minute_ref: string | null;
  appeal_filed: number;
  appeal_filing_ref: string | null;
  tribunal_case_ref: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: ChainStatus;
  initiated_at: string;
  application_filed_at: string | null;
  completeness_checked_at: string | null;
  consultation_opened_at: string | null;
  evaluation_started_at: string | null;
  decision_drafted_at: string | null;
  council_voted_at: string | null;
  granted_at: string | null;
  amended_at: string | null;
  refused_at: string | null;
  withdrawn_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  is_reportable?: boolean;
  breach_crosses_regulator?: boolean;
  sla_window_minutes?: number;
  created_by: string;
  created_at: string;
}

interface RenewalEvent {
  id: string;
  renewal_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  renewal_initiated:   { bg: '#e3e7ec', fg: '#557',    label: 'Initiated' },
  application_filed:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Filed' },
  completeness_check:  { bg: '#fff4d6', fg: '#a06200', label: 'Completeness' },
  public_consultation: { bg: '#fbe7d0', fg: '#7a4500', label: 'Consultation' },
  evaluation:          { bg: '#dbecfb', fg: '#1a3a5c', label: 'Evaluation' },
  decision_drafted:    { bg: '#fff4d6', fg: '#a06200', label: 'Decision drafted' },
  council_voted:       { bg: '#daf5e2', fg: '#1f6b3a', label: 'Council voted' },
  granted:             { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Granted' },
  amended:             { bg: '#dbcffb', fg: '#3a1a5c', label: 'Amended' },
  refused:             { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Refused' },
  withdrawn:           { bg: '#e0e0e0', fg: '#555555', label: 'Withdrawn' },
};

const CLASS_TONE: Record<LicenceClass, { bg: string; fg: string; label: string }> = {
  generation_utility:  { bg: '#fde0e0', fg: '#9b1f1f', label: 'Gen · utility' },
  generation_embedded: { bg: '#fff4d6', fg: '#a06200', label: 'Gen · embedded' },
  generation_sseg:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Gen · SSEG' },
  distribution:        { bg: '#dbecfb', fg: '#1a3a5c', label: 'Distribution' },
  trading:             { bg: '#dbcffb', fg: '#3a1a5c', label: 'Trading' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',              label: 'Active' },
  { key: 'all',                 label: 'All' },
  { key: 'reportable',          label: 'NERSA reportable' },
  { key: 'appeal',              label: 'Appeals filed' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'generation_utility',  label: 'Utility (≥100MW)' },
  { key: 'generation_embedded', label: 'Embedded (1-100MW)' },
  { key: 'generation_sseg',     label: 'SSEG (<1MW)' },
  { key: 'distribution',        label: 'Distribution' },
  { key: 'trading',             label: 'Trading' },
  { key: 'renewal_initiated',   label: 'Initiated' },
  { key: 'application_filed',   label: 'Filed' },
  { key: 'completeness_check',  label: 'Completeness' },
  { key: 'public_consultation', label: 'Consultation' },
  { key: 'evaluation',          label: 'Evaluation' },
  { key: 'decision_drafted',    label: 'Decision drafted' },
  { key: 'council_voted',       label: 'Council voted' },
  { key: 'granted',             label: 'Granted' },
  { key: 'amended',             label: 'Amended' },
  { key: 'refused',             label: 'Refused' },
  { key: 'withdrawn',           label: 'Withdrawn' },
];

type ActionKind =
  | 'file-application' | 'check-completeness' | 'open-consultation'
  | 'start-evaluation' | 'draft-decision' | 'council-vote'
  | 'grant' | 'amend' | 'refuse' | 'withdraw';

// Each state has ONE primary next-step action.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  renewal_initiated:   'file-application',
  application_filed:   'check-completeness',
  completeness_check:  'open-consultation',
  public_consultation: 'start-evaluation',
  evaluation:          'draft-decision',
  decision_drafted:    'council-vote',
  council_voted:       'grant',
  granted:             null,
  amended:             null,
  refused:             null,
  withdrawn:           null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'file-application':   'File application pack (applicant)',
  'check-completeness': 'Check completeness (NERSA)',
  'open-consultation':  'Open s10 public consultation',
  'start-evaluation':   'Start technical + financial evaluation',
  'draft-decision':     'Draft Record of Decision',
  'council-vote':       'Tabulate Council vote',
  'grant':              'Grant renewal (Council)',
  'amend':              'Amend with conditions (Council)',
  'refuse':             'Refuse (Council)',
  'withdraw':           'Withdraw application (applicant)',
};

// Council vote → grant / amend / refuse branching.
const COUNCIL_BRANCHES: ChainStatus[] = ['council_voted'];

// Pre-Council withdrawal window.
const WITHDRAWABLE: ChainStatus[] = [
  'renewal_initiated', 'application_filed', 'completeness_check',
  'public_consultation', 'evaluation', 'decision_drafted',
];

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

function fmtDay(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('en-ZA', { dateStyle: 'medium' });
}

function fmtMw(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(2)} GW`;
  if (n >= 1) return `${n.toFixed(1)} MW`;
  return `${(n * 1000).toFixed(0)} kW`;
}

interface KpiSummary {
  total: number;
  open_count: number;
  granted_count: number;
  amended_count: number;
  refused_count: number;
  withdrawn_count: number;
  appeal_count: number;
  breached: number;
  reportable_total: number;
  utility_open: number;
  distribution_open: number;
}

export function LicenceRenewalChainTab() {
  const [rows, setRows] = useState<RenewalRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<RenewalRow | null>(null);
  const [events, setEvents] = useState<RenewalEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: RenewalRow[] } & KpiSummary }>('/licence/renewal/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          open_count: data.open_count || 0,
          granted_count: data.granted_count || 0,
          amended_count: data.amended_count || 0,
          refused_count: data.refused_count || 0,
          withdrawn_count: data.withdrawn_count || 0,
          appeal_count: data.appeal_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          utility_open: data.utility_open || 0,
          distribution_open: data.distribution_open || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load licence renewal chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: RenewalRow; events: RenewalEvent[] } }>(`/licence/renewal/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load case history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'appeal')     return r.appeal_filed > 0;
      if (
        filter === 'generation_utility' || filter === 'generation_embedded' ||
        filter === 'generation_sseg' || filter === 'distribution' || filter === 'trading'
      ) {
        return r.licence_class === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, open_count: 0, granted_count: 0, amended_count: 0, refused_count: 0,
    withdrawn_count: 0, appeal_count: 0, breached: 0, reportable_total: 0,
    utility_open: 0, distribution_open: 0,
  };

  const act = useCallback(async (action: ActionKind, row: RenewalRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'file-application') {
        const ref = window.prompt('Application pack reference (eg "APP-PACK-KSL-U6-2026"):');
        if (!ref) return;
        body.application_pack_ref = ref;
        const req = window.prompt('Requested new expiry date (YYYY-MM-DD):', row.requested_expiry_date ?? '');
        if (req) body.requested_expiry_date = req;
      } else if (action === 'check-completeness') {
        const findings = window.prompt('Completeness findings (gap list / OK):');
        if (!findings) return;
        body.completeness_findings = findings;
        const ref = window.prompt('Completeness review reference (eg "COMP-REV-KSL-U6-2026"):');
        if (ref) body.completeness_ref = ref;
      } else if (action === 'open-consultation') {
        const ref = window.prompt('Public consultation notice reference (eg "GG-NOTICE-2026-1840"):');
        if (!ref) return;
        body.consultation_notice_ref = ref;
      } else if (action === 'start-evaluation') {
        const tech = window.prompt('Technical evaluation findings:');
        if (!tech) return;
        body.technical_findings = tech;
        const tref = window.prompt('Technical evaluation reference (eg "TECH-EVAL-KSL-U6-2026"):');
        if (tref) body.technical_evaluation_ref = tref;
        const fin = window.prompt('Financial evaluation findings:');
        if (fin) body.financial_findings = fin;
        const fref = window.prompt('Financial evaluation reference (optional):');
        if (fref) body.financial_evaluation_ref = fref;
      } else if (action === 'draft-decision') {
        const ref = window.prompt('Record of Decision reference (eg "ROD-KSL-U6-2026-DRAFT-V1"):');
        if (!ref) return;
        body.decision_rod_ref = ref;
      } else if (action === 'council-vote') {
        const mref = window.prompt('Council meeting reference (eg "NERSA-COUNCIL-2026-08-MIN"):');
        if (!mref) return;
        body.council_meeting_ref = mref;
        const outcome = window.prompt('Council vote outcome (eg "8/9 in favour, 1 abstention"):');
        if (outcome) body.council_vote_outcome = outcome;
      } else if (action === 'grant') {
        const exp = window.prompt('Granted expiry date (YYYY-MM-DD):', row.requested_expiry_date ?? '');
        if (!exp) return;
        body.granted_expiry_date = exp;
      } else if (action === 'amend') {
        const exp = window.prompt('Granted expiry date (YYYY-MM-DD):', row.requested_expiry_date ?? '');
        if (!exp) return;
        body.granted_expiry_date = exp;
        const cond = window.prompt('Conditions attached (newline-separated):');
        if (!cond) return;
        body.conditions_attached = cond;
        const amend = window.prompt('Amendment summary:');
        if (amend) body.amendment_summary = amend;
      } else if (action === 'refuse') {
        const grounds = window.prompt('Refusal grounds (Council motivation):');
        if (!grounds) return;
        body.refusal_grounds = grounds;
        const appeal = window.prompt('Tribunal appeal filing reference (if anticipated, optional):');
        if (appeal) body.appeal_filing_ref = appeal;
        const tribunal = window.prompt('Tribunal case reference (if known, optional):');
        if (tribunal) body.tribunal_case_ref = tribunal;
        const reason = window.prompt('Reason code (eg "FIN_INSOLVENCY", "TECH_DEFICIENT"):');
        if (reason) body.reason_code = reason;
        const rod = window.prompt('ROD notes (full refusal rationale):');
        if (!rod) return;
        body.rod_notes = rod;
      } else if (action === 'withdraw') {
        const basis = window.prompt('Withdrawal basis (applicant rationale):');
        if (!basis) return;
        body.withdrawal_basis = basis;
        const min = window.prompt('Withdrawal minute reference (optional):');
        if (min) body.withdrawal_minute_ref = min;
        const reason = window.prompt('Reason code (eg "PROJECT_CANCELLED", "REFILED"):');
        if (reason) body.reason_code = reason;
      }
      await api.post(`/licence/renewal/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Licence Renewal / Amendment — NERSA s.14-s.16</h2>
          <p className="text-xs text-[#4a5568]">
            11-state P6 lifecycle for every generation / distribution / trading
            licence renewal under the Electricity Regulation Act 2006: initiated →
            filed → completeness → s10 public consultation → technical + financial
            evaluation → ROD draft → Council vote → granted / amended / refused
            (with withdrawn branch). INVERTED class SLA — generation_utility gets
            the longest 180-day evaluation (s14(2)(b) statutory window); trading
            and SSEG compressed. NERSA Council crossings: refused for ALL classes;
            granted + amended for utility-scale only; SLA breach for ALL classes
            (statutory hard line). Split-write: NERSA officer drives 9 of 11
            actions; licensee files application + may withdraw pre-Council.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"          value={kpis.total} />
        <Kpi label="Open"           value={kpis.open_count}     tone={kpis.open_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Granted"        value={kpis.granted_count} />
        <Kpi label="Amended"        value={kpis.amended_count} />
        <Kpi label="Refused"        value={kpis.refused_count}  tone={kpis.refused_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Withdrawn"      value={kpis.withdrawn_count} />
        <Kpi label="SLA breached"   value={kpis.breached}       tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Appeals"        value={kpis.appeal_count}   tone={kpis.appeal_count > 0 ? 'bad' : 'ok'} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Utility open: <span className="font-semibold text-[#a06200]">{kpis.utility_open}</span></span>
        <span>Distribution open: <span className="font-semibold text-[#1a3a5c]">{kpis.distribution_open}</span></span>
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Case #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Licence</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Applicant / Facility</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Class</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Capacity</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Expiry</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const cl = CLASS_TONE[r.licence_class];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">{r.case_number}</td>
                    <td className="px-3 py-2 font-mono text-[#1a3a5c]">{r.licence_number ?? '—'}</td>
                    <td className="px-3 py-2 text-[#1a3a5c] max-w-[260px]">
                      <div className="font-medium truncate" title={r.applicant_party_name}>{r.applicant_party_name}</div>
                      <div className="text-[10px] text-[#6b7685] truncate" title={r.facility_name ?? ''}>{r.facility_name ?? '—'}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cl.bg, color: cl.fg }}>
                        {cl.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{fmtMw(r.capacity_mw)}</td>
                    <td className="px-3 py-2 text-[#4a5568] text-[11px]">
                      <div>cur: {fmtDay(r.current_expiry_date)}</div>
                      {r.granted_expiry_date ? (
                        <div className="text-[#1f5b3a]">→ {fmtDay(r.granted_expiry_date)}</div>
                      ) : r.requested_expiry_date ? (
                        <div className="text-[#a06200]">req: {fmtDay(r.requested_expiry_date)}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[#4a5568]">No licence renewal cases match.</td></tr>
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
  row: RenewalRow;
  events: RenewalEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: RenewalRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const isCouncilBranch = COUNCIL_BRANCHES.includes(row.chain_status);
  const canWithdraw = WITHDRAWABLE.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.case_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">
                {row.licence_number ?? '—'} — {row.applicant_party_name}
              </div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {CLASS_TONE[row.licence_class].label} · {fmtMw(row.capacity_mw)} · {row.facility_name ?? '—'}
                {row.facility_province ? ` · ${row.facility_province}` : ''}
              </div>
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Licence ID"            value={row.licence_id} />
            <Pair label="Licence number"        value={row.licence_number ?? '—'} />
            <Pair label="Licence type"          value={row.licence_type} />
            <Pair label="Class"                 value={CLASS_TONE[row.licence_class].label} />
            <Pair label="Capacity"              value={fmtMw(row.capacity_mw)} />
            <Pair label="Current expiry"        value={fmtDay(row.current_expiry_date)} />
            <Pair label="Requested expiry"      value={fmtDay(row.requested_expiry_date)} />
            <Pair label="Granted expiry"        value={fmtDay(row.granted_expiry_date)} />
            <Pair label="Application pack"      value={row.application_pack_ref ?? '—'} />
            <Pair label="Completeness ref"      value={row.completeness_ref ?? '—'} />
            <Pair label="Consultation notice"   value={row.consultation_notice_ref ?? '—'} />
            <Pair label="Consultation responses" value={String(row.consultation_responses_count ?? 0)} />
            <Pair label="Tech eval ref"         value={row.technical_evaluation_ref ?? '—'} />
            <Pair label="Financial eval ref"    value={row.financial_evaluation_ref ?? '—'} />
            <Pair label="Decision ROD ref"      value={row.decision_rod_ref ?? '—'} />
            <Pair label="Council meeting"       value={row.council_meeting_ref ?? '—'} />
            <Pair label="Council vote outcome"  value={row.council_vote_outcome ?? '—'} />
            <Pair label="Appeal filed"          value={row.appeal_filed > 0 ? 'YES' : 'no'} />
            <Pair label="Appeal filing ref"     value={row.appeal_filing_ref ?? '—'} />
            <Pair label="Tribunal case ref"     value={row.tribunal_case_ref ?? '—'} />
            <Pair label="Source wave"           value={row.source_wave ?? '—'} />
            <Pair label="Source event"          value={row.source_event ?? '—'} />
            <Pair label="Source entity"         value={`${row.source_entity_type ?? '—'} / ${row.source_entity_id ?? '—'}`} />
            <Pair label="Reason code"           value={row.reason_code ?? '—'} />
            <Pair label="State"                 value={STATE_TONE[row.chain_status].label} />
            <Pair label="Escalation level"      value={String(row.escalation_level)} />
            <Pair label="SLA deadline"          value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"            value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Initiated"             value={fmtDate(row.initiated_at)} />
            <Pair label="Filed"                 value={fmtDate(row.application_filed_at)} />
            <Pair label="Council voted"         value={fmtDate(row.council_voted_at)} />
            <Pair label="Granted at"            value={fmtDate(row.granted_at)} />
            <Pair label="Refused at"            value={fmtDate(row.refused_at)} />
          </div>
          {row.completeness_findings && (
            <div className="mt-3 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Completeness findings</div>
              {row.completeness_findings}
            </div>
          )}
          {row.technical_findings && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Technical findings</div>
              {row.technical_findings}
            </div>
          )}
          {row.financial_findings && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Financial findings</div>
              {row.financial_findings}
            </div>
          )}
          {row.conditions_attached && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Conditions attached</div>
              <pre className="whitespace-pre-wrap font-sans">{row.conditions_attached}</pre>
            </div>
          )}
          {row.amendment_summary && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Amendment summary</div>
              {row.amendment_summary}
            </div>
          )}
          {row.refusal_grounds && (
            <div className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              <div className="text-[10px] uppercase tracking-wider text-red-700 mb-1">Refusal grounds</div>
              {row.refusal_grounds}
            </div>
          )}
          {row.withdrawal_basis && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Withdrawal basis</div>
              {row.withdrawal_basis}
            </div>
          )}
          {row.rod_notes && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">ROD notes</div>
              {row.rod_notes}
            </div>
          )}
        </section>

        {(nextAction || isCouncilBranch || canWithdraw) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {isCouncilBranch && (
                <>
                  <button
                    onClick={() => onAct('amend', row)}
                    className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3a1a5c] hover:bg-[#f3f5f9]"
                  >
                    {ACTION_LABEL['amend']}
                  </button>
                  <button
                    onClick={() => onAct('refuse', row)}
                    className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                  >
                    {ACTION_LABEL['refuse']}
                  </button>
                </>
              )}
              {canWithdraw && (
                <button
                  onClick={() => onAct('withdraw', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#557] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['withdraw']}
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
                  {(e.from_status || e.to_status) && (
                    <div className="text-[#4a5568]">
                      {e.from_status ?? '—'} → {e.to_status ?? '—'}{e.actor_party ? ` · by ${e.actor_party}` : ''}
                    </div>
                  )}
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

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}

export default LicenceRenewalChainTab;
