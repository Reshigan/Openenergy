// commissioning — site commissioning onboarding lifecycle as data.
//
// Legacy source: W12 (chain-registry-meridian.ts, table om_sites). A planned
// generation site walks a forward chain — register the site, register its
// metering/inverter devices, wire the telemetry ingestion pipeline, confirm
// first telemetry, energise, then hand over into steady-state O&M. The IPP
// (and its developer / platform admin-support) drives every forward step;
// mark_failed and decommission are the regulator-desk exits and are the two
// edges that cross the regulator's inbox (legacy cascadeHint on both).
//
// Structural honesty (no invented guards):
//  - handover_om is the ONLY edge into `in_om`, and it can only fire from
//    `energised` — so a site can never reach steady-state O&M without having
//    gone through the full onboarding + energisation sequence first. The
//    state graph enforces the sequencing; no guard needed for ordering.
//  - energise is guarded by regulatorPresentIfStrategic: a ≥100MW facility
//    cannot grid-connect without a regulator on the txn (NERSA Grid Code
//    generation-connection oversight for strategic-tier capacity).
//  - energise is also guarded by complianceHaltClear: grid-connecting a site
//    is a new grid commitment, so a platform-wide compliance halt blocks it
//    the same way ccp_assessment blocks new admissions.
//  - mark_failed and decommission (the regulator-desk exits) are never
//    guarded by complianceHaltClear — de-risking / exiting must always stay
//    possible, same pattern as ccp_assessment's decline/suspend/terminate.
//
// settles:false — commissioning is a physical onboarding workflow; it moves
// no money and posts no ledger entries (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const commissioning: ChainDecl = {
  key: 'commissioning',
  noun: 'Site commissioning',
  refPrefix: 'COMM',
  title: (f) => `Site commissioning — ${(f.site_name as string) ?? 'unnamed site'} (${(f.technology as string) ?? 'tech TBC'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'Generation connection & commissioning requirements', effect: 'requires' },
  ],
  roles: ['ipp', 'ipp_developer', 'admin', 'support', 'regulator'],

  fields: {
    site_name: { type: 'string', required: true, label: 'Site name' },
    capacity_mw: { type: 'number', min: 0, label: 'Capacity (MW)' },
    technology: { type: 'string', label: 'Technology (solar/wind/battery/hydro/biomass)' },
    capacity_kwp: { type: 'number', min: 0, label: 'Capacity (kWp)' },
    province: { type: 'string', label: 'Province' },
    latitude: { type: 'number', label: 'Latitude' },
    longitude: { type: 'number', label: 'Longitude' },
    commissioning_date: { type: 'string', label: 'Planned commissioning date' },
    ppa_tariff_zar_mwh: { type: 'number', min: 0, label: 'PPA tariff (ZAR/MWh)' },
    ipp_party: { type: 'party', role: 'ipp', label: 'IPP / site owner' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    energisation_evidence_ref: { type: 'string', label: 'Energisation evidence ref' },
    handover_evidence_ref: { type: 'string', label: 'O&M handover evidence ref' },
    notes: { type: 'string', label: 'Notes' },
    // written by derive, never by the client
    site_registered_at: { type: 'string', label: 'Site registered at' },
    devices_registered_at: { type: 'string', label: 'Devices registered at' },
    ingestion_wired_at: { type: 'string', label: 'Ingestion wired at' },
    first_telemetry_at: { type: 'string', label: 'First telemetry confirmed at' },
    energised_at: { type: 'string', label: 'Energised at' },
    in_om_at: { type: 'string', label: 'Handed over to O&M at' },
    failed_at: { type: 'string', label: 'Commissioning failed at' },
    decommissioned_at: { type: 'string', label: 'Decommissioned at' },
  },

  initial: 'planned',

  states: {
    planned: { label: 'Planned', terminal: false, holder: 'ipp', sla: { days: 90 } },
    site_registered: { label: 'Site registered', terminal: false, holder: 'ipp' },
    devices_registered: { label: 'Devices registered', terminal: false, holder: 'ipp' },
    ingestion_wired: { label: 'Ingestion wired', terminal: false, holder: 'ipp' },
    first_telemetry_ok: { label: 'First telemetry confirmed', terminal: false, holder: 'ipp' },
    energised: { label: 'Energised', terminal: false, holder: 'ipp' },
    in_om: { label: 'In O&M', terminal: true, holder: 'none' },
    commissioning_failed: { label: 'Commissioning failed', terminal: true, holder: 'none' },
    decommissioned: { label: 'Decommissioned', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'planned',
      by: ['ipp', 'ipp_developer', 'admin', 'support'],
      actorBecomes: 'ipp',
      label: 'Register new site',
      intent: 'primary',
      input: {
        site_name: { type: 'string', required: true },
        capacity_mw: { type: 'number', min: 0 },
        technology: { type: 'string' },
        capacity_kwp: { type: 'number', min: 0 },
        province: { type: 'string' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        commissioning_date: { type: 'string' },
        ppa_tariff_zar_mwh: { type: 'number', min: 0 },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'register_site',
      from: 'planned',
      to: 'site_registered',
      by: ['ipp', 'ipp_developer', 'admin', 'support'],
      label: 'Register site',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ site_registered_at: isoUtc(at) }),
    },
    {
      id: 'register_devices',
      from: 'site_registered',
      to: 'devices_registered',
      by: ['ipp', 'ipp_developer', 'admin', 'support'],
      label: 'Register devices',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ devices_registered_at: isoUtc(at) }),
    },
    {
      id: 'wire_ingestion',
      from: 'devices_registered',
      to: 'ingestion_wired',
      by: ['ipp', 'ipp_developer', 'admin', 'support'],
      label: 'Wire telemetry ingestion',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ ingestion_wired_at: isoUtc(at) }),
    },
    {
      id: 'first_telemetry',
      from: 'ingestion_wired',
      to: 'first_telemetry_ok',
      by: ['ipp', 'ipp_developer', 'admin', 'support'],
      label: 'Confirm first telemetry',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ first_telemetry_at: isoUtc(at) }),
    },
    {
      // grid-connection moment: a ≥100MW site needs a regulator on the txn,
      // and no site can energise while the platform is under a compliance halt.
      id: 'energise',
      from: 'first_telemetry_ok',
      to: 'energised',
      by: ['ipp', 'ipp_developer', 'admin', 'support'],
      label: 'Energise site',
      intent: 'primary',
      input: {
        energisation_evidence_ref: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: ['complianceHaltClear', 'regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ energised_at: isoUtc(at) }),
    },
    {
      // structural completion gate: the ONLY edge into in_om, and only reachable
      // from energised — commissioning cannot be "completed" before energisation.
      id: 'handover_om',
      from: 'energised',
      to: 'in_om',
      by: ['ipp', 'ipp_developer', 'admin', 'support'],
      label: 'Hand over to O&M',
      intent: 'primary',
      input: {
        handover_evidence_ref: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ in_om_at: isoUtc(at) }),
    },

    // --- regulator-desk exits (never blocked by a compliance halt) -----------
    {
      id: 'mark_failed',
      from: ['planned', 'site_registered', 'devices_registered', 'ingestion_wired', 'first_telemetry_ok', 'energised'],
      to: 'commissioning_failed',
      by: ['admin', 'support', 'regulator', 'system'],
      label: 'Mark commissioning failed',
      intent: 'destructive',
      requiresReason: [
        'grid_connection_failure',
        'equipment_defect',
        'commissioning_test_failure',
        'regulatory_non_compliance',
        'site_access_denied',
        'commissioning_deadline_missed',
      ],
      guards: [],
      derive: (_f, at: Instant) => ({ failed_at: isoUtc(at) }),
    },
    {
      id: 'decommission',
      from: 'in_om',
      to: 'decommissioned',
      by: ['admin', 'support', 'regulator'],
      label: 'Decommission site',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ decommissioned_at: isoUtc(at) }),
    },
  ],

  // commissioning_due_at time-bar (legacy deadlineCol): a site left in
  // `planned` past its due date lapses into a failed onboarding rather than
  // sitting stale forever — same pattern as disposition's cp_long_stop timer.
  timers: [
    { onState: 'planned', after: { days: 90 }, fire: 'mark_failed', kind: 'time_bar', reason: 'commissioning_deadline_missed' },
  ],
};
