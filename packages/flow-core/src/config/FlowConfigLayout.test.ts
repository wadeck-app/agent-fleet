import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	FLOW_CONFIG_DIR_NAME,
	definitionSnapshotPathOf,
	definitionSnapshotRefOf,
	definitionsDirOf,
	executionsDirOf,
	logsDirOf,
} from './FlowConfigLayout.js';

describe('FlowConfigLayout', () => {
	it('names the config directory flow: the daemon and every host resolve the same location', () => {
		expect(FLOW_CONFIG_DIR_NAME).toBe('flow');
	});

	it('hangs executions/ and logs/ off the config directory', () => {
		expect(executionsDirOf('/cfg')).toBe(path.join('/cfg', 'executions'));
		expect(logsDirOf('/cfg')).toBe(path.join('/cfg', 'logs'));
	});

	it('hangs definitions/ off the config directory', () => {
		expect(definitionsDirOf('/cfg')).toBe(path.join('/cfg', 'definitions'));
	});

	describe('definition snapshots', () => {
		const hash = 'abcdef0123456789'.repeat(4);

		it('names a snapshot <flowId>/<version>-<hash12>.yml, relative to the definitions directory', () => {
			expect(definitionSnapshotRefOf('my-flow', '1.2.0-rc.1', hash)).toBe('my-flow/1.2.0-rc.1-abcdef012345.yml');
		});

		it('resolves a reference under the definitions directory', () => {
			expect(definitionSnapshotPathOf('/cfg/definitions', 'my-flow/1.0.0-abcdef012345.yml')).toBe(
				path.join('/cfg/definitions', 'my-flow', '1.0.0-abcdef012345.yml')
			);
		});

		it.each(['../evil', 'a/b', '', '.', '..', 'with space', 'we\\ird'])('refuses the unsafe flow id %j', flowId => {
			expect(() => definitionSnapshotRefOf(flowId, '1.0.0', hash)).toThrow(/flow id .* \[A-Za-z0-9\._-\]/);
		});

		it.each(['../x/1.0.0-abcdef012345.yml', '/abs/1.0.0-abcdef012345.yml', 'a/b/c.yml', 'a/..'])(
			'refuses the reference %j that is not <flowId>/<file>',
			ref => {
				expect(() => definitionSnapshotPathOf('/cfg/definitions', ref)).toThrow(
					/definition snapshot reference/
				);
			}
		);
	});
});
