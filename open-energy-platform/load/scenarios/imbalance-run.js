// Imbalance settlement — end-of-day run for 48 × 30-min periods across N
// BRPs. Measures the settlement engine's throughput + D1 batch cost.
//
// This scenario isn't VU-heavy; it measures the cost of ONE settlement
// run at scale. 200 BRPs × 48 periods = 9 600 settlement rows per run.
//
// Run:  k6 run load/scenarios/imbalance-run.js
//
// Env:  BASE_URL, JWT (grid_operator role), BRP_COUNT (default 200)

import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:8787';
const JWT = __ENV.JWT;
const BRP_COUNT = Number(__ENV.BRP_COUNT || 200);
if (!JWT) throw new Error('JWT env var required');

export const options = {
  scenarios: {
    imbalance_seed_and_run: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '15m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.001'],
    // The settlement run itself can take a while; seeding is bounded to
    // batches of 500.
    'http_req_duration{op:run}': ['p(95)<30000'],
    'http_req_duration{op:seed}': ['p(95)<3000'],
  },
};

const HEADERS = { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' };

function isoPeriods(dateStr) {
  // 48 × 30-min periods starting at midnight of dateStr (YYYY-MM-DD).
  const out = [];
  for (let i = 0; i < 48; i++) {
    const start = new Date(`${dateStr}T00:00:00Z`);
    start.setUTCMinutes(i * 30);
    const end = new Date(start);
    end.setUTCMinutes(start.getUTCMinutes() + 30);
    out.push({ start: start.toISOString(), end: end.toISOString() });
  }
  return out;
}

export default function () {
  const day = __ENV.DAY || new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const periods = isoPeriods(day);

  // 1. Seed imbalance prices for all 48 periods.
  const prices = periods.map((p) => ({
    period_start: p.start,
    period_end: p.end,
    long_price_zar_mwh: 800 + Math.random() * 200,
    short_price_zar_mwh: 2200 + Math.random() * 400,
    tolerance_mwh: 0.05,
  }));
  const pr = http.post(`${BASE}/api/imbalance/prices`, JSON.stringify({ prices }), {
    headers: HEADERS, tags: { op: 'seed' },
  });
  check(pr, { 'prices seeded': (r) => r.status === 200 });

  // 2. Seed BRP nominations — 500 at a time to stay under D1 batch limits.
  for (let b = 0; b < BRP_COUNT; b++) {
    const brp = `brp_load_${b}`;
    const noms = periods.map((p) => {
      const scheduled = 5 + Math.random() * 20;
      const drift = (Math.random() - 0.5) * 2;   // ±1 MWh
      return {
        brp_participant_id: brp,
        period_start: p.start,
        period_end: p.end,
        scheduled_mwh: +scheduled.toFixed(3),
        actual_mwh: +(scheduled + drift).toFixed(3),
      };
    });
    const nr = http.post(`${BASE}/api/imbalance/nominations`, JSON.stringify({ nominations: noms }), {
      headers: HEADERS, tags: { op: 'seed' },
    });
    check(nr, { 'noms seeded': (r) => r.status === 200 });
  }

  // 3. Execute the settlement run.
  const first = periods[0].start;
  const last = periods[periods.length - 1].end;
  const rr = http.post(`${BASE}/api/imbalance/runs`, JSON.stringify({
    period_from: first,
    period_to: last,
  }), { headers: HEADERS, tags: { op: 'run' }, timeout: '300s' });
  check(rr, {
    'run succeeded': (r) => r.status === 200,
    'run settled rows': (r) => {
      try {
        const data = JSON.parse(r.body).data;
        return data && data.periodsSettled > 0;
      } catch { return false; }
    },
  });
  console.log('imbalance run result:', rr.body);
}
