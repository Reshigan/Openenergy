#!/usr/bin/env node
// One-shot codemod: add click-outside-to-close to every modal/drawer backdrop.
//
// Pattern targeted: <div className="fixed inset-0 ..."> overlays (template-
// generated chain-tab Drawers and action modals). Inserts an onMouseDown
// handler that closes only when the press starts on the backdrop itself
// (e.target === e.currentTarget), so clicks/drags inside the panel never
// dismiss. mousedown (not click) avoids the text-selection-drag misfire where
// the click event retargets to the backdrop.
//
// Close expression resolution, in order:
//   1. Inline conditional render `{someState && (` just above the overlay →
//      `setSomeState(null|false)` (null vs false read from the useState init).
//   2. Enclosing component's onClose / onCancel / onDismiss prop.
// Sites resolving to neither are reported, not modified.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const files = execSync(
  `grep -rl 'fixed inset-0' ${root}pages/src --include='*.tsx'`,
  { encoding: 'utf8' },
).trim().split('\n').filter(Boolean);

const COMPONENT_START = /^\s*(?:export\s+)?(?:default\s+)?function\s+[A-Z]\w*\s*\(|^\s*(?:export\s+)?const\s+[A-Z]\w*(?::\s*React\.\w+(?:<[^=]*>)?)?\s*=\s*(?:\(|function\b|React\.(?:memo|forwardRef)|memo\(|forwardRef\()/;
const CLOSE_PROPS = ['onClose', 'onCancel', 'onDismiss'];

let modified = 0;
const skipped = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/className=\{?[`"]fixed inset-0/.test(line)) continue;

    // The opening tag may span multiple lines; scan the whole tag for an
    // existing handler before touching it.
    let tagStart = i;
    while (tagStart > 0 && !/<[a-zA-Z]/.test(lines[tagStart])) tagStart--;
    let tagEnd = i;
    while (tagEnd < lines.length - 1 && !/>/.test(lines[tagEnd])) tagEnd++;
    const tagRegion = lines.slice(tagStart, tagEnd + 1).join('\n');
    if (/onMouseDown|onClick/.test(tagRegion)) continue;

    let closeExpr = null;

    // 1. Inline conditional render: `{someState && (` within 3 lines above.
    for (let j = tagStart - 1; j >= Math.max(0, tagStart - 3) && !closeExpr; j--) {
      const m = lines[j].match(/\{\s*(\w+)\s*(?:!==?\s*null\s*)?&&\s*\($/) || lines[j].match(/\{\s*(\w+)\s*&&\s*\(\s*$/);
      if (!m) continue;
      const stateVar = m[1];
      const setter = 'set' + stateVar[0].toUpperCase() + stateVar.slice(1);
      const decl = src.match(new RegExp(`\\[\\s*${stateVar}\\s*,\\s*${setter}\\s*\\]\\s*=\\s*useState(<[^>]*>)?\\(([^)]*)\\)`));
      if (!decl) continue;
      const init = (decl[2] ?? '').trim();
      const generic = decl[1] ?? '';
      const isBool = init === 'false' || init === 'true' || /boolean/.test(generic);
      closeExpr = `${setter}(${isBool ? 'false' : 'null'})`;
    }

    // 2. Enclosing component's close prop.
    if (!closeExpr) {
      let compStart = -1;
      for (let j = i; j >= 0; j--) {
        if (COMPONENT_START.test(lines[j])) { compStart = j; break; }
      }
      if (compStart >= 0) {
        let propsRegion = '';
        for (let j = compStart; j < Math.min(compStart + 60, i); j++) {
          propsRegion += lines[j] + '\n';
          if (/\)\s*(?::[^{]+)?\{\s*$/.test(lines[j]) || /=>\s*\{\s*$/.test(lines[j])) break;
        }
        const closeProp = CLOSE_PROPS.find(p => new RegExp(`\\b${p}\\b`).test(propsRegion));
        if (closeProp) closeExpr = `${closeProp}()`;
      }
    }

    if (!closeExpr) { skipped.push(`${file}:${i + 1}`); continue; }

    lines[i] = line.replace(
      /className=(\{?[`"]fixed inset-0)/,
      `onMouseDown={(e) => { if (e.target === e.currentTarget) ${closeExpr}; }} className=$1`,
    );
    changed = true;
  }

  if (changed) { writeFileSync(file, lines.join('\n')); modified++; }
}

console.log(`modified ${modified} files`);
if (skipped.length) {
  console.log(`\nskipped ${skipped.length} sites:`);
  for (const s of skipped) console.log('  ' + s.replace(root, ''));
}
