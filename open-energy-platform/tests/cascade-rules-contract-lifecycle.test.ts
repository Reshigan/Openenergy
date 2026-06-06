import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerContractLifecycleRules } from '../src/cascade-rules/contract-lifecycle';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  // contract.signed INSERTs invoices.tenant_id (out-of-band prod column absent in clean-room migrations)
  try { db.prepare("ALTER TABLE invoices ADD COLUMN tenant_id TEXT DEFAULT 'default'").run(); } catch { /* already present */ }
  env = envFor(db);
  _resetRegistryForTests(); registerContractLifecycleRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'contract_documents', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('contract-lifecycle rules', () => {
  it('contract.signed activates the contract, opens an invoice, queues activation', async () => {
    db.prepare(`INSERT INTO contract_documents (id, title, document_type, creator_id, counterparty_id, project_id, commercial_terms, phase) VALUES ('c1','Solar PPA','ppa_wheeling','cr1','cp1','p1','{"monthly_amount":1150}','execution')`).run();
    await runCascadeRegistry(ctx('contract.signed', 'c1', {}));
    const c = db.prepare(`SELECT phase FROM contract_documents WHERE id = 'c1'`).get() as { phase: string };
    expect(c.phase).toBe('active');
    const inv = db.prepare(`SELECT COUNT(*) n FROM invoices WHERE from_participant_id = 'cr1' AND to_participant_id = 'cp1'`).get() as { n: number };
    expect(inv.n).toBe(1);
    const aq = db.prepare(`SELECT COUNT(*) n FROM action_queue WHERE entity_id = 'c1' AND type = 'contract_activate'`).get() as { n: number };
    expect(aq.n).toBe(1);
  });

  it('contract.phase_changed->execution queues a sign action per unsigned signatory', async () => {
    db.prepare(`INSERT INTO document_signatories (id, document_id, participant_id, signed) VALUES ('ds1','c2','u1',0)`).run();
    db.prepare(`INSERT INTO document_signatories (id, document_id, participant_id, signed) VALUES ('ds2','c2','u2',1)`).run();
    await runCascadeRegistry(ctx('contract.phase_changed', 'c2', { new_phase: 'execution' }));
    const aq = db.prepare(`SELECT COUNT(*) n FROM action_queue WHERE entity_id = 'c2' AND type = 'contract_sign'`).get() as { n: number };
    expect(aq.n).toBe(1); // only the unsigned signatory
  });
});
