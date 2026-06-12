# Meridian Execution Process — Quality Gates & Anti-Slop Discipline

Companion to [MERIDIAN_IMPLEMENTATION_PLAN.md](MERIDIAN_IMPLEMENTATION_PLAN.md) (the WHAT: 17 tasks, 7 phases).
This file is the HOW: the loop every task runs through, the gates every phase must pass, and the explicit ban lists that keep AI slop and known bug classes out.

**Rule zero: no task is "done" because code exists. A task is done when its gate commands ran and their output matched the expected output.** Claimed-done-without-evidence is the root slop behavior; everything below is enforcement.

---

## 1. Execution model

```
for each task in MERIDIAN_IMPLEMENTATION_PLAN.md:
  1. Implementer executes the task steps exactly (fresh subagent per task, or inline)
  2. Implementer runs the task's own verify commands — paste actual output, not "passed"
  3. Reviewer pass on the task's diff (cavecrew-reviewer or equivalent):
     spec compliance first (did it do what the task says), code quality second
  4. Findings fixed before the next task starts. No "fix later" pile.
  5. Commit per task. Commit message = task name. Never batch 3 tasks into one commit.

at each phase boundary:
  6. Phase gate (Section 5) — full command list, all green
  7. Runtime verification (Section 6) — drive the real app, capture evidence
```

Hard rules:
- **No parallel tasks that touch the same file.** Registry tasks (10–15) are parallelizable per role; everything else is sequential.
- **A failing gate stops the line.** Do not continue to the next task with a red gate "to come back later."
- **Scope discipline:** a task touches only the files it lists. Drive-by refactors, renames, and "while I'm here" edits are rejected in review.
- **No pushes to remote, ever, without explicit user authorization.** Branch `meridian` stays local until the user says ship.

---

## 2. Per-task loop (the TDD discipline)

Backend tasks (1, 2, 3, 7, 10–15):
1. Write the failing test FIRST (the plan includes the test code).
2. Run it. **Confirm it fails for the right reason** ("module not found" / assertion — not a typo in the test). A test that passes before implementation is a broken test.
3. Implement the minimum to pass. No speculative parameters, no "might need later" fields (YAGNI).
4. Run the test file, then `npm run check`. Paste both outputs.
5. Commit.

Frontend tasks (4, 5, 6, 8, 9, 16) — SPA has no unit runner, so the discipline shifts:
1. `npm run check:pages` after every file — TypeScript is the only fast feedback; keep it green continuously, not at the end.
2. Render the page in the real browser (local dev pair :8787 + :3000) before declaring the step done. A component that compiles but was never rendered does not count.
3. Playwright spec added in the same phase (Tasks 6, 8, 9) — the spec is the regression lock, write it while the behavior is fresh.

Data tasks (2, 10–15 registry population):
1. **Never type a column name that wasn't read from a migration file in this session.** Every `quantumCol`, `refCol`, `titleCol`, terminal status: grep/sed the actual DDL first, then transcribe. The registry-vs-DDL vitest (plan Task 2 Step 2) is the backstop, not the method.
2. Every `actions[].path` copied from the actual route file (`src/routes/*-chain.ts`), not reconstructed from memory. Every `cascadeHint` derived from that route's real `fireCascade` calls.
3. Lane keys copied from `roleData.ts` domain keys — open the file, copy the string.

---

## 3. Anti-slop registers

### 3.A Code slop — reviewer rejects on sight

| Ban | Why / replacement |
|---|---|
| `any`, `as any`, `@ts-ignore`, `@ts-expect-error` | Type the thing. Registry rows are `Record<string, unknown>` + explicit narrowing — that pattern exists in the plan, use it. |
| `TODO` / `FIXME` / placeholder comments | Either do it or put it in the plan's "out of scope" list. No third state. |
| Commented-out code, unused imports, dead exports | Delete. Git remembers. |
| `console.log` left in committed code | Remove before commit. |
| Copy-paste divergence | If HorizonPage and AtlasPage both parse `localStorage['user']`, extract `useRole()` into `meridian/lib.ts` ONCE. Two slightly-different copies of the same helper = bug factory. |
| Swallowed errors (`catch {}` on a user-facing fetch) | Every page fetch sets an error state with a Retry control. Plan components already model this — keep it when modifying. |
| Missing UI states | Every Meridian page ships loading + empty + error states. A board that white-screens on empty D1 is a failed task even if types pass. |
| `useState` for continuous values (timers, mouse) | Fuse bars recompute on data refresh (60s poll), not per-second `setInterval` re-renders of the whole board. |
| Invented APIs | Never call an endpoint, import an export, or use a prop not verified to exist (grep it). Hallucinated `api.patch('/horizon/ack')` style calls are the canonical AI bug. |
| Comments narrating the diff ("// added this to fix X") | Comments state constraints code can't show. Nothing else. |

### 3.B Design slop — absolute bans (from the locked Meridian design language)

| Ban | Replacement |
|---|---|
| Side-stripe accents (`border-left` > 1px colored) | Full hairline borders, background tints, position |
| Gradient text, AI-purple glows, neon-on-dark | Meridian is warm paper + petrol, locked. One accent. |
| Glassmorphism, decorative blur | Hairline rules. Veil blur ONLY on the ⌘K palette backdrop (dismissal semantics — the one allowed use). |
| Hero-metric template (big number / small label / gradient) | Quantum type steps by magnitude (13/15.5/20px) inside tiles — already specced |
| Identical card grids | Atlas is a typographic index, not cards. Horizon tiles vary by weight. |
| Emoji as icons | Text labels, hairlines, or existing SVG set |
| Em-dashes in UI copy | Commas, colons, periods |
| Red flood for urgency | Oxide reserved for BREACHED only; urgency is position + fuse, ramp ink→amber→oxide belongs to the time axis exclusively |
| Modal-first reflex | Thread is a page, palette is the only overlay. No new modals in Meridian v1. |

### 3.C A11y floor — non-negotiable, checked per page in review

- Smallest text 12px at ≥4.5:1 contrast (verify petrol-on-paper and ink2-on-paper pairs once, in Task 4, with an actual contrast check — record the ratios in the commit message).
- Every action a real `<button>`/`<a>`, hit area ≥40px.
- Breach conveyed by position + label + fuse state, never color alone (FuseBar already carries `aria-label`).
- Focus visible on tiles, duty actions, palette hits (`:focus-visible` ring in meridian.css — add in Task 4, this codebase has a known zero-focus-rings debt; Meridian does not inherit it).
- Palette: `role="dialog"`, focus trapped in input, Escape closes, arrow keys move selection (already in plan code — don't strip in review fixes).
- `prefers-reduced-motion`: fuse transitions and palette scale-in collapse to opacity-only.

---

## 4. Known bug classes — project-specific, each has burned us before

| # | Bug class | Guard |
|---|---|---|
| 1 | JWT role suffix mismatch (`grid` vs `grid_operator`, `ipp` vs `ipp_developer`, `carbon` vs `carbon_fund`) | Registry `lanes` keys and `actions[].roles` use SUFFIXED forms only. Task 8 Playwright cross-role check is the regression lock. Reviewer greps new code for bare `'grid'`/`'ipp'`/`'carbon'` role strings. |
| 2 | Auth rate limiter (10/5min/IP) burned by test logins | All scripts: `login_or_cached` with FULL email (`ipp@openenergy.co.za`, never `ipp`). Playwright: one API login per role per run, token seeded via `addInitScript`. Never loop logins. |
| 3 | Hono mount collision / silent route shadowing | After mounting `/api/horizon` and `/api/thread` (Tasks 3, 7): curl BOTH new routes AND one previously-working route (`/api/launch/lender`) locally. CI green ≠ wired up. Repeat against prod on deploy day. |
| 4 | CF edge caches stale SPA shell | Deploy-day checklist (Task 17): verify `Cache-Control: no-store` on `/*` before deploy, hard-refresh check after. |
| 5 | Tenancy leak via direct table reads | Task 3 Step 3: copy the exact tenant predicate from `covenant-certificate-chain.ts` GET into the horizon/thread SELECTs. Reviewer verifies the predicate is present in BOTH new routes. |
| 6 | Guessed column names | Registry-vs-DDL vitest + Section 2 data-task rule. |
| 7 | Migration ledger "fixes" | NO new migrations in this project (plan needs none). Never touch 001–505. Never reconcile the 019–048 ledger. |
| 8 | Goldrush synthetic data | Local seeding for eyeballing uses chain POST endpoints with obviously-fake counterparties — NEVER insert kWh/billing rows for NXT Energy / Goldrush sites. |
| 9 | SQL injection via registry interpolation | Table/column names interpolated into SQL come ONLY from the static `MERIDIAN_CHAINS` literal, never from request input. `chainKey` and `id` from the URL are bound parameters or registry-lookup keys only. Reviewer confirms no `c.req.param()` value ever reaches a string-built SQL fragment. |
| 10 | Action path drift | `actions[].path` strings are copied from route files; duty-stream/Thread POST failures must surface in the UI error state (no optimistic state flips before the response). |

---

## 5. Phase gates — exit criteria

Run the full block at each phase boundary. All green or the phase is not done. Paste outputs.

**Gate A — after Phase 1 (registry):**
```bash
cd open-energy-platform
npx vitest run src/utils/chain-registry-meridian.test.ts   # all pass incl. DDL consistency
npm run check                                              # 0 errors
```

**Gate B — after Phase 2 (horizon API):**
```bash
npx vitest run src/routes/horizon.test.ts && npm test      # new + ALL 474+ existing green
npm run check
# runtime: curl /api/horizon/lender (200, envelope shape), /api/horizon/trader as lender (403),
#          /api/launch/lender (still 200 — mount-collision check)
```

**Gate C — after Phase 3 (horizon UI):**
```bash
npm run check:pages
BASE=http://localhost:8787 npx playwright test tests/browser/meridian.spec.ts
# runtime protocol Section 6, lender persona
```

**Gate D — after Phase 4 (thread):**
```bash
npx vitest run src/routes/thread.test.ts && npm test
npm run check && npm run check:pages
BASE=http://localhost:8787 npx playwright test tests/browser/meridian.spec.ts
# runtime: two-sided check — same thread URL as lender (actions) and ipp (read-only)
```

**Gate E — after Phase 5 (atlas/⌘K):** Gate C commands + palette keyboard runtime check (⌘K, type, arrows, Enter, Escape — all from keyboard only).

**Gate F — after Phase 6 (all roles):**
```bash
npx vitest run src/utils/chain-registry-meridian.test.ts   # DDL test now covers ~60 entries
npm test && npm run check && npm run check:pages
# runtime: /horizon for EVERY persona (token-cached logins) — each renders or shows the
#          designed empty state; zero white screens, zero console errors
```

**Gate G — after Phase 7 (cutover):**
```bash
npm test && npm run check && npm run check:pages
BASE=http://localhost:8787 npx playwright test               # ENTIRE browser suite, not just meridian
BASE=http://localhost:8787 npm run test:browser
# runtime: full journey per Section 6 for 3 personas (lender, ipp, regulator)
# login → /horizon (not /feed) → tile → thread → action POST → cascade hint → ⌘K → workstation tab
```

---

## 6. Runtime verification protocol (per phase, not optional)

Tests passing proves CI runs. Phases additionally get verified by **driving the real app and capturing what it shows**:

1. Worker on :8787, SPA on :3000 (or built `pages/dist` behind the worker).
2. Login via UI as the phase's persona (once — rate limiter).
3. Walk the new surface end-to-end through the real interface (click tiles, don't curl underneath).
4. **Probe off the happy path, minimum three:**
   - empty data (fresh role with zero live cases → designed empty state, not blank board)
   - failing fetch (kill the worker mid-session → error state with Retry, no white screen)
   - wrong role (paste a thread URL for a chain your role has no lane on → clean 403 message)
   - garbage URL (`/thread/not_a_chain/123` → clean 404 message)
5. Screenshot the surface; check the browser console — **zero errors/warnings is the bar.**
6. Anything that made you pause gets written down with the gate output, even if "works."

---

## 7. Review checklist (applied to every task diff)

Spec compliance:
- [ ] Does exactly what the plan task says — nothing missing, nothing extra
- [ ] Only files the task lists are touched
- [ ] Verify commands were run; output shown matches expected

Quality:
- [ ] Section 3.A code bans — none present
- [ ] Section 3.B design bans — none present (UI tasks)
- [ ] Section 3.C a11y floor — met (UI tasks)
- [ ] Section 4 bug-class guards — relevant ones confirmed (roles suffixed, tenant predicate, bound params, paths copied not invented)
- [ ] New code matches surrounding idiom (existing api.ts patterns, existing route patterns)
- [ ] States complete: loading / empty / error (UI), 403 / 404 / malformed (API)

---

## 8. Ship gate (Task 17 — requires explicit user authorization)

1. All gates A–G green, outputs on record.
2. `git log meridian` reads as a clean per-task history.
3. Present to user. **No push, no deploy, until told.**
4. Deploy day (when authorized): verify `no-store` header config → deploy via `./deploy.sh` / CI → curl prod `/api/horizon/lender` + `/api/thread/covenant_certificate/<id>` + one legacy route → hard-refresh SPA → run one full persona journey on prod → nightly smoke stays green.
