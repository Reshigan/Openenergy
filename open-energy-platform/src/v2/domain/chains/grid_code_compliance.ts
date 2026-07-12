// grid_code_compliance — NERSA Grid Code / NRS 097 non-conformance case as data.
//
// A grid/system operator raises a non-conformance (NC) against a connected
// facility when a measured parameter breaches a code limit (e.g. voltage dips
// below 0.95 pu). The case runs raise → investigate → assess → directive →
// remediate → resolve. The responsible party (the connected facility) is the
// one who must remediate; the operator verifies.
//
// The remediation spine is structural: verify_remediation ONLY leaves
// remediation_submitted, and the ONLY path into remediation_submitted is
// submit_remediation from remediation_required. So a case can NEVER be marked
// resolved without the responsible party actually submitting remediation
// evidence — no guard needed, the state graph enforces it. A closed NC always
// has a remediation on file.
//
// A critical-severity breach crosses to the regulator: issue_directive is
// guarded by regulatorPresentIfCritical, so a formal directive on a critical
// non-conformance cannot issue without NERSA on the txn.
//
// settles:false — a compliance case is a regulatory control record, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure deviation magnitude (percent of the limit) off measured vs limit. No
// clock, no env. limit 0 ⇒ 0 (avoid a divide-by-zero, unphysical anyway).
const deviationPct = (measured: Json | undefined, limit: Json | undefined): number => {
  if (typeof measured !== 'number' || typeof limit !== 'number' || limit === 0) return 0;
  return Math.round((Math.abs(measured - limit) / Math.abs(limit)) * 1000) / 10;
};

// pure severity bucketing off the deviation magnitude.
const severityTier = (pct: number): string => {
  if (pct >= 20) return 'severe';
  if (pct >= 5) return 'material';
  return 'marginal';
};

export const gridCodeCompliance: ChainDecl = {
  key: 'grid_code_compliance',
  noun: 'Grid-code non-conformance',
  refPrefix: 'GCC',
  title: (f) =>
    `NC — ${(f.facility_name as string) ?? 'unnamed facility'}: ${(f.parameter as string) ?? 'parameter'} vs ${(f.code_reference as string) ?? 'grid code'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'Network Code — quality of supply & compliance monitoring', effect: 'requires' },
    { instrument: 'NRS 097', provision: 's4.2 voltage/quality-of-supply limits', effect: 'restricts' },
    { instrument: 'ERA 2006', provision: 's27 licence conditions & directives', effect: 'authorises' },
  ],
  roles: ['operator', 'responsible', 'regulator'],

  fields: {
    nc_ref: { type: 'string', label: 'Non-conformance ref' },
    responsible_party: { type: 'party', role: 'responsible', label: 'Responsible party (connected facility)' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA)' },
    facility_name: { type: 'string', required: true, label: 'Facility' },
    node_id: { type: 'string', label: 'Network node' },
    parameter: { type: 'string', required: true, label: 'Parameter (e.g. Voltage pu)' },
    measured_value: { type: 'number', required: true, label: 'Measured value' },
    limit_value: { type: 'number', required: true, label: 'Code limit value' },
    code_reference: { type: 'string', required: true, label: 'Code reference (e.g. NRS 097 s4.2.1)' },
    priority: { type: 'string', label: 'Priority (marginal/material/critical)' },
    raise_basis: { type: 'string', label: 'Raise basis' },
    // written by derive, never by the client
    deviation_pct: { type: 'number', label: 'Deviation from limit (%)' },
    severity_tier: { type: 'string', label: 'Severity tier' },
    assessment_ref: { type: 'string', label: 'Assessment ref' },
    directive_ref: { type: 'string', label: 'Directive ref' },
    remediation_ref: { type: 'string', label: 'Remediation evidence ref' },
    raised_at: { type: 'string', label: 'Raised at' },
    directive_issued_at: { type: 'string', label: 'Directive issued at' },
    resolved_at: { type: 'string', label: 'Resolved at' },
  },

  initial: 'nc_raised',

  states: {
    nc_raised: { label: 'Non-conformance raised', terminal: false, holder: 'operator', sla: { hours: 24 } },
    investigation: { label: 'Investigation', terminal: false, holder: 'operator', sla: { hours: 48 } },
    under_assessment: { label: 'Under assessment', terminal: false, holder: 'operator', sla: { hours: 72 } },
    remediation_required: { label: 'Remediation required', terminal: false, holder: 'responsible', sla: { days: 14 } },
    remediation_submitted: { label: 'Remediation submitted', terminal: false, holder: 'operator', sla: { hours: 48 } },
    resolved: { label: 'Resolved', terminal: true, holder: 'none' },
    dismissed: { label: 'Dismissed', terminal: true, holder: 'none' },
    enforcement_referred: { label: 'Referred for enforcement', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'nc_raised',
      by: ['operator'],
      actorBecomes: 'operator',
      label: 'Raise non-conformance',
      intent: 'primary',
      input: {
        facility_name: { type: 'string', required: true },
        node_id: { type: 'string' },
        parameter: { type: 'string', required: true },
        measured_value: { type: 'number', required: true },
        limit_value: { type: 'number', required: true },
        code_reference: { type: 'string', required: true },
        priority: { type: 'string' },
        raise_basis: { type: 'string' },
        responsible_party: { type: 'party', role: 'responsible' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, at: Instant) => {
        const pct = deviationPct(f.measured_value, f.limit_value);
        return { deviation_pct: pct, severity_tier: severityTier(pct), raised_at: isoUtc(at) };
      },
    },
    {
      id: 'begin_investigation',
      from: 'nc_raised',
      to: 'investigation',
      by: ['operator'],
      label: 'Begin investigation',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'begin_assessment',
      from: 'investigation',
      to: 'under_assessment',
      by: ['operator'],
      label: 'Begin assessment',
      intent: 'primary',
      input: { assessment_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      // critical-severity NC crossing to the regulator: a formal directive on a
      // critical breach needs NERSA on the txn (regulatorPresentIfCritical).
      id: 'issue_directive',
      from: 'under_assessment',
      to: 'remediation_required',
      by: ['operator'],
      label: 'Issue remediation directive',
      intent: 'primary',
      input: { directive_ref: { type: 'string', required: true } },
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ directive_issued_at: isoUtc(at) }),
    },
    {
      id: 'submit_remediation',
      from: 'remediation_required',
      to: 'remediation_submitted',
      by: ['responsible'],
      label: 'Submit remediation evidence',
      intent: 'primary',
      input: { remediation_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      // structural gate: the ONLY edge into resolved, and it can only fire from
      // remediation_submitted — which only submit_remediation reaches. A case
      // therefore cannot resolve without remediation on file. No guard.
      id: 'verify_remediation',
      from: 'remediation_submitted',
      to: 'resolved',
      by: ['operator'],
      label: 'Verify remediation & resolve',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },
    {
      id: 'reject_remediation',
      from: 'remediation_submitted',
      to: 'remediation_required',
      by: ['operator'],
      label: 'Reject remediation',
      intent: 'secondary',
      requiresReason: ['evidence_insufficient', 'breach_persists', 'incomplete_scope', 'retest_failed'],
      guards: [],
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'dismiss',
      from: ['nc_raised', 'investigation', 'under_assessment'],
      to: 'dismissed',
      by: ['operator'],
      label: 'Dismiss non-conformance',
      intent: 'destructive',
      requiresReason: ['false_positive', 'within_limits', 'measurement_error', 'transient_self_cleared'],
      guards: [],
    },
    {
      id: 'refer_enforcement',
      from: ['under_assessment', 'remediation_required', 'remediation_submitted'],
      to: 'enforcement_referred',
      by: ['operator', 'regulator'],
      label: 'Refer for enforcement',
      intent: 'destructive',
      requiresReason: ['persistent_breach', 'remediation_failed', 'safety_risk', 'repeat_offender'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['nc_raised', 'investigation'],
      to: 'withdrawn',
      by: ['operator'],
      label: 'Withdraw non-conformance',
      intent: 'destructive',
      requiresReason: ['raised_in_error', 'superseded', 'duplicate_case'],
      guards: [],
    },
  ],

  // remediation time-bar: a directive left un-remediated past its window escalates
  // to enforcement (a persistent grid-code breach cannot sit open indefinitely).
  // record-only stub; the sweep computes the real bar off state sla days.
  timers: [{ onState: 'remediation_required', after: { days: 0 }, fire: 'refer_enforcement', kind: 'time_bar' }],
};
