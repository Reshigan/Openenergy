// ipp_qgr — IPP quarterly generation & O&M report as a first-class transaction
// (DMRE REIPPPP Implementation Agreement Sched 3 §4.2).
//
// An IPP drafts the quarter's generation numbers (MWh contracted vs actual,
// availability, capacity factor, ED/SED spend), submits to the DMRE IPP
// Office, and the office either accepts (compliance certificate issued),
// rejects (breach recorded — always notifies the regulator, at every plant
// tier), or the window lapses unattended.
//
// A major/flagship plant (>=100 MW) lapsing crosses to the regulator:
// declare_lapsed is guarded by regulatorPresentIfStrategic, matching the v1
// "major/flagship plants cross the regulator inbox" cascade note. reject_report
// notifies the regulator on EVERY tier (unconditional cascade, not a guard —
// there is no "always" guard in the registry, and gating completion on a
// pre-existing regulator party would be wrong when every tier must notify).
//
// The v1 descriptor's `sla_deadline` is inverted by plant MW (bigger plant,
// shorter window) — a per-row computed deadline, not a fixed Duration. No
// TimerDecl here: a single fixed `after` would misrepresent that rule, and
// the plan says omit timers when not fully confident (safe default).
//
// settles:false — a generation report is a compliance record (quantumCol is
// null in v1); no money or quantum moves here.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippQgr: ChainDecl = {
  key: 'ipp_qgr',
  noun: 'IPP quarterly generation report',
  refPrefix: 'QGR',
  title: (f) =>
    `QGR ${(f.quarter as string) ?? 'unknown quarter'} — ${(f.project_id as string) ?? 'project'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    {
      instrument: 'REIPPPP',
      provision: 'Implementation Agreement Schedule 3 §4.2 — quarterly generation & O&M reporting',
      effect: 'requires',
    },
  ],
  roles: ['ipp_developer', 'regulator', 'admin'],

  fields: {
    qgr_number: { type: 'string', label: 'QGR number' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    quarter: { type: 'string', required: true, label: 'Reporting quarter' },
    report_period_start: { type: 'string', required: true, label: 'Report period start' },
    report_period_end: { type: 'string', required: true, label: 'Report period end' },
    project_id: { type: 'string', label: 'Project' },
    capacity_mw: { type: 'number', required: true, min: 0, label: 'Project capacity (MW)' },
    mwh_contracted: { type: 'number', min: 0, label: 'MWh contracted (qtr)' },
    mwh_actual: { type: 'number', min: 0, label: 'MWh actual (qtr)' },
    availability_pct: { type: 'number', min: 0, max: 100, label: 'Availability (%)' },
    capacity_factor_pct: { type: 'number', min: 0, max: 100, label: 'Capacity factor (%)' },
    ed_spend_qtd_zar: { type: 'number', min: 0, label: 'ED spend QTD (ZAR)' },
    sed_spend_qtd_zar: { type: 'number', min: 0, label: 'SED spend QTD (ZAR)' },
    notes: { type: 'string', label: 'Notes' },
    // derive-stamped timestamps
    submitted_at: { type: 'string', label: 'Submitted at' },
    accepted_at: { type: 'string', label: 'Accepted at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    lapsed_at: { type: 'string', label: 'Lapsed at' },
  },

  initial: 'report_drafted',

  states: {
    report_drafted: { label: 'Report drafted', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    submitted_to_ipp_office: { label: 'Submitted to IPP Office', terminal: false, holder: 'ipp_developer' },
    report_accepted: { label: 'Report accepted', terminal: true, holder: 'none' },
    report_rejected: { label: 'Report rejected', terminal: true, holder: 'none' },
    report_lapsed: { label: 'Report lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'report_drafted',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Draft quarterly generation report',
      intent: 'primary',
      input: {
        quarter: { type: 'string', required: true },
        report_period_start: { type: 'string', required: true },
        report_period_end: { type: 'string', required: true },
        project_id: { type: 'string' },
        capacity_mw: { type: 'number', required: true, min: 0 },
        mwh_contracted: { type: 'number', min: 0 },
        mwh_actual: { type: 'number', min: 0 },
        availability_pct: { type: 'number', min: 0, max: 100 },
        capacity_factor_pct: { type: 'number', min: 0, max: 100 },
        ed_spend_qtd_zar: { type: 'number', min: 0 },
        sed_spend_qtd_zar: { type: 'number', min: 0 },
        notes: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'submit_to_ipp_office',
      from: 'report_drafted',
      to: 'submitted_to_ipp_office',
      by: ['ipp_developer', 'admin'],
      label: 'Submit to IPP Office',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'accept_report',
      from: 'submitted_to_ipp_office',
      to: 'report_accepted',
      by: ['ipp_developer', 'admin'],
      label: 'Accept report',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },
    {
      id: 'reject_report',
      from: 'submitted_to_ipp_office',
      to: 'report_rejected',
      by: ['ipp_developer', 'admin'],
      label: 'Reject report',
      intent: 'destructive',
      input: { notes: { type: 'string' } },
      // W187 signature: rejection crosses the regulator inbox on EVERY tier —
      // an unconditional cascade, not a guard (no "always" gate in the registry).
      requiresReason: ['data_incomplete', 'mwh_variance_unexplained', 'evidence_missing', 'late_submission', 'format_non_compliant'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      // major/flagship (>=100 MW) plants cross to the regulator on lapse.
      id: 'declare_lapsed',
      from: 'submitted_to_ipp_office',
      to: 'report_lapsed',
      by: ['ipp_developer', 'admin'],
      label: 'Declare lapsed',
      intent: 'destructive',
      input: { notes: { type: 'string' } },
      requiresReason: ['submission_window_missed', 'ipp_non_response', 'data_never_provided'],
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ lapsed_at: isoUtc(at) }),
    },
  ],
};
