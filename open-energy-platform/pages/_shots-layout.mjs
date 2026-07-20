import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const BASE = 'https://dev.open.vantax.co.za';
const TOK = readFileSync(new URL('./.tok', import.meta.url), 'utf8').trim();
const shots = [
  ['lay-settings', '/settings'],
  ['lay-reports', '/reports'],
  ['lay-esg', '/esg'],
  ['lay-support', '/support'],
  ['lay-notifications', '/notifications'],
  ['lay-admin-platform', '/admin-platform'],
];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const page = await ctx.newPage();
await page.addInitScript((t) => { localStorage.setItem('token', t); }, TOK);
page.on('console', (m) => { if (m.type() === 'error') console.log('  console.error:', m.text().slice(0, 160)); });
for (const [name, path] of shots) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const out = new URL(`./${name}.png`, import.meta.url).pathname;
  await page.screenshot({ path: out, fullPage: true });
  console.log(`${name} -> ${path}`);
}
await browser.close();
