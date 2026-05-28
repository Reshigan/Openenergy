// Wave 49 — Initial Licence Application & Adjudication tab.
//
// NERSA licensing under the Electricity Regulation Act 4 of 2006 §§8–11: the
// front-end grant of a NEW licence to operate a generation, transmission,
// distribution, trading or import/export facility. Where W33 renewal renews /
// amends an EXISTING licence (presuming a holder), THIS chain grants the FIRST
// one — the entry gate to the regulated market.
//
//   application_received → completeness_review → accepted → public_participation
//     → technical_evaluation → council_decision → licence_granted → licence_issued.
//   Info-gap loop: completeness_review → additional_info_requested → (submit) → completeness_review.
//   refused from council_decision; withdrawn from any pre-evaluation state;
//   lapsed from additional_info_requested (non-responsive).
//
// INVERTED SLA — the bigger the licence, the longer every §10 window. Two-party
// write: the applicant files / supplies info / withdraws; the regulator drives
// everything else. Reportability: refusal crosses for EVERY class (denying market
// entry — the W49 signature); a major-licence grant crosses (Council + Gazette);
// material-class SLA breaches cross.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'application_received' | 'completeness_review' | 'additional_info_requested' | 'accepted'
  | 'public_participation' | 'technical_evaluation' | 'council_decision' | 'licence_granted'
  | 'licence_issued' | 'refused' | 'withdrawn' | 'lapsed';

type LicenceClass = 'major_licence' | 'standard_licence' | 'minor_licence';

interface ApplicationRow {
  id: string;
  application_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  applicant_party_id: string;
  applicant_party_name: string;
  regulator_party_id: string;
  regulator_party_name: string;
  licence_class: LicenceClass;
  licence_type: string;
  technology: string | null;
  facility_name: string;
  facility_location: string | null;
  capacity_mw: number | null;
  estimated_capex_zar_m: number | null;
  grid_connection_ref: string | null;
  reipppp_round: string | null;
  application_ref: string | null;
  completeness_ref: string | null;
  info_request_ref: string | null;
  acceptance_ref: string | null;
  participation_ref: string | null;
  evaluation_ref: string | null;
  council_ref: string | null;
  licence_ref: string | null;
  gazette_ref: string | null;
  regulator_ref: string | null;
  application_basis: string | null;
  completeness_basis: string | null;
  info_request_basis: string | null;
  acceptance_basis: string | null;
  participation_basis: string | null;
  evaluation_basis: string | null;
  council_basis: string | null;
  grant_basis: string | null;
  refusal_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  info_request_round: number;
  chain_status: ChainStatus;
  application_received_at: string;
  completeness_review_at: string | null;
  additional_info_requested_at: string | null;
  accepted_at: string | null;
  public_participation_at: string | null;
  technical_evaluation_at: string | null;
  council_decision_at: string | null;
  licence_granted_at: string | null;
  licence_issued_at: string | null;
  refused_at: string | null;
  withdrawn_at: string | null;
  lapsed_at: string | null;
  is_reportable: boolean;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  breach_crosses_regulator?: boolean;
}

interface ApplicationEvent {
  id: string;
  application_id: string;
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
  issued_count: number;
  refused_count: number;
  withdrawn_count: number;
  lapsed_count: number;
  granted_count: number;
  in_evaluation: number;
  breached: number;
  reportable_total: number;
  major_open: number;
  total_capacity_mw: number;
  granted_capacity_mw: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  application_received:      { bg: '#e3e7ec', fg: '#557',    label: 'Received' },
  completeness_review:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Completeness review' },
  additional_info_requested: { bg: '#ffe9d6', fg: '#8a4a00', label: 'Info requested' },
  accepted:                  { bg: '#dbecfb', fg: '#1a3a5c', label: 'Accepted' },
  public_participation:      { bg: '#fff4d6', fg: '#a06200', label: 'Public participation' },
  technical_evaluation:      { bg: '#fff4d6', fg: '#a06200', label: 'Technical evaluation' },
  council_decision:          { bg: '#ffe9d6', fg: '#8a4a00', label: 'Council decision' },
  licence_granted:           { bg: '#daf5e2', fg: '#1f6b3a', label: 'Licence granted' },
  licence_issued:            { bg: '#d4edda', fg: '#155724', label: 'Licence issued' },
  refused:                   { bg: '#fde0e0', fg: '#9b1f1f', label: 'Refused' },
  withdrawn:                 { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
  lapsed:                    { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Lapsed' },
};

const CLASS_TONE: Record<LicenceClass, { bg: string; fg: string; label: string }> = {
  major_licence:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Major' },
  standard_licence: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Standard' },
  minor_licence:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                    label: 'Active' },
  { key: 'all',                       label: 'All' },
  { key: 'major_licence',             label: 'Major' },
  { key: 'standard_licence',          label: 'Standard' },
  { key: 'minor_licence',             label: 'Minor' },
  { key: 'in_evaluation',             label: 'In evaluation' },
  { key: 'granted',                   label: 'Granted / issued' },
  { key: 'breached',                  label: 'SLA breached' },
  { key: 'reportable',                label: 'Reportable' },
  { key: 'application_received',      label: 'Received' },
  { key: 'completeness_review',       label: 'Completeness' },
  { key: 'additional_info_requested', label: 'Info requested' },
  { key: 'accepted',                  label: 'Accepted' },
  { key: 'public_participation',      label: 'Participation' },
  { key: 'technical_evaluation',      label: 'Technical eval' },
  { key: 'council_decision',          label: 'Council' },
  { key: 'licence_granted',           label: 'Granted' },
  { key: 'licence_issued',            label: 'Issued' },
  { key: 'refused',                   label: 'Refused' },
  { key: 'withdrawn',                 label: 'Withdrawn' },
  { key: 'lapsed',                    label: 'Lapsed' },
];

type ActionKind =
  | 'begin-review' | 'request-info' | 'submit-info' | 'accept-application'
  | 'open-participation' | 'begin-evaluation' | 'refer-to-council' | 'grant-licence'
  | 'issue-licence' | 'refuse-licence' | 'withdraw' | 'lapse';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  application_received:      'begin-review',
  completeness_review:       'accept-application',
  additional_info_requested: 'submit-info',
  accepted:                  'open-participation',
  public_participation:      'begin-evaluation',
  technical_evaluation:      'refer-to-council',
  council_decision:          'grant-licence',
  licence_granted:           'issue-licence',
  licence_issued:            null,
  refused:                   null,
  withdrawn:                 null,
  lapsed:                    null,
};

// Functional party per action. Registry (NERSA intake) drives completeness +
// public-process logistics + issuance + lapse; evaluators run the technical /
// financial evaluation; the Energy Regulator (Council) decides grant / refusal;
// the applicant supplies additional information + withdraws.
const ACTION_LABEL: Record<ActionKind, string> = {
  'begin-review':       'Begin completeness review (registry)',
  'request-info':       'Request additional info (registry)',
  'submit-info':        'Submit additional info (applicant)',
  'accept-application': 'Accept for processing (registry)',
  'open-participation': 'Open public participation (registry)',
  'begin-evaluation':   'Begin technical evaluation (evaluator)',
  'refer-to-council':   'Refer to Council (evaluator)',
  'grant-licence':      'Grant licence (Council)',
  'issue-licence':      'Issue licence (registry)',
  'refuse-licence':     'Refuse licence (Council)',
  'withdraw':           'Withdraw application (applicant)',
  'lapse':              'Lapse application (registry)',
};

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

function fmtMw(n: number | null | undefined): string {
  if (!n) return '—';
  return `${n.toLocaleString('en-ZA')} MW`;
}

function fmtZarM(n: number | null | undefined): string {
  if (!n) return '—';
  return `R${n.toLocaleString('en-ZA')}m`;
}

const TERMINAL_STATES: ChainStatus[] = ['licence_issued', 'refused', 'withdrawn', 'lapsed'];
const EVALUATION_STATES: ChainStatus[] = ['technical_evaluation', 'council_decision'];
const GRANTED_STATES: ChainStatus[] = ['licence_granted', 'licence_issued'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['application_received', 'completeness_review', 'additional_info_requested', 'accepted', 'public_participation'];

export function LicenceApplicationChainTab() {
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<ApplicationRow | null>(null);
  const [events, setEvents] = useState<ApplicationEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ApplicationRow[] } & KpiSummary }>('/licence-application/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, issued_count: d.issued_count,
          refused_count: d.refused_count, withdrawn_count: d.withdrawn_count,
          lapsed_count: d.lapsed_count, granted_count: d.granted_count,
          in_evaluation: d.in_evaluation, breached: d.breached, reportable_total: d.reportable_total,
          major_open: d.major_open, total_capacity_mw: d.total_capacity_mw,
          granted_capacity_mw: d.granted_capacity_mw,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load licence applications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: ApplicationRow; events: ApplicationEvent[] } }>(
        `/licence-application/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load application history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')           return true;
      if (filter === 'active')        return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'in_evaluation') return EVALUATION_STATES.includes(r.chain_status);
      if (filter === 'granted')       return GRANTED_STATES.includes(r.chain_status);
      if (filter === 'breached')      return r.sla_breached;
      if (filter === 'reportable')    return r.is_reportable;
      if (filter === 'major_licence' || filter === 'standard_licence' || filter === 'minor_licence') {
        return r.licence_class === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: ApplicationRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'begin-review') {
        const basis = window.prompt('Completeness basis — scope of the section 9 completeness check (application form, technical schedules, financial standing, public-interest schedule):') || '';
        const ref = window.prompt('Completeness reference (e.g. NERSA-COMP-2026-0007):') || '';
        body = { completeness_basis: basis };
        if (ref) body.completeness_ref = ref;
      } else if (action === 'request-info') {
        const basis = window.prompt('Info-request basis — the missing or deficient items the applicant must furnish before processing can continue:');
        if (!basis) return;
        const ref = window.prompt('Info-request reference (e.g. NERSA-RFI-2026-0007):') || '';
        body = { info_request_basis: basis };
        if (ref) body.info_request_ref = ref;
      } else if (action === 'submit-info') {
        const notes = window.prompt('Submission notes — the additional information the applicant has now furnished:');
        if (!notes) return;
        body = { notes };
      } else if (action === 'accept-application') {
        const basis = window.prompt('Acceptance basis — confirm the application is complete and accepted for processing:');
        if (!basis) return;
        const ref = window.prompt('Acceptance reference (e.g. NERSA-ACC-2026-0007):') || '';
        body = { acceptance_basis: basis };
        if (ref) body.acceptance_ref = ref;
      } else if (action === 'open-participation') {
        const basis = window.prompt('Participation basis — scope of the section 10 public-participation process (Gazette notice, written comment, public hearings):');
        if (!basis) return;
        const ref = window.prompt('Participation reference (e.g. NERSA-PUB-2026-0007):') || '';
        body = { participation_basis: basis };
        if (ref) body.participation_ref = ref;
      } else if (action === 'begin-evaluation') {
        const basis = window.prompt('Evaluation basis — scope of the technical / financial / grid-impact evaluation:');
        if (!basis) return;
        const ref = window.prompt('Evaluation reference (e.g. NERSA-EVAL-2026-0007):') || '';
        body = { evaluation_basis: basis };
        if (ref) body.evaluation_ref = ref;
      } else if (action === 'refer-to-council') {
        const basis = window.prompt('Council referral basis — staff recommendation tabled for the Energy Regulator (Council) decision:');
        if (!basis) return;
        const ref = window.prompt('Council reference (e.g. NERSA-CL-2026-0007):') || '';
        body = { council_basis: basis };
        if (ref) body.council_ref = ref;
      } else if (action === 'grant-licence') {
        const basis = window.prompt('Grant basis — Council resolution granting the licence and the conditions attached:');
        if (!basis) return;
        const ref = window.prompt('Council reference (e.g. NERSA-CL-2026-0007):') || '';
        body = { grant_basis: basis };
        if (ref) body.council_ref = ref;
      } else if (action === 'issue-licence') {
        const lic = window.prompt('Licence number issued (e.g. GEN-2026-0142):') || '';
        const gaz = window.prompt('Government Gazette notice reference (e.g. GG-2026-48810):') || '';
        const rod = window.prompt('Record-of-decision notes (optional):') || '';
        body = {};
        if (lic) body.licence_ref = lic;
        if (gaz) body.gazette_ref = gaz;
        if (rod) body.rod_notes = rod;
      } else if (action === 'refuse-licence') {
        const basis = window.prompt('Refusal basis — why the Council refuses the licence (fails fit-and-proper / technical / financial / public-interest test):');
        if (!basis) return;
        body = { refusal_basis: basis, reason_code: 'application_refused' };
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason — why the applicant is withdrawing before evaluation:');
        if (!reason) return;
        body = { reason_code: reason };
      } else if (action === 'lapse') {
        const reason = window.prompt('Lapse reason — the applicant was non-responsive to the information request within the statutory window:') || 'non_responsive';
        body = { reason_code: reason };
      }
      await api.post(`/licence-application/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Initial licence applications &amp; adjudication</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage ERA §§8–11 licence-grant chain · received → completeness review → accepted → public participation →
            technical evaluation → Council decision → granted → issued. NERSA may request additional information mid-review
            (submit to return to completeness); applications are refused at Council; withdrawn by the applicant before
            evaluation; or lapse when an information request goes unanswered. This is the ENTRY gate to the regulated
            market — distinct from W33 renewal which presumes an existing holder. INVERTED SLA: the bigger the licence, the
            longer every §10 window. Refusal crosses to the regulator inbox for EVERY class (denying market entry); a
            major-licence grant and material-class SLA breaches also cross (Electricity Regulation Act 4 of 2006 + NERSA
            §9/§10 + Government Gazette).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Major open" value={kpis?.major_open ?? 0} tone={(kpis?.major_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="In evaluation" value={kpis?.in_evaluation ?? 0} tone={(kpis?.in_evaluation ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Granted / issued" value={kpis?.granted_count ?? 0} tone="ok" />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Issued" value={kpis?.issued_count ?? 0} tone="ok" />
        <Kpi label="Refused" value={kpis?.refused_count ?? 0} tone={(kpis?.refused_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Withdrawn" value={kpis?.withdrawn_count ?? 0} />
        <Kpi label="Lapsed" value={kpis?.lapsed_count ?? 0} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Capacity in pipeline" value={fmtMw(kpis?.total_capacity_mw ?? 0)} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Application #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Applicant / facility</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Class</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Type / tech</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Capacity</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const ct = CLASS_TONE[r.licence_class];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.application_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[240px]">
                      <div className="truncate" title={r.applicant_party_name}>{r.applicant_party_name}</div>
                      <div className="truncate text-[10px] text-[#4a5568]" title={r.facility_name}>{r.facility_name}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: ct.bg, color: ct.fg }}>
                        {ct.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568] capitalize">
                      {r.licence_type.replace(/_/g, ' ')}
                      {r.technology && r.technology !== 'na' && <span className="text-[10px] text-[#4a5568]"> · {r.technology.replace(/_/g, ' ')}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtMw(r.capacity_mw)}</td>
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No licence applications match.</td></tr>
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
  row: ApplicationRow;
  events: ApplicationEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: ApplicationRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canRequestInfo = row.chain_status === 'completeness_review';
  const canRefuse = row.chain_status === 'council_decision';
  const canLapse = row.chain_status === 'additional_info_requested';
  const canWithdraw = WITHDRAWABLE_STATES.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.application_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.applicant_party_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {CLASS_TONE[row.licence_class].label} · {row.licence_type.replace(/_/g, ' ')}
                {row.facility_name ? ` · ${row.facility_name}` : ''}
              </div>
              {row.source_wave && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"               value={STATE_TONE[row.chain_status].label} />
            <Pair label="Class"               value={CLASS_TONE[row.licence_class].label} />
            <Pair label="Licence type"        value={row.licence_type.replace(/_/g, ' ')} />
            <Pair label="Technology"          value={row.technology ? row.technology.replace(/_/g, ' ') : '—'} />
            <Pair label="Facility"            value={row.facility_name} />
            <Pair label="Location"            value={row.facility_location ?? '—'} />
            <Pair label="Capacity"            value={fmtMw(row.capacity_mw)} />
            <Pair label="Estimated capex"     value={fmtZarM(row.estimated_capex_zar_m)} />
            <Pair label="Regulator"           value={row.regulator_party_name} />
            <Pair label="Grid connection ref" value={row.grid_connection_ref ?? '—'} />
            <Pair label="REIPPPP round"       value={row.reipppp_round ?? '—'} />
            <Pair label="Info-request round"  value={String(row.info_request_round)} />
            <Pair label="Completeness ref"    value={row.completeness_ref ?? '—'} />
            <Pair label="Info-request ref"    value={row.info_request_ref ?? '—'} />
            <Pair label="Acceptance ref"      value={row.acceptance_ref ?? '—'} />
            <Pair label="Participation ref"   value={row.participation_ref ?? '—'} />
            <Pair label="Evaluation ref"      value={row.evaluation_ref ?? '—'} />
            <Pair label="Council ref"         value={row.council_ref ?? '—'} />
            <Pair label="Licence ref"         value={row.licence_ref ?? '—'} />
            <Pair label="Gazette ref"         value={row.gazette_ref ?? '—'} />
            <Pair label="Reason code"         value={row.reason_code ?? '—'} />
            <Pair label="Received"            value={fmtDate(row.application_received_at)} />
            <Pair label="Completeness"        value={fmtDate(row.completeness_review_at)} />
            <Pair label="Info requested"      value={fmtDate(row.additional_info_requested_at)} />
            <Pair label="Accepted"            value={fmtDate(row.accepted_at)} />
            <Pair label="Participation"       value={fmtDate(row.public_participation_at)} />
            <Pair label="Technical eval"      value={fmtDate(row.technical_evaluation_at)} />
            <Pair label="Council decision"    value={fmtDate(row.council_decision_at)} />
            <Pair label="Granted"             value={fmtDate(row.licence_granted_at)} />
            <Pair label="Issued"              value={fmtDate(row.licence_issued_at)} />
            <Pair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"          value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"      value={String(row.escalation_level)} />
            <Pair label="Reportable"          value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.application_basis && (
            <BasisBlock label="Application basis" tone="#1a3a5c" text={row.application_basis} />
          )}
          {row.completeness_basis && (
            <BasisBlock label="Completeness basis" tone="#1a3a5c" text={row.completeness_basis} />
          )}
          {row.info_request_basis && (
            <BasisBlock label="Info-request basis" tone="#8a4a00" text={row.info_request_basis} />
          )}
          {row.acceptance_basis && (
            <BasisBlock label="Acceptance basis" tone="#1a3a5c" text={row.acceptance_basis} />
          )}
          {row.participation_basis && (
            <BasisBlock label="Participation basis" tone="#a06200" text={row.participation_basis} />
          )}
          {row.evaluation_basis && (
            <BasisBlock label="Evaluation basis" tone="#a06200" text={row.evaluation_basis} />
          )}
          {row.council_basis && (
            <BasisBlock label="Council basis" tone="#8a4a00" text={row.council_basis} />
          )}
          {row.grant_basis && (
            <BasisBlock label="Grant basis" tone="#1f6b3a" text={row.grant_basis} />
          )}
          {row.refusal_basis && (
            <BasisBlock label="Refusal basis" tone="#9b1f1f" text={row.refusal_basis} />
          )}
          {row.rod_notes && (
            <BasisBlock label="Record of decision" tone="#155724" text={row.rod_notes} />
          )}
        </section>

        {(nextAction || canRequestInfo || canRefuse || canLapse || canWithdraw) && (
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
              {canRequestInfo && (
                <button
                  onClick={() => onAct('request-info', row)}
                  className="rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  {ACTION_LABEL['request-info']}
                </button>
              )}
              {canRefuse && (
                <button
                  onClick={() => onAct('refuse-licence', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['refuse-licence']}
                </button>
              )}
              {canLapse && (
                <button
                  onClick={() => onAct('lapse', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL.lapse}
                </button>
              )}
              {canWithdraw && (
                <button
                  onClick={() => onAct('withdraw', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL.withdraw}
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
