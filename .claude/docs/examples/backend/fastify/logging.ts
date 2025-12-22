// @ts-nocheck - Example code, not compiled
// Logging Configuration
// Demonstrates Pino logger setup and usage

const fastify = Fastify({
	logger: {
		level: process.env.LOG_LEVEL ?? 'info',
		...(process.env.NODE_ENV === 'development' && {
			transport: {
				target: 'pino-pretty',
				options: { colorize: true },
			},
		}),
	},
});

// In handlers
fastify.get('/users/:id', async (request, reply) => {
	request.log.info({ userId: request.params.id }, 'Fetching user');
	// ...
	request.log.debug({ user }, 'User fetched successfully');
});
