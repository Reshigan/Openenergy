import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const BASE = 'https://dev.open.vantax.co.za';
const tok = (r) => readFileSync(new URL(`./.tok-${r}`, import.meta.url), 'utf8').trim();
const shots = [
  ['trader', 'c-trader-risk', '/v2/s/risk'],
  ['ipp', 'c-ipp-schedule', '/v2/s/schedule'],
  ['ipp', 'c-ipp-rul', '/v2/s/rul-prediction'],
  ['ipp', 'c-ipp-projects', '/v2/s/projects'],
];
const browser = await chromium.launch();
for (const [role, name, path] of shots) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.addInitScript((t) => {
    localStorage.setItem('token', t);
    localStorage.setItem('oe.consent.v1', JSON.stringify({ version: '2026-05-19', analytics: true, marketing: false, at: '2026-01-01T00:00:00Z' }));
  }, tok(role));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`  [${name}] err:`, m.text().slice(0, 120)); });
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: new URL(`./${name}.png`, import.meta.url).pathname, fullPage: true });
    console.log(`${name} -> ${path}`);
  } catch (e) { console.log(`${name} FAILED: ${String(e).slice(0,100)}`); }
  await ctx.close();
}
await browser.close();
