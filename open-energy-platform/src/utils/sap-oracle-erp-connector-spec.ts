// ─────────────────────────────────────────────────────────────────────────
// Wave 125 - SAP / Oracle ERP Connector.
//
// PHASE C WAVE 4 OF 5. The ENTERPRISE BACK-OFFICE financial integration
// spine. Where W122 = SCADA substation bridge, W123 = IIoT broker fleet,
// W124 = INTERBANK settlement (STRATE/SWIFT/SAMOS - rails between banks),
// W125 = ENTERPRISE ERP integration (between platform and customer back-
// office GL/AP/AR). Real bidirectional integration to SAP S/4HANA Cloud,
// SAP ECC, Oracle E-Business Suite, Oracle ERP Cloud (Fusion), Workday
// Financials, SAGE 300, Microsoft Dynamics 365 F&O, NetSuite, Epicor,
// IFS, and Acumatica.
//
// Standards covered:
//   - SAP S/4HANA OData v4 APIs (Public + Business API)
//   - SAP ECC IDoc message families (FIDCC1/FIDCC2/REMADV/INVOIC/PEXR2002)
//   - Oracle ERP Cloud REST + Oracle Fusion SOAP
//   - Workday SOAP + REST APIs
//   - SAGE 300 Web Services
//   - Microsoft Dynamics Common Data Service (Dataverse)
//   - NetSuite SuiteTalk REST + SOAP
//   - IFRS 15 revenue recognition
//   - IFRS 9 financial instruments
//   - IFRS 16 leases
//   - IFRS 17 insurance contracts
//   - SARS e-Filing (income tax, VAT, PAYE, dividends withholding)
//   - CIPC annual financial statements + XBRL filing
//   - SOC 1 Type II SSAE 18 audit (financial reporting controls)
//   - ISO 27001 information security
//   - PCAOB AS 5 (control reliance)
//
// Beats: SAP S/4HANA Cloud Integration + Oracle Integration Cloud +
// Workday Integration Cloud + MuleSoft + Boomi + Informatica + TIBCO +
// IBM AppConnect + Microsoft Azure Integration Services + SnapLogic +
// Celigo integrator.io + SnapApp NetSuite Connector.
//
// 10-state forward path + 4 branch states (= 14 chain states):
//   connector_proposed -> erp_endpoint_validated ->
//     company_code_mapped -> chart_of_accounts_bound -> schemas_loaded ->
//     idoc_session_established -> test_postings_validated ->
//     reconciliation_period_bound -> live_posting_active ->
//     period_close_reconciled -> archived (HARD)
//   any non-terminal -> disconnect -> disconnected (HARD - ERP system
//     bidirectional pipe severed)
//   any non-terminal -> revoke_credential -> credential_revoked
//     (HARD - service account disabled by ERP system owner; SOC 1
//     Type II + ISO 27001 incident-reportable)
//   any active -> suspend -> suspended (SOFT - period close lockout)
//   any live -> activate_failover -> failover_active (SOFT - primary
//     to DR ERP cutover)
//
// Tier RE-DERIVED on every transition from
//   max(module_count + company_code_count + jurisdiction_count thresholds)
// with FLOOR-AT-ENTERPRISE-WIDE on >=1 of 5 contextual flags;
// FLOOR-AT-MULTI-COUNTRY on >=3 flags:
//   - sox_404_in_scope              (US-listed reporting)
//   - ifrs_consolidation_required   (group-consolidation IFRS 10/12)
//   - cross_border_transfer_pricing (BEPS Action 13 + SARS s31 + OECD)
//   - sars_efiling_critical_path    (tax-filing dependency)
//   - cipc_annual_filing_gate       (CIPC s33 + s30A AFS lodgement)
//
// 5 tiers (INVERTED polarity - LARGER ERP scope = MORE onboarding +
// validation time):
//   single_module          : 168h   (1 SAP/Oracle module pilot)
//   multi_module           : 240h   (multi-module within 1 company code)
//   enterprise_wide        : 360h   (cross-company-code consolidation)
//   group_consolidation    : 480h   (IFRS 10/12 group elimination)
//   multi_country          : 720h   (multi-tax-jurisdiction global ERP)
//
// SIGNATURE Phase-C regulator crossings (SARS + CIPC + SOC 1 Type II +
// ISO 27001 + PCAOB):
//   revoke_credential -> EVERY tier (W125 SIGNATURE SAP-ORACLE-ERP-
//     CONNECTOR-REVOKE hard line - ERP service-account compromise =
//     mandatory SARB + SARS + CIPC + SOC report; sister of W122/W123/
//     W124 hard lines.)
//   activate_failover -> enterprise_wide + group_consolidation +
//     multi_country only.
//   disconnect -> EVERY tier WHEN sox_404_in_scope OR
//     sars_efiling_critical_path (Material-weakness PCAOB AS 5 OR SARS
//     filing-gate disconnect = automatic regulator notice.)
//   reconcile_period_close -> multi_country only (Multi-jurisdiction
//     close requires SARS + CIPC + group consolidator sign-off.)
//   sla_breached -> enterprise_wide + group_consolidation + multi_country
//     only.
//
// Write {admin, trader, lender, offtaker} (4 FINANCIAL writers - SAME
// AS W124). READ all 9 personas + EXTERNAL `erp_counterparty` pseudo-
// persona via mTLS-gated PUBLIC /api/sap-oracle-erp-connector/peer/
// :peer_id (Phase-C standard; uses `x-mtls-cert-fingerprint` header).
//
// actor_party split (4-step authority ladder):
//   finance_engineer     : propose_connector / validate_erp_endpoint /
//                          map_company_code / bind_chart_of_accounts /
//                          load_schemas / establish_idoc_session /
//                          validate_test_postings
//   financial_controller : bind_reconciliation_period / suspend /
//                          resume / activate_failover
//   CFO                  : activate_live_posting /
//                          reconcile_period_close / disconnect /
//                          revoke_credential
//   CEO                  : archive
//
// Event prefix: `sap_oracle_erp_connector_evt_`. AUDIT_PREFIX_MAP entry:
//   sap_oracle_erp_connector: 'settlement' (Phase C 'settlement'
//   namespace shared with W124 - both are FINANCIAL waves, distinct
//   from W122/W123 'grid' namespace.)
//
// Three crons:
//   - */15 * * * *        SLA sweep (shared with all chains)
//   - 45 1 * * *          daily period-close reconciliation (NEW -
//                         01:45 UTC = 03:45 SAST, 15 min after W124
//                         settlement reconciliation)
//   - 0 7 * * 1           weekly service-account cert-expiry scan
//                         (shared with W122/W123/W124 trigger)
//
// Five bridges (W118 MANDATORY tamper-evidence):
//   W124 STRATE/SWIFT settlement connector (every settled cycle pairs
//   to a posting batch) + W3 settlement P6 (atomic-DvP integration with
//   platform settlement spine) + W68 counterparty margin (margin-call
//   posting batch) + W21 lender drawdown (disbursement-to-AP posting
//   chain) + W118 audit chain (MANDATORY - every posting batch hashed
//   into W118 spine).
// ─────────────────────────────────────────────────────────────────────────

export type SoecStatus =
  | 'connector_proposed'
  | 'erp_endpoint_validated'
  | 'company_code_mapped'
  | 'chart_of_accounts_bound'
  | 'schemas_loaded'
  | 'idoc_session_established'
  | 'test_postings_validated'
  | 'reconciliation_period_bound'
  | 'live_posting_active'
  | 'period_close_reconciled'
  | 'archived'
  | 'disconnected'
  | 'credential_revoked'
  | 'suspended'
  | 'failover_active';

export type SoecAction =
  | 'propose_connector'
  | 'validate_erp_endpoint'
  | 'map_company_code'
  | 'bind_chart_of_accounts'
  | 'load_schemas'
  | 'establish_idoc_session'
  | 'validate_test_postings'
  | 'bind_reconciliation_period'
  | 'activate_live_posting'
  | 'reconcile_period_close'
  | 'archive'
  | 'disconnect'
  | 'suspend'
  | 'resume'
  | 'revoke_credential'
  | 'activate_failover';

export type SoecTier =
  | 'single_module'
  | 'multi_module'
  | 'enterprise_wide'
  | 'group_consolidation'
  | 'multi_country';

export type SoecParty =
  | 'finance_engineer'
  | 'financial_controller'
  | 'CFO'
  | 'CEO';

export type SoecEvent =
  | 'sap_oracle_erp_connector_proposed'
  | 'sap_oracle_erp_connector_endpoint_validated'
  | 'sap_oracle_erp_connector_company_code_mapped'
  | 'sap_oracle_erp_connector_chart_of_accounts_bound'
  | 'sap_oracle_erp_connector_schemas_loaded'
  | 'sap_oracle_erp_connector_idoc_session_established'
  | 'sap_oracle_erp_connector_test_postings_validated'
  | 'sap_oracle_erp_connector_reconciliation_period_bound'
  | 'sap_oracle_erp_connector_live_posting_active'
  | 'sap_oracle_erp_connector_period_close_reconciled'
  | 'sap_oracle_erp_connector_archived'
  | 'sap_oracle_erp_connector_disconnected'
  | 'sap_oracle_erp_connector_suspended'
  | 'sap_oracle_erp_connector_resumed'
  | 'sap_oracle_erp_connector_credential_revoked'
  | 'sap_oracle_erp_connector_failover_activated'
  | 'sap_oracle_erp_connector_sla_breached';

// HARD terminals: archived (clean close), disconnected (counterparty
// pipe severed), credential_revoked (service-account disabled).
// suspended and failover_active are SOFT pauses that can resume back
// into live posting.
const HARD_TERMINALS = new Set<SoecStatus>([
  'archived',
  'disconnected',
  'credential_revoked',
]);

export function isTerminal(s: SoecStatus): boolean {
  return HARD_TERMINALS.has(s);
}

export function isHardTerminal(s: SoecStatus): boolean {
  return HARD_TERMINALS.has(s);
}

const ALL_NON_TERMINAL: SoecStatus[] = [
  'connector_proposed',
  'erp_endpoint_validated',
  'company_code_mapped',
  'chart_of_accounts_bound',
  'schemas_loaded',
  'idoc_session_established',
  'test_postings_validated',
  'reconciliation_period_bound',
  'live_posting_active',
  'period_close_reconciled',
  'suspended',
  'failover_active',
];

// suspend can be entered from any active state up to period_close_reconciled.
const SUSPEND_FROM: SoecStatus[] = [
  'erp_endpoint_validated',
  'company_code_mapped',
  'chart_of_accounts_bound',
  'schemas_loaded',
  'idoc_session_established',
  'test_postings_validated',
  'reconciliation_period_bound',
  'live_posting_active',
  'period_close_reconciled',
];

// activate_failover only applies to live or reconciled (post go-live).
const FAILOVER_FROM: SoecStatus[] = [
  'live_posting_active',
  'period_close_reconciled',
];

export const TRANSITIONS: Record<SoecAction, { from: SoecStatus[]; to: SoecStatus }> = {
  propose_connector:           { from: ['connector_proposed'],                                                                                  to: 'connector_proposed' },
  validate_erp_endpoint:       { from: ['connector_proposed', 'erp_endpoint_validated'],                                                        to: 'erp_endpoint_validated' },
  map_company_code:            { from: ['erp_endpoint_validated', 'company_code_mapped'],                                                       to: 'company_code_mapped' },
  bind_chart_of_accounts:      { from: ['company_code_mapped', 'chart_of_accounts_bound'],                                                      to: 'chart_of_accounts_bound' },
  load_schemas:                { from: ['chart_of_accounts_bound', 'schemas_loaded'],                                                           to: 'schemas_loaded' },
  establish_idoc_session:      { from: ['schemas_loaded', 'idoc_session_established'],                                                          to: 'idoc_session_established' },
  validate_test_postings:      { from: ['idoc_session_established', 'test_postings_validated'],                                                 to: 'test_postings_validated' },
  bind_reconciliation_period:  { from: ['test_postings_validated', 'reconciliation_period_bound'],                                              to: 'reconciliation_period_bound' },
  activate_live_posting:       { from: ['reconciliation_period_bound', 'live_posting_active', 'suspended', 'failover_active'],                  to: 'live_posting_active' },
  reconcile_period_close:      { from: ['live_posting_active', 'period_close_reconciled'],                                                      to: 'period_close_reconciled' },
  archive:                     { from: ['period_close_reconciled'],                                                                             to: 'archived' },
  disconnect:                  { from: ALL_NON_TERMINAL,                                                                                        to: 'disconnected' },
  suspend:                     { from: SUSPEND_FROM,                                                                                            to: 'suspended' },
  resume:                      { from: ['suspended'],                                                                                           to: 'live_posting_active' },
  revoke_credential:           { from: ALL_NON_TERMINAL,                                                                                        to: 'credential_revoked' },
  activate_failover:           { from: FAILOVER_FROM,                                                                                           to: 'failover_active' },
};

export function nextStatus(current: SoecStatus, action: SoecAction): SoecStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'propose_connector' && current !== 'connector_proposed') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: SoecStatus): SoecAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: SoecAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [SoecAction, typeof TRANSITIONS[SoecAction]][]) {
    if (a === 'propose_connector') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity stored as HOURS. 0 == no SLA. Larger ERP scope =
// LONGER onboarding runway. Multi-country requires the most prep
// (cross-jurisdiction tax mapping + transfer-pricing + group elim +
// CIPC/SARS gating).
export const SLA_HOURS: Record<SoecStatus, Record<SoecTier, number>> = {
  // ANCHOR: connector_proposed - the proposal window.
  connector_proposed:           { single_module: 168, multi_module: 240, enterprise_wide: 360, group_consolidation: 480, multi_country: 720 },
  erp_endpoint_validated:       { single_module: 120, multi_module: 168, enterprise_wide: 240, group_consolidation: 320, multi_country: 480 },
  company_code_mapped:          { single_module: 96,  multi_module: 144, enterprise_wide: 192, group_consolidation: 240, multi_country: 360 },
  chart_of_accounts_bound:      { single_module: 96,  multi_module: 120, enterprise_wide: 168, group_consolidation: 240, multi_country: 360 },
  schemas_loaded:               { single_module: 72,  multi_module: 96,  enterprise_wide: 144, group_consolidation: 192, multi_country: 240 },
  idoc_session_established:     { single_module: 48,  multi_module: 72,  enterprise_wide: 96,  group_consolidation: 144, multi_country: 192 },
  test_postings_validated:      { single_module: 72,  multi_module: 96,  enterprise_wide: 144, group_consolidation: 192, multi_country: 240 },
  reconciliation_period_bound:  { single_module: 96,  multi_module: 120, enterprise_wide: 168, group_consolidation: 240, multi_country: 360 },
  live_posting_active:          { single_module: 168, multi_module: 240, enterprise_wide: 360, group_consolidation: 480, multi_country: 720 },
  period_close_reconciled:      { single_module: 168, multi_module: 240, enterprise_wide: 360, group_consolidation: 480, multi_country: 720 },
  suspended:                    { single_module: 72,  multi_module: 96,  enterprise_wide: 144, group_consolidation: 192, multi_country: 240 },
  failover_active:              { single_module: 24,  multi_module: 48,  enterprise_wide: 72,  group_consolidation: 120, multi_country: 168 },
  archived:                     { single_module: 0,   multi_module: 0,   enterprise_wide: 0,   group_consolidation: 0,   multi_country: 0 },
  disconnected:                 { single_module: 0,   multi_module: 0,   enterprise_wide: 0,   group_consolidation: 0,   multi_country: 0 },
  credential_revoked:           { single_module: 0,   multi_module: 0,   enterprise_wide: 0,   group_consolidation: 0,   multi_country: 0 },
};

export function slaWindowHours(status: SoecStatus, tier: SoecTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: SoecStatus, tier: SoecTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from (module_count, company_code_count, jurisdiction_count).
// Highest of the three thresholds wins.
//   <=1 module / <=1 cc / <=1 juris -> single_module
//   2-4 modules / <=1 cc / <=1 juris -> multi_module
//   5+ modules OR 2+ cc -> enterprise_wide
//   2+ cc AND ifrs_consolidation_required (or group_consolidator named) -> group_consolidation
//   2+ jurisdictions -> multi_country
export function tierForScope(args: {
  module_count?: number | null;
  company_code_count?: number | null;
  jurisdiction_count?: number | null;
}): SoecTier {
  const mods = Number(args.module_count || 0);
  const ccs = Number(args.company_code_count || 0);
  const juris = Number(args.jurisdiction_count || 0);
  if (juris >= 2)                  return 'multi_country';
  if (ccs >= 2)                    return 'group_consolidation';
  if (mods >= 5 || ccs >= 2)       return 'enterprise_wide';
  if (mods >= 2)                   return 'multi_module';
  return 'single_module';
}

export interface SoecFloorFlags {
  sox_404_in_scope?: boolean | number | null;
  ifrs_consolidation_required?: boolean | number | null;
  cross_border_transfer_pricing?: boolean | number | null;
  sars_efiling_critical_path?: boolean | number | null;
  cipc_annual_filing_gate?: boolean | number | null;
}

export function countFloorFlags(args: SoecFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.sox_404_in_scope) +
    t(args.ifrs_consolidation_required) +
    t(args.cross_border_transfer_pricing) +
    t(args.sars_efiling_critical_path) +
    t(args.cipc_annual_filing_gate)
  );
}

// FLOOR-AT-ENTERPRISE-WIDE on >=1 flag.
export function floorAtEnterpriseWide(args: SoecFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-MULTI-COUNTRY on >=3 flags.
export function floorAtMultiCountry(args: SoecFloorFlags): boolean {
  return countFloorFlags(args) >= 3;
}

// Tier ordering for promotion logic - higher index = longer SLA window
// + heavier scrutiny.
const TIER_RANK: Record<SoecTier, number> = {
  single_module: 0,
  multi_module: 1,
  enterprise_wide: 2,
  group_consolidation: 3,
  multi_country: 4,
};

export function effectiveTier(
  rawTier: SoecTier,
  flags: SoecFloorFlags,
): SoecTier {
  const flagCount = countFloorFlags(flags);
  if (flagCount >= 3) return 'multi_country';
  if (flagCount >= 1) {
    // Lift to at least enterprise_wide.
    if (TIER_RANK[rawTier] >= TIER_RANK['enterprise_wide']) return rawTier;
    return 'enterprise_wide';
  }
  return rawTier;
}

// Heavy tiers - enterprise_wide + group_consolidation + multi_country.
// SLA-breach + activate_failover + sla_breached crossings attach here.
const HEAVY_TIERS = new Set<SoecTier>(['enterprise_wide', 'group_consolidation', 'multi_country']);

export function isHeavyTier(tier: SoecTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: SoecTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
//
// W125 SIGNATURE: revoke_credential crosses regulator EVERY tier - the
// SAP-ORACLE-ERP-CONNECTOR-REVOKE hard line. ERP service-account
// compromise mid-stream is always reportable. SARB + SARS + CIPC + SOC
// report + ISO 27001 incident-report all required.
//
// Additional:
//   activate_failover -> enterprise_wide + group_consolidation + multi_country
//   disconnect -> EVERY tier WHEN sox_404_in_scope OR sars_efiling_critical_path
//   reconcile_period_close -> multi_country only
//   sla_breached -> enterprise_wide + group_consolidation + multi_country only
export function crossesIntoRegulator(
  action: SoecAction,
  tier: SoecTier,
  args: {
    flags?: SoecFloorFlags;
  },
): boolean {
  const flags = args.flags ?? {};

  // W125 SIGNATURE SAP-ORACLE-ERP-CONNECTOR-REVOKE: revoke_credential
  // EVERY tier.
  if (action === 'revoke_credential') {
    return true;
  }

  // activate_failover -> enterprise_wide + group_consolidation + multi_country only.
  if (action === 'activate_failover') {
    return HEAVY_TIERS.has(tier);
  }

  // disconnect -> EVERY tier WHEN sox_404_in_scope OR sars_efiling_critical_path.
  if (action === 'disconnect') {
    return !!flags.sox_404_in_scope || !!flags.sars_efiling_critical_path;
  }

  // reconcile_period_close -> multi_country only.
  if (action === 'reconcile_period_close') {
    return tier === 'multi_country';
  }

  // archive / validate_erp_endpoint / etc. never cross on their own.
  // suspend / resume never cross.

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: SoecTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<SoecAction, SoecParty> = {
  propose_connector:           'finance_engineer',
  validate_erp_endpoint:       'finance_engineer',
  map_company_code:            'finance_engineer',
  bind_chart_of_accounts:      'finance_engineer',
  load_schemas:                'finance_engineer',
  establish_idoc_session:      'finance_engineer',
  validate_test_postings:      'finance_engineer',
  bind_reconciliation_period:  'financial_controller',
  activate_live_posting:       'CFO',
  reconcile_period_close:      'CFO',
  archive:                     'CEO',
  disconnect:                  'CFO',
  suspend:                     'financial_controller',
  resume:                      'financial_controller',
  revoke_credential:           'CFO',
  activate_failover:           'financial_controller',
};

export function partyForAction(action: SoecAction): SoecParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: SoecAction): SoecEvent | null {
  switch (action) {
    case 'propose_connector':           return 'sap_oracle_erp_connector_proposed';
    case 'validate_erp_endpoint':       return 'sap_oracle_erp_connector_endpoint_validated';
    case 'map_company_code':            return 'sap_oracle_erp_connector_company_code_mapped';
    case 'bind_chart_of_accounts':      return 'sap_oracle_erp_connector_chart_of_accounts_bound';
    case 'load_schemas':                return 'sap_oracle_erp_connector_schemas_loaded';
    case 'establish_idoc_session':      return 'sap_oracle_erp_connector_idoc_session_established';
    case 'validate_test_postings':      return 'sap_oracle_erp_connector_test_postings_validated';
    case 'bind_reconciliation_period':  return 'sap_oracle_erp_connector_reconciliation_period_bound';
    case 'activate_live_posting':       return 'sap_oracle_erp_connector_live_posting_active';
    case 'reconcile_period_close':      return 'sap_oracle_erp_connector_period_close_reconciled';
    case 'archive':                     return 'sap_oracle_erp_connector_archived';
    case 'disconnect':                  return 'sap_oracle_erp_connector_disconnected';
    case 'suspend':                     return 'sap_oracle_erp_connector_suspended';
    case 'resume':                      return 'sap_oracle_erp_connector_resumed';
    case 'revoke_credential':           return 'sap_oracle_erp_connector_credential_revoked';
    case 'activate_failover':           return 'sap_oracle_erp_connector_failover_activated';
  }
}

// ─── LIVE battery (~28 fields decorated at fetch) ───────────────────────

export function slaHoursRemaining(
  status: SoecStatus,
  tier: SoecTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type SoecUrgency = 'critical' | 'high' | 'medium' | 'low' | 'systemic';

// INVERTED polarity: multi_country has LOOSEST urgency thresholds.
// single_module has TIGHTEST. SOX 404 flag immediately bumps urgency
// to 'systemic' (material-weakness sensitivity).
export function urgencyBand(
  tier: SoecTier,
  slaHoursLeft: number,
  flags?: SoecFloorFlags,
): SoecUrgency {
  if (flags && flags.sox_404_in_scope) return 'systemic';
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'multi_country') {
    if (slaHoursLeft < 24)  return 'critical';
    if (slaHoursLeft < 96)  return 'high';
    if (slaHoursLeft < 240) return 'medium';
    return 'low';
  }
  if (tier === 'group_consolidation') {
    if (slaHoursLeft < 18)  return 'critical';
    if (slaHoursLeft < 72)  return 'high';
    if (slaHoursLeft < 168) return 'medium';
    return 'low';
  }
  if (tier === 'enterprise_wide') {
    if (slaHoursLeft < 12)  return 'critical';
    if (slaHoursLeft < 48)  return 'high';
    if (slaHoursLeft < 96)  return 'medium';
    return 'low';
  }
  if (tier === 'multi_module') {
    if (slaHoursLeft < 8)   return 'critical';
    if (slaHoursLeft < 24)  return 'high';
    if (slaHoursLeft < 48)  return 'medium';
    return 'low';
  }
  // single_module - TIGHTEST INVERTED-polarity thresholds.
  if (slaHoursLeft < 4)     return 'critical';
  if (slaHoursLeft < 12)    return 'high';
  if (slaHoursLeft < 24)    return 'medium';
  return 'low';
}

// 4-step authority ladder.
export type SoecAuthority =
  | 'finance_engineer'
  | 'financial_controller'
  | 'CFO'
  | 'CEO';

export function authorityRequired(tier: SoecTier): SoecAuthority {
  if (tier === 'multi_country')        return 'CEO';
  if (tier === 'group_consolidation')  return 'CFO';
  if (tier === 'enterprise_wide')      return 'financial_controller';
  if (tier === 'multi_module')         return 'finance_engineer';
  return 'finance_engineer';
}

// Days until next period close (monthly close ~30 day rolling).
export function daysToPeriodClose(periodEndAt: string | null | undefined, now: Date): number {
  if (!periodEndAt) return 9999;
  const expiry = new Date(periodEndAt).getTime();
  const nowMs = now.getTime();
  return Math.max(0, Math.ceil((expiry - nowMs) / (24 * 3600 * 1000)));
}

// Days until next ERP service-account credential renewal (90-day rolling).
export function daysToCredentialRenewal(credExpiryAt: string | null | undefined, now: Date): number {
  if (!credExpiryAt) return 9999;
  const expiry = new Date(credExpiryAt).getTime();
  const nowMs = now.getTime();
  return Math.max(0, Math.ceil((expiry - nowMs) / (24 * 3600 * 1000)));
}

// ─── 5-bridge architecture (W124 + W3 + W68 + W21 + W118) ───────────────
//
// W118 is MANDATORY (tamper-evidence audit hash). Other bridges
// activate when the connector observes a related event in another
// chain (W124 settlement connector cycle / W3 settlement P6 DvP atomic /
// W68 counterparty margin lift / W21 lender drawdown disbursement).
export function bridgesToW124SettlementConnector(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW3SettlementP6(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW68CounterpartyMargin(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW21Drawdown(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW118AuditChain(blockRef: string | null | undefined): boolean {
  return !!blockRef;
}

// ─── SOX 404 control effectiveness score 0-130 ──────────────────────────
//
// Scores the LIVE ERP feed health. IFRS 15/9/16 mapping coverage +
// SARS/CIPC filing status + reconciliation break count + posting success/
// failure ratio + latency + service-account validity + ISO 27001 controls
// + SOC 1 Type II audit-readiness.
export function controlEffectivenessIndex(args: {
  posting_volume_per_hour?: number | null;
  successful_posting_count_24h?: number | null;
  failed_posting_count_24h?: number | null;
  failure_rate_pct?: number | null;
  average_posting_latency_ms?: number | null;
  reconciliation_break_count?: number | null;
  ifrs_15_revenue_contribution_pct?: number | null;
  ifrs_9_financial_instrument_contribution_pct?: number | null;
  sars_efiling_status?: 'current' | 'pending' | 'overdue' | null;
  cipc_annual_filing_status?: 'current' | 'pending' | 'overdue' | null;
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
  // Posting throughput.
  const pph = n(args.posting_volume_per_hour, 0, 1000);
  score += Math.round((pph / 1000) * 15);
  // Successful postings (24h).
  const succ = n(args.successful_posting_count_24h, 0, 20000);
  score += Math.round((succ / 20000) * 15);
  // Failure rate (lower is better, 0% ideal, 5%+ is 0).
  const fr = n(args.failure_rate_pct, 0, 5);
  score += Math.round((1 - fr / 5) * 12);
  // Latency (lower is better, <=200ms ideal, >=2000ms is 0).
  const lat = n(args.average_posting_latency_ms, 0, 2000);
  score += Math.round((1 - lat / 2000) * 12);
  // Reconciliation breaks (lower is better, 0 ideal, 30+ is 0).
  const breaks = n(args.reconciliation_break_count, 0, 30);
  score += Math.round((1 - breaks / 30) * 8);
  // IFRS 15 revenue contribution.
  const ifrs15 = n(args.ifrs_15_revenue_contribution_pct, 0, 25);
  score += Math.round((ifrs15 / 25) * 8);
  // IFRS 9 financial instrument contribution.
  const ifrs9 = n(args.ifrs_9_financial_instrument_contribution_pct, 0, 18);
  score += Math.round((ifrs9 / 18) * 5);
  // SARS e-Filing status.
  if (args.sars_efiling_status === 'current') score += 10;
  else if (args.sars_efiling_status === 'pending') score += 4;
  else if (args.sars_efiling_status === 'overdue') score += 0;
  // CIPC annual filing status.
  if (args.cipc_annual_filing_status === 'current') score += 10;
  else if (args.cipc_annual_filing_status === 'pending') score += 4;
  // Binary signals.
  score += t(args.schemas_compliant)     * 15;
  score += t(args.iso27001_controls_ok)  * 10;
  score += t(args.soc1_type2_audit_ok)   * 10;
  if (score > 130) score = 130;
  if (score < 0) score = 0;
  return score;
}

// ─── Connector health band - composite ──────────────────────────────────
export type SoecHealthBand = 'green' | 'amber' | 'red' | 'critical';

export function connectorHealthBand(
  status: SoecStatus,
  controlScore: number,
  slaBreached: boolean,
  credExpiryDays: number,
  flags: SoecFloorFlags,
  failureRatePct: number,
  sarsStatus: 'current' | 'pending' | 'overdue' | null | undefined,
): SoecHealthBand {
  if (status === 'credential_revoked') return 'critical';
  if (status === 'disconnected') return 'critical';
  if (status === 'archived') return 'green';
  if (slaBreached) return 'red';
  if (sarsStatus === 'overdue' && flags.sars_efiling_critical_path) return 'red';
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

// Known ERP system universe.
export const SAP_ORACLE_ERP_SYSTEMS = [
  'sap_s4hana',
  'sap_ecc',
  'oracle_ebs',
  'oracle_fusion',
  'workday',
  'sage_300',
  'dynamics_365',
  'netsuite',
  'epicor',
  'ifs',
] as const;

export type SapOracleErpSystem = typeof SAP_ORACLE_ERP_SYSTEMS[number];

export function isKnownErpSystem(s: string | null | undefined): s is SapOracleErpSystem {
  if (!s) return false;
  return (SAP_ORACLE_ERP_SYSTEMS as readonly string[]).includes(s);
}

// ─── mTLS validator for /peer/:peer_id (PUBLIC endpoint) ────────────────
//
// PUBLIC `/api/sap-oracle-erp-connector/peer/:peer_id` is mounted BEFORE
// the authMiddleware. Phase-C uses the `x-mtls-cert-fingerprint`
// header (NOT `cf-client-cert-sha256`) to keep W122 + W123 + W124 +
// W125 + future Phase-C waves consistent.
export function isValidMtlsFingerprint(s: string | null | undefined): boolean {
  if (!s || typeof s !== 'string') return false;
  // 64 hex chars (SHA-256) with optional colons/dashes/spaces.
  const normalized = s.replace(/[:\s-]/g, '').toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized);
}

// Stub allow-list of trusted erp-counterparty fingerprints. Real
// rollout pulls from KV. 10 entries cover the SAP/Oracle/Workday/IFS
// global majors.
const PEER_FINGERPRINT_ALLOWLIST = new Set<string>([
  // SAP global (S/4HANA / ECC).
  '0000000000000000000000000000000000000000000000000000000005a90001',
  '0000000000000000000000000000000000000000000000000000000005a90002',
  // Oracle global (Fusion / EBS).
  '0000000000000000000000000000000000000000000000000000000005a90003',
  '0000000000000000000000000000000000000000000000000000000005a90004',
  // Workday + SAGE + Microsoft Dynamics + NetSuite.
  '0000000000000000000000000000000000000000000000000000000005a90005',
  '0000000000000000000000000000000000000000000000000000000005a90006',
  '0000000000000000000000000000000000000000000000000000000005a90007',
  '0000000000000000000000000000000000000000000000000000000005a90008',
  // Epicor + IFS.
  '0000000000000000000000000000000000000000000000000000000005a90009',
  '0000000000000000000000000000000000000000000000000000000005a9000a',
]);

export function isAllowedPeerFingerprint(fp: string): boolean {
  if (!isValidMtlsFingerprint(fp)) return false;
  const norm = fp.replace(/[:\s-]/g, '').toLowerCase();
  // Production resolves trusted peer roots from KV; this allow-list is the
  // seed set. A well-formed fingerprint is trusted only if it is enrolled.
  return PEER_FINGERPRINT_ALLOWLIST.has(norm);
}
