/**
 * WebSocketTransportClient Component Subscriptions Tests
 *
 * Tests for the component-level subscription state management:
 * - setComponentSubscriptionState
 * - removeComponentSubscriptions
 * - syncSubscriptionState (via resubscribeAll)
 * - mergeAllComponentStates
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WebSocketTransportClient } from './WebSocketTransportClient';

/**
 * Mock WebSocket for testing
 */
class MockWebSocket {
	static OPEN = 1;
	static CONNECTING = 0;
	static CLOSING = 2;
	static CLOSED = 3;

	static instances: MockWebSocket[] = [];

	readyState = MockWebSocket.CONNECTING;
	onopen: (() => void) | null = null;
	onmessage: ((event: any) => void) | null = null;
	onerror: ((event: any) => void) | null = null;
	onclose: (() => void) | null = null;

	sentMessages: string[] = [];

	constructor(public url: string) {
		MockWebSocket.instances.push(this);

		queueMicrotask(() => {
			if (this.readyState === MockWebSocket.CONNECTING) {
				this.readyState = MockWebSocket.OPEN;
				this.onopen?.();
			}
		});
	}

	send(data: string) {
		this.sentMessages.push(data);
	}

	close() {
		this.readyState = MockWebSocket.CLOSED;
		queueMicrotask(() => this.onclose?.());
	}

	simulateMessage(data: any) {
		this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
	}

	async waitForOpen(): Promise<void> {
		if (this.readyState === MockWebSocket.OPEN) {
			return;
		}
		await new Promise<void>(resolve => queueMicrotask(() => resolve()));
	}

	static getLastInstance(): MockWebSocket | undefined {
		return MockWebSocket.instances[MockWebSocket.instances.length - 1];
	}

	static resetInstances() {
		MockWebSocket.instances = [];
	}
}

describe('WebSocketTransportClient - Component Subscriptions', () => {
	let client: WebSocketTransportClient;

	beforeEach(() => {
		MockWebSocket.resetInstances();
		(global as any).WebSocket = MockWebSocket;

		client = new WebSocketTransportClient({
			baseUrl: 'http://localhost:3000',
			wsUrl: 'ws://localhost:3000',
		});
	});

	afterEach(() => {
		MockWebSocket.resetInstances();
		vi.restoreAllMocks();
	});

	/**
	 * Helper to connect and authenticate
	 */
	async function connectClient(): Promise<MockWebSocket> {
		const connectPromise = client.connect();
		await vi.waitFor(() => MockWebSocket.getLastInstance() !== undefined);
		const mockWs = MockWebSocket.getLastInstance()!;
		await mockWs.waitForOpen();

		mockWs.simulateMessage({
			type: 'connected',
			userId: 'user123',
			tokenExpiresAt: Date.now() + 300000,
		});

		await connectPromise;
		return mockWs;
	}

	describe('setComponentSubscriptionState', () => {
		it('should send subscription_state message when connected', async () => {
			const mockWs = await connectClient();

			// Clear connection messages
			mockWs.sentMessages = [];

			// Set subscription state for a component
			client.setComponentSubscriptionState('TasksPage', [
				{ event: 'b2f:task:created' },
				{ event: 'b2f:task:updated', filters: { taskId: '123' } },
			]);

			// Verify subscription_state message sent
			expect(mockWs.sentMessages).toHaveLength(1);
			const message = JSON.parse(mockWs.sentMessages[0]);

			expect(message).toEqual({
				type: 'subscription_state',
				subscriptions: [
					{ event: 'b2f:task:created' },
					{ event: 'b2f:task:updated', filters: { taskId: '123' } },
				],
			});
		});

		it('should not send message when not connected', () => {
			// Client not connected
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			client.setComponentSubscriptionState('TasksPage', [{ event: 'b2f:task:created' }]);

			// Should log queuing message
			expect(consoleSpy).toHaveBeenCalledWith('[WS] Queuing subscription state sync (not connected yet)');

			consoleSpy.mockRestore();
		});

		it('should merge subscriptions from multiple components', async () => {
			const mockWs = await connectClient();
			mockWs.sentMessages = [];

			// Component 1 subscribes
			client.setComponentSubscriptionState('TasksPage', [
				{ event: 'b2f:task:created' },
				{ event: 'b2f:task:updated' },
			]);

			// Component 2 subscribes
			client.setComponentSubscriptionState('WorkersWidget', [
				{ event: 'b2f:worker:heartbeat' },
				{ event: 'b2f:task:updated' }, // Duplicate
			]);

			// Should send 2 messages (one per component state change)
			expect(mockWs.sentMessages).toHaveLength(2);

			// Last message should contain merged state
			const lastMessage = JSON.parse(mockWs.sentMessages[1]);
			expect(lastMessage.type).toBe('subscription_state');
			expect(lastMessage.subscriptions).toHaveLength(3); // Deduplicated

			// Verify deduplication
			const events = lastMessage.subscriptions.map((s: any) => s.event);
			expect(events).toContain('b2f:task:created');
			expect(events).toContain('b2f:task:updated');
			expect(events).toContain('b2f:worker:heartbeat');

			// Count 'b2f:task:updated' should be 1 (deduplicated)
			const updateCount = events.filter((e: string) => e === 'b2f:task:updated').length;
			expect(updateCount).toBe(1);
		});

		it('should deduplicate by event + filters combination', async () => {
			const mockWs = await connectClient();
			mockWs.sentMessages = [];

			// Component 1
			client.setComponentSubscriptionState('Component1', [
				{ event: 'b2f:task:updated', filters: { taskId: '123' } },
			]);

			// Component 2 with different filters
			client.setComponentSubscriptionState('Component2', [
				{ event: 'b2f:task:updated', filters: { taskId: '456' } },
			]);

			// Last message should contain both (different filters)
			const lastMessage = JSON.parse(mockWs.sentMessages[1]);
			expect(lastMessage.subscriptions).toHaveLength(2);
		});

		it('should override duplicate event+filters combination', async () => {
			const mockWs = await connectClient();
			mockWs.sentMessages = [];

			// Component 1
			client.setComponentSubscriptionState('Component1', [
				{ event: 'b2f:task:updated', filters: { taskId: '123' } },
			]);

			// Component 2 with same event+filters
			client.setComponentSubscriptionState('Component2', [
				{ event: 'b2f:task:updated', filters: { taskId: '123' } },
			]);

			// Last message should contain only 1 (deduplicated)
			const lastMessage = JSON.parse(mockWs.sentMessages[1]);
			expect(lastMessage.subscriptions).toHaveLength(1);
			expect(lastMessage.subscriptions[0]).toEqual({
				event: 'b2f:task:updated',
				filters: { taskId: '123' },
			});
		});
	});

	describe('removeComponentSubscriptions', () => {
		it('should recalculate state without removed component', async () => {
			const mockWs = await connectClient();
			mockWs.sentMessages = [];

			// Add two components
			client.setComponentSubscriptionState('Component1', [{ event: 'b2f:task:created' }]);
			client.setComponentSubscriptionState('Component2', [{ event: 'b2f:worker:heartbeat' }]);

			mockWs.sentMessages = [];

			// Remove Component1
			client.removeComponentSubscriptions('Component1');

			// Should send updated state without Component1's subscriptions
			expect(mockWs.sentMessages).toHaveLength(1);
			const message = JSON.parse(mockWs.sentMessages[0]);
			expect(message.subscriptions).toHaveLength(1);
			expect(message.subscriptions[0].event).toBe('b2f:worker:heartbeat');
		});

		it('should send empty state when all components removed', async () => {
			const mockWs = await connectClient();
			mockWs.sentMessages = [];

			// Add component
			client.setComponentSubscriptionState('Component1', [{ event: 'b2f:task:created' }]);

			mockWs.sentMessages = [];

			// Remove component
			client.removeComponentSubscriptions('Component1');

			// Should send empty subscription state
			expect(mockWs.sentMessages).toHaveLength(1);
			const message = JSON.parse(mockWs.sentMessages[0]);
			expect(message.subscriptions).toHaveLength(0);
		});

		it('should not send message if component does not exist', async () => {
			const mockWs = await connectClient();
			mockWs.sentMessages = [];

			// Try to remove non-existent component
			client.removeComponentSubscriptions('NonExistent');

			// Should not send any message
			expect(mockWs.sentMessages).toHaveLength(0);
		});
	});

	describe('resubscribeAll', () => {
		it('should use subscription_state on reconnection when components exist', async () => {
			// Connect and set component subscriptions
			let mockWs = await connectClient();
			mockWs.sentMessages = [];

			client.setComponentSubscriptionState('TasksPage', [
				{ event: 'b2f:task:created' },
				{ event: 'b2f:task:updated' },
			]);

			// Disconnect
			await client.disconnect();

			// Reconnect
			mockWs = await connectClient();

			// Find subscription_state message
			const stateMessage = mockWs.sentMessages.find(msg => {
				const parsed = JSON.parse(msg);
				return parsed.type === 'subscription_state';
			});

			expect(stateMessage).toBeDefined();
			const parsed = JSON.parse(stateMessage!);
			expect(parsed.subscriptions).toHaveLength(2);
		});

		it('should fall back to individual subscriptions when no components', async () => {
			// Connect
			let mockWs = await connectClient();

			// Subscribe using legacy API (no component subscriptions)
			client.subscribe('b2f:task:created' as any, () => {});

			// Disconnect
			await client.disconnect();

			// Reconnect
			mockWs = await connectClient();

			// Should use legacy subscription messages (not subscription_state)
			const subscriptionMessage = mockWs.sentMessages.find(msg => {
				const parsed = JSON.parse(msg);
				return parsed.type === 'subscription';
			});

			expect(subscriptionMessage).toBeDefined();
			const parsed = JSON.parse(subscriptionMessage!);
			expect(parsed.action).toBe('subscribe');
			expect(parsed.events).toContain('b2f:task:created');
		});
	});

	describe('backward compatibility', () => {
		it('should support both legacy subscribe() and component subscriptions', async () => {
			const mockWs = await connectClient();
			mockWs.sentMessages = [];

			// Use both APIs
			client.subscribe('b2f:task:created' as any, () => {});
			client.setComponentSubscriptionState('TasksPage', [{ event: 'b2f:worker:heartbeat' }]);

			// Should send both subscription messages
			const subscriptionMsg = mockWs.sentMessages.find(msg => {
				const parsed = JSON.parse(msg);
				return parsed.type === 'subscription';
			});

			const stateMsg = mockWs.sentMessages.find(msg => {
				const parsed = JSON.parse(msg);
				return parsed.type === 'subscription_state';
			});

			expect(subscriptionMsg).toBeDefined();
			expect(stateMsg).toBeDefined();
		});
	});
});
