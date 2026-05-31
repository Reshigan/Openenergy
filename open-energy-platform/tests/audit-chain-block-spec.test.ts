// Wave 118 - Hash-Chain Audit Trees & Tamper-Evident Ledger spec battery.
//
// Covers: state machine (forward path + branches + terminals +
// suspended->resume + reject from any non-terminal + emergency_seal
// EVERY-state + 16-action TRANSITIONS map coverage), tier derivation
// from block_cadence + FLOOR-AT-MONTHLY on each of 5 flags +
// FLOOR-AT-QUARTERLY on 2+ flags, INVERTED SLA matrix anchored on
// block_proposed (1/6/24/72/168h), SIGNATURE SIGNATURE-CHAIN-BREAK-SEAL
// crossings (emergency_seal EVERY tier; reject EVERY tier when
// signature_chain_break_detected || hash_collision_suspected; restate
// monthly + quarterly only; publish_block never crosses; sla_breached
// heavy tiers only), party routing (4-party split: auditor/CISO/CFO/
// BoardAudit), authority ladder, regulator export window (INVERTED
// polarity), urgency band (INVERTED polarity - quarterly loosest),
// Merkle tree construction + proof + verification (RFC 6962 style),
// chain-link verification (Bitcoin-style parent_block_hash), 5-bridge
// architecture (W113/W114/W115/W116/W117), block completeness 0-130,
// integrity index 0-130, hash collision risk score, Byzantine quorum.

import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS,
  nextStatus,
  allowedActions,
  isTerminal,
  isHardTerminal,
  SLA_HOURS,
  slaWindowHours,
  slaDeadlineFor,
  slaHoursRemaining,
  tierForCadence,
  countFloorFlags,
  floorAtMonthly,
  floorAtQuarterly,
  effectiveTier,
  isHeavyTier,
  isReportable,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  eventTypeFor,
  urgencyBand,
  authorityRequired,
  regulatorExportWindowHours,
  daysToQuarterlyAttestation,
  buildMerkleRoot,
  buildMerkleProof,
  verifyMerkleProof,
  blockSelfHash,
  verifyChainLink,
  bridgesToW113EvmChain,
  bridgesToW114DocControlChain,
  bridgesToW115SubmittalChain,
  bridgesToW116RfiChain,
  bridgesToW117ChangeOrderChain,
  blockCompletenessIndex,
  integrityIndex,
  hashCollisionRiskScore,
  independentVerifierQuorumMet,
} from '../src/utils/audit-chain-block-spec';

describe('W118 Audit-Chain Block - state machine', () => {
  it('walks the forward path block_proposed -> archived', () => {
    expect(nextStatus('block_proposed', 'collect_segments')).toBe('segments_collected');
    expect(nextStatus('segments_collected', 'build_merkle')).toBe('merkle_built');
    expect(nextStatus('merkle_built', 'verify_integrity')).toBe('integrity_verified');
    expect(nextStatus('integrity_verified', 'sign_block')).toBe('block_signed');
    expect(nextStatus('block_signed', 'anchor_block')).toBe('anchored');
    expect(nextStatus('anchored', 'publish_block')).toBe('published');
    expect(nextStatus('published', 'open_independent_verify')).toBe('independently_verifiable');
    expect(nextStatus('independently_verifiable', 'reconcile')).toBe('reconciled');
    expect(nextStatus('reconciled', 'archive')).toBe('archived');
  });

  it('blocks invalid transitions', () => {
    expect(nextStatus('block_proposed', 'build_merkle')).toBeNull();
    expect(nextStatus('segments_collected', 'verify_integrity')).toBeNull();
    expect(nextStatus('merkle_built', 'sign_block')).toBeNull();
    expect(nextStatus('anchored', 'reconcile')).toBeNull();
  });

  it('treats archived as hard terminal (no further transitions)', () => {
    expect(isHardTerminal('archived')).toBe(true);
    expect(isTerminal('archived')).toBe(true);
    expect(nextStatus('archived', 'reject')).toBeNull();
    expect(nextStatus('archived', 'emergency_seal')).toBeNull();
    expect(allowedActions('archived')).toEqual([]);
  });

  it('rejected is UI terminal but not hard terminal', () => {
    expect(isHardTerminal('rejected')).toBe(false);
    expect(isTerminal('rejected')).toBe(true);
  });

  it('suspended/restated/forked are soft (not terminal)', () => {
    expect(isTerminal('suspended')).toBe(false);
    expect(isTerminal('restated')).toBe(false);
    expect(isTerminal('forked')).toBe(false);
  });

  it('reject can land from any non-terminal state', () => {
    expect(nextStatus('block_proposed', 'reject')).toBe('rejected');
    expect(nextStatus('merkle_built', 'reject')).toBe('rejected');
    expect(nextStatus('published', 'reject')).toBe('rejected');
    expect(nextStatus('reconciled', 'reject')).toBe('rejected');
  });

  it('suspend can land from verification-touch states + resume to integrity_verified', () => {
    expect(nextStatus('integrity_verified', 'suspend')).toBe('suspended');
    expect(nextStatus('published', 'suspend')).toBe('suspended');
    expect(nextStatus('reconciled', 'suspend')).toBe('suspended');
    expect(nextStatus('suspended', 'resume')).toBe('integrity_verified');
  });

  it('restate supersedes published/reconciled blocks', () => {
    expect(nextStatus('published', 'restate')).toBe('restated');
    expect(nextStatus('reconciled', 'restate')).toBe('restated');
    expect(nextStatus('block_proposed', 'restate')).toBeNull();
  });

  it('emergency_seal lands from EVERY non-terminal state', () => {
    const states = [
      'block_proposed', 'segments_collected', 'merkle_built', 'integrity_verified',
      'block_signed', 'anchored', 'published', 'independently_verifiable',
      'reconciled', 'suspended', 'restated', 'forked',
    ] as const;
    for (const s of states) {
      expect(nextStatus(s, 'emergency_seal')).toBe('forked');
    }
  });

  it('allowedActions excludes propose_block (create-only)', () => {
    const acts = allowedActions('block_proposed');
    expect(acts).not.toContain('propose_block');
  });

  it('TRANSITIONS map covers all 16 actions', () => {
    const acts: Array<keyof typeof TRANSITIONS> = [
      'propose_block', 'collect_segments', 'build_merkle', 'verify_integrity',
      'sign_block', 'anchor_block', 'publish_block', 'open_independent_verify',
      'reconcile', 'archive', 'reject', 'suspend', 'resume', 'restate',
      'fork', 'emergency_seal',
    ];
    for (const a of acts) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
    expect(Object.keys(TRANSITIONS)).toHaveLength(16);
  });
});

describe('W118 Audit-Chain Block - tier derivation', () => {
  it('tierForCadence maps cadence to tier', () => {
    expect(tierForCadence('hourly')).toBe('hourly');
    expect(tierForCadence('daily')).toBe('daily');
    expect(tierForCadence('weekly')).toBe('weekly');
    expect(tierForCadence('monthly')).toBe('monthly');
    expect(tierForCadence('quarterly')).toBe('quarterly');
    expect(tierForCadence(null)).toBe('daily');
    expect(tierForCadence(undefined)).toBe('daily');
    expect(tierForCadence('garbage')).toBe('daily');
  });

  it('countFloorFlags counts only truthy flags', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ signature_chain_break_detected: true })).toBe(1);
    expect(countFloorFlags({
      signature_chain_break_detected: 1,
      hash_collision_suspected: 1,
    })).toBe(2);
    expect(countFloorFlags({
      signature_chain_break_detected: 1,
      hash_collision_suspected: 1,
      regulator_audit_active: 1,
      cross_border_witness_required: 1,
      sox_404_attestation_pending: 1,
    })).toBe(5);
  });

  it('FLOOR-AT-MONTHLY triggers on any single flag', () => {
    expect(floorAtMonthly({ signature_chain_break_detected: 1 })).toBe(true);
    expect(floorAtMonthly({ hash_collision_suspected: 1 })).toBe(true);
    expect(floorAtMonthly({ regulator_audit_active: 1 })).toBe(true);
    expect(floorAtMonthly({ cross_border_witness_required: 1 })).toBe(true);
    expect(floorAtMonthly({ sox_404_attestation_pending: 1 })).toBe(true);
    expect(floorAtMonthly({})).toBe(false);
  });

  it('FLOOR-AT-QUARTERLY triggers on 2+ flags', () => {
    expect(floorAtQuarterly({ signature_chain_break_detected: 1 })).toBe(false);
    expect(floorAtQuarterly({
      signature_chain_break_detected: 1,
      hash_collision_suspected: 1,
    })).toBe(true);
  });

  it('effectiveTier lifts to monthly on >=1 flag', () => {
    expect(effectiveTier('hourly', { signature_chain_break_detected: 1 })).toBe('monthly');
    expect(effectiveTier('daily', { regulator_audit_active: 1 })).toBe('monthly');
    expect(effectiveTier('weekly', { sox_404_attestation_pending: 1 })).toBe('monthly');
    // Already at monthly stays monthly with one flag.
    expect(effectiveTier('monthly', { signature_chain_break_detected: 1 })).toBe('monthly');
    // Already at quarterly stays quarterly.
    expect(effectiveTier('quarterly', { hash_collision_suspected: 1 })).toBe('quarterly');
  });

  it('effectiveTier lifts to quarterly on 2+ flags', () => {
    expect(effectiveTier('hourly', {
      signature_chain_break_detected: 1,
      hash_collision_suspected: 1,
    })).toBe('quarterly');
    expect(effectiveTier('weekly', {
      regulator_audit_active: 1,
      cross_border_witness_required: 1,
      sox_404_attestation_pending: 1,
    })).toBe('quarterly');
  });

  it('isHeavyTier matches monthly + quarterly', () => {
    expect(isHeavyTier('hourly')).toBe(false);
    expect(isHeavyTier('daily')).toBe(false);
    expect(isHeavyTier('weekly')).toBe(false);
    expect(isHeavyTier('monthly')).toBe(true);
    expect(isHeavyTier('quarterly')).toBe(true);
  });

  it('isReportable matches quarterly only', () => {
    expect(isReportable('hourly')).toBe(false);
    expect(isReportable('monthly')).toBe(false);
    expect(isReportable('quarterly')).toBe(true);
  });
});

describe('W118 Audit-Chain Block - INVERTED SLA polarity', () => {
  it('block_proposed anchor matches spec hours per tier', () => {
    expect(SLA_HOURS.block_proposed.hourly).toBe(1);
    expect(SLA_HOURS.block_proposed.daily).toBe(6);
    expect(SLA_HOURS.block_proposed.weekly).toBe(24);
    expect(SLA_HOURS.block_proposed.monthly).toBe(72);
    expect(SLA_HOURS.block_proposed.quarterly).toBe(168);
  });

  it('quarterly SLA strictly larger than hourly across every non-terminal state', () => {
    const states = [
      'block_proposed', 'segments_collected', 'merkle_built', 'integrity_verified',
      'block_signed', 'anchored', 'published', 'independently_verifiable',
      'reconciled', 'suspended', 'restated', 'forked',
    ] as const;
    for (const s of states) {
      expect(SLA_HOURS[s].quarterly).toBeGreaterThan(SLA_HOURS[s].hourly);
    }
  });

  it('terminal states have zero SLA window', () => {
    expect(slaWindowHours('archived', 'quarterly')).toBe(0);
    expect(slaWindowHours('rejected', 'quarterly')).toBe(0);
  });

  it('slaDeadlineFor + slaHoursRemaining track INVERTED polarity', () => {
    const enteredAt = new Date('2026-05-31T00:00:00Z');
    const now = new Date('2026-05-31T00:30:00Z');
    const hourlyHrs = slaHoursRemaining('block_proposed', 'hourly', enteredAt, now);
    const quarterlyHrs = slaHoursRemaining('block_proposed', 'quarterly', enteredAt, now);
    expect(quarterlyHrs).toBeGreaterThan(hourlyHrs);
  });
});

describe('W118 Audit-Chain Block - SIGNATURE crossings', () => {
  it('emergency_seal crosses regulator EVERY tier (SIGNATURE-CHAIN-BREAK-SEAL)', () => {
    const tiers = ['hourly', 'daily', 'weekly', 'monthly', 'quarterly'] as const;
    for (const tier of tiers) {
      expect(crossesIntoRegulator('emergency_seal', tier, { flags: {} })).toBe(true);
    }
  });

  it('reject crosses regulator EVERY tier when signature_chain_break_detected', () => {
    const tiers = ['hourly', 'daily', 'weekly', 'monthly', 'quarterly'] as const;
    for (const tier of tiers) {
      expect(crossesIntoRegulator('reject', tier, {
        flags: { signature_chain_break_detected: 1 },
      })).toBe(true);
    }
  });

  it('reject crosses regulator EVERY tier when hash_collision_suspected', () => {
    const tiers = ['hourly', 'daily', 'weekly', 'monthly', 'quarterly'] as const;
    for (const tier of tiers) {
      expect(crossesIntoRegulator('reject', tier, {
        flags: { hash_collision_suspected: 1 },
      })).toBe(true);
    }
  });

  it('reject without break flags does NOT cross', () => {
    expect(crossesIntoRegulator('reject', 'quarterly', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('reject', 'hourly', { flags: {} })).toBe(false);
  });

  it('restate crosses regulator monthly + quarterly only', () => {
    expect(crossesIntoRegulator('restate', 'hourly', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('restate', 'daily', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('restate', 'weekly', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('restate', 'monthly', { flags: {} })).toBe(true);
    expect(crossesIntoRegulator('restate', 'quarterly', { flags: {} })).toBe(true);
  });

  it('publish_block NEVER crosses regulator (normal flow)', () => {
    const tiers = ['hourly', 'daily', 'weekly', 'monthly', 'quarterly'] as const;
    for (const tier of tiers) {
      expect(crossesIntoRegulator('publish_block', tier, {
        flags: { signature_chain_break_detected: 1 },
      })).toBe(false);
    }
  });

  it('archive / reconcile / verify_integrity / sign_block / suspend / resume / anchor_block / collect_segments / build_merkle / open_independent_verify never cross on their own', () => {
    const acts = [
      'archive', 'reconcile', 'verify_integrity', 'sign_block', 'suspend',
      'resume', 'anchor_block', 'collect_segments', 'build_merkle',
      'open_independent_verify',
    ] as const;
    for (const a of acts) {
      expect(crossesIntoRegulator(a, 'quarterly', { flags: {} })).toBe(false);
    }
  });

  it('sla_breach crosses regulator monthly + quarterly only', () => {
    expect(slaBreachCrossesIntoRegulator('hourly')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('daily')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('weekly')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('monthly')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('quarterly')).toBe(true);
  });
});

describe('W118 Audit-Chain Block - party routing', () => {
  it('auditor writes propose/collect/build/verify/independent/reconcile/archive', () => {
    expect(partyForAction('propose_block')).toBe('auditor');
    expect(partyForAction('collect_segments')).toBe('auditor');
    expect(partyForAction('build_merkle')).toBe('auditor');
    expect(partyForAction('verify_integrity')).toBe('auditor');
    expect(partyForAction('open_independent_verify')).toBe('auditor');
    expect(partyForAction('reconcile')).toBe('auditor');
    expect(partyForAction('archive')).toBe('auditor');
  });

  it('CISO writes sign/anchor/publish/suspend/resume', () => {
    expect(partyForAction('sign_block')).toBe('CISO');
    expect(partyForAction('anchor_block')).toBe('CISO');
    expect(partyForAction('publish_block')).toBe('CISO');
    expect(partyForAction('suspend')).toBe('CISO');
    expect(partyForAction('resume')).toBe('CISO');
  });

  it('CFO writes reject/restate', () => {
    expect(partyForAction('reject')).toBe('CFO');
    expect(partyForAction('restate')).toBe('CFO');
  });

  it('BoardAudit writes fork/emergency_seal (last-resort hard line)', () => {
    expect(partyForAction('fork')).toBe('BoardAudit');
    expect(partyForAction('emergency_seal')).toBe('BoardAudit');
  });
});

describe('W118 Audit-Chain Block - authority + filing windows', () => {
  it('authority ladder climbs with tier', () => {
    expect(authorityRequired('hourly')).toBe('auditor');
    expect(authorityRequired('daily')).toBe('auditor');
    expect(authorityRequired('weekly')).toBe('CISO');
    expect(authorityRequired('monthly')).toBe('CFO');
    expect(authorityRequired('quarterly')).toBe('BoardAudit');
  });

  it('regulator export window INVERTED - quarterly longest', () => {
    expect(regulatorExportWindowHours('hourly')).toBe(12);
    expect(regulatorExportWindowHours('daily')).toBe(24);
    expect(regulatorExportWindowHours('weekly')).toBe(48);
    expect(regulatorExportWindowHours('monthly')).toBe(96);
    expect(regulatorExportWindowHours('quarterly')).toBe(168);
  });

  it('daysToQuarterlyAttestation returns positive count toward next 1/Jan,Apr,Jul,Oct', () => {
    const may = new Date('2026-05-31T00:00:00Z');
    expect(daysToQuarterlyAttestation(may)).toBeGreaterThan(0);
    expect(daysToQuarterlyAttestation(may)).toBeLessThanOrEqual(33); // ~ to 1 Jul
  });
});

describe('W118 Audit-Chain Block - INVERTED urgency band', () => {
  it('quarterly has loosest thresholds (more runway)', () => {
    expect(urgencyBand('quarterly', 100)).toBe('low');
    expect(urgencyBand('quarterly', 80)).toBe('medium');
    expect(urgencyBand('quarterly', 20)).toBe('high');
    expect(urgencyBand('quarterly', 5)).toBe('critical');
  });

  it('hourly has TIGHTEST thresholds', () => {
    expect(urgencyBand('hourly', 6)).toBe('low');
    expect(urgencyBand('hourly', 3)).toBe('medium');
    expect(urgencyBand('hourly', 1.5)).toBe('high');
    expect(urgencyBand('hourly', 0.5)).toBe('critical');
  });

  it('negative time always critical', () => {
    expect(urgencyBand('hourly', -1)).toBe('critical');
    expect(urgencyBand('quarterly', -1)).toBe('critical');
  });
});

describe('W118 Audit-Chain Block - event types', () => {
  it('event types map 1:1 with actions (16 distinct actions, 16 unique events excluding resume re-use)', () => {
    expect(eventTypeFor('propose_block')).toBe('audit_chain_block_proposed');
    expect(eventTypeFor('collect_segments')).toBe('audit_chain_segments_collected');
    expect(eventTypeFor('build_merkle')).toBe('audit_chain_merkle_built');
    expect(eventTypeFor('verify_integrity')).toBe('audit_chain_integrity_verified');
    expect(eventTypeFor('sign_block')).toBe('audit_chain_block_signed');
    expect(eventTypeFor('anchor_block')).toBe('audit_chain_anchored');
    expect(eventTypeFor('publish_block')).toBe('audit_chain_published');
    expect(eventTypeFor('open_independent_verify')).toBe('audit_chain_independently_verifiable');
    expect(eventTypeFor('reconcile')).toBe('audit_chain_reconciled');
    expect(eventTypeFor('archive')).toBe('audit_chain_archived');
    expect(eventTypeFor('reject')).toBe('audit_chain_rejected');
    expect(eventTypeFor('suspend')).toBe('audit_chain_suspended');
    expect(eventTypeFor('restate')).toBe('audit_chain_restated');
    expect(eventTypeFor('fork')).toBe('audit_chain_forked');
    expect(eventTypeFor('emergency_seal')).toBe('audit_chain_emergency_sealed');
  });
});

describe('W118 Audit-Chain Block - Merkle tree (RFC 6962-style)', () => {
  it('buildMerkleRoot returns 64-zero hex for empty array', async () => {
    const root = await buildMerkleRoot([]);
    expect(root).toBe('0'.repeat(64));
  });

  it('buildMerkleRoot returns single segment as root for length-1 array', async () => {
    const seg = 'a'.repeat(64);
    const root = await buildMerkleRoot([seg]);
    expect(root).toBe(seg);
  });

  it('buildMerkleRoot is deterministic for same input', async () => {
    const segs = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64)];
    const r1 = await buildMerkleRoot(segs);
    const r2 = await buildMerkleRoot(segs);
    expect(r1).toBe(r2);
    expect(r1).toHaveLength(64);
  });

  it('buildMerkleRoot handles odd leaf count (duplicates last)', async () => {
    const segs = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)];
    const root = await buildMerkleRoot(segs);
    expect(root).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(root)).toBe(true);
  });

  it('different leaves produce different roots', async () => {
    const r1 = await buildMerkleRoot(['a'.repeat(64), 'b'.repeat(64)]);
    const r2 = await buildMerkleRoot(['a'.repeat(64), 'c'.repeat(64)]);
    expect(r1).not.toBe(r2);
  });

  it('buildMerkleProof + verifyMerkleProof round-trip succeed for each leaf', async () => {
    const segs = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64)];
    const root = await buildMerkleRoot(segs);
    for (let i = 0; i < segs.length; i++) {
      const { path } = await buildMerkleProof(segs, i);
      const ok = await verifyMerkleProof(segs[i], path, root);
      expect(ok).toBe(true);
    }
  });

  it('verifyMerkleProof rejects tampered leaf', async () => {
    const segs = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64)];
    const root = await buildMerkleRoot(segs);
    const { path } = await buildMerkleProof(segs, 0);
    const tamperedLeaf = 'f'.repeat(64);
    const ok = await verifyMerkleProof(tamperedLeaf, path, root);
    expect(ok).toBe(false);
  });

  it('verifyMerkleProof rejects tampered root', async () => {
    const segs = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64)];
    const { path, root } = await buildMerkleProof(segs, 0);
    const tamperedRoot = '0'.repeat(64);
    expect(tamperedRoot).not.toBe(root);
    const ok = await verifyMerkleProof(segs[0], path, tamperedRoot);
    expect(ok).toBe(false);
  });
});

describe('W118 Audit-Chain Block - chain-link verification', () => {
  it('verifyChainLink accepts empty list', async () => {
    const r = await verifyChainLink([]);
    expect(r.ok).toBe(true);
  });

  it('verifyChainLink accepts a clean chain (parent_block_hash matches prior)', async () => {
    const node1 = {
      block_height: 1,
      parent_block_hash: null,
      merkle_root: 'a'.repeat(64),
      signature_bytes: 'sig1',
    };
    const h1 = await blockSelfHash(node1);
    const node2 = {
      block_height: 2,
      parent_block_hash: h1,
      merkle_root: 'b'.repeat(64),
      signature_bytes: 'sig2',
    };
    const h2 = await blockSelfHash(node2);
    const node3 = {
      block_height: 3,
      parent_block_hash: h2,
      merkle_root: 'c'.repeat(64),
      signature_bytes: 'sig3',
    };
    const r = await verifyChainLink([node1, node2, node3]);
    expect(r.ok).toBe(true);
  });

  it('verifyChainLink rejects a broken chain (mismatched parent_block_hash)', async () => {
    const node1 = {
      block_height: 1,
      parent_block_hash: null,
      merkle_root: 'a'.repeat(64),
      signature_bytes: 'sig1',
    };
    const node2 = {
      block_height: 2,
      parent_block_hash: 'f'.repeat(64), // intentionally wrong
      merkle_root: 'b'.repeat(64),
      signature_bytes: 'sig2',
    };
    const r = await verifyChainLink([node1, node2]);
    expect(r.ok).toBe(false);
    expect(r.break_at).toBe(2);
  });
});

describe('W118 Audit-Chain Block - 5 bridge architecture', () => {
  it('all five bridges return true when ref present', () => {
    expect(bridgesToW113EvmChain('ipe-123')).toBe(true);
    expect(bridgesToW114DocControlChain('idc-123')).toBe(true);
    expect(bridgesToW115SubmittalChain('sub-123')).toBe(true);
    expect(bridgesToW116RfiChain('rfi-123')).toBe(true);
    expect(bridgesToW117ChangeOrderChain('co-123')).toBe(true);
  });

  it('all five bridges return false when ref missing', () => {
    expect(bridgesToW113EvmChain(null)).toBe(false);
    expect(bridgesToW114DocControlChain(null)).toBe(false);
    expect(bridgesToW115SubmittalChain(undefined)).toBe(false);
    expect(bridgesToW116RfiChain('')).toBe(false);
    expect(bridgesToW117ChangeOrderChain(null)).toBe(false);
  });
});

describe('W118 Audit-Chain Block - completeness + integrity indexes', () => {
  it('blockCompletenessIndex 0-130 range', () => {
    expect(blockCompletenessIndex({})).toBe(0);
    expect(blockCompletenessIndex({ block_proposed: 1 })).toBe(5);
    const full = blockCompletenessIndex({
      block_proposed: 1, segments_collected: 1, merkle_built: 1,
      integrity_verified: 1, block_signed: 1, anchored: 1, published: 1,
      independently_verifiable: 1, reconciled: 1, archived: 1,
      clean_close_bonus: 1,
    });
    expect(full).toBeGreaterThan(100);
    expect(full).toBeLessThanOrEqual(130);
  });

  it('integrityIndex 0-130 range with 5 reconciliation states + zero-break bonus', () => {
    expect(integrityIndex({})).toBe(30); // zero-break bonus on empty
    const full = integrityIndex({
      reconciliation_status_w113_evm: 1,
      reconciliation_status_w114_doc: 1,
      reconciliation_status_w115_sub: 1,
      reconciliation_status_w116_rfi: 1,
      reconciliation_status_w117_co: 1,
      cross_chain_break_count: 0,
    });
    expect(full).toBe(130);
  });

  it('integrityIndex skips zero-break bonus when breaks present', () => {
    const partial = integrityIndex({
      reconciliation_status_w113_evm: 1,
      reconciliation_status_w114_doc: 1,
      reconciliation_status_w115_sub: 1,
      reconciliation_status_w116_rfi: 1,
      reconciliation_status_w117_co: 1,
      cross_chain_break_count: 3,
    });
    expect(partial).toBe(100);
  });
});

describe('W118 Audit-Chain Block - statistical helpers', () => {
  it('hashCollisionRiskScore near zero for normal segment counts', () => {
    expect(hashCollisionRiskScore(100)).toBe(0);
    expect(hashCollisionRiskScore(10000)).toBe(0);
    expect(hashCollisionRiskScore(1_000_000)).toBeGreaterThanOrEqual(0);
  });

  it('independentVerifierQuorumMet matches Byzantine 2-of-3 threshold', () => {
    expect(independentVerifierQuorumMet(0)).toBe(false);
    expect(independentVerifierQuorumMet(1)).toBe(false);
    expect(independentVerifierQuorumMet(2)).toBe(true);
    expect(independentVerifierQuorumMet(3)).toBe(true);
    expect(independentVerifierQuorumMet(null)).toBe(false);
  });
});
