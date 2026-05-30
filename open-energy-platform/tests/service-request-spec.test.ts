// W104 — Support ITIL Service Request Fulfilment chain spec tests.
import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  SLA_MINUTES,
  CATALOG_CATEGORIES,
  allowedActions,
  nextStatus,
  isTerminal,
  slaWindowMinutes,
  slaDeadlineFor,
  tierForSeverity,
  countFloorFlags,
  floorAtMaterial,
  floorAtCritical,
  effectiveTier,
  isHeavyTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  requiresCabReview,
  entitlementMatchScore,
  firstTimeFixRate30d,
  avgFulfilmentTimeHours,
  slaDaysRemaining,
  urgencyBand,
  breachImminentFlag,
  catalogCompletenessIndex,
  regulatorFilingWindowHours,
  authorityRequired,
  bridgesToChangeChain,
  bridgesToProblemChain,
  isFirstTimeFix,
} from '../src/utils/service-request-spec';

describe('W104 Service Request — state machine', () => {
  it('forward path submitted → archived', () => {
    let s = nextStatus('submitted', 'check_entitlement');                    expect(s).toBe('entitlement_checked');
    s = nextStatus(s!, 'request_approval');                                  expect(s).toBe('approval_pending');
    s = nextStatus(s!, 'approve');                                           expect(s).toBe('approved');
    s = nextStatus(s!, 'assign');                                            expect(s).toBe('assigned');
    s = nextStatus(s!, 'start_fulfilment');                                  expect(s).toBe('fulfilment_in_progress');
    s = nextStatus(s!, 'request_user_info');                                 expect(s).toBe('awaiting_user');
    s = nextStatus(s!, 'receive_user_response');                             expect(s).toBe('user_responded');
    s = nextStatus(s!, 'mark_fulfilled');                                    expect(s).toBe('fulfilled');
    s = nextStatus(s!, 'verify');                                            expect(s).toBe('verified');
    s = nextStatus(s!, 'close');                                             expect(s).toBe('closed');
    s = nextStatus(s!, 'archive_request');                                   expect(s).toBe('archived');
  });

  it('happy path can skip awaiting_user and go straight to fulfilled', () => {
    let s = nextStatus('fulfilment_in_progress', 'mark_fulfilled');          expect(s).toBe('fulfilled');
    s = nextStatus(s!, 'verify');                                            expect(s).toBe('verified');
    s = nextStatus(s!, 'close');                                             expect(s).toBe('closed');
  });

  it('approval_pending can be rejected', () => {
    expect(nextStatus('approval_pending', 'reject')).toBe('rejected');
  });

  it('reopen_request from fulfilled re-enters fulfilment_in_progress', () => {
    expect(nextStatus('fulfilled', 'reopen_request')).toBe('fulfilment_in_progress');
  });

  it('cancel_request fires from every non-terminal pre-fulfilment state', () => {
    const cancellable = [
      'submitted', 'entitlement_checked', 'approval_pending', 'approved',
      'assigned', 'fulfilment_in_progress', 'awaiting_user', 'user_responded',
    ] as const;
    for (const s of cancellable) {
      expect(nextStatus(s, 'cancel_request')).toBe('cancelled');
    }
  });

  it('hard terminals (archived, rejected, cancelled) reject every action', () => {
    for (const t of ['archived', 'rejected', 'cancelled'] as const) {
      expect(nextStatus(t, 'check_entitlement')).toBeNull();
      expect(nextStatus(t, 'reopen_request')).toBeNull();
      expect(nextStatus(t, 'cancel_request')).toBeNull();
      expect(isTerminal(t)).toBe(true);
    }
    // fulfilled is a SOFT terminal — accepts verify (forward) + reopen (backward)
    // but no other action.
    expect(isTerminal('fulfilled')).toBe(true);
    expect(nextStatus('fulfilled', 'reopen_request')).toBe('fulfilment_in_progress');
    expect(nextStatus('fulfilled', 'verify')).toBe('verified');
    expect(nextStatus('fulfilled', 'cancel_request')).toBeNull();
    expect(nextStatus('fulfilled', 'check_entitlement')).toBeNull();
    // closed is a SOFT terminal — accepts only archive_request.
    expect(isTerminal('closed')).toBe(true);
    expect(nextStatus('closed', 'archive_request')).toBe('archived');
    expect(nextStatus('closed', 'reopen_request')).toBeNull();
  });

  it('allowedActions surfaces every legal action per state', () => {
    expect(allowedActions('submitted')).toContain('check_entitlement');
    expect(allowedActions('submitted')).toContain('cancel_request');
    expect(allowedActions('entitlement_checked')).toContain('request_approval');
    expect(allowedActions('approval_pending')).toContain('approve');
    expect(allowedActions('approval_pending')).toContain('reject');
    expect(allowedActions('fulfilled').sort()).toEqual(['reopen_request', 'verify']);
    expect(allowedActions('closed')).toEqual(['archive_request']);
    expect(allowedActions('archived')).toEqual([]);
    expect(allowedActions('cancelled')).toEqual([]);
    expect(allowedActions('rejected')).toEqual([]);
  });

  it('TRANSITIONS table covers every action exactly once', () => {
    const actionKeys = Object.keys(TRANSITIONS).sort();
    expect(actionKeys).toEqual([
      'approve', 'archive_request', 'assign', 'cancel_request',
      'check_entitlement', 'close', 'mark_fulfilled', 'receive_user_response',
      'reject', 'reopen_request', 'request_approval', 'request_user_info',
      'start_fulfilment', 'verify',
    ]);
  });
});

describe('W104 Service Request — SLA polarity (URGENT)', () => {
  it('SLA decreases strictly minor → critical for every graded state', () => {
    for (const status of [
      'submitted', 'entitlement_checked', 'approval_pending', 'approved',
      'assigned', 'fulfilment_in_progress', 'awaiting_user', 'user_responded',
      'fulfilled', 'verified',
    ] as const) {
      const row = SLA_MINUTES[status];
      expect(row.minor).toBeGreaterThan(row.standard);
      expect(row.standard).toBeGreaterThan(row.material);
      expect(row.material).toBeGreaterThan(row.critical);
    }
  });

  it('submitted critical 4h, minor 14d (signature URGENT polarity)', () => {
    expect(SLA_MINUTES.submitted.critical).toBe(4 * 60);
    expect(SLA_MINUTES.submitted.minor).toBe(14 * 24 * 60);
    expect(SLA_MINUTES.submitted.material).toBe(24 * 60);
    expect(SLA_MINUTES.submitted.standard).toBe(5 * 24 * 60);
  });

  it('terminals carry no SLA deadline', () => {
    for (const t of ['closed', 'archived', 'rejected', 'cancelled'] as const) {
      expect(slaWindowMinutes(t, 'minor')).toBe(0);
      expect(slaWindowMinutes(t, 'critical')).toBe(0);
      expect(slaDeadlineFor(t, 'critical', new Date())).toBeNull();
    }
  });

  it('slaDeadlineFor advances by the configured window', () => {
    const t0 = new Date('2026-05-30T00:00:00Z');
    const d = slaDeadlineFor('submitted', 'critical', t0)!;
    expect(d.toISOString()).toBe('2026-05-30T04:00:00.000Z');
    const d2 = slaDeadlineFor('submitted', 'minor', t0)!;
    expect(d2.toISOString()).toBe('2026-06-13T00:00:00.000Z');
  });
});

describe('W104 Service Request — tier re-derivation', () => {
  it('tierForSeverity band boundaries', () => {
    expect(tierForSeverity(0)).toBe('minor');
    expect(tierForSeverity(49999)).toBe('minor');
    expect(tierForSeverity(50000)).toBe('standard');
    expect(tierForSeverity(499999)).toBe('standard');
    expect(tierForSeverity(500000)).toBe('material');
    expect(tierForSeverity(4999999)).toBe('material');
    expect(tierForSeverity(5000000)).toBe('critical');
    expect(tierForSeverity(50000000)).toBe('critical');
  });

  it('tierForSeverity defends against null / negative / NaN', () => {
    expect(tierForSeverity(null)).toBe('minor');
    expect(tierForSeverity(undefined)).toBe('minor');
    expect(tierForSeverity(-5)).toBe('minor');
    expect(tierForSeverity(Number.NaN)).toBe('minor');
  });

  it('countFloorFlags counts truthy floors', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ request_floor_flag_data_export_popia: 1 })).toBe(1);
    expect(countFloorFlags({
      request_floor_flag_data_export_popia: 1,
      request_floor_flag_grid_significant: 1,
    })).toBe(2);
  });

  it('floorAtMaterial fires on any one of the five flags', () => {
    expect(floorAtMaterial({})).toBe(false);
    expect(floorAtMaterial({ request_floor_flag_access_to_critical_system: true })).toBe(true);
    expect(floorAtMaterial({ request_floor_flag_data_export_popia: true })).toBe(true);
    expect(floorAtMaterial({ request_floor_flag_grid_significant: true })).toBe(true);
    expect(floorAtMaterial({ request_floor_flag_oem_break_glass: true })).toBe(true);
    expect(floorAtMaterial({ request_floor_flag_sla_premium_contract: true })).toBe(true);
  });

  it('floorAtCritical fires only on access_to_critical_system OR oem_break_glass', () => {
    expect(floorAtCritical({})).toBe(false);
    expect(floorAtCritical({ request_floor_flag_access_to_critical_system: true })).toBe(true);
    expect(floorAtCritical({ request_floor_flag_oem_break_glass: true })).toBe(true);
    expect(floorAtCritical({ request_floor_flag_data_export_popia: true })).toBe(false);
    expect(floorAtCritical({ request_floor_flag_grid_significant: true })).toBe(false);
    expect(floorAtCritical({ request_floor_flag_sla_premium_contract: true })).toBe(false);
  });

  it('effectiveTier: 1 floor flag promotes minor+standard to material', () => {
    expect(effectiveTier('minor', { request_floor_flag_data_export_popia: 1 })).toBe('material');
    expect(effectiveTier('standard', { request_floor_flag_grid_significant: 1 })).toBe('material');
    expect(effectiveTier('material', { request_floor_flag_data_export_popia: 1 })).toBe('material');
    expect(effectiveTier('critical', { request_floor_flag_data_export_popia: 1 })).toBe('critical');
  });

  it('effectiveTier: 2+ floor flags → critical', () => {
    expect(effectiveTier('minor', {
      request_floor_flag_data_export_popia: 1,
      request_floor_flag_grid_significant: 1,
    })).toBe('critical');
    expect(effectiveTier('standard', {
      request_floor_flag_data_export_popia: 1,
      request_floor_flag_grid_significant: 1,
      request_floor_flag_sla_premium_contract: 1,
    })).toBe('critical');
  });

  it('effectiveTier: critical floor flags force critical regardless', () => {
    expect(effectiveTier('minor', { request_floor_flag_access_to_critical_system: 1 })).toBe('critical');
    expect(effectiveTier('minor', { request_floor_flag_oem_break_glass: 1 })).toBe('critical');
  });

  it('effectiveTier: no flags returns raw tier', () => {
    expect(effectiveTier('minor', {})).toBe('minor');
    expect(effectiveTier('standard', {})).toBe('standard');
    expect(effectiveTier('material', {})).toBe('material');
    expect(effectiveTier('critical', {})).toBe('critical');
  });

  it('isHeavyTier identifies material + critical only', () => {
    expect(isHeavyTier('minor')).toBe(false);
    expect(isHeavyTier('standard')).toBe(false);
    expect(isHeavyTier('material')).toBe(true);
    expect(isHeavyTier('critical')).toBe(true);
  });

  it('isReportable matches heavy tiers', () => {
    expect(isReportable('minor')).toBe(false);
    expect(isReportable('standard')).toBe(false);
    expect(isReportable('material')).toBe(true);
    expect(isReportable('critical')).toBe(true);
  });
});

describe('W104 Service Request — regulator crossings (signature)', () => {
  it('reject crosses regulator EVERY tier when regulator_relevant=true (signature)', () => {
    for (const tier of ['minor', 'standard', 'material', 'critical'] as const) {
      expect(crossesIntoRegulator('reject', tier, { regulator_relevant: true })).toBe(true);
    }
  });

  it('reject does NOT cross when regulator_relevant=false', () => {
    for (const tier of ['minor', 'standard', 'material', 'critical'] as const) {
      expect(crossesIntoRegulator('reject', tier, { regulator_relevant: false })).toBe(false);
    }
  });

  it('cancel_request crosses EVERY tier when entitled AND regulator_relevant', () => {
    for (const tier of ['minor', 'standard', 'material', 'critical'] as const) {
      expect(crossesIntoRegulator('cancel_request', tier, {
        regulator_relevant: true,
        entitlement_status: 'entitled',
      })).toBe(true);
      expect(crossesIntoRegulator('cancel_request', tier, {
        regulator_relevant: true,
        entitlement_status: 'not_entitled',
      })).toBe(false);
      expect(crossesIntoRegulator('cancel_request', tier, {
        regulator_relevant: false,
        entitlement_status: 'entitled',
      })).toBe(false);
    }
  });

  it('mark_fulfilled crosses ONLY on critical AND grid_significant', () => {
    expect(crossesIntoRegulator('mark_fulfilled', 'critical', {
      request_floor_flag_grid_significant: true,
    })).toBe(true);
    expect(crossesIntoRegulator('mark_fulfilled', 'material', {
      request_floor_flag_grid_significant: true,
    })).toBe(false);
    expect(crossesIntoRegulator('mark_fulfilled', 'critical', {
      request_floor_flag_grid_significant: false,
    })).toBe(false);
  });

  it('other actions never cross regulator on their own', () => {
    for (const action of ['check_entitlement', 'approve', 'assign', 'start_fulfilment', 'verify', 'close'] as const) {
      expect(crossesIntoRegulator(action, 'critical', { regulator_relevant: true })).toBe(false);
    }
  });

  it('slaBreachCrossesIntoRegulator on material + critical', () => {
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
  });
});

describe('W104 Service Request — party + event + catalog mapping', () => {
  it('fulfiller drives check_entitlement / start_fulfilment / request_user_info / mark_fulfilled', () => {
    expect(partyForAction('check_entitlement')).toBe('fulfiller');
    expect(partyForAction('start_fulfilment')).toBe('fulfiller');
    expect(partyForAction('request_user_info')).toBe('fulfiller');
    expect(partyForAction('mark_fulfilled')).toBe('fulfiller');
  });

  it('approver drives approve / reject / assign', () => {
    expect(partyForAction('approve')).toBe('approver');
    expect(partyForAction('reject')).toBe('approver');
    expect(partyForAction('assign')).toBe('approver');
  });

  it('verifier drives verify / close', () => {
    expect(partyForAction('verify')).toBe('verifier');
    expect(partyForAction('close')).toBe('verifier');
  });

  it('archiver archives, requester reopens/cancels/responds', () => {
    expect(partyForAction('archive_request')).toBe('archiver');
    expect(partyForAction('reopen_request')).toBe('requester');
    expect(partyForAction('cancel_request')).toBe('requester');
    expect(partyForAction('receive_user_response')).toBe('requester');
    expect(partyForAction('request_approval')).toBe('requester');
  });

  it('eventTypeFor returns a service_request.* event for every action', () => {
    expect(eventTypeFor('check_entitlement')).toBe('service_request.entitlement_checked');
    expect(eventTypeFor('approve')).toBe('service_request.approved');
    expect(eventTypeFor('reject')).toBe('service_request.rejected');
    expect(eventTypeFor('mark_fulfilled')).toBe('service_request.fulfilled');
    expect(eventTypeFor('verify')).toBe('service_request.verified');
    expect(eventTypeFor('close')).toBe('service_request.closed');
    expect(eventTypeFor('archive_request')).toBe('service_request.archived');
    expect(eventTypeFor('cancel_request')).toBe('service_request.cancelled');
    expect(eventTypeFor('reopen_request')).toBe('service_request.reopened');
  });

  it('CATALOG_CATEGORIES enumerates all 10 catalog types', () => {
    expect(CATALOG_CATEGORIES).toHaveLength(10);
    expect(CATALOG_CATEGORIES).toContain('access_request');
    expect(CATALOG_CATEGORIES).toContain('asset_swap');
    expect(CATALOG_CATEGORIES).toContain('configuration_change');
    expect(CATALOG_CATEGORIES).toContain('audit_evidence_pull');
  });

  it('requiresCabReview fires on asset_swap / configuration_change / critical urgency', () => {
    expect(requiresCabReview('asset_swap', 'low')).toBe(true);
    expect(requiresCabReview('configuration_change', 'normal')).toBe(true);
    expect(requiresCabReview('access_request', 'critical')).toBe(true);
    expect(requiresCabReview('access_request', 'normal')).toBe(false);
    expect(requiresCabReview('audit_evidence_pull', 'low')).toBe(false);
  });
});

describe('W104 Service Request — LIVE battery (entitlement + first-time-fix + urgency)', () => {
  it('entitlementMatchScore peaks at 100 for entitled+contract', () => {
    expect(entitlementMatchScore({
      entitlement_status: 'entitled',
      entitlement_contract_id: 'svc-001',
    })).toBe(100);
  });

  it('entitlementMatchScore is mid for overage-approval', () => {
    const score = entitlementMatchScore({
      entitlement_status: 'requires_overage_approval',
      entitlement_contract_id: 'svc-001',
    });
    expect(score).toBeGreaterThan(40);
    expect(score).toBeLessThan(70);
  });

  it('entitlementMatchScore is low for not_entitled / expired', () => {
    expect(entitlementMatchScore({
      entitlement_status: 'not_entitled',
      entitlement_contract_id: null,
    })).toBeLessThan(20);
    expect(entitlementMatchScore({
      entitlement_status: 'contract_expired',
      entitlement_contract_id: 'svc-old',
    })).toBeLessThanOrEqual(40);
  });

  it('entitlementMatchScore is 0 when status missing', () => {
    expect(entitlementMatchScore({})).toBe(0);
  });

  it('entitlementMatchScore penalises overage units', () => {
    const base = entitlementMatchScore({
      entitlement_status: 'entitled',
      entitlement_contract_id: 'svc-001',
    });
    const penal = entitlementMatchScore({
      entitlement_status: 'entitled',
      entitlement_contract_id: 'svc-001',
      entitlement_overage_units: 10,
    });
    expect(penal).toBeLessThan(base);
  });

  it('firstTimeFixRate30d rounds to one decimal', () => {
    expect(firstTimeFixRate30d(80, 100)).toBe(80.0);
    expect(firstTimeFixRate30d(2, 3)).toBe(66.7);
    expect(firstTimeFixRate30d(0, 0)).toBe(0);
    expect(firstTimeFixRate30d(5, 0)).toBe(0);
  });

  it('avgFulfilmentTimeHours averages sample', () => {
    expect(avgFulfilmentTimeHours([2, 4, 6])).toBe(4);
    expect(avgFulfilmentTimeHours([])).toBe(0);
    expect(avgFulfilmentTimeHours([10])).toBe(10);
  });

  it('slaDaysRemaining can go negative when breached', () => {
    const entered = new Date('2026-05-29T00:00:00Z');
    const now = new Date('2026-05-30T05:00:00Z'); // 29h after entry
    // submitted × critical = 4h → already 25h past
    const left = slaDaysRemaining('submitted', 'critical', entered, now);
    expect(left).toBeLessThan(0);
  });

  it('slaDaysRemaining counts down', () => {
    const entered = new Date('2026-05-30T00:00:00Z');
    const now = new Date('2026-05-30T06:00:00Z'); // 6h in
    // submitted × material = 24h → 18h = 0.75d left
    const left = slaDaysRemaining('submitted', 'material', entered, now);
    expect(left).toBeGreaterThan(0.7);
    expect(left).toBeLessThan(0.85);
  });

  it('slaDaysRemaining returns 0 for terminals + null entry', () => {
    expect(slaDaysRemaining('closed', 'critical', new Date(), new Date())).toBe(0);
    expect(slaDaysRemaining('submitted', 'critical', null, new Date())).toBe(0);
  });

  it('urgencyBand composes tier + SLA days into critical/high/medium/low', () => {
    expect(urgencyBand('critical', 30)).toBe('critical');
    expect(urgencyBand('material', 30)).toBe('high');
    expect(urgencyBand('standard', 30)).toBe('medium');
    expect(urgencyBand('minor', 30)).toBe('low');
    // breach takes precedence
    expect(urgencyBand('minor', -1)).toBe('critical');
    expect(urgencyBand('minor', 0.1)).toBe('critical'); // < 0.25d
    expect(urgencyBand('minor', 0.5)).toBe('high'); // < 1d
    expect(urgencyBand('minor', 2)).toBe('medium'); // < 3d
  });

  it('breachImminentFlag fires within 12h of deadline', () => {
    expect(breachImminentFlag(0.4)).toBe(true);
    expect(breachImminentFlag(0.1)).toBe(true);
    expect(breachImminentFlag(0.51)).toBe(false);
    expect(breachImminentFlag(-1)).toBe(false); // already breached, not imminent
  });

  it('catalogCompletenessIndex composes coverage flags, capped at 130', () => {
    expect(catalogCompletenessIndex({})).toBe(0);
    expect(catalogCompletenessIndex({
      entitlement_checked: true,
      approval_resolved: true,
      assigned: true,
      fulfilment_started: true,
      fulfilled: true,
      verified: true,
      closed: true,
      archived: true,
      first_time_fix_bonus: true,
      csat_collected: true,
    })).toBe(130);
    expect(catalogCompletenessIndex({
      entitlement_checked: true,
      approval_resolved: true,
      assigned: true,
    })).toBe(40);
  });

  it('regulatorFilingWindowHours tightens with tier', () => {
    expect(regulatorFilingWindowHours('critical')).toBe(4);
    expect(regulatorFilingWindowHours('material')).toBe(24);
    expect(regulatorFilingWindowHours('standard')).toBe(72);
    expect(regulatorFilingWindowHours('minor')).toBe(168);
  });

  it('authorityRequired ladder: end_user → service_desk_lead → asset_owner → support_director', () => {
    expect(authorityRequired('minor')).toBe('end_user');
    expect(authorityRequired('standard')).toBe('service_desk_lead');
    expect(authorityRequired('material')).toBe('asset_owner');
    expect(authorityRequired('critical')).toBe('support_director');
  });

  it('bridgesToChangeChain fires when cab_change_id is set', () => {
    expect(bridgesToChangeChain(null)).toBe(false);
    expect(bridgesToChangeChain('')).toBe(false);
    expect(bridgesToChangeChain('chg-001')).toBe(true);
  });

  it('bridgesToProblemChain fires at >=2 reopens', () => {
    expect(bridgesToProblemChain(0)).toBe(false);
    expect(bridgesToProblemChain(1)).toBe(false);
    expect(bridgesToProblemChain(2)).toBe(true);
    expect(bridgesToProblemChain(5)).toBe(true);
    expect(bridgesToProblemChain(null)).toBe(false);
  });

  it('isFirstTimeFix requires zero reopens AND fulfilled timestamp', () => {
    expect(isFirstTimeFix(0, '2026-05-30T00:00:00Z')).toBe(true);
    expect(isFirstTimeFix(1, '2026-05-30T00:00:00Z')).toBe(false);
    expect(isFirstTimeFix(0, null)).toBe(false);
    expect(isFirstTimeFix(null, '2026-05-30T00:00:00Z')).toBe(true);
  });
});
