// wheeling_access — third-party grid wheeling access as data.
//
// A generator/trader (applicant) asks the system operator for the right to
// wheel energy from an injection point to an offtake point across the network.
// The operator runs a network capacity study → offers commercial terms (tariff +
// loss factor) → the applicant accepts → the operator grants access.
//
// The commercial spine is structural: grant_access leaves ONLY terms_accepted,
// and the only path into terms_accepted is accept_terms (from terms_offered,
// which only offer_terms reaches after a capacity study). So access can NEVER be
// granted before a study has produced terms the applicant has accepted — no
// guard needed, the state graph enforces it.
//
// Strategic-tier wheels (≥100 MW) cross to the regulator: grant_access is guarded
// by regulatorPresentIfStrategic (reads capacity_mw off the txn).
//
// settles:false — a wheeling grant is a network-access right, not a payment;
// the tariff it carries is billed elsewhere (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure delivered-energy net of losses. No clock, no env. loss_factor as a %.
const deliveredMwh = (energy: Json | undefined, loss: Json | undefined): number => {
  if (typeof energy !== 'number') return 0;
  const pct = typeof loss === 'number' ? loss : 0;
  return energy * (1 - pct / 100);
};

export const wheelingAccess: ChainDecl = {
  key: 'wheeling_access',
  noun: 'Wheeling access',
  refPrefix: 'WA',
  title: (f) =>
    `Wheeling access — ${(f.injection_point as string) ?? '?'} → ${(f.offtake_point as string) ?? '?'} (${(f.capacity_mw as number) ?? 0} MW)`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's8 licensed use of transmission/distribution', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'network access & use-of-system', effect: 'authorises' },
  ],
  roles: ['applicant', 'operator', 'offtaker', 'regulator'],

  fields: {
    applicant_party: { type: 'party', role: 'applicant', label: 'Applicant' },
    operator_party: { type: 'party', role: 'operator', label: 'System operator' },
    offtaker_party: { type: 'party', role: 'offtaker', label: 'Offtaker' },
    injection_point: { type: 'string', required: true, label: 'Injection point' },
    offtake_point: { type: 'string', required: true, label: 'Offtake point' },
    network_area: { type: 'string', label: 'Network area' },
    voltage_level: { type: 'string', label: 'Voltage level' },
    capacity_mw: { type: 'number', required: true, min: 0, label: 'Wheeled capacity (MW)' },
    wheeled_energy_mwh: { type: 'number', min: 0, label: 'Wheeled energy (MWh)' },
    use_of_system: { type: 'string', label: 'Use-of-system class' },
    // set by the operator during the study / offer
    study_ref: { type: 'string', label: 'Capacity study ref' },
    wheeling_tariff_ckwh: { type: 'number', min: 0, label: 'Wheeling tariff (c/kWh)' },
    loss_factor_pct: { type: 'number', min: 0, label: 'Loss factor (%)' },
    // written by derive, never by the client
    delivered_energy_mwh: { type: 'number', label: 'Delivered energy net of losses (MWh)' },
    granted_at: { type: 'string', label: 'Access granted at' },
  },

  initial: 'access_requested',

  states: {
    access_requested: { label: 'Access requested', terminal: false, holder: 'operator', sla: { hours: 48 } },
    capacity_study: { label: 'Capacity study', terminal: false, holder: 'operator', sla: { days: 10 } },
    terms_offered: { label: 'Terms offered', terminal: false, holder: 'applicant', sla: { days: 14 } },
    terms_accepted: { label: 'Terms accepted', terminal: false, holder: 'operator', sla: { hours: 48 } },
    access_granted: { label: 'Access granted', terminal: true, holder: 'none' },
    access_rejected: { label: 'Access rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'access_requested',
      by: ['applicant', 'operator'],
      actorBecomes: 'applicant',
      label: 'Request wheeling access',
      intent: 'primary',
      input: {
        injection_point: { type: 'string', required: true },
        offtake_point: { type: 'string', required: true },
        network_area: { type: 'string' },
        voltage_level: { type: 'string' },
        capacity_mw: { type: 'number', required: true, min: 0 },
        wheeled_energy_mwh: { type: 'number', min: 0 },
        use_of_system: { type: 'string' },
        operator_party: { type: 'party', role: 'operator' },
        offtaker_party: { type: 'party', role: 'offtaker' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'begin_study',
      from: 'access_requested',
      to: 'capacity_study',
      by: ['operator'],
      label: 'Begin capacity study',
      intent: 'primary',
      input: { study_ref: { type: 'string' } },
      guards: [],
    },
    {
      id: 'offer_terms',
      from: 'capacity_study',
      to: 'terms_offered',
      by: ['operator'],
      label: 'Offer wheeling terms',
      intent: 'primary',
      input: {
        wheeling_tariff_ckwh: { type: 'number', required: true, min: 0 },
        loss_factor_pct: { type: 'number', required: true, min: 0 },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ delivered_energy_mwh: deliveredMwh(f.wheeled_energy_mwh, f.loss_factor_pct) }),
    },
    {
      id: 'accept_terms',
      from: 'terms_offered',
      to: 'terms_accepted',
      by: ['applicant'],
      label: 'Accept wheeling terms',
      intent: 'primary',
      guards: [],
    },
    {
      // structural commercial gate: the ONLY edge into access_granted, and it can
      // only fire from terms_accepted — which only accept_terms reaches. Access
      // therefore cannot be granted before a study produced terms the applicant
      // accepted. Strategic (≥100 MW) wheels also need a regulator on the txn.
      id: 'grant_access',
      from: 'terms_accepted',
      to: 'access_granted',
      by: ['operator'],
      label: 'Grant wheeling access',
      intent: 'primary',
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ granted_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_access',
      from: ['access_requested', 'capacity_study', 'terms_offered'],
      to: 'access_rejected',
      by: ['operator'],
      label: 'Reject access',
      intent: 'destructive',
      requiresReason: ['no_network_capacity', 'incompatible_connection', 'offer_lapsed', 'applicant_ineligible'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['access_requested', 'capacity_study', 'terms_offered', 'terms_accepted'],
      to: 'withdrawn',
      by: ['applicant'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'terms_unacceptable', 'rerouted', 'no_longer_required'],
      guards: [],
    },
  ],

  // terms-offer time-bar: an unaccepted wheeling offer lapses (capacity cannot be
  // reserved indefinitely). record-only stub; the sweep computes the real bar off
  // the terms_offered state sla (ppa_contract pattern).
  timers: [{ onState: 'terms_offered', after: { days: 0 }, fire: 'reject_access', kind: 'time_bar' }],
};
