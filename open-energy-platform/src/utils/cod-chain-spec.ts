// ═══════════════════════════════════════════════════════════════════════════
// Wave 20 — IPP construction → COD certification chain spec.
//
// Pure functions. 10-state P6 machine for the IPP project's construction-to-
// COD lifecycle (EPC contract execution → mechanical completion → cold/hot
// commissioning → grid sync → reliability run → COD certified). Mirrors the
// NERSA Grid Code §C-5 (commissioning & registration) and SAREM-FM bid-window
// IE certification requirements.
//
//   draft → epc_signed → ntp_issued → mobilization → mechanical_complete
//     → cold_commissioning → grid_synchronized → reliability_run → cod_certified
//   cancel — any pre-cod_certified non-terminal → cancelled (terminal)
//
// Capacity tier (drives SLAs and regulator crossings):
//   • large  (≥100MW)  — REIPPPP utility-scale, full NERSA SCADA + DMRE registry
//   • medium (10–100MW) — major commercial / community
//   • small  (<10MW)   — embedded gen, no regulator visibility
//
// Per-tier SLAs reflect REAL construction durations — large projects need
// 18-24mo total, medium 12mo, small 6mo. Stage SLAs scale accordingly.
//
// Regulator inbox crossings (NERSA Grid Code + DMRE generation registry):
//   • cod_certified  for large — public generation-registry entry mandate
//   • cancelled      for large — project failure → bond claw-back visibility
//   • sla_breached   for large — delivery risk to NERSA grid-planning
//
// Imported by:
//   - tests/cod-chain-spec.test.ts
//   - src/routes/cod-chain.ts
// ═══════════════════════════════════════════════════════════════════════════

export type CodStatus =
  | 'draft'
  | 'epc_signed'
  | 'ntp_issued'
  | 'mobilization'
  | 'mechanical_complete'
  | 'cold_commissioning'
  | 'grid_synchronized'
  | 'reliability_run'
  | 'cod_certified'
  | 'cancelled';

export type CodAction =
  | 'sign_epc'              // draft → epc_signed
  | 'issue_ntp'             // epc_signed → ntp_issued
  | 'mobilize'              // ntp_issued → mobilization
  | 'mechanical_complete'   // mobilization → mechanical_complete
  | 'cold_commission'       // mechanical_complete → cold_commissioning
  | 'grid_synchronize'      // cold_commissioning → grid_synchronized
  | 'begin_reliability_run' // grid_synchronized → reliability_run
  | 'certify_cod'           // reliability_run → cod_certified (IE sign-off)
  | 'cancel';               // any pre-cod_certified → cancelled

export type CodTier = 'large' | 'medium' | 'small';

export const ALL_STATES: readonly CodStatus[] = [
  'draft', 'epc_signed', 'ntp_issued', 'mobilization',
  'mechanical_complete', 'cold_commissioning', 'grid_synchronized',
  'reliability_run', 'cod_certified', 'cancelled',
];

export const TERMINAL_STATES: readonly CodStatus[] = ['cod_certified', 'cancelled'];

export function isTerminal(s: CodStatus): boolean {
  return TERMINAL_STATES.includes(s);
}

export const TRANSITIONS: Record<CodStatus, Partial<Record<CodAction, CodStatus>>> = {
  draft:               { sign_epc:              'epc_signed',          cancel: 'cancelled' },
  epc_signed:          { issue_ntp:             'ntp_issued',          cancel: 'cancelled' },
  ntp_issued:          { mobilize:              'mobilization',        cancel: 'cancelled' },
  mobilization:        { mechanical_complete:   'mechanical_complete', cancel: 'cancelled' },
  mechanical_complete: { cold_commission:       'cold_commissioning',  cancel: 'cancelled' },
  cold_commissioning:  { grid_synchronize:      'grid_synchronized',   cancel: 'cancelled' },
  grid_synchronized:   { begin_reliability_run: 'reliability_run',     cancel: 'cancelled' },
  reliability_run:     { certify_cod:           'cod_certified',       cancel: 'cancelled' },
  cod_certified:       {},
  cancelled:           {},
};

/**
 * SLA windows (minutes) by state × capacity tier. Time-in-state deadlines
 * tuned to real construction durations.
 *
 *   large  ≥100MW — utility-scale
 *   medium 10–100MW — major commercial
 *   small  <10MW — embedded gen
 */
export const SLA_MINUTES: Record<CodStatus, Record<CodTier, number>> = {
  draft:               { large: 129600, medium: 86400,  small: 43200 },   // 90d / 60d / 30d to sign EPC
  epc_signed:          { large: 86400,  medium: 64800,  small: 43200 },   // 60d / 45d / 30d to issue NTP
  ntp_issued:          { large: 43200,  medium: 30240,  small: 20160 },   // 30d / 21d / 14d to mobilize
  mobilization:        { large: 777600, medium: 518400, small: 259200 },  // 18mo / 12mo / 6mo to mech complete
  mechanical_complete: { large: 86400,  medium: 64800,  small: 43200 },   // 60d / 45d / 30d to cold commission
  cold_commissioning:  { large: 43200,  medium: 30240,  small: 20160 },   // 30d / 21d / 14d to grid sync
  grid_synchronized:   { large: 20160,  medium: 14400,  small: 10080 },   // 14d / 10d / 7d to begin reliability
  reliability_run:     { large: 30240,  medium: 20160,  small: 14400 },   // 21d / 14d / 10d to COD
  cod_certified:       { large: 0, medium: 0, small: 0 },
  cancelled:           { large: 0, medium: 0, small: 0 },
};

export function nextState(curr: CodStatus, action: CodAction): CodStatus | null {
  return TRANSITIONS[curr]?.[action] ?? null;
}

export function advance(curr: CodStatus, action: CodAction): CodStatus {
  const next = nextState(curr, action);
  if (!next) throw new Error(`Invalid transition: ${curr} --${action}--> ?`);
  return next;
}

export function slaDueAt(
  state: CodStatus,
  tier: CodTier,
  now: Date = new Date(),
): string {
  const mins = SLA_MINUTES[state]?.[tier] ?? 0;
  if (mins === 0) return '';
  return new Date(now.getTime() + mins * 60 * 1000).toISOString();
}

/**
 * Capacity tier from MW nameplate. 100MW REIPPPP utility-scale cutoff
 * mirrors DMRE generation-registry mandatory threshold; 10MW small-scale
 * embedded-gen cutoff matches NERSA registration vs licensing.
 */
export function tierFromMw(mw: number): CodTier {
  if (mw >= 100) return 'large';
  if (mw >= 10)  return 'medium';
  return 'small';
}

/**
 * Regulator inbox crossings for state changes.
 *
 *   certify_cod (reliability_run → cod_certified) crosses for large — NERSA
 *   generation-registry entry + SCADA registration is mandatory at ≥100MW.
 *   cancel crosses for large — project failure visible to DMRE for
 *   bond claw-back + bid-window allocation reissue.
 */
export function crossesIntoRegulator(action: CodAction, tier: CodTier): boolean {
  if (action === 'certify_cod') return tier === 'large';
  if (action === 'cancel')      return tier === 'large';
  return false;
}

/**
 * Large-tier SLA breaches cross into regulator inbox. Medium/small are
 * operational only — the IPP's PM is responsible for catching them.
 */
export function slaBreachCrossesIntoRegulator(tier: CodTier): boolean {
  return tier === 'large';
}

export function isTier(s: string): s is CodTier {
  return s === 'large' || s === 'medium' || s === 'small';
}

export function isStatus(s: string): s is CodStatus {
  return ALL_STATES.includes(s as CodStatus);
}
