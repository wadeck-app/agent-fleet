/**
 * Integration test: verifies the mock Claude produces the same NDJSON structure as real Claude.
 *
 * Auto-triggered locally (never in CI) when the installed `claude` version differs from the one
 * last recorded in .claude/claude-version-tested.json. Force a run regardless of the cache with:
 *   CLAUDE_INTEGRATION=1 npx vitest run StepRunner.model.integration.test
 *
 * Covers:
 *   - Accepted CLI flags (inputs / parameters)
 *   - NDJSON event structure (outputs)
 *   - Required fields per event type
 *   - Exit codes
 *
 * The version marker is only written after the structural-compatibility test passes, so a real
 * incompatibility is never cached as "already tested" -- it keeps re-triggering every run until
 * fixed.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_PATH = join(__dirname, '../testing/claude-mock.mjs');
const INTEGRATION_TIMEOUT = 60_000;

/**
 * Walks up from `startDir` to the nearest ancestor containing `.git`.
 *
 * The previous version-tracking attempt resolved its baseline path relative to something other
 * than the actual repo root, so the file was never found, every run read as "no baseline", and
 * the gate treated that as "skip forever" -- three provider flags drifted unnoticed for months.
 * Walking to the real `.git` root instead of hardcoding a relative `../../..` count survives the
 * file moving to a different nesting depth.
 */
function findRepoRoot(startDir: string): string {
	let dir = startDir;
	while (!existsSync(join(dir, '.git'))) {
		const parent = dirname(dir);
		if (parent === dir) throw new Error(`findRepoRoot: no .git found above ${startDir}`);
		dir = parent;
	}
	return dir;
}

const VERSION_FILE = join(findRepoRoot(__dirname), '.claude', 'claude-version-tested.json');

function currentClaudeVersion(): string | null {
	try {
		return execSync('claude --version', { encoding: 'utf8' }).trim();
	} catch {
		return null;
	}
}

/** The version this suite last confirmed compatible, or null when never recorded / unreadable. */
function lastTestedVersion(): string | null {
	try {
		const parsed = JSON.parse(readFileSync(VERSION_FILE, 'utf8'));
		return typeof parsed['testedVersion'] === 'string' ? parsed['testedVersion'] : null;
	} catch {
		return null;
	}
}

function recordTestedVersion(version: string): void {
	mkdirSync(dirname(VERSION_FILE), { recursive: true });
	writeFileSync(
		VERSION_FILE,
		JSON.stringify({ testedVersion: version, testedAt: new Date().toISOString() }, null, 2)
	);
}

/**
 * Runs locally when the installed Claude version has not yet been confirmed compatible, or when
 * CLAUDE_INTEGRATION=1 forces it regardless of the cache. Never in CI -- this suite calls a real
 * model, so CI is never the place for it. `ProviderFlagContract.test.ts` runs on every commit
 * instead, cheaply, by reading `--help` with no model call.
 */
function shouldRunIntegration(): boolean {
	if (process.env['CI']) return false;
	const current = currentClaudeVersion();
	if (current === null) return false;
	if (process.env['CLAUDE_INTEGRATION']) return true;
	return current !== lastTestedVersion();
}

function runProcess(
	command: string,
	args: string[],
	stdinData?: string,
	env?: NodeJS.ProcessEnv
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: { ...process.env, ...env },
			shell: false,
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
		if (child.stdin) {
			if (stdinData) child.stdin.write(stdinData);
			child.stdin.end();
		}
	});
}

function parseNdjson(raw: string): Record<string, unknown>[] {
	return raw
		.split('\n')
		.filter(l => l.trim())
		.map(l => JSON.parse(l));
}

describe.skipIf(!shouldRunIntegration())('Claude real vs mock compatibility', () => {
	let realClaudePath: string;

	// Resolve real Claude path once
	try {
		realClaudePath = execSync(process.platform === 'win32' ? 'where.exe claude' : 'which claude', {
			encoding: 'utf8',
		})
			.trim()
			.split('\n')[0]
			.trim();
	} catch {
		realClaudePath = '';
	}

	// --- INPUT / PARAMETER TESTS ---

	it(
		'mock accepts same flags as real Claude without error',
		async () => {
			// Flags that ClaudeLauncher passes: --dangerously-skip-permissions --output-format stream-json --model <m> -p
			const flags = [
				'--dangerously-skip-permissions',
				'--output-format',
				'stream-json',
				'--model',
				'haiku',
				'-p',
			];
			const mock = await runProcess('node', [MOCK_PATH, ...flags], 'hello');
			expect(mock.exitCode).toBe(0);
			expect(mock.stdout.length).toBeGreaterThan(0);

			if (realClaudePath) {
				const real = await runProcess(realClaudePath, flags, 'Say: hi');
				// Real Claude may refuse some flags in test env but should not crash with code 2 (bad args)
				expect(real.exitCode).not.toBe(2);
			}
		},
		INTEGRATION_TIMEOUT
	);

	it(
		'mock exits non-zero on CLAUDE_MOCK_EXIT_CODE=1',
		async () => {
			const mock = await runProcess('node', [MOCK_PATH, '-p'], 'hello', { CLAUDE_MOCK_EXIT_CODE: '1' });
			expect(mock.exitCode).toBe(1);
			// Should still emit a result:error event
			const events = parseNdjson(mock.stdout);
			const resultEvent = events.find(e => e['type'] === 'result');
			expect(resultEvent).toBeDefined();
			expect(resultEvent!['is_error']).toBe(true);
		},
		INTEGRATION_TIMEOUT
	);

	// --- OUTPUT / NDJSON STRUCTURE TESTS ---

	it(
		'mock and real Claude emit the same required event types',
		async () => {
			if (!realClaudePath) {
				console.warn('Skipping real Claude check — not found on PATH');
				return;
			}

			const prompt = 'Say only: hello';

			const mockResult = await runProcess('node', [MOCK_PATH, '--output-format', 'stream-json', '-p'], prompt);
			expect(mockResult.exitCode).toBe(0);
			const mockEvents = parseNdjson(mockResult.stdout);

			// --verbose is not optional here: claude refuses stream-json output without it under
			// --print, and the provider always pairs them for that reason. Leaving it out made
			// this check compare the mock against an empty stream from a usage error.
			const realResult = await runProcess(
				realClaudePath,
				['--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose', '-p'],
				prompt
			);
			const realEvents = parseNdjson(realResult.stdout);

			// Required event types
			for (const events of [mockEvents, realEvents]) {
				const types = events.map(e => e['type']);
				expect(types).toContain('system');
				expect(types).toContain('assistant');
				expect(types).toContain('result');
			}

			// system:init required fields
			const mockInit = mockEvents.find(e => e['type'] === 'system' && e['subtype'] === 'init');
			const realInit = realEvents.find(e => e['type'] === 'system' && e['subtype'] === 'init');
			for (const init of [mockInit, realInit]) {
				expect(init).toBeDefined();
				expect(typeof init!['session_id']).toBe('string');
				expect(typeof init!['cwd']).toBe('string');
			}

			// assistant event: content array with text block
			const mockAssistant = mockEvents.find(e => e['type'] === 'assistant') as any;
			const realAssistant = realEvents.find(e => e['type'] === 'assistant') as any;
			for (const a of [mockAssistant, realAssistant]) {
				expect(a).toBeDefined();
				expect(Array.isArray(a.message?.content)).toBe(true);
			}

			// result event: required fields
			const mockResultEvent = mockEvents.find(e => e['type'] === 'result') as any;
			const realResultEvent = realEvents.find(e => e['type'] === 'result') as any;
			for (const r of [mockResultEvent, realResultEvent]) {
				expect(r).toBeDefined();
				expect(typeof r['result']).toBe('string');
				expect(typeof r['session_id']).toBe('string');
				expect(typeof r['is_error']).toBe('boolean');
				expect(typeof r['duration_ms']).toBe('number');
			}

			// result event: cost/token fields -- ModelStepExecutor reads `total_cost_usd` (not
			// `cost_usd`) and `modelUsage[model].{inputTokens,outputTokens,cacheReadInputTokens,
			// cacheCreationInputTokens}`. A real-CLI drift here silently zeroes cost in `flow history`.
			for (const r of [mockResultEvent, realResultEvent]) {
				expect(typeof r['total_cost_usd']).toBe('number');
				expect(typeof r['modelUsage']).toBe('object');
				const firstModelUsage = Object.values(r['modelUsage'] as Record<string, unknown>)[0] as any;
				expect(typeof firstModelUsage['inputTokens']).toBe('number');
				expect(typeof firstModelUsage['outputTokens']).toBe('number');
				expect(typeof firstModelUsage['cacheReadInputTokens']).toBe('number');
				expect(typeof firstModelUsage['cacheCreationInputTokens']).toBe('number');
			}

			// Every assertion above passed -- only now is this version safe to cache as "compatible",
			// so the next local run skips until the installed Claude version changes again.
			const version = currentClaudeVersion();
			if (version) recordTestedVersion(version);
			console.log(`✓ Mock compatible with Claude ${version ?? 'unknown'}`);
		},
		INTEGRATION_TIMEOUT
	);

	// Says which Claude these results describe. The flags this suite relies on are checked
	// against the CLI itself in ProviderFlagContract.test.ts, on every commit.
	it('reports the Claude it ran against', () => {
		const current = currentClaudeVersion();

		expect(current, 'the file-level gate should have skipped this suite when claude is absent').not.toBeNull();
		console.log(`✓ verified against Claude ${current ?? 'unknown'}`);
	});
});
