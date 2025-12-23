/**
 * ===========================================================================================
 * TRANSPORT FACTORY - UNIT TESTS
 * ===========================================================================================
 *
 * Tests for the TransportFactory, focusing on transport selection and auto-fallback.
 *
 * Test Coverage:
 * - Transport selection by mode (websocket, rest-sse, rest-longpolling)
 * - Auto-fallback logic (WebSocket → REST+SSE → Long-polling)
 * - Configuration passing to transports
 * - Error handling for invalid modes
 * - Error handling when all transports fail
 * - URL conversion (HTTP ↔ WebSocket)
 * - Connection timeout handling
 *
 * ===========================================================================================
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { OrchestratorTransport } from './OrchestratorTransport.js';
import * as RestLongPollingTransportModule from './RestLongPollingTransport.js';
import * as RestSseTransportModule from './RestSseTransport.js';
import { TransportFactory } from './TransportFactory.js';
import * as WebSocketTransportModule from './WebSocketTransport.js';

// ===========================================================================================
// MOCK TRANSPORT HELPERS
// ===========================================================================================

function createMockTransport(options: { shouldConnect: boolean; connectDelay?: number }): OrchestratorTransport {
	return {
		connect: vi.fn().mockImplementation(() => {
			if (options.connectDelay) {
				return new Promise<void>((resolve, reject) => {
					setTimeout(() => {
						options.shouldConnect ? resolve() : reject(new Error('Connection failed'));
					}, options.connectDelay);
				});
			}
			if (!options.shouldConnect) {
				return Promise.reject(new Error('Connection failed'));
			}
			return Promise.resolve();
		}),
		disconnect: vi.fn().mockResolvedValue(undefined),
		isConnected: vi.fn().mockReturnValue(options.shouldConnect),
		request: vi.fn(),
		subscribe: vi.fn(),
		unsubscribe: vi.fn(),
		onEvent: vi.fn(),
		offEvent: vi.fn(),
	};
}

// ===========================================================================================
// TESTS
// ===========================================================================================

describe('TransportFactory - Explicit Transport Modes', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('should create WebSocket transport in websocket mode', async () => {
		// Arrange
		const mockTransport = createMockTransport({ shouldConnect: true });
		const constructorSpy = vi.spyOn(WebSocketTransportModule, 'WebSocketTransport').mockImplementation(function (
			this: any
		) {
			return mockTransport as any;
		});

		// Act
		const transport = await TransportFactory.create({
			url: 'http://localhost:3737',
			mode: 'websocket',
		});

		// Assert
		expect(constructorSpy).toHaveBeenCalledWith({
			url: 'ws://localhost:3737/orchestrator/ws',
			requestTimeout: 30000,
			pingInterval: 30000,
		});
		expect(mockTransport.connect).toHaveBeenCalledTimes(1);
		expect(transport).toBe(mockTransport);
	});

	test('should create REST+SSE transport in rest-sse mode', async () => {
		// Arrange
		const mockTransport = createMockTransport({ shouldConnect: true });
		const constructorSpy = vi.spyOn(RestSseTransportModule, 'RestSseTransport').mockImplementation(function (
			this: any
		) {
			return mockTransport as any;
		});

		// Act
		const transport = await TransportFactory.create({
			url: 'http://localhost:3737',
			mode: 'rest-sse',
		});

		// Assert
		expect(constructorSpy).toHaveBeenCalledWith({
			baseUrl: 'http://localhost:3737',
			requestTimeout: 30000,
		});
		expect(mockTransport.connect).toHaveBeenCalledTimes(1);
		expect(transport).toBe(mockTransport);
	});

	test('should create Long-polling transport in rest-longpolling mode', async () => {
		// Arrange
		const mockTransport = createMockTransport({ shouldConnect: true });
		const constructorSpy = vi
			.spyOn(RestLongPollingTransportModule, 'RestLongPollingTransport')
			.mockImplementation(function (this: any) {
				return mockTransport as any;
			});

		// Act
		const transport = await TransportFactory.create({
			url: 'http://localhost:3737',
			mode: 'rest-longpolling',
		});

		// Assert
		expect(constructorSpy).toHaveBeenCalledWith({
			baseUrl: 'http://localhost:3737',
			requestTimeout: 30000,
			pollTimeout: 30,
		});
		expect(mockTransport.connect).toHaveBeenCalledTimes(1);
		expect(transport).toBe(mockTransport);
	});

	test('should throw error for invalid mode', async () => {
		// Act & Assert
		await expect(
			TransportFactory.create({
				url: 'http://localhost:3737',
				mode: 'invalid-mode' as any,
			})
		).rejects.toThrow('Unknown transport mode: invalid-mode');
	});

	test('should use custom connection timeout', async () => {
		// Arrange
		const mockTransport = createMockTransport({ shouldConnect: false, connectDelay: 100 });
		vi.spyOn(WebSocketTransportModule, 'WebSocketTransport').mockImplementation(function (this: any) {
			return mockTransport as any;
		});

		// Act & Assert
		await expect(
			TransportFactory.create({
				url: 'http://localhost:3737',
				mode: 'websocket',
				connectionTimeout: 50, // Will timeout before connectDelay
			})
		).rejects.toThrow('Connection timeout after 50ms');
	});
});

describe('TransportFactory - Auto-Fallback Mode', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('should use WebSocket when available in auto mode', async () => {
		// Arrange
		const mockWsTransport = createMockTransport({ shouldConnect: true });
		const wsConstructorSpy = vi.spyOn(WebSocketTransportModule, 'WebSocketTransport').mockImplementation(function (
			this: any
		) {
			return mockWsTransport as any;
		});

		// Act
		const transport = await TransportFactory.create({
			url: 'http://localhost:3737',
			mode: 'auto',
		});

		// Assert
		expect(wsConstructorSpy).toHaveBeenCalled();
		expect(transport).toBe(mockWsTransport);
	});

	test('should fallback to REST+SSE when WebSocket fails', async () => {
		// Arrange
		const mockWsTransport = createMockTransport({ shouldConnect: false });
		const mockSseTransport = createMockTransport({ shouldConnect: true });

		vi.spyOn(WebSocketTransportModule, 'WebSocketTransport').mockImplementation(function (this: any) {
			return mockWsTransport as any;
		});
		vi.spyOn(RestSseTransportModule, 'RestSseTransport').mockImplementation(function (this: any) {
			return mockSseTransport as any;
		});

		// Act
		const transport = await TransportFactory.create({
			url: 'http://localhost:3737',
			mode: 'auto',
		});

		// Assert
		expect(mockWsTransport.connect).toHaveBeenCalled();
		expect(mockSseTransport.connect).toHaveBeenCalled();
		expect(transport).toBe(mockSseTransport);
	});

	test('should fallback to Long-polling when WebSocket and SSE fail', async () => {
		// Arrange
		const mockWsTransport = createMockTransport({ shouldConnect: false });
		const mockSseTransport = createMockTransport({ shouldConnect: false });
		const mockLpTransport = createMockTransport({ shouldConnect: true });

		vi.spyOn(WebSocketTransportModule, 'WebSocketTransport').mockImplementation(function (this: any) {
			return mockWsTransport as any;
		});
		vi.spyOn(RestSseTransportModule, 'RestSseTransport').mockImplementation(function (this: any) {
			return mockSseTransport as any;
		});
		vi.spyOn(RestLongPollingTransportModule, 'RestLongPollingTransport').mockImplementation(function (this: any) {
			return mockLpTransport as any;
		});

		// Act
		const transport = await TransportFactory.create({
			url: 'http://localhost:3737',
			mode: 'auto',
		});

		// Assert
		expect(mockWsTransport.connect).toHaveBeenCalled();
		expect(mockSseTransport.connect).toHaveBeenCalled();
		expect(mockLpTransport.connect).toHaveBeenCalled();
		expect(transport).toBe(mockLpTransport);
	});

	test('should throw error when all transports fail in auto mode', async () => {
		// Arrange
		const mockWsTransport = createMockTransport({ shouldConnect: false });
		const mockSseTransport = createMockTransport({ shouldConnect: false });
		const mockLpTransport = createMockTransport({ shouldConnect: false });

		vi.spyOn(WebSocketTransportModule, 'WebSocketTransport').mockImplementation(function (this: any) {
			return mockWsTransport as any;
		});
		vi.spyOn(RestSseTransportModule, 'RestSseTransport').mockImplementation(function (this: any) {
			return mockSseTransport as any;
		});
		vi.spyOn(RestLongPollingTransportModule, 'RestLongPollingTransport').mockImplementation(function (this: any) {
			return mockLpTransport as any;
		});

		// Act & Assert
		await expect(
			TransportFactory.create({
				url: 'http://localhost:3737',
				mode: 'auto',
			})
		).rejects.toThrow('Failed to establish connection with any transport');
	});

	test('should include all error messages when all transports fail', async () => {
		// Arrange
		const mockWsTransport = createMockTransport({ shouldConnect: false });
		const mockSseTransport = createMockTransport({ shouldConnect: false });
		const mockLpTransport = createMockTransport({ shouldConnect: false });

		vi.spyOn(WebSocketTransportModule, 'WebSocketTransport').mockImplementation(function (this: any) {
			return mockWsTransport as any;
		});
		vi.spyOn(RestSseTransportModule, 'RestSseTransport').mockImplementation(function (this: any) {
			return mockSseTransport as any;
		});
		vi.spyOn(RestLongPollingTransportModule, 'RestLongPollingTransport').mockImplementation(function (this: any) {
			return mockLpTransport as any;
		});

		// Act & Assert
		await expect(
			TransportFactory.create({
				url: 'http://localhost:3737',
				mode: 'auto',
			})
		).rejects.toThrow(/websocket.*rest-sse.*rest-longpolling/);
	});

	test('should default to auto mode when mode is not specified', async () => {
		// Arrange
		const mockWsTransport = createMockTransport({ shouldConnect: true });
		const wsConstructorSpy = vi.spyOn(WebSocketTransportModule, 'WebSocketTransport').mockImplementation(function (
			this: any
		) {
			return mockWsTransport as any;
		});

		// Act
		const transport = await TransportFactory.create({
			url: 'http://localhost:3737',
			// mode not specified - should default to 'auto'
		});

		// Assert
		expect(wsConstructorSpy).toHaveBeenCalled();
		expect(transport).toBe(mockWsTransport);
	});
});

describe('TransportFactory - URL Conversion', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('should convert HTTP URL to WebSocket URL', async () => {
		// Arrange
		const mockTransport = createMockTransport({ shouldConnect: true });
		const constructorSpy = vi.spyOn(WebSocketTransportModule, 'WebSocketTransport').mockImplementation(function (
			this: any
		) {
			return mockTransport as any;
		});

		// Act
		await TransportFactory.create({
			url: 'http://localhost:3737',
			mode: 'websocket',
		});

		// Assert
		expect(constructorSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				url: 'ws://localhost:3737/orchestrator/ws',
			})
		);
	});

	test('should convert HTTPS URL to WSS URL', async () => {
		// Arrange
		const mockTransport = createMockTransport({ shouldConnect: true });
		const constructorSpy = vi.spyOn(WebSocketTransportModule, 'WebSocketTransport').mockImplementation(function (
			this: any
		) {
			return mockTransport as any;
		});

		// Act
		await TransportFactory.create({
			url: 'https://orch.example.com',
			mode: 'websocket',
		});

		// Assert
		expect(constructorSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				url: 'wss://orch.example.com/orchestrator/ws',
			})
		);
	});

	test('should preserve WebSocket URL when already in WS format', async () => {
		// Arrange
		const mockTransport = createMockTransport({ shouldConnect: true });
		const constructorSpy = vi.spyOn(WebSocketTransportModule, 'WebSocketTransport').mockImplementation(function (
			this: any
		) {
			return mockTransport as any;
		});

		// Act
		await TransportFactory.create({
			url: 'ws://localhost:3737/ws',
			mode: 'websocket',
		});

		// Assert
		expect(constructorSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				url: 'ws://localhost:3737/ws',
			})
		);
	});

	test('should strip /orchestrator/ws suffix for REST transports', async () => {
		// Arrange
		const mockTransport = createMockTransport({ shouldConnect: true });
		const constructorSpy = vi.spyOn(RestSseTransportModule, 'RestSseTransport').mockImplementation(function (
			this: any
		) {
			return mockTransport as any;
		});

		// Act
		await TransportFactory.create({
			url: 'ws://localhost:3737/orchestrator/ws',
			mode: 'rest-sse',
		});

		// Assert
		expect(constructorSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				baseUrl: 'http://localhost:3737',
			})
		);
	});
});
