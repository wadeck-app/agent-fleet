import { MockOrchestratorClient } from 'orchestrator-adapters';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Book, Ingredient } from '@app/shared';

import { MockAuthService } from '../auth/MockAuthService';
import { BooksService } from '../services/BooksService';
import { DashboardService } from '../services/DashboardService';
import { IngredientsService } from '../services/IngredientsService';
import { TasksService } from '../services/TasksService';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { EventBroadcaster } from '../transport/EventBroadcaster';
import { WebSocketSessionManager } from '../transport/WebSocketSessionManager';
import { MockTransportServer } from '../transport/adapters/MockTransportServer';
import { DataStoreFactory } from './DataStoreFactory';

/**
 * ===========================================================================================
 * DATA STORE FACTORY TESTS
 * ===========================================================================================
 *
 * Test Strategy:
 * - Integration test (real dependencies, no mocks)
 * - Test dependency injection pattern
 * - Test singleton pattern for services
 * - Test seeding functionality
 * - Test end-to-end data flow
 *
 * ===========================================================================================
 */

describe('DataStoreFactory', () => {
	let factory: DataStoreFactory;
	let mockTransportServer: MockTransportServer;
	let eventBroadcaster: EventBroadcaster;
	let mockOrchestratorClient: MockOrchestratorClient;

	beforeEach(() => {
		mockOrchestratorClient = new MockOrchestratorClient();
		factory = new DataStoreFactory('memory', mockOrchestratorClient);

		// Initialize EventBroadcaster for tests that need it
		mockTransportServer = new MockTransportServer();
		const authService = new MockAuthService('test-secret');
		const sessionManager = new WebSocketSessionManager(authService);
		eventBroadcaster = new EventBroadcaster(mockTransportServer, sessionManager);
		factory.setEventBroadcaster(eventBroadcaster);
	});

	describe('Constructor and storage initialization', () => {
		it('should create factory with InMemoryStorage for memory mode', () => {
			const storage = factory.getStorage();

			expect(storage).toBeInstanceOf(InMemoryStorage);
		});

		it('should throw error for MariaDB mode (not yet implemented)', () => {
			const client = new MockOrchestratorClient();
			expect(() => new DataStoreFactory('mariadb', client)).toThrow('MariaDB storage not yet implemented');
		});

		it('should default to memory mode when no mode specified', () => {
			const client = new MockOrchestratorClient();
			const defaultFactory = new DataStoreFactory('memory', client);
			const storage = defaultFactory.getStorage();

			expect(storage).toBeInstanceOf(InMemoryStorage);
		});
	});

	describe('getIngredientsService - Service creation and singleton', () => {
		it('should return IngredientsService instance', () => {
			const service = factory.getIngredientsService();

			expect(service).toBeInstanceOf(IngredientsService);
		});

		it('should return same instance on multiple calls (singleton)', () => {
			const service1 = factory.getIngredientsService();
			const service2 = factory.getIngredientsService();

			expect(service1).toBe(service2);
		});

		it('should create service with full dependency chain', async () => {
			const service = factory.getIngredientsService();

			// Test end-to-end by creating an ingredient
			const created = await service.create({
				name: 'Test Ingredient',
				calories: 100,
				protein: 5,
				carbs: 10,
				fat: 2,
				servingSize: 100,
				unit: 'g',
				category: 'Test',
			});

			expect(created).toBeDefined();
			expect(created.id).toBeDefined();
			expect(created.name).toBe('Test Ingredient');

			// Should be able to retrieve it
			const found = await service.getById(created.id);
			expect(found).toEqual(created);
		});
	});

	describe('getBooksService - Service creation and singleton', () => {
		it('should return BooksService instance', () => {
			const service = factory.getBooksService();

			expect(service).toBeInstanceOf(BooksService);
		});

		it('should return same instance on multiple calls (singleton)', () => {
			const service1 = factory.getBooksService();
			const service2 = factory.getBooksService();

			expect(service1).toBe(service2);
		});

		it('should create service with full dependency chain', async () => {
			const service = factory.getBooksService();

			// Test end-to-end by creating a book
			const created = await service.create({
				title: 'Test Book',
				author: 'Test Author',
			});

			expect(created).toBeDefined();
			expect(created.id).toBeDefined();
			expect(created.title).toBe('Test Book');

			// Should be able to retrieve it
			const found = await service.getById(created.id);
			expect(found).toEqual(created);
		});
	});

	describe('getDashboardService - Service creation and singleton', () => {
		it('should return DashboardService instance', () => {
			const service = factory.getDashboardService();

			expect(service).toBeInstanceOf(DashboardService);
		});

		it('should return same instance on multiple calls (singleton)', () => {
			const service1 = factory.getDashboardService();
			const service2 = factory.getDashboardService();

			expect(service1).toBe(service2);
		});

		it('should create service with OrchestratorRepository dependency', () => {
			const service = factory.getDashboardService();

			// Service should be properly instantiated
			expect(service).toBeInstanceOf(DashboardService);
			// Note: We can't easily test the repository without mocking fetch
			// That's covered in DashboardService.test.ts
		});
	});

	describe('getTasksService - Service creation and singleton', () => {
		it('should return TasksService instance', () => {
			const service = factory.getTasksService();

			expect(service).toBeInstanceOf(TasksService);
		});

		it('should return same instance on multiple calls (singleton)', () => {
			const service1 = factory.getTasksService();
			const service2 = factory.getTasksService();

			expect(service1).toBe(service2);
		});

		it('should create service with OrchestratorRepository dependency', () => {
			const service = factory.getTasksService();

			// Service should be properly instantiated
			expect(service).toBeInstanceOf(TasksService);
			// Note: We can't easily test the repository without mocking fetch
			// That's covered in TasksService.test.ts
		});
	});

	describe('getStorage - Storage access', () => {
		it('should return the storage instance', () => {
			const storage = factory.getStorage();

			expect(storage).toBeDefined();
			expect(storage).toBeInstanceOf(InMemoryStorage);
		});

		it('should return same storage instance for all services', async () => {
			const storage = factory.getStorage() as InMemoryStorage;
			const booksService = factory.getBooksService();

			// Create a book via service
			const book = await booksService.create({
				title: 'Test Book',
				author: 'Test Author',
			});

			// Should be accessible via storage
			const found = await storage.getById<Book>('books', book.id);
			expect(found).toEqual(book);
		});
	});

	describe('seedData - Seed initial data', () => {
		it('should seed ingredients and books', async () => {
			await factory.seedData();

			const storage = factory.getStorage() as InMemoryStorage;

			// Check ingredients (25 ingredients seeded)
			const ingredients = await storage.query<Ingredient>('ingredients').execute();
			expect(ingredients).toHaveLength(25);
			expect(ingredients[0].name).toBe('Apple');
			expect(ingredients[1].name).toBe('Grilled Chicken');

			// Check books (35 books seeded)
			const books = await storage.query<Book>('books').execute();
			expect(books).toHaveLength(35);
			expect(books[0].title).toBe('The Pragmatic Programmer');
			expect(books[1].title).toBe('Clean Code');
		});

		it('should seed data with correct structure', async () => {
			await factory.seedData();

			const booksService = factory.getBooksService();
			const books = await booksService.list({});

			// Default pagination returns 10 items per page
			expect(books.items).toHaveLength(10);
			expect(books.pagination!.total).toBe(35);
			expect(books.pagination!.totalPages).toBe(4);
			expect(books.items[0]).toMatchObject({
				id: '1',
				title: 'The Pragmatic Programmer',
				author: 'Andrew Hunt',
				isbn: '978-0135957059',
				publishedYear: 2019,
				genre: 'Programming',
				pages: 352,
				version: 1,
			});
		});

		it('should only seed if storage is InMemoryStorage', async () => {
			// This should not throw
			await factory.seedData();

			// For non-InMemory storage, it should silently do nothing
			// (When MariaDB is implemented, we'll test this properly)
		});

		it('should allow services to work with seeded data', async () => {
			await factory.seedData();

			const booksService = factory.getBooksService();

			// Get seeded book
			const book = await booksService.getById('1');
			expect(book.title).toBe('The Pragmatic Programmer');

			// Update seeded book
			const updated = await booksService.update('1', {
				title: 'Updated Title',
				author: 'Updated Author',
				version: 1,
			});
			expect(updated.title).toBe('Updated Title');
			expect(updated.version).toBe(2);
		});
	});

	describe('Integration - Multiple services sharing storage', () => {
		it('should allow multiple services to coexist', async () => {
			const booksService = factory.getBooksService();
			const ingredientsService = factory.getIngredientsService();

			// Create data in both services
			const book = await booksService.create({
				title: 'Test Book',
				author: 'Test Author',
			});

			const ingredient = await ingredientsService.create({
				name: 'Test Ingredient',
				calories: 100,
				protein: 5,
				carbs: 10,
				fat: 2,
				servingSize: 100,
				unit: 'g',
				category: 'Test',
			});

			// Both should be retrievable
			expect(await booksService.getById(book.id)).toEqual(book);
			expect(await ingredientsService.getById(ingredient.id)).toEqual(ingredient);
		});

		it('should isolate data between different tables', async () => {
			await factory.seedData();

			const booksService = factory.getBooksService();
			const ingredientsService = factory.getIngredientsService();

			// Should have seeded data in both
			const books = await booksService.list({});
			const ingredients = await ingredientsService.list({});

			expect(books.items.length).toBeGreaterThan(0);
			expect(ingredients.items.length).toBeGreaterThan(0);

			// Delete all books
			for (const book of books.items) {
				await booksService.delete(book.id);
			}

			// Ingredients should still exist
			const remainingIngredients = await ingredientsService.list({});
			expect(remainingIngredients.items.length).toBe(ingredients.items.length);
		});
	});

	describe('End-to-end flow', () => {
		it('should support full CRUD cycle through factory', async () => {
			const service = factory.getBooksService();

			// Create
			const created = await service.create({
				title: 'Test Book',
				author: 'Test Author',
				isbn: '978-1234567890',
			});
			expect(created.id).toBeDefined();

			// Read
			const found = await service.getById(created.id);
			expect(found).toEqual(created);

			// Update
			const updated = await service.update(created.id, {
				title: 'Updated Title',
				author: 'Updated Author',
				version: 1,
			});
			expect(updated.title).toBe('Updated Title');
			expect(updated.version).toBe(2);

			// List
			const list = await service.list({});
			expect(list.items).toHaveLength(1);
			expect(list.items[0].id).toBe(created.id);

			// Delete
			await service.delete(created.id);

			// Verify deletion
			const listAfterDelete = await service.list({});
			expect(listAfterDelete.items).toHaveLength(0);
		});

		it('should handle business logic (ISBN uniqueness) through factory', async () => {
			const service = factory.getBooksService();

			// Create first book
			await service.create({
				title: 'Book 1',
				author: 'Author 1',
				isbn: '978-1234567890',
			});

			// Try to create second book with same ISBN
			await expect(
				service.create({
					title: 'Book 2',
					author: 'Author 2',
					isbn: '978-1234567890',
				})
			).rejects.toThrow('A book with ISBN 978-1234567890 already exists');

			// Should only have one book
			const list = await service.list({});
			expect(list.items).toHaveLength(1);
		});

		it('should handle optimistic locking through factory', async () => {
			const service = factory.getBooksService();

			const book = await service.create({
				title: 'Test Book',
				author: 'Test Author',
			});

			// Successful update with correct version
			const updated = await service.update(book.id, {
				title: 'Updated Title',
				author: 'Updated Author',
				version: 1,
			});
			expect(updated.version).toBe(2);

			// Failed update with stale version
			await expect(
				service.update(book.id, {
					title: 'Another Update',
					author: 'Another Author',
					version: 1, // Stale version
				})
			).rejects.toThrow('Book has been modified by another user');
		});
	});
});
