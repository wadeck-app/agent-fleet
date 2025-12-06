// @ts-nocheck - Example code, not compiled
// Test Structure Pattern
// Demonstrates proper test organization with describe blocks

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    service = new UserService();
  });

  describe('createUser', () => {
    it('should create user with valid data', async () => {
      const result = await service.createUser({
        email: 'test@example.com',
        name: 'Test User'
      });

      expect(result).toMatchObject({
        email: 'test@example.com',
        name: 'Test User'
      });
      expect(result.id).toBeDefined();
    });

    it('should throw ValidationError for invalid email', async () => {
      await expect(
        service.createUser({ email: 'invalid', name: 'Test' })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ConflictError for duplicate email', async () => {
      await service.createUser({ email: 'test@example.com', name: 'User 1' });

      await expect(
        service.createUser({ email: 'test@example.com', name: 'User 2' })
      ).rejects.toThrow(ConflictError);
    });
  });
});
