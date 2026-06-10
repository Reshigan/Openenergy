// Wave 85 — Trader Settlement Fails Management & CSDR-style Buy-In/Sell-Out tab.
//
// The DELIVERY-INTEGRITY engine of the trading book. SA Financial Markets Act
// 19/2012 + JSE SRL Schedule SC + STRATE Settlement Rules + FSCA Conduct
// Standard 1/2020 + FMA Chapter X. CSDR-equivalent daily cash-penalty rates
// (1bp/day equity, 0.5bp/day bond/etf, 0.05bp/day cash-equivalent) + buy-in
// process modelled on CSDR Article 7 adapted for SA market practice.
//
// 12-state P6: instruction_pending → fail_recorded → (extension_granted →)
//   penalty_accruing → buy_in_initiated → buy_in_executing
//   → (buy_in_settled | cash_compensation) → closed_resolved (clean).
//   dispute_raised <-> penalty_accruing loop, force_majeure_suspended <->
//   penalty_accruing loop. written_off terminal from any open state.
//
// Distinctive layer (beats Euroclear CSDR Penalty Mechanism / Clearstream T2S
// Penalty Engine / DTCC Settlement Fail Tracking / JSE-STRATE T+3 monitor /
// Euronext CSDR / Citi-Velocity portal — overnight batch with manual buy-in):
// LIVE delivery-integrity battery on every record — accrued penalty (ZAR),
// fail age days, buy-in window remaining, recovery rate, penalty-to-NAV,
// counterparty concentration, repeat-fail score, substitute-inventory flag,
// cross-default risk flag, urgency band, predicted resolution days.
//
// SIGNATURE — DELIVERY-INTEGRITY:
//   write_off          crosses EVERY tier (uncollectable loss, W85 hard line);
//   close_cash         crosses material + systemic (basis-risk cash settle);
//   initiate_buy_in    crosses material + systemic (formal market interv.);
//   sla_breached       crosses material + systemic.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'instruction_pending' | 'fail_recorded' | 'extension_granted' | 'penalty_accruing'
  | 'buy_in_initiated' | 'buy_in_executing' | 'buy_in_settled' | 'cash_compensation'
  | 'closed_resolved' | 'dispute_raised' | 'force_majeure_suspended' | 'written_off';

type Tier = 'minor' | 'standard' | 'material' | 'systemic';

type InstrumentClass = 'equity' | 'bond' | 'etf' | 'derivative' | 'cash_equivalent';

type UrgencyBand = 'green' | 'amber' | 'red' | 'critical';

interface SfRow {
  id: string;
  fail_number: string;
  trader_desk_name: string;
  counterparty_name: string;
  buy_in_agent_name: string | null;
  trade_ref: string | null;
  allocation_ref: string | null;
  isin: string | null;
  instrument_name: string | null;
  instrument_class: InstrumentClass;
  systemic_instrument_flag: number;
  instructed_settlement_date: string;
  fail_recorded_at_t: string | null;
  fail_quantity: number;
  fail_unit: string | null;
  fail_price_zar: number;
  fail_value_zar: number;
  fail_reason_code: string | null;
  fail_tier: Tier;
  is_systemic_carrier: number;
  extension_granted_until: string | null;
  buy_in_agent_appointed_at: string | null;
  buy_in_executed_at: string | null;
  buy_in_settled_at: string | null;
  buy_in_price_zar: number;
  buy_in_value_zar: number;
  cash_compensation_value_zar: number;
  fail_age_days: number;
  accrued_penalty_zar: number;
  buy_in_window_remaining_days: number;
  recovery_rate_pct: number;
  penalty_to_nav_ratio_pct: number;
  counterparty_concentration_pct: number;
  repeat_fail_score: number;
  substitute_inventory_flag: number;
  cross_default_risk_flag: number;
  urgency_band: UrgencyBand;
  predicted_resolution_days: number;
  counterparty_nav_zar: number;
  counterparty_open_fails_zar: number;
  counterparty_open_fail_count: number;
  counterparty_prior_fails_90d: number;
  alternative_inventory_qty: number;
  chain_basis: string | null;
  reason_code: string | null;
  fail_summary: string | null;
  last_action_ref: string | null;
  regulator_ref: string | null;
  chain_status: ChainStatus;
  instruction_pending_at: string;
  fail_recorded_at: string | null;
  extension_granted_at: string | null;
  penalty_accruing_at: string | null;
  buy_in_initiated_at: string | null;
  buy_in_executing_at: string | null;
  buy_in_settled_status_at: string | null;
  cash_compensation_at: string | null;
  closed_resolved_at: string | null;
  dispute_raised_at: string | null;
  force_majeure_suspended_at: string | null;
  written_off_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  is_reportable: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  is_systemic_carrier_flag?: boolean;
  systemic_instrument_flag_bool?: boolean;
  breach_crosses_regulator?: boolean;
  fail_age_days_live?: number;
  accrued_penalty_zar_live?: number;
  buy_in_window_remaining_days_live?: number;
  counterparty_concentration_pct_live?: number;
  penalty_to_nav_ratio_pct_live?: number;
  repeat_fail_score_live?: number;
  cross_default_risk_flag_live?: boolean;
  substitute_inventory_flag_live?: boolean;
  urgency_band_live?: UrgencyBand;
  predicted_resolution_days_live?: number;
}

interface SfEvent {
  id: string;
  fail_id: string;
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
  closed_resolved_count: number;
  written_off_count: number;
  dispute_count: number;
  buy_in_initiated_count: number;
  cash_compensation_count: number;
  breached: number;
  reportable_total: number;
  total_fail_value_zar: number;
  total_accrued_penalty_zar: number;
  critical_urgency_count: number;
  cross_default_count: number;
  repeat_fail_high_count: number;
  buy_in_window_overdue_count: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  instruction_pending:     { bg: '#e3e7ec', fg: '#557',    label: 'Instruction pending' },
  fail_recorded:           { bg: '#fff4d6', fg: '#a06200', label: 'Fail recorded' },
  extension_granted:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Extension granted' },
  penalty_accruing:        { bg: '#ffe9d6', fg: '#8a4a00', label: 'Penalty accruing' },
  buy_in_initiated:        { bg: '#ffe4b5', fg: '#8a4a00', label: 'Buy-in initiated' },
  buy_in_executing:        { bg: '#ffd9a0', fg: '#8a4a00', label: 'Buy-in executing' },
  buy_in_settled:          { bg: '#d4edda', fg: '#155724', label: 'Buy-in settled' },
  cash_compensation:       { bg: '#fde0e0', fg: '#9b1f1f', label: 'Cash compensation' },
  closed_resolved:         { bg: '#d4edda', fg: '#155724', label: 'Closed resolved' },
  dispute_raised:          { bg: '#fde0e0', fg: '#9b1f1f', label: 'Dispute raised' },
  force_majeure_suspended: { bg: '#e3e7ec', fg: '#4a5568', label: 'Force majeure' },
  written_off:             { bg: '#f3e0e0', fg: '#6b1f1f', label: 'WRITTEN OFF' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor (<R100k)' },
  standard: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard (<R1m)' },
  material: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Material (<R10m)' },
  systemic: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Systemic (≥R10m)' },
};

const URGENCY_TONE: Record<UrgencyBand, { bg: string; fg: string; label: string }> = {
  green:    { bg: '#d4edda', fg: '#155724', label: 'Green' },
  amber:    { bg: '#fff4d6', fg: '#a06200', label: 'Amber' },
  red:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Red' },
  critical: { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Critical' },
};

const INSTRUMENT_LABEL: Record<InstrumentClass, string> = {
  equity:          'Equity',
  bond:            'Bond',
  etf:             'ETF',
  derivative:      'Derivative',
  cash_equivalent: 'Cash equiv',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                 label: 'Active' },
  { key: 'all',                    label: 'All' },
  { key: 'minor',                  label: 'Minor' },
  { key: 'standard',               label: 'Standard' },
  { key: 'material',               label: 'Material' },
  { key: 'systemic',               label: 'Systemic' },
  { key: 'fail_recorded',          label: 'Fail recorded' },
  { key: 'extension_granted',      label: 'Extension' },
  { key: 'penalty_accruing',       label: 'Penalty accruing' },
  { key: 'buy_in_initiated',       label: 'Buy-in initiated' },
  { key: 'buy_in_executing',       label: 'Buy-in executing' },
  { key: 'cash_compensation',      label: 'Cash compensation' },
  { key: 'dispute_raised',         label: 'Dispute' },
  { key: 'force_majeure_suspended',label: 'Force majeure' },
  { key: 'closed_resolved',        label: 'Closed' },
  { key: 'written_off',            label: 'Written off' },
  { key: 'breached',               label: 'SLA breached' },
  { key: 'reportable',             label: 'Reportable' },
  { key: 'systemic_carrier',       label: 'Systemic carrier' },
];

type ActionKind =
  | 'record-fail' | 'grant-extension' | 'begin-penalty' | 'initiate-buy-in'
  | 'execute-buy-in' | 'settle-buy-in' | 'switch-cash-compensation'
  | 'close-resolved' | 'close-cash' | 'raise-dispute' | 'resolve-dispute'
  | 'suspend-force-majeure' | 'resume' | 'write-off';

const PRIMARY_ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  instruction_pending:     'record-fail',
  fail_recorded:           'begin-penalty',
  extension_granted:       'begin-penalty',
  penalty_accruing:        'initiate-buy-in',
  buy_in_initiated:        'execute-buy-in',
  buy_in_executing:        'settle-buy-in',
  buy_in_settled:          'close-resolved',
  cash_compensation:       'close-cash',
  dispute_raised:          'resolve-dispute',
  force_majeure_suspended: 'resume',
  closed_resolved:         null,
  written_off:             null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'record-fail':              'Record fail (S+1 — settlement ops)',
  'grant-extension':          'Grant extension (trader desk)',
  'begin-penalty':            'Begin daily penalty accrual (settlement ops)',
  'initiate-buy-in':          'Initiate buy-in (trader desk — appoint agent)',
  'execute-buy-in':           'Execute buy-in trade (buy-in agent)',
  'settle-buy-in':            'Settle buy-in (buy-in agent)',
  'switch-cash-compensation': 'Switch to cash compensation (settlement ops)',
  'close-resolved':           'Close resolved — clean (settlement ops)',
  'close-cash':               'Close via cash compensation (settlement ops)',
  'raise-dispute':            'Raise dispute (counterparty credit)',
  'resolve-dispute':          'Resolve dispute (counterparty credit)',
  'suspend-force-majeure':    'Suspend under force majeure (trader desk)',
  'resume':                   'Resume after force majeure (trader desk)',
  'write-off':                'WRITE OFF — uncollectable loss (counterparty credit)',
};

const TERMINAL_STATES: ChainStatus[] = ['closed_resolved', 'written_off'];

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
  if (n === null || n === undefined || n === 0) return '—';
  if (n >= 1_000_000_000) return `R ${(n / 1_000_000_000).toFixed(2)} bn`;
  if (n >= 1_000_000) return `R ${(n / 1_000_000).toFixed(2)} m`;
  if (n >= 1_000) return `R ${(n / 1_000).toFixed(1)} k`;
  return `R ${n.toFixed(0)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(1)}%`;
}

export function SettlementFailChainTab() {
  const [rows, setRows] = useState<SfRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<SfRow | null>(null);
  const [events, setEvents] = useState<SfEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: SfRow[] } & KpiSummary }>('/settlement-fail/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count,
          closed_resolved_count: d.closed_resolved_count,
          written_off_count: d.written_off_count,
          dispute_count: d.dispute_count,
          buy_in_initiated_count: d.buy_in_initiated_count,
          cash_compensation_count: d.cash_compensation_count,
          breached: d.breached, reportable_total: d.reportable_total,
          total_fail_value_zar: d.total_fail_value_zar,
          total_accrued_penalty_zar: d.total_accrued_penalty_zar,
          critical_urgency_count: d.critical_urgency_count,
          cross_default_count: d.cross_default_count,
          repeat_fail_high_count: d.repeat_fail_high_count,
          buy_in_window_overdue_count: d.buy_in_window_overdue_count,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load settlement fails');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: SfRow; events: SfEvent[] } }>(
        `/settlement-fail/chain/${id}`,
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load fail history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')               return true;
      if (filter === 'active')            return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')          return r.sla_breached;
      if (filter === 'reportable')        return r.is_reportable_flag;
      if (filter === 'systemic_carrier')  return r.is_systemic_carrier_flag;
      if (filter === 'minor' || filter === 'standard' || filter === 'material' || filter === 'systemic') {
        return r.fail_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: SfRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'record-fail') {
        const basis = window.prompt('Record fail basis — receiving leg did not arrive on S:');
        if (!basis) return;
        const reason = window.prompt('Fail reason code (insufficient_securities/insufficient_cash/instruction_mismatch/late_matching/counterparty_default/operational_error/systemic_disruption):', 'insufficient_securities') || '';
        body = { chain_basis: basis };
        if (reason) body.fail_reason_code = reason;
      } else if (action === 'grant-extension') {
        const basis = window.prompt('Extension basis — bilateral extension agreed:');
        if (!basis) return;
        const until = window.prompt('Extension until (ISO datetime):') || '';
        body = { chain_basis: basis };
        if (until) body.extension_granted_until = until;
      } else if (action === 'begin-penalty') {
        const basis = window.prompt('Begin penalty basis — CSDR-equivalent daily accrual starts:');
        if (!basis) return;
        body = { chain_basis: basis };
      } else if (action === 'initiate-buy-in') {
        const basis = window.prompt('Initiate buy-in basis — formal market intervention (large tiers cross regulator):');
        if (!basis) return;
        const agentId = window.prompt('Buy-in agent ID:', row.buy_in_agent_name || '') || '';
        const agentName = window.prompt('Buy-in agent name:', row.buy_in_agent_name || '') || '';
        body = { chain_basis: basis };
        if (agentId) body.buy_in_agent_id = agentId;
        if (agentName) body.buy_in_agent_name = agentName;
      } else if (action === 'execute-buy-in') {
        const basis = window.prompt('Execute buy-in basis — replacement procurement trade:');
        if (!basis) return;
        const price = window.prompt('Buy-in price (ZAR):', String(row.fail_price_zar || 0));
        const value = window.prompt('Buy-in value (ZAR):', String(row.fail_value_zar || 0));
        body = { chain_basis: basis };
        if (price && !Number.isNaN(Number(price))) body.buy_in_price_zar = Number(price);
        if (value && !Number.isNaN(Number(value))) body.buy_in_value_zar = Number(value);
      } else if (action === 'settle-buy-in') {
        const basis = window.prompt('Settle buy-in basis — replacement leg settled cleanly:');
        if (!basis) return;
        body = { chain_basis: basis };
      } else if (action === 'switch-cash-compensation') {
        const basis = window.prompt('Switch to cash compensation basis — buy-in uneconomic, settle in cash:');
        if (!basis) return;
        const value = window.prompt('Cash compensation value (ZAR):', String(row.fail_value_zar || 0));
        body = { chain_basis: basis };
        if (value && !Number.isNaN(Number(value))) body.cash_compensation_value_zar = Number(value);
      } else if (action === 'close-resolved') {
        const basis = window.prompt('Close resolved basis — buy-in settled, fail closed clean:');
        if (!basis) return;
        body = { chain_basis: basis };
      } else if (action === 'close-cash') {
        const basis = window.prompt('Close via cash basis — cash compensation finalised (large tiers cross regulator):');
        if (!basis) return;
        body = { chain_basis: basis };
      } else if (action === 'raise-dispute') {
        const basis = window.prompt('Dispute basis — counterparty challenges the fail or quantum:');
        if (!basis) return;
        body = { chain_basis: basis };
      } else if (action === 'resolve-dispute') {
        const basis = window.prompt('Resolve dispute basis — dispute settled, return to penalty accrual:');
        if (!basis) return;
        body = { chain_basis: basis };
      } else if (action === 'suspend-force-majeure') {
        const basis = window.prompt('Force majeure basis — market disruption pauses the chain:');
        if (!basis) return;
        body = { chain_basis: basis };
      } else if (action === 'resume') {
        const basis = window.prompt('Resume basis — force majeure lifted, resume accrual:');
        if (!basis) return;
        body = { chain_basis: basis };
      } else if (action === 'write-off') {
        const basis = window.prompt('Write-off basis — UNCOLLECTABLE LOSS (ALWAYS crosses regulator — W85 hard line):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. counterparty_insolvency / systemic_default / extended_unresolved):', 'counterparty_insolvency') || '';
        body = { chain_basis: basis };
        if (reason) body.reason_code = reason;
      }
      await api.post(`/settlement-fail/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Settlement fails &amp; buy-in/sell-out</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage SA Financial Markets Act 19/2012 + JSE SRL Schedule SC + STRATE Settlement
            Rules + FSCA Conduct Standard 1/2020 + FMA Chapter X settlement-discipline chain ·
            instruction pending → fail recorded → (extension granted →) penalty accruing →
            buy-in initiated → buy-in executing → (buy-in settled | cash compensation) →
            closed resolved. Branch: dispute raised &amp; force majeure loop back to penalty
            accruing. Written off is the loss terminal. URGENT SLA — the larger the fail, the
            TIGHTER every window (systemic squeezed to hours). Live delivery-integrity battery
            on every record (accrued penalty ZAR daily-meter, fail age days, buy-in window
            remaining, recovery rate, penalty-to-NAV ratio, counterparty concentration,
            repeat-fail score 0–100, substitute inventory flag, cross-default risk flag,
            urgency band, predicted resolution days) — beats Euroclear CSDR Penalty Mechanism /
            Clearstream T2S / DTCC Settlement Fail Tracking / JSE-STRATE T+3 monitor /
            Euronext CSDR / Citi-Velocity overnight-batch portals. The W85 SIGNATURE is
            DELIVERY-INTEGRITY: write_off crosses regulator for EVERY tier (uncollectable
            loss is ALWAYS a FMA/FSCA reportable event); close_cash + initiate_buy_in +
            sla_breached cross material + systemic only.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-7 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Closed clean" value={kpis?.closed_resolved_count ?? 0} tone="ok" />
        <Kpi label="Written off" value={kpis?.written_off_count ?? 0} tone={(kpis?.written_off_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Dispute" value={kpis?.dispute_count ?? 0} tone={(kpis?.dispute_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Buy-in active" value={kpis?.buy_in_initiated_count ?? 0} />
        <Kpi label="Cash comp" value={kpis?.cash_compensation_count ?? 0} tone={(kpis?.cash_compensation_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Fail value" value={fmtZar(kpis?.total_fail_value_zar ?? 0)} />
        <Kpi label="Accrued penalty" value={fmtZar(kpis?.total_accrued_penalty_zar ?? 0)} tone={(kpis?.total_accrued_penalty_zar ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Critical urgency" value={kpis?.critical_urgency_count ?? 0} tone={(kpis?.critical_urgency_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Cross-default" value={kpis?.cross_default_count ?? 0} tone={(kpis?.cross_default_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Repeat ≥50" value={kpis?.repeat_fail_high_count ?? 0} tone={(kpis?.repeat_fail_high_count ?? 0) > 0 ? 'warn' : 'ok'} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Fail #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Counterparty</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Instrument</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Class</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Value</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Age</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Penalty</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Urgency</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.fail_tier];
                const ub = URGENCY_TONE[r.urgency_band_live ?? r.urgency_band];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.fail_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to FSCA/JSE-STRATE">●</span>}
                      {r.is_systemic_carrier_flag && <span className="ml-1 text-[#8a4a00]" title="Systemic carrier">★</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[180px] truncate" title={r.counterparty_name}>
                      {r.counterparty_name}
                    </td>
                    <td className="px-3 py-2 text-[#4a5568] max-w-[160px] truncate" title={r.instrument_name || r.isin || ''}>
                      {r.instrument_name || r.isin || '—'}
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{INSTRUMENT_LABEL[r.instrument_class]}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtZar(r.fail_value_zar)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${(r.fail_age_days_live ?? r.fail_age_days) >= 5 ? 'text-[#9b1f1f] font-medium' : 'text-[#4a5568]'}`}>
                      {(r.fail_age_days_live ?? r.fail_age_days)}d
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#a06200]">{fmtZar(r.accrued_penalty_zar_live ?? r.accrued_penalty_zar)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: ub.bg, color: ub.fg }}>
                        {ub.label}
                      </span>
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
                <tr><td colSpan={11} className="px-3 py-6 text-center text-[#4a5568]">No settlement fails match.</td></tr>
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
  row: SfRow;
  events: SfEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: SfRow) => void;
}) {
  const primary = PRIMARY_ACTION_FOR_STATE[row.chain_status];
  const canExtend = row.chain_status === 'fail_recorded';
  const canDispute = ['penalty_accruing', 'buy_in_initiated', 'buy_in_executing'].includes(row.chain_status);
  const canFm = ['fail_recorded', 'extension_granted', 'penalty_accruing', 'buy_in_initiated', 'buy_in_executing', 'cash_compensation'].includes(row.chain_status);
  const canSwitchCash = row.chain_status === 'buy_in_executing';
  const canWriteOff = ['fail_recorded', 'extension_granted', 'penalty_accruing', 'buy_in_initiated', 'buy_in_executing', 'cash_compensation', 'dispute_raised', 'force_majeure_suspended'].includes(row.chain_status);
  const ageDays = row.fail_age_days_live ?? row.fail_age_days;
  const accrued = row.accrued_penalty_zar_live ?? row.accrued_penalty_zar;
  const buyInWin = row.buy_in_window_remaining_days_live ?? row.buy_in_window_remaining_days;
  const concentration = row.counterparty_concentration_pct_live ?? row.counterparty_concentration_pct;
  const penaltyNav = row.penalty_to_nav_ratio_pct_live ?? row.penalty_to_nav_ratio_pct;
  const repeatScore = row.repeat_fail_score_live ?? row.repeat_fail_score;
  const predicted = row.predicted_resolution_days_live ?? row.predicted_resolution_days;

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[820px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.fail_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.counterparty_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.fail_tier].label} · {INSTRUMENT_LABEL[row.instrument_class]} · {row.instrument_name || row.isin || '—'}
                {row.systemic_instrument_flag_bool ? ' · systemic instrument' : ''}
                {row.is_systemic_carrier_flag ? ' · systemic carrier' : ''}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                Trader desk: {row.trader_desk_name}
                {row.buy_in_agent_name ? ` · Buy-in agent: ${row.buy_in_agent_name}` : ''}
                {row.escalation_level > 0 ? ` · escalation lvl ${row.escalation_level}` : ''}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Live delivery-integrity battery</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            <Pair label="Fail value" value={fmtZar(row.fail_value_zar)} />
            <Pair label="Accrued penalty" value={fmtZar(accrued)} />
            <Pair label="Fail age" value={`${ageDays}d`} />
            <Pair label="Buy-in window" value={`${buyInWin}d ${buyInWin < 0 ? '(overdue)' : 'rem'}`} />
            <Pair label="Urgency" value={URGENCY_TONE[row.urgency_band_live ?? row.urgency_band].label} />
            <Pair label="Predicted resolution" value={`${predicted}d`} />
            <Pair label="CSDR rate" value={row.instrument_class === 'equity' || row.instrument_class === 'derivative' ? '1 bp/day' : row.instrument_class === 'cash_equivalent' ? '0.05 bp/day' : '0.5 bp/day'} />
            <Pair label="Penalty / NAV" value={fmtPct(penaltyNav)} />
            <Pair label="CP concentration" value={fmtPct(concentration)} />
            <Pair label="Repeat-fail score" value={`${repeatScore} / 100`} />
            <Pair label="Cross-default" value={(row.cross_default_risk_flag_live ?? !!row.cross_default_risk_flag) ? 'YES' : 'no'} />
            <Pair label="Sub. inventory" value={(row.substitute_inventory_flag_live ?? !!row.substitute_inventory_flag) ? 'available' : 'none'} />
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Trade &amp; counterparty</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[12px]">
            <Pair label="Trade ref" value={row.trade_ref ?? '—'} />
            <Pair label="Allocation ref" value={row.allocation_ref ?? '—'} />
            <Pair label="ISIN" value={row.isin ?? '—'} />
            <Pair label="Fail qty" value={`${row.fail_quantity.toLocaleString('en-ZA')} ${row.fail_unit ?? ''}`} />
            <Pair label="Fail price" value={fmtZar(row.fail_price_zar)} />
            <Pair label="Fail reason" value={row.fail_reason_code ?? '—'} />
            <Pair label="CP NAV" value={fmtZar(row.counterparty_nav_zar)} />
            <Pair label="CP open fails" value={`${fmtZar(row.counterparty_open_fails_zar)} (${row.counterparty_open_fail_count})`} />
            <Pair label="CP prior 90d" value={String(row.counterparty_prior_fails_90d)} />
            <Pair label="Alt inventory qty" value={row.alternative_inventory_qty.toLocaleString('en-ZA')} />
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Buy-in / cash compensation</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[12px]">
            <Pair label="Extension until" value={fmtDate(row.extension_granted_until)} />
            <Pair label="Agent appointed" value={fmtDate(row.buy_in_agent_appointed_at)} />
            <Pair label="Buy-in executed" value={fmtDate(row.buy_in_executed_at)} />
            <Pair label="Buy-in settled" value={fmtDate(row.buy_in_settled_at)} />
            <Pair label="Buy-in price" value={fmtZar(row.buy_in_price_zar)} />
            <Pair label="Buy-in value" value={fmtZar(row.buy_in_value_zar)} />
            <Pair label="Cash comp value" value={fmtZar(row.cash_compensation_value_zar)} />
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Lifecycle</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State" value={STATE_TONE[row.chain_status].label} />
            <Pair label="Instructed settle date" value={fmtDate(row.instructed_settlement_date)} />
            <Pair label="Instruction pending" value={fmtDate(row.instruction_pending_at)} />
            <Pair label="Fail recorded" value={fmtDate(row.fail_recorded_at)} />
            <Pair label="Extension granted" value={fmtDate(row.extension_granted_at)} />
            <Pair label="Penalty accruing" value={fmtDate(row.penalty_accruing_at)} />
            <Pair label="Buy-in initiated" value={fmtDate(row.buy_in_initiated_at)} />
            <Pair label="Buy-in executing" value={fmtDate(row.buy_in_executing_at)} />
            <Pair label="Buy-in settled (state)" value={fmtDate(row.buy_in_settled_status_at)} />
            <Pair label="Cash compensation" value={fmtDate(row.cash_compensation_at)} />
            <Pair label="Closed resolved" value={fmtDate(row.closed_resolved_at)} />
            <Pair label="Dispute raised" value={fmtDate(row.dispute_raised_at)} />
            <Pair label="Force majeure" value={fmtDate(row.force_majeure_suspended_at)} />
            <Pair label="Written off" value={fmtDate(row.written_off_at)} />
            <Pair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status" value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Reportable" value={row.is_reportable_flag ? 'Yes' : 'No'} />
            <Pair label="Reason code" value={row.reason_code ?? '—'} />
            <Pair label="Last action ref" value={row.last_action_ref ?? '—'} />
            <Pair label="Regulator ref" value={row.regulator_ref ?? '—'} />
          </div>
          {row.fail_summary && (
            <BasisBlock label="Fail summary" tone="#1a3a5c" text={row.fail_summary} />
          )}
          {row.chain_basis && <BasisBlock label="Chain basis" tone="#1a3a5c" text={row.chain_basis} />}
        </section>

        {(primary || canExtend || canDispute || canFm || canSwitchCash || canWriteOff) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {primary && (
                <button type="button"
                  onClick={() => onAct(primary, row)}
                  className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#c2873a]"
                >
                  {ACTION_LABEL[primary]}
                </button>
              )}
              {canExtend && (
                <button type="button"
                  onClick={() => onAct('grant-extension', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1a3a5c] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['grant-extension']}
                </button>
              )}
              {canSwitchCash && (
                <button type="button"
                  onClick={() => onAct('switch-cash-compensation', row)}
                  className="rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-[#a06200] hover:bg-orange-50"
                >
                  {ACTION_LABEL['switch-cash-compensation']}
                </button>
              )}
              {canDispute && (
                <button type="button"
                  onClick={() => onAct('raise-dispute', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['raise-dispute']}
                </button>
              )}
              {canFm && (
                <button type="button"
                  onClick={() => onAct('suspend-force-majeure', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['suspend-force-majeure']}
                </button>
              )}
              {canWriteOff && (
                <button type="button"
                  onClick={() => onAct('write-off', row)}
                  className="rounded border border-red-400 bg-red-50 px-3 py-1.5 text-[12px] font-medium text-red-800 hover:bg-red-100"
                >
                  {ACTION_LABEL['write-off']}
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
