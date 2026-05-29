import { describe, it, expect } from 'vitest';
import {
  isTerminal,
  nextStatus,
  allowedActions,
  TRANSITIONS,
  SLA_MINUTES,
  slaWindowMinutes,
  slaDeadlineFor,
  isLargeTier,
  baseTierForCapacity,
  isSystemCritical,
  tierForCapacity,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  daysSinceLastDrill,
  daysUntilNextDrillDue,
  restorationCoverageRatio,
  geographicDiversityIndex,
  fuelDiversityIndex,
  voltageClassCoverage,
  drillPassRate,
  restorationPathValid,
  criticalityScore,
  predictedLifecycleDays,
  type BlackStartStatus,
  type BlackStartAction,
  type BlackStartTier,
} from '../src/utils/black-start-spec';

const GRADED: BlackStartStatus[] = [
  'needs_assessed',
  'solicitation_issued',
  'bid_evaluation',
  'contract_awarded',
  'contract_executed',
  'drill_scheduled',
  'drill_in_progress',
  'drill_completed',
  'drill_failed',
  'remediation_required',
];
const TERMINAL_STATES: BlackStartStatus[] = ['recertified', 'contract_terminated'];
const TIERS: BlackStartTier[] = ['minor', 'standard', 'material', 'island_critical'];

describe('terminals', () => {
  it('marks the two terminal states', () => {
    for (const s of TERMINAL_STATES) expect(isTerminal(s)).toBe(true);
  });
  it('non-terminal graded states are not terminal', () => {
    for (const s of GRADED) expect(isTerminal(s)).toBe(false);
  });
});

describe('transitions', () => {
  it('clean path needs_assessed → solicitation → bid → award → execute → drill_scheduled → in_progress → completed → recertified', () => {
    expect(nextStatus('needs_assessed', 'issue_solicitation')).toBe('solicitation_issued');
    expect(nextStatus('solicitation_issued', 'close_solicitation')).toBe('bid_evaluation');
    expect(nextStatus('bid_evaluation', 'award_contract')).toBe('contract_awarded');
    expect(nextStatus('contract_awarded', 'execute_contract')).toBe('contract_executed');
    expect(nextStatus('contract_executed', 'schedule_drill')).toBe('drill_scheduled');
    expect(nextStatus('drill_scheduled', 'commence_drill')).toBe('drill_in_progress');
    expect(nextStatus('drill_in_progress', 'complete_drill')).toBe('drill_completed');
    expect(nextStatus('drill_completed', 'recertify')).toBe('recertified');
  });
  it('failure branch: drill_completed → drill_failed → remediation_required → drill_scheduled', () => {
    expect(nextStatus('drill_completed', 'fail_drill')).toBe('drill_failed');
    expect(nextStatus('drill_failed', 'require_remediation')).toBe('remediation_required');
    expect(nextStatus('remediation_required', 'complete_remediation')).toBe('drill_scheduled');
  });
  it('terminate_contract from every pre-terminal state', () => {
    for (const s of GRADED) expect(nextStatus(s, 'terminate_contract')).toBe('contract_terminated');
  });
  it('terminal states reject every action', () => {
    for (const s of TERMINAL_STATES) {
      for (const a of Object.keys(TRANSITIONS) as BlackStartAction[]) {
        expect(nextStatus(s, a)).toBeNull();
      }
    }
  });
  it('illegal transitions return null', () => {
    expect(nextStatus('needs_assessed', 'commence_drill')).toBeNull();
    expect(nextStatus('contract_awarded', 'recertify')).toBeNull();
    expect(nextStatus('drill_scheduled', 'fail_drill')).toBeNull();
    expect(nextStatus('drill_in_progress', 'recertify')).toBeNull();
  });
});

describe('allowedActions', () => {
  it('needs_assessed offers issue_solicitation + terminate_contract', () => {
    const acts = allowedActions('needs_assessed');
    expect(acts).toContain('issue_solicitation');
    expect(acts).toContain('terminate_contract');
  });
  it('drill_completed offers recertify + fail_drill + terminate_contract', () => {
    const acts = allowedActions('drill_completed');
    expect(acts).toContain('recertify');
    expect(acts).toContain('fail_drill');
    expect(acts).toContain('terminate_contract');
  });
  it('remediation_required offers complete_remediation + terminate_contract', () => {
    const acts = allowedActions('remediation_required');
    expect(acts).toContain('complete_remediation');
    expect(acts).toContain('terminate_contract');
  });
  it('terminal states offer no actions', () => {
    for (const s of TERMINAL_STATES) expect(allowedActions(s)).toEqual([]);
  });
});

describe('URGENT SLA matrix', () => {
  it('larger tier has TIGHTER window for every graded state', () => {
    const gradedSla: BlackStartStatus[] = [
      'needs_assessed', 'solicitation_issued', 'bid_evaluation', 'contract_awarded',
      'contract_executed', 'drill_scheduled', 'drill_in_progress', 'drill_completed',
      'drill_failed', 'remediation_required',
    ];
    for (const s of gradedSla) {
      const minor = SLA_MINUTES[s].minor;
      const standard = SLA_MINUTES[s].standard;
      const material = SLA_MINUTES[s].material;
      const island = SLA_MINUTES[s].island_critical;
      expect(minor).toBeGreaterThan(standard);
      expect(standard).toBeGreaterThan(material);
      expect(material).toBeGreaterThan(island);
    }
  });
  it('terminals carry no SLA', () => {
    for (const s of TERMINAL_STATES) {
      for (const t of TIERS) expect(SLA_MINUTES[s][t]).toBe(0);
    }
  });
  it('slaWindowMinutes matches the matrix', () => {
    expect(slaWindowMinutes('drill_in_progress', 'island_critical')).toBe(SLA_MINUTES.drill_in_progress.island_critical);
    expect(slaWindowMinutes('remediation_required', 'minor')).toBe(SLA_MINUTES.remediation_required.minor);
    expect(slaWindowMinutes('recertified', 'minor')).toBe(0);
  });
  it('slaDeadlineFor returns null for terminals', () => {
    const t = new Date('2026-01-01T00:00:00Z');
    expect(slaDeadlineFor('recertified', 'minor', t)).toBeNull();
    expect(slaDeadlineFor('contract_terminated', 'island_critical', t)).toBeNull();
  });
  it('slaDeadlineFor adds the window correctly', () => {
    const t = new Date('2026-01-01T00:00:00Z');
    const d = slaDeadlineFor('drill_in_progress', 'island_critical', t);
    expect(d).not.toBeNull();
    expect(d!.getTime() - t.getTime()).toBe(SLA_MINUTES.drill_in_progress.island_critical * 60 * 1000);
  });
  it('island_critical drill_in_progress window is 1 hour or less', () => {
    expect(SLA_MINUTES.drill_in_progress.island_critical).toBeLessThanOrEqual(60);
  });
});

describe('tier derivation by capacity + system-critical floor', () => {
  it('base tier brackets', () => {
    expect(baseTierForCapacity(0)).toBe('minor');
    expect(baseTierForCapacity(49)).toBe('minor');
    expect(baseTierForCapacity(50)).toBe('standard');
    expect(baseTierForCapacity(249)).toBe('standard');
    expect(baseTierForCapacity(250)).toBe('material');
    expect(baseTierForCapacity(499)).toBe('material');
    expect(baseTierForCapacity(500)).toBe('island_critical');
    expect(baseTierForCapacity(2000)).toBe('island_critical');
  });
  it('transmission voltage class floors at material', () => {
    expect(tierForCapacity(10, 'transmission', 'restoration_unit')).toBe('material');
    expect(tierForCapacity(100, 'transmission', 'restoration_unit')).toBe('material');
  });
  it('bulk voltage class floors at material', () => {
    expect(tierForCapacity(10, 'bulk', 'restoration_unit')).toBe('material');
    expect(tierForCapacity(100, 'bulk', 'auxiliary_unit')).toBe('material');
  });
  it('cranking_anchor role floors at material', () => {
    expect(tierForCapacity(10, 'distribution', 'cranking_anchor')).toBe('material');
    expect(tierForCapacity(100, 'sub_transmission', 'cranking_anchor')).toBe('material');
  });
  it('distribution + non-anchor stays at base tier', () => {
    expect(tierForCapacity(10, 'distribution', 'restoration_unit')).toBe('minor');
    expect(tierForCapacity(100, 'distribution', 'auxiliary_unit')).toBe('standard');
  });
  it('large capacity is not reduced by system-critical', () => {
    expect(tierForCapacity(600, 'transmission', 'cranking_anchor')).toBe('island_critical');
    expect(tierForCapacity(600, 'distribution', 'restoration_unit')).toBe('island_critical');
  });
  it('isSystemCritical', () => {
    expect(isSystemCritical('transmission', 'restoration_unit')).toBe(true);
    expect(isSystemCritical('bulk', 'restoration_unit')).toBe(true);
    expect(isSystemCritical('distribution', 'cranking_anchor')).toBe(true);
    expect(isSystemCritical('distribution', 'restoration_unit')).toBe(false);
    expect(isSystemCritical('sub_transmission', 'auxiliary_unit')).toBe(false);
  });
});

describe('regulator crossings (RELIABILITY signature)', () => {
  it('fail_drill crosses for EVERY tier — the W84 hard line', () => {
    for (const t of TIERS) expect(crossesIntoRegulator('fail_drill', t)).toBe(true);
  });
  it('terminate_contract crosses for EVERY tier — loss of restoration capability', () => {
    for (const t of TIERS) expect(crossesIntoRegulator('terminate_contract', t)).toBe(true);
  });
  it('recertify crosses for large tiers only', () => {
    expect(crossesIntoRegulator('recertify', 'minor')).toBe(false);
    expect(crossesIntoRegulator('recertify', 'standard')).toBe(false);
    expect(crossesIntoRegulator('recertify', 'material')).toBe(true);
    expect(crossesIntoRegulator('recertify', 'island_critical')).toBe(true);
  });
  it('require_remediation crosses for large tiers only', () => {
    expect(crossesIntoRegulator('require_remediation', 'minor')).toBe(false);
    expect(crossesIntoRegulator('require_remediation', 'standard')).toBe(false);
    expect(crossesIntoRegulator('require_remediation', 'material')).toBe(true);
    expect(crossesIntoRegulator('require_remediation', 'island_critical')).toBe(true);
  });
  it('other actions do not cross', () => {
    expect(crossesIntoRegulator('issue_solicitation', 'island_critical')).toBe(false);
    expect(crossesIntoRegulator('award_contract', 'island_critical')).toBe(false);
    expect(crossesIntoRegulator('schedule_drill', 'material')).toBe(false);
    expect(crossesIntoRegulator('commence_drill', 'island_critical')).toBe(false);
    expect(crossesIntoRegulator('complete_drill', 'island_critical')).toBe(false);
    expect(crossesIntoRegulator('complete_remediation', 'island_critical')).toBe(false);
  });
  it('SLA breach crosses for large tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('island_critical')).toBe(true);
  });
  it('isReportable: system-critical OR large tier', () => {
    expect(isReportable('minor', false)).toBe(false);
    expect(isReportable('standard', false)).toBe(false);
    expect(isReportable('material', false)).toBe(true);
    expect(isReportable('island_critical', false)).toBe(true);
    expect(isReportable('minor', true)).toBe(true);
    expect(isReportable('standard', true)).toBe(true);
  });
});

describe('isLargeTier + partyForAction', () => {
  it('isLargeTier flags material+island_critical only', () => {
    expect(isLargeTier('minor')).toBe(false);
    expect(isLargeTier('standard')).toBe(false);
    expect(isLargeTier('material')).toBe(true);
    expect(isLargeTier('island_critical')).toBe(true);
  });
  it('partyForAction maps actions to functional parties', () => {
    expect(partyForAction('issue_solicitation')).toBe('system_operator');
    expect(partyForAction('award_contract')).toBe('system_operator');
    expect(partyForAction('schedule_drill')).toBe('restoration_planner');
    expect(partyForAction('commence_drill')).toBe('bsc_provider');
    expect(partyForAction('complete_drill')).toBe('bsc_provider');
    expect(partyForAction('recertify')).toBe('drill_observer');
    expect(partyForAction('fail_drill')).toBe('drill_observer');
    expect(partyForAction('require_remediation')).toBe('restoration_planner');
    expect(partyForAction('complete_remediation')).toBe('bsc_provider');
    expect(partyForAction('terminate_contract')).toBe('system_operator');
  });
});

describe('live restoration-readiness battery', () => {
  it('daysSinceLastDrill computes correctly', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(daysSinceLastDrill(new Date('2026-05-22T00:00:00Z'), now)).toBe(10);
    expect(daysSinceLastDrill(new Date('2026-06-01T00:00:00Z'), now)).toBe(0);
    expect(daysSinceLastDrill(null, now)).toBeNull();
  });
  it('daysUntilNextDrillDue is positive when in future, negative when overdue', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    // last drill 2025-12-01 → next due 2026-12-01 → ~183 days from 2026-06-01
    const pos = daysUntilNextDrillDue(new Date('2025-12-01T00:00:00Z'), now);
    expect(pos).toBeGreaterThan(0);
    // last drill 2025-01-01 → next due 2026-01-01 → ~-151 days from 2026-06-01
    const neg = daysUntilNextDrillDue(new Date('2025-01-01T00:00:00Z'), now);
    expect(neg).toBeLessThan(0);
    expect(daysUntilNextDrillDue(null, now)).toBeNull();
  });
  it('restorationCoverageRatio computes correctly', () => {
    expect(restorationCoverageRatio(500, 1000)).toBe(0.5);
    expect(restorationCoverageRatio(1000, 1000)).toBe(1);
    expect(restorationCoverageRatio(1500, 1000)).toBe(1.5);
    expect(restorationCoverageRatio(500, 0)).toBe(0);
    expect(restorationCoverageRatio(-100, 1000)).toBe(0);
  });
  it('geographicDiversityIndex normalises to /9', () => {
    expect(geographicDiversityIndex(0)).toBe(0);
    expect(geographicDiversityIndex(9)).toBe(1);
    expect(geographicDiversityIndex(3)).toBeCloseTo(1 / 3, 5);
    expect(geographicDiversityIndex(15)).toBe(1);
  });
  it('fuelDiversityIndex: 1 for uniform, 0 for single bucket', () => {
    expect(fuelDiversityIndex({})).toBe(0);
    expect(fuelDiversityIndex({ hydro: 2, diesel_starter: 2, battery_inverter: 2, compressed_air: 2 })).toBeCloseTo(1, 5);
    expect(fuelDiversityIndex({ hydro: 10 })).toBe(0);
    const mid = fuelDiversityIndex({ hydro: 5, diesel_starter: 1 });
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
  it('voltageClassCoverage normalises to /4', () => {
    expect(voltageClassCoverage(0)).toBe(0);
    expect(voltageClassCoverage(2)).toBe(0.5);
    expect(voltageClassCoverage(4)).toBe(1);
    expect(voltageClassCoverage(7)).toBe(1);
  });
  it('drillPassRate clamps', () => {
    expect(drillPassRate(0, 10)).toBe(0);
    expect(drillPassRate(5, 10)).toBe(0.5);
    expect(drillPassRate(10, 10)).toBe(1);
    expect(drillPassRate(5, 0)).toBe(0);
  });
  it('restorationPathValid requires ALL 6 gates', () => {
    expect(restorationPathValid(true, true, true, true, true, true)).toBe(true);
    expect(restorationPathValid(false, true, true, true, true, true)).toBe(false);
    expect(restorationPathValid(true, true, true, true, true, false)).toBe(false);
    expect(restorationPathValid(true, false, true, true, true, true)).toBe(false);
  });
  it('criticalityScore accumulates flags up to 100', () => {
    expect(criticalityScore({
      role: 'auxiliary_unit',
      voltage: 'distribution',
      tier: 'minor',
      daysUntilNextDrillDue: 100,
      drillPassRate: 1,
      restorationPathValid: true,
    })).toBe(0);
    expect(criticalityScore({
      role: 'cranking_anchor',
      voltage: 'bulk',
      tier: 'island_critical',
      daysUntilNextDrillDue: -30,
      drillPassRate: 0.2,
      restorationPathValid: false,
    })).toBe(100);
    expect(criticalityScore({
      role: 'cranking_anchor',
      voltage: 'distribution',
      tier: 'minor',
      daysUntilNextDrillDue: 100,
      drillPassRate: 1,
      restorationPathValid: true,
    })).toBe(30);
  });
  it('predictedLifecycleDays grows as tier shrinks (URGENT inversion)', () => {
    // URGENT polarity: minor lifecycle takes the longest, island_critical shortest.
    expect(predictedLifecycleDays('minor')).toBeGreaterThan(predictedLifecycleDays('standard'));
    expect(predictedLifecycleDays('standard')).toBeGreaterThan(predictedLifecycleDays('material'));
    expect(predictedLifecycleDays('material')).toBeGreaterThan(predictedLifecycleDays('island_critical'));
    expect(predictedLifecycleDays('island_critical')).toBeGreaterThan(0);
  });
});
