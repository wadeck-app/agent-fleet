import { Page, expect, test } from '@playwright/test';

/**
 * LOCATOR BEST PRACTICES
 *
 * Priority order (best to worst):
 * 1. Role-based (getByRole)
 * 2. Label-based (getByLabel)
 * 3. Placeholder (getByPlaceholder)
 * 4. Text-based (getByText)
 * 5. Test ID (getByTestId) - last resort
 */

test.describe('Good Locator Practices', () => {
	let page: Page;

	test.beforeEach(async ({ page: p }) => {
		page = p;
		await page.goto('/form');
	});

	test('Role-based locators - BEST PRACTICE', async () => {
		// ✅ Semantic, accessible, resilient to styling changes
		await page.getByRole('button', { name: 'Submit' }).click();
		await page.getByRole('textbox', { name: 'Search' }).fill('query');
		await page.getByRole('link', { name: 'Go to Dashboard' }).click();
		await page.getByRole('checkbox', { name: 'I agree to terms' }).check();
		await page.getByRole('heading', { name: 'Welcome' }).waitFor();
	});

	test('Label-based locators - GREAT for forms', async () => {
		// ✅ Semantic, works with any input type
		await page.getByLabel('Email address').fill('user@example.com');
		await page.getByLabel('Password').fill('secret123');
		await page.getByLabel('Remember me').check();
	});

	test('Placeholder-based locators', async () => {
		// ✅ Good when labels are not present
		await page.getByPlaceholder('Enter your email').fill('test@test.com');
		await page.getByPlaceholder('Search products...').fill('laptop');
	});

	test('Text-based locators - for static content', async () => {
		// ✅ Good for headings, paragraphs, links
		await page.getByText('Welcome back').waitFor();
		await page.getByText('Click here to continue').click();
		await expect(page.getByText('Successfully logged in')).toBeVisible();
	});

	test('Test ID - last resort when semantic locators not available', async () => {
		// ✅ Stable but not user-facing - use sparingly
		await page.getByTestId('user-menu-toggle').click();
		await page.getByTestId('logout-button').click();
	});

	test('Combining and filtering locators', async () => {
		// ✅ Chain and filter to be specific
		await page
			.getByRole('listitem')
			.filter({ hasText: 'Active' })
			.getByRole('button', { name: 'Edit' })
			.click();

		// ✅ Using and() for multiple conditions
		await page
			.getByRole('row')
			.filter({ has: page.getByText('John Doe') })
			.getByRole('button', { name: 'Delete' })
			.click();
	});

	test('Count-based assertions instead of nth()', async () => {
		// ❌ AVOID: page.locator('li').nth(2).click()

		// ✅ BETTER: Use semantic locators with filters
		await page.getByRole('listitem').filter({ hasText: 'Third Item' }).click();

		// ✅ Or assert count and be specific
		await expect(page.getByRole('listitem')).toHaveCount(5);
	});
});

test.describe('Bad Locator Practices - AVOID', () => {
	let page: Page;

	test.beforeEach(async ({ page: p }) => {
		page = p;
	});

	test.skip('CSS selectors - BRITTLE, avoid', async () => {
		// ❌ BAD: Breaks when CSS classes change
		await page.locator('.btn.btn-primary.btn-lg').click();
		await page.locator('div.container > div.row > div.col-md-6').click();
		await page.locator('[class*="MuiButton-root-xyz123"]').click();
	});

	test.skip('XPath - BRITTLE, avoid', async () => {
		// ❌ BAD: Hard to read, breaks on DOM changes
		await page.locator('//div[@id="root"]//button[contains(text(), "Submit")]').click();
		await page.locator('//form//input[@type="text"][1]').fill('value');
	});

	test.skip('Positional selectors without context - FRAGILE', async () => {
		// ❌ BAD: Which button? Can break when order changes
		await page.locator('button').first().click();
		await page.locator('input').nth(3).fill('value');
	});

	test.skip('Overly specific CSS - MAINTENANCE NIGHTMARE', async () => {
		// ❌ BAD: One DOM change breaks everything
		await page
			.locator(
				'div#app > main.main-content > section.user-section > div.user-card:nth-child(3) > button.edit-btn'
			)
			.click();
	});
});

/**
 * KEY TAKEAWAYS:
 *
 * 1. Always prefer semantic locators (role, label) - they reflect user experience
 * 2. Use test-id only when semantic locators are not feasible
 * 3. Never rely on CSS classes that may change with styling
 * 4. Avoid XPath unless absolutely necessary
 * 5. Use filters and chains instead of nth() for specificity
 * 6. Make locators resilient to refactoring and design changes
 */
