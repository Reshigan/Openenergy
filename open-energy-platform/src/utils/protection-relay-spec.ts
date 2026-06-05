// ═══════════════════════════════════════════════════════════════════════════
// Wave 196 — Grid Protection Relay & Anti-Islanding Compliance Test
//
// Protection relays are critical safety devices that isolate faulty sections
// of the electrical network from healthy portions, preventing damage to
// equipment and ensuring personnel safety.  Anti-islanding protection is
// specifically required at embedded generation connection points to prevent
// a generator from continuing to energise a section of the grid that has
// been disconnected from the main supply — a serious safety hazard for field
// crews working on what they believe to be de-energised lines.
//
// Regulatory framework
// ────────────────────
// NRS 097-2-3 (Grid-Interactive Embedded Generation) mandates periodic relay
// functional testing as a condition of continued grid-connection authorisation
// for all embedded generators.  NERSA Grid Code Chapter 3 specifies the
// technical requirements for protection systems, including:
//   - Voltage and frequency trip setpoints
//   - Clearing time requirements (typically <150 ms for transmission-connected)
//   - Anti-islanding detection methods (active/passive/hybrid)
//   - Reclosure coordination with the utility's auto-reclosers
//
// SANS 1012 covers the calibration and testing standards for protective
// relays and associated current/voltage transformers.  IEC 60255 (family of
// standards) defines the measurement, functional and performance requirements
// for electrical protection relays.
//
// Test lifecycle
// ──────────────
// A protection relay test is initiated by scheduling a test window.  Before
// the test begins, a pre-test inspection verifies that all safety precautions
// are in place, the test equipment is calibrated, and the grid witness (a
// licensed engineer from the grid operator / SO) is on site.  The site must
// formally confirm readiness before energisation can proceed.
//
// The test itself exercises the relay's trip characteristics against the
// pass criteria defined in the test standard (NRS 097-2-3 Annex B for
// embedded generation, or the network owner's protection philosophy document
// for transmission-connected plant).
//
// On preliminary results:
//   - If ALL pass criteria are met   → certify_pass → certified_pass (terminal +)
//   - If minor calibration issues    → flag_minor_deficiency → minor_deficiency
//     → rectification → retest_scheduled → re-execute_test loop
//   - If the relay trips at wrong    → record_failure → test_failed → rectification
//     setpoints or fails to trip       required → (rectification done) →
//                                       rectification_complete → retest_scheduled
//   - If retest also fails           → record_failure (from retest) → failed_final
//                                       (terminal −)  SAFETY DISCONNECT MANDATORY
//
// SLA polarity — URGENT (safety-critical plant gets least time):
//   safety_critical  3 d  — transmission-class plant or plant serving critical load
//   transmission     7 d  — HV/EHV connected embedded generation
//   distribution    14 d  — MV connected; most commercial/industrial solar+wind
//   embedded        21 d  — LV embedded < 1 MVA (residential + small commercial)
//   routine         30 d  — annual recertification on already-passed relays
//
// Regulator crossing rules:
//   failed_final  → ALL protection classes (mandatory safety disconnect notification)
//   test_failed   → safety_critical + transmission (immediate safety concern)
//   sla_breach    → safety_critical + transmission (testing window overrun = risk)
//
// Entity prefix: prt_test
// Event prefix:  prt_evt_
//
// Mounted at /api/protection-relay-chain.
// ═══════════════════════════════════════════════════════════════════════════

export type ProtectionRelayTestStatus =
  | 'test_scheduled'
  | 'pre_test_inspection'
  | 'site_ready'
  | 'test_executing'
  | 'preliminary_results'
  | 'certified_pass'      // TERMINAL +
  | 'minor_deficiency'
  | 'test_failed'
  | 'rectification_required'
  | 'rectification_complete'
  | 'retest_scheduled'
  | 'failed_final';        // TERMINAL −

export type ProtectionRelayTestAction =
  | 'schedule_test'
  | 'conduct_pre_inspection'
  | 'confirm_site_ready'
  | 'execute_test'
  | 'record_preliminary_results'
  | 'certify_pass'
  | 'flag_minor_deficiency'
  | 'record_failure'
  | 'confirm_rectification'
  | 'schedule_retest';

// URGENT SLA — safety-critical plant gets LEAST time
export type ProtectionClass =
  | 'safety_critical'
  | 'transmission'
  | 'distribution'
  | 'embedded'
  | 'routine';

// ─── SLA derivation (keyed on protection_class; URGENT polarity) ─────────────

export const SLA_DAYS: Record<ProtectionClass, number> = {
  safety_critical: 3,
  transmission:    7,
  distribution:   14,
  embedded:       21,
  routine:        30,
};

export function deriveRelaySla(protectionClass: ProtectionClass): number {
  return SLA_DAYS[protectionClass];
}

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<ProtectionRelayTestStatus>([
  'certified_pass',
  'failed_final',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<
  ProtectionRelayTestAction,
  { from: ProtectionRelayTestStatus[] }
> = {
  schedule_test: {
    from: ['test_scheduled'],  // entry point — created with this status
  },
  conduct_pre_inspection: {
    from: ['test_scheduled'],
  },
  confirm_site_ready: {
    from: ['pre_test_inspection'],
  },
  execute_test: {
    from: ['site_ready', 'retest_scheduled'],
  },
  record_preliminary_results: {
    from: ['test_executing'],
  },
  certify_pass: {
    from: ['preliminary_results'],
  },
  flag_minor_deficiency: {
    from: ['preliminary_results'],
  },
  record_failure: {
    from: ['preliminary_results', 'rectification_complete', 'retest_scheduled'],
  },
  confirm_rectification: {
    from: ['test_failed', 'rectification_required', 'minor_deficiency'],
  },
  schedule_retest: {
    from: ['rectification_complete'],
  },
};

// ─── State machine ────────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<
  ProtectionRelayTestAction,
  ProtectionRelayTestStatus
> = {
  schedule_test:             'pre_test_inspection',
  conduct_pre_inspection:    'pre_test_inspection',
  confirm_site_ready:        'site_ready',
  execute_test:              'test_executing',
  record_preliminary_results:'preliminary_results',
  certify_pass:              'certified_pass',
  flag_minor_deficiency:     'minor_deficiency',
  record_failure:            'test_failed',
  confirm_rectification:     'rectification_complete',
  schedule_retest:           'retest_scheduled',
};

// ─── Regulator crossing rules ─────────────────────────────────────────────────

const ALL_CLASSES: ProtectionClass[] = [
  'safety_critical', 'transmission', 'distribution', 'embedded', 'routine',
];
const SAFETY_AND_TX: ProtectionClass[] = ['safety_critical', 'transmission'];

export function crossesIntoRegulator(
  action: ProtectionRelayTestAction,
  protectionClass: ProtectionClass,
): boolean {
  switch (action) {
    // failed_final is a terminal reached via record_failure from retest context;
    // we model it as: when the transition INTO failed_final occurs we notify.
    // The actual terminal is set when record_failure brings us from retest to test_failed
    // and failed_final is the conclusive terminal — here we check the destination in the route.
    case 'record_failure': {
      // If the record_failure crosses into failed_final context: handled in route
      // For intermediate test_failed: safety_critical + transmission
      return SAFETY_AND_TX.includes(protectionClass);
    }
    default:
      return false;
  }
}

export function failedFinalCrossesIntoRegulator(
  _protectionClass: ProtectionClass,
): boolean {
  // ALL protection classes trigger a regulator notification on failed_final
  return true;
}

export function slaBreachCrossesIntoRegulator(
  protectionClass: ProtectionClass,
): boolean {
  return SAFETY_AND_TX.includes(protectionClass);
}

// ─── Convenience: which protection classes get immediate regulator notice ─────

export const IMMEDIATE_REGULATOR_CLASSES: Set<ProtectionClass> = new Set(
  ALL_CLASSES,
);
