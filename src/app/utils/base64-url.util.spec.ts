import { base64UrlDecode, base64UrlEncode } from './base64-url.util';

describe('base64UrlEncode / base64UrlDecode', () => {
  it('round-trips a family code', () => {
    const code = 'FUN1234A';
    expect(base64UrlDecode(base64UrlEncode(code))).toBe(code);
  });

  it('does not surface a plain, human-readable code', () => {
    expect(base64UrlEncode('FUN1234A')).not.toBe('FUN1234A');
  });

  it('produces no +, / or = characters, so it drops straight into a route segment', () => {
    // 'A?' style inputs aren't real family codes, but the encoding must be URL-safe regardless.
    for (const input of ['FUN1234A', 'WED9999Z', 'AAAAAAAA', '00000000']) {
      const encoded = base64UrlEncode(input);
      expect(encoded).not.toMatch(/[+/=]/);
    }
  });

  it('returns null for malformed input instead of throwing', () => {
    expect(base64UrlDecode('not valid base64url!!!')).toBeNull();
  });
});
