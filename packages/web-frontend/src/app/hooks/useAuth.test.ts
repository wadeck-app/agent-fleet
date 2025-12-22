/**
 * Basic smoke test for useAuth hook
 * Full integration tests are in app/integration/auth-integration.test.tsx
 */
import { useAuth } from './useAuth';

describe('useAuth', () => {
  it('should be defined', () => {
    expect(useAuth).toBeDefined();
    expect(typeof useAuth).toBe('function');
  });
});
