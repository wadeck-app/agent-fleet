import { describe, expect, it } from 'vitest';

import { eachRow } from '../testing/EachRow';
import { HostScriptEnvironment } from './HostScriptEnvironment';

describe('HostScriptEnvironment', () => {
	const environment = new HostScriptEnvironment();

	it('keeps the baseline whatever the case, drops everything else of the wrapper environment', () => {
		const filtered = environment.filter({
			PATH: '/usr/bin',
			Path: 'C:\\Windows',
			SystemRoot: 'C:\\Windows',
			TEMP: 'C:\\Temp',
			HOME: '/home/me',
			LANG: 'C.UTF-8',
			LC_ALL: 'C',
			FLOW_BASH_PATH: 'C:\\Git\\bin\\bash.exe',
			ANTHROPIC_API_KEY: 'sk-secret',
			FLOW_WORKER_TOKEN: 'launch-token',
			FLOW_SANDBOX_HOST_HOME: '/real/home',
			AWS_PROFILE: 'claude',
			AWS_SECRET_ACCESS_KEY: 'aws-secret',
			CANARY: 'canary',
		});

		expect(Object.keys(filtered.env).sort()).toEqual(
			['FLOW_BASH_PATH', 'HOME', 'LANG', 'LC_ALL', 'PATH', 'Path', 'SystemRoot', 'TEMP'].sort()
		);
		expect(filtered.droppedNames.sort()).toEqual(
			[
				'ANTHROPIC_API_KEY',
				'AWS_PROFILE',
				'AWS_SECRET_ACCESS_KEY',
				'CANARY',
				'FLOW_SANDBOX_HOST_HOME',
				'FLOW_WORKER_TOKEN',
			].sort()
		);
	});

	it('hands on a name the step declares, even one the wrapper keeps to itself', async () => {
		await eachRow(
			[
				['CANARY', 'canary'],
				['AWS_PROFILE', 'from-the-step'],
				['flow_worker_token', 'from-the-step'],
				['FLOW_SANDBOX_HOST_HOME', 'from-the-step'],
			] as const,
			(name, value) => {
				const filtered = environment.filter({ [name]: value, OTHER: 'x' }, new Set([name.toUpperCase()]));

				expect(filtered.env).toEqual({ [name]: value });
				expect(filtered.droppedNames).toEqual(['OTHER']);
			}
		);
	});

	it('ignores undefined values and a missing environment', () => {
		expect(environment.filter({ PATH: undefined }).env).toEqual({});
		expect(environment.filter(undefined)).toEqual({ env: {}, droppedNames: [] });
	});

	it('describes what was dropped by name, sorted and capped, never a value; nothing to say when nothing was dropped', () => {
		const names = Object.fromEntries(
			Array.from({ length: 14 }, (_, index) => [`SECRET_${String(index).padStart(2, '0')}`, 'v'])
		);
		const line = environment.describe(environment.filter(names));

		expect(line).toContain('14 variable(s)');
		expect(line).toContain('SECRET_00');
		expect(line).toContain(',...');
		expect(line).not.toContain('=v');
		expect(environment.describe(environment.filter({ PATH: '/bin' }))).toBeUndefined();
	});
});
