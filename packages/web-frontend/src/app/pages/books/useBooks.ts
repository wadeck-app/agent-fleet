import { useCallback, useState } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Book, BulkDeleteResponse, CreateBook, PatchBook, UpdateBook } from '@shared/api/books.contract';

import { booksService } from './BooksService';

/**
 * ===========================================================================================
 * USE BOOKS HOOK - State Management & API Interface
 * ===========================================================================================
 *
 * Responsibilities:
 * - Manage loading, error, and data states
 * - Expose CRUD operations to components
 * - Handle side effects (loading data on mount)
 * - Provide clean interface for components
 * - Support backend pagination and sorting
 *
 * ===========================================================================================
 */

export interface UseBooksParams {
	page?: number;
	pageSize?: number;
	sortBy?: string; // comma-separated column names
	sortOrder?: string; // comma-separated asc/desc
	search?: string; // search query for title and author
}

export interface UseBooksResult {
	// Data state
	books: Book[];
	loading: boolean;
	error: string | null;
	pagination: {
		total: number;
		page: number;
		pageSize: number;
		totalPages: number;
	} | null;

	// Operations
	loadBooks: (params?: UseBooksParams) => Promise<void>;
	refreshBook: (id: string) => Promise<Book | null>;
	createBook: (data: CreateBook) => Promise<void>;
	updateBook: (id: string, data: UpdateBook) => Promise<void>;
	patchBook: (id: string, data: PatchBook) => Promise<Book>;
	deleteBook: (id: string) => Promise<void>;
	bulkDeleteBooks: (ids: string[]) => Promise<BulkDeleteResponse>;
	checkISBN: (isbn: string, excludeBookId?: string) => Promise<Book | null>;
	clearError: () => void;
	setBooks: React.Dispatch<React.SetStateAction<Book[]>>;

	// Computed values
	totalCount: number;
}

export function useBooks(params?: UseBooksParams): UseBooksResult {
	const [books, setBooks] = useState<Book[]>([]);
	const [pagination, setPagination] = useState<{
		total: number;
		page: number;
		pageSize: number;
		totalPages: number;
	} | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	/**
	 * Load books from the API with pagination and sorting
	 *
	 * Used for explicit reloads after CRUD operations (create, update, delete).
	 * Direct param changes are now handled by useEffect with race condition protection.
	 */
	const loadBooks = useCallback(async (newParams?: UseBooksParams) => {
		try {
			setLoading(true);
			setError(null);
			const data = await booksService.getBooks(newParams);
			setBooks(data.items);
			setPagination(data.pagination ?? null);
		} catch (err) {
			const message = getErrorMessage(err);
			setError(message);
			console.error('Error loading books:', err);
		} finally {
			setLoading(false);
		}
	}, []);

	/**
	 * Refresh a single book by ID from the API
	 * Updates the book in the local array if found
	 * Returns the refreshed book or null if not found
	 */
	const refreshBook = async (id: string): Promise<Book | null> => {
		try {
			setError(null);
			const refreshedBook = await booksService.getBook(id);
			// Update the book in the local array
			setBooks(prevBooks => prevBooks.map(book => (book.id === id ? refreshedBook : book)));
			return refreshedBook;
		} catch (err: unknown) {
			const message = getErrorMessage(err) || 'Failed to refresh book';
			setError(message);
			console.error('Error refreshing book:', err);
			return null;
		}
	};

	/**
	 * Create a new book
	 */
	const createBook = async (data: CreateBook) => {
		try {
			setError(null);
			await booksService.createBook(data);
			await loadBooks();
		} catch (err: unknown) {
			// Use getErrorMessage to extract user-friendly error message
			const message = getErrorMessage(err) || 'Failed to create book';
			setError(message);
			console.error('Error creating book:', err);
			throw err;
		}
	};

	/**
	 * Update an existing book
	 */
	const updateBook = async (id: string, data: CreateBook & { version: number }) => {
		try {
			setError(null);
			await booksService.updateBook(id, data);
			await loadBooks();
		} catch (err: unknown) {
			// Use getErrorMessage to extract user-friendly error message
			const message = getErrorMessage(err) || 'Failed to update book';
			setError(message);
			console.error('Error updating book:', err);
			throw err;
		}
	};

	/**
	 * Partially update a book (PATCH)
	 * Returns the updated book and updates it in the local books array
	 */
	const patchBook = async (id: string, data: Partial<CreateBook> & { version: number }): Promise<Book> => {
		try {
			setError(null);
			const updatedBook = await booksService.patchBook(id, data);
			// Update the book in the local array to keep version in sync
			setBooks(prevBooks => prevBooks.map(book => (book.id === id ? updatedBook : book)));
			return updatedBook;
		} catch (err: unknown) {
			// Use getErrorMessage to extract user-friendly error message
			const message = getErrorMessage(err) || 'Failed to patch book';
			setError(message);
			console.error('Error patching book:', err);
			throw err;
		}
	};

	/**
	 * Delete a book
	 */
	const deleteBook = async (id: string) => {
		try {
			setError(null);
			await booksService.deleteBook(id);
			await loadBooks();
		} catch (err: unknown) {
			// Use getErrorMessage to extract user-friendly error message
			const message = getErrorMessage(err) || 'Failed to delete book';
			setError(message);
			console.error('Error deleting book:', err);
			throw err;
		}
	};

	/**
	 * Delete multiple books at once
	 * Note: No loading state or table refresh here
	 * Optimistic UI handles this at the page level
	 */
	const bulkDeleteBooks = useCallback(async (ids: string[]) => {
		const result = await booksService.bulkDeleteBooks(ids);
		return result;
	}, []);

	/**
	 * Check if an ISBN is already taken
	 * Returns Book if ISBN is taken, null if available (404)
	 * @param isbn - The ISBN to check
	 * @param excludeBookId - Optional book ID to exclude from the check (for edit mode)
	 */
	const checkISBN = async (isbn: string, excludeBookId?: string): Promise<Book | null> => {
		try {
			return await booksService.checkISBN(isbn, excludeBookId);
		} catch (err: unknown) {
			// Use getErrorMessage to extract user-friendly error message
			const message = getErrorMessage(err) || 'Failed to check ISBN';
			setError(message);
			console.error('Error checking ISBN:', err);
			throw err;
		}
	};

	/**
	 * Clear the current error
	 */
	const clearError = () => {
		setError(null);
	};

	/**
	 * Load books when params change
	 * Uses useAbortableEffect to cancel stale requests and prevent race conditions
	 */
	useAbortableEffect(
		async signal => {
			try {
				setLoading(true);
				setError(null);
				const data = await booksService.getBooks(params);

				// Only update state if request wasn't aborted
				if (!signal.aborted) {
					setBooks(data.items);
					setPagination(data.pagination ?? null);
				}
			} catch (err) {
				// Ignore aborted requests
				if (!signal.aborted) {
					const message = getErrorMessage(err);
					setError(message);
					console.error('Error loading books:', err);
				}
			} finally {
				if (!signal.aborted) {
					setLoading(false);
				}
			}
		},
		[params?.page, params?.pageSize, params?.sortBy, params?.sortOrder, params?.search]
	);

	/**
	 * Total count of books
	 */
	const totalCount = pagination?.total ?? books.length;

	return {
		// Data state
		books,
		loading,
		error,
		pagination,

		// Operations
		loadBooks,
		refreshBook,
		createBook,
		updateBook,
		patchBook,
		deleteBook,
		bulkDeleteBooks,
		checkISBN,
		setBooks,
		clearError,

		// Computed values
		totalCount,
	};
}
