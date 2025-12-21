// Loaded by fastify/plugins/routes.plugin.ts
// put at root level for discovery
import { ApiUrl } from '@app/shared';

type RouteDefinition = [ApiUrl, () => Promise<any>];

const routes: RouteDefinition[] = [
	['/api/ingredients', () => import('./controllers/IngredientsController')],
	['/api/books', () => import('./controllers/BooksController')],
];

export default routes;
// export default routes2;
// fastify.register(
// 	registerControllerWithCheck(
// 		'/api/ingredients',
// 		async () => import('./controllers/IngredientsController')
// 	)
// );
