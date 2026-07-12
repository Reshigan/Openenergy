// gtia — Grid Technical Interface Agreement lifecycle as data.
//
// An IPP submits a GTIA against a grid connection; the System Operator (SO)
// reviews it, may raise/receive queries, then agrees protection settings and
// the SCADA interface before the agreement executes. The technical spine is
// structural: execute ONLY leaves scada_agreed, and the ONLY path into
// scada_agreed is agree_scada (which itself only fires from protection_agreed).
// So a GTIA can NEVER execute before BOTH protection settings AND the SCADA
// interface are agreed — no guard needed, the state graph enforces it.
//
// Strategic connections (≥100 MW, read off capacity_mw) cross to the regulator:
// execute is guarded by regulatorPresentIfStrategic, so a bulk grid connection
// cannot execute without NERSA on the txn.
//
// settles:false — a technical interface agreement is a network control, never a
// payment (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const gtia: ChainDecl = {
  key: 'gtia',
  noun: 'Grid technical interface agreement',
  refPrefix: 'GTIA',
  title: (f) => `GTIA — ${(f.project_ref as string) ?? 'grid connection'} (${(f.capacity_mw as number) ?? '?'} MW)`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Electricity Regulation Act 2006', provision: 's34 grid connection & network access', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'Network Code — connection & technical interface requirements', effect: 'requires' },
  ],
  roles: ['ipp', 'system_operator', 'regulator', 'operator'],

  fields: {
    ipp_party: { type: 'party', role: 'ipp', label: 'IPP' },
    so_party: { type: 'party', role: 'system_operator', label: 'System operator' },
    project_ref: { type: 'string', label: 'IPP project ref (W1)' },
    gca_ref: { type: 'string', label: 'Grid connection agreement ref (W28)' },
    capacity_mw: { type: 'number', min: 0, required: true, label: 'Installed capacity (MW)' },
    connection_voltage_kv: { type: 'number', min: 0, label: 'Connection voltage (kV)' },
    connection_type: { type: 'string', label: 'Connection type (transmission/distribution/embedded)' },
    network_operator_name: { type: 'string', label: 'Network operator (SO/DSO) name' },
    protection_relay_type: { type: 'string', label: 'Protection relay type' },
    protection_settings_ref: { type: 'string', label: 'Approved protection settings ref' },
    scada_protocol: { type: 'string', label: 'SCADA protocol (iec61850/dnp3/modbus/iec104)' },
    scada_point_list_ref: { type: 'string', label: 'SCADA point-list ref' },
    query_note: { type: 'string', label: 'Query note' },
    query_response: { type: 'string', label: 'Query response' },
    query_round: { type: 'number', label: 'Query rounds' },
    // written by derive, never by the client
    review_started_at: { type: 'string', label: 'SO review started at' },
    protection_agreed_at: { type: 'string', label: 'Protection agreed at' },
    scada_agreed_at: { type: 'string', label: 'SCADA agreed at' },
    executed_at: { type: 'string', label: 'GTIA executed at' },
  },

  initial: 'gtia_initiated',

  states: {
    gtia_initiated: { label: 'GTIA initiated', terminal: false, holder: 'system_operator', sla: { hours: 48 } },
    so_under_review: { label: 'SO under review', terminal: false, holder: 'system_operator', sla: { hours: 120 } },
    queries_raised: { label: 'Queries raised', terminal: false, holder: 'ipp', sla: { hours: 72 } },
    protection_agreed: { label: 'Protection settings agreed', terminal: false, holder: 'system_operator', sla: { hours: 48 } },
    scada_agreed: { label: 'SCADA interface agreed', terminal: false, holder: 'system_operator', sla: { hours: 48 } },
    gtia_executed: { label: 'GTIA executed', terminal: true, holder: 'none' },
    so_rejected: { label: 'Rejected by SO', terminal: true, holder: 'none' },
    ipp_rejected: { label: 'Rejected by IPP', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'gtia_initiated',
      by: ['ipp', 'operator'],
      actorBecomes: 'ipp',
      label: 'Submit GTIA',
      intent: 'primary',
      input: {
        project_ref: { type: 'string' },
        gca_ref: { type: 'string' },
        capacity_mw: { type: 'number', min: 0, required: true },
        connection_voltage_kv: { type: 'number', min: 0 },
        connection_type: { type: 'string' },
        network_operator_name: { type: 'string' },
        so_party: { type: 'party', role: 'system_operator' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'begin_review',
      from: 'gtia_initiated',
      to: 'so_under_review',
      by: ['system_operator'],
      label: 'Begin SO review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ review_started_at: isoUtc(at) }),
    },
    {
      id: 'raise_queries',
      from: 'so_under_review',
      to: 'queries_raised',
      by: ['system_operator'],
      label: 'Raise queries',
      intent: 'secondary',
      input: { query_note: { type: 'string', required: true } },
      guards: [],
      derive: (f, _at: Instant) => ({ query_round: (typeof f.query_round === 'number' ? f.query_round : 0) + 1 }),
    },
    {
      id: 'respond_queries',
      from: 'queries_raised',
      to: 'so_under_review',
      by: ['ipp'],
      label: 'Respond to queries',
      intent: 'primary',
      input: { query_response: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'agree_protection',
      from: 'so_under_review',
      to: 'protection_agreed',
      by: ['system_operator'],
      label: 'Agree protection settings',
      intent: 'primary',
      input: {
        protection_relay_type: { type: 'string' },
        protection_settings_ref: { type: 'string', required: true },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ protection_agreed_at: isoUtc(at) }),
    },
    {
      // structural gate 1: the ONLY edge into scada_agreed, only from
      // protection_agreed. SCADA cannot be agreed before protection is.
      id: 'agree_scada',
      from: 'protection_agreed',
      to: 'scada_agreed',
      by: ['system_operator'],
      label: 'Agree SCADA interface',
      intent: 'primary',
      input: {
        scada_protocol: { type: 'string' },
        scada_point_list_ref: { type: 'string', required: true },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ scada_agreed_at: isoUtc(at) }),
    },
    {
      // structural gate 2: the ONLY edge into gtia_executed, only from
      // scada_agreed — which only agree_scada reaches, which only fires from
      // protection_agreed. So a GTIA can NEVER execute before BOTH protection
      // settings AND the SCADA interface are agreed. Strategic (≥100 MW)
      // connections also need NERSA on the txn.
      id: 'execute',
      from: 'scada_agreed',
      to: 'gtia_executed',
      by: ['system_operator', 'ipp'],
      label: 'Execute GTIA',
      intent: 'primary',
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ executed_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_by_so',
      from: ['gtia_initiated', 'so_under_review', 'queries_raised', 'protection_agreed', 'scada_agreed'],
      to: 'so_rejected',
      by: ['system_operator'],
      label: 'Reject (SO)',
      intent: 'destructive',
      requiresReason: ['technical_noncompliance', 'protection_incompatible', 'scada_incompatible', 'capacity_unavailable', 'insufficient_information'],
      guards: [],
    },
    {
      id: 'reject_by_ipp',
      from: ['so_under_review', 'queries_raised', 'protection_agreed', 'scada_agreed'],
      to: 'ipp_rejected',
      by: ['ipp'],
      label: 'Reject (IPP)',
      intent: 'destructive',
      requiresReason: ['terms_unacceptable', 'cost_prohibitive', 'project_cancelled'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['gtia_initiated', 'so_under_review', 'queries_raised'],
      to: 'withdrawn',
      by: ['ipp'],
      label: 'Withdraw GTIA',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'resubmission_required', 'commercial_change'],
      guards: [],
    },
  ],

  // queries-raised time-bar: an IPP that never answers the SO's queries lapses
  // out (a connection application cannot sit open indefinitely). record-only
  // stub; the sweep computes the real bar off the state sla hours.
  timers: [{ onState: 'queries_raised', after: { hours: 0 }, fire: 'withdraw', kind: 'time_bar' }],
};
