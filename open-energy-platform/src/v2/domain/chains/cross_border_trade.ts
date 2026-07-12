// cross_border_trade — SAPP cross-border energy trade lifecycle as data.
//
// An exporter proposes a cross-border sale into the Southern African Power Pool
// (SAPP). The trade cannot flow until the national regulator clears it through
// customs/energy-export review, and the grid operator schedules the interchange.
//
// STRUCTURAL regulatory gate (no guard needed): the ONLY edge into `scheduled`
// leaves `approved`, and the ONLY edge into `approved` is `approve`, fired by
// the regulator out of `customs_review`. So a trade can NEVER be scheduled or
// delivered without the regulator's customs clearance — the state graph enforces
// it, exactly like permit_to_work's isolation gate. There is no back-door edge
// from proposed/customs_review straight to scheduled.
//
// settles:false — this chain records a cross-border energy commitment and its
// physical schedule/delivery. No money moves through it: interchange settlement
// and wheeling charges are a separate money process (R-S5-1). Export always
// carries the record-only custody notice.
//
// Parties are attached ONLY at @new: the importer, regulator, and grid operator
// all fire later edges, so each is supplied as a role-tagged *_party field in the
// open input. The exporter is the opener (actorBecomes).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const crossBorderTrade: ChainDecl = {
  key: 'cross_border_trade',
  noun: 'Cross-border energy trade',
  refPrefix: 'XBRD',
  title: (f) =>
    `XBorder — ${(f.exporter_name as string) ?? 'exporter'} → ${(f.importer_country as string) ?? 'importer'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's27 export/trading licence', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'cross-border interchange scheduling', effect: 'requires' },
    { instrument: 'SAPP Agreement Between Operating Members', provision: 'firm bilateral trade', effect: 'authorises' },
  ],
  roles: ['exporter', 'importer', 'regulator', 'grid'],

  fields: {
    exporter_name: { type: 'string', required: true, label: 'Exporter' },
    importer_country: { type: 'string', required: true, label: 'Importing country' },
    interconnector: { type: 'string', required: true, label: 'Interconnector / border point' },
    energy_mwh: { type: 'number', required: true, min: 0, label: 'Energy (MWh)' },
    delivery_day: { type: 'string', required: true, label: 'Delivery day (ISO date)' },
    tariff_zar_mwh: { type: 'number', min: 0, label: 'Tariff (ZAR/MWh)' },
    customs_ref: { type: 'string', label: 'Customs / export-permit ref' },
    importer_party: { type: 'party', role: 'importer', label: 'Importing counterparty' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA)' },
    grid_party: { type: 'party', role: 'grid', label: 'Grid operator (interchange scheduler)' },
    // written by derive, never by the client
    approved_at: { type: 'string', label: 'Customs-cleared at' },
    scheduled_at: { type: 'string', label: 'Scheduled at' },
    delivered_at: { type: 'string', label: 'Delivered at' },
  },

  initial: 'proposed',

  states: {
    proposed: { label: 'Proposed', terminal: false, holder: 'exporter', sla: { days: 5 } },
    customs_review: { label: 'Customs review', terminal: false, holder: 'regulator', sla: { days: 10 } },
    approved: { label: 'Approved (customs-cleared)', terminal: false, holder: 'grid', sla: { days: 3 } },
    scheduled: { label: 'Scheduled', terminal: false, holder: 'grid', sla: { days: 2 } },
    delivered: { label: 'Delivered', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'proposed',
      by: ['exporter', 'operator'],
      actorBecomes: 'exporter',
      label: 'Propose cross-border trade',
      intent: 'primary',
      input: {
        exporter_name: { type: 'string', required: true },
        importer_country: { type: 'string', required: true },
        interconnector: { type: 'string', required: true },
        energy_mwh: { type: 'number', required: true, min: 0 },
        delivery_day: { type: 'string', required: true },
        tariff_zar_mwh: { type: 'number', min: 0 },
        importer_party: { type: 'party', role: 'importer' },
        regulator_party: { type: 'party', role: 'regulator' },
        grid_party: { type: 'party', role: 'grid' },
      },
      // exporter and importer must be distinct legal entities; no new commitments
      // while the platform is under a compliance halt.
      guards: ['counterpartyDistinct', 'complianceHaltClear'],
    },

    // --- happy path ---------------------------------------------------------
    {
      id: 'submit_to_customs',
      from: 'proposed',
      to: 'customs_review',
      by: ['exporter', 'operator'],
      label: 'Submit to customs review',
      intent: 'primary',
      input: { customs_ref: { type: 'string', required: true } },
      guards: ['complianceHaltClear'],
    },
    {
      // regulator's customs clearance — the ONLY door into `approved`, and the
      // only path onward to scheduling/delivery. This is the structural gate.
      id: 'approve',
      from: 'customs_review',
      to: 'approved',
      by: ['regulator'],
      label: 'Clear customs / approve export',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'schedule',
      from: 'approved',
      to: 'scheduled',
      by: ['grid'],
      label: 'Schedule interchange',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ scheduled_at: isoUtc(at) }),
    },
    {
      id: 'deliver',
      from: 'scheduled',
      to: 'delivered',
      by: ['grid'],
      label: 'Confirm delivery',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ delivered_at: isoUtc(at) }),
    },

    // --- exits --------------------------------------------------------------
    {
      // regulator refuses customs clearance — structured export-control reasons.
      id: 'reject',
      from: 'customs_review',
      to: 'rejected',
      by: ['regulator'],
      label: 'Reject at customs',
      intent: 'destructive',
      requiresReason: ['export_licence_missing', 'sanctions_hit', 'grid_security', 'documentation_incomplete', 'quota_exceeded'],
      guards: [],
    },
    {
      // exporter pulls a trade before it is under regulator review.
      id: 'withdraw',
      from: 'proposed',
      to: 'withdrawn',
      by: ['exporter', 'operator'],
      label: 'Withdraw proposal',
      intent: 'destructive',
      requiresReason: ['pricing_changed', 'volume_unavailable', 'rescheduled', 'no_longer_required'],
      guards: [],
    },
    {
      // a cleared/scheduled trade can still fall over before delivery — either
      // side or the grid can cancel with a structured reason. Not reachable from
      // delivered (terminal) or from customs_review (regulator uses reject there).
      id: 'cancel',
      from: ['approved', 'scheduled'],
      to: 'cancelled',
      by: ['exporter', 'grid', 'regulator', 'operator'],
      label: 'Cancel trade',
      intent: 'destructive',
      requiresReason: ['force_majeure', 'grid_constraint', 'counterparty_default', 'regulatory_direction'],
      guards: [],
    },
  ],

  timers: [
    // an unreviewed submission time-bars back out; a customs-cleared trade left
    // unscheduled stales out. record-only stubs — the sweep computes the real bar
    // off state sla days (ppa_contract / permit_to_work pattern).
    { onState: 'customs_review', after: { days: 0 }, fire: 'reject', kind: 'time_bar' },
    { onState: 'approved', after: { days: 0 }, fire: 'cancel', kind: 'sla' },
  ],
};
