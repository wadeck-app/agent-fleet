// @ts-nocheck - Example code, not compiled
// Response Serialization Pattern
// Demonstrates automatic response serialization with schema

const getUserSchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        name: { type: 'string' },
        // Sensitive fields excluded from schema = not serialized
        // passwordHash, privateKey, etc.
      }
    }
  }
} as const;

// Fastify automatically removes unlisted properties
fastify.get('/users/:id', { schema: getUserSchema }, async (request, reply) => {
  const user = await db.findUser(request.params.id);
  return user; // passwordHash automatically stripped
});
