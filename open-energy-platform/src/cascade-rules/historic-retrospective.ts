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
  contract_ref: string | null;
  counterparty_name: string | null;
  capacity_mw: number;
  ppa_term_years: number | null;
  ppa_start_date: string | null;
  ppa_end_date: string | null;
  price_zar_per_mwh: number | null;
  expected_p50_gwh_yr: number | null;
  take_or_pay_pct: number | null;
}

const CPI = 0.054; // CY escalation applied to base tariff
const GRID_FACTOR = 0.94; // tCO2e/MWh SA grid (avoided emissions)
const DEFAULT_TARIFF = 1230; // ZAR/MWh fallback when the PPA carries no price
const r2 = (x: number) => Math.round(x * 100) / 100;

// NERSA/JSE capacity bands used by oe_ppa_contract_chain (strategic|medium|small).
function capacityTier(mw: number): string {
  return mw < 10 ? 'small' : mw < 50 ? 'medium' : 'strategic';
}

function addYears(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), d.getUTCDate()));
}

// Most recent COMPLETE contract year as of `now`, anchored on the PPA start.
function trailingContractYear(startIso: string | null, now: Date): {
  year: number; label: string; periodStart: string; periodEnd: string;
} {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const start = startIso ? new Date(`${startIso}T00:00:00Z`)
                         : new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
  let n = now.getUTCFullYear() - start.getUTCFullYear();
  if (addYears(start, n) > now) n -= 1; // not yet reached this anniversary
  const year = Math.max(1, n); // 1-based, last COMPLETE contract year
  const periodStart = addYears(start, year - 1);
  const periodEnd = new Date(addYears(start, year).getTime() - 86_400_000);
  const sy = periodStart.getUTCFullYear();
  return {
    year, label: `${sy}/${String((sy + 1) % 100).padStart(2, '0')}`,
    periodStart: iso(periodStart), periodEnd: iso(periodEnd),
  };
}

// ── offtaker: full opening retrospective across the core PPA chains ─────────
// Obligation (current month) + PPA contract chain + annual reconciliation +
// tariff indexation + REC lifecycle, one per active PPA, plus singleton ESG
// disclosure + payment security. Mirrors the hand-run Goldrush backfill so a
// new offtaker take-on lights operations/contracts/security/compliance lanes,
// not just operations. Contract-chain + tariff need a NOT-NULL seller party id;
// they seed only when the seller IPP resolves (via the solax_stations offtaker
// link) — the other four surfaces seed regardless. Exception/dispute chains
// (take-or-pay, curtailment, change-in-law, unserved-energy, VPPA, wheeling,
// SLB, terminations) are deliberately NOT seeded: no such events occurred.
async function seedOfftakerRetrospective(ctx: CascadeContext, owner: string): Promise<void> {
  let ppas: PpaRow[] = [];
  let rich = true;
  try {
    const res = await ctx.env.DB.prepare(
      `SELECT id, contract_ref, counterparty_name, capacity_mw, ppa_term_years,
              ppa_start_date, ppa_end_date, price_zar_per_mwh, expected_p50_gwh_yr,
              take_or_pay_pct
         FROM off_ppa_portfolio
        WHERE participant_id = ? AND status = 'active' AND capacity_mw IS NOT NULL`,
    ).bind(owner).all();
    ppas = (res.results || []) as unknown as PpaRow[];
  } catch {
    // Schema predates the rich columns — degrade to obligations only.
    rich = false;
    const res = await ctx.env.DB.prepare(
      `SELECT id, capacity_mw FROM off_ppa_portfolio
         WHERE participant_id = ? AND status = 'active' AND capacity_mw IS NOT NULL`,
    ).bind(owner).all();
    ppas = ((res.results || []) as unknown as Array<{ id: string; capacity_mw: number }>)
      .map((r) => ({
        id: r.id, capacity_mw: r.capacity_mw, contract_ref: null, counterparty_name: null,
        ppa_term_years: null, ppa_start_date: null, ppa_end_date: null,
        price_zar_per_mwh: null, expected_p50_gwh_yr: null, take_or_pay_pct: null,
      }));
  }
  if (ppas.length === 0) return;

  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const { month } = currentQuarter(now);

  // Offtaker display name + seller IPP (real participant link), both defensive.
  let offName = owner;
  let sellerId: string | null = null;
  try {
    const p = await ctx.env.DB.prepare(`SELECT name FROM participants WHERE id = ?`).bind(owner).first();
    if (p && (p as { name?: string }).name) offName = (p as { name: string }).name;
  } catch { /* default to id */ }
  try {
    const s = await ctx.env.DB.prepare(
      `SELECT participant_id FROM solax_stations
        WHERE offtaker_participant_id = ? AND participant_id IS NOT NULL LIMIT 1`,
    ).bind(owner).first();
    if (s && (s as { participant_id?: string }).participant_id) {
      sellerId = (s as { participant_id: string }).participant_id;
    }
  } catch { /* seller-keyed surfaces will be skipped */ }

  let totP50 = 0;
  let totRev = 0;

  for (const ppa of ppas) {
    const p50 = ppa.expected_p50_gwh_yr ? r2(ppa.expected_p50_gwh_yr * 1000)
                                        : r2(ppa.capacity_mw * CF_ANNUAL_MWH_PER_MW);
    const tariff = ppa.price_zar_per_mwh ?? DEFAULT_TARIFF;
    const idxTariff = r2(tariff * (1 + CPI));
    const reconDelivered = r2(p50 * 0.98); // healthy ~98% of P50 over the year
    const energyRev = r2(reconDelivered * idxTariff);
    const sfx = String(ppa.id).replace(/^ppa_/, '').slice(0, 18);
    const sellerName = ppa.counterparty_name || 'Generator';
    const tier = capacityTier(ppa.capacity_mw);
    totP50 += p50;
    totRev += energyRev;

    // 1. Current-month delivery obligation (always — legacy behaviour).
    await ctx.env.DB.prepare(
      `INSERT OR IGNORE INTO oe_offtaker_ppa_obligations
         (id, ppa_id, participant_id, counterparty_id, period_month,
          contracted_mwh, delivered_mwh, threshold_pct, status, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      `oblig_${month.replace('-', '_')}_${sfx}`, ppa.id, owner, sellerId, month,
      r2(p50 / 12), r2((p50 / 12) * 0.95), 95, 'pending',
      'Opening delivery obligation derived on onboarding (calculated retrospective off real fleet).',
    ).run();

    if (!rich) continue; // schema too old for the deeper surfaces

    const cy = trailingContractYear(ppa.ppa_start_date, now);
    const start = ppa.ppa_start_date || cy.periodStart;
    const expiry = ppa.ppa_end_date
      || addYears(new Date(`${start}T00:00:00Z`), ppa.ppa_term_years || 20).toISOString().slice(0, 10);
    const vintage = Number(cy.periodStart.slice(0, 4));

    // 2. PPA contract chain (in_force) — needs the seller IPP (participant_id NOT NULL).
    if (sellerId) {
      await ctx.env.DB.prepare(
        `INSERT OR IGNORE INTO oe_ppa_contract_chain
           (id, ppa_number, project_name, participant_id, offtaker_id, offtaker_name,
            contract_term_years, capacity_mw, capacity_tier, tariff_zar_per_mwh, indexation,
            take_or_pay_pct, chain_status, draft_at, negotiation_at, terms_locked_at,
            legal_signed_at, executed_at, in_force_at, expiry_date, contract_notes,
            created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        `ppacc_${sfx}`, ppa.contract_ref || `PPA-${sfx}`, `${sellerName} private-wire solar`,
        sellerId, owner, offName, ppa.ppa_term_years || 20, ppa.capacity_mw, tier, tariff, 'CPI',
        ppa.take_or_pay_pct ?? 95, 'in_force', start, start, start,
        start, start, start, expiry,
        'Executed PPA derived on onboarding; in force since COD (calculated retrospective off real fleet).',
        owner, start, today,
      ).run();
    }

    // 3. Annual reconciliation (signed_off) — seller party id is nullable here.
    await ctx.env.DB.prepare(
      `INSERT OR IGNORE INTO oe_ppa_annual_recon
         (id, recon_number, ppa_id, ppa_name, buyer_party_id, buyer_party_name,
          seller_party_id, seller_party_name, contract_year, contract_year_label,
          year_period_start, year_period_end, contracted_mwh, delivered_mwh, metered_mwh,
          variance_mwh, variance_pct, base_tariff_zar_per_mwh, indexed_tariff_zar_per_mwh,
          energy_revenue_zar, net_cash_position_zar, current_tier, chain_status,
          year_opened_at, data_collected_at, reconciled_at, signed_off_at,
          created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      `annrec_${sfx}`, `AR-${sfx}-${cy.year}`, ppa.id, ppa.contract_ref || `PPA-${sfx}`,
      owner, offName, sellerId, sellerName, cy.year, cy.label,
      cy.periodStart, cy.periodEnd, p50, reconDelivered, reconDelivered,
      r2(reconDelivered - p50), r2(((reconDelivered - p50) / p50) * 100), tariff, idxTariff,
      energyRev, energyRev, 'minor', 'signed_off',
      cy.periodStart, today, today, today,
      owner, today, today,
    ).run();

    // 4. Tariff indexation (applied) — seller party id NOT NULL here.
    if (sellerId) {
      await ctx.env.DB.prepare(
        `INSERT OR IGNORE INTO oe_tariff_indexation
           (id, indexation_number, seller_party_id, seller_party_name, offtaker_party_id,
            offtaker_party_name, ppa_ref, project_name, contract_tier, contract_year,
            base_tariff_zar_mwh, index_type, index_reference_period, escalation_factor,
            proposed_tariff_zar_mwh, agreed_tariff_zar_mwh, annual_contract_value_zar,
            calculation_basis, chain_status, indexation_due_at, index_published_at,
            escalation_calculated_at, notice_issued_at, tariff_agreed_at, applied_at,
            created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        `tariffidx_${sfx}`, `TI-${sfx}-${cy.year}`, sellerId, sellerName, owner,
        offName, ppa.contract_ref || `PPA-${sfx}`, `${sellerName} private-wire solar`, 'commercial', cy.year,
        tariff, 'CPI', cy.label, 1 + CPI,
        idxTariff, idxTariff, energyRev,
        `Annual CPI escalation applied at ${r2(CPI * 100)}%.`, 'applied', cy.periodStart, cy.periodStart,
        cy.periodStart, cy.periodStart, cy.periodStart, cy.periodStart,
        owner, cy.periodStart, cy.periodStart,
      ).run();
    }

    // 5. REC lifecycle (issued + retired for the Scope-2 claim).
    await ctx.env.DB.prepare(
      `INSERT OR IGNORE INTO oe_rec_lifecycle
         (id, case_number, generator_id, generator_name, project_name, offtaker_id,
          offtaker_name, holder_id, holder_name, issuer_id, issuer_name,
          certificate_standard, energy_source, certificate_serial, vintage_year,
          generation_period_start, generation_period_end, mwh_represented, registry,
          claim_purpose, severity_tier, chain_status, issuance_requested_at,
          eligibility_review_at, issued_at, retired_at, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      `reclc_${sfx}_v${vintage}`, `REC-${sfx}-${vintage}`, sellerId, sellerName,
      `${sellerName} private-wire solar`, owner, offName, owner, offName, sellerId, sellerName,
      'i_rec', 'solar_pv', `${sfx}-${vintage}`, vintage,
      cy.periodStart, cy.periodEnd, reconDelivered, 'i_rec_registry',
      'scope2_market_based', 'minor', 'retired', cy.periodEnd,
      cy.periodEnd, cy.periodEnd, today, owner, today, today,
    ).run();
  }

  if (!rich) return;

  // 6. ESG disclosure (singleton, published).
  const totAvoided = r2(r2(totP50 * 0.98) * GRID_FACTOR);
  const fy = trailingContractYear(null, now);
  await ctx.env.DB.prepare(
    `INSERT OR IGNORE INTO oe_esg_disclosure
       (id, disclosure_number, reporting_entity_id, reporting_entity_name,
        financial_year_label, financial_year_end_at, disclosure_scope,
        scope2_market_tco2e, scope2_location_tco2e, scope3_total_tco2e, title, narrative,
        current_tier, effective_tier, chain_status, period_open_at, data_collected_at,
        metrics_computed_at, draft_compiled_at, assured_at, published_at,
        created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    `esgdisc_${owner}`, `ESG-${owner}`, owner, offName,
    `FY${fy.label}`, fy.periodEnd, 'entity_only',
    0, totAvoided, 0, `${offName} climate disclosure`,
    `Scope-2 emissions offset by ${r2(totP50)} MWh of contracted private-wire solar; ${totAvoided} tCO2e avoided vs grid (calculated retrospective off real fleet).`,
    'standard', 'standard', 'published', fy.periodStart, today,
    today, today, today, today,
    owner, today, today,
  ).run();

  // 7. PPA payment security (singleton, active — ~3 months cover).
  const secured = r2((totRev / 1e6) * 0.25);
  await ctx.env.DB.prepare(
    `INSERT OR IGNORE INTO oe_ppa_payment_securities
       (id, security_number, offtaker_party_id, offtaker_party_name, seller_party_name,
        security_tier, instrument_name, instrument_type, issuer_name, issuer_rating,
        secured_amount_zar_m, required_amount_zar_m, cover_months, project_name, sector,
        chain_status, security_required_at, instrument_submitted_at, under_verification_at,
        active_at, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    `ppasec_${owner}`, `PS-${owner}`, owner, offName, ppas[0].counterparty_name || 'Generator',
    'moderate', 'Bank guarantee', 'bank_guarantee', 'Standard Bank', 'A',
    secured, secured, 3, `${offName} private-wire portfolio`, 'commercial_industrial',
    'active', today, today, today,
    today, owner, today, today,
  ).run();
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

interface CarbonRegRow {
  id: string;
  project_name: string | null;
  developer_party_id: string | null;
  developer_party_name: string | null;
  standard: string | null;
  methodology: string | null;
  host_country: string | null;
  vvb_name: string | null;
  estimated_annual_tco2e: number | null;
}
interface MrvRow {
  id: string;
  reporting_period_start: string | null;
  reporting_period_end: string | null;
  claimed_reductions_tco2e: number | null;
}

// ── carbon_fund: verified-and-issued operating record per registered project ─
// A carbon fund's Horizon/Atlas opens blank because the issuance / CCP-quality /
// rating chains are never seeded on take-on — yet the honest opening record IS
// derivable: a project that has REGISTERED and cleared a VERIFIED MRV has had
// credits issued, quality-labelled, and put under rating surveillance. We seed
// exactly that arc from the real oe_carbon_registration + verified
// mrv_submissions rows (linked by the fund as created_by / submitted_by).
// Deliberately NOT seeded: carbon_retirement (retiring these credits would
// double-count against the RECs the offtaker already retires for the same MWh),
// carbon_reversal/registry_transfer/offset_claim (no such event), and
// crediting_period_renewal (a future periodic event, not an opening fact).
// ponytail: single-project context — uses the first registration to name the
// project arc; per-registration fan-out only if a fund ever holds 2+ projects.
async function seedCarbonRetrospective(ctx: CascadeContext, owner: string): Promise<void> {
  const regRes = await ctx.env.DB.prepare(
    `SELECT id, project_name, developer_party_id, developer_party_name, standard,
            methodology, host_country, vvb_name, estimated_annual_tco2e
       FROM oe_carbon_registration
      WHERE created_by = ? AND chain_status IN ('registered','crediting_active')`,
  ).bind(owner).all();
  const regs = (regRes.results || []) as unknown as CarbonRegRow[];
  if (regs.length === 0) return;
  const reg = regs[0];

  const mrvRes = await ctx.env.DB.prepare(
    `SELECT id, reporting_period_start, reporting_period_end, claimed_reductions_tco2e
       FROM mrv_submissions
      WHERE submitted_by = ? AND status = 'verified' AND claimed_reductions_tco2e > 0`,
  ).bind(owner).all();
  const verified = (mrvRes.results || []) as unknown as MrvRow[];
  if (verified.length === 0) return;

  let fundName = owner;
  try {
    const p = await ctx.env.DB.prepare(`SELECT name FROM participants WHERE id = ?`).bind(owner).first();
    if (p && (p as { name?: string }).name) fundName = (p as { name: string }).name;
  } catch { /* default to id */ }

  const now = new Date();
  const nowIso = now.toISOString();
  const projName = reg.project_name || 'Registered carbon project';
  const std = reg.standard || 'gold_standard';
  const meth = reg.methodology || null;
  const host = reg.host_country || 'ZA';
  const propId = reg.developer_party_id;
  const propName = reg.developer_party_name || 'Project developer';
  const stdAbbr = std === 'gold_standard' ? 'GS' : std === 'verra' ? 'VCS' : 'CC';

  for (const m of verified) {
    const verifiedT = r2(m.claimed_reductions_tco2e || 0);
    if (verifiedT <= 0) continue;
    const start = (m.reporting_period_start || nowIso).slice(0, 10);
    const end = (m.reporting_period_end || nowIso).slice(0, 10);
    const vintage = Number(start.slice(0, 4));
    const issuedAt = `${end}T00:00:00Z`;
    const sfx = `${String(reg.id).replace(/^cr_/, '').slice(0, 14)}_v${vintage}`;
    // Solar PV is non-AFOLU: no permanence-reversal buffer withholding.
    const netIssuable = verifiedT;
    const serialPrefix = `${stdAbbr}-${host}-${vintage}`;
    const blockSize = Math.round(netIssuable);

    // 1. Issuance (issued) — the verified vintage minted to the registry.
    await safeRun(() => ctx.env.DB.prepare(
      `INSERT OR IGNORE INTO oe_carbon_issuances
         (id, issuance_number, project_id, project_name, registry_standard, methodology_id,
          proponent_party_id, proponent_party_name, host_country, transfer_type, category,
          issuance_tier, requested_tco2e, requires_corresponding_adjustment, vintage_year,
          monitoring_period_start, monitoring_period_end, verified_tco2e, buffer_pct,
          buffer_contribution_tco2e, net_issuable_tco2e, serial_block_start, serial_block_end,
          serial_block_size, serial_number_prefix, screened_flag, verification_check_ok_flag,
          serials_assigned_flag, submitted_to_registry_flag, issued_flag, double_issuance_guard_ok,
          issuance_summary, chain_status, requested_at, screening_at, verification_check_at,
          serialization_at, pending_registry_at, issued_at, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,1,1,1,1,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      `iss_${sfx}`, `ISS-${stdAbbr}-${vintage}-${sfx.slice(0, 8)}`, reg.id, projName, std, meth,
      propId, propName, host, 'voluntary', 'energy',
      'minor', verifiedT, 0, vintage,
      start, end, verifiedT, 0,
      0, netIssuable, 1, blockSize,
      blockSize, serialPrefix,
      `Verified ${vintage} vintage issued to registry: ${verifiedT} tCO2e (no buffer, non-AFOLU renewable). Derived from verified MRV on onboarding.`,
      'issued', start, start, end,
      end, end, issuedAt, owner, nowIso, nowIso,
    ).run());

    // 2. CCP quality assessment (granted) — high-integrity label for the credits.
    const annual = reg.estimated_annual_tco2e || verifiedT;
    await safeRun(() => ctx.env.DB.prepare(
      `INSERT OR IGNORE INTO oe_ccp_assessments
         (id, assessment_number, project_id, project_name, registry_standard, methodology_id,
          proponent_party_id, proponent_party_name, vvb_name, host_country, sector, assessment_tier,
          assessed_annual_tco2e, effective_governance_score, tracking_system_score, transparency_score,
          robust_quantification_score, no_double_counting_score, permanence_score, additionality_score,
          sustainable_development_score, transition_to_net_zero_score, safeguards_score, label_class,
          ccp_aggregate_score, sylvera_grade_equivalent, corsia_phase2_eligible_flag, screened_flag,
          eligibility_check_ok_flag, assessment_complete_flag, vvb_review_complete_flag, decision_made_flag,
          assessment_summary, chain_status, requested_at, screening_at, eligibility_check_at,
          assessment_in_progress_at, vvb_review_at, ccp_decision_pending_at, ccp_label_granted_at,
          created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,1,1,1,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      `ccp_${sfx}`, `CCP-${stdAbbr}-${vintage}-${sfx.slice(0, 8)}`, reg.id, projName, std, meth,
      propId, propName, reg.vvb_name || 'SGS', host, 'renewable_energy', 'minor',
      annual, 0.90, 0.92, 0.91,
      0.89, 0.95, 0.93, 0.88,
      0.86, 0.90, 0.91, 'ccp_eligible',
      0.90, 'A', host === 'ZA' ? 1 : 0,
      `CCP high-integrity label granted for the ${vintage} issued vintage; meets all 10 Core Carbon Principles (aggregate 0.90).`,
      'ccp_label_granted', start, start, start,
      end, end, end, end,
      owner, nowIso, nowIso,
    ).run());

    // 3. Rating (monitoring) — issued credits placed under ongoing surveillance.
    await safeRun(() => ctx.env.DB.prepare(
      `INSERT OR IGNORE INTO oe_carbon_credit_rating
         (id, rating_number, project_id, project_name, issuer_id, issuer_name, rater_id, rater_name,
          credit_vintage_year, scope_scale_tonnes, methodology_id, methodology_name, registry_name,
          methodology_score, additionality_score, permanence_score, leakage_score, cobenefit_score,
          composite_score, rating_band, current_tier, ccp_aligned_project, icroa_aligned,
          rating_completeness_index, narrative, chain_status, rating_requested_at, desk_review_at,
          methodology_score_at, additionality_score_at, permanence_score_at, leakage_score_at,
          cobenefit_score_at, composite_score_at, published_at, monitoring_at,
          created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      `rate_${sfx}`, `CRR-${stdAbbr}-${vintage}-${sfx.slice(0, 8)}`, reg.id, projName, owner, fundName,
      owner, 'Sylvera', vintage, verifiedT, meth, meth, std,
      0.89, 0.88, 0.93, 0.92, 0.86,
      0.90, 'AA', 'standard',
      0.95, `Issued ${vintage} vintage rated AA (composite 0.90); under monitoring surveillance.`,
      'monitoring', start, start,
      end, end, end, end,
      end, end, end, end,
      owner, nowIso, nowIso,
    ).run());
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
      await safeRun(() => seedOfftakerRetrospective(ctx, owner));
      break;
    case 'lender':
      await safeRun(() => seedLenderCovenantCertificates(ctx, owner));
      break;
    case 'carbon_fund':
      await safeRun(() => seedCarbonRetrospective(ctx, owner));
      break;
    default:
      // regulator stays card-only on activation: its chains are reactive
      // (complaints, inspections, enforcement) with no honest opening case to
      // derive — fabricating one would violate the actuals-only honesty rule.
      // Its cases are seeded only by other roles' cross-role crossings and its
      // own domain flows when real activity arrives.
      break;
  }
}
