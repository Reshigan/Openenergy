// carbon_retirement — voluntary/compliance retirement of carbon credits as data.
//
// Pilot chain 3 (docs/architecture/REBUILD_FUNCTIONAL_FLOOR.md). Motivating
// case: the unique-claim seam. Retiring a credit permanently consumes a serial
// range in a registry — no serial may EVER be retired twice (that is the
// double-count that destroys a carbon market's integrity). The `retire` edge
// claims `registry:serial_start-serial_end`; the store inserts it under the
// v2_claims UNIQUE index, so a second retirement of any identical range trips
// ConstraintViolation('unique_claim') atomically — the DB index is the
// enforcement, not a read-then-write guard that two concurrent commits could
// both pass.
//
// settles:false — retirement is a compliance/registry act, not a payment. The
// platform records the retirement instruction; the registry of record burns
// the serials. No custody, no money moves here (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

/** the permanent double-spend key: a serial range within one registry. */
const claimKey = (f: Record<string, Json>): string =>
  `${f.registry as string}:${f.serial_start as number}-${f.serial_end as number}`;

export const carbonRetirement: ChainDecl = {
  key: 'carbon_retirement',
  noun: 'Carbon retirement',
  refPrefix: 'RET',
  title: (f) => `Retire ${(f.quantity_tco2e as number) ?? '?'} tCO₂e — ${(f.registry as string) ?? 'unnamed'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Carbon Tax Act', provision: 's13 offset allowance', effect: 'authorises' },
    { instrument: 'JSE-SRL', provision: 'registry retirement', effect: 'requires' },
  ],
  roles: ['holder', 'registry', 'regulator'],

  fields: {
    registry: { type: 'string', required: true, label: 'Registry' },
    project_ref: { type: 'string', required: true, label: 'Project ref' },
    serial_start: { type: 'number', required: true, min: 1, label: 'Serial start' },
    serial_end: { type: 'number', required: true, min: 1, label: 'Serial end' },
    quantity_tco2e: { type: 'number', required: true, min: 1, label: 'Quantity (tCO₂e)' },
    beneficiary: { type: 'string', required: true, label: 'Retirement beneficiary' },
    registry_party: { type: 'party', role: 'registry', label: 'Registry' },
    // written by derive on retire, never by the client
    retired_at: { type: 'string', label: 'Retired at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'holder', sla: { days: 14 } },
    submitted: { label: 'Submitted to registry', terminal: false, holder: 'registry', sla: { days: 5 } },
    retired: { label: 'Retired', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['holder', 'operator'],
      actorBecomes: 'holder',
      label: 'Open retirement',
      intent: 'primary',
      input: {
        registry: { type: 'string', required: true },
        project_ref: { type: 'string', required: true },
        serial_start: { type: 'number', required: true, min: 1 },
        serial_end: { type: 'number', required: true, min: 1 },
        quantity_tco2e: { type: 'number', required: true, min: 1 },
        beneficiary: { type: 'string', required: true },
        registry_party: { type: 'party', role: 'registry' },
      },
      guards: ['complianceHaltClear', 'serialRangeConsistent'],
    },

    { id: 'submit', from: 'draft', to: 'submitted', by: ['holder'], label: 'Submit to registry', intent: 'primary', guards: ['complianceHaltClear', 'serialRangeConsistent'] },

    {
      id: 'retire',
      from: 'submitted',
      to: 'retired',
      by: ['registry'],
      label: 'Retire serials',
      intent: 'primary',
      guards: ['complianceHaltClear', 'serialRangeConsistent'],
      // the permanent burn: claim the serial range so it can never be retired twice.
      claim: claimKey,
      derive: (_f, at: Instant) => ({ retired_at: isoUtc(at) }),
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'reject',
      from: 'submitted',
      to: 'rejected',
      by: ['registry'],
      label: 'Reject',
      intent: 'destructive',
      requiresReason: ['serials_not_held', 'double_count_suspected', 'project_ineligible', 'evidence_missing'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['draft', 'submitted'],
      to: 'withdrawn',
      by: ['holder'],
      label: 'Withdraw',
      intent: 'destructive',
      requiresReason: ['duplicate_request', 'wrong_serials', 'no_longer_required'],
      guards: [],
    },
  ],
};
