// Integration tests for flow CLI entry point.
// These tests build the bundle with a fixed test version and execute it via node directly.
// They verify:
//   1. `flow cli self-check` does NOT produce duplicate lines in combined stdout+stderr
//   2. `flow cli update` produces at least one line of output (not silent)
//   3. `flow logs` (unknown command) exits with code 1 and reports "Unknown command"
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// agent-fleet root (4 levels up from src/cli/: src/cli → src → flow-cli → packages → agent-fleet)
const agentFleetRoot = path.resolve(__dirname, '../../../..');
const bundlePath = path.resolve(agentFleetRoot, 'packages/flow-cli/dist-bundle/flow.cjs');
const updaterBundlePath = path.resolve(agentFleetRoot, 'packages/flow-cli/dist-bundle/flow-updater.cjs');

const TEST_VERSION = '0.0.0-test-integration';

beforeAll(() => {
	// Build the bundle with a test version
	// Use shell: true so npm resolves correctly on Windows (npm.cmd)
	execFileSync('npm', ['run', 'bundle', '--workspace', 'packages/flow-cli'], {
		cwd: agentFleetRoot,
		encoding: 'utf-8',
		timeout: 120000,
		env: { ...process.env, BUNDLE_VERSION: TEST_VERSION },
		shell: true,
	});
}, 120000);

afterAll(() => {
	// Clean up the test bundle to avoid stale artifacts
	for (const p of [bundlePath, updaterBundlePath]) {
		try {
			if (fs.existsSync(p)) fs.unlinkSync(p);
		} catch {
			// ignore cleanup errors
		}
	}
});

function runFlow(args: string[], extraEnv: Record<string, string> = {}): ReturnType<typeof spawnSync> {
	return spawnSync(process.execPath, [bundlePath, ...args], {
		env: {
			...process.env,
			LAUNCHER_BUNDLE_OVERRIDE: bundlePath,
			...extraEnv,
		},
		timeout: 30000,
		encoding: 'utf-8',
	});
}

describe('flow cli self-check -- no duplicate output', () => {
	it('each [ok] line appears exactly once in combined stdout+stderr', () => {
		const result = runFlow(['cli', 'self-check']);
		const combined = String(result.stdout ?? '') + String(result.stderr ?? '');
		const lines = combined.split('\n').filter((l: string) => l.trim().length > 0);

		// Count occurrences of each non-empty line
		const counts = new Map<string, number>();
		for (const line of lines) {
			counts.set(line, (counts.get(line) ?? 0) + 1);
		}

		// No line should appear more than once
		for (const [line, count] of counts.entries()) {
			expect(count, `Line appeared ${count} times: "${line}"`).toBe(1);
		}

		// At least one [ok] line must be present
		expect(lines.some((l: string) => l.startsWith('[ok]'))).toBe(true);
	});
});

describe('flow cli update -- produces output', () => {
	it('writes at least one line to stdout when UPDATER_FORCE=1', () => {
		// Use a temp configDir so no real npm registry is called (current version = up to date sentinel)
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-update-test-'));
		try {
			// Point the updater at a non-existent registry endpoint so it hits network error quickly
			// OR we rely on the fact that BUNDLE_VERSION=0.0.0-test-integration means it's up to date
			// relative to whatever latest is. Either way the updater must print something with force=1.
			const result = spawnSync(process.execPath, [updaterBundlePath], {
				env: {
					...process.env,
					UPDATER_FORCE: '1',
					UPDATER_PKG_NAME: '@wadeck-app/flow-cli',
					// Override configDir to a fresh temp dir (no stale lock files)
					XDG_DATA_HOME: tmpDir,
					APPDATA: tmpDir,
					HOME: tmpDir,
				},
				timeout: 30000,
				encoding: 'utf-8',
			});
			const combined = (result.stdout ?? '') + (result.stderr ?? '');
			// Must produce at least one line of output
			expect(
				combined.trim().length,
				`Expected output from updater but got none. stdout: "${result.stdout}" stderr: "${result.stderr}"`
			).toBeGreaterThan(0);
		} finally {
			try {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			} catch {
				// ignore
			}
		}
	});
});

describe('flow logs -- unknown command error', () => {
	it('exits with code 1 and reports Unknown command on stderr', () => {
		const result = runFlow(['logs']);
		expect(result.status).toBe(1);
		const stderrOutput = result.stderr ?? '';
		expect(stderrOutput).toContain('Unknown command');
		expect(stderrOutput).toContain('logs');
	});
});
