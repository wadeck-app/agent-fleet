import { Page } from '@playwright/test';

/**
 * Utilities for auto-generated Visual E2E tests
 */

/**
 * Verify that a Storybook story exists in the story index
 * Uses Storybook's stories.json API for reliable, fast validation
 * Throws an error if the story is not found (prevents navigation to missing stories)
 *
 * @param page - Playwright page object
 * @param storyId - Story ID in Storybook URL format (e.g., 'components-button--primary')
 * @param timeout - Maximum time to wait for validation (default: 10000ms)
 * @throws Error if story not found or failed to load
 *
 * @example
 * ```typescript
 * test('Button - Primary', async ({ page }) => {
 *   // Check story exists BEFORE navigation (fast fail if missing)
 *   await ensureStoryExists(page, 'components-button--primary');
 *   await page.goto(`${STORYBOOK_URL}/iframe.html?id=components-button--primary`);
 *   await expect(page).toHaveScreenshot('Button-Primary.png');
 * });
 * ```
 */
export async function ensureStoryExists(page: Page, storyId: string, timeout: number = 10000): Promise<void> {
	const startTime = Date.now();

	// Get baseURL from Playwright's context (set in playwright.config.storybook.ts)
	const baseURL = (page.context() as any)._options?.baseURL || 'http://localhost:6100';

	// Retry loop with exponential backoff
	let lastError: Error | undefined;
	const delays = [0, 500, 1000, 2000];

	for (const delay of delays) {
		if (Date.now() - startTime > timeout) break;

		if (delay > 0) await new Promise(r => setTimeout(r, delay));

		try {
			// Fetch index.json using standard fetch() - simple and efficient
			// Storybook v7+ uses /index.json, not /stories.json
			// No cache needed: overhead is ~5ms per test (negligible)
			const response = await fetch(`${baseURL}/index.json`);

			if (!response.ok) {
				lastError = new Error(`Stories API returned ${response.status}`);
				continue;
			}

			const data = await response.json();

			// Check if story exists in the index
			// Storybook v7+ format: data.v3.stories[storyId] or data.entries[storyId]
			const stories = data?.v3?.stories || data?.entries || data?.stories || {};
			if (stories[storyId]) {
				return;
			}

			// Story not found in index - throw immediately (don't retry)
			throw new Error(`Story '${storyId}' not found in index.json`);
		} catch (error: any) {
			if (error.message.includes('not found in index.json')) {
				// Story genuinely doesn't exist - throw helpful error
				throw new Error(
					`
❌ STORYBOOK: Story not found!

Story ID: ${storyId}

The story does not exist in Storybook's story index.

✅ FIX:
1. Check if the story exists in your *.stories.tsx files
2. Verify the story export name matches the test
3. Re-generate visual tests: npm run test:visual:generate
				`.trim()
				);
			}
			lastError = error;
		}
	}

	// Timeout or persistent error
	throw new Error(
		`
❌ STORYBOOK: Failed to verify story!

Story ID: ${storyId}
Error: ${lastError?.message || 'Unknown error'}

This could mean:
1. Storybook is still starting up (try increasing timeout)
2. Network issues with index.json endpoint
3. Storybook failed to generate the story index

Check that Storybook is running correctly.
	`.trim()
	);
}
