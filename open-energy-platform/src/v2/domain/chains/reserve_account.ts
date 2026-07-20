// reserve_account — debt-service reserve account (DSRA) lifecycle as data.
//
// Project-finance safeguard: a borrower establishes a cash reserve against a
// facility; the lender approves it, the account is funded to a target balance,
// and it is monitored for the life of the loan. A drawdown / revaluation / FX
// move can push the funded balance below target — the lender flags a SHORTFALL,
// which the borrower CURES by topping up (cure is an edge, per the functional
// floor). An uncured shortfall is ENFORCED (swept / cross-defaulted). Once the
// facility is repaid the lender RELEASES the account back to the borrower.
//
// The core safety property is structural, not a guard: release_account leaves
// ONLY `funded`, and the only path out of `shortfall` back to `funded` is
// cure_shortfall. So an account carrying an uncured shortfall can NEVER be
// released — the graph forbids it, no guard needed. Likewise enforce_shortfall
// is reachable ONLY from `shortfall`.
//
// NO claim key: a reserve account is a monitored balance, not a one-shot
// consumption of a unique serial — nothing to double-spend.
//
// settles:false — the reserve is a credit control / covenant artefact, never a
// payment rail; the actual cash movement settles elsewhere (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure shortfall = how far below target the funded balance sits (never negative).
const shortfall = (target: Json | undefined, funded: Json | undefined): number => {
  const t = typeof target === 'number' ? target : 0;
  const f = typeof funded === 'number' ? funded : 0;
  const gap = t - f;
  return gap > 0 ? gap : 0;
};

export const reserveAccount: ChainDecl = {
  key: 'reserve_account',
  noun: 'Reserve account',
  refPrefix: 'RESE',
  title: (f) =>
    `DSRA — ${(f.facility_ref as string) ?? 'unlinked facility'} (${(f.currency as string) ?? 'ZAR'} ${(f.target_balance as number) ?? 0})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Common Terms Agreement', provision: 'debt-service reserve covenant', effect: 'requires' },
    { instrument: 'NCA 2005', provision: 's101 permissible charges / reserve mechanics', effect: 'restricts' },
  ],
  roles: ['borrower', 'lender', 'agent'],

  fields: {
    account_ref: { type: 'string', label: 'Reserve account ref' },
    facility_ref: { type: 'string', required: true, label: 'Facility ref' },
    currency: { type: 'string', label: 'Currency' },
    borrower_party: { type: 'party', role: 'borrower', label: 'Borrower' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender / facility agent' },
    agent_party: { type: 'party', role: 'agent', label: 'Account bank / agent' },
    target_balance: { type: 'number', min: 0, label: 'Target reserve balance' },
    funded_balance: { type: 'number', min: 0, label: 'Funded balance' },
    // written by derive, never by the client
    shortfall_amount: { type: 'number', label: 'Shortfall amount' },
    cure_count: { type: 'number', label: 'Times cured' },
    funded_at: { type: 'string', label: 'Funded at' },
    shortfall_flagged_at: { type: 'string', label: 'Shortfall flagged at' },
    cured_at: { type: 'string', label: 'Cured at' },
    released_at: { type: 'string', label: 'Released at' },
  },

  initial: 'establishment_requested',

  states: {
    establishment_requested: { label: 'Establishment requested', terminal: false, holder: 'lender', sla: { days: 5 } },
    funding: { label: 'Awaiting funding', terminal: false, holder: 'borrower', sla: { days: 10 } },
    funded: { label: 'Funded', terminal: false, holder: 'agent' },
    shortfall: { label: 'In shortfall', terminal: false, holder: 'borrower', sla: { days: 5 } },
    released: { label: 'Released', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    enforced: { label: 'Enforced', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'establishment_requested',
      by: ['borrower'],
      actorBecomes: 'borrower',
      label: 'Request reserve account',
      intent: 'primary',
      input: {
        account_ref: { type: 'string' },
        facility_ref: { type: 'string', required: true },
        currency: { type: 'string' },
        target_balance: { type: 'number', required: true, min: 0 },
        lender_party: { type: 'party', role: 'lender', required: true },
        agent_party: { type: 'party', role: 'agent' },
      },
      guards: [],
    },
    {
      id: 'approve_establishment',
      from: 'establishment_requested',
      to: 'funding',
      by: ['lender'],
      label: 'Approve establishment',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'fund_account',
      from: 'funding',
      to: 'funded',
      by: ['borrower', 'agent'],
      label: 'Fund account',
      intent: 'primary',
      input: { funded_balance: { type: 'number', required: true, min: 0 } },
      guards: [],
      derive: (f, at: Instant) => ({
        shortfall_amount: shortfall(f.target_balance, f.funded_balance),
        funded_at: isoUtc(at),
      }),
    },
    {
      id: 'flag_shortfall',
      from: 'funded',
      to: 'shortfall',
      by: ['lender', 'agent'],
      label: 'Flag shortfall',
      intent: 'secondary',
      requiresReason: ['drawdown', 'revaluation', 'missed_sweep', 'fx_movement'],
      guards: [],
      derive: (_f, at: Instant) => ({ shortfall_flagged_at: isoUtc(at) }),
    },
    {
      // cure is an edge (functional floor): the borrower tops the balance back
      // up. This is the ONLY way out of `shortfall` to `funded`.
      id: 'cure_shortfall',
      from: 'shortfall',
      to: 'funded',
      by: ['borrower', 'agent'],
      label: 'Cure shortfall',
      intent: 'primary',
      input: { funded_balance: { type: 'number', required: true, min: 0 } },
      guards: [],
      derive: (f, at: Instant) => ({
        shortfall_amount: shortfall(f.target_balance, f.funded_balance),
        cured_at: isoUtc(at),
        cure_count: (typeof f.cure_count === 'number' ? f.cure_count : 0) + 1,
      }),
    },
    {
      // structural gate: release leaves ONLY `funded`. An account in `shortfall`
      // cannot be released — it must be cured or enforced first.
      id: 'release_account',
      from: 'funded',
      to: 'released',
      by: ['lender'],
      label: 'Release account',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ released_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_establishment',
      from: 'establishment_requested',
      to: 'rejected',
      by: ['lender'],
      label: 'Reject establishment',
      intent: 'destructive',
      requiresReason: ['facility_not_drawn', 'terms_not_agreed', 'reserve_not_required', 'kyc_incomplete'],
      guards: [],
    },
    {
      // reachable ONLY from `shortfall`: an uncured reserve is swept / defaulted.
      id: 'enforce_shortfall',
      from: 'shortfall',
      to: 'enforced',
      by: ['lender', 'system'],
      label: 'Enforce shortfall',
      intent: 'destructive',
      requiresReason: ['uncured_time_bar', 'cross_default', 'insolvency'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['establishment_requested', 'funding'],
      to: 'withdrawn',
      by: ['borrower'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['facility_cancelled', 'refinanced', 'no_longer_required'],
      guards: [],
    },
  ],

  // cure time-bar: a shortfall left uncured past the CTA 30-day grace window
  // enforces.
  timers: [{ onState: 'shortfall', after: { days: 30 }, fire: 'enforce_shortfall', kind: 'time_bar', reason: 'uncured_time_bar' }],
};
