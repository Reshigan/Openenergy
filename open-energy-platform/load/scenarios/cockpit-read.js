// Cockpit read scenario — 200 VUs hitting authenticated dashboard endpoints
// at national-peak concurrency. Exercises KV-cached auth middleware (expect
// 0 D1 auth reads after warmup) and the reference-table caches.
//
// Run:  k6 run load/scenarios/cockpit-read.js
//
// Env:  BASE_URL, JWT (admin token)

import http from 'k6/http';
import { check, sleep, group } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:8787';
const JWT = __ENV.JWT;
if (!JWT) throw new Error('JWT env var required');

export const options = {
  scenarios: {
    cockpit_read: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '60s', target: 200 },
        { duration: '2m', target: 200 },   // steady state
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],         // <0.5% errors
    http_req_duration: ['p(95)<500', 'p(99)<1200'],
    'http_req_duration{endpoint:modules}': ['p(95)<200'],    // cached
    'http_req_duration{endpoint:dashboard}': ['p(95)<500'],
  },
};

const HEADERS = { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' };

export default function () {
  group('cockpit read', () => {
    // Landing — cockpit.
    const a = http.get(`${BASE}/api/cockpit/dashboard`, {
      headers: HEADERS, tags: { endpoint: 'dashboard' },
    });
    check(a, { 'dashboard 200': (r) => r.status === 200 });

    // Modules list (fully KV-cached after PR-National-11).
    const b = http.get(`${BASE}/api/modules`, {
      headers: HEADERS, tags: { endpoint: 'modules' },
    });
    check(b, { 'modules 200': (r) => r.status === 200 });

    // Participant profile.
    const c = http.get(`${BASE}/api/participants/me`, {
      headers: HEADERS, tags: { endpoint: 'profile' },
    });
    check(c, { 'profile 200': (r) => r.status === 200 });

    // Contract list (paginated).
    const d = http.get(`${BASE}/api/contracts?page=1&pageSize=20`, {
      headers: HEADERS, tags: { endpoint: 'contracts' },
    });
    check(d, { 'contracts 200': (r) => r.status === 200 });
  });
  sleep(Math.random() * 2);
}
