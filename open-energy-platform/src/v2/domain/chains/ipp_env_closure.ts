// ipp_env_closure — IPP Environmental Compliance Closure & NEMA Closure
// Certificate, as data. NEMA 107/1998 §24G + EIA Regulations 2014 (GN R982).
//
// An IPP runs its own EMP compliance audit (inspection → report → stakeholder
// review), resolves any remediation the audit turns up, recommends closure,
// then lodges the closure application with DFFE/NEMA and records the
// regulator's outcome (closure certificate or rejection). Legacy (v1) has a
// single write role (ipp_developer, self-reporting the whole spine including
// the NEMA outcome) — there is no regulator *actor* on this txn, only a
// notification crossing (issue_closure_cert is reportable at every tier,
// reject_application only at major/material tier). We keep that shape: the
// regulator is an optional party a filer can attach for the record, never a
// gating one — inventing a blocking regulator-presence guard here would be
// less faithful to source, not more.
//
// The temporal spine is structural: nema_commence_review is reachable ONLY
// from nema_submission, and closure/rejection are reachable ONLY from
// nema_review — you can't get a NEMA outcome on an application that was never
// lodged. No guard needed, the state graph forbids it.
//
// v1's `flag_sla_breach` action is a self-loop (status unchanged, just a flag
// + cascade notice) — there's no state-changing edge to hang it on, so it's
// left out; the platform-wide SLA sweep still owns breach detection.
//
// settles:false — an environmental closure record moves no money (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure area-tier bucketing off disturbed hectares (INVERTED SLA driver in v1 —
// larger footprint, more regulatory scrutiny). No clock, no env.
const AREA_TIER_THRESHOLDS: Array<[string, number]> = [
  ['material', 500],
  ['major', 200],
  ['significant', 50],
  ['moderate', 5],
  ['minor', 0],
];

const deriveAreaTier = (ha: Json | undefined): string => {
  const n = typeof ha === 'number' ? ha : 0;
  for (const [tier, threshold] of AREA_TIER_THRESHOLDS) {
    if (n >= threshold) return tier;
  }
  return 'minor';
};

export const ippEnvClosure: ChainDecl = {
  key: 'ipp_env_closure',
  noun: 'IPP environmental closure',
  refPrefix: 'IEC',
  title: (f) => `Env closure — ${(f.project_id as string) ?? 'project'} (${(f.area_tier as string) ?? 'tier n/a'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NEMA 107/1998', provision: '§24G environmental compliance closure + EIA Regulations 2014 (GN R982)', effect: 'requires' },
    { instrument: 'REIPPPP', provision: 'IPP environmental management programme (EMP) compliance', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'auditor', 'regulator', 'operator'],

  fields: {
    project_id: { type: 'string', required: true, label: 'Project' },
    disturbed_area_ha: { type: 'number', required: true, min: 0, label: 'Disturbed area (ha)' },
    area_tier: { type: 'string', label: 'Area tier' },
    eia_category: { type: 'string', label: 'EIA category' },
    ea_reference: { type: 'string', label: 'Environmental authorisation reference' },
    emp_reference: { type: 'string', label: 'EMP reference' },
    auditor_party: { type: 'party', role: 'auditor', label: 'EMP compliance auditor' },
    regulator_party: { type: 'party', role: 'regulator', label: 'DFFE / NEMA reviewer' },
    description: { type: 'string', label: 'Description' },
    remediation_notes: { type: 'string', label: 'Remediation required narrative' },
    cert_reference: { type: 'string', label: 'NEMA closure certificate reference' },
    // derive-stamped milestone timestamps, never client-set
    inspection_started_at: { type: 'string', label: 'Inspection started at' },
    audit_report_at: { type: 'string', label: 'Audit report drafted at' },
    stakeholder_review_at: { type: 'string', label: 'Stakeholder review commenced at' },
    remediation_required_at: { type: 'string', label: 'Remediation required at' },
    remediation_complete_at: { type: 'string', label: 'Remediation completed at' },
    closure_recommended_at: { type: 'string', label: 'Closure recommended at' },
    nema_submitted_at: { type: 'string', label: 'NEMA submission lodged at' },
    nema_review_at: { type: 'string', label: 'NEMA review commenced at' },
    closure_issued_at: { type: 'string', label: 'Closure certificate issued at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
  },

  initial: 'emp_audit_initiated',

  states: {
    emp_audit_initiated: { label: 'EMP audit initiated', terminal: false, holder: 'ipp_developer' },
    site_inspection: { label: 'Site inspection', terminal: false, holder: 'ipp_developer' },
    audit_report_drafted: { label: 'Audit report drafted', terminal: false, holder: 'ipp_developer' },
    stakeholder_review: { label: 'Stakeholder review', terminal: false, holder: 'ipp_developer' },
    remediation_required: { label: 'Remediation required', terminal: false, holder: 'ipp_developer' },
    remediation_complete: { label: 'Remediation complete', terminal: false, holder: 'ipp_developer' },
    closure_recommended: { label: 'Closure recommended', terminal: false, holder: 'ipp_developer' },
    nema_submission: { label: 'NEMA submission lodged', terminal: false, holder: 'ipp_developer' },
    nema_review: { label: 'NEMA review', terminal: false, holder: 'ipp_developer' },
    closure_issued: { label: 'Closure certificate issued', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected by NEMA', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'emp_audit_initiated',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Open EMP compliance audit',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        disturbed_area_ha: { type: 'number', required: true, min: 0 },
        eia_category: { type: 'string' },
        ea_reference: { type: 'string' },
        emp_reference: { type: 'string' },
        description: { type: 'string' },
        auditor_party: { type: 'party', role: 'auditor' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ area_tier: deriveAreaTier(f.disturbed_area_ha) }),
    },
    {
      id: 'commence_inspection',
      from: 'emp_audit_initiated',
      to: 'site_inspection',
      by: ['ipp_developer', 'operator'],
      label: 'Commence site inspection',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ inspection_started_at: isoUtc(at) }),
    },
    {
      id: 'draft_report',
      from: 'site_inspection',
      to: 'audit_report_drafted',
      by: ['ipp_developer', 'operator'],
      label: 'Draft audit report',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ audit_report_at: isoUtc(at) }),
    },
    {
      id: 'commence_stakeholder_review',
      from: 'audit_report_drafted',
      to: 'stakeholder_review',
      by: ['ipp_developer', 'operator'],
      label: 'Commence stakeholder review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ stakeholder_review_at: isoUtc(at) }),
    },
    {
      id: 'raise_remediation',
      from: 'stakeholder_review',
      to: 'remediation_required',
      by: ['ipp_developer', 'operator'],
      label: 'Raise remediation',
      intent: 'secondary',
      input: { remediation_notes: { type: 'string', required: true } },
      requiresReason: ['rehabilitation_incomplete', 'water_management_non_conformance', 'waste_management_non_conformance', 'vegetation_clearing_non_conformance', 'heritage_resources_impact', 'biodiversity_offset_shortfall', 'monitoring_non_compliance'],
      guards: [],
      derive: (_f, at: Instant) => ({ remediation_required_at: isoUtc(at) }),
    },
    {
      id: 'confirm_remediation',
      from: 'remediation_required',
      to: 'remediation_complete',
      by: ['ipp_developer', 'operator'],
      label: 'Confirm remediation complete',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ remediation_complete_at: isoUtc(at) }),
    },
    {
      // reachable from either a clean stakeholder review or a resolved
      // remediation — matches v1's two-path VALID_TRANSITIONS into
      // closure_recommended.
      id: 'recommend_closure',
      from: ['stakeholder_review', 'remediation_complete'],
      to: 'closure_recommended',
      by: ['ipp_developer', 'operator'],
      label: 'Recommend closure',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closure_recommended_at: isoUtc(at) }),
    },
    {
      id: 'submit_to_nema',
      from: 'closure_recommended',
      to: 'nema_submission',
      by: ['ipp_developer', 'operator'],
      label: 'Submit to NEMA',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ nema_submitted_at: isoUtc(at) }),
    },
    {
      id: 'nema_commence_review',
      from: 'nema_submission',
      to: 'nema_review',
      by: ['ipp_developer', 'operator'],
      label: 'NEMA commences review',
      intent: 'primary',
      input: { regulator_party: { type: 'party', role: 'regulator' } },
      guards: [],
      derive: (_f, at: Instant) => ({ nema_review_at: isoUtc(at) }),
    },
    {
      // environmental COD gate — every tier crosses to the regulator in v1
      // (notification, not a blocking presence check; see file header).
      id: 'issue_closure_cert',
      from: 'nema_review',
      to: 'closure_issued',
      by: ['ipp_developer', 'operator'],
      label: 'Issue closure certificate',
      intent: 'primary',
      input: { cert_reference: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ closure_issued_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_application',
      from: 'nema_review',
      to: 'rejected',
      by: ['ipp_developer', 'operator'],
      label: 'Reject application',
      intent: 'destructive',
      requiresReason: ['incomplete_documentation', 'non_compliance_findings', 'unresolved_objections', 'emp_deviation', 'nema_referral_failed'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['emp_audit_initiated', 'site_inspection', 'audit_report_drafted', 'stakeholder_review', 'remediation_required', 'remediation_complete', 'closure_recommended', 'nema_submission'],
      to: 'withdrawn',
      by: ['ipp_developer', 'operator'],
      label: 'Withdraw application',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'developer_withdrawal', 'duplicate_application', 'superseded_authorisation'],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
  ],
};
