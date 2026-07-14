// close_out_netting — ISDA s6(e) close-out netting after an event of default, as
// data. On an event of default the non-defaulting (determining) party declares the
// default, designates an Early Termination Date, calculates the close-out amount,
// serves the calculation statement, and the netted amount is recorded.
//
// The netting spine is STRUCTURAL, not a guard: netted is reachable ONLY from
// statement_served (via record_netting), and statement_served is reachable ONLY
// from amount_calculated (via serve_statement). So a netted amount can NEVER be
// recorded without a served calculation statement on file — the state graph
// enforces it, no guard needed. Firing record_netting from amount_calculated is an
// ILLEGAL_TRANSITION the engine refuses before any guard runs.
//
// counterpartyDistinct blocks a determining party naming itself as the defaulter
// (self-dealing). serve_statement requires board-approval + legal-counterparty
// evidence via executionEvidencePresent (Pattern A: both refs are present-not-
// required inputs, so an absent one surfaces the guard's semantic code, not a
// generic BAD_INPUT). The defaulting party may dispute the calculation.
//
// settles:false — this records the netted determination and its statement; value
// moves on the settlement instructions this determination authorises, never
// through THIS chain (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const closeOutNetting: ChainDecl = {
  key: 'close_out_netting',
  noun: 'Close-out netting',
  refPrefix: 'CON',
  title: (f) =>
    `Close-out — ${(f.determining_party_name as string) ?? 'determining party'} v ${(f.defaulting_party_name as string) ?? 'defaulting party'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ISDA 2002 Master Agreement', provision: 's6(e) close-out amount', effect: 'authorises' },
    { instrument: 'Financial Markets Act 19 of 2012', provision: 'netting on default', effect: 'authorises' },
  ],
  roles: ['determining_party', 'defaulting_party', 'operator'],

  fields: {
    determining_party_name: { type: 'string', required: true, label: 'Determining (non-defaulting) party' },
    defaulting_party_name: { type: 'string', required: true, label: 'Defaulting party' },
    defaulting_party: { type: 'party', role: 'defaulting_party', label: 'Defaulting participant' },
    event_of_default: { type: 'string', label: 'Event of default' },
    close_out_amount: { type: 'number', label: 'Close-out amount' },
    // statement evidence (Pattern-A present-not-required inputs on serve_statement)
    board_approval_ref: { type: 'string', label: 'Board approval ref' },
    legal_counterparty_ref: { type: 'string', label: 'Legal counterparty ref' },
    statement_ref: { type: 'string', label: 'Calculation statement ref' },
    // written by derive, never by the client
    etd_at: { type: 'string', label: 'Early Termination Date' },
    served_at: { type: 'string', label: 'Statement served at' },
  },

  initial: 'default_declared',

  states: {
    default_declared: { label: 'Default declared', terminal: false, holder: 'determining_party', sla: { days: 5 } },
    etd_designated: { label: 'ETD designated', terminal: false, holder: 'determining_party', sla: { days: 5 } },
    amount_calculated: { label: 'Amount calculated', terminal: false, holder: 'determining_party', sla: { days: 5 } },
    statement_served: { label: 'Statement served', terminal: false, holder: 'defaulting_party', sla: { days: 10 } },
    netted: { label: 'Netted', terminal: true, holder: 'none' },
    disputed: { label: 'Disputed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'default_declared',
      by: ['determining_party', 'operator'],
      actorBecomes: 'determining_party',
      label: 'Declare event of default',
      intent: 'primary',
      input: {
        determining_party_name: { type: 'string', required: true },
        defaulting_party_name: { type: 'string', required: true },
        defaulting_party: { type: 'party', role: 'defaulting_party' },
        event_of_default: { type: 'string' },
      },
      // no self-netting: determining and defaulting parties must be distinct entities.
      guards: ['counterpartyDistinct'],
    },

    // --- happy path -----------------------------------------------------------
    {
      id: 'designate_etd',
      from: 'default_declared',
      to: 'etd_designated',
      by: ['determining_party', 'operator'],
      label: 'Designate Early Termination Date',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ etd_at: isoUtc(at) }),
    },
    {
      id: 'calculate',
      from: 'etd_designated',
      to: 'amount_calculated',
      by: ['determining_party', 'operator'],
      label: 'Calculate close-out amount',
      intent: 'primary',
      input: { close_out_amount: { type: 'number' } },
      guards: [],
    },
    {
      // serve the calculation statement on the defaulting party. The statement
      // needs board-approval + legal-counterparty evidence — both Pattern-A
      // present-not-required inputs so an absent ref surfaces MISSING_BOARD_APPROVAL
      // / MISSING_LEGAL_COUNTERPARTY, not a generic BAD_INPUT.
      id: 'serve_statement',
      from: 'amount_calculated',
      to: 'statement_served',
      by: ['determining_party', 'operator'],
      label: 'Serve calculation statement',
      intent: 'primary',
      input: {
        board_approval_ref: { type: 'string' },
        legal_counterparty_ref: { type: 'string' },
      },
      guards: ['executionEvidencePresent'],
      derive: (_f, at: Instant) => ({ served_at: isoUtc(at) }),
    },
    {
      // structural netting gate: the ONLY edge into netted, and it can only fire
      // from statement_served. A netted amount therefore can NEVER be recorded
      // without a served calculation statement on file.
      id: 'record_netting',
      from: 'statement_served',
      to: 'netted',
      by: ['determining_party', 'operator', 'system'],
      label: 'Record netted amount',
      intent: 'primary',
      guards: [],
    },

    // --- dispute --------------------------------------------------------------
    {
      // the defaulting party disputes the close-out calculation, from either the
      // calculated or served state.
      id: 'dispute_calc',
      from: ['amount_calculated', 'statement_served'],
      to: 'disputed',
      by: ['defaulting_party'],
      label: 'Dispute calculation',
      intent: 'destructive',
      requiresReason: ['valuation_disputed', 'methodology_disputed', 'event_of_default_contested', 'quantum_disputed'],
      guards: [],
    },
  ],

  // statement-response time-bar: a served statement left undisputed for 30 days
  // (the 10-day response sla plus dispute margin) records the netting.
  timers: [{ onState: 'statement_served', after: { days: 30 }, fire: 'record_netting', kind: 'time_bar' }],
};
