// ═══════════════════════════════════════════════════════════════════════════
// Wave 160 — IPP EPC Contractor Default & Termination chain (P6)
//
// FIDIC Silver Book Sub-Clause 15.2 (termination by employer) + REIPPPP PPA
// Schedule 3 §9 (contractor default events affecting the PPA) + ERA 2006 §35
// (material change to project resulting in licence amendment requirement).
//
// IPP/employer perspective: the IPP is the employer in the EPC contract.
// Triggered when the EPC contractor fails a material obligation and the cure
// window expires (FIDIC 28-day notice + 42-day cure).
//
// Mounted at /api/ipp-contractor-default.
//
// URGENT SLA: larger contract value → more financial exposure → TIGHTER window.
// WRITE: admin | ipp_developer
//
// Signature reportability:
//   confirm_default    → EVERY tier (confirmed EPC default is a material event)
//   appoint_replacement→ EVERY tier (new EPC triggers NERSA licence amendment)
//   invoke_step_in_rights→ major + material (lender step-in = SARB large-exposure)
// ═══════════════════════════════════════════════════════════════════════════

export type ContractorDefaultStatus =
  | 'default_identified'
  | 'notice_of_default_issued'
  | 'cure_period_in_progress'
  | 'default_confirmed'
  | 'termination_notice_issued'
  | 'step_in_assessed'
  | 'bond_call_initiated'
  | 'handover_in_progress'
  | 'replacement_tendering'
  | 'replacement_appointed'   // TERMINAL
  | 'settlement_agreed'       // TERMINAL — amicable resolution
  | 'withdrawn';              // TERMINAL — termination notice withdrawn

export type ContractorDefaultAction =
  | 'issue_default_notice'
  | 'acknowledge_cure_period'
  | 'confirm_default'
  | 'issue_termination_notice'
  | 'assess_step_in_rights'
  | 'invoke_step_in_rights'
  | 'initiate_bond_call'
  | 'commence_handover'
  | 'award_replacement_contract'
  | 'appoint_replacement'
  | 'reach_settlement'
  | 'withdraw_termination';

export type ContractTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

export type DefaultCategory =
  | 'insolvency'
  | 'material_breach'
  | 'programme_delay'
  | 'quality_failure'
  | 'abandonment'
  | 'force_majeure_related';

// ─── Tier derivation ─────────────────────────────────────────────────────────
// Keyed on EPC contract value (ZAR).

export function deriveContractTier(contract_value_zar: number): ContractTier {
  if (contract_value_zar < 50_000_000)    return 'minor';
  if (contract_value_zar < 250_000_000)   return 'moderate';
  if (contract_value_zar < 1_000_000_000) return 'significant';
  if (contract_value_zar < 5_000_000_000) return 'major';
  return 'material';
}

// ─── URGENT SLA (larger contract → tighter deadline) ──────────────────────

export const SLA_DAYS: Record<ContractTier, number> = {
  minor:       90,
  moderate:    75,
  significant: 60,
  major:       45,
  material:    30,
};

// ─── Hard terminals ─────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<ContractorDefaultStatus>([
  'replacement_appointed',
  'settlement_agreed',
  'withdrawn',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<
  ContractorDefaultAction,
  { from: ContractorDefaultStatus[] }
> = {
  issue_default_notice:      { from: ['default_identified'] },
  acknowledge_cure_period:   { from: ['notice_of_default_issued'] },
  confirm_default:           { from: ['cure_period_in_progress', 'notice_of_default_issued'] },
  issue_termination_notice:  { from: ['default_confirmed'] },
  assess_step_in_rights:     { from: ['termination_notice_issued'] },
  invoke_step_in_rights:     { from: ['step_in_assessed'] },
  initiate_bond_call:        { from: ['termination_notice_issued', 'step_in_assessed', 'bond_call_initiated'] },
  commence_handover:         { from: ['termination_notice_issued', 'step_in_assessed', 'bond_call_initiated'] },
  award_replacement_contract:{ from: ['handover_in_progress', 'replacement_tendering'] },
  appoint_replacement:       { from: ['replacement_tendering', 'handover_in_progress'] },
  reach_settlement:          { from: [
    'default_identified', 'notice_of_default_issued', 'cure_period_in_progress',
    'default_confirmed', 'termination_notice_issued', 'step_in_assessed',
    'bond_call_initiated', 'handover_in_progress', 'replacement_tendering',
  ]},
  withdraw_termination:      { from: [
    'notice_of_default_issued', 'cure_period_in_progress', 'default_confirmed',
    'termination_notice_issued',
  ]},
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: ContractTier[] = ['minor', 'moderate', 'significant', 'major', 'material'];
const MAJOR_PLUS: ContractTier[] = ['major', 'material'];

export function crossesIntoRegulator(
  action: ContractorDefaultAction,
  tier: ContractTier,
): boolean {
  switch (action) {
    case 'confirm_default':      return ALL_TIERS.includes(tier);
    case 'appoint_replacement':  return ALL_TIERS.includes(tier);
    case 'invoke_step_in_rights':return MAJOR_PLUS.includes(tier);
    case 'reach_settlement':     return MAJOR_PLUS.includes(tier);
    default:                     return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: ContractTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
