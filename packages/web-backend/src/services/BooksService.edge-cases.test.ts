import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Book, CreateBook, PatchBook, UpdateBook } from '@app/shared/api/books.contract';
import { ConflictException, ERROR_CODES, NotFoundException } from '@app/shared/exceptions/http-exceptions';

import type { BooksRepository } from '../repositories/BooksRepository';
import { BooksService } from './BooksService';

/**
 * ===========================================================================================
 * BOOKS SERVICE - EDGE CASE TESTS
 * ===========================================================================================
 *
 * Comprehensive edge case testing for:
 * - ISBN validation and uniqueness
 * - Pagination boundary conditions
 * - Error code validation
 * - Concurrent modification scenarios
 * - Optional field handling
 *
 * Coverage Target: 90%+ for business logic
 *
 * ===========================================================================================
 */

describe('BooksService - Edge Cases', () => {
	let service: BooksService;
	let mockRepository: BooksRepository;

	const sampleBook: Book = {
		id: '1',
		title: 'Clean Code',
		author: 'Robert C. Martin',
		isbn: '9780132350884',
		publishedYear: 2008,
		genre: 'Programming',
		pages: 464,
		version: 1,
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
	};

	beforeEach(() => {
		mockRepository = {
			findAll: vi.fn(),
			findById: vi.fn(),
			findByISBN: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		} as unknown as BooksRepository;

		service = new BooksService(mockRepository);
	});

	describe('list - Pagination Edge Cases', () => {
		it('should handle negative page by treating as page 1', async () => {
			const books = [sampleBook];
			vi.mocked(mockRepository.findAll).mockResolvedValue(books);

			const result = await service.list({ page: -1 as any });

			// Should sanitize to page 1
			expect(result.pagination!.page).toBe(1);
		});

		it('should handle pageSize 0 by using minimum 1', async () => {
			const books = [sampleBook];
			vi.mocked(mockRepository.findAll).mockResolvedValue(books);

			const result = await service.list({ pageSize: 0 as any });

			// Should enforce minimum pageSize of 1
			expect(result.pagination!.pageSize).toBeGreaterThanOrEqual(1);
		});

		it('should handle negative pageSize by using minimum 1', async () => {
			const books = [sampleBook];
			vi.mocked(mockRepository.findAll).mockResolvedValue(books);

			const result = await service.list({ pageSize: -10 as any });

			// Should enforce minimum pageSize of 1
			expect(result.pagination!.pageSize).toBeGreaterThanOrEqual(1);
		});

		it('should cap pageSize at 100', async () => {
			const books = Array.from({ length: 200 }, (_, i) => ({
				...sampleBook,
				id: String(i + 1),
			}));
			vi.mocked(mockRepository.findAll).mockResolvedValue(books);

			const result = await service.list({ page: 1, pageSize: 500 });

			expect(result.pagination!.pageSize).toBe(100);
			expect(result.items).toHaveLength(100);
		});

		it('should handle page beyond available data', async () => {
			const books = [sampleBook];
			vi.mocked(mockRepository.findAll).mockResolvedValue(books);

			const result = await service.list({ page: 999, pageSize: 10 });

			expect(result.items).toHaveLength(0);
			expect(result.pagination!.totalPages).toBe(1);
		});
	});

	describe('getById - Error Code Validation', () => {
		it('should throw NotFoundException with BOOK_NOT_FOUND code', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			try {
				await service.getById('999');
				expect.fail('Should have thrown NotFoundException');
			} catch (error) {
				expect(error).toBeInstanceOf(NotFoundException);
				expect((error as any).code).toBe(ERROR_CODES.BOOK_NOT_FOUND);
				expect((error as any).statusCode).toBe(404);
			}
		});

		it('should handle empty string ID', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.getById('')).rejects.toThrow(NotFoundException);
		});

		it('should handle UUID format ID', async () => {
			const uuid = '123e4567-e89b-12d3-a456-426614174000';
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.getById(uuid)).rejects.toThrow(NotFoundException);
			expect(mockRepository.findById).toHaveBeenCalledWith(uuid);
		});
	});

	describe('getByISBN - ISBN Lookup Edge Cases', () => {
		it('should throw NotFoundException with BOOK_NOT_FOUND code', async () => {
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(null);

			try {
				await service.getByISBN('9999999999999');
				expect.fail('Should have thrown NotFoundException');
			} catch (error) {
				expect(error).toBeInstanceOf(NotFoundException);
				expect((error as any).code).toBe(ERROR_CODES.BOOK_NOT_FOUND);
			}
		});

		it('should exclude specified book ID when checking ISBN', async () => {
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(sampleBook);

			// When checking ISBN for the same book being edited, should throw NotFound
			try {
				await service.getByISBN(sampleBook.isbn!, sampleBook.id);
				expect.fail('Should have thrown NotFoundException');
			} catch (error) {
				expect(error).toBeInstanceOf(NotFoundException);
			}
		});

		it('should return book when ISBN found and not excluded', async () => {
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(sampleBook);

			const result = await service.getByISBN(sampleBook.isbn!, 'different-id');

			expect(result).toEqual(sampleBook);
		});

		it('should handle ISBN with hyphens', async () => {
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(null);

			await expect(service.getByISBN('978-0-13-235088-4')).rejects.toThrow(NotFoundException);
		});

		it('should handle ISBN-10 format', async () => {
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(null);

			await expect(service.getByISBN('0132350882')).rejects.toThrow(NotFoundException);
		});
	});

	describe('create - ISBN Uniqueness Edge Cases', () => {
		it('should throw ConflictException with DUPLICATE_ISBN code when ISBN exists', async () => {
			const existingBook: Book = { ...sampleBook, id: '2' };
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(existingBook);

			const createData: CreateBook = {
				title: 'Another Book',
				author: 'Another Author',
				isbn: sampleBook.isbn,
			};

			try {
				await service.create(createData);
				expect.fail('Should have thrown ConflictException');
			} catch (error) {
				expect(error).toBeInstanceOf(ConflictException);
				expect((error as any).code).toBe(ERROR_CODES.DUPLICATE_ISBN);
				expect((error as any).details).toEqual({
					isbn: sampleBook.isbn,
					existingBookId: existingBook.id,
				});
			}
		});

		it('should allow creation without ISBN', async () => {
			const createData: CreateBook = {
				title: 'Book Without ISBN',
				author: 'Unknown Author',
			};

			const created: Book = {
				...createData,
				id: '1',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockRepository.create).mockResolvedValue(created);

			const result = await service.create(createData);
			expect(result.isbn).toBeUndefined();
		});

		it('should allow creation with year 0', async () => {
			const createData: CreateBook = {
				title: 'Ancient Text',
				author: 'Unknown',
				publishedYear: 0,
			};

			const created: Book = {
				...createData,
				id: '1',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockRepository.create).mockResolvedValue(created);

			const result = await service.create(createData);
			expect(result.publishedYear).toBe(0);
		});

		it('should allow creation with pages 0', async () => {
			const createData: CreateBook = {
				title: 'Empty Book',
				author: 'Test Author',
				pages: 0,
			};

			const created: Book = {
				...createData,
				id: '1',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockRepository.create).mockResolvedValue(created);

			const result = await service.create(createData);
			expect(result.pages).toBe(0);
		});

		it('should allow creation with very long title', async () => {
			const longTitle = 'A'.repeat(500);
			const createData: CreateBook = {
				title: longTitle,
				author: 'Test Author',
			};

			const created: Book = {
				...createData,
				id: '1',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockRepository.create).mockResolvedValue(created);

			const result = await service.create(createData);
			expect(result.title).toBe(longTitle);
		});
	});

	describe('update - Version Conflict and ISBN Uniqueness', () => {
		it('should throw ConflictException with VERSION_MISMATCH code', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);

			const updateData: UpdateBook = {
				title: 'Updated Title',
				author: 'Updated Author',
				version: 999, // Wrong version
			};

			try {
				await service.update('1', updateData);
				expect.fail('Should have thrown ConflictException');
			} catch (error) {
				expect(error).toBeInstanceOf(ConflictException);
				expect((error as any).code).toBe(ERROR_CODES.VERSION_MISMATCH);
				expect((error as any).details).toEqual({
					expectedVersion: 999,
					currentVersion: 1,
				});
			}
		});

		it('should throw ConflictException when changing to existing ISBN', async () => {
			const otherBook: Book = { ...sampleBook, id: '2', isbn: '9780201616224' };
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(otherBook);

			const updateData: UpdateBook = {
				title: sampleBook.title,
				author: sampleBook.author,
				isbn: otherBook.isbn,
				version: 1,
			};

			try {
				await service.update('1', updateData);
				expect.fail('Should have thrown ConflictException');
			} catch (error) {
				expect(error).toBeInstanceOf(ConflictException);
				expect((error as any).code).toBe(ERROR_CODES.DUPLICATE_ISBN);
				expect((error as any).details).toEqual({
					isbn: otherBook.isbn,
					existingBookId: otherBook.id,
				});
			}
		});

		it('should allow update when ISBN unchanged', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(sampleBook);

			const updateData: UpdateBook = {
				title: 'Updated Title',
				author: sampleBook.author,
				isbn: sampleBook.isbn,
				version: 1,
			};

			const updated: Book = { ...sampleBook, ...updateData, version: 2 };
			vi.mocked(mockRepository.update).mockResolvedValue(updated);

			const result = await service.update('1', updateData);
			expect(result.title).toBe('Updated Title');
			expect(result.version).toBe(2);
		});

		it('should allow update when ISBN is removed', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);

			const updateData: UpdateBook = {
				title: sampleBook.title,
				author: sampleBook.author,
				isbn: undefined,
				version: 1,
			};

			const updated: Book = { ...sampleBook, ...updateData, version: 2 };
			vi.mocked(mockRepository.update).mockResolvedValue(updated);

			const result = await service.update('1', updateData);
			expect(result.isbn).toBeUndefined();
		});
	});

	describe('partialUpdate - Edge Cases', () => {
		it('should handle partial update with only version', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);

			const patchData: PatchBook = {
				version: 1,
			};

			const updated: Book = { ...sampleBook, version: 2 };
			vi.mocked(mockRepository.update).mockResolvedValue(updated);

			const result = await service.partialUpdate('1', patchData);
			expect(result.version).toBe(2);
		});

		it('should handle partial update changing only title', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);

			const patchData: PatchBook = {
				title: 'New Title',
				version: 1,
			};

			const updated: Book = { ...sampleBook, title: 'New Title', version: 2 };
			vi.mocked(mockRepository.update).mockResolvedValue(updated);

			const result = await service.partialUpdate('1', patchData);
			expect(result.title).toBe('New Title');
			expect(result.author).toBe(sampleBook.author);
		});

		it('should validate ISBN uniqueness in partialUpdate', async () => {
			const otherBook: Book = { ...sampleBook, id: '2', isbn: '9780201616224' };
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(otherBook);

			const patchData: PatchBook = {
				isbn: otherBook.isbn,
				version: 1,
			};

			try {
				await service.partialUpdate('1', patchData);
				expect.fail('Should have thrown ConflictException');
			} catch (error) {
				expect(error).toBeInstanceOf(ConflictException);
				expect((error as any).code).toBe(ERROR_CODES.DUPLICATE_ISBN);
			}
		});

		it('should allow partial update of ISBN when not changing', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.findByISBN).mockResolvedValue(sampleBook);

			const patchData: PatchBook = {
				isbn: sampleBook.isbn,
				title: 'New Title',
				version: 1,
			};

			const updated: Book = { ...sampleBook, title: 'New Title', version: 2 };
			vi.mocked(mockRepository.update).mockResolvedValue(updated);

			const result = await service.partialUpdate('1', patchData);
			expect(result.title).toBe('New Title');
		});
	});

	describe('delete - Edge Cases', () => {
		it('should verify book exists before deleting', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.delete('999')).rejects.toThrow(NotFoundException);
			expect(mockRepository.delete).not.toHaveBeenCalled();
		});

		it('should delete successfully when book exists', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleBook);
			vi.mocked(mockRepository.delete).mockResolvedValue(undefined);

			await service.delete('1');

			expect(mockRepository.findById).toHaveBeenCalledWith('1');
			expect(mockRepository.delete).toHaveBeenCalledWith('1');
		});

		it('should handle empty string ID in delete', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.delete('')).rejects.toThrow(NotFoundException);
		});

		it('should handle special characters in ID', async () => {
			const specialId = 'book-with-dashes-123';
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.delete(specialId)).rejects.toThrow(NotFoundException);
			expect(mockRepository.findById).toHaveBeenCalledWith(specialId);
		});
	});
});
