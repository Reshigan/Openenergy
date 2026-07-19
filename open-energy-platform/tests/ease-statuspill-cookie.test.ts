// Vitest for the P2/P3 ease-sweep fixes: StatusPill phrasing + the oe_session_present
// cookie flag that gates the mount-time /auth/refresh (prevents the cold-load 400).
// Backend vitest runner is node-only, so we stub document/localStorage for the
// cookie path; statusLabel is pure TS and needs no stub.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { statusLabel, statusTone } from '../pages/src/shared/ease/statusLabel';

// pages/src/lib/api.ts imports axios at module load (axios.create + interceptors).
// axios is a pages/ dependency, not installed in the backend (open-energy-platform)
// test runner, so the dynamic import below can't resolve the real package in CI
// (it only resolves locally by node_modules hoisting). This test exercises only
// setAuthToken's cookie path — no real HTTP — so stub axios with the minimal
// surface api.ts touches at import time.
vi.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: () => {} }, response: { use: () => {} } },
    get: async () => ({ data: {} }),
    post: async () => ({ data: {} }),
  };
  const axiosMock: any = {
    create: () => instance,
    post: async () => ({ data: {} }),
    AxiosHeaders: class {},
  };
  return { default: axiosMock, AxiosError: class extends Error {}, AxiosHeaders: class {} };
});

// Stub the browser globals setAuthToken touches. We deliberately use a
// fake Document so we can assert cookie set/clear without a jsdom dependency.
function makeStubDoc() {
  let jar = '';
  return {
    get cookie() { return jar; },
    set cookie(v: string) {
      // Keep only the name=value prefix for assertion simplicity.
      if (/max-age=0/.test(v) || /oe_session_present=;/.test(v)) {
        jar = jar.replace(/oe_session_present=[^;]*;?\s*/g, '');
        return;
      }
      if (v.startsWith('oe_session_present=')) {
        jar = jar.replace(/oe_session_present=[^;]*;?\s*/g, '');
        jar = (jar ? jar + '; ' : '') + v.split(';')[0];
      }
    },
  } as any;
}

describe('statusLabel — curated phrasing for adopted surfaces', () => {
  it('sentence-cases snake_case stems so they no longer SHOUT or leak jargon', () => {
    // TradesSurface status, GtiaSurface chain_status, SitesPortfolioSurface chain_status
    expect(statusLabel('in_om').text).toBe('In O&M');
    expect(statusLabel('settled').text).toBe('Settled');
    expect(statusLabel('failed').text).toBe('Failed');
    // SurveillanceSurface decision, EnforcementSurface event_type, TenantSurface event_type
    expect(statusLabel('false_positive').text).toBe('False positive');
    expect(statusLabel('finding_issued').text).toBe('Finding issued');
    expect(statusLabel('kyc_approved').text).toBe('KYC approved');
    expect(statusLabel('escalate_to_enforcement').text).toBe('Escalate to enforcement');
    // CurtailmentSurface event_type
    expect(statusLabel('curtailment_issued').text).toBe('Curtailment issued');
    // VintagesSurface current_stage
    expect(statusLabel('retired_full').text).toBe('Retired full');
  });

  it('derives a tone so breaches read oxide and settled reads good', () => {
    expect(statusTone('sla_breached')).toBe('oxide');
    expect(statusTone('settled')).toBe('good');
    expect(statusTone('pending_review')).toBe('warn');
  });

  it('returns an em-dash for empty status (StatusPill fallback path)', () => {
    expect(statusLabel('').text).toBe('—');
    expect(statusLabel(null).text).toBe('—');
    expect(statusLabel(undefined).text).toBe('—');
  });
});

describe('setAuthToken — oe_session_present flag cookie', () => {
  let originalDocument: any;
  let originalLocalStorage: any;

  beforeEach(() => {
    originalDocument = (globalThis as any).document;
    originalLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).document = makeStubDoc();
    (globalThis as any).localStorage = {
      _store: {} as Record<string, string>,
      getItem(k: string) { return this._store[k] ?? null; },
      setItem(k: string, v: string) { this._store[k] = v; },
      removeItem(k: string) { delete this._store[k]; },
    };
  });

  afterEach(() => {
    (globalThis as any).document = originalDocument;
    (globalThis as any).localStorage = originalLocalStorage;
    // Reset the api module's in-memory token between imports is unnecessary —
    // each test re-imports fresh via the dynamic import below.
  });

  it('sets oe_session_present=true when a token is stored (login / refresh success)', async () => {
    const { setAuthToken } = await import('../pages/src/lib/api');
    setAuthToken('jwt-abc');
    expect((globalThis as any).document.cookie).toContain('oe_session_present=true');
  });

  it('clears oe_session_present when the token is nulled (logout)', async () => {
    const { setAuthToken } = await import('../pages/src/lib/api');
    setAuthToken('jwt-abc');
    expect((globalThis as any).document.cookie).toContain('oe_session_present=true');
    setAuthToken(null);
    expect((globalThis as any).document.cookie).not.toContain('oe_session_present=true');
  });
});