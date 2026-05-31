// Wave 131 - Project Stage Gates (DG0-DG4) spec battery.
//
// PHASE E WAVE 1 OF N - First IPP-PM profile-completeness wave.
//
// Covers: 12-state forward + 4-branch machine, 17-action TRANSITIONS,
// INVERTED SLA polarity anchored at gate_proposed
// (168/336/720/1440/2160h), tier derivation from
// (capex_zar, equator_category, debt_sized),
// FLOOR-AT-HIGH on >=1 of 5 flags + FLOOR-AT-MEGA on >=3 flags,
// effectiveTier with FLOOR lifting,
// W131 SIGNATURE reject_gate EVERY tier (project termination hard line;
// sister of W127 rollback), record_decision DG4 EVERY tier (NERSA s14),
// record_decision DG0/DG3 medium+, defer_gate mega+equator only,
// sla_breached high+mega+equator only,
// party + event routing (4-step: project_manager / ie_assessor / cfo /
// board_chair), 5-bridge architecture (W19/W20/W21/W113/W118 MANDATORY),
// conditional-pass loop (gate_conditional_pass -> conditions_satisfied),
// seed row sg-001 sla_target_hours=168, sg-004 sla_target_hours=2160.

import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS,
  nextStatus,
  allowedActions,
  isTerminal,
  isHardTerminal,
  SLA_HOURS,
  slaWindowHours,
  slaDeadlineFor,
  slaHoursRemaining,
  tierForScope,
  countFloorFlags,
  floorAtHigh,
  floorAtMega,
  effectiveTier,
  isReportable,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  eventTypeFor,
  urgencyBand,
  authorityRequired,
  bridgesToW19,
  bridgesToW20,
  bridgesToW21,
  bridgesToW113,
  bridgesToW118,
  conditionsAgingDays,
  timeInStateHours,
  GATE_NAMES,
} from '../src/utils/stage-gate-spec';

// ─── 1. Forward path ───────────────────────────────────────────────────────
describe('W131 stage gates — forward path', () => {
  it('walks all 12 forward states gate_proposed -> archived', () => {
    expect(nextStatus('gate_proposed', 'compile_evidence')).toBe('evidence_compiled');
    expect(nextStatus('evidence_compiled', 'ie_review')).toBe('ie_reviewed');
    expect(nextStatus('ie_reviewed', 'lender_review')).toBe('lender_reviewed');
    expect(nextStatus('lender_reviewed', 'circulate_board_briefing')).toBe('board_briefing_circulated');
    expect(nextStatus('board_briefing_circulated', 'hold_cab')).toBe('cab_held');
    expect(nextStatus('cab_held', 'set_conditions')).toBe('conditions_set');
    expect(nextStatus('conditions_set', 'record_decision')).toBe('decision_recorded');
    expect(nextStatus('decision_recorded', 'satisfy_conditions')).toBe('conditions_satisfied');
    expect(nextStatus('conditions_satisfied', 'pass_gate')).toBe('gate_passed');
    expect(nextStatus('gate_passed', 'notify_downstream')).toBe('notified_downstream');
    expect(nextStatus('notified_downstream', 'archive')).toBe('archived');
  });

  it('rejects transitions from terminal states', () => {
    expect(nextStatus('archived', 'compile_evidence')).toBeNull();
    expect(nextStatus('gate_rejected', 'compile_evidence')).toBeNull();
    expect(nextStatus('gate_withdrawn', 'compile_evidence')).toBeNull();
  });

  it('rejects invalid action/state combinations', () => {
    // Can't compile evidence from archived
    expect(nextStatus('gate_proposed', 'archive')).toBeNull();
    // Can't pass gate without conditions_satisfied
    expect(nextStatus('evidence_compiled', 'pass_gate')).toBeNull();
  });
});

// ─── 2. Branch states ──────────────────────────────────────────────────────
describe('W131 stage gates — branch states', () => {
  it('defer_gate from any non-terminal -> gate_deferred (SOFT)', () => {
    expect(nextStatus('gate_proposed', 'defer_gate')).toBe('gate_deferred');
    expect(nextStatus('evidence_compiled', 'defer_gate')).toBe('gate_deferred');
    expect(nextStatus('cab_held', 'defer_gate')).toBe('gate_deferred');
    expect(nextStatus('conditions_satisfied', 'defer_gate')).toBe('gate_deferred');
  });

  it('withdraw_gate from any non-terminal -> gate_withdrawn (SOFT/HARD)', () => {
    expect(nextStatus('gate_proposed', 'withdraw_gate')).toBe('gate_withdrawn');
    expect(nextStatus('decision_recorded', 'withdraw_gate')).toBe('gate_withdrawn');
  });

  it('reject_gate from any non-terminal -> gate_rejected (HARD - W131 SIGNATURE)', () => {
    expect(nextStatus('gate_proposed', 'reject_gate')).toBe('gate_rejected');
    expect(nextStatus('evidence_compiled', 'reject_gate')).toBe('gate_rejected');
    expect(nextStatus('conditions_set', 'reject_gate')).toBe('gate_rejected');
    expect(nextStatus('gate_conditional_pass', 'reject_gate')).toBe('gate_rejected');
  });

  it('conditional_pass loops: conditions_satisfied -> gate_conditional_pass -> conditions_satisfied', () => {
    // The conditional_pass branch
    expect(nextStatus('conditions_satisfied', 'conditional_pass')).toBe('gate_conditional_pass');
    expect(nextStatus('gate_passed', 'conditional_pass')).toBe('gate_conditional_pass');
    // Loop back: satisfy_conditions from gate_conditional_pass
    expect(nextStatus('gate_conditional_pass', 'satisfy_conditions')).toBe('conditions_satisfied');
    // Then can pass_gate again
    expect(nextStatus('conditions_satisfied', 'pass_gate')).toBe('gate_passed');
  });

  it('gate_deferred loops back via compile_evidence', () => {
    expect(nextStatus('gate_deferred', 'compile_evidence')).toBe('evidence_compiled');
  });

  it('cannot transition from hard terminals', () => {
    expect(isHardTerminal('archived')).toBe(true);
    expect(isHardTerminal('gate_rejected')).toBe(true);
    expect(isHardTerminal('gate_withdrawn')).toBe(true);
    expect(isHardTerminal('gate_proposed')).toBe(false);
    expect(isHardTerminal('gate_deferred')).toBe(false);
    expect(isHardTerminal('gate_conditional_pass')).toBe(false);
  });
});

// ─── 3. Tier derivation ────────────────────────────────────────────────────
describe('W131 stage gates — tier derivation', () => {
  it('equator_cat_a overrides capex band (FLOOR - highest E&S risk)', () => {
    expect(tierForScope({ capex_zar: 50_000_000, equator_category: 'cat_a' })).toBe('equator_cat_a');
    expect(tierForScope({ capex_zar: 5_000_000_000, equator_category: 'cat_a' })).toBe('equator_cat_a');
  });

  it('capex bands map correctly', () => {
    expect(tierForScope({ capex_zar: 50_000_000 })).toBe('low_capex');         // < 100M
    expect(tierForScope({ capex_zar: 100_000_000 })).toBe('medium_capex');     // 100M boundary
    expect(tierForScope({ capex_zar: 250_000_000 })).toBe('medium_capex');
    expect(tierForScope({ capex_zar: 500_000_000 })).toBe('high_capex');       // 500M boundary
    expect(tierForScope({ capex_zar: 1_500_000_000 })).toBe('high_capex');
    expect(tierForScope({ capex_zar: 2_000_000_000 })).toBe('mega_capex');     // 2bn boundary
    expect(tierForScope({ capex_zar: 2_500_000_000 })).toBe('mega_capex');
  });
});

// ─── 4. INVERTED SLA ──────────────────────────────────────────────────────
describe('W131 stage gates — INVERTED SLA at gate_proposed', () => {
  it('sg-001 seed: low_capex gate_proposed = 168h (7d)', () => {
    expect(slaWindowHours('gate_proposed', 'low_capex')).toBe(168);
  });

  it('medium_capex gate_proposed = 336h (14d)', () => {
    expect(slaWindowHours('gate_proposed', 'medium_capex')).toBe(336);
  });

  it('high_capex gate_proposed = 720h (30d)', () => {
    expect(slaWindowHours('gate_proposed', 'high_capex')).toBe(720);
  });

  it('mega_capex gate_proposed = 1440h (60d)', () => {
    expect(slaWindowHours('gate_proposed', 'mega_capex')).toBe(1440);
  });

  it('sg-004 seed: equator_cat_a gate_proposed = 2160h (90d)', () => {
    expect(slaWindowHours('gate_proposed', 'equator_cat_a')).toBe(2160);
  });

  it('polarity is strictly INVERTED: larger gates get more time', () => {
    const tiers = ['low_capex', 'medium_capex', 'high_capex', 'mega_capex', 'equator_cat_a'] as const;
    const hours = tiers.map(t => slaWindowHours('gate_proposed', t));
    for (let i = 1; i < hours.length; i++) {
      expect(hours[i]).toBeGreaterThan(hours[i - 1]);
    }
  });

  it('terminal states have no SLA', () => {
    expect(slaWindowHours('archived', 'mega_capex')).toBe(0);
    expect(slaWindowHours('gate_rejected', 'equator_cat_a')).toBe(0);
    expect(slaWindowHours('gate_withdrawn', 'high_capex')).toBe(0);
  });

  it('slaDeadlineFor computes correctly', () => {
    const base = new Date('2026-06-01T00:00:00Z');
    const deadline = slaDeadlineFor('gate_proposed', 'low_capex', base);
    expect(deadline).not.toBeNull();
    expect(deadline!.getTime()).toBe(base.getTime() + 168 * 3600 * 1000);
  });

  it('slaHoursRemaining returns correct remaining', () => {
    const entered = new Date('2026-06-01T00:00:00Z');
    const now = new Date('2026-06-02T00:00:00Z'); // 24h later
    const remaining = slaHoursRemaining('gate_proposed', 'low_capex', entered, now);
    expect(remaining).not.toBeNull();
    expect(remaining).toBeCloseTo(168 - 24, 0);
  });
});

// ─── 5. Floor flags ────────────────────────────────────────────────────────
describe('W131 stage gates — floor flags', () => {
  it('countFloorFlags counts all 5 flags', () => {
    expect(countFloorFlags({
      floor_equator_cat_a: 1,
      floor_fid_committed: 1,
      floor_nersa_notifiable: 1,
      floor_debt_sized: 1,
      floor_shareholder_consent_required: 1,
    })).toBe(5);
  });

  it('floorAtHigh on >=1 flag', () => {
    expect(floorAtHigh({ floor_equator_cat_a: 1 })).toBe(true);
    expect(floorAtHigh({ floor_nersa_notifiable: 1 })).toBe(true);
    expect(floorAtHigh({})).toBe(false);
  });

  it('floorAtMega on >=3 flags', () => {
    expect(floorAtMega({ floor_equator_cat_a: 1, floor_fid_committed: 1, floor_nersa_notifiable: 1 })).toBe(true);
    expect(floorAtMega({ floor_equator_cat_a: 1, floor_fid_committed: 1 })).toBe(false);
    expect(floorAtMega({})).toBe(false);
  });

  it('effectiveTier: 1 flag lifts to high_capex minimum', () => {
    expect(effectiveTier('low_capex', { floor_nersa_notifiable: 1 })).toBe('high_capex');
    expect(effectiveTier('medium_capex', { floor_nersa_notifiable: 1 })).toBe('high_capex');
    expect(effectiveTier('high_capex', { floor_nersa_notifiable: 1 })).toBe('high_capex');
    expect(effectiveTier('mega_capex', { floor_nersa_notifiable: 1 })).toBe('mega_capex');
    expect(effectiveTier('equator_cat_a', { floor_nersa_notifiable: 1 })).toBe('equator_cat_a');
  });

  it('effectiveTier: 3+ flags lifts to mega_capex minimum', () => {
    const flags = { floor_equator_cat_a: 1, floor_fid_committed: 1, floor_nersa_notifiable: 1 };
    expect(effectiveTier('low_capex', flags)).toBe('mega_capex');
    expect(effectiveTier('medium_capex', flags)).toBe('mega_capex');
    expect(effectiveTier('high_capex', flags)).toBe('mega_capex');
    expect(effectiveTier('mega_capex', flags)).toBe('mega_capex');
    expect(effectiveTier('equator_cat_a', flags)).toBe('equator_cat_a');
  });

  it('effectiveTier: no flags leaves tier unchanged', () => {
    expect(effectiveTier('low_capex', {})).toBe('low_capex');
    expect(effectiveTier('medium_capex', {})).toBe('medium_capex');
    expect(effectiveTier('mega_capex', {})).toBe('mega_capex');
  });
});

// ─── 6. SIGNATURE regulator crossings ─────────────────────────────────────
describe('W131 SIGNATURE regulator crossings', () => {
  it('W131 SIGNATURE: reject_gate crosses regulator EVERY tier', () => {
    const tiers = ['low_capex', 'medium_capex', 'high_capex', 'mega_capex', 'equator_cat_a'] as const;
    for (const tier of tiers) {
      expect(crossesIntoRegulator('reject_gate', tier, { gate_index: 0 })).toBe(true);
      expect(crossesIntoRegulator('reject_gate', tier, { gate_index: 3 })).toBe(true);
    }
  });

  it('record_decision DG4 (COD) crosses EVERY tier (NERSA s14)', () => {
    const tiers = ['low_capex', 'medium_capex', 'high_capex', 'mega_capex', 'equator_cat_a'] as const;
    for (const tier of tiers) {
      expect(crossesIntoRegulator('record_decision', tier, { gate_index: 4 })).toBe(true);
    }
  });

  it('record_decision DG0 concept crosses medium+ only', () => {
    expect(crossesIntoRegulator('record_decision', 'low_capex', { gate_index: 0 })).toBe(false);
    expect(crossesIntoRegulator('record_decision', 'medium_capex', { gate_index: 0 })).toBe(true);
    expect(crossesIntoRegulator('record_decision', 'high_capex', { gate_index: 0 })).toBe(true);
    expect(crossesIntoRegulator('record_decision', 'mega_capex', { gate_index: 0 })).toBe(true);
    expect(crossesIntoRegulator('record_decision', 'equator_cat_a', { gate_index: 0 })).toBe(true);
  });

  it('record_decision DG3 sanction crosses medium+ only', () => {
    expect(crossesIntoRegulator('record_decision', 'low_capex', { gate_index: 3 })).toBe(false);
    expect(crossesIntoRegulator('record_decision', 'medium_capex', { gate_index: 3 })).toBe(true);
    expect(crossesIntoRegulator('record_decision', 'mega_capex', { gate_index: 3 })).toBe(true);
  });

  it('record_decision DG1/DG2 does not cross (non-signature gates)', () => {
    expect(crossesIntoRegulator('record_decision', 'mega_capex', { gate_index: 1 })).toBe(false);
    expect(crossesIntoRegulator('record_decision', 'mega_capex', { gate_index: 2 })).toBe(false);
  });

  it('defer_gate crosses regulator mega_capex + equator_cat_a only (lender consent)', () => {
    expect(crossesIntoRegulator('defer_gate', 'low_capex', {})).toBe(false);
    expect(crossesIntoRegulator('defer_gate', 'medium_capex', {})).toBe(false);
    expect(crossesIntoRegulator('defer_gate', 'high_capex', {})).toBe(false);
    expect(crossesIntoRegulator('defer_gate', 'mega_capex', {})).toBe(true);
    expect(crossesIntoRegulator('defer_gate', 'equator_cat_a', {})).toBe(true);
  });

  it('sla_breach crosses high_capex + mega_capex + equator_cat_a only', () => {
    expect(slaBreachCrossesIntoRegulator('low_capex')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('medium_capex')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('high_capex')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('mega_capex')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('equator_cat_a')).toBe(true);
  });

  it('actions that do NOT cross regulator (compile_evidence, ie_review, etc)', () => {
    expect(crossesIntoRegulator('compile_evidence', 'mega_capex', {})).toBe(false);
    expect(crossesIntoRegulator('ie_review', 'equator_cat_a', {})).toBe(false);
    expect(crossesIntoRegulator('hold_cab', 'mega_capex', {})).toBe(false);
    expect(crossesIntoRegulator('pass_gate', 'mega_capex', {})).toBe(false);
    expect(crossesIntoRegulator('archive', 'mega_capex', {})).toBe(false);
  });
});

// ─── 7. Party + authority ──────────────────────────────────────────────────
describe('W131 stage gates — 4-step authority', () => {
  it('propose_gate + compile_evidence -> project_manager', () => {
    expect(partyForAction('propose_gate')).toBe('project_manager');
    expect(partyForAction('compile_evidence')).toBe('project_manager');
    expect(partyForAction('defer_gate')).toBe('project_manager');
  });

  it('ie_review -> ie_assessor', () => {
    expect(partyForAction('ie_review')).toBe('ie_assessor');
  });

  it('lender_review / hold_cab / set_conditions -> cfo', () => {
    expect(partyForAction('lender_review')).toBe('cfo');
    expect(partyForAction('hold_cab')).toBe('cfo');
    expect(partyForAction('set_conditions')).toBe('cfo');
    expect(partyForAction('satisfy_conditions')).toBe('cfo');
  });

  it('record_decision / pass_gate / reject_gate -> board_chair', () => {
    expect(partyForAction('record_decision')).toBe('board_chair');
    expect(partyForAction('pass_gate')).toBe('board_chair');
    expect(partyForAction('reject_gate')).toBe('board_chair');
    expect(partyForAction('archive')).toBe('board_chair');
  });
});

// ─── 8. Event types ────────────────────────────────────────────────────────
describe('W131 stage gates — event types', () => {
  it('maps all 17 actions to the correct event type', () => {
    expect(eventTypeFor('propose_gate')).toBe('stage_gate.proposed');
    expect(eventTypeFor('compile_evidence')).toBe('stage_gate.evidence_compiled');
    expect(eventTypeFor('ie_review')).toBe('stage_gate.ie_reviewed');
    expect(eventTypeFor('lender_review')).toBe('stage_gate.lender_reviewed');
    expect(eventTypeFor('circulate_board_briefing')).toBe('stage_gate.board_briefing_circulated');
    expect(eventTypeFor('hold_cab')).toBe('stage_gate.cab_held');
    expect(eventTypeFor('set_conditions')).toBe('stage_gate.conditions_set');
    expect(eventTypeFor('record_decision')).toBe('stage_gate.decision_recorded');
    expect(eventTypeFor('satisfy_conditions')).toBe('stage_gate.conditions_satisfied');
    expect(eventTypeFor('pass_gate')).toBe('stage_gate.gate_passed');
    expect(eventTypeFor('notify_downstream')).toBe('stage_gate.notified_downstream');
    expect(eventTypeFor('archive')).toBe('stage_gate.archived');
    expect(eventTypeFor('defer_gate')).toBe('stage_gate.gate_deferred');
    expect(eventTypeFor('withdraw_gate')).toBe('stage_gate.gate_withdrawn');
    expect(eventTypeFor('reject_gate')).toBe('stage_gate.gate_rejected');
    expect(eventTypeFor('conditional_pass')).toBe('stage_gate.conditional_pass');
    expect(eventTypeFor('sla_breach')).toBe('stage_gate.sla_breached');
  });
});

// ─── 9. Bridges ────────────────────────────────────────────────────────────
describe('W131 stage gates — 5 bridges', () => {
  it('bridgesToW19 (procurement) truth checks', () => {
    expect(bridgesToW19('proc-001')).toBe(true);
    expect(bridgesToW19(null)).toBe(false);
    expect(bridgesToW19(undefined)).toBe(false);
    expect(bridgesToW19('')).toBe(false);
  });

  it('bridgesToW20 (COD) truth checks', () => {
    expect(bridgesToW20('cod-001')).toBe(true);
    expect(bridgesToW20(null)).toBe(false);
  });

  it('bridgesToW21 (drawdown) truth checks', () => {
    expect(bridgesToW21('draw-001')).toBe(true);
    expect(bridgesToW21(null)).toBe(false);
  });

  it('bridgesToW113 (EVM) truth checks', () => {
    expect(bridgesToW113('evm-001')).toBe(true);
    expect(bridgesToW113(null)).toBe(false);
  });

  it('bridgesToW118 (W118 MANDATORY) truth checks', () => {
    expect(bridgesToW118('blk-001')).toBe(true);
    expect(bridgesToW118(null)).toBe(false);
  });
});

// ─── 10. Conditions aging + time-in-state ─────────────────────────────────
describe('W131 stage gates — LIVE derived fields', () => {
  it('conditionsAgingDays returns days since conditions_set_at', () => {
    const now = new Date('2026-06-30T00:00:00Z');
    const set_at = '2026-06-01T00:00:00Z'; // 29 days ago
    expect(conditionsAgingDays(set_at, now)).toBe(29);
  });

  it('conditionsAgingDays returns null when conditions_set_at is null', () => {
    expect(conditionsAgingDays(null, new Date())).toBeNull();
  });

  it('timeInStateHours computes correctly', () => {
    const entered = new Date('2026-06-01T00:00:00Z');
    const now = new Date('2026-06-03T12:00:00Z'); // 60h later
    expect(timeInStateHours(entered.toISOString(), now)).toBeCloseTo(60, 1);
  });
});

// ─── 11. Gate names ────────────────────────────────────────────────────────
describe('W131 stage gates — gate name map', () => {
  it('returns correct gate names for DG0-DG4', () => {
    expect(GATE_NAMES[0]).toBe('DG0 Concept');
    expect(GATE_NAMES[1]).toBe('DG1 Feasibility');
    expect(GATE_NAMES[2]).toBe('DG2 FEED/FID-prep');
    expect(GATE_NAMES[3]).toBe('DG3 Sanction (FID)');
    expect(GATE_NAMES[4]).toBe('DG4 COD/Operations');
  });
});

// ─── 12. isReportable composite ───────────────────────────────────────────
describe('W131 stage gates — isReportable', () => {
  it('reject_gate is reportable at every tier', () => {
    expect(isReportable('reject_gate', 'low_capex', { gate_index: 0 })).toBe(true);
    expect(isReportable('reject_gate', 'equator_cat_a', { gate_index: 3 })).toBe(true);
  });

  it('record_decision DG4 is reportable at every tier', () => {
    expect(isReportable('record_decision', 'low_capex', { gate_index: 4 })).toBe(true);
  });

  it('sla_breach not reportable at low/medium', () => {
    expect(isReportable('sla_breach', 'low_capex', { gate_index: 0 })).toBe(false);
    expect(isReportable('sla_breach', 'medium_capex', { gate_index: 1 })).toBe(false);
  });

  it('sla_breach is reportable at high_capex+', () => {
    expect(isReportable('sla_breach', 'high_capex', { gate_index: 2 })).toBe(true);
    expect(isReportable('sla_breach', 'mega_capex', { gate_index: 3 })).toBe(true);
    expect(isReportable('sla_breach', 'equator_cat_a', { gate_index: 0 })).toBe(true);
  });
});

// ─── 13. allowedActions ────────────────────────────────────────────────────
describe('W131 stage gates — allowedActions', () => {
  it('gate_proposed allows: compile_evidence, defer_gate, withdraw_gate, reject_gate', () => {
    const acts = allowedActions('gate_proposed');
    expect(acts).toContain('compile_evidence');
    expect(acts).toContain('defer_gate');
    expect(acts).toContain('withdraw_gate');
    expect(acts).toContain('reject_gate');
    expect(acts).not.toContain('propose_gate');
    expect(acts).not.toContain('sla_breach');
  });

  it('terminal states return no actions', () => {
    expect(allowedActions('archived')).toHaveLength(0);
    expect(allowedActions('gate_rejected')).toHaveLength(0);
    expect(allowedActions('gate_withdrawn')).toHaveLength(0);
  });

  it('conditions_satisfied allows: pass_gate, conditional_pass, defer_gate, withdraw_gate, reject_gate', () => {
    const acts = allowedActions('conditions_satisfied');
    expect(acts).toContain('pass_gate');
    expect(acts).toContain('conditional_pass');
    expect(acts).toContain('defer_gate');
    expect(acts).toContain('reject_gate');
  });
});

// ─── 14. Urgency band + authority ─────────────────────────────────────────
describe('W131 stage gates — urgency + authority helpers', () => {
  it('urgencyBand maps tiers to bands', () => {
    expect(urgencyBand('equator_cat_a', 2160)).toBe('strategic');
    expect(urgencyBand('mega_capex', 1440)).toBe('strategic');
    expect(urgencyBand('high_capex', 720)).toBe('high');
    expect(urgencyBand('medium_capex', 336)).toBe('medium');
    expect(urgencyBand('low_capex', 168)).toBe('standard');
  });

  it('authorityRequired: DG3 and mega -> board_chair', () => {
    expect(authorityRequired(3, 'mega_capex')).toBe('board_chair');
    expect(authorityRequired(3, 'medium_capex')).toBe('board_chair');
    expect(authorityRequired(2, 'low_capex')).toBe('cfo');
    expect(authorityRequired(1, 'low_capex')).toBe('ie_assessor');
    expect(authorityRequired(0, 'low_capex')).toBe('project_manager');
  });
});
