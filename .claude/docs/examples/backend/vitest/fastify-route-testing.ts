// @ts-nocheck - Example code, not compiled
// Fastify Route Testing Pattern
// Demonstrates testing routes with Fastify's inject() method
import { describe, expect, it } from 'vitest';

import { build } from './app';

// Factory function that returns Fastify instance

describe('POST /users', () => {
	it('should create user and return 201', async () => {
		const app = await build();

		const response = await app.inject({
			method: 'POST',
			url: '/users',
			payload: {
				email: 'test@example.com',
				name: 'Test User',
			},
		});

		expect(response.statusCode).toBe(201);
		expect(response.json()).toMatchObject({
			email: 'test@example.com',
			name: 'Test User',
		});

		await app.close();
	});

	it('should return 400 for invalid email', async () => {
		const app = await build();

		const response = await app.inject({
			method: 'POST',
			url: '/users',
			payload: {
				email: 'invalid-email',
				name: 'Test User',
			},
		});

		expect(response.statusCode).toBe(400);
		expect(response.json()).toHaveProperty('error');

		await app.close();
	});
});
