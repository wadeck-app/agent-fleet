// Integration tests for flow CLI entry point.
// These tests execute the bundle built by the bundling project global setup, via node directly.
// They verify:
//   1. `flow cli self-check` does NOT produce duplicate lines in combined stdout+stderr
//   2. the updater produces at least one line of output (not silent), and a dev build refuses to update
//   3. `flow logs` (unknown command) exits with code 1 and reports "Unknown command"
//
// Every spawn runs under createIsolatedCliEnv (temp config dir / home / npm prefix, unreachable registry,
// UPDATER_* / LAUNCHER_* / npm_config_* stripped): incident 2026-10-25, a test run of the real `cli update`
// against the real global npm left the global CLI uninstalled.
import { devBuildRefusalMessage } from '@wadeck-app/shared-cli/ReleaseVersion';
import { removeTempDirectory } from 'flow-core/testing';
import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { createIsolatedCliEnv } from '../test-utils/IsolatedCliEnv';
import { processLeakGuard } from '../test-utils/ProcessLeakGuard';

// Every CLI/daemon process this file starts must be gone when it ends (see ProcessLeakGuard).
processLeakGuard.arm();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// agent-fleet root (4 levels up from src/cli/: src/cli -> src -> flow-cli -> packages -> agent-fleet)
const agentFleetRoot = path.resolve(__dirname, '../../../..');
const bundlePath = path.resolve(agentFleetRoot, 'packages/flow-cli/dist-bundle/flow.cjs');
const updaterBundlePath = path.resolve(agentFleetRoot, 'packages/flow-cli/dist-bundle/flow-updater.cjs');

/** Longest a spawned bundle may run: the updater alone runs `npm root -g` (own cap 10 s) and then `npm view`. */
const CHILD_TIMEOUT_MS = 30_000;
// Every test here blocks on spawnSync, which vitest cannot interrupt: the default 5 s test timeout is only reported after
// the child returned, so a slow machine (alone: 0.4 to 0.6 s per updater run; seen > 5 s in a busy full run) failed
// tests whose child was fine. The test budget must outlast the child's own cap, which then reports a real hang.
vi.setConfig({ testTimeout: CHILD_TIMEOUT_MS + 15_000 });

/** Runs `script` under a fresh isolated environment, removed afterwards. `prepare` may seed the config dir. */
function runIsolated(
	script: string,
	args: string[],
	opts: { extraEnv?: NodeJS.ProcessEnv; prepare?: (configDir: string) => void } = {}
): { result: SpawnSyncReturns<string>; configDir: string } {
	const isolation = createIsolatedCliEnv({ extra: opts.extraEnv });
	try {
		opts.prepare?.(isolation.configDir);
		const result = spawnSync(process.execPath, [script, ...args], {
			env: isolation.env,
			timeout: CHILD_TIMEOUT_MS,
			encoding: 'utf-8',
		});
		return { result, configDir: isolation.configDir };
	} finally {
		removeTempDirectory(isolation.root);
	}
}

// The bundle is built once, before any test file, by the bundling project global setup (src/test-utils/BundleGlobalSetup.ts).
function runFlow(args: string[], extraEnv: NodeJS.ProcessEnv = {}): SpawnSyncReturns<string> {
	return runIsolated(bundlePath, args, { extraEnv: { LAUNCHER_BUNDLE_OVERRIDE: bundlePath, ...extraEnv } }).result;
}

/** The updater bundle is stamped with a CalVer test version (see BundleGlobalSetup), so it reaches the offline outcome reporting. */
function runUpdater(prepare?: (configDir: string) => void): string {
	const { result } = runIsolated(updaterBundlePath, [], {
		extraEnv: { UPDATER_FORCE: '1', UPDATER_PKG_NAME: '@wadeck-app/flow-cli' },
		prepare,
	});
	return String(result.stdout ?? '') + String(result.stderr ?? '');
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

describe('flow cli update from a dev build', () => {
	it('refuses with an actionable message and a non-zero exit, before spawning any updater', () => {
		// The bundle is stamped 0.0.0-test-bundling: not a CalVer release.
		const { result } = runIsolated(bundlePath, ['cli', 'update'], {
			extraEnv: { LAUNCHER_BUNDLE_OVERRIDE: bundlePath },
		});
		const combined = String(result.stdout ?? '') + String(result.stderr ?? '');
		expect(result.status).toBe(1);
		expect(combined).toContain('refusing to update the global install of flow');
		expect(combined).toContain('0.0.0-test-bundling');
		// Exact shared message (shared-cli ReleaseVersion), not a local copy.
		expect(combined).toContain(devBuildRefusalMessage('flow', '0.0.0-test-bundling'));
		// "Running updater" is printed right before the updater is spawned.
		expect(combined).not.toContain('Running updater');
	});
});

describe('flow-updater -- produces output', () => {
	it('writes at least one line to stdout when UPDATER_FORCE=1', () => {
		const combined = runUpdater();
		// Must produce at least one line of output
		expect(combined.trim().length, `Expected output from updater but got none.`).toBeGreaterThan(0);
		// The outcome must be attributed to the updater and name the failure, not just be non-empty.
		expect(combined).toContain('[flow-updater]');
		expect(combined).toContain('version fetch failed');
		// The status block is always printed, and never the old vague "unexpected" message.
		expect(combined).toContain('[flow-updater] current:');
		expect(combined).toContain('[flow-updater] latest:');
		expect(combined).toContain('[flow-updater] status:  update check failed --');
		expect(combined).not.toContain('unexpected');
	});

	it('reports autoUpdate disabled explicitly, not a silent/vague message', () => {
		// UPDATER_FORCE without UPDATER_MANUAL: force bypasses the check-interval, but the
		// autoUpdate:false flag in config.yml is only bypassed by UPDATER_MANUAL.
		const combined = runUpdater(configDir => {
			fs.writeFileSync(path.join(configDir, 'config.yml'), 'autoUpdate: false\n');
		});
		expect(combined).toContain('[flow-updater] status:  skipped -- autoUpdate is disabled in');
		expect(combined).not.toContain('unexpected');
	});

	it('ignores a stale state file left over from a previous run', () => {
		const combined = runUpdater(configDir => {
			// Simulate a prior run that successfully updated, long before this run starts.
			fs.writeFileSync(
				path.join(configDir, 'update-state.json'),
				JSON.stringify({
					status: 'success',
					currentVersion: '0.0.0-ancient',
					targetVersion: '0.0.0-also-ancient',
					timestamp: Date.now() - 60 * 60 * 1000,
				})
			);
		});
		// This run's own outcome (fetch failed, since the registry is unreachable) must win
		// over the stale leftover 'success' state -- never report a success that didn't happen.
		expect(combined).toContain('[flow-updater] status:  update check failed --');
		expect(combined).not.toContain('status:  updated to');
		expect(combined).not.toContain('unexpected');
	});
});

describe('flow logs -- alias for cli logs', () => {
	it('exits 0 and reports log file status on stdout (no longer unknown command)', () => {
		// 'flow logs' is now a registered top-level alias for 'flow cli logs'.
		// It exits 0 regardless of whether a log file exists.
		// A private config home (the isolated one): the machine's real log of the day can exceed spawnSync's 1 MiB output limit, which kills the child (status null).
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

describe('flow --pid', () => {
	it('does not crash with "unknown option --pid"', () => {
		const result = runFlow(['--pid']);
		const combined = String(result.stdout ?? '') + String(result.stderr ?? '');
		expect(combined).not.toContain('unknown option');
		// exit code 2 means the daemon is not running: acceptable, not an error for this test
		expect(result.status).not.toBe(1);
	});
});
