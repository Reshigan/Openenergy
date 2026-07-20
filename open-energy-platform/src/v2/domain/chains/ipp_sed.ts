// ipp_sed — an IPP's annual REIPPPP Socio-Economic Development spend cycle as data.
//
// Bid Conditions commit an IPP to spend a % of annual revenue on SED
// programmes in its host communities. The developer triggers the compliance
// year, works the programme spine (identify beneficiaries → plan → board
// approval → execute spend → verify expenditure), then an independent
// auditor signs off before the developer files with the DMRE IPP Office.
// DMRE confirmation is the structural gate: confirm_compliant leaves ONLY
// sed_compliant, and the ONLY path into dmre_submission is submit_to_dmre off
// audit_complete — so a year can NEVER be certified compliant without first
// passing through an independent audit sign-off. No guard needed, the state
// graph enforces it.
//
// The engagement is bilateral (developer's SPV vs the external audit firm):
// counterpartyDistinct on open stops an SPV "auditing" its own SED spend.
// Audit sign-off needs a named completeness evidence ref
// (completenessEvidencePresent) — you cannot ready a DMRE filing on nothing.
//
// settles:false — a SED compliance year is a regulatory record, never a
// payment (R-S5-1); annual_revenue_zar/sed_spend_zar size the obligation,
// they do not move here.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const num = (v: Json | undefined): number => (typeof v === 'number' ? v : 0);

export const ippSed: ChainDecl = {
  key: 'ipp_sed',
  noun: 'IPP SED compliance year',
  refPrefix: 'SED',
  title: (f) => `SED ${(f.compliance_year as number) ?? ''} — ${(f.project_ref as string) ?? 'project'}`.trim(),
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Bid Conditions Socio-Economic Development commitment', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'auditor', 'admin'],

  fields: {
    sed_ref: { type: 'string', label: 'SED reference' },
    project_ref: { type: 'string', required: true, label: 'Project reference' },
    ipp_developer_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer (SPV)' },
    auditor_party: { type: 'party', role: 'auditor', label: 'Independent auditor' },
    compliance_year: { type: 'number', required: true, label: 'Compliance year' },
    annual_revenue_zar: { type: 'number', required: true, min: 0, label: 'Annual revenue (ZAR)' },
    sed_spend_zar: { type: 'number', min: 0, label: 'SED spend (ZAR)' },
    // written by derive off sed_spend_zar / annual_revenue_zar, never by the client
    sed_spend_pct: { type: 'number', min: 0, label: 'SED spend (% of revenue)' },
    focus_area: { type: 'string', label: 'SED focus area' },
    notes: { type: 'string', label: 'Notes' },
    completeness_ref: { type: 'string', label: 'Completeness evidence ref' },
    non_compliance_reason: { type: 'string', label: 'Non-compliance narrative' },
    // derive-stamped timestamps
    audit_completed_at: { type: 'string', label: 'Audit completed at' },
    dmre_submitted_at: { type: 'string', label: 'Submitted to DMRE at' },
    compliance_confirmed_at: { type: 'string', label: 'Compliance confirmed at' },
    closed_at_sed: { type: 'string', label: 'SED year closed at' },
  },

  initial: 'sed_triggered',

  states: {
    sed_triggered: { label: 'SED cycle triggered', terminal: false, holder: 'ipp_developer', sla: { days: 60 } },
    beneficiary_identification: { label: 'Beneficiary identification', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    programme_planning: { label: 'Programme planning', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    board_approval: { label: 'Board approval', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    spend_execution: { label: 'Spend execution', terminal: false, holder: 'ipp_developer', sla: { days: 180 } },
    expenditure_verification: { label: 'Expenditure verification', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    independent_audit: { label: 'Independent audit', terminal: false, holder: 'auditor', sla: { days: 30 } },
    audit_complete: { label: 'Audit complete', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    dmre_submission: { label: 'DMRE submission', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    sed_compliant: { label: 'SED compliant', terminal: true, holder: 'none' },
    sed_non_compliant: { label: 'SED non-compliant', terminal: true, holder: 'none' },
    sed_lapsed: { label: 'SED cycle lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'sed_triggered',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Trigger SED compliance year',
      intent: 'primary',
      input: {
        project_ref: { type: 'string', required: true },
        compliance_year: { type: 'number', required: true },
        annual_revenue_zar: { type: 'number', required: true, min: 0 },
        sed_spend_zar: { type: 'number', min: 0 },
        focus_area: { type: 'string' },
        auditor_party: { type: 'party', role: 'auditor' },
        notes: { type: 'string' },
      },
      // an SPV cannot audit its own SED spend — the engaged firm must be distinct.
      guards: ['counterpartyDistinct'],
    },
    {
      id: 'identify_beneficiaries',
      from: 'sed_triggered',
      to: 'beneficiary_identification',
      by: ['ipp_developer', 'admin'],
      label: 'Identify SED beneficiaries',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'plan_programme',
      from: 'beneficiary_identification',
      to: 'programme_planning',
      by: ['ipp_developer', 'admin'],
      label: 'Plan SED programme',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'obtain_board_approval',
      from: 'programme_planning',
      to: 'board_approval',
      by: ['ipp_developer', 'admin'],
      label: 'Obtain board approval',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'execute_spend',
      from: 'board_approval',
      to: 'spend_execution',
      by: ['ipp_developer', 'admin'],
      label: 'Execute SED spend',
      intent: 'primary',
      input: { sed_spend_zar: { type: 'number', min: 0 } },
      guards: [],
    },
    {
      id: 'verify_expenditure',
      from: 'spend_execution',
      to: 'expenditure_verification',
      by: ['ipp_developer', 'admin'],
      label: 'Verify expenditure',
      intent: 'primary',
      guards: [],
      // % of revenue is computed off the booked spend, never client-supplied.
      derive: (f) => ({ sed_spend_pct: num(f.annual_revenue_zar) > 0 ? (num(f.sed_spend_zar) / num(f.annual_revenue_zar)) * 100 : num(f.sed_spend_pct) }),
    },
    {
      id: 'commence_independent_audit',
      from: 'expenditure_verification',
      to: 'independent_audit',
      by: ['ipp_developer', 'admin', 'auditor'],
      label: 'Commence independent audit',
      intent: 'primary',
      guards: [],
    },
    {
      // structural sign-off gate: readies the DMRE filing. Needs a named
      // completeness evidence ref.
      id: 'complete_audit',
      from: 'independent_audit',
      to: 'audit_complete',
      by: ['ipp_developer', 'admin'],
      label: 'Complete audit',
      intent: 'primary',
      input: { completeness_ref: { type: 'string', required: true } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ audit_completed_at: isoUtc(at) }),
    },
    {
      id: 'submit_to_dmre',
      from: 'audit_complete',
      to: 'dmre_submission',
      by: ['ipp_developer', 'admin'],
      label: 'Submit to DMRE',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ dmre_submitted_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into sed_compliant, reachable only from dmre_submission —
      // a year can never be certified compliant without an audited DMRE filing.
      id: 'confirm_compliant',
      from: 'dmre_submission',
      to: 'sed_compliant',
      by: ['ipp_developer', 'admin'],
      label: 'Certify compliant',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ compliance_confirmed_at: isoUtc(at), closed_at_sed: isoUtc(at) }),
    },

    // --- exits ------------------------------------------------------------
    {
      // mandatory DMRE default — a post-audit finding that the commitment
      // wasn't met. Confined to the audit/filing tail where non-compliance
      // actually becomes evident.
      id: 'declare_non_compliant',
      from: ['independent_audit', 'audit_complete', 'dmre_submission'],
      to: 'sed_non_compliant',
      by: ['ipp_developer', 'admin'],
      label: 'Flag non-compliant',
      intent: 'destructive',
      input: { non_compliance_reason: { type: 'string', required: true } },
      requiresReason: ['underspend_vs_commitment', 'programme_not_implemented', 'insufficient_evidence', 'beneficiary_ineligible', 'audit_qualification'],
      guards: [],
    },
    {
      id: 'declare_lapsed',
      from: [
        'sed_triggered',
        'beneficiary_identification',
        'programme_planning',
        'board_approval',
        'spend_execution',
        'expenditure_verification',
        'independent_audit',
        'audit_complete',
        'dmre_submission',
      ],
      to: 'sed_lapsed',
      by: ['ipp_developer', 'admin', 'system'],
      label: 'Declare SED cycle lapsed',
      intent: 'destructive',
      requiresReason: ['sla_deadline_missed', 'audit_not_commenced', 'developer_non_response', 'programme_abandoned'],
      guards: [],
    },
  ],

  // annual clock: a compliance year left untouched for 365 days from trigger
  // time-bars to lapsed (mirrors the deadlineCol/SLA concept on the legacy
  // oe_ipp_sed_compliance table).
  timers: [{ onState: 'sed_triggered', after: { days: 365 }, fire: 'declare_lapsed', kind: 'time_bar', reason: 'sla_deadline_missed' }],
};
