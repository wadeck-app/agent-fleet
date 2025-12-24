import type { Book, BooksListQuery } from '@app/shared/api/books.contract';

import type { BaseRepository } from './BaseRepository';

/**
 * ===========================================================================================
 * BOOKS REPOSITORY
 * ===========================================================================================
 *
 * Domain-specific data access for books.
 * Uses BaseRepository's query builder to compose domain queries.
 *
 * ===========================================================================================
 */

export class BooksRepository {
	constructor(private readonly base: BaseRepository<Book>) {}

	/**
	 * Find all books with optional filters and multi-column sorting
	 */
	async findAll(query?: BooksListQuery): Promise<Book[]> {
		const qb = this.base.query();

		// Apply author filter
		if (query?.author) {
			qb.where('author', 'contains', query.author);
		}

		// Apply genre filter
		if (query?.genre) {
			qb.where('genre', '=', query.genre);
		}

		// Apply multi-column sorting
		// Format: sortBy="title,author" sortOrder="asc,desc"
		if (query?.sortBy && query?.sortOrder) {
			const sortColumns = query.sortBy.split(',').map(s => s.trim());
			const sortOrders = query.sortOrder.split(',').map(s => s.trim().toUpperCase() as 'ASC' | 'DESC');

			// Apply each sort in order (first has priority)
			sortColumns.forEach((column, index) => {
				const order = sortOrders[index] || 'ASC';
				if (index === 0) {
					qb.orderBy(column as keyof Book, order);
				} else {
					qb.thenBy(column as keyof Book, order);
				}
			});
		}

		// Get results
		let results = await qb.execute();

		// Apply search filter (title or author contains search term)
		// Note: For in-memory, we filter after fetch. For SQL, this would be a WHERE clause
		if (query?.search) {
			const searchLower = query.search.toLowerCase();
			results = results.filter(
				b => b.title.toLowerCase().includes(searchLower) || b.author.toLowerCase().includes(searchLower)
			);
		}

		return results;
	}

	/**
	 * Find book by ID
	 */
	async findById(id: string): Promise<Book | null> {
		return this.base.findById(id);
	}

	/**
	 * Find books by author
	 * @param author Author name (partial match)
	 */
	async findByAuthor(author: string): Promise<Book[]> {
		return this.base.query().where('author', 'contains', author).execute();
	}

	/**
	 * Find books by genre
	 * @param genre Book genre
	 */
	async findByGenre(genre: string): Promise<Book[]> {
		return this.base.query().where('genre', '=', genre).execute();
	}

	/**
	 * Find books by ISBN
	 * @param isbn ISBN number
	 */
	async findByISBN(isbn: string): Promise<Book | null> {
		const results = await this.base.query().where('isbn', '=', isbn).limit(1).execute();
		return results[0] ?? null;
	}

	/**
	 * Find books published in a specific year range
	 * @param fromYear Start year
	 * @param toYear End year
	 */
	async findByYearRange(fromYear: number, toYear: number): Promise<Book[]> {
		return this.base
			.query()
			.where('publishedYear', '>=', fromYear)
			.andWhere('publishedYear', '<=', toYear)
			.orderBy('publishedYear', 'DESC')
			.execute();
	}

	/**
	 * Create a new book
	 */
	async create(data: Omit<Book, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<Book> {
		return this.base.create(data);
	}

	/**
	 * Update an existing book
	 */
	async update(id: string, data: Partial<Omit<Book, 'id' | 'createdAt'>>): Promise<Book> {
		return this.base.update(id, data);
	}

	/**
	 * Delete a book
	 */
	async delete(id: string): Promise<void> {
		return this.base.delete(id);
	}
}
