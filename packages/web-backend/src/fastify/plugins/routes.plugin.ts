import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

// violations-suppress-start: ts/no-deep-relative no @/ alias available in web-backend tsconfig
import routes from '../../routes';
import { CONTROLLER_REGISTRY } from '../../utils/controller-registry';
import { registerControllerWithCheck } from '../../utils/lazy-controller-plugin';
// violations-suppress-end: ts/no-deep-relative

// /**
//  * Route module definition for lazy loading
//  */
// interface RouteModule {
// 	path: string;
// 	loader: () => Promise<{ default: FastifyPluginAsync }>;
// }

// /**
//  * Route modules mapping
//  * Similar to Express routes/index.ts but using Fastify plugins
//  *
//  * Routes are loaded as Fastify plugins on server startup
//  * This provides good startup time while maintaining modularity
//  */
// const routeModules: RouteModule[] = [
// 	{ path: '/ingredients', loader: () => import('../routes/ingredients') },
// 	{ path: '/recipes', loader: () => import('../routes/recipes') },
// 	{ path: '/daily-logs', loader: () => import('../routes/dailyLogs') },
// 	{ path: '/user-settings', loader: () => import('../routes/userSettings') },
// 	{ path: '/tracking-chat', loader: () => import('../routes/trackingChat') },
// 	{ path: '/chat', loader: () => import('../routes/chat') },
// 	{ path: '/cache', loader: () => import('../routes/cache') },
// 	{ path: '/api-stats', loader: () => import('../routes/apiStats') },
// 	{ path: '/config', loader: () => import('../routes/config') },
// ];

const routeModules = routes;

/**
 * Routes plugin - registers all route modules
 * Each route is loaded as a Fastify plugin with its own prefix
 */
const routesPlugin: FastifyPluginAsync = async fastify => {
	// Register API info endpoint
	fastify.get('/', apiHomeHandler);

	// Register all route modules
	// for (const { path, loader } of routeModules) {
	// 	const module = await loader();
	// 	// const t1 = await fastify.register(module.default, { prefix: path });
	// 	// const t2 = fastify.register(module.default, { prefix: path });
	//
	// 	fastify.register(
	// 		registerControllerWithCheck(
	// 			'/api/books',
	// 			async () => import('./controllers/BooksController')
	// 		)
	// 	);
	// }

	for (const [controllerBaseUrl, importLoader] of routeModules) {
		// const module = await loader();
		// const t1 = await fastify.register(module.default, { prefix: path });
		// const t2 = fastify.register(module.default, { prefix: path });

		// implicit prefix of /api
		fastify.register(registerControllerWithCheck(controllerBaseUrl, importLoader));
	}

	// Test routes (only active when NOT in production mode)
	if (process.env.USE_PRODUCTION_DB !== 'true') {
		const testRoutesModule = await import('../plugins/testRoutes.plugin');
		// implicit prefix of /api/test
		// await fastify.register(testRoutesModule.testRoutes, { prefix: '/api/test' });
		await fastify.register(testRoutesModule.testRoutes);
	}
};

export default routesPlugin;

/**
 * Provide information for tests to validate it's the expected server in expected configuration
 * GET /api
 *
 * This endpoint initializes all controllers to provide a complete list of available routes.
 */
async function apiHomeHandler(request: FastifyRequest, reply: FastifyReply) {
	let versionCache: string;

	function getVersion() {
		if (!versionCache) {
			try {
				const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf-8'));
				versionCache = packageJson.version;
			} catch {
				// In bundled builds, import.meta.url points to the bundle; path resolution differs
				versionCache = 'unknown';
			}
		}

		return versionCache;
	}

	// Initialize all controllers to get complete route list
	await Promise.all(Array.from(CONTROLLER_REGISTRY.values()).map(init => init()));

	// Get sorted list of endpoints
	const endpoints = Array.from(CONTROLLER_REGISTRY.keys()).sort();

	const version = getVersion();
	return reply.send({
		message: 'App API',
		version: version,
		endpoints: endpoints,
	});
}
