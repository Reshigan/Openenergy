// poslimit_case — trader position-limit compliance case, as data.
//
// FSCA Section 41: every trading member operates within an FSCA-licensed
// position cap per instrument per tenor. A breach opens a case that the
// compliance desk drives through an escalation ladder — warning → soft
// breach → hard breach → margin call → required reduction → executing
// reduction — until the trader cures back inside limit, the desk force-
// liquidates the position, or the reading turns out to be stale telemetry
// (false alarm). Mirrors the v1 state graph in
// src/utils/poslimit-chain-spec.ts exactly (that module is the source of
// truth for the escalation ladder and stays live for SLA-minute lookups).
//
// Structural honesty (no invented guards):
//  - cured is reachable from every open state (any point in the ladder can
//    resolve back inside limit) — the state graph, not a guard, carries that.
//  - force_liquidate only fires once a margin call has already gone out
//    (from margin_call_issued/reduction_required/reduction_executing) — the
//    graph enforces "warn before you liquidate", no guard needed.
//  - mark_false_alarm only reaches from warning/soft_breach: once a hard
//    breach or margin call has fired, the case is real by definition and
//    "false alarm" is no longer a legitimate exit.
//  - begin_reduction is trader-only among the roles (v1's TRADER_WRITE
//    split): the trader who owns the book is the one who can start the
//    unwind; every other edge is the compliance desk / regulator.
//  - none of the 10 registry guards model a per-instrument utilisation
//    breach, so every edge below carries guards: [] — the escalation ladder
//    itself is the control.
//
// settles:false — a case records enforcement state and demands a margin
// top-up; the ZAR actually moving settles on its own rail (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const poslimitCase: ChainDecl = {
  key: 'poslimit_case',
  noun: 'Position limit case',
  refPrefix: 'PLC',
  title: (f) => `Position limit — ${(f.instrument as string) ?? 'unnamed instrument'} (${(f.trader_tier as string) ?? 'tier TBC'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Financial Sector Conduct Authority (FSCA) Conduct Standard', provision: 'Section 41 — position-limit compliance', effect: 'requires' },
  ],
  roles: ['trader', 'marketmaker', 'compliance', 'regulator', 'operator'],

  fields: {
    case_number: { type: 'string', label: 'Case number' },
    instrument: { type: 'string', required: true, label: 'Instrument' },
    instrument_class: { type: 'string', label: 'Instrument class' },
    tenor: { type: 'string', label: 'Tenor' },
    trader_party: { type: 'party', role: 'trader', label: 'Trading member' },
    trader_tier: { type: 'string', label: 'Tier (prop/market_maker/retail)' },
    fsca_license_ref: { type: 'string', label: 'FSCA licence ref' },
    cap_mw: { type: 'number', min: 0, label: 'Position cap (MW)' },
    position_mw: { type: 'number', min: 0, label: 'Position (MW)' },
    utilisation_pct: { type: 'number', min: 0, label: 'Utilisation (%)' },
    cap_zar: { type: 'number', min: 0, label: 'Cap (ZAR)' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator / FSCA desk' },
    fsca_ref: { type: 'string', label: 'FSCA ref' },
    margin_called_zar: { type: 'number', min: 0, label: 'Margin called (ZAR)' },
    reduction_target_mw: { type: 'number', min: 0, label: 'Reduction target (MW)' },
    reduction_achieved_mw: { type: 'number', min: 0, label: 'Reduction achieved (MW)' },
    liquidation_order_ref: { type: 'string', label: 'Liquidation order ref' },
    rod_notes: { type: 'string', label: 'Notes' },
    // written by derive, never by the client
    warning_at: { type: 'string', label: 'Warning at' },
    soft_breach_at: { type: 'string', label: 'Soft breach at' },
    hard_breach_at: { type: 'string', label: 'Hard breach at' },
    margin_call_issued_at: { type: 'string', label: 'Margin call issued at' },
    reduction_required_at: { type: 'string', label: 'Reduction required at' },
    reduction_executing_at: { type: 'string', label: 'Reduction executing at' },
    cured_at: { type: 'string', label: 'Cured at' },
    escalated_at: { type: 'string', label: 'Escalated at' },
    false_alarm_at: { type: 'string', label: 'False alarm at' },
  },

  initial: 'warning',

  states: {
    warning: { label: 'Warning', terminal: false, holder: 'compliance', sla: { hours: 4 } },
    soft_breach: { label: 'Soft breach', terminal: false, holder: 'compliance', sla: { hours: 24 } },
    hard_breach: { label: 'Hard breach', terminal: false, holder: 'compliance', sla: { hours: 4 } },
    margin_call_issued: { label: 'Margin call issued', terminal: false, holder: 'compliance', sla: { hours: 24 } },
    reduction_required: { label: 'Reduction required', terminal: false, holder: 'trader', sla: { hours: 6 } },
    reduction_executing: { label: 'Reduction executing', terminal: false, holder: 'trader', sla: { hours: 24 } },
    cured: { label: 'Cured', terminal: true, holder: 'none' },
    escalated: { label: 'Escalated (forced liquidation)', terminal: true, holder: 'none' },
    false_alarm: { label: 'False alarm', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'raise_warning',
      from: '@new',
      to: 'warning',
      by: ['compliance', 'regulator', 'operator'],
      actorBecomes: 'regulator',
      label: 'Raise position-limit warning',
      intent: 'primary',
      input: {
        case_number: { type: 'string' },
        instrument: { type: 'string', required: true },
        instrument_class: { type: 'string' },
        tenor: { type: 'string' },
        trader_party: { type: 'party', role: 'trader' },
        trader_tier: { type: 'string' },
        fsca_license_ref: { type: 'string' },
        cap_mw: { type: 'number', min: 0 },
        position_mw: { type: 'number', min: 0 },
        utilisation_pct: { type: 'number', min: 0 },
        cap_zar: { type: 'number', min: 0 },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ warning_at: isoUtc(at) }),
    },
    {
      id: 'escalate_intraday',
      from: 'warning',
      to: 'soft_breach',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Escalate to soft breach (intraday)',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ soft_breach_at: isoUtc(at) }),
    },
    {
      id: 'escalate_overnight',
      from: 'soft_breach',
      to: 'hard_breach',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Escalate to hard breach (overnight)',
      intent: 'primary',
      input: { fsca_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ hard_breach_at: isoUtc(at) }),
    },
    {
      id: 'issue_margin_call',
      from: 'hard_breach',
      to: 'margin_call_issued',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Issue margin call',
      intent: 'primary',
      input: {
        margin_called_zar: { type: 'number', min: 0 },
        fsca_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ margin_call_issued_at: isoUtc(at) }),
    },
    {
      id: 'require_reduction',
      from: 'margin_call_issued',
      to: 'reduction_required',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Require position reduction',
      intent: 'primary',
      input: { reduction_target_mw: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ reduction_required_at: isoUtc(at) }),
    },
    {
      // trader-only edge (v1 TRADER_WRITE split): the book owner starts the unwind.
      id: 'begin_reduction',
      from: 'reduction_required',
      to: 'reduction_executing',
      by: ['trader', 'marketmaker', 'compliance', 'operator'],
      label: 'Begin reduction',
      intent: 'primary',
      input: { reduction_achieved_mw: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ reduction_executing_at: isoUtc(at) }),
    },
    {
      // reachable from every open rung — a cure can land at any point in the ladder.
      id: 'accept_cure',
      from: ['warning', 'soft_breach', 'hard_breach', 'margin_call_issued', 'reduction_required', 'reduction_executing'],
      to: 'cured',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Accept cure',
      intent: 'primary',
      input: { rod_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ cured_at: isoUtc(at) }),
    },
    {
      // only reachable once a margin call has already gone out — warn before you liquidate.
      id: 'force_liquidate',
      from: ['margin_call_issued', 'reduction_required', 'reduction_executing'],
      to: 'escalated',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Force liquidate',
      intent: 'destructive',
      input: {
        liquidation_order_ref: { type: 'string' },
        rod_notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ escalated_at: isoUtc(at) }),
    },
    {
      // only from warning/soft_breach: once a hard breach fires the case is real.
      id: 'mark_false_alarm',
      from: ['warning', 'soft_breach'],
      to: 'false_alarm',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Mark false alarm',
      intent: 'secondary',
      input: { rod_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ false_alarm_at: isoUtc(at) }),
    },
  ],
};
