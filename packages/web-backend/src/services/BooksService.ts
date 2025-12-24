import type {
	Book,
	BookListResponse,
	BooksListQuery,
	BulkDeleteResponse,
	CreateBook,
	FailedDeletion,
	PatchBook,
	UpdateBook,
} from '@app/shared/api/books.contract';
import { ConflictException, ERROR_CODES, NotFoundException } from '@app/shared/exceptions/http-exceptions';

import type { BooksRepository } from '../repositories/BooksRepository';

/**
 * ===========================================================================================
 * BOOKS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for books.
 * Responsibilities:
 * - Pagination
 * - Optimistic locking (version management)
 * - Business validation (ISBN uniqueness, etc.)
 * - Search/filter orchestration
 *
 * ===========================================================================================
 */

export class BooksService {
	constructor(private readonly repository: BooksRepository) {}

	/**
	 * List books with pagination and filters
	 */
	async list(query: BooksListQuery): Promise<BookListResponse> {
		// Get filtered results
		let items = await this.repository.findAll(query);

		// Pagination with sanitization
		// Ensure page is at least 1 (handle 0, negative, or undefined)
		const page = Math.max(query.page || 1, 1);
		// Ensure pageSize is between 1 and 100
		const pageSize = Math.min(Math.max(query.pageSize || 10, 1), 100);
		const total = items.length;
		const totalPages = Math.ceil(total / pageSize);

		// Slice for current page
		const start = (page - 1) * pageSize;
		const end = start + pageSize;
		items = items.slice(start, end);

		return {
			items,
			pagination: {
				total,
				page,
				pageSize,
				totalPages,
			},
		};
	}

	/**
	 * Get book by ID
	 */
	async getById(id: string): Promise<Book> {
		const book = await this.repository.findById(id);
		if (!book) {
			throw new NotFoundException(`Book with id ${id} not found`, ERROR_CODES.BOOK_NOT_FOUND);
		}
		return book;
	}

	/**
	 * Get book by ISBN
	 * Used for ISBN validation before creating/updating
	 * @param isbn - The ISBN to search for
	 * @param excludeBookId - Optional book ID to exclude from the search (for edit mode)
	 */
	async getByISBN(isbn: string, excludeBookId?: string): Promise<Book> {
		const book = await this.repository.findByISBN(isbn);
		if (!book) {
			throw new NotFoundException(`Book with ISBN ${isbn} not found`, ERROR_CODES.BOOK_NOT_FOUND);
		}
		// If we're checking ISBN for a book being edited, don't return it as "taken"
		if (excludeBookId && book.id === excludeBookId) {
			throw new NotFoundException(`Book with ISBN ${isbn} not found`, ERROR_CODES.BOOK_NOT_FOUND);
		}
		return book;
	}

	/**
	 * Create a new book
	 */
	async create(data: CreateBook): Promise<Book> {
		// Business validation: ISBN uniqueness
		if (data.isbn) {
			const existing = await this.repository.findByISBN(data.isbn);
			if (existing) {
				throw new ConflictException(
					`A book with ISBN ${data.isbn} already exists`,
					ERROR_CODES.DUPLICATE_ISBN,
					{ isbn: data.isbn, existingBookId: existing.id }
				);
			}
		}

		// Create via repository
		return this.repository.create(data);
	}

	/**
	 * Update an existing book (with optimistic locking)
	 */
	async update(id: string, data: UpdateBook): Promise<Book> {
		// Get current entity
		const current = await this.getById(id);

		// Optimistic locking check
		if (current.version !== data.version) {
			throw new ConflictException(
				`Book has been modified by another user. Expected version ${data.version}, but current version is ${current.version}.`,
				ERROR_CODES.VERSION_MISMATCH,
				{ expectedVersion: data.version, currentVersion: current.version }
			);
		}

		// Business validation: ISBN uniqueness (if changing ISBN)
		if (data.isbn && data.isbn !== current.isbn) {
			const existing = await this.repository.findByISBN(data.isbn);
			if (existing && existing.id !== id) {
				throw new ConflictException(
					`A book with ISBN ${data.isbn} already exists`,
					ERROR_CODES.DUPLICATE_ISBN,
					{ isbn: data.isbn, existingBookId: existing.id }
				);
			}
		}

		// Update via repository (increment version)
		const updated = await this.repository.update(id, {
			...data,
			version: current.version + 1,
		});

		return updated;
	}

	/**
	 * Partially update a book (merge changes with version check)
	 * Similar to update() but accepts all optional fields (except version)
	 */
	async partialUpdate(id: string, partialData: PatchBook): Promise<Book> {
		// 1. Get current entity (throws NotFoundException if not found)
		const current = await this.getById(id);

		// 2. Optimistic locking check (SAME as update())
		if (current.version !== partialData.version) {
			throw new ConflictException(
				`Book has been modified by another user. Expected version ${partialData.version}, but current version is ${current.version}.`,
				ERROR_CODES.VERSION_MISMATCH,
				{ expectedVersion: partialData.version, currentVersion: current.version }
			);
		}

		// 3. Business validation: ISBN uniqueness (only if changing ISBN)
		if (partialData.isbn && partialData.isbn !== current.isbn) {
			const existing = await this.repository.findByISBN(partialData.isbn);
			if (existing && existing.id !== id) {
				throw new ConflictException(
					`A book with ISBN ${partialData.isbn} already exists`,
					ERROR_CODES.DUPLICATE_ISBN,
					{ isbn: partialData.isbn, existingBookId: existing.id }
				);
			}
		}

		// 4. Update via repository (increment version)
		const updated = await this.repository.update(id, {
			...partialData,
			version: current.version + 1,
		});

		return updated;
	}

	/**
	 * Delete a book
	 */
	async delete(id: string): Promise<void> {
		// Check if exists
		await this.getById(id);

		// Delete via repository
		await this.repository.delete(id);
	}

	/**
	 * Delete multiple books (best-effort approach)
	 * Returns detailed results for each ID
	 */
	async bulkDelete(ids: string[]): Promise<BulkDeleteResponse> {
		const deleted: string[] = [];
		const failed: FailedDeletion[] = [];

		for (const id of ids) {
			try {
				// Validate book exists (throws NotFoundException if not)
				await this.getById(id);

				// Delete via repository
				await this.repository.delete(id);

				deleted.push(id);
			} catch (error) {
				// Collect failure information
				if (error instanceof NotFoundException) {
					failed.push({
						id,
						reason: `Book with id ${id} not found`,
						code: ERROR_CODES.BOOK_NOT_FOUND,
					});
				} else {
					failed.push({
						id,
						reason: error instanceof Error ? error.message : 'Unknown error',
						code: ERROR_CODES.INTERNAL_SERVER_ERROR,
					});
				}
			}
		}

		return {
			success: true,
			deleted,
			failed,
			totalRequested: ids.length,
			totalDeleted: deleted.length,
			totalFailed: failed.length,
		};
	}
}
