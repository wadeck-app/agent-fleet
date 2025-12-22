import { Page, expect, test } from '@playwright/test';

/**
 * NETWORK HANDLING BEST PRACTICES
 *
 * Mock APIs for predictable, fast, reliable tests.
 * Wait for specific network responses when needed.
 */

test.describe('API Mocking - Making Tests Predictable', () => {
	test('✅ Mock successful API response', async ({ page }) => {
		// GOOD: Mock API for consistent behavior
		await page.route('**/api/users', route =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([
					{ id: 1, name: 'Alice' },
					{ id: 2, name: 'Bob' },
				]),
			})
		);

		await page.goto('/users');
		await expect(page.getByText('Alice')).toBeVisible();
		await expect(page.getByText('Bob')).toBeVisible();

		// BENEFITS:
		// - Fast (no real network)
		// - Predictable (always same data)
		// - No external dependencies
	});

	test('✅ Mock error response', async ({ page }) => {
		// GOOD: Test error handling
		await page.route('**/api/users', route =>
			route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'Server error' }),
			})
		);

		await page.goto('/users');
		await expect(page.getByText('Failed to load users')).toBeVisible();
	});

	test('✅ Mock different responses for same endpoint', async ({ page }) => {
		let callCount = 0;

		await page.route('**/api/status', route => {
			callCount++;
			if (callCount === 1) {
				route.fulfill({ status: 200, body: JSON.stringify({ status: 'processing' }) });
			} else {
				route.fulfill({ status: 200, body: JSON.stringify({ status: 'complete' }) });
			}
		});

		await page.goto('/status');
		await expect(page.getByText('Processing')).toBeVisible();

		// Refresh or poll
		await page.reload();
		await expect(page.getByText('Complete')).toBeVisible();
	});

	test('✅ Mock with delay to test loading states', async ({ page }) => {
		await page.route('**/api/data', async route => {
			// Simulate slow network
			await new Promise(resolve => setTimeout(resolve, 1000));
			await route.fulfill({
				status: 200,
				body: JSON.stringify({ data: 'loaded' }),
			});
		});

		await page.goto('/data');

		// Check loading state
		await expect(page.getByRole('progressbar')).toBeVisible();

		// Then loaded state
		await expect(page.getByText('loaded')).toBeVisible();
		await expect(page.getByRole('progressbar')).toBeHidden();
	});
});

test.describe('Waiting for Network Responses', () => {
	test('✅ Wait for specific API response', async ({ page }) => {
		// GOOD: Wait for specific endpoint
		const responsePromise = page.waitForResponse(
			response => response.url().includes('/api/save') && response.status() === 200
		);

		await page.goto('/form');
		await page.getByLabel('Name').fill('Test');
		await page.getByRole('button', { name: 'Save' }).click();

		const response = await responsePromise;
		expect(response.ok()).toBeTruthy();

		// Then check UI reflects the save
		await expect(page.getByText('Saved successfully')).toBeVisible();
	});

	test('✅ Wait for multiple API calls', async ({ page }) => {
		// GOOD: Wait for several endpoints
		const usersPromise = page.waitForResponse('**/api/users');
		const settingsPromise = page.waitForResponse('**/api/settings');

		await page.goto('/dashboard');

		await Promise.all([usersPromise, settingsPromise]);

		// All data loaded
		await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
	});

	test('✅ Check response data', async ({ page }) => {
		// GOOD: Validate API response content
		const response = await page.waitForResponse('**/api/user/profile');
		const data = await response.json();

		expect(data).toHaveProperty('name');
		expect(data).toHaveProperty('email');

		// And check UI displays it
		await expect(page.getByText(data.name)).toBeVisible();
	});
});

test.describe('Intercepting and Modifying Requests', () => {
	test('✅ Add custom headers', async ({ page }) => {
		// GOOD: Modify all API requests
		await page.route('**/api/**', route =>
			route.continue({
				headers: {
					...route.request().headers(),
					'X-Test-Header': 'test-value',
					Authorization: 'Bearer fake-token',
				},
			})
		);

		await page.goto('/app');
		// All API calls now have custom headers
	});

	test('✅ Block specific requests', async ({ page }) => {
		// GOOD: Block analytics/tracking
		await page.route('**/*analytics*.js', route => route.abort());
		await page.route('**/*tracking*.js', route => route.abort());
		await page.route('**/*.png', route => route.abort()); // Block images for faster tests

		await page.goto('/app');
		// Page loads faster without blocked resources
	});

	test('✅ Modify request payload', async ({ page }) => {
		// GOOD: Intercept and change POST data
		await page.route('**/api/save', async route => {
			const postData = route.request().postDataJSON();

			await route.continue({
				postData: JSON.stringify({
					...postData,
					modifiedBy: 'test',
				}),
			});
		});

		await page.goto('/form');
		await page.getByLabel('Name').fill('Test');
		await page.getByRole('button', { name: 'Save' }).click();
	});

	test('✅ Conditional routing', async ({ page }) => {
		// GOOD: Route based on request content
		await page.route('**/api/search', route => {
			const url = new URL(route.request().url());
			const query = url.searchParams.get('q');

			if (query === 'test') {
				route.fulfill({
					status: 200,
					body: JSON.stringify([{ id: 1, name: 'Test Result' }]),
				});
			} else {
				route.continue(); // Let real API handle it
			}
		});

		await page.goto('/search');
		await page.getByLabel('Search').fill('test');
		await page.getByRole('button', { name: 'Search' }).click();
		await expect(page.getByText('Test Result')).toBeVisible();
	});
});

test.describe('Using Request Context for API Testing', () => {
	test('✅ Setup data via API, test via UI', async ({ page, request }) => {
		// GOOD: Use API for setup, UI for testing
		const response = await request.post('/api/items', {
			data: {
				name: 'Test Item',
				description: 'Created via API',
			},
		});
		const item = await response.json();

		// Now test UI displays it
		await page.goto('/items');
		await expect(page.getByText('Test Item')).toBeVisible();

		// Cleanup
		await request.delete(`/api/items/${item.id}`);
	});

	test('✅ Perform action via UI, verify via API', async ({ page, request }) => {
		// GOOD: UI action, API verification
		await page.goto('/create-item');
		await page.getByLabel('Name').fill('New Item');
		await page.getByRole('button', { name: 'Create' }).click();

		await expect(page.getByText('Item created')).toBeVisible();

		// Verify via API
		const response = await request.get('/api/items');
		const items = await response.json();
		expect(items).toContainEqual(expect.objectContaining({ name: 'New Item' }));
	});
});

test.describe('Handling GraphQL APIs', () => {
	test('✅ Mock GraphQL response', async ({ page }) => {
		await page.route('**/graphql', route => {
			const postData = route.request().postDataJSON();

			// Check query type and respond accordingly
			if (postData.operationName === 'GetUsers') {
				route.fulfill({
					status: 200,
					body: JSON.stringify({
						data: {
							users: [
								{ id: '1', name: 'Alice' },
								{ id: '2', name: 'Bob' },
							],
						},
					}),
				});
			} else {
				route.continue();
			}
		});

		await page.goto('/users');
		await expect(page.getByText('Alice')).toBeVisible();
	});
});

// ==================== BAD PRACTICES - AVOID ====================

test.describe.skip('BAD: Network Anti-Patterns', () => {
	test('❌ Waiting for networkidle', async ({ page }) => {
		// BAD: Waits for ALL network activity
		await page.goto('/dashboard');
		await page.waitForLoadState('networkidle');

		// PROBLEMS:
		// - Waits for analytics, ads, tracking
		// - Unreliable with websockets or polling
		// - Slow and flaky
		// - Doesn't guarantee your element is ready
	});

	test('❌ Not mocking external APIs', async ({ page }) => {
		// BAD: Relying on real external APIs
		await page.goto('/weather'); // Calls real weather API

		await expect(page.getByText('Temperature')).toBeVisible();

		// PROBLEMS:
		// - Slow (real network latency)
		// - Flaky (API might be down)
		// - Non-deterministic (weather changes)
		// - Requires internet connection
	});

	test('❌ Not handling API errors', async ({ page }) => {
		// BAD: Only testing happy path
		await page.goto('/users');
		await expect(page.getByRole('listitem')).toHaveCount(5);

		// PROBLEMS:
		// - Doesn't test error scenarios
		// - Real API might fail in CI
		// - App error handling not tested
	});

	test('❌ Using setTimeout instead of waiting for response', async ({ page }) => {
		// BAD: Arbitrary wait after action
		await page.goto('/form');
		await page.getByRole('button', { name: 'Save' }).click();
		await page.waitForTimeout(2000); // Hope API responds by then

		// PROBLEMS:
		// - Slow if API is fast
		// - Fails if API is slow
		// - No indication of what we're waiting for
	});
});

// ==================== BEST PRACTICES SUMMARY ====================

test.describe('Network Best Practices Summary', () => {
	test('✅ Complete network handling example', async ({ page, request }) => {
		// 1. Mock external dependencies
		await page.route('**/api/external/**', route =>
			route.fulfill({
				status: 200,
				body: JSON.stringify({ data: 'mocked' }),
			})
		);

		// 2. Setup data via API
		await request.post('/api/items', {
			data: { name: 'Test Item' },
		});

		// 3. Wait for specific response
		const savePromise = page.waitForResponse('**/api/save');

		// 4. Perform UI action
		await page.goto('/items');
		await page.getByRole('button', { name: 'Sync' }).click();

		// 5. Verify response
		const response = await savePromise;
		expect(response.status()).toBe(200);

		// 6. Verify UI reflects change
		await expect(page.getByText('Synced')).toBeVisible();

		// BENEFITS:
		// - Fast (mocked external APIs)
		// - Reliable (no external dependencies)
		// - Clear (waiting for specific response)
		// - Comprehensive (API + UI verification)
	});
});

/**
 * KEY TAKEAWAYS:
 *
 * ✅ DO:
 * - Mock external APIs for predictable tests
 * - Wait for specific API responses, not networkidle
 * - Test both success and error scenarios
 * - Use request context for API setup/verification
 * - Block unnecessary resources (analytics, images)
 * - Modify requests/responses for specific test scenarios
 *
 * ❌ DON'T:
 * - Wait for networkidle
 * - Rely on real external APIs
 * - Use arbitrary timeouts after API calls
 * - Only test happy path
 * - Let analytics/tracking slow down tests
 *
 * RESULT: Fast, reliable, deterministic tests
 */
