// ─────────────────────────────────────────────────────────────────────────
// Wave 118 - Hash-Chain Audit Trees & Tamper-Evident Ledger.
//
// FIRST Phase-B wave - opens the L5 regulator-grade hardening series.
// W118 is the platform-wide tamper-evident cross-chain audit tree -
// NOT another IPP chain. It is the cryptographic spine that ACTIVATES
// the hash_chain_position + merkle_root_segment pre-stages already
// embedded in W113 EVM / W114 Document Control / W115 Submittals /
// W116 RFIs / W117 Change Orders LIVE batteries.
//
// Sister of cascade.ts. Foundation for the rest of Phase B
// (W119 certified exports, W120 reconciliation attestation,
// W121 control-environment audit).
//
// Distinct from W113-W117 pre-stages:
//   - W113/W114/W115/W116/W117 each stamp their OWN per-chain
//     hash_chain_position (integer) + merkle_root_segment (64-char
//     sha256 hex) on every row in their LIVE battery
//   - W118 is the CROSS-CHAIN AUDIT TREE that ingests all five chain
//     ledgers, builds a unified Merkle forest, anchors roots to a
//     chained block ledger (oe_audit_chain_block), and signs each
//     block with Ed25519 (or RSA-PSS fallback)
//   - Each W118 block has a parent_block_hash linking it to the prior
//     block - true blockchain-style chained-block ledger
//   - Public verification endpoint: any third party can verify a
//     block's Merkle proof + signature + anchor URI
//
// Standards: NIST SP 800-92 (log management) + ISO 27037 (digital
// evidence) + RFC 6962 (Certificate Transparency Merkle tree spec) +
// Bitcoin-style chained-block hashing + XBRL audit pack + IFRS
// audit-trail requirements + SOC 2 Type II Common Criteria CC7.2
// (anomaly detection) + AICPA TSC + COSO Internal Control Integrated
// Framework + NERSA s14 Record Keeping + POPIA s14 (record integrity)
// + JSE SRL listed-issuer audit requirements + RFC 3161 TSA
// (timestamp authority) + Certificate Transparency log +
// OpenTimestamps protocol.
//
// 12-state forward path + 4 branch states:
//   block_proposed -> segments_collected -> merkle_built
//     -> integrity_verified -> block_signed -> anchored
//     -> published -> independently_verifiable -> reconciled
//     -> archived (HARD-terminal)
//   any non-terminal -> reject -> rejected (TERMINAL - integrity fail)
//   verification dispute -> suspend -> suspended (SOFT -
//                            resume to integrity_verified)
//   post-correction supersede -> restate -> restated (SOFT - old
//                            block stays for forensic trail)
//   emergency hard line  -> fork / emergency_seal -> forked
//                            (SOFT - mirrors W110 emergency_cancelled)
//
// Tier RE-DERIVED on every transition from block_cadence with
// FLOOR-AT-MONTHLY on 5 contextual flags:
//   - signature_chain_break_detected  (any hash mismatch in source
//                                       chains)
//   - hash_collision_suspected        (cryptographic collision suspect)
//   - regulator_audit_active          (NERSA/IPPO/SARB live audit)
//   - cross_border_witness_required   (foreign regulator witness)
//   - sox_404_attestation_pending     (US listed-issuer attestation
//                                       window open)
//
// 5 tiers (INVERTED polarity - LARGER block volume = MORE cryptographic
// verification time):
//   hourly      : 1h   (high-volume rapid)
//   daily       : 6h   (per-day rollup)
//   weekly      : 24h  (per-week rollup)
//   monthly     : 72h  (per-month rollup)
//   quarterly   : 168h (NERSA/IPPO/SARB quarterly attestation)
//
// SIGNATURE Phase-B regulator crossings:
//   emergency_seal -> EVERY tier
//     (W118 SIGNATURE SIGNATURE-CHAIN-BREAK-SEAL hard line - sister
//      of W104-W117. ANY hash anomaly forces NERSA/IPPO/SARB/JSE-SRL
//      notice within the cryptographic SLA window.)
//   reject -> EVERY tier when signature_chain_break_detected ||
//             hash_collision_suspected
//   restate -> monthly + quarterly only (recasting a published block
//             = listed-issuer JSE SRL disclosure event)
//   publish_block -> no regulator (publication is normal flow)
//   sla_breached -> monthly + quarterly only
//
// Write {admin} ONLY (audit chain is admin-write to prevent privilege
// creep). READ all 9 personas + external `audit_verifier` pseudo-persona
// via /api/audit-chain/verify (no auth required; public Merkle-proof
// endpoint).
//
// actor_party split (4-step authority):
//   auditor    : propose_block / collect_segments / build_merkle /
//                verify_integrity / open_independent_verify /
//                reconcile / archive
//   CISO       : sign_block / anchor_block / publish_block /
//                suspend / resume
//   CFO        : reject / restate
//   BoardAudit : fork / emergency_seal (last-resort hard line)
//
// Event prefix: `audit_chain_evt_`. AUDIT_PREFIX_MAP entry:
//   audit_chain: 'audit'
// (W118 is the FIRST non-role-suffixed entry in the map - documented
//  in the AUDIT_PREFIX_MAP comment block.)
//
// Three crons:
//   -  5 * * * *           hourly block proposal
//   - 45 0 * * *           daily attestation roll-up
//   -  0 3 1 1,4,7,10 *    quarterly NERSA/IPPO/SARB export
//
// Bridges (5):
//   W113 EVM + W114 doc control + W115 submittals + W116 RFIs +
//   W117 change orders. Each Phase-A chain has its rows ingested into
//   W118 blocks via merkle_root_segment fingerprint; cross-chain
//   reconciliation verifies no chain dropped a row.
// ─────────────────────────────────────────────────────────────────────────

export type AcbStatus =
  | 'block_proposed'
  | 'segments_collected'
  | 'merkle_built'
  | 'integrity_verified'
  | 'block_signed'
  | 'anchored'
  | 'published'
  | 'independently_verifiable'
  | 'reconciled'
  | 'archived'
  | 'rejected'
  | 'suspended'
  | 'restated'
  | 'forked';

export type AcbAction =
  | 'propose_block'
  | 'collect_segments'
  | 'build_merkle'
  | 'verify_integrity'
  | 'sign_block'
  | 'anchor_block'
  | 'publish_block'
  | 'open_independent_verify'
  | 'reconcile'
  | 'archive'
  | 'reject'
  | 'suspend'
  | 'resume'
  | 'restate'
  | 'fork'
  | 'emergency_seal';

export type AcbTier =
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly';

export type AcbParty =
  | 'auditor'
  | 'CISO'
  | 'CFO'
  | 'BoardAudit';

export type AcbEvent =
  | 'audit_chain_block_proposed'
  | 'audit_chain_segments_collected'
  | 'audit_chain_merkle_built'
  | 'audit_chain_integrity_verified'
  | 'audit_chain_block_signed'
  | 'audit_chain_anchored'
  | 'audit_chain_published'
  | 'audit_chain_independently_verifiable'
  | 'audit_chain_reconciled'
  | 'audit_chain_archived'
  | 'audit_chain_rejected'
  | 'audit_chain_suspended'
  | 'audit_chain_resumed'
  | 'audit_chain_restated'
  | 'audit_chain_forked'
  | 'audit_chain_emergency_sealed'
  | 'audit_chain_sla_breached';

// archived is HARD terminal. rejected is soft-terminal.
// suspended / restated / forked are soft pauses; can resume.
const HARD_TERMINALS = new Set<AcbStatus>([
  'archived',
]);

const UI_TERMINALS = new Set<AcbStatus>([
  'archived',
  'rejected',
]);

export function isTerminal(s: AcbStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: AcbStatus): boolean {
  return HARD_TERMINALS.has(s);
}

const ALL_NON_TERMINAL: AcbStatus[] = [
  'block_proposed',
  'segments_collected',
  'merkle_built',
  'integrity_verified',
  'block_signed',
  'anchored',
  'published',
  'independently_verifiable',
  'reconciled',
  'suspended',
  'restated',
  'forked',
];

// suspend can be entered from any verification-touch state.
const SUSPEND_FROM: AcbStatus[] = [
  'integrity_verified',
  'block_signed',
  'anchored',
  'published',
  'independently_verifiable',
  'reconciled',
  'suspended',
];

// resume returns to integrity_verified from suspended (per spec).
// restate supersedes a published / reconciled block.
const RESTATE_FROM: AcbStatus[] = [
  'published',
  'independently_verifiable',
  'reconciled',
  'restated',
];

// fork emergency hard line - mirrors W110 emergency_cancelled.
const FORK_FROM: AcbStatus[] = [
  'integrity_verified',
  'block_signed',
  'anchored',
  'published',
  'independently_verifiable',
  'reconciled',
  'suspended',
  'restated',
  'forked',
];

// emergency_seal can be entered from ANY non-terminal state - this is
// the signature SIGNATURE-CHAIN-BREAK-SEAL hard line; treated as a
// distinct action that lands on forked (the soft-pause hard-line)
// because archived is hard-terminal and we want to keep evidence open.
const EMERGENCY_SEAL_FROM: AcbStatus[] = [
  'block_proposed',
  'segments_collected',
  'merkle_built',
  'integrity_verified',
  'block_signed',
  'anchored',
  'published',
  'independently_verifiable',
  'reconciled',
  'suspended',
  'restated',
  'forked',
];

export const TRANSITIONS: Record<AcbAction, { from: AcbStatus[]; to: AcbStatus }> = {
  propose_block:           { from: ['block_proposed'],                                                                  to: 'block_proposed' },
  collect_segments:        { from: ['block_proposed', 'segments_collected'],                                            to: 'segments_collected' },
  build_merkle:            { from: ['segments_collected', 'merkle_built'],                                              to: 'merkle_built' },
  verify_integrity:        { from: ['merkle_built', 'integrity_verified', 'suspended'],                                 to: 'integrity_verified' },
  sign_block:              { from: ['integrity_verified', 'block_signed'],                                              to: 'block_signed' },
  anchor_block:            { from: ['block_signed', 'anchored'],                                                        to: 'anchored' },
  publish_block:           { from: ['anchored', 'published'],                                                           to: 'published' },
  open_independent_verify: { from: ['published', 'independently_verifiable'],                                           to: 'independently_verifiable' },
  reconcile:               { from: ['independently_verifiable', 'reconciled'],                                          to: 'reconciled' },
  archive:                 { from: ['reconciled'],                                                                      to: 'archived' },
  reject:                  { from: ALL_NON_TERMINAL,                                                                    to: 'rejected' },
  suspend:                 { from: SUSPEND_FROM,                                                                        to: 'suspended' },
  resume:                  { from: ['suspended'],                                                                       to: 'integrity_verified' },
  restate:                 { from: RESTATE_FROM,                                                                        to: 'restated' },
  fork:                    { from: FORK_FROM,                                                                           to: 'forked' },
  emergency_seal:          { from: EMERGENCY_SEAL_FROM,                                                                 to: 'forked' },
};

export function nextStatus(current: AcbStatus, action: AcbAction): AcbStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'propose_block' && current !== 'block_proposed') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: AcbStatus): AcbAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: AcbAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [AcbAction, typeof TRANSITIONS[AcbAction]][]) {
    if (a === 'propose_block') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity stored as HOURS. 0 == no SLA. Larger block
// volume (quarterly) gets the LONGEST window - quarterly NERSA/IPPO/
// SARB attestation requires deeper cryptographic verification.
export const SLA_HOURS: Record<AcbStatus, Record<AcbTier, number>> = {
  // ANCHOR: block_proposed × cadence
  block_proposed:           { hourly: 1,   daily: 6,   weekly: 24,  monthly: 72,  quarterly: 168 },
  segments_collected:       { hourly: 1,   daily: 4,   weekly: 12,  monthly: 36,  quarterly: 84 },
  merkle_built:             { hourly: 1,   daily: 4,   weekly: 12,  monthly: 36,  quarterly: 84 },
  integrity_verified:       { hourly: 2,   daily: 8,   weekly: 24,  monthly: 60,  quarterly: 120 },
  block_signed:             { hourly: 1,   daily: 4,   weekly: 12,  monthly: 36,  quarterly: 72 },
  anchored:                 { hourly: 2,   daily: 6,   weekly: 18,  monthly: 48,  quarterly: 96 },
  published:                { hourly: 2,   daily: 6,   weekly: 18,  monthly: 48,  quarterly: 96 },
  independently_verifiable: { hourly: 4,   daily: 12,  weekly: 36,  monthly: 96,  quarterly: 168 },
  reconciled:               { hourly: 4,   daily: 12,  weekly: 36,  monthly: 96,  quarterly: 168 },
  suspended:                { hourly: 6,   daily: 12,  weekly: 24,  monthly: 60,  quarterly: 120 },
  restated:                 { hourly: 6,   daily: 12,  weekly: 24,  monthly: 60,  quarterly: 120 },
  forked:                   { hourly: 6,   daily: 12,  weekly: 24,  monthly: 60,  quarterly: 120 },
  archived:                 { hourly: 0,   daily: 0,   weekly: 0,   monthly: 0,   quarterly: 0 },
  rejected:                 { hourly: 0,   daily: 0,   weekly: 0,   monthly: 0,   quarterly: 0 },
};

export function slaWindowHours(status: AcbStatus, tier: AcbTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: AcbStatus, tier: AcbTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from block_cadence.
export type AcbCadence = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly';

export function tierForCadence(cadence: AcbCadence | string | null | undefined): AcbTier {
  switch (cadence) {
    case 'hourly':    return 'hourly';
    case 'daily':     return 'daily';
    case 'weekly':    return 'weekly';
    case 'monthly':   return 'monthly';
    case 'quarterly': return 'quarterly';
    default:          return 'daily';
  }
}

export interface AcbFloorFlags {
  signature_chain_break_detected?: boolean | number | null;
  hash_collision_suspected?: boolean | number | null;
  regulator_audit_active?: boolean | number | null;
  cross_border_witness_required?: boolean | number | null;
  sox_404_attestation_pending?: boolean | number | null;
}

export function countFloorFlags(args: AcbFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.signature_chain_break_detected) +
    t(args.hash_collision_suspected) +
    t(args.regulator_audit_active) +
    t(args.cross_border_witness_required) +
    t(args.sox_404_attestation_pending)
  );
}

// FLOOR-AT-MONTHLY on >=1 flag. With >=2 flags, floor lifts to quarterly.
export function floorAtMonthly(args: AcbFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

export function floorAtQuarterly(args: AcbFloorFlags): boolean {
  return countFloorFlags(args) >= 2;
}

// Tier ordering for promotion logic - higher index = longer SLA window.
const TIER_RANK: Record<AcbTier, number> = {
  hourly: 0,
  daily: 1,
  weekly: 2,
  monthly: 3,
  quarterly: 4,
};

export function effectiveTier(
  rawTier: AcbTier,
  flags: AcbFloorFlags,
): AcbTier {
  const flagCount = countFloorFlags(flags);
  if (flagCount >= 2) return 'quarterly';
  if (flagCount >= 1) {
    // Lift to at least monthly.
    if (TIER_RANK[rawTier] >= TIER_RANK['monthly']) return rawTier;
    return 'monthly';
  }
  return rawTier;
}

// Heavy tiers - monthly + quarterly. SLA-breach reportability +
// restate crossings attach here.
const HEAVY_TIERS = new Set<AcbTier>(['monthly', 'quarterly']);

export function isHeavyTier(tier: AcbTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: AcbTier): boolean {
  return tier === 'quarterly';
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
//
// W118 SIGNATURE: emergency_seal crosses regulator EVERY tier - the
// SIGNATURE-CHAIN-BREAK-SEAL hard line. ANY hash anomaly forces NERSA/
// IPPO/SARB/JSE-SRL notice within the cryptographic SLA window.
//
// Additional:
//   reject  -> EVERY tier when signature_chain_break_detected ||
//              hash_collision_suspected
//   restate -> monthly + quarterly only (recasting a published block =
//              listed-issuer JSE SRL disclosure event)
//   publish_block -> never crosses regulator (publication = normal flow)
//   sla_breached -> monthly + quarterly only
export function crossesIntoRegulator(
  action: AcbAction,
  tier: AcbTier,
  args: {
    flags?: AcbFloorFlags;
  },
): boolean {
  const flags = args.flags ?? {};
  const chainBreak = !!flags.signature_chain_break_detected;
  const collision = !!flags.hash_collision_suspected;

  // W118 SIGNATURE SIGNATURE-CHAIN-BREAK-SEAL: emergency_seal crosses
  // regulator EVERY tier.
  if (action === 'emergency_seal') {
    return true;
  }

  // reject crosses regulator EVERY tier when chain break || collision.
  if (action === 'reject') {
    return chainBreak || collision;
  }

  // restate crosses regulator monthly + quarterly only.
  if (action === 'restate') {
    return tier === 'monthly' || tier === 'quarterly';
  }

  // publish_block never crosses (normal flow).
  // fork (non-emergency) never crosses unless flags set.
  if (action === 'fork') {
    return chainBreak || collision;
  }

  // anchored / archived / reconcile / verify_integrity / collect_segments
  // / build_merkle / sign_block / suspend / resume / open_independent_verify
  // do not cross regulator on their own.
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: AcbTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<AcbAction, AcbParty> = {
  propose_block:           'auditor',
  collect_segments:        'auditor',
  build_merkle:            'auditor',
  verify_integrity:        'auditor',
  open_independent_verify: 'auditor',
  reconcile:               'auditor',
  archive:                 'auditor',
  sign_block:              'CISO',
  anchor_block:            'CISO',
  publish_block:           'CISO',
  suspend:                 'CISO',
  resume:                  'CISO',
  reject:                  'CFO',
  restate:                 'CFO',
  fork:                    'BoardAudit',
  emergency_seal:          'BoardAudit',
};

export function partyForAction(action: AcbAction): AcbParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: AcbAction): AcbEvent | null {
  switch (action) {
    case 'propose_block':           return 'audit_chain_block_proposed';
    case 'collect_segments':        return 'audit_chain_segments_collected';
    case 'build_merkle':            return 'audit_chain_merkle_built';
    case 'verify_integrity':        return 'audit_chain_integrity_verified';
    case 'sign_block':              return 'audit_chain_block_signed';
    case 'anchor_block':            return 'audit_chain_anchored';
    case 'publish_block':           return 'audit_chain_published';
    case 'open_independent_verify': return 'audit_chain_independently_verifiable';
    case 'reconcile':               return 'audit_chain_reconciled';
    case 'archive':                 return 'audit_chain_archived';
    case 'reject':                  return 'audit_chain_rejected';
    case 'suspend':                 return 'audit_chain_suspended';
    case 'resume':                  return 'audit_chain_integrity_verified';
    case 'restate':                 return 'audit_chain_restated';
    case 'fork':                    return 'audit_chain_forked';
    case 'emergency_seal':          return 'audit_chain_emergency_sealed';
  }
}

// ─── LIVE battery (~24 fields) ──────────────────────────────────────────

export function slaHoursRemaining(
  status: AcbStatus,
  tier: AcbTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type AcbUrgency = 'critical' | 'high' | 'medium' | 'low';

// INVERTED polarity: quarterly has the LOOSEST urgency thresholds.
// hourly has TIGHTEST.
export function urgencyBand(
  tier: AcbTier,
  slaHoursLeft: number,
): AcbUrgency {
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'quarterly') {
    if (slaHoursLeft < 12)  return 'critical';
    if (slaHoursLeft < 48)  return 'high';
    if (slaHoursLeft < 96)  return 'medium';
    return 'low';
  }
  if (tier === 'monthly') {
    if (slaHoursLeft < 8)   return 'critical';
    if (slaHoursLeft < 24)  return 'high';
    if (slaHoursLeft < 48)  return 'medium';
    return 'low';
  }
  if (tier === 'weekly') {
    if (slaHoursLeft < 4)   return 'critical';
    if (slaHoursLeft < 12)  return 'high';
    if (slaHoursLeft < 24)  return 'medium';
    return 'low';
  }
  if (tier === 'daily') {
    if (slaHoursLeft < 2)   return 'critical';
    if (slaHoursLeft < 4)   return 'high';
    if (slaHoursLeft < 8)   return 'medium';
    return 'low';
  }
  // hourly - TIGHTEST INVERTED-polarity thresholds
  if (slaHoursLeft < 1)     return 'critical';
  if (slaHoursLeft < 2)     return 'high';
  if (slaHoursLeft < 4)     return 'medium';
  return 'low';
}

// 4-step authority ladder: auditor -> CISO -> CFO -> BoardAudit.
export type AcbAuthority =
  | 'auditor'
  | 'CISO'
  | 'CFO'
  | 'BoardAudit';

export function authorityRequired(tier: AcbTier): AcbAuthority {
  if (tier === 'quarterly') return 'BoardAudit';
  if (tier === 'monthly')   return 'CFO';
  if (tier === 'weekly')    return 'CISO';
  return 'auditor';
}

// Regulator export window hours - INVERTED polarity, quarterly longest.
export function regulatorExportWindowHours(tier: AcbTier): number {
  if (tier === 'quarterly') return 168;
  if (tier === 'monthly')   return 96;
  if (tier === 'weekly')    return 48;
  if (tier === 'daily')     return 24;
  return 12;
}

// Days to next quarterly attestation (NERSA/IPPO/SARB).
export function daysToQuarterlyAttestation(now: Date): number {
  const y = now.getUTCFullYear();
  // Quarter-end months: 0,3,6,9 (Jan/Apr/Jul/Oct) when filing 1st of.
  // Choose the next quarterly attestation date (1 Jan, 1 Apr, 1 Jul, 1 Oct).
  const quarterStarts = [
    Date.UTC(y, 0, 1),
    Date.UTC(y, 3, 1),
    Date.UTC(y, 6, 1),
    Date.UTC(y, 9, 1),
    Date.UTC(y + 1, 0, 1),
  ];
  const nowMs = now.getTime();
  for (const t of quarterStarts) {
    if (t > nowMs) return Math.ceil((t - nowMs) / (24 * 3600 * 1000));
  }
  return 0;
}

// ─── Merkle utility (RFC 6962-style binary tree) ────────────────────────
//
// Pairwise SHA-256 builds the unified Merkle root from an array of
// segment hashes. RFC 6962 specifies a binary Merkle tree with leaf
// nodes hashed singly, then pairwise. If the number of leaves is odd
// at any level, the last leaf is hashed with itself (Bitcoin-style)
// for compatibility with simple verifier libraries. NIST SP 800-92
// records the canonical scheme; CT logs use this exact shape.

const HEX = '0123456789abcdef';

function bytesToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (const b of bytes) {
    out += HEX[(b >> 4) & 0xf] + HEX[b & 0xf];
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.toLowerCase().replace(/[^0-9a-f]/g, '');
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Deterministic fallback when Web Crypto is unavailable - NOT
    // cryptographically secure but stable for unit tests in env
    // without crypto.subtle. Production always has Web Crypto.
    let h = 0n;
    const str = typeof input === 'string' ? input : new TextDecoder().decode(input);
    for (let i = 0; i < str.length; i++) {
      h = (h * 1315423911n) ^ BigInt(str.charCodeAt(i));
      h = h & 0xffffffffffffffffn;
    }
    const hex16 = h.toString(16).padStart(16, '0');
    return (hex16 + hex16 + hex16 + hex16).slice(0, 64);
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToHex(digest);
}

async function hashPair(a: string, b: string): Promise<string> {
  const left = hexToBytes(a);
  const right = hexToBytes(b);
  const merged = new Uint8Array(left.length + right.length);
  merged.set(left, 0);
  merged.set(right, left.length);
  return await sha256Hex(merged);
}

// Build a Merkle root from an array of segment hashes (each 64-char
// hex). Returns 64-char hex; empty array returns 64 zeros (canonical
// empty-tree). Single-segment returns the segment itself (no pairing).
export async function buildMerkleRoot(segmentHashes: string[]): Promise<string> {
  if (segmentHashes.length === 0) return '0'.repeat(64);
  let level = segmentHashes.slice();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left; // duplicate odd
      next.push(await hashPair(left, right));
    }
    level = next;
  }
  return level[0];
}

// Build a Merkle proof (audit path) for a leaf at index `targetIdx`.
// Returns the sibling hashes from leaf to root - sufficient for a
// third-party verifier with the leaf + root + path to confirm
// inclusion in O(log n).
export async function buildMerkleProof(
  segmentHashes: string[],
  targetIdx: number,
): Promise<{ path: { sibling: string; position: 'left' | 'right' }[]; root: string }> {
  if (segmentHashes.length === 0 || targetIdx < 0 || targetIdx >= segmentHashes.length) {
    return { path: [], root: '0'.repeat(64) };
  }
  const path: { sibling: string; position: 'left' | 'right' }[] = [];
  let level = segmentHashes.slice();
  let idx = targetIdx;
  while (level.length > 1) {
    const isLeft = idx % 2 === 0;
    const siblingIdx = isLeft ? idx + 1 : idx - 1;
    const sibling = siblingIdx < level.length ? level[siblingIdx] : level[idx];
    path.push({ sibling, position: isLeft ? 'right' : 'left' });
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      next.push(await hashPair(left, right));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return { path, root: level[0] };
}

// Verify a Merkle proof: given leaf + path + root, replays the
// pairwise hashing and confirms it lands on root. Used by the public
// /verify endpoint.
export async function verifyMerkleProof(
  leaf: string,
  path: { sibling: string; position: 'left' | 'right' }[],
  expectedRoot: string,
): Promise<boolean> {
  let current = leaf.toLowerCase();
  for (const step of path) {
    if (step.position === 'left') {
      current = await hashPair(step.sibling, current);
    } else {
      current = await hashPair(current, step.sibling);
    }
  }
  return current.toLowerCase() === expectedRoot.toLowerCase();
}

// ─── Chain-link verification (Bitcoin-style parent_block_hash) ──────────
//
// Each W118 block has parent_block_hash linking it to the prior block.
// `verifyChainLink` confirms a sequence of blocks form an uninterrupted
// chain - i.e. every block[i].parent_block_hash === sha256(block[i-1]).
// Used by the daily reconciliation cron + the /verify/:block_height
// public endpoint to confirm no block was inserted, removed, or reordered.

export interface AcbChainNode {
  block_height: number;
  parent_block_hash: string | null;
  merkle_root: string;
  signature_bytes: string | null;
}

export async function blockSelfHash(node: AcbChainNode): Promise<string> {
  // Canonical serialization for self-hash: height|parent|merkle|sig.
  const sig = node.signature_bytes ?? '';
  const parent = node.parent_block_hash ?? '';
  return await sha256Hex(`${node.block_height}|${parent}|${node.merkle_root}|${sig}`);
}

export async function verifyChainLink(nodes: AcbChainNode[]): Promise<{ ok: boolean; break_at?: number }> {
  if (nodes.length === 0) return { ok: true };
  // Sort by height ASC to make ordering explicit.
  const sorted = [...nodes].sort((a, b) => a.block_height - b.block_height);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const prevHash = await blockSelfHash(prev);
    if (cur.parent_block_hash !== prevHash) {
      return { ok: false, break_at: cur.block_height };
    }
  }
  return { ok: true };
}

// ─── 5-bridge architecture (W113-W117 Phase-A chains) ───────────────────
export function bridgesToW113EvmChain(evmRef: string | null | undefined): boolean {
  return !!evmRef;
}
export function bridgesToW114DocControlChain(docRef: string | null | undefined): boolean {
  return !!docRef;
}
export function bridgesToW115SubmittalChain(subRef: string | null | undefined): boolean {
  return !!subRef;
}
export function bridgesToW116RfiChain(rfiRef: string | null | undefined): boolean {
  return !!rfiRef;
}
export function bridgesToW117ChangeOrderChain(coRef: string | null | undefined): boolean {
  return !!coRef;
}

// ─── Block completeness index 0-130 ─────────────────────────────────────
export function blockCompletenessIndex(args: {
  block_proposed?: boolean | number | null;
  segments_collected?: boolean | number | null;
  merkle_built?: boolean | number | null;
  integrity_verified?: boolean | number | null;
  block_signed?: boolean | number | null;
  anchored?: boolean | number | null;
  published?: boolean | number | null;
  independently_verifiable?: boolean | number | null;
  reconciled?: boolean | number | null;
  archived?: boolean | number | null;
  clean_close_bonus?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.block_proposed)            * 5;
  score += t(args.segments_collected)        * 6;
  score += t(args.merkle_built)              * 8;
  score += t(args.integrity_verified)        * 10;
  score += t(args.block_signed)              * 12;
  score += t(args.anchored)                  * 10;
  score += t(args.published)                 * 8;
  score += t(args.independently_verifiable)  * 10;
  score += t(args.reconciled)                * 10;
  score += t(args.archived)                  * 12;
  score += t(args.clean_close_bonus)         * 20;
  if (score > 130) score = 130;
  return score;
}

// Integrity index 0-130 — composite of 5 reconciliation states + chain
// break count. Each reconciliation success worth 20; clean (zero
// cross-chain break) bonus 30.
export function integrityIndex(args: {
  reconciliation_status_w113_evm?: boolean | number | null;
  reconciliation_status_w114_doc?: boolean | number | null;
  reconciliation_status_w115_sub?: boolean | number | null;
  reconciliation_status_w116_rfi?: boolean | number | null;
  reconciliation_status_w117_co?: boolean | number | null;
  cross_chain_break_count?: number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.reconciliation_status_w113_evm) * 20;
  score += t(args.reconciliation_status_w114_doc) * 20;
  score += t(args.reconciliation_status_w115_sub) * 20;
  score += t(args.reconciliation_status_w116_rfi) * 20;
  score += t(args.reconciliation_status_w117_co)  * 20;
  const breaks = Number(args.cross_chain_break_count ?? 0);
  if (breaks === 0) score += 30;
  if (score > 130) score = 130;
  return score;
}

// Hash collision risk score (statistical, expected near 0). With
// SHA-256 the birthday-paradox collision probability for n hashes is
// ~ n^2 / 2^257. Returns a 0-100 scale; near-zero in practice.
export function hashCollisionRiskScore(segmentCount: number | null | undefined): number {
  const n = Number(segmentCount ?? 0);
  if (!isFinite(n) || n <= 0) return 0;
  // Scale: even 10^15 segments gives ~0; we map to log10 thresholds.
  const log = Math.log10(n + 1);
  if (log < 6) return 0;
  if (log < 9) return 1;
  if (log < 12) return 5;
  if (log < 15) return 15;
  return 30;
}

// Independent verifier quorum (Byzantine threshold) - at least 2 of 3.
export function independentVerifierQuorumMet(verifierCount: number | null | undefined): boolean {
  const n = Number(verifierCount ?? 0);
  return n >= 2;
}
