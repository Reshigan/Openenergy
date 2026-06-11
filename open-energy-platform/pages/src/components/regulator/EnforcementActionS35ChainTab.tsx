// Wave 106 - NERSA Section 35 Administrative Enforcement Action & Fine
// Imposition chain tab. 10th Regulator chain. Formal s35 enforcement
// lifecycle: NOTICE -> RESPONSE -> ADJUDICATION -> SANCTION -> APPEAL ->
// settled. Sister of W40 (compliance inspection finds non-conformance) +
// W66 (complaints intake) + W31 (disposition exit). Coexists with W93
// admin-penalty audi/PAJA layer at a different surface - W106 is the full
// s35 state machine with licence-suspension / licence-revocation sanctions
// + appeals + gazette publication.
//
// Beats FCA Enforcement & Decision Notice / ESMA Sanctions / FERC
// Enforcement / FSCA Administrative Sanctions Committee via LIVE battery
// (sanction quantum, appeal status band, days to appeal window close,
// adjudication progress %, repeat offence count, cumulative sanctions
// history, enforcement compliance index 0-130, urgency band, authority
// required ladder ending at NERSA Council, bridges to W40/W66/W33
// licence renewal, PAJA fairness at risk flag, Gazette publication
// required flag).
//
// INVERTED SLA polarity (strategic = LONGEST runway - PAJA s5 procedural
// fairness review). Authority ladder (4-step): minor -> compliance
// officer; standard -> legal advisor; material -> executive manager
// compliance; strategic -> full NERSA Council.
//
// SIGNATURE regulator crossings:
//   impose_sanction       -> EVERY tier when licence_revocation_proposed
//   commence_enforcement  -> EVERY tier on strategic OR criminal_intelligence
//   mark_settled          -> material+strategic on significant sanction types
//   sla_breached          -> material+strategic (PAJA fairness exposure)
//
// Mounted on Regulator workstation (primary write {admin,regulator}); READ
// all 9 personas.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'triggered' | 'notice_drafted' | 'notice_issued' | 'respondent_acknowledged'
  | 'response_received' | 'adjudication_in_progress' | 'adjudicated'
  | 'sanction_imposed' | 'appeal_window_open' | 'appealed' | 're_adjudicated'
  | 'enforcement_in_progress' | 'settled' | 'archived' | 'withdrawn' | 'cancelled';

type Tier = 'minor' | 'standard' | 'material' | 'strategic';

type UrgencyBand = 'critical' | 'high' | 'medium' | 'low';

type Authority =
  | 'nersa_compliance_officer' | 'nersa_legal_advisor'
  | 'nersa_executive_manager_compliance' | 'nersa_full_council';

type Party = 'nersa' | 'respondent' | 'panel' | 'council' | 'archiver' | 'system';

type AppealBand = 'none' | 'window_open' | 'appealed' | 'decided' | 'past_window';

interface EnfRow {
  [key: string]: unknown;
  id: string;
  enforcement_case_number: string;
  respondent_party_id: string;
  respondent_party_label: string | null;
  respondent_licence_id: string | null;
  respondent_licence_class: string | null;
  triggering_event_type: string | null;
  triggering_inspection_id: string | null;
  triggering_complaint_id: string | null;
  triggering_sla_breach_chain_ref: string | null;
  triggering_reason_summary_text: string | null;
  notice_drafted_by_actor_id: string | null;
  notice_issued_at: string | null;
  notice_reference: string | null;
  notice_legal_provisions: string | null;
  respondent_response_due_at: string | null;
  respondent_responded_at: string | null;
  respondent_position_text: string | null;
  adjudication_panel_label: string | null;
  adjudication_started_at: string | null;
  adjudication_completed_at: string | null;
  adjudication_decision_text: string | null;
  sanction_imposed_at: string | null;
  sanction_type: string | null;
  sanction_quantum_zar: number;
  sanction_effective_at: string | null;
  sanction_end_at: string | null;
  appeal_window_open_at: string | null;
  appeal_window_close_at: string | null;
  appeal_lodged_at: string | null;
  appeal_lodged_by_actor_id: string | null;
  appeal_grounds_text: string | null;
  appeal_outcome: string | null;
  appeal_decided_at: string | null;
  re_adjudication_decision_text: string | null;
  enforcement_started_at: string | null;
  enforcement_method: string | null;
  amount_collected_zar: number;
  settled_at: string | null;
  withdrawn_at: string | null;
  withdrawal_reason_code: string | null;
  cancellation_reason_text: string | null;
  archived_at: string | null;
  cancelled_at: string | null;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  is_reportable: number;
  sanction_quantum_zar_floor: number;
  enforcement_floor_flag_licence_revocation_proposed: number;
  enforcement_floor_flag_repeat_offender_within_36mo: number;
  enforcement_floor_flag_public_safety_impact_strict: number;
  enforcement_floor_flag_financial_quantum_over_50m: number;
  enforcement_floor_flag_criminal_referral_recommended: number;
  repeat_offender_count_36mo: number;
  cumulative_sanctions_history_zar: number;
  current_tier: Tier;
  authority_required: Authority | null;
  urgency_band: string | null;
  title: string | null;
  narrative: string | null;
  chain_status: ChainStatus;
  triggered_at: string | null;
  notice_drafted_at: string | null;
  respondent_acknowledged_at: string | null;
  response_received_at: string | null;
  adjudication_in_progress_at: string | null;
  adjudicated_at: string | null;
  appeal_window_open_state_at: string | null;
  appealed_at: string | null;
  re_adjudicated_at: string | null;
  enforcement_in_progress_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;
  tenant_id: string | null;
  // Decorated by route
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_minutes?: number;
  sla_days_remaining_live?: number | null;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sanction_quantum_zar_live?: number;
  appeal_status_band_live?: AppealBand;
  days_to_appeal_window_close_live?: number | null;
  adjudication_progress_pct_live?: number;
  repeat_offence_count_live?: number;
  cumulative_sanctions_history_zar_live?: number;
  enforcement_compliance_index_live?: number;
  urgency_band_live?: UrgencyBand;
  authority_required_live?: Authority;
  bridges_to_inspection_chain_live?: boolean;
  bridges_to_complaint_chain_live?: boolean;
  bridges_to_licence_renewal_chain_live?: boolean;
  paja_fairness_at_risk_flag_live?: boolean;
  gazette_publication_required_live?: boolean;
}

interface EnfEvent {
  id: string;
  action_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

interface KpiData {
  total: number;
  active_count: number;
  strategic_count: number;
  appeals_open_count: number;
  paja_at_risk_count: number;
  gazette_required_count: number;
  breached: number;
  reportable_total: number;
  inspection_bridged_count: number;
  complaint_bridged_count: number;
  total_sanction_zar: number;
  total_collected_zar: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  triggered:                { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Triggered' },
  notice_drafted:           { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Notice drafted' },
  notice_issued:            { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Notice issued' },
  respondent_acknowledged:  { bg: '#fff4d6', fg: '#a06200', label: 'Acknowledged' },
  response_received:        { bg: '#fff4d6', fg: '#a06200', label: 'Response in' },
  adjudication_in_progress: { bg: '#fff4d6', fg: '#a06200', label: 'Adjudicating' },
  adjudicated:              { bg: '#fff4d6', fg: '#a06200', label: 'Adjudicated' },
  sanction_imposed:         { bg: '#fde0e0', fg: '#9b1f1f', label: 'Sanction imposed' },
  appeal_window_open:       { bg: '#fde0e0', fg: '#9b1f1f', label: 'Appeal window' },
  appealed:                 { bg: '#fbd0d0', fg: '#7a1414', label: 'Appealed' },
  re_adjudicated:           { bg: '#fff4d6', fg: '#a06200', label: 'Re-adjudicated' },
  enforcement_in_progress:  { bg: '#fde0e0', fg: '#9b1f1f', label: 'Enforcing' },
  settled:                  { bg: '#daf5e2', fg: '#1f6b3a', label: 'Settled' },
  archived:                 { bg: '#e3e7ec', fg: '#557',    label: 'Archived' },
  withdrawn:                { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
  cancelled:                { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:     { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
  standard:  { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Standard' },
  material:  { bg: '#fff4d6', fg: '#a06200', label: 'Material' },
  strategic: { bg: '#fbd0d0', fg: '#7a1414', label: 'Strategic' },
};

const URGENCY_TONE: Record<UrgencyBand, { bg: string; fg: string; label: string }> = {
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
  medium:   { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Medium' },
  high:     { bg: '#fff4d6', fg: '#a06200', label: 'High' },
  critical: { bg: '#fbd0d0', fg: '#7a1414', label: 'Critical' },
};

const APPEAL_TONE: Record<AppealBand, { bg: string; fg: string; label: string }> = {
  none:        { bg: '#e3e7ec', fg: '#557',    label: 'No appeal' },
  window_open: { bg: '#fff4d6', fg: '#a06200', label: 'Window open' },
  appealed:    { bg: '#fbd0d0', fg: '#7a1414', label: 'Appealed' },
  decided:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Decided' },
  past_window: { bg: '#e3e7ec', fg: '#557',    label: 'Past window' },
};

const AUTH_LABEL: Record<Authority, string> = {
  nersa_compliance_officer:           'Compliance officer',
  nersa_legal_advisor:                'Legal advisor',
  nersa_executive_manager_compliance: 'Exec mgr compliance',
  nersa_full_council:                 'Full NERSA Council',
};

const PARTY_TONE: Record<string, { bg: string; fg: string }> = {
  nersa:      { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)' },
  respondent: { bg: '#fff4d6', fg: '#a06200' },
  panel:      { bg: '#e8defc', fg: '#5320a3' },
  council:    { bg: '#fde0e0', fg: '#9b1f1f' },
  archiver:   { bg: '#e3e7ec', fg: '#557' },
  system:     { bg: '#e3e7ec', fg: '#557' },
};

// UX revisit 2026-05-30 - pills grouped action-first then state. The
// compliance officer opens for SLA breach, strategic tier (full council),
// PAJA fairness exposure, gazette-required, and appeals open first. Action
// row carries those plus tier slicers and bridge filters to W40/W66; state
// row enumerates the 12-state lifecycle.
const FILTER_ROW_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',           label: 'Active (pre-terminal)' },
  { key: 'all',              label: 'All' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'reportable',       label: 'Reportable' },
  { key: 'critical_urgency', label: 'Critical urgency' },
  { key: 'paja_at_risk',     label: 'PAJA at risk' },
  { key: 'gazette_required', label: 'Gazette required' },
  { key: 'appeals_open',     label: 'Appeals open' },
  { key: 'inspection_bridged', label: 'Bridged to W40' },
  { key: 'complaint_bridged',  label: 'Bridged to W66' },
  { key: 'strategic', label: 'Strategic' },
  { key: 'material',  label: 'Material' },
  { key: 'standard',  label: 'Standard' },
  { key: 'minor',     label: 'Minor' },
];

const FILTER_ROW_STATE: Array<{ key: string; label: string }> = [
  { key: 'triggered',                label: 'Triggered' },
  { key: 'notice_drafted',           label: 'Notice drafted' },
  { key: 'notice_issued',            label: 'Notice issued' },
  { key: 'respondent_acknowledged',  label: 'Acknowledged' },
  { key: 'response_received',        label: 'Response in' },
  { key: 'adjudication_in_progress', label: 'Adjudicating' },
  { key: 'adjudicated',              label: 'Adjudicated' },
  { key: 'sanction_imposed',         label: 'Sanction imposed' },
  { key: 'appeal_window_open',       label: 'Appeal window' },
  { key: 'appealed',                 label: 'Appealed' },
  { key: 're_adjudicated',           label: 'Re-adjudicated' },
  { key: 'enforcement_in_progress',  label: 'Enforcing' },
  { key: 'settled',                  label: 'Settled' },
];

const TIERS = new Set<string>(['minor', 'standard', 'material', 'strategic']);

function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '-';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  const abs = Math.abs(v);
  if (abs >= 1000000) return `R${(v / 1000000).toFixed(2)}m`;
  if (abs >= 1000)    return `R${(v / 1000).toFixed(0)}k`;
  return `R${v.toFixed(0)}`;
}

function fmtDays(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '-';
  return `${v.toFixed(digits)}d`;
}

export function EnforcementActionS35ChainTab() {
  const [rows, setRows] = useState<EnfRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<EnfRow | null>(null);
  const [events, setEvents] = useState<EnfEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: EnfRow[] } }>('/regulator/enforcement-action-s35/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d as any;
        setKpis(rest as KpiData);
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
      const res = await api.get<{ data: { case: EnfRow; events: EnfEvent[] } }>(`/regulator/enforcement-action-s35/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load case history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')                return true;
      if (filter === 'active')             return !r.is_terminal;
      if (filter === 'breached')           return r.sla_breached_live;
      if (filter === 'reportable')         return r.is_reportable_flag;
      if (filter === 'critical_urgency')   return r.urgency_band_live === 'critical';
      if (filter === 'paja_at_risk')       return r.paja_fairness_at_risk_flag_live;
      if (filter === 'gazette_required')   return r.gazette_publication_required_live;
      if (filter === 'appeals_open')       return r.chain_status === 'appeal_window_open' || r.chain_status === 'appealed';
      if (filter === 'inspection_bridged') return r.bridges_to_inspection_chain_live;
      if (filter === 'complaint_bridged')  return r.bridges_to_complaint_chain_live;
      if (TIERS.has(filter))               return r.current_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const doAction = useCallback(async (path: string, body?: object) => {
    if (!selected) return;
    try {
      await api.post(`/regulator/enforcement-action-s35/chain/${selected.id}/${path}`, body ?? {});
      await load();
      await loadEvents(selected.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [selected, load, loadEvents]);

  return (
    <div className="space-y-3">
      {/* UX revisit 2026-05-30 - KPI strip ordered so the four numbers the
          NERSA compliance officer opens for (SLA breach, strategic tier,
          appeals open, PAJA fairness at risk) sit left. Gazette required,
          total sanction ZAR, total collected anchor right because those
          are the W106 signature numbers vs FCA EDN / ESMA Sanctions / FSCA
          ASC. */}
      <div className="grid grid-cols-8 gap-3">
        <Kpi label="SLA breached"     value={kpis?.breached ?? 0}              tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Strategic tier"   value={kpis?.strategic_count ?? 0}       tone={(kpis?.strategic_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Appeals open"     value={kpis?.appeals_open_count ?? 0}    tone={(kpis?.appeals_open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="PAJA at risk"     value={kpis?.paja_at_risk_count ?? 0}    tone={(kpis?.paja_at_risk_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Gazette required" value={kpis?.gazette_required_count ?? 0} tone={(kpis?.gazette_required_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Active"           value={kpis?.active_count ?? 0} />
        <Kpi label="Total sanction"   value={fmtZar(kpis?.total_sanction_zar ?? 0)} />
        <Kpi label="Total collected"  value={fmtZar(kpis?.total_collected_zar ?? 0)} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTER_ROW_ACTION.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              filter === f.key
                ? 'bg-[#c2873a] text-white border-[oklch(0.46_0.16_55)]'
                : 'bg-white text-[#4a5568] border-[#dde4ec] hover:bg-[#eef2f7]'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTER_ROW_STATE.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              filter === f.key
                ? 'bg-[#c2873a] text-white border-[oklch(0.46_0.16_55)]'
                : 'bg-white text-[#6b7685] border-[#eef2f6] hover:bg-[#eef2f7]'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {err && <div className="px-3 py-2 bg-red-50 text-red-700 text-[12px] rounded-md">{err}</div>}

      <div className="bg-white border border-[#e5ebf2] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#f7f9fb] text-[11px] uppercase tracking-wide text-[#6b7685]">
            <tr>
              <th className="px-3 py-2 text-left">Case #</th>
              <th className="px-3 py-2 text-left">Respondent / licence</th>
              <th className="px-3 py-2 text-right">Sanction</th>
              <th className="px-3 py-2 text-right">Progress</th>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-left">Appeal</th>
              <th className="px-3 py-2 text-right">{'Δ'} SLA</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {loading ? (
              <tr><td colSpan={8} className="p-6 text-center text-[#6b7685]">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-[#6b7685]">No enforcement actions match the current filter.</td></tr>
            ) : filtered.map((r) => {
              const stateTone = STATE_TONE[r.chain_status];
              const tierTone  = TIER_TONE[r.current_tier];
              const appealBand = r.appeal_status_band_live ?? 'none';
              const appealTone = APPEAL_TONE[appealBand];
              const floored = !!(r.enforcement_floor_flag_licence_revocation_proposed
                || r.enforcement_floor_flag_repeat_offender_within_36mo
                || r.enforcement_floor_flag_public_safety_impact_strict
                || r.enforcement_floor_flag_financial_quantum_over_50m
                || r.enforcement_floor_flag_criminal_referral_recommended);
              return (
                <tr
                  key={r.id}
                  onClick={() => loadEvents(r.id)}
                  className={`cursor-pointer hover:bg-[#f7f9fb] border-t border-[#eef2f6] ${selected?.id === r.id ? 'bg-[#fffae6]' : ''}`}>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.enforcement_case_number}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={`${r.respondent_party_label ?? r.respondent_party_id} - ${r.respondent_licence_class ?? '-'}`}>
                    {r.respondent_party_label ?? r.respondent_party_id}
                    <span className="text-[#6b7685]"> - {r.respondent_licence_class ?? '-'}</span>
                    {floored && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#fff4d6] text-[#a06200]">FLOOR</span>}
                    {r.bridges_to_inspection_chain_live && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[oklch(0.94_0.02_250)] text-[oklch(0.46_0.16_55)]">W40</span>}
                    {r.bridges_to_complaint_chain_live && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#e8defc] text-[#5320a3]">W66</span>}
                    {r.gazette_publication_required_live && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#fde0e0] text-[#9b1f1f]">GAZETTE</span>}
                    {r.paja_fairness_at_risk_flag_live && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#fbd0d0] text-[#7a1414]">PAJA</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">
                    {fmtZar(r.sanction_quantum_zar_live ?? r.sanction_quantum_zar)}
                    <div className="text-[10px] text-[#6b7685] uppercase">{r.sanction_type ?? '-'}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">
                    {(r.adjudication_progress_pct_live ?? 0).toFixed(0)}%
                    <div className="text-[10px] text-[#6b7685]">CCI {(r.enforcement_compliance_index_live ?? 0).toFixed(0)}/130</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: tierTone.bg, color: tierTone.fg }}>
                      {tierTone.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: stateTone.bg, color: stateTone.fg }}>
                      {stateTone.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: appealTone.bg, color: appealTone.fg }}>
                      {appealTone.label}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${r.sla_breached_live ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                    {r.is_terminal ? '-' : fmtMin(r.minutes_until_sla)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <EnfDrawer
          row={selected}
          events={events}
          onClose={() => { setSelected(null); setEvents([]); }}
          doAction={doAction}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, tone = 'ok' }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const fg = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0f1c2e';
  return (
    <div className="bg-white border border-[#e5ebf2] rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className="text-[20px] font-semibold tabular-nums mt-0.5" style={{ color: fg }}>{value}</div>
    </div>
  );
}

type FieldSpec = { key: string; label: string; type?: 'text' | 'textarea' | 'number' | 'checkbox'; placeholder?: string; required?: boolean };
type ActionSpec = { path: string; label: string; tone?: 'neutral' | 'good' | 'bad'; fields?: FieldSpec[]; multiAction?: Array<{ path: string; fields?: FieldSpec[] }> };

function ActionModal({ spec, onSubmit, onClose }: { spec: ActionSpec; onSubmit: (paths: Array<{ path: string; body: Record<string, unknown> }>) => void; onClose: () => void; }) {
  const [vals, setVals] = useState<Record<string, string | boolean>>({});
  const fields = spec.fields ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (spec.multiAction) {
      onSubmit(spec.multiAction.map((a) => {
        const body: Record<string, unknown> = {};
        (a.fields ?? []).forEach((f) => {
          const v = vals[f.key];
          if (v !== undefined && v !== '') {
            body[f.key] = f.type === 'number' ? Number(v) : f.type === 'checkbox' ? (v ? 1 : 0) : v;
          }
        });
        return { path: a.path, body };
      }));
    } else {
      const body: Record<string, unknown> = {};
      fields.forEach((f) => {
        const v = vals[f.key];
        if (v !== undefined && v !== '') {
          body[f.key] = f.type === 'number' ? Number(v) : f.type === 'checkbox' ? (v ? 1 : 0) : v;
        }
      });
      onSubmit([{ path: spec.path, body }]);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="text-[14px] font-semibold text-[#0f1c2e] mb-4">{spec.label}</div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-[11px] uppercase tracking-wide text-[#6b7685] mb-1">{f.label}{f.required && ' *'}</label>
              {f.type === 'textarea' ? (
                <textarea className="w-full border border-[#dde4ec] rounded-md px-2.5 py-1.5 text-[13px] text-[#0f1c2e] focus:outline-none focus:border-[#c2873a] resize-none" rows={3} placeholder={f.placeholder} value={(vals[f.key] as string) ?? ''} onChange={(e) => setVals((p) => ({ ...p, [f.key]: e.target.value }))} />
              ) : f.type === 'checkbox' ? (
                <label className="flex items-center gap-2 text-[13px] text-[#0f1c2e]">
                  <input type="checkbox" checked={!!(vals[f.key])} onChange={(e) => setVals((p) => ({ ...p, [f.key]: e.target.checked }))} className="w-4 h-4" />
                  {f.placeholder}
                </label>
              ) : (
                <input type={f.type ?? 'text'} className="w-full border border-[#dde4ec] rounded-md px-2.5 py-1.5 text-[13px] text-[#0f1c2e] focus:outline-none focus:border-[#c2873a]" placeholder={f.placeholder} value={(vals[f.key] as string) ?? ''} onChange={(e) => setVals((p) => ({ ...p, [f.key]: e.target.value }))} />
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-[12px] text-[#6b7685] hover:text-[#0f1c2e]">Cancel</button>
            <button type="submit" className="px-3 py-1.5 bg-[#c2873a] text-white text-[12px] rounded-md hover:opacity-90">Confirm</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EnfDrawer({
  row, events, onClose, doAction,
}: {
  row: EnfRow;
  events: EnfEvent[];
  onClose: () => void;
  doAction: (path: string, body?: object) => Promise<void>;
}) {
  const cs = row.chain_status;
  const transitionable = !row.is_hard_terminal;
  const cancellable = !row.is_hard_terminal && cs !== 'settled' && cs !== 'archived';
  const urgencyTone = row.urgency_band_live ? URGENCY_TONE[row.urgency_band_live] : null;
  const authorityNow = row.authority_required_live ?? row.authority_required ?? null;
  const appealBand = row.appeal_status_band_live ?? 'none';
  const floored = !!(row.enforcement_floor_flag_licence_revocation_proposed
    || row.enforcement_floor_flag_repeat_offender_within_36mo
    || row.enforcement_floor_flag_public_safety_impact_strict
    || row.enforcement_floor_flag_financial_quantum_over_50m
    || row.enforcement_floor_flag_criminal_referral_recommended);
  const [activeAction, setActiveAction] = useState<ActionSpec | null>(null);

  const handleActionSubmit = useCallback(async (paths: Array<{ path: string; body: Record<string, unknown> }>) => {
    setActiveAction(null);
    for (const { path, body } of paths) {
      await doAction(path, body);
    }
  }, [doAction]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (activeAction) { setActiveAction(null); } else { onClose(); } } };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose, activeAction]);

  return (
    <>
    {activeAction && (
      <ActionModal spec={activeAction} onSubmit={handleActionSubmit} onClose={() => setActiveAction(null)} />
    )}
    <div className="fixed inset-0 z-50 bg-black/30 flex items-stretch justify-end oe-overlay-in" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl shadow-xl overflow-y-auto oe-drawer-in" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-start justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">Enforcement case {row.enforcement_case_number}</div>
            <h3 className="text-[16px] font-semibold text-[#0f1c2e] mt-0.5">
              {row.respondent_party_label ?? row.respondent_party_id} - {row.respondent_licence_class ?? '-'} {' · '} {row.triggering_event_type ?? '-'}
            </h3>
            <div className="flex flex-wrap gap-2 mt-2 text-[12px]">
              <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: TIER_TONE[row.current_tier].bg, color: TIER_TONE[row.current_tier].fg }}>
                {TIER_TONE[row.current_tier].label}
              </span>
              <span className="px-2 py-0.5 rounded-full" style={{ background: STATE_TONE[cs].bg, color: STATE_TONE[cs].fg }}>
                {STATE_TONE[cs].label}
              </span>
              <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: APPEAL_TONE[appealBand].bg, color: APPEAL_TONE[appealBand].fg }}>
                {APPEAL_TONE[appealBand].label}
              </span>
              {urgencyTone && (
                <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: urgencyTone.bg, color: urgencyTone.fg }}>
                  {urgencyTone.label} urgency
                </span>
              )}
              {floored && (
                <span className="px-2 py-0.5 rounded-full font-bold bg-[#fff4d6] text-[#a06200]">FLOOR</span>
              )}
              {row.is_reportable_flag && (
                <span className="px-2 py-0.5 rounded-full bg-[#fde0e0] text-[#9b1f1f] font-medium">Regulator reportable</span>
              )}
              {row.gazette_publication_required_live && (
                <span className="px-2 py-0.5 rounded-full bg-[#fbd0d0] text-[#7a1414] font-medium">Gazette s38</span>
              )}
              {row.paja_fairness_at_risk_flag_live && (
                <span className="px-2 py-0.5 rounded-full bg-[#fde0e0] text-[#9b1f1f] font-medium">PAJA fairness at risk</span>
              )}
              {authorityNow && (
                <span className="px-2 py-0.5 rounded-full bg-[oklch(0.94_0.02_250)] text-[oklch(0.46_0.16_55)] font-medium">Auth: {AUTH_LABEL[authorityNow]}</span>
              )}
              {row.bridges_to_inspection_chain_live && (
                <span className="px-2 py-0.5 rounded-full bg-[oklch(0.94_0.02_250)] text-[oklch(0.46_0.16_55)] font-medium">W40 inspection bridge</span>
              )}
              {row.bridges_to_complaint_chain_live && (
                <span className="px-2 py-0.5 rounded-full bg-[#e8defc] text-[#5320a3] font-medium">W66 complaint bridge</span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[#6b7685] hover:text-[#0f1c2e]">X</button>
        </div>

        <div className="p-5 space-y-4 text-[13px]">
          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Sanction position</div>
            <div className="grid grid-cols-3 gap-3">
              <Pair label="Sanction quantum" value={fmtZar(row.sanction_quantum_zar_live ?? row.sanction_quantum_zar)} />
              <Pair label="Quantum floor" value={fmtZar(row.sanction_quantum_zar_floor)} />
              <Pair label="Collected" value={fmtZar(row.amount_collected_zar)} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Sanction type" value={row.sanction_type ?? '-'} />
              <Pair label="Effective" value={row.sanction_effective_at ? new Date(row.sanction_effective_at).toLocaleDateString() : '-'} />
              <Pair label="Sanction end" value={row.sanction_end_at ? new Date(row.sanction_end_at).toLocaleDateString() : '-'} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Repeat offences 36mo" value={`${row.repeat_offence_count_live ?? row.repeat_offender_count_36mo}`} />
              <Pair label="Cumulative sanctions" value={fmtZar(row.cumulative_sanctions_history_zar_live ?? row.cumulative_sanctions_history_zar)} />
              <Pair label="Enforcement method" value={row.enforcement_method ?? '-'} />
            </div>
          </div>

          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">s35 battery</div>
            <div className="grid grid-cols-4 gap-3">
              <Pair label="Adjudication" value={`${(row.adjudication_progress_pct_live ?? 0).toFixed(0)}%`} />
              <Pair label="Compliance idx" value={`${(row.enforcement_compliance_index_live ?? 0).toFixed(0)} / 130`} />
              <Pair label="SLA days left" value={row.sla_days_remaining_live != null ? fmtDays(row.sla_days_remaining_live) : '-'} />
              <Pair label="Appeal close" value={row.days_to_appeal_window_close_live != null ? fmtDays(row.days_to_appeal_window_close_live) : '-'} />
            </div>
            <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Notice issued" value={row.notice_issued_at ? new Date(row.notice_issued_at).toLocaleDateString() : '-'} />
              <Pair label="Response due" value={row.respondent_response_due_at ? new Date(row.respondent_response_due_at).toLocaleDateString() : '-'} />
              <Pair label="Adjudicated" value={row.adjudication_completed_at ? new Date(row.adjudication_completed_at).toLocaleDateString() : '-'} />
              <Pair label="Sanction imposed" value={row.sanction_imposed_at ? new Date(row.sanction_imposed_at).toLocaleDateString() : '-'} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Appeal window" value={row.appeal_window_close_at ? new Date(row.appeal_window_close_at).toLocaleDateString() : '-'} />
              <Pair label="Escalations" value={`${row.escalation_level}`} />
              <Pair label="Notice reference" value={row.notice_reference ?? '-'} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FlagPill on={!!row.enforcement_floor_flag_licence_revocation_proposed} label="Licence revocation proposed (STRATEGIC)" />
            <FlagPill on={!!row.enforcement_floor_flag_criminal_referral_recommended} label="Criminal referral recommended (STRATEGIC)" />
            <FlagPill on={!!row.enforcement_floor_flag_repeat_offender_within_36mo} label="Repeat offender 36mo (MATERIAL)" />
            <FlagPill on={!!row.enforcement_floor_flag_public_safety_impact_strict} label="Public safety impact (MATERIAL)" />
            <FlagPill on={!!row.enforcement_floor_flag_financial_quantum_over_50m} label="Quantum over R50m (MATERIAL)" />
            <FlagPill on={!!row.regulator_relevant} label="Regulator relevant" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {row.triggering_inspection_id && <Pair label="W40 inspection ref" value={row.triggering_inspection_id} />}
            {row.triggering_complaint_id && <Pair label="W66 complaint ref" value={row.triggering_complaint_id} />}
            {row.triggering_sla_breach_chain_ref && <Pair label="SLA breach ref" value={row.triggering_sla_breach_chain_ref} />}
            {row.triggering_reason_summary_text && <Pair label="Trigger summary" value={row.triggering_reason_summary_text} />}
            {row.respondent_licence_id && <Pair label="Licence ID" value={row.respondent_licence_id} />}
            {row.adjudication_panel_label && <Pair label="Adjudication panel" value={row.adjudication_panel_label} />}
            {row.adjudication_decision_text && <Pair label="Adjudication decision" value={row.adjudication_decision_text} />}
            {row.appeal_grounds_text && <Pair label="Appeal grounds" value={row.appeal_grounds_text} />}
            {row.appeal_outcome && <Pair label="Appeal outcome" value={row.appeal_outcome} />}
            {row.re_adjudication_decision_text && <Pair label="Re-adjudication" value={row.re_adjudication_decision_text} />}
            {row.respondent_position_text && <Pair label="Respondent position" value={row.respondent_position_text} />}
            {row.withdrawal_reason_code && <Pair label="Withdrawal reason" value={row.withdrawal_reason_code} />}
            {row.cancellation_reason_text && <Pair label="Cancel reason" value={row.cancellation_reason_text} />}
            {row.regulator_inbox_ref && <Pair label="Regulator inbox" value={row.regulator_inbox_ref} />}
            {row.regulator_ref && <Pair label="Regulator ref" value={row.regulator_ref} />}
          </div>

          {row.sla_deadline_at && !row.is_terminal && (
            <Pair label="Next SLA" value={`${new Date(row.sla_deadline_at).toLocaleString()} (${fmtMin(row.minutes_until_sla)})${row.escalation_level > 0 ? ` - ${row.escalation_level} breach(es)` : ''}`} />
          )}

          {transitionable && (
            <div className="border-t border-[#eef2f6] pt-4">
              <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Actions</div>
              <div className="flex flex-wrap gap-2">
                {cs === 'triggered' && (
                  <ActionBtn label="Draft notice (NERSA)" onClick={() => setActiveAction({
                    path: 'draft-notice', label: 'Draft notice (NERSA)',
                    fields: [
                      { key: 'notice_reference', label: 'Notice reference', placeholder: 'optional' },
                      { key: 'notice_legal_provisions', label: 'Legal provisions', placeholder: 'optional' },
                    ],
                  })} />
                )}
                {cs === 'notice_drafted' && (
                  <ActionBtn label="Issue notice (NERSA)" tone="good" onClick={() => setActiveAction({
                    path: 'issue-notice', label: 'Issue notice (NERSA)',
                    fields: [
                      { key: 'notice_reference', label: 'Notice reference', placeholder: 'optional' },
                      { key: 'respondent_response_due_at', label: 'Response due (ISO date)', placeholder: 'optional — default +21d' },
                    ],
                  })} />
                )}
                {cs === 'notice_issued' && (
                  <>
                    <ActionBtn label="Acknowledge notice (respondent)" onClick={() => { void doAction('acknowledge-notice', {}); }} />
                    <ActionBtn label="Submit response (respondent)" onClick={() => setActiveAction({
                      path: 'submit-response', label: 'Submit response (respondent)',
                      fields: [{ key: 'respondent_position_text', label: 'Respondent position', type: 'textarea', placeholder: 'Respondent position text' }],
                    })} />
                  </>
                )}
                {cs === 'respondent_acknowledged' && (
                  <>
                    <ActionBtn label="Submit response (respondent)" onClick={() => setActiveAction({
                      path: 'submit-response', label: 'Submit response (respondent)',
                      fields: [{ key: 'respondent_position_text', label: 'Respondent position', type: 'textarea', placeholder: 'Respondent position text' }],
                    })} />
                    <ActionBtn label="Start adjudication (panel)" onClick={() => setActiveAction({
                      path: 'start-adjudication', label: 'Start adjudication (panel)',
                      fields: [{ key: 'adjudication_panel_label', label: 'Adjudication panel label', placeholder: 'optional' }],
                    })} />
                  </>
                )}
                {cs === 'response_received' && (
                  <ActionBtn label="Start adjudication (panel)" onClick={() => setActiveAction({
                    path: 'start-adjudication', label: 'Start adjudication (panel)',
                    fields: [{ key: 'adjudication_panel_label', label: 'Adjudication panel label', placeholder: 'optional' }],
                  })} />
                )}
                {cs === 'adjudication_in_progress' && (
                  <ActionBtn label="Adjudicate (Council)" onClick={() => setActiveAction({
                    path: 'adjudicate', label: 'Adjudicate (Council)',
                    fields: [{ key: 'adjudication_decision_text', label: 'Adjudication decision', type: 'textarea', placeholder: 'Decision text' }],
                  })} />
                )}
                {(cs === 'adjudicated' || cs === 're_adjudicated') && (
                  <ActionBtn label="Impose sanction (Council)" tone="bad" onClick={() => setActiveAction({
                    path: 'impose-sanction', label: 'Impose sanction (Council)',
                    fields: [
                      { key: 'sanction_type', label: 'Sanction type', placeholder: 'fine / licence_suspended / licence_revoked / criminal_referral / order_to_cease' },
                      { key: 'sanction_quantum_zar', label: 'Sanction quantum ZAR', type: 'number', placeholder: 'optional' },
                      { key: 'sanction_effective_at', label: 'Sanction effective (ISO date)', placeholder: 'optional' },
                      { key: 'enforcement_floor_flag_licence_revocation_proposed', label: 'Licence revocation proposed?', type: 'checkbox', placeholder: 'Signature — crosses regulator every tier' },
                    ],
                  })} />
                )}
                {cs === 'sanction_imposed' && (
                  <>
                    <ActionBtn label="Open appeal window (NERSA)" onClick={() => setActiveAction({
                      path: 'open-appeal-window', label: 'Open appeal window (NERSA)',
                      fields: [{ key: 'appeal_window_close_at', label: 'Appeal window close (ISO date)', placeholder: 'optional — default +30d' }],
                    })} />
                    <ActionBtn label="Commence enforcement (NERSA)" tone="bad" onClick={() => setActiveAction({
                      path: 'commence-enforcement', label: 'Commence enforcement (NERSA)',
                      fields: [{ key: 'enforcement_method', label: 'Enforcement method', placeholder: 'writ / sheriff / garnishee / contempt' }],
                    })} />
                    <ActionBtn label="Mark settled (bilateral)" tone="good" onClick={() => setActiveAction({
                      path: 'mark-settled', label: 'Mark settled (bilateral)',
                      fields: [{ key: 'amount_collected_zar', label: 'Amount collected ZAR', type: 'number', placeholder: 'optional' }],
                    })} />
                  </>
                )}
                {cs === 'appeal_window_open' && (
                  <>
                    <ActionBtn label="Lodge appeal (respondent)" tone="bad" onClick={() => setActiveAction({
                      path: 'lodge-appeal', label: 'Lodge appeal (respondent)',
                      fields: [{ key: 'appeal_grounds_text', label: 'Appeal grounds', type: 'textarea', placeholder: 'Grounds for appeal' }],
                    })} />
                    <ActionBtn label="Commence enforcement (NERSA)" tone="bad" onClick={() => setActiveAction({
                      path: 'commence-enforcement', label: 'Commence enforcement (NERSA)',
                      fields: [{ key: 'enforcement_method', label: 'Enforcement method', placeholder: 'writ / sheriff / garnishee / contempt' }],
                    })} />
                    <ActionBtn label="Mark settled (bilateral)" tone="good" onClick={() => setActiveAction({
                      path: 'mark-settled', label: 'Mark settled (bilateral)',
                      fields: [{ key: 'amount_collected_zar', label: 'Amount collected ZAR', type: 'number', placeholder: 'optional' }],
                    })} />
                  </>
                )}
                {cs === 'appealed' && (
                  <ActionBtn label="Decide appeal (Council)" onClick={() => setActiveAction({
                    path: 'decide-appeal', label: 'Decide appeal (Council)',
                    fields: [
                      { key: 'appeal_outcome', label: 'Appeal outcome', placeholder: 'upheld / varied / dismissed / remitted' },
                      { key: 're_adjudication_decision_text', label: 'Re-adjudication decision (optional)', type: 'textarea', placeholder: 'optional' },
                    ],
                  })} />
                )}
                {cs === 're_adjudicated' && (
                  <>
                    <ActionBtn label="Re-impose sanction (Council)" tone="bad" onClick={() => setActiveAction({
                      path: 're-adjudicate', label: 'Re-impose sanction (Council)',
                      multiAction: [
                        { path: 're-adjudicate', fields: [{ key: 're_adjudication_decision_text', label: 'Re-adjudication decision', type: 'textarea' }] },
                        { path: 'impose-sanction', fields: [
                          { key: 'sanction_type', label: 'Sanction type', placeholder: 'fine / licence_suspended / licence_revoked / criminal_referral / order_to_cease' },
                          { key: 'sanction_quantum_zar', label: 'Sanction quantum ZAR', type: 'number', placeholder: 'optional' },
                        ]},
                      ],
                      fields: [
                        { key: 're_adjudication_decision_text', label: 'Re-adjudication decision', type: 'textarea' },
                        { key: 'sanction_type', label: 'Sanction type', placeholder: 'fine / licence_suspended / licence_revoked / criminal_referral / order_to_cease' },
                        { key: 'sanction_quantum_zar', label: 'Sanction quantum ZAR', type: 'number', placeholder: 'optional' },
                      ],
                    })} />
                    <ActionBtn label="Commence enforcement (NERSA)" tone="bad" onClick={() => setActiveAction({
                      path: 'commence-enforcement', label: 'Commence enforcement (NERSA)',
                      fields: [{ key: 'enforcement_method', label: 'Enforcement method', placeholder: 'writ / sheriff / garnishee / contempt' }],
                    })} />
                  </>
                )}
                {cs === 'enforcement_in_progress' && (
                  <ActionBtn label="Mark settled (bilateral)" tone="good" onClick={() => setActiveAction({
                    path: 'mark-settled', label: 'Mark settled (bilateral)',
                    fields: [{ key: 'amount_collected_zar', label: 'Amount collected ZAR', type: 'number', placeholder: 'optional' }],
                  })} />
                )}
                {cs === 'settled' && (
                  <ActionBtn label="Archive action (archiver)" onClick={() => { void doAction('archive-action', {}); }} />
                )}
                {cancellable && (
                  <>
                    <ActionBtn label="Withdraw action (NERSA)" onClick={() => setActiveAction({
                      path: 'withdraw-action', label: 'Withdraw action (NERSA)',
                      fields: [{ key: 'withdrawal_reason_code', label: 'Withdrawal reason code', placeholder: 'reason code' }],
                    })} />
                    <ActionBtn label="Cancel action (NERSA)" onClick={() => setActiveAction({
                      path: 'cancel-action', label: 'Cancel action (NERSA)',
                      fields: [{ key: 'cancellation_reason_text', label: 'Cancellation reason', type: 'textarea', placeholder: 'reason' }],
                    })} />
                  </>
                )}
              </div>
            </div>
          )}

          <div className="border-t border-[#eef2f6] pt-4">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Timeline</div>
            <div className="space-y-2">
              {events.length === 0 ? (
                <div className="text-[12px] text-[#6b7685]">No events yet.</div>
              ) : events.map((e) => {
                const partyTone = PARTY_TONE[e.actor_party ?? 'system'] ?? PARTY_TONE.system;
                return (
                  <div key={e.id} className="flex gap-3 text-[12px] border-l-2 border-[#e5ebf2] pl-3 py-1">
                    <span className="font-mono text-[11px] text-[#6b7685] whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</span>
                    <div>
                      <span className="font-semibold text-[#0f1c2e]">{e.event_type}</span>
                      {e.actor_party && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium uppercase" style={{ background: partyTone.bg, color: partyTone.fg }}>
                          {e.actor_party}
                        </span>
                      )}
                      {e.from_status && e.to_status && e.from_status !== e.to_status && (
                        <span className="text-[#6b7685]"> {'· '}{e.from_status} {'→'} {e.to_status}</span>
                      )}
                      {e.notes && <div className="text-[#4a5568] mt-0.5">{e.notes}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className="text-[#0f1c2e] mt-0.5">{value}</div>
    </div>
  );
}

function FlagPill({ on, label }: { on: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded-md text-[12px] ${on ? 'bg-[#fff4d6] text-[#a06200] border border-[#f4d68f]' : 'bg-[#f7f9fb] text-[#6b7685] border border-[#e5ebf2]'}`}>
      <span className={`inline-block w-2 h-2 rounded-full ${on ? 'bg-[#a06200]' : 'bg-[#cbd5e0]'}`} />
      <span>{label}</span>
    </div>
  );
}

function ActionBtn({ label, onClick, tone = 'neutral' }: { label: string; onClick: () => void; tone?: 'neutral' | 'good' | 'bad' }) {
  const bg = tone === 'good' ? 'bg-emerald-700' : tone === 'bad' ? 'bg-red-700' : 'bg-[#c2873a]';
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 ${bg} text-white text-[12px] rounded-md hover:opacity-90`}>
      {label}
    </button>
  );
}
