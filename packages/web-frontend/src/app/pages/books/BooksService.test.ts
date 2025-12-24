import { withMetadata } from '@framework/tests/withMetadata';
import type { Book, CreateBook } from '@shared/api/books.contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { booksApi } from '@app/api/client';

import { BooksService } from './BooksService';

// Mock the API client
vi.mock('@app/api/client', () => ({
	booksApi: {
		getAll: vi.fn(),
		getById: vi.fn(),
		getByIsbn: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn(),
	},
}));

describe('BooksService', () => {
	let service: BooksService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new BooksService();
	});

	describe('getAllBooks', () => {
		it('should return all books from API', async () => {
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

			vi.mocked(booksApi.getAll).mockResolvedValue({
				items: mockBooks,
				pagination: {
					total: 2,
					page: 1,
					pageSize: 10,
					totalPages: 1,
				},
			});

			const result = await service.getAllBooks();

			expect(booksApi.getAll).toHaveBeenCalledOnce();
			expect(result).toEqual(mockBooks);
		});

		it('should handle API errors', async () => {
			const error = new Error('API Error');
			vi.mocked(booksApi.getAll).mockRejectedValue(error);

			await expect(service.getAllBooks()).rejects.toThrow('API Error');
		});
	});

	describe('getBook', () => {
		it('should return a single book by ID', async () => {
			const mockBook: Book = withMetadata({
				id: '1',
				title: 'Clean Code',
				author: 'Robert C. Martin',
				pages: 464,
				genre: 'Programming',
			});

			vi.mocked(booksApi.getById).mockResolvedValue(mockBook);

			const result = await service.getBook('1');

			expect(booksApi.getById).toHaveBeenCalledWith('1');
			expect(result).toEqual(mockBook);
		});

		it('should handle not found errors', async () => {
			const error = new Error('Book not found');
			vi.mocked(booksApi.getById).mockRejectedValue(error);

			await expect(service.getBook('nonexistent')).rejects.toThrow('Book not found');
		});
	});

	describe('createBook', () => {
		it('should create a new book', async () => {
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

			vi.mocked(booksApi.create).mockResolvedValue(createdBook);

			const result = await service.createBook(newBook);

			expect(booksApi.create).toHaveBeenCalledWith(newBook);
			expect(result).toEqual(createdBook);
		});

		it('should handle creation errors', async () => {
			const newBook: CreateBook = {
				title: 'Design Patterns',
				author: 'Gang of Four',
				pages: 395,
				genre: 'Programming',
			};

			const error = new Error('Creation failed');
			vi.mocked(booksApi.create).mockRejectedValue(error);

			await expect(service.createBook(newBook)).rejects.toThrow('Creation failed');
		});
	});

	describe('updateBook', () => {
		it('should update an existing book', async () => {
			const updateData: CreateBook = {
				title: 'Clean Code (Updated)',
				author: 'Robert C. Martin',
				pages: 500,
				genre: 'Programming',
			};

			const updatedBook: Book = withMetadata({
				id: '1',
				...updateData,
			});

			vi.mocked(booksApi.update).mockResolvedValue(updatedBook);

			const result = await service.updateBook('1', { ...updateData, version: 1 });

			expect(booksApi.update).toHaveBeenCalledWith('1', { ...updateData, version: 1 });
			expect(result).toEqual(updatedBook);
		});

		it('should handle update errors', async () => {
			const updateData = withMetadata({
				title: 'Clean Code (Updated)',
				author: 'Robert C. Martin',
				pages: 500,
				genre: 'Programming',
			});

			const error = new Error('Update failed');
			vi.mocked(booksApi.update).mockRejectedValue(error);

			await expect(service.updateBook('1', updateData)).rejects.toThrow('Update failed');
		});
	});

	describe('deleteBook', () => {
		it('should delete a book', async () => {
			vi.mocked(booksApi.delete).mockResolvedValue({ success: true, id: '1' });

			await service.deleteBook('1');

			expect(booksApi.delete).toHaveBeenCalledWith('1');
		});

		it('should handle deletion errors', async () => {
			const error = new Error('Deletion failed');
			vi.mocked(booksApi.delete).mockRejectedValue(error);

			await expect(service.deleteBook('1')).rejects.toThrow('Deletion failed');
		});
	});

	describe('getBooksByGenre', () => {
		it('should filter books by genre', async () => {
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
					title: '1984',
					author: 'George Orwell',
					pages: 328,
					genre: 'Fiction',
				}),
				withMetadata({
					id: '3',
					title: 'The Pragmatic Programmer',
					author: 'Andrew Hunt',
					pages: 352,
					genre: 'Programming',
				}),
			];

			vi.mocked(booksApi.getAll).mockResolvedValue({
				items: mockBooks,
				pagination: {
					total: 3,
					page: 1,
					pageSize: 10,
					totalPages: 1,
				},
			});

			const result = await service.getBooksByGenre('Programming');

			expect(result).toHaveLength(2);
			expect(result[0]?.genre).toBe('Programming');
			expect(result[1]?.genre).toBe('Programming');
		});

		it('should be case insensitive', async () => {
			const mockBooks: Book[] = [
				withMetadata({
					id: '1',
					title: 'Clean Code',
					author: 'Robert C. Martin',
					pages: 464,
					genre: 'Programming',
				}),
			];

			vi.mocked(booksApi.getAll).mockResolvedValue({
				items: mockBooks,
				pagination: {
					total: 1,
					page: 1,
					pageSize: 10,
					totalPages: 1,
				},
			});

			const result = await service.getBooksByGenre('programming');

			expect(result).toHaveLength(1);
			expect(result[0]?.genre).toBe('Programming');
		});

		it('should return empty array when no matches', async () => {
			const mockBooks: Book[] = [
				withMetadata({
					id: '1',
					title: 'Clean Code',
					author: 'Robert C. Martin',
					pages: 464,
					genre: 'Programming',
				}),
			];

			vi.mocked(booksApi.getAll).mockResolvedValue({
				items: mockBooks,
				pagination: {
					total: 1,
					page: 1,
					pageSize: 10,
					totalPages: 1,
				},
			});

			const result = await service.getBooksByGenre('Fiction');

			expect(result).toHaveLength(0);
		});
	});

	describe('calculateTotalPages', () => {
		it('should calculate total pages correctly for multiple books', () => {
			const books: Book[] = [
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

			const result = service.calculateTotalPages(books);

			expect(result).toBe(816);
		});

		it('should return 0 for empty array', () => {
			const result = service.calculateTotalPages([]);

			expect(result).toBe(0);
		});

		it('should handle single book', () => {
			const books: Book[] = [
				withMetadata({
					id: '1',
					title: 'Clean Code',
					author: 'Robert C. Martin',
					pages: 464,
					genre: 'Programming',
				}),
			];

			const result = service.calculateTotalPages(books);

			expect(result).toBe(464);
		});

		it('should handle books without pages', () => {
			const books: Book[] = [
				withMetadata({
					id: '1',
					title: 'Clean Code',
					author: 'Robert C. Martin',
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
			const result = service.calculateTotalPages(books);

			expect(result).toBe(352);
		});
	});

	describe('checkISBN', () => {
		it('should return Book when ISBN exists (taken)', async () => {
			const mockBook: Book = withMetadata({
				id: '1',
				title: 'Clean Code',
				author: 'Robert C. Martin',
				isbn: '978-0135957059',
				pages: 464,
				genre: 'Programming',
			});

			vi.mocked(booksApi.getByIsbn).mockResolvedValue(mockBook);

			const result = await service.checkISBN('978-0135957059');

			expect(booksApi.getByIsbn).toHaveBeenCalledWith('978-0135957059', undefined);
			expect(result).toEqual(mockBook);
		});

		it('should return null when ISBN is available (404)', async () => {
			const error: any = new Error('Not found');
			error.status = 404;
			vi.mocked(booksApi.getByIsbn).mockRejectedValue(error);

			const result = await service.checkISBN('978-9999999999');

			expect(booksApi.getByIsbn).toHaveBeenCalledWith('978-9999999999', undefined);
			expect(result).toBeNull();
		});

		it('should throw error on network failure', async () => {
			const error = new Error('Network error');
			vi.mocked(booksApi.getByIsbn).mockRejectedValue(error);

			await expect(service.checkISBN('978-0135957059')).rejects.toThrow('Network error');
		});

		it('should throw error on server error (500)', async () => {
			const error: any = new Error('Server error');
			error.status = 500;
			vi.mocked(booksApi.getByIsbn).mockRejectedValue(error);

			await expect(service.checkISBN('978-0135957059')).rejects.toThrow('Server error');
		});
	});

	describe('patchBook', () => {
		it('should patch book successfully', async () => {
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

			vi.mocked(booksApi.patch).mockResolvedValue(patchedBook);

			const result = await service.patchBook('1', patchData);

			expect(booksApi.patch).toHaveBeenCalledWith('1', patchData);
			expect(result).toEqual(patchedBook);
			expect(result.version).toBe(2);
		});

		it('should throw ConflictException on 409 error (version conflict)', async () => {
			const patchData = {
				isbn: '978-1234567890',
				version: 1,
			};

			const error: any = new Error('Version conflict');
			error.status = 409;
			vi.mocked(booksApi.patch).mockRejectedValue(error);

			await expect(service.patchBook('1', patchData)).rejects.toThrow('Version conflict');
		});

		it('should throw ConflictException on 409 error (ISBN duplicate)', async () => {
			const patchData = {
				isbn: '978-0135957059',
				version: 1,
			};

			const error: any = new Error('ISBN already exists');
			error.status = 409;
			vi.mocked(booksApi.patch).mockRejectedValue(error);

			await expect(service.patchBook('1', patchData)).rejects.toThrow('ISBN already exists');
		});

		it('should handle patch with multiple fields', async () => {
			const patchData = {
				isbn: '978-1234567890',
				title: 'Clean Code (Updated)',
				version: 1,
			};

			const patchedBook: Book = withMetadata(
				{
					id: '1',
					title: 'Clean Code (Updated)',
					author: 'Robert C. Martin',
					isbn: '978-1234567890',
					pages: 464,
					genre: 'Programming',
				},
				{ version: 2 }
			);

			vi.mocked(booksApi.patch).mockResolvedValue(patchedBook);

			const result = await service.patchBook('1', patchData);

			expect(booksApi.patch).toHaveBeenCalledWith('1', patchData);
			expect(result).toEqual(patchedBook);
		});
	});
});
