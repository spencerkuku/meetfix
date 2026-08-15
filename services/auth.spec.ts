import { describe, it, expect, afterEach } from 'vitest';
import { getToken, setToken, clearToken } from './auth';

// Deliberately exercises the real localStorage (no mock) — this is the
// regression check for NODE_OPTIONS=--no-experimental-webstorage in
// package.json's `test` script; see vitest.config.ts's comment.
describe('token storage', () => {
  afterEach(clearToken);

  it('returns null when no token has been set', () => {
    expect(getToken()).toBeNull();
  });

  it('returns the token after setToken', () => {
    setToken('abc123');
    expect(getToken()).toBe('abc123');
  });

  it('returns null after clearToken', () => {
    setToken('abc123');
    clearToken();
    expect(getToken()).toBeNull();
  });
});
