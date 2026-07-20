// carbon_credit_rating — credit-quality rating lifecycle for carbon credits.
//
// A rater (carbon fund analyst) scores a credit/project across the four
// integrity dimensions (additionality, permanence, leakage control,
// co-benefits), an independent reviewer runs committee review, and only then
// is a rating published. The integrity spine is STRUCTURAL, not a guard:
// publish_rating leaves ONLY committee_review, and the only path into
// committee_review is submit_for_review from under_assessment. So a rating can
// NEVER be published without independent committee review — no guard needed,
// the state graph enforces it.
//
// The composite score + letter grade are pure derivations off the four numeric
// dimension scores (no clock, no env). settles:false — a rating is an opinion /
// analytical control, never a payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure letter-grade bucketing off the 0..10 composite. No clock, no env.
const grade = (composite: number | null): string => {
  if (composite === null) return 'unrated';
  if (composite >= 9) return 'AAA';
  if (composite >= 8) return 'AA';
  if (composite >= 7) return 'A';
  if (composite >= 6) return 'BBB';
  if (composite >= 5) return 'BB';
  if (composite >= 4) return 'B';
  return 'C';
};

// mean of the four integrity dimensions when all are present, else null.
const composite = (f: Record<string, Json>): number | null => {
  const dims = [f.additionality_score, f.permanence_score, f.leakage_control_score, f.cobenefits_score];
  if (!dims.every((d) => typeof d === 'number')) return null;
  return (dims as number[]).reduce((a, b) => a + b, 0) / dims.length;
};

export const carbonCreditRating: ChainDecl = {
  key: 'carbon_credit_rating',
  noun: 'Carbon credit rating',
  refPrefix: 'CARB',
  title: (f) => `Credit rating ${(f.credit_ref as string) ?? 'unspecified'} — ${(f.rating_grade as string) ?? 'unrated'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ICVCM Core Carbon Principles', provision: 'assessment framework (additionality, permanence, no double-count)', effect: 'requires' },
    { instrument: 'JSE-SRL', provision: 'listed environmental instrument quality disclosure', effect: 'requires' },
  ],
  roles: ['rater', 'reviewer', 'subject', 'regulator'],

  fields: {
    rating_number: { type: 'string', label: 'Rating number' },
    rater_party: { type: 'party', role: 'rater', label: 'Rating analyst' },
    reviewer_party: { type: 'party', role: 'reviewer', label: 'Committee reviewer' },
    subject_party: { type: 'party', role: 'subject', label: 'Project sponsor (subject)' },
    credit_ref: { type: 'string', required: true, label: 'Credit / project reference' },
    registry: { type: 'string', label: 'Registry (Verra / Gold Standard / Art 6.4)' },
    methodology: { type: 'string', required: true, label: 'Methodology' },
    vintage_year: { type: 'number', label: 'Vintage year' },
    // 0..10 integrity dimensions, set at assessment
    additionality_score: { type: 'number', min: 0, max: 10, label: 'Additionality (0-10)' },
    permanence_score: { type: 'number', min: 0, max: 10, label: 'Permanence (0-10)' },
    leakage_control_score: { type: 'number', min: 0, max: 10, label: 'Leakage control (0-10)' },
    cobenefits_score: { type: 'number', min: 0, max: 10, label: 'Co-benefits (0-10)' },
    // written by derive, never by the client
    composite_score: { type: 'number', label: 'Composite score' },
    rating_grade: { type: 'string', label: 'Rating grade' },
    published_at: { type: 'string', label: 'Published at' },
  },

  initial: 'rating_requested',

  states: {
    rating_requested: { label: 'Rating requested', terminal: false, holder: 'rater', sla: { hours: 24 } },
    under_assessment: { label: 'Under assessment', terminal: false, holder: 'rater', sla: { days: 5 } },
    committee_review: { label: 'Committee review', terminal: false, holder: 'reviewer', sla: { days: 3 } },
    published: { label: 'Published', terminal: true, holder: 'none' },
    rating_declined: { label: 'Declined', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'rating_requested',
      by: ['rater'],
      actorBecomes: 'rater',
      label: 'Request rating',
      intent: 'primary',
      input: {
        credit_ref: { type: 'string', required: true },
        registry: { type: 'string' },
        methodology: { type: 'string', required: true },
        vintage_year: { type: 'number' },
        reviewer_party: { type: 'party', role: 'reviewer' },
        subject_party: { type: 'party', role: 'subject' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'begin_assessment',
      from: 'rating_requested',
      to: 'under_assessment',
      by: ['rater'],
      label: 'Begin assessment',
      intent: 'primary',
      input: {
        additionality_score: { type: 'number', min: 0, max: 10, required: true },
        permanence_score: { type: 'number', min: 0, max: 10, required: true },
        leakage_control_score: { type: 'number', min: 0, max: 10, required: true },
        cobenefits_score: { type: 'number', min: 0, max: 10, required: true },
      },
      guards: [],
      derive: (f, _at: Instant) => {
        const c = composite(f);
        return { composite_score: c ?? 0, rating_grade: grade(c) };
      },
    },
    {
      // structural gate: the ONLY edge into committee_review, from under_assessment.
      id: 'submit_for_review',
      from: 'under_assessment',
      to: 'committee_review',
      by: ['rater'],
      label: 'Submit for committee review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'return_for_rework',
      from: 'committee_review',
      to: 'under_assessment',
      by: ['reviewer'],
      label: 'Return for rework',
      intent: 'secondary',
      requiresReason: ['evidence_insufficient', 'scores_unsupported', 'methodology_mismatch', 'leakage_understated'],
      guards: [],
    },
    {
      // structural integrity gate: the ONLY edge into published, and it can only
      // fire from committee_review — which only submit_for_review reaches. A
      // rating therefore cannot publish without independent review. No guard.
      id: 'publish_rating',
      from: 'committee_review',
      to: 'published',
      by: ['reviewer'],
      label: 'Publish rating',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ published_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'decline_rating',
      from: ['rating_requested', 'under_assessment', 'committee_review'],
      to: 'rating_declined',
      by: ['rater', 'reviewer'],
      label: 'Decline rating',
      intent: 'destructive',
      requiresReason: ['out_of_scope', 'unresolvable_integrity_concern', 'double_counting_risk', 'sponsor_non_cooperation'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['rating_requested', 'under_assessment'],
      to: 'withdrawn',
      by: ['rater'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['duplicate_request', 'credit_cancelled', 'no_longer_required'],
      guards: [],
    },
  ],
  // ponytail: no re-score edge after return_for_rework — scores set once at
  // begin_assessment; add a re-assess edge if rework must revise dimension scores.
};
