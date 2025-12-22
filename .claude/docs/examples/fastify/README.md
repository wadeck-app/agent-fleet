# Fastify Examples

Comprehensive examples for Fastify layered architecture, routing patterns, and backend structure in this project.

## Files Overview

### Architecture & Patterns

- **architecture.ts** - Layered architecture (Controllers → Services → Repositories)
- **controller.bad.ts** - Anti-patterns: business logic in controllers
- **controller.good.ts** - Correct: thin controllers delegating to services
- **service.ts** - Service layer patterns and business logic
- **repository.ts** - Repository patterns for data access
- **validation.ts** - Zod schema validation integration

### Advanced Topics

- **contracts.ts** - Typed route contracts from packages/shared/
- **plugins.ts** - Fastify plugin system patterns
- **errors.ts** - Error handling strategies
- **testing.ts** - Testing strategies for each layer

### Quick Reference

- **antipatterns.ts** - Common mistakes with side-by-side fixes

## Key Principles

### Layered Architecture

**Controllers** (`packages/backend/src/controllers/`)

- Thin layer
- Route registration
- Request validation (Zod)
- Response formatting
- NO business logic

**Services** (`packages/backend/src/services/`)

- Business logic
- Orchestrates repositories
- Data transformation
- Framework-agnostic
- NO HTTP concerns

**Repositories** (`packages/backend/src/repositories/`)

- Data access only
- CRUD operations
- Storage abstraction
- NO business logic

### Responsibilities

✅ **Controllers DO:**

- Register routes
- Validate with Zod
- Call services
- Format responses

❌ **Controllers DON'T:**

- Business logic
- Direct storage access
- Complex transformations

✅ **Services DO:**

- Business logic
- Use repositories
- Validate business rules
- Return domain objects

❌ **Services DON'T:**

- HTTP concerns (status codes)
- Direct storage access
- Route registration

✅ **Repositories DO:**

- CRUD operations
- Query building
- Storage abstraction

❌ **Repositories DON'T:**

- Business logic
- Validation
- Side effects

## Integration with Main Documentation

These examples are referenced from `../FASTIFY_WOW.md`. The main doc provides conceptual guidance, these files provide runnable code.

## Usage

Copy patterns into your code, adapt to your needs, follow the layered architecture strictly.
