import { BooksPage } from '../pages/BooksPage';
import { expect, test } from '../playwright-hooks/hooks-web-server';

/**
 * Integration test for Books page partial update functionality
 * Tests the critical scenario where a user can partially update ISBN
 * without losing other form modifications.
 */

test.describe('Books Page - Partial Update', () => {
	let booksPage: BooksPage;

	test.beforeEach(async ({ page }) => {
		booksPage = new BooksPage(page);
		await booksPage.navigateToBooks();
	});

	test('should allow editing ISBN without losing other form changes', async () => {
		// Step 1: Create initial book
		await booksPage.createBook({
			title: 'Original Title',
			author: 'Original Author',
			isbn: '978-1111111111',
			publishedYear: '2020',
			pages: '300',
		});

		// Step 2: Click Edit on the created book
		await booksPage.clickEditButton();

		// Step 3: Modify Title (but don't submit yet)
		await booksPage.fillBookForm({ title: 'Modified Title' });

		// Verify the modified title is in the field
		expect(await booksPage.getTitleValue()).toBe('Modified Title');

		// Step 4: Modify ISBN
		await booksPage.fillBookForm({ isbn: '978-2222222222' });

		// Step 5: Click "Save ISBN" to partially update
		await booksPage.clickSaveISBN();

		// Step 6: Verify Title modification is still present in the form
		expect(await booksPage.getTitleValue()).toBe('Modified Title');
		expect(await booksPage.getAuthorValue()).toBe('Original Author');
		// Note: Backend normalizes ISBN by removing hyphens
		expect(await booksPage.getISBNValue()).toBe('9782222222222');
		expect(await booksPage.getPublishedYearValue()).toBe('2020');
		expect(await booksPage.getPagesValue()).toBe('300');

		// Step 7: Submit the complete form
		await booksPage.submitForm();

		// Step 8: Verify both modifications are saved in the table
		await booksPage.verifyTextInTable('Modified Title');

		// Click Edit again to verify ISBN was saved
		await booksPage.clickEditButton();
		// Note: Backend normalizes ISBN by removing hyphens
		expect(await booksPage.getISBNValue()).toBe('9782222222222');
	});

	test('should handle optimistic locking conflicts when saving ISBN', async () => {
		// Step 1: Create initial book
		await booksPage.createBook({
			title: 'Test Book',
			author: 'Test Author',
			isbn: '978-3333333333',
		});

		// Step 2: Edit the book
		await booksPage.clickEditButton();

		// Step 3: Modify ISBN
		await booksPage.fillBookForm({ isbn: '978-4444444444' });

		// Step 4: Use "Save ISBN"
		await booksPage.clickSaveISBN();

		// Step 5: Try to save a different ISBN again (should work - version should be updated)
		await booksPage.fillBookForm({ isbn: '978-5555555555' });
		await booksPage.clickSaveISBN();

		// Verify no version conflict error
		await booksPage.verifyNoErrorMessage('Book was modified by another user');
	});

	test('should validate ISBN uniqueness during partial update', async ({ page }) => {
		// Use fixed ISBNs for this test
		const isbn1 = '978-6666666666';
		const isbn2 = '978-7777777777';

		// Step 1: Create first book with ISBN
		await booksPage.createBook({
			title: 'First Book',
			author: 'Author One',
			isbn: isbn1,
		});

		// Step 2: Create second book
		await booksPage.createBook({
			title: 'Second Book',
			author: 'Author Two',
			isbn: isbn2,
		});

		// Step 3: Edit second book (last book in table)
		await booksPage.clickEditButtonLast();

		// Step 4: Try to use Check button with current ISBN (should be valid)
		await booksPage.clickCheckISBN();

		// Wait for check to complete - should show green checkmark
		await booksPage.waitForISBNAvailable();

		// Step 5: Try to change to first book's ISBN
		await booksPage.fillBookForm({ isbn: isbn1 });

		// IMPORTANT: Wait for the previous "available" icon to disappear
		// This ensures the form state has reset after changing the ISBN
		await booksPage.waitForISBNAvailableToDisappear();

		// Step 6: Click Check - should show error
		await booksPage.clickCheckISBN();

		// Should show error about ISBN being taken
		// Note: The full error message includes the book title and author,
		// but we only check for the prefix to avoid brittleness
		await booksPage.verifyErrorMessage('ISBN is already used');
	});
});
