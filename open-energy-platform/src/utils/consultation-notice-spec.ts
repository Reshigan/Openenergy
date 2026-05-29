// ─────────────────────────────────────────────────────────────────────────
// Wave 83 — NERSA Consultation Notice & Public-Comment Period chain (P6)
//
// The PUBLIC-ENGAGEMENT engine of the energy regulator. NERSA must publish a
// notice and invite comment before adopting any material rule, methodology,
// licence condition or tariff determination — Electricity Regulation Act 4 of
// 2006 s.10, Promotion of Administrative Justice Act 3 of 2000 s.4, and
// NERSA's own Rules of Procedure all anchor it. THIS chain governs the
// notice lifecycle: draft → publish (Gazette) → open comment period →
// optional extension → close → optional public hearing → analysis →
// consolidated response (with reasons) → adopted decision; with on-hold for
// legal review and withdrawn/cancelled terminals.
//
// DISTINCT from every other regulator chain by SUBJECT:
//   - [[project-wave5-regulator-portal]] is the inbox/SLA materializer.
//   - [[project-wave31-disposition-chain]] is the OUTCOME of a NERSA s10
//     case (the decision after due process); W83 is the DUE-PROCESS engine
//     that PRECEDES it.
//   - [[project-wave33-licence-renewal-chain]] / [[project-wave49-licence-application-chain]]
//     / [[project-wave57-sseg-registration-chain]] are licence lifecycle.
//   - [[project-wave40-compliance-inspection-chain]] is PROACTIVE supervisory.
//   - [[project-wave43-tariff-determination-chain]] sets WHAT a licensee
//     charges — its own consultation may flow through THIS chain.
//   - [[project-wave66-complaint-resolution-chain]] is REACTIVE external
//     party complaints.
//   - [[project-wave74-levy-assessment-chain]] is what licensees OWE NERSA.
//
// Clean path:
//   drafted → published → open_for_comment → comment_period_closed
//           → analysis → response_drafted → adopted               (terminal OK)
//
// Optional hearing branch:
//   comment_period_closed → hearing_scheduled → hearing_held → analysis
//
// Branches / terminals:
//   on_hold    — legal review or extended notice pause; resume → analysis.
//   withdrawn  — NERSA pulls the consultation notice from any pre-adopted
//                state. Terminal.
//   cancelled  — admin cancel (drafting error / duplicate). Terminal.
//
// Tiers (4) by ESTIMATED affected_parties_count — drive SLA + reportability:
//   minor      < 50      (procedural notice)
//   standard   < 500     (ordinary regulatory consultation)
//   material   < 5000    (significant determination — e.g. methodology)
//   landmark   >= 5000   (structural policy — e.g. wheeling framework)
//
// FLOOR: a BINDING consultation_class (binding determination or structural
// policy) floors at 'material' regardless of raw parties count — binding
// administrative action attracts heightened procedural-fairness scrutiny.
//
// SLA matrix is INVERTED — the LARGER the consultation, the LONGER every
// window. A landmark structural-policy consultation warrants extended
// notice / extended comment / extended analysis (procedural fairness is
// quantum-of-affected-parties driven). Same family as W19/W20/W43/W49/W56/
// W65/W70/W73/W81/W82.
//
// Reportability — the W83 SIGNATURE is TRANSPARENCY-driven. The single hard
// admin-justice line of any consultation is the published notice itself:
// any WITHDRAWAL of a published consultation is ALWAYS notifiable to the
// PAJA / Council oversight queue (a published notice that does not result
// in a decision is itself a procedural-fairness event):
//   withdraw_notice   crosses for EVERY tier — the distinctive W83 hard
//                     line ("pulling a published consultation is itself
//                     always reportable to admin-justice oversight").
//   adopt_decision    crosses for EVERY tier when the consultation is of
//                     binding class (binding determinations carry
//                     downstream legal effect); else for the large tiers
//                     (material + landmark).
//   extend_comment_period crosses for the large tiers (extensions on big
//                     consultations are procedurally sensitive).
//   sla_breached      crosses for the large tiers (material + landmark).
//
// Single regulator desk write {admin, regulator} — NERSA secretariat
// records the whole lifecycle (same single-party model as W31/W40/W57/W66/
// W74). actor_party tags the function performing each step (secretariat /
// panel / presiding_member / stakeholder) for audit attribution only, NOT
// access.
// ─────────────────────────────────────────────────────────────────────────

export type ConsultationStatus =
  | 'drafted'
  | 'published'
  | 'open_for_comment'
  | 'comment_period_closed'
  | 'hearing_scheduled'
  | 'hearing_held'
  | 'analysis'
  | 'response_drafted'
  | 'adopted'
  | 'on_hold'
  | 'withdrawn'
  | 'cancelled';

export type ConsultationAction =
  | 'publish_notice'
  | 'open_comment_period'
  | 'extend_comment_period'
  | 'close_comment_period'
  | 'reopen_for_comment'
  | 'schedule_hearing'
  | 'hold_hearing'
  | 'begin_analysis'
  | 'draft_response'
  | 'adopt_decision'
  | 'place_on_hold'
  | 'resume'
  | 'withdraw_notice'
  | 'cancel';

export type ConsultationTier = 'minor' | 'standard' | 'material' | 'landmark';

// Functional party performing each step (audit attribution only).
export type ConsultationParty = 'secretariat' | 'panel' | 'presiding_member' | 'stakeholder';

// ERA-rooted consultation taxonomy.
export type ConsultationKind =
  | 'rulemaking'         // generic rulemaking notice
  | 'methodology'        // tariff-methodology consultation (feeds W43)
  | 'licence_condition'  // licence amendment / condition consultation
  | 'code_amendment'     // grid-code / metering-code amendment
  | 'policy'             // structural policy paper
  | 'rates_decision';    // tariff decision consultation

// Consultation class — drives binding-floor reportability.
export type ConsultationClass = 'binding' | 'guidance' | 'consultative';

export type ConsultationEvent =
  | 'consultation_notice.published'
  | 'consultation_notice.open_for_comment'
  | 'consultation_notice.comment_period_closed'
  | 'consultation_notice.hearing_scheduled'
  | 'consultation_notice.hearing_held'
  | 'consultation_notice.analysis'
  | 'consultation_notice.response_drafted'
  | 'consultation_notice.adopted'
  | 'consultation_notice.on_hold'
  | 'consultation_notice.withdrawn'
  | 'consultation_notice.cancelled'
  | 'consultation_notice.sla_breached';

const TERMINALS = new Set<ConsultationStatus>(['adopted', 'withdrawn', 'cancelled']);

const PRE_ADOPTED_CANCELLABLE = new Set<ConsultationStatus>([
  'drafted',
  'published',
  'open_for_comment',
  'comment_period_closed',
  'hearing_scheduled',
  'hearing_held',
  'analysis',
  'response_drafted',
  'on_hold',
]);

export function isTerminal(s: ConsultationStatus): boolean {
  return TERMINALS.has(s);
}

export function isCancellable(s: ConsultationStatus): boolean {
  return PRE_ADOPTED_CANCELLABLE.has(s);
}

export const TRANSITIONS: Record<ConsultationAction, { from: ConsultationStatus[]; to: ConsultationStatus }> = {
  publish_notice:        { from: ['drafted'],                                                                                                                                              to: 'published' },
  open_comment_period:   { from: ['published'],                                                                                                                                            to: 'open_for_comment' },
  // extension re-enters the same state — bumps deadline + extension counter,
  // re-fires the cascade so regulator-inbox can re-materialise the entry for
  // large consultations.
  extend_comment_period: { from: ['open_for_comment'],                                                                                                                                     to: 'open_for_comment' },
  close_comment_period:  { from: ['open_for_comment'],                                                                                                                                     to: 'comment_period_closed' },
  reopen_for_comment:    { from: ['comment_period_closed'],                                                                                                                                to: 'open_for_comment' },
  schedule_hearing:      { from: ['comment_period_closed'],                                                                                                                                to: 'hearing_scheduled' },
  hold_hearing:          { from: ['hearing_scheduled'],                                                                                                                                    to: 'hearing_held' },
  begin_analysis:        { from: ['comment_period_closed', 'hearing_held'],                                                                                                                to: 'analysis' },
  draft_response:        { from: ['analysis'],                                                                                                                                             to: 'response_drafted' },
  adopt_decision:        { from: ['response_drafted'],                                                                                                                                     to: 'adopted' },
  place_on_hold:         { from: ['published', 'open_for_comment', 'comment_period_closed', 'hearing_scheduled', 'hearing_held', 'analysis', 'response_drafted'],                          to: 'on_hold' },
  resume:                { from: ['on_hold'],                                                                                                                                              to: 'analysis' },
  withdraw_notice:       { from: ['drafted', 'published', 'open_for_comment', 'comment_period_closed', 'hearing_scheduled', 'hearing_held', 'analysis', 'response_drafted', 'on_hold'],    to: 'withdrawn' },
  cancel:                { from: ['drafted', 'published', 'open_for_comment', 'comment_period_closed', 'hearing_scheduled', 'hearing_held', 'analysis', 'response_drafted', 'on_hold'],    to: 'cancelled' },
};

export function nextStatus(current: ConsultationStatus, action: ConsultationAction): ConsultationStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: ConsultationStatus): ConsultationAction[] {
  const acts: ConsultationAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [ConsultationAction, typeof TRANSITIONS[ConsultationAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const DAY = 24 * 60 * MIN;

// INVERTED matrix — the LARGER the consultation, the LONGER every window.
// Strictly increasing minor → landmark per graded state. Terminals carry no
// deadline. open_for_comment carries the statutory minimum notice period
// floor (PAJA / s.10 typically requires at least 30 days for material
// consultations; the schedule below honours that with the standard tier).
export const SLA_MINUTES: Record<ConsultationStatus, Record<ConsultationTier, number>> = {
  drafted:               { minor: 3 * DAY,  standard: 5 * DAY,  material: 10 * DAY, landmark: 14 * DAY },
  published:             { minor: 2 * DAY,  standard: 3 * DAY,  material: 5 * DAY,  landmark: 7 * DAY },
  open_for_comment:      { minor: 14 * DAY, standard: 30 * DAY, material: 45 * DAY, landmark: 60 * DAY },
  comment_period_closed: { minor: 3 * DAY,  standard: 5 * DAY,  material: 7 * DAY,  landmark: 10 * DAY },
  hearing_scheduled:     { minor: 7 * DAY,  standard: 10 * DAY, material: 14 * DAY, landmark: 21 * DAY },
  hearing_held:          { minor: 3 * DAY,  standard: 5 * DAY,  material: 7 * DAY,  landmark: 10 * DAY },
  analysis:              { minor: 10 * DAY, standard: 14 * DAY, material: 21 * DAY, landmark: 30 * DAY },
  response_drafted:      { minor: 5 * DAY,  standard: 7 * DAY,  material: 10 * DAY, landmark: 14 * DAY },
  on_hold:               { minor: 14 * DAY, standard: 21 * DAY, material: 30 * DAY, landmark: 45 * DAY },
  adopted:               { minor: 0, standard: 0, material: 0, landmark: 0 },
  withdrawn:             { minor: 0, standard: 0, material: 0, landmark: 0 },
  cancelled:             { minor: 0, standard: 0, material: 0, landmark: 0 },
};

export function slaWindowMinutes(status: ConsultationStatus, tier: ConsultationTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: ConsultationStatus, tier: ConsultationTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

const TIER_RANK: Record<ConsultationTier, number> = { minor: 0, standard: 1, material: 2, landmark: 3 };
const LARGE_TIERS = new Set<ConsultationTier>(['material', 'landmark']);

export function isLargeTier(tier: ConsultationTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Base tier by estimated affected parties.
export function baseTierForAffectedParties(count: number): ConsultationTier {
  if (count < 50) return 'minor';
  if (count < 500) return 'standard';
  if (count < 5000) return 'material';
  return 'landmark';
}

// A binding-class consultation floors at 'material' regardless of raw
// parties count — binding administrative action carries downstream legal
// effect, so it attracts heightened procedural scrutiny.
export function isBindingClass(klass: ConsultationClass): boolean {
  return klass === 'binding';
}

// Effective tier — base tier raised to the binding floor ('material') for a
// binding-class consultation.
export function tierForAffectedParties(count: number, klass: ConsultationClass): ConsultationTier {
  const base = baseTierForAffectedParties(count);
  if (isBindingClass(klass) && TIER_RANK[base] < TIER_RANK['material']) {
    return 'material';
  }
  return base;
}

// Reportability matrix (the W83 SIGNATURE is TRANSPARENCY-driven):
//   - withdraw_notice crosses for EVERY tier — pulling a published
//     consultation is ALWAYS notifiable to PAJA / Council oversight.
//   - adopt_decision crosses for EVERY tier when the consultation is of
//     binding class (binding determinations carry legal effect); else for
//     the large tiers (material + landmark).
//   - extend_comment_period crosses for the large tiers (extensions on big
//     consultations are procedurally sensitive).
export function crossesIntoRegulator(action: ConsultationAction, tier: ConsultationTier, isBinding = false): boolean {
  if (action === 'withdraw_notice') return true;
  if (action === 'adopt_decision') return isBinding || LARGE_TIERS.has(tier);
  if (action === 'extend_comment_period') return LARGE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: ConsultationTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Reportable irrespective of action — true when binding-class OR large tier.
export function isReportable(tier: ConsultationTier, isBinding: boolean): boolean {
  return isBinding || LARGE_TIERS.has(tier);
}

// Functional party each action represents. Audit attribution only.
const ACTION_PARTY: Record<ConsultationAction, ConsultationParty> = {
  publish_notice:        'secretariat',
  open_comment_period:   'secretariat',
  extend_comment_period: 'secretariat',
  close_comment_period:  'secretariat',
  reopen_for_comment:    'secretariat',
  schedule_hearing:      'secretariat',
  hold_hearing:          'presiding_member',
  begin_analysis:        'panel',
  draft_response:        'panel',
  adopt_decision:        'presiding_member',
  place_on_hold:         'secretariat',
  resume:                'secretariat',
  withdraw_notice:       'presiding_member',
  cancel:                'secretariat',
};

export function partyForAction(action: ConsultationAction): ConsultationParty {
  return ACTION_PARTY[action];
}

// ── "Beat best-in-class" decision helpers ─────────────────────────────────
// ACER (EU energy regulator) consultation portal, FERC eFiling, Ofgem
// consultation hub, AER consultation register, BEREC public consultation
// system — all run essentially linear publish-comment-respond workflows
// with manual procedural-validity tracking. The platform's edge is a LIVE
// consultation-health battery exposed on every record: comments received,
// stakeholder-balance index, representativeness coverage, statutory-period
// validity flag, judicial-review risk score, days remaining, and
// extension-count visibility — all derived from the same inputs each
// transition.

// Days remaining in the comment period (positive = open, 0 = closing
// today, negative = past close).
export function daysUntilCommentClose(commentEndAt: Date | null, now: Date): number | null {
  if (!commentEndAt) return null;
  const ms = commentEndAt.getTime() - now.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

// Days elapsed since the comment period opened (0 = today, positive = past).
export function daysInCommentPeriod(commentStartAt: Date | null, now: Date): number | null {
  if (!commentStartAt) return null;
  const ms = now.getTime() - commentStartAt.getTime();
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
}

// Procedural validity — was the statutory minimum notice period satisfied,
// and was a hearing held if the consultation is binding-class? Returns true
// when:
//   - the comment period (effective close minus open) is at least the
//     statutory minimum for the tier (minor 14d / standard 30d /
//     material 45d / landmark 60d, matching the SLA floor); AND
//   - a hearing has been held if the consultation is binding-class.
export function proceduralValidityOk(
  tier: ConsultationTier,
  commentStartAt: Date | null,
  commentEndAt: Date | null,
  hearingHeldAt: Date | null,
  isBinding: boolean,
): boolean {
  if (!commentStartAt || !commentEndAt) return false;
  const minDays = SLA_MINUTES.open_for_comment[tier] / DAY;
  const elapsed = (commentEndAt.getTime() - commentStartAt.getTime()) / (24 * 60 * 60 * 1000);
  if (elapsed < minDays) return false;
  if (isBinding && !hearingHeldAt) return false;
  return true;
}

// Stakeholder-balance index (0..1, 1.0 = perfectly balanced). Computed
// across 5 stakeholder buckets: industry, consumer, civil_society, ipp,
// government. Uses 1 - Gini-style dispersion: if all comments come from one
// bucket, index = 0; if evenly spread across 5, index = 1.
export function balanceIndex(buckets: Record<string, number>): number {
  const keys = ['industry', 'consumer', 'civil_society', 'ipp', 'government'];
  const counts = keys.map((k) => Math.max(0, buckets[k] || 0));
  const total = counts.reduce((s, n) => s + n, 0);
  if (total <= 0) return 0;
  // L1 deviation from uniform, normalised.
  const uniform = total / keys.length;
  const deviation = counts.reduce((s, n) => s + Math.abs(n - uniform), 0);
  const maxDeviation = 2 * (total - uniform); // theoretical max when one bucket holds all
  if (maxDeviation <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - deviation / maxDeviation));
}

// Representativeness index — geographic + sectoral coverage (0..1). Inputs
// are the count of distinct provinces represented (out of 9 SA provinces)
// and the count of distinct sectors (out of an assumed 8 sectors).
export function representativenessIndex(provincesRepresented: number, sectorsRepresented: number): number {
  const p = Math.max(0, Math.min(9, provincesRepresented)) / 9;
  const s = Math.max(0, Math.min(8, sectorsRepresented)) / 8;
  return Math.max(0, Math.min(1, (p + s) / 2));
}

// Coverage completeness — fraction of consultation questions answered by at
// least one comment (0..1).
export function coverageCompleteness(questionsAnswered: number, totalQuestions: number): number {
  if (totalQuestions <= 0) return 0;
  return Math.max(0, Math.min(1, questionsAnswered / totalQuestions));
}

// Judicial-review risk score (0..100, higher = more risk). Composite:
//   +25 if procedural validity fails (statutory period or hearing)
//   +20 if balance index < 0.3 (consultation captured by one bucket)
//   +15 if coverage completeness < 0.5 (under half the questions answered)
//   +15 if representativeness < 0.3 (narrow geographic / sectoral spread)
//   +15 if extensions > 2 (procedural drift)
//   +10 if comments_received < 10 (no real engagement)
export function judicialReviewRiskScore(
  proceduralOk: boolean,
  balance: number,
  coverage: number,
  representativeness: number,
  extensions: number,
  commentsReceived: number,
): number {
  let score = 0;
  if (!proceduralOk) score += 25;
  if (balance < 0.3) score += 20;
  if (coverage < 0.5) score += 15;
  if (representativeness < 0.3) score += 15;
  if (extensions > 2) score += 15;
  if (commentsReceived < 10) score += 10;
  return Math.max(0, Math.min(100, score));
}

// Predicted consultation turnaround (days) — sum of forward-path SLA
// windows for the tier (publication → open → close → analysis → response →
// adopt). Lets the secretariat quote a realistic adoption date up front
// (beats the open-ended publish-and-wait of legacy consultation portals).
export function predictedConsultationDays(tier: ConsultationTier): number {
  const forward: ConsultationStatus[] = [
    'drafted',
    'published',
    'open_for_comment',
    'comment_period_closed',
    'analysis',
    'response_drafted',
  ];
  const minutes = forward.reduce((sum, s) => sum + (SLA_MINUTES[s]?.[tier] ?? 0), 0);
  return Math.round(minutes / DAY);
}
