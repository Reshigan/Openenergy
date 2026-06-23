# 03 - Create Transactions Walkthrough

This shows how to create and advance real transactions, both in the UI and via
the API. Do it on the sandbox (demo, oe.vantax.co.za). The patterns are
identical on live; only the URL and the login change.

## The universal model

Almost everything in this platform is a "chain": a state-machine transaction
with a fixed set of statuses and a fixed set of actions that move between them.
There are 207 chains; `04_FEATURES_BY_ROLE.md` lists them all. The mechanics are
the same for every chain:

- List cases: `GET /api/<prefix>` (filtered to what your role may see)
- Case detail: `GET /api/<prefix>/:id`
- Advance a case: `POST /api/<prefix>/:id/<action>` (the action names are the
  chain's transitions, e.g. `submit-evidence`, `settle`, `dispute`)
- Two-sided view + signing: `GET /api/thread/:chainKey/:id`,
  `POST /api/thread/:chainKey/:id/sign`

How a case is born differs by chain:

1. Self-initiated. The role creates the case directly (e.g. a trader places an
   order; an IPP opens a procurement RFP). In the UI this is the Ledger "+New"
   button.
2. Cascade-initiated. The case is created automatically by an upstream event in
   another role. Example: an offtaker recording a PPA delivery shortfall fires a
   cascade that opens a take-or-pay case on the generator IPP's side. You do not
   "create" these directly; you make the upstream thing happen and the case
   appears.

Both end up in the same place: a case row, a Thread, and a cascade fan-out.

## Part A - Create a transaction in the UI (any chain)

1. Log in as the role that owns the chain (e.g. `trader` for trading, `ipp` for
   procurement). Browser, password `Demo@2024!`.
2. Open Atlas (Cmd+K) and pick the function, or go straight to
   `/ledger/<chainKey>`.
3. Click "+New". A schema-driven form opens (rendered by `FieldForm` from the
   chain's composer field list). Required fields are validated client-side.
4. Submit. The case is created, you are taken to its Thread
   (`/thread/<chainKey>/<id>`), and the creation cascade fires.
5. Advance it: the Thread shows the actions available from the current status.
   Each action is one of the chain's transitions and posts to
   `/api/<prefix>/:id/<action>`.

If a role may not initiate a given chain, "+New" is hidden and the operator just
sees the case list. That is by design (e.g. downstream cascade-only chains).

## Part B - Create a transaction via the API

### Example 1 (self-initiated): place a trade order

Trading order placement is a clean self-initiated transaction. As `trader`:

```bash
BASE=https://oe.vantax.co.za
TRADER=$(curl -s "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"trader@openenergy.co.za","password":"Demo@2024!"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')

curl -s -X POST "$BASE/api/trading/orders" \
  -H "Authorization: Bearer $TRADER" -H 'Content-Type: application/json' \
  -d '{
    "side": "buy",
    "energy_type": "renewable",
    "volume_mwh": 5,
    "price": 950,
    "delivery_date": "2026-07-01",
    "order_type": "limit",
    "time_in_force": "GTC",
    "external_ref": "support-test-001"
  }'
```

Notes grounded in the handler:

- Required: `side` (buy or sell), `energy_type`, `volume_mwh`. Missing any returns
  400.
- `external_ref` makes the call idempotent: re-POST the same ref and you get the
  existing order back with `idempotent: true` rather than a duplicate. Use this
  for safe retries.
- The order runs the pre-trade guards (credit, exposure, mark age, market halt,
  KYC) before it is accepted. A rejected order returns a structured reason you
  can explain via `GET /api/trading/rejections/:id/explain`.
- Effective price falls back through `price -> price_min -> price_max`.

Follow-ups:

```bash
curl -s "$BASE/api/trading/orders" -H "Authorization: Bearer $TRADER"          # your orders
curl -s "$BASE/api/trading/orderbook?energy_type=renewable" -H "Authorization: Bearer $TRADER"
curl -s -X POST "$BASE/api/trading/orders/<ID>/cancel" -H "Authorization: Bearer $TRADER"
```

### Example 2 (advance a chain): take-or-pay transitions

The take-or-pay chain (`/api/take-or-pay/chain`, chainKey-backed,
table `oe_top_cases`) is a good example of advancing a case through its
transitions. Cases here are usually cascade-born from an offtaker PPA shortfall,
so list them rather than creating one:

```bash
IPP=$(curl -s "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"ipp@openenergy.co.za","password":"Demo@2024!"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')

curl -s "$BASE/api/take-or-pay/chain" -H "Authorization: Bearer $IPP"           # list cases
curl -s "$BASE/api/take-or-pay/chain/<ID>" -H "Authorization: Bearer $IPP"      # one case + events
```

The transition endpoints (each moves the case to the next status and fires a
cascade):

```bash
P=/api/take-or-pay/chain/<ID>
curl -s -X POST "$BASE$P/close-year"       -H "Authorization: Bearer $IPP"
curl -s -X POST "$BASE$P/issue-statement"  -H "Authorization: Bearer $IPP" -H 'Content-Type: application/json' -d '{}'
curl -s -X POST "$BASE$P/request-evidence" -H "Authorization: Bearer $IPP"
curl -s -X POST "$BASE$P/submit-evidence"  -H "Authorization: Bearer $IPP" -H 'Content-Type: application/json' -d '{"notes":"meter logs attached"}'
curl -s -X POST "$BASE$P/propose-quantum"  -H "Authorization: Bearer $IPP" -H 'Content-Type: application/json' -d '{"top_amount_proposed": 120000}'
curl -s -X POST "$BASE$P/accept-quantum"   -H "Authorization: Bearer $IPP" -H 'Content-Type: application/json' -d '{"top_amount_agreed": 120000}'
curl -s -X POST "$BASE$P/settle"           -H "Authorization: Bearer $IPP" -H 'Content-Type: application/json' -d '{"top_amount_settled": 120000, "settlement_ref": "TOP-2026-001"}'
# alternative terminal paths:
curl -s -X POST "$BASE$P/dispute"          -H "Authorization: Bearer $IPP" -H 'Content-Type: application/json' -d '{"reason_code":"quantum_disputed"}'
curl -s -X POST "$BASE$P/waive"            -H "Authorization: Bearer $IPP" -H 'Content-Type: application/json' -d '{"notes":"goodwill waiver"}'
```

Each transition returns `{success:true,data:{case:...}}` with the refreshed,
decorated case. Each appends an event to `oe_top_events` and fires
`fireCascade(...)`. SLA breaches are applied automatically by the 15-minute cron
sweep, which escalates the case and (for the right severity tier) crosses it
into the regulator inbox.

## Part C - Make a cascade-born transaction appear

To see a cascade-initiated case created end to end:

1. As `offtaker`, record a PPA delivery shortfall (UI: the offtaker PPA delivery
   surface; or the offtaker delivery API). This fires a shortfall event.
2. The cross-role rule matches that event and opens a claim/shortfall case on the
   generator IPP side, pushing it into the IPP's incoming panel.
3. As `ipp`, open Horizon. The new case is in a lane. Open its Thread and advance
   it with the transitions in Part B example 2.

This is the canonical cross-role pattern: one role acts, `fireCascade` fans out,
the counterparty role gets work. If the case does not appear, check the
`cascade_dlq` table / support cascade-DLQ console for a stuck stage.

## Part D - Sign a two-sided transaction

Some transactions (e.g. an e-signed agreement) need signatures from both sides.
From the Thread:

```bash
curl -s -X POST "$BASE/api/thread/<chainKey>/<id>/signatories" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"...signatory fields..."}'

curl -s -X POST "$BASE/api/thread/<chainKey>/<id>/sign" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'
```

In the UI this is the sign button on the Thread (`ThreadPage`); the ceremony
chains signatures across the required parties.

## Cleaning up sandbox test data

On demo it is fine to leave test cases; they do not affect anyone. If you want a
clean slate, cancel/withdraw the cases you opened (orders have a `/cancel`
action; most chains have a terminal `waive`/`withdraw`/`cancel` transition). Do
NOT delete rows directly from D1 unless you understand the cascade and audit
implications - the audit chains expect transitions, not raw deletes.

## Where to find a chain's exact endpoints

1. Find the chain's mount prefix: grep `mount-routes.ts` for the chain (e.g.
   `app.route('/api/take-or-pay/chain', ...)`).
2. Open that route module in `src/routes/` and read its `app.post('/:id/<action>')`
   lines - those are the available transitions.
3. Or read the chain descriptor in `MERIDIAN_CHAINS`
   (`src/utils/chain-registry-meridian.ts`): it lists the chain's table, columns,
   lanes, and actions, which the UI uses to build the Ledger and Thread.
