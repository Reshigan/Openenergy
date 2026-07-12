// disposition — lender-consent lifecycle for the disposal of a secured project
// asset, as data.
//
// Project-finance context (REBUILD_FUNCTIONAL_FLOOR §Project finance): a
// borrower who wants to sell / dispose of an asset inside the security package
// needs the lender's consent. The borrower requests; the lender reviews, may
// attach conditions precedent, and grants or refuses; the borrower then
// completes the sale and applies the proceeds.
//
// The structural spine: complete_disposition leaves ONLY consent_granted, and
// the ONLY edge into consent_granted is grant_consent (from under_review or
// conditions_cleared). So a disposition can NEVER be completed before the
// lender has granted consent — no guard needed, the state graph enforces it.
// Granting consent is guarded by creditApprovalPresent (a lender releasing
// secured collateral needs a named credit-committee approval ref); satisfying
// conditions precedent is guarded by cpEvidencePresent.
//
// settles:false — a consent record over collateral is a governance control,
// not a payment. The cash movement it authorises settles on its own rail
// (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure gain/loss bucketing off consideration vs book value. No clock, no env.
const disposalResult = (consideration: Json | undefined, book: Json | undefined): string => {
  if (typeof consideration !== 'number' || typeof book !== 'number') return 'unvalued';
  if (consideration > book) return 'gain';
  if (consideration < book) return 'loss';
  return 'breakeven';
};

export const disposition: ChainDecl = {
  key: 'disposition',
  noun: 'Asset disposition',
  refPrefix: 'DISP',
  title: (f) =>
    `Disposition — ${(f.asset_description as string) ?? 'unnamed asset'} (${(f.use_of_proceeds as string) ?? 'proceeds TBC'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Common Terms Agreement', provision: 'negative pledge / disposals covenant', effect: 'restricts' },
    { instrument: 'Security Agreement', provision: 'release of secured asset requires secured-party consent', effect: 'requires' },
  ],
  roles: ['borrower', 'lender', 'regulator', 'operator'],

  fields: {
    disposition_number: { type: 'string', label: 'Disposition number' },
    borrower_party: { type: 'party', role: 'borrower', label: 'Borrower' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender / security agent' },
    asset_description: { type: 'string', required: true, label: 'Asset' },
    asset_class: { type: 'string', label: 'Asset class (plant/land/receivable/equity)' },
    book_value: { type: 'number', min: 0, label: 'Book value' },
    sale_consideration: { type: 'number', min: 0, label: 'Sale consideration' },
    proposed_buyer: { type: 'string', label: 'Proposed buyer' },
    use_of_proceeds: { type: 'string', label: 'Use of proceeds (prepay/reinvest/retain)' },
    valuation_ref: { type: 'string', label: 'Independent valuation ref' },
    cp_summary: { type: 'string', label: 'Conditions summary' },
    cp_evidence_ref: { type: 'string', label: 'CP evidence ref' },
    credit_approval_ref: { type: 'string', label: 'Credit-committee approval ref' },
    // written by derive, never by the client
    disposal_result: { type: 'string', label: 'Disposal result' },
    consent_granted_at: { type: 'string', label: 'Consent granted at' },
    completed_at_disp: { type: 'string', label: 'Disposition completed at' },
  },

  initial: 'disposition_requested',

  states: {
    disposition_requested: { label: 'Disposition requested', terminal: false, holder: 'lender', sla: { days: 5 } },
    under_review: { label: 'Under review', terminal: false, holder: 'lender', sla: { days: 10 } },
    conditions_pending: { label: 'Conditions pending', terminal: false, holder: 'borrower', sla: { days: 30 } },
    conditions_cleared: { label: 'Conditions cleared', terminal: false, holder: 'lender', sla: { days: 5 } },
    consent_granted: { label: 'Consent granted', terminal: false, holder: 'borrower', sla: { days: 90 } },
    completed: { label: 'Disposition completed', terminal: true, holder: 'none' },
    refused: { label: 'Consent refused', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'disposition_requested',
      by: ['borrower', 'operator'],
      actorBecomes: 'borrower',
      label: 'Request disposition consent',
      intent: 'primary',
      input: {
        asset_description: { type: 'string', required: true },
        asset_class: { type: 'string' },
        book_value: { type: 'number', min: 0 },
        sale_consideration: { type: 'number', min: 0 },
        proposed_buyer: { type: 'string' },
        use_of_proceeds: { type: 'string' },
        valuation_ref: { type: 'string' },
        lender_party: { type: 'party', role: 'lender' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ disposal_result: disposalResult(f.sale_consideration, f.book_value) }),
    },
    {
      id: 'begin_review',
      from: 'disposition_requested',
      to: 'under_review',
      by: ['lender', 'operator'],
      label: 'Begin review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'request_conditions',
      from: 'under_review',
      to: 'conditions_pending',
      by: ['lender'],
      label: 'Attach conditions precedent',
      intent: 'primary',
      input: { cp_summary: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'satisfy_conditions',
      from: 'conditions_pending',
      to: 'conditions_cleared',
      by: ['borrower'],
      label: 'Satisfy conditions',
      intent: 'primary',
      input: { cp_evidence_ref: { type: 'string' } },
      guards: ['cpEvidencePresent'],
    },
    {
      // structural consent gate: the ONLY edge into consent_granted. Reachable
      // from an unconditional review or from cleared conditions — never from a
      // still-pending CP set. creditApprovalPresent forces a named credit ref.
      id: 'grant_consent',
      from: ['under_review', 'conditions_cleared'],
      to: 'consent_granted',
      by: ['lender'],
      label: 'Grant consent',
      intent: 'primary',
      input: { credit_approval_ref: { type: 'string' } },
      guards: ['creditApprovalPresent'],
      derive: (_f, at: Instant) => ({ consent_granted_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into a terminal completion, and it can only fire from
      // consent_granted — so a disposition cannot complete without consent.
      id: 'complete_disposition',
      from: 'consent_granted',
      to: 'completed',
      by: ['borrower', 'lender'],
      label: 'Complete disposition',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ completed_at_disp: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'refuse_consent',
      from: ['disposition_requested', 'under_review', 'conditions_pending', 'conditions_cleared'],
      to: 'refused',
      by: ['lender'],
      label: 'Refuse consent',
      intent: 'destructive',
      requiresReason: ['undervalue', 'security_shortfall', 'covenant_breach', 'proceeds_misapplied', 'cp_long_stop_missed'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['disposition_requested', 'under_review', 'conditions_pending', 'conditions_cleared', 'consent_granted'],
      to: 'withdrawn',
      by: ['borrower'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['sale_cancelled', 'renegotiated', 'no_longer_required'],
      guards: [],
    },
  ],

  // CP long-stop: conditions left unsatisfied past the deadline lapse into a
  // refusal. record-only stub; the sweep computes the real bar off state sla
  // days (ppa_contract / permit_to_work pattern).
  timers: [{ onState: 'conditions_pending', after: { days: 0 }, fire: 'refuse_consent', kind: 'time_bar' }],
};
