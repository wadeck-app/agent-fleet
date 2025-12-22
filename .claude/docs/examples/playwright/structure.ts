import { Page, expect, test } from '@playwright/test';

/**
 * TEST STRUCTURE AND ORGANIZATION BEST PRACTICES
 *
 * Keep tests maintainable with good structure, page objects, and clear organization.
 */

// ==================== PAGE OBJECT MODEL ====================

/**
 * ✅ GOOD: Page Object Pattern
 * Encapsulates page elements and interactions
 */
class LoginPage {
	constructor(private page: Page) {}

	// Locators as getters - evaluated lazily
	get emailInput() {
		return this.page.getByLabel('Email');
	}

	get passwordInput() {
		return this.page.getByLabel('Password');
	}

	get submitButton() {
		return this.page.getByRole('button', { name: 'Sign In' });
	}

	get errorMessage() {
		return this.page.getByRole('alert');
	}

	// Actions as methods
	async login(email: string, password: string) {
		await this.emailInput.fill(email);
		await this.passwordInput.fill(password);
		await this.submitButton.click();
	}

	async expectErrorMessage(text: string) {
		await expect(this.errorMessage).toContainText(text);
	}

	async goto() {
		await this.page.goto('/login');
	}
}

/**
 * ✅ GOOD: Component Object Pattern
 * For reusable UI components
 */
class NavigationBar {
	constructor(private page: Page) {}

	private get nav() {
		return this.page.getByRole('navigation');
	}

	async clickLink(name: string) {
		await this.nav.getByRole('link', { name }).click();
	}

	async expectActiveLink(name: string) {
		await expect(this.nav.getByRole('link', { name, current: 'page' })).toBeVisible();
	}
}

// ==================== USING PAGE OBJECTS ====================

test.describe('Login Page Tests', () => {
	let loginPage: LoginPage;

	test.beforeEach(async ({ page }) => {
		loginPage = new LoginPage(page);
		await loginPage.goto();
	});

	test('✅ successful login', async () => {
		await loginPage.login('user@example.com', 'password123');
		await expect(loginPage['page']).toHaveURL(/.*dashboard/);
	});

	test('✅ shows error for invalid credentials', async () => {
		await loginPage.login('wrong@example.com', 'wrong');
		await loginPage.expectErrorMessage('Invalid credentials');
	});

	test('✅ shows error for empty fields', async () => {
		await loginPage.submitButton.click();
		await loginPage.expectErrorMessage('Email is required');
	});
});

// ==================== TEST ORGANIZATION ====================

test.describe('Dashboard Features', () => {
	// ✅ GOOD: Group related tests together
	test.describe('User Profile Section', () => {
		test.beforeEach(async ({ page }) => {
			await page.goto('/dashboard');
		});

		test('displays user name', async ({ page }) => {
			await expect(page.getByText('John Doe')).toBeVisible();
		});

		test('allows editing profile', async ({ page }) => {
			await page.getByRole('button', { name: 'Edit Profile' }).click();
			await expect(page.getByRole('dialog')).toBeVisible();
		});
	});

	test.describe('Recent Activity Section', () => {
		test.beforeEach(async ({ page }) => {
			await page.goto('/dashboard');
		});

		test('shows recent items', async ({ page }) => {
			await expect(page.getByRole('listitem')).toHaveCount(5);
		});

		test('allows filtering activities', async ({ page }) => {
			await page.getByLabel('Filter').selectOption('today');
			await expect(page.getByRole('listitem')).toHaveCount(2);
		});
	});
});

// ==================== TEST PARAMETERIZATION ====================

test.describe('Parameterized Tests', () => {
	// ✅ GOOD: Data-driven tests with forEach
	[
		{ role: 'admin', canDelete: true, canEdit: true },
		{ role: 'editor', canDelete: false, canEdit: true },
		{ role: 'viewer', canDelete: false, canEdit: false },
	].forEach(({ role, canDelete, canEdit }) => {
		test(`${role} permissions`, async ({ page }) => {
			// Set user role
			await page.goto(`/items?role=${role}`);

			// Check delete button
			const deleteBtn = page.getByRole('button', { name: 'Delete' });
			if (canDelete) {
				await expect(deleteBtn).toBeEnabled();
			} else {
				await expect(deleteBtn).toBeDisabled();
			}

			// Check edit button
			const editBtn = page.getByRole('button', { name: 'Edit' });
			if (canEdit) {
				await expect(editBtn).toBeEnabled();
			} else {
				await expect(editBtn).toBeDisabled();
			}
		});
	});

	// ✅ GOOD: Parameterized form validation
	[
		{ field: 'email', value: 'invalid', error: 'Invalid email format' },
		{ field: 'email', value: '', error: 'Email is required' },
		{ field: 'password', value: '123', error: 'Password too short' },
		{ field: 'password', value: '', error: 'Password is required' },
	].forEach(({ field, value, error }) => {
		test(`validates ${field}: ${value || 'empty'}`, async ({ page }) => {
			await page.goto('/signup');
			await page.getByLabel(field).fill(value);
			await page.getByRole('button', { name: 'Submit' }).click();
			await expect(page.getByText(error)).toBeVisible();
		});
	});
});

// ==================== HELPER FUNCTIONS ====================

// ✅ GOOD: Reusable helper functions

async function createTestUser(page: Page, name: string) {
	await page.goto('/admin/users');
	await page.getByRole('button', { name: 'Add User' }).click();
	await page.getByLabel('Name').fill(name);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('User created')).toBeVisible();
}

async function deleteTestUser(page: Page, name: string) {
	await page.goto('/admin/users');
	await page.getByText(name).click();
	await page.getByRole('button', { name: 'Delete' }).click();
	await page.getByRole('button', { name: 'Confirm' }).click();
}

test.describe('Using Helper Functions', () => {
	test('✅ create and delete user', async ({ page }) => {
		await createTestUser(page, 'Test User');
		await expect(page.getByText('Test User')).toBeVisible();

		await deleteTestUser(page, 'Test User');
		await expect(page.getByText('Test User')).not.toBeVisible();
	});
});

// ==================== COMPLEX PAGE OBJECT ====================

/**
 * ✅ GOOD: More complex page object with multiple sections
 */
class DashboardPage {
	constructor(private page: Page) {}

	// Sub-components
	get navigation() {
		return new NavigationBar(this.page);
	}

	// Sections
	get userProfile() {
		return {
			name: this.page.locator('[data-testid="user-name"]'),
			avatar: this.page.locator('[data-testid="user-avatar"]'),
			editButton: this.page.getByRole('button', { name: 'Edit Profile' }),
		};
	}

	get recentActivity() {
		return {
			list: this.page.getByRole('list', { name: 'Recent Activity' }),
			items: this.page.getByRole('listitem'),
			filter: this.page.getByLabel('Filter'),
		};
	}

	// Actions
	async goto() {
		await this.page.goto('/dashboard');
		await expect(this.page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
	}

	async filterActivity(filter: string) {
		await this.recentActivity.filter.selectOption(filter);
	}

	async editProfile() {
		await this.userProfile.editButton.click();
		await expect(this.page.getByRole('dialog')).toBeVisible();
	}
}

test.describe('Using Complex Page Objects', () => {
	let dashboard: DashboardPage;

	test.beforeEach(async ({ page }) => {
		dashboard = new DashboardPage(page);
		await dashboard.goto();
	});

	test('✅ navigate and edit profile', async () => {
		await expect(dashboard.userProfile.name).toHaveText('John Doe');
		await dashboard.editProfile();
	});

	test('✅ filter activities', async () => {
		await dashboard.filterActivity('today');
		await expect(dashboard.recentActivity.items).toHaveCount(3);
	});
});

// ==================== BAD PRACTICES - AVOID ====================

test.describe.skip('BAD: Poor Test Structure', () => {
	test('❌ God test - does too much', async ({ page }) => {
		// BAD: One test doing many unrelated things
		await page.goto('/app');

		// Test 1: Login
		await page.getByLabel('Email').fill('user@test.com');
		await page.getByRole('button', { name: 'Login' }).click();

		// Test 2: Create item
		await page.getByRole('button', { name: 'Add' }).click();
		await page.getByLabel('Name').fill('Item 1');

		// Test 3: Edit item
		await page.getByRole('button', { name: 'Edit' }).click();

		// Test 4: Delete item
		await page.getByRole('button', { name: 'Delete' }).click();

		// PROBLEMS:
		// - Hard to debug (which part failed?)
		// - Hard to maintain
		// - Not focused on single behavior
		// - All tests fail if one step fails
	});

	test('❌ Duplicate code everywhere', async ({ page }) => {
		// BAD: Repeated code not extracted
		await page.goto('/login');
		await page.getByLabel('Email').fill('user@test.com');
		await page.getByLabel('Password').fill('password');
		await page.getByRole('button', { name: 'Sign In' }).click();

		// Same login code copy-pasted in every test

		// PROBLEMS:
		// - Hard to maintain
		// - If login changes, update 50 tests
		// - Error-prone
	});

	test('❌ Vague test names', async ({ page }) => {
		// BAD: Unclear what this tests
		await page.goto('/app');
		// ...test logic

		// PROBLEMS:
		// - Can't tell what behavior is tested
		// - Hard to find related tests
	});

	test.skip('❌ Test with unclear intent', async ({ page }) => {
		await page.goto('/app');
		await page.locator('button').first().click();
		await page.waitForTimeout(1000);
		const text = await page.locator('div').textContent();
		expect(text).toBeTruthy();

		// PROBLEMS:
		// - What are we testing?
		// - Which button? Which div?
		// - Why wait 1 second?
	});
});

// ==================== BEST PRACTICES SUMMARY ====================

test.describe('Structure Best Practices', () => {
	test('✅ Well-structured test', async ({ page }) => {
		// 1. Clear test name describing behavior
		// 2. Arrange: Setup
		const loginPage = new LoginPage(page);
		await loginPage.goto();

		// 3. Act: Perform action
		await loginPage.login('test@example.com', 'password123');

		// 4. Assert: Verify result
		await expect(page).toHaveURL(/.*dashboard/);
	});
});

/**
 * KEY TAKEAWAYS:
 *
 * ✅ DO:
 * - Use Page Object Model for complex pages
 * - Extract reusable helpers
 * - Group related tests with describe blocks
 * - Parameterize tests to reduce duplication
 * - Use clear, descriptive test names
 * - Keep tests focused on single behavior
 * - Follow Arrange-Act-Assert pattern
 *
 * ❌ DON'T:
 * - Write god tests that do everything
 * - Duplicate code across tests
 * - Use vague test names like "test 1"
 * - Mix multiple behaviors in one test
 * - Put all page interactions in page objects (keep assertions in tests)
 *
 * RESULT: Maintainable, readable, organized tests
 */
