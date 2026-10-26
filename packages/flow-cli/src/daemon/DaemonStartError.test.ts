import { logsDirOf } from 'flow-core';
import { removeTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	DAEMON_START_ERROR_FILE,
	clearDaemonStartError,
	readDaemonStartError,
	recordDaemonStartError,
} from './DaemonStartError';

let dir: string;
beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-starterr-'));
});
afterEach(() => {
	removeTempDirectory(dir);
});

function logText(): string {
	const logs = logsDirOf(dir);
	return fs
		.readdirSync(logs)
		.map(name => fs.readFileSync(path.join(logs, name), 'utf8'))
		.join('\n');
}

describe('daemon start error record', () => {
	it('reads nothing when no start error was recorded', () => {
		expect(readDaemonStartError(dir)).toBeNull();
	});

	it('records the full message in the daemon log (error level) and in the start error file', () => {
		const err = new Error('"/p/.flow/config.yml" is no longer read.\nMove it: mv a b');
		recordDaemonStartError(dir, err, {});

		const entry = JSON.parse(logText().trim()) as { level: string; msg: string };
		expect(entry.level).toBe('error');
		expect(entry.msg).toContain('Move it: mv a b');
		expect(readDaemonStartError(dir)?.message).toBe(err.message);
		expect(fs.existsSync(path.join(dir, DAEMON_START_ERROR_FILE))).toBe(true);
	});

	it('keeps the stack out of both unless FLOW_DEBUG=1', () => {
		recordDaemonStartError(dir, new Error('boom'), {});
		expect(readDaemonStartError(dir)?.message).toBe('boom');
		expect(logText()).not.toMatch(/\bat .*:\d+:\d+/);

		clearDaemonStartError(dir);
		recordDaemonStartError(dir, new Error('boom'), { FLOW_DEBUG: '1' });
		expect(readDaemonStartError(dir)?.message).toMatch(/\bat .*:\d+:\d+/);
	});

	it('records a non-Error rejection by its text', () => {
		recordDaemonStartError(dir, 'plain text', {});
		expect(readDaemonStartError(dir)?.message).toBe('plain text');
	});

	it('is cleared by clearDaemonStartError, and clearing nothing is fine', () => {
		recordDaemonStartError(dir, new Error('boom'), {});
		clearDaemonStartError(dir);
		expect(readDaemonStartError(dir)).toBeNull();
		expect(() => clearDaemonStartError(dir)).not.toThrow();
	});

	it('says the file is unreadable (and where) rather than hiding that a start error exists', () => {
		fs.writeFileSync(path.join(dir, DAEMON_START_ERROR_FILE), '{not json');
		expect(readDaemonStartError(dir)?.message).toContain(DAEMON_START_ERROR_FILE);
	});
});
