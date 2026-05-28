// ═══════════════════════════════════════════════════════════════════════════
// Wave 52 — Trader Market Abuse Surveillance & STOR (Suspicious Transaction /
// Order Reporting) chain (pure spec).
//
// Financial Markets Act 19 of 2012 Chapter X (ss.78-82 prohibited trading
// practices: insider trading, price manipulation, false/misleading reporting)
// + the FSCA market-abuse / market-conduct regime + STOR obligations. 12-state
// P6 lifecycle for every surveillance ALERT the exchange's market-surveillance
// function raises against the order/trade flow: an alert is triaged, formally
// investigated, the evidence reviewed, and the case either CLEARED or escalated
// — a Suspicious Transaction & Order Report (STOR) filed to the FSCA, referred
// for enforcement, and sanctioned.
//
// This is the SURVEILLANCE complement to the desk's own obligation chains:
// W2 VaR (risk), W9 MM compliance (quoting), W29 position limits (quantity),
// W36 best-execution (quality), W44 trade-reporting (post-trade reporting).
// W52 governs whether the conduct ITSELF was abusive — the exchange watching
// the market and reporting abuse to the supervisor.
//
// Forward (happy / clean) path:
//   alert_raised → triaged → under_investigation → evidence_review →
//   analysis_complete → cleared
//
// Escalation (abuse-found) path:
//   analysis_complete → stor_filed → regulator_referred →
//   enforcement_action → sanctioned
//
// Early exit:
//   dismiss (from alert_raised | triaged) → cleared
//   (false-positive / noise alert closed without a full investigation; SHARES
//   the `cleared` terminal with a formal post-analysis clearance.)
//
// Dispute branch:
//   raise_dispute (from analysis_complete | stor_filed | regulator_referred |
//   enforcement_action) → disputed → resolve_dispute → dispute_resolved
//
// Terminals: cleared, sanctioned, dispute_resolved
//
// Abuse typology severity tiers (suspected-conduct gravity, lowest → highest):
//   info_alert      — informational / housekeeping flag
//   low_risk        — minor anomaly, likely benign
//   medium_risk     — material anomaly warranting investigation
//   high_risk       — probable abusive conduct
//   critical_abuse  — egregious manipulation / insider dealing
//
// URGENT SLA matrix — the MORE SEVERE the typology, the TIGHTER the window
// (market-integrity protection): critical_abuse must triage in 2h; the
// dispute phase is flat across tiers (back-office).
//
// Reportability (FSCA market-abuse supervisor inbox crossings):
//   - file_stor crosses for EVERY tier — a STOR is, by definition, a filing to
//     the FSCA; the filing action IS the regulator crossing (the W52 signature,
//     a universal hard line).
//   - sanction crosses for CRITICAL tiers (high_risk + critical_abuse).
//   - sla_breached crosses for CRITICAL tiers only — an overdue surveillance
//     case on serious suspected abuse is itself a market-integrity concern.
//
// Single-party write — the trader is the SUBJECT of the case and cannot action
// their own surveillance file. WRITE = {admin (surveillance fn), regulator};
// the desk has READ only. Each transition is tagged with the post-event party
// (surveillance / regulator / subject) via actor_party derived from the action
// (audit attribution only, not access control).
// ═══════════════════════════════════════════════════════════════════════════

export type MarketAbuseStatus =
  | 'alert_raised'
  | 'triaged'
  | 'under_investigation'
  | 'evidence_review'
  | 'analysis_complete'
  | 'cleared'
  | 'stor_filed'
  | 'regulator_referred'
  | 'enforcement_action'
  | 'sanctioned'
  | 'disputed'
  | 'dispute_resolved';

export type MarketAbuseAction =
  | 'triage'
  | 'open_investigation'
  | 'compile_evidence'
  | 'complete_analysis'
  | 'clear'
  | 'dismiss'
  | 'file_stor'
  | 'refer_regulator'
  | 'commence_enforcement'
  | 'sanction'
  | 'raise_dispute'
  | 'resolve_dispute';

export type AbuseTier =
  | 'info_alert'
  | 'low_risk'
  | 'medium_risk'
  | 'high_risk'
  | 'critical_abuse';

export type MarketAbuseParty = 'surveillance' | 'regulator' | 'subject';

interface TransitionRule {
  from: MarketAbuseStatus[];
  to: MarketAbuseStatus;
}

export const TRANSITIONS: Record<MarketAbuseAction, TransitionRule> = {
  triage:               { from: ['alert_raised'], to: 'triaged' },
  open_investigation:   { from: ['triaged'], to: 'under_investigation' },
  compile_evidence:     { from: ['under_investigation'], to: 'evidence_review' },
  complete_analysis:    { from: ['evidence_review'], to: 'analysis_complete' },
  clear:                { from: ['analysis_complete'], to: 'cleared' },
  dismiss:              { from: ['alert_raised', 'triaged'], to: 'cleared' },
  file_stor:            { from: ['analysis_complete'], to: 'stor_filed' },
  refer_regulator:      { from: ['stor_filed'], to: 'regulator_referred' },
  commence_enforcement: { from: ['regulator_referred'], to: 'enforcement_action' },
  sanction:             { from: ['enforcement_action'], to: 'sanctioned' },
  raise_dispute:        { from: ['analysis_complete', 'stor_filed', 'regulator_referred', 'enforcement_action'], to: 'disputed' },
  resolve_dispute:      { from: ['disputed'], to: 'dispute_resolved' },
};

const TERMINALS = new Set<MarketAbuseStatus>(['cleared', 'sanctioned', 'dispute_resolved']);

// Early-exit (dismiss as a false-positive) is available before a formal
// investigation has been opened.
const DISMISSABLE = new Set<MarketAbuseStatus>(['alert_raised', 'triaged']);

export function isTerminal(s: MarketAbuseStatus): boolean {
  return TERMINALS.has(s);
}

export function isDismissable(s: MarketAbuseStatus): boolean {
  return DISMISSABLE.has(s);
}

export function nextStatus(
  current: MarketAbuseStatus,
  action: MarketAbuseAction,
): MarketAbuseStatus | null {
  const rule = TRANSITIONS[action];
  if (!rule) return null;
  if (isTerminal(current)) return null;
  return rule.from.includes(current) ? rule.to : null;
}

export function allowedActions(
  current: MarketAbuseStatus,
): MarketAbuseAction[] {
  if (isTerminal(current)) return [];
  return (Object.keys(TRANSITIONS) as MarketAbuseAction[]).filter((a) =>
    TRANSITIONS[a].from.includes(current),
  );
}

// URGENT SLA windows in minutes. The investigation phases are tier-graded —
// the more severe the suspected typology, the tighter the deadline. The
// dispute phase is flat across tiers (back-office adjudication).
export const SLA_MINUTES: Record<MarketAbuseStatus, Record<AbuseTier, number>> = {
  alert_raised: {
    info_alert: 1440, low_risk: 720, medium_risk: 480, high_risk: 240, critical_abuse: 120,
  },
  triaged: {
    info_alert: 2880, low_risk: 1440, medium_risk: 720, high_risk: 480, critical_abuse: 240,
  },
  under_investigation: {
    info_alert: 7200, low_risk: 4320, medium_risk: 2880, high_risk: 1440, critical_abuse: 720,
  },
  evidence_review: {
    info_alert: 4320, low_risk: 2880, medium_risk: 1440, high_risk: 720, critical_abuse: 480,
  },
  analysis_complete: {
    info_alert: 2880, low_risk: 1440, medium_risk: 720, high_risk: 480, critical_abuse: 240,
  },
  stor_filed: {
    info_alert: 4320, low_risk: 2880, medium_risk: 1440, high_risk: 720, critical_abuse: 480,
  },
  regulator_referred: {
    info_alert: 7200, low_risk: 5760, medium_risk: 4320, high_risk: 2880, critical_abuse: 1440,
  },
  enforcement_action: {
    info_alert: 10080, low_risk: 7200, medium_risk: 5760, high_risk: 4320, critical_abuse: 2880,
  },
  disputed: {
    info_alert: 4320, low_risk: 4320, medium_risk: 4320, high_risk: 4320, critical_abuse: 4320,
  },
  cleared:          { info_alert: 0, low_risk: 0, medium_risk: 0, high_risk: 0, critical_abuse: 0 },
  sanctioned:       { info_alert: 0, low_risk: 0, medium_risk: 0, high_risk: 0, critical_abuse: 0 },
  dispute_resolved: { info_alert: 0, low_risk: 0, medium_risk: 0, high_risk: 0, critical_abuse: 0 },
};

export function slaWindowMinutes(
  state: MarketAbuseStatus,
  tier: AbuseTier,
): number {
  return SLA_MINUTES[state]?.[tier] ?? 0;
}

export function slaDeadlineFor(
  state: MarketAbuseStatus,
  tier: AbuseTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = slaWindowMinutes(state, tier);
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// Serious tiers: typologies grave enough to warrant a formal investigation
// outcome being escalated.
const SERIOUS_TIERS = new Set<AbuseTier>([
  'medium_risk', 'high_risk', 'critical_abuse',
]);

// Critical tiers: probable / egregious abuse — the tightest market-integrity line.
const CRITICAL_TIERS = new Set<AbuseTier>([
  'high_risk', 'critical_abuse',
]);

export function isSeriousTier(tier: AbuseTier): boolean {
  return SERIOUS_TIERS.has(tier);
}

export function isCriticalTier(tier: AbuseTier): boolean {
  return CRITICAL_TIERS.has(tier);
}

// file_stor crosses for EVERY tier — a Suspicious Transaction & Order Report is
// by definition a filing to the FSCA, so the filing action itself is the
// regulator crossing (the W52 signature). sanction crosses for critical tiers.
export function crossesIntoRegulator(
  action: MarketAbuseAction,
  tier: AbuseTier,
): boolean {
  if (action === 'file_stor') return true;
  if (action === 'sanction') return isCriticalTier(tier);
  return false;
}

// sla_breached crosses for critical tiers only — an overdue surveillance case on
// probable/egregious abuse is itself a reportable market-integrity concern.
export function slaBreachCrossesIntoRegulator(tier: AbuseTier): boolean {
  return isCriticalTier(tier);
}

// Row-level "serious abuse" flag (drives the reportable dot).
export function isReportable(tier: AbuseTier): boolean {
  return isCriticalTier(tier);
}

export const ACTION_PARTY: Record<MarketAbuseAction, MarketAbuseParty> = {
  triage:               'surveillance',
  open_investigation:   'surveillance',
  compile_evidence:     'surveillance',
  complete_analysis:    'surveillance',
  clear:                'surveillance',
  dismiss:              'surveillance',
  file_stor:            'surveillance',
  refer_regulator:      'regulator',
  commence_enforcement: 'regulator',
  sanction:             'regulator',
  resolve_dispute:      'regulator',
  raise_dispute:        'subject',
};

export function partyForAction(action: MarketAbuseAction): MarketAbuseParty {
  return ACTION_PARTY[action];
}

export function isRegulatorAction(action: MarketAbuseAction): boolean {
  return ACTION_PARTY[action] === 'regulator';
}

// Classify a suspected-abuse case by its surveillance risk score (0-100).
export function tierForRiskScore(score: number): AbuseTier {
  if (score < 20) return 'info_alert';
  if (score < 40) return 'low_risk';
  if (score < 60) return 'medium_risk';
  if (score < 85) return 'high_risk';
  return 'critical_abuse';
}
