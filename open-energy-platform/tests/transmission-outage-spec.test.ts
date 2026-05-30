// W110 — Grid Transmission Network Outage Coordination & N-1 Security
// Assessment chain spec tests.
import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  SLA_HOURS,
  allowedActions,
  nextStatus,
  isTerminal,
  isHardTerminal,
  slaWindowHours,
  slaDeadlineFor,
  tierForVoltage,
  countFloorFlags,
  floorAtHigh,
  floorAtCritical,
  effectiveTier,
  isHeavyTier,
  isReportable,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  eventTypeFor,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  regulatorFilingWindowHours,
  bridgesToPlannedOutageChain,
  bridgesToCurtailmentChain,
  bridgesToReserveActivationChain,
  n1ContingencyPassCount,
  n1ContingencyFailCount,
  securityMarginPct,
  hoursToOutageWindow,
  hoursInOutage,
  hoursToPlannedCompletion,
  isExtensionImminent,
  isEmergencyCancelRisk,
  isReturnedToServiceClean,
  outageCompletenessIndex,
} from '../src/utils/transmission-outage-spec';

// ─── State machine ──────────────────────────────────────────────────────

describe('W110 Transmission Outage — state machine (11 lifecycle + 5 branches)', () => {
  it('forward path outage_requested → archived (clean coordination cycle)', () => {
    let s = nextStatus('outage_requested', 'start_security_assessment');         expect(s).toBe('security_assessment');
    s = nextStatus(s!, 'run_n1_contingency');                                    expect(s).toBe('n1_contingency_run');
    s = nextStatus(s!, 'submit_to_reliability_committee');                       expect(s).toBe('reliability_committee_review');
    s = nextStatus(s!, 'approve_outage');                                        expect(s).toBe('outage_approved');
    s = nextStatus(s!, 'open_outage_window');                                    expect(s).toBe('outage_window_open');
    s = nextStatus(s!, 'commence_outage');                                       expect(s).toBe('outage_in_progress');
    s = nextStatus(s!, 'complete_outage');                                       expect(s).toBe('outage_completed');
    s = nextStatus(s!, 'verify_return_to_service');                              expect(s).toBe('return_to_service');
    s = nextStatus(s!, 'close_post_outage_review');                              expect(s).toBe('post_outage_review');
    s = nextStatus(s!, 'archive_outage');                                        expect(s).toBe('archived');
    expect(isHardTerminal('archived')).toBe(true);
  });

  it('suspend → resume → in_progress (real-time security deterioration loop)', () => {
    expect(nextStatus('outage_in_progress', 'suspend_outage')).toBe('suspended');
    expect(nextStatus('suspended', 'resume_outage')).toBe('outage_in_progress');
  });

  it('suspend can only fire from outage_in_progress', () => {
    expect(nextStatus('outage_approved', 'suspend_outage')).toBeNull();
    expect(nextStatus('outage_window_open', 'suspend_outage')).toBeNull();
    expect(nextStatus('outage_completed', 'suspend_outage')).toBeNull();
  });

  it('extend_outage from in_progress → extended → resume back to in_progress', () => {
    expect(nextStatus('outage_in_progress', 'extend_outage')).toBe('extended');
    expect(nextStatus('extended', 'resume_outage')).toBe('outage_in_progress');
  });

  it('complete_outage fires from both outage_in_progress AND extended', () => {
    expect(nextStatus('outage_in_progress', 'complete_outage')).toBe('outage_completed');
    expect(nextStatus('extended', 'complete_outage')).toBe('outage_completed');
  });

  it('reject_outage fires from every pre-commencement state', () => {
    const pre = ['outage_requested', 'security_assessment', 'n1_contingency_run', 'reliability_committee_review'] as const;
    for (const s of pre) {
      expect(nextStatus(s, 'reject_outage')).toBe('rejected');
    }
    expect(isHardTerminal('rejected')).toBe(true);
  });

  it('reject_outage does NOT fire from approved or live states', () => {
    expect(nextStatus('outage_approved', 'reject_outage')).toBeNull();
    expect(nextStatus('outage_in_progress', 'reject_outage')).toBeNull();
    expect(nextStatus('outage_completed', 'reject_outage')).toBeNull();
  });

  it('withdraw fires from every pre-approval state', () => {
    const pre = ['outage_requested', 'security_assessment', 'n1_contingency_run', 'reliability_committee_review'] as const;
    for (const s of pre) {
      expect(nextStatus(s, 'withdraw')).toBe('withdrawn');
    }
    expect(isHardTerminal('withdrawn')).toBe(true);
  });

  it('withdraw does NOT fire from approved+', () => {
    expect(nextStatus('outage_approved', 'withdraw')).toBeNull();
    expect(nextStatus('outage_in_progress', 'withdraw')).toBeNull();
    expect(nextStatus('archived', 'withdraw')).toBeNull();
  });

  it('emergency_cancel fires from every non-terminal state', () => {
    const all = [
      'outage_requested', 'security_assessment', 'n1_contingency_run',
      'reliability_committee_review', 'outage_approved', 'outage_window_open',
      'outage_in_progress', 'outage_completed', 'return_to_service',
      'post_outage_review', 'suspended', 'extended',
    ] as const;
    for (const s of all) {
      expect(nextStatus(s, 'emergency_cancel')).toBe('emergency_cancelled');
    }
    expect(isHardTerminal('emergency_cancelled')).toBe(true);
  });

  it('emergency_cancel does NOT fire from terminals', () => {
    expect(nextStatus('archived', 'emergency_cancel')).toBeNull();
    expect(nextStatus('rejected', 'emergency_cancel')).toBeNull();
    expect(nextStatus('withdrawn', 'emergency_cancel')).toBeNull();
    expect(nextStatus('emergency_cancelled', 'emergency_cancel')).toBeNull();
  });

  it('hard terminals accept NO actions', () => {
    const terminals = ['archived', 'rejected', 'withdrawn', 'emergency_cancelled'] as const;
    const actions = Object.keys(TRANSITIONS);
    for (const t of terminals) {
      expect(isHardTerminal(t)).toBe(true);
      expect(allowedActions(t)).toEqual([]);
      for (const a of actions) {
        expect(nextStatus(t, a as never)).toBeNull();
      }
    }
  });

  it('isTerminal == isHardTerminal for W110 (all 4 terminals are hard)', () => {
    expect(isTerminal('archived')).toBe(true);
    expect(isTerminal('rejected')).toBe(true);
    expect(isTerminal('withdrawn')).toBe(true);
    expect(isTerminal('emergency_cancelled')).toBe(true);
    expect(isTerminal('outage_in_progress')).toBe(false);
    expect(isTerminal('extended')).toBe(false);
    expect(isTerminal('suspended')).toBe(false);
  });

  it('allowedActions includes withdraw + emergency_cancel + reject in pre-approval', () => {
    const acts = allowedActions('reliability_committee_review');
    expect(acts).toContain('approve_outage');
    expect(acts).toContain('reject_outage');
    expect(acts).toContain('withdraw');
    expect(acts).toContain('emergency_cancel');
  });

  it('allowedActions includes suspend + extend + complete + emergency from in_progress', () => {
    const acts = allowedActions('outage_in_progress');
    expect(acts).toContain('suspend_outage');
    expect(acts).toContain('extend_outage');
    expect(acts).toContain('complete_outage');
    expect(acts).toContain('emergency_cancel');
    expect(acts).not.toContain('withdraw');
    expect(acts).not.toContain('reject_outage');
  });
});

// ─── Tier derivation + FLOOR ────────────────────────────────────────────

describe('W110 tier derivation (URGENT polarity)', () => {
  it('tierForVoltage maps voltages correctly', () => {
    expect(tierForVoltage(66)).toBe('low_sub132kv');
    expect(tierForVoltage(132)).toBe('medium_132kv');
    expect(tierForVoltage(275)).toBe('high_275kv');
    expect(tierForVoltage(400)).toBe('critical_400kv_plus');
    expect(tierForVoltage(765)).toBe('critical_400kv_plus');
  });

  it('tierForVoltage edge cases', () => {
    expect(tierForVoltage(0)).toBe('low_sub132kv');
    expect(tierForVoltage(null)).toBe('low_sub132kv');
    expect(tierForVoltage(undefined)).toBe('low_sub132kv');
    expect(tierForVoltage(-50)).toBe('low_sub132kv');
    expect(tierForVoltage(131.999)).toBe('low_sub132kv');
    expect(tierForVoltage(274.999)).toBe('medium_132kv');
    expect(tierForVoltage(399.999)).toBe('high_275kv');
  });

  it('countFloorFlags counts true/1 flags', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ peak_demand_period: true })).toBe(1);
    expect(countFloorFlags({ peak_demand_period: 1, single_circuit_radial: 1 })).toBe(2);
    expect(countFloorFlags({
      peak_demand_period: true,
      single_circuit_radial: true,
      cross_border_interconnector: true,
      black_start_path: true,
      national_grid_backbone: true,
    })).toBe(5);
  });

  it('floorAtHigh true on any one flag', () => {
    expect(floorAtHigh({})).toBe(false);
    expect(floorAtHigh({ peak_demand_period: true })).toBe(true);
    expect(floorAtHigh({ single_circuit_radial: 1 })).toBe(true);
  });

  it('floorAtCritical true on 2+ flags OR national-grid-backbone OR black-start', () => {
    expect(floorAtCritical({})).toBe(false);
    expect(floorAtCritical({ peak_demand_period: true })).toBe(false);
    expect(floorAtCritical({ peak_demand_period: true, single_circuit_radial: true })).toBe(true);
    expect(floorAtCritical({ national_grid_backbone: true })).toBe(true);
    expect(floorAtCritical({ black_start_path: true })).toBe(true);
  });

  it('effectiveTier — FLOOR-AT-HIGH lifts low/medium to high on 1 flag', () => {
    expect(effectiveTier('low_sub132kv', { peak_demand_period: true })).toBe('high_275kv');
    expect(effectiveTier('medium_132kv', { peak_demand_period: true })).toBe('high_275kv');
    expect(effectiveTier('high_275kv', { peak_demand_period: true })).toBe('high_275kv');
    expect(effectiveTier('critical_400kv_plus', { peak_demand_period: true })).toBe('critical_400kv_plus');
  });

  it('effectiveTier — FLOOR-AT-CRITICAL lifts to critical on 2+ flags', () => {
    expect(effectiveTier('low_sub132kv', { peak_demand_period: true, single_circuit_radial: true })).toBe('critical_400kv_plus');
    expect(effectiveTier('medium_132kv', { cross_border_interconnector: true, peak_demand_period: true })).toBe('critical_400kv_plus');
  });

  it('effectiveTier — national_grid_backbone always crit', () => {
    expect(effectiveTier('low_sub132kv', { national_grid_backbone: true })).toBe('critical_400kv_plus');
    expect(effectiveTier('medium_132kv', { national_grid_backbone: true })).toBe('critical_400kv_plus');
    expect(effectiveTier('high_275kv', { national_grid_backbone: true })).toBe('critical_400kv_plus');
  });

  it('effectiveTier — black_start_path always crit', () => {
    expect(effectiveTier('low_sub132kv', { black_start_path: true })).toBe('critical_400kv_plus');
    expect(effectiveTier('medium_132kv', { black_start_path: true })).toBe('critical_400kv_plus');
  });

  it('effectiveTier — no flags = raw tier', () => {
    expect(effectiveTier('low_sub132kv', {})).toBe('low_sub132kv');
    expect(effectiveTier('medium_132kv', {})).toBe('medium_132kv');
    expect(effectiveTier('high_275kv', {})).toBe('high_275kv');
    expect(effectiveTier('critical_400kv_plus', {})).toBe('critical_400kv_plus');
  });

  it('isHeavyTier identifies high + critical', () => {
    expect(isHeavyTier('low_sub132kv')).toBe(false);
    expect(isHeavyTier('medium_132kv')).toBe(false);
    expect(isHeavyTier('high_275kv')).toBe(true);
    expect(isHeavyTier('critical_400kv_plus')).toBe(true);
  });

  it('isReportable matches heavy tier', () => {
    expect(isReportable('low_sub132kv')).toBe(false);
    expect(isReportable('medium_132kv')).toBe(false);
    expect(isReportable('high_275kv')).toBe(true);
    expect(isReportable('critical_400kv_plus')).toBe(true);
  });
});

// ─── SLA matrix (URGENT polarity, HOURS) ────────────────────────────────

describe('W110 SLA matrix — URGENT polarity stored in HOURS', () => {
  it('outage_requested anchor: critical 24h / high 72h / medium 168h / low 336h', () => {
    expect(SLA_HOURS.outage_requested.critical_400kv_plus).toBe(24);
    expect(SLA_HOURS.outage_requested.high_275kv).toBe(72);
    expect(SLA_HOURS.outage_requested.medium_132kv).toBe(168);
    expect(SLA_HOURS.outage_requested.low_sub132kv).toBe(336);
  });

  it('URGENT polarity: critical tier always has the shortest window per state', () => {
    const states = [
      'outage_requested', 'security_assessment', 'n1_contingency_run',
      'reliability_committee_review', 'outage_approved', 'outage_window_open',
      'outage_in_progress', 'outage_completed', 'return_to_service',
      'post_outage_review', 'suspended', 'extended',
    ] as const;
    for (const s of states) {
      const crit = SLA_HOURS[s].critical_400kv_plus;
      const high = SLA_HOURS[s].high_275kv;
      const med  = SLA_HOURS[s].medium_132kv;
      const low  = SLA_HOURS[s].low_sub132kv;
      expect(crit).toBeLessThanOrEqual(high);
      expect(high).toBeLessThanOrEqual(med);
      expect(med).toBeLessThanOrEqual(low);
    }
  });

  it('terminals have zero SLA window', () => {
    expect(SLA_HOURS.archived.low_sub132kv).toBe(0);
    expect(SLA_HOURS.rejected.high_275kv).toBe(0);
    expect(SLA_HOURS.withdrawn.medium_132kv).toBe(0);
    expect(SLA_HOURS.emergency_cancelled.critical_400kv_plus).toBe(0);
  });

  it('slaWindowHours getter agrees with table', () => {
    expect(slaWindowHours('outage_requested', 'critical_400kv_plus')).toBe(24);
    expect(slaWindowHours('outage_requested', 'low_sub132kv')).toBe(336);
    expect(slaWindowHours('archived', 'critical_400kv_plus')).toBe(0);
  });

  it('slaDeadlineFor adds hours to enteredAt', () => {
    const t = new Date('2026-05-30T00:00:00Z');
    const d = slaDeadlineFor('outage_requested', 'critical_400kv_plus', t);
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2026-05-31T00:00:00.000Z');
  });

  it('slaDeadlineFor returns null on terminal state', () => {
    const t = new Date('2026-05-30T00:00:00Z');
    expect(slaDeadlineFor('archived', 'critical_400kv_plus', t)).toBeNull();
  });

  it('slaHoursRemaining counts down to zero past deadline', () => {
    const entered = new Date('2026-05-30T00:00:00Z');
    const now = new Date('2026-05-30T12:00:00Z');
    const left = slaHoursRemaining('outage_requested', 'critical_400kv_plus', entered, now);
    expect(left).toBe(12);
  });

  it('slaHoursRemaining returns 0 on null enteredAt', () => {
    expect(slaHoursRemaining('outage_requested', 'critical_400kv_plus', null, new Date())).toBe(0);
  });
});

// ─── Signature regulator crossings ──────────────────────────────────────

describe('W110 SIGNATURE regulator crossings', () => {
  it('emergency_cancel crosses EVERY tier (W110 signature)', () => {
    for (const tier of ['low_sub132kv', 'medium_132kv', 'high_275kv', 'critical_400kv_plus'] as const) {
      expect(crossesIntoRegulator('emergency_cancel', tier, {})).toBe(true);
    }
  });

  it('emergency_cancel crosses regardless of national_grid_backbone flag', () => {
    expect(crossesIntoRegulator('emergency_cancel', 'low_sub132kv', { national_grid_backbone: false })).toBe(true);
    expect(crossesIntoRegulator('emergency_cancel', 'critical_400kv_plus', { national_grid_backbone: true })).toBe(true);
  });

  it('extend_outage crosses high + critical only', () => {
    expect(crossesIntoRegulator('extend_outage', 'low_sub132kv', {})).toBe(false);
    expect(crossesIntoRegulator('extend_outage', 'medium_132kv', {})).toBe(false);
    expect(crossesIntoRegulator('extend_outage', 'high_275kv', {})).toBe(true);
    expect(crossesIntoRegulator('extend_outage', 'critical_400kv_plus', {})).toBe(true);
  });

  it('approve_outage crosses critical only when national-backbone', () => {
    expect(crossesIntoRegulator('approve_outage', 'critical_400kv_plus', { national_grid_backbone: true })).toBe(true);
    expect(crossesIntoRegulator('approve_outage', 'critical_400kv_plus', { national_grid_backbone: false })).toBe(false);
    expect(crossesIntoRegulator('approve_outage', 'high_275kv', { national_grid_backbone: true })).toBe(false);
    expect(crossesIntoRegulator('approve_outage', 'low_sub132kv', { national_grid_backbone: true })).toBe(false);
  });

  it('suspend_outage crosses high + critical only', () => {
    expect(crossesIntoRegulator('suspend_outage', 'low_sub132kv', {})).toBe(false);
    expect(crossesIntoRegulator('suspend_outage', 'medium_132kv', {})).toBe(false);
    expect(crossesIntoRegulator('suspend_outage', 'high_275kv', {})).toBe(true);
    expect(crossesIntoRegulator('suspend_outage', 'critical_400kv_plus', {})).toBe(true);
  });

  it('non-signature actions never cross', () => {
    for (const action of ['request_outage', 'start_security_assessment', 'run_n1_contingency', 'commence_outage', 'complete_outage'] as const) {
      expect(crossesIntoRegulator(action, 'critical_400kv_plus', { national_grid_backbone: true })).toBe(false);
    }
  });

  it('slaBreachCrossesIntoRegulator crosses high+critical', () => {
    expect(slaBreachCrossesIntoRegulator('low_sub132kv')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('medium_132kv')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('high_275kv')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('critical_400kv_plus')).toBe(true);
  });
});

// ─── Party + event names ────────────────────────────────────────────────

describe('W110 actor_party routing', () => {
  it('outage_planner writes lifecycle entry + withdraw', () => {
    expect(partyForAction('request_outage')).toBe('outage_planner');
    expect(partyForAction('start_security_assessment')).toBe('outage_planner');
    expect(partyForAction('withdraw')).toBe('outage_planner');
  });

  it('system_operator writes runtime actions', () => {
    expect(partyForAction('run_n1_contingency')).toBe('system_operator');
    expect(partyForAction('open_outage_window')).toBe('system_operator');
    expect(partyForAction('commence_outage')).toBe('system_operator');
    expect(partyForAction('suspend_outage')).toBe('system_operator');
    expect(partyForAction('resume_outage')).toBe('system_operator');
    expect(partyForAction('emergency_cancel')).toBe('system_operator');
    expect(partyForAction('complete_outage')).toBe('system_operator');
    expect(partyForAction('verify_return_to_service')).toBe('system_operator');
  });

  it('reliability_committee writes committee actions', () => {
    expect(partyForAction('submit_to_reliability_committee')).toBe('reliability_committee');
    expect(partyForAction('approve_outage')).toBe('reliability_committee');
    expect(partyForAction('reject_outage')).toBe('reliability_committee');
    expect(partyForAction('extend_outage')).toBe('reliability_committee');
  });

  it('archive_clerk writes wrap-up actions', () => {
    expect(partyForAction('close_post_outage_review')).toBe('archive_clerk');
    expect(partyForAction('archive_outage')).toBe('archive_clerk');
  });

  it('eventTypeFor returns transmission_outage prefixed events', () => {
    expect(eventTypeFor('request_outage')).toBe('transmission_outage_requested');
    expect(eventTypeFor('approve_outage')).toBe('transmission_outage_approved');
    expect(eventTypeFor('emergency_cancel')).toBe('transmission_outage_emergency_cancelled');
    expect(eventTypeFor('extend_outage')).toBe('transmission_outage_extended');
    expect(eventTypeFor('archive_outage')).toBe('transmission_outage_archived');
  });
});

// ─── Authority + filing-window ──────────────────────────────────────────

describe('W110 4-step authority ladder + regulator filing window', () => {
  it('authorityRequired ladder by tier', () => {
    expect(authorityRequired('low_sub132kv')).toBe('outage_planner');
    expect(authorityRequired('medium_132kv')).toBe('system_operator');
    expect(authorityRequired('high_275kv')).toBe('reliability_committee_chair');
    expect(authorityRequired('critical_400kv_plus')).toBe('SO_CEO');
  });

  it('regulator filing window — critical TIGHTEST', () => {
    expect(regulatorFilingWindowHours('critical_400kv_plus')).toBe(1);
    expect(regulatorFilingWindowHours('high_275kv')).toBe(4);
    expect(regulatorFilingWindowHours('medium_132kv')).toBe(24);
    expect(regulatorFilingWindowHours('low_sub132kv')).toBe(72);
  });
});

// ─── Urgency band ───────────────────────────────────────────────────────

describe('W110 urgency band — URGENT polarity', () => {
  it('critical tier has the tightest urgency boundaries', () => {
    expect(urgencyBand('critical_400kv_plus', 2)).toBe('critical');
    expect(urgencyBand('critical_400kv_plus', 6)).toBe('high');
    expect(urgencyBand('critical_400kv_plus', 18)).toBe('medium');
    expect(urgencyBand('critical_400kv_plus', 100)).toBe('low');
  });

  it('high tier urgency', () => {
    expect(urgencyBand('high_275kv', 6)).toBe('critical');
    expect(urgencyBand('high_275kv', 24)).toBe('high');
    expect(urgencyBand('high_275kv', 60)).toBe('medium');
    expect(urgencyBand('high_275kv', 200)).toBe('low');
  });

  it('low tier urgency — biggest windows', () => {
    expect(urgencyBand('low_sub132kv', 24)).toBe('critical');
    expect(urgencyBand('low_sub132kv', 100)).toBe('high');
    expect(urgencyBand('low_sub132kv', 200)).toBe('medium');
    expect(urgencyBand('low_sub132kv', 500)).toBe('low');
  });

  it('negative SLA hours always critical regardless of tier', () => {
    for (const t of ['low_sub132kv', 'medium_132kv', 'high_275kv', 'critical_400kv_plus'] as const) {
      expect(urgencyBand(t, -1)).toBe('critical');
    }
  });
});

// ─── 3-bridge architecture ──────────────────────────────────────────────

describe('W110 3-bridge architecture (W18/W34/W50)', () => {
  it('bridgesToPlannedOutageChain true on non-null ref', () => {
    expect(bridgesToPlannedOutageChain('po-123')).toBe(true);
    expect(bridgesToPlannedOutageChain(null)).toBe(false);
    expect(bridgesToPlannedOutageChain(undefined)).toBe(false);
    expect(bridgesToPlannedOutageChain('')).toBe(false);
  });

  it('bridgesToCurtailmentChain true on non-null ref', () => {
    expect(bridgesToCurtailmentChain('lc-456')).toBe(true);
    expect(bridgesToCurtailmentChain(null)).toBe(false);
  });

  it('bridgesToReserveActivationChain true on non-null ref', () => {
    expect(bridgesToReserveActivationChain('ra-789')).toBe(true);
    expect(bridgesToReserveActivationChain(null)).toBe(false);
  });
});

// ─── LIVE battery computations ──────────────────────────────────────────

describe('W110 LIVE battery — N-1 contingency + security margin', () => {
  it('n1ContingencyPassCount + FailCount', () => {
    const list = [{ pass: true }, { pass: false }, { pass: true }, { pass: 1 }, { pass: 0 }];
    expect(n1ContingencyPassCount(list)).toBe(3);
    expect(n1ContingencyFailCount(list)).toBe(2);
    expect(n1ContingencyPassCount(null)).toBe(0);
    expect(n1ContingencyFailCount(undefined)).toBe(0);
  });

  it('securityMarginPct: headroom above thermal limit', () => {
    expect(securityMarginPct(800, 1000)).toBe(20);
    expect(securityMarginPct(950, 1000)).toBe(5);
    expect(securityMarginPct(1000, 1000)).toBe(0);
    expect(securityMarginPct(1200, 1000)).toBe(0); // floor at 0
    expect(securityMarginPct(0, 0)).toBe(0);
    expect(securityMarginPct(null, 1000)).toBe(100);
  });

  it('hoursToOutageWindow positive = future', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(hoursToOutageWindow('2026-05-30T12:00:00Z', now)).toBe(12);
    expect(hoursToOutageWindow('2026-05-29T18:00:00Z', now)).toBe(-6);
    expect(hoursToOutageWindow(null, now)).toBeNull();
    expect(hoursToOutageWindow('not-a-date', now)).toBeNull();
  });

  it('hoursInOutage elapsed since commence', () => {
    const now = new Date('2026-05-30T10:00:00Z');
    expect(hoursInOutage('2026-05-30T00:00:00Z', now)).toBe(10);
    expect(hoursInOutage(null, now)).toBe(0);
    expect(hoursInOutage('2026-05-30T15:00:00Z', now)).toBe(0); // future commence
  });

  it('hoursToPlannedCompletion positive = on time', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(hoursToPlannedCompletion('2026-05-30T12:00:00Z', now)).toBe(12);
    expect(hoursToPlannedCompletion('2026-05-29T20:00:00Z', now)).toBe(-4);
  });

  it('isExtensionImminent within 4h of planned end AND extension requested', () => {
    expect(isExtensionImminent(3, true)).toBe(true);
    expect(isExtensionImminent(-3, true)).toBe(true);
    expect(isExtensionImminent(5, true)).toBe(false);
    expect(isExtensionImminent(3, false)).toBe(false);
    expect(isExtensionImminent(null, true)).toBe(false);
  });

  it('isEmergencyCancelRisk: security_margin < 5% during outage', () => {
    expect(isEmergencyCancelRisk('outage_in_progress', 4)).toBe(true);
    expect(isEmergencyCancelRisk('extended', 4.99)).toBe(true);
    expect(isEmergencyCancelRisk('outage_in_progress', 5)).toBe(false);
    expect(isEmergencyCancelRisk('outage_approved', 1)).toBe(false);
    expect(isEmergencyCancelRisk('archived', 1)).toBe(false);
  });

  it('isReturnedToServiceClean: RTS test passed AND post-outage state', () => {
    expect(isReturnedToServiceClean('return_to_service', true)).toBe(true);
    expect(isReturnedToServiceClean('post_outage_review', 1)).toBe(true);
    expect(isReturnedToServiceClean('archived', true)).toBe(true);
    expect(isReturnedToServiceClean('return_to_service', false)).toBe(false);
    expect(isReturnedToServiceClean('outage_in_progress', true)).toBe(false);
    expect(isReturnedToServiceClean('outage_completed', true)).toBe(false);
  });

  it('outageCompletenessIndex 0-130 with bonus headroom', () => {
    expect(outageCompletenessIndex({})).toBe(0);
    expect(outageCompletenessIndex({
      security_assessment: true,
      n1_contingency: true,
      committee_approved: true,
      window_opened: true,
      commenced: true,
      completed: true,
      rts_verified: true,
      post_review: true,
      archived: true,
    })).toBe(100);
    expect(outageCompletenessIndex({
      security_assessment: true,
      n1_contingency: true,
      committee_approved: true,
      window_opened: true,
      commenced: true,
      completed: true,
      rts_verified: true,
      post_review: true,
      archived: true,
      clean_first_pass_bonus: true,
      no_suspension_bonus: true,
      no_extension_bonus: true,
      no_emergency_cancel_bonus: true,
    })).toBe(130);
  });
});
