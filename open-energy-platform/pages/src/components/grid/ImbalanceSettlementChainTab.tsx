// Wave 105 - Grid Wholesale Imbalance Settlement & MTU Pricing chain tab.
// The financial settlement engine of the SO balancing mechanism. Sister
// of W13 dispatch nominations (the PRE side) and W50 reserve activation
// (the SUPPLY side). W105 is the post-fact per-MTU (market time unit /
// settlement period) settlement: actual vs nominated imbalance MWh times
// imbalance price times penalty multiplier, posted to BRPs, with dispute
// window, settled. 12-state P6 lifecycle (period_open ->
// meter_data_received -> nominations_reconciled -> imbalance_computed
// -> priced -> invoice_issued -> invoice_acknowledged ->
// dispute_window_open -> payment_pending -> settled -> archived) plus
// disputed / resolved_dispute / invoice_revised / aged_arrears branches
// and cancelled. Tier RE-DERIVED on every transition from
// imbalance_quantum_zar (minor<100k / standard<1m / material<10m /
// systemic>=10m), FLOOR-AT-MATERIAL on any one of 5 floor flags,
// FLOOR-AT-SYSTEMIC on high_voltage_brp OR system_critical_period.
// URGENT SLA polarity (higher tier = TIGHTER, systemic 12h on
// period_open, minor 14d). 4-step authority ladder (BRP_back_office ->
// BRP_finance_manager -> BRP_treasurer -> MO_settlement_admin).
//
// Beats PJM iMM Imbalance Settlement, ERCOT QSE Real-Time Settlement,
// CAISO Imbalance Settlement, NEM AEMO Settlement Statements, Nord Pool
// Imbalance Settlement, ENTSO-E Imbalance Settlement, National Grid ESO
// BSC Settlement, Hitachi Lumada Market Operations, Open Access
// Technology, Powel Pulse via LIVE coverage battery (imbalance direction,
// charge ZAR, penalty ZAR, total owed, completeness 0-130, urgency band,
// breach-imminent flag, days to dispute window close, authority required,
// regulator filing window hours, bridges to W13 dispatch chain + W50
// reserve chain, aged arrears bucket) composed every fetch from raw
// inputs.
//
// SIGNATURE regulator crossings:
//   raise_dispute   -> regulator EVERY tier when high_voltage_brp=TRUE
//   mark_settled    -> regulator on material + systemic when penalty_zar>0
//   aged_arrears    -> regulator EVERY tier when arrears_days >= 60
//   cancel_period   -> regulator EVERY tier when imbalance_mwh != 0
//   sla_breached    -> regulator on material + systemic
//
// Mounted on Grid workstation (primary write {admin,grid_operator}); READ
// all 9 personas.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

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
const GOOD   = 'var(--good, oklch(0.40 0.16 155))';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'period_open' | 'meter_data_received' | 'nominations_reconciled'
  | 'imbalance_computed' | 'priced' | 'invoice_issued' | 'invoice_acknowledged'
  | 'dispute_window_open' | 'payment_pending' | 'settled' | 'archived' | 'cancelled'
  | 'disputed' | 'resolved_dispute' | 'invoice_revised' | 'aged_arrears';

type Tier = 'minor' | 'standard' | 'material' | 'systemic';

type UrgencyBand = 'critical' | 'high' | 'medium' | 'low';

type Authority = 'BRP_back_office' | 'BRP_finance_manager' | 'BRP_treasurer' | 'MO_settlement_admin';

interface ImbRow {
  [key: string]: unknown;
  id: string;
  settlement_number: string;
  brp_id: string;
  brp_label: string | null;
  brp_voltage_class: string | null;
  market_zone: string | null;
  market_time_unit_minutes: number;
  settlement_period_start_at: string;
  settlement_period_end_at: string;
  nominated_mwh: number;
  metered_mwh: number;
  imbalance_mwh: number;
  imbalance_direction: string | null;
  long_price_zar_per_mwh: number;
  short_price_zar_per_mwh: number;
  price_applied_zar_per_mwh: number;
  penalty_multiplier: number;
  imbalance_charge_zar: number;
  penalty_zar: number;
  total_owed_zar: number;
  amount_paid_zar: number;
  amount_outstanding_zar: number;
  imbalance_quantum_zar: number;
  dispatch_nomination_ref: string | null;
  reserve_activation_ref: string | null;
  invoice_number: string | null;
  invoice_issued_at: string | null;
  invoice_due_at: string | null;
  invoice_revised_count: number;
  dispute_window_close_at: string | null;
  dispute_reason_code: string | null;
  dispute_narrative: string | null;
  dispute_resolution_text: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  payment_received_at: string | null;
  arrears_days: number;
  arrears_bucket: string | null;
  aged_arrears_at: string | null;
  imbalance_floor_flag_high_voltage_brp: number;
  imbalance_floor_flag_system_critical_period: number;
  imbalance_floor_flag_regulator_audit_period: number;
  imbalance_floor_flag_market_suspension_active: number;
  imbalance_floor_flag_repeated_breach_5plus: number;
  current_tier: Tier;
  authority_required: Authority | null;
  urgency_band: string | null;
  title: string | null;
  narrative: string | null;
  cancel_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  period_opened_at: string | null;
  meter_data_received_at: string | null;
  nominations_reconciled_at: string | null;
  imbalance_computed_at: string | null;
  priced_at: string | null;
  invoice_acknowledged_at: string | null;
  dispute_window_opened_at: string | null;
  disputed_at: string | null;
  resolved_dispute_at: string | null;
  invoice_revised_at: string | null;
  payment_pending_at: string | null;
  settled_at: string | null;
  archived_at: string | null;
  cancelled_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;
  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Decorated by route
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  imbalance_direction_live?: 'long' | 'short' | 'balanced';
  price_applied_zar_per_mwh_live?: number;
  imbalance_charge_zar_live?: number;
  penalty_zar_live?: number;
  total_owed_zar_live?: number;
  arrears_days_live?: number;
  arrears_bucket_live?: string;
  settlement_completeness_index_live?: number;
  sla_days_remaining_live?: number | null;
  urgency_band_live?: UrgencyBand;
  breach_imminent_flag_live?: boolean;
  regulator_filing_window_hours_live?: number | null;
  authority_required_live?: Authority;
  days_to_dispute_window_close_live?: number | null;
  bridges_to_dispatch_chain_live?: boolean;
  bridges_to_reserve_activation_chain_live?: boolean;
}

interface KpiData {
  total: number;
  active_count: number;
  dispute_open_count: number;
  aged_arrears_count: number;
  systemic_count: number;
  breached: number;
  reportable_total: number;
  dispatch_bridged_count: number;
  reserve_bridged_count: number;
  total_owed_zar: number;
  total_outstanding_zar: number;
  avg_settlement_hours: number;
}

const ALL_STATES = [
  'period_open',
  'meter_data_received',
  'nominations_reconciled',
  'imbalance_computed',
  'priced',
  'invoice_issued',
  'invoice_acknowledged',
  'dispute_window_open',
  'payment_pending',
  'settled',
  'archived',
] as const;

const BRANCH_STATES = [
  'disputed',
  'resolved_dispute',
  'invoice_revised',
  'aged_arrears',
  'cancelled',
] as const;

const FILTERS = [
  { key: 'active',           label: 'Active' },
  { key: 'all',              label: 'All' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'reportable',       label: 'Reportable' },
  { key: 'critical_urgency', label: 'Critical urgency' },
  { key: 'dispute_open',     label: 'Dispute open' },
  { key: 'arrears',          label: 'Aged arrears' },
  { key: 'dispatch_bridged', label: 'Bridged dispatch' },
  { key: 'reserve_bridged',  label: 'Bridged reserve' },
  { key: 'systemic',         label: 'Systemic' },
  { key: 'material',         label: 'Material' },
  { key: 'standard',         label: 'Standard' },
  { key: 'minor',            label: 'Minor' },
  { key: 'period_open',            label: 'Period open' },
  { key: 'meter_data_received',    label: 'Meter data' },
  { key: 'nominations_reconciled', label: 'Reconciled' },
  { key: 'imbalance_computed',     label: 'Computed' },
  { key: 'priced',                 label: 'Priced' },
  { key: 'invoice_issued',         label: 'Invoiced' },
  { key: 'invoice_acknowledged',   label: 'Acknowledged' },
  { key: 'dispute_window_open',    label: 'Window open' },
  { key: 'disputed',               label: 'Disputed' },
  { key: 'resolved_dispute',       label: 'Resolved' },
  { key: 'invoice_revised',        label: 'Revised' },
  { key: 'payment_pending',        label: 'Payment pending' },
  { key: 'aged_arrears',           label: 'Aged arrears (state)' },
  { key: 'settled',                label: 'Settled' },
];

const TIERS = new Set<string>(['minor', 'standard', 'material', 'systemic']);

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

function fmtMwh(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${v.toFixed(1)} MWh`;
}

function fmtDays(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '-';
  return `${v.toFixed(digits)}d`;
}

function fmtHours(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '-';
  return `${v.toFixed(digits)}h`;
}

const AUTH_LABEL: Record<Authority, string> = {
  BRP_back_office:    'BRP back office',
  BRP_finance_manager:'BRP finance manager',
  BRP_treasurer:      'BRP treasurer',
  MO_settlement_admin:'MO settlement admin',
};

function getActions(row: ImbRow): ChainAction[] {
  const cs = row.chain_status;
  const cancellable = !row.is_hard_terminal && cs !== 'settled' && cs !== 'archived';
  const actions: ChainAction[] = [];

  if (cs === 'period_open') {
    actions.push({
      key: 'receive-meter-data',
      label: 'Receive meter data (SO)',
      tone: 'primary',
      fields: [
        { key: 'metered_mwh', label: 'Metered MWh for the period', type: 'text', required: false },
      ],
    });
  }

  if (cs === 'meter_data_received') {
    actions.push({
      key: 'reconcile-nominations',
      label: 'Reconcile nominations (SO)',
      tone: 'primary',
    });
  }

  if (cs === 'nominations_reconciled') {
    actions.push({
      key: 'compute-imbalance',
      label: 'Compute imbalance (SO)',
      tone: 'primary',
      fields: [
        { key: 'imbalance_quantum_zar', label: 'Imbalance quantum ZAR (optional, sets tier)', type: 'text', required: false },
      ],
    });
  }

  if (cs === 'imbalance_computed') {
    actions.push({
      key: 'price-imbalance',
      label: 'Price imbalance (SO)',
      tone: 'primary',
      fields: [
        { key: 'long_price_zar_per_mwh',  label: 'Long price ZAR/MWh',      type: 'text', required: false },
        { key: 'short_price_zar_per_mwh', label: 'Short price ZAR/MWh',     type: 'text', required: false },
        { key: 'penalty_multiplier',      label: 'Penalty multiplier (>=1)', type: 'text', required: false },
      ],
    });
  }

  if (cs === 'priced' || cs === 'invoice_revised') {
    actions.push({
      key: 'issue-invoice',
      label: 'Issue invoice (settlement admin)',
      tone: 'primary',
      fields: [
        { key: 'invoice_number',  label: 'Invoice number (optional)',                    type: 'text', required: false },
        { key: 'invoice_due_at',  label: 'Invoice due ISO (optional, default +14d)',     type: 'text', required: false },
      ],
    });
  }

  if (cs === 'invoice_issued') {
    actions.push({
      key: 'acknowledge-invoice',
      label: 'Acknowledge invoice (BRP)',
      tone: 'primary',
    });
  }

  if (cs === 'invoice_acknowledged') {
    actions.push({
      key: 'open-dispute-window',
      label: 'Open dispute window (settlement admin)',
      tone: 'primary',
      fields: [
        { key: 'dispute_window_close_at', label: 'Dispute window close ISO (optional, default +7d)', type: 'text', required: false },
      ],
    });
  }

  if (cs === 'dispute_window_open') {
    actions.push({
      key: 'raise-dispute',
      label: 'Raise dispute (BRP)',
      tone: 'danger',
      cascadeTo: ['regulator'],
      fields: [
        { key: 'dispute_reason_code', label: 'Dispute reason code',          type: 'text',     required: false },
        { key: 'dispute_narrative',   label: 'Dispute narrative (optional)', type: 'textarea', required: false },
      ],
    });
    actions.push({
      key: 'record-payment',
      label: 'Record payment (BRP)',
      tone: 'primary',
      fields: [
        { key: 'payment_method',    label: 'Payment method (eft/wire/cheque)', type: 'text', required: false },
        { key: 'payment_reference', label: 'Payment reference',                type: 'text', required: false },
        { key: 'amount_paid_zar',   label: 'Amount paid (ZAR)',                type: 'text', required: false },
      ],
    });
  }

  if (cs === 'disputed') {
    actions.push({
      key: 'resolve-dispute',
      label: 'Resolve dispute (reviewer)',
      tone: 'primary',
      fields: [
        { key: 'dispute_resolution_text', label: 'Dispute resolution text', type: 'textarea', required: false },
      ],
    });
  }

  if (cs === 'resolved_dispute') {
    actions.push({
      key: 'revise-invoice',
      label: 'Revise invoice (settlement admin)',
      tone: 'primary',
      fields: [
        { key: 'long_price_zar_per_mwh',  label: 'Revised long price ZAR/MWh (optional)',    type: 'text', required: false },
        { key: 'short_price_zar_per_mwh', label: 'Revised short price ZAR/MWh (optional)',   type: 'text', required: false },
        { key: 'imbalance_quantum_zar',   label: 'Revised quantum ZAR (optional, sets tier)', type: 'text', required: false },
      ],
    });
  }

  if (cs === 'payment_pending' || cs === 'aged_arrears') {
    actions.push({
      key: 'record-payment',
      label: 'Record payment (BRP)',
      tone: 'primary',
      fields: [
        { key: 'payment_method',    label: 'Payment method (eft/wire/cheque)', type: 'text', required: false },
        { key: 'payment_reference', label: 'Payment reference',                type: 'text', required: false },
        { key: 'amount_paid_zar',   label: 'Amount paid (ZAR)',                type: 'text', required: false },
      ],
    });
    if (cs === 'payment_pending') {
      actions.push({
        key: 'mark-settled',
        label: 'Mark settled (settlement admin)',
        tone: 'primary',
        cascadeTo: ['regulator'],
      });
    }
  }

  if (cs === 'settled') {
    actions.push({
      key: 'archive-period',
      label: 'Archive period (archiver)',
      tone: 'ghost',
    });
  }

  if (cancellable) {
    actions.push({
      key: 'cancel-period',
      label: 'Cancel period',
      tone: 'danger',
      cascadeTo: ['regulator'],
      fields: [
        { key: 'cancel_reason', label: 'Cancel reason', type: 'textarea', required: false },
      ],
    });
  }

  return actions;
}

function renderDetail(row: ImbRow): React.ReactNode {
  const floored = !!(row.imbalance_floor_flag_high_voltage_brp
    || row.imbalance_floor_flag_system_critical_period
    || row.imbalance_floor_flag_regulator_audit_period
    || row.imbalance_floor_flag_market_suspension_active
    || row.imbalance_floor_flag_repeated_breach_5plus);

  return (
    <div className="space-y-3 text-[12px]">
      <div>
        <div style={{ fontSize: 10, color: TX3, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Imbalance position</div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-2">
          <DetailPair label="Nominated"     value={fmtMwh(row.nominated_mwh)} />
          <DetailPair label="Metered"       value={fmtMwh(row.metered_mwh)} />
          <DetailPair label="Imbalance MWh" value={`${row.imbalance_mwh.toFixed(2)} (${row.imbalance_direction_live ?? row.imbalance_direction ?? '-'})`} />
          <DetailPair label="Long price"    value={fmtZar(row.long_price_zar_per_mwh) + ' / MWh'} />
          <DetailPair label="Short price"   value={fmtZar(row.short_price_zar_per_mwh) + ' / MWh'} />
          <DetailPair label="Applied price" value={fmtZar(row.price_applied_zar_per_mwh_live ?? row.price_applied_zar_per_mwh) + ' / MWh'} />
          <DetailPair label="Charge"        value={fmtZar(row.imbalance_charge_zar_live ?? row.imbalance_charge_zar)} />
          <DetailPair label="Penalty"       value={fmtZar(row.penalty_zar_live ?? row.penalty_zar) + ` (x${row.penalty_multiplier.toFixed(2)})`} />
          <DetailPair label="Total owed"    value={fmtZar(row.total_owed_zar_live ?? row.total_owed_zar)} />
          <DetailPair label="Paid"          value={fmtZar(row.amount_paid_zar)} />
          <DetailPair label="Outstanding"   value={fmtZar(row.amount_outstanding_zar)} />
          <DetailPair label="Quantum (tier)" value={fmtZar(row.imbalance_quantum_zar)} />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, color: TX3, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Settlement battery</div>
        <div className="grid grid-cols-4 gap-x-4 gap-y-2">
          <DetailPair label="Completeness"     value={`${(row.settlement_completeness_index_live ?? 0).toFixed(0)} / 130`} />
          <DetailPair label="SLA days left"    value={row.sla_days_remaining_live != null ? fmtDays(row.sla_days_remaining_live) : '-'} />
          <DetailPair label="Dispute window"   value={row.days_to_dispute_window_close_live != null ? fmtDays(row.days_to_dispute_window_close_live) : '-'} />
          <DetailPair label="Reg filing"       value={row.regulator_filing_window_hours_live != null ? `${row.regulator_filing_window_hours_live}h` : '-'} />
          <DetailPair label="Arrears days"     value={`${row.arrears_days_live ?? row.arrears_days}`} />
          <DetailPair label="Arrears bucket"   value={row.arrears_bucket_live ?? row.arrears_bucket ?? '-'} />
          <DetailPair label="Revisions"        value={`${row.invoice_revised_count}`} />
          <DetailPair label="Escalations"      value={`${row.escalation_level}`} />
          <DetailPair label="Invoice #"        value={row.invoice_number ?? '-'} />
          <DetailPair label="Invoice due"      value={row.invoice_due_at ? new Date(row.invoice_due_at).toLocaleDateString() : '-'} />
          <DetailPair label="Payment ref"      value={row.payment_reference ?? '-'} />
          <DetailPair label="Tier"             value={row.current_tier} />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, color: TX3, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Floor flags</div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { on: !!row.imbalance_floor_flag_high_voltage_brp,          label: 'HV BRP (SYSTEMIC)' },
            { on: !!row.imbalance_floor_flag_system_critical_period,     label: 'System-critical period (SYSTEMIC)' },
            { on: !!row.imbalance_floor_flag_regulator_audit_period,     label: 'Regulator audit period (MATERIAL)' },
            { on: !!row.imbalance_floor_flag_market_suspension_active,   label: 'Market suspension (MATERIAL)' },
            { on: !!row.imbalance_floor_flag_repeated_breach_5plus,      label: 'Repeated breach 5+ (MATERIAL)' },
            { on: !!row.regulator_relevant,                              label: 'Regulator relevant' },
          ].map(({ on, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 px-2 py-1 rounded"
              style={{
                background: on ? 'color-mix(in oklab, var(--warn) 15%, var(--s1))' : BG2,
                border: `1px solid ${on ? 'oklch(0.80 0.12 55)' : BORDER}`,
                color: on ? WARN : TX3,
              }}
            >
              <span
                className="rounded-full flex-shrink-0"
                style={{ width: 6, height: 6, background: on ? WARN : TX3 }}
              />
              <span style={{ fontSize: 11 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {(row.dispatch_nomination_ref || row.reserve_activation_ref || row.regulator_inbox_ref
        || row.regulator_ref || row.dispute_reason_code || row.dispute_resolution_text
        || row.cancel_reason || row.reason_code) && (
        <div>
          <div style={{ fontSize: 10, color: TX3, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>References</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {row.dispatch_nomination_ref   && <DetailPair label="Dispatch ref"       value={row.dispatch_nomination_ref} />}
            {row.reserve_activation_ref    && <DetailPair label="Reserve ref"        value={row.reserve_activation_ref} />}
            {row.regulator_inbox_ref       && <DetailPair label="Regulator inbox"    value={row.regulator_inbox_ref} />}
            {row.regulator_ref             && <DetailPair label="Regulator ref"      value={row.regulator_ref} />}
            {row.dispute_reason_code       && <DetailPair label="Dispute reason"     value={row.dispute_reason_code} />}
            {row.dispute_resolution_text   && <DetailPair label="Dispute resolution" value={row.dispute_resolution_text} />}
            {row.cancel_reason             && <DetailPair label="Cancel reason"      value={row.cancel_reason} />}
            {row.reason_code               && <DetailPair label="Reason code"        value={row.reason_code} />}
          </div>
        </div>
      )}

      {row.authority_required_live || row.authority_required ? (
        <DetailPair
          label="Authority required"
          value={AUTH_LABEL[row.authority_required_live ?? row.authority_required!]}
        />
      ) : null}
    </div>
  );
}

export function ImbalanceSettlementChainTab() {
  const [rows, setRows] = useState<ImbRow[]>([]);
  const [summary, setSummary] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: ImbRow[] } }>('/grid/imbalance-settlement/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d as any;
        setSummary(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load imbalance settlements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v !== '' && v !== undefined) {
          const numericKeys = [
            'metered_mwh', 'imbalance_quantum_zar', 'long_price_zar_per_mwh',
            'short_price_zar_per_mwh', 'penalty_multiplier', 'amount_paid_zar',
          ];
          body[k] = numericKeys.includes(k) ? Number(v) : v;
        }
      }
      await api.post(`/grid/imbalance-settlement/chain/${rowId}/${key}`, body);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: ImbRow; events: ChainEvent[] } }>(`/grid/imbalance-settlement/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events || [] }));
    } catch {
      // silently ignore
    }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')              return true;
      if (filter === 'active')           return !r.is_terminal;
      if (filter === 'breached')         return r.sla_breached_live;
      if (filter === 'reportable')       return r.is_reportable_flag;
      if (filter === 'critical_urgency') return r.urgency_band_live === 'critical';
      if (filter === 'dispute_open')     return r.chain_status === 'dispute_window_open' || r.chain_status === 'disputed';
      if (filter === 'arrears')          return r.chain_status === 'aged_arrears' || (r.arrears_days_live ?? 0) >= 30;
      if (filter === 'dispatch_bridged') return r.bridges_to_dispatch_chain_live;
      if (filter === 'reserve_bridged')  return r.bridges_to_reserve_activation_chain_live;
      if (TIERS.has(filter))             return r.current_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  return (
    <div style={{ background: BG, minHeight: '100%', padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: TX1 }}>Imbalance Settlement</div>
        <div style={{ fontSize: 12, color: TX2, marginTop: 2 }}>
          MTU wholesale imbalance settlement · URGENT SLA · dispatch + reserve bridges
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 10 }}>
        <KpiTile label="SLA breached"   value={summary?.breached ?? 0}            tone={(summary?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Dispute open"   value={summary?.dispute_open_count ?? 0}  tone={(summary?.dispute_open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Aged arrears"   value={summary?.aged_arrears_count ?? 0}  tone={(summary?.aged_arrears_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Systemic tier"  value={summary?.systemic_count ?? 0}      tone={(summary?.systemic_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Active"         value={summary?.active_count ?? 0} />
        <KpiTile label="Total"          value={summary?.total ?? 0} />
        <KpiTile label="Total owed"     value={fmtZar(summary?.total_owed_zar ?? 0)} />
        <KpiTile label="Avg settlement" value={fmtHours(summary?.avg_settlement_hours ?? 0)} />
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                padding: '3px 10px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 500,
                border: `1px solid ${active ? ACC : BORDER}`,
                background: active ? ACC : BG1,
                color: active ? '#fff' : TX2,
                cursor: 'pointer',
                transition: 'background 120ms',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {err && (
        <div style={{ padding: '8px 12px', background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', border: `1px solid ${BAD}30`, borderRadius: 8, color: BAD, fontSize: 12 }}>
          {err}
        </div>
      )}

      {/* ChainCard list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: TX3, fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: TX3, fontSize: 13 }}>No settlement periods match the current filter.</div>
        ) : filtered.map((row) => {
          const floored = !!(row.imbalance_floor_flag_high_voltage_brp
            || row.imbalance_floor_flag_system_critical_period
            || row.imbalance_floor_flag_regulator_audit_period
            || row.imbalance_floor_flag_market_suspension_active
            || row.imbalance_floor_flag_repeated_breach_5plus);

          const metaParts: string[] = [
            row.market_zone ?? '-',
            row.brp_voltage_class ?? '-',
            row.current_tier.toUpperCase(),
            fmtMwh(row.imbalance_mwh),
            fmtZar(row.total_owed_zar_live ?? row.total_owed_zar),
          ];
          if (floored) metaParts.push('FLOOR');
          if (row.bridges_to_dispatch_chain_live) metaParts.push('DISPATCH');
          if (row.bridges_to_reserve_activation_chain_live) metaParts.push('RESERVE');
          if ((row.arrears_days_live ?? 0) >= 30) metaParts.push(`ARREARS ${row.arrears_days_live}d`);

          const cascadeTo: string[] = [];
          if (row.is_reportable_flag) cascadeTo.push('regulator');

          return (
            <ChainCard
              key={row.id}
              item={{
                ...row,
                case_number: row.settlement_number,
                sla_breached: row.sla_breached_live ?? !!row.sla_breached,
              }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.brp_label ?? row.brp_id} · ${new Date(row.settlement_period_start_at).toLocaleString()}`}
              meta={metaParts.join(' · ')}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={cascadeTo}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          );
        })}
      </div>
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: TX3, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: TX3, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
      <div style={{ fontSize: 12, color: TX1, marginTop: 2 }}>{value}</div>
    </div>
  );
}

export default ImbalanceSettlementChainTab;
