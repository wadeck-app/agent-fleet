import { Page, expect, test } from '@playwright/test';

/**
 * CORRECT WAITING STRATEGIES
 *
 * Always wait for specific conditions, not arbitrary time periods.
 * Leverage Playwright's auto-waiting and auto-retrying assertions.
 */

test.describe('Good Waiting Practices', () => {
	let page: Page;

	test.beforeEach(async ({ page: p }) => {
		page = p;
		await page.goto('/dashboard');
	});

	test('✅ Wait using auto-retrying assertions', async () => {
		// GOOD: Assertion retries until condition is met or timeout
		await page.click('button#load-data');
		await expect(page.locator('.result')).toHaveText('Data loaded');

		// BENEFITS:
		// - Fast: proceeds as soon as condition is met
		// - Reliable: retries automatically
		// - Clear intent: we're waiting for specific text
	});

	test('✅ Wait for element visibility', async () => {
		// GOOD: Wait for specific element to appear
		await page.click('button#show-modal');
		await expect(page.locator('.modal')).toBeVisible();
		await page.locator('.modal button#confirm').click();

		// Even better: Playwright auto-waits, so this is sufficient
		await page.click('button#show-modal');
		await page.locator('.modal button#confirm').click(); // Auto-waits for visibility
	});

	test('✅ Wait for element to disappear', async () => {
		// GOOD: Wait for loading spinner to disappear
		await page.click('button#fetch');
		await expect(page.getByRole('progressbar')).toBeHidden();
		await expect(page.locator('.result')).toBeVisible();
	});

	test('✅ Wait for specific network response', async () => {
		// GOOD: Wait for specific API call
		const responsePromise = page.waitForResponse(
			resp => resp.url().includes('/api/users') && resp.status() === 200
		);

		await page.click('button#load-users');
		const response = await responsePromise;
		expect(response.ok()).toBeTruthy();

		// Then assert UI reflects the data
		await expect(page.getByRole('listitem')).toHaveCount(5);
	});

	test('✅ Wait for navigation', async () => {
		// GOOD: Wait for URL change
		await page.click('a[href="/profile"]');
		await expect(page).toHaveURL(/.*profile/);
		await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
	});

	test('✅ Wait for element state', async () => {
		// GOOD: Wait for element to be enabled
		await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();

		// Wait for input to be editable
		const input = page.getByLabel('Username');
		await expect(input).toBeEditable();
		await input.fill('testuser');
	});

	test('✅ Wait for count changes', async () => {
		// GOOD: Wait for list to populate
		await page.click('button#load-items');
		await expect(page.getByRole('listitem')).toHaveCount(10);

		// Or wait for at least some items
		await expect(page.getByRole('listitem')).not.toHaveCount(0);
	});

	test('✅ Wait for attribute changes', async () => {
		// GOOD: Wait for class or attribute to change
		await page.click('button#toggle-theme');
		await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
	});

	test('✅ Wait for specific element using waitFor()', async () => {
		// GOOD: Explicit wait for element state
		const modal = page.locator('.modal');
		await page.click('button#show-modal');
		await modal.waitFor({ state: 'visible' });

		// When done with modal
		await modal.getByRole('button', { name: 'Close' }).click();
		await modal.waitFor({ state: 'hidden' });
	});

	test('✅ Wait for multiple conditions with expect.poll()', async () => {
		// GOOD: Poll for custom conditions
		await expect
			.poll(async () => {
				const items = await page.getByRole('listitem').count();
				const loading = await page.locator('.spinner').isVisible();
				return items > 0 && !loading;
			})
			.toBeTruthy();
	});

	test('✅ Handle slow operations with custom timeout', async () => {
		// GOOD: Increase timeout for legitimately slow operations
		await page.click('button#generate-report');

		await expect(page.getByText('Report generated')).toBeVisible({
			timeout: 30_000, // 30 seconds for report generation
		});

		// Still waiting for specific condition, just with longer timeout
	});

	test('✅ Wait for stable element (not animating)', async () => {
		// GOOD: Playwright automatically waits for element to stop moving
		await page.click('button#show-animated-menu');

		// No need for manual wait - Playwright waits for animation to complete
		await page.locator('.menu-item').first().click();
	});

	test('✅ Chain actions - rely on auto-waiting', async () => {
		// GOOD: Each action auto-waits, no manual waits needed
		await page.getByLabel('Email').fill('test@example.com');
		await page.getByLabel('Password').fill('password123');
		await page.getByRole('button', { name: 'Sign In' }).click();
		await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

		// No timeouts needed! Each step waits for previous to complete
	});

	test('✅ Wait for request/response pairs', async () => {
		// GOOD: Monitor both request and response
		await page.route('**/api/save', route =>
			route.fulfill({
				status: 200,
				body: JSON.stringify({ success: true }),
			})
		);

		await page.click('button#save');
		await expect(page.getByText('Saved successfully')).toBeVisible();
	});

	test('✅ Complex scenario with proper waits', async () => {
		// GOOD: Clear sequence with specific waits

		// 1. Open form
		await page.getByRole('button', { name: 'Add Item' }).click();
		await expect(page.locator('.modal')).toBeVisible();

		// 2. Fill form
		await page.getByLabel('Name').fill('New Item');

		// 3. Submit and wait for confirmation
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Item added')).toBeVisible();

		// 4. Wait for modal to close
		await expect(page.locator('.modal')).toBeHidden();

		// 5. Verify item appears in list
		await expect(page.getByText('New Item')).toBeVisible();

		// Clear, predictable, fast, reliable
	});
});

/**
 * KEY PRINCIPLES:
 *
 * 1. Wait for SPECIFIC CONDITIONS, not arbitrary time
 * 2. Use auto-retrying assertions (toBeVisible, toHaveText, etc.)
 * 3. Trust Playwright's auto-waiting for actions
 * 4. Wait for network responses only when UI depends on them
 * 5. Never use waitForTimeout or waitForLoadState('networkidle')
 * 6. Increase timeout only for legitimately slow operations
 * 7. Each wait should have clear intent
 *
 * RESULT: Fast, reliable, non-flaky tests
 */
