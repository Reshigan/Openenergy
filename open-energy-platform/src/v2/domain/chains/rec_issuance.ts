// rec_issuance — issuance (minting) of renewable energy certificates (RECs) as
// data. The renewables mirror of carbon_issuance: a generation device operator
// (holder) requests RECs off a metered production period; the registrar reviews
// the metering evidence, confirms it, then issues one certificate per MWh as a
// serial range into the registry account.
//
// The integrity spine is structural, not a guard: `issue` leaves ONLY
// `metering_confirmed`, and the ONLY path into `metering_confirmed` is
// `confirm_metering`. So RECs can NEVER be minted before the metered production
// is confirmed — the state graph forbids it, no guard required. Two extra
// defences on the mint:
//   - claim(registry:serial_start-serial_end) — the store inserts it under the
//     v2_claims UNIQUE index, so the SAME serial range can never be issued
//     twice (the double-count that would inflate the REC market), rejected by
//     the DB index atomically rather than a racy read-then-write guard, and
//   - complianceHaltClear — a platform-wide halt blocks new minting.
//
// settles:false — issuance is a registry/compliance act, not a payment. The
// platform records the mint instruction; the registry of record holds custody
// of the certificate serials. No money moves here (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

/** the permanent double-mint key: a serial range within one registry. */
const claimKey = (f: Record<string, Json>): string =>
  `${f.registry as string}:${f.serial_start as number}-${f.serial_end as number}`;

export const recIssuance: ChainDecl = {
  key: 'rec_issuance',
  noun: 'REC issuance',
  refPrefix: 'RI',
  title: (f) =>
    `Issue ${(f.quantity_certs as number) ?? '?'} RECs — ${(f.device_ref as string) ?? 'unnamed device'} (${(f.production_period as string) ?? 'period'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'I-REC Standard', provision: 'Issuance & registered-device attestation', effect: 'requires' },
    { instrument: 'ERA 2006', provision: 'renewable generation & registry participation', effect: 'authorises' },
  ],
  roles: ['holder', 'registrar'],

  fields: {
    registry: { type: 'string', required: true, label: 'Registry (e.g. I-REC)' },
    device_ref: { type: 'string', required: true, label: 'Registered device ref' },
    production_period: { type: 'string', required: true, label: 'Production period (e.g. 2026-Q1)' },
    fuel_type: { type: 'string', label: 'Fuel type (solar/wind/hydro)' },
    metering_evidence_ref: { type: 'string', required: true, label: 'Metering evidence ref' },
    mwh_generated: { type: 'number', required: true, min: 1, label: 'Net MWh generated' },
    serial_start: { type: 'number', required: true, min: 1, label: 'Serial start' },
    serial_end: { type: 'number', required: true, min: 1, label: 'Serial end' },
    quantity_certs: { type: 'number', required: true, min: 1, label: 'Certificates (1 REC = 1 MWh)' },
    registrar_party: { type: 'party', role: 'registrar', label: 'Registrar' },
    // written by derive, never by the client
    verified_at: { type: 'string', label: 'Metering confirmed at' },
    issued_at: { type: 'string', label: 'Issued at' },
    serial_range: { type: 'string', label: 'Serial range' },
  },

  initial: 'requested',

  states: {
    requested: { label: 'Issuance requested', terminal: false, holder: 'registrar', sla: { days: 10 } },
    under_review: { label: 'Under registrar review', terminal: false, holder: 'registrar', sla: { days: 20 } },
    metering_confirmed: { label: 'Metering confirmed', terminal: false, holder: 'registrar', sla: { days: 5 } },
    issued: { label: 'Issued', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'requested',
      by: ['holder', 'operator'],
      actorBecomes: 'holder',
      label: 'Request REC issuance',
      intent: 'primary',
      input: {
        registry: { type: 'string', required: true },
        device_ref: { type: 'string', required: true },
        production_period: { type: 'string', required: true },
        fuel_type: { type: 'string' },
        metering_evidence_ref: { type: 'string', required: true },
        mwh_generated: { type: 'number', required: true, min: 1 },
        serial_start: { type: 'number', required: true, min: 1 },
        serial_end: { type: 'number', required: true, min: 1 },
        quantity_certs: { type: 'number', required: true, min: 1 },
        registrar_party: { type: 'party', role: 'registrar' },
      },
      guards: ['complianceHaltClear'],
    },

    { id: 'begin_review', from: 'requested', to: 'under_review', by: ['registrar'], label: 'Begin registrar review', intent: 'primary', guards: [] },

    {
      // metering sign-off. Only path into `metering_confirmed`; `issue` fires
      // ONLY from `metering_confirmed`, so RECs cannot mint on unconfirmed
      // production.
      id: 'confirm_metering',
      from: 'under_review',
      to: 'metering_confirmed',
      by: ['registrar'],
      label: 'Confirm metered production',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },

    {
      // the mint. Structural safety: the ONLY edge into `issued`, from
      // `metering_confirmed` only. The claim blocks a second mint of the same
      // serials (double-count vector).
      id: 'issue',
      from: 'metering_confirmed',
      to: 'issued',
      by: ['registrar'],
      label: 'Issue certificates',
      intent: 'primary',
      guards: ['complianceHaltClear'],
      claim: claimKey,
      derive: (f, at: Instant) => ({
        issued_at: isoUtc(at),
        serial_range: `${f.serial_start as number}-${f.serial_end as number}`,
      }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject',
      from: ['requested', 'under_review'],
      to: 'rejected',
      by: ['registrar'],
      label: 'Reject issuance',
      intent: 'destructive',
      requiresReason: ['metering_inadequate', 'device_not_registered', 'double_count_suspected', 'serials_unavailable', 'period_overlaps_prior_issuance'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['requested', 'under_review'],
      to: 'withdrawn',
      by: ['holder'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['duplicate_request', 'wrong_serials', 'no_longer_required'],
      guards: [],
    },
  ],
};
