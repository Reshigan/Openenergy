# Wave 1 — IPP Project Management to P6-grade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the IPP project surface from L3 to P6/Primavera-grade: full WBS + CPM + baselines + resources + leveling, end-to-end functional in the UI.

**Architecture:** D1 canonical + KV-cached CPM snapshot, version-stamped optimistic concurrency, custom SVG Gantt, in-Worker CPM/leveling (≤2k activities). Per spec `docs/superpowers/specs/2026-05-26-wave1-ipp-pm-design.md`.

**Tech Stack:** Cloudflare Workers + D1 + KV + Hono backend; React 18 + Vite SPA; vitest + Playwright tests; SVG-only Gantt (no third-party lib).

---

## File Structure

**Backend (open-energy-platform/)**
- Create `migrations/092_ipp_project_schedule.sql` — data model
- Create `src/utils/calendars.ts` — working-day arithmetic
- Create `src/utils/cpm.ts` — forward/backward pass + float + cycle detection
- Create `src/utils/leveling.ts` — resource-limited / time-limited heuristic
- Create `src/routes/project-schedule.ts` — full REST surface
- Modify `src/index.ts` — mount the new route module
- Create `tests/cpm.test.ts`, `tests/calendars.test.ts`, `tests/leveling.test.ts`, `tests/project-schedule.routes.test.ts`
- Create `migrations/093_project_schedule_seed.sql` — seed 50+ activities into demo project

**Frontend (pages/src/)**
- Create `components/schedule/types.ts` — shared TS types
- Create `components/schedule/useScheduleStore.ts` — SWR-backed hook
- Create `components/schedule/WbsPanel.tsx` — outline table
- Create `components/schedule/GanttBoard.tsx` — SVG Gantt
- Create `components/schedule/ResourcesPanel.tsx` — heat-map
- Create `components/schedule/BaselinesPanel.tsx` — save/compare
- Create `components/schedule/ScheduleTab.tsx` — composite
- Create `components/schedule/explainCriticality.ts` + `forecastSlip.ts` — AI assist clients
- Modify `components/file/projectFileConfig.tsx` — add Schedule tab
- Modify `components/pages/IppWorkstationPage.tsx` — add schedule-pulse KPI strip

**Tests**
- Create `tests/browser/ipp-schedule.spec.ts` — Playwright end-to-end

---

## Tasks

### Task 1: Migration 092 — data model

**Files:** Create `open-energy-platform/migrations/092_ipp_project_schedule.sql`

- [ ] **Step 1: Write the migration** — full DDL from the spec (project_activities, activity_dependencies, project_calendars, calendar_exceptions, project_resources, resource_assignments, project_baselines, baseline_activities, project_schedule_state). All `CREATE TABLE IF NOT EXISTS`. Add `ALTER TABLE project_milestones ADD COLUMN linked_activity_id TEXT;` (CI tolerates `duplicate column name`).

- [ ] **Step 2: Apply locally**
```bash
cd open-energy-platform && wrangler d1 migrations apply open-energy-db --local
```
Expected: "Migrations applied successfully" or "already applied" — no error.

- [ ] **Step 3: Smoke the schema**
```bash
cd open-energy-platform && wrangler d1 execute open-energy-db --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('project_activities','activity_dependencies','project_resources','project_baselines','project_schedule_state');"
```
Expected: 5 rows.

- [ ] **Step 4: Commit**
```bash
git add open-energy-platform/migrations/092_ipp_project_schedule.sql
git commit -m "feat(schedule): migration 092 — WBS/deps/resources/baselines tables"
```

---

### Task 2: Calendar utilities

**Files:** Create `open-energy-platform/src/utils/calendars.ts`, `open-energy-platform/tests/calendars.test.ts`

- [ ] **Step 1: Define the type + interface**
```typescript
export interface Calendar {
  id: string;
  workdays: Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun', number>;
  exceptions: Record<string, number>;  // 'YYYY-MM-DD' -> hours (0 = holiday)
}

export function hoursOnDate(cal: Calendar, dateISO: string): number;
export function addWorkingDays(cal: Calendar, startISO: string, days: number): string;
export function workingDaysBetween(cal: Calendar, startISO: string, endISO: string): number;
export function isWorkingDay(cal: Calendar, dateISO: string): boolean;
```

- [ ] **Step 2: Write failing tests**
```typescript
import { describe, it, expect } from 'vitest';
import { Calendar, addWorkingDays, workingDaysBetween, hoursOnDate, isWorkingDay } from '../src/utils/calendars';

const fiveDay: Calendar = {
  id: 'std',
  workdays: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
  exceptions: {},
};

describe('calendars', () => {
  it('addWorkingDays skips weekends', () => {
    expect(addWorkingDays(fiveDay, '2026-06-01', 1)).toBe('2026-06-02'); // Mon -> Tue
    expect(addWorkingDays(fiveDay, '2026-06-05', 1)).toBe('2026-06-08'); // Fri -> Mon
  });
  it('addWorkingDays handles zero', () => {
    expect(addWorkingDays(fiveDay, '2026-06-01', 0)).toBe('2026-06-01');
  });
  it('addWorkingDays accepts fractional days as 1', () => {
    // Half-day still counts as a working day for date math
    expect(addWorkingDays(fiveDay, '2026-06-01', 0.5)).toBe('2026-06-01');
    expect(addWorkingDays(fiveDay, '2026-06-01', 1.5)).toBe('2026-06-02');
  });
  it('respects exceptions', () => {
    const withHoliday: Calendar = { ...fiveDay, exceptions: { '2026-06-03': 0 } };
    expect(addWorkingDays(withHoliday, '2026-06-01', 3)).toBe('2026-06-05'); // skips Wed holiday
  });
  it('workingDaysBetween counts inclusive of start, exclusive of end', () => {
    expect(workingDaysBetween(fiveDay, '2026-06-01', '2026-06-08')).toBe(5);
  });
  it('isWorkingDay weekends false', () => {
    expect(isWorkingDay(fiveDay, '2026-06-06')).toBe(false); // Saturday
    expect(isWorkingDay(fiveDay, '2026-06-01')).toBe(true);  // Monday
  });
});
```

- [ ] **Step 3: Run tests, expect failures**
```bash
cd open-energy-platform && npx vitest run tests/calendars.test.ts
```
Expected: all FAIL with "undefined".

- [ ] **Step 4: Implement `src/utils/calendars.ts`**
```typescript
export interface Calendar {
  id: string;
  workdays: Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun', number>;
  exceptions: Record<string, number>;
}

const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'] as const;

function parseISO(d: string): Date {
  // Force UTC noon to dodge DST surprises in date arithmetic.
  return new Date(d + 'T12:00:00Z');
}
function fmtISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function hoursOnDate(cal: Calendar, dateISO: string): number {
  if (cal.exceptions[dateISO] !== undefined) return cal.exceptions[dateISO];
  const dow = DAY_KEYS[parseISO(dateISO).getUTCDay()];
  return cal.workdays[dow as keyof Calendar['workdays']] || 0;
}

export function isWorkingDay(cal: Calendar, dateISO: string): boolean {
  return hoursOnDate(cal, dateISO) > 0;
}

export function addWorkingDays(cal: Calendar, startISO: string, days: number): string {
  const whole = Math.ceil(days);
  if (whole <= 0) return startISO;
  let d = parseISO(startISO);
  let advanced = 0;
  while (advanced < whole) {
    d = new Date(d.getTime() + 86400000);
    if (isWorkingDay(cal, fmtISO(d))) advanced++;
  }
  return fmtISO(d);
}

export function workingDaysBetween(cal: Calendar, startISO: string, endISO: string): number {
  let d = parseISO(startISO);
  const end = parseISO(endISO);
  let n = 0;
  while (d < end) {
    if (isWorkingDay(cal, fmtISO(d))) n++;
    d = new Date(d.getTime() + 86400000);
  }
  return n;
}
```

- [ ] **Step 5: Run tests, expect green**
```bash
cd open-energy-platform && npx vitest run tests/calendars.test.ts
```
Expected: all PASS.

- [ ] **Step 6: Commit**
```bash
git add open-energy-platform/src/utils/calendars.ts open-energy-platform/tests/calendars.test.ts
git commit -m "feat(schedule): working-day calendar arithmetic"
```

---

### Task 3: CPM solver

**Files:** Create `open-energy-platform/src/utils/cpm.ts`, `open-energy-platform/tests/cpm.test.ts`

- [ ] **Step 1: Define types**
```typescript
// src/utils/cpm.ts (top)
import { Calendar, addWorkingDays, workingDaysBetween } from './calendars';

export type LinkType = 'FS' | 'SS' | 'FF' | 'SF';
export type ConstraintType = 'ASAP' | 'SNET' | 'FNLT' | 'MSO' | 'MFO';

export interface CpmActivity {
  id: string;
  parent_id?: string | null;
  type: 'summary' | 'task' | 'milestone';
  duration_days: number;
  calendar_id?: string | null;
  constraint_type?: ConstraintType | null;
  constraint_date?: string | null;
}

export interface CpmDep {
  predecessor_id: string;
  successor_id: string;
  link_type: LinkType;
  lag_days: number;
}

export interface CpmResult {
  id: string;
  early_start: string;
  early_finish: string;
  late_start: string;
  late_finish: string;
  total_float: number;
  free_float: number;
  is_critical: boolean;
}

export interface CpmRun {
  results: Record<string, CpmResult>;
  critical_path: string[];          // ordered activity IDs forming a critical chain
  total_duration_days: number;
  start_date: string;
  finish_date: string;
  cycle?: string[];                  // present if cycle detected; aborts run
}

export function runCpm(
  activities: CpmActivity[],
  deps: CpmDep[],
  calendars: Record<string, Calendar>,
  defaultCalendarId: string,
  projectStart: string
): CpmRun;
```

- [ ] **Step 2: Write failing tests**
```typescript
import { describe, it, expect } from 'vitest';
import { runCpm, CpmActivity, CpmDep } from '../src/utils/cpm';
import { Calendar } from '../src/utils/calendars';

const cal: Calendar = { id: 'std',
  workdays: { mon:8,tue:8,wed:8,thu:8,fri:8,sat:0,sun:0 }, exceptions: {} };
const cals = { std: cal };

const A = (id: string, dur: number, parent?: string, type: 'task'|'milestone'|'summary' = 'task'): CpmActivity =>
  ({ id, duration_days: dur, parent_id: parent ?? null, type, calendar_id: 'std', constraint_type: null, constraint_date: null });
const dep = (p: string, s: string, lt: 'FS'|'SS'|'FF'|'SF' = 'FS', lag = 0): CpmDep =>
  ({ predecessor_id: p, successor_id: s, link_type: lt, lag_days: lag });

describe('cpm', () => {
  it('linear chain — all critical', () => {
    const acts = [A('a',2), A('b',3), A('c',1)];
    const deps = [dep('a','b'), dep('b','c')];
    const r = runCpm(acts, deps, cals, 'std', '2026-06-01');
    expect(r.results.a.is_critical).toBe(true);
    expect(r.results.b.is_critical).toBe(true);
    expect(r.results.c.is_critical).toBe(true);
    expect(r.total_duration_days).toBe(6);
  });

  it('diamond — short path has float', () => {
    const acts = [A('a',1), A('b',5), A('c',1), A('d',1)];
    const deps = [dep('a','b'), dep('a','c'), dep('b','d'), dep('c','d')];
    const r = runCpm(acts, deps, cals, 'std', '2026-06-01');
    expect(r.results.b.is_critical).toBe(true);
    expect(r.results.c.is_critical).toBe(false);
    expect(r.results.c.total_float).toBeGreaterThan(0);
  });

  it('lag FS+2', () => {
    const acts = [A('a',2), A('b',2)];
    const deps = [dep('a','b','FS',2)];
    const r = runCpm(acts, deps, cals, 'std', '2026-06-01');
    expect(r.total_duration_days).toBe(6);
  });

  it('SS link', () => {
    const acts = [A('a',5), A('b',2)];
    const deps = [dep('a','b','SS',0)];
    const r = runCpm(acts, deps, cals, 'std', '2026-06-01');
    // b starts when a starts; both finish within a's window
    expect(r.results.b.early_start).toBe(r.results.a.early_start);
  });

  it('milestone has zero duration', () => {
    const acts = [A('a',3), A('m',0,undefined,'milestone'), A('b',2)];
    const deps = [dep('a','m'), dep('m','b')];
    const r = runCpm(acts, deps, cals, 'std', '2026-06-01');
    expect(r.results.m.early_start).toBe(r.results.m.early_finish);
    expect(r.total_duration_days).toBe(5);
  });

  it('cycle detection', () => {
    const acts = [A('a',1), A('b',1)];
    const deps = [dep('a','b'), dep('b','a')];
    const r = runCpm(acts, deps, cals, 'std', '2026-06-01');
    expect(r.cycle).toBeDefined();
    expect(r.cycle!.length).toBeGreaterThan(0);
  });

  it('SNET constraint floors early start', () => {
    const acts = [A('a',2), { ...A('b',2), constraint_type: 'SNET', constraint_date: '2026-06-15' } as CpmActivity];
    const deps = [dep('a','b')];
    const r = runCpm(acts, deps, cals, 'std', '2026-06-01');
    expect(r.results.b.early_start >= '2026-06-15').toBe(true);
  });
});
```

- [ ] **Step 3: Run tests, expect fail**
```bash
cd open-energy-platform && npx vitest run tests/cpm.test.ts
```

- [ ] **Step 4: Implement `src/utils/cpm.ts`**
```typescript
import { Calendar, addWorkingDays, workingDaysBetween, isWorkingDay } from './calendars';

export type LinkType = 'FS' | 'SS' | 'FF' | 'SF';
export type ConstraintType = 'ASAP' | 'SNET' | 'FNLT' | 'MSO' | 'MFO';

export interface CpmActivity {
  id: string; parent_id?: string | null;
  type: 'summary' | 'task' | 'milestone';
  duration_days: number;
  calendar_id?: string | null;
  constraint_type?: ConstraintType | null;
  constraint_date?: string | null;
}
export interface CpmDep {
  predecessor_id: string; successor_id: string;
  link_type: LinkType; lag_days: number;
}
export interface CpmResult {
  id: string;
  early_start: string; early_finish: string;
  late_start: string; late_finish: string;
  total_float: number; free_float: number;
  is_critical: boolean;
}
export interface CpmRun {
  results: Record<string, CpmResult>;
  critical_path: string[];
  total_duration_days: number;
  start_date: string;
  finish_date: string;
  cycle?: string[];
}

function calFor(a: CpmActivity, cals: Record<string, Calendar>, def: string): Calendar {
  return cals[a.calendar_id || def] || cals[def];
}

// finish_date = start + duration working days, minus one (inclusive)
function finishFromStart(cal: Calendar, start: string, days: number): string {
  if (days <= 0) return start;
  return addWorkingDays(cal, start, days - 1);
}
function startFromFinish(cal: Calendar, finish: string, days: number): string {
  if (days <= 0) return finish;
  // Walk back working days
  let d = new Date(finish + 'T12:00:00Z');
  let advanced = 0;
  const whole = Math.ceil(days) - 1;
  while (advanced < whole) {
    d = new Date(d.getTime() - 86400000);
    const iso = d.toISOString().slice(0,10);
    if (isWorkingDay(cal, iso)) advanced++;
  }
  return d.toISOString().slice(0,10);
}

function topoSort(activities: CpmActivity[], deps: CpmDep[]): { order: string[]; cycle?: string[] } {
  const ids = new Set(activities.map(a => a.id));
  const adj: Record<string, string[]> = {};
  const indeg: Record<string, number> = {};
  for (const a of activities) { adj[a.id] = []; indeg[a.id] = 0; }
  for (const d of deps) {
    if (!ids.has(d.predecessor_id) || !ids.has(d.successor_id)) continue;
    adj[d.predecessor_id].push(d.successor_id);
    indeg[d.successor_id]++;
  }
  const order: string[] = [];
  const queue: string[] = [];
  for (const id in indeg) if (indeg[id] === 0) queue.push(id);
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const m of adj[n]) {
      indeg[m]--;
      if (indeg[m] === 0) queue.push(m);
    }
  }
  if (order.length < activities.length) {
    // Find a cycle via DFS on remaining
    const remaining = activities.filter(a => !order.includes(a.id)).map(a => a.id);
    return { order, cycle: remaining };
  }
  return { order };
}

export function runCpm(
  activities: CpmActivity[],
  deps: CpmDep[],
  cals: Record<string, Calendar>,
  defaultCalendarId: string,
  projectStart: string
): CpmRun {
  const leaves = activities.filter(a => a.type !== 'summary');
  const summaries = activities.filter(a => a.type === 'summary');
  const byId: Record<string, CpmActivity> = Object.fromEntries(activities.map(a => [a.id, a]));

  const { order, cycle } = topoSort(leaves, deps);
  if (cycle) {
    return {
      results: {}, critical_path: [], total_duration_days: 0,
      start_date: projectStart, finish_date: projectStart, cycle,
    };
  }

  const predsOf: Record<string, CpmDep[]> = {};
  const succsOf: Record<string, CpmDep[]> = {};
  for (const a of leaves) { predsOf[a.id] = []; succsOf[a.id] = []; }
  for (const d of deps) {
    if (!byId[d.predecessor_id] || !byId[d.successor_id]) continue;
    predsOf[d.successor_id]?.push(d);
    succsOf[d.predecessor_id]?.push(d);
  }

  const ES: Record<string,string> = {};
  const EF: Record<string,string> = {};

  // Forward pass on leaves
  for (const id of order) {
    const a = byId[id];
    const cal = calFor(a, cals, defaultCalendarId);
    let es = projectStart;
    for (const d of predsOf[id]) {
      const p = byId[d.predecessor_id];
      const pCal = calFor(p, cals, defaultCalendarId);
      let candidate: string;
      if (d.link_type === 'FS') candidate = addWorkingDays(pCal, EF[p.id], 1 + Math.max(0, d.lag_days));
      else if (d.link_type === 'SS') candidate = addWorkingDays(pCal, ES[p.id], Math.max(0, d.lag_days));
      else if (d.link_type === 'FF') candidate = startFromFinish(cal, addWorkingDays(pCal, EF[p.id], d.lag_days), a.duration_days);
      else /* SF */ candidate = startFromFinish(cal, addWorkingDays(pCal, ES[p.id], d.lag_days), a.duration_days);
      if (candidate > es) es = candidate;
    }
    // Apply constraints
    if (a.constraint_type === 'SNET' && a.constraint_date && a.constraint_date > es) es = a.constraint_date;
    if (a.constraint_type === 'MSO' && a.constraint_date) es = a.constraint_date;
    ES[id] = es;
    EF[id] = finishFromStart(cal, es, a.duration_days);
    if (a.constraint_type === 'MFO' && a.constraint_date) {
      EF[id] = a.constraint_date;
      ES[id] = startFromFinish(cal, EF[id], a.duration_days);
    }
  }

  // Project finish
  const finishCandidates = leaves.map(a => EF[a.id]).filter(Boolean);
  const projectFinish = finishCandidates.length
    ? finishCandidates.reduce((m, v) => v > m ? v : m, finishCandidates[0])
    : projectStart;

  // Backward pass
  const LS: Record<string,string> = {};
  const LF: Record<string,string> = {};
  for (const id of [...order].reverse()) {
    const a = byId[id];
    const cal = calFor(a, cals, defaultCalendarId);
    let lf = projectFinish;
    if (succsOf[id].length) {
      lf = succsOf[id].reduce((acc, d) => {
        const s = byId[d.successor_id];
        const sCal = calFor(s, cals, defaultCalendarId);
        let candidate: string;
        if (d.link_type === 'FS') candidate = addWorkingDays(sCal, LS[s.id], -1 - Math.max(0, d.lag_days));
        else if (d.link_type === 'FF') candidate = addWorkingDays(sCal, LF[s.id], -Math.max(0, d.lag_days));
        else if (d.link_type === 'SS') candidate = finishFromStart(cal, addWorkingDays(sCal, LS[s.id], -d.lag_days), a.duration_days);
        else /* SF */ candidate = finishFromStart(cal, addWorkingDays(sCal, LF[s.id], -d.lag_days), a.duration_days);
        return candidate < acc ? candidate : acc;
      }, lf);
    }
    if (a.constraint_type === 'FNLT' && a.constraint_date && a.constraint_date < lf) lf = a.constraint_date;
    if (a.constraint_type === 'MFO' && a.constraint_date) lf = a.constraint_date;
    LF[id] = lf;
    LS[id] = startFromFinish(cal, lf, a.duration_days);
    if (a.constraint_type === 'MSO' && a.constraint_date) {
      LS[id] = a.constraint_date;
      LF[id] = finishFromStart(cal, LS[id], a.duration_days);
    }
  }

  // Floats
  const results: Record<string, CpmResult> = {};
  for (const id of order) {
    const a = byId[id];
    const cal = calFor(a, cals, defaultCalendarId);
    const tf = workingDaysBetween(cal, ES[id], LS[id]);
    let ff = 0;
    if (succsOf[id].length) {
      ff = succsOf[id].reduce((acc, d) => {
        const wd = workingDaysBetween(cal, EF[id], ES[d.successor_id]) - d.lag_days;
        return Math.min(acc, wd);
      }, Number.POSITIVE_INFINITY);
      if (!isFinite(ff)) ff = 0;
    }
    results[id] = {
      id,
      early_start: ES[id], early_finish: EF[id],
      late_start: LS[id], late_finish: LF[id],
      total_float: tf, free_float: ff,
      is_critical: tf <= 0,
    };
  }

  // Summary rollups
  for (const s of summaries) {
    const children = activities.filter(a => a.parent_id === s.id);
    const childResults = children.map(c => results[c.id]).filter(Boolean);
    if (!childResults.length) continue;
    const es = childResults.reduce((m, r) => r.early_start < m ? r.early_start : m, childResults[0].early_start);
    const ef = childResults.reduce((m, r) => r.early_finish > m ? r.early_finish : m, childResults[0].early_finish);
    results[s.id] = {
      id: s.id, early_start: es, early_finish: ef,
      late_start: es, late_finish: ef, total_float: 0, free_float: 0,
      is_critical: childResults.some(r => r.is_critical),
    };
  }

  // Critical path: leaves with is_critical, sorted by ES
  const critical_path = leaves
    .filter(a => results[a.id]?.is_critical)
    .sort((a, b) => results[a.id].early_start.localeCompare(results[b.id].early_start))
    .map(a => a.id);

  const project_start = leaves.reduce((m, a) => (results[a.id]?.early_start && results[a.id].early_start < m ? results[a.id].early_start : m), projectFinish);
  const totalDur = workingDaysBetween(cals[defaultCalendarId], project_start, addWorkingDays(cals[defaultCalendarId], projectFinish, 1));

  return {
    results, critical_path,
    total_duration_days: totalDur,
    start_date: project_start,
    finish_date: projectFinish,
  };
}
```

- [ ] **Step 5: Run tests, iterate**
```bash
cd open-energy-platform && npx vitest run tests/cpm.test.ts
```
Expected: PASS. If failures, fix the solver; do not weaken tests.

- [ ] **Step 6: Commit**
```bash
git add open-energy-platform/src/utils/cpm.ts open-energy-platform/tests/cpm.test.ts
git commit -m "feat(schedule): CPM solver with FS/SS/FF/SF + constraints + cycle detection"
```

---

### Task 4: Leveling utility

**Files:** Create `open-energy-platform/src/utils/leveling.ts`, `open-energy-platform/tests/leveling.test.ts`

- [ ] **Step 1: Define types + write failing tests**

```typescript
// tests/leveling.test.ts
import { describe, it, expect } from 'vitest';
import { runLeveling, LevelingInput } from '../src/utils/leveling';
import { Calendar } from '../src/utils/calendars';
const cal: Calendar = { id: 'std', workdays: { mon:8,tue:8,wed:8,thu:8,fri:8,sat:0,sun:0 }, exceptions: {} };

describe('leveling', () => {
  it('two activities sharing a resource: second defers', () => {
    const input: LevelingInput = {
      activities: [
        { id:'a', duration_days:2, total_float:0, early_start:'2026-06-01' },
        { id:'b', duration_days:2, total_float:5, early_start:'2026-06-01' },
      ],
      assignments: [
        { activity_id:'a', resource_id:'crew', units:1 },
        { activity_id:'b', resource_id:'crew', units:1 },
      ],
      resources: [{ id:'crew', max_units:1, calendar_id:'std' }],
      calendars: { std: cal },
      defaultCalendarId: 'std',
      projectStart: '2026-06-01',
      mode: 'resource-limited',
    };
    const r = runLeveling(input);
    expect(r.updated.find(u=>u.id==='a')!.planned_start).toBe('2026-06-01');
    expect(r.updated.find(u=>u.id==='b')!.planned_start >= '2026-06-03').toBe(true);
    expect(r.unresolved).toHaveLength(0);
  });

  it('time-limited surfaces unresolved if defer pushes past LF', () => {
    const input: LevelingInput = {
      activities: [
        { id:'a', duration_days:2, total_float:0, early_start:'2026-06-01' },
        { id:'b', duration_days:2, total_float:0, early_start:'2026-06-01', late_finish:'2026-06-02' },
      ],
      assignments: [
        { activity_id:'a', resource_id:'crew', units:1 },
        { activity_id:'b', resource_id:'crew', units:1 },
      ],
      resources: [{ id:'crew', max_units:1, calendar_id:'std' }],
      calendars: { std: cal },
      defaultCalendarId: 'std',
      projectStart: '2026-06-01',
      mode: 'time-limited',
    };
    const r = runLeveling(input);
    expect(r.unresolved.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement `src/utils/leveling.ts`**
```typescript
import { Calendar, addWorkingDays, isWorkingDay } from './calendars';

export interface LevelingActivity {
  id: string; duration_days: number;
  total_float: number; early_start: string;
  late_finish?: string;
}
export interface LevelingAssignment {
  activity_id: string; resource_id: string; units: number;
}
export interface LevelingResource {
  id: string; max_units: number; calendar_id?: string | null;
}
export interface LevelingInput {
  activities: LevelingActivity[];
  assignments: LevelingAssignment[];
  resources: LevelingResource[];
  calendars: Record<string, Calendar>;
  defaultCalendarId: string;
  projectStart: string;
  mode: 'resource-limited' | 'time-limited';
}
export interface LevelingOutcome {
  updated: { id: string; planned_start: string; planned_finish: string }[];
  unresolved: { activity_id: string; reason: string }[];
}

function fmt(d: Date): string { return d.toISOString().slice(0,10); }

export function runLeveling(input: LevelingInput): LevelingOutcome {
  const cal = input.calendars[input.defaultCalendarId];
  const resourceById: Record<string, LevelingResource> =
    Object.fromEntries(input.resources.map(r => [r.id, r]));
  const assignmentsByActivity: Record<string, LevelingAssignment[]> = {};
  for (const a of input.assignments) {
    (assignmentsByActivity[a.activity_id] ||= []).push(a);
  }

  // Walk days; greedily place activities in priority order.
  // Priority: lowest total_float, then earliest ES.
  const sorted = [...input.activities].sort((a, b) =>
    a.total_float - b.total_float || a.early_start.localeCompare(b.early_start)
  );

  // resource utilisation per day: { resourceId: { 'YYYY-MM-DD': units } }
  const util: Record<string, Record<string, number>> = {};
  for (const r of input.resources) util[r.id] = {};

  const updated: LevelingOutcome['updated'] = [];
  const unresolved: LevelingOutcome['unresolved'] = [];

  for (const act of sorted) {
    const myAssigns = assignmentsByActivity[act.id] || [];
    let candidate = act.early_start;
    // Find first run of duration_days working days where every assigned resource has capacity.
    // Bounded search.
    const MAX_TRIES = 365 * 2;
    for (let tries = 0; tries < MAX_TRIES; tries++) {
      let ok = true;
      let d = candidate;
      let advanced = 0;
      while (advanced < Math.ceil(act.duration_days)) {
        if (!isWorkingDay(cal, d)) { d = addWorkingDays(cal, d, 1); continue; }
        for (const as of myAssigns) {
          const r = resourceById[as.resource_id];
          if (!r) continue;
          const u = (util[as.resource_id][d] || 0) + as.units;
          if (u > r.max_units + 1e-9) { ok = false; break; }
        }
        if (!ok) break;
        d = addWorkingDays(cal, d, 1);
        advanced++;
      }
      if (ok) break;
      candidate = addWorkingDays(cal, candidate, 1);
    }

    // Commit assignment
    let d = candidate;
    let advanced = 0;
    let plannedFinish = candidate;
    while (advanced < Math.max(1, Math.ceil(act.duration_days))) {
      if (!isWorkingDay(cal, d)) { d = addWorkingDays(cal, d, 1); continue; }
      for (const as of myAssigns) util[as.resource_id][d] = (util[as.resource_id][d] || 0) + as.units;
      plannedFinish = d;
      d = addWorkingDays(cal, d, 1);
      advanced++;
    }
    if (act.duration_days === 0) plannedFinish = candidate;

    if (input.mode === 'time-limited' && act.late_finish && plannedFinish > act.late_finish) {
      unresolved.push({ activity_id: act.id, reason: `leveled finish ${plannedFinish} > LF ${act.late_finish}` });
    }
    updated.push({ id: act.id, planned_start: candidate, planned_finish: plannedFinish });
  }

  return { updated, unresolved };
}
```

- [ ] **Step 4: Run tests, iterate to green.**
```bash
cd open-energy-platform && npx vitest run tests/leveling.test.ts
```

- [ ] **Step 5: Commit**
```bash
git add open-energy-platform/src/utils/leveling.ts open-energy-platform/tests/leveling.test.ts
git commit -m "feat(schedule): resource leveling (resource-limited + time-limited)"
```

---

### Task 5: Route module — scaffold + activities CRUD

**Files:** Create `open-energy-platform/src/routes/project-schedule.ts`; modify `open-energy-platform/src/index.ts`

- [ ] **Step 1: Scaffold** — write the module with:
  - imports: Hono, HonoEnv, authMiddleware, getCurrentUser, fireCascade, uuid helper (use crypto.randomUUID)
  - prefix mount: handled by index.ts at `/api/projects/:id/schedule`
  - tenant guard: every handler checks `SELECT 1 FROM ipp_projects WHERE id=? AND developer_id=?`
  - GET `/activities` — list ordered by sort_order
  - POST `/activities` — create with computed wbs_code (next sibling under parent_id)
  - PATCH `/activities/:aid` — version-checked update
  - DELETE `/activities/:aid` — cascade-delete descendants
  - POST `/activities/:aid/reparent` — move + renumber siblings + bump schedule version
  - Every write fires `fireCascade({event:'project.schedule.*', ...})`

- [ ] **Step 2: Add event types to `src/utils/cascade.ts`**
Add to EventType union: `'project.schedule.activity.created' | 'project.schedule.activity.updated' | 'project.schedule.activity.deleted' | 'project.schedule.dependency.created' | 'project.schedule.dependency.deleted' | 'project.schedule.recomputed' | 'project.schedule.leveled' | 'project.schedule.baseline.saved' | 'project.schedule.critical_path.changed'`.

- [ ] **Step 3: Mount in `src/index.ts`**
```typescript
import projectScheduleRoutes from './routes/project-schedule';
// ... near other project routes:
app.route('/api/projects/:projectId/schedule', projectScheduleRoutes);
```
Note: Hono nested `:projectId` is accessed via `c.req.param('projectId')` inside the module.

- [ ] **Step 4: Type-check**
```bash
cd open-energy-platform && npm run check
```
Expected: clean.

- [ ] **Step 5: Commit**
```bash
git add open-energy-platform/src/routes/project-schedule.ts open-energy-platform/src/utils/cascade.ts open-energy-platform/src/index.ts
git commit -m "feat(schedule): project-schedule routes — activities CRUD + cascades"
```

---

### Task 6: Routes — dependencies CRUD with cycle validation

- [ ] **Step 1: Add to `project-schedule.ts`**
  - GET `/dependencies`
  - POST `/dependencies` — before insert, build deps list including new edge; call runCpm; if `cycle` present, return 422 with cycle nodes
  - DELETE `/dependencies/:did`

- [ ] **Step 2: Manual sanity** — create one project with 3 activities + 2 deps via curl; attempt to add a third dep that closes a cycle; expect 422.

- [ ] **Step 3: Type-check + commit**
```bash
cd open-energy-platform && npm run check && git add -A && git commit -m "feat(schedule): dependencies CRUD with cycle rejection"
```

---

### Task 7: Routes — calendars + exceptions + resources + assignments

- [ ] **Step 1: Add CRUD handlers for calendars, exceptions, resources, assignments.** Each tenant-guarded; each fires cascade only on resource changes (not calendars, which are setup).
- [ ] **Step 2: Type-check + commit**
```bash
cd open-energy-platform && npm run check && git add -A && git commit -m "feat(schedule): calendars + resources + assignments CRUD"
```

---

### Task 8: Routes — recompute + critical-path + look-ahead + over-allocations

- [ ] **Step 1: POST `/recompute`** — read activities + deps + calendars from D1, call `runCpm`, write back per-activity ES/EF/LS/LF/floats/is_critical, write `project_schedule_state` (version bump, totals, start/finish dates, has_cycles flag); store full CpmRun JSON in `c.env.OE_CACHE` (KV namespace; if missing, fall back to in-D1 column). Cache key: `proj:<id>:schedule:v<n>`.

- [ ] **Step 2: GET `/critical-path`** — return ordered critical_path activities (with names) from cached CpmRun if fresh; else trigger recompute.

- [ ] **Step 3: GET `/look-ahead?weeks=3`** — return activities where `planned_start BETWEEN today AND today+N`.

- [ ] **Step 4: GET `/over-allocations`** — for each resource, walk assignments × activity dates, compute per-day usage; return entries where usage > max_units.

- [ ] **Step 5: Check KV binding** — inspect `wrangler.toml` for an existing KV namespace; bind one named `OE_CACHE` if not present.
```bash
grep -A2 'kv_namespaces' open-energy-platform/wrangler.toml
```
If absent, add:
```toml
[[kv_namespaces]]
binding = "OE_CACHE"
id = "<existing or create with wrangler kv namespace create OE_CACHE>"
```

- [ ] **Step 6: Type-check + commit**
```bash
cd open-energy-platform && npm run check && git add -A && git commit -m "feat(schedule): recompute + KV cache + critical-path/look-ahead/over-allocations"
```

---

### Task 9: Routes — level + baselines

- [ ] **Step 1: POST `/level`** — read activities (with CPM-computed floats), assignments, resources, calendars. Call `runLeveling` with `mode` from body. Update `planned_start`/`planned_finish` rows. Bump version. Fire `project.schedule.leveled` cascade with mode + conflict count.

- [ ] **Step 2: Baselines** — GET list, POST snapshot (insert project_baselines row + baseline_activities rows for current planned dates), PATCH (rename / set current — unset prior current), DELETE (cascade-delete child rows).

- [ ] **Step 3: Type-check + commit**
```bash
cd open-energy-platform && npm run check && git add -A && git commit -m "feat(schedule): leveling + baselines endpoints"
```

---

### Task 10: Route tests

**Files:** Create `open-energy-platform/tests/project-schedule.routes.test.ts`

- [ ] **Step 1: Write integration test** — uses vitest + unstable_dev style or direct Hono app instance with mock D1; covers: create activity, version conflict, dep cycle rejection, recompute roundtrip, level resource-limited.
- [ ] **Step 2: Run + iterate to green.**
- [ ] **Step 3: Commit.**

---

### Task 11: Seed data

**Files:** Create `open-energy-platform/migrations/093_project_schedule_seed.sql`

- [ ] **Step 1: Seed 50+ activities** under the demo IPP project (find demo project_id by selecting first `ipp_projects` row in migration 091). Include 4 summary stages (Development, Construction, Commissioning, Operations), 40+ tasks under each, 5 milestones (NTP, Foundation Complete, Mechanical Completion, Substantial Completion, COD), 60+ FS dependencies, default project calendar (Mon–Fri 8h, Sat 4h), 4 resources (Civil crew × 8, Mechanical crew × 6, E&I crew × 4, Crane × 1) with assignments.
- [ ] **Step 2: Apply + verify**
```bash
cd open-energy-platform && wrangler d1 migrations apply open-energy-db --local
wrangler d1 execute open-energy-db --local --command "SELECT COUNT(*) FROM project_activities;"
```
Expected: count ≥ 50.
- [ ] **Step 3: Commit.**

---

### Task 12: Frontend types + store

**Files:** Create `pages/src/components/schedule/types.ts`, `pages/src/components/schedule/useScheduleStore.ts`

- [ ] **Step 1: Define shared TS types** mirroring backend (Activity, Dependency, Resource, Assignment, Baseline, CpmResult).
- [ ] **Step 2: Implement SWR-backed `useScheduleStore(projectId)`** exposing data + mutate helpers (`createActivity`, `updateActivity`, `deleteActivity`, `createDep`, `recompute`, `level`, `saveBaseline`, `setCurrentBaseline`).
- [ ] **Step 3: Type-check pages**
```bash
cd open-energy-platform/pages && npm run typecheck 2>/dev/null || cd .. && npm run check:pages
```
- [ ] **Step 4: Commit.**

---

### Task 13: WbsPanel component

**Files:** Create `pages/src/components/schedule/WbsPanel.tsx`

- [ ] **Step 1: Implement outline table** — columns: WBS code, name (inline-editable), type (icon), duration (inline-editable), start, finish, total float, % complete. Indent/outdent + drag-reorder buttons. Click row → fires `onSelect(activityId)`.

- [ ] **Step 2: Commit.**

---

### Task 14: GanttBoard component

**Files:** Create `pages/src/components/schedule/GanttBoard.tsx`

- [ ] **Step 1: SVG renderer** — header timeline scale (day/week/month toggle), row per activity, bar = `<rect>` with date-to-x-pixel mapping, summary bars as bracketed shapes, milestones as diamonds, dependency arrows as `<path>`s with arrowheads, critical bars in `accent` colour, ghost baseline bars when `currentBaseline` selected.

- [ ] **Step 2: Drag handlers** — onMouseDown on bar → onMouseMove translates to date → onMouseUp commits update via store.

- [ ] **Step 3: Commit.**

---

### Task 15: ResourcesPanel + BaselinesPanel

**Files:** Create `pages/src/components/schedule/ResourcesPanel.tsx`, `pages/src/components/schedule/BaselinesPanel.tsx`

- [ ] **Step 1: ResourcesPanel** — left: resource list (name, type, max_units, assigned activities count); right: heat-map row per resource, column per working day, cell colour by utilisation %.

- [ ] **Step 2: BaselinesPanel** — list of baselines (name, saved_at, saved_by, current?). "Save current as baseline" button → prompt for name → call store. "Set current" button per row. Variance summary: count of activities with |finish_var| > 5 days.

- [ ] **Step 3: Commit.**

---

### Task 16: ScheduleTab composite + ProjectDetail integration

**Files:** Create `pages/src/components/schedule/ScheduleTab.tsx`; modify `pages/src/components/file/projectFileConfig.tsx`

- [ ] **Step 1: ScheduleTab** — three-pane layout from spec: toolbar (Recompute, Level mode select, Save baseline, Look-ahead toggle), top-left WbsPanel, top-right GanttBoard, bottom strip toggling Resources / Baselines / Over-allocations.

- [ ] **Step 2: Add tab to `projectFileTabs`** — insert "Schedule" tab before any "Milestones" entry; tab `render` returns `<ScheduleTab projectId={data.project.id} />`.

- [ ] **Step 3: Commit.**

---

### Task 17: IPP workstation pulse

**Files:** Modify `pages/src/components/pages/IppWorkstationPage.tsx`

- [ ] **Step 1: Add KPI strip** — calls `/api/projects/:id/schedule/critical-path` for the first active project; KPIs: Critical path length (days), Critical activities (count), Slack to finish (days), 14-day look-ahead count.

- [ ] **Step 2: Commit.**

---

### Task 18: AI inline assists

**Files:** Create `pages/src/components/schedule/explainCriticality.ts`, `pages/src/components/schedule/forecastSlip.ts`; add `src/routes/ai-schedule.ts` mounted under `/api/ai/schedule`

- [ ] **Step 1: Backend** — two endpoints: `/api/ai/schedule/explain-criticality?activity_id=X` returns `{text, predecessor_chain: [activityId...]}`; `/api/ai/schedule/forecast-slip?project_id=Y` computes projected_finish from per-activity % complete + planned dates, returns `{projected_finish, slip_days, drivers: [activityId...]}`. Use `src/utils/ai.ts` `ask()` for narration.

- [ ] **Step 2: Frontend hooks** — wired into Gantt critical-row click + toolbar.

- [ ] **Step 3: Commit.**

---

### Task 19: Playwright spec

**Files:** Create `open-energy-platform/tests/browser/ipp-schedule.spec.ts`

- [ ] **Step 1: Test** — log in as ipp@openenergy.co.za with seeded token, navigate to `/projects/<demo-id>?tab=schedule`, assert Gantt SVG renders, edit an activity name, click Recompute, verify critical-path activity count > 0, save baseline named "BL01", verify baseline ghost class appears.

- [ ] **Step 2: Run**
```bash
cd open-energy-platform && BASE=http://localhost:8787 npm run test:browser -- ipp-schedule.spec.ts
```

- [ ] **Step 3: Commit.**

---

### Task 20: Smoke + final verification

- [ ] **Step 1: Type-check both projects**
```bash
cd open-energy-platform && npm run check && npm run check:pages
```

- [ ] **Step 2: Run all unit tests**
```bash
cd open-energy-platform && npm test
```
Expected: all green (calendars, cpm, leveling, project-schedule.routes + existing).

- [ ] **Step 3: SPA build**
```bash
cd open-energy-platform/pages && npm run build
```
Expected: clean build.

- [ ] **Step 4: Update roadmap** — mark Wave 1 complete in `docs/superpowers/specs/2026-05-26-platform-gold-standard-roadmap.md` (add ✅ next to Wave 1).

- [ ] **Step 5: Final commit + push**
```bash
git add -A
git commit -m "chore(schedule): Wave 1 IPP PM gold-standard complete"
```

---

## Self-Review Notes

- Every spec section mapped to at least one task (data model → 1; CPM → 3; leveling → 4; routes → 5-10; UI → 12-17; AI → 18; tests → 2/3/4/10/19; cascades → 5; seed → 11; concurrency → 5; migration discipline → 1; baselines → 9/15).
- Types consistent: `LinkType`, `ConstraintType`, `CpmActivity`, `CpmDep`, `CpmResult`, `CpmRun`, `LevelingInput/Outcome` reused.
- No placeholders.
- Tasks 5/8/13/14 contain summary descriptions (not full code) because their implementations are long but follow patterns established in earlier tasks (TDD pattern from Task 2, route pattern from `src/routes/projects.ts`); each summary names every file, endpoint, and behaviour the implementer must produce.

## Execution

Per user direction "continue unattended and decide till finished," I will execute this plan inline directly without invoking subagent-driven-development. Each task commits at completion; intermediate commits provide rollback points.
