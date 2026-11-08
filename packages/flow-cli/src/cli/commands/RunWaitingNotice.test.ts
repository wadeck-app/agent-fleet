import { executionsDirOf } from 'flow-core';
import { removeTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ExecutionStore } from '../../storage/ExecutionStore';
import { runWaitingNotice } from './RunWaitingNotice';

describe('runWaitingNotice', () => {
	let daemonDir: string;
	let store: ExecutionStore;

	beforeEach(() => {
		daemonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-waiting-notice-'));
		fs.mkdirSync(executionsDirOf(daemonDir), { recursive: true });
		store = new ExecutionStore(executionsDirOf(daemonDir));
	});

	afterEach(() => {
		removeTempDirectory(daemonDir);
	});

	it('tells that a run recorded as waiting for a workspace has not started, with the reason and how to cancel', () => {
		const message =
			'Waiting for a free workspace: 1/1 slots are claimed by: abcd1234. Cancel it with: flow cancel wait1234';
		store.create({
			executionId: 'wait1234',
			flowFile: 'f.yml',
			flowId: 'f',
			stepIds: ['a'],
			workspaceWait: { since: new Date().toISOString(), message, run: {} },
		});

		const notice = runWaitingNotice('wait1234', daemonDir);

		expect(notice).toContain('Execution wait1234 is waiting for a workspace and has not started.');
		expect(notice).toContain(message);
	});

	it('says nothing for a run that starts now', () => {
		store.create({ executionId: 'run1abcd', flowFile: 'f.yml', flowId: 'f', stepIds: ['a'] });
		store.update('run1abcd', { status: 'running' });

		expect(runWaitingNotice('run1abcd', daemonDir)).toBeUndefined();
	});

	it('says nothing when there is no record to read', () => {
		expect(runWaitingNotice('nope1234', daemonDir)).toBeUndefined();
	});
});
