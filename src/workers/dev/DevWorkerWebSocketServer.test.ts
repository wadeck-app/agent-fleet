/**
 * DevWorkerWebSocketServer Tests
 *
 * Tests for the DevWorkerWebSocketServer class which handles WebSocket communication with Claude.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DevWorkerWebSocketServer } from './DevWorkerWebSocketServer.js';
import { ClaudeProcessManager } from './ClaudeProcessManager.js';
import type { WebSocketServer, WebSocket } from 'ws';

// Mock ws (WebSocketServer)
const mockWssClose = vi.fn();
const mockWssOn = vi.fn();
const mockWssAddress = vi.fn();
let wssEventHandlers: Record<string, Function> = {};

vi.mock('ws', () => {
	class MockWebSocketServer {
		on = mockWssOn;
		close = mockWssClose;
		address = mockWssAddress;

		constructor(options: any) {
			this.on = vi.fn((event: string, handler: Function) => {
				wssEventHandlers[event] = handler;
				// Auto-trigger listening event
				if (event === 'listening') {
					setTimeout(() => handler(), 0);
				}
				return this;
			});
		}
	}

	return {
		WebSocketServer: MockWebSocketServer,
	};
});

describe('DevWorkerWebSocketServer', () => {
	let server: DevWorkerWebSocketServer;
	let mockProcessManager: ClaudeProcessManager;

	beforeEach(() => {
		vi.clearAllMocks();
		wssEventHandlers = {};

		// Create mock process manager
		mockProcessManager = {
			killClaude: vi.fn(),
		} as any;

		// Setup WebSocket server address
		mockWssAddress.mockReturnValue({
			port: 9999,
			family: 'IPv4',
			address: '127.0.0.1',
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('Constructor', () => {
		it('should initialize WebSocket server', async () => {
			server = new DevWorkerWebSocketServer(mockProcessManager, '[Test]');

			// Wait for async initialization
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(wssEventHandlers['listening']).toBeDefined();
			expect(wssEventHandlers['connection']).toBeDefined();
			expect(wssEventHandlers['error']).toBeDefined();
		});

		it('should log WebSocket server port when listening', async () => {
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			server = new DevWorkerWebSocketServer(mockProcessManager, '[Test]');

			// Wait for listening event
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Claude WebSocket server listening on port 9999')
			);

			consoleSpy.mockRestore();
		});
	});

	describe('getPort', () => {
		it('should return the port number', async () => {
			server = new DevWorkerWebSocketServer(mockProcessManager, '[Test]');

			// Wait for listening event
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(server.getPort()).toBe(9999);
		});
	});

	describe('Connection handling', () => {
		beforeEach(async () => {
			server = new DevWorkerWebSocketServer(mockProcessManager, '[Test]');
			await new Promise(resolve => setTimeout(resolve, 10));
		});

		it('should handle Claude socket connection', () => {
			const mockSocket: any = {
				on: vi.fn(),
			};

			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			wssEventHandlers['connection'](mockSocket);

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Claude process connected')
			);
			expect(mockSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
			expect(mockSocket.on).toHaveBeenCalledWith('close', expect.any(Function));
			expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));

			consoleSpy.mockRestore();
		});

		it('should handle STOP_REQUESTED message from Claude', async () => {
			const mockSocket: any = {
				on: vi.fn(),
			};

			let messageHandler: Function;
			mockSocket.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'message') messageHandler = handler;
			});

			wssEventHandlers['connection'](mockSocket);

			const message = JSON.stringify({ type: 'STOP_REQUESTED' });
			messageHandler!(Buffer.from(message));

			expect(mockProcessManager.killClaude).toHaveBeenCalled();
		});

		it('should handle HOOK_EVENT message from Claude', async () => {
			const mockSocket: any = {
				on: vi.fn(),
			};

			let messageHandler: Function;
			mockSocket.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'message') messageHandler = handler;
			});

			wssEventHandlers['connection'](mockSocket);

			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			const message = JSON.stringify({ type: 'HOOK_EVENT', hookName: 'test-hook' });
			messageHandler!(Buffer.from(message));

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Hook event: test-hook')
			);

			consoleSpy.mockRestore();
		});

		it('should handle unknown message type from Claude', async () => {
			const mockSocket: any = {
				on: vi.fn(),
			};

			let messageHandler: Function;
			mockSocket.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'message') messageHandler = handler;
			});

			wssEventHandlers['connection'](mockSocket);

			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			const message = JSON.stringify({ type: 'UNKNOWN_TYPE' });
			messageHandler!(Buffer.from(message));

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Unknown message type: UNKNOWN_TYPE')
			);

			consoleSpy.mockRestore();
		});

		it('should handle invalid JSON from Claude socket', async () => {
			const mockSocket: any = {
				on: vi.fn(),
			};

			let messageHandler: Function;
			mockSocket.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'message') messageHandler = handler;
			});

			wssEventHandlers['connection'](mockSocket);

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			messageHandler!(Buffer.from('invalid json'));

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Error parsing Claude message'),
				expect.any(Error)
			);

			consoleSpy.mockRestore();
		});

		it('should handle socket close event', async () => {
			const mockSocket: any = {
				on: vi.fn(),
			};

			let closeHandler: Function;
			mockSocket.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'close') closeHandler = handler;
			});

			wssEventHandlers['connection'](mockSocket);

			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			closeHandler!();

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Claude socket disconnected')
			);

			consoleSpy.mockRestore();
		});

		it('should handle socket error event', async () => {
			const mockSocket: any = {
				on: vi.fn(),
			};

			let errorHandler: Function;
			mockSocket.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'error') errorHandler = handler;
			});

			wssEventHandlers['connection'](mockSocket);

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			errorHandler!(new Error('Socket error'));

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Claude socket error'),
				expect.any(Error)
			);

			consoleSpy.mockRestore();
		});

		it('should handle WebSocket server error', async () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			wssEventHandlers['error']?.(new Error('Server error'));

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Claude WebSocket server error'),
				expect.any(Error)
			);

			consoleSpy.mockRestore();
		});
	});

	describe('close', () => {
		beforeEach(async () => {
			server = new DevWorkerWebSocketServer(mockProcessManager, '[Test]');
			await new Promise(resolve => setTimeout(resolve, 10));
		});

		it('should close WebSocket server', () => {
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			server.close();

			expect(mockWssClose).toHaveBeenCalled();

			consoleSpy.mockRestore();
		});

		it('should handle close when server is already closed', () => {
			server.close();
			(server as any).wss = null;

			expect(() => server.close()).not.toThrow();
		});
	});
});
