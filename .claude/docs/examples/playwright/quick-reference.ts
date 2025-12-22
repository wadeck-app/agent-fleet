import { Page, expect, test } from '@playwright/test';

/**
 * QUICK REFERENCE: Common Scenarios
 *
 * Copy-paste ready patterns for frequent test scenarios
 */

test.describe('Common Scenarios', () => {
	test('form submission', async ({ page }) => {
		await page.goto('/login');

		await page.getByLabel('Email').fill('user@test.com');
		await page.getByLabel('Password').fill('password123');
		await page.getByRole('button', { name: 'Sign In' }).click();
		await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
	});

	test('list interactions', async ({ page }) => {
		await page.goto('/items');

		// Assert count
		await expect(page.getByRole('listitem')).toHaveCount(5);

		// Filter and click specific item
		await page.getByRole('listitem').filter({ hasText: 'Item 3' }).click();
	});

	test('conditional elements', async ({ page }) => {
		await page.goto('/alerts');

		// DON'T check existence first, just assert/act
		await expect(page.getByRole('alert')).toBeVisible(); // Waits and checks
	});

	test('navigation', async ({ page }) => {
		await page.goto('/dashboard');

		await expect(page).toHaveURL(/.*dashboard/);
		await expect(page).toHaveTitle('Dashboard');
	});

	test('modal interactions', async ({ page }) => {
		await page.goto('/app');

		// Open modal
		await page.getByRole('button', { name: 'Open Settings' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();

		// Interact with modal content
		await page.getByLabel('Notification').check();
		await page.getByRole('button', { name: 'Save' }).click();

		// Modal closes
		await expect(page.getByRole('dialog')).toBeHidden();
	});

	test('table interactions', async ({ page }) => {
		await page.goto('/users');

		// Find row and click button in it
		await page
			.getByRole('row')
			.filter({ has: page.getByText('John Doe') })
			.getByRole('button', { name: 'Edit' })
			.click();
	});

	test('file upload', async ({ page }) => {
		await page.goto('/upload');

		// Upload file
		await page.getByLabel('Upload file').setInputFiles('path/to/file.pdf');
		await expect(page.getByText('file.pdf')).toBeVisible();
	});

	test('dropdown selection', async ({ page }) => {
		await page.goto('/form');

		// Select by label
		await page.getByLabel('Country').selectOption('France');
		await expect(page.getByLabel('Country')).toHaveValue('FR');
	});

	test('checkbox and radio buttons', async ({ page }) => {
		await page.goto('/preferences');

		// Check checkbox
		await page.getByLabel('I agree to terms').check();
		await expect(page.getByLabel('I agree to terms')).toBeChecked();

		// Select radio button
		await page.getByLabel('Weekly').check();
		await expect(page.getByLabel('Weekly')).toBeChecked();
	});
});
