// consultation_notice — a regulator's public-consultation lifecycle as data.
//
// A regulator (NERSA) drafts a consultation notice on a proposed instrument
// (tariff determination, code amendment, licence condition), publishes it to
// open a comment window, closes the window, reviews the submissions, and
// publishes the decision. The due-process spine is STRUCTURAL: the only path
// to under_review is close_comments (from comment_open), and the only path to
// decision_published is publish_outcome (from under_review). So a decision can
// NEVER be published while the comment period is still open — no guard needed,
// the state graph forbids skipping consultation. That is exactly what PAJA
// public-participation and ERA 2006 consultation require.
//
// No guards fit: none of the 10 registry guards answers a business question
// this chain asks (there is no counterparty deal, no serial range, no credit
// facility). Due process is enforced by the graph + requiresReason on the
// destructive exits.
//
// settles:false — a consultation notice is a regulatory instrument, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const bump = (v: Json | undefined): number => (typeof v === 'number' ? v : 0) + 1;

export const consultationNotice: ChainDecl = {
  key: 'consultation_notice',
  noun: 'Consultation notice',
  refPrefix: 'CN',
  title: (f) => `Consultation notice — ${(f.notice_title as string) ?? 'untitled'}`,
  visibility: 'public',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's4 NERSA consultation on rules & decisions', effect: 'requires' },
    { instrument: 'PAJA 2000', provision: 's4 public participation before administrative action', effect: 'requires' },
  ],
  roles: ['regulator', 'stakeholder', 'operator'],

  fields: {
    notice_number: { type: 'string', label: 'Notice number' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Issuing regulator' },
    affected_party: { type: 'party', role: 'stakeholder', label: 'Primarily-affected stakeholder' },
    notice_title: { type: 'string', required: true, label: 'Notice title' },
    instrument_type: { type: 'string', required: true, label: 'Instrument (tariff_determination/code_amendment/licence_condition)' },
    subject_matter: { type: 'string', required: true, label: 'Subject matter' },
    reference_document_ref: { type: 'string', label: 'Reference document ref' },
    submission_channel: { type: 'string', label: 'Submission channel' },
    comment_period_days: { type: 'number', min: 0, label: 'Comment period (days)' },
    submissions_count: { type: 'number', min: 0, label: 'Submissions received' },
    extend_count: { type: 'number', label: 'Times extended' },
    decision_summary: { type: 'string', label: 'Decision summary' },
    // written by derive, never by the client
    published_at: { type: 'string', label: 'Notice published at' },
    comments_closed_at: { type: 'string', label: 'Comments closed at' },
    decided_at: { type: 'string', label: 'Decision published at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'regulator', sla: { days: 5 } },
    comment_open: { label: 'Comment period open', terminal: false, holder: 'regulator', sla: { days: 30 } },
    under_review: { label: 'Under review', terminal: false, holder: 'regulator', sla: { days: 30 } },
    decision_published: { label: 'Decision published', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['regulator', 'operator'],
      actorBecomes: 'regulator',
      label: 'Draft consultation notice',
      intent: 'primary',
      input: {
        notice_title: { type: 'string', required: true },
        instrument_type: { type: 'string', required: true },
        subject_matter: { type: 'string', required: true },
        reference_document_ref: { type: 'string' },
        affected_party: { type: 'party', role: 'stakeholder' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'publish_notice',
      from: 'draft',
      to: 'comment_open',
      by: ['regulator'],
      label: 'Publish notice & open comment period',
      intent: 'primary',
      input: {
        comment_period_days: { type: 'number', required: true, min: 0 },
        submission_channel: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ published_at: isoUtc(at) }),
    },
    {
      id: 'extend_comment_period',
      from: 'comment_open',
      to: 'comment_open',
      by: ['regulator'],
      label: 'Extend comment period',
      intent: 'secondary',
      input: { comment_period_days: { type: 'number', min: 0 } },
      guards: [],
      derive: (f, _at: Instant) => ({ extend_count: bump(f.extend_count) }),
    },
    {
      // structural due-process gate: the ONLY edge into under_review, from
      // comment_open. A decision cannot be reviewed/published until the window
      // has closed here first.
      id: 'close_comments',
      from: 'comment_open',
      to: 'under_review',
      by: ['regulator', 'system'],
      label: 'Close comment period',
      intent: 'primary',
      input: { submissions_count: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ comments_closed_at: isoUtc(at) }),
    },
    {
      id: 'publish_outcome',
      from: 'under_review',
      to: 'decision_published',
      by: ['regulator'],
      label: 'Publish decision',
      intent: 'primary',
      input: { decision_summary: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ decided_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'withdraw_draft',
      from: 'draft',
      to: 'withdrawn',
      by: ['regulator', 'operator'],
      label: 'Withdraw draft',
      intent: 'destructive',
      requiresReason: ['superseded', 'error_in_draft', 'no_longer_required'],
      guards: [],
    },
    {
      id: 'cancel_consultation',
      from: ['comment_open', 'under_review'],
      to: 'cancelled',
      by: ['regulator'],
      label: 'Cancel consultation',
      intent: 'destructive',
      requiresReason: ['legal_challenge', 'material_change', 'instrument_withdrawn', 'superseded'],
      guards: [],
    },
  ],

  // comment-window time-bar: an open comment period closes on its deadline.
  // record-only stub; the sweep computes the real bar off the state sla days
  // (ppa_contract pattern).
  timers: [{ onState: 'comment_open', after: { days: 30 }, fire: 'close_comments', kind: 'time_bar' }],
};
