// ═══════════════════════════════════════════════════════════════════════════
// Zod Validation Schemas for Open Energy Platform
// ═══════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

// ── AUTH SCHEMAS ──
export const RegisterSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  company_name: z.string().optional(),
  role: z.enum(['admin', 'ipp_developer', 'trader', 'carbon_fund', 'offtaker', 'lender', 'grid_operator', 'regulator']),
});

export const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const VerifyOTPSchema = z.object({
  email: z.string().email(),
  otp_code: z.string().length(6, 'OTP must be 6 digits'),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordSchema = z.object({
  token: z.string(),
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
});

// ── CONTRACT SCHEMAS ──
export const CreateContractSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  document_type: z.enum(['loi', 'term_sheet', 'hoa', 'ppa_wheeling', 'ppa_btm', 'carbon_purchase', 'carbon_option_isda', 'forward', 'epc', 'wheeling_agreement', 'offtake_agreement', 'nda']),
  counterparty_id: z.string().startsWith('id_', 'Invalid participant ID'),
  project_id: z.string().optional(),
  commercial_terms: z.string().optional(),
});

export const UpdateContractSchema = z.object({
  title: z.string().min(3).optional(),
  phase: z.enum(['draft', 'loi', 'term_sheet', 'hoa', 'draft_agreement', 'legal_review', 'statutory_check', 'execution', 'active', 'amended', 'terminated', 'expired']).optional(),
  commercial_terms: z.string().optional(),
  r2_key: z.string().optional(),
  integrity_seal: z.string().optional(),
});

export const SignContractSchema = z.object({
  document_id: z.string(),
  signature_data: z.string(), // Base64 encoded signature
});

// ── TRADING SCHEMAS ──
export const CreateOrderSchema = z.object({
  side: z.enum(['buy', 'sell']),
  energy_type: z.enum(['solar', 'wind', 'hydro', 'coal', 'gas', 'nuclear', 'biomass', 'storage']),
  volume_mwh: z.number().positive('Volume must be positive').max(10000, 'Max 10,000 MWh per order'),
  price_min: z.number().optional(),
  price_max: z.number().optional(),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  delivery_point: z.string().min(2),
  market_type: z.enum(['bilateral', 'exchange', 'spot', 'derivatives']).default('bilateral'),
});

export const MatchOrderSchema = z.object({
  buy_order_id: z.string().startsWith('id_'),
  sell_order_id: z.string().startsWith('id_'),
  volume_mwh: z.number().positive(),
  price_per_mwh: z.number().positive(),
});

// ── SETTLEMENT SCHEMAS ──
export const CreateInvoiceSchema = z.object({
  match_id: z.string().startsWith('id_').optional(),
  to_participant_id: z.string().startsWith('id_'),
  invoice_type: z.enum(['energy', 'capacity', 'carbon', 'ancillary', 'balancing', 'disbursement', 'management']),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  line_items: z.array(z.object({
    description: z.string(),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    volume_mwh: z.number().optional(),
    price_per_mwh: z.number().optional(),
    amount: z.number(),
  })),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
});

export const RecordPaymentSchema = z.object({
  invoice_id: z.string(),
  amount: z.number().positive(),
  payment_method: z.enum(['eft', 'swift', 'rtgs', 'internal']),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bank_reference: z.string().optional(),
  notes: z.string().optional(),
});

export const FileDisputeSchema = z.object({
  invoice_id: z.string(),
  reason: z.string().min(10, 'Please provide detailed reason for dispute'),
  evidence_keys: z.array(z.string()).optional(),
});

// ── CARBON SCHEMAS ──
export const CreateCarbonProjectSchema = z.object({
  project_name: z.string().min(3),
  project_type: z.string().min(2),
  methodology: z.string().min(2),
  host_country: z.string().min(2),
  credits_available: z.number().optional(),
});

export const TradeCarbonSchema = z.object({
  buyer_id: z.string().startsWith('id_'),
  seller_id: z.string().startsWith('id_'),
  project_id: z.string(),
  credit_type: z.enum(['CER', 'VER', 'EUA', 'SAEA']),
  volume_tco2: z.number().positive(),
  price_per_tco2: z.number().positive(),
  vintage_year: z.number().min(2000).max(2030).optional(),
});

export const RetireCarbonSchema = z.object({
  project_id: z.string(),
  quantity: z.number().positive(),
  retirement_reason: z.string().min(10),
  beneficiary_name: z.string().optional(),
  beneficiary_country: z.string().optional(),
});

// ── IPP PROJECT SCHEMAS ──
export const CreateIPPProjectSchema = z.object({
  project_name: z.string().min(3),
  structure_type: z.enum(['build_operate_transfer', 'build_own_operate', 'private_wire', 'direct_agreement']),
  technology: z.string().min(2),
  capacity_mw: z.number().positive().max(1000),
  location: z.string().min(3),
  coordinates: z.string().optional(),
  grid_connection_point: z.string().optional(),
  ppa_volume_mwh: z.number().optional(),
  ppa_price_per_mwh: z.number().optional(),
  ppa_duration_years: z.number().min(1).max(30).optional(),
});

export const UpdateMilestoneSchema = z.object({
  milestone_id: z.string(),
  satisfied_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['pending', 'satisfied', 'waived', 'failed']).optional(),
  evidence_keys: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const RequestDisbursementSchema = z.object({
  project_id: z.string(),
  tranche: z.string().min(1),
  requested_amount: z.number().positive(),
  notes: z.string().optional(),
});

export const ReviewDisbursementSchema = z.object({
  disbursement_id: z.string(),
  approved: z.boolean(),
  approved_amount: z.number().positive().optional(),
  notes: z.string().optional(),
});

// ── ESG SCHEMAS ──
export const RecordESGDataSchema = z.object({
  metric_id: z.string(),
  reporting_period: z.string().regex(/^\d{4}-(Q[1-4]|annual)$/, 'Use format: YYYY-Q1 or YYYY-annual'),
  value: z.number(),
  quality_evidence: z.string().optional(),
});

export const CreateESGReportSchema = z.object({
  report_title: z.string().min(3),
  reporting_year: z.number().min(2020).max(2030),
  reporting_period: z.string().regex(/^\d{4}-(Q[1-4]|annual)$/),
});

export const DecarboniseActionSchema = z.object({
  scope: z.enum(['scope1', 'scope2', 'scope3']),
  target_year: z.number().min(2030).max(2050),
  target_reduction_percentage: z.number().positive().max(100),
  actions: z.string().min(50, 'Please describe actions in detail'),
});

// ── GRID SCHEMAS ──
export const CreateGridConnectionSchema = z.object({
  project_id: z.string().optional(),
  connection_point: z.string().min(3),
  voltage_kv: z.number().positive().optional(),
  export_capacity_mw: z.number().positive().optional(),
  import_capacity_mw: z.number().positive().optional(),
  meter_id: z.string().optional(),
});

export const SubmitMeteringReadingSchema = z.object({
  connection_id: z.string(),
  reading_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  export_kwh: z.number().nonnegative().optional(),
  import_kwh: z.number().nonnegative().optional(),
  peak_demand_kw: z.number().nonnegative().optional(),
  power_factor: z.number().min(0.8).max(1).optional(),
  reading_type: z.enum(['actual', 'estimated', 'adjusted']).default('actual'),
  notes: z.string().optional(),
});

// ── PROCUREMENT SCHEMAS ──
export const CreateRFPSchema = z.object({
  title: z.string().min(5),
  description: z.string().optional(),
  closing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  evaluation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  budget: z.number().positive().optional(),
});

export const SubmitBidSchema = z.object({
  rfp_id: z.string(),
  technical_proposal_key: z.string().optional(),
  commercial_proposal_key: z.string().optional(),
  bid_amount: z.number().positive().optional(),
});

// ── DEAL ROOM SCHEMAS ──
export const CreateDealRoomSchema = z.object({
  deal_name: z.string().min(3),
  deal_type: z.string().min(2),
  target_amount: z.number().positive().optional(),
  sector: z.string().optional(),
  target_irr_percentage: z.number().optional(),
  min_investment: z.number().positive().optional(),
});

export const ProposeTermSchema = z.object({
  deal_room_id: z.string(),
  term_key: z.string().min(1),
  term_value: z.string().min(1),
  notes: z.string().optional(),
});

// ── PIPELINE SCHEMAS ──
export const CreatePipelineDealSchema = z.object({
  deal_name: z.string().min(3),
  client_participant_id: z.string().startsWith('id_'),
  deal_type: z.string().optional(),
  estimated_value: z.number().positive().optional(),
  probability_percentage: z.number().min(0).max(100).optional(),
  stage: z.enum(['identification', 'qualification', 'proposal', 'negotiation', 'contracting', 'closed']).default('identification'),
  submission_deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ── BATCH OPERATIONS SCHEMAS ──
export const BatchOperationSchema = z.object({
  operations: z.array(z.object({
    operation: z.enum(['create', 'update', 'delete']),
    entity_type: z.string(),
    entity_id: z.string().optional(),
    data: z.record(z.unknown()),
  })).min(1).max(50),
});

// ── SEARCH SCHEMA ──
export const GlobalSearchSchema = z.object({
  q: z.string().min(1).max(200),
  types: z.array(z.string()).optional(),
  limit: z.number().min(1).max(100).default(20),
});

// ── PAGINATION SCHEMA ──
export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

// ── THREAD/COMMENT SCHEMA ──
export const CreateThreadSchema = z.object({
  entity_type: z.string().min(1),
  entity_id: z.string().min(1),
  content: z.string().min(1).max(5000),
  parent_id: z.string().optional(),
});

// Type exports
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateContractInput = z.infer<typeof CreateContractSchema>;
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;
export type CreateIPPProjectInput = z.infer<typeof CreateIPPProjectInput>;
export type RecordESGDataInput = z.infer<typeof RecordESGDataSchema>;
export type BatchOperationInput = z.infer<typeof BatchOperationSchema>;