// ═══════════════════════════════════════════════════════════════════════════
// Resource leveling — priority-based heuristic (serial method).
//
// Inputs: activities (with CPM ES/LF/total_float), assignments to resources,
// resource max_units, calendars, mode. Output: shifted planned_start/finish
// per activity that respects resource caps, plus an "unresolved" list when
// time-limited mode can't avoid pushing past LF.
// ═══════════════════════════════════════════════════════════════════════════

import { Calendar, addWorkingDays, isWorkingDay } from './calendars';

export interface LevelingActivity {
  id: string;
  duration_days: number;
  total_float: number;
  early_start: string;
  late_finish?: string;
}

export interface LevelingAssignment {
  activity_id: string;
  resource_id: string;
  units: number;
}

export interface LevelingResource {
  id: string;
  max_units: number;
  calendar_id?: string | null;
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
  updated: Array<{ id: string; planned_start: string; planned_finish: string }>;
  unresolved: Array<{ activity_id: string; reason: string }>;
}

export function runLeveling(input: LevelingInput): LevelingOutcome {
  const cal = input.calendars[input.defaultCalendarId];
  const resourceById: Record<string, LevelingResource> =
    Object.fromEntries(input.resources.map(r => [r.id, r]));
  const assignmentsByActivity: Record<string, LevelingAssignment[]> = {};
  for (const a of input.assignments) {
    (assignmentsByActivity[a.activity_id] ||= []).push(a);
  }

  // Priority: lowest total_float first (critical defers last); then earliest ES.
  const sorted = [...input.activities].sort((a, b) =>
    a.total_float - b.total_float || a.early_start.localeCompare(b.early_start),
  );

  // Per-resource per-day cumulative usage.
  const util: Record<string, Record<string, number>> = {};
  for (const r of input.resources) util[r.id] = {};

  const updated: LevelingOutcome['updated'] = [];
  const unresolved: LevelingOutcome['unresolved'] = [];

  const MAX_DEFER_TRIES = 365 * 3;

  for (const act of sorted) {
    const myAssigns = assignmentsByActivity[act.id] || [];

    // Find earliest start where all assigned resources have capacity for the
    // full duration window.
    let candidate = act.early_start;
    for (let tries = 0; tries < MAX_DEFER_TRIES; tries++) {
      // Simulate placing the activity starting at `candidate`.
      const occupancy: Array<{ date: string; resourceId: string; units: number }> = [];
      let d = candidate;
      let workingDaysPlaced = 0;
      const duration = Math.max(1, Math.ceil(act.duration_days));
      let conflict = false;

      while (workingDaysPlaced < duration) {
        if (!isWorkingDay(cal, d)) { d = addWorkingDays(cal, d, 1); continue; }
        for (const as of myAssigns) {
          const r = resourceById[as.resource_id];
          if (!r) continue;
          const current = util[as.resource_id][d] || 0;
          if (current + as.units > r.max_units + 1e-9) { conflict = true; break; }
        }
        if (conflict) break;
        for (const as of myAssigns) {
          occupancy.push({ date: d, resourceId: as.resource_id, units: as.units });
        }
        d = addWorkingDays(cal, d, 1);
        workingDaysPlaced++;
      }

      if (!conflict) {
        // Commit
        let plannedFinish = candidate;
        for (const o of occupancy) {
          util[o.resourceId][o.date] = (util[o.resourceId][o.date] || 0) + o.units;
          if (o.date > plannedFinish) plannedFinish = o.date;
        }
        if (act.duration_days === 0) plannedFinish = candidate;

        if (input.mode === 'time-limited' && act.late_finish && plannedFinish > act.late_finish) {
          unresolved.push({
            activity_id: act.id,
            reason: `leveled finish ${plannedFinish} exceeds LF ${act.late_finish}`,
          });
        }

        updated.push({ id: act.id, planned_start: candidate, planned_finish: plannedFinish });
        break;
      }

      candidate = addWorkingDays(cal, candidate, 1);

      if (tries === MAX_DEFER_TRIES - 1) {
        unresolved.push({
          activity_id: act.id,
          reason: `could not place within ${MAX_DEFER_TRIES} working days`,
        });
        updated.push({
          id: act.id,
          planned_start: act.early_start,
          planned_finish: act.early_start,
        });
      }
    }
  }

  return { updated, unresolved };
}
