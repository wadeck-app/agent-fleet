import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Book, BooksListQuery, CreateBook, PatchBook, UpdateBook } from '@app/shared/api/books.contract';
import { ConflictException, NotFoundException } from '@app/shared/exceptions/http-exceptions';

import type { BooksRepository } from '../repositories/BooksRepository';
import { BooksService } from './BooksService';

/**
 * ===========================================================================================
 * BOOKS SERVICE TESTS
 * ===========================================================================================
 *
 * Test Strategy:
 * - Mock the BooksRepository (unit test - no real dependencies)
 * - Test business logic: pagination, optimistic locking, ISBN uniqueness
 * - Test error handling (NotFoundException, ConflictException)
 * - Cover all edge cases
 *
 * ===========================================================================================
 */

describe('BooksService', () => {
	let service: BooksService;
	let mockRepository: BooksRepository;

	// Sample test data
	const sampleBook: Book = {
		id: '1',
		title: 'The Pragmatic Programmer',
		author: 'Andrew Hunt',
		isbn: '978-0135957059',
		publishedYear: 2019,
		genre: 'Programming',
		pages: 352,
		version: 1,
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
	};

	const anotherBook: Book = {
		id: '2',
		title: 'Clean Code',
		author: 'Robert C. Martin',
		isbn: '978-0132350884',
		publishedYear: 2008,
		genre: 'Programming',
		pages: 464,
		version: 1,
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
	};

	beforeEach(() => {
		// Create mock repository
		mockRepository = {
			findAll: vi.fn(),
			findById: vi.fn(),
			findByISBN: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		} as unknown as BooksRepository;

		// Create service with mock repository
		service = new BooksService(mockRepository);
	});

	describe('list - List books with pagination and filters', () => {
		it('should list all books with default pagination', async () => {
			const books = [sampleBook, anotherBook];
			vi.mocked(mockRepository.findAll).mockResolvedValue(books);

			const result = await service.list({});

			expect(result.items).toHaveLength(2);
			expect(result.items).toEqual(books);
			expect(result.pagination).toEqual({
				total: 2,
				page: 1,
				pageSize: 10,
				totalPages: 1,
			});
			expect(mockRepository.findAll).toHaveBeenCalledWith({});
		});

		it('should paginate results correctly - page 1', async () => {
			const books = Array.from({ length: 15 }, (_, i) => ({
				...sampleBook,
				id: String(i + 1),
				title: `Book ${i + 1}`,
			}));
			vi.mocked(mockRepository.findAll).mockResolvedValue(books);

			const result = await service.list({ page: 1, pageSize: 5 });

			expect(result.items).toHaveLength(5);
			expect(result.items[0].id).toBe('1');
			expect(result.items[4].id).toBe('5');
			expect(result.pagination).toEqual({
				total: 15,
				page: 1,
				pageSize: 5,
				totalPages: 3,
			});
		});

		it('should paginate results correctly - page 2', async () => {
			const books = Array.from({ length: 15 }, (_, i) => ({
				...sampleBook,
				id: String(i + 1),
				title: `Book ${i + 1}`,
			}));
			vi.mocked(mockRepository.findAll).mockResolvedValue(books);

			const result = await service.list({ page: 2, pageSize: 5 });

			expect(result.items).toHaveLength(5);
			expect(result.items[0].id).toBe('6');
			expect(result.items[4].id).toBe('10');
			expect(result.pagination).toEqual({
				total: 15,
				page: 2,
				pageSize: 5,
				totalPages: 3,
			});
		});

		it('should paginate results correctly - last page with fewer items', async () => {
			const books = Array.from({ length: 15 }, (_, i) => ({
				...sampleBook,
				id: String(i + 1),
				title: `Book ${i + 1}`,
			}));
			vi.mocked(mockRepository.findAll).mockResolvedValue(books);

			const result = await service.list({ page: 3, pageSize: 5 });

			expect(result.items).toHaveLength(5);
			expect(result.items[0].id).toBe('11');
			expect(result.items[4].id).toBe('15');
			expect(result.pagination).toEqual({
				total: 15,
				page: 3,
				pageSize: 5,
				totalPages: 3,
			});
		});

		it('should enforce maximum page size of 100', async () => {
			const books = Array.from({ length: 200 }, (_, i) => ({
				...sampleBook,
				id: String(i + 1),
			}));
			vi.mocked(mockRepository.findAll).mockResolvedValue(books);

			const result = await service.list({ page: 1, pageSize: 150 });

			// Should be capped at 100
			expect(result.items).toHaveLength(100);
			expect(result.pagination!.pageSize).toBe(100);
			expect(result.pagination!.totalPages).toBe(2);
		});

		it('should handle empty results', async () => {
			vi.mocked(mockRepository.findAll).mockResolvedValue([]);

			const result = await service.list({});

			expect(result.items).toHaveLength(0);
			expect(result.pagination).toEqual({
				total: 0,
				page: 1,
				pageSize: 10,
				totalPages: 0,
			});
		});

		it('should pass search filter to repository', async () => {
			const query: BooksListQuery = { search: 'Pragmatic' };
			vi.mocked(mockRepository.findAll).mockResolvedValue([sampleBook]);

			await service.list(query);

			expect(mockRepository.findAll).toHaveBeenCalledWith(query);
		});

		it('should pass author filter to repository', async () => {
			const query: BooksListQuery = { author: 'Hunt' };
			vi.mocked(mockRepository.findAll).mockResolvedValue([sampleBook]);

			await service.list(query);

			expect(mockRepository.findAll).toHaveBeenCalledWith(query);
		});

		it('should pass genre filter to repository', async () => {
			const query: BooksListQuery = { genre: 'Programming' };
			vi.mocked(mockRepository.findAll).mockResolvedValue([sampleBook, anotherBook]);

			await service.list(query);

			expect(mockRepository.findAll).toHaveBeenCalledWith(query);
		});
	});

	describe('getById - Get book by ID', () => {
		it('should return book when found', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);

			const result = await service.getById('1');

			expect(result).toEqual(sampleBook);
			expect(mockRepository.findById).toHaveBeenCalledWith('1');
		});

		it('should throw NotFoundException when book not found', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.getById('999')).rejects.toThrow(NotFoundException);
			expect(mockRepository.findById).toHaveBeenCalledWith('999');
		});
	});

	describe('getByISBN - Get book by ISBN', () => {
		it('should return book when found by ISBN', async () => {
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(sampleBook);

			const result = await service.getByISBN('978-0135957059');

			expect(result).toEqual(sampleBook);
			expect(mockRepository.findByISBN).toHaveBeenCalledWith('978-0135957059');
		});

		it('should throw NotFoundException when book not found by ISBN', async () => {
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(null);

			await expect(service.getByISBN('978-9999999999')).rejects.toThrow(NotFoundException);
			expect(mockRepository.findByISBN).toHaveBeenCalledWith('978-9999999999');
		});
	});

	describe('create - Create a new book', () => {
		const createData: CreateBook = {
			title: 'New Book',
			author: 'New Author',
			isbn: '978-1234567890',
			publishedYear: 2024,
			genre: 'Fiction',
			pages: 300,
		};

		it('should create a book successfully', async () => {
			const createdBook: Book = {
				...createData,
				id: '3',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findByISBN).mockResolvedValue(null);
			vi.mocked(mockRepository.create).mockResolvedValue(createdBook);

			const result = await service.create(createData);

			expect(result).toEqual(createdBook);
			expect(mockRepository.findByISBN).toHaveBeenCalledWith('978-1234567890');
			expect(mockRepository.create).toHaveBeenCalledWith(createData);
		});

		it('should throw ConflictException when ISBN already exists', async () => {
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(sampleBook);

			await expect(service.create(createData)).rejects.toThrow(ConflictException);
			expect(mockRepository.findByISBN).toHaveBeenCalledWith('978-1234567890');
			expect(mockRepository.create).not.toHaveBeenCalled();
		});

		it('should create book without ISBN (skip uniqueness check)', async () => {
			const dataWithoutISBN: CreateBook = {
				title: 'New Book',
				author: 'New Author',
			};

			const createdBook: Book = {
				...dataWithoutISBN,
				id: '3',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockRepository.create).mockResolvedValue(createdBook);

			const result = await service.create(dataWithoutISBN);

			expect(result).toEqual(createdBook);
			expect(mockRepository.findByISBN).not.toHaveBeenCalled();
			expect(mockRepository.create).toHaveBeenCalledWith(dataWithoutISBN);
		});
	});

	describe('update - Update an existing book', () => {
		it('should update book successfully', async () => {
			const updateData: UpdateBook = {
				title: 'Updated Title',
				author: 'Andrew Hunt',
				version: 1,
			};

			const updatedBook: Book = {
				...sampleBook,
				title: 'Updated Title',
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedBook);

			const result = await service.update('1', updateData);

			expect(result).toEqual(updatedBook);
			expect(mockRepository.findById).toHaveBeenCalledWith('1');
			expect(mockRepository.update).toHaveBeenCalledWith('1', {
				...updateData,
				version: 2, // Version incremented
			});
		});

		it('should throw NotFoundException when book not found', async () => {
			const updateData: UpdateBook = {
				title: 'Updated Title',
				author: 'Some Author',
				version: 1,
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.update('999', updateData)).rejects.toThrow(NotFoundException);
			expect(mockRepository.findById).toHaveBeenCalledWith('999');
			expect(mockRepository.update).not.toHaveBeenCalled();
		});

		it('should throw ConflictException on version mismatch', async () => {
			const updateData: UpdateBook = {
				title: 'Updated Title',
				author: 'Andrew Hunt',
				version: 1,
			};

			const currentBook: Book = {
				...sampleBook,
				version: 2,
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(currentBook);

			await expect(service.update('1', updateData)).rejects.toThrow(ConflictException);
			expect(mockRepository.update).not.toHaveBeenCalled();
		});

		it('should throw ConflictException when updating ISBN to existing one', async () => {
			const updateData: UpdateBook = {
				title: 'The Pragmatic Programmer',
				author: 'Andrew Hunt',
				isbn: '978-0132350884',
				version: 1,
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(anotherBook);

			await expect(service.update('1', updateData)).rejects.toThrow(ConflictException);
			expect(mockRepository.update).not.toHaveBeenCalled();
		});

		it('should allow updating ISBN to the same value (no conflict)', async () => {
			const updateData: UpdateBook = {
				isbn: '978-0135957059', // Same ISBN as current
				title: 'Updated Title',
				author: 'Andrew Hunt',
				version: 1,
			};

			const updatedBook: Book = {
				...sampleBook,
				title: 'Updated Title',
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(sampleBook); // Same book
			vi.mocked(mockRepository.update).mockResolvedValue(updatedBook);

			const result = await service.update('1', updateData);

			expect(result).toEqual(updatedBook);
			expect(mockRepository.update).toHaveBeenCalled();
		});

		it('should skip ISBN uniqueness check when not changing ISBN', async () => {
			const updateData: UpdateBook = {
				title: 'Updated Title',
				author: 'Andrew Hunt',
				version: 1,
				// No ISBN in update data
			};

			const updatedBook: Book = {
				...sampleBook,
				title: 'Updated Title',
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedBook);

			const result = await service.update('1', updateData);

			expect(result).toEqual(updatedBook);
			expect(mockRepository.findByISBN).not.toHaveBeenCalled();
		});

		it('should allow updating book without ISBN to have ISBN', async () => {
			const bookWithoutISBN: Book = {
				...sampleBook,
				isbn: undefined,
			};

			const updateData: UpdateBook = {
				title: 'The Pragmatic Programmer',
				author: 'Andrew Hunt',
				isbn: '978-1234567890',
				version: 1,
			};

			const updatedBook: Book = {
				...bookWithoutISBN,
				isbn: '978-1234567890',
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(bookWithoutISBN);
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(null);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedBook);

			const result = await service.update('1', updateData);

			expect(result).toEqual(updatedBook);
			expect(mockRepository.findByISBN).toHaveBeenCalledWith('978-1234567890');
		});
	});

	describe('partialUpdate - Partially update a book (PATCH)', () => {
		it('should partially update book with single field', async () => {
			const partialData: PatchBook = {
				title: 'Updated Title',
				version: 1,
			};

			const updatedBook: Book = {
				...sampleBook,
				title: 'Updated Title',
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedBook);

			const result = await service.partialUpdate('1', partialData);

			expect(result).toEqual(updatedBook);
			expect(mockRepository.findById).toHaveBeenCalledWith('1');
			expect(mockRepository.update).toHaveBeenCalledWith('1', {
				title: 'Updated Title',
				version: 2,
			});
		});

		it('should partially update book with multiple fields', async () => {
			const partialData: PatchBook = {
				title: 'New Title',
				author: 'New Author',
				genre: 'Non-Fiction',
				version: 1,
			};

			const updatedBook: Book = {
				...sampleBook,
				title: 'New Title',
				author: 'New Author',
				genre: 'Non-Fiction',
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedBook);

			const result = await service.partialUpdate('1', partialData);

			expect(result).toEqual(updatedBook);
			expect(mockRepository.update).toHaveBeenCalledWith('1', {
				title: 'New Title',
				author: 'New Author',
				genre: 'Non-Fiction',
				version: 2,
			});
		});

		it('should throw NotFoundException when book not found', async () => {
			const partialData: PatchBook = {
				title: 'Updated Title',
				version: 1,
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.partialUpdate('999', partialData)).rejects.toThrow(NotFoundException);
			expect(mockRepository.findById).toHaveBeenCalledWith('999');
			expect(mockRepository.update).not.toHaveBeenCalled();
		});

		it('should throw ConflictException on version mismatch', async () => {
			const partialData: PatchBook = {
				title: 'Updated Title',
				version: 1,
			};

			const currentBook: Book = {
				...sampleBook,
				version: 2,
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(currentBook);

			await expect(service.partialUpdate('1', partialData)).rejects.toThrow(ConflictException);
			expect(mockRepository.update).not.toHaveBeenCalled();
		});

		it('should enforce ISBN uniqueness when updating ISBN', async () => {
			const partialData: PatchBook = {
				isbn: '978-0132350884',
				version: 1,
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(anotherBook);

			await expect(service.partialUpdate('1', partialData)).rejects.toThrow(ConflictException);
			expect(mockRepository.update).not.toHaveBeenCalled();
		});

		it('should allow updating ISBN to the same value (no conflict)', async () => {
			const partialData: PatchBook = {
				isbn: '978-0135957059', // Same ISBN as current
				version: 1,
			};

			const updatedBook: Book = {
				...sampleBook,
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedBook);

			const result = await service.partialUpdate('1', partialData);

			expect(result).toEqual(updatedBook);
			expect(mockRepository.update).toHaveBeenCalled();
		});

		it('should skip ISBN uniqueness check when not changing ISBN', async () => {
			const partialData: PatchBook = {
				title: 'Updated Title',
				version: 1,
				// No ISBN in update data
			};

			const updatedBook: Book = {
				...sampleBook,
				title: 'Updated Title',
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedBook);

			const result = await service.partialUpdate('1', partialData);

			expect(result).toEqual(updatedBook);
			expect(mockRepository.findByISBN).not.toHaveBeenCalled();
		});

		it('should handle only version provided (no-op update)', async () => {
			const partialData: PatchBook = {
				version: 1,
				// Only version, no other fields
			};

			const updatedBook: Book = {
				...sampleBook,
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedBook);

			const result = await service.partialUpdate('1', partialData);

			expect(result).toEqual(updatedBook);
			expect(mockRepository.update).toHaveBeenCalledWith('1', {
				version: 2,
			});
		});
	});

	describe('delete - Delete a book', () => {
		it('should delete book successfully', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.delete).mockResolvedValue(undefined);

			await service.delete('1');

			expect(mockRepository.findById).toHaveBeenCalledWith('1');
			expect(mockRepository.delete).toHaveBeenCalledWith('1');
		});

		it('should throw NotFoundException when book not found', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.delete('999')).rejects.toThrow(NotFoundException);
			expect(mockRepository.findById).toHaveBeenCalledWith('999');
			expect(mockRepository.delete).not.toHaveBeenCalled();
		});
	});

	describe('bulkDelete - Delete multiple books', () => {
		it('should delete all books successfully', async () => {
			const book1 = { ...sampleBook, id: '1' };
			const book2 = { ...sampleBook, id: '2' };
			const book3 = { ...sampleBook, id: '3' };

			vi.mocked(mockRepository.findById)
				.mockResolvedValueOnce(book1)
				.mockResolvedValueOnce(book2)
				.mockResolvedValueOnce(book3);
			vi.mocked(mockRepository.delete).mockResolvedValue(undefined);

			const result = await service.bulkDelete(['1', '2', '3']);

			expect(result).toEqual({
				success: true,
				deleted: ['1', '2', '3'],
				failed: [],
				totalRequested: 3,
				totalDeleted: 3,
				totalFailed: 0,
			});
			expect(mockRepository.findById).toHaveBeenCalledTimes(3);
			expect(mockRepository.delete).toHaveBeenCalledTimes(3);
		});

		it('should handle partial failures - some books not found', async () => {
			const book1 = { ...sampleBook, id: '1' };
			const book3 = { ...sampleBook, id: '3' };

			vi.mocked(mockRepository.findById)
				.mockResolvedValueOnce(book1) // Book 1 exists
				.mockResolvedValueOnce(null) // Book 2 not found
				.mockResolvedValueOnce(book3); // Book 3 exists
			vi.mocked(mockRepository.delete).mockResolvedValue(undefined);

			const result = await service.bulkDelete(['1', '2', '3']);

			expect(result).toEqual({
				success: true,
				deleted: ['1', '3'],
				failed: [
					{
						id: '2',
						reason: 'Book with id 2 not found',
						code: 'BOOK_NOT_FOUND',
					},
				],
				totalRequested: 3,
				totalDeleted: 2,
				totalFailed: 1,
			});
			expect(mockRepository.findById).toHaveBeenCalledTimes(3);
			expect(mockRepository.delete).toHaveBeenCalledTimes(2);
		});

		it('should handle all failures - no books found', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			const result = await service.bulkDelete(['1', '2', '3']);

			expect(result).toEqual({
				success: true,
				deleted: [],
				failed: [
					{
						id: '1',
						reason: 'Book with id 1 not found',
						code: 'BOOK_NOT_FOUND',
					},
					{
						id: '2',
						reason: 'Book with id 2 not found',
						code: 'BOOK_NOT_FOUND',
					},
					{
						id: '3',
						reason: 'Book with id 3 not found',
						code: 'BOOK_NOT_FOUND',
					},
				],
				totalRequested: 3,
				totalDeleted: 0,
				totalFailed: 3,
			});
			expect(mockRepository.findById).toHaveBeenCalledTimes(3);
			expect(mockRepository.delete).not.toHaveBeenCalled();
		});

		it('should handle single book deletion', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.delete).mockResolvedValue(undefined);

			const result = await service.bulkDelete(['1']);

			expect(result).toEqual({
				success: true,
				deleted: ['1'],
				failed: [],
				totalRequested: 1,
				totalDeleted: 1,
				totalFailed: 0,
			});
		});

		it('should handle duplicate IDs gracefully', async () => {
			const book1 = { ...sampleBook, id: '1' };

			vi.mocked(mockRepository.findById)
				.mockResolvedValueOnce(book1) // First call: exists
				.mockResolvedValueOnce(null); // Second call: already deleted (not found)
			vi.mocked(mockRepository.delete).mockResolvedValue(undefined);

			const result = await service.bulkDelete(['1', '1']);

			expect(result).toEqual({
				success: true,
				deleted: ['1'],
				failed: [
					{
						id: '1',
						reason: 'Book with id 1 not found',
						code: 'BOOK_NOT_FOUND',
					},
				],
				totalRequested: 2,
				totalDeleted: 1,
				totalFailed: 1,
			});
		});
	});
});
