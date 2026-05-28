// Wave 52 — Trader Market Abuse Surveillance & STOR chain.
//
// Financial Markets Act 19 of 2012 Chapter X (ss.78-82 prohibited trading
// practices) + the FSCA market-abuse regime + STOR (Suspicious Transaction and
// Order Report) obligations. The surveillance complement to the desk's own
// chains (W2 VaR, W9 MM compliance, W29 position limits, W36 best-execution,
// W44 trade-reporting): W52 governs whether the conduct itself was abusive.
//
//   alert_raised → triaged → under_investigation → evidence_review →
//   analysis_complete → cleared (no abuse)
//   (escalation: analysis_complete → stor_filed → regulator_referred →
//    enforcement_action → sanctioned; + dismiss early-exit, dispute branch)
//
// Single-party write — the trader is the SUBJECT of the case and cannot action
// their own surveillance file. WRITE = {admin (surveillance fn), regulator};
// the desk has READ only. URGENT SLA: larger risk = tighter window. file_stor
// crosses to the FSCA for EVERY tier (a STOR is by definition a filing to the
// regulator) — the W52 signature; sanction + SLA breach cross for critical tiers.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'alert_raised' | 'triaged' | 'under_investigation' | 'evidence_review'
  | 'analysis_complete' | 'cleared' | 'stor_filed' | 'regulator_referred'
  | 'enforcement_action' | 'sanctioned' | 'disputed' | 'dispute_resolved';

type AbuseTier = 'info_alert' | 'low_risk' | 'medium_risk' | 'high_risk' | 'critical_abuse';

type Party = 'surveillance' | 'regulator' | 'subject' | 'system';

interface MarketAbuseRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  subject_party_id: string;
  subject_party_name: string;
  surveillance_party_id: string;
  surveillance_party_name: string;
  abuse_tier: AbuseTier;
  typology: string;
  alert_source: string | null;
  instrument: string | null;
  energy_type: string | null;
  product: string | null;
  venue: string | null;
  risk_score: number | null;
  suspect_volume_mwh: number | null;
  suspect_value_zar_m: number | null;
  estimated_benefit_zar: number | null;
  penalty_zar: number | null;
  triage_ref: string | null;
  investigation_ref: string | null;
  evidence_ref: string | null;
  analysis_ref: string | null;
  stor_ref: string | null;
  referral_ref: string | null;
  enforcement_ref: string | null;
  sanction_ref: string | null;
  dispute_ref: string | null;
  regulator_ref: string | null;
  triage_basis: string | null;
  investigation_basis: string | null;
  evidence_basis: string | null;
  analysis_basis: string | null;
  stor_basis: string | null;
  sanction_basis: string | null;
  dispute_basis: string | null;
  reason_code: string | null;
  resolution_notes: string | null;
  notes: string | null;
  dispute_round: number;
  chain_status: ChainStatus;
  alert_raised_at: string;
  triaged_at: string | null;
  under_investigation_at: string | null;
  evidence_review_at: string | null;
  analysis_complete_at: string | null;
  cleared_at: string | null;
  stor_filed_at: string | null;
  regulator_referred_at: string | null;
  enforcement_action_at: string | null;
  sanctioned_at: string | null;
  disputed_at: string | null;
  dispute_resolved_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  is_reportable_tier?: boolean;
  breach_crosses_regulator?: boolean;
  sla_window_minutes?: number;
}

interface MarketAbuseEvent {
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

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  alert_raised:        { bg: '#e3e7ec', fg: '#445',    label: 'Alert raised' },
  triaged:             { bg: '#dbecfb', fg: '#1a3a5c', label: 'Triaged' },
  under_investigation: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Under investigation' },
  evidence_review:     { bg: '#fff4d6', fg: '#a06200', label: 'Evidence review' },
  analysis_complete:   { bg: '#fff4d6', fg: '#a06200', label: 'Analysis complete' },
  cleared:             { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Cleared' },
  stor_filed:          { bg: '#fcc3c3', fg: '#7a0e0e', label: 'STOR filed' },
  regulator_referred:  { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Regulator referred' },
  enforcement_action:  { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Enforcement action' },
  sanctioned:          { bg: '#7a0e0e', fg: '#fff',    label: 'Sanctioned' },
  disputed:            { bg: '#fbe7d0', fg: '#7a4500', label: 'Disputed' },
  dispute_resolved:    { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Dispute resolved' },
};

const TIER_TONE: Record<AbuseTier, { bg: string; fg: string; label: string }> = {
  info_alert:    { bg: '#e3e7ec', fg: '#557',    label: 'Info alert' },
  low_risk:      { bg: '#daf5e2', fg: '#1f6b3a', label: 'Low risk' },
  medium_risk:   { bg: '#fff4d6', fg: '#a06200', label: 'Medium risk' },
  high_risk:     { bg: '#fde0e0', fg: '#9b1f1f', label: 'High risk' },
  critical_abuse:{ bg: '#7a0e0e', fg: '#fff',    label: 'Critical abuse' },
};

const PARTY_TONE: Record<Party, { bg: string; fg: string }> = {
  surveillance: { bg: '#dbecfb', fg: '#1a3a5c' },
  regulator:    { bg: '#ede0fb', fg: '#5b2a8a' },
  subject:      { bg: '#fbe7d0', fg: '#7a4500' },
  system:       { bg: '#eef1f5', fg: '#445' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',             label: 'Active' },
  { key: 'all',                label: 'All' },
  { key: 'reportable',         label: 'FSCA reportable' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'info_alert',         label: 'Info alert' },
  { key: 'low_risk',           label: 'Low risk' },
  { key: 'medium_risk',        label: 'Medium risk' },
  { key: 'high_risk',          label: 'High risk' },
  { key: 'critical_abuse',     label: 'Critical abuse' },
  { key: 'alert_raised',       label: 'Raised' },
  { key: 'triaged',            label: 'Triaged' },
  { key: 'under_investigation',label: 'Investigating' },
  { key: 'evidence_review',    label: 'Evidence' },
  { key: 'analysis_complete',  label: 'Analysed' },
  { key: 'stor_filed',         label: 'STOR filed' },
  { key: 'regulator_referred', label: 'Referred' },
  { key: 'enforcement_action', label: 'Enforcement' },
  { key: 'sanctioned',         label: 'Sanctioned' },
  { key: 'disputed',           label: 'Disputed' },
  { key: 'cleared',            label: 'Cleared' },
];

type ActionKind =
  | 'triage' | 'open-investigation' | 'compile-evidence' | 'complete-analysis'
  | 'clear' | 'dismiss' | 'file-stor' | 'refer-regulator' | 'commence-enforcement'
  | 'sanction' | 'raise-dispute' | 'resolve-dispute';

// Primary forward-path action surfaced per resting state. analysis_complete
// defaults to the escalation path (file STOR); "clear" is offered alongside.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  alert_raised:        'triage',
  triaged:             'open-investigation',
  under_investigation: 'compile-evidence',
  evidence_review:     'complete-analysis',
  analysis_complete:   'file-stor',
  stor_filed:          'refer-regulator',
  regulator_referred:  'commence-enforcement',
  enforcement_action:  'sanction',
  disputed:            'resolve-dispute',
  cleared:             null,
  sanctioned:          null,
  dispute_resolved:    null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'triage':              'Triage (Surveillance)',
  'open-investigation':  'Open investigation (Surveillance)',
  'compile-evidence':    'Compile evidence (Surveillance)',
  'complete-analysis':   'Complete analysis (Surveillance)',
  'clear':               'Clear — no abuse (Surveillance)',
  'dismiss':             'Dismiss (Surveillance)',
  'file-stor':           'File STOR → FSCA (Surveillance)',
  'refer-regulator':     'Refer to regulator (Regulator)',
  'commence-enforcement':'Commence enforcement (Regulator)',
  'sanction':            'Impose sanction (Regulator)',
  'raise-dispute':       'Raise dispute (Subject)',
  'resolve-dispute':     'Resolve dispute (Regulator)',
};

// Branch / secondary actions available alongside the primary forward action.
const DISMISSABLE: ChainStatus[] = ['alert_raised', 'triaged'];
const CLEARABLE: ChainStatus[] = ['analysis_complete'];
const DISPUTABLE: ChainStatus[] = ['analysis_complete', 'stor_filed', 'regulator_referred', 'enforcement_action'];

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

// suspect_value_zar_m is stored in millions of ZAR.
function fmtZarM(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1000) return `R${(n / 1000).toFixed(2)}bn`;
  return `R${n.toFixed(1)}m`;
}

// penalty_zar / estimated_benefit_zar are stored in whole ZAR.
function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1000) return `R${(n / 1000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

function fmtMWh(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('en-ZA')}MWh`;
}

interface KpiSummary {
  total: number;
  open_count: number;
  cleared_count: number;
  stor_filed_count: number;
  sanctioned_count: number;
  disputed_open: number;
  investigating: number;
  breached: number;
  reportable_total: number;
  critical_open: number;
  total_suspect_value_zar_m: number;
  total_penalty_zar: number;
  total_estimated_benefit_zar: number;
}

export function MarketAbuseChainTab() {
  const [rows, setRows] = useState<MarketAbuseRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<MarketAbuseRow | null>(null);
  const [events, setEvents] = useState<MarketAbuseEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: MarketAbuseRow[] } & KpiSummary }>('/market-abuse/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          open_count: data.open_count || 0,
          cleared_count: data.cleared_count || 0,
          stor_filed_count: data.stor_filed_count || 0,
          sanctioned_count: data.sanctioned_count || 0,
          disputed_open: data.disputed_open || 0,
          investigating: data.investigating || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          critical_open: data.critical_open || 0,
          total_suspect_value_zar_m: data.total_suspect_value_zar_m || 0,
          total_penalty_zar: data.total_penalty_zar || 0,
          total_estimated_benefit_zar: data.total_estimated_benefit_zar || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load market-abuse surveillance chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: MarketAbuseRow; events: MarketAbuseEvent[] } }>(`/market-abuse/chain/${id}`);
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
      if (filter === 'reportable') return r.is_reportable_tier;
      if (filter === 'breached')   return r.sla_breached;
      if (['info_alert', 'low_risk', 'medium_risk', 'high_risk', 'critical_abuse'].includes(filter)) {
        return r.abuse_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, open_count: 0, cleared_count: 0, stor_filed_count: 0,
    sanctioned_count: 0, disputed_open: 0, investigating: 0, breached: 0,
    reportable_total: 0, critical_open: 0, total_suspect_value_zar_m: 0,
    total_penalty_zar: 0, total_estimated_benefit_zar: 0,
  };

  const act = useCallback(async (action: ActionKind, row: MarketAbuseRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'triage') {
        const tier = window.prompt('Abuse tier (info_alert / low_risk / medium_risk / high_risk / critical_abuse) — leave blank to keep:', row.abuse_tier);
        if (tier && tier !== row.abuse_tier) body.abuse_tier = tier;
        const basis = window.prompt('Triage basis (initial assessment of the alert):', row.triage_basis ?? '');
        if (basis) body.triage_basis = basis;
        const ref = window.prompt('Triage reference (optional):', row.triage_ref ?? '');
        if (ref) body.triage_ref = ref;
      } else if (action === 'open-investigation') {
        const basis = window.prompt('Investigation basis (why a full investigation is warranted):', row.investigation_basis ?? '');
        if (basis) body.investigation_basis = basis;
        const ref = window.prompt('Investigation reference (optional):', row.investigation_ref ?? '');
        if (ref) body.investigation_ref = ref;
      } else if (action === 'compile-evidence') {
        const basis = window.prompt('Evidence basis (order/trade records, comms, patterns compiled):', row.evidence_basis ?? '');
        if (basis) body.evidence_basis = basis;
        const ref = window.prompt('Evidence reference (optional):', row.evidence_ref ?? '');
        if (ref) body.evidence_ref = ref;
      } else if (action === 'complete-analysis') {
        const basis = window.prompt('Analysis basis (conclusion of the surveillance analysis):', row.analysis_basis ?? '');
        if (basis) body.analysis_basis = basis;
        const benefit = window.prompt('Estimated benefit to the subject in ZAR (optional):', row.estimated_benefit_zar != null ? String(row.estimated_benefit_zar) : '');
        if (benefit && !Number.isNaN(Number(benefit))) body.estimated_benefit_zar = Number(benefit);
        const ref = window.prompt('Analysis reference (optional):', row.analysis_ref ?? '');
        if (ref) body.analysis_ref = ref;
      } else if (action === 'clear') {
        const notes = window.prompt('Clearance notes (why no abuse was found — required for audit):', row.resolution_notes ?? '');
        if (!notes) return;
        body.resolution_notes = notes;
        body.reason_code = 'no_abuse_found';
      } else if (action === 'dismiss') {
        const notes = window.prompt('Dismissal notes (why the alert is dismissed at triage — false positive / de-minimis):');
        if (!notes) return;
        body.resolution_notes = notes;
        body.reason_code = 'false_positive';
      } else if (action === 'file-stor') {
        const basis = window.prompt('STOR basis — the suspicious transaction/order grounds. A STOR crosses to the FSCA for EVERY tier:', row.stor_basis ?? '');
        if (!basis) return;
        body.stor_basis = basis;
        const ref = window.prompt('STOR reference (filing ID):', row.stor_ref ?? '');
        if (ref) body.stor_ref = ref;
        const reg = window.prompt('Regulator reference (optional):', row.regulator_ref ?? '');
        if (reg) body.regulator_ref = reg;
      } else if (action === 'refer-regulator') {
        const ref = window.prompt('Referral reference (regulator case ID):', row.referral_ref ?? '');
        if (ref) body.referral_ref = ref;
        const reg = window.prompt('Regulator reference (optional):', row.regulator_ref ?? '');
        if (reg) body.regulator_ref = reg;
      } else if (action === 'commence-enforcement') {
        const ref = window.prompt('Enforcement reference (enforcement action ID):', row.enforcement_ref ?? '');
        if (ref) body.enforcement_ref = ref;
      } else if (action === 'sanction') {
        const basis = window.prompt('Sanction basis — the determination grounds:', row.sanction_basis ?? '');
        if (!basis) return;
        body.sanction_basis = basis;
        const penalty = window.prompt('Penalty in ZAR (optional):', row.penalty_zar != null ? String(row.penalty_zar) : '');
        if (penalty && !Number.isNaN(Number(penalty))) body.penalty_zar = Number(penalty);
        const ref = window.prompt('Sanction reference (optional):', row.sanction_ref ?? '');
        if (ref) body.sanction_ref = ref;
        body.reason_code = 'sanction_imposed';
      } else if (action === 'raise-dispute') {
        const basis = window.prompt('Dispute basis — the subject’s grounds for disputing the finding:', row.dispute_basis ?? '');
        if (!basis) return;
        body.dispute_basis = basis;
        const ref = window.prompt('Dispute reference (optional):', row.dispute_ref ?? '');
        if (ref) body.dispute_ref = ref;
        body.reason_code = 'subject_dispute';
      } else if (action === 'resolve-dispute') {
        const notes = window.prompt('Resolution notes (how the dispute was resolved — required for audit):', row.resolution_notes ?? '');
        if (!notes) return;
        body.resolution_notes = notes;
        body.reason_code = 'dispute_resolved';
      }
      await api.post(`/market-abuse/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Market Abuse Surveillance &amp; STOR — FMA 2012 Ch. X + FSCA</h2>
          <p className="text-xs text-[#4a5568]">
            12-state lifecycle for every surveillance alert raised against the order/trade flow: alert raised →
            triaged → under investigation → evidence review → analysis complete → cleared (no abuse), with
            escalation to STOR filed → regulator referred → enforcement → sanctioned, plus triage dismissal and a
            subject dispute branch. URGENT SLA: higher risk = tighter window. The desk is the SUBJECT and is
            read-only — only Surveillance and the regulator act. A STOR crosses to the FSCA for EVERY tier; a
            sanction or surveillance SLA breach crosses for critical tiers.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"          value={kpis.total} />
        <Kpi label="Open"           value={kpis.open_count}    tone={kpis.open_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Investigating"  value={kpis.investigating} tone={kpis.investigating > 0 ? 'warn' : 'ok'} />
        <Kpi label="STOR filed"     value={kpis.stor_filed_count} tone={kpis.stor_filed_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Sanctioned"     value={kpis.sanctioned_count} tone={kpis.sanctioned_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"   value={kpis.breached}      tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable"     value={kpis.reportable_total} />
        <Kpi label="Critical open"  value={kpis.critical_open} tone={kpis.critical_open > 0 ? 'bad' : 'ok'} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Cleared: <span className="font-semibold text-[#1f5b3a]">{kpis.cleared_count}</span></span>
        <span>Disputed open: <span className="font-semibold text-[#7a4500]">{kpis.disputed_open}</span></span>
        <span>Suspect value: <span className="font-semibold text-[#1a3a5c]">{fmtZarM(kpis.total_suspect_value_zar_m)}</span></span>
        <span>Penalties: <span className="font-semibold text-[#7a0e0e]">{fmtZar(kpis.total_penalty_zar)}</span></span>
        <span>Est. benefit: <span className="font-semibold text-[#9b1f1f]">{fmtZar(kpis.total_estimated_benefit_zar)}</span></span>
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Subject</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Typology</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Risk</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Suspect value</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.abuse_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      {r.case_number}
                      {r.is_reportable_tier && <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">FSCA</span>}
                    </td>
                    <td className="px-3 py-2 text-[#1a3a5c]">{r.subject_party_name}</td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      <div className="text-[11px]">{r.typology}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.instrument ?? r.product ?? '—'} · {r.energy_type ?? '—'}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{r.risk_score ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{fmtZarM(r.suspect_value_zar_m)}</td>
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
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[#4a5568]">No cases match.</td></tr>
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
  row: MarketAbuseRow;
  events: MarketAbuseEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: MarketAbuseRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canClear = CLEARABLE.includes(row.chain_status);
  const canDismiss = DISMISSABLE.includes(row.chain_status);
  const canDispute = DISPUTABLE.includes(row.chain_status);

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
              <div className="text-base font-semibold text-[#0c2a4d]">{row.subject_party_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.abuse_tier].label} · {row.typology} · {row.instrument ?? row.product ?? '—'} · {row.energy_type ?? '—'}
              </div>
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Subject"            value={row.subject_party_name} />
            <Pair label="Surveillance"       value={row.surveillance_party_name} />
            <Pair label="Tier"               value={TIER_TONE[row.abuse_tier].label} />
            <Pair label="Typology"           value={row.typology} />
            <Pair label="Alert source"       value={row.alert_source ?? '—'} />
            <Pair label="Risk score"         value={row.risk_score != null ? String(row.risk_score) : '—'} />
            <Pair label="Instrument"         value={row.instrument ?? '—'} />
            <Pair label="Product"            value={row.product ?? '—'} />
            <Pair label="Energy type"        value={row.energy_type ?? '—'} />
            <Pair label="Venue"              value={row.venue ?? '—'} />
            <Pair label="Suspect volume"     value={fmtMWh(row.suspect_volume_mwh)} />
            <Pair label="Suspect value"      value={fmtZarM(row.suspect_value_zar_m)} />
            <Pair label="Estimated benefit"  value={fmtZar(row.estimated_benefit_zar)} />
            <Pair label="Penalty"            value={fmtZar(row.penalty_zar)} />
            <Pair label="Triage ref"         value={row.triage_ref ?? '—'} />
            <Pair label="Investigation ref"  value={row.investigation_ref ?? '—'} />
            <Pair label="Evidence ref"       value={row.evidence_ref ?? '—'} />
            <Pair label="Analysis ref"       value={row.analysis_ref ?? '—'} />
            <Pair label="STOR ref"           value={row.stor_ref ?? '—'} />
            <Pair label="Referral ref"       value={row.referral_ref ?? '—'} />
            <Pair label="Enforcement ref"    value={row.enforcement_ref ?? '—'} />
            <Pair label="Sanction ref"       value={row.sanction_ref ?? '—'} />
            <Pair label="Dispute ref"        value={row.dispute_ref ?? '—'} />
            <Pair label="Regulator ref"      value={row.regulator_ref ?? '—'} />
            <Pair label="Dispute round"      value={String(row.dispute_round)} />
            <Pair label="Reportable"         value={row.is_reportable_tier ? 'Yes (FSCA)' : 'No'} />
            <Pair label="State"              value={STATE_TONE[row.chain_status].label} />
            <Pair label="Escalation"         value={String(row.escalation_level)} />
            <Pair label="SLA window"         value={fmtMinutes(row.sla_window_minutes)} />
            <Pair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"         value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Alert raised"       value={fmtDate(row.alert_raised_at)} />
            <Pair label="Reason code"        value={row.reason_code ?? '—'} />
            {row.source_wave && <Pair label="Provenance" value={`${row.source_wave} · ${row.source_entity_id ?? ''}`} />}
          </div>
          {row.triage_basis && (
            <div className="mt-3 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Triage basis</div>
              {row.triage_basis}
            </div>
          )}
          {row.investigation_basis && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Investigation basis</div>
              {row.investigation_basis}
            </div>
          )}
          {row.evidence_basis && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Evidence basis</div>
              {row.evidence_basis}
            </div>
          )}
          {row.analysis_basis && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Analysis basis</div>
              {row.analysis_basis}
            </div>
          )}
          {row.stor_basis && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              <div className="text-[10px] uppercase tracking-wider text-red-700 mb-1">STOR basis</div>
              {row.stor_basis}
            </div>
          )}
          {row.sanction_basis && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              <div className="text-[10px] uppercase tracking-wider text-red-700 mb-1">Sanction basis</div>
              {row.sanction_basis}
            </div>
          )}
          {row.dispute_basis && (
            <div className="mt-2 rounded border border-[#fbe7d0] bg-[#fffaf0] px-3 py-2 text-[12px] text-[#7a4500]">
              <div className="text-[10px] uppercase tracking-wider text-[#a06200] mb-1">Dispute basis</div>
              {row.dispute_basis}
            </div>
          )}
          {row.resolution_notes && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Resolution notes</div>
              {row.resolution_notes}
            </div>
          )}
        </section>

        {(nextAction || canClear || canDismiss || canDispute) && (
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
              {canClear && (
                <button
                  onClick={() => onAct('clear', row)}
                  className="rounded border border-[#9bc7a8] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1f6b3a] hover:bg-[#f0faf3]"
                >
                  {ACTION_LABEL['clear']}
                </button>
              )}
              {canDismiss && (
                <button
                  onClick={() => onAct('dismiss', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['dismiss']}
                </button>
              )}
              {canDispute && (
                <button
                  onClick={() => onAct('raise-dispute', row)}
                  className="rounded border border-[#e0b070] bg-white px-3 py-1.5 text-[12px] font-medium text-[#8a4a00] hover:bg-[#fffaf0]"
                >
                  {ACTION_LABEL['raise-dispute']}
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
              {events.map((e) => {
                const party = (e.actor_party as Party) || 'system';
                const pt = PARTY_TONE[party] ?? PARTY_TONE.system;
                return (
                  <li key={e.id} className="rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#0c2a4d]">{e.event_type}</span>
                      <span className="text-[#4a5568] tabular-nums">{fmtDate(e.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {(e.from_status || e.to_status) && (
                        <span className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</span>
                      )}
                      {e.actor_party && (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: pt.bg, color: pt.fg }}>{e.actor_party}</span>
                      )}
                    </div>
                    {e.notes && <div className="mt-1 text-[#1a3a5c]">{e.notes}</div>}
                  </li>
                );
              })}
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

export default MarketAbuseChainTab;
