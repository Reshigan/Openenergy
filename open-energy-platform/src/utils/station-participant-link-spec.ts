// ═══════════════════════════════════════════════════════════════════════════
// Wave 191 — Station Participant Link (Esums Onboarding Handshake)
//
// When an Esums station (solar / wind / storage) is onboarded to the platform,
// operational, financial, and commercial flows cannot auto-trigger until the
// station is formally linked to the downstream participant modules that consume
// its data and events.  Four link types exist:
//
//   lender        — the financier of the installation.  Activates covenant
//                   monitoring (W38), DSCR calculation (W77), and feeds the
//                   drawdown gate (W21).  Without this link, covenants are
//                   not monitored and the lender portal shows no station data.
//
//   carbon_fund   — the carbon programme or aggregator buying generation
//                   credits from the station.  Activates esums_carbon_credits
//                   generation, feeds the MRV chain (W11), ERPA delivery
//                   tracking (W65), and crediting-period renewal (W56).
//                   Without this link, no credits are minted from meter reads.
//
//   offtaker      — the energy customer receiving monthly settled invoices.
//                   Activates esums_settlement_invoices, feeds the PPA settled
//                   vs contracted reconciliation (W7), take-or-pay monitoring
//                   (W32), and curtailment compensation (W46).  Without this
//                   link, no PPA settlement invoice is generated for the
//                   station.
//
//   grid_operator — the system operator / SO entity responsible for metering
//                   and dispatch.  Activates grid cascade events, feeds the
//                   dispatch nomination chain (W13), planned outage approvals
//                   (W18), reserve activation settlement (W50), and grid code
//                   compliance monitoring (W67).  Without this link, the
//                   station cannot participate in the dispatch or balancing
//                   market.
//
// Regulatory and commercial rationale
// ────────────────────────────────────
// REIPPPP Implementation Agreements, NERSA generation licence conditions
// (ERA 4/2006 §8–11 and §33), and DFI term-sheets all require the licensee
// to notify and obtain acknowledgement from the relevant counterparty before
// the station commences commercial operation.  The two-party handshake
// formalises this notification on the platform and creates an auditable
// evidence chain for:
//   - NERSA licence compliance (link to grid_operator)
//   - REIPPPP IA condition precedent satisfaction (link to offtaker)
//   - Equator Principles / IFC PS ESAP coverage (link to lender)
//   - UNFCCC Article 6 / Verra registry authorisation (link to carbon_fund)
//
// Either party may initiate.  Direction follows commercial incentive:
//   lender        → typically initiated by the IPP (they know their financier)
//   carbon_fund   → typically initiated by the carbon fund (buying credits)
//   offtaker      → either party (offtaker wants supply; IPP wants a buyer)
//   grid_operator → typically auto-proposed by admin at grid connection (W75)
//
// The proposing party submits the record; the receiving party reviews.
// If documentation is insufficient, a documentation sub-loop runs before
// technical and commercial checks proceed.  Once both sides are satisfied,
// admin approves and activates the link — from that point all downstream
// module events auto-flow for the station.
//
// If the receiving party takes no action within the SLA window, the proposal
// auto-expires via the cron `expire_link` action, signalling to the platform
// that the station cannot yet participate in that module's flows.
//
// SLA polarity — NORMAL (simpler / more regulated link types get LESS time):
//   grid_operator  7 days — regulatory fast-track; Grid Code requires prompt
//                           connection notification; NERSA licence condition
//   lender        14 days — well-defined financier relationship; IA condition
//                           precedent with known parties and agreed terms
//   offtaker      21 days — commercial negotiation required; tariff, PPA
//                           annexures, and metering agreements to be agreed
//   carbon_fund   30 days — project due-diligence; methodology review,
//                           additionality check, and DNA authorisation needed
//
// 12-state chain:
//   link_proposed → under_review → documentation_requested
//   → documentation_submitted → technical_validation
//   → commercial_terms_review → compliance_check → approved
//   → link_active          (terminal + — link operational; events auto-flow)
//   → link_rejected        (terminal − — proposed link formally declined)
//   → link_expired         (terminal  — SLA lapsed; proposal never actioned)
//   → link_suspended       (terminal  — active link suspended by either party)
//
// Regulator crossing rules:
//   reject_link    → ALL link types (any link rejection is publicly reportable;
//                    feeds W31 Regulator Disposition; signals market access
//                    denial or financier withdrawal)
//   expire_link    → offtaker + carbon_fund only (commercial link expiry
//                    signals market dysfunction; grid + lender expirations
//                    are handled by operational escalation processes)
//   activate_link  → grid_operator only (physical grid connection activation
//                    is always reportable to NERSA under Grid Code §C-1)
//   suspend_link   → ALL link types (active link suspension = potential
//                    service disruption; reportable regardless of link type)
//
// SLA breach → regulator: false for all link types (no breach crossing;
// expiry is modelled as an explicit action, not a silent overflow).
//
// Entity prefix: station_link
// Event prefix:  slink_evt_
//
// Mounted at /api/station-participant-links.
// ═══════════════════════════════════════════════════════════════════════════

export type StationLinkStatus =
  | 'link_proposed'
  | 'under_review'
  | 'documentation_requested'
  | 'documentation_submitted'
  | 'technical_validation'
  | 'commercial_terms_review'
  | 'compliance_check'
  | 'approved'
  | 'link_active'       // TERMINAL +
  | 'link_rejected'     // TERMINAL -
  | 'link_expired'      // TERMINAL
  | 'link_suspended';   // TERMINAL

export type StationLinkAction =
  | 'submit_for_review'
  | 'request_documentation'
  | 'submit_documentation'
  | 'commence_technical_validation'
  | 'commence_commercial_review'
  | 'commence_compliance_check'
  | 'approve_link'
  | 'activate_link'
  | 'reject_link'
  | 'expire_link'
  | 'suspend_link';

// NORMAL SLA — simpler / more regulated link types get LESS time
export type LinkType = 'lender' | 'carbon_fund' | 'offtaker' | 'grid_operator';

// ─── SLA derivation (keyed on link_type; NORMAL polarity) ────────────────────

export const SLA_DAYS: Record<LinkType, number> = {
  grid_operator: 7,
  lender:        14,
  offtaker:      21,
  carbon_fund:   30,
};

export function deriveLinkSla(linkType: LinkType): number {
  return SLA_DAYS[linkType];
}

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<StationLinkStatus>([
  'link_active',
  'link_rejected',
  'link_expired',
  'link_suspended',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<StationLinkAction, { from: StationLinkStatus[] }> = {
  submit_for_review: { from: ['link_proposed'] },
  request_documentation: { from: ['under_review'] },
  submit_documentation: { from: ['documentation_requested'] },
  commence_technical_validation: {
    from: ['under_review', 'documentation_submitted'],
  },
  commence_commercial_review: { from: ['technical_validation'] },
  commence_compliance_check: { from: ['commercial_terms_review'] },
  approve_link: { from: ['compliance_check'] },
  activate_link: { from: ['approved'] },
  reject_link: {
    from: [
      'link_proposed', 'under_review', 'documentation_requested',
      'documentation_submitted', 'technical_validation',
      'commercial_terms_review', 'compliance_check', 'approved',
    ],
  },
  expire_link: {
    from: [
      'link_proposed', 'under_review', 'documentation_requested',
      'documentation_submitted', 'technical_validation',
      'commercial_terms_review', 'compliance_check', 'approved',
    ],
  },
  suspend_link: { from: ['link_active'] },
};

// ─── State machine ────────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<StationLinkAction, StationLinkStatus> = {
  submit_for_review:               'under_review',
  request_documentation:           'documentation_requested',
  submit_documentation:            'documentation_submitted',
  commence_technical_validation:   'technical_validation',
  commence_commercial_review:      'commercial_terms_review',
  commence_compliance_check:       'compliance_check',
  approve_link:                    'approved',
  activate_link:                   'link_active',
  reject_link:                     'link_rejected',
  expire_link:                     'link_expired',
  suspend_link:                    'link_suspended',
};

// ─── Regulator crossing rules ─────────────────────────────────────────────────

const ALL_TYPES: LinkType[]             = ['lender', 'carbon_fund', 'offtaker', 'grid_operator'];
const COMMERCIAL_TYPES: LinkType[]      = ['offtaker', 'carbon_fund'];
const GRID_ONLY: LinkType[]             = ['grid_operator'];

export function crossesIntoRegulator(
  action: StationLinkAction,
  linkType: LinkType,
): boolean {
  switch (action) {
    case 'reject_link':   return ALL_TYPES.includes(linkType);
    case 'expire_link':   return COMMERCIAL_TYPES.includes(linkType);
    case 'activate_link': return GRID_ONLY.includes(linkType);
    case 'suspend_link':  return ALL_TYPES.includes(linkType);
    default:              return false;
  }
}

// SLA breach does not trigger a regulator crossing for any link type.
// Expiry (expire_link) is the explicit terminal for time-lapsed proposals;
// the regulator crossing is modelled on that action, not on silent overflow.
export function slaBreachCrossesIntoRegulator(_linkType: LinkType): boolean {
  return false;
}
