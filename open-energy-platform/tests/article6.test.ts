// Unit tests for src/utils/article6.ts — pure functions covering registry
// URI computation, track classification, double-counting risk assessment,
// and lifecycle transitions.

import { describe, it, expect } from 'vitest';
import {
  computeRegistryUri,
  classifyArticle6Track,
  assessDoubleCountingRisk,
  nextArticle6Status,
  CountryRouting,
} from '../src/utils/article6';

const ZAF: CountryRouting = {
  country_iso: 'ZAF', country_name: 'South Africa',
  article_6_track: '6.2',
  registry_url_pattern: 'https://reg.za/{registry}/{proj}/{year}/{serial}',
  active: 1,
};
const CHE: CountryRouting = {
  country_iso: 'CHE', country_name: 'Switzerland',
  article_6_track: '6.2',
  registry_url_pattern: null,
  active: 1,
};
const USA: CountryRouting = {
  country_iso: 'USA', country_name: 'United States',
  article_6_track: 'paris_only',
  registry_url_pattern: null,
  active: 1,
};
const SGP: CountryRouting = {
  country_iso: 'SGP', country_name: 'Singapore',
  article_6_track: '6.4',
  registry_url_pattern: null,
  active: 1,
};

describe('computeRegistryUri', () => {
  it('substitutes registry/project/year/serial placeholders', () => {
    const uri = computeRegistryUri(ZAF, 'verra', 'PRJ-001', 2024, 'VCS-A-1-9');
    expect(uri).toBe('https://reg.za/verra/PRJ-001/2024/VCS-A-1-9');
  });

  it('URL-encodes special chars in serial range', () => {
    const uri = computeRegistryUri(ZAF, 'verra', 'PRJ-001', 2024, 'VCS A/1+9');
    expect(uri).toContain(encodeURIComponent('VCS A/1+9'));
  });

  it('falls back to internal audit URI when no pattern set', () => {
    const uri = computeRegistryUri(CHE, 'gold_standard', 'p', 2024, 's-1');
    expect(uri).toContain('oe.vantax.co.za/audit/serial/gold_standard/s-1');
  });

  it('falls back when routing is null', () => {
    const uri = computeRegistryUri(null, 'verra', 'p', 2024, 's-1');
    expect(uri).toContain('oe.vantax.co.za/audit/serial/verra/s-1');
  });
});

describe('classifyArticle6Track', () => {
  it('CDM credits go through 6.4 regardless of host/beneficiary', () => {
    expect(classifyArticle6Track(ZAF, CHE, 'cdm')).toBe('6.4');
  });

  it('both sides on 6.2 → 6.2 cooperative approach', () => {
    expect(classifyArticle6Track(ZAF, CHE, 'verra')).toBe('6.2');
  });

  it('either side on 6.4 → 6.4', () => {
    expect(classifyArticle6Track(ZAF, SGP, 'verra')).toBe('6.4');
    expect(classifyArticle6Track(SGP, ZAF, 'verra')).toBe('6.4');
  });

  it('same-country retirement → voluntary_oc (no CA required)', () => {
    expect(classifyArticle6Track(ZAF, ZAF, 'verra')).toBe('voluntary_oc');
  });

  it('voluntary registry with no 6.x alignment → voluntary_oc', () => {
    expect(classifyArticle6Track(ZAF, USA, 'verra')).toBe('voluntary_oc');
    expect(classifyArticle6Track(ZAF, USA, 'gold_standard')).toBe('voluntary_oc');
  });

  it('paris-only beneficiary with non-voluntary registry → paris_only', () => {
    // Synthetic case: a non-mainstream registry like 'sa_redd' with paris-only beneficiary.
    expect(classifyArticle6Track(ZAF, USA, 'sa_redd')).toBe('paris_only');
  });
});

describe('assessDoubleCountingRisk', () => {
  it('blocked status is always high risk', () => {
    const r = assessDoubleCountingRisk({
      host_iso: 'ZAF', beneficiary_iso: 'CHE', article_6_track: '6.2', ca_status: 'blocked',
    });
    expect(r.risk).toBe('high');
  });

  it('unfccc_ledger cross-border is low risk', () => {
    const r = assessDoubleCountingRisk({
      host_iso: 'ZAF', beneficiary_iso: 'CHE', article_6_track: '6.2', ca_status: 'unfccc_ledger',
    });
    expect(r.risk).toBe('low');
  });

  it('dffe_cleared cross-border is medium risk', () => {
    const r = assessDoubleCountingRisk({
      host_iso: 'ZAF', beneficiary_iso: 'CHE', article_6_track: '6.2', ca_status: 'dffe_cleared',
    });
    expect(r.risk).toBe('medium');
  });

  it('dffe_pending cross-border is high risk', () => {
    const r = assessDoubleCountingRisk({
      host_iso: 'ZAF', beneficiary_iso: 'CHE', article_6_track: '6.2', ca_status: 'dffe_pending',
    });
    expect(r.risk).toBe('high');
  });

  it('draft cross-border with no CA submitted is high risk', () => {
    const r = assessDoubleCountingRisk({
      host_iso: 'ZAF', beneficiary_iso: 'CHE', article_6_track: '6.2', ca_status: 'draft',
    });
    expect(r.risk).toBe('high');
  });

  it('domestic retirement is always low risk', () => {
    const r = assessDoubleCountingRisk({
      host_iso: 'ZAF', beneficiary_iso: 'ZAF', article_6_track: 'voluntary_oc', ca_status: 'draft',
    });
    expect(r.risk).toBe('low');
  });

  it('voluntary_oc cross-border elevates low to medium', () => {
    const r = assessDoubleCountingRisk({
      host_iso: 'ZAF', beneficiary_iso: 'CHE', article_6_track: 'voluntary_oc', ca_status: 'unfccc_ledger',
    });
    expect(r.risk).toBe('medium');
    expect(r.reasons.some((x) => x.includes('Voluntary'))).toBe(true);
  });

  it('paris_only cross-border is always high', () => {
    const r = assessDoubleCountingRisk({
      host_iso: 'ZAF', beneficiary_iso: 'USA', article_6_track: 'paris_only', ca_status: 'unfccc_ledger',
    });
    expect(r.risk).toBe('high');
  });
});

describe('nextArticle6Status', () => {
  it('submit_dffe advances draft → dffe_pending', () => {
    expect(nextArticle6Status('draft', 'submit_dffe')).toBe('dffe_pending');
  });

  it('clear_dffe advances dffe_pending → dffe_cleared', () => {
    expect(nextArticle6Status('dffe_pending', 'clear_dffe')).toBe('dffe_cleared');
  });

  it('post_unfccc advances dffe_cleared → unfccc_ledger', () => {
    expect(nextArticle6Status('dffe_cleared', 'post_unfccc')).toBe('unfccc_ledger');
  });

  it('block from any non-blocked state', () => {
    expect(nextArticle6Status('draft', 'block')).toBe('blocked');
    expect(nextArticle6Status('dffe_pending', 'block')).toBe('blocked');
    expect(nextArticle6Status('unfccc_ledger', 'block')).toBe('blocked');
  });

  it('unblock from blocked → draft', () => {
    expect(nextArticle6Status('blocked', 'unblock')).toBe('draft');
  });

  it('invalid transitions return null', () => {
    expect(nextArticle6Status('draft', 'clear_dffe')).toBeNull();
    expect(nextArticle6Status('draft', 'post_unfccc')).toBeNull();
    expect(nextArticle6Status('dffe_pending', 'post_unfccc')).toBeNull();
    expect(nextArticle6Status('unfccc_ledger', 'submit_dffe')).toBeNull();
  });

  it('cannot transition out of blocked except via unblock', () => {
    expect(nextArticle6Status('blocked', 'submit_dffe')).toBeNull();
    expect(nextArticle6Status('blocked', 'clear_dffe')).toBeNull();
    expect(nextArticle6Status('blocked', 'post_unfccc')).toBeNull();
  });
});
