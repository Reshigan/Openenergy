// Pure-core tests for REC exchange trading (instrument model, sell guard, settlement).
import { describe, it, expect } from 'vitest';
import {
  recInstrument, isRecInstrument, parseRecInstrument,
  recSellGuard, settleRecFill, planCertTransfer,
} from '../src/utils/rec-trading';

describe('REC instrument codes', () => {
  it('encodes standard/source/vintage into a rec: code', () => {
    expect(recInstrument({ standard: 'I-REC', source: 'Solar', vintage: '2026' })).toBe('rec:i-rec:solar:2026');
  });
  it('normalises punctuation and blanks to "any"', () => {
    expect(recInstrument({ standard: 'Gold Standard', source: '', vintage: '' })).toBe('rec:gold-standard:any:any');
  });
  it('detects REC vs power instruments', () => {
    expect(isRecInstrument('rec:verra:wind:2025')).toBe(true);
    expect(isRecInstrument('solar_pv')).toBe(false);
    expect(isRecInstrument(null)).toBe(false);
  });
  it('round-trips parse', () => {
    expect(parseRecInstrument('rec:verra:wind:2025')).toEqual({ standard: 'verra', source: 'wind', vintage: '2025' });
    expect(parseRecInstrument('baseload')).toBeNull();
  });
});

describe('recSellGuard — holdings-backed sells', () => {
  it('passes when free holdings cover the order', () => {
    expect(recSellGuard({ volumeMwh: 100, heldMwh: 500, alreadyListedMwh: 100 })).toEqual({ ok: true });
  });
  it('rejects when free holdings (held minus already listed) are short', () => {
    const r = recSellGuard({ volumeMwh: 300, heldMwh: 500, alreadyListedMwh: 300 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REC_INSUFFICIENT_HOLDINGS');
  });
  it('rejects non-positive volume', () => {
    const r = recSellGuard({ volumeMwh: 0, heldMwh: 500, alreadyListedMwh: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REC_INVALID_VOLUME');
  });
  it('allows selling the exact free balance (float-tolerant)', () => {
    expect(recSellGuard({ volumeMwh: 250, heldMwh: 250, alreadyListedMwh: 0 }).ok).toBe(true);
  });
});

describe('planCertTransfer — whole-certificate, fail-closed', () => {
  const certs = [{ id: 'c1', mwh: 100 }, { id: 'c2', mwh: 100 }, { id: 'c3', mwh: 50 }];
  it('takes whole certs FIFO up to the fill volume', () => {
    expect(planCertTransfer(certs, 200)).toEqual({ transferIds: ['c1', 'c2'], transferredMwh: 200, shortfallMwh: 0 });
  });
  it('never splits a certificate — leaves a shortfall the caller must settle out-of-band', () => {
    // Two 100-MWh certs, 150 requested: c1 fits (100); c2 would overshoot and no
    // smaller cert exists → only c1 transfers, 50 MWh shortfall (never split c2).
    expect(planCertTransfer([{ id: 'c1', mwh: 100 }, { id: 'c2', mwh: 100 }], 150))
      .toEqual({ transferIds: ['c1'], transferredMwh: 100, shortfallMwh: 50 });
  });
  it('covers exactly when certs align (100+50 skips nothing wrong)', () => {
    expect(planCertTransfer([{ id: 'a', mwh: 100 }, { id: 'b', mwh: 50 }], 150)).toEqual({ transferIds: ['a', 'b'], transferredMwh: 150, shortfallMwh: 0 });
  });
  it('transfers nothing (full shortfall) when the smallest cert overshoots', () => {
    expect(planCertTransfer([{ id: 'big', mwh: 500 }], 100)).toEqual({ transferIds: [], transferredMwh: 0, shortfallMwh: 100 });
  });
});

describe('settleRecFill — transfer intent', () => {
  it('transfers to the buyer and prices the trade', () => {
    const s = settleRecFill({ sellerId: 's1', buyerId: 'b1', volumeMwh: 120, priceZarPerMwh: 85 });
    expect(s).toEqual({ toStatus: 'transferred', newHolderId: 'b1', mwh: 120, valueZar: 120 * 85, cascadeEvent: 'rec.transferred' });
  });
  it('throws on a self-trade', () => {
    expect(() => settleRecFill({ sellerId: 'x', buyerId: 'x', volumeMwh: 10, priceZarPerMwh: 50 })).toThrow();
  });
  it('throws on zero/negative volume', () => {
    expect(() => settleRecFill({ sellerId: 's', buyerId: 'b', volumeMwh: 0, priceZarPerMwh: 50 })).toThrow();
  });
});
