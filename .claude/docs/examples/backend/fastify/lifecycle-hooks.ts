// @ts-nocheck - Example code, not compiled
// Lifecycle Hooks Patterns
// Demonstrates common hook patterns for authentication, logging, etc.

// Authentication hook
fastify.addHook('preHandler', async (request, reply) => {
  const token = request.headers.authorization?.split(' ')[1];
  if (!token) {
    throw new UnauthorizedError('Missing token');
  }
  request.user = await verifyToken(token);
});

// Request ID injection
fastify.addHook('onRequest', async (request, reply) => {
  request.id = request.headers['x-request-id'] ?? crypto.randomUUID();
  reply.header('x-request-id', request.id);
});

// Performance logging
fastify.addHook('onResponse', async (request, reply) => {
  const duration = reply.getResponseTime();
  request.log.info({
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    duration
  });
});
