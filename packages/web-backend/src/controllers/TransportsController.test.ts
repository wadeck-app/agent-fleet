/**
 * TransportsController Tests
 *
 * Tests for unified subscription management API.
 * Verifies authentication, subscription management, and error handling.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { MockedObject } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageQueue } from '../transport/MessageQueue';
import type { TransportSession, TransportSessionManager } from '../transport/TransportSessionManager';
import { TransportsController } from './TransportsController';

describe('TransportsController', () => {
	let controller: TransportsController;
	let mockSessionManager: MockedObject<TransportSessionManager>;
	let mockMessageQueue: MockedObject<MessageQueue>;
	let mockRequest: Partial<FastifyRequest>;
	let mockReply: Partial<FastifyReply>;

	beforeEach(() => {
		// Mock TransportSessionManager
		mockSessionManager = {
			getSession: vi.fn(),
			updateSubscriptions: vi.fn(),
		} as any;

		// Mock MessageQueue
		mockMessageQueue = {
			peek: vi.fn(),
		} as any;

		controller = new TransportsController(mockSessionManager, mockMessageQueue);

		// Mock Fastify request/reply
		mockRequest = {
			headers: {
				cookie: '__client_id=test-client-123',
			},
			cookies: {
				__client_id: 'test-client-123',
			},
			body: {},
			params: {},
		};

		mockReply = {
			code: vi.fn().mockReturnThis(),
			send: vi.fn(),
		};
	});

	describe('batchSubscriptions', () => {
		it('should subscribe to multiple events', async () => {
			const mockSession: TransportSession = {
				connId: 'test-client-123',
				userId: 'user-456',
				accessToken: 'mock-token',
				subscribedEvents: new Set(['b2f:task:created', 'b2f:worker:updated']),
				eventFilters: new Map(),
				transportType: 'sse',
				createdAt: Date.now(),
				lastActivity: Date.now(),
				tokenExpiresAt: Date.now() + 300000,
			};

			mockSessionManager.getSession.mockReturnValue(mockSession);

			mockRequest.body = {
				action: 'subscribe',
				events: ['b2f:task:created', 'b2f:worker:updated'],
			};

			await controller.batchSubscriptions(mockRequest as FastifyRequest, mockReply as FastifyReply);

			expect(mockSessionManager.updateSubscriptions).toHaveBeenCalledWith(
				'test-client-123',
				'subscribe',
				['b2f:task:created', 'b2f:worker:updated'],
				undefined
			);

			expect(mockReply.send).toHaveBeenCalledWith({
				success: true,
				subscribed: ['b2f:task:created', 'b2f:worker:updated'],
				filters: {},
			});
		});

		it('should return 401 if no client ID in cookie', async () => {
			mockRequest.cookies = {};
			mockRequest.headers = {};

			await controller.batchSubscriptions(mockRequest as FastifyRequest, mockReply as FastifyReply);

			expect(mockReply.code).toHaveBeenCalledWith(401);
			expect(mockReply.send).toHaveBeenCalledWith({
				error: 'Not authenticated',
				message: 'Client ID not found in cookie',
			});
		});

		it('should return 401 if session not found', async () => {
			mockSessionManager.getSession.mockReturnValue(undefined);

			await controller.batchSubscriptions(mockRequest as FastifyRequest, mockReply as FastifyReply);

			expect(mockReply.code).toHaveBeenCalledWith(401);
			expect(mockReply.send).toHaveBeenCalledWith({
				error: 'Not authenticated',
				message: 'No active session found',
			});
		});
	});

	describe('subscribeToEvent', () => {
		it('should subscribe to single event with filters', async () => {
			const mockSession: TransportSession = {
				connId: 'test-client-123',
				userId: 'user-456',
				accessToken: 'mock-token',
				subscribedEvents: new Set(['b2f:task:created']),
				eventFilters: new Map([['b2f:task:created', { priority: 'high' }]]),
				transportType: 'sse',
				createdAt: Date.now(),
				lastActivity: Date.now(),
				tokenExpiresAt: Date.now() + 300000,
			};

			mockSessionManager.getSession.mockReturnValue(mockSession);

			mockRequest.params = { event: 'b2f:task:created' };
			mockRequest.body = { filters: { priority: 'high' } };

			await controller.subscribeToEvent(mockRequest as FastifyRequest, mockReply as FastifyReply);

			expect(mockSessionManager.updateSubscriptions).toHaveBeenCalledWith(
				'test-client-123',
				'subscribe',
				['b2f:task:created'],
				{ 'b2f:task:created': { priority: 'high' } }
			);

			expect(mockReply.send).toHaveBeenCalledWith({
				success: true,
				event: 'b2f:task:created',
				filters: { priority: 'high' },
			});
		});
	});

	describe('unsubscribeFromEvent', () => {
		it('should unsubscribe from single event', async () => {
			const mockSession: TransportSession = {
				connId: 'test-client-123',
				userId: 'user-456',
				accessToken: 'mock-token',
				subscribedEvents: new Set(),
				eventFilters: new Map(),
				transportType: 'sse',
				createdAt: Date.now(),
				lastActivity: Date.now(),
				tokenExpiresAt: Date.now() + 300000,
			};

			mockSessionManager.getSession.mockReturnValue(mockSession);

			mockRequest.params = { event: 'b2f:task:created' };

			await controller.unsubscribeFromEvent(mockRequest as FastifyRequest, mockReply as FastifyReply);

			expect(mockSessionManager.updateSubscriptions).toHaveBeenCalledWith('test-client-123', 'unsubscribe', [
				'b2f:task:created',
			]);

			expect(mockReply.send).toHaveBeenCalledWith({
				success: true,
				event: 'b2f:task:created',
				unsubscribed: true,
			});
		});
	});

	describe('getSubscriptions', () => {
		it('should return current subscriptions', async () => {
			const mockSession: TransportSession = {
				connId: 'test-client-123',
				userId: 'user-456',
				accessToken: 'mock-token',
				subscribedEvents: new Set(['b2f:task:created', 'b2f:worker:*']),
				eventFilters: new Map([['b2f:task:created', { priority: 'high' }]]),
				transportType: 'sse',
				createdAt: Date.now(),
				lastActivity: Date.now(),
				tokenExpiresAt: Date.now() + 300000,
			};

			mockSessionManager.getSession.mockReturnValue(mockSession);
			mockSessionManager.getTransportType = vi.fn().mockReturnValue('sse');

			await controller.getSubscriptions(mockRequest as FastifyRequest, mockReply as FastifyReply);

			expect(mockReply.send).toHaveBeenCalledWith({
				subscriptions: [
					{ event: 'b2f:task:created', filters: { priority: 'high' } },
					{ event: 'b2f:worker:*', filters: {} },
				],
				transportType: 'sse',
			});
		});
	});

	describe('getStatus', () => {
		it('should return transport status with queued events count', async () => {
			const mockSession: TransportSession = {
				connId: 'test-client-123',
				userId: 'user-456',
				accessToken: 'mock-token',
				subscribedEvents: new Set(['b2f:task:*']),
				eventFilters: new Map(),
				transportType: 'long-polling',
				createdAt: 1703000000000,
				lastActivity: 1703000100000,
				tokenExpiresAt: 1703000300000,
			};

			mockSessionManager.getSession.mockReturnValue(mockSession);
			mockSessionManager.getTransportType = vi.fn().mockReturnValue('long-polling');
			mockMessageQueue.peek.mockReturnValue([
				{ id: 'evt-1', type: 'b2f:task:created', data: {}, timestamp: Date.now() },
				{ id: 'evt-2', type: 'b2f:task:updated', data: {}, timestamp: Date.now() },
			]);

			await controller.getStatus(mockRequest as FastifyRequest, mockReply as FastifyReply);

			expect(mockReply.send).toHaveBeenCalledWith({
				clientId: 'test-client-123',
				userId: 'user-456',
				transportType: 'long-polling',
				connected: true,
				createdAt: 1703000000000,
				lastActivity: 1703000100000,
				subscriptions: ['b2f:task:*'],
				queuedEvents: 2,
			});
		});
	});
});
