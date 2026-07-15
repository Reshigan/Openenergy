// control_environment_audit — per-control SOC 2 Type II / COSO 2013 ICFR /
// ISO 27001:2022 evidence dossier, as data (W121, legacy oe_control_environment_audit).
//
// A control owner defines a control, documents its design, completes a
// walkthrough, then runs the two-test cycle every ICFR framework requires:
// Test of Design (plan → collect evidence → execute) followed by Test of
// Operating Effectiveness (plan → collect evidence → execute). The result
// feeds a deficiency assessment; a clean or remediated control is archived
// with sign-off, an unremediated one is flagged deficient (terminal — the
// control has failed audit).
//
// Structural honesty (no invented guards):
//  - `archive` is the ONLY edge into the terminal `archived` state, and it
//    only fires from `remediation_completed` — so a control can NEVER be
//    archived without having passed through deficiency assessment and
//    remediation. The state graph enforces the audit trail, no guard needed.
//  - `archive` is guarded by completenessEvidencePresent: closing a control
//    dossier needs a named completeness/sign-off reference, same shape as a
//    licence-completeness sign-off the registry guard was built for.
//  - `open` is guarded by complianceHaltClear: no new control audits may be
//    opened while the platform is under a compliance halt.
//  - `suspend` (a hold) and `flag_deficient` (a rejection — the control
//    failed) carry requiresReason; `accept_with_exception` does not — it is
//    an acceptance of residual risk, not a rejection/cancellation/hold, so
//    per contract it stays a free-text `exception_reason` input field.
//  - `assess_deficiency` also accepts `suspended` as a from-state: resuming
//    a paused audit re-enters at the assessment step, matching the legacy
//    TRANSITIONS map (no separate "resume" edge exists in v1).
//
// settles:false — a control-environment audit is a governance/evidence
// record. It never moves money and never posts margin (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

// v1 ALL_NON_TERMINAL / EXCEPT_FROM / SUSPEND_FROM / RE_TEST_FROM sets
// (control-environment-audit-spec.ts) — kept as named constants so the
// transition `from` arrays below read the same way the legacy spec does.
const ALL_NON_TERMINAL = [
  'control_defined', 'design_documented', 'walkthrough_completed',
  'tod_test_planned', 'tod_evidence_collected', 'tod_test_executed',
  'tooe_test_planned', 'tooe_evidence_collected', 'tooe_test_executed',
  'deficiency_assessed', 'remediation_completed', 'excepted', 'suspended',
  'remediated_re_test',
];
const EXCEPT_FROM = [
  'design_documented', 'walkthrough_completed', 'tod_test_planned',
  'tod_evidence_collected', 'tod_test_executed', 'tooe_test_planned',
  'tooe_evidence_collected', 'tooe_test_executed', 'deficiency_assessed',
  'remediation_completed',
];
const SUSPEND_FROM = EXCEPT_FROM;
const RE_TEST_FROM = [
  'tod_test_executed', 'tooe_test_executed', 'deficiency_assessed',
  'remediation_completed', 'remediated_re_test',
];

export const controlEnvironmentAudit: ChainDecl = {
  key: 'control_environment_audit',
  noun: 'Control-environment audit',
  refPrefix: 'CEA',
  title: (f) =>
    `Control audit — ${(f.period_label as string) ?? 'unlabelled period'} (${(f.control_classification as string) ?? 'unclassified'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'POPIA', provision: 's19 security safeguards — reasonable technical & organisational measures', effect: 'requires' },
    { instrument: 'JSE-SRL', provision: '8.62 listed-entity control-environment attestation', effect: 'requires' },
  ],
  roles: ['admin', 'regulator'],

  fields: {
    period_label: { type: 'string', required: true, label: 'Audit period' },
    control_classification: { type: 'string', label: 'Classification (preventive/detective/corrective/directive/governance)' },
    control_framework: { type: 'string', label: 'Framework (coso_2013/soc2_tsc/iso27001_2022/sox_404/popia/jse_srl_862/...)' },
    framework_control_ref: { type: 'string', label: 'Framework control reference' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    material_weakness_suspected: { type: 'boolean', label: 'Material weakness suspected' },
    regulator_audit_in_progress: { type: 'boolean', label: 'Regulator audit in progress' },
    soc2_type2_period_open: { type: 'boolean', label: 'SOC 2 Type II period open' },
    iso27001_surveillance_audit_due: { type: 'boolean', label: 'ISO 27001 surveillance audit due' },
    sox_404_attestation_pending: { type: 'boolean', label: 'SOX 404 attestation pending' },
    tod_sample_size: { type: 'number', min: 0, label: 'Test-of-Design sample size' },
    tooe_sample_size: { type: 'number', min: 0, label: 'Test-of-Operating-Effectiveness sample size' },
    deficiency_severity: { type: 'string', label: 'Deficiency severity (none/control_deficiency/significant_deficiency/material_weakness)' },
    remediation_progress_pct: { type: 'number', min: 0, max: 100, label: 'Remediation progress %' },
    exception_reason: { type: 'string', label: 'Exception rationale' },
    completeness_ref: { type: 'string', label: 'Completeness / sign-off evidence ref' },
    external_auditor_sign_off: { type: 'boolean', label: 'External auditor sign-off' },
    // written by derive, never by the client
    control_defined_at: { type: 'string', label: 'Control defined at' },
    design_documented_at: { type: 'string', label: 'Design documented at' },
    walkthrough_completed_at: { type: 'string', label: 'Walkthrough completed at' },
    tod_test_planned_at: { type: 'string', label: 'ToD test planned at' },
    tod_evidence_collected_at: { type: 'string', label: 'ToD evidence collected at' },
    tod_test_executed_at: { type: 'string', label: 'ToD test executed at' },
    tooe_test_planned_at: { type: 'string', label: 'ToOE test planned at' },
    tooe_evidence_collected_at: { type: 'string', label: 'ToOE evidence collected at' },
    tooe_test_executed_at: { type: 'string', label: 'ToOE test executed at' },
    deficiency_assessed_at: { type: 'string', label: 'Deficiency assessed at' },
    remediation_completed_at: { type: 'string', label: 'Remediation completed at' },
    archived_at: { type: 'string', label: 'Archived at' },
    deficient_at: { type: 'string', label: 'Flagged deficient at' },
    excepted_at: { type: 'string', label: 'Accepted with exception at' },
    suspended_at: { type: 'string', label: 'Suspended at' },
    remediated_re_test_at: { type: 'string', label: 'Re-test initiated at' },
  },

  initial: 'control_defined',

  states: {
    control_defined: { label: 'Control defined', terminal: false, holder: 'admin' },
    design_documented: { label: 'Design documented', terminal: false, holder: 'admin' },
    walkthrough_completed: { label: 'Walkthrough completed', terminal: false, holder: 'admin' },
    tod_test_planned: { label: 'ToD test planned', terminal: false, holder: 'admin' },
    tod_evidence_collected: { label: 'ToD evidence collected', terminal: false, holder: 'admin' },
    tod_test_executed: { label: 'ToD test executed', terminal: false, holder: 'admin' },
    tooe_test_planned: { label: 'ToOE test planned', terminal: false, holder: 'admin' },
    tooe_evidence_collected: { label: 'ToOE evidence collected', terminal: false, holder: 'admin' },
    tooe_test_executed: { label: 'ToOE test executed', terminal: false, holder: 'admin' },
    deficiency_assessed: { label: 'Deficiency assessed', terminal: false, holder: 'admin' },
    remediation_completed: { label: 'Remediation completed', terminal: false, holder: 'admin' },
    excepted: { label: 'Accepted with exception', terminal: false, holder: 'admin' },
    suspended: { label: 'Suspended', terminal: false, holder: 'admin' },
    remediated_re_test: { label: 'Remediated — awaiting re-test', terminal: false, holder: 'admin' },
    archived: { label: 'Archived', terminal: true, holder: 'none' },
    deficient: { label: 'Deficient', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'control_defined',
      by: ['admin'],
      actorBecomes: 'admin',
      label: 'Define control',
      intent: 'primary',
      input: {
        period_label: { type: 'string', required: true },
        control_classification: { type: 'string' },
        control_framework: { type: 'string' },
        framework_control_ref: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // no new control audits may open while the platform is under a
      // compliance halt (POPIA / NERSA directive).
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ control_defined_at: isoUtc(at) }),
    },
    {
      id: 'document_design',
      from: ['control_defined', 'design_documented'],
      to: 'design_documented',
      by: ['admin'],
      label: 'Document design',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ design_documented_at: isoUtc(at) }),
    },
    {
      id: 'complete_walkthrough',
      from: ['design_documented', 'walkthrough_completed'],
      to: 'walkthrough_completed',
      by: ['admin'],
      label: 'Complete walkthrough',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ walkthrough_completed_at: isoUtc(at) }),
    },
    {
      id: 'plan_tod_test',
      from: ['walkthrough_completed', 'tod_test_planned'],
      to: 'tod_test_planned',
      by: ['admin'],
      label: 'Plan ToD test',
      intent: 'primary',
      input: { tod_sample_size: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ tod_test_planned_at: isoUtc(at) }),
    },
    {
      id: 'collect_tod_evidence',
      from: ['tod_test_planned', 'tod_evidence_collected'],
      to: 'tod_evidence_collected',
      by: ['admin'],
      label: 'Collect ToD evidence',
      intent: 'primary',
      input: { tod_sample_size: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ tod_evidence_collected_at: isoUtc(at) }),
    },
    {
      id: 'execute_tod_test',
      from: ['tod_evidence_collected', 'tod_test_executed'],
      to: 'tod_test_executed',
      by: ['admin'],
      label: 'Execute ToD test',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ tod_test_executed_at: isoUtc(at) }),
    },
    {
      id: 'plan_tooe_test',
      from: ['tod_test_executed', 'tooe_test_planned', 'remediated_re_test'],
      to: 'tooe_test_planned',
      by: ['admin'],
      label: 'Plan ToOE test',
      intent: 'primary',
      input: { tooe_sample_size: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ tooe_test_planned_at: isoUtc(at) }),
    },
    {
      id: 'collect_tooe_evidence',
      from: ['tooe_test_planned', 'tooe_evidence_collected'],
      to: 'tooe_evidence_collected',
      by: ['admin'],
      label: 'Collect ToOE evidence',
      intent: 'primary',
      input: { tooe_sample_size: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ tooe_evidence_collected_at: isoUtc(at) }),
    },
    {
      id: 'execute_tooe_test',
      from: ['tooe_evidence_collected', 'tooe_test_executed'],
      to: 'tooe_test_executed',
      by: ['admin'],
      label: 'Execute ToOE test',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ tooe_test_executed_at: isoUtc(at) }),
    },
    {
      // 'suspended' is included here (not a separate resume edge) — matches
      // the legacy TRANSITIONS map, where resuming a paused audit re-enters
      // at the assessment step.
      id: 'assess_deficiency',
      from: ['tooe_test_executed', 'deficiency_assessed', 'suspended'],
      to: 'deficiency_assessed',
      by: ['admin'],
      label: 'Assess deficiency',
      intent: 'primary',
      input: { deficiency_severity: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ deficiency_assessed_at: isoUtc(at) }),
    },
    {
      id: 'complete_remediation',
      from: ['deficiency_assessed', 'remediation_completed'],
      to: 'remediation_completed',
      by: ['admin'],
      label: 'Complete remediation',
      intent: 'primary',
      input: { remediation_progress_pct: { type: 'number', min: 0, max: 100 } },
      guards: [],
      derive: (_f, at: Instant) => ({ remediation_completed_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into the terminal archived state, and only reachable
      // from remediation_completed — a control can never archive without
      // having gone through deficiency assessment + remediation.
      id: 'archive',
      from: 'remediation_completed',
      to: 'archived',
      by: ['admin'],
      label: 'Archive',
      intent: 'primary',
      input: {
        external_auditor_sign_off: { type: 'boolean' },
        completeness_ref: { type: 'string' },
      },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ archived_at: isoUtc(at) }),
    },

    // --- exits -----------------------------------------------------------
    {
      id: 'flag_deficient',
      from: ALL_NON_TERMINAL,
      to: 'deficient',
      by: ['admin'],
      label: 'Flag deficient',
      intent: 'destructive',
      requiresReason: [
        'material_weakness_confirmed',
        'significant_deficiency_unremediated',
        'design_deficiency',
        'operating_effectiveness_failure',
        'segregation_of_duties_failure',
        'regulatory_directive',
      ],
      guards: [],
      derive: (_f, at: Instant) => ({ deficient_at: isoUtc(at) }),
    },
    {
      id: 'accept_with_exception',
      from: EXCEPT_FROM,
      to: 'excepted',
      by: ['admin'],
      label: 'Accept with exception',
      intent: 'secondary',
      input: { exception_reason: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ excepted_at: isoUtc(at) }),
    },
    {
      id: 'suspend',
      from: SUSPEND_FROM,
      to: 'suspended',
      by: ['admin'],
      label: 'Suspend control',
      intent: 'destructive',
      input: { regulator_audit_in_progress: { type: 'boolean' } },
      requiresReason: [
        'regulator_audit_in_progress',
        'awaiting_remediation_owner',
        'resource_constraint',
        'system_change_freeze',
        'scope_change',
      ],
      guards: [],
      derive: (_f, at: Instant) => ({ suspended_at: isoUtc(at) }),
    },
    {
      id: 'initiate_re_test',
      from: RE_TEST_FROM,
      to: 'remediated_re_test',
      by: ['admin'],
      label: 'Initiate re-test',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ remediated_re_test_at: isoUtc(at) }),
    },
  ],
};
