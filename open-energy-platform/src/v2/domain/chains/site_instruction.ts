// site_instruction — JBCC 6.2 cl.18 (Architect's/Engineer's Instruction) / NEC4
// PMI construction-instruction register for an IPP build programme, as data.
//
// The IPP developer drafts an instruction, issues it to the contractor,
// the contractor acknowledges and commences the instructed work, completes
// it, and the Independent Engineer verifies before the instruction closes.
// A live instruction can instead be disputed (and, once resolved, re-enters
// execution) or, pre-issuance, superseded by a revision or voided outright.
//
// Structural honesty (no invented guards):
//  - `close_instruction` is the ONLY edge into `closed`, and it only fires
//    from `ie_verified` — so an instruction can NEVER close without an
//    Independent Engineer sign-off. No guard needed; the state graph
//    enforces the verification gate.
//  - `open` is guarded by counterpartyDistinct: the issuing IPP developer
//    and the named contractor must be different legal entities (an
//    instruction can't be self-issued to the developer's own entity).
//  - `issue_instruction` is guarded by complianceHaltClear: this is the
//    moment the instruction becomes a live commitment on the contractor, so
//    a platform-wide compliance halt blocks new issuances (it does not
//    block acknowledging/completing/disputing/voiding work already live).
//
// crosses_into_regulator / is_reportable mirror the real crossesIntoRegulator
// / isReportable rules in src/utils/ipp-site-instruction-spec.ts: every
// safety directive is reportable; a disputed contract variation over
// R250k crosses into regulator scope.
//
// settles:false — an instruction records scope/defect/safety direction and
// its instructed value is informational; any resulting payment settles on
// the variation/payment-certificate rail, not here (R-S5-1).
//
// legalBasis omitted: the governing instruments here are JBCC/NEC4/OHSA
// construction-contract clauses, not one of ERA 2006 / NERSA Grid Code /
// POPIA / Carbon Tax Act / REIPPPP / JSE-SRL — citing those would misstate
// the legal basis, so this chain carries none.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const VALUE_THRESHOLD_ZAR = 250_000;

// pure mirror of isReportable() — no clock, no env.
const siReportable = (f: Record<string, Json>): boolean => {
  if (f.is_safety_directive === true) return true;
  return f.is_contract_variation === true && typeof f.value_zar === 'number' && f.value_zar > VALUE_THRESHOLD_ZAR;
};

export const siteInstruction: ChainDecl = {
  key: 'site_instruction',
  noun: 'Site instruction',
  refPrefix: 'SI',
  title: (f) => `Site instruction — ${(f.description as string) ?? 'untitled'} (${(f.project_name as string) ?? 'project TBC'})`,
  visibility: 'party',
  settles: false,
  roles: ['ipp_developer', 'operator', 'contractor'],

  fields: {
    project_id: { type: 'string', required: true, label: 'Project' },
    project_name: { type: 'string', label: 'Project name' },
    instruction_type: {
      type: 'string',
      required: true,
      label: 'Instruction type (safety_directive/variation_instruction/defect_rectification/design_clarification/testing_instruction/administrative)',
    },
    si_ref: { type: 'string', label: 'SI reference' },
    issued_date: { type: 'string', required: true, label: 'Issued date' },
    description: { type: 'string', required: true, label: 'Description' },
    scope_narrative: { type: 'string', label: 'Scope narrative' },
    work_location: { type: 'string', label: 'Work location' },
    ie_signatory: { type: 'string', label: 'Independent Engineer signatory' },
    contractor_party: { type: 'party', role: 'contractor', label: 'Contractor' },
    contractor_signatory: { type: 'string', label: 'Contractor signatory' },
    is_safety_directive: { type: 'boolean', label: 'Safety directive (OHSA Const.Regs s.8)' },
    is_contract_variation: { type: 'boolean', label: 'Contract variation' },
    value_zar: { type: 'number', min: 0, label: 'Instructed value (ZAR)' },
    ncr_ref: { type: 'string', label: 'NCR reference' },
    dfr_ref: { type: 'string', label: 'DFR reference' },
    diary_ref: { type: 'string', label: 'Site diary reference' },
    superseded_by: { type: 'string', label: 'Superseded by (SI ref)' },
    // written by derive, never by the client
    is_reportable: { type: 'boolean', label: 'Regulator-reportable' },
    issued_at: { type: 'string', label: 'Issued at' },
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    in_execution_at: { type: 'string', label: 'Execution commenced at' },
    completed_at: { type: 'string', label: 'Work completed at' },
    ie_verified_at: { type: 'string', label: 'IE verified at' },
    closed_at: { type: 'string', label: 'Closed at' },
    disputed_at: { type: 'string', label: 'Disputed at' },
    dispute_resolved_at: { type: 'string', label: 'Dispute resolved at' },
    superseded_at: { type: 'string', label: 'Superseded at' },
    voided_at: { type: 'string', label: 'Voided at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'ipp_developer' },
    issued: { label: 'Issued', terminal: false, holder: 'contractor' },
    acknowledged: { label: 'Acknowledged', terminal: false, holder: 'contractor' },
    in_execution: { label: 'In execution', terminal: false, holder: 'contractor' },
    completed: { label: 'Work completed', terminal: false, holder: 'ipp_developer' },
    ie_verified: { label: 'IE verified', terminal: false, holder: 'ipp_developer' },
    disputed: { label: 'Disputed', terminal: false, holder: 'ipp_developer' },
    dispute_resolved: { label: 'Dispute resolved', terminal: false, holder: 'contractor' },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    superseded: { label: 'Superseded', terminal: true, holder: 'none' },
    voided: { label: 'Voided', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Draft site instruction',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        project_name: { type: 'string' },
        instruction_type: { type: 'string', required: true },
        si_ref: { type: 'string' },
        issued_date: { type: 'string', required: true },
        description: { type: 'string', required: true },
        scope_narrative: { type: 'string' },
        work_location: { type: 'string' },
        ie_signatory: { type: 'string' },
        contractor_party: { type: 'party', role: 'contractor' },
        contractor_signatory: { type: 'string' },
        is_safety_directive: { type: 'boolean' },
        is_contract_variation: { type: 'boolean' },
        value_zar: { type: 'number', min: 0 },
        ncr_ref: { type: 'string' },
        dfr_ref: { type: 'string' },
        diary_ref: { type: 'string' },
      },
      // an instruction can't be self-issued to the developer's own entity.
      guards: ['counterpartyDistinct'],
    },
    {
      id: 'issue_instruction',
      from: 'draft',
      to: 'issued',
      by: ['ipp_developer', 'operator'],
      label: 'Issue instruction',
      intent: 'primary',
      // this is the moment the instruction becomes a live commitment on the
      // contractor — blocked under a platform-wide compliance halt.
      guards: ['complianceHaltClear'],
      derive: (f, at: Instant) => ({ issued_at: isoUtc(at), is_reportable: siReportable(f) }),
    },
    {
      id: 'acknowledge_receipt',
      from: 'issued',
      to: 'acknowledged',
      by: ['ipp_developer', 'operator'],
      label: 'Acknowledge receipt',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    {
      id: 'commence_work',
      from: ['acknowledged', 'dispute_resolved'],
      to: 'in_execution',
      by: ['ipp_developer', 'operator'],
      label: 'Commence work',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ in_execution_at: isoUtc(at) }),
    },
    {
      id: 'complete_work',
      from: 'in_execution',
      to: 'completed',
      by: ['ipp_developer', 'operator'],
      label: 'Complete work',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ completed_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into ie_verified — always follows completed work.
      id: 'ie_verify',
      from: 'completed',
      to: 'ie_verified',
      by: ['ipp_developer', 'operator'],
      label: 'IE verify',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ ie_verified_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into closed, and it only fires from ie_verified — so
      // an instruction can never close without Independent Engineer sign-off.
      id: 'close_instruction',
      from: 'ie_verified',
      to: 'closed',
      by: ['ipp_developer', 'operator'],
      label: 'Close instruction',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },
    {
      id: 'dispute_instruction',
      from: ['issued', 'acknowledged', 'in_execution'],
      to: 'disputed',
      by: ['ipp_developer', 'operator'],
      label: 'Dispute instruction',
      intent: 'destructive',
      requiresReason: ['scope_disagreement', 'cost_disagreement', 'technical_objection', 'schedule_impact', 'safety_concern'],
      guards: [],
      derive: (f, at: Instant) => ({ disputed_at: isoUtc(at), is_reportable: siReportable(f) }),
    },
    {
      id: 'resolve_dispute',
      from: 'disputed',
      to: 'dispute_resolved',
      by: ['ipp_developer', 'operator'],
      label: 'Resolve dispute',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ dispute_resolved_at: isoUtc(at) }),
    },

    // --- pre-issuance exits (never reachable once the contractor has acted) ----
    {
      id: 'supersede_instruction',
      from: ['draft', 'issued'],
      to: 'superseded',
      by: ['ipp_developer', 'operator'],
      label: 'Supersede instruction',
      intent: 'destructive',
      requiresReason: ['replaced_by_revision', 'duplicate_instruction', 'scope_consolidated'],
      input: { superseded_by: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ superseded_at: isoUtc(at) }),
    },
    {
      id: 'void_instruction',
      from: 'draft',
      to: 'voided',
      by: ['ipp_developer', 'operator'],
      label: 'Void instruction',
      intent: 'destructive',
      requiresReason: ['issued_in_error', 'no_longer_required', 'duplicate_instruction'],
      guards: [],
      derive: (_f, at: Instant) => ({ voided_at: isoUtc(at) }),
    },
  ],
};
