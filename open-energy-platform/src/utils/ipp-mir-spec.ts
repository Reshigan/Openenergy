// ─────────────────────────────────────────────────────────────────────────
// Wave 139 - IPP Material Inspection Record (MIR).
//
// PHASE E WAVE 9 OF N — IPP-PM profile-completeness wave.
//
// ISO 9001:2015 §8.6 + REIPPPP quality specifications +
// Equator Principles EP4 technical standards + IE oversight.
//
// Beats Procore Materials (inventory-only) by giving materials a full
// acceptance lifecycle with IE witness gate and lender rejection crossing.
//
// 12-state lifecycle:
//   delivery_notified → delivered → initial_inspection → detailed_inspection →
//   (test path: test_sampling → results_pending →)
//   approved / conditional_approval → incorporated
//   (HARD terminals: incorporated, returned_to_supplier)
//
//   Rejection branch:
//   any pre-approval state → rejected_on_site
//   any pre-approval state → quarantined
//   rejected_on_site / quarantined → returned_to_supplier (HARD terminal)
//
// URGENT SLA polarity (HOURS) — critical structural materials fastest:
//   critical_structural:  24h  (URGENT tightest — load-bearing: steel, concrete)
//   electrical_mechanical: 48h  (transformers, inverters, switchgear)
//   civil:                96h  (civil materials)
//   general:             168h  (loose materials, general consumables — loosest)
//
// W139 SIGNATURE crossings:
//   reject_material   → EVERY tier when floor_ie_witnessed
//   quarantine_material → EVERY tier when floor_critical_safety
//   approve_conditional → EVERY tier when floor_lender_hold_point
//   SLA breach crosses when critical_structural + floor_ie_witnessed
//   SLA breach crosses when floor_nersa_material AND critical_structural|electrical_mechanical
//
// Write {admin, ipp_developer, support}.
// READ all 9 personas.
// AUDIT_PREFIX_MAP: ipp_mir → 'ipp' (JOINS existing IPP-PM family).
// ─────────────────────────────────────────────────────────────────────────

export type MirStatus =
  | 'delivery_notified'
  | 'delivered'
  | 'initial_inspection'
  | 'detailed_inspection'
  | 'test_sampling'
  | 'results_pending'
  | 'approved'
  | 'conditional_approval'
  | 'incorporated'
  | 'rejected_on_site'
  | 'quarantined'
  | 'returned_to_supplier';

export type MirAction =
  | 'record_delivery'           // delivery_notified → delivered
  | 'start_initial_inspection'  // delivered → initial_inspection
  | 'proceed_to_detailed'       // initial_inspection → detailed_inspection
  | 'take_test_samples'         // detailed_inspection → test_sampling
  | 'await_results'             // test_sampling → results_pending
  | 'approve_material'          // detailed_inspection/results_pending → approved
  | 'approve_conditional'       // detailed_inspection/results_pending → conditional_approval
  | 'incorporate_material'      // approved/conditional_approval → incorporated
  | 'reject_material'           // any non-terminal non-incorporated → rejected_on_site (SIGNATURE: EVERY tier when floor_ie_witnessed)
  | 'quarantine_material'       // any non-terminal non-incorporated → quarantined (SIGNATURE: EVERY tier when floor_critical_safety)
  | 'return_to_supplier'        // rejected_on_site/quarantined → returned_to_supplier
  | 'flag_overdue';             // cron only — does not change status

export type MaterialTier = 'critical_structural' | 'electrical_mechanical' | 'civil' | 'general';

// URGENT SLA — critical structural materials need fastest inspection
export const SLA_HOURS: Record<MaterialTier, number> = {
  critical_structural: 24,    // URGENT tightest (load-bearing: steel, concrete, foundations)
  electrical_mechanical: 48,  // transformers, inverters, switchgear
  civil: 96,                  // civil materials
  general: 168,               // loose materials, general consumables (loosest)
};

export const HARD_TERMINALS: MirStatus[] = ['incorporated', 'returned_to_supplier'];

export function isHardTerminal(status: MirStatus): boolean {
  return HARD_TERMINALS.includes(status);
}

export const TRANSITIONS: Record<MirAction, { from: MirStatus[]; to: MirStatus }> = {
  record_delivery:           { from: ['delivery_notified'], to: 'delivered' },
  start_initial_inspection:  { from: ['delivered'], to: 'initial_inspection' },
  proceed_to_detailed:       { from: ['initial_inspection'], to: 'detailed_inspection' },
  take_test_samples:         { from: ['detailed_inspection'], to: 'test_sampling' },
  await_results:             { from: ['test_sampling'], to: 'results_pending' },
  approve_material:          { from: ['detailed_inspection', 'results_pending'], to: 'approved' },
  approve_conditional:       { from: ['detailed_inspection', 'results_pending'], to: 'conditional_approval' },
  incorporate_material:      { from: ['approved', 'conditional_approval'], to: 'incorporated' },
  reject_material:           {
    from: ['delivery_notified', 'delivered', 'initial_inspection', 'detailed_inspection', 'results_pending'],
    to: 'rejected_on_site',
  },
  quarantine_material:       {
    from: ['delivery_notified', 'delivered', 'initial_inspection', 'detailed_inspection', 'results_pending'],
    to: 'quarantined',
  },
  return_to_supplier:        { from: ['rejected_on_site', 'quarantined'], to: 'returned_to_supplier' },
  // flag_overdue is cron-only — does not change status; placeholder keeps action consistent
  flag_overdue:              {
    from: [
      'delivery_notified', 'delivered', 'initial_inspection', 'detailed_inspection',
      'test_sampling', 'results_pending', 'conditional_approval',
    ],
    to: 'delivery_notified', // placeholder — nextStatus returns current for flag_overdue
  },
};

export function nextStatus(current: MirStatus, action: MirAction): MirStatus | null {
  if (isHardTerminal(current)) return null;
  if (action === 'flag_overdue') return current; // cron-only: status unchanged
  const t = TRANSITIONS[action];
  if (!t || !t.from.includes(current)) return null;
  return t.to;
}

// ─── W139 SIGNATURE crossings ──────────────────────────────────────────────────
//
// reject_material → EVERY tier when floor_ie_witnessed (IE witnessed the rejection)
// quarantine_material → EVERY tier when floor_critical_safety (safety-critical quarantined)
// approve_conditional → EVERY tier when floor_lender_hold_point (lender must approve use)
//
export function crossesIntoRegulator(
  action: MirAction,
  args: {
    floor_ie_witnessed?: boolean | number;
    floor_critical_safety?: boolean | number;
    floor_nersa_material?: boolean | number;
    floor_lender_hold_point?: boolean | number;
  },
): boolean {
  if (action === 'reject_material' && args.floor_ie_witnessed) return true;
  if (action === 'quarantine_material' && args.floor_critical_safety) return true;
  if (action === 'approve_conditional' && args.floor_lender_hold_point) return true;
  return false;
}

export function slaBreachCrossesIntoRegulator(
  tier: MaterialTier,
  args: {
    floor_ie_witnessed?: boolean | number;
    floor_nersa_material?: boolean | number;
  },
): boolean {
  if (tier === 'critical_structural' && args.floor_ie_witnessed) return true;
  if (args.floor_nersa_material && (tier === 'critical_structural' || tier === 'electrical_mechanical')) return true;
  return false;
}

// ─── Status timestamp column mapping ──────────────────────────────────────────

export function statusTsCol(status: MirStatus): string {
  return `${status}_at`;
}

// ─── Event type mapping ────────────────────────────────────────────────────────

export function eventTypeFor(action: MirAction): string {
  return `ipp_mir.${action}`;
}

// ─── SLA helpers ──────────────────────────────────────────────────────────────

export function slaDeadlineFor(tier: MaterialTier, from: Date): Date {
  const d = new Date(from);
  d.setTime(d.getTime() + SLA_HOURS[tier] * 3600 * 1000);
  return d;
}

export function slaHoursRemaining(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now.getTime();
  return Math.round(ms / 3600000);
}

// ─── Label maps ───────────────────────────────────────────────────────────────

export const MATERIAL_TIER_LABELS: Record<MaterialTier, string> = {
  critical_structural: 'Critical structural',
  electrical_mechanical: 'Electrical / mechanical',
  civil: 'Civil',
  general: 'General',
};

export const MATERIAL_CATEGORY_LABELS: Record<string, string> = {
  structural_steel: 'Structural steel',
  concrete: 'Concrete',
  electrical_cable: 'Electrical cable',
  transformer: 'Transformer',
  inverter: 'Inverter',
  solar_panel: 'Solar panel',
  civil_materials: 'Civil materials',
  mechanical: 'Mechanical',
  instruments: 'Instruments',
  general: 'General',
};
