// Worker-type plugin "sandbox" (implementation "exec"): the flow daemon asks it for a worker, it starts the sandbox wrapper
// (wrapper.cjs, next to this file) that runs the steps of a bound run inside an sbx sandbox.
//
// Plain, self-contained ES module: it is loaded by the daemon from a plugins directory with no node_modules beside it, so it
// imports only node: modules. Everything heavy (the engine, the sandbox layer) lives in wrapper.cjs, a separate process.
// Built into dist-plugin/plugin-sandbox/ by `npm run bundle --workspace flow-sandbox`; declared with
//   flow worker source add <id> --provider sandbox --plugin sandbox.exec --plugins-dir <dist-plugin> --option projects=<ids> ...
// (README, "Plugin"). The ref `sandbox.exec` gives the worker type `sandbox`: the flow binds a run with `workerType: sandbox`.
//
// Two environment variables exist for TESTS ONLY, read from the daemon's own environment:
//   FLOW_SANDBOX_PLUGIN_WRAPPER     path of a script that stands in for wrapper.cjs
//   FLOW_SANDBOX_PLUGIN_DISPOSE_MS  total bound of dispose() instead of 25 s
// FLOW_SANDBOX_PRESENCE_DIR (the wrapper's own setting) is honoured when looking for a wrapper that is already alive.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PREFLIGHT_TIMEOUT_MS = 25_000;
const DISPOSE_BOUND_MS = 25_000;
const STDERR_TAIL_LINES = 20;
const STDERR_TAIL_CHARACTERS = 4000;

/** name -> a short example shown with every error about it */
const EXAMPLES = {
	projects: 'projects=ab12cd34,ef56ab78 (registry ids, see `flow project list`)',
	region: 'region=us-east-1',
	profiles: 'profiles=claude=my-sso-profile',
	image: 'image=flow-sandbox:m7',
	pull: 'pull=never',
	cpus: 'cpus=2',
	memory: 'memory=2g',
	maxConcurrentSandboxes: 'maxConcurrentSandboxes=4',
	idleStopMinutes: 'idleStopMinutes=5',
	extraAllowedHosts: 'extraAllowedHosts=registry.example.org:443,*.npmjs.org:443',
	acceptSshAgentForwarding: 'acceptSshAgentForwarding=true',
	sbxPath: 'sbxPath=C:\\Users\\me\\AppData\\Local\\DockerSandboxes\\bin\\sbx.exe',
};
const REQUIRED = ['projects', 'region', 'profiles'];

/** The plugin's own errors are plain: a plugin loaded from a directory cannot use flow's PluginConfigurationError class. */
function fail(message) {
	const error = new Error(message);
	error.name = 'PluginConfigurationError';
	return error;
}

function optionError(name, problem) {
	return fail(`worker type sandbox: option "${name}" ${problem}. Example: --option ${EXAMPLES[name]}`);
}

function list(name, value) {
	const items = value.split(',');
	if (items.some(item => item === '' || item.trim() !== item)) {
		throw optionError(name, 'has an empty item or spaces around an item (items are separated by single commas)');
	}
	return items;
}

function whole(name, value) {
	if (!/^[1-9]\d*$/.test(value)) throw optionError(name, `must be a whole number of at least 1, found "${value}"`);
	return value;
}

/** The flat `--option key=value` strings as a checked object. Every problem names the option and gives an example. */
function parseOptions(raw) {
	if (raw === undefined || raw === null) raw = {};
	if (typeof raw !== 'object' || Array.isArray(raw))
		throw fail('worker type sandbox: the source options must be key=value pairs');
	for (const name of Object.keys(raw)) {
		if (!(name in EXAMPLES)) {
			throw fail(
				`worker type sandbox: Unknown option "${name}". Supported options: ${Object.keys(EXAMPLES).join(', ')}. Nothing was applied, so fix the name rather than assuming a default took effect. Example: --option ${EXAMPLES.cpus}`
			);
		}
		const value = raw[name];
		if (typeof value !== 'string') throw optionError(name, `must be a string, found ${JSON.stringify(value)}`);
		if (value.trim() === '') throw optionError(name, 'is empty (leave the option out to use the default)');
	}
	for (const name of REQUIRED) {
		if (raw[name] === undefined) {
			throw fail(
				`worker type sandbox: option "${name}" is required. The daemon hands a plugin source no projects, region or AWS profile of its own. Example: --option ${EXAMPLES[name]}`
			);
		}
	}

	const projects = list('projects', raw.projects);
	if (new Set(projects).size !== projects.length) throw optionError('projects', 'names a project twice');
	if (projects.some(id => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id))) {
		throw optionError(
			'projects',
			'has an id with a character a project id cannot have (letters, digits, ".", "_", "-")'
		);
	}
	if (!/^[a-z]{2}(?:-[a-z]+)+-\d{1,2}$/.test(raw.region))
		throw optionError('region', `is not an AWS region, found "${raw.region}"`);

	// alias=host profile; the entry is split at the FIRST "=", so a host profile may contain "=". A comma separates entries,
	// so a profile name with a comma cannot be written: it is refused, never cut.
	const entries = list('profiles', raw.profiles);
	const bad = entries.find(entry => entry.indexOf('=') < 1 || entry.endsWith('='));
	if (bad !== undefined) {
		throw optionError(
			'profiles',
			`has the entry "${bad}" which is not alias=profile (a comma separates entries, so a profile name cannot contain one)`
		);
	}
	if (entries.length !== 1) {
		throw optionError(
			'profiles',
			'must name exactly one alias in this version (the exec wrapper serves one profile alias)'
		);
	}
	const separator = entries[0].indexOf('=');
	const profileAlias = entries[0].slice(0, separator);
	const hostProfile = entries[0].slice(separator + 1);
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profileAlias) || /[\0\r\n]/.test(hostProfile)) {
		throw optionError(
			'profiles',
			`has an alias or a profile with characters that are not allowed ("${entries[0]}")`
		);
	}

	const parsed = { projects, region: raw.region, profileAlias, hostProfile, extraAllowedHosts: [] };
	if (raw.image !== undefined) {
		if (/\s/.test(raw.image)) throw optionError('image', 'must not contain whitespace');
		parsed.image = raw.image;
	}
	if (raw.pull !== undefined) {
		if (!['always', 'missing', 'never'].includes(raw.pull))
			throw optionError('pull', 'must be one of always, missing or never');
		parsed.pull = raw.pull;
	}
	if (raw.cpus !== undefined) parsed.cpus = whole('cpus', raw.cpus);
	if (raw.maxConcurrentSandboxes !== undefined)
		parsed.maxConcurrentSandboxes = whole('maxConcurrentSandboxes', raw.maxConcurrentSandboxes);
	if (raw.memory !== undefined) {
		const match = /^([1-9]\d*)([mMgG])$/.exec(raw.memory);
		if (match === null)
			throw optionError('memory', `must look like 512m or 2g (binary units), found "${raw.memory}"`);
		if (Number(match[1]) * (match[2].toLowerCase() === 'g' ? 1024 : 1) < 512)
			throw optionError('memory', 'must be at least 512m (the sbx minimum)');
		parsed.memory = `${match[1]}${match[2].toLowerCase()}`;
	}
	if (raw.idleStopMinutes !== undefined) {
		if (!/^\d+(?:\.\d+)?$/.test(raw.idleStopMinutes) || Number(raw.idleStopMinutes) <= 0) {
			throw optionError(
				'idleStopMinutes',
				`must be a positive number of minutes, found "${raw.idleStopMinutes}"`
			);
		}
		if (Number(raw.idleStopMinutes) > 1440) throw optionError('idleStopMinutes', 'must be at most 1440 (24 hours)');
		parsed.idleStopMinutes = raw.idleStopMinutes;
	}
	if (raw.extraAllowedHosts !== undefined) {
		const hosts = list('extraAllowedHosts', raw.extraAllowedHosts);
		const wrong = hosts.find(
			host =>
				!/^[A-Za-z0-9*][A-Za-z0-9.*-]*:\d{1,5}$/.test(host) ||
				Number(host.slice(host.lastIndexOf(':') + 1)) > 65535
		);
		if (wrong !== undefined)
			throw optionError('extraAllowedHosts', `has the entry "${wrong}" which is not host:port`);
		parsed.extraAllowedHosts = hosts;
	}
	if (raw.acceptSshAgentForwarding !== undefined) {
		if (raw.acceptSshAgentForwarding !== 'true' && raw.acceptSshAgentForwarding !== 'false') {
			throw optionError('acceptSshAgentForwarding', 'must be true or false');
		}
		parsed.acceptSshAgentForwarding = raw.acceptSshAgentForwarding === 'true';
	}
	if (raw.sbxPath !== undefined) {
		if (!isAbsolute(raw.sbxPath)) throw optionError('sbxPath', 'must be an absolute path');
		parsed.sbxPath = raw.sbxPath;
	}
	return parsed;
}

/** One wrapper per source: 1 to 12 lowercase letters or digits, derived from the source id (a short hash keeps similar ids apart). */
function wrapperId(sourceId) {
	const base =
		sourceId
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '')
			.slice(0, 8) || 'sbx';
	return base + createHash('sha256').update(sourceId).digest('hex').slice(0, 4);
}

/** The wrapper's command line. Nothing secret is in it: the launch credential travels in the environment. */
function wrapperArguments(parsed, sourceId) {
	const argv = ['--wrapper-id', wrapperId(sourceId)];
	for (const id of parsed.projects) argv.push('--project-id', id);
	argv.push('--profile', `${parsed.profileAlias}=${parsed.hostProfile}`, '--region', parsed.region);
	const pairs = [
		['--image', parsed.image],
		['--pull', parsed.pull],
		['--cpus', parsed.cpus],
		['--memory', parsed.memory],
		['--max-sandboxes', parsed.maxConcurrentSandboxes],
		['--idle-minutes', parsed.idleStopMinutes],
	];
	for (const [flag, value] of pairs) if (value !== undefined) argv.push(flag, value);
	for (const host of parsed.extraAllowedHosts) argv.push('--extra-allowed-host', host);
	if (parsed.acceptSshAgentForwarding === true) argv.push('--accept-ssh-agent-forwarding');
	return argv;
}

function wrapperPath() {
	return process.env.FLOW_SANDBOX_PLUGIN_WRAPPER ?? join(PLUGIN_DIRECTORY, 'wrapper.cjs');
}

function childEnvironment(additions, parsed) {
	const environment = { ...process.env, ...additions };
	delete environment.FLOW_DAEMON_MODE;
	if (parsed.sbxPath !== undefined) environment.SBX_PATH = parsed.sbxPath;
	return environment;
}

/** What can be checked when the source is built: the artifact, sbx and the image (the wrapper does the sbx part, in its `preflight` mode). */
function preflight(parsed, sourceId) {
	const wrapper = wrapperPath();
	if (!existsSync(wrapper)) {
		throw fail(
			`worker type sandbox: the wrapper ${wrapper} does not exist. Build the plugin with "npm run bundle --workspace flow-sandbox" and declare the source with --plugins-dir <repository>/packages/flow-sandbox/dist-plugin, then restart the daemon.`
		);
	}
	if (parsed.sbxPath !== undefined && !existsSync(parsed.sbxPath)) {
		throw optionError('sbxPath', `does not exist: ${parsed.sbxPath}`);
	}
	const result = spawnSync(process.execPath, [wrapper, 'preflight', ...wrapperArguments(parsed, sourceId)], {
		env: childEnvironment(
			{
				FLOW_DAEMON_WS_URL: 'ws://127.0.0.1:0',
				FLOW_WORKER_SOURCE_ID: sourceId,
				FLOW_WORKER_TOKEN: 'preflight-only',
			},
			parsed
		),
		encoding: 'utf8',
		timeout: PREFLIGHT_TIMEOUT_MS,
		windowsHide: true,
	});
	if (result.error !== undefined) {
		throw fail(
			`worker type sandbox: the environment check could not run (${result.error.message}). Wrapper: ${wrapper}`
		);
	}
	if (result.status !== 0) {
		const text = `${result.stderr ?? ''}`.trim().slice(-2000) || `exit code ${result.status}`;
		throw fail(`worker type sandbox: this machine cannot run sandboxes yet:\n${text}`);
	}
}

function presenceAlive(id) {
	const directory = process.env.FLOW_SANDBOX_PRESENCE_DIR ?? join(homedir(), '.config', 'flow', 'sandbox-presence');
	try {
		const record = JSON.parse(readFileSync(join(directory, `${id}.json`), 'utf8'));
		process.kill(record.pid, 0);
		return record.pid;
	} catch (error) {
		return error?.code === 'EPERM' ? true : undefined;
	}
}

function redact(text, token) {
	let result = text.replace(/FLOW_WORKER_TOKEN=\S+/g, 'FLOW_WORKER_TOKEN=[redacted]');
	if (token) result = result.split(token).join('[redacted]');
	return result;
}

function createInstance(context) {
	const sourceId = context.sourceId;
	const parsed = parseOptions(context.options);
	preflight(parsed, sourceId);
	const id = wrapperId(sourceId);

	let child;
	let exited = true;
	let spawnedWith;
	let failure;
	let stderrTail = [];
	let disposing;

	function describeFailure(found) {
		const how = found.signal ? `was ended by ${found.signal}` : `exited with code ${found.code}`;
		return (
			`worker source "${sourceId}": the sandbox wrapper started by an earlier ask ${how} after that ask returned, so no worker joined. ` +
			`Its last output: ${redact(found.tail, found.token) || '(none)'} ` +
			`Fix the cause shown above (it is also in the daemon log as "[source ${sourceId}]" lines); the next ask starts a new wrapper.`
		);
	}

	function waitExit(milliseconds) {
		if (exited) return Promise.resolve();
		return new Promise(resolve => {
			const timer = setTimeout(resolve, milliseconds);
			child.once('exit', () => {
				clearTimeout(timer);
				resolve();
			});
		});
	}

	return {
		source: {
			async obtainWorker(request) {
				if (disposing !== undefined) {
					throw new Error(
						`worker source "${sourceId}": the sandbox worker type was disposed (the daemon is stopping or the source was removed), no wrapper is started.`
					);
				}
				if (typeof request.authToken !== 'string' || request.authToken === '') {
					throw new Error(
						`worker source "${sourceId}": the daemon gave no launch credential (request.authToken), and a wrapper that cannot present one can never register. ` +
							'Declare the source with --plugin and --plugins-dir so that the daemon mints one per ask, and use a flow version that does.'
					);
				}
				if (failure !== undefined) {
					const found = failure;
					failure = undefined;
					throw new Error(describeFailure(found));
				}
				if (!exited) return;
				const other = presenceAlive(id);
				if (other !== undefined) {
					process.stderr.write(
						`[source ${sourceId}] a wrapper (${other === true ? 'pid unknown' : `pid ${other}`}) of this source is already running; not starting a second one.\n`
					);
					return;
				}
				const token = request.authToken;
				const started = spawn(process.execPath, [wrapperPath(), ...wrapperArguments(parsed, sourceId)], {
					env: childEnvironment(
						{
							FLOW_DAEMON_WS_URL: request.daemonEndpoint,
							FLOW_WORKER_SOURCE_ID: request.sourceId,
							FLOW_WORKER_PROJECTS: parsed.projects.join(','),
							FLOW_WORKER_TOKEN: token,
						},
						parsed
					),
					stdio: ['ignore', 'ignore', 'pipe'],
					windowsHide: true,
				});
				if (started.pid === undefined) {
					throw new Error(
						`worker source "${sourceId}": the wrapper process could not be started (no pid); check that ${wrapperPath()} is readable.`
					);
				}
				child = started;
				exited = false;
				spawnedWith = token;
				stderrTail = [];
				started.stderr.on('data', data => {
					const text = redact(data.toString(), token);
					process.stderr.write(
						text
							.split('\n')
							.filter(line => line !== '')
							.map(line => `[source ${sourceId}] ${line}\n`)
							.join('')
					);
					stderrTail = [...stderrTail, ...text.split('\n').filter(line => line !== '')].slice(
						-STDERR_TAIL_LINES
					);
				});
				started.on('error', error => {
					failure = { code: 'start-error', tail: error.message, token: spawnedWith };
					exited = true;
				});
				started.on('exit', (code, signal) => {
					exited = true;
					if (disposing === undefined && (code !== 0 || signal)) {
						failure = {
							code,
							signal,
							tail: stderrTail.join(' | ').slice(-STDERR_TAIL_CHARACTERS),
							token: spawnedWith,
						};
					}
				});
				// The wrapper's lifetime is its own (it leaves when the daemon connection closes); the daemon must not wait for it.
				started.unref();
				started.stderr.unref?.();
			},
		},
		// No `run` hook in v1: the wrapper declares run-events and removes its sandbox when the daemon says a run ended.
		dispose() {
			disposing ??= (async () => {
				try {
					if (child === undefined || exited) return;
					const total = Number(process.env.FLOW_SANDBOX_PLUGIN_DISPOSE_MS ?? DISPOSE_BOUND_MS);
					// The wrapper leaves by itself once the daemon closes its socket; ask politely, then insist, within the bound.
					await waitExit(total * 0.6);
					if (!exited) child.kill();
					await waitExit(total * 0.3);
					if (!exited) child.kill('SIGKILL');
					await waitExit(total * 0.1);
				} catch {
					// dispose never throws: a leftover wrapper is the next start's `leftover list`
				}
			})();
			return disposing;
		},
	};
}

export const manifest = {
	pluginId: 'sandbox',
	manifestVersion: '1',
	implementations: {
		'worker-type': {
			exec: {
				version: 1,
				provider: async context => createInstance(context),
			},
		},
	},
};

/** For the tests of this plugin; not part of the plugin contract. */
export const internals = { parseOptions, wrapperId, wrapperArguments };
