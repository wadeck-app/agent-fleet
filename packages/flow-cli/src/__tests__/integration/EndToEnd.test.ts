import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { DaemonResponse } from '../../ipc/Protocol.js';
import { startTestDaemon, waitForExecution } from '../../test-utils/TestHelpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../../test-utils/fixtures');

describe('End-to-end: script step execution', () => {
	it('executes a script step end-to-end', async () => {
		await using daemon = await startTestDaemon();

		const response = (await daemon.client.send('run', {
			type: 'run',
			flowFile: path.join(fixturesDir, 'hello-world.yml'),
			inputs: {},
			cwd: fixturesDir,
		})) as DaemonResponse;

		expect(response.type).toBe('execution_started');
		if (response.type !== 'execution_started') return;

		const execution = await waitForExecution(daemon.daemonDir, response.executionId, 15000);
		expect(execution.status).toBe('completed');
		expect(execution.steps['greet']?.status).toBe('completed');
	}, 20000);
});
