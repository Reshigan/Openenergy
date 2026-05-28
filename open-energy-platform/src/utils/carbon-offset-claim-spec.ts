// ─────────────────────────────────────────────────────────────────────────
// Wave 48 — Carbon Tax Offset Claim & Allowance lifecycle chain (P6)
//
// Carbon Tax Act 15 of 2019 §13 (offset allowance) + Carbon Offset Regulations
// GNR 1556 of 2019 + DFFE Carbon Offset Administration System (COAS) +
// SARS eFiling (Environmental Levy / carbon tax return, form EMP / CTR1).
//
// The MONETISATION / UTILISATION end of the carbon-credit lifecycle. Where W37
// registers a project, W11 verifies its reductions (MRV), W17 retires the
// resulting credits and W42 protects their permanence, THIS chain governs the
// taxpayer claiming RETIRED, ELIGIBLE credits against their South African
// carbon-tax liability. Per s.13 a taxpayer may reduce gross liability by up to
// 5% (most sectors) or 10% (mining / petroleum, "Annex 2"), using domestic
// credits retired in COAS under the taxpayer's name. A credit used here is
// locked against that tax period and cannot be re-applied (one retirement → one
// claim, by law).
//
//   claim_drafted → eligibility_screening → credits_earmarked →
//     claim_submitted → sars_review → allowance_granted →
//     applied_to_return → reconciled
//
// SARS may raise a query mid-review (request-for-information):
//   sars_review → sars_query → (respond) → sars_review
//
// Branches:
//   rejected     — SARS rejects the claim (ineligible / double-counted credits,
//                  vintage out of window, project not SA-located).  [from sars_review]
//   clawed_back  — a SARS audit finds the credits ineligible, OR the underlying
//                  credits were REVERSED (W42), so the allowance is recovered
//                  (with understatement exposure). Reachable while the claim is
//                  still open against the assessment window.
//                  [from allowance_granted | applied_to_return]
//   withdrawn    — taxpayer withdraws before SARS assessment.
//                  [from claim_drafted | eligibility_screening | credits_earmarked | claim_submitted]
//
// Tiers (offset VALUE materiality — drive urgency + reportability):
//   major_claim    — offset value ≥ R10m
//   standard_claim — R1m ≤ value < R10m
//   minor_claim    — value < R1m
//
// SLA matrix is INVERTED — the LARGER the claim, the LONGER every window. A
// material offset claim warrants deeper SARS scrutiny and document review, so
// the larger the rand value the more review time is allowed (same flavour as
// W43 MYPD determination). Distinct from the recent run of URGENT chains.
//
// Reportability (crossings land in the regulator/SARS inbox):
//   claw_back      crosses for EVERY tier — a clawback is an understatement /
//                  penalty-exposure event regardless of size (universal hard
//                  line, same as W45 write-off / W46 arbitration).
//   reject_claim   crosses for material tiers (major + standard).
//   grant_allowance crosses for major_claim — a material offset utilisation is
//                  notifiable to DFFE COAS / SARS.
//   sla_breached   crosses for material tiers (major + standard).
// Minor claims are routine eFiling and stay internal unless clawed back.
// ─────────────────────────────────────────────────────────────────────────

export type ClaimStatus =
  | 'claim_drafted'
  | 'eligibility_screening'
  | 'credits_earmarked'
  | 'claim_submitted'
  | 'sars_review'
  | 'sars_query'
  | 'allowance_granted'
  | 'applied_to_return'
  | 'reconciled'
  | 'rejected'
  | 'clawed_back'
  | 'withdrawn';

export type ClaimAction =
  | 'screen_eligibility'
  | 'earmark_credits'
  | 'submit_claim'
  | 'begin_review'
  | 'raise_query'
  | 'respond_query'
  | 'grant_allowance'
  | 'reject_claim'
  | 'apply_to_return'
  | 'reconcile'
  | 'claw_back'
  | 'withdraw';

export type ClaimTier = 'major_claim' | 'standard_claim' | 'minor_claim';

export type ClaimParty = 'taxpayer' | 'registry' | 'sars';

export type ClaimEvent =
  | 'carbon_offset_claim.eligibility_screening'
  | 'carbon_offset_claim.credits_earmarked'
  | 'carbon_offset_claim.claim_submitted'
  | 'carbon_offset_claim.sars_review'
  | 'carbon_offset_claim.sars_query'
  | 'carbon_offset_claim.allowance_granted'
  | 'carbon_offset_claim.applied_to_return'
  | 'carbon_offset_claim.reconciled'
  | 'carbon_offset_claim.rejected'
  | 'carbon_offset_claim.clawed_back'
  | 'carbon_offset_claim.withdrawn'
  | 'carbon_offset_claim.sla_breached';

const TERMINALS = new Set<ClaimStatus>(['reconciled', 'rejected', 'clawed_back', 'withdrawn']);

const WITHDRAWABLE = new Set<ClaimStatus>([
  'claim_drafted',
  'eligibility_screening',
  'credits_earmarked',
  'claim_submitted',
]);

export function isTerminal(s: ClaimStatus): boolean {
  return TERMINALS.has(s);
}

export function isWithdrawable(s: ClaimStatus): boolean {
  return WITHDRAWABLE.has(s);
}

export const TRANSITIONS: Record<ClaimAction, { from: ClaimStatus[]; to: ClaimStatus }> = {
  screen_eligibility: { from: ['claim_drafted'],            to: 'eligibility_screening' },
  earmark_credits:    { from: ['eligibility_screening'],    to: 'credits_earmarked' },
  submit_claim:       { from: ['credits_earmarked'],        to: 'claim_submitted' },
  begin_review:       { from: ['claim_submitted'],          to: 'sars_review' },
  raise_query:        { from: ['sars_review'],              to: 'sars_query' },
  respond_query:      { from: ['sars_query'],               to: 'sars_review' },
  grant_allowance:    { from: ['sars_review'],              to: 'allowance_granted' },
  reject_claim:       { from: ['sars_review'],              to: 'rejected' },
  apply_to_return:    { from: ['allowance_granted'],        to: 'applied_to_return' },
  reconcile:          { from: ['applied_to_return'],        to: 'reconciled' },
  claw_back:          { from: ['allowance_granted', 'applied_to_return'], to: 'clawed_back' },
  withdraw:           { from: ['claim_drafted', 'eligibility_screening', 'credits_earmarked', 'claim_submitted'], to: 'withdrawn' },
};

export function nextStatus(current: ClaimStatus, action: ClaimAction): ClaimStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: ClaimStatus): ClaimAction[] {
  const acts: ClaimAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [ClaimAction, typeof TRANSITIONS[ClaimAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const DAY = 24 * 60 * MIN;

// INVERTED matrix — the LARGER the claim, the LONGER every window.
export const SLA_MINUTES: Record<ClaimStatus, Record<ClaimTier, number>> = {
  claim_drafted: {
    major_claim:    14 * DAY,
    standard_claim: 7 * DAY,
    minor_claim:    3 * DAY,
  },
  eligibility_screening: {
    major_claim:    21 * DAY,
    standard_claim: 14 * DAY,
    minor_claim:    7 * DAY,
  },
  credits_earmarked: {
    major_claim:    14 * DAY,
    standard_claim: 10 * DAY,
    minor_claim:    5 * DAY,
  },
  claim_submitted: {
    major_claim:    30 * DAY,
    standard_claim: 14 * DAY,
    minor_claim:    7 * DAY,
  },
  sars_review: {
    major_claim:    45 * DAY,
    standard_claim: 21 * DAY,
    minor_claim:    10 * DAY,
  },
  sars_query: {
    major_claim:    21 * DAY,
    standard_claim: 14 * DAY,
    minor_claim:    7 * DAY,
  },
  allowance_granted: {
    major_claim:    30 * DAY,
    standard_claim: 21 * DAY,
    minor_claim:    14 * DAY,
  },
  applied_to_return: {
    major_claim:    60 * DAY,
    standard_claim: 30 * DAY,
    minor_claim:    21 * DAY,
  },
  reconciled:  { major_claim: 0, standard_claim: 0, minor_claim: 0 },
  rejected:    { major_claim: 0, standard_claim: 0, minor_claim: 0 },
  clawed_back: { major_claim: 0, standard_claim: 0, minor_claim: 0 },
  withdrawn:   { major_claim: 0, standard_claim: 0, minor_claim: 0 },
};

export function slaWindowMinutes(status: ClaimStatus, tier: ClaimTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: ClaimStatus, tier: ClaimTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Material claims (major + standard) get SARS / DFFE-board scrutiny; minor
// claims are routine eFiling and stay internal unless clawed back.
const MATERIAL_TIERS = new Set<ClaimTier>(['major_claim', 'standard_claim']);

export function isReportableTier(tier: ClaimTier): boolean {
  return MATERIAL_TIERS.has(tier);
}

// Reportability matrix:
//   - claw_back crosses for EVERY tier — an understatement / penalty-exposure
//     event regardless of claim size.
//   - reject_claim crosses for material tiers (major + standard).
//   - grant_allowance crosses for major_claim — a material offset utilisation
//     notifiable to DFFE COAS / SARS.
export function crossesIntoRegulator(action: ClaimAction, tier: ClaimTier): boolean {
  if (action === 'claw_back')       return true;
  if (action === 'reject_claim')    return MATERIAL_TIERS.has(tier);
  if (action === 'grant_allowance') return tier === 'major_claim';
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: ClaimTier): boolean {
  return MATERIAL_TIERS.has(tier);
}

// s.13 offset allowance percentage: 10% for Annex-2 (mining / petroleum),
// 5% for all other industry groups. Mirrors carbon-tax.ts::offsetAllowancePct
// so the chain and the standalone calculator never diverge.
export function offsetAllowancePct(industryGroup: 'general' | 'annex_2'): number {
  return industryGroup === 'annex_2' ? 10 : 5;
}

// Party that each action represents. One carbon-fund desk records the workflow;
// this tags the contractual function performing each step (audit attribution
// only, NOT an access split — same single-party model as W42 / W37).
//   taxpayer — the carbon-tax-liable entity claiming the offset
//   registry — DFFE Carbon Offset Administration System (eligibility + lock)
//   sars     — the South African Revenue Service (review + assessment)
const ACTION_PARTY: Record<ClaimAction, ClaimParty> = {
  screen_eligibility: 'registry',
  earmark_credits:    'registry',
  submit_claim:       'taxpayer',
  begin_review:       'sars',
  raise_query:        'sars',
  respond_query:      'taxpayer',
  grant_allowance:    'sars',
  reject_claim:       'sars',
  apply_to_return:    'taxpayer',
  reconcile:          'sars',
  claw_back:          'sars',
  withdraw:           'taxpayer',
};

export function partyForAction(action: ClaimAction): ClaimParty {
  return ACTION_PARTY[action];
}
