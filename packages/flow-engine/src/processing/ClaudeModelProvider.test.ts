/**
 * ClaudeModelProvider Tests
 *
 * Tests that ClaudeModelProvider correctly wraps ClaudeLauncher,
 * handles MCP server temp files, validates inputs, and implements kill().
 */
import * as child_process from 'child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaudeModelProvider } from './ClaudeModelProvider';
import type { LaunchOptions } from './ModelProvider';

vi.mock('child_process');
vi.mock('node:fs', async () => {
	const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
	return {
		...actual,
		promises: {
			...actual.promises,
			writeFile: vi.fn().mockResolvedValue(undefined),
			chmod: vi.fn().mockResolvedValue(undefined),
		},
		unlinkSync: vi.fn(),
	};
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockProcess(): child_process.ChildProcess {
	const proc = new EventEmitter() as child_process.ChildProcess;
	(proc as unknown as Record<string, unknown>).stdin = {
		write: vi.fn(),
		end: vi.fn(),
	};
	(proc as unknown as Record<string, unknown>).stdout = new EventEmitter();
	(proc as unknown as Record<string, unknown>).stderr = new EventEmitter();
	(proc as unknown as Record<string, unknown>).kill = vi.fn();
	(proc as unknown as Record<string, unknown>).pid = 1234;
	return proc;
}

function makeBaseOptions(overrides?: Partial<LaunchOptions>): LaunchOptions {
	return {
		workingDir: '/workspace',
		prompt: 'do something',
		stepId: 'step-1',
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClaudeModelProvider', () => {
	let provider: ClaudeModelProvider;
	let mockProcess: child_process.ChildProcess;

	beforeEach(() => {
		provider = new ClaudeModelProvider();
		mockProcess = makeMockProcess();
		vi.mocked(child_process.spawn).mockReturnValue(mockProcess);
		vi.clearAllMocks();
		vi.mocked(child_process.spawn).mockReturnValue(mockProcess);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// -------------------------------------------------------------------------
	// launchBackground
	// -------------------------------------------------------------------------

	describe('launchBackground', () => {
		it('spawns claude with -p flag in background mode', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions());

			// Emit close after a tick
			setImmediate(() => {
				(mockProcess as EventEmitter).emit('close', 0);
			});

			await resultPromise;

			expect(child_process.spawn).toHaveBeenCalled();
			const spawnArgs = vi.mocked(child_process.spawn).mock.calls[0];
			// args array (2nd param) must contain '-p' for background mode
			expect(spawnArgs[1]).toContain('-p');
		});

		it('passes --model flag when model is specified', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ model: 'claude-3-5-haiku' }));
			setImmediate(() => (mockProcess as EventEmitter).emit('close', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			const modelIdx = args.indexOf('--model');
			expect(modelIdx).toBeGreaterThan(-1);
			expect(args[modelIdx + 1]).toBe('claude-3-5-haiku');
		});

		it('does NOT pass --dangerously-skip-permissions when skipPermissions is not set (default: false)', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions());
			setImmediate(() => (mockProcess as EventEmitter).emit('close', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args).not.toContain('--dangerously-skip-permissions');
		});

		it('passes --dangerously-skip-permissions when skipPermissions is explicitly true', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ skipPermissions: true }));
			setImmediate(() => (mockProcess as EventEmitter).emit('close', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args).toContain('--dangerously-skip-permissions');
		});

		it('returns stdout, stderr, exitCode', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions());

			setImmediate(() => {
				// Emit stdout data
				const stdout = (mockProcess as unknown as Record<string, EventEmitter>)['stdout'];
				stdout.emit('data', Buffer.from('hello'));
				const stderr = (mockProcess as unknown as Record<string, EventEmitter>)['stderr'];
				stderr.emit('data', Buffer.from('warn'));
				(mockProcess as EventEmitter).emit('close', 0);
			});

			const result = await resultPromise;
			expect(result.stdout).toBe('hello');
			expect(result.stderr).toBe('warn');
			expect(result.exitCode).toBe(0);
		});
	});

	// -------------------------------------------------------------------------
	// MCP server temp file
	// -------------------------------------------------------------------------

	describe('mcpServers', () => {
		it('writes temp file when mcpServers provided', async () => {
			const resultPromise = provider.launchBackground(
				makeBaseOptions({
					mcpServers: [
						{
							name: 'my-server',
							command: ['node', '/path/to/server.js'],
							env: { MY_KEY: 'value' },
						},
					],
				})
			);
			setImmediate(() => (mockProcess as EventEmitter).emit('close', 0));
			await resultPromise;

			expect(fs.promises.writeFile).toHaveBeenCalledOnce();
			const [filePath, content] = vi.mocked(fs.promises.writeFile).mock.calls[0] as [string, string, unknown];
			expect(filePath).toContain(os.tmpdir());
			expect(filePath).toMatch(/mcp-config-.+\.json/);

			const parsed = JSON.parse(content) as {
				mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
			};
			expect(parsed.mcpServers['my-server']).toMatchObject({
				command: 'node',
				args: ['/path/to/server.js'],
				env: { MY_KEY: 'value' },
			});
		});

		it('does NOT write temp file when mcpServers is empty', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ mcpServers: [] }));
			setImmediate(() => (mockProcess as EventEmitter).emit('close', 0));
			await resultPromise;

			expect(fs.promises.writeFile).not.toHaveBeenCalled();
		});

		it('passes --mcp-config <path> to spawn args when mcpServers provided', async () => {
			vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

			const resultPromise = provider.launchBackground(
				makeBaseOptions({
					mcpServers: [{ name: 'srv', command: ['node', 'srv.js'] }],
				})
			);
			setImmediate(() => (mockProcess as EventEmitter).emit('close', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			const mcpIdx = args.indexOf('--mcp-config');
			expect(mcpIdx).toBeGreaterThan(-1);
			expect(args[mcpIdx + 1]).toContain(os.tmpdir());
		});

		it('deletes temp file in finally even when spawn rejects', async () => {
			vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
			vi.mocked(child_process.spawn).mockReturnValue(mockProcess);

			const resultPromise = provider.launchBackground(
				makeBaseOptions({
					mcpServers: [{ name: 'srv', command: ['node', 'srv.js'] }],
				})
			);

			// Simulate error
			setImmediate(() => {
				(mockProcess as EventEmitter).emit('error', new Error('spawn failed'));
			});

			await resultPromise.catch(() => {
				/* expected */
			});

			expect(fs.unlinkSync).toHaveBeenCalled();
		});

		it('sets permissions 0o600 on temp file (best-effort)', async () => {
			vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
			vi.mocked(fs.promises.chmod).mockResolvedValue(undefined);

			const resultPromise = provider.launchBackground(
				makeBaseOptions({
					mcpServers: [{ name: 'srv', command: ['node', 'srv.js'] }],
				})
			);
			setImmediate(() => (mockProcess as EventEmitter).emit('close', 0));
			await resultPromise;

			expect(fs.promises.chmod).toHaveBeenCalledWith(expect.any(String), 0o600);
		});
	});

	// -------------------------------------------------------------------------
	// toolHooks settings temp file
	// -------------------------------------------------------------------------

	describe('toolHooks settings file', () => {
		it('writes settings temp file with PreToolUse + PostToolUse when log hooks are set', async () => {
			const resultPromise = provider.launchBackground(
				makeBaseOptions({
					toolHooks: [
						{ timing: 'before', action: { type: 'log' } },
						{ timing: 'after', action: { type: 'log' } },
					],
				})
			);
			setImmediate(() => (mockProcess as EventEmitter).emit('close', 0));
			await resultPromise;

			const calls = vi.mocked(fs.promises.writeFile).mock.calls;
			const settingsCall = calls.find(([p]) => String(p).includes('claude-settings-'));
			expect(settingsCall).toBeDefined();

			const content = settingsCall![1] as string;
			const parsed = JSON.parse(content) as {
				hooks: {
					PreToolUse?: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;
					PostToolUse?: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;
				};
			};
			expect(parsed.hooks.PreToolUse).toBeDefined();
			expect(parsed.hooks.PreToolUse![0].matcher).toBe('*');
			expect(parsed.hooks.PreToolUse![0].hooks[0].command).toContain('tool-use');
			expect(parsed.hooks.PostToolUse).toBeDefined();
			expect(parsed.hooks.PostToolUse![0].hooks[0].command).toContain('tool-result');
		});

		it('uses toolPattern as matcher for deny hooks', async () => {
			const resultPromise = provider.launchBackground(
				makeBaseOptions({
					toolHooks: [{ timing: 'before', action: { type: 'deny', reason: 'no bash', toolPattern: 'Bash' } }],
				})
			);
			setImmediate(() => (mockProcess as EventEmitter).emit('close', 0));
			await resultPromise;

			const calls = vi.mocked(fs.promises.writeFile).mock.calls;
			const settingsCall = calls.find(([p]) => String(p).includes('claude-settings-'));
			expect(settingsCall).toBeDefined();

			const parsed = JSON.parse(settingsCall![1] as string) as {
				hooks: { PreToolUse: Array<{ matcher: string }> };
			};
			expect(parsed.hooks.PreToolUse[0].matcher).toBe('Bash');
		});

		it('passes --settings flag to spawn args when toolHooks is set', async () => {
			const resultPromise = provider.launchBackground(
				makeBaseOptions({
					toolHooks: [{ timing: 'before', action: { type: 'log' } }],
				})
			);
			setImmediate(() => (mockProcess as EventEmitter).emit('close', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			const settingsIdx = args.indexOf('--settings');
			expect(settingsIdx).toBeGreaterThan(-1);
			expect(args[settingsIdx + 1]).toContain(os.tmpdir());
			expect(args[settingsIdx + 1]).toMatch(/claude-settings-.+\.json/);
			expect(args).toContain('--include-hook-events');
		});

		it('does NOT write settings file when toolHooks is not set', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions());
			setImmediate(() => (mockProcess as EventEmitter).emit('close', 0));
			await resultPromise;

			const calls = vi.mocked(fs.promises.writeFile).mock.calls;
			const settingsCall = calls.find(([p]) => String(p).includes('claude-settings-'));
			expect(settingsCall).toBeUndefined();
		});

		it('does NOT write settings file when toolHooks is an empty array', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ toolHooks: [] }));
			setImmediate(() => (mockProcess as EventEmitter).emit('close', 0));
			await resultPromise;

			const calls = vi.mocked(fs.promises.writeFile).mock.calls;
			const settingsCall = calls.find(([p]) => String(p).includes('claude-settings-'));
			expect(settingsCall).toBeUndefined();
		});

		it('deletes settings temp file in finally even when spawn rejects', async () => {
			vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

			const resultPromise = provider.launchBackground(
				makeBaseOptions({
					toolHooks: [{ timing: 'before', action: { type: 'log' } }],
				})
			);

			setImmediate(() => {
				(mockProcess as EventEmitter).emit('error', new Error('spawn failed'));
			});

			await resultPromise.catch(() => {
				/* expected */
			});

			expect(fs.unlinkSync).toHaveBeenCalled();
		});
	});

	// -------------------------------------------------------------------------
	// kill()
	// -------------------------------------------------------------------------

	describe('kill()', () => {
		it('does not throw when no process is running', () => {
			expect(() => provider.kill()).not.toThrow();
		});

		it('calls kill() on the current process', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions());
			// Don't emit close - process stays "running"
			await new Promise(resolve => setImmediate(resolve));

			provider.kill();

			expect((mockProcess as unknown as Record<string, ReturnType<typeof vi.fn>>)['kill']).toHaveBeenCalled();

			// Cleanup: emit close so the test doesn't hang
			(mockProcess as EventEmitter).emit('close', 1);
			await resultPromise.catch(() => {});
		});

		it('logs warning but does not throw when kill() on process fails', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions());
			await new Promise(resolve => setImmediate(resolve));

			// Make process.kill throw
			const killFn = (mockProcess as unknown as Record<string, ReturnType<typeof vi.fn>>)['kill'];
			killFn.mockImplementation(() => {
				throw new Error('EPERM');
			});

			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			expect(() => provider.kill()).not.toThrow();
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining('[ClaudeModelProvider]'),
				expect.stringContaining('EPERM')
			);

			(mockProcess as EventEmitter).emit('close', 1);
			await resultPromise.catch(() => {});
		});
	});

	// -------------------------------------------------------------------------
	// Env isolation
	// -------------------------------------------------------------------------

	describe('env isolation', () => {
		it('does not forward process.env to spawn', async () => {
			process.env['SECRET_CRED'] = 'should-not-leak';

			const resultPromise = provider.launchBackground(makeBaseOptions());
			setImmediate(() => (mockProcess as EventEmitter).emit('close', 0));
			await resultPromise;

			const spawnOptions = vi.mocked(child_process.spawn).mock.calls[0][2] as { env?: Record<string, string> };
			expect(spawnOptions.env?.['SECRET_CRED']).toBeUndefined();

			delete process.env['SECRET_CRED'];
		});

		it('forwards options.env entries to spawn', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ env: { MY_VAR: 'hello' } }));
			setImmediate(() => (mockProcess as EventEmitter).emit('close', 0));
			await resultPromise;

			const spawnOptions = vi.mocked(child_process.spawn).mock.calls[0][2] as { env?: Record<string, string> };
			expect(spawnOptions.env?.['MY_VAR']).toBe('hello');
		});

		it('forwards ANTHROPIC_API_KEY from process.env', async () => {
			process.env['ANTHROPIC_API_KEY'] = 'test-key-123';

			const resultPromise = provider.launchBackground(makeBaseOptions());
			setImmediate(() => (mockProcess as EventEmitter).emit('close', 0));
			await resultPromise;

			const spawnOptions = vi.mocked(child_process.spawn).mock.calls[0][2] as { env?: Record<string, string> };
			expect(spawnOptions.env?.['ANTHROPIC_API_KEY']).toBe('test-key-123');

			delete process.env['ANTHROPIC_API_KEY'];
		});
	});

	// -------------------------------------------------------------------------
	// Field validation
	// -------------------------------------------------------------------------

	describe('field validation', () => {
		it('throws on invalid McpServer name', async () => {
			await expect(
				provider.launchBackground(
					makeBaseOptions({
						mcpServers: [{ name: 'invalid name!', command: ['node'] }],
					})
				)
			).rejects.toThrow('must match ^[a-zA-Z0-9_-]+$');
		});

		it('throws when McpServer.command is empty', async () => {
			await expect(
				provider.launchBackground(
					makeBaseOptions({
						mcpServers: [{ name: 'srv', command: [] }],
					})
				)
			).rejects.toThrow('command must have at least 1 element');
		});

		it('throws on invalid McpServer.env key', async () => {
			await expect(
				provider.launchBackground(
					makeBaseOptions({
						mcpServers: [{ name: 'srv', command: ['node'], env: { 'invalid-key': 'val' } }],
					})
				)
			).rejects.toThrow('must match ^[A-Z_][A-Z0-9_]*$');
		});

		it('throws on invalid model format', async () => {
			await expect(provider.launchBackground(makeBaseOptions({ model: 'invalid model!' }))).rejects.toThrow(
				'must match ^[a-zA-Z0-9_./:@-]{1,256}$'
			);
		});

		it('throws on invalid resumeSessionId', async () => {
			await expect(
				provider.launchBackground(makeBaseOptions({ resumeSessionId: 'invalid id!' }))
			).rejects.toThrow('must match ^[a-zA-Z0-9_-]{1,128}$');
		});

		it('throws on string field exceeding max length', async () => {
			const longString = 'a'.repeat(2049);
			await expect(
				provider.launchBackground(
					makeBaseOptions({
						mcpServers: [{ name: 'srv', command: [longString] }],
					})
				)
			).rejects.toThrow('exceeds max length');
		});

		it('throws on null byte in string field', async () => {
			await expect(
				provider.launchBackground(
					makeBaseOptions({
						mcpServers: [{ name: 'srv', command: ['node\x00hack'] }],
					})
				)
			).rejects.toThrow('null bytes or invalid control characters');
		});
	});
});
