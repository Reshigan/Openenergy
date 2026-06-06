// W3 — lifecycle sequencing drive rules. Each rule reads ctx.data (the source
// chain spreads its full row in) and writes downstream tables + role-action
// prompts as the system:cascade actor. Tests exercise rule.run() directly.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import type { CascadeContext } from '../src/utils/cascade';
import {
  registerLifecycleSequencingRules,
  __lifecycleRulesForTest,
} from '../src/cascade-rules/lifecycle-sequencing';

function ruleById(id: string) {
  const r = __lifecycleRulesForTest().find((x) => x.id === id);
  if (!r) throw new Error(`rule not found: ${id}`);
  return r;
}

function ctxFor(
  env: any,
  event: string,
  entity_type: string,
  entity_id: string,
  data: Record<string, unknown>,
): CascadeContext {
  return { event, entity_type, entity_id, data, env } as unknown as CascadeContext;
}

describe('registerLifecycleSequencingRules — registration', () => {
  it('scaffold registers zero rules until rules are added (Task 1)', () => {
    registerLifecycleSequencingRules();
    registerLifecycleSequencingRules(); // second call must not duplicate
    expect(__lifecycleRulesForTest().length).toBe(0);
  });
});
