import { beforeEach, describe, expect, it } from 'vitest';

import type { JsonObject } from '../harness/HarnessMessages';
import { RunHoldAnnouncer, WORKER_FEATURE_RUN_HOLD } from './RunHoldAnnouncer';

let held: string | undefined;
let sent: JsonObject[];
let announcer: RunHoldAnnouncer;

beforeEach(() => {
	held = undefined;
	sent = [];
	announcer = new RunHoldAnnouncer({ heldRun: () => held, send: message => sent.push(message) });
});

describe('RunHoldAnnouncer', () => {
	it('uses the feature name of the daemon protocol', () => {
		expect(WORKER_FEATURE_RUN_HOLD).toBe('run-hold');
	});

	it('sends nothing while the daemon has not enabled the feature', () => {
		held = 'run1';
		announcer.sync();
		expect(sent).toEqual([]);
	});

	it('announces the run held once enabled, and nothing when none is held', () => {
		announcer.enable();
		expect(sent).toEqual([]);

		held = 'run1';
		announcer.sync();

		expect(sent).toEqual([{ type: 'worker_hold', executionId: 'run1' }]);
	});

	it('does not repeat an announcement that did not change', () => {
		announcer.enable();
		held = 'run1';
		announcer.sync();
		announcer.sync();
		expect(sent).toHaveLength(1);
	});

	it('releases with executionId null when the sandbox is gone', () => {
		announcer.enable();
		held = 'run1';
		announcer.sync();
		held = undefined;
		announcer.sync();
		expect(sent).toEqual([
			{ type: 'worker_hold', executionId: 'run1' },
			{ type: 'worker_hold', executionId: null },
		]);
	});

	it('releases run X before holding run Y: it never announces Y while the daemon believes X is held', () => {
		announcer.enable();
		held = 'X';
		announcer.sync();
		held = 'Y';
		announcer.sync();
		expect(sent.map(message => message['executionId'])).toEqual(['X', null, 'Y']);
	});

	it('enabling again (a new connection) re-announces the run still held', () => {
		held = 'run1';
		announcer.enable();
		announcer.disable();
		announcer.enable();
		expect(sent.map(message => message['executionId'])).toEqual(['run1', 'run1']);
	});

	it('stops sending after disable until the next enable', () => {
		announcer.enable();
		announcer.disable();
		held = 'run1';
		announcer.sync();
		expect(sent).toEqual([]);
	});
});
