import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerEsgEventRules } from '../src/cascade-rules/esg-events';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  // Test-only: 'esg_reports.updated_at' is added out-of-band on prod (outside
  // the clean migration band the test DB replays); the rule body's UPDATE
  // references it verbatim, so the clean-room schema needs it too.
  try { db.prepare('ALTER TABLE esg_reports ADD COLUMN updated_at TEXT').run(); } catch { /* already present */ }
  _resetRegistryForTests(); registerEsgEventRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'esg', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('esg-events rules', () => {
  it('decarbonisation_completed updates the latest esg_report total', async () => {
    db.prepare(`INSERT INTO esg_data (id, participant_id, metric_id, reporting_period, value) VALUES ('d1','part1','esg_met_001','2026-Q1',300)`).run();
    db.prepare(`INSERT INTO esg_reports (id, report_title, participant_id, reporting_year, reporting_period, total_ghg_emissions_tco2e, created_by, created_at) VALUES ('r1','Report','part1',2026,'2026-Q1',9999,'part1','2026-01-01')`).run();
    await runCascadeRegistry(ctx('esg.decarbonisation_completed', 'r1', { participant_id: 'part1', previous_emissions: 1000, scope: '1' }));
    const r = db.prepare(`SELECT total_ghg_emissions_tco2e FROM esg_reports WHERE id = 'r1'`).get() as { total_ghg_emissions_tco2e: number };
    expect(r.total_ghg_emissions_tco2e).toBe(300);
    const ii = db.prepare(`SELECT COUNT(*) n FROM intelligence_items WHERE participant_id = 'part1' AND type = 'esg'`).get() as { n: number };
    expect(ii.n).toBe(1); // |300-1000| > 500
  });
});
