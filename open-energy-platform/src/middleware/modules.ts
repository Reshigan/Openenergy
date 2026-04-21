// ═══════════════════════════════════════════════════════════════════════════
// Module Access Middleware — KV check → D1 modules table → 403 if disabled
// ═══════════════════════════════════════════════════════════════════════════

import { Context, Next } from 'hono';
import { HonoEnv } from '../utils/types';
import { AppError, ErrorCode } from '../utils/types';

interface ModuleConfig {
  key: string;
  displayName: string;
  requiredRoles?: string[];
}

const MODULES: Record<string, ModuleConfig> = {
  bilateral_trading: { key: 'bilateral_trading', displayName: 'Bilateral Trading' },
  exchange: { key: 'exchange', displayName: 'Exchange Trading' },
  carbon_market: { key: 'carbon_market', displayName: 'Carbon Market' },
  ipp_projects: { key: 'ipp_projects', displayName: 'IPP Projects', requiredRoles: ['ipp_developer', 'lender', 'admin'] },
  esg_sustainability: { key: 'esg_sustainability', displayName: 'ESG & Sustainability' },
  grid_wheeling: { key: 'grid_wheeling', displayName: 'Grid Wheeling', requiredRoles: ['grid_operator', 'admin'] },
  fund_management: { key: 'fund_management', displayName: 'Fund Management', requiredRoles: ['lender', 'admin'] },
  deal_rooms: { key: 'deal_rooms', displayName: 'Deal Rooms' },
  procurement: { key: 'procurement', displayName: 'Procurement Hub' },
  intelligence: { key: 'intelligence', displayName: 'Intelligence' },
  morning_briefing: { key: 'morning_briefing', displayName: 'Morning Briefing' },
  marketplace: { key: 'marketplace', displayName: 'Marketplace' },
  ona: { key: 'ona', displayName: 'Ona Integration' },
  metering: { key: 'metering', displayName: 'Metering' },
};

// Check module access — KV cache first, then D1 fallback
export async function checkModuleAccess(
  env: HonoEnv,
  userId: string,
  userRole: string,
  moduleKey: string
): Promise<boolean> {
  // Admin always has access
  if (userRole === 'admin') return true;
  
  // Check KV cache first
  const cacheKey = `module:${moduleKey}`;
  const cached = await env.KV.get(cacheKey, 'json') as { enabled: number; required_role: string | null } | null;
  
  let module;
  if (cached) {
    module = cached;
  } else {
    // Fetch from D1 and cache
    const result = await env.DB.prepare(
      'SELECT enabled, required_role FROM modules WHERE module_key = ?'
    ).bind(moduleKey).first<{ enabled: number; required_role: string | null }>();
    
    if (!result) return false;
    
    module = result;
    
    // Cache for 5 minutes
    await env.KV.put(cacheKey, JSON.stringify(module), { expirationTtl: 300 });
  }
  
  // Check if enabled
  if (module.enabled !== 1) return false;
  
  // Check role requirement
  if (module.required_role && module.required_role !== userRole) {
    return false;
  }
  
  return true;
}

// Middleware factory for specific module
export function requireModule(moduleKey: string) {
  return async (c: Context<HonoEnv>, next: Next) => {
    const auth = c.get('auth');
    
    if (!auth?.user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
    }
    
    const hasAccess = await checkModuleAccess(c.env, auth.user.id, auth.user.role, moduleKey);
    
    if (!hasAccess) {
      const moduleConfig = MODULES[moduleKey];
      const displayName = moduleConfig?.displayName || moduleKey;
      
      throw new AppError(
        ErrorCode.MODULE_DISABLED,
        `Module "${displayName}" is not available for your account`,
        403
      );
    }
    
    await next();
  };
}

// Middleware for any enabled module (auto-detect from route)
export function requireEnabledModule(getModuleKey: (c: Context<HonoEnv>) => string | null) {
  return async (c: Context<HonoEnv>, next: Next) => {
    const auth = c.get('auth');
    
    if (!auth?.user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
    }
    
    const moduleKey = getModuleKey(c);
    
    if (!moduleKey) {
      await next();
      return;
    }
    
    const hasAccess = await checkModuleAccess(c.env, auth.user.id, auth.user.role, moduleKey);
    
    if (!hasAccess) {
      throw new AppError(
        ErrorCode.MODULE_DISABLED,
        `Module not available for your account`,
        403
      );
    }
    
    await next();
  };
}

// Get all enabled modules for user (for sidebar)
export async function getEnabledModules(env: HonoEnv, userRole: string): Promise<string[]> {
  // Try KV first
  const cacheKey = `user_modules:${userRole}`;
  const cached = await env.KV.get(cacheKey, 'json') as string[] | null;
  
  if (cached) return cached;
  
  // Fetch from D1
  const result = await env.DB.prepare(
    userRole === 'admin'
      ? 'SELECT module_key FROM modules WHERE enabled = 1'
      : 'SELECT module_key FROM modules WHERE enabled = 1 AND (required_role IS NULL OR required_role = ? OR required_role = ?)'
  ).bind(userRole, userRole === 'admin' ? '' : userRole).all<{ module_key: string }>();
  
  const modules = result.results?.map(r => r.module_key) || [];
  
  // Cache for 5 minutes
  await env.KV.put(cacheKey, JSON.stringify(modules), { expirationTtl: 300 });
  
  return modules;
}

// Invalidate module cache (called when module updated)
export async function invalidateModuleCache(env: HonoEnv, moduleKey: string): Promise<void> {
  await env.KV.delete(`module:${moduleKey}`);
  
  // Also invalidate all user role caches
  const roles = ['admin', 'ipp_developer', 'trader', 'carbon_fund', 'offtaker', 'lender', 'grid_operator', 'regulator'];
  for (const role of roles) {
    await env.KV.delete(`user_modules:${role}`);
  }
}

// Module route mapping helper
export function getModuleFromRoute(pathname: string): string | null {
  const routeModuleMap: Record<string, string> = {
    '/api/contracts': 'bilateral_trading',
    '/api/trading': 'bilateral_trading',
    '/api/settlement': 'bilateral_trading',
    '/api/carbon': 'carbon_market',
    '/api/projects': 'ipp_projects',
    '/api/esg': 'esg_sustainability',
    '/api/esg-reports': 'esg_sustainability',
    '/api/grid': 'grid_wheeling',
    '/api/funds': 'fund_management',
    '/api/dealroom': 'deal_rooms',
    '/api/procurement': 'procurement',
    '/api/intelligence': 'intelligence',
    '/api/briefing': 'morning_briefing',
    '/api/marketplace': 'marketplace',
    '/api/ona': 'ona',
    '/api/metering': 'metering',
  };
  
  for (const [route, module] of Object.entries(routeModuleMap)) {
    if (pathname.startsWith(route)) {
      return module;
    }
  }
  
  return null;
}