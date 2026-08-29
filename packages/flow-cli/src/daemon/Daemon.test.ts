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
