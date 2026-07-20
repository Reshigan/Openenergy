// tariff_determination — NERSA tariff/price determination lifecycle as data.
//
// An applicant (IPP / licensee) files a tariff determination application; NERSA
// screens it for completeness, runs a statutory public participation process,
// analyses the submissions, then either DETERMINES a tariff or REJECTS the
// application with a structured reason.
//
// Structural honesty (no guard needed): `determined` is reachable ONLY from
// `analysis`, `analysis` ONLY from `public_process`, and `public_process` ONLY
// from `filed` via `accept_for_process`. So a tariff can NEVER be determined
// without first completing public participation and analysis — the state graph
// enforces due process, not a runtime flag. `accept_for_process` additionally
// gates on completenessEvidencePresent: NERSA cannot open a public process on an
// application it has not certified complete.
//
// The regulator (NERSA) fires every post-filing edge, so it is attached as a
// live party at @new via the regulator_party field — an actor named only after
// filing could not hold the 'regulator' role.
//
// settles:false — a determination FIXES a price; it moves no money. There is no
// settlement finality here, so no *_instructed state and export always carries
// the record-only notice (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const tariffDetermination: ChainDecl = {
  key: 'tariff_determination',
  noun: 'Tariff determination',
  refPrefix: 'TDET',
  title: (f) =>
    `Tariff determination — ${(f.applicant_name as string) ?? 'unnamed'} (${(f.tariff_category as string) ?? 'general'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's15 price/tariff determination', effect: 'authorises' },
    { instrument: 'ERA 2006', provision: 's10 public participation', effect: 'requires' },
    { instrument: 'Electricity Pricing Policy (GN 1398 of 2008)', provision: 'cost-reflective methodology', effect: 'requires' },
  ],
  roles: ['applicant', 'regulator', 'operator'],

  fields: {
    applicant_name: { type: 'string', required: true, label: 'Applicant' },
    tariff_category: { type: 'string', required: true, label: 'Category (generation/transmission/distribution/reseller)' },
    capacity_mw: { type: 'number', min: 0, label: 'Capacity (MW)' },
    requested_tariff_zar_mwh: { type: 'number', required: true, min: 0, label: 'Requested tariff (ZAR/MWh)' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA)' },
    completeness_ref: { type: 'string', label: 'Completeness certificate ref' },
    determination_ref: { type: 'string', label: 'Determination decision ref' },
    determined_tariff_zar_mwh: { type: 'number', min: 0, label: 'Determined tariff (ZAR/MWh)' },
    // written by derive, never by the client
    filed_at: { type: 'string', label: 'Filed at' },
    consultation_opened_at: { type: 'string', label: 'Public process opened at' },
    determined_at: { type: 'string', label: 'Determined at' },
  },

  initial: 'filed',

  states: {
    filed: { label: 'Filed', terminal: false, holder: 'regulator', sla: { days: 30 } },
    public_process: { label: 'Public participation', terminal: false, holder: 'regulator', sla: { days: 60 } },
    analysis: { label: 'Analysis', terminal: false, holder: 'regulator', sla: { days: 45 } },
    determined: { label: 'Determined', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'filed',
      by: ['applicant', 'operator'],
      actorBecomes: 'applicant',
      label: 'File tariff application',
      intent: 'primary',
      input: {
        applicant_name: { type: 'string', required: true },
        tariff_category: { type: 'string', required: true },
        capacity_mw: { type: 'number', min: 0 },
        requested_tariff_zar_mwh: { type: 'number', required: true, min: 0 },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ filed_at: isoUtc(at) }),
    },

    // --- NERSA due process --------------------------------------------------
    {
      // completeness_ref is intentionally NOT a required input: the guard is the
      // enforcer, so a bare accept surfaces MISSING_COMPLETENESS_EVIDENCE rather
      // than a generic BAD_INPUT. NERSA certifies completeness before consulting.
      id: 'accept_for_process',
      from: 'filed',
      to: 'public_process',
      by: ['regulator'],
      label: 'Accept for public process',
      intent: 'primary',
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ consultation_opened_at: isoUtc(at) }),
    },
    {
      id: 'conclude_consultation',
      from: 'public_process',
      to: 'analysis',
      by: ['regulator', 'system'],
      label: 'Conclude consultation',
      intent: 'primary',
      guards: [],
    },
    {
      // structural terminus: the ONLY edge into `determined`, reachable only from
      // `analysis`. Due process cannot be short-circuited.
      id: 'determine',
      from: 'analysis',
      to: 'determined',
      by: ['regulator'],
      label: 'Determine tariff',
      intent: 'primary',
      input: {
        determined_tariff_zar_mwh: { type: 'number', required: true, min: 0 },
        determination_ref: { type: 'string', required: true },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ determined_at: isoUtc(at) }),
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'reject',
      from: ['filed', 'public_process', 'analysis'],
      to: 'rejected',
      by: ['regulator'],
      label: 'Reject application',
      intent: 'destructive',
      requiresReason: ['incomplete_application', 'tariff_unjustified', 'methodology_non_compliant', 'public_interest', 'duplicate_application'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['filed', 'public_process', 'analysis'],
      to: 'withdrawn',
      by: ['applicant'],
      label: 'Withdraw application',
      intent: 'destructive',
      requiresReason: ['commercial_decision', 'refiling', 'project_cancelled'],
      guards: [],
    },
  ],

  // statutory public-participation window — a time_bar off the public_process
  // sla. record-only stub (ppa_contract pattern); the sweep computes the real
  // bar from the state sla days and fires conclude_consultation.
  timers: [{ onState: 'public_process', after: { days: 60 }, fire: 'conclude_consultation', kind: 'time_bar' }],
};
