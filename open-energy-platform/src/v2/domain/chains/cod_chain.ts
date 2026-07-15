// cod_chain — EPC construction programme through to Commercial Operation Date
// (COD) certification, as data.
//
// An IPP developer signs the EPC contract, issues notice-to-proceed, mobilises
// the contractor on site, and runs the fixed construction spine (mechanical
// completion → cold commissioning → grid synchronisation → reliability run).
// From reliability_run the independent engineer certifies COD, which is the
// ONLY edge into the terminal cod_certified state — so a project can never be
// "certified" without having actually run the reliability window (structural,
// no guard needed). Certifying COD is guarded by regulatorPresentIfStrategic:
// a ≥100MW project's certify_cod fires the NERSA SCADA-registration crossing,
// so the regulator must already be a live party on the txn.
//
// v1 permitted only {admin, support, ipp, ipp_developer, wind} to drive every
// action on this chain (all developer-side access) — the EPC contractor and
// regulator are named/evidenced parties for guard purposes, never actors, so
// `by` stays ['ipp_developer'] throughout (ipp_cd.ts precedent).
//
// settles:false — construction/certification is a milestone record. PPA
// billing it unlocks and any bond/EPC payments settle on their own rails
// (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const codChain: ChainDecl = {
  key: 'cod_chain',
  noun: 'IPP construction & COD certification',
  refPrefix: 'COD',
  title: (f) =>
    `COD — ${(f.project_name as string) ?? 'project'} / ${(f.epc_contractor_name as string) ?? 'EPC contractor'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: '§C-5 independent-engineer COD certification & SCADA registration', effect: 'requires' },
    { instrument: 'REIPPPP Implementation Agreement', provision: 'commercial operation date triggers PPA billing start', effect: 'authorises' },
  ],
  roles: ['ipp_developer', 'epc_contractor', 'regulator'],

  fields: {
    project_name: { type: 'string', required: true, label: 'Project' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    contractor_party: { type: 'party', role: 'epc_contractor', label: 'EPC contractor' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA)' },
    epc_contractor_name: { type: 'string', required: true, label: 'EPC contractor' },
    capacity_mw: { type: 'number', min: 0, label: 'Capacity (MW)' },
    epc_contract_ref: { type: 'string', label: 'EPC contract ref' },
    ntp_ref: { type: 'string', label: 'NTP ref' },
    mechanical_completion_ref: { type: 'string', label: 'Mechanical completion / punch-list ref' },
    ie_certifier: { type: 'string', label: 'IE certifier' },
    ie_cert_doc_ref: { type: 'string', label: 'IE certificate ref' },
    actual_cod_date: { type: 'string', label: 'Actual COD date' },
    nersa_scada_ref: { type: 'string', label: 'NERSA SCADA ref' },
    // written by derive, never by the client
    epc_signed_at: { type: 'string', label: 'EPC signed at' },
    ntp_issued_at: { type: 'string', label: 'NTP issued at' },
    mobilized_at: { type: 'string', label: 'Mobilized at' },
    mechanical_complete_at: { type: 'string', label: 'Mechanical completion at' },
    cold_commissioning_at: { type: 'string', label: 'Cold commissioning started at' },
    grid_synchronized_at: { type: 'string', label: 'Grid synchronized at' },
    reliability_run_started_at: { type: 'string', label: 'Reliability run started at' },
    cod_certified_at: { type: 'string', label: 'COD certified at' },
    cancelled_at: { type: 'string', label: 'Cancelled at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    epc_signed: { label: 'EPC signed', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    ntp_issued: { label: 'NTP issued', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    mobilization: { label: 'Mobilization', terminal: false, holder: 'ipp_developer', sla: { days: 60 } },
    mechanical_complete: { label: 'Mechanical complete', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    cold_commissioning: { label: 'Cold commissioning', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    grid_synchronized: { label: 'Grid synchronized', terminal: false, holder: 'ipp_developer', sla: { days: 60 } },
    reliability_run: { label: 'Reliability run', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    cod_certified: { label: 'COD certified', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['ipp_developer'],
      actorBecomes: 'ipp_developer',
      label: 'Open construction programme',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        epc_contractor_name: { type: 'string', required: true },
        contractor_party: { type: 'party', role: 'epc_contractor' },
        regulator_party: { type: 'party', role: 'regulator' },
        capacity_mw: { type: 'number', min: 0 },
      },
      // developer ≠ EPC contractor (no self-contracting).
      guards: ['counterpartyDistinct'],
    },
    {
      id: 'sign_epc',
      from: 'draft',
      to: 'epc_signed',
      by: ['ipp_developer'],
      label: 'Sign EPC',
      intent: 'primary',
      input: { epc_contract_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ epc_signed_at: isoUtc(at) }),
    },
    {
      id: 'issue_ntp',
      from: 'epc_signed',
      to: 'ntp_issued',
      by: ['ipp_developer'],
      label: 'Issue NTP',
      intent: 'primary',
      input: { ntp_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ ntp_issued_at: isoUtc(at) }),
    },
    {
      id: 'mobilize',
      from: 'ntp_issued',
      to: 'mobilization',
      by: ['ipp_developer'],
      label: 'Mobilize',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ mobilized_at: isoUtc(at) }),
    },
    {
      id: 'mechanical_complete',
      from: 'mobilization',
      to: 'mechanical_complete',
      by: ['ipp_developer'],
      label: 'Mechanical complete',
      intent: 'primary',
      input: { mechanical_completion_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ mechanical_complete_at: isoUtc(at) }),
    },
    {
      id: 'cold_commission',
      from: 'mechanical_complete',
      to: 'cold_commissioning',
      by: ['ipp_developer'],
      label: 'Cold commission',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ cold_commissioning_at: isoUtc(at) }),
    },
    {
      id: 'grid_synchronize',
      from: 'cold_commissioning',
      to: 'grid_synchronized',
      by: ['ipp_developer'],
      label: 'Grid synchronize',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ grid_synchronized_at: isoUtc(at) }),
    },
    {
      id: 'begin_reliability_run',
      from: 'grid_synchronized',
      to: 'reliability_run',
      by: ['ipp_developer'],
      label: 'Begin reliability run',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ reliability_run_started_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into cod_certified, and it can only fire from
      // reliability_run — so COD can NEVER be certified without having run
      // the reliability window (structural). A ≥100MW project must already
      // carry a live regulator party (NERSA SCADA-registration crossing).
      id: 'certify_cod',
      from: 'reliability_run',
      to: 'cod_certified',
      by: ['ipp_developer'],
      label: 'Certify COD',
      intent: 'primary',
      input: {
        ie_certifier: { type: 'string' },
        ie_cert_doc_ref: { type: 'string' },
        actual_cod_date: { type: 'string' },
        nersa_scada_ref: { type: 'string' },
      },
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ cod_certified_at: isoUtc(at) }),
    },

    // --- exit -------------------------------------------------------------
    {
      id: 'cancel',
      from: ['draft', 'epc_signed', 'ntp_issued', 'mobilization', 'mechanical_complete', 'cold_commissioning', 'grid_synchronized', 'reliability_run'],
      to: 'cancelled',
      by: ['ipp_developer'],
      label: 'Cancel project',
      intent: 'destructive',
      requiresReason: ['epc_contractor_default', 'funding_withdrawn', 'permitting_failure', 'commercially_unviable', 'force_majeure'],
      guards: [],
      derive: (_f, at: Instant) => ({ cancelled_at: isoUtc(at) }),
    },
  ],
};
