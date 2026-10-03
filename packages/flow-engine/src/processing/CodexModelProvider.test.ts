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

		// `--auto` does not exist in codex: the flag for approving without prompting is
		// `--approve-for-me`, which keeps the workspace-write sandbox. Sending `--auto` made
		// codex exit on a usage error, so every skipPermissions step failed.
		it('passes --approve-for-me when skipPermissions is true', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ skipPermissions: true }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args).toContain('--approve-for-me');
			expect(args).not.toContain('--auto');
		});

		it('does NOT pass an approval flag when skipPermissions is false', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ skipPermissions: false }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args).not.toContain('--approve-for-me');
			expect(args).not.toContain('--auto');
		});

		// Codex has no per-tool allow-list, only a sandbox level. Excluding both write and bash
		// is the one case that maps faithfully to --sandbox read-only.
		describe('tools (--sandbox fallback)', () => {
			it('passes --sandbox read-only when tools excludes both write and bash', async () => {
				const resultPromise = provider.launchBackground(makeBaseOptions({ tools: ['read'] }));
				setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
				await resultPromise;

				const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
				const idx = args.indexOf('--sandbox');
				expect(idx).toBeGreaterThanOrEqual(0);
				expect(args[idx + 1]).toBe('read-only');
			});

			it('does not pass --sandbox when tools includes write', async () => {
				const resultPromise = provider.launchBackground(makeBaseOptions({ tools: ['read', 'write'] }));
				setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
				await resultPromise;

				const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
				expect(args).not.toContain('--sandbox');
			});

			it('does not pass --sandbox when tools is not set', async () => {
				const resultPromise = provider.launchBackground(makeBaseOptions());
				setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
				await resultPromise;

				const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
				expect(args).not.toContain('--sandbox');
			});
		});

		// Resuming is a subcommand now (`codex exec resume <id> [prompt]`), not a flag. The old
		// `--resume <id>` form is rejected outright.
		it('resumes through the exec subcommand, with the session id before the prompt', async () => {
			const resultPromise = provider.launchBackground(
				makeBaseOptions({ prompt: 'continue please', resumeSessionId: 'abc-123' })
			);
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args.slice(0, 4)).toEqual(['exec', 'resume', 'abc-123', 'continue please']);
			expect(args).not.toContain('--resume');
		});

		it('keeps the plain exec form when no session is being resumed', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ prompt: 'fresh start' }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args.slice(0, 2)).toEqual(['exec', 'fresh start']);
			expect(args).not.toContain('resume');
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
	// CODEX_MOCK_PATH
	// -------------------------------------------------------------------------

	describe('CODEX_MOCK_PATH', () => {
		afterEach(() => {
			delete process.env['CODEX_MOCK_PATH'];
		});

		it('uses CODEX_MOCK_PATH from options.env (per-step mock-config overlay) even when unset in process.env', async () => {
			delete process.env['CODEX_MOCK_PATH'];

			const resultPromise = provider.launchBackground(
				makeBaseOptions({ env: { CODEX_MOCK_PATH: '/custom/per-step-mock' } })
			);
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const [spawnCommand] = vi.mocked(child_process.spawn).mock.calls[0] as unknown as [string, string[]];
			expect(spawnCommand).toBe('/custom/per-step-mock');
		});

		it('prefers options.env CODEX_MOCK_PATH over process.env when both are set', async () => {
			process.env['CODEX_MOCK_PATH'] = '/from/process-env';

			const resultPromise = provider.launchBackground(
				makeBaseOptions({ env: { CODEX_MOCK_PATH: '/from/options-env' } })
			);
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const [spawnCommand] = vi.mocked(child_process.spawn).mock.calls[0] as unknown as [string, string[]];
			expect(spawnCommand).toBe('/from/options-env');
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
