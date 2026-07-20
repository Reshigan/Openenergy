// ipp_construction_diary — daily IPP construction site diary as data (W143;
// JBCC 6.2 cl.8.13 / NEC4 cl.25 daily-record practice, evidencing the same
// REIPPPP Implementation Agreement construction milestones ipp_schedule tracks).
//
// A contractor opens the day, logs it, and submits for employer review. The
// employer notes receipt, an independent engineer reviews, the employer
// countersigns — locking the entry in as the contractual daily record — and it
// is archived into the permanent project file. A disputed entry runs a short
// correction spine (dispute → resolution_pending → correction_accepted) before
// re-joining the countersign step; countersign is reachable from EITHER a clean
// IE review OR an accepted correction, never from a raw dispute — the state
// graph forbids signing off an unresolved dispute.
//
// A critical-delay day or one with a safety incident is stamped `priority:
// critical` at open time; both submitting and disputing such a day cross the
// regulator queue (regulatorPresentIfCritical), matching the legacy
// cascadeHints on submit_diary/dispute_diary.
//
// settles:false — a site diary is a construction-record chain (quantumCol is
// null in the v1 DDL); no ZAR moves here (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

export const ippConstructionDiary: ChainDecl = {
  key: 'ipp_construction_diary',
  noun: 'IPP construction site diary entry',
  refPrefix: 'SD',
  title: (f) =>
    `Site diary ${(f.diary_date as string) ?? 'undated'} — ${(f.project_name as string) ?? (f.project_id as string) ?? 'project'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement construction milestones', effect: 'requires' },
  ],
  roles: ['epc_contractor', 'ipp_developer', 'independent_engineer', 'regulator'],

  fields: {
    diary_ref: { type: 'string', label: 'Diary ref' },
    project_id: { type: 'string', required: true, label: 'Project' },
    project_name: { type: 'string', label: 'Project name' },
    diary_date: { type: 'string', required: true, label: 'Diary date' },
    day_type: { type: 'string', label: 'Day type' },
    weather_am: { type: 'string', label: 'Weather (AM)' },
    workforce_total: { type: 'number', min: 0, label: 'Workforce total' },
    work_stoppages_minutes: { type: 'number', min: 0, label: 'Work stoppages (minutes)' },
    floor_has_safety_incident: { type: 'boolean', label: 'Safety incident occurred' },
    progress_narrative: { type: 'string', label: 'Progress narrative' },
    safety_observations: { type: 'string', label: 'Safety observations' },
    delay_description: { type: 'string', label: 'Delay description' },
    delay_duration_hours: { type: 'number', min: 0, label: 'Delay duration (hours)' },
    contractor_signatory: { type: 'string', label: 'Contractor signatory' },
    employer_signatory: { type: 'string', label: 'Employer signatory' },
    ie_reviewer: { type: 'string', label: 'IE reviewer' },
    dispute_reason: { type: 'string', label: 'Dispute reason' },
    // derive-stamped, never client-set
    priority: { type: 'string', label: 'Priority tier (derived)' },
    submitted_at: { type: 'string', label: 'Submitted at' },
    countersigned_at: { type: 'string', label: 'Countersigned at' },
    archived_at_diary: { type: 'string', label: 'Archived at' },
    employer_party: { type: 'party', role: 'ipp_developer', label: 'Employer (IPP developer)' },
    ie_party: { type: 'party', role: 'independent_engineer', label: 'Independent engineer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
  },

  initial: 'open',

  states: {
    open: { label: 'Open (day in progress)', terminal: false, holder: 'epc_contractor', sla: { hours: 24 } },
    late_submission: { label: 'Late submission', terminal: false, holder: 'epc_contractor', sla: { hours: 24 } },
    submitted: { label: 'Submitted for employer review', terminal: false, holder: 'ipp_developer', sla: { hours: 24 } },
    employer_noted: { label: 'Employer noted receipt', terminal: false, holder: 'independent_engineer', sla: { days: 2 } },
    ie_reviewed: { label: 'Independent engineer reviewed', terminal: false, holder: 'ipp_developer', sla: { days: 1 } },
    disputed: { label: 'Disputed', terminal: false, holder: 'epc_contractor', sla: { days: 3 } },
    resolution_pending: { label: 'Resolution pending', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    correction_accepted: { label: 'Correction accepted', terminal: false, holder: 'ipp_developer' },
    countersigned: { label: 'Countersigned', terminal: false, holder: 'epc_contractor' },
    archived: { label: 'Archived', terminal: true, holder: 'none' },
    missed: { label: 'Missed (never submitted)', terminal: true, holder: 'none' },
    voided: { label: 'Voided', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'open',
      by: ['epc_contractor', 'ipp_developer'],
      actorBecomes: 'epc_contractor',
      label: 'Open site diary',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        project_name: { type: 'string' },
        diary_date: { type: 'string', required: true },
        day_type: { type: 'string' },
        diary_ref: { type: 'string' },
        weather_am: { type: 'string' },
        workforce_total: { type: 'number', min: 0 },
        work_stoppages_minutes: { type: 'number', min: 0 },
        floor_has_safety_incident: { type: 'boolean' },
        employer_party: { type: 'party', role: 'ipp_developer' },
        ie_party: { type: 'party', role: 'independent_engineer' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      // a critical-delay day or a safety incident stamps priority:critical, read
      // by later transitions' regulatorPresentIfCritical guard.
      derive: (f: Record<string, Json>) => ({
        priority: f.day_type === 'critical_delay' || f.floor_has_safety_incident === true ? 'critical' : 'normal',
      }),
    },
    {
      id: 'submit_diary',
      from: ['open', 'late_submission'],
      to: 'submitted',
      by: ['epc_contractor'],
      label: 'Submit diary',
      intent: 'primary',
      input: {
        progress_narrative: { type: 'string', required: true },
        safety_observations: { type: 'string' },
        delay_description: { type: 'string' },
        delay_duration_hours: { type: 'number', min: 0 },
        contractor_signatory: { type: 'string', required: true },
      },
      guards: ['regulatorPresentIfCritical'],
      derive: (_f: Record<string, Json>, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      // SLA sweep: a day left open past its submission window goes late but the
      // contractor can still submit from here (see submit_diary's `from`).
      id: 'mark_late',
      from: 'open',
      to: 'late_submission',
      by: ['system'],
      label: 'Mark late (SLA breach)',
      intent: 'secondary',
      guards: [],
    },
    {
      id: 'note_receipt',
      from: 'submitted',
      to: 'employer_noted',
      by: ['ipp_developer'],
      label: 'Note receipt',
      intent: 'secondary',
      input: { employer_signatory: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'ie_review',
      from: 'employer_noted',
      to: 'ie_reviewed',
      by: ['independent_engineer'],
      label: 'Independent engineer review',
      intent: 'primary',
      input: { ie_reviewer: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'dispute_diary',
      from: ['submitted', 'employer_noted', 'ie_reviewed', 'countersigned'],
      to: 'disputed',
      by: ['ipp_developer', 'epc_contractor'],
      label: 'Dispute entries',
      intent: 'destructive',
      input: { dispute_reason: { type: 'string', required: true } },
      requiresReason: [
        'progress_inaccurate',
        'delay_attribution_disputed',
        'safety_record_disputed',
        'workforce_count_disputed',
        'weather_record_disputed',
      ],
      guards: ['regulatorPresentIfCritical'],
    },
    {
      id: 'resolve_dispute',
      from: 'disputed',
      to: 'resolution_pending',
      by: ['epc_contractor'],
      label: 'Submit correction',
      intent: 'primary',
      input: { progress_narrative: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'accept_correction',
      from: 'resolution_pending',
      to: 'correction_accepted',
      by: ['ipp_developer'],
      label: 'Accept correction',
      intent: 'primary',
      guards: [],
    },
    {
      // reachable from a clean IE review OR an accepted correction — never from
      // a raw dispute, so an unresolved dispute can never be signed off.
      id: 'countersign',
      from: ['ie_reviewed', 'correction_accepted'],
      to: 'countersigned',
      by: ['ipp_developer'],
      label: 'Countersign',
      intent: 'primary',
      input: { employer_signatory: { type: 'string', required: true } },
      guards: [],
      derive: (_f: Record<string, Json>, at: Instant) => ({ countersigned_at: isoUtc(at) }),
    },
    {
      id: 'archive_diary',
      from: 'countersigned',
      to: 'archived',
      by: ['ipp_developer', 'epc_contractor'],
      label: 'Archive diary',
      intent: 'primary',
      guards: [],
      derive: (_f: Record<string, Json>, at: Instant) => ({ archived_at_diary: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'void_diary',
      from: ['open', 'late_submission', 'submitted', 'employer_noted', 'ie_reviewed', 'disputed', 'resolution_pending', 'correction_accepted'],
      to: 'voided',
      by: ['epc_contractor', 'ipp_developer'],
      label: 'Void diary entry',
      intent: 'destructive',
      requiresReason: ['duplicate_entry', 'entered_in_error', 'superseded_diary', 'project_suspended'],
      guards: [],
    },
    {
      // SLA time-bar: a day never submitted after going late is written off.
      id: 'mark_missed',
      from: 'late_submission',
      to: 'missed',
      by: ['system'],
      label: 'Mark missed (diary never submitted)',
      intent: 'destructive',
      requiresReason: ['diary_never_submitted'],
      guards: [],
    },
  ],

  timers: [
    { onState: 'open', after: { hours: 24 }, fire: 'mark_late', kind: 'sla' },
    { onState: 'late_submission', after: { hours: 24 }, fire: 'mark_missed', kind: 'time_bar', reason: 'diary_never_submitted' },
  ],
};
