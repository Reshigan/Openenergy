// ═══════════════════════════════════════════════════════════════════════════════
// W202 — IPP Green Bond Allocation & Climate Finance Report
// ICMA GBP 2021 + JSE Green Bond Segment Rules + CBI Climate Bonds Standard
// ═══════════════════════════════════════════════════════════════════════════════

export type GbrStatus =
  | 'period_open'
  | 'data_gathering'
  | 'impact_calculation'
  | 'external_review'
  | 'board_approval'
  | 'submitted_jse'
  | 'under_review'
  | 'queries_raised'
  | 'queries_responded'
  | 'approved'         // terminal +
  | 'published'        // terminal + (publicly disclosed)
  | 'deficiency_noted' // JSE flag
  | 'remediation'
  | 'rejected';        // terminal — JSE rejects report

export type GbrAction =
  | 'open_period'
  | 'start_data_gathering'
  | 'complete_impact_calc'
  | 'submit_for_external_review'
  | 'complete_external_review'
  | 'board_approve'
  | 'submit_to_jse'
  | 'jse_raises_queries'
  | 'respond_to_queries'
  | 'jse_approve'
  | 'publish'
  | 'note_deficiency'
  | 'start_remediation'
  | 'refile'
  | 'reject'
  | 'sla_breach';

export type BondClass = 'project' | 'corporate' | 'sovereign' | 'securitised';

// INVERTED SLA: larger issuance = more scrutiny time
export function deriveGbrSla(_bondClass: BondClass, issuanceSizeZar: number): number {
  if (issuanceSizeZar >= 1_000_000_000) return 90; // ≥R1bn
  if (issuanceSizeZar >= 100_000_000) return 60;   // ≥R100m
  if (issuanceSizeZar >= 10_000_000) return 45;    // ≥R10m
  return 30;
}

export const GBR_HARD_TERMINALS = new Set<GbrStatus>([
  'approved', 'published', 'rejected',
]);

export const GBR_VALID_TRANSITIONS: Record<GbrStatus, GbrAction[]> = {
  period_open:      ['start_data_gathering', 'sla_breach'],
  data_gathering:   ['complete_impact_calc', 'sla_breach'],
  impact_calculation: ['submit_for_external_review', 'sla_breach'],
  external_review:  ['complete_external_review', 'sla_breach'],
  board_approval:   ['board_approve', 'sla_breach'],
  submitted_jse:    ['jse_raises_queries', 'jse_approve', 'note_deficiency', 'sla_breach'],
  under_review:     ['jse_raises_queries', 'jse_approve', 'note_deficiency', 'reject', 'sla_breach'],
  queries_raised:   ['respond_to_queries', 'sla_breach'],
  queries_responded: ['jse_approve', 'note_deficiency', 'reject', 'sla_breach'],
  deficiency_noted: ['start_remediation', 'reject', 'sla_breach'],
  remediation:      ['refile', 'reject', 'sla_breach'],
  approved:         ['publish'],
  published:        [],
  rejected:         [],
};

export const GBR_STATE_TRANSITIONS: Record<GbrAction, GbrStatus> = {
  open_period:               'data_gathering',
  start_data_gathering:      'data_gathering',
  complete_impact_calc:      'impact_calculation',
  submit_for_external_review: 'external_review',
  complete_external_review:  'board_approval',
  board_approve:             'submitted_jse',
  submit_to_jse:             'under_review',
  jse_raises_queries:        'queries_raised',
  respond_to_queries:        'queries_responded',
  jse_approve:               'approved',
  publish:                   'published',
  note_deficiency:           'deficiency_noted',
  start_remediation:         'remediation',
  refile:                    'submitted_jse',
  reject:                    'rejected',
  sla_breach:                'period_open',
};

// Regulator / JSE crossing
export function gbrCrossesIntoRegulator(action: GbrAction, issuanceSizeZar: number): boolean {
  // Always: submit_to_jse, jse_approve, publish, reject
  if (['board_approve', 'jse_approve', 'publish', 'reject'].includes(action)) return true;
  // Large (≥R100m): note_deficiency
  if (action === 'note_deficiency' && issuanceSizeZar >= 100_000_000) return true;
  return false;
}

export function gbrSlaBreachCrossesIntoRegulator(issuanceSizeZar: number): boolean {
  return issuanceSizeZar >= 100_000_000; // ≥R100m breaches are always JSE reportable
}
