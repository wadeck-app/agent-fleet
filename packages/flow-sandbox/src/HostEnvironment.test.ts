import { describe, expect, it } from 'vitest';

import { HostEnvironment } from './HostEnvironment';
import { eachRow } from './testing/EachRow';

describe('HostEnvironment', () => {
	it('puts the real directories back for the wrapper children only, removes the carriers, and changes nothing without them', async () => {
		await eachRow<[string, NodeJS.ProcessEnv, NodeJS.ProcessEnv]>(
			[
				['no carrier (production)', { HOME: '/h', PATH: 'p' }, { HOME: '/h', PATH: 'p' }],
				[
					'all four carriers',
					{
						HOME: '/iso',
						USERPROFILE: '/iso',
						APPDATA: '/iso/a',
						LOCALAPPDATA: '/iso/l',
						FLOW_SANDBOX_HOST_HOME: '/real',
						FLOW_SANDBOX_HOST_USERPROFILE: '/real-up',
						FLOW_SANDBOX_HOST_APPDATA: '/real/a',
						FLOW_SANDBOX_HOST_LOCALAPPDATA: '/real/l',
						KEEP: '1',
					},
					{ HOME: '/real', USERPROFILE: '/real-up', APPDATA: '/real/a', LOCALAPPDATA: '/real/l', KEEP: '1' },
				],
				[
					'only the former HOME carrier: USERPROFILE follows it',
					{ HOME: '/iso', USERPROFILE: '/iso', FLOW_SANDBOX_HOST_HOME: '/real' },
					{ HOME: '/real', USERPROFILE: '/real' },
				],
				[
					'an empty carrier is ignored',
					{ HOME: '/iso', FLOW_SANDBOX_HOST_HOME: '', FLOW_SANDBOX_HOST_APPDATA: '' },
					{ HOME: '/iso' },
				],
				[
					'carrier names in another case (Windows)',
					{ HOME: '/iso', Flow_Sandbox_Host_Home: '/real' },
					{ HOME: '/real', USERPROFILE: '/real' },
				],
			],
			(_name, env, expected) => {
				const before = { ...env };

				expect(HostEnvironment.restoreFor(env)).toEqual(expected);
				expect(env).toEqual(before);
			}
		);
	});

	it('captures the real directories of the launching process for the carriers', () => {
		const captured = HostEnvironment.capture(
			{ USERPROFILE: 'C:\\Users\\me', APPDATA: 'C:\\A', LOCALAPPDATA: '' },
			'C:\\home'
		);

		expect(captured).toEqual({
			FLOW_SANDBOX_HOST_HOME: 'C:\\home',
			FLOW_SANDBOX_HOST_USERPROFILE: 'C:\\Users\\me',
			FLOW_SANDBOX_HOST_APPDATA: 'C:\\A',
		});
		expect(Object.keys(HostEnvironment.capture({}, '/h'))).toEqual([
			'FLOW_SANDBOX_HOST_HOME',
			'FLOW_SANDBOX_HOST_USERPROFILE',
		]);
	});
});
