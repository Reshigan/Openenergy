// ═══════════════════════════════════════════════════════════════════════════
// Wave 198 — Participant KYC / FICA Entity Verification
//
// Identity and entity verification lifecycle for every platform participant.
// Regulatory basis:
//   FICA Act 38/2001 (accountable institutions, risk-based approach),
//   FIC Guidance Note 7 (electronic identification),
//   POPIA (lawful processing of biometric and personal data),
//   National Treasury AML/CFT Risk Assessment.
//
// Risk levels and SLA polarity — INVERTED (higher risk = more time)
//   standard   5d  — low-risk SA company or individual; straightforward ID check
//   medium    10d  — foreign entity or complex beneficial ownership
//   high_risk 20d  — high-risk jurisdiction, adverse media, complex structure
//   pep       30d  — politically exposed person; mandatory EDD; FATF requirement
//
// 12-state chain:
//   pending_submission      — account exists; KYC pack not yet uploaded
//   documents_submitted     — participant uploaded documents
//   documents_incomplete    — compliance requests additional documents
//   documents_received      — all required documents confirmed in hand
//   automated_screening     — PEP / sanctions / adverse-media screening running
//   enhanced_due_diligence  — EDD triggered by risk signal
//   compliance_review       — compliance officer manually reviewing
//   conditionally_approved  — approved subject to stated conditions
//   verified                — TERMINAL+ fully KYC-clear
//   rejected                — TERMINAL  access denied
//   suspended               — post-verification suspension (SAR / CDD review)
//   lapsed                  — TERMINAL  failed to submit within deadline
//
// Regulator crossing rules (FIC):
//   trigger_edd    → high_risk + pep (FATF DNFBP notification)
//   reject         → EVERY tier     (market-access denial; FIC reportable)
//   suspend        → EVERY tier     (potential SAR; FIC immediate notification)
//   mark_lapsed    → EVERY tier     (non-cooperative entity; FIC reportable)
//
// Write roles: admin, support
// Entity prefix: kyc
// Event prefix:  kyc_evt_
// Mounted at /api/kyc-verifications
// ═══════════════════════════════════════════════════════════════════════════

export type KycStatus =
  | 'pending_submission'
  | 'documents_submitted'
  | 'documents_incomplete'
  | 'documents_received'
  | 'automated_screening'
  | 'enhanced_due_diligence'
  | 'compliance_review'
  | 'conditionally_approved'
  | 'verified'           // TERMINAL+
  | 'rejected'           // TERMINAL
  | 'suspended'
  | 'lapsed';            // TERMINAL

export type KycAction =
  | 'submit_documents'
  | 'request_more_documents'
  | 'confirm_documents_received'
  | 'run_screening'
  | 'trigger_edd'
  | 'complete_edd'
  | 'start_review'
  | 'approve_conditionally'
  | 'lift_conditions'
  | 'verify'
  | 'reject'
  | 'suspend'
  | 'reinstate'
  | 'mark_lapsed';

export type RiskLevel = 'standard' | 'medium' | 'high_risk' | 'pep';

// INVERTED SLA — higher risk gets MORE time (deeper scrutiny)
export const KYC_SLA_DAYS: Record<RiskLevel, number> = {
  standard:  5,
  medium:   10,
  high_risk: 20,
  pep:       30,
};

export function deriveKycSla(riskLevel: RiskLevel): number {
  return KYC_SLA_DAYS[riskLevel] ?? 10;
}

export const KYC_HARD_TERMINALS = new Set<KycStatus>([
  'verified',
  'rejected',
  'lapsed',
]);

export const KYC_VALID_TRANSITIONS: Record<KycAction, { from: KycStatus[] }> = {
  submit_documents:          { from: ['pending_submission', 'documents_incomplete'] },
  request_more_documents:    { from: ['documents_submitted', 'documents_received'] },
  confirm_documents_received: { from: ['documents_submitted'] },
  run_screening:             { from: ['documents_received'] },
  trigger_edd:               { from: ['automated_screening', 'documents_received'] },
  complete_edd:              { from: ['enhanced_due_diligence'] },
  start_review:              { from: ['automated_screening', 'enhanced_due_diligence', 'documents_received'] },
  approve_conditionally:     { from: ['compliance_review'] },
  lift_conditions:           { from: ['conditionally_approved'] },
  verify:                    { from: ['compliance_review', 'conditionally_approved'] },
  reject:                    { from: ['compliance_review', 'automated_screening', 'enhanced_due_diligence', 'documents_received', 'conditionally_approved'] },
  suspend:                   { from: ['verified', 'conditionally_approved', 'compliance_review'] },
  reinstate:                 { from: ['suspended'] },
  mark_lapsed:               { from: ['pending_submission', 'documents_submitted', 'documents_incomplete'] },
};

export const KYC_STATE_TRANSITIONS: Record<KycAction, KycStatus> = {
  submit_documents:           'documents_submitted',
  request_more_documents:     'documents_incomplete',
  confirm_documents_received: 'documents_received',
  run_screening:              'automated_screening',
  trigger_edd:                'enhanced_due_diligence',
  complete_edd:               'compliance_review',
  start_review:               'compliance_review',
  approve_conditionally:      'conditionally_approved',
  lift_conditions:            'verified',
  verify:                     'verified',
  reject:                     'rejected',
  suspend:                    'suspended',
  reinstate:                  'compliance_review',
  mark_lapsed:                'lapsed',
};

const ALL_RISK_LEVELS: RiskLevel[] = ['standard', 'medium', 'high_risk', 'pep'];
const EDD_TRIGGERS: RiskLevel[] = ['high_risk', 'pep'];

export function kycCrossesIntoRegulator(action: KycAction, riskLevel: RiskLevel): boolean {
  switch (action) {
    case 'trigger_edd':  return EDD_TRIGGERS.includes(riskLevel);
    case 'reject':       return ALL_RISK_LEVELS.includes(riskLevel);
    case 'suspend':      return ALL_RISK_LEVELS.includes(riskLevel);
    case 'mark_lapsed':  return ALL_RISK_LEVELS.includes(riskLevel);
    default:             return false;
  }
}

export function kycSlaBreachCrossesIntoRegulator(_riskLevel: RiskLevel): boolean {
  return true; // every KYC SLA breach is FIC-reportable
}
