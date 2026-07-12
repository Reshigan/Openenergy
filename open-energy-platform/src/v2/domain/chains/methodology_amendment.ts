// methodology_amendment — carbon-crediting methodology deviation lifecycle as data.
//
// A project proponent (carbon fund / developer) identifies a deviation from the
// registered methodology (VM0038, AMS-I.D., GS-SSC-EE …), assesses its
// materiality, classifies it minor or major, and — for a major deviation —
// updates the methodology, notifies the DNA, assigns a validator and passes a
// revalidation before the amendment can be approved.
//
// The integrity spine is STRUCTURAL, not a guard: a MAJOR deviation can only
// reach amendment_approved via complete_revalidation, whose ONLY `from` is
// `revalidation`, itself reachable ONLY through dna_notified → validator_assigned
// → begin_revalidation. There is no direct major_deviation → amendment_approved
// edge. So a material amendment can NEVER self-approve without DNA notification
// and independent revalidation — the state graph forbids it. A MINOR deviation
// has its own short edge (approve_minor) and never touches that path.
//
// complete_revalidation carries completenessEvidencePresent: the validator's
// sign-off must name a completeness-evidence ref, else it is refused.
//
// settles:false — a methodology amendment is an MRV/registry control, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure severity bucketing off the declared amendment tier. No clock, no env.
const tierSeverity = (tier: Json | undefined): string => {
  if (tier === 'major_change' || tier === 'article6_itmo') return 'high';
  if (tier === 'moderate_change') return 'medium';
  if (tier === 'minor_parameter') return 'low';
  return 'unclassified';
};

export const methodologyAmendment: ChainDecl = {
  key: 'methodology_amendment',
  noun: 'Methodology amendment',
  refPrefix: 'MA',
  title: (f) =>
    `${(f.methodology_id as string) ?? 'methodology'} amendment — ${(f.amendment_tier as string) ?? 'untiered'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Paris Agreement Art. 6.4', provision: 'mechanism methodology deviation & revalidation', effect: 'requires' },
    { instrument: 'VCS Standard v4', provision: 'methodology deviation & revision procedure', effect: 'requires' },
    { instrument: 'Carbon Tax Act 2019', provision: 's13 offset eligibility integrity', effect: 'restricts' },
  ],
  roles: ['proponent', 'validator', 'regulator', 'operator'],

  fields: {
    methodology_id: { type: 'string', required: true, label: 'Methodology (e.g. VM0038)' },
    methodology_version: { type: 'string', label: 'Methodology version in use' },
    amendment_tier: { type: 'string', required: true, label: 'Tier (minor_parameter/moderate_change/major_change/article6_itmo)' },
    deviation_type: { type: 'string', label: 'Deviation type' },
    deviation_description: { type: 'string', required: true, label: 'Deviation description' },
    estimated_impact_tco2e: { type: 'number', label: 'Estimated ER impact (tCO2e)' },
    project_ref: { type: 'string', label: 'Carbon project ref' },
    severity: { type: 'string', label: 'Severity' },
    is_material: { type: 'boolean', label: 'Material?' },
    materiality_rationale: { type: 'string', label: 'Materiality rationale' },
    amendment_description: { type: 'string', label: 'Amendment description' },
    new_methodology_version: { type: 'string', label: 'New methodology version' },
    dna_name: { type: 'string', label: 'Designated national authority' },
    dna_notification_ref: { type: 'string', label: 'DNA notification ref' },
    validator_name: { type: 'string', label: 'Validator' },
    validator_ref: { type: 'string', label: 'Validator engagement ref' },
    completeness_ref: { type: 'string', label: 'Revalidation completeness-evidence ref' },
    validator_findings: { type: 'string', label: 'Validator findings' },
    // written by derive, never by the client
    materiality_assessed_at: { type: 'string', label: 'Materiality assessed at' },
    dna_notified_at: { type: 'string', label: 'DNA notified at' },
    revalidation_started_at: { type: 'string', label: 'Revalidation started at' },
    approved_at: { type: 'string', label: 'Approved at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
  },

  initial: 'deviation_identified',

  states: {
    deviation_identified: { label: 'Deviation identified', terminal: false, holder: 'proponent', sla: { days: 5 } },
    materiality_assessment: { label: 'Materiality assessment', terminal: false, holder: 'proponent', sla: { days: 10 } },
    minor_deviation: { label: 'Minor deviation', terminal: false, holder: 'proponent', sla: { days: 15 } },
    major_deviation: { label: 'Major deviation', terminal: false, holder: 'proponent', sla: { days: 30 } },
    methodology_update: { label: 'Methodology update', terminal: false, holder: 'proponent', sla: { days: 30 } },
    dna_notified: { label: 'DNA notified', terminal: false, holder: 'regulator', sla: { days: 30 } },
    validator_assigned: { label: 'Validator assigned', terminal: false, holder: 'validator', sla: { days: 20 } },
    revalidation: { label: 'Revalidation', terminal: false, holder: 'validator', sla: { days: 45 } },
    amendment_approved: { label: 'Amendment approved', terminal: true, holder: 'none' },
    amendment_rejected: { label: 'Amendment rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'deviation_identified',
      by: ['proponent', 'operator'],
      actorBecomes: 'proponent',
      label: 'Log deviation',
      intent: 'primary',
      input: {
        methodology_id: { type: 'string', required: true },
        methodology_version: { type: 'string' },
        amendment_tier: { type: 'string', required: true },
        deviation_type: { type: 'string' },
        deviation_description: { type: 'string', required: true },
        estimated_impact_tco2e: { type: 'number' },
        project_ref: { type: 'string' },
        // later-edge actors, attached as parties ONLY here at @new
        validator_party: { type: 'party', role: 'validator' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ severity: tierSeverity(f.amendment_tier) }),
    },
    {
      id: 'assess_materiality',
      from: 'deviation_identified',
      to: 'materiality_assessment',
      by: ['proponent'],
      label: 'Assess materiality',
      intent: 'primary',
      input: { is_material: { type: 'boolean' }, materiality_rationale: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ materiality_assessed_at: isoUtc(at) }),
    },
    {
      id: 'classify_minor',
      from: 'materiality_assessment',
      to: 'minor_deviation',
      by: ['proponent'],
      label: 'Classify minor',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'classify_major',
      from: 'materiality_assessment',
      to: 'major_deviation',
      by: ['proponent'],
      label: 'Classify major',
      intent: 'primary',
      guards: [],
    },
    {
      // minor deviations self-approve on a logged parameter update — they never
      // touch DNA/validator. This is the ONLY edge out of minor_deviation to
      // approval, structurally separate from the major revalidation path.
      id: 'approve_minor',
      from: 'minor_deviation',
      to: 'amendment_approved',
      by: ['proponent', 'regulator'],
      label: 'Approve minor amendment',
      intent: 'primary',
      input: { amendment_description: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'draft_update',
      from: 'major_deviation',
      to: 'methodology_update',
      by: ['proponent'],
      label: 'Draft methodology update',
      intent: 'primary',
      input: { amendment_description: { type: 'string', required: true }, new_methodology_version: { type: 'string' } },
      guards: [],
    },
    {
      id: 'notify_dna',
      from: 'methodology_update',
      to: 'dna_notified',
      by: ['proponent', 'operator'],
      label: 'Notify DNA',
      intent: 'primary',
      input: { dna_name: { type: 'string', required: true }, dna_notification_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ dna_notified_at: isoUtc(at) }),
    },
    {
      id: 'assign_validator',
      from: 'dna_notified',
      to: 'validator_assigned',
      by: ['proponent', 'operator'],
      label: 'Assign validator',
      intent: 'primary',
      input: { validator_name: { type: 'string', required: true }, validator_ref: { type: 'string' } },
      guards: [],
    },
    {
      id: 'begin_revalidation',
      from: 'validator_assigned',
      to: 'revalidation',
      by: ['validator'],
      label: 'Begin revalidation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ revalidation_started_at: isoUtc(at) }),
    },
    {
      // structural integrity gate: the ONLY edge into amendment_approved for a
      // major deviation, and it can only fire from `revalidation`. A material
      // amendment therefore cannot be approved without an independent
      // revalidation. The validator sign-off must name completeness evidence.
      id: 'complete_revalidation',
      from: 'revalidation',
      to: 'amendment_approved',
      by: ['validator', 'regulator'],
      label: 'Complete revalidation',
      intent: 'primary',
      // completeness_ref is enforced by the guard (not required-input) so the
      // guard is the load-bearing gate, surfacing MISSING_COMPLETENESS_EVIDENCE.
      input: { completeness_ref: { type: 'string' }, validator_findings: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_amendment',
      from: ['materiality_assessment', 'minor_deviation', 'major_deviation', 'methodology_update', 'dna_notified', 'validator_assigned', 'revalidation'],
      to: 'amendment_rejected',
      by: ['validator', 'regulator'],
      label: 'Reject amendment',
      intent: 'destructive',
      requiresReason: ['integrity_risk', 'insufficient_evidence', 'baseline_invalidated', 'additionality_lost', 'dna_objection'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['deviation_identified', 'materiality_assessment', 'minor_deviation', 'major_deviation', 'methodology_update'],
      to: 'withdrawn',
      by: ['proponent'],
      label: 'Withdraw amendment',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'deviation_reversed', 'superseded', 'no_longer_required'],
      guards: [],
    },
  ],

  // revalidation time-bar: an assigned validator that never completes staleness
  // out (a crediting integrity control cannot hang open indefinitely). record-only
  // stub; the sweep computes the real bar off state sla days (ppa_contract pattern).
  timers: [{ onState: 'revalidation', after: { days: 0 }, fire: 'reject_amendment', kind: 'time_bar' }],
};
