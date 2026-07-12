// export_curtailment — a grid operator's export-curtailment directive lifecycle
// as data. A system/transmission operator instructs a generator (IPP) to reduce
// its export to the grid because of a network constraint (thermal limit, voltage,
// system security). The generator acknowledges, begins curtailing, the window
// runs, export is restored, and only THEN is the curtailed energy quantified for
// downstream compensation.
//
// The measurement spine is structural: verify_curtailment (which quantifies the
// curtailed MWh) leaves ONLY `restored`, and the ONLY path into `restored` is
// `restore` out of an ACTIVE `curtailing` window. So curtailed energy can NEVER
// be booked while the curtailment is still in progress — the window must close
// first. No guard needed; the state graph enforces it.
//
// settles:false — a curtailment record is an operational/measurement notice, not
// a payment. Compensation for curtailed energy settles on a separate money chain
// (deemed-energy PPA settlement); this chain only produces the evidence (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure severity bucketing off the instructed reduction (MW). No clock, no env.
const severityTier = (mw: Json | undefined): string => {
  if (typeof mw !== 'number') return 'unassessed';
  if (mw >= 100) return 'major';
  if (mw >= 20) return 'moderate';
  return 'minor';
};

export const exportCurtailment: ChainDecl = {
  key: 'export_curtailment',
  noun: 'Export curtailment',
  refPrefix: 'EC',
  title: (f) =>
    `Export curtailment — ${(f.network_element as string) ?? 'unnamed element'} (${(f.curtailment_mw as number) ?? 0} MW)`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'System Operation Code — network constraint management', effect: 'authorises' },
    { instrument: 'NERSA Grid Code', provision: 'Network Code — dispatch instructions & curtailment', effect: 'requires' },
  ],
  roles: ['operator', 'generator', 'regulator'],

  fields: {
    directive_ref: { type: 'string', label: 'Directive ref' },
    operator_party: { type: 'party', role: 'operator', label: 'System operator' },
    generator_party: { type: 'party', role: 'generator', label: 'Generator' },
    network_element: { type: 'string', required: true, label: 'Constrained network element' },
    constraint_ref: { type: 'string', label: 'Constraint / study ref' },
    curtailment_reason: { type: 'string', required: true, label: 'Reason (thermal/voltage/system_security/planned_outage)' },
    pre_curtailment_mw: { type: 'number', min: 0, label: 'Baseline export (MW)' },
    curtailment_mw: { type: 'number', min: 0, required: true, label: 'Instructed reduction (MW)' },
    achieved_mw: { type: 'number', min: 0, label: 'Achieved reduction (MW)' },
    curtailed_mwh: { type: 'number', min: 0, label: 'Curtailed energy (MWh)' },
    compensation_basis: { type: 'string', label: 'Compensation basis (deemed_energy/metered/none)' },
    severity_tier: { type: 'string', label: 'Severity tier' },
    // written by derive, never by the client
    issued_at: { type: 'string', label: 'Directive issued at' },
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    curtail_start_at: { type: 'string', label: 'Curtailment started at' },
    restore_at: { type: 'string', label: 'Export restored at' },
    verified_at: { type: 'string', label: 'Curtailment verified at' },
    closed_at_ec: { type: 'string', label: 'Record closed at' },
  },

  initial: 'directive_issued',

  states: {
    directive_issued: { label: 'Directive issued', terminal: false, holder: 'generator', sla: { hours: 1 } },
    acknowledged: { label: 'Acknowledged', terminal: false, holder: 'generator', sla: { hours: 1 } },
    curtailing: { label: 'Curtailing', terminal: false, holder: 'generator' },
    restored: { label: 'Export restored', terminal: false, holder: 'operator', sla: { hours: 24 } },
    verified: { label: 'Curtailment verified', terminal: false, holder: 'operator', sla: { hours: 48 } },
    closed: { label: 'Record closed', terminal: true, holder: 'none' },
    disputed: { label: 'Disputed', terminal: true, holder: 'none' },
    cancelled: { label: 'Directive cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'directive_issued',
      by: ['operator'],
      actorBecomes: 'operator',
      label: 'Issue curtailment directive',
      intent: 'primary',
      input: {
        network_element: { type: 'string', required: true },
        constraint_ref: { type: 'string' },
        curtailment_reason: { type: 'string', required: true },
        pre_curtailment_mw: { type: 'number', min: 0 },
        curtailment_mw: { type: 'number', min: 0, required: true },
        generator_party: { type: 'party', role: 'generator' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, at: Instant) => ({ issued_at: isoUtc(at), severity_tier: severityTier(f.curtailment_mw) }),
    },
    {
      id: 'acknowledge',
      from: 'directive_issued',
      to: 'acknowledged',
      by: ['generator'],
      label: 'Acknowledge directive',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    {
      id: 'begin_curtailment',
      from: 'acknowledged',
      to: 'curtailing',
      by: ['generator'],
      label: 'Begin curtailment',
      intent: 'primary',
      input: { achieved_mw: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ curtail_start_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into `restored`, and it can only fire from an active
      // `curtailing` window. Closing the window is a precondition for booking
      // the curtailed energy (verify_curtailment leaves only `restored`).
      id: 'restore',
      from: 'curtailing',
      to: 'restored',
      by: ['operator', 'generator'],
      label: 'Restore export',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ restore_at: isoUtc(at) }),
    },
    {
      // structural measurement gate: curtailed energy can only be quantified once
      // the window has closed (from `restored`). It can NEVER be booked while
      // `curtailing` is still active. No guard — the graph enforces it.
      id: 'verify_curtailment',
      from: 'restored',
      to: 'verified',
      by: ['operator'],
      label: 'Verify curtailed energy',
      intent: 'primary',
      input: {
        curtailed_mwh: { type: 'number', min: 0, required: true },
        compensation_basis: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },
    {
      id: 'close',
      from: 'verified',
      to: 'closed',
      by: ['operator'],
      label: 'Close record',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_ec: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'dispute',
      from: ['directive_issued', 'acknowledged', 'curtailing', 'restored', 'verified'],
      to: 'disputed',
      by: ['generator'],
      label: 'Dispute directive',
      intent: 'destructive',
      requiresReason: ['no_network_constraint', 'baseline_incorrect', 'quantity_disputed', 'discriminatory_dispatch'],
      guards: [],
    },
    {
      id: 'cancel_directive',
      from: ['directive_issued', 'acknowledged', 'curtailing'],
      to: 'cancelled',
      by: ['operator'],
      label: 'Cancel directive',
      intent: 'destructive',
      requiresReason: ['constraint_cleared', 'issued_in_error', 'superseded', 'system_normalised'],
      guards: [],
    },
  ],

  // unacknowledged-directive SLA: a curtailment instruction left unacknowledged
  // is an operational risk. record-only stub; the sweep computes the real bar off
  // the state sla hours (ppa_contract pattern).
  timers: [{ onState: 'directive_issued', after: { hours: 0 }, fire: 'cancel_directive', kind: 'sla' }],
};
