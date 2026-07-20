# Open Energy — Ground-Up Rebuild (Frontend)

**Register:** `product` — design SERVES the product. The tool disappears into the task.
**Companion:** [REBUILD_PLAN.md](../architecture/REBUILD_PLAN.md) (backend). Read that first; this document assumes its L0–L6 layers.
**Identity:** [DESIGN.md](DESIGN.md) tokens are preserved verbatim. No re-palette. Identity-preservation wins.

---

## 0. The premise

Four surfaces. Not four hundred.

| Surface | What it answers | Route |
|---|---|---|
| **Home** | What do I have to do? | `/` |
| **Transaction** | What is going on with this thing, and what can I do about it? | `/t/:human_ref` |
| **Find** | Where is that thing? | `/find` (⌘K anywhere) |
| **Trade** | (the one genuine exception) | `/trade` |

Everything the current 356 route modules do lands in one of those four, in a settings panel, or as a work item on somebody's Home. Nothing is lost. See [REBUILD_FUNCTIONAL_FLOOR.md](../architecture/REBUILD_FUNCTIONAL_FLOOR.md) for the chain-by-chain accounting.

**One exception is a decision. Two exceptions is the old system.** Trade is the exception, and it is argued for in §5.

---

## 1. The one rule, restated for the frontend

> **Input is always generated from the declaration. Presentation may be custom. There is no exception for input.**

A custom **read-only** render is a design decision (settlement statement, depth ladder, EVM S-curve, Gantt, meter waterfall). A custom **form** is a bug. The moment one form is hand-written, its validation drifts from the guard that will reject it, and the UI starts lying about why the button is disabled. That is precisely the failure the current platform exhibits.

Concretely: `TxnView.actions[].form` is a `FormSchema` derived from `TransitionDecl.input`. `<TransitionForm schema={…}/>` renders it. There is no second form component.

---

## 2. Tokens — unchanged from DESIGN.md

Reproduced here because the rebuild must not drift. **These are committed brand colors; they are not re-derived.**

```css
:root {
  /* Surfaces */
  --s0: oklch(0.14 0.008 250);   /* canvas */
  --s1: oklch(0.18 0.006 250);   /* card */
  --s2: oklch(0.22 0.005 250);   /* raised — header, dialog */
  --s-panel: oklch(0.16 0.007 252); /* the second neutral layer: side nav, toolbars */

  --border-subtle: oklch(0.28 0.004 250);
  --border-strong: oklch(0.38 0.006 250);

  --ink:     oklch(0.92 0.005 90);    /* body — 13.4:1 on --s0 */
  --ink-2:   oklch(0.62 0.008 250);   /* secondary — 4.8:1 on --s0 */
  --ink-3:   oklch(0.44 0.006 250);   /* muted — NON-TEXT ONLY. see §2.1 */

  /* Status */
  --good: oklch(0.70 0.20 145);
  --warn: oklch(0.76 0.20 75);
  --bad:  oklch(0.62 0.22 20);
  --neutral: oklch(0.70 0.12 250);
  --info: oklch(0.72 0.18 240);

  /* Type */
  --font-sans: "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;

  /* Fixed rem scale. Not fluid. Ratio ≈1.15. */
  --t-11: 0.6875rem; --t-12: 0.75rem;  --t-13: 0.8125rem;
  --t-15: 0.9375rem; --t-18: 1.125rem; --t-24: 1.5rem; --t-32: 2rem;

  /* Space — 4px base */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-6: 24px; --sp-8: 32px;

  /* Radius */
  --r-table: 2px; --r-control: 6px; --r-card: 12px; --r-drawer: 16px;

  /* Motion */
  --dur-fast: 120ms; --dur: 180ms; --dur-slow: 240ms;
  --ease-out: cubic-bezier(0.165, 0.84, 0.44, 1);  /* ease-out-quart */

  /* Semantic z-index. Never 999. */
  --z-dropdown: 100; --z-sticky: 200; --z-backdrop: 300;
  --z-modal: 400; --z-toast: 500; --z-tooltip: 600;
}
```

**Role accents**, ≤10% of surface, used for primary actions, current selection, and state indicators only. Never decoration.

| Role | Accent |
|---|---|
| Trader | `oklch(0.72 0.22 145)` |
| IPP | `oklch(0.68 0.18 55)` |
| Lender | `oklch(0.65 0.15 240)` |
| Offtaker | `oklch(0.70 0.20 175)` |
| Grid | `oklch(0.72 0.24 95)` |
| Carbon | `oklch(0.68 0.18 165)` |
| Regulator | `oklch(0.62 0.14 20)` |
| ESCO | `oklch(0.67 0.16 205)` |
| Admin | `oklch(0.60 0.08 250)` |

Exposed as `--accent` on `<body data-role="…">`. One variable. Components never name a role.

### 2.1 Contrast — a correction to the current system

`--ink-3` at `oklch(0.44 …)` on `--s0` is **2.5:1**. It fails 4.5:1. It is currently used for labels, and that is the single most-repeated accessibility defect in the SPA.

Rule for the rebuild:
- `--ink-3` is permitted for **borders, dividers, disabled-control fills, and icon strokes on non-essential affordances**. Never for text.
- Labels use `--ink-2` (4.8:1).
- Placeholders use `--ink-2`. A placeholder is text.
- Disabled *text* uses `--ink-2` with `opacity: 0.7` → 3.4:1, which is legal only because disabled controls are exempt from WCAG 1.4.3 — and we still never encode meaning in a disabled label alone. The `blockedBy` reason is rendered as live text next to it.

---

## 3. Home — your work, not a menu

Onboarding is deleted as a concept. Onboarding is Home on day one. The Inbox is deleted: it was a drifting shadow copy of the queue, and email/push are Home, remote.

### 3.0 First run — day zero, before admission

The wizard is gone; the *work* it did survives as chains ([REBUILD_PLAN.md §8.1](../architecture/REBUILD_PLAN.md)): `participant_onboarding`, `user_invite`, `mandate`. What the applicant sees on day zero:

- **Home's Next card is their own onboarding transaction** — a multi-step generated form, same FieldDecl renderer as every other txn. There is no special onboarding UI to build or maintain.
- **Find works** — scoped to their own txn plus the public catalogue. Look-around is real tier-public data plus a declaration-rendered read-only "how this works" preview from public `GET /api/v2/chains/:chain_key`. No sandbox, ever.
- **Trade renders** with submit disabled: *"Blocked — membership pending (NOT_ADMITTED)"*. The blocked state teaches the product; a hidden one teaches nothing.
- **Drafting is open.** Every initiable chain has a guard-free `draft` state; guards sit on `submit`. An applicant mid-KYC drafts a PPA today and submits the day they are admitted.

**The checklist is derived, not stored.** `GettingStarted.tsx` (226 LOC) is already the component: checklist, progress fraction, `next_best_step` with `{item_key, why, action_href}`, one primary "Do this" button. It was pointed at onboarding. It is the general case. `GET /api/v2/home` computes its items from dry-run verdict vectors — the actor's onboarding txn actions plus the role's first-value chain initiating-edge dry-run; each failing guard in declared order is one item whose copy *is* its RejectionCode message; `next_best_step` is the first failing guard's `remedy` deep-link. The component re-renders unchanged.

**A visible "Start something" button** sits in the Home header, opening Find pre-scoped to initiable transitions. ⌘K stays; betting activation on a keyboard chord does not.

Per-role aha moments the design is accountable to (some roles cannot self-activate — their moment arrives via someone else's transition):

| role | aha moment |
|---|---|
| ipp_developer | project registered + first licence application opened |
| trader | first order accepted by guards |
| lender | joined a facility syndicate |
| offtaker | first PPA invite received |
| regulator | first application in queue (free, via `statutory_observer`) |

Activation metrics ship day one, all queries over L1: signup → active elapsed, time-to-first-initiated/completed txn per role, D7 return-to-Home, ⌘K invocations per actor-week, % first drafts abandoned, per-guard block counts on first attempts.

### Layout

```
┌────────────────────────────────────────────────────────────────────┐
│ [OE]  Home   Find ⌘K   Trade        Ntanga Ngobeni · IPP    ⌄      │  56px, --s2
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Next                                                              │  --t-11 label, --ink-2
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  PPA-26-7K3M · Eskom Megaflex wheeling                       │  │  --t-18 --ink
│  │  Awaiting your counter-signature · due in 2 days             │  │  --t-13 --ink-2
│  │  Because the offtaker signed on 8 Jul.                       │  │  --t-13 --ink-2
│  │                                          [ Counter-sign  ⏎ ] │  │  --accent fill
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  Your queue · 14                                    [ Filter ⌄ ]   │
│  ────────────────────────────────────────────────────────────────  │
│  DUE   DRW-26-2P8Q   Drawdown #4 · R 12,400,000   Lender review    │  rows: 44px
│  2d    PTW-26-J17C   Permit to work · Inverter 3  You              │
│  5d    LIC-26-B4XX   Generation licence           NERSA            │
│  …                                                                 │
│                                                                    │
│  Waiting on others · 6                                        ⌄    │  collapsed
│  Recently done · 23                                           ⌄    │  collapsed
└────────────────────────────────────────────────────────────────────┘
```

### Rules

- **Sorted by consequence, never alphabetically, never by date alone.** The sort key is `(blocking_others DESC, sla_breach_imminent DESC, money_value DESC, due_at ASC)` — `money_value` is the item's notional in the deployment's settlement currency minor units (REBUILD_PLAN.md §8.2; was `zar_value` in earlier drafts — currency never appears in a field name). A drawdown that gates a construction milestone outranks an older RFI. Non-financial work (a `permit_to_work`, an `hse_incident`) has no `money_value`; null sorts last *within its consequence tier*, so a blocking safety permit still outranks a high-value item that blocks no one — the money term only breaks ties among peers, it never dominates the key.
- **Every row answers five questions in one line:** what it is (`human_ref` + title), what state, who holds it, what's due, one action.
- **`holder` comes from the declaration** (`states[s].holder`). If the holder is you, it is in *Your queue*. If not, *Waiting on others*. There is no third bucket and no manual assignment feature.
- **The "why" line is `caused_by`**, rendered. Not a tooltip, not a modal, not a "details" toggle. One sentence, always visible on the Next card, on hover-reveal in the queue.
- **Zero state teaches.** Empty queue reads: *"Nothing waiting on you. 6 transactions are with counterparties — see Waiting on others. To start something new, press ⌘K and type what you want to do."* Not "No items."
- **No hero metric.** No big number with supporting stats. The count next to "Your queue" is a count, at `--t-13`, in `--ink-2`.
- **No card grid.** The queue is a table. `--r-table: 2px`. No alternating row fills. Hover: `background: --s1`. Selected: `background: --s1` + a 1px `--accent` left border — 1px, so it is not a side stripe.

### Density

`data-density="compact"` (44px rows) is the default because the users are professionals with 14–200 open items. `comfortable` (56px) is available in settings. Both are structural; type never scales.

---

## 4. The Transaction — one page, and it *is* the log

This is the whole rebuild, rendered.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Home    PPA-26-7K3M                                     ⌘K   /  · Trader  │
├─────────────────────────────────────────────────────────────────────────────┤
│ Eskom Megaflex wheeling agreement                                           │  --t-24
│ ●  Awaiting counter-signature   ·   held by You   ·   due 12 Jul, 17:00     │  state pill + --ink-2
│ Seller LTM Energy · Buyer Eskom Holdings · Observer NERSA                   │  --t-13 --ink-2
│                                                                             │
│  [ Counter-sign ]  [ Request amendment ]  [ Withdraw ]           ⋯ 3 more   │
│    --accent          --s2 border          --bad text            overflow    │
├──────────────────────────────────┬──────────────────────────────────────────┤
│ TIMELINE                         │ TERMS                                    │
│                                  │                                          │
│ ● 08 Jul 14:22  Offtaker signed  │ Tariff        R 1.85 / kWh    ⓘ         │
│   Thandi Mokoena · Eskom         │ Escalation    CPI + 1.0%      ⓘ         │
│   ⤷ created CRB-26-9F2D          │ Term          20 years        ⓘ         │
│                                  │ Volume cap    4,200 MWh/yr    ⓘ         │
│ ● 08 Jul 09:10  Terms agreed     │                                          │
│   system:cascade                 │ ⓘ = who set it, when, and on which event │
│   because MYPD6 published        │                                          │
│                                  │ CREATED                                  │
│ ● 02 Jul 11:47  Draft opened     │ ⤷ CRB-26-9F2D  Carbon entitlement        │
│   Ntanga Ngobeni · LTM Energy    │ ⤷ DRW-26-2P8Q  Drawdown eligibility      │
│                                  │                                          │
│ [ ↓ 14 earlier events ]          │ CAUSED BY                                │
│                                  │ ⤷ TAR-26-0001  MYPD6 determination       │
└──────────────────────────────────┴──────────────────────────────────────────┘
```

### Why this is the whole thesis

**The human narrative and the regulator's tamper-evident proof are the same artifact, rendered twice.** The timeline is `SELECT * FROM event WHERE txn_id = ? ORDER BY seq`. The regulator export is the same query with hashes attached. They cannot disagree, because there is nothing for them to disagree about.

Consequences, each of which deletes a feature the current system has:

1. **Every field value has an author, timestamp, reason, and event id — for free.** The `ⓘ` affordance opens an inline popover (native `popover` attribute, not a modal — see §8), reading *"Set by Thandi Mokoena on 8 Jul 14:22, on event `ppa_contract.counter_sign`. Reason: MYPD6 escalation applied."* No audit-trail feature. No "history" tab. The history is the page.
2. **Fields change only via a transition.** There is no inline edit. If a value can change, some edge changes it, and that edge appears as an action.
3. **Both counterparties see one page.** Different affordances (the buttons differ by `edge.by`), same facts. S3 rendered.
4. **A blocked action is disabled with its reason code, read from the same predicate that will reject it.** `actions[].blockedBy` comes from a dry-run of the guard chain. The disabled `Counter-sign` button carries, beside it in `--warn`: *"Blocked — counterparty KYC expired 3 Jul (`KYC_STALE`)."* Not a tooltip. The reason is text, always visible, next to the thing it blocks.

### The record-only notice — R-S5-3, rendered

The thesis above cuts both ways. If the timeline *is* the regulator's evidence, then a timeline ending in an event named `settled` asserts, tamper-evidently, that money moved. It did not. `src/do/` contains one file. Settlement writes a ledger row against no custody and no rails. See [REBUILD_PLAN.md §1.1](../architecture/REBUILD_PLAN.md).

**For any transaction whose `ChainDecl` carries `settles: false`, the Transaction page renders `decl.record_only_notice` as text, in the main column, above the first timeline event.** Not a tooltip. Not behind a disclosure triangle. Not a dismissible banner. A `<p>` in the document flow, `--warn` on `--s1`, scrolling with the page like any other content:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ DRW-26-0117 · Drawdown · R 42 000 000                       [ Instruct pay ] │
├──────────────────────────────────────────────────────────────────────────────┤
│  NO SETTLEMENT FINALITY — RECORD ONLY                          --warn --t-13 │
│  This page records instructions and their authorisation chain. It does not   │
│  evidence the movement of funds. The operator holds no custody, operates no  │
│  payment rails, and holds no licence under the Financial Markets Act         │
│  19/2012.                                                                    │
│                                                                              │
│ ● 04 Jul 09:12  Payment instructed        Naledi Dube   DRAWDOWN_CP_MET      │
│ ● 03 Jul 16:40  Conditions precedent met  Naledi Dube                        │
│ ○ ── settled ──  declared · unreachable · no rail can emit this event        │
└──────────────────────────────────────────────────────────────────────────────┘
```

Three properties, each a test in [REBUILD_PLAN.md §14](../architecture/REBUILD_PLAN.md):

- The string is `decl.record_only_notice`, which the build rejects as empty when `settles === false`. The frontend carries **no fallback copy**, because the frontend must not be able to soften it.
- The unreachable terminal states (`settled`, `disbursed`, `funded`) still render, greyed, in the timeline's future-state rail, with the reason they cannot be reached. **The state machine shows a `settled` state that nothing in the platform can enter.** That is more informative than omitting the state, and it is the picture a regulator needs.
- `<TransitionForm>` repeats the notice above the submit button on any edge whose `to` is a money state on a `settles: false` chain. The person clicking `Instruct payment` reads it at the moment of clicking, not on the page they came from.

Tamper-evidence attests the record was not *altered*. It says nothing about whether the record was *true when written*. This notice is the only thing on the page that speaks to the second question — which is why nothing in the design system may collapse, animate, or defer it.

### Actions — the "one primary action" problem, solved honestly

"One primary action" is a good rule that fails at real decisions. A regulator assessing a licence application has five legitimate outcomes and none is primary.

**Rule:** **one primary, at most three buttons total, plus an overflow of ≤5 secondary.** When more than three legitimate actions exist, do not render a row of buttons — render a **Decision block**:

```
┌─ Decision ──────────────────────────────────────────────┐
│  ○ Grant licence                                        │
│  ○ Grant with conditions          → 2 more fields       │
│  ● Refuse                         → reason required     │
│  ○ Request further information                          │
│  ○ Refer to tribunal                                    │
│                                                         │
│  Reason  [ s.10(2)(b) — inadequate financial standing ⌄]│  structured vocabulary
│  Note    [                                            ] │
│                        [ Submit determination ]         │
└─────────────────────────────────────────────────────────┘
```

Radio + structured reason + submit. It is a form, so it is generated — from the set of transitions available on this state to this role. Selecting an option reveals only that edge's `input` fields, inline, no layout jump (reserve the space; animate `opacity` and `translateY(4px)` over `--dur`).

**A Decision block is generated, not designed.** The engine emits it whenever `actions.filter(a => a.enabled).length > 3`.

### The `/` command bar

Focus anywhere on a Transaction, press `/`, type an edge name. `/counter` → `Counter-sign`. Enter fires it, opening the generated form inline in the action area. This is how the five power users who lost their muscle memory get it back in a week instead of six. It is 40 lines over the same `actions[]` array the buttons render from.

### Timeline detail

- Events with `actor_kind: 'system:cascade'` render the causing transaction as a link: *"because MYPD6 published"*. That link is `caused_by`. **This is what a "journey" is.** No journey engine, no workflow designer, no `journey_feature_config`.
- `⤷ created CRB-26-9F2D` is `SELECT … WHERE caused_by = event_id`. Downstream causality, on the page, always.
- The tail streams. SSE on `/api/v2/txn/:ref/events?after=:seq`. New events slide in over `--dur` with `translateY(-4px) → 0`, `opacity 0 → 1`. **From the log, never from a projection** — a projection can be rebuilt; a notification cannot be un-sent.
- Long chains collapse. `[ ↓ 14 earlier events ]` expands in place, fetching the next 50 older events into the same column. This *is* the pagination the performance budget (§11) names — batched in-place loading, never a routed page and never a numbered pager. Newest events are always mounted; history is what pages in on demand.

---

## 5. Trade — the argued exception

Continuous, latency-sensitive, keyboard-driven, and the unit of interaction is a *price level*, not a transaction. A generated form cannot render a depth ladder, and a 150 ms optimistic action is the wrong model when the book moves in 20 ms.

Trade keeps its own surface: depth ladder, blotter, position strip. It talks to the `OrderBook` DO, which is ported verbatim.

**But orders are still transactions.** An order that fills produces a trade, which is a transaction with two parties, a log, and a Transaction page. Clicking a fill in the blotter opens `/t/TRD-26-…`. The exception is the *entry surface*, not the *object model*.

Pre-trade guards render exactly as elsewhere: the ticket's submit button is disabled with its reason code, in the composition order declared in the engine (credit → exposure → mark age → halt → KYC). A trader who breaches an exposure limit is told *"Blocked — net exposure R 41.2m exceeds R 40m limit (`EXPOSURE_LIMIT`)"*, and that string comes from the guard, not from the ticket.

---

## 6. Find — objects, never functions

One box. It searches transactions, participants, assets, and the public catalogue. It does not search *functions*. "Create a work order" is not a search result; it is a transition on an asset.

Atlas is deleted. Atlas existed because 131 chains had no home. They have one now.

```
⌘K
┌───────────────────────────────────────────────────────┐
│ 🔍  drawdown eskom                                    │
├───────────────────────────────────────────────────────┤
│ TRANSACTIONS                                          │
│  DRW-26-2P8Q   Drawdown #4 · R12.4m      Lender review │
│  DRW-26-1M4A   Drawdown #3 · R8.1m       Disbursed     │
│ PARTICIPANTS                                          │
│  Eskom Holdings SOC Ltd                  Offtaker      │
│ START SOMETHING                                       │
│  ⊕ Request a drawdown        on KDM Solar (LTM Energy) │
└───────────────────────────────────────────────────────┘
```

**"Start something"** is how new transactions begin. It is the `+New` from the old Ledger, moved to where people already are. It lists every chain whose `initial` state has a transition whose `by` includes one of your roles — **including the ones you cannot fire yet**. A blocked entry renders disabled per §2.1's disabled-text rule, with its `blockedBy` reason as live text beside it (*"Blocked — membership pending"*, *"Blocked — no credit line"*). Hiding them would tell a new participant the platform is empty; disabling them tells them exactly what stands between here and there.

### Existence is not leaked

Find indexes only rows the actor may see under §8 of the backend plan. **There is no "2 results, 1 hidden."** The count itself reveals the deal. A counterparty cannot discover a transaction before it is invited; invitation is a transition.

Discovery — the legitimate need to find someone to trade with — is served by the **public catalogue**: listings, granted licences, published tariffs, retired credits. Separately indexed, deliberately populated, tier `public`. Find shows it under a `MARKETPLACE` heading, visually distinct, because the trust model is different and the user must know which one they are looking at.

This decision is taken now, before Find is built, because it cannot be retrofitted.

### Zero state

An empty box shows the actor's three most-used *Start something* transitions (from their own history, not a global default) under a single line: *"Search your transactions, counterparties, and assets — or start something below."* A query that matches nothing the actor may see reads *"No matches you can see. If you expect a transaction here, you may not be a party to it yet."* — never a bare "0 results", which would itself leak that the box works.

---

## 7. FieldDecl → control. The heart of "input is generated."

This table is the contract. A `FieldDecl` that does not map to a row here cannot be declared.

| `FieldDecl.type` | Control | Validation surfaced | Notes |
|---|---|---|---|
| `text` | `<input type=text>` | maxLength counter at 80% | |
| `long_text` | `<textarea>` autogrow | maxLength counter | 65–75ch wrap |
| `number` | `<input type=text inputmode=decimal>` | min/max, step, precision | **mono, tabular-nums** |
| `money` | number + currency prefix/suffix from `Intl.NumberFormat(pack.locale, {style:'currency', currency})` | min/max | currency comes from the chain field (contract/settlement currency, REBUILD_PLAN.md §8.2) — SA renders `R`, Kenya `KSh`/`$`. mono. thousands sep on blur. |
| `percent` | number + `%` suffix | 0–100 | stored as decimal, displayed ×100 |
| `energy` | number + unit toggle (kWh/MWh/GWh) | | unit is part of the value |
| `date` | `<input type=date>` | min/max, business-day rule | **native.** rendered in the market timezone from `pack.time.utc_offset_minutes` (SAST in SA), UTC stored |
| `datetime` | `<input type=datetime-local>` | | zone shown explicitly, label from the pack: `17:00 SAST` in SA, `17:00 EAT` in Kenya |
| `duration` | number + unit select | | maps to `Duration` |
| `enum` | ≤5 options → radio group; >5 → `<select>` | | never a custom dropdown |
| `multi_enum` | checkbox group; >8 → multiselect combobox | | |
| `list` | repeatable row of a sub-`FieldDecl[]`; `[ + Add ]` appends, each row removable | min/max count, per-row rules | e.g. drawdown line items, milestone schedule. Reorder disabled unless declared `ordered` |
| `ref` | typeahead over the tier-filtered index | existence + visibility | shows `human_ref` + title, never a UUID |
| `participant` | typeahead over `participant` | KYC status inline | |
| `file` | drop zone → R2 presigned PUT | mime, size, virus scan pending state | hash shown after upload |
| `signature` | e-sign provider embed | | bought, not built |
| `bool` | switch | | never a checkbox for a state toggle |
| `reason_code` | `<select>` from the edge's `ReasonVocabulary` | required | **never free text alone** |
| `readonly_computed` | text, `--ink-2`, no border | | e.g. "DSCR 1.34× (computed)" |

**Server-side validation is authoritative.** Client validation is a courtesy that must be *derived from the same `FieldDecl`*, never re-typed. Any rule expressible client-side is expressed there; any rule that needs the log or reference data is a **guard**, and its rejection surfaces on submit in the same slot as a field error.

**Conditional fields are declared, not scripted.** A `FieldDecl` may carry `visibleWhen: { field, equals }` — the control renders only when the referenced field on the same form holds that value (the `Grant with conditions → 2 more fields` reveal in §4 is exactly this). Reserve the layout height and animate `opacity` + `translateY(4px)`; never reflow. A hidden field submits nothing and is not validated. The predicate is evaluated client-side for reveal and re-checked server-side, from the same declaration.

Errors render **below the field, in `--bad`, at `--t-13`, with the reason code in mono** — `Tariff must not exceed the MYPD6 cap of R2.10/kWh (TARIFF_CAP)`. The code is there because the user will paste it into an email to support, and support will grep for it.

---

## 8. Component vocabulary

Every interactive component ships **all seven states**: default, hover, focus, active, disabled, loading, error. Not five. This is where product UIs quietly rot.

| Component | Notes |
|---|---|
| `Button` | 3 intents × 3 sizes. `--r-control: 6px`. Focus: 2px `--accent` outline, 2px offset. Loading: label stays, spinner replaces the icon slot, width does not change. |
| `StatePill` | 2-tone: state colour at 20% alpha bg + full-chroma text. No icon. `--t-11` mono caps. |
| `TransitionForm` | The only form component. Renders a `FormSchema`. |
| `DecisionBlock` | Generated when `enabled actions > 3`. §4. |
| `Table` | Virtualized above 100 rows. Sticky header. Column choice + saved views (§10). Row hover `--s1`. No zebra. |
| `Timeline` | The event log. SSE tail. §4. |
| `Popover` | Native `popover` attribute + `position-anchor`. **Never `position:absolute` inside `overflow:auto`** — it clips. |
| `Drawer` | 480px, right, `translateX(100%) → 0` over `--dur-slow`. Used for a *related* object, never for input on the current one. |
| `Modal` | Native `<dialog>`. **Two legitimate uses in the whole app:** an irreversible confirmation, and the ⌘K palette. Everything else is inline. Modal-as-first-thought is banned. |
| `Toast` | Outcome only. Never used to report an error a field can report. |
| `AiCard` | Inline in the workflow surface. Left accent bar — **the one declared exception to the side-stripe ban**, because it *is* the affordance, not decoration. Carries a "why" line and one accept button. Accepting fires a transition and appears in the timeline as `actor_kind: user`, `reason_code: ai_suggested`. AI never fires a transition on its own. |
| `Skeleton` | For loading, always. Never a spinner in the middle of content. |
| `EmptyState` | Teaches the interface. Names the next action. Never "No data." |

### Motion

150–250 ms. `--ease-out` (quart). No bounce, no spring, no elastic.

| Event | Animation |
|---|---|
| Tab / section switch | `opacity 0→1`, `translateY(4px→0)`, `--dur-fast` |
| Drawer | `translateX(100%→0)`, `--dur-slow` |
| Timeline event arrives | `translateY(-4px→0)`, `opacity 0→1`, `--dur` |
| Value updates from a cascade | 400ms `--accent` background flash at 12% alpha, decaying |
| Decision option reveals fields | `opacity` + `translateY(4px)`, `--dur`. Space reserved; no layout jump. |

```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 1ms !important; transition-duration: 1ms !important; }
  /* Every motion above has a no-motion identity: the end state, applied instantly. */
}
```

**No orchestrated page-load sequence.** The user loads into a task. Reveals enhance an already-visible default — content is never gated behind a class-triggered transition, because transitions do not fire on hidden tabs or in headless renderers, and the section ships blank.

---

## 9. Keyboard

The five power users are the reason this exists on day one, not in phase 3.

| Key | Action |
|---|---|
| `⌘K` | Find |
| `/` | Command bar (Transaction only) — fire a transition by name |
| `j` / `k` | Move in queue or table |
| `⏎` | Open focused row / fire the primary action |
| `x` | Toggle row selection (bulk) |
| `⌘⏎` | Submit the open form |
| `esc` | Close popover → drawer → modal, in that order |
| `g h` | Go Home |
| `g t` | Go Trade |
| `?` | Shortcut sheet |

Focus is visible, always: 2px `--accent` outline, 2px offset. Focus is trapped in `<dialog>` and released on close. Every action reachable by keyboard is reachable by pointer, and the reverse.

---

## 10. The ten generic capabilities

This is the real backlog. It is the part every generated-UI project skips, and it is the reason those projects die: the generated screen is 90% of the work and 40% of the value.

1. **Bulk** — select N on Find or a queue, apply one transition. UI presents *one act and one undo*, not N. Server: `applyTransitions(Command[])`, one `batch()` per 50, N events sharing a `batch_id`.
2. **Saved views** — a named filter + sort + column set. Shareable by URL. Per-user, optionally per-role as a default.
3. **Column choice** — which `FieldDecl`s appear. Persisted with the view.
4. **Export** — CSV always, PDF where a read-only render exists. Export is a transition (`exported`), so it is in the log, which is what POPIA §14 wants anyway.
5. **Full keyboard navigation** — §9.
6. **Deep link to any state** — `/t/PPA-26-7K3M?action=counter_sign` opens the page with that form open. Every email link is one of these.
7. **Undo as a compensating transition** — never a `DELETE`. `TransitionDecl.compensates` names the inverse edge. The undo appears in the timeline. Where no inverse exists, the button is absent and the state is honest about it.
8. **Attachments** — `file` FieldDecl. R2 presigned. Hash recorded in the event. The file cannot be swapped without the hash changing, which is what makes the evidence chain evidence.
9. **Comments and @mention on the transaction** — a comment is an event of type `comment`. It sits in the timeline with everything else. An @mention adds the mentioned participant to the Home queue of the person mentioned, with a `caused_by`. It does not add them as a party.
10. **Optimistic action with a real failure path** — the button enters `loading`, the timeline shows a pending event at 60% opacity, and on rejection the pending event is replaced by the rejection with its reason code, in `--bad`, in place. Never a toast that vanishes. Never a silent revert.

---

## 10.1 Microtools — pure calculators, zero writes

A microtool is the read-only sibling of a transition. Same declaration discipline, opposite guarantee: a transition writes an event; a microtool writes *nothing, ever*. It takes inputs, runs one pure function, returns readonly outputs. That property is what lets it surface everywhere — Find, the `/` command bar, an inline card on a Transaction — with no permission model of its own, because there is nothing to permit.

`ToolDecl`:

| Field | Meaning |
|---|---|
| `key` | stable id, e.g. `evm`, `dscr`, `tco2e` |
| `label` | Find/`/` display name |
| `roles[]` | listing visibility only. A tool reads no records, so roles gate whether it *appears* in a role's Find/`/`, never correctness. It leaks no existence (§6) because it holds no data to leak. |
| `inputs: FieldDecl[]` | same FieldDecl vocabulary as §7. Same generated controls. Nothing bespoke. |
| `compute: (inputs) => Readonly<Outputs>` | **MUST be a pure function already exported from a `*-spec.ts`.** The tool does not re-implement; it re-surfaces. |
| `boundToTxnFields?: string[]` | when present, the tool mounts as an inline card on any Transaction whose chain exposes those fields; inputs prefill from the txn and stay editable for what-if. |

**The one rule that makes microtools safe: the `compute` function is the same function the guard calls.** `cpi()` powers both the change-order over-cap guard and the EVM microtool. They cannot disagree, because they are one function. A microtool that computed its own CPI would be a second source of truth — a bug waiting to surface in an audit. This is the §7 "client validation is the same declaration the server enforces" invariant, applied to arithmetic.

**Anything that writes is a transition, not a tool.** A "reserve capacity" button is a transition. A "what would the reservation cost" calculator is a tool. When a tool's output makes the user want to act, the act is a deep-link (§10.6) into the transition that does it — the tool hands off, it never writes.

Where they surface — no tool has a route, a queue, a saved-view, or an audit row (there is nothing to audit in a function that reads):
- **Find (`⌘K`)** — a tool is a first-class result beside objects. Type "EVM", get the calculator.
- **`/` command bar (§4.5)** — `/eac`, `/dscr`, `/tco2e`. On a Transaction the bar prefills from txn fields.
- **Inline card** — `boundToTxnFields` tools mount read-only on the Transaction and recompute as the txn's own numbers change.

The per-role microtool inventory lives in [REBUILD_FUNCTIONAL_FLOOR.md](../architecture/REBUILD_FUNCTIONAL_FLOOR.md) §MT. Every row names the existing `*-spec.ts` function it re-surfaces — the inventory is a wiring list, not a build list.

---

## 11. Performance budgets

| Budget | Target | Mechanism |
|---|---|---|
| Home first contentful paint | < 400 ms cold | Route-level code split. Home ships without Trade's charting bundle. |
| Home data | < 150 ms | One query against a read-replica over the queue projection. KV-cached counts, TTL 30 s — **counts only, never a row a user acts on.** |
| Transaction page | < 250 ms | One `TxnView` request. Timeline mounts newest 50, older events page in via the §4 collapse control, tail streams. **No waterfall:** actions, fields, parties, timeline all in one response. |
| Table | 60 fps at 10k rows | Virtualized. Fixed row height per density. |
| Trade depth ladder | < 50 ms tick-to-paint | Direct DO websocket. Canvas, not DOM, above 40 levels. |
| Bundle | < 180 KB gzip initial | No chart library on the initial route. No date library — `Intl` + one `saDay()`. |

**No client-side state library.** The server returns `TxnView` including `actions[]` with `enabled` and `blockedBy` already computed. There is nothing for the client to derive, therefore nothing for it to derive *wrongly*. This is the frontend consequence of the backend decision, and it is worth more than any state-management choice.

---

## 12. Responsive

Structural, not fluid. Type never scales with viewport.

| Breakpoint | Change |
|---|---|
| < 720px | Side nav collapses to the top bar. Transaction becomes single-column: header → actions → timeline → terms. Table becomes a stacked list of the 3 columns marked `primary` in the view. |
| 720–1200px | Two-column Transaction. Terms below timeline on narrow. |
| > 1200px | As drawn in §4. |

Mobile matters for exactly two roles — O&M and EPC on site. Their work is `permit_to_work`, `wo`, `hse_incident`, `punch_list`. Those four chains get tested on a phone every release. The rest are desktop-first and honest about it.

---

## 13. Accessibility floor

- Body text ≥ 4.5:1. Large text ≥ 3:1. Placeholders ≥ 4.5:1. §2.1 fixes the current `--ink-3` defect.
- State is never colour alone. A `StatePill` carries a word. A `--bad` field error carries a reason code.
- Every control has an accessible name. Icon-only buttons carry `aria-label` and a tooltip with the same string.
- `prefers-reduced-motion` honoured everywhere.
- Live regions: the timeline tail is `aria-live="polite"`; a rejection is `aria-live="assertive"`.
- A control disabled by a guard is `aria-disabled="true"` and stays focusable (`tabindex="0"`, not the native `disabled` attribute) so a keyboard or screen-reader user reaches it and hears why; its reason code is wired via `aria-describedby` to the rejection text. Native `disabled` would make the block silent and unreachable — the reason code is the whole point.
- Target size ≥ 44×44 CSS px on mobile routes.

---

## 14. What is deliberately NOT built

- **No dashboards as a destination.** Analytics is a projection over the log; it renders as a read-only surface reachable from Home, not as a role's landing page. The landing page is work.
- **No notification centre.** Notifications are Home, remote. An email is a Home row with a deep link.
- **No settings for things that should be declarations.** If an admin wants to change who may approve a drawdown above R10m, that is a guard, and it is code review, not a toggle. `journey_feature_config` is deleted.
- **No AI tab, no AI modal.** `AiCard`, inline, with a why and a one-click accept. Unchanged from the current design principle, which was right.
- **No custom scrollbars, no non-standard modals, no invented form controls.** The bar is earned familiarity. A user fluent in Linear, Stripe, and Raycast should sit down and trust this, not pause at every subtly-off component.

---

## 15. The measure

Hand-built surfaces grow as **chains × surfaces**: 148 × 7, with 131 falling out the bottom into a function menu because nobody could build the 1,037th screen. That is the platform we have, and Atlas is its tombstone.

Generated surfaces grow as **chains**: 148 × 1.

Adding a chain today costs a route module, a migration, a screen, a test suite, and a cron slot. After this rebuild it costs a declaration, and the screen, the audit trail, the queue row, the regulator export, the SLA timer, and the undo all already exist.

The rebuild does not eliminate issues. **It converts the growth rate of issues from multiplicative to additive.** That is the entire case, and it is enough.
