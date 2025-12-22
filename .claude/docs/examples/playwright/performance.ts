import { Page, expect, test } from '@playwright/test';

/**
 * PERFORMANCE OPTIMIZATION BEST PRACTICES
 *
 * Make tests fast and efficient without sacrificing reliability.
 */

// ==================== PARALLEL EXECUTION ====================

test.describe('Parallel Tests - Default Behavior', () => {
	// ✅ GOOD: Tests run in parallel by default
	test('test 1 - independent', async ({ page }) => {
		await page.goto('/page1');
		await expect(page.getByRole('heading')).toBeVisible();
	});

	test('test 2 - independent', async ({ page }) => {
		await page.goto('/page2');
		await expect(page.getByRole('heading')).toBeVisible();
	});

	test('test 3 - independent', async ({ page }) => {
		await page.goto('/page3');
		await expect(page.getByRole('heading')).toBeVisible();
	});

	// All three run concurrently - much faster!
});

test.describe('Serial Tests - When Needed', () => {
	// Use serial mode only when tests MUST run in order
	test.describe.configure({ mode: 'serial' });

	let sharedState: string;

	test('step 1 - setup', async ({ page }) => {
		await page.goto('/setup');
		sharedState = 'initialized';
	});

	test('step 2 - use setup', async ({ page }) => {
		// This test needs step 1 to complete first
		await page.goto('/use-setup');
		// Use sharedState
	});

	// NOTE: Try to avoid this pattern - prefer independent tests
});

// ==================== AUTHENTICATION OPTIMIZATION ====================

test.describe('Reuse Authentication State', () => {
	// ✅ GOOD: Save auth state once, reuse across tests
	test.use({
		storageState: 'auth-state.json', // Pre-authenticated
	});

	test('protected page 1', async ({ page }) => {
		// No login needed - already authenticated
		await page.goto('/protected/page1');
		await expect(page.getByRole('heading')).toBeVisible();
	});

	test('protected page 2', async ({ page }) => {
		// No login needed - already authenticated
		await page.goto('/protected/page2');
		await expect(page.getByRole('heading')).toBeVisible();
	});

	// BENEFITS:
	// - No repeated login in each test
	// - Much faster test execution
	// - Still isolated (separate browser contexts)
});

// Setup authentication once in global setup
// Example: tests/global-setup.ts
async function globalSetup() {
	// Create auth-state.json
	// const browser = await chromium.launch();
	// const page = await browser.newPage();
	// await page.goto('/login');
	// await page.getByLabel('Email').fill('test@example.com');
	// await page.getByLabel('Password').fill('password');
	// await page.getByRole('button', { name: 'Sign In' }).click();
	// await page.context().storageState({ path: 'auth-state.json' });
	// await browser.close();
}

// ==================== API MOCKING FOR SPEED ====================

test.describe('Mock APIs for Speed', () => {
	test('✅ instant API responses', async ({ page }) => {
		// GOOD: Mock instead of waiting for real API
		await page.route('**/api/**', route =>
			route.fulfill({
				status: 200,
				body: JSON.stringify({ data: 'instant' }),
			})
		);

		await page.goto('/dashboard');
		// No network latency - instant response

		await expect(page.getByText('instant')).toBeVisible();

		// BENEFITS:
		// - No network delay
		// - No external dependency
		// - Predictable timing
	});

	test('❌ slow without mocking', async ({ page }) => {
		// BAD: Waiting for real API
		await page.goto('/dashboard'); // Waits for slow API

		// Takes 2-3 seconds instead of milliseconds
		await expect(page.getByRole('heading')).toBeVisible();
	});
});

// ==================== RESOURCE BLOCKING ====================

test.describe('Block Unnecessary Resources', () => {
	test('✅ block images and tracking', async ({ page }) => {
		// GOOD: Block resources that slow down tests
		await page.route('**/*.{png,jpg,jpeg,gif,svg,webp}', route => route.abort());
		await page.route('**/*analytics*.js', route => route.abort());
		await page.route('**/*tracking*.js', route => route.abort());
		await page.route('**/*ads*.js', route => route.abort());

		await page.goto('/heavy-page');

		// BENEFITS:
		// - Faster page load
		// - Less network traffic
		// - More reliable (no third-party failures)
	});
});

// ==================== SMART WAITING ====================

test.describe('Optimize Waiting Strategies', () => {
	test('✅ wait for specific element, not page load', async ({ page }) => {
		// GOOD: Wait for what you need
		await page.goto('/app');
		await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

		// Start interacting immediately, don't wait for everything
		await page.getByRole('button', { name: 'Action' }).click();

		// BENEFITS:
		// - Proceeds as soon as needed element is ready
		// - Doesn't wait for unrelated resources
	});

	test.skip('❌ wait for networkidle', async ({ page }) => {
		// BAD: Waits for ALL network requests
		await page.goto('/app');
		await page.waitForLoadState('networkidle');

		// PROBLEMS:
		// - Waits for ads, analytics, everything
		// - Much slower than needed
		// - Unreliable
	});

	test('✅ custom shorter timeouts for fast operations', async ({ page }) => {
		// GOOD: Reduce timeout for operations that should be instant
		await page.goto('/app');

		// This should be instant - fail fast if not
		await expect(page.getByRole('heading')).toBeVisible({ timeout: 1000 });

		// BENEFITS:
		// - Fails fast if something is wrong
		// - Doesn't waste time waiting
	});
});

// ==================== TEST DATA SETUP ====================

test.describe('Optimize Test Data Setup', () => {
	test('✅ create data via API, not UI', async ({ page, request }) => {
		// GOOD: API setup is much faster than UI
		const start = Date.now();

		// Create 10 items via API - fast
		for (let i = 1; i <= 10; i++) {
			await request.post('/api/items', {
				data: { name: `Item ${i}` },
			});
		}

		const apiTime = Date.now() - start;
		console.log(`API setup: ${apiTime}ms`);

		// Now test UI
		await page.goto('/items');
		await expect(page.getByRole('listitem')).toHaveCount(10);

		// BENEFITS:
		// - Much faster than clicking 10 times
		// - More reliable
		// - Focuses test on UI, not setup
	});

	test.skip('❌ create data via UI - slow', async ({ page }) => {
		// BAD: UI operations are slow
		const start = Date.now();

		await page.goto('/items');
		for (let i = 1; i <= 10; i++) {
			await page.getByRole('button', { name: 'Add' }).click();
			await page.getByLabel('Name').fill(`Item ${i}`);
			await page.getByRole('button', { name: 'Save' }).click();
			await page.getByRole('dialog').waitFor({ state: 'hidden' });
		}

		const uiTime = Date.now() - start;
		console.log(`UI setup: ${uiTime}ms`);

		// PROBLEMS:
		// - 10x slower than API
		// - More points of failure
		// - Not testing what matters
	});
});

// ==================== EFFICIENT LOCATORS ====================

test.describe('Locator Performance', () => {
	test('✅ efficient locators', async ({ page }) => {
		await page.goto('/app');

		// GOOD: Specific, semantic locators
		await page.getByRole('button', { name: 'Submit' }).click();
		await page.getByLabel('Email').fill('test@example.com');

		// Fast to evaluate
	});

	test.skip('❌ slow locators', async ({ page }) => {
		await page.goto('/app');

		// BAD: Complex XPath is slower
		await page
			.locator('//div[@class="container"]//form//button[contains(text(), "Submit")]')
			.click();

		// Slower to evaluate
	});
});

// ==================== PARALLEL TEST SHARDING ====================

// In playwright.config.ts:
// export default defineConfig({
//   workers: process.env.CI ? 2 : undefined,
//   // Run tests in shards across multiple machines
//   shard: process.env.SHARD ? {
//     current: parseInt(process.env.SHARD_INDEX),
//     total: parseInt(process.env.SHARD_TOTAL)
//   } : undefined
// });

// Run with: SHARD_INDEX=1 SHARD_TOTAL=4 npx playwright test

// ==================== AVOID RE-RUNNING UNCHANGED TESTS ====================

test.describe('Optimize CI Execution', () => {
	// Use test.describe.configure with repeat or retries carefully

	test('✅ normal test', async ({ page }) => {
		await page.goto('/app');
		await expect(page.getByRole('heading')).toBeVisible();
	});

	// Don't use high retry values globally
	// Only retry legitimately flaky tests
});

// ==================== TRACE AND VIDEO ONLY ON FAILURE ====================

// In playwright.config.ts:
// export default defineConfig({
//   use: {
//     trace: 'on-first-retry', // Not 'on' - generates only when needed
//     video: 'retain-on-failure', // Not 'on' - keeps only failed tests
//     screenshot: 'only-on-failure',
//   },
// });

// ==================== BEST PRACTICES SUMMARY ====================

test.describe('Performance Summary', () => {
	test('✅ optimized test', async ({ page, request }) => {
		// 1. Mock unnecessary APIs
		await page.route('**/analytics/**', route => route.abort());
		await page.route('**/*.{png,jpg}', route => route.abort());

		// 2. Setup via API (fast)
		await request.post('/api/setup', {
			data: { scenario: 'test' },
		});

		// 3. Navigate and verify
		await page.goto('/app');

		// 4. Wait for specific element (not networkidle)
		await expect(page.getByRole('heading')).toBeVisible();

		// 5. Perform test
		await page.getByRole('button', { name: 'Action' }).click();
		await expect(page.getByText('Success')).toBeVisible();

		// RESULT: Fast, focused, efficient test
	});
});

/**
 * KEY TAKEAWAYS:
 *
 * ✅ DO:
 * - Run tests in parallel (default)
 * - Reuse authentication state
 * - Mock APIs for speed and reliability
 * - Block unnecessary resources (images, tracking, ads)
 * - Setup test data via API, not UI
 * - Wait for specific elements, not page load states
 * - Use efficient semantic locators
 * - Only capture traces/videos on failure
 * - Use test sharding for large suites
 * - Set appropriate timeouts (shorter for fast operations)
 *
 * ❌ DON'T:
 * - Use serial mode unless absolutely necessary
 * - Re-authenticate in every test
 * - Wait for networkidle
 * - Create test data via UI (slow)
 * - Use complex XPath locators
 * - Use waitForTimeout
 * - Capture traces/videos for all tests
 * - Set unnecessarily long global timeouts
 *
 * PERFORMANCE TARGETS:
 * - Simple test: < 2 seconds
 * - Complex test: < 10 seconds
 * - Full suite: Aim for < 5 minutes (use sharding if larger)
 *
 * RESULT: Tests that run quickly without sacrificing reliability
 */
