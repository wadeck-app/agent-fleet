// @ts-nocheck - Example code, not compiled
// Error Handling Pattern
// Demonstrates custom error classes and global error handler

// Define error classes
class NotFoundError extends Error {
  statusCode = 404;
  code = 'NOT_FOUND';
}

class ValidationError extends Error {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  constructor(message: string, public details: unknown) {
    super(message);
  }
}

// Global error handler
fastify.setErrorHandler((error, request, reply) => {
  // Log error with context
  request.log.error({
    err: error,
    req: request.raw,
    res: reply.raw
  });

  // Determine status code
  const statusCode = error.statusCode ?? 500;

  // Send consistent error response
  reply.status(statusCode).send({
    error: {
      message: error.message,
      code: error.code ?? 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    }
  });
});

// Usage in handler
async function getUserHandler(request, reply) {
  const user = await userService.findById(request.params.id);
  if (!user) {
    throw new NotFoundError(`User ${request.params.id} not found`);
  }
  return user;
}
