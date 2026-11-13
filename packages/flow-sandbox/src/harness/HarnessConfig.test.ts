import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { eachRow } from '../testing/EachRow';
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
			requireGuarantees: false,
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
			'--require-guarantees',
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
			requireGuarantees: true,
		});
	});

	it('takes extra allowed hosts, repeatable, none by default', () => {
		expect(parse().extraAllowedHosts).toEqual([]);
		expect(
			parse([...BASE, '--extra-allowed-host', 'a.example.org:443', '--extra-allowed-host', '*.npmjs.org:443'])
				.extraAllowedHosts
		).toEqual(['a.example.org:443', '*.npmjs.org:443']);
	});

	it('gives the aws CLI the real home when FLOW_SANDBOX_HOST_HOME is set', () => {
		const config = parse(BASE, { ...ENV, FLOW_SANDBOX_HOST_HOME: '/real/home', HOME: '/fake' });

		expect(config.awsEnvironment['HOME']).toBe('/real/home');
		expect(config.awsEnvironment['USERPROFILE']).toBe('/real/home');
		expect(config.awsEnvironment['PATH']).toBe('/usr/bin');
	});

	// The aws CLI (and whatever it spawns, a credential helper) must not receive the daemon's launch credentials.
	it('keeps the daemon launch variables, the worker token first, out of the aws CLI environment', () => {
		const config = parse(BASE, {
			...ENV,
			FLOW_SANDBOX_HOST_HOME: '/real/home',
			FLOW_OTHER: 'x',
			AWS_REGION: 'eu-west-1',
		});

		expect(Object.keys(config.awsEnvironment).filter(name => name.startsWith('FLOW_'))).toEqual([]);
		expect(config.awsEnvironment['AWS_REGION']).toBe('eu-west-1');
		expect(config.workerToken).toBe('tok');
	});

	it('names (each case) and the way to start the harness when it is missing', () =>
		eachRow(['FLOW_DAEMON_WS_URL', 'FLOW_WORKER_SOURCE_ID', 'FLOW_WORKER_TOKEN'], name => {
			const env = { ...ENV };
			delete env[name];

			expect(() => parse(BASE, env)).toThrow(new RegExp(`${name} is not set[\\s\\S]*built-in:command`));
		}));

	it('refuses a bare image tag with the repository:tag form (the preflight can only match that)', () => {
		expect(() => parse([...BASE, '--image', 'm6'])).toThrow(/repository:tag[\s\S]*flow-sandbox:m6/);
	});

	it('refuses (each case) with the usage', () =>
		eachRow(
			[
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
				['a fractional cpus', [...BASE, '--cpus', '1.5'], '--cpus must be a whole number'],
				[
					'a fractional max-sandboxes',
					[...BASE, '--max-sandboxes', '1.5'],
					'--max-sandboxes must be a whole number',
				],
				['idle minutes that are too long', [...BASE, '--idle-minutes', '99999'], '--idle-minutes'],
				['a model env without a value', [...BASE, '--model-env', 'NOVALUE'], '--model-env'],
				['an unknown option', [...BASE, '--cpu', '2'], 'Unknown option'],
				[
					'an extra allowed host without a port',
					[...BASE, '--extra-allowed-host', 'example.org'],
					'invalid --extra-allowed-host',
				],
				[
					'an overbroad wildcard as extra allowed host',
					[...BASE, '--extra-allowed-host', '*.com:443'],
					'would open every host under "com"',
				],
				['a positional argument', [...BASE, 'stray'], 'Unexpected argument'],
			],
			(_name, argv, fragment) => {
				expect(() => parse(argv)).toThrow(fragment);
				expect(() => parse(argv)).toThrow('Usage: node');
			}
		));

	// One resolution for the wrappers and the leftover CLI (PresenceDirectory): option, then FLOW_SANDBOX_PRESENCE_DIR, then default.
	it('presence directory (each case)', () =>
		eachRow(
			[
				{
					label: 'the option wins over the variable',
					argv: ['--presence-dir', '/from-option'],
					env: { FLOW_SANDBOX_PRESENCE_DIR: '/from-env' },
					expected: '/from-option',
				},
				{
					label: 'the variable wins over the default',
					argv: [],
					env: { FLOW_SANDBOX_PRESENCE_DIR: '/from-env' },
					expected: '/from-env',
				},
				{
					label: 'an empty variable counts as unset',
					argv: [],
					env: { FLOW_SANDBOX_PRESENCE_DIR: '' },
					expected: '/presence',
				},
			],
			({ argv, env, expected }) => {
				expect(parse([...BASE, ...argv], { ...ENV, ...env }).presenceDirectory).toBe(path.resolve(expected));
			}
		));

	it('names the script the operator runs in the usage and in a missing-variable error', () => {
		const exec = new HarnessConfigParser('ExecWrapper.mjs');
		expect(() => exec.parse(['--bad'], ENV, '/presence')).toThrow('scripts/ExecWrapper.mjs');
		expect(() => exec.parse(BASE, { PATH: '/usr/bin' }, '/presence')).toThrow('FLOW_DAEMON_WS_URL is not set');
		expect(() => parse(['--bad'])).toThrow('scripts/HarnessWrapper.mjs');
	});
});
