import { getErrorStatus } from '@framework/utils/errors/errorUtils';
import { createValidator } from '@framework/utils/validation/validation';
import { required } from '@framework/utils/validation/validation';
import { maxLength } from '@framework/utils/validation/validation';
import { optional } from '@framework/utils/validation/validation';
import { nonNegative } from '@framework/utils/validation/validation';
import { year } from '@framework/utils/validation/validation';
import { combine } from '@framework/utils/validation/validation';
import { type ValidationResult } from '@framework/utils/validation/validation';
import type {
	Book,
	BookListResponse,
	BooksListQuery,
	BulkDeleteResponse,
	CreateBook,
} from '@shared/api/books.contract';

import { booksApi } from '@app/api/client';

/**
 * ===========================================================================================
 * BOOKS SERVICE - Business Logic Layer
 * ===========================================================================================
 *
 * Responsibilities:
 * - Encapsulate business logic and data transformations
 * - Coordinate multiple API calls if needed
 * - Provide higher-level operations
 * - Keep the business rules centralized
 * - Validate data using centralized validation library
 *
 * ===========================================================================================
 */

export interface GetBooksParams {
	page?: number;
	pageSize?: number;
	sortBy?: string; // comma-separated column names
	sortOrder?: string; // comma-separated asc/desc
	search?: string; // search query for title and author
}

export class BooksService {
	/**
	 * Centralized validation schema for book data
	 */
	private readonly bookValidator = createValidator<CreateBook>({
		title: combine(required('Title'), maxLength(200, 'Title')),
		author: combine(required('Author'), maxLength(100, 'Author')),
		isbn: optional(maxLength(50, 'ISBN')),
		publishedYear: optional(year('Published year')),
		genre: optional(maxLength(100, 'Genre')),
		pages: optional(nonNegative('Pages')),
	});

	/**
	 * Get books with pagination and sorting
	 */
	async getBooks(params?: GetBooksParams): Promise<BookListResponse> {
		const query: Partial<BooksListQuery> = {};
		if (params?.page) query.page = params.page;
		if (params?.pageSize) query.pageSize = params.pageSize;
		if (params?.sortBy) query.sortBy = params.sortBy;
		if (params?.sortOrder) query.sortOrder = params.sortOrder;
		if (params?.search) query.search = params.search;

		return await booksApi.getAll(query as BooksListQuery);
	}

	/**
	 * Get all books (legacy - use getBooks for pagination/sorting)
	 */
	async getAllBooks(): Promise<Book[]> {
		const response = await booksApi.getAll();
		return response.items;
	}

	/**
	 * Get a single book by ID
	 */
	async getBook(id: string): Promise<Book> {
		return await booksApi.getById(id);
	}

	/**
	 * Validate book data using centralized validation library
	 */
	validateBookData(data: CreateBook): ValidationResult {
		return this.bookValidator(data);
	}

	/**
	 * Create a new book
	 */
	async createBook(data: CreateBook): Promise<Book> {
		// Validate before sending to API
		const validation = this.validateBookData(data);
		if (!validation.valid) {
			throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
		}

		return await booksApi.create(data);
	}

	/**
	 * Update an existing book
	 */
	async updateBook(id: string, data: CreateBook & { version: number }): Promise<Book> {
		// Validate before sending to API
		const validation = this.validateBookData(data);
		if (!validation.valid) {
			throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
		}

		return await booksApi.update(id, data);
	}

	/**
	 * Delete a book
	 */
	async deleteBook(id: string): Promise<void> {
		await booksApi.delete(id);
	}

	/**
	 * Delete multiple books at once
	 */
	async bulkDeleteBooks(ids: string[]): Promise<BulkDeleteResponse> {
		return await booksApi.bulkDelete(ids);
	}

	/**
	 * Check if an ISBN is already taken
	 * @param isbn - The ISBN to check
	 * @param excludeBookId - Optional book ID to exclude from the check (for edit mode)
	 * @returns Book if ISBN is taken, null if available (404)
	 * @throws Error on other errors
	 */
	async checkISBN(isbn: string, excludeBookId?: string): Promise<Book | null> {
		try {
			return await booksApi.getByIsbn(isbn, excludeBookId);
		} catch (err: unknown) {
			// 404 means ISBN is available
			if (getErrorStatus(err) === 404) {
				return null;
			}
			throw err;
		}
	}

	/**
	 * Partially update an existing book (PATCH)
	 */
	async patchBook(id: string, data: Partial<CreateBook> & { version: number }): Promise<Book> {
		return await booksApi.patch(id, data);
	}

	/**
	 * Get books by genre
	 * Example of a higher-level operation
	 */
	async getBooksByGenre(genre: string): Promise<Book[]> {
		const allBooks = await this.getAllBooks();
		return allBooks.filter(book => book.genre?.toLowerCase() === genre.toLowerCase());
	}

	/**
	 * Calculate total pages across all books
	 * Example of business logic
	 */
	calculateTotalPages(books: Book[]): number {
		return books.reduce((total, book) => total + (book.pages || 0), 0);
	}
}

// Export singleton instance
export const booksService = new BooksService();
