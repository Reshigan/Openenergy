// Wave 30 — Lender Disbursement UoP Reconciliation chain — SARB + Equator Principles.
//
// 10-state lifecycle layered on every funded drawdown tranche from W21:
//   tranche_released → invoices_pending → invoices_submitted → bank_validating →
//   ie_certifying → uop_certified → reconciled
// Terminals: reconciled (good), clawback_executed (bad), waived (special).
//
// INVERTED tier SLAs — bigger tranche gets more documentation time (auditor
// logistics + multi-contractor invoice flow take longer at senior_a R500m+).
// Clawback crosses regulator for ALL tiers; SLA breach for senior_a + senior_b only.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { prompt } from '../PromptDialog';

type ChainStatus =
  | 'tranche_released' | 'invoices_pending' | 'invoices_submitted'
  | 'bank_validating' | 'ie_certifying' | 'uop_certified'
  | 'reconciled' | 'clawback_executed' | 'waived';

type Tier = 'senior_a' | 'senior_b' | 'mezzanine' | 'bridge';

interface DisbursementRow {
  [key: string]: unknown;
  id: string;
  case_number: string;
  lender_party: string;
  borrower_party: string;
  project_id: string | null;
  project_name: string | null;
  drawdown_ref: string | null;
  facility_ref: string;
  tranche_tier: Tier;
  tranche_amount_zar: number;
  released_zar: number | null;
  invoices_amount_zar: number | null;
  reconciled_amount_zar: number | null;
  clawback_amount_zar: number | null;
  invoice_count: number | null;
  uop_category: string | null;
  ie_firm: string | null;
  ie_certificate_ref: string | null;
  sarb_exchange_control_ref: string | null;
  equator_principles_ref: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  regulator_authority: string | null;
  regulator_ref: string | null;
  chain_status: ChainStatus;
  tranche_released_at: string;
  invoices_pending_at: string | null;
  invoices_submitted_at: string | null;
  bank_validating_at: string | null;
  ie_certifying_at: string | null;
  uop_certified_at: string | null;
  reconciled_at: string | null;
  clawback_executed_at: string | null;
  waived_at: string | null;
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

interface DisbursementEvent {
  id: string;
  disbursement_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  tranche_released:   { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Tranche released' },
  invoices_pending:   { bg: '#fff4d6', fg: '#a06200', label: 'Invoices pending' },
  invoices_submitted: { bg: '#fbe7d0', fg: '#7a4500', label: 'Invoices submitted' },
  bank_validating:    { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Bank validating' },
  ie_certifying:      { bg: '#fbe7d0', fg: '#7a4500', label: 'IE certifying' },
  uop_certified:      { bg: '#daf5e2', fg: '#1f6b3a', label: 'UoP certified' },
  reconciled:         { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Reconciled' },
  clawback_executed:  { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Clawback' },
  waived:             { bg: '#e3e7ec', fg: '#557',    label: 'Waived' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  senior_a:  { bg: '#fde0e0', fg: '#9b1f1f', label: 'Senior A (R500m+)' },
  senior_b:  { bg: '#fff4d6', fg: '#a06200', label: 'Senior B' },
  mezzanine: { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Mezzanine' },
  bridge:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Bridge' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',             label: 'Active' },
  { key: 'all',                label: 'All' },
  { key: 'reportable',         label: 'SARB reportable' },
  { key: 'senior_a',           label: 'Senior A' },
  { key: 'senior_b',           label: 'Senior B' },
  { key: 'mezzanine',          label: 'Mezzanine' },
  { key: 'bridge',             label: 'Bridge' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'tranche_released',   label: 'Released' },
  { key: 'invoices_pending',   label: 'Inv pending' },
  { key: 'invoices_submitted', label: 'Inv submitted' },
  { key: 'bank_validating',    label: 'Validating' },
  { key: 'ie_certifying',      label: 'IE cert' },
  { key: 'uop_certified',      label: 'UoP cert' },
  { key: 'reconciled',         label: 'Reconciled' },
  { key: 'clawback_executed',  label: 'Clawback' },
  { key: 'waived',             label: 'Waived' },
];

type ActionKind =
  | 'request-invoices' | 'submit-invoices' | 'begin-validation'
  | 'request-ie' | 'accept-ie' | 'close-reconciliation'
  | 'demand-clawback' | 'waive';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  tranche_released:   'request-invoices',
  invoices_pending:   'submit-invoices',
  invoices_submitted: 'begin-validation',
  bank_validating:    'request-ie',
  ie_certifying:      'accept-ie',
  uop_certified:      'close-reconciliation',
  reconciled:         null,
  clawback_executed:  null,
  waived:             null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'request-invoices':     'Request invoices (Lender)',
  'submit-invoices':      'Submit invoices (Borrower)',
  'begin-validation':     'Begin validation (Lender)',
  'request-ie':           'Request IE certification (Lender)',
  'accept-ie':            'Accept IE certificate (Lender)',
  'close-reconciliation': 'Close reconciliation (Lender)',
  'demand-clawback':      'Demand clawback (Lender)',
  'waive':                'Waive (Lender / board exception)',
};

const CLAWBACKABLE: ChainStatus[] = [
  'invoices_submitted', 'bank_validating', 'ie_certifying', 'uop_certified',
];

const WAIVABLE: ChainStatus[] = ['invoices_pending'];

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
  if (Math.abs(n) >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(0)}m`;
  if (Math.abs(n) >= 1_000)     return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

interface KpiSummary {
  total: number;
  documentation_open: number;
  validation_open: number;
  ie_open: number;
  reconciled_count: number;
  clawback_count: number;
  waived_count: number;
  open_count: number;
  breached: number;
  tranche_released_total_zar: number;
  reconciled_total_zar: number;
  clawback_total_zar: number;
}

export function DisbursementChainTab() {
  const [rows, setRows] = useState<DisbursementRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<DisbursementRow | null>(null);
  const [events, setEvents] = useState<DisbursementEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: DisbursementRow[] } & KpiSummary }>('/disbursement/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          documentation_open: data.documentation_open || 0,
          validation_open: data.validation_open || 0,
          ie_open: data.ie_open || 0,
          reconciled_count: data.reconciled_count || 0,
          clawback_count: data.clawback_count || 0,
          waived_count: data.waived_count || 0,
          open_count: data.open_count || 0,
          breached: data.breached || 0,
          tranche_released_total_zar: data.tranche_released_total_zar || 0,
          reconciled_total_zar: data.reconciled_total_zar || 0,
          clawback_total_zar: data.clawback_total_zar || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load disbursement chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: DisbursementRow; events: DisbursementEvent[] } }>(`/disbursement/chain/${id}`);
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
      if (filter === 'senior_a' || filter === 'senior_b' || filter === 'mezzanine' || filter === 'bridge') {
        return r.tranche_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, documentation_open: 0, validation_open: 0, ie_open: 0,
    reconciled_count: 0, clawback_count: 0, waived_count: 0, open_count: 0,
    breached: 0, tranche_released_total_zar: 0, reconciled_total_zar: 0, clawback_total_zar: 0,
  };

  const act = useCallback(async (action: ActionKind, row: DisbursementRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'submit-invoices') {
        const amt = await prompt('Total invoices amount (ZAR):');
        if (!amt) return;
        body.invoices_amount_zar = Number(amt);
        const cnt = await prompt('Invoice count:');
        if (cnt) body.invoice_count = Number(cnt);
        const cat = await prompt('UoP category (eg "construction", "EPC", "O&M"):');
        if (cat) body.uop_category = cat;
      } else if (action === 'request-ie') {
        const firm = await prompt('Independent Engineer firm (eg "Mott MacDonald SA"):');
        if (!firm) return;
        body.ie_firm = firm;
      } else if (action === 'accept-ie') {
        const ref = await prompt('IE certificate reference (eg "IE-CERT-2026-0142"):');
        if (!ref) return;
        body.ie_certificate_ref = ref;
      } else if (action === 'close-reconciliation') {
        const amt = await prompt('Reconciled amount (ZAR — UoP-verified):');
        if (!amt) return;
        body.reconciled_amount_zar = Number(amt);
        const sarb = await prompt('SARB Exchange Control reference (optional for ZAR-only domestic):', row.sarb_exchange_control_ref ?? '');
        if (sarb) body.sarb_exchange_control_ref = sarb;
      } else if (action === 'demand-clawback') {
        const amt = await prompt('Clawback amount (ZAR):');
        if (!amt) return;
        body.clawback_amount_zar = Number(amt);
        const reason = await prompt('Reason code (eg "UOP_DIVERSION", "INV_INVALID", "IE_FAIL"):');
        if (reason) body.reason_code = reason;
        const rod = await prompt('ROD notes (rationale + evidence):');
        if (!rod) return;
        body.rod_notes = rod;
        const sarb = await prompt('SARB Exchange Control reference (mandatory for clawback):');
        if (sarb) body.sarb_exchange_control_ref = sarb;
        const ep = await prompt('Equator Principles secretariat reference:');
        if (ep) body.equator_principles_ref = ep;
      } else if (action === 'waive') {
        const rod = await prompt('Board exception notes (required — facility waiver clause):');
        if (!rod) return;
        body.rod_notes = rod;
      }
      await api.post(`/disbursement/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Disbursement UoP Reconciliation — SARB + Equator Principles</h2>
          <p className="text-xs text-[#4a5568]">
            10-state lifecycle layered on every funded drawdown tranche (W21):
            tranche released → invoices pending → submitted → bank validating →
            IE certifying → UoP certified → reconciled (+ clawback, waived).
            INVERTED tier SLAs — bigger tranche gets more documentation time
            (senior A 60d invoices vs bridge 14d). Clawback crosses regulator
            for ALL tiers (universal hard line); SLA breach for senior A + B only.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"          value={kpis.total} />
        <Kpi label="Documentation"  value={kpis.documentation_open}   tone={kpis.documentation_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="Validating"     value={kpis.validation_open}      tone={kpis.validation_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="IE phase"       value={kpis.ie_open}              tone={kpis.ie_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reconciled"     value={kpis.reconciled_count} />
        <Kpi label="Clawback"       value={kpis.clawback_count}       tone={kpis.clawback_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"   value={kpis.breached}             tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Tranche released" value={fmtZar(kpis.tranche_released_total_zar)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Reconciled total: <span className="font-semibold text-[#1f6b3a]">{fmtZar(kpis.reconciled_total_zar)}</span></span>
        <span>Clawback total: <span className="font-semibold text-[#9b1f1f]">{fmtZar(kpis.clawback_total_zar)}</span></span>
        <span>Waived: <span className="font-semibold text-[#557]">{kpis.waived_count}</span></span>
        <span>Open cases: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.open_count}</span></span>
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Case #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Lender ↔ Borrower</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Facility / drawdown</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Released</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Reconciled</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>SARB / EP</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Clawback</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.tranche_tier];
                const regRef = r.sarb_exchange_control_ref ?? r.equator_principles_ref ?? '—';
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">{r.case_number}</td>
                    <td className="px-3 py-2" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      <div className="font-medium">{r.lender_party}</div>
                      <div className="text-[10px] text-[#6b7685]">↔ {r.borrower_party}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      <div className="font-mono text-[11px]">{r.facility_ref}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.drawdown_ref ?? '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'oklch(0.46 0.16 55)' }}>{fmtZar(r.released_zar ?? r.tranche_amount_zar)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1f5b3a]">{fmtZar(r.reconciled_amount_zar)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#4a5568]">{regRef}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#9b1f1f]">{fmtZar(r.clawback_amount_zar)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-[#4a5568]">No disbursement cases match.</td></tr>
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
  row: DisbursementRow;
  events: DisbursementEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: DisbursementRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canClawback = CLAWBACKABLE.includes(row.chain_status);
  const canWaive = WAIVABLE.includes(row.chain_status);

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
              <div className="text-base font-semibold text-[#0c2a4d]">{row.lender_party} ↔ {row.borrower_party}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.tranche_tier].label} · facility {row.facility_ref} · {row.project_name ?? '—'}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Lender"               value={row.lender_party} />
            <Pair label="Borrower"             value={row.borrower_party} />
            <Pair label="Tier"                  value={TIER_TONE[row.tranche_tier].label} />
            <Pair label="Facility"              value={row.facility_ref} />
            <Pair label="Drawdown"              value={row.drawdown_ref ?? '—'} />
            <Pair label="Project"               value={row.project_name ?? '—'} />
            <Pair label="Tranche amount"        value={fmtZar(row.tranche_amount_zar)} />
            <Pair label="Released"              value={fmtZar(row.released_zar)} />
            <Pair label="Invoices amount"       value={fmtZar(row.invoices_amount_zar)} />
            <Pair label="Invoice count"         value={row.invoice_count != null ? String(row.invoice_count) : '—'} />
            <Pair label="UoP category"          value={row.uop_category ?? '—'} />
            <Pair label="Reconciled amount"     value={fmtZar(row.reconciled_amount_zar)} />
            <Pair label="Clawback amount"       value={fmtZar(row.clawback_amount_zar)} />
            <Pair label="IE firm"               value={row.ie_firm ?? '—'} />
            <Pair label="IE certificate"        value={row.ie_certificate_ref ?? '—'} />
            <Pair label="SARB Exchange Control" value={row.sarb_exchange_control_ref ?? '—'} />
            <Pair label="Equator Principles"    value={row.equator_principles_ref ?? '—'} />
            <Pair label="Regulator"             value={row.regulator_authority ?? '—'} />
            <Pair label="State"                  value={STATE_TONE[row.chain_status].label} />
            <Pair label="Escalation level"      value={String(row.escalation_level)} />
            <Pair label="SLA deadline"          value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"            value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Tranche released"      value={fmtDate(row.tranche_released_at)} />
            <Pair label="Reason code"           value={row.reason_code ?? '—'} />
          </div>
          {row.rod_notes && (
            <div className="mt-3 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">ROD notes</div>
              {row.rod_notes}
            </div>
          )}
        </section>

        {(nextAction || canClawback || canWaive) && (
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
              {canClawback && (
                <button type="button"
                  onClick={() => onAct('demand-clawback', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['demand-clawback']}
                </button>
              )}
              {canWaive && (
                <button type="button"
                  onClick={() => onAct('waive', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['waive']}
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
                    <div className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</div>
                  )}
                  {e.notes && <div className="mt-1" style={{ color: 'oklch(0.46 0.16 55)' }}>{e.notes}</div>}
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

export default DisbursementChainTab;
