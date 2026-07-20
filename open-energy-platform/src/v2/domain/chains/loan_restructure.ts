// loan_restructure — a distressed-facility restructure (forbearance, principal
// reschedule, maturity extension, equity cure) run by the lender agent on
// behalf of the syndicate, as data.
//
// The spine is structural: a restructure can NEVER become effective without
// (a) lender credit-committee approval and (b) syndicate consent. execute_signing
// leaves ONLY `signing`, and the only path into `signing` is record_consent from
// `consent_solicitation` — which itself only follows term_sheet_signed →
// legal_documentation → solicit_consent. So no restructure can be signed on an
// un-consented term sheet; the state graph forbids it, no guard needed.
//
// Two guards do genuine business work the graph can't:
//  - committee_approve requires a named credit_approval_ref (creditApprovalPresent)
//  - execute_signing requires conditions-precedent evidence (cpEvidencePresent)
// counterpartyDistinct at open stops a borrower restructuring its own agency line.
//
// A restructure that fails to cure returns to default: escalate_to_default is the
// destructive exit (functional floor — loan-default is cured→restructure, and an
// uncured restructure escalates back).
//
// settles:false — a restructure is a credit governance record; no money moves on
// this chain, the amended facility settles elsewhere (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure tier→urgency bucketing. No clock, no env.
const urgencyFor = (tier: Json | undefined): string => {
  switch (tier) {
    case 'systemic': return 'immediate';
    case 'material': return 'expedited';
    case 'standard': return 'routine';
    default: return 'low';
  }
};

// pure reschedule share of the outstanding book (0 when unknown).
const reschedulePct = (resched: Json | undefined, outstanding: Json | undefined): number => {
  if (typeof resched !== 'number' || typeof outstanding !== 'number' || outstanding <= 0) return 0;
  return Math.round((resched / outstanding) * 10000) / 100;
};

export const loanRestructure: ChainDecl = {
  key: 'loan_restructure',
  noun: 'Loan restructure',
  refPrefix: 'LR',
  title: (f) => `Restructure — ${(f.facility_name as string) ?? 'facility'} (${(f.borrower_name as string) ?? 'borrower'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'IFRS 9', provision: 'stage 3 impairment / modification accounting', effect: 'requires' },
    { instrument: 'SARB Prudential Authority', provision: 'large-exposure & distressed-restructure reporting', effect: 'requires' },
    { instrument: 'Common Terms Agreement', provision: 'syndicate consent thresholds (majority/unanimity)', effect: 'requires' },
  ],
  roles: ['lender_agent', 'borrower', 'regulator', 'operator'],

  fields: {
    restructure_number: { type: 'string', label: 'Restructure number' },
    lender_agent_party: { type: 'party', role: 'lender_agent', label: 'Lender agent' },
    borrower_party: { type: 'party', role: 'borrower', label: 'Borrower' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },

    facility_name: { type: 'string', required: true, label: 'Facility' },
    borrower_name: { type: 'string', label: 'Borrower name' },
    facility_amount_zar: { type: 'number', min: 0, label: 'Facility amount (ZAR)' },
    outstanding_debt_zar: { type: 'number', min: 0, label: 'Outstanding debt (ZAR)' },

    trigger_reason_code: { type: 'string', label: 'Trigger reason code' },
    trigger_narrative: { type: 'string', label: 'Trigger narrative' },
    covenant_breach_ref: { type: 'string', label: 'Covenant breach ref' },
    dscr_shortfall_ref: { type: 'string', label: 'DSCR shortfall ref' },

    current_tier: { type: 'string', required: true, label: 'Tier (minor/standard/material/systemic)' },
    urgency_band: { type: 'string', label: 'Urgency band' },

    forbearance_period_months: { type: 'number', min: 0, label: 'Forbearance period (months)' },
    principal_reschedule_zar: { type: 'number', min: 0, label: 'Principal rescheduled (ZAR)' },
    principal_reschedule_pct: { type: 'number', label: 'Principal rescheduled (%)' },
    maturity_extension_months: { type: 'number', min: 0, label: 'Maturity extension (months)' },
    proposed_relief_zar: { type: 'number', min: 0, label: 'Proposed relief (ZAR)' },

    credit_approval_ref: { type: 'string', label: 'Credit-committee approval ref' },
    consent_severity: { type: 'string', label: 'Consent severity (simple/special/super/unanimity)' },
    consent_threshold_pct: { type: 'number', min: 0, max: 100, label: 'Consent threshold (%)' },
    syndicate_size: { type: 'number', min: 1, label: 'Syndicate size' },
    consent_majority_pct: { type: 'number', min: 0, max: 100, label: 'Consent achieved (%)' },
    syndicate_consented: { type: 'number', min: 0, label: 'Lenders consented' },
    consent_majority_passed: { type: 'boolean', label: 'Consent threshold met' },
    cp_evidence_ref: { type: 'string', label: 'Conditions-precedent evidence ref' },
    legal_doc_ref: { type: 'string', label: 'Amendment & restatement ref' },

    // written by derive, never by the client
    opened_at: { type: 'string', label: 'Opened at' },
    term_sheet_signed_at: { type: 'string', label: 'Term sheet signed at' },
    consent_solicited_at: { type: 'string', label: 'Consent solicited at' },
    effective_date_at: { type: 'string', label: 'Effective date' },
    completed_at: { type: 'string', label: 'Completed at' },
  },

  initial: 'trigger_event',

  states: {
    trigger_event: { label: 'Trigger event', terminal: false, holder: 'lender_agent', sla: { hours: 48 } },
    preliminary_assessment: { label: 'Preliminary assessment', terminal: false, holder: 'lender_agent', sla: { days: 5 } },
    proposal_drafted: { label: 'Restructure proposal drafted', terminal: false, holder: 'lender_agent', sla: { days: 10 } },
    committee_review: { label: 'Lender credit-committee review', terminal: false, holder: 'lender_agent', sla: { days: 10 } },
    term_negotiation: { label: 'Borrower term-sheet negotiation', terminal: false, holder: 'borrower', sla: { days: 15 } },
    term_sheet_signed: { label: 'Term sheet signed', terminal: false, holder: 'lender_agent', sla: { days: 5 } },
    legal_documentation: { label: 'Legal documentation drafted', terminal: false, holder: 'lender_agent', sla: { days: 20 } },
    consent_solicitation: { label: 'Syndicate consent solicitation', terminal: false, holder: 'lender_agent', sla: { days: 10 } },
    signing: { label: 'Signing', terminal: false, holder: 'lender_agent', sla: { days: 5 } },
    effective: { label: 'Effective date reached', terminal: false, holder: 'lender_agent' },
    monitoring_period: { label: 'Monitoring period', terminal: false, holder: 'lender_agent' },
    completed: { label: 'Completed', terminal: true, holder: 'none' },
    rejected_by_committee: { label: 'Rejected by committee', terminal: true, holder: 'none' },
    abandoned: { label: 'Abandoned', terminal: true, holder: 'none' },
    escalated_to_default: { label: 'Escalated to default', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'trigger_event',
      by: ['lender_agent', 'operator'],
      actorBecomes: 'lender_agent',
      label: 'Open restructure',
      intent: 'primary',
      input: {
        facility_name: { type: 'string', required: true },
        borrower_name: { type: 'string' },
        facility_amount_zar: { type: 'number', min: 0 },
        outstanding_debt_zar: { type: 'number', min: 0 },
        trigger_reason_code: { type: 'string' },
        trigger_narrative: { type: 'string' },
        covenant_breach_ref: { type: 'string' },
        dscr_shortfall_ref: { type: 'string' },
        current_tier: { type: 'string', required: true },
        borrower_party: { type: 'party', role: 'borrower' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // borrower cannot restructure its own agency line.
      guards: ['counterpartyDistinct'],
      derive: (f, at: Instant) => ({ opened_at: isoUtc(at), urgency_band: urgencyFor(f.current_tier) }),
    },
    {
      id: 'begin_assessment',
      from: 'trigger_event',
      to: 'preliminary_assessment',
      by: ['lender_agent'],
      label: 'Begin preliminary assessment',
      intent: 'primary',
      input: { covenant_breach_ref: { type: 'string' }, dscr_shortfall_ref: { type: 'string' } },
      guards: [],
    },
    {
      id: 'draft_proposal',
      from: 'preliminary_assessment',
      to: 'proposal_drafted',
      by: ['lender_agent'],
      label: 'Draft restructure proposal',
      intent: 'primary',
      input: {
        forbearance_period_months: { type: 'number', min: 0 },
        principal_reschedule_zar: { type: 'number', min: 0 },
        maturity_extension_months: { type: 'number', min: 0 },
        proposed_relief_zar: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ principal_reschedule_pct: reschedulePct(f.principal_reschedule_zar, f.outstanding_debt_zar) }),
    },
    {
      id: 'submit_to_committee',
      from: 'proposal_drafted',
      to: 'committee_review',
      by: ['lender_agent'],
      label: 'Submit to credit committee',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'committee_approve',
      from: 'committee_review',
      to: 'term_negotiation',
      by: ['lender_agent'],
      label: 'Credit committee approves',
      intent: 'primary',
      input: { credit_approval_ref: { type: 'string' } },
      // committee sign-off needs a named credit-approval ref on the txn.
      guards: ['creditApprovalPresent'],
    },
    {
      id: 'agree_terms',
      from: 'term_negotiation',
      to: 'term_sheet_signed',
      by: ['borrower', 'lender_agent'],
      label: 'Agree & sign term sheet',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ term_sheet_signed_at: isoUtc(at) }),
    },
    {
      id: 'draft_legal',
      from: 'term_sheet_signed',
      to: 'legal_documentation',
      by: ['lender_agent'],
      label: 'Draft amendment & restatement',
      intent: 'primary',
      input: { legal_doc_ref: { type: 'string' } },
      guards: [],
    },
    {
      id: 'solicit_consent',
      from: 'legal_documentation',
      to: 'consent_solicitation',
      by: ['lender_agent'],
      label: 'Solicit syndicate consent',
      intent: 'primary',
      input: {
        consent_severity: { type: 'string' },
        consent_threshold_pct: { type: 'number', min: 0, max: 100 },
        syndicate_size: { type: 'number', min: 1 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ consent_solicited_at: isoUtc(at) }),
    },
    {
      // structural consent gate: the ONLY edge into `signing`. Reachable only
      // from consent_solicitation, so a restructure cannot sign un-consented.
      id: 'record_consent',
      from: 'consent_solicitation',
      to: 'signing',
      by: ['lender_agent'],
      label: 'Record syndicate consent',
      intent: 'primary',
      input: {
        consent_majority_pct: { type: 'number', min: 0, max: 100 },
        syndicate_consented: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (f, _at: Instant) => ({
        consent_majority_passed:
          typeof f.consent_majority_pct === 'number' &&
          typeof f.consent_threshold_pct === 'number' &&
          f.consent_majority_pct >= f.consent_threshold_pct,
      }),
    },
    {
      id: 'execute_signing',
      from: 'signing',
      to: 'effective',
      by: ['lender_agent'],
      label: 'Execute & reach effective date',
      intent: 'primary',
      input: { cp_evidence_ref: { type: 'string' } },
      // conditions-precedent must be evidenced before the amendment goes live.
      guards: ['cpEvidencePresent'],
      derive: (_f, at: Instant) => ({ effective_date_at: isoUtc(at) }),
    },
    {
      id: 'begin_monitoring',
      from: 'effective',
      to: 'monitoring_period',
      by: ['lender_agent'],
      label: 'Begin monitoring period',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'complete',
      from: 'monitoring_period',
      to: 'completed',
      by: ['lender_agent'],
      label: 'Complete restructure',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ completed_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_by_committee',
      from: 'committee_review',
      to: 'rejected_by_committee',
      by: ['lender_agent'],
      label: 'Reject at committee',
      intent: 'destructive',
      requiresReason: ['insufficient_relief', 'unviable_business_plan', 'inadequate_security', 'policy_breach'],
      guards: [],
    },
    {
      id: 'abandon',
      from: ['preliminary_assessment', 'proposal_drafted', 'term_negotiation', 'term_sheet_signed', 'legal_documentation', 'consent_solicitation'],
      to: 'abandoned',
      by: ['lender_agent', 'borrower'],
      label: 'Abandon restructure',
      intent: 'destructive',
      requiresReason: ['borrower_withdrew', 'terms_not_agreed', 'superseded', 'refinanced_elsewhere'],
      guards: [],
    },
    {
      id: 'escalate_to_default',
      from: ['trigger_event', 'preliminary_assessment', 'committee_review', 'term_negotiation', 'consent_solicitation', 'signing'],
      to: 'escalated_to_default',
      by: ['lender_agent', 'regulator', 'system'],
      label: 'Escalate to default',
      intent: 'destructive',
      requiresReason: ['cure_failed', 'consent_lapsed', 'further_deterioration', 'acceleration_triggered'],
      guards: [],
    },
  ],

  // consent-solicitation time-bar: a solicitation un-consented 30 days out (well
  // past the 10-day state sla) lapses and the uncured restructure escalates back
  // to default (ppa_contract pattern).
  timers: [{ onState: 'consent_solicitation', after: { days: 30 }, fire: 'escalate_to_default', kind: 'time_bar', reason: 'consent_lapsed' }],
};
