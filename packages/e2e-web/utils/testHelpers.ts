import type { Page } from '@playwright/test';

/**
 * Utilities for E2E tests
 */

/**
 * Disable MSW (Mock Service Worker) for this specific test
 *
 * Use this when you need to control network requests with Playwright's page.route()
 * instead of MSW. MSW intercepts requests at the browser level (service worker)
 * which has priority over Playwright's Chrome DevTools Protocol routing.
 *
 * **When to use:**
 * - Tests that need precise control over request timing (race conditions)
 * - Tests that hold requests and resolve them manually with controlled promises
 * - Tests that simulate complex network scenarios
 *
 * **When NOT to use:**
 * - Simple functional tests without timing requirements
 * - Visual regression tests (MSW ensures consistent mock data)
 *
 * @param page - Playwright page object
 *
 * @example
 * ```typescript
 * test('race condition test', async ({ page }) => {
 *   // Disable MSW for this test only
 *   await disableMSWForThisTest(page);
 *
 *   // Now page.route() will work as expected
 *   await page.route('**\/api/chat/message', async (route, request) => {
 *     // Your custom routing logic with controlled promises
 *   });
 *
 *   await page.goto('http://localhost:6100/iframe.html?id=my-story');
 * });
 * ```
 *
 * @see e2e/tests/storybook/chat-race-conditions.storybook.spec.ts for full examples
 * @see .claude/docs/storybook-msw-guide.md for detailed explanation
 */
export async function disableMSWForThisTest(page: Page): Promise<void> {
	await page.addInitScript(() => {
		(window as any).__DISABLE_MSW__ = true;
	});
}

/**
 * Generate a unique name to avoid collisions between tests
 */
export function generateUniqueName(baseName: string): string {
	const timestamp = Date.now();
	const random = Math.floor(Math.random() * 1000);
	return `${baseName}_${timestamp}_${random}`;
}

/**
 * Wait for a specific number of elements to be present
 */
export async function waitForElementCount(
	page: Page,
	selector: string,
	expectedCount: number,
	timeout: number = 10000
): Promise<void> {
	await page.waitForFunction(
		({ sel, count }) => {
			const elements = document.querySelectorAll(sel);
			return elements.length === count;
		},
		{ sel: selector, count: expectedCount },
		{ timeout }
	);
}

/**
 * Verify a toast with a specific message is displayed
 */
export async function waitForToastMessage(page: Page, message: string, timeout: number = 10000): Promise<boolean> {
	try {
		const toast = page.locator('.toast', { hasText: message });
		await toast.waitFor({ state: 'visible', timeout });
		return true;
	} catch {
		return false;
	}
}

/**
 * Clear all data (useful for test setup/teardown)
 * WARNING: This function is destructive!
 *
 * Retry logic to handle race conditions in parallel testing
 */
export async function clearAllData(page: Page, maxRetries: number = 3): Promise<void> {
	// Get the backend port from the page context (set by hooks-web-server.ts)
	const backendPort = (page as any).backendPort || 3000;
	const url = `http://localhost:${backendPort}/api/test/clear-data`;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			const response = await page.request.post(url, {
				timeout: 10000,
				failOnStatusCode: false,
			});

			if (response.ok()) {
				// Wait a bit for clear to complete
				await delay(100);
				return;
			}

			// 404 can mean that the endpoint doesn't exist OR that data is already cleared
			// In both cases, consider it OK
			if (response.status() === 404) {
				console.warn(`clearAllData: 404 received on attempt ${attempt + 1}, continuing...`);
				return;
			}

			// For other errors, retry with backoff
			if (attempt < maxRetries - 1) {
				const backoffMs = Math.pow(2, attempt) * 500; // 500ms, 1s, 2s
				console.warn(
					`clearAllData failed (attempt ${attempt + 1}/${maxRetries}): ${response.status()}, retrying in ${backoffMs}ms...`
				);
				await delay(backoffMs);
				continue;
			}

			throw new Error(
				`Failed to clear data after ${maxRetries} attempts: ${response.status()} ${response.statusText()}`
			);
		} catch (error) {
			if (attempt < maxRetries - 1) {
				const backoffMs = Math.pow(2, attempt) * 500;
				console.warn(
					`clearAllData error (attempt ${attempt + 1}/${maxRetries}):`,
					error,
					`retrying in ${backoffMs}ms...`
				);
				await delay(backoffMs);
				continue;
			}
			throw error;
		}
	}
}

/**
 * Wait for all loading spinners to disappear
 */
export async function waitForAllLoadingComplete(page: Page, timeout: number = 15000): Promise<void> {
	try {
		await page.waitForSelector('.spinner', { state: 'detached', timeout });
	} catch {
		// Ignore if no spinner is present
	}
}

/**
 * Compare two numbers with tolerance (useful for macro calculations)
 */
export function approximatelyEqual(actual: number, expected: number, tolerance: number = 0.5): boolean {
	return Math.abs(actual - expected) <= tolerance;
}

/**
 * Wait for a specific delay
 */
export async function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for a condition to be true with polling
 * More robust than waitForFunction for complex checks
 */
export async function waitForCondition(
	checkFn: () => Promise<boolean> | boolean,
	options: { timeout?: number; interval?: number; message?: string } = {}
): Promise<void> {
	const { timeout = 10000, interval = 200, message = 'Condition not met' } = options;
	const startTime = Date.now();

	while (Date.now() - startTime < timeout) {
		try {
			const result = await checkFn();
			if (result) return;
		} catch (error) {
			// Ignore errors and continue trying
		}
		await delay(interval);
	}

	throw new Error(`${message} (timeout after ${timeout}ms)`);
}

/**
 * Click on an element with retry if stale/detached
 * Solves "element is not attached to the DOM" issues
 */
export async function clickWithRetry(
	page: Page,
	selector: string,
	options: { timeout?: number; maxRetries?: number } = {}
): Promise<void> {
	const { timeout = 5000, maxRetries = 3 } = options;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			await page.locator(selector).click({ timeout });
			return;
		} catch (error: any) {
			if (
				attempt < maxRetries - 1 &&
				(error.message?.includes('not attached') ||
					error.message?.includes('detached') ||
					error.message?.includes('not visible'))
			) {
				await delay(500);
				continue;
			}
			throw error;
		}
	}
}

/**
 * Fill an input with retry
 * Handles cases where input is recreated/replaced in DOM
 */
export async function fillWithRetry(
	page: Page,
	selector: string,
	value: string,
	options: { timeout?: number; maxRetries?: number } = {}
): Promise<void> {
	const { timeout = 5000, maxRetries = 3 } = options;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			const input = page.locator(selector);
			await input.clear({ timeout: timeout / 2 });
			await input.fill(value, { timeout: timeout / 2 });

			// Verify the value was entered
			const actualValue = await input.inputValue();
			if (actualValue === value) return;

			if (attempt < maxRetries - 1) {
				await delay(500);
				continue;
			}
		} catch (error: any) {
			if (attempt < maxRetries - 1) {
				await delay(500);
				continue;
			}
			throw error;
		}
	}

	throw new Error(`Failed to fill ${selector} with value "${value}" after ${maxRetries} attempts`);
}

/**
 * Verify a success toast was recorded (via window.__lastToast)
 * More stable than waiting for toast DOM element
 */
export async function waitForSuccessToastEvent(page: Page, timeout: number = 10000): Promise<void> {
	await page.waitForFunction(
		() => {
			const toast = (window as any).__lastToast;
			return toast && toast.type === 'success' && Date.now() - toast.timestamp < 5000;
		},
		{ timeout }
	);
}

/**
 * Verify an error toast was recorded
 */
export async function waitForErrorToastEvent(page: Page, timeout: number = 10000): Promise<void> {
	await page.waitForFunction(
		() => {
			const toast = (window as any).__lastToast;
			return toast && toast.type === 'error' && Date.now() - toast.timestamp < 5000;
		},
		{ timeout }
	);
}

/**
 * Verify a toast with a specific message was recorded
 */
export async function waitForToastEventWithMessage(
	page: Page,
	message: string,
	timeout: number = 10000
): Promise<void> {
	await page.waitForFunction(
		expectedMessage => {
			const toast = (window as any).__lastToast;
			return toast && toast.message.includes(expectedMessage) && Date.now() - toast.timestamp < 5000;
		},
		message,
		{ timeout }
	);
}

/**
 * Reset toast events
 * Call in beforeEach to avoid interference between tests
 */
export async function clearToastEvents(page: Page): Promise<void> {
	await page.evaluate(() => {
		(window as any).__toastEvents = [];
		(window as any).__lastToast = undefined;
	});
}

/**
 * Generate random data for an ingredient
 */
export function generateRandomIngredient() {
	const names = ['Ingredient A', 'Ingredient B', 'Ingredient C', 'Ingredient D'];
	const randomName = names[Math.floor(Math.random() * names.length)];

	return {
		name: generateUniqueName(randomName),
		calories: Math.floor(Math.random() * 500) + 50,
		protein: Math.floor(Math.random() * 50) + 1,
		carbs: Math.floor(Math.random() * 80) + 1,
		fat: Math.floor(Math.random() * 30) + 1,
		servingSize: 100,
	};
}

/**
 * Calculate total macros of a recipe
 */
export function calculateRecipeMacros(
	ingredients: Array<{
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		quantity: number;
		servingSize: number;
	}>
): { calories: number; protein: number; carbs: number; fat: number } {
	let totalCalories = 0;
	let totalProtein = 0;
	let totalCarbs = 0;
	let totalFat = 0;

	for (const ing of ingredients) {
		const ratio = ing.quantity / ing.servingSize;
		totalCalories += Math.round(ing.calories * ratio);
		totalProtein += parseFloat((ing.protein * ratio).toFixed(1));
		totalCarbs += parseFloat((ing.carbs * ratio).toFixed(1));
		totalFat += parseFloat((ing.fat * ratio).toFixed(1));
	}

	return {
		calories: totalCalories,
		protein: parseFloat(totalProtein.toFixed(1)),
		carbs: parseFloat(totalCarbs.toFixed(1)),
		fat: parseFloat(totalFat.toFixed(1)),
	};
}
