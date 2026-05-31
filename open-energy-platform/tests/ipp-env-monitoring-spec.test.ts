// Wave 138 — IPP Environmental Monitoring Log spec tests
// NEMA s30 + DFFE EIA conditions + ISO 14001:2015 + REIPPPP environmental compliance
// URGENT SLA: critical 24h (tightest) → baseline 720h (loosest)
// SIGNATURE: flag_exceedance EVERY tier on near_sensitive_receptor/eia_condition_breach/nema_s30_notification;
//            submit_report crosses when floor_dffe_report_required.
import { describe, it, expect } from 'vitest';
import {
  nextStatus,
  isHardTerminal,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  slaDeadlineFor,
  slaHoursRemaining,
  eventTypeFor,
  statusTsCol,
  SLA_HOURS,
  TRANSITIONS,
  HARD_TERMINALS,
  MONITORING_TIER_LABELS,
  MONITORING_CATEGORY_LABELS,
  type EnvMonitoringStatus,
  type EnvMonitoringAction,
  type MonitoringTier,
} from '../src/utils/ipp-env-monitoring-spec';

// ─── Forward path (8 steps) ───────────────────────────────────────────────────
describe('forward path', () => {
  const path: Array<[EnvMonitoringStatus, EnvMonitoringAction, EnvMonitoringStatus]> = [
    ['scheduled',           'start_sampling',     'sampling'],
    ['sampling',            'submit_sample',       'sample_submitted'],
    ['sample_submitted',    'record_results',      'results_received'],
    ['results_received',    'assess_compliance',   'compliance_assessed'],
    ['compliance_assessed', 'draft_report',        'report_drafted'],
    ['report_drafted',      'submit_report',       'report_submitted'],
    ['report_submitted',    'close_monitoring',    'closed'],
  ];

  it.each(path)('%s + %s => %s', (from, action, expected) => {
    expect(nextStatus(from, action)).toBe(expected);
  });

  it('forward path has 7 steps to closed', () => {
    expect(path).toHaveLength(7);
  });

  it('rejects wrong from-state: scheduled + submit_report => null', () => {
    expect(nextStatus('scheduled', 'submit_report')).toBeNull();
  });

  it('rejects wrong from-state: sampling + close_monitoring => null', () => {
    expect(nextStatus('sampling', 'close_monitoring')).toBeNull();
  });

  it('rejects wrong from-state: sample_submitted + assess_compliance => null', () => {
    expect(nextStatus('sample_submitted', 'assess_compliance')).toBeNull();
  });

  it('rejects wrong from-state: report_drafted + close_monitoring => null (must submit_report first)', () => {
    expect(nextStatus('report_drafted', 'close_monitoring')).toBeNull();
  });
});

// ─── Exceedance branch ────────────────────────────────────────────────────────
describe('exceedance branch', () => {
  it('results_received + flag_exceedance => exceedance_flagged', () => {
    expect(nextStatus('results_received', 'flag_exceedance')).toBe('exceedance_flagged');
  });

  it('compliance_assessed + flag_exceedance => exceedance_flagged', () => {
    expect(nextStatus('compliance_assessed', 'flag_exceedance')).toBe('exceedance_flagged');
  });

  it('exceedance_flagged + initiate_corrective_action => corrective_action', () => {
    expect(nextStatus('exceedance_flagged', 'initiate_corrective_action')).toBe('corrective_action');
  });

  it('exceedance_flagged + investigate_exceedance => under_investigation', () => {
    expect(nextStatus('exceedance_flagged', 'investigate_exceedance')).toBe('under_investigation');
  });

  it('corrective_action + resolve_corrective_action => compliance_assessed (re-enters main path)', () => {
    expect(nextStatus('corrective_action', 'resolve_corrective_action')).toBe('compliance_assessed');
  });

  it('under_investigation + resolve_corrective_action => compliance_assessed', () => {
    expect(nextStatus('under_investigation', 'resolve_corrective_action')).toBe('compliance_assessed');
  });

  it('scheduled cannot flag_exceedance (must receive results first)', () => {
    expect(nextStatus('scheduled', 'flag_exceedance')).toBeNull();
  });

  it('sampling cannot flag_exceedance', () => {
    expect(nextStatus('sampling', 'flag_exceedance')).toBeNull();
  });

  it('sample_submitted cannot flag_exceedance (must record_results first)', () => {
    expect(nextStatus('sample_submitted', 'flag_exceedance')).toBeNull();
  });

  it('exceedance_flagged cannot initiate_corrective_action AND investigate simultaneously — pick one', () => {
    // both are valid but distinct paths
    expect(nextStatus('exceedance_flagged', 'initiate_corrective_action')).toBe('corrective_action');
    expect(nextStatus('exceedance_flagged', 'investigate_exceedance')).toBe('under_investigation');
  });

  it('corrective_action cannot flag_exceedance again (already in branch)', () => {
    expect(nextStatus('corrective_action', 'flag_exceedance')).toBeNull();
  });
});

// ─── Cancel branch ────────────────────────────────────────────────────────────
describe('cancel branch', () => {
  it('scheduled + cancel_monitoring => cancelled', () => {
    expect(nextStatus('scheduled', 'cancel_monitoring')).toBe('cancelled');
  });

  it('sampling + cancel_monitoring => cancelled', () => {
    expect(nextStatus('sampling', 'cancel_monitoring')).toBe('cancelled');
  });

  it('sample_submitted cannot cancel_monitoring (too far along)', () => {
    expect(nextStatus('sample_submitted', 'cancel_monitoring')).toBeNull();
  });

  it('results_received cannot cancel_monitoring', () => {
    expect(nextStatus('results_received', 'cancel_monitoring')).toBeNull();
  });

  it('compliance_assessed cannot cancel_monitoring', () => {
    expect(nextStatus('compliance_assessed', 'cancel_monitoring')).toBeNull();
  });

  it('cancelled is a hard terminal', () => {
    expect(isHardTerminal('cancelled')).toBe(true);
  });
});

// ─── Hard terminals ───────────────────────────────────────────────────────────
describe('hard terminals', () => {
  it('closed is a hard terminal', () => {
    expect(isHardTerminal('closed')).toBe(true);
  });

  it('cancelled is a hard terminal', () => {
    expect(isHardTerminal('cancelled')).toBe(true);
  });

  it('HARD_TERMINALS array has 2 entries', () => {
    expect(HARD_TERMINALS).toHaveLength(2);
  });

  it('scheduled is NOT a hard terminal', () => {
    expect(isHardTerminal('scheduled')).toBe(false);
  });

  it('sampling is NOT a hard terminal', () => {
    expect(isHardTerminal('sampling')).toBe(false);
  });

  it('exceedance_flagged is NOT a hard terminal', () => {
    expect(isHardTerminal('exceedance_flagged')).toBe(false);
  });

  it('corrective_action is NOT a hard terminal', () => {
    expect(isHardTerminal('corrective_action')).toBe(false);
  });

  it('under_investigation is NOT a hard terminal', () => {
    expect(isHardTerminal('under_investigation')).toBe(false);
  });

  it('closed blocks all transitions', () => {
    expect(nextStatus('closed', 'start_sampling')).toBeNull();
    expect(nextStatus('closed', 'flag_exceedance')).toBeNull();
    expect(nextStatus('closed', 'close_monitoring')).toBeNull();
    expect(nextStatus('closed', 'cancel_monitoring')).toBeNull();
  });

  it('cancelled blocks all transitions', () => {
    expect(nextStatus('cancelled', 'start_sampling')).toBeNull();
    expect(nextStatus('cancelled', 'flag_exceedance')).toBeNull();
    expect(nextStatus('cancelled', 'cancel_monitoring')).toBeNull();
  });
});

// ─── URGENT SLA polarity ──────────────────────────────────────────────────────
describe('URGENT SLA polarity', () => {
  it('critical = 24h (URGENT — tightest)', () => {
    expect(SLA_HOURS['critical']).toBe(24);
  });

  it('regular = 72h', () => {
    expect(SLA_HOURS['regular']).toBe(72);
  });

  it('routine = 168h', () => {
    expect(SLA_HOURS['routine']).toBe(168);
  });

  it('baseline = 720h (loosest)', () => {
    expect(SLA_HOURS['baseline']).toBe(720);
  });

  it('URGENT polarity: critical < regular < routine < baseline', () => {
    const tiers: MonitoringTier[] = ['critical', 'regular', 'routine', 'baseline'];
    for (let i = 0; i < tiers.length - 1; i++) {
      expect(SLA_HOURS[tiers[i]]).toBeLessThan(SLA_HOURS[tiers[i + 1]]);
    }
  });

  it('SLA_HOURS has all 4 monitoring tiers', () => {
    expect(Object.keys(SLA_HOURS)).toHaveLength(4);
  });

  it('slaDeadlineFor critical = 24h from now', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('critical', from);
    expect(deadline.getTime()).toBe(from.getTime() + 24 * 3600 * 1000);
  });

  it('slaDeadlineFor baseline = 720h from now', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('baseline', from);
    expect(deadline.getTime()).toBe(from.getTime() + 720 * 3600 * 1000);
  });

  it('slaDeadlineFor regular = 72h from now', () => {
    const from = new Date('2026-05-31T00:00:00Z');
    const deadline = slaDeadlineFor('regular', from);
    expect(deadline.getTime()).toBe(from.getTime() + 72 * 3600 * 1000);
  });

  it('slaDeadlineFor routine = 168h from now', () => {
    const from = new Date('2026-05-31T00:00:00Z');
    const deadline = slaDeadlineFor('routine', from);
    expect(deadline.getTime()).toBe(from.getTime() + 168 * 3600 * 1000);
  });

  it('slaHoursRemaining positive when not breached', () => {
    const future = new Date(Date.now() + 100 * 3600 * 1000);
    expect(slaHoursRemaining(future.toISOString(), new Date())).toBeGreaterThan(0);
  });

  it('slaHoursRemaining negative when breached', () => {
    const past = new Date(Date.now() - 10 * 3600 * 1000);
    expect(slaHoursRemaining(past.toISOString(), new Date())).toBeLessThan(0);
  });

  it('slaHoursRemaining null when no deadline', () => {
    expect(slaHoursRemaining(null, new Date())).toBeNull();
  });

  it('slaHoursRemaining exact boundary (0h) returns 0', () => {
    const now = new Date();
    expect(slaHoursRemaining(now.toISOString(), now)).toBe(0);
  });
});

// ─── W138 SIGNATURE: crossesIntoRegulator ────────────────────────────────────
describe('W138 SIGNATURE: crossesIntoRegulator', () => {
  // flag_exceedance with is_near_sensitive_receptor
  it('flag_exceedance + is_near_sensitive_receptor=1 ALWAYS crosses (EVERY tier)', () => {
    expect(crossesIntoRegulator('flag_exceedance', { is_near_sensitive_receptor: 1 })).toBe(true);
  });

  it('flag_exceedance + is_near_sensitive_receptor=true crosses', () => {
    expect(crossesIntoRegulator('flag_exceedance', { is_near_sensitive_receptor: true })).toBe(true);
  });

  // flag_exceedance with floor_eia_condition_breach
  it('flag_exceedance + floor_eia_condition_breach=1 crosses', () => {
    expect(crossesIntoRegulator('flag_exceedance', { floor_eia_condition_breach: 1 })).toBe(true);
  });

  it('flag_exceedance + floor_eia_condition_breach=true crosses', () => {
    expect(crossesIntoRegulator('flag_exceedance', { floor_eia_condition_breach: true })).toBe(true);
  });

  // flag_exceedance with floor_nema_s30_notification
  it('flag_exceedance + floor_nema_s30_notification=1 crosses', () => {
    expect(crossesIntoRegulator('flag_exceedance', { floor_nema_s30_notification: 1 })).toBe(true);
  });

  it('flag_exceedance + floor_nema_s30_notification=true crosses', () => {
    expect(crossesIntoRegulator('flag_exceedance', { floor_nema_s30_notification: true })).toBe(true);
  });

  // flag_exceedance with multiple flags
  it('flag_exceedance + near_receptor + eia_breach crosses', () => {
    expect(crossesIntoRegulator('flag_exceedance', {
      is_near_sensitive_receptor: 1, floor_eia_condition_breach: 1,
    })).toBe(true);
  });

  it('flag_exceedance + all three SIGNATURE flags crosses', () => {
    expect(crossesIntoRegulator('flag_exceedance', {
      is_near_sensitive_receptor: 1,
      floor_eia_condition_breach: 1,
      floor_nema_s30_notification: 1,
    })).toBe(true);
  });

  // flag_exceedance with NO flags — does NOT cross
  it('flag_exceedance with NO flags does NOT cross', () => {
    expect(crossesIntoRegulator('flag_exceedance', {
      is_near_sensitive_receptor: 0,
      floor_eia_condition_breach: 0,
      floor_nema_s30_notification: 0,
    })).toBe(false);
  });

  it('flag_exceedance with undefined args does NOT cross', () => {
    expect(crossesIntoRegulator('flag_exceedance', {})).toBe(false);
  });

  // submit_report with floor_dffe_report_required
  it('submit_report + floor_dffe_report_required=1 crosses', () => {
    expect(crossesIntoRegulator('submit_report', { floor_dffe_report_required: 1 })).toBe(true);
  });

  it('submit_report + floor_dffe_report_required=true crosses', () => {
    expect(crossesIntoRegulator('submit_report', { floor_dffe_report_required: true })).toBe(true);
  });

  it('submit_report WITHOUT floor_dffe_report_required does NOT cross', () => {
    expect(crossesIntoRegulator('submit_report', { floor_dffe_report_required: 0 })).toBe(false);
  });

  it('submit_report with undefined floor_dffe_report_required does NOT cross', () => {
    expect(crossesIntoRegulator('submit_report', {})).toBe(false);
  });

  // submit_report with near_receptor (not a SIGNATURE for submit_report — only for flag_exceedance)
  it('submit_report + near_receptor does NOT cross (wrong action)', () => {
    expect(crossesIntoRegulator('submit_report', { is_near_sensitive_receptor: 1 })).toBe(false);
  });

  // other actions never cross
  it('start_sampling never crosses', () => {
    expect(crossesIntoRegulator('start_sampling', { is_near_sensitive_receptor: 1 })).toBe(false);
  });

  it('assess_compliance never crosses even with all flags', () => {
    expect(crossesIntoRegulator('assess_compliance', {
      is_near_sensitive_receptor: 1,
      floor_eia_condition_breach: 1,
      floor_nema_s30_notification: 1,
      floor_dffe_report_required: 1,
    })).toBe(false);
  });

  it('record_results never crosses', () => {
    expect(crossesIntoRegulator('record_results', { floor_nema_s30_notification: 1 })).toBe(false);
  });

  it('close_monitoring never crosses even with all flags', () => {
    expect(crossesIntoRegulator('close_monitoring', {
      is_near_sensitive_receptor: 1,
      floor_eia_condition_breach: 1,
      floor_nema_s30_notification: 1,
      floor_dffe_report_required: 1,
    })).toBe(false);
  });

  it('initiate_corrective_action never crosses', () => {
    expect(crossesIntoRegulator('initiate_corrective_action', { is_near_sensitive_receptor: 1 })).toBe(false);
  });

  it('investigate_exceedance never crosses', () => {
    expect(crossesIntoRegulator('investigate_exceedance', { floor_eia_condition_breach: 1 })).toBe(false);
  });

  it('resolve_corrective_action never crosses', () => {
    expect(crossesIntoRegulator('resolve_corrective_action', { floor_nema_s30_notification: 1 })).toBe(false);
  });

  it('cancel_monitoring never crosses', () => {
    expect(crossesIntoRegulator('cancel_monitoring', { floor_dffe_report_required: 1 })).toBe(false);
  });

  it('flag_overdue never crosses even with all flags', () => {
    expect(crossesIntoRegulator('flag_overdue', {
      is_near_sensitive_receptor: 1,
      floor_eia_condition_breach: 1,
      floor_nema_s30_notification: 1,
      floor_dffe_report_required: 1,
    })).toBe(false);
  });
});

// ─── slaBreachCrossesIntoRegulator ────────────────────────────────────────────
describe('slaBreachCrossesIntoRegulator', () => {
  it('critical + is_near_sensitive_receptor=1 crosses', () => {
    expect(slaBreachCrossesIntoRegulator('critical', { is_near_sensitive_receptor: 1 })).toBe(true);
  });

  it('critical + is_near_sensitive_receptor=true crosses', () => {
    expect(slaBreachCrossesIntoRegulator('critical', { is_near_sensitive_receptor: true })).toBe(true);
  });

  it('critical + floor_eia_condition_breach=1 crosses', () => {
    expect(slaBreachCrossesIntoRegulator('critical', { floor_eia_condition_breach: 1 })).toBe(true);
  });

  it('any tier + floor_eia_condition_breach crosses (universal hard floor)', () => {
    expect(slaBreachCrossesIntoRegulator('regular', { floor_eia_condition_breach: 1 })).toBe(true);
    expect(slaBreachCrossesIntoRegulator('routine', { floor_eia_condition_breach: 1 })).toBe(true);
    expect(slaBreachCrossesIntoRegulator('baseline', { floor_eia_condition_breach: 1 })).toBe(true);
  });

  it('regular + near_receptor does NOT cross (only critical triggers near_receptor sla crossing)', () => {
    expect(slaBreachCrossesIntoRegulator('regular', { is_near_sensitive_receptor: 1 })).toBe(false);
  });

  it('routine + near_receptor does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('routine', { is_near_sensitive_receptor: 1 })).toBe(false);
  });

  it('baseline + near_receptor does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('baseline', { is_near_sensitive_receptor: 1 })).toBe(false);
  });

  it('critical with NO flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('critical', {
      is_near_sensitive_receptor: 0, floor_eia_condition_breach: 0,
    })).toBe(false);
  });

  it('critical with undefined flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('critical', {})).toBe(false);
  });

  it('baseline with no flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('baseline', {})).toBe(false);
  });

  it('critical + near_receptor + eia_breach crosses (multiple flags)', () => {
    expect(slaBreachCrossesIntoRegulator('critical', {
      is_near_sensitive_receptor: 1, floor_eia_condition_breach: 1,
    })).toBe(true);
  });
});

// ─── statusTsCol: all 12 states ───────────────────────────────────────────────
describe('statusTsCol', () => {
  const cases: Array<[EnvMonitoringStatus, string]> = [
    ['scheduled',           'scheduled_at'],
    ['sampling',            'sampling_at'],
    ['sample_submitted',    'sample_submitted_at'],
    ['results_received',    'results_received_at'],
    ['compliance_assessed', 'compliance_assessed_at'],
    ['report_drafted',      'report_drafted_at'],
    ['report_submitted',    'report_submitted_at'],
    ['closed',              'closed_at'],
    ['exceedance_flagged',  'exceedance_flagged_at'],
    ['corrective_action',   'corrective_action_at'],
    ['under_investigation', 'under_investigation_at'],
    ['cancelled',           'cancelled_at'],
  ];

  it.each(cases)('statusTsCol(%s) = %s', (status, expected) => {
    expect(statusTsCol(status)).toBe(expected);
  });

  it('covers all 12 states', () => {
    expect(cases).toHaveLength(12);
  });
});

// ─── eventTypeFor: all 13 actions ────────────────────────────────────────────
describe('eventTypeFor', () => {
  const cases: Array<[EnvMonitoringAction, string]> = [
    ['start_sampling',              'ipp_env_monitoring.start_sampling'],
    ['submit_sample',               'ipp_env_monitoring.submit_sample'],
    ['record_results',              'ipp_env_monitoring.record_results'],
    ['assess_compliance',           'ipp_env_monitoring.assess_compliance'],
    ['draft_report',                'ipp_env_monitoring.draft_report'],
    ['submit_report',               'ipp_env_monitoring.submit_report'],
    ['close_monitoring',            'ipp_env_monitoring.close_monitoring'],
    ['flag_exceedance',             'ipp_env_monitoring.flag_exceedance'],
    ['initiate_corrective_action',  'ipp_env_monitoring.initiate_corrective_action'],
    ['investigate_exceedance',      'ipp_env_monitoring.investigate_exceedance'],
    ['resolve_corrective_action',   'ipp_env_monitoring.resolve_corrective_action'],
    ['cancel_monitoring',           'ipp_env_monitoring.cancel_monitoring'],
    ['flag_overdue',                'ipp_env_monitoring.flag_overdue'],
  ];

  it.each(cases)('eventTypeFor(%s) = %s', (action, expected) => {
    expect(eventTypeFor(action)).toBe(expected);
  });

  it('all 13 actions are mapped', () => {
    expect(cases).toHaveLength(13);
  });
});

// ─── MONITORING_TIER_LABELS ───────────────────────────────────────────────────
describe('MONITORING_TIER_LABELS', () => {
  it('has 4 monitoring tier labels', () => {
    expect(Object.keys(MONITORING_TIER_LABELS)).toHaveLength(4);
  });

  it('critical = Critical', () => {
    expect(MONITORING_TIER_LABELS['critical']).toBe('Critical');
  });

  it('regular = Regular', () => {
    expect(MONITORING_TIER_LABELS['regular']).toBe('Regular');
  });

  it('routine = Routine', () => {
    expect(MONITORING_TIER_LABELS['routine']).toBe('Routine');
  });

  it('baseline = Baseline', () => {
    expect(MONITORING_TIER_LABELS['baseline']).toBe('Baseline');
  });
});

// ─── MONITORING_CATEGORY_LABELS ───────────────────────────────────────────────
describe('MONITORING_CATEGORY_LABELS', () => {
  it('has 10 monitoring category labels', () => {
    expect(Object.keys(MONITORING_CATEGORY_LABELS)).toHaveLength(10);
  });

  it('air_quality = Air quality', () => {
    expect(MONITORING_CATEGORY_LABELS['air_quality']).toBe('Air quality');
  });

  it('water_quality = Water quality', () => {
    expect(MONITORING_CATEGORY_LABELS['water_quality']).toBe('Water quality');
  });

  it('noise = Noise', () => {
    expect(MONITORING_CATEGORY_LABELS['noise']).toBe('Noise');
  });

  it('dust = Dust', () => {
    expect(MONITORING_CATEGORY_LABELS['dust']).toBe('Dust');
  });

  it('waste = Waste', () => {
    expect(MONITORING_CATEGORY_LABELS['waste']).toBe('Waste');
  });

  it('land = Land', () => {
    expect(MONITORING_CATEGORY_LABELS['land']).toBe('Land');
  });

  it('biodiversity = Biodiversity', () => {
    expect(MONITORING_CATEGORY_LABELS['biodiversity']).toBe('Biodiversity');
  });

  it('stormwater = Stormwater', () => {
    expect(MONITORING_CATEGORY_LABELS['stormwater']).toBe('Stormwater');
  });

  it('groundwater = Groundwater', () => {
    expect(MONITORING_CATEGORY_LABELS['groundwater']).toBe('Groundwater');
  });

  it('visual = Visual', () => {
    expect(MONITORING_CATEGORY_LABELS['visual']).toBe('Visual');
  });
});

// ─── TRANSITIONS record completeness ──────────────────────────────────────────
describe('TRANSITIONS record', () => {
  it('has 13 actions', () => {
    expect(Object.keys(TRANSITIONS)).toHaveLength(13);
  });

  it('all actions have from (array) and to (string)', () => {
    for (const [, t] of Object.entries(TRANSITIONS)) {
      expect(Array.isArray(t.from)).toBe(true);
      expect(typeof t.to).toBe('string');
    }
  });

  it('flag_exceedance has two valid from-states (results_received + compliance_assessed)', () => {
    const t = TRANSITIONS['flag_exceedance'];
    expect(t.from).toContain('results_received');
    expect(t.from).toContain('compliance_assessed');
  });

  it('resolve_corrective_action has two valid from-states (corrective_action + under_investigation)', () => {
    const t = TRANSITIONS['resolve_corrective_action'];
    expect(t.from).toContain('corrective_action');
    expect(t.from).toContain('under_investigation');
  });

  it('cancel_monitoring has two valid from-states (scheduled + sampling)', () => {
    const t = TRANSITIONS['cancel_monitoring'];
    expect(t.from).toContain('scheduled');
    expect(t.from).toContain('sampling');
  });
});

// ─── flag_overdue cron action ─────────────────────────────────────────────────
describe('flag_overdue cron action', () => {
  const openStates: EnvMonitoringStatus[] = [
    'scheduled', 'sampling', 'sample_submitted', 'results_received',
    'compliance_assessed', 'report_drafted', 'report_submitted',
    'exceedance_flagged', 'corrective_action', 'under_investigation',
  ];

  it.each(openStates)('%s + flag_overdue returns current state unchanged', (status) => {
    expect(nextStatus(status, 'flag_overdue')).toBe(status);
  });

  it('flag_overdue from closed (terminal) returns null', () => {
    expect(nextStatus('closed', 'flag_overdue')).toBeNull();
  });

  it('flag_overdue from cancelled (terminal) returns null', () => {
    expect(nextStatus('cancelled', 'flag_overdue')).toBeNull();
  });

  it('flag_overdue does not cross into regulator', () => {
    expect(crossesIntoRegulator('flag_overdue', {
      is_near_sensitive_receptor: 1,
      floor_eia_condition_breach: 1,
      floor_nema_s30_notification: 1,
      floor_dffe_report_required: 1,
    })).toBe(false);
  });

  it('10 open states covered by flag_overdue', () => {
    expect(openStates).toHaveLength(10);
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────────
describe('edge cases', () => {
  it('null from invalid action string', () => {
    expect(nextStatus('scheduled', 'invalid_action' as EnvMonitoringAction)).toBeNull();
  });

  it('step-skip enforced: scheduled cannot jump to results_received', () => {
    expect(nextStatus('scheduled', 'record_results')).toBeNull();
  });

  it('step-skip enforced: sampling cannot jump to compliance_assessed', () => {
    expect(nextStatus('sampling', 'assess_compliance')).toBeNull();
  });

  it('two valid branches from results_received: assess or flag', () => {
    expect(nextStatus('results_received', 'assess_compliance')).toBe('compliance_assessed');
    expect(nextStatus('results_received', 'flag_exceedance')).toBe('exceedance_flagged');
  });

  it('two valid branches from compliance_assessed: draft or flag', () => {
    expect(nextStatus('compliance_assessed', 'draft_report')).toBe('report_drafted');
    expect(nextStatus('compliance_assessed', 'flag_exceedance')).toBe('exceedance_flagged');
  });

  it('two valid branches from exceedance_flagged: corrective or investigate', () => {
    expect(nextStatus('exceedance_flagged', 'initiate_corrective_action')).toBe('corrective_action');
    expect(nextStatus('exceedance_flagged', 'investigate_exceedance')).toBe('under_investigation');
  });

  it('crossesIntoRegulator: near_receptor + eia_breach both set => crosses once (boolean)', () => {
    expect(crossesIntoRegulator('flag_exceedance', {
      is_near_sensitive_receptor: 1, floor_eia_condition_breach: 1,
    })).toBe(true);
  });

  it('slaBreachCrossesIntoRegulator: regular tier is NOT the tightest tier', () => {
    // regular tier without eia_breach should NOT cross
    expect(slaBreachCrossesIntoRegulator('regular', {
      is_near_sensitive_receptor: 1, floor_eia_condition_breach: 0,
    })).toBe(false);
  });

  it('URGENT polarity consistency: critical 24h is strictly less than regular 72h', () => {
    expect(SLA_HOURS.critical).toBeLessThan(SLA_HOURS.regular);
    expect(SLA_HOURS.regular).toBeLessThan(SLA_HOURS.routine);
    expect(SLA_HOURS.routine).toBeLessThan(SLA_HOURS.baseline);
  });
});
