import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isReportable, partyForAction, classForDefect,
  type VendorEscalationStatus, type DefectClass,
} from '../src/utils/vendor-escalation-spec';

describe('W35 vendor escalation chain — state machine', () => {
  it('happy path: filed→triage→decision→oem→field→oem_decision→remediation→closed', () => {
    let s: VendorEscalationStatus = 'filed';
    s = nextStatus(s, 'triage')!;            expect(s).toBe('vendor_triage');
    s = nextStatus(s, 'vendor_decide')!;     expect(s).toBe('vendor_decision');
    s = nextStatus(s, 'escalate_to_oem')!;   expect(s).toBe('escalated_to_oem');
    s = nextStatus(s, 'oem_investigate')!;   expect(s).toBe('oem_field_investigation');
    s = nextStatus(s, 'oem_decide')!;        expect(s).toBe('oem_decision');
    s = nextStatus(s, 'start_remediation')!; expect(s).toBe('remediation');
    s = nextStatus(s, 'close')!;             expect(s).toBe('closed');
  });

  it('vendor resolves at vendor_decision without OEM escalation', () => {
    expect(nextStatus('vendor_decision', 'close')).toBe('closed');
  });

  it('recall reachable from oem_decision and remediation', () => {
    expect(nextStatus('oem_decision', 'issue_recall')).toBe('recall_issued');
    expect(nextStatus('remediation', 'issue_recall')).toBe('recall_issued');
    expect(isTerminal('recall_issued')).toBe(true);
    expect(allowedActions('recall_issued')).toEqual([]);
  });

  it('arbitration reachable from vendor_decision and oem_decision', () => {
    expect(nextStatus('vendor_decision', 'escalate_to_arbitration')).toBe('arbitration');
    expect(nextStatus('oem_decision', 'escalate_to_arbitration')).toBe('arbitration');
    expect(isTerminal('arbitration')).toBe(true);
  });

  it('withdraw accessible from filed, vendor_triage, vendor_decision — not after OEM', () => {
    expect(nextStatus('filed', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('vendor_triage', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('vendor_decision', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('escalated_to_oem', 'withdraw')).toBeNull();
    expect(nextStatus('oem_decision', 'withdraw')).toBeNull();
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('closed')).toEqual([]);
    expect(allowedActions('recall_issued')).toEqual([]);
    expect(allowedActions('arbitration')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('filed', 'oem_decide')).toBeNull();
    expect(nextStatus('vendor_triage', 'issue_recall')).toBeNull();
    expect(nextStatus('escalated_to_oem', 'close')).toBeNull();
    expect(nextStatus('oem_field_investigation', 'start_remediation')).toBeNull();
  });

  it('TRANSITIONS dict is exhaustive across every status', () => {
    const statuses: VendorEscalationStatus[] = [
      'filed', 'vendor_triage', 'vendor_decision', 'escalated_to_oem',
      'oem_field_investigation', 'oem_decision', 'remediation', 'closed',
      'recall_issued', 'arbitration', 'withdrawn',
    ];
    for (const s of statuses) {
      expect(TRANSITIONS[s]).toBeDefined();
    }
  });

  it('allowedActions for filed offers triage / withdraw', () => {
    const actions = allowedActions('filed');
    expect(actions).toContain('triage');
    expect(actions).toContain('withdraw');
  });

  it('allowedActions for oem_decision offers remediation / recall / arbitration / close', () => {
    const actions = allowedActions('oem_decision');
    expect(actions).toContain('start_remediation');
    expect(actions).toContain('issue_recall');
    expect(actions).toContain('escalate_to_arbitration');
    expect(actions).toContain('close');
  });
});

describe('W35 vendor escalation chain — URGENT SLA matrix', () => {
  const base = new Date('2026-01-15T10:00:00Z');

  it('filed has TIGHTER SLA for more severe defect classes', () => {
    const sr = slaDeadlineFor('filed', 'safety_recall', base);
    const fs = slaDeadlineFor('filed', 'fleet_systemic', base);
    const bd = slaDeadlineFor('filed', 'batch_defect', base);
    const su = slaDeadlineFor('filed', 'single_unit', base);
    expect(sr!.getTime()).toBeLessThan(fs!.getTime());
    expect(fs!.getTime()).toBeLessThan(bd!.getTime());
    expect(bd!.getTime()).toBeLessThan(su!.getTime());
  });

  it('safety_recall triage SLA is 4 hours — tightest tier', () => {
    const d = slaDeadlineFor('filed', 'safety_recall', base);
    expect(d!.getTime() - base.getTime()).toBe(4 * 60 * 60_000);
  });

  it('single_unit triage SLA is 7 days — slowest tier', () => {
    const d = slaDeadlineFor('filed', 'single_unit', base);
    expect(d!.getTime() - base.getTime()).toBe(7 * 24 * 60 * 60_000);
  });

  it('remediation window stays tightest for safety_recall', () => {
    expect(SLA_MINUTES.remediation.safety_recall).toBe(7 * 24 * 60);
    expect(SLA_MINUTES.remediation.single_unit).toBeGreaterThan(
      SLA_MINUTES.remediation.safety_recall,
    );
  });

  it('all terminals + zero-minute states return null deadline', () => {
    expect(slaDeadlineFor('closed', 'safety_recall', base)).toBeNull();
    expect(slaDeadlineFor('recall_issued', 'safety_recall', base)).toBeNull();
    expect(slaDeadlineFor('arbitration', 'safety_recall', base)).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'safety_recall', base)).toBeNull();
  });
});

describe('W35 vendor escalation chain — regulator / NRCS crossings', () => {
  const classes: DefectClass[] = ['safety_recall', 'fleet_systemic', 'batch_defect', 'single_unit'];

  it('issue_recall crosses for ALL classes (NRCS recall always notifiable)', () => {
    for (const c of classes) {
      expect(crossesIntoRegulator('issue_recall', c)).toBe(true);
    }
  });

  it('oem_decide crosses for safety_recall only (CPA §61 product-liability)', () => {
    expect(crossesIntoRegulator('oem_decide', 'safety_recall')).toBe(true);
    expect(crossesIntoRegulator('oem_decide', 'fleet_systemic')).toBe(false);
    expect(crossesIntoRegulator('oem_decide', 'batch_defect')).toBe(false);
    expect(crossesIntoRegulator('oem_decide', 'single_unit')).toBe(false);
  });

  it('escalate_to_arbitration crosses safety_recall + fleet_systemic only', () => {
    expect(crossesIntoRegulator('escalate_to_arbitration', 'safety_recall')).toBe(true);
    expect(crossesIntoRegulator('escalate_to_arbitration', 'fleet_systemic')).toBe(true);
    expect(crossesIntoRegulator('escalate_to_arbitration', 'batch_defect')).toBe(false);
    expect(crossesIntoRegulator('escalate_to_arbitration', 'single_unit')).toBe(false);
  });

  it('close crosses safety_recall + fleet_systemic only', () => {
    expect(crossesIntoRegulator('close', 'safety_recall')).toBe(true);
    expect(crossesIntoRegulator('close', 'fleet_systemic')).toBe(true);
    expect(crossesIntoRegulator('close', 'batch_defect')).toBe(false);
    expect(crossesIntoRegulator('close', 'single_unit')).toBe(false);
  });

  it('routine actions (triage, vendor_decide, oem_investigate) never cross', () => {
    for (const c of classes) {
      expect(crossesIntoRegulator('triage', c)).toBe(false);
      expect(crossesIntoRegulator('vendor_decide', c)).toBe(false);
      expect(crossesIntoRegulator('oem_investigate', c)).toBe(false);
      expect(crossesIntoRegulator('escalate_to_oem', c)).toBe(false);
      expect(crossesIntoRegulator('start_remediation', c)).toBe(false);
    }
  });

  it('sla_breach crosses safety_recall + fleet_systemic only', () => {
    expect(slaBreachCrossesIntoRegulator('safety_recall')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('fleet_systemic')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('batch_defect')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('single_unit')).toBe(false);
  });

  it('isReportable: only safety_recall and fleet_systemic', () => {
    expect(isReportable('safety_recall')).toBe(true);
    expect(isReportable('fleet_systemic')).toBe(true);
    expect(isReportable('batch_defect')).toBe(false);
    expect(isReportable('single_unit')).toBe(false);
  });
});

describe('W35 vendor escalation chain — party + classification', () => {
  it('actions map to the contractual party that owns them', () => {
    expect(partyForAction('triage')).toBe('vendor');
    expect(partyForAction('vendor_decide')).toBe('vendor');
    expect(partyForAction('escalate_to_oem')).toBe('operator');
    expect(partyForAction('oem_investigate')).toBe('oem');
    expect(partyForAction('oem_decide')).toBe('oem');
    expect(partyForAction('start_remediation')).toBe('oem');
    expect(partyForAction('issue_recall')).toBe('oem');
    expect(partyForAction('escalate_to_arbitration')).toBe('operator');
    expect(partyForAction('close')).toBe('operator');
    expect(partyForAction('withdraw')).toBe('operator');
  });

  it('classifies defects: safety flag wins, then fleet fraction', () => {
    expect(classForDefect(0.0, true)).toBe('safety_recall');
    expect(classForDefect(0.5, true)).toBe('safety_recall');
    expect(classForDefect(0.25, false)).toBe('fleet_systemic');
    expect(classForDefect(0.1, false)).toBe('fleet_systemic');
    expect(classForDefect(0.05, false)).toBe('batch_defect');
    expect(classForDefect(0.0, false)).toBe('single_unit');
  });
});
