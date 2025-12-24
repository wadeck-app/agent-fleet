import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Book } from '@app/shared/api/books.contract';

import type { DataStorage } from '../storage/DataStorage';
import type { QueryBuilder } from '../storage/QueryBuilder';
import { BaseRepository } from './BaseRepository';

/**
 * ===========================================================================================
 * BASE REPOSITORY TESTS
 * ===========================================================================================
 *
 * Test Strategy:
 * - Mock DataStorage (unit test - no real storage)
 * - Test generic CRUD operations
 * - Test query builder integration
 * - Test delegation to storage layer
 *
 * ===========================================================================================
 */

describe('BaseRepository', () => {
	let repository: BaseRepository<Book>;
	let mockStorage: DataStorage;
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
			limit: vi.fn().mockReturnThis(),
			execute: vi.fn(),
		} as unknown as QueryBuilder<Book>;

		// Create mock storage
		mockStorage = {
			query: vi.fn().mockReturnValue(mockQueryBuilder),
			getById: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		} as unknown as DataStorage;

		// Create repository with mock storage
		repository = new BaseRepository<Book>('books', mockStorage);
	});

	describe('getTableName - Get the table name', () => {
		it('should return the table name', () => {
			expect(repository.getTableName()).toBe('books');
		});
	});

	describe('query - Create a query builder', () => {
		it('should return a query builder', () => {
			const qb = repository.query();

			expect(qb).toBe(mockQueryBuilder);
			expect(mockStorage.query).toHaveBeenCalledWith('books');
		});

		it('should return a new query builder for each call', () => {
			repository.query();
			repository.query();

			expect(mockStorage.query).toHaveBeenCalledTimes(2);
		});
	});

	describe('findAll - Get all entities', () => {
		it('should return all entities', async () => {
			const books = [sampleBook, anotherBook];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(books);

			const result = await repository.findAll();

			expect(result).toEqual(books);
			expect(mockStorage.query).toHaveBeenCalledWith('books');
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should return empty array when no entities', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([]);

			const result = await repository.findAll();

			expect(result).toEqual([]);
		});
	});

	describe('findById - Get entity by ID', () => {
		it('should return entity when found', async () => {
			vi.mocked(mockStorage.getById).mockResolvedValue(sampleBook);

			const result = await repository.findById('1');

			expect(result).toEqual(sampleBook);
			expect(mockStorage.getById).toHaveBeenCalledWith('books', '1');
		});

		it('should return null when not found', async () => {
			vi.mocked(mockStorage.getById).mockResolvedValue(null);

			const result = await repository.findById('999');

			expect(result).toBeNull();
			expect(mockStorage.getById).toHaveBeenCalledWith('books', '999');
		});
	});

	describe('findBy - Find entities by field value', () => {
		it('should find entities by string field', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleBook]);

			const result = await repository.findBy('author', 'Andrew Hunt');

			expect(result).toEqual([sampleBook]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('author', '=', 'Andrew Hunt');
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should find entities by number field', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleBook]);

			const result = await repository.findBy('publishedYear', 2019);

			expect(result).toEqual([sampleBook]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('publishedYear', '=', 2019);
		});

		it('should return empty array when no matches', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([]);

			const result = await repository.findBy('genre', 'Fiction');

			expect(result).toEqual([]);
		});
	});

	describe('create - Create a new entity', () => {
		it('should create a new entity', async () => {
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

			vi.mocked(mockStorage.create).mockResolvedValue(createdBook);

			const result = await repository.create(createData);

			expect(result).toEqual(createdBook);
			expect(mockStorage.create).toHaveBeenCalledWith('books', createData);
		});
	});

	describe('update - Update an existing entity', () => {
		it('should update an entity', async () => {
			const updateData = {
				title: 'Updated Title',
				version: 2,
			};

			const updatedBook: Book = {
				...sampleBook,
				...updateData,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockStorage.update).mockResolvedValue(updatedBook);

			const result = await repository.update('1', updateData);

			expect(result).toEqual(updatedBook);
			expect(mockStorage.update).toHaveBeenCalledWith('books', '1', updateData);
		});

		it('should update partial entity fields', async () => {
			const updateData = {
				pages: 500,
			};

			const updatedBook: Book = {
				...sampleBook,
				pages: 500,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockStorage.update).mockResolvedValue(updatedBook);

			const result = await repository.update('1', updateData);

			expect(result).toEqual(updatedBook);
		});
	});

	describe('delete - Delete an entity', () => {
		it('should delete an entity', async () => {
			vi.mocked(mockStorage.delete).mockResolvedValue(undefined);

			await repository.delete('1');

			expect(mockStorage.delete).toHaveBeenCalledWith('books', '1');
		});
	});

	describe('Integration with query builder', () => {
		it('should allow complex queries with query builder', async () => {
			const books = [sampleBook];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(books);

			const result = await repository
				.query()
				.where('genre', '=', 'Programming')
				.andWhere('publishedYear', '>=', 2015)
				.orderBy('publishedYear', 'DESC')
				.limit(10)
				.execute();

			expect(result).toEqual(books);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('genre', '=', 'Programming');
			expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('publishedYear', '>=', 2015);
			expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('publishedYear', 'DESC');
			expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
		});
	});
});
