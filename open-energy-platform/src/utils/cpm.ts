// ═══════════════════════════════════════════════════════════════════════════
// Critical Path Method solver — P6/Primavera-style forward + backward pass.
//
// Activities are nodes; dependencies are directed edges with link type
// (FS|SS|FF|SF) and a lag (signed working days). All date arithmetic flows
// through calendars.ts so weekends/holidays/half-days are respected. Summary
// activities are rolled up after leaves are solved (their ES/EF span their
// children).
//
// Output per activity: ES, EF, LS, LF, total float, free float, is_critical.
// Plus: ordered critical path, project total duration, start/finish, and a
// cycle witness if the graph isn't a DAG.
// ═══════════════════════════════════════════════════════════════════════════

import {
  Calendar, addWorkingDays, workingDaysBetween,
} from './calendars';

export type LinkType = 'FS' | 'SS' | 'FF' | 'SF';
export type ConstraintType = 'ASAP' | 'SNET' | 'FNLT' | 'MSO' | 'MFO';
export type ActivityType = 'summary' | 'task' | 'milestone';

export interface CpmActivity {
  id: string;
  parent_id?: string | null;
  type: ActivityType;
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
  critical_path: string[];
  total_duration_days: number;
  start_date: string;
  finish_date: string;
  cycle?: string[];
}

function calFor(a: CpmActivity, cals: Record<string, Calendar>, def: string): Calendar {
  return cals[a.calendar_id || def] || cals[def];
}

// finish = start + (duration-1) working days; the last working day of the task.
function finishFromStart(cal: Calendar, start: string, days: number): string {
  if (days <= 0) return start;
  return addWorkingDays(cal, start, days - 1);
}

// start = finish - (duration-1) working days
function startFromFinish(cal: Calendar, finish: string, days: number): string {
  if (days <= 0) return finish;
  return addWorkingDays(cal, finish, -(days - 1));
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
  projectStart: string,
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

  const ES: Record<string, string> = {};
  const EF: Record<string, string> = {};

  // ── Forward pass ─────────────────────────────────────────────────────────
  for (const id of order) {
    const a = byId[id];
    const cal = calFor(a, cals, defaultCalendarId);

    let es = projectStart;
    for (const d of predsOf[id]) {
      const p = byId[d.predecessor_id];
      const pCal = calFor(p, cals, defaultCalendarId);
      let candidate: string;
      // P6 convention: FS link adds one working day from predecessor's last working day
      // to successor's first working day, EXCEPT when successor is a milestone (instantaneous
      // event aligned to predecessor's finish point — no day-of-week gap).
      const fsOffset = a.type === 'milestone' ? d.lag_days : 1 + d.lag_days;
      switch (d.link_type) {
        case 'FS':
          candidate = addWorkingDays(pCal, EF[p.id], fsOffset);
          break;
        case 'SS':
          candidate = addWorkingDays(pCal, ES[p.id], d.lag_days);
          break;
        case 'FF': {
          const sucFinish = addWorkingDays(pCal, EF[p.id], d.lag_days);
          candidate = startFromFinish(cal, sucFinish, a.duration_days);
          break;
        }
        case 'SF': {
          const sucFinish = addWorkingDays(pCal, ES[p.id], d.lag_days);
          candidate = startFromFinish(cal, sucFinish, a.duration_days);
          break;
        }
      }
      if (candidate > es) es = candidate;
    }

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

  // ── Backward pass ─────────────────────────────────────────────────────────
  const LS: Record<string, string> = {};
  const LF: Record<string, string> = {};
  for (const id of [...order].reverse()) {
    const a = byId[id];
    const cal = calFor(a, cals, defaultCalendarId);

    let lf = projectFinish;
    if (succsOf[id].length) {
      lf = succsOf[id].reduce((acc, d) => {
        const s = byId[d.successor_id];
        const sCal = calFor(s, cals, defaultCalendarId);
        // Symmetric to forward pass: FS gap is zero when the SUCCESSOR is a milestone.
        const fsBackOffset = s.type === 'milestone' ? -d.lag_days : -1 - d.lag_days;
        let candidate: string;
        switch (d.link_type) {
          case 'FS':
            candidate = addWorkingDays(sCal, LS[s.id], fsBackOffset);
            break;
          case 'FF':
            candidate = addWorkingDays(sCal, LF[s.id], -d.lag_days);
            break;
          case 'SS': {
            const myLs = addWorkingDays(sCal, LS[s.id], -d.lag_days);
            candidate = finishFromStart(cal, myLs, a.duration_days);
            break;
          }
          case 'SF': {
            const myLs = addWorkingDays(sCal, LF[s.id], -d.lag_days);
            candidate = finishFromStart(cal, myLs, a.duration_days);
            break;
          }
        }
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

  // ── Floats ────────────────────────────────────────────────────────────────
  const results: Record<string, CpmResult> = {};
  for (const id of order) {
    const a = byId[id];
    const cal = calFor(a, cals, defaultCalendarId);

    let tf = 0;
    if (LS[id] >= ES[id]) tf = workingDaysBetween(cal, ES[id], LS[id]);
    else tf = -workingDaysBetween(cal, LS[id], ES[id]);

    let ff = 0;
    if (succsOf[id].length) {
      ff = succsOf[id].reduce((acc, d) => {
        const sucES = ES[d.successor_id];
        let avail = 0;
        switch (d.link_type) {
          case 'FS':
            avail = workingDaysBetween(cal, EF[id], sucES) - 1 - d.lag_days;
            break;
          case 'SS':
            avail = workingDaysBetween(cal, ES[id], sucES) - d.lag_days;
            break;
          case 'FF':
            avail = workingDaysBetween(cal, EF[id], EF[d.successor_id]) - d.lag_days;
            break;
          case 'SF':
            avail = workingDaysBetween(cal, ES[id], EF[d.successor_id]) - d.lag_days;
            break;
        }
        return Math.min(acc, Math.max(0, avail));
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

  // ── Summary rollups ───────────────────────────────────────────────────────
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

  // ── Critical path ─────────────────────────────────────────────────────────
  const critical_path = leaves
    .filter(a => results[a.id]?.is_critical)
    .sort((a, b) => results[a.id].early_start.localeCompare(results[b.id].early_start))
    .map(a => a.id);

  const cal0 = cals[defaultCalendarId];
  const startCandidates = leaves
    .map(a => results[a.id]?.early_start)
    .filter((v): v is string => Boolean(v));
  const project_start = startCandidates.length
    ? startCandidates.reduce((m, v) => v < m ? v : m, startCandidates[0])
    : projectStart;

  // total_duration_days = working days in [project_start, projectFinish + 1) (inclusive of finish)
  const totalDur = workingDaysBetween(cal0, project_start, addWorkingDays(cal0, projectFinish, 1));

  return {
    results, critical_path,
    total_duration_days: totalDur,
    start_date: project_start,
    finish_date: projectFinish,
  };
}
