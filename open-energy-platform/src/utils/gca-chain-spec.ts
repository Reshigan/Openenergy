// ─────────────────────────────────────────────────────────────────────────
// Wave 28 — Grid Connection Agreement (GCA) chain (P6) — NERSA Grid Code C-1
//
// 10-state lifecycle for the Use of Network and Generation Connection Agreement
// (UNGCA) every IPP must execute with Eskom Transmission / Holdings before
// COD (referenced in W20 COD chain `energisation_certificate_issued` gate).
//
//   application_filed → studies_required → studies_executing →
//   cost_estimate_issued → cost_accepted → connection_agreement_drafted →
//   executed → construction → energised → in_service
//
// Terminals: rejected (Eskom denies on stability/load grounds),
//            withdrawn (IPP withdraws).
//
// Tiers (drive SLA + regulator reportability):
//   transmission  — >132kV interconnection, ≥75MW utility-scale (NERSA C-1)
//   distribution  — 33–132kV, mid-scale 5–75MW
//   embedded      — <33kV SSEG, <5MW
//
// SLA matrix is INVERTED — larger tier gets MORE time for technical studies +
// construction (multi-year). Transmission-tier transitions on executed /
// energised / rejected cross into regulator inbox (NERSA C-1 reportable);
// distribution tier crosses on rejected only; embedded never crosses.
// ─────────────────────────────────────────────────────────────────────────

export type GcaStatus =
  | 'application_filed'
  | 'studies_required'
  | 'studies_executing'
  | 'cost_estimate_issued'
  | 'cost_accepted'
  | 'connection_agreement_drafted'
  | 'executed'
  | 'construction'
  | 'energised'
  | 'in_service'
  | 'rejected'
  | 'withdrawn';

export type GcaAction =
  | 'request_studies'
  | 'begin_studies'
  | 'issue_cost_estimate'
  | 'accept_cost'
  | 'draft_agreement'
  | 'execute_agreement'
  | 'begin_construction'
  | 'energise'
  | 'commission'
  | 'reject'
  | 'withdraw';

export type GcaTier = 'transmission' | 'distribution' | 'embedded';

export type GcaEvent =
  | 'gca.application_filed'
  | 'gca.studies_required'
  | 'gca.studies_executing'
  | 'gca.cost_estimate_issued'
  | 'gca.cost_accepted'
  | 'gca.connection_agreement_drafted'
  | 'gca.executed'
  | 'gca.construction'
  | 'gca.energised'
  | 'gca.in_service'
  | 'gca.rejected'
  | 'gca.withdrawn'
  | 'gca.sla_breached';

const TERMINALS = new Set<GcaStatus>(['in_service', 'rejected', 'withdrawn']);

export function isTerminal(s: GcaStatus): boolean {
  return TERMINALS.has(s);
}

const TRANSITIONS: Record<GcaAction, { from: GcaStatus[]; to: GcaStatus }> = {
  request_studies:     { from: ['application_filed'],            to: 'studies_required' },
  begin_studies:       { from: ['studies_required'],             to: 'studies_executing' },
  issue_cost_estimate: { from: ['studies_executing'],            to: 'cost_estimate_issued' },
  accept_cost:         { from: ['cost_estimate_issued'],         to: 'cost_accepted' },
  draft_agreement:     { from: ['cost_accepted'],                to: 'connection_agreement_drafted' },
  execute_agreement:   { from: ['connection_agreement_drafted'], to: 'executed' },
  begin_construction:  { from: ['executed'],                     to: 'construction' },
  energise:            { from: ['construction'],                 to: 'energised' },
  commission:          { from: ['energised'],                    to: 'in_service' },
  reject: {
    from: [
      'application_filed', 'studies_required', 'studies_executing',
      'cost_estimate_issued',
    ],
    to: 'rejected',
  },
  withdraw: {
    from: [
      'application_filed', 'studies_required', 'studies_executing',
      'cost_estimate_issued', 'cost_accepted', 'connection_agreement_drafted',
    ],
    to: 'withdrawn',
  },
};

export function nextStatus(current: GcaStatus, action: GcaAction): GcaStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: GcaStatus): GcaAction[] {
  const acts: GcaAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [GcaAction, typeof TRANSITIONS[GcaAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const HOUR = 60;
const DAY = 24 * HOUR;

// INVERTED SLA matrix — transmission tier gets MORE time for technical studies
// (Eskom load-flow / fault-level / transient-stability assessments take months)
// and MUCH more time for construction (substation + transmission line build).
export const SLA_MINUTES: Record<GcaStatus, Record<GcaTier, number>> = {
  application_filed: {
    transmission:  30 * DAY,
    distribution:  21 * DAY,
    embedded:      14 * DAY,
  },
  studies_required: {
    transmission: 120 * DAY,
    distribution:  60 * DAY,
    embedded:      30 * DAY,
  },
  studies_executing: {
    transmission: 180 * DAY,    // multi-month GIA
    distribution:  90 * DAY,
    embedded:      45 * DAY,
  },
  cost_estimate_issued: {
    transmission:  60 * DAY,    // IPP review window
    distribution:  45 * DAY,
    embedded:      30 * DAY,
  },
  cost_accepted: {
    transmission:  90 * DAY,    // IPP financial commitment + bond
    distribution:  60 * DAY,
    embedded:      45 * DAY,
  },
  connection_agreement_drafted: {
    transmission:  30 * DAY,
    distribution:  21 * DAY,
    embedded:      14 * DAY,
  },
  executed: {
    transmission:  14 * DAY,    // mobilisation window
    distribution:   7 * DAY,
    embedded:       7 * DAY,
  },
  construction: {
    transmission: 730 * DAY,    // 24 months substation + line
    distribution: 365 * DAY,    // 12 months
    embedded:      90 * DAY,    // 3 months
  },
  energised: {
    transmission:  30 * DAY,    // commissioning window
    distribution:  21 * DAY,
    embedded:      14 * DAY,
  },
  in_service:  { transmission: 0, distribution: 0, embedded: 0 },
  rejected:    { transmission: 0, distribution: 0, embedded: 0 },
  withdrawn:   { transmission: 0, distribution: 0, embedded: 0 },
};

export function slaDeadlineFor(status: GcaStatus, tier: GcaTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Reportability matrix — NERSA Grid Code C-1 requires regulator notification
// for transmission-tier connection events (executed/energised/in_service/reject)
// and for any rejection at distribution tier (formal grid-impact reason).
// Embedded SSEG stays internal.
const REPORTABLE_TIERS = new Set<GcaTier>(['transmission']);
const REJECTION_REPORTABLE = new Set<GcaTier>(['transmission', 'distribution']);

export function isReportable(tier: GcaTier): boolean {
  return REPORTABLE_TIERS.has(tier);
}

export function crossesIntoRegulator(action: GcaAction, tier: GcaTier): boolean {
  if (action === 'reject') return REJECTION_REPORTABLE.has(tier);
  if (action === 'execute_agreement') return REPORTABLE_TIERS.has(tier);
  if (action === 'energise')          return REPORTABLE_TIERS.has(tier);
  if (action === 'commission')        return REPORTABLE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: GcaTier): boolean {
  return REJECTION_REPORTABLE.has(tier);
}
