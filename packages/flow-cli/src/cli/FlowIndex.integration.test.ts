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
// agent-fleet root (4 levels up from src/cli/: src/cli -> src -> flow-cli -> packages -> agent-fleet)
const agentFleetRoot = path.resolve(__dirname, '../../../..');
const bundlePath = path.resolve(agentFleetRoot, 'packages/flow-cli/dist-bundle/flow.cjs');
const updaterBundlePath = path.resolve(agentFleetRoot, 'packages/flow-cli/dist-bundle/flow-updater.cjs');

const TEST_VERSION = '0.0.0-test-integration';

beforeAll(() => {
	// `bundle` runs esbuild over dist/, so src must be compiled first or the bundle under test is
	// whatever stale dist/ happens to be on disk.
	// Use shell: true so npm resolves correctly on Windows (npm.cmd)
	for (const script of ['build', 'bundle']) {
		execFileSync('npm', ['run', script, '--workspace', 'packages/flow-cli'], {
			cwd: agentFleetRoot,
			encoding: 'utf-8',
			timeout: 120000,
			env: { ...process.env, BUNDLE_VERSION: TEST_VERSION },
			shell: true,
		});
	}
}, 180000);

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
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-update-test-'));
		try {
			// FLOW_CONFIG_DIR is the only env var the updater honours for its config dir: ConfigDir.get
			// reads XDG_CONFIG_HOME or os.homedir(), and os.homedir() ignores $HOME on Windows, so
			// overriding HOME/APPDATA/XDG_DATA_HOME would leak into the developer's real ~/.config/flow.
			//
			// NPM_CONFIG_USERCONFIG replaces ~/.npmrc so the developer's `@wadeck-app:registry` and auth
			// token cannot apply. Both the default and the scoped registry point at a closed port, so
			// `npm view` fails fast: the run is offline, deterministic, and installs nothing globally.
			const npmrcPath = path.join(tmpDir, 'npmrc');
			const deadRegistry = 'http://127.0.0.1:1/';
			fs.writeFileSync(
				npmrcPath,
				`registry=${deadRegistry}\n@wadeck-app:registry=${deadRegistry}\nfetch-retries=0\n`
			);

			// Running under npm/npx exports NPM_CONFIG_USERCONFIG pointing at the real ~/.npmrc.
			// Windows env vars are case-insensitive while JS object keys are not, so adding a
			// lowercase `npm_config_userconfig` would leave a duplicate that the real path wins.
			// Drop every case variant first, then set exactly one canonical key.
			const childEnv: Record<string, string | undefined> = {};
			for (const [key, value] of Object.entries(process.env)) {
				if (!/^npm_config_userconfig$/i.test(key)) childEnv[key] = value;
			}

			const result = spawnSync(process.execPath, [updaterBundlePath], {
				env: {
					...childEnv,
					UPDATER_FORCE: '1',
					UPDATER_PKG_NAME: '@wadeck-app/flow-cli',
					FLOW_CONFIG_DIR: tmpDir,
					NPM_CONFIG_USERCONFIG: npmrcPath,
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
			// The outcome must be attributed to the updater and name the failure, not just be non-empty.
			expect(combined).toContain('[flow-updater]');
			expect(combined).toContain('version fetch failed');
		} finally {
			try {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			} catch {
				// ignore
			}
		}
	});
});

describe('flow logs -- alias for cli logs', () => {
	it('exits 0 and reports log file status on stdout (no longer unknown command)', () => {
		// 'flow logs' is now a registered top-level alias for 'flow cli logs'.
		// It exits 0 regardless of whether a log file exists.
		const result = runFlow(['logs']);
		expect(result.status).toBe(0);
		const stdoutOutput = String(result.stdout ?? '');
		// Either shows log content or "No log file for today" message
		expect(stdoutOutput).toBeTruthy();
	});

	it('truly unknown command exits 1 and writes error (stderr, visible via bypass)', () => {
		const result = runFlow(['totally-unknown-xyz']);
		expect(result.status).toBe(1);
		const combined = String(result.stdout ?? '') + String(result.stderr ?? '');
		expect(combined).toContain('Unknown command');
	});
});
