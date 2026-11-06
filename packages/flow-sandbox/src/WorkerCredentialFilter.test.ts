import { afterEach, describe, expect, it } from 'vitest';

import { WorkerCredentialFilter } from './WorkerCredentialFilter';
import { eachRow } from './testing/EachRow';
import { MockSbxHarness } from './testing/MockSbxHarness';

let harness: MockSbxHarness | undefined;

afterEach(() => {
	harness?.dispose();
	harness = undefined;
});

describe('WorkerCredentialFilter (the launch credential belongs to the wrapper, not to the programs it starts)', () => {
	it('removes (each case)', () =>
		eachRow(
			[
				{
					label: 'the credential and its companions',
					env: { FLOW_WORKER_TOKEN: 't', FLOW_WORKER_SOURCE_ID: 's', PATH: '/bin' },
					expected: { PATH: '/bin' },
				},
				{
					label: 'a lower-case spelling (Windows names are case-insensitive)',
					env: { flow_worker_token: 't', Path: 'p' },
					expected: { Path: 'p' },
				},
				{
					label: 'other FLOW_ variables are kept (they are not credentials of the worker)',
					env: { FLOW_CONFIG_DIR: 'c' },
					expected: { FLOW_CONFIG_DIR: 'c' },
				},
			],
			({ env, expected }) => {
				expect(WorkerCredentialFilter.apply(env)).toEqual(expected);
			}
		));

	it('is what every sbx child gets: the mock sbx sees no FLOW_WORKER_ variable', async () => {
		harness = new MockSbxHarness();
		const runtime = harness.runtime({
			env: { ...harness.env(), FLOW_WORKER_TOKEN: 'secret', FLOW_WORKER_SOURCE_ID: 'x' },
		});

		await runtime.list();

		const calls = harness.calls() as { workerEnv?: string[] }[];
		expect(calls.length).toBeGreaterThan(0);
		for (const call of calls) expect(call.workerEnv).toEqual([]);
	});
});
