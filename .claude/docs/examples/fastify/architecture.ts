/**
 * FASTIFY LAYERED ARCHITECTURE
 *
 * This file demonstrates the three-layer architecture in this project:
 * Controllers → Services → Repositories
 */
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

// ==================== TYPES ====================

type Book = {
	id: number;
	title: string;
	author: string;
	published: boolean;
};

// ==================== LAYER 1: STORAGE (Implementation Detail) ====================

class InMemoryStorage {
	private books: Map<number, Book> = new Map();
	private nextId = 1;

	async findAll(): Promise<Book[]> {
		return Array.from(this.books.values());
	}

	async findById(id: number): Promise<Book | undefined> {
		return this.books.get(id);
	}

	async create(book: Omit<Book, 'id'>): Promise<Book> {
		const id = this.nextId++;
		const newBook = { id, ...book };
		this.books.set(id, newBook);
		return newBook;
	}

	async update(id: number, book: Partial<Book>): Promise<Book | undefined> {
		const existing = this.books.get(id);
		if (!existing) return undefined;
		const updated = { ...existing, ...book };
		this.books.set(id, updated);
		return updated;
	}

	async delete(id: number): Promise<boolean> {
		return this.books.delete(id);
	}
}

const storage = new InMemoryStorage();

// ==================== LAYER 2: REPOSITORY (Data Access) ====================

/**
 * ✅ REPOSITORY: Data access layer
 *
 * RESPONSIBILITIES:
 * - CRUD operations
 * - Query building
 * - Storage abstraction
 * - Return domain objects
 *
 * NO:
 * - Business logic
 * - Validation
 * - HTTP concerns
 */
class BooksRepository {
	constructor(private storage: InMemoryStorage) {}

	async findAll(): Promise<Book[]> {
		return this.storage.findAll();
	}

	async findById(id: number): Promise<Book | null> {
		const book = await this.storage.findById(id);
		return book || null;
	}

	async create(book: Omit<Book, 'id'>): Promise<Book> {
		return this.storage.create(book);
	}

	async update(id: number, updates: Partial<Book>): Promise<Book | null> {
		const book = await this.storage.update(id, updates);
		return book || null;
	}

	async delete(id: number): Promise<boolean> {
		return this.storage.delete(id);
	}
}

const booksRepository = new BooksRepository(storage);

// ==================== LAYER 3: SERVICE (Business Logic) ====================

/**
 * ✅ SERVICE: Business logic layer
 *
 * RESPONSIBILITIES:
 * - Business logic
 * - Business rule validation
 * - Data orchestration
 * - Call repositories
 * - Framework-agnostic
 *
 * NO:
 * - HTTP concerns (Request/Reply)
 * - Direct storage access
 * - Route registration
 */
class BooksService {
	constructor(private repository: BooksRepository) {}

	async getAllBooks(): Promise<Book[]> {
		return this.repository.findAll();
	}

	async getBookById(id: number): Promise<Book> {
		const book = await this.repository.findById(id);
		if (!book) {
			throw new Error(`Book with id ${id} not found`);
		}
		return book;
	}

	async createBook(data: Omit<Book, 'id'>): Promise<Book> {
		// ✅ Business validation
		if (!data.title || data.title.length < 1) {
			throw new Error('Title is required');
		}
		if (!data.author || data.author.length < 1) {
			throw new Error('Author is required');
		}

		return this.repository.create(data);
	}

	async updateBook(id: number, updates: Partial<Omit<Book, 'id'>>): Promise<Book> {
		// ✅ Business validation
		const existing = await this.repository.findById(id);
		if (!existing) {
			throw new Error(`Book with id ${id} not found`);
		}

		if (updates.title !== undefined && updates.title.length < 1) {
			throw new Error('Title cannot be empty');
		}

		return this.repository.update(id, updates) as Promise<Book>;
	}

	async deleteBook(id: number): Promise<void> {
		const deleted = await this.repository.delete(id);
		if (!deleted) {
			throw new Error(`Book with id ${id} not found`);
		}
	}
}

const booksService = new BooksService(booksRepository);

// ==================== LAYER 4: CONTROLLER (HTTP Layer) ====================

// Zod schemas for validation
const CreateBookSchema = z.object({
	title: z.string().min(1),
	author: z.string().min(1),
	published: z.boolean().default(false),
});

const UpdateBookSchema = CreateBookSchema.partial();

const BookIdSchema = z.object({
	id: z.coerce.number(),
});

/**
 * ✅ CONTROLLER: HTTP layer (thin)
 *
 * RESPONSIBILITIES:
 * - Register routes
 * - Validate requests (Zod)
 * - Call service methods
 * - Format responses
 * - Handle errors → HTTP status
 *
 * NO:
 * - Business logic
 * - Direct repository access
 * - Complex transformations
 */
class BooksController {
	constructor(private service: BooksService) {}

	async register(fastify: FastifyInstance) {
		// GET /books
		fastify.get('/books', async (request: FastifyRequest, reply: FastifyReply) => {
			try {
				const books = await this.service.getAllBooks();
				return reply.status(200).send(books);
			} catch (error) {
				return reply.status(500).send({ error: 'Internal server error' });
			}
		});

		// GET /books/:id
		fastify.get<{ Params: { id: string } }>(
			'/books/:id',
			async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
				try {
					// ✅ Validate params
					const { id } = BookIdSchema.parse(request.params);

					// ✅ Delegate to service
					const book = await this.service.getBookById(id);

					return reply.status(200).send(book);
				} catch (error) {
					if (error instanceof Error && error.message.includes('not found')) {
						return reply.status(404).send({ error: error.message });
					}
					return reply.status(500).send({ error: 'Internal server error' });
				}
			}
		);

		// POST /books
		fastify.post('/books', async (request: FastifyRequest, reply: FastifyReply) => {
			try {
				// ✅ Validate body
				const data = CreateBookSchema.parse(request.body);

				// ✅ Delegate to service
				const book = await this.service.createBook(data);

				return reply.status(201).send(book);
			} catch (error) {
				if (error instanceof z.ZodError) {
					return reply
						.status(400)
						.send({ error: 'Validation error', details: error.errors });
				}
				if (error instanceof Error) {
					return reply.status(400).send({ error: error.message });
				}
				return reply.status(500).send({ error: 'Internal server error' });
			}
		});

		// PATCH /books/:id
		fastify.patch<{ Params: { id: string } }>(
			'/books/:id',
			async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
				try {
					const { id } = BookIdSchema.parse(request.params);
					const updates = UpdateBookSchema.parse(request.body);

					const book = await this.service.updateBook(id, updates);

					return reply.status(200).send(book);
				} catch (error) {
					if (error instanceof z.ZodError) {
						return reply.status(400).send({ error: 'Validation error' });
					}
					if (error instanceof Error && error.message.includes('not found')) {
						return reply.status(404).send({ error: error.message });
					}
					return reply.status(500).send({ error: 'Internal server error' });
				}
			}
		);

		// DELETE /books/:id
		fastify.delete<{ Params: { id: string } }>(
			'/books/:id',
			async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
				try {
					const { id } = BookIdSchema.parse(request.params);

					await this.service.deleteBook(id);

					return reply.status(204).send();
				} catch (error) {
					if (error instanceof Error && error.message.includes('not found')) {
						return reply.status(404).send({ error: error.message });
					}
					return reply.status(500).send({ error: 'Internal server error' });
				}
			}
		);
	}
}

const booksController = new BooksController(booksService);

// ==================== SETUP ====================

export async function setupBooksRoutes(fastify: FastifyInstance) {
	await booksController.register(fastify);
}

/**
 * KEY TAKEAWAYS:
 *
 * LAYER RESPONSIBILITIES:
 *
 * 1. CONTROLLER (Thin)
 *    - Routes
 *    - Validation
 *    - Error → HTTP status
 *    - Response formatting
 *
 * 2. SERVICE (Business Logic)
 *    - Business rules
 *    - Orchestration
 *    - Domain logic
 *    - Framework-agnostic
 *
 * 3. REPOSITORY (Data Access)
 *    - CRUD operations
 *    - Storage abstraction
 *    - Query building
 *
 * BENEFITS:
 * - Clear separation of concerns
 * - Easy to test each layer independently
 * - Business logic reusable across controllers
 * - Easy to swap storage implementation
 * - Maintainable and scalable
 */
