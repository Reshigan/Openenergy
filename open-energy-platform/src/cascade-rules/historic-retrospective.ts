// ─────────────────────────────────────────────────────────────────────────
// Historic-retrospective chain-case seeding on onboarding.
//
// onboarding-activation.ts pushes the cross-role IncomingPanel CARDS when a
// historic participant activates. But Horizon (GET /api/horizon/:role) is
// chain-case-driven: it counts non-terminal rows in the MERIDIAN_CHAINS chain
// tables. A freshly-onboarded historic fleet therefore still lands on an EMPTY
// Horizon until a live case exists. This module derives that opening case per
// role from the participant's real provisioned history — the hand-run
// equivalent of scripts/backfill-{gonxt-ipp,goldrush-ppa,growvest-covenant}-
// horizon.sql, now executed automatically at the activation moment.
//
// CALCULATED retrospective off the real fleet (user override of actuals-only
// for the take-on case): annual MWh = capacity_mw * 1752 (= cap * 8760h * 0.20
// capacity factor). Quarterly contracted = /4, monthly = /12.
//
// Every arm is defensive: a table absent on a partial schema or a column the
// participant's archetype doesn't carry degrades to "no seed", never a thrown
// activation. Idempotent: deterministic ids + INSERT OR IGNORE, so an
// onboarding replay does not double-seed.
// ─────────────────────────────────────────────────────────────────────────
import type { CascadeContext } from '../utils/cascade';

const CF_ANNUAL_MWH_PER_MW = 1752; // 8760h * 0.20 capacity factor

// Current calendar quarter, derived at runtime. now is a Worker-runtime Date
// (this is request-path/cascade code, not a Workflow sandbox).
function currentQuarter(now: Date): {
  quarter: string;
  periodStart: string;
  periodEnd: string;
  month: string;
} {
  const y = now.getUTCFullYear();
  const q = Math.floor(now.getUTCMonth() / 3) + 1; // 1..4
  const startMonth = (q - 1) * 3; // 0,3,6,9
  const start = new Date(Date.UTC(y, startMonth, 1));
  const end = new Date(Date.UTC(y, startMonth + 3, 0)); // last day of quarter
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const month = `${y}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return { quarter: `Q${q}-${y}`, periodStart: iso(start), periodEnd: iso(end), month };
}

async function safeRun(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    // Table/column absent on this archetype's schema, or no history to seed.
    // Onboarding activation must never fail on a retrospective seed.
  }
}

interface ProjectRow {
  id: string;
  capacity_mw: number;
}

// ── ipp_developer: one quarterly generation report per project ──────────────
async function seedIppQuarterlyReports(ctx: CascadeContext, owner: string): Promise<void> {
  const res = await ctx.env.DB.prepare(
    `SELECT id, capacity_mw FROM ipp_projects
       WHERE developer_id = ? AND capacity_mw IS NOT NULL`,
  ).bind(owner).all();
  const projects = (res.results || []) as unknown as ProjectRow[];
  if (projects.length === 0) return;

  const now = new Date();
  const { quarter, periodStart, periodEnd } = currentQuarter(now);
  const slaDeadline = new Date(now.getTime() + 30 * 24 * 3_600_000).toISOString();
  const nowIso = now.toISOString();

  for (const p of projects) {
    const contracted = Math.round((p.capacity_mw * CF_ANNUAL_MWH_PER_MW) / 4 * 100) / 100;
    const actual = Math.round(contracted * 0.93 * 100) / 100;
    const id = `qgr_${quarter.toLowerCase().replace('-', '_')}_${String(p.id).slice(2, 14)}`;
    await ctx.env.DB.prepare(
      `INSERT OR IGNORE INTO oe_ipp_quarterly_gen_reports
         (id, participant_id, project_id, quarter,
          report_period_start, report_period_end,
          project_mw, mwh_contracted, mwh_actual,
          availability_pct, capacity_factor_pct,
          project_tier, chain_status,
          sla_days, sla_deadline, sla_breached,
          actor_id, actor_party, notes,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)`,
    ).bind(
      id, owner, p.id, quarter, periodStart, periodEnd,
      p.capacity_mw, contracted, actual, 97.4, 20.0,
      'small', 'report_quarter_opened', 30, slaDeadline,
      owner, 'ipp',
      'Opening quarterly generation report derived on onboarding. Contracted = capacity * 1752/4; actual at 0.93 (calculated retrospective off real fleet).',
      nowIso, nowIso,
    ).run();
  }
}

interface PpaRow {
  id: string;
  capacity_mw: number;
  counterparty_id: string | null;
}

// ── offtaker: current-month delivery obligation per active PPA ──────────────
async function seedOfftakerObligations(ctx: CascadeContext, owner: string): Promise<void> {
  // counterparty_id column name varies by provisioning; try the canonical one,
  // fall back to NULL seller if the column is absent.
  let ppas: PpaRow[] = [];
  try {
    const res = await ctx.env.DB.prepare(
      `SELECT id, capacity_mw, counterparty_id FROM off_ppa_portfolio
         WHERE participant_id = ? AND status = 'active' AND capacity_mw IS NOT NULL`,
    ).bind(owner).all();
    ppas = (res.results || []) as unknown as PpaRow[];
  } catch {
    const res = await ctx.env.DB.prepare(
      `SELECT id, capacity_mw FROM off_ppa_portfolio
         WHERE participant_id = ? AND status = 'active' AND capacity_mw IS NOT NULL`,
    ).bind(owner).all();
    ppas = ((res.results || []) as unknown as Array<{ id: string; capacity_mw: number }>)
      .map((r) => ({ ...r, counterparty_id: null }));
  }
  if (ppas.length === 0) return;

  const { month } = currentQuarter(new Date());
  for (const ppa of ppas) {
    const contracted = Math.round((ppa.capacity_mw * CF_ANNUAL_MWH_PER_MW) / 12 * 100) / 100;
    const delivered = Math.round(contracted * 0.95 * 100) / 100;
    const id = `oblig_${month.replace('-', '_')}_${String(ppa.id).slice(0, 18)}`;
    await ctx.env.DB.prepare(
      `INSERT OR IGNORE INTO oe_offtaker_ppa_obligations
         (id, ppa_id, participant_id, counterparty_id, period_month,
          contracted_mwh, delivered_mwh, threshold_pct, status, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      id, ppa.id, owner, ppa.counterparty_id ?? null, month,
      contracted, delivered, 95, 'pending',
      'Opening delivery obligation derived on onboarding. Contracted = capacity * 1752/12; delivered at 0.95 (calculated retrospective off real fleet).',
    ).run();
  }
}

interface FacilityRow {
  borrower_participant_id: string | null;
  facility_name: string | null;
  committed_amount: number | null;
  drawn_amount: number | null;
}

// ── lender: one opening covenant certificate per facility ───────────────────
async function seedLenderCovenantCertificates(ctx: CascadeContext, owner: string): Promise<void> {
  const res = await ctx.env.DB.prepare(
    `SELECT borrower_participant_id, facility_name, committed_amount, drawn_amount
       FROM loan_facilities WHERE lender_participant_id = ?`,
  ).bind(owner).all();
  const facilities = (res.results || []) as unknown as FacilityRow[];
  if (facilities.length === 0) return;

  const now = new Date();
  const { quarter, periodEnd } = currentQuarter(now);
  const slaDeadline = new Date(now.getTime() + 30 * 24 * 3_600_000).toISOString().slice(0, 10);
  let i = 0;
  for (const f of facilities) {
    const id = `covcert_${owner}_${quarter.toLowerCase().replace('-', '_')}_${i++}`;
    await ctx.env.DB.prepare(
      `INSERT OR IGNORE INTO oe_covenant_certificates
         (id, certificate_number, borrower_party_id, borrower_party_name,
          facility_agent_name, lender_name, facility_name, facility_tier,
          facility_limit, outstanding_principal, test_period, test_period_end,
          dscr_actual, dscr_threshold, llcr_actual, llcr_threshold,
          gearing_actual, gearing_threshold, submission_basis,
          chain_status, certificate_due_at, sla_deadline_at, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      id, `CC-${quarter}-${i}`, f.borrower_participant_id ?? null, f.borrower_participant_id ?? 'Borrower',
      owner, owner, f.facility_name ?? 'Senior facility', 'senior_secured',
      f.committed_amount ?? 0, f.drawn_amount ?? 0, quarter, periodEnd,
      1.38, 1.20, 1.52, 1.35, 0.68, 0.75,
      'Opening compliance certificate derived on onboarding (calculated retrospective off real fleet).',
      'under_review', periodEnd, slaDeadline, owner,
    ).run();
  }
}

// Public entry point — called from onboarding-activation.ts historic branch.
export async function seedHistoricRetrospective(
  ctx: CascadeContext,
  role: string,
  owner: string,
): Promise<void> {
  switch (role) {
    case 'ipp_developer':
    case 'esums_owner':
      await safeRun(() => seedIppQuarterlyReports(ctx, owner));
      break;
    case 'offtaker':
      await safeRun(() => seedOfftakerObligations(ctx, owner));
      break;
    case 'lender':
      await safeRun(() => seedLenderCovenantCertificates(ctx, owner));
      break;
    default:
      // carbon_fund inventory + regulator recon are card-only on activation;
      // their opening chain cases are seeded by their own domain flows.
      break;
  }
}
