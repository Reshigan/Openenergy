import { describe, expect, it } from 'vitest';
import {
  advance,
  crossesIntoRegulator,
  daysUntilDeadline,
  hasSlaWindow,
  isSlaBreached,
  isTerminal,
  slaDueAt,
  STATUS_LABEL,
  REGISTER_TO_DEVICES_DAYS,
  DEVICES_TO_INGESTION_DAYS,
  INGESTION_TO_TELEMETRY_DAYS,
  TELEMETRY_TO_ENERGISED_DAYS,
} from '../src/utils/site-commissioning-spec';

const NOW = new Date('2026-06-01T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('isTerminal', () => {
  it('returns true for terminal states', () => {
    expect(isTerminal('in_om')).toBe(true);
    expect(isTerminal('commissioning_failed')).toBe(true);
    expect(isTerminal('decommissioned')).toBe(true);
  });

  it('returns false for in-flight states', () => {
    expect(isTerminal('planned')).toBe(false);
    expect(isTerminal('site_registered')).toBe(false);
    expect(isTerminal('devices_registered')).toBe(false);
    expect(isTerminal('ingestion_wired')).toBe(false);
    expect(isTerminal('first_telemetry_ok')).toBe(false);
    expect(isTerminal('energised')).toBe(false);
  });
});

describe('advance', () => {
  it('walks the happy path end-to-end', () => {
    expect(advance({ current: 'planned', action: 'register_site' })).toEqual({ next: 'site_registered', ok: true });
    expect(advance({ current: 'site_registered', action: 'register_devices' })).toEqual({ next: 'devices_registered', ok: true });
    expect(advance({ current: 'devices_registered', action: 'wire_ingestion' })).toEqual({ next: 'ingestion_wired', ok: true });
    expect(advance({ current: 'ingestion_wired', action: 'first_telemetry' })).toEqual({ next: 'first_telemetry_ok', ok: true });
    expect(advance({ current: 'first_telemetry_ok', action: 'energise' })).toEqual({ next: 'energised', ok: true });
    expect(advance({ current: 'energised', action: 'handover_om' })).toEqual({ next: 'in_om', ok: true });
  });

  it('mark_failed available from every onboarding state', () => {
    for (const s of ['planned','site_registered','devices_registered','ingestion_wired','first_telemetry_ok'] as const) {
      expect(advance({ current: s, action: 'mark_failed' }).next).toBe('commissioning_failed');
    }
  });

  it('decommission available from energised + in_om', () => {
    expect(advance({ current: 'energised', action: 'decommission' }).next).toBe('decommissioned');
    expect(advance({ current: 'in_om', action: 'decommission' }).next).toBe('decommissioned');
  });

  it('blocks invalid transitions', () => {
    expect(advance({ current: 'planned', action: 'energise' }).ok).toBe(false);
    expect(advance({ current: 'site_registered', action: 'wire_ingestion' }).ok).toBe(false);
    expect(advance({ current: 'in_om', action: 'register_site' }).ok).toBe(false);
    expect(advance({ current: 'commissioning_failed', action: 'register_site' }).ok).toBe(false);
    expect(advance({ current: 'decommissioned', action: 'register_site' }).ok).toBe(false);
  });

  it('handover_om only from energised, not earlier states', () => {
    expect(advance({ current: 'first_telemetry_ok', action: 'handover_om' }).ok).toBe(false);
    expect(advance({ current: 'ingestion_wired', action: 'handover_om' }).ok).toBe(false);
    expect(advance({ current: 'energised', action: 'handover_om' }).ok).toBe(true);
  });
});

describe('slaDueAt', () => {
  it('site_registered gets 14-day SLA', () => {
    const due = slaDueAt('site_registered', NOW);
    expect(new Date(due!).getTime()).toBe(NOW.getTime() + REGISTER_TO_DEVICES_DAYS * DAY_MS);
  });

  it('devices_registered gets 14-day SLA', () => {
    const due = slaDueAt('devices_registered', NOW);
    expect(new Date(due!).getTime()).toBe(NOW.getTime() + DEVICES_TO_INGESTION_DAYS * DAY_MS);
  });

  it('ingestion_wired gets 7-day SLA', () => {
    const due = slaDueAt('ingestion_wired', NOW);
    expect(new Date(due!).getTime()).toBe(NOW.getTime() + INGESTION_TO_TELEMETRY_DAYS * DAY_MS);
  });

  it('first_telemetry_ok gets 30-day SLA', () => {
    const due = slaDueAt('first_telemetry_ok', NOW);
    expect(new Date(due!).getTime()).toBe(NOW.getTime() + TELEMETRY_TO_ENERGISED_DAYS * DAY_MS);
  });

  it('non-SLA states return null', () => {
    expect(slaDueAt('planned', NOW)).toBeNull();
    expect(slaDueAt('energised', NOW)).toBeNull();
    expect(slaDueAt('in_om', NOW)).toBeNull();
    expect(slaDueAt('commissioning_failed', NOW)).toBeNull();
    expect(slaDueAt('decommissioned', NOW)).toBeNull();
  });
});

describe('hasSlaWindow', () => {
  it('true for the four chained-SLA states', () => {
    expect(hasSlaWindow('site_registered')).toBe(true);
    expect(hasSlaWindow('devices_registered')).toBe(true);
    expect(hasSlaWindow('ingestion_wired')).toBe(true);
    expect(hasSlaWindow('first_telemetry_ok')).toBe(true);
  });

  it('false everywhere else', () => {
    expect(hasSlaWindow('planned')).toBe(false);
    expect(hasSlaWindow('energised')).toBe(false);
    expect(hasSlaWindow('in_om')).toBe(false);
    expect(hasSlaWindow('commissioning_failed')).toBe(false);
    expect(hasSlaWindow('decommissioned')).toBe(false);
  });
});

describe('daysUntilDeadline + isSlaBreached', () => {
  it('positive days when deadline in future', () => {
    const future = new Date(NOW.getTime() + 5 * DAY_MS).toISOString();
    expect(daysUntilDeadline(future, NOW)).toBe(5);
    expect(isSlaBreached(future, NOW)).toBe(false);
  });

  it('negative + breached when deadline in past', () => {
    const past = new Date(NOW.getTime() - 3 * DAY_MS).toISOString();
    expect(daysUntilDeadline(past, NOW)).toBe(-3);
    expect(isSlaBreached(past, NOW)).toBe(true);
  });

  it('null deadline is neither breached nor counted', () => {
    expect(daysUntilDeadline(null, NOW)).toBeNull();
    expect(isSlaBreached(null, NOW)).toBe(false);
  });
});

describe('crossesIntoRegulator', () => {
  it('fires on entry into commissioning_failed', () => {
    expect(crossesIntoRegulator('site_registered', 'commissioning_failed')).toBe(true);
    expect(crossesIntoRegulator('ingestion_wired', 'commissioning_failed')).toBe(true);
  });

  it('does not fire on idempotent ticks', () => {
    expect(crossesIntoRegulator('commissioning_failed', 'commissioning_failed')).toBe(false);
  });

  it('does not fire on benign transitions', () => {
    expect(crossesIntoRegulator('planned', 'site_registered')).toBe(false);
    expect(crossesIntoRegulator('energised', 'in_om')).toBe(false);
    expect(crossesIntoRegulator('in_om', 'decommissioned')).toBe(false);
  });
});

describe('STATUS_LABEL', () => {
  it('has a human label for every state', () => {
    expect(STATUS_LABEL.planned).toBeTruthy();
    expect(STATUS_LABEL.site_registered).toBeTruthy();
    expect(STATUS_LABEL.devices_registered).toBeTruthy();
    expect(STATUS_LABEL.ingestion_wired).toBeTruthy();
    expect(STATUS_LABEL.first_telemetry_ok).toBeTruthy();
    expect(STATUS_LABEL.energised).toBeTruthy();
    expect(STATUS_LABEL.in_om).toBeTruthy();
    expect(STATUS_LABEL.commissioning_failed).toBeTruthy();
    expect(STATUS_LABEL.decommissioned).toBeTruthy();
  });
});
