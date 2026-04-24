// Matching burst — 500 VUs slamming the exchange order book Durable Object.
// Stresses DO per-shard serialisation. Shards are (energy_type, delivery_day)
// so distributing orders across shards is intentional; each VU picks a
// different shard to avoid artificial lock contention.
//
// Run:  k6 run load/scenarios/matching-burst.js
//
// Env:  BASE_URL, JWT (trader role)

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:8787';
const JWT = __ENV.JWT;
if (!JWT) throw new Error('JWT env var required');

const ENERGY = ['solar', 'wind', 'hydro', 'gas', 'storage'];
const DAYS = [0, 1, 2, 3, 4];   // today + 4 forward days

export const options = {
  scenarios: {
    matching_burst: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 500,
      stages: [
        { duration: '30s', target: 200 },
        { duration: '2m', target: 500 },      // 500 orders/sec
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<800', 'p(99)<2000'],
  },
};

const HEADERS = { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' };

function randOrder() {
  const energy = ENERGY[Math.floor(Math.random() * ENERGY.length)];
  const day = DAYS[Math.floor(Math.random() * DAYS.length)];
  const d = new Date();
  d.setDate(d.getDate() + day);
  return {
    side: Math.random() < 0.5 ? 'buy' : 'sell',
    energy_type: energy,
    delivery_day: d.toISOString().slice(0, 10),
    quantity_mwh: +(Math.random() * 20 + 1).toFixed(2),
    limit_price_zar_mwh: +(800 + Math.random() * 400).toFixed(2),
    tif: 'gtc',
  };
}

export default function () {
  const body = JSON.stringify(randOrder());
  const r = http.post(`${BASE}/api/trading/orders`, body, { headers: HEADERS });
  check(r, {
    'order accepted': (res) => res.status === 200 || res.status === 201,
  });
  sleep(0.05);
}
