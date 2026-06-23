// Generic onboarding ACTIVATION cascade. On onboarding.completed the rule fans
// out across every source-role × counterparty combination, gated on the
// new/historic take-on choice. 'historic' lights every counterparty's
// IncomingPanel (oe_role_action_queue); 'new' just welcomes the owner. This is
// the generalisation of esums-activation.ts (which only handled the esums
// materialize moment) so the Goldrush-class dead-arm failure cannot recur for
// any archetype that joins with existing history.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import type { CascadeContext } from '../src/utils/cascade';
import { registerOnboardingActivationRules } from '../src/cascade-rules/onboarding-activation';
import { runCascadeRegistry, _resetRegistryForTests } from '../src/utils/cascade-registry';

let db: Database.Database; let env: any;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  // carbon_/lender_participant_id were force-applied out-of-band; add them here
  // to mirror prod (offtaker_participant_id lands in-band via migration 434).
  for (const col of ['carbon_participant_id', 'lender_participant_id', 'offtaker_participant_id']) {
    try { db.exec(`ALTER TABLE solax_stations ADD COLUMN ${col} TEXT`); } catch { /* present */ }
  }
  _resetRegistryForTests();
  registerOnboardingActivationRules();
});
afterEach(() => db.close());

function ctx(role: string, owner: string, mode: string): CascadeContext {
  return {
    event: 'onboarding.completed', entity_type: 'participant', entity_id: owner,
    data: { role, take_on_mode: mode }, env,
  } as unknown as CascadeContext;
}
function cards(owner: string) {
  return db.prepare(
    `SELECT target_role, target_participant_id, title, source_chain_key, cross_option_json
       FROM oe_role_action_queue WHERE source_entity_id = ?`,
  ).all(owner) as any[];
}
function byRole(rows: any[]) {
  const m: Record<string, any[]> = {};
  for (const r of rows) (m[r.target_role] ||= []).push(r);
  return m;
}
function station(id: string, owner: string, off: string | null, carbon: string | null, lender: string | null) {
  db.prepare(
    `INSERT INTO solax_stations
       (id, participant_id, plant_id, device_sn, created_at, updated_at,
        offtaker_participant_id, carbon_participant_id, lender_participant_id)
     VALUES (?, ?, 'p1', ?, '2026-01-01', '2026-01-01', ?, ?, ?)`,
  ).run(id, owner, `sn_${id}`, off, carbon, lender);
}

describe('onboarding-activation cascade rules', () => {
  it('NEW mode: one owner welcome card, no fan-out', async () => {
    station('s1', 'ipp1', 'off1', 'carbon1', 'lend1'); // history present but mode=new ignores it
    await runCascadeRegistry(ctx('ipp_developer', 'ipp1', 'new'));
    const rows = cards('ipp1');
    expect(rows).toHaveLength(1);
    expect(rows[0].target_role).toBe('ipp_developer');
    expect(rows[0].target_participant_id).toBe('ipp1');
    expect(rows[0].title).toContain('Welcome');
    expect(JSON.parse(rows[0].cross_option_json).target_route).toBe('/horizon');
  });

  it('HISTORIC ipp_developer with all links: 3 counterparty cards + owner summary, no remediation', async () => {
    station('s2', 'ipp2', 'off2', 'carbon2', 'lend2');
    await runCascadeRegistry(ctx('ipp_developer', 'ipp2', 'historic'));
    const m = byRole(cards('ipp2'));
    expect(m.offtaker?.[0].target_participant_id).toBe('off2');
    expect(m.carbon_fund?.[0].target_participant_id).toBe('carbon2');
    expect(m.lender?.[0].target_participant_id).toBe('lend2');
    expect(m.ipp_developer).toHaveLength(1); // owner summary only, no remediation
    expect(m.ipp_developer[0].title).toContain('Historic fleet onboarded');
  });

  it('HISTORIC ipp_developer with missing links: remediation card names the gaps', async () => {
    station('s3', 'ipp3', 'off3', null, null); // carbon + lender NULL — the Goldrush bug shape
    await runCascadeRegistry(ctx('ipp_developer', 'ipp3', 'historic'));
    const m = byRole(cards('ipp3'));
    expect(m.offtaker).toHaveLength(1);
    expect(m.carbon_fund).toBeUndefined();
    expect(m.lender).toBeUndefined();
    // owner summary + remediation
    expect(m.ipp_developer).toHaveLength(2);
    const remediation = m.ipp_developer.find((r) => r.title.startsWith('Action needed'));
    expect(remediation).toBeTruthy();
    expect(remediation.title).toContain('carbon buyer');
    expect(remediation.title).toContain('lender');
    expect(remediation.title).not.toContain('offtaker');
  });

  it('HISTORIC esums_owner generation fleet routes owner card to the support queue', async () => {
    station('s4', 'esco_gen', 'off4', null, null);
    await runCascadeRegistry(ctx('esums_owner', 'esco_gen', 'historic'));
    const m = byRole(cards('esco_gen'));
    expect(m.offtaker?.[0].target_participant_id).toBe('off4');
    // esums_owner is not a platform role → owner cards land on 'support'
    expect(m.support).toBeTruthy();
    expect(m.esums_owner).toBeUndefined();
  });

  it('HISTORIC esums_owner as O&M contractor pushes a card to each distinct site owner', async () => {
    db.prepare(
      `INSERT INTO om_sites (id, name, participant_id, om_contractor_id, status, created_at)
       VALUES ('site1', 'Site A', 'owner_a', 'esco1', 'operational', datetime('now'))`,
    ).run();
    db.prepare(
      `INSERT INTO om_sites (id, name, participant_id, om_contractor_id, status, created_at)
       VALUES ('site2', 'Site B', 'owner_b', 'esco1', 'operational', datetime('now'))`,
    ).run();
    await runCascadeRegistry(ctx('esums_owner', 'esco1', 'historic'));
    const m = byRole(cards('esco1'));
    const owners = (m.ipp_developer || []).map((r) => r.target_participant_id).sort();
    expect(owners).toEqual(['owner_a', 'owner_b']);
    expect(m.support).toBeTruthy(); // owner O&M-portfolio summary
  });

  it('HISTORIC lender pushes a card to each borrower + owner loan-book summary', async () => {
    db.prepare(
      `INSERT INTO loan_facilities (id, facility_name, lender_participant_id, borrower_participant_id, status)
       VALUES ('fac1', 'Senior Debt A', 'lender1', 'borrower1', 'active')`,
    ).run();
    await runCascadeRegistry(ctx('lender', 'lender1', 'historic'));
    const m = byRole(cards('lender1'));
    expect(m.ipp_developer?.[0].target_participant_id).toBe('borrower1');
    expect(m.ipp_developer[0].title).toContain('Senior Debt A');
    expect(m.lender?.[0].title).toContain('Loan book onboarded');
  });

  it('HISTORIC carbon_fund: regulator recon card + owner inventory card', async () => {
    db.prepare(
      `INSERT INTO carbon_holdings (id, participant_id, project_id, credit_type, quantity, vintage_year, status)
       VALUES ('ch1', 'carbonfund1', 'proj1', 'VCS', 1000, 2024, 'available')`,
    ).run();
    await runCascadeRegistry(ctx('carbon_fund', 'carbonfund1', 'historic'));
    const m = byRole(cards('carbonfund1'));
    expect(m.regulator?.[0].title).toContain('registry reconciliation');
    expect(m.carbon_fund?.[0].title).toContain('Carbon inventory onboarded');
  });

  it('HISTORIC offtaker: owner portfolio summary', async () => {
    db.prepare(
      `INSERT INTO off_ppa_portfolio (id, participant_id, counterparty_name, status, created_at)
       VALUES ('pp1', 'offtaker1', 'Generator X', 'active', datetime('now'))`,
    ).run();
    await runCascadeRegistry(ctx('offtaker', 'offtaker1', 'historic'));
    const m = byRole(cards('offtaker1'));
    expect(m.offtaker?.[0].title).toContain('Offtake portfolio onboarded');
  });

  it('HISTORIC trader: owner trading-desk card', async () => {
    await runCascadeRegistry(ctx('trader', 'trader1', 'historic'));
    const m = byRole(cards('trader1'));
    expect(m.trader?.[0].title).toContain('Trading desk active');
  });

  it('HISTORIC oversight role (grid_operator) falls back to a workspace-activated card', async () => {
    await runCascadeRegistry(ctx('grid_operator', 'grid1', 'historic'));
    const rows = cards('grid1');
    expect(rows).toHaveLength(1);
    expect(rows[0].target_role).toBe('grid_operator');
    expect(rows[0].title).toContain('Workspace activated');
  });

  it('does nothing without role or owner', async () => {
    await runCascadeRegistry({
      event: 'onboarding.completed', entity_type: 'participant', entity_id: '',
      data: { role: 'ipp_developer', take_on_mode: 'historic' }, env,
    } as unknown as CascadeContext);
    await runCascadeRegistry({
      event: 'onboarding.completed', entity_type: 'participant', entity_id: 'x',
      data: { take_on_mode: 'historic' }, env,
    } as unknown as CascadeContext);
    expect((db.prepare(`SELECT COUNT(*) n FROM oe_role_action_queue`).get() as any).n).toBe(0);
  });

  it('dedups on re-fire (idempotent onboarding replay)', async () => {
    station('s5', 'ipp5', 'off5', 'carbon5', 'lend5');
    const c = ctx('ipp_developer', 'ipp5', 'historic');
    await runCascadeRegistry(c);
    await runCascadeRegistry(c);
    const rows = cards('ipp5');
    // offtaker + carbon + lender + owner summary = 4, no duplicates
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.target_role === 'offtaker')).toHaveLength(1);
  });

  it('defaults to NEW when take_on_mode is absent', async () => {
    station('s6', 'ipp6', 'off6', 'carbon6', 'lend6');
    await runCascadeRegistry({
      event: 'onboarding.completed', entity_type: 'participant', entity_id: 'ipp6',
      data: { role: 'ipp_developer' }, env,
    } as unknown as CascadeContext);
    const rows = cards('ipp6');
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toContain('Welcome');
  });
});

// Historic-retrospective seeding (src/cascade-rules/historic-retrospective.ts) is
// wired into the historic branch of the activation rule. Horizon is chain-case
// -driven, so the opening case per role must exist after a historic onboard or
// the role lands on an empty workspace. These assert the chain row, not the card.
describe('historic-retrospective opening chain case', () => {
  function ippProject(id: string, developer: string, mw: number) {
    db.prepare(
      `INSERT INTO ipp_projects (id, project_name, developer_id, structure_type,
         technology, capacity_mw, location)
       VALUES (?, ?, ?, 'private_wire', 'solar', ?, 'Northern Cape')`,
    ).run(id, `Project ${id}`, developer, mw);
  }

  it('ipp_developer historic seeds one quarterly gen report per project', async () => {
    ippProject('proj_a', 'ipp_h1', 5);
    ippProject('proj_b', 'ipp_h1', 3);
    await runCascadeRegistry(ctx('ipp_developer', 'ipp_h1', 'historic'));
    const rows = db.prepare(
      `SELECT project_id, mwh_contracted, mwh_actual, chain_status
         FROM oe_ipp_quarterly_gen_reports WHERE participant_id = ?`,
    ).all('ipp_h1') as any[];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.chain_status === 'report_quarter_opened')).toBe(true);
    const a = rows.find((r) => r.project_id === 'proj_a');
    expect(a.mwh_contracted).toBeCloseTo(5 * 1752 / 4, 1); // capacity * 1752 / 4
    expect(a.mwh_actual).toBeCloseTo(5 * 1752 / 4 * 0.93, 1);
  });

  // Seeds an offtaker take-on: identity, an active rich PPA, and the
  // solax_stations link that resolves the seller IPP (mirrors live).
  function offtakerTakeon(owner: string, seller: string) {
    db.prepare(
      `INSERT INTO participants (id, email, password_hash, name, role)
       VALUES (?, ?, 'x', 'Goldrush Operations', 'offtaker')`,
    ).run(owner, `${owner}@t.co`);
    db.prepare(
      `INSERT INTO participants (id, email, password_hash, name, role)
       VALUES (?, ?, 'x', 'GoNXT Project Office', 'ipp_developer')`,
    ).run(seller, `${seller}@t.co`);
    db.prepare(
      `INSERT INTO off_ppa_portfolio (id, participant_id, counterparty_name,
         capacity_mw, status, contract_ref, ppa_term_years, ppa_start_date,
         price_zar_per_mwh, expected_p50_gwh_yr, take_or_pay_pct, created_at)
       VALUES ('ppa_h', ?, 'GoNXT Energy', 4, 'active', 'PPA-TEST', 20,
         '2024-03-01', 1000, 7.008, 95, datetime('now'))`,
    ).run(owner);
    db.prepare(
      `INSERT INTO solax_stations (id, participant_id, plant_id, device_sn,
         offtaker_participant_id, created_at, updated_at)
       VALUES ('stn_h', ?, 'PL1', 'SN1', ?, datetime('now'), datetime('now'))`,
    ).run(seller, owner);
  }

  it('offtaker historic seeds the full opening retrospective across the PPA chains', async () => {
    offtakerTakeon('off_h1', 'gonxt_h1');
    await runCascadeRegistry(ctx('offtaker', 'off_h1', 'historic'));

    // 1. current-month delivery obligation (p50 7008 MWh / 12)
    const oblig = db.prepare(
      `SELECT contracted_mwh, status FROM oe_offtaker_ppa_obligations WHERE participant_id = ?`,
    ).all('off_h1') as any[];
    expect(oblig).toHaveLength(1);
    expect(oblig[0].status).toBe('pending');
    expect(oblig[0].contracted_mwh).toBeCloseTo(7008 / 12, 1);

    // 2. contract chain (in_force) — seller resolved via solax_stations
    const cc = db.prepare(
      `SELECT participant_id, offtaker_id, chain_status FROM oe_ppa_contract_chain WHERE offtaker_id = ?`,
    ).all('off_h1') as any[];
    expect(cc).toHaveLength(1);
    expect(cc[0].participant_id).toBe('gonxt_h1');
    expect(cc[0].chain_status).toBe('in_force');

    // 3. annual reconciliation (signed_off), delivered ~98% of P50
    const ar = db.prepare(
      `SELECT delivered_mwh, chain_status FROM oe_ppa_annual_recon WHERE buyer_party_id = ?`,
    ).all('off_h1') as any[];
    expect(ar).toHaveLength(1);
    expect(ar[0].chain_status).toBe('signed_off');
    expect(ar[0].delivered_mwh).toBeCloseTo(7008 * 0.98, 1);

    // 4. tariff indexation (applied), CPI-escalated tariff 1000 -> 1054
    const ti = db.prepare(
      `SELECT agreed_tariff_zar_mwh, chain_status FROM oe_tariff_indexation WHERE offtaker_party_id = ?`,
    ).all('off_h1') as any[];
    expect(ti).toHaveLength(1);
    expect(ti[0].chain_status).toBe('applied');
    expect(ti[0].agreed_tariff_zar_mwh).toBeCloseTo(1054, 1);

    // 5. REC lifecycle (retired for the Scope-2 claim)
    const rec = db.prepare(
      `SELECT chain_status FROM oe_rec_lifecycle WHERE offtaker_id = ?`,
    ).all('off_h1') as any[];
    expect(rec).toHaveLength(1);
    expect(rec[0].chain_status).toBe('retired');

    // 6a. ESG disclosure singleton (published)
    const esg = db.prepare(
      `SELECT chain_status FROM oe_esg_disclosure WHERE reporting_entity_id = ?`,
    ).all('off_h1') as any[];
    expect(esg).toHaveLength(1);
    expect(esg[0].chain_status).toBe('published');

    // 6b. payment security singleton (active)
    const sec = db.prepare(
      `SELECT chain_status FROM oe_ppa_payment_securities WHERE offtaker_party_id = ?`,
    ).all('off_h1') as any[];
    expect(sec).toHaveLength(1);
    expect(sec[0].chain_status).toBe('active');
  });

  it('offtaker historic is idempotent on re-fire (no duplicate surfaces)', async () => {
    offtakerTakeon('off_idem', 'gonxt_idem');
    const c = ctx('offtaker', 'off_idem', 'historic');
    await runCascadeRegistry(c);
    await runCascadeRegistry(c);
    const n = (db.prepare(
      `SELECT COUNT(*) n FROM oe_ppa_contract_chain WHERE offtaker_id = ?`,
    ).get('off_idem') as any).n;
    expect(n).toBe(1);
  });

  it('lender historic seeds an under-review covenant certificate per facility', async () => {
    db.prepare(
      `INSERT INTO loan_facilities (id, facility_name, lender_participant_id,
         borrower_participant_id, committed_amount, drawn_amount, status)
       VALUES ('fac_h', 'Senior Facility', 'lend_h1', 'borrower_h', 18000000, 14200000, 'active')`,
    ).run();
    await runCascadeRegistry(ctx('lender', 'lend_h1', 'historic'));
    const rows = db.prepare(
      `SELECT facility_name, chain_status FROM oe_covenant_certificates WHERE created_by = ?`,
    ).all('lend_h1') as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].chain_status).toBe('under_review');
    expect(rows[0].facility_name).toBe('Senior Facility');
  });

  it('NEW mode seeds no opening chain case', async () => {
    ippProject('proj_new', 'ipp_new', 5);
    await runCascadeRegistry(ctx('ipp_developer', 'ipp_new', 'new'));
    const n = (db.prepare(
      `SELECT COUNT(*) n FROM oe_ipp_quarterly_gen_reports WHERE participant_id = ?`,
    ).get('ipp_new') as any).n;
    expect(n).toBe(0);
  });

  it('idempotent on historic re-fire (no duplicate chain case)', async () => {
    ippProject('proj_idem', 'ipp_idem', 5);
    const c = ctx('ipp_developer', 'ipp_idem', 'historic');
    await runCascadeRegistry(c);
    await runCascadeRegistry(c);
    const n = (db.prepare(
      `SELECT COUNT(*) n FROM oe_ipp_quarterly_gen_reports WHERE participant_id = ?`,
    ).get('ipp_idem') as any).n;
    expect(n).toBe(1);
  });
});
