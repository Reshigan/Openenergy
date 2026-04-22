// ═══════════════════════════════════════════════════════════════════════════
// Hono Environment + Shared Types for Open Energy Platform
// ═══════════════════════════════════════════════════════════════════════════

import type { D1Database, KVNamespace, R2Bucket, DurableObjectNamespace } from '@cloudflare/workers-types';

// Workers AI binding surface (subset of what we call)
export interface WorkersAI {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
}

// Cloudflare Bindings Interface
export interface HonoEnv {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  AI?: WorkersAI;
  ORDER_BOOK: DurableObjectNamespace;
  ESCROW_MGR: DurableObjectNamespace;
  RISK_ENGINE: DurableObjectNamespace;
  SMART_CONTRACT: DurableObjectNamespace;
  JWT_SECRET: string;
  // Microsoft Entra ID SSO bindings (optional — when unset, SSO is disabled)
  AZURE_AD_CLIENT_ID?: string;
  AZURE_AD_TENANT_ID?: string;
  AZURE_AD_CLIENT_SECRET?: string;
  AZURE_AD_REDIRECT_URI?: string;
  APP_BASE_URL?: string;
}

// JWT Token Payload
export interface JWTPayload {
  sub: string;           // participant_id
  email: string;
  role: ParticipantRole;
  name: string;
  jti?: string;          // session-bound JWT ID (added in PR-Prod-1); older tokens without jti remain valid
  iat: number;
  exp: number;
}

// Participant Role Enum
export type ParticipantRole = 'admin' | 'ipp_developer' | 'trader' | 'carbon_fund' | 'offtaker' | 'lender' | 'grid_operator' | 'regulator' | 'support';

// Module Definition
export interface Module {
  id: string;
  module_key: string;
  display_name: string;
  description: string;
  enabled: number;
  required_role: string | null;
  price_monthly: number;
}

// Pagination Helper
export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// Standard API Response
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: PaginatedResult<T>['pagination'];
}

// Error Codes
export enum ErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  MODULE_DISABLED = 'MODULE_DISABLED',
}

// Custom Application Error
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Request Context with Auth
export interface AuthContext {
  user: {
    id: string;
    email: string;
    role: ParticipantRole;
    name: string;
    tenant_id?: string;
  };
}

// Context extending Hono context
export interface Ctx {
  var: {
    auth?: AuthContext;
    moduleAccess?: string[];
  };
}

// Document Phase Mapping
export const CONTRACT_PHASES = {
  draft: 0,
  loi: 1,
  term_sheet: 2,
  hoa: 3,
  draft_agreement: 4,
  legal_review: 5,
  statutory_check: 6,
  execution: 7,
  active: 8,
  amended: 9,
  terminated: 10,
  expired: 11,
} as const;

export type ContractPhase = keyof typeof CONTRACT_PHASES;

// Energy Types
export const ENERGY_TYPES = ['solar', 'wind', 'hydro', 'coal', 'gas', 'nuclear', 'biomass', 'storage'] as const;
export type EnergyType = typeof ENERGY_TYPES[number];

// Market Types
export const MARKET_TYPES = ['bilateral', 'exchange', 'spot', 'derivatives'] as const;
export type MarketType = typeof MARKET_TYPES[number];

// Currency Constants
export const CURRENCY_ZAR = 'ZAR';
export const CURRENCY_USD = 'USD';
export const CURRENCY_EUR = 'EUR';

// Date Formats
export const DATE_FORMAT = 'YYYY-MM-DD';
export const DATETIME_FORMAT = 'YYYY-MM-DDTHH:mm:ss.SSSZ';
export const SAST_TIMEZONE = 'Africa/Johannesburg';

// Fee Constants
export const DEFAULT_VAT_RATE = 0.15;
export const TRADING_COMMISSION_RATE = 0.0015; // 0.15%
export const CARBON_TRANSACTION_FEE = 0.0025;   // 0.25%

// Validation Patterns
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_PATTERN = /^\+?[0-9]{10,15}$/;
export const REGISTRATION_NUMBER_PATTERN = /^[0-9]{4}\/[0-9]{6}\/[[0-9]{2}$/;
export const VAT_PATTERN = /^ZA[0-9]{10}$/;

// Helper: Get pagination bounds
export function getPaginationBounds(page: number, pageSize: number): { offset: number; limit: number } {
  const offset = (page - 1) * pageSize;
  const limit = Math.min(pageSize, 100); // Max 100 per page
  return { offset, limit };
}

// Helper: Format pagination response
export function formatPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedResult<T> {
  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// Helper: Build WHERE clause from filters
export function buildWhereClause(
  filters: Record<string, unknown>,
  allowedFields: string[]
): { clause: string; bindings: unknown[] } {
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  
  for (const [field, value] of Object.entries(filters)) {
    if (allowedFields.includes(field) && value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        conditions.push(`${field} IN (${value.map(() => '?').join(', ')})`);
        bindings.push(...value);
      } else if (typeof value === 'string' && value.includes('%')) {
        conditions.push(`${field} LIKE ?`);
        bindings.push(value);
      } else {
        conditions.push(`${field} = ?`);
        bindings.push(value);
      }
    }
  }
  
  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    bindings,
  };
}

// Helper: Generate invoice number
export function generateInvoiceNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV-${timestamp}-${random}`;
}

// Helper: Generate document number
export function generateDocumentNumber(prefix: string): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${year}${month}-${random}`;
}

// Helper: Calculate business days between dates
export function businessDaysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  
  while (start <= end) {
    const day = start.getDay();
    if (day !== 0 && day !== 6) count++;
    start.setDate(start.getDate() + 1);
  }
  
  return count;
}

// Helper: Add business days to date
export function addBusinessDays(date: string, days: number): string {
  const result = new Date(date);
  let added = 0;
  
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      added++;
    }
  }
  
  return result.toISOString().split('T')[0];
}

// Helper: Check if module is accessible
export async function isModuleAccessible(
  env: HonoEnv,
  userRole: ParticipantRole,
  moduleKey: string
): Promise<boolean> {
  const module = await env.KV.get(`module:${moduleKey}`, 'json') as Module | null;
  
  if (!module || module.enabled !== 1) {
    return false;
  }
  
  if (!module.required_role) {
    return true;
  }
  
  return module.required_role === userRole || userRole === 'admin';
}

// Helper: Get enabled modules for user
export async function getUserModules(
  env: HonoEnv,
  userRole: ParticipantRole
): Promise<string[]> {
  const allModules = await env.DB.prepare('SELECT module_key, required_role, enabled FROM modules').all() as any;
  
  return allModules.results
    ?.filter((m: Module) => m.enabled === 1 && (!m.required_role || m.required_role === userRole || userRole === 'admin'))
    .map((m: Module) => m.module_key) || [];
}