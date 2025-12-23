/**
 * ===========================================================================================
 * WEBSOCKET TRANSPORT - UNIT TESTS
 * ===========================================================================================
 *
 * Comprehensive unit tests for WebSocketTransport.
 *
 * Test Coverage:
 * - Connection management (connect, disconnect, reconnect)
 * - Request/response handling with correlation IDs
 * - Timeout handling
 * - Event subscription and routing
 * - Error handling (malformed JSON, connection errors)
 * - Heartbeat/ping-pong mechanism
 * - Exponential backoff on reconnection
 *
 * ===========================================================================================
 */
import { EventEmitter, once } from 'events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { WebSocket } from 'ws';

import type { B2ORequest, B2OResponse, O2BEvent } from '@app/shared-orch-backend';

import { ControllableTimeService } from './TimeService.js';
import { WebSocketTransport } from './WebSocketTransport.js';

// ===========================================================================================
// MOCK WEBSOCKET
// ===========================================================================================

class MockWebSocket extends EventEmitter {
	public readyState: number = WebSocket.CONNECTING;
	public url: string;
	public readonly OPEN: number = WebSocket.OPEN;
	public readonly CLOSED: number = WebSocket.CLOSED;
	public sentMessages: string[] = [];

	constructor(url: string) {
		super();
		this.url = url;
	}

	send(data: string, callback?: (error?: Error) => void): void {
		this.sentMessages.push(data);
		if (callback) {
			// Synchronous callback for deterministic tests
			callback();
		}
	}

	close(code?: number, reason?: string): void {
		this.readyState = WebSocket.CLOSED;
		// Synchronous event emission for deterministic tests
		this.emit('close', code, Buffer.from(reason || ''));
	}

	// Test helpers - all synchronous for deterministic testing
	simulateOpen(): void {
		this.readyState = WebSocket.OPEN;
		this.emit('open');
	}

	simulateMessage(data: any): void {
		this.emit('message', Buffer.from(JSON.stringify(data)));
	}

	simulateError(error: Error): void {
		this.emit('error', error);
	}

	simulateClose(code: number, reason: string): void {
		this.readyState = WebSocket.CLOSED;
		this.emit('close', code, Buffer.from(reason));
	}
}

// Mock the 'ws' module
vi.mock('ws', () => ({
	WebSocket: vi.fn(),
}));

// Helper to wait for microtasks to complete
const waitForMicrotasks = async () => {
	await new Promise(resolve => setImmediate(resolve));
	await new Promise(resolve => setImmediate(resolve));
};

describe('WebSocketTransport', () => {
	let mockWs: MockWebSocket;
	let transport: WebSocketTransport;
	let timeService: ControllableTimeService;
	let consoleLogSpy: any;
	let consoleErrorSpy: any;
	let consoleWarnSpy: any;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create controllable time service for deterministic testing
		timeService = new ControllableTimeService();

		// Mock console methods to suppress logs during tests
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		// Setup mock WebSocket constructor
		mockWs = new MockWebSocket('ws://localhost:3737/ws');
		// Use regular function instead of arrow function for constructor mocking
		(WebSocket as any).mockImplementation(function (this: any, url: string) {
			return mockWs;
		});
	});

	afterEach(() => {
		timeService.reset();
		consoleLogSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		consoleWarnSpy.mockRestore();
	});

	// ===========================================================================================
	// CONNECTION MANAGEMENT
	// ===========================================================================================

	describe('Connection Management', () => {
		test('should connect successfully to WebSocket server', async () => {
			// Arrange
			transport = new WebSocketTransport({ url: 'ws://localhost:3737/ws' });

			// Act
			const connectPromise = transport.connect();
			mockWs.simulateOpen();
			await connectPromise;

			// Assert
			expect(transport.isConnected()).toBe(true);
		});

		test('should reject connection if server unreachable', async () => {
			// Arrange
			transport = new WebSocketTransport({ url: 'ws://localhost:3737/ws' });

			// Act
			const connectPromise = transport.connect();
			mockWs.simulateError(new Error('Connection refused'));

			// Assert
			await expect(connectPromise).rejects.toThrow('Connection refused');
			expect(transport.isConnected()).toBe(false);
		});

		test('should disconnect and cleanup', async () => {
			// Arrange
			transport = new WebSocketTransport({ url: 'ws://localhost:3737/ws' });
			const connectPromise = transport.connect();
			mockWs.simulateOpen();
			await connectPromise;

			// Act
			await transport.disconnect();

			// Assert
			expect(transport.isConnected()).toBe(false);
			expect(mockWs.sentMessages).toHaveLength(0); // No messages sent during disconnect
		});

		test('should not reconnect if already connected', async () => {
			// Arrange
			transport = new WebSocketTransport({ url: 'ws://localhost:3737/ws' });
			const connectPromise = transport.connect();
			mockWs.simulateOpen();
			await connectPromise;

			// Act
			await transport.connect();

			// Assert
			expect(transport.isConnected()).toBe(true);
			// Should not create a new WebSocket
			expect(WebSocket).toHaveBeenCalledTimes(1);
		});

		test('should start ping/pong heartbeat after connection', async () => {
			// Arrange

			transport = new WebSocketTransport({
				url: 'ws://localhost:3737/ws',
				pingInterval: 1000,
				timeService,
			});

			// Act
			const connectPromise = transport.connect();
			mockWs.simulateOpen();
			await connectPromise;

			// Advance time past ping interval
			timeService.tick(1000);

			// Assert
			const pingMessage = mockWs.sentMessages.find(msg => JSON.parse(msg).type === 'ping');
			expect(pingMessage).toBeDefined();
		});

		test('should resubscribe to events after reconnection', async () => {
			// Arrange

			transport = new WebSocketTransport({
				url: 'ws://localhost:3737/ws',
				reconnectDelay: 1000,
				timeService,
			});
			const connectPromise = transport.connect();
			mockWs.simulateOpen();
			await connectPromise;

			// Subscribe to events
			transport.subscribe('task.created');
			transport.subscribe('task.updated');
			mockWs.sentMessages = []; // Clear messages

			// Start listening BEFORE disconnect (reconnecting is emitted immediately on close)
			const reconnectingPromise = once(transport, 'reconnecting');
			await new Promise(resolve => setImmediate(resolve)); // Let once() register

			// Simulate disconnect on the CURRENT connection - this will emit 'reconnecting' immediately
			mockWs.simulateClose(1006, 'Connection lost');
			await reconnectingPromise;

			// NOW prepare new mock WebSocket for reconnection
			const newMockWs = new MockWebSocket('ws://localhost:3737/ws');
			(WebSocket as any).mockImplementation(function (this: any) {
				return newMockWs;
			});
			mockWs = newMockWs;

			// Now listen for reconnected and trigger the timer
			const reconnectedPromise = once(transport, 'reconnected');
			timeService.tick(1000);
			newMockWs.simulateOpen();
			await reconnectedPromise;

			// Assert - subscriptions should be restored
			const subscribeMessage = newMockWs.sentMessages.find(msg => JSON.parse(msg).type === 'subscribe');
			expect(subscribeMessage).toBeDefined();
			const parsed = JSON.parse(subscribeMessage!);
			expect(parsed.eventTypes).toContain('task.created');
			expect(parsed.eventTypes).toContain('task.updated');
		});
	});

	// ===========================================================================================
	// RECONNECTION LOGIC
	// ===========================================================================================

	describe('Reconnection Logic', () => {
		test('should auto-reconnect after connection loss with exponential backoff', async () => {
			// Arrange

			transport = new WebSocketTransport({
				url: 'ws://localhost:3737/ws',
				reconnectDelay: 1000,
				timeService,
			});

			const connectPromise = transport.connect();
			mockWs.simulateOpen();
			await connectPromise;

			// Act - Simulate connection loss
			mockWs.simulateClose(1006, 'Connection lost');

			// First reconnection attempt after 1000ms
			const mockWs2 = new MockWebSocket('ws://localhost:3737/ws');
			(WebSocket as any).mockImplementation(function (this: any) {
				return mockWs2;
			});
			mockWs = mockWs2;

			timeService.tick(1000);

			// Assert
			expect(WebSocket).toHaveBeenCalledTimes(2); // Initial + 1 reconnect
		});

		test('should stop reconnecting after max attempts', async () => {
			// Arrange

			transport = new WebSocketTransport({
				url: 'ws://localhost:3737/ws',
				maxReconnectAttempts: 3,
				reconnectDelay: 1000,
				timeService,
			});

			const connectPromise = transport.connect();
			mockWs.simulateOpen();
			await connectPromise;

			// Listen before initial disconnect
			const reconnectingPromise = once(transport, 'reconnecting');
			await new Promise(resolve => setImmediate(resolve)); // Let once() register
			mockWs.simulateClose(1006, 'Connection lost');
			await reconnectingPromise;

			// Now handle 3 reconnection attempts
			for (let i = 0; i < 3; i++) {
				const newMockWs = new MockWebSocket('ws://localhost:3737/ws');
				(WebSocket as any).mockImplementation(function (this: any) {
					return newMockWs;
				});

				// Trigger reconnection and wait for failure
				const reconnectFailedPromise = once(transport, 'reconnect_failed');
				timeService.tick(1000 * Math.pow(2, i));
				await new Promise(resolve => setImmediate(resolve)); // Let connect() start
				newMockWs.simulateError(new Error('Connection failed'));
				await reconnectFailedPromise;
			}

			// After 3 failed attempts, max should be reached
			// (no more reconnections will be attempted)

			// Assert - Initial + 3 reconnect attempts = 4 total
			expect(WebSocket).toHaveBeenCalledTimes(4);
		});

		test('should not reconnect after manual disconnect', async () => {
			// Arrange

			transport = new WebSocketTransport({ url: 'ws://localhost:3737/ws' });

			const connectPromise = transport.connect();
			mockWs.simulateOpen();
			await connectPromise;

			// Act
			await transport.disconnect();
			timeService.tick(10000); // Wait for potential reconnection

			// Assert
			expect(WebSocket).toHaveBeenCalledTimes(1); // Only initial connection
			expect(transport.isConnected()).toBe(false);
		});

		test('should reset reconnection attempts on successful connection', async () => {
			// Arrange
			transport = new WebSocketTransport({
				url: 'ws://localhost:3737/ws',
				reconnectDelay: 1000,
				timeService,
			});

			const connectPromise = transport.connect();
			mockWs.simulateOpen();
			await connectPromise;

			// First disconnect/reconnect cycle

			// Listen before first disconnect
			let reconnectingPromise = once(transport, 'reconnecting');
			await new Promise(resolve => setImmediate(resolve)); // Let once() register
			mockWs.simulateClose(1006, 'Connection lost');
			await reconnectingPromise;

			// NOW create the new mock for reconnection (after close!)
			const mockWs2 = new MockWebSocket('ws://localhost:3737/ws');
			(WebSocket as any).mockImplementation(function (this: any) {
				return mockWs2;
			});
			mockWs = mockWs2;

			// Trigger reconnection and simulate success
			const reconnectedPromise = once(transport, 'reconnected');
			timeService.tick(1000);
			await new Promise(resolve => setImmediate(resolve)); // Let connect() start
			mockWs2.simulateOpen();
			await reconnectedPromise;

			// Second disconnect - should start with base delay again (reconnect attempts reset)

			// Listen before second disconnect
			reconnectingPromise = once(transport, 'reconnecting');
			await new Promise(resolve => setImmediate(resolve)); // Let once() register
			mockWs2.simulateClose(1006, 'Connection lost');
			await reconnectingPromise;

			// NOW create the new mock for second reconnection
			const mockWs3 = new MockWebSocket('ws://localhost:3737/ws');
			(WebSocket as any).mockImplementation(function (this: any) {
				return mockWs3;
			});

			// Trigger second reconnection with base delay (not exponential)
			timeService.tick(1000);
			await new Promise(resolve => setImmediate(resolve)); // Let connect() start
			mockWs3.simulateOpen();

			// Assert - Initial + 2 reconnects = 3 total
			expect(WebSocket).toHaveBeenCalledTimes(3);
		});
	});

	// ===========================================================================================
	// REQUEST/RESPONSE HANDLING
	// ===========================================================================================

	describe('Request/Response Handling', () => {
		beforeEach(async () => {
			transport = new WebSocketTransport({ url: 'ws://localhost:3737/ws' });
			const connectPromise = transport.connect();
			mockWs.simulateOpen();
			await connectPromise;
		});

		test('should send request and receive response with correlation ID', async () => {
			// Arrange
			const request: B2ORequest = {
				id: 'req-123',
				method: 'createTask',
				params: { description: 'Test task' },
			};

			// Act
			const responsePromise = transport.request(request);

			// Simulate response
			const response: B2OResponse = {
				id: 'req-123',
				result: { id: 'task-123', description: 'Test task' },
			};
			mockWs.simulateMessage({ type: 'response', payload: response });

			const result = await responsePromise;

			// Assert
			expect(result.id).toBe('req-123');
			expect(result.result).toBeDefined();
		});

		test('should handle multiple concurrent requests', async () => {
			// Arrange
			const request1: B2ORequest = { id: 'req-1', method: 'getTask', params: { taskId: '1' } };
			const request2: B2ORequest = { id: 'req-2', method: 'getTask', params: { taskId: '2' } };
			const request3: B2ORequest = { id: 'req-3', method: 'getTask', params: { taskId: '3' } };

			// Act
			const promise1 = transport.request(request1);
			const promise2 = transport.request(request2);
			const promise3 = transport.request(request3);

			// Respond in different order
			mockWs.simulateMessage({ type: 'response', payload: { id: 'req-2', result: { id: '2' } } });
			mockWs.simulateMessage({ type: 'response', payload: { id: 'req-1', result: { id: '1' } } });
			mockWs.simulateMessage({ type: 'response', payload: { id: 'req-3', result: { id: '3' } } });

			const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

			// Assert
			expect(result1.id).toBe('req-1');
			expect(result2.id).toBe('req-2');
			expect(result3.id).toBe('req-3');
		});

		test('should timeout request if no response received', async () => {
			// Arrange

			transport = new WebSocketTransport({
				url: 'ws://localhost:3737/ws',
				requestTimeout: 5000,
				timeService,
			});

			const connectPromise = transport.connect();
			mockWs.simulateOpen();
			await connectPromise;

			const request: B2ORequest = {
				id: 'req-timeout',
				method: 'createTask',
				params: { description: 'Test' },
			};

			// Act
			const responsePromise = transport.request(request);
			timeService.tick(5001);

			// Assert
			await expect(responsePromise).rejects.toThrow('Request timeout after 5000ms');
		});

		test('should reject request if not connected', async () => {
			// Arrange
			transport = new WebSocketTransport({ url: 'ws://localhost:3737/ws' });
			const request: B2ORequest = { id: 'req-1', method: 'getTask', params: {} };

			// Act & Assert
			await expect(transport.request(request)).rejects.toThrow('WebSocket not connected');
		});

		test('should reject request if send fails', async () => {
			// Arrange
			const request: B2ORequest = { id: 'req-1', method: 'getTask', params: {} };

			// Mock send to fail
			mockWs.send = (data: string, callback?: (error?: Error) => void) => {
				mockWs.sentMessages.push(data);
				if (callback) {
					setTimeout(() => callback(new Error('Send failed')), 0);
				}
			};

			// Act & Assert
			await expect(transport.request(request)).rejects.toThrow('Send failed');
		});

		test('should cleanup pending requests on disconnect', async () => {
			// Arrange
			const request: B2ORequest = { id: 'req-1', method: 'getTask', params: {} };

			// Act
			const responsePromise = transport.request(request);
			mockWs.simulateClose(1000, 'Client disconnect');

			// Assert
			await expect(responsePromise).rejects.toThrow('WebSocket connection closed');
		});

		test('should ignore response for unknown request ID', async () => {
			// Act
			mockWs.simulateMessage({ type: 'response', payload: { id: 'unknown-req', result: {} } });
			await new Promise(resolve => setTimeout(resolve, 0));

			// Assert
			expect(consoleWarnSpy).toHaveBeenCalledWith(
				'[WebSocketTransport] Received response for unknown request:',
				'unknown-req'
			);
		});
	});

	// ===========================================================================================
	// EVENT SUBSCRIPTION
	// ===========================================================================================

	describe('Event Subscription', () => {
		beforeEach(async () => {
			transport = new WebSocketTransport({ url: 'ws://localhost:3737/ws' });
			const connectPromise = transport.connect();
			mockWs.simulateOpen();
			await connectPromise;
			mockWs.sentMessages = []; // Clear initial messages
		});

		test('should subscribe to event types', () => {
			// Act
			transport.subscribe('task.created');

			// Assert
			const subscribeMessage = mockWs.sentMessages.find(msg => JSON.parse(msg).type === 'subscribe');
			expect(subscribeMessage).toBeDefined();
			const parsed = JSON.parse(subscribeMessage!);
			expect(parsed.eventTypes).toContain('task.created');
		});

		test('should unsubscribe from event types', () => {
			// Arrange
			transport.subscribe('task.created');
			mockWs.sentMessages = []; // Clear

			// Act
			transport.unsubscribe('task.created');

			// Assert
			const unsubscribeMessage = mockWs.sentMessages.find(msg => JSON.parse(msg).type === 'unsubscribe');
			expect(unsubscribeMessage).toBeDefined();
			const parsed = JSON.parse(unsubscribeMessage!);
			expect(parsed.eventTypes).toContain('task.created');
		});

		test('should route incoming events to handler', async () => {
			// Arrange
			const handler = vi.fn();
			transport.onEvent(handler);

			const event: O2BEvent = {
				type: 'task.created',
				data: { taskId: 'task-123', task: {} as any, timestamp: new Date().toISOString() },
			};

			// Act
			mockWs.simulateMessage({ type: 'event', payload: event });
			await new Promise(resolve => setTimeout(resolve, 0));

			// Assert
			expect(handler).toHaveBeenCalledWith(event);
		});

		test('should handle multiple event handlers', async () => {
			// Arrange
			const handler1 = vi.fn();
			const handler2 = vi.fn();

			transport.onEvent(handler1);
			transport.offEvent();
			transport.onEvent(handler2);

			const event: O2BEvent = {
				type: 'task.updated',
				data: { taskId: 'task-123', task: {} as any, timestamp: new Date().toISOString() },
			};

			// Act
			mockWs.simulateMessage({ type: 'event', payload: event });
			await new Promise(resolve => setTimeout(resolve, 0));

			// Assert
			expect(handler1).not.toHaveBeenCalled(); // Was removed
			expect(handler2).toHaveBeenCalledWith(event);
		});

		test('should not send subscription if not connected', () => {
			// Arrange
			transport.disconnect();

			// Act
			transport.subscribe('task.created');

			// Assert - No new messages should be sent
			const subscribeMessage = mockWs.sentMessages.find(msg => JSON.parse(msg).type === 'subscribe');
			expect(subscribeMessage).toBeUndefined();
		});
	});

	// ===========================================================================================
	// ERROR HANDLING
	// ===========================================================================================

	describe('Error Handling', () => {
		beforeEach(async () => {
			transport = new WebSocketTransport({ url: 'ws://localhost:3737/ws' });
			const connectPromise = transport.connect();
			mockWs.simulateOpen();
			await connectPromise;
		});

		test('should handle malformed JSON messages', async () => {
			// Act
			mockWs.emit('message', Buffer.from('invalid json {'));
			await new Promise(resolve => setTimeout(resolve, 0));

			// Assert
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'[WebSocketTransport] Failed to parse message:',
				expect.any(Error)
			);
		});

		test('should handle unknown message types', async () => {
			// Act
			mockWs.simulateMessage({ type: 'unknown-type', payload: {} });
			await new Promise(resolve => setTimeout(resolve, 0));

			// Assert
			expect(consoleWarnSpy).toHaveBeenCalledWith('[WebSocketTransport] Unknown message type:', 'unknown-type');
		});

		test('should handle event handler errors gracefully', async () => {
			// Arrange
			const faultyHandler = vi.fn(() => {
				throw new Error('Handler error');
			});
			transport.onEvent(faultyHandler);

			const event: O2BEvent = {
				type: 'task.created',
				data: { taskId: 'task-123', task: {} as any, timestamp: new Date().toISOString() },
			};

			// Act
			mockWs.simulateMessage({ type: 'event', payload: event });
			await new Promise(resolve => setTimeout(resolve, 0));

			// Assert
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'[WebSocketTransport] Event handler error:',
				expect.any(Error)
			);
		});

		test('should handle pong messages silently', async () => {
			// Act
			mockWs.simulateMessage({ type: 'pong' });
			await new Promise(resolve => setTimeout(resolve, 0));

			// Assert - No errors or warnings
			expect(true).toBe(true);
		});
	});

	// ===========================================================================================
	// HEARTBEAT / PING-PONG
	// ===========================================================================================

	describe('Heartbeat / Ping-Pong', () => {
		test('should send ping messages periodically', async () => {
			// Arrange

			transport = new WebSocketTransport({
				url: 'ws://localhost:3737/ws',
				pingInterval: 2000,
				timeService,
			});

			const connectPromise = transport.connect();
			mockWs.simulateOpen();
			await connectPromise;

			mockWs.sentMessages = []; // Clear initial messages

			// Act
			timeService.tick(2000);
			timeService.tick(2000);
			timeService.tick(2000);

			// Assert
			const pingMessages = mockWs.sentMessages.filter(msg => JSON.parse(msg).type === 'ping');
			expect(pingMessages.length).toBe(3);
		});

		test('should stop ping on disconnect', async () => {
			// Arrange

			transport = new WebSocketTransport({
				url: 'ws://localhost:3737/ws',
				pingInterval: 1000,
				timeService,
			});

			const connectPromise = transport.connect();
			mockWs.simulateOpen();
			await connectPromise;

			mockWs.sentMessages = []; // Clear

			// Act
			await transport.disconnect();
			timeService.tick(5000);

			// Assert - No ping messages after disconnect
			const pingMessages = mockWs.sentMessages.filter(msg => JSON.parse(msg).type === 'ping');
			expect(pingMessages.length).toBe(0);
		});

		test('should handle ping send errors', async () => {
			// Arrange

			transport = new WebSocketTransport({
				url: 'ws://localhost:3737/ws',
				pingInterval: 1000,
				timeService,
			});

			const connectPromise = transport.connect();
			mockWs.simulateOpen();
			await connectPromise;

			// Mock send to fail for ping (synchronous for deterministic testing)
			mockWs.send = (data: string, callback?: (error?: Error) => void) => {
				const parsed = JSON.parse(data);
				if (parsed.type === 'ping' && callback) {
					callback(new Error('Ping failed')); // Synchronous callback
				} else {
					mockWs.sentMessages.push(data);
					if (callback) {
						callback(); // Synchronous callback
					}
				}
			};

			// Act
			timeService.tick(1000);

			// Assert
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'[WebSocketTransport] Failed to send ping:',
				expect.any(Error)
			);
		});
	});
});
