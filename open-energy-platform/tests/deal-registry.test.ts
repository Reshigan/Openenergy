import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import {
  getDealDescriptor,
  registerDeal,
  registerDealDescriptors,
  validateFields,
  valueSweeteners,
  parseTermSheet,
  type DealDescriptor,
  type OfferRow,
  type SweetenerSpec,
} from '../src/utils/deal-registry';
import { scoreEnergyOption } from '../src/utils/offtaker-options';

// The registry self-registers built-ins on import; this is idempotent.
registerDealDescriptors();

function offer(partial: Partial<OfferRow> & Pick<OfferRow, 'id' | 'term_sheet'>): OfferRow {
  return {
    deal_type: 'energy_supply',
    provider_id: 'prov1',
    provider_role: 'ipp_developer',
    tenant_id: 't1',
    title: 'Test offer',
    request_id: null,
    status: 'published',
    ...partial,
  } as OfferRow;
}

describe('deal registry lookup', () => {
  it('returns the energy_supply descriptor on hit', () => {
    const d = getDealDescriptor('energy_supply');
    expect(d).not.toBeNull();
    expect(d!.kind).toBe('marketplace');
    expect(d!.demand_roles).toContain('offtaker');
    expect(d!.accept_dispatch.live.chain_key).toBe('ppa_contract');
  });

  it('returns null (404 at route layer) on unknown deal_type', () => {
    expect(getDealDescriptor('does_not_exist')).toBeNull();
    // a request-derived string can never be coerced into a descriptor
    expect(getDealDescriptor("energy_supply'; DROP TABLE oe_deal_offers;--")).toBeNull();
  });
});

describe('validateFields', () => {
  const d = getDealDescriptor('energy_supply')!;

  it('passes a complete need profile', () => {
    expect(validateFields(d.need_schema, { annual_kwh: 1_000_000, avg_tariff_zar_per_kwh: 2.1 })).toEqual([]);
  });

  it('flags missing required fields', () => {
    const errs = validateFields(d.need_schema, {});
    expect(errs).toHaveLength(2);
    expect(errs.join(' ')).toContain('required');
  });

  it('flags wrong types and bad enum values', () => {
    const errs = validateFields(d.term_sheet_schema, {
      offered_annual_mwh: 'lots',
      availability: 'someday',
    });
    expect(errs.some(e => e.includes('Annual energy'))).toBe(true);
    expect(errs.some(e => e.includes('Availability'))).toBe(true);
  });
});

describe('energy_supply scorer delegates to scoreEnergyOption (no divergence)', () => {
  it('produces the same numbers as the live offtaker scorer', () => {
    const d = getDealDescriptor('energy_supply')!;
    const need = { annual_kwh: 10_000_000, avg_tariff_zar_per_kwh: 2.0 };
    const o = offer({
      id: 'off1',
      title: 'Karoo Solar',
      provider_id: 'dev1',
      term_sheet: JSON.stringify({ offered_annual_mwh: 5000, blended_price_zar_per_mwh: 1200, availability: 'upcoming' }),
    });

    const scored = d.scorer(need, o);
    const reference = scoreEnergyOption({
      option_id: 'off1',
      kind: 'project',
      title: 'Karoo Solar',
      target_participant_id: 'dev1',
      availability: 'upcoming',
      cod_estimate: null,
      offered_annual_mwh: 5000,
      price_basis: 'indicative',
      blended_price: 1200,
    }, need);

    expect(scored.primary_metric).toBe(reference.blended_price_zar_per_mwh);
    expect(scored.est_value_zar).toBe(reference.est_saving_zar);
    expect(scored.secondary.annual_mwh).toBe(reference.annual_mwh);
    expect(scored.secondary.co2_avoided_tco2e).toBe(reference.co2_avoided_tco2e);
    expect(scored.rationale).toBe(reference.rationale);
    expect(scored.sweetener_value_zar).toBe(0);
  });
});

describe('valueSweeteners', () => {
  const need = { tenor_months: 240 };
  const env = {} as any;

  function descWithSweetener(spec: SweetenerSpec): DealDescriptor {
    const base = getDealDescriptor('energy_supply')!;
    return { ...base, deal_type: 'sweet_test', sweetener_schema: [spec] };
  }

  it('returns 0 when the descriptor declares no sweeteners', async () => {
    const base = getDealDescriptor('energy_supply')!;
    const r = await valueSweeteners(base, offer({ id: 'o', term_sheet: '{}' }), need, env);
    expect(r.sweetener_value_zar).toBe(0);
    expect(r.lines).toEqual([]);
  });

  it('sums bundled sweeteners via toZarEquivalent', async () => {
    const spec: SweetenerSpec = {
      key: 'carbon_rebate', label: 'Carbon rebate', value_kind: 'zar', cadence: 'annual', commodity: 'carbon',
      toZarEquivalent: async () => 250_000,
    };
    const d = descWithSweetener(spec);
    const o = offer({ id: 'o', term_sheet: JSON.stringify({ sweeteners: [{ type: 'carbon_rebate' }] }) });
    const r = await valueSweeteners(d, o, need, env);
    expect(r.sweetener_value_zar).toBe(250_000);
    expect(r.lines).toHaveLength(1);
  });

  it('ignores unknown sweetener keys and tolerates valuation failures', async () => {
    const spec: SweetenerSpec = {
      key: 'carbon_rebate', label: 'Carbon rebate', value_kind: 'zar', cadence: 'annual', commodity: 'carbon',
      toZarEquivalent: async () => { throw new Error('boom'); },
    };
    const d = descWithSweetener(spec);
    const o = offer({ id: 'o', term_sheet: JSON.stringify({ sweeteners: [{ type: 'unknown_kicker' }, { type: 'carbon_rebate' }] }) });
    const r = await valueSweeteners(d, o, need, env);
    expect(r.sweetener_value_zar).toBe(0);
    expect(r.lines).toEqual([]);
  });
});

describe('parseTermSheet', () => {
  it('parses valid JSON and falls back to {} on garbage', () => {
    expect(parseTermSheet(offer({ id: 'o', term_sheet: '{"a":1}' }))).toEqual({ a: 1 });
    expect(parseTermSheet(offer({ id: 'o', term_sheet: 'not json' }))).toEqual({});
    expect(parseTermSheet(offer({ id: 'o', term_sheet: '[1,2]' }))).toEqual([1, 2]);
  });
});

describe('registry isolation', () => {
  it('registerDeal is idempotent on deal_type (last wins)', () => {
    const base = getDealDescriptor('energy_supply')!;
    registerDeal({ ...base, deal_type: 'dup_test', event_prefix: 'first' });
    registerDeal({ ...base, deal_type: 'dup_test', event_prefix: 'second' });
    expect(getDealDescriptor('dup_test')!.event_prefix).toBe('second');
  });
});

describe('migration 506 — deal engine tables', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb({ applyMigrations: true }); });
  afterEach(() => { db.close(); });

  it('creates all four tables', () => {
    const tables = ['oe_deal_offers', 'oe_deal_requests', 'oe_deal_objectives', 'oe_deal_links'];
    for (const t of tables) {
      const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t);
      expect(row, `table ${t} missing`).toBeTruthy();
    }
  });

  it('applies defaults (status published / open / forming, filled 0)', () => {
    db.prepare(`INSERT INTO oe_deal_offers (id, deal_type, provider_id, provider_role, tenant_id, title) VALUES ('o1','energy_supply','p','ipp_developer','t','x')`).run();
    db.prepare(`INSERT INTO oe_deal_requests (id, deal_type, demand_id, demand_role, tenant_id) VALUES ('r1','energy_supply','d','offtaker','t')`).run();
    db.prepare(`INSERT INTO oe_deal_objectives (id, owner_id, owner_role, tenant_id, title, funding_target_zar) VALUES ('ob1','o','lender','t','Stack',1000)`).run();
    expect((db.prepare(`SELECT status FROM oe_deal_offers WHERE id='o1'`).get() as any).status).toBe('published');
    expect((db.prepare(`SELECT status, filled_amount_zar FROM oe_deal_requests WHERE id='r1'`).get() as any).status).toBe('open');
    expect((db.prepare(`SELECT filled_amount_zar FROM oe_deal_requests WHERE id='r1'`).get() as any).filled_amount_zar).toBe(0);
    expect((db.prepare(`SELECT status FROM oe_deal_objectives WHERE id='ob1'`).get() as any).status).toBe('forming');
  });

  it('is idempotent — re-running the DDL does not throw', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const sql = readFileSync(join(__dirname, '..', 'migrations', '506_deal_engine.sql'), 'utf8');
    expect(() => db.exec(sql)).not.toThrow();
    expect(() => db.exec(sql)).not.toThrow();
  });
});
