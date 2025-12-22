# Playwright Examples

This folder contains comprehensive code examples demonstrating Playwright best practices.

## Files Overview

### Core Patterns

- **locators.good.ts** - Locator strategy examples (role, label, text, test-id) with anti-patterns
- **waiting.bad.ts** - Anti-patterns showing what NOT to do (waitForTimeout, networkidle, etc.)
- **waiting.good.ts** - Correct waiting strategies using auto-retrying assertions
- **assertions.ts** - Auto-retrying web-first assertions vs non-retrying assertions
- **isolation.ts** - Test isolation patterns, beforeEach/afterEach, independent tests

### Advanced Patterns

- **network.ts** - API mocking, request interception, waiting for responses
- **structure.ts** - Page Object Model, test organization, parameterization, helpers
- **performance.ts** - Parallel execution, auth reuse, resource blocking, optimization

### Quick Reference

- **antipatterns.ts** - Common mistakes with side-by-side corrections
- **quick-reference.ts** - Copy-paste ready patterns for common scenarios
- **config.example.ts** - Configuration templates and best practices
- **deterministic-data.ts** - How to avoid Date.now() and non-deterministic data

## Quick Reference

### Use These Examples When:

- **Writing new tests** → Start with `structure.ts` for organization patterns
- **Tests are flaky** → Check `waiting.good.ts` and `assertions.ts`
- **Tests are slow** → Review `performance.ts`
- **Need better locators** → Reference `locators.good.ts`
- **Working with APIs** → See `network.ts`
- **Tests interfere with each other** → Study `isolation.ts`
- **Need quick patterns** → Use `quick-reference.ts`
- **Visual regression issues** → Review `deterministic-data.ts`

### Common Mistakes (See Anti-patterns)

From `waiting.bad.ts` and `antipatterns.ts`:

- ❌ `await page.waitForTimeout(3000)`
- ❌ `await page.waitForLoadState('networkidle')`
- ❌ Manual polling loops
- ❌ CSS class selectors
- ❌ Non-retrying assertions
- ❌ **Using `Date.now()` in mocks/tests** - Breaks visual regression

Use these instead (from `waiting.good.ts`):

- ✅ `await expect(element).toBeVisible()`
- ✅ `await page.waitForResponse('**/api/data')`
- ✅ Trust Playwright's auto-waiting
- ✅ Semantic locators (role, label)
- ✅ Auto-retrying assertions
- ✅ **Fixed dates in mocks/stories** - Deterministic visual tests

## Integration with Main Documentation

These examples are referenced from `../PLAYWRIGHT_WOW.md`. The main doc provides:

- Conceptual guidance
- Quick reference
- Anti-pattern warnings
- Index of all examples

These example files provide:

- Runnable code
- Detailed comments
- Side-by-side good/bad comparisons

## Running Examples

These are example files for reference, not runnable tests. To use:

1. Copy patterns into your actual test files
2. Adapt to your application's specifics
3. Follow the ✅ DO patterns, avoid the ❌ DON'T patterns

## Key Principles (All Files)

1. **Semantic locators** - getByRole, getByLabel over CSS/XPath
2. **Auto-retrying assertions** - toBeVisible, toHaveText, etc.
3. **No arbitrary waits** - Never use waitForTimeout
4. **Test isolation** - Each test independent
5. **Mock external APIs** - Fast, reliable, predictable
6. **Trust auto-waiting** - Playwright waits for actionability
7. **Deterministic data** - Never use Date.now() in mocks/tests/stories

Result: Fast, reliable, anti-fragile tests
