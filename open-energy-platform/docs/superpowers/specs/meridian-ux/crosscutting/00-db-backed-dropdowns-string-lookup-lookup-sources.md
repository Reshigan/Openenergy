## Cross-cutting: DB-backed dropdowns (string → lookup) & LOOKUP_SOURCES

### Goal

Convert 1,275 form fields across 207 chains from `type: 'string'` (free-text inputs) to `type: 'lookup'` (DB-backed dropdowns). This eliminates:
- 32+ raw `*_id` fields typed as plain text (e.g., `asset_id: "..."`, `oem_id: "..."`)
- 40+ free-text enums that should be picklists (e.g., `contract_currency: "USD"` vs. normalized ISO codes)
- Date fields currently accepting bare strings instead of native `<input type="date">` selections
- ZAR money fields without unit validation
- Uncontrolled party references (respondent, supplier, counterparty, approver, etc.)

**SQL-identifier safety invariant:** Every lookup source name is a static string literal in `LOOKUP_SOURCES` (below). Request paths (`/api/ledger/lookup/:source`) match a whitelist entry; `:source` is never interpolated from request input.

---

### Implementation Pattern

**FieldForm.tsx** ([existing](open-energy-platform/pages/src/meridian/FieldForm.tsx:124–140)) already renders `type: 'lookup'` as a `<select>`:
- On mount, fetches options from `f.source` (e.g., `/api/ledger/lookup/ipp-projects`) via `fetchLookup()`.
- Displays a loading state while options load; error state if the fetch fails.
- Submits the selected `option.id` (not the label) as the field value.
- Falls back to a text input if the source endpoint is unavailable (graceful degradation).

**lib.ts** defines `LookupOption = { id: string; label: string }`. The backend lookup route must return `{ success: true, data: [{ id, label, ...metadata }] }`.

---

### Lookup Route Contract

**GET /api/ledger/lookup/:source** ([existing](open-energy-platform/src/routes/lookup.ts))

- **Auth:** Required (any role); responses are tenant-scoped.
- **Query params:** `?q=<search>` (case-insensitive substring filter on label), `?limit=100` (max 300).
- **Response:** `{ success: true, data: [{ value, label, ...metadata }] }` (metadata fields support bulk-fill on selection).
- **SQL safety:** The `switch(entity)` statement hardcodes case labels (never interpolates `:source` into SQL).

---

### LOOKUP_SOURCES: Static Whitelist

Define in a new file `src/utils/lookup-sources.ts`:

```typescript
// src/utils/lookup-sources.ts — Whitelist of all valid lookup sources.
// Each entry maps a source key to a SQL query + label template.
// SECURITY: `:source` in /api/ledger/lookup/:source MUST match a key below.

export const LOOKUP_SOURCES = {
  // Entity references (foreign keys → ID + display name)
  'ipp-projects': {
    label: 'IPP projects',
    query: `SELECT id, (name || ' (' || COALESCE(status, 'unknown') || ')') AS label
            FROM ipp_projects WHERE tenant_id = ? ORDER BY name`,
  },
  'ipp-developers': {
    label: 'IPP developers',
    query: `SELECT id, (COALESCE(legal_name, email) || ' (' || COALESCE(kyc_status, 'pending') || ')')
            FROM participants WHERE role IN ('ipp_developer') AND tenant_id = ? ORDER BY legal_name`,
  },
  'offtakers': {
    label: 'Offtakers',
    query: `SELECT id, (COALESCE(legal_name, email) || ' (' || type || ')')
            FROM participants WHERE role IN ('offtaker') AND tenant_id = ? ORDER BY legal_name`,
  },
  'lender-facilities': {
    label: 'Credit facilities',
    query: `SELECT id, (COALESCE(facility_name, reference) || ' [' || COALESCE(status, 'unknown') || ']')
            FROM oe_credit_facilities WHERE tenant_id = ? ORDER BY facility_name`,
  },
  'participants': {
    label: 'Participants (all roles)',
    query: `SELECT id, (COALESCE(legal_name, email) || ' · ' || role)
            FROM participants WHERE tenant_id = ? ORDER BY legal_name`,
  },
  'carbon-projects': {
    label: 'Carbon projects',
    query: `SELECT id, (name || ' (' || COALESCE(methodology_id, 'no-method') || ')')
            FROM oe_carbon_projects WHERE tenant_id = ? ORDER BY name`,
  },
  'om-sites': {
    label: 'O&M sites',
    query: `SELECT id, (name || ' · ' || COALESCE(technology, 'unknown') ||
                        CASE WHEN capacity_kwp IS NOT NULL
                          THEN ' · ' || CAST(ROUND(capacity_kwp / 1000.0, 1) AS TEXT) || ' MWp'
                          ELSE '' END)
            FROM om_sites WHERE tenant_id = ? ORDER BY name`,
  },

  // Enums (normalized ISO codes, status values, predefined class sets)
  'currencies': {
    label: 'ISO 4217 currencies',
    query: `SELECT code AS id, (code || ' — ' || name) AS label
            FROM currency_codes ORDER BY code`,
  },
  'country-codes': {
    label: 'ISO 3166-1 alpha-2 countries',
    query: `SELECT code AS id, name AS label
            FROM country_codes ORDER BY name`,
  },
  'credit-ratings': {
    label: 'Credit ratings',
    query: `SELECT rating AS id, rating AS label
            FROM (VALUES ('AAA'), ('AA'), ('A'), ('BBB'), ('BB'), ('B'), ('CCC'), ('CC'), ('C'), ('D'))
            AS t(rating) ORDER BY rating`,
  },
  'energy-types': {
    label: 'Energy types',
    query: `SELECT energy_type AS id, energy_type AS label
            FROM (SELECT DISTINCT energy_type FROM oe_order_book WHERE energy_type IS NOT NULL)
            ORDER BY energy_type`,
  },
  'technologies': {
    label: 'Technology types',
    query: `SELECT tech AS id, tech AS label
            FROM (VALUES ('Solar PV'), ('Wind'), ('Hydro'), ('Battery'), ('Biogas'), ('Other'))
            AS t(tech) ORDER BY tech`,
  },

  // Linked entities (cross-chain references for workorder, tickets, assets, etc.)
  'om-assets': {
    label: 'Assets',
    query: `SELECT id, (asset_code || ' · ' || asset_type || ' (' || site_id || ')')
            FROM om_assets WHERE tenant_id = ? ORDER BY asset_code`,
  },
  'om-oem-vendors': {
    label: 'OEM vendors',
    query: `SELECT id, (vendor_name || ' (' || COALESCE(product_line, 'general') || ')')
            FROM om_oem_vendors WHERE tenant_id = ? ORDER BY vendor_name`,
  },
  'support-tickets': {
    label: 'Support tickets',
    query: `SELECT id, (COALESCE(reference, id) || ' — ' || COALESCE(subject, '') ||
                        ' [' || COALESCE(status, 'unknown') || ']')
            FROM support_tickets WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 500`,
  },
  'work-orders': {
    label: 'Work orders',
    query: `SELECT id, (COALESCE(reference, id) || ' — ' || COALESCE(description, '') ||
                        ' [' || status || ']')
            FROM om_work_orders WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 500`,
  },

  // Regulator & compliance entities
  'nersa-licences': {
    label: 'NERSA licences',
    query: `SELECT id, (COALESCE(licence_number, id) || ' (' || COALESCE(licence_class, '') ||
                        CASE WHEN status IS NOT NULL THEN ' · ' || status ELSE '' END || ')')
            FROM oe_licences WHERE tenant_id = ? ORDER BY licence_number`,
  },
  'interconnectors': {
    label: 'Grid interconnectors',
    query: `SELECT id, (name || ' (' || COALESCE(connection_point, 'unknown') || ')')
            FROM oe_interconnectors WHERE tenant_id = ? ORDER BY name`,
  },

  // Utility: empty list (for fields that should render but have no valid options in this tenant).
  'empty': {
    label: '(no options)',
    query: `SELECT NULL AS id, NULL AS label WHERE FALSE`,
  },
} as const;

export type LookupSourceKey = keyof typeof LOOKUP_SOURCES;
```

---

### Field Conversion Examples

#### **Class A: Entity References (Foreign Keys)**

| Chain | Current Field | Registry Line | Convert to | Lookup Source | Rationale |
|-------|--|---|---|---|---|
| ie_cost_to_complete | `project_id` (string) | [694](open-energy-platform/src/utils/chain-registry-meridian.ts:694) | type: 'lookup' | `/api/ledger/lookup/ipp-projects` | IPP projects are entities in `ipp_projects`; users should select from a list, not type UUIDs. |
| ie_cost_to_complete | `ipp_id` (string) | [695](open-energy-platform/src/utils/chain-registry-meridian.ts:695) | type: 'lookup' | `/api/ledger/lookup/ipp-developers` | Developer role reference; normalize to role-filtered participant list. |
| credit_origination | `facility_id` (string) | [1039](open-energy-platform/src/utils/chain-registry-meridian.ts:1039) | type: 'lookup' | `/api/ledger/lookup/lender-facilities` | Facility is a master entity; should be a live lookup. |
| loan_transfer | `counterparty_id` (string) | [4182](open-energy-platform/src/utils/chain-registry-meridian.ts:4182) | type: 'lookup' | `/api/ledger/lookup/participants` | Transferee is a party in `participants` table. |
| security_perfection | `borrower_id` (string) | [5570](open-energy-platform/src/utils/chain-registry-meridian.ts:5570) | type: 'lookup' | `/api/ledger/lookup/ipp-developers` | IPP borrower; role-scoped participant. |
| ppa_contract_initiation | `generator_id` (string) | [5951](open-energy-platform/src/utils/chain-registry-meridian.ts:5951) | type: 'lookup' | `/api/ledger/lookup/ipp-developers` | Generator is IPP role. |
| ppa_contract_initiation | `offtaker_id` (string) | [5952](open-energy-platform/src/utils/chain-registry-meridian.ts:5952) | type: 'lookup' | `/api/ledger/lookup/offtakers` | Offtaker is a distinct role. |

#### **Class B: System Enums (Codes, Status, Currency)**

| Chain | Current Field | Registry Line | Convert to | Lookup Source | Rationale |
|---|---|---|---|---|---|
| carbon_erpa | `contract_currency` (string) | [4064](open-energy-platform/src/utils/chain-registry-meridian.ts:4064) | type: 'lookup' | `/api/ledger/lookup/currencies` | ISO 4217 codes; free text risks `USD`, `usd`, `us-dollar` divergence. |
| carbon_erpa | `host_country` (string) | [4064](open-energy-platform/src/utils/chain-registry-meridian.ts:4064) | type: 'lookup' | `/api/ledger/lookup/country-codes` | Normalize to ISO 3166-1. |
| interconnector_schedule | `currency` (string) | [5130](open-energy-platform/src/utils/chain-registry-meridian.ts:5130) | type: 'lookup' | `/api/ledger/lookup/currencies` | ERPA & trading both need normalized currency. |
| credit_origination.assess | `credit_rating` (string) | [388](open-energy-platform/src/utils/chain-registry-meridian.ts:388) | type: 'lookup' | `/api/ledger/lookup/credit-ratings` | S&P/Moody's ratings; enforce controlled set. |
| licence_renewal.amend | `granted_expiry_date` (date string) | [6272](open-energy-platform/src/utils/chain-registry-meridian.ts:6272) | type: 'date' | — | Already `type: 'date'`; no conversion needed. |

#### **Class C: Cross-Chain Entity Links (Tickets, Work Orders, Assets)**

| Chain | Current Field | Registry Line | Convert to | Lookup Source | Rationale |
|---|---|---|---|---|---|
| cyber_incident_response | `linked_wo_id` (string) | [9690](open-energy-platform/src/utils/chain-registry-meridian.ts:9690) | type: 'lookup' | `/api/ledger/lookup/work-orders` | Dispatch remediation links to a WO; users need to find it by ref/description. |
| market_abuse | `fault_id` (string, placeholder `omflt_demo_1`) | [12276](open-energy-platform/src/utils/chain-registry-meridian.ts:12276) | type: 'lookup' | `/api/ledger/lookup/om-assets` | Asset faults are indexed; lookup prevents typos. |
| security_remediation | `asset_id` (string, placeholder `asset_demo_01`) | [7046](open-energy-platform/src/utils/chain-registry-meridian.ts:7046) | type: 'lookup' | `/api/ledger/lookup/om-assets` | Esums asset; must resolve to O&M registry. |
| security_remediation | `oem_id` (string, placeholder `oem_sungrow`) | [7047](open-energy-platform/src/utils/chain-registry-meridian.ts:7047) | type: 'lookup' | `/api/ledger/lookup/om-oem-vendors` | OEM vendor; normalize to master vendor list. |
| performance_reporting | `site_id` (string) | [7048](open-energy-platform/src/utils/chain-registry-meridian.ts:7048) | type: 'lookup' | `/api/ledger/lookup/om-sites` | Already uses lookup in registry (line 7048). |
| service_request | `entitlement_contract_id` (string) | [7758](open-energy-platform/src/utils/chain-registry-meridian.ts:7758) | type: 'lookup' | `/api/ledger/lookup/support-tickets` | Contract reference in entitlement check; allow search. |

#### **Class D: Party Role References (Respondent, Approver, Supplier)**

| Chain | Current Field | Registry Line | Convert to | Lookup Source | Rationale |
|---|---|---|---|---|---|
| complaint_resolution | `respondent_party_id` (string, placeholder `ipp-001`) | [6948](open-energy-platform/src/utils/chain-registry-meridian.ts:6948) | type: 'lookup' | `/api/ledger/lookup/participants` | Party is a participant; prevent free-form typos. |
| service_request.request_approval | `approver_actor_id` (string) | [7759](open-energy-platform/src/utils/chain-registry-meridian.ts:7759) | type: 'lookup' | `/api/ledger/lookup/participants` | Approver is a person in `participants`. |
| spare_parts_provisioning | `supplier_party_id` (string) | [7647](open-energy-platform/src/utils/chain-registry-meridian.ts:7647) | type: 'lookup' | `/api/ledger/lookup/participants` | Supplier is a party role. |
| rec_lifecycle.transfer_certificate | `holder_id` (string) | [3137](open-energy-platform/src/utils/chain-registry-meridian.ts:3137) | type: 'lookup' | `/api/ledger/lookup/participants` | Certificate holder; must be a known entity. |

#### **Class E: Regulator & Infrastructure Entities**

| Chain | Current Field | Registry Line | Convert to | Lookup Source | Rationale |
|---|---|---|---|---|---|
| licence_renewal | (initiation) `respondent_party_id` | — | type: 'lookup' | `/api/ledger/lookup/nersa-licences` | Regulator inbound; reference existing licence. |
| interconnector_schedule | `interconnector_id` (string, required) | [5120](open-energy-platform/src/utils/chain-registry-meridian.ts:5120) | type: 'lookup' | `/api/ledger/lookup/interconnectors` | Grid Code registration; must resolve to SO registry. |
| retirement_chain | `retirement_id` (string, required) | [12391](open-energy-platform/src/utils/chain-registry-meridian.ts:12391) | type: 'lookup' | `/api/ledger/lookup/carbon-projects` | Carbon retirement; link to project. |

---

### Money Fields: Type Coercion Rule

Fields with labels containing `ZAR`, `amount`, `value`, `price`, or suffixed `_zar_m` should be rendered as `type: 'number'` with a `unit` annotation. **Do not convert to lookup.** Example:

```typescript
{ key: 'secured_value_zar', label: 'Secured value (ZAR)', type: 'number', unit: 'ZAR' }
// FieldForm renders with a <span className="mono"> · ZAR</span> next to the input.
```

**Identified in registry:**
- Line 582: `secured_value_zar` → `type: 'number'`, `unit: 'ZAR'`
- Line 271: `invoices_amount_zar` → `type: 'number'`, `unit: 'ZAR'` (already correct)
- Line 391: `approved_amount_zar_m` → `type: 'number'`, `unit: 'ZAR (millions)'`

---

### Datalist Fallback

If a lookup source endpoint is **temporarily unavailable** (network, DB outage, or missing in the new LOOKUP_SOURCES list), the form **must gracefully degrade**:

1. `FieldForm.tsx` line 133: `disabled={lookups[f.key] === undefined}` — disable the `<select>`.
2. Line 142–144: Show error message "Could not load options".
3. **Alternative (UX improvement):** Render a `<datalist>` fallback—allow free text with an HTML5 `<input list="...">` and a `<datalist>` of previously-seen values or a static cache.

**Pseudo-implementation:**
```typescript
// Fallback if lookup fails: render datalist
if (f.type === 'lookup' && lookupErr[f.key]) {
  return (
    <>
      <input id={id} type="text" list={`${id}-datalist`}
             value={(values[f.key] as string) ?? ''}
             onChange={e => set(f.key, e.target.value)} {...errProps} />
      <datalist id={`${id}-datalist`}>
        {(lookupErr[f.key] ? getStaticCache(f.key) : []).map(opt => (
          <option key={opt.id} value={opt.label} />
        ))}
      </datalist>
    </>
  );
}
```

---

### Phase-In Strategy

**P0 (High-volume impact):**
- `ipp-projects`, `ipp-developers`, `offtakers`, `participants`, `lender-facilities` (covers ~60% of current `type: 'string'` entity refs).
- `currencies`, `country-codes`, `credit-ratings`.

**P1 (Cross-chain visibility):**
- `om-sites`, `om-assets`, `om-oem-vendors` (Esums + Security Remediation chains).
- `work-orders`, `support-tickets`.

**P2 (Regulator domain):**
- `nersa-licences`, `interconnectors`, `carbon-projects`.

---

### SQL Identifier Safety Guarantee

In the lookup route ([src/routes/lookup.ts](open-energy-platform/src/routes/lookup.ts)):

```typescript
switch (entity) {  // entity = c.req.param('entity')
  case 'ipp-projects': {
    // Hard-coded query with static identifiers (table, column names).
    const res = await db.prepare(
      `SELECT id, name || ' (' || status || ')' AS label FROM ipp_projects ...`
    ).bind(limit).all();
    // entity value is never interpolated into SQL.
    break;
  }
  // ... other cases ...
  default:
    return c.json({ success: false, error: `Unknown lookup entity: ${entity}` }, 400);
}
```

- `:source` param is **not** interpolated into SQL identifiers.
- Query strings are static literals.
- Only `?q=<search>` (for substring match on label) and `?limit=<num>` are user inputs, applied post-query via JS filter.
- Tenant isolation via `WHERE tenant_id = ?` (parameterized binding).

**Enforcement:** CI lint rule checks that `lookup.ts` contains zero dynamic identifier interpolation.

---

### Frontend Routes & Endpoints

**No new routes required.** Extend existing:
- `GET /api/ledger/lookup/:source` (already handles entity param routing).
- Add new cases to the `switch(entity)` statement for each LOOKUP_SOURCES entry.

**Tenant scope:** All queries filter `WHERE tenant_id = ?` via `getCurrentUser(c).tenant_id`.

---

### Audit Impact

This conversion directly addresses the AUDIT findings:
- **1,275 string fields → lookups:** Reduces typos, enforces referential integrity client-side.
- **32+ raw `*_id` inputs:** Eliminated; replaced with searchable picklists.
- **40+ dangling entity refs:** Resolved; forms now link to live master-data lookups.
- **Free-text enums:** Standardized to ISO codes (currency, country, ratings).
- **Thread UX:** No change (Thread still reads raw rows verbatim; lookups are form-only for mutations).
