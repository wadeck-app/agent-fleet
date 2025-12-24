import { describe, expect, it } from 'vitest';

import type {
	SubscriptionMessage,
	TransportError,
	TransportEvent,
	TransportRequest,
	TransportResponse,
} from './TransportProtocol';

describe('TransportProtocol Types', () => {
	describe('TransportRequest', () => {
		it('should create a valid GET request', () => {
			const request: TransportRequest = {
				id: 'req-123',
				method: 'GET',
				path: '/api/tasks/',
				query: { status: 'todo' },
				timestamp: Date.now(),
			};

			expect(request.id).toBe('req-123');
			expect(request.method).toBe('GET');
			expect(request.path).toBe('/api/tasks/');
			expect(request.query).toEqual({ status: 'todo' });
		});

		it('should create a valid POST request with body', () => {
			const request: TransportRequest<{ description: string }> = {
				id: 'req-456',
				method: 'POST',
				path: '/api/tasks/',
				body: { description: 'New task' },
				headers: { 'Content-Type': 'application/json' },
				timestamp: Date.now(),
			};

			expect(request.method).toBe('POST');
			expect(request.body).toEqual({ description: 'New task' });
			expect(request.headers).toEqual({ 'Content-Type': 'application/json' });
		});

		it('should create a request with path parameters', () => {
			const request: TransportRequest = {
				id: 'req-789',
				method: 'GET',
				path: '/api/tasks/:id',
				params: { id: '123' },
				timestamp: Date.now(),
			};

			expect(request.params).toEqual({ id: '123' });
		});
	});

	describe('TransportResponse', () => {
		it('should create a successful response', () => {
			const response: TransportResponse<{ id: string; name: string }> = {
				id: 'req-123',
				status: 200,
				body: { id: '1', name: 'Test' },
				timestamp: Date.now(),
			};

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ id: '1', name: 'Test' });
			expect(response.error).toBeUndefined();
		});

		it('should create an error response', () => {
			const error: TransportError = {
				code: 'NOT_FOUND',
				message: 'Resource not found',
				details: { resourceId: '123' },
			};

			const response: TransportResponse = {
				id: 'req-123',
				status: 404,
				error,
				timestamp: Date.now(),
			};

			expect(response.status).toBe(404);
			expect(response.error).toBeDefined();
			expect(response.error?.code).toBe('NOT_FOUND');
			expect(response.error?.message).toBe('Resource not found');
			expect(response.error?.details).toEqual({ resourceId: '123' });
		});

		it('should include response headers', () => {
			const response: TransportResponse = {
				id: 'req-123',
				status: 200,
				headers: { 'Content-Type': 'application/json' },
				timestamp: Date.now(),
			};

			expect(response.headers).toEqual({ 'Content-Type': 'application/json' });
		});
	});

	describe('TransportEvent', () => {
		it('should create a task:created event', () => {
			const event: TransportEvent<{ id: string; description: string }> = {
				id: 'evt-123',
				type: 'task:created',
				data: { id: '1', description: 'New task' },
				timestamp: Date.now(),
			};

			expect(event.id).toBe('evt-123');
			expect(event.type).toBe('task:created');
			expect(event.data).toEqual({ id: '1', description: 'New task' });
		});

		it('should create a worker:heartbeat event', () => {
			const event: TransportEvent<{ workerId: string; status: string }> = {
				id: 'evt-456',
				type: 'worker:heartbeat',
				data: { workerId: 'worker-1', status: 'idle' },
				timestamp: Date.now(),
			};

			expect(event.type).toBe('worker:heartbeat');
			expect(event.data).toEqual({ workerId: 'worker-1', status: 'idle' });
		});
	});

	describe('SubscriptionMessage', () => {
		it('should create a subscribe message', () => {
			const message: SubscriptionMessage = {
				type: 'subscription',
				action: 'subscribe',
				events: ['task:created', 'task:updated', 'task:deleted'],
			};

			expect(message.type).toBe('subscription');
			expect(message.action).toBe('subscribe');
			expect(message.events).toHaveLength(3);
			expect(message.events).toContain('task:created');
		});

		it('should create an unsubscribe message', () => {
			const message: SubscriptionMessage = {
				type: 'subscription',
				action: 'unsubscribe',
				events: ['worker:heartbeat'],
			};

			expect(message.action).toBe('unsubscribe');
			expect(message.events).toEqual(['worker:heartbeat']);
		});
	});

	describe('TransportError', () => {
		it('should create a validation error', () => {
			const error: TransportError = {
				code: 'VALIDATION_ERROR',
				message: 'Invalid input data',
				details: {
					field: 'email',
					reason: 'Invalid email format',
				},
			};

			expect(error.code).toBe('VALIDATION_ERROR');
			expect(error.message).toBe('Invalid input data');
			expect(error.details?.field).toBe('email');
		});

		it('should create an error without details', () => {
			const error: TransportError = {
				code: 'INTERNAL_ERROR',
				message: 'Something went wrong',
			};

			expect(error.code).toBe('INTERNAL_ERROR');
			expect(error.details).toBeUndefined();
		});
	});

	describe('Type Composition', () => {
		it('should allow request-response pairing', () => {
			// Simulate a request-response cycle
			const request: TransportRequest = {
				id: 'req-123',
				method: 'GET',
				path: '/api/tasks/',
				timestamp: Date.now(),
			};

			const response: TransportResponse = {
				id: request.id, // Same ID
				status: 200,
				body: { tasks: [] },
				timestamp: Date.now(),
			};

			expect(response.id).toBe(request.id);
		});

		it('should allow event broadcasting after request', () => {
			// Simulate creating a resource via request
			const createRequest: TransportRequest<{ description: string }> = {
				id: 'req-create',
				method: 'POST',
				path: '/api/tasks/',
				body: { description: 'New task' },
				timestamp: Date.now(),
			};

			const createResponse: TransportResponse<{ id: string }> = {
				id: createRequest.id,
				status: 201,
				body: { id: 'task-1' },
				timestamp: Date.now(),
			};

			// Then broadcast an event
			const createdEvent: TransportEvent<{ id: string; description: string }> = {
				id: 'evt-created',
				type: 'task:created',
				data: { id: 'task-1', description: 'New task' },
				timestamp: Date.now(),
			};

			expect(createResponse.body?.id).toBe(createdEvent.data.id);
		});
	});

	describe('Type Safety', () => {
		it('should enforce correct HTTP methods', () => {
			const request: TransportRequest = {
				id: 'req-1',
				method: 'GET', // Only valid HttpMethod values allowed
				path: '/api/tasks/',
				timestamp: Date.now(),
			};

			// TypeScript will catch invalid methods at compile time
			const _invalidRequest: TransportRequest = {
				id: 'req-2',
				// @ts-expect-error - Invalid method should cause type error
				method: 'INVALID',
				path: '/api/tasks/',
				timestamp: Date.now(),
			};

			expect(request.method).toBe('GET');
		});

		it('should enforce timestamp as number', () => {
			const now = Date.now();
			const request: TransportRequest = {
				id: 'req-1',
				method: 'GET',
				path: '/api/tasks/',
				timestamp: now,
			};

			expect(typeof request.timestamp).toBe('number');
			expect(request.timestamp).toBeGreaterThan(0);
		});
	});
});
