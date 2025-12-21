import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Book, BooksListQuery, CreateBook, PatchBook, UpdateBook } from '@app/shared';
import { ConflictException, NotFoundException } from '@app/shared';
import { BOOKS_API_ROUTES } from '@app/shared';

import type { BooksService } from '../services/BooksService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import BooksController from './BooksController';

/**
 * ===========================================================================================
 * BOOKS CONTROLLER TESTS
 * ===========================================================================================
 *
 * Test Strategy:
 * - Mock the BooksService (unit test - no real dependencies)
 * - Test all CRUD operations
 * - Test error scenarios (NotFoundException, ConflictException)
 * - Test pagination via service delegation
 *
 * ===========================================================================================
 */

describe('BooksController', () => {
	let controller: BooksController;
	let mockService: BooksService;
	let routes: Map<string, (...args: any[]) => Promise<any>>;

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

	const createBookData: CreateBook = {
		title: 'Clean Code',
		author: 'Robert C. Martin',
		isbn: '978-0132350884',
		publishedYear: 2008,
		genre: 'Programming',
		pages: 464,
	};

	beforeEach(() => {
		// Create mock service with all methods
		mockService = {
			list: vi.fn(),
			getById: vi.fn(),
			getByISBN: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			partialUpdate: vi.fn(),
			delete: vi.fn(),
			bulkDelete: vi.fn(),
		} as unknown as BooksService;

		// Create controller with mock service
		controller = new BooksController(mockService);

		// Capture routes
		routes = new Map();
		const mockAdd: RouteWrapperFunc<typeof BOOKS_API_ROUTES> = (method, path, handler) => {
			routes.set(`${method} ${path}`, handler);
		};

		controller.configureRoutes(mockAdd);
	});

	describe('GET /api/books - List all books', () => {
		it('should list all books with default pagination', async () => {
			const expectedResponse = {
				items: [sampleBook],
				pagination: {
					total: 1,
					page: 1,
					pageSize: 10,
					totalPages: 1,
				},
			};

			vi.mocked(mockService.list).mockResolvedValue(expectedResponse);

			const handler = routes.get('GET /api/books/');
			expect(handler).toBeDefined();

			const result = await handler!({ query: {} });

			expect(result).toEqual(expectedResponse);
			expect(mockService.list).toHaveBeenCalledWith({});
		});

		it('should list books with search filter', async () => {
			const query: BooksListQuery = { search: 'Pragmatic' };
			const expectedResponse = {
				items: [sampleBook],
				pagination: {
					total: 1,
					page: 1,
					pageSize: 10,
					totalPages: 1,
				},
			};

			vi.mocked(mockService.list).mockResolvedValue(expectedResponse);

			const handler = routes.get('GET /api/books/');
			const result = await handler!({ query });

			expect(result).toEqual(expectedResponse);
			expect(mockService.list).toHaveBeenCalledWith(query);
		});

		it('should list books with author filter', async () => {
			const query: BooksListQuery = { author: 'Hunt' };
			const expectedResponse = {
				items: [sampleBook],
				pagination: {
					total: 1,
					page: 1,
					pageSize: 10,
					totalPages: 1,
				},
			};

			vi.mocked(mockService.list).mockResolvedValue(expectedResponse);

			const handler = routes.get('GET /api/books/');
			const result = await handler!({ query });

			expect(result).toEqual(expectedResponse);
			expect(mockService.list).toHaveBeenCalledWith(query);
		});

		it('should list books with genre filter', async () => {
			const query: BooksListQuery = { genre: 'Programming' };
			const expectedResponse = {
				items: [sampleBook],
				pagination: {
					total: 1,
					page: 1,
					pageSize: 10,
					totalPages: 1,
				},
			};

			vi.mocked(mockService.list).mockResolvedValue(expectedResponse);

			const handler = routes.get('GET /api/books/');
			const result = await handler!({ query });

			expect(result).toEqual(expectedResponse);
			expect(mockService.list).toHaveBeenCalledWith(query);
		});

		it('should list books with pagination parameters', async () => {
			const query: BooksListQuery = { page: 2, pageSize: 5 };
			const expectedResponse = {
				items: [sampleBook],
				pagination: {
					total: 10,
					page: 2,
					pageSize: 5,
					totalPages: 2,
				},
			};

			vi.mocked(mockService.list).mockResolvedValue(expectedResponse);

			const handler = routes.get('GET /api/books/');
			const result = await handler!({ query });

			expect(result).toEqual(expectedResponse);
			expect(mockService.list).toHaveBeenCalledWith(query);
		});
	});

	describe('GET /api/books/:id - Get book by ID', () => {
		it('should return a book when found', async () => {
			vi.mocked(mockService.getById).mockResolvedValue(sampleBook);

			const handler = routes.get('GET /api/books/:id');
			expect(handler).toBeDefined();

			const result = await handler!({ params: { id: '1' } });

			expect(result).toEqual(sampleBook);
			expect(mockService.getById).toHaveBeenCalledWith('1');
		});

		it('should throw NotFoundException when book not found', async () => {
			vi.mocked(mockService.getById).mockRejectedValue(new NotFoundException('Book with id 999 not found'));

			const handler = routes.get('GET /api/books/:id');

			await expect(handler!({ params: { id: '999' } })).rejects.toThrow(NotFoundException);
			expect(mockService.getById).toHaveBeenCalledWith('999');
		});
	});

	describe('GET /api/books/isbn/:isbn - Get book by ISBN', () => {
		it('should return a book when found by ISBN', async () => {
			vi.mocked(mockService.getByISBN).mockResolvedValue(sampleBook);

			const handler = routes.get('GET /api/books/isbn/:isbn');
			expect(handler).toBeDefined();

			const result = await handler!({ params: { isbn: '978-0135957059' } });

			expect(result).toEqual(sampleBook);
			expect(mockService.getByISBN).toHaveBeenCalledWith('978-0135957059', undefined);
		});

		it('should throw NotFoundException when book not found by ISBN', async () => {
			vi.mocked(mockService.getByISBN).mockRejectedValue(
				new NotFoundException('Book with ISBN 978-9999999999 not found')
			);

			const handler = routes.get('GET /api/books/isbn/:isbn');

			await expect(handler!({ params: { isbn: '978-9999999999' } })).rejects.toThrow(NotFoundException);
			expect(mockService.getByISBN).toHaveBeenCalledWith('978-9999999999', undefined);
		});
	});

	describe('POST /api/books - Create a new book', () => {
		it('should create a new book successfully', async () => {
			const createdBook: Book = {
				...createBookData,
				id: '2',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockService.create).mockResolvedValue(createdBook);

			const handler = routes.get('POST /api/books/');
			expect(handler).toBeDefined();

			const result = await handler!({ body: createBookData });

			expect(result).toEqual(createdBook);
			expect(mockService.create).toHaveBeenCalledWith(createBookData);
		});

		it('should throw ConflictException when ISBN already exists', async () => {
			vi.mocked(mockService.create).mockRejectedValue(
				new ConflictException('A book with ISBN 978-0132350884 already exists')
			);

			const handler = routes.get('POST /api/books/');

			await expect(handler!({ body: createBookData })).rejects.toThrow(ConflictException);
			expect(mockService.create).toHaveBeenCalledWith(createBookData);
		});

		it('should create a book without optional fields', async () => {
			const minimalBookData: CreateBook = {
				title: 'Test Book',
				author: 'Test Author',
			};

			const createdBook: Book = {
				...minimalBookData,
				id: '3',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockService.create).mockResolvedValue(createdBook);

			const handler = routes.get('POST /api/books/');
			const result = await handler!({ body: minimalBookData });

			expect(result).toEqual(createdBook);
			expect(mockService.create).toHaveBeenCalledWith(minimalBookData);
		});
	});

	describe('PUT /api/books/:id - Update an existing book', () => {
		it('should update a book successfully', async () => {
			const updateData: UpdateBook = {
				title: 'Updated Title',
				version: 1,
			};

			const updatedBook: Book = {
				...sampleBook,
				title: 'Updated Title',
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockService.update).mockResolvedValue(updatedBook);

			const handler = routes.get('PUT /api/books/:id');
			expect(handler).toBeDefined();

			const result = await handler!({ params: { id: '1' }, body: updateData });

			expect(result).toEqual(updatedBook);
			expect(mockService.update).toHaveBeenCalledWith('1', updateData);
		});

		it('should throw NotFoundException when updating non-existent book', async () => {
			const updateData: UpdateBook = {
				title: 'Updated Title',
				version: 1,
			};

			vi.mocked(mockService.update).mockRejectedValue(new NotFoundException('Book with id 999 not found'));

			const handler = routes.get('PUT /api/books/:id');

			await expect(handler!({ params: { id: '999' }, body: updateData })).rejects.toThrow(NotFoundException);
			expect(mockService.update).toHaveBeenCalledWith('999', updateData);
		});

		it('should throw ConflictException on version mismatch (optimistic locking)', async () => {
			const updateData: UpdateBook = {
				title: 'Updated Title',
				version: 1,
			};

			vi.mocked(mockService.update).mockRejectedValue(
				new ConflictException(
					'Book has been modified by another user. Expected version 1, but current version is 2.'
				)
			);

			const handler = routes.get('PUT /api/books/:id');

			await expect(handler!({ params: { id: '1' }, body: updateData })).rejects.toThrow(ConflictException);
			expect(mockService.update).toHaveBeenCalledWith('1', updateData);
		});

		it('should throw ConflictException when updating ISBN to existing one', async () => {
			const updateData: UpdateBook = {
				isbn: '978-0132350884',
				version: 1,
			};

			vi.mocked(mockService.update).mockRejectedValue(
				new ConflictException('A book with ISBN 978-0132350884 already exists')
			);

			const handler = routes.get('PUT /api/books/:id');

			await expect(handler!({ params: { id: '1' }, body: updateData })).rejects.toThrow(ConflictException);
			expect(mockService.update).toHaveBeenCalledWith('1', updateData);
		});
	});

	describe('PATCH /api/books/:id - Partially update a book', () => {
		it('should partially update a book successfully', async () => {
			const patchData: PatchBook = {
				title: 'Partially Updated Title',
				version: 1,
			};

			const updatedBook: Book = {
				...sampleBook,
				title: 'Partially Updated Title',
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockService.partialUpdate).mockResolvedValue(updatedBook);

			const handler = routes.get('PATCH /api/books/:id');
			expect(handler).toBeDefined();

			const result = await handler!({ params: { id: '1' }, body: patchData });

			expect(result).toEqual(updatedBook);
			expect(mockService.partialUpdate).toHaveBeenCalledWith('1', patchData);
		});

		it('should throw NotFoundException when patching non-existent book', async () => {
			const patchData: PatchBook = {
				title: 'Updated Title',
				version: 1,
			};

			vi.mocked(mockService.partialUpdate).mockRejectedValue(new NotFoundException('Book with id 999 not found'));

			const handler = routes.get('PATCH /api/books/:id');

			await expect(handler!({ params: { id: '999' }, body: patchData })).rejects.toThrow(NotFoundException);
			expect(mockService.partialUpdate).toHaveBeenCalledWith('999', patchData);
		});

		it('should throw ConflictException on version mismatch', async () => {
			const patchData: PatchBook = {
				title: 'Updated Title',
				version: 1,
			};

			vi.mocked(mockService.partialUpdate).mockRejectedValue(
				new ConflictException(
					'Book has been modified by another user. Expected version 1, but current version is 2.'
				)
			);

			const handler = routes.get('PATCH /api/books/:id');

			await expect(handler!({ params: { id: '1' }, body: patchData })).rejects.toThrow(ConflictException);
			expect(mockService.partialUpdate).toHaveBeenCalledWith('1', patchData);
		});
	});

	describe('DELETE /api/books/:id - Delete a book', () => {
		it('should delete a book successfully', async () => {
			vi.mocked(mockService.delete).mockResolvedValue(undefined);

			const handler = routes.get('DELETE /api/books/:id');
			expect(handler).toBeDefined();

			const result = await handler!({ params: { id: '1' } });

			expect(result).toEqual({ success: true, id: '1' });
			expect(mockService.delete).toHaveBeenCalledWith('1');
		});

		it('should throw NotFoundException when deleting non-existent book', async () => {
			vi.mocked(mockService.delete).mockRejectedValue(new NotFoundException('Book with id 999 not found'));

			const handler = routes.get('DELETE /api/books/:id');

			await expect(handler!({ params: { id: '999' } })).rejects.toThrow(NotFoundException);
			expect(mockService.delete).toHaveBeenCalledWith('999');
		});
	});

	describe('DELETE /api/books/ - Bulk delete books', () => {
		it('should delete multiple books successfully', async () => {
			const bulkResponse = {
				success: true,
				deleted: ['1', '2', '3'],
				failed: [],
				totalRequested: 3,
				totalDeleted: 3,
				totalFailed: 0,
			};
			vi.mocked(mockService.bulkDelete).mockResolvedValue(bulkResponse);

			const handler = routes.get('DELETE /api/books/');
			expect(handler).toBeDefined();

			const result = await handler!({ body: { ids: ['1', '2', '3'] } });

			expect(result).toEqual(bulkResponse);
			expect(mockService.bulkDelete).toHaveBeenCalledWith(['1', '2', '3']);
		});

		it('should handle partial failures', async () => {
			const bulkResponse = {
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
			};
			vi.mocked(mockService.bulkDelete).mockResolvedValue(bulkResponse);

			const handler = routes.get('DELETE /api/books/');

			const result = await handler!({ body: { ids: ['1', '2', '3'] } });

			expect(result).toEqual(bulkResponse);
			expect(mockService.bulkDelete).toHaveBeenCalledWith(['1', '2', '3']);
		});
	});

	describe('Route registration', () => {
		it('should register all 8 routes', () => {
			expect(routes.size).toBe(8);
			expect(routes.has('GET /api/books/')).toBe(true);
			expect(routes.has('GET /api/books/:id')).toBe(true);
			expect(routes.has('GET /api/books/isbn/:isbn')).toBe(true);
			expect(routes.has('POST /api/books/')).toBe(true);
			expect(routes.has('DELETE /api/books/')).toBe(true);
			expect(routes.has('PUT /api/books/:id')).toBe(true);
			expect(routes.has('PATCH /api/books/:id')).toBe(true);
			expect(routes.has('DELETE /api/books/:id')).toBe(true);
		});

		it('should have static routes property', () => {
			expect(BooksController.routes).toBeDefined();
			expect(BooksController.routes).toBe(BOOKS_API_ROUTES);
		});
	});
});
