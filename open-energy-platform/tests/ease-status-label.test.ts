// Unit tests for the Ease Kit statusLabel primitive (pure, no axios).
import { describe, it, expect } from 'vitest';
import {
  statusLabel,
  statusTone,
  statusChipClass,
  STATUS_TONE_CLASS,
  __demo,
} from '../pages/src/meridian/ease/statusLabel';

describe('statusLabel', () => {
  it('passes its own self-check demo', () => {
    expect(__demo()).toBe(true);
  });

  it('curated phrasing reads plain, not raw snake', () => {
    expect(statusLabel('held_for_review').text).toBe('Waiting on review');
    expect(statusLabel('pending_approval').text).toBe('Awaiting approval');
    expect(statusLabel('in_om').text).toBe('In O&M');
  });

  it('generic fallback sentence-cases unknown states (never SHOUTS)', () => {
    expect(statusLabel('awaiting_counterparty_signature').text).toBe('Awaiting counterparty signature');
    expect(statusLabel('FORCED_LIQUIDATION').text).toBe('Forced liquidation');
  });

  it('preserves known acronyms uppercase', () => {
    expect(statusLabel('cod_achieved').text).toBe('COD achieved');
    expect(statusLabel('ppa_signed').text).toBe('PPA signed');
    expect(statusLabel('mrv_submitted').text).toBe('MRV submitted');
  });

  it('derives tone from semantic stem', () => {
    expect(statusTone('loan_default')).toBe('oxide');
    expect(statusTone('payment_overdue')).toBe('oxide');
    expect(statusTone('settled')).toBe('good');
    expect(statusTone('certified')).toBe('good');
    expect(statusTone('pending_review')).toBe('warn');
    expect(statusTone('some_unknown_state')).toBe('neutral');
  });

  it('maps tone to a chip className', () => {
    expect(statusChipClass('sla_breached')).toBe(STATUS_TONE_CLASS.oxide);
    expect(statusChipClass('settled')).toBe(STATUS_TONE_CLASS.good);
    expect(statusChipClass('')).toBe('chip');
  });

  it('handles empty / null / undefined', () => {
    expect(statusLabel('').text).toBe('—');
    expect(statusLabel(null).text).toBe('—');
    expect(statusLabel(undefined).text).toBe('—');
  });

  it('normalises spaces and hyphens to the snake key', () => {
    expect(statusLabel('held for review').text).toBe('Waiting on review');
    expect(statusLabel('held-for-review').text).toBe('Waiting on review');
  });
});
