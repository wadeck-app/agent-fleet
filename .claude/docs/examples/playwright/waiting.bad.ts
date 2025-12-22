import { Page, expect, test } from '@playwright/test';

/**
 * ANTI-PATTERNS: Bad Waiting Strategies
 *
 * This file demonstrates what NOT to do.
 * See waiting.good.ts for correct approaches.
 */

test.describe('Bad Waiting Practices - NEVER DO THIS', () => {
	let page: Page;

	test.beforeEach(async ({ page: p }) => {
		page = p;
		await page.goto('/dashboard');
	});

	test.skip('❌ Using arbitrary waitForTimeout', async () => {
		// BAD: Hardcoded wait makes test slow and unreliable
		await page.click('button#load-data');
		await page.waitForTimeout(3000); // What if it takes 3.1 seconds? or 1 second?
		const text = await page.textContent('.result');
		expect(text).toBe('Data loaded');

		// PROBLEMS:
		// - Slows down tests even when data loads fast
		// - Fails if data takes longer than expected
		// - No indication of what we're waiting for
	});

	test.skip('❌ Using waitForLoadState("networkidle")', async () => {
		// BAD: Waits for ALL network requests (ads, analytics, tracking)
		await page.goto('/complex-page');
		await page.waitForLoadState('networkidle');
		await page.click('button#submit');

		// PROBLEMS:
		// - Waits for unrelated requests (ads, analytics)
		// - Unreliable in modern apps with long-polling or websockets
		// - Slow and flaky
		// - Doesn't guarantee the element you need is ready
	});

	test.skip('❌ Using waitForLoadState("domcontentloaded")', async () => {
		// BAD: Too early - elements may not be rendered yet
		await page.goto('/app');
		await page.waitForLoadState('domcontentloaded');
		await page.click('button#dynamic-button'); // May not exist yet!

		// PROBLEMS:
		// - DOM loaded doesn't mean elements are rendered
		// - Scripts may still be loading
		// - React/Vue components may not be mounted
	});

	test.skip('❌ Manual polling loops', async () => {
		// BAD: Manual retry logic when Playwright does this automatically
		let visible = false;
		let attempts = 0;

		while (!visible && attempts < 10) {
			try {
				visible = await page.locator('.modal').isVisible();
			} catch {
				visible = false;
			}
			if (!visible) {
				await page.waitForTimeout(500);
				attempts++;
			}
		}

		if (!visible) {
			throw new Error('Modal never appeared');
		}

		// PROBLEMS:
		// - Complex, error-prone code
		// - Playwright already does this with auto-waiting
		// - Hard to maintain
	});

	test.skip('❌ Checking existence before interaction', async () => {
		// BAD: Redundant - Playwright auto-waits for elements
		await page.waitForSelector('button#submit');
		const button = await page.locator('button#submit');
		await button.click();

		// PROBLEMS:
		// - Redundant code
		// - Two separate waits (not atomic)
		// - Race condition between waitForSelector and click
	});

	test.skip('❌ Using non-retrying assertions', async () => {
		// BAD: Checks state at one moment in time
		await page.click('button#fetch');
		const isVisible = await page.locator('.result').isVisible();
		expect(isVisible).toBe(true); // Fails if result takes time to appear

		// PROBLEMS:
		// - No retry mechanism
		// - Race condition
		// - Will fail even if element appears 1ms later
	});

	test.skip('❌ Sleep-based synchronization', async () => {
		// BAD: Guessing how long operations take
		await page.fill('input#email', 'test@test.com');
		await page.waitForTimeout(1000); // Why 1000ms?
		await page.fill('input#password', 'password');
		await page.waitForTimeout(500); // Why 500ms?
		await page.click('button#login');
		await page.waitForTimeout(2000); // Why 2000ms?

		// PROBLEMS:
		// - Magic numbers with no explanation
		// - Slows down tests unnecessarily
		// - Fails in slow environments
		// - No clear understanding of what we're waiting for
	});

	test.skip('❌ Waiting for the wrong thing', async () => {
		// BAD: Waiting for page load when we should wait for specific element
		await page.click('button#show-modal');
		await page.waitForLoadState('load'); // Modal is client-side, no page load!
		await page.click('.modal button#confirm');

		// PROBLEMS:
		// - Waiting for page navigation when none happens
		// - Doesn't guarantee modal is visible
		// - May timeout waiting for wrong condition
	});

	test.skip('❌ Multiple sequential timeouts', async () => {
		// BAD: Cascading arbitrary waits
		await page.goto('/form');
		await page.waitForTimeout(1000); // Wait for... something?
		await page.fill('input', 'value');
		await page.waitForTimeout(500); // Wait for... validation?
		await page.click('button');
		await page.waitForTimeout(2000); // Wait for... submission?

		// PROBLEMS:
		// - Tests take forever
		// - No clarity on what we're waiting for
		// - Brittle and unreliable
	});
});

/**
 * KEY PROBLEMS WITH THESE APPROACHES:
 *
 * 1. Slow tests - arbitrary waits add unnecessary time
 * 2. Flaky tests - race conditions when timing is off
 * 3. Unclear intent - what are we actually waiting for?
 * 4. Not leveraging Playwright's auto-waiting
 * 5. False negatives - tests fail even when app works
 * 6. False positives - tests pass even when app is broken
 *
 * See waiting.good.ts for proper solutions.
 */
