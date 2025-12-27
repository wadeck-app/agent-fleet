import type { Locator, Page } from '@playwright/test';

import { BasePage } from './BasePage';

/**
 * Page Object for Books page
 * Encapsulates all interactions with the Books page
 */
export class BooksPage extends BasePage {
	// Locators
	private readonly booksTab: Locator;
	private readonly addBookButton: Locator;
	private readonly editBookTitle: Locator;
	private readonly titleField: Locator;
	private readonly authorField: Locator;
	private readonly isbnField: Locator;
	private readonly publishedYearField: Locator;
	private readonly pagesField: Locator;
	private readonly genreField: Locator;
	private readonly submitButton: Locator;
	private readonly cancelButton: Locator;
	private readonly checkISBNButton: Locator;
	private readonly saveISBNButton: Locator;
	private readonly isbnAvailableIcon: Locator;

	constructor(page: Page) {
		super(page);
		this.booksTab = page.locator('text=Books');
		this.addBookButton = page.locator('button:has-text("Add Book")');
		this.editBookTitle = page.locator('h2:has-text("Edit Book")');
		this.titleField = page.locator('#field-title');
		this.authorField = page.locator('#field-author');
		this.isbnField = page.locator('#field-isbn');
		this.publishedYearField = page.locator('#field-published-year');
		this.pagesField = page.locator('#field-pages');
		this.genreField = page.locator('#field-genre');
		this.submitButton = page.locator('button[type="submit"]');
		this.cancelButton = page.locator('button:has-text("Cancel")');
		this.checkISBNButton = page.locator('button:has-text("Check")');
		this.saveISBNButton = page.locator('button:has-text("Save ISBN")');
		this.isbnAvailableIcon = page.locator('[title="ISBN is available"]');
	}

	/**
	 * Navigate to Books page
	 */
	async navigateToBooks(): Promise<void> {
		await this.navigate('/books');
		// Wait for "Add Book" button to be visible (indicates page is ready)
		await this.addBookButton.waitFor({ state: 'visible' });
	}

	/**
	 * Click "Add Book" button to open the form
	 */
	async clickAddBook(): Promise<void> {
		await this.addBookButton.click();
	}

	/**
	 * Fill the book form with provided data
	 */
	async fillBookForm(data: {
		title?: string;
		author?: string;
		isbn?: string;
		publishedYear?: string;
		pages?: string;
		genre?: string;
	}): Promise<void> {
		if (data.title !== undefined) {
			await this.titleField.fill(data.title);
		}
		if (data.author !== undefined) {
			await this.authorField.fill(data.author);
		}
		if (data.isbn !== undefined) {
			await this.isbnField.fill(data.isbn);
		}
		if (data.publishedYear !== undefined) {
			await this.publishedYearField.fill(data.publishedYear);
		}
		if (data.pages !== undefined) {
			await this.pagesField.fill(data.pages);
		}
		if (data.genre !== undefined) {
			await this.genreField.fill(data.genre);
		}
	}

	/**
	 * Submit the book form
	 */
	async submitForm(): Promise<void> {
		await this.submitButton.click();
		// Wait for form to close (Add Book button becomes visible)
		await this.addBookButton.waitFor({ state: 'visible' });
		// Wait for the table to update (Edit button should be visible after book creation)
		// Note: Edit button uses aria-label, not visible text
		await this.page
			.getByRole('button', { name: /Edit book/i })
			.first()
			.waitFor({ state: 'visible', timeout: 5000 });
	}

	/**
	 * Cancel the book form
	 */
	async cancelForm(): Promise<void> {
		await this.cancelButton.click();
	}

	/**
	 * Create a book with the provided data
	 */
	async createBook(data: {
		title: string;
		author: string;
		isbn: string;
		publishedYear?: string;
		pages?: string;
		genre?: string;
	}): Promise<void> {
		await this.clickAddBook();
		await this.fillBookForm(data);
		await this.submitForm();
	}

	/**
	 * Click Edit button for a specific book (by index)
	 */
	async clickEditButton(index: number = 0): Promise<void> {
		const editButtons = this.page.getByRole('button', { name: /Edit book/i });
		await editButtons.nth(index).click();
		await this.editBookTitle.waitFor({ state: 'visible' });
	}

	/**
	 * Click Edit button for the last book in the table
	 */
	async clickEditButtonLast(): Promise<void> {
		const editButtons = this.page.getByRole('button', { name: /Edit book/i });
		await editButtons.last().click();
		await this.editBookTitle.waitFor({ state: 'visible' });
	}

	/**
	 * Click "Check" button to validate ISBN
	 * Waits for the button to be ready before clicking
	 */
	async clickCheckISBN(): Promise<void> {
		// Wait for button to be enabled (not disabled by previous operation)
		await this.checkISBNButton.waitFor({ state: 'visible', timeout: 3000 });
		await this.checkISBNButton.click();
	}

	/**
	 * Click "Save ISBN" button to partially update ISBN
	 */
	async clickSaveISBN(): Promise<void> {
		await this.saveISBNButton.click();
		// Wait for button text to return from "Saving..." to "Save ISBN"
		await this.saveISBNButton.waitFor({ state: 'visible', timeout: 3000 });
	}

	/**
	 * Wait for ISBN check to complete and show available icon
	 */
	async waitForISBNAvailable(timeout: number = 3000): Promise<void> {
		await this.isbnAvailableIcon.waitFor({ state: 'visible', timeout });
	}

	/**
	 * Wait for ISBN available icon to disappear
	 */
	async waitForISBNAvailableToDisappear(timeout: number = 3000): Promise<void> {
		await this.isbnAvailableIcon.waitFor({ state: 'hidden', timeout });
	}

	/**
	 * Get the value of the title field
	 */
	async getTitleValue(): Promise<string> {
		return await this.titleField.inputValue();
	}

	/**
	 * Get the value of the author field
	 */
	async getAuthorValue(): Promise<string> {
		return await this.authorField.inputValue();
	}

	/**
	 * Get the value of the ISBN field
	 */
	async getISBNValue(): Promise<string> {
		return await this.isbnField.inputValue();
	}

	/**
	 * Get the value of the published year field
	 */
	async getPublishedYearValue(): Promise<string> {
		return await this.publishedYearField.inputValue();
	}

	/**
	 * Get the value of the pages field
	 */
	async getPagesValue(): Promise<string> {
		return await this.pagesField.inputValue();
	}

	/**
	 * Get the value of the genre field
	 */
	async getGenreValue(): Promise<string> {
		return await this.genreField.inputValue();
	}

	/**
	 * Verify that a text is visible in the table
	 */
	async verifyTextInTable(text: string): Promise<void> {
		await this.page.locator(`text=${text}`).waitFor({ state: 'visible' });
	}

	/**
	 * Verify that an error message is visible
	 */
	async verifyErrorMessage(message: string): Promise<void> {
		await this.page.locator(`text=${message}`).waitFor({ state: 'visible', timeout: 3000 });
	}

	/**
	 * Verify that an error message is NOT visible
	 */
	async verifyNoErrorMessage(message: string): Promise<void> {
		await this.page.locator(`text=${message}`).waitFor({ state: 'hidden' });
	}
}
