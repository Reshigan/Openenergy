// ─────────────────────────────────────────────────────────────────────────
// Wave 156 — IPP Change of Control & Ownership Notification chain (P6)
//
// Electricity Regulation Act 4 of 2006 §11 (NERSA must approve any change
// in effective control of a licensee before that change takes effect),
// Companies Act 71 of 2008 §115 (fundamental transactions, including share
// transfers and schemes of arrangement, requiring special-resolution
// shareholder approval), and REIPPPP Project Agreement obligations (change-
// of-control notification to the Implementation Agent / DoE within a
// prescribed window before closing).
//
// A change in effective control of an energy licensee — whether via share
// transfer, asset acquisition, merger, management buy-out, fund recycling, or
// a lender step-in — must be notified to NERSA before it completes. NERSA
// undertakes completeness screening, a foreign-ownership screen (SARB ExCon
// + FIC where the incoming party is SADC-resident or non-SADC foreign), a
// competition screen (CCSA/Competition Tribunal referral if required), a
// technical assessment of the incoming controller's fitness & properness and
// the continued viability of the project, a public participation round (for
// significant+ capacity where third-party interests are engaged), a full
// NERSA evaluation against §11 criteria, and — where conditions attach — a
// conditional approval that must be fully satisfied before the transfer is
// executed and control formally transfers.
//
// Forward (happy) path:
//   notification_submitted → completeness_check → foreign_ownership_screen
//     → competition_screen → technical_assessment → public_participation
//     → nersa_evaluation → conditional_approval → control_transferred
//
// Rejected path:
//   nersa_evaluation → rejected → appeal_filed → appeal_determined
//
// Withdrawn path (any pre-determination state):
//   notification_submitted | completeness_check | foreign_ownership_screen
//     | competition_screen | technical_assessment | public_participation → withdrawn
//
// Ownership tiers (by generation capacity of the affected facility, in MW)
// drive the INVERTED SLA — larger facilities attract more NERSA scrutiny and
// therefore more time is granted for each stage of the review. This is the
// same inversion logic as W33 licence renewal, W43 MYPD tariff determination,
// W49 licence application, and other size-proportionate regulatory processes.
//
// INVERTED SLA (total calendar days from notification_submitted to decision):
//   minor       <10 MW   →  30 days
//   moderate    <50 MW   →  60 days
//   significant <150 MW  →  90 days
//   major       <500 MW  → 150 days
//   material    ≥500 MW  → 210 days
//
// Reportability:
//   - grant_approval  → EVERY tier  (any §11 licence change-of-control — the
//                                    W156 signature — is notifiable to NERSA
//                                    Council)
//   - reject_change   → major + material only
//   - file_appeal     → major + material only
//   - impose_conditions → significant + major + material only
//
// TransactionType captures the commercial form of the change-of-control
// event. ForeignOwnershipFlag drives the depth of the foreign_ownership_screen
// stage (SARB ExCon + FIC AML / KYC overlay for SADC-resident or
// non-SADC-foreign incoming controllers).
//
// actor_party (notifying_party / nersa_officer / appeal_body) is derived from
// the ACTION, not the JWT role — consistent with the audit-attribution model
// used across the W31/W33/W40/W43/W49 regulator chains. The primary write is
// single-party IPP-facing ({admin, ipp_developer}); NERSA officers write the
// regulatory evaluation stages via the same route with the regulator JWT role.
//
// Event prefix: coc_evt_
// ─────────────────────────────────────────────────────────────────────────

// ─── State machine types ────────────────────────────────────────────────────

export type ChangeOfControlStatus =
  | 'notification_submitted'
  | 'completeness_check'
  | 'foreign_ownership_screen'
  | 'competition_screen'
  | 'technical_assessment'
  | 'public_participation'
  | 'nersa_evaluation'
  | 'conditional_approval'
  | 'control_transferred'   // terminal — happy
  | 'withdrawn'             // terminal — voluntary exit
  | 'rejected'              // terminal (pending appeal) — §11 refusal
  | 'appeal_filed'          // post-rejection appeal
  | 'appeal_determined';    // terminal — appeal resolved

export type ChangeOfControlAction =
  | 'commence_completeness'
  | 'submit_foreign_screen'
  | 'commence_competition'
  | 'commence_technical'
  | 'open_public_participation'
  | 'close_public_participation'
  | 'issue_evaluation'
  | 'grant_approval'
  | 'impose_conditions'
  | 'transfer_control'
  | 'reject_change'
  | 'file_appeal'
  | 'determine_appeal'
  | 'withdraw';

// ─── Ownership tier (capacity-based, INVERTED SLA) ──────────────────────────

export type OwnershipTier =
  | 'minor'
  | 'moderate'
  | 'significant'
  | 'major'
  | 'material';

/**
 * Derive the ownership tier from the generation capacity (MW) of the affected
 * licensed facility. Larger capacity → NERSA scrutiny is higher → more time
 * is granted at each stage (INVERTED SLA).
 *
 *   <10 MW   → minor
 *   <50 MW   → moderate
 *   <150 MW  → significant
 *   <500 MW  → major
 *   ≥500 MW  → material
 */
export function deriveOwnershipTier(capacity_mw: number): OwnershipTier {
  if (capacity_mw < 10)  return 'minor';
  if (capacity_mw < 50)  return 'moderate';
  if (capacity_mw < 150) return 'significant';
  if (capacity_mw < 500) return 'major';
  return 'material';
}

// ─── Transaction type ────────────────────────────────────────────────────────

/**
 * Commercial form of the change-of-control event:
 *   share_transfer              — outright sale of equity in the SPV / licensee
 *   asset_acquisition           — sale of the generating assets (not the equity wrapper)
 *   merger_scheme_of_arrangement — Companies Act §115 fundamental transaction
 *   management_buyout           — incumbent management acquires control from sponsors
 *   fund_recycling              — private-equity / infrastructure-fund partial
 *                                 realisation with new GP or LP entering as controller
 *   change_of_lender_step_in    — a lender exercising a step-in right under the
 *                                 security package (related to W45 loan default)
 */
export type TransactionType =
  | 'share_transfer'
  | 'asset_acquisition'
  | 'merger_scheme_of_arrangement'
  | 'management_buyout'
  | 'fund_recycling'
  | 'change_of_lender_step_in';

// ─── Foreign ownership flag ──────────────────────────────────────────────────

/**
 * Residency of the incoming controlling party. Drives the depth of the
 * foreign_ownership_screen stage:
 *   domestic         — SA-resident acquirer; standard Companies Act / NERSA screen
 *   sadc_resident    — SADC-region resident; SARB ExCon light + FIC screening
 *   non_sadc_foreign — Non-SADC foreign acquirer; full SARB ExCon approval + FIC
 *                      AML/KYC + national-security fit-and-proper evaluation
 */
export type ForeignOwnershipFlag =
  | 'domestic'
  | 'sadc_resident'
  | 'non_sadc_foreign';

// ─── Terminals ───────────────────────────────────────────────────────────────

export const HARD_TERMINALS: ChangeOfControlStatus[] = [
  'control_transferred',
  'withdrawn',
  'rejected',
  'appeal_determined',
];

const TERMINAL_SET = new Set<ChangeOfControlStatus>(HARD_TERMINALS);

export function isTerminal(s: ChangeOfControlStatus): boolean {
  return TERMINAL_SET.has(s);
}

// ─── Valid transitions (status → allowed next statuses) ─────────────────────

/**
 * VALID_TRANSITIONS maps each state to the set of states it may transition
 * into directly. The pairing with ChangeOfControlAction is enforced by the
 * action-keyed TRANSITION_RULES below; VALID_TRANSITIONS is the authoritative
 * graph used for UI gating, testing, and graph-walk utilities.
 *
 *   notification_submitted  → [completeness_check, withdrawn]
 *   completeness_check      → [foreign_ownership_screen, withdrawn]
 *   foreign_ownership_screen→ [competition_screen, withdrawn]
 *   competition_screen      → [technical_assessment, withdrawn]
 *   technical_assessment    → [public_participation, withdrawn]
 *   public_participation    → [nersa_evaluation, withdrawn]
 *   nersa_evaluation        → [conditional_approval, rejected]
 *   conditional_approval    → [control_transferred]
 *   rejected                → [appeal_filed]
 *   appeal_filed            → [appeal_determined]
 *   (terminals carry no outgoing edges)
 */
export const VALID_TRANSITIONS: Readonly<
  Partial<Record<ChangeOfControlStatus, ChangeOfControlStatus[]>>
> = {
  notification_submitted:   ['completeness_check', 'withdrawn'],
  completeness_check:        ['foreign_ownership_screen', 'withdrawn'],
  foreign_ownership_screen:  ['competition_screen', 'withdrawn'],
  competition_screen:        ['technical_assessment', 'withdrawn'],
  technical_assessment:      ['public_participation', 'withdrawn'],
  public_participation:      ['nersa_evaluation', 'withdrawn'],
  nersa_evaluation:          ['conditional_approval', 'rejected'],
  conditional_approval:      ['control_transferred'],
  rejected:                  ['appeal_filed'],
  appeal_filed:              ['appeal_determined'],
  // terminals: no outgoing edges
  control_transferred:       [],
  withdrawn:                 [],
  appeal_determined:         [],
};

// ─── Action → transition rules ──────────────────────────────────────────────

interface TransitionRule {
  from: ChangeOfControlStatus[];
  to: ChangeOfControlStatus;
}

export const TRANSITION_RULES: Record<ChangeOfControlAction, TransitionRule> = {
  commence_completeness:     { from: ['notification_submitted'],  to: 'completeness_check' },
  submit_foreign_screen:     { from: ['completeness_check'],      to: 'foreign_ownership_screen' },
  commence_competition:      { from: ['foreign_ownership_screen'], to: 'competition_screen' },
  commence_technical:        { from: ['competition_screen'],      to: 'technical_assessment' },
  open_public_participation: { from: ['technical_assessment'],    to: 'public_participation' },
  close_public_participation:{ from: ['public_participation'],    to: 'nersa_evaluation' },
  issue_evaluation:          { from: ['nersa_evaluation'],        to: 'conditional_approval' },
  grant_approval:            { from: ['conditional_approval'],    to: 'control_transferred' },
  // impose_conditions is a modifier action on the conditional_approval state:
  // it does not advance the state machine itself but records that conditions
  // were attached before grant_approval is issued. Represented as a self-loop
  // on conditional_approval so it is a valid, auditable action while in that state.
  impose_conditions:         { from: ['conditional_approval'],    to: 'conditional_approval' },
  transfer_control:          { from: ['conditional_approval'],    to: 'control_transferred' },
  reject_change:             { from: ['nersa_evaluation'],        to: 'rejected' },
  file_appeal:               { from: ['rejected'],                to: 'appeal_filed' },
  determine_appeal:          { from: ['appeal_filed'],            to: 'appeal_determined' },
  withdraw: {
    from: [
      'notification_submitted',
      'completeness_check',
      'foreign_ownership_screen',
      'competition_screen',
      'technical_assessment',
      'public_participation',
    ],
    to: 'withdrawn',
  },
};

// ─── State-machine helpers ───────────────────────────────────────────────────

export function nextStatus(
  current: ChangeOfControlStatus,
  action: ChangeOfControlAction,
): ChangeOfControlStatus | null {
  if (isTerminal(current)) return null;
  const rule = TRANSITION_RULES[action];
  if (!rule) return null;
  if (!rule.from.includes(current)) return null;
  return rule.to;
}

export function allowedActions(current: ChangeOfControlStatus): ChangeOfControlAction[] {
  if (isTerminal(current)) return [];
  return (Object.keys(TRANSITION_RULES) as ChangeOfControlAction[]).filter((a) =>
    TRANSITION_RULES[a].from.includes(current),
  );
}

export function canTransitionTo(
  from: ChangeOfControlStatus,
  to: ChangeOfControlStatus,
): boolean {
  const nexts = VALID_TRANSITIONS[from];
  return nexts ? nexts.includes(to) : false;
}

// ─── INVERTED SLA (calendar days per stage, per tier) ───────────────────────

/**
 * SLA_DAYS gives the maximum calendar days allowed within each stage before
 * the chain is considered SLA-breached.
 *
 * This is INVERTED — larger capacity (more NERSA scrutiny) gets MORE days,
 * not fewer. The total from notification_submitted to a final determination
 * targets: minor 30d / moderate 60d / significant 90d / major 150d /
 * material 210d. Stage allocations are proportioned accordingly.
 *
 * Terminal states carry no SLA budget (0 days).
 */
export const SLA_DAYS: Record<ChangeOfControlStatus, Record<OwnershipTier, number>> = {
  notification_submitted: {
    minor:  2,
    moderate:  4,
    significant: 6,
    major:  10,
    material: 14,
  },
  completeness_check: {
    minor:  3,
    moderate:  5,
    significant: 8,
    major:  14,
    material: 21,
  },
  foreign_ownership_screen: {
    minor:  3,
    moderate:  7,
    significant: 10,
    major:  21,
    material: 30,
  },
  competition_screen: {
    minor:  5,
    moderate:  10,
    significant: 15,
    major:  25,
    material: 35,
  },
  technical_assessment: {
    minor:  7,
    moderate:  14,
    significant: 21,
    major:  35,
    material: 42,
  },
  public_participation: {
    // NERSA s10 minimum 30-day public-comment window at significant+;
    // minor/moderate are not subject to full public participation but still
    // carry a short internal circulation window.
    minor:  5,
    moderate:  10,
    significant: 30,
    major:  30,
    material: 45,
  },
  nersa_evaluation: {
    minor:  5,
    moderate:  10,
    significant: 15,
    major:  21,
    material: 28,
  },
  conditional_approval: {
    // Window for notifying party to satisfy conditions before grant or
    // lapse; larger projects have more conditions, more time to satisfy them.
    minor:  0,  // no conditions expected at minor scale
    moderate:  0,
    significant: 5,
    major:  14,
    material: 21,
  },
  // appeal path
  rejected: {
    // Window within which the notifying party may file an appeal; §11
    // regulations fix this at 30 days regardless of scale (statutory floor).
    minor:  30,
    moderate:  30,
    significant: 30,
    major:  30,
    material: 30,
  },
  appeal_filed: {
    // NERSA Energy Tribunal / High Court review window.
    minor:  60,
    moderate:  60,
    significant: 90,
    major:  120,
    material: 150,
  },
  // terminals carry no SLA budget
  control_transferred: { minor: 0, moderate: 0, significant: 0, major: 0, material: 0 },
  withdrawn:           { minor: 0, moderate: 0, significant: 0, major: 0, material: 0 },
  appeal_determined:   { minor: 0, moderate: 0, significant: 0, major: 0, material: 0 },
};

export function slaWindowDays(
  state: ChangeOfControlStatus,
  tier: OwnershipTier,
): number {
  return SLA_DAYS[state]?.[tier] ?? 0;
}

export function slaDeadlineFor(
  state: ChangeOfControlStatus,
  tier: OwnershipTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const days = slaWindowDays(state, tier);
  if (!days) return null;
  const d = new Date(enteredAt.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// ─── Reportability ────────────────────────────────────────────────────────────

const SIGNIFICANT_TIERS = new Set<OwnershipTier>(['significant', 'major', 'material']);
const MAJOR_TIERS = new Set<OwnershipTier>(['major', 'material']);

/**
 * crossesIntoRegulator returns true when this action + tier combination must
 * be surfaced to the NERSA Council oversight / regulator inbox.
 *
 *   grant_approval   → EVERY tier  (W156 signature — any §11 change-of-control
 *                                   approval is a material regulatory event)
 *   reject_change    → major + material only
 *   file_appeal      → major + material only
 *   impose_conditions → significant + major + material only
 */
export function crossesIntoRegulator(
  action: ChangeOfControlAction,
  tier: OwnershipTier,
): boolean {
  if (action === 'grant_approval') return true;
  if (action === 'reject_change') return MAJOR_TIERS.has(tier);
  if (action === 'file_appeal')   return MAJOR_TIERS.has(tier);
  if (action === 'impose_conditions') return SIGNIFICANT_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: OwnershipTier): boolean {
  return MAJOR_TIERS.has(tier);
}

// ─── Actor-party attribution ─────────────────────────────────────────────────

export type ChangeOfControlParty =
  | 'notifying_party'
  | 'nersa_officer'
  | 'appeal_body';

/**
 * Derive the procedural party responsible for recording each action. The party
 * is derived from the ACTION, not the JWT role, following the audit-attribution
 * model used across the regulator chains (W31/W33/W40/W43/W49/W57).
 */
const ACTION_PARTY: Record<ChangeOfControlAction, ChangeOfControlParty> = {
  commence_completeness:      'nersa_officer',
  submit_foreign_screen:      'nersa_officer',
  commence_competition:       'nersa_officer',
  commence_technical:         'nersa_officer',
  open_public_participation:  'nersa_officer',
  close_public_participation: 'nersa_officer',
  issue_evaluation:           'nersa_officer',
  grant_approval:             'nersa_officer',
  impose_conditions:          'nersa_officer',
  transfer_control:           'notifying_party',
  reject_change:              'nersa_officer',
  file_appeal:                'notifying_party',
  determine_appeal:           'appeal_body',
  withdraw:                   'notifying_party',
};

export function partyForAction(action: ChangeOfControlAction): ChangeOfControlParty {
  return ACTION_PARTY[action];
}

// ─── Foreign-ownership screen depth helper ───────────────────────────────────

/**
 * Returns true when the foreign_ownership_screen stage must invoke the full
 * SARB Exchange Control + FIC AML/KYC overlay. For domestic acquirers this
 * stage is a pass-through; for SADC-resident acquirers a lighter SARB ExCon
 * check applies; for non-SADC-foreign acquirers the full dual-authority screen
 * applies.
 */
export function requiresFullForeignScreen(flag: ForeignOwnershipFlag): boolean {
  return flag === 'non_sadc_foreign';
}

export function requiresSarbExcon(flag: ForeignOwnershipFlag): boolean {
  return flag === 'sadc_resident' || flag === 'non_sadc_foreign';
}

// ─── Event types ─────────────────────────────────────────────────────────────

export type ChangeOfControlEvent =
  | 'coc_evt_notification_submitted'
  | 'coc_evt_completeness_check'
  | 'coc_evt_foreign_ownership_screen'
  | 'coc_evt_competition_screen'
  | 'coc_evt_technical_assessment'
  | 'coc_evt_public_participation_opened'
  | 'coc_evt_public_participation_closed'
  | 'coc_evt_nersa_evaluation'
  | 'coc_evt_conditional_approval'
  | 'coc_evt_conditions_imposed'
  | 'coc_evt_control_transferred'
  | 'coc_evt_change_rejected'
  | 'coc_evt_appeal_filed'
  | 'coc_evt_appeal_determined'
  | 'coc_evt_withdrawn'
  | 'coc_evt_sla_breached';

// ─── Row shape (D1 storage contract) ─────────────────────────────────────────

export interface ChangeOfControlRow {
  id: string;
  facility_id: string;
  licensee_id: string;                  // the licensed entity whose control changes
  transaction_type: TransactionType;
  foreign_ownership_flag: ForeignOwnershipFlag;
  capacity_mw: number;
  ownership_tier: OwnershipTier;
  chain_status: ChangeOfControlStatus;
  is_reportable: boolean;               // drives the reportable dot in the UI
  entered_current_state_at: string;     // ISO-8601, UTC
  sla_deadline: string | null;          // ISO-8601, UTC — null on terminals
  conditions_text: string | null;       // populated when impose_conditions fires
  appeal_grounds: string | null;        // populated when file_appeal fires
  outcome_notes: string | null;
  actor_id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}
