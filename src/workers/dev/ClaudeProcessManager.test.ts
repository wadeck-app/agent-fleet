/**
 * ClaudeProcessManager Tests
 *
 * Tests for the ClaudeProcessManager class which handles Claude Code process management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeProcessManager } from './ClaudeProcessManager.js';
import type { ChildProcess } from 'child_process';

// Mock child_process
const mockSpawn = vi.fn();
const mockExecSync = vi.fn();
vi.mock('child_process', () => ({
	spawn: (...args: any[]) => mockSpawn(...args),
	execSync: (...args: any[]) => mockExecSync(...args),
}));

// Mock fs
const mockReadFileSync = vi.fn();
vi.mock('fs', () => ({
	default: {
		readFileSync: (...args: any[]) => mockReadFileSync(...args),
	},
}));

describe('ClaudeProcessManager', () => {
	let manager: ClaudeProcessManager;
	let mockClaudeProcess: any;

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup mock Claude process
		mockClaudeProcess = {
			pid: 12345,
			stdin: {
				end: vi.fn(),
			},
			stdout: {
				on: vi.fn(),
			},
			stderr: {
				on: vi.fn(),
			},
			on: vi.fn(),
			kill: vi.fn(),
		};

		mockSpawn.mockReturnValue(mockClaudeProcess);
		mockExecSync.mockReturnValue('C:\\Program Files\\Claude\\claude.cmd');
		mockReadFileSync.mockReturnValue('Test prompt content');
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('findClaudePath', () => {
		it('should find Claude path on Windows using where command', () => {
			const originalPlatform = process.platform;
			Object.defineProperty(process, 'platform', { value: 'win32' });

			manager = new ClaudeProcessManager();
			mockExecSync.mockReturnValue('C:\\Program Files\\Claude\\claude.cmd\n');

			const path = manager.findClaudePath();

			expect(mockExecSync).toHaveBeenCalledWith('where claude', { encoding: 'utf8' });
			expect(path).toBe('C:\\Program Files\\Claude\\claude.cmd');

			Object.defineProperty(process, 'platform', { value: originalPlatform });
		});

		it('should prefer .cmd over .bat on Windows', () => {
			const originalPlatform = process.platform;
			Object.defineProperty(process, 'platform', { value: 'win32' });

			manager = new ClaudeProcessManager();
			mockExecSync.mockReturnValue(
				'C:\\Program Files\\Claude\\claude.bat\nC:\\Program Files\\Claude\\claude.cmd\n'
			);

			const path = manager.findClaudePath();

			expect(path).toBe('C:\\Program Files\\Claude\\claude.cmd');

			Object.defineProperty(process, 'platform', { value: originalPlatform });
		});

		it('should use .bat if .cmd not available on Windows', () => {
			const originalPlatform = process.platform;
			Object.defineProperty(process, 'platform', { value: 'win32' });

			manager = new ClaudeProcessManager();
			mockExecSync.mockReturnValue('C:\\Program Files\\Claude\\claude.bat\n');

			const path = manager.findClaudePath();

			expect(path).toBe('C:\\Program Files\\Claude\\claude.bat');

			Object.defineProperty(process, 'platform', { value: originalPlatform });
		});

		it('should find Claude path on Unix using which command', () => {
			const originalPlatform = process.platform;
			Object.defineProperty(process, 'platform', { value: 'linux' });

			manager = new ClaudeProcessManager();
			mockExecSync.mockReturnValue('/usr/local/bin/claude\n');

			const path = manager.findClaudePath();

			expect(mockExecSync).toHaveBeenCalledWith('which claude', { encoding: 'utf8' });
			expect(path).toBe('/usr/local/bin/claude');

			Object.defineProperty(process, 'platform', { value: originalPlatform });
		});

		it('should fallback to "claude" if command not found', () => {
			manager = new ClaudeProcessManager();
			mockExecSync.mockImplementation(() => {
				throw new Error('Command not found');
			});

			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const path = manager.findClaudePath();

			expect(path).toBe('claude');
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Could not find claude in PATH')
			);

			consoleSpy.mockRestore();
		});
	});

	describe('launchClaude - Background Mode', () => {
		beforeEach(() => {
			manager = new ClaudeProcessManager(false, false, '[Test]');
		});

		it('should spawn Claude in background mode with correct arguments', async () => {
			mockClaudeProcess.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'close') setTimeout(() => handler(0), 10);
				return mockClaudeProcess;
			});

			await manager.launchClaude('prompt.md', 'C:\\context', {});

			expect(mockSpawn).toHaveBeenCalled();
			const spawnArgs = mockSpawn.mock.calls[0];
			expect(spawnArgs[1]).toContain('--dangerously-skip-permissions');
			expect(spawnArgs[1]).toContain('-p');
		});

		it('should set environment variables for Claude', async () => {
			mockClaudeProcess.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'close') setTimeout(() => handler(0), 10);
				return mockClaudeProcess;
			});

			const env = {
				CLAUDE_WORKER_ID: 'test-worker',
				CLAUDE_TASK_ID: 'task-123',
			};

			await manager.launchClaude('prompt.md', 'C:\\context', env);

			const spawnOptions = mockSpawn.mock.calls[0][2];
			expect(spawnOptions.env.CLAUDE_WORKER_ID).toBe('test-worker');
			expect(spawnOptions.env.CLAUDE_TASK_ID).toBe('task-123');
		});

		it('should capture stdout in background mode', async () => {
			let stdoutHandler: Function;
			mockClaudeProcess.stdout.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'data') stdoutHandler = handler;
				return mockClaudeProcess.stdout;
			});

			mockClaudeProcess.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'close') {
					setTimeout(() => {
						stdoutHandler?.(Buffer.from('Claude output'));
						handler(0);
					}, 10);
				}
				return mockClaudeProcess;
			});

			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			await manager.launchClaude('prompt.md', 'C:\\context', {});

			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Claude output'));

			consoleSpy.mockRestore();
		});

		it('should capture stderr in background mode', async () => {
			let stderrHandler: Function;
			mockClaudeProcess.stderr.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'data') stderrHandler = handler;
				return mockClaudeProcess.stderr;
			});

			mockClaudeProcess.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'close') {
					setTimeout(() => {
						stderrHandler?.(Buffer.from('Claude error'));
						handler(0);
					}, 10);
				}
				return mockClaudeProcess;
			});

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			await manager.launchClaude('prompt.md', 'C:\\context', {});

			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Claude error'));

			consoleSpy.mockRestore();
		});

		it('should close stdin immediately in background mode', async () => {
			mockClaudeProcess.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'close') setTimeout(() => handler(0), 10);
				return mockClaudeProcess;
			});

			await manager.launchClaude('prompt.md', 'C:\\context', {});

			expect(mockClaudeProcess.stdin.end).toHaveBeenCalled();
		});

		it('should log execution time on completion', async () => {
			mockClaudeProcess.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'close') setTimeout(() => handler(0), 10);
				return mockClaudeProcess;
			});

			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			await manager.launchClaude('prompt.md', 'C:\\context', {});

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Execution time:')
			);

			consoleSpy.mockRestore();
		});

		it('should reject on non-zero exit code in background mode', async () => {
			mockClaudeProcess.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'close') setTimeout(() => handler(1), 10);
				return mockClaudeProcess;
			});

			await expect(manager.launchClaude('prompt.md', 'C:\\context', {})).rejects.toThrow(
				'Claude exited with code 1'
			);
		});

		it('should reject on process error in background mode', async () => {
			mockClaudeProcess.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'error') setTimeout(() => handler(new Error('Spawn failed')), 10);
				return mockClaudeProcess;
			});

			await expect(manager.launchClaude('prompt.md', 'C:\\context', {})).rejects.toThrow(
				'Spawn failed'
			);
		});
	});

	describe('launchClaude - Interactive Mode', () => {
		beforeEach(() => {
			manager = new ClaudeProcessManager(true, false, '[Test]');
		});

		it('should spawn Claude in interactive mode with stdio inherit', async () => {
			mockClaudeProcess.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'close') setTimeout(() => handler(0), 10);
				return mockClaudeProcess;
			});

			await manager.launchClaude('prompt.md', 'C:\\context', {});

			const spawnOptions = mockSpawn.mock.calls[0][2];
			expect(spawnOptions.stdio).toBe('inherit');
		});

		it('should read prompt file for interactive mode', async () => {
			mockClaudeProcess.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'close') setTimeout(() => handler(0), 10);
				return mockClaudeProcess;
			});

			await manager.launchClaude('prompt.md', 'C:\\context', {});

			expect(mockReadFileSync).toHaveBeenCalledWith('prompt.md', 'utf8');
		});

		it('should accept exit code 0 as success in interactive mode', async () => {
			mockClaudeProcess.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'close') setTimeout(() => handler(0), 10);
				return mockClaudeProcess;
			});

			await expect(
				manager.launchClaude('prompt.md', 'C:\\context', {})
			).resolves.toBeUndefined();
		});

		it('should accept exit code 1 (taskkill) as success in interactive mode', async () => {
			mockClaudeProcess.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'close') setTimeout(() => handler(1), 10);
				return mockClaudeProcess;
			});

			await expect(
				manager.launchClaude('prompt.md', 'C:\\context', {})
			).resolves.toBeUndefined();
		});

		it('should accept null exit code (signal) as success in interactive mode', async () => {
			mockClaudeProcess.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'close') setTimeout(() => handler(null), 10);
				return mockClaudeProcess;
			});

			await expect(
				manager.launchClaude('prompt.md', 'C:\\context', {})
			).resolves.toBeUndefined();
		});

		it('should reject on other exit codes in interactive mode', async () => {
			mockClaudeProcess.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'close') setTimeout(() => handler(2), 10);
				return mockClaudeProcess;
			});

			await expect(
				manager.launchClaude('prompt.md', 'C:\\context', {})
			).rejects.toThrow('Claude exited with code 2');
		});

		it('should reject on process error in interactive mode', async () => {
			mockClaudeProcess.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'error') setTimeout(() => handler(new Error('Process error')), 10);
				return mockClaudeProcess;
			});

			await expect(
				manager.launchClaude('prompt.md', 'C:\\context', {})
			).rejects.toThrow('Process error');
		});
	});

	describe('launchClaude - Test Mode', () => {
		it('should use test script in test mode (background)', async () => {
			manager = new ClaudeProcessManager(false, true, '[Test]');

			mockClaudeProcess.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'close') setTimeout(() => handler(0), 10);
				return mockClaudeProcess;
			});

			await manager.launchClaude('prompt.md', 'C:\\context', {});

			expect(mockSpawn).toHaveBeenCalled();
			const spawnArgs = mockSpawn.mock.calls[0];
			expect(spawnArgs[0]).toBe('cmd.exe');
			expect(spawnArgs[1].some((arg: string) => arg.includes('test-claude.bat'))).toBe(true);
		});

		it('should use test script in test mode (interactive)', async () => {
			manager = new ClaudeProcessManager(true, true, '[Test]');

			mockClaudeProcess.on.mockImplementation((event: string, handler: Function) => {
				if (event === 'close') setTimeout(() => handler(0), 10);
				return mockClaudeProcess;
			});

			await manager.launchClaude('prompt.md', 'C:\\context', {});

			expect(mockSpawn).toHaveBeenCalled();
			const spawnArgs = mockSpawn.mock.calls[0];
			expect(spawnArgs[0]).toBe('node');
			expect(spawnArgs[1].some((arg: string) => arg.includes('test-claude-with-stop.js'))).toBe(true);
		});
	});

	describe('killClaude', () => {
		beforeEach(() => {
			manager = new ClaudeProcessManager(false, false, '[Test]');
		});

		it('should kill Claude process when running', () => {
			// Launch process first
			mockClaudeProcess.on.mockImplementation(() => mockClaudeProcess);
			(manager as any).claudeProcess = mockClaudeProcess;

			manager.killClaude();

			expect(mockExecSync).toHaveBeenCalledWith(
				expect.stringContaining('taskkill /PID 12345'),
				expect.any(Object)
			);
		});

		it('should set claudeProcess to null after killing', () => {
			(manager as any).claudeProcess = mockClaudeProcess;

			manager.killClaude();

			expect((manager as any).claudeProcess).toBeNull();
		});

		it('should handle kill errors gracefully', () => {
			(manager as any).claudeProcess = mockClaudeProcess;
			mockExecSync.mockImplementation(() => {
				throw new Error('Process not found');
			});

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			manager.killClaude();

			expect((manager as any).claudeProcess).toBeNull();

			consoleSpy.mockRestore();
		});

		it('should do nothing if no Claude process is running', () => {
			(manager as any).claudeProcess = null;

			manager.killClaude();

			expect(mockExecSync).not.toHaveBeenCalled();
		});

		it('should use SIGKILL on non-Windows platforms', () => {
			const originalPlatform = process.platform;
			Object.defineProperty(process, 'platform', { value: 'linux' });

			(manager as any).claudeProcess = mockClaudeProcess;

			manager.killClaude();

			expect(mockClaudeProcess.kill).toHaveBeenCalledWith('SIGKILL');

			Object.defineProperty(process, 'platform', { value: originalPlatform });
		});
	});

	describe('isRunning', () => {
		it('should return true when process is running', () => {
			manager = new ClaudeProcessManager();
			(manager as any).claudeProcess = mockClaudeProcess;

			expect(manager.isRunning()).toBe(true);
		});

		it('should return false when process is not running', () => {
			manager = new ClaudeProcessManager();
			(manager as any).claudeProcess = null;

			expect(manager.isRunning()).toBe(false);
		});
	});

	describe('getProcessId', () => {
		it('should return process ID when running', () => {
			manager = new ClaudeProcessManager();
			(manager as any).claudeProcess = mockClaudeProcess;

			expect(manager.getProcessId()).toBe(12345);
		});

		it('should return undefined when not running', () => {
			manager = new ClaudeProcessManager();
			(manager as any).claudeProcess = null;

			expect(manager.getProcessId()).toBeUndefined();
		});
	});
});
