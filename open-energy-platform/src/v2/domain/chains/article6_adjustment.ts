// article6_adjustment — Paris Agreement Article 6.2 corresponding-adjustment
// lifecycle for an exported carbon-retirement, as data.
//
// A retired carbon credit only avoids double-counting once the host country's
// registry (DFFE) records a corresponding adjustment and it is posted to the
// UNFCCC international ledger. The pipeline is strictly sequential: submit to
// DFFE, DFFE clears it, then it posts to the UNFCCC ledger — terminal.
//
// Structural honesty (no invented guards):
//  - post_unfccc is reachable ONLY from dffe_cleared, and dffe_cleared is
//    reachable ONLY from dffe_pending via clear_dffe. So a corresponding
//    adjustment can NEVER reach the UNFCCC ledger without DFFE clearance —
//    the state graph enforces the sequence, no guard required.
//  - block/unblock is an integrity hold (data-quality or fraud concern) that
//    can interrupt any live stage; unblock returns the case to draft so the
//    submission is re-verified from scratch rather than resuming mid-pipeline
//    on a stale evidence trail. `blocked` is deliberately terminal:false (v1
//    lists it as a terminal status, but it has a live outgoing unblock edge —
//    support_ticket's resolved/reopen is the precedent: a state you can leave
//    is not terminal, else closed_at never clears on reopen, engine.ts:399).
//
// settles:false — this chain records registry bookkeeping (host/beneficiary
// country ledger entries), not a payment or quantum transfer (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const article6Adjustment: ChainDecl = {
  key: 'article6_adjustment',
  noun: 'Article 6 corresponding adjustment',
  refPrefix: 'A6CA',
  title: (f) =>
    `Article 6 CA — ${(f.retirement_id as string) ?? 'unlinked retirement'} (${(f.host_country_iso as string) ?? '?'}→${(f.beneficiary_country_iso as string) ?? '?'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Paris Agreement Article 6.2', provision: 'corresponding adjustment to avoid double-counting internationally transferred mitigation outcomes', effect: 'requires' },
    { instrument: 'Carbon Tax Act 15 of 2019', provision: 'allowance for verified offsets used to reduce carbon tax liability', effect: 'authorises' },
  ],
  roles: ['carbon_fund', 'regulator', 'admin', 'support'],

  fields: {
    retirement_id: { type: 'string', required: true, label: 'Retirement ID' },
    host_country_iso: { type: 'string', required: true, label: 'Host country (ISO)' },
    beneficiary_country_iso: { type: 'string', required: true, label: 'Beneficiary country (ISO)' },
    tco2e: { type: 'number', required: true, min: 0, label: 'Volume (tCO2e)' },
    registry: { type: 'string', required: true, label: 'Registry' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (DFFE/UNFCCC focal point)' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Submitted to DFFE at' },
    dffe_cleared_at: { type: 'string', label: 'DFFE cleared at' },
    posted_at: { type: 'string', label: 'Posted to UNFCCC ledger at' },
    blocked_at: { type: 'string', label: 'Blocked at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'carbon_fund' },
    dffe_pending: { label: 'DFFE pending', terminal: false, holder: 'regulator', sla: { days: 30 } },
    dffe_cleared: { label: 'DFFE cleared', terminal: false, holder: 'regulator', sla: { days: 15 } },
    unfccc_ledger: { label: 'Posted to UNFCCC ledger', terminal: true, holder: 'none' },
    blocked: { label: 'Blocked', terminal: false, holder: 'admin' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['carbon_fund', 'admin'],
      actorBecomes: 'carbon_fund',
      label: 'Open corresponding adjustment',
      intent: 'primary',
      input: {
        retirement_id: { type: 'string', required: true },
        host_country_iso: { type: 'string', required: true },
        beneficiary_country_iso: { type: 'string', required: true },
        tco2e: { type: 'number', required: true, min: 0 },
        registry: { type: 'string', required: true },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'submit_dffe',
      from: 'draft',
      to: 'dffe_pending',
      by: ['carbon_fund', 'admin'],
      label: 'Submit to DFFE',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'clear_dffe',
      from: 'dffe_pending',
      to: 'dffe_cleared',
      by: ['regulator', 'admin'],
      label: 'Clear DFFE',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ dffe_cleared_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into the terminal UNFCCC ledger post, and it can only
      // fire from dffe_cleared — so a posting can never skip DFFE clearance.
      id: 'post_unfccc',
      from: 'dffe_cleared',
      to: 'unfccc_ledger',
      by: ['regulator', 'admin'],
      label: 'Post to UNFCCC ledger',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ posted_at: isoUtc(at) }),
    },

    // --- integrity hold: interrupts any live stage --------------------------
    {
      id: 'block',
      from: ['draft', 'dffe_pending', 'dffe_cleared'],
      to: 'blocked',
      by: ['admin', 'regulator', 'support'],
      label: 'Block',
      intent: 'destructive',
      requiresReason: ['data_quality', 'suspected_fraud', 'registry_discrepancy', 'duplicate_submission', 'regulatory_hold'],
      guards: [],
      derive: (_f, at: Instant) => ({ blocked_at: isoUtc(at) }),
    },
    {
      id: 'unblock',
      from: 'blocked',
      to: 'draft',
      by: ['admin', 'regulator', 'support'],
      label: 'Unblock',
      intent: 'secondary',
      guards: [],
    },
  ],
};
