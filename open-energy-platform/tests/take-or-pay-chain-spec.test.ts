import { describe, it, expect } from 'vitest';
import {
  nextStatus,
  isTerminal,
  allowedActions,
  slaDeadlineFor,
  isReportable,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  tierForShortfallPct,
  SLA_MINUTES,
  type TopStatus,
  type TopAction,
  type TopTier,
} from '../src/utils/take-or-pay-chain-spec';

describe('take-or-pay-chain-spec — happy path', () => {
  it('drives accrual_open → settled through 8 transitions', () => {
    const path: Array<[TopStatus, TopAction, TopStatus]> = [
      ['accrual_open',       'close_year',       'year_end'],
      ['year_end',           'issue_statement',  'statement_issued'],
      ['statement_issued',   'request_evidence', 'evidence_required'],
      ['evidence_required',  'submit_evidence',  'evidence_submitted'],
      ['evidence_submitted', 'propose_quantum',  'quantum_proposed'],
      ['quantum_proposed',   'accept_quantum',   'quantum_agreed'],
      ['quantum_agreed',     'settle',           'settled'],
    ];
    for (const [from, action, expected] of path) {
      expect(nextStatus(from, action)).toBe(expected);
    }
  });
  it('allows fast-track propose_quantum from statement_issued (no evidence loop)', () => {
    expect(nextStatus('statement_issued', 'propose_quantum')).toBe('quantum_proposed');
  });
});

describe('take-or-pay-chain-spec — dispute branch', () => {
  it('dispute reachable from quantum_proposed/quantum_agreed/evidence_submitted', () => {
    expect(nextStatus('quantum_proposed',   'dispute')).toBe('disputed');
    expect(nextStatus('quantum_agreed',     'dispute')).toBe('disputed');
    expect(nextStatus('evidence_submitted', 'dispute')).toBe('disputed');
  });
  it('dispute NOT reachable from accrual_open / year_end / statement_issued / evidence_required', () => {
    expect(nextStatus('accrual_open',      'dispute')).toBeNull();
    expect(nextStatus('year_end',          'dispute')).toBeNull();
    expect(nextStatus('statement_issued',  'dispute')).toBeNull();
    expect(nextStatus('evidence_required', 'dispute')).toBeNull();
  });
});

describe('take-or-pay-chain-spec — waive branch', () => {
  it('waive reachable from year_end through quantum_proposed', () => {
    const sources: TopStatus[] = [
      'year_end', 'statement_issued', 'evidence_required',
      'evidence_submitted', 'quantum_proposed',
    ];
    for (const from of sources) {
      expect(nextStatus(from, 'waive')).toBe('waived');
    }
  });
  it('waive NOT reachable from accrual_open / quantum_agreed', () => {
    expect(nextStatus('accrual_open',   'waive')).toBeNull();
    expect(nextStatus('quantum_agreed', 'waive')).toBeNull();
  });
});

describe('take-or-pay-chain-spec — terminals', () => {
  it('marks settled/disputed/waived as terminal', () => {
    expect(isTerminal('settled')).toBe(true);
    expect(isTerminal('disputed')).toBe(true);
    expect(isTerminal('waived')).toBe(true);
  });
  it('all forward states are non-terminal', () => {
    const forward: TopStatus[] = [
      'accrual_open', 'year_end', 'statement_issued', 'evidence_required',
      'evidence_submitted', 'quantum_proposed', 'quantum_agreed',
    ];
    for (const s of forward) expect(isTerminal(s)).toBe(false);
  });
  it('any action from a terminal returns null', () => {
    expect(nextStatus('settled',  'close_year')).toBeNull();
    expect(nextStatus('disputed', 'submit_evidence')).toBeNull();
    expect(nextStatus('waived',   'settle')).toBeNull();
  });
});

describe('take-or-pay-chain-spec — allowedActions sanity', () => {
  it('accrual_open allows only close_year', () => {
    expect(allowedActions('accrual_open').sort()).toEqual(['close_year']);
  });
  it('year_end allows issue_statement + waive', () => {
    expect(allowedActions('year_end').sort()).toEqual(['issue_statement', 'waive'].sort());
  });
  it('statement_issued allows request_evidence + propose_quantum + waive', () => {
    expect(allowedActions('statement_issued').sort()).toEqual(
      ['propose_quantum', 'request_evidence', 'waive'].sort(),
    );
  });
  it('evidence_submitted allows propose_quantum + dispute + waive', () => {
    expect(allowedActions('evidence_submitted').sort()).toEqual(
      ['dispute', 'propose_quantum', 'waive'].sort(),
    );
  });
  it('quantum_proposed allows accept_quantum + dispute + waive', () => {
    expect(allowedActions('quantum_proposed').sort()).toEqual(
      ['accept_quantum', 'dispute', 'waive'].sort(),
    );
  });
  it('quantum_agreed allows settle + dispute', () => {
    expect(allowedActions('quantum_agreed').sort()).toEqual(['dispute', 'settle'].sort());
  });
});

describe('take-or-pay-chain-spec — INVERTED SLA matrix', () => {
  it('statement_issued: catastrophic < major < moderate < minor', () => {
    const m = SLA_MINUTES.statement_issued;
    expect(m.catastrophic).toBeLessThan(m.major);
    expect(m.major).toBeLessThan(m.moderate);
    expect(m.moderate).toBeLessThan(m.minor);
  });
  it('quantum_proposed major anchors at 90 days (Section 34 statutory)', () => {
    expect(SLA_MINUTES.quantum_proposed.major).toBe(90 * 24 * 60);
  });
  it('quantum_proposed: catastrophic compressed to 30d', () => {
    expect(SLA_MINUTES.quantum_proposed.catastrophic).toBe(30 * 24 * 60);
  });
  it('terminal states carry zero SLA', () => {
    const tiers: TopTier[] = ['catastrophic', 'major', 'moderate', 'minor'];
    for (const t of tiers) {
      expect(SLA_MINUTES.settled[t]).toBe(0);
      expect(SLA_MINUTES.disputed[t]).toBe(0);
      expect(SLA_MINUTES.waived[t]).toBe(0);
    }
  });
  it('slaDeadlineFor returns null for terminal states', () => {
    const t = new Date('2026-05-28T00:00:00Z');
    expect(slaDeadlineFor('settled', 'catastrophic', t)).toBeNull();
    expect(slaDeadlineFor('waived',  'minor',        t)).toBeNull();
  });
  it('slaDeadlineFor adds correct offset for year_end catastrophic (7d)', () => {
    const t = new Date('2026-05-28T00:00:00Z');
    const d = slaDeadlineFor('year_end', 'catastrophic', t);
    expect(d).not.toBeNull();
    expect(d!.getTime() - t.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('take-or-pay-chain-spec — regulator crossings', () => {
  it('settle crosses for catastrophic + major only', () => {
    expect(crossesIntoRegulator('settle', 'catastrophic')).toBe(true);
    expect(crossesIntoRegulator('settle', 'major')).toBe(true);
    expect(crossesIntoRegulator('settle', 'moderate')).toBe(false);
    expect(crossesIntoRegulator('settle', 'minor')).toBe(false);
  });
  it('dispute crosses for catastrophic + major only', () => {
    expect(crossesIntoRegulator('dispute', 'catastrophic')).toBe(true);
    expect(crossesIntoRegulator('dispute', 'major')).toBe(true);
    expect(crossesIntoRegulator('dispute', 'moderate')).toBe(false);
    expect(crossesIntoRegulator('dispute', 'minor')).toBe(false);
  });
  it('waive crosses for catastrophic + major only', () => {
    expect(crossesIntoRegulator('waive', 'catastrophic')).toBe(true);
    expect(crossesIntoRegulator('waive', 'major')).toBe(true);
    expect(crossesIntoRegulator('waive', 'moderate')).toBe(false);
    expect(crossesIntoRegulator('waive', 'minor')).toBe(false);
  });
  it('non-terminal actions never cross', () => {
    const tiers: TopTier[] = ['catastrophic', 'major', 'moderate', 'minor'];
    const acts: TopAction[] = [
      'close_year', 'issue_statement', 'request_evidence',
      'submit_evidence', 'propose_quantum', 'accept_quantum',
    ];
    for (const t of tiers) for (const a of acts) {
      expect(crossesIntoRegulator(a, t)).toBe(false);
    }
  });
  it('sla_breached crosses for ALL tiers (annual return hard line)', () => {
    const tiers: TopTier[] = ['catastrophic', 'major', 'moderate', 'minor'];
    for (const t of tiers) {
      expect(slaBreachCrossesIntoRegulator(t)).toBe(true);
    }
  });
  it('isReportable mirrors terminal reportability', () => {
    expect(isReportable('catastrophic')).toBe(true);
    expect(isReportable('major')).toBe(true);
    expect(isReportable('moderate')).toBe(false);
    expect(isReportable('minor')).toBe(false);
  });
});

describe('take-or-pay-chain-spec — tierForShortfallPct', () => {
  it('classifies >=50% as catastrophic', () => {
    expect(tierForShortfallPct(50)).toBe('catastrophic');
    expect(tierForShortfallPct(75)).toBe('catastrophic');
    expect(tierForShortfallPct(100)).toBe('catastrophic');
  });
  it('classifies 20-49.99% as major', () => {
    expect(tierForShortfallPct(20)).toBe('major');
    expect(tierForShortfallPct(35)).toBe('major');
    expect(tierForShortfallPct(49.99)).toBe('major');
  });
  it('classifies 5-19.99% as moderate', () => {
    expect(tierForShortfallPct(5)).toBe('moderate');
    expect(tierForShortfallPct(12.5)).toBe('moderate');
    expect(tierForShortfallPct(19.99)).toBe('moderate');
  });
  it('classifies <5% as minor', () => {
    expect(tierForShortfallPct(0)).toBe('minor');
    expect(tierForShortfallPct(2.5)).toBe('minor');
    expect(tierForShortfallPct(4.99)).toBe('minor');
  });
});
