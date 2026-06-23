// ─────────────────────────────────────────────────────────────────────────
// Generic onboarding ACTIVATION cascade.
//
// The Goldrush IPP take-on exposed a failure shape that repeats for EVERY
// archetype that joins the platform with existing history: a participant is
// provisioned, but nothing lights up the cross-role IncomingPanels of the
// counterparties their history implies. esums-activation.ts solved this for
// the esums *materialize* moment (settlement re-run). This rule solves it for
// the *activation* moment — when onboarding finishes — and generalises it to
// every source role, driven by the new/historic choice the wizard now asks.
//
// Two modes (ctx.data.take_on_mode, default 'new'):
//   • new      — fresh participant, no history. One owner welcome card.
//   • historic — take-on of existing assets/contracts/credits/capacity.
//                Resolve every counterparty the history links to and push one
//                consolidated card per (role, participant), plus an owner
//                summary and a link-completeness remediation card when a
//                required counterparty link is still NULL (the exact Goldrush
//                carbon-arm bug, surfaced instead of silently dead).
//
// Combination matrix (source role → counterparty cards) in HISTORIC mode:
//   ipp_developer / esums_owner (generation fleet, solax_stations links)
//        → offtaker     (offtaker_participant_id)   "PPA delivery + invoices live"
//        → carbon_fund  (carbon_participant_id)     "Historic carbon credits accruing"
//        → lender       (lender_participant_id)     "Project portfolio performance live"
//        + owner summary + remediation for any NULL link
//   esums_owner as O&M contractor (om_sites.om_contractor_id)
//        → ipp_developer (site owner)               "O&M contract now active + monitored"
//   lender (loan_facilities.lender_participant_id)
//        → ipp_developer (borrower_participant_id)  "Facility live; covenant reporting enabled"
//        + owner summary
//   carbon_fund (carbon_holdings / oe_rec_holdings owner)
//        → regulator                                "Imported inventory pending registry recon"
//        + owner summary "inventory ready to list"
//   offtaker (off_ppa_portfolio owner)
//        + owner summary "offtake portfolio onboarded" (no clean point-to-point seller link)
//   trader (oe_position_limits / credit_limits seeded by provisioning)
//        + owner summary "trading desk active"
//
// Dedup keys on the full tuple (source_entity_id, source_event, target_role,
// target_participant_id) so the multi-card fan-out is not swallowed and a
// re-fire (idempotent onboarding replay) does not double-push.
// ─────────────────────────────────────────────────────────────────────────
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule, type CascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';
import { dstr } from '../utils/cascade-data';
import { isPlatformRole } from '../utils/platform-event';

const CHAIN_KEY = 'onboarding_activation';

// esums_owner is an app-level role with no participants/role-action platform
// row — its IncomingPanel is the 'support' queue (matches DB storage). Every
// other logical role already IS a platform role.
function ownerRole(role: string): string {
  return role === 'esums_owner' ? 'support' : role;
}

async function alreadyPushed(
  ctx: CascadeContext,
  targetRole: string,
  targetParticipantId: string,
  title: string,
): Promise<boolean> {
  // Title is part of the key: an owner can legitimately receive two distinct
  // cards (fleet summary + link-remediation) on the same (role, participant)
  // tuple. Without title in the key the second would be swallowed as a dup.
  const r = await ctx.env.DB.prepare(
    `SELECT id FROM oe_role_action_queue
      WHERE source_entity_id = ? AND source_event = ?
        AND target_role = ? AND target_participant_id = ? AND title = ? LIMIT 1`,
  ).bind(ctx.entity_id, ctx.event, targetRole, targetParticipantId, title).first();
  return !!r;
}

async function push(
  ctx: CascadeContext,
  target_role: string,
  target_participant_id: string,
  title: string,
  body: Record<string, unknown>,
  target_route: string,
  action_label: string,
  priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal',
): Promise<void> {
  // pushRoleAction itself skips non-platform roles, but guard here too so the
  // owner-summary path does not log a spurious error for esums_owner.
  if (!isPlatformRole(target_role)) return;
  if (!target_participant_id) return;
  if (await alreadyPushed(ctx, target_role, target_participant_id, title)) return;
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
    priority,
  });
}

// Distinct non-empty counterparty ids on the owner's monitored stations.
// Column is a static literal (never request input). carbon_/lender_ were
// force-applied out-of-band, so absent on a clean schema → [] not a crash.
async function stationLinks(
  ctx: CascadeContext,
  owner: string,
  column: 'offtaker_participant_id' | 'carbon_participant_id' | 'lender_participant_id',
): Promise<string[]> {
  try {
    const res = await ctx.env.DB.prepare(
      `SELECT DISTINCT ${column} AS pid FROM solax_stations
        WHERE participant_id = ? AND ${column} IS NOT NULL AND ${column} != ''`,
    ).bind(owner).all();
    return ((res.results || []) as Array<{ pid: string }>).map((r) => r.pid).filter(Boolean);
  } catch {
    return [];
  }
}

async function count(ctx: CascadeContext, sql: string, ...binds: unknown[]): Promise<number> {
  try {
    const r = (await ctx.env.DB.prepare(sql).bind(...binds).first()) as { n?: number } | null;
    return r?.n ?? 0;
  } catch {
    return 0; // table absent on a partial schema → treat as zero, never crash activation
  }
}

// ── Per-source-role HISTORIC fan-out ───────────────────────────────────────

// Generation fleet: the Goldrush shape. Owner can be ipp_developer or
// esums_owner; the station links are identical either way.
async function activateGenerationFleet(ctx: CascadeContext, owner: string, role: string): Promise<void> {
  const stations = await count(ctx, `SELECT COUNT(*) AS n FROM solax_stations WHERE participant_id = ?`, owner);
  if (stations === 0) return;

  const offtakers = await stationLinks(ctx, owner, 'offtaker_participant_id');
  const carbon = await stationLinks(ctx, owner, 'carbon_participant_id');
  const lenders = await stationLinks(ctx, owner, 'lender_participant_id');

  for (const pid of offtakers) {
    await push(ctx, 'offtaker', pid, 'Generation onboarded: PPA delivery is now live',
      { stations }, '/offtaker-suite/workstation', 'Review PPA');
  }
  for (const pid of carbon) {
    await push(ctx, 'carbon_fund', pid, 'Generation onboarded: historic carbon credits accruing',
      { stations }, '/carbon-registry/workstation', 'View credits');
  }
  for (const pid of lenders) {
    await push(ctx, 'lender', pid, 'Generation onboarded: project performance is now live',
      { stations }, '/lender-suite/workstation', 'View portfolio');
  }

  // Owner summary + link-completeness remediation (the Goldrush carbon-arm bug
  // turned into a visible action instead of a silently dead arm).
  const missing: string[] = [];
  if (offtakers.length === 0) missing.push('offtaker');
  if (carbon.length === 0) missing.push('carbon buyer');
  if (lenders.length === 0) missing.push('lender');

  await push(ctx, ownerRole(role), owner,
    `Historic fleet onboarded: ${stations} site${stations === 1 ? '' : 's'}`,
    { stations, linked: { offtaker: offtakers.length, carbon: carbon.length, lender: lenders.length } },
    '/ipp-lifecycle/workstation', 'Open settlement');

  if (missing.length > 0) {
    await push(ctx, ownerRole(role), owner,
      `Action needed: link ${missing.join(', ')} to activate every revenue arm`,
      { missing },
      '/ipp-lifecycle/workstation', 'Complete links', 'high');
  }
}

// ESCO / O&M provider: sites where this participant is the contractor.
async function activateOmContractor(ctx: CascadeContext, owner: string, role: string): Promise<void> {
  let assetOwners: string[] = [];
  let sites = 0;
  try {
    const res = await ctx.env.DB.prepare(
      `SELECT DISTINCT participant_id AS pid FROM om_sites
        WHERE om_contractor_id = ? AND participant_id IS NOT NULL AND participant_id != ''`,
    ).bind(owner).all();
    assetOwners = ((res.results || []) as Array<{ pid: string }>).map((r) => r.pid).filter(Boolean);
    sites = await count(ctx, `SELECT COUNT(*) AS n FROM om_sites WHERE om_contractor_id = ?`, owner);
  } catch { /* om_sites absent → nothing to activate */ }
  if (sites === 0) return;

  for (const pid of assetOwners) {
    if (pid === owner) continue; // self-owned monitoring, not an outsourced contract
    await push(ctx, 'ipp_developer', pid, 'O&M contract now active and monitored',
      { sites }, '/ipp-lifecycle/workstation', 'View O&M');
  }
  await push(ctx, ownerRole(role), owner,
    `O&M portfolio onboarded: ${sites} site${sites === 1 ? '' : 's'} under management`,
    { sites }, '/horizon', 'Open workspace');
}

async function activateLender(ctx: CascadeContext, owner: string): Promise<void> {
  let borrowers: Array<{ pid: string; name: string }> = [];
  let facilities = 0;
  try {
    const res = await ctx.env.DB.prepare(
      `SELECT DISTINCT borrower_participant_id AS pid, facility_name AS name FROM loan_facilities
        WHERE lender_participant_id = ? AND borrower_participant_id IS NOT NULL AND borrower_participant_id != ''`,
    ).bind(owner).all();
    borrowers = ((res.results || []) as Array<{ pid: string; name: string }>).filter((r) => r.pid);
    facilities = await count(ctx, `SELECT COUNT(*) AS n FROM loan_facilities WHERE lender_participant_id = ?`, owner);
  } catch { /* loan_facilities absent */ }
  if (facilities === 0) return;

  for (const b of borrowers) {
    await push(ctx, 'ipp_developer', b.pid,
      `Facility live: ${b.name || 'senior debt'} — covenant reporting enabled`,
      { facility: b.name }, '/ipp-lifecycle/workstation', 'View facility');
  }
  await push(ctx, 'lender', owner,
    `Loan book onboarded: ${facilities} facilit${facilities === 1 ? 'y' : 'ies'}`,
    { facilities }, '/lender-suite/workstation', 'Open portfolio');
}

async function activateCarbonFund(ctx: CascadeContext, owner: string): Promise<void> {
  const credits = await count(ctx, `SELECT COUNT(*) AS n FROM carbon_holdings WHERE participant_id = ?`, owner);
  const recs = await count(ctx, `SELECT COUNT(*) AS n FROM oe_rec_holdings WHERE participant_id = ?`, owner);
  if (credits === 0 && recs === 0) return;

  // Imported inventory must reconcile against the registry before resale.
  await push(ctx, 'regulator', owner,
    'Imported carbon inventory pending registry reconciliation',
    { credits, recs }, '/regulator-suite/workstation', 'Review inventory');
  await push(ctx, 'carbon_fund', owner,
    `Carbon inventory onboarded: ${credits} credit holding${credits === 1 ? '' : 's'}, ${recs} REC holding${recs === 1 ? '' : 's'}`,
    { credits, recs }, '/carbon-registry/workstation', 'List for sale');
}

async function activateOfftaker(ctx: CascadeContext, owner: string): Promise<void> {
  const ppas = await count(ctx, `SELECT COUNT(*) AS n FROM off_ppa_portfolio WHERE participant_id = ?`, owner);
  if (ppas === 0) return;
  await push(ctx, 'offtaker', owner,
    `Offtake portfolio onboarded: ${ppas} PPA${ppas === 1 ? '' : 's'}`,
    { ppas }, '/offtaker-suite/workstation', 'Open portfolio');
}

async function activateTrader(ctx: CascadeContext, owner: string): Promise<void> {
  const limits = await count(ctx, `SELECT COUNT(*) AS n FROM oe_position_limits WHERE participant_id = ?`, owner);
  await push(ctx, 'trader', owner,
    'Trading desk active: credit limit set, KYC approved, market access live',
    { position_limit_configs: limits }, '/trader-risk/workstation', 'Open desk');
}

const RULES: CascadeRule[] = [
  {
    id: 'onboarding_activation.completed',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'onboarding.completed',
    run: async (ctx: CascadeContext) => {
      const owner = ctx.entity_id;
      const role = dstr(ctx, 'role');
      if (!owner || !role) return;
      const mode = dstr(ctx, 'take_on_mode') || 'new';

      if (mode !== 'historic') {
        // New participant: single welcome card to their own workspace.
        await push(ctx, ownerRole(role), owner,
          'Welcome — your workspace is ready',
          { mode: 'new' }, '/horizon', 'Open workspace');
        return;
      }

      // Historic take-on: fan out per source-role combination.
      switch (role) {
        case 'ipp_developer':
          await activateGenerationFleet(ctx, owner, role);
          break;
        case 'esums_owner':
          // Owner may be a generation/monitoring owner AND/OR an O&M contractor.
          await activateGenerationFleet(ctx, owner, role);
          await activateOmContractor(ctx, owner, role);
          break;
        case 'lender':
          await activateLender(ctx, owner);
          break;
        case 'carbon_fund':
          await activateCarbonFund(ctx, owner);
          break;
        case 'offtaker':
          await activateOfftaker(ctx, owner);
          break;
        case 'trader':
          await activateTrader(ctx, owner);
          break;
        default:
          // grid_operator / regulator / support / admin: no history to take on;
          // a welcome card keeps the activation moment consistent.
          await push(ctx, ownerRole(role), owner,
            'Workspace activated',
            { mode: 'historic' }, '/horizon', 'Open workspace');
      }
    },
  },
];

export function registerOnboardingActivationRules(): void {
  for (const rule of RULES) registerCascadeRule(rule);
}

export function __onboardingActivationRulesForTest(): ReadonlyArray<CascadeRule> {
  return RULES;
}
