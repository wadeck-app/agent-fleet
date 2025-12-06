// @ts-nocheck - Example code, not compiled
// Dependency Injection Pattern
// Demonstrates constructor injection for testability

// Avoid global singletons
// ❌ BAD
export const userService = new UserService(db);

// ✅ GOOD - Factory pattern
export function createUserService(db: Database): UserService {
  return new UserService(db);
}

// Usage in Fastify
fastify.decorate('userService', createUserService(db));

// Easy to test with mock
const mockDb = createMockDatabase();
const service = createUserService(mockDb);
