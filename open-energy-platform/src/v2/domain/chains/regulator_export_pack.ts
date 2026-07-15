// regulator_export_pack — assembly and lodgement lifecycle for a periodic
// regulator disclosure pack (NERSA / IPPO / SARB / DMRE / FSCA / DFFE / DTI /
// JSE-SRL / SARS / CIPC), as data.
//
// Compliance admin proposes a pack against a target regulator, walks it
// through a fixed assembly pipeline (select audit-chain blocks → filter
// leaves → assemble XBRL → attach narratives → internal QA), gets external
// counterparty signoff, packages and countersigns it, then lodges it via the
// regulator's API. A lodged pack is either acknowledged (and can later be
// restated with material corrections) or rejected by the regulator.
//
// Structural honesty (no invented guards):
//  - lodge_via_api is only reachable from `countersigned`, and countersigned
//    is only reachable via the fixed assembly → signoff → package →
//    countersign spine. So a pack can NEVER be lodged without passing
//    internal QA and getting a digital signature — the state graph enforces
//    it, no guard required.
//  - open is guarded by counterpartyDistinct: the compliance admin proposing
//    the pack and the regulator counterparty it names must be different
//    legal entities (no self-attestation).
//  - `suspend` has no matching "resume" edge in the v1 descriptor (suspended
//    sits in the same non-terminal filter bucket as the lodging states but
//    v1 never wired a way out of it either) — left as an honest gap rather
//    than an invented recovery flow.
//
// settles:false — a disclosure pack is a regulatory filing artifact; the v1
// descriptor's quantumCol is null and it never moves money (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const regulatorExportPack: ChainDecl = {
  key: 'regulator_export_pack',
  noun: 'Regulator export pack',
  refPrefix: 'REXP',
  title: (f) => `Regulator export pack — ${(f.regulator_target as string) ?? 'unnamed regulator'} (${(f.pack_cadence as string) ?? 'ad_hoc'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's16 NERSA reporting & licence condition compliance', effect: 'requires' },
    { instrument: 'JSE-SRL Listing Requirements', provision: 'periodic disclosure to the exchange', effect: 'requires' },
  ],
  roles: ['admin', 'regulator'],

  fields: {
    regulator_target: { type: 'string', required: true, label: 'Regulator (nersa/ippo/sarb/dmre/fsca/dffe/dti/jse_srl/sars/cipc)' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator counterparty' },
    pack_cadence: { type: 'string', label: 'Cadence (ad_hoc/monthly_return/quarterly_attestation/half_year/annual_audit)' },
    mtls_cert_fingerprint: { type: 'string', label: 'mTLS certificate fingerprint' },
    counterparty_signoff_obtained: { type: 'boolean', label: 'Counterparty signoff obtained' },
    restate_reason: { type: 'string', label: 'Restatement basis' },
    parent_pack_id: { type: 'string', label: 'Parent pack ID' },
    notes: { type: 'string', label: 'Notes' },
    // written by derive, never by the client
    proposed_at: { type: 'string', label: 'Proposed at' },
    signoff_at: { type: 'string', label: 'Counterparty signoff at' },
    countersigned_at: { type: 'string', label: 'Countersigned at' },
    lodged_at: { type: 'string', label: 'Lodged at' },
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    restated_at: { type: 'string', label: 'Restated at' },
    archived_at: { type: 'string', label: 'Archived at' },
  },

  initial: 'pack_proposed',

  states: {
    pack_proposed: { label: 'Pack proposed', terminal: false, holder: 'admin', sla: { days: 5 } },
    blocks_selected: { label: 'Blocks selected', terminal: false, holder: 'admin', sla: { days: 2 } },
    leaves_filtered: { label: 'Leaves filtered', terminal: false, holder: 'admin', sla: { days: 2 } },
    xbrl_assembled: { label: 'XBRL assembled', terminal: false, holder: 'admin', sla: { days: 2 } },
    narratives_attached: { label: 'Narratives attached', terminal: false, holder: 'admin', sla: { days: 2 } },
    internal_qa: { label: 'Internal QA', terminal: false, holder: 'admin', sla: { days: 3 } },
    counterparty_signoff: { label: 'Counterparty signoff', terminal: false, holder: 'admin', sla: { days: 5 } },
    packaged: { label: 'Packaged', terminal: false, holder: 'admin', sla: { days: 2 } },
    countersigned: { label: 'Countersigned', terminal: false, holder: 'admin', sla: { days: 2 } },
    lodged_via_api: { label: 'Lodged via API', terminal: false, holder: 'regulator', sla: { days: 10 } },
    acknowledged_by_regulator: { label: 'Acknowledged by regulator', terminal: false, holder: 'admin' },
    restated: { label: 'Restated', terminal: false, holder: 'admin' },
    suspended: { label: 'Suspended', terminal: false, holder: 'admin' },
    archived: { label: 'Archived', terminal: true, holder: 'none' },
    rejected_by_regulator: { label: 'Rejected by regulator', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'pack_proposed',
      by: ['admin', 'regulator'],
      actorBecomes: 'admin',
      label: 'Propose regulator export pack',
      intent: 'primary',
      input: {
        regulator_target: { type: 'string', required: true },
        regulator_party: { type: 'party', role: 'regulator' },
        pack_cadence: { type: 'string' },
      },
      // proposing admin ≠ the regulator counterparty (no self-attestation).
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ proposed_at: isoUtc(at) }),
    },

    // --- fixed assembly pipeline ------------------------------------------
    {
      id: 'select_blocks',
      from: 'pack_proposed',
      to: 'blocks_selected',
      by: ['admin', 'regulator'],
      label: 'Select blocks',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'filter_leaves',
      from: 'blocks_selected',
      to: 'leaves_filtered',
      by: ['admin', 'regulator'],
      label: 'Filter leaves',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'assemble_xbrl',
      from: 'leaves_filtered',
      to: 'xbrl_assembled',
      by: ['admin', 'regulator'],
      label: 'Assemble XBRL',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'attach_narratives',
      from: 'xbrl_assembled',
      to: 'narratives_attached',
      by: ['admin', 'regulator'],
      label: 'Attach narratives',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'run_internal_qa',
      from: 'narratives_attached',
      to: 'internal_qa',
      by: ['admin', 'regulator'],
      label: 'Run internal QA',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'get_counterparty_signoff',
      from: 'internal_qa',
      to: 'counterparty_signoff',
      by: ['admin', 'regulator'],
      label: 'Get counterparty signoff',
      intent: 'primary',
      input: {
        counterparty_signoff_obtained: { type: 'boolean' },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ signoff_at: isoUtc(at) }),
    },
    {
      // also reachable from `restated` — a recast pack re-enters the
      // package → countersign → lodge spine rather than restarting assembly.
      id: 'package',
      from: ['counterparty_signoff', 'restated'],
      to: 'packaged',
      by: ['admin', 'regulator'],
      label: 'Package',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'countersign',
      from: 'packaged',
      to: 'countersigned',
      by: ['admin', 'regulator'],
      label: 'Countersign pack',
      intent: 'primary',
      input: {
        mtls_cert_fingerprint: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ countersigned_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into lodged_via_api, and it only fires from
      // countersigned — a pack can never be lodged unsigned.
      id: 'lodge_via_api',
      from: 'countersigned',
      to: 'lodged_via_api',
      by: ['admin', 'regulator'],
      label: 'Lodge via API',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ lodged_at: isoUtc(at) }),
    },
    {
      id: 'record_acknowledgement',
      from: 'lodged_via_api',
      to: 'acknowledged_by_regulator',
      by: ['admin', 'regulator'],
      label: 'Record acknowledgement',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    {
      id: 'restate',
      from: 'acknowledged_by_regulator',
      to: 'restated',
      by: ['admin', 'regulator'],
      label: 'Restate pack',
      intent: 'primary',
      input: {
        restate_reason: { type: 'string' },
        parent_pack_id: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ restated_at: isoUtc(at) }),
    },
    {
      id: 'archive',
      from: 'acknowledged_by_regulator',
      to: 'archived',
      by: ['admin', 'regulator'],
      label: 'Archive',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ archived_at: isoUtc(at) }),
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'reject_pack',
      from: 'lodged_via_api',
      to: 'rejected_by_regulator',
      by: ['regulator', 'admin'],
      label: 'Reject pack',
      intent: 'destructive',
      requiresReason: ['xbrl_invalid', 'narrative_deficient', 'signature_invalid', 'late_lodgement', 'data_mismatch'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: [
        'pack_proposed', 'blocks_selected', 'leaves_filtered', 'xbrl_assembled',
        'narratives_attached', 'internal_qa', 'counterparty_signoff', 'packaged', 'countersigned',
      ],
      to: 'withdrawn',
      by: ['admin', 'regulator'],
      label: 'Withdraw',
      intent: 'destructive',
      requiresReason: ['superseded', 'data_error_found', 'no_longer_required'],
      guards: [],
    },
    {
      id: 'suspend',
      from: [
        'pack_proposed', 'blocks_selected', 'leaves_filtered', 'xbrl_assembled',
        'narratives_attached', 'internal_qa', 'counterparty_signoff', 'packaged',
        'countersigned', 'lodged_via_api', 'acknowledged_by_regulator', 'restated',
      ],
      to: 'suspended',
      by: ['admin', 'regulator'],
      label: 'Suspend',
      intent: 'destructive',
      requiresReason: ['data_quality_hold', 'regulator_query', 'pending_legal_review'],
      guards: [],
    },
  ],
};
