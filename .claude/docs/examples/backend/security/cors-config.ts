// @ts-nocheck - Example code, not compiled
// CORS Configuration
// Demonstrates CORS setup for production
import cors from '@fastify/cors';

await fastify.register(cors, {
	origin: process.env.ALLOWED_ORIGINS?.split(',') ?? false,
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
});
