// ═══════════════════════════════════════════════════════════════════════════
// Wave 60 — Trader Algorithmic / DEA Trading-System Certification & Kill-Switch
// Governance chain (pure spec).
//
// Financial Markets Act 19 of 2012 + FSCA Conduct Standards for automated
// trading + the JSE algorithmic-trading / Direct Electronic Access (DEA/DMA)
// rules + the MiFID II RTS 6 analogue (organisational requirements for firms
// engaged in algorithmic trading: pre-deployment conformance testing,
// pre-trade risk controls, a mandatory kill-switch, and periodic
// recertification). 12-state P6 lifecycle for every automated / DEA trading
// SYSTEM the desk wants to run: a system is registered, its documentation
// reviewed, it passes exchange conformance testing, its pre-trade risk
// controls (kill-switch, throttles, price collars, max order size/value, max
// message rate) are validated, a certification committee approves it, the firm
// DEPLOYS it live, and thereafter it is periodically recertified — with an
// emergency kill-switch / suspension path always available on a live system.
//
// This is the PRE-DEPLOYMENT GOVERNANCE GATE upstream of every other Trader
// chain: an algo cannot quote (W9 MM compliance), build positions (W29 limits),
// execute (W36 best-execution) or be reported (W44 trade-reporting) until it is
// certified here, and once live it is watched by W52 surveillance. W60 is what
// lets an automated system go live and KEEPS it within its authorised envelope.
//
// Forward (happy / go-live) path:
//   registration_submitted → documentation_review → conformance_testing →
//   risk_controls_validation → certification_review → certified → deployed
//
// Recertification loop (periodic / material-change re-review):
//   deployed → recertification_review → deployed
//
// Emergency kill-switch / suspension path (always available on a live system):
//   deployed → suspended → deployed (reinstate)  |  suspended → decommissioned
//
// Remediation loop (a failed gate sends the system back to documentation):
//   {documentation_review | conformance_testing | risk_controls_validation |
//    certification_review | recertification_review} → remediation_required →
//   documentation_review (resubmit)
//
// Terminals:
//   rejected        — certification refused (from documentation_review |
//                     certification_review | recertification_review)
//   decommissioned  — system retired/withdrawn (from certified | deployed |
//                     suspended | remediation_required)
//
// Authorised-footprint tiers (max order/daily notional the system may transmit,
// ZAR millions, lowest → highest):
//   limited      — sandbox / very small authorised notional
//   standard     — routine desk algo
//   significant  — material authorised footprint
//   high_impact  — large authorised footprint
//   systemic     — systemically significant automated/DEA system
//
// INVERTED SLA matrix — the LARGER the authorised footprint, the LONGER every
// certification/review window (deeper conformance + risk-control testing for
// bigger systems), consistent with the front-end gates W49/W53/W58. EXCEPT the
// `suspended` state has a FLAT, TIGHT window across all tiers — a suspended
// LIVE system is an incident that must be reinstated or decommissioned fast
// regardless of size (mirrors W59's flat deferral phase).
//
// Reportability (FSCA / exchange automated-trading supervisor inbox crossings):
//   - invoke_kill_switch crosses for EVERY tier — a kill-switch invocation /
//     emergency halt of a live automated trading system is, by exchange + RTS-6
//     rules, a notifiable market event; the emergency-stop action IS the
//     regulator crossing (the W60 signature — a universal hard line, like W52
//     file_stor and W54 forfeit).
//   - reject_certification crosses for HIGH tiers (high_impact + systemic) — a
//     refused certification of a significant automated system is reportable.
//   - sla_breached crosses for HIGH tiers only.
//
// Two-party split write — the trading FIRM owns the system-lifecycle endpoints
// (submit_certification, deploy, resubmit, decommission) and may always hit the
// emergency kill-switch; the exchange/certification AUTHORITY owns the gating
// machinery (review, conformance, controls validation, certify, recertify,
// reinstate, remediation, reject). actor_party (trading_firm / exchange_authority)
// records the post-event function per step (audit attribution only).
// ═══════════════════════════════════════════════════════════════════════════

export type AlgoCertStatus =
  | 'registration_submitted'
  | 'documentation_review'
  | 'conformance_testing'
  | 'risk_controls_validation'
  | 'certification_review'
  | 'certified'
  | 'deployed'
  | 'recertification_review'
  | 'suspended'
  | 'remediation_required'
  | 'rejected'
  | 'decommissioned';

export type AlgoCertAction =
  | 'begin_review'
  | 'start_conformance'
  | 'validate_controls'
  | 'submit_certification'
  | 'grant_certification'
  | 'deploy'
  | 'trigger_recertification'
  | 'complete_recertification'
  | 'invoke_kill_switch'
  | 'reinstate'
  | 'require_remediation'
  | 'resubmit'
  | 'reject_certification'
  | 'decommission';

export type AlgoTier =
  | 'limited'
  | 'standard'
  | 'significant'
  | 'high_impact'
  | 'systemic';

export type AlgoCertParty = 'trading_firm' | 'exchange_authority';

interface TransitionRule {
  from: AlgoCertStatus[];
  to: AlgoCertStatus;
}

export const TRANSITIONS: Record<AlgoCertAction, TransitionRule> = {
  begin_review:            { from: ['registration_submitted'], to: 'documentation_review' },
  start_conformance:       { from: ['documentation_review'], to: 'conformance_testing' },
  validate_controls:       { from: ['conformance_testing'], to: 'risk_controls_validation' },
  submit_certification:    { from: ['risk_controls_validation'], to: 'certification_review' },
  grant_certification:     { from: ['certification_review'], to: 'certified' },
  deploy:                  { from: ['certified'], to: 'deployed' },
  trigger_recertification: { from: ['deployed'], to: 'recertification_review' },
  complete_recertification:{ from: ['recertification_review'], to: 'deployed' },
  invoke_kill_switch:      { from: ['deployed'], to: 'suspended' },
  reinstate:               { from: ['suspended'], to: 'deployed' },
  require_remediation:     {
    from: ['documentation_review', 'conformance_testing', 'risk_controls_validation', 'certification_review', 'recertification_review'],
    to: 'remediation_required',
  },
  resubmit:                { from: ['remediation_required'], to: 'documentation_review' },
  reject_certification:    {
    from: ['documentation_review', 'certification_review', 'recertification_review'],
    to: 'rejected',
  },
  decommission:            {
    from: ['certified', 'deployed', 'suspended', 'remediation_required'],
    to: 'decommissioned',
  },
};

const TERMINALS = new Set<AlgoCertStatus>(['rejected', 'decommissioned']);

export function isTerminal(s: AlgoCertStatus): boolean {
  return TERMINALS.has(s);
}

export function nextStatus(
  current: AlgoCertStatus,
  action: AlgoCertAction,
): AlgoCertStatus | null {
  const rule = TRANSITIONS[action];
  if (!rule) return null;
  if (isTerminal(current)) return null;
  return rule.from.includes(current) ? rule.to : null;
}

export function allowedActions(current: AlgoCertStatus): AlgoCertAction[] {
  if (isTerminal(current)) return [];
  return (Object.keys(TRANSITIONS) as AlgoCertAction[]).filter((a) =>
    TRANSITIONS[a].from.includes(current),
  );
}

// INVERTED SLA windows in minutes — the LARGER the authorised footprint, the
// LONGER each certification/review window (deeper testing for bigger systems).
// `suspended` is FLAT and tight across tiers (a live system halted by its
// kill-switch is an incident). `deployed` and the terminals carry no deadline.
export const SLA_MINUTES: Record<AlgoCertStatus, Record<AlgoTier, number>> = {
  registration_submitted: {
    limited: 1440, standard: 2880, significant: 4320, high_impact: 5760, systemic: 7200,
  },
  documentation_review: {
    limited: 2880, standard: 4320, significant: 5760, high_impact: 8640, systemic: 11520,
  },
  conformance_testing: {
    limited: 4320, standard: 5760, significant: 8640, high_impact: 11520, systemic: 14400,
  },
  risk_controls_validation: {
    limited: 2880, standard: 4320, significant: 5760, high_impact: 8640, systemic: 11520,
  },
  certification_review: {
    limited: 1440, standard: 2880, significant: 4320, high_impact: 5760, systemic: 7200,
  },
  certified: {
    limited: 4320, standard: 5760, significant: 7200, high_impact: 8640, systemic: 10080,
  },
  deployed: {
    limited: 0, standard: 0, significant: 0, high_impact: 0, systemic: 0,
  },
  recertification_review: {
    limited: 2880, standard: 4320, significant: 5760, high_impact: 8640, systemic: 11520,
  },
  suspended: {
    limited: 720, standard: 720, significant: 720, high_impact: 720, systemic: 720,
  },
  remediation_required: {
    limited: 7200, standard: 10080, significant: 14400, high_impact: 20160, systemic: 28800,
  },
  rejected:       { limited: 0, standard: 0, significant: 0, high_impact: 0, systemic: 0 },
  decommissioned: { limited: 0, standard: 0, significant: 0, high_impact: 0, systemic: 0 },
};

export function slaWindowMinutes(state: AlgoCertStatus, tier: AlgoTier): number {
  return SLA_MINUTES[state]?.[tier] ?? 0;
}

export function slaDeadlineFor(
  state: AlgoCertStatus,
  tier: AlgoTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = slaWindowMinutes(state, tier);
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// High tiers — large/systemic authorised footprint; the reportable line.
const HIGH_TIERS = new Set<AlgoTier>(['high_impact', 'systemic']);

export function isHighTier(tier: AlgoTier): boolean {
  return HIGH_TIERS.has(tier);
}

// invoke_kill_switch crosses for EVERY tier — an emergency halt of a live
// automated trading system is a notifiable market event, so the action itself
// is the regulator crossing (the W60 signature). reject_certification crosses
// for high tiers.
export function crossesIntoRegulator(action: AlgoCertAction, tier: AlgoTier): boolean {
  if (action === 'invoke_kill_switch') return true;
  if (action === 'reject_certification') return isHighTier(tier);
  return false;
}

// sla_breached crosses for high tiers only — an overdue certification/review
// gate on a large/systemic automated system is itself a supervisory concern.
export function slaBreachCrossesIntoRegulator(tier: AlgoTier): boolean {
  return isHighTier(tier);
}

// Row-level reportable flag (drives the reportable dot).
export function isReportable(tier: AlgoTier): boolean {
  return isHighTier(tier);
}

export const ACTION_PARTY: Record<AlgoCertAction, AlgoCertParty> = {
  begin_review:             'exchange_authority',
  start_conformance:        'exchange_authority',
  validate_controls:        'exchange_authority',
  submit_certification:     'trading_firm',
  grant_certification:      'exchange_authority',
  deploy:                   'trading_firm',
  trigger_recertification:  'exchange_authority',
  complete_recertification: 'exchange_authority',
  invoke_kill_switch:       'trading_firm',
  reinstate:                'exchange_authority',
  require_remediation:      'exchange_authority',
  resubmit:                 'trading_firm',
  reject_certification:     'exchange_authority',
  decommission:             'trading_firm',
};

export function partyForAction(action: AlgoCertAction): AlgoCertParty {
  return ACTION_PARTY[action];
}

// Actions the trading FIRM drives (system-lifecycle endpoints). The emergency
// kill-switch is NOT listed here because either party may hit it (handled in
// the route as a no-extra-gate action for any write role).
export function isFirmAction(action: AlgoCertAction): boolean {
  return ACTION_PARTY[action] === 'trading_firm' && action !== 'invoke_kill_switch';
}

export function isAuthorityAction(action: AlgoCertAction): boolean {
  return ACTION_PARTY[action] === 'exchange_authority';
}

// Classify an automated/DEA trading system by its authorised notional footprint
// (max order/daily notional it may transmit, ZAR millions).
export function tierForNotionalZarM(notionalZarM: number): AlgoTier {
  if (notionalZarM < 10) return 'limited';
  if (notionalZarM < 50) return 'standard';
  if (notionalZarM < 250) return 'significant';
  if (notionalZarM < 1000) return 'high_impact';
  return 'systemic';
}
