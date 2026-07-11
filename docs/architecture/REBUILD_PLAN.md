# Open Energy — Ground-Up Rebuild Plan (Backend)

**Status:** proposed, branch `feat/ground-up-rebuild`. No code written yet. This document is the plan the implementation must be diffed against.

**Date:** 2026-07-10.

---

## 0. Supersession notice

[ECOSYSTEM_REBUILD_BLUEPRINT.md](ECOSYSTEM_REBUILD_BLUEPRINT.md) line 3 reads:

> **Decision: Do NOT rewrite. Add three layers on top of the 74 correct chains.**

That decision was taken 2026-06-06 on the reasoning that a rewrite "throws away validated business logic for 18–24 months and gains nothing." **This document supersedes it.** What changed:

1. The blueprint's own unifying principle — *"every state transition emits one canonical `PlatformEvent`"* — is a rebuild thesis. It was proposed as a layer bolted onto 148 chain modules that do not, in fact, share a state-transition abstraction. There is nothing for the layer to sit on. `src/utils/chain-state.ts:20-26` documents the consequence in the code: ~22% of status tokens are context-dependent, so the platform cannot say what "open" means without a per-chain exception table.
2. The blueprint accepted `status` as free text. Four tokens (`draft`/`pending`/`approved`/`submitted`) appear **360 times** as string literals in `src/routes/`. Layering an event bus over free-text status produces an event bus with free-text status.
3. The blueprint did not address tenancy. `src/utils/tenant.ts:28` resolves exactly one `tenant_id` per request. A marketplace transaction has two owners. Bilateral visibility is *inexpressible* today, not merely unimplemented. No layer fixes a missing relation.

**What survives from the blueprint, unchanged, as binding fact:**

- The four **LOCKED DECISIONS** (cascade unattended-by-default with `mode: drive|block` and a `system:cascade` actor carrying the originating `event_id`; fees ship all-free and operator-flippable; scale target NATIONAL FULL 10k+ players; payer is per-fee via `payer_role` + `payer_resolution`).
- The **TOP 10 cross-chain interactions**. These are the real edges of the business. They are reproduced in §12 as the acceptance criteria for the engine, not as a wish list.
- The **national-scale constraints** (D1 write ceiling, sharding, batched sweeps, KV-cached counts). Folded into §7.
- The **"what must not change"** list, reinterpreted: it is not a prohibition, it is an inventory of what must be *extracted* before it is deleted. See §13.

---

## 1. Diagnosis — five structural findings

The platform orbits *features*, not *the transaction*. Cohesion is a structural property, not a visual one. Four properties make a system feel like one platform; none are present:

1. One canonical object everything orbits.
2. Data flows along that object rather than being re-keyed onto it.
3. A handoff pulls the next role in.
4. Home shows your work, not a menu of functions.

| | Finding | Evidence |
|---|---|---|
| **S1** | There is no state machine. Status is free text. | ~148 chain tables, each with its own `status`. `'draft'\|'pending'\|'approved'\|'submitted'` × 360 literal occurrences in `src/routes/`. `isTerminalStatus()` substring-matches a 24-token list ([chain-state.ts:27-32](../../open-energy-platform/src/utils/chain-state.ts)). Exactly **5** chains classify exactly ([chain-terminal-registry.ts:36-40](../../open-energy-platform/src/utils/chain-terminal-registry.ts)). |
| **S2** | The event log exists but is an analytics sink, not the source of truth. | `cascade.ts:14` imports `recordPlatformEvent` from `analytics-sink.ts`. Readers: `insights.ts`, `metrics-rollup.ts`, `chain-state.ts`. Nothing *reads state* from it. |
| **S3** | Tenancy is single-owner; a marketplace transaction has two owners. | `tenant.ts:28`, `:45`, `:105`. Tier-2 (bilateral) visibility is inexpressible. |
| **S4** | The spine covers 17 chains; the platform has ~148. | `MERIDIAN_CHAINS` has 17 entries. Atlas-as-function-menu is the fallback surface for the ~131 unregistered chains — a structural consequence, not a UI choice. |
| **S5** | Money does not move. | `wrangler.toml:87,259` bind exactly one DO class, `OrderBook`. `src/do/` contains `order-book.ts` and nothing else. `class Escrow` / `class Risk` / `class Smart` exist nowhere. Settlement writes ledger rows against no custody and no payment rails. |

**Leverage order.** S1 and S2 are one change, not two: making the log authoritative *is* making status a state machine. S3 follows and unblocks the visibility gap at the root. S4 falls out of S1+S2 for free. S5 is separate — and it is **not** the benign out-of-scope item an earlier draft of this document claimed. See §1.1.

### 1.1 S5 in full: money does not move, and the rebuild makes that *harder* to see

An earlier draft of this section read: *"S5 is a product and licensing decision, not an architectural one — untouched by this rebuild. The rebuild neither adds nor removes that gap; it makes it visible instead of implied."*

**That is false, and it is the most dangerous sentence in this plan.** Two independent expert reviews — a capital-markets clearing architect and a project-finance lender — reached the same conclusion from opposite directions.

**The facts, unchanged:**

- `wrangler.toml:87,259` bind exactly one Durable Object class: `OrderBook`.
- `src/do/` contains `order-book.ts` and nothing else. `class Escrow`, `class Risk`, `class Smart` exist nowhere in the repo.
- Settlement writes ledger rows against **no custody and no payment rails**. There is no client money account, no bank sponsor, no PASA/SARB integration, no FMA licence.
- A transition named `settled` sets a string. A transition named `disbursed` sets a string. **No cash moves in either case.**

**Why the rebuild makes it worse rather than neutral.** Today the settlement surfaces look like the rest of the platform: hand-built CRUD with a `status` column. Their unreliability is legible in their shabbiness. After the rebuild, `settlement-dvp`, `settlement-fail`, `disbursement`, `counterparty-margin`, `ccp-assessment`, `capital-adequacy` and `clearing-disclosure` become clean `ChainDecl`s. They acquire a hash-chained event log, a per-transaction Merkle proof, an R2 object-lock anchor, and a first-class regulator export pack (§L6) — **and not one field anywhere in that stack records that no finality occurred.**

> *"The rebuild's claim that it 'makes the gap visible' is false as specified: the gap is made more invisible. The new engine renders the theatre with a straight, tamper-evident face."*
> — capital-markets clearing architect, finding F1 (BLOCKER)

> *"A state called `disbursed` that corresponds to no payment is a lie in the system of record. Building tamper-evidence around a false assertion is worse than not recording it."*
> — project-finance lender, finding 5 (BLOCKER)

Tamper-evidence attests that *the record was not altered*. It says nothing about whether the record was *true when written*. Applying cryptographic integrity to a false assertion does not detect the falsehood; it certifies it and timestamps it.

**The regulatory exposure this creates.**

- **CPMI-IOSCO PFMI Principle 8 (settlement finality)** is definitionally unreachable without custody. The platform runs a `0 6 1 * *` cron named "CPMI-IOSCO PFMI disclosure sweep." A disclosure that a system has finality it does not have is worse than no disclosure.
- **PFMI Principle 9 (money settlements)** requires settlement in central-bank or commercial-bank money. Neither exists here.
- **Financial Markets Act 19/2012 §7, §27, §47** — operating or *holding out* as a clearing house, CSD, or market infrastructure without authorisation is an offence. A tamper-evident, regulator-addressed export pack asserting settlement finality is the strongest possible act of holding out.

**Therefore, three requirements, binding on the rebuild, none of them optional:**

**R-S5-1 — `settles: false` is a mandatory field, not a comment.** Every `ChainDecl` that names a money-movement state carries an explicit, non-defaulted, machine-checked declaration:

```ts
interface ChainDecl {
  // ...
  /** Whether a transition to a terminal money state corresponds to
   *  an actual movement of funds under custody. There is no default.
   *  Every declaration in the settlement, disbursement, margin and
   *  clearing domains MUST set this explicitly. */
  settles: boolean;
  /** Required when settles === false. Rendered verbatim on the
   *  Transaction page and stamped on every L6 export. */
  record_only_notice?: string;
}
```

A property test (§14) asserts: for every declaration whose `key` matches the settlement / disbursement / margin / clearing domain list, `settles` is present; and if `settles === false`, `record_only_notice` is non-empty. **A missing `settles` fails the build.** Today, every one of them is `false`.

**R-S5-2 — states are named for what actually happens.** A state name is an assertion in the system of record. Rename, across every declaration:

| Lying name | Honest name | What makes the honest state reachable |
|---|---|---|
| `disbursed` | `disbursement_instructed` | — |
| `settled` | `settlement_instructed` | — |
| `funded` (reserve account) | `funding_instructed` | — |
| `margin_called` → `margin_met` | `margin_payment_asserted` | — |
| *(new, unreachable today)* | `disbursed` / `settled` / `funded` | A `reconciled` event emitted by the account bank or the STRATE/SWIFT connector, carrying the bank's own confirmation reference in `payload.bank_reference`. |

The honest terminal states remain **declared but unreachable** until a rail exists. That is the correct representation of the world: the state machine *has* a `settled` state, and nothing in the platform can currently produce the event that enters it. The gap becomes a structural property of the declaration rather than a paragraph in a design document nobody reads.

**R-S5-3 — L6 stamps every pack, unconditionally.** `exportPack()` walks the declarations of every chain in the pack. If any has `settles === false`, the pack header carries, un-suppressible and not configurable:

```
NO SETTLEMENT FINALITY — RECORD ONLY
This pack records instructions and their authorisation chain.
It does not evidence the movement of funds.
The operator holds no custody, operates no payment rails, and holds
no licence under the Financial Markets Act 19/2012.
```

The same notice renders on the Transaction page ([REBUILD_FRONTEND.md §4](../design/REBUILD_FRONTEND.md)) for those chains, in text, above the timeline — not in a tooltip, not behind a disclosure triangle.

The statute citation line (here, FMA 19/2012) comes from `pack.settlement_disclaimer.statute_citation` (§8.2) so a Kenyan deployment cites the right Act. The literal `NO SETTLEMENT FINALITY — RECORD ONLY` marker, its un-suppressibility, and the walk over `settles === false` declarations are **engine invariants in every market** — no pack can remove them.

**What is still out of scope.** Building custody and rails. That needs an FSP licence, a bank sponsor, and PASA/SARB integration, and no amount of architecture substitutes for it. **What is emphatically *in* scope is refusing to render the absence as a presence.** The three requirements above are cheap — one field, a rename, one string in the export header — and without them this rebuild ships a regulator-grade lie.

---

## 2. The one rule

> **Input is always generated from the declaration. Presentation may be custom. There is no exception for input.**

Custom **read-only** renders are permitted and expected: a settlement statement, a depth ladder, an EVM S-curve, a Gantt. Never a custom form, never a custom action button, never a bespoke validation.

Input is where correctness lives: guards, validation, transitions, audit, rejection reason codes. Break the rule once for a good reason and it will be broken 148 times for good reasons. That is exactly how the current system arrived at 356 route modules.

This rule alone decides whether the rebuild was worth its cost.

---

## 3. Backend layers

```
L0  identity + parties-on-transaction   (txn_id × participant_id × role_on_txn)
L1  append-only hash-chained event log  (tamper-evident from day one)
L2  applyTransition(txn, edge, actor)   (validate guard → append event → project)
L3  ~148 chain declarations             (states, transitions, guards, fields, visibility, timers, effects)
L4  projections                         (generated from L3; tables are caches, never truth)
L5  UI contract                         (generated from L3)
L6  regulator export                    (a read over L1)
```

L0–L2 ≈ 2,000 LOC. L3 is data. L4–L6 are generic. Against ~100,000 LOC today (356 route modules × ~300 LOC).

### L0 — Identity and parties

```sql
CREATE TABLE participant (
  id            TEXT PRIMARY KEY,        -- uuidv7
  legal_name    TEXT NOT NULL,
  reg_no        TEXT,                    -- home-registry number (CIPC in SA; BRS in Kenya)
  jurisdiction  TEXT NOT NULL,           -- ISO 3166-1 alpha-2. admission gates + legalBasis resolve on (market, jurisdiction)
  kind          TEXT NOT NULL,           -- company | natural_person | organ_of_state
  created_at    TEXT NOT NULL
);

CREATE TABLE actor (                      -- a human or machine that can fire a transition
  id            TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participant(id),
  kind          TEXT NOT NULL,           -- user | system | connector
  email         TEXT,
  idp_sub       TEXT UNIQUE,             -- WorkOS subject. NULL until first login (invited, legacy).
  created_at    TEXT NOT NULL
);

CREATE TABLE txn (                        -- the canonical object. every chain instance is one row.
  id            TEXT PRIMARY KEY,        -- uuidv7
  chain_key     TEXT NOT NULL,           -- 'ppa_contract'
  human_ref     TEXT NOT NULL UNIQUE,    -- 'PPA-26-7K3M'  (never show a UUID to a human)
  title         TEXT NOT NULL,           -- from decl.nameFrom(fields)
  state         TEXT NOT NULL,           -- projection of the log; NOT authoritative
  seq           INTEGER NOT NULL,        -- last applied event seq; optimistic-concurrency token
  visibility    TEXT NOT NULL,           -- public | party | owner
  opened_at     TEXT NOT NULL,
  closed_at     TEXT
);

CREATE TABLE party_on_txn (               -- THE relation S3 is missing
  txn_id           TEXT NOT NULL REFERENCES txn(id),
  participant_id   TEXT NOT NULL REFERENCES participant(id),
  role_on_txn      TEXT NOT NULL,        -- 'seller' | 'buyer' | 'lender' | 'statutory_observer' | ...
  terms            TEXT,                 -- canonical JSON. see "A party has terms" below.
  from_event_id    TEXT NOT NULL,        -- when they joined. a party row is created BY a transition.
  until_event_id   TEXT,                 -- when they left. never DELETE.
  PRIMARY KEY (txn_id, participant_id, role_on_txn)
);
CREATE INDEX idx_party_participant ON party_on_txn(participant_id, txn_id);
```

Every authorization question is one join. Every visibility question is one join. `tenant_id` is deleted as a concept: a participant sees a transaction because it has a `party_on_txn` row, not because a JWT claim matched a column.

#### A party has terms — syndicates, quorum

> *"A syndicate is not a participant, and `role_on_txn = 'lender'` × 5 rows is not a syndicate."*
> — project-finance lender review

Each lender on a facility holds a **commitment**, a **pro-rata share**, a **voting weight** and a **tranche**. Waivers, accelerations and drawstops are taken by *majority lenders* — typically 66⅔% by commitment, sometimes unanimity for a reserved matter (tenor, margin, security release). A design with five identical party rows cannot express a single one of those decisions.

```ts
type LenderTerms = {
  commitment_minor: number;  // minor units of the tranche's settlement currency
  pro_rata: number;          // derived; asserted, and checked to sum to 1.0 across the tranche
  voting_weight: number;     // usually = pro_rata. sometimes not (sponsor-affiliated lender).
  tranche: string;           // 'senior_a' | 'senior_b' | 'mezz'
};
```

`terms` is written **only by a transition** (`admit_lender`, `transfer_participation`, `cancel_commitment`) and is never `UPDATE`d in place. A change closes the old row (`until_event_id`) and opens a new one. The party table is therefore as append-only as the log, and "who held what share on 3 March" is answerable without replay.

Quorum is a **guard primitive**, not a chain:

```ts
// guards/quorum.ts — one implementation, every consent edge
quorum({ role: 'lender', basis: 'voting_weight', threshold: 0.6667, scope: 'tranche:senior_a' })
```

It reads the consent events already in this transaction's own log (`type = '<chain>.consent'`), sums `terms.voting_weight` over the consenting parties, and rejects with `QUORUM_NOT_MET` carrying `{ have, need, missing_participants }`. Reserved matters declare `threshold: 1.0`.

**There is no "the syndicate approved" event.** There are N consent events and one guard that counts them. That is what actually happened, and it is what the facility agreement says happened.

#### Transactions link to transactions

The DSL rot guard (§L3) says a declaration may reference only its own fields, its own log, and reference data. That rule is correct and it leaves a hole: a drawdown is approved subject to ~40 conditions precedent, and each condition precedent is **its own transaction**, with its own party, its own evidence and its own state.

```sql
CREATE TABLE txn_link (
  from_txn_id   TEXT NOT NULL REFERENCES txn(id),
  to_txn_id     TEXT NOT NULL REFERENCES txn(id),
  kind          TEXT NOT NULL,   -- 'condition_of' | 'child_of' | 'compensates' | 'collateralises' | 'supersedes'
  from_event_id TEXT NOT NULL,   -- a link is created BY a transition. never by a background job.
  until_event_id TEXT,
  PRIMARY KEY (from_txn_id, to_txn_id, kind)
);
CREATE INDEX idx_txn_link_to ON txn_link(to_txn_id, kind);
```

`caused_by` on the event answers *"what created this?"*. `txn_link` answers *"what does this depend on?"*. They are different questions and the first draft of this plan conflated them.

The guard `allConditionsMet('condition_of')` is a **named handler**, not a declaration expression. Its read-scope is defined in §L2 — this is the case that forced the definition.

#### The facility is the unit of work

> *"In project finance the facility IS the unit of work. A drawdown that does not know its facility is a form, not a transaction."*
> — project-finance lender review

The facility **is a transaction** whose `chain_key` is `facility`. Every drawdown carries `txn_link(drawdown → facility, kind = 'child_of')`. That one relation buys:

- lender parties resolved by walking `child_of` — a drawdown does not re-declare the syndicate;
- `drawstop` is one transition on the facility and one guard on every child (`parentState('facility') ∉ {'drawstopped','accelerated'}`);
- Home and Find group by facility for free.

The same shape covers **project** (an IPP's WBS, EVM, permits, RFIs, change orders all `child_of` the project) and **site** (assets, work orders, permits-to-work). Three aggregates, one mechanism, zero new machinery.

#### The regulator is not a silent observer

The first draft said: when a declaration's `crossesIntoRegulator` predicate fires, an **effect adds a `statutory_observer` party row**, so regulator access is itself an audited event with a cause. That is right for ERA 2006 §10 oversight and **wrong** for two cases counsel caught.

1. A compulsory statutory power is not a party role. Modelling a subpoena as a seat at the table inverts it: the authority does not *join* the transaction, it *compels* production from the operator.
2. **FICA §29(4) — tipping-off.** A `statutory_observer` row is visible to every party on the transaction. A suspicious-transaction report modelled that way leaks the STR to its subject by construction. That is an offence.

The rule therefore splits:

- **Oversight** — `role_on_txn = 'statutory_observer'`, a normal party row, visible, audited, caused by a transition. NERSA seeing a licence application it must decide.
- **Compulsion and reporting** — `statutory_access`, never joined to `party_on_txn`, never rendered on any party-addressed surface.

```sql
CREATE TABLE statutory_access (
  id            TEXT PRIMARY KEY,
  txn_id        TEXT,             -- nullable: a compelled search may be over a query, not one txn
  query_hash    TEXT,             -- canonical hash of the search predicate
  authority     TEXT NOT NULL,    -- pack.regulators[].id — 'NERSA' | 'FSCA' | 'FIC' | 'SARS' in the SA pack
  legal_basis   TEXT NOT NULL,    -- 'FICA s29' | 'FMA s93' | 'warrant ref'
  suppressed    INTEGER NOT NULL, -- 1 = tipping-off prohibition applies. never surfaced to parties.
  occurred_at   TEXT NOT NULL,
  actor_id      TEXT NOT NULL
);
```

A `suppressed = 1` row is invisible to `TxnView`, to Find, and to the party-addressed export. It appears only in the authority-addressed pack. This is the one place in the design where the log is not fully transparent to its subjects; it is compelled by statute; and it is written down here rather than discovered in a courtroom.

### L1 — The log

```sql
CREATE TABLE event (
  txn_id           TEXT NOT NULL,
  seq              INTEGER NOT NULL,      -- 1..n within txn. gapless.
  event_id         TEXT NOT NULL UNIQUE,  -- uuidv7, globally unique, sortable by time
  chain_key        TEXT NOT NULL,
  type             TEXT NOT NULL,         -- 'ppa_contract.counter_sign'  (chain_key + '.' + edge id)
  from_state       TEXT NOT NULL,
  to_state         TEXT NOT NULL,
  actor_id         TEXT NOT NULL,
  actor_kind       TEXT NOT NULL,         -- user | system:timer | system:cascade | connector
  on_behalf_of     TEXT,                  -- participant_id when a support/admin acts for another
  occurred_at      TEXT NOT NULL,         -- RFC3339 UTC, from the injected clock. never now().
  caused_by        TEXT,                  -- event_id of the event that triggered this one
  reason_code      TEXT,                  -- structured, from the declaration's reason vocabulary
  reason_text      TEXT,
  payload          TEXT NOT NULL,         -- canonical JSON
  payload_version  INTEGER NOT NULL,
  prev_hash        TEXT NOT NULL,         -- hash of event (txn_id, seq-1). genesis = chain_key hash.
  hash             TEXT NOT NULL,         -- sha256(canonical_json(row without hash))
  PRIMARY KEY (txn_id, seq)
);
CREATE INDEX idx_event_chain_time ON event(chain_key, occurred_at);
CREATE INDEX idx_event_caused_by ON event(caused_by);
```

**Hash-chain topology — a deliberate choice.** The chain is **per-transaction**, not global. A global chain serialises every write on the platform behind one head pointer; at 10k participants that is a hard throughput ceiling for zero benefit. Instead:

- per-`txn_id` chain gives tamper-evidence *within* a transaction, which is the unit a court or regulator examines;
- an hourly job takes a **Merkle root over all `event_id`s in the window**, chains those roots daily, and anchors the daily root to R2 with object-lock. That gives global ordering evidence without global write serialisation.

This is the existing `publishChainHeadToR2` idea, promoted from a nightly analytics job to the integrity primitive.

**Telemetry is not an event.** Meter reads, SCADA points, inverter samples do **not** enter the log. They land in R2 + Analytics Engine and are referenced by hash from the events that *assert* something about them ("reading batch `sha256:…` approved"). Confusing time-series ingest with the transaction log is what makes people believe they need a distributed database. The log's real volume is ~10k participants × ~50 transitions/day ≈ 500k events/day ≈ 6 writes/s average, ~100/s peak. D1 handles that.

#### The log outgrows one D1 database, and the naive fix does not exist

500k events/day at ~1.5 KB/row is ~275 GB/year. D1's hard ceiling is **10 GB per
database**. The plan cannot keep one year of log in one database, and the obvious
patch — "shard the log by year, expose a cross-database `VIEW`" — **is not a D1
feature**: D1 has no cross-database query and no cross-database view. State it plainly
so no one designs a regulator export against a VIEW that will never exist.

The shape that works:

- **Hot database** holds the open transactions and a rolling 90 days of closed ones —
  everything Home, Transaction, and the guards read. Bounded, well under 10 GB.
- **Cold, per-year archive databases** (`log_2026`, `log_2027`) are written once by a
  monthly sealing job and thereafter read-only. A transaction is copied whole — every
  `seq` of its chain — never split across a year boundary, so per-txn hash verification
  never needs two databases.
- **The regulator export (§L6) fans out across databases in application code**, not in
  SQL. It is a `Promise.all` over the year-databases in range, merged by `occurred_at`.
  The binding is a static list of D1 bindings in `wrangler.toml`, so no identifier comes
  from request input.

The Merkle roots (below) are what make this safe: a cold archive proves it was not
touched after sealing without re-reading the hot database.

#### The Merkle window and the R2 anchor are not yet regulator-grade

Two corrections to "hourly Merkle root, daily root anchored to R2 with object-lock":

1. **"Root over all `event_id`s in the window" is computed over a set the writer
   defines.** If the window is "events whose `occurred_at` falls in the hour" and
   `occurred_at` comes from the injected clock, a late or backdated write lands in an
   already-rooted window and the root no longer covers it. The window must be defined by
   a **monotonic seal counter**, not wall-clock: each root covers `event_id`s with a
   global sequence in `(last_sealed, now_sealed]`, assigned by the sealing job itself,
   and the root records `[from_global_seq, to_global_seq]`. An event that misses its
   window is impossible because the window is defined by what has been sealed, not by a
   timestamp the event carries.

2. **Self-custody WORM is not third-party anchoring.** R2 object-lock stops *us* from
   editing the object, but we hold the account, we supply the clock, and the genesis hash
   is publicly derivable — a party who can rewrite history for 24–48h before the next
   anchor can also rewrite the anchor. Regulator-grade finality needs the daily root
   **countersigned outside our trust boundary**: emailed/API-posted to an endpoint the
   regulator operates, or committed to a public transparency log (RFC 6962-style) whose
   operator is not us. The countersignatory comes from
   `pack.regulators[].anchor_countersignatory {kind: 'endpoint' | 'rfc6962', url}` — in
   the SA pack that is NERSA's own endpoint. The plan ships the R2 anchor as the P0
   integrity primitive and the external countersignature as a **P1 blocker**, not a
   nice-to-have. Until it exists, §L6 stamps every pack "integrity self-attested, not
   third-party anchored."

#### POPIA erasure versus an append-only log — the one that has no clean answer

`party_on_txn` and `event` say "never DELETE." POPIA §24(1)(b) gives a data subject the
right to **deletion** of their personal information. These are in direct conflict, and the
plan named it nowhere. The resolution is not "we're append-only, so we can't" — that is a
POPIA violation, not an architecture.

- **PII never enters the log body.** `payload` and `reason_text` carry references, not
  personal data: `participant_id`, `document_hash`, `evidence_url`. The name, ID number,
  bank account, and contact details live in the `participant` projection and in R2
  documents — **outside** the hash chain. This split is also the **data-residency
  invariant** for markets with hard localisation law (Zambia's Data Protection Act 2021):
  the PII vault relocates in-country while the reference-only event log stays on
  Cloudflare, because the log carries no personal data to localise.
- **Erasure is crypto-shredding.** Each participant's PII fields are encrypted under a
  per-participant key held in a key table. A §24(1)(b) erasure **deletes the key**. The
  log rows survive — their hashes still verify, the chain is intact — but the PII they
  reference is unrecoverable ciphertext. This is the only technique that satisfies both
  "tamper-evident append-only" and "right to deletion" at once.
- **Retention is a schedule, not "forever."** Each `chain_key` declares a retention
  period (FICA §23: 5 years after the business relationship ends; tax records 5 years;
  REIPPPP contract life + statutory tail). A monthly job crypto-shreds participants whose
  every transaction has passed its retention horizon **and** carries no legal hold.
- **Legal hold overrides retention and erasure both.** A `legal_hold` row (scope,
  authority, opened_at) suspends both the retention shred and a §24(1)(b) request — POPIA
  §14(6) permits continued retention where required for legal proceedings. An erasure
  request against a held participant returns a lawful refusal with the hold reference,
  which is itself an event.

#### R2 has no South African region — POPIA §72

POPIA §72 restricts cross-border transfer of personal information. R2's `location_hint`
offers no `af-south` region; today the documents and telemetry sit outside South Africa.
This is a **compliance blocker for a national regulator deployment**, not a footnote. Two
lawful paths: (a) §72(1)(a) — the data subject consents, captured as an onboarding
transition with a reason code; or (b) keep PII-bearing documents in an in-country object
store (a POPIA-compliant SA provider) and keep only hashes + non-personal telemetry in
R2. The plan records this as an open procurement decision with a legal deadline, not a
solved problem. Per market, the chosen mechanism and vault location come from
`pack.data_transfer {mechanism, pii_vault_region?}` (§8.2) — SA answers POPIA §72 here;
Kenya answers its Data Protection Act 2019 s48–49 with different values, same field.

### L2 — The engine

```ts
interface Command {
  txn_id: string;              // or a new uuidv7 for the initiating edge
  chain_key: string;
  edge: string;                // transition id
  actor: Actor;
  input: Json;
  expected_seq: Record<string, number>;  // txn_id → seq. one entry per transaction the
                               // batch touches, including aggregates the guards read.
                               // { [txn_id]: -1 } for an initiating edge.
                               // see "Write skew", below — this is not scalar, and the
                               // reason it is not scalar is the whole subsection.
  idempotency_key: string;     // client-generated; unique index. replay-safe.
  reason_code?: string;
  caused_by?: string;          // set by the cascade runner, never by a browser
}

type Result =
  | { ok: true;  event: EventRow; txn: TxnRow }
  | { ok: false; code: RejectionCode; guard: string; message: string; evidence?: Json };

async function applyTransition(ctx: Ctx, cmd: Command): Promise<Result>;
```

Steps, in order, no exceptions:

1. **Resolve declaration** `decl = CHAINS[cmd.chain_key]`, `edge = decl.transitions[cmd.edge]`. Unknown → reject `UNKNOWN_EDGE`.
2. **Load transaction + parties** (one query). `expected_seq !== txn.seq` → reject `STALE` and return the current state so the client can re-render rather than retry blindly.
3. **Authorize.** `cmd.actor.participant_id` must hold a live `party_on_txn` row whose `role_on_txn ∈ edge.by`. `system:timer` and `system:cascade` are authorized by declaration, not by party row, and are recorded as such.
4. **State check.** `txn.state ∈ edge.from`.
5. **Validate input** against `edge.input` field declarations. Coercion is explicit; no truthiness.
6. **Run *every* guard. Persist all verdicts. Surface the first rejection.** See "Guard evaluation" below — this is not the same as "first rejection wins", and the difference is a regulatory reporting defect.
7. **Build the event.** `occurred_at = ctx.clock.now()`. `prev_hash` from `(txn_id, seq)`. `hash = sha256(canonical(event))`.
8. **One `env.DB.batch([...])`** — this is the transaction; loose sequential `.run()` calls are not:
   - `INSERT INTO event (...)` — `PRIMARY KEY (txn_id, seq)` is the concurrency guard. The **only** statement in the batch permitted to hard-fail.
   - `UPDATE txn SET state=?, seq=?, title=?, closed_at=? WHERE id=? AND seq=?`
   - projector writes (§L4)
   - `INSERT OR IGNORE INTO party_on_txn` for any party the edge admits
   - `INSERT OR IGNORE INTO timer` for any timer the target state arms; `DELETE FROM timer` for any it disarms
   - `INSERT OR IGNORE INTO outbox (event_id, ...)` — the only asynchrony boundary
   - guard-readable flags the edge sets (see "Blocking effects", below)

   The `OR IGNORE` on party, timer and outbox rows is not sloppiness. Those rows are idempotent by key; the event row is not. Making them `OR IGNORE` means a `batch()` rejection can only have come from `(txn_id, seq)`, so step 9 never has to parse a driver error string to know it lost a race. **D1 does not tell you which statement in a batch failed.** Design the batch so there is only one candidate.
9. **Constraint violation on `(txn_id, seq)`** → someone else won the race. Reload the txn, **re-run the guards against the reloaded state**, **rebuild the event from scratch** — new `seq`, new `prev_hash` read from the winner's row, new `hash` over the new canonical bytes — and retry, ≤ 3 times, then reject `CONTENTION`.

   > Reusing the first attempt's `prev_hash` or `hash` on retry writes a row whose hash does not cover its own `prev_hash`. The chain still *verifies* forward from genesis on the day it is written and fails a year later when someone recomputes it. This is the single most dangerous line of code in the engine, and it is three lines from being wrong.

10. **Return.** The response carries the new state *and* the list of transitions now available to this actor, each with its guard verdict. The UI never computes affordances; it renders them.

#### Guard evaluation — read-scope, order, and the full verdict vector

A guard is a named handler in ordinary TypeScript, resolved from a registry, with this signature and no other:

```ts
type GuardCtx = {
  txn: TxnRow;                       // this transaction
  parties: PartyOnTxn[];             // its live party rows
  events: EventRow[];                // its own log, in full
  input: Json;                       // the validated edge input
  actor: Actor;
  at: Instant;                       // the event's occurred_at. NOT now().
  reference: (key: string) => Json;  // reference_value as of `at`. bi-temporal.
  linked: (kind: LinkKind) => Array<{ txn: TxnRow; state: string }>;  // txn_link. see below.
};
type Guard = (g: GuardCtx) => { ok: true } | { ok: false; code: RejectionCode; evidence?: Json };
```

**Read-scope is exactly that struct.** A guard may read: this transaction's row, its parties, its own event log, its input, reference data as of `at`, and the **state and identity** of transactions linked to it by `txn_link`. It may read nothing else. No `env`. No `fetch`. No clock. No `SELECT`.

This is what `allConditionsMet('condition_of')` needs and all it needs: `linked('condition_of').every(l => l.txn.state === 'satisfied')`. The ~40 conditions precedent to a drawdown are 40 `txn_link` rows; the guard reads 40 states. It never reads their fields, their parties, or their logs — a condition precedent is satisfied or it is not, and that fact is a state, not a computation over someone else's data. **If a guard needs another transaction's field values, the declaration is wrong: that value should have been copied onto this transaction by the transition that linked them, where it is attributable to an actor and an event.**

`linked()` is resolved by the engine in step 2 — one `SELECT ... JOIN txn_link` — not by the guard. Guards perform no I/O. That is what makes step 6 a pure function of loaded state, which is what makes the `blockedBy` dry-run (§L5) cheap and honest, and what makes guard replay possible during an L6 audit.

**Every guard runs. Every verdict is persisted.**

```ts
const verdicts = decl.transitions[cmd.edge].guards.map(ref => ({ ref, ...REGISTRY[ref](gctx) }));
const failed   = verdicts.filter(v => !v.ok);
if (failed.length) return { ok: false, ...failed[0], evidence: { guards_failed: failed } };
```

The **user** sees `failed[0]` — the first failure in declared order, which preserves the semantics of `pre-trade-guards.ts` (credit → exposure → mark age → halt → KYC) where the order determines which reason code a trader reads. Guard order is part of the declaration and is covered by a golden test.

The **rejection record** carries all of them. First-rejection-wins as a *storage* strategy destroys the breach vector: an order that trips the credit limit *and* the position limit *and* KYC is recorded, forever, as one credit breach. Every count of "how many position-limit breaches occurred this quarter" computed off that log is wrong, low, and unauditable. Surveillance needs the vector. The trader needs one sentence. Compute the vector; render the sentence.

Rejections are appended to the log too — `to_state = from_state`, `type = '<chain>.<edge>.rejected'`. A rejected order is a market event.

#### Blocking effects — what `mode: 'block'` actually is

An earlier draft said the ten safety-critical cascades "run inline inside the batch." **That is not implementable.** `env.DB.batch()` accepts an array of *bound SQL statements*. It does not accept code. A blocking effect that must load another transaction, evaluate its guards, and compute a hash cannot be a statement in a batch.

Worse, the two canonical examples — the algo kill-switch and the market halt — do not even live in the same consistency domain as the trades they must stop. Matching happens in the `OrderBook` Durable Object. A halt written to D1 is not visible to the DO until the DO reads D1, and every trade matched in that window executed against a halted market. No batch, atomic or otherwise, closes that gap.

So the mechanism splits by domain:

**Case 1 — blocking effects inside D1.** The effect is not code that runs; it is a **flag written in the same batch as the causing event, which the guards of the affected transitions read on their next evaluation.** A permit-to-work suspension is a row: `INSERT INTO block_flag (scope, reason_event_id, ...)`, written in the batch that appends `permit.suspend`. Every work-order transition declares `guards: ['noBlockFlag']`, and that guard reads the flag through `linked('child_of')` or a scope key. Nothing runs inline. Atomicity is real, because the flag and the event commit together. `blocking?: EffectRef[]` in the `ChainDecl` is therefore renamed **`sets?: FlagRef[]`** — a declaration of which flags this edge raises or clears, compiled to `INSERT`/`DELETE` statements that join the batch.

**Case 2 — halt authority for the matching engine.** It lives in the `OrderBook` DO, not in D1. A halt is a `fetch` to every shard's DO, and it returns only when every shard has acknowledged; the D1 event is appended *after* the acknowledgements, recording an act that has already taken effect. Order of operations is: **stop the engine, then write it down.** The reverse — write it down and let the engine notice — is what the current system does, and it is the reason a kill-switch has a propagation delay measured in whatever the cache TTL happens to be. A halt that is not synchronous with matching is not a kill-switch, it is a memo.

There are ten of these (§12). Two are Case 2. Eight are Case 1.

#### Write skew, and what deleting `locks.ts` costs

**No lock table.** `src/utils/locks.ts` is deleted. The `(txn_id, seq)` unique index serialises writes to *one transaction's own stream*, and it is free.

It does not serialise anything else. A guard that reads an aggregate spanning many transactions — utilised credit across a participant's open orders, total commitment drawn against a facility, tonnes retired against a carbon serial — reads it *before* the batch commits. Two commands, each individually under the limit, can both pass and both commit. Neither one's `(txn_id, seq)` collides, because they are different transactions. This is **write skew**, and the unique index is structurally incapable of preventing it. `locks.ts` prevented it. Deleting `locks.ts` without a replacement re-opens it under a new name.

Three replacements, chosen per constraint, never generically:

- **Constraint-as-index.** Where the invariant is uniqueness, express it as a unique index and let the batch fail. Carbon retirement is `UNIQUE(registry, serial_range)` on a projection row written *in the same batch as the retirement event*. A double retirement is a constraint violation, not a race the application has to reason about. Prefer this. It is the only one of the three that cannot be got wrong.
- **Aggregate-as-transaction.** Where the invariant is a running total, the aggregate **is a transaction with a `seq`**, and every command that consumes from it carries that aggregate's `expected_seq` too. The facility is already a `txn` (§L0). A drawdown that would exceed the facility appends an event to the *facility's* stream, so the facility's `(txn_id, seq)` index does the serialising. Two concurrent drawdowns contend on the facility, one gets `CONTENTION`, retries, and its guard now sees the other's committed draw. Credit and position limits work the same way: a participant's credit line is a transaction.
- **Single-writer DO.** Where the invariant spans a hot, high-frequency aggregate, it belongs in a Durable Object, which is a single-threaded serialiser by construction. The `OrderBook` already is this.

`expected_seq` on the command is therefore not scalar. It is `Record<txn_id, seq>` — one entry per transaction the batch touches. The engine checks all of them and the batch updates all of them.

> The rule to state plainly: **an invariant that spans transactions must be materialised as a transaction, an index, or a DO.** There is no fourth option, and "the guard checks it" is not one of them.

#### D1 has no session bookmarks

There is no read-your-writes token to carry from a write to a subsequent read. A read replica may serve a stale row moments after `batch()` returns. Two consequences, both structural:

- The `applyTransition` response returns the `TxnRow` and `EventRow` **it just built**, never a row it re-reads. The client renders from the response. It does not refetch.
- The cascade runner is fed the `event_id` through the queue and reads the event by primary key from the primary, never through a replica-eligible path.

Anything that must be read back after a write, and cannot be, is a design error, not an operational one.

#### Effects never run inline

The outbox row is consumed by a Cloudflare Queue → cascade runner, which calls `applyTransition` again with `caused_by = event_id` and `actor = system:cascade`. Effects are therefore *transitions on other transactions*, subject to the same guards, appearing in the same log, and visible in the same UI. `fireCascade`'s 655 callers collapse into a declaration field.

Queues deliver at-least-once. Every effect is therefore idempotent on the tuple **`(caused_by, edge, target_txn_id)`**, which is a unique index on `event`. For an effect that acts on an *existing* transaction, `target_txn_id` is known and the index does the work.

For an effect that **creates** a transaction, `target_txn_id` is generated inside the handler — so a redelivery generates a *different* uuid and the index never fires. The child would be created twice. The fix is that a creating effect does not mint a random id: **the new transaction's id is `uuidv5(caused_by, edge)`** — derived, deterministic, identical on every redelivery. The second delivery collides on `txn.id` and is a no-op. `idempotency_key` for the derived command is the same value.

This is the one place uuidv7's time-ordering is traded away for determinism, and it is the right trade: a cascade-born transaction sorts by its parent's time, which is what a human reading the causal graph expects anyway.

### L3 — Declarations

```ts
export interface ChainDecl {
  key: string;                          // 'ppa_contract'
                                        // a chain may ship several static VARIANTS in code
                                        // ('ppa_contract.default', 'ppa_contract.regulator_approved' —
                                        // Kenya's EPRA approves every PPA, Energy Act 2019 s163).
                                        // pack.enabled_chains selects one by key (§8.2). Packs never
                                        // define state machines — they only choose between them.
  noun: string;                         // 'PPA'
  refPrefix: string;                    // 'PPA' → human_ref 'PPA-26-7K3M'
  title: (f: Fields) => string;         // human name. NEVER a uuid. impossible to retrofit.
  legalBasis?: LegalBasis[];            // typed, not string[] — see below. mandatory for public/regulator-reachable chains
  visibility: 'public' | 'party' | 'owner';

  fields: Record<string, FieldDecl>;    // the whole data model of the chain
  roles: RoleOnTxn[];                   // who can be a party
  initial: string;
  states: Record<string, {
    label: string;
    terminal: boolean;                  // exact. no substring heuristic. this deletes chain-state.ts.
    holder: RoleOnTxn | 'none';         // whose court the ball is in → Home queue assignment
    sla?: Duration;                     // arms a timer on entry
  }>;

  transitions: Array<{
    id: string;                         // 'counter_sign'
    from: string | string[];
    to: string;
    by: RoleOnTxn[];
    label: string;                      // the button text. one place.
    intent: 'primary' | 'secondary' | 'destructive';
    decisionGroup?: string;             // see below. a determination, not a procedural act.
    input?: Record<string, FieldDecl>;  // the form. generated. see the one rule.
    steps?: Array<{                     // multi-page input. P1, not P3. see below.
      label: string;
      fields: string[];                 // keys into `input`. every key used exactly once.
    }>;
    guards: GuardRef[];                 // ordered. named handlers, resolved from a registry.
    effects?: EffectRef[];              // named handlers. emit follow-on Commands. never inline.
    sets?: FlagRef[];                   // block flags this edge raises or clears. compiled to
                                        // INSERT/DELETE statements that join the batch. §L2.
    requiresReason?: ReasonVocabulary;  // structured reason codes, not free text
    requiresQuorum?: QuorumSpec;        // §L0. syndicates.
    compensates?: string;               // this edge is the undo of that edge
  }>;

  timers?: Array<{ onState: string; after: Duration; fire: string; escalate?: string; kind: 'sla' | 'time_bar' }>;
}
```

**`settles` is mandatory and non-defaulted.** R-S5-1 (§1.1). The type has no `?`, and the
compiler will not let a declaration omit it. A chain whose terminal state implies the movement
of funds — `drawdown`, `ppa_settlement`, `margin_call`, `platform_invoice`, `carbon_levy` —
must declare `settles: true`, and a `settles: true` declaration must name a reconciling
connector or the bundle test fails. Nothing in the current platform can name one. Therefore
every chain ships `settles: false` with a `record_only_notice`, and that notice is rendered
on the transaction (§L5) and stamped on the export (§L6). The day a real account bank exists,
exactly one field flips, and the type system tells you which 14 declarations to revisit.

**`decisionGroup` separates a determination from a procedural act.** `approve`, `reject`,
`grant_with_conditions` share `decisionGroup: 'determination'`; `request_more_info`,
`assign_reviewer`, `extend_deadline` do not. The Transaction page (§4 of the frontend doc)
renders one Decision block containing only the transitions in the determination group; the
rest live in the `/` command bar. Without this field the UI is forced to guess, and it guesses
by `intent`, which is a visual property, not a legal one.

**`steps` cannot wait for P3.** `licence_application` has 40+ fields across five statutory
schedules; `drawdown` has a conditions-precedent checklist that no reviewer will complete on
one scroll. Both are P1 pilots. A `steps` array partitions `input` — every key used exactly
once, checked at bundle-build time — and `<TransitionForm>` renders a step rail. It is one
component prop, not a second form component. The one rule holds.

**`kind` on a timer is load-bearing, not metadata.** An SLA that expires produces an
escalation. A FIDIC clause-20 time bar that expires **extinguishes the right** — the claim
transition's guard begins to fail, permanently, and no escalation exists because there is
nothing left to escalate to. They are the same schema row and opposite legal objects. `kind`
is what the guard registry keys on: `withinTimeBar` reads the timer's `due_at` from the
transaction's own log and returns `TIME_BARRED` with `evidence: { bar_expired_at, event_id }`.
The frontend renders a countdown for `sla` and a **deadline** for `time_bar`, and the two do
not look alike.

**`legalBasis` is typed and mandatory where it applies.** Not `string[]`. A free-form array of
strings is a comment. It is:

```ts
type LegalBasis = {
  instrument: string;                   // validated at BUILD TIME against pack.legal_instruments (§8.2).
                                        // SA pack registers ERA_2006, NERSA_GRID_CODE, POPIA, CARBON_TAX_ACT,
                                        // REIPPPP, JSE_SRL, FMA_2012, FICA_2001, COMPANIES_ACT_2008.
                                        // Kenya registers ENERGY_ACT_2019, POCAMLA, DPA_2019, … same type.
  provision: string;                    // 's34', 'reg 5.2', 'Sch 3 item 7'
  effect: 'authorises' | 'requires' | 'restricts' | 'creates_offence';
};
```

A chain with `visibility: 'public'` or any transition reachable by `regulator` must declare at
least one. The bundle test enforces it. `provision` is checked against a reference list — one
list per market pack, shipped alongside `pack.legal_instruments` — so a typo in `s34` fails the
build rather than a NERSA (or EPRA) audit.

**The DSL rot guard.** Declarations may reference only (a) the event log, (b) reference data, (c) their own fields. Anything else is a **named handler in ordinary TypeScript**, registered in `guards/` or `effects/`. Declarations are data, not a language: no conditionals, no loops, no expressions. When someone wants an `if` in a declaration, they write a guard. This is the single discipline that prevents a declarative engine from rotting into a bad programming language, and it is the one that always erodes first. It is enforced by a type: `GuardRef = string`, and by a test that the declaration bundle serialises to JSON losslessly.

### L4 — Projections

```ts
type Projector<S> = (state: S | null, event: EventRow) => S;   // PURE. no I/O. no clock. no random.
```

Projection tables are **caches**. They carry `projection_version`. Bumping the version rebuilds them by replaying the log. There is no `ALTER TABLE` migration for a projection — there is a version bump and a replay.

This deletes, as a class:
- hand-written migrations for chain tables (the 019–048 out-of-band band and the 050 column-by-column reconciliation are *consequences* of tables-as-truth);
- the entire category of "the table and the audit log disagree";
- backfills (a backfill is a replay).

**Purity is load-bearing.** If a projector reads the clock or a network, replay produces different rows than production did, and every audit claim built on replay is false. Enforced by: projectors receive `(state, event)` and nothing else — no `ctx`, no `env`. Lint rule bans imports in `projectors/`.

**Notifications fire from the log tail, never from a projection.** A projection can be rebuilt; an email cannot be un-sent.

Reads that a projection cannot serve (free-text search, cross-chain aggregates) are served by two more projections: the Find index and the metrics rollups. Both are derived, both are rebuildable, neither is truth.

### L5 — UI contract

The server returns, for any transaction and actor:

```ts
interface TxnView {
  txn: { id, human_ref, chain_key, title, state, state_label, seq, holder, due_at? };
  timeline: EventView[];              // the log, rendered. see frontend doc.
  fields: Record<string, { value, label, event_id, actor, occurred_at }>;  // every value has an author
  actions: Array<{
    edge: string; label: string; intent: 'primary'|'secondary'|'destructive';
    enabled: boolean;
    blockedBy?: { guard: string; code: RejectionCode; message: string };  // the SAME predicate that will reject you
    form?: FormSchema;                // FieldDecl[] → the generated form
  }>;
  parties: Array<{ participant, role_on_txn, joined_at }>;
  caused: Array<{ event_id, chain_key, human_ref, title }>;   // what this transaction created
  causedBy?: { event_id, chain_key, human_ref, title };       // what created this transaction
}
```

`blockedBy` is computed by running the guard chain in dry-run mode. **The UI cannot lie about why a button is disabled, because it is told by the code that will reject the click.** That single property is worth more than every tooltip in the current system.

**`TxnView` is assembled from four reads, not one:** the txn row + current state, the event log for the timeline and field authorship (one scan of the chain's `log`), the guard dry-run for `actions[].blockedBy`, and the causal-link query below. The dry-run is the only non-trivial cost — it runs the guard chain in-memory against already-loaded state (§L2 guards do no I/O), so it adds CPU, not round-trips. The view is cacheable per `(txn_id, seq, actor_role)` and invalidated on the next appended event.

`caused` / `causedBy` are `SELECT … WHERE caused_by = ?`. This is what a "journey" is: a path through the causal graph, rendered. There is no journey engine, no workflow designer. **`journey_feature_config` (migration 525) and `src/routes/journey-config.ts` are deleted.**

### L6 — Regulator export

A read over L1. Nothing else.

```ts
exportPack({ chain_keys, from, to, participant_ids }) → {
  events: EventRow[];            // verbatim, with hashes
  merkle: { daily_roots, anchor_urls, verification_procedure };
  parties, reference_values_as_of;    // bi-temporal: what the rule WAS when the decision was made
  attestation: { generated_at, generated_by, hash_of_pack };
  custody_notice?: string;            // R-S5-3: present and un-suppressible iff any chain in the pack has settles===false
  integrity: 'third_party_anchored' | 'self_attested';   // §L1: 'self_attested' until an external countersignature lands (P1)
}
```

Two header fields are computed, not passed. `custody_notice` is set by walking every chain in `chain_keys` and emitting the R-S5-3 stamp if any has `settles === false` — the pack cannot be generated without it, and no caller can pass a flag to suppress it. `integrity` reads `'self_attested'` until the external anchor countersignature exists; the pack never claims third-party anchoring it does not have (§L1).

**Sequencing insight: build this fourth, not last.** The regulator export is the hardest constraint in the system. On day one it is nearly free; on day one thousand it is nearly impossible. Putting it before the second chain forces the log to be right, which forces the engine to be right, which forces the declarations to be honest. Everything else in this document falls out of that ordering.

The seven existing audit subsystems (audit chain, Merkle roots, regulator inbox, evidence coverage, control-environment audit, reconciliation attestation, chain verify) become **one read** plus **one nightly verify job**.

### The `/api/v2` surface — every endpoint, on one page

The current system has 360 route mounts. The rebuild has **ten endpoints**, because screens are generated from declarations and every mutation is `applyTransition`. This table is the contract the frontend and backend build against; anything not on it does not exist.

| Endpoint | Method | Layer | Notes |
|---|---|---|---|
| `/api/v2/txn/:chain_key` | POST | L2 | initiation — the first transition. Body: `{ payload, idempotency_key }`. |
| `/api/v2/txn/:id/apply` | POST | L2 | `{ edge, payload, idempotency_key }`. Returns the new `TxnView` or a structured `RejectionCode`. |
| `/api/v2/txn/:id` | GET | L5 | `TxnView` (§L5). `ETag: "<txn_id>:<seq>"` — cacheable, invalidated by the next event. |
| `/api/v2/home` | GET | L4 | the actor's work queue: holder-of rows + due timers + breaches. |
| `/api/v2/find?q=&cursor=` | GET | L4 | visibility-filtered object search (§8). Cursor pagination everywhere; no offset. |
| `/api/v2/chains/:chain_key` | GET | L3 | the declaration bundle — states, edges, `FieldDecl[]` — the SPA generates every form from this. Public, immutable per deploy, aggressively cached. |
| `/api/v2/export` | POST | L6 | `exportPack` (§L6). Async: returns a pack id, pack lands in R2, notification on ready. |
| `/api/v2/attachments/presign` | POST | — | R2 presigned PUT; the attachment hash goes into the next event's payload. |
| `/api/v2/book/:shard/*` | * | DO | `OrderBook` DO surface, ported verbatim (§7). Orders in, depth + fills out. |
| `/api/v2/session` | POST | L0 | exchanges the bought-auth (WorkOS/Clerk, §10) assertion for the platform session. The only auth endpoint we own. |

Conventions, uniform across all ten: every mutation carries a client-generated `idempotency_key` (replay-safe — the engine deduplicates on it); every error is `{ code: RejectionCode, guard, message }` — the same shape `blockedBy` uses, so the UI never parses prose; every list is cursor-paginated; reads go to replicas, only `apply` touches the primary.

**Microtools have no endpoint.** A `ToolDecl.compute` (frontend doc §10.1) is a pure spec function shipped to the SPA in the shared domain package — the same code the guard runs server-side. Client computes locally; nothing to call, nothing to log, nothing to rate-limit.

---

## 4. Time

Time is a value. It is never read from the ambient environment.

```ts
interface Clock { now(): Instant }              // Instant = { epoch_ms, zone }
const marketDay = (i: Instant): string => …     // from pack.time.utc_offset_minutes (SA: +120, SAST,
                                                // no DST; pack.time.assert_no_dst is a build-time check).
                                                // one function per deployment, zero hardcoded offsets.
```

`ctx.clock` is injected. `Date.now()`, `new Date()`, and `Math.random()` are banned in `domain/` by lint rule. `src/` currently contains 113 UTC day-keys and 1 SAST-aware one; that class of bug becomes unrepresentable.

What determinism buys, and it is not academic: replay, backfill, tests without mocks, reproducible audit, and the ability to answer "what would this guard have decided on 3 March" without a staging environment.

### Timers replace 27 of 33 crons

```sql
CREATE TABLE timer (
  id       TEXT PRIMARY KEY,
  txn_id   TEXT NOT NULL,
  edge     TEXT NOT NULL,
  due_at   TEXT NOT NULL,
  key      TEXT NOT NULL UNIQUE,   -- (txn_id, edge, arming_event_id) → idempotent
  claimed_at TEXT
);
CREATE INDEX idx_timer_due ON timer(due_at) WHERE claimed_at IS NULL;
```

One sweeper (`*/5 * * * *`) claims due rows in batches of 200 and fires each as `applyTransition({ actor: system:timer })`. This subsumes: every SLA sweep, deal sweep, conditions-aging, RFI aging, cert-expiry, filing-deadline, late-payment fees, margin-call cycle, dunning, and every escalation.

**What is genuinely periodic and stays a cron (7):**

| Cron | Why it is not a timer |
|---|---|
| `0 * * * *` SolaX/Sungrow ingest | external system pull, no transaction to hang it on |
| `0 * * * *` VWAP mark publish | a function of market data, not of any one transaction |
| `5 0 * * *` nightly rollup + Merkle root + R2 anchor | whole-log operations |
| `*/15 * * * *` surveillance / trading-surveillance / SIEM | **windowed market-abuse detection — see below** |
| `30 2 * * *` anomaly-detection drift | ML, model-level not transaction-level |
| `0 3 * * *` RUL concordance | ditto |
| `30 3 * * *` fault-fingerprint class drift | ditto |

**Windowed detection is not a timer and must not be deleted with the 27.** Layering (wash trades, spoofing, marking-the-close), collusion, and cross-account patterns are found by scanning a *sliding window of many transactions* — they are not a property of any single transaction's timeline, so no per-txn timer can carry them. The current `*/15` surveillance scan does exactly this over the order/fill stream. It stays a cron, and it reads the event log (§L1) rather than mutable status. Deleting it "because timers replace the crons" would silently remove the platform's market-abuse surveillance, which the FMA §80–84 market-abuse provisions require an exchange to run. §13 R-time lists "surveillance windows survive the cron cull" as an explicit acceptance gate.

**The sweeper has a throughput ceiling, and calendar clusters breach it.** Batches of 200 every 5 minutes is a hard **2,400 fires/hour** ceiling. Per-transaction SLAs spread out and never approach it. Calendar events do not: month-end (subscription billing, all PPA settlements, dunning) and quarter-end (regulator exports) land thousands of due timers in the same minute, and at 2,400/hr a 10,000-timer month-end backlog takes ~4 hours to drain — a settlement due 00:00 fires at 04:00. Two mitigations, both declared not discovered: (a) the sweeper claims **by `due_at` ascending** so the oldest-due always drains first (the index already orders this way); (b) timers carry a `class` (`sla` | `settlement` | `billing` | `regulatory`) and the sweeper runs **one claim query per class** so a 10k billing cluster cannot starve a single breaching-SLA timer. The ceiling is real and named here; if a class routinely clusters past what one worker drains in its window, that class graduates to its own sweeper schedule. Nothing about this is emergent — it is a capacity decision that belongs in the plan, not a 3am discovery.

**The undocumented dependency graph.** The current nightly ordering (`05 0`, `10 0`, `15 0` … `58 0`) *is* a dependency graph expressed as clock time. The minute offsets are the edges. Nobody wrote it down. Under timers the dependency is explicit — a transition schedules the next transition — so the graph is in the declaration and the cron ordering ceases to be load-bearing. **Extracting that graph before deleting the crons is a named task in §13.**

---

## 5. Reference data

One writer, bi-temporal, evidence-linked:

```sql
CREATE TABLE reference_value (
  key            TEXT NOT NULL,     -- 'cpi.headline' | 'nersa.mypd6.megaflex' | 'carbon_tax.rate_zar_t'
                                    -- (seeded per market from pack.reference_seeds, §8.2)
  effective_from TEXT NOT NULL,     -- when the world changed
  effective_to   TEXT,
  recorded_at    TEXT NOT NULL,     -- when WE learned it. the second axis. this is the point.
  value          TEXT NOT NULL,
  source         TEXT NOT NULL,     -- 'StatsSA P0141'
  evidence_url   TEXT,
  PRIMARY KEY (key, effective_from, recorded_at)
);
```

Guards read reference data as of the event's `occurred_at`, not as of `now()`. A CPI restatement therefore does not silently rewrite last year's escalation; it produces a new `recorded_at` row, and a compensating transition if the parties want one. Two of the standing integration gaps (hard-coded CPI, hard-coded tariff) become unwritable.

---

## 6. Fees

A fee is an **effect**, not a chain. `fee_schedule(event_type, payer_role, payer_resolution, rate, enabled)`. Ship with every billable `event_type` seeded, `enabled = 0`, `rate = 0`. Revenue rows record at R0 with `status = waived`. The operator flips one row; no deploy. This is the blueprint's LOCKED DECISION 2 and 4, carried forward verbatim.

---

## 7. Scale and the hot path

**One hot path. 147 cold ones.**

| Path | Shape | Mechanism |
|---|---|---|
| Order matching | continuous, latency-sensitive, contended | `OrderBook` DO, one instance per (energy_type × delivery_day) shard. **Ported unchanged.** `deriveShardKey()` survives. |
| Telemetry ingest | high volume, no consistency requirement | R2 + Analytics Engine. Never the log. |
| Everything else | ~6 writes/s avg, ~100/s peak | one D1 `batch()` append |

Applied constraints, from the blueprint's national-scale section:

- **D1 is single-region, ~1k writes/s, 10 GB/db.** The log is a hot database (open + 90 days) plus per-year cold archives; **there is no cross-database VIEW** (D1 has none) — the regulator export fans out across year-databases in application code, §L1. Closed years archive to R2 as Parquet + Merkle root and drop out of the hot database. Projections are sharded by `chain_key` group.
- **Reads scale on replicas.** Home, Find, and dashboards read D1 read-replicas; only `applyTransition` touches the primary.
- **KV caches action-queue counts, TTL 30 s.** Never anything a user acts on — counts only.
- **Cascade fan-out goes through Cloudflare Queues.** `applyTransition` writes an outbox row inside the batch; a Queue consumer drains it. Synchronous fan-out at national volume exceeds the Worker subrequest budget, which is what the blueprint discovered.
- **Sweeps are batched.** `env.DB.batch()`, 200 rows per invocation, resumable by `claimed_at`.
- **The `batch()` = transaction fact is load-bearing.** Sequential `.run()` calls are not atomic. That is the root cause of the standing write-atomicity gap, and it is designed out here rather than patched.

Budget: p99 cross-role propagation < 60 s (queue depth alarm at 30 s). p99 `applyTransition` < 150 ms at the primary. Home first paint < 400 ms on a cold cache.

**Operational resilience is a stated target, not an assumption (PFMI P17, P21).** CPMI-IOSCO PFMI Principle 17 (operational risk) and Principle 21 (efficiency) expect a financial-market infrastructure to publish recovery objectives and capacity headroom, and a national exchange is judged against them. The plan commits to:

- **RPO ≤ 5 minutes.** The log is the system of record; every `applyTransition` batch is durable in D1 before the outbox is drained, and the hourly Merkle seal + daily R2 anchor bound worst-case loss. Cloudflare does not expose D1 point-in-time restore to a chosen second, so the honest RPO is "last sealed window," which the seal cadence keeps ≤ 1 h and the outbox keeps ≤ 5 min for in-flight cascades — stated plainly, not rounded to zero.
- **RTO ≤ 1 hour** to a read-only regulator-serviceable state (Find + Transaction + export off the replicas), longer to full write availability if the primary region is lost — D1 single-region is the binding constraint and it is named, not hidden. A multi-region write story is a P1 procurement decision, not a solved property of this design.
- **Capacity headroom.** The hot path is sized at ~100 writes/s peak against D1's ~1k/s, a 10× margin; the sweeper ceiling (2,400/hr, §4) and the year-database 10 GB cap (§L1) are the two capacity limits that bite first, and both are monitored with alarms, not discovered.

These numbers are targets to hold the design to, and the single-region D1 constraint means some of them are aspirational until the multi-region path is bought. Saying so is the point of P17.

### Observability — what pages whom, day one

Every alarm named in this document, gathered in one place so none of them is a 3am discovery. Two severities, because the team is small and a five-tier matrix nobody staffs is theatre: **page** (wake someone) and **ticket** (next business day).

| Signal | Threshold | Severity | Named in |
|---|---|---|---|
| Nightly chain-verify failure | any broken hash link | **page** | §L1 — this is the system of record lying |
| Cascade/outbox queue depth | > 30 s of lag | **page** | §7 propagation budget |
| Timer sweeper backlog, per class | any `sla`/`regulatory` timer > 15 min overdue; `billing`/`settlement` > 60 min | **page** | §4 sweeper ceiling |
| `applyTransition` p99 | > 150 ms sustained 10 min | ticket | §7 budget |
| Hot-year database size | > 8 GB (of the 10 GB cap) | ticket | §L1 / §7 — starts the year-shard rotation |
| Queue DLQ | non-empty | ticket | §7 — every dead letter is a lost effect until replayed |
| Guard rejection rate, per code | anomaly vs 7-day baseline | ticket | catches a bad deploy rejecting everything, and a bad deploy rejecting nothing |
| Export pack generation failure | any | **page** if regulator-requested, ticket otherwise | §L6 |

Day-one dashboards (four, not forty): write throughput + apply latency; queue depth + DLQ; sweeper drain rate by class; rejection codes over time. All from Workers Analytics Engine — no observability vendor bought until these outgrow it.

The alarms above are the *only* monitoring the plan commits to. Anything else is added when an incident proves the need, and the incident writes the runbook entry.

---

## 8. Security model

Three visibility tiers, one join each:

| Tier | Rule | Examples |
|---|---|---|
| **public** | anyone authenticated | order book depth, marketplace listings, granted licences, published tariffs, retired carbon credits |
| **party** | `EXISTS (SELECT 1 FROM party_on_txn WHERE txn_id = ? AND participant_id = ? AND until_event_id IS NULL)` | PPA negotiation, drawdown request, RFI |
| **owner** | party row with `role_on_txn = 'owner'` | private book, internal risk limits, draft filings |

**Existence is not leaked.** Find indexes only rows the actor may see. There is no "2 results, 1 hidden." A counterparty cannot discover that a deal exists before it is invited — invitation is a transition that inserts a `party_on_txn` row and is itself in the log. Discovery is served by the *public catalogue*, which is a separate, deliberately-populated index. This is a policy decision, taken here, before Find is built, because it cannot be retrofitted: showing a hidden-result count reveals the deal.

**SQL identifier discipline, unchanged and absolute.** Table and column identifiers come only from the static declaration bundle. Request values bind to `?` placeholders. Never a template literal with request data.

---

## 8.1 Onboarding, admission, and the identity bootstrap

An expert panel (platform architect, SA financial-crime compliance, activation) interrogated the plan and found the same hole from three directions: **no chain creates identity.** Every transition requires an actor; every actor belongs to a participant; but nothing in §3 mints either. This section closes the bootstrap, and it closes it *with the engine*, not beside it — onboarding is chains, not a wizard.

### 8.1.1 Genesis

Seed migration 0 inserts exactly two rows outside any transition: `participant('oe-operator')` and `actor('system:genesis')`. Everything after is a transition. The **operator** — not NERSA — is the counterparty to every admission: joining is exchange membership under operator rules. The regulator joins licence chains as `statutory_observer`; it does not admit members.

### 8.1.2 The `participant_onboarding` chain

Roles `['applicant','operator']`, visibility `'party'`.

```
applied (holder: applicant)
  → submitted (holder: operator)
  → more_info_required (holder: applicant, sla: 14d)   -- loops back to submitted
  → registry_verified → cdd_in_progress → cdd_complete -- compliance ladder, §8.1.4. registry per
                                                        -- market: CIPC in SA, BRS in Kenya (§8.2)
  → mandates_filed → risk_rated
  → admitted | rejected | withdrawn
```

`submit_decision` carries `decisionGroup: 'determination'` — admit/reject/withdraw are one exclusive decision, audited as such.

**The `apply` edge is the one place the engine mints identity.** `/api/v2/session` on an unknown `idp_sub` builds one `batch()`: insert participant + actor + txn + `applied` event + both `party_on_txn` rows — atomic, self-referential, recorded honestly (the applicant's first event is signed by the actor it creates; the log says so plainly). `party_on_txn` needs **zero exceptions** — the architect confirmed the model survives intact.

**Admission is a block flag, not a role check.** `apply` raises `participant:<id>:not_admitted`; `admit` clears it; every other chain's initiating edge guards `noBlockFlag(participant)`. One mechanism (§L2's existing flags) gates the entire platform on membership — no `is_admitted` column, no middleware.

### 8.1.3 `user_invite` and `mandate` — the other two identity chains

**`user_invite`** — states `sent (sla: 7d → expired) → accepted | revoked | expired`. One party: the inviting org (visibility `'owner'`). The invitee is `fields.email`, **not** a party — an uninvited email address is not a participant. `accept` fires at session-exchange when the WorkOS-verified email matches (`inviteEmailMatches` guard); its effect creates the `actor` row. An invited-but-unaccepted user has no actor row, so authorization fails at existence, not at a permission check. A session with no actor returns `{code: 'NO_ACTOR', pending_invites}`.

**`mandate`** — grant/amend/revoke edges fired by an org-admin/director-level actor; evidence is a hashed board resolution + specimen signature in R2. Projects to `actor_mandate(actor_id, key, value, from_event_id, until_event_id)`; the engine loads live rows (`until_event_id IS NULL`) into `GuardCtx.mandate`. One generic guard `withinMandate('max_notional')` sits on high-consequence edges (`sign`, `counter_sign`, `submit_order`, `drawdown.request`). Leavers: `mandate.revoke` is effective immediately, reason-coded `EMPLOYEE_EXIT` — guards read live mandate rows, so a revoked signatory is stopped on the next transition, not the next sync.

**Session binding.** WorkOS `sub` → `actor.idp_sub` → participant → `membership_class` (a field on the admitted onboarding txn, projected) → `actor_mandate`. A consultant in two orgs is two actor rows, one `idp_sub`. Role switch is `POST /api/v2/session {actor_id}`, guarded by idp_sub match. The token carries `actor_id` only. `on_behalf_of` is reserved for support and is always in the log.

### 8.1.4 FICA is not optional and not delegable-in-full

The platform is almost certainly an accountable institution (FIC Act 38/2001, 2022 amendments). CDD completes **before** the business relationship — that is what the state ladder in 8.1.2 encodes; `admit` guards `allConditionsMet` over `condition_of`-linked `kyc`, `mandate`, and `credit-line` child transactions.

**Delegable to the vendor** (Smile ID / Refinitiv, §10): ID/passport/liveness, CIPC lookup, sanctions + PEP screening. The vendor's verdict enters as an event — `kyc.vendor_verdict_received` with the report hash — never as a state jump.

**Not delegable**, each a platform transition with a named human actor: risk rating (s42 RMCP, board-approved), beneficial-ownership determination (s21B, ≥5% post-2022; the CIPC BO register is evidence, not a substitute), EDD decisions for PIPs/foreign PEPs, and the admit/decline decision itself.

**Ongoing CDD.** Refresh timers (annual high-risk, 3-yearly low-risk) feed a `KYC_STALE` flag. A daily TFS re-screen sweep on a hit fires `kyc.rescreen_hit` → suspend via block flag. s29 STRs route through `statutory_access` with `suppressed = 1` — tipping-off is a crime, and the export layer already knows how to keep a secret (§6). Retention comes from `pack.aml.retention_years` — SA: 5 years (FICA s23); Kenya: 7 (POCAMLA). Refresh cadence likewise from `pack.aml.refresh_months`.

**POPIA.** Cross-border transfers ride §72(1)(a) consent-as-transition. Directors and BO natural persons who never log in are processed under s11(1)(c) legal obligation (FICA), *not* consent — there is no one to click "I agree". s21 operator agreements with the KYC vendors.

### 8.1.5 Role-specific admission gates

Role-conditional `condition_of` links, each with a `legalBasis` row:

| membership_class | Gate before `admit` |
|---|---|
| ipp_developer | NERSA generation licence **or** registration (<100 MW registration-only, ERA amendments) |
| trader | NERSA trading licence |
| lender | SARB/Banks Act registration or FSP licence; Companies Act s45 where intra-group |
| offtaker | creditworthiness pack; **municipal** offtakers additionally MFMA s33 — the PPA `sign` guard refuses without an s33 evidence link |
| grid | NTCSA / municipal distribution licence |
| regulator | operator-provisioned transition with MoU/legal-basis in the log |

This table is **SA-pack data**, not engine code: it is the SA pack's `membership_classes[*].admission_gates` (§8.2). Kenya ships a different table (EPRA licences, BRS verification) against the same mechanism — chains as gates via `condition_of` links.

**Credit-line opener.** Initial limit is set by a two-person edge (proposer ≠ approver) with financials/parent-guarantee hashes as evidence. No credit-line txn = zero limit. **Admit ≠ trade.**

### 8.1.6 Draft states, templates, and the first session

**Every initiable chain gets a guard-free `draft` initial state.** The `submit` edge carries the KYC/admission guards. The guard blocks the *transition*, never the *form* — an applicant mid-KYC can draft a PPA today and submit it the day they are admitted. Drafting-before-verification is the highest-leverage activation lever the panel found.

**Templates are transactions** on a `template` chain, tier `public`, populated by operator/regulator (NERSA standard-form PPA, REIPPPP licence pack). "From template" pre-fills the generated form; `caused_by` prefill does the same across chains (a drawdown inherits its facility's fields).

**No sandbox. Committed.** No `provenance: 'demo'` flag, ever — demo events poison surveillance baselines, VWAP, metrics, and regulator exports. Look-around is the public catalogue (real tier-public data) plus a declaration-rendered read-only "how this works" preview from public `GET /api/v2/chains/:chain_key`. A sales demo is a separate deployment with its own genesis. Isolation by database, never by flag.

### 8.1.7 Activation is derived, and measured from day one

`GET /api/v2/home` computes the getting-started checklist from **dry-run verdict vectors** — no checklist table: (1) the actor's own onboarding txn `TxnView.actions`; (2) the role's first-value chain (a `reference_value` row, key `first_value_chain.<membership_class>` — trader → `order`, ipp → `licence_application`) initiating-edge dry-run. Each failing guard, in declared order, is one checklist item whose copy *is* its RejectionCode message. Guard registry handlers gain static `remedy?: {chain_key | txn_ref, edge}` metadata (on the handler, not the decl); `next_best_step` is the first failing guard's remedy deep-link. Progress = ok/total verdicts.

Instrumentation, all queries over L1 (nothing new to build): signup → participant-active elapsed; time-to-first-initiated and first-completed txn per role; D7 return-to-Home; ⌘K invocations per actor-week; % first drafts abandoned in draft; per-guard block counts on first attempts (the verdict vector already stores them). The plan admits some roles cannot self-activate: an offtaker's aha moment is *receiving* a PPA invite; a regulator's is the first application in its queue — both arrive via someone else's transition.

### 8.2 Multi-market — one engine, N deployments, a MarketPack per market

The platform goes to different markets in different configurations. Two experts (energy-market, systems-architect) interrogated the design; both landed on the same shape, so it is now load-bearing:

**Two-level tenancy.**
- *Within* a market, participants **are** the tenants. `party_on_txn` + `visibility` already isolate them — that is what L0 is for. No `tenant_id`.
- *Across* markets, isolation is by **deployment**: each market gets its own Worker env, own D1, own R2 buckets, own genesis. One codebase, one engine, N deployments — all on the same commit.

**No `market_id` column, ever.** A shared database with a market discriminator was considered and rejected: it is the sandbox flag in a suit — one WHERE-clause bug leaks Kenyan STRs into a NERSA export; one hash chain would interleave two regulators' histories; data-residency law makes co-location illegal in some pairs anyway. Deployment isolation makes the entire class of cross-market leak *unrepresentable*, which is the same argument this plan makes everywhere else.

**The MarketPack** is a build-time, hash-stamped JSON document — pure data, zero behaviour:

```ts
interface MarketPack {
  market: { key: string; name: string; human_ref_prefix: string };
  operator: { participant_key: string; legal_name: string; reg_no?: string };   // genesis identity
  currency: { code: string; minor_unit: number; locale: string };               // display default
  // contract vs settlement currency is a chain FIELD (Kenya USD/KES), not a pack constant
  time: { utc_offset_minutes: number; assert_no_dst: true };
  legal_instruments: Array<{ id: string; name: string; citation: string;
    class: 'statute' | 'regulation' | 'market_rules' | 'treaty' }>;
  regulators: Array<{ id: string; name: string; role: 'statutory_observer' | 'approver';
    export_format: ExportFormatRef;
    anchor_countersignatory?: { kind: 'endpoint' | 'rfc6962'; url: string } }>;
  enabled_chains: Record<ChainKey, { variant: ChainDeclVariantKey;
    legal_basis: Array<{ instrument_id: string; provision: string;
      effect: 'authorises' | 'requires' | 'restricts' | 'creates_offence' }> }>;
  membership_classes: Record<string, { admission_gates: ChainKey[];
    provisioning?: 'operator_only'; max_participants?: number;
    volume_cap_pct?: number;
    first_value_chain: ChainKey }>;
  aml: { accountable_institution: 'statutory' | 'contractual';
    bo_threshold_pct: number; pep_taxonomy: 'pip_foreign_pep' | 'undifferentiated';
    reporting_authority: string; str_format: ExportFormatRef;
    retention_years: number; refresh_months: { high_risk: number; low_risk: number } };
  guard_params: Record<string, number | string | boolean>;
  reference_seeds: Array<{ key: string; value: string; source: string; effective_from: string }>;
  calendar: { holidays: string[]; market_sessions?: Record<string, { open: string; close: string }> };
  cron_params: Record<string, string>;
  settlement_disclaimer: { statute_citation: string };
  data_transfer: { mechanism: string; pii_vault_region?: string };
}
```

**What a pack may NEVER contain** (the anti-rot list, enforced by the pack schema itself):
- guard logic or expressions — packs carry `guard_params` (numbers, thresholds); the guard *code* is engine;
- chain state machines — **variants live in code**, the pack selects one by key. `ppa_contract.regulator_approved` (adds `regulator_review → regulator_approved | regulator_declined`, regulator as an *actor*) is a static ChainDecl in the repo; Kenya's pack points at it because EPRA approves every PPA (Energy Act 2019 s163); SA's points at `ppa_contract.default`;
- SQL identifiers, effects, or projections;
- anything that weakens an engine invariant: the R-S5 honesty set, identity-minted-once, the hash/Merkle format, and the **non-delegable AML floor** (FATF R.17: risk assessment, ongoing monitoring, STR decisions) are platform-wide and pack-subtraction-proof. `pack.aml` can make a market *stricter*, never looser.

**Currency is a field, not a constant.** Kenyan PPAs are USD-denominated, KES-settled — so `contract_currency`, `settlement_currency`, and optional `fx_index` are chain **fields**; `pack.currency` is only the display default. This is why `commitment_minor`, `max_notional`, and "money-valued" replaced every `*_zar` name in this plan.

**Onboarding de-SA'd.** The §8.1 ladder is engine; its SA specifics are pack data: registry (CIPC → BRS), BO threshold (`bo_threshold_pct` — SA 5%, Kenya 10%, default 25%), PEP taxonomy (SA's PIP/foreign-PEP split vs undifferentiated), retention, refresh cadence, and the whole §8.1.5 admission-gate table (`membership_classes`). Where the operator is not a statutory accountable institution (`accountable_institution: 'contractual'`), the same CDD chains run under market rules instead of statute — the *ladder* never gets shorter. A participant admitted in one market who wants into another **onboards twice**; the second application may import the first's evidence hashes as attestations (`condition_of` link across deployments by reference, not by row access).

**Residency.** The §3 PII-vault split is the residency invariant: markets with hard localisation law (Zambia DPA 2021) relocate the vault in-country via `pack.data_transfer.pii_vault_region`; the reference-only event log stays put because it carries nothing to localise.

**Version-skew guard.** The genesis event records `pack_hash`. Every export pack (§L6) restates it. A deployment booted against a pack that doesn't hash-match its genesis refuses to serve — config drift becomes a startup failure, not an audit finding. `/api/v2/chains` exposes the enabled chain set + variants so the SPA and external auditors read the same truth.

**Build + CI.** `wrangler.toml` (bindings, cron schedules from `cron_params`, env names) is *generated* from the pack. The §14 property suite runs **per pack** in a CI matrix — every property × every enabled chain × every market; a pack that enables a chain whose guards reference an unseeded `reference_seeds` key fails the build.

**Design set.** The plan is designed against three concrete packs — **SA** (full), **Kenya** (EPRA-as-actor, USD/KES, POCAMLA 7-year retention, DPA 2019), and **SAPP** (regional, treaty-class instrument, `market_sessions`) — because two points make a line and three make a surface. Namibia and Botswana then fall out as configuration, which is the test the whole section must pass.

---

## 9. What gets deleted

| Deleted | Replaced by | LOC |
|---|---|---|
| `src/utils/locks.ts` | `PRIMARY KEY (txn_id, seq)` | ~120 |
| `src/utils/chain-state.ts` + `chain-terminal-registry.ts` | `states[s].terminal` | ~140 |
| `src/utils/cascade.ts` `handleSpecialCascades` switch | `effects: EffectRef[]` in declarations | ~780 |
| `journey_feature_config` + `src/routes/journey-config.ts` + migration 525 | `caused_by` | ~90 |
| 27 of 33 cron handlers | one timer sweeper | ~2,000 |
| 7 audit subsystems | one read over L1 + one verify job | ~3,500 |
| ~148 hand-written chain route modules | 148 declarations | **85,381** (measured, not ~45,000 — see note) |
| chain-table migrations | projection version bump + replay | 525 files |
| `tenant.ts` | `party_on_txn` | ~140 |

Nothing in this table is a feature. Every row is scaffolding that exists because tables were treated as truth.

**The chain-module figure is measured, not estimated.** `wc -l` over `src/routes/*-chain.ts` is **85,381 lines**, not the ~45,000 an earlier draft guessed — the deletion column understated the largest single row by nearly half. The rebuild's value case rests on this number being honest: 85k lines of hand-written chain logic collapse to 148 declarations plus one engine, but the engine, the property tests, L0–L6, and the four surfaces are real new code that the "deletes ~52k net" framing hid. The net line count is smaller, but not by the margin a low baseline implied. Every LOC in this table was counted with `wc`, and where a count is an estimate it says so.

---

## 10. What is bought, not built

Auth (WorkOS/Clerk), KYC/AML (Smile ID or Refinitiv), document storage + e-sign (R2 + a provider), payment rails (**not built — see §1.1**; the absence is declared with `settles: false`, not silently omitted), notification delivery (Resend/Twilio), SIEM (existing dispatch retained). None of these is the edge. All of them are currently hand-rolled.

### Notifications — the matrix is derived, not hand-written

Delivery is bought (Resend/Twilio). *What* notifies *whom* is not a per-chain authoring task — it is *derived from the declarations*, which is why 148 chains do not need 148 notification specs. Notifications fire from the log tail via the outbox queue (§7), never from a projection.

Five classes, each triggered by a structural property of the event, not by chain-specific code:

| Class | Derivation rule | In-app | Email | SMS |
|---|---|---|---|---|
| `action_required` | the transition moved `holder` to you | ✓ | ✓ | — |
| `fyi_party` | an event landed on a txn where you hold a `party_on_txn` row and you are not the holder | ✓ | daily digest | — |
| `breach` | a `system:timer` transition fired an SLA/covenant/margin edge naming you | ✓ | ✓ | ✓ if the consequent deadline < 24 h |
| `money` | the event carried a fee/settlement/invoice effect where you are the payer or payee | ✓ | ✓ | — |
| `regulatory` | filing-deadline timer, or an export pack you requested is ready | ✓ | ✓ | — |

Per-user preferences can quieten `fyi_party` and downgrade `money` to digest; **`breach` and `regulatory` are never suppressible** — a covenant breach you opted out of hearing about is a lawsuit, not a preference. Every send is recorded as an effect row keyed to the triggering event id, so "did we tell them" is answerable from the log like everything else. Templates are per-class + chain label + deep link — five templates, not five hundred; a chain that genuinely needs bespoke wording declares an override in its `ChainDecl` during P2, and the exception is visible in review.

---

## 11. Cutover

Strangler, one-way, no dual-write. Dual-write to two sources of truth reproduces the exact bug the rebuild exists to remove.

**No dual-write means no automatic rollback — state this plainly.** Once a chain cuts over, its writes go to the new engine and the old module serves reads only. There is no fallback that resumes writing to the old tables, because a running old writer is a second source of truth and reintroduces the divergence bug by construction. The rollback story is therefore forward-only: if a cutover chain misbehaves, you *pause its transitions* (a halt flag, §L2) and fix forward — you do not fail back to the legacy writer. This is a deliberate constraint with a cost, and pretending a two-way switch exists would be the lie. The mitigation is that cutover is *per chain*, so blast radius is one chain, and P0's export gate proves integrity before any second chain follows.

**P0 lands the ground-truth artifacts first.** Two documents the current system never produced but the cutover cannot proceed without: `NIGHTLY_DEPENDENCY_GRAPH.md` (the cron minute-offsets reverse-engineered into an explicit edge list, §4 — deleting the crons without it loses the ordering) and `PROD_SCHEMA_GROUND_TRUTH.sql` (the *actual* remote schema, since the migration ledger diverged from prod at the 019–048 band). Both are P0 deliverables, not documentation debt.

The week estimates below are the engineering-effort floor, not a delivery commitment. **P2+P3 together are 16–24 weeks, not 14** — the declaration-extraction pass (§14, R8) is the single largest unknown because the legacy suite does not run against the new HTTP surface as-is, so each extracted declaration needs its own conformance check written. Any schedule that reads P2 as "6 weeks, mechanical" has mispriced the one phase that carries the most risk.

| Phase | Weeks | Deliverable | Gate |
|---|---|---|---|
| **P0** | 2 | L0+L1+L2, **one** chain (`ppa_contract`), **L6 regulator export**, `NIGHTLY_DEPENDENCY_GRAPH.md`, `PROD_SCHEMA_GROUND_TRUTH.sql` | An external party can verify the hash chain from an exported pack without our code. |
| **P1** | 3 | L4 projections; Home, Transaction, Find surfaces; six pilot chains | Every action a pilot user takes appears in the log with a `caused_by` where one exists. |
| **P2** | 6–10 | Declaration extraction pass over the 235 `*-spec.ts` files | Each extracted declaration passes the §14 property tests *and* a per-chain conformance check, or the exception is written down. |
| **P3** | 10–14 | Remaining chains; the ten generic capabilities; bulk; saved views; export | ≥95% of money-valued transitions fire a fee event. |
| **P4** | 1 | `OrderBook` DO ported verbatim; Trade surface | Depth-ladder latency unchanged. |
| **P5** | 4 | Old system read-only for 90 days, then decommission | No route in `src/routes/` outside `/api/v2` serves a mutation. |

**Pilot six.** `ppa_contract`, `drawdown`, `carbon_retirement`, `licence_application`, `wo` (work order), `permit_to_work`. Between them: two regulator crossings, one blocking safety gate (PTW → WO dispatch, OHSA), one money gate (COD → drawdown), one cross-tenant negotiation (PPA), and five of the ten must-have interactions in §12.

**Backfill.** Existing rows are replayed into the log as a single `imported` event per row, carrying the full row in `payload` and `provenance: 'legacy'` — hash-chained like any other event. We do not fabricate the history we never recorded. The pack tells the regulator exactly that, on the face of it.

One event per row is **necessary but not sufficient**: the import must also *replay each imported state's effects* — the `sets` (block flags) and `txn_link`s that state would have produced — or the engine's guards will not recognise the world. An admitted legacy participant whose `not_admitted` flag was never raised-and-cleared trips `noBlockFlag(participant)` on their first order at cutover 00:01. The mapping:

- **Admitted participants** — onboarding txn imported at `admitted`; replay `apply`'s flag-raise and `admit`'s flag-clear so the flag table is honest.
- **Mid-KYC orgs** — onboarding txn at `kyc_pending`; imported `kyc` txn at the vendor's actual stage; `condition_of` link between them; `not_admitted` flag **raised**.
- **Suspended participants** — `suspended` state, its flag raised.
- **Per-user limits** — imported `mandate` txns projecting to `actor_mandate`.
- **Legacy users** — actor rows with `idp_sub` NULL, linked at first WorkOS login by verified-email match, recorded as a `participant_onboarding.user_linked` event.

**P0/P1 gate:** an imported-admitted participant can fire a first-value initiating edge at cutover 00:01. If the guard rejects them, the backfill is wrong, not the guard.

---

## 12. Acceptance criteria — the ten interactions

From the blueprint, preserved verbatim as the engine's acceptance suite. Each is one declaration `effect` (or `blocking` where marked) plus one integration test. If the engine cannot express these, the engine is wrong.

| # | Edge | Mode |
|---|---|---|
| 1 | W20 COD reached → lender drawdown prompt + PPA auto-activate | blocking, commercial |
| 2 | W60 algo kill-switch → block all trader orders | **blocking** (FSCA) |
| 3 | W38 covenant breach → W77 reserve cure | **blocking** |
| 4 | W77 reserve breach → W45 loan event-of-default | **blocking** |
| 5 | W52 STOR filed → freeze position limits + pause best-ex | **blocking** |
| 6 | W64 permit-to-work issued → W16 work-order dispatch enable gate | **blocking** (OHSA) |
| 7 | W49 licence granted → W74 levy + W33 renewal auto-create | **blocking** |
| 8 | W43 MYPD published → W39 reprice all active PPAs | drive |
| 9 | W71 failure imminent → W64 emergency permit-to-work | **blocking** |
| 10 | W11 MRV verified → W17 retirement prompt | drive |

Plus the blueprint's success metrics, carried forward: cross-role propagation p99 < 60 s; ≥95% of money-valued transitions fire a fee event; 100% of chains reachable by deep link; all roles show queue rows within 24 h.

---

## 13. Risk register — what quietly breaks

Honest list. None of these is in a document today. All of them are in the code, and a clean rebuild is exactly the operation that loses them.

| # | Risk | Mitigation, as a task |
|---|---|---|
| R1 | **~22% of status tokens are context-dependent.** `paid`, `issued`, `closed`, `settled`, `rejected`, `withdrawn` are terminal in some chains and intermediate in others. | The extraction pass (P2) reads each `*-spec.ts` `isTerminal()` and emits `terminal: true/false` **per state per chain**. Where the spec has no `isTerminal()`, a human decides and records the reason in the declaration. Never a global heuristic again. |
| R2 | **The nightly cron minute-offsets are an undocumented dependency graph.** | Before deleting any cron, write `docs/architecture/NIGHTLY_DEPENDENCY_GRAPH.md` from the current `runCron()` switch. Each edge becomes a declaration timer or an effect. Gate P2 on this document existing. |
| R3 | **Migration band 019–048 was force-applied out-of-band.** Prod's real schema is not reconstructible from the repo. A ground-up build cannot be diffed against prod. | Dump `PRAGMA table_info` for every prod table into `docs/architecture/PROD_SCHEMA_GROUND_TRUTH.sql` **before writing any code.** It is the only description of what prod actually is. |
| R4 | **`pre-trade-guards.ts` composition order determines the rejection reason a trader sees.** Reordering silently changes what users are told. | Guard order is declared and covered by a golden test asserting the exact reason code for each of the five rejection scenarios. |
| R5 | **`fireCascade`'s per-stage DLQ/retry semantics.** 655 callers each assume something about redelivery that nobody wrote down. | Effects are idempotent keyed on `(caused_by, edge, txn_id)`. Redelivery is therefore always safe, and the assumption becomes unnecessary rather than preserved. |
| R6 | **Event schema versioning is a permanent tax.** | `payload_version` from event #1. One `upcast(version, payload)` per chain, tested against a frozen corpus. There is no way to avoid this; there is only a way to pay it early and cheaply. |
| R7 | **The declarative engine rots into a bad DSL.** | Declarations serialise losslessly to JSON. A test asserts it. When someone needs an `if`, they write a guard. |
| R8 | **8,167 tests encode behaviour nobody remembers choosing** — but they cannot be pointed at the new engine as written. 286 of 303 test files `import` from `src/` directly rather than driving an HTTP surface, so under 5% survive a runtime swap; "run the old suite against the new engine's HTTP surface" is an unrunnable gate. | Do not delete them, and do not pretend they transfer. Extract each pilot chain's spec assertions into a **per-chain conformance check** (§11 P2 gate): a table of `(from_state, transition, guards, to_state, reason_code)` rows read out of the old `*-spec.ts`, replayed against the new `applyTransition`. Every row that diverges is either a bug or an undocumented decision, and both need a human. The old suite stays as the archive the conformance table is derived from — read, not executed. |
| R9 | **Power users get slower for months.** The five people who mastered the old system lose their muscle memory. | Keyboard-first from day one, ⌘K, saved views, bulk, and a `/` command bar on the Transaction that fires transitions by name. Run the old system read-only for 90 days. Do not pretend this away. |
| R10 | **The calendar does not compress 10×.** Reading ERA 2006, the NERSA Grid Code, the Carbon Tax Act, REIPPPP and the JSE-SRL does not shrink because the architecture improved. | The 24-week plan above is engineering time. Legal review is in parallel and is not on the critical path only because it has already been done once — in the 525 migrations and 235 specs we are extracting from. **That is why extraction precedes deletion.** |

**The most valuable artifact in the repo is the existing ~100k LOC**, not because it is good, but because it *is* the declaration — already written, in a form that runs and can be interrogated. It encodes thousands of tacit micro-decisions about South African energy law that exist nowhere else. Extract, then delete. Never the reverse.

---

## 14. Property tests replace per-chain tests

The engine is tested once. The declarations are property-tested:

- every state is reachable from `initial`;
- every terminal state is absorbing (no outgoing transitions);
- no orphan states;
- every chain has ≥ 1 path to a terminal state;
- every guard carries a rejection reason code, and every reason code has a message;
- every `compensates` edge points at an edge that exists and reverses its `to`/`from`;
- every `holder` names a role in `roles`;
- every declaration round-trips through `JSON.stringify` unchanged;
- for every `blocking` effect, the target edge's guards do not themselves emit a blocking effect (no cycles);
- every field referenced by `title()` exists in `fields`.

And three that exist only to keep §1.1 from rotting back into a comment:

- **`settles` is present** on every declaration whose `key` is in the settlement / disbursement / margin / clearing domain list. It has no default. A missing `settles` fails the build, not a lint pass (**R-S5-1**).
- **`record_only_notice` is non-empty** whenever `settles === false`, and contains the literal string `NO SETTLEMENT FINALITY`. The frontend has no fallback copy, so an empty notice is an un-noticed silence, not a degraded render (**R-S5-3**).
- **No state on a `settles: false` chain is named `settled`, `disbursed`, or `funded` unless it is entered exclusively by an edge whose guard requires `payload.bank_reference`.** The honest terminals stay declared and unreachable; the reachable ones are named `*_instructed` (**R-S5-2**). Today this test passes because every such chain sets `settles: false` and every money state ends in `_instructed`. The day someone builds a rail, the test is what tells them which states they just made reachable.

And two that keep §8.1 from rotting the same way:

- **Identity is minted in exactly one place.** Scan the event log: every `participant` and `actor` row's `from_event_id` must resolve to a `participant_onboarding.apply` event, a `user_invite.accept` effect (actor rows only), or genesis migration 0. Any other transition that creates an identity row fails the test — including the well-meaning "quick admin endpoint" someone adds three years from now.
- **A backfilled admitted participant can act at 00:01.** For every imported participant whose `participant_onboarding` transaction sits at `admitted`, dry-run the first-value initiating edge for their membership class (the `first_value_chain.<membership_class>` reference value). The verdict vector must not contain `NOT_ADMITTED`. If it does, the backfill failed to replay the flag-clear — the import is wrong, not the guard. §11's P0/P1 gate as a permanent regression test, not a one-time cutover check.

And one per market pack (§8.2), run in a CI matrix across every pack:

- **The pack resolves completely.** Every `enabled_chains` variant key names a ChainDecl that exists in code; every `legal_basis.instrument_id` and every guard's `provision` resolves against `pack.legal_instruments` and its reference list; every guard parameter a chain's guards read exists in `guard_params`; every reference key a guard reads has a `reference_seeds` row; genesis `pack_hash` matches the built pack. A pack that passes boots; one that doesn't never deploys.

Fifteen properties × 148 declarations, plus the pack suite × N markets ≈ the coverage of 8,167 hand-written tests, and it catches the cases nobody thought to write.

---

## 15. What this rebuild does *not* do

- **It does not make money move.** `src/do/` contains one file. Settlement writes a ledger row against no custody and no rails. Making that false needs an FMA licence, a bank sponsor, and PASA/SARB integration, and no amount of architecture substitutes for it.

  What the rebuild *does* do is refuse to render the absence as a presence. That is not automatic — left alone, the rebuild makes the gap **less** visible, not more, by wrapping it in a hash-chained log and a regulator-addressed export pack. §1.1 is therefore binding, not advisory: `settles: boolean` is mandatory and unfailable (**R-S5-1**); no state is named `settled` / `disbursed` / `funded` unless a bank confirmation can reach it (**R-S5-2**); every export pack and every Transaction page for a `settles: false` chain carries the **NO SETTLEMENT FINALITY — RECORD ONLY** notice in text (**R-S5-3**). Ship the rebuild without those three and it ships a regulator-grade lie.
- It does not eliminate issues. It converts the **growth rate** of issues from multiplicative to additive.

  Hand-built surfaces grow as **chains × surfaces** — 148 × 7, with 131 falling out the bottom into a function menu because nobody could build the 1,037th screen. Generated surfaces grow as **chains** — 148 × 1. Every new chain today costs a route module, a migration, a screen, a test suite and a cron slot. Ground-up, it costs a declaration.

  That, and only that, is the case for the cost.

---

**Frontend:** [REBUILD_FRONTEND.md](../design/REBUILD_FRONTEND.md).
**Functional floor — all 148 chains and where each lands:** [REBUILD_FUNCTIONAL_FLOOR.md](REBUILD_FUNCTIONAL_FLOOR.md).
