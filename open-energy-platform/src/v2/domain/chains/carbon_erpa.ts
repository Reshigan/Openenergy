// carbon_erpa — forward Emission Reductions Purchase Agreement lifecycle as data.
//
// W65. A carbon buyer (fund/offtaker) opens a forward ERPA with a project
// seller: negotiate → execute → schedule delivery → verify delivery. The
// delivery spine is structural: verify_delivery leaves ONLY delivery_scheduled,
// and the only path into delivery_scheduled is schedule_delivery from executed.
// So a forward can NEVER be delivery-confirmed before it is executed and
// scheduled — no guard needed, the state graph enforces the ordering.
//
// Two real domain gates:
//  - execute is guarded by executionEvidencePresent (board approval + named legal
//    counterparty) and counterpartyDistinct (no fund selling forwards to itself).
//  - verify_delivery is guarded by serialRangeConsistent: the delivered serial
//    range must be well-formed and its size must equal the stated quantity — the
//    double-count vector on carbon delivery.
//
// NOTE the Article-6 / large-volume regulator crossing (journey W65) is NOT
// enforced here: no guard in the registry fits a carbon-tonnage/Article-6 test,
// and this file invents none. regulator_party attaches at open so the crossing
// is representable; the deadline/crossing sweep is out of domain scope.
//
// settles:false — an ERPA is a delivery obligation, not a payment instruction
// (R-S5-1). Money settles on the linked settlement chain, never here.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const num = (v: Json | undefined): number => (typeof v === 'number' ? v : 0);

export const carbonErpa: ChainDecl = {
  key: 'carbon_erpa',
  noun: 'Carbon ERPA (forward)',
  refPrefix: 'CAR',
  title: (f) => `ERPA — ${(f.project_name as string) ?? 'unnamed project'} (${num(f.contracted_tco2e)} tCO2e)`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Paris Agreement Article 6', provision: '6.2/6.4 corresponding adjustment', effect: 'requires' },
    { instrument: 'Carbon Tax Act 2019', provision: 's13 offset eligibility', effect: 'authorises' },
  ],
  roles: ['buyer', 'seller', 'regulator'],

  fields: {
    erpa_number: { type: 'string', label: 'ERPA number' },
    buyer_party: { type: 'party', role: 'buyer', label: 'Buyer (carbon fund)' },
    seller_party: { type: 'party', role: 'seller', label: 'Seller (project)' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    project_name: { type: 'string', required: true, label: 'Project' },
    registry: { type: 'string', label: 'Registry (Verra/GoldStandard/Art6.4)' },
    vintage_year: { type: 'number', label: 'Vintage year' },
    contracted_tco2e: { type: 'number', required: true, min: 0, label: 'Contracted volume (tCO2e)' },
    price_per_tco2e_zar: { type: 'number', min: 0, label: 'Price (ZAR/tCO2e)' },
    delivery_date: { type: 'string', label: 'Contracted delivery date' },
    article_6: { type: 'boolean', label: 'Article 6 corresponding adjustment' },
    board_approval_ref: { type: 'string', label: 'Board approval ref' },
    legal_counterparty_ref: { type: 'string', label: 'Legal counterparty ref' },
    // delivered serial range (verify_delivery input; guarded by serialRangeConsistent)
    serial_start: { type: 'number', min: 0, label: 'Serial start' },
    serial_end: { type: 'number', min: 0, label: 'Serial end' },
    quantity_tco2e: { type: 'number', min: 0, label: 'Delivered volume (tCO2e)' },
    // written by derive, never by the client
    contract_value_zar: { type: 'number', label: 'Contract value (ZAR)' },
    delivered_tco2e: { type: 'number', label: 'Delivered (tCO2e)' },
    shortfall_tco2e: { type: 'number', label: 'Shortfall (tCO2e)' },
    executed_at: { type: 'string', label: 'Executed at' },
    scheduled_at: { type: 'string', label: 'Delivery scheduled at' },
    delivery_confirmed_at: { type: 'string', label: 'Delivery confirmed at' },
  },

  initial: 'negotiating',

  states: {
    negotiating: { label: 'Negotiating', terminal: false, holder: 'seller', sla: { days: 30 } },
    executed: { label: 'Executed', terminal: false, holder: 'seller', sla: { days: 7 } },
    delivery_scheduled: { label: 'Delivery scheduled', terminal: false, holder: 'seller', sla: { days: 365 } },
    delivery_confirmed: { label: 'Delivery confirmed', terminal: true, holder: 'none' },
    delivery_shortfall: { label: 'Delivery shortfall', terminal: true, holder: 'none' },
    negotiation_failed: { label: 'Negotiation failed', terminal: true, holder: 'none' },
    terminated: { label: 'Terminated', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'negotiating',
      by: ['buyer', 'seller'],
      actorBecomes: 'buyer',
      label: 'Open ERPA negotiation',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        registry: { type: 'string' },
        vintage_year: { type: 'number' },
        contracted_tco2e: { type: 'number', required: true, min: 0 },
        price_per_tco2e_zar: { type: 'number', min: 0 },
        delivery_date: { type: 'string' },
        article_6: { type: 'boolean' },
        seller_party: { type: 'party', role: 'seller' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'execute',
      from: 'negotiating',
      to: 'executed',
      by: ['buyer', 'seller'],
      label: 'Execute ERPA',
      intent: 'primary',
      input: {
        board_approval_ref: { type: 'string', required: true },
        legal_counterparty_ref: { type: 'string', required: true },
      },
      // no self-dealing forwards + an executed contract needs board+legal evidence.
      guards: ['counterpartyDistinct', 'executionEvidencePresent'],
      derive: (f, at: Instant) => ({
        executed_at: isoUtc(at),
        contract_value_zar: num(f.contracted_tco2e) * num(f.price_per_tco2e_zar),
      }),
    },
    {
      id: 'schedule_delivery',
      from: 'executed',
      to: 'delivery_scheduled',
      by: ['seller'],
      label: 'Schedule delivery',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ scheduled_at: isoUtc(at) }),
    },
    {
      // structural gate: the ONLY edge into delivery_confirmed, reachable ONLY
      // from delivery_scheduled — a forward cannot confirm before it is executed
      // and scheduled. serialRangeConsistent blocks a mis-stated delivery volume.
      id: 'verify_delivery',
      from: 'delivery_scheduled',
      to: 'delivery_confirmed',
      by: ['buyer'],
      label: 'Verify delivery',
      intent: 'primary',
      input: {
        serial_start: { type: 'number', required: true, min: 0 },
        serial_end: { type: 'number', required: true, min: 0 },
        quantity_tco2e: { type: 'number', required: true, min: 0 },
      },
      guards: ['serialRangeConsistent'],
      derive: (f, at: Instant) => ({
        delivery_confirmed_at: isoUtc(at),
        delivered_tco2e: num(f.quantity_tco2e),
        shortfall_tco2e: num(f.contracted_tco2e) - num(f.quantity_tco2e),
      }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'declare_shortfall',
      from: 'delivery_scheduled',
      to: 'delivery_shortfall',
      by: ['buyer', 'seller'],
      label: 'Declare shortfall',
      intent: 'destructive',
      requiresReason: ['under_delivery', 'project_underperformance', 'force_majeure', 'registry_delay'],
      guards: [],
    },
    {
      id: 'fail_negotiation',
      from: 'negotiating',
      to: 'negotiation_failed',
      by: ['buyer', 'seller'],
      label: 'Abandon negotiation',
      intent: 'destructive',
      requiresReason: ['price_disagreement', 'terms_rejected', 'counterparty_withdrew', 'due_diligence_failed'],
      guards: [],
    },
    {
      id: 'terminate',
      from: ['executed', 'delivery_scheduled'],
      to: 'terminated',
      by: ['buyer', 'seller', 'regulator'],
      label: 'Terminate ERPA',
      intent: 'destructive',
      requiresReason: ['material_breach', 'insolvency', 'regulatory_prohibition', 'mutual_termination'],
      guards: [],
    },
  ],

  // inverted-SLA delivery time-bar: a scheduled forward past its delivery date
  // stales into a shortfall. record-only stub; the sweep computes the real bar
  // off delivery_date / state sla (ppa_contract pattern).
  timers: [{ onState: 'delivery_scheduled', after: { days: 0 }, fire: 'declare_shortfall', kind: 'time_bar' }],
};
