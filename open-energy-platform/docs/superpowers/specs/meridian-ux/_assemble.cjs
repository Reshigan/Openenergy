#!/usr/bin/env node
// Assembles the wq12go2gd UX-detail workflow output into a focused doc tree.
// Strips each agent's preamble (everything before the first markdown heading).
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2];
const OUT = path.resolve(__dirname);
const o = JSON.parse(fs.readFileSync(SRC, 'utf8')).result;

function clean(s) {
  const lines = s.split('\n');
  let start = lines.findIndex((l) => /^#{1,4}\s+\S/.test(l));
  if (start < 0) start = 0;
  // Drop a trailing agent sign-off line if present.
  let body = lines.slice(start).join('\n').trim();
  return body + '\n';
}
function slug(h) {
  return h.replace(/^#+\s*/, '')
    .replace(/^Surface:\s*/i, '').replace(/^Role journey:\s*/i, '').replace(/^Cross-cutting:\s*/i, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}
function firstHeading(s) {
  return (s.split('\n').find((l) => /^#{1,4}\s+\S/.test(l)) || '').trim();
}

const ROLE_ORDER = ['admin','trader','ipp_developer','carbon_fund','offtaker','lender','grid_operator','regulator','support','esco','esums_owner','epc_contractor'];

const index = [];

// Surfaces
fs.mkdirSync(path.join(OUT, 'surfaces'), { recursive: true });
o.surfaces.forEach((s, i) => {
  const h = firstHeading(s);
  const name = `${String(i).padStart(2, '0')}-${slug(h)}.md`;
  fs.writeFileSync(path.join(OUT, 'surfaces', name), clean(s));
  index.push({ grp: 'surfaces', file: `surfaces/${name}`, title: h.replace(/^#+\s*/, '') });
});

// Roles
fs.mkdirSync(path.join(OUT, 'roles'), { recursive: true });
o.roles.forEach((s) => {
  const h = firstHeading(s);
  const role = (h.match(/Role journey:\s*([a-z_]+)/i) || [, slug(h)])[1];
  const name = `${role}.md`;
  fs.writeFileSync(path.join(OUT, 'roles', name), clean(s));
  index.push({ grp: 'roles', file: `roles/${name}`, title: role, order: ROLE_ORDER.indexOf(role) });
});

// Crosscutting
fs.mkdirSync(path.join(OUT, 'crosscutting'), { recursive: true });
o.crosscutting.forEach((s, i) => {
  const h = firstHeading(s);
  const name = `${String(i).padStart(2, '0')}-${slug(h)}.md`;
  fs.writeFileSync(path.join(OUT, 'crosscutting', name), clean(s));
  index.push({ grp: 'crosscutting', file: `crosscutting/${name}`, title: h.replace(/^#+\s*/, '') });
});

// Stats
const stat = (f) => fs.statSync(path.join(OUT, f)).size;
const total = index.reduce((a, x) => a + stat(x.file), 0);
console.log(`Wrote ${index.length} files, ${(total / 1024).toFixed(0)}KB total`);
index.filter(x=>x.grp==='surfaces').forEach(x=>console.log(`  ${x.file}  (${(stat(x.file)/1024).toFixed(1)}KB)`));
index.filter(x=>x.grp==='roles').sort((a,b)=>a.order-b.order).forEach(x=>console.log(`  ${x.file}  (${(stat(x.file)/1024).toFixed(1)}KB)`));
index.filter(x=>x.grp==='crosscutting').forEach(x=>console.log(`  ${x.file}  (${(stat(x.file)/1024).toFixed(1)}KB)`));

// Emit index data for the README step
fs.writeFileSync(path.join(OUT, '_index.json'), JSON.stringify(index, null, 2));
