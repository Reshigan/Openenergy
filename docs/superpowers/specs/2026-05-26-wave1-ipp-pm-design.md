# Wave 1 — IPP Project Management to P6-grade

**Date:** 2026-05-26
**Status:** Approved scope; implementation plan follows
**Parent:** [Platform Gold-Standard Roadmap](2026-05-26-platform-gold-standard-roadmap.md)

## Goal

Lift the IPP project surface from L3 (flat milestones, lifecycle stages) to P6/Primavera-grade depth: full WBS hierarchy, computed critical path, baselines, resources with calendars, and resource leveling. The surface is the master schedule view that an IPP developer/owner uses to track an EPC contractor's progress on a renewable-energy construction project.

## Capabilities

The Wave 1 exit bar — every item must be functional end-to-end in the UI:

### Scheduling spine

- **WBS hierarchy** — unbounded depth tree of summary tasks → tasks → milestones; reparent + sort + outline-number auto-renumber
- **Activities** with name, duration (working days), type (`summary` | `task` | `milestone`), notes, % complete, actual start/finish, calendar override
- **Dependencies** — N:M between activities, link type (`FS` | `SS` | `FF` | `SF`), lag (signed working days)
- **Constraints** — `ASAP` (default), `SNET` (start no earlier than), `FNLT` (finish no later than), `MSO` (must start on), `MFO` (must finish on)
- **CPM solver** — forward + backward pass; computes planned start/finish, total float, free float; flags critical path (float = 0); detects cycles and surfaces them
- **Status date** — user-settable; activities before status date are read-only for planned dates

### Calendars

- **Project calendar** — default workweek (e.g., Mon–Fri 8h, Sat 4h, Sun 0h)
- **Calendar exceptions** — holidays + non-standard days
- **Activity calendar override** — activity can opt into a different calendar
- Working-day arithmetic respects calendars throughout CPM

### Baselines

- Save snapshot (named, e.g., `BL01`, `Pre-FC`); immutable after creation
- Multiple baselines per project; one designated `current`
- Per-activity variance: `start_var`, `finish_var`, `duration_var` (working days)
- Baseline comparison view in Gantt (ghost bars under current schedule)

### Resources & leveling

- **Resource types** — `labor` (with crew size), `equipment` (with unit count), `material` (consumable)
- **Resource calendar** — overrides project calendar (e.g., crane on day shift only)
- **Assignments** — N:M between activities and resources, units (e.g., 0.5 = half-time, 2.0 = double crew), derived work hours
- **Over-allocation detection** — per resource, per working day: sum of assigned units > available
- **Leveling** — two modes:
  - **Resource-limited** — extend project end date as needed; defer activities to flatten over-allocation
  - **Time-limited** — must not push project end; reports unresolvable conflicts as errors
- Leveling is **explicit** (user-triggered, not auto on save); writes new planned dates and bumps `version`

### Integration with existing surfaces

- New tab on `ProjectDetail` (file shell): **Schedule** — full Gantt + WBS panel; the existing `Milestones` tab continues to show commercial milestones from `project_milestones` (financial-close, COD), and `project_milestones.linked_activity_id` lets a commercial milestone pin to a schedule milestone
- `IppWorkstationPage` summary panel surfaces critical-path slack + look-ahead 3-week activities
- `IppLifecyclePage` stage progress reads % complete from `project_activities` rolled up by stage tag
- Cascade event `project.schedule.recomputed` fires on every CPM run

## Architecture (Approach A: D1 canonical + KV cache)

```
┌──────────────────────────────────────────────────────────────┐
│ pages/                                                       │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ProjectDetail → EntityFileShell → "Schedule" tab        │ │
│  │   ├─ <GanttBoard/>     SVG bars, drag, dependency arrows│ │
│  │   ├─ <WbsPanel/>       outline table, inline edit       │ │
│  │   ├─ <ResourcesPanel/> assignments + over-allocation    │ │
│  │   └─ <BaselinesPanel/> save/compare baselines           │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                          │ /api/projects/:id/schedule/...
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ Worker (Hono)                                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ src/routes/project-schedule.ts   (new)                  │ │
│  │   list/create/update/delete activities + deps + assigns │ │
│  │   POST /recompute   → cpm.ts → cache snapshot in KV     │ │
│  │   POST /level       → leveling.ts → updates activities  │ │
│  │   POST /baselines   → snapshot activities               │ │
│  └────────────────────────────────────────────┬────────────┘ │
│                                               │              │
│  ┌────────────────────────────────────────────▼────────────┐ │
│  │ src/utils/cpm.ts     forward/backward pass, float        │ │
│  │ src/utils/leveling.ts  resource-limited/time-limited     │ │
│  │ src/utils/calendars.ts  working-day arithmetic           │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                          │
                ┌─────────┴──────────┐
                ▼                    ▼
        D1 (canonical)         KV (snapshot cache)
        project_activities     key: proj:<id>:schedule:v<n>
        activity_dependencies  value: {cpm_results, critical_path,
        project_calendars               total_duration, computed_at}
        calendar_exceptions
        project_resources
        resource_assignments
        project_baselines
        baseline_activities
        project_schedule_state
```

## Data model

New migration `092_ipp_project_schedule.sql` (all `CREATE TABLE IF NOT EXISTS`, idempotent, additive).

```sql
-- WBS + activity in one table; type discriminates.
CREATE TABLE IF NOT EXISTS project_activities (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  wbs_code TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('summary','task','milestone')),
  duration_days REAL NOT NULL DEFAULT 0,
  planned_start TEXT,
  planned_finish TEXT,
  early_start TEXT,
  early_finish TEXT,
  late_start TEXT,
  late_finish TEXT,
  total_float REAL,
  free_float REAL,
  is_critical INTEGER DEFAULT 0,
  actual_start TEXT,
  actual_finish TEXT,
  percent_complete REAL DEFAULT 0,
  constraint_type TEXT CHECK (constraint_type IN ('ASAP','SNET','FNLT','MSO','MFO')),
  constraint_date TEXT,
  calendar_id TEXT,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, wbs_code)
);
CREATE INDEX IF NOT EXISTS idx_activities_project ON project_activities(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_activities_parent  ON project_activities(parent_id);
CREATE INDEX IF NOT EXISTS idx_activities_critical ON project_activities(project_id, is_critical);

CREATE TABLE IF NOT EXISTS activity_dependencies (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  predecessor_id TEXT NOT NULL,
  successor_id TEXT NOT NULL,
  link_type TEXT NOT NULL CHECK (link_type IN ('FS','SS','FF','SF')),
  lag_days REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(predecessor_id, successor_id)
);
CREATE INDEX IF NOT EXISTS idx_deps_project ON activity_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_deps_succ    ON activity_dependencies(successor_id);
CREATE INDEX IF NOT EXISTS idx_deps_pred    ON activity_dependencies(predecessor_id);

CREATE TABLE IF NOT EXISTS project_calendars (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  workdays TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_exceptions (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL,
  exception_date TEXT NOT NULL,
  hours REAL NOT NULL,
  reason TEXT,
  UNIQUE(calendar_id, exception_date)
);

CREATE TABLE IF NOT EXISTS project_resources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('labor','equipment','material')),
  unit TEXT,
  max_units REAL NOT NULL DEFAULT 1,
  rate_per_unit REAL,
  calendar_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resource_assignments (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  units REAL NOT NULL DEFAULT 1,
  UNIQUE(activity_id, resource_id)
);

CREATE TABLE IF NOT EXISTS project_baselines (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  saved_by TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  notes TEXT,
  UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS baseline_activities (
  baseline_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  planned_start TEXT,
  planned_finish TEXT,
  duration_days REAL,
  PRIMARY KEY(baseline_id, activity_id)
);

CREATE TABLE IF NOT EXISTS project_schedule_state (
  project_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  status_date TEXT,
  last_computed_at TEXT,
  total_duration_days REAL,
  start_date TEXT,
  finish_date TEXT,
  has_cycles INTEGER DEFAULT 0
);

-- Backfill: existing project_milestones gets a nullable link to schedule
ALTER TABLE project_milestones ADD COLUMN linked_activity_id TEXT;
```

(`ALTER TABLE ADD COLUMN` follows the migration discipline in `CLAUDE.md` — `duplicate column name` is benign on re-apply.)

## CPM algorithm

Standard P6 forward/backward pass with FS/SS/FF/SF link semantics and working-day arithmetic.

**Forward pass** — for each activity in topological order:
- `ES = max over predecessors of (link-specific predecessor end + lag)`, advanced to next working day
- `EF = ES + duration` (working days, respecting calendar)
- Apply constraint: `SNET` floors `ES`; `MSO` pins `ES`; `MFO` pins `EF`; `FNLT` caps `EF`
- Summary activity `ES = min(children.ES)`, `EF = max(children.EF)`

**Backward pass** — for each activity in reverse topological order:
- `LF = min over successors of (link-specific successor start − lag)`, retreated to previous working day
- `LS = LF − duration`
- Apply constraint: `FNLT` caps `LF`; `MFO` pins `LF`
- Project end = `max(EF)` over leaves with no successors

**Float:**
- `total_float = LS − ES` (working days)
- `free_float = min over successors of (succ.ES − this.EF − lag)` — 0 if no successors
- `is_critical = (total_float ≤ 0)` (using ≤ to handle constraint-induced negative float)

**Cycle detection** — DFS three-colour algorithm during topological sort; if cycle found, surface the offending edge to the user and refuse to compute (state.has_cycles = 1).

**Complexity** — O(V + E) per pass; for 2k activities + 4k deps, single-thread JS runs in ~10–30ms.

Implementation: `src/utils/cpm.ts`.

## Leveling algorithm

Priority-based serial leveling (heuristic; not optimal but standard for P6).

**Inputs:** activity list with assignments + CPM results; mode (`resource-limited` | `time-limited`).

**Priority ordering** (within ready set):
1. Lower `total_float` first (critical activities deferred last)
2. Lower `early_start` first
3. Lower `wbs_code` lexicographic first (stable)

**Algorithm:**
1. Walk working days from project start forward
2. At each day, collect activities whose `ES ≤ day` and predecessors done; this is the ready set
3. Assign resources greedily in priority order; if an activity's assignment would over-allocate any resource, defer to next working day
4. In `time-limited` mode: if defer would push `LF` past constraint, record an unresolvable conflict but still defer
5. Emit new `planned_start` / `planned_finish` per activity
6. Re-run forward pass with new starts to confirm consistency

Returns: `{ updated: ActivityDates[], unresolved: ConflictReport[], modeOutcome: 'clean' | 'with-conflicts' }`.

Implementation: `src/utils/leveling.ts`.

## API surface

New route module `src/routes/project-schedule.ts`, mounted at `/api/projects/:id/schedule/`.

```
GET    /api/projects/:id/schedule                   → full schedule snapshot (from KV cache)
GET    /api/projects/:id/schedule/activities        → activities list (D1)
POST   /api/projects/:id/schedule/activities        → create activity
PATCH  /api/projects/:id/schedule/activities/:aid   → update activity (version check)
DELETE /api/projects/:id/schedule/activities/:aid   → delete activity (+ descendants)
POST   /api/projects/:id/schedule/activities/:aid/reparent  → move in WBS tree

GET    /api/projects/:id/schedule/dependencies      → list deps
POST   /api/projects/:id/schedule/dependencies      → create dep (validates no cycle)
DELETE /api/projects/:id/schedule/dependencies/:did → delete dep

GET    /api/projects/:id/schedule/calendars         → list calendars
POST   /api/projects/:id/schedule/calendars         → create calendar
PATCH  /api/projects/:id/schedule/calendars/:cid    → update calendar
POST   /api/projects/:id/schedule/calendars/:cid/exceptions → add exception
DELETE /api/projects/:id/schedule/calendars/:cid/exceptions/:eid

GET    /api/projects/:id/schedule/resources         → list resources
POST   /api/projects/:id/schedule/resources         → create resource
PATCH  /api/projects/:id/schedule/resources/:rid    → update resource
POST   /api/projects/:id/schedule/assignments       → create assignment
DELETE /api/projects/:id/schedule/assignments/:aid  → remove

POST   /api/projects/:id/schedule/recompute         → run CPM + cache
POST   /api/projects/:id/schedule/level             → run leveling (mode in body)

GET    /api/projects/:id/schedule/baselines         → list
POST   /api/projects/:id/schedule/baselines         → snapshot current as baseline (name in body)
PATCH  /api/projects/:id/schedule/baselines/:bid    → rename / set current
DELETE /api/projects/:id/schedule/baselines/:bid    → delete baseline (cascade rows)

GET    /api/projects/:id/schedule/look-ahead?weeks=3 → activities planned in next N weeks
GET    /api/projects/:id/schedule/critical-path     → ordered list of critical activities
GET    /api/projects/:id/schedule/over-allocations  → per-resource per-day over-allocations
```

All write endpoints fire `fireCascade({event:'project.schedule.*', actor_id, entity_type:'project_schedule', entity_id: project_id, data: {...}, env})`.

Cache invalidation: every write increments `project_schedule_state.version`; next read recomputes if cached version < current.

## UI

### Schedule tab on `ProjectDetail`

New file: `pages/src/components/schedule/ScheduleTab.tsx`. Three-pane layout matching density theme:

```
┌─────────────────────────────────────────────────────────────┐
│ Toolbar: Recompute · Level · Baseline · Look-ahead · Filter│
├──────────────┬──────────────────────────────────────────────┤
│ WBS panel    │ Gantt board                                  │
│ (40% width)  │ (60% width, horizontal scroll)               │
│              │                                              │
│ outline tbl  │ SVG bars, dep arrows, baseline ghosts        │
│ + inline edt │ + critical path highlight                    │
│              │                                              │
├──────────────┴──────────────────────────────────────────────┤
│ Bottom strip: Resources · Over-allocations · Baselines     │
│ (tabs, ~25vh, collapsible)                                  │
└─────────────────────────────────────────────────────────────┘
```

**WbsPanel** (`pages/src/components/schedule/WbsPanel.tsx`)
- Outline table; columns: WBS code, name, type icon, duration, start, finish, total float, % complete, predecessors
- Click row → focus Gantt bar
- Inline edit: name, duration; tab/enter to commit
- Indent/outdent buttons reparent; reorder via drag-handle
- Add child / add sibling / delete buttons per row
- Critical activities highlighted with `accent` background tint

**GanttBoard** (`pages/src/components/schedule/GanttBoard.tsx`)
- Custom SVG renderer; no external lib
- Header: zoomable timeline (day / week / month)
- Bars: tasks rendered as `<rect>`; summary bars as bracketed shape; milestones as diamonds
- Dependency arrows as `<path>` with arrowheads; FS = end → start, SS = start → start, etc.
- Baseline ghosts: lighter `<rect>` rendered below current bar when `currentBaseline` selected
- Drag-resize: left edge = start, right edge = finish, body = move
- Drop-target snapping to working days
- Selection state synced with WbsPanel via shared store

**ResourcesPanel** (`pages/src/components/schedule/ResourcesPanel.tsx`)
- Resource list (left) + heat-map by day (right)
- Cell colour: green ≤ 80%, amber ≤ 100%, red > 100%
- Click resource → filter Gantt to assigned activities

**BaselinesPanel** (`pages/src/components/schedule/BaselinesPanel.tsx`)
- List baselines; "Save current as baseline" button
- Set current baseline (Gantt shows ghosts when one is set)
- Variance summary: # activities with `|finish_var| > N days`

**State management** — local `useScheduleStore` zustand-style hook in `pages/src/components/schedule/useScheduleStore.ts`; backed by SWR for fetch + cache. Mutations call API then `mutate()` to refresh.

**Density adaptation** — `IppWorkstationPage` already chose `cinematic`; ScheduleTab respects the role theme but defaults to `bloomberg` density (information-dense) when tab is active.

### Workstation summary

`IppWorkstationPage` gains a "Schedule pulse" KPI strip pulled from `/api/projects/:id/schedule/critical-path`:
- Critical path duration (days)
- Activities on critical path (count)
- Slack to finish (working days from today to project end)
- Next 14-day look-ahead activity count

### Lifecycle integration

`IppLifecyclePage` reads activity completion to compute stage progress:
- Activity has optional `lifecycle_stage` tag (added later via Wave 1.1; deferred)
- For Wave 1, lifecycle progress remains computed from `project_milestones` (unchanged)

## Concurrency

Optimistic locking via `project_activities.version`.

- Client sends `If-Match: <version>` header (or `version` in body) on PATCH/DELETE
- Server checks current row version; mismatch → 409 with current state
- UI surfaces conflict inline: "This activity was updated by another user; refresh to continue."

Two simultaneous edits to the **same activity** conflict-stop (no silent merge). Two simultaneous edits to **different activities** both succeed; CPM recompute is idempotent.

## Cascades

Events fired:

- `project.schedule.activity.created` `{activity_id, wbs_code}`
- `project.schedule.activity.updated` `{activity_id, changes}`
- `project.schedule.activity.deleted` `{activity_id}`
- `project.schedule.dependency.created` `{predecessor_id, successor_id, link_type}`
- `project.schedule.dependency.deleted` `{predecessor_id, successor_id}`
- `project.schedule.recomputed` `{total_duration_days, critical_count}`
- `project.schedule.leveled` `{mode, conflicts}`
- `project.schedule.baseline.saved` `{baseline_id, name}`
- `project.schedule.critical_path.changed` `{added: [], removed: []}`

Standard fan-out: action_queue → audit chain → briefing → notifications (for assigned-resource human; deferred until users join resources) → webhooks.

## AI assists (Wave 1 micro-slice)

Inline assists on the Schedule tab — one per surface, no AI tabs:

1. **"Why is this critical?"** inline on each critical activity row → calls `/api/ai/explain-criticality?activity_id=...` → returns 2-sentence narration of which predecessor chain drives the criticality.
2. **"Forecast slip"** inline on the toolbar → calls `/api/ai/forecast-slip?project_id=...` → uses % complete + planned finish to project actual finish; surfaces drift in days.

Both are advisory (no auto-apply). Implementation reuses `src/utils/ai.ts` `ask()` helper.

## Testing

### Unit (`vitest`)

- `cpm.test.ts` — forward/backward pass on hand-built graphs:
  - Linear chain → trivially critical
  - Diamond (1→2, 1→3, 2→4, 3→4) → both 2 and 3 may be critical
  - Lag (FS+5, FS−2)
  - Calendar (weekends skipped)
  - Constraints (`SNET`, `FNLT`)
  - Summary roll-up
  - Cycle detection
- `leveling.test.ts` — over-allocation scenarios:
  - Two activities sharing a resource → second defers
  - Resource calendar narrower than project → adjustments
  - Time-limited mode with unresolvable conflict
- `calendars.test.ts` — working-day arithmetic with exceptions
- `project-schedule.routes.test.ts` — CRUD + version-conflict + cascade firing

### Browser (`playwright`)

- `tests/browser/ipp-schedule.spec.ts` — log in as IPP, navigate to a seeded project's Schedule tab, verify Gantt renders, edit an activity duration, see CPM recompute, save baseline, verify ghost shows up.

### Smoke

- `scripts/smoke-crud.sh` — extend to POST/GET/PATCH/DELETE one activity per IPP smoke run.

## Migration discipline

- New migration `092_ipp_project_schedule.sql`
- All `CREATE TABLE IF NOT EXISTS`; idempotent on re-apply
- `ALTER TABLE project_milestones ADD COLUMN linked_activity_id` — `duplicate column name` benign on retry (matches CI policy in `CLAUDE.md`)
- Apply locally with `wrangler d1 migrations apply open-energy-db --local`
- Apply remotely via the deploy workflow (`wrangler d1 migrations apply --remote` for the regular band; 092 is post-051 so the regular path works)

## Out of scope (this wave)

- Cost / EVM / S-curves (Wave 2 candidate for IPP, or rolled into Wave 11 Fund/Capital)
- Risk register + Monte Carlo
- Issue tracker
- Change orders + RFIs + submittals
- XER / MPP import
- Multi-project portfolio resource pool
- Recurring activities
- Activity codes / categorisation beyond WBS

## Wave exit checklist

- [ ] Migration 092 applied locally + remote; `wrangler d1 migrations list` clean
- [ ] All API endpoints respond per the surface above; 401/403 enforced; cascades fire
- [ ] Schedule tab renders for the IPP demo project with seeded 50+ activities
- [ ] Gantt bars drag, deps draw, baseline ghosts overlay
- [ ] CPM solver tests green; cycle detection surfaces example cycle
- [ ] Leveling test green for over-allocation + time-limited conflict
- [ ] `npm test` green
- [ ] `scripts/smoke-crud.sh` + `scripts/smoke-roles.sh` green
- [ ] Playwright IPP schedule spec green
- [ ] AI inline assists return non-empty responses with cited activity IDs
- [ ] Cascade events visible in audit explorer for one full round-trip
- [ ] Roadmap doc updated: Wave 1 marked complete; Wave 2 unblocked

## Next action

Hand off to `superpowers:writing-plans` for the checkpoint-able implementation plan.
