// rec_device_registration — I-REC production-device registration lifecycle as data.
//
// A registrant (device owner / producer) applies to register a renewable
// generation device with the local issuer/registry so it can later issue RECs.
// The issuer screens the application for completeness, an independent auditor
// verifies the physical device, and only then does the issuer register it and
// mint a registration code.
//
// The integrity spine is STRUCTURAL, not a guard: register_device leaves ONLY
// audit_verified, and the only path into audit_verified is submit_audit_report.
// So a device can NEVER be registered (and thus never issue RECs) without an
// independent audit — the state graph enforces it, no guard needed. A device
// double-registered off an unverified inspection is the fraud this blocks.
//
// Two guards ride real edges: completenessEvidencePresent (the issuer's
// completeness sign-off needs a named evidence ref) on complete_screening, and
// regulatorPresentIfStrategic (a ≥100 MW device crosses to NERSA oversight) on
// register_device.
//
// settles:false — a device registration is a registry control record, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure capacity bucketing off the nameplate MW. No clock, no env.
const capacityBand = (mw: Json | undefined): string => {
  if (typeof mw !== 'number') return 'unrated';
  if (mw >= 100) return 'utility';
  if (mw >= 1) return 'commercial';
  return 'residential';
};

export const recDeviceRegistration: ChainDecl = {
  key: 'rec_device_registration',
  noun: 'REC device registration',
  refPrefix: 'RDR',
  title: (f) => `${(f.technology as string) ?? 'renewable'} REC device — ${(f.device_name as string) ?? 'unnamed device'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'I-REC Standard', provision: 'Device Registration (Product Code: Electricity)', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'generation facility registration', effect: 'requires' },
  ],
  roles: ['registrant', 'issuer', 'auditor', 'regulator'],

  fields: {
    registration_code: { type: 'string', label: 'Registration code' },
    registrant_party: { type: 'party', role: 'registrant', label: 'Registrant' },
    issuer_party: { type: 'party', role: 'issuer', label: 'Local issuer / registry' },
    auditor_party: { type: 'party', role: 'auditor', label: 'Independent auditor' },
    device_name: { type: 'string', required: true, label: 'Device name' },
    technology: { type: 'string', required: true, label: 'Technology (solar_pv/wind/hydro/biomass)' },
    capacity_mw: { type: 'number', min: 0, label: 'Nameplate capacity (MW)' },
    capacity_band: { type: 'string', label: 'Capacity band' },
    location: { type: 'string', required: true, label: 'Location' },
    commissioning_date: { type: 'string', label: 'Commissioning date' },
    metering_ref: { type: 'string', label: 'Metering point ref' },
    grid_connection_ref: { type: 'string', label: 'Grid connection ref' },
    standard: { type: 'string', label: 'Certification standard' },
    // written by derive / later edges, never carried in from @new
    completeness_ref: { type: 'string', label: 'Completeness evidence ref' },
    audit_ref: { type: 'string', label: 'Audit report ref' },
    audit_verified_at: { type: 'string', label: 'Audit verified at' },
    registered_at: { type: 'string', label: 'Registered at' },
  },

  initial: 'submitted',

  states: {
    submitted: { label: 'Submitted', terminal: false, holder: 'issuer', sla: { hours: 24 } },
    screening: { label: 'Completeness screening', terminal: false, holder: 'issuer', sla: { hours: 48 } },
    audit_pending: { label: 'Audit pending', terminal: false, holder: 'auditor', sla: { days: 14 } },
    audit_verified: { label: 'Audit verified', terminal: false, holder: 'issuer', sla: { hours: 48 } },
    registered: { label: 'Registered', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'submitted',
      by: ['registrant'],
      actorBecomes: 'registrant',
      label: 'Submit device registration',
      intent: 'primary',
      input: {
        device_name: { type: 'string', required: true },
        technology: { type: 'string', required: true },
        capacity_mw: { type: 'number', min: 0 },
        location: { type: 'string', required: true },
        commissioning_date: { type: 'string' },
        metering_ref: { type: 'string' },
        grid_connection_ref: { type: 'string' },
        standard: { type: 'string' },
        issuer_party: { type: 'party', role: 'issuer' },
        auditor_party: { type: 'party', role: 'auditor' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'begin_screening',
      from: 'submitted',
      to: 'screening',
      by: ['issuer'],
      label: 'Begin completeness screening',
      intent: 'primary',
      guards: [],
      derive: (f, _at: Instant) => ({ capacity_band: capacityBand(f.capacity_mw) }),
    },
    {
      id: 'complete_screening',
      from: 'screening',
      to: 'audit_pending',
      by: ['issuer'],
      label: 'Complete screening & request audit',
      intent: 'primary',
      // completeness_ref is validated by the guard (min length), not the
      // required-input check — so the guard is the enforcer that rejects its
      // absence with a domain code rather than a generic BAD_INPUT.
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
    },
    {
      // structural integrity gate: the ONLY edge into audit_verified, from
      // audit_pending — so a device cannot reach registration without an
      // independent audit report.
      id: 'submit_audit_report',
      from: 'audit_pending',
      to: 'audit_verified',
      by: ['auditor'],
      label: 'Submit audit report',
      intent: 'primary',
      input: { audit_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ audit_verified_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into registered, and it fires ONLY from audit_verified —
      // which only submit_audit_report reaches. A device therefore cannot be
      // registered before it is audited. No guard: the graph is the control.
      id: 'register_device',
      from: 'audit_verified',
      to: 'registered',
      by: ['issuer'],
      label: 'Register device',
      intent: 'primary',
      // a strategic-tier (≥100 MW) device crosses to the regulator on the txn.
      guards: ['regulatorPresentIfStrategic'],
      derive: (f, at: Instant) => ({
        registered_at: isoUtc(at),
        registration_code: `${(f.standard as string) ?? 'IREC'}-${(f.technology as string) ?? 'DEV'}-${isoUtc(at)}`,
      }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject',
      from: ['submitted', 'screening', 'audit_pending', 'audit_verified'],
      to: 'rejected',
      by: ['issuer', 'regulator'],
      label: 'Reject registration',
      intent: 'destructive',
      requiresReason: ['incomplete_application', 'device_not_eligible', 'audit_failed', 'duplicate_device', 'metering_inadequate'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['submitted', 'screening'],
      to: 'withdrawn',
      by: ['registrant'],
      label: 'Withdraw application',
      intent: 'destructive',
      requiresReason: ['no_longer_required', 'registering_elsewhere', 'device_decommissioned'],
      guards: [],
    },
  ],

  // audit-pending time-bar: an audit request left unactioned stales the
  // application out (a stale inspection cannot be trusted). record-only stub;
  // the sweep computes the real bar off the state's sla days (ppa_contract pattern).
  timers: [{ onState: 'audit_pending', after: { days: 0 }, fire: 'reject', kind: 'time_bar' }],
};
