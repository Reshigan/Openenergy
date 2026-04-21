// User & Auth Types
export type UserRole = 'admin' | 'trader' | 'risk_manager' | 'compliance_officer' | 'settlement_officer' | 'viewer';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  entity_id?: string;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthToken {
  user_id: string;
  email: string;
  role: UserRole;
  entity_id?: string;
  iat: number;
  exp: number;
}

// Entity Types
export type EntityType = 'utility' | 'ippa' | 'eskom' | 'municipality' | 'generator' | 'trader' | 'lender' | 'buyer';

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  registration_number?: string;
  vat_number?: string;
  address: string;
  city: string;
  region: string;
  country: string;
  postal_code: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  credit_rating?: string;
  credit_limit?: number;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

// Contract Types
export type ContractType = 'bilateral' | 'exchange' | 'pppa' | 'tender';
export type ContractStatus = 'draft' | 'pending_approval' | 'active' | 'suspended' | 'expired' | 'terminated';
export type ContractCategory = 'energy' | 'capacity' | 'ancillary' | 'carbon';

export interface Contract {
  id: string;
  contract_number: string;
  type: ContractType;
  category: ContractCategory;
  title: string;
  description?: string;
  buyer_id: string;
  seller_id: string;
  start_date: string;
  end_date: string;
  total_volume_mwh: number;
  remaining_volume_mwh: number;
  price_per_mwh: number;
  currency: string;
  status: ContractStatus;
  escalation_rate?: number;
  payment_terms_days: number;
  termination_clause?: string;
  force_majeure?: string;
  created_by: string;
  approved_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ContractAmendment {
  id: string;
  contract_id: string;
  amendment_number: string;
  description: string;
  requested_by: string;
  approved_by?: string;
  status: 'pending' | 'approved' | 'rejected';
  effective_date?: string;
  created_at: string;
}

export interface ContractDelivery {
  id: string;
  contract_id: string;
  delivery_date: string;
  scheduled_volume_mwh: number;
  actual_volume_mwh?: number;
  variance_percent?: number;
  delivery_point: string;
  quality_inspection?: string;
  status: 'scheduled' | 'in_transit' | 'delivered' | 'disputed' | 'short_delivery';
  notes?: string;
  created_at: string;
}

// Trading Types
export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop_loss' | 'stop_limit';
export type OrderStatus = 'pending' | 'partial' | 'filled' | 'cancelled' | 'expired';
export type MarketType = 'day_ahead' | 'intraday' | 'bilateral' | 'derivative';

export interface TradeOrder {
  id: string;
  entity_id: string;
  market_type: MarketType;
  side: OrderSide;
  energy_type: string;
  volume_mwh: number;
  price_per_mwh?: number;
  order_type: OrderType;
  valid_from: string;
  valid_until: string;
  status: OrderStatus;
  filled_volume_mwh: number;
  filled_avg_price?: number;
  parent_order_id?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TradeMatch {
  id: string;
  buy_order_id: string;
  sell_order_id: string;
  volume_mwh: number;
  price_per_mwh: number;
  settlement_id?: string;
  status: 'matched' | 'settled' | 'cancelled';
  created_at: string;
}

export interface MarketPrice {
  id: string;
  market_type: MarketType;
  energy_type: string;
  price_per_mwh: number;
  volume_mwh: number;
  timestamp: string;
}

// Settlement Types
export type SettlementStatus = 'pending' | 'invoiced' | 'paid' | 'disputed' | 'partial';
export type InvoiceType = 'energy' | 'capacity' | 'ancillary' | 'carbon' | 'balancing';

export interface Settlement {
  id: string;
  invoice_number: string;
  contract_id?: string;
  counterparty_id: string;
  entity_id: string;
  invoice_type: InvoiceType;
  period_start: string;
  period_end: string;
  total_volume_mwh: number;
  price_per_mwh: number;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  currency: string;
  status: SettlementStatus;
  due_date: string;
  paid_date?: string;
  paid_amount?: number;
  invoice_file?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentRecord {
  id: string;
  settlement_id: string;
  payment_reference: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_date: string;
  bank_reference?: string;
  notes?: string;
  created_by: string;
  created_at: string;
}

// Carbon Market Types
export type CarbonCreditType = 'CER' | 'VER' | 'EUA' | 'SAEA';
export type CarbonProjectStatus = 'pending' | 'active' | 'verified' | 'suspended' | 'expired';
export type CarbonTradeStatus = 'pending' | 'matched' | 'settled' | 'cancelled';

export interface CarbonProject {
  id: string;
  project_name: string;
  project_number: string;
  project_type: string;
  methodology: string;
  host_country: string;
  project开发者_id: string;
  credits_issued: number;
  credits_available: number;
  credits_retired: number;
  status: CarbonProjectStatus;
  registration_date?: string;
  verification_date?: string;
  expiry_date?: string;
  created_at: string;
}

export interface CarbonTrade {
  id: string;
  buyer_id: string;
  seller_id: string;
  project_id: string;
  credit_type: CarbonCreditType;
  volume_tco2: number;
  price_per_tco2: number;
  currency: string;
  status: CarbonTradeStatus;
  certificate_reference?: string;
  vintage_year?: number;
  settlement_id?: string;
  created_at: string;
}

export interface CarbonHolding {
  id: string;
  entity_id: string;
  project_id: string;
  credit_type: CarbonCreditType;
  quantity: number;
  vintage_year: number;
  acquisition_date: string;
  cost_basis: number;
  status: 'available' | 'reserved' | 'retired';
  created_at: string;
}

export interface CarbonRetirement {
  id: string;
  entity_id: string;
  project_id: string;
  quantity: number;
  retirement_reason: string;
  certificate_number?: string;
  beneficiary_name?: string;
  beneficiary_country?: string;
  retirement_date: string;
  created_by: string;
  created_at: string;
}

// IPP Types
export type IPPStructure = 'build_operate_transfer' | 'build_own_operate' | 'private_wire' | 'direct_agreement';
export type IPPStatus = 'development' | 'construction' | 'commissioning' | 'operational' | 'decommissioned';

export interface IPP {
  id: string;
  project_name: string;
  entity_id: string;
  structure_type: IPPStructure;
  technology: string;
  capacity_mw: number;
  location: string;
  coordinates?: string;
  grid_connection_point?: string;
  interconnection_capacity_mw?: number;
  status: IPPStatus;
  construction_start_date?: string;
  commercial_operation_date?: string;
  expiry_date?: string;
  ppa_volume_mwh: number;
  ppa_price_per_mwh: number;
  ppa_duration_years: number;
  renewable_energy_certificate_eligible: boolean;
  created_at: string;
  updated_at: string;
}

export interface IPPFinancial {
  id: string;
  ipp_id: string;
  equityContribution_percent: number;
  debt_amount: number;
  interest_rate: number;
  tenor_years: number;
  dsra_percent: number;
  projected_irr_percent: number;
  npv_usd: number;
  debt_service_coverage_ratio: number;
  loan_life_coverage_ratio: number;
  created_at: string;
}

export interface IPPPerformance {
  id: string;
  ipp_id: string;
  reporting_period: string;
  availability_percent: number;
  capacity_factor_percent: number;
  generation_mwh: number;
  availability_adjustment?: number;
  efficiency_adjustment?: number;
  penalty_amount?: number;
  bonus_amount?: number;
  net_payment_due: number;
  created_at: string;
}

// ESG Types
export type ESGReportStatus = 'draft' | 'in_review' | 'published' | 'verified';
export type ESGMetricCategory = 'environmental' | 'social' | 'governance';

export interface ESGMetric {
  id: string;
  metric_name: string;
  category: ESGMetricCategory;
  unit: string;
  description?: string;
  calculation_method?: string;
  created_at: string;
}

export interface ESGMeta {
  id: string;
  entity_id: string;
  metric_id: string;
  reporting_period: string;
  value: number;
  quality_evidence?: string;
  verification_status: 'pending' | 'verified' | 'rejected';
  verified_by?: string;
  verified_at?: string;
  created_at: string;
}

export interface ESGReport {
  id: string;
  report_title: string;
  entity_id: string;
  reporting_year: number;
  reporting_period: string;
  status: ESGReportStatus;
  total_ghg_emissions_tco2e?: number;
  renewable_energy_percent?: number;
  water_usage_m3?: number;
  waste_recycled_percent?: number;
  safety_incidents?: number;
  training_hours?: number;
  board_diversity_percent?: number;
  published_at?: string;
  created_by: string;
  created_at: string;
}

// Grid & Infrastructure Types
export type GridConstraintType = 'transmission' | 'distribution' | 'generation' | 'demand';
export type GridConstraintStatus = 'forecast' | 'active' | 'resolved';

export interface GridConstraint {
  id: string;
  constraint_type: GridConstraintType;
  location: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  available_capacity_mw: number;
  affected_entities: string[];
  start_date: string;
  end_date?: string;
  status: GridConstraintStatus;
  description: string;
  resolution_notes?: string;
  created_at: string;
}

export interface GridConnection {
  id: string;
  ipp_id: string;
  connection_point: string;
  voltage_kv: number;
  export_capacity_mw: number;
  import_capacity_mw: number;
  meter_id?: string;
  connected_date?: string;
  status: 'pending' | 'active' | 'suspended' | 'disconnected';
  created_at: string;
}

// Fund & Investment Types
export type FundStatus = 'active' | 'closed' | 'liquidating';
export type FundInvestorType = 'institutional' | 'strategic' | 'retail';

export interface EnergyFund {
  id: string;
  fund_name: string;
  fund_type: string;
  target_size: number;
  currency: string;
  vintage_year: number;
  tenure_years: number;
  deployment_start_date?: string;
  deployment_end_date?: string;
  status: FundStatus;
  total_commitments: number;
  total_deployed: number;
  total_distributions: number;
  irr_percent?: number;
  created_at: string;
}

export interface FundCommitment {
  id: string;
  fund_id: string;
  investor_id: string;
  commitment_amount: number;
  currency: string;
  called_amount: number;
  contributed_amount: number;
  distributed_amount: number;
  created_at: string;
}

export interface DealRoom {
  id: string;
  deal_name: string;
  deal_type: string;
  target_amount: number;
  currency: string;
  sector: string;
  stage: 'sourcing' | 'diligence' | 'term_sheet' | 'closing' | 'funded' | 'exited';
  issuer_entity_id: string;
  target_irr_percent?: number;
  min_investment: number;
  created_at: string;
}

export interface DealRoomInvestor {
  id: string;
  deal_room_id: string;
  investor_entity_id: string;
  status: 'interested' | 'diligence' | 'committed' | 'rejected';
  interest_level?: string;
  committed_amount?: number;
  created_at: string;
}

// Pipeline & Tender Types
export type PipelineStatus = 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost' | 'cancelled';
export type PipelineStage = 'identification' | 'qualification' | 'proposal' | 'negotiation' | 'contracting' | 'closed';

export interface ProcurementPipeline {
  id: string;
  opportunity_name: string;
  client_entity_id: string;
  tender_reference?: string;
  estimated_value: number;
  currency: string;
  stage: PipelineStage;
  status: PipelineStatus;
  probability_percent: number;
  submission_deadline?: string;
  award_date?: string;
  contract_value?: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface BatchOperation {
  operation: 'create' | 'update' | 'delete';
  entity_type: string;
  data: Record<string, unknown>[];
}

// Cloudflare Bindings
import type { D1Database, KVNamespace, R2Bucket, DurableObjectNamespace } from '@cloudflare/workers-types';

export { D1Database, KVNamespace, R2Bucket, DurableObjectNamespace };

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  ORDER_BOOK: DurableObjectNamespace;
  ESCROW_MGR: DurableObjectNamespace;
  RISK_ENGINE: DurableObjectNamespace;
  SMART_CONTRACT: DurableObjectNamespace;
  JWT_SECRET?: string;
  RESEND_API_KEY?: string;
}