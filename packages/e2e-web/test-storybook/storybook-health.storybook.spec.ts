import { expect, test } from '../playwright-hooks/hooks-storybook';

/**
 * Basic health check for Storybook E2E infrastructure
 * Verifies that Storybook is running and accessible
 *
 * TODO: Add actual component functional tests here
 */
test.describe('Storybook Infrastructure', () => {
	test('should load Storybook homepage', async ({ page }) => {
		await page.goto('/');

		// Verify Storybook UI elements are present
		await expect(page).toHaveTitle(/Storybook/);

		// Basic check that the page loaded
		const body = await page.locator('body');
		await expect(body).toBeVisible();
	});
});
