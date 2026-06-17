// ════════════════════════════════════════════════════════════════════════
// Trading peak — 100 concurrent traders, ~1,000 orders/min sustained.
//
// Models the SAST 07:00–09:00 dispatch window. Each VU:
//   1. Logs in once (cached for the VU lifetime).
//   2. Loops:
//      - read /orderbook                       (every iteration)
//      - read /trading/orders (my orders)      (every iteration)
//      - POST /trading/orders                  (1-in-5 iterations)
//      - cancel a random open order            (1-in-10 iterations)
//
// The pre-trade guards will reject many orders intentionally (credit limit,
// stale mark, etc.) — those land in trade_order_rejections and count as 422
// not 500. We treat 4xx as success in http_req_failed (the failed counter
// only includes status >= 500).
// ════════════════════════════════════════════════════════════════════════

import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { BASE, mintTokenBundle, authHeaders, tokenForVU } from './lib/login.js';

const authBlocked = new Counter('auth_429');
const orderPostLatency = new Trend('order_post_latency_ms', true);

export const options = {
  scenarios: {
    trading_peak: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m',  target: 100 },  // ramp
        { duration: '10m', target: 100 },  // steady-state peak
        { duration: '5m',  target: 0   },  // ramp-down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'http_req_failed':                        ['rate<0.01'],
    'http_req_duration{name:get_orderbook}':  ['p(95)<500'],
    'http_req_duration{name:get_my_orders}':  ['p(95)<500'],
    'order_post_latency_ms':                  ['p(95)<1500'],
    'auth_429':                               ['count==0'],
  },
};

// 100 VUs / 9 personas → ~11 per role. Spread the load.
const TRADER_EMAILS = [
  'trader@openenergy.co.za',
  'admin@openenergy.co.za',     // admin can post orders on behalf
];

export function setup() {
  // Mint every token ONCE here (2 logins) rather than one-per-VU. With 100 VUs
  // ramping in, per-VU login would fire ~100 logins from a single IP and trip
  // the 10/5-min/IP limiter — which would also break the auth_429 SLO below.
  return { tokens: mintTokenBundle(TRADER_EMAILS) };
}

let MY_OPEN_ORDER_IDS = [];

export default function (data) {
  // Token picked from the setup() bundle — no per-VU login. __VU is 1-indexed.
  const headers = authHeaders(tokenForVU(data.tokens, __VU));

  // 1) Orderbook read — ~50% of all traffic in this scenario.
  const ob = http.get(`${BASE}/api/trading/orderbook?energy_type=solar`, {
    headers, tags: { name: 'get_orderbook' },
  });
  check(ob, { 'orderbook 2xx': (r) => r.status >= 200 && r.status < 300 });
  if (ob.status === 429) authBlocked.add(1);

  // 2) My orders — every iteration.
  const mine = http.get(`${BASE}/api/trading/orders`, {
    headers, tags: { name: 'get_my_orders' },
  });
  if (mine.status >= 200 && mine.status < 300) {
    try {
      const rows = mine.json('data') || [];
      MY_OPEN_ORDER_IDS = rows
        .filter((r) => r.status === 'open' || r.status === 'partially_filled')
        .map((r) => r.id);
    } catch { /* ignore parse */ }
  }
  if (mine.status === 429) authBlocked.add(1);

  // 3) POST a new order — 1 in 5 iterations. Volume between 0.1 and 5 MWh,
  // price ±10% of 1000 ZAR/MWh. Pre-trade guards will reject some; that's
  // expected behaviour, not a failure.
  if (Math.random() < 0.2) {
    const body = {
      side: Math.random() < 0.5 ? 'buy' : 'sell',
      energy_type: 'solar',
      volume_mwh: +(0.1 + Math.random() * 4.9).toFixed(2),
      price: +(900 + Math.random() * 200).toFixed(2),
      order_type: 'limit',
      external_ref: `k6_${__VU}_${__ITER}_${Date.now()}`,
    };
    const t0 = Date.now();
    const r = http.post(`${BASE}/api/trading/orders`, JSON.stringify(body), {
      headers, tags: { name: 'post_order' },
    });
    orderPostLatency.add(Date.now() - t0);
    // 422 = pre-trade rejection (expected, has structured reason_code).
    // 201 = order accepted. Anything else is a real failure.
    check(r, {
      'order 201 or 422': (resp) => resp.status === 201 || resp.status === 422,
    });
    if (r.status === 429) authBlocked.add(1);
  }

  // 4) Cancel a random open order — 1 in 10 iterations. Keeps the open
  //    book from growing unbounded over a 20-minute run.
  if (Math.random() < 0.1 && MY_OPEN_ORDER_IDS.length > 0) {
    const id = MY_OPEN_ORDER_IDS[Math.floor(Math.random() * MY_OPEN_ORDER_IDS.length)];
    const r = http.post(
      `${BASE}/api/trading/orders/${id}/cancel`,
      JSON.stringify({ reason: 'k6 load test cleanup' }),
      { headers, tags: { name: 'cancel_order' } },
    );
    check(r, { 'cancel 2xx': (resp) => resp.status >= 200 && resp.status < 300 });
    if (r.status === 429) authBlocked.add(1);
  }

  sleep(0.5 + Math.random()); // 0.5–1.5 s think time
}
