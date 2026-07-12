// rec_lifecycle — Renewable Energy Certificate lifecycle as data.
//
// An issued REC (one certificate = a fixed MWh of renewable generation, a
// serial range, a vintage) is registered into lifecycle tracking by a registry
// and held by a holder. From `active` it may be reserved (earmarked for a
// retirement claim), transferred to a pre-named transferee, or retired — the
// single permanent consumption of the environmental attribute.
//
// The anti-double-counting spine is STRUCTURAL, not a guard: `retired`,
// `cancelled` and `expired` are terminal holder:'none' states with NO outbound
// edges. Once a REC is retired the environmental attribute is claimed forever —
// the state graph makes a second retire an ILLEGAL_TRANSITION. There is no
// "un-retire". That is the whole point of a REC registry.
//
// PARTIES attach ONLY at '@new': the registry becomes a party via actorBecomes,
// and holder / transferee / regulator are party-typed inputs at open(). A REC
// can only ever be transferred to a transferee that was named when it entered
// the registry — the domain does not model attaching a stranger mid-life.
//
// settles:false — a REC is an environmental-attribute record, never a payment
// (R-S5-1). The energy MWh it certifies was settled on the trading chain; this
// chain only tracks custody + retirement of the green claim.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const bumpCount = (v: Json | undefined): number => (typeof v === 'number' ? v : 0) + 1;

export const recLifecycle: ChainDecl = {
  key: 'rec_lifecycle',
  noun: 'REC lifecycle',
  refPrefix: 'RL',
  title: (f) =>
    `REC ${(f.certificate_no as string) ?? 'unnumbered'} — ${(f.energy_source as string) ?? 'renewable'} ${(f.vintage_month as string) ?? ''}`.trim(),
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's34 renewable generation licensing', effect: 'authorises' },
    { instrument: 'I-REC Standard', provision: 'issuance, redemption & retirement rules', effect: 'requires' },
  ],
  roles: ['registry', 'holder', 'transferee', 'regulator', 'operator'],

  fields: {
    certificate_no: { type: 'string', required: true, label: 'Certificate number' },
    registry_party: { type: 'party', role: 'registry', label: 'Issuing registry' },
    holder_party: { type: 'party', role: 'holder', label: 'Certificate holder' },
    transferee_party: { type: 'party', role: 'transferee', label: 'Named transferee' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    production_device: { type: 'string', required: true, label: 'Production device' },
    energy_source: { type: 'string', required: true, label: 'Energy source (solar/wind/hydro)' },
    vintage_month: { type: 'string', label: 'Vintage (YYYY-MM)' },
    mwh_volume: { type: 'number', min: 0, label: 'Volume (MWh)' },
    serial_start: { type: 'number', min: 0, label: 'Serial range start' },
    serial_end: { type: 'number', min: 0, label: 'Serial range end' },
    issuance_ref: { type: 'string', label: 'Issuance ref' },
    beneficiary: { type: 'string', label: 'Claim beneficiary' },
    transfer_count: { type: 'number', label: 'Times transferred' },
    // written by derive, never by the client
    registered_at: { type: 'string', label: 'Registered at' },
    reserved_at: { type: 'string', label: 'Reserved at' },
    transferred_at: { type: 'string', label: 'Transferred at' },
    retired_at: { type: 'string', label: 'Retired at' },
    cancelled_at: { type: 'string', label: 'Cancelled at' },
    expired_at: { type: 'string', label: 'Expired at' },
  },

  initial: 'active',

  states: {
    active: { label: 'Active', terminal: false, holder: 'holder' },
    reserved: { label: 'Reserved for retirement', terminal: false, holder: 'holder', sla: { days: 30 } },
    transferred: { label: 'Transferred', terminal: false, holder: 'transferee' },
    retired: { label: 'Retired', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
    expired: { label: 'Expired', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'active',
      by: ['registry', 'operator'],
      actorBecomes: 'registry',
      label: 'Register certificate',
      intent: 'primary',
      input: {
        certificate_no: { type: 'string', required: true },
        production_device: { type: 'string', required: true },
        energy_source: { type: 'string', required: true },
        vintage_month: { type: 'string' },
        mwh_volume: { type: 'number', min: 0 },
        serial_start: { type: 'number', min: 0 },
        serial_end: { type: 'number', min: 0 },
        issuance_ref: { type: 'string' },
        holder_party: { type: 'party', role: 'holder' },
        transferee_party: { type: 'party', role: 'transferee' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // a platform compliance halt (POPIA / NERSA directive) blocks admitting new
      // certificates into circulation.
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ registered_at: isoUtc(at) }),
    },
    {
      id: 'reserve',
      from: 'active',
      to: 'reserved',
      by: ['holder', 'registry'],
      label: 'Reserve for retirement',
      intent: 'secondary',
      input: { beneficiary: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ reserved_at: isoUtc(at) }),
    },
    {
      id: 'unreserve',
      from: 'reserved',
      to: 'active',
      by: ['holder', 'registry'],
      label: 'Release reservation',
      intent: 'secondary',
      guards: [],
    },
    {
      id: 'transfer',
      from: 'active',
      to: 'transferred',
      by: ['holder', 'registry'],
      label: 'Transfer to named transferee',
      intent: 'primary',
      guards: [],
      derive: (f, at: Instant) => ({ transferred_at: isoUtc(at), transfer_count: bumpCount(f.transfer_count) }),
    },
    {
      // the terminal consumption of the green claim. Only edge into `retired`;
      // `retired` is terminal with no outbound edges, so a REC can be retired at
      // most once — double-counting is impossible by construction, not by a scan.
      id: 'retire',
      from: ['active', 'reserved', 'transferred'],
      to: 'retired',
      by: ['holder', 'transferee', 'registry'],
      label: 'Retire certificate',
      intent: 'primary',
      input: { beneficiary: { type: 'string', required: true } },
      requiresReason: ['voluntary_claim', 'compliance_surrender', 'corporate_ppa_match', 'green_tariff_backing'],
      guards: [],
      derive: (_f, at: Instant) => ({ retired_at: isoUtc(at) }),
    },

    // --- destructive exits ----------------------------------------------------
    {
      id: 'cancel',
      from: ['active', 'reserved', 'transferred'],
      to: 'cancelled',
      by: ['registry', 'regulator'],
      label: 'Cancel certificate',
      intent: 'destructive',
      requiresReason: ['issued_in_error', 'double_issuance_detected', 'device_decertified', 'registry_recall'],
      guards: [],
      derive: (_f, at: Instant) => ({ cancelled_at: isoUtc(at) }),
    },
    {
      id: 'expire',
      from: ['active', 'reserved'],
      to: 'expired',
      by: ['registry', 'system'],
      label: 'Expire certificate',
      intent: 'destructive',
      requiresReason: ['vintage_lapsed', 'redemption_window_closed'],
      guards: [],
      derive: (_f, at: Instant) => ({ expired_at: isoUtc(at) }),
    },
  ],

  // vintage/redemption time-bar: an active certificate left unredeemed past its
  // window expires. Record-only stub — the sweep computes the real bar off state
  // sla days (ppa_contract pattern).
  timers: [{ onState: 'active', after: { days: 0 }, fire: 'expire', kind: 'time_bar' }],
};
