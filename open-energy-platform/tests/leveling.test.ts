import { describe, it, expect } from 'vitest';
import { runLeveling, LevelingInput } from '../src/utils/leveling';
import { Calendar } from '../src/utils/calendars';

const cal: Calendar = {
  id: 'std',
  workdays: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
  exceptions: {},
};

describe('leveling', () => {
  it('two activities sharing a resource: second defers', () => {
    const input: LevelingInput = {
      activities: [
        { id: 'a', duration_days: 2, total_float: 0, early_start: '2026-06-01' },
        { id: 'b', duration_days: 2, total_float: 5, early_start: '2026-06-01' },
      ],
      assignments: [
        { activity_id: 'a', resource_id: 'crew', units: 1 },
        { activity_id: 'b', resource_id: 'crew', units: 1 },
      ],
      resources: [{ id: 'crew', max_units: 1, calendar_id: 'std' }],
      calendars: { std: cal },
      defaultCalendarId: 'std',
      projectStart: '2026-06-01',
      mode: 'resource-limited',
    };
    const r = runLeveling(input);
    const aOut = r.updated.find(u => u.id === 'a')!;
    const bOut = r.updated.find(u => u.id === 'b')!;
    expect(aOut.planned_start).toBe('2026-06-01');
    expect(bOut.planned_start >= '2026-06-03').toBe(true);
    expect(r.unresolved).toHaveLength(0);
  });

  it('time-limited surfaces unresolved when defer pushes past LF', () => {
    const input: LevelingInput = {
      activities: [
        { id: 'a', duration_days: 2, total_float: 0, early_start: '2026-06-01' },
        {
          id: 'b', duration_days: 2, total_float: 0,
          early_start: '2026-06-01', late_finish: '2026-06-02',
        },
      ],
      assignments: [
        { activity_id: 'a', resource_id: 'crew', units: 1 },
        { activity_id: 'b', resource_id: 'crew', units: 1 },
      ],
      resources: [{ id: 'crew', max_units: 1, calendar_id: 'std' }],
      calendars: { std: cal },
      defaultCalendarId: 'std',
      projectStart: '2026-06-01',
      mode: 'time-limited',
    };
    const r = runLeveling(input);
    expect(r.unresolved.length).toBeGreaterThan(0);
    expect(r.unresolved[0].activity_id).toBe('b');
  });

  it('half-time assignments do not over-allocate', () => {
    const input: LevelingInput = {
      activities: [
        { id: 'a', duration_days: 2, total_float: 0, early_start: '2026-06-01' },
        { id: 'b', duration_days: 2, total_float: 0, early_start: '2026-06-01' },
      ],
      assignments: [
        { activity_id: 'a', resource_id: 'crew', units: 0.5 },
        { activity_id: 'b', resource_id: 'crew', units: 0.5 },
      ],
      resources: [{ id: 'crew', max_units: 1, calendar_id: 'std' }],
      calendars: { std: cal },
      defaultCalendarId: 'std',
      projectStart: '2026-06-01',
      mode: 'resource-limited',
    };
    const r = runLeveling(input);
    // Both can run concurrently
    const aOut = r.updated.find(u => u.id === 'a')!;
    const bOut = r.updated.find(u => u.id === 'b')!;
    expect(aOut.planned_start).toBe('2026-06-01');
    expect(bOut.planned_start).toBe('2026-06-01');
  });
});
