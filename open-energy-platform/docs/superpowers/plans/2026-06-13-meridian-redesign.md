# Meridian Full-Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace tab-based workstations (WorkstationShell + 103 ChainTabs) with four registry-driven Meridian surfaces (Horizon, Atlas, Ledger [new], Thread), migrating chains one vertical slice at a time behind a route flag.

**Architecture:** `chain-registry-meridian.ts` is the single contract. It gains action-field schemas, per-chain filters, KPIs, and initiation specs. A new generic `GET /api/ledger/:chainKey` route (mirroring `horizon.ts` SQL-identifier security) feeds a generic `LedgerPage`. Thread renders action forms from the same field schemas. Chains migrate one at a time; each ChainTab is deleted only after its chain renders end-to-end on Ledger+Thread. WorkstationShell/FioriShell deleted at final cutover.

**Tech Stack:** Cloudflare Worker + Hono + sharded D1 (backend, vitest-tested); React SPA with plain fetch + useState (no react-query, **no SPA unit-test runner** — verified by `npm run check:pages` + Playwright); OKLch tokens, per-role accent hues.

**Security invariant (load-bearing):** table/column/status values reach SQL as identifiers. They MUST be static literals in `chain-registry-meridian.ts`, never request-derived. `:chainKey` is resolved via `getChain()` → 404 if unknown, so it never reaches SQL. Filter `?status=` is resolved against the descriptor's static `filters[].statuses` arrays and bound as parameters.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/chain-registry-meridian.ts` | Single contract: descriptors + new ActionFieldSpec/ChainInitiation/filters/kpis. |
| `src/routes/ledger.ts` | NEW — `GET /:chainKey` generic per-chain list + KPI + filter endpoint. |
| `src/routes/mount-routes.ts` | Mount `/api/ledger`. |
| `pages/src/meridian/lib.ts` | `LedgerData`/`LedgerRow` types + `fetchLedger`. |
| `pages/src/meridian/FieldForm.tsx` | NEW — shared `ActionFieldSpec[]` renderer (Thread actions + Ledger +New). |
| `pages/src/meridian/LedgerPage.tsx` | NEW — KPI strip + filter pills + card list + +New drawer. |
| `pages/src/meridian/MeridianHeader.tsx` | NEW — chrome extracted from HorizonPage, shared by all surfaces. |
| `pages/src/meridian/MeridianFrame.tsx` | NEW — wraps secondary routes (header + token theme). |
| `pages/src/meridian/ThreadPage.tsx` | act() opens FieldForm when action has `fields`. |
| `pages/src/meridian/AtlasPage.tsx` | Repoint function rows → `/ledger/:chainKey`. |
| `pages/src/App.tsx` | Mount Ledger route; (cutover) wrap secondary routes in MeridianFrame, retire FioriShell. |
| `pages/src/components/launch/chains/**/*ChainTab.tsx` | DELETE per-chain after slice verifies. |
| `pages/src/components/launch/WorkstationShell.tsx` | DELETE at final cutover. |

---

## PHASE A — Foundation (registry + ledger route)

### Task 1: Registry type extensions

**Files:**
- Modify: `src/utils/chain-registry-meridian.ts` (interfaces near top, lines 1–80)
- Test: `tests/chain-registry-meridian.test.ts`

- [ ] **Step 1: Write failing test** — `tests/chain-registry-meridian.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { MERIDIAN_CHAINS, getChain } from '../src/utils/chain-registry-meridian';

describe('registry schema extensions', () => {
  it('getChain resolves a known key and returns undefined for unknown', () => {
    expect(getChain('covenant_certificate')?.wave).toBe(38);
    expect(getChain('__nope__')).toBeUndefined();
  });

  it('any filters/kpis/initiation present are well-formed and reference known statuses', () => {
    for (const d of MERIDIAN_CHAINS) {
      const known = new Set([...d.terminal]); // terminal known; live statuses validated per-chain below
      for (const f of d.filters ?? []) {
        expect(typeof f.key).toBe('string');
        expect(Array.isArray(f.statuses)).toBe(true);
        expect(f.statuses.length).toBeGreaterThan(0);
      }
      for (const k of d.kpis ?? []) {
        expect(['count', 'count_breached', 'sum_quantum']).toContain(k.compute);
      }
      if (d.initiation) {
        expect(d.initiation.path.startsWith('/api/')).toBe(true);
        expect(Array.isArray(d.initiation.fields)).toBe(true);
      }
      for (const a of d.actions) {
        for (const fld of a.fields ?? []) {
          expect(['number','string','date','enum','boolean','evidence']).toContain(fld.type);
          if (fld.type === 'enum') expect((fld.options ?? []).length).toBeGreaterThan(0);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run, verify it fails** — `npx vitest run tests/chain-registry-meridian.test.ts`
  Expected: FAIL (`filters`/`kpis`/`fields` not on type → TS compile error in test, or property undefined).

- [ ] **Step 3: Add the types** — in `src/utils/chain-registry-meridian.ts`, before `ChainActionHint`:

```ts
export interface ActionFieldSpec {
  key: string;
  label: string;
  type: 'number' | 'string' | 'date' | 'enum' | 'boolean' | 'evidence';
  required?: boolean;
  unit?: string;
  options?: string[];      // type 'enum'
  placeholder?: string;
  defaultFrom?: string;    // prefill from a case raw-record column
}

export interface ChainInitiation {
  label: string;
  path: string;            // POST endpoint, must start with /api/
  fields: ActionFieldSpec[];
}

export interface ChainFilterSpec { key: string; label: string; statuses: string[]; }
export interface ChainKpiSpec { key: string; label: string; compute: 'count' | 'count_breached' | 'sum_quantum'; }
```

  Then extend the existing interfaces:

```ts
// in ChainActionHint, add:
  fields?: ActionFieldSpec[];

// in ChainDescriptor, add:
  initiation?: ChainInitiation | null;
  filters?: ChainFilterSpec[];
  kpis?: ChainKpiSpec[];
```

- [ ] **Step 4: Run, verify it passes** — `npx vitest run tests/chain-registry-meridian.test.ts`
  Expected: PASS. Then `npm run check` — zero errors (new optional fields don't break existing descriptors).

- [ ] **Step 5: Commit**

```bash
git add src/utils/chain-registry-meridian.ts tests/chain-registry-meridian.test.ts
git commit -m "feat(meridian): registry action-field/initiation/filter/kpi schema types"
```

---

### Task 2: Author covenant_certificate (W38) schema — the worked slice

**Files:**
- Modify: `src/utils/chain-registry-meridian.ts` (the `covenant_certificate` descriptor)
- Test: `tests/chain-registry-meridian.test.ts` (add a covenant-specific assertion)

Valid `covenant_certificate` statuses (from `covenant-certificate-chain.ts`): `certificate_due, certificate_submitted, under_review, ratios_verified, compliant, breach_identified, waiver_requested, waiver_granted, cure_period, cured, accelerated`. Terminal: `compliant, waiver_granted, cured, accelerated`. ACTIVE_BREACH: `breach_identified, waiver_requested, cure_period`.

- [ ] **Step 1: Add failing assertion** to the test:

```ts
it('covenant_certificate has filters, kpis, and breach action fields', () => {
  const d = getChain('covenant_certificate')!;
  expect(d.filters?.map(f => f.key)).toContain('active_breach');
  expect(d.kpis?.some(k => k.compute === 'sum_quantum')).toBe(true);
  const flag = d.actions.find(a => a.action === 'flag-breach')!;
  expect(flag.fields?.find(f => f.key === 'reason_code')?.type).toBe('enum');
  // every filter status is a real covenant status
  const KNOWN = new Set(['certificate_due','certificate_submitted','under_review','ratios_verified',
    'compliant','breach_identified','waiver_requested','waiver_granted','cure_period','cured','accelerated']);
  for (const f of d.filters ?? []) for (const s of f.statuses) expect(KNOWN.has(s)).toBe(true);
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run tests/chain-registry-meridian.test.ts` → FAIL.

- [ ] **Step 3: Edit the covenant_certificate descriptor** — add after `actions: [...]`:

```ts
    filters: [
      { key: 'active_breach', label: 'Active breach', statuses: ['breach_identified', 'waiver_requested', 'cure_period'] },
      { key: 'under_review', label: 'Under review', statuses: ['under_review', 'ratios_verified'] },
      { key: 'awaiting', label: 'Awaiting submission', statuses: ['certificate_due', 'certificate_submitted'] },
      { key: 'resolved', label: 'Resolved', statuses: ['compliant', 'waiver_granted', 'cured', 'accelerated'] },
    ],
    kpis: [
      { key: 'total', label: 'Certificates', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'exposure', label: 'Outstanding', compute: 'sum_quantum' },
    ],
    initiation: null, // covenant certs enter via borrower submit-certificate flow, not a generic +New
```

  And add `fields` to the `flag-breach` action:

```ts
      { action: 'flag-breach', label: 'Declare breach',
        path: '/api/covenant-certificate/chain/:id/flag-breach',
        roles: ['admin', 'support', 'lender'], tone: 'oxide',
        cascadeHint: 'Notifies borrower (IPP), opens cure window, adds facility to watchlist (W6).',
        fields: [
          { key: 'reason_code', label: 'Breach type', type: 'enum', required: true,
            options: ['dscr_breach', 'llcr_breach', 'gearing_breach', 'reporting_failure'] },
          { key: 'breached_covenants', label: 'Breached covenants', type: 'string', required: true,
            placeholder: 'e.g. DSCR < 1.20x for Q2' },
          { key: 'breach_basis', label: 'Evidence / basis', type: 'evidence', required: true },
        ] },
```

  (Optionally add a `reason_code` string field to `begin-review` if its handler reads one; keep minimal — only `flag-breach` for the slice.)

- [ ] **Step 4: Run, verify pass** — `npx vitest run tests/chain-registry-meridian.test.ts` → PASS. `npm run check` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/utils/chain-registry-meridian.ts tests/chain-registry-meridian.test.ts
git commit -m "feat(meridian): covenant_certificate filters/kpis/flag-breach field schema"
```

---

### Task 3: `GET /api/ledger/:chainKey` route

**Files:**
- Create: `src/routes/ledger.ts`
- Test: `tests/ledger-route.test.ts`

Mirror `horizon.ts`: `assembleLedger(chain, rows, role, now)` pure function (unit-tested), thin handler. Reuse the row→case mapping shape from `assembleHorizon`.

- [ ] **Step 1: Write failing test** — `tests/ledger-route.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { assembleLedger } from '../src/routes/ledger';
import { getChain } from '../src/utils/chain-registry-meridian';

const chain = getChain('covenant_certificate')!;
const now = Date.parse('2026-06-13T00:00:00Z');
const rows = [
  { id: 'c1', certificate_number: 'CC-1', facility_name: 'Mthatha', chain_status: 'breach_identified',
    sla_deadline_at: '2026-06-12T00:00:00Z', outstanding_principal_zar_m: 100, borrower_party_name: 'IPP A' },
  { id: 'c2', certificate_number: 'CC-2', facility_name: 'Karoo', chain_status: 'compliant',
    sla_deadline_at: '2026-07-01T00:00:00Z', outstanding_principal_zar_m: 50, borrower_party_name: 'IPP B' },
];

describe('assembleLedger', () => {
  it('maps rows and computes kpis (count / count_breached / sum_quantum)', () => {
    const out = assembleLedger(chain, rows, 'lender', now);
    expect(out.rows).toHaveLength(2);
    expect(out.chain.key).toBe('covenant_certificate');
    const kpi = Object.fromEntries(out.kpis.map(k => [k.key, k.value]));
    expect(kpi.total).toBe(2);
    expect(kpi.breached).toBe(1);          // CC-1 deadline in past → breached bucket
    expect(kpi.exposure).toBe(150_000_000); // (100+50) _zar_m × 1e6
  });
  it('row links carry chainKey + id and a viewer-filtered action set', () => {
    const out = assembleLedger(chain, rows, 'lender', now);
    expect(out.rows[0].id).toBe('c1');
    expect(out.rows[0].actions.some(a => a.action === 'flag-breach')).toBe(true);
    const reg = assembleLedger(chain, rows, 'regulator', now);
    expect(reg.rows[0].actions.some(a => a.action === 'flag-breach')).toBe(false); // regulator not in roles
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run tests/ledger-route.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/routes/ledger.ts`

```ts
// ═══════════════════════════════════════════════════════════════════════════
// Meridian — GET /api/ledger/:chainKey
// Generic per-chain list: KPI strip + filter pills + card rows for one chain.
// Table/column/status values come exclusively from the static MERIDIAN_CHAINS
// literal (resolved via getChain). :chainKey 404s if unknown so it never
// reaches SQL as an identifier. ?status= is matched against the descriptor's
// static filters[].statuses and bound as parameters.
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import {
  getChain, bucketFor, attentionScore, quantumZar, type ChainDescriptor,
} from '../utils/chain-registry-meridian';

export interface LedgerRow {
  id: string; ref: string; title: string; status: string;
  deadline_at: string | null; bucket: string; quantum_zar: number | null;
  counterparty: string | null; score: number;
  actions: { action: string; label: string; path: string; cascadeHint: string; tone?: string; fields?: unknown[] }[];
}

function viewerCanSee(chain: ChainDescriptor, role: string): boolean {
  if (role === 'admin') return true;
  if (chain.lanes[role]) return true;
  return chain.actions.some(a => a.roles.includes(role));
}

export function assembleLedger(chain: ChainDescriptor, rows: Record<string, unknown>[], role: string, now: number) {
  const mapped: LedgerRow[] = rows.map(r => {
    const deadline = (r[chain.deadlineCol] as string | null) ?? null;
    const zar = quantumZar(chain, r);
    return {
      id: String(r.id ?? r[chain.refCol]),
      ref: String(r[chain.refCol] ?? r.id),
      title: chain.titleCol ? String(r[chain.titleCol] ?? chain.title) : chain.title,
      status: String(r[chain.statusCol] ?? ''),
      deadline_at: deadline, bucket: bucketFor(deadline, now), quantum_zar: zar,
      counterparty: chain.counterpartyCol ? (String(r[chain.counterpartyCol] ?? '') || null) : null,
      score: attentionScore(zar, deadline, now),
      actions: chain.actions.filter(a => a.roles.includes(role)).map(({ roles: _r, ...a }) => a),
    };
  });
  const kpis = (chain.kpis ?? []).map(k => ({
    key: k.key, label: k.label,
    value: k.compute === 'count' ? mapped.length
      : k.compute === 'count_breached' ? mapped.filter(m => m.bucket === 'breached').length
      : mapped.reduce((s, m) => s + (m.quantum_zar ?? 0), 0),
  }));
  return {
    chain: { key: chain.key, wave: chain.wave, title: chain.title },
    filters: chain.filters ?? [],
    initiation: chain.initiation ?? null,
    kpis,
    rows: mapped.sort((a, b) => b.score - a.score),
  };
}

const ledger = new Hono<HonoEnv>();
ledger.use('*', authMiddleware);

ledger.get('/:chainKey', async (c) => {
  const chain = getChain(c.req.param('chainKey'));
  if (!chain) return c.json({ success: false, error: 'unknown chain' }, 404);
  const user = getCurrentUser(c);
  if (!viewerCanSee(chain, user.role)) return c.json({ success: false, error: 'forbidden' }, 403);

  // Resolve ?status= against the descriptor's static filter statuses ONLY.
  const filterKey = c.req.query('status');
  const filter = (chain.filters ?? []).find(f => f.key === filterKey);
  let sql = `SELECT * FROM ${chain.table}`;
  const binds: unknown[] = [];
  if (filter) {
    sql += ` WHERE ${chain.statusCol} IN (${filter.statuses.map(() => '?').join(',')})`;
    binds.push(...filter.statuses);
  }
  sql += ` ORDER BY (${chain.deadlineCol} IS NULL), ${chain.deadlineCol} ASC LIMIT 200`;
  const res = await c.env.DB.prepare(sql).bind(...binds).all();
  const rows = (res.results ?? []) as Record<string, unknown>[];
  return c.json({ success: true, data: assembleLedger(chain, rows, user.role, Date.now()) });
});

export default ledger;
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run tests/ledger-route.test.ts` → PASS. `npm run check` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/ledger.ts tests/ledger-route.test.ts
git commit -m "feat(meridian): generic GET /api/ledger/:chainKey route + assembleLedger"
```

---

### Task 4: Mount the ledger route

**Files:**
- Modify: `src/routes/mount-routes.ts` (import near line 354; mount near line 732)

- [ ] **Step 1: Add import** after `import threadRoutes from './thread';` (line 355):

```ts
import ledgerRoutes from './ledger';
```

- [ ] **Step 2: Mount** after `app.route('/api/thread', threadRoutes);` (line 734):

```ts
  // Meridian — generic per-chain list (KPI + filters + rows) over chain registry.
  app.route('/api/ledger', ledgerRoutes);
```

- [ ] **Step 3: Type-check** — `npm run check` → 0 errors.

- [ ] **Step 4: Smoke locally** — `npm run dev` then in another shell:

```bash
TOKEN=$(bash scripts/_login.sh lender@openenergy.co.za)  # uses login_or_cached
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8787/api/ledger/covenant_certificate | head -c 400
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" http://localhost:8787/api/ledger/__nope__  # expect 404
```
  Expected: first returns `{"success":true,"data":{...}}`; second prints `404`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/mount-routes.ts
git commit -m "feat(meridian): mount /api/ledger"
```

---

## PHASE B — Surface shells (SPA, verified by check:pages + Playwright)

### Task 5: lib.ts ledger types + fetcher

**Files:**
- Modify: `pages/src/meridian/lib.ts`

- [ ] **Step 1: Add types + fetcher** (mirror existing `fetchHorizon`/`MerAction`):

```ts
export interface LedgerActionField {
  key: string; label: string;
  type: 'number' | 'string' | 'date' | 'enum' | 'boolean' | 'evidence';
  required?: boolean; unit?: string; options?: string[]; placeholder?: string; defaultFrom?: string;
}
export interface LedgerRow {
  id: string; ref: string; title: string; status: string;
  deadline_at: string | null; bucket: string; quantum_zar: number | null;
  counterparty: string | null; score: number;
  actions: (MerAction & { fields?: LedgerActionField[] })[];
}
export interface LedgerData {
  chain: { key: string; wave: number; title: string };
  filters: { key: string; label: string; statuses: string[] }[];
  initiation: { label: string; path: string; fields: LedgerActionField[] } | null;
  kpis: { key: string; label: string; value: number }[];
  rows: LedgerRow[];
}

export async function fetchLedger(chainKey: string, status?: string): Promise<LedgerData> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const r = await api<{ success: boolean; data: LedgerData }>(`/ledger/${chainKey}${q}`);
  return r.data;
}
```
  (Match the exact `api<>()` helper signature already used by `fetchHorizon` in this file — adapt if it differs.)

- [ ] **Step 2: Add `fields?` to `MerAction`** if not present:

```ts
export interface MerAction { action: string; label: string; path: string; cascadeHint: string; tone?: string; fields?: LedgerActionField[]; }
```

- [ ] **Step 3: Type-check** — `cd pages && npm run check:pages` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add pages/src/meridian/lib.ts
git commit -m "feat(meridian): LedgerData/LedgerRow types + fetchLedger"
```

### Task 6: FieldForm — shared ActionFieldSpec renderer

**Files:**
- Create: `pages/src/meridian/FieldForm.tsx`

- [ ] **Step 1: Implement** a controlled form driven by `LedgerActionField[]`:

```tsx
import { useState } from 'react';
import type { LedgerActionField } from './lib';

export function FieldForm({ fields, prefill, onSubmit, onCancel, submitLabel }: {
  fields: LedgerActionField[];
  prefill?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const init: Record<string, unknown> = {};
  for (const f of fields) init[f.key] = f.defaultFrom && prefill ? prefill[f.defaultFrom] ?? '' : (f.type === 'boolean' ? false : '');
  const [v, setV] = useState(init);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string, val: unknown) => setV(s => ({ ...s, [k]: val }));
  const submit = async () => {
    for (const f of fields) if (f.required && (v[f.key] === '' || v[f.key] == null)) { setErr(`${f.label} is required`); return; }
    setErr(null); setBusy(true);
    try { await onSubmit(v); } catch (e) { setErr(String((e as Error).message || e)); setBusy(false); }
  };

  return (
    <div className="field-form">
      {fields.map(f => (
        <label key={f.key} className="ff-row">
          <span>{f.label}{f.required ? ' *' : ''}{f.unit ? ` (${f.unit})` : ''}</span>
          {f.type === 'enum' ? (
            <select value={String(v[f.key] ?? '')} onChange={e => set(f.key, e.target.value)}>
              <option value="">—</option>
              {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : f.type === 'boolean' ? (
            <input type="checkbox" checked={!!v[f.key]} onChange={e => set(f.key, e.target.checked)} />
          ) : f.type === 'evidence' ? (
            <textarea value={String(v[f.key] ?? '')} placeholder={f.placeholder} onChange={e => set(f.key, e.target.value)} />
          ) : (
            <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
              value={String(v[f.key] ?? '')} placeholder={f.placeholder}
              onChange={e => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)} />
          )}
        </label>
      ))}
      {err && <p className="ff-err" role="alert">{err}</p>}
      <div className="ff-actions">
        <button onClick={onCancel} disabled={busy}>Cancel</button>
        <button onClick={submit} disabled={busy} className="primary">{busy ? '…' : submitLabel}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check** — `cd pages && npm run check:pages` → 0 errors.

- [ ] **Step 3: Commit** — `git add pages/src/meridian/FieldForm.tsx && git commit -m "feat(meridian): shared FieldForm ActionFieldSpec renderer"`

### Task 7: LedgerPage

**Files:**
- Create: `pages/src/meridian/LedgerPage.tsx`

- [ ] **Step 1: Implement** — route `/ledger/:chainKey`, reads `fetchLedger`, renders KPI strip + filter pills (drive `?status=`) + card list (row → `/thread/:chainKey/:id`) + "+ New" button (iff `data.initiation`) opening a `FieldForm` drawer POSTing to `initiation.path`. Use `MeridianHeader` (Task 8) for chrome, `fmtZar`/`fuseFraction` from lib. Pattern-match HorizonPage's fetch/refresh/`act()` style (60s not needed here; refetch on filter change + after +New submit). On empty rows, show composed empty state with +New if initiation exists.

- [ ] **Step 2: Type-check** — `cd pages && npm run check:pages` → 0 errors.

- [ ] **Step 3: Commit** — `git add pages/src/meridian/LedgerPage.tsx && git commit -m "feat(meridian): LedgerPage (KPI strip + filters + rows + initiation drawer)"`

### Task 8: MeridianHeader extraction

**Files:**
- Create: `pages/src/meridian/MeridianHeader.tsx`
- Modify: `pages/src/meridian/HorizonPage.tsx` (use the extracted component)

- [ ] **Step 1: Extract** the `<header>` block from HorizonPage (wordmark + quicklinks + clock + ⌘K Atlas link + avatar) into `MeridianHeader.tsx` as `<MeridianHeader role={role} />`. Keep the live clock + admin role-switcher props as inputs.
- [ ] **Step 2: Replace** the inline header in HorizonPage with `<MeridianHeader .../>`. Behaviour unchanged.
- [ ] **Step 3: Type-check** — `cd pages && npm run check:pages` → 0 errors.
- [ ] **Step 4: Commit** — `git commit -am "refactor(meridian): extract shared MeridianHeader"`

### Task 9: Thread action forms

**Files:**
- Modify: `pages/src/meridian/ThreadPage.tsx`

- [ ] **Step 1: Change `act()`** — when the clicked action has `a.fields?.length`, open a `FieldForm` drawer (prefill from the case raw record via `defaultFrom`); on submit POST the collected object to `a.path.replace('/api','').replace(':id',id)`. When no fields, POST `{}` as today. On POST error, surface inline in the drawer (FieldForm already does via thrown error).
- [ ] **Step 2: Type-check** — `cd pages && npm run check:pages` → 0 errors.
- [ ] **Step 3: Commit** — `git commit -am "feat(meridian): Thread renders schema-driven action forms"`

### Task 10: Atlas repoint + App route mount

**Files:**
- Modify: `pages/src/meridian/AtlasPage.tsx`, `pages/src/App.tsx`

- [ ] **Step 1: Repoint** Atlas function rows from `${cfg.workstationPath}?tab=${f.key}` → `/ledger/${f.chainKey}` (the row already carries the chain key used for live counts; use it).
- [ ] **Step 2: Mount** the Ledger route in App.tsx alongside existing Meridian routes: `<Route path="/ledger/:chainKey" element={<LedgerPage/>} />` (lazy, matching how Horizon/Thread/Atlas are mounted). Leave legacy workstation routes intact (coexist behind the flag).
- [ ] **Step 3: Type-check** — `cd pages && npm run check:pages` → 0 errors.
- [ ] **Step 4: Commit** — `git commit -am "feat(meridian): Atlas → Ledger deep links + mount /ledger route"`

---

## PHASE C — Verify the covenant_certificate slice end-to-end

### Task 11: Browser proof + full type-check + unit suite

**Files:**
- Create: `tests/browser/meridian-ledger.spec.ts`

- [ ] **Step 1: Write Playwright spec** — seed a `covenant_certificate` case in `breach_identified` via API (login lender once, seed token via `page.addInitScript(localStorage.setItem('token', ...))` per the rate-limiter rule), then:
  - visit `/ledger/covenant_certificate` → assert KPI strip renders (`Outstanding`), at least one row card visible.
  - click `active_breach` filter pill → assert row list updates.
  - click a row → URL `/thread/covenant_certificate/<id>`.
  - the case has no `flag-breach` available from `breach_identified` (already breached); instead seed an `under_review` case and assert clicking **Declare breach** opens FieldForm with a `reason_code` select; choose `dscr_breach`, fill required fields, submit → assert status chip transitions and a new event appears in the state rail.
  Wait on content selectors (not bare `main`); seed any empty endpoint before asserting (video-smoothness memory).

- [ ] **Step 2: Run** — `npm run check && npm run check:pages && npx vitest run` (all green) then `BASE=http://localhost:8787 npm run test:browser -- meridian-ledger`.
  Expected: green. If the chain route rejects the action body shape, fix the field `key`s to match the handler (`reason_code`, `breached_covenants`, `breach_basis`).

- [ ] **Step 3: Commit** — `git add tests/browser/meridian-ledger.spec.ts && git commit -m "test(meridian): covenant_certificate Ledger→Thread→action e2e"`

**Slice gate:** covenant_certificate now renders fully on Ledger + Thread with a schema-driven action. Its `CovenantCertificateChainTab` may now be deleted (Task 12).

### Task 12: Delete the covenant ChainTab

**Files:**
- Delete: `pages/src/components/launch/chains/**/CovenantCertificateChainTab.tsx` (exact path via grep)
- Modify: the lender WorkstationPage tab config that referenced it

- [ ] **Step 1:** `grep -rn "CovenantCertificateChainTab" pages/src` — remove the import + its tab entry from the lender workstation config. Delete the file.
- [ ] **Step 2: Type-check** — `cd pages && npm run check:pages` → 0 errors (no dangling import).
- [ ] **Step 3: Commit** — `git commit -am "chore(meridian): retire CovenantCertificateChainTab (migrated to Ledger/Thread)"`

---

## PHASE D — Repeatable per-chain migration template (×75 remaining)

For each remaining chain, repeat this loop (one chain = one commit cycle). Order chains by role to retire whole workstations.

- [ ] **D.1 Author schema** in the descriptor: `filters` (group its real statuses), `kpis` (count / count_breached / sum_quantum), `initiation` (if the chain has a user-facing create endpoint — else `null`), and `fields` on every action that the old ChainTab collected via `window.prompt()` (grep the ChainTab for `body.` keys → map each to an `ActionFieldSpec`; reason-code strings become `enum` options).
- [ ] **D.2 Verify render** — visit `/ledger/<chainKey>` and a `/thread/<chainKey>/<id>`; confirm KPI strip, filters, and each action form render and POST correctly (statuses from the chain's route file are the source of truth for filter membership).
- [ ] **D.3 Delete** the chain's `*ChainTab.tsx` + its tab-config entry; `npm run check:pages` clean.
- [ ] **D.4 Commit** per chain: `feat(meridian): migrate <chain> to Ledger/Thread; retire ChainTab`.

**No silent caps:** if a chain has actions whose body shape can't be expressed as `ActionFieldSpec` (free-form JSON, file upload), log it in the plan's tracking table and keep its ChainTab until the field schema is extended — do not delete a ChainTab whose actions aren't fully reproduced.

---

## PHASE E — Final cutover (only after all 76 chains migrated)

### Task E1: MeridianFrame for secondary routes

- [ ] Create `pages/src/meridian/MeridianFrame.tsx` — renders `<MeridianHeader/>` + applies role token theme, children untouched.
- [ ] In `App.tsx`, wrap the ~150 secondary routes (ESG/Reports/Intelligence/National/Settings/detail pages) in `<MeridianFrame>` instead of FioriShell/AppShell.
- [ ] `npm run check:pages` → 0 errors. Spot-check 3 secondary routes render with the Meridian header and no FioriShell sidebar.
- [ ] Commit.

### Task E2: Delete legacy chrome + shells

- [ ] Confirm no remaining import of `WorkstationShell`, `FioriShell`, `AppShell`, or any `*ChainTab` (`grep -rn`).
- [ ] Delete `WorkstationShell.tsx`, the workstation page wrappers, `FioriShell.tsx`, `AppShell.tsx`, and the now-empty `chains/` dirs.
- [ ] Remove legacy `/{role}-prefix/workstation` routes from `App.tsx`; redirect any old links to `/horizon` or the relevant `/ledger/:chainKey`.
- [ ] `npm run check:pages` + `npx vitest run` + browser smoke green.
- [ ] Commit: `chore(meridian): remove WorkstationShell + FioriShell + all ChainTabs (full cutover)`.

### Task E3: Final review

- [ ] Run the full unit suite + `scripts/smoke-roles.sh` (respecting the 120s rate-limit drain between scripts) against local dev.
- [ ] Dispatch a final code-reviewer over the whole branch diff.
- [ ] Use superpowers:finishing-a-development-branch.

---

## Self-Review

- **Spec coverage:** Horizon (exists, reused) · Atlas (Task 10 repoint) · Ledger (Tasks 3–7) · Thread forms (Task 9) · registry schema (Tasks 1–2) · chrome/MeridianFrame (E1) · migration mechanics + route flag (Phase D, Task 10 coexist) · error handling (404/403 in Task 3; inline POST error in Task 6) · testing (Tasks 1–3 vitest, Task 11 Playwright). All spec sections map to tasks.
- **Placeholder scan:** Tasks 7/8/9 describe component bodies rather than full code because they are pattern-matched to existing Meridian components (HorizonPage/ThreadPage) in this same directory — the implementer reads those siblings. Foundation tasks (1–6) carry complete code. No TBD/TODO.
- **Type consistency:** `LedgerActionField` (SPA) mirrors `ActionFieldSpec` (backend) field-for-field; `assembleLedger` return shape matches `LedgerData`; `getChain`/`MERIDIAN_CHAINS` names match the registry exports verified in source.
- **Known coupling:** Tasks must run in order within Phase A (route depends on types); Phase B Task 5 (lib types) precedes 6/7/9/10. covenant `initiation: null` is deliberate (no generic create endpoint) — the +New path is first exercised when a create-bearing chain is migrated in Phase D; flagged so it isn't mistaken for untested.
