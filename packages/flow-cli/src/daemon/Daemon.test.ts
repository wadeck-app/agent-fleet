import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
		const { writeDaemonLog } = await import('./Daemon.js');
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
		const { writeDaemonLog } = await import('./Daemon.js');
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
		const { declaresPlugins } = await import('./Daemon.js');
		expect(declaresPlugins(path.join(tmpDir, 'config.yml'))).toBe(false);
	});

	// The regression that motivated this helper: after D#58 the global plugin config
	// shares a file with daemon settings, so file existence alone must not imply
	// "plugins are configured" -- that forced a spurious "No workspace provider".
	it('returns false for a daemon-only config carrying no plugins section', async () => {
		const { declaresPlugins } = await import('./Daemon.js');
		const configPath = path.join(tmpDir, 'config.yml');
		fs.writeFileSync(configPath, 'autoUpdate: false\nqueue:\n  concurrency: 3\n', 'utf8');

		expect(declaresPlugins(configPath)).toBe(false);
	});

	it('returns true when a plugins section is present', async () => {
		const { declaresPlugins } = await import('./Daemon.js');
		const configPath = path.join(tmpDir, 'config.yml');
		fs.writeFileSync(configPath, 'plugins:\n  workspace:\n    use: wt\n', 'utf8');

		expect(declaresPlugins(configPath)).toBe(true);
	});

	it('throws on malformed YAML rather than guessing', async () => {
		const { declaresPlugins } = await import('./Daemon.js');
		const configPath = path.join(tmpDir, 'config.yml');
		fs.writeFileSync(configPath, 'plugins:\n  workspace: [unclosed\n', 'utf8');

		expect(() => declaresPlugins(configPath)).toThrow(/Failed to parse flow config/);
		expect(() => declaresPlugins(configPath)).toThrow(configPath);
	});
});

describe('loadFlowHooks', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-hooks-')));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('reads the hooks section from the project .flow/config.yml', async () => {
		const { loadFlowHooks } = await import('./Daemon.js');
		fs.mkdirSync(path.join(tmpDir, '.flow'), { recursive: true });
		fs.writeFileSync(
			path.join(tmpDir, '.flow', 'config.yml'),
			'hooks:\n  onFlowEnd:\n    - command: echo done\n',
			'utf8'
		);

		expect(loadFlowHooks(tmpDir)).toHaveProperty('onFlowEnd');
	});

	// Walk-up behaviour: a run started in a subdirectory must still find the hooks.
	it('resolves hooks from a subdirectory of the project', async () => {
		const { loadFlowHooks } = await import('./Daemon.js');
		fs.mkdirSync(path.join(tmpDir, '.flow'), { recursive: true });
		fs.writeFileSync(
			path.join(tmpDir, '.flow', 'config.yml'),
			'hooks:\n  onFlowEnd:\n    - command: echo done\n',
			'utf8'
		);
		const nested = path.join(tmpDir, 'packages', 'deep');
		fs.mkdirSync(nested, { recursive: true });

		expect(loadFlowHooks(nested)).toHaveProperty('onFlowEnd');
	});

	it('returns no hooks when the project has no config file', async () => {
		const { loadFlowHooks } = await import('./Daemon.js');
		// A .git root makes this a project without giving it a .flow/config.yml.
		fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });

		expect(loadFlowHooks(tmpDir)).toEqual({});
	});

	it('throws on malformed YAML instead of silently dropping every hook', async () => {
		const { loadFlowHooks } = await import('./Daemon.js');
		fs.mkdirSync(path.join(tmpDir, '.flow'), { recursive: true });
		fs.writeFileSync(path.join(tmpDir, '.flow', 'config.yml'), 'hooks:\n  onFlowEnd: [unclosed\n', 'utf8');

		expect(() => loadFlowHooks(tmpDir)).toThrow(/Failed to parse flow config/);
	});
});
