/**
 * OpenCodeModelProvider Tests
 *
 * Tests that OpenCodeModelProvider correctly spawns opencode CLI,
 * handles MCP config serialization, validates inputs, and implements kill().
 */
import * as child_process from 'child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PromptTooLargeError } from './ModelProvider';
import type { LaunchOptions } from './ModelProvider';
import { OpenCodeModelProvider } from './OpenCodeModelProvider';
import type { StreamJsonEvent } from './StreamJsonParser';

vi.mock('child_process');
vi.mock('node:fs', async () => {
	const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
	return {
		...actual,
		writeFileSync: vi.fn(),
		chmodSync: vi.fn(),
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
	(proc as unknown as Record<string, unknown>).pid = 5678;
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

describe('OpenCodeModelProvider', () => {
	let provider: OpenCodeModelProvider;
	let mockProcess: child_process.ChildProcess;

	beforeEach(() => {
		provider = new OpenCodeModelProvider();
		mockProcess = makeMockProcess();
		vi.mocked(child_process.spawn).mockReturnValue(mockProcess);
		vi.clearAllMocks();
		vi.mocked(child_process.spawn).mockReturnValue(mockProcess);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// -------------------------------------------------------------------------
	// Command structure
	// -------------------------------------------------------------------------

	describe('command structure', () => {
		it('spawns "opencode run" as command', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions());
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const [command, args] = vi.mocked(child_process.spawn).mock.calls[0] as unknown as [string, string[]];
			expect(command).toBe('opencode');
			expect(args[0]).toBe('run');
		});

		it('passes prompt as positional arg (2nd position)', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ prompt: 'hello world' }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args[1]).toBe('hello world');
		});

		it('always includes --format json', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions());
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			const idx = args.indexOf('--format');
			expect(idx).toBeGreaterThan(-1);
			expect(args[idx + 1]).toBe('json');
		});

		it('does NOT include --auto when skipPermissions is not set (default: false)', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions());
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args).not.toContain('--auto');
		});

		it('includes --auto when skipPermissions is explicitly true', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ skipPermissions: true }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args).toContain('--auto');
		});

		it('omits --auto when skipPermissions is false', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ skipPermissions: false }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			expect(args).not.toContain('--auto');
		});

		it('passes -m model when model is specified', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ model: 'anthropic/claude-3-5-haiku' }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const args = vi.mocked(child_process.spawn).mock.calls[0][1] as string[];
			const mIdx = args.indexOf('-m');
			expect(mIdx).toBeGreaterThan(-1);
			expect(args[mIdx + 1]).toBe('anthropic/claude-3-5-haiku');
		});

		it('uses shell:false when OPENCODE_MOCK_PATH is set (mock path is always direct, no shell)', async () => {
			// OPENCODE_MOCK_PATH is set to a plain string (not .mjs) in beforeEach via the test env.
			// findOpenCodeCommand() returns needsShell:false for all mock paths.
			process.env['OPENCODE_MOCK_PATH'] = 'opencode';
			provider = new OpenCodeModelProvider();
			vi.mocked(child_process.spawn).mockReturnValue(mockProcess);

			const resultPromise = provider.launchBackground(makeBaseOptions());
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const opts = vi.mocked(child_process.spawn).mock.calls[0][2] as { shell?: boolean };
			expect(opts.shell).toBe(false);

			delete process.env['OPENCODE_MOCK_PATH'];
		});

		it('returns stdout, stderr, exitCode', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions());

			setImmediate(() => {
				const stdout = (mockProcess as unknown as Record<string, EventEmitter>)['stdout'];
				stdout.emit('data', Buffer.from('{"result":"done"}'));
				const stderr = (mockProcess as unknown as Record<string, EventEmitter>)['stderr'];
				stderr.emit('data', Buffer.from(''));
				(mockProcess as EventEmitter).emit('exit', 0);
			});

			const result = await resultPromise;
			expect(result.stdout).toBe('{"result":"done"}');
			expect(result.exitCode).toBe(0);
		});
	});

	// -------------------------------------------------------------------------
	// PromptTooLargeError
	// -------------------------------------------------------------------------

	describe('PromptTooLargeError', () => {
		it('throws PromptTooLargeError when prompt exceeds 32KB', async () => {
			// 32KB + 1 byte = over limit
			const bigPrompt = 'x'.repeat(32 * 1024 + 1);
			await expect(provider.launchBackground(makeBaseOptions({ prompt: bigPrompt }))).rejects.toBeInstanceOf(
				PromptTooLargeError
			);
		});

		it('does NOT throw for prompt exactly at 32KB', async () => {
			const exactPrompt = 'x'.repeat(32 * 1024);
			const resultPromise = provider.launchBackground(makeBaseOptions({ prompt: exactPrompt }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await expect(resultPromise).resolves.toBeDefined();
		});

		it('PromptTooLargeError carries promptLength and maxLength', async () => {
			const bigPrompt = 'x'.repeat(33000);
			try {
				await provider.launchBackground(makeBaseOptions({ prompt: bigPrompt }));
				expect.fail('should have thrown');
			} catch (err) {
				expect(err).toBeInstanceOf(PromptTooLargeError);
				const e = err as PromptTooLargeError;
				expect(e.promptLength).toBeGreaterThan(32 * 1024);
				expect(e.maxLength).toBe(32 * 1024);
			}
		});
	});

	// -------------------------------------------------------------------------
	// MCP config serialization
	// -------------------------------------------------------------------------

	describe('mcpServers', () => {
		it('sets OPENCODE_CONFIG_CONTENT for small MCP config', async () => {
			const resultPromise = provider.launchBackground(
				makeBaseOptions({
					mcpServers: [
						{
							name: 'flow',
							command: ['node', '/path/mcp.js'],
							env: { FLOW_PORT: '3000' },
						},
					],
				})
			);
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const spawnOpts = vi.mocked(child_process.spawn).mock.calls[0][2] as { env?: Record<string, string> };
			expect(spawnOpts.env?.['OPENCODE_CONFIG_CONTENT']).toBeDefined();

			const config = JSON.parse(spawnOpts.env!['OPENCODE_CONFIG_CONTENT']!) as {
				mcp: Record<
					string,
					{ type: string; command: string[]; environment?: Record<string, string>; enabled: boolean }
				>;
			};
			// OpenCode config format: mcp.<name>.type="local", command=[...], environment={...}, enabled
			expect(config.mcp['flow']).toMatchObject({
				type: 'local',
				command: ['node', '/path/mcp.js'],
				environment: { FLOW_PORT: '3000' },
				enabled: true,
			});
		});

		it('does NOT set OPENCODE_CONFIG_CONTENT when mcpServers is empty', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ mcpServers: [] }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const spawnOpts = vi.mocked(child_process.spawn).mock.calls[0][2] as { env?: Record<string, string> };
			expect(spawnOpts.env?.['OPENCODE_CONFIG_CONTENT']).toBeUndefined();
			expect(spawnOpts.env?.['OPENCODE_CONFIG']).toBeUndefined();
		});

		it('uses OPENCODE_CONFIG temp file when config JSON exceeds threshold', async () => {
			// Inject a tiny threshold so a single realistic server triggers the fallback.
			provider = new OpenCodeModelProvider({ maxInlineConfigBytes: 10 });
			vi.mocked(child_process.spawn).mockReturnValue(mockProcess);
			const resultPromise = provider.launchBackground(
				makeBaseOptions({
					mcpServers: [{ name: 'my-tool', command: ['npx', 'my-mcp-server'] }],
				})
			);
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const spawnOpts = vi.mocked(child_process.spawn).mock.calls[0][2] as { env?: Record<string, string> };
			// Should use OPENCODE_CONFIG file path, not inline
			expect(spawnOpts.env?.['OPENCODE_CONFIG']).toBeDefined();
			expect(spawnOpts.env?.['OPENCODE_CONFIG']).toContain(os.tmpdir());
			expect(spawnOpts.env?.['OPENCODE_CONFIG_CONTENT']).toBeUndefined();

			// Temp file should have been written
			expect(fs.writeFileSync).toHaveBeenCalled();
		});

		it('deletes OPENCODE_CONFIG temp file in finally even on error', async () => {
			provider = new OpenCodeModelProvider({ maxInlineConfigBytes: 10 });
			vi.mocked(child_process.spawn).mockReturnValue(mockProcess);
			const resultPromise = provider.launchBackground(
				makeBaseOptions({
					mcpServers: [{ name: 'my-tool', command: ['npx', 'my-mcp-server'] }],
				})
			);

			setImmediate(() => {
				(mockProcess as EventEmitter).emit('error', new Error('spawn failed'));
			});

			await resultPromise.catch(() => {});

			expect(fs.unlinkSync).toHaveBeenCalled();
		});
	});

	// -------------------------------------------------------------------------
	// Env isolation
	// -------------------------------------------------------------------------

	describe('env isolation', () => {
		it('does not forward process.env to spawn', async () => {
			process.env['SECRET_TOKEN'] = 'should-not-leak';

			const resultPromise = provider.launchBackground(makeBaseOptions());
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const spawnOpts = vi.mocked(child_process.spawn).mock.calls[0][2] as { env?: Record<string, string> };
			expect(spawnOpts.env?.['SECRET_TOKEN']).toBeUndefined();

			delete process.env['SECRET_TOKEN'];
		});

		it('forwards options.env entries only', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions({ env: { MY_CUSTOM: 'val' } }));
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const spawnOpts = vi.mocked(child_process.spawn).mock.calls[0][2] as { env?: Record<string, string> };
			expect(spawnOpts.env?.['MY_CUSTOM']).toBe('val');
		});

		it('does NOT automatically forward ANTHROPIC_API_KEY (opencode uses its own config)', async () => {
			process.env['ANTHROPIC_API_KEY'] = 'claude-key';

			const resultPromise = provider.launchBackground(makeBaseOptions());
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const spawnOpts = vi.mocked(child_process.spawn).mock.calls[0][2] as { env?: Record<string, string> };
			// OpenCode handles auth via its own config, not via inherited env
			expect(spawnOpts.env?.['ANTHROPIC_API_KEY']).toBeUndefined();

			delete process.env['ANTHROPIC_API_KEY'];
		});
	});

	// -------------------------------------------------------------------------
	// kill()
	// -------------------------------------------------------------------------

	describe('kill()', () => {
		it('does not throw when no process is running', () => {
			expect(() => provider.kill()).not.toThrow();
		});

		it('calls kill() on current process', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions());
			await new Promise(resolve => setImmediate(resolve));

			provider.kill();

			expect((mockProcess as unknown as Record<string, ReturnType<typeof vi.fn>>)['kill']).toHaveBeenCalled();

			(mockProcess as EventEmitter).emit('exit', 1);
			await resultPromise.catch(() => {});
		});

		it('logs warning but does not throw when kill() on process throws', async () => {
			const resultPromise = provider.launchBackground(makeBaseOptions());
			await new Promise(resolve => setImmediate(resolve));

			const killFn = (mockProcess as unknown as Record<string, ReturnType<typeof vi.fn>>)['kill'];
			killFn.mockImplementation(() => {
				throw new Error('EPERM');
			});

			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			expect(() => provider.kill()).not.toThrow();
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining('[OpenCodeModelProvider]'),
				expect.stringContaining('EPERM')
			);

			(mockProcess as EventEmitter).emit('exit', 1);
			await resultPromise.catch(() => {});
		});
	});

	// -------------------------------------------------------------------------
	// NDJSON event parsing / onStreamEvent
	// -------------------------------------------------------------------------

	describe('NDJSON event parsing', () => {
		function emitLines(lines: string[]): void {
			const stdout = (mockProcess as unknown as Record<string, EventEmitter>)['stdout'];
			stdout.emit('data', Buffer.from(lines.join('\n') + '\n'));
		}

		it('fires system:init on first step_start event with session_id and model', async () => {
			const events: StreamJsonEvent[] = [];
			const resultPromise = provider.launchBackground(makeBaseOptions({ onStreamEvent: e => events.push(e) }));

			setImmediate(() => {
				emitLines([
					JSON.stringify({
						type: 'step_start',
						timestamp: 1000,
						sessionID: 'ses_abc123',
						part: { type: 'step-start', messageID: 'm1', sessionID: 'ses_abc123', snapshot: 'x' },
					}),
				]);
				(mockProcess as EventEmitter).emit('exit', 0);
			});

			await resultPromise;

			const initEvent = events.find(e => e.type === 'system');
			expect(initEvent).toBeDefined();
			expect(initEvent?.subtype).toBe('init');
			expect(initEvent?.data['session_id']).toBe('ses_abc123');
			// model defaults to 'opencode' when not specified
			expect(initEvent?.data['model']).toBe('opencode');
		});

		it('uses options.model in system:init when model is provided', async () => {
			const events: StreamJsonEvent[] = [];
			const resultPromise = provider.launchBackground(
				makeBaseOptions({ model: 'anthropic/claude-3-5-haiku', onStreamEvent: e => events.push(e) })
			);

			setImmediate(() => {
				emitLines([
					JSON.stringify({
						type: 'step_start',
						timestamp: 1000,
						sessionID: 'ses_xyz',
						part: { type: 'step-start', messageID: 'm1', sessionID: 'ses_xyz', snapshot: 'x' },
					}),
				]);
				(mockProcess as EventEmitter).emit('exit', 0);
			});

			await resultPromise;

			const initEvent = events.find(e => e.type === 'system');
			expect(initEvent?.data['model']).toBe('anthropic/claude-3-5-haiku');
		});

		it('concatenates multiple text events into the result', async () => {
			const events: StreamJsonEvent[] = [];
			const resultPromise = provider.launchBackground(makeBaseOptions({ onStreamEvent: e => events.push(e) }));

			setImmediate(() => {
				const sessionID = 'ses_multi';
				emitLines([
					JSON.stringify({
						type: 'step_start',
						timestamp: 1000,
						sessionID,
						part: { type: 'step-start', messageID: 'm1', sessionID },
					}),
					JSON.stringify({
						type: 'text',
						timestamp: 1100,
						sessionID,
						part: { type: 'text', text: 'Hello ', time: { start: 1000, end: 1050 } },
					}),
					JSON.stringify({
						type: 'text',
						timestamp: 1200,
						sessionID,
						part: { type: 'text', text: 'World', time: { start: 1100, end: 1150 } },
					}),
					JSON.stringify({
						type: 'step_finish',
						timestamp: 1300,
						sessionID,
						part: {
							type: 'step-finish',
							reason: 'stop',
							messageID: 'm1',
							sessionID,
							tokens: { total: 100, input: 10, output: 5, reasoning: 0, cache: { write: 85, read: 0 } },
							cost: 0.001,
						},
					}),
				]);
				(mockProcess as EventEmitter).emit('exit', 0);
			});

			await resultPromise;

			const resultEvent = events.find(e => e.type === 'result');
			expect(resultEvent?.data['result']).toBe('Hello World');
		});

		it('extracts cost_usd and token counts from step_finish with reason stop', async () => {
			const events: StreamJsonEvent[] = [];
			const resultPromise = provider.launchBackground(makeBaseOptions({ onStreamEvent: e => events.push(e) }));

			setImmediate(() => {
				const sessionID = 'ses_cost';
				emitLines([
					JSON.stringify({
						type: 'step_start',
						timestamp: 1000,
						sessionID,
						part: { type: 'step-start', messageID: 'm1', sessionID },
					}),
					JSON.stringify({
						type: 'step_finish',
						timestamp: 1200,
						sessionID,
						part: {
							type: 'step-finish',
							reason: 'stop',
							messageID: 'm1',
							sessionID,
							tokens: { total: 100, input: 20, output: 8, reasoning: 0, cache: { write: 72, read: 0 } },
							cost: 0.0425,
						},
					}),
				]);
				(mockProcess as EventEmitter).emit('exit', 0);
			});

			await resultPromise;

			const resultEvent = events.find(e => e.type === 'result');
			expect(resultEvent).toBeDefined();
			expect(resultEvent?.data['cost_usd']).toBe(0.0425);
			const usage = resultEvent?.data['modelUsage'] as Record<
				string,
				{ inputTokens: number; outputTokens: number }
			>;
			expect(usage['opencode'].inputTokens).toBe(20);
			expect(usage['opencode'].outputTokens).toBe(8);
		});

		it('does not fire result event when no step_start was seen', async () => {
			const events: StreamJsonEvent[] = [];
			const resultPromise = provider.launchBackground(makeBaseOptions({ onStreamEvent: e => events.push(e) }));

			setImmediate(() => {
				// Only emit a text line (no step_start), then close
				emitLines([
					JSON.stringify({ type: 'text', sessionID: 'ses_x', part: { type: 'text', text: 'orphan' } }),
				]);
				(mockProcess as EventEmitter).emit('exit', 0);
			});

			await resultPromise;

			// text events are still emitted, but no result event should fire
			expect(events.some(e => e.type === 'result')).toBe(false);
		});

		it('does not fire result event when onStreamEvent is not set', async () => {
			// Should not throw — just skip event firing
			const resultPromise = provider.launchBackground(makeBaseOptions());

			setImmediate(() => {
				emitLines([
					JSON.stringify({
						type: 'step_start',
						sessionID: 'ses_y',
						timestamp: 1000,
						part: { type: 'step-start', sessionID: 'ses_y', messageID: 'm1' },
					}),
				]);
				(mockProcess as EventEmitter).emit('exit', 0);
			});

			await expect(resultPromise).resolves.toBeDefined();
		});

		it('does not count cost from step_finish with reason other than stop', async () => {
			const events: StreamJsonEvent[] = [];
			const resultPromise = provider.launchBackground(makeBaseOptions({ onStreamEvent: e => events.push(e) }));

			setImmediate(() => {
				const sessionID = 'ses_nonstop';
				emitLines([
					JSON.stringify({
						type: 'step_start',
						timestamp: 1000,
						sessionID,
						part: { type: 'step-start', messageID: 'm1', sessionID },
					}),
					JSON.stringify({
						type: 'step_finish',
						timestamp: 1200,
						sessionID,
						part: {
							type: 'step-finish',
							reason: 'error',
							messageID: 'm1',
							sessionID,
							tokens: { total: 10, input: 5, output: 2, reasoning: 0, cache: { write: 3, read: 0 } },
							cost: 99.0,
						},
					}),
				]);
				(mockProcess as EventEmitter).emit('exit', 0);
			});

			await resultPromise;

			const resultEvent = events.find(e => e.type === 'result');
			// cost should be 0 since the step_finish reason was 'error', not 'stop'
			expect(resultEvent?.data['cost_usd']).toBe(0);
		});

		it('sums cost and tokens across multiple step_finish stop events', async () => {
			const events: StreamJsonEvent[] = [];
			const resultPromise = provider.launchBackground(makeBaseOptions({ onStreamEvent: e => events.push(e) }));

			setImmediate(() => {
				const sessionID = 'ses_multi_finish';
				emitLines([
					JSON.stringify({
						type: 'step_start',
						timestamp: 1000,
						sessionID,
						part: { type: 'step-start', messageID: 'm1', sessionID },
					}),
					JSON.stringify({
						type: 'step_finish',
						timestamp: 1200,
						sessionID,
						part: {
							type: 'step-finish',
							reason: 'stop',
							messageID: 'm1',
							sessionID,
							tokens: { total: 50, input: 10, output: 5, reasoning: 0, cache: { write: 35, read: 0 } },
							cost: 0.01,
						},
					}),
					JSON.stringify({
						type: 'step_finish',
						timestamp: 1400,
						sessionID,
						part: {
							type: 'step-finish',
							reason: 'stop',
							messageID: 'm2',
							sessionID,
							tokens: { total: 50, input: 15, output: 8, reasoning: 0, cache: { write: 27, read: 0 } },
							cost: 0.02,
						},
					}),
				]);
				(mockProcess as EventEmitter).emit('exit', 0);
			});

			await resultPromise;

			const resultEvent = events.find(e => e.type === 'result');
			expect(resultEvent?.data['cost_usd']).toBeCloseTo(0.03);
			const usage = resultEvent?.data['modelUsage'] as Record<
				string,
				{ inputTokens: number; outputTokens: number }
			>;
			expect(usage['opencode'].inputTokens).toBe(25);
			expect(usage['opencode'].outputTokens).toBe(13);
		});
	});

	// -------------------------------------------------------------------------
	// OPENCODE_MOCK_PATH
	// -------------------------------------------------------------------------

	describe('OPENCODE_MOCK_PATH', () => {
		afterEach(() => {
			delete process.env['OPENCODE_MOCK_PATH'];
		});

		it('uses OPENCODE_MOCK_PATH as command when env var is set', async () => {
			process.env['OPENCODE_MOCK_PATH'] = '/custom/opencode-mock';

			const resultPromise = provider.launchBackground(makeBaseOptions());
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const [spawnCommand] = vi.mocked(child_process.spawn).mock.calls[0] as unknown as [string, string[]];
			expect(spawnCommand).toBe('/custom/opencode-mock');
		});

		it('falls back to "opencode" when OPENCODE_MOCK_PATH is not set and where/which fails', async () => {
			delete process.env['OPENCODE_MOCK_PATH'];
			// child_process is mocked — execSync returns undefined → throws → fallback

			const resultPromise = provider.launchBackground(makeBaseOptions());
			setImmediate(() => (mockProcess as EventEmitter).emit('exit', 0));
			await resultPromise;

			const [spawnCommand] = vi.mocked(child_process.spawn).mock.calls[0] as unknown as [string, string[]];
			expect(spawnCommand).toBe('opencode');
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
						mcpServers: [{ name: 'bad name!', command: ['node'] }],
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
						mcpServers: [{ name: 'srv', command: ['node'], env: { 'bad-key': 'val' } }],
					})
				)
			).rejects.toThrow('must match ^[A-Z_][A-Z0-9_]*$');
		});

		it('throws on invalid model format', async () => {
			await expect(provider.launchBackground(makeBaseOptions({ model: 'bad model!' }))).rejects.toThrow(
				'must match ^[a-zA-Z0-9_./:@-]{1,256}$'
			);
		});

		it('throws on null byte in command', async () => {
			await expect(
				provider.launchBackground(
					makeBaseOptions({
						mcpServers: [{ name: 'srv', command: ['node\x00evil'] }],
					})
				)
			).rejects.toThrow('null bytes or invalid control characters');
		});
	});
});
