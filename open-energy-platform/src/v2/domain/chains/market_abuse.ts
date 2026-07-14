// market_abuse — market-abuse surveillance case lifecycle as data.
//
// The exchange market-surveillance function (role `surveillance`, an operator-
// side unit) flags a suspicious trading pattern, triages it, and — if it clears
// triage — runs a formal investigation. An investigation ends in one of two
// substantive dispositions: `substantiated` (proven), which can then be REFERRED
// to the regulator (FSCA/NERSA) for enforcement, or `unfounded` (a documented
// dismissal with a reason). Administrative closure (`closed`) covers no-
// jurisdiction / duplicate drops before a disposition.
//
// STRUCTURAL GATE (permit_to_work pattern): `enforcement_referred` is reachable
// ONLY from `substantiated`, which is reachable ONLY from `investigating`, which
// is reachable ONLY via `open_investigation`. So a case can NEVER be referred to
// enforcement without passing through a formal investigation — the state graph
// enforces due process, no guard needed.
//
// REGULATOR-IN-THE-LOOP (wo pattern): a CRITICAL-severity referral crosses a
// regulatory line. `refer_enforcement` is guarded by regulatorPresentIfCritical
// — a critical case cannot be referred unless the regulator (FSCA/NERSA) is a
// live party on the txn. Non-critical cases refer without that gate. The subject
// gets natural justice: a `subject_representation` self-loop on `investigating`.
//
// settles:false — a market-abuse case is a regulatory/enforcement matter, never
// a payment. Any penalty or disgorgement is instructed on a separate money chain
// after referral; NOTHING in this chain moves or records money (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const marketAbuse: ChainDecl = {
  key: 'market_abuse',
  noun: 'Market abuse case',
  refPrefix: 'MABU',
  title: (f) => `Market abuse — ${(f.abuse_type as string) ?? 'case'} on ${(f.instrument as string) ?? 'unknown'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Financial Markets Act 19 of 2012', provision: 'Ch X market abuse (insider trading, manipulation)', effect: 'creates_offence' },
    { instrument: 'Financial Sector Regulation Act 9 of 2017', provision: 'FSCA investigation & enforcement powers', effect: 'authorises' },
    { instrument: 'NERSA Grid Code', provision: 'market-conduct surveillance', effect: 'requires' },
  ],
  roles: ['surveillance', 'regulator', 'subject', 'operator'],

  fields: {
    case_number: { type: 'string', label: 'Case number' },
    instrument: { type: 'string', required: true, label: 'Traded instrument / market' },
    abuse_type: { type: 'string', required: true, label: 'Abuse type (spoofing/wash_trade/insider/benchmark_manipulation/layering)' },
    priority: { type: 'string', required: true, label: 'Priority (critical/high/normal/low)' },
    alert_source: { type: 'string', label: 'Alert source (automated_surveillance/whistleblower/exchange_referral)' },
    summary: { type: 'string', label: 'Case summary' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (FSCA/NERSA)' },
    subject_party: { type: 'party', role: 'subject', label: 'Subject under investigation' },
    evidence_ref: { type: 'string', label: 'Evidence pack ref' },
    findings_ref: { type: 'string', label: 'Investigation findings ref' },
    representation_ref: { type: 'string', label: 'Subject representation ref' },
    referral_ref: { type: 'string', label: 'Enforcement referral ref' },
    // written by derive, never by the client
    flagged_at: { type: 'string', label: 'Flagged at' },
    triaged_at: { type: 'string', label: 'Triaged at' },
    investigation_opened_at: { type: 'string', label: 'Investigation opened at' },
    substantiated_at: { type: 'string', label: 'Substantiated at' },
    referred_at: { type: 'string', label: 'Referred to enforcement at' },
    unfounded_at: { type: 'string', label: 'Closed unfounded at' },
    closed_at_case: { type: 'string', label: 'Administratively closed at' },
  },

  initial: 'flagged',

  states: {
    flagged: { label: 'Flagged', terminal: false, holder: 'surveillance', sla: { hours: 24 } },
    triage: { label: 'In triage', terminal: false, holder: 'surveillance', sla: { days: 3 } },
    investigating: { label: 'Investigating', terminal: false, holder: 'surveillance', sla: { days: 90 } },
    substantiated: { label: 'Substantiated', terminal: false, holder: 'surveillance', sla: { days: 14 } },
    enforcement_referred: { label: 'Referred to enforcement', terminal: true, holder: 'none' },
    unfounded: { label: 'Unfounded', terminal: true, holder: 'none' },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'flagged',
      by: ['surveillance', 'operator'],
      actorBecomes: 'surveillance',
      label: 'Flag suspicious activity',
      intent: 'primary',
      input: {
        instrument: { type: 'string', required: true },
        abuse_type: { type: 'string', required: true },
        priority: { type: 'string', required: true },
        alert_source: { type: 'string' },
        summary: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
        subject_party: { type: 'party', role: 'subject' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ flagged_at: isoUtc(at) }),
    },

    // --- happy path: surveillance runs triage → investigation → substantiation --
    {
      id: 'begin_triage',
      from: 'flagged',
      to: 'triage',
      by: ['surveillance', 'operator'],
      label: 'Begin triage',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ triaged_at: isoUtc(at) }),
    },
    {
      // structural handoff into the investigation spine — the ONLY edge into
      // `investigating`, and enforcement referral downstream depends on it.
      id: 'open_investigation',
      from: 'triage',
      to: 'investigating',
      by: ['surveillance', 'operator'],
      label: 'Open investigation',
      intent: 'primary',
      input: { evidence_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ investigation_opened_at: isoUtc(at) }),
    },
    {
      // natural justice: the subject may make representations during the
      // investigation. Self-loop — records the representation, holds the state.
      id: 'subject_representation',
      from: 'investigating',
      to: 'investigating',
      by: ['subject'],
      label: 'Submit representation',
      intent: 'secondary',
      input: { representation_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'substantiate',
      from: 'investigating',
      to: 'substantiated',
      by: ['surveillance', 'operator'],
      label: 'Substantiate',
      intent: 'primary',
      input: { findings_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ substantiated_at: isoUtc(at) }),
    },

    // --- dispositions ---------------------------------------------------------
    {
      // critical-severity referral needs the regulator on the txn (wo pattern).
      // Structurally reachable only from `substantiated`, so an investigation
      // always precedes it.
      id: 'refer_enforcement',
      from: 'substantiated',
      to: 'enforcement_referred',
      by: ['surveillance', 'regulator', 'operator'],
      label: 'Refer to enforcement',
      intent: 'primary',
      input: { referral_ref: { type: 'string', required: true } },
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ referred_at: isoUtc(at) }),
    },
    {
      id: 'dismiss',
      from: 'investigating',
      to: 'unfounded',
      by: ['surveillance', 'operator'],
      label: 'Dismiss as unfounded',
      intent: 'destructive',
      requiresReason: ['no_evidence', 'legitimate_activity', 'false_positive', 'insufficient_grounds'],
      guards: [],
      derive: (_f, at: Instant) => ({ unfounded_at: isoUtc(at) }),
    },
    {
      // administrative closure before a substantive disposition.
      id: 'close_case',
      from: ['flagged', 'triage', 'investigating'],
      to: 'closed',
      by: ['surveillance', 'operator', 'system'],
      label: 'Close case',
      intent: 'destructive',
      requiresReason: ['duplicate', 'no_jurisdiction', 'referred_elsewhere', 'time_barred', 'de_minimis', 'triage_sla_expired'],
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_case: isoUtc(at) }),
    },
  ],

  // SLA on triage (surveillance must progress a flagged alert) and a statutory
  // limitation time-bar on a stalled investigation (FMA 2012 pattern — a case
  // not substantiated within a year of opening is time-barred; ppa/ptw pattern).
  timers: [
    { onState: 'triage', after: { days: 3 }, fire: 'close_case', kind: 'sla', reason: 'triage_sla_expired' },
    { onState: 'investigating', after: { days: 365 }, fire: 'close_case', kind: 'time_bar', reason: 'time_barred' },
  ],
};
