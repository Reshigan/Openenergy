// ─────────────────────────────────────────────────────────────────────────
// Wave 134 - IPP Stakeholder Register & Engagement Tracking.
//
// PHASE E WAVE 4 OF N — IPP-PM profile-completeness wave.
//
// PMBOK 7 Stakeholder Management (Section 13) + ISO 21500:2021 stakeholder
// management + IFC Performance Standard 1 (community engagement) +
// Equator Principles IV (EP4 Conditions 3 & 5) + REIPPPP Section 4
// community participation requirements + NERSA licence conditions.
//
// Beats: Engage (stakeholder engagement platform), Darzin (community
// engagement software), Boora, Synergi, Quorum, Stakeholder Map Pro,
// Borealis CSR/engagement software.
//
// 12-state engagement lifecycle:
//   identified -> analyzed -> classified -> engagement_planned ->
//     active_engagement -> responsive -> supportive -> champion (HARD target)
//   any non-terminal -> flag_resistant -> resistant (SIGNATURE)
//   active_engagement/responsive/supportive -> flag_disengaged -> disengaged
//   resistant/disengaged -> escalate_engagement -> escalated (SIGNATURE)
//   disengaged/resistant/escalated -> re_engage -> active_engagement
//   champion/supportive -> archive_stakeholder -> archived (HARD)
//   cron -> flag_overdue -> status unchanged (SLA sweep)
//
// URGENT SLA polarity (HOURS) — strategic_ally 24h TIGHTEST (daily contact):
//   strategic_ally  24h   (daily contact required)
//   key_player      48h   (every 2 days)
//   keep_satisfied  168h  (weekly)
//   keep_informed   336h  (bi-weekly)
//   monitor         720h  (monthly — loosest)
//
// W134 SIGNATURE regulator crossings:
//   escalate_engagement EVERY tier — any stakeholder escalation is always reportable
//     (REIPPPP S4 + IFC PS1: failure to manage community stakeholders is always material)
//   flag_resistant EVERY tier when power_score >= 4
//     (high-power resistant stakeholder = REIPPPP community-participation risk always reportable)
//
// Write {admin, ipp_developer}. READ all 9 personas.
// AUDIT_PREFIX_MAP: ipp_stakeholder -> 'ipp' (JOINS existing IPP-PM family).
// ─────────────────────────────────────────────────────────────────────────

export type StakeholderStatus =
  | 'identified'
  | 'analyzed'
  | 'classified'
  | 'engagement_planned'
  | 'active_engagement'
  | 'responsive'
  | 'supportive'
  | 'champion'
  | 'resistant'
  | 'disengaged'
  | 'escalated'
  | 'archived';

export type StakeholderAction =
  | 'analyze_stakeholder'    // identified → analyzed
  | 'classify_stakeholder'   // analyzed → classified
  | 'plan_engagement'        // classified → engagement_planned
  | 'activate_engagement'    // engagement_planned → active_engagement
  | 'record_response'        // active_engagement → responsive
  | 'confirm_supportive'     // responsive → supportive
  | 'elevate_to_champion'    // supportive → champion
  | 'flag_resistant'         // any non-terminal → resistant (W134 SIGNATURE trigger)
  | 'flag_disengaged'        // active_engagement/responsive/supportive → disengaged
  | 'escalate_engagement'    // resistant/disengaged → escalated (W134 SIGNATURE)
  | 're_engage'              // disengaged/resistant/escalated → active_engagement
  | 'archive_stakeholder'    // champion/supportive → archived
  | 'flag_overdue';          // cron: any non-terminal, status unchanged

export type StakeholderTier =
  | 'strategic_ally'
  | 'key_player'
  | 'keep_satisfied'
  | 'keep_informed'
  | 'monitor';

export type StakeholderType =
  | 'community_leader'
  | 'municipality'
  | 'traditional_authority'
  | 'regulator'
  | 'funder'
  | 'offtaker'
  | 'contractor'
  | 'consultant'
  | 'ngo'
  | 'government_dept'
  | 'media'
  | 'internal';

export type EngagementLevel =
  | 'unaware'
  | 'resistant'
  | 'neutral'
  | 'supportive'
  | 'leading';

export type StakeholderEvent =
  | 'ipp_stakeholder.analyze_stakeholder'
  | 'ipp_stakeholder.classify_stakeholder'
  | 'ipp_stakeholder.plan_engagement'
  | 'ipp_stakeholder.activate_engagement'
  | 'ipp_stakeholder.record_response'
  | 'ipp_stakeholder.confirm_supportive'
  | 'ipp_stakeholder.elevate_to_champion'
  | 'ipp_stakeholder.flag_resistant'
  | 'ipp_stakeholder.flag_disengaged'
  | 'ipp_stakeholder.escalate_engagement'
  | 'ipp_stakeholder.re_engage'
  | 'ipp_stakeholder.archive_stakeholder'
  | 'ipp_stakeholder.sla_breached';

// ─── SLA hours (URGENT polarity: strategic_ally 24h TIGHTEST) ────────────

export const SLA_HOURS: Record<StakeholderTier, number> = {
  strategic_ally:  24,   // daily contact required (URGENT — tightest)
  key_player:      48,   // every 2 days
  keep_satisfied:  168,  // weekly
  keep_informed:   336,  // bi-weekly
  monitor:         720,  // monthly (loosest)
};

export function slaHoursFor(tier: StakeholderTier): number {
  return SLA_HOURS[tier] ?? 168;
}

export function slaDeadlineFor(tier: StakeholderTier, from: Date): Date {
  const d = new Date(from);
  d.setTime(d.getTime() + slaHoursFor(tier) * 3600 * 1000);
  return d;
}

export function slaHoursRemaining(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now.getTime();
  return Math.round(ms / 3600000);
}

// ─── Tier derivation from P×I matrix ─────────────────────────────────────

export function deriveTierFromScore(
  _score: number,
  powerScore: number,
  interestScore: number,
): StakeholderTier {
  if (powerScore >= 5 && interestScore >= 5) return 'strategic_ally';
  if (powerScore >= 4 && interestScore >= 4) return 'key_player';
  if (powerScore >= 4) return 'keep_satisfied';
  if (interestScore >= 4) return 'keep_informed';
  return 'monitor';
}

// ─── State machine ────────────────────────────────────────────────────────

// Hard terminals: no further transitions
export const HARD_TERMINALS: StakeholderStatus[] = ['archived'];

const ALL_NON_TERMINAL: StakeholderStatus[] = [
  'identified', 'analyzed', 'classified', 'engagement_planned',
  'active_engagement', 'responsive', 'supportive', 'champion',
  'resistant', 'disengaged', 'escalated',
];

export const TRANSITIONS: Record<StakeholderAction, { from: StakeholderStatus[]; to: StakeholderStatus }> = {
  analyze_stakeholder:  { from: ['identified'], to: 'analyzed' },
  classify_stakeholder: { from: ['analyzed'], to: 'classified' },
  plan_engagement:      { from: ['classified'], to: 'engagement_planned' },
  activate_engagement:  { from: ['engagement_planned'], to: 'active_engagement' },
  record_response:      { from: ['active_engagement'], to: 'responsive' },
  confirm_supportive:   { from: ['responsive'], to: 'supportive' },
  elevate_to_champion:  { from: ['supportive'], to: 'champion' },
  flag_resistant:       {
    from: [
      'identified', 'analyzed', 'classified', 'engagement_planned',
      'active_engagement', 'responsive', 'supportive', 'champion',
      'disengaged',
    ],
    to: 'resistant',
  },
  flag_disengaged:      { from: ['active_engagement', 'responsive', 'supportive'], to: 'disengaged' },
  escalate_engagement:  { from: ['resistant', 'disengaged'], to: 'escalated' },
  re_engage:            { from: ['disengaged', 'resistant', 'escalated'], to: 'active_engagement' },
  archive_stakeholder:  { from: ['champion', 'supportive', 'monitor' as StakeholderStatus], to: 'archived' },
  flag_overdue:         { from: ALL_NON_TERMINAL, to: 'identified' }, // to field unused — nextStatus returns current
};

export function isHardTerminal(status: StakeholderStatus): boolean {
  return HARD_TERMINALS.includes(status);
}

export function nextStatus(
  current: StakeholderStatus,
  action: StakeholderAction,
): StakeholderStatus | null {
  if (isHardTerminal(current)) return null;
  if (action === 'flag_overdue') return current; // cron-only: status unchanged
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

// ─── Regulator crossings (W134 SIGNATURE) ────────────────────────────────

export interface StakeholderCrossArgs {
  power_score?: number | null;
  chain_status?: StakeholderStatus | null;
  floor_nersa_required?: boolean | number | null;
}

// W134 SIGNATURE:
//   escalate_engagement EVERY tier (any escalation is universally reportable)
//   flag_resistant EVERY tier when power_score >= 4
export function crossesIntoRegulator(
  action: StakeholderAction,
  args: StakeholderCrossArgs,
): boolean {
  if (action === 'escalate_engagement') return true; // EVERY tier, always crosses
  if (action === 'flag_resistant' && (args.power_score ?? 0) >= 4) return true;
  return false;
}

export function slaBreachCrossesIntoRegulator(
  tier: StakeholderTier,
  args: StakeholderCrossArgs,
): boolean {
  // NERSA-required strategic_ally or key_player SLA breach crosses regulator
  if (
    args.floor_nersa_required &&
    (tier === 'strategic_ally' || tier === 'key_player')
  ) return true;
  return false;
}

export function isReportable(
  action: StakeholderAction,
  args: StakeholderCrossArgs,
): boolean {
  return crossesIntoRegulator(action, args);
}

// ─── Status timestamp column mapping ─────────────────────────────────────

export function statusTsCol(status: StakeholderStatus): string {
  const map: Record<StakeholderStatus, string> = {
    identified:        'identified_at',
    analyzed:          'analyzed_at',
    classified:        'classified_at',
    engagement_planned:'engagement_planned_at',
    active_engagement: 'active_engagement_at',
    responsive:        'responsive_at',
    supportive:        'supportive_at',
    champion:          'champion_at',
    resistant:         'resistant_at',
    disengaged:        'disengaged_at',
    escalated:         'escalated_at',
    archived:          'archived_at',
  };
  return map[status] ?? 'updated_at';
}

// ─── Event type mapping ───────────────────────────────────────────────────

export function eventTypeFor(action: StakeholderAction): StakeholderEvent {
  const map: Record<StakeholderAction, StakeholderEvent> = {
    analyze_stakeholder:  'ipp_stakeholder.analyze_stakeholder',
    classify_stakeholder: 'ipp_stakeholder.classify_stakeholder',
    plan_engagement:      'ipp_stakeholder.plan_engagement',
    activate_engagement:  'ipp_stakeholder.activate_engagement',
    record_response:      'ipp_stakeholder.record_response',
    confirm_supportive:   'ipp_stakeholder.confirm_supportive',
    elevate_to_champion:  'ipp_stakeholder.elevate_to_champion',
    flag_resistant:       'ipp_stakeholder.flag_resistant',
    flag_disengaged:      'ipp_stakeholder.flag_disengaged',
    escalate_engagement:  'ipp_stakeholder.escalate_engagement',
    re_engage:            'ipp_stakeholder.re_engage',
    archive_stakeholder:  'ipp_stakeholder.archive_stakeholder',
    flag_overdue:         'ipp_stakeholder.sla_breached',
  };
  return map[action];
}

// ─── Helpers ─────────────────────────────────────────────────────────────

export function timeInStateHours(stateAt: string | null, now: Date): number | null {
  if (!stateAt) return null;
  return Math.round((now.getTime() - new Date(stateAt).getTime()) / 3600000);
}

export function urgencyBand(tier: StakeholderTier): string {
  switch (tier) {
    case 'strategic_ally':  return 'urgent';
    case 'key_player':      return 'high';
    case 'keep_satisfied':  return 'medium';
    case 'keep_informed':   return 'low';
    case 'monitor':         return 'minimal';
  }
}

export const TIER_LABELS: Record<StakeholderTier, string> = {
  strategic_ally: 'Strategic ally',
  key_player:     'Key player',
  keep_satisfied: 'Keep satisfied',
  keep_informed:  'Keep informed',
  monitor:        'Monitor',
};

export const TIER_SLA_LABEL: Record<StakeholderTier, string> = {
  strategic_ally: '24h',
  key_player:     '48h',
  keep_satisfied: '7d',
  keep_informed:  '14d',
  monitor:        '30d',
};

export const ENGAGEMENT_LEVEL_LABELS: Record<EngagementLevel, string> = {
  unaware:    'Unaware',
  resistant:  'Resistant',
  neutral:    'Neutral',
  supportive: 'Supportive',
  leading:    'Leading champion',
};

export const TYPE_LABELS: Record<StakeholderType, string> = {
  community_leader:   'Community leader',
  municipality:       'Municipality',
  traditional_authority: 'Traditional authority',
  regulator:          'Regulator',
  funder:             'Funder / DFI',
  offtaker:           'Offtaker',
  contractor:         'Contractor',
  consultant:         'Consultant',
  ngo:                'NGO',
  government_dept:    'Government dept',
  media:              'Media',
  internal:           'Internal',
};
