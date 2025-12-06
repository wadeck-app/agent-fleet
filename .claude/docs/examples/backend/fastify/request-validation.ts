// @ts-nocheck - Example code, not compiled
// Request Validation Pattern
// Demonstrates reusable schema components and composition

import { FastifyPluginAsync } from 'fastify';

// Reusable schema components
const EmailSchema = { type: 'string', format: 'email' } as const;
const UuidSchema = { type: 'string', format: 'uuid' } as const;

// Compose schemas
const createOrderSchema = {
  body: {
    type: 'object',
    required: ['userId', 'items'],
    properties: {
      userId: UuidSchema,
      items: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['productId', 'quantity'],
          properties: {
            productId: UuidSchema,
            quantity: { type: 'number', minimum: 1 }
          }
        }
      }
    }
  }
} as const;
