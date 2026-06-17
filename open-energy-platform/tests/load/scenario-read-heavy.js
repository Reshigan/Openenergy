// ════════════════════════════════════════════════════════════════════════
// Read-heavy — 200 dashboard viewers, ~20,000 GETs/min.
//
// Models regulators + offtakers browsing dashboards during business hours.
// Pure read load — no writes. Each VU rotates through the most-hit
// listing endpoints in the SPA: cockpit KPIs, my orders, my invoices,
// participants, projects, carbon retirements, watershed rollup.
// ════════════════════════════════════════════════════════════════════════

import http from 'k6/http';
import { sleep, check } from 'k6';
import { BASE, mintTokenBundle, authHeaders, tokenForVU, PERSONAS } from './lib/login.js';

export const options = {
  scenarios: {
    read_heavy: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '3m',  target: 200 },
        { duration: '10m', target: 200 },
        { duration: '2m',  target: 0   },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'http_req_failed':       ['rate<0.01'],
    'http_req_duration':     ['p(95)<500', 'p(99)<1000'],
  },
};

const ENDPOINTS = [
  '/api/cockpit/kpis',
  '/api/launch/me',
  '/api/trading/orders',
  '/api/trading/orderbook?energy_type=solar',
  '/api/trading/orderbook?energy_type=wind',
  '/api/settlement/invoices',
  '/api/participants',
  '/api/projects/',
  '/api/carbon/retirements',
  '/api/watershed/portfolio-summary',
  '/api/esg/portfolio',
  '/api/contracts',
  '/api/marketplace/summary',
];

export function setup() {
  // 7 logins once, not one per VU (200 VUs would obliterate the auth limiter).
  return { tokens: mintTokenBundle(PERSONAS) };
}

export default function (data) {
  const headers = authHeaders(tokenForVU(data.tokens, __VU));
  const path = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
  const r = http.get(`${BASE}${path}`, { headers, tags: { name: path.replace(/[^a-z]/gi, '_').slice(0, 40) } });
  check(r, {
    '2xx or expected 403': (resp) =>
      (resp.status >= 200 && resp.status < 300) || resp.status === 403,
  });
  sleep(0.3 + Math.random() * 0.7); // 0.3–1 s think time
}
