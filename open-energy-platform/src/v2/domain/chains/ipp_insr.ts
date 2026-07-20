// ipp_insr — IPP insurance renewal adequacy tracking (REIPPPP Implementation
// Agreement / PPA / financing insurance covenant), as data.
//
// An IPP triggers an annual renewal, places the risk in the market with a
// broker, then the renewal resolves one of three ways: adequate coverage
// confirmed (happy path), inadequate coverage flagged (a PPA default
// trigger), or coverage lapsed outright (an immediate PPA default event).
// Both negative exits are reachable straight off the triggered renewal too —
// a broker can fail to place cover at all, so the state graph doesn't force
// every renewal through market_placement before it can lapse or be flagged
// inadequate (v1 action list has no "receive_terms" step to gate on).
//
// settles:false — this chain tracks insurance-adequacy compliance against
// PPA/financing covenants, it never moves premium money itself (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippInsr: ChainDecl = {
  key: 'ipp_insr',
  noun: 'IPP insurance renewal',
  refPrefix: 'INSR',
  title: (f) => `Insurance renewal — ${(f.project_ref as string) ?? 'project'} (${(f.line_type as string) ?? 'policy'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement insurance coverage covenant', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'regulator'],

  fields: {
    project_ref: { type: 'string', required: true, label: 'Project reference' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (inbox routing)' },
    renewal_year: { type: 'number', required: true, label: 'Renewal year' },
    annual_premium_zar: { type: 'number', min: 0, required: true, label: 'Annual premium (ZAR)' },
    insured_value_zar: { type: 'number', min: 0, label: 'Insured value (ZAR)' },
    line_type: { type: 'string', label: 'Insurance line type' },
    policy_expiry_date: { type: 'string', label: 'Policy expiry date' },
    broker_name: { type: 'string', label: 'Broker name' },
    notes: { type: 'string', label: 'Notes' },
    // shared 'reason' field key — matches v1's single 'reason' input on both
    // confirm_inadequate (shortfall detail) and lapse_coverage (lapse cause)
    reason: { type: 'string', label: 'Reason' },
    // derive-stamped timestamps
    placed_in_market_at: { type: 'string', label: 'Placed in market at' },
    resolved_at: { type: 'string', label: 'Resolved at' },
  },

  initial: 'renewal_triggered',

  states: {
    renewal_triggered: { label: 'Renewal triggered', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    market_placement: { label: 'Placed in market', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    confirmed_adequate: { label: 'Confirmed adequate', terminal: true, holder: 'none' },
    confirmed_inadequate: { label: 'Confirmed inadequate', terminal: true, holder: 'none' },
    coverage_lapsed: { label: 'Coverage lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'trigger_renewal',
      from: '@new',
      to: 'renewal_triggered',
      by: ['ipp_developer'],
      actorBecomes: 'ipp_developer',
      label: 'Trigger renewal',
      intent: 'primary',
      input: {
        project_ref: { type: 'string', required: true },
        renewal_year: { type: 'number', required: true },
        annual_premium_zar: { type: 'number', required: true, min: 0 },
        insured_value_zar: { type: 'number', min: 0 },
        line_type: { type: 'string' },
        policy_expiry_date: { type: 'string' },
        broker_name: { type: 'string' },
        notes: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'place_in_market',
      from: 'renewal_triggered',
      to: 'market_placement',
      by: ['ipp_developer'],
      label: 'Place in market',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ placed_in_market_at: isoUtc(at) }),
    },
    {
      // happy path — only reachable once terms have actually been placed.
      id: 'confirm_adequate',
      from: 'market_placement',
      to: 'confirmed_adequate',
      by: ['ipp_developer'],
      label: 'Confirm adequate',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },
    {
      // a shortfall can surface before or after placement attempts — a PPA
      // default trigger, so it carries a mandatory reason.
      id: 'confirm_inadequate',
      from: ['renewal_triggered', 'market_placement'],
      to: 'confirmed_inadequate',
      by: ['ipp_developer'],
      label: 'Flag inadequate',
      intent: 'destructive',
      input: { reason: { type: 'string', required: true } },
      requiresReason: ['coverage_gap', 'premium_unaffordable', 'underwriter_declined', 'terms_unacceptable', 'insured_value_shortfall'],
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },
    {
      // immediate PPA default event — likewise reachable with or without a
      // placement attempt on record.
      id: 'lapse_coverage',
      from: ['renewal_triggered', 'market_placement'],
      to: 'coverage_lapsed',
      by: ['ipp_developer'],
      label: 'Lapse coverage',
      intent: 'destructive',
      input: { reason: { type: 'string', required: true } },
      requiresReason: ['broker_non_response', 'policy_expired_unrenewed', 'underwriting_declined', 'payment_default', 'market_capacity_unavailable'],
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },
  ],

  // no timers: v1's sla_due_date has no documented automated sweep for this
  // chain (not in wrangler.toml cron list) — omitted rather than guessed.
};
