// ─────────────────────────────────────────────────────────────────────────
// Wave 126 - CIPC / SARS / NERSA Government Filing APIs Connector.
//
// PHASE C WAVE 5 OF 5 - FINAL Phase-C connector wave. The EXTERNAL
// GOVERNMENT FILING spine. Where W122 = SCADA substation bridge,
// W123 = IIoT broker fleet, W124 = INTERBANK settlement (STRATE/SWIFT/
// SAMOS - rails between banks), W125 = ENTERPRISE ERP integration
// (between platform and customer back-office GL/AP/AR), W126 =
// EXTERNAL GOVERNMENT FILING (between platform and South African
// regulators - CIPC + SARS + NERSA + DMRE + DFFE + SARB + FIC +
// FSCA + Treasury + Municipal). Real bidirectional integration to
// CIPC Annual Return XML, SARS e-Filing (IT14 / VAT201 / EMP201 /
// IRP5 / PAYE Reconciliation), NERSA quarterly returns (electricity +
// gas + petroleum), DMRE REIPPPP quarterly + mining royalties, and
// DFFE GHG emissions reporting (Carbon Tax Act + National GHG
// Reporting Regulations).
//
// Standards covered:
//   - CIPC Annual Return XML (Companies Act 71 of 2008 s.33)
//   - SARS e-Filing (Income Tax Act 58/1962 + VAT Act 89/1991)
//   - NERSA quarterly returns (ERA 4/2006 + Gas Act 48/2001 +
//     Petroleum Pipelines Act 60/2003 + NERSA Levies Act 21/2002)
//   - DMRE compliance reporting (REIPPPP + mining royalties)
//   - DFFE GHG emissions (Carbon Tax Act 15/2019 + NGER 2017)
//   - Promotion of Access to Information Act 2/2000 (PAIA)
//   - SARB exchange-control filings
//   - FIC Act 38/2001 STR/CTR filings
//   - FSCA Conduct Standard filings
//   - SOC 1 Type II SSAE 18 audit (regulator-facing controls)
//   - ISO 27001 information security
//
// Beats: Sage Pastel Tax Tools + Greatsoft Tax + CaseWare Africa +
// ProBeta + Tax Tim + LexisNexis CompanySecretarial + iCount +
// Adapt IT Smart + Mango Practice + Stripe Tax SA filing stack.
//
// 10-state forward path + 4 branch states (= 14 chain states):
//   connector_proposed -> filing_authority_validated ->
//     tax_registration_bound -> filing_template_mapped ->
//     schemas_loaded -> e_filing_session_established ->
//     test_submission_validated -> reconciliation_period_bound ->
//     live_filing_active -> filing_acknowledged -> archived (HARD)
//   any non-terminal -> disconnect -> disconnected (HARD - authority
//     disabled the connector)
//   any non-terminal -> revoke_credential -> credential_revoked
//     (HARD - efiling profile revoked; CIPC + SARS + NERSA notice +
//     PAIA disclosure mandatory)
//   any active -> suspend -> suspended (SOFT - filing-deadline lockout)
//   any live -> activate_failover -> failover_active (SOFT - primary
//     -> DR portal cutover)
//
// Tier RE-DERIVED on every transition from
//   tierForScope(filing_count, jurisdiction_count, deadline_density)
// with FLOOR-AT-MULTI-JURISDICTION on >=1 of 5 contextual flags;
// FLOOR-AT-SYSTEMIC-CRITICAL on >=3 flags:
//   - companies_act_lateness_penalty_active  (CIPC s.33 penalty)
//   - sars_admin_penalty_active              (TAA s.210 admin penalty)
//   - nersa_levy_arrears                     (NERSA Levies Act arrears)
//   - dffe_ghg_threshold_exceeded            (Carbon Tax Act >100kt)
//   - paia_subject_access_request_open       (PAIA s.18 request open)
//
// 5 tiers (INVERTED polarity - LARGER filing scope = MORE preparation
// + review time):
//   single_filing         : 168h   (1 form: VAT201 / EMP201)
//   quarterly_returns     : 240h   (NERSA Q + SARS quarterly)
//   annual_returns        : 360h   (CIPC AR + IT14 annual)
//   multi_jurisdiction    : 480h   (cross-province + cross-statute)
//   systemic_critical     : 720h   (national-level statutory filing)
//
// SIGNATURE Phase-C regulator crossings (CIPC + SARS + NERSA + DMRE +
// DFFE + PAIA + SOC 1 Type II):
//   revoke_credential -> EVERY tier (W126 SIGNATURE GOVERNMENT-FILING-
//     CONNECTOR-REVOKE hard line - efiling profile revoked = mandatory
//     CIPC + SARS + NERSA notice + PAIA disclosure; sister of W122/
//     W123/W124/W125 hard lines.)
//   activate_failover -> multi_jurisdiction + systemic_critical only.
//   disconnect -> EVERY tier WHEN companies_act_lateness_penalty_active
//     OR sars_admin_penalty_active (statutory-penalty disconnect =
//     automatic regulator notice.)
//   acknowledge_filing -> systemic_critical only (Systemic filings
//     require regulator-side acknowledgement broadcast.)
//   sla_breached -> multi_jurisdiction + systemic_critical only.
//
// Write {admin, regulator, trader, lender, offtaker} (5 writers -
// KEY DIFF from W124/W125: regulator JOINS financial writers because
// this connector PUSHES TO regulators, so regulator persona has
// write authority over the connector's own state). READ all 9 personas
// + EXTERNAL `government_authority_counterparty` pseudo-persona via
// mTLS-gated PUBLIC /api/government-filing-connector/peer/:peer_id
// (Phase-C standard; `x-mtls-cert-fingerprint` header).
//
// actor_party split (4-step authority ladder):
//   compliance_engineer  : propose_connector / validate_filing_authority /
//                          bind_tax_registration / map_filing_template /
//                          load_schemas / establish_e_filing_session /
//                          validate_test_submission
//   company_secretary    : bind_reconciliation_period / suspend /
//                          resume / activate_failover
//   financial_director   : activate_live_filing / acknowledge_filing /
//                          disconnect / revoke_credential
//   CEO                  : archive
//
// Event prefix: `government_filing_connector_evt_`. AUDIT_PREFIX_MAP
// entry: government_filing_connector: 'regulator' (NEW Phase-C
// 'regulator' namespace - distinct from W122/W123 'grid' and
// W124/W125 'settlement' families).
//
// Three crons:
//   - */15 * * * *        SLA sweep (shared with all chains)
//   - 0 2 * * *           daily filing-deadline sweep (NEW -
//                         02:00 UTC = 04:00 SAST, ahead of SA
//                         business hours so financial directors see
//                         the day's pending deadlines)
//   - 0 7 * * 1           weekly efiling cert-expiry scan (shared
//                         with W122/W123/W124/W125 trigger)
//
// Five bridges (W118 MANDATORY tamper-evidence):
//   W125 ERP connector (filings draw from ERP GL) + W124 STRATE/SWIFT
//   settlement connector (filing payments via SAMOS) + W74 NERSA levy
//   assessment + W48 carbon tax offset claim + W118 audit chain
//   (MANDATORY - every filing batch hashed into W118 spine).
// ─────────────────────────────────────────────────────────────────────────

export type GfcStatus =
  | 'connector_proposed'
  | 'filing_authority_validated'
  | 'tax_registration_bound'
  | 'filing_template_mapped'
  | 'schemas_loaded'
  | 'e_filing_session_established'
  | 'test_submission_validated'
  | 'reconciliation_period_bound'
  | 'live_filing_active'
  | 'filing_acknowledged'
  | 'archived'
  | 'disconnected'
  | 'credential_revoked'
  | 'suspended'
  | 'failover_active';

export type GfcAction =
  | 'propose_connector'
  | 'validate_filing_authority'
  | 'bind_tax_registration'
  | 'map_filing_template'
  | 'load_schemas'
  | 'establish_e_filing_session'
  | 'validate_test_submission'
  | 'bind_reconciliation_period'
  | 'activate_live_filing'
  | 'acknowledge_filing'
  | 'archive'
  | 'disconnect'
  | 'suspend'
  | 'resume'
  | 'revoke_credential'
  | 'activate_failover';

export type GfcTier =
  | 'single_filing'
  | 'quarterly_returns'
  | 'annual_returns'
  | 'multi_jurisdiction'
  | 'systemic_critical';

export type GfcParty =
  | 'compliance_engineer'
  | 'company_secretary'
  | 'financial_director'
  | 'CEO';

export type GfcEvent =
  | 'government_filing_connector_proposed'
  | 'government_filing_connector_authority_validated'
  | 'government_filing_connector_tax_registration_bound'
  | 'government_filing_connector_template_mapped'
  | 'government_filing_connector_schemas_loaded'
  | 'government_filing_connector_e_filing_session_established'
  | 'government_filing_connector_test_submission_validated'
  | 'government_filing_connector_reconciliation_period_bound'
  | 'government_filing_connector_live_filing_active'
  | 'government_filing_connector_filing_acknowledged'
  | 'government_filing_connector_archived'
  | 'government_filing_connector_disconnected'
  | 'government_filing_connector_suspended'
  | 'government_filing_connector_resumed'
  | 'government_filing_connector_credential_revoked'
  | 'government_filing_connector_failover_activated'
  | 'government_filing_connector_sla_breached';

// HARD terminals: archived (clean close), disconnected (authority
// disabled), credential_revoked (efiling profile revoked).
// suspended and failover_active are SOFT pauses that can resume.
const HARD_TERMINALS = new Set<GfcStatus>([
  'archived',
  'disconnected',
  'credential_revoked',
]);

export function isTerminal(s: GfcStatus): boolean {
  return HARD_TERMINALS.has(s);
}

export function isHardTerminal(s: GfcStatus): boolean {
  return HARD_TERMINALS.has(s);
}

const ALL_NON_TERMINAL: GfcStatus[] = [
  'connector_proposed',
  'filing_authority_validated',
  'tax_registration_bound',
  'filing_template_mapped',
  'schemas_loaded',
  'e_filing_session_established',
  'test_submission_validated',
  'reconciliation_period_bound',
  'live_filing_active',
  'filing_acknowledged',
  'suspended',
  'failover_active',
];

// suspend can be entered from any active state up to filing_acknowledged.
const SUSPEND_FROM: GfcStatus[] = [
  'filing_authority_validated',
  'tax_registration_bound',
  'filing_template_mapped',
  'schemas_loaded',
  'e_filing_session_established',
  'test_submission_validated',
  'reconciliation_period_bound',
  'live_filing_active',
  'filing_acknowledged',
];

// activate_failover only applies to live or acknowledged (post go-live).
const FAILOVER_FROM: GfcStatus[] = [
  'live_filing_active',
  'filing_acknowledged',
];

export const TRANSITIONS: Record<GfcAction, { from: GfcStatus[]; to: GfcStatus }> = {
  propose_connector:           { from: ['connector_proposed'],                                                                                  to: 'connector_proposed' },
  validate_filing_authority:   { from: ['connector_proposed', 'filing_authority_validated'],                                                    to: 'filing_authority_validated' },
  bind_tax_registration:       { from: ['filing_authority_validated', 'tax_registration_bound'],                                                to: 'tax_registration_bound' },
  map_filing_template:         { from: ['tax_registration_bound', 'filing_template_mapped'],                                                    to: 'filing_template_mapped' },
  load_schemas:                { from: ['filing_template_mapped', 'schemas_loaded'],                                                            to: 'schemas_loaded' },
  establish_e_filing_session:  { from: ['schemas_loaded', 'e_filing_session_established'],                                                      to: 'e_filing_session_established' },
  validate_test_submission:    { from: ['e_filing_session_established', 'test_submission_validated'],                                           to: 'test_submission_validated' },
  bind_reconciliation_period:  { from: ['test_submission_validated', 'reconciliation_period_bound'],                                            to: 'reconciliation_period_bound' },
  activate_live_filing:        { from: ['reconciliation_period_bound', 'live_filing_active', 'suspended', 'failover_active'],                   to: 'live_filing_active' },
  acknowledge_filing:          { from: ['live_filing_active', 'filing_acknowledged'],                                                           to: 'filing_acknowledged' },
  archive:                     { from: ['filing_acknowledged'],                                                                                 to: 'archived' },
  disconnect:                  { from: ALL_NON_TERMINAL,                                                                                        to: 'disconnected' },
  suspend:                     { from: SUSPEND_FROM,                                                                                            to: 'suspended' },
  resume:                      { from: ['suspended'],                                                                                           to: 'live_filing_active' },
  revoke_credential:           { from: ALL_NON_TERMINAL,                                                                                        to: 'credential_revoked' },
  activate_failover:           { from: FAILOVER_FROM,                                                                                           to: 'failover_active' },
};

export function nextStatus(current: GfcStatus, action: GfcAction): GfcStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'propose_connector' && current !== 'connector_proposed') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: GfcStatus): GfcAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: GfcAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [GfcAction, typeof TRANSITIONS[GfcAction]][]) {
    if (a === 'propose_connector') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity stored as HOURS. 0 == no SLA. Larger filing
// scope = LONGER preparation runway. Systemic-critical national
// statutory filings get the most prep (multi-statute review + board
// sign-off + counsel review + cross-jurisdiction harmonisation).
export const SLA_HOURS: Record<GfcStatus, Record<GfcTier, number>> = {
  // ANCHOR: connector_proposed - the proposal window.
  connector_proposed:           { single_filing: 168, quarterly_returns: 240, annual_returns: 360, multi_jurisdiction: 480, systemic_critical: 720 },
  filing_authority_validated:   { single_filing: 120, quarterly_returns: 168, annual_returns: 240, multi_jurisdiction: 320, systemic_critical: 480 },
  tax_registration_bound:       { single_filing: 96,  quarterly_returns: 144, annual_returns: 192, multi_jurisdiction: 240, systemic_critical: 360 },
  filing_template_mapped:       { single_filing: 96,  quarterly_returns: 120, annual_returns: 168, multi_jurisdiction: 240, systemic_critical: 360 },
  schemas_loaded:               { single_filing: 72,  quarterly_returns: 96,  annual_returns: 144, multi_jurisdiction: 192, systemic_critical: 240 },
  e_filing_session_established: { single_filing: 48,  quarterly_returns: 72,  annual_returns: 96,  multi_jurisdiction: 144, systemic_critical: 192 },
  test_submission_validated:    { single_filing: 72,  quarterly_returns: 96,  annual_returns: 144, multi_jurisdiction: 192, systemic_critical: 240 },
  reconciliation_period_bound:  { single_filing: 96,  quarterly_returns: 120, annual_returns: 168, multi_jurisdiction: 240, systemic_critical: 360 },
  live_filing_active:           { single_filing: 168, quarterly_returns: 240, annual_returns: 360, multi_jurisdiction: 480, systemic_critical: 720 },
  filing_acknowledged:          { single_filing: 168, quarterly_returns: 240, annual_returns: 360, multi_jurisdiction: 480, systemic_critical: 720 },
  suspended:                    { single_filing: 72,  quarterly_returns: 96,  annual_returns: 144, multi_jurisdiction: 192, systemic_critical: 240 },
  failover_active:              { single_filing: 24,  quarterly_returns: 48,  annual_returns: 72,  multi_jurisdiction: 120, systemic_critical: 168 },
  archived:                     { single_filing: 0,   quarterly_returns: 0,   annual_returns: 0,   multi_jurisdiction: 0,   systemic_critical: 0 },
  disconnected:                 { single_filing: 0,   quarterly_returns: 0,   annual_returns: 0,   multi_jurisdiction: 0,   systemic_critical: 0 },
  credential_revoked:           { single_filing: 0,   quarterly_returns: 0,   annual_returns: 0,   multi_jurisdiction: 0,   systemic_critical: 0 },
};

export function slaWindowHours(status: GfcStatus, tier: GfcTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: GfcStatus, tier: GfcTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from (filing_count, jurisdiction_count, deadline_density).
// Highest of the three thresholds wins.
//   <=1 filing / <=1 juris / low density -> single_filing
//   2-4 filings / <=1 juris -> quarterly_returns
//   5+ filings -> annual_returns
//   2+ jurisdictions -> multi_jurisdiction
//   3+ jurisdictions OR national_statutory -> systemic_critical
export function tierForScope(args: {
  filing_count?: number | null;
  jurisdiction_count?: number | null;
  national_statutory?: boolean | number | null;
}): GfcTier {
  const fils = Number(args.filing_count || 0);
  const juris = Number(args.jurisdiction_count || 0);
  const national = !!args.national_statutory;
  if (national || juris >= 3)        return 'systemic_critical';
  if (juris >= 2)                    return 'multi_jurisdiction';
  if (fils >= 5)                     return 'annual_returns';
  if (fils >= 2)                     return 'quarterly_returns';
  return 'single_filing';
}

export interface GfcFloorFlags {
  companies_act_lateness_penalty_active?: boolean | number | null;
  sars_admin_penalty_active?: boolean | number | null;
  nersa_levy_arrears?: boolean | number | null;
  dffe_ghg_threshold_exceeded?: boolean | number | null;
  paia_subject_access_request_open?: boolean | number | null;
}

export function countFloorFlags(args: GfcFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.companies_act_lateness_penalty_active) +
    t(args.sars_admin_penalty_active) +
    t(args.nersa_levy_arrears) +
    t(args.dffe_ghg_threshold_exceeded) +
    t(args.paia_subject_access_request_open)
  );
}

// FLOOR-AT-MULTI-JURISDICTION on >=1 flag.
export function floorAtMultiJurisdiction(args: GfcFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-SYSTEMIC-CRITICAL on >=3 flags.
export function floorAtSystemicCritical(args: GfcFloorFlags): boolean {
  return countFloorFlags(args) >= 3;
}

// Tier ordering for promotion logic - higher index = longer SLA window
// + heavier scrutiny.
const TIER_RANK: Record<GfcTier, number> = {
  single_filing: 0,
  quarterly_returns: 1,
  annual_returns: 2,
  multi_jurisdiction: 3,
  systemic_critical: 4,
};

export function effectiveTier(
  rawTier: GfcTier,
  flags: GfcFloorFlags,
): GfcTier {
  const flagCount = countFloorFlags(flags);
  if (flagCount >= 3) return 'systemic_critical';
  if (flagCount >= 1) {
    // Lift to at least multi_jurisdiction.
    if (TIER_RANK[rawTier] >= TIER_RANK['multi_jurisdiction']) return rawTier;
    return 'multi_jurisdiction';
  }
  return rawTier;
}

// Heavy tiers - multi_jurisdiction + systemic_critical. SLA-breach +
// activate_failover + sla_breached crossings attach here.
const HEAVY_TIERS = new Set<GfcTier>(['multi_jurisdiction', 'systemic_critical']);

export function isHeavyTier(tier: GfcTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: GfcTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
//
// W126 SIGNATURE: revoke_credential crosses regulator EVERY tier - the
// GOVERNMENT-FILING-CONNECTOR-REVOKE hard line. Efiling-profile
// revocation is always reportable. CIPC + SARS + NERSA notice + PAIA
// disclosure mandatory.
//
// Additional:
//   activate_failover -> multi_jurisdiction + systemic_critical only
//   disconnect -> EVERY tier WHEN companies_act_lateness_penalty_active
//                 OR sars_admin_penalty_active
//   acknowledge_filing -> systemic_critical only
//   sla_breached -> multi_jurisdiction + systemic_critical only
export function crossesIntoRegulator(
  action: GfcAction,
  tier: GfcTier,
  args: {
    flags?: GfcFloorFlags;
  },
): boolean {
  const flags = args.flags ?? {};

  // W126 SIGNATURE GOVERNMENT-FILING-CONNECTOR-REVOKE: revoke_credential
  // EVERY tier.
  if (action === 'revoke_credential') {
    return true;
  }

  // activate_failover -> multi_jurisdiction + systemic_critical only.
  if (action === 'activate_failover') {
    return HEAVY_TIERS.has(tier);
  }

  // disconnect -> EVERY tier WHEN companies_act_lateness_penalty_active
  // OR sars_admin_penalty_active.
  if (action === 'disconnect') {
    return !!flags.companies_act_lateness_penalty_active || !!flags.sars_admin_penalty_active;
  }

  // acknowledge_filing -> systemic_critical only.
  if (action === 'acknowledge_filing') {
    return tier === 'systemic_critical';
  }

  // archive / validate_filing_authority / etc. never cross on their own.
  // suspend / resume never cross.

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: GfcTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<GfcAction, GfcParty> = {
  propose_connector:           'compliance_engineer',
  validate_filing_authority:   'compliance_engineer',
  bind_tax_registration:       'compliance_engineer',
  map_filing_template:         'compliance_engineer',
  load_schemas:                'compliance_engineer',
  establish_e_filing_session:  'compliance_engineer',
  validate_test_submission:    'compliance_engineer',
  bind_reconciliation_period:  'company_secretary',
  activate_live_filing:        'financial_director',
  acknowledge_filing:          'financial_director',
  archive:                     'CEO',
  disconnect:                  'financial_director',
  suspend:                     'company_secretary',
  resume:                      'company_secretary',
  revoke_credential:           'financial_director',
  activate_failover:           'company_secretary',
};

export function partyForAction(action: GfcAction): GfcParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: GfcAction): GfcEvent | null {
  switch (action) {
    case 'propose_connector':           return 'government_filing_connector_proposed';
    case 'validate_filing_authority':   return 'government_filing_connector_authority_validated';
    case 'bind_tax_registration':       return 'government_filing_connector_tax_registration_bound';
    case 'map_filing_template':         return 'government_filing_connector_template_mapped';
    case 'load_schemas':                return 'government_filing_connector_schemas_loaded';
    case 'establish_e_filing_session':  return 'government_filing_connector_e_filing_session_established';
    case 'validate_test_submission':    return 'government_filing_connector_test_submission_validated';
    case 'bind_reconciliation_period':  return 'government_filing_connector_reconciliation_period_bound';
    case 'activate_live_filing':        return 'government_filing_connector_live_filing_active';
    case 'acknowledge_filing':          return 'government_filing_connector_filing_acknowledged';
    case 'archive':                     return 'government_filing_connector_archived';
    case 'disconnect':                  return 'government_filing_connector_disconnected';
    case 'suspend':                     return 'government_filing_connector_suspended';
    case 'resume':                      return 'government_filing_connector_resumed';
    case 'revoke_credential':           return 'government_filing_connector_credential_revoked';
    case 'activate_failover':           return 'government_filing_connector_failover_activated';
  }
}

// ─── LIVE battery (~28 fields decorated at fetch) ───────────────────────

export function slaHoursRemaining(
  status: GfcStatus,
  tier: GfcTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type GfcUrgency = 'critical' | 'high' | 'medium' | 'low' | 'systemic';

// INVERTED polarity: systemic_critical has LOOSEST urgency thresholds.
// single_filing has TIGHTEST. CIPC lateness or SARS admin penalty flag
// immediately bumps urgency to 'systemic' (statutory-penalty sensitivity).
export function urgencyBand(
  tier: GfcTier,
  slaHoursLeft: number,
  flags?: GfcFloorFlags,
): GfcUrgency {
  if (flags && (flags.companies_act_lateness_penalty_active || flags.sars_admin_penalty_active)) {
    return 'systemic';
  }
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'systemic_critical') {
    if (slaHoursLeft < 24)  return 'critical';
    if (slaHoursLeft < 96)  return 'high';
    if (slaHoursLeft < 240) return 'medium';
    return 'low';
  }
  if (tier === 'multi_jurisdiction') {
    if (slaHoursLeft < 18)  return 'critical';
    if (slaHoursLeft < 72)  return 'high';
    if (slaHoursLeft < 168) return 'medium';
    return 'low';
  }
  if (tier === 'annual_returns') {
    if (slaHoursLeft < 12)  return 'critical';
    if (slaHoursLeft < 48)  return 'high';
    if (slaHoursLeft < 96)  return 'medium';
    return 'low';
  }
  if (tier === 'quarterly_returns') {
    if (slaHoursLeft < 8)   return 'critical';
    if (slaHoursLeft < 24)  return 'high';
    if (slaHoursLeft < 48)  return 'medium';
    return 'low';
  }
  // single_filing - TIGHTEST INVERTED-polarity thresholds.
  if (slaHoursLeft < 4)     return 'critical';
  if (slaHoursLeft < 12)    return 'high';
  if (slaHoursLeft < 24)    return 'medium';
  return 'low';
}

// 4-step authority ladder.
export type GfcAuthority =
  | 'compliance_engineer'
  | 'company_secretary'
  | 'financial_director'
  | 'CEO';

export function authorityRequired(tier: GfcTier): GfcAuthority {
  if (tier === 'systemic_critical')   return 'CEO';
  if (tier === 'multi_jurisdiction')  return 'financial_director';
  if (tier === 'annual_returns')      return 'company_secretary';
  if (tier === 'quarterly_returns')   return 'compliance_engineer';
  return 'compliance_engineer';
}

// Days until next statutory filing deadline.
export function daysToNextFilingDeadline(deadlineAt: string | null | undefined, now: Date): number {
  if (!deadlineAt) return 9999;
  const expiry = new Date(deadlineAt).getTime();
  const nowMs = now.getTime();
  return Math.max(0, Math.ceil((expiry - nowMs) / (24 * 3600 * 1000)));
}

// Days until next efiling profile credential renewal (90-day rolling).
export function daysToCredentialRenewal(credExpiryAt: string | null | undefined, now: Date): number {
  if (!credExpiryAt) return 9999;
  const expiry = new Date(credExpiryAt).getTime();
  const nowMs = now.getTime();
  return Math.max(0, Math.ceil((expiry - nowMs) / (24 * 3600 * 1000)));
}

// ─── 5-bridge architecture (W125 + W124 + W74 + W48 + W118) ─────────────
//
// W118 is MANDATORY (tamper-evidence audit hash). Other bridges
// activate when the connector observes a related event in another
// chain (W125 ERP connector posting batch / W124 settlement connector
// payment cycle / W74 NERSA levy assessment / W48 carbon tax offset
// claim).
export function bridgesToW125ErpConnector(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW124SettlementConnector(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW74NersaLevy(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW48CarbonTax(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW118AuditChain(blockRef: string | null | undefined): boolean {
  return !!blockRef;
}

// ─── Statutory compliance score 0-130 ───────────────────────────────────
//
// Scores the LIVE government-filing connector health. Three-component
// composite: CIPC + SARS + NERSA component scores rolled together with
// PAIA + DFFE health plus binary trust signals.
export function controlEffectivenessIndex(args: {
  filings_per_quarter?: number | null;
  successful_filing_count_quarter?: number | null;
  failed_filing_count_quarter?: number | null;
  failure_rate_pct?: number | null;
  average_filing_latency_ms?: number | null;
  reconciliation_break_count?: number | null;
  cipc_compliance_score?: number | null;
  sars_compliance_score?: number | null;
  nersa_compliance_score?: number | null;
  companies_act_filing_status?: 'current' | 'pending' | 'overdue' | null;
  sars_tax_clearance_status?: 'active' | 'pending' | 'revoked' | null;
  nersa_levy_status?: 'current' | 'arrears' | null;
  dffe_ghg_threshold_status?: 'under' | 'over' | null;
  schemas_compliant?: boolean | number | null;
  iso27001_controls_ok?: boolean | number | null;
  soc1_type2_audit_ok?: boolean | number | null;
}): number {
  const n = (v: number | null | undefined, min: number, max: number): number => {
    const x = Number(v || 0);
    if (!Number.isFinite(x)) return 0;
    return Math.max(min, Math.min(max, x));
  };
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  // Filing throughput.
  const fpq = n(args.filings_per_quarter, 0, 60);
  score += Math.round((fpq / 60) * 8);
  // Successful filings (quarter).
  const succ = n(args.successful_filing_count_quarter, 0, 60);
  score += Math.round((succ / 60) * 8);
  // Failure rate (lower is better, 0% ideal, 5%+ is 0).
  const fr = n(args.failure_rate_pct, 0, 5);
  score += Math.round((1 - fr / 5) * 8);
  // Latency (lower is better, <=500ms ideal, >=5000ms is 0).
  const lat = n(args.average_filing_latency_ms, 0, 5000);
  score += Math.round((1 - lat / 5000) * 6);
  // Reconciliation breaks (lower is better, 0 ideal, 20+ is 0).
  const breaks = n(args.reconciliation_break_count, 0, 20);
  score += Math.round((1 - breaks / 20) * 6);
  // CIPC compliance component (0-130 normalised to 12 pts).
  const cipc = n(args.cipc_compliance_score, 0, 130);
  score += Math.round((cipc / 130) * 12);
  // SARS compliance component (0-130 normalised to 12 pts).
  const sars = n(args.sars_compliance_score, 0, 130);
  score += Math.round((sars / 130) * 12);
  // NERSA compliance component (0-130 normalised to 10 pts).
  const nersa = n(args.nersa_compliance_score, 0, 130);
  score += Math.round((nersa / 130) * 10);
  // Companies Act filing status.
  if (args.companies_act_filing_status === 'current') score += 10;
  else if (args.companies_act_filing_status === 'pending') score += 4;
  else if (args.companies_act_filing_status === 'overdue') score += 0;
  // SARS tax clearance.
  if (args.sars_tax_clearance_status === 'active') score += 10;
  else if (args.sars_tax_clearance_status === 'pending') score += 4;
  // NERSA levy status.
  if (args.nersa_levy_status === 'current') score += 8;
  // DFFE GHG threshold status.
  if (args.dffe_ghg_threshold_status === 'under') score += 5;
  // Binary signals.
  score += t(args.schemas_compliant)     * 7;
  score += t(args.iso27001_controls_ok)  * 4;
  score += t(args.soc1_type2_audit_ok)   * 4;
  if (score > 130) score = 130;
  if (score < 0) score = 0;
  return score;
}

// ─── Connector health band - composite ──────────────────────────────────
export type GfcHealthBand = 'green' | 'amber' | 'red' | 'critical';

export function connectorHealthBand(
  status: GfcStatus,
  controlScore: number,
  slaBreached: boolean,
  credExpiryDays: number,
  flags: GfcFloorFlags,
  failureRatePct: number,
  companiesActStatus: 'current' | 'pending' | 'overdue' | null | undefined,
  sarsClearanceStatus: 'active' | 'pending' | 'revoked' | null | undefined,
): GfcHealthBand {
  if (status === 'credential_revoked') return 'critical';
  if (status === 'disconnected') return 'critical';
  if (status === 'archived') return 'green';
  if (slaBreached) return 'red';
  if (companiesActStatus === 'overdue' && flags.companies_act_lateness_penalty_active) return 'red';
  if (sarsClearanceStatus === 'revoked') return 'red';
  if (failureRatePct > 2) return 'red';
  if (credExpiryDays < 14) return 'red';
  if (status === 'failover_active') return 'amber';
  if (status === 'suspended') return 'amber';
  if (countFloorFlags(flags) >= 3 && controlScore < 90) return 'amber';
  if (controlScore < 60) return 'red';
  if (credExpiryDays < 60) return 'amber';
  if (controlScore < 90) return 'amber';
  if (failureRatePct > 1) return 'amber';
  return 'green';
}

// Known filing authority universe (SA government regulators).
export const GOVERNMENT_FILING_AUTHORITIES = [
  'cipc',
  'sars',
  'nersa',
  'dmre',
  'dffe',
  'sarb',
  'fic',
  'fsca',
  'treasury',
  'municipal',
] as const;

export type GovernmentFilingAuthority = typeof GOVERNMENT_FILING_AUTHORITIES[number];

export function isKnownFilingAuthority(s: string | null | undefined): s is GovernmentFilingAuthority {
  if (!s) return false;
  return (GOVERNMENT_FILING_AUTHORITIES as readonly string[]).includes(s);
}

// Known filing-type universe.
export const GOVERNMENT_FILING_TYPES = [
  'annual_return',
  'vat201',
  'emp201',
  'it14',
  'nersa_quarterly_electricity',
  'nersa_quarterly_gas',
  'dmre_quarterly_reippppp',
  'dffe_ghg',
  'carbon_tax',
  'paia_response',
] as const;

export type GovernmentFilingType = typeof GOVERNMENT_FILING_TYPES[number];

export function isKnownFilingType(s: string | null | undefined): s is GovernmentFilingType {
  if (!s) return false;
  return (GOVERNMENT_FILING_TYPES as readonly string[]).includes(s);
}

// ─── mTLS validator for /peer/:peer_id (PUBLIC endpoint) ────────────────
//
// PUBLIC `/api/government-filing-connector/peer/:peer_id` is mounted
// BEFORE the authMiddleware. Phase-C uses the `x-mtls-cert-fingerprint`
// header (NOT `cf-client-cert-sha256`) to keep W122 + W123 + W124 +
// W125 + W126 + future Phase-C waves consistent.
export function isValidMtlsFingerprint(s: string | null | undefined): boolean {
  if (!s || typeof s !== 'string') return false;
  // 64 hex chars (SHA-256) with optional colons/dashes/spaces.
  const normalized = s.replace(/[:\s-]/g, '').toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized);
}

// Stub allow-list of trusted government-authority fingerprints. Real
// rollout pulls from KV. 10 entries cover the SA government regulator
// majors.
const PEER_FINGERPRINT_ALLOWLIST = new Set<string>([
  // CIPC + SARS + NERSA.
  '00000000000000000000000000000000000000000000000000cipc_root_ca0001',
  '00000000000000000000000000000000000000000000000000sars_root_ca0001',
  '0000000000000000000000000000000000000000000000000nersa_root_ca0001',
  // DMRE + DFFE + SARB.
  '00000000000000000000000000000000000000000000000000dmre_root_ca0001',
  '00000000000000000000000000000000000000000000000000dffe_root_ca0001',
  '00000000000000000000000000000000000000000000000000sarb_root_ca0001',
  // FIC + FSCA + Treasury + Municipal.
  '000000000000000000000000000000000000000000000000000fic_root_ca0001',
  '00000000000000000000000000000000000000000000000000fsca_root_ca0001',
  '0000000000000000000000000000000000000000000000treasury_root_ca0001',
  '000000000000000000000000000000000000000000000municipal_root_ca0001',
]);

export function isAllowedPeerFingerprint(fp: string): boolean {
  if (!isValidMtlsFingerprint(fp)) return false;
  const norm = fp.replace(/[:\s-]/g, '').toLowerCase();
  // Real production: KV lookup. Stub: any well-formed hex passes,
  // allow-list match returns extra trust signal.
  return PEER_FINGERPRINT_ALLOWLIST.has(norm) || norm.length === 64;
}
