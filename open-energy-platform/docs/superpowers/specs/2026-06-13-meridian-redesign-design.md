# Meridian Full-Frontend Redesign — Design

**Date:** 2026-06-13
**Status:** Approved (architecture locked via clarifying answers + Approach 1 selected; "continue unattended")

## Goal

Replace the tab-based per-role workstation frontend (WorkstationShell + 103 ChainTab modules + FioriShell/AppShell chrome) with **Meridian**: four generic, registry-driven surfaces that serve all 9+ roles and 76 chains from a single contract.

## The four surfaces

| Surface | Route | Job | Reads | State |
|---|---|---|---|---|
| **Horizon** | `/horizon` (+ `/horizon/:role` admin) | Triage. Lanes × time-buckets of every live case for the role, ranked by attention score. | `/api/horizon/:role` | EXISTS |
| **Atlas** | `/atlas` | Function index / ⌘K. Every chain the role can touch + Deal Desk. Deep-links to Ledger. | `/api/horizon/:role` (counts) + `fetchDealTypes` | EXISTS — repoint targets |
| **Ledger** | `/ledger/:chainKey` | Scan one chain. KPI strip + filter pills + card list + "+ New" initiation drawer. Row → Thread. | `/api/ledger/:chainKey` (NEW) | NEW |
| **Thread** | `/thread/:chainKey/:id` | Act on one case. Two-sided case detail + schema-driven action forms. | `/api/thread/:chainKey/:id` | EXISTS — add form rendering |

**One global chrome:** Meridian `<header>` (wordmark + quicklinks + clock + ⌘K + avatar). Retire AppShell + FioriShell. Secondary ~150 routes wrapped in `<MeridianFrame>` (header + token theme), internals untouched + re-skinned — NOT rebuilt.

## Decisions (locked)

1. **Full replacement.** Delete WorkstationShell + all 103 ChainTab modules. Registry is the single contract.
2. **Schema-driven action forms.** Replace `window.prompt()` with `ActionFieldSpec[]` on each registry action. Reason codes become validated `enum` → better audit data.
3. **List surface = dedicated Ledger** (`/ledger/:chainKey`), not Thread master-detail or Horizon lane expansion. Four surfaces, each one job.
4. **Initiation = Ledger "+ New"** wizard drawer reusing field-schema. `initiation: null` = system-initiated only (cron/cascade/deal-dispatch).
5. **Approach 1 — schema-first, chain-by-chain vertical slices.** Extend registry once → build 4 generic shells → migrate chains one at a time (author schema → verify Ledger+Thread render → delete that ChainTab) → coexist behind a route flag.

## Registry contract (the spine)

`src/utils/chain-registry-meridian.ts` — 2202 lines, 76 `ChainDescriptor`s, already feeds horizon + thread.

> **SECURITY (load-bearing, verbatim):** table/column/status values are interpolated into SQL identifiers by the horizon/thread routes. They MUST be static literals in this file — never derived from request input. The new `/api/ledger/:chainKey` route MUST follow the same rule.

### Type extensions

```ts
export interface ActionFieldSpec {
  key: string;
  label: string;
  type: 'number' | 'string' | 'date' | 'enum' | 'boolean' | 'evidence';
  required?: boolean;
  unit?: string;            // e.g. 'ZAR', 'MWh', '%'
  options?: string[];       // for type 'enum' — reason codes etc.
  placeholder?: string;
  defaultFrom?: string;     // prefill from a case raw-record column
}

// ChainActionHint gains:
//   fields?: ActionFieldSpec[];   // collected by Thread before POST; flows through thread.ts `...a` automatically

// ChainDescriptor gains:
export interface ChainInitiation {
  label: string;            // "+ New Covenant Certificate"
  path: string;             // POST endpoint, e.g. '/api/lender/covenant-certificates'
  fields: ActionFieldSpec[];
}
//   initiation?: ChainInitiation | null;   // null = system-initiated only
//   filters?: { key: string; label: string; statuses: string[] }[];   // Ledger filter pills
//   kpis?: { key: string; label: string; compute: 'count' | 'count_breached' | 'sum_quantum' }[];
```

`compute` is a fixed enum (NOT free SQL) — Ledger computes KPIs in JS over the returned rows. No request-derived SQL.

## Surface 2 — `/api/ledger/:chainKey` + Ledger page

### Endpoint `src/routes/ledger.ts`

Mirror `horizon.ts` query discipline exactly. `:chainKey` resolved against the static `MERIDIAN_CHAINS` map → `ChainDescriptor`; **404 if unknown** (so `:chainKey` never reaches SQL as an identifier). Role gate: viewer must have the chain in `lanes` or in some `action.roles`, else 403 (admin bypass).

```
GET /api/ledger/:chainKey?status=<filterKey>
```

Query (table/cols from descriptor literal only):
```sql
SELECT * FROM <chain.table>
ORDER BY (<chain.deadlineCol> IS NULL), <chain.deadlineCol> ASC
LIMIT 200
```
- `status` filter param resolved against `chain.filters[].key` → its `statuses[]` array (static literals from registry); applied as `WHERE <statusCol> IN (?,?...)` with bound params. Unknown filter key → ignored (return all). Default (no param) → all non-terminal + terminal, full list.
- Shape each row via the same field-mapping as `assembleHorizon` (ref/title/status/deadline/quantum/counterparty/bucket/score) → `LedgerRow`.
- Compute `kpis` in JS from `chain.kpis` over the rows (count / count_breached / sum_quantum).
- Return `{ success, data: { chain:{key,wave,title}, filters, kpis, initiation, rows } }`.

### Ledger page `pages/src/meridian/LedgerPage.tsx`

KPI strip (from `data.kpis`) · filter pills (from `data.filters`, drive `?status=`) · card list (rows; click → `/thread/:chainKey/:id`) · "+ New" button (visible iff `data.initiation`) opening an initiation drawer rendering `initiation.fields` via the shared `<FieldForm>`, POSTing to `initiation.path`.

## Surface 3 — Thread action forms

`pages/src/meridian/ThreadPage.tsx` `act()` currently POSTs empty `{}`. Change: when `a.fields?.length`, open `<FieldForm>` drawer; collect values; POST body = collected object to `a.path.replace('/api','').replace(':id',id)`. No fields → POST `{}` as today. `<FieldForm>` is one shared component (Thread actions, Ledger "+ New"), driven by `ActionFieldSpec[]`: number/string/date/enum(select)/boolean(checkbox)/evidence(text+note). `required` validated client-side before submit; `defaultFrom` prefills from the case raw record.

## Surface 4 — Atlas repoint + chrome

- Atlas function rows currently target `${cfg.workstationPath}?tab=${f.key}` (dead under full replacement). Repoint → `/ledger/:chainKey`.
- `pages/src/meridian/MeridianHeader.tsx` extracted from HorizonPage (wordmark + quicklinks + clock + ⌘K + avatar) — shared by all four surfaces + `<MeridianFrame>`.
- `<MeridianFrame>` wraps secondary routes: renders header + applies role token theme, children untouched. Replaces FioriShell/AppShell mounting in `App.tsx`.

## Migration mechanics

- **Route flag:** Meridian routes (`/horizon`, `/atlas`, `/ledger/*`, `/thread/*`) mount alongside legacy until cutover. Per-chain: author registry schema (filters/kpis/initiation/action fields) → verify Ledger + Thread render that chain end-to-end → delete its ChainTab module + its tab wiring. covenant_certificate (W38) is the worked first slice.
- **Deletion order:** ChainTab deleted only after its chain renders correctly on Ledger+Thread. WorkstationShell + FioriShell + AppShell deleted last, after all 76 chains migrated and all secondary routes wrapped in MeridianFrame.

## Error handling

- Ledger/Thread unknown `:chainKey` → 404 (guards SQL identifier). Forbidden role → 403. Empty list → composed empty state with "+ New" if initiation exists.
- Action POST failure → inline error in the FieldForm drawer; form stays open with entered values.
- Client-side required-field validation before any POST.

## Testing

- **Unit (vitest):** `ledger.ts` route — chainKey resolution (known→200, unknown→404), role gate (in-lane→200, foreign→403, admin→200), filter param → correct `WHERE...IN`, KPI compute (count/count_breached/sum_quantum) over fixture rows, SQL uses descriptor literals only.
- **Registry:** every `initiation.path` is a real mounted route; every `action.fields[].type` valid; every `filters[].statuses` ⊆ the chain's known statuses; `kpis[].compute` ∈ enum.
- **Type-check:** `npm run check` (backend) + `npm run check:pages` (SPA) zero errors after each slice.
- **Browser (Playwright):** seed a covenant_certificate case → `/ledger/covenant_certificate` shows KPI strip + row → click → `/thread/...` → fire an action with a reason-code enum → verify state transition + audit row.

## File structure

| File | Change |
|---|---|
| `src/utils/chain-registry-meridian.ts` | Add `ActionFieldSpec`, `ChainInitiation`; extend `ChainActionHint` (+fields), `ChainDescriptor` (+initiation/filters/kpis). Author covenant_certificate first. |
| `src/routes/ledger.ts` | NEW — `GET /:chainKey`. Mirror horizon.ts security. |
| `src/index.ts` | Mount `app.route('/api/ledger', ledger)`. |
| `pages/src/meridian/LedgerPage.tsx` | NEW. |
| `pages/src/meridian/MeridianHeader.tsx` | NEW — extracted from HorizonPage. |
| `pages/src/meridian/MeridianFrame.tsx` | NEW — wraps secondary routes. |
| `pages/src/meridian/FieldForm.tsx` | NEW — shared ActionFieldSpec renderer. |
| `pages/src/meridian/ThreadPage.tsx` | act() → FieldForm when action has fields. |
| `pages/src/meridian/AtlasPage.tsx` | Repoint function rows → `/ledger/:chainKey`. |
| `pages/src/meridian/lib.ts` | Add `LedgerData`/`LedgerRow` types + `fetchLedger`. |
| `pages/src/App.tsx` | Mount Ledger route; wrap secondary routes in MeridianFrame; retire FioriShell/AppShell at cutover. |
| `pages/src/components/launch/chains/**/*ChainTab.tsx` | DELETE per-chain after its slice verifies. |
| `pages/src/components/launch/WorkstationShell.tsx` | DELETE at final cutover. |

## YAGNI / out of scope

- No react-query — plain fetch + useState, matching existing Meridian surfaces.
- No new DO / migration unless a chain needs an initiation table that doesn't exist (covenant_certificate's `oe_covenant_certificates` already exists).
- Deal engine DealFieldSpec convergence onto ActionFieldSpec is noted but deferred to its own slice.
