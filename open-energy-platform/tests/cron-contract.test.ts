// Cron contract test — catches the silent-no-op class forever.
//
// Parses wrangler.toml ([triggers] AND [env.live.triggers]) for every declared
// cron pattern, parses src/index.ts runCron() for every `case '<pattern>':`
// branch, and asserts EVERY declared cron has a matching case. A missing case
// is a P0: Cloudflare still fires the schedule but runCron() falls through to
// the `default` warn (or, pre-fix, silently no-opped), so the job never runs.
//
// Also asserts the 45 0 * * * case is NOT an empty break — the original bug.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const wranglerPath = resolve(ROOT, 'wrangler.toml');
const indexPath = resolve(ROOT, 'src/index.ts');

function extractCrons(toml: string): { block: string; crons: string[] }[] {
  // Pull each `crons = [ ... ]` array literal out of the TOML. We deliberately
  // don't use a TOML parser (no dependency) — the cron entries are simple
  // double-quoted strings, one per line, inside a `[...]` block.
  const blocks: { block: string; crons: string[] }[] = [];
  const re = /([\s\S]*?)crons\s*=\s*\[([^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(toml)) !== null) {
    const header = m[1].slice(-120);
    const arrayBody = m[2];
    const crons = [...arrayBody.matchAll(/"([^"]+)"/g)].map((x) => x[1].trim());
    // Identify which block this is by scanning the preceding header text.
    const block = /env\.live\.triggers/.test(header) || /\[env\.live\.triggers\]/.test(m[1].slice(m[1].lastIndexOf('[')))
      ? 'env.live.triggers'
      : 'triggers';
    blocks.push({ block, crons });
  }
  return blocks;
}

function extractCases(src: string): Map<string, string> {
  // Match `case '<cron-pattern>':` inside runCron. Only the switch in index.ts
  // uses cron-pattern case literals, so a global scan is safe here.
  const cases = new Map<string, string>();
  const re = /case\s+'([^']+)':/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    cases.set(m[1].trim(), m[1].trim());
  }
  return cases;
}

describe('cron contract', () => {
  const wrangler = readFileSync(wranglerPath, 'utf8');
  const index = readFileSync(indexPath, 'utf8');
  const blocks = extractCrons(wrangler);
  const cases = extractCases(index);

  it('wrangler.toml has at least one triggers block', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(1);
  });

  it('runCron has at least 33 cases (live-env full set)', () => {
    // The live env declares 33 patterns; runCron must have a case for each.
    expect(cases.size).toBeGreaterThanOrEqual(33);
  });

  // One assertion per declared cron — names the missing pattern on failure.
  for (const { block, crons } of blocks) {
    describe(`block [${block}]`, () => {
      for (const cron of crons) {
        it(`runCron has case for "${cron}"`, () => {
          expect(cases.has(cron), `wrangler "${cron}" has no runCron case — silent no-op`).toBe(true);
        });
      }
    });
  }

  it('45 0 * * * case is not an empty break (regression: P0 watershed no-op)', () => {
    // Locate the `case '45 0 * * *':` body and ensure it contains at least one
    // safe() call — the original bug was an empty `break;`.
    const idx = index.indexOf("case '45 0 * * *':");
    expect(idx, '45 0 * * * case missing').toBeGreaterThan(-1);
    const breakIdx = index.indexOf('break;', idx);
    const body = index.slice(idx, breakIdx);
    expect(body, '45 0 * * * case body is empty').toMatch(/safe\(/);
  });

  it('0 * * * * case wires vwap_mark_publish (regression: P0 missing VWAP)', () => {
    const idx = index.indexOf("case '0 * * * *':");
    const breakIdx = index.indexOf('break;', idx);
    const body = index.slice(idx, breakIdx);
    expect(body, '0 * * * * case missing VWAP publish').toMatch(/vwap_mark_publish|publishVwapMarks/);
  });

  it('30 0 * * * case wires margin_call_cycle (regression: P0 missing margin call)', () => {
    const idx = index.indexOf("case '30 0 * * *':");
    const breakIdx = index.indexOf('break;', idx);
    const body = index.slice(idx, breakIdx);
    expect(body, '30 0 * * * case missing margin-call cycle').toMatch(/margin_call_cycle|runMarginCallCycle/);
  });

  it('*/15 * * * * case wires OrderBook depth snapshots (regression: P1)', () => {
    const idx = index.indexOf("case '*/15 * * * *':");
    const breakIdx = index.indexOf('break;', idx);
    const body = index.slice(idx, breakIdx);
    expect(body, '*/15 case missing orderbook depth snapshots').toMatch(/snapshotAllOrderBooks|orderbook_depth_snapshots/);
  });

  it('0 2 1 * * case wires subscription_monthly_billing (contract)', () => {
    const idx = index.indexOf("case '0 2 1 * *':");
    const breakIdx = index.indexOf('break;', idx);
    const body = index.slice(idx, breakIdx);
    expect(body, 'monthly invoice run missing subscription billing sweep').toMatch(/subscription_monthly_billing|runMonthlySubscriptionBilling/);
  });

  it('5 0 * * * case wires audit_chain_anchor (contract)', () => {
    const idx = index.indexOf("case '5 0 * * *':");
    const breakIdx = index.indexOf('break;', idx);
    const body = index.slice(idx, breakIdx);
    expect(body, 'nightly audit-chain R2 anchor missing').toMatch(/publishChainHeadToR2|audit_chain_anchor/);
  });
});