// carbon_issuance — minting (issuance) of carbon credits into a registry as data.
//
// The mirror of carbon_retirement: retirement burns a serial range, issuance
// mints one. A project developer (holder) requests issuance off a verified MRV
// monitoring report; the registry reviews, confirms the MRV verification, then
// issues the serial range into the registry account.
//
// The integrity spine is structural, not a guard: `issue` leaves ONLY
// `verified`, and the ONLY path into `verified` is `confirm_verification`. So
// credits can NEVER be minted before the MRV verification is confirmed — no
// guard needed, the state graph forbids it. Two extra defences on the mint:
//   - serialRangeConsistent — the claimed quantity must equal the inclusive
//     serial-range size (blocks the over-issuance / inflation vector), and
//   - claim(registry:serial_start-serial_end) — the store inserts it under the
//     v2_claims UNIQUE index, so the SAME serial range can never be issued twice
//     (the double-mint that would inflate the market), enforced by the DB index
//     atomically rather than a racy read-then-write guard.
//
// settles:false — issuance is a registry/compliance act, not a payment. The
// platform records the mint instruction; the registry of record holds custody
// of the serials. No money moves here (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

/** the permanent double-mint key: a serial range within one registry. */
const claimKey = (f: Record<string, Json>): string =>
  `${f.registry as string}:${f.serial_start as number}-${f.serial_end as number}`;

export const carbonIssuance: ChainDecl = {
  key: 'carbon_issuance',
  noun: 'Carbon issuance',
  refPrefix: 'CI',
  title: (f) =>
    `Issue ${(f.quantity_tco2e as number) ?? '?'} tCO₂e — ${(f.project_ref as string) ?? 'unnamed'} (${(f.registry as string) ?? 'registry'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Carbon Tax Act', provision: 's13 offset allowance', effect: 'authorises' },
    { instrument: 'JSE-SRL', provision: 'registry issuance & serialisation', effect: 'requires' },
  ],
  roles: ['holder', 'registry'],

  fields: {
    registry: { type: 'string', required: true, label: 'Registry' },
    project_ref: { type: 'string', required: true, label: 'Project ref' },
    methodology: { type: 'string', label: 'Methodology (e.g. VM0007)' },
    vintage_year: { type: 'number', min: 2000, label: 'Vintage year' },
    mrv_report_ref: { type: 'string', required: true, label: 'MRV monitoring report ref' },
    verification_body: { type: 'string', label: 'Verification body (VVB)' },
    serial_start: { type: 'number', required: true, min: 1, label: 'Serial start' },
    serial_end: { type: 'number', required: true, min: 1, label: 'Serial end' },
    quantity_tco2e: { type: 'number', required: true, min: 1, label: 'Quantity (tCO₂e)' },
    registry_party: { type: 'party', role: 'registry', label: 'Registry' },
    // written by derive, never by the client
    verified_at: { type: 'string', label: 'MRV verification confirmed at' },
    issued_at: { type: 'string', label: 'Issued at' },
    serial_range: { type: 'string', label: 'Serial range' },
  },

  initial: 'requested',

  states: {
    requested: { label: 'Issuance requested', terminal: false, holder: 'registry', sla: { days: 10 } },
    under_review: { label: 'Under registry review', terminal: false, holder: 'registry', sla: { days: 20 } },
    verified: { label: 'MRV verified', terminal: false, holder: 'registry', sla: { days: 5 } },
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
      label: 'Request issuance',
      intent: 'primary',
      input: {
        registry: { type: 'string', required: true },
        project_ref: { type: 'string', required: true },
        methodology: { type: 'string' },
        vintage_year: { type: 'number', min: 2000 },
        mrv_report_ref: { type: 'string', required: true },
        verification_body: { type: 'string' },
        serial_start: { type: 'number', required: true, min: 1 },
        serial_end: { type: 'number', required: true, min: 1 },
        quantity_tco2e: { type: 'number', required: true, min: 1 },
        registry_party: { type: 'party', role: 'registry' },
      },
      guards: ['complianceHaltClear', 'serialRangeConsistent'],
    },

    { id: 'begin_review', from: 'requested', to: 'under_review', by: ['registry'], label: 'Begin registry review', intent: 'primary', guards: [] },

    {
      // MRV sign-off. Only path into `verified`; `issue` fires ONLY from
      // `verified`, so credits cannot mint on an unverified report.
      id: 'confirm_verification',
      from: 'under_review',
      to: 'verified',
      by: ['registry'],
      label: 'Confirm MRV verification',
      intent: 'primary',
      guards: ['serialRangeConsistent'],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },

    {
      // the mint. Structural safety: the ONLY edge into `issued`, from `verified`
      // only. serialRangeConsistent blocks over-issuance; the claim blocks a
      // second mint of the same serials.
      id: 'issue',
      from: 'verified',
      to: 'issued',
      by: ['registry'],
      label: 'Issue serials',
      intent: 'primary',
      guards: ['complianceHaltClear', 'serialRangeConsistent'],
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
      by: ['registry'],
      label: 'Reject issuance',
      intent: 'destructive',
      requiresReason: ['mrv_inadequate', 'project_ineligible', 'double_count_suspected', 'serials_unavailable', 'methodology_not_approved'],
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
