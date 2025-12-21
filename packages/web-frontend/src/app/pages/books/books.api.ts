import { createApiClient, createTypedFetch } from '@framework/api/api-base';
import { BOOKS_API_ROUTES, type BooksListQuery } from '@shared';

const api = createApiClient(BOOKS_API_ROUTES);
const typedFetch = createTypedFetch(BOOKS_API_ROUTES);

export const booksApi = {
	getAll: (query?: BooksListQuery) => typedFetch('GET', '/api/books/', { query }),
	getById: api.byId('GET', '/api/books/:id'),
	getByIsbn: (isbn: string, excludeBookId?: string) =>
		typedFetch('GET', '/api/books/isbn/:isbn', {
			params: { isbn },
			query: excludeBookId ? { excludeBookId } : undefined,
		}),
	create: api.mutate('POST', '/api/books/'),
	update: api.mutateById('PUT', '/api/books/:id'),
	patch: api.mutateById('PATCH', '/api/books/:id'),
	delete: api.byId('DELETE', '/api/books/:id'),
	bulkDelete: (ids: string[]) =>
		typedFetch('DELETE', '/api/books/', {
			body: { ids },
		}),
} as const;
