// @ts-nocheck - Example code, not compiled
// Security Headers Configuration
// Demonstrates Helmet setup for security headers
import helmet from '@fastify/helmet';

await fastify.register(helmet, {
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'"],
			styleSrc: ["'self'", "'unsafe-inline'"],
			scriptSrc: ["'self'"],
		},
	},
});
