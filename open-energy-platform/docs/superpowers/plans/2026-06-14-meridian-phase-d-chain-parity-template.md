# Meridian Phase D — Per-Chain Parity Migration Template

> **For agentic workers:** Execute one chain (or one role-community batch) per implementer
> subagent via superpowers:subagent-driven-development. This is the repeatable recipe proven
> end-to-end on `covenant_certificate` (W38, Tasks 1–12). Every other chain follows it.

**Goal:** Bring each registered Meridian chain to `covenant_certificate` parity:
schema-driven action `fields:` (replacing `window.prompt`) + legacy ChainTab retirement.

**Architecture:** The generic Meridian surfaces (LedgerPage / ThreadPage / FieldForm) already
render **every** registered chain — `assembleLedger` defaults a missing schema gracefully, and
fieldless actions POST on click. So a chain is *already live in Ledger* the moment its descriptor
exists. Parity is therefore an **enhancement + cleanup**, not a bugfix:

1. **Enhancement** — add `fields:` to the actions that carry structured input, so the FieldForm
   veil opens with typed inputs instead of the action POSTing an empty body (which the route
   tolerates but loses the borrower/evidence/amount data the legacy tab used to collect).
2. **Cleanup** — delete the legacy per-chain ChainTab component, remove its tab registration(s)
   from the role workstation/suite pages, and repoint any dangling FioriShell nav deep-link at
   `/ledger/:chainKey`.

**The parity template is `covenant_certificate`** — registry descriptor at
`src/utils/chain-registry-meridian.ts:108-149`. Its `flag-breach` action is the canonical
fields-carrying action (enum reason_code + string + evidence). Match its shape.

---

## Per-chain steps

### Step 0 — graphify-first

Before touching a chain, query the graph for what connects to it:
```
/graphify query "<chainKey> route actions and the frontend tab that renders it"
```
Confirm: the route file, the legacy tab component, every tab registration, any FioriShell nav link.

### Step 1 — Read the backend route to derive the field schema

Find the route file (`src/routes/<chain>-chain.ts` or sibling) and read each action endpoint's
body destructure. **The body fields ARE the form fields.** Mapping rules (derived from the
drawdown/covenant routes):

| Route body field shape | `ActionFieldSpec.type` | Notes |
|---|---|---|
| validated against a fixed set (`reason_code` in `[a,b,c]`) | `enum` + `options: [...]` | required if the route rejects empty |
| free-text reason / description (`reason`, `breached_covenants`) | `string` | `placeholder` from the legacy prompt text |
| evidence / document ref (`*_ref`, `*_doc_ref`, `breach_basis`, basis/justification) | `evidence` | renders a textarea |
| money (`*_zar`, `*_amount`, `amount_zar_m`) | `number` + `unit: 'ZAR'` | |
| date (`*_at`, `*_date`, deadlines) | `date` | |
| boolean flag | `boolean` | |
| `notes` (generic) | omit OR `string` optional | most chains: omit — it's an optional audit note, not a decision input |

**Required-ness:** route bodies are almost all `c.req.json().catch(() => ({}))` with every field
`?`-optional, so a fieldless POST never 400s. Mark a field `required: true` ONLY when the legacy
tab demanded it OR the state machine refuses the transition without it (check the route's guard /
the chain spec test). When in doubt, leave it optional — the FieldForm still opens, submit still
enables.

**Only add `fields:` to actions that collect input.** Pure transitions (covenant `begin-review`,
drawdown `close`, anything whose route body is `{ notes? }` only) stay fieldless — they POST on
click exactly as today. Do not invent fields the route ignores.

### Step 2 — Verify the registry path matches the live mount

The Thread fires `api.post(action.path.replace('/api','').replace(':id', id), values)`. The
descriptor `path` MUST equal `<mount-prefix>/:id/<endpoint>`. Confirm both halves:
```bash
grep -n "app.route('/api/" src/routes/mount-routes.ts | grep <chain>      # mount prefix
grep -n "app.post('/:id" src/routes/<chain>-chain.ts                       # endpoint segments
```
Fix any descriptor `path` that drifted. (covenant + drawdown + disbursement + loan_default were
already correct — `/api/lender/drawdown-chain`, `/api/disbursement/chain`, `/api/loan-default/chain`.)

### Step 3 — Add the `fields:` arrays to the descriptor

Edit `src/utils/chain-registry-meridian.ts`. Append a `fields: [...]` to each input-carrying
action, mirroring covenant_certificate. Keep `filters`/`kpis`/`lanes`/`initiation` as-is unless
they're missing — if a descriptor lacks `filters`/`kpis`, add them (Ledger renders an "All"-only
pill row + count KPIs by default, but named filters + a breached/quantum KPI are the parity bar).

**SECURITY (load-bearing, never violate):** `table`, status strings, and column names in this file
are interpolated into SQL identifiers by the horizon/thread routes. They MUST stay static literals
— never derived from request input. `fields[].options` enums are bound as `?` params downstream, so
they're safe, but the enum values must still match what the route validates.

### Step 4 — Retire the legacy tab

```bash
grep -rn "chainKey: '<chainKey>'" pages/src        # the tab registration(s)
grep -rln "<TabComponentName>" pages/src           # importers
grep -rn "tab=<tabkey>" pages/src                   # dangling deep-links (FioriShell nav etc.)
```
Then:
- `git rm` the legacy `pages/src/components/<role>/<Chain>Tab.tsx` component.
- Remove its `import` + tab-config object from every workstation/suite page that registered it.
- Repoint any FioriShell (or hero CTA) deep-link from `?tab=<tabkey>` to `/ledger/<chainKey>`.
- Leave separate CRUD tabs and initiation wizards alone — those are Phase E scope (covenant left
  its `covenants` CRUD tab + the two breach/cert wizards untouched).

### Step 5 — Verify + commit

```bash
cd /Users/reshigan/Openenergy/open-energy-platform
npm run check:pages          # MUST be 0 errors
npm run check                 # backend tsc — 0 errors (registry is backend code)
grep -rn "<TabComponentName>" pages/src   # MUST be empty (no orphan importers)
grep -rn "tab=<tabkey>" pages/src         # MUST be empty (no dangling deep-links)
```
Commit with a `feat(meridian):` message naming the wave + chainKey. One commit per chain (or per
small batch if the batch is one coherent role-community).

### Step 6 — (optional, high-value chains only) e2e proof

The covenant chain got a dedicated `tests/browser/meridian-ledger.spec.ts`. Do NOT write one per
chain — that bloats the prod-smoke budget (10/5min auth rate-limit). Add a browser spec only for a
chain whose Ledger/Thread shape is materially different from covenant's (e.g. a chain with a
`number`+`ZAR` field, to prove numeric FieldForm rendering). One extra spec for the whole phase is
plenty; the covenant spec already proves the generic surface.

---

## Batch order (by role community)

Migrate in role-community batches — chains in a community share route conventions and legacy-tab
host pages, so one subagent amortises the grep/read overhead:

1. **Lender** — drawdown (W21), disbursement_case (W30), loan_default (W45),
   credit_facility_application (W53), loan_transfer (W61), security_perfection (W69).
   Host pages: `LenderWorkstationPage.tsx`, `LenderSuitePage.tsx`. Nav: FioriShell "Monitoring"/"Origination".
2. **Trader** — position_limit, best_execution, trade_reporting, market_abuse, counterparty_margin,
   trade_allocation, algo_certification, mm_compliance, trading_risk.
3. **IPP / Grid** — drawdown-adjacent IPP chains + grid (gca, capacity_allocation, energization,
   load_curtailment, dispatch_nominations, planned_outage, grid_code_compliance, reserve_activation).
4. **Offtaker** — ppa_contract, take_or_pay, curtailment_claim, tariff_indexation, ppa_termination,
   payment_security, rec_lifecycle.
5. **Carbon** — mrv, registration, retirement, reversal, offset_claim, erpa, poa_cpa_inclusion,
   crediting_renewal, article6.
6. **Regulator** — disposition, licence_renewal, licence_application, compliance_inspection,
   levy_assessment, sseg_registration, complaint_resolution, tariff_determination.
7. **OEM-Support / Esums** — ticket, problem_management, change_enablement, security_remediation,
   warranty_claim, warranty_recovery, spare_parts_provisioning, prognostics, availability_guarantee,
   pm_compliance, permit_to_work, site_commissioning, vendor_escalation, hse_incident, cyber_incident.

After each batch: `npm run check && npm run check:pages` both 0, then commit. Do not proceed to the
next batch with a red check.

---

## Definition of done (per chain)

- [ ] Every input-carrying action has a `fields:` schema matching its route body.
- [ ] Descriptor `path`s verified against the live mount.
- [ ] `filters` + `kpis` present (named pills + breached/quantum KPI).
- [ ] Legacy ChainTab component deleted; all tab registrations removed; no orphan importers.
- [ ] Dangling `?tab=` deep-links repointed to `/ledger/:chainKey`.
- [ ] `npm run check` and `npm run check:pages` both 0 errors.
