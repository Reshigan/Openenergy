import { describe, it, expect } from 'vitest';
import { runCpm, CpmActivity, CpmDep } from '../src/utils/cpm';
import { Calendar } from '../src/utils/calendars';

const cal: Calendar = {
  id: 'std',
  workdays: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
  exceptions: {},
};
const cals = { std: cal };

const A = (
  id: string, dur: number, parent?: string,
  type: 'task' | 'milestone' | 'summary' = 'task',
): CpmActivity => ({
  id,
  duration_days: dur,
  parent_id: parent ?? null,
  type,
  calendar_id: 'std',
  constraint_type: null,
  constraint_date: null,
});

const dep = (
  p: string, s: string,
  lt: 'FS' | 'SS' | 'FF' | 'SF' = 'FS',
  lag = 0,
): CpmDep => ({ predecessor_id: p, successor_id: s, link_type: lt, lag_days: lag });

describe('cpm', () => {
  it('linear chain — all critical', () => {
    // a (2d) Mon-Tue, b (3d) Wed-Fri, c (1d) next Mon → total = 6 working days
    const acts = [A('a', 2), A('b', 3), A('c', 1)];
    const deps = [dep('a', 'b'), dep('b', 'c')];
    const r = runCpm(acts, deps, cals, 'std', '2026-06-01'); // Mon
    expect(r.results.a.is_critical).toBe(true);
    expect(r.results.b.is_critical).toBe(true);
    expect(r.results.c.is_critical).toBe(true);
    expect(r.total_duration_days).toBe(6);
    expect(r.results.a.early_start).toBe('2026-06-01');
    expect(r.results.a.early_finish).toBe('2026-06-02');
    expect(r.results.b.early_start).toBe('2026-06-03');
    expect(r.results.b.early_finish).toBe('2026-06-05');
    expect(r.results.c.early_start).toBe('2026-06-08');
    expect(r.results.c.early_finish).toBe('2026-06-08');
  });

  it('diamond — short path has float', () => {
    const acts = [A('a', 1), A('b', 5), A('c', 1), A('d', 1)];
    const deps = [dep('a', 'b'), dep('a', 'c'), dep('b', 'd'), dep('c', 'd')];
    const r = runCpm(acts, deps, cals, 'std', '2026-06-01');
    expect(r.results.b.is_critical).toBe(true);
    expect(r.results.c.is_critical).toBe(false);
    expect(r.results.c.total_float).toBeGreaterThan(0);
    expect(r.results.d.is_critical).toBe(true);
  });

  it('FS lag of 2 working days', () => {
    // a (2d) Mon-Tue, b (2d) +2 lag → starts Fri, finishes next Mon
    const acts = [A('a', 2), A('b', 2)];
    const deps = [dep('a', 'b', 'FS', 2)];
    const r = runCpm(acts, deps, cals, 'std', '2026-06-01');
    expect(r.results.b.early_start).toBe('2026-06-05'); // Fri
    expect(r.results.b.early_finish).toBe('2026-06-08'); // next Mon
  });

  it('SS link starts together', () => {
    const acts = [A('a', 5), A('b', 2)];
    const deps = [dep('a', 'b', 'SS', 0)];
    const r = runCpm(acts, deps, cals, 'std', '2026-06-01');
    expect(r.results.b.early_start).toBe(r.results.a.early_start);
  });

  it('FF link finishes together', () => {
    const acts = [A('a', 5), A('b', 2)];
    const deps = [dep('a', 'b', 'FF', 0)];
    const r = runCpm(acts, deps, cals, 'std', '2026-06-01');
    expect(r.results.b.early_finish).toBe(r.results.a.early_finish);
  });

  it('milestone has zero duration', () => {
    const acts = [A('a', 3), A('m', 0, undefined, 'milestone'), A('b', 2)];
    const deps = [dep('a', 'm'), dep('m', 'b')];
    const r = runCpm(acts, deps, cals, 'std', '2026-06-01');
    expect(r.results.m.early_start).toBe(r.results.m.early_finish);
    expect(r.total_duration_days).toBe(5);
  });

  it('cycle detection', () => {
    const acts = [A('a', 1), A('b', 1)];
    const deps = [dep('a', 'b'), dep('b', 'a')];
    const r = runCpm(acts, deps, cals, 'std', '2026-06-01');
    expect(r.cycle).toBeDefined();
    expect(r.cycle!.length).toBeGreaterThan(0);
  });

  it('SNET constraint floors early start', () => {
    const acts = [
      A('a', 2),
      { ...A('b', 2), constraint_type: 'SNET' as const, constraint_date: '2026-06-15' },
    ];
    const deps = [dep('a', 'b')];
    const r = runCpm(acts, deps, cals, 'std', '2026-06-01');
    expect(r.results.b.early_start >= '2026-06-15').toBe(true);
  });

  it('weekend handling: Fri+1 = Mon', () => {
    const acts = [A('a', 1), A('b', 1)]; // a Fri, b Mon
    const deps = [dep('a', 'b')];
    const r = runCpm(acts, deps, cals, 'std', '2026-06-05'); // Fri
    expect(r.results.a.early_start).toBe('2026-06-05');
    expect(r.results.b.early_start).toBe('2026-06-08'); // Monday
  });

  it('summary rolls up children', () => {
    const acts = [
      A('S', 0, undefined, 'summary'),
      A('a', 2, 'S'),
      A('b', 3, 'S'),
    ];
    const deps = [dep('a', 'b')];
    const r = runCpm(acts, deps, cals, 'std', '2026-06-01');
    expect(r.results.S).toBeDefined();
    expect(r.results.S.early_start).toBe(r.results.a.early_start);
    expect(r.results.S.early_finish).toBe(r.results.b.early_finish);
  });
});
