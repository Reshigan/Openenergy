// compliance_inspection — NERSA regulatory compliance inspection lifecycle as data.
//
// A regulator opens an inspection against a licensee's facility, serves the
// statutory notice, conducts the inspection, issues findings, receives the
// licensee's response, and closes it — compliant, or referred to enforcement.
//
// The closure spine is structural: close_compliant leaves ONLY response_received,
// and the ONLY path into response_received is licensee_respond (from
// findings_issued). So an inspection can NEVER be closed compliant while findings
// sit unanswered — no guard needed, the state graph enforces it. Issuing findings
// is guarded by completenessEvidencePresent: a findings pack must carry a named
// completeness-evidence ref before it can be served on a licensee.
//
// settles:false — a regulatory inspection is a supervisory control, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure severity bucketing off the finding count. No clock, no env.
const severityTier = (count: Json | undefined): string => {
  if (typeof count !== 'number') return 'unassessed';
  if (count >= 5) return 'material';
  if (count >= 1) return 'minor';
  return 'clean';
};

export const complianceInspection: ChainDecl = {
  key: 'compliance_inspection',
  noun: 'Compliance inspection',
  refPrefix: 'COMP',
  title: (f) => `${(f.inspection_type as string) ?? 'routine'} inspection — ${(f.facility_name as string) ?? 'unnamed facility'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's34 inspection & investigation powers', effect: 'authorises' },
    { instrument: 'NERSA Grid Code', provision: 'licensee compliance monitoring', effect: 'requires' },
  ],
  roles: ['regulator', 'licensee', 'inspector', 'operator'],

  fields: {
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    licensee_party: { type: 'party', role: 'licensee', label: 'Licensee' },
    facility_name: { type: 'string', required: true, label: 'Facility' },
    licence_number: { type: 'string', label: 'Licence number' },
    inspection_type: { type: 'string', required: true, label: 'Type (routine/complaint_triggered/follow_up)' },
    scope: { type: 'string', required: true, label: 'Inspection scope' },
    scheduled_for: { type: 'string', label: 'Scheduled for' },
    notice_ref: { type: 'string', label: 'Statutory notice ref' },
    completeness_ref: { type: 'string', label: 'Findings completeness ref' },
    finding_count: { type: 'number', min: 0, label: 'Finding count' },
    severity_tier: { type: 'string', label: 'Severity tier' },
    remediation_ref: { type: 'string', label: 'Remediation plan ref' },
    // written by derive, never by the client
    notice_served_at: { type: 'string', label: 'Notice served at' },
    conducted_at: { type: 'string', label: 'Inspection conducted at' },
    findings_issued_at: { type: 'string', label: 'Findings issued at' },
    closed_at_comp: { type: 'string', label: 'Inspection closed at' },
  },

  initial: 'inspection_scheduled',

  states: {
    inspection_scheduled: { label: 'Inspection scheduled', terminal: false, holder: 'regulator', sla: { days: 7 } },
    notice_served: { label: 'Notice served', terminal: false, holder: 'licensee', sla: { days: 5 } },
    inspection_conducted: { label: 'Inspection conducted', terminal: false, holder: 'regulator', sla: { days: 3 } },
    findings_issued: { label: 'Findings issued', terminal: false, holder: 'licensee', sla: { days: 14 } },
    response_received: { label: 'Response received', terminal: false, holder: 'regulator', sla: { days: 5 } },
    closed_compliant: { label: 'Closed — compliant', terminal: true, holder: 'none' },
    referred_enforcement: { label: 'Referred to enforcement', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'inspection_scheduled',
      by: ['regulator', 'operator'],
      actorBecomes: 'regulator',
      label: 'Schedule inspection',
      intent: 'primary',
      input: {
        facility_name: { type: 'string', required: true },
        licence_number: { type: 'string' },
        inspection_type: { type: 'string', required: true },
        scope: { type: 'string', required: true },
        scheduled_for: { type: 'string' },
        licensee_party: { type: 'party', role: 'licensee' },
      },
      guards: [],
    },
    {
      id: 'serve_notice',
      from: 'inspection_scheduled',
      to: 'notice_served',
      by: ['regulator', 'inspector'],
      label: 'Serve statutory notice',
      intent: 'primary',
      input: { notice_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ notice_served_at: isoUtc(at) }),
    },
    {
      id: 'conduct_inspection',
      from: 'notice_served',
      to: 'inspection_conducted',
      by: ['regulator', 'inspector'],
      label: 'Conduct inspection',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ conducted_at: isoUtc(at) }),
    },
    {
      id: 'issue_findings',
      from: 'inspection_conducted',
      to: 'findings_issued',
      by: ['regulator'],
      label: 'Issue findings',
      intent: 'primary',
      // a findings pack must carry a named completeness-evidence ref before service.
      input: { finding_count: { type: 'number', min: 0 }, completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (f, at: Instant) => ({ findings_issued_at: isoUtc(at), severity_tier: severityTier(f.finding_count) }),
    },
    {
      // structural gate: the ONLY edge into response_received, and close_compliant
      // leaves ONLY response_received — so an inspection cannot be closed compliant
      // until the licensee has actually responded to the findings.
      id: 'licensee_respond',
      from: 'findings_issued',
      to: 'response_received',
      by: ['licensee', 'operator'],
      label: 'Submit licensee response',
      intent: 'primary',
      input: { remediation_ref: { type: 'string' } },
      guards: [],
    },
    {
      id: 'close_compliant',
      from: 'response_received',
      to: 'closed_compliant',
      by: ['regulator'],
      label: 'Close — compliant',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_comp: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'refer_enforcement',
      from: ['findings_issued', 'response_received'],
      to: 'referred_enforcement',
      by: ['regulator'],
      label: 'Refer to enforcement',
      intent: 'destructive',
      requiresReason: ['material_non_compliance', 'remediation_inadequate', 'repeat_offence', 'safety_risk'],
      guards: [],
    },
    {
      id: 'cancel',
      from: ['inspection_scheduled', 'notice_served'],
      to: 'cancelled',
      by: ['regulator'],
      label: 'Cancel inspection',
      intent: 'destructive',
      requiresReason: ['duplicate', 'facility_decommissioned', 'rescheduled', 'jurisdiction_transferred'],
      guards: [],
    },
  ],

  // findings-response time-bar: an issued findings pack left unanswered stales out
  // to an enforcement referral. record-only stub; the sweep computes the real bar
  // off the findings_issued state sla days (ppa_contract pattern).
  timers: [{ onState: 'findings_issued', after: { days: 0 }, fire: 'refer_enforcement', kind: 'time_bar' }],
};
