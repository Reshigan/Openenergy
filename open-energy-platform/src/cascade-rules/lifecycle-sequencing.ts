// ═══════════════════════════════════════════════════════════════════════════
// Layer A — lifecycle-sequencing rules (mode:'drive').
// Five upstream transitions auto-sequence their downstream chains as the
// dedicated system:cascade actor (never impersonating the affected role):
//   #1  cod.certify_cod                        → auto-activate PPA + lender drawdown prompt
//   #3  covenant_certificate.breach_identified → open reserve cure + lender prompt
//   #4  reserve_account.breached               → auto-create loan default + lender prompt
//   #7  licence_application.licence_issued      → auto-create NERSA levy + licence renewal + regulator prompt
//   #10 carbon.mrv_issued                       → carbon-fund retirement prompt
//
// Each rule reads only ctx.data (the source chain spreads its full row in).
// create-rules guard on (source_entity_type, source_entity_id); advance-rules
// guard via the predecessor-status WHERE clause; prompts guard via alreadyPushed.
// Advance-rules deliberately do NOT re-fire fireCascade (no cascade recursion).
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule, type CascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';

const SYSTEM_ACTOR = 'system:cascade';
const SOURCE_WAVE = 'W3';
const DEFAULT_LICENCE_VALIDITY_YEARS = 25;

// ── data accessors ──────────────────────────────────────────────────────────
function dstr(ctx: CascadeContext, key: string): string | null {
  const v = (ctx.data as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function dnum(ctx: CascadeContext, key: string): number | null {
  const v = (ctx.data as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
function nowIso(): string {
  return new Date().toISOString();
}
// short human-facing case number from a uuid-bearing id
function numberFrom(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase()}`;
}

// SA fiscal year (Apr 1 – Mar 31). e.g. 2026-06 → '2026/27', 2026-02 → '2025/26'.
export function saFinancialYear(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0=Jan, 3=Apr
  const start = m >= 3 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

function plusYearsIso(baseIso: string | null, years: number): string {
  const base = baseIso ? new Date(baseIso) : new Date();
  const d = Number.isNaN(base.getTime()) ? new Date() : base;
  return new Date(Date.UTC(
    d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate(),
  )).toISOString();
}

// licence_type → (renewal licence_type, renewal licence_class). null ⇒ unsupported.
function renewalClassFor(licenceType: string | null): { type: string; klass: string } | null {
  switch (licenceType) {
    case 'generation':   return { type: 'generation',   klass: 'generation_utility' };
    case 'distribution': return { type: 'distribution', klass: 'distribution' };
    case 'trading':      return { type: 'trading',      klass: 'trading' };
    default:             return null; // transmission / import_export / unknown
  }
}

// ── role-action prompt dedup ─────────────────────────────────────────────────
async function alreadyPushed(
  ctx: CascadeContext, sourceEntityId: string, targetRole: string,
): Promise<boolean> {
  const r = await ctx.env.DB.prepare(
    `SELECT id FROM oe_role_action_queue
      WHERE source_entity_id = ? AND source_event = ? AND target_role = ? LIMIT 1`,
  ).bind(sourceEntityId, ctx.event, targetRole).first();
  return !!r;
}

// TODO(W3): consumed by later lifecycle rules (Tasks 3–6)
void dnum; void plusYearsIso; void renewalClassFor; void DEFAULT_LICENCE_VALIDITY_YEARS; void alreadyPushed;

const RULES: CascadeRule[] = [
  // #4 reserve breach → loan default (event of default)
  {
    id: 'lifecycle.reserve_breach_to_loan_default',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'reserve_account.breached',
    run: async (ctx: CascadeContext) => {
      const borrowerName = dstr(ctx, 'borrower_name');
      if (!borrowerName) return; // cannot raise a default without a borrower

      const existing = await ctx.env.DB.prepare(
        `SELECT id FROM oe_loan_defaults
          WHERE source_entity_type='reserve_account' AND source_entity_id=? LIMIT 1`,
      ).bind(ctx.entity_id).first();
      if (existing) return;

      const id = uid('ldf');
      const now = nowIso();
      const facilityName =
        dstr(ctx, 'facility_ref') ?? dstr(ctx, 'loan_agreement_ref') ??
        dstr(ctx, 'reserve_number') ?? 'Unspecified facility';
      const borrowerPartyId =
        dstr(ctx, 'project_id') ?? dstr(ctx, 'reserve_number') ?? ctx.entity_id;

      await ctx.env.DB.prepare(
        `INSERT INTO oe_loan_defaults
           (id, default_number, source_event, source_entity_type, source_entity_id, source_wave,
            borrower_party_id, borrower_party_name, lender_name, facility_name, facility_tier,
            default_type, default_event, flag_basis,
            chain_status, default_flagged_at, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?, ?,?,?,?, 'senior_secured',
                 'covenant', 'reserve_account_breach', ?,
                 'default_flagged', ?, ?, ?, ?)`,
      ).bind(
        id, numberFrom('LDF', id), ctx.event, 'reserve_account', ctx.entity_id, SOURCE_WAVE,
        borrowerPartyId, borrowerName, dstr(ctx, 'lender_name'), facilityName,
        `Auto-raised from reserve-account breach ${dstr(ctx, 'reserve_number') ?? ctx.entity_id}`,
        now, SYSTEM_ACTOR, now, now,
      ).run();

      await pushRoleAction(ctx.env, {
        target_role: 'lender',
        source_event: ctx.event, source_chain_key: 'loan_default',
        source_entity_type: 'loan_default', source_entity_id: id,
        title: `Event of default — reserve breach on ${facilityName}`,
        body: { borrower_party_name: borrowerName, reserve_account_id: ctx.entity_id, default_id: id },
        cross_option: { action_label: 'Manage default', target_route: `/lender/workstation?tab=loan-defaults&id=${id}` },
        priority: 'urgent',
      });
    },
  },
];

export function registerLifecycleSequencingRules(): void {
  for (const rule of RULES) registerCascadeRule(rule);
}

// Test-only accessor: the rule objects this module registers.
export function __lifecycleRulesForTest(): ReadonlyArray<CascadeRule> {
  return RULES;
}
