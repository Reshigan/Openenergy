// vendor_escalation — O&M vendor/supplier performance escalation lifecycle as data.
//
// An O&M raiser opens an escalation against a vendor (counterparty) over an
// unresolved service issue or SLA breach. The vendor acknowledges, submits a
// remediation plan, remediates; the raiser then VERIFIES the fix and only then
// closes. The resolution spine is structural: close_escalation leaves ONLY
// remediation_verified, and the ONLY path into remediation_verified is
// verify_remediation. So an escalation can NEVER be closed before the raiser
// has verified the fix — no guard needed, the state graph enforces it.
//
// A critical-priority escalation crosses to the regulator: terminating the
// vendor relationship over a critical failure is guarded by
// regulatorPresentIfCritical (a regulator must be a live party on the txn).
//
// settles:false — an escalation is an operational governance control, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure severity bucketing off the numeric score (1..5). No clock, no env.
const severityTier = (score: Json | undefined): string => {
  if (typeof score !== 'number') return 'unassessed';
  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
};

export const vendorEscalation: ChainDecl = {
  key: 'vendor_escalation',
  noun: 'Vendor escalation',
  refPrefix: 'VE',
  title: (f) =>
    `L${(f.escalation_level as number) ?? 1} vendor escalation — ${(f.issue_summary as string) ?? 'unspecified issue'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'O&M service performance & remedy', effect: 'requires' },
    { instrument: 'Service contract SLA', provision: 'breach escalation & remediation', effect: 'requires' },
  ],
  roles: ['raiser', 'vendor', 'regulator', 'operator'],

  fields: {
    escalation_ref: { type: 'string', label: 'Escalation ref' },
    raiser_party: { type: 'party', role: 'raiser', label: 'Raiser' },
    vendor_party: { type: 'party', role: 'vendor', label: 'Vendor' },
    service_contract_ref: { type: 'string', label: 'Service contract ref' },
    issue_summary: { type: 'string', required: true, label: 'Issue summary' },
    issue_category: { type: 'string', label: 'Category (sla_breach/quality/response_time/scope)' },
    severity: { type: 'number', min: 1, max: 5, label: 'Severity (1-5)' },
    severity_tier: { type: 'string', label: 'Severity tier' },
    priority: { type: 'string', label: 'Priority (normal/high/critical)' },
    sla_breach: { type: 'boolean', label: 'SLA breached' },
    escalation_level: { type: 'number', min: 1, label: 'Escalation level' },
    target_resolution_hours: { type: 'number', min: 0, label: 'Target resolution (hours)' },
    remediation_plan_ref: { type: 'string', label: 'Remediation plan ref' },
    root_cause: { type: 'string', label: 'Root cause' },
    reopen_count: { type: 'number', label: 'Times reopened' },
    // written by derive, never by the client
    raised_at: { type: 'string', label: 'Raised at' },
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    resolved_at: { type: 'string', label: 'Resolved at' },
    closed_at_esc: { type: 'string', label: 'Closed at' },
  },

  initial: 'raised',

  states: {
    raised: { label: 'Raised', terminal: false, holder: 'vendor', sla: { hours: 24 } },
    acknowledged: { label: 'Acknowledged', terminal: false, holder: 'vendor', sla: { hours: 48 } },
    remediation_planned: { label: 'Remediation planned', terminal: false, holder: 'vendor', sla: { hours: 24 } },
    remediation_in_progress: { label: 'Remediation in progress', terminal: false, holder: 'vendor' },
    remediation_verified: { label: 'Remediation verified', terminal: false, holder: 'raiser', sla: { hours: 12 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    dismissed: { label: 'Dismissed', terminal: true, holder: 'none' },
    terminated: { label: 'Terminated', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'raised',
      by: ['raiser', 'operator'],
      actorBecomes: 'raiser',
      label: 'Raise escalation',
      intent: 'primary',
      input: {
        vendor_party: { type: 'party', role: 'vendor' },
        regulator_party: { type: 'party', role: 'regulator' },
        service_contract_ref: { type: 'string' },
        issue_summary: { type: 'string', required: true },
        issue_category: { type: 'string' },
        severity: { type: 'number', min: 1, max: 5 },
        priority: { type: 'string' },
        sla_breach: { type: 'boolean' },
        escalation_level: { type: 'number', min: 1 },
        target_resolution_hours: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (f, at: Instant) => ({ raised_at: isoUtc(at), severity_tier: severityTier(f.severity) }),
    },
    {
      id: 'acknowledge',
      from: 'raised',
      to: 'acknowledged',
      by: ['vendor'],
      label: 'Acknowledge escalation',
      intent: 'primary',
      input: { target_resolution_hours: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    {
      id: 'submit_remediation_plan',
      from: 'acknowledged',
      to: 'remediation_planned',
      by: ['vendor'],
      label: 'Submit remediation plan',
      intent: 'primary',
      input: { remediation_plan_ref: { type: 'string', required: true }, root_cause: { type: 'string' } },
      guards: [],
    },
    {
      id: 'begin_remediation',
      from: 'remediation_planned',
      to: 'remediation_in_progress',
      by: ['vendor'],
      label: 'Begin remediation',
      intent: 'primary',
      guards: [],
    },
    {
      // structural gate: the ONLY edge into remediation_verified, and it can only
      // fire from remediation_in_progress. Since close_escalation leaves ONLY
      // remediation_verified, an escalation cannot close before the raiser has
      // verified the fix. No guard — the state graph enforces it.
      id: 'verify_remediation',
      from: 'remediation_in_progress',
      to: 'remediation_verified',
      by: ['raiser'],
      label: 'Verify remediation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },
    {
      id: 'reopen',
      from: 'remediation_verified',
      to: 'remediation_in_progress',
      by: ['raiser'],
      label: 'Reopen escalation',
      intent: 'secondary',
      requiresReason: ['recurrence', 'incomplete_fix', 'verification_failed'],
      guards: [],
      derive: (f, _at: Instant) => ({ reopen_count: (typeof f.reopen_count === 'number' ? f.reopen_count : 0) + 1 }),
    },
    {
      id: 'close_escalation',
      from: 'remediation_verified',
      to: 'closed',
      by: ['raiser'],
      label: 'Close escalation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_esc: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'withdraw',
      from: ['raised', 'acknowledged'],
      to: 'withdrawn',
      by: ['raiser'],
      label: 'Withdraw escalation',
      intent: 'destructive',
      requiresReason: ['issue_resolved_externally', 'raised_in_error', 'duplicate'],
      guards: [],
    },
    {
      id: 'dismiss',
      from: ['raised', 'acknowledged'],
      to: 'dismissed',
      by: ['vendor'],
      label: 'Dismiss escalation',
      intent: 'destructive',
      requiresReason: ['out_of_scope', 'not_a_defect', 'contract_expired'],
      guards: [],
    },
    {
      id: 'terminate',
      from: ['acknowledged', 'remediation_planned', 'remediation_in_progress', 'remediation_verified'],
      to: 'terminated',
      by: ['raiser', 'regulator'],
      label: 'Terminate vendor over escalation',
      intent: 'destructive',
      requiresReason: ['persistent_breach', 'remediation_failed', 'material_default'],
      // a critical-priority termination crosses to the regulator: one must be a party.
      guards: ['regulatorPresentIfCritical'],
    },
  ],
};
