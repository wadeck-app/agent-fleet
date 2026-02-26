import { withMetadata } from '@framework/tests/withMetadata';
import type { Book, CreateBook, UpdateBook } from '@shared/api/books.contract';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { booksService } from './BooksService';
import { useBooks } from './useBooks';

// Mock the service layer
vi.mock('./BooksService', () => ({
	booksService: {
		getBooks: vi.fn(),
		createBook: vi.fn(),
		updateBook: vi.fn(),
		patchBook: vi.fn(),
		deleteBook: vi.fn(),
		checkISBN: vi.fn(),
		calculateTotalPages: vi.fn(),
	},
}));

describe('useBooks', () => {
	const mockBooks: Book[] = [
		withMetadata({
			id: '1',
			title: 'Clean Code',
			author: 'Robert C. Martin',
			pages: 464,
			genre: 'Programming',
		}),
		withMetadata({
			id: '2',
			title: 'The Pragmatic Programmer',
			author: 'Andrew Hunt',
			pages: 352,
			genre: 'Programming',
		}),
	];

	beforeEach(() => {
		vi.clearAllMocks();
		// Setup default mock behavior
		vi.mocked(booksService.calculateTotalPages).mockReturnValue(816);
	});

	describe('initial load', () => {
		it('should load books on mount', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const { result } = renderHook(() => useBooks());

			// Initially loading
			expect(result.current.loading).toBe(true);
			expect(result.current.books).toEqual([]);

			// Wait for data to load
			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.books).toEqual(mockBooks);
			expect(result.current.error).toBeNull();
			expect(booksService.getBooks).toHaveBeenCalledOnce();
		});

		it('should handle load errors', async () => {
			const error = new Error('Failed to load books');
			vi.mocked(booksService.getBooks).mockRejectedValue(error);

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.error).toBe('Failed to load books');
			expect(result.current.books).toEqual([]);
		});
	});

	describe('createBook', () => {
		it('should create a new book and reload list', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const newBook: CreateBook = {
				title: 'Design Patterns',
				author: 'Gang of Four',
				pages: 395,
				genre: 'Programming',
			};

			const createdBook: Book = withMetadata({
				id: '3',
				...newBook,
			});

			vi.mocked(booksService.createBook).mockResolvedValue(createdBook);

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Create book
			await act(async () => {
				await result.current.createBook(newBook);
			});

			expect(booksService.createBook).toHaveBeenCalledWith(newBook);
			// Should reload after create
			expect(booksService.getBooks).toHaveBeenCalledTimes(2);
		});

		it('should handle creation errors', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const newBook: CreateBook = {
				title: 'Design Patterns',
				author: 'Gang of Four',
				pages: 395,
				genre: 'Programming',
			};

			const error = new Error('Creation failed');
			vi.mocked(booksService.createBook).mockRejectedValue(error);

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await expect(result.current.createBook(newBook)).rejects.toThrow('Creation failed');
			});

			// Wait for state update to complete
			await waitFor(() => {
				expect(result.current.error).toBe('Creation failed');
			});
		});

		it('should clear error state before creation', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const newBook: CreateBook = {
				title: 'Design Patterns',
				author: 'Gang of Four',
				pages: 395,
				genre: 'Programming',
			};

			const createdBook: Book = withMetadata({
				id: '3',
				...newBook,
			});

			vi.mocked(booksService.createBook).mockResolvedValue(createdBook);

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Create book
			await act(async () => {
				await result.current.createBook(newBook);
			});

			expect(result.current.error).toBeNull();
		});
	});

	describe('updateBook', () => {
		it('should update a book and reload list', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const updateData: CreateBook = {
				title: 'Clean Code (Updated)',
				author: 'Robert C. Martin',
				pages: 500,
				genre: 'Programming',
			};

			const updateBook: UpdateBook = withMetadata({
				...updateData,
			});
			const updatedBook: Book = withMetadata({
				id: '1',
				...updateBook,
			});

			vi.mocked(booksService.updateBook).mockResolvedValue(updatedBook);

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Update book
			await act(async () => {
				await result.current.updateBook('1', updateBook);
			});

			expect(booksService.updateBook).toHaveBeenCalledWith('1', updateBook);
			// Should reload after update
			expect(booksService.getBooks).toHaveBeenCalledTimes(2);
		});

		it('should handle update errors', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const updateBook: UpdateBook = {
				version: 1,
				title: 'Clean Code (Updated)',
				author: 'Robert C. Martin',
				pages: 500,
				genre: 'Programming',
			};

			const error = new Error('Update failed');
			vi.mocked(booksService.updateBook).mockRejectedValue(error);

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await expect(result.current.updateBook('1', updateBook)).rejects.toThrow('Update failed');
			});

			// Wait for state update to complete
			await waitFor(() => {
				expect(result.current.error).toBe('Update failed');
			});
		});
	});

	describe('deleteBook', () => {
		it('should delete a book and reload list', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});
			vi.mocked(booksService.deleteBook).mockResolvedValue(undefined);

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Delete book
			await act(async () => {
				await result.current.deleteBook('1');
			});

			expect(booksService.deleteBook).toHaveBeenCalledWith('1');
			// Should reload after delete
			expect(booksService.getBooks).toHaveBeenCalledTimes(2);
		});

		it('should handle deletion errors', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const error = new Error('Deletion failed');
			vi.mocked(booksService.deleteBook).mockRejectedValue(error);

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await expect(result.current.deleteBook('1')).rejects.toThrow('Deletion failed');
			});

			// Wait for state update to complete
			await waitFor(() => {
				expect(result.current.error).toBe('Deletion failed');
			});
		});
	});

	describe('clearError', () => {
		it('should clear error state', async () => {
			const error = new Error('Failed to load books');
			vi.mocked(booksService.getBooks).mockRejectedValue(error);

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.error).toBe('Failed to load books');
			});

			// Clear error
			act(() => {
				result.current.clearError();
			});

			// Wait for state update to complete
			await waitFor(() => {
				expect(result.current.error).toBeNull();
			});
		});
	});

	describe('computed values', () => {
		it('should calculate totalCount correctly', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.totalCount).toBe(2);
		});
	});

	describe('checkISBN', () => {
		it('should return book when ISBN is taken', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const existingBook: Book = withMetadata({
				id: '3',
				title: 'Design Patterns',
				author: 'Gang of Four',
				isbn: '978-0201633610',
				pages: 395,
				genre: 'Programming',
			});

			vi.mocked(booksService.checkISBN).mockResolvedValue(existingBook);

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			const isbn = '978-0201633610';
			let checkResult;
			await act(async () => {
				checkResult = await result.current.checkISBN(isbn);
			});

			expect(booksService.checkISBN).toHaveBeenCalledWith(isbn, undefined);
			expect(checkResult).toEqual(existingBook);
		});

		it('should return null when ISBN is available (404)', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});
			vi.mocked(booksService.checkISBN).mockResolvedValue(null);

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			const isbn = '978-9999999999';
			let checkResult;
			await act(async () => {
				checkResult = await result.current.checkISBN(isbn);
			});

			expect(booksService.checkISBN).toHaveBeenCalledWith(isbn, undefined);
			expect(checkResult).toBeNull();
		});

		it('should set error state on failure', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const error = new Error('Network error');
			vi.mocked(booksService.checkISBN).mockRejectedValue(error);

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await expect(result.current.checkISBN('978-0201633610')).rejects.toThrow('Network error');
			});

			await waitFor(() => {
				expect(result.current.error).toBe('Network error');
			});
		});

		it('should not set error on 404 response', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});
			vi.mocked(booksService.checkISBN).mockResolvedValue(null);

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await result.current.checkISBN('978-9999999999');
			});

			expect(result.current.error).toBeNull();
		});
	});

	describe('patchBook', () => {
		it('should patch book and reload list', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const patchData = {
				isbn: '978-1234567890',
				version: 1,
			};

			const patchedBook: Book = withMetadata(
				{
					id: '1',
					title: 'Clean Code',
					author: 'Robert C. Martin',
					isbn: '978-1234567890',
					pages: 464,
					genre: 'Programming',
				},
				{ version: 2 }
			);

			vi.mocked(booksService.patchBook).mockResolvedValue(patchedBook);

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await result.current.patchBook('1', patchData);
			});

			expect(booksService.patchBook).toHaveBeenCalledWith('1', patchData);
			// patchBook updates locally without reloading
			expect(booksService.getBooks).toHaveBeenCalledTimes(1);
		});

		it('should set error state on 409 conflict (version)', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const patchData = {
				isbn: '978-1234567890',
				version: 1,
			};

			const error = new Error('Version conflict');
			vi.mocked(booksService.patchBook).mockRejectedValue(error);

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await expect(result.current.patchBook('1', patchData)).rejects.toThrow('Version conflict');
			});

			await waitFor(() => {
				expect(result.current.error).toBe('Version conflict');
			});
		});

		it('should set error state on 409 conflict (ISBN duplicate)', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const patchData = {
				isbn: '978-0135957059',
				version: 1,
			};

			const error = new Error('ISBN already exists');
			vi.mocked(booksService.patchBook).mockRejectedValue(error);

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await expect(result.current.patchBook('1', patchData)).rejects.toThrow('ISBN already exists');
			});

			await waitFor(() => {
				expect(result.current.error).toBe('ISBN already exists');
			});
		});

		it('should clear error state before patching', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const patchData = {
				isbn: '978-1234567890',
				version: 1,
			};

			const patchedBook: Book = withMetadata(
				{
					id: '1',
					title: 'Clean Code',
					author: 'Robert C. Martin',
					isbn: '978-1234567890',
					pages: 464,
					genre: 'Programming',
				},
				{ version: 2 }
			);

			vi.mocked(booksService.patchBook).mockResolvedValue(patchedBook);

			const { result } = renderHook(() => useBooks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await result.current.patchBook('1', patchData);
			});

			expect(result.current.error).toBeNull();
		});
	});

	describe('params preservation after CRUD', () => {
		const sortParams = { sortBy: 'title', sortOrder: 'asc', page: 3, pageSize: 20 };

		it('should reload with current params after createBook', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 3, pageSize: 20, totalPages: 1 },
			});

			const newBook: CreateBook = {
				title: 'Design Patterns',
				author: 'Gang of Four',
				pages: 395,
				genre: 'Programming',
			};

			const createdBook: Book = withMetadata({ id: '3', ...newBook });
			vi.mocked(booksService.createBook).mockResolvedValue(createdBook);

			const { result } = renderHook(() => useBooks(sortParams));

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await result.current.createBook(newBook);
			});

			const calls = vi.mocked(booksService.getBooks).mock.calls;
			const lastCall = calls[calls.length - 1][0];
			expect(lastCall).toEqual(
				expect.objectContaining({
					sortBy: 'title',
					sortOrder: 'asc',
					page: 3,
					pageSize: 20,
				})
			);
		});

		it('should reload with current params after updateBook', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 3, pageSize: 20, totalPages: 1 },
			});

			const updateData = {
				title: 'Clean Code (Updated)',
				author: 'Robert C. Martin',
				pages: 500,
				genre: 'Programming',
				version: 1,
			};

			const updatedBook: Book = withMetadata({ id: '1', ...updateData });
			vi.mocked(booksService.updateBook).mockResolvedValue(updatedBook);

			const { result } = renderHook(() => useBooks(sortParams));

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await result.current.updateBook('1', updateData);
			});

			const calls = vi.mocked(booksService.getBooks).mock.calls;
			const lastCall = calls[calls.length - 1][0];
			expect(lastCall).toEqual(
				expect.objectContaining({
					sortBy: 'title',
					sortOrder: 'asc',
					page: 3,
					pageSize: 20,
				})
			);
		});

		it('should reload with current params after deleteBook', async () => {
			vi.mocked(booksService.getBooks).mockResolvedValue({
				items: mockBooks,
				pagination: { total: 2, page: 3, pageSize: 20, totalPages: 1 },
			});
			vi.mocked(booksService.deleteBook).mockResolvedValue(undefined);

			const { result } = renderHook(() => useBooks(sortParams));

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await result.current.deleteBook('1');
			});

			const calls = vi.mocked(booksService.getBooks).mock.calls;
			const lastCall = calls[calls.length - 1][0];
			expect(lastCall).toEqual(
				expect.objectContaining({
					sortBy: 'title',
					sortOrder: 'asc',
					page: 3,
					pageSize: 20,
				})
			);
		});
	});
});
