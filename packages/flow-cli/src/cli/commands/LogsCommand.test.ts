import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logsCommand } from './LogsCommand';

// Reading, tailing and formatting are covered in flow-core (logs/*.test.ts); this file covers what the
// command adds: the "no log file" message, the stdout writes and the follow loop ended by SIGINT.

const today = (): string => new Date().toISOString().slice(0, 10);

describe('logsCommand', () => {
	let configDir: string;
	let logFile: string;
	let out: string[];
	const write = (text: string): void => {
		out.push(text);
	};

	beforeEach(() => {
		configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-logs-cmd-'));
		fs.mkdirSync(path.join(configDir, 'logs'));
		logFile = path.join(configDir, 'logs', `${today()}.ndjson`);
		out = [];
	});

	afterEach(() => {
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it('says which file is missing instead of printing nothing', async () => {
		await logsCommand(configDir, { follow: false, lines: 50, human: false }, write);
		expect(out.join('')).toBe(`No log file for today: ${logFile}\n`);
	});

	it('prints the last N raw lines', async () => {
		fs.writeFileSync(logFile, 'a\nb\nc\n');
		await logsCommand(configDir, { follow: false, lines: 2, human: false }, write);
		expect(out.join('')).toBe('b\nc\n');
	});

	it('formats lines for humans with --human', async () => {
		fs.writeFileSync(
			logFile,
			JSON.stringify({ ts: '2026-10-18T10:00:00.000Z', level: 'warn', msg: 'careful' }) + '\n'
		);
		await logsCommand(configDir, { follow: false, lines: 50, human: true }, write);
		expect(out.join('')).toMatch(/\[WARN \] careful\n$/);
	});

	it('follows appended lines until SIGINT, even when the file did not exist yet', async () => {
		const sigintBefore = process.listenerCount('SIGINT');
		const done = logsCommand(configDir, { follow: true, lines: 50, human: false }, write);
		expect(out.join('')).toContain('No log file for today');
		fs.writeFileSync(logFile, 'late line\n');
		await vi.waitFor(() => expect(out.join('')).toContain('late line\n'), { timeout: 3000, interval: 50 });
		process.emit('SIGINT');
		await done;
		expect(process.listenerCount('SIGINT')).toBe(sigintBefore);
	});
});
