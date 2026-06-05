// ═══════════════════════════════════════════════════════════════════════════
// Wave 194 — Lender Facility Amendment & Consent
//
// Covers formal amendments to facility agreements under the LMA Standard Form
// Amendment Agreement framework, with SARB Regulation 29 notification for
// large-exposure changes, NCA s18 variation requirements, and Equator
// Principles consent requirements where applicable.
//
// Use cases:
//   tenor_extension         — extending the repayment schedule, often
//                             triggered by construction delays or market
//                             conditions; requires majority/unanimous consent
//
//   security_variation      — adding, releasing, or substituting collateral;
//                             triggers SARB Reg 29 large-exposure notification
//                             when security_variation = 1 on major/systemic
//
//   covenant_waiver         — temporary or permanent relief from financial
//                             covenants; sister to W38 certificate and W86
//                             DSCR monitoring cure chains
//
//   drawdown_schedule_change — restructuring the drawdown profile; feeds
//                              back into W21 disbursement scheduling
//
//   pricing_adjustment      — margin step-up/step-down outside the SLL
//                             ratchet mechanism (W95); arms-length repricing
//
//   guarantor_substitution  — replacing or adding guarantors/sureties;
//                             always unanimous in LMA facility agreements
//
// Amendment class and SLA polarity (INVERTED — more complex amendments
// receive MORE time because they require more lenders, more legal review,
// and potentially regulatory pre-notification):
//
//   clerical_correction     — 14 days  typographic/reference corrections
//   administrative_amendment — 21 days  agent / notice mechanics updates
//   technical_amendment     — 30 days  non-commercial technical changes
//   majority_consent        — 45 days  material commercial changes
//   unanimous_consent       — 60 days  fundamental/structural changes
//
// 12 states:
//   amendment_requested, eligibility_assessed, lender_circulated,
//   majority_response, unanimous_required, consent_obtained,
//   documentation_prepared, execution_signed, effective,
//   refused, lapsed, withdrawn
//
// 10 actions:
//   assess_eligibility, circulate_to_lenders, record_majority_response,
//   escalate_to_unanimous, obtain_consent, prepare_documentation,
//   execute_amendment, record_effective_date, refuse_amendment, lapse_amendment
//
// Regulator crossings:
//   amendment_executed  → major/systemic (SARB Reg 29 large-exposure
//                         notification when security_variation = 1)
//   refused             → systemic only (material adverse change determination
//                         is reportable at systemic tier)
//   sla_breached        → major/systemic
//
// Entity prefix: facility_amendment  Event prefix: fam_evt_
// Table: oe_facility_amendments
// WRITE: {admin, lender, ipp_developer}
// AUDIT_PREFIX_MAP: fam_evt → 'lender', facility_amendment → 'lender'
//
// Mounted at /api/facility-amendments.
// ═══════════════════════════════════════════════════════════════════════════

export type FacilityAmendmentStatus =
  | 'amendment_requested'
  | 'eligibility_assessed'
  | 'lender_circulated'
  | 'majority_response'
  | 'unanimous_required'
  | 'consent_obtained'
  | 'documentation_prepared'
  | 'execution_signed'
  | 'effective'       // TERMINAL +
  | 'refused'         // TERMINAL -
  | 'lapsed'          // TERMINAL -
  | 'withdrawn';      // TERMINAL neutral

export type FacilityAmendmentAction =
  | 'assess_eligibility'
  | 'circulate_to_lenders'
  | 'record_majority_response'
  | 'escalate_to_unanimous'
  | 'obtain_consent'
  | 'prepare_documentation'
  | 'execute_amendment'
  | 'record_effective_date'
  | 'refuse_amendment'
  | 'lapse_amendment';

// INVERTED SLA — more complex amendments receive MORE time
export type AmendmentClass =
  | 'unanimous_consent'
  | 'majority_consent'
  | 'technical_amendment'
  | 'administrative_amendment'
  | 'clerical_correction';

// ─── SLA derivation (keyed on amendment_class; INVERTED polarity) ────────────

export const SLA_DAYS: Record<AmendmentClass, number> = {
  unanimous_consent:        60,
  majority_consent:         45,
  technical_amendment:      30,
  administrative_amendment: 21,
  clerical_correction:      14,
};

export function deriveSla(amendmentClass: AmendmentClass): number {
  return SLA_DAYS[amendmentClass];
}

// ─── Hard terminals ───────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<FacilityAmendmentStatus>([
  'effective',
  'refused',
  'lapsed',
  'withdrawn',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<
  FacilityAmendmentAction,
  { from: FacilityAmendmentStatus[] }
> = {
  assess_eligibility: {
    from: ['amendment_requested'],
  },
  circulate_to_lenders: {
    from: ['eligibility_assessed'],
  },
  record_majority_response: {
    from: ['lender_circulated'],
  },
  escalate_to_unanimous: {
    from: ['majority_response'],
  },
  obtain_consent: {
    from: ['majority_response', 'unanimous_required'],
  },
  prepare_documentation: {
    from: ['consent_obtained'],
  },
  execute_amendment: {
    from: ['documentation_prepared'],
  },
  record_effective_date: {
    from: ['execution_signed'],
  },
  refuse_amendment: {
    from: [
      'eligibility_assessed',
      'lender_circulated',
      'majority_response',
      'unanimous_required',
      'consent_obtained',
    ],
  },
  lapse_amendment: {
    from: [
      'amendment_requested',
      'eligibility_assessed',
      'lender_circulated',
      'majority_response',
      'unanimous_required',
      'consent_obtained',
      'documentation_prepared',
      'execution_signed',
    ],
  },
};

// ─── State machine ────────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<FacilityAmendmentAction, FacilityAmendmentStatus> = {
  assess_eligibility:       'eligibility_assessed',
  circulate_to_lenders:     'lender_circulated',
  record_majority_response: 'majority_response',
  escalate_to_unanimous:    'unanimous_required',
  obtain_consent:           'consent_obtained',
  prepare_documentation:    'documentation_prepared',
  execute_amendment:        'execution_signed',
  record_effective_date:    'effective',
  refuse_amendment:         'refused',
  lapse_amendment:          'lapsed',
};

// ─── Regulator crossing rules ─────────────────────────────────────────────────

const MAJOR_PLUS: AmendmentClass[]   = ['majority_consent', 'unanimous_consent'];
const SYSTEMIC: AmendmentClass[]     = ['unanimous_consent'];

export function crossesIntoRegulator(
  action: FacilityAmendmentAction,
  amendmentClass: AmendmentClass,
  securityVariation: boolean,
): boolean {
  switch (action) {
    // amendment_executed (execute_amendment → execution_signed): SARB Reg 29
    // large-exposure notification when security_variation = 1 on major/systemic
    case 'execute_amendment':
      return securityVariation && MAJOR_PLUS.includes(amendmentClass);

    // refused → systemic only (material adverse change determination)
    case 'refuse_amendment':
      return SYSTEMIC.includes(amendmentClass);

    default:
      return false;
  }
}

// SLA breach crosses into regulator for major/systemic (majority_consent + unanimous_consent).
export function slaBreachCrossesIntoRegulator(amendmentClass: AmendmentClass): boolean {
  return MAJOR_PLUS.includes(amendmentClass);
}
