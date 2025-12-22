import { Page, expect, test } from '@playwright/test';

/**
 * DETERMINISTIC DATA FOR VISUAL REGRESSION TESTS
 *
 * CRITICAL: Never use Date.now(), new Date(), Math.random(), or any
 * non-deterministic data in mocks, tests, or Storybook stories.
 *
 * WHY: Visual regression tests compare screenshots. Non-deterministic data
 * causes different values each run, making every screenshot different and
 * breaking visual regression detection.
 */

test.describe('BAD: Non-Deterministic Data', () => {
	test.skip('❌ Using Date.now() breaks visual regression', async ({ page }) => {
		await page.route('**/api/items', route =>
			route.fulfill({
				status: 200,
				body: JSON.stringify([
					{
						id: 1,
						name: 'Item 1',
						createdAt: Date.now(), // ❌ NEVER DO THIS - changes every run
						timestamp: new Date().toISOString(), // ❌ NEVER DO THIS
					},
				]),
			})
		);

		await page.goto('/items');

		// PROBLEM: Screenshot will show different timestamp each run
		// Visual regression will ALWAYS fail
		await expect(page).toHaveScreenshot();
	});

	test.skip('❌ Using Math.random() breaks visual regression', async ({ page }) => {
		await page.route('**/api/score', route =>
			route.fulfill({
				status: 200,
				body: JSON.stringify({
					score: Math.floor(Math.random() * 100), // ❌ NEVER DO THIS
				}),
			})
		);

		await page.goto('/dashboard');

		// PROBLEM: Score changes every run, screenshot always different
		await expect(page).toHaveScreenshot();
	});

	test.skip('❌ Using dynamic UUIDs breaks visual regression', async ({ page }) => {
		await page.route('**/api/users', route =>
			route.fulfill({
				status: 200,
				body: JSON.stringify([
					{
						id: crypto.randomUUID(), // ❌ NEVER DO THIS
						name: 'User 1',
					},
				]),
			})
		);

		await page.goto('/users');
		await expect(page).toHaveScreenshot();
	});
});

test.describe('GOOD: Deterministic Data', () => {
	test('✅ Using fixed date ensures consistent visual regression', async ({ page }) => {
		// GOOD: Fixed date, same value every run
		const FIXED_DATE = '2024-01-15T10:30:00.000Z';
		const FIXED_TIMESTAMP = 1705315800000; // Matches the fixed date

		await page.route('**/api/items', route =>
			route.fulfill({
				status: 200,
				body: JSON.stringify([
					{
						id: 1,
						name: 'Item 1',
						createdAt: FIXED_TIMESTAMP,
						timestamp: FIXED_DATE,
					},
				]),
			})
		);

		await page.goto('/items');

		// Screenshot will be identical each run (assuming no code changes)
		await expect(page).toHaveScreenshot();
	});

	test('✅ Using fixed values for all dynamic data', async ({ page }) => {
		// GOOD: All data is deterministic
		await page.route('**/api/dashboard', route =>
			route.fulfill({
				status: 200,
				body: JSON.stringify({
					user: {
						id: 'user-001', // Fixed ID
						name: 'Test User',
						joinedAt: '2024-01-01T00:00:00.000Z', // Fixed date
					},
					stats: {
						score: 85, // Fixed number
						level: 5,
						lastActive: '2024-01-15T10:30:00.000Z', // Fixed date
					},
				}),
			})
		);

		await page.goto('/dashboard');
		await expect(page).toHaveScreenshot();
	});

	test('✅ Mock browser time for date-dependent UI', async ({ page }) => {
		// GOOD: Mock the browser's time to a fixed value
		await page.addInitScript(() => {
			const FIXED_TIME = new Date('2024-01-15T10:30:00.000Z').getTime();

			// Override Date constructor
			const OriginalDate = Date;
			// @ts-ignore
			globalThis.Date = class extends OriginalDate {
				constructor(...args: any[]) {
					if (args.length === 0) {
						super(FIXED_TIME);
					} else {
						super(...args);
					}
				}

				static now() {
					return FIXED_TIME;
				}
			};
		});

		await page.goto('/dashboard');

		// Now any Date.now() or new Date() in the app will return fixed time
		await expect(page).toHaveScreenshot();
	});
});

test.describe('Best Practices for Mock Data', () => {
	// GOOD: Create reusable fixtures with deterministic data
	const MOCK_FIXTURES = {
		user: {
			id: 'user-001',
			name: 'John Doe',
			email: 'john.doe@example.com',
			createdAt: '2024-01-01T00:00:00.000Z',
		},
		items: [
			{ id: 1, name: 'Item 1', price: 10.99, createdAt: '2024-01-10T10:00:00.000Z' },
			{ id: 2, name: 'Item 2', price: 25.5, createdAt: '2024-01-11T10:00:00.000Z' },
			{ id: 3, name: 'Item 3', price: 5.0, createdAt: '2024-01-12T10:00:00.000Z' },
		],
	};

	test('✅ Using shared fixtures', async ({ page }) => {
		await page.route('**/api/user', route =>
			route.fulfill({
				status: 200,
				body: JSON.stringify(MOCK_FIXTURES.user),
			})
		);

		await page.route('**/api/items', route =>
			route.fulfill({
				status: 200,
				body: JSON.stringify(MOCK_FIXTURES.items),
			})
		);

		await page.goto('/dashboard');
		await expect(page).toHaveScreenshot();
	});
});

test.describe('Storybook Stories - Same Principle', () => {
	// In Storybook stories (.stories.tsx), apply same rules:
	// ❌ BAD:
	// export const Default: Story = {
	//   args: {
	//     user: {
	//       id: Math.random().toString(),        // ❌ NEVER
	//       lastSeen: Date.now(),                // ❌ NEVER
	//       createdAt: new Date().toISOString(), // ❌ NEVER
	//     }
	//   }
	// };
	// ✅ GOOD:
	// export const Default: Story = {
	//   args: {
	//     user: {
	//       id: 'user-001',                           // ✅ Fixed
	//       lastSeen: 1705315800000,                  // ✅ Fixed timestamp
	//       createdAt: '2024-01-15T10:30:00.000Z',   // ✅ Fixed ISO date
	//     }
	//   }
	// };
});

/**
 * KEY TAKEAWAYS:
 *
 * ❌ NEVER USE in mocks/tests/stories:
 * - Date.now()
 * - new Date() (without fixed value)
 * - Date.getTime()
 * - Math.random()
 * - crypto.randomUUID()
 * - Any non-deterministic value
 *
 * ✅ ALWAYS USE:
 * - Fixed timestamps: 1705315800000
 * - Fixed ISO dates: '2024-01-15T10:30:00.000Z'
 * - Fixed IDs: 'user-001', 'item-123'
 * - Fixed numbers: 42, 85, 100
 * - Shared fixtures with deterministic data
 * - Mock browser time if app depends on current time
 *
 * WHY:
 * - Visual regression tests compare screenshots pixel-by-pixel
 * - Non-deterministic data = different screenshot every run
 * - This breaks visual regression detection completely
 * - Every test run would show "differences" even when nothing changed
 *
 * APPLIES TO:
 * - Playwright tests with screenshots
 * - Visual regression tests
 * - Storybook stories (.stories.tsx)
 * - Mock data in API routes
 * - Test fixtures
 *
 * RESULT: Reliable visual regression tests that only fail when UI actually changes
 */
