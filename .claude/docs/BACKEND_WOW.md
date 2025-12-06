# Backend Architecture - Best Practices Guide

## Technology Stack

### Core Framework
- **Fastify** - High-performance web framework with TypeScript support
- **Zod** - Runtime type validation and TypeScript type inference
- **TypeScript 5.3+** - Strict mode enforced
- **Vitest** - Fast test runner with native TypeScript support

### Integration
- `@fastify/type-provider-typebox` or `fastify-type-provider-zod` for Zod integration
- `Pino` - Structured JSON logging (Fastify default)

## Core Principles

### 1. Type-Safety Everywhere

**Goal:** Catch errors at compile-time, not runtime.

**MUST:**
- Define explicit return types for all exported functions
- Use Zod schemas for all external input validation
- Share types between frontend and backend (single source of truth)
- Use discriminated unions for complex state

**AVOID:**
- `any` type in production code
- Implicit return types in public APIs
- Manual type definitions when Zod can infer them

**Benefits:**
- Frontend gets compile-time validation against backend contracts
- Breaking API changes caught during build
- Auto-completion and IntelliSense

### 2. Schema-Driven Development with Zod

**Pattern:** Define Zod schemas, get validation + TypeScript types + serialization.

```typescript
// Define Zod schema
const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  age: z.number().min(0).optional()
});

// Infer TypeScript type
type CreateUserRequest = z.infer<typeof CreateUserSchema>;
```

**Reference:** See `docs/examples/backend/fastify/schema-driven-development.ts`

### 3. Layered Architecture

**Structure:**
```
Presentation Layer (routes/, handlers/) → HTTP concerns only
Business Logic Layer (services/, domain/) → Framework-agnostic, testable
Data Access Layer (repositories/, datasources/) → Single mutation point
```

**Dependency Flow:** Presentation → Business Logic → Data Access (never reverse)

**MUST:**
- Keep HTTP concerns (headers, status codes) in presentation layer only
- Make business logic testable without HTTP server
- Encapsulate all data access in repositories

## File Conventions

**Routes:** `<EntityName>Routes.ts` (e.g., `UserRoutes.ts`)
**Services:** `<EntityName>Service.ts` (e.g., `UserService.ts`)
**Repositories:** `<EntityName>Repository.ts`
**Types:** `<domain>Types.ts` (e.g., `apiTypes.ts`, `domainTypes.ts`)
**Tests:** Co-located `<FileName>.test.ts`
**Schemas:** `<domain>Schemas.ts` (e.g., `userSchemas.ts`)

## Decision Rules

### Testing: Unit vs Integration

**Unit tests when:**
- Testing business logic in services (no HTTP)
- Testing pure functions without external dependencies
- Target: 70% of test suite

**Integration tests when:**
- Testing full route handler flow
- Testing Zod schema validation
- Testing error responses
- Target: 20% of test suite

**E2E tests when:**
- Testing complete user flows across multiple endpoints
- Target: 10% of test suite

### Dependency Injection: When to Use

**Use constructor injection when:**
- Component needs database access
- Component calls external APIs
- Component has complex dependencies

**Use Fastify decorators when:**
- Sharing services across multiple routes
- Plugin-scoped state needed
- Global configuration required

**Reference:** See `docs/examples/backend/integration/dependency-injection.ts`

### Mocking: What to Mock

**SHOULD mock:**
- Database connections
- External HTTP clients
- File system operations
- Date/time (for deterministic tests)

**SHOULD NOT mock:**
- Business logic (test it directly)
- Utility functions
- Internal service methods

**Reference:** See `docs/examples/backend/vitest/mocking.ts`

## Fastify Best Practices

### Plugin Architecture

**When to use plugins:**
- Feature spans multiple routes
- Component needs isolated testing
- Reusable across projects

**When NOT to use plugins:**
- Single-route feature (use handler)
- No shared state needed

**Pattern:** Encapsulate features in plugins for reusability.

**Reference:** See `docs/examples/backend/fastify/plugin-architecture.ts`

### Error Handling

**Standard error format (MUST follow):**
```typescript
{
  error: string;        // Human-readable message
  code: string;         // Machine-readable (e.g., 'USER_NOT_FOUND')
  timestamp: string;    // ISO 8601
  requestId?: string;   // For tracing
}
```

**HTTP status codes:**
- `400` - Client validation errors
- `401` - Missing/invalid authentication
- `403` - Insufficient permissions
- `404` - Resource not found
- `409` - State conflict (e.g., duplicate email)
- `500` - Unexpected server error

**Pattern:** Custom error classes with global error handler.

**Reference:** See `docs/examples/backend/fastify/error-handling.ts`

### Request Validation with Zod

**MUST:**
- Validate all external input with Zod schemas
- Use Zod's type inference for TypeScript types
- Define schemas as constants for reusability

**Pattern:** Use `fastify-type-provider-zod` for automatic validation.

**Reference:** See `docs/examples/backend/fastify/request-validation.ts`

### Lifecycle Hooks

**Common patterns:**
- Authentication (preHandler)
- Request ID injection (onRequest)
- Performance logging (onResponse)

**Reference:** See `docs/examples/backend/fastify/lifecycle-hooks.ts`

### Logging

**MUST:**
- Use Pino (Fastify's default logger)
- Use structured logging (JSON format)
- Include request context in all logs

**AVOID:**
- `console.log` in production code
- String concatenation for logs
- Logging sensitive data (passwords, tokens)

**Reference:** See `docs/examples/backend/fastify/logging.ts`

## TypeScript Best Practices

### Strict Configuration

**MUST enable in tsconfig.json:**
- `strict: true`
- `noImplicitAny: true`
- `strictNullChecks: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noImplicitReturns: true`

**Reference:** See `docs/examples/backend/typescript/strict-config.json`

### Type Organization

**Pattern:** Centralize shared types in dedicated files.

**File structure:**
- `types/api.ts` - API request/response contracts
- `types/domain.ts` - Business entities
- `types/enums.ts` - Shared enumerations

**Reference:** See `docs/examples/backend/typescript/type-organization.ts`

### Type Guards

**When to use:** Runtime validation of unknown types.

**Pattern:** Create `is` functions that TypeScript understands.

**Reference:** See `docs/examples/backend/typescript/type-guards.ts`

### Discriminated Unions

**When to use:** Type-safe state machines, complex state management.

**Pattern:** Use `status` or `type` field as discriminator.

**Reference:** See `docs/examples/backend/typescript/discriminated-unions.ts`

### Utility Types

**Common patterns:** `Pick`, `Partial`, `Required`, `Omit`, `Readonly`

**When to use:**
- Creating subsets of existing types
- Making optional fields required
- Removing sensitive fields for public APIs

**Reference:** See `docs/examples/backend/typescript/utility-types.ts`

## Vitest Best Practices

### Test Structure

**Pattern:** Use `describe` blocks for organization, clear test names.

**Naming convention:**
- `describe('ClassName')` for outer block
- `describe('methodName')` for method grouping
- `it('should [behavior]')` for test cases

**Reference:** See `docs/examples/backend/vitest/test-structure.ts`

### Testing Fastify Routes

**Pattern:** Use Fastify's `inject()` method (no HTTP server needed).

**Benefits:**
- Faster tests (no network overhead)
- Full request/response cycle testing
- Schema validation testing

**Reference:** See `docs/examples/backend/vitest/fastify-route-testing.ts`

### Coverage Requirements

**Thresholds (MUST meet):**
- Lines: 70%
- Functions: 70%
- Branches: 70%
- Statements: 70%

**Exclude from coverage:**
- `node_modules/`
- `dist/`
- `**/*.test.ts`
- `**/types.ts`

**Reference:** See `docs/examples/backend/vitest/vitest-config.ts`

## Integration Patterns

### Type-Safe API Client

**Pattern:** Share Zod schemas between server and client.

**Implementation:**
- Export schemas from server
- Import schemas in client
- Use for runtime validation + TypeScript types

**Reference:** See `docs/examples/backend/integration/type-safe-api-client.ts`

### Environment Configuration

**MUST:**
- Validate environment variables on startup
- Use Zod for type-safe config
- Fail fast if required variables missing

**Reference:** See `docs/examples/backend/integration/environment-config.ts`

### Dependency Injection

**Pattern:** Constructor injection with factory functions.

**AVOID:**
- Global singletons (hard to test)
- Service locator pattern
- Implicit dependencies

**Reference:** See `docs/examples/backend/integration/dependency-injection.ts`

## Performance Optimization

### Response Serialization

**Pattern:** Fastify automatically optimizes response serialization.

**Performance:** 2-3x faster than `JSON.stringify` for large responses.

**Reference:** See `docs/examples/backend/performance/response-serialization.ts`

### Connection Pooling

**When to use:** Database connections, external API clients.

**Pattern:** Configure max connections, idle timeout, connection timeout.

**Reference:** See `docs/examples/backend/performance/connection-pooling.ts`

## Security Best Practices

### Input Sanitization

**MUST:**
- Validate all input with Zod schemas
- Sanitize HTML content (use DOMPurify)
- Prevent path traversal in file operations

**Reference:** See `docs/examples/backend/security/input-sanitization.ts`

### Rate Limiting

**SHOULD implement for:**
- Authentication endpoints
- Public APIs
- Resource-intensive operations

**Reference:** See `docs/examples/backend/security/rate-limiting.ts`

### CORS Configuration

**MUST:**
- Explicitly whitelist allowed origins
- Never use `origin: true` in production
- Configure allowed methods

**Reference:** See `docs/examples/backend/security/cors-config.ts`

### Security Headers

**MUST implement:**
- Content Security Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security (HTTPS)

**Reference:** See `docs/examples/backend/security/helmet-config.ts`

## Anti-Patterns

### ❌ Global State in Plugins

**Problem:** Breaks plugin isolation, testing difficult.

**Solution:** Use `fastify.decorate()` for plugin-scoped state.

### ❌ Async Operations Without Error Handling

**Problem:** Unhandled promise rejections crash the server.

**Solution:** Always use try/catch or .catch() with async code.

### ❌ Schema Duplication

**Problem:** Maintenance burden, inconsistency between endpoints.

**Solution:** Extract reusable Zod schema components.

**Reference:** See `docs/examples/backend/fastify/request-validation.ts`

### ❌ Testing Implementation Details

**Problem:** Brittle tests, refactoring breaks tests.

**Solution:** Test behavior (inputs/outputs), not implementation (internal calls).

**Reference:** See `docs/examples/backend/vitest/test-structure.ts`

### ❌ Using `any` Type

**Problem:** Defeats type safety, allows runtime errors.

**Solution:** Use `unknown` with type guards, or define proper types.

### ❌ Nested Route Handlers

**Problem:** Hard to test, tight coupling, poor reusability.

**Solution:** Extract business logic to service layer.

### ❌ Global Singletons for Services

**Problem:** Impossible to mock in tests, hidden dependencies.

**Solution:** Use factory pattern with dependency injection.

**Reference:** See `docs/examples/backend/integration/dependency-injection.ts`

### ❌ Ignoring TypeScript Errors

**Problem:** Runtime errors in production.

**Solution:** Fix all `tsc` errors before committing. Use `// @ts-expect-error` only with justification comment.

## Examples Reference

**Path:** `docs/examples/backend/`

### Fastify
- `fastify/plugin-architecture.ts` - Plugin encapsulation pattern
- `fastify/error-handling.ts` - Custom error classes, global handler
- `fastify/request-validation.ts` - Zod schema validation
- `fastify/response-serialization.ts` - Fast serialization
- `fastify/lifecycle-hooks.ts` - Auth, logging, request ID injection
- `fastify/logging.ts` - Pino configuration

### TypeScript
- `typescript/strict-config.json` - Strict tsconfig settings
- `typescript/type-organization.ts` - Type file structure
- `typescript/type-guards.ts` - Runtime type checking
- `typescript/discriminated-unions.ts` - State machines
- `typescript/utility-types.ts` - Pick, Omit, Readonly, etc.

### Vitest
- `vitest/test-structure.ts` - Describe blocks, test organization
- `vitest/mocking.ts` - Module and function mocks
- `vitest/fastify-route-testing.ts` - inject() method usage
- `vitest/vitest-config.ts` - Coverage configuration

### Integration
- `integration/type-safe-api-client.ts` - Shared Zod schemas
- `integration/environment-config.ts` - Zod environment validation
- `integration/dependency-injection.ts` - Factory pattern

### Performance
- `performance/response-serialization.ts` - Serialization optimization
- `performance/connection-pooling.ts` - Database connection pool

### Security
- `security/input-sanitization.ts` - HTML sanitization with DOMPurify
- `security/rate-limiting.ts` - Request rate limits
- `security/cors-config.ts` - CORS configuration
- `security/helmet-config.ts` - Security headers
