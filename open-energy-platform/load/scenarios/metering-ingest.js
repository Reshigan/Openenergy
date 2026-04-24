// Metering ingest scenario — 100 VUs continuously pushing 30-min readings
// across 50 simulated sites. This hits the METERING_DB_CURRENT shard when
// bound (falls back to main DB otherwise). Measures sustained write QPS
// against the hot ingest path.
//
// Run:  k6 run load/scenarios/metering-ingest.js
//
// Env:  BASE_URL, INGEST_TOKEN (HMAC secret), CONNECTION_ID

import http from 'k6/http';
import { check } from 'k6';
import crypto from 'k6/crypto';

const BASE = __ENV.BASE_URL || 'http://localhost:8787';
const TOKEN = __ENV.INGEST_TOKEN || '';
const CONNECTION = __ENV.CONNECTION_ID || 'conn_load';
const SITE_COUNT = Number(__ENV.SITE_COUNT || 50);

export const options = {
  scenarios: {
    metering_ingest: {
      executor: 'constant-vus',
      vus: 100,
      duration: '5m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<600', 'p(99)<1500'],
  },
};

function signPayload(body) {
  return crypto.hmac('sha256', TOKEN, body, 'hex');
}

export default function () {
  const siteIdx = Math.floor(Math.random() * SITE_COUNT);
  const periodStart = new Date().toISOString().slice(0, 16) + ':00Z';
  const body = JSON.stringify({
    connection_id: CONNECTION,
    channel_id: `site_${siteIdx}`,
    readings: [{
      period_start: periodStart,
      period_end: periodStart, // real tests use +30min
      mwh: +(Math.random() * 10).toFixed(3),
    }],
  });
  const sig = TOKEN ? signPayload(body) : '';
  const r = http.post(`${BASE}/api/settlement-auto/ingest/push`, body, {
    headers: {
      'Content-Type': 'application/json',
      ...(sig ? { 'X-Ingest-Signature': sig } : {}),
    },
  });
  check(r, {
    'ingest accepted': (res) => res.status === 200 || res.status === 202,
  });
}
