/**
 * Integration test: verifies the mock Claude produces the same NDJSON structure as real Claude.
 *
 * Auto-triggered when Claude version changes (detected in CI via claude-version-tested.json).
 * Manual run: CLAUDE_INTEGRATION=1 npx vitest run StepRunner.model.integration.test
 *
 * Covers:
 *   - Accepted CLI flags (inputs / parameters)
 *   - NDJSON event structure (outputs)
 *   - Required fields per event type
 *   - Exit codes
 *
 * Last tested version stored in .claude/claude-version-tested.json.
 * When current version ≠ stored version, the compatibility test is automatically enabled.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_PATH = join(__dirname, '../testing/claude-mock.mjs');
const VERSION_FILE = join(__dirname, '../../../../../.claude/claude-version-tested.json');
const INTEGRATION_TIMEOUT = 60_000;

function currentClaudeVersion(): string | null {
	try {
		return execSync('claude --version', { encoding: 'utf8' }).trim();
	} catch {
		return null;
	}
}

function storedVersion(): string | null {
	if (!existsSync(VERSION_FILE)) return null;
	try {
		return (JSON.parse(readFileSync(VERSION_FILE, 'utf8')) as { testedVersion: string }).testedVersion;
	} catch {
		return null;
	}
}

/** Run when CLAUDE_INTEGRATION=1 OR when a baseline exists AND current Claude version ≠ it. */
function shouldRunIntegration(): boolean {
	if (process.env['CLAUDE_INTEGRATION']) return true;
	const current = currentClaudeVersion();
	const stored = storedVersion();
	// Auto-run only if we have a baseline AND it's stale — never on first install
	return current !== null && stored !== null && current !== stored;
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

			const realResult = await runProcess(
				realClaudePath,
				['--dangerously-skip-permissions', '--output-format', 'stream-json', '-p'],
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

			// Store tested version
			const version = currentClaudeVersion()!;
			writeFileSync(
				VERSION_FILE,
				JSON.stringify({ testedVersion: version, testedAt: new Date().toISOString().slice(0, 10) }, null, 2)
			);
			console.log(`✓ Mock compatible with Claude ${version}`);
		},
		INTEGRATION_TIMEOUT
	);

	// --- VERSION STALENESS CHECK (always runs, warns only) ---

	it('warns when Claude version changed since last integration test', () => {
		const current = currentClaudeVersion();
		const stored = storedVersion();
		if (!current) {
			console.warn('Claude not found on PATH — cannot check version');
			return;
		}
		if (!stored) {
			console.warn('No claude-version-tested.json — run with CLAUDE_INTEGRATION=1 to baseline');
			return;
		}
		if (stored !== current) {
			console.warn(
				`⚠  Claude version changed: ${stored} → ${current}. Integration test will auto-run next session.`
			);
		} else {
			console.log(`✓ Mock last verified against Claude ${stored}`);
		}
		expect(stored).toBeTruthy();
	});
});
