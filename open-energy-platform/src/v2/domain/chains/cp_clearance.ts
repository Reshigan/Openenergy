// cp_clearance — conditions-precedent (CP) clearance register as data.
//
// A lender opens a CP register against a credit facility; the borrower agrees
// the register, satisfies the conditions, and submits evidence; the lender
// reviews and either clears the CPs (with or without waivers) and authorises
// drawdown, or defaults the register when the long-stop closing date passes
// with CPs outstanding.
//
// Structural money gate: authorize_drawdown leaves ONLY cps_satisfied, and the
// ONLY path into cps_satisfied is clear_cps (from under_lender_review). So
// drawdown can NEVER be authorised before the lender has cleared the CPs — no
// guard needed, the state graph enforces it. Evidence integrity is enforced by
// cpEvidencePresent on submit_evidence (a named cp_evidence_ref is mandatory)
// and by counterpartyDistinct on submit_register (lender ≠ borrower).
//
// settles:false — a CP register is a drawdown pre-condition control, not a
// payment. The actual money movement is the downstream `drawdown` chain
// (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure satisfaction ratio off the CP counts. No clock, no env.
const progressPct = (total: Json | undefined, satisfied: Json | undefined): number => {
  if (typeof total !== 'number' || total <= 0) return 0;
  const done = typeof satisfied === 'number' ? satisfied : 0;
  return Math.round((Math.min(done, total) / total) * 100);
};

export const cpClearance: ChainDecl = {
  key: 'cp_clearance',
  noun: 'CP clearance',
  refPrefix: 'CPCL',
  title: (f) =>
    `${(f.cp_tier as string) ?? 'standard'} CP clearance — ${(f.borrower_name as string) ?? (f.facility_ref as string) ?? 'unnamed facility'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'LMA Facility Agreement', provision: 'Schedule 2 conditions precedent', effect: 'requires' },
    { instrument: 'REIPPPP', provision: 'financial-close CP satisfaction', effect: 'requires' },
  ],
  roles: ['lender', 'borrower', 'regulator'],

  fields: {
    cp_reference: { type: 'string', label: 'CP register reference' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender' },
    borrower_party: { type: 'party', role: 'borrower', label: 'Borrower' },
    facility_ref: { type: 'string', label: 'Credit facility ref' },
    project_ref: { type: 'string', label: 'Project ref' },
    borrower_name: { type: 'string', label: 'Borrower' },
    cp_tier: { type: 'string', required: true, label: 'CP tier (minor/standard/major/systemic)' },
    cp_count_total: { type: 'number', min: 0, label: 'Total CPs' },
    cp_count_satisfied: { type: 'number', min: 0, label: 'CPs satisfied' },
    cp_evidence_ref: { type: 'string', label: 'CP evidence ref' },
    closing_deadline: { type: 'string', label: 'Long-stop closing date' },
    // written by derive, never by the client
    cp_progress_pct: { type: 'number', label: 'CP progress (%)' },
    register_agreed_at: { type: 'string', label: 'Register agreed at' },
    cps_cleared_at: { type: 'string', label: 'CPs cleared at' },
    drawdown_authorized_at: { type: 'string', label: 'Drawdown authorised at' },
  },

  initial: 'cp_register_draft',

  states: {
    cp_register_draft: { label: 'CP register draft', terminal: false, holder: 'lender', sla: { hours: 48 } },
    cp_register_submitted: { label: 'CP register submitted', terminal: false, holder: 'borrower', sla: { hours: 48 } },
    cp_register_agreed: { label: 'CP register agreed', terminal: false, holder: 'borrower' },
    satisfying_cps: { label: 'Satisfying CPs', terminal: false, holder: 'borrower', sla: { days: 30 } },
    cps_submitted: { label: 'CPs submitted', terminal: false, holder: 'lender', sla: { hours: 72 } },
    under_lender_review: { label: 'Under lender review', terminal: false, holder: 'lender', sla: { hours: 72 } },
    cps_satisfied: { label: 'CPs satisfied', terminal: false, holder: 'lender', sla: { hours: 24 } },
    drawdown_authorized: { label: 'Drawdown authorised', terminal: true, holder: 'none' },
    cp_defaulted: { label: 'CP default', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'cp_register_draft',
      by: ['lender'],
      actorBecomes: 'lender',
      label: 'Draft CP register',
      intent: 'primary',
      input: {
        facility_ref: { type: 'string' },
        project_ref: { type: 'string' },
        borrower_name: { type: 'string' },
        cp_tier: { type: 'string', required: true },
        cp_count_total: { type: 'number', min: 0 },
        closing_deadline: { type: 'string' },
        borrower_party: { type: 'party', role: 'borrower' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'submit_register',
      from: 'cp_register_draft',
      to: 'cp_register_submitted',
      by: ['lender'],
      label: 'Submit register to borrower',
      intent: 'primary',
      // lender and borrower must be distinct legal entities — no self-dealing.
      guards: ['counterpartyDistinct'],
    },
    {
      id: 'agree_register',
      from: 'cp_register_submitted',
      to: 'cp_register_agreed',
      by: ['borrower'],
      label: 'Agree CP register',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ register_agreed_at: isoUtc(at) }),
    },
    {
      id: 'commence_satisfaction',
      from: 'cp_register_agreed',
      to: 'satisfying_cps',
      by: ['borrower'],
      label: 'Commence CP satisfaction',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_evidence',
      from: 'satisfying_cps',
      to: 'cps_submitted',
      by: ['borrower'],
      label: 'Submit CP evidence',
      intent: 'primary',
      input: {
        cp_evidence_ref: { type: 'string' },
        cp_count_satisfied: { type: 'number', min: 0 },
      },
      // a CP evidence bundle needs a named evidence ref before review.
      guards: ['cpEvidencePresent'],
      derive: (f, _at: Instant) => ({ cp_progress_pct: progressPct(f.cp_count_total, f.cp_count_satisfied) }),
    },
    {
      id: 'begin_review',
      from: 'cps_submitted',
      to: 'under_lender_review',
      by: ['lender'],
      label: 'Begin lender review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'return_for_rework',
      from: 'under_lender_review',
      to: 'satisfying_cps',
      by: ['lender'],
      label: 'Return CPs for rework',
      intent: 'secondary',
      requiresReason: ['evidence_insufficient', 'condition_not_met', 'stale_evidence', 'wrong_form'],
      guards: [],
    },
    {
      // structural money gate: the ONLY edge into cps_satisfied, and it can only
      // fire from under_lender_review. Drawdown therefore cannot be authorised
      // until the lender has cleared the CPs. Waivers are a reason on this edge.
      id: 'clear_cps',
      from: 'under_lender_review',
      to: 'cps_satisfied',
      by: ['lender'],
      label: 'Clear CPs',
      intent: 'primary',
      input: { cp_count_satisfied: { type: 'number', min: 0 } },
      guards: [],
      derive: (f, at: Instant) => ({
        cps_cleared_at: isoUtc(at),
        cp_progress_pct: progressPct(f.cp_count_total, f.cp_count_satisfied),
      }),
    },
    {
      id: 'authorize_drawdown',
      from: 'cps_satisfied',
      to: 'drawdown_authorized',
      by: ['lender'],
      label: 'Authorise drawdown',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ drawdown_authorized_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'default_cp',
      from: ['cp_register_agreed', 'satisfying_cps', 'cps_submitted', 'under_lender_review', 'cps_satisfied'],
      to: 'cp_defaulted',
      by: ['lender', 'regulator'],
      label: 'Default CP register',
      intent: 'destructive',
      requiresReason: ['long_stop_passed', 'cp_unsatisfiable', 'material_adverse_change', 'facility_terminated'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['cp_register_draft', 'cp_register_submitted', 'cp_register_agreed'],
      to: 'withdrawn',
      by: ['lender', 'borrower'],
      label: 'Withdraw CP register',
      intent: 'destructive',
      requiresReason: ['deal_cancelled', 'refinanced', 'restructured', 'no_longer_required'],
      guards: [],
    },
  ],

  // long-stop closing-date time-bar: an agreed register whose CPs are not
  // cleared by the negotiated closing date defaults. record-only stub; the
  // sweep computes the real bar off the closing_deadline / state sla.
  timers: [{ onState: 'satisfying_cps', after: { days: 0 }, fire: 'default_cp', kind: 'time_bar' }],
};
