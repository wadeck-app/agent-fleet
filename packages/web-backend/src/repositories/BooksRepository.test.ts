import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Book, BooksListQuery } from '@app/shared';

import type { QueryBuilder } from '../storage/QueryBuilder';
import type { BaseRepository } from './BaseRepository';
import { BooksRepository } from './BooksRepository';

/**
 * ===========================================================================================
 * BOOKS REPOSITORY TESTS
 * ===========================================================================================
 *
 * Test Strategy:
 * - Mock BaseRepository (unit test - no real storage)
 * - Test domain-specific query methods
 * - Test filter composition (search, author, genre)
 * - Test delegation to BaseRepository
 *
 * ===========================================================================================
 */

describe('BooksRepository', () => {
	let repository: BooksRepository;
	let mockBaseRepository: BaseRepository<Book>;
	let mockQueryBuilder: QueryBuilder<Book>;

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
		// Create mock query builder
		mockQueryBuilder = {
			where: vi.fn().mockReturnThis(),
			andWhere: vi.fn().mockReturnThis(),
			orderBy: vi.fn().mockReturnThis(),
			thenBy: vi.fn().mockReturnThis(),
			limit: vi.fn().mockReturnThis(),
			execute: vi.fn(),
		} as unknown as QueryBuilder<Book>;

		// Create mock base repository
		mockBaseRepository = {
			query: vi.fn().mockReturnValue(mockQueryBuilder),
			findById: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		} as unknown as BaseRepository<Book>;

		// Create repository with mock base
		repository = new BooksRepository(mockBaseRepository);
	});

	describe('findAll - Find all books with filters', () => {
		it('should return all books when no filters provided', async () => {
			const books = [sampleBook, anotherBook];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(books);

			const result = await repository.findAll();

			expect(result).toEqual(books);
			expect(mockBaseRepository.query).toHaveBeenCalled();
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should filter by search term (title or author)', async () => {
			const query: BooksListQuery = { search: 'Pragmatic' };
			const allBooks = [sampleBook, anotherBook];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(allBooks);

			const result = await repository.findAll(query);

			// Should filter client-side for search
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(sampleBook);
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should filter by search term (case-insensitive)', async () => {
			const query: BooksListQuery = { search: 'PRAGMATIC' };
			const allBooks = [sampleBook, anotherBook];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(allBooks);

			const result = await repository.findAll(query);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(sampleBook);
		});

		it('should filter by search in author field', async () => {
			const query: BooksListQuery = { search: 'Martin' };
			const allBooks = [sampleBook, anotherBook];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(allBooks);

			const result = await repository.findAll(query);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(anotherBook);
		});

		it('should filter by author (using query builder)', async () => {
			const query: BooksListQuery = { author: 'Hunt' };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleBook]);

			const result = await repository.findAll(query);

			expect(result).toEqual([sampleBook]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('author', 'contains', 'Hunt');
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should filter by genre (using query builder)', async () => {
			const query: BooksListQuery = { genre: 'Programming' };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleBook, anotherBook]);

			const result = await repository.findAll(query);

			expect(result).toEqual([sampleBook, anotherBook]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('genre', '=', 'Programming');
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should combine author and genre filters', async () => {
			const query: BooksListQuery = { author: 'Hunt', genre: 'Programming' };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleBook]);

			const result = await repository.findAll(query);

			expect(result).toEqual([sampleBook]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('author', 'contains', 'Hunt');
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('genre', '=', 'Programming');
		});

		it('should return empty array when no matches found', async () => {
			const query: BooksListQuery = { search: 'NonExistent' };
			const allBooks = [sampleBook, anotherBook];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(allBooks);

			const result = await repository.findAll(query);

			expect(result).toHaveLength(0);
		});

		it('should return all books when search is empty string', async () => {
			const query: BooksListQuery = { search: '' };
			const allBooks = [sampleBook, anotherBook];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(allBooks);

			const result = await repository.findAll(query);

			expect(result).toHaveLength(2);
			expect(result).toEqual(allBooks);
		});

		it('should filter by search term with partial match', async () => {
			const query: BooksListQuery = { search: 'Prag' };
			const allBooks = [sampleBook, anotherBook];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(allBooks);

			const result = await repository.findAll(query);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(sampleBook);
		});

		it('should combine search with author filter', async () => {
			const query: BooksListQuery = { search: 'Pragmatic', author: 'Hunt' };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleBook]);

			const result = await repository.findAll(query);

			// Search is applied client-side AFTER query builder filters
			// sampleBook has "Pragmatic" in title and author filter matched "Hunt"
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(sampleBook);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('author', 'contains', 'Hunt');
		});

		it('should combine search with genre filter', async () => {
			const query: BooksListQuery = { search: 'Clean', genre: 'Programming' };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleBook, anotherBook]);

			const result = await repository.findAll(query);

			// Search is applied client-side AFTER query builder filters
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(anotherBook);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('genre', '=', 'Programming');
		});

		it('should apply sorting after search filtering', async () => {
			const query: BooksListQuery = {
				search: 'Programming',
				sortBy: 'title',
				sortOrder: 'asc',
			};
			const allBooks = [sampleBook, anotherBook];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(allBooks);

			const result = await repository.findAll(query);

			// Both books have "Programming" in their genre (in test data)
			// But search should be applied BEFORE sorting happens in the result
			expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('title', 'ASC');
			expect(result).toBeDefined();
		});

		it('should apply single-column sort', async () => {
			const query: BooksListQuery = { sortBy: 'title', sortOrder: 'asc' };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([anotherBook, sampleBook]);

			await repository.findAll(query);

			expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('title', 'ASC');
			expect(mockQueryBuilder.thenBy).not.toHaveBeenCalled();
		});

		it('should apply multi-column sort with orderBy and thenBy', async () => {
			const query: BooksListQuery = { sortBy: 'genre,title', sortOrder: 'asc,desc' };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleBook, anotherBook]);

			await repository.findAll(query);

			expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('genre', 'ASC');
			expect(mockQueryBuilder.thenBy).toHaveBeenCalledWith('title', 'DESC');
		});

		it('should apply multi-column sort with default ASC order for missing sort orders', async () => {
			const query: BooksListQuery = { sortBy: 'genre,title,author', sortOrder: 'desc' };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleBook, anotherBook]);

			await repository.findAll(query);

			expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('genre', 'DESC');
			expect(mockQueryBuilder.thenBy).toHaveBeenCalledWith('title', 'ASC');
			expect(mockQueryBuilder.thenBy).toHaveBeenCalledWith('author', 'ASC');
		});
	});

	describe('findById - Find book by ID', () => {
		it('should return book when found', async () => {
			vi.mocked(mockBaseRepository.findById).mockResolvedValue(sampleBook);

			const result = await repository.findById('1');

			expect(result).toEqual(sampleBook);
			expect(mockBaseRepository.findById).toHaveBeenCalledWith('1');
		});

		it('should return null when not found', async () => {
			vi.mocked(mockBaseRepository.findById).mockResolvedValue(null);

			const result = await repository.findById('999');

			expect(result).toBeNull();
			expect(mockBaseRepository.findById).toHaveBeenCalledWith('999');
		});
	});

	describe('findByAuthor - Find books by author', () => {
		it('should find books by author name', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleBook]);

			const result = await repository.findByAuthor('Hunt');

			expect(result).toEqual([sampleBook]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('author', 'contains', 'Hunt');
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should return empty array when author not found', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([]);

			const result = await repository.findByAuthor('Unknown');

			expect(result).toEqual([]);
		});
	});

	describe('findByGenre - Find books by genre', () => {
		it('should find books by genre', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleBook, anotherBook]);

			const result = await repository.findByGenre('Programming');

			expect(result).toEqual([sampleBook, anotherBook]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('genre', '=', 'Programming');
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should return empty array when genre not found', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([]);

			const result = await repository.findByGenre('Fiction');

			expect(result).toEqual([]);
		});
	});

	describe('findByISBN - Find book by ISBN', () => {
		it('should find book by ISBN', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleBook]);

			const result = await repository.findByISBN('978-0135957059');

			expect(result).toEqual(sampleBook);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('isbn', '=', '978-0135957059');
			expect(mockQueryBuilder.limit).toHaveBeenCalledWith(1);
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should return null when ISBN not found', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([]);

			const result = await repository.findByISBN('978-9999999999');

			expect(result).toBeNull();
		});
	});

	describe('findByYearRange - Find books by publication year range', () => {
		it('should find books within year range', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([anotherBook, sampleBook]);

			const result = await repository.findByYearRange(2008, 2019);

			expect(result).toEqual([anotherBook, sampleBook]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('publishedYear', '>=', 2008);
			expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('publishedYear', '<=', 2019);
			expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('publishedYear', 'DESC');
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should return empty array when no books in range', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([]);

			const result = await repository.findByYearRange(1900, 2000);

			expect(result).toEqual([]);
		});
	});

	describe('create - Create a new book', () => {
		it('should create a book', async () => {
			const createData = {
				title: 'New Book',
				author: 'New Author',
				isbn: '978-1234567890',
				publishedYear: 2024,
				genre: 'Fiction',
				pages: 300,
			};

			const createdBook: Book = {
				...createData,
				id: '3',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockBaseRepository.create).mockResolvedValue(createdBook);

			const result = await repository.create(createData);

			expect(result).toEqual(createdBook);
			expect(mockBaseRepository.create).toHaveBeenCalledWith(createData);
		});
	});

	describe('update - Update an existing book', () => {
		it('should update a book', async () => {
			const updateData = {
				title: 'Updated Title',
				version: 2,
			};

			const updatedBook: Book = {
				...sampleBook,
				...updateData,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockBaseRepository.update).mockResolvedValue(updatedBook);

			const result = await repository.update('1', updateData);

			expect(result).toEqual(updatedBook);
			expect(mockBaseRepository.update).toHaveBeenCalledWith('1', updateData);
		});
	});

	describe('delete - Delete a book', () => {
		it('should delete a book', async () => {
			vi.mocked(mockBaseRepository.delete).mockResolvedValue(undefined);

			await repository.delete('1');

			expect(mockBaseRepository.delete).toHaveBeenCalledWith('1');
		});
	});
});
