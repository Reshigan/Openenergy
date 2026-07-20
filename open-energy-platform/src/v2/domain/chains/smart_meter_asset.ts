// smart_meter_asset — IEC/NRS metering asset commissioning lifecycle as data.
// W199; src/utils/chain-registry-meridian.ts is the legacy v1 descriptor this
// chain ports 1:1 (POST /api/smart-meter-assets/:id/action verb-in-body).
//
// A field/grid team registers a meter, walks it through factory-acceptance,
// delivery, installation and commissioning, confirms AMR/AMI connectivity and
// NRS 047 data-quality, then goes live. Once operational it can still fault
// (report_fault) — repair sends it back to `commissioning` for revalidation
// (return_to_service) — or be retired outright (decommission). Both
// `operational` and `decommissioned` are the v1 chain's terminal set; the
// engine only reads `terminal` for closed_at bookkeeping, so `operational`
// staying reachable by report_fault/decommission is not a contradiction.
//
// Structural honesty (no invented guards):
//  - This is a single-actor field-operations record (counterpartyCol: null in
//    the v1 descriptor) — there is no second party to check distinctness
//    against, and no compliance-halt / credit / CP-evidence concept applies
//    to a physical meter's commissioning state. None of the 10 registry
//    guards describe a real rejection rule here, so every edge carries
//    guards: [] — the state graph is the only gate (matches substation_asset,
//    the structurally closest exemplar chain).
//  - The v1 cascadeHint notes report_fault/decommission "cross the regulator
//    inbox" for hv_bulk/bulk meters (revenue-metering integrity). That's
//    ported as a derived `regulator_notified` flag, not a guard — it never
//    blocks the action, it only flags it (matches substation_asset's
//    crossesRegulator pattern).
//
// settles:false — a metering-asset commissioning record never moves money
// or quantum; billing settles on its own rail (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const crossesRegulator = (meterClass: Json | undefined): boolean =>
  meterClass === 'hv_bulk' || meterClass === 'bulk';

export const smartMeterAsset: ChainDecl = {
  key: 'smart_meter_asset',
  noun: 'Smart-meter asset',
  refPrefix: 'SMA',
  title: (f) => `Meter ${(f.meter_serial as string) ?? '?'} — ${(f.site_id as string) ?? 'no site'}`,
  visibility: 'owner',
  settles: false,
  legalBasis: [
    { instrument: 'NRS 047', provision: 'AMR/AMI metering data-quality criteria', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'Chapter 3 — revenue-metering integrity at the grid interface', effect: 'requires' },
  ],
  roles: ['admin', 'support', 'grid_operator', 'ipp_developer'],

  fields: {
    meter_serial: { type: 'string', required: true, label: 'Meter serial' },
    site_id: { type: 'string', required: true, label: 'Site' },
    meter_class: { type: 'string', label: 'Meter class (hv_bulk/bulk/prepaid/post_paid)' },
    owner_id: { type: 'string', label: 'Owner' },
    make_model: { type: 'string', label: 'Make / model' },
    communication_tech: { type: 'string', label: 'Communication tech' },
    fat_certificate_ref: { type: 'string', label: 'FAT certificate reference' },
    commissioning_cert_ref: { type: 'string', label: 'Commissioning certificate reference' },
    firmware_version: { type: 'string', label: 'Firmware version loaded' },
    data_quality_score: { type: 'number', min: 0, max: 100, label: 'Data quality score (%)' },
    reason: { type: 'string', label: 'Notes' },
    // written by derive, never by the client
    regulator_notified: { type: 'boolean', label: 'Regulator notified' },
    fat_confirmed_at: { type: 'string', label: 'FAT confirmed at' },
    delivered_at: { type: 'string', label: 'Delivered at' },
    installation_scheduled_at: { type: 'string', label: 'Installation scheduled at' },
    installed_at: { type: 'string', label: 'Installed at' },
    commissioning_started_at: { type: 'string', label: 'Commissioning started at' },
    communication_confirmed_at: { type: 'string', label: 'Communication confirmed at' },
    data_quality_passed_at: { type: 'string', label: 'Data quality passed at' },
    operational_at: { type: 'string', label: 'Went operational at' },
    fault_reported_at: { type: 'string', label: 'Fault reported at' },
    returned_to_service_at: { type: 'string', label: 'Returned to service at' },
    decommissioned_at: { type: 'string', label: 'Decommissioned at' },
  },

  initial: 'registered',

  states: {
    registered: { label: 'Registered', terminal: false, holder: 'support' },
    fat_confirmed: { label: 'FAT confirmed', terminal: false, holder: 'support' },
    delivered: { label: 'Delivered to site', terminal: false, holder: 'support' },
    installation_scheduled: { label: 'Installation scheduled', terminal: false, holder: 'support' },
    installed: { label: 'Installed', terminal: false, holder: 'support' },
    commissioning: { label: 'Commissioning', terminal: false, holder: 'support' },
    communication_confirmed: { label: 'AMR/AMI connectivity confirmed', terminal: false, holder: 'support' },
    data_quality_passed: { label: 'Data quality passed', terminal: false, holder: 'support' },
    operational: { label: 'Operational', terminal: true, holder: 'none' },
    faulted: { label: 'Faulted', terminal: false, holder: 'support' },
    decommissioned: { label: 'Decommissioned', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'registered',
      by: ['admin', 'support', 'grid_operator', 'ipp_developer'],
      actorBecomes: 'support',
      label: 'Register smart meter',
      intent: 'primary',
      input: {
        meter_serial: { type: 'string', required: true },
        site_id: { type: 'string', required: true },
        meter_class: { type: 'string' },
        owner_id: { type: 'string' },
        make_model: { type: 'string' },
        communication_tech: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'confirm_fat',
      from: 'registered',
      to: 'fat_confirmed',
      by: ['admin', 'support', 'grid_operator', 'ipp_developer'],
      label: 'Confirm factory acceptance',
      intent: 'primary',
      input: { fat_certificate_ref: { type: 'string' }, reason: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ fat_confirmed_at: isoUtc(at) }),
    },
    {
      id: 'confirm_delivery',
      from: 'fat_confirmed',
      to: 'delivered',
      by: ['admin', 'support', 'grid_operator', 'ipp_developer'],
      label: 'Confirm site delivery',
      intent: 'primary',
      input: { reason: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ delivered_at: isoUtc(at) }),
    },
    {
      id: 'schedule_installation',
      from: 'delivered',
      to: 'installation_scheduled',
      by: ['admin', 'support', 'grid_operator', 'ipp_developer'],
      label: 'Schedule installation',
      intent: 'primary',
      input: { reason: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ installation_scheduled_at: isoUtc(at) }),
    },
    {
      id: 'confirm_installed',
      from: 'installation_scheduled',
      to: 'installed',
      by: ['admin', 'support', 'grid_operator', 'ipp_developer'],
      label: 'Confirm installed',
      intent: 'primary',
      input: { reason: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ installed_at: isoUtc(at) }),
    },
    {
      id: 'start_commissioning',
      from: 'installed',
      to: 'commissioning',
      by: ['admin', 'support', 'grid_operator', 'ipp_developer'],
      label: 'Start commissioning',
      intent: 'primary',
      input: {
        firmware_version: { type: 'string' },
        commissioning_cert_ref: { type: 'string' },
        reason: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ commissioning_started_at: isoUtc(at) }),
    },
    {
      id: 'confirm_communication',
      from: 'commissioning',
      to: 'communication_confirmed',
      by: ['admin', 'support', 'grid_operator', 'ipp_developer'],
      label: 'Confirm AMR/AMI connectivity',
      intent: 'primary',
      input: { reason: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ communication_confirmed_at: isoUtc(at) }),
    },
    {
      id: 'pass_data_quality',
      from: 'communication_confirmed',
      to: 'data_quality_passed',
      by: ['admin', 'support', 'grid_operator', 'ipp_developer'],
      label: 'Pass data quality check',
      intent: 'primary',
      input: { data_quality_score: { type: 'number', min: 0, max: 100 }, reason: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ data_quality_passed_at: isoUtc(at) }),
    },
    {
      // structural gate: the only forward edge into operational, and it only
      // fires from data_quality_passed — a meter can never go live without
      // NRS 047 data-quality sign-off (no guard needed).
      id: 'go_live',
      from: 'data_quality_passed',
      to: 'operational',
      by: ['admin', 'support', 'grid_operator', 'ipp_developer'],
      label: 'Go live',
      intent: 'primary',
      input: { reason: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ operational_at: isoUtc(at) }),
    },
    {
      id: 'report_fault',
      from: 'operational',
      to: 'faulted',
      by: ['admin', 'support', 'grid_operator', 'ipp_developer'],
      label: 'Report fault',
      intent: 'destructive',
      input: { reason: { type: 'string' } },
      guards: [],
      // hv_bulk/bulk meters cross the regulator inbox (revenue-metering integrity).
      derive: (f, at: Instant) => ({
        fault_reported_at: isoUtc(at),
        regulator_notified: crossesRegulator(f.meter_class) || (f.regulator_notified === true),
      }),
    },
    {
      id: 'return_to_service',
      from: 'faulted',
      to: 'commissioning',
      by: ['admin', 'support', 'grid_operator', 'ipp_developer'],
      label: 'Return to service',
      intent: 'primary',
      input: { reason: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ returned_to_service_at: isoUtc(at) }),
    },
    {
      id: 'decommission',
      from: ['operational', 'faulted'],
      to: 'decommissioned',
      by: ['admin', 'support', 'grid_operator', 'ipp_developer'],
      label: 'Decommission',
      intent: 'destructive',
      input: { reason: { type: 'string' } },
      guards: [],
      // hv_bulk/bulk meters cross the regulator inbox on retirement too.
      derive: (f, at: Instant) => ({
        decommissioned_at: isoUtc(at),
        regulator_notified: crossesRegulator(f.meter_class) || (f.regulator_notified === true),
      }),
    },
  ],
};
