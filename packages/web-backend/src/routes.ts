// Loaded by fastify/plugins/routes.plugin.ts
// put at root level for discovery
import type { ApiUrl } from '@app/shared/route-builder';

type RouteDefinition = [ApiUrl, () => Promise<{ default: unknown }>];

const routes: RouteDefinition[] = [
	['/api/auth', () => import('./controllers/AuthController')],
	['/api/ingredients', () => import('./controllers/IngredientsController')],
	['/api/books', () => import('./controllers/BooksController')],
	['/api/products', () => import('./controllers/ProductsController')],
	['/api/dashboard', () => import('./controllers/DashboardController')],
	['/api/workers', () => import('./controllers/WorkersController')],
	['/api/flows', () => import('./controllers/FlowsController')],
	['/api/tasks', () => import('./controllers/TasksController')],
	['/api/flow-feedback', () => import('./controllers/FlowFeedbackController')],
	['/api/tickets', () => import('./controllers/TicketsController')],
	['/api/workspaces', () => import('./controllers/WorkspacesWithScriptsController')],
	['/api/projects', () => import('./controllers/ProjectsController')],
	['/api/interventions', () => import('./controllers/InterventionsController')],
	['/api/monitoring/transport', () => import('./controllers/MonitoringController')],
];

export default routes;
// export default routes2;
// fastify.register(
// 	registerControllerWithCheck(
// 		'/api/ingredients',
// 		async () => import('./controllers/IngredientsController')
// 	)
// );
