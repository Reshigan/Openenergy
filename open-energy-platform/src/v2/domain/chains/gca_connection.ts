// gca_connection — Grid Connection Agreement / UNGCA lifecycle as data.
//
// NERSA Grid Code C-1, two-party (IPP developer ↔ System Operator): the IPP
// files a connection application, the SO scopes and runs the grid-impact
// studies, issues a cost estimate the IPP must accept, drafts the UNGCA, the
// IPP executes it, builds the connection works, and the SO energises then
// commissions the point of connection into service.
//
// Structural honesty (no invented guards):
//  - `in_service` is reachable ONLY via `commission`, which is reachable ONLY
//    from `energised`, which is reachable ONLY from `construction`, which is
//    reachable ONLY from `executed` — a UNGCA must be signed before a single
//    metre of connection plant is built or energised. No guard required; the
//    state graph enforces the build-after-sign sequence.
//  - `apply` is guarded by counterpartyDistinct: the IPP and the network
//    operator must be different legal entities (no self-connection).
//  - `execute-agreement` — signing the UNGCA is the binding legal commitment
//    on this chain (same role as ccp_assessment's `approve`) — guarded by
//    complianceHaltClear so a platform-wide compliance halt blocks new
//    binding connection commitments without blocking de-risking (reject /
//    withdraw stay open).
//
// settles:false — cost_estimate_zar / cost_accepted_zar are informational
// connection-cost figures on the application; this chain never posts a
// payment or settles quantum (R-S5-1). The connection charge itself invoices
// on its own rail.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const gcaConnection: ChainDecl = {
  key: 'gca_connection',
  noun: 'Grid connection agreement',
  refPrefix: 'GCA',
  title: (f) => `Grid connection — ${(f.project_name as string) ?? 'unnamed project'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'Code C-1 — grid connection / UNGCA process', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'grid_operator', 'operator'],

  fields: {
    project_name: { type: 'string', required: true, label: 'Project' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    network_party: { type: 'party', role: 'grid_operator', label: 'Network operator' },
    gia_ref: { type: 'string', label: 'Grid impact assessment ref' },
    cost_estimate_zar: { type: 'number', min: 0, label: 'Connection cost estimate (ZAR) — informational' },
    cost_accepted_zar: { type: 'number', min: 0, label: 'Accepted cost (ZAR) — informational' },
    ungca_ref: { type: 'string', label: 'UNGCA reference' },
    regulator_authority: { type: 'string', label: 'Regulator authority (e.g. NERSA for transmission tier)' },
    regulator_ref: { type: 'string', label: 'NERSA C-1 acknowledgement ref' },
    energisation_date_actual: { type: 'string', label: 'Actual energisation date' },
    closure_notes: { type: 'string', label: 'Commissioning closure notes' },
    // written by derive, never by the client
    filed_at: { type: 'string', label: 'Application filed at' },
    studies_requested_at: { type: 'string', label: 'Studies requested at' },
    cost_estimate_issued_at: { type: 'string', label: 'Cost estimate issued at' },
    cost_accepted_at: { type: 'string', label: 'Cost accepted at' },
    executed_at: { type: 'string', label: 'UNGCA executed at' },
    energised_at: { type: 'string', label: 'Energised at' },
    commissioned_at: { type: 'string', label: 'Commissioned (in-service) at' },
    closed_at: { type: 'string', label: 'Closed at (rejected/withdrawn)' },
  },

  initial: 'application_filed',

  states: {
    application_filed: { label: 'Application filed', terminal: false, holder: 'grid_operator', sla: { days: 14 } },
    studies_required: { label: 'Studies required', terminal: false, holder: 'grid_operator', sla: { days: 30 } },
    studies_executing: { label: 'Studies executing', terminal: false, holder: 'grid_operator', sla: { days: 90 } },
    cost_estimate_issued: { label: 'Cost estimate issued', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    cost_accepted: { label: 'Cost accepted', terminal: false, holder: 'grid_operator', sla: { days: 14 } },
    connection_agreement_drafted: { label: 'Connection agreement drafted', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    executed: { label: 'Agreement executed', terminal: false, holder: 'ipp_developer', sla: { days: 60 } },
    construction: { label: 'Construction', terminal: false, holder: 'ipp_developer', sla: { days: 180 } },
    energised: { label: 'Energised', terminal: false, holder: 'grid_operator', sla: { days: 14 } },
    in_service: { label: 'In service', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'apply',
      from: '@new',
      to: 'application_filed',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'File connection application',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        network_party: { type: 'party', role: 'grid_operator' },
      },
      // IPP ≠ network operator (no self-connection).
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ filed_at: isoUtc(at) }),
    },
    {
      id: 'request-studies',
      from: 'application_filed',
      to: 'studies_required',
      by: ['grid_operator', 'operator'],
      label: 'Request studies',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ studies_requested_at: isoUtc(at) }),
    },
    {
      id: 'begin-studies',
      from: 'studies_required',
      to: 'studies_executing',
      by: ['grid_operator', 'operator'],
      label: 'Begin studies',
      intent: 'primary',
      input: { gia_ref: { type: 'string' } },
      guards: [],
    },
    {
      id: 'issue-cost-estimate',
      from: 'studies_executing',
      to: 'cost_estimate_issued',
      by: ['grid_operator', 'operator'],
      label: 'Issue cost estimate',
      intent: 'primary',
      input: {
        cost_estimate_zar: { type: 'number', min: 0 },
        gia_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ cost_estimate_issued_at: isoUtc(at) }),
    },
    {
      id: 'accept-cost',
      from: 'cost_estimate_issued',
      to: 'cost_accepted',
      by: ['ipp_developer', 'operator'],
      label: 'Accept cost estimate',
      intent: 'primary',
      input: { cost_accepted_zar: { type: 'number', required: true, min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ cost_accepted_at: isoUtc(at) }),
    },
    {
      id: 'draft-agreement',
      from: 'cost_accepted',
      to: 'connection_agreement_drafted',
      by: ['grid_operator', 'operator'],
      label: 'Draft agreement',
      intent: 'primary',
      guards: [],
    },
    {
      // the binding legal commitment on this chain — same role as
      // ccp_assessment's `approve`. Halted platform-wide ⇒ no new UNGCAs.
      id: 'execute-agreement',
      from: 'connection_agreement_drafted',
      to: 'executed',
      by: ['ipp_developer', 'operator'],
      label: 'Execute agreement',
      intent: 'primary',
      input: {
        ungca_ref: { type: 'string', required: true },
        regulator_authority: { type: 'string' },
        regulator_ref: { type: 'string' },
      },
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ executed_at: isoUtc(at) }),
    },
    {
      id: 'begin-construction',
      from: 'executed',
      to: 'construction',
      by: ['ipp_developer', 'operator'],
      label: 'Begin construction',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'energise',
      from: 'construction',
      to: 'energised',
      by: ['grid_operator', 'operator'],
      label: 'Energise connection',
      intent: 'primary',
      input: { energisation_date_actual: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ energised_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into the terminal in-service state, and it can only
      // fire from energised — so a connection cannot go in-service unsigned.
      id: 'commission',
      from: 'energised',
      to: 'in_service',
      by: ['grid_operator', 'operator'],
      label: 'Commission',
      intent: 'primary',
      input: { closure_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ commissioned_at: isoUtc(at) }),
    },

    // --- exits ------------------------------------------------------------
    {
      id: 'reject',
      from: ['application_filed', 'studies_required', 'studies_executing', 'cost_estimate_issued', 'cost_accepted', 'connection_agreement_drafted'],
      to: 'rejected',
      by: ['grid_operator', 'operator'],
      label: 'Reject application',
      intent: 'destructive',
      requiresReason: ['grid_stability', 'network_capacity', 'load_constraint', 'phasing_conflict', 'other'],
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['application_filed', 'studies_required', 'studies_executing', 'cost_estimate_issued', 'cost_accepted', 'connection_agreement_drafted', 'executed', 'construction'],
      to: 'withdrawn',
      by: ['ipp_developer', 'operator'],
      label: 'Withdraw application',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'financing_failed', 'site_change', 'no_longer_required'],
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },
  ],
};
