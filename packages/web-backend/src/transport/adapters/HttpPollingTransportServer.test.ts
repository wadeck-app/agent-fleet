/**
 * HttpPollingTransportServer Tests
 *
 * Tests for HTTP short polling transport implementation.
 * Verifies immediate response behavior, message queuing, and session management.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { MockedObject } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MessageQueue } from '../MessageQueue';
import type { TransportSession, TransportSessionManager } from '../TransportSessionManager';
import { HttpPollingTransportServer } from './HttpPollingTransportServer';

describe('HttpPollingTransportServer', () => {
	let server: HttpPollingTransportServer;
	let mockSessionManager: MockedObject<TransportSessionManager>;
	let mockMessageQueue: MockedObject<MessageQueue>;
	let mockApp: Partial<FastifyInstance>;

	beforeEach(() => {
		// Mock TransportSessionManager
		mockSessionManager = {
			authenticateConnection: vi.fn(),
			isSubscribed: vi.fn().mockReturnValue(true),
			matchesFilters: vi.fn().mockReturnValue(true),
			removeSession: vi.fn(),
		} as any;

		// Mock MessageQueue
		mockMessageQueue = {
			dequeue: vi.fn(),
			enqueue: vi.fn(),
			peek: vi.fn(),
			clearQueue: vi.fn(),
		} as any;

		server = new HttpPollingTransportServer(mockSessionManager, mockMessageQueue);

		// Mock Fastify app
		mockApp = {
			get: vi.fn(),
		};
	});

	describe('initialize', () => {
		it('should register /api/transports/http-polling endpoint', async () => {
			await server.initialize(mockApp as FastifyInstance);

			expect(mockApp.get).toHaveBeenCalledWith('/api/transports/http-polling', expect.any(Function));
		});
	});

	describe('handlePollRequest', () => {
		it('should return queued events immediately', async () => {
			const mockSession: TransportSession = {
				connId: 'http-client-123',
				userId: 'user-456',
				accessToken: 'mock-token',
				subscribedEvents: new Set(['b2f:task:created']),
				eventFilters: new Map(),
				transportType: 'http',
				createdAt: Date.now(),
				lastActivity: Date.now(),
				tokenExpiresAt: Date.now() + 300000,
			};

			const queuedEvents = [
				{ id: 'evt-1', type: 'b2f:task:created', data: { taskId: '123' }, timestamp: Date.now() },
			];

			mockSessionManager.authenticateConnection.mockResolvedValue(mockSession);
			mockMessageQueue.dequeue.mockReturnValue(queuedEvents);

			const mockRequest = {
				query: {
					connId: 'http-client-123',
				},
				raw: {
					headers: {},
				},
			} as any;

			const mockReply = {
				header: vi.fn(),
				send: vi.fn(),
				code: vi.fn().mockReturnThis(),
			} as any;

			// Call handlePollRequest via the route handler
			await server.initialize(mockApp as FastifyInstance);
			const routeHandler = (mockApp.get as any).mock.calls[0][1];
			await routeHandler(mockRequest, mockReply);

			expect(mockSessionManager.authenticateConnection).toHaveBeenCalledWith(
				'http-client-123',
				mockRequest.raw,
				'http'
			);
			expect(mockReply.send).toHaveBeenCalledWith(
				expect.objectContaining({
					events: queuedEvents,
					authenticated: true,
					userId: 'user-456',
				})
			);
		});

		it('should return 400 if connId is missing', async () => {
			const mockRequest = {
				query: {},
				raw: {
					headers: {},
				},
			} as any;

			const mockReply = {
				send: vi.fn(),
				code: vi.fn().mockReturnThis(),
			} as any;

			// Call handlePollRequest via the route handler
			await server.initialize(mockApp as FastifyInstance);
			const routeHandler = (mockApp.get as any).mock.calls[0][1];
			await routeHandler(mockRequest, mockReply);

			expect(mockReply.code).toHaveBeenCalledWith(400);
			expect(mockReply.send).toHaveBeenCalledWith({ error: 'Missing connId parameter' });
		});
	});

	describe('broadcast', () => {
		it('should queue events for all subscribed clients', () => {
			// Add client to active sessions
			(server as any).activeSessions.set('http-client-123', Date.now());

			// Mock isSubscribed to return true for this event
			mockSessionManager.isSubscribed.mockReturnValue(true);
			mockSessionManager.matchesFilters.mockReturnValue(true);

			// Create proper task object
			const taskData = {
				id: 'task-123',
				description: 'Test task',
				status: 'backlog' as const,
				priority: 'medium' as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: null,
				assignedWorker: null,
				comments: [],
				metadata: {},
				history: [],
			};

			server.broadcast('b2f:task:created', taskData);

			expect(mockMessageQueue.enqueue).toHaveBeenCalledWith(
				'http-client-123',
				expect.objectContaining({ type: 'b2f:task:created' })
			);
		});

		it('should not queue events for unsubscribed clients', () => {
			(server as any).activeSessions.set('http-client-123', Date.now());

			// Mock isSubscribed to return false for this event
			mockSessionManager.isSubscribed.mockReturnValue(false);
			mockSessionManager.matchesFilters.mockReturnValue(true);

			// Create proper task object
			const taskData = {
				id: 'task-123',
				description: 'Test task',
				status: 'backlog' as const,
				priority: 'medium' as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: null,
				assignedWorker: null,
				comments: [],
				metadata: {},
				history: [],
			};

			server.broadcast('b2f:task:created', taskData);

			expect(mockMessageQueue.enqueue).not.toHaveBeenCalled();
		});
	});

	describe('sendToClient', () => {
		it('should queue event for specific client', () => {
			// Mock isSubscribed to return true for this event
			mockSessionManager.isSubscribed.mockReturnValue(true);
			mockSessionManager.matchesFilters.mockReturnValue(true);

			// Create proper task object
			const taskData = {
				id: 'task-123',
				description: 'Test task',
				status: 'backlog' as const,
				priority: 'medium' as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: null,
				assignedWorker: null,
				comments: [],
				metadata: {},
				history: [],
			};

			server.sendToClient('http-client-123', 'b2f:task:created', taskData);

			expect(mockMessageQueue.enqueue).toHaveBeenCalledWith(
				'http-client-123',
				expect.objectContaining({ type: 'b2f:task:created' })
			);
		});
	});

	describe('getConnectedClients', () => {
		it('should return list of active client IDs', () => {
			(server as any).activeSessions.set('client-1', Date.now());
			(server as any).activeSessions.set('client-2', Date.now());

			const clients = server.getConnectedClients();

			expect(clients).toEqual(['client-1', 'client-2']);
		});
	});

	describe('shutdown', () => {
		it('should clear all sessions and stop cleanup timer', () => {
			(server as any).activeSessions.set('client-1', Date.now());
			(server as any).cleanupTimer = setInterval(() => {}, 1000);

			server.shutdown();

			expect((server as any).activeSessions.size).toBe(0);
			expect((server as any).cleanupTimer).toBeNull();
		});
	});
});
