// @ts-nocheck - Example code, not compiled
// Schema-Driven Development Pattern
// Demonstrates how to define JSON Schema and extract TypeScript types

// 1. Define JSON Schema
const createUserSchema = {
  body: {
    type: 'object',
    required: ['email', 'name'],
    properties: {
      email: { type: 'string', format: 'email' },
      name: { type: 'string', minLength: 1 },
      age: { type: 'number', minimum: 0 }
    }
  },
  response: {
    201: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        name: { type: 'string' },
        createdAt: { type: 'string' }
      }
    }
  }
} as const;

// 2. Extract TypeScript types from schema
type CreateUserRequest = FromSchema<typeof createUserSchema.body>;
type CreateUserResponse = FromSchema<typeof createUserSchema.response['201']>;

// 3. Use in route handler
fastify.post<{
  Body: CreateUserRequest;
  Reply: CreateUserResponse;
}>(
  '/users',
  { schema: createUserSchema },
  async (request, reply) => {
    // request.body is fully typed
    // reply must return CreateUserResponse
  }
);
