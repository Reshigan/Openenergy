// Wave 90 - Trader JIBAR Cessation Benchmark Transition tab.
//
// Post-execution transition of legacy benchmark trades (JIBAR 1m/3m/6m/12m
// referenced IRS, basis swaps, FRAs, FRNs, syndicated loans, structured notes,
// cross-currency swaps) onto ZARONIA-based replacement rates with ISDA spread
// adjustment, ISDA 2020 Protocol adherence, value-transfer settlement, and
// SARB Market Practitioners Group integrity oversight. The SA equivalent of
// the global LIBOR cessation programme: a fixed-window programme that ends
// no later than the cessation date, with a TRANSITION-INTEGRITY signature
// that crosses the regulator inbox on terminate_legacy EVERY tier (SARB MPG
// hard line), complete_transition on material+systemic, raise_dispute on
// systemic only, and SLA breach on material+systemic.
//
// DISTINCTIVE move (beat Bloomberg AIM BSBY transition / Refinitiv Eikon
// IBOR-transition / ICE LIBOR fallbacks / FINASTRA Loan IQ / MUREX MX.3
// transition / Calypso Capital Markets / NumeriX CrossAsset / Markit Wire
// / DTCC Transition Coordination Centre): the chain is a LIVE PORTFOLIO-
// INTEGRITY PROGRAMME with re-derived tier (RE-DERIVED EVERY transition
// from notional + interbank + days-to-cessation, floor-at-material when
// interbank OR <30d-to-cessation), transition-risk battery (PV01 ZAR,
// value-transfer ZAR, ISDA spread bps, compounded ZARONIA, days-to-
// cessation, counterparty response %, hedge effectiveness, predicted
// resolution days, urgency band, systemic-carrier flag), and signature
// crossings hard-wired to fallback class, tier and SLA polarity.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'inventoried' | 'impact_assessed' | 'classified' | 'notified'
  | 'responded' | 'amendment_drafted' | 'amendment_executed' | 'vt_settled'
  | 'transitioned_clean' | 'disputed' | 'on_hold'
  | 'terminated_legacy' | 'cancelled';

type Tier = 'minor' | 'standard' | 'material' | 'systemic';
type UrgencyBand = 'green' | 'amber' | 'red' | 'critical';

interface BxtRow {
  id: string;
  transition_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  trade_ref: string;
  instrument_type: string;
  legacy_benchmark: string;
  replacement_rate: string | null;
  fallback_class: string | null;
  counterparty_id: string;
  counterparty_name: string;
  counterparty_interbank: number;
  counterparty_nav_zar: number;
  notional_zar: number;
  remaining_years: number;
  trade_start_at: string | null;
  trade_maturity_at: string | null;
  cessation_date: string;
  zaronia_overnight: number;
  isda_spread_bps: number;
  pv01_zar: number;
  value_transfer_zar: number;
  compounded_zaronia_rate: number;
  hedge_effective_flag: number;
  protocol_adherence_flag: number;
  counterparty_response_pct: number;
  dispute_concentration: number;
  predicted_resolution_days: number | null;
  days_to_cessation: number | null;
  transition_tier: Tier;
  last_action_ref: string | null;
  regulator_ref: string | null;
  transition_summary: string | null;
  chain_status: ChainStatus;
  inventoried_at: string;
  impact_assessed_at: string | null;
  classified_at: string | null;
  notified_at: string | null;
  responded_at: string | null;
  amendment_drafted_at: string | null;
  amendment_executed_at: string | null;
  vt_settled_at: string | null;
  transitioned_clean_at: string | null;
  disputed_at: string | null;
  on_hold_at: string | null;
  terminated_legacy_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  days_to_cessation_live?: number | null;
  pv01_zar_live?: number;
  value_transfer_zar_live?: number;
  fallback_basis_bps_live?: number;
  compounded_zaronia_rate_live?: number;
  hedge_effective_flag_live?: number;
  predicted_resolution_days_live?: number | null;
  urgency_band_live?: UrgencyBand;
  systemic_carrier_live?: boolean;
  interbank_flag_live?: boolean;
}

interface BxtEvent {
  id: string;
  transition_id: string;
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
  inventoried_count: number;
  impact_assessed_count: number;
  classified_count: number;
  notified_count: number;
  responded_count: number;
  amendment_drafted_count: number;
  amendment_executed_count: number;
  vt_settled_count: number;
  transitioned_clean_count: number;
  disputed_count: number;
  on_hold_count: number;
  terminated_legacy_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  systemic_count: number;
  material_count: number;
  interbank_count: number;
  critical_urgency_count: number;
  total_notional_zar: number;
  total_open_notional_zar: number;
  total_pv01_zar: number;
  total_value_transfer_zar: number;
  protocol_adoption_pct: number;
  transitioned_clean_pct: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  inventoried:        { bg: '#e3e7ec', fg: '#557',    label: 'Inventoried' },
  impact_assessed:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Impact assessed' },
  classified:         { bg: '#dbecfb', fg: '#1a3a5c', label: 'Fallback classified' },
  notified:           { bg: '#fff4d6', fg: '#a06200', label: 'Counterparty notified' },
  responded:          { bg: '#fff4d6', fg: '#a06200', label: 'Response recorded' },
  amendment_drafted:  { bg: '#ffe9d6', fg: '#8a4a00', label: 'Amendment drafted' },
  amendment_executed: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Amendment executed' },
  vt_settled:         { bg: '#daf5e2', fg: '#1f6b3a', label: 'Value transfer settled' },
  transitioned_clean: { bg: '#c6efd6', fg: '#125a2d', label: 'Transitioned clean' },
  disputed:           { bg: '#fde0e0', fg: '#9b1f1f', label: 'Disputed' },
  on_hold:            { bg: '#e3e7ec', fg: '#557',    label: 'On hold' },
  terminated_legacy:  { bg: '#fde0e0', fg: '#9b1f1f', label: 'Legacy terminated' },
  cancelled:          { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
  standard: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard' },
  material: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Material' },
  systemic: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Systemic' },
};

const URGENCY_TONE: Record<UrgencyBand, { bg: string; fg: string; label: string }> = {
  green:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Green' },
  amber:    { bg: '#fff4d6', fg: '#a06200', label: 'Amber' },
  red:      { bg: '#ffe4b5', fg: '#8a4a00', label: 'Red' },
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',               label: 'Open' },
  { key: 'all',                label: 'All' },
  { key: 'minor',              label: 'Minor' },
  { key: 'standard',           label: 'Standard' },
  { key: 'material',           label: 'Material' },
  { key: 'systemic',           label: 'Systemic' },
  { key: 'disputed',           label: 'Disputed' },
  { key: 'on_hold',            label: 'On hold' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'reportable',         label: 'Reportable' },
  { key: 'interbank',          label: 'Interbank' },
  { key: 'transitioned_clean', label: 'Transitioned' },
  { key: 'terminated_legacy',  label: 'Terminated' },
  { key: 'cancelled',          label: 'Cancelled' },
];

type ActionKind =
  | 'assess-impact' | 'classify-fallback' | 'notify-counterparty'
  | 'record-response' | 'draft-amendment' | 'execute-amendment'
  | 'settle-vt' | 'complete-transition'
  | 'raise-dispute' | 'resolve-dispute'
  | 'place-on-hold' | 'resume'
  | 'terminate-legacy' | 'cancel';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  inventoried:        'assess-impact',
  impact_assessed:    'classify-fallback',
  classified:         'notify-counterparty',
  notified:           'record-response',
  responded:          'draft-amendment',
  amendment_drafted:  'execute-amendment',
  amendment_executed: 'settle-vt',
  vt_settled:         'complete-transition',
  disputed:           'resolve-dispute',
  on_hold:            'resume',
  transitioned_clean: null,
  terminated_legacy:  null,
  cancelled:          null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'assess-impact':       'Assess impact (risk validation)',
  'classify-fallback':   'Classify fallback (docs / legal)',
  'notify-counterparty': 'Notify counterparty (transition desk)',
  'record-response':     'Record counterparty response',
  'draft-amendment':     'Draft confirmation amendment (docs / legal)',
  'execute-amendment':   'Execute amendment (docs / legal)',
  'settle-vt':           'Settle value transfer (counterparty credit)',
  'complete-transition': 'Complete transition',
  'raise-dispute':       'Raise dispute',
  'resolve-dispute':     'Resolve dispute',
  'place-on-hold':       'Place on hold',
  'resume':              'Resume transition',
  'terminate-legacy':    'Terminate legacy trade (last resort)',
  'cancel':              'Cancel transition',
};

const SECONDARY_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  inventoried:        ['place-on-hold', 'cancel'],
  impact_assessed:    ['raise-dispute', 'place-on-hold', 'cancel'],
  classified:         ['raise-dispute', 'place-on-hold', 'cancel'],
  notified:           ['raise-dispute', 'place-on-hold', 'cancel'],
  responded:          ['raise-dispute', 'place-on-hold', 'cancel'],
  amendment_drafted:  ['raise-dispute', 'place-on-hold', 'terminate-legacy', 'cancel'],
  amendment_executed: ['raise-dispute', 'terminate-legacy'],
  vt_settled:         ['raise-dispute'],
  disputed:           ['terminate-legacy', 'cancel'],
  on_hold:            ['cancel'],
  transitioned_clean: [],
  terminated_legacy:  [],
  cancelled:          [],
};

const DESTRUCTIVE: ActionKind[] = ['raise-dispute', 'terminate-legacy', 'cancel', 'place-on-hold'];

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '-';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  if (Math.abs(v) >= 1_000_000_000) return `R${(v / 1_000_000_000).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}bn`;
  if (Math.abs(v) >= 1_000_000) return `R${(v / 1_000_000).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}m`;
  if (Math.abs(v) >= 1000) return `R${(v / 1000).toLocaleString('en-ZA', { maximumFractionDigits: 1 })}k`;
  return `R${v.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${v.toLocaleString('en-ZA', { maximumFractionDigits: 2 })}%`;
}

function fmtBps(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${v.toLocaleString('en-ZA', { maximumFractionDigits: 1 })} bps`;
}

function fmtDays(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${v.toLocaleString('en-ZA', { maximumFractionDigits: 1 })}d`;
}

function fmtRate(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${(v * 100).toLocaleString('en-ZA', { maximumFractionDigits: 4 })}%`;
}

function fmtDate(s: string | null): string {
  if (!s) return '-';
  const d = new Date(s);
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

const TERMINAL_STATES: ChainStatus[] = ['transitioned_clean', 'terminated_legacy', 'cancelled'];

export function BenchmarkTransitionChainTab() {
  const [rows, setRows] = useState<BxtRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<BxtRow | null>(null);
  const [events, setEvents] = useState<BxtEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: BxtRow[] } & KpiSummary }>('/benchmark-transition/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count,
          inventoried_count: d.inventoried_count,
          impact_assessed_count: d.impact_assessed_count,
          classified_count: d.classified_count,
          notified_count: d.notified_count,
          responded_count: d.responded_count,
          amendment_drafted_count: d.amendment_drafted_count,
          amendment_executed_count: d.amendment_executed_count,
          vt_settled_count: d.vt_settled_count,
          transitioned_clean_count: d.transitioned_clean_count,
          disputed_count: d.disputed_count,
          on_hold_count: d.on_hold_count,
          terminated_legacy_count: d.terminated_legacy_count,
          cancelled_count: d.cancelled_count,
          breached: d.breached, reportable_total: d.reportable_total,
          systemic_count: d.systemic_count,
          material_count: d.material_count,
          interbank_count: d.interbank_count,
          critical_urgency_count: d.critical_urgency_count,
          total_notional_zar: d.total_notional_zar,
          total_open_notional_zar: d.total_open_notional_zar,
          total_pv01_zar: d.total_pv01_zar,
          total_value_transfer_zar: d.total_value_transfer_zar,
          protocol_adoption_pct: d.protocol_adoption_pct,
          transitioned_clean_pct: d.transitioned_clean_pct,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load benchmark transitions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: BxtRow; events: BxtEvent[] } }>(
        `/benchmark-transition/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load transition history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'open')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable_flag;
      if (filter === 'interbank')  return r.counterparty_interbank === 1;
      if (['minor', 'standard', 'material', 'systemic'].includes(filter)) {
        return r.transition_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: BxtRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'assess-impact') {
        const pv01 = window.prompt('PV01 ZAR (sensitivity to 1 bp parallel shift):', String(row.pv01_zar || 0)) || '';
        const vt = window.prompt('Value transfer ZAR (estimated economic delta on switch):', String(row.value_transfer_zar || 0)) || '';
        const hedge = window.prompt('Hedge effective flag (1 = effective, 0 = ineffective):', String(row.hedge_effective_flag ?? 1)) || '';
        const ref = window.prompt('Last action ref (impact study id):') || '';
        body = {};
        if (pv01 && !Number.isNaN(Number(pv01))) body.pv01_zar = Number(pv01);
        if (vt && !Number.isNaN(Number(vt))) body.value_transfer_zar = Number(vt);
        if (hedge === '0' || hedge === '1') body.hedge_effective_flag = Number(hedge);
        if (ref) body.last_action_ref = ref;
      } else if (action === 'classify-fallback') {
        const repl = window.prompt('Replacement rate (compounded_zaronia_1m / 3m / 6m / term_zaronia_1m / 3m / 6m / zaronia_overnight):', row.replacement_rate || '') || '';
        const cls = window.prompt('Fallback class (isda_protocol / bilateral_amendment / hardwired / legislative_safe_harbour / synthetic_legacy):', row.fallback_class || '') || '';
        const proto = window.prompt('Protocol adherence flag (1 = ISDA 2020 adhered, 0 = bilateral path):', String(row.protocol_adherence_flag ?? 0)) || '';
        const ref = window.prompt('Last action ref (legal opinion id):') || '';
        body = {};
        if (repl) body.replacement_rate = repl;
        if (cls) body.fallback_class = cls;
        if (proto === '0' || proto === '1') body.protocol_adherence_flag = Number(proto);
        if (ref) body.last_action_ref = ref;
      } else if (action === 'notify-counterparty') {
        const ref = window.prompt('Last action ref (notification dispatch id):') || '';
        body = {};
        if (ref) body.last_action_ref = ref;
      } else if (action === 'record-response') {
        const resp = window.prompt('Counterparty response percentage (0-100):', String(row.counterparty_response_pct || 0)) || '';
        const ref = window.prompt('Last action ref (counterparty response id):') || '';
        body = {};
        if (resp && !Number.isNaN(Number(resp))) body.counterparty_response_pct = Number(resp);
        if (ref) body.last_action_ref = ref;
      } else if (action === 'draft-amendment') {
        const ref = window.prompt('Last action ref (draft amendment id):') || '';
        body = {};
        if (ref) body.last_action_ref = ref;
      } else if (action === 'execute-amendment') {
        const ref = window.prompt('Last action ref (executed amendment id / MarkitWire ack):') || '';
        body = {};
        if (ref) body.last_action_ref = ref;
      } else if (action === 'settle-vt') {
        const vt = window.prompt('Value transfer ZAR settled (final agreed quantum):', String(row.value_transfer_zar || 0)) || '';
        const ref = window.prompt('Last action ref (settlement instruction id):') || '';
        body = {};
        if (vt && !Number.isNaN(Number(vt))) body.value_transfer_zar = Number(vt);
        if (ref) body.last_action_ref = ref;
      } else if (action === 'complete-transition') {
        const reg = window.prompt('Regulator reference (REQUIRED if material / systemic - SARB MPG completion report):', row.regulator_ref || '') || '';
        const ref = window.prompt('Last action ref (completion certificate id):') || '';
        body = {};
        if (reg) body.regulator_ref = reg;
        if (ref) body.last_action_ref = ref;
      } else if (action === 'raise-dispute') {
        const conc = window.prompt('Dispute concentration (number of disputed trades for this counterparty):', String(row.dispute_concentration || 1)) || '';
        const pred = window.prompt('Predicted resolution days:', String(row.predicted_resolution_days || 30)) || '';
        const ref = window.prompt('Last action ref (dispute notice id):') || '';
        const reg = window.prompt('Regulator reference (REQUIRED if systemic - SARB MPG dispute notification):', row.regulator_ref || '') || '';
        body = {};
        if (conc && !Number.isNaN(Number(conc))) body.dispute_concentration = Number(conc);
        if (pred && !Number.isNaN(Number(pred))) body.predicted_resolution_days = Number(pred);
        if (ref) body.last_action_ref = ref;
        if (reg) body.regulator_ref = reg;
      } else if (action === 'resolve-dispute') {
        const ref = window.prompt('Last action ref (dispute resolution memo):') || '';
        body = {};
        if (ref) body.last_action_ref = ref;
      } else if (action === 'place-on-hold') {
        const reason = window.prompt('Hold reason (counterparty unresponsive / waiting on legal opinion / pending market consultation):');
        if (!reason) return;
        body = { transition_summary: reason };
      } else if (action === 'resume') {
        const ref = window.prompt('Last action ref (resume order id):') || '';
        body = {};
        if (ref) body.last_action_ref = ref;
      } else if (action === 'terminate-legacy') {
        const reason = window.prompt('Termination reason - SARB MPG hard line, ALWAYS crosses regulator:');
        if (!reason) return;
        const reg = window.prompt('Regulator reference (REQUIRED - SARB MPG termination notice):', row.regulator_ref || '') || '';
        const ref = window.prompt('Last action ref (termination notice id):') || '';
        body = { transition_summary: reason };
        if (reg) body.regulator_ref = reg;
        if (ref) body.last_action_ref = ref;
      } else if (action === 'cancel') {
        const reason = window.prompt('Cancellation reason (trade matured / closed-out / superseded by master amendment):');
        if (!reason) return;
        body = { transition_summary: reason };
      }
      await api.post(`/benchmark-transition/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Benchmark transition &middot; JIBAR cessation &amp; ZARONIA fallback</h2>
          <p className="text-xs text-[#4a5568]">
            13-stage JIBAR-cessation transition chain &middot; inventoried &rarr; impact assessed &rarr; fallback classified
            &rarr; notified &rarr; response recorded &rarr; amendment drafted &rarr; amendment executed &rarr; value-transfer
            settled &rarr; transitioned clean, with disputed &harr; classified loop, on-hold &harr; classified loop, and
            terminate-legacy &middot; cancel branches. Covers JIBAR 1m / 3m / 6m / 12m referenced IRS, basis swaps, FRAs,
            FRNs, syndicated loans, structured notes, cross-currency swaps moving onto ZARONIA-based replacement rates with
            ISDA spread-adjustment and SARB Market Practitioners Group integrity oversight. SA equivalent of the LIBOR
            cessation programme &mdash; distinct from W9 / W29 / W36 / W44 / W52 / W60 / W68 / W76 / W85 Trader chains.
            DIFFERENTIATOR over Bloomberg AIM &middot; Refinitiv Eikon IBOR-transition &middot; ICE LIBOR fallbacks &middot;
            FINASTRA Loan IQ &middot; MUREX MX.3 &middot; Calypso &middot; NumeriX &middot; MarkitWire &middot; DTCC TCC:
            LIVE PORTFOLIO-INTEGRITY programme with re-derived tier on every transition (notional &times; interbank &times;
            days-to-cessation floor), transition-risk battery (PV01 ZAR, value-transfer ZAR, fallback basis bps, compounded
            ZARONIA, hedge effectiveness, counterparty response %, predicted resolution days, urgency band, systemic-carrier
            flag), and TRANSITION-INTEGRITY signature: terminate_legacy crosses regulator EVERY tier (SARB MPG hard line),
            complete_transition on material+systemic, raise_dispute on systemic only, SLA breach on material+systemic.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total transitions" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Transitioned clean" value={kpis?.transitioned_clean_count ?? 0} tone="ok" />
        <Kpi label="Disputed" value={kpis?.disputed_count ?? 0} tone={(kpis?.disputed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Terminated legacy" value={kpis?.terminated_legacy_count ?? 0} tone={(kpis?.terminated_legacy_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Cancelled" value={kpis?.cancelled_count ?? 0} />
        <Kpi label="Systemic" value={kpis?.systemic_count ?? 0} tone={(kpis?.systemic_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Material" value={kpis?.material_count ?? 0} tone={(kpis?.material_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Interbank" value={kpis?.interbank_count ?? 0} tone={(kpis?.interbank_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Critical urgency" value={kpis?.critical_urgency_count ?? 0} tone={(kpis?.critical_urgency_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Total notional" value={fmtZar(kpis?.total_notional_zar)} />
        <Kpi label="Open notional" value={fmtZar(kpis?.total_open_notional_zar)} />
        <Kpi label="Total PV01" value={fmtZar(kpis?.total_pv01_zar)} />
        <Kpi label="Total value transfer" value={fmtZar(kpis?.total_value_transfer_zar)} tone={(kpis?.total_value_transfer_zar ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Protocol adoption" value={fmtPct(kpis?.protocol_adoption_pct)} />
        <Kpi label="Clean transition rate" value={fmtPct(kpis?.transitioned_clean_pct)} tone="ok" />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Transition #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Trade / counterparty</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Instrument &middot; legacy</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Notional</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Urgency</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Days to cessation</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.transition_tier];
                const ut = r.urgency_band_live ? URGENCY_TONE[r.urgency_band_live] : null;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.transition_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">&bull;</span>}
                      {r.counterparty_interbank === 1 && <span className="ml-1 text-[#a06200]" title="Interbank counterparty">IB</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[240px] truncate" title={`${r.trade_ref} &middot; ${r.counterparty_name}`}>
                      <div className="font-medium">{r.trade_ref}</div>
                      <div className="text-[11px] text-[#4a5568]">{r.counterparty_name}</div>
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d]">
                      <div>{r.instrument_type}</div>
                      <div className="text-[11px] text-[#4a5568]">{r.legacy_benchmark} &rarr; {r.replacement_rate || '-'}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#0c2a4d]">{fmtZar(r.notional_zar)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {ut && (
                        <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: ut.bg, color: ut.fg }}>
                          {ut.label}
                        </span>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${(r.days_to_cessation_live ?? 9999) < 30 ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {fmtDays(r.days_to_cessation_live)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '-' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-[#4a5568]">No transitions match.</td></tr>
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
  row: BxtRow;
  events: BxtEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: BxtRow) => void;
}) {
  const primary = ACTION_FOR_STATE[row.chain_status];
  const secondary = SECONDARY_ACTIONS[row.chain_status];

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[780px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.transition_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.trade_ref}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {row.counterparty_name} &middot; {row.instrument_type} &middot; {row.legacy_benchmark} &rarr; {row.replacement_rate || '-'}
                {row.counterparty_interbank === 1 ? ' &middot; interbank' : ''}
              </div>
              {row.source_wave && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Sourced from {row.source_wave}{row.source_entity_id ? ` &middot; ${row.source_entity_id}` : ''}
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">&times;</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Live transition-risk &amp; integrity battery</div>
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <Pair label="PV01 ZAR (1 bp shift)"        value={fmtZar(row.pv01_zar_live ?? row.pv01_zar)} />
              <Pair label="Value transfer ZAR"           value={fmtZar(row.value_transfer_zar_live ?? row.value_transfer_zar)} />
              <Pair label="Fallback basis"               value={fmtBps(row.fallback_basis_bps_live ?? row.isda_spread_bps)} />
              <Pair label="Compounded ZARONIA rate"      value={fmtRate(row.compounded_zaronia_rate_live ?? row.compounded_zaronia_rate)} />
              <Pair label="ZARONIA overnight"            value={fmtRate(row.zaronia_overnight)} />
              <Pair label="ISDA spread"                  value={fmtBps(row.isda_spread_bps)} />
              <Pair label="Days to cessation"            value={fmtDays(row.days_to_cessation_live ?? row.days_to_cessation)} />
              <Pair label="Hedge effective"              value={(row.hedge_effective_flag_live ?? row.hedge_effective_flag) === 1 ? 'Yes' : 'No'} />
              <Pair label="Counterparty response"        value={fmtPct(row.counterparty_response_pct)} />
              <Pair label="Protocol adherence"           value={row.protocol_adherence_flag === 1 ? 'ISDA 2020 adhered' : 'Bilateral path'} />
              <Pair label="Predicted resolution"         value={fmtDays(row.predicted_resolution_days_live ?? row.predicted_resolution_days)} />
              <Pair label="Dispute concentration"        value={String(row.dispute_concentration || 0)} />
              <Pair label="Urgency band"                 value={row.urgency_band_live ? URGENCY_TONE[row.urgency_band_live].label : '-'} />
              <Pair label="Systemic carrier"             value={row.systemic_carrier_live ? 'YES' : 'No'} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"                value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier (re-derived)"    value={TIER_TONE[row.transition_tier].label} />
            <Pair label="Trade ref"            value={row.trade_ref} />
            <Pair label="Instrument"           value={row.instrument_type} />
            <Pair label="Legacy benchmark"     value={row.legacy_benchmark} />
            <Pair label="Replacement rate"     value={row.replacement_rate ?? '-'} />
            <Pair label="Fallback class"       value={row.fallback_class ?? '-'} />
            <Pair label="Counterparty"         value={row.counterparty_name} />
            <Pair label="Interbank"            value={row.counterparty_interbank === 1 ? 'Yes' : 'No'} />
            <Pair label="Counterparty NAV"     value={fmtZar(row.counterparty_nav_zar)} />
            <Pair label="Notional"             value={fmtZar(row.notional_zar)} />
            <Pair label="Remaining years"      value={`${(row.remaining_years || 0).toLocaleString('en-ZA', { maximumFractionDigits: 2 })} yr`} />
            <Pair label="Trade start"          value={fmtDate(row.trade_start_at)} />
            <Pair label="Trade maturity"       value={fmtDate(row.trade_maturity_at)} />
            <Pair label="Cessation date"       value={fmtDate(row.cessation_date)} />
            <Pair label="Last action ref"      value={row.last_action_ref ?? '-'} />
            <Pair label="Regulator ref"        value={row.regulator_ref ?? '-'} />
            <Pair label="Inventoried"          value={fmtDate(row.inventoried_at)} />
            <Pair label="Impact assessed"      value={fmtDate(row.impact_assessed_at)} />
            <Pair label="Classified"           value={fmtDate(row.classified_at)} />
            <Pair label="Notified"             value={fmtDate(row.notified_at)} />
            <Pair label="Response recorded"    value={fmtDate(row.responded_at)} />
            <Pair label="Amendment drafted"    value={fmtDate(row.amendment_drafted_at)} />
            <Pair label="Amendment executed"   value={fmtDate(row.amendment_executed_at)} />
            <Pair label="VT settled"           value={fmtDate(row.vt_settled_at)} />
            <Pair label="Transitioned clean"   value={fmtDate(row.transitioned_clean_at)} />
            <Pair label="Disputed"             value={fmtDate(row.disputed_at)} />
            <Pair label="On hold"              value={fmtDate(row.on_hold_at)} />
            <Pair label="Terminated legacy"    value={fmtDate(row.terminated_legacy_at)} />
            <Pair label="Cancelled"            value={fmtDate(row.cancelled_at)} />
            <Pair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA window"           value={row.sla_window_minutes ? fmtMinutes(row.sla_window_minutes) : '-'} />
            <Pair label="SLA status"           value={row.is_terminal ? '-' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"       value={String(row.escalation_level)} />
            <Pair label="Reportable"           value={row.is_reportable_flag ? 'Yes' : 'No'} />
            <Pair label="Breach crosses reg."  value={row.breach_crosses_regulator ? 'Yes' : 'No'} />
          </div>
          {row.transition_summary && <BasisBlock label="Transition summary" tone="#1a3a5c" text={row.transition_summary} />}
        </section>

        {(primary || secondary.length > 0) && (
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
              {secondary.map((a) => {
                const danger = DESTRUCTIVE.includes(a);
                return (
                  <button
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
                      <span className="text-[#4a5568]">{e.from_status ?? '-'} &rarr; {e.to_status ?? '-'}</span>
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
