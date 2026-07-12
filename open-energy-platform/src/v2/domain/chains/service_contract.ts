// service_contract — O&M / asset-service contract lifecycle as data.
//
// A customer (asset owner) requests service against an asset; a service provider
// drafts terms → negotiates → the customer accepts → the contract is executed →
// it goes active and service is delivered under SLA, then expires or is
// terminated. The commercial spine is structural: the ONLY edge into `active` is
// `execute`, and `execute` can ONLY fire from `execution_pending` — reached
// solely by `accept_terms`. So a contract can NEVER go active before both parties
// have agreed AND execution evidence exists. `execute` is guarded by
// executionEvidencePresent (board approval + named legal counterparty), so an
// unsigned contract cannot start billing service. Self-dealing (customer ==
// provider) is refused at `open` by counterpartyDistinct.
//
// settles:false — a service contract is a commercial commitment record, not a
// payment rail; fees settle through invoicing chains, not here (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const serviceContract: ChainDecl = {
  key: 'service_contract',
  noun: 'Service contract',
  refPrefix: 'SC',
  title: (f) => `${(f.service_type as string) ?? 'O&M'} service contract — ${(f.asset_name as string) ?? 'unnamed asset'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP IA', provision: 'operations & maintenance obligations', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'asset availability & performance', effect: 'requires' },
  ],
  roles: ['customer', 'provider', 'regulator', 'operator'],

  fields: {
    contract_number: { type: 'string', label: 'Contract number' },
    customer_party: { type: 'party', role: 'customer', label: 'Customer' },
    provider_party: { type: 'party', role: 'provider', label: 'Service provider' },
    asset_name: { type: 'string', required: true, label: 'Asset' },
    service_type: { type: 'string', required: true, label: 'Service type (O&M/warranty/inspection/BoP)' },
    scope_description: { type: 'string', required: true, label: 'Scope of service' },
    term_months: { type: 'number', min: 0, label: 'Term (months)' },
    annual_value: { type: 'number', min: 0, label: 'Annual contract value (ZAR)' },
    sla_uptime_pct: { type: 'number', min: 0, max: 100, label: 'SLA uptime (%)' },
    response_time_hours: { type: 'number', min: 0, label: 'SLA response time (hours)' },
    revision_count: { type: 'number', label: 'Times revised' },
    // written by derive, never by the client
    proposed_at: { type: 'string', label: 'Terms proposed at' },
    executed_at: { type: 'string', label: 'Executed at' },
    ended_at: { type: 'string', label: 'Contract ended at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'provider', sla: { hours: 48 } },
    under_review: { label: 'Under customer review', terminal: false, holder: 'customer', sla: { hours: 72 } },
    execution_pending: { label: 'Execution pending', terminal: false, holder: 'customer', sla: { hours: 120 } },
    active: { label: 'Active', terminal: false, holder: 'provider' },
    suspended: { label: 'Suspended', terminal: false, holder: 'customer' },
    expired: { label: 'Expired', terminal: true, holder: 'none' },
    terminated: { label: 'Terminated', terminal: true, holder: 'none' },
    rejected: { label: 'Declined', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['customer', 'operator'],
      actorBecomes: 'customer',
      label: 'Request service contract',
      intent: 'primary',
      input: {
        asset_name: { type: 'string', required: true },
        service_type: { type: 'string', required: true },
        scope_description: { type: 'string', required: true },
        term_months: { type: 'number', min: 0 },
        provider_party: { type: 'party', role: 'provider' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // customer and provider must be distinct legal entities (no self-dealing).
      guards: ['counterpartyDistinct'],
    },
    {
      id: 'propose_terms',
      from: 'draft',
      to: 'under_review',
      by: ['provider'],
      label: 'Propose terms',
      intent: 'primary',
      input: {
        annual_value: { type: 'number', min: 0 },
        sla_uptime_pct: { type: 'number', min: 0, max: 100 },
        response_time_hours: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ proposed_at: isoUtc(at) }),
    },
    {
      id: 'request_revision',
      from: 'under_review',
      to: 'draft',
      by: ['customer'],
      label: 'Request revision',
      intent: 'secondary',
      requiresReason: ['price_too_high', 'sla_insufficient', 'scope_gap', 'term_mismatch'],
      guards: [],
      derive: (f, _at: Instant) => ({ revision_count: (typeof f.revision_count === 'number' ? f.revision_count : 0) + 1 }),
    },
    {
      id: 'accept_terms',
      from: 'under_review',
      to: 'execution_pending',
      by: ['customer'],
      label: 'Accept terms',
      intent: 'primary',
      guards: [],
    },
    {
      // structural commercial gate: the ONLY edge into `active`, and it can only
      // fire from execution_pending — reached solely by accept_terms. A contract
      // therefore cannot go active before both sides agree AND it is executed.
      id: 'execute',
      from: 'execution_pending',
      to: 'active',
      by: ['customer', 'provider'],
      label: 'Execute contract',
      intent: 'primary',
      input: {
        board_approval_ref: { type: 'string' },
        legal_counterparty_ref: { type: 'string' },
      },
      guards: ['executionEvidencePresent'],
      derive: (_f, at: Instant) => ({ executed_at: isoUtc(at) }),
    },
    {
      id: 'suspend_service',
      from: 'active',
      to: 'suspended',
      by: ['customer', 'provider'],
      label: 'Suspend service',
      intent: 'secondary',
      requiresReason: ['sla_breach', 'payment_dispute', 'force_majeure', 'safety_stand_down'],
      guards: [],
    },
    { id: 'resume_service', from: 'suspended', to: 'active', by: ['customer', 'provider'], label: 'Resume service', intent: 'primary', guards: [] },
    {
      id: 'expire',
      from: 'active',
      to: 'expired',
      by: ['operator', 'provider'],
      label: 'Expire contract',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ ended_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'decline_contract',
      from: ['draft', 'under_review'],
      to: 'rejected',
      by: ['provider'],
      label: 'Decline contract',
      intent: 'destructive',
      requiresReason: ['capacity_unavailable', 'scope_out_of_competency', 'commercially_unviable', 'asset_ineligible'],
      guards: [],
    },
    {
      id: 'withdraw_request',
      from: ['draft', 'under_review', 'execution_pending'],
      to: 'withdrawn',
      by: ['customer'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['no_longer_required', 'awarded_elsewhere', 'budget_withdrawn'],
      guards: [],
    },
    {
      id: 'terminate_contract',
      from: ['execution_pending', 'active', 'suspended'],
      to: 'terminated',
      by: ['customer', 'provider', 'regulator'],
      label: 'Terminate contract',
      intent: 'destructive',
      requiresReason: ['material_breach', 'insolvency', 'sustained_sla_failure', 'regulatory_direction', 'mutual_agreement'],
      guards: [],
      derive: (_f, at: Instant) => ({ ended_at: isoUtc(at) }),
    },
  ],

  // active-term time-bar: a contract past its natural term expires. record-only
  // stub; the sweep computes the real bar off term_months (ppa_contract pattern).
  timers: [{ onState: 'active', after: { days: 0 }, fire: 'expire', kind: 'time_bar' }],
};
