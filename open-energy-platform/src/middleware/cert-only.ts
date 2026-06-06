// ═══════════════════════════════════════════════════════════════════════════════
// Certificate-Only Guard Middleware
// Blocks full-trading routes for participants with certificate_only market access.
// certificate_only participants may use: /api/rec/*, /api/vcm/*, /api/carbon-tax/*,
// /api/certificate-track/*, and all read-only endpoints.
// ═══════════════════════════════════════════════════════════════════════════════

import type { Context, Next } from 'hono';
import type { HonoEnv } from '../utils/types';
import { getCurrentUser } from './auth';

const BLOCKED_FOR_CERT_ONLY = [
  '/api/trading',
  '/api/order-book',
  '/api/settlement',
  '/api/clearing-disclosure',
  '/api/margin-gate',
  '/api/poslimit',
  '/api/algo-cert',
  '/api/market-abuse',
  '/api/trade-reporting',
  '/api/best-execution',
  '/api/trade-allocation',
  '/api/counterparty-margin',
  '/api/cross-border-trades',
  '/api/imbalance-settlement',
  '/api/benchmark-transition',
  '/api/pnl-attribution',
];

export async function certOnlyGuard(c: Context<HonoEnv>, next: Next): Promise<Response | void> {
  const user = getCurrentUser(c);
  const marketAccess = (user as any).participant_market_access ?? 'full_trading';

  if (marketAccess !== 'certificate_only') {
    return next();
  }

  const path = new URL(c.req.url).pathname;
  const blocked = BLOCKED_FOR_CERT_ONLY.some(prefix => path.startsWith(prefix));
  if (blocked) {
    return c.json({
      success: false,
      error: 'This route requires full trading access. Upgrade your plan at /settings/upgrade.',
      upgrade_url: '/settings/upgrade',
    }, 403);
  }

  return next();
}
