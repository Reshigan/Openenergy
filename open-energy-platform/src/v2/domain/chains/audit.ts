// audit — compliance / assurance audit engagement lifecycle as data.
//
// An auditor opens an engagement against an auditee, runs fieldwork, issues
// findings, receives a management response + remediation plan, verifies the
// remediation, then closes. The assurance spine is STRUCTURAL: close_audit
// leaves ONLY `verified`, and the ONLY path into `verified` is
// verify_remediation (from `remediation`, which only accept_response reaches).
// So an audit with findings can NEVER be closed while those findings are
// unremediated — no guard needed, the state graph enforces it.
//
// Critical-priority engagements cross to the regulator: issue_findings is
// guarded by regulatorPresentIfCritical. Closure needs a named completeness
// evidence ref (completenessEvidencePresent) — you cannot sign off an audit
// on nothing.
//
// settles:false — an audit is an assurance control, never a payment (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const audit: ChainDecl = {
  key: 'audit',
  noun: 'Audit',
  refPrefix: 'AUDI',
  title: (f) => `${(f.standard as string) ?? 'Compliance'} audit — ${(f.audit_scope as string) ?? 'scope TBD'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'licensee compliance monitoring & audit', effect: 'requires' },
    { instrument: 'Companies Act 2008', provision: 's94 audit committee assurance', effect: 'requires' },
  ],
  roles: ['auditor', 'auditee', 'regulator', 'operator'],

  fields: {
    audit_ref: { type: 'string', label: 'Audit reference' },
    auditor_party: { type: 'party', role: 'auditor', label: 'Auditor' },
    auditee_party: { type: 'party', role: 'auditee', label: 'Auditee' },
    audit_scope: { type: 'string', required: true, label: 'Scope' },
    standard: { type: 'string', label: 'Standard / framework' },
    priority: { type: 'string', label: 'Priority (routine/elevated/critical)' },
    finding_count: { type: 'number', min: 0, label: 'Findings raised' },
    severity: { type: 'string', label: 'Highest finding severity' },
    management_response: { type: 'string', label: 'Management response' },
    remediation_plan: { type: 'string', label: 'Remediation plan' },
    completeness_ref: { type: 'string', label: 'Completeness evidence ref' },
    rework_count: { type: 'number', label: 'Times returned for rework' },
    // written by derive, never by the client
    fieldwork_started_at: { type: 'string', label: 'Fieldwork started at' },
    findings_issued_at: { type: 'string', label: 'Findings issued at' },
    closed_at_audit: { type: 'string', label: 'Audit closed at' },
  },

  initial: 'planned',

  states: {
    planned: { label: 'Planned', terminal: false, holder: 'auditor', sla: { hours: 24 } },
    fieldwork: { label: 'Fieldwork', terminal: false, holder: 'auditor', sla: { days: 5 } },
    findings_issued: { label: 'Findings issued', terminal: false, holder: 'auditee', sla: { days: 10 } },
    remediation: { label: 'Remediation', terminal: false, holder: 'auditee', sla: { days: 30 } },
    verified: { label: 'Remediation verified', terminal: false, holder: 'auditor', sla: { hours: 24 } },
    audit_closed: { label: 'Closed', terminal: true, holder: 'none' },
    audit_cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'planned',
      by: ['auditor', 'operator'],
      actorBecomes: 'auditor',
      label: 'Open audit',
      intent: 'primary',
      input: {
        audit_scope: { type: 'string', required: true },
        standard: { type: 'string' },
        priority: { type: 'string' },
        auditee_party: { type: 'party', role: 'auditee' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'start_fieldwork',
      from: 'planned',
      to: 'fieldwork',
      by: ['auditor'],
      label: 'Start fieldwork',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ fieldwork_started_at: isoUtc(at) }),
    },
    {
      id: 'issue_findings',
      from: 'fieldwork',
      to: 'findings_issued',
      by: ['auditor'],
      label: 'Issue findings',
      intent: 'primary',
      input: { finding_count: { type: 'number', min: 0 }, severity: { type: 'string' } },
      // critical-priority engagements cross to the regulator: one must be a party.
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ findings_issued_at: isoUtc(at) }),
    },
    {
      id: 'accept_response',
      from: 'findings_issued',
      to: 'remediation',
      by: ['auditor'],
      label: 'Accept management response',
      intent: 'primary',
      input: { management_response: { type: 'string', required: true }, remediation_plan: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'verify_remediation',
      from: 'remediation',
      to: 'verified',
      by: ['auditor'],
      label: 'Verify remediation',
      intent: 'primary',
      guards: [],
    },
    {
      // structural assurance gate: the ONLY edge into audit_closed, and it can
      // only fire from `verified` — which only verify_remediation reaches. An
      // audit therefore cannot close while findings are unremediated. The named
      // completeness evidence ref is required to sign off.
      id: 'close_audit',
      from: 'verified',
      to: 'audit_closed',
      by: ['auditor'],
      label: 'Close audit',
      intent: 'primary',
      // present-but-not-required so an absent ref surfaces the guard's
      // MISSING_COMPLETENESS_EVIDENCE, not a generic BAD_INPUT (Pattern A).
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ closed_at_audit: isoUtc(at) }),
    },

    // rework loop: auditor sends inadequate remediation back for more work.
    {
      id: 'return_for_rework',
      from: 'remediation',
      to: 'findings_issued',
      by: ['auditor'],
      label: 'Return for rework',
      intent: 'secondary',
      requiresReason: ['remediation_inadequate', 'evidence_insufficient', 'partial_completion'],
      guards: [],
      derive: (f, _at: Instant) => ({ rework_count: (typeof f.rework_count === 'number' ? f.rework_count : 0) + 1 }),
    },

    // --- exit -----------------------------------------------------------------
    {
      id: 'cancel_audit',
      from: ['planned', 'fieldwork', 'findings_issued', 'remediation', 'verified'],
      to: 'audit_cancelled',
      by: ['auditor', 'regulator'],
      label: 'Cancel audit',
      intent: 'destructive',
      requiresReason: ['scope_withdrawn', 'duplicate_engagement', 'regulator_directive', 'auditee_dissolved'],
      guards: [],
    },
  ],
};
