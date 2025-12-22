import { Page, expect, test } from '@playwright/test';

/**
 * TEST ISOLATION BEST PRACTICES
 *
 * Each test must be independent and able to run in any order.
 * Tests should not rely on state from other tests.
 */

test.describe('Proper Test Isolation', () => {
	// ✅ GOOD: Each test gets fresh state via beforeEach
	test.beforeEach(async ({ page }) => {
		// Navigate to starting page
		await page.goto('/app');

		// Set up test data
		await page.evaluate(() => {
			localStorage.setItem('testData', JSON.stringify({ items: [] }));
		});

		// Or authenticate if needed
		// await page.context().addCookies([...authCookies]);
	});

	test.afterEach(async ({ page }) => {
		// ✅ GOOD: Clean up after test
		await page.evaluate(() => {
			localStorage.clear();
			sessionStorage.clear();
		});
	});

	test('test 1 - can add item', async ({ page }) => {
		// This test is independent
		await page.getByRole('button', { name: 'Add' }).click();
		await expect(page.getByRole('listitem')).toHaveCount(1);
	});

	test('test 2 - can delete item', async ({ page }) => {
		// This test doesn't depend on test 1
		// Creates its own data
		await page.getByRole('button', { name: 'Add' }).click();
		await expect(page.getByRole('listitem')).toHaveCount(1);

		await page.getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByRole('listitem')).toHaveCount(0);
	});

	test('test 3 - validation works', async ({ page }) => {
		// This test is also independent
		await page.getByRole('button', { name: 'Submit' }).click();
		await expect(page.getByText('Required field')).toBeVisible();
	});
});

test.describe('Test Isolation with Fixtures', () => {
	// ✅ GOOD: Create custom fixtures for common setup
	test.beforeEach(async ({ page }) => {
		await page.goto('/dashboard');
	});

	test('authenticated user can view dashboard', async ({ page }) => {
		// Test has fresh context, doesn't affect others
		await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
	});

	test('user can change settings', async ({ page }) => {
		await page.getByRole('link', { name: 'Settings' }).click();
		await page.getByLabel('Theme').selectOption('dark');
		await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
	});
});

test.describe('Test Isolation with Storage State', () => {
	// ✅ GOOD: Reuse auth state across tests (but still isolated contexts)
	test.use({
		storageState: 'auth-state.json', // Shared auth, but isolated browser contexts
	});

	test('can access protected page', async ({ page }) => {
		await page.goto('/protected');
		await expect(page.getByRole('heading')).toContainText('Protected Content');
	});

	test('can perform action', async ({ page }) => {
		await page.goto('/action');
		await page.getByRole('button', { name: 'Do Action' }).click();
		await expect(page.getByText('Action completed')).toBeVisible();
	});

	// Each test gets its own browser context with auth, but is still isolated
});

test.describe('Creating Test Data Independently', () => {
	test('test 1 - creates and uses own data', async ({ page, request }) => {
		// ✅ GOOD: Create data via API
		const response = await request.post('/api/items', {
			data: { name: 'Test Item 1' },
		});
		const item = await response.json();

		await page.goto('/items');
		await expect(page.getByText('Test Item 1')).toBeVisible();

		// Clean up own data
		await request.delete(`/api/items/${item.id}`);
	});

	test('test 2 - creates and uses different data', async ({ page, request }) => {
		// ✅ GOOD: Doesn't rely on test 1's data
		await request.post('/api/items', {
			data: { name: 'Test Item 2' },
		});

		await page.goto('/items');
		await expect(page.getByText('Test Item 2')).toBeVisible();

		// Can run in any order, still works
	});
});

test.describe('Parallel-Safe Tests', () => {
	// ✅ GOOD: These tests can run in parallel

	test('user A workflow', async ({ page }) => {
		await page.goto('/app');
		await page.getByLabel('Username').fill('userA');
		await page.getByRole('button', { name: 'Login' }).click();
		await expect(page.getByText('Welcome, userA')).toBeVisible();
	});

	test('user B workflow', async ({ page }) => {
		await page.goto('/app');
		await page.getByLabel('Username').fill('userB');
		await page.getByRole('button', { name: 'Login' }).click();
		await expect(page.getByText('Welcome, userB')).toBeVisible();
	});

	// These don't interfere with each other - separate browser contexts
});

// ==================== BAD PRACTICES - AVOID ====================

test.describe.skip('BAD: Tests with Shared State', () => {
	// ❌ BAD: Shared state between tests
	let sharedItemId: string;

	test('test 1 - creates item', async ({ page }) => {
		await page.goto('/app');
		await page.getByRole('button', { name: 'Add' }).click();
		sharedItemId = (await page.locator('.item').getAttribute('data-id')) || '';
	});

	test('test 2 - uses item from test 1', async ({ page }) => {
		// ❌ BAD: Depends on test 1 running first
		await page.goto(`/item/${sharedItemId}`);
		await expect(page.getByRole('heading')).toBeVisible();

		// PROBLEMS:
		// - Fails if run in different order
		// - Fails if test 1 is skipped
		// - Can't run in parallel
	});
});

test.describe.skip('BAD: Sequential Dependencies', () => {
	test('step 1 - setup', async ({ page }) => {
		await page.goto('/app');
		await page.evaluate(() => {
			// @ts-ignore
			window.testState = { step: 1 };
		});
	});

	test('step 2 - continue', async ({ page }) => {
		// ❌ BAD: Assumes step 1 ran
		await page.goto('/app');
		const state = await page.evaluate(() => {
			// @ts-ignore
			return window.testState;
		});
		// This will fail - each test gets fresh context!

		// PROBLEMS:
		// - Browser context is isolated
		// - window.testState doesn't persist
		// - Tests can't share state this way
	});
});

test.describe.skip('BAD: Relying on Test Order', () => {
	test('1-create', async ({ page }) => {
		await page.goto('/app');
		await page.getByRole('button', { name: 'Create' }).click();
	});

	test('2-edit', async ({ page }) => {
		// ❌ BAD: Assumes "1-create" ran first
		await page.goto('/app');
		await page.getByRole('button', { name: 'Edit' }).click();

		// PROBLEMS:
		// - Playwright runs tests in parallel by default
		// - Test order is not guaranteed
		// - Fragile and unreliable
	});
});

test.describe.skip('BAD: Not Cleaning Up', () => {
	test('create many items', async ({ page }) => {
		await page.goto('/app');

		for (let i = 0; i < 100; i++) {
			await page.getByRole('button', { name: 'Add' }).click();
		}

		// ❌ BAD: Doesn't clean up
		// PROBLEMS:
		// - Pollutes database/storage
		// - Slows down subsequent tests
		// - May cause later tests to fail
	});
});

test.describe.skip('BAD: Using Global Variables', () => {
	// ❌ BAD: Global state across tests
	let globalCounter = 0;

	test('increment counter - test A', async ({ page }) => {
		globalCounter++;
		await page.goto('/app');
		// Test logic
	});

	test('check counter - test B', async ({ page }) => {
		// ❌ BAD: Depends on test A running first
		expect(globalCounter).toBe(1);

		// PROBLEMS:
		// - Order-dependent
		// - Can't run in parallel
		// - Fragile
	});
});

// ==================== BEST PRACTICES SUMMARY ====================

test.describe('Best Practices Summary', () => {
	test('✅ Self-contained test', async ({ page, request }) => {
		// 1. Setup: Create required data
		await request.post('/api/setup', {
			data: { testScenario: 'scenario1' },
		});

		// 2. Execute: Run test
		await page.goto('/app');
		await page.getByRole('button', { name: 'Action' }).click();
		await expect(page.getByText('Success')).toBeVisible();

		// 3. Cleanup: Remove data
		await request.post('/api/cleanup', {
			data: { testScenario: 'scenario1' },
		});

		// This test:
		// - Creates own data
		// - Doesn't depend on other tests
		// - Cleans up after itself
		// - Can run in any order
		// - Can run in parallel
	});
});

/**
 * KEY TAKEAWAYS:
 *
 * ✅ DO:
 * - Use beforeEach/afterEach for setup and cleanup
 * - Create test data independently in each test
 * - Clean up after yourself
 * - Make tests runnable in any order
 * - Use isolated browser contexts (Playwright default)
 * - Use storage state for shared auth (still isolated contexts)
 *
 * ❌ DON'T:
 * - Share state between tests (global variables, etc.)
 * - Depend on test execution order
 * - Rely on data created by other tests
 * - Pollute database/storage without cleanup
 * - Use serial mode unless absolutely necessary
 *
 * RESULT: Tests that can run independently, in parallel, in any order
 */
