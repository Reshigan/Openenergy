// wayleave_consent — a wayleave / servitude consent for a transmission line
// crossing private land, as data. An applicant applies for land access against a
// named landowner, the parties negotiate, the landowner grants consent, and the
// servitude is registered against the erf. legalBasis binds the record to the
// land-access instrument.
//
// The registration spine is STRUCTURAL, not a guard: `registered` is reachable
// ONLY from `consented` (via register_servitude), and `consented` is reachable
// ONLY from `negotiating` (via grant_consent, by the landowner). So a servitude
// can NEVER be registered without the landowner's consent on record — the state
// graph enforces it, no guard needed. Firing register_servitude from negotiating
// is ILLEGAL_TRANSITION (engine step-4) before any guard runs.
//
// counterpartyDistinct blocks self-dealing (an applicant that names itself as the
// landowner), and completenessEvidencePresent forces a named completeness ref at
// registration — you cannot register a servitude on nothing (Pattern A).
//
// settles:false — a wayleave is a land-access / servitude record, never a
// payment; any consideration moves on separate instruments (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const wayleaveConsent: ChainDecl = {
  key: 'wayleave_consent',
  noun: 'Wayleave consent',
  refPrefix: 'WAYL',
  title: (f) =>
    `Wayleave — ${(f.line_ref as string) ?? 'line'} over erf ${(f.erf_number as string) ?? 'TBD'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Electricity Regulation Act 4 of 2006', provision: 's31 land access / expropriation for transmission', effect: 'authorises' },
    { instrument: 'Deeds Registries Act 47 of 1937', provision: 'servitude registration against the title deed', effect: 'requires' },
  ],
  roles: ['applicant', 'landowner', 'operator'],

  fields: {
    wayleave_ref: { type: 'string', label: 'Wayleave reference' },
    applicant_name: { type: 'string', label: 'Applicant (line operator)' },
    landowner_party: { type: 'party', role: 'landowner', label: 'Landowner participant' },
    erf_number: { type: 'string', required: true, label: 'Erf / land parcel number' },
    line_ref: { type: 'string', required: true, label: 'Transmission line reference' },
    servitude_width_m: { type: 'number', min: 0, label: 'Servitude width (m)' },
    completeness_ref: { type: 'string', label: 'Registration completeness ref' },
    // written by derive, never by the client
    consented_at: { type: 'string', label: 'Consent granted at' },
    registered_at: { type: 'string', label: 'Servitude registered at' },
  },

  initial: 'applied',

  states: {
    applied: { label: 'Applied', terminal: false, holder: 'landowner', sla: { days: 30 } },
    negotiating: { label: 'In negotiation', terminal: false, holder: 'applicant', sla: { days: 60 } },
    consented: { label: 'Consented', terminal: false, holder: 'applicant', sla: { days: 30 } },
    registered: { label: 'Servitude registered', terminal: true, holder: 'none' },
    refused: { label: 'Consent refused', terminal: true, holder: 'none' },
    lapsed: { label: 'Lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'applied',
      by: ['applicant', 'operator'],
      actorBecomes: 'applicant',
      label: 'Apply for land access',
      intent: 'primary',
      input: {
        applicant_name: { type: 'string' },
        landowner_party: { type: 'party', role: 'landowner' },
        erf_number: { type: 'string' },
        line_ref: { type: 'string' },
        servitude_width_m: { type: 'number', min: 0 },
      },
      // no self-dealing: applicant and landowner must be distinct entities.
      guards: ['counterpartyDistinct'],
    },

    // --- happy path -----------------------------------------------------------
    {
      id: 'begin_negotiation',
      from: 'applied',
      to: 'negotiating',
      by: ['applicant', 'landowner', 'operator'],
      label: 'Begin negotiation',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'grant_consent',
      from: 'negotiating',
      to: 'consented',
      by: ['landowner'],
      label: 'Grant consent',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ consented_at: isoUtc(at) }),
    },
    {
      // structural registration gate: the ONLY edge into `registered`, and it can
      // only fire from `consented` — which only grant_consent (by the landowner)
      // reaches. A servitude therefore can NEVER register without landowner
      // consent on record. The named completeness ref is present-but-not-required
      // so an absent ref surfaces MISSING_COMPLETENESS_EVIDENCE, not BAD_INPUT
      // (Pattern A).
      id: 'register_servitude',
      from: 'consented',
      to: 'registered',
      by: ['applicant', 'operator'],
      label: 'Register servitude',
      intent: 'primary',
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ registered_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'refuse_consent',
      from: 'negotiating',
      to: 'refused',
      by: ['landowner'],
      label: 'Refuse consent',
      intent: 'destructive',
      requiresReason: ['terms_unacceptable', 'compensation_disputed', 'alternative_route_preferred', 'heritage_or_environmental'],
      guards: [],
    },
    {
      // an application left to stale-out past the window lapses. Record-only stub —
      // the sweep computes the real bar off the state sla days (isda pattern).
      id: 'lapse',
      from: ['applied', 'negotiating'],
      to: 'lapsed',
      by: ['applicant', 'operator'],
      label: 'Lapse application',
      intent: 'destructive',
      requiresReason: ['no_response', 'route_abandoned', 'landowner_untraceable'],
      guards: [],
    },
  ],

  // application time-bar: an un-negotiated application stales out. Record-only
  // stub — the sweep computes the real bar off the state sla (isda pattern).
  timers: [{ onState: 'applied', after: { days: 0 }, fire: 'lapse', kind: 'time_bar' }],
};
