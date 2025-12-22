# Playwright Best Practices for Agents

**Purpose:** Essential guide for creating anti-fragile, non-flaky, fast E2E tests.

## Core Principles

1. **Test user-visible behavior**, not implementation details
2. **Leverage auto-waiting** - Playwright waits for actionability automatically
3. **Use semantic locators** - Reflect how users perceive the page
4. **Isolate tests** - Each test is independent with fresh context
5. **Avoid explicit waits** - Use assertions and locators with built-in retries

---

## Locator Strategies (Priority Order)

### ✅ DO (Best to Good)

1. **Role-based** - Most recommended, reflects accessibility
2. **Label-based** - Ideal for form controls
3. **Placeholder** - Good when labels not present
4. **Text-based** - For static content
5. **Test ID** (last resort) - Stable but not user-facing

### ❌ DON'T

- Long CSS selectors
- XPath selectors
- Positional selectors like `.first()`, `.nth(2)` without context
- Class-based selectors that change with styling

**Example:** `.claude/docs/examples/playwright/locators.good.ts`

---

## Waiting Strategies

### ✅ DO

1. **Use assertions with auto-retry** - `toBeVisible()`, `toHaveText()`, etc.
2. **Wait for specific element to appear** - Use `waitFor()` with state
3. **Wait for specific network response** - Use `waitForResponse()` with predicates

### ❌ DON'T

- `page.waitForTimeout(5000)` - Arbitrary delays make tests slow and unreliable
- `page.waitForLoadState('networkidle')` - Unreliable, waits for all requests (ads, analytics)
- `page.waitForLoadState('domcontentloaded')` - Too early, elements may not be rendered
- Manual polling loops

**See:**

- Anti-patterns: `.claude/docs/examples/playwright/waiting.bad.ts`
- Correct approach: `.claude/docs/examples/playwright/waiting.good.ts`

---

## Assertions

### ✅ DO - Use Auto-Retrying Web Assertions

- `toBeVisible()` - Element is visible
- `toBeHidden()` - Element is not visible
- `toBeEnabled()` / `toBeDisabled()`
- `toHaveText()` / `toContainText()`
- `toHaveValue()` - For form inputs
- `toHaveCount()` - For lists
- `toHaveAttribute()`

### ❌ DON'T

- `expect(await locator.isVisible()).toBe(true)` - No auto-retry
- Generic assertions without await
- Checking element existence before interaction (redundant)

**Example:** `.claude/docs/examples/playwright/assertions.ts`

---

## Test Isolation

### ✅ DO

1. **Each test starts fresh** - Use beforeEach for setup
2. **Clean state between tests** - Create data in test, clean in afterEach
3. **Independent tests** - Order doesn't matter
4. **Parallel-safe** - Tests can run concurrently

### ❌ DON'T

- Depend on test execution order
- Share state between tests
- Use global variables modified across tests
- Assume data from previous tests exists

**Example:** `.claude/docs/examples/playwright/isolation.ts`

---

## Actionability and Auto-Waiting

**Playwright automatically waits** for these checks before actions:

1. **Attached** - Element is in DOM
2. **Visible** - Has non-empty bounding box, not hidden
3. **Stable** - Not animating (same position for 2 frames)
4. **Receives Events** - Not covered by other elements
5. **Enabled** - Not disabled (for buttons/inputs)
6. **Editable** - Not readonly (for inputs)

**Key Insight:** Trust Playwright's auto-waiting. Don't add manual waits before actions.

**Examples:** See `.claude/docs/examples/playwright/waiting.good.ts` for patterns

---

## Network Handling

### ✅ DO

1. **Mock API for predictable tests** - Use `page.route()` to fulfill requests
2. **Wait for specific response** - Use `waitForResponse()` with URL patterns
3. **Intercept and modify** - Modify headers, block requests, change responses

### ❌ DON'T

- Wait for `networkidle` - Includes unrelated requests (analytics, ads)
- Rely on timing for API responses
- Test without mocking external dependencies

**Example:** `.claude/docs/examples/playwright/network.ts`

---

## Test Structure and Organization

### ✅ DO

1. **Use Page Object Model for complex pages** - Encapsulate locators and actions
2. **Group related tests** - Use `test.describe()` for organization
3. **Parameterize tests** - Use `.forEach()` to reduce duplication
4. **Extract helpers** - Reusable functions for common operations

### ❌ DON'T

- Duplicate test code - extract common flows
- Create god-like page objects with all page methods
- Mix test data with test logic
- Use vague test names like "test 1", "check button"

**Example:** `.claude/docs/examples/playwright/structure.ts`

---

## Common Anti-Patterns

### Critical Anti-Patterns to Avoid

1. **Explicit Waits** - Never use `waitForTimeout()`
2. **Manual State Checking** - Use auto-retrying assertions instead of polling loops
3. **Brittle Selectors** - Use semantic locators, not CSS classes
4. **Not Using Strict Mode** - Be specific with selectors
5. **Testing Implementation Details** - Test user-visible behavior
6. **Race Conditions** - Use auto-retrying assertions
7. **Redundant Waits** - Trust Playwright's auto-waiting
8. **networkidle Wait** - Wait for specific elements instead
9. **Non-Retrying Assertions** - Always use web-first assertions
10. **Not Mocking APIs** - Mock for speed and reliability

**See:** `.claude/docs/examples/playwright/antipatterns.ts` for side-by-side comparisons

---

## Performance Optimization

### ✅ DO

1. **Run tests in parallel** (default in Playwright)
2. **Use test.describe.configure({ mode: 'parallel' })** for independent tests
3. **Mock network requests** to avoid real API delays
4. **Reuse authentication state** with storage state
5. **Use smaller expect timeouts** for fast-failing scenarios
6. **Block unnecessary resources** - Images, analytics, tracking
7. **Setup via API** - Use request context for fast data creation

### ❌ DON'T

- Use serial mode unless absolutely necessary
- Make real HTTP requests for external services
- Re-authenticate in every test
- Use long global timeouts
- Create test data via UI (slow)

**Example:** `.claude/docs/examples/playwright/performance.ts`

---

## Flakiness Prevention

### Root Causes of Flaky Tests

1. **Race conditions** - Not waiting for async operations
2. **Timing dependencies** - Using hardcoded waits
3. **Test pollution** - Shared state between tests
4. **Non-deterministic data** - Relying on external data
5. **Browser state** - Not resetting between tests

### Solutions

1. **Always use auto-retrying assertions**
2. **Ensure test isolation** with beforeEach/afterEach
3. **Mock external dependencies**
4. **Use stable locators** (role, label, test-id)
5. **Configure retries** for legitimately flaky scenarios (set to 1-2 max)

---

## Deterministic Test Data - CRITICAL for Visual Regression

### ❌ NEVER USE in Mocks/Tests/Storybook Stories

- `Date.now()` - Changes every millisecond
- `new Date()` - Without fixed value
- `Math.random()` - Non-deterministic
- `crypto.randomUUID()` - Generates new IDs
- Any dynamic/random values

**WHY:** Visual regression tests compare screenshots pixel-by-pixel. Non-deterministic data produces different values each run, causing screenshots to differ even when UI hasn't changed. This breaks visual regression completely.

### ✅ ALWAYS USE Fixed Values

- Fixed timestamps: `1705315800000`
- Fixed ISO dates: `'2024-01-15T10:30:00.000Z'`
- Fixed IDs: `'user-001'`, `'item-123'`
- Fixed numbers: `42`, `85`, `100`
- Shared fixtures with deterministic data

**APPLIES TO:**

- Playwright tests with screenshots
- Visual regression tests
- Storybook stories
- Mock API data
- Test fixtures

**Example:** `.claude/docs/examples/playwright/deterministic-data.ts`

---

## Quick Reference: Common Scenarios

**See:** `.claude/docs/examples/playwright/quick-reference.ts`

Patterns for:

- Form submission
- List interactions
- Conditional elements
- Navigation
- Modal interactions
- Table interactions
- File upload
- Dropdown selection
- Checkbox and radio buttons

---

## Configuration Best Practices

**See:** `.claude/docs/examples/playwright/config.example.ts`

Key configuration recommendations:

- Test timeout: 30s (reasonable for most tests)
- Assertion timeout: 5s (for auto-retrying assertions)
- Retries: Only in CI (0 locally, 1 in CI)
- Workers: Limit in CI to avoid resource contention
- Trace: 'on-first-retry' (not always)
- Video: 'retain-on-failure' (not always)
- Screenshot: 'only-on-failure'

---

## Summary for Agents

**When writing tests:**

1. Use semantic locators (role, label, text) over CSS/XPath
2. Trust Playwright's auto-waiting - avoid manual waits
3. Use auto-retrying assertions (`toBeVisible`, `toHaveText`, etc.)
4. Ensure test isolation - each test starts fresh
5. Mock network requests for speed and reliability
6. Never use `waitForTimeout` or `waitForLoadState('networkidle')`
7. Wait for specific UI elements, not page load states
8. Keep tests focused on user-visible behavior

**Result:** Fast, reliable, anti-fragile tests that don't break on UI changes.

---

## Examples Index

All code examples are in `.claude/docs/examples/playwright/`:

- `locators.good.ts` - Semantic locator patterns
- `waiting.bad.ts` - Anti-patterns to avoid
- `waiting.good.ts` - Correct waiting strategies
- `assertions.ts` - Auto-retrying assertions
- `isolation.ts` - Test independence patterns
- `network.ts` - API mocking and interception
- `structure.ts` - Page Object Model and organization
- `performance.ts` - Optimization techniques
- `antipatterns.ts` - Common mistakes with fixes
- `quick-reference.ts` - Copy-paste ready patterns
- `config.example.ts` - Configuration templates
- `deterministic-data.ts` - Avoiding Date.now() and non-deterministic data
- `README.md` - Examples overview
