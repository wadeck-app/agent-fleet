/**
 * Integration test: verifies codex-mock.mjs emits the same JSONL event schema as the real
 * `codex exec --json`, and that CodexModelProvider parses what the real CLI emits.
 *
 * Auto-triggered locally (never in CI) when the installed `codex` version differs from the one
 * last recorded in .claude/codex-version-tested.json. Force a run regardless of the cache with:
 *   CODEX_INTEGRATION=1 npx vitest run StepRunner.codex.integration.test
 *
 * COST: makes real model calls (3 tiny prompts: plain answer, one shell command, provider
 * end-to-end) plus one call to a non-existent model that fails before consuming tokens.
 *
 * Covers:
 *   - Mock vs real event schema, field by field (key paths and value types per event kind)
 *   - Event ordering of a plain run, thread id format, usage fields, failure events
 *   - Exit codes (success, failure, unknown flag)
 *   - CodexModelProvider against the REAL binary with the flags it sends in production
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
import type { StreamJsonEvent } from '../processing/StreamJsonParser';
import { VersionBaseline } from '../testing/VersionBaseline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_PATH = join(__dirname, '../testing/codex-mock.mjs');
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

/** Command + prefix args to launch the real codex without shell quoting of the prompt. */
function realCodexCommand(): { command: string; prefix: string[] } {
	if (process.platform === 'win32') {
		const cmdPath = execSync('where.exe codex.cmd', { encoding: 'utf8' }).trim().split('\n')[0]!.trim();
		const codexJs = join(dirname(cmdPath), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
		if (!existsSync(codexJs)) {
			throw new Error(
				`codex.js not found at ${codexJs}; the codex install layout changed, update realCodexCommand()`
			);
		}
		return { command: process.execPath, prefix: [codexJs] };
	}
	return { command: 'codex', prefix: [] };
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

describe.skipIf(!shouldRunIntegration())('Codex real vs mock compatibility', () => {
	let workDir: string;
	let realPlain: ProcessResult;
	let realTool: ProcessResult;
	let realFailure: ProcessResult;
	const passed = new Set<string>();
	// Every test below must add its name; the version is only recorded when all of them did.
	const EXPECTED_TESTS = [
		'plain run schema',
		'tool run schema',
		'failure schema and exit code',
		'unknown flag exit code',
		'provider against real codex',
	];

	beforeAll(async () => {
		workDir = mkdtempSync(join(tmpdir(), 'codex-integration-'));
		writeFileSync(join(workDir, 'f.txt'), 'hello-content\n');
		const { command, prefix } = realCodexCommand();
		const common = ['exec', '--json', '--skip-git-repo-check', '-s', 'read-only'];
		realPlain = await runProcess(command, [...prefix, ...common, 'reply with the word ok'], workDir);
		realTool = await runProcess(
			command,
			[...prefix, ...common, "Run the shell command 'cat f.txt' and reply with its output only"],
			workDir
		);
		realFailure = await runProcess(command, [...prefix, ...common, '-m', 'nonexistent-model-xyz', 'hi'], workDir);
	}, CAPTURE_TIMEOUT * 3);

	afterAll(() => {
		rmSync(workDir, { recursive: true, force: true });
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
		const { command, prefix } = realCodexCommand();
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
});
