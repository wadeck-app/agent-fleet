/**
 * Integration test: verifies codex-mock.mjs emits the same JSONL event schema as the real
 * `codex exec --json`, and that CodexModelProvider parses what the real CLI emits.
 *
 * Auto-triggered locally (never in CI) when the installed `codex` version differs from the one
 * last recorded in .claude/codex-version-tested.json. Force a run regardless of the cache with:
 *   CODEX_INTEGRATION=1 npx vitest run StepRunner.codex.integration.test
 *
 * COST: makes real model calls: 3 tiny prompts (plain answer, one shell command, provider
 * end-to-end), one call to a non-existent model that fails before consuming tokens, and ~11 more
 * through CodexModelProvider for the features below (each a few thousand to ~50k tokens).
 *
 * Covers:
 *   - Mock vs real event schema, field by field (key paths and value types per event kind)
 *   - Event ordering of a plain run, thread id format, usage fields, failure events
 *   - Exit codes (success, failure, unknown flag)
 *   - CodexModelProvider against the REAL binary with the flags it sends in production
 *   - Provider features, each run against the real CLI AND the mock with the same LaunchOptions, the
 *     same assertions applied to both, and the event shapes compared: MCP servers (success, JSON-RPC
 *     error, isError), tool hooks (deny, log), the read-only sandbox, apply_patch, removing the shell
 *     tool, resuming a session with skipPermissions, and a prompt that starts with "-"
 *
 * The version marker is only written after every comparison passed, so a real incompatibility is
 * never cached as "already tested" -- it keeps re-triggering every run until fixed.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CodexModelProvider } from '../processing/CodexModelProvider';
import type { LaunchOptions, ModelBackgroundResult } from '../processing/ModelProvider';
import type { StreamJsonEvent } from '../processing/StreamJsonParser';
import { RealCodexCommand } from '../testing/RealCodexCommand';
import { VersionBaseline } from '../testing/VersionBaseline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_PATH = join(__dirname, '../testing/codex-mock.mjs');
const MCP_SERVER_PATH = join(__dirname, '../testing/mcp-echo-server.mjs');
const CAPTURE_TIMEOUT = 180_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const baseline = new VersionBaseline('codex', __dirname, 'CODEX_INTEGRATION');

/** The installed codex version (e.g. "codex-cli 0.163.0"), or null when it is not installed. */
function currentCodexVersion(): string | null {
	try {
		const output = execSync('codex --version', { encoding: 'utf8' }).trim();
		return /^codex-cli \d+\.\d+\.\d+/.test(output) ? output : null;
	} catch {
		return null;
	}
}

/**
 * Runs locally when the installed codex version has not yet been confirmed compatible, or when
 * CODEX_INTEGRATION=1 forces it regardless of the cache. Never in CI -- this suite calls a real
 * model. `ProviderFlagContract.test.ts` covers flag drift on every commit without a model call.
 */
function shouldRunIntegration(): boolean {
	return baseline.shouldRun(currentCodexVersion());
}

interface ProcessResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

function runProcess(command: string, args: string[], cwd?: string, env?: NodeJS.ProcessEnv): Promise<ProcessResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			stdio: ['pipe', 'pipe', 'pipe'],
			env: { ...process.env, ...env },
			shell: false,
			windowsHide: true,
		});
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (d: Buffer) => {
			stdout += d.toString();
		});
		child.stderr.on('data', (d: Buffer) => {
			stderr += d.toString();
		});
		child.on('close', code => resolve({ stdout, stderr, exitCode: code ?? -1 }));
		child.on('error', reject);
		child.stdin.end();
	});
}

type Json = Record<string, unknown>;

function parseJsonl(raw: string): Json[] {
	return raw
		.split('\n')
		.filter(l => l.trim())
		.map(l => JSON.parse(l) as Json);
}

/** Every leaf path of an object mapped to its JSON type, e.g. `item.exit_code -> "null"`. */
function shapeOf(value: unknown, prefix = ''): Record<string, string> {
	if (value === null) return { [prefix]: 'null' };
	if (Array.isArray(value)) return { [prefix]: 'array' };
	if (typeof value === 'object') {
		return Object.entries(value as Json).reduce<Record<string, string>>(
			(acc, [key, child]) => ({ ...acc, ...shapeOf(child, prefix ? `${prefix}.${key}` : key) }),
			{}
		);
	}
	return { [prefix]: typeof value };
}

/** Identifies an event: type, plus item type and status for item.* events. */
function kindOf(event: Json): string {
	const item = event['item'] as Json | undefined;
	if (item === undefined) return String(event['type']);
	return `${String(event['type'])}/${String(item['type'])}/${String(item['status'] ?? '-')}`;
}

/**
 * Real codex also emits config warnings as item.completed/error items depending on the user's
 * config.toml; they are environment noise, not part of the mock's contract.
 */
function isConfigWarning(event: Json): boolean {
	return kindOf(event) === 'item.completed/error/-';
}

function eventByKind(events: Json[]): Map<string, Json> {
	const map = new Map<string, Json>();
	for (const event of events) {
		if (!isConfigWarning(event) && !map.has(kindOf(event))) map.set(kindOf(event), event);
	}
	return map;
}

/** Asserts that for every kind present in both streams, the field paths and types are identical. */
function expectSameShapes(mockEvents: Json[], realEvents: Json[]): void {
	const mockByKind = eventByKind(mockEvents);
	const realByKind = eventByKind(realEvents);
	for (const [kind, mockEvent] of mockByKind) {
		const realEvent = realByKind.get(kind);
		expect(realEvent, `mock emits "${kind}" but the real codex run did not`).toBeDefined();
		expect(shapeOf(mockEvent), `field paths/types differ for event kind "${kind}"`).toEqual(shapeOf(realEvent));
	}
}

// ── Provider features: the same LaunchOptions against the real CLI and the mock ─────────────────

interface ScenarioRun {
	result: ModelBackgroundResult;
	/** Parsed stdout JSONL */
	raw: Json[];
	/** tool_use stream events as the provider emitted them */
	toolUses: Json[];
	text: string;
	sessionId: string | undefined;
	dir: string;
}

type Side = 'real' | 'mock';

/**
 * Runs CodexModelProvider once. `mock` only changes which binary the provider resolves (via
 * CODEX_MOCK_PATH in the step env); every argument the provider builds goes through the same code.
 */
async function runProvider(
	side: Side,
	dir: string,
	options: Partial<LaunchOptions> & { prompt: string }
): Promise<ScenarioRun> {
	const stream: StreamJsonEvent[] = [];
	const result = await new CodexModelProvider().launchBackground({
		workingDir: dir,
		stepId: 'codex-scenario',
		...options,
		env: { ...options.env, ...(side === 'mock' ? { CODEX_MOCK_PATH: MOCK_PATH } : {}) },
		onStreamEvent: e => stream.push(e),
	});
	return {
		result,
		raw: parseJsonl(result.stdout),
		toolUses: stream.filter(e => e.type === 'tool_use').map(e => e.data as Json),
		text: String(stream.find(e => e.type === 'result')?.data['result'] ?? ''),
		sessionId: stream.find(e => e.type === 'system')?.data['session_id'] as string | undefined,
		dir,
	};
}

const ECHO_SERVER = {
	name: 'echo',
	command: [process.execPath, MCP_SERVER_PATH],
	env: { MCP_MARK: 'M1' },
};

interface Scenario {
	name: string;
	real: string;
	mock: string;
	options?: Partial<LaunchOptions>;
	/** Assertions applied identically to the real run and to the mock run */
	check: (run: ScenarioRun, side: Side) => void;
}

const toolUse = (run: ScenarioRun, tool: string): Json | undefined => run.toolUses.find(t => t['tool'] === tool);
const noToolUse = (run: ScenarioRun, tool: string): boolean => toolUse(run, tool) === undefined;

const SCENARIOS: Scenario[] = [
	{
		name: 'mcp tool call succeeds',
		real: "Call the MCP tool echo_tool with text 'ping' exactly once, then reply with only its output.",
		mock: 'use_mcp echo echo_tool {"text":"ping"}',
		options: { mcpServers: [ECHO_SERVER] },
		check: run => {
			expect(run.result.exitCode, run.result.stderr).toBe(0);
			expect(toolUse(run, 'mcp__echo__echo_tool')).toMatchObject({
				input: { text: 'ping' },
				output: 'ECHO[M1]: ping',
				status: 'completed',
			});
		},
	},
	{
		name: 'mcp tool call fails with a JSON-RPC error',
		real: 'Call the MCP tool fail_tool exactly once, then reply DONE.',
		mock: 'use_mcp echo fail_tool {}',
		options: { mcpServers: [ECHO_SERVER] },
		check: run => {
			expect(run.result.exitCode, run.result.stderr).toBe(0);
			const call = toolUse(run, 'mcp__echo__fail_tool');
			expect(call?.['status']).toBe('failed');
			expect(String(call?.['output'])).toContain('boom from fail_tool');
		},
	},
	{
		name: 'mcp tool returns isError',
		real: 'Call the MCP tool iserror_tool exactly once, then reply DONE.',
		mock: 'use_mcp echo iserror_tool {}',
		options: { mcpServers: [ECHO_SERVER] },
		check: run => {
			const call = toolUse(run, 'mcp__echo__iserror_tool');
			expect(call).toMatchObject({ status: 'failed', output: 'iserror happened' });
		},
	},
	{
		name: 'deny hook blocks the shell command',
		real: 'Run the shell command: echo hello. If something blocks it, reply BLOCKED.',
		mock: 'use_tool',
		options: {
			toolHooks: [{ timing: 'before', action: { type: 'deny', reason: 'blocked by flow', toolPattern: 'bash' } }],
		},
		check: run => {
			expect(run.result.exitCode, run.result.stderr).toBe(0);
			expect(noToolUse(run, 'command_execution')).toBe(true);
			expect(run.result.stderr).toContain('blocked by PreToolUse hook: Tool denied: blocked by flow');
		},
	},
	{
		name: 'log hooks reach the returned stderr',
		real: 'Run the shell command: echo hello_hook. Reply with its output only.',
		mock: 'use_tool',
		options: {
			toolHooks: [
				{ timing: 'before', action: { type: 'log' } },
				{ timing: 'after', action: { type: 'log' } },
			],
		},
		check: run => {
			expect(run.result.exitCode, run.result.stderr).toBe(0);
			expect(toolUse(run, 'command_execution')).toBeDefined();
			expect(run.result.stderr).toMatch(/\[tool-use\] Bash \{"command":/);
			expect(run.result.stderr).toMatch(/\[tool-result\] Bash /);
		},
	},
	{
		name: 'read-only restriction blocks apply_patch',
		real: "Use the apply_patch tool (not the shell) to create note.txt containing 'hi'. Reply with whether it succeeded.",
		mock: 'use_patch',
		options: { tools: ['read'], skipPermissions: true },
		check: run => {
			expect(run.result.exitCode, run.result.stderr).toBe(0);
			expect(noToolUse(run, 'apply_patch')).toBe(true);
			expect(existsSync(join(run.dir, 'note.txt'))).toBe(false);
		},
	},
	{
		name: 'skipPermissions lets apply_patch write',
		real: "Use the apply_patch tool (not the shell) to create note.txt containing 'hi'. Reply briefly.",
		mock: 'use_patch',
		options: { skipPermissions: true },
		check: run => {
			expect(run.result.exitCode, run.result.stderr).toBe(0);
			expect(toolUse(run, 'apply_patch')).toMatchObject({ status: 'completed' });
			expect(existsSync(join(run.dir, 'note.txt'))).toBe(true);
		},
	},
	{
		name: 'excluding bash removes the shell tool',
		real: 'Run the shell command: echo shell_ok. If you have no tool able to run shell commands, reply exactly NOSHELL.',
		mock: 'use_tool',
		options: { tools: ['read', 'write', 'edit', 'glob', 'grep', 'webfetch', 'websearch', 'task', 'todowrite'] },
		check: run => {
			expect(run.result.exitCode, run.result.stderr).toBe(0);
			expect(noToolUse(run, 'command_execution')).toBe(true);
			expect(run.text).toContain('NOSHELL');
		},
	},
];

/** A prompt starting with "- " is a flag to codex unless it follows `--`. */
const DASH_PROMPT = '- reply with the word ok';
const RESUME_WRITE = {
	real: "Use the apply_patch tool (not the shell) to create note.txt containing 'hi'. Reply briefly.",
	mock: 'use_patch',
};

/** Same field paths and value types for every event kind both streams contain. */
function expectSameToolUseShape(mockRun: ScenarioRun, realRun: ScenarioRun): void {
	for (const mockUse of mockRun.toolUses) {
		const realUse = realRun.toolUses.find(t => t['tool'] === mockUse['tool']);
		if (realUse === undefined) continue;
		expect(shapeOf(mockUse), `tool_use "${String(mockUse['tool'])}" differs between mock and real`).toEqual(
			shapeOf(realUse)
		);
	}
}

describe.skipIf(!shouldRunIntegration())('Codex real vs mock compatibility', () => {
	let workDir: string;
	let realPlain: ProcessResult;
	let realTool: ProcessResult;
	let realFailure: ProcessResult;
	const scenarioRuns = new Map<string, { real: ScenarioRun; mock: ScenarioRun }>();
	let dashRuns: { real: ScenarioRun; mock: ScenarioRun };
	let resumeRuns: { real: ScenarioRun; mock: ScenarioRun };
	const scenarioDirs: string[] = [];
	let savedMockPath: string | undefined;
	const passed = new Set<string>();
	// Every test below must add its name; the version is only recorded when all of them did.
	const EXPECTED_TESTS = [
		'plain run schema',
		'tool run schema',
		'failure schema and exit code',
		'unknown flag exit code',
		'provider against real codex',
		...SCENARIOS.map(scenario => `scenario: ${scenario.name}`),
		'scenario: prompt starting with a dash',
		'scenario: resume keeps skipPermissions working',
	];

	beforeAll(async () => {
		// The provider resolves the binary from CODEX_MOCK_PATH first; the "real" side must not see it.
		savedMockPath = process.env['CODEX_MOCK_PATH'];
		delete process.env['CODEX_MOCK_PATH'];
		workDir = mkdtempSync(join(tmpdir(), 'codex-integration-'));
		writeFileSync(join(workDir, 'f.txt'), 'hello-content\n');
		const { command, prefix } = RealCodexCommand.resolve();
		const common = ['exec', '--json', '--skip-git-repo-check', '-s', 'read-only'];
		realPlain = await runProcess(command, [...prefix, ...common, 'reply with the word ok'], workDir);
		realTool = await runProcess(
			command,
			[...prefix, ...common, "Run the shell command 'cat f.txt' and reply with its output only"],
			workDir
		);
		realFailure = await runProcess(command, [...prefix, ...common, '-m', 'nonexistent-model-xyz', 'hi'], workDir);

		const newDir = (): string => {
			const dir = mkdtempSync(join(tmpdir(), 'codex-scenario-'));
			scenarioDirs.push(dir);
			return dir;
		};
		const capture = async (scenario: Scenario): Promise<void> => {
			const real = await runProvider('real', newDir(), { ...scenario.options, prompt: scenario.real });
			const mock = await runProvider('mock', newDir(), { ...scenario.options, prompt: scenario.mock });
			scenarioRuns.set(scenario.name, { real, mock });
		};
		// Batches keep the number of concurrent real model calls small
		await Promise.all(SCENARIOS.slice(0, 5).map(capture));
		await Promise.all(SCENARIOS.slice(5).map(capture));

		const realDir = newDir();
		const mockDir = newDir();
		const dashReal = await runProvider('real', realDir, { prompt: DASH_PROMPT });
		const dashMock = await runProvider('mock', mockDir, { prompt: DASH_PROMPT });
		dashRuns = { real: dashReal, mock: dashMock };
		resumeRuns = {
			real: await runProvider('real', realDir, {
				prompt: RESUME_WRITE.real,
				resumeSessionId: dashReal.sessionId,
				skipPermissions: true,
			}),
			mock: await runProvider('mock', mockDir, {
				prompt: RESUME_WRITE.mock,
				resumeSessionId: dashMock.sessionId,
				skipPermissions: true,
			}),
		};
	}, CAPTURE_TIMEOUT * 10);

	afterAll(() => {
		rmSync(workDir, { recursive: true, force: true });
		for (const dir of scenarioDirs) rmSync(dir, { recursive: true, force: true });
		if (savedMockPath !== undefined) process.env['CODEX_MOCK_PATH'] = savedMockPath;
		const missing = EXPECTED_TESTS.filter(name => !passed.has(name));
		const version = currentCodexVersion();
		if (missing.length === 0 && version) {
			baseline.recordTestedVersion(version);
		} else {
			console.warn(
				`[codex integration] version NOT recorded (failed or skipped: ${missing.join(', ')}); the suite re-runs next time`
			);
		}
	});

	it('plain run schema', async () => {
		expect(realPlain.exitCode, `real codex failed: ${realPlain.stdout}\n${realPlain.stderr}`).toBe(0);
		const real = parseJsonl(realPlain.stdout);
		const mock = await runProcess('node', [
			MOCK_PATH,
			'exec',
			'--json',
			'--skip-git-repo-check',
			'-s',
			'read-only',
			'reply with the word ok',
		]);
		expect(mock.exitCode).toBe(0);
		const mockEvents = parseJsonl(mock.stdout);

		expectSameShapes(mockEvents, real);
		// Same ordered sequence of event kinds (config warnings aside).
		expect(mockEvents.map(kindOf)).toEqual(real.filter(e => !isConfigWarning(e)).map(kindOf));

		const realThread = real.find(e => e['type'] === 'thread.started')!;
		const mockThread = mockEvents.find(e => e['type'] === 'thread.started')!;
		expect(realThread['thread_id']).toMatch(UUID);
		expect(mockThread['thread_id']).toMatch(UUID);

		// Real codex reports no cost anywhere; the mock must not invent one.
		expect(realPlain.stdout).not.toMatch(/cost/i);
		expect(mock.stdout).not.toMatch(/cost/i);
		passed.add('plain run schema');
	});

	it('tool run schema', async () => {
		expect(realTool.exitCode, `real codex failed: ${realTool.stdout}\n${realTool.stderr}`).toBe(0);
		const real = parseJsonl(realTool.stdout);
		const mock = await runProcess('node', [
			MOCK_PATH,
			'exec',
			'--json',
			'--skip-git-repo-check',
			'-s',
			'read-only',
			'use_tool',
		]);
		expect(mock.exitCode).toBe(0);
		const mockEvents = parseJsonl(mock.stdout);

		expectSameShapes(mockEvents, real);
		// Model-driven runs may add extra turns; compare the set of kinds, not the sequence.
		const realKinds = new Set(real.filter(e => !isConfigWarning(e)).map(kindOf));
		expect(new Set(mockEvents.map(kindOf))).toEqual(realKinds);
		passed.add('tool run schema');
	});

	it('failure schema and exit code', async () => {
		const real = parseJsonl(realFailure.stdout);
		const mock = await runProcess('node', [MOCK_PATH, 'exec', '--json', 'hi'], undefined, {
			CODEX_MOCK_EXIT_CODE: '1',
		});
		expect(mock.exitCode).toBe(realFailure.exitCode);
		expect(realFailure.exitCode).toBe(1);
		const mockEvents = parseJsonl(mock.stdout);

		// The real failure also emits "Reconnecting..." error events, which the mock models with one.
		expectSameShapes(mockEvents, real);
		expect(real.at(-1)!['type']).toBe('turn.failed');
		expect(mockEvents.at(-1)!['type']).toBe('turn.failed');
		passed.add('failure schema and exit code');
	});

	it('unknown flag exit code', async () => {
		const { command, prefix } = RealCodexCommand.resolve();
		const real = await runProcess(command, [...prefix, 'exec', '--bogus-flag', 'x']);
		const mock = await runProcess('node', [MOCK_PATH, 'exec', '--bogus-flag', 'x']);
		expect(real.exitCode).toBe(2);
		expect(mock.exitCode).toBe(real.exitCode);
		passed.add('unknown flag exit code');
	});

	it(
		'provider against real codex',
		async () => {
			// The exact flags production sends: --json, --skip-git-repo-check, --approve-for-me, --sandbox read-only.
			const events: StreamJsonEvent[] = [];
			const previousMock = process.env['CODEX_MOCK_PATH'];
			delete process.env['CODEX_MOCK_PATH'];
			try {
				const result = await new CodexModelProvider().launchBackground({
					workingDir: workDir,
					prompt: 'reply with the word ok',
					stepId: 'codex-integration',
					skipPermissions: true,
					tools: ['read'],
					onStreamEvent: e => events.push(e),
				});

				expect(result.exitCode, `provider run failed: ${result.stdout}\n${result.stderr}`).toBe(0);
				const init = events.find(e => e.type === 'system');
				expect(init?.data['session_id']).toMatch(UUID);
				expect(events.some(e => e.type === 'text')).toBe(true);
				const final = events.find(e => e.type === 'result');
				expect(String(final?.data['result']).toLowerCase()).toContain('ok');
				const usage = (final?.data['modelUsage'] as Record<string, Record<string, number>>)['codex']!;
				expect(usage['inputTokens']).toBeGreaterThan(0);
				expect(usage['outputTokens']).toBeGreaterThan(0);
				passed.add('provider against real codex');
			} finally {
				if (previousMock !== undefined) process.env['CODEX_MOCK_PATH'] = previousMock;
			}
		},
		CAPTURE_TIMEOUT
	);

	for (const scenario of SCENARIOS) {
		it(`scenario: ${scenario.name}`, () => {
			const { real, mock } = scenarioRuns.get(scenario.name)!;
			scenario.check(real, 'real');
			scenario.check(mock, 'mock');
			expectSameShapes(mock.raw, real.raw);
			expectSameToolUseShape(mock, real);
			passed.add(`scenario: ${scenario.name}`);
		});
	}

	it('scenario: prompt starting with a dash', () => {
		for (const [side, run] of [
			['real', dashRuns.real],
			['mock', dashRuns.mock],
		] as const) {
			expect(run.result.exitCode, `${side}: ${run.result.stderr}`).toBe(0);
			expect(run.sessionId, side).toMatch(UUID);
		}
		expectSameShapes(dashRuns.mock.raw, dashRuns.real.raw);
		passed.add('scenario: prompt starting with a dash');
	});

	it('scenario: resume keeps skipPermissions working', () => {
		for (const [side, fresh, resumed] of [
			['real', dashRuns.real, resumeRuns.real],
			['mock', dashRuns.mock, resumeRuns.mock],
		] as const) {
			expect(resumed.result.exitCode, `${side}: ${resumed.result.stderr}`).toBe(0);
			expect(resumed.sessionId, `${side} resumed the same thread`).toBe(fresh.sessionId);
			expect(toolUse(resumed, 'apply_patch'), side).toMatchObject({ status: 'completed' });
			expect(existsSync(join(resumed.dir, 'note.txt')), side).toBe(true);
		}
		expectSameShapes(resumeRuns.mock.raw, resumeRuns.real.raw);
		passed.add('scenario: resume keeps skipPermissions working');
	});
});
