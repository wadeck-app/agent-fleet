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
import { killProcessTree } from './ProcessTreeKiller';

vi.mock('child_process');
vi.mock('./ProcessTreeKiller');
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
		readFileSync: vi.fn(actual.readFileSync),
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

	const originalMockPath = process.env['CODEX_MOCK_PATH'];

	beforeEach(() => {
		// Pins the command: otherwise the Windows where.exe lookup runs and falls back to a shell
		process.env['CODEX_MOCK_PATH'] = '/mock/codex';
		provider = new CodexModelProvider();
		mockProcess = makeMockProcess();
		vi.mocked(child_process.spawn).mockReturnValue(mockProcess);
		vi.mocked(child_process.execSync).mockReturnValue(Buffer.from('codex'));
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (originalMockPath === undefined) delete process.env['CODEX_MOCK_PATH'];
		else process.env['CODEX_MOCK_PATH'] = originalMockPath;
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

		// A prompt starting with "-" (a markdown bullet) was read by codex as a flag:
		// `codex exec "- hi"` exits 2 with "unexpected argument". Everything after `--` is positional.
		it('passes the prompt last, after a -- separator', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ prompt: '- a bullet prompt' }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args.slice(-2)).toEqual(['--', '- a bullet prompt']);
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

		// Codex has no `--tools` allow-list; CodexToolPolicy maps what it can and refuses the rest.
		describe('tools', () => {
			async function argsFor(overrides: Partial<LaunchOptions>): Promise<string[]> {
				const resultPromise = provider.launchBackground(makeBaseOptions(overrides));
				setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
				await resultPromise;
				return vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			}

			it('excluding write and edit selects the read-only sandbox, leaving the shell available', async () => {
				vi.spyOn(console, 'warn').mockImplementation(() => undefined);
				const args = await argsFor({ tools: ['read', 'glob', 'grep', 'bash', 'webfetch', 'websearch'] });

				expect(args.slice(args.indexOf('--sandbox'), args.indexOf('--sandbox') + 2)).toEqual([
					'--sandbox',
					'read-only',
				]);
				expect(args).not.toContain('--disable');
			});

			it('excluding bash removes the shell tool', async () => {
				const args = await argsFor({
					tools: ['read', 'write', 'edit', 'glob', 'grep', 'webfetch', 'websearch', 'task', 'todowrite'],
				});

				expect(args.slice(args.indexOf('--disable'), args.indexOf('--disable') + 2)).toEqual([
					'--disable',
					'shell_tool',
				]);
				expect(args).not.toContain('--sandbox');
			});

			it('excluding both web tools turns web search off', async () => {
				vi.spyOn(console, 'warn').mockImplementation(() => undefined);
				const args = await argsFor({ tools: ['read', 'write', 'edit', 'bash', 'glob', 'grep'] });

				expect(args).toContain('web_search="disabled"');
			});

			it('sends no restriction flag when tools is not set', async () => {
				const args = await argsFor({});

				expect(args).not.toContain('--sandbox');
				expect(args).not.toContain('--disable');
				expect(args.join(' ')).not.toContain('web_search');
			});

			// Real codex rejects `--approve-for-me --sandbox ...` together (exit 2, "cannot be used with").
			it('sends --sandbox read-only WITHOUT --approve-for-me when both are requested', async () => {
				vi.spyOn(console, 'warn').mockImplementation(() => undefined);
				const args = await argsFor({ tools: ['read', 'bash'], skipPermissions: true });

				expect(args).toContain('--sandbox');
				expect(args).not.toContain('--approve-for-me');
			});

			it('warns, instead of staying silent, about exclusions codex cannot enforce', async () => {
				const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
				await argsFor({ tools: ['read', 'write', 'edit', 'bash', 'glob', 'grep', 'webfetch', 'websearch'] });

				expect(warn).toHaveBeenCalledWith(expect.stringContaining("excludes 'task'"));
				expect(warn).toHaveBeenCalledWith(expect.stringContaining("excludes 'todowrite'"));
			});

			it('throws, rather than under-restricting, when only one of write/edit is excluded', async () => {
				await expect(provider.launchBackground(makeBaseOptions({ tools: ['read', 'write'] }))).rejects.toThrow(
					/single apply_patch tool/
				);
				expect(child_process.spawn).not.toHaveBeenCalled();
			});
		});

		// `exec resume` accepts neither --sandbox nor --approve-for-me (verified: exit 2 "unexpected
		// argument"), so the same settings travel as -c overrides there.
		describe('resume + permissions', () => {
			async function resumeArgs(overrides: Partial<LaunchOptions>): Promise<string[]> {
				const resultPromise = provider.launchBackground(
					makeBaseOptions({ resumeSessionId: 'abc-123', ...overrides })
				);
				setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
				await resultPromise;
				return vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			}

			it('skipPermissions becomes config overrides, not --approve-for-me', async () => {
				const args = await resumeArgs({ skipPermissions: true });

				expect(args).not.toContain('--approve-for-me');
				expect(args).not.toContain('--sandbox');
				expect(args).toContain('sandbox_mode="workspace-write"');
				expect(args).toContain('approval_policy="on-request"');
				expect(args).toContain('approvals_reviewer="auto_review"');
			});

			it('a read-only tools restriction becomes -c sandbox_mode, not --sandbox', async () => {
				vi.spyOn(console, 'warn').mockImplementation(() => undefined);
				const args = await resumeArgs({ tools: ['read'], skipPermissions: true });

				expect(args).not.toContain('--sandbox');
				expect(args).not.toContain('--approve-for-me');
				expect(args).toContain('sandbox_mode="read-only"');
				expect(args).not.toContain('sandbox_mode="workspace-write"');
			});
		});

		// Resuming is a subcommand (`codex exec resume <id> [prompt]`), not a flag. The old
		// `--resume <id>` form is rejected outright.
		it('resumes through the exec subcommand, with the session id right after it', async () => {
			const resultPromise = provider.launchBackground(
				makeBaseOptions({ prompt: 'continue please', resumeSessionId: 'abc-123' })
			);
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args).toEqual([
				'exec',
				'resume',
				'abc-123',
				'--json',
				'--skip-git-repo-check',
				'--',
				'continue please',
			]);
			expect(args).not.toContain('--resume');
		});

		it('keeps the plain exec form when no session is being resumed', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ prompt: 'fresh start' }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args).toEqual(['exec', '--json', '--skip-git-repo-check', '--', 'fresh start']);
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

		// Shapes captured from a real codex-cli 0.163.0 run against a stdio MCP server and an
		// apply_patch call (see StepRunner.codex.integration.test.ts).
		it('maps mcp_tool_call and file_change items to tool_use events', async () => {
			const onStreamEvent = vi.fn();
			const resultPromise = provider.launchBackground(makeBaseOptions({ onStreamEvent }));
			const lines = [
				{ type: 'thread.started', thread_id: 't-1' },
				{
					type: 'item.completed',
					item: {
						id: 'item_2',
						type: 'mcp_tool_call',
						server: 'echo',
						tool: 'echo_tool',
						arguments: { text: 'ping' },
						result: { content: [{ type: 'text', text: 'ECHO[M1]: ping' }], structured_content: null },
						error: null,
						status: 'completed',
					},
				},
				{
					type: 'item.completed',
					item: {
						id: 'item_3',
						type: 'mcp_tool_call',
						server: 'echo',
						tool: 'fail_tool',
						arguments: {},
						result: null,
						error: { message: 'MCP tool call requires approval, but approval policy is never' },
						status: 'failed',
					},
				},
				{
					type: 'item.completed',
					item: {
						id: 'item_4',
						type: 'file_change',
						changes: [{ path: 'C:\\w\\note.txt', kind: 'add' }],
						status: 'completed',
					},
				},
			];
			setImmediate(() => {
				const stdout = (mockProcess as unknown as Record<string, EventEmitter>)['stdout'];
				stdout.emit('data', Buffer.from(lines.map(l => JSON.stringify(l)).join('\n') + '\n'));
				(mockProcess as EventEmitter).emit('exit', 0);
			});
			await resultPromise;

			const toolEvents = onStreamEvent.mock.calls
				.map((c: unknown[]) => c[0] as { type: string; data: Record<string, unknown> })
				.filter(e => e.type === 'tool_use')
				.map(e => e.data);
			expect(toolEvents).toEqual([
				{
					tool: 'mcp__echo__echo_tool',
					callID: 'item_2',
					input: { text: 'ping' },
					output: 'ECHO[M1]: ping',
					status: 'completed',
				},
				{
					tool: 'mcp__echo__fail_tool',
					callID: 'item_3',
					input: {},
					output: 'error: MCP tool call requires approval, but approval policy is never',
					status: 'failed',
				},
				{
					tool: 'apply_patch',
					callID: 'item_4',
					input: { changes: [{ path: 'C:\\w\\note.txt', kind: 'add' }] },
					output: 'add C:\\w\\note.txt',
					status: 'completed',
				},
			]);
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
		async function interactiveArgs(overrides: Partial<LaunchOptions> = {}): Promise<string[]> {
			const resultPromise = provider.launchInteractive(makeBaseOptions(overrides));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;
			return vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
		}

		it('inherits stdio', async () => {
			await interactiveArgs();

			expect(vi.mocked(child_process.spawn).mock.calls[0][2]).toMatchObject({ stdio: 'inherit' });
		});

		// Interactive means the TUI (`codex [PROMPT]`), not `codex exec --json` dumping JSONL on the
		// terminal. The TUI has neither --json nor --skip-git-repo-check (not in `codex --help`).
		it('launches the TUI, not exec, without the exec-only flags', async () => {
			const args = await interactiveArgs({ prompt: 'hello' });

			expect(args).toEqual(['--', 'hello']);
		});

		it('resumes with the top-level resume subcommand and keeps native permission flags', async () => {
			const args = await interactiveArgs({ resumeSessionId: 'abc-123', skipPermissions: true });

			expect(args).toEqual(['resume', 'abc-123', '--approve-for-me', '--', 'do something']);
		});
	});

	// -------------------------------------------------------------------------
	// CODEX_MOCK_PATH
	// -------------------------------------------------------------------------

	describe('CODEX_MOCK_PATH', () => {
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
		it('kills the spawned process and its descendants', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions());

			// Wait for spawn
			await new Promise(resolve => setImmediate(resolve));

			provider.kill();

			expect(killProcessTree).toHaveBeenCalledWith(1234);

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
	// Options codex cannot honour: loud failure, never silently weaker
	// -------------------------------------------------------------------------

	describe('unsupported options', () => {
		it('rejects a step-level permission override (opencode-only) with an actionable message', async () => {
			await expect(
				provider.launchBackground(makeBaseOptions({ permission: { external_directory: 'allow' } }))
			).rejects.toThrow(/'permission' \(external_directory\) is an opencode feature.*skipPermissions/);
			expect(child_process.spawn).not.toHaveBeenCalled();
		});

		it('accepts an empty permission object, which asks for nothing', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ permission: {} }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await expect(resultPromise).resolves.toMatchObject({ exitCode: 0 });
		});

		it("rejects session.mode 'compact' (autoCompact)", async () => {
			await expect(provider.launchBackground(makeBaseOptions({ autoCompact: true }))).rejects.toThrow(
				/session\.mode 'compact' is not supported by codex.*'append'/
			);
			expect(child_process.spawn).not.toHaveBeenCalled();
		});

		it('rejects the same options for the interactive launch', async () => {
			await expect(provider.launchInteractive(makeBaseOptions({ autoCompact: true }))).rejects.toThrow(
				/not supported by codex/
			);
		});
	});

	// -------------------------------------------------------------------------
	// Environment
	// -------------------------------------------------------------------------

	describe('environment', () => {
		it('forwards options.env and the infrastructure variables, and no codex/opencode config variables', async () => {
			const resultPromise = provider.launchBackground(
				makeBaseOptions({
					env: { MY_FLAG: '1' },
					mcpServers: [{ name: 'srv', command: ['node', 'srv.js'] }],
				})
			);
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const env = vi.mocked(child_process.spawn).mock.calls[0][2]?.env as Record<string, string>;
			expect(env['MY_FLAG']).toBe('1');
			expect(env['PATH']).toBe(process.env['PATH']);
			// Not read by codex: it has no config-by-env, and its home is CODEX_HOME rather than XDG.
			for (const key of ['CODEX_CONFIG', 'CODEX_CONFIG_CONTENT', 'OPENCODE_CONFIG', 'OPENCODE_CONFIG_CONTENT']) {
				expect(env).not.toHaveProperty(key);
			}
			expect(env).not.toHaveProperty('XDG_CONFIG_HOME');
			// CODEX_HOME holds auth, model provider settings and sessions: it must stay the user's
			expect(env).not.toHaveProperty('CODEX_HOME');
		});

		it('does not leak unrelated process env variables', async () => {
			process.env['SOME_SECRET_FOR_TEST'] = 'leak';
			try {
				const resultPromise = provider.launchBackground(makeBaseOptions());
				setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
				await resultPromise;

				const env = vi.mocked(child_process.spawn).mock.calls[0][2]?.env as Record<string, string>;
				expect(env).not.toHaveProperty('SOME_SECRET_FOR_TEST');
			} finally {
				delete process.env['SOME_SECRET_FOR_TEST'];
			}
		});
	});

	// -------------------------------------------------------------------------
	// MCP servers
	// -------------------------------------------------------------------------

	describe('mcpServers', () => {
		it('registers each server through -c mcp_servers.* overrides, with required and approve', async () => {
			const resultPromise = provider.launchBackground(
				makeBaseOptions({
					mcpServers: [
						{
							name: 'test-server',
							command: ['node', 'C:\\path\\test.js', '--flag'],
							env: { API_KEY: 'a "quoted" value' },
							cwd: 'C:\\work',
						},
					],
				})
			);
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			const overrides = args.filter((_, i) => args[i - 1] === '-c');
			expect(overrides).toEqual([
				'mcp_servers.test-server.command="node"',
				'mcp_servers.test-server.args=["C:\\\\path\\\\test.js", "--flag"]',
				'mcp_servers.test-server.env={ "API_KEY" = "a \\"quoted\\" value" }',
				'mcp_servers.test-server.cwd="C:\\\\work"',
				'mcp_servers.test-server.required=true',
				'mcp_servers.test-server.default_tools_approval_mode="approve"',
			]);
		});

		it('does not mark a disabled server required', async () => {
			const resultPromise = provider.launchBackground(
				makeBaseOptions({ mcpServers: [{ name: 'off', command: ['node'], enabled: false }] })
			);
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args).toContain('mcp_servers.off.enabled=false');
			expect(args).not.toContain('mcp_servers.off.required=true');
		});

		it('passes no mcp override when there are no servers', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ mcpServers: [] }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args.join(' ')).not.toContain('mcp_servers');
		});
	});

	// -------------------------------------------------------------------------
	// Tool hooks
	// -------------------------------------------------------------------------

	describe('toolHooks', () => {
		it('registers the hook script and ALWAYS trusts it (codex silently skips untrusted hooks)', async () => {
			const resultPromise = provider.launchBackground(
				makeBaseOptions({
					toolHooks: [
						{ timing: 'before', action: { type: 'deny', reason: 'no rm', toolPattern: 'bash' } },
						{ timing: 'after', action: { type: 'log' } },
					],
				})
			);
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args).toContain('--dangerously-bypass-hook-trust');
			const hookOverrides = args.filter(a => a.startsWith('hooks.'));
			expect(hookOverrides).toHaveLength(2);
			expect(hookOverrides[0]).toMatch(
				/^hooks\.PreToolUse=\[\{ matcher = "\*", hooks = \[\{ type = "command", command = "node \\"[^"]*hook\.cjs\\" pre"/
			);
			expect(hookOverrides[1]).toMatch(/^hooks\.PostToolUse=.*hook\.cjs\\" post"/);
			// The script is written before spawn and removed afterwards
			expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringMatching(/hook\.cjs$/), expect.any(String), {
				encoding: 'utf8',
			});
			expect(fs.rmSync).toHaveBeenCalledWith(expect.stringContaining('codex-run-'), {
				recursive: true,
				force: true,
			});
		});

		it('appends the lines the log hooks wrote to the returned stderr', async () => {
			vi.mocked(fs.readFileSync).mockReturnValueOnce('[tool-use] Bash {"command":"ls"}\n');
			const resultPromise = provider.launchBackground(
				makeBaseOptions({ toolHooks: [{ timing: 'before', action: { type: 'log' } }] })
			);
			setImmediate(() => {
				(mockProcess as unknown as Record<string, EventEmitter>)['stderr'].emit('data', Buffer.from('warn'));
				(mockProcess as EventEmitter).emit('exit', 0);
			});

			const result = await resultPromise;
			expect(result.stderr).toBe('warn\n[tool-use] Bash {"command":"ls"}');
		});

		it('does not pass the trust bypass when the step has no hooks', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ toolHooks: [] }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args).not.toContain('--dangerously-bypass-hook-trust');
			expect(args.join(' ')).not.toContain('hooks.');
		});

		it("warns about, and does not register, a deny hook with timing 'after'", async () => {
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
			const resultPromise = provider.launchBackground(
				makeBaseOptions({ toolHooks: [{ timing: 'after', action: { type: 'deny', reason: 'late' } }] })
			);
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining("'deny' tool hook with timing 'after' was ignored")
			);
			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args).not.toContain('--dangerously-bypass-hook-trust');
		});
	});
});
