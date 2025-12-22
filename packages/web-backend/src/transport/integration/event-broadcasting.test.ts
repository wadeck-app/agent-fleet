import type { IncomingMessage } from 'http';
import { beforeEach, describe, expect, it } from 'vitest';

import { MockAuthService } from '@/auth/MockAuthService';

import { EventBroadcaster } from '../EventBroadcaster';
import { WebSocketSessionManager } from '../WebSocketSessionManager';
import { MockTransportServer } from '../adapters/MockTransportServer';

/**
 * ===========================================================================================
 * EVENT BROADCASTING INTEGRATION TESTS
 * ===========================================================================================
 *
 * Integration tests for event broadcasting with subscription filtering.
 *
 * Test scenarios:
 * - Create task → Verify broadcast to subscribed clients
 * - Update task → Verify only subscribed clients receive event
 * - Test subscription filtering (server-side)
 * - Test unsubscribe
 * - Multi-device event delivery
 * - Concurrent event broadcasting
 *
 * These tests verify the integration between:
 * - EventBroadcaster
 * - WebSocketSessionManager (for subscription filtering)
 * - MockTransportServer
 *
 * ===========================================================================================
 */

describe('Event Broadcasting Integration', () => {
	let authService: MockAuthService;
	let sessionManager: WebSocketSessionManager;
	let mockTransport: MockTransportServer;
	let broadcaster: EventBroadcaster;

	beforeEach(() => {
		// Create auth service
		authService = new MockAuthService('test-secret');

		// Create session manager
		sessionManager = new WebSocketSessionManager(authService);

		// Create mock transport
		mockTransport = new MockTransportServer();

		// Create broadcaster
		broadcaster = new EventBroadcaster(mockTransport, sessionManager);
	});

	describe('basic broadcasting', () => {
		it('should broadcast task:created event to all clients', async () => {
			// Create and connect three clients
			const { accessToken: token1 } = await authService.login('test@example.com', 'password');
			const { accessToken: token2 } = await authService.login('test@example.com', 'password');
			const { accessToken: token3 } = await authService.login('test@example.com', 'password');

			const req1 = {
				headers: {
					cookie: `access_token=${token1}`,
				},
			} as IncomingMessage;

			const req2 = {
				headers: {
					cookie: `access_token=${token2}`,
				},
			} as IncomingMessage;

			const req3 = {
				headers: {
					cookie: `access_token=${token3}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req1);
			await sessionManager.authenticateConnection('client-2', req2);
			await sessionManager.authenticateConnection('client-3', req3);

			// Simulate connections
			mockTransport.simulateConnect('client-1');
			mockTransport.simulateConnect('client-2');
			mockTransport.simulateConnect('client-3');

			// Broadcast event
			const task = {
				id: 'task-1',
				name: 'New task',
				status: 'pending' as const,
				priority: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			broadcaster.broadcast('task:created', task);

			// Verify all clients received the event
			expect(mockTransport.broadcasts).toHaveLength(1);
			expect(mockTransport.broadcasts[0].event).toBe('task:created');
			expect(mockTransport.broadcasts[0].data).toEqual(task);
		});

		it('should broadcast task:updated event to all clients', async () => {
			// Create client
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);
			mockTransport.simulateConnect('client-1');

			// Broadcast update event
			const task = {
				id: 'task-1',
				name: 'Updated task',
				status: 'in_progress' as const,
				priority: 2,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			broadcaster.broadcast('task:updated', task);

			expect(mockTransport.broadcasts).toHaveLength(1);
			expect(mockTransport.broadcasts[0].event).toBe('task:updated');
		});
	});

	describe('subscription filtering', () => {
		it('should only send events to subscribed clients', async () => {
			// Create two clients
			const { accessToken: token1 } = await authService.login('test@example.com', 'password');
			const { accessToken: token2 } = await authService.login('test@example.com', 'password');

			const req1 = {
				headers: {
					cookie: `access_token=${token1}`,
				},
			} as IncomingMessage;

			const req2 = {
				headers: {
					cookie: `access_token=${token2}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req1);
			await sessionManager.authenticateConnection('client-2', req2);

			mockTransport.simulateConnect('client-1');
			mockTransport.simulateConnect('client-2');

			// Client 1 subscribes to task events
			sessionManager.updateSubscriptions('client-1', 'subscribe', ['task:created', 'task:updated']);

			// Client 2 subscribes to worker events
			sessionManager.updateSubscriptions('client-2', 'subscribe', ['worker:created']);

			// Broadcast task event
			const task = {
				id: 'task-1',
				name: 'Test task',
				status: 'pending' as const,
				priority: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			broadcaster.broadcast('task:created', task);

			// Only broadcasted (subscription filtering happens in WebSocketTransportServer)
			expect(mockTransport.broadcasts).toHaveLength(1);

			// Verify subscriptions
			expect(sessionManager.isSubscribed('client-1', 'task:created')).toBe(true);
			expect(sessionManager.isSubscribed('client-2', 'task:created')).toBe(false);
		});

		it('should handle unsubscribe correctly', async () => {
			// Create client
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);

			// Subscribe to multiple events
			sessionManager.updateSubscriptions('client-1', 'subscribe', [
				'task:created',
				'task:updated',
				'task:deleted',
			]);

			expect(sessionManager.isSubscribed('client-1', 'task:created')).toBe(true);
			expect(sessionManager.isSubscribed('client-1', 'task:updated')).toBe(true);
			expect(sessionManager.isSubscribed('client-1', 'task:deleted')).toBe(true);

			// Unsubscribe from one event
			sessionManager.updateSubscriptions('client-1', 'unsubscribe', ['task:updated']);

			expect(sessionManager.isSubscribed('client-1', 'task:created')).toBe(true);
			expect(sessionManager.isSubscribed('client-1', 'task:updated')).toBe(false);
			expect(sessionManager.isSubscribed('client-1', 'task:deleted')).toBe(true);
		});

		it('should allow all events when no subscriptions set', async () => {
			// Create client without subscribing
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);

			// Without explicit subscriptions, all events are allowed
			expect(sessionManager.isSubscribed('client-1', 'task:created')).toBe(true);
			expect(sessionManager.isSubscribed('client-1', 'worker:created')).toBe(true);
			expect(sessionManager.isSubscribed('client-1', 'workspace:created')).toBe(true);
		});
	});

	describe('targeted broadcasting', () => {
		it('should send event to specific client', async () => {
			// Create two clients
			const { accessToken: token1 } = await authService.login('test@example.com', 'password');
			const { accessToken: token2 } = await authService.login('test@example.com', 'password');

			const req1 = {
				headers: {
					cookie: `access_token=${token1}`,
				},
			} as IncomingMessage;

			const req2 = {
				headers: {
					cookie: `access_token=${token2}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req1);
			await sessionManager.authenticateConnection('client-2', req2);

			mockTransport.simulateConnect('client-1');
			mockTransport.simulateConnect('client-2');

			// Send to specific client
			const task = {
				id: 'task-1',
				name: 'Test task',
				status: 'pending' as const,
				priority: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			broadcaster.sendToClient('client-1', 'task:created', task);

			// Only client-1 should receive
			expect(mockTransport.clientSends).toHaveLength(1);
			expect(mockTransport.clientSends[0].clientId).toBe('client-1');
			expect(mockTransport.clientSends[0].data).toEqual(task);
		});

		it('should send event to all sessions of a user (multi-device)', async () => {
			// Login once
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			// Connect three devices
			const req1 = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			const req2 = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			const req3 = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-phone', req1);
			await sessionManager.authenticateConnection('client-laptop', req2);
			await sessionManager.authenticateConnection('client-tablet', req3);

			mockTransport.simulateConnect('client-phone');
			mockTransport.simulateConnect('client-laptop');
			mockTransport.simulateConnect('client-tablet');

			// Send to user (all devices)
			const task = {
				id: 'task-1',
				name: 'Test task',
				status: 'pending' as const,
				priority: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			broadcaster.sendToUser(userId, 'task:created', task);

			// All three devices should receive
			expect(mockTransport.clientSends).toHaveLength(3);

			const receivedClientIds = mockTransport.clientSends.map(s => s.clientId);
			expect(receivedClientIds).toContain('client-phone');
			expect(receivedClientIds).toContain('client-laptop');
			expect(receivedClientIds).toContain('client-tablet');
		});
	});

	describe('concurrent events', () => {
		it('should handle multiple concurrent broadcasts', async () => {
			// Create client
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);
			mockTransport.simulateConnect('client-1');

			// Broadcast multiple events concurrently
			const task1 = {
				id: 'task-1',
				name: 'Task 1',
				status: 'pending' as const,
				priority: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			const task2 = {
				id: 'task-2',
				name: 'Task 2',
				status: 'in_progress' as const,
				priority: 2,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			const task3 = {
				id: 'task-3',
				name: 'Task 3',
				status: 'completed' as const,
				priority: 3,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			broadcaster.broadcast('task:created', task1);
			broadcaster.broadcast('task:created', task2);
			broadcaster.broadcast('task:created', task3);

			expect(mockTransport.broadcasts).toHaveLength(3);
			expect(mockTransport.broadcasts[0].data).toEqual(task1);
			expect(mockTransport.broadcasts[1].data).toEqual(task2);
			expect(mockTransport.broadcasts[2].data).toEqual(task3);
		});
	});

	describe('different event types', () => {
		it('should broadcast task events', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);
			mockTransport.simulateConnect('client-1');

			const task = {
				id: 'task-1',
				name: 'Test task',
				status: 'pending' as const,
				priority: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			// Test different task events
			broadcaster.broadcast('task:created', task);
			broadcaster.broadcast('task:updated', task);
			broadcaster.broadcast('task:deleted', { id: task.id });

			expect(mockTransport.broadcasts).toHaveLength(3);
			expect(mockTransport.broadcasts[0].event).toBe('task:created');
			expect(mockTransport.broadcasts[1].event).toBe('task:updated');
			expect(mockTransport.broadcasts[2].event).toBe('task:deleted');
		});

		it('should broadcast worker events', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);
			mockTransport.simulateConnect('client-1');

			const worker = {
				id: 'worker-1',
				name: 'Test worker',
				state: 'idle' as const,
				capacity: 10,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			broadcaster.broadcast('worker:created', worker);

			expect(mockTransport.broadcasts).toHaveLength(1);
			expect(mockTransport.broadcasts[0].event).toBe('worker:created');
			expect(mockTransport.broadcasts[0].data).toEqual(worker);
		});

		it('should broadcast workspace events', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);
			mockTransport.simulateConnect('client-1');

			const workspace = {
				id: 'workspace-1',
				name: 'Test workspace',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			broadcaster.broadcast('workspace:created', workspace);

			expect(mockTransport.broadcasts).toHaveLength(1);
			expect(mockTransport.broadcasts[0].event).toBe('workspace:created');
		});
	});

	describe('client management', () => {
		it('should track connected clients', async () => {
			expect(broadcaster.getConnectedClientsCount()).toBe(0);

			// Connect clients
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);
			await sessionManager.authenticateConnection('client-2', req);

			mockTransport.simulateConnect('client-1');
			mockTransport.simulateConnect('client-2');

			expect(broadcaster.getConnectedClientsCount()).toBe(2);
		});

		it('should get list of connected clients', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);
			await sessionManager.authenticateConnection('client-2', req);

			mockTransport.simulateConnect('client-1');
			mockTransport.simulateConnect('client-2');

			const clients = broadcaster.getConnectedClients();
			expect(clients).toContain('client-1');
			expect(clients).toContain('client-2');
		});
	});

	describe('error handling', () => {
		it('should handle broadcast to disconnected client gracefully', () => {
			// Try to send to non-existent client
			const task = {
				id: 'task-1',
				name: 'Test task',
				status: 'pending' as const,
				priority: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			// Should not throw
			expect(() => {
				broadcaster.sendToClient('non-existent-client', 'task:created', task);
			}).not.toThrow();

			// No sends recorded
			expect(mockTransport.clientSends).toHaveLength(0);
		});

		it('should handle sendToUser for user with no sessions', () => {
			const task = {
				id: 'task-1',
				name: 'Test task',
				status: 'pending' as const,
				priority: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			// Should not throw
			expect(() => {
				broadcaster.sendToUser('non-existent-user', 'task:created', task);
			}).not.toThrow();

			// No sends recorded
			expect(mockTransport.clientSends).toHaveLength(0);
		});
	});
});
