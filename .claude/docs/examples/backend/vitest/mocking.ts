// @ts-nocheck - Example code, not compiled
// Mocking Pattern
// Demonstrates module and function mocking

import { vi, describe, it, expect } from 'vitest';

// Mock external dependency
vi.mock('./database', () => ({
  db: {
    findUser: vi.fn(),
    createUser: vi.fn()
  }
}));

import { db } from './database';
import { UserService } from './user-service';

describe('UserService', () => {
  it('should fetch user from database', async () => {
    const mockUser = { id: '1', email: 'test@example.com' };
    vi.mocked(db.findUser).mockResolvedValue(mockUser);

    const service = new UserService();
    const result = await service.getUser('1');

    expect(db.findUser).toHaveBeenCalledWith('1');
    expect(result).toEqual(mockUser);
  });
});
