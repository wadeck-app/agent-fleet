// Loaded by fastify/plugins/routes.plugin.ts
// put at root level for discovery
import type { ApiUrl } from '@app/shared/route-builder';

type RouteDefinition = [ApiUrl, () => Promise<any>];

const routes: RouteDefinition[] = [
	['/api/auth', () => import('./controllers/AuthController')],
	['/api/ingredients', () => import('./controllers/IngredientsController')],
	['/api/books', () => import('./controllers/BooksController')],
	['/api/dashboard', () => import('./controllers/DashboardController')],
	['/api/workers', () => import('./controllers/WorkersController')],
	['/api/flows', () => import('./controllers/FlowsController')],
	['/api/tasks', () => import('./controllers/TasksController')],
	['/api/workspaces', () => import('./controllers/WorkspacesController')],
	['/api/projects', () => import('./controllers/ProjectsController')],
	['/api/interventions', () => import('./controllers/InterventionsController')],
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
