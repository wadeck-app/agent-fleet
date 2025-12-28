import { beforeEach, describe, expect, it } from 'vitest';

import { MockAuthService } from '../auth/MockAuthService';
import { EventBroadcaster } from './EventBroadcaster';
import { TransportSessionManager } from './TransportSessionManager';
import { MockTransportServer } from './adapters/MockTransportServer';

/**
 * ===========================================================================================
 * EVENT BROADCASTER TESTS
 * ===========================================================================================
 *
 * Tests for EventBroadcaster - type-safe event broadcasting service.
 *
 * Test coverage:
 * - Broadcast events to all clients
 * - Send events to specific client
 * - Send events to all sessions of a user (multi-device)
 * - Get connected clients count
 *
 * ===========================================================================================
 */

describe('EventBroadcaster', () => {
	let mockServer: MockTransportServer;
	let sessionManager: TransportSessionManager;
	let broadcaster: EventBroadcaster;
	let authService: MockAuthService;

	beforeEach(() => {
		// Create mock auth service
		authService = new MockAuthService('test-secret');

		// Create session manager
		sessionManager = new TransportSessionManager(authService);

		// Create mock transport server
		mockServer = new MockTransportServer();

		// Create broadcaster
		broadcaster = new EventBroadcaster(mockServer, sessionManager);
	});

	describe('broadcast', () => {
		it('should broadcast event to all clients', () => {
			// Arrange
			const task = {
				id: 'task-1',
				description: 'Test task',
				status: 'todo' as const,
				assignedWorker: null,
				priority: 'high' as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			// Act
			broadcaster.broadcast('b2f:task:created', task);

			// Assert
			expect(mockServer.broadcasts).toHaveLength(1);
			expect(mockServer.broadcasts[0].event).toBe('b2f:task:created');
			expect(mockServer.broadcasts[0].data).toEqual(task);
		});

		it('should broadcast multiple events', () => {
			// Arrange
			const task1 = {
				id: 'task-1',
				description: 'Task 1',
				status: 'todo' as const,
				assignedWorker: null,
				priority: 'high' as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			const task2 = {
				id: 'task-2',
				description: 'Task 2',
				status: 'merged' as const,
				assignedWorker: null,
				priority: 'medium' as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			// Act
			broadcaster.broadcast('b2f:task:created', task1);
			broadcaster.broadcast('b2f:task:created', task2);

			// Assert
			expect(mockServer.broadcasts).toHaveLength(2);
			expect(mockServer.broadcasts[0].data).toEqual(task1);
			expect(mockServer.broadcasts[1].data).toEqual(task2);
		});
	});

	describe('sendToClient', () => {
		it('should send event to specific client', () => {
			// Arrange
			const clientId = 'client-1';
			mockServer.simulateConnect(clientId);

			const task = {
				id: 'task-1',
				description: 'Test task',
				status: 'todo' as const,
				assignedWorker: null,
				priority: 'high' as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			// Act
			broadcaster.sendToClient(clientId, 'b2f:task:created', task);

			// Assert
			expect(mockServer.clientSends).toHaveLength(1);
			expect(mockServer.clientSends[0].clientId).toBe(clientId);
			expect(mockServer.clientSends[0].event).toBe('b2f:task:created');
			expect(mockServer.clientSends[0].data).toEqual(task);
		});

		it('should warn when sending to disconnected client', () => {
			// Arrange
			const clientId = 'client-disconnected';
			const task = {
				id: 'task-1',
				description: 'Test task',
				status: 'todo' as const,
				assignedWorker: null,
				priority: 'high' as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			// Act
			broadcaster.sendToClient(clientId, 'b2f:task:created', task);

			// Assert - should not record the send
			expect(mockServer.clientSends).toHaveLength(0);
		});
	});

	describe('sendToUser', () => {
		it('should send event to all sessions of a user', async () => {
			// Arrange
			const userId = 'user-1';
			const { accessToken } = await authService.createAccessToken(userId);

			// Create two sessions for the same user (multi-device)
			await sessionManager.authenticateConnection('client-1', {
				headers: { cookie: `access_token=${accessToken}` },
			} as any);

			await sessionManager.authenticateConnection('client-2', {
				headers: { cookie: `access_token=${accessToken}` },
			} as any);

			// Simulate connections
			mockServer.simulateConnect('client-1');
			mockServer.simulateConnect('client-2');

			const task = {
				id: 'task-1',
				description: 'Test task',
				status: 'todo' as const,
				assignedWorker: null,
				priority: 'high' as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			// Act
			broadcaster.sendToUser(userId, 'b2f:task:created', task);

			// Assert
			expect(mockServer.clientSends).toHaveLength(2);
			expect(mockServer.clientSends[0].clientId).toBe('client-1');
			expect(mockServer.clientSends[1].clientId).toBe('client-2');
			expect(mockServer.clientSends[0].data).toEqual(task);
			expect(mockServer.clientSends[1].data).toEqual(task);
		});

		it('should handle user with no sessions', () => {
			// Arrange
			const userId = 'user-no-sessions';
			const task = {
				id: 'task-1',
				description: 'Test task',
				status: 'todo' as const,
				assignedWorker: null,
				priority: 'high' as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			// Act
			broadcaster.sendToUser(userId, 'b2f:task:created', task);

			// Assert - should not crash, just not send anything
			expect(mockServer.clientSends).toHaveLength(0);
		});
	});

	describe('getConnectedClientsCount', () => {
		it('should return 0 for no clients', () => {
			expect(broadcaster.getConnectedClientsCount()).toBe(0);
		});

		it('should return correct count for connected clients', () => {
			// Arrange
			mockServer.simulateConnect('client-1');
			mockServer.simulateConnect('client-2');
			mockServer.simulateConnect('client-3');

			// Assert
			expect(broadcaster.getConnectedClientsCount()).toBe(3);
		});
	});

	describe('getConnectedClients', () => {
		it('should return empty array for no clients', () => {
			expect(broadcaster.getConnectedClients()).toEqual([]);
		});

		it('should return all connected client IDs', () => {
			// Arrange
			mockServer.simulateConnect('client-1');
			mockServer.simulateConnect('client-2');

			// Assert
			const clients = broadcaster.getConnectedClients();
			expect(clients).toHaveLength(2);
			expect(clients).toContain('client-1');
			expect(clients).toContain('client-2');
		});
	});
});
