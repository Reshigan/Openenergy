// ═══════════════════════════════════════════════════════════════════════════
// Wave 17 — Carbon credit retirement chain spec.
//
// Pure functions. 7-state machine for compliance-grade carbon credit
// retirement, layered on top of carbon_retirements:
//
//   requested → validating → adjustment_pending → adjusted → retired
//                     │              │
//                     └─→ rejected ──┘
//                     │
//                     └─→ cancelled (operator-initiated abort)
//
// Per-scope SLA windows:
//   • article6     (corresponding adjustment required) — 24h per stage
//   • compliance   (CER/VCS issued, regulated buyer)   — 72h per stage
//   • voluntary    (voluntary market retirement)       — 168h per stage
//
// Imported by:
//   - tests/retirement-chain-spec.test.ts
//   - src/routes/carbon-retirement-chain.ts
// ═══════════════════════════════════════════════════════════════════════════

export type RetirementStatus =
  | 'requested'
  | 'validating'
  | 'adjustment_pending'
  | 'adjusted'
  | 'retired'
  | 'rejected'
  | 'cancelled';

export type RetirementAction =
  | 'begin_validation'      // requested → validating
  | 'mark_adjustment_pending' // validating → adjustment_pending
  | 'mark_adjusted'         // adjustment_pending → adjusted
  | 'finalize'              // adjusted → retired
  | 'reject'                // {validating | adjustment_pending} → rejected
  | 'cancel';               // any non-terminal → cancelled

export type RetirementScope = 'article6' | 'compliance' | 'voluntary';

export const ALL_STATES: readonly RetirementStatus[] = [
  'requested', 'validating', 'adjustment_pending', 'adjusted',
  'retired', 'rejected', 'cancelled',
];

export const TERMINAL_STATES: readonly RetirementStatus[] = [
  'retired', 'rejected', 'cancelled',
];

export function isTerminal(s: RetirementStatus): boolean {
  return TERMINAL_STATES.includes(s);
}

export const TRANSITIONS: Record<RetirementStatus, Partial<Record<RetirementAction, RetirementStatus>>> = {
  requested:          { begin_validation: 'validating',                cancel: 'cancelled' },
  validating:         { mark_adjustment_pending: 'adjustment_pending', reject: 'rejected', cancel: 'cancelled' },
  adjustment_pending: { mark_adjusted: 'adjusted',                     reject: 'rejected', cancel: 'cancelled' },
  adjusted:           { finalize: 'retired',                           cancel: 'cancelled' },
  retired:            {},
  rejected:           {},
  cancelled:          {},
};

/**
 * Per-stage SLA minutes by scope. The article6 path is tight because
 * UNFCCC corresponding-adjustment registries enforce settlement windows.
 */
export const SLA_MINUTES: Record<RetirementStatus, Record<RetirementScope, number>> = {
  requested:          { article6: 240,   compliance: 720,  voluntary: 1440 },  // 4h / 12h / 24h
  validating:         { article6: 1440,  compliance: 4320, voluntary: 10080 }, // 24h / 72h / 168h
  adjustment_pending: { article6: 1440,  compliance: 4320, voluntary: 10080 },
  adjusted:           { article6: 720,   compliance: 1440, voluntary: 4320 },  // 12h / 24h / 72h
  retired:            { article6: 0, compliance: 0, voluntary: 0 },
  rejected:           { article6: 0, compliance: 0, voluntary: 0 },
  cancelled:          { article6: 0, compliance: 0, voluntary: 0 },
};

export function nextState(curr: RetirementStatus, action: RetirementAction): RetirementStatus | null {
  return TRANSITIONS[curr]?.[action] ?? null;
}

export function advance(curr: RetirementStatus, action: RetirementAction): RetirementStatus {
  const next = nextState(curr, action);
  if (!next) {
    throw new Error(`Invalid transition: ${curr} --${action}--> ?`);
  }
  return next;
}

export function slaDueAt(
  state: RetirementStatus,
  scope: RetirementScope,
  now: Date = new Date(),
): string {
  const mins = SLA_MINUTES[state]?.[scope] ?? 0;
  if (mins === 0) return '';
  return new Date(now.getTime() + mins * 60 * 1000).toISOString();
}

/**
 * Which transitions cross into regulator scope? article6 always, compliance
 * on rejection/finalize; voluntary stays operational.
 */
export function crossesIntoRegulator(action: RetirementAction, scope: RetirementScope): boolean {
  if (scope === 'article6') return action === 'finalize' || action === 'reject';
  if (scope === 'compliance') return action === 'reject';
  return false;
}

/**
 * SLA breach crossing — article6 and compliance both visible to regulator
 * on breach; voluntary is operational-only.
 */
export function slaBreachCrossesIntoRegulator(scope: RetirementScope): boolean {
  return scope === 'article6' || scope === 'compliance';
}

export function isScope(s: string): s is RetirementScope {
  return s === 'article6' || s === 'compliance' || s === 'voluntary';
}

export function isStatus(s: string): s is RetirementStatus {
  return ALL_STATES.includes(s as RetirementStatus);
}
