# test-utils

Shared test infrastructure for unit and integration tests across the monorepo.

## Purpose

Provides reusable factories, mock builders, and API test helpers so each package's tests do not duplicate setup code.

## Responsibility

- Test factories for domain objects (tasks, flows, messages, etc.)
- Mock builders for services and repositories
- REST API test helpers for integration-level request/response testing

## Does NOT own

- Business logic -- that's the packages under test
- Test execution or configuration -- that's each package's own jest/vitest config
- E2E test infrastructure -- that's e2e-web

## Dependencies on local packages

- shared-common

## Consumers

orchestrator, worker, flow-engine, legacy-cli -- all as `devDependencies`.

## Entry point type

Library (dev-only).

## Key files

- `src/factories/` -- domain object factories (TaskFactory, FlowFactory, etc.)
- `src/mocks/` -- mock implementations of services and repositories
- `src/api/` -- REST API test helpers for supertest-style integration tests
