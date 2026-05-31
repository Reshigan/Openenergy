// ─────────────────────────────────────────────────────────────────────────
// Wave 138 - IPP Environmental Monitoring Log.
//
// PHASE E WAVE 8 OF N — IPP-PM profile-completeness wave.
//
// NEMA (National Environmental Management Act) s30 + DFFE EIA conditions
// + ISO 14001:2015 + REIPPPP environmental compliance requirements.
//
// Beats Intelex / Cority generic EMS software by embedding monitoring
// results directly in the project P6 state machine with exceedance
// detection and regulator notification.
//
// 12-state lifecycle:
//   scheduled → sampling → sample_submitted → results_received →
//   compliance_assessed → report_drafted → report_submitted → closed
//   (8-step forward path, HARD terminal: closed, cancelled)
//
//   Exceedance branch:
//   results_received/compliance_assessed → exceedance_flagged →
//   corrective_action → compliance_assessed (re-enters main path)
//   exceedance_flagged → under_investigation → compliance_assessed
//
//   Cancel:
//   scheduled/sampling → cancelled (HARD terminal)
//
// URGENT SLA polarity (HOURS) — critical parameters need fastest turnaround:
//   critical:  24h  (URGENT tightest — air quality near sensitive receptor)
//   regular:   72h  (water, groundwater, noise)
//   routine:  168h  (dust, waste, visual)
//   baseline: 720h  (annual baseline — loosest)
//
// W138 SIGNATURE crossings:
//   flag_exceedance → EVERY tier when is_near_sensitive_receptor
//   flag_exceedance → EVERY tier when floor_eia_condition_breach
//   flag_exceedance → EVERY tier when floor_nema_s30_notification
//   submit_report → EVERY tier when floor_dffe_report_required
//   SLA breach crosses when critical + is_near_sensitive_receptor
//   SLA breach crosses when floor_eia_condition_breach
//
// Write {admin, ipp_developer, support}.
// READ all 9 personas.
// AUDIT_PREFIX_MAP: ipp_env_monitoring → 'ipp' (JOINS existing IPP-PM family).
// ─────────────────────────────────────────────────────────────────────────

export type EnvMonitoringStatus =
  | 'scheduled'
  | 'sampling'
  | 'sample_submitted'
  | 'results_received'
  | 'compliance_assessed'
  | 'report_drafted'
  | 'report_submitted'
  | 'closed'
  | 'exceedance_flagged'
  | 'corrective_action'
  | 'under_investigation'
  | 'cancelled';

export type EnvMonitoringAction =
  | 'start_sampling'            // scheduled → sampling
  | 'submit_sample'             // sampling → sample_submitted
  | 'record_results'            // sample_submitted → results_received
  | 'assess_compliance'         // results_received → compliance_assessed OR exceedance_flagged
  | 'draft_report'              // compliance_assessed → report_drafted
  | 'submit_report'             // report_drafted → report_submitted
  | 'close_monitoring'          // report_submitted → closed
  | 'flag_exceedance'           // results_received/compliance_assessed → exceedance_flagged (SIGNATURE)
  | 'initiate_corrective_action' // exceedance_flagged → corrective_action
  | 'investigate_exceedance'    // exceedance_flagged → under_investigation
  | 'resolve_corrective_action' // corrective_action/under_investigation → compliance_assessed
  | 'cancel_monitoring'         // scheduled/sampling → cancelled
  | 'flag_overdue';             // cron only — does not change status

export type MonitoringTier = 'critical' | 'regular' | 'routine' | 'baseline';

// URGENT SLA — critical parameters need fastest turnaround (air quality near community)
export const SLA_HOURS: Record<MonitoringTier, number> = {
  critical: 24,   // URGENT tightest (air quality, near sensitive receptor)
  regular: 72,    // water, groundwater, noise
  routine: 168,   // dust, waste, visual
  baseline: 720,  // annual baseline (loosest)
};

export const HARD_TERMINALS: EnvMonitoringStatus[] = ['closed', 'cancelled'];

export function isHardTerminal(status: EnvMonitoringStatus): boolean {
  return HARD_TERMINALS.includes(status);
}

export const TRANSITIONS: Record<EnvMonitoringAction, { from: EnvMonitoringStatus[]; to: EnvMonitoringStatus }> = {
  start_sampling:              { from: ['scheduled'],                              to: 'sampling' },
  submit_sample:               { from: ['sampling'],                               to: 'sample_submitted' },
  record_results:              { from: ['sample_submitted'],                       to: 'results_received' },
  assess_compliance:           { from: ['results_received'],                       to: 'compliance_assessed' },
  draft_report:                { from: ['compliance_assessed'],                    to: 'report_drafted' },
  submit_report:               { from: ['report_drafted'],                         to: 'report_submitted' },
  close_monitoring:            { from: ['report_submitted'],                       to: 'closed' },
  flag_exceedance:             { from: ['results_received', 'compliance_assessed'], to: 'exceedance_flagged' },
  initiate_corrective_action:  { from: ['exceedance_flagged'],                     to: 'corrective_action' },
  investigate_exceedance:      { from: ['exceedance_flagged'],                     to: 'under_investigation' },
  resolve_corrective_action:   { from: ['corrective_action', 'under_investigation'], to: 'compliance_assessed' },
  cancel_monitoring:           { from: ['scheduled', 'sampling'],                  to: 'cancelled' },
  // flag_overdue is cron-only — does not change status; placeholder keeps action consistent
  flag_overdue: {
    from: [
      'scheduled', 'sampling', 'sample_submitted', 'results_received',
      'compliance_assessed', 'report_drafted', 'report_submitted',
      'exceedance_flagged', 'corrective_action', 'under_investigation',
    ],
    to: 'scheduled', // placeholder — nextStatus returns current for flag_overdue
  },
};

export function nextStatus(current: EnvMonitoringStatus, action: EnvMonitoringAction): EnvMonitoringStatus | null {
  if (isHardTerminal(current)) return null;
  if (action === 'flag_overdue') return current; // cron-only: status unchanged
  const t = TRANSITIONS[action];
  if (!t || !t.from.includes(current)) return null;
  return t.to;
}

// ─── W138 SIGNATURE crossings ─────────────────────────────────────────────────
//
// flag_exceedance → EVERY tier when:
//   - is_near_sensitive_receptor (school/hospital/community within 500m)
//   - floor_eia_condition_breach (EIA condition has been breached)
//   - floor_nema_s30_notification (NEMA s30 incident notification required)
//
// submit_report → EVERY tier when floor_dffe_report_required
//
export function crossesIntoRegulator(
  action: EnvMonitoringAction,
  args: {
    is_near_sensitive_receptor?: boolean | number;
    floor_eia_condition_breach?: boolean | number;
    floor_nema_s30_notification?: boolean | number;
    floor_dffe_report_required?: boolean | number;
  },
): boolean {
  if (action === 'flag_exceedance') {
    if (args.is_near_sensitive_receptor) return true;
    if (args.floor_eia_condition_breach) return true;
    if (args.floor_nema_s30_notification) return true;
  }
  if (action === 'submit_report' && args.floor_dffe_report_required) return true;
  return false;
}

export function slaBreachCrossesIntoRegulator(
  tier: MonitoringTier,
  args: {
    is_near_sensitive_receptor?: boolean | number;
    floor_eia_condition_breach?: boolean | number;
  },
): boolean {
  if (tier === 'critical' && args.is_near_sensitive_receptor) return true;
  if (args.floor_eia_condition_breach) return true;
  return false;
}

// ─── Status timestamp column mapping ─────────────────────────────────────────

export function statusTsCol(status: EnvMonitoringStatus): string {
  return `${status}_at`;
}

// ─── Event type mapping ───────────────────────────────────────────────────────

export function eventTypeFor(action: EnvMonitoringAction): string {
  return `ipp_env_monitoring.${action}`;
}

// ─── SLA helpers ─────────────────────────────────────────────────────────────

export function slaDeadlineFor(tier: MonitoringTier, from: Date): Date {
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

export const MONITORING_TIER_LABELS: Record<MonitoringTier, string> = {
  critical: 'Critical',
  regular: 'Regular',
  routine: 'Routine',
  baseline: 'Baseline',
};

export const MONITORING_CATEGORY_LABELS: Record<string, string> = {
  air_quality: 'Air quality',
  water_quality: 'Water quality',
  noise: 'Noise',
  dust: 'Dust',
  waste: 'Waste',
  land: 'Land',
  biodiversity: 'Biodiversity',
  stormwater: 'Stormwater',
  groundwater: 'Groundwater',
  visual: 'Visual',
};
