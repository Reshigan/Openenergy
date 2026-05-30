import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, slaWindowMinutes, slaMinutesFor, slaDaysRemaining,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isReportable, isMandatoryClass, partyForAction, normaliseChangeClass,
  completionPct, meanTimeToRetrofitHours, predictedFullCoverageDays,
  totalCampaignCapexZar, warrantyCoveragePct, fleetEnergyAtRiskMw,
  urgencyBand, judicialReviewRisk,
  type FcoStatus, type FcoChangeClass,
} from '../src/utils/oem-fco-spec';

describe('W89 OEM FCO campaign — state machine', () => {
  it('clean lifecycle: draft → under_review → approved → population → notification → ack → scheduling → in_progress → completed', () => {
    let s: FcoStatus = 'draft';
    s = nextStatus(s, 'submit_for_review')!;     expect(s).toBe('under_review');
    s = nextStatus(s, 'approve_campaign')!;      expect(s).toBe('approved');
    s = nextStatus(s, 'identify_population')!;   expect(s).toBe('population_identified');
    s = nextStatus(s, 'send_notification')!;     expect(s).toBe('notification_sent');
    s = nextStatus(s, 'acknowledge_receipt')!;   expect(s).toBe('acknowledged');
    s = nextStatus(s, 'schedule_rollout')!;      expect(s).toBe('scheduling');
    s = nextStatus(s, 'start_implementation')!;  expect(s).toBe('in_progress');
    s = nextStatus(s, 'complete_campaign')!;     expect(s).toBe('completed');
    expect(isTerminal('completed')).toBe(true);
  });

  it('suspend / resume loop: in_progress ↔ suspended', () => {
    expect(nextStatus('in_progress', 'suspend_campaign')).toBe('suspended');
    expect(nextStatus('suspended', 'resume_campaign')).toBe('in_progress');
  });

  it('withdraw branch: only from draft or under_review', () => {
    expect(nextStatus('draft', 'withdraw_campaign')).toBe('withdrawn');
    expect(nextStatus('under_review', 'withdraw_campaign')).toBe('withdrawn');
    expect(nextStatus('approved', 'withdraw_campaign')).toBe(null);
    expect(nextStatus('in_progress', 'withdraw_campaign')).toBe(null);
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('cancel branch: every post-approval state to cancelled', () => {
    for (const s of ['approved','population_identified','notification_sent','acknowledged','scheduling','in_progress','suspended'] as FcoStatus[]) {
      expect(nextStatus(s, 'cancel_campaign')).toBe('cancelled');
    }
    expect(nextStatus('draft', 'cancel_campaign')).toBe(null);
    expect(nextStatus('under_review', 'cancel_campaign')).toBe(null);
    expect(nextStatus('completed', 'cancel_campaign')).toBe(null);
    expect(isTerminal('cancelled')).toBe(true);
  });

  it('terminals reject every action', () => {
    expect(nextStatus('completed', 'start_implementation')).toBe(null);
    expect(nextStatus('cancelled', 'resume_campaign')).toBe(null);
    expect(nextStatus('withdrawn', 'submit_for_review')).toBe(null);
  });

  it('rejects out-of-order transitions', () => {
    expect(nextStatus('draft', 'approve_campaign')).toBe(null);
    expect(nextStatus('under_review', 'send_notification')).toBe(null);
    expect(nextStatus('approved', 'start_implementation')).toBe(null);
    expect(nextStatus('notification_sent', 'complete_campaign')).toBe(null);
  });

  it('allowedActions surfaces cancel_campaign across post-approval states', () => {
    for (const s of ['approved','population_identified','notification_sent','acknowledged','scheduling','in_progress','suspended'] as FcoStatus[]) {
      expect(allowedActions(s)).toContain('cancel_campaign');
    }
  });

  it('allowedActions on draft offers submit + withdraw', () => {
    const a = allowedActions('draft');
    expect(a).toContain('submit_for_review');
    expect(a).toContain('withdraw_campaign');
  });
});

describe('W89 — SLA windows (URGENT — mandatory_safety tightest)', () => {
  it('mandatory_safety windows are tighter than mandatory_performance everywhere', () => {
    for (const s of Object.keys(SLA_MINUTES) as FcoStatus[]) {
      const ms = SLA_MINUTES[s].mandatory_safety;
      const mp = SLA_MINUTES[s].mandatory_performance;
      if (ms !== null && mp !== null) {
        expect(ms).toBeLessThanOrEqual(mp);
      }
    }
  });

  it('mandatory_performance tighter than recommended', () => {
    for (const s of Object.keys(SLA_MINUTES) as FcoStatus[]) {
      const mp = SLA_MINUTES[s].mandatory_performance;
      const r = SLA_MINUTES[s].recommended;
      if (mp !== null && r !== null) {
        expect(mp).toBeLessThanOrEqual(r);
      }
    }
  });

  it('recommended tighter than optional', () => {
    for (const s of Object.keys(SLA_MINUTES) as FcoStatus[]) {
      const r = SLA_MINUTES[s].recommended;
      const o = SLA_MINUTES[s].optional;
      if (r !== null && o !== null) {
        expect(r).toBeLessThanOrEqual(o);
      }
    }
  });

  it('terminals carry no deadline', () => {
    for (const t of ['completed','cancelled','withdrawn'] as FcoStatus[]) {
      expect(slaWindowMinutes(t, 'mandatory_safety')).toBeNull();
      expect(slaWindowMinutes(t, 'optional')).toBeNull();
    }
  });

  it('slaDeadlineFor adds minutes to fromMs', () => {
    const t0 = 1_700_000_000_000;
    const d = slaDeadlineFor('under_review', 'mandatory_safety', t0);
    expect(d).toBe(t0 + 60 * 8 * 60 * 1000);
  });

  it('slaDeadlineFor returns null on terminals', () => {
    expect(slaDeadlineFor('completed', 'mandatory_safety', Date.now())).toBeNull();
  });

  it('slaDaysRemaining converts ms delta to days', () => {
    const now = 1_700_000_000_000;
    const inFiveDays = now + 5 * 24 * 60 * 60 * 1000;
    expect(slaDaysRemaining(inFiveDays, now)).toBe(5);
    expect(slaDaysRemaining(null, now)).toBeNull();
  });
});

describe('W89 — FLEET-PROPAGATION regulator signature', () => {
  it('approve_campaign crosses regulator EVERY tier when mandatory_safety only', () => {
    expect(crossesIntoRegulator('approve_campaign', 'mandatory_safety', 1)).toBe(true);
    expect(crossesIntoRegulator('approve_campaign', 'mandatory_safety', 200)).toBe(true);
    expect(crossesIntoRegulator('approve_campaign', 'mandatory_performance', 200)).toBe(false);
    expect(crossesIntoRegulator('approve_campaign', 'recommended', 200)).toBe(false);
    expect(crossesIntoRegulator('approve_campaign', 'optional', 1)).toBe(false);
  });

  it('send_notification crosses regulator EVERY tier when affected_capacity_mw >= 50 (NERSA Grid Code)', () => {
    expect(crossesIntoRegulator('send_notification', 'optional', 49)).toBe(false);
    expect(crossesIntoRegulator('send_notification', 'optional', 50)).toBe(true);
    expect(crossesIntoRegulator('send_notification', 'recommended', 200)).toBe(true);
    expect(crossesIntoRegulator('send_notification', 'mandatory_performance', 200)).toBe(true);
    expect(crossesIntoRegulator('send_notification', 'mandatory_safety', 200)).toBe(true);
  });

  it('send_notification crosses regulator for mandatory tiers under 50 MW', () => {
    expect(crossesIntoRegulator('send_notification', 'mandatory_safety', 5)).toBe(true);
    expect(crossesIntoRegulator('send_notification', 'mandatory_performance', 5)).toBe(true);
    expect(crossesIntoRegulator('send_notification', 'recommended', 5)).toBe(false);
    expect(crossesIntoRegulator('send_notification', 'optional', 5)).toBe(false);
  });

  it('complete_campaign + suspend_campaign + withdraw_campaign cross regulator only for mandatory_safety', () => {
    for (const act of ['complete_campaign','suspend_campaign','withdraw_campaign'] as const) {
      expect(crossesIntoRegulator(act, 'mandatory_safety', 1)).toBe(true);
      expect(crossesIntoRegulator(act, 'mandatory_performance', 1)).toBe(false);
      expect(crossesIntoRegulator(act, 'recommended', 1)).toBe(false);
      expect(crossesIntoRegulator(act, 'optional', 1)).toBe(false);
    }
  });

  it('cancel_campaign crosses regulator EVERY tier always (post-approval cancellation hard line)', () => {
    expect(crossesIntoRegulator('cancel_campaign', 'mandatory_safety', 1)).toBe(true);
    expect(crossesIntoRegulator('cancel_campaign', 'mandatory_performance', 1)).toBe(true);
    expect(crossesIntoRegulator('cancel_campaign', 'recommended', 1)).toBe(true);
    expect(crossesIntoRegulator('cancel_campaign', 'optional', 1)).toBe(true);
  });

  it('silent actions: submit, identify, acknowledge, schedule, start, resume', () => {
    for (const act of ['submit_for_review','identify_population','acknowledge_receipt','schedule_rollout','start_implementation','resume_campaign'] as const) {
      expect(crossesIntoRegulator(act, 'mandatory_safety', 200)).toBe(false);
    }
  });

  it('sla_breached crosses regulator for mandatory tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('mandatory_safety')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('mandatory_performance')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('recommended')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('optional')).toBe(false);
  });

  it('isReportable mirrors crossesIntoRegulator', () => {
    expect(isReportable('approve_campaign', 'mandatory_safety', 1))
      .toBe(crossesIntoRegulator('approve_campaign', 'mandatory_safety', 1));
    expect(isReportable('cancel_campaign', 'optional', 1))
      .toBe(crossesIntoRegulator('cancel_campaign', 'optional', 1));
  });
});

describe('W89 — actor_party derivation', () => {
  it('oem actions (engineering side)', () => {
    for (const a of ['submit_for_review','approve_campaign','withdraw_campaign','identify_population','send_notification'] as const) {
      expect(partyForAction(a)).toBe('oem');
    }
  });

  it('operator actions (fleet rollout side)', () => {
    for (const a of ['acknowledge_receipt','schedule_rollout','start_implementation','complete_campaign','suspend_campaign','resume_campaign','cancel_campaign'] as const) {
      expect(partyForAction(a)).toBe('operator');
    }
  });
});

describe('W89 — change class normalisation', () => {
  it('returns input when valid', () => {
    expect(normaliseChangeClass('mandatory_safety')).toBe('mandatory_safety');
    expect(normaliseChangeClass('optional')).toBe('optional');
  });

  it('falls back when invalid', () => {
    expect(normaliseChangeClass('bogus')).toBe('recommended');
    expect(normaliseChangeClass(undefined, 'mandatory_safety')).toBe('mandatory_safety');
    expect(normaliseChangeClass(null)).toBe('recommended');
  });

  it('isMandatoryClass true only for safety + performance', () => {
    expect(isMandatoryClass('mandatory_safety')).toBe(true);
    expect(isMandatoryClass('mandatory_performance')).toBe(true);
    expect(isMandatoryClass('recommended')).toBe(false);
    expect(isMandatoryClass('optional')).toBe(false);
  });
});

describe('W89 — live battery derivations', () => {
  it('completionPct rounds to 0.01%', () => {
    expect(completionPct(0, 100)).toBe(0);
    expect(completionPct(33, 100)).toBe(33);
    expect(completionPct(33, 99)).toBe(33.33);
    expect(completionPct(100, 100)).toBe(100);
    expect(completionPct(5, 0)).toBe(0);
  });

  it('totalCampaignCapexZar = unit * count rounded', () => {
    expect(totalCampaignCapexZar(120000, 5)).toBe(600000);
    expect(totalCampaignCapexZar(0, 10)).toBe(0);
  });

  it('warrantyCoveragePct', () => {
    expect(warrantyCoveragePct(50, 100)).toBe(50);
    expect(warrantyCoveragePct(100, 100)).toBe(100);
    expect(warrantyCoveragePct(0, 100)).toBe(0);
    expect(warrantyCoveragePct(50, 0)).toBe(0);
  });

  it('fleetEnergyAtRiskMw scales remaining serials', () => {
    expect(fleetEnergyAtRiskMw(100, 0, 10)).toBe(100);
    expect(fleetEnergyAtRiskMw(100, 5, 10)).toBe(50);
    expect(fleetEnergyAtRiskMw(100, 10, 10)).toBe(0);
    expect(fleetEnergyAtRiskMw(50, 5, 0)).toBe(0);
  });

  it('meanTimeToRetrofitHours returns 0 with no completed', () => {
    expect(meanTimeToRetrofitHours(Date.now() - 1000, 0)).toBe(0);
    expect(meanTimeToRetrofitHours(null, 5)).toBe(0);
  });

  it('predictedFullCoverageDays null when rate cannot be derived', () => {
    expect(predictedFullCoverageDays(0, 10, Date.now())).toBeNull();
    expect(predictedFullCoverageDays(5, 10, null)).toBeNull();
    expect(predictedFullCoverageDays(10, 10, Date.now() - 1000)).toBe(0);
  });

  it('judicialReviewRisk 0-100', () => {
    const r1 = judicialReviewRisk('mandatory_safety', 30, true);
    expect(r1).toBeLessThanOrEqual(100);
    expect(r1).toBeGreaterThanOrEqual(0);
    expect(judicialReviewRisk('optional', 100, false)).toBe(0);
    expect(judicialReviewRisk('mandatory_safety', 100, false)).toBe(50);
  });
});

describe('W89 — urgency band by SLA days remaining + class', () => {
  it('over_due when negative', () => {
    expect(urgencyBand(-1, 'mandatory_safety')).toBe('over_due');
    expect(urgencyBand(-10, 'optional')).toBe('over_due');
  });

  it('on_track when null deadline', () => {
    expect(urgencyBand(null, 'mandatory_safety')).toBe('on_track');
  });

  it('urgent threshold tighter for mandatory', () => {
    expect(urgencyBand(0.5, 'mandatory_safety')).toBe('urgent');
    expect(urgencyBand(0.5, 'optional')).toBe('urgent');
    expect(urgencyBand(2, 'mandatory_performance')).toBe('due_soon');
    expect(urgencyBand(2, 'recommended')).toBe('urgent');
  });

  it('on_track for long horizons', () => {
    expect(urgencyBand(60, 'mandatory_safety')).toBe('on_track');
    expect(urgencyBand(180, 'optional')).toBe('on_track');
  });
});
