// ═══════════════════════════════════════════════════════════════════════════
// Wave 167 — IPP O&M Contract Renewal & Novation spec
//
// REIPPPP Schedule 3 (O&M obligations) + LMA O&M covenant clause +
// NEC3 / FIDIC O&M contract terms. Post-COD O&M contracts (typically 5-year
// terms) must be renewed or novated when: the term expires, the O&M
// contractor is replaced, or the lenders exercise step-in rights. The IPP
// must obtain lender consent (through the Lender's Technical Advisor) and
// NERSA acknowledgement before the replacement contractor can commence.
//
// Mounted at /api/ipp-om-contract.
//
// INVERTED SLA: larger annual O&M value → more lender scrutiny → MORE time.
//
// 12-state chain:
//   renewal_triggered → market_sounding → tender_issued → bids_received
//   → evaluation_complete → preferred_bidder_selected → lender_consent
//   → nersa_acknowledgement → contract_executed (terminal)
//   → renewal_failed (terminal)
//   → novation_pending → novation_executed (terminal)
//
// Signature reportability:
//   renewal_failed  → EVERY tier (O&M gap = plant downtime risk, always notifiable)
//   execute_novation → significant + major + material (lender-notifiable)
//   execute_contract → major + material (NERSA disclosure for large O&M)
// ═══════════════════════════════════════════════════════════════════════════

export type OmContractStatus =
  | 'renewal_triggered'
  | 'market_sounding'
  | 'tender_issued'
  | 'bids_received'
  | 'evaluation_complete'
  | 'preferred_bidder_selected'
  | 'lender_consent'
  | 'nersa_acknowledgement'
  | 'contract_executed'    // TERMINAL
  | 'renewal_failed'       // TERMINAL
  | 'novation_pending'
  | 'novation_executed';   // TERMINAL

export type OmContractAction =
  | 'commence_market_sounding'
  | 'issue_tender'
  | 'close_bids'
  | 'complete_evaluation'
  | 'select_preferred_bidder'
  | 'obtain_lender_consent'
  | 'obtain_nersa_acknowledgement'
  | 'execute_contract'
  | 'declare_renewal_failed'
  | 'trigger_novation'
  | 'execute_novation';

export type OmValueTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

export type OmContractCategory =
  | 'full_om'
  | 'maintenance_only'
  | 'operations_only'
  | 'asset_management'
  | 'specialist_equipment'
  | 'novation';

// ─── Tier derivation (keyed on annual_om_value_zar) ──────────────────────────

export function deriveOmValueTier(annual_om_value_zar: number): OmValueTier {
  if (annual_om_value_zar < 2_000_000)    return 'minor';
  if (annual_om_value_zar < 10_000_000)   return 'moderate';
  if (annual_om_value_zar < 50_000_000)   return 'significant';
  if (annual_om_value_zar < 200_000_000)  return 'major';
  return 'material';
}

// ─── INVERTED SLA (larger O&M value → more lender scrutiny → more time) ─────

export const SLA_DAYS: Record<OmValueTier, number> = {
  minor:       21,
  moderate:    30,
  significant: 45,
  major:       60,
  material:    90,
};

// ─── Hard terminals ─────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<OmContractStatus>([
  'contract_executed',
  'renewal_failed',
  'novation_executed',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<
  OmContractAction,
  { from: OmContractStatus[] }
> = {
  commence_market_sounding:       { from: ['renewal_triggered'] },
  issue_tender:                   { from: ['market_sounding'] },
  close_bids:                     { from: ['tender_issued'] },
  complete_evaluation:            { from: ['bids_received'] },
  select_preferred_bidder:        { from: ['evaluation_complete'] },
  obtain_lender_consent:          { from: ['preferred_bidder_selected'] },
  obtain_nersa_acknowledgement:   { from: ['lender_consent'] },
  execute_contract:               { from: ['nersa_acknowledgement', 'lender_consent'] },
  declare_renewal_failed:         { from: ['market_sounding', 'tender_issued', 'bids_received', 'evaluation_complete', 'lender_consent'] },
  trigger_novation:               { from: ['renewal_triggered', 'renewal_failed'] },
  execute_novation:               { from: ['novation_pending'] },
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: OmValueTier[] = ['minor', 'moderate', 'significant', 'major', 'material'];
const SIGNIFICANT_PLUS: OmValueTier[] = ['significant', 'major', 'material'];
const MAJOR_PLUS: OmValueTier[] = ['major', 'material'];

export function crossesIntoRegulator(
  action: OmContractAction,
  tier: OmValueTier,
): boolean {
  switch (action) {
    case 'declare_renewal_failed': return ALL_TIERS.includes(tier);
    case 'execute_novation':       return SIGNIFICANT_PLUS.includes(tier);
    case 'execute_contract':       return MAJOR_PLUS.includes(tier);
    default:                       return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: OmValueTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
