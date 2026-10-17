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

			// Real codex rejects `--approve-for-me --sandbox ...` together (exit 2, "cannot be used with").
			it('sends --sandbox read-only WITHOUT --approve-for-me when both are requested', async () => {
				const resultPromise = provider.launchBackground(
					makeBaseOptions({ tools: ['read'], skipPermissions: true })
				);
				setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
				await resultPromise;

				const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
				expect(args).toContain('--sandbox');
				expect(args).not.toContain('--approve-for-me');
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

		// Real `codex exec --json` shapes captured from codex-cli 0.163.0 (no cost field exists).
		it('parses real codex JSONL: thread id, agent_message, command_execution, usage', async () => {
			const onStreamEvent = vi.fn();
			const resultPromise = provider.launchBackground(makeBaseOptions({ onStreamEvent }));
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

			const lines = [
				{ type: 'thread.started', thread_id: '01a14a23-e936-7571-9110-f15a92322574' },
				{
					type: 'item.completed',
					item: {
						id: 'item_0',
						type: 'error',
						message: 'Codex is ignoring 1 unrecognized configuration setting.',
					},
				},
				{ type: 'turn.started' },
				{
					type: 'item.started',
					item: {
						id: 'item_2',
						type: 'command_execution',
						command: 'cat f.txt',
						aggregated_output: '',
						exit_code: null,
						status: 'in_progress',
					},
				},
				{
					type: 'item.completed',
					item: {
						id: 'item_2',
						type: 'command_execution',
						command: 'cat f.txt',
						aggregated_output: 'hello-content\r\n',
						exit_code: 0,
						status: 'completed',
					},
				},
				{ type: 'item.completed', item: { id: 'item_3', type: 'agent_message', text: 'hello-content' } },
				{
					type: 'turn.completed',
					usage: {
						input_tokens: 21405,
						cached_input_tokens: 10583,
						cache_write_input_tokens: 10738,
						output_tokens: 111,
						reasoning_output_tokens: 42,
					},
				},
			];
			setImmediate(() => {
				const stdout = (mockProcess as unknown as Record<string, EventEmitter>)['stdout'];
				stdout.emit('data', Buffer.from(lines.map(l => JSON.stringify(l)).join('\n') + '\n'));
				(mockProcess as EventEmitter).emit('exit', 0);
			});

			const result = await resultPromise;
			expect(result.stderr).toBe('');

			const events = onStreamEvent.mock.calls.map((c: unknown[]) => c[0] as Record<string, unknown>);
			expect(events.map(e => e['type'])).toEqual(['system', 'tool_use', 'text', 'result']);
			expect(events[0]['data']).toMatchObject({ session_id: '01a14a23-e936-7571-9110-f15a92322574' });
			expect(events[1]['data']).toEqual({
				tool: 'command_execution',
				callID: 'item_2',
				input: { command: 'cat f.txt' },
				output: 'hello-content\r\n',
				status: 'completed',
			});
			expect(events[2]['data']).toEqual({ text: 'hello-content' });
			expect(events[3]['data']).toMatchObject({
				result: 'hello-content',
				cost_usd: 0,
				modelUsage: { codex: { inputTokens: 21405, outputTokens: 111 } },
			});
			// The non-fatal config warning item is surfaced, not swallowed.
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignoring 1 unrecognized configuration'));
		});

		it('puts the turn.failed message in stderr so the failure is actionable', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions());
			setImmediate(() => {
				const stdout = (mockProcess as unknown as Record<string, EventEmitter>)['stdout'];
				const lines = [
					{ type: 'thread.started', thread_id: 't-1' },
					{ type: 'turn.started' },
					{ type: 'error', message: 'Reconnecting... 1/5 (unexpected status 404 Not Found)' },
					{ type: 'turn.failed', error: { message: "The model 'nope' does not exist" } },
				];
				stdout.emit('data', Buffer.from(lines.map(l => JSON.stringify(l)).join('\n') + '\n'));
				(mockProcess as EventEmitter).emit('exit', 1);
			});

			const result = await resultPromise;
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("codex: The model 'nope' does not exist");
		});

		it('warns loudly on an unrecognized event type instead of silently ignoring it', async () => {
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
			const resultPromise = provider.launchBackground(makeBaseOptions());
			setImmediate(() => {
				const stdout = (mockProcess as unknown as Record<string, EventEmitter>)['stdout'];
				stdout.emit('data', Buffer.from('{"type":"step_start"}\n'));
				(mockProcess as EventEmitter).emit('exit', 0);
			});
			await resultPromise;
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('unrecognized codex event "step_start"'));
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
