import { describe, it, expect } from 'vitest';
import { parseAccessToken } from '../src/routes/esums-sungrow-oauth';

// The one knob that breaks silently if iSolarCloud's response shape drifts.
describe('parseAccessToken', () => {
  it('reads the documented result_data shapes', () => {
    expect(parseAccessToken({ result_data: { access_token: 'a1' } })).toBe('a1');
    expect(parseAccessToken({ result_data: { token: 't2' } })).toBe('t2');
    expect(parseAccessToken({ result_data: { accessToken: 'c3' } })).toBe('c3');
  });
  it('returns null when no token field is present', () => {
    expect(parseAccessToken({ result_data: {} })).toBeNull();
    expect(parseAccessToken({})).toBeNull();
    expect(parseAccessToken(null)).toBeNull();
    expect(parseAccessToken({ result_data: { access_token: '' } })).toBeNull();
  });
});
