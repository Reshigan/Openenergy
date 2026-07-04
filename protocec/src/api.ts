// Thin client over the real CEC backend. Every call is same-origin (/api/*);
// in dev Vite proxies it, in prod the Cloudflare Worker proxies it — so there
// is never a CORS hop. NL never executes anything here: the Concierge only ever
// calls these exact validated endpoints, the same ones a manual user hits.

const TOKEN_KEY = 'protocec_token';
const NAME_KEY = 'protocec_name';

export const session = {
  token: () => localStorage.getItem(TOKEN_KEY),
  name: () => localStorage.getItem(NAME_KEY),
  set: (token: string, name: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(NAME_KEY, name);
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NAME_KEY);
  },
};

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = session.token();
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  let json: any = {};
  try {
    json = await res.json();
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `Request failed (${res.status})`);
  }
  return json.data as T;
}

// ---- response shapes (from the real handlers) ----

export interface BillProfile {
  annual_kwh?: number;
  peak_pct?: number;
  standard_pct?: number;
  offpeak_pct?: number;
  avg_tariff_zar_per_kwh?: number;
  demand_charge_zar_per_kva?: number;
  tou_risk?: 'low' | 'medium' | 'high';
}
export interface Bill {
  id: string;
  created_at: string;
  meta?: { site?: string; period?: string } | null;
  profile?: BillProfile;
}
export interface MixItem {
  project_id: string;
  project_name: string;
  share_pct: number;
  mwh_per_year: number;
  blended_price: number;
  rationale?: string;
}
export interface OptimizeResult {
  text?: string;
  structured: {
    mix: MixItem[];
    savings_pct: number;
    carbon_tco2e: number;
    warnings?: string[];
  };
  projects?: Array<{ id: string; project_name: string; technology?: string; capacity_mw?: number }>;
}
export interface LoiDraft {
  loi_id: string;
  project_id: string;
  project_name: string;
  body_md: string;
  fallback?: boolean;
}

export const api = {
  login: (email: string, password: string) =>
    req<{ token: string; participant: { name: string; role: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  getBills: () => req<Bill[]>('/ai/offtaker/bills'),
  analyseBill: () =>
    req<{ bill_id: string; structured: BillProfile }>('/ai/offtaker/bills', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  optimize: (bill_id: string) =>
    req<OptimizeResult>('/ai/offtaker/optimize', {
      method: 'POST',
      body: JSON.stringify({ bill_id, horizon_years: 15 }),
    }),
  loi: (mix: Array<Pick<MixItem, 'project_id' | 'share_pct' | 'mwh_per_year' | 'blended_price'>>, notes: string) =>
    req<{ drafts: LoiDraft[] }>('/ai/offtaker/loi', {
      method: 'POST',
      body: JSON.stringify({ mix, horizon_years: 15, notes }),
    }),
};
