// ═══════════════════════════════════════════════════════════════════════════════
// W213 — Carbon Project Methodology Deviation & Amendment
// Verra VCS/VM0038 + Gold Standard Protocol Amendment + Article 6.4 ERD
// ═══════════════════════════════════════════════════════════════════════════════

export type MaStatus =
  | 'deviation_identified'   // deviation from approved methodology found
  | 'materiality_assessment' // assessing whether deviation is material
  | 'minor_deviation'        // non-material; documented but no re-validation needed
  | 'major_deviation'        // material deviation; re-validation required
  | 'methodology_update'     // formal amendment submitted to standard body
  | 'dna_notified'           // Designated National Authority notified (Art 6)
  | 'validator_assigned'     // new validator/verifier assigned for re-validation
  | 'revalidation'           // active re-validation process
  | 'amendment_approved'     // amendment accepted; methodology updated; terminal +
  | 'amendment_rejected'     // amendment not accepted; project must comply or stop; terminal
  | 'withdrawn';             // deviation withdrawn (corrected); terminal

export type MaAction =
  | 'start_materiality'
  | 'classify_minor'
  | 'classify_major'
  | 'submit_amendment'
  | 'notify_dna'
  | 'assign_validator'
  | 'start_revalidation'
  | 'approve_amendment'
  | 'reject_amendment'
  | 'withdraw'
  | 'sla_breach';

export type AmendmentTier =
  | 'minor_parameter'    // parameter update; unchanged methodology
  | 'moderate_change'    // significant parameter change; partial re-validation
  | 'major_change'       // methodology component change; full re-validation
  | 'article6_itmo';     // ITMO-producing project; highest scrutiny

// INVERTED SLA: higher impact amendments need more time for thorough review
export function deriveMaSla(tier: AmendmentTier): number {
  const DAYS: Record<AmendmentTier, number> = {
    minor_parameter:  14,
    moderate_change:  30,
    major_change:     60,
    article6_itmo:    90,
  };
  return DAYS[tier] ?? 30;
}

export const MA_HARD_TERMINALS = new Set<MaStatus>([
  'amendment_approved', 'amendment_rejected', 'withdrawn',
]);

export const MA_VALID_TRANSITIONS: Record<MaStatus, MaAction[]> = {
  deviation_identified:  ['start_materiality', 'withdraw', 'sla_breach'],
  materiality_assessment: ['classify_minor', 'classify_major', 'sla_breach'],
  minor_deviation:       ['withdraw', 'submit_amendment', 'sla_breach'],
  major_deviation:       ['submit_amendment', 'sla_breach'],
  methodology_update:    ['notify_dna', 'assign_validator', 'sla_breach'],
  dna_notified:          ['assign_validator', 'sla_breach'],
  validator_assigned:    ['start_revalidation', 'sla_breach'],
  revalidation:          ['approve_amendment', 'reject_amendment', 'sla_breach'],
  amendment_approved:    [],
  amendment_rejected:    [],
  withdrawn:             [],
};

export const MA_STATE_TRANSITIONS: Record<MaAction, MaStatus> = {
  start_materiality:     'materiality_assessment',
  classify_minor:        'minor_deviation',
  classify_major:        'major_deviation',
  submit_amendment:      'methodology_update',
  notify_dna:            'dna_notified',
  assign_validator:      'validator_assigned',
  start_revalidation:    'revalidation',
  approve_amendment:     'amendment_approved',
  reject_amendment:      'amendment_rejected',
  withdraw:              'withdrawn',
  sla_breach:            'deviation_identified',
};

// Regulator crossings
export function maCrossesIntoRegulator(action: MaAction, tier: AmendmentTier): boolean {
  // reject crosses for all tiers — project may need to cease or pay back credits
  if (action === 'reject_amendment') return true;
  // approve for article6/major crosses — DNA/UNFCCC notification
  if (action === 'approve_amendment') return tier === 'article6_itmo' || tier === 'major_change';
  // notify_dna is itself a regulatory action
  if (action === 'notify_dna') return true;
  return false;
}

export function maSlaBreachCrossesIntoRegulator(tier: AmendmentTier): boolean {
  return tier === 'article6_itmo' || tier === 'major_change';
}
