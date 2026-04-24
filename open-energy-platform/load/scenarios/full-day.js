// Composite scenario — all four workloads running concurrently, the way
// the platform sees traffic on a real trading day. Use this as the
// release-gate load test.
//
// Run:  k6 run load/scenarios/full-day.js
//
// Env:  BASE_URL, JWT (admin), INGEST_TOKEN, CONNECTION_ID

import http from 'k6/http';
import { check, sleep } from 'k6';
import crypto from 'k6/crypto';

const BASE = __ENV.BASE_URL || 'http://localhost:8787';
const JWT = __ENV.JWT;
const TOKEN = __ENV.INGEST_TOKEN || '';
const CONNECTION = __ENV.CONNECTION_ID || 'conn_load';
if (!JWT) throw new Error('JWT env var required');

export const options = {
  scenarios: {
    cockpit_read: {
      exec: 'cockpitRead',
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '10m', target: 200 },
        { duration: '30s', target: 0 },
      ],
    },
    metering_ingest: {
      exec: 'meteringIngest',
      executor: 'constant-vus',
      vus: 50,
      duration: '10m',
      startTime: '30s',
    },
    matching_burst: {
      exec: 'matchingBurst',
      executor: 'ramping-arrival-rate',
      startRate: 20,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 300,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '6m', target: 300 },     // peak
        { duration: '1m', target: 0 },
      ],
      startTime: '1m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    'http_req_duration{scenario:cockpit_read}': ['p(95)<800'],
    'http_req_duration{scenario:matching_burst}': ['p(95)<1500'],
    'http_req_duration{scenario:metering_ingest}': ['p(95)<1000'],
  },
};

const AUTH = { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' };

export function cockpitRead() {
  http.get(`${BASE}/api/cockpit/dashboard`, { headers: AUTH });
  http.get(`${BASE}/api/modules`, { headers: AUTH });
  http.get(`${BASE}/api/participants/me`, { headers: AUTH });
  sleep(1 + Math.random());
}

export function meteringIngest() {
  const periodStart = new Date().toISOString().slice(0, 16) + ':00Z';
  const body = JSON.stringify({
    connection_id: CONNECTION,
    channel_id: `site_${Math.floor(Math.random() * 50)}`,
    readings: [{
      period_start: periodStart,
      period_end: periodStart,
      mwh: +(Math.random() * 10).toFixed(3),
    }],
  });
  const sig = TOKEN ? crypto.hmac('sha256', TOKEN, body, 'hex') : '';
  const r = http.post(`${BASE}/api/settlement-auto/ingest/push`, body, {
    headers: { 'Content-Type': 'application/json', ...(sig ? { 'X-Ingest-Signature': sig } : {}) },
  });
  check(r, { 'ingest ok': (res) => res.status === 200 || res.status === 202 });
}

export function matchingBurst() {
  const d = new Date();
  d.setDate(d.getDate() + Math.floor(Math.random() * 5));
  const body = JSON.stringify({
    side: Math.random() < 0.5 ? 'buy' : 'sell',
    energy_type: ['solar', 'wind', 'gas'][Math.floor(Math.random() * 3)],
    delivery_day: d.toISOString().slice(0, 10),
    quantity_mwh: +(Math.random() * 20 + 1).toFixed(2),
    limit_price_zar_mwh: +(800 + Math.random() * 400).toFixed(2),
    tif: 'gtc',
  });
  const r = http.post(`${BASE}/api/trading/orders`, body, { headers: AUTH });
  check(r, { 'order ok': (res) => res.status === 200 || res.status === 201 });
}
