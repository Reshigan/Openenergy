/**
 * Apex API Client — typed wrappers around every backend domain
 *
 * Re-uses the existing axios `api` instance (auth interceptors, token refresh,
 * step-up MFA gate) from pages/src/lib/api.ts.
 *
 * Pattern:
 *   apexClient.<domain>.<method>(params?) → Promise<T>
 *
 * All list endpoints return T[].
 * All create/update/transition endpoints return T (the updated record).
 * Error responses throw AxiosError — callers catch and surface via hooks.
 */

import { api } from '../../../lib/api';

// ─── Shared types ─────────────────────────────────────────────────────────────

export type ChainStatus = string;

export interface ApiListResponse<T> {
  success: boolean;
  data: T[];
  total?: number;
}

export interface ApiItemResponse<T> {
  success: boolean;
  data: T;
}

function list<T>(url: string, params?: Record<string, unknown>) {
  return api.get<ApiListResponse<T>>(url, { params }).then(r => r.data.data);
}

function item<T>(url: string) {
  return api.get<ApiItemResponse<T>>(url).then(r => r.data.data);
}

function post<T>(url: string, body?: unknown) {
  return api.post<ApiItemResponse<T>>(url, body).then(r => r.data.data);
}

function put<T>(url: string, body?: unknown) {
  return api.put<ApiItemResponse<T>>(url, body).then(r => r.data.data);
}

function del<T>(url: string) {
  return api.delete<ApiItemResponse<T>>(url).then(r => r.data.data);
}

// ─── IPP Types ────────────────────────────────────────────────────────────────

export interface IppProject {
  id: string;
  project_name: string;
  location: string;
  capacity_mw: number;
  technology: string;
  developer_id: string;
  status: ChainStatus;
  cod_target?: string;
  created_at: string;
}

export interface IppBond {
  id: string;
  project_id: string;
  bond_type: string;
  issuer: string;
  face_value_zar: number;
  expiry_date: string;
  days_remaining: number;
  status: ChainStatus;
  created_at: string;
}

export interface IppProcurement {
  id: string;
  project_id: string;
  ref: string;
  title: string;
  value_zar: number;
  status: ChainStatus;
  created_at: string;
}

export interface IppStageGate {
  id: string;
  project_id: string;
  gate: string;
  status: ChainStatus;
  submitted_at?: string;
  decision_at?: string;
  flags: Record<string, unknown>;
}

export interface IppDrawdown {
  id: string;
  facility_id: string;
  project_id: string;
  drawdown_ref: string;
  amount_zar: number;
  ie_cert_ref?: string;
  disbursed_amount?: number;
  match_status: string;
  status: ChainStatus;
  created_at: string;
}

export interface IppChangeOrder {
  id: string;
  project_id: string;
  co_number: string;
  description: string;
  value_zar: number;
  status: ChainStatus;
  created_at: string;
}

export interface IppDocument {
  id: string;
  project_id: string;
  title: string;
  doc_type: string;
  version: string;
  status: ChainStatus;
  r2_key?: string;
  created_at: string;
}

export interface IppRisk {
  id: string;
  project_id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  probability: number;
  impact: number;
  mitigation_plan?: string;
  owner_id?: string;
  status: ChainStatus;
  created_at: string;
}

export interface IppIssue {
  id: string;
  project_id: string;
  title: string;
  priority: string;
  status: ChainStatus;
  assigned_to?: string;
  created_at: string;
}

export interface IppEvm {
  id: string;
  project_id: string;
  project_name: string;
  bac_zar: number;
  ev_zar: number;
  ac_zar: number;
  spi: number;
  cpi: number;
  eac_zar: number;
  vac_zar: number;
  data_date: string;
}

// ─── Lender Types ─────────────────────────────────────────────────────────────

export interface LenderFacility {
  id: string;
  project_id: string;
  project_name?: string;
  borrower_name: string;
  committed_zar: number;
  drawn_zar: number;
  dscr: number;
  status: ChainStatus;
  next_cov_test_date?: string;
  maturity_date?: string;
}

export interface LenderCovenant {
  id: string;
  facility_id: string;
  covenant_code: string;
  covenant_name: string;
  covenant_type: string;
  operator: string;
  threshold: number;
  measured_value?: number;
  last_test_result?: 'pass' | 'warn' | 'breach';
  last_test_date?: string;
  status: ChainStatus;
}

export interface LenderDrawdown {
  id: string;
  facility_id: string;
  drawdown_ref: string;
  amount_zar: number;
  ie_cert_ref?: string;
  disbursed_amount?: number;
  delta_zar?: number;
  match_status: string;
  status: ChainStatus;
  created_at: string;
}

export interface LenderReserveAccount {
  id: string;
  facility_id: string;
  account_type: 'DSRA' | 'MRA' | 'OM';
  target_zar: number;
  balance_zar: number;
  funded_pct: number;
  status: ChainStatus;
}

export interface LenderDscrEntry {
  facility_id: string;
  period: string;
  dscr: number;
}

// ─── Trader Types ─────────────────────────────────────────────────────────────

export interface TraderOrder {
  id: string;
  participant_id: string;
  side: 'buy' | 'sell';
  energy_type: string;
  delivery_date?: string;
  volume_mwh: number;
  remaining_volume_mwh: number;
  price?: number;
  instruction: 'market' | 'limit' | 'post_only' | 'fok';
  status: ChainStatus;
  filled_at?: string;
  created_at: string;
}

export interface TraderPosition {
  energy_type: string;
  long_mwh: number;
  short_mwh: number;
  net_mwh: number;
  mark_price: number;
  unrealised_pnl: number;
  limit_mw: number;
  utilisation_pct: number;
}

export interface TraderPnl {
  month: string;
  gross_revenue_zar: number;
  cogs_zar: number;
  net_pnl_zar: number;
  var_zar: number;
  sharpe: number;
  max_drawdown_zar: number;
}

export interface TraderOrderBook {
  energy_type: string;
  best_bid?: number;
  best_ask?: number;
  bid_liquidity_mwh: number;
  ask_liquidity_mwh: number;
  last_price?: number;
  vwap?: number;
}

// ─── Carbon Types ─────────────────────────────────────────────────────────────

export interface CarbonCredit {
  id: string;
  owner_id: string;
  project_id: string;
  project_name?: string;
  registry: string;
  methodology?: string;
  credit_type: string;
  vintage: number;
  quantity: number;
  available_quantity: number;
  price_per_credit?: number;
  cost_basis?: number;
  status: ChainStatus;
  acquisition_date?: string;
  created_at: string;
}

export interface CarbonProject {
  id: string;
  project_name: string;
  registry: string;
  methodology: string;
  project_type: string;
  location: string;
  start_date: string;
  end_date?: string;
  status: ChainStatus;
}

export interface CarbonRetirement {
  id: string;
  credit_id: string;
  quantity: number;
  reason: string;
  beneficiary: string;
  standard: string;
  scope: string;
  certificate_ref?: string;
  retired_at: string;
  value_zar?: number;
}

export interface CarbonMrv {
  id: string;
  project_id: string;
  reporting_period: string;
  stage: ChainStatus;
  verifier?: string;
  expected_issuance?: string;
  status: ChainStatus;
  created_at: string;
}

// ─── Offtaker Types ───────────────────────────────────────────────────────────

export interface OfftakerPpa {
  id: string;
  ppa_ref: string;
  generator_name: string;
  contracted_mw: number;
  delivered_mwh?: number;
  shortfall_mwh?: number;
  shortfall_pct?: number;
  cure_window_days?: number;
  tariff_per_kwh: number;
  monthly_invoice_zar?: number;
  status: ChainStatus;
}

export interface OfftakerDelivery {
  month: string;
  contracted_gwh: number;
  delivered_gwh: number;
  variance_gwh: number;
  variance_pct: number;
  top_liability_zar: number;
  deemed_energy_zar: number;
}

export interface OfftakerTariff {
  id: string;
  ppa_ref: string;
  base_tariff: number;
  cpi_year: number;
  escalation_pct: number;
  new_tariff: number;
  effective_date: string;
  nersa_approved: boolean;
  delta_value_zar: number;
  status: ChainStatus;
}

// ─── Regulator Types ──────────────────────────────────────────────────────────

export interface RegulatorFiling {
  id: string;
  filing_type: string;
  reporting_period: string;
  filed_by: string;
  entity_name?: string;
  case_type?: string;
  sla_deadline?: string;
  days_remaining?: number;
  priority?: 'P1' | 'P2' | 'P3';
  officer?: string;
  status: ChainStatus;
  created_at: string;
}

export interface RegulatorEnforcement {
  id: string;
  ref: string;
  entity_name: string;
  violation: string;
  section_ref: string;
  fine_zar?: number;
  imposed_date?: string;
  compliance_date?: string;
  paid: boolean;
  status: ChainStatus;
}

export interface RegulatorLicence {
  id: string;
  licence_ref: string;
  entity_name: string;
  licence_class: string;
  expiry_date: string;
  days_to_expiry: number;
  status: ChainStatus;
}

// ─── Grid Types ───────────────────────────────────────────────────────────────

export interface GridConnection {
  id: string;
  project_id: string;
  project_name?: string;
  connection_point: string;
  voltage_kv: number;
  export_capacity_mw: number;
  import_capacity_mw: number;
  meter_id?: string;
  status: ChainStatus;
  connected_date?: string;
}

export interface GridNomination {
  id: string;
  date: string;
  brp: string;
  energy_type: string;
  nominated_mw: number;
  dispatched_mw?: number;
  deviation_mw?: number;
  deviation_pct?: number;
  reserve_penalty_zar?: number;
  status: ChainStatus;
}

export interface GridCurtailment {
  id: string;
  event_ref: string;
  event_date: string;
  stage: number;
  affected_zone: string;
  shed_mw: number;
  duration_min: number;
  cause: string;
  compensation_zar?: number;
  status: ChainStatus;
}

export interface GridReserveActivation {
  id: string;
  activation_ref: string;
  reserve_type: string;
  activation_datetime: string;
  provider: string;
  contracted_mw: number;
  delivered_mw?: number;
  response_time_s?: number;
  settlement_zar?: number;
  penalty_applied: boolean;
  status: ChainStatus;
}

// ─── Esums / O&M Types ────────────────────────────────────────────────────────

export interface EsumsAsset {
  id: string;
  asset_ref: string;
  site_name: string;
  asset_type: 'solar' | 'wind' | 'bess' | 'hybrid';
  capacity_kwp: number;
  availability_pct: number;
  pr_ratio: number;
  anomaly_score: number;
  rul_days?: number;
  fault_risk_index?: number;
  status: ChainStatus;
}

export interface EsumsWorkOrder {
  id: string;
  wo_ref: string;
  asset_id: string;
  asset_name?: string;
  wo_type: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  created_at: string;
  resolved_at?: string;
  duration_h?: number;
  technician?: string;
  parts_cost_zar?: number;
  sla_met?: boolean;
  status: ChainStatus;
}

export interface EsumsPrognostic {
  id: string;
  asset_id: string;
  asset_name?: string;
  component: string;
  failure_mode: string;
  predicted_failure_date?: string;
  confidence_pct: number;
  recommended_action: string;
  est_cost_zar?: number;
  priority: string;
  status: ChainStatus;
}

// ─── OEM/Support Types ────────────────────────────────────────────────────────

export interface OemTicket {
  id: string;
  ticket_ref: string;
  asset_id?: string;
  asset_name?: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  category: string;
  created_at: string;
  assignee?: string;
  sla_deadline?: string;
  hours_remaining?: number;
  status: ChainStatus;
}

export interface OemSparePart {
  id: string;
  part_number: string;
  description: string;
  ved_class: 'Vital' | 'Essential' | 'Desirable';
  on_hand: number;
  reserved: number;
  available: number;
  min_stock: number;
  lead_time_days: number;
  status: ChainStatus;
}

export interface OemWarrantyRecovery {
  id: string;
  claim_ref: string;
  defect_class: string;
  oem_name: string;
  failed_component: string;
  claimed_zar: number;
  recovery_rate_pct?: number;
  status: ChainStatus;
  eta?: string;
}

// ─── Admin Types ─────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  company_name?: string;
  is_active: boolean;
  kyc_status?: string;
  created_at: string;
  last_login?: string;
}

export interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  plan_id?: string;
  status: string;
  participant_count?: number;
  created_at: string;
}

export interface AdminKyc {
  id: string;
  user_id: string;
  user_email?: string;
  user_name?: string;
  status: string;
  submitted_at: string;
  reviewed_at?: string;
  notes?: string;
}

export interface AdminModule {
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  updated_at?: string;
}

export interface AdminAuditLog {
  id: string;
  user_id?: string;
  user_email?: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  ip_address?: string;
  created_at: string;
}

export interface AdminStats {
  total_users: number;
  active_users: number;
  total_tenants: number;
  pending_kyc: number;
  total_trades_today?: number;
  platform_gmv_zar?: number;
}

export interface AdminFeatureFlag {
  id: string;
  flag_key: string;
  name?: string;
  description?: string;
  enabled: boolean;
  rollout_percentage?: number;
  created_at: string;
  updated_at?: string;
}

export interface AdminBillingRun {
  id: string;
  run_date: string;
  status: string;
  total_amount?: number;
  invoice_count?: number;
  created_at: string;
}

export interface AdminInvoice {
  id: string;
  invoice_number: string;
  tenant_id?: string;
  tenant_name?: string;
  amount: number;
  status: string;
  due_date?: string;
  created_at: string;
}

// ─── Settlement / Invoice Types ───────────────────────────────────────────────

export interface Invoice {
  id: string;
  invoice_number: string;
  from_participant_id: string;
  to_participant_id: string;
  from_name?: string;
  to_name?: string;
  status: ChainStatus;
  total_amount: number;
  paid_amount: number;
  due_date: string;
  created_at: string;
}

// ─── Audit Types ──────────────────────────────────────────────────────────────

export interface AuditBlock {
  id: string;
  seq: number;
  actor_id: string;
  actor_name?: string;
  actor_role?: string;
  entity_type: string;
  entity_id: string;
  action: string;
  hash: string;
  prev_hash?: string;
  timestamp: string;
}

// ─── Domain clients ───────────────────────────────────────────────────────────

export const apexClient = {

  // ── Auth ──────────────────────────────────────────────────────────────────

  auth: {
    me: () => item<{ id: string; name: string; email: string; role: string; company_name?: string }>('/auth/me'),
  },

  // ── IPP ──────────────────────────────────────────────────────────────────

  ipp: {
    listProjects:       (params?: Record<string, unknown>) => list<IppProject>('/projects', params),
    getProject:         (id: string) => item<IppProject>(`/projects/${id}`),
    listBonds:          (params?: Record<string, unknown>) => list<IppBond>('/ipp/bonds', params),
    listProcurement:    (params?: Record<string, unknown>) => list<IppProcurement>('/ipp/procurement-chain', params),
    listStageGates:     (projectId?: string) => list<IppStageGate>('/ipp/cod-chain', projectId ? { project_id: projectId } : undefined),
    listChangeOrders:   (params?: Record<string, unknown>) => list<IppChangeOrder>('/ipp/change-orders/chain', params),
    listDocuments:      (projectId?: string) => list<IppDocument>('/ipp/document-control/chain', projectId ? { project_id: projectId } : undefined),
    listRisks:          (params?: Record<string, unknown>) => list<IppRisk>('/ipp-risk', params),
    listIssues:         (params?: Record<string, unknown>) => list<IppIssue>('/ipp-issues', params),
    listEvm:            (params?: Record<string, unknown>) => list<IppEvm>('/ipp/cost-evm/chain', params),
    listDrawdowns:      (params?: Record<string, unknown>) => list<IppDrawdown>('/lender/drawdown-chain', params),
    // transitions
    submitStageGate:    (id: string, body: Record<string, unknown>) => post<IppStageGate>(`/ipp/cod-chain/${id}/submit`, body),
    uploadDocument:     (body: Record<string, unknown>) => post<IppDocument>('/ipp/document-control/chain', body),
  },

  // ── Lender ────────────────────────────────────────────────────────────────

  lender: {
    listFacilities:       (params?: Record<string, unknown>) => list<LenderFacility>('/credit-origination/chain', params),
    getFacility:          (id: string) => item<LenderFacility>(`/credit-origination/chain/${id}`),
    listCovenants:        (params?: Record<string, unknown>) => list<LenderCovenant>('/lender/covenants', params),
    listDrawdowns:        (params?: Record<string, unknown>) => list<LenderDrawdown>('/lender/drawdown-chain', params),
    listReserveAccounts:  (params?: Record<string, unknown>) => list<LenderReserveAccount>('/lender/reserves', params),
    listDscrHistory:      (facilityId: string) => list<LenderDscrEntry>(`/lender/covenants?facility_id=${facilityId}`),
    // transitions
    testCovenant:         (id: string, body: Record<string, unknown>) => post<LenderCovenant>(`/lender/covenants/${id}/test`, body),
    waiveCovenant:        (id: string, body: Record<string, unknown>) => post<LenderCovenant>(`/lender/covenants/${id}/waive`, body),
    approveDisbursement:  (id: string, body: Record<string, unknown>) => post<LenderDrawdown>(`/lender/drawdown-chain/${id}/approve`, body),
  },

  // ── Trader ────────────────────────────────────────────────────────────────

  trader: {
    listOrders:     (params?: Record<string, unknown>) => list<TraderOrder>('/trading/orders', params),
    listPositions:  () => list<TraderPosition>('/trader-risk/positions'),
    getOrderBook:   (energyType: string) => item<TraderOrderBook>(`/trading/book/${energyType}`),
    listPnl:        (params?: Record<string, unknown>) => list<TraderPnl>('/trader/pnl-attribution/chain', params),
    // transitions
    placeOrder:     (body: Record<string, unknown>) => post<TraderOrder>('/trading/orders', body),
    cancelOrder:    (id: string) => post<TraderOrder>(`/trading/orders/${id}/cancel`),
  },

  // ── Carbon ────────────────────────────────────────────────────────────────

  carbon: {
    listCredits:      (params?: Record<string, unknown>) => list<CarbonCredit>('/carbon/credits', params),
    listProjects:     (params?: Record<string, unknown>) => list<CarbonProject>('/carbon-registration/chain', params),
    listRetirements:  (params?: Record<string, unknown>) => list<CarbonRetirement>('/carbon/retirement-chain', params),
    listMrv:          (params?: Record<string, unknown>) => list<CarbonMrv>('/carbon/mrv-chain', params),
    listReversals:    (params?: Record<string, unknown>) => list<Record<string, unknown>>('/carbon-reversal/chain', params),
    listRenewals:     (params?: Record<string, unknown>) => list<Record<string, unknown>>('/crediting-renewal/chain', params),
    listPoaInclusions:(params?: Record<string, unknown>) => list<Record<string, unknown>>('/poa-inclusion/chain', params),
    // transitions
    retireCredits:    (id: string, body: Record<string, unknown>) => post<CarbonCredit>(`/carbon/credits/${id}/retire`, body),
    initiateErpa:     (body: Record<string, unknown>) => post<CarbonProject>('/carbon-erpa/chain', body),
    transitionReversal:(id: string, action: string, body?: Record<string, unknown>) => post<Record<string, unknown>>(`/carbon-reversal/chain/${id}/${action}`, body),
    transitionRenewal: (id: string, action: string, body?: Record<string, unknown>) => post<Record<string, unknown>>(`/crediting-renewal/chain/${id}/${action}`, body),
    transitionPoa:     (id: string, action: string, body?: Record<string, unknown>) => post<Record<string, unknown>>(`/poa-inclusion/chain/${id}/${action}`, body),
  },

  // ── Offtaker ──────────────────────────────────────────────────────────────

  offtaker: {
    listPpas:           (params?: Record<string, unknown>) => list<OfftakerPpa>('/offtaker/ppa-contract-chain', params),
    listDeliveries:     (params?: Record<string, unknown>) => list<OfftakerDelivery>('/offtaker/ppa-annual-recon/chain', params),
    listTariffHistory:  (params?: Record<string, unknown>) => list<OfftakerTariff>('/tariff-indexation/chain', params),
  },

  // ── Regulator ─────────────────────────────────────────────────────────────

  regulator: {
    listFilings:        (params?: Record<string, unknown>) => list<RegulatorFiling>('/regulator/filings', params),
    listEnforcement:    (params?: Record<string, unknown>) => list<RegulatorEnforcement>('/regulator/enforcement-action/chain', params),
    listLicences:       (params?: Record<string, unknown>) => list<RegulatorLicence>('/licence-application/chain', params),
    getMarketSummary:   () => item<{ gmv_zar: number; active_participants: number; concentration_hhi: number }>('/regulator/market-summary'),
    // transitions
    submitFiling:       (id: string) => post<RegulatorFiling>(`/regulator/filings/${id}/submit`),
  },

  // ── Grid ──────────────────────────────────────────────────────────────────

  grid: {
    listConnections:           (params?: Record<string, unknown>) => list<GridConnection>('/grid/connections', params),
    listNominations:           (params?: Record<string, unknown>) => list<GridNomination>('/grid/dispatch-nominations', params),
    listCurtailments:          (params?: Record<string, unknown>) => list<GridCurtailment>('/grid/planned-outages', params),
    listReserveActs:           (params?: Record<string, unknown>) => list<GridReserveActivation>('/reserve-activation/chain', params),
    listCapacityAllocations:   (params?: Record<string, unknown>) => list<Record<string, unknown>>('/grid-capacity/chain', params),
    listPlannedOutages:        (params?: Record<string, unknown>) => list<Record<string, unknown>>('/grid/planned-outages', params),
    // transitions
    confirmNomination:         (id: string, body: Record<string, unknown>) => post<GridNomination>(`/grid/dispatch-nominations/${id}/confirm`, body),
    beginCapacityScreening:    (id: string, body?: Record<string, unknown>) => post<Record<string, unknown>>(`/grid-capacity/chain/${id}/begin-screening`, body),
    allocateCapacity:          (id: string, body?: Record<string, unknown>) => post<Record<string, unknown>>(`/grid-capacity/chain/${id}/allocate`, body),
    rejectCapacityApplication: (id: string, body?: Record<string, unknown>) => post<Record<string, unknown>>(`/grid-capacity/chain/${id}/reject-application`, body),
    approveOutage:             (id: string, body?: Record<string, unknown>) => post<Record<string, unknown>>(`/grid/planned-outages/${id}/approve-outage`, body),
    cancelOutage:              (id: string, body?: Record<string, unknown>) => post<Record<string, unknown>>(`/grid/planned-outages/${id}/cancel`, body),
  },

  // ── Esums / O&M ──────────────────────────────────────────────────────────

  esums: {
    listAssets:             (params?: Record<string, unknown>) => list<EsumsAsset>('/asset-prognostics/chain', params),
    listWorkOrders:         (params?: Record<string, unknown>) => list<EsumsWorkOrder>('/esums/wo-chain', params),
    listPrognostics:        (params?: Record<string, unknown>) => list<EsumsPrognostic>('/asset-prognostics/chain', params),
    computePrognostic:      (assetId: string) => post<EsumsPrognostic>(`/asset-prognostics/chain/${assetId}/compute`),
    // W12 Site Commissioning
    listCommissioning:      (params?: Record<string, unknown>) => list<Record<string, unknown>>('/esums/commissioning', params),
    registerSite:           (id: string) => post<Record<string, unknown>>(`/esums/commissioning/${id}/register-site`),
    wireIngestion:          (id: string) => post<Record<string, unknown>>(`/esums/commissioning/${id}/wire-ingestion`),
    beginOm:                (id: string) => post<Record<string, unknown>>(`/esums/commissioning/${id}/begin-om`),
    // W35 Vendor Escalation
    listVendorEscalation:   (params?: Record<string, unknown>) => list<Record<string, unknown>>('/esums/vendor-escalation/chain', params),
    triageVendor:           (id: string) => post<Record<string, unknown>>(`/esums/vendor-escalation/chain/${id}/triage`),
    escalateToOem:          (id: string) => post<Record<string, unknown>>(`/esums/vendor-escalation/chain/${id}/escalate-to-oem`),
    resolveVendor:          (id: string) => post<Record<string, unknown>>(`/esums/vendor-escalation/chain/${id}/resolve`),
  },

  // ── OEM / Support ────────────────────────────────────────────────────────

  oem: {
    listTickets:         (params?: Record<string, unknown>) => list<OemTicket>('/support/tickets', params),
    listSpareParts:      (params?: Record<string, unknown>) => list<OemSparePart>('/spare-parts-provisioning/chain', params),
    listWarrantyRecovery:(params?: Record<string, unknown>) => list<OemWarrantyRecovery>('/warranty-recovery/chain', params),
    // transitions
    escalateTicket:      (id: string, body: Record<string, unknown>) => post<OemTicket>(`/support/tickets/${id}/transition`, body),
  },

  // ── Settlement / Invoices ────────────────────────────────────────────────

  settlement: {
    listInvoices:   (params?: Record<string, unknown>) => list<Invoice>('/invoices', params),
    listPayments:   (params?: Record<string, unknown>) => list<Invoice>('/settlement/payments', params),
    payInvoice:     (id: string, body: Record<string, unknown>) => post<Invoice>(`/settlement/payments`, { invoice_id: id, ...body }),
  },

  // ── Audit ─────────────────────────────────────────────────────────────────

  audit: {
    listBlocks:     (params?: Record<string, unknown>) => list<AuditBlock>('/audit-chain', params),
    getBlock:       (id: string) => item<AuditBlock>(`/audit-chain/${id}`),
  },

  // ── Admin ─────────────────────────────────────────────────────────────────

  admin: {
    getStats:           () => item<AdminStats>('/admin/stats'),
    listUsers:          (params?: Record<string, unknown>) => list<AdminUser>('/admin/users', params),
    createUser:         (body: Record<string, unknown>) => post<AdminUser>('/admin/users', body),
    updateUser:         (id: string, body: Record<string, unknown>) => put<AdminUser>(`/admin/users/${id}`, body),
    deleteUser:         (id: string) => del<{ message: string }>(`/admin/users/${id}`),
    resetPassword:      (id: string) => post<{ temp_password: string }>(`/admin/users/${id}/password-reset`),
    listTenants:        (params?: Record<string, unknown>) => list<AdminTenant>('/admin/tenants', params),
    createTenant:       (body: Record<string, unknown>) => post<AdminTenant>('/admin/tenants', body),
    suspendTenant:      (id: string) => post<AdminTenant>(`/platform-admin/tenants/${id}/suspend`),
    reactivateTenant:   (id: string) => post<AdminTenant>(`/platform-admin/tenants/${id}/reactivate`),
    listKyc:            (params?: Record<string, unknown>) => list<AdminKyc>('/admin/kyc', params),
    reviewKyc:          (id: string, body: Record<string, unknown>) => put<AdminKyc>(`/admin/kyc/${id}`, body),
    listModules:        () => list<AdminModule>('/admin/modules'),
    updateModule:       (key: string, body: Record<string, unknown>) => put<AdminModule>(`/admin/modules/${key}`, body),
    listAuditLogs:      (params?: Record<string, unknown>) => list<AdminAuditLog>('/admin/audit-logs', params),
    listFlags:          () => list<AdminFeatureFlag>('/platform-admin/flags'),
    updateFlag:         (id: string, body: Record<string, unknown>) => put<AdminFeatureFlag>(`/platform-admin/flags/${id}`, body),
    listBillingRuns:    () => list<AdminBillingRun>('/platform-admin/billing-runs'),
    runBilling:         () => post<AdminBillingRun>('/platform-admin/invoices/run'),
    listInvoices:       (params?: Record<string, unknown>) => list<AdminInvoice>('/platform-admin/invoices', params),
  },

};

export default apexClient;
