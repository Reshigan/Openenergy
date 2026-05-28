import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, tierForRecoveryZarM,
  isLargeTier, isSystemicDefect, isReportable,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  partyForAction,
  type RecoveryStatus, type RecoveryTier, type RecoveryAction, type DefectClass,
} from '../src/utils/warranty-recovery-spec';

describe('W63 warranty-recovery chain — state machine', () => {
  it('happy path: claim_drafted→submitted_to_oem→oem_acknowledged→under_assessment→assessment_complete→approved→recovery_pending→recovered', () => {
    let s: RecoveryStatus = 'claim_drafted';
    s = nextStatus(s, 'submit_claim')!;        expect(s).toBe('submitted_to_oem');
    s = nextStatus(s, 'acknowledge')!;          expect(s).toBe('oem_acknowledged');
    s = nextStatus(s, 'begin_assessment')!;     expect(s).toBe('under_assessment');
    s = nextStatus(s, 'complete_assessment')!;  expect(s).toBe('assessment_complete');
    s = nextStatus(s, 'approve_recovery')!;     expect(s).toBe('approved');
    s = nextStatus(s, 'initiate_recovery')!;    expect(s).toBe('recovery_pending');
    s = nextStatus(s, 'confirm_recovery')!;     expect(s).toBe('recovered');
    expect(isTerminal('recovered')).toBe(true);
  });

  it('rejection: assessment_complete → rejected', () => {
    expect(nextStatus('assessment_complete', 'reject_claim')).toBe('rejected');
    expect(isTerminal('rejected')).toBe(true);
    // reject_claim only from assessment_complete
    expect(nextStatus('under_assessment', 'reject_claim')).toBeNull();
    expect(nextStatus('approved', 'reject_claim')).toBeNull();
  });

  it('dispute loop: assessment_complete → disputed → approved (resolve_dispute)', () => {
    expect(nextStatus('assessment_complete', 'dispute')).toBe('disputed');
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('approved');
    expect(isTerminal('disputed')).toBe(false);
  });

  it('dispute from recovery_pending (OEM fails to pay) → disputed → written_off', () => {
    expect(nextStatus('recovery_pending', 'dispute')).toBe('disputed');
    expect(nextStatus('disputed', 'write_off')).toBe('written_off');
    expect(isTerminal('written_off')).toBe(true);
  });

  it('write_off only reachable from disputed', () => {
    expect(nextStatus('disputed', 'write_off')).toBe('written_off');
    expect(nextStatus('assessment_complete', 'write_off')).toBeNull();
    expect(nextStatus('recovery_pending', 'write_off')).toBeNull();
    expect(nextStatus('approved', 'write_off')).toBeNull();
  });

  it('withdraw reachable from every pre-approval state, NOT after approval', () => {
    const froms: RecoveryStatus[] = [
      'claim_drafted', 'submitted_to_oem', 'oem_acknowledged',
      'under_assessment', 'assessment_complete',
    ];
    for (const f of froms) {
      expect(nextStatus(f, 'withdraw')).toBe('withdrawn');
    }
    expect(isTerminal('withdrawn')).toBe(true);
    // not available once approved / in recovery / disputed / terminal
    expect(nextStatus('approved', 'withdraw')).toBeNull();
    expect(nextStatus('recovery_pending', 'withdraw')).toBeNull();
    expect(nextStatus('disputed', 'withdraw')).toBeNull();
    expect(nextStatus('recovered', 'withdraw')).toBeNull();
  });

  it('resolve_dispute and approve_recovery both land on approved', () => {
    expect(nextStatus('assessment_complete', 'approve_recovery')).toBe('approved');
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('approved');
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('recovered')).toEqual([]);
    expect(allowedActions('rejected')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
    expect(allowedActions('written_off')).toEqual([]);
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('claim_drafted', 'acknowledge')).toBeNull();
    expect(nextStatus('submitted_to_oem', 'begin_assessment')).toBeNull();
    expect(nextStatus('oem_acknowledged', 'complete_assessment')).toBeNull();
    expect(nextStatus('under_assessment', 'approve_recovery')).toBeNull();
    expect(nextStatus('approved', 'confirm_recovery')).toBeNull();
    expect(nextStatus('recovered', 'dispute')).toBeNull();
  });

  it('TRANSITIONS dict covers every state', () => {
    const states: RecoveryStatus[] = [
      'claim_drafted', 'submitted_to_oem', 'oem_acknowledged', 'under_assessment',
      'assessment_complete', 'approved', 'disputed', 'recovery_pending',
      'recovered', 'rejected', 'withdrawn', 'written_off',
    ];
    for (const s of states) {
      expect(TRANSITIONS[s]).toBeDefined();
    }
  });

  it('assessment_complete fans out to approve / reject / dispute / withdraw', () => {
    const actions = allowedActions('assessment_complete');
    expect(actions).toContain('approve_recovery');
    expect(actions).toContain('reject_claim');
    expect(actions).toContain('dispute');
    expect(actions).toContain('withdraw');
  });

  it('disputed fans out to resolve_dispute / write_off', () => {
    const actions = allowedActions('disputed');
    expect(actions).toContain('resolve_dispute');
    expect(actions).toContain('write_off');
    expect(actions).toHaveLength(2);
  });
});

describe('W63 warranty-recovery chain — recovery-amount tiering', () => {
  it('maps recovery ZARm to tiers at the boundaries', () => {
    expect(tierForRecoveryZarM(0)).toBe('minor');
    expect(tierForRecoveryZarM(0.9)).toBe('minor');
    expect(tierForRecoveryZarM(1)).toBe('moderate');
    expect(tierForRecoveryZarM(9.99)).toBe('moderate');
    expect(tierForRecoveryZarM(10)).toBe('material');
    expect(tierForRecoveryZarM(49.99)).toBe('material');
    expect(tierForRecoveryZarM(50)).toBe('major');
    expect(tierForRecoveryZarM(249.99)).toBe('major');
    expect(tierForRecoveryZarM(250)).toBe('critical');
    expect(tierForRecoveryZarM(1000)).toBe('critical');
  });

  it('isLargeTier — major + critical only', () => {
    expect(isLargeTier('major')).toBe(true);
    expect(isLargeTier('critical')).toBe(true);
    expect(isLargeTier('material')).toBe(false);
    expect(isLargeTier('moderate')).toBe(false);
    expect(isLargeTier('minor')).toBe(false);
  });
});

describe('W63 warranty-recovery chain — defect classification', () => {
  it('isSystemicDefect — serial + safety only', () => {
    expect(isSystemicDefect('serial')).toBe(true);
    expect(isSystemicDefect('safety')).toBe(true);
    expect(isSystemicDefect('isolated')).toBe(false);
    expect(isSystemicDefect('batch')).toBe(false);
    expect(isSystemicDefect('wear_out')).toBe(false);
  });
});

describe('W63 warranty-recovery chain — MIXED SLA matrix', () => {
  const base = new Date('2026-01-15T10:00:00Z');
  const DAY = 24 * 60;

  it('claim_drafted / under_assessment / disputed are INVERTED (bigger = MORE time)', () => {
    const inverted: RecoveryStatus[] = ['claim_drafted', 'under_assessment', 'disputed'];
    for (const st of inverted) {
      expect(SLA_MINUTES[st].minor).toBeLessThan(SLA_MINUTES[st].moderate);
      expect(SLA_MINUTES[st].moderate).toBeLessThan(SLA_MINUTES[st].material);
      expect(SLA_MINUTES[st].material).toBeLessThan(SLA_MINUTES[st].major);
      expect(SLA_MINUTES[st].major).toBeLessThan(SLA_MINUTES[st].critical);
    }
  });

  it('recovery_pending is URGENT (bigger approved recovery chased FASTER)', () => {
    expect(SLA_MINUTES.recovery_pending.minor).toBeGreaterThan(SLA_MINUTES.recovery_pending.moderate);
    expect(SLA_MINUTES.recovery_pending.moderate).toBeGreaterThan(SLA_MINUTES.recovery_pending.material);
    expect(SLA_MINUTES.recovery_pending.material).toBeGreaterThan(SLA_MINUTES.recovery_pending.major);
    expect(SLA_MINUTES.recovery_pending.major).toBeGreaterThan(SLA_MINUTES.recovery_pending.critical);
    expect(SLA_MINUTES.recovery_pending.critical).toBe(5 * DAY);
  });

  it('submitted_to_oem / oem_acknowledged / assessment_complete / approved are fixed across tiers', () => {
    const fixed: RecoveryStatus[] = ['submitted_to_oem', 'oem_acknowledged', 'assessment_complete', 'approved'];
    const tiers: RecoveryTier[] = ['minor', 'moderate', 'material', 'major', 'critical'];
    for (const st of fixed) {
      const v = SLA_MINUTES[st].minor;
      for (const t of tiers) expect(SLA_MINUTES[st][t]).toBe(v);
    }
  });

  it('slaDeadlineFor adds the window minutes; terminals return null', () => {
    const d = slaDeadlineFor('claim_drafted', 'minor', base);
    expect(d!.getTime() - base.getTime()).toBe(SLA_MINUTES.claim_drafted.minor * 60_000);
    expect(slaDeadlineFor('recovered', 'critical', base)).toBeNull();
    expect(slaDeadlineFor('rejected', 'major', base)).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'minor', base)).toBeNull();
    expect(slaDeadlineFor('written_off', 'critical', base)).toBeNull();
  });
});

describe('W63 warranty-recovery chain — DEFECT-CLASS-driven reportability (the W63 signature)', () => {
  const tiers: RecoveryTier[] = ['minor', 'moderate', 'material', 'major', 'critical'];

  it('complete_assessment crosses for EVERY tier when defect is systemic (serial/safety)', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('complete_assessment', t, 'serial')).toBe(true);
      expect(crossesIntoRegulator('complete_assessment', t, 'safety')).toBe(true);
    }
  });

  it('complete_assessment for a non-systemic defect crosses ONLY for large tiers', () => {
    const nonSystemic: DefectClass[] = ['isolated', 'batch', 'wear_out'];
    for (const d of nonSystemic) {
      expect(crossesIntoRegulator('complete_assessment', 'minor', d)).toBe(false);
      expect(crossesIntoRegulator('complete_assessment', 'moderate', d)).toBe(false);
      expect(crossesIntoRegulator('complete_assessment', 'material', d)).toBe(false);
      expect(crossesIntoRegulator('complete_assessment', 'major', d)).toBe(true);
      expect(crossesIntoRegulator('complete_assessment', 'critical', d)).toBe(true);
    }
  });

  it('write_off crosses for large tiers only (regardless of defect class)', () => {
    expect(crossesIntoRegulator('write_off', 'major', 'isolated')).toBe(true);
    expect(crossesIntoRegulator('write_off', 'critical', 'wear_out')).toBe(true);
    expect(crossesIntoRegulator('write_off', 'material', 'serial')).toBe(false);
    expect(crossesIntoRegulator('write_off', 'minor', 'safety')).toBe(false);
  });

  it('routine actions never cross for any tier/defect', () => {
    const routine: RecoveryAction[] = [
      'submit_claim', 'acknowledge', 'begin_assessment', 'approve_recovery',
      'reject_claim', 'dispute', 'resolve_dispute', 'initiate_recovery',
      'confirm_recovery', 'withdraw',
    ];
    for (const t of tiers) {
      for (const a of routine) {
        expect(crossesIntoRegulator(a, t, 'serial')).toBe(false);
        expect(crossesIntoRegulator(a, t, 'isolated')).toBe(false);
      }
    }
  });

  it('sla_breach crosses for large tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('moderate')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
  });

  it('isReportable = systemic OR large', () => {
    // systemic at any tier
    expect(isReportable('minor', 'serial')).toBe(true);
    expect(isReportable('moderate', 'safety')).toBe(true);
    // large at any defect class
    expect(isReportable('major', 'isolated')).toBe(true);
    expect(isReportable('critical', 'wear_out')).toBe(true);
    // neither
    expect(isReportable('minor', 'isolated')).toBe(false);
    expect(isReportable('material', 'batch')).toBe(false);
  });
});

describe('W63 warranty-recovery chain — functional party attribution', () => {
  it('claimant owns submission / dispute / confirmation / write-off / withdraw', () => {
    expect(partyForAction('submit_claim')).toBe('claimant');
    expect(partyForAction('dispute')).toBe('claimant');
    expect(partyForAction('confirm_recovery')).toBe('claimant');
    expect(partyForAction('write_off')).toBe('claimant');
    expect(partyForAction('withdraw')).toBe('claimant');
  });

  it('oem_supplier owns acknowledgement / approval / rejection / recovery issuance', () => {
    expect(partyForAction('acknowledge')).toBe('oem_supplier');
    expect(partyForAction('approve_recovery')).toBe('oem_supplier');
    expect(partyForAction('reject_claim')).toBe('oem_supplier');
    expect(partyForAction('initiate_recovery')).toBe('oem_supplier');
  });

  it('assessor owns the technical assessment + independent dispute resolution', () => {
    expect(partyForAction('begin_assessment')).toBe('assessor');
    expect(partyForAction('complete_assessment')).toBe('assessor');
    expect(partyForAction('resolve_dispute')).toBe('assessor');
  });
});
