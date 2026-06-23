// ─────────────────────────────────────────────────────────────────────────
// Layer-C esums onboarding activation. When a SolaX-monitored fleet (the
// Goldrush C&I sites are the reference case) is UPLOADED (/backfill/finalize)
// or REFRESHED (/materialize, nightly cron) the ingest path fires
// esums_financials_materialized but NOTHING consumed it — so the cross-role
// IncomingPanels (oe_role_action_queue) stayed empty even though invoices,
// carbon credits and holdings had just been written. These rules light up the
// whole ecosystem: they resolve every counterparty configured on the owner's
// solax_stations rows and pushRoleAction() one consolidated card per role:
//   ipp_developer  (the generator/owner)  -> settlement run complete
//   offtaker       (offtaker_participant_id) -> invoices ready to pay
//   carbon_fund    (carbon_participant_id, e.g. Envera) -> credits accrued
//   lender         (lender_participant_id) -> portfolio performance updated
//
// Mirrors ppa-delivery-shortfall.ts / offtaker-procurement.ts. Unlike those,
// ONE event pushes up to four cards, so dedup keys on the full tuple
// (source_entity_id, source_event, target_role, target_participant_id) — the
// reference's (entity,event)-only key would swallow cards 2-4.
//
// We push regardless of data.suppress_notifications: that flag guards the
// legacy per-row notifications table (which storms on backfill); a single
// deduped card per role per materialize does not storm.
// ─────────────────────────────────────────────────────────────────────────
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule, type CascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';
import { dstr, dnum } from '../utils/cascade-data';

const CHAIN_KEY = 'esums_activation';

async function alreadyPushed(
  ctx: CascadeContext,
  targetRole: string,
  targetParticipantId: string,
): Promise<boolean> {
  const r = await ctx.env.DB.prepare(
    `SELECT id FROM oe_role_action_queue
      WHERE source_entity_id = ? AND source_event = ?
        AND target_role = ? AND target_participant_id = ? LIMIT 1`,
  ).bind(ctx.entity_id, ctx.event, targetRole, targetParticipantId).first();
  return !!r;
}

// Distinct non-empty counterparty ids configured on the owner's stations.
// Column is a static literal (never request input) per the SQL-identifier invariant.
async function counterparties(
  ctx: CascadeContext,
  owner: string,
  column: 'offtaker_participant_id' | 'carbon_participant_id' | 'lender_participant_id',
): Promise<string[]> {
  try {
    const res = await ctx.env.DB.prepare(
      `SELECT DISTINCT ${column} AS pid FROM solax_stations
        WHERE participant_id = ? AND ${column} IS NOT NULL AND ${column} != ''`,
    ).bind(owner).all();
    return ((res.results || []) as Array<{ pid: string }>).map((r) => r.pid).filter((p) => !!p);
  } catch {
    // lender_/carbon_participant_id were force-applied out-of-band; absent on a
    // clean schema. Missing column -> no counterparties of that kind, not a crash.
    return [];
  }
}

async function push(
  ctx: CascadeContext,
  target_role: string,
  target_participant_id: string,
  title: string,
  body: Record<string, unknown>,
  target_route: string,
  action_label: string,
): Promise<void> {
  if (await alreadyPushed(ctx, target_role, target_participant_id)) return;
  await pushRoleAction(ctx.env, {
    target_role,
    target_participant_id,
    source_event: ctx.event,
    source_chain_key: CHAIN_KEY,
    source_entity_type: ctx.entity_type,
    source_entity_id: ctx.entity_id,
    title,
    body,
    cross_option: { action_label, target_route },
    priority: 'normal',
  });
}

const RULES: CascadeRule[] = [
  {
    id: 'esums_activation.materialized_fanout',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'esums_financials_materialized',
    run: async (ctx: CascadeContext) => {
      const owner = dstr(ctx, 'participant_id');
      if (!owner) return;
      const invoices = dnum(ctx, 'invoices');
      const credits = dnum(ctx, 'credits');
      const holdings = dnum(ctx, 'holdings');

      // Generator / owner: their settlement run just completed.
      await push(
        ctx, 'ipp_developer', owner,
        `Generation settlement run complete${invoices != null ? `: ${invoices} invoice${invoices === 1 ? '' : 's'}` : ''}`,
        { invoices, credits, holdings },
        '/ipp-lifecycle/workstation', 'Open settlement',
      );

      // Offtakers: invoices are ready to review/pay.
      for (const pid of await counterparties(ctx, owner, 'offtaker_participant_id')) {
        await push(
          ctx, 'offtaker', pid,
          `Settlement invoices ready${invoices != null ? `: ${invoices}` : ''}`,
          { invoices },
          '/offtaker-suite/workstation', 'Review invoices',
        );
      }

      // Carbon fund (Envera): credits + holdings accrued.
      for (const pid of await counterparties(ctx, owner, 'carbon_participant_id')) {
        await push(
          ctx, 'carbon_fund', pid,
          `Carbon credits accrued${credits != null ? `: ${credits}` : ''}`,
          { credits, holdings },
          '/carbon-registry/workstation', 'View credits',
        );
      }

      // Lender: portfolio performance refreshed.
      for (const pid of await counterparties(ctx, owner, 'lender_participant_id')) {
        await push(
          ctx, 'lender', pid,
          'Portfolio performance updated',
          { invoices, credits },
          '/lender-suite/workstation', 'View portfolio',
        );
      }
    },
  },
];

export function registerEsumsActivationRules(): void {
  for (const rule of RULES) registerCascadeRule(rule);
}

export function __esumsActivationRulesForTest(): ReadonlyArray<CascadeRule> {
  return RULES;
}
