import { describe, expect, it } from 'vitest';

import { consumeDaemonModeFlag } from './DaemonModeFlag';

describe('consumeDaemonModeFlag', () => {
	it('says daemon and removes the marker so nothing the daemon starts inherits it', () => {
		const env: NodeJS.ProcessEnv = { FLOW_DAEMON_MODE: '1', PATH: 'x' };

		expect(consumeDaemonModeFlag(env)).toBe(true);
		expect('FLOW_DAEMON_MODE' in env).toBe(false);
		expect(env['PATH']).toBe('x');
	});

	it('says not daemon when the marker is absent', () => {
		expect(consumeDaemonModeFlag({})).toBe(false);
	});

	it('says not daemon for any other value, and still removes the variable', () => {
		const env: NodeJS.ProcessEnv = { FLOW_DAEMON_MODE: '0' };

		expect(consumeDaemonModeFlag(env)).toBe(false);
		expect('FLOW_DAEMON_MODE' in env).toBe(false);
	});
});
