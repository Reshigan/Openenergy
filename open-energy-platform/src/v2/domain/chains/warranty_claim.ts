// warranty_claim — OEM/vendor warranty claim lifecycle as data.
//
// An asset owner / O&M claimant raises a claim against a vendor (OEM) for a
// component that failed inside its warranty term. The vendor assesses, then
// either accepts liability and remediates (repair/replace/refund) or rejects.
//
// Liability spine is structural: start_remediation ONLY leaves claim_accepted,
// and the ONLY path into claim_accepted is accept_claim. So a vendor can NEVER
// begin (billable) remediation on a claim it has not accepted — no guard
// needed, the state graph enforces it. Symmetrically, close_claim ONLY leaves
// remediation_complete: the claimant cannot close a claim whose fix was never
// completed.
//
// NO guards. The engine's role/state/reason-code checks cover everything a
// warranty claim needs; none of the ten domain guards genuinely fit (this is
// not a payment, a strategic move, a serial burn, or a hazard crossing).
// counterpartyDistinct looks tempting but at the @new edge the claimant is the
// actor (not yet a party during guard eval) so it cannot see self-dealing here
// — adding it would be theatre, not a control. Business rules are enforced
// structurally + via requiresReason on the reject/withdraw exits.
//
// settles:false — a warranty claim is an operational recovery workflow; any
// refund settles on the underlying service contract, never on this record
// (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure severity bucketing off the claimed rand amount. No clock, no env.
const severityTier = (amount: Json | undefined): string => {
  if (typeof amount !== 'number') return 'unassessed';
  if (amount >= 1_000_000) return 'major';
  if (amount >= 100_000) return 'significant';
  return 'minor';
};

export const warrantyClaim: ChainDecl = {
  key: 'warranty_claim',
  noun: 'Warranty claim',
  refPrefix: 'WC',
  title: (f) => `Warranty claim — ${(f.component_name as string) ?? 'component'} @ ${(f.asset_name as string) ?? 'unnamed asset'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Consumer Protection Act 2008', provision: 's56 implied warranty of quality', effect: 'requires' },
    { instrument: 'Supply/EPC contract', provision: 'defects liability & warranty terms', effect: 'requires' },
  ],
  roles: ['claimant', 'vendor', 'operator'],

  fields: {
    asset_name: { type: 'string', required: true, label: 'Asset' },
    component_name: { type: 'string', required: true, label: 'Component' },
    component_serial: { type: 'string', label: 'Component serial' },
    warranty_ref: { type: 'string', label: 'Warranty / contract ref' },
    defect_description: { type: 'string', required: true, label: 'Defect description' },
    failure_date: { type: 'string', label: 'Failure date' },
    claimed_amount: { type: 'number', min: 0, label: 'Claimed amount (ZAR)' },
    severity_tier: { type: 'string', label: 'Severity tier' },
    claimant_party: { type: 'party', role: 'claimant', label: 'Claimant' },
    vendor_party: { type: 'party', role: 'vendor', label: 'Vendor (OEM)' },
    remedy_type: { type: 'string', label: 'Remedy (repair/replace/refund)' },
    remediation_plan: { type: 'string', label: 'Remediation plan' },
    // written by derive, never by the client
    accepted_at: { type: 'string', label: 'Accepted at' },
    remediation_completed_at: { type: 'string', label: 'Remediation completed at' },
    closed_at_wc: { type: 'string', label: 'Claim closed at' },
  },

  initial: 'claim_submitted',

  states: {
    claim_submitted: { label: 'Claim submitted', terminal: false, holder: 'vendor', sla: { days: 5 } },
    under_assessment: { label: 'Under assessment', terminal: false, holder: 'vendor', sla: { days: 10 } },
    claim_accepted: { label: 'Claim accepted', terminal: false, holder: 'vendor', sla: { days: 5 } },
    remediation_in_progress: { label: 'Remediation in progress', terminal: false, holder: 'vendor', sla: { days: 30 } },
    remediation_complete: { label: 'Remediation complete', terminal: false, holder: 'claimant', sla: { days: 5 } },
    claim_closed: { label: 'Claim closed', terminal: true, holder: 'none' },
    claim_rejected: { label: 'Claim rejected', terminal: true, holder: 'none' },
    claim_withdrawn: { label: 'Claim withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'claim_submitted',
      by: ['claimant', 'operator'],
      actorBecomes: 'claimant',
      label: 'Submit warranty claim',
      intent: 'primary',
      input: {
        asset_name: { type: 'string', required: true },
        component_name: { type: 'string', required: true },
        component_serial: { type: 'string' },
        warranty_ref: { type: 'string' },
        defect_description: { type: 'string', required: true },
        failure_date: { type: 'string' },
        claimed_amount: { type: 'number', min: 0 },
        vendor_party: { type: 'party', role: 'vendor' },
      },
      guards: [],
    },
    {
      id: 'begin_assessment',
      from: 'claim_submitted',
      to: 'under_assessment',
      by: ['vendor'],
      label: 'Begin assessment',
      intent: 'primary',
      guards: [],
      // tier is derived from the claimed amount the claimant carried in at open.
      derive: (f, _at: Instant) => ({ severity_tier: severityTier(f.claimed_amount) }),
    },
    {
      // structural liability gate: the ONLY edge into claim_accepted. Remediation
      // (below) can leave ONLY this state, so a vendor cannot remediate a claim it
      // never accepted. No guard — the graph is the control.
      id: 'accept_claim',
      from: 'under_assessment',
      to: 'claim_accepted',
      by: ['vendor'],
      label: 'Accept claim',
      intent: 'primary',
      input: { remedy_type: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },
    {
      id: 'start_remediation',
      from: 'claim_accepted',
      to: 'remediation_in_progress',
      by: ['vendor'],
      label: 'Start remediation',
      intent: 'primary',
      input: { remediation_plan: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'complete_remediation',
      from: 'remediation_in_progress',
      to: 'remediation_complete',
      by: ['vendor'],
      label: 'Complete remediation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ remediation_completed_at: isoUtc(at) }),
    },
    {
      // structural: the ONLY edge into claim_closed, and it can fire ONLY from
      // remediation_complete — the claimant cannot close a fix that never finished.
      id: 'close_claim',
      from: 'remediation_complete',
      to: 'claim_closed',
      by: ['claimant', 'operator'],
      label: 'Close claim',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_wc: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_claim',
      from: ['claim_submitted', 'under_assessment'],
      to: 'claim_rejected',
      by: ['vendor'],
      label: 'Reject claim',
      intent: 'destructive',
      requiresReason: ['out_of_warranty', 'no_manufacturing_defect', 'misuse_or_abuse', 'unauthorised_repair', 'insufficient_evidence'],
      guards: [],
    },
    {
      id: 'withdraw_claim',
      from: ['claim_submitted', 'under_assessment', 'claim_accepted'],
      to: 'claim_withdrawn',
      by: ['claimant'],
      label: 'Withdraw claim',
      intent: 'destructive',
      requiresReason: ['resolved_directly', 'duplicate_claim', 'claim_error', 'no_longer_required'],
      guards: [],
    },
  ],
};
