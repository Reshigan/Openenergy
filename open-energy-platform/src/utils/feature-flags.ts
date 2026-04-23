// ═══════════════════════════════════════════════════════════════════════════
// Feature-flag evaluator — pure, deterministic. Given a flag definition, a
// request context (tenant_id, tier, role, participant_id) and any overrides,
// compute the effective value.
//
// Rollout strategies:
//   - off             → default_value
//   - all             → 'true'
//   - percentage      → stable hash of (tenant_id, flag_key) modulo 100
//   - by_tier         → match tier vs config.tiers[]
//   - by_tenant       → match tenant_id vs config.tenant_ids[]
//   - by_role         → match role vs config.roles[]
// Overrides always win if they match.
// ═══════════════════════════════════════════════════════════════════════════

export interface FlagDef {
  flag_key: string;
  default_value: string;
  rollout_strategy: 'off' | 'all' | 'percentage' | 'by_tier' | 'by_tenant' | 'by_role';
  rollout_config_json: string | null;
  enabled: boolean;
}

export interface FlagOverride {
  tenant_id: string | null;
  participant_id: string | null;
  value: string;
  expires_at: string | null;
}

export interface EvalContext {
  tenant_id: string;
  participant_id?: string;
  tier?: string;
  role?: string;
  /** ISO datetime to compare overrides' expiry against; defaults to now. */
  asOf?: string;
}

/**
 * Deterministic 0-99 percentile for a (flag, tenant) pair. Uses a simple FNV-1a
 * style rolling hash so behaviour is stable across deploys and platforms.
 */
export function percentileFor(flagKey: string, tenantId: string): number {
  const s = `${flagKey}:${tenantId}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h % 100;
}

export function evaluateFlag(
  flag: FlagDef,
  overrides: FlagOverride[],
  ctx: EvalContext,
): { value: string; matched_override: boolean; strategy: string } {
  if (!flag.enabled) return { value: flag.default_value, matched_override: false, strategy: 'disabled' };

  const now = ctx.asOf || new Date().toISOString();

  // 1. Participant-level override
  const part = overrides.find((o) =>
    o.participant_id && o.participant_id === ctx.participant_id
      && (!o.expires_at || o.expires_at > now));
  if (part) return { value: part.value, matched_override: true, strategy: 'override_participant' };

  // 2. Tenant-level override
  const ten = overrides.find((o) =>
    o.tenant_id && o.tenant_id === ctx.tenant_id
      && !o.participant_id
      && (!o.expires_at || o.expires_at > now));
  if (ten) return { value: ten.value, matched_override: true, strategy: 'override_tenant' };

  // 3. Strategy
  const cfg = safeParseJson(flag.rollout_config_json);
  switch (flag.rollout_strategy) {
    case 'off':
      return { value: flag.default_value, matched_override: false, strategy: 'off' };
    case 'all':
      return { value: 'true', matched_override: false, strategy: 'all' };
    case 'percentage': {
      const pct = Number(cfg.percentage || 0);
      const bucket = percentileFor(flag.flag_key, ctx.tenant_id);
      return {
        value: bucket < pct ? 'true' : flag.default_value,
        matched_override: false,
        strategy: `percentage(${pct})`,
      };
    }
    case 'by_tier': {
      const tiers = Array.isArray(cfg.tiers) ? cfg.tiers : [];
      return {
        value: ctx.tier && tiers.includes(ctx.tier) ? 'true' : flag.default_value,
        matched_override: false,
        strategy: `by_tier(${tiers.join(',')})`,
      };
    }
    case 'by_tenant': {
      const ids = Array.isArray(cfg.tenant_ids) ? cfg.tenant_ids : [];
      return {
        value: ids.includes(ctx.tenant_id) ? 'true' : flag.default_value,
        matched_override: false,
        strategy: `by_tenant(${ids.length})`,
      };
    }
    case 'by_role': {
      const roles = Array.isArray(cfg.roles) ? cfg.roles : [];
      return {
        value: ctx.role && roles.includes(ctx.role) ? 'true' : flag.default_value,
        matched_override: false,
        strategy: `by_role(${roles.join(',')})`,
      };
    }
    default:
      return { value: flag.default_value, matched_override: false, strategy: 'unknown' };
  }
}

function safeParseJson(s: string | null): Record<string, unknown> {
  if (!s) return {};
  try {
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Parse a stored value ('true', 'false', '"foo"', '42', etc.) to its typed form.
 * Non-JSON strings fall back to the raw string (backward-compatible).
 */
export function coerceFlagValue(raw: string): boolean | number | string {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
}
