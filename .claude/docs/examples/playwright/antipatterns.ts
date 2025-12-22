import { Page, expect, test } from '@playwright/test';

/**
 * COMMON ANTI-PATTERNS WITH CORRECTIONS
 *
 * Side-by-side comparison of bad practices and their fixes
 */

test.describe('Anti-Pattern 1: Explicit Waits', () => {
	test.skip('❌ BAD - arbitrary timeout', async ({ page }) => {
		await page.goto('/app');
		await page.waitForTimeout(3000);
		await page.click('button');
	});

	test('✅ GOOD - auto-wait', async ({ page }) => {
		await page.goto('/app');
		await page.getByRole('button').click(); // Auto-waits
	});
});

test.describe('Anti-Pattern 2: Manual State Checking', () => {
	test.skip('❌ BAD - polling loop', async ({ page }) => {
		await page.goto('/app');
		while (!(await page.locator('.spinner').isHidden())) {
			await page.waitForTimeout(100);
		}
	});

	test('✅ GOOD - auto-retrying assertion', async ({ page }) => {
		await page.goto('/app');
		await expect(page.locator('.spinner')).toBeHidden();
	});
});

test.describe('Anti-Pattern 3: Brittle Selectors', () => {
	test.skip('❌ BAD - CSS class selectors', async ({ page }) => {
		await page.goto('/app');
		await page.click('div.MuiButton-root.css-xyz123');
	});

	test('✅ GOOD - semantic locator', async ({ page }) => {
		await page.goto('/app');
		await page.getByRole('button', { name: 'Save' }).click();
	});
});

test.describe('Anti-Pattern 4: Not Using Strict Mode', () => {
	test.skip('❌ BAD - ambiguous selector', async ({ page }) => {
		await page.goto('/app');
		await page.locator('button').first().click(); // Which button?
	});

	test('✅ GOOD - specific selector', async ({ page }) => {
		await page.goto('/app');
		await page.getByRole('button', { name: 'Submit' }).click(); // Specific
	});
});

test.describe('Anti-Pattern 5: Testing Implementation Details', () => {
	test.skip('❌ BAD - checking attributes', async ({ page }) => {
		await page.goto('/form');
		expect(await page.locator('input').getAttribute('value')).toBe('test');
	});

	test('✅ GOOD - checking user-visible value', async ({ page }) => {
		await page.goto('/form');
		await expect(page.getByLabel('Username')).toHaveValue('test');
	});
});

test.describe('Anti-Pattern 6: Race Conditions', () => {
	test.skip('❌ BAD - non-retrying check', async ({ page }) => {
		await page.goto('/app');
		await page.click('button');
		expect(await page.textContent('.result')).toBe('Success'); // May not be updated yet
	});

	test('✅ GOOD - auto-retrying assertion', async ({ page }) => {
		await page.goto('/app');
		await page.click('button');
		await expect(page.locator('.result')).toHaveText('Success'); // Waits for update
	});
});

test.describe('Anti-Pattern 7: Redundant Waits', () => {
	test.skip('❌ BAD - waiting then interacting', async ({ page }) => {
		await page.goto('/app');
		await page.waitForSelector('button'); // Redundant
		await page.click('button'); // Then click
	});

	test('✅ GOOD - just interact', async ({ page }) => {
		await page.goto('/app');
		await page.getByRole('button').click(); // Waits automatically
	});
});

test.describe('Anti-Pattern 8: networkidle Wait', () => {
	test.skip('❌ BAD - waiting for all network', async ({ page }) => {
		await page.goto('/dashboard');
		await page.waitForLoadState('networkidle'); // Waits for ads, analytics, everything
	});

	test('✅ GOOD - wait for specific element', async ({ page }) => {
		await page.goto('/dashboard');
		await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
	});
});

test.describe('Anti-Pattern 9: Non-Retrying Assertions', () => {
	test.skip('❌ BAD - checking state once', async ({ page }) => {
		await page.goto('/app');
		const isVisible = await page.locator('.result').isVisible();
		expect(isVisible).toBe(true); // No retry
	});

	test('✅ GOOD - auto-retrying assertion', async ({ page }) => {
		await page.goto('/app');
		await expect(page.locator('.result')).toBeVisible(); // Retries
	});
});

test.describe('Anti-Pattern 10: Not Mocking APIs', () => {
	test.skip('❌ BAD - relying on real API', async ({ page }) => {
		await page.goto('/users'); // Calls real API
		// Slow, unreliable, requires internet
	});

	test('✅ GOOD - mocked API', async ({ page }) => {
		await page.route('**/api/users', route =>
			route.fulfill({
				status: 200,
				body: JSON.stringify([{ id: 1, name: 'Test User' }]),
			})
		);
		await page.goto('/users');
		// Fast, reliable, predictable
	});
});
