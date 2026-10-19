import { ConfigDir } from '@wadeck-app/shared-cli';
import { FLOW_CONFIG_DIR_NAME } from 'flow-core';
import * as path from 'node:path';

import { flowConfigDir } from './FlowConfigDir.js';

describe('flowConfigDir', () => {
	afterEach(() => vi.unstubAllEnvs());

	it('is the "flow" directory of the shared config root, honouring XDG_CONFIG_HOME', () => {
		vi.stubEnv('XDG_CONFIG_HOME', path.resolve('/custom/config'));
		expect(flowConfigDir()).toBe(path.join(path.resolve('/custom/config'), FLOW_CONFIG_DIR_NAME));
		expect(flowConfigDir()).toBe(ConfigDir.get(FLOW_CONFIG_DIR_NAME));
	});
});
