// Wave 40 — Regulator Compliance Inspection & Enforcement lifecycle tab.
//
// NERSA's PROACTIVE, own-initiative enforcement arm (ERA 2006 §10 monitoring +
// §34/§35 enforcement). The regulator schedules a compliance inspection of a
// licensee, conducts it, drafts + issues findings, may issue a compliance
// directive, verifies remediation, and closes the matter — or escalates to a
// financial penalty with a statutory appeal route to the NERSA Tribunal.
//
// This is the ACTIVE ENFORCEMENT complement to the reactive W31 disposition
// (intake/triage) and periodic W33 licence-renewal (lifecycle). Disposition
// routes what comes IN; this chain is what the regulator initiates OUT.
//
// URGENT SLA — the more severe the contravention, the TIGHTER every window.
// Reportability: lodge_appeal crosses for EVERY tier (Tribunal docket);
// impose_penalty + SLA breaches cross for critical + serious.
//
// Two-party split write: the regulator officer drives the inspection +
// enforcement machinery; the respondent licensee begins remediation and lodges
// any appeal. actor_party (officer / respondent) is derived from the action.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'inspection_scheduled' | 'inspection_in_progress' | 'findings_drafted'
  | 'findings_issued' | 'directive_issued' | 'remediation_underway'
  | 'remediation_verified' | 'penalty_imposed' | 'appealed'
  | 'compliant_closed' | 'enforcement_closed' | 'withdrawn';

type Tier = 'critical' | 'serious' | 'minor';

interface InspectionRow {
  id: string;
  inspection_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  officer_party_id: string;
  officer_party_name: string;
  respondent_party_id: string;
  respondent_party_name: string;
  licence_ref: string | null;
  facility_name: string;
  inspection_trigger: string | null;
  contravention_tier: Tier;
  licence_condition_ref: string | null;
  penalty_amount_zar: number | null;
  daily_penalty_zar: number | null;
  remediation_cost_zar: number | null;
  findings_ref: string | null;
  directive_ref: string | null;
  penalty_ref: string | null;
  appeal_ref: string | null;
  tribunal_ref: string | null;
  inspection_basis: string | null;
  findings_basis: string | null;
  directive_basis: string | null;
  remediation_basis: string | null;
  penalty_basis: string | null;
  appeal_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: ChainStatus;
  inspection_scheduled_at: string;
  inspection_in_progress_at: string | null;
  findings_drafted_at: string | null;
  findings_issued_at: string | null;
  directive_issued_at: string | null;
  remediation_underway_at: string | null;
  remediation_verified_at: string | null;
  penalty_imposed_at: string | null;
  appealed_at: string | null;
  compliant_closed_at: string | null;
  enforcement_closed_at: string | null;
  withdrawn_at: string | null;
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
  in_enforcement?: boolean;
  breach_crosses_regulator?: boolean;
}

interface InspectionEvent {
  id: string;
  inspection_id: string;
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
  compliant_closed_count: number;
  enforcement_closed_count: number;
  withdrawn_count: number;
  in_enforcement_count: number;
  appealed_count: number;
  breached: number;
  reportable_total: number;
  critical_open: number;
  total_penalty: number;
  total_remediation: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  inspection_scheduled:   { bg: '#e3e7ec', fg: '#557',    label: 'Scheduled' },
  inspection_in_progress: { bg: '#dbecfb', fg: '#1a3a5c', label: 'In progress' },
  findings_drafted:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Findings drafted' },
  findings_issued:        { bg: '#fff4d6', fg: '#a06200', label: 'Findings issued' },
  directive_issued:       { bg: '#fff4d6', fg: '#a06200', label: 'Directive issued' },
  remediation_underway:   { bg: '#ffe9d6', fg: '#8a4a00', label: 'Remediation underway' },
  remediation_verified:   { bg: '#daf5e2', fg: '#1f6b3a', label: 'Remediation verified' },
  penalty_imposed:        { bg: '#fde0e0', fg: '#9b1f1f', label: 'Penalty imposed' },
  appealed:               { bg: '#fde0e0', fg: '#9b1f1f', label: 'Appealed' },
  compliant_closed:       { bg: '#d4edda', fg: '#155724', label: 'Compliant — closed' },
  enforcement_closed:     { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Enforcement — closed' },
  withdrawn:              { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
  serious:  { bg: '#ffe4b5', fg: '#8a4a00', label: 'Serious' },
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                 label: 'Active' },
  { key: 'all',                    label: 'All' },
  { key: 'critical',               label: 'Critical' },
  { key: 'serious',                label: 'Serious' },
  { key: 'minor',                  label: 'Minor' },
  { key: 'enforcement',            label: 'In enforcement' },
  { key: 'breached',               label: 'SLA breached' },
  { key: 'reportable',             label: 'Reportable' },
  { key: 'inspection_scheduled',   label: 'Scheduled' },
  { key: 'inspection_in_progress', label: 'In progress' },
  { key: 'findings_drafted',       label: 'Findings drafted' },
  { key: 'findings_issued',        label: 'Findings issued' },
  { key: 'directive_issued',       label: 'Directive issued' },
  { key: 'remediation_underway',   label: 'Remediation' },
  { key: 'remediation_verified',   label: 'Verified' },
  { key: 'penalty_imposed',        label: 'Penalty' },
  { key: 'appealed',               label: 'Appealed' },
  { key: 'compliant_closed',       label: 'Compliant closed' },
  { key: 'enforcement_closed',     label: 'Enforcement closed' },
  { key: 'withdrawn',              label: 'Withdrawn' },
];

type ActionKind =
  | 'begin-inspection' | 'draft-findings' | 'close-no-findings' | 'issue-findings'
  | 'issue-directive' | 'begin-remediation' | 'verify-remediation' | 'close-compliant'
  | 'impose-penalty' | 'lodge-appeal' | 'resolve-appeal' | 'close-enforcement' | 'withdraw';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  inspection_scheduled:   'begin-inspection',
  inspection_in_progress: 'draft-findings',
  findings_drafted:       'issue-findings',
  findings_issued:        'issue-directive',
  directive_issued:       'begin-remediation',
  remediation_underway:   'verify-remediation',
  remediation_verified:   'close-compliant',
  penalty_imposed:        'close-enforcement',
  appealed:               'resolve-appeal',
  compliant_closed:       null,
  enforcement_closed:     null,
  withdrawn:              null,
};

// Party annotation per action. The officer drives the machinery; the respondent
// licensee begins remediation and lodges any appeal.
const ACTION_LABEL: Record<ActionKind, string> = {
  'begin-inspection':   'Begin inspection (officer)',
  'draft-findings':     'Draft findings (officer)',
  'close-no-findings':  'Close — no findings (officer)',
  'issue-findings':     'Issue findings (officer)',
  'issue-directive':    'Issue directive (officer)',
  'begin-remediation':  'Begin remediation (respondent)',
  'verify-remediation': 'Verify remediation (officer)',
  'close-compliant':    'Close — compliant (officer)',
  'impose-penalty':     'Impose penalty (officer)',
  'lodge-appeal':       'Lodge appeal (respondent)',
  'resolve-appeal':     'Resolve appeal (officer)',
  'close-enforcement':  'Close enforcement (officer)',
  'withdraw':           'Withdraw (officer)',
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

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(1)}k`;
  return `R${n.toFixed(0)}`;
}

const TERMINAL_STATES: ChainStatus[] = ['compliant_closed', 'enforcement_closed', 'withdrawn'];

export function ComplianceInspectionChainTab() {
  const [rows, setRows] = useState<InspectionRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<InspectionRow | null>(null);
  const [events, setEvents] = useState<InspectionEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: InspectionRow[] } & KpiSummary }>('/compliance-inspection/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count,
          compliant_closed_count: d.compliant_closed_count,
          enforcement_closed_count: d.enforcement_closed_count,
          withdrawn_count: d.withdrawn_count, in_enforcement_count: d.in_enforcement_count,
          appealed_count: d.appealed_count, breached: d.breached,
          reportable_total: d.reportable_total, critical_open: d.critical_open,
          total_penalty: d.total_penalty, total_remediation: d.total_remediation,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load compliance inspection chains');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: InspectionRow; events: InspectionEvent[] } }>(
        `/compliance-inspection/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load inspection history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')         return true;
      if (filter === 'active')      return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'critical')    return r.contravention_tier === 'critical';
      if (filter === 'serious')     return r.contravention_tier === 'serious';
      if (filter === 'minor')       return r.contravention_tier === 'minor';
      if (filter === 'enforcement') return r.in_enforcement && !r.is_terminal;
      if (filter === 'breached')    return r.sla_breached;
      if (filter === 'reportable')  return r.is_reportable;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: InspectionRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'begin-inspection') {
        const basis = window.prompt('Inspection scope / basis (what is being examined):') || '';
        body = { inspection_basis: basis };
      } else if (action === 'draft-findings') {
        const ref = window.prompt('Findings reference (e.g. NERSA-FIND-2026-0042):');
        if (!ref) return;
        const basis = window.prompt('Findings basis — contraventions identified:') || '';
        body = { findings_ref: ref, findings_basis: basis };
      } else if (action === 'close-no-findings') {
        const rod = window.prompt('Record-of-decision — why the inspection closes clean:');
        if (!rod) return;
        body = { reason_code: 'no_contravention_found', rod_notes: rod };
      } else if (action === 'issue-findings') {
        const ref = window.prompt('Issued findings reference (served on respondent):', row.findings_ref || '');
        if (!ref) return;
        const basis = window.prompt('Findings basis / cover note:') || '';
        body = { findings_ref: ref, findings_basis: basis };
      } else if (action === 'issue-directive') {
        const ref = window.prompt('Compliance directive reference (e.g. NERSA-DIR-2026-0017):');
        if (!ref) return;
        const basis = window.prompt('Directive basis — required remediation + deadline:') || '';
        body = { directive_ref: ref, directive_basis: basis };
      } else if (action === 'begin-remediation') {
        const basis = window.prompt('Remediation plan basis — what the respondent will do:') || '';
        const cost = window.prompt('Estimated remediation cost (ZAR), if known:');
        body = { remediation_basis: basis };
        if (cost) body.remediation_cost_zar = Number(cost);
      } else if (action === 'verify-remediation') {
        const basis = window.prompt('Verification basis — evidence the directive was satisfied:') || '';
        body = { remediation_basis: basis };
      } else if (action === 'close-compliant') {
        const rod = window.prompt('Record-of-decision — remediation accepted, matter closed:');
        if (!rod) return;
        body = { reason_code: 'remediation_verified', rod_notes: rod };
      } else if (action === 'impose-penalty') {
        const ref = window.prompt('Penalty reference (e.g. NERSA-PEN-2026-0009):');
        if (!ref) return;
        const amount = window.prompt('Penalty amount (ZAR):');
        if (!amount) return;
        const daily = window.prompt('Daily penalty for continued non-compliance (ZAR), if any:');
        const basis = window.prompt('Penalty basis — statutory provision + reasoning:') || '';
        body = { penalty_ref: ref, penalty_amount_zar: Number(amount), penalty_basis: basis, reason_code: 'penalty_imposed' };
        if (daily) body.daily_penalty_zar = Number(daily);
      } else if (action === 'lodge-appeal') {
        const ref = window.prompt('Appeal reference (e.g. NERSA-TRIBUNAL-2026-0011):');
        if (!ref) return;
        const basis = window.prompt('Grounds of appeal:');
        if (!basis) return;
        body = { appeal_ref: ref, appeal_basis: basis };
      } else if (action === 'resolve-appeal') {
        const ref = window.prompt('Tribunal reference / outcome ref:', row.tribunal_ref || row.appeal_ref || '');
        const rod = window.prompt('Tribunal decision — outcome + any varied penalty:');
        if (!rod) return;
        body = { reason_code: 'appeal_resolved', rod_notes: rod };
        if (ref) body.tribunal_ref = ref;
      } else if (action === 'close-enforcement') {
        const rod = window.prompt('Record-of-decision — enforcement concluded:');
        if (!rod) return;
        body = { reason_code: 'enforcement_concluded', rod_notes: rod };
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason (e.g. duplicate, superseded, no jurisdiction):');
        if (!reason) return;
        body = { reason_code: 'withdrawn', rod_notes: reason };
      }
      await api.post(`/compliance-inspection/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Compliance inspection &amp; enforcement</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage P6 chain · scheduled → in progress → findings drafted → findings issued → directive issued →
            remediation underway → remediation verified → compliant closed. The enforcement branch escalates to a
            penalty (with a NERSA Tribunal appeal route); early inspections can close clean or withdraw. The regulator
            officer drives the machinery; the respondent licensee begins remediation and lodges any appeal. URGENT SLA:
            the more severe the contravention, the tighter every window. Appeals cross to the regulator inbox for every
            tier; penalties + SLA breaches cross for critical + serious (NERSA ERA §10 + §34/§35).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Critical open" value={kpis?.critical_open ?? 0} tone={(kpis?.critical_open ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="In enforcement" value={kpis?.in_enforcement_count ?? 0} tone={(kpis?.in_enforcement_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Appealed" value={kpis?.appealed_count ?? 0} tone={(kpis?.appealed_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Compliant closed" value={kpis?.compliant_closed_count ?? 0} tone="ok" />
        <Kpi label="Enforcement closed" value={kpis?.enforcement_closed_count ?? 0} />
        <Kpi label="Withdrawn" value={kpis?.withdrawn_count ?? 0} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Penalties" value={fmtZar(kpis?.total_penalty)} tone={(kpis?.total_penalty ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Remediation" value={fmtZar(kpis?.total_remediation)} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Inspection #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Facility / respondent</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Trigger</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Penalty</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.contravention_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.inspection_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[280px] truncate" title={`${r.facility_name} · ${r.respondent_party_name}`}>
                      {r.facility_name}
                      <span className="text-[#4a5568]"> · {r.respondent_party_name}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.inspection_trigger ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtZar(r.penalty_amount_zar)}</td>
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No inspections match.</td></tr>
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
  row: InspectionRow;
  events: InspectionEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: InspectionRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canCloseNoFindings = ['inspection_in_progress', 'findings_drafted'].includes(row.chain_status);
  const canPenalty = ['findings_issued', 'directive_issued', 'remediation_underway'].includes(row.chain_status);
  const canAppeal = ['penalty_imposed', 'directive_issued'].includes(row.chain_status);
  const canWithdraw = ['inspection_scheduled', 'inspection_in_progress', 'findings_drafted'].includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.inspection_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.facility_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.contravention_tier].label} · respondent {row.respondent_party_name}
                {row.licence_ref ? ` · licence ${row.licence_ref}` : ''} · officer {row.officer_party_name}
              </div>
              {row.source_wave && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"               value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"                value={TIER_TONE[row.contravention_tier].label} />
            <Pair label="Trigger"             value={row.inspection_trigger ?? '—'} />
            <Pair label="Licence ref"         value={row.licence_ref ?? '—'} />
            <Pair label="Licence condition"   value={row.licence_condition_ref ?? '—'} />
            <Pair label="Penalty"             value={fmtZar(row.penalty_amount_zar)} />
            <Pair label="Daily penalty"       value={fmtZar(row.daily_penalty_zar)} />
            <Pair label="Remediation cost"    value={fmtZar(row.remediation_cost_zar)} />
            <Pair label="Findings ref"        value={row.findings_ref ?? '—'} />
            <Pair label="Directive ref"       value={row.directive_ref ?? '—'} />
            <Pair label="Penalty ref"         value={row.penalty_ref ?? '—'} />
            <Pair label="Appeal ref"          value={row.appeal_ref ?? '—'} />
            <Pair label="Tribunal ref"        value={row.tribunal_ref ?? '—'} />
            <Pair label="Reason code"         value={row.reason_code ?? '—'} />
            <Pair label="Scheduled"           value={fmtDate(row.inspection_scheduled_at)} />
            <Pair label="In progress"         value={fmtDate(row.inspection_in_progress_at)} />
            <Pair label="Findings drafted"    value={fmtDate(row.findings_drafted_at)} />
            <Pair label="Findings issued"     value={fmtDate(row.findings_issued_at)} />
            <Pair label="Directive issued"    value={fmtDate(row.directive_issued_at)} />
            <Pair label="Remediation underway" value={fmtDate(row.remediation_underway_at)} />
            <Pair label="Remediation verified" value={fmtDate(row.remediation_verified_at)} />
            <Pair label="Penalty imposed"     value={fmtDate(row.penalty_imposed_at)} />
            <Pair label="Appealed"            value={fmtDate(row.appealed_at)} />
            <Pair label="Compliant closed"    value={fmtDate(row.compliant_closed_at)} />
            <Pair label="Enforcement closed"  value={fmtDate(row.enforcement_closed_at)} />
            <Pair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"          value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"      value={String(row.escalation_level)} />
            <Pair label="Reportable"          value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.inspection_basis && (
            <BasisBlock label="Inspection basis" tone="#1a3a5c" text={row.inspection_basis} />
          )}
          {row.findings_basis && (
            <BasisBlock label="Findings basis" tone="#a06200" text={row.findings_basis} />
          )}
          {row.directive_basis && (
            <BasisBlock label="Directive basis" tone="#8a4a00" text={row.directive_basis} />
          )}
          {row.remediation_basis && (
            <BasisBlock label="Remediation basis" tone="#1f6b3a" text={row.remediation_basis} />
          )}
          {row.penalty_basis && (
            <BasisBlock label="Penalty basis" tone="#9b1f1f" text={row.penalty_basis} />
          )}
          {row.appeal_basis && (
            <BasisBlock label="Appeal basis" tone="#9b1f1f" text={row.appeal_basis} />
          )}
          {row.rod_notes && (
            <BasisBlock label="Record of decision" tone="#155724" text={row.rod_notes} />
          )}
        </section>

        {(nextAction || canCloseNoFindings || canPenalty || canAppeal || canWithdraw) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#c2873a]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canCloseNoFindings && (
                <button type="button"
                  onClick={() => onAct('close-no-findings', row)}
                  className="rounded border border-green-300 bg-white px-3 py-1.5 text-[12px] font-medium text-green-700 hover:bg-green-50"
                >
                  {ACTION_LABEL['close-no-findings']}
                </button>
              )}
              {canPenalty && (
                <button type="button"
                  onClick={() => onAct('impose-penalty', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['impose-penalty']}
                </button>
              )}
              {canAppeal && (
                <button type="button"
                  onClick={() => onAct('lodge-appeal', row)}
                  className="rounded border border-amber-300 bg-white px-3 py-1.5 text-[12px] font-medium text-amber-700 hover:bg-amber-50"
                >
                  {ACTION_LABEL['lodge-appeal']}
                </button>
              )}
              {canWithdraw && (
                <button type="button"
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
