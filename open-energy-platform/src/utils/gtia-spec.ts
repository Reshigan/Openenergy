// ═══════════════════════════════════════════════════════════════════════════════
// W224 — IPP Grid Technical Interface Agreement (GTIA)
// NERSA Grid Code §C-4: protection relay, SCADA, metering interface settings
// between IPP/generator and network operator (SO/DSO)
// Related to: W28 (GCA), W58 (capacity allocation), W75 (energization/commissioning)
// ═══════════════════════════════════════════════════════════════════════════════

export type GtiaStatus =
  | 'gtia_initiated'           // grid operator initiates GTIA process
  | 'ipp_under_review'         // IPP reviewing technical interface specifications
  | 'queries_raised'           // IPP has raised technical/engineering queries
  | 'queries_responded'        // grid operator responded to all queries
  | 'ipp_approved'             // IPP formally approved proposed interface settings
  | 'so_under_review'          // SO reviewing IPP protection/SCADA configuration
  | 'protection_settings_agreed' // protection relay settings agreed by both parties
  | 'scada_interface_agreed'   // SCADA/metering interface fully agreed
  | 'gtia_executed'            // GTIA signed & registered; terminal+
  | 'ipp_rejected'             // IPP rejected SO interface requirements; terminal
  | 'so_rejected'              // SO rejected IPP technical specs; terminal
  | 'withdrawn';               // withdrawn before execution; terminal

export type GtiaAction =
  | 'initiate_gtia'
  | 'raise_queries'
  | 'respond_to_queries'
  | 'ipp_approve'
  | 'commence_so_review'
  | 'agree_protection_settings'
  | 'agree_scada_interface'
  | 'execute_gtia'
  | 'ipp_reject'
  | 'so_reject'
  | 'withdraw'
  | 'sla_breach';

export type GtiaTier =
  | 'small'   // <10 MW; 7d
  | 'medium'  // 10–100 MW; 14d
  | 'large'   // 100–500 MW; 21d
  | 'bulk';   // >500 MW; 28d

// INVERTED SLA: larger connections require more engineering interface time
export function deriveGtiaSla(tier: GtiaTier): number {
  const DAYS: Record<GtiaTier, number> = {
    small:  7,
    medium: 14,
    large:  21,
    bulk:   28,
  };
  return DAYS[tier] ?? 14;
}

export const GTIA_HARD_TERMINALS = new Set<GtiaStatus>([
  'gtia_executed', 'ipp_rejected', 'so_rejected', 'withdrawn',
]);

export const GTIA_VALID_TRANSITIONS: Record<GtiaStatus, GtiaAction[]> = {
  gtia_initiated:              ['initiate_gtia', 'withdraw', 'sla_breach'],
  ipp_under_review:            ['raise_queries', 'ipp_approve', 'ipp_reject', 'withdraw', 'sla_breach'],
  queries_raised:              ['respond_to_queries', 'so_reject', 'sla_breach'],
  queries_responded:           ['ipp_approve', 'raise_queries', 'sla_breach'],
  ipp_approved:                ['commence_so_review', 'sla_breach'],
  so_under_review:             ['agree_protection_settings', 'so_reject', 'sla_breach'],
  protection_settings_agreed:  ['agree_scada_interface', 'so_reject', 'sla_breach'],
  scada_interface_agreed:      ['execute_gtia', 'so_reject', 'sla_breach'],
  gtia_executed:               [],
  ipp_rejected:                [],
  so_rejected:                 [],
  withdrawn:                   [],
};

export const GTIA_STATE_TRANSITIONS: Record<GtiaAction, GtiaStatus> = {
  initiate_gtia:              'ipp_under_review',
  raise_queries:              'queries_raised',
  respond_to_queries:         'queries_responded',
  ipp_approve:                'ipp_approved',
  commence_so_review:         'so_under_review',
  agree_protection_settings:  'protection_settings_agreed',
  agree_scada_interface:      'scada_interface_agreed',
  execute_gtia:               'gtia_executed',
  ipp_reject:                 'ipp_rejected',
  so_reject:                  'so_rejected',
  withdraw:                   'withdrawn',
  sla_breach:                 'ipp_under_review',
};

// Regulator crossings
export function gtiaCrossesIntoRegulator(action: GtiaAction, tier: GtiaTier): boolean {
  // SO rejecting a grid interface is a grid code compliance failure — reportable always
  if (action === 'so_reject') return true;
  // GTIA execution for large/bulk triggers COD readiness notification to NERSA/NTCSA
  if (action === 'execute_gtia') return tier === 'large' || tier === 'bulk';
  return false;
}

export function gtiaSlaBreachCrossesIntoRegulator(tier: GtiaTier): boolean {
  return tier === 'large' || tier === 'bulk';
}
