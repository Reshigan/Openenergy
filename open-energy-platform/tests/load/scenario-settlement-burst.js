// ════════════════════════════════════════════════════════════════════════
// Settlement burst — 50 offtakers acknowledging / paying invoices inside
// a tight 5-minute EOD window. Models the natural traffic shape that
// follows the 00:10 daily settlement cron in wrangler.toml.
//
// Each VU:
//   1. logs in as offtaker
//   2. fetches incoming invoices in a `pending_payer_ack` state
//   3. acknowledges 1-3 of them
//   4. settles (POST /settle) 1 of them
//
// Read-only mode: set MUTATE=0 to skip the writes (useful for dry-runs
// against prod without leaving rows in pending_payer_ack changes).
// ════════════════════════════════════════════════════════════════════════

import http from 'k6/http';
import { sleep, check } from 'k6';
import { BASE, login, authHeaders } from './lib/login.js';

const MUTATE = __ENV.MUTATE !== '0';

export const options = {
  scenarios: {
    settlement_burst: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '5m', target: 50 },
        { duration: '1m', target: 0  },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'http_req_failed':                              ['rate<0.01'],
    'http_req_duration{name:get_invoices}':         ['p(95)<800'],
    'http_req_duration{name:ack_invoice}':          ['p(95)<2000'],
    'http_req_duration{name:settle_invoice}':       ['p(95)<2000'],
  },
};

let TOKEN = null;

export default function () {
  if (!TOKEN) TOKEN = login('offtaker@openenergy.co.za');
  const headers = authHeaders(TOKEN);

  // 1) Fetch incoming invoices.
  const r = http.get(`${BASE}/api/settlement/invoices?direction=incoming`, {
    headers, tags: { name: 'get_invoices' },
  });
  check(r, { 'invoices 2xx': (resp) => resp.status >= 200 && resp.status < 300 });

  if (!MUTATE) {
    sleep(0.5 + Math.random()); return;
  }

  let invoices = [];
  try { invoices = r.json('data') || []; } catch { /* */ }
  if (!Array.isArray(invoices) || invoices.length === 0) {
    sleep(1); return;
  }

  // 2) Pick 1-3 invoices to acknowledge.
  const pending = invoices.filter((i) => i.status === 'pending_payer_ack').slice(0, 3);
  for (const inv of pending) {
    const ack = http.post(
      `${BASE}/api/settlement/invoices/${inv.id}/acknowledge`,
      JSON.stringify({ note: 'k6 settlement-burst ack' }),
      { headers, tags: { name: 'ack_invoice' } },
    );
    check(ack, { 'ack 2xx': (resp) => resp.status >= 200 && resp.status < 300 });
    sleep(0.2);
  }

  // 3) Settle one invoice if any are in `acknowledged` state.
  const settleable = invoices.find((i) => i.status === 'acknowledged');
  if (settleable) {
    const s = http.post(
      `${BASE}/api/settlement/invoices/${settleable.id}/settle`,
      JSON.stringify({ reference: `k6_${__VU}_${Date.now()}` }),
      { headers, tags: { name: 'settle_invoice' } },
    );
    check(s, { 'settle 2xx': (resp) => resp.status >= 200 && resp.status < 300 });
  }

  sleep(0.5 + Math.random());
}
