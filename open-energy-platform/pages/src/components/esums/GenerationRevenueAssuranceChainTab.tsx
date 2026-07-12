// Wave 79 — Esums Generation Revenue Assurance & Meter Reconciliation tab.
//
// Every MWh a plant generates should turn into cash. Between the inverter and the
// bank account sit four numbers that should agree but rarely do: EXPECTED generation
// (W71 prognostics / W24 PR model), the REVENUE METER reading, the SETTLEMENT
// statement and the PPA INVOICE. Where they diverge, money leaks. W79 reconciles all
// four against the expected-generation baseline, auto-classifies the leakage
// signature, and closes the loop to an SLA-driven recovery with a NERSA-visible
// settlement-dispute branch and a quantified recovered-ZAR ledger.
//
//   • KPI strip: total / open / in-dispute / SLA breached / large open / reportable /
//     recovered ZAR
//   • Filter pills by variance tier + chain state + leakage category + SLA breach +
//     reportable
//   • Listing with tier pill + leakage-category tag + URGENT SLA countdown + ZAR variance
//   • Drill-down: the four numbers, variance, timeline (analyst / counterparty /
//     reviewer party tags) + per-state actions (ingest → reconcile → flag → investigate
//     → classify → recover / dispute / write-off / close-clean)
//
// Single-party write: the Esums revenue-assurance desk operates the chain; the
// actor_party tag records whether the analyst prosecuted, the counterparty credited,
// or a reviewer signed off. No create form — recon periods open against a live meter.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
const BG     = 'var(--s0, oklch(0.96 0.003 250))';
const BG1    = 'var(--s1, oklch(0.99 0.002 80))';
const BG2    = 'var(--s2, oklch(0.93 0.004 250))';
const BORDER = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1    = 'var(--ink, oklch(0.17 0.010 250))';
const TX2    = 'var(--ink-2, oklch(0.40 0.009 250))';
const TX3    = 'var(--ink-2, oklch(0.60 0.007 250))';
const ACC    = 'var(--accent, oklch(0.46 0.16 55))';
const BAD    = 'var(--bad, oklch(0.48 0.20 20))';
const WARN   = 'var(--accent, oklch(0.50 0.18 55))';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'period_open' | 'data_ingested' | 'reconciled' | 'variance_flagged'
  | 'investigating' | 'classified' | 'recovery_pending' | 'in_dispute'
  | 'recovered' | 'closed_clean' | 'written_off' | 'cancelled';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

type LeakageCategory =
  | 'meter_drift' | 'comms_gap' | 'settlement_error'
  | 'curtailment_shortfall' | 'clipping_loss' | 'meter_tampering';

interface AssuranceRow {
  [key: string]: unknown;
  id: string;
  gra_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  site_id: string | null;
  project_id: string | null;
  meter_id: string | null;
  ppa_ref: string | null;
  reconciliation_period: string;
  period_start: string | null;
  period_end: string | null;
  data_cutoff_date: string | null;
  site_name: string;
  operator_name: string;
  counterparty_name: string | null;
  reviewer_name: string | null;
  expected_generation_mwh: number | null;
  metered_generation_mwh: number | null;
  settled_generation_mwh: number | null;
  invoiced_generation_mwh: number | null;
  currency: string | null;
  tariff_ref: string | null;
  expected_revenue_zar: number | null;
  settled_revenue_zar: number | null;
  variance_zar: number;
  variance_mwh: number | null;
  recovered_zar: number | null;
  written_off_zar: number | null;
  leakage_category: LeakageCategory | null;
  recovery_method: string | null;
  revenue_assurance_tier: Tier;
  reason_code: string | null;
  recovery_deadline: string | null;
  dispute_deadline: string | null;
  ingest_ref: string | null;
  reconciliation_ref: string | null;
  investigation_ref: string | null;
  classification_ref: string | null;
  recovery_ref: string | null;
  dispute_ref: string | null;
  resolution_ref: string | null;
  writeoff_ref: string | null;
  cancellation_ref: string | null;
  period_basis: string | null;
  ingest_basis: string | null;
  reconciliation_basis: string | null;
  investigation_basis: string | null;
  classification_basis: string | null;
  recovery_basis: string | null;
  dispute_basis: string | null;
  resolution_basis: string | null;
  writeoff_basis: string | null;
  cancellation_basis: string | null;
  chain_status: ChainStatus;
  sla_deadline_at: string | null;
  escalation_level: number;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable?: boolean;
  breach_crosses_regulator?: boolean;
  created_at: string;
}

interface KpiData {
  total: number;
  open_count: number;
  dispute_count: number;
  recovered_count: number;
  closed_clean_count: number;
  written_off_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  large_open: number;
  total_variance_zar: number;
  recovered_zar_total: number;
  written_off_zar_total: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'period_open',
  'data_ingested',
  'reconciled',
  'variance_flagged',
  'investigating',
  'classified',
  'recovery_pending',
  'in_dispute',
  'recovered',
  'closed_clean',
];
const BRANCH_STATES: readonly string[] = [
  'written_off',
  'cancelled',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',           label: 'Active (pre-terminal)' },
  { key: 'all',              label: 'All' },
  { key: 'critical',         label: 'Critical' },
  { key: 'major',            label: 'Major' },
  { key: 'material',         label: 'Material' },
  { key: 'moderate',         label: 'Moderate' },
  { key: 'minor',            label: 'Minor' },
  { key: 'variance_flagged', label: 'Variance flagged' },
  { key: 'investigating',    label: 'Investigating' },
  { key: 'classified',       label: 'Classified' },
  { key: 'recovery_pending', label: 'Recovery pending' },
  { key: 'in_dispute',       label: 'In dispute' },
  { key: 'recovered',        label: 'Recovered' },
  { key: 'closed_clean',     label: 'Closed clean' },
  { key: 'written_off',      label: 'Written off' },
  { key: 'meter_tampering',  label: 'Tampering' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'reportable',       label: 'Reportable' },
];

const TIERS = new Set<string>(['minor', 'moderate', 'material', 'major', 'critical']);
const CATS = new Set<string>(['meter_drift', 'comms_gap', 'settlement_error', 'curtailment_shortfall', 'clipping_loss', 'meter_tampering']);

const CATEGORY_LABEL: Record<LeakageCategory, string> = {
  meter_drift:           'Meter drift',
  comms_gap:             'Comms gap',
  settlement_error:      'Settlement error',
  curtailment_shortfall: 'Curtailment shortfall',
  clipping_loss:         'Clipping loss',
  meter_tampering:       'Meter tampering',
};

// ── format helpers ────────────────────────────────────────────────────────
function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R${(v / 1_000_000).toFixed(2)}m`;
  if (abs >= 1_000)     return `R${(v / 1_000).toFixed(0)}k`;
  return `R${v.toFixed(0)}`;
}

function fmtMwh(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} MWh`;
}

// ── action builder ────────────────────────────────────────────────────────
function getActions(row: AssuranceRow): ChainAction[] {
  const cs = row.chain_status;
  const actions: ChainAction[] = [];

  const cancellable = ['period_open', 'data_ingested', 'reconciled', 'variance_flagged', 'investigating', 'classified'].includes(cs);

  if (cs === 'period_open') {
    actions.push({
      key: 'ingest-data',
      label: 'Ingest meter / settlement / invoice (analyst)',
      tone: 'primary',
      fields: [
        { key: 'metered_generation_mwh',  label: 'Metered generation (MWh)',                  type: 'number',   required: false, placeholder: String(row.metered_generation_mwh ?? '') },
        { key: 'settled_generation_mwh',  label: 'Settled generation (MWh)',                  type: 'number',   required: false, placeholder: String(row.settled_generation_mwh ?? '') },
        { key: 'invoiced_generation_mwh', label: 'Invoiced generation (MWh)',                 type: 'number',   required: false, placeholder: String(row.invoiced_generation_mwh ?? '') },
        { key: 'ingest_basis',            label: 'Ingest basis',                              type: 'textarea', required: false, placeholder: row.ingest_basis ?? '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'data_ingested') {
    actions.push({
      key: 'run-reconciliation',
      label: 'Run reconciliation (analyst)',
      tone: 'primary',
      fields: [
        { key: 'expected_generation_mwh', label: 'Expected generation (MWh)',                         type: 'number',   required: false, placeholder: String(row.expected_generation_mwh ?? '') },
        { key: 'expected_revenue_zar',    label: 'Expected revenue (ZAR)',                            type: 'number',   required: false, placeholder: String(row.expected_revenue_zar ?? '') },
        { key: 'settled_revenue_zar',     label: 'Settled revenue (ZAR)',                             type: 'number',   required: false, placeholder: String(row.settled_revenue_zar ?? '') },
        { key: 'variance_zar',            label: 'Variance (ZAR — negative = under-recovery)',        type: 'number',   required: false, placeholder: String(row.variance_zar ?? '') },
        { key: 'reconciliation_basis',    label: 'Reconciliation basis',                              type: 'textarea', required: false, placeholder: row.reconciliation_basis ?? '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'reconciled') {
    actions.push({
      key: 'close-clean',
      label: 'Close clean (within tolerance)',
      tone: 'primary',
      fields: [
        { key: 'reconciliation_basis', label: 'Closure basis (within tolerance)', type: 'textarea', required: false, placeholder: row.reconciliation_basis ?? '' },
        { key: 'reason_code',          label: 'Reason code',                      type: 'text',     required: false, placeholder: row.reason_code ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'flag-variance',
      label: 'Flag variance (analyst)',
      tone: 'danger',
      fields: [
        { key: 'variance_zar',         label: 'Variance (ZAR — negative = under-recovery)', type: 'number',   required: false, placeholder: String(row.variance_zar ?? '') },
        { key: 'reconciliation_basis', label: 'Variance basis',                             type: 'textarea', required: false, placeholder: row.reconciliation_basis ?? '' },
        { key: 'reason_code',          label: 'Reason code',                                type: 'text',     required: false, placeholder: row.reason_code ?? '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'variance_flagged') {
    actions.push({
      key: 'open-investigation',
      label: 'Open investigation (analyst)',
      tone: 'primary',
      fields: [
        { key: 'investigation_ref',   label: 'Investigation reference', type: 'text',     required: false, placeholder: row.investigation_ref ?? '' },
        { key: 'investigation_basis', label: 'Investigation basis',     type: 'textarea', required: false, placeholder: row.investigation_basis ?? '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'investigating') {
    actions.push({
      key: 'classify-leakage',
      label: 'Classify leakage (analyst)',
      tone: 'primary',
      fields: [
        { key: 'leakage_category',    label: 'Leakage category (meter_drift / comms_gap / settlement_error / curtailment_shortfall / clipping_loss / meter_tampering)', type: 'text',     required: false, placeholder: row.leakage_category ?? '' },
        { key: 'classification_basis', label: 'Classification basis', type: 'textarea', required: false, placeholder: row.classification_basis ?? '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'classified') {
    actions.push({
      key: 'issue-recovery-claim',
      label: 'Issue recovery claim (analyst)',
      tone: 'primary',
      fields: [
        { key: 'recovery_method',    label: 'Recovery method (meter_recalibration / settlement_resubmission / dso_credit_note / ppa_true_up)', type: 'text',     required: false, placeholder: row.recovery_method ?? '' },
        { key: 'counterparty_name',  label: 'Counterparty / recovery target',                                                                   type: 'text',     required: false, placeholder: row.counterparty_name ?? '' },
        { key: 'recovery_basis',     label: 'Recovery basis',                                                                                   type: 'textarea', required: false, placeholder: row.recovery_basis ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'write-off',
      label: 'Write off (reviewer)',
      tone: 'danger',
      fields: [
        { key: 'written_off_zar', label: 'Written-off amount (ZAR)',      type: 'number',   required: false, placeholder: String(row.written_off_zar ?? '') },
        { key: 'writeoff_basis',  label: 'Write-off basis (unrecoverable)', type: 'textarea', required: false, placeholder: row.writeoff_basis ?? '' },
        { key: 'reason_code',     label: 'Reason code',                   type: 'text',     required: false, placeholder: row.reason_code ?? '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'recovery_pending') {
    actions.push({
      key: 'confirm-recovery',
      label: 'Confirm recovery (counterparty)',
      tone: 'primary',
      fields: [
        { key: 'recovered_zar', label: 'Recovered amount (ZAR)', type: 'number', required: false, placeholder: String(row.recovered_zar ?? '') },
        { key: 'recovery_ref',  label: 'Recovery reference',     type: 'text',   required: false, placeholder: row.recovery_ref ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'raise-dispute',
      label: 'Raise settlement dispute (analyst)',
      tone: 'danger',
      fields: [
        { key: 'dispute_basis',     label: 'Dispute basis (settlement / metering disagreement)', type: 'textarea', required: false, placeholder: row.dispute_basis ?? '' },
        { key: 'counterparty_name', label: 'Counterparty (DSO / market operator)',               type: 'text',     required: false, placeholder: row.counterparty_name ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'write-off',
      label: 'Write off (reviewer)',
      tone: 'danger',
      fields: [
        { key: 'written_off_zar', label: 'Written-off amount (ZAR)',        type: 'number',   required: false, placeholder: String(row.written_off_zar ?? '') },
        { key: 'writeoff_basis',  label: 'Write-off basis (unrecoverable)', type: 'textarea', required: false, placeholder: row.writeoff_basis ?? '' },
        { key: 'reason_code',     label: 'Reason code',                     type: 'text',     required: false, placeholder: row.reason_code ?? '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'in_dispute') {
    actions.push({
      key: 'resolve-dispute-recovered',
      label: 'Resolve — recovered (reviewer)',
      tone: 'primary',
      fields: [
        { key: 'recovered_zar',    label: 'Recovered amount (ZAR)', type: 'number',   required: false, placeholder: String(row.recovered_zar ?? '') },
        { key: 'resolution_basis', label: 'Resolution basis',       type: 'textarea', required: false, placeholder: row.resolution_basis ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'resolve-dispute-writeoff',
      label: 'Resolve — write off (reviewer)',
      tone: 'danger',
      fields: [
        { key: 'written_off_zar', label: 'Written-off amount (ZAR)',        type: 'number',   required: false, placeholder: String(row.written_off_zar ?? '') },
        { key: 'writeoff_basis',  label: 'Write-off basis (unrecoverable)', type: 'textarea', required: false, placeholder: row.writeoff_basis ?? '' },
      ],
      cascadeTo: [],
    });
  }

  if (cancellable) {
    actions.push({
      key: 'cancel-reconciliation',
      label: 'Cancel (opened in error / superseded)',
      tone: 'ghost',
      fields: [
        { key: 'cancellation_basis', label: 'Cancellation basis (opened in error / superseded)', type: 'textarea', required: false, placeholder: row.cancellation_basis ?? '' },
        { key: 'reason_code',        label: 'Reason code',                                       type: 'text',     required: false, placeholder: row.reason_code ?? '' },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

// ── detail renderer ───────────────────────────────────────────────────────
function renderDetail(row: AssuranceRow): React.ReactNode {
  return (
    <div className="space-y-3 text-[11px]">
      {/* Four numbers */}
      <div className="rounded border px-3 py-2.5" style={{ background: BG1, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: TX3 }}>
          The four numbers (generation)
        </div>
        <div className="grid grid-cols-4 gap-3 mb-2">
          <DetailPair label="Expected"  value={fmtMwh(row.expected_generation_mwh)} />
          <DetailPair label="Metered"   value={fmtMwh(row.metered_generation_mwh)} />
          <DetailPair label="Settled"   value={fmtMwh(row.settled_generation_mwh)} />
          <DetailPair label="Invoiced"  value={fmtMwh(row.invoiced_generation_mwh)} />
        </div>
        <div className="grid grid-cols-3 gap-3 pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
          <DetailPair label="Expected revenue" value={fmtZar(row.expected_revenue_zar)} />
          <DetailPair label="Settled revenue"  value={fmtZar(row.settled_revenue_zar)} />
          <DetailPair label="Variance"         value={`${fmtZar(row.variance_zar)}${row.variance_mwh != null ? ` · ${fmtMwh(row.variance_mwh)}` : ''}`} />
        </div>
      </div>

      {/* Core fields grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <DetailPair label="Operator"          value={row.operator_name} />
        {row.counterparty_name && <DetailPair label="Counterparty (recovery target)" value={row.counterparty_name} />}
        {row.reviewer_name     && <DetailPair label="Reviewer"                       value={row.reviewer_name} />}
        {row.meter_id          && <DetailPair label="Revenue meter"                  value={row.meter_id} />}
        {row.ppa_ref           && <DetailPair label="PPA ref"                        value={row.ppa_ref} />}
        {row.tariff_ref        && <DetailPair label="Tariff ref"                     value={row.tariff_ref} />}
        {row.leakage_category  && <DetailPair label="Leakage category"               value={CATEGORY_LABEL[row.leakage_category]} />}
        {row.recovery_method   && <DetailPair label="Recovery method"                value={row.recovery_method} />}
        {row.recovered_zar != null && row.recovered_zar > 0    && <DetailPair label="Recovered"   value={fmtZar(row.recovered_zar)} />}
        {row.written_off_zar != null && row.written_off_zar > 0 && <DetailPair label="Written off" value={fmtZar(row.written_off_zar)} />}
        {row.data_cutoff_date  && <DetailPair label="Data cutoff"                    value={row.data_cutoff_date} />}
        {row.reason_code       && <DetailPair label="Reason code"                    value={row.reason_code} />}
        {row.source_wave && (
          <DetailPair
            label="Provenance"
            value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}${row.source_event ? ` (${row.source_event})` : ''}`}
          />
        )}
        {row.sla_deadline_at && !row.is_terminal && (
          <DetailPair
            label="Next SLA"
            value={`${new Date(row.sla_deadline_at).toLocaleString()} (${fmtMin(row.minutes_until_sla)})${row.escalation_level > 0 ? ` · ${row.escalation_level} breach(es)` : ''}`}
          />
        )}
      </div>

      {/* Basis text blocks */}
      {row.reconciliation_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Reconciliation basis</div>
          <div style={{ color: TX2 }}>{row.reconciliation_basis}</div>
        </div>
      )}
      {row.investigation_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Investigation basis</div>
          <div style={{ color: TX2 }}>{row.investigation_basis}</div>
        </div>
      )}
      {row.classification_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Classification basis</div>
          <div style={{ color: TX2 }}>{row.classification_basis}</div>
        </div>
      )}
      {row.recovery_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Recovery basis</div>
          <div style={{ color: TX2 }}>{row.recovery_basis}</div>
        </div>
      )}
      {row.dispute_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Dispute basis</div>
          <div style={{ color: TX2 }}>{row.dispute_basis}</div>
        </div>
      )}
      {row.resolution_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Resolution basis</div>
          <div style={{ color: TX2 }}>{row.resolution_basis}</div>
        </div>
      )}
      {row.writeoff_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Write-off basis</div>
          <div style={{ color: TX2 }}>{row.writeoff_basis}</div>
        </div>
      )}
      {row.cancellation_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Cancellation basis</div>
          <div style={{ color: TX2 }}>{row.cancellation_basis}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function GenerationRevenueAssuranceChainTab() {
  const [rows, setRows] = useState<AssuranceRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: AssuranceRow[] } }>('/generation-revenue-assurance/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load recon periods');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/generation-revenue-assurance/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/generation-revenue-assurance/chain/${rowId}`);
          setExpandedEvents(prev => ({ ...prev, [rowId]: res.data?.data?.events ?? [] }));
        } catch { /* silent */ }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load, expandedEvents]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: AssuranceRow; events: ChainEvent[] } }>(`/generation-revenue-assurance/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'breached')   return !!r.sla_breached;
      if (filter === 'reportable') return !!r.is_reportable;
      if (TIERS.has(filter))       return r.revenue_assurance_tier === filter;
      if (CATS.has(filter))        return r.leakage_category === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const k = kpis ?? {
    total: 0, open_count: 0, dispute_count: 0, recovered_count: 0,
    closed_clean_count: 0, written_off_count: 0, cancelled_count: 0,
    breached: 0, reportable_total: 0, large_open: 0,
    total_variance_zar: 0, recovered_zar_total: 0, written_off_zar_total: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Generation Revenue Assurance</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          Meter reconciliation · leakage classification · recovery tracking per site period
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"       value={k.total} />
        <KpiTile label="Open"        value={k.open_count} />
        <KpiTile label="In dispute"  value={k.dispute_count}    tone={k.dispute_count > 0 ? 'warn' : undefined} />
        <KpiTile label="SLA breached" value={k.breached}        tone={k.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Large open"  value={k.large_open}       tone={k.large_open > 0 ? 'bad' : undefined} />
        <KpiTile label="Reportable"  value={k.reportable_total} tone={k.reportable_total > 0 ? 'warn' : undefined} />
        <KpiTile label="Recovered"   value={fmtZar(k.recovered_zar_total)} />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: filter === f.key ? ACC : BG2,
              color: filter === f.key ? '#fff' : TX2,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
          Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.site_name} · ${row.reconciliation_period}`}
              meta={
                <span style={{ fontFamily: MONO, fontSize: 10, color: TX3 }}>
                  {row.gra_number}
                  {row.revenue_assurance_tier && (
                    <span className="ml-2 font-semibold" style={{ color: TX2 }}>
                      {row.revenue_assurance_tier.charAt(0).toUpperCase() + row.revenue_assurance_tier.slice(1)}
                    </span>
                  )}
                  {row.leakage_category && (
                    <span className="ml-2" style={{ color: row.leakage_category === 'meter_tampering' ? BAD : TX3 }}>
                      {row.leakage_category === 'meter_tampering' ? '⚠ TAMPER' : CATEGORY_LABEL[row.leakage_category]}
                    </span>
                  )}
                  {row.variance_zar !== 0 && (
                    <span className="ml-2" style={{ color: row.variance_zar < 0 ? BAD : TX2 }}>
                      {fmtZar(row.variance_zar)}
                    </span>
                  )}
                  {row.operator_name && (
                    <span className="ml-2" style={{ color: TX3 }}>{row.operator_name}</span>
                  )}
                </span>
              }
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No recon periods match the current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div className="rounded border px-3 py-2 min-w-[80px]" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

export default GenerationRevenueAssuranceChainTab;
