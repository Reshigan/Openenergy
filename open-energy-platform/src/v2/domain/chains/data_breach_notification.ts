// data_breach_notification — a POPIA s22 personal-information breach lifecycle
// as data. The responsible party (controller) detects a breach, assesses its
// severity, notifies the Information Regulator, notifies the affected data
// subjects, then closes. The notification spine is STRUCTURAL: close_breach
// leaves ONLY `subjects_notified`, and the ONLY path into `subjects_notified`
// is notify_subjects (from `regulator_notified`, which only notify_regulator
// reaches). So a breach can NEVER be closed before both the Regulator AND the
// affected data subjects have been notified — the state graph enforces the
// s22(1)+s22(2) ordering, no guard needed.
//
// A critical-severity breach crosses to the Information Regulator: assess is
// guarded by regulatorPresentIfCritical (a live regulator party must be on the
// txn). Closure needs a named completeness evidence ref
// (completenessEvidencePresent) — you cannot sign off a breach on nothing.
//
// settles:false — a breach notification is a statutory notice record, never a
// payment (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const dataBreachNotification: ChainDecl = {
  key: 'data_breach_notification',
  noun: 'Data breach notification',
  refPrefix: 'DBN',
  title: (f) => `POPIA breach — ${(f.breach_summary as string) ?? 'summary TBD'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Protection of Personal Information Act 4 of 2013', provision: 's22 notification of security compromises', effect: 'creates_offence' },
    { instrument: 'Protection of Personal Information Act 4 of 2013', provision: 's19 security safeguards on personal information', effect: 'requires' },
  ],
  roles: ['controller', 'regulator', 'operator'],

  fields: {
    breach_ref: { type: 'string', label: 'Breach reference' },
    controller_party: { type: 'party', role: 'controller', label: 'Responsible party' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Information Regulator' },
    breach_summary: { type: 'string', required: true, label: 'Breach summary' },
    priority: { type: 'string', label: 'Severity (routine/elevated/critical)' },
    affected_subject_count: { type: 'number', min: 0, label: 'Affected data subjects' },
    completeness_ref: { type: 'string', label: 'Completeness evidence ref' },
    // written by derive, never by the client
    detected_at: { type: 'string', label: 'Breach detected at' },
    assessed_at: { type: 'string', label: 'Severity assessed at' },
    regulator_notified_at: { type: 'string', label: 'Regulator notified at' },
    subjects_notified_at: { type: 'string', label: 'Data subjects notified at' },
    closed_at_breach: { type: 'string', label: 'Breach closed at' },
  },

  initial: 'detected',

  states: {
    detected: { label: 'Detected', terminal: false, holder: 'controller', sla: { hours: 24 } },
    assessed: { label: 'Assessed', terminal: false, holder: 'controller', sla: { hours: 72 } },
    regulator_notified: { label: 'Regulator notified', terminal: false, holder: 'controller', sla: { days: 3 } },
    subjects_notified: { label: 'Data subjects notified', terminal: false, holder: 'controller', sla: { days: 3 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    false_alarm: { label: 'False alarm', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'detected',
      by: ['controller', 'operator'],
      actorBecomes: 'controller',
      label: 'Record breach',
      intent: 'primary',
      input: {
        breach_summary: { type: 'string', required: true },
        breach_ref: { type: 'string' },
        affected_subject_count: { type: 'number', min: 0 },
        // the Information Regulator attaches at @new (engine synthesises party-
        // typed inputs into guardParties only on the open edge — constraint #7),
        // so regulatorPresentIfCritical on `assess` can see it as a live party.
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ detected_at: isoUtc(at) }),
    },

    // --- happy path -----------------------------------------------------------
    {
      id: 'assess',
      from: 'detected',
      to: 'assessed',
      by: ['controller'],
      label: 'Assess severity',
      intent: 'primary',
      input: {
        priority: { type: 'string' },
      },
      // a critical-severity breach crosses to the Information Regulator: one
      // must be a live party on the txn.
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ assessed_at: isoUtc(at) }),
    },
    {
      id: 'notify_regulator',
      from: 'assessed',
      to: 'regulator_notified',
      by: ['controller'],
      label: 'Notify Information Regulator',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ regulator_notified_at: isoUtc(at) }),
    },
    {
      // structural gate: the ONLY path into subjects_notified, and it can only
      // fire from regulator_notified — which only notify_regulator reaches. So
      // the data subjects are never notified before the Regulator (s22 order).
      id: 'notify_subjects',
      from: 'regulator_notified',
      to: 'subjects_notified',
      by: ['controller'],
      label: 'Notify affected data subjects',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ subjects_notified_at: isoUtc(at) }),
    },
    {
      // structural closure gate: the ONLY edge into `closed`, and it can only
      // fire from subjects_notified — which only notify_subjects reaches. A
      // breach therefore cannot close before both notifications are on record.
      // The named completeness evidence ref is required to sign off.
      id: 'close_breach',
      from: 'subjects_notified',
      to: 'closed',
      by: ['controller'],
      label: 'Close breach',
      intent: 'primary',
      // present-but-not-required so an absent ref surfaces the guard's
      // MISSING_COMPLETENESS_EVIDENCE, not a generic BAD_INPUT (Pattern A).
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ closed_at_breach: isoUtc(at) }),
    },

    // --- exit -----------------------------------------------------------------
    {
      id: 'dismiss_false_alarm',
      from: ['detected', 'assessed'],
      to: 'false_alarm',
      by: ['controller', 'operator'],
      label: 'Dismiss as false alarm',
      intent: 'destructive',
      requiresReason: ['no_personal_information', 'no_compromise', 'duplicate_report', 'internal_test'],
      guards: [],
    },
  ],
};
