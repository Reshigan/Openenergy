// Wave 93 — NERSA ERA s35 Enforcement Actions & Administrative Penalties tab.
//
// The ENFORCEMENT-TEETH layer of a best-in-class regulator stack. W5 inbox,
// W31 disposition, W40 compliance-inspection produce findings of non-conformance;
// W93 is the formal administrative-penalty machinery that runs them through
// ERA s35 / PAJA s4 due-process to a public-register penalty notice. Beats
// FERC Office of Enforcement / Ofgem provisional+final penalty notice /
// Bundesnetzagentur Bußgeldverfahren / CRE CoRDiS / AER civil-penalty
// undertaking / ACER / SEC ALJ administrative proceedings / SARS TAA Ch15 —
// all of which run this in spreadsheets and Word documents and miss procedural
// windows — via a LIVE-scored AUDI-WINDOW COMPLIANCE battery (PAJA s4 + ERA
// s35(3) 21-day minimum), procedural-irregularity flag, ERA s35 R1m/offence
// cap with stacking, prescribed-rate interest (15.5%), and repeat-offender
// floor-at-severe.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'case_opened' | 'allegations_drafted' | 'allegations_served'
  | 'representations_period' | 'hearing_held' | 'determination'
  | 'penalty_imposed' | 'paid' | 'appealed' | 'enforced_via_court'
  | 'dismissed' | 'withdrawn';

type Tier = 'minor' | 'standard' | 'material' | 'severe';

interface CaseRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  trigger_kind: string | null;
  respondent_party_id: string;
  respondent_party_name: string | null;
  respondent_licence_no: string | null;
  respondent_persona: string | null;
  respondent_contact: string | null;
  allegation_class: string;
  allegation_summary: string | null;
  era_section_cited: string | null;
  offence_count: number;
  contravention_period_start: string | null;
  contravention_period_end: string | null;
  penalty_tier: Tier;
  authority_required: string | null;
  proposed_penalty_per_offence_zar: number;
  proposed_penalty_total_zar: number;
  imposed_penalty_zar: number | null;
  recovered_zar: number;
  accrued_interest_zar: number;
  representations_opened_at: string | null;
  representations_closed_at: string | null;
  representations_received_flag: number;
  representations_summary: string | null;
  hearing_requested_flag: number;
  hearing_held_flag: number;
  reasoned_refusal_flag: number;
  procedural_irregularity_flag: number;
  determination_liable_flag: number | null;
  determination_basis: string | null;
  determination_date: string | null;
  enforcement_step: string | null;
  enforcement_step_at: string | null;
  payment_due_date: string | null;
  days_overdue: number;
  appeal_filed_at: string | null;
  appeal_forum: string | null;
  appeal_outcome: string | null;
  prior_penalty_count: number;
  days_since_last_penalty: number | null;
  allegations_basis: string | null;
  determination_summary: string | null;
  penalty_basis: string | null;
  appeal_basis: string | null;
  enforcement_basis: string | null;
  reason_code: string | null;
  chain_status: ChainStatus;
  case_opened_at: string;
  allegations_drafted_at: string | null;
  allegations_served_at: string | null;
  representations_period_at: string | null;
  hearing_held_at: string | null;
  determination_at: string | null;
  penalty_imposed_at: string | null;
  paid_at: string | null;
  appealed_at: string | null;
  enforced_via_court_at: string | null;
  dismissed_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_at: string;
  updated_at: string;
  // decorated
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  urgency_band?: string;
  is_reportable_flag?: boolean;
  high_tier_flag?: boolean;
  floor_at_severe_class_flag?: boolean;
  signature_class_flag?: boolean;
  authority_required_live?: string;
  capped_penalty_per_offence_zar_live?: number;
  proposed_penalty_total_zar_live?: number;
  tier_live?: Tier;
  audi_window_days_remaining_live?: number;
  audi_minimum_met_flag?: boolean;
  procedural_irregularity_flag_live?: boolean;
  accrued_interest_zar_live?: number;
  recovery_pct_live?: number;
  repeat_offender_score_live?: number;
  repeat_offender_flag_live?: boolean;
  predicted_recovery_days_live?: number;
}

interface CaseEvent {
  id: string;
  case_id: string;
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
  paid_count: number;
  dismissed_count: number;
  withdrawn_count: number;
  appealed_count: number;
  enforced_count: number;
  breached_count: number;
  reportable_total: number;
  signature_count: number;
  floor_applied_count: number;
  procedural_irregularity_count: number;
  repeat_offender_count: number;
  total_proposed_zar: number;
  total_imposed_zar: number;
  total_recovered_zar: number;
  total_interest_zar: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  case_opened:            { bg: '#e3e7ec', fg: '#557',    label: 'Case opened' },
  allegations_drafted:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Allegations drafted' },
  allegations_served:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Allegations served' },
  representations_period: { bg: '#fff4d6', fg: '#a06200', label: 'Audi (representations open)' },
  hearing_held:           { bg: '#fff4d6', fg: '#a06200', label: 'Hearing held' },
  determination:          { bg: '#ffe4b5', fg: '#8a4a00', label: 'Determination' },
  penalty_imposed:        { bg: '#fde0e0', fg: '#9b1f1f', label: 'Penalty imposed' },
  appealed:               { bg: '#ffe4b5', fg: '#8a4a00', label: 'Appealed (Tribunal)' },
  enforced_via_court:     { bg: '#fde0e0', fg: '#9b1f1f', label: 'Enforced via court' },
  paid:                   { bg: '#d4edda', fg: '#155724', label: 'Paid' },
  dismissed:              { bg: '#e3e7ec', fg: '#557',    label: 'Dismissed' },
  withdrawn:              { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  severe:   { bg: '#fde0e0', fg: '#9b1f1f', label: 'Severe (≥R1m)' },
  material: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Material (R500k–R1m)' },
  standard: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard (R100k–R500k)' },
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor (<R100k)' },
};

const AUTHORITY_LABEL: Record<string, string> = {
  enforcement_officer:  'Enforcement officer',
  panel_chair:          'Panel chair',
  council_subcommittee: 'Council sub-committee',
  full_council:         'Full Council',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',              label: 'Open' },
  { key: 'all',               label: 'All' },
  { key: 'severe',            label: 'Severe' },
  { key: 'material',          label: 'Material' },
  { key: 'standard',          label: 'Standard' },
  { key: 'minor',             label: 'Minor' },
  { key: 'representations_period', label: 'Audi open' },
  { key: 'determination',     label: 'Determination' },
  { key: 'penalty_imposed',   label: 'Penalty imposed' },
  { key: 'appealed',          label: 'Appealed' },
  { key: 'enforced_via_court', label: 'Enforced via court' },
  { key: 'paid',              label: 'Paid' },
  { key: 'signature',         label: 'Floor-at-severe class' },
  { key: 'procedural',        label: 'Procedural irregularity' },
  { key: 'repeat_offender',   label: 'Repeat offender' },
  { key: 'breached',          label: 'SLA breached' },
  { key: 'reportable',        label: 'Reportable' },
];

type ActionKind =
  | 'draft-allegations' | 'serve-allegations' | 'open-representations'
  | 'hold-hearing' | 'make-determination' | 'impose-penalty'
  | 'record-payment' | 'lodge-appeal' | 'initiate-enforcement'
  | 'dismiss' | 'withdraw' | 'cancel';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  case_opened:            'draft-allegations',
  allegations_drafted:    'serve-allegations',
  allegations_served:     'open-representations',
  representations_period: 'make-determination',
  hearing_held:           'make-determination',
  determination:          'impose-penalty',
  penalty_imposed:        'record-payment',
  appealed:               'impose-penalty',
  enforced_via_court:     'record-payment',
  paid:                   null,
  dismissed:              null,
  withdrawn:              null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'draft-allegations':    'Draft allegations (enforcement officer)',
  'serve-allegations':    'Serve allegations (enforcement officer)',
  'open-representations': 'Open representations (enforcement officer)',
  'hold-hearing':         'Hold hearing (panel chair)',
  'make-determination':   'Make determination (Council)',
  'impose-penalty':       'Impose penalty (Council)',
  'record-payment':       'Record payment',
  'lodge-appeal':         'Lodge appeal (Tribunal)',
  'initiate-enforcement': 'Initiate enforcement (sheriff)',
  'dismiss':              'Dismiss (Council)',
  'withdraw':             'Withdraw',
  'cancel':               'Cancel',
};

const SECONDARY_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  case_opened:            ['withdraw', 'cancel'],
  allegations_drafted:    ['withdraw', 'cancel'],
  allegations_served:     ['withdraw', 'cancel'],
  representations_period: ['hold-hearing', 'withdraw', 'cancel'],
  hearing_held:           ['withdraw', 'cancel'],
  determination:          ['dismiss', 'withdraw', 'cancel'],
  penalty_imposed:        ['lodge-appeal', 'initiate-enforcement', 'withdraw', 'cancel'],
  appealed:               ['dismiss', 'initiate-enforcement', 'withdraw', 'cancel'],
  enforced_via_court:     ['dismiss', 'withdraw', 'cancel'],
  paid:                   [],
  dismissed:              [],
  withdrawn:              [],
};

const DESTRUCTIVE: ActionKind[] = ['impose-penalty', 'dismiss', 'withdraw', 'cancel', 'initiate-enforcement'];

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}R${(a / 1_000_000).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}m`;
  if (a >= 1000) return `${sign}R${(a / 1000).toLocaleString('en-ZA', { maximumFractionDigits: 1 })}k`;
  return `${sign}R${a.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

const TERMINAL_STATES: ChainStatus[] = ['paid', 'dismissed', 'withdrawn'];

export function EnforcementActionChainTab() {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<CaseRow | null>(null);
  const [events, setEvents] = useState<CaseEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: CaseRow[] } & KpiSummary }>('/regulator/enforcement-action/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total,
          open_count: d.open_count, paid_count: d.paid_count,
          dismissed_count: d.dismissed_count, withdrawn_count: d.withdrawn_count,
          appealed_count: d.appealed_count, enforced_count: d.enforced_count,
          breached_count: d.breached_count, reportable_total: d.reportable_total,
          signature_count: d.signature_count, floor_applied_count: d.floor_applied_count,
          procedural_irregularity_count: d.procedural_irregularity_count,
          repeat_offender_count: d.repeat_offender_count,
          total_proposed_zar: d.total_proposed_zar, total_imposed_zar: d.total_imposed_zar,
          total_recovered_zar: d.total_recovered_zar, total_interest_zar: d.total_interest_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load enforcement actions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: CaseRow; events: CaseEvent[] } }>(`/regulator/enforcement-action/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load case history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')         return true;
      if (filter === 'open')        return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')    return r.sla_breached;
      if (filter === 'reportable')  return r.is_reportable_flag;
      if (filter === 'signature')   return r.signature_class_flag;
      if (filter === 'procedural')  return r.procedural_irregularity_flag_live;
      if (filter === 'repeat_offender') return r.repeat_offender_flag_live;
      if (['minor', 'standard', 'material', 'severe'].includes(filter)) {
        return r.penalty_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: CaseRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'draft-allegations') {
        const summary = window.prompt('Allegations summary — what is being alleged?');
        if (!summary) return;
        const era = window.prompt('ERA section cited (e.g. s35(1)(a)):') || '';
        const offences = window.prompt('Offence count (stacking allowed under ERA s35):', String(row.offence_count || 1)) || '1';
        const perOff = window.prompt('Proposed penalty PER OFFENCE (ZAR) — ERA s35 cap R1m/offence applied automatically:', String(row.proposed_penalty_per_offence_zar || 0)) || '';
        const basis = window.prompt('Allegations basis — drafting rationale:') || '';
        body = { allegations_summary: summary, allegations_basis: basis };
        if (era) body.era_section_cited = era;
        if (offences && !Number.isNaN(Number(offences))) body.offence_count = Number(offences);
        if (perOff && !Number.isNaN(Number(perOff))) body.proposed_penalty_per_offence_zar = Number(perOff);
      } else if (action === 'serve-allegations') {
        const ref = window.prompt('Service reference (sheriff / registered post / personal service):') || '';
        const notes = window.prompt('Service notes:') || '';
        body = {};
        if (ref) body.serve_ref = ref;
        if (notes) body.notes = notes;
      } else if (action === 'open-representations') {
        const ref = window.prompt('Representations reference:') || '';
        const notes = window.prompt('Note — written representations now open (PAJA s4 / ERA s35(3) audi):') || '';
        body = {};
        if (ref) body.serve_ref = ref;
        if (notes) body.notes = notes;
      } else if (action === 'hold-hearing') {
        const heardFlag = window.prompt('Was the oral hearing held? (1/0)', String(row.hearing_held_flag || 1)) || '1';
        const ref = window.prompt('Hearing reference / panel composition:') || '';
        const notes = window.prompt('Hearing notes:') || '';
        body = { hearing_held_flag: Number(heardFlag) || 0 };
        if (ref) body.hearing_ref = ref;
        if (notes) body.notes = notes;
      } else if (action === 'make-determination') {
        const liable = window.prompt('Determination: liable? (1=liable / 0=not liable):', '1') || '1';
        const basis = window.prompt('Determination basis — Council reasons (PAJA s5):');
        if (!basis) return;
        const summary = window.prompt('Determination summary:') || '';
        const reg = window.prompt('Regulator reference (severe + liable crosses every tier; material+ for others):') || '';
        body = { determination_liable_flag: Number(liable) || 0, determination_basis: basis };
        if (summary) body.determination_summary = summary;
        if (reg) body.regulator_ref = reg;
      } else if (action === 'impose-penalty') {
        const imposed = window.prompt('Imposed penalty (ZAR) — public register entry (W93 SIGNATURE — every tier crosses):', String(row.proposed_penalty_total_zar_live ?? row.proposed_penalty_total_zar ?? 0));
        if (!imposed) return;
        const due = window.prompt('Payment due date (YYYY-MM-DD):') || '';
        const basis = window.prompt('Penalty basis — quantum reasoning:') || '';
        const ref = window.prompt('Penalty notice reference:') || '';
        const reg = window.prompt('Regulator reference (every penalty imposed is publicly registered):') || '';
        body = { imposed_penalty_zar: Number(imposed) || 0 };
        if (due) body.payment_due_date = due;
        if (basis) body.penalty_basis = basis;
        if (ref) body.penalty_ref = ref;
        if (reg) body.regulator_ref = reg;
      } else if (action === 'record-payment') {
        const amount = window.prompt('Payment amount (ZAR):');
        if (!amount) return;
        const ref = window.prompt('Payment reference:') || '';
        const notes = window.prompt('Payment notes:') || '';
        body = { recovered_zar: Number(amount) || 0 };
        if (ref) body.payment_ref = ref;
        if (notes) body.notes = notes;
      } else if (action === 'lodge-appeal') {
        const forum = window.prompt('Appeal forum (electricity_regulator_tribunal / high_court):', row.appeal_forum ?? 'electricity_regulator_tribunal') || 'electricity_regulator_tribunal';
        const ref = window.prompt('Appeal reference:') || '';
        const basis = window.prompt('Appeal basis — grounds:');
        if (!basis) return;
        const reg = window.prompt('Regulator reference (Tribunal signal — every tier crosses):') || '';
        body = { appeal_forum: forum, appeal_basis: basis };
        if (ref) body.appeal_ref = ref;
        if (reg) body.regulator_ref = reg;
      } else if (action === 'initiate-enforcement') {
        const step = window.prompt('Enforcement step (demand_letter / writ_issued / sheriff_attachment / garnishee / contempt_application):', row.enforcement_step ?? 'demand_letter') || 'demand_letter';
        const ref = window.prompt('Enforcement reference:') || '';
        const basis = window.prompt('Enforcement basis — why escalating to court:');
        if (!basis) return;
        const reg = window.prompt('Regulator reference (court-system signal — every tier crosses):') || '';
        body = { enforcement_step: step, enforcement_basis: basis };
        if (ref) body.enforcement_ref = ref;
        if (reg) body.regulator_ref = reg;
      } else if (action === 'dismiss') {
        const basis = window.prompt('Dismissal basis — Council finds no contravention OR enforcement avenue exhausted:');
        if (!basis) return;
        const reg = window.prompt('Regulator reference (material+severe crosses):') || '';
        body = { reason_code: 'dismissed', notes: basis };
        if (reg) body.regulator_ref = reg;
      } else if (action === 'withdraw') {
        const basis = window.prompt('Withdrawal note — NERSA elects not to pursue:');
        if (!basis) return;
        body = { reason_code: 'withdrawn', notes: basis };
      } else if (action === 'cancel') {
        const basis = window.prompt('Cancellation note — administrative cancel (wrong respondent etc):');
        if (!basis) return;
        body = { reason_code: 'cancelled', notes: basis };
      }
      await api.post(`/regulator/enforcement-action/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Enforcement actions &amp; administrative penalties (ERA s35)</h2>
          <p className="text-xs text-[#4a5568]">
            12-state administrative-penalty chain · case_opened → allegations_drafted → allegations_served
            → representations_period (PAJA s4 + ERA s35(3) audi) → (hearing_held optional) → determination
            → penalty_imposed → paid (clean terminal), with appealed (Tribunal), enforced_via_court
            (sheriff/writ/attachment/garnishee), dismissed and withdrawn terminals. The ENFORCEMENT-TEETH
            layer downstream of W5 inbox / W31 disposition / W40 compliance inspection. The DIFFERENTIATOR
            over FERC Office of Enforcement / Ofgem provisional+final penalty notice / Bundesnetzagentur
            Bußgeldverfahren / CRE CoRDiS / AER civil-penalty undertaking / ACER / SEC ALJ administrative
            proceedings / SARS TAA Ch15: every case is LIVE-scored every fetch against an AUDI-WINDOW
            COMPLIANCE battery (21-day minimum), procedural-irregularity flag (under-21d or hearing denied
            without reasoned refusal — judicial-review tripwires), ERA s35 R1m/offence cap enforced with
            stacking, prescribed-rate interest (15.5% p.a. per Act 55/1975) accruing on unpaid penalty
            from due date, and a repeat-offender score (count × recency) that raises floor-at-severe.
            Tier is PENALTY-QUANTUM-DERIVED on every transition (minor &lt;R100k / standard &lt;R500k /
            material &lt;R1m / severe ≥R1m) with FLOOR-AT-SEVERE for safety_violation /
            systemic_market_abuse / repeat_offender classes. INVERTED SLA — a larger penalty gets MORE
            procedural time (audi strengthens with magnitude). The W93 SIGNATURE — penalty_imposed
            crosses regulator EVERY tier (public-register / s35 transparency obligation). Enforced via
            court, appealed, severe+liable determinations, floor-at-severe service, dismiss/withdraw and
            SLA breach also cross.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total cases" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Paid" value={kpis?.paid_count ?? 0} tone="ok" />
        <Kpi label="Appealed" value={kpis?.appealed_count ?? 0} tone={(kpis?.appealed_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Enforced via court" value={kpis?.enforced_count ?? 0} tone={(kpis?.enforced_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Dismissed" value={kpis?.dismissed_count ?? 0} />
        <Kpi label="Floor-at-severe" value={kpis?.floor_applied_count ?? 0} tone={(kpis?.floor_applied_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Procedural irregularity" value={kpis?.procedural_irregularity_count ?? 0} tone={(kpis?.procedural_irregularity_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Repeat offenders" value={kpis?.repeat_offender_count ?? 0} tone={(kpis?.repeat_offender_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached_count ?? 0} tone={(kpis?.breached_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Total imposed" value={fmtZar(kpis?.total_imposed_zar)} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Respondent / allegation</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Class</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Proposed</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Imposed</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Recovered</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.penalty_tier];
                const recPct = r.recovery_pct_live ?? null;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.case_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator (public register)">●</span>}
                      {r.signature_class_flag && <span className="ml-1 text-[#9b1f1f]" title="Floor-at-severe class (safety_violation / systemic_market_abuse / repeat_offender)">★</span>}
                      {r.procedural_irregularity_flag_live && <span className="ml-1 text-[#9b1f1f]" title="Procedural irregularity (PAJA s4 / ERA s35(3) judicial-review tripwire)">▲</span>}
                      {r.repeat_offender_flag_live && <span className="ml-1 text-[#9b1f1f]" title="Repeat offender">◆</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[260px] truncate" title={`${r.respondent_party_name ?? ''} · ${r.allegation_summary ?? ''}`}>
                      {r.respondent_party_name ?? '—'}
                      <span className="text-[#4a5568]"> · {r.allegation_summary ?? ''}</span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[#4a5568]">{r.allegation_class}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {r.penalty_tier}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#0c2a4d]">{fmtZar(r.proposed_penalty_total_zar_live ?? r.proposed_penalty_total_zar)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#0c2a4d]">{fmtZar(r.imposed_penalty_zar)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${recPct != null && recPct < 100 && (r.imposed_penalty_zar ?? 0) > 0 ? 'text-[#a06200]' : 'text-[#4a5568]'}`}>
                      {recPct != null && (r.imposed_penalty_zar ?? 0) > 0 ? fmtPct(recPct, 0) : '—'}
                    </td>
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
                <tr><td colSpan={9} className="px-3 py-6 text-center text-[#4a5568]">No cases match.</td></tr>
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
  row: CaseRow;
  events: CaseEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: CaseRow) => void;
}) {
  const primary = ACTION_FOR_STATE[row.chain_status];
  const secondary = SECONDARY_ACTIONS[row.chain_status];
  const authority = AUTHORITY_LABEL[row.authority_required_live ?? row.authority_required ?? ''] ?? (row.authority_required ?? '—');

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[760px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.case_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.respondent_party_name ?? '—'} · {row.allegation_summary ?? ''}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.penalty_tier].label}
                {row.allegation_class ? ` · ${row.allegation_class}` : ''}
                {row.respondent_persona ? ` · ${row.respondent_persona}` : ''}
                {row.respondent_licence_no ? ` · ${row.respondent_licence_no}` : ''}
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

        {/* The distinctive layer — live AUDI-WINDOW + PAJA-procedural + ERA s35 cap + interest + recovery + repeat-offender battery. */}
        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Live audi-window compliance (PAJA s4 + ERA s35(3))</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Audi days remaining" value={row.audi_window_days_remaining_live != null ? `${fmtNum(row.audi_window_days_remaining_live, 1)}d` : '—'} bad={(row.audi_window_days_remaining_live ?? 0) <= 0} hint="Countdown from representations_period opened" />
              <Metric label="Audi minimum met" value={row.audi_minimum_met_flag ? 'Yes (≥21d)' : 'No (under 21d)'} bad={!row.audi_minimum_met_flag} hint="ERA s35(3) minimum 21 days" />
              <Metric label="Procedural irregularity" value={row.procedural_irregularity_flag_live ? 'FLAGGED' : 'No'} bad={!!row.procedural_irregularity_flag_live} hint="Under-21d audi OR hearing denied without reasoned refusal — judicial-review tripwire" />
              <Metric label="Hearing requested" value={row.hearing_requested_flag ? 'Yes' : 'No'} hint="If requested, must be held or refused with reasons" />
              <Metric label="Hearing held" value={row.hearing_held_flag ? 'Yes' : 'No'} />
              <Metric label="Reasoned refusal" value={row.reasoned_refusal_flag ? 'Yes' : 'No'} />
              <Metric label="Tier (live)" value={(row.tier_live ?? row.penalty_tier).toString()} hint="Penalty-quantum-derived, re-derived every fetch" />
              <Metric label="Floor at severe" value={row.floor_at_severe_class_flag ? 'Yes' : 'No'} bad={!!row.floor_at_severe_class_flag} hint="safety_violation / systemic_market_abuse / repeat_offender" />
            </div>
          </div>
          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">ERA s35 penalty quantum &amp; recovery (R1m/offence cap, 15.5% interest)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Offence count" value={fmtNum(row.offence_count, 0)} hint="ERA s35 allows stacking per offence" />
              <Metric label="Proposed per-offence" value={fmtZar(row.proposed_penalty_per_offence_zar)} hint="Pre-cap" />
              <Metric label="Capped per-offence (live)" value={fmtZar(row.capped_penalty_per_offence_zar_live)} hint="ERA s35 R1m cap applied" />
              <Metric label="Proposed total (live)" value={fmtZar(row.proposed_penalty_total_zar_live)} hint="Capped × offence_count" />
              <Metric label="Imposed" value={fmtZar(row.imposed_penalty_zar)} bad={(row.imposed_penalty_zar ?? 0) > 0} hint="Public register entry" />
              <Metric label="Recovered" value={fmtZar(row.recovered_zar)} />
              <Metric label="Recovery %" value={row.recovery_pct_live != null ? fmtPct(row.recovery_pct_live, 1) : '—'} bad={(row.recovery_pct_live ?? 100) < 100 && (row.imposed_penalty_zar ?? 0) > 0} />
              <Metric label="Accrued interest (15.5%)" value={fmtZar(row.accrued_interest_zar_live)} bad={(row.accrued_interest_zar_live ?? 0) > 0} hint={`${row.days_overdue}d overdue · Prescribed Rate of Interest Act 55/1975`} />
            </div>
          </div>
          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Repeat offender &amp; recovery prediction</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Prior penalties" value={fmtNum(row.prior_penalty_count, 0)} bad={row.prior_penalty_count >= 2} />
              <Metric label="Days since last" value={row.days_since_last_penalty != null ? `${row.days_since_last_penalty}d` : '—'} />
              <Metric label="Repeat-offender score" value={fmtNum(row.repeat_offender_score_live, 2)} bad={!!row.repeat_offender_flag_live} hint="count × recency_weight" />
              <Metric label="Repeat-offender flag" value={row.repeat_offender_flag_live ? 'YES' : 'No'} bad={!!row.repeat_offender_flag_live} hint="≥2 priors OR score ≥1.5 — floor-at-severe" />
              <Metric label="Enforcement step" value={row.enforcement_step ?? 'none'} />
              <Metric label="Predicted recovery days" value={`${row.predicted_recovery_days_live}d`} hint="Calibrated to SA Magistrates' Court norms" />
              <Metric label="Authority required" value={authority} hint="Derived from tier" />
              <Metric label="Appeal forum" value={row.appeal_forum ?? '—'} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"                value={STATE_TONE[row.chain_status].label} />
            <Pair label="Penalty tier"         value={TIER_TONE[row.penalty_tier].label} />
            <Pair label="Allegation class"     value={row.allegation_class} />
            <Pair label="ERA section"          value={row.era_section_cited ?? '—'} />
            <Pair label="Contravention period" value={`${row.contravention_period_start ?? '—'} → ${row.contravention_period_end ?? '—'}`} />
            <Pair label="Respondent"           value={row.respondent_party_name ?? '—'} />
            <Pair label="Licence no"           value={row.respondent_licence_no ?? '—'} />
            <Pair label="Persona"              value={row.respondent_persona ?? '—'} />
            <Pair label="Determination liable" value={row.determination_liable_flag == null ? '—' : row.determination_liable_flag ? 'Yes' : 'No'} />
            <Pair label="Determination date"   value={fmtDate(row.determination_date)} />
            <Pair label="Payment due"          value={fmtDate(row.payment_due_date)} />
            <Pair label="Days overdue"         value={String(row.days_overdue)} />
            <Pair label="Appeal filed"         value={fmtDate(row.appeal_filed_at)} />
            <Pair label="Appeal outcome"       value={row.appeal_outcome ?? '—'} />
            <Pair label="Enforcement step at"  value={fmtDate(row.enforcement_step_at)} />
            <Pair label="Representations opened" value={fmtDate(row.representations_opened_at)} />
            <Pair label="Representations closed" value={fmtDate(row.representations_closed_at)} />
            <Pair label="Case opened"          value={fmtDate(row.case_opened_at)} />
            <Pair label="Allegations drafted"  value={fmtDate(row.allegations_drafted_at)} />
            <Pair label="Allegations served"   value={fmtDate(row.allegations_served_at)} />
            <Pair label="Hearing held"         value={fmtDate(row.hearing_held_at)} />
            <Pair label="Determination at"     value={fmtDate(row.determination_at)} />
            <Pair label="Penalty imposed"      value={fmtDate(row.penalty_imposed_at)} />
            <Pair label="Paid"                 value={fmtDate(row.paid_at)} />
            <Pair label="Appealed"             value={fmtDate(row.appealed_at)} />
            <Pair label="Enforced via court"   value={fmtDate(row.enforced_via_court_at)} />
            <Pair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"           value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"       value={String(row.escalation_level)} />
            <Pair label="Reportable"           value={row.is_reportable_flag ? 'Yes (public register)' : 'No'} />
          </div>
          {row.allegations_basis && <BasisBlock label="Allegations basis" tone="#1a3a5c" text={row.allegations_basis} />}
          {row.representations_summary && <BasisBlock label="Representations summary" tone="#a06200" text={row.representations_summary} />}
          {row.determination_basis && <BasisBlock label="Determination basis (PAJA s5 reasons)" tone="#8a4a00" text={row.determination_basis} />}
          {row.determination_summary && <BasisBlock label="Determination summary" tone="#8a4a00" text={row.determination_summary} />}
          {row.penalty_basis && <BasisBlock label="Penalty quantum basis" tone="#9b1f1f" text={row.penalty_basis} />}
          {row.appeal_basis && <BasisBlock label="Appeal basis" tone="#8a4a00" text={row.appeal_basis} />}
          {row.enforcement_basis && <BasisBlock label="Enforcement basis" tone="#9b1f1f" text={row.enforcement_basis} />}
        </section>

        {(primary || secondary.length > 0) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {primary && (
                <button type="button"
                  onClick={() => onAct(primary, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[primary]}
                </button>
              )}
              {secondary.map((a) => {
                const danger = DESTRUCTIVE.includes(a);
                return (
                  <button type="button"
                    key={a}
                    onClick={() => onAct(a, row)}
                    className={
                      danger
                        ? 'rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50'
                        : 'rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#557] hover:bg-[#f3f5f9]'
                    }
                  >
                    {ACTION_LABEL[a]}
                  </button>
                );
              })}
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

function Metric({ label, value, bad, hint }: { label: string; value: string; bad?: boolean; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className={`text-[13px] font-semibold tabular-nums ${bad ? 'text-[#9b1f1f]' : 'text-[#0c2a4d]'}`}>{value}</div>
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
