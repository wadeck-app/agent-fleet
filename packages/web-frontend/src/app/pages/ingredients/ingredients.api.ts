import { createApiClient, createTypedFetch } from '@framework/api/api-base';
import { INGREDIENTS_API_ROUTES, type IngredientsListQuery } from '@shared';

const api = createApiClient(INGREDIENTS_API_ROUTES);
const typedFetch = createTypedFetch(INGREDIENTS_API_ROUTES);

export const ingredientsApi = {
	getAll: (query?: IngredientsListQuery) => typedFetch('GET', '/api/ingredients/', { query }),
	getById: api.byId('GET', '/api/ingredients/:id'),
	create: api.mutate('POST', '/api/ingredients/'),
	update: api.mutateById('PUT', '/api/ingredients/:id'),
	delete: api.byId('DELETE', '/api/ingredients/:id'),
} as const;
