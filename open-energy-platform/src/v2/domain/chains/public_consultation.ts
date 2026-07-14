// public_consultation — a NERSA-style regulatory public consultation lifecycle
// as data. A regulator drafts a consultation on some matter (a tariff, a rule,
// a code amendment), publishes it for a public comment window, records the
// comments received, closes the window, deliberates, then publishes an outcome
// (a determination). The audi-alteram-partem spine is STRUCTURAL, not a guard:
// the ONLY edge into outcome_published is publish_outcome, and it can only fire
// from under_review — which is only reachable via comments_closed → begin_review.
// So an outcome can NEVER be published while the comment window is still open,
// nor before the comments have been closed and reviewed. No guard needed; the
// state graph enforces natural justice.
//
// NO claim key. A consultation is a one-off regulatory process, not exclusive
// consumption of a scarce resource. Comments are recorded on the txn (a self
// edge tallying comments_received), not modelled as their own child txns — a
// per-respondent party mechanism the domain does not yet need (out of scope,
// same call as licence_application).
//
// settles:false — a consultation is a regulatory process, never a payment
// (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const publicConsultation: ChainDecl = {
  key: 'public_consultation',
  noun: 'Public consultation',
  refPrefix: 'PUBL',
  title: (f) => `Public consultation — ${(f.subject as string) ?? 'unnamed matter'}`,
  visibility: 'public',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's10 consultation on licences & rules', effect: 'requires' },
    { instrument: 'NERSA Act 2004', provision: 's10 public participation before a decision', effect: 'requires' },
    { instrument: 'PAJA 2000', provision: 's4 fair procedure for administrative action affecting the public', effect: 'requires' },
  ],
  roles: ['regulator', 'operator'],

  fields: {
    consultation_ref: { type: 'string', label: 'Consultation reference' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    subject: { type: 'string', required: true, label: 'Subject' },
    matter_type: { type: 'string', required: true, label: 'Matter type (tariff/rule/licence/code)' },
    reference_document: { type: 'string', label: 'Reference document ref' },
    comment_period_days: { type: 'number', min: 0, label: 'Comment period (days)' },
    comments_received: { type: 'number', min: 0, label: 'Comments received' },
    outcome_summary: { type: 'string', label: 'Outcome summary' },
    determination_ref: { type: 'string', label: 'Determination ref' },
    // written by derive, never by the client
    published_at: { type: 'string', label: 'Published for comment at' },
    comments_closed_at: { type: 'string', label: 'Comment window closed at' },
    outcome_published_at: { type: 'string', label: 'Outcome published at' },
  },

  initial: 'drafted',

  states: {
    drafted: { label: 'Drafted', terminal: false, holder: 'regulator', sla: { days: 5 } },
    open_for_comment: { label: 'Open for comment', terminal: false, holder: 'regulator', sla: { days: 30 } },
    comments_closed: { label: 'Comments closed', terminal: false, holder: 'regulator', sla: { days: 5 } },
    under_review: { label: 'Under review', terminal: false, holder: 'regulator', sla: { days: 20 } },
    outcome_published: { label: 'Outcome published', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'drafted',
      by: ['regulator', 'operator'],
      actorBecomes: 'regulator',
      label: 'Draft consultation',
      intent: 'primary',
      input: {
        subject: { type: 'string', required: true },
        matter_type: { type: 'string', required: true },
        reference_document: { type: 'string' },
        comment_period_days: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      id: 'publish',
      from: 'drafted',
      to: 'open_for_comment',
      by: ['regulator'],
      label: 'Publish for comment',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ published_at: isoUtc(at) }),
    },
    {
      // self edge: a received public comment is tallied on the txn. Stays in
      // open_for_comment — the window remains open until close_comments fires.
      id: 'record_comment',
      from: 'open_for_comment',
      to: 'open_for_comment',
      by: ['regulator', 'operator'],
      label: 'Record comment received',
      intent: 'secondary',
      guards: [],
      derive: (f, _at: Instant) => ({
        comments_received: (typeof f.comments_received === 'number' ? f.comments_received : 0) + 1,
      }),
    },
    {
      id: 'close_comments',
      from: 'open_for_comment',
      to: 'comments_closed',
      by: ['regulator', 'system'],
      label: 'Close comment window',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ comments_closed_at: isoUtc(at) }),
    },
    {
      id: 'begin_review',
      from: 'comments_closed',
      to: 'under_review',
      by: ['regulator'],
      label: 'Begin review of comments',
      intent: 'primary',
      guards: [],
    },
    {
      // structural fairness gate: the ONLY edge into outcome_published, and it
      // can only fire from under_review — reached only via comments_closed. An
      // outcome therefore cannot publish while the window is open. No guard.
      id: 'publish_outcome',
      from: 'under_review',
      to: 'outcome_published',
      by: ['regulator'],
      label: 'Publish outcome',
      intent: 'primary',
      input: {
        outcome_summary: { type: 'string', required: true },
        determination_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ outcome_published_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'withdraw_draft',
      from: 'drafted',
      to: 'withdrawn',
      by: ['regulator', 'operator'],
      label: 'Withdraw draft',
      intent: 'destructive',
      requiresReason: ['superseded', 'no_longer_required', 'error_in_draft'],
      guards: [],
    },
    {
      id: 'cancel_consultation',
      from: ['open_for_comment', 'comments_closed', 'under_review'],
      to: 'cancelled',
      by: ['regulator'],
      label: 'Cancel consultation',
      intent: 'destructive',
      requiresReason: ['procedural_defect', 'legal_challenge', 'scope_change', 'directive_superseded'],
      guards: [],
    },
  ],

  // comment-window time-bar: an open consultation closes when the published
  // comment period elapses (PAJA fair-notice window; NERSA standard 30 days).
  timers: [{ onState: 'open_for_comment', after: { days: 30 }, fire: 'close_comments', kind: 'time_bar' }],
};
