import { Page, expect, test } from '@playwright/test';

/**
 * ASSERTION BEST PRACTICES
 *
 * Always use auto-retrying web-first assertions.
 * They wait for conditions to be met before failing.
 */

test.describe('Auto-Retrying Assertions - CORRECT', () => {
	let page: Page;

	test.beforeEach(async ({ page: p }) => {
		page = p;
		await page.goto('/app');
	});

	test('✅ Visibility assertions', async () => {
		// GOOD: Waits until element is visible
		await expect(page.getByRole('heading')).toBeVisible();

		// Wait until element is hidden
		await expect(page.locator('.spinner')).toBeHidden();
		await expect(page.locator('.spinner')).not.toBeVisible();
	});

	test('✅ Text content assertions', async () => {
		// GOOD: Waits for exact text match
		await expect(page.getByRole('status')).toHaveText('Ready');

		// Contains text
		await expect(page.locator('.message')).toContainText('Success');

		// Multiple elements
		await expect(page.getByRole('listitem')).toHaveText(['Item 1', 'Item 2', 'Item 3']);
	});

	test('✅ Form input assertions', async () => {
		// GOOD: Wait for input value
		await expect(page.getByLabel('Username')).toHaveValue('testuser');

		// Empty value
		await expect(page.getByLabel('Password')).toHaveValue('');

		// Checkbox/radio state
		await expect(page.getByLabel('Remember me')).toBeChecked();
		await expect(page.getByLabel('Remember me')).not.toBeChecked();
	});

	test('✅ Attribute assertions', async () => {
		// GOOD: Wait for attribute
		await expect(page.locator('button')).toHaveAttribute('disabled', '');
		await expect(page.locator('input')).toHaveAttribute('type', 'email');
		await expect(page.locator('.theme')).toHaveClass(/dark/);
	});

	test('✅ Count assertions', async () => {
		// GOOD: Wait for specific count
		await expect(page.getByRole('listitem')).toHaveCount(10);

		// At least one element
		await expect(page.getByRole('row')).not.toHaveCount(0);
	});

	test('✅ URL and title assertions', async () => {
		// GOOD: Wait for navigation
		await expect(page).toHaveURL(/.*dashboard/);
		await expect(page).toHaveURL('https://example.com/dashboard');
		await expect(page).toHaveTitle('Dashboard - My App');
	});

	test('✅ State assertions', async () => {
		// GOOD: Wait for element states
		await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();
		await expect(page.getByRole('button', { name: 'Loading' })).toBeDisabled();
		await expect(page.getByLabel('Email')).toBeEditable();
		await expect(page.getByLabel('Readonly')).not.toBeEditable();
	});

	test('✅ Attached/Detached assertions', async () => {
		// GOOD: Wait for element in/out of DOM
		await expect(page.locator('.modal')).toBeAttached();
		await page.getByRole('button', { name: 'Close' }).click();
		await expect(page.locator('.modal')).not.toBeAttached();
	});

	test('✅ Custom timeout for slow operations', async () => {
		// GOOD: Override timeout for specific assertion
		await expect(page.getByText('Report generated')).toBeVisible({
			timeout: 30_000, // 30 seconds
		});
	});

	test('✅ Soft assertions - continue on failure', async () => {
		// GOOD: Check multiple things without stopping
		await expect.soft(page.getByRole('heading')).toHaveText('Dashboard');
		await expect.soft(page.locator('.user-name')).toContainText('John');
		await expect.soft(page.getByRole('listitem')).toHaveCount(5);

		// Test continues even if above fail, reports all failures at end
	});

	test('✅ Negation with not', async () => {
		// GOOD: Assert opposite condition
		await expect(page.locator('.error')).not.toBeVisible();
		await expect(page.getByLabel('Email')).not.toHaveValue('');
		await expect(page.getByRole('button')).not.toBeDisabled();
	});

	test('✅ expect.poll() for custom conditions', async () => {
		// GOOD: Poll for complex conditions
		await expect
			.poll(async () => {
				const count = await page.getByRole('row').count();
				return count;
			})
			.toBeGreaterThan(5);

		// Custom async check
		await expect
			.poll(async () => {
				const text = await page.locator('.status').textContent();
				return text?.includes('Complete');
			})
			.toBeTruthy();
	});

	test('✅ expect.toPass() for retrying code blocks', async () => {
		// GOOD: Retry entire block until it passes
		await expect(async () => {
			const rows = page.getByRole('row');
			await expect(rows).toHaveCount(3);
			await expect(rows.nth(0)).toContainText('Active');
		}).toPass();
	});
});

test.describe('Bad Assertion Practices - AVOID', () => {
	let page: Page;

	test.beforeEach(async ({ page: p }) => {
		page = p;
		await page.goto('/app');
	});

	test.skip('❌ Non-retrying assertions', async () => {
		// BAD: Checks only at one moment in time
		const isVisible = await page.locator('.result').isVisible();
		expect(isVisible).toBe(true); // No retry!

		const text = await page.locator('.status').textContent();
		expect(text).toBe('Ready'); // Race condition!

		// PROBLEMS:
		// - No auto-waiting
		// - Fails immediately if condition not met
		// - Race conditions
	});

	test.skip('❌ Manual checks before assertions', async () => {
		// BAD: Redundant manual check
		if (await page.locator('button').isVisible()) {
			await expect(page.locator('button')).toBeVisible();
		}

		// PROBLEMS:
		// - Redundant code
		// - Race condition between check and assertion
		// - Just use the assertion directly!
	});

	test.skip('❌ Using .toBe() for web checks', async () => {
		// BAD: Generic assertions don't retry
		const value = await page.locator('input').inputValue();
		expect(value).toBe('test');

		const count = await page.locator('li').count();
		expect(count).toBe(5);

		// PROBLEMS:
		// - No auto-retry
		// - Async data fetching race conditions
	});

	test.skip('❌ Not awaiting async assertions', async () => {
		// BAD: Forgot await
		expect(page.getByRole('heading')).toHaveText('Title'); // Missing await!

		// PROBLEMS:
		// - Test passes even if assertion fails
		// - Hard to debug
		// - Common mistake
	});

	test.skip('❌ Checking implementation details', async () => {
		// BAD: Testing internal state
		const className = await page.locator('button').getAttribute('class');
		expect(className).toContain('btn-primary');

		const style = await page.locator('div').getAttribute('style');
		expect(style).toContain('color: red');

		// PROBLEMS:
		// - Brittle - breaks on style changes
		// - Not testing user-visible behavior
		// - Use semantic checks instead
	});
});

test.describe('Assertion Patterns for Common Scenarios', () => {
	let page: Page;

	test.beforeEach(async ({ page: p }) => {
		page = p;
	});

	test('✅ Form validation errors', async () => {
		await page.goto('/form');
		await page.getByRole('button', { name: 'Submit' }).click();

		// Check multiple errors appear
		await expect(page.getByText('Email is required')).toBeVisible();
		await expect(page.getByText('Password is required')).toBeVisible();

		// Or use soft assertions to collect all errors
		await expect.soft(page.getByText('Email is required')).toBeVisible();
		await expect.soft(page.getByText('Password is required')).toBeVisible();
	});

	test('✅ Loading states', async () => {
		await page.goto('/data');
		await page.getByRole('button', { name: 'Load' }).click();

		// Spinner appears
		await expect(page.getByRole('progressbar')).toBeVisible();

		// Then disappears
		await expect(page.getByRole('progressbar')).toBeHidden();

		// Content appears
		await expect(page.getByRole('table')).toBeVisible();
	});

	test('✅ Dynamic lists', async () => {
		await page.goto('/items');

		// Initially empty
		await expect(page.getByRole('listitem')).toHaveCount(0);

		// Load items
		await page.getByRole('button', { name: 'Load Items' }).click();

		// Items appear
		await expect(page.getByRole('listitem')).toHaveCount(5);
		await expect(page.getByRole('listitem').first()).toContainText('Item 1');
	});

	test('✅ Success/error messages', async () => {
		await page.goto('/form');

		// Submit form
		await page.getByLabel('Name').fill('Test User');
		await page.getByRole('button', { name: 'Save' }).click();

		// Success message appears
		await expect(page.getByRole('alert')).toContainText('Saved successfully');

		// And disappears after timeout (if applicable)
		await expect(page.getByRole('alert')).toBeHidden({ timeout: 10_000 });
	});
});

/**
 * KEY TAKEAWAYS:
 *
 * ✅ DO:
 * - Use auto-retrying web-first assertions (toBeVisible, toHaveText, etc.)
 * - Always await async assertions
 * - Use soft assertions to check multiple conditions
 * - Test user-visible behavior, not implementation
 * - Leverage expect.poll() for custom async conditions
 *
 * ❌ DON'T:
 * - Use non-retrying assertions like .toBe() for web checks
 * - Manually check state before asserting
 * - Forget to await assertions
 * - Test implementation details (classes, styles)
 * - Use long timeout values - use auto-retry instead
 *
 * RESULT: Reliable, race-condition-free assertions
 */
