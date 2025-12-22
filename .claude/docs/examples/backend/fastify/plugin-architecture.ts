// @ts-nocheck - Example code, not compiled
// Plugin Architecture Pattern
// Demonstrates how to encapsulate features in reusable plugins
// users-plugin.ts
import { FastifyPluginAsync } from 'fastify';

export const usersPlugin: FastifyPluginAsync = async (fastify, opts) => {
	// Plugin-scoped decorators
	fastify.decorate('userService', new UserService());

	// Routes
	fastify.post('/users', createUserHandler);
	fastify.get('/users/:id', getUserHandler);

	// Hooks (only for this plugin's routes)
	fastify.addHook('preHandler', authenticateUser);
};

// server.ts
await fastify.register(usersPlugin, { prefix: '/api' });
