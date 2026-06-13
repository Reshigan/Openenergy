// ─────────────────────────────────────────────────────────────────────────
// Wave 124 - STRATE / SWIFT Settlement Connector.
//
// PHASE C WAVE 3 OF 5. The MONEY-IN/MONEY-OUT financial settlement
// spine. Where W122 = substation-grade SCADA bridge and W123 = IIoT
// broker fleet, W124 = real bidirectional integration to STRATE
// (SA Central Securities Depository), SWIFT MT/MX correspondent
// network, SARB SAMOS RTGS, SADC RTGS, and commercial bank
// EFT/ACH gateways.
//
// Standards covered:
//   - ISO 20022 XML financial messages (pacs/camt/pain/admi/auth)
//   - SWIFT MT legacy text 1xx/2xx/9xx series
//   - SWIFT MX (ISO 20022 wrapper)
//   - STRATE T+3 equities / T+1 bonds (SA CSD)
//   - SARB SAMOS RTGS (real-time gross settlement)
//   - SADC RTGS (regional cross-border)
//   - SARB Exchange Control Regulations (ExCon)
//   - Financial Intelligence Centre Act (FIC Act AML/CFT)
//   - Basel III LCR (Liquidity Coverage Ratio)
//   - Basel III NSFR (Net Stable Funding Ratio)
//   - ISO 27001 + PCI-DSS + PA-DSS
//   - SARB BA 700 + EMIR EU equivalence
//   - CPMI-IOSCO PFMI Principle 9 (money settlements)
//
// Beats: SWIFT Alliance Access + Bottomline B2B + Cyrus + FIS Open
// Payments Hub + ACI Worldwide Universal Payments + TCS BaNCS Payments
// + Volante VolPay + Finastra Payments-as-a-Service + Temenos Transact
// Payments + Murex MX.3 Post-Trade + Calypso Treasury + Misys Loan IQ.
//
// 11-state forward path + 4 branch states:
//   connector_proposed -> bic_validated -> bank_handshake_completed ->
//     iso20022_schemas_loaded -> messaging_session_established ->
//     test_messages_validated -> reconciliation_account_bound ->
//     live_settlement_active -> cycle_reconciled -> archived (HARD)
//   any non-terminal -> disconnect -> disconnected (HARD - counterparty
//     BIC suspended)
//   any non-terminal -> revoke_credential -> credential_revoked
//     (HARD - SWIFT user-key compromise; FIC Act s28A reportable)
//   any active -> suspend -> suspended (SOFT - SARB scheduled
//     maintenance window)
//   any live -> activate_failover -> failover_active (SOFT - primary
//     to secondary BIC cutover)
//
// Tier RE-DERIVED on every transition from settlement_value_zar_per
// _cycle with FLOOR-AT-SAMOS-RTGS on >=1 of 5 contextual flags;
// FLOOR-AT-SWIFT-GLOBAL on >=3 flags:
//   - cross_border_payment                   (SADC + global wire)
//   - sarb_excon_authorization_required      (SARB ExCon)
//   - fic_act_high_risk_jurisdiction         (FATF/FIC Act AML)
//   - basel_lcr_tier1_collateral             (Basel III LCR Tier1)
//   - cpmi_iosco_pfmi_principle9_systemic    (CPMI PFMI systemic)
//
// 5 tiers (INVERTED polarity - LARGER settlement scope = MORE
// onboarding + validation time):
//   domestic_eft        : 168h    (single-bank ACH/EFT rail)
//   multi_bank_eft      : 240h    (multi-bank EFT mesh)
//   strate_csd          : 360h    (CSD link - equities/bonds)
//   samos_rtgs          : 480h    (SARB SAMOS RTGS direct)
//   swift_global        : 720h    (SWIFT MT/MX global correspondent)
//
// FLOOR-AT-SAMOS-RTGS on >=1 flag. FLOOR-AT-SWIFT-GLOBAL on >=3 flags.
//
// SIGNATURE Phase-C regulator crossings (SARB ExCon + FIC Act +
// Basel III + CPMI-IOSCO PFMI):
//   revoke_credential -> EVERY tier (W124 SIGNATURE STRATE-SWIFT-
//     CONNECTOR-REVOKE hard line - SWIFT user-key compromise =
//     mandatory SARB + FIC Act s28A + SOC report; sister of W122
//     SCADA-CONNECTOR-REVOKE + W123 MQTT-OPCUA-REVOKE.)
//   activate_failover -> samos_rtgs + swift_global only.
//   disconnect -> EVERY tier WHEN cpmi_iosco_pfmi_principle9_systemic
//     (Systemic settlement disconnect = automatic CPMI reportable.)
//   authorize_live_settlement -> swift_global only (Cross-border
//     global correspondent requires SARB ExCon clearance.)
//   settle_cycle when sarb_excon_authorization_required AND
//     excon_authorization_status_live=expired -> EVERY tier (FIC Act
//     material exposure.)
//   sla_breached -> samos_rtgs + swift_global only.
//
// Write {admin, trader, lender, offtaker}. READ all 9 personas +
// EXTERNAL `bank_counterparty` pseudo-persona via mTLS-gated PUBLIC
// /api/strate-swift-connector/peer/:peer_id (Phase-C standard;
// uses `x-mtls-cert-fingerprint` header).
//
// actor_party split (4-step authority ladder):
//   settlements_clerk    : propose_connector / validate_bic /
//                          complete_bank_handshake /
//                          load_iso20022_schemas /
//                          establish_messaging_session /
//                          validate_test_messages /
//                          bind_reconciliation_account
//   settlements_manager  : authorize_live_settlement /
//                          activate_failover / suspend / resume /
//                          settle_cycle
//   CFO                  : activate_reconciliation / disconnect /
//                          revoke_credential
//   CEO                  : archive
//
// Event prefix: `strate_swift_connector_evt_`. AUDIT_PREFIX_MAP entry:
//   strate_swift_connector: 'settlement'  (NEW 'settlement' role-
//   suffixed namespace - introduced by W124. Distinct from W122/W123
//   'grid' namespace because settlements are financial, not grid OT.)
//
// Three crons:
//   - */15 * * * *        SLA sweep (shared with all chains)
//   - 30 1 * * *          daily settlement reconciliation (NEW -
//                         01:30 UTC = 03:30 SAST post-SAMOS EOD)
//   - 0 7 * * 1           weekly SWIFT user-key expiry scan (shared
//                         with W122/W123 trigger)
//
// Five bridges (W118 + W120 BOTH MANDATORY tamper-evidence):
//   W120 reconciliation attestation (MANDATORY - every settlement
//   cycle paired to W120 attestation block) + W68 counterparty margin
//   (settlement-driven margin call lift) + W3 settlement P6 (DvP
//   atomic-leg integration with existing platform settlement spine) +
//   W21 drawdown (lender disbursement rail uses STRATE/SWIFT pipe) +
//   W118 audit chain (MANDATORY - every settlement message hashed
//   into W118 spine).
// ─────────────────────────────────────────────────────────────────────────

export type SscStatus =
  | 'connector_proposed'
  | 'bic_validated'
  | 'bank_handshake_completed'
  | 'iso20022_schemas_loaded'
  | 'messaging_session_established'
  | 'test_messages_validated'
  | 'reconciliation_account_bound'
  | 'live_settlement_active'
  | 'cycle_reconciled'
  | 'archived'
  | 'disconnected'
  | 'credential_revoked'
  | 'suspended'
  | 'failover_active';

export type SscAction =
  | 'propose_connector'
  | 'validate_bic'
  | 'complete_bank_handshake'
  | 'load_iso20022_schemas'
  | 'establish_messaging_session'
  | 'validate_test_messages'
  | 'bind_reconciliation_account'
  | 'authorize_live_settlement'
  | 'activate_reconciliation'
  | 'archive'
  | 'disconnect'
  | 'suspend'
  | 'resume'
  | 'revoke_credential'
  | 'activate_failover'
  | 'settle_cycle';

export type SscTier =
  | 'domestic_eft'
  | 'multi_bank_eft'
  | 'strate_csd'
  | 'samos_rtgs'
  | 'swift_global';

export type SscParty =
  | 'settlements_clerk'
  | 'settlements_manager'
  | 'CFO'
  | 'CEO';

export type SscEvent =
  | 'strate_swift_connector_proposed'
  | 'strate_swift_connector_bic_validated'
  | 'strate_swift_connector_bank_handshake_completed'
  | 'strate_swift_connector_iso20022_schemas_loaded'
  | 'strate_swift_connector_messaging_session_established'
  | 'strate_swift_connector_test_messages_validated'
  | 'strate_swift_connector_reconciliation_account_bound'
  | 'strate_swift_connector_live_settlement_active'
  | 'strate_swift_connector_cycle_reconciled'
  | 'strate_swift_connector_archived'
  | 'strate_swift_connector_disconnected'
  | 'strate_swift_connector_suspended'
  | 'strate_swift_connector_resumed'
  | 'strate_swift_connector_credential_revoked'
  | 'strate_swift_connector_failover_activated'
  | 'strate_swift_connector_cycle_settled'
  | 'strate_swift_connector_sla_breached';

// HARD terminals: archived (clean close), disconnected (counterparty
// hard fail), credential_revoked (SWIFT user-key compromise).
// suspended and failover_active are SOFT pauses that can resume back
// into live settlement.
const HARD_TERMINALS = new Set<SscStatus>([
  'archived',
  'disconnected',
  'credential_revoked',
]);

export function isTerminal(s: SscStatus): boolean {
  return HARD_TERMINALS.has(s);
}

export function isHardTerminal(s: SscStatus): boolean {
  return HARD_TERMINALS.has(s);
}

const ALL_NON_TERMINAL: SscStatus[] = [
  'connector_proposed',
  'bic_validated',
  'bank_handshake_completed',
  'iso20022_schemas_loaded',
  'messaging_session_established',
  'test_messages_validated',
  'reconciliation_account_bound',
  'live_settlement_active',
  'cycle_reconciled',
  'suspended',
  'failover_active',
];

// suspend can be entered from any active state up to cycle_reconciled.
const SUSPEND_FROM: SscStatus[] = [
  'bic_validated',
  'bank_handshake_completed',
  'iso20022_schemas_loaded',
  'messaging_session_established',
  'test_messages_validated',
  'reconciliation_account_bound',
  'live_settlement_active',
  'cycle_reconciled',
];

// activate_failover only applies to live or cycle_reconciled.
const FAILOVER_FROM: SscStatus[] = [
  'live_settlement_active',
  'cycle_reconciled',
];

export const TRANSITIONS: Record<SscAction, { from: SscStatus[]; to: SscStatus }> = {
  propose_connector:           { from: ['connector_proposed'],                                                                  to: 'connector_proposed' },
  validate_bic:                { from: ['connector_proposed', 'bic_validated'],                                                 to: 'bic_validated' },
  complete_bank_handshake:     { from: ['bic_validated', 'bank_handshake_completed'],                                           to: 'bank_handshake_completed' },
  load_iso20022_schemas:       { from: ['bank_handshake_completed', 'iso20022_schemas_loaded'],                                 to: 'iso20022_schemas_loaded' },
  establish_messaging_session: { from: ['iso20022_schemas_loaded', 'messaging_session_established'],                            to: 'messaging_session_established' },
  validate_test_messages:      { from: ['messaging_session_established', 'test_messages_validated'],                            to: 'test_messages_validated' },
  bind_reconciliation_account: { from: ['test_messages_validated', 'reconciliation_account_bound'],                             to: 'reconciliation_account_bound' },
  authorize_live_settlement:   { from: ['reconciliation_account_bound', 'live_settlement_active', 'suspended', 'failover_active'], to: 'live_settlement_active' },
  activate_reconciliation:     { from: ['live_settlement_active', 'cycle_reconciled'],                                          to: 'cycle_reconciled' },
  archive:                     { from: ['cycle_reconciled'],                                                                    to: 'archived' },
  disconnect:                  { from: ALL_NON_TERMINAL,                                                                        to: 'disconnected' },
  suspend:                     { from: SUSPEND_FROM,                                                                            to: 'suspended' },
  resume:                      { from: ['suspended'],                                                                           to: 'live_settlement_active' },
  revoke_credential:           { from: ALL_NON_TERMINAL,                                                                        to: 'credential_revoked' },
  activate_failover:           { from: FAILOVER_FROM,                                                                           to: 'failover_active' },
  settle_cycle:                { from: ['live_settlement_active', 'cycle_reconciled'],                                          to: 'cycle_reconciled' },
};

export function nextStatus(current: SscStatus, action: SscAction): SscStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'propose_connector' && current !== 'connector_proposed') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: SscStatus): SscAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: SscAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [SscAction, typeof TRANSITIONS[SscAction]][]) {
    if (a === 'propose_connector') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity stored as HOURS. 0 == no SLA. Larger
// settlement scope = LONGER onboarding runway. SWIFT global
// correspondent requires the most prep (BIC chain depth + SARB ExCon +
// 4-eyes settlement controls + handover).
export const SLA_HOURS: Record<SscStatus, Record<SscTier, number>> = {
  // ANCHOR: connector_proposed - the proposal window.
  connector_proposed:           { domestic_eft: 168, multi_bank_eft: 240, strate_csd: 360, samos_rtgs: 480, swift_global: 720 },
  bic_validated:                { domestic_eft: 120, multi_bank_eft: 168, strate_csd: 240, samos_rtgs: 320, swift_global: 480 },
  bank_handshake_completed:     { domestic_eft: 96,  multi_bank_eft: 144, strate_csd: 192, samos_rtgs: 240, swift_global: 360 },
  iso20022_schemas_loaded:      { domestic_eft: 72,  multi_bank_eft: 96,  strate_csd: 144, samos_rtgs: 192, swift_global: 240 },
  messaging_session_established:{ domestic_eft: 48,  multi_bank_eft: 72,  strate_csd: 96,  samos_rtgs: 144, swift_global: 192 },
  test_messages_validated:      { domestic_eft: 72,  multi_bank_eft: 96,  strate_csd: 144, samos_rtgs: 192, swift_global: 240 },
  reconciliation_account_bound: { domestic_eft: 96,  multi_bank_eft: 120, strate_csd: 168, samos_rtgs: 240, swift_global: 360 },
  live_settlement_active:       { domestic_eft: 168, multi_bank_eft: 240, strate_csd: 360, samos_rtgs: 480, swift_global: 720 },
  cycle_reconciled:             { domestic_eft: 168, multi_bank_eft: 240, strate_csd: 360, samos_rtgs: 480, swift_global: 720 },
  suspended:                    { domestic_eft: 72,  multi_bank_eft: 96,  strate_csd: 144, samos_rtgs: 192, swift_global: 240 },
  failover_active:              { domestic_eft: 24,  multi_bank_eft: 48,  strate_csd: 72,  samos_rtgs: 120, swift_global: 168 },
  archived:                     { domestic_eft: 0,   multi_bank_eft: 0,   strate_csd: 0,   samos_rtgs: 0,   swift_global: 0 },
  disconnected:                 { domestic_eft: 0,   multi_bank_eft: 0,   strate_csd: 0,   samos_rtgs: 0,   swift_global: 0 },
  credential_revoked:           { domestic_eft: 0,   multi_bank_eft: 0,   strate_csd: 0,   samos_rtgs: 0,   swift_global: 0 },
};

export function slaWindowHours(status: SscStatus, tier: SscTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: SscStatus, tier: SscTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from settlement_value_zar_per_cycle.
//   <500k                -> domestic_eft   (single-bank EFT rail)
//   500k-5m              -> multi_bank_eft (multi-bank EFT mesh)
//   5m-15m               -> strate_csd     (CSD equities/bonds link)
//   15m-50m              -> samos_rtgs     (SARB SAMOS RTGS)
//   >=50m                -> swift_global   (SWIFT global correspondent)
export function tierForSettlementValue(settlementValueZar: number | null | undefined): SscTier {
  const v = Number(settlementValueZar || 0);
  if (!Number.isFinite(v) || v < 500_000)   return 'domestic_eft';
  if (v < 5_000_000)   return 'multi_bank_eft';
  if (v < 15_000_000)  return 'strate_csd';
  if (v < 50_000_000)  return 'samos_rtgs';
  return 'swift_global';
}

export interface SscFloorFlags {
  cross_border_payment?: boolean | number | null;
  sarb_excon_authorization_required?: boolean | number | null;
  fic_act_high_risk_jurisdiction?: boolean | number | null;
  basel_lcr_tier1_collateral?: boolean | number | null;
  cpmi_iosco_pfmi_principle9_systemic?: boolean | number | null;
}

export function countFloorFlags(args: SscFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.cross_border_payment) +
    t(args.sarb_excon_authorization_required) +
    t(args.fic_act_high_risk_jurisdiction) +
    t(args.basel_lcr_tier1_collateral) +
    t(args.cpmi_iosco_pfmi_principle9_systemic)
  );
}

// FLOOR-AT-SAMOS-RTGS on >=1 flag.
export function floorAtSamosRtgs(args: SscFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-SWIFT-GLOBAL on >=3 flags.
export function floorAtSwiftGlobal(args: SscFloorFlags): boolean {
  return countFloorFlags(args) >= 3;
}

// Tier ordering for promotion logic - higher index = longer SLA window
// + heavier scrutiny.
const TIER_RANK: Record<SscTier, number> = {
  domestic_eft: 0,
  multi_bank_eft: 1,
  strate_csd: 2,
  samos_rtgs: 3,
  swift_global: 4,
};

export function effectiveTier(
  rawTier: SscTier,
  flags: SscFloorFlags,
): SscTier {
  const flagCount = countFloorFlags(flags);
  if (flagCount >= 3) return 'swift_global';
  if (flagCount >= 1) {
    // Lift to at least samos_rtgs.
    if (TIER_RANK[rawTier] >= TIER_RANK['samos_rtgs']) return rawTier;
    return 'samos_rtgs';
  }
  return rawTier;
}

// Heavy tiers - samos_rtgs + swift_global. SLA-breach + activate
// _failover crossings attach here.
const HEAVY_TIERS = new Set<SscTier>(['samos_rtgs', 'swift_global']);

export function isHeavyTier(tier: SscTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: SscTier): boolean {
  return tier === 'samos_rtgs' || tier === 'swift_global';
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
//
// W124 SIGNATURE: revoke_credential crosses regulator EVERY tier - the
// STRATE-SWIFT-CONNECTOR-REVOKE hard line. SWIFT user-key compromise
// mid-stream is always reportable. SARB + FIC Act s28A + SOC report +
// Basel III LCR breach + CPMI-IOSCO PFMI systemic disclosure all
// required.
//
// Additional:
//   activate_failover -> samos_rtgs + swift_global only
//   disconnect -> EVERY tier WHEN cpmi_iosco_pfmi_principle9_systemic
//   authorize_live_settlement -> swift_global only
//   settle_cycle -> EVERY tier WHEN sarb_excon_authorization_required
//                   AND excon_authorization_status_live=expired
//   sla_breached -> samos_rtgs + swift_global only
export function crossesIntoRegulator(
  action: SscAction,
  tier: SscTier,
  args: {
    flags?: SscFloorFlags;
    excon_authorization_status?: 'none' | 'pending' | 'authorized' | 'expired' | null | undefined;
  },
): boolean {
  const flags = args.flags ?? {};
  const excon = args.excon_authorization_status ?? null;

  // W124 SIGNATURE STRATE-SWIFT-CONNECTOR-REVOKE: revoke_credential
  // EVERY tier.
  if (action === 'revoke_credential') {
    return true;
  }

  // activate_failover -> samos_rtgs + swift_global only.
  if (action === 'activate_failover') {
    return tier === 'samos_rtgs' || tier === 'swift_global';
  }

  // disconnect -> EVERY tier WHEN cpmi_iosco_pfmi_principle9_systemic.
  if (action === 'disconnect') {
    return !!flags.cpmi_iosco_pfmi_principle9_systemic;
  }

  // authorize_live_settlement -> swift_global only.
  if (action === 'authorize_live_settlement') {
    return tier === 'swift_global';
  }

  // settle_cycle -> EVERY tier WHEN sarb_excon_authorization_required
  // AND excon_authorization_status=expired.
  if (action === 'settle_cycle') {
    return !!flags.sarb_excon_authorization_required && excon === 'expired';
  }

  // archive / validate_bic / etc. never cross on their own.
  // suspend / resume never cross.

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: SscTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<SscAction, SscParty> = {
  propose_connector:           'settlements_clerk',
  validate_bic:                'settlements_clerk',
  complete_bank_handshake:     'settlements_clerk',
  load_iso20022_schemas:       'settlements_clerk',
  establish_messaging_session: 'settlements_clerk',
  validate_test_messages:      'settlements_clerk',
  bind_reconciliation_account: 'settlements_clerk',
  authorize_live_settlement:   'settlements_manager',
  activate_reconciliation:     'CFO',
  archive:                     'CEO',
  disconnect:                  'CFO',
  suspend:                     'settlements_manager',
  resume:                      'settlements_manager',
  revoke_credential:           'CFO',
  activate_failover:           'settlements_manager',
  settle_cycle:                'settlements_manager',
};

export function partyForAction(action: SscAction): SscParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: SscAction): SscEvent | null {
  switch (action) {
    case 'propose_connector':           return 'strate_swift_connector_proposed';
    case 'validate_bic':                return 'strate_swift_connector_bic_validated';
    case 'complete_bank_handshake':     return 'strate_swift_connector_bank_handshake_completed';
    case 'load_iso20022_schemas':       return 'strate_swift_connector_iso20022_schemas_loaded';
    case 'establish_messaging_session': return 'strate_swift_connector_messaging_session_established';
    case 'validate_test_messages':      return 'strate_swift_connector_test_messages_validated';
    case 'bind_reconciliation_account': return 'strate_swift_connector_reconciliation_account_bound';
    case 'authorize_live_settlement':   return 'strate_swift_connector_live_settlement_active';
    case 'activate_reconciliation':     return 'strate_swift_connector_cycle_reconciled';
    case 'archive':                     return 'strate_swift_connector_archived';
    case 'disconnect':                  return 'strate_swift_connector_disconnected';
    case 'suspend':                     return 'strate_swift_connector_suspended';
    case 'resume':                      return 'strate_swift_connector_resumed';
    case 'revoke_credential':           return 'strate_swift_connector_credential_revoked';
    case 'activate_failover':           return 'strate_swift_connector_failover_activated';
    case 'settle_cycle':                return 'strate_swift_connector_cycle_settled';
  }
}

// ─── LIVE battery (~28 fields decorated at fetch) ───────────────────────

export function slaHoursRemaining(
  status: SscStatus,
  tier: SscTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type SscUrgency = 'critical' | 'high' | 'medium' | 'low' | 'systemic';

// INVERTED polarity: swift_global has LOOSEST urgency thresholds.
// domestic_eft has TIGHTEST. Systemic flag immediately bumps urgency
// to 'systemic'.
export function urgencyBand(
  tier: SscTier,
  slaHoursLeft: number,
  flags?: SscFloorFlags,
): SscUrgency {
  if (flags && flags.cpmi_iosco_pfmi_principle9_systemic) return 'systemic';
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'swift_global') {
    if (slaHoursLeft < 24)  return 'critical';
    if (slaHoursLeft < 96)  return 'high';
    if (slaHoursLeft < 240) return 'medium';
    return 'low';
  }
  if (tier === 'samos_rtgs') {
    if (slaHoursLeft < 18)  return 'critical';
    if (slaHoursLeft < 72)  return 'high';
    if (slaHoursLeft < 168) return 'medium';
    return 'low';
  }
  if (tier === 'strate_csd') {
    if (slaHoursLeft < 12)  return 'critical';
    if (slaHoursLeft < 48)  return 'high';
    if (slaHoursLeft < 96)  return 'medium';
    return 'low';
  }
  if (tier === 'multi_bank_eft') {
    if (slaHoursLeft < 8)   return 'critical';
    if (slaHoursLeft < 24)  return 'high';
    if (slaHoursLeft < 48)  return 'medium';
    return 'low';
  }
  // domestic_eft - TIGHTEST INVERTED-polarity thresholds.
  if (slaHoursLeft < 4)     return 'critical';
  if (slaHoursLeft < 12)    return 'high';
  if (slaHoursLeft < 24)    return 'medium';
  return 'low';
}

// 4-step authority ladder.
export type SscAuthority =
  | 'settlements_clerk'
  | 'settlements_manager'
  | 'CFO'
  | 'CEO';

export function authorityRequired(tier: SscTier): SscAuthority {
  if (tier === 'swift_global') return 'CEO';
  if (tier === 'samos_rtgs')   return 'CFO';
  if (tier === 'strate_csd')   return 'settlements_manager';
  if (tier === 'multi_bank_eft') return 'settlements_clerk';
  return 'settlements_clerk';
}

// Days until next SWIFT user-key renewal (90-day rolling).
export function daysToKeyRenewal(keyExpiryAt: string | null | undefined, now: Date): number {
  if (!keyExpiryAt) return 9999;
  const expiry = new Date(keyExpiryAt).getTime();
  const nowMs = now.getTime();
  return Math.max(0, Math.ceil((expiry - nowMs) / (24 * 3600 * 1000)));
}

// ─── 5-bridge architecture (W120 + W68 + W3 + W21 + W118) ───────────────
//
// W118 + W120 are BOTH MANDATORY. W118 = tamper-evidence audit hash.
// W120 = reconciliation attestation pair for every settlement cycle.
// The other bridges activate when the connector observes a related
// event in another chain (W68 counterparty margin lift / W3 settlement
// P6 DvP atomic / W21 lender drawdown disbursement).
export function bridgesToW120ReconciliationAttestation(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW68CounterpartyMargin(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW3SettlementP6(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW21Drawdown(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW118AuditChain(blockRef: string | null | undefined): boolean {
  return !!blockRef;
}

// ─── Settlement quality index 0-130 ─────────────────────────────────────
//
// Scores the LIVE settlement feed health. ISO 20022 schema compliance +
// SWIFT user-key validity + settlement success/failure ratio + latency
// + reconciliation break count + LCR/NSFR contribution + ExCon/KYC
// status + PCI-DSS segmentation.
export function settlementQualityIndex(args: {
  settlement_messages_per_minute?: number | null;
  successful_settlement_count_24h?: number | null;
  failed_settlement_count_24h?: number | null;
  failure_rate_pct?: number | null;
  average_settlement_latency_ms?: number | null;
  reconciliation_break_count?: number | null;
  lcr_contribution_pct?: number | null;
  nsfr_contribution_pct?: number | null;
  excon_authorization_status?: 'none' | 'pending' | 'authorized' | 'expired' | null;
  fic_act_kyc_status?: 'clean' | 'refresh_due' | 'flagged' | null;
  protocol_compliant?: boolean | number | null;
  iso27001_controls_ok?: boolean | number | null;
  pci_dss_segmentation_ok?: boolean | number | null;
}): number {
  const n = (v: number | null | undefined, min: number, max: number): number => {
    const x = Number(v || 0);
    if (!Number.isFinite(x)) return 0;
    return Math.max(min, Math.min(max, x));
  };
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  // Settlement throughput.
  const mps = n(args.settlement_messages_per_minute, 0, 400);
  score += Math.round((mps / 400) * 15);
  // Successful settlements (24h).
  const succ = n(args.successful_settlement_count_24h, 0, 6000);
  score += Math.round((succ / 6000) * 15);
  // Failure rate (lower is better, 0% ideal, 5%+ is 0).
  const fr = n(args.failure_rate_pct, 0, 5);
  score += Math.round((1 - fr / 5) * 12);
  // Latency (lower is better, <=100ms ideal, >=500ms is 0).
  const lat = n(args.average_settlement_latency_ms, 0, 500);
  score += Math.round((1 - lat / 500) * 12);
  // Reconciliation breaks (lower is better, 0 ideal, 20+ is 0).
  const breaks = n(args.reconciliation_break_count, 0, 20);
  score += Math.round((1 - breaks / 20) * 8);
  // LCR contribution.
  const lcr = n(args.lcr_contribution_pct, 0, 25);
  score += Math.round((lcr / 25) * 8);
  // NSFR contribution.
  const nsfr = n(args.nsfr_contribution_pct, 0, 18);
  score += Math.round((nsfr / 18) * 5);
  // ExCon authorization.
  if (args.excon_authorization_status === 'authorized') score += 10;
  else if (args.excon_authorization_status === 'pending') score += 4;
  else if (args.excon_authorization_status === 'expired') score += 0;
  // FIC Act KYC.
  if (args.fic_act_kyc_status === 'clean') score += 10;
  else if (args.fic_act_kyc_status === 'refresh_due') score += 4;
  // Binary signals.
  score += t(args.protocol_compliant)        * 15;
  score += t(args.iso27001_controls_ok)      * 10;
  score += t(args.pci_dss_segmentation_ok)   * 10;
  if (score > 130) score = 130;
  if (score < 0) score = 0;
  return score;
}

// ─── Connector health band - composite ──────────────────────────────────
export type SscHealthBand = 'green' | 'amber' | 'red' | 'critical';

export function connectorHealthBand(
  status: SscStatus,
  settlementQuality: number,
  slaBreached: boolean,
  keyExpiryDays: number,
  flags: SscFloorFlags,
  failureRatePct: number,
  exconStatus: 'none' | 'pending' | 'authorized' | 'expired' | null | undefined,
): SscHealthBand {
  if (status === 'credential_revoked') return 'critical';
  if (status === 'disconnected') return 'critical';
  if (status === 'archived') return 'green';
  if (slaBreached) return 'red';
  if (exconStatus === 'expired' && flags.sarb_excon_authorization_required) return 'red';
  if (failureRatePct > 2) return 'red';
  if (keyExpiryDays < 14) return 'red';
  if (status === 'failover_active') return 'amber';
  if (status === 'suspended') return 'amber';
  if (countFloorFlags(flags) >= 3 && settlementQuality < 90) return 'amber';
  if (settlementQuality < 60) return 'red';
  if (keyExpiryDays < 60) return 'amber';
  if (settlementQuality < 90) return 'amber';
  if (failureRatePct > 1) return 'amber';
  return 'green';
}

// Known protocol universe.
export const STRATE_SWIFT_PROTOCOLS = [
  'iso_20022_xml',
  'swift_mt',
  'swift_mx',
  'strate_proprietary',
  'samos_rtgs',
  'sadc_rtgs',
  'eft_ach',
  'pcc_eb',
] as const;

export type StrateSwiftProtocol = typeof STRATE_SWIFT_PROTOCOLS[number];

export function isKnownStrateSwiftProtocol(s: string | null | undefined): s is StrateSwiftProtocol {
  if (!s) return false;
  return (STRATE_SWIFT_PROTOCOLS as readonly string[]).includes(s);
}

// BIC validator - ISO 9362. 8 or 11 chars: 4 letters bank + 2 letters
// country + 2 alphanumeric location (+ optional 3 alphanumeric branch).
export function isValidBic(s: string | null | undefined): boolean {
  if (!s || typeof s !== 'string') return false;
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(s);
}

// ─── mTLS validator for /peer/:peer_id (PUBLIC endpoint) ────────────────
//
// PUBLIC `/api/strate-swift-connector/peer/:peer_id` is mounted BEFORE
// the authMiddleware. Phase-C uses the `x-mtls-cert-fingerprint`
// header (NOT `cf-client-cert-sha256`) to keep W122 + W123 + W124 +
// future Phase-C waves consistent.
export function isValidMtlsFingerprint(s: string | null | undefined): boolean {
  if (!s || typeof s !== 'string') return false;
  // 64 hex chars (SHA-256) with optional colons/dashes/spaces.
  const normalized = s.replace(/[:\s-]/g, '').toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized);
}

// Stub allow-list of trusted bank-counterparty fingerprints. Real
// rollout pulls from KV. 8 entries cover the SA + global majors.
const PEER_FINGERPRINT_ALLOWLIST = new Set<string>([
  // SA majors (FNB / ABSA / Nedbank / Standard Bank).
  '000000000000000000000000000000000000000000000000000000005774a001',
  '000000000000000000000000000000000000000000000000000000005774a002',
  '000000000000000000000000000000000000000000000000000000005774a003',
  '000000000000000000000000000000000000000000000000000000005774a004',
  // STRATE + SARB.
  '000000000000000000000000000000000000000000000000000000005774a005',
  '000000000000000000000000000000000000000000000000000000005774a006',
  // Global correspondents (JPMorgan Chase / HSBC).
  '000000000000000000000000000000000000000000000000000000005774a007',
  '000000000000000000000000000000000000000000000000000000005774a008',
]);

export function isAllowedPeerFingerprint(fp: string): boolean {
  if (!isValidMtlsFingerprint(fp)) return false;
  const norm = fp.replace(/[:\s-]/g, '').toLowerCase();
  // Production resolves trusted peer roots from KV; this allow-list is the
  // seed set. A well-formed fingerprint is trusted only if it is enrolled.
  return PEER_FINGERPRINT_ALLOWLIST.has(norm);
}
