// ipp_lta — IPP Lender's Technical Advisor (LTA) drawdown certificate, as data.
//
// A borrower requests LTA certification of a drawdown milestone; the LTA
// firm's review is recorded (by admin/ipp_developer, mirroring the v1
// write-access model — the LTA firm itself never logs a transition, only
// appears as the named counterparty/party) as a draft certificate, then
// resolves to approve, qualify-with-conditions, or refuse. Approval unblocks
// the linked W21 drawdown chain (R-S5-1: the money moves there, not here).
//
// A qualified (conditional) certificate arms a second spine: conditions must
// be resolved with named CP evidence (cpEvidencePresent, the same guard the
// facility conditions-precedent tracker uses) before the drawdown can rely on
// it. A refusal can be appealed; the appeal spine is driven by the v1
// `appeal` filter (appeal_raised/appeal_determined) even though the v1
// actions array never named an appeal action explicitly — appeal_determined
// is a documented terminal with no other path in.
//
// Major+ (≥100 MW) approvals and refusals cross to the regulator per the v1
// cascadeHints ("crosses into the regulator inbox on major+/significant+
// drawdowns") — modelled with regulatorPresentIfStrategic off capacity_mw,
// the standard strategic-crossing convention across the IPP cluster.
//
// settles:false — the certificate gates a drawdown, it doesn't move money
// itself (R-S5-1); the disbursement settles in the linked W21 drawdown chain.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippLta: ChainDecl = {
  key: 'ipp_lta',
  noun: 'IPP LTA drawdown certificate',
  refPrefix: 'ILTA',
  title: (f) => `LTA cert — ${(f.project_id as string) ?? 'project'} (${(f.certificate_category as string) ?? 'certificate'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: "Facility Agreement drawdown certification (Lender's Technical Advisor)", effect: 'requires' },
  ],
  roles: ['ipp_developer', 'admin', 'lta_firm', 'lender', 'regulator'],

  fields: {
    drawdown_reference: { type: 'string', label: 'Drawdown reference' },
    project_id: { type: 'string', required: true, label: 'Project' },
    drawdown_amount_zar: { type: 'number', min: 0, label: 'Drawdown amount (ZAR)' },
    certificate_category: { type: 'string', label: 'Certificate category' },
    lta_firm_name: { type: 'string', label: 'LTA firm name' },
    capacity_mw: { type: 'number', min: 0, label: 'Project capacity (MW)' },
    conditions_note: { type: 'string', label: 'Conditions imposed' },
    credit_approval_ref: { type: 'string', label: 'Credit approval reference' },
    cp_evidence_ref: { type: 'string', label: 'Conditions-precedent evidence reference' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    lta_firm_party: { type: 'party', role: 'lta_firm', label: 'LTA firm' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    // derive-stamped, never client-written
    draft_issued_at: { type: 'string', label: 'Draft certificate issued at' },
    approved_at: { type: 'string', label: 'Certificate approved at' },
    qualified_at: { type: 'string', label: 'Certificate qualified at' },
    refused_at: { type: 'string', label: 'Certificate refused at' },
    conditions_resolved_at: { type: 'string', label: 'Conditions resolved at' },
    appeal_raised_at: { type: 'string', label: 'Appeal raised at' },
    appeal_determined_at: { type: 'string', label: 'Appeal determined at' },
  },

  initial: 'certificate_requested',

  states: {
    certificate_requested: { label: 'Certificate requested', terminal: false, holder: 'admin', sla: { days: 5 } },
    draft_certificate_issued: { label: 'Draft certificate issued', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    certificate_qualified: { label: 'Certificate qualified (conditions)', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    appeal_raised: { label: 'Appeal raised', terminal: false, holder: 'admin', sla: { days: 10 } },
    certificate_approved: { label: 'Certificate approved', terminal: true, holder: 'none' },
    conditions_resolved: { label: 'Conditions resolved', terminal: true, holder: 'none' },
    certificate_refused: { label: 'Certificate refused', terminal: true, holder: 'none' },
    appeal_determined: { label: 'Appeal determined', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'certificate_requested',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Request LTA drawdown certificate',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        drawdown_amount_zar: { type: 'number', min: 0 },
        certificate_category: { type: 'string' },
        drawdown_reference: { type: 'string' },
        lta_firm_name: { type: 'string' },
        capacity_mw: { type: 'number', min: 0 },
        lta_firm_party: { type: 'party', role: 'lta_firm' },
        lender_party: { type: 'party', role: 'lender' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: ['complianceHaltClear'],
    },
    {
      id: 'issue_draft_certificate',
      from: 'certificate_requested',
      to: 'draft_certificate_issued',
      by: ['ipp_developer', 'admin'],
      label: 'Issue draft certificate',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ draft_issued_at: isoUtc(at) }),
    },
    {
      // unblocks the linked W21 drawdown; major+ (≥100 MW) crosses to the regulator.
      id: 'approve_certificate',
      from: 'draft_certificate_issued',
      to: 'certificate_approved',
      by: ['ipp_developer', 'admin'],
      label: 'Approve certificate',
      intent: 'primary',
      input: { credit_approval_ref: { type: 'string', required: true } },
      guards: ['creditApprovalPresent', 'regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      // approves with conditions; arms resolve_conditions before the drawdown
      // can rely on this certificate.
      id: 'qualify_certificate',
      from: 'draft_certificate_issued',
      to: 'certificate_qualified',
      by: ['ipp_developer', 'admin'],
      label: 'Qualify certificate',
      intent: 'secondary',
      input: { conditions_note: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ qualified_at: isoUtc(at) }),
    },
    {
      // reachable from either review stage — a site failure can refuse before
      // a draft is ever issued. Significant+ drawdowns cross to the regulator
      // (SARB large-exposure per the v1 cascadeHint).
      id: 'refuse_certificate',
      from: ['certificate_requested', 'draft_certificate_issued'],
      to: 'certificate_refused',
      by: ['ipp_developer', 'admin'],
      label: 'Refuse certificate',
      intent: 'destructive',
      requiresReason: ['non_compliant_works', 'incomplete_documentation', 'milestone_not_achieved', 'cost_overrun_unsubstantiated', 'site_conditions_unsatisfactory'],
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ refused_at: isoUtc(at) }),
    },
    {
      // the ONLY path off a qualified certificate — mirrors the facility
      // conditions-precedent tracker's own cpEvidencePresent guard.
      id: 'resolve_conditions',
      from: 'certificate_qualified',
      to: 'conditions_resolved',
      by: ['ipp_developer', 'admin'],
      label: 'Resolve conditions',
      intent: 'primary',
      input: { cp_evidence_ref: { type: 'string', required: true } },
      guards: ['cpEvidencePresent'],
      derive: (_f, at: Instant) => ({ conditions_resolved_at: isoUtc(at) }),
    },

    // --- appeal spine (v1 `appeal` filter: appeal_raised / appeal_determined) --
    {
      id: 'raise_appeal',
      from: 'certificate_refused',
      to: 'appeal_raised',
      by: ['ipp_developer', 'admin'],
      label: 'Raise appeal',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ appeal_raised_at: isoUtc(at) }),
    },
    {
      id: 'determine_appeal',
      from: 'appeal_raised',
      to: 'appeal_determined',
      by: ['ipp_developer', 'admin'],
      label: 'Determine appeal',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ appeal_determined_at: isoUtc(at) }),
    },
  ],
};
