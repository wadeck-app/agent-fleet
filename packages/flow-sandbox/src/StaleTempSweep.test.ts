import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FakeClock } from './FakeClock';
import { StaleTempSweep } from './StaleTempSweep';
import { RecordingPresence } from './testing/RecordingPresence';
import { RecordingSandboxLog } from './testing/RecordingSandboxLog';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 6, 12);

let temp: string;

beforeEach(() => {
	temp = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-sweep-test-'));
});

afterEach(() => {
	fs.rmSync(temp, { recursive: true, force: true });
});

function directoryAged(name: string, ageHours: number): void {
	const directory = path.join(temp, name);
	fs.mkdirSync(directory);
	fs.writeFileSync(path.join(directory, 'secret'), 'x');
	const when = new Date(NOW - ageHours * HOUR);
	fs.utimesSync(directory, when, when);
}

describe('StaleTempSweep (secret and env directories a crashed wrapper left in the temp directory)', () => {
	it.each([
		{
			label: 'a secrets directory of a dead wrapper, past the age',
			name: 'flow-sbx-exec-secrets-w1-aB3dE9',
			age: 25,
			live: [],
			removed: true,
		},
		{
			label: 'a harness secrets directory of a dead wrapper',
			name: 'flow-sbx-harness-secrets-w1-aB3dE9',
			age: 25,
			live: [],
			removed: true,
		},
		{
			label: 'a secrets directory of a LIVE wrapper',
			name: 'flow-sbx-exec-secrets-w1-aB3dE9',
			age: 25,
			live: ['w1'],
			removed: false,
		},
		{
			label: 'a secrets directory of a dead wrapper, still young',
			name: 'flow-sbx-exec-secrets-w1-aB3dE9',
			age: 1,
			live: [],
			removed: false,
		},
		{
			label: 'an env directory when no wrapper is alive',
			name: 'flow-sandbox-env-aB3dE9',
			age: 30,
			live: [],
			removed: true,
		},
		{
			label: 'an env directory while some wrapper is alive (its step may run for hours)',
			name: 'flow-sandbox-env-aB3dE9',
			age: 30,
			live: ['w9'],
			removed: false,
		},
		{
			label: 'a directory that merely looks similar',
			name: 'flow-sandbox-environment',
			age: 99,
			live: [],
			removed: false,
		},
	])('$label', ({ name, age, live, removed }) => {
		directoryAged(name, age);
		const presence = new RecordingPresence();
		for (const id of live) presence.aliveWrappers.add(id);
		const log = new RecordingSandboxLog();

		const result = new StaleTempSweep({ tempDirectory: temp, presence, clock: new FakeClock(NOW), log }).run();

		expect(fs.existsSync(path.join(temp, name))).toBe(!removed);
		expect(result).toEqual(removed ? [name] : []);
		if (removed) expect(log.text()).toContain(`removed stale ${name}`);
	});

	it('removes nothing that is a file or a link, and never throws when the temp directory is unreadable', () => {
		fs.writeFileSync(path.join(temp, 'flow-sandbox-env-aB3dE9'), 'a file');
		const when = new Date(NOW - 99 * HOUR);
		fs.utimesSync(path.join(temp, 'flow-sandbox-env-aB3dE9'), when, when);
		const log = new RecordingSandboxLog();
		const options = { presence: new RecordingPresence(), clock: new FakeClock(NOW), log };

		expect(new StaleTempSweep({ tempDirectory: temp, ...options }).run()).toEqual([]);
		expect(new StaleTempSweep({ tempDirectory: path.join(temp, 'missing'), ...options }).run()).toEqual([]);
		expect(fs.existsSync(path.join(temp, 'flow-sandbox-env-aB3dE9'))).toBe(true);
		expect(log.text()).toContain('could not read the temp directory');
	});
});
