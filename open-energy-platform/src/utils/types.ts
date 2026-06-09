// ═══════════════════════════════════════════════════════════════════════════
// Hono Environment + Shared Types for Open Energy Platform
// ═══════════════════════════════════════════════════════════════════════════

import type { D1Database, KVNamespace, R2Bucket, DurableObjectNamespace, Queue } from '@cloudflare/workers-types';
import type { PlatformRole } from './platform-event';

// Workers AI binding surface (subset of what we call)
export interface WorkersAI {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
}

// Analytics Engine dataset — high-frequency time-series (Esums telemetry,
// metering events). Write-only from Workers; read via CF Analytics Engine
// SQL API (https://developers.cloudflare.com/analytics/analytics-engine/sql-api/).
export interface AnalyticsEngineDataset {
  writeDataPoint(event: {
    blobs?: (string | null | undefined)[];
    doubles?: (number | null | undefined)[];
    indexes?: string[];
  }): void;
}

// Hyperdrive connection pooler — wraps an external Postgres database
// (Neon, Supabase, PlanetScale, AWS RDS) at the Cloudflare edge.
// Use for transaction-heavy tables that need true MVCC/ACID beyond D1's
// SQLite WAL envelope. See src/utils/db-adapter.ts for usage.
export interface HyperdriveBinding {
  /** Postgres connection string injected by Hyperdrive. Pass to `postgres()`. */
  connectionString: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

// Cloudflare Bindings Interface — the shape of `env` injected into Workers.
// This is what `c.env` resolves to inside a Hono handler.
export interface HonoBindings {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  AI?: WorkersAI;
  ORDER_BOOK: DurableObjectNamespace;
  ESCROW_MGR: DurableObjectNamespace;
  RISK_ENGINE: DurableObjectNamespace;
  SMART_CONTRACT: DurableObjectNamespace;

  // ── Metering shards ───────────────────────────────────────────────────────
  // Current-month D1 for hot metering writes — see metering-router.ts.
  METERING_DB_CURRENT?: D1Database;

  // ── Esums storage tiers ───────────────────────────────────────────────────
  // Tier 2: Dedicated telemetry D1 (all sites, separate from main DB).
  //   Provision: wrangler d1 create esums-telemetry
  ESUMS_TELEMETRY_DB?: D1Database;
  // Tier 3: Per-project D1 shards (ESUMS_DB_<SHARD_KEY>).
  //   Provision: wrangler d1 create esums-<project-key>
  //   Bind as ESUMS_DB_MYPROJECT in wrangler.toml.
  //   Large deployments only; set shard_key on the esums_projects row.
  // Tier 4: Analytics Engine — high-frequency side-write for dashboards.
  //   Provision: add [[analytics_engine_datasets]] block in wrangler.toml.
  TELEMETRY?: AnalyticsEngineDataset;

  // ── Hyperdrive (Postgres) — Tier 5 ───────────────────────────────────────
  // Activate for transaction-heavy workloads that exceed D1's SQLite envelope:
  //   wrangler hyperdrive create open-energy-pg \
  //     --connection-string "postgres://user:pass@host:5432/db"
  // Then uncomment the [[hyperdrive]] block in wrangler.toml and set tables
  // to route via db-adapter.ts. Start with new high-volume tables; existing
  // D1 tables can be migrated incrementally.
  HYPERDRIVE?: HyperdriveBinding;

  // ── SolaX inverter integration ───────────────────────────────────────────
  SOLAX_BASE_URL?: string;      // defaults to https://openapi-eu.solaxcloud.com
  SOLAX_CLIENT_ID?: string;
  SOLAX_CLIENT_SECRET?: string;

  // ── Platform ──────────────────────────────────────────────────────────────
  ASSETS?: { fetch: (req: Request) => Promise<Response> };

  // ── Ecosystem cascade Queue (national-scale async fan-out) ───────────────
  // Optional: when bound, fireCascade enqueues PlatformEvents and a Queue
  // consumer runs the registry/fee/analytics layers off the request path.
  // Until provisioned the layers run inline (see fireCascade). Provision:
  //   wrangler queues create open-energy-cascade
  // then uncomment the [[queues.producers]] + [[queues.consumers]] blocks.
  QUEUE?: Queue;
  JWT_SECRET: string;
  // ES256 asymmetric signing (preferred over HS256 JWT_SECRET).
  // Generate with: node scripts/generate-jwt-keys.mjs
  // Set as Worker secrets: wrangler secret put JWT_PRIVATE_KEY_JWK / JWT_PUBLIC_KEY_JWK
  JWT_PRIVATE_KEY_JWK?: string;
  JWT_PUBLIC_KEY_JWK?: string;
  AZURE_AD_CLIENT_ID?: string;
  AZURE_AD_TENANT_ID?: string;
  AZURE_AD_CLIENT_SECRET?: string;
  AZURE_AD_REDIRECT_URI?: string;
  APP_BASE_URL?: string;
  BACKUP_TOKEN?: string;
}

// Authenticated user attached to the request context by authMiddleware.
export interface AuthContext {
  user: {
    id: string;
    email: string;
    role: ParticipantRole;
    name: string;
    tenant_id: string;
  };
}

// Hono context variables (set via c.set / read via c.get). Optional because
// not every middleware runs on every request — handlers must defend against
// undefined when no auth middleware fired.
export interface HonoVariables {
  auth?: AuthContext;
  requestId?: string;
  // Legacy keys read by older route code (esg-reports, dealroom, etc.).
  // Kept for backward compatibility; new code should use 'auth'.
  participant?: { id: string; role: ParticipantRole; tenant_id?: string };
  user?: { id: string; email?: string; role?: ParticipantRole };
}

// Hono generic env — used as `new Hono<HonoEnv>()` and `Context<HonoEnv>`.
// Hono requires `{ Bindings, Variables }` for its generic; older callers that
// expected the flat bindings shape should switch to `HonoEnv['Bindings']`.
export type HonoEnv = {
  Bindings: HonoBindings;
  Variables: HonoVariables;
};

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
// ParticipantRole is an alias of the canonical PlatformRole (single source of
// truth: ALL_ROLES in platform-event.ts). Same 9 roles; do not re-list them here.
export type ParticipantRole = PlatformRole;

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

// AuthContext is declared above (alongside HonoEnv / HonoVariables) — this
// older duplicate has been removed so the typing resolves to a single shape.

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
  env: HonoEnv['Bindings'],
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
  env: HonoEnv['Bindings'],
  userRole: ParticipantRole
): Promise<string[]> {
  const allModules = await env.DB.prepare('SELECT module_key, required_role, enabled FROM modules').all() as any;
  
  return allModules.results
    ?.filter((m: Module) => m.enabled === 1 && (!m.required_role || m.required_role === userRole || userRole === 'admin'))
    .map((m: Module) => m.module_key) || [];
}