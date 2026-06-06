// ═══════════════════════════════════════════════════════════════════════════
// Layer A — trading-safety rules (FSCA).
//   #2 Algo kill-switch:  algo_certification.suspended → block; .deployed → lift
//   #5 Market-abuse STOR:  market_abuse.stor_filed → freeze; .cleared → lift
//
// The block is written to oe_algo_trading_blocks keyed on the cert/case PARTY
// id (firm_party_id / subject_party_id). The pre-trade guard resolves that back
// to the trading participant via a direct id match OR the oe_trading_party_link
// bridge. The block row + the registry's oe_cascade_rule_audit row + the trader
// role-action are always written, so a missing party↔participant mapping is
// observable — never a silent no-op safety failure.
//
// Lift rules run as the unattended cascade actor (lifted_by = 'system:cascade').
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';

function partyId(ctx: CascadeContext, field: string): string | null {
  const data = ctx.data as Record<string, unknown> | undefined;
  const v = data?.[field];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

// Map a party id back to the trading participant, if a bridge row exists.
async function resolveParticipantId(env: CascadeContext['env'], party: string): Promise<string | null> {
  const row = (await env.DB.prepare(
    `SELECT participant_id FROM oe_trading_party_link WHERE party_id = ? LIMIT 1`,
  ).bind(party).first()) as { participant_id: string } | null;
  return row?.participant_id ?? null;
}

async function applyBlock(ctx: CascadeContext, party: string, reason: string): Promise<void> {
  // Idempotent: skip if an active block of this reason already exists.
  const existing = (await ctx.env.DB.prepare(
    `SELECT id FROM oe_algo_trading_blocks WHERE participant_id = ? AND block_reason = ? AND is_active = 1 LIMIT 1`,
  ).bind(party, reason).first()) as { id: string } | null;
  if (existing) return;
  await ctx.env.DB.prepare(
    `INSERT INTO oe_algo_trading_blocks
       (id, participant_id, algo_cert_id, block_reason, source_event, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
  ).bind(
    `atb_${crypto.randomUUID()}`, party,
    ctx.entity_type === 'algo_certification' ? ctx.entity_id : null,
    reason, ctx.event, new Date().toISOString(),
  ).run();
}

async function liftBlock(ctx: CascadeContext, party: string, reason: string): Promise<void> {
  await ctx.env.DB.prepare(
    `UPDATE oe_algo_trading_blocks
        SET is_active = 0, lifted_at = ?, lifted_by = 'system:cascade'
      WHERE participant_id = ? AND block_reason = ? AND is_active = 1`,
  ).bind(new Date().toISOString(), party, reason).run();
}

async function pushTraderAlert(
  ctx: CascadeContext, party: string, chainKey: string, title: string, route: string,
): Promise<void> {
  const participant = await resolveParticipantId(ctx.env, party);
  await pushRoleAction(ctx.env, {
    target_role: 'trader',
    target_participant_id: participant ?? undefined, // unresolved → role-wide (never invisible)
    source_event: ctx.event,
    source_chain_key: chainKey,
    source_entity_type: ctx.entity_type,
    source_entity_id: ctx.entity_id,
    title,
    body: { party_id: party, entity_id: ctx.entity_id },
    cross_option: { action_label: 'Review case', target_route: route },
    priority: 'urgent',
  });
}

export function registerTradingSafetyRules(): void {
  // #2 — algo kill-switch applies the block.
  registerCascadeRule({
    id: 'safety.algo_kill_switch_block',
    mode: 'block',
    match: (ctx) => ctx.event === 'algo_certification.suspended',
    run: async (ctx) => {
      const party = partyId(ctx, 'firm_party_id');
      if (!party) return; // observable: rule-audit 'ran' row still written by the registry
      await applyBlock(ctx, party, 'algo_kill_switch');
      await pushTraderAlert(
        ctx, party, 'algo_certification',
        'Algorithmic trading suspended — kill switch invoked',
        `/trader/workstation?tab=algo-cert&id=${ctx.entity_id}`,
      );
    },
  });

  // #2 — reinstatement / redeploy lifts the block.
  registerCascadeRule({
    id: 'safety.algo_block_lift',
    mode: 'drive',
    match: (ctx) => ctx.event === 'algo_certification.deployed',
    run: async (ctx) => {
      const party = partyId(ctx, 'firm_party_id');
      if (!party) return;
      await liftBlock(ctx, party, 'algo_kill_switch');
    },
  });

  // #5 — STOR filing freezes the subject.
  registerCascadeRule({
    id: 'safety.market_abuse_stor_freeze',
    mode: 'block',
    match: (ctx) => ctx.event === 'market_abuse.stor_filed',
    run: async (ctx) => {
      const party = partyId(ctx, 'subject_party_id');
      if (!party) return;
      await applyBlock(ctx, party, 'market_abuse_stor');
      await pushTraderAlert(
        ctx, party, 'market_abuse_case',
        'Trading frozen — market-abuse STOR filed',
        `/trader/workstation?tab=market-abuse&id=${ctx.entity_id}`,
      );
    },
  });

  // #5 — clearance lifts the freeze (sanction/enforcement deliberately do not).
  registerCascadeRule({
    id: 'safety.market_abuse_freeze_lift',
    mode: 'drive',
    match: (ctx) => ctx.event === 'market_abuse.cleared',
    run: async (ctx) => {
      const party = partyId(ctx, 'subject_party_id');
      if (!party) return;
      await liftBlock(ctx, party, 'market_abuse_stor');
    },
  });
}
