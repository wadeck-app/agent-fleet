/**
 * CodexModelProvider Tests
 *
 * Tests that CodexModelProvider correctly spawns codex exec,
 * handles JSONL output, validates inputs, and implements kill().
 */
import * as child_process from 'child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CodexModelProvider } from './CodexModelProvider';
import type { LaunchOptions } from './ModelProvider';

vi.mock('child_process');
vi.mock('node:fs', async () => {
	const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
	return {
		...actual,
		writeFileSync: vi.fn(),
		unlinkSync: vi.fn(),
		existsSync: vi.fn().mockReturnValue(false),
		mkdirSync: vi.fn(),
		chmodSync: vi.fn(),
		copyFileSync: vi.fn(),
		rmSync: vi.fn(),
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

describe('CodexModelProvider', () => {
	let provider: CodexModelProvider;
	let mockProcess: child_process.ChildProcess;

	beforeEach(() => {
		provider = new CodexModelProvider();
		mockProcess = makeMockProcess();
		vi.mocked(child_process.spawn).mockReturnValue(mockProcess);
		vi.mocked(child_process.execSync).mockReturnValue(Buffer.from('codex'));
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// -------------------------------------------------------------------------
	// launchBackground
	// -------------------------------------------------------------------------

	describe('launchBackground', () => {
		it('spawns codex exec with --json flag', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions());

			setImmediate(() => {
				(mockProcess as EventEmitter).emit('exit', 0);
			});

			await resultPromise;

			expect(child_process.spawn).toHaveBeenCalled();
			const spawnArgs = vi.mocked(child_process.spawn).mock.calls[0];
			const args = spawnArgs[1] as string[];
			expect(args).toContain('exec');
			expect(args).toContain('--json');
		});

		it('passes prompt as positional arg after exec', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ prompt: 'test prompt' }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			const execIdx = args.indexOf('exec');
			// Prompt should be after 'exec'
			expect(args[execIdx + 1]).toBe('test prompt');
		});

		it('passes -m flag when model is specified', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ model: 'astra' }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			const modelIdx = args.indexOf('-m');
			expect(modelIdx).toBeGreaterThan(-1);
			expect(args[modelIdx + 1]).toBe('astra');
		});

		it('passes --auto when skipPermissions is true', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ skipPermissions: true }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args).toContain('--auto');
		});

		it('does NOT pass --auto when skipPermissions is false', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ skipPermissions: false }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args).not.toContain('--auto');
		});

		it('returns stdout, stderr, exitCode', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions());

			setImmediate(() => {
				const stdout = (mockProcess as unknown as Record<string, EventEmitter>)['stdout'];
				stdout.emit('data', Buffer.from('hello'));
				const stderr = (mockProcess as unknown as Record<string, EventEmitter>)['stderr'];
				stderr.emit('data', Buffer.from('warn'));
				(mockProcess as EventEmitter).emit('exit', 0);
			});

			const result = await resultPromise;
			expect(result.stdout).toBe('hello');
			expect(result.stderr).toBe('warn');
			expect(result.exitCode).toBe(0);
		});

		it('parses JSONL output and emits events', async () => {
			const onStreamEvent = vi.fn();
			const resultPromise = provider.launchBackground(makeBaseOptions({ onStreamEvent }));

			setImmediate(() => {
				const stdout = (mockProcess as unknown as Record<string, EventEmitter>)['stdout'];
				// Emit step_start
				stdout.emit(
					'data',
					Buffer.from(
						JSON.stringify({
							type: 'step_start',
							timestamp: Date.now(),
							sessionID: 'test-session',
							part: { type: 'step-start', messageID: 'msg-1', sessionID: 'test-session' },
						}) + '\n'
					)
				);
				// Emit text
				stdout.emit(
					'data',
					Buffer.from(
						JSON.stringify({
							type: 'text',
							timestamp: Date.now(),
							sessionID: 'test-session',
							part: { type: 'text', text: 'hello' },
						}) + '\n'
					)
				);
				// Emit step_finish
				stdout.emit(
					'data',
					Buffer.from(
						JSON.stringify({
							type: 'step_finish',
							timestamp: Date.now(),
							sessionID: 'test-session',
							part: {
								type: 'step-finish',
								reason: 'stop',
								messageID: 'msg-1',
								sessionID: 'test-session',
								tokens: { input: 10, output: 5 },
								cost: 0.001,
							},
						}) + '\n'
					)
				);
				(mockProcess as EventEmitter).emit('exit', 0);
			});

			await resultPromise;

			// Check that events were emitted
			expect(onStreamEvent).toHaveBeenCalled();
			const calls = onStreamEvent.mock.calls;
			// Should have: init, text, result
			expect(calls.length).toBeGreaterThanOrEqual(2);
			expect(calls.some((c: unknown[]) => (c[0] as Record<string, unknown>)['type'] === 'system')).toBe(true);
			expect(calls.some((c: unknown[]) => (c[0] as Record<string, unknown>)['type'] === 'text')).toBe(true);
		});
	});

	// -------------------------------------------------------------------------
	// launchInteractive
	// -------------------------------------------------------------------------

	describe('launchInteractive', () => {
		it('spawns codex exec in interactive mode', async () => {
			const resultPromise = provider.launchInteractive(makeBaseOptions());

			setImmediate(() => {
				(mockProcess as EventEmitter).emit('exit', 0);
			});

			await resultPromise;

			expect(child_process.spawn).toHaveBeenCalled();
			const spawnCall = vi.mocked(child_process.spawn).mock.calls[0];
			// stdio should be 'inherit' for interactive
			expect(spawnCall[2]).toMatchObject({ stdio: 'inherit' });
		});
	});

	// -------------------------------------------------------------------------
	// kill
	// -------------------------------------------------------------------------

	describe('kill', () => {
		it('kills the spawned process', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions());

			// Wait for spawn
			await new Promise(resolve => setImmediate(resolve));

			provider.kill();

			expect(mockProcess.kill).toHaveBeenCalled();

			// Complete the promise
			(mockProcess as EventEmitter).emit('exit', 0);
			await resultPromise;
		});

		it('does not throw if no process is running', () => {
			expect(() => provider.kill()).not.toThrow();
		});
	});

	// -------------------------------------------------------------------------
	// Validation
	// -------------------------------------------------------------------------

	describe('validation', () => {
		it('throws PromptTooLargeError when prompt exceeds 32KB', async () => {
			const largePrompt = 'a'.repeat(33 * 1024);
			await expect(provider.launchBackground(makeBaseOptions({ prompt: largePrompt }))).rejects.toThrow(
				'Prompt too large'
			);
		});
	});

	// -------------------------------------------------------------------------
	// MCP servers
	// -------------------------------------------------------------------------

	describe('mcpServers', () => {
		it('sets CODEX_CONFIG_CONTENT env var when mcpServers provided', async () => {
			const resultPromise = provider.launchBackground(
				makeBaseOptions({
					mcpServers: [
						{
							name: 'test-server',
							command: ['node', 'test.js'],
						},
					],
				})
			);

			setImmediate(() => {
				(mockProcess as EventEmitter).emit('exit', 0);
			});

			await resultPromise;

			const spawnCall = vi.mocked(child_process.spawn).mock.calls[0];
			const env = spawnCall[2]?.env as Record<string, string>;
			expect(env['CODEX_CONFIG_CONTENT']).toBeDefined();
			expect(env['CODEX_CONFIG_CONTENT']).toContain('test-server');
		});
	});
});
