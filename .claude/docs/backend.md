# Backend Architecture - Best Practices Guide

Last updated: 2025-12-14

## Technology Stack

| Component     | Technology                | Purpose                                        |
| ------------- | ------------------------- | ---------------------------------------------- |
| Framework     | Fastify                   | High-performance web framework with TypeScript |
| Validation    | Zod                       | Runtime validation + type inference            |
| Language      | TypeScript 5.3+           | Strict mode enforced                           |
| Testing       | Vitest                    | Fast test runner with native TS support        |
| Logging       | Pino                      | Structured JSON logging (Fastify default)      |
| Type Provider | fastify-type-provider-zod | Zod integration for routes                     |

## Core Principles

### 1. Type-Safety Everywhere

| Aspect       | Rule                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| **Goal**     | Catch errors at compile-time, not runtime                                                                   |
| **MUST**     | Explicit return types, Zod for external input, shared types packages/frontend/backend, discriminated unions |
| **AVOID**    | `any` type, implicit return types, manual type definitions when Zod can infer                               |
| **Benefits** | Compile-time validation, breaking changes caught in build, auto-completion                                  |

### 2. Schema-Driven Development with Zod

Define Zod schemas → get validation + TypeScript types + serialization.

**Reference:** `docs/examples/packages/backend/fastify/schema-driven-development.ts`

### 3. Layered Architecture

| Layer          | Location                        | Responsibility               | Dependency Flow  |
| -------------- | ------------------------------- | ---------------------------- | ---------------- |
| Presentation   | `routes/`, `handlers/`          | HTTP concerns only           | → Business Logic |
| Business Logic | `services/`, `domain/`          | Framework-agnostic, testable | → Data Access    |
| Data Access    | `repositories/`, `datasources/` | Single mutation point        | (terminal)       |

**Rules:**

- Keep HTTP concerns (headers, status codes) in presentation layer only
- Make business logic testable without HTTP server
- Encapsulate all data access in repositories
- Never reverse dependency flow

## File Conventions

| File Type    | Pattern                     | Example                         |
| ------------ | --------------------------- | ------------------------------- |
| Routes       | `<EntityName>Routes.ts`     | `UserRoutes.ts`                 |
| Services     | `<EntityName>Service.ts`    | `UserService.ts`                |
| Repositories | `<EntityName>Repository.ts` | `UserRepository.ts`             |
| Types        | `<domain>Types.ts`          | `apiTypes.ts`, `domainTypes.ts` |
| Tests        | `<FileName>.test.ts`        | `UserService.test.ts`           |
| Schemas      | `<domain>Schemas.ts`        | `userSchemas.ts`                |

**index.ts files:**

- Only for exporting multiple items from a folder
- Never use `export * from`, always explicit exports

## Decision Rules

### Testing Strategy

| Test Type   | When to Use                                              | Target % | Reference                         |
| ----------- | -------------------------------------------------------- | -------- | --------------------------------- |
| Unit        | Business logic in services, pure functions               | 70%      | `vitest/test-structure.ts`        |
| Integration | Full route handler flow, Zod validation, error responses | 20%      | `vitest/fastify-route-testing.ts` |
| E2E         | Complete user flows across endpoints                     | 10%      | (project-specific)                |

### Dependency Injection

| Technique             | When to Use                                                        | Reference                             |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| Constructor injection | Database access, external APIs, complex dependencies               | `integration/dependency-injection.ts` |
| Fastify decorators    | Sharing services across routes, plugin-scoped state, global config | (Fastify docs)                        |

### Mocking

| Should Mock                                                         | Should NOT Mock                                             |
| ------------------------------------------------------------------- | ----------------------------------------------------------- |
| Database connections, External HTTP clients, File system, Date/time | Business logic, Utility functions, Internal service methods |

**Reference:** `docs/examples/packages/backend/vitest/mocking.ts`

## Fastify Best Practices

### Plugin Architecture

| Decision         | Criteria                                                                        |
| ---------------- | ------------------------------------------------------------------------------- |
| **Use plugins**  | Feature spans multiple routes, needs isolated testing, reusable across projects |
| **Use handlers** | Single-route feature, no shared state needed                                    |

**Pattern:** Encapsulate features in plugins for reusability.
**Reference:** `docs/examples/packages/backend/fastify/plugin-architecture.ts`

### Error Handling

**Standard error format:**

| Field     | Type              | Purpose                | Example                |
| --------- | ----------------- | ---------------------- | ---------------------- |
| error     | string            | Human-readable message | "User not found"       |
| code      | string            | Machine-readable code  | "USER_NOT_FOUND"       |
| timestamp | string            | ISO 8601 timestamp     | "2025-12-14T10:30:00Z" |
| requestId | string (optional) | For tracing            | "req-123abc"           |

**HTTP status codes:**

| Code | Meaning                                |
| ---- | -------------------------------------- |
| 400  | Client validation errors               |
| 401  | Missing/invalid authentication         |
| 403  | Insufficient permissions               |
| 404  | Resource not found                     |
| 409  | State conflict (e.g., duplicate email) |
| 500  | Unexpected server error                |

**Pattern:** Custom error classes with global error handler.
**Reference:** `docs/examples/packages/backend/fastify/error-handling.ts`

### Request Validation with Zod

| Rule               | Description                                   |
| ------------------ | --------------------------------------------- |
| Validate all input | Use Zod schemas for all external input        |
| Type inference     | Use Zod's type inference for TypeScript types |
| Reusability        | Define schemas as constants                   |

**Pattern:** Use `fastify-type-provider-zod` for automatic validation.
**Reference:** `docs/examples/packages/backend/fastify/request-validation.ts`

### Lifecycle Hooks

| Hook       | Use Case             | Reference                               |
| ---------- | -------------------- | --------------------------------------- |
| preHandler | Authentication       | `fastify/lifecycle-hooks-web-server.ts` |
| onRequest  | Request ID injection | `fastify/lifecycle-hooks-web-server.ts` |
| onResponse | Performance logging  | `fastify/lifecycle-hooks-web-server.ts` |

### Logging

| Rule      | Description                                                               |
| --------- | ------------------------------------------------------------------------- |
| **MUST**  | Use Pino, structured JSON format, include request context                 |
| **AVOID** | `console.log` in production, string concatenation, logging sensitive data |

**Reference:** `docs/examples/packages/backend/fastify/logging.ts`

## TypeScript Best Practices

### Strict Configuration

**MUST enable in tsconfig.json:** `strict`, `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`

**Reference:** `docs/examples/packages/backend/typescript/strict-config.json`

### Type Organization

| File              | Content                        | Example                |
| ----------------- | ------------------------------ | ---------------------- |
| `types/api.ts`    | API request/response contracts | Request/Response DTOs  |
| `types/domain.ts` | Business entities              | User, Product entities |
| `types/enums.ts`  | Shared enumerations            | Status, Role enums     |

**Reference:** `docs/examples/packages/backend/typescript/type-organization.ts`

### Advanced TypeScript Patterns

| Pattern              | When to Use                                                        | Reference                            |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| Type Guards          | Runtime validation of unknown types                                | `typescript/type-guards.ts`          |
| Discriminated Unions | Type-safe state machines, complex state                            | `typescript/discriminated-unions.ts` |
| Utility Types        | `Pick`, `Partial`, `Required`, `Omit`, `Readonly` for type subsets | `typescript/utility-types.ts`        |

## Vitest Best Practices

### Test Structure

**Naming convention:**

- `describe('ClassName')` - Outer block
- `describe('methodName')` - Method grouping
- `it('should [behavior]')` - Test cases

**Reference:** `docs/examples/packages/backend/vitest/test-structure.ts`

### Testing Fastify Routes

**Pattern:** Use Fastify's `inject()` method (no HTTP server needed).

**Benefits:** Faster (no network), full request/response cycle, schema validation testing.

**Reference:** `docs/examples/packages/backend/vitest/fastify-route-testing.ts`

### Coverage Requirements

| Metric     | Threshold |
| ---------- | --------- |
| Lines      | 70%       |
| Functions  | 70%       |
| Branches   | 70%       |
| Statements | 70%       |

**Exclude:** `node_modules/`, `dist/`, `**/*.test.ts`, `**/types.ts`

**Reference:** `docs/examples/packages/backend/vitest/vitest-config.ts`

## Integration Patterns

| Pattern              | Description                                      | Reference                             |
| -------------------- | ------------------------------------------------ | ------------------------------------- |
| Type-Safe API Client | Share Zod schemas between server and client      | `integration/type-safe-api-client.ts` |
| Environment Config   | Validate env vars on startup with Zod, fail fast | `integration/environment-config.ts`   |
| Dependency Injection | Constructor injection with factory functions     | `integration/dependency-injection.ts` |

## Performance Optimization

| Technique              | Description                                                 | Reference                               |
| ---------------------- | ----------------------------------------------------------- | --------------------------------------- |
| Response Serialization | Fastify auto-optimizes (2-3x faster than JSON.stringify)    | `performance/response-serialization.ts` |
| Connection Pooling     | Configure max connections, idle timeout, connection timeout | `performance/connection-pooling.ts`     |

## Security Best Practices

| Area               | Requirements                                                         | Reference                        |
| ------------------ | -------------------------------------------------------------------- | -------------------------------- |
| Input Sanitization | Validate with Zod, sanitize HTML (DOMPurify), prevent path traversal | `security/input-sanitization.ts` |
| Rate Limiting      | Implement for auth endpoints, public APIs, resource-intensive ops    | `security/rate-limiting.ts`      |
| CORS               | Whitelist allowed origins, never `origin: true` in prod              | `security/cors-config.ts`        |
| Security Headers   | CSP, X-Frame-Options, X-Content-Type-Options, HSTS                   | `security/helmet-config.ts`      |

## Anti-Patterns

| Anti-Pattern                 | Problem                           | Solution                                         | Reference                             |
| ---------------------------- | --------------------------------- | ------------------------------------------------ | ------------------------------------- |
| Global State in Plugins      | Breaks isolation, hard to test    | Use `fastify.decorate()` for plugin-scoped state | -                                     |
| Async Without Error Handling | Unhandled rejections crash server | Always use try/catch or .catch()                 | -                                     |
| Schema Duplication           | Maintenance burden, inconsistency | Extract reusable Zod schema components           | `fastify/request-validation.ts`       |
| Testing Implementation       | Brittle tests, breaks on refactor | Test behavior (inputs/outputs), not internals    | `vitest/test-structure.ts`            |
| Using `any` Type             | Defeats type safety               | Use `unknown` with type guards                   | -                                     |
| Nested Route Handlers        | Hard to test, tight coupling      | Extract business logic to service layer          | -                                     |
| Global Singletons            | Impossible to mock, hidden deps   | Use factory pattern with DI                      | `integration/dependency-injection.ts` |
| Ignoring TypeScript Errors   | Runtime errors in production      | Fix all `tsc` errors before commit               | -                                     |

## Related Documentation

- `.claude/docs/fastify.md` - Fastify-specific patterns and architecture
- `.claude/docs/frontend.md` - Frontend architecture (for API contracts)
- `.claude/kb/testing-backend.md` - Testing lessons learned
- `docs/examples/packages/backend/` - All code examples referenced above
