// service_request — ITSM-style service request against the service catalog, as
// data.
//
// A requester raises a request; the service desk (agent) checks entitlement,
// assigns, fulfils, the user verifies, then it closes. The verification spine is
// structural: close_request ONLY leaves `verified`, and the ONLY path into
// `verified` is `verify` from `fulfilled`. So a request can NEVER be closed
// before the user has confirmed the fix — no guard needed, the state graph
// enforces it (permit_to_work isolation-gate pattern).
//
// Critical-tier requests cross to the regulator: start_fulfilment is guarded by
// regulatorPresentIfCritical (reads the `priority` field) — a critical request
// cannot enter fulfilment without a regulator on the txn.
//
// settles:false — a service request is an operational support control, never a
// payment (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const serviceRequest: ChainDecl = {
  key: 'service_request',
  noun: 'Service request',
  refPrefix: 'SERV',
  title: (f) => `${(f.priority as string) ?? 'standard'} SR — ${(f.request_title as string) ?? (f.catalog_item as string) ?? 'unspecified'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'POPIA', provision: 's19 security safeguards on service data', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'operational support & change control', effect: 'requires' },
  ],
  roles: ['requester', 'agent', 'approver', 'regulator', 'operator'],

  fields: {
    request_number: { type: 'string', label: 'Request number' },
    requester_party: { type: 'party', role: 'requester', label: 'Requested for' },
    agent_party: { type: 'party', role: 'agent', label: 'Fulfilling agent' },
    approver_party: { type: 'party', role: 'approver', label: 'Approver' },
    catalog_item: { type: 'string', required: true, label: 'Catalog item' },
    catalog_category: { type: 'string', label: 'Catalog category' },
    request_title: { type: 'string', label: 'Title' },
    business_justification: { type: 'string', label: 'Business justification' },
    priority: { type: 'string', required: true, label: 'Priority (minor/standard/material/critical)' },
    requires_approval: { type: 'boolean', label: 'Requires approval' },
    entitlement_status: { type: 'string', label: 'Entitlement status' },
    assignee_team: { type: 'string', label: 'Assignee team' },
    resolution_text: { type: 'string', label: 'Resolution' },
    csat: { type: 'number', min: 1, max: 5, label: 'CSAT (1-5)' },
    reopened_count: { type: 'number', label: 'Times reopened' },
    // written by derive, never by the client
    first_response_at: { type: 'string', label: 'First response at' },
    entitlement_checked_at: { type: 'string', label: 'Entitlement checked at' },
    fulfilled_at: { type: 'string', label: 'Fulfilled at' },
    verified_at: { type: 'string', label: 'Verified at' },
    closed_at_sr: { type: 'string', label: 'Closed at' },
  },

  initial: 'submitted',

  states: {
    submitted: { label: 'Submitted', terminal: false, holder: 'agent', sla: { hours: 4 } },
    entitlement_checked: { label: 'Entitlement checked', terminal: false, holder: 'agent', sla: { hours: 8 } },
    approval_pending: { label: 'Approval pending', terminal: false, holder: 'approver', sla: { hours: 24 } },
    assigned: { label: 'Assigned', terminal: false, holder: 'agent', sla: { hours: 8 } },
    fulfilment_in_progress: { label: 'Fulfilment in progress', terminal: false, holder: 'agent' },
    awaiting_user: { label: 'Awaiting user', terminal: false, holder: 'requester', sla: { hours: 48 } },
    fulfilled: { label: 'Fulfilled', terminal: false, holder: 'requester', sla: { hours: 24 } },
    verified: { label: 'Verified', terminal: false, holder: 'agent', sla: { hours: 8 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'submitted',
      by: ['requester', 'operator'],
      actorBecomes: 'requester',
      label: 'Raise request',
      intent: 'primary',
      input: {
        catalog_item: { type: 'string', required: true },
        catalog_category: { type: 'string' },
        request_title: { type: 'string' },
        business_justification: { type: 'string' },
        priority: { type: 'string', required: true },
        requires_approval: { type: 'boolean' },
        agent_party: { type: 'party', role: 'agent' },
        approver_party: { type: 'party', role: 'approver' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'check_entitlement',
      from: 'submitted',
      to: 'entitlement_checked',
      by: ['agent', 'operator'],
      label: 'Check entitlement',
      intent: 'primary',
      input: { entitlement_status: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ first_response_at: isoUtc(at), entitlement_checked_at: isoUtc(at) }),
    },
    {
      id: 'request_approval',
      from: 'entitlement_checked',
      to: 'approval_pending',
      by: ['agent'],
      label: 'Route for approval',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'approve',
      from: 'approval_pending',
      to: 'assigned',
      by: ['approver'],
      label: 'Approve request',
      intent: 'primary',
      input: { assignee_team: { type: 'string' } },
      guards: [],
    },
    {
      // pre-approved / standard path: no CAB needed, agent self-assigns.
      id: 'assign',
      from: 'entitlement_checked',
      to: 'assigned',
      by: ['agent'],
      label: 'Assign',
      intent: 'primary',
      input: { assignee_team: { type: 'string' } },
      guards: [],
    },
    {
      // single chokepoint every happy path crosses: a critical request cannot
      // enter fulfilment without a regulator on the txn.
      id: 'start_fulfilment',
      from: 'assigned',
      to: 'fulfilment_in_progress',
      by: ['agent'],
      label: 'Start fulfilment',
      intent: 'primary',
      guards: ['regulatorPresentIfCritical'],
    },
    {
      id: 'request_more_info',
      from: 'fulfilment_in_progress',
      to: 'awaiting_user',
      by: ['agent'],
      label: 'Request more info',
      intent: 'secondary',
      guards: [],
    },
    { id: 'user_responds', from: 'awaiting_user', to: 'fulfilment_in_progress', by: ['requester'], label: 'Provide info', intent: 'primary', guards: [] },
    {
      id: 'mark_fulfilled',
      from: 'fulfilment_in_progress',
      to: 'fulfilled',
      by: ['agent'],
      label: 'Mark fulfilled',
      intent: 'primary',
      input: { resolution_text: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ fulfilled_at: isoUtc(at) }),
    },
    {
      // structural verification gate: the ONLY edge into `verified`, from
      // `fulfilled`. close_request leaves ONLY `verified`, so a request can never
      // close before the user has confirmed the fix. No guard.
      id: 'verify',
      from: 'fulfilled',
      to: 'verified',
      by: ['requester'],
      label: 'Verify fix',
      intent: 'primary',
      input: { csat: { type: 'number', min: 1, max: 5 } },
      guards: [],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },
    {
      id: 'reopen',
      from: 'fulfilled',
      to: 'fulfilment_in_progress',
      by: ['requester'],
      label: 'Reopen',
      intent: 'secondary',
      requiresReason: ['not_resolved', 'partial_fix', 'recurred', 'wrong_resolution'],
      guards: [],
      derive: (f, _at: Instant) => ({ reopened_count: (typeof f.reopened_count === 'number' ? f.reopened_count : 0) + 1 }),
    },
    {
      id: 'close_request',
      from: 'verified',
      to: 'closed',
      by: ['agent', 'operator'],
      label: 'Close request',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_sr: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_request',
      from: ['submitted', 'entitlement_checked', 'approval_pending'],
      to: 'rejected',
      by: ['agent', 'approver'],
      label: 'Reject request',
      intent: 'destructive',
      requiresReason: ['not_entitled', 'out_of_catalog', 'insufficient_justification', 'duplicate', 'policy_violation'],
      guards: [],
    },
    {
      id: 'cancel_request',
      from: ['submitted', 'entitlement_checked', 'approval_pending', 'assigned', 'fulfilment_in_progress', 'awaiting_user'],
      to: 'cancelled',
      by: ['requester', 'operator', 'system'],
      label: 'Cancel request',
      intent: 'destructive',
      requiresReason: ['no_longer_needed', 'raised_in_error', 'resolved_elsewhere', 'user_non_response'],
      guards: [],
    },
  ],

  // awaiting-user non-response time-bar: a request left waiting on the user
  // past its 48h window auto-cancels.
  timers: [{ onState: 'awaiting_user', after: { hours: 48 }, fire: 'cancel_request', kind: 'time_bar', reason: 'user_non_response' }],
};
