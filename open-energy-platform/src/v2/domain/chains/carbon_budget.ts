// carbon_budget — a company carbon-budget allocation & compliance cycle as data.
//
// (docs/architecture/REBUILD_FUNCTIONAL_FLOOR.md: `carbon-budget`, Transaction.)
// The regulator (DFFE/NERSA) allocates an emitter a carbon budget — an emissions
// allowance in tCO₂e over a commitment period. The emitter runs the period, then
// submits an emissions reconciliation; the regulator verifies actual against the
// allocation. Whether the budget was breached is DERIVED purely from actual vs
// allocated at verification — never a client-supplied verdict.
//
// The compliance spine is structural, not a guard: `verify` leaves ONLY
// reconciliation_submitted, and the ONLY path into reconciliation_submitted is
// submit_reconciliation. So a budget can NEVER be verified before actual
// emissions are declared — the same isolation-gate shape as permit_to_work.
//
// NO claim key. A carbon budget is a periodic allowance re-allocated each
// commitment period, not a permanent one-time consumption of a serial (that is
// carbon_retirement's job). A claim would wrongly block the installation forever.
//
// settles:false — a budget allocation is a regulatory compliance control, never a
// payment. The tax that flows off a breach settles elsewhere (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure compliance determination off allocated vs actual. No clock, no env.
const compliance = (
  allocated: Json | undefined,
  actual: Json | undefined,
): { compliance_status: string; excess_tco2e: number; utilisation_pct: number } => {
  if (typeof allocated !== 'number' || typeof actual !== 'number' || allocated <= 0) {
    return { compliance_status: 'unassessed', excess_tco2e: 0, utilisation_pct: 0 };
  }
  const excess = actual > allocated ? actual - allocated : 0;
  return {
    compliance_status: actual > allocated ? 'exceeded' : 'within_budget',
    excess_tco2e: excess,
    utilisation_pct: Math.round((actual / allocated) * 1000) / 10,
  };
};

export const carbonBudget: ChainDecl = {
  key: 'carbon_budget',
  noun: 'Carbon budget',
  refPrefix: 'CB',
  title: (f) =>
    `Carbon budget — ${(f.installation_name as string) ?? 'unnamed installation'} (${(f.commitment_period as string) ?? 'period TBC'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Carbon Tax Act', provision: 's12 carbon budget allowance', effect: 'authorises' },
    { instrument: 'Climate Change Act', provision: 'carbon budgets & GHG reporting', effect: 'requires' },
  ],
  roles: ['emitter', 'regulator', 'operator'],

  fields: {
    budget_ref: { type: 'string', label: 'Budget ref' },
    emitter_party: { type: 'party', role: 'emitter', label: 'Emitter' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    installation_name: { type: 'string', required: true, label: 'Installation' },
    sector: { type: 'string', label: 'Sector' },
    commitment_period: { type: 'string', required: true, label: 'Commitment period' },
    allocated_tco2e: { type: 'number', min: 0, label: 'Allocated budget (tCO₂e)' },
    actual_emissions_tco2e: { type: 'number', min: 0, label: 'Actual emissions (tCO₂e)' },
    // written by derive, never by the client
    excess_tco2e: { type: 'number', label: 'Excess over budget (tCO₂e)' },
    compliance_status: { type: 'string', label: 'Compliance status' },
    utilisation_pct: { type: 'number', label: 'Utilisation (%)' },
    allocated_at: { type: 'string', label: 'Allocated at' },
    reconciled_at: { type: 'string', label: 'Reconciliation submitted at' },
    verified_at: { type: 'string', label: 'Verified at' },
    closed_at_cb: { type: 'string', label: 'Budget closed at' },
  },

  initial: 'proposed',

  states: {
    proposed: { label: 'Proposed', terminal: false, holder: 'regulator', sla: { hours: 72 } },
    allocated: { label: 'Allocated', terminal: false, holder: 'emitter', sla: { days: 14 } },
    monitoring: { label: 'Monitoring period', terminal: false, holder: 'emitter', sla: { days: 30 } },
    reconciliation_submitted: { label: 'Reconciliation submitted', terminal: false, holder: 'regulator', sla: { hours: 72 } },
    verified: { label: 'Verified', terminal: false, holder: 'regulator', sla: { hours: 48 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    revoked: { label: 'Revoked', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'proposed',
      by: ['emitter', 'operator'],
      actorBecomes: 'emitter',
      label: 'Propose carbon budget',
      intent: 'primary',
      input: {
        installation_name: { type: 'string', required: true },
        sector: { type: 'string' },
        commitment_period: { type: 'string', required: true },
        budget_ref: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'allocate_budget',
      from: 'proposed',
      to: 'allocated',
      by: ['regulator'],
      label: 'Allocate budget',
      intent: 'primary',
      input: { allocated_tco2e: { type: 'number', required: true, min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ allocated_at: isoUtc(at) }),
    },
    {
      id: 'commence_period',
      from: 'allocated',
      to: 'monitoring',
      by: ['emitter', 'regulator'],
      label: 'Commence monitoring period',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_reconciliation',
      from: 'monitoring',
      to: 'reconciliation_submitted',
      by: ['emitter'],
      label: 'Submit emissions reconciliation',
      intent: 'primary',
      input: { actual_emissions_tco2e: { type: 'number', required: true, min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ reconciled_at: isoUtc(at) }),
    },
    {
      // structural compliance gate: the ONLY edge into verified, and it can only
      // fire from reconciliation_submitted — which only submit_reconciliation
      // reaches. A budget therefore cannot be verified before actual emissions
      // are declared. The breach verdict is derived, never supplied. No guard.
      id: 'verify',
      from: 'reconciliation_submitted',
      to: 'verified',
      by: ['regulator'],
      label: 'Verify against budget',
      intent: 'primary',
      guards: [],
      derive: (f, at: Instant) => ({
        ...compliance(f.allocated_tco2e, f.actual_emissions_tco2e),
        verified_at: isoUtc(at),
      }),
    },
    {
      id: 'close_budget',
      from: 'verified',
      to: 'closed',
      by: ['regulator'],
      label: 'Close budget',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_cb: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_proposal',
      from: 'proposed',
      to: 'rejected',
      by: ['regulator'],
      label: 'Reject proposal',
      intent: 'destructive',
      requiresReason: ['ineligible_installation', 'incomplete_submission', 'sector_not_covered', 'duplicate_allocation'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['proposed', 'allocated'],
      to: 'withdrawn',
      by: ['emitter'],
      label: 'Withdraw',
      intent: 'destructive',
      requiresReason: ['installation_decommissioned', 'restructured', 'no_longer_required'],
      guards: [],
    },
    {
      id: 'revoke_budget',
      from: ['allocated', 'monitoring', 'reconciliation_submitted'],
      to: 'revoked',
      by: ['regulator'],
      label: 'Revoke budget',
      intent: 'destructive',
      requiresReason: ['reporting_default', 'misrepresentation', 'licence_withdrawn', 'regulatory_directive'],
      guards: [],
    },
  ],

  // monitoring-period reporting time-bar: a period left un-reconciled past its
  // reporting deadline is a compliance default and the allocation is revoked.
  // record-only stub; the sweep computes the real bar off state sla days.
  timers: [{ onState: 'monitoring', after: { days: 0 }, fire: 'revoke_budget', kind: 'time_bar' }],
};
