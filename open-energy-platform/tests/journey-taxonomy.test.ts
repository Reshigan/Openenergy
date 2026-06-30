// Journey taxonomy — the zero-orphan guarantee: every reachable domain for every
// role lands in a journey, so no tool is stranded outside the journey workspace.
import { describe, it, expect } from 'vitest';
import { getJourneys, journeyCoversAllDomains } from '../pages/src/meridian/journeys';

const ROLES = [
  'ipp_developer', 'esco', 'trader', 'lender', 'offtaker',
  'carbon_fund', 'grid_operator', 'regulator', 'support', 'admin',
];

describe('journey taxonomy', () => {
  for (const role of ROLES) {
    it(`${role}: every domain is covered by a journey (no orphans)`, () => {
      expect(journeyCoversAllDomains(role)).toBe(true);
    });
    it(`${role}: has journeys, each with a label + icon + a primary 'new X'`, () => {
      const { journeys, primaryEntity } = getJourneys(role);
      expect(journeys.length).toBeGreaterThan(0);
      for (const j of journeys) {
        expect(j.label.length).toBeGreaterThan(0);
        expect(j.icon.length).toBeGreaterThan(0);
      }
      expect(primaryEntity.label.length).toBeGreaterThan(0);
      expect(primaryEntity.verb.length).toBeGreaterThan(0);
    });
  }
});
