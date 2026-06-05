// ═══════════════════════════════════════════════════════════════════════════
// Wave 199 — Smart Meter Asset Commissioning & Data Quality Lifecycle
//
// Tracks every smart meter from procurement order through commissioning to
// operational service or decommissioning.
// Regulatory basis:
//   NRS 047 (Metering and instrumentation for electricity supply),
//   NERSA Metering Code (metering standards for embedded generation),
//   SANS 1475 (prepayment metering systems),
//   NRS 048-2 (quality of supply measurement methods).
//
// Meter classes and SLA polarity — URGENT (HV bulk tightest)
//   hv_bulk   7d  — HV bulk metering; transmission-level critical infrastructure
//   bulk     14d  — MV bulk meter; large commercial or embedded generation
//   prepaid  21d  — AMI prepaid meter; consumer-facing; revenue-critical
//   post_paid 30d — AMI post-paid; lowest operational urgency
//
// 12-state chain:
//   ordered               — purchase order raised with OEM
//   factory_acceptance    — FAT in progress at manufacturer
//   site_delivery         — meter physically received on site
//   installation_pending  — awaiting installation slot / PTW
//   installed             — physically installed in cubicle
//   commissioning         — metering firmware configured; CTs energised
//   communication_test    — AMR/AMI network connectivity validated
//   data_quality_pass     — MDMS confirms NRS 047 data quality criteria met
//   operational           — TERMINAL+ in live billing service
//   fault_detected        — non-terminal fault (asset still in place)
//   replacement_pending   — scheduled for swap-out
//   decommissioned        — TERMINAL  asset retired / condemned
//
// Regulator crossing rules (NERSA Metering Code):
//   report_fault  → hv_bulk + bulk (safety / revenue impact; mandatory notify)
//   decommission  → hv_bulk EVERY instance (transmission infrastructure)
//   sla_breach    → hv_bulk (critical infrastructure; always reportable)
//
// Write roles: admin, support (installer), grid_operator, ipp_developer (owner)
// Entity prefix: sma
// Event prefix:  sma_evt_
// Mounted at /api/smart-meter-assets
// ═══════════════════════════════════════════════════════════════════════════

export type SmaMeterStatus =
  | 'ordered'
  | 'factory_acceptance'
  | 'site_delivery'
  | 'installation_pending'
  | 'installed'
  | 'commissioning'
  | 'communication_test'
  | 'data_quality_pass'
  | 'operational'         // TERMINAL+
  | 'fault_detected'
  | 'replacement_pending'
  | 'decommissioned';     // TERMINAL

export type SmaMeterAction =
  | 'confirm_fat'
  | 'confirm_delivery'
  | 'schedule_installation'
  | 'confirm_installed'
  | 'start_commissioning'
  | 'confirm_communication'
  | 'pass_data_quality'
  | 'go_live'
  | 'report_fault'
  | 'schedule_replacement'
  | 'decommission'
  | 'return_to_service';

export type MeterClass = 'hv_bulk' | 'bulk' | 'prepaid' | 'post_paid';

// URGENT SLA — higher class = tighter (more critical infrastructure)
export const SMA_SLA_DAYS: Record<MeterClass, number> = {
  hv_bulk:   7,
  bulk:      14,
  prepaid:   21,
  post_paid: 30,
};

export function deriveSmaSla(meterClass: MeterClass): number {
  return SMA_SLA_DAYS[meterClass] ?? 21;
}

export const SMA_HARD_TERMINALS = new Set<SmaMeterStatus>([
  'operational',
  'decommissioned',
]);

export const SMA_VALID_TRANSITIONS: Record<SmaMeterAction, { from: SmaMeterStatus[] }> = {
  confirm_fat:             { from: ['ordered', 'factory_acceptance'] },
  confirm_delivery:        { from: ['factory_acceptance'] },
  schedule_installation:   { from: ['site_delivery', 'installation_pending'] },
  confirm_installed:       { from: ['installation_pending'] },
  start_commissioning:     { from: ['installed'] },
  confirm_communication:   { from: ['commissioning'] },
  pass_data_quality:       { from: ['communication_test'] },
  go_live:                 { from: ['data_quality_pass'] },
  report_fault:            { from: ['operational', 'commissioning', 'communication_test', 'data_quality_pass'] },
  schedule_replacement:    { from: ['fault_detected'] },
  decommission:            { from: ['fault_detected', 'replacement_pending', 'operational', 'installed'] },
  return_to_service:       { from: ['fault_detected'] },
};

export const SMA_STATE_TRANSITIONS: Record<SmaMeterAction, SmaMeterStatus> = {
  confirm_fat:             'factory_acceptance',
  confirm_delivery:        'site_delivery',
  schedule_installation:   'installation_pending',
  confirm_installed:       'installed',
  start_commissioning:     'commissioning',
  confirm_communication:   'communication_test',
  pass_data_quality:       'data_quality_pass',
  go_live:                 'operational',
  report_fault:            'fault_detected',
  schedule_replacement:    'replacement_pending',
  decommission:            'decommissioned',
  return_to_service:       'commissioning',
};

const CRITICAL_CLASSES: MeterClass[] = ['hv_bulk', 'bulk'];

export function smaCrossesIntoRegulator(action: SmaMeterAction, meterClass: MeterClass): boolean {
  switch (action) {
    case 'report_fault':  return CRITICAL_CLASSES.includes(meterClass);
    case 'decommission':  return meterClass === 'hv_bulk';
    default:              return false;
  }
}

export function smaSlaBreachCrossesIntoRegulator(meterClass: MeterClass): boolean {
  return meterClass === 'hv_bulk';
}
