import { parseArgs } from 'node:util';

import { requireAwsRegion } from '../AwsRegion';
import { HostEnvironment } from '../HostEnvironment';
import { NetworkResourceRule } from '../NetworkResourceRule';
import { PresenceDirectory } from '../PresenceDirectory';
import { RunSandboxName } from '../RunSandboxName';
import { SandboxError } from '../SandboxError';
import { MAX_IDLE_STOP_MINUTES, SANDBOX_OPTION_DEFAULTS } from '../SandboxOptionsParser';

export interface HarnessConfig {
	/** `FLOW_DAEMON_WS_URL`, `FLOW_WORKER_SOURCE_ID`, `FLOW_WORKER_TOKEN`: set by the built-in:command source. */
	daemonUrl: string;
	sourceId: string;
	workerToken: string;
	wrapperId: string;
	projectIds: string[];
	projectPaths: string[];
	/** Labels advertised to the daemon; always contains `sandbox`. */
	labels: string[];
	profileAlias: string;
	hostProfile: string;
	region: string;
	agent: string;
	image: string | undefined;
	pull: 'always' | 'missing' | 'never' | undefined;
	cpus: number;
	memory: string;
	idleStopMinutes: number;
	maxConcurrentSandboxes: number;
	presenceDirectory: string;
	/** Optional extra log file (the daemon's view of the child stderr is not always kept). */
	logFile: string | undefined;
	/** The operator knowingly runs with sbx ssh agent forwarding on (the sbx default); otherwise the prerequisite check fails. */
	acceptSshAgentForwarding: boolean;
	/** Refuse a step whose assignment does not carry `requires` that this worker guarantees (the sandbox plugin sets it; the dev harness scripts do not). */
	requireGuarantees: boolean;
	/** Environment for model steps (for example the Bedrock model alias). */
	modelEnvironment: Record<string, string>;
	/** Extra `host:port` network rules opened for every sandbox, on top of what the model tool needs. */
	extraAllowedHosts: string[];
	/** Variables handed to the `aws` CLI (the real home directory when the daemon runs with a redirected one). */
	awsEnvironment: NodeJS.ProcessEnv;
}

function usage(script: string): string {
	return [
		`Usage: node --import tsx packages/flow-sandbox/scripts/${script}`,
		'  --project-id <id> [--project-id <id> ...]   registry id(s) of the project(s) served (see `project list`)',
		'  --profile <alias>=<host aws profile>        for example claude=my-sso-profile',
		'  --region <aws region>                       for example us-east-1',
		'  [--wrapper-id <1-12 [a-z0-9]>] [--labels a,b] [--image <tag>] [--pull always|missing|never] [--agent <kind>]',
		'  [--cpus <n>] [--memory <2g>] [--idle-minutes <n>] [--max-sandboxes <n>] [--presence-dir <dir>] [--log-file <file>]',
		'  [--project-path <folder> ...] [--model-env NAME=VALUE ...] [--extra-allowed-host <host:port> ...] [--accept-ssh-agent-forwarding] [--require-guarantees]',
		'Environment (set by the daemon for a built-in:command source): FLOW_DAEMON_WS_URL, FLOW_WORKER_SOURCE_ID, FLOW_WORKER_TOKEN.',
		'Optional: FLOW_SANDBOX_HOST_HOME, FLOW_SANDBOX_HOST_USERPROFILE, FLOW_SANDBOX_HOST_APPDATA, FLOW_SANDBOX_HOST_LOCALAPPDATA (the real user directories, given to the aws and sbx children only), FLOW_SANDBOX_PRESENCE_DIR (default of --presence-dir, shared with the leftover CLI), SBX_PATH.',
	].join('\n');
}

type Failer = (message: string) => never;

function failWith(script: string, message: string): never {
	throw new SandboxError('invalid-options', `${message}\n${usage(script)}`);
}

function requireEnvironment(env: NodeJS.ProcessEnv, name: string, fail: Failer): string {
	const value = env[name];
	if (value === undefined || value === '') {
		return fail(
			`${name} is not set. The harness is started by the flow daemon through a built-in:command source (flow worker source add <id> --provider built-in:command --command node --arg ...); it cannot be started by hand without the three FLOW_* variables.`
		);
	}
	return value;
}

/** A whole number of at least 1 (sbx takes whole CPUs; a cap of 1.5 sandboxes means nothing). */
function positiveInteger(raw: string | undefined, fallback: number, name: string, fail: Failer): number {
	const value = positiveNumber(raw, fallback, name, fail);
	if (!Number.isInteger(value))
		return fail(`${name} must be a whole number of at least 1, got ${JSON.stringify(raw)}.`);
	return value;
}

function positiveNumber(raw: string | undefined, fallback: number, name: string, fail: Failer): number {
	if (raw === undefined) return fallback;
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0)
		return fail(`${name} must be a number greater than 0, got ${JSON.stringify(raw)}.`);
	return value;
}

/** Strict command line and environment of the harness: an unknown option, a missing value or a bad value is an error. */
export class HarnessConfigParser {
	/** `script` is the file name shown in the usage text (the entry the operator runs). */
	constructor(private readonly script: string = 'HarnessWrapper.mjs') {}

	parse(argv: readonly string[], env: NodeJS.ProcessEnv, defaultPresenceDirectory: string): HarnessConfig {
		const fail: Failer = message => failWith(this.script, message);
		let values: ReturnType<typeof parseArgs>['values'];
		try {
			values = parseArgs({
				args: [...argv],
				strict: true,
				allowPositionals: false,
				options: {
					'wrapper-id': { type: 'string' },
					'project-id': { type: 'string', multiple: true },
					'project-path': { type: 'string', multiple: true },
					labels: { type: 'string' },
					profile: { type: 'string' },
					region: { type: 'string' },
					agent: { type: 'string' },
					image: { type: 'string' },
					pull: { type: 'string' },
					cpus: { type: 'string' },
					memory: { type: 'string' },
					'idle-minutes': { type: 'string' },
					'max-sandboxes': { type: 'string' },
					'presence-dir': { type: 'string' },
					'log-file': { type: 'string' },
					'model-env': { type: 'string', multiple: true },
					'extra-allowed-host': { type: 'string', multiple: true },
					'accept-ssh-agent-forwarding': { type: 'boolean' },
					'require-guarantees': { type: 'boolean' },
				},
			}).values;
		} catch (error) {
			return fail(error instanceof Error ? error.message : String(error));
		}

		const wrapperId = (values['wrapper-id'] as string | undefined) ?? 'harness';
		if (!RunSandboxName.isWrapperId(wrapperId)) {
			fail(`--wrapper-id ${JSON.stringify(wrapperId)} is not valid: use 1 to 12 lowercase letters or digits.`);
		}
		const projectIds = (values['project-id'] as string[] | undefined) ?? [];
		if (projectIds.length === 0)
			fail('--project-id is required: the daemon only routes a step to a worker attached to its project.');

		const profile = values['profile'] as string | undefined;
		const separator = profile?.indexOf('=') ?? -1;
		if (profile === undefined || separator < 1 || separator === profile.length - 1) {
			fail('--profile <alias>=<host aws profile> is required, for example --profile claude=my-sso-profile.');
		}
		const profileAlias = (profile as string).slice(0, separator);
		const hostProfile = (profile as string).slice(separator + 1);

		const region = values['region'] as string | undefined;
		if (region === undefined)
			fail('--region is required (for example us-east-1): the model host rule depends on it.');
		try {
			requireAwsRegion(region as string);
		} catch (error) {
			fail(error instanceof Error ? error.message : String(error));
		}

		const pull = values['pull'] as string | undefined;
		if (pull !== undefined && pull !== 'always' && pull !== 'missing' && pull !== 'never') {
			fail(`--pull must be always, missing or never, got ${JSON.stringify(pull)}.`);
		}
		const idleStopMinutes = positiveNumber(
			values['idle-minutes'] as string | undefined,
			SANDBOX_OPTION_DEFAULTS.idleStopMinutes,
			'--idle-minutes',
			fail
		);
		if (idleStopMinutes > MAX_IDLE_STOP_MINUTES) fail(`--idle-minutes must be at most ${MAX_IDLE_STOP_MINUTES}.`);

		const labels = ['sandbox'];
		for (const label of ((values['labels'] as string | undefined) ?? '').split(',')) {
			const trimmed = label.trim();
			if (trimmed !== '' && !labels.includes(trimmed)) labels.push(trimmed);
		}

		const modelEnvironment: Record<string, string> = {};
		for (const entry of (values['model-env'] as string[] | undefined) ?? []) {
			const index = entry.indexOf('=');
			if (index < 1) fail(`--model-env expects NAME=VALUE, got ${JSON.stringify(entry)}.`);
			modelEnvironment[entry.slice(0, index)] = entry.slice(index + 1);
		}

		const extraAllowedHosts = (values['extra-allowed-host'] as string[] | undefined) ?? [];
		for (const host of extraAllowedHosts) {
			const problem = NetworkResourceRule.problem(host);
			if (problem !== undefined) fail(`invalid --extra-allowed-host ${JSON.stringify(host)}: ${problem}.`);
		}

		// The aws CLI needs none of the FLOW_* launch variables (the worker token lets whoever has it speak as this worker).
		// The real user directories (AWS SSO session) come back here only; the daemon itself keeps its isolated ones (HostEnvironment).
		const awsEnvironment: NodeJS.ProcessEnv = Object.fromEntries(
			Object.entries(HostEnvironment.restoreFor(env)).filter(([name]) => !name.startsWith('FLOW_'))
		);

		return {
			daemonUrl: requireEnvironment(env, 'FLOW_DAEMON_WS_URL', fail),
			sourceId: requireEnvironment(env, 'FLOW_WORKER_SOURCE_ID', fail),
			workerToken: requireEnvironment(env, 'FLOW_WORKER_TOKEN', fail),
			wrapperId,
			projectIds,
			projectPaths: (values['project-path'] as string[] | undefined) ?? [],
			labels,
			profileAlias,
			hostProfile,
			region: region as string,
			agent: (values['agent'] as string | undefined) ?? 'claude',
			image: values['image'] as string | undefined,
			pull: pull as HarnessConfig['pull'],
			cpus: positiveInteger(values['cpus'] as string | undefined, SANDBOX_OPTION_DEFAULTS.cpus, '--cpus', fail),
			memory: (values['memory'] as string | undefined) ?? SANDBOX_OPTION_DEFAULTS.memory,
			idleStopMinutes,
			maxConcurrentSandboxes: positiveInteger(
				values['max-sandboxes'] as string | undefined,
				SANDBOX_OPTION_DEFAULTS.maxConcurrentSandboxes,
				'--max-sandboxes',
				fail
			),
			presenceDirectory: PresenceDirectory.resolve(
				values['presence-dir'] as string | undefined,
				env,
				defaultPresenceDirectory
			),
			logFile: values['log-file'] as string | undefined,
			acceptSshAgentForwarding: values['accept-ssh-agent-forwarding'] === true,
			requireGuarantees: values['require-guarantees'] === true,
			modelEnvironment,
			extraAllowedHosts,
			awsEnvironment,
		};
	}
}
