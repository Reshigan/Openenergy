// ═══════════════════════════════════════════════════════════════════════════
// Wave 192 — Conditions Precedent (CP) Tracker
//
// Every major project finance transaction in the South African renewable energy
// sector is structured around a set of Conditions Precedent (CPs) that must be
// satisfied before downstream obligations activate.  The NERSA generation licence
// Implementation Agreement (IA) and REIPPPP Implementation Agreement both define
// exhaustive CP schedules that gate:
//
//   drawdown (W21)           — lender will not advance project funds until
//                              financial CPs are satisfied (legal opinions, share
//                              charge, DSRA funded, insurance placed, etc.)
//
//   construction milestones  — REIPPPP IA progress milestones (financial close,
//                              NTP, COD) cannot be declared without the relevant
//                              CP schedule being satisfied in advance
//
//   grid connection (W28)    — NTCSA will not issue a grid connection agreement
//                              or authorise energisation (W75) until regulatory
//                              CPs are met (NERSA licence, grid code study,
//                              connection capacity allocation via W58)
//
//   commercial operation     — COD declaration (W20) gates through satisfaction
//                              of all outstanding CPs and formal IPPO sign-off
//
// CP types and regulatory rationale
// ──────────────────────────────────
// operational     — technical readiness CPs: commissioning reports, O&M
//                   agreements, SCADA connectivity, control-room acceptance.
//                   14-day SLA: straightforward verification by the SO/NTCSA
//
// commercial      — offtake and trading CPs: PPA execution (W22), REC
//                   registration (W70), ERPA (W65), market-access agreements.
//                   21-day SLA: commercial review by offtaker and carbon fund
//
// financial       — project finance CPs: drawdown conditions from W21, DSRA
//                   funding (W77), insurance placement (W23), equity commitment.
//                   30-day SLA: lender credit committee + legal sign-off
//
// regulatory      — statutory CPs: NERSA generation licence (W49/W33), EMP
//                   authorisation (W190), NEMA/DEA environmental approvals,
//                   municipal consents, water-use licence.
//                   45-day SLA: public participation + authority review windows
//
// strategic       — high-level programme CPs: REIPPPP preferred bidder award,
//                   DMRE ministerial consent, national grid development plan
//                   inclusion, strategic partnership sign-off.
//                   60-day SLA: government policy and procurement cycles
//
// SLA polarity — INVERTED (higher-tier CPs receive MORE time because the
// verification and sign-off processes involve more stakeholders and longer
// statutory consultation windows):
//   operational = 14 days  (simplest; technical sign-off by known parties)
//   commercial  = 21 days  (offtaker and fund review; faster than regulatory)
//   financial   = 30 days  (lender credit committee; Basel III timelines)
//   regulatory  = 45 days  (statutory timelines; PAIA + NEMA consultation)
//   strategic   = 60 days  (government procurement; REIPPPP award cycles)
//
// Regulator crossing rules (REIPPPP IA requires IPPO/DMRE notification of
// CP failures at all tiers; selective crossing for waiver and SLA breach):
//
//   serve_notice  → ALL tiers
//     A formal notice that a CP remains outstanding triggers the cure window.
//     REIPPPP IA clause 11.3 requires IPPO notification at all tiers —
//     lenders rely on this notice for event-of-default clauses (W45).
//
//   reject_cp     → ALL tiers
//     Any CP rejection blocks a downstream gate (drawdown, COD, grid
//     connection).  NERSA licence conditions require notification of any
//     CP rejection that affects the grid connection or operating licence.
//
//   waive_cp      → regulatory + strategic only
//     Waiving an operational or commercial CP is a bilateral matter between
//     the project company and its counterparty.  Waiving a regulatory CP
//     requires NERSA or DMRE consent; waiving a strategic CP requires IPPO
//     or ministerial sign-off — both are reportable.
//
//   sla_breached  → financial + regulatory + strategic
//     Financial CP SLA breach is a potential event of default under the loan
//     agreement (W45 trigger).  Regulatory and strategic SLA breach signals
//     a project delay that NERSA monitors for licence condition compliance.
//     Operational and commercial SLA breaches are handled within the project
//     management cycle without regulator notification.
//
// 12-state chain:
//   identified → documented → submitted → under_verification
//   → conditional_pass → outstanding → notice_served → cure_underway
//   → satisfied   (terminal + — CP met, downstream gate unlocked)
//   → waived      (terminal neutral — CP formally waived by lender/authority)
//   → lapsed      (terminal − — SLA expired, CP not satisfied in time)
//   → rejected    (terminal − — CP submission rejected, project blocked)
//
// Entity prefix: cp_tracker   Event prefix: cp_evt_
// Table: oe_cp_tracker
// WRITE: {admin, ipp, ipp_developer, wind, lender}
// AUDIT_PREFIX_MAP: cp_tracker → 'ipp', cp_evt → 'ipp'
//
// Mounted at /api/ipp-cp-tracker.
// ═══════════════════════════════════════════════════════════════════════════

export type CPTrackerStatus =
  | 'identified'
  | 'documented'
  | 'submitted'
  | 'under_verification'
  | 'conditional_pass'
  | 'outstanding'
  | 'notice_served'
  | 'cure_underway'
  | 'satisfied'    // TERMINAL +
  | 'waived'       // TERMINAL neutral
  | 'lapsed'       // TERMINAL -
  | 'rejected';    // TERMINAL -

export type CPTrackerAction =
  | 'document_cp'
  | 'submit_for_verification'
  | 'conditional_pass'
  | 'flag_outstanding'
  | 'serve_notice'
  | 'commence_cure'
  | 'satisfy_cp'
  | 'waive_cp'
  | 'expire_cp'
  | 'reject_cp';

// INVERTED SLA — higher-tier CPs receive MORE time for regulatory review
export type CPTier = 'operational' | 'commercial' | 'financial' | 'regulatory' | 'strategic';

// ─── SLA derivation (keyed on cp_tier; INVERTED polarity) ────────────────────

export const SLA_DAYS: Record<CPTier, number> = {
  operational: 14,
  commercial:  21,
  financial:   30,
  regulatory:  45,
  strategic:   60,
};

export function deriveSla(tier: CPTier): number {
  return SLA_DAYS[tier];
}

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<CPTrackerStatus>([
  'satisfied',
  'waived',
  'lapsed',
  'rejected',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<CPTrackerAction, { from: CPTrackerStatus[] }> = {
  document_cp: {
    from: ['identified'],
  },
  submit_for_verification: {
    from: ['documented'],
  },
  conditional_pass: {
    from: ['under_verification'],
  },
  flag_outstanding: {
    from: ['under_verification', 'conditional_pass'],
  },
  serve_notice: {
    from: ['outstanding'],
  },
  commence_cure: {
    from: ['notice_served'],
  },
  satisfy_cp: {
    from: ['under_verification', 'conditional_pass', 'cure_underway'],
  },
  waive_cp: {
    from: ['under_verification', 'outstanding', 'notice_served', 'cure_underway'],
  },
  expire_cp: {
    from: [
      'identified', 'documented', 'submitted', 'under_verification',
      'conditional_pass', 'outstanding', 'notice_served', 'cure_underway',
    ],
  },
  reject_cp: {
    from: ['submitted', 'under_verification'],
  },
};

// ─── State machine ────────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<CPTrackerAction, CPTrackerStatus> = {
  document_cp:             'documented',
  submit_for_verification: 'submitted',
  conditional_pass:        'conditional_pass',
  flag_outstanding:        'outstanding',
  serve_notice:            'notice_served',
  commence_cure:           'cure_underway',
  satisfy_cp:              'satisfied',
  waive_cp:                'waived',
  expire_cp:               'lapsed',
  reject_cp:               'rejected',
};

// ─── Regulator crossing rules ─────────────────────────────────────────────────

const ALL_TIERS: CPTier[]              = ['operational', 'commercial', 'financial', 'regulatory', 'strategic'];
const REGULATORY_PLUS: CPTier[]        = ['regulatory', 'strategic'];
const FINANCIAL_PLUS: CPTier[]         = ['financial', 'regulatory', 'strategic'];

export function crossesIntoRegulator(
  action: CPTrackerAction,
  tier: CPTier,
): boolean {
  switch (action) {
    case 'serve_notice': return ALL_TIERS.includes(tier);
    case 'reject_cp':    return ALL_TIERS.includes(tier);
    case 'waive_cp':     return REGULATORY_PLUS.includes(tier);
    default:             return false;
  }
}

// SLA breach crosses into regulator for financial + regulatory + strategic tiers.
// Financial CP SLA breach is a potential event of default under the loan agreement.
// Regulatory and strategic SLA breach signals project delay requiring NERSA monitoring.
export function slaBreachCrossesIntoRegulator(tier: CPTier): boolean {
  return FINANCIAL_PLUS.includes(tier);
}
