import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { FLOW_CONFIG_DIR_NAME, executionsDirOf, logsDirOf } from './FlowConfigLayout.js';

describe('FlowConfigLayout', () => {
	it('names the config directory flow: the daemon and every host resolve the same location', () => {
		expect(FLOW_CONFIG_DIR_NAME).toBe('flow');
	});

	it('hangs executions/ and logs/ off the config directory', () => {
		expect(executionsDirOf('/cfg')).toBe(path.join('/cfg', 'executions'));
		expect(logsDirOf('/cfg')).toBe(path.join('/cfg', 'logs'));
	});
});
