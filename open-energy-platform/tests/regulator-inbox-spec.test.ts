// Unit tests for Wave 5 regulator-inbox spec helpers.
// Pure functions only — no DB, no env, no time mocking beyond Date.now().

import { describe, it, expect } from 'vitest';
import {
  regulatorInboxSpec,
  computeSlaDueAt,
  eventMatches,
  severityAtLeast,
  SLA_HOURS_BY_SEVERITY,
} from '../src/utils/regulator-inbox-spec';

describe('regulatorInboxSpec — event allowlist + severity derivation', () => {
  it('returns null for events outside the allowlist', () => {
    expect(regulatorInboxSpec('trade.matched', 'tr_1', {})).toBeNull();
    expect(regulatorInboxSpec('auth.login', 'u_1', {})).toBeNull();
    expect(regulatorInboxSpec('ipp.project_created', 'p_1', {})).toBeNull();
  });

  it('clearing.disclosure.published lands as info with period in title', () => {
    const s = regulatorInboxSpec('clearing.disclosure.published', 'cd_1', { period: '2026-Q1' });
    expect(s).not.toBeNull();
    expect(s!.severity).toBe('info');
    expect(s!.title).toContain('2026-Q1');
  });

  it('Article 6 UNFCCC posts land as info with host/beneficiary/volume', () => {
    const s = regulatorInboxSpec('carbon.article6.unfccc_posted', 'a6_1', {
      host_iso: 'ZAF', beneficiary_iso: 'CHE', volume_tco2e: 25000,
    });
    expect(s!.severity).toBe('info');
    expect(s!.title).toContain('ZAF');
    expect(s!.title).toContain('CHE');
  });

  it('Article 6 blocked is high severity', () => {
    const s = regulatorInboxSpec('carbon.article6.blocked', 'a6_2', {
      host_iso: 'ZAF', beneficiary_iso: 'USA',
    });
    expect(s!.severity).toBe('high');
    expect(s!.title).toMatch(/BLOCKED/);
  });

  it('surveillance alerts below medium are filtered out', () => {
    expect(regulatorInboxSpec('surveillance.alert_raised', 'sva_1', { severity: 'low' })).toBeNull();
    expect(regulatorInboxSpec('surveillance.alert_raised', 'sva_2', { severity: 'info' })).toBeNull();
  });

  it('surveillance alerts at medium+ are surfaced at their reported severity', () => {
    const med = regulatorInboxSpec('surveillance.alert_raised', 'sva_3',
      { severity: 'medium', alert_type: 'wash_trade' });
    expect(med!.severity).toBe('medium');
    expect(med!.title).toContain('wash_trade');

    const high = regulatorInboxSpec('surveillance.alert_raised', 'sva_4',
      { severity: 'high', alert_type: 'spoofing' });
    expect(high!.severity).toBe('high');

    const crit = regulatorInboxSpec('surveillance.alert_raised', 'sva_5',
      { severity: 'critical', alert_type: 'market_abuse' });
    expect(crit!.severity).toBe('critical');
  });

  it('regulator.surveillance_alert_raised is also accepted (alias path)', () => {
    const s = regulatorInboxSpec('regulator.surveillance_alert_raised', 'sva_6',
      { severity: 'high', alert_type: 'mm_breach' });
    expect(s!.severity).toBe('high');
  });

  it('enforcement events are always high', () => {
    expect(regulatorInboxSpec('regulator.enforcement_opened', 'rec_1', { subject: 'IPP-X' })!.severity).toBe('high');
    expect(regulatorInboxSpec('regulator.enforcement_finding', 'rec_2', { finding_type: 'breach' })!.severity).toBe('high');
  });

  it('licence vary=medium; suspend/revoke=critical', () => {
    expect(regulatorInboxSpec('regulator.licence_varied', 'rl_1', { licence_number: 'L-1' })!.severity).toBe('medium');
    expect(regulatorInboxSpec('regulator.licence_suspended', 'rl_2', { licence_number: 'L-2' })!.severity).toBe('critical');
    expect(regulatorInboxSpec('regulator.licence_revoked', 'rl_3', { licence_number: 'L-3' })!.severity).toBe('critical');
  });

  it('uses entity_id as fallback when title field missing', () => {
    const s = regulatorInboxSpec('regulator.licence_varied', 'rl_4', {});
    expect(s!.title).toContain('rl_4');
  });
});

describe('computeSlaDueAt — windows by severity', () => {
  it('returns 1 hour for critical', () => {
    const now = new Date('2026-05-27T10:00:00Z');
    const due = computeSlaDueAt('critical', now);
    expect(due).toBe('2026-05-27T11:00:00.000Z');
  });

  it('returns 4 hours for high', () => {
    const now = new Date('2026-05-27T10:00:00Z');
    expect(computeSlaDueAt('high', now)).toBe('2026-05-27T14:00:00.000Z');
  });

  it('returns 24 hours for medium', () => {
    const now = new Date('2026-05-27T10:00:00Z');
    expect(computeSlaDueAt('medium', now)).toBe('2026-05-28T10:00:00.000Z');
  });

  it('returns 72 hours for low and 168 hours for info', () => {
    const now = new Date('2026-05-27T00:00:00Z');
    expect(computeSlaDueAt('low', now)).toBe('2026-05-30T00:00:00.000Z');
    expect(computeSlaDueAt('info', now)).toBe('2026-06-03T00:00:00.000Z');
  });

  it('exposes the canonical SLA table', () => {
    expect(SLA_HOURS_BY_SEVERITY.critical).toBe(1);
    expect(SLA_HOURS_BY_SEVERITY.high).toBe(4);
    expect(SLA_HOURS_BY_SEVERITY.medium).toBe(24);
    expect(SLA_HOURS_BY_SEVERITY.low).toBe(72);
    expect(SLA_HOURS_BY_SEVERITY.info).toBe(168);
  });
});

describe('eventMatches — escalation rule glob', () => {
  it('exact match', () => {
    expect(eventMatches('regulator.licence_suspended', 'regulator.licence_suspended')).toBe(true);
    expect(eventMatches('regulator.licence_suspended', 'regulator.licence_revoked')).toBe(false);
  });

  it('star wildcard matches everything', () => {
    expect(eventMatches('anything.at.all', '*')).toBe(true);
  });

  it('trailing wildcard matches by prefix', () => {
    expect(eventMatches('regulator.licence_suspended', 'regulator.*')).toBe(true);
    expect(eventMatches('regulator.licence_varied', 'regulator.licence_*')).toBe(true);
    expect(eventMatches('carbon.article6.blocked', 'regulator.*')).toBe(false);
  });
});

describe('severityAtLeast — gate', () => {
  it('strict inequality', () => {
    expect(severityAtLeast('critical', 'high')).toBe(true);
    expect(severityAtLeast('high', 'high')).toBe(true);
    expect(severityAtLeast('medium', 'high')).toBe(false);
    expect(severityAtLeast('info', 'low')).toBe(false);
    expect(severityAtLeast('low', 'low')).toBe(true);
  });
});
