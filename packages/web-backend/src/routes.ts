// Loaded by fastify/plugins/routes.plugin.ts
// put at root level for discovery
import { ApiUrl } from '@app/shared';

type RouteDefinition = [ApiUrl, () => Promise<any>];

const routes: RouteDefinition[] = [
	['/api/auth', () => import('./controllers/AuthController')],
	['/api/ingredients', () => import('./controllers/IngredientsController')],
	['/api/books', () => import('./controllers/BooksController')],
	['/api/dashboard', () => import('./controllers/DashboardController')],
	['/api/workers', () => import('./controllers/WorkersController')],
	['/api/tasks', () => import('./controllers/TasksController')],
	['/api/workspaces', () => import('./controllers/WorkspacesController')],
	['/api/monitoring', () => import('./controllers/MonitoringController')],
];

export default routes;
// export default routes2;
// fastify.register(
// 	registerControllerWithCheck(
// 		'/api/ingredients',
// 		async () => import('./controllers/IngredientsController')
// 	)
// );
