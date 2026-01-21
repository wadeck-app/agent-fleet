/**
 * HTTP Polling Transport Client Tests
 *
 * Tests for HttpPollingTransportClient implementation
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpPollingTransportClient } from './HttpPollingTransportClient';
import * as connectionId from '../connection-id';

describe('HttpPollingTransportClient', () => {
	let client: HttpPollingTransportClient;
	const baseUrl = 'http://localhost:3000';

	beforeEach(() => {
		// Clear all timers and mocks before each test
		vi.clearAllTimers();
		vi.clearAllMocks();

		// Mock window.name for connId
		const mockConnId = 'test-conn-id-123';
		window.name = mockConnId;

		client = new HttpPollingTransportClient({
			baseUrl,
			wsUrl: '',
			pollInterval: 1000, // Use 1 second for faster tests
			reconnect: false,
			reconnectMaxAttempts: 0,
			reconnectDelay: 0,
			connectionTimeout: 5000,
			requestTimeout: 5000,
		});
	});

	afterEach(async () => {
		// Cleanup: disconnect client
		if (client) {
			await client.disconnect();
		}
		vi.restoreAllMocks();
	});

	describe('connect()', () => {
		it('should transition to connecting state', async () => {
			// Mock fetch to simulate successful authentication
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					events: [],
					authenticated: true,
					userId: 'test-user',
					tokenExpiresAt: Date.now() + 3600000,
				}),
			}) as any;

			const stateChanges: string[] = [];
			client.onConnectionStateChange(state => stateChanges.push(state));

			await client.connect();

			expect(stateChanges).toContain('connecting');
			expect(stateChanges).toContain('connected');
		});

		it('should poll the http-polling endpoint with connId', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					events: [],
					authenticated: true,
					userId: 'test-user',
				}),
			});
			global.fetch = fetchMock as any;

			await client.connect();

			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining('/api/transports/http-polling?connId=test-conn-id-123'),
				expect.objectContaining({
					method: 'GET',
					credentials: 'include',
				})
			);
		});

		it('should throw error if connId is missing from sessionStorage', async () => {
			// Mock getConnId to return empty string (simulating missing connId)
			vi.spyOn(connectionId, 'getConnId').mockReturnValue('');

			await expect(client.connect()).rejects.toThrow('No connId found in sessionStorage');
		});

		it('should process events from poll response', async () => {
			const testEvent = {
				id: 'event-1',
				type: 'b2f:task:created',
				data: { id: 'task-1', title: 'Test Task' },
				timestamp: Date.now(),
			};

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					events: [testEvent],
					authenticated: true,
					userId: 'test-user',
				}),
			}) as any;

			const eventHandler = vi.fn();
			client.subscribe('b2f:task:created', eventHandler);

			await client.connect();

			// Wait for event to be processed
			await new Promise(resolve => setTimeout(resolve, 100));

			expect(eventHandler).toHaveBeenCalledWith(testEvent.data);
		});
	});

	describe('disconnect()', () => {
		it('should stop polling', async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					events: [],
					authenticated: true,
					userId: 'test-user',
				}),
			}) as any;

			await client.connect();
			const fetchCallCount = (global.fetch as any).mock.calls.length;

			await client.disconnect();

			// Wait to ensure no more polls happen
			await new Promise(resolve => setTimeout(resolve, 1500));

			// Should not have called fetch again after disconnect
			expect((global.fetch as any).mock.calls.length).toBe(fetchCallCount);
		});

		it('should transition to disconnected state', async () => {
			const stateChanges: string[] = [];
			client.onConnectionStateChange(state => stateChanges.push(state));

			// Mock fetch for connection
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					events: [],
					authenticated: true,
					userId: 'test-user',
					tokenExpiresAt: Date.now() + 3600000,
				}),
			});

			// Connect first
			await client.connect();

			// Then disconnect
			await client.disconnect();

			expect(stateChanges).toContain('disconnected');
		});
	});

	describe('isConnected()', () => {
		it('should return false when disconnected', () => {
			expect(client.isConnected()).toBe(false);
		});

		it('should return true when connected', async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					events: [],
					authenticated: true,
					userId: 'test-user',
				}),
			}) as any;

			await client.connect();

			expect(client.isConnected()).toBe(true);
		});
	});

	describe('getTransportType()', () => {
		it('should return "http"', () => {
			expect(client.getTransportType()).toBe('http');
		});
	});

	describe('request()', () => {
		it('should throw error (not supported)', async () => {
			await expect(client.request('GET', '/api/tasks/')).rejects.toThrow('HTTP Polling is unidirectional');
		});
	});

	describe('subscribe()', () => {
		it('should call subscribeToEvent on first subscription', async () => {
			// Mock fetch for connection
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					events: [],
					authenticated: true,
					userId: 'test-user',
					tokenExpiresAt: Date.now() + 3600000,
				}),
			});

			// Connect first so subscriptions aren't queued
			await client.connect();

			const subscribeMock = vi.fn().mockResolvedValue(undefined);
			client.subscribeToEvent = subscribeMock;

			const handler = vi.fn();
			client.subscribe('b2f:task:created', handler);

			// Wait for async subscription call
			await new Promise(resolve => setTimeout(resolve, 100));

			expect(subscribeMock).toHaveBeenCalledWith('b2f:task:created', undefined);
		});

		it('should not call subscribeToEvent on subsequent subscriptions', async () => {
			const subscribeMock = vi.fn().mockResolvedValue(undefined);
			client.subscribeToEvent = subscribeMock;

			const handler1 = vi.fn();
			const handler2 = vi.fn();

			client.subscribe('b2f:task:created', handler1);
			await new Promise(resolve => setTimeout(resolve, 100));

			subscribeMock.mockClear();

			client.subscribe('b2f:task:created', handler2);
			await new Promise(resolve => setTimeout(resolve, 100));

			expect(subscribeMock).not.toHaveBeenCalled();
		});
	});

	describe('subscribeBatch()', () => {
		it('should call unified subscription endpoint with X-Conn-Id header', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ success: true }),
			});
			global.fetch = fetchMock as any;

			await client.subscribeBatch(['b2f:task:created', 'b2f:task:updated']);

			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining('/api/transports/subscriptions'),
				expect.objectContaining({
					method: 'POST',
					credentials: 'include',
					headers: expect.objectContaining({
						'X-Conn-Id': 'test-conn-id-123',
					}),
					body: expect.stringContaining('subscribe'),
				})
			);
		});
	});

	describe('subscribeToEvent()', () => {
		it('should call unified subscription endpoint for single event with X-Conn-Id header', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ success: true }),
			});
			global.fetch = fetchMock as any;

			await client.subscribeToEvent('b2f:task:created');

			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining('/api/transports/subscriptions/b2f%3Atask%3Acreated'),
				expect.objectContaining({
					method: 'POST',
					credentials: 'include',
					headers: expect.objectContaining({
						'X-Conn-Id': 'test-conn-id-123',
					}),
				})
			);
		});
	});

	describe('unsubscribeFromEvent()', () => {
		it('should call unified unsubscription endpoint with X-Conn-Id header', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ success: true }),
			});
			global.fetch = fetchMock as any;

			await client.unsubscribeFromEvent('b2f:task:created');

			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining('/api/transports/subscriptions/b2f%3Atask%3Acreated'),
				expect.objectContaining({
					method: 'DELETE',
					credentials: 'include',
					headers: expect.objectContaining({
						'X-Conn-Id': 'test-conn-id-123',
					}),
				})
			);
		});
	});

	describe('getSubscriptions()', () => {
		it('should fetch current subscriptions with X-Conn-Id header', async () => {
			const mockSubscriptions = [
				{ event: 'b2f:task:created', filters: {} },
				{ event: 'b2f:task:updated', filters: {} },
			];

			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ subscriptions: mockSubscriptions }),
			});
			global.fetch = fetchMock as any;

			const subscriptions = await client.getSubscriptions();

			expect(subscriptions).toEqual(mockSubscriptions);
			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining('/api/transports/subscriptions'),
				expect.objectContaining({
					method: 'GET',
					credentials: 'include',
					headers: expect.objectContaining({
						'X-Conn-Id': 'test-conn-id-123',
					}),
				})
			);
		});
	});

	describe('getTransportStatus()', () => {
		it('should fetch transport status with X-Conn-Id header', async () => {
			const mockStatus = {
				clientId: 'client-123',
				userId: 'user-456',
				transportType: 'http' as const,
				connected: true,
				authenticatedAt: Date.now(),
				lastActivity: Date.now(),
				subscriptions: ['b2f:task:created'],
				queuedEvents: 0,
			};

			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockStatus,
			});
			global.fetch = fetchMock as any;

			const status = await client.getTransportStatus();

			expect(status).toEqual(mockStatus);
			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining('/api/transports/status'),
				expect.objectContaining({
					method: 'GET',
					credentials: 'include',
					headers: expect.objectContaining({
						'X-Conn-Id': 'test-conn-id-123',
					}),
				})
			);
		});
	});
});
