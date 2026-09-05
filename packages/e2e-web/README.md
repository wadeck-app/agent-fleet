# e2e-web

Playwright end-to-end test suite for the agent-fleet web application.

## Purpose

Verifies the full system works correctly from the browser perspective: API flows, UI interactions, and visual regressions.

## Responsibility

- Integration tests against the running web app (web-backend + web-frontend)
- Storybook component tests (isolated component behavior without a backend)
- Visual regression tests

## Does NOT own

- Unit or integration tests for individual packages -- those live next to their implementations
- Test infrastructure helpers -- those live in test-utils
- Application code -- it is a consumer only

## Dependencies on local packages

- shared-frontend-backend (typed contracts used in test assertions)

## Consumers

None -- test suite, run by CI or developers.

## Entry point type

Test suite (Playwright).

## Key files

- `e2e/tests/*.spec.ts` -- application-level end-to-end tests (requires running backend + frontend)
- `e2e/tests/storybook/` -- component-level tests against Storybook (no backend required)
- `e2e/pages/` -- Page Object Model classes (one per major UI section)
- `playwright.config.integration.ts` -- config for full-app tests
- `playwright.config.storybook.ts` -- config for Storybook component tests
