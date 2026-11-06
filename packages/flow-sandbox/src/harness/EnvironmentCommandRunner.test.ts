import { describe, expect, it } from 'vitest';

import type { CommandRunRequest, CommandRunner } from '../CommandRunner';
import { EnvironmentCommandRunner } from './EnvironmentCommandRunner';

function recorder(): { runner: CommandRunner; requests: CommandRunRequest[] } {
	const requests: CommandRunRequest[] = [];
	return {
		requests,
		runner: {
			run: request => {
				requests.push(request);
				return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
			},
		},
	};
}

describe('EnvironmentCommandRunner', () => {
	it('gives the command its fixed environment', async () => {
		const { runner, requests } = recorder();

		await new EnvironmentCommandRunner(runner, { HOME: '/real' }).run({
			command: 'aws',
			args: ['x'],
			timeoutMs: 1000,
		});

		expect(requests[0]).toEqual({ command: 'aws', args: ['x'], timeoutMs: 1000, env: { HOME: '/real' } });
	});

	it('lets a request bring its own environment', async () => {
		const { runner, requests } = recorder();

		await new EnvironmentCommandRunner(runner, { HOME: '/real' }).run({
			command: 'aws',
			args: [],
			timeoutMs: 1000,
			env: { HOME: '/other' },
		});

		expect(requests[0]?.env).toEqual({ HOME: '/other' });
	});
});
