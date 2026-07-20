// csat_record — post-support-ticket satisfaction survey lifecycle, as data.
//
// Support closes a ticket, opens a CSAT record, and sends the participant a
// survey. A recorded score is analysed against the tier threshold; a low
// score triggers a follow-up loop before either closing satisfied or
// escalating to management. A survey left unanswered past its response
// window expires unresolved rather than lingering forever (SLA timer).
//
// Structural honesty (no invented guards):
//  - close_escalated is only reachable from `escalated`, and the only edge
//    into `escalated` is escalate_to_management — so a record can never close
//    as escalated without having actually been escalated first.
//  - No guard is needed anywhere here: this is a record-only support workflow
//    (single participant, no money, no compliance gate) — the state graph
//    alone carries the discipline.
//
// settles:false — a CSAT record captures a survey outcome; it never moves
// money or quantum (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const csatRecord: ChainDecl = {
  key: 'csat_record',
  noun: 'CSAT record',
  refPrefix: 'CSAT',
  title: (f) => `CSAT — ${(f.ticket_ref as string) ?? 'ticket TBC'} (${(f.support_tier as string) ?? 'tier TBC'})`,
  visibility: 'party',
  settles: false,
  roles: ['support', 'participant', 'operator'],

  fields: {
    participant_party: { type: 'party', role: 'participant', label: 'Participant' },
    ticket_ref: { type: 'string', label: 'Support ticket ref' },
    support_tier: { type: 'string', label: 'Support tier (p1_critical/p2_high/p3_medium/p4_low)' },
    csat_score: { type: 'number', min: 1, max: 5, label: 'CSAT score (1-5)' },
    csat_comment: { type: 'string', label: 'Participant comment' },
    follow_up_score: { type: 'number', min: 1, max: 5, label: 'Follow-up score (1-5)' },
    // written by derive, never by the client
    survey_sent_at: { type: 'string', label: 'Survey sent at' },
    response_recorded_at: { type: 'string', label: 'Response recorded at' },
    follow_up_sent_at: { type: 'string', label: 'Follow-up sent at' },
    follow_up_recorded_at: { type: 'string', label: 'Follow-up recorded at' },
    escalated_at: { type: 'string', label: 'Escalated at' },
    closed_at: { type: 'string', label: 'Closed at' },
  },

  initial: 'survey_pending',

  states: {
    survey_pending: { label: 'Survey pending', terminal: false, holder: 'support', sla: { days: 1 } },
    survey_sent: { label: 'Survey sent', terminal: false, holder: 'participant', sla: { days: 3 } },
    survey_completed: { label: 'Survey completed', terminal: false, holder: 'support', sla: { days: 1 } },
    score_analysis: { label: 'Score analysis', terminal: false, holder: 'support', sla: { days: 1 } },
    follow_up_sent: { label: 'Follow-up sent', terminal: false, holder: 'participant', sla: { days: 3 } },
    follow_up_received: { label: 'Follow-up received', terminal: false, holder: 'support', sla: { days: 2 } },
    escalated: { label: 'Escalated to management', terminal: false, holder: 'support', sla: { days: 2 } },
    closed_satisfied: { label: 'Closed — satisfied', terminal: true, holder: 'none' },
    closed_escalated: { label: 'Closed — escalated', terminal: true, holder: 'none' },
    no_response: { label: 'No response', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'survey_pending',
      by: ['support', 'operator'],
      actorBecomes: 'support',
      label: 'Open CSAT record',
      intent: 'primary',
      input: {
        participant_party: { type: 'party', role: 'participant' },
        ticket_ref: { type: 'string' },
        support_tier: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'send_survey',
      from: 'survey_pending',
      to: 'survey_sent',
      by: ['support', 'operator'],
      label: 'Send survey',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ survey_sent_at: isoUtc(at) }),
    },
    {
      id: 'record_response',
      from: 'survey_sent',
      to: 'survey_completed',
      by: ['support', 'operator'],
      label: 'Record response',
      intent: 'primary',
      input: {
        csat_score: { type: 'number', required: true, min: 1, max: 5 },
        csat_comment: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ response_recorded_at: isoUtc(at) }),
    },
    {
      id: 'analyse_score',
      from: 'survey_completed',
      to: 'score_analysis',
      by: ['support', 'operator'],
      label: 'Analyse score',
      intent: 'secondary',
      guards: [],
    },
    {
      id: 'send_follow_up',
      from: 'score_analysis',
      to: 'follow_up_sent',
      by: ['support', 'operator'],
      label: 'Send follow-up',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ follow_up_sent_at: isoUtc(at) }),
    },
    {
      id: 'record_follow_up_response',
      from: 'follow_up_sent',
      to: 'follow_up_received',
      by: ['support', 'operator'],
      label: 'Record follow-up response',
      intent: 'primary',
      input: { follow_up_score: { type: 'number', min: 1, max: 5 } },
      guards: [],
      derive: (_f, at: Instant) => ({ follow_up_recorded_at: isoUtc(at) }),
    },
    {
      id: 'escalate_to_management',
      // reachable straight from analysis (severe low score) or after a
      // follow-up that still didn't resolve it.
      from: ['score_analysis', 'follow_up_received'],
      to: 'escalated',
      by: ['support', 'operator'],
      label: 'Escalate to management',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ escalated_at: isoUtc(at) }),
    },
    {
      id: 'close_satisfied',
      from: ['score_analysis', 'follow_up_received'],
      to: 'closed_satisfied',
      by: ['support', 'operator'],
      label: 'Close — satisfied',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into closed_escalated, and it can only fire from
      // escalated — so a record can never close as escalated without
      // actually having gone through escalate_to_management.
      id: 'close_escalated',
      from: 'escalated',
      to: 'closed_escalated',
      by: ['support', 'operator'],
      label: 'Close — escalated',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },
    {
      id: 'expire_no_response',
      from: 'survey_sent',
      to: 'no_response',
      by: ['support', 'operator', 'system'],
      label: 'Expire — no response',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },
  ],

  // a sent survey that nobody answers can't sit open forever — expire it
  // unresolved after the response window lapses.
  timers: [{ onState: 'survey_sent', after: { days: 3 }, fire: 'expire_no_response', kind: 'sla' }],
};
