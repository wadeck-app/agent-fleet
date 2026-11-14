import { describe, expect, it } from 'vitest';

import { HostToolEnvironment } from './HostToolEnvironment';

const WORKER_ENV = {
	PATH: '/usr/bin',
	HOME: '/home/u',
	LC_ALL: 'C',
	TASK_PROFILE: 'work',
	AWS_SECRET_ACCESS_KEY: 'AWS-CANARY',
	UNRELATED: 'x',
	FLOW_WORKER_TOKEN: 'WORKER-TOKEN-CANARY',
	FLOW_MCP_TOOL_TOKEN: 'TOOL-TOKEN-CANARY',
	FLOW_MCP_CALLBACK_TOKEN: 'CALLBACK-TOKEN-CANARY',
	FLOW_EXECUTION_ID: 'exec-1',
	FLOW_SANDBOX_HOST_HOME: '/real/home',
};

describe('HostToolEnvironment.build', () => {
	it('hands over the baseline and nothing else when the tool declares no names', () => {
		const result = HostToolEnvironment.build(WORKER_ENV, []);
		expect(result.env).toEqual({ PATH: '/usr/bin', HOME: '/home/u', LC_ALL: 'C' });
		expect(result.denied).toEqual([]);
		expect(result.missing).toEqual([]);
	});

	it('adds exactly the declared names, read from the worker environment', () => {
		const result = HostToolEnvironment.build(WORKER_ENV, ['TASK_PROFILE']);
		expect(result.env).toEqual({ PATH: '/usr/bin', HOME: '/home/u', LC_ALL: 'C', TASK_PROFILE: 'work' });
	});

	it('reports a declared name the worker does not have, instead of silently passing nothing', () => {
		const result = HostToolEnvironment.build(WORKER_ENV, ['NOT_SET_ANYWHERE']);
		expect(result.missing).toEqual(['NOT_SET_ANYWHERE']);
		expect(result.env).not.toHaveProperty('NOT_SET_ANYWHERE');
	});

	it.each([
		'FLOW_WORKER_TOKEN',
		'flow_worker_token',
		'FLOW_MCP_TOOL_TOKEN',
		'FLOW_MCP_CALLBACK_TOKEN',
		'FLOW_EXECUTION_ID',
		'FLOW_SANDBOX_HOST_HOME',
	])('never hands over %s, even when the tool declares it (canary)', name => {
		const environment = { ...WORKER_ENV, [name]: 'CANARY-VALUE' };
		const result = HostToolEnvironment.build(environment, [name]);
		expect(result.denied).toEqual([name]);
		expect(JSON.stringify(result.env)).not.toContain('CANARY');
		expect(Object.keys(result.env).map(key => key.toUpperCase())).not.toContain(name.toUpperCase());
	});

	it('matches names case-insensitively, as Windows does (Path is PATH)', () => {
		const result = HostToolEnvironment.build({ Path: 'C:\\x', SystemRoot: 'C:\\Windows' }, []);
		expect(result.env).toEqual({ Path: 'C:\\x', SystemRoot: 'C:\\Windows' });
	});

	it('skips undefined values', () => {
		expect(HostToolEnvironment.build({ PATH: undefined, HOME: '/h' }, []).env).toEqual({ HOME: '/h' });
	});

	it.each([
		{ name: 'FLOW_WORKER_X', denied: true },
		{ name: 'FLOW_MCP_X', denied: true },
		{ name: 'PATH', denied: false },
		{ name: 'TASK_PROFILE', denied: false },
	])('isDenied($name) is $denied', ({ name, denied }) => {
		expect(HostToolEnvironment.isDenied(name)).toBe(denied);
	});
});
