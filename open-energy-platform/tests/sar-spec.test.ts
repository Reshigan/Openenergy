import { describe, it, expect } from 'vitest';
import {
  canAssignSar,
  canRespondSar,
  SAR_ASSIGNABLE_STATUSES,
  SAR_RESPONDABLE_STATUSES,
  type SarStatus,
} from '../src/utils/sar-spec';

const ALL: SarStatus[] = ['open', 'acknowledged', 'in_progress', 'fulfilled', 'rejected', 'escalated'];

describe('sar-spec', () => {
  describe('canAssignSar', () => {
    it.each(['open', 'acknowledged', 'in_progress', 'escalated'] as SarStatus[])(
      'allows assign from %s', (from) => {
        expect(canAssignSar(from)).toEqual({ ok: true });
      },
    );

    it.each(['fulfilled', 'rejected'] as SarStatus[])(
      'blocks assign from terminal %s', (from) => {
        expect(canAssignSar(from)).toEqual({ ok: false, reason_code: 'SAR_INVALID_TRANSITION' });
      },
    );

    it('blocks unknown status', () => {
      expect(canAssignSar('bogus' as SarStatus).ok).toBe(false);
    });
  });

  describe('canRespondSar', () => {
    it.each(['open', 'acknowledged', 'in_progress', 'escalated'] as SarStatus[])(
      'allows respond from %s', (from) => {
        expect(canRespondSar(from)).toEqual({ ok: true });
      },
    );

    it.each(['fulfilled', 'rejected'] as SarStatus[])(
      'blocks re-respond from terminal %s', (from) => {
        expect(canRespondSar(from)).toEqual({ ok: false, reason_code: 'SAR_INVALID_TRANSITION' });
      },
    );
  });

  it('status sets cover all non-terminal statuses and nothing else', () => {
    const terminal = ALL.filter(
      (s) => !SAR_ASSIGNABLE_STATUSES.includes(s) && !SAR_RESPONDABLE_STATUSES.includes(s),
    );
    expect(terminal.sort()).toEqual(['fulfilled', 'rejected']);
  });
});
