// collateral_substitution — an ISDA CSA collateral substitution as data.
//
// A pledgor requests to swap posted collateral (existing → proposed); the
// secured party opens a review, satisfies itself on the substitution's
// conditions-precedent evidence, and approves; the substitution is then booked.
//
// The booking spine is STRUCTURAL, not a guard: substituted is reachable ONLY
// from approved (via book_substitution), and approved is reachable ONLY from
// under_review (via approve_substitution). So a substitution can NEVER be booked
// without the secured party's approval on record — the state graph enforces it.
// Firing book_substitution from under_review is an ILLEGAL_TRANSITION (engine
// step-4 refuses it before any guard runs).
//
// cpEvidencePresent rides approve_substitution as a Pattern-A input: cp_evidence_ref
// is present-but-not-required so an absent ref surfaces MISSING_CP_EVIDENCE, not a
// generic BAD_INPUT. counterpartyDistinct blocks a pledgor naming itself as the
// secured party (self-dealing) at @new.
//
// settles:false — a substitution is a collateral/framework record; value moves on
// the custody transfers this booking authorises, never through THIS chain (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const collateralSubstitution: ChainDecl = {
  key: 'collateral_substitution',
  noun: 'Collateral substitution',
  refPrefix: 'COLS',
  title: (f) =>
    `Collateral substitution — ${(f.pledgor_name as string) ?? 'pledgor'} / ${(f.secured_party_name as string) ?? 'secured party'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ISDA Credit Support Annex (2016 VM)', provision: 'para 3(c) substitution of posted collateral', effect: 'authorises' },
    { instrument: 'Financial Markets Act 19 of 2012', provision: 'collateral arrangement conduct standards', effect: 'requires' },
  ],
  roles: ['pledgor', 'secured_party', 'operator'],

  fields: {
    pledgor_name: { type: 'string', required: true, label: 'Pledgor' },
    secured_party_name: { type: 'string', required: true, label: 'Secured party' },
    secured_party_party: { type: 'party', role: 'secured_party', label: 'Secured party participant' },
    existing_collateral_ref: { type: 'string', label: 'Existing (posted) collateral ref' },
    proposed_collateral_ref: { type: 'string', label: 'Proposed (substitute) collateral ref' },
    csa_ref: { type: 'string', label: 'Governing CSA ref' },
    // conditions-precedent evidence (Pattern-A input on approve_substitution)
    cp_evidence_ref: { type: 'string', label: 'CP-evidence ref' },
    // written by derive, never by the client
    approved_at: { type: 'string', label: 'Approved at' },
    booked_at: { type: 'string', label: 'Booked at' },
  },

  initial: 'requested',

  states: {
    requested: { label: 'Requested', terminal: false, holder: 'secured_party', sla: { days: 5 } },
    under_review: { label: 'Under review', terminal: false, holder: 'secured_party', sla: { days: 3 } },
    approved: { label: 'Approved', terminal: false, holder: 'pledgor', sla: { days: 2 } },
    substituted: { label: 'Substituted', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'requested',
      by: ['pledgor', 'operator'],
      actorBecomes: 'pledgor',
      label: 'Request substitution',
      intent: 'primary',
      input: {
        pledgor_name: { type: 'string', required: true },
        secured_party_name: { type: 'string', required: true },
        secured_party_party: { type: 'party', role: 'secured_party' },
        existing_collateral_ref: { type: 'string' },
        proposed_collateral_ref: { type: 'string' },
        csa_ref: { type: 'string' },
      },
      // no self-dealing: pledgor and secured party must be distinct entities.
      guards: ['counterpartyDistinct'],
    },

    // --- happy path -----------------------------------------------------------
    {
      id: 'start_review',
      from: 'requested',
      to: 'under_review',
      by: ['secured_party', 'operator'],
      label: 'Start review',
      intent: 'primary',
      guards: [],
    },
    {
      // the secured party approves once satisfied on the substitution's CP
      // evidence. cp_evidence_ref is present-but-not-required (Pattern A) so an
      // absent ref surfaces MISSING_CP_EVIDENCE, not a generic BAD_INPUT.
      id: 'approve_substitution',
      from: 'under_review',
      to: 'approved',
      by: ['secured_party', 'operator'],
      label: 'Approve substitution',
      intent: 'primary',
      input: { cp_evidence_ref: { type: 'string' } },
      guards: ['cpEvidencePresent'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      // structural booking gate: the ONLY edge into substituted, and it can only
      // fire from approved — which only approve_substitution reaches. A
      // substitution therefore can NEVER be booked without the secured party's
      // approval on record.
      id: 'book_substitution',
      from: 'approved',
      to: 'substituted',
      by: ['secured_party', 'operator'],
      label: 'Book substitution',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ booked_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_substitution',
      from: 'under_review',
      to: 'rejected',
      by: ['secured_party', 'operator'],
      label: 'Reject substitution',
      intent: 'destructive',
      requiresReason: ['ineligible_collateral', 'valuation_shortfall', 'cp_not_satisfied', 'concentration_breach'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['requested', 'under_review'],
      to: 'withdrawn',
      by: ['pledgor', 'operator'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['no_longer_required', 'alternative_posted', 'error_corrected'],
      guards: [],
    },
  ],

  // review time-bar: a substitution request left un-reviewed stales out. Record-
  // only stub — the sweep computes the real bar off the state sla days.
  timers: [{ onState: 'requested', after: { days: 0 }, fire: 'withdraw', kind: 'time_bar' }],
};
