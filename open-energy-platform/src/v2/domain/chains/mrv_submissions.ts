// mrv_submissions — carbon-project Monitoring, Reporting & Verification (MRV)
// lifecycle as data.
//
// A project participant submits a monitoring report claiming emission
// reductions; a regulator assigns a Designated Operational Entity (DOE) to
// audit it; the DOE's review resolves to one of four opinions (positive /
// qualified / adverse / disclaimer — ISAE 3410-style). Only a positive or
// qualified opinion can proceed to a corresponding-adjustment (CRA) request;
// adverse/disclaimer close the case immediately. A cleared CRA is authorized
// and then issued as verified credits — terminal.
//
// Structural honesty (no invented guards):
//  - issue is reachable ONLY from issuance_authorized, which is reachable
//    ONLY from cra_approved via authorize, which is reachable ONLY from
//    cra_review, which is reachable ONLY from a positive/qualified DOE
//    opinion. So credits can NEVER be issued without a passing DOE opinion
//    and CRA approval — the state graph enforces the verification chain.
//  - the four DOE-opinion outcomes are modelled as four transitions off the
//    same decisionGroup ('doe_opinion') rather than one edge with an enum
//    input, because the engine's `to` is a single fixed state and the two
//    passing opinions and two failing opinions fork the graph differently
//    (only positive/qualified have a further edge; adverse/disclaimer don't).
//  - issue carries serialRangeConsistent: an issued serial range is the
//    double-count vector this guard exists for (registry.ts comment).
//    complianceHaltClear also gates issue — issuing tradable credits is a
//    new commitment, exactly what a platform-wide halt should block.
//  - authorize carries completenessEvidencePresent: a regulator authorizing
//    final issuance needs a named completeness sign-off ref on record.
//
// settles:false — this chain records a verification + adjustment decision;
// credit issuance quantum is recorded here but any token/registry transfer
// settles on its own rail (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const mrvSubmissions: ChainDecl = {
  key: 'mrv_submissions',
  noun: 'MRV submission',
  refPrefix: 'MRV',
  title: (f) =>
    `MRV verification — ${(f.project_id as string) ?? 'unlinked project'} (${(f.reporting_period_start as string) ?? '?'}→${(f.reporting_period_end as string) ?? '?'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Paris Agreement Article 6.4', provision: 'independent verification of claimed emission reductions prior to issuance', effect: 'requires' },
    { instrument: 'Carbon Tax Act 15 of 2019', provision: 'allowance for verified offsets used to reduce carbon tax liability', effect: 'authorises' },
  ],
  roles: ['submitter', 'doe', 'regulator', 'admin', 'support'],

  fields: {
    project_id: { type: 'string', required: true, label: 'Carbon project ref' },
    submitter_party: { type: 'party', role: 'submitter', label: 'Project participant' },
    doe_party: { type: 'party', role: 'doe', label: 'Designated Operational Entity' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    reporting_period_start: { type: 'string', required: true, label: 'Reporting period start' },
    reporting_period_end: { type: 'string', required: true, label: 'Reporting period end' },
    claimed_reductions_tco2e: { type: 'number', required: true, min: 0, label: 'Claimed reductions (tCO2e)' },
    monitoring_methodology: { type: 'string', label: 'Monitoring methodology' },
    monitoring_plan_r2_key: { type: 'string', label: 'Monitoring plan (evidence)' },
    activity_data_r2_key: { type: 'string', label: 'Activity data (evidence)' },
    emission_factors: { type: 'string', label: 'Emission factors (JSON)' },
    baseline_methodology: { type: 'string', label: 'Baseline methodology' },
    baseline_emissions_tco2e: { type: 'number', min: 0, label: 'Baseline emissions (tCO2e)' },
    project_emissions_tco2e: { type: 'number', min: 0, label: 'Project emissions (tCO2e)' },
    leakage_tco2e: { type: 'number', min: 0, label: 'Leakage (tCO2e)' },
    // written by derive, never by the client
    doe_opinion: { type: 'string', label: 'DOE opinion' },
    completeness_ref: { type: 'string', label: 'Completeness sign-off ref' },
    serial_start: { type: 'number', min: 0, label: 'Issued serial range start' },
    serial_end: { type: 'number', min: 0, label: 'Issued serial range end' },
    quantity_tco2e: { type: 'number', min: 0, label: 'Issued quantity (tCO2e)' },
    submitted_at: { type: 'string', label: 'Submitted at' },
    doe_assigned_at: { type: 'string', label: 'DOE assigned at' },
    review_started_at: { type: 'string', label: 'Review started at' },
    opinion_recorded_at: { type: 'string', label: 'Opinion recorded at' },
    cra_submitted_at: { type: 'string', label: 'CRA submitted at' },
    cra_approved_at: { type: 'string', label: 'CRA approved at' },
    cra_rejected_at: { type: 'string', label: 'CRA rejected at' },
    authorized_at: { type: 'string', label: 'Issuance authorized at' },
    issued_at: { type: 'string', label: 'Issued at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'submitter' },
    submitted: { label: 'Submitted', terminal: false, holder: 'regulator', sla: { days: 10 } },
    doe_assigned: { label: 'DOE assigned', terminal: false, holder: 'regulator', sla: { days: 30 } },
    doe_review: { label: 'DOE review', terminal: false, holder: 'regulator', sla: { days: 45 } },
    doe_opinion_positive: { label: 'DOE opinion: positive', terminal: false, holder: 'submitter' },
    doe_opinion_qualified: { label: 'DOE opinion: qualified', terminal: false, holder: 'submitter' },
    doe_opinion_adverse: { label: 'DOE opinion: adverse', terminal: true, holder: 'none' },
    doe_opinion_disclaimer: { label: 'DOE opinion: disclaimer', terminal: true, holder: 'none' },
    cra_review: { label: 'CRA review', terminal: false, holder: 'regulator', sla: { days: 15 } },
    cra_approved: { label: 'CRA approved', terminal: false, holder: 'regulator' },
    cra_rejected: { label: 'CRA rejected', terminal: true, holder: 'none' },
    issuance_authorized: { label: 'Issuance authorized', terminal: false, holder: 'regulator' },
    issued: { label: 'Issued', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['submitter', 'admin', 'support'],
      actorBecomes: 'submitter',
      label: 'Open MRV submission',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        reporting_period_start: { type: 'string', required: true },
        reporting_period_end: { type: 'string', required: true },
        claimed_reductions_tco2e: { type: 'number', required: true, min: 0 },
        monitoring_methodology: { type: 'string' },
        monitoring_plan_r2_key: { type: 'string' },
        activity_data_r2_key: { type: 'string' },
        emission_factors: { type: 'string' },
        baseline_methodology: { type: 'string' },
        baseline_emissions_tco2e: { type: 'number', min: 0 },
        project_emissions_tco2e: { type: 'number', min: 0 },
        leakage_tco2e: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      id: 'submit',
      from: 'draft',
      to: 'submitted',
      by: ['submitter', 'admin', 'support'],
      label: 'Submit for verification',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'assign_doe',
      from: 'submitted',
      to: 'doe_assigned',
      by: ['admin', 'support', 'regulator'],
      label: 'Assign DOE',
      intent: 'primary',
      input: { doe_party: { type: 'party', role: 'doe' } },
      guards: [],
      derive: (_f, at: Instant) => ({ doe_assigned_at: isoUtc(at) }),
    },
    {
      id: 'start_review',
      from: 'doe_assigned',
      to: 'doe_review',
      by: ['admin', 'support', 'regulator'],
      label: 'Start review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ review_started_at: isoUtc(at) }),
    },

    // --- DOE opinion fork: four outcomes off the same decision -----------------
    {
      id: 'record_opinion_positive',
      from: 'doe_review',
      to: 'doe_opinion_positive',
      by: ['admin', 'support', 'regulator'],
      decisionGroup: 'doe_opinion',
      label: 'Record opinion: positive',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ doe_opinion: 'positive', opinion_recorded_at: isoUtc(at) }),
    },
    {
      id: 'record_opinion_qualified',
      from: 'doe_review',
      to: 'doe_opinion_qualified',
      by: ['admin', 'support', 'regulator'],
      decisionGroup: 'doe_opinion',
      label: 'Record opinion: qualified',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ doe_opinion: 'qualified', opinion_recorded_at: isoUtc(at) }),
    },
    {
      id: 'record_opinion_adverse',
      from: 'doe_review',
      to: 'doe_opinion_adverse',
      by: ['admin', 'support', 'regulator'],
      decisionGroup: 'doe_opinion',
      label: 'Record opinion: adverse',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ doe_opinion: 'adverse', opinion_recorded_at: isoUtc(at) }),
    },
    {
      id: 'record_opinion_disclaimer',
      from: 'doe_review',
      to: 'doe_opinion_disclaimer',
      by: ['admin', 'support', 'regulator'],
      decisionGroup: 'doe_opinion',
      label: 'Record opinion: disclaimer',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ doe_opinion: 'disclaimer', opinion_recorded_at: isoUtc(at) }),
    },

    // --- CRA (corresponding-adjustment request) --------------------------------
    {
      // only a passing opinion reaches here — adverse/disclaimer have no exit
      // edge into cra_review, so a failed audit can never be laundered into an
      // adjustment request.
      id: 'submit_cra',
      from: ['doe_opinion_positive', 'doe_opinion_qualified'],
      to: 'cra_review',
      by: ['submitter', 'admin', 'support'],
      label: 'Submit CRA',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ cra_submitted_at: isoUtc(at) }),
    },
    {
      id: 'approve_cra',
      from: 'cra_review',
      to: 'cra_approved',
      by: ['admin', 'support', 'regulator'],
      label: 'Approve CRA',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ cra_approved_at: isoUtc(at) }),
    },
    {
      id: 'reject_cra',
      from: 'cra_review',
      to: 'cra_rejected',
      by: ['admin', 'support', 'regulator'],
      label: 'Reject CRA',
      intent: 'destructive',
      requiresReason: ['data_inconsistency', 'baseline_invalid', 'double_counting_risk', 'insufficient_evidence', 'adjustment_unsupported'],
      guards: [],
      derive: (_f, at: Instant) => ({ cra_rejected_at: isoUtc(at) }),
    },

    // --- issuance ---------------------------------------------------------------
    {
      // the ONLY edge into issuance_authorized, from cra_approved — so an
      // issuance can never be authorized without an approved adjustment.
      id: 'authorize',
      from: 'cra_approved',
      to: 'issuance_authorized',
      by: ['admin', 'support', 'regulator'],
      label: 'Authorize issuance',
      intent: 'primary',
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ authorized_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into the terminal issued state, and it can only fire from
      // issuance_authorized — credits can never be issued outside this gate.
      id: 'issue',
      from: 'issuance_authorized',
      to: 'issued',
      by: ['admin', 'support', 'regulator'],
      label: 'Issue',
      intent: 'primary',
      input: {
        serial_start: { type: 'number', required: true, min: 0 },
        serial_end: { type: 'number', required: true, min: 0 },
        quantity_tco2e: { type: 'number', required: true, min: 0 },
      },
      // a platform compliance halt blocks new issuance; serialRangeConsistent
      // stops a mis-stated burn quantity double-counting the serial range.
      guards: ['complianceHaltClear', 'serialRangeConsistent'],
      derive: (_f, at: Instant) => ({ issued_at: isoUtc(at) }),
    },

    // --- exit -------------------------------------------------------------------
    {
      id: 'withdraw',
      from: ['draft', 'submitted', 'doe_assigned', 'doe_review', 'doe_opinion_positive', 'doe_opinion_qualified', 'cra_review', 'cra_approved', 'issuance_authorized'],
      to: 'withdrawn',
      by: ['submitter', 'admin', 'support'],
      label: 'Withdraw submission',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
  ],
};
