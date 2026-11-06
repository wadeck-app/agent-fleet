import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { HarnessConfigParser } from './HarnessConfig';

const ENV: NodeJS.ProcessEnv = {
	FLOW_DAEMON_WS_URL: 'ws://127.0.0.1:4101',
	FLOW_WORKER_SOURCE_ID: 'sbx',
	FLOW_WORKER_TOKEN: 'tok',
	PATH: '/usr/bin',
};
const BASE = ['--project-id', 'ab12cd34', '--profile', 'claude=my-profile', '--region', 'us-east-1'];

function parse(argv: string[] = BASE, env: NodeJS.ProcessEnv = ENV) {
	return new HarnessConfigParser().parse(argv, env, '/presence');
}

describe('HarnessConfigParser', () => {
	it('reads the daemon variables and applies the documented defaults', () => {
		expect(parse()).toMatchObject({
			daemonUrl: 'ws://127.0.0.1:4101',
			sourceId: 'sbx',
			workerToken: 'tok',
			wrapperId: 'harness',
			projectIds: ['ab12cd34'],
			labels: ['sandbox'],
			profileAlias: 'claude',
			hostProfile: 'my-profile',
			region: 'us-east-1',
			agent: 'claude',
			image: undefined,
			cpus: 2,
			memory: '2g',
			idleStopMinutes: 5,
			maxConcurrentSandboxes: 4,
			presenceDirectory: path.resolve('/presence'),
			modelEnvironment: {},
			acceptSshAgentForwarding: false,
		});
	});

	it('takes every option', () => {
		const config = parse([
			...BASE,
			'--wrapper-id',
			'w1',
			'--labels',
			'fast, sandbox ,x',
			'--image',
			'flow-sandbox:m4',
			'--pull',
			'never',
			'--cpus',
			'3',
			'--memory',
			'4g',
			'--idle-minutes',
			'0.2',
			'--max-sandboxes',
			'2',
			'--log-file',
			'/tmp/x.log',
			'--model-env',
			'A=1',
			'--model-env',
			'B=two=2',
			'--project-path',
			'/work/app',
			'--accept-ssh-agent-forwarding',
		]);

		expect(config).toMatchObject({
			wrapperId: 'w1',
			labels: ['sandbox', 'fast', 'x'],
			image: 'flow-sandbox:m4',
			pull: 'never',
			cpus: 3,
			memory: '4g',
			idleStopMinutes: 0.2,
			maxConcurrentSandboxes: 2,
			logFile: '/tmp/x.log',
			modelEnvironment: { A: '1', B: 'two=2' },
			projectPaths: ['/work/app'],
			acceptSshAgentForwarding: true,
		});
	});

	it('gives the aws CLI the real home when FLOW_SANDBOX_HOST_HOME is set', () => {
		const config = parse(BASE, { ...ENV, FLOW_SANDBOX_HOST_HOME: '/real/home', HOME: '/fake' });

		expect(config.awsEnvironment['HOME']).toBe('/real/home');
		expect(config.awsEnvironment['USERPROFILE']).toBe('/real/home');
		expect(config.awsEnvironment['PATH']).toBe('/usr/bin');
	});

	it.each(['FLOW_DAEMON_WS_URL', 'FLOW_WORKER_SOURCE_ID', 'FLOW_WORKER_TOKEN'])(
		'names %s and the way to start the harness when it is missing',
		name => {
			const env = { ...ENV };
			delete env[name];

			expect(() => parse(BASE, env)).toThrow(new RegExp(`${name} is not set[\\s\\S]*built-in:command`));
		}
	);

	it.each([
		['no project id', ['--profile', 'claude=p', '--region', 'us-east-1'], '--project-id is required'],
		['no profile', ['--project-id', 'a', '--region', 'us-east-1'], '--profile'],
		[
			'a profile without a host profile',
			['--project-id', 'a', '--profile', 'claude=', '--region', 'us-east-1'],
			'--profile',
		],
		['no region', ['--project-id', 'a', '--profile', 'claude=p'], '--region is required'],
		['a bad region', [...BASE.slice(0, 4), '--region', 'nowhere'], 'not valid'],
		['a bad wrapper id', [...BASE, '--wrapper-id', 'Bad_Id'], '--wrapper-id'],
		['a bad pull', [...BASE, '--pull', 'sometimes'], '--pull'],
		['a zero cpus', [...BASE, '--cpus', '0'], '--cpus'],
		['idle minutes that are too long', [...BASE, '--idle-minutes', '99999'], '--idle-minutes'],
		['a model env without a value', [...BASE, '--model-env', 'NOVALUE'], '--model-env'],
		['an unknown option', [...BASE, '--cpu', '2'], 'Unknown option'],
		['a positional argument', [...BASE, 'stray'], 'Unexpected argument'],
	])('refuses %s with the usage', (_name, argv, fragment) => {
		expect(() => parse(argv)).toThrow(fragment);
		expect(() => parse(argv)).toThrow('Usage: node');
	});

	it('names the script the operator runs in the usage and in a missing-variable error', () => {
		const exec = new HarnessConfigParser('ExecWrapper.mjs');
		expect(() => exec.parse(['--bad'], ENV, '/presence')).toThrow('scripts/ExecWrapper.mjs');
		expect(() => exec.parse(BASE, { PATH: '/usr/bin' }, '/presence')).toThrow('FLOW_DAEMON_WS_URL is not set');
		expect(() => parse(['--bad'])).toThrow('scripts/HarnessWrapper.mjs');
	});
});
