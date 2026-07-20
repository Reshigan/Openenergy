// The P0 gate's ONE structural invariant, asserted structurally.
//
// verify-tamper proves the verifier CATCHES a doctored pack. But the whole
// point of a standalone verifier — "an external party can re-verify our packs
// without any of our runtime code" — rests on a property no data-level test can
// see: verify/ must import NOTHING runtime from domain/. It re-implements
// canonicalJson, sha256, the merkle fold and eventHash from scratch, on purpose,
// so a bug shared with the engine can't hide in both.
//
// The day someone "DRYs up the duplication" with
//     import { canonicalJson } from '../domain/canonical';
// every test here still passes — the bytes are identical, the honest pack still
// verifies, tampering is still caught — and the gate has silently become
// circular: it now certifies the engine using the engine's own code. This test
// is the only thing that fails on that commit.
//
// So: parse every source file under src/v2/verify/ and assert each import that
// reaches into ../domain is `import type` (erased at build). Value imports,
// side-effect imports, re-exports, dynamic import(), and require() of a domain
// module are all P0 regressions. Type-only imports are fine — they vanish.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const VERIFY_DIR = fileURLToPath(new URL('../../src/v2/verify/', import.meta.url));

// strip block + line comments so the header prose ("imports NOTHING from
// ../domain") and any commented-out import can't register as a real import.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// a domain module = anything the import path resolves toward domain/. verify/ is
// a sibling of domain/, so real specifiers look like '../domain/...'.
const isDomain = (spec: string) => /(^|\/)domain\//.test(spec) || /(^|\/)domain$/.test(spec);

function verifyFiles(): string[] {
  return readdirSync(VERIFY_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => VERIFY_DIR + f);
}

describe('P0 gate — verify/ imports nothing runtime from domain/', () => {
  it('has verify/ source to check (guards against a moved/renamed dir)', () => {
    expect(verifyFiles().length).toBeGreaterThan(0);
  });

  for (const path of verifyFiles()) {
    const name = path.slice(VERIFY_DIR.length);

    it(`${name}: every domain import is type-only (erased at build)`, () => {
      const src = stripComments(readFileSync(path, 'utf8'));

      // 1. `import ... from '<spec>'` — captures a leading `type` keyword if present.
      const importRe = /\bimport\s+(type\s+)?([^'";]*?)\s+from\s+['"]([^'"]+)['"]/g;
      for (const m of src.matchAll(importRe)) {
        const [, typeKw, , spec] = m;
        if (isDomain(spec)) {
          expect(typeKw, `value import from domain: ${spec} (must be \`import type\`)`).toBeTruthy();
        }
      }

      // 2. side-effect import `import '<spec>'` — runs the module; never type-only.
      for (const m of src.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) {
        expect(isDomain(m[1]), `side-effect import of domain module: ${m[1]}`).toBe(false);
      }

      // 3. re-export `export ... from '<spec>'` — must be `export type` if from domain.
      const exportRe = /\bexport\s+(type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g;
      for (const m of src.matchAll(exportRe)) {
        const [, typeKw, spec] = m;
        if (isDomain(spec)) {
          expect(typeKw, `value re-export from domain: ${spec} (must be \`export type\`)`).toBeTruthy();
        }
      }

      // 4. dynamic import() / require() of a domain module — both pull runtime code.
      for (const m of src.matchAll(/(?:\bimport|\brequire)\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        expect(isDomain(m[1]), `dynamic import/require of domain module: ${m[1]}`).toBe(false);
      }
    });
  }
});
