# Fastify Best Practices

Last updated: 2025-12-14

**Purpose:** Essential guide for Fastify architecture, routing patterns, and layered backend structure.

**Load this when:** Working in `packages/backend/` directory.

## Core Principles

| Principle            | Description                                           |
| -------------------- | ----------------------------------------------------- |
| Layered architecture | Controllers → Services → Repositories                 |
| Plugin-based         | Modular, encapsulated functionality                   |
| Schema validation    | Zod schemas for type safety                           |
| Typed routes         | Type-safe contracts between packages/frontend/backend |
| Error handling       | Centralized error management                          |

## Project Architecture

### Directory Structure

```
packages/backend/src/
├── controllers/      # Route handlers (thin layer)
├── services/         # Business logic
├── repositories/     # Data access layer
├── fastify/plugins/  # Fastify plugins
├── storage/          # Storage implementations
└── utils/            # Utilities
```

### Responsibility Layers

| Layer            | File Pattern     | Responsibilities                                                                                       | NO                                                                       |
| ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **Controllers**  | `*Controller.ts` | Route registration, Zod validation, call services, format responses, error handling                    | Business logic, direct data access, complex transforms                   |
| **Services**     | `*Service.ts`    | Business logic, orchestrate repositories, data transformation, business rules, throw meaningful errors | HTTP concerns, direct storage, request/reply objects, route registration |
| **Repositories** | `*Repository.ts` | CRUD operations, query building, storage abstraction, data mapping                                     | Business logic, validation, complex queries, side effects                |

**Reference:** `.claude/docs/examples/fastify/architecture.ts`

## Controller Patterns

| Aspect        | Rules                                                                           |
| ------------- | ------------------------------------------------------------------------------- |
| **Location**  | `packages/backend/src/controllers/`                                             |
| **Naming**    | `{Entity}Controller.ts` (e.g., `BooksController.ts`)                            |
| **DO**        | Keep thin, use Zod schemas, type routes, handle errors, consistent responses    |
| **DON'T**     | Business logic, direct data access, complex transformations, unvalidated inputs |
| **Reference** | Bad: `examples/fastify/controller.bad.ts`, Good: `controller.good.ts`           |

## Service Patterns

| Aspect        | Rules                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| **Location**  | `packages/backend/src/services/`                                                                               |
| **Naming**    | `{Entity}Service.ts` (e.g., `BooksService.ts`)                                                                 |
| **DO**        | Pure business logic, use repositories, validate business rules, return domain objects, throw meaningful errors |
| **DON'T**     | HTTP concerns (status codes, headers), direct storage access, request/reply objects, route registration        |
| **Reference** | `.claude/docs/examples/fastify/service.ts`                                                                     |

## Repository Patterns

| Aspect        | Rules                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| **Location**  | `packages/backend/src/repositories/`                                                                    |
| **Naming**    | `{Entity}Repository.ts` (e.g., `BooksRepository.ts`)                                                    |
| **DO**        | Abstract storage, return domain objects, simple interface (find/create/update/delete), async operations |
| **DON'T**     | Business logic, validation, complex queries (add methods instead), side effects                         |
| **Reference** | `.claude/docs/examples/fastify/repository.ts`                                                           |

## Route Registration

### Fastify Route Methods

| Method           | Usage                                                              | Preferred      |
| ---------------- | ------------------------------------------------------------------ | -------------- |
| Full declaration | `fastify.route({ method: 'GET', url: '/books', schema, handler })` | Complex routes |
| Shorthand        | `fastify.get('/books', { schema, handler })`                       | ✅ Preferred   |

### Organization

- Register in plugins for encapsulation
- Use prefixes: `/api/v1/books`
- Type routes with shared contracts from `packages/shared/`

**Reference:** `.claude/docs/examples/fastify/routes.ts`

## Schema Validation with Zod

### Pattern

| Step | Action                                            |
| ---- | ------------------------------------------------- |
| 1    | Import schema from `packages/shared/src/schemas/` |
| 2    | Parse request data (body, query, params)          |
| 3    | Type-safe in handler                              |
| 4    | Automatic validation errors                       |

**Validation targets:** Body, Query, Params, Response

**Reference:** `.claude/docs/examples/fastify/validation.ts`

## Typed Routes with Contracts

### Contract Pattern

**Location:** `packages/shared/src/api/{entity}.contract.ts`

**Purpose:** Type-safe routes, shared packages/frontend/backend, auto-completion, validation schemas

**Structure:** Define method, path, body schema, response schemas per endpoint.

**Reference:** `.claude/docs/examples/fastify/contracts.ts`

## Plugin System

### Use Cases

| Use Case             | Description              |
| -------------------- | ------------------------ |
| Route registration   | Group related routes     |
| Database connections | Connection management    |
| Authentication       | Auth middleware          |
| Logging              | Request/response logging |
| Error handling       | Global error handlers    |

### Pattern

Each plugin is isolated, can have own state, registered with `fastify.register()`.

**Location:** `packages/backend/src/fastify/plugins/`
**Reference:** `.claude/docs/examples/fastify/plugins.ts`

## Error Handling

### Strategy

| Step              | Responsibility                            |
| ----------------- | ----------------------------------------- |
| 1. Throw errors   | In services with meaningful error classes |
| 2. Catch errors   | In controllers, convert to HTTP responses |
| 3. Global handler | Catch unexpected errors                   |
| 4. Format         | Standard error response                   |

### Error Response Format

| Field      | Type   | Example            |
| ---------- | ------ | ------------------ |
| error      | string | "Error message"    |
| statusCode | number | 400                |
| code       | string | "VALIDATION_ERROR" |

**Reference:** `.claude/docs/examples/fastify/errors.ts`

## Hooks and Lifecycle

| Hook          | When                             | Use Case              |
| ------------- | -------------------------------- | --------------------- |
| onRequest     | Before route handler             | Request ID generation |
| preValidation | Before validation                | Early rejection       |
| preHandler    | After validation, before handler | Authentication        |
| onSend        | Before sending response          | Response modification |
| onResponse    | After response sent              | Logging, metrics      |

**Reference:** `.claude/docs/examples/fastify/hooks-web-server.ts`

## Dependency Injection

### Factory Pattern

Use factories for creating service instances, injecting repositories, managing dependencies.

**Pattern:** Constructor injection with repository dependencies.

**Reference:** `.claude/docs/examples/fastify/dependency-injection.ts`

## Testing Patterns

### Testing by Layer

| Layer        | Test Type      | Mock         | Validate                |
| ------------ | -------------- | ------------ | ----------------------- |
| Controllers  | Route handlers | Services     | Responses, status codes |
| Services     | Business logic | Repositories | Business rules          |
| Repositories | Data access    | Storage      | CRUD operations         |

### Fastify Testing

Use `fastify.inject()` for HTTP testing without starting server.

**Reference:** `.claude/docs/examples/fastify/testing.ts`

## Anti-Patterns

| Anti-Pattern                        | Problem                       | Solution              |
| ----------------------------------- | ----------------------------- | --------------------- |
| Business logic in controllers       | Tight coupling, hard to test  | Move to services      |
| Services accessing storage directly | No abstraction, hard to test  | Use repositories      |
| Repositories with business logic    | Wrong layer, breaks SRP       | Keep pure data access |
| Unvalidated requests                | Security risk, runtime errors | Validate with Zod     |
| Inconsistent error responses        | Poor client experience        | Standard error format |

**Reference:** `.claude/docs/examples/fastify/antipatterns.ts`

## Performance Best Practices

| Technique          | Benefit            | Implementation             |
| ------------------ | ------------------ | -------------------------- |
| Schema compilation | Faster validation  | Fastify auto-compiles      |
| Async handlers     | Non-blocking       | Always use async/await     |
| Connection pooling | Reuse connections  | Configure in storage layer |
| Caching            | Reduce computation | Cache expensive operations |
| Logging levels     | Less overhead      | Production vs development  |

**Reference:** `.claude/docs/examples/fastify/performance.ts`

## Quick Checklist

When working with Fastify:

- [ ] Controllers are thin (no business logic)
- [ ] Services contain all business logic
- [ ] Repositories only access data
- [ ] All requests validated with Zod
- [ ] Routes registered via plugins
- [ ] Typed contracts for routes
- [ ] Standard error format used
- [ ] Tests mock at layer boundaries
- [ ] Dependency injection via constructor
- [ ] Async/await used throughout

## Related Documentation

- `.claude/docs/backend.md` - Backend architecture overview
- `.claude/kb/testing-backend.md` - Testing lessons learned
- `.claude/docs/examples/fastify/` - All code examples
