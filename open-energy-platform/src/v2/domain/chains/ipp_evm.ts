// ipp_evm — an IPP project cost book run as Earned Value Management, as data.
//
// A cost engineer sets a budget (BAC), books committed then incurred cost, and
// measures the EVM triple (PV/EV/AC). From the measurement the book either
// reconciles clean (within tolerance) or flags a variance. A flagged variance
// forces the reforecast spine: draft → publish → reconcile. The approval gate is
// STRUCTURAL, not a guard: publish_reforecast leaves ONLY reforecast_drafted,
// and reforecast_drafted is reachable ONLY from variance_detected (via
// draft_reforecast). So a reforecast can NEVER be published on a book that never
// detected a variance — the state graph forbids it, no guard needed.
//
// Strategic crossing: publishing a reforecast on a ≥100 MW project needs the
// regulator on the txn (regulatorPresentIfStrategic reads capacity_mw).
//
// settles:false — an EVM cost book is a project-controls record, never a payment
// (R-S5-1). The money it names is settled by the drawdown/disbursement chains it
// bridges to, not here.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const num = (v: Json | undefined): number => (typeof v === 'number' ? v : 0);

// pure EVM indices off the measured triple + budget. No clock, no env.
const computeEvm = (f: Record<string, Json>) => {
  const pv = num(f.planned_value_zar);
  const ev = num(f.earned_value_zar);
  const ac = num(f.actual_cost_zar);
  const bac = num(f.budget_at_completion_zar);
  const cpi = ac > 0 ? ev / ac : 0;
  const spi = pv > 0 ? ev / pv : 0;
  return {
    cpi,
    spi,
    cost_variance_zar: ev - ac,
    schedule_variance_zar: ev - pv,
    estimate_at_completion_zar: cpi > 0 ? bac / cpi : bac,
    evm_health_band: healthBand(cpi),
  };
};

const healthBand = (cpi: number): string => {
  if (cpi >= 1) return 'on_or_under_budget';
  if (cpi >= 0.95) return 'watch';
  if (cpi >= 0.85) return 'concern';
  return 'critical';
};

export const ippEvm: ChainDecl = {
  key: 'ipp_evm',
  noun: 'IPP EVM cost book',
  refPrefix: 'IE',
  title: (f) => `EVM ${(f.project_name as string) ?? (f.project_id as string) ?? 'project'} — CPI ${typeof f.cpi === 'number' ? f.cpi.toFixed(2) : 'n/a'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'IPP project cost & schedule controls', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'generation-project reporting', effect: 'requires' },
  ],
  roles: ['cost_engineer', 'finance_director', 'pm', 'regulator'],

  fields: {
    evm_number: { type: 'string', label: 'EVM number' },
    project_id: { type: 'string', required: true, label: 'Project' },
    project_name: { type: 'string', label: 'Project name' },
    capacity_mw: { type: 'number', min: 0, label: 'Project capacity (MW)' },
    author_party: { type: 'party', role: 'cost_engineer', label: 'Cost engineer' },
    approver_party: { type: 'party', role: 'finance_director', label: 'Finance director' },
    // budget
    budget_at_completion_zar: { type: 'number', min: 0, label: 'Budget at completion (ZAR)' },
    committed_cost_zar: { type: 'number', min: 0, label: 'Committed cost (ZAR)' },
    // EVM measured triple
    planned_value_zar: { type: 'number', min: 0, label: 'Planned value (ZAR)' },
    earned_value_zar: { type: 'number', min: 0, label: 'Earned value (ZAR)' },
    actual_cost_zar: { type: 'number', min: 0, label: 'Actual cost (ZAR)' },
    // derived indices (written by derive, never the client)
    cpi: { type: 'number', label: 'CPI' },
    spi: { type: 'number', label: 'SPI' },
    cost_variance_zar: { type: 'number', label: 'Cost variance (ZAR)' },
    schedule_variance_zar: { type: 'number', label: 'Schedule variance (ZAR)' },
    estimate_at_completion_zar: { type: 'number', label: 'Estimate at completion (ZAR)' },
    evm_health_band: { type: 'string', label: 'EVM health band' },
    // narrative
    variance_reason: { type: 'string', label: 'Variance narrative' },
    reforecast_reason: { type: 'string', label: 'Reforecast narrative' },
    variance_count: { type: 'number', label: 'Times a variance was flagged' },
    // derive-stamped timestamps
    measured_at: { type: 'string', label: 'Measured at' },
    variance_detected_at: { type: 'string', label: 'Variance detected at' },
    reforecast_published_at: { type: 'string', label: 'Reforecast published at' },
    reconciled_at: { type: 'string', label: 'Reconciled at' },
    closed_at_evm: { type: 'string', label: 'Book closed at' },
  },

  initial: 'budget_set',

  states: {
    budget_set: { label: 'Budget set', terminal: false, holder: 'cost_engineer', sla: { hours: 24 } },
    committed: { label: 'Cost committed', terminal: false, holder: 'cost_engineer', sla: { hours: 24 } },
    incurred: { label: 'Cost incurred', terminal: false, holder: 'cost_engineer', sla: { hours: 24 } },
    measured: { label: 'EVM measured', terminal: false, holder: 'cost_engineer', sla: { hours: 8 } },
    variance_detected: { label: 'Variance detected', terminal: false, holder: 'cost_engineer', sla: { hours: 8 } },
    reforecast_drafted: { label: 'Reforecast drafted', terminal: false, holder: 'finance_director', sla: { hours: 24 } },
    reforecast_rejected: { label: 'Reforecast rejected', terminal: false, holder: 'cost_engineer', sla: { hours: 24 } },
    reforecast_published: { label: 'Reforecast published', terminal: false, holder: 'cost_engineer', sla: { hours: 8 } },
    reconciled: { label: 'Reconciled', terminal: false, holder: 'finance_director', sla: { hours: 24 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'budget_set',
      by: ['cost_engineer', 'pm'],
      actorBecomes: 'cost_engineer',
      label: 'Set budget',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        project_name: { type: 'string' },
        capacity_mw: { type: 'number', min: 0 },
        budget_at_completion_zar: { type: 'number', required: true, min: 0 },
        approver_party: { type: 'party', role: 'finance_director' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'commit_costs',
      from: 'budget_set',
      to: 'committed',
      by: ['cost_engineer'],
      label: 'Book committed cost',
      intent: 'primary',
      input: { committed_cost_zar: { type: 'number', required: true, min: 0 } },
      guards: [],
    },
    {
      id: 'incur_costs',
      from: 'committed',
      to: 'incurred',
      by: ['cost_engineer'],
      label: 'Book incurred cost',
      intent: 'primary',
      input: { actual_cost_zar: { type: 'number', required: true, min: 0 } },
      guards: [],
    },
    {
      id: 'measure',
      from: 'incurred',
      to: 'measured',
      by: ['cost_engineer'],
      label: 'Measure EVM',
      intent: 'primary',
      input: {
        planned_value_zar: { type: 'number', required: true, min: 0 },
        earned_value_zar: { type: 'number', required: true, min: 0 },
        actual_cost_zar: { type: 'number', required: true, min: 0 },
      },
      guards: [],
      derive: (f, at: Instant) => ({ ...computeEvm(f), measured_at: isoUtc(at) }),
    },
    {
      // within-tolerance happy exit: no variance, book reconciles straight off
      // the measurement.
      id: 'accept_measurement',
      from: 'measured',
      to: 'reconciled',
      by: ['cost_engineer', 'finance_director'],
      label: 'Accept measurement',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ reconciled_at: isoUtc(at) }),
    },
    {
      id: 'flag_variance',
      from: 'measured',
      to: 'variance_detected',
      by: ['cost_engineer', 'pm'],
      label: 'Flag variance',
      intent: 'secondary',
      input: { variance_reason: { type: 'string', required: true } },
      requiresReason: ['cost_overrun', 'schedule_slip', 'scope_growth', 'forex_swing', 'contingency_draw'],
      guards: [],
      derive: (f, at: Instant) => ({
        variance_detected_at: isoUtc(at),
        variance_count: (typeof f.variance_count === 'number' ? f.variance_count : 0) + 1,
      }),
    },
    {
      id: 'draft_reforecast',
      from: ['variance_detected', 'reforecast_rejected'],
      to: 'reforecast_drafted',
      by: ['cost_engineer'],
      label: 'Draft reforecast',
      intent: 'primary',
      input: {
        reforecast_reason: { type: 'string', required: true },
        estimate_at_completion_zar: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      // structural approval + strategic-crossing gate: the ONLY edge into
      // reforecast_published, reachable ONLY from reforecast_drafted. A ≥100 MW
      // project needs the regulator on the txn to publish.
      id: 'publish_reforecast',
      from: 'reforecast_drafted',
      to: 'reforecast_published',
      by: ['finance_director'],
      label: 'Publish reforecast',
      intent: 'primary',
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ reforecast_published_at: isoUtc(at) }),
    },
    {
      id: 'reconcile_reforecast',
      from: 'reforecast_published',
      to: 'reconciled',
      by: ['cost_engineer', 'finance_director'],
      label: 'Reconcile reforecast',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ reconciled_at: isoUtc(at) }),
    },
    {
      id: 'close_book',
      from: 'reconciled',
      to: 'closed',
      by: ['finance_director'],
      label: 'Close cost book',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_evm: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_reforecast',
      from: 'reforecast_drafted',
      to: 'reforecast_rejected',
      by: ['finance_director'],
      label: 'Reject reforecast',
      intent: 'destructive',
      requiresReason: ['insufficient_justification', 'assumptions_unsupported', 'recompute_required', 'authority_exceeded'],
      guards: [],
    },
    {
      id: 'cancel_book',
      from: ['budget_set', 'committed', 'incurred', 'measured', 'variance_detected', 'reforecast_drafted', 'reforecast_rejected'],
      to: 'cancelled',
      by: ['cost_engineer', 'finance_director', 'system'],
      label: 'Cancel cost book',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'duplicate_book', 'data_error', 'superseded', 'reforecast_deadline_missed'],
      guards: [],
    },
  ],

  // variance-detected time-bar: a flagged variance left without a reforecast
  // draft for 30 days stales out and escalates (permit_to_work / ppa_contract
  // pattern).
  timers: [{ onState: 'variance_detected', after: { days: 30 }, fire: 'cancel_book', kind: 'time_bar', reason: 'reforecast_deadline_missed' }],
};
