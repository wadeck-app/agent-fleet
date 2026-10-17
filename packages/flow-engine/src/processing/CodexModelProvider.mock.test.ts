/**
 * CodexModelProvider against codex-mock.mjs, with nothing in between mocked.
 *
 * The unit tests (CodexModelProvider.test.ts) pin the argument vector. These run the whole provider
 * -> command line -> CLI -> JSONL -> stream events path, so an argument that is well-formed for the
 * provider but ignored or rejected by the CLI shows up. The mock rejects what real codex rejects
 * (unknown flags, --sandbox / --approve-for-me after `exec resume`), parses `-c` values as TOML,
 * really launches the configured MCP server over stdio, and runs command hooks only when they were
 * trusted -- StepRunner.codex.integration.test.ts keeps it honest against the real CLI.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CodexModelProvider } from './CodexModelProvider';
import type { LaunchOptions, McpServer } from './ModelProvider';
import type { StreamJsonEvent } from './StreamJsonParser';

const here = path.dirname(fileURLToPath(import.meta.url));
const MOCK_PATH = path.join(here, '../testing/codex-mock.mjs');
const MCP_SERVER_PATH = path.join(here, '../testing/mcp-echo-server.mjs');

let workDir: string;
let savedMockPath: string | undefined;

beforeAll(() => {
	workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-mock-test-'));
});

afterAll(() => {
	fs.rmSync(workDir, { recursive: true, force: true });
});

beforeEach(() => {
	savedMockPath = process.env['CODEX_MOCK_PATH'];
	process.env['CODEX_MOCK_PATH'] = MOCK_PATH;
});

afterEach(() => {
	if (savedMockPath === undefined) delete process.env['CODEX_MOCK_PATH'];
	else process.env['CODEX_MOCK_PATH'] = savedMockPath;
	vi.restoreAllMocks();
});

function echoServer(overrides: Partial<McpServer> = {}): McpServer {
	return { name: 'echo', command: [process.execPath, MCP_SERVER_PATH], ...overrides };
}

async function run(prompt: string, overrides: Partial<LaunchOptions> = {}) {
	const events: StreamJsonEvent[] = [];
	const result = await new CodexModelProvider().launchBackground({
		workingDir: workDir,
		prompt,
		stepId: 'mock-test',
		onStreamEvent: e => events.push(e),
		...overrides,
	});
	const toolUses = events.filter(e => e.type === 'tool_use').map(e => e.data);
	const finalText = String(events.find(e => e.type === 'result')?.data['result']);
	const sessionId = events.find(e => e.type === 'system')?.data['session_id'] as string | undefined;
	return { result, events, toolUses, finalText, sessionId };
}

describe('CodexModelProvider against codex-mock', () => {
	describe('MCP servers', () => {
		it('starts the server with the configured args, env and cwd', async () => {
			const { result, toolUses, finalText } = await run('use_mcp echo info {}', {
				mcpServers: [
					echoServer({
						command: [process.execPath, MCP_SERVER_PATH, 'first arg', '--flag'],
						env: { MCP_MARK: 'M1' },
						cwd: os.tmpdir(),
					}),
				],
			});

			expect(result.exitCode, result.stderr).toBe(0);
			const info = JSON.parse(finalText) as { argv: string[]; cwd: string; mark: string };
			expect(info.argv).toEqual(['first arg', '--flag']);
			expect(info.mark).toBe('M1');
			expect(fs.realpathSync(info.cwd)).toBe(fs.realpathSync(os.tmpdir()));
			expect(toolUses[0]).toMatchObject({ tool: 'mcp__echo__info', status: 'completed' });
		});

		it('calls a tool without skipPermissions (the provider pre-approves listed servers)', async () => {
			const { toolUses, finalText } = await run('use_mcp echo echo_tool {"text":"ping"}', {
				mcpServers: [echoServer({ env: { MCP_MARK: 'M2' } })],
			});

			expect(finalText).toBe('ECHO[M2]: ping');
			expect(toolUses).toEqual([
				{
					tool: 'mcp__echo__echo_tool',
					callID: 'item_0',
					input: { text: 'ping' },
					output: 'ECHO[M2]: ping',
					status: 'completed',
				},
			]);
		});

		it('also calls a tool in the read-only sandbox', async () => {
			vi.spyOn(console, 'warn').mockImplementation(() => undefined);
			const { toolUses } = await run('use_mcp echo echo_tool {"text":"x"}', {
				mcpServers: [echoServer()],
				tools: ['read'],
			});

			expect(toolUses[0]).toMatchObject({ status: 'completed' });
		});

		it('reports a failing tool call as failed with codex wording', async () => {
			const { toolUses } = await run('use_mcp echo fail_tool {}', { mcpServers: [echoServer()] });

			expect(toolUses[0]).toMatchObject({ status: 'failed' });
			expect(String(toolUses[0]?.['output'])).toContain('Mcp error: -32000: boom from fail_tool');
		});

		it('fails the whole run, with codex wording, when a server cannot start', async () => {
			const { result } = await run('hello', {
				mcpServers: [{ name: 'bad', command: ['definitely-not-a-real-binary-xyz'] }],
			});

			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain('required MCP servers failed to initialize: bad: program not found');
		});

		it('does not start (or require) a disabled server', async () => {
			const { result, finalText } = await run('use_mcp bad echo_tool {}', {
				mcpServers: [{ name: 'bad', command: ['definitely-not-a-real-binary-xyz'], enabled: false }],
			});

			expect(result.exitCode).toBe(0);
			expect(finalText).toContain("MCP server 'bad' is not available");
		});

		it('survives awkward characters in args and env values', async () => {
			const awkward = 'a "quoted" \\ back\\slash, [bracket] {brace} = eq';
			const { finalText } = await run('use_mcp echo info {}', {
				mcpServers: [
					echoServer({ command: [process.execPath, MCP_SERVER_PATH, awkward], env: { MCP_MARK: awkward } }),
				],
			});

			const info = JSON.parse(finalText) as { argv: string[]; mark: string };
			expect(info.argv).toEqual([awkward]);
			expect(info.mark).toBe(awkward);
		});
	});

	describe('tool hooks', () => {
		it('blocks a denied tool call: the command never runs and the reason reaches stderr', async () => {
			const { result, toolUses, finalText } = await run('use_tool', {
				toolHooks: [
					{ timing: 'before', action: { type: 'deny', reason: 'shell is off limits', toolPattern: 'bash' } },
				],
			});

			expect(result.exitCode).toBe(0);
			expect(toolUses).toEqual([]);
			expect(finalText).toContain('blocked by a PreToolUse hook');
			expect(result.stderr).toContain('Command blocked by PreToolUse hook: Tool denied: shell is off limits');
		});

		it('lets a non-matching tool call through', async () => {
			const { toolUses } = await run('use_tool', {
				toolHooks: [{ timing: 'before', action: { type: 'deny', reason: 'r', toolPattern: 'mcp__*' } }],
			});

			expect(toolUses).toHaveLength(1);
		});

		it('denies by argument content', async () => {
			const { toolUses } = await run('use_tool', {
				toolHooks: [{ timing: 'before', action: { type: 'deny', reason: 'r', argsContains: 'MOCK.TXT' } }],
			});

			expect(toolUses).toEqual([]);
		});

		it('denies MCP tool calls by the mcp__server__tool name', async () => {
			const { toolUses, finalText } = await run('use_mcp echo echo_tool {"text":"x"}', {
				mcpServers: [echoServer()],
				toolHooks: [
					{ timing: 'before', action: { type: 'deny', reason: 'no mcp', toolPattern: 'mcp__echo__*' } },
				],
			});

			expect(toolUses).toEqual([]);
			expect(finalText).toContain('blocked by a PreToolUse hook');
		});

		it('surfaces log hooks in the returned stderr', async () => {
			const { result } = await run('use_tool', {
				toolHooks: [
					{ timing: 'before', action: { type: 'log' } },
					{ timing: 'after', action: { type: 'log' } },
				],
			});

			expect(result.stderr).toContain('[tool-use] Bash {"command":"cat mock.txt"}');
			expect(result.stderr).toContain('[tool-result] Bash tool result output');
		});

		it('is a loud error-free no-op when the step has no hooks', async () => {
			const { result, toolUses } = await run('use_tool', { toolHooks: [] });

			expect(result.exitCode).toBe(0);
			expect(toolUses).toHaveLength(1);
			expect(result.stderr).toBe('');
		});
	});

	describe('tools and permissions', () => {
		beforeEach(() => {
			vi.spyOn(console, 'warn').mockImplementation(() => undefined);
			fs.rmSync(path.join(workDir, 'note.txt'), { force: true });
		});

		it('a read-only restriction blocks apply_patch and writes nothing', async () => {
			const { finalText, toolUses, result } = await run('use_patch', { tools: ['read', 'bash'] });

			expect(finalText).toContain('read-only sandbox blocked');
			expect(toolUses).toEqual([]);
			expect(result.exitCode).toBe(0);
			expect(fs.existsSync(path.join(workDir, 'note.txt'))).toBe(false);
		});

		it('by default (no skipPermissions) apply_patch is also blocked', async () => {
			const { finalText } = await run('use_patch');

			expect(finalText).toContain('read-only sandbox blocked');
		});

		it('skipPermissions lets apply_patch write inside the workspace', async () => {
			const { toolUses } = await run('use_patch', { skipPermissions: true });

			expect(toolUses[0]).toMatchObject({ tool: 'apply_patch', status: 'completed' });
			expect(fs.readFileSync(path.join(workDir, 'note.txt'), 'utf8')).toBe('hi');
		});

		it('excluding bash removes the shell tool', async () => {
			const { finalText, toolUses } = await run('use_tool', {
				tools: ['read', 'write', 'edit', 'glob', 'grep', 'webfetch', 'websearch', 'task', 'todowrite'],
			});

			expect(finalText).toBe('NOSHELL');
			expect(toolUses).toEqual([]);
		});

		it('rejects an unenforceable restriction before the CLI is reached', async () => {
			await expect(run('hello', { tools: ['read', 'write'] })).rejects.toThrow(/single apply_patch tool/);
		});
	});

	describe('resume', () => {
		it('reuses the session id and keeps skipPermissions working through -c overrides', async () => {
			fs.rmSync(path.join(workDir, 'note.txt'), { force: true });
			const { result, sessionId, toolUses } = await run('use_patch', {
				resumeSessionId: 'abc-123',
				skipPermissions: true,
			});

			expect(result.exitCode, result.stderr).toBe(0);
			expect(sessionId).toBe('abc-123');
			expect(toolUses[0]).toMatchObject({ tool: 'apply_patch' });
		});

		it('keeps a read-only restriction on a resumed session', async () => {
			vi.spyOn(console, 'warn').mockImplementation(() => undefined);
			const { result, finalText } = await run('use_patch', {
				resumeSessionId: 'abc-123',
				tools: ['read'],
				skipPermissions: true,
			});

			expect(result.exitCode, result.stderr).toBe(0);
			expect(finalText).toContain('read-only sandbox blocked');
		});
	});

	describe('prompt and env', () => {
		it('passes a prompt starting with "- " as the prompt, not as a flag', async () => {
			const { result, finalText } = await run('- a markdown bullet');

			expect(result.exitCode, result.stderr).toBe(0);
			expect(finalText).toBe('Mock codex response for: - a markdown bullet');
		});

		it('forwards options.env to codex but not unrelated process env', async () => {
			process.env['SOME_UNRELATED_SECRET_FOR_TEST'] = 'leak';
			try {
				const forwarded = await run('echo_env:MY_STEP_VAR', { env: { MY_STEP_VAR: 'from-step' } });
				const leaked = await run('echo_env:SOME_UNRELATED_SECRET_FOR_TEST');

				expect(forwarded.finalText).toBe('MY_STEP_VAR=from-step');
				expect(leaked.finalText).toBe('SOME_UNRELATED_SECRET_FOR_TEST=not-set');
			} finally {
				delete process.env['SOME_UNRELATED_SECRET_FOR_TEST'];
			}
		});

		it('hands codex the model it was asked for', async () => {
			const { events } = await run('hello', { model: 'openai.gpt-5.6-terra' });

			expect(events.find(e => e.type === 'system')?.data['model']).toBe('openai.gpt-5.6-terra');
		});
	});

	describe('interactive', () => {
		it('is accepted by the mock TUI argument set', async () => {
			const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
			try {
				const result = await new CodexModelProvider().launchInteractive({
					workingDir: workDir,
					prompt: 'hello',
					stepId: 'mock-test',
					resumeSessionId: 'abc-123',
					skipPermissions: true,
					mcpServers: [echoServer()],
				});

				expect(result.exitCode).toBe(0);
			} finally {
				stdout.mockRestore();
			}
		});
	});

	describe('options codex cannot honour', () => {
		it('fails before spawning for a permission override', async () => {
			await expect(run('hello', { permission: { bash: 'allow' } })).rejects.toThrow(/opencode feature/);
		});

		it("fails before spawning for session mode 'compact'", async () => {
			await expect(run('hello', { autoCompact: true })).rejects.toThrow(/not supported by codex/);
		});
	});
});

// The mock is only worth anything if it refuses what the real CLI refuses.
describe('codex-mock strictness (mirrors the real CLI)', () => {
	function mock(args: string[]) {
		return spawnSync(process.execPath, [MOCK_PATH, ...args], { encoding: 'utf8' });
	}

	it.each([['--sandbox', 'read-only'], ['--approve-for-me']])(
		'rejects %s after `exec resume` with exit 2',
		(...flag) => {
			const result = mock(['exec', 'resume', 'abc', ...flag, 'hi']);

			expect(result.status).toBe(2);
			expect(result.stderr).toContain(`unexpected argument '${flag[0]}' found`);
		}
	);

	it('accepts --sandbox on a fresh exec', () => {
		expect(mock(['exec', '--sandbox', 'read-only', 'hi']).status).toBe(0);
	});

	it('rejects an unknown flag with exit 2', () => {
		expect(mock(['exec', '--bogus', 'hi']).status).toBe(2);
	});

	it('rejects --json and --skip-git-repo-check for the TUI, which does not list them', () => {
		expect(mock(['--json', 'hi']).status).toBe(2);
		expect(mock(['--skip-git-repo-check', 'hi']).status).toBe(2);
	});

	it('skips untrusted hooks silently, like the real CLI', () => {
		const hook =
			'hooks.PreToolUse=[{ matcher = "*", hooks = [{ type = "command", command = "node -e 1", timeout = 5 }] }]';
		const result = mock(['exec', '-c', hook, 'use_tool']);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain('"type":"command_execution"');
		expect(result.stdout).not.toContain('bypass-hook-trust');
	});

	it('treats an unparseable -c value as a literal string, like the real CLI', () => {
		// args as a bare word instead of an array: the "server" cannot be started, so a required one fails
		const result = mock([
			'exec',
			'-c',
			'mcp_servers.x.command=definitely-not-a-binary-xyz',
			'-c',
			'mcp_servers.x.required=true',
			'hi',
		]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain('x: program not found');
	});
});
