// tests/chain-registry-meridian.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  MERIDIAN_CHAINS, bucketFor, attentionScore, quantumZar, getChain, type HorizonBucket,
} from '../src/utils/chain-registry-meridian';

const NOW = new Date('2026-06-12T09:40:00Z').getTime();
const h = (n: number) => new Date(NOW + n * 3600_000).toISOString();

describe('bucketFor', () => {
  it('maps deadlines to the six horizon buckets', () => {
    expect(bucketFor(h(-1), NOW)).toBe<'breached'>('breached');
    expect(bucketFor(h(1), NOW)).toBe<'h2'>('h2');
    expect(bucketFor(h(8), NOW)).toBe<'today'>('today');   // <24h
    expect(bucketFor(h(40), NOW)).toBe<'h48'>('h48');
    expect(bucketFor(h(100), NOW)).toBe<'week'>('week');    // <168h
    expect(bucketFor(h(300), NOW)).toBe<'later'>('later');
    expect(bucketFor(null, NOW)).toBe<'later'>('later');
  });
});

describe('attentionScore', () => {
  it('weights by log10(ZAR) over hours remaining, money dominates within a bucket', () => {
    const big = attentionScore(850_000_000, h(8), NOW);
    const small = attentionScore(12_000, h(8), NOW);
    expect(big).toBeGreaterThan(small);
  });
  it('breached outranks everything regardless of quantum', () => {
    expect(attentionScore(12_000, h(-1), NOW))
      .toBeGreaterThan(attentionScore(850_000_000, h(8), NOW));
  });
  it('handles null quantum and null deadline without NaN', () => {
    expect(Number.isFinite(attentionScore(null, null, NOW))).toBe(true);
  });
  it('a deadline-less case never ties or outranks a breached one, whatever its quantum', () => {
    expect(attentionScore(1_000_000_000, null, NOW))
      .toBeLessThan(attentionScore(12_000, h(-1), NOW));
  });
  it('clamps hours remaining to a 0.25h floor so near-deadline scores stay finite', () => {
    const nearDeadline = attentionScore(1_000_000, h(0.1), NOW);
    const atFloor = attentionScore(1_000_000, h(0.25), NOW);
    expect(nearDeadline).toBe(atFloor);
    expect(Number.isFinite(nearDeadline)).toBe(true);
  });
});

describe('quantumZar', () => {
  const mk = (quantumCol: string | null) =>
    ({ ...MERIDIAN_CHAINS[0], quantumCol }) as typeof MERIDIAN_CHAINS[0];

  it('passes raw-ZAR columns through unchanged', () => {
    expect(quantumZar(mk('notional_zar'), { notional_zar: 850_000 })).toBe(850_000);
  });
  it('scales *_zar_m columns to ZAR', () => {
    expect(quantumZar(mk('facility_limit_zar_m'), { facility_limit_zar_m: 450 })).toBe(450_000_000);
  });
  it('returns null for missing column, null value, or non-numeric', () => {
    expect(quantumZar(mk(null), {})).toBeNull();
    expect(quantumZar(mk('amount_zar'), { amount_zar: null })).toBeNull();
    expect(quantumZar(mk('amount_zar'), { amount_zar: 'n/a' })).toBeNull();
  });
  it('a R450m *_zar_m facility outranks a R850k raw-ZAR case at the same deadline', () => {
    const big = attentionScore(quantumZar(mk('facility_limit_zar_m'), { facility_limit_zar_m: 450 }), h(8), NOW);
    const small = attentionScore(quantumZar(mk('notional_zar'), { notional_zar: 850_000 }), h(8), NOW);
    expect(big).toBeGreaterThan(small);
  });
});

describe('MERIDIAN_CHAINS registry shape', () => {
  it('every entry has table, statusCol default, deadline col, ≥1 lane', () => {
    for (const d of MERIDIAN_CHAINS) {
      // oe_/om_ is the convention; these four are documented legacy pre-oe_
      // tables (migrations 002/026/056/110) the registry deliberately reuses.
      const LEGACY = new Set(['carbon_retirements', 'mrv_submissions', 'support_tickets', 'ipp_performance_bonds']);
      expect(d.table.startsWith('oe_') || d.table.startsWith('om_') || LEGACY.has(d.table),
        `unexpected table name ${d.table} (chain ${d.key})`).toBe(true);
      expect(d.key).toMatch(/^[a-z0-9_]+$/);
      expect(Object.keys(d.lanes).length).toBeGreaterThan(0);
      expect(d.terminal.length).toBeGreaterThan(0);
    }
  });
  it('keys are unique', () => {
    const keys = MERIDIAN_CHAINS.map(d => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('registry schema extensions', () => {
  it('getChain resolves a known key and returns undefined for unknown', () => {
    expect(getChain('covenant_certificate')?.wave).toBe(38);
    expect(getChain('__nope__')).toBeUndefined();
  });

  it('any filters/kpis/initiation present are well-formed', () => {
    for (const d of MERIDIAN_CHAINS) {
      for (const f of d.filters ?? []) {
        expect(typeof f.key).toBe('string');
        expect(Array.isArray(f.statuses)).toBe(true);
        expect(f.statuses.length).toBeGreaterThan(0);
      }
      for (const k of d.kpis ?? []) {
        expect(['count', 'count_breached', 'sum_quantum']).toContain(k.compute);
      }
      if (d.initiation) {
        expect(d.initiation.path.startsWith('/api/')).toBe(true);
        expect(Array.isArray(d.initiation.fields)).toBe(true);
      }
      for (const a of d.actions) {
        for (const fld of a.fields ?? []) {
          expect(['number','string','date','enum','boolean','evidence','lookup']).toContain(fld.type);
          if (fld.type === 'enum') expect((fld.options ?? []).length).toBeGreaterThan(0);
          if (fld.type === 'lookup') expect(typeof (fld as { source?: string }).source).toBe('string');
        }
      }
    }
  });
});

describe('covenant_certificate schema extensions', () => {
  it('covenant_certificate has filters, kpis, and breach action fields', () => {
    const d = getChain('covenant_certificate')!;
    expect(d.filters?.map(f => f.key)).toContain('active_breach');
    expect(d.kpis?.some(k => k.compute === 'sum_quantum')).toBe(true);
    const flag = d.actions.find(a => a.action === 'flag-breach')!;
    expect(flag.fields?.find(f => f.key === 'reason_code')?.type).toBe('enum');
    const KNOWN = new Set(['certificate_due','certificate_submitted','under_review','ratios_verified',
      'compliant','breach_identified','waiver_requested','waiver_granted','cure_period','cured','accelerated']);
    for (const f of d.filters ?? []) for (const s of f.statuses) expect(KNOWN.has(s)).toBe(true);
  });
});

describe('registry tables exist in migrations', () => {
  const migDir = join(__dirname, '../migrations');
  const allSql = readdirSync(migDir)
    .filter(f => f.endsWith('.sql'))
    .map(f => readFileSync(join(migDir, f), 'utf8'))
    .join('\n');

  // DDL may quote the identifier (`oe_x`) and table names share prefixes
  // (oe_enforcement_action vs oe_enforcement_actions), so anchor on optional
  // backticks + a `(` boundary rather than a bare substring.
  const createRe = (table: string) =>
    new RegExp(`CREATE TABLE IF NOT EXISTS\\s+\`?${table}\`?\\s*\\(`);

  it('every registry table has a CREATE TABLE migration', () => {
    for (const d of MERIDIAN_CHAINS) {
      expect(createRe(d.table).test(allSql), `missing table ${d.table} (chain ${d.key})`).toBe(true);
    }
  });

  it('every quantum/deadline column appears in that table DDL', () => {
    // Strip `--` comments first: a comment containing `);` (e.g. "(pp); <=0 means met"
    // in migration 192) would otherwise truncate the CREATE TABLE block early.
    const sqlNoComments = allSql.replace(/--.*$/gm, '');
    // A column counts as present if it is in the CREATE TABLE block OR added by a
    // later `ALTER TABLE <table> ADD COLUMN` (e.g. om_sites' commissioning_status /
    // commissioning_due_at arrive via per-column ALTERs in migration 114).
    const hasColumn = (table: string, col: string): boolean => {
      // Anchor the CREATE TABLE on optional backticks + `(` so a prefix-sharing
      // sibling (oe_enforcement_actions) can't be matched for oe_enforcement_action.
      const m = createRe(table).exec(sqlNoComments);
      const block = m ? sqlNoComments.slice(m.index + m[0].length).split(');')[0] : '';
      if (block.includes(col)) return true;
      return new RegExp(`ALTER TABLE\\s+\`?${table}\`?\\s+ADD COLUMN\\s+\`?${col}\\b`).test(sqlNoComments);
    };
    for (const d of MERIDIAN_CHAINS) {
      expect(hasColumn(d.table, d.deadlineCol), `${d.table} missing ${d.deadlineCol}`).toBe(true);
      if (d.quantumCol) expect(hasColumn(d.table, d.quantumCol), `${d.table} missing ${d.quantumCol}`).toBe(true);
    }
  });
});
