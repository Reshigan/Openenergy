// cleanLabel display hygiene — build codes stripped, leaked snake_case keys humanized.
import { describe, it, expect } from 'vitest';
import { cleanLabel } from '../pages/src/meridian/labels';

describe('cleanLabel', () => {
  it('strips build-tracking codes', () => {
    expect(cleanLabel('Stage Gates (W131)')).toBe('Stage Gates');
    expect(cleanLabel('Settlement — W12 · W71')).toBe('Settlement');
  });
  it('humanizes leaked snake_case identifiers', () => {
    expect(cleanLabel('seed_proj_002')).toBe('Proj 002');
    expect(cleanLabel('in_progress')).toBe('In progress');
  });
  it('leaves human labels alone', () => {
    expect(cleanLabel('Karoo Wind 1')).toBe('Karoo Wind 1');
    expect(cleanLabel('Meter analysis')).toBe('Meter analysis');
  });
});
