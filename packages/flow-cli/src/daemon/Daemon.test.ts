import { UpdateManager } from '@wadeck-app/shared-cli';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlowConfigLoader } from '../config/FlowConfig.js';
import { observeFor } from '../test-utils/WaitHelpers';
import { Daemon } from './Daemon.js';
import { writeDaemonLog } from './DaemonLog.js';
import { declaresPlugins } from './declaresPlugins.js';

// Daemon.js is imported statically: dynamic imports inside the tests put the cold load of the daemon module graph
// (1.7 s idle, more under load) inside the first test's 5 s timeout.
// Test the writeDaemonLog helper (exported from Daemon.ts)
describe('writeDaemonLog', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-daemon-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('creates NDJSON log file with daemon-started entry', async () => {
		writeDaemonLog(tmpDir, 'info', 'Daemon started');

		const today = new Date().toISOString().slice(0, 10);
		const logFile = path.join(tmpDir, `${today}.ndjson`);
		expect(fs.existsSync(logFile)).toBe(true);

		const content = fs.readFileSync(logFile, 'utf-8').trim();
		const parsed = JSON.parse(content) as { level: string; msg: string; ts: string };
		expect(parsed.level).toBe('info');
		expect(parsed.msg).toBe('Daemon started');
		expect(typeof parsed.ts).toBe('string');
	});

	it('appends multiple entries to the same file', async () => {
		writeDaemonLog(tmpDir, 'info', 'Daemon started');
		writeDaemonLog(tmpDir, 'info', 'Daemon stopped');

		const today = new Date().toISOString().slice(0, 10);
		const logFile = path.join(tmpDir, `${today}.ndjson`);
		const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
		expect(lines).toHaveLength(2);
		expect((JSON.parse(lines[1]!) as { msg: string }).msg).toBe('Daemon stopped');
	});
});

describe('declaresPlugins', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-declares-plugins-')));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('returns false when the config file does not exist', async () => {
		expect(declaresPlugins(path.join(tmpDir, 'config.yml'))).toBe(false);
	});

	// The regression that motivated this helper: after D#58 the global plugin config
	// shares a file with daemon settings, so file existence alone must not imply
	// "plugins are configured" -- that forced a spurious "No workspace provider".
	it('returns false for a daemon-only config carrying no plugins section', async () => {
		const configPath = path.join(tmpDir, 'config.yml');
		fs.writeFileSync(configPath, 'autoUpdate: false\nqueue:\n  concurrency: 3\n', 'utf8');

		expect(declaresPlugins(configPath)).toBe(false);
	});

	it('returns true when a plugins section is present', async () => {
		const configPath = path.join(tmpDir, 'config.yml');
		fs.writeFileSync(configPath, 'plugins:\n  workspace:\n    use: wt\n', 'utf8');

		expect(declaresPlugins(configPath)).toBe(true);
	});

	it('throws on malformed YAML rather than guessing', async () => {
		const configPath = path.join(tmpDir, 'config.yml');
		fs.writeFileSync(configPath, 'plugins:\n  workspace: [unclosed\n', 'utf8');

		expect(() => declaresPlugins(configPath)).toThrow(/Failed to parse flow config/);
		expect(() => declaresPlugins(configPath)).toThrow(configPath);
	});
});

// So the daemon's own updater cache -- the one StepRouter's version preference reads --
// doesn't go stale for days while a long-running daemon never happens to restart.
describe('periodic update check', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-daemon-update-')));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('schedules a background update check on startup, keeps re-triggering it on checkIntervalMs, and stops on shutdown', async () => {
		// Real spawn is replaced with a spy: scheduleBackgroundUpdate otherwise launches the
		// real flow-updater.cjs child process against the real user config dir (D#TBD).
		fs.writeFileSync(path.join(tmpDir, 'config.yml'), 'checkInterval: 20ms\n', 'utf8');
		const scheduleSpy = vi.spyOn(UpdateManager.prototype, 'scheduleBackgroundUpdate').mockImplementation(() => {});
		const handle = await Daemon.start(
			{ ...FlowConfigLoader.DEFAULT, worker: { ...FlowConfigLoader.DEFAULT.worker, wsPort: 0 } },
			tmpDir,
			{ port: 0 }
		);

		try {
			await vi.waitFor(() => expect(scheduleSpy).toHaveBeenCalled(), { timeout: 2000, interval: 10 });
			const callsAfterStartup = scheduleSpy.mock.calls.length;
			await vi.waitFor(() => expect(scheduleSpy.mock.calls.length).toBeGreaterThan(callsAfterStartup), {
				timeout: 2000,
				interval: 10,
			});
		} finally {
			await handle.stop('idle');
		}

		const callsAtStop = scheduleSpy.mock.calls.length;
		await observeFor(60);
		// Not cleared would mean the timer keeps firing against a torn-down daemon.
		expect(scheduleSpy.mock.calls.length).toBe(callsAtStop);

		scheduleSpy.mockRestore();
	});

	// Re-arming at exactly checkIntervalMs beats against shared-updater's own
	// cache.lastCheckedAt gate inside the spawned updater (same WorkerCommand.ts fix, see
	// its UPDATER_SKIP_THROTTLE comment) -- without this, timing jitter makes the gate skip
	// roughly every other tick, silently halving the real cadence.
	it('tells the spawned updater to skip its own throttle, since the daemon already owns the schedule', async () => {
		const previousEnv = process.env['UPDATER_SKIP_THROTTLE'];
		delete process.env['UPDATER_SKIP_THROTTLE'];
		const scheduleSpy = vi.spyOn(UpdateManager.prototype, 'scheduleBackgroundUpdate').mockImplementation(() => {});
		const handle = await Daemon.start(
			{ ...FlowConfigLoader.DEFAULT, worker: { ...FlowConfigLoader.DEFAULT.worker, wsPort: 0 } },
			tmpDir,
			{ port: 0 }
		);

		try {
			expect(process.env['UPDATER_SKIP_THROTTLE']).toBe('1');
		} finally {
			await handle.stop('idle');
			scheduleSpy.mockRestore();
			if (previousEnv === undefined) delete process.env['UPDATER_SKIP_THROTTLE'];
			else process.env['UPDATER_SKIP_THROTTLE'] = previousEnv;
		}
	});
});
