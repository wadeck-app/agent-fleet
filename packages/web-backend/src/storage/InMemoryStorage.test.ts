import { beforeEach, describe, expect, it } from 'vitest';

import type { Book } from '@app/shared';

import { InMemoryStorage } from './InMemoryStorage';

/**
 * ===========================================================================================
 * IN-MEMORY STORAGE TESTS
 * ===========================================================================================
 *
 * Test Strategy:
 * - Integration test (real InMemoryStorage, no mocks)
 * - Test CRUD operations
 * - Test query builder functionality
 * - Test utility methods (seed, clear)
 * - Test edge cases (not found, duplicates)
 *
 * ===========================================================================================
 */

describe('InMemoryStorage', () => {
	let storage: InMemoryStorage;

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

	beforeEach(async () => {
		storage = new InMemoryStorage();
		// Clear all data before each test
		await storage.clear();
	});

	describe('getById - Get entity by ID', () => {
		it('should return entity when found', async () => {
			await storage.seed('books', [sampleBook]);

			const result = await storage.getById<Book>('books', '1');

			expect(result).toEqual(sampleBook);
		});

		it('should return null when not found', async () => {
			await storage.seed('books', [sampleBook]);

			const result = await storage.getById<Book>('books', '999');

			expect(result).toBeNull();
		});

		it('should return null when table is empty', async () => {
			const result = await storage.getById<Book>('books', '1');

			expect(result).toBeNull();
		});
	});

	describe('create - Create a new entity', () => {
		it('should create a new entity with auto-generated ID and metadata', async () => {
			const createData = {
				title: 'New Book',
				author: 'New Author',
				isbn: '978-1234567890',
				publishedYear: 2024,
				genre: 'Fiction',
				pages: 300,
			};

			const result = await storage.create<Book>('books', createData);

			expect(result).toMatchObject(createData);
			expect(result.id).toBeDefined();
			expect(result.id).toMatch(/^[a-z0-9]{9}$/); // Random 9-char ID
			expect(result.version).toBe(1);
			expect(result.createdAt).toBeDefined();
			expect(result.updatedAt).toBeDefined();
			// createdAt and updatedAt should be very close (within a few milliseconds)
			const createdTime = new Date(result.createdAt).getTime();
			const updatedTime = new Date(result.updatedAt).getTime();
			expect(Math.abs(createdTime - updatedTime)).toBeLessThan(100); // Within 100ms
		});

		it('should add entity to the table', async () => {
			const createData = {
				title: 'New Book',
				author: 'New Author',
			};

			const created = await storage.create<Book>('books', createData);
			const found = await storage.getById<Book>('books', created.id);

			expect(found).toEqual(created);
		});

		it('should create multiple entities with different IDs', async () => {
			const data1 = { title: 'Book 1', author: 'Author 1' };
			const data2 = { title: 'Book 2', author: 'Author 2' };

			const book1 = await storage.create<Book>('books', data1);
			const book2 = await storage.create<Book>('books', data2);

			expect(book1.id).not.toBe(book2.id);
		});

		it('should create entities in different tables independently', async () => {
			const bookData = { title: 'Book 1', author: 'Author 1' };
			const ingredientData = { name: 'Apple', calories: 95 };

			const book = await storage.create('books', bookData);
			const ingredient = await storage.create('ingredients', ingredientData);

			expect(book.id).toBeDefined();
			expect(ingredient.id).toBeDefined();

			// Should be in different tables
			const foundBook = await storage.getById('books', book.id);
			const foundIngredient = await storage.getById('ingredients', ingredient.id);

			expect(foundBook).toBeTruthy();
			expect(foundIngredient).toBeTruthy();
		});
	});

	describe('update - Update an existing entity', () => {
		it('should update an entity', async () => {
			await storage.seed('books', [sampleBook]);

			const updateData = {
				title: 'Updated Title',
				version: 2,
			};

			const result = await storage.update<Book>('books', '1', updateData);

			expect(result.id).toBe('1');
			expect(result.title).toBe('Updated Title');
			expect(result.author).toBe('Andrew Hunt'); // Unchanged
			expect(result.version).toBe(2);
			expect(result.updatedAt).not.toBe(sampleBook.updatedAt);
		});

		it('should preserve unchanged fields', async () => {
			await storage.seed('books', [sampleBook]);

			const result = await storage.update<Book>('books', '1', { pages: 500 });

			// Verify that unchanged fields are preserved
			expect(result.id).toBe(sampleBook.id);
			expect(result.title).toBe(sampleBook.title);
			expect(result.author).toBe(sampleBook.author);
			expect(result.isbn).toBe(sampleBook.isbn);
			expect(result.publishedYear).toBe(sampleBook.publishedYear);
			expect(result.genre).toBe(sampleBook.genre);
			expect(result.version).toBe(sampleBook.version);
			expect(result.createdAt).toBe(sampleBook.createdAt);

			// Verify that the updated field changed
			expect(result.pages).toBe(500);

			// updatedAt should be updated automatically
			expect(result.updatedAt).not.toBe(sampleBook.updatedAt);
		});

		it('should throw error when entity not found', async () => {
			await storage.seed('books', [sampleBook]);

			await expect(storage.update<Book>('books', '999', { title: 'Updated' })).rejects.toThrow(
				'Entity with id 999 not found in table books'
			);
		});

		it('should update updatedAt timestamp', async () => {
			await storage.seed('books', [sampleBook]);

			const originalUpdatedAt = sampleBook.updatedAt;
			const result = await storage.update<Book>('books', '1', { title: 'Updated' });

			expect(result.updatedAt).not.toBe(originalUpdatedAt);
			expect(new Date(result.updatedAt).getTime()).toBeGreaterThan(new Date(originalUpdatedAt).getTime());
		});

		it('should preserve the original ID even if provided in update data', async () => {
			await storage.seed('books', [sampleBook]);

			const result = await storage.update<Book>('books', '1', {
				id: '999', // Should be ignored
				title: 'Updated',
			} as any);

			expect(result.id).toBe('1'); // Original ID preserved
		});
	});

	describe('delete - Delete an entity', () => {
		it('should delete an entity', async () => {
			await storage.seed('books', [sampleBook, anotherBook]);

			await storage.delete('books', '1');

			const found = await storage.getById<Book>('books', '1');
			expect(found).toBeNull();

			// Other entity should still exist
			const other = await storage.getById<Book>('books', '2');
			expect(other).toEqual(anotherBook);
		});

		it('should throw error when entity not found', async () => {
			await storage.seed('books', [sampleBook]);

			await expect(storage.delete('books', '999')).rejects.toThrow('Entity with id 999 not found in table books');
		});

		it('should delete from empty table throws error', async () => {
			await expect(storage.delete('books', '1')).rejects.toThrow('Entity with id 1 not found in table books');
		});
	});

	describe('query - Query builder', () => {
		beforeEach(async () => {
			const books = [
				sampleBook,
				anotherBook,
				{
					...sampleBook,
					id: '3',
					title: 'Design Patterns',
					author: 'Erich Gamma',
					publishedYear: 1994,
				},
			];
			await storage.seed('books', books);
		});

		it('should return all entities when no filters', async () => {
			const result = await storage.query<Book>('books').execute();

			expect(result).toHaveLength(3);
		});

		it('should filter by equals condition', async () => {
			const result = await storage.query<Book>('books').where('author', '=', 'Andrew Hunt').execute();

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('1');
		});

		it('should filter by contains condition', async () => {
			const result = await storage.query<Book>('books').where('author', 'contains', 'Martin').execute();

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('2');
		});

		it('should filter by greater than condition', async () => {
			const result = await storage.query<Book>('books').where('publishedYear', '>', 2000).execute();

			expect(result).toHaveLength(2); // Books from 2008 and 2019
		});

		it('should filter by greater than or equals condition', async () => {
			const result = await storage.query<Book>('books').where('publishedYear', '>=', 2008).execute();

			expect(result).toHaveLength(2);
		});

		it('should filter by less than condition', async () => {
			const result = await storage.query<Book>('books').where('publishedYear', '<', 2000).execute();

			expect(result).toHaveLength(1); // Book from 1994
			expect(result[0].id).toBe('3');
		});

		it('should filter by less than or equals condition', async () => {
			const result = await storage.query<Book>('books').where('publishedYear', '<=', 2008).execute();

			expect(result).toHaveLength(2); // Books from 1994 and 2008
		});

		it('should chain multiple where conditions (AND)', async () => {
			const result = await storage
				.query<Book>('books')
				.where('genre', '=', 'Programming')
				.andWhere('publishedYear', '>', 2000)
				.execute();

			expect(result).toHaveLength(2); // Programming books after 2000
		});

		it('should order by field ascending', async () => {
			const result = await storage.query<Book>('books').orderBy('publishedYear', 'ASC').execute();

			expect(result[0].publishedYear).toBe(1994);
			expect(result[1].publishedYear).toBe(2008);
			expect(result[2].publishedYear).toBe(2019);
		});

		it('should order by field descending', async () => {
			const result = await storage.query<Book>('books').orderBy('publishedYear', 'DESC').execute();

			expect(result[0].publishedYear).toBe(2019);
			expect(result[1].publishedYear).toBe(2008);
			expect(result[2].publishedYear).toBe(1994);
		});

		it('should limit results', async () => {
			const result = await storage.query<Book>('books').limit(2).execute();

			expect(result).toHaveLength(2);
		});

		it('should combine filtering, ordering, and limiting', async () => {
			const result = await storage
				.query<Book>('books')
				.where('genre', '=', 'Programming')
				.orderBy('publishedYear', 'DESC')
				.limit(2)
				.execute();

			expect(result).toHaveLength(2);
			expect(result[0].publishedYear).toBe(2019);
			expect(result[1].publishedYear).toBe(2008);
		});

		it('should return empty array when no matches', async () => {
			const result = await storage.query<Book>('books').where('genre', '=', 'Fiction').execute();

			expect(result).toEqual([]);
		});
	});

	describe('seed - Seed data', () => {
		it('should seed data into a table', async () => {
			await storage.seed('books', [sampleBook, anotherBook]);

			const result = await storage.query<Book>('books').execute();

			expect(result).toHaveLength(2);
			expect(result).toEqual([sampleBook, anotherBook]);
		});

		it('should replace existing data when seeding', async () => {
			await storage.seed('books', [sampleBook]);
			await storage.seed('books', [anotherBook]);

			const result = await storage.query<Book>('books').execute();

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(anotherBook);
		});
	});

	describe('clear - Clear all data', () => {
		it('should clear all tables', async () => {
			await storage.seed('books', [sampleBook]);
			await storage.seed('ingredients', [{ id: '1', name: 'Apple' }]);

			await storage.clear();

			const books = await storage.query<Book>('books').execute();
			const ingredients = await storage.query('ingredients').execute();

			expect(books).toHaveLength(0);
			expect(ingredients).toHaveLength(0);
		});
	});

	describe('clearTable - Clear a specific table', () => {
		it('should clear a specific table', async () => {
			await storage.seed('books', [sampleBook]);
			await storage.seed('ingredients', [{ id: '1', name: 'Apple' }]);

			await storage.clearTable('books');

			const books = await storage.query<Book>('books').execute();
			const ingredients = await storage.query('ingredients').execute();

			expect(books).toHaveLength(0);
			expect(ingredients).toHaveLength(1);
		});

		it('should handle clearing non-existent table gracefully', async () => {
			await storage.clearTable('nonexistent');

			// Should not throw error
			const result = await storage.query('nonexistent').execute();
			expect(result).toEqual([]);
		});
	});
});
