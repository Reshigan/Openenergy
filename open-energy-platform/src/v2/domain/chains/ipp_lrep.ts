// ipp_lrep — IPP lender reporting cycle as data (oe_ipp_lender_reporting).
//
// Project-finance information covenant: an IPP developer compiles the
// periodic reporting package (quarterly / semi-annual / annual / drawdown)
// and submits it to the facility agent bank; the agent bank's acknowledgement
// closes the cycle. Two exits off the same submitted state: the bank raises a
// dispute over the package content, or the cycle surfaces an information
// covenant breach outright (feeds the W45 loan-default chain downstream —
// not modelled here, R-S5-1 keeps this chain record-only).
//
// Legacy parity note (chain-registry-meridian.ts ipp_lrep): every v1 action's
// roles array is exactly ['admin', 'ipp_developer'] — the agent bank is a
// descriptive field (agent_bank, free text), not a modelled txn party, so no
// lender role/guard is introduced here (same shape as ipp_ael's authority).
//
// package_submitted left unacknowledged past its SLA auto-raises a dispute —
// an unresponded lender package is itself a reporting-cycle risk signal.
//
// settles:false — a lender reporting cycle is a covenant/disclosure record,
// never a payment (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippLrep: ChainDecl = {
  key: 'ipp_lrep',
  noun: 'IPP lender report',
  refPrefix: 'LREP',
  title: (f) =>
    `Lender report — ${(f.project_ref as string) ?? 'project'} (${(f.report_period as string) ?? 'period TBC'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Facility Agreement lender information covenants', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'admin'],

  fields: {
    project_ref: { type: 'string', required: true, label: 'Project reference' },
    report_period: { type: 'string', label: 'Reporting period' },
    lender_count: { type: 'number', min: 0, label: 'Number of lenders' },
    report_type: { type: 'string', label: 'Report type' },
    agent_bank: { type: 'string', label: 'Agent bank' },
    due_date: { type: 'string', label: 'Contractual due date' },
    notes: { type: 'string', label: 'Notes' },
    dispute_basis: { type: 'string', label: 'Dispute basis' },
    breach_basis: { type: 'string', label: 'Breach basis' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Submitted to agent bank at' },
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    disputed_at: { type: 'string', label: 'Disputed at' },
    breach_declared_at: { type: 'string', label: 'Breach declared at' },
  },

  initial: 'package_drafted',

  states: {
    package_drafted: { label: 'Package drafted', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    package_submitted: { label: 'Submitted to agent bank', terminal: false, holder: 'admin', sla: { days: 30 } },
    package_acknowledged: { label: 'Package acknowledged', terminal: true, holder: 'none' },
    package_disputed: { label: 'Package disputed', terminal: true, holder: 'none' },
    covenant_breach: { label: 'Covenant breach declared', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'package_drafted',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Draft lender reporting package',
      intent: 'primary',
      input: {
        project_ref: { type: 'string', required: true },
        report_period: { type: 'string' },
        lender_count: { type: 'number', min: 0 },
        report_type: { type: 'string' },
        agent_bank: { type: 'string' },
        due_date: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'submit_to_agent_bank',
      from: 'package_drafted',
      to: 'package_submitted',
      by: ['admin', 'ipp_developer'],
      label: 'Submit to agent bank',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'confirm_acknowledged',
      from: 'package_submitted',
      to: 'package_acknowledged',
      by: ['admin', 'ipp_developer'],
      label: 'Confirm acknowledged',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      // also the SLA time-bar's fire edge (below): an agent bank that never
      // responds is itself a dispute-worthy signal, so 'system' joins the
      // human actors and no field on this edge is required.
      id: 'raise_dispute',
      from: 'package_submitted',
      to: 'package_disputed',
      by: ['admin', 'ipp_developer', 'system'],
      label: 'Raise dispute',
      intent: 'destructive',
      input: { dispute_basis: { type: 'string' } },
      requiresReason: ['data_discrepancy', 'missing_schedule', 'format_non_compliant', 'covenant_calculation_dispute', 'response_overdue'],
      guards: [],
      derive: (_f, at: Instant) => ({ disputed_at: isoUtc(at) }),
    },
    {
      id: 'declare_covenant_breach',
      from: 'package_submitted',
      to: 'covenant_breach',
      by: ['admin', 'ipp_developer'],
      label: 'Declare covenant breach',
      intent: 'destructive',
      input: { breach_basis: { type: 'string' } },
      requiresReason: ['financial_covenant_breach', 'informational_covenant_breach', 'reporting_deadline_missed', 'material_adverse_change'],
      guards: [],
      derive: (_f, at: Instant) => ({ breach_declared_at: isoUtc(at) }),
    },
  ],

  // agent-bank non-response SLA: a package left unacknowledged for 30 days
  // auto-raises a dispute (audit_chain / ppa_contract time-bar pattern).
  timers: [{ onState: 'package_submitted', after: { days: 30 }, fire: 'raise_dispute', kind: 'sla', reason: 'response_overdue' }],
};
