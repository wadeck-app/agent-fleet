/**
 * DevWorker Integration Tests
 *
 * Tests for the DevWorker class which coordinates components for Claude Code process management.
 * Unit tests for individual components are in their respective test files.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DevWorker } from './DevWorker.js';
import type { Task, TaskStatus } from '../../shared/types.js';
import { ClaudeProcessManager } from './ClaudeProcessManager.js';
import { PromptBuilder } from './PromptBuilder.js';
import { DevWorkerWebSocketServer } from './DevWorkerWebSocketServer.js';

// Mock fs
const mockWriteFileSync = vi.fn();
const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();
vi.mock('fs', () => ({
	default: {
		writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
		existsSync: (...args: any[]) => mockExistsSync(...args),
		mkdirSync: (...args: any[]) => mockMkdirSync(...args),
	},
}));

// Mock Storage
vi.mock('../../shared/Storage.js', () => ({
	Storage: {
		getTaskContextDir: vi.fn((taskId: string) => `C:\\data\\contexts\\${taskId}`),
		getDataDir: vi.fn(() => 'C:\\data'),
	},
}));

// Mock BaseWorker
const mockConnect = vi.fn();
const mockShutdown = vi.fn();
const mockSendMessage = vi.fn();

// @formatter:off
vi.mock('../base/BaseWorker.js', () => ({
	BaseWorker: class {
		protected workerId = 'test-worker-1';
		protected ws: any = null;
		protected currentTask: any = null;
		protected workerType = 'dev';

		constructor() {}
		async connect() { return mockConnect(); }
		protected sendMessage(msg: any) { mockSendMessage(msg); }
		protected sendTaskStarted() {}
		protected sendTaskProgress() {}
		protected sendTaskCompleted() {}
		protected sendTaskFailed() {}
		shutdown() { mockShutdown(); }
		protected logPrefix() { return '[DevWorker test-worker-1] '; }
	}
}));
// @formatter:on

describe('DevWorker', () => {
	let worker: DevWorker;
	let mockTask: Task;
	let mockProcessManager: any;
	let mockPromptBuilder: any;
	let mockWsServer: any;

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup file system mocks
		mockExistsSync.mockReturnValue(true);

		// Create mock task
		mockTask = {
			id: 'task-123',
			description: 'Test task description',
			status: 'todo' as TaskStatus,
			priority: 'medium',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			assignedTo: null,
			comments: [],
			metadata: {},
			history: [],
		};

		// Create mock components
		mockProcessManager = {
			launchClaude: vi.fn().mockResolvedValue(undefined),
			killClaude: vi.fn(),
			isRunning: vi.fn().mockReturnValue(false),
			getProcessId: vi.fn().mockReturnValue(undefined),
		};

		mockPromptBuilder = {
			buildPrompt: vi.fn().mockReturnValue('Test prompt'),
		};

		mockWsServer = {
			getPort: vi.fn().mockReturnValue(9999),
			getServer: vi.fn().mockReturnValue({}),
			getSocket: vi.fn().mockReturnValue(null),
			close: vi.fn(),
		};
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('Constructor', () => {
		it('should initialize with default values', () => {
			worker = new DevWorker(undefined, false, false, mockProcessManager, mockPromptBuilder, mockWsServer);

			expect(worker).toBeDefined();
		});

		it('should accept custom wsUrl', () => {
			worker = new DevWorker('ws://custom:8888', false, false, mockProcessManager, mockPromptBuilder, mockWsServer);

			expect(worker).toBeDefined();
		});

		it('should initialize with interactive mode disabled by default', () => {
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			worker = new DevWorker(undefined, false, false, mockProcessManager, mockPromptBuilder, mockWsServer);

			expect(consoleSpy).not.toHaveBeenCalledWith(
				expect.stringContaining('Interactive mode enabled')
			);

			consoleSpy.mockRestore();
		});

		it('should initialize with interactive mode enabled when specified', () => {
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			worker = new DevWorker('ws://localhost:3738', true, false, mockProcessManager, mockPromptBuilder, mockWsServer);

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Interactive mode enabled')
			);

			consoleSpy.mockRestore();
		});

		it('should initialize with test mode disabled by default', () => {
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			worker = new DevWorker(undefined, false, false, mockProcessManager, mockPromptBuilder, mockWsServer);

			expect(consoleSpy).not.toHaveBeenCalledWith(
				expect.stringContaining('Test mode enabled')
			);

			consoleSpy.mockRestore();
		});

		it('should initialize with test mode enabled when specified', () => {
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			worker = new DevWorker('ws://localhost:3738', false, true, mockProcessManager, mockPromptBuilder, mockWsServer);

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Test mode enabled')
			);

			consoleSpy.mockRestore();
		});

		it('should initialize components when not provided', () => {
			// Don't pass components - they should be created
			worker = new DevWorker();

			expect(worker).toBeDefined();
		});
	});

	describe('executeTask', () => {
		beforeEach(() => {
			// Reset mocks to default behavior
			mockWriteFileSync.mockClear();
			mockProcessManager.launchClaude.mockClear();
			mockProcessManager.launchClaude.mockResolvedValue(undefined);
			mockWsServer.getPort.mockReturnValue(9999);

			worker = new DevWorker(undefined, false, false, mockProcessManager, mockPromptBuilder, mockWsServer);
		});

		it('should coordinate all components during task execution', async () => {
			// Execute task
			await (worker as any).executeTask(mockTask);

			// Verify prompt builder was called
			expect(mockPromptBuilder.buildPrompt).toHaveBeenCalledWith(mockTask);

			// Verify prompt was written to file
			expect(mockWriteFileSync).toHaveBeenCalledWith(
				expect.stringContaining('prompt.md'),
				'Test prompt',
				'utf8'
			);

			// Verify process manager was called with correct environment
			expect(mockProcessManager.launchClaude).toHaveBeenCalled();
			const launchArgs = mockProcessManager.launchClaude.mock.calls[0];
			expect(launchArgs[0]).toContain('prompt.md');
			expect(launchArgs[2].CLAUDE_WORKER_ID).toBe('test-worker-1');
			expect(launchArgs[2].CLAUDE_WORKER_SOCKET).toContain('9999');
		});

		it('should pass correct context dir to process manager', async () => {
			await (worker as any).executeTask(mockTask);

			const launchArgs = mockProcessManager.launchClaude.mock.calls[0];
			expect(launchArgs[1]).toContain('task-123');
		});

		it('should set CLAUDE_CODE_STOPPABLE to false for background mode', async () => {
			worker = new DevWorker(undefined, false, false, mockProcessManager, mockPromptBuilder, mockWsServer);

			await (worker as any).executeTask(mockTask);

			const launchArgs = mockProcessManager.launchClaude.mock.calls[0];
			expect(launchArgs[2].CLAUDE_CODE_STOPPABLE).toBe('false');
		});

		it('should set CLAUDE_CODE_STOPPABLE to true for interactive mode', async () => {
			worker = new DevWorker(undefined, true, false, mockProcessManager, mockPromptBuilder, mockWsServer);

			await (worker as any).executeTask(mockTask);

			const launchArgs = mockProcessManager.launchClaude.mock.calls[0];
			expect(launchArgs[2].CLAUDE_CODE_STOPPABLE).toBe('true');
		});

		it('should handle task execution errors', async () => {
			mockProcessManager.launchClaude.mockRejectedValue(new Error('Process error'));

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			await expect((worker as any).executeTask(mockTask)).rejects.toThrow('Process error');

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Task failed'),
				expect.any(Error)
			);

			consoleSpy.mockRestore();
		});

		it('should handle prompt writing errors', async () => {
			mockWriteFileSync.mockImplementationOnce(() => {
				throw new Error('Write failed');
			});

			await expect((worker as any).executeTask(mockTask)).rejects.toThrow('Write failed');
		});

		it('should use WebSocket port from wsServer in environment', async () => {
			// Reset to ensure clean state
			mockWriteFileSync.mockClear();
			mockWsServer.getPort.mockReturnValue(8888);
			worker = new DevWorker(undefined, false, false, mockProcessManager, mockPromptBuilder, mockWsServer);

			await (worker as any).executeTask(mockTask);

			const launchArgs = mockProcessManager.launchClaude.mock.calls[0];
			expect(launchArgs[2].CLAUDE_WORKER_SOCKET).toBe('ws://localhost:8888');
		});

		it('should pass task ID to environment', async () => {
			// Reset to ensure clean state
			mockWriteFileSync.mockClear();
			worker = new DevWorker(undefined, false, false, mockProcessManager, mockPromptBuilder, mockWsServer);
			(worker as any).currentTask = mockTask;

			await (worker as any).executeTask(mockTask);

			const launchArgs = mockProcessManager.launchClaude.mock.calls[0];
			expect(launchArgs[2].CLAUDE_TASK_ID).toBe('task-123');
		});
	});

	describe('killClaude', () => {
		beforeEach(() => {
			worker = new DevWorker(undefined, false, false, mockProcessManager, mockPromptBuilder, mockWsServer);
		});

		it('should delegate to process manager', () => {
			worker.killClaude();

			expect(mockProcessManager.killClaude).toHaveBeenCalled();
		});
	});

	describe('shutdown', () => {
		beforeEach(() => {
			worker = new DevWorker(undefined, false, false, mockProcessManager, mockPromptBuilder, mockWsServer);
		});

		it('should kill Claude process on shutdown', () => {
			worker.shutdown();

			expect(mockProcessManager.killClaude).toHaveBeenCalled();
		});

		it('should close WebSocket server on shutdown', () => {
			worker.shutdown();

			expect(mockWsServer.close).toHaveBeenCalled();
		});

		it('should call parent shutdown', () => {
			worker.shutdown();

			expect(mockShutdown).toHaveBeenCalled();
		});

		it('should handle shutdown when components are in various states', () => {
			mockProcessManager.isRunning.mockReturnValue(true);

			expect(() => worker.shutdown()).not.toThrow();
		});
	});

	describe('logPrefix', () => {
		it('should return correct log prefix', () => {
			worker = new DevWorker(undefined, false, false, mockProcessManager, mockPromptBuilder, mockWsServer);

			const prefix = (worker as any).logPrefix();

			expect(prefix).toContain('DevWorker');
			expect(prefix).toContain('test-worker-1');
		});
	});
});
