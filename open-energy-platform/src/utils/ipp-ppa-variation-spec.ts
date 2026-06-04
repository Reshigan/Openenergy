// ═══════════════════════════════════════════════════════════════════════════
// Wave 155 — IPP Offtake Agreement Variation & Amendment chain (P6)
//
// Legal basis:
//   - Electricity Regulation Act 4 of 2006, section 35 — "Amendment of licence"
//     (NERSA may on application or own motion amend a licence; the licensee must
//     notify NERSA of any material change in the circumstances under which the
//     licence was granted)
//   - NERSA Licence Amendment Guidelines (2012, as updated) — sets out the
//     public-participation trigger, evaluation criteria and decision window
//   - REIPPPP Schedule 5 (PPA Change Mechanisms) — specifies the contractual
//     change-control procedure a REIPPPP IPP must follow before requesting a
//     NERSA licence amendment (technical / commercial variations must first
//     exhaust the PPA Schedule 5 bilateral process with the DoE/DBSA as
//     Implementation Agent before escalating to NERSA)
//
// An IPP applies to NERSA to vary its generation licence (and the underlying
// PPA terms) — whether to adjust installed capacity, revise the feed-in tariff,
// extend the PPA term, substitute an offtaker, or amend technical operating
// parameters.  NERSA screens the application, commissions technical and
// commercial expert reviews, holds public participation (mandatory for all
// variations under the Guidelines), issues its own assessment, and reaches a
// decision.  A refused application may be appealed to the Electricity Division
// of the High Court (ERA §35(6)) or to the NERSA Appeals Tribunal.
//
// Forward path (happy):
//   variation_requested → regulatory_screen → technical_review
//     → commercial_review → public_participation → nersa_assessment
//     → variation_approved → ppa_amended  (terminal — PPA is re-executed)
//
// Side exits:
//   rejected         — NERSA refuses after assessment (terminal)
//   withdrawn        — applicant withdraws before a determination (terminal)
//   appeal_filed     — applicant contests a refusal → appeal_determined (terminal)
//
// SLA matrix is INVERTED (same flavour as W19/W20/W32/W33/W43/W49/W53/W56/W58):
//   Larger capacity / higher quantum = more regulatory scrutiny = MORE time
//   allowed at each stage.  A minor trim (<5 MW) is an administrative matter
//   processed quickly; a material restructuring (≥500 MW, full tariff reset,
//   offtaker substitution) demands the full NERSA council deliberation cycle.
//
// Regulator inbox crossings (ERA §35 + NERSA Amendment Guidelines):
//   - approve_variation → EVERY tier  (any licence variation is a notifiable
//     market event; NERSA must publish the amended licence in the Gazette)
//   - reject_variation  → major + material only  (a licence refusal at scale
//     has sector-wide investment-climate implications; a minor refusal is routine
//     administrative correspondence)
//   - file_appeal       → major + material only  (an appeal of a NERSA decision
//     at scale triggers the public appeals-tribunal process)
//
// Actors:
//   Writer: {admin, ipp_developer}  (IPP submits, NERSA staff progress internally)
//   party_from_action: applicant / nersa_officer / nersa_council / public
//
// Event prefix: ppavar_evt_
// ═══════════════════════════════════════════════════════════════════════════

// ── Status type ────────────────────────────────────────────────────────────

export type PpaVariationStatus =
  | 'variation_requested'
  | 'regulatory_screen'
  | 'technical_review'
  | 'commercial_review'
  | 'public_participation'
  | 'nersa_assessment'
  | 'variation_approved'
  | 'ppa_amended'           // terminal — PPA re-executed; chain closed
  | 'withdrawn'             // terminal — applicant withdrew before determination
  | 'rejected'              // terminal — NERSA refused the application
  | 'appeal_filed'
  | 'appeal_determined';    // terminal — appeals tribunal / High Court ruling

// ── Action type ────────────────────────────────────────────────────────────

export type PpaVariationAction =
  | 'commence_screen'            // variation_requested → regulatory_screen
  | 'submit_technical'           // regulatory_screen → technical_review
  | 'commence_commercial'        // technical_review → commercial_review
  | 'open_public_participation'  // commercial_review → public_participation
  | 'close_public_participation' // public_participation → nersa_assessment
  | 'issue_nersa_assessment'     // nersa_assessment → variation_approved | rejected
  | 'approve_variation'          // nersa_assessment → variation_approved
  | 'amend_ppa'                  // variation_approved → ppa_amended
  | 'reject_variation'           // nersa_assessment → rejected
  | 'file_appeal'                // rejected → appeal_filed
  | 'determine_appeal'           // appeal_filed → appeal_determined
  | 'withdraw';                  // any non-terminal pre-determination → withdrawn

// ── Capacity / quantum tier ─────────────────────────────────────────────────

/**
 * VariationTier drives both the INVERTED SLA days and the regulator-crossing
 * logic.  Derived from the net capacity delta (or equivalent MW-basis for
 * non-capacity changes such as tariff revision or offtaker substitution).
 *
 *   minor      < 5 MW   — minor administrative adjustment; fastest track
 *   moderate   < 25 MW  — notable but sub-REIPPPP-bid-window scale
 *   significant < 100 MW — IPP utility-scale segment; full technical review
 *   major      < 500 MW — large generating facility; full NERSA council review
 *   material  >= 500 MW — systemic market impact; longest deliberation window
 */
export type VariationTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

/**
 * The nature of the change being requested.  Used for audit attribution and
 * downstream cascade routing (e.g. a tariff_revision feeds W39; an
 * offtaker_substitution triggers W22 PPA contract exec; a capacity_adjustment
 * propagates to W58 grid capacity allocation).
 */
export type VariationType =
  | 'capacity_adjustment'
  | 'tariff_revision'
  | 'term_extension'
  | 'offtaker_substitution'
  | 'technical_parameters';

// ── Terminal states ─────────────────────────────────────────────────────────

export const HARD_TERMINALS: readonly PpaVariationStatus[] = [
  'ppa_amended',
  'withdrawn',
  'rejected',
  'appeal_determined',
] as const;

// ── Valid transitions ───────────────────────────────────────────────────────

/**
 * VALID_TRANSITIONS maps each non-terminal status to the set of statuses it
 * may transition INTO (by any valid action).  Keyed by source status; the
 * values are the permissible destination statuses.
 *
 * Note: `issue_nersa_assessment` is the gate state that fans out to either
 * `variation_approved` or `rejected` depending on the NERSA officer decision.
 * Both destinations are therefore listed under `nersa_assessment`.
 */
export const VALID_TRANSITIONS: Partial<Record<PpaVariationStatus, PpaVariationStatus[]>> = {
  variation_requested:   ['regulatory_screen', 'withdrawn'],
  regulatory_screen:     ['technical_review', 'withdrawn'],
  technical_review:      ['commercial_review', 'withdrawn'],
  commercial_review:     ['public_participation', 'withdrawn'],
  public_participation:  ['nersa_assessment', 'withdrawn'],
  nersa_assessment:      ['variation_approved', 'rejected'],
  variation_approved:    ['ppa_amended'],
  rejected:              ['appeal_filed'],
  appeal_filed:          ['appeal_determined'],
  // terminal states intentionally omitted (no outbound edges)
};

// ── SLA days (INVERTED) ─────────────────────────────────────────────────────

/**
 * Total calendar days allowed from application submission to final
 * determination, keyed by VariationTier.
 *
 * INVERTED: larger capacity = more regulatory scrutiny = more time allowed.
 * A minor administrative trim (< 5 MW) is a 45-day fast track.
 * A material restructuring (>= 500 MW) runs the full 240-day deliberation
 * cycle required by the NERSA Licence Amendment Guidelines for complex
 * multi-party public-participation proceedings.
 */
export const SLA_DAYS: Record<VariationTier, number> = {
  minor:       45,
  moderate:    75,
  significant: 120,
  major:       180,
  material:    240,
};

// ── Helper: derive tier from capacity delta ─────────────────────────────────

/**
 * Derive the VariationTier from the net capacity delta (MW) of the requested
 * variation.  For non-capacity changes (tariff_revision, offtaker_substitution,
 * etc.) the caller should pass the MW rating of the affected facility as the
 * proxy quantum.
 *
 *   capacity_mw < 5   → 'minor'
 *   capacity_mw < 25  → 'moderate'
 *   capacity_mw < 100 → 'significant'
 *   capacity_mw < 500 → 'major'
 *   capacity_mw >= 500 → 'material'
 */
export function deriveVariationTier(capacity_mw: number): VariationTier {
  if (capacity_mw < 5)   return 'minor';
  if (capacity_mw < 25)  return 'moderate';
  if (capacity_mw < 100) return 'significant';
  if (capacity_mw < 500) return 'major';
  return 'material';
}

// ── Regulator-crossing predicate ────────────────────────────────────────────

/**
 * Returns true when the given action must raise a cross-referral into the
 * NERSA regulator inbox (W31 disposition queue).
 *
 * Rules (ERA §35 + NERSA Amendment Guidelines):
 *   - approve_variation → EVERY tier
 *       Any licence variation must be published in the Government Gazette and
 *       entered on the NERSA public register.  There are no de-minimis
 *       exceptions; even a minor technical-parameters tweak produces an amended
 *       licence that must be notified.
 *   - reject_variation → major + material only
 *       A refusal at this scale has sector-wide investment-climate implications
 *       and must be escalated to the NERSA Council oversight queue.  Minor and
 *       moderate refusals are routine administrative correspondence.
 *   - file_appeal → major + material only
 *       An appeal of a NERSA decision at this scale triggers the public appeals-
 *       tribunal process (or High Court judicial-review proceedings) and must be
 *       flagged for senior NERSA management.
 */
export function crossesIntoRegulator(
  action: PpaVariationAction,
  tier: VariationTier,
): boolean {
  switch (action) {
    case 'approve_variation':
      // EVERY tier — licence variation always notifiable (W155 signature)
      return true;

    case 'reject_variation':
    case 'file_appeal':
      // major + material only
      return tier === 'major' || tier === 'material';

    default:
      return false;
  }
}

// ── Utility helpers ─────────────────────────────────────────────────────────

export function isTerminal(status: PpaVariationStatus): boolean {
  return (HARD_TERMINALS as readonly string[]).includes(status);
}

/**
 * Returns the set of statuses reachable from `current`, or an empty array if
 * the status is terminal or has no outbound edges defined.
 */
export function reachableFrom(current: PpaVariationStatus): PpaVariationStatus[] {
  return VALID_TRANSITIONS[current] ?? [];
}

/**
 * Compute the SLA deadline date from the moment the application was submitted
 * (`submittedAt`) for the given tier.
 */
export function slaDeadlineFor(tier: VariationTier, submittedAt: Date): Date {
  const deadline = new Date(submittedAt);
  deadline.setDate(deadline.getDate() + SLA_DAYS[tier]);
  return deadline;
}

/**
 * Returns true when `now` is past the SLA deadline for the given tier and
 * submission date — i.e. the chain should emit a `ppavar_evt_sla_breached`
 * cascade event.
 */
export function isSlaBreached(
  tier: VariationTier,
  submittedAt: Date,
  now: Date = new Date(),
): boolean {
  return now > slaDeadlineFor(tier, submittedAt);
}
