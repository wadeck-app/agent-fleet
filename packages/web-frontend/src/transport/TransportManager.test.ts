/**
 * TransportManager Tests
 *
 * Tests for the TransportManager singleton.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ITransportClient } from './ITransportClient';
import { TransportManager } from './TransportManager';
import { MockTransportClient } from './adapters/MockTransportClient';

describe('TransportManager', () => {
	beforeEach(() => {
		// Clear singleton before each test
		TransportManager.cleanup();
		// Clear sessionStorage
		sessionStorage.clear();
		// Mock crypto.randomUUID
		vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-uuid-123');
	});

	afterEach(async () => {
		// Cleanup singleton after each test
		await TransportManager.cleanup();
		vi.restoreAllMocks();
	});

	describe('Singleton Pattern', () => {
		it('should return same instance on multiple calls', () => {
			const config = {
				mode: 'mock' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance1 = TransportManager.getInstance(config);
			const instance2 = TransportManager.getInstance(config);

			expect(instance1).toBe(instance2);
		});

		it('should create transport on first getInstance call', () => {
			const config = {
				mode: 'mock' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance = TransportManager.getInstance(config);
			const transport = instance.getTransport();

			expect(transport).toBeDefined();
			expect(transport).toBeInstanceOf(MockTransportClient);
		});
	});

	describe('ConnId Management', () => {
		it('should generate new connId if not in sessionStorage', () => {
			const config = {
				mode: 'mock' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance = TransportManager.getInstance(config);
			const connId = instance.getConnId();

			expect(connId).toBe('test-uuid-123');
			expect(window.name).toBe('test-uuid-123');
		});

		it('should reuse existing connId from sessionStorage', () => {
			window.name = 'existing-uuid';

			const config = {
				mode: 'mock' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance = TransportManager.getInstance(config);
			const connId = instance.getConnId();

			expect(connId).toBe('existing-uuid');
		});

		it('should persist connId across getInstance calls', () => {
			const config = {
				mode: 'mock' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance1 = TransportManager.getInstance(config);
			const connId1 = instance1.getConnId();

			const instance2 = TransportManager.getInstance(config);
			const connId2 = instance2.getConnId();

			expect(connId1).toBe(connId2);
		});

		it('should clear connId on cleanup', async () => {
			const config = {
				mode: 'mock' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance = TransportManager.getInstance(config);
			instance.getConnId();

			expect(window.name).toBe('test-uuid-123');

			await TransportManager.cleanup();

			expect(window.name).toBe('');
		});
	});

	describe('Config Change Detection', () => {
		it('should recreate transport when mode changes', () => {
			const config1 = {
				mode: 'mock' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance1 = TransportManager.getInstance(config1);
			const transport1 = instance1.getTransport();

			const config2 = {
				mode: 'websocket' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance2 = TransportManager.getInstance(config2);
			const transport2 = instance2.getTransport();

			// Same instance (singleton)
			expect(instance1).toBe(instance2);

			// Different transport (recreated)
			expect(transport1).not.toBe(transport2);
		});

		it('should recreate transport when baseUrl changes', () => {
			const config1 = {
				mode: 'mock' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance1 = TransportManager.getInstance(config1);
			const transport1 = instance1.getTransport();

			const config2 = {
				mode: 'mock' as const,
				baseUrl: 'http://localhost:4040',
				wsUrl: 'ws://localhost:4040',
			};

			const instance2 = TransportManager.getInstance(config2);
			const transport2 = instance2.getTransport();

			expect(transport1).not.toBe(transport2);
		});

		it('should NOT recreate transport when config unchanged', () => {
			const config = {
				mode: 'mock' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance1 = TransportManager.getInstance(config);
			const transport1 = instance1.getTransport();

			const instance2 = TransportManager.getInstance(config);
			const transport2 = instance2.getTransport();

			expect(transport1).toBe(transport2);
		});
	});

	describe('Custom Transport', () => {
		it('should use custom transport if provided', () => {
			const customTransport = new MockTransportClient();

			const config = {
				mode: 'mock' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
				customTransport,
			};

			const instance = TransportManager.getInstance(config);
			const transport = instance.getTransport();

			expect(transport).toBe(customTransport);
		});
	});

	describe('Connection Management', () => {
		it('should connect to transport', async () => {
			const config = {
				mode: 'mock' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance = TransportManager.getInstance(config);
			const transport = instance.getTransport() as MockTransportClient;

			// Spy on connect
			const connectSpy = vi.spyOn(transport, 'connect');

			await instance.connect();

			expect(connectSpy).toHaveBeenCalledTimes(1);
			expect(transport.isConnected()).toBe(true);
		});

		it('should NOT reconnect if already connected', async () => {
			const config = {
				mode: 'mock' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance = TransportManager.getInstance(config);
			const transport = instance.getTransport() as MockTransportClient;

			// Spy on connect
			const connectSpy = vi.spyOn(transport, 'connect');

			// Connect twice
			await instance.connect();
			await instance.connect();

			// connect() should only be called once
			expect(connectSpy).toHaveBeenCalledTimes(1);
		});

		it('should disconnect from transport', async () => {
			const config = {
				mode: 'mock' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance = TransportManager.getInstance(config);
			const transport = instance.getTransport() as MockTransportClient;

			// Connect first
			await instance.connect();
			expect(transport.isConnected()).toBe(true);

			// Spy on disconnect
			const disconnectSpy = vi.spyOn(transport, 'disconnect');

			// Disconnect
			await instance.disconnect();

			expect(disconnectSpy).toHaveBeenCalledTimes(1);
			expect(transport.isConnected()).toBe(false);
		});
	});

	describe('Cleanup', () => {
		it('should disconnect and reset singleton on cleanup', async () => {
			const config = {
				mode: 'mock' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance = TransportManager.getInstance(config);
			const transport = instance.getTransport() as MockTransportClient;

			// Connect
			await instance.connect();
			expect(transport.isConnected()).toBe(true);

			// Cleanup
			await TransportManager.cleanup();

			// Transport should be disconnected
			expect(transport.isConnected()).toBe(false);

			// SessionStorage should be cleared
			expect(window.name).toBeNull();

			// New getInstance should create new instance
			const newInstance = TransportManager.getInstance(config);
			const newTransport = newInstance.getTransport();
			expect(newTransport).not.toBe(transport);
		});
	});

	describe('Error Handling', () => {
		it('should throw error when getTransport called without initialization', () => {
			const manager = new (TransportManager as any)(); // Access private constructor for test

			expect(() => manager.getTransport()).toThrow('[TransportManager] Transport not initialized');
		});

		it('should throw error when connect called without initialization', async () => {
			const manager = new (TransportManager as any)(); // Access private constructor for test

			await expect(manager.connect()).rejects.toThrow('[TransportManager] Transport not initialized');
		});
	});

	describe('Transport Creation', () => {
		it('should create WebSocket transport for websocket mode', () => {
			const config = {
				mode: 'websocket' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance = TransportManager.getInstance(config);
			const transport = instance.getTransport();

			expect(transport.getTransportType()).toBe('websocket');
		});

		it('should create SSE transport for sse mode', () => {
			const config = {
				mode: 'sse' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance = TransportManager.getInstance(config);
			const transport = instance.getTransport();

			expect(transport.getTransportType()).toBe('sse');
		});

		it('should create REST transport for rest mode', () => {
			const config = {
				mode: 'rest' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance = TransportManager.getInstance(config);
			const transport = instance.getTransport();

			expect(transport.getTransportType()).toBe('rest');
		});

		it('should create WebSocket transport for auto mode', () => {
			const config = {
				mode: 'auto' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			const instance = TransportManager.getInstance(config);
			const transport = instance.getTransport();

			expect(transport.getTransportType()).toBe('websocket');
		});
	});

	describe('StrictMode Compatibility', () => {
		it('should persist transport across multiple getInstance calls (simulating React remounts)', () => {
			const config = {
				mode: 'mock' as const,
				baseUrl: 'http://localhost:3030',
				wsUrl: 'ws://localhost:3030',
			};

			// First mount
			const instance1 = TransportManager.getInstance(config);
			const transport1 = instance1.getTransport();
			const connId1 = instance1.getConnId();

			// Simulated unmount (but NOT calling disconnect)
			// ...

			// Second mount (StrictMode remount)
			const instance2 = TransportManager.getInstance(config);
			const transport2 = instance2.getTransport();
			const connId2 = instance2.getConnId();

			// Should be same instance
			expect(instance1).toBe(instance2);
			expect(transport1).toBe(transport2);
			expect(connId1).toBe(connId2);
		});
	});
});
