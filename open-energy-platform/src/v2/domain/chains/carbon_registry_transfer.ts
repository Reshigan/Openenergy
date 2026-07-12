// carbon_registry_transfer — account-to-account transfer of carbon credits as data.
//
// A transferor (holder of a serial range) proposes moving those serials to a
// transferee's registry account; the registry of record executes the move. The
// consent spine is STRUCTURAL: execute_transfer leaves ONLY `accepted`, and the
// ONLY path into `accepted` is the transferee's accept edge. So serials can
// NEVER be moved into another account without that account holder accepting —
// no guard needed, the state graph enforces it.
//
// NO claim key (unlike carbon_retirement). A transfer moves serials between
// live accounts; it does not permanently consume them — the transferee can
// transfer the same serials onward next. A permanent range claim would wrongly
// freeze those serials forever. Genuine holding-integrity (you can only
// transfer serials you actually hold) is a registry-of-record concern the
// domain does not model — deliberately out of scope.
//
// serialRangeConsistent pins quantity == inclusive range size (a double-count
// vector); complianceHaltClear blocks moves under a POPIA/NERSA halt. Self-
// transfer (transferor == transferee account) is a registry-of-record integrity
// concern, not modelled here — counterpartyDistinct can't express it cleanly on
// this edge (it id-scans every string input), so it is deliberately omitted.
//
// settles:false — a registry transfer is a custody instruction to the registry,
// not a payment. No money moves here (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const carbonRegistryTransfer: ChainDecl = {
  key: 'carbon_registry_transfer',
  noun: 'Carbon registry transfer',
  refPrefix: 'CRT',
  title: (f) =>
    `Transfer ${(f.quantity_tco2e as number) ?? '?'} tCO₂e — ${(f.transferor_account as string) ?? '?'} → ${(f.transferee_account as string) ?? '?'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Carbon Tax Act', provision: 's13 offset allowance transfer', effect: 'authorises' },
    { instrument: 'JSE-SRL', provision: 'registry account transfer', effect: 'requires' },
  ],
  roles: ['transferor', 'transferee', 'registry'],

  fields: {
    registry: { type: 'string', required: true, label: 'Registry' },
    project_ref: { type: 'string', required: true, label: 'Project ref' },
    vintage_year: { type: 'number', min: 2000, label: 'Vintage year' },
    serial_start: { type: 'number', required: true, min: 1, label: 'Serial start' },
    serial_end: { type: 'number', required: true, min: 1, label: 'Serial end' },
    quantity_tco2e: { type: 'number', required: true, min: 1, label: 'Quantity (tCO₂e)' },
    transferor_account: { type: 'string', required: true, label: 'Transferor account' },
    transferee_account: { type: 'string', required: true, label: 'Transferee account' },
    transferee_party: { type: 'party', role: 'transferee', label: 'Transferee' },
    registry_party: { type: 'party', role: 'registry', label: 'Registry' },
    // written by derive, never by the client
    accepted_at: { type: 'string', label: 'Accepted at' },
    transferred_at: { type: 'string', label: 'Transferred at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'transferor', sla: { days: 14 } },
    proposed: { label: 'Proposed to transferee', terminal: false, holder: 'transferee', sla: { days: 7 } },
    accepted: { label: 'Accepted — pending registry', terminal: false, holder: 'registry', sla: { days: 5 } },
    transferred: { label: 'Transferred', terminal: true, holder: 'none' },
    declined: { label: 'Declined by transferee', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected by registry', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['transferor', 'operator'],
      actorBecomes: 'transferor',
      label: 'Open transfer',
      intent: 'primary',
      input: {
        registry: { type: 'string', required: true },
        project_ref: { type: 'string', required: true },
        vintage_year: { type: 'number', min: 2000 },
        serial_start: { type: 'number', required: true, min: 1 },
        serial_end: { type: 'number', required: true, min: 1 },
        quantity_tco2e: { type: 'number', required: true, min: 1 },
        transferor_account: { type: 'string', required: true },
        transferee_account: { type: 'string', required: true },
        transferee_party: { type: 'party', role: 'transferee' },
        registry_party: { type: 'party', role: 'registry' },
      },
      guards: ['complianceHaltClear', 'serialRangeConsistent'],
    },

    {
      id: 'propose',
      from: 'draft',
      to: 'proposed',
      by: ['transferor'],
      label: 'Propose to transferee',
      intent: 'primary',
      guards: ['complianceHaltClear', 'serialRangeConsistent'],
    },

    {
      id: 'accept',
      from: 'proposed',
      to: 'accepted',
      by: ['transferee'],
      label: 'Accept transfer',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },

    {
      // structural consent gate: the ONLY edge into `transferred`, firing ONLY
      // from `accepted` — which ONLY the transferee's accept edge reaches. So a
      // transfer can never settle into an account that has not accepted it.
      id: 'execute_transfer',
      from: 'accepted',
      to: 'transferred',
      by: ['registry'],
      label: 'Execute transfer',
      intent: 'primary',
      guards: ['complianceHaltClear', 'serialRangeConsistent'],
      derive: (_f, at: Instant) => ({ transferred_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'decline',
      from: 'proposed',
      to: 'declined',
      by: ['transferee'],
      label: 'Decline transfer',
      intent: 'destructive',
      requiresReason: ['serials_disputed', 'account_mismatch', 'not_expected', 'terms_unacceptable'],
      guards: [],
    },
    {
      id: 'reject',
      from: 'accepted',
      to: 'rejected',
      by: ['registry'],
      label: 'Reject transfer',
      intent: 'destructive',
      requiresReason: ['serials_not_held', 'double_count_suspected', 'account_frozen', 'evidence_missing'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['draft', 'proposed'],
      to: 'withdrawn',
      by: ['transferor'],
      label: 'Withdraw transfer',
      intent: 'destructive',
      requiresReason: ['duplicate_request', 'wrong_serials', 'no_longer_required'],
      guards: [],
    },
  ],
};
