// Generate the data-driven E2E fixture from MERIDIAN_CHAINS.
// Emits the FULL field specs the generic Meridian suite needs to drive any chain
// through the deployed SPA (initiation + per-action field schemas, lanes, terminal).
//
// Run: npx tsx scripts/build-journey-fixture.ts
// Writes: tests/browser/fixtures/journey-matrix.json
import { MERIDIAN_CHAINS } from '../src/utils/chain-registry-meridian';
import * as fs from 'fs';
import * as path from 'path';

type FieldSpec = {
  key: string; label: string; type: string;
  required: boolean; options: string[] | null; unit: string | null;
};

function fields(fs_: any[] | undefined): FieldSpec[] {
  return (fs_ ?? []).map((f) => ({
    key: f.key, label: f.label, type: f.type,
    required: !!f.required, options: f.options ?? null, unit: f.unit ?? null,
  }));
}

const rows = MERIDIAN_CHAINS.map((c) => ({
  key: c.key,
  wave: c.wave,
  title: c.title,
  table: c.table,
  statusCol: c.statusCol,
  terminal: c.terminal ?? [],
  lanes: c.lanes ? Object.keys(c.lanes) : [],
  hasInitiation: !!c.initiation,
  initiation: c.initiation
    ? { label: c.initiation.label, path: c.initiation.path, fields: fields(c.initiation.fields) }
    : null,
  actions: (c.actions ?? []).map((a) => ({
    action: a.action,
    label: a.label,
    path: a.path,
    method: a.method ?? 'POST',
    roles: a.roles ?? [],
    body: a.body ?? null,
    tone: a.tone ?? null,
    fields: fields(a.fields),
  })),
}));

const out = {
  generatedFrom: 'MERIDIAN_CHAINS',
  total: rows.length,
  withInitiation: rows.filter((r) => r.hasInitiation).length,
  rows,
};

const dest = path.join(process.cwd(), 'tests', 'browser', 'fixtures', 'journey-matrix.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
process.stdout.write(`wrote ${dest}: ${out.total} chains, ${out.withInitiation} with initiation\n`);
